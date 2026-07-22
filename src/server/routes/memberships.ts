import { serverError } from '../utils/errors';
import express from 'express';
import { pool } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Membership types are the priced licenses an account holder buys — one seat per
// participant they cover (see membership_seats). "maxProgramsPerParticipant"
// NULL = unlimited; "isFamilyPlan" means one seat covers the whole account.
// Which programs a seat can be used for is NOT restricted — only how many.

// A blank/0/negative program limit means unlimited. Family plans are always
// unlimited, since the whole point is "any martial art, as often as you like".
function normalizeProgramLimit(value: any, isFamilyPlan: boolean): number | null {
  if (isFamilyPlan) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { isActive, locationId } = req.query;
    let sql = `SELECT * FROM memberships`;
    const params: any[] = [];
    const conditions: string[] = [];

    if (isActive !== undefined) {
      conditions.push(`"isActive" = $${params.length + 1}`);
      params.push(isActive === 'true');
    }
    if (locationId) {
      conditions.push(`("locationId" = $${params.length + 1} OR "locationId" IS NULL)`);
      params.push(locationId);
    }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY "priceAmount" ASC, name ASC';

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (error: any) {
    serverError(res, error);
  }
});

router.post('/', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, description, locationId, priceAmount, isFamilyPlan, maxProgramsPerParticipant } = req.body;
    if (!name) return res.status(400).json({ error: 'Membership name is required' });

    const family = isFamilyPlan === true;
    const result = await pool.query(
      `INSERT INTO memberships (name, description, "locationId", "priceAmount", "isFamilyPlan", "maxProgramsPerParticipant", "isActive")
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *`,
      [
        name,
        description || null,
        locationId || null,
        Number.isFinite(priceAmount) ? Math.round(priceAmount) : 0,
        family,
        normalizeProgramLimit(maxProgramsPerParticipant, family),
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
    const { name, description, locationId, isActive, priceAmount, isFamilyPlan, maxProgramsPerParticipant } = req.body;

    const existing = await pool.query('SELECT * FROM memberships WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Membership not found' });

    const family = isFamilyPlan !== undefined ? isFamilyPlan === true : existing.rows[0].isFamilyPlan === true;
    // Program limit is nullable, so COALESCE can't express "leave it alone" —
    // fall back to the stored value when the field is omitted entirely.
    const limit = maxProgramsPerParticipant !== undefined
      ? normalizeProgramLimit(maxProgramsPerParticipant, family)
      : normalizeProgramLimit(existing.rows[0].maxProgramsPerParticipant, family);

    const result = await pool.query(
      `UPDATE memberships SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        "locationId" = $3,
        "isActive" = COALESCE($4, "isActive"),
        "priceAmount" = COALESCE($5, "priceAmount"),
        "isFamilyPlan" = $6,
        "maxProgramsPerParticipant" = $7,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $8 RETURNING *`,
      [
        name || null,
        description || null,
        locationId || null,
        isActive !== undefined ? isActive : null,
        Number.isFinite(priceAmount) ? Math.round(priceAmount) : null,
        family,
        limit,
        id,
      ]
    );
    res.json(result.rows[0]);
  } catch (error: any) {
    serverError(res, error);
  }
});

router.delete('/:id', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM memberships WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Membership not found' });

    // Seats reference memberships with ON DELETE RESTRICT — deleting a plan that
    // people are actively paying for would silently break MRR, so block it and
    // tell the admin to deactivate instead.
    const seats = await pool.query(
      `SELECT COUNT(*)::int AS count FROM membership_seats WHERE "membershipId" = $1 AND status = 'active'`,
      [id]
    );
    if (seats.rows[0].count > 0) {
      return res.status(409).json({
        error: `${seats.rows[0].count} active seat(s) still use this membership. Reassign them or mark the plan inactive instead of deleting it.`,
      });
    }

    await pool.query('DELETE FROM memberships WHERE id = $1', [id]);
    res.json({ message: 'Membership deleted successfully' });
  } catch (error: any) {
    serverError(res, error);
  }
});

export default router;
