import express from 'express';
import { pool } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query('SELECT * FROM programs ORDER BY name ASC');
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/active', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`SELECT * FROM programs WHERE "isActive" = true ORDER BY name ASC`);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Program name is required' });

    const existing = await pool.query('SELECT id FROM programs WHERE name = $1', [name]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Program with this name already exists' });

    const result = await pool.query(
      `INSERT INTO programs (name, description, "isActive") VALUES ($1, $2, true) RETURNING *`,
      [name, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description, isActive } = req.body;

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
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $4 RETURNING *`,
      [name || null, description || null, isActive !== undefined ? isActive : null, id]
    );
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

export default router;
