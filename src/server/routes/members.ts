import { serverError } from '../utils/errors';
import { auditLog } from '../utils/audit';
import { Router } from 'express';
import { pool } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { SEAT_SELECT, programLimitFor } from './membership-seats';

const router = Router();

const TRACKED_FIELDS = [
  'firstName', 'lastName', 'email', 'phone',
  'accountStatus', 'programType', 'membershipAge',
  'ranking', 'leadSource', 'notes', 'locationId',
  'pricingPlanId', 'programInterestId',
  'trialStartDate', 'memberStartDate', 'companyName',
] as const;

// Stage → which product a contact may carry. Leads express interest only;
// trialers hold a Quick Start; members hold seats (account holders) and program
// enrollments (participants). Enforced server-side so the greyed-out UI can't
// simply be bypassed by posting the field directly.
export const STAGE_ORDER = ['lead', 'trialer', 'member'] as const;
export type Stage = typeof STAGE_ORDER[number];

export function stageAllows(stage: string, product: 'programInterest' | 'quickStart' | 'membership' | 'programs') {
  switch (product) {
    case 'programInterest': return true;                       // interest survives the whole journey
    case 'quickStart':      return stage === 'trialer' || stage === 'member';
    case 'membership':
    case 'programs':        return stage === 'member';
    default:                return false;
  }
}

async function logHistory(
  memberId: number,
  action: string,
  changes: Record<string, { from: any; to: any }> | null,
  // Matches AuthRequest['user'] (middleware/auth.ts) — it carries `username`,
  // not first/last name. firstName/lastName are accepted for callers that pass a
  // fuller record. Previously this only read firstName/lastName, so every row
  // logged from req.user recorded the actor as "undefined undefined".
  user: { id: number; username?: string; firstName?: string; lastName?: string } | null | undefined,
  userName?: string,
) {
  const fullName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '';
  const name = userName ?? (fullName || user?.username || 'System');
  await pool.query(
    `INSERT INTO member_history ("memberId", "userId", "userName", action, changes)
     VALUES ($1, $2, $3, $4, $5)`,
    [memberId, user?.id ?? null, name, action, changes ? JSON.stringify(changes) : null],
  );
}

// Keep a participant's program assignments in sync. member_programs is the
// source of truth (a participant can train in many programs); members."programId"
// and "programType" are kept as the *primary* program (first selected) for
// back-compat with program-segmented analytics, events and belt logic.
// Non-participants have no programs. Participants with none are surfaced via
// GET /participants/unassigned.
async function syncParticipantPrograms(
  memberId: number,
  memberType: string | null | undefined,
  programIds: number[] | undefined,
  programType?: string | null,
) {
  if (memberType !== 'participant') {
    await pool.query(`DELETE FROM member_programs WHERE "memberId" = $1`, [memberId]);
    await pool.query(`UPDATE members SET "programId" = NULL WHERE id = $1`, [memberId]);
    return;
  }

  // Resolve the program id list: explicit programIds, else match programType by name.
  let ids = Array.isArray(programIds)
    ? programIds.map(Number).filter(n => Number.isFinite(n))
    : [];
  if (ids.length === 0 && programType) {
    const r = await pool.query(`SELECT id FROM programs WHERE name = $1`, [programType]);
    if (r.rows[0]) ids = [r.rows[0].id];
  }

  await pool.query(`DELETE FROM member_programs WHERE "memberId" = $1`, [memberId]);
  for (const pid of ids) {
    await pool.query(
      `INSERT INTO member_programs ("memberId", "programId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [memberId, pid],
    );
  }

  const primaryId = ids[0] ?? null;
  await pool.query(
    `UPDATE members SET
       "programId" = $1,
       "programType" = COALESCE((SELECT name FROM programs WHERE id = $1), "programType")
     WHERE id = $2`,
    [primaryId, memberId],
  );
}

// Participants must hang off a real account holder — and only off an account
// holder, never another participant (which would build an unbillable chain).
async function validateAccountHolderLink(
  memberType: string,
  accountHolderId: any,
  selfId?: number,
): Promise<string | null> {
  if (memberType !== 'participant') return null;

  const holderId = accountHolderId ? parseInt(String(accountHolderId)) : null;
  if (!holderId) return 'Participants must be linked to an account holder';
  if (selfId && holderId === selfId) return 'A participant cannot be their own account holder';

  const holder = await pool.query(
    `SELECT id, "memberType" FROM members WHERE id = $1`,
    [holderId],
  );
  if (holder.rows.length === 0) return 'Account holder not found';
  if ((holder.rows[0].memberType || 'account_holder') !== 'account_holder') {
    return 'Participants must be linked to an account holder, not another participant';
  }
  return null;
}

// A seat grants a fixed number of programs (NULL = unlimited, e.g. a family
// plan). Enforce it here so the entitlement can't be exceeded by direct POST.
async function enforceProgramLimit(member: any, programIds: number[] | undefined): Promise<string | null> {
  if (!Array.isArray(programIds) || programIds.length === 0) return null;

  // An account holder training on their own seat has no accountHolderId, so
  // their own id is the account to look up family-plan coverage against.
  const accountId = member.accountHolderId ?? member.id;
  const { hasSeat, limit } = await programLimitFor(member.id, accountId);
  if (!hasSeat) {
    return 'This contact has no active membership seat. Assign one before enrolling them in programs.';
  }
  if (limit !== null && programIds.length > limit) {
    return `Their membership covers ${limit} program${limit === 1 ? '' : 's'}. Upgrade the seat to enroll in ${programIds.length}.`;
  }
  return null;
}

function diffMember(oldRow: any, newValues: Record<string, any>) {
  const changes: Record<string, { from: any; to: any }> = {};
  for (const field of TRACKED_FIELDS) {
    const oldVal = oldRow[field] ?? null;
    const newVal = newValues[field] ?? null;
    const oldStr = oldVal === null ? null : String(oldVal);
    const newStr = newVal === null ? null : String(newVal);
    if (oldStr !== newStr) changes[field] = { from: oldVal, to: newVal };
  }
  return Object.keys(changes).length ? changes : null;
}

router.use(authenticateToken);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { accountStatus, programType, membershipAge, accountType, locationId, search, sort, memberType } = req.query;

    const params: any[] = [];
    let idx = 1;

    let sql = 'SELECT * FROM members WHERE 1=1';

    if (locationId && locationId !== 'all') {
      sql += ` AND "locationId" = $${idx++}`;
      params.push(locationId);
    }

    if (accountStatus) {
      sql += ` AND "accountStatus" = $${idx++}`;
      params.push(accountStatus);
    }

    if (programType) {
      sql += ` AND "programType" = $${idx++}`;
      params.push(programType);
    }

    if (membershipAge) {
      sql += ` AND "membershipAge" = $${idx++}`;
      params.push(membershipAge);
    }

    if (accountType) {
      sql += ` AND "accountType" = $${idx++}`;
      params.push(accountType);
    }

    if (memberType) {
      sql += ` AND COALESCE("memberType", 'account_holder') = $${idx++}`;
      params.push(memberType);
    }

    if (search) {
      const term = `%${search}%`;
      sql += ` AND ("firstName" ILIKE $${idx} OR "lastName" ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx} OR ("firstName" || ' ' || "lastName") ILIKE $${idx} OR tags ILIKE $${idx})`;
      params.push(term); idx++;
    }

    const orderMap: Record<string, string> = {
      newest: '"createdAt" DESC',
      oldest: '"createdAt" ASC',
      name_az: '"lastName" ASC, "firstName" ASC',
      name_za: '"lastName" DESC, "firstName" DESC',
      status: '"accountStatus" ASC, "lastName" ASC',
    };
    const order = orderMap[sort as string] ?? '"createdAt" DESC';
    sql += ` ORDER BY ${order}`;

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Participants not linked to a program offering — their programType is blank,
// 'No Program Selected', or doesn't match any program in the catalog. Surfaced
// so admins can fix the profile (the backfill leaves these unassigned).
router.get('/participants/unassigned', async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p."firstName", p."lastName", p."programType",
              p."accountHolderId",
              ah."firstName" AS "accountHolderFirstName",
              ah."lastName"  AS "accountHolderLastName"
       FROM members p
       LEFT JOIN members ah ON ah.id = p."accountHolderId"
       WHERE p."memberType" = 'participant'
         AND NOT EXISTS (SELECT 1 FROM member_programs mp WHERE mp."memberId" = p.id)
       ORDER BY p."lastName" ASC, p."firstName" ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get unassigned participants error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tags', async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT tags FROM members WHERE tags IS NOT NULL AND tags != ''`
    );
    const tagSet = new Set<string>();
    for (const row of result.rows) {
      const raw: string = row.tags;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((t: any) => { if (t && typeof t === 'string' && t.trim()) tagSet.add(t.trim()); });
          continue;
        }
      } catch {}
      raw.split(',').forEach(t => { if (t.trim()) tagSet.add(t.trim()); });
    }
    res.json(Array.from(tagSet).sort());
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const result = await pool.query('SELECT * FROM members WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const member = result.rows[0];

    // This member's programs (a participant trains in 1+; member_programs is the
    // source of truth). Returned as [{ id, name }] for the multi-select UI.
    const programsOf = async (id: number) => (await pool.query(
      `SELECT p.id, p.name FROM member_programs mp
       JOIN programs p ON p.id = mp."programId"
       WHERE mp."memberId" = $1 ORDER BY p.name ASC`,
      [id],
    )).rows;
    member.programs = await programsOf(member.id);

    // Include participants if this is an account holder
    if (!member.accountHolderId) {
      const participantsResult = await pool.query(
        `SELECT id, "firstName", "lastName", email, phone, "programType", "membershipAge", ranking,
                "accountStatus", "trialStartDate", "memberStartDate", "memberType", "createdAt"
         FROM members WHERE "accountHolderId" = $1 ORDER BY "firstName" ASC`,
        [member.id]
      );
      member.participants = participantsResult.rows;
      for (const p of member.participants) {
        p.programs = await programsOf(p.id);
      }
    }

    // Include account holder info if this is a participant
    if (member.accountHolderId) {
      const ahResult = await pool.query(
        `SELECT id, "firstName", "lastName", email, phone FROM members WHERE id = $1`,
        [member.accountHolderId]
      );
      member.accountHolder = ahResult.rows[0] || null;
    }

    // Seats: what an account holder pays for, and which seat covers a
    // participant. This is what drives the cost shown on the profile.
    const accountId = member.accountHolderId ?? member.id;
    member.seats = (await pool.query(
      `${SEAT_SELECT} WHERE s."accountHolderId" = $1 AND s.status = 'active' ORDER BY s."createdAt" ASC`,
      [accountId],
    )).rows;
    member.monthlyCost = member.seats.reduce((sum: number, s: any) => sum + (s.priceAmount || 0), 0);
    member.programLimit = await programLimitFor(member.id, accountId);

    // Active Quick Start (the Trial-stage product), if any.
    member.quickStart = (await pool.query(
      `SELECT q.*, p.name AS "programName"
       FROM quick_start_enrollments q
       LEFT JOIN programs p ON p.id = q."programId"
       WHERE q."memberId" = $1 AND q.status = 'active'
       ORDER BY q."createdAt" DESC LIMIT 1`,
      [member.id],
    )).rows[0] || null;

    res.json(member);
  } catch (error) {
    console.error('Get member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      accountStatus,
      accountType,
      programType,
      membershipAge,
      ranking,
      leadSource,
      dateOfBirth,
      emergencyContact,
      emergencyPhone,
      notes,
      tags,
      locationId,
      trialStartDate,
      memberStartDate,
      pricingPlanId,
      companyName,
      memberType,
      accountHolderId,
      programIds,
      programInterestId,
    } = req.body;

    const resolvedMemberType = memberType || 'account_holder';

    if (!firstName || !lastName || !accountStatus) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }
    // Account holders require an email; participants may omit it
    if (resolvedMemberType === 'account_holder' && !email) {
      return res.status(400).json({ error: 'Email is required for account holders' });
    }

    // A participant is always attached to an account holder — that's what makes
    // them a participant. Without this, orphaned participants never roll up into
    // an account's cost and quietly vanish from revenue.
    const holderCheck = await validateAccountHolderLink(resolvedMemberType, accountHolderId);
    if (holderCheck) return res.status(400).json({ error: holderCheck });

    if (email) {
      const existing = await pool.query('SELECT id FROM members WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Member with this email already exists' });
      }
    }

    const insertResult = await pool.query(
      `INSERT INTO members (
        "firstName", "lastName", email, phone, "accountStatus",
        "programType", "membershipAge", ranking, "leadSource", "dateOfBirth", "emergencyContact",
        "emergencyPhone", notes, tags, "locationId", "trialStartDate", "memberStartDate",
        "pricingPlanId", "companyName", "memberType", "accountHolderId", "programInterestId"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *`,
      [
        firstName, lastName, email || null, phone || null, accountStatus,
        programType || 'No Program Selected', membershipAge || 'Adult', ranking || 'White',
        leadSource || null, dateOfBirth || null, emergencyContact || null,
        emergencyPhone || null, notes || null, tags || null, locationId || null,
        trialStartDate || null, memberStartDate || null,
        pricingPlanId || null, companyName || null,
        resolvedMemberType, accountHolderId ? parseInt(accountHolderId) : null,
        programInterestId ? parseInt(programInterestId) : null,
      ]
    );

    const created = insertResult.rows[0];
    await logHistory(created.id, 'created', null, req.user).catch(() => {});

    // Retroactive identity resolution: link any anonymous visitor who
    // submitted a site form with this email before the contact existed
    await pool.query(
      `UPDATE visitor_identities SET "memberId" = $1
       WHERE type = 'email' AND value = $2 AND "memberId" IS NULL`,
      [created.id, created.email]
    ).catch(() => {});

    // Sync the participant's program assignments (many-to-many). Only members
    // enroll in programs; earlier stages carry a Program Interest instead.
    if (stageAllows(created.accountStatus, 'programs')) {
      await syncParticipantPrograms(created.id, resolvedMemberType, programIds, created.programType).catch(() => {});
    }

    res.status(201).json(created);
  } catch (error: any) {
    console.error('Create member error:', error);
    serverError(res, error);
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      firstName,
      lastName,
      email,
      phone,
      accountStatus,
      accountType,
      programType,
      membershipAge,
      ranking,
      leadSource,
      dateOfBirth,
      emergencyContact,
      emergencyPhone,
      notes,
      tags,
      locationId,
      trialStartDate,
      memberStartDate,
      pricingPlanId,
      companyName,
      memberType,
      accountHolderId,
      programIds,
      programInterestId,
    } = req.body;

    const existing = await pool.query('SELECT * FROM members WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    const oldRow = existing.rows[0];

    const nextMemberType = memberType || oldRow.memberType || 'account_holder';
    const nextHolderId = accountHolderId !== undefined
      ? (accountHolderId ? parseInt(accountHolderId) : null)
      : oldRow.accountHolderId;

    const holderCheck = await validateAccountHolderLink(nextMemberType, nextHolderId, Number(id));
    if (holderCheck) return res.status(400).json({ error: holderCheck });

    const updateResult = await pool.query(
      `UPDATE members SET
        "firstName" = $1, "lastName" = $2, email = $3, phone = $4,
        "accountStatus" = $5, "programType" = $6,
        "membershipAge" = $7, ranking = $8, "leadSource" = $9, "dateOfBirth" = $10,
        "emergencyContact" = $11, "emergencyPhone" = $12, notes = $13, tags = $14,
        "locationId" = $15, "trialStartDate" = $16, "memberStartDate" = $17,
        "pricingPlanId" = $18, "companyName" = $19,
        "memberType" = $20, "accountHolderId" = $21, "programInterestId" = $22,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $23
      RETURNING *`,
      [
        firstName, lastName, email || null, phone, accountStatus,
        programType, membershipAge, ranking, leadSource || null, dateOfBirth || null,
        emergencyContact || null, emergencyPhone || null, notes || null, tags || null,
        locationId || null, trialStartDate || null, memberStartDate || null,
        pricingPlanId || null, companyName || null,
        nextMemberType, nextHolderId,
        programInterestId !== undefined
          ? (programInterestId ? parseInt(programInterestId) : null)
          : oldRow.programInterestId,
        id,
      ]
    );

    const updated = updateResult.rows[0];
    const changes = diffMember(oldRow, {
      firstName, lastName, email, phone, accountStatus,
      programType, membershipAge, ranking, leadSource, notes, locationId,
      pricingPlanId, companyName, programInterestId,
      trialStartDate, memberStartDate,
    });
    if (changes) {
      const action = changes.accountStatus ? 'status_changed' : 'updated';
      await logHistory(updated.id, action, changes, req.user).catch(() => {});
    }

    // Program enrollment is a Member-stage product. Dropping back to Lead/Trial
    // clears it so a downgraded contact can't keep training on a lapsed seat.
    if (stageAllows(updated.accountStatus, 'programs')) {
      const limitProblem = await enforceProgramLimit(updated, programIds);
      if (limitProblem) return res.status(400).json({ error: limitProblem });
      await syncParticipantPrograms(updated.id, updated.memberType, programIds, updated.programType).catch(() => {});
    } else {
      await pool.query(`DELETE FROM member_programs WHERE "memberId" = $1`, [updated.id]).catch(() => {});
    }

    // Leaving the Member stage ends any active seats — otherwise a cancelled
    // contact keeps contributing to MRR forever.
    if (oldRow.accountStatus === 'member' && updated.accountStatus !== 'member') {
      await pool.query(
        `UPDATE membership_seats
         SET status = 'cancelled', "endDate" = COALESCE("endDate", CURRENT_TIMESTAMP), "updatedAt" = CURRENT_TIMESTAMP
         WHERE status = 'active' AND ("accountHolderId" = $1 OR "participantId" = $1)`,
        [updated.id],
      ).catch(() => {});
    }

    res.json(updated);
  } catch (error: any) {
    console.error('Update member error:', error);
    serverError(res, error);
  }
});

// One-click stage advance: lead → trialer → member.
//
// Each step needs the product for the stage it lands on, so the whole thing runs
// in one transaction: a half-converted contact (Member stage, no seat) would sit
// in the roster contributing nothing to MRR and be invisible to reconcile.
//
//   lead → trialer : requires programId; opens a priced Quick Start
//   trialer → member: requires membershipId; buys a seat and closes the Quick Start
router.post('/:id/convert', async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { programId, membershipId, programIds } = req.body;

    const existing = await client.query('SELECT * FROM members WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    const member = existing.rows[0];

    const currentIndex = STAGE_ORDER.indexOf(member.accountStatus);
    if (currentIndex === -1) {
      return res.status(400).json({ error: `A ${member.accountStatus} contact cannot be converted` });
    }
    if (currentIndex >= STAGE_ORDER.length - 1) {
      return res.status(400).json({ error: 'This contact is already at the Member stage' });
    }
    const nextStage = STAGE_ORDER[currentIndex + 1];
    const isParticipant = (member.memberType || 'account_holder') === 'participant';

    await client.query('BEGIN');

    if (nextStage === 'trialer') {
      if (!programId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Pick a Quick Start program to convert this lead to Trial' });
      }
      const prog = await client.query(`SELECT * FROM programs WHERE id = $1`, [programId]);
      if (prog.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Program not found' });
      }
      const program = prog.rows[0];
      const days = Number(program.quickStartDurationDays) || 30;

      await client.query(
        `INSERT INTO quick_start_enrollments
           ("memberId", "programId", "priceAmount", status, "startDate", "endDate", "locationId")
         VALUES ($1, $2, $3, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($4 || ' days')::interval, $5)`,
        [member.id, program.id, program.quickStartPriceAmount || 0, String(days), member.locationId || null],
      );

      await client.query(
        `UPDATE members SET "accountStatus" = 'trialer',
           "trialStartDate" = COALESCE("trialStartDate", CURRENT_TIMESTAMP),
           "programType" = $2,
           "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [member.id, program.name],
      );
    }

    if (nextStage === 'member') {
      // Only account holders buy seats. A participant converting to Member is
      // covered by a seat on their account holder, which must already exist.
      if (isParticipant) {
        const seat = await client.query(
          `SELECT s.id FROM membership_seats s
           JOIN memberships ms ON ms.id = s."membershipId"
           WHERE s.status = 'active'
             AND (s."participantId" = $1 OR (ms."isFamilyPlan" = true AND s."accountHolderId" = $2))
           LIMIT 1`,
          [member.id, member.accountHolderId],
        );
        if (seat.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'No membership seat covers this participant. Add a seat on their account holder first.',
          });
        }
      } else {
        if (!membershipId) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Pick a Membership Type to convert this trial to Member' });
        }
        const ms = await client.query(`SELECT * FROM memberships WHERE id = $1`, [membershipId]);
        if (ms.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Membership type not found' });
        }
        const membership = ms.rows[0];

        await client.query(
          `INSERT INTO membership_seats
             ("accountHolderId", "membershipId", "participantId", "priceAmount", status, "locationId")
           VALUES ($1, $2, $3, $4, 'active', $5)`,
          [
            member.id,
            membership.id,
            // A family seat covers the account, so it binds to nobody. A regular
            // seat bought during conversion is for the account holder themself.
            membership.isFamilyPlan ? null : member.id,
            membership.priceAmount || 0,
            member.locationId || null,
          ],
        );
      }

      await client.query(
        `UPDATE quick_start_enrollments SET status = 'converted', "updatedAt" = CURRENT_TIMESTAMP
         WHERE "memberId" = $1 AND status = 'active'`,
        [member.id],
      );

      await client.query(
        `UPDATE members SET "accountStatus" = 'member',
           "memberStartDate" = COALESCE("memberStartDate", CURRENT_TIMESTAMP),
           "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [member.id],
      );

      if (Array.isArray(programIds) && programIds.length > 0) {
        await client.query(`DELETE FROM member_programs WHERE "memberId" = $1`, [member.id]);
        for (const pid of programIds.map(Number).filter(Number.isFinite)) {
          await client.query(
            `INSERT INTO member_programs ("memberId", "programId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [member.id, pid],
          );
        }
      }
    }

    await client.query('COMMIT');

    await logHistory(
      member.id,
      'status_changed',
      { accountStatus: { from: member.accountStatus, to: nextStage } },
      req.user,
    ).catch(() => {});

    const updated = await pool.query('SELECT * FROM members WHERE id = $1', [member.id]);
    res.json(updated.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Convert member error:', error);
    serverError(res, error);
  } finally {
    client.release();
  }
});

router.get('/:id/web-activity', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);

    // Find all visitor identities linked to this member, then pull their events
    const result = await pool.query(
      `SELECT
         te."eventType",
         te."pagePath",
         te."pageTitle",
         te."pageUrl",
         te.selector,
         te."elementText",
         te.metadata,
         te."createdAt",
         tv."ipAddress",
         tv.country,
         tv.city
       FROM tracking_events te
       INNER JOIN visitor_identities vi
         ON vi."visitorId" = te."visitorId" AND vi.token = te.token
       LEFT JOIN tracking_visitors tv
         ON tv."visitorId" = te."visitorId" AND tv.token = te.token
       WHERE vi."memberId" = $1 AND vi.type = 'email'
       ORDER BY te."createdAt" DESC
       LIMIT $2`,
      [id, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get member web activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/history', async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT id, action, changes, "userName", "createdAt"
       FROM member_history
       WHERE "memberId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 100`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get member history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT id, "firstName", "lastName", email, "accountStatus" FROM members WHERE id = $1',
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const member = existing.rows[0];
    await pool.query('DELETE FROM members WHERE id = $1', [id]);

    await auditLog('member.delete', req.user?.id ?? null, req, {
      memberId: id,
      name: `${member.firstName} ${member.lastName}`,
      email: member.email,
      accountStatus: member.accountStatus,
    });

    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Delete member error:', error);
    serverError(res, error);
  }
});

export default router;
