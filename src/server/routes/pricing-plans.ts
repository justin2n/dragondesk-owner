import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';
import { createStripePrice } from '../services/stripe';

const router = Router();

router.use(authenticateToken);

// Get all pricing plans
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { locationId, isActive, accountType, programType } = req.query;

    let sql = 'SELECT * FROM pricing_plans WHERE 1=1';
    const params: any[] = [];

    if (locationId && locationId !== 'all') {
      sql += ' AND (locationId = ? OR locationId IS NULL)';
      params.push(locationId);
    }

    if (isActive !== undefined) {
      sql += ' AND isActive = ?';
      params.push(isActive === 'true' ? 1 : 0);
    }

    if (accountType) {
      sql += ' AND accountType = ?';
      params.push(accountType);
    }

    if (programType) {
      sql += ' AND (programType = ? OR programType = \'All\')';
      params.push(programType);
    }

    sql += ' ORDER BY amount ASC';

    const plans = await query(sql, params);
    res.json(plans);
  } catch (error) {
    console.error('Get pricing plans error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single pricing plan
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const plan = await get('SELECT * FROM pricing_plans WHERE id = ?', [req.params.id]);

    if (!plan) {
      return res.status(404).json({ error: 'Pricing plan not found' });
    }

    res.json(plan);
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

    const result = await run(
      `INSERT INTO pricing_plans (
        name, description, accountType, programType, membershipAge,
        amount, currency, billingInterval, intervalCount, trialDays, locationId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        locationId || null
      ]
    );

    let newPlan = await get('SELECT * FROM pricing_plans WHERE id = ?', [result.id]);

    // Sync to Stripe if requested
    if (syncToStripe) {
      const stripeResult = await createStripePrice(newPlan);
      if (stripeResult.success) {
        newPlan = await get('SELECT * FROM pricing_plans WHERE id = ?', [result.id]);
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

    const existing = await get('SELECT * FROM pricing_plans WHERE id = ?', [id]);

    if (!existing) {
      return res.status(404).json({ error: 'Pricing plan not found' });
    }

    await run(
      `UPDATE pricing_plans SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        accountType = COALESCE(?, accountType),
        programType = COALESCE(?, programType),
        membershipAge = COALESCE(?, membershipAge),
        amount = COALESCE(?, amount),
        currency = COALESCE(?, currency),
        billingInterval = COALESCE(?, billingInterval),
        intervalCount = COALESCE(?, intervalCount),
        trialDays = COALESCE(?, trialDays),
        locationId = ?,
        isActive = COALESCE(?, isActive),
        updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
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
        locationId !== undefined ? locationId : existing.locationId,
        isActive !== undefined ? (isActive ? 1 : 0) : null,
        id
      ]
    );

    const updated = await get('SELECT * FROM pricing_plans WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    console.error('Update pricing plan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sync pricing plan to Stripe (admin only)
router.post('/:id/sync', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const plan = await get('SELECT * FROM pricing_plans WHERE id = ?', [id]);

    if (!plan) {
      return res.status(404).json({ error: 'Pricing plan not found' });
    }

    const result = await createStripePrice(plan);

    if (result.success) {
      const updated = await get('SELECT * FROM pricing_plans WHERE id = ?', [id]);
      res.json({ success: true, plan: updated });
    } else {
      res.status(400).json({ success: false, error: result.error });
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

    const existing = await get('SELECT * FROM pricing_plans WHERE id = ?', [id]);

    if (!existing) {
      return res.status(404).json({ error: 'Pricing plan not found' });
    }

    // Check if plan has active subscriptions
    const activeSubscriptions = await get(
      'SELECT COUNT(*) as count FROM subscriptions WHERE pricingPlanId = ? AND status IN (\'active\', \'trialing\')',
      [id]
    );

    if (activeSubscriptions && activeSubscriptions.count > 0) {
      // Deactivate instead of delete
      await run(
        'UPDATE pricing_plans SET isActive = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );
      return res.json({ message: 'Pricing plan deactivated (has active subscriptions)' });
    }

    // Delete if no active subscriptions
    await run('DELETE FROM pricing_plans WHERE id = ?', [id]);
    res.json({ message: 'Pricing plan deleted successfully' });
  } catch (error) {
    console.error('Delete pricing plan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
