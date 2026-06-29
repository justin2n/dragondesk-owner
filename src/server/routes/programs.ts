import { serverError } from '../utils/errors';
import express from 'express';
import { pool } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query('SELECT * FROM programs ORDER BY name ASC');
    res.json(result.rows);
  } catch (error: any) {
    serverError(res, error);
  }
});

router.get('/active', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`SELECT * FROM programs WHERE "isActive" = true ORDER BY name ASC`);
    res.json(result.rows);
  } catch (error: any) {
    serverError(res, error);
  }
});

// Active member count per program, keyed by program name. Counts participants
// assigned to each program (member_programs junction) whose household is an
// active member — i.e. their account holder (or themselves) is accountStatus
// 'member' — excluding cancelled participants. This is the new model's truth:
// participants belong to programs; the paying member status lives on the holder.
router.get('/member-counts', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { locationId } = req.query;
    const params: any[] = [];
    let locFilter = '';
    if (locationId && locationId !== 'all') {
      params.push(locationId);
      locFilter = `AND COALESCE(m."locationId", ah."locationId") = $${params.length}::int`;
    }
    const result = await pool.query(`
      SELECT p.name AS program, COUNT(*)::int AS count
      FROM member_programs mp
      JOIN members m ON m.id = mp."memberId"
      JOIN programs p ON p.id = mp."programId"
      LEFT JOIN members ah ON ah.id = m."accountHolderId"
      WHERE m."memberType" = 'participant'
        AND m."accountStatus" <> 'cancelled'
        AND COALESCE(ah."accountStatus", m."accountStatus") = 'member'
        ${locFilter}
      GROUP BY p.name
    `, params);
    const counts: Record<string, number> = {};
    for (const r of result.rows) counts[r.program] = r.count;
    res.json(counts);
  } catch (error: any) {
    serverError(res, error);
  }
});

router.post('/', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, description, membershipId } = req.body;
    if (!name) return res.status(400).json({ error: 'Program name is required' });

    const existing = await pool.query('SELECT id FROM programs WHERE name = $1', [name]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Program with this name already exists' });

    const result = await pool.query(
      `INSERT INTO programs (name, description, "membershipId", "isActive") VALUES ($1, $2, $3, true) RETURNING *`,
      [name, description || null, membershipId || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    serverError(res, error);
  }
});

router.put('/:id', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description, isActive, membershipId } = req.body;

    const existing = await pool.query('SELECT * FROM programs WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Program not found' });

    if (name && name !== existing.rows[0].name) {
      const conflict = await pool.query('SELECT id FROM programs WHERE name = $1 AND id != $2', [name, id]);
      if (conflict.rows.length > 0) return res.status(409).json({ error: 'Program with this name already exists' });
    }

    const result = await pool.query(
      `UPDATE programs SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        "isActive" = COALESCE($3, "isActive"),
        "membershipId" = $4,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $5 RETURNING *`,
      [name || null, description || null, isActive !== undefined ? isActive : null, membershipId || null, id]
    );
    res.json(result.rows[0]);
  } catch (error: any) {
    serverError(res, error);
  }
});

router.delete('/:id', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query('SELECT * FROM programs WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Program not found' });

    const membersCount = await pool.query(
      `SELECT COUNT(*) as count FROM members WHERE "programType" = $1`,
      [existing.rows[0].name]
    );
    if (parseInt(membersCount.rows[0].count) > 0) {
      return res.status(400).json({
        error: `Cannot delete program. ${membersCount.rows[0].count} member(s) are currently enrolled.`,
      });
    }

    await pool.query('DELETE FROM programs WHERE id = $1', [id]);
    res.json({ message: 'Program deleted successfully' });
  } catch (error: any) {
    serverError(res, error);
  }
});

export default router;
