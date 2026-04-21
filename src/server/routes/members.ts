import { Router } from 'express';
import { pool } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { accountStatus, programType, membershipAge, accountType, locationId } = req.query;

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

    sql += ' ORDER BY "createdAt" DESC';

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

    res.status(201).json(insertResult.rows[0]);
  } catch (error: any) {
    console.error('Create member error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
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
    } = req.body;

    const existing = await pool.query('SELECT id FROM members WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const updateResult = await pool.query(
      `UPDATE members SET
        "firstName" = $1, "lastName" = $2, email = $3, phone = $4,
        "accountStatus" = $5, "accountType" = $6, "programType" = $7,
        "membershipAge" = $8, ranking = $9, "leadSource" = $10, "dateOfBirth" = $11,
        "emergencyContact" = $12, "emergencyPhone" = $13, notes = $14, tags = $15,
        "locationId" = $16, "trialStartDate" = $17, "memberStartDate" = $18,
        "pricingPlanId" = $19, "companyName" = $20, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $21
      RETURNING *`,
      [
        firstName, lastName, email, phone, accountStatus, accountType || 'basic',
        programType, membershipAge, ranking, leadSource || null, dateOfBirth || null,
        emergencyContact || null, emergencyPhone || null, notes || null, tags || null,
        locationId || null, trialStartDate || null, memberStartDate || null,
        pricingPlanId || null, companyName || null, id,
      ]
    );

    res.json(updateResult.rows[0]);
  } catch (error: any) {
    console.error('Update member error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query('SELECT id FROM members WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    await pool.query('DELETE FROM members WHERE id = $1', [id]);
    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
