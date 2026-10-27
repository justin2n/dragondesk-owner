import { isValidEmail, normalizeEmail } from '../utils/validate';
import { run, get, pool } from '../models/database';
import { deriveChannel, hasAttribution, Utms } from '../utils/attribution';
import { notifyNewLead } from './leadAlerts';

export interface LeadInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  programType?: string | null;
  membershipAge?: string | null;
  notes?: string | null;
  locationId?: number | null;
  companyName?: string | null;
  source?: string | null;
  visitorId?: string | null;
  trackingToken?: string | null;
  attribution?: Utms | null;
  // Public origin of this app, for the link in new-lead alert emails.
  appUrl?: string | null;
}

export type LeadResult =
  | { ok: false; error: string }
  | { ok: true; memberId: number; isNew: boolean; existingStatus: string | null };

// Creates (or refreshes) a lead from a public source — the embeddable lead form
// and the website chat agent both go through here. Existing leads are updated;
// anyone further along (trialer, member) is left untouched.
export async function captureLead(input: LeadInput): Promise<LeadResult> {
  const {
    firstName, lastName, email, phone, programType, membershipAge,
    notes, locationId, source, visitorId, trackingToken,
  } = input;
  const companyName = input.companyName || null;

  if (!firstName || !lastName || !email) {
    return { ok: false, error: 'First name, last name, and email are required' };
  }
  if (!isValidEmail(email)) {
    return { ok: false, error: 'Invalid email format' };
  }
  const normalizedEmail = normalizeEmail(email);

  // Check if member already exists
  const existing = await get('SELECT id, accountStatus FROM members WHERE email = ?', [normalizedEmail]);

  let memberId: number;

  if (existing) {
    memberId = existing.id;
    if (existing.accountStatus === 'lead') {
      await run(
        `UPDATE members SET
          firstName = ?,
          lastName = ?,
          phone = COALESCE(?, phone),
          programType = COALESCE(?, programType),
          membershipAge = COALESCE(?, membershipAge),
          notes = COALESCE(?, notes),
          locationId = COALESCE(?, locationId),
          "companyName" = COALESCE(?, "companyName"),
          updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [firstName, lastName, phone, programType, membershipAge, notes, locationId, companyName, existing.id]
      );
    }
  } else {
    // Create new lead
    const result = await run(
      `INSERT INTO members (
        firstName, lastName, email, phone,
        accountStatus, accountType, programType, membershipAge,
        ranking, notes, locationId, tags, "companyName"
      ) VALUES (?, ?, ?, ?, 'lead', 'basic', ?, ?, 'White Belt', ?, ?, ?, ?)`,
      [
        firstName, lastName, normalizedEmail, phone || null,
        programType || 'Adult BJJ', membershipAge || 'Adult',
        notes || null, locationId || null,
        source ? JSON.stringify([source]) : JSON.stringify(['Web Form']),
        companyName,
      ]
    );
    memberId = result.id;
  }

  // Identity resolution: link anonymous visitor to this contact
  if (visitorId && trackingToken) {
    try {
      // Link by email
      await pool.query(`
        INSERT INTO visitor_identities ("visitorId", token, type, value, "memberId")
        VALUES ($1, $2, 'email', $3, $4)
        ON CONFLICT ("visitorId", token, type) DO UPDATE SET value = EXCLUDED.value, "memberId" = EXCLUDED."memberId"
      `, [visitorId, trackingToken, normalizedEmail, memberId]);

      // Link by phone if provided
      if (phone) {
        await pool.query(`
          INSERT INTO visitor_identities ("visitorId", token, type, value, "memberId")
          VALUES ($1, $2, 'phone', $3, $4)
          ON CONFLICT ("visitorId", token, type) DO UPDATE SET value = EXCLUDED.value, "memberId" = EXCLUDED."memberId"
        `, [visitorId, trackingToken, phone, memberId]);
      }
    } catch (idErr) {
      console.error('Identity link error (non-fatal):', idErr);
    }
  }

  // ── First-touch attribution ──────────────────────────────────────────────
  // Prefer UTMs the caller passed (from its URL / _dd_attr cookie); otherwise
  // fall back to the visitor's first-touch captured by the tracking script.
  try {
    let attr: Utms = (input.attribution || {}) as Utms;
    if (!hasAttribution(attr) && visitorId && trackingToken) {
      const v = await get(
        'SELECT * FROM tracking_visitors WHERE "visitorId" = ? AND token = ?',
        [visitorId, trackingToken]
      );
      if (v) {
        attr = {
          utmSource: v.utmSource, utmMedium: v.utmMedium, utmCampaign: v.utmCampaign,
          utmTerm: v.utmTerm, utmContent: v.utmContent, gclid: v.gclid, fbclid: v.fbclid,
          landingPage: v.landingPage, referrer: v.referrer,
        };
      }
    }
    const channel = deriveChannel(attr);
    // Write once — first touch wins, never overwritten.
    await pool.query(
      `INSERT INTO member_attribution
         ("memberId","utmSource","utmMedium","utmCampaign","utmTerm","utmContent",gclid,fbclid,channel,"landingPage",referrer)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT ("memberId") DO NOTHING`,
      [memberId, attr.utmSource || null, attr.utmMedium || null, attr.utmCampaign || null,
       attr.utmTerm || null, attr.utmContent || null, attr.gclid || null, attr.fbclid || null,
       channel, attr.landingPage || null, attr.referrer || null]
    );
    // Backfill leadSource on the member when it's empty.
    await pool.query(
      `UPDATE members SET "leadSource" = $1 WHERE id = $2 AND ("leadSource" IS NULL OR "leadSource" = '')`,
      [channel, memberId]
    );
  } catch (attrErr) {
    console.error('Attribution capture error (non-fatal):', attrErr);
  }

  if (!existing) notifyNewLead(memberId, source || 'Web Form', input.appUrl);

  return { ok: true, memberId, isNew: !existing, existingStatus: existing?.accountStatus ?? null };
}
