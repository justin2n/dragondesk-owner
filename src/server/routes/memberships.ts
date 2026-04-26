import express from 'express';
import { pool } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { isActive, locationId } = req.query;
    let sql = `SELECT m.*, COALESCE(json_agg(p ORDER BY p.name) FILTER (WHERE p.id IS NOT NULL), '[]') AS programs
               FROM memberships m
               LEFT JOIN programs p ON p."membershipId" = m.id`;
    const params: any[] = [];
    const conditions: string[] = [];

    if (isActive !== undefined) {
      conditions.push(`m."isActive" = $${params.length + 1}`);
      params.push(isActive === 'true');
    }
    if (locationId) {
      conditions.push(`(m."locationId" = $${params.length + 1} OR m."locationId" IS NULL)`);
      params.push(locationId);
    }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' GROUP BY m.id ORDER BY m.name ASC';

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, description, locationId } = req.body;
    if (!name) return res.status(400).json({ error: 'Membership name is required' });

    const result = await pool.query(
      `INSERT INTO memberships (name, description, "locationId", "isActive") VALUES ($1, $2, $3, true) RETURNING *`,
      [name, description || null, locationId || null]
    );
    res.status(201).json({ ...result.rows[0], programs: [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description, locationId, isActive } = req.body;

    const existing = await pool.query('SELECT * FROM memberships WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Membership not found' });

    const result = await pool.query(
      `UPDATE memberships SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        "locationId" = $3,
        "isActive" = COALESCE($4, "isActive"),
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $5 RETURNING *`,
      [name || null, description || null, locationId || null, isActive !== undefined ? isActive : null, id]
    );
    const programs = await pool.query(`SELECT * FROM programs WHERE "membershipId" = $1 ORDER BY name ASC`, [id]);
    res.json({ ...result.rows[0], programs: programs.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM memberships WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Membership not found' });

    // Unlink programs before deleting
    await pool.query(`UPDATE programs SET "membershipId" = NULL WHERE "membershipId" = $1`, [id]);
    await pool.query('DELETE FROM memberships WHERE id = $1', [id]);
    res.json({ message: 'Membership deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
