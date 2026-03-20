import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';
import {
  createSubscription,
  cancelSubscription,
  resumeSubscription,
  updateSubscriptionPlan
} from '../services/stripe';

const router = Router();

router.use(authenticateToken);

// Get all subscriptions
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { status, locationId, memberId } = req.query;

    let sql = `
      SELECT s.*,
             m.firstName || ' ' || m.lastName as memberName,
             m.email as memberEmail,
             p.name as planName,
             p.amount as planAmount,
             p.billingInterval as planInterval
      FROM subscriptions s
      LEFT JOIN members m ON s.memberId = m.id
      LEFT JOIN pricing_plans p ON s.pricingPlanId = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      sql += ' AND s.status = ?';
      params.push(status);
    }

    if (locationId && locationId !== 'all') {
      sql += ' AND m.locationId = ?';
      params.push(locationId);
    }

    if (memberId) {
      sql += ' AND s.memberId = ?';
      params.push(memberId);
    }

    sql += ' ORDER BY s.createdAt DESC';

    const subscriptions = await query(sql, params);
    res.json(subscriptions);
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single subscription
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const subscription = await get(
      `SELECT s.*,
              m.firstName || ' ' || m.lastName as memberName,
              m.email as memberEmail,
              p.name as planName,
              p.amount as planAmount,
              p.billingInterval as planInterval
       FROM subscriptions s
       LEFT JOIN members m ON s.memberId = m.id
       LEFT JOIN pricing_plans p ON s.pricingPlanId = p.id
       WHERE s.id = ?`,
      [req.params.id]
    );

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json(subscription);
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get subscriptions for a member
router.get('/member/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;

    const subscriptions = await query(
      `SELECT s.*,
              p.name as planName,
              p.amount as planAmount,
              p.billingInterval as planInterval
       FROM subscriptions s
       LEFT JOIN pricing_plans p ON s.pricingPlanId = p.id
       WHERE s.memberId = ?
       ORDER BY s.createdAt DESC`,
      [memberId]
    );

    res.json(subscriptions);
  } catch (error) {
    console.error('Get member subscriptions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create subscription
router.post('/', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { memberId, pricingPlanId } = req.body;

    if (!memberId || !pricingPlanId) {
      return res.status(400).json({ error: 'memberId and pricingPlanId are required' });
    }

    // Check if member exists
    const member = await get('SELECT * FROM members WHERE id = ?', [memberId]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Check if pricing plan exists
    const plan = await get('SELECT * FROM pricing_plans WHERE id = ?', [pricingPlanId]);
    if (!plan) {
      return res.status(404).json({ error: 'Pricing plan not found' });
    }

    // Check for existing active subscription
    const existingSubscription = await get(
      'SELECT * FROM subscriptions WHERE memberId = ? AND status IN (\'active\', \'trialing\')',
      [memberId]
    );
    if (existingSubscription) {
      return res.status(400).json({ error: 'Member already has an active subscription' });
    }

    const result = await createSubscription(memberId, pricingPlanId);

    if (result.success) {
      const subscription = await get(
        `SELECT s.*,
                p.name as planName,
                p.amount as planAmount,
                p.billingInterval as planInterval
         FROM subscriptions s
         LEFT JOIN pricing_plans p ON s.pricingPlanId = p.id
         WHERE s.stripeSubscriptionId = ?`,
        [result.subscriptionId]
      );

      res.status(201).json({
        subscription,
        clientSecret: result.clientSecret
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update subscription plan
router.put('/:id', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { pricingPlanId } = req.body;

    if (!pricingPlanId) {
      return res.status(400).json({ error: 'pricingPlanId is required' });
    }

    const result = await updateSubscriptionPlan(parseInt(id), pricingPlanId);

    if (result.success) {
      const subscription = await get(
        `SELECT s.*,
                p.name as planName,
                p.amount as planAmount,
                p.billingInterval as planInterval
         FROM subscriptions s
         LEFT JOIN pricing_plans p ON s.pricingPlanId = p.id
         WHERE s.id = ?`,
        [id]
      );
      res.json(subscription);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel subscription
router.post('/:id/cancel', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { immediately, reason } = req.body;

    const result = await cancelSubscription(parseInt(id), immediately === true, reason);

    if (result.success) {
      const subscription = await get('SELECT * FROM subscriptions WHERE id = ?', [id]);
      res.json(subscription);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resume subscription
router.post('/:id/resume', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await resumeSubscription(parseInt(id));

    if (result.success) {
      const subscription = await get('SELECT * FROM subscriptions WHERE id = ?', [id]);
      res.json(subscription);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Resume subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Pause subscription (sets cancel at period end)
router.post('/:id/pause', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await cancelSubscription(parseInt(id), false, 'Paused by admin');

    if (result.success) {
      const subscription = await get('SELECT * FROM subscriptions WHERE id = ?', [id]);
      res.json(subscription);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Pause subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
