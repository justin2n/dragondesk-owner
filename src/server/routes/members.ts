import { serverError } from '../utils/errors';
import { auditLog } from '../utils/audit';
import { Router } from 'express';
import { pool } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

const TRACKED_FIELDS = [
  'firstName', 'lastName', 'email', 'phone',
  'accountStatus', 'accountType', 'programType', 'membershipAge',
  'ranking', 'leadSource', 'notes', 'locationId',
  'pricingPlanId', 'membershipId', 'membershipName',
  'trialStartDate', 'memberStartDate', 'companyName',
] as const;

async function logHistory(
  memberId: number,
  action: string,
  changes: Record<string, { from: any; to: any }> | null,
  user: { id: number; firstName: string; lastName: string } | null | undefined,
  userName?: string,
) {
  const name = userName ?? (user ? `${user.firstName} ${user.lastName}`.trim() : 'System');
  await pool.query(
    `INSERT INTO member_history ("memberId", "userId", "userName", action, changes)
     VALUES ($1, $2, $3, $4, $5)`,
    [memberId, user?.id ?? null, name, action, changes ? JSON.stringify(changes) : null],
  );
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
    const { accountStatus, programType, membershipAge, accountType, locationId, search, sort } = req.query;

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

    if (search) {
      const term = `%${search}%`;
      sql += ` AND ("firstName" ILIKE $${idx} OR "lastName" ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx} OR ("firstName" || ' ' || "lastName") ILIKE $${idx})`;
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

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const result = await pool.query('SELECT * FROM members WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    res.json(result.rows[0]);
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
    } = req.body;

    if (!firstName || !lastName || !email || !accountStatus) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    const existing = await pool.query('SELECT id FROM members WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Member with this email already exists' });
    }

    const insertResult = await pool.query(
      `INSERT INTO members (
        "firstName", "lastName", email, phone, "accountStatus", "accountType",
        "programType", "membershipAge", ranking, "leadSource", "dateOfBirth", "emergencyContact",
        "emergencyPhone", notes, tags, "locationId", "trialStartDate", "memberStartDate", "pricingPlanId", "companyName"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *`,
      [
        firstName, lastName, email, phone || null, accountStatus, accountType || 'basic',
        programType || 'No Program Selected', membershipAge || 'Adult', ranking || 'White',
        leadSource || null, dateOfBirth || null, emergencyContact || null,
        emergencyPhone || null, notes || null, tags || null, locationId || null, trialStartDate || null, memberStartDate || null,
        pricingPlanId || null, companyName || null,
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
      membershipId,
      membershipName,
    } = req.body;

    const existing = await pool.query('SELECT * FROM members WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    const oldRow = existing.rows[0];

    const updateResult = await pool.query(
      `UPDATE members SET
        "firstName" = $1, "lastName" = $2, email = $3, phone = $4,
        "accountStatus" = $5, "accountType" = $6, "programType" = $7,
        "membershipAge" = $8, ranking = $9, "leadSource" = $10, "dateOfBirth" = $11,
        "emergencyContact" = $12, "emergencyPhone" = $13, notes = $14, tags = $15,
        "locationId" = $16, "trialStartDate" = $17, "memberStartDate" = $18,
        "pricingPlanId" = $19, "companyName" = $20,
        "membershipId" = $21, "membershipName" = $22,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $23
      RETURNING *`,
      [
        firstName, lastName, email, phone, accountStatus, accountType || 'basic',
        programType, membershipAge, ranking, leadSource || null, dateOfBirth || null,
        emergencyContact || null, emergencyPhone || null, notes || null, tags || null,
        locationId || null, trialStartDate || null, memberStartDate || null,
        pricingPlanId || null, companyName || null,
        membershipId || null, membershipName || null, id,
      ]
    );

    const updated = updateResult.rows[0];
    const changes = diffMember(oldRow, {
      firstName, lastName, email, phone, accountStatus, accountType,
      programType, membershipAge, ranking, leadSource, notes, locationId,
      pricingPlanId, companyName, membershipId, membershipName,
      trialStartDate, memberStartDate,
    });
    if (changes) {
      const action = changes.accountStatus ? 'status_changed' : 'updated';
      await logHistory(updated.id, action, changes, req.user).catch(() => {});
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Update member error:', error);
    serverError(res, error);
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
