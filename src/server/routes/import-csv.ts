import { serverError } from '../utils/errors';
import { auditLog } from '../utils/audit';
import { Router, Response } from 'express';
import multer from 'multer';
import { pool } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isCSV =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.csv');
    if (isCSV) return cb(null, true);
    cb(new Error('Only CSV files are allowed'));
  },
});

router.use(authenticateToken);

// --- CSV helpers ---

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (values[i] || '').trim(); });
    return row;
  }).filter(row => Object.values(row).some(v => v !== ''));

  return { headers, rows };
}

function detectType(headers: string[]): 'lead' | 'trial' | 'member' | 'student-details' | 'unknown' {
  const h = headers.map(x => x.trim().toLowerCase());
  // Student Details export: one account holder per row + numbered participant columns.
  if (h.includes('participant 1 first name') || (h.includes('customer for') && h.includes('member portal'))) return 'student-details';
  if (h.includes('buyer first name') || h.includes('opt in date')) return 'lead';
  if (h.includes('trial status') || h.includes('trial program')) return 'trial';
  if (h.includes('membership') || h.includes('next payment date') || h.includes('rank')) return 'member';
  return 'unknown';
}

const VALID_PROGRAMS = [
  'No Program Selected', "Children's Martial Arts", 'Adult BJJ', 'Adult TKD & HKD', 'DG Barbell',
  'Adult Muay Thai & Kickboxing', 'The Ashtanga Club', 'Dragon Gym Learning Center',
  'Kids BJJ', 'Kids Muay Thai', 'Young Ladies Yoga', 'DG Workspace',
  'Dragon Launch', 'Personal Training', 'DGMT Private Training',
];

function normalizeProgram(raw: string, isLead = false): string | null {
  if (!raw) return isLead ? 'No Program Selected' : null;
  const v = raw.trim();
  // Exact or near-exact MyStudio full names
  if (v === "Children's Martial Arts Programs" || v.toLowerCase().includes("children's martial arts") || v.toLowerCase().includes('quick start confidence')) return "Children's Martial Arts";
  if (v === 'Adult BJJ Classes and Memberships' || (v.toLowerCase().includes('bjj') && !v.toLowerCase().includes('kids'))) return 'Adult BJJ';
  if (v === 'Adult TKD and HKD Classes and Memberships' || v.toLowerCase().includes('tkd') || v.toLowerCase().includes('hkd') || v.toLowerCase().includes('taekwondo') || v.toLowerCase().includes('tae kwon')) return 'Adult TKD & HKD';
  if (v === 'DG BARBELL Classes and Memberships' || v.toLowerCase().includes('barbell')) return 'DG Barbell';
  if (v === 'Adult Muay Thai and Kickboxing Classes and Memberships' || v.toLowerCase().includes('kick-start') || (v.toLowerCase().includes('muay') && !v.toLowerCase().includes('kids')) || (v.toLowerCase().includes('kickbox') && !v.toLowerCase().includes('kids'))) return 'Adult Muay Thai & Kickboxing';
  if (v === 'The Ashtanga Club' || v.toLowerCase().includes('ashtanga')) return 'The Ashtanga Club';
  if (v === 'Dragon Gym Learning Center' || v.toLowerCase().includes('learning center')) return 'Dragon Gym Learning Center';
  if (v === 'Kids BJJ Classes and Memberships' || v.toLowerCase().includes('kids bjj')) return 'Kids BJJ';
  if (v === 'Kids DGMT - Youth Muay Thai Classes and Memberships' || v.toLowerCase().includes('kids dgmt') || v.toLowerCase().includes('youth muay thai')) return 'Kids Muay Thai';
  if (v === 'Young Ladies Yoga Sessions (Ages 8 - 12)' || v.toLowerCase().includes('young ladies yoga') || v.toLowerCase().includes('ladies yoga')) return 'Young Ladies Yoga';
  if (v === 'DG Workspace' || v.toLowerCase().includes('workspace')) return 'DG Workspace';
  if (v === 'Dragon Launch - Cross Training, Nutrition, Recovery' || v.toLowerCase().includes('dragon launch')) return 'Dragon Launch';
  if (v === 'PERSONAL TRAINING' || v.toLowerCase() === 'personal training') return 'Personal Training';
  if (v === 'DGMT Private and Semi-Private Training' || v.toLowerCase().includes('dgmt private') || v.toLowerCase().includes('semi-private')) return 'DGMT Private Training';
  // If already a valid program name, return as-is
  if (VALID_PROGRAMS.includes(v)) return v;
  return isLead ? 'No Program Selected' : null;
}

function normalizeAge(programType: string, ageStr: string, dob: string): 'Adult' | 'Kids' {
  // Determine age group from program name first
  const p = programType.toLowerCase();
  if (p.includes('kids') || p.includes("children's") || p.includes('youth') || p.includes('young ladies')) return 'Kids';
  if (ageStr) {
    const age = parseInt(ageStr);
    if (!isNaN(age)) return age < 18 ? 'Kids' : 'Adult';
  }
  if (dob) {
    const birthYear = new Date(dob).getFullYear();
    if (!isNaN(birthYear)) {
      const currentAge = new Date().getFullYear() - birthYear;
      return currentAge < 18 ? 'Kids' : 'Adult';
    }
  }
  return 'Adult';
}

function normalizeRanking(rank: string, program: string): string {
  if (!rank || rank === 'N/A' || rank === '') return 'White';
  // Return as-is if it looks like a real rank
  return rank;
}

function normalizeLeadSource(raw: string): string | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v.includes('facebook') || v.includes('fb') || v.includes('instagram') || v.includes('social')) return 'social-media';
  if (v.includes('google') || v.includes('search') || v.includes('seo')) return 'google';
  if (v.includes('referral') || v.includes('friend') || v.includes('word')) return 'referral';
  if (v.includes('walk') || v.includes('walkin')) return 'walk-in';
  if (v.includes('website') || v.includes('web') || v.includes('online')) return 'website';
  if (v.includes('event') || v.includes('seminar')) return 'event';
  return null;
}

function parseDate(raw: string): string | null {
  if (!raw || raw === 'N/A' || raw === '') return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// --- Student Details import (account holder + participants) ---

function cleanName(raw: string | undefined): string {
  const v = (raw || '').trim();
  if (v === '.' || v === '*' || v === '-') return '';
  return v;
}

function parseMoney(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(String(raw).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function cleanEmail(raw: string | undefined): string | null {
  const v = (raw || '').trim().toLowerCase();
  if (!v || !EMAIL_RE.test(v)) return null;
  if (v.includes('@mystudio.academy')) return null; // demo/system account
  return v;
}

async function importStudentDetails(
  rows: Record<string, string>[],
  locationId: number | null,
  req: AuthRequest,
  res: Response,
  preview: boolean,
) {
  const results = {
    imported: 0,            // new records created (account holders + participants)
    upgraded: 0,            // existing records updated / relinked
    skipped: 0,
    errors: 0,
    accountHoldersCreated: 0,
    participantsCreated: 0,
    relinked: 0,
    contactsUpdated: 0,
    errorDetails: [] as string[],
    skipReasons: [] as string[],
  };

  // Preview mode performs no writes. To stay accurate when the same account
  // holder / participant appears in multiple rows (this export is full of
  // duplicates), we track what we've already "virtually" created in this run.
  const previewHolders = new Map<string, number | null>(); // email -> existing id, or null = would-create
  const previewParticipants = new Set<string>();           // `${email}|${first}|${last}` already counted

  for (const row of rows) {
    try {
      const custFirst = cleanName(row['Customer First Name']);
      const custLast = cleanName(row['Customer Last Name']);
      const email = cleanEmail(row['Email']);
      const phone = (row['Mobile Phone Number'] || '').trim() || null;

      // Collect participants 1..11
      const participants: { first: string; last: string }[] = [];
      for (let i = 1; i <= 11; i++) {
        const f = cleanName(row[`Participant ${i} First Name`]);
        const l = cleanName(row[`Participant ${i} Last Name`]);
        if (f) participants.push({ first: f, last: l });
      }

      // Account holder identity — fall back to the first participant if the
      // Customer name is blank (some rows only carry a participant).
      const ahFirst = custFirst || participants[0]?.first || '';
      const ahLast = custLast || participants[0]?.last || '';

      // Account holders are keyed on email; without one we can't safely match.
      if (!email) {
        results.skipped++;
        if (results.skipReasons.length < 8) {
          results.skipReasons.push(`No valid email for "${`${ahFirst} ${ahLast}`.trim()}" — skipped`);
        }
        continue;
      }
      if (!ahFirst) {
        results.skipped++;
        if (results.skipReasons.length < 8) results.skipReasons.push(`No name for ${email} — skipped`);
        continue;
      }

      const totalPayments = parseMoney(row['Total Payments']);
      const pastDue = parseMoney(row['Past Due']);
      const lastContactText = (row['Last Contact'] || '').trim() || null;
      const customerFor = (row['Customer For'] || '').trim() || null;
      const portalEnabled = (row['Member Portal'] || '').trim().toLowerCase() === 'enabled';
      const portalUsername = (row['Username'] || '').trim() || null;

      // ── Account holder: overwrite contact fields, preserve program/rank/status ──
      // accountHolderId is the real id (existing/just-written) or null when it
      // would be created in preview mode.
      let accountHolderId: number | null;
      let ahExisted: boolean;

      if (preview) {
        if (previewHolders.has(email)) {
          // Seen earlier in this same file — counts as an update, not a new create.
          accountHolderId = previewHolders.get(email)!;
          ahExisted = true;
        } else {
          const existing = await pool.query('SELECT id FROM members WHERE email = $1', [email]);
          ahExisted = existing.rows.length > 0;
          accountHolderId = ahExisted ? existing.rows[0].id : null;
          previewHolders.set(email, accountHolderId);
        }
      } else {
        const existing = await pool.query('SELECT id FROM members WHERE email = $1', [email]);
        ahExisted = existing.rows.length > 0;
        const ahResult = await pool.query(
          `INSERT INTO members (
             "firstName", "lastName", email, phone,
             "accountStatus", "accountType", "membershipAge", ranking,
             "locationId", "memberType",
             "totalPayments", "pastDue", "lastContactText", "customerFor",
             "portalEnabled", "portalUsername", "syncedFromMyStudio"
           ) VALUES ($1,$2,$3,$4,'member','basic','Adult','White',$5,'account_holder',$6,$7,$8,$9,$10,$11,true)
           ON CONFLICT (email) DO UPDATE SET
             "firstName"       = EXCLUDED."firstName",
             "lastName"        = EXCLUDED."lastName",
             phone             = COALESCE(EXCLUDED.phone, members.phone),
             "memberType"      = 'account_holder',
             "totalPayments"   = EXCLUDED."totalPayments",
             "pastDue"         = EXCLUDED."pastDue",
             "lastContactText" = EXCLUDED."lastContactText",
             "customerFor"     = EXCLUDED."customerFor",
             "portalEnabled"   = EXCLUDED."portalEnabled",
             "portalUsername"  = COALESCE(EXCLUDED."portalUsername", members."portalUsername"),
             "syncedFromMyStudio" = true,
             "updatedAt"       = CURRENT_TIMESTAMP
           RETURNING id`,
          [ahFirst, ahLast, email, phone, locationId, totalPayments, pastDue, lastContactText, customerFor, portalEnabled, portalUsername],
        );
        accountHolderId = ahResult.rows[0].id;
      }
      if (ahExisted) { results.upgraded++; results.contactsUpdated++; }
      else { results.imported++; results.accountHoldersCreated++; }

      // ── Participants ──
      const seen = new Set<string>();
      for (const p of participants) {
        const key = `${p.first.toLowerCase()}|${p.last.toLowerCase()}`;
        if (seen.has(key)) continue; // duplicate participant within the same row
        seen.add(key);

        // Participant that is the account holder themselves — already represented.
        if (
          p.first.toLowerCase() === ahFirst.toLowerCase() &&
          p.last.toLowerCase() === ahLast.toLowerCase()
        ) {
          continue;
        }

        if (preview) {
          // Dedupe across the whole file so repeated rows don't recount.
          const pkey = `${email}|${key}`;
          if (previewParticipants.has(pkey)) continue;
          previewParticipants.add(pkey);

          // A brand-new holder (id null) has no existing participants → would create.
          let existsP = false;
          if (accountHolderId != null) {
            const r = await pool.query(
              `SELECT id FROM members
                 WHERE "accountHolderId" = $1
                   AND LOWER("firstName") = LOWER($2)
                   AND LOWER("lastName")  = LOWER($3)`,
              [accountHolderId, p.first, p.last],
            );
            existsP = r.rows.length > 0;
          }
          if (existsP) { results.upgraded++; results.relinked++; }
          else { results.imported++; results.participantsCreated++; }
          continue;
        }

        // Match only within this account holder to avoid merging unrelated people.
        const existingP = await pool.query(
          `SELECT id FROM members
             WHERE "accountHolderId" = $1
               AND LOWER("firstName") = LOWER($2)
               AND LOWER("lastName")  = LOWER($3)`,
          [accountHolderId, p.first, p.last],
        );

        if (existingP.rows.length > 0) {
          await pool.query(
            `UPDATE members SET
               "firstName" = $1, "lastName" = $2,
               "memberType" = 'participant',
               "syncedFromMyStudio" = true,
               "updatedAt" = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [p.first, p.last, existingP.rows[0].id],
          );
          results.upgraded++; results.relinked++;
        } else {
          await pool.query(
            `INSERT INTO members (
               "firstName", "lastName", "accountStatus", "accountType",
               "membershipAge", ranking, "locationId", "memberType",
               "accountHolderId", "syncedFromMyStudio"
             ) VALUES ($1,$2,'member','basic','Kids','White',$3,'participant',$4,true)`,
            [p.first, p.last, locationId, accountHolderId],
          );
          results.imported++; results.participantsCreated++;
        }
      }
    } catch (err: any) {
      results.errors++;
      if (results.errorDetails.length < 8) results.errorDetails.push(err.message);
    }
  }

  if (!preview) {
    await auditLog('member.import_csv', req.user?.id ?? null, req, {
      fileName: req.file?.originalname,
      type: 'student-details',
      total: rows.length,
      imported: results.imported,
      upgraded: results.upgraded,
      skipped: results.skipped,
      errors: results.errors,
      accountHoldersCreated: results.accountHoldersCreated,
      participantsCreated: results.participantsCreated,
      relinked: results.relinked,
      contactsUpdated: results.contactsUpdated,
    });
  }

  return res.json({
    type: 'student-details',
    preview,
    total: rows.length,
    imported: results.imported,
    upgraded: results.upgraded,
    skipped: results.skipped,
    errors: results.errors,
    accountHoldersCreated: results.accountHoldersCreated,
    participantsCreated: results.participantsCreated,
    relinked: results.relinked,
    contactsUpdated: results.contactsUpdated,
    firstErrors: results.errorDetails.slice(0, 8),
    skipReasons: results.skipReasons.slice(0, 8),
  });
}

// --- Import endpoint ---

router.post('/', authorizeAdmin, upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let locationId = req.body.locationId ? parseInt(req.body.locationId) : null;
  // If no location specified, fall back to the primary location
  if (!locationId) {
    const primaryLoc = await pool.query(`SELECT id FROM locations WHERE "isPrimary" = true LIMIT 1`);
    if (primaryLoc.rows.length > 0) locationId = primaryLoc.rows[0].id;
    else {
      const anyLoc = await pool.query(`SELECT id FROM locations ORDER BY id ASC LIMIT 1`);
      if (anyLoc.rows.length > 0) locationId = anyLoc.rows[0].id;
    }
  }
  const programOverride = req.body.program || null; // for member CSVs split by program

  const text = req.file.buffer.toString('utf-8');
  const { headers, rows } = parseCSV(text);

  if (headers.length === 0) return res.status(400).json({ error: 'Empty or invalid CSV' });

  const type = detectType(headers);
  if (type === 'unknown') {
    return res.status(400).json({ error: 'Could not detect CSV type. Expected Lead, Trial, Member, or Student Details format.' });
  }

  // Student Details has a different shape (account holder + up to 11 participants per row)
  // and no program/rank/status data, so it gets its own handler.
  if (type === 'student-details') {
    const preview = String(req.body.preview ?? '') === 'true';
    return importStudentDetails(rows, locationId, req as AuthRequest, res, preview);
  }

  const results = { imported: 0, upgraded: 0, skipped: 0, errors: 0, errorDetails: [] as string[], skipReasons: [] as string[], duplicates: [] as string[] };

  for (const row of rows) {
    try {
      // Customer = Account Holder (paying parent/adult)
      // Participant = the actual practitioner (child or same person for adults)
      const customerFirstName = (row['Customer First Name'] || row['Buyer First Name'] || row['First Name'] || '').trim();
      const customerLastName  = (row['Customer Last Name']  || row['Buyer Last Name']  || row['Last Name']  || '').trim();
      const participantFirstName = (row['Participant First Name'] || '').trim();
      const participantLastName  = (row['Participant Last Name']  || '').trim();
      const email = (row['Email'] || row['Email Address'] || '').trim().toLowerCase();

      // A "distinct participant" row has a Participant name that differs from the Customer name.
      // This represents a child whose parent (Customer) is the account holder.
      const hasDistinctParticipant = !!(
        participantFirstName &&
        (participantFirstName.toLowerCase() !== customerFirstName.toLowerCase() ||
         participantLastName.toLowerCase() !== customerLastName.toLowerCase())
      );

      // Primary name used for the main record (account holder in all cases)
      let firstName = customerFirstName || participantFirstName;
      let lastName  = customerLastName  || participantLastName;

      // Handle full name in first name field
      if (firstName && !lastName && firstName.includes(' ')) {
        const parts = firstName.split(' ');
        firstName = parts[0];
        lastName = parts.slice(1).join(' ');
      }
      if (lastName === '.') lastName = '';

      if (!firstName || !email) {
        results.skipped++;
        if (results.skipReasons.length < 3) {
          results.skipReasons.push(`Missing name or email — name:"${firstName}" email:"${email}"`);
        }
        continue;
      }

      // Duplicate handling — upgrade trialer → member if incoming is a paid member
      const existing = await pool.query('SELECT id, "firstName", "lastName", "accountStatus" FROM members WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        const ex = existing.rows[0];
        if (type === 'member' && (ex.accountStatus === 'trialer' || ex.accountStatus === 'lead')) {
          results.upgraded++;
        } else if (type === 'trial' && ex.accountStatus === 'lead') {
          results.upgraded++;
        } else if (!hasDistinctParticipant) {
          results.skipped++;
          results.duplicates.push(`${firstName} ${lastName} (${email}) — already exists as ${ex.firstName} ${ex.lastName} [${ex.accountStatus}]`);
          continue;
        }
        // If hasDistinctParticipant, fall through — we still need to upsert the account holder
        // then check/create the participant below
      }

      const phone = (row['Mobile Phone'] || '').trim() || null;
      const dob = parseDate(row['Birthday'] || '');

      let accountStatus: string;
      let programType: string;
      let membershipAge: 'Adult' | 'Kids';
      let ranking: string;
      let leadSource: string | null;
      let trialStartDate: string | null = null;
      let memberStartDate: string | null = null;
      let notes: string | null = null;
      let planNameFromMembership = '';

      if (type === 'lead') {
        accountStatus = 'lead';
        programType = normalizeProgram(row['Program Interest'] || programOverride || '', true) as string;
        membershipAge = normalizeAge(programType, row['Age'] || '', dob || '');
        ranking = 'White';
        leadSource = normalizeLeadSource(row['Source'] || '');

      } else if (type === 'trial') {
        accountStatus = 'trialer';
        const resolvedProgram = normalizeProgram(row['Trial Program'] || programOverride || '');
        if (!resolvedProgram) {
          results.skipped++;
          if (results.skipReasons.length < 5) results.skipReasons.push(`Unrecognized trial program: "${row['Trial Program']}" for ${firstName} ${lastName}`);
          continue;
        }
        programType = resolvedProgram;
        membershipAge = normalizeAge(programType, row['Age'] || '', dob || '');
        ranking = 'White';
        leadSource = normalizeLeadSource(row['Source'] || '');
        trialStartDate = parseDate(row['Start Date'] || row['Registered Date'] || '');
        if (row['Custom Field 1'] && row['Custom Value 1']) {
          notes = `${row['Custom Field 1']}: ${row['Custom Value 1']}`;
        }

      } else {
        // member
        accountStatus = 'member';
        const membershipRaw = row['Program'] || row['Program Name'] || row['Membership'] || row['membership'] || row['program'] || '';
        const membershipParts = membershipRaw.split(', _');
        const programRaw = membershipParts[0] || programOverride || '';
        planNameFromMembership = membershipParts[1] ? membershipParts[1].replace(/_/g, '').trim() : '';
        const resolvedProgram = normalizeProgram(programRaw || programOverride || '');
        if (!resolvedProgram) {
          results.skipped++;
          if (results.skipReasons.length < 5) results.skipReasons.push(`Unrecognized member program: "${programRaw}" for ${firstName} ${lastName}`);
          continue;
        }
        programType = resolvedProgram;
        membershipAge = normalizeAge(programType, row['Age'] || '', dob || '');
        ranking = normalizeRanking(row['Rank'] || '', programType);
        leadSource = normalizeLeadSource(row['Source'] || '');
        memberStartDate = parseDate(row['Registration Date'] || '');
        if (row['Custom Field 1'] && row['Custom Value 1']) {
          notes = `${row['Custom Field 1']}: ${row['Custom Value 1']}`;
        }
      }

      // Try to match or create a pricing plan for members
      let pricingPlanId: number | null = null;
      if (type === 'member') {
        const planName = planNameFromMembership || row['Membership']?.trim() || '';
        if (planName) {
          const planMatch = await pool.query(
            `SELECT id FROM pricing_plans WHERE LOWER(name) LIKE LOWER($1) LIMIT 1`,
            [`%${planName}%`]
          );
          if (planMatch.rows.length > 0) {
            pricingPlanId = planMatch.rows[0].id;
          } else {
            const inserted = await pool.query(
              `INSERT INTO pricing_plans (name, description, "accountType", "programType", "membershipAge", amount, currency, "billingInterval", "intervalCount", "isActive")
               VALUES ($1, $2, 'basic', $3, $4, 0, 'usd', 'month', 1, true) RETURNING id`,
              [planName, 'Auto-created from MyStudio import', programType || 'No Program Selected', membershipAge || 'Adult']
            );
            pricingPlanId = inserted.rows[0].id;
          }
        }
      }

      // Resolve membership
      const membershipRawField = row['Membership']?.trim() || '';
      let membershipId: number | null = null;
      let membershipName: string | null = null;
      if (membershipRawField) {
        const membershipMatch = await pool.query(
          `SELECT id, name FROM memberships WHERE LOWER(name) = LOWER($1) AND "isActive" = true LIMIT 1`,
          [membershipRawField]
        );
        if (membershipMatch.rows.length > 0) {
          membershipId = membershipMatch.rows[0].id;
          membershipName = membershipMatch.rows[0].name;
        } else {
          membershipName = membershipRawField;
        }
      }

      const totalAttendance = parseInt(row['Total Attendance Count'] || row['Attendance Count'] || '0') || 0;
      const lastAttendance = parseDate(row['Last Attendance'] || '');

      // ── Upsert the Account Holder (Customer) ────────────────────────────
      const ahResult = await pool.query(
        `INSERT INTO members (
          "firstName", "lastName", email, phone, "accountStatus", "accountType",
          "programType", "membershipAge", ranking, "leadSource", "dateOfBirth",
          notes, "locationId", "trialStartDate", "memberStartDate",
          "pricingPlanId", "totalClassesAttended", "lastCheckInAt",
          "syncedFromMyStudio", "membershipId", "membershipName", "memberType"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'account_holder')
        ON CONFLICT (email) DO UPDATE SET
          "accountStatus" = EXCLUDED."accountStatus",
          "programType"   = EXCLUDED."programType",
          "membershipAge" = EXCLUDED."membershipAge",
          ranking         = EXCLUDED.ranking,
          "memberType"    = 'account_holder',
          "pricingPlanId" = COALESCE(EXCLUDED."pricingPlanId", members."pricingPlanId"),
          "trialStartDate"   = COALESCE(EXCLUDED."trialStartDate",   members."trialStartDate"),
          "memberStartDate"  = COALESCE(EXCLUDED."memberStartDate",  members."memberStartDate"),
          "totalClassesAttended" = GREATEST(COALESCE(members."totalClassesAttended", 0), COALESCE(EXCLUDED."totalClassesAttended", 0)),
          "membershipId"   = COALESCE(EXCLUDED."membershipId",   members."membershipId"),
          "membershipName" = COALESCE(EXCLUDED."membershipName", members."membershipName"),
          "syncedFromMyStudio" = true,
          "updatedAt" = CURRENT_TIMESTAMP
        RETURNING id`,
        [
          firstName, lastName, email, phone, accountStatus, 'basic',
          programType, membershipAge, ranking, leadSource, dob,
          notes, locationId, trialStartDate, memberStartDate,
          pricingPlanId, totalAttendance || null, lastAttendance,
          true, membershipId, membershipName,
        ]
      );

      const accountHolderId: number = ahResult.rows[0].id;

      // ── If this row has a distinct Participant, upsert them too ─────────
      if (hasDistinctParticipant) {
        const pFirst = participantFirstName;
        const pLast  = participantLastName;

        // Check if this participant already exists under this account holder
        const existingParticipant = await pool.query(
          `SELECT id FROM members
           WHERE "accountHolderId" = $1
             AND LOWER("firstName") = LOWER($2)
             AND LOWER("lastName")  = LOWER($3)`,
          [accountHolderId, pFirst, pLast]
        );

        if (existingParticipant.rows.length > 0) {
          // Update the existing participant record
          await pool.query(
            `UPDATE members SET
               "accountStatus" = $1, "programType" = $2, "membershipAge" = $3,
               ranking = $4, "trialStartDate" = $5, "memberStartDate" = $6,
               "pricingPlanId" = COALESCE($7, "pricingPlanId"),
               "totalClassesAttended" = GREATEST(COALESCE("totalClassesAttended", 0), COALESCE($8, 0)),
               "syncedFromMyStudio" = true, "updatedAt" = CURRENT_TIMESTAMP
             WHERE id = $9`,
            [accountStatus, programType, membershipAge, ranking,
             trialStartDate, memberStartDate, pricingPlanId,
             totalAttendance || null, existingParticipant.rows[0].id]
          );
          results.upgraded++;
        } else {
          // Insert new participant (no email — avoids unique constraint conflict)
          await pool.query(
            `INSERT INTO members (
               "firstName", "lastName", phone, "accountStatus", "accountType",
               "programType", "membershipAge", ranking, "locationId",
               "memberType", "accountHolderId", "trialStartDate", "memberStartDate",
               "pricingPlanId", "totalClassesAttended", "lastCheckInAt",
               "syncedFromMyStudio", "membershipId", "membershipName"
             ) VALUES ($1,$2,$3,$4,'basic',$5,$6,$7,$8,'participant',$9,$10,$11,$12,$13,$14,true,$15,$16)`,
            [
              pFirst, pLast, phone, accountStatus,
              programType, membershipAge, ranking, locationId,
              accountHolderId, trialStartDate, memberStartDate,
              pricingPlanId, totalAttendance || null, lastAttendance,
              membershipId, membershipName,
            ]
          );
          results.imported++;
        }
      } else {
        results.imported++;
      }

    } catch (err: any) {
      results.errors++;
      results.errorDetails.push(err.message);
    }
  }

  await auditLog('member.import_csv', (req as AuthRequest).user?.id ?? null, req, {
    fileName: req.file.originalname,
    type,
    total: rows.length,
    imported: results.imported,
    upgraded: results.upgraded,
    skipped: results.skipped,
    errors: results.errors,
  });

  res.json({
    type,
    total: rows.length,
    ...results,
    detectedHeaders: headers,
    firstErrors: results.errorDetails.slice(0, 5),
    duplicateCount: results.duplicates.length,
    duplicateList: results.duplicates,
  });
});

export default router;
