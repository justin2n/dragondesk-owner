import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Member } from '../types';

const router = Router();

router.use(authenticateToken);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { accountStatus, programType, membershipAge, accountType, locationId } = req.query;

    let sql = 'SELECT * FROM members WHERE 1=1';
    const params: any[] = [];

    // Filter by location if specified (if not specified, return all locations)
    if (locationId && locationId !== 'all') {
      sql += ' AND "locationId" = ?';
      params.push(locationId);
    }

    if (accountStatus) {
      sql += ' AND "accountStatus" = ?';
      params.push(accountStatus);
    }

    if (programType) {
      sql += ' AND "programType" = ?';
      params.push(programType);
    }

    if (membershipAge) {
      sql += ' AND "membershipAge" = ?';
      params.push(membershipAge);
    }

    if (accountType) {
      sql += ' AND "accountType" = ?';
      params.push(accountType);
    }

    sql += ' ORDER BY "createdAt" DESC';

    const members = await query(sql, params);
    res.json(members);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const member = await get('SELECT * FROM members WHERE id = ?', [req.params.id]);

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

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
    } = req.body;

    if (!firstName || !lastName || !email || !accountStatus || !accountType || !programType || !membershipAge || !ranking) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    const existingMember = await get('SELECT id FROM members WHERE email = ?', [email]);

    if (existingMember) {
      return res.status(409).json({ error: 'Member with this email already exists' });
    }

    const result = await run(
      `INSERT INTO members (
        "firstName", "lastName", email, phone, "accountStatus", "accountType",
        "programType", "membershipAge", ranking, "leadSource", "dateOfBirth", "emergencyContact",
        "emergencyPhone", notes, tags, "locationId", "trialStartDate", "memberStartDate"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        firstName, lastName, email, phone, accountStatus, accountType,
        programType, membershipAge, ranking, leadSource || null, dateOfBirth, emergencyContact,
        emergencyPhone, notes, tags, locationId || null, trialStartDate || null, memberStartDate || null
      ]
    );

    const newMember = await get('SELECT * FROM members WHERE id = ?', [result.id]);
    res.status(201).json(newMember);
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
    } = req.body;

    const existingMember = await get('SELECT * FROM members WHERE id = ?', [id]);

    if (!existingMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    await run(
      `UPDATE members SET
        "firstName" = ?, "lastName" = ?, email = ?, phone = ?,
        "accountStatus" = ?, "accountType" = ?, "programType" = ?,
        "membershipAge" = ?, ranking = ?, "leadSource" = ?, "dateOfBirth" = ?,
        "emergencyContact" = ?, "emergencyPhone" = ?, notes = ?, tags = ?,
        "locationId" = ?, "trialStartDate" = ?, "memberStartDate" = ?, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        firstName, lastName, email, phone, accountStatus, accountType,
        programType, membershipAge, ranking, leadSource || null, dateOfBirth, emergencyContact,
        emergencyPhone, notes, tags, locationId || null, trialStartDate || null, memberStartDate || null, id
      ]
    );

    const updatedMember = await get('SELECT * FROM members WHERE id = ?', [id]);
    res.json(updatedMember);
  } catch (error: any) {
    console.error('Update member error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existingMember = await get('SELECT * FROM members WHERE id = ?', [id]);

    if (!existingMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    await run('DELETE FROM members WHERE id = ?', [id]);
    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
