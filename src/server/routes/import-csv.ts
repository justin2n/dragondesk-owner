import { Router } from 'express';
import multer from 'multer';
import { pool } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

function detectType(headers: string[]): 'lead' | 'trial' | 'member' | 'unknown' {
  const h = headers.map(x => x.toLowerCase());
  if (h.includes('buyer first name') || h.includes('opt in date')) return 'lead';
  if (h.includes('trial status') || h.includes('trial program')) return 'trial';
  if (h.includes('membership') || h.includes('next payment date') || h.includes('rank')) return 'member';
  return 'unknown';
}

function normalizeProgram(raw: string): string {
  if (!raw) return 'Adult BJJ';
  const v = raw.trim();
  // Exact or near-exact MyStudio full names
  if (v === "Children's Martial Arts Programs" || v.toLowerCase().includes("children's martial arts")) return "Children's Martial Arts";
  if (v === 'Adult BJJ Classes and Memberships' || (v.toLowerCase().includes('bjj') && !v.toLowerCase().includes('kids'))) return 'Adult BJJ';
  if (v === 'Adult TKD and HKD Classes and Memberships' || v.toLowerCase().includes('tkd') || v.toLowerCase().includes('hkd') || v.toLowerCase().includes('taekwondo') || v.toLowerCase().includes('tae kwon')) return 'Adult TKD & HKD';
  if (v === 'DG BARBELL Classes and Memberships' || v.toLowerCase().includes('barbell')) return 'DG Barbell';
  if (v === 'Adult Muay Thai and Kickboxing Classes and Memberships' || (v.toLowerCase().includes('muay') && !v.toLowerCase().includes('kids')) || (v.toLowerCase().includes('kickbox') && !v.toLowerCase().includes('kids'))) return 'Adult Muay Thai & Kickboxing';
  if (v === 'The Ashtanga Club' || v.toLowerCase().includes('ashtanga')) return 'The Ashtanga Club';
  if (v === 'Dragon Gym Learning Center' || v.toLowerCase().includes('learning center')) return 'Dragon Gym Learning Center';
  if (v === 'Kids BJJ Classes and Memberships' || v.toLowerCase().includes('kids bjj')) return 'Kids BJJ';
  if (v === 'Kids DGMT - Youth Muay Thai Classes and Memberships' || v.toLowerCase().includes('kids dgmt') || v.toLowerCase().includes('youth muay thai')) return 'Kids Muay Thai';
  if (v === 'Young Ladies Yoga Sessions (Ages 8 - 12)' || v.toLowerCase().includes('young ladies yoga') || v.toLowerCase().includes('ladies yoga')) return 'Young Ladies Yoga';
  if (v === 'DG Workspace' || v.toLowerCase().includes('workspace')) return 'DG Workspace';
  if (v === 'Dragon Launch - Cross Training, Nutrition, Recovery' || v.toLowerCase().includes('dragon launch')) return 'Dragon Launch';
  if (v === 'PERSONAL TRAINING' || v.toLowerCase() === 'personal training') return 'Personal Training';
  if (v === 'DGMT Private and Semi-Private Training' || v.toLowerCase().includes('dgmt private') || v.toLowerCase().includes('semi-private')) return 'DGMT Private Training';
  return 'Adult BJJ';
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

// --- Import endpoint ---

router.post('/', authorizeAdmin, upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const locationId = req.body.locationId ? parseInt(req.body.locationId) : null;
  const programOverride = req.body.program || null; // for member CSVs split by program

  const text = req.file.buffer.toString('utf-8');
  const { headers, rows } = parseCSV(text);

  if (headers.length === 0) return res.status(400).json({ error: 'Empty or invalid CSV' });

  const type = detectType(headers);
  if (type === 'unknown') {
    return res.status(400).json({ error: 'Could not detect CSV type. Expected Lead, Trial, or Member format from MyStudio.' });
  }

  const results = { imported: 0, skipped: 0, errors: 0, errorDetails: [] as string[], skipReasons: [] as string[] };

  for (const row of rows) {
    try {
      // Resolve name — prefer Participant, fall back to Buyer/Customer
      let firstName = (row['Participant First Name'] || row['Buyer First Name'] || row['Customer First Name'] || row['First Name'] || '').trim();
      let lastName = (row['Participant Last Name'] || row['Buyer Last Name'] || row['Customer Last Name'] || row['Last Name'] || '').trim();
      const email = (row['Email'] || row['Email Address'] || '').trim().toLowerCase();

      // Handle full name in first name field
      if (firstName && !lastName && firstName.includes(' ')) {
        const parts = firstName.split(' ');
        firstName = parts[0];
        lastName = parts.slice(1).join(' ');
      }

      // Skip placeholder last names like "."
      if (lastName === '.') lastName = '';

      if (!firstName || !email) {
        results.skipped++;
        if (results.skipReasons.length < 3) {
          results.skipReasons.push(`Missing firstName or email — firstName:"${firstName}" email:"${email}"`);
        }
        continue;
      }

      // Skip duplicates
      const existing = await pool.query('SELECT id FROM members WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        results.skipped++;
        continue;
      }

      const phone = (row['Mobile Phone'] || '').trim() || null;
      const dob = parseDate(row['Birthday'] || '');
      const address = (row['Address'] || '').trim() || null;

      let accountStatus: string;
      let programType: string;
      let membershipAge: 'Adult' | 'Kids';
      let ranking: string;
      let leadSource: string | null;
      let trialStartDate: string | null = null;
      let memberStartDate: string | null = null;
      let notes: string | null = null;

      if (type === 'lead') {
        accountStatus = 'lead';
        programType = normalizeProgram(row['Program Interest'] || programOverride || '');
        membershipAge = normalizeAge(programType, row['Age'] || '', dob || '');
        ranking = 'White';
        leadSource = normalizeLeadSource(row['Source'] || '');
        const optIn = parseDate(row['Opt In date'] || '');
        memberStartDate = null;
        trialStartDate = null;

      } else if (type === 'trial') {
        accountStatus = 'trialer';
        programType = normalizeProgram(row['Trial Program'] || programOverride || '');
        membershipAge = normalizeAge(programType, row['Age'] || '', dob || '');
        ranking = 'White';
        leadSource = normalizeLeadSource(row['Source'] || '');
        trialStartDate = parseDate(row['Start Date'] || row['Registered Date'] || '');

        const attendanceCount = parseInt(row['Attendance Count'] || '0') || 0;
        const last14 = parseInt(row['Attendance Last 14 Days'] || '0') || 0;
        if (row['Custom Field 1'] && row['Custom Value 1']) {
          notes = `${row['Custom Field 1']}: ${row['Custom Value 1']}`;
        }

      } else {
        // member
        accountStatus = 'member';
        programType = normalizeProgram(row['Program'] || programOverride || '');
        membershipAge = normalizeAge(programType, row['Age'] || '', dob || '');
        ranking = normalizeRanking(row['Rank'] || '', programType);
        leadSource = normalizeLeadSource(row['Source'] || '');
        memberStartDate = parseDate(row['Registration Date'] || '');
        if (row['Custom Field 1'] && row['Custom Value 1']) {
          notes = `${row['Custom Field 1']}: ${row['Custom Value 1']}`;
        }
      }

      // Try to match a pricing plan for members
      let pricingPlanId: number | null = null;
      if (type === 'member' && row['Membership']) {
        const planName = row['Membership'].trim();
        const planMatch = await pool.query(
          `SELECT id FROM pricing_plans WHERE LOWER(name) LIKE LOWER($1) AND "isActive" = true LIMIT 1`,
          [`%${planName}%`]
        );
        if (planMatch.rows.length > 0) pricingPlanId = planMatch.rows[0].id;
      }

      const totalAttendance = parseInt(row['Total Attendance Count'] || row['Attendance Count'] || '0') || 0;
      const lastAttendance = parseDate(row['Last Attendance'] || '');

      await pool.query(
        `INSERT INTO members (
          "firstName", "lastName", email, phone, "accountStatus", "accountType",
          "programType", "membershipAge", ranking, "leadSource", "dateOfBirth",
          notes, "locationId", "trialStartDate", "memberStartDate",
          "pricingPlanId", "totalClassesAttended", "lastCheckInAt",
          "syncedFromMyStudio"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          firstName, lastName, email, phone, accountStatus, 'basic',
          programType, membershipAge, ranking, leadSource, dob,
          notes, locationId, trialStartDate, memberStartDate,
          pricingPlanId, totalAttendance || null, lastAttendance,
          true,
        ]
      );

      results.imported++;
    } catch (err: any) {
      results.errors++;
      results.errorDetails.push(err.message);
    }
  }

  res.json({
    type,
    total: rows.length,
    ...results,
    detectedHeaders: headers.slice(0, 15),
    firstErrors: results.errorDetails.slice(0, 5),
  });
});

export default router;
