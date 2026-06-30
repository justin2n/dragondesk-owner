import { serverError } from '../utils/errors';
import express from 'express';
import { pool } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query('SELECT * FROM trial_programs ORDER BY name ASC');
    res.json(result.rows);
  } catch (error: any) {
    serverError(res, error);
  }
});

router.get('/active', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`SELECT * FROM trial_programs WHERE "isActive" = true ORDER BY name ASC`);
    res.json(result.rows);
  } catch (error: any) {
    serverError(res, error);
  }
});

router.post('/', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Trial program name is required' });

    const existing = await pool.query('SELECT id FROM trial_programs WHERE name = $1', [name.trim()]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Trial program with this name already exists' });

    const result = await pool.query(
      `INSERT INTO trial_programs (name, "isActive") VALUES ($1, true) RETURNING *`,
      [name.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    serverError(res, error);
  }
});

router.delete('/:id', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT id FROM trial_programs WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Trial program not found' });

    // Members referencing it are detached automatically (FK ON DELETE SET NULL).
    await pool.query('DELETE FROM trial_programs WHERE id = $1', [id]);
    res.json({ message: 'Trial program deleted successfully' });
  } catch (error: any) {
    serverError(res, error);
  }
});

export default router;
