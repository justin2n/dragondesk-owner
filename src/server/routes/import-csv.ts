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
  // Leads and Trials must be checked before Student Details / Member, because a
  // Trial export also has 'customer first name'. Buyer/Opt-in and Trial columns
  // are unambiguous, so they win.
  if (h.includes('buyer first name') || h.includes('opt in date')) return 'lead';
  if (h.includes('trial status') || h.includes('trial program')) return 'trial';
  // Student Details: participant-per-row roster with payment totals and NO email
  // (the current MyStudio export shape). The old numbered-column shape
  // ('participant 1 first name' / 'member portal') is still accepted.
  if (h.includes('participant 1 first name') || (h.includes('customer for') && h.includes('member portal'))) return 'student-details';
  if (h.includes('type') && h.includes('total payments') && h.includes('customer first name') && !h.includes('email')) return 'student-details';
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

// ── Resolvers that map MyStudio catalog strings onto DragonDesk records ───────
// These make an import reflect MyStudio under the new stage/seat/program model:
// programs and membership types are created on demand rather than dropped, and
// caches keep a single run from issuing the same lookup thousands of times.

// Resolve a MyStudio program string to a DragonDesk program id, creating the
// program if it doesn't exist yet so enrollment is never silently lost.
type ResolvedProgram = { id: number; name: string; quickStartClassCount: number; quickStartPriceAmount: number };
async function resolveProgramId(
  raw: string,
  cache: Map<string, ResolvedProgram | null>,
  isLead = false,
): Promise<ResolvedProgram | null> {
  const name = normalizeProgram(raw, isLead);
  if (!name || name === 'No Program Selected') return null;
  if (cache.has(name)) return cache.get(name)!;

  const cols = 'id, name, "quickStartClassCount", "quickStartPriceAmount"';
  const existing = await pool.query(`SELECT ${cols} FROM programs WHERE name = $1`, [name]);
  let resolved: ResolvedProgram;
  if (existing.rows.length > 0) {
    resolved = existing.rows[0];
  } else {
    const created = await pool.query(
      `INSERT INTO programs (name, description, "isActive") VALUES ($1, 'Imported from MyStudio', true)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING ${cols}`,
      [name],
    );
    resolved = created.rows[0];
  }
  cache.set(name, resolved);
  return resolved;
}

// Resolve a MyStudio plan name to a DragonDesk membership type, creating it
// (priced from the CSV) if new. Family plans are detected by name and get an
// unlimited program allowance; others default to one program per seat.
async function resolveMembership(
  planName: string,
  priceCents: number,
  cache: Map<string, { id: number; name: string; created: boolean }>,
): Promise<{ id: number; name: string; created: boolean } | null> {
  const name = (planName || '').trim();
  if (!name) return null;
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  const existing = await pool.query('SELECT id, name FROM memberships WHERE LOWER(name) = $1 LIMIT 1', [key]);
  let resolved: { id: number; name: string; created: boolean };
  if (existing.rows.length > 0) {
    resolved = { ...existing.rows[0], created: false };
  } else {
    const isFamily = /family/i.test(name);
    const created = await pool.query(
      `INSERT INTO memberships (name, description, "priceAmount", "isFamilyPlan", "maxProgramsPerParticipant", "isActive")
       VALUES ($1, 'Imported from MyStudio', $2, $3, $4, true) RETURNING id, name`,
      [name, priceCents, isFamily, isFamily ? null : 1],
    );
    resolved = { ...created.rows[0], created: true };
  }
  cache.set(key, resolved);
  return resolved;
}

// Enroll a member in a program (member_programs is the source of truth) and keep
// members.programType as the denormalized primary, mirroring
// syncParticipantPrograms() in routes/members.ts. Idempotent.
async function linkProgram(memberId: number, program: { id: number; name: string }) {
  await pool.query(
    `INSERT INTO member_programs ("memberId", "programId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [memberId, program.id],
  );
  await pool.query(
    `UPDATE members SET "programId" = COALESCE("programId", $1),
       "programType" = CASE WHEN "programType" IS NULL OR "programType" = 'No Program Selected'
                            THEN $2 ELSE "programType" END
     WHERE id = $3`,
    [program.id, program.name, memberId],
  );
}

// Per-run guard: clear a member's previously-synced seats/quick starts the FIRST
// time they're seen in this import, so re-importing rebuilds cleanly without
// stacking duplicates — but multiple rows for one member (e.g. two programs)
// don't wipe each other.
async function clearSyncedOnce(memberId: number, seen: Set<number>, kind: 'seats' | 'quickstarts') {
  const tag = `${kind}:${memberId}`;
  const seenKey = memberId * 2 + (kind === 'seats' ? 0 : 1);
  if (seen.has(seenKey)) return;
  seen.add(seenKey);
  if (kind === 'seats') {
    await pool.query(`DELETE FROM membership_seats WHERE "participantId" = $1 AND "syncedFromMyStudio" = true`, [memberId]);
    await pool.query(`DELETE FROM membership_seats WHERE "accountHolderId" = $1 AND "participantId" IS NULL AND "syncedFromMyStudio" = true`, [memberId]);
  } else {
    await pool.query(`DELETE FROM quick_start_enrollments WHERE "memberId" = $1 AND "syncedFromMyStudio" = true`, [memberId]);
  }
  void tag;
}

// --- shared cleaners ---

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

// --- Student Details import: ENRICH ONLY ---
// The current MyStudio Student Details export is one participant per row with a
// Customer (account holder) name, a Type, and payment totals — but NO email. We
// therefore never CREATE records from it (name-only matching is too risky);
// instead we fill Total Payments / Past Due on contacts already imported from the
// email-bearing Lead/Trial/Membership files, matched by name.

// MyStudio appends an id to some last names in this export ("Suplee 2667").
// Strip a trailing run of digits so it matches the clean name from other files.
function stripIdSuffix(name: string): string {
  return (name || '').replace(/\s+\d+\s*$/, '').trim();
}

async function importStudentDetails(
  rows: Record<string, string>[],
  _locationId: number | null,
  req: AuthRequest,
  res: Response,
  preview: boolean,
) {
  const results = {
    imported: 0,            // always 0 — this importer never creates records
    upgraded: 0,            // contacts enriched
    skipped: 0,             // rows with no matching contact
    errors: 0,
    contactsUpdated: 0,
    unmatched: 0,
    errorDetails: [] as string[],
    skipReasons: [] as string[],
  };

  for (const row of rows) {
    try {
      const partFirst = cleanName(row['Participant First Name']);
      const partLast = stripIdSuffix(cleanName(row['Participant Last Name']));
      const custFirst = cleanName(row['Customer First Name']) || partFirst;
      const custLast = stripIdSuffix(cleanName(row['Customer Last Name']) || partLast);
      if (!partFirst && !custFirst) { results.skipped++; continue; }

      const totalPayments = parseMoney(row['Total Payments']);
      const pastDue = parseMoney(row['Past Due']);
      const participantSince = parseDate(row['Participant Since'] || '');

      // Adult (participant == customer) → the account holder record is the trainee.
      // Child → a participant record under an account holder matching the customer.
      const isAdultSelf =
        partFirst.toLowerCase() === custFirst.toLowerCase() &&
        partLast.toLowerCase() === custLast.toLowerCase();

      let match;
      if (isAdultSelf) {
        match = await pool.query(
          `SELECT id FROM members
             WHERE "memberType" = 'account_holder'
               AND LOWER("firstName") = LOWER($1) AND LOWER("lastName") = LOWER($2)`,
          [custFirst, custLast],
        );
      } else {
        match = await pool.query(
          `SELECT m.id FROM members m
             JOIN members ah ON ah.id = m."accountHolderId"
             WHERE m."memberType" = 'participant'
               AND LOWER(m."firstName") = LOWER($1) AND LOWER(m."lastName") = LOWER($2)
               AND LOWER(ah."firstName") = LOWER($3) AND LOWER(ah."lastName") = LOWER($4)`,
          [partFirst, partLast, custFirst, custLast],
        );
      }

      // Ambiguous (duplicate names) or no match — don't guess. Report and move on.
      if (match.rows.length !== 1) {
        results.unmatched++;
        results.skipped++;
        if (results.skipReasons.length < 8) {
          const who = `${partFirst} ${partLast}`.trim();
          results.skipReasons.push(
            match.rows.length === 0
              ? `No contact found for "${who}" (customer ${custFirst} ${custLast}) — import Membership/Trial first`
              : `Ambiguous match for "${who}" (${match.rows.length} candidates) — skipped`,
          );
        }
        continue;
      }

      if (!preview) {
        await pool.query(
          `UPDATE members SET
             "totalPayments" = $1,
             "pastDue" = $2,
             "memberStartDate" = COALESCE("memberStartDate", $3),
             "syncedFromMyStudio" = true,
             "updatedAt" = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [totalPayments, pastDue, participantSince, match.rows[0].id],
        );
      }
      results.upgraded++;
      results.contactsUpdated++;
    } catch (err: any) {
      results.errors++;
      if (results.errorDetails.length < 8) results.errorDetails.push(err.message);
    }
  }

  if (!preview) {
    try {
      await auditLog('member.import_csv', req.user?.id ?? null, req, {
        fileName: req.file?.originalname,
        type: 'student-details',
        total: rows.length,
        contactsUpdated: results.contactsUpdated,
        unmatched: results.unmatched,
        errors: results.errors,
      });
    } catch (err) {
      console.error('[import-csv] audit log failed (non-fatal):', err);
    }
  }

  return res.json({
    type: 'student-details',
    preview,
    total: rows.length,
    imported: 0,
    upgraded: results.upgraded,
    skipped: results.skipped,
    errors: results.errors,
    contactsUpdated: results.contactsUpdated,
    unmatched: results.unmatched,
    firstErrors: results.errorDetails.slice(0, 8),
    skipReasons: results.skipReasons.slice(0, 8),
  });
}

// --- Import endpoint ---

router.post('/', authorizeAdmin, upload.single('file'), async (req: AuthRequest, res) => {
 try {
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
    return await importStudentDetails(rows, locationId, req as AuthRequest, res, preview);
  }

  const results = {
    imported: 0,               // new contacts created
    upgraded: 0,               // existing contacts updated
    skipped: 0,
    errors: 0,
    accountHoldersCreated: 0,
    participantsCreated: 0,
    seatsCreated: 0,           // membership_seats written (Member rows)
    quickStartsCreated: 0,     // quick_start_enrollments written (Trial rows)
    membershipsCreated: 0,     // new Membership Types auto-created from plan names
    programsLinked: 0,         // member_programs links written
    errorDetails: [] as string[],
    skipReasons: [] as string[],
    duplicates: [] as string[],
    createdMemberships: [] as string[],
  };

  // Per-run caches/guards so a file with thousands of rows doesn't re-query the
  // same catalog entries and a re-import rebuilds synced records without stacking.
  const programCache = new Map<string, ResolvedProgram | null>();
  const membershipCache = new Map<string, { id: number; name: string; created: boolean }>();
  const clearedSynced = new Set<number>();

  // Furthest-along stage wins when a contact appears in several files/rows, so a
  // membership row never demotes someone already imported as a member.
  const stageRank = (s: string) => (({ lead: 0, trialer: 1, member: 2 } as Record<string, number>)[s] ?? 0);

  for (const row of rows) {
    try {
      // Customer = Account Holder (the paying person); Participant = the trainee.
      // For an adult training on their own account these are the same person.
      const customerFirstName = (row['Customer First Name'] || row['Buyer First Name'] || row['First Name'] || '').trim();
      const customerLastName  = (row['Customer Last Name']  || row['Buyer Last Name']  || row['Last Name']  || '').trim();
      const participantFirstName = (row['Participant First Name'] || '').trim();
      const participantLastName  = (row['Participant Last Name']  || '').trim();
      const email = (row['Email'] || row['Email Address'] || '').trim().toLowerCase();

      const hasDistinctParticipant = !!(
        participantFirstName &&
        (participantFirstName.toLowerCase() !== customerFirstName.toLowerCase() ||
         participantLastName.toLowerCase() !== customerLastName.toLowerCase())
      );

      // Account holder name — the Customer, falling back to the Participant when
      // the Customer columns are blank (some lead rows only carry a buyer).
      let ahFirst = customerFirstName || participantFirstName;
      let ahLast  = customerLastName  || participantLastName;
      if (ahFirst && !ahLast && ahFirst.includes(' ')) {
        const parts = ahFirst.split(' ');
        ahFirst = parts[0];
        ahLast = parts.slice(1).join(' ');
      }
      if (ahLast === '.') ahLast = '';

      // Account holders are keyed on email; without one we can't match safely.
      if (!ahFirst || !email) {
        results.skipped++;
        if (results.skipReasons.length < 5) {
          results.skipReasons.push(`Missing name or email — name:"${ahFirst}" email:"${email}"`);
        }
        continue;
      }

      const phone = (row['Mobile Phone'] || row['Mobile Phone Number'] || '').trim() || null;
      const dob = parseDate(row['Birthday'] || '');
      const leadSource = normalizeLeadSource(row['Source'] || '');

      // ── Resolve the stage + the row's program/plan ─────────────────────────
      let stage: 'lead' | 'trialer' | 'member';
      let program: ResolvedProgram | null = null;
      let planName = '';
      let priceCents = 0;
      let ranking = 'White';
      let trialStartDate: string | null = null;
      let memberStartDate: string | null = null;
      let notes: string | null = null;
      let programInterest: ResolvedProgram | null = null;

      if (type === 'lead') {
        stage = 'lead';
        programInterest = await resolveProgramId(row['Program Interest'] || programOverride || '', programCache, true);
      } else if (type === 'trial') {
        stage = 'trialer';
        program = await resolveProgramId(row['Trial Program'] || programOverride || '', programCache);
        trialStartDate = parseDate(row['Start Date'] || row['Registered date'] || row['Registered Date'] || '');
        if (row['Custom Field 1'] && row['Custom Value 1']) notes = `${row['Custom Field 1']}: ${row['Custom Value 1']}`;
        if (!program && results.skipReasons.length < 5) {
          results.skipReasons.push(`Unrecognized trial program "${row['Trial Program']}" for ${ahFirst} ${ahLast} — imported without a Quick Start`);
        }
      } else {
        stage = 'member';
        // MyStudio "Membership" = "<Program>, _<Plan Name>_". Split gives the
        // program to enroll in and the plan name to become a Membership Type.
        const membershipRaw = row['Program'] || row['Program Name'] || row['Membership'] || row['membership'] || row['program'] || '';
        const membershipParts = membershipRaw.split(', _');
        const programRaw = membershipParts[0] || programOverride || '';
        planName = membershipParts[1] ? membershipParts[1].replace(/_/g, '').trim() : (row['Membership']?.trim() || '');
        program = await resolveProgramId(programRaw || programOverride || '', programCache);
        priceCents = Math.round(parseMoney(row['Next Payment Amount']) * 100);
        ranking = normalizeRanking(row['Rank'] || '', program?.name || '');
        memberStartDate = parseDate(row['Registration Date'] || '');
        if (row['Custom Field 1'] && row['Custom Value 1']) notes = `${row['Custom Field 1']}: ${row['Custom Value 1']}`;
        if (!program && results.skipReasons.length < 5) {
          results.skipReasons.push(`Unrecognized member program "${programRaw}" for ${ahFirst} ${ahLast} — imported without a program link`);
        }
      }

      const membershipAge = normalizeAge(program?.name || '', row['Age'] || '', dob || '');
      const totalAttendance = parseInt(row['Total Attendance Count'] || row['Attendance Count'] || row['Attendance count'] || '0') || 0;
      const lastAttendance = parseDate(row['Last Attendance'] || '');

      // ── Upsert the Account Holder ──────────────────────────────────────────
      const existingAH = await pool.query('SELECT id, "accountStatus" FROM members WHERE email = $1', [email]);
      const ahExisted = existingAH.rows.length > 0;
      const finalStage = ahExisted && stageRank(existingAH.rows[0].accountStatus) > stageRank(stage)
        ? existingAH.rows[0].accountStatus
        : stage;

      const ahResult = await pool.query(
        `INSERT INTO members (
           "firstName", "lastName", email, phone, "accountStatus",
           "membershipAge", ranking, "leadSource", "dateOfBirth", notes,
           "locationId", "memberType", "syncedFromMyStudio"
         ) VALUES ($1,$2,$3,$4,$5,'Adult','White',$6,$7,$8,$9,'account_holder',true)
         ON CONFLICT (email) DO UPDATE SET
           "firstName" = EXCLUDED."firstName",
           "lastName"  = EXCLUDED."lastName",
           phone       = COALESCE(EXCLUDED.phone, members.phone),
           "accountStatus" = EXCLUDED."accountStatus",
           "memberType" = 'account_holder',
           "leadSource" = COALESCE(members."leadSource", EXCLUDED."leadSource"),
           "dateOfBirth" = COALESCE(members."dateOfBirth", EXCLUDED."dateOfBirth"),
           notes = COALESCE(EXCLUDED.notes, members.notes),
           "syncedFromMyStudio" = true,
           "updatedAt" = CURRENT_TIMESTAMP
         RETURNING id`,
        [ahFirst, ahLast, email, phone, finalStage, leadSource, dob, notes, locationId],
      );
      const accountHolderId: number = ahResult.rows[0].id;
      if (ahExisted) results.upgraded++;
      else { results.imported++; results.accountHoldersCreated++; }

      // Leads carry only a Program Interest — no trainee, seat, or program.
      if (type === 'lead') {
        if (programInterest) {
          await pool.query('UPDATE members SET "programInterestId" = $1 WHERE id = $2', [programInterest.id, accountHolderId]);
        }
        continue;
      }

      // ── Resolve the trainee (account holder for adults, else a child) ──────
      let traineeId: number;
      if (hasDistinctParticipant) {
        const existingP = await pool.query(
          `SELECT id FROM members WHERE "accountHolderId" = $1 AND LOWER("firstName") = LOWER($2) AND LOWER("lastName") = LOWER($3)`,
          [accountHolderId, participantFirstName, participantLastName],
        );
        if (existingP.rows.length > 0) {
          traineeId = existingP.rows[0].id;
          await pool.query(
            `UPDATE members SET "accountStatus" = $1, "membershipAge" = $2, ranking = $3,
               "trialStartDate" = COALESCE($4, "trialStartDate"),
               "memberStartDate" = COALESCE($5, "memberStartDate"),
               "totalClassesAttended" = GREATEST(COALESCE("totalClassesAttended",0), $6),
               "lastCheckInAt" = COALESCE($7, "lastCheckInAt"),
               "memberType" = 'participant', "syncedFromMyStudio" = true, "updatedAt" = CURRENT_TIMESTAMP
             WHERE id = $8`,
            [stage, membershipAge, ranking, trialStartDate, memberStartDate, totalAttendance || 0, lastAttendance, traineeId],
          );
          results.upgraded++;
        } else {
          const pRes = await pool.query(
            `INSERT INTO members (
               "firstName", "lastName", phone, "accountStatus", "membershipAge", ranking,
               "locationId", "memberType", "accountHolderId", "trialStartDate", "memberStartDate",
               "totalClassesAttended", "lastCheckInAt", "syncedFromMyStudio"
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,'participant',$8,$9,$10,$11,$12,true) RETURNING id`,
            [participantFirstName, participantLastName, phone, stage, membershipAge, ranking,
             locationId, accountHolderId, trialStartDate, memberStartDate, totalAttendance || 0, lastAttendance],
          );
          traineeId = pRes.rows[0].id;
          results.imported++; results.participantsCreated++;
        }
      } else {
        // Adult trains on their own account: the account holder IS the trainee.
        traineeId = accountHolderId;
        await pool.query(
          `UPDATE members SET "membershipAge" = $1, ranking = $2,
             "trialStartDate" = COALESCE($3, "trialStartDate"),
             "memberStartDate" = COALESCE($4, "memberStartDate"),
             "totalClassesAttended" = GREATEST(COALESCE("totalClassesAttended",0), $5),
             "lastCheckInAt" = COALESCE($6, "lastCheckInAt"),
             "updatedAt" = CURRENT_TIMESTAMP
           WHERE id = $7`,
          [membershipAge, ranking, trialStartDate, memberStartDate, totalAttendance || 0, lastAttendance, traineeId],
        );
      }

      // Program enrollment (both trial and member trainees train in a program).
      if (program) { await linkProgram(traineeId, program); results.programsLinked++; }

      // ── Stage product: a priced seat (Member) or Quick Start (Trial) ───────
      if (type === 'member') {
        const membership = await resolveMembership(planName, priceCents, membershipCache);
        if (membership) {
          if (membership.created) { results.membershipsCreated++; results.createdMemberships.push(membership.name); }
          await clearSyncedOnce(traineeId, clearedSynced, 'seats');
          await pool.query(
            `INSERT INTO membership_seats
               ("accountHolderId", "membershipId", "participantId", "priceAmount", status, "locationId", "syncedFromMyStudio")
             VALUES ($1,$2,$3,$4,'active',$5,true)`,
            [accountHolderId, membership.id, traineeId, priceCents, locationId],
          );
          results.seatsCreated++;
        }
      } else if (type === 'trial' && program) {
        await clearSyncedOnce(traineeId, clearedSynced, 'quickstarts');
        const classesIncluded = program.quickStartClassCount || 3;
        const used = Math.max(0, Math.min(totalAttendance, classesIncluded));
        const qsStatus = used >= classesIncluded ? 'expired' : 'active';
        await pool.query(
          `INSERT INTO quick_start_enrollments
             ("memberId", "programId", "priceAmount", "classesIncluded", "classesUsed", status, "startDate", "endDate", "locationId", "syncedFromMyStudio")
           VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, CURRENT_TIMESTAMP),$8,$9,true)`,
          [traineeId, program.id, program.quickStartPriceAmount || 0, classesIncluded, used, qsStatus,
           trialStartDate, parseDate(row['End Date'] || ''), locationId],
        );
        results.quickStartsCreated++;
      }
    } catch (err: any) {
      results.errors++;
      if (results.errorDetails.length < 8) results.errorDetails.push(err.message);
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
    seatsCreated: results.seatsCreated,
    quickStartsCreated: results.quickStartsCreated,
    membershipsCreated: results.membershipsCreated,
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
 } catch (err: any) {
  // Without this, an async rejection here becomes an unhandledRejection that
  // crashes the whole process (Railway then restarts it) — the request shows
  // up in the browser as "Failed to fetch" with no status. Always respond.
  console.error('[import-csv] request failed:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: err?.message || 'Import failed unexpectedly' });
  }
 }
});

export default router;
