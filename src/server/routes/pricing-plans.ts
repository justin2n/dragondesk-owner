import { Router } from 'express';
import { pool } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';
import { createStripePrice } from '../services/stripe';

const router = Router();

router.use(authenticateToken);

// Get all pricing plans
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { locationId, isActive, accountType, programType } = req.query;

    const params: any[] = [];
    let sql = 'SELECT * FROM pricing_plans WHERE 1=1';

    if (locationId && locationId !== 'all') {
      params.push(locationId);
      sql += ` AND ("locationId" = $${params.length} OR "locationId" IS NULL)`;
    }

    if (isActive !== undefined) {
      params.push(isActive === 'true');
      sql += ` AND "isActive" = $${params.length}`;
    }

    if (accountType) {
      params.push(accountType);
      sql += ` AND "accountType" = $${params.length}`;
    }

    if (programType) {
      params.push(programType);
      sql += ` AND ("programType" = $${params.length} OR "programType" = 'All')`;
    }

    sql += ' ORDER BY amount ASC';

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get pricing plans error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single pricing plan
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const result = await pool.query('SELECT * FROM pricing_plans WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pricing plan not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get pricing plan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create pricing plan (admin only)
router.post('/', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      name,
      description,
      accountType,
      programType,
      membershipAge,
      amount,
      currency,
      billingInterval,
      intervalCount,
      trialDays,
      locationId,
      syncToStripe
    } = req.body;

    if (!name || !accountType || !amount || !billingInterval) {
      return res.status(400).json({ error: 'Name, accountType, amount, and billingInterval are required' });
    }

    const insertResult = await pool.query(
      `INSERT INTO pricing_plans (
        name, description, "accountType", "programType", "membershipAge",
        amount, currency, "billingInterval", "intervalCount", "trialDays", "locationId"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        name,
        description || null,
        accountType,
        programType || 'All',
        membershipAge || 'All',
        amount,
        currency || 'usd',
        billingInterval,
        intervalCount || 1,
        trialDays || 0,
        locationId || null,
      ]
    );

    let newPlan = insertResult.rows[0];

    if (syncToStripe) {
      const stripeResult = await createStripePrice(newPlan);
      if (stripeResult.success) {
        const updated = await pool.query('SELECT * FROM pricing_plans WHERE id = $1', [newPlan.id]);
        newPlan = updated.rows[0];
      }
    }

    res.status(201).json(newPlan);
  } catch (error) {
    console.error('Create pricing plan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update pricing plan (admin only)
router.put('/:id', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      accountType,
      programType,
      membershipAge,
      amount,
      currency,
      billingInterval,
      intervalCount,
      trialDays,
      locationId,
      isActive
    } = req.body;

    const existing = await pool.query('SELECT * FROM pricing_plans WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Pricing plan not found' });
    }

    const updateResult = await pool.query(
      `UPDATE pricing_plans SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        "accountType" = COALESCE($3, "accountType"),
        "programType" = COALESCE($4, "programType"),
        "membershipAge" = COALESCE($5, "membershipAge"),
        amount = COALESCE($6, amount),
        currency = COALESCE($7, currency),
        "billingInterval" = COALESCE($8, "billingInterval"),
        "intervalCount" = COALESCE($9, "intervalCount"),
        "trialDays" = COALESCE($10, "trialDays"),
        "locationId" = $11,
        "isActive" = COALESCE($12, "isActive"),
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *`,
      [
        name,
        description,
        accountType,
        programType,
        membershipAge,
        amount,
        currency,
        billingInterval,
        intervalCount,
        trialDays,
        locationId !== undefined ? locationId : existing.rows[0].locationId,
        isActive !== undefined ? isActive : null,
        id,
      ]
    );

    res.json(updateResult.rows[0]);
  } catch (error) {
    console.error('Update pricing plan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sync pricing plan to Stripe (admin only)
router.post('/:id/sync', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('SELECT * FROM pricing_plans WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pricing plan not found' });
    }

    const plan = result.rows[0];
    const stripeResult = await createStripePrice(plan);

    if (stripeResult.success) {
      const updated = await pool.query('SELECT * FROM pricing_plans WHERE id = $1', [id]);
      res.json({ success: true, plan: updated.rows[0] });
    } else {
      res.status(400).json({ success: false, error: stripeResult.error });
    }
  } catch (error) {
    console.error('Sync pricing plan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete/deactivate pricing plan (admin only)
router.delete('/:id', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query('SELECT * FROM pricing_plans WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Pricing plan not found' });
    }

    const activeSubs = await pool.query(
      `SELECT COUNT(*) AS count FROM subscriptions WHERE "pricingPlanId" = $1 AND status IN ('active', 'trialing')`,
      [id]
    );

    if (parseInt(activeSubs.rows[0].count) > 0) {
      await pool.query(
        `UPDATE pricing_plans SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );
      return res.json({ message: 'Pricing plan deactivated (has active subscriptions)' });
    }

    await pool.query('DELETE FROM pricing_plans WHERE id = $1', [id]);
    res.json({ message: 'Pricing plan deleted successfully' });
  } catch (error) {
    console.error('Delete pricing plan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
