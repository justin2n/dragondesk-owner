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

// Active member count per program, keyed by program name. Counts ANY active
// member — account holder or participant — linked to the program either by the
// member_programs junction (participants in multiple programs) OR by their
// programType (solo adults / account holders who train). Trainees are a mix of
// both, so both paths are needed. Counts active roster (members + trialers).
// Location is resolved from the member, falling back to their account holder.
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
      SELECT p.name AS program, COUNT(DISTINCT m.id)::int AS count
      FROM programs p
      JOIN members m ON (
        m."programType" = p.name
        OR EXISTS (
          SELECT 1 FROM member_programs mp
          WHERE mp."memberId" = m.id AND mp."programId" = p.id
        )
      )
      LEFT JOIN members ah ON ah.id = m."accountHolderId"
      WHERE m."accountStatus" IN ('member', 'trialer')
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

const AGE_GROUPS = ['Kids', 'Adult', 'All'];

function normalizeAgeGroup(value: any): string {
  return AGE_GROUPS.includes(value) ? value : 'All';
}

function normalizeCents(value: any, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

// Class counts are whole numbers and a Quick Start of zero classes is
// meaningless, so floor at 1 rather than 0.
function normalizeClassCount(value: any, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : fallback;
}

router.post('/', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, description, ageGroup, quickStartPriceAmount, quickStartClassCount } = req.body;
    if (!name) return res.status(400).json({ error: 'Program name is required' });

    const existing = await pool.query('SELECT id FROM programs WHERE name = $1', [name]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Program with this name already exists' });

    const result = await pool.query(
      `INSERT INTO programs (name, description, "ageGroup", "quickStartPriceAmount", "quickStartClassCount", "isActive")
       VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
      [
        name,
        description || null,
        normalizeAgeGroup(ageGroup),
        normalizeCents(quickStartPriceAmount, 0),
        normalizeClassCount(quickStartClassCount, 3),
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    serverError(res, error);
  }
});

router.put('/:id', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description, isActive, ageGroup, quickStartPriceAmount, quickStartClassCount } = req.body;

    const existing = await pool.query('SELECT * FROM programs WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Program not found' });

    if (name && name !== existing.rows[0].name) {
      const conflict = await pool.query('SELECT id FROM programs WHERE name = $1 AND id != $2', [name, id]);
      if (conflict.rows.length > 0) return res.status(409).json({ error: 'Program with this name already exists' });
    }

    const prev = existing.rows[0];
    const result = await pool.query(
      `UPDATE programs SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        "isActive" = COALESCE($3, "isActive"),
        "ageGroup" = $4,
        "quickStartPriceAmount" = $5,
        "quickStartClassCount" = $6,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $7 RETURNING *`,
      [
        name || null,
        description || null,
        isActive !== undefined ? isActive : null,
        ageGroup !== undefined ? normalizeAgeGroup(ageGroup) : (prev.ageGroup || 'All'),
        quickStartPriceAmount !== undefined
          ? normalizeCents(quickStartPriceAmount, 0)
          : normalizeCents(prev.quickStartPriceAmount, 0),
        quickStartClassCount !== undefined
          ? normalizeClassCount(quickStartClassCount, 3)
          : normalizeClassCount(prev.quickStartClassCount, 3),
        id,
      ]
    );

    // Renaming a program must carry the denormalized primary-program name on
    // member rows with it, or program-segmented analytics silently drops them.
    if (name && name !== prev.name) {
      await pool.query(`UPDATE members SET "programType" = $1 WHERE "programType" = $2`, [name, prev.name]);
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    serverError(res, error);
  }
});

// Programs with zero references — no primary program, no enrollment, and no lead
// interest. These are the "dead" programs safe to prune (same condition the
// single-delete guard enforces, applied in bulk).
const UNUSED_PROGRAMS_SQL = `
  SELECT p.id, p.name FROM programs p
  WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m."programType" = p.name)
    AND NOT EXISTS (SELECT 1 FROM member_programs mp WHERE mp."programId" = p.id)
    AND NOT EXISTS (SELECT 1 FROM members m WHERE m."programInterestId" = p.id)
  ORDER BY p.name ASC`;

// GET /api/programs/unused — preview what a prune would remove.
router.get('/unused', authenticateToken, authorizeAdmin, async (_req: AuthRequest, res) => {
  try {
    const result = await pool.query(UNUSED_PROGRAMS_SQL);
    res.json(result.rows);
  } catch (error: any) {
    serverError(res, error);
  }
});

// POST /api/programs/prune-unused — delete every program with zero references.
router.post('/prune-unused', authenticateToken, authorizeAdmin, async (_req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM programs WHERE id IN (SELECT id FROM (${UNUSED_PROGRAMS_SQL}) u) RETURNING name`
    );
    res.json({ deleted: result.rows.length, names: result.rows.map(r => r.name) });
  } catch (error: any) {
    serverError(res, error);
  }
});

router.delete('/:id', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query('SELECT * FROM programs WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Program not found' });

    // Enrollment lives in member_programs; "programType" is the denormalized
    // primary program. Check both, or a multi-program participant slips through.
    const membersCount = await pool.query(
      `SELECT COUNT(DISTINCT m.id)::int AS count FROM members m
       WHERE m."programType" = $1
          OR EXISTS (SELECT 1 FROM member_programs mp WHERE mp."memberId" = m.id AND mp."programId" = $2)
          OR m."programInterestId" = $2`,
      [existing.rows[0].name, id]
    );
    if (membersCount.rows[0].count > 0) {
      return res.status(400).json({
        error: `Cannot delete program. ${membersCount.rows[0].count} contact(s) are enrolled or interested.`,
      });
    }

    await pool.query('DELETE FROM programs WHERE id = $1', [id]);
    res.json({ message: 'Program deleted successfully' });
  } catch (error: any) {
    serverError(res, error);
  }
});

export default router;
