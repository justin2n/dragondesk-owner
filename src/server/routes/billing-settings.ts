import { Router } from 'express';
import { pool } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';
import { testStripeConnection, getPublishableKey, invalidateStripeCache } from '../services/stripe';

const router = Router();

router.use(authenticateToken);

// Get billing settings
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { locationId } = req.query;

    let result;
    if (locationId && locationId !== 'all') {
      result = await pool.query(
        'SELECT * FROM billing_settings WHERE "locationId" = $1',
        [locationId]
      );
    }

    // Fall back to global settings
    if (!result || result.rows.length === 0) {
      result = await pool.query(
        'SELECT * FROM billing_settings WHERE "locationId" IS NULL'
      );
    }

    const settings = result.rows[0] || null;

    // Don't expose secret key to client
    if (settings) {
      settings.stripeSecretKey = settings.stripeSecretKey ? '••••••••' : null;
      settings.stripeWebhookSecret = settings.stripeWebhookSecret ? '••••••••' : null;
    }

    res.json(settings || {});
  } catch (error) {
    console.error('Get billing settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get publishable key (for client-side Stripe)
router.get('/publishable-key', async (req: AuthRequest, res) => {
  try {
    const { locationId } = req.query;
    const key = await getPublishableKey(locationId ? Number(locationId) : undefined);

    if (!key) {
      return res.status(404).json({ error: 'Stripe not configured' });
    }

    res.json({ publishableKey: key });
  } catch (error) {
    console.error('Get publishable key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update billing settings (admin only)
router.put('/', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      locationId,
      stripePublishableKey,
      stripeSecretKey,
      stripeWebhookSecret,
      currency,
      defaultTaxRate,
      trialDays,
      gracePeriodDays,
      autoRetryFailedPayments,
      sendPaymentReceipts,
      sendFailedPaymentAlerts,
      isActive
    } = req.body;

    let existingResult;
    if (locationId) {
      existingResult = await pool.query(
        'SELECT * FROM billing_settings WHERE "locationId" = $1',
        [locationId]
      );
    } else {
      existingResult = await pool.query(
        'SELECT * FROM billing_settings WHERE "locationId" IS NULL'
      );
    }

    const existing = existingResult.rows[0] || null;

    if (existing) {
      // Only update secret keys if a new (non-masked) value is provided
      const updateSecretKey = stripeSecretKey && !stripeSecretKey.includes('••••') ? stripeSecretKey : existing.stripeSecretKey;
      const updateWebhookSecret = stripeWebhookSecret && !stripeWebhookSecret.includes('••••') ? stripeWebhookSecret : existing.stripeWebhookSecret;

      await pool.query(
        `UPDATE billing_settings SET
          "stripePublishableKey" = COALESCE($1, "stripePublishableKey"),
          "stripeSecretKey" = $2,
          "stripeWebhookSecret" = $3,
          currency = COALESCE($4, currency),
          "defaultTaxRate" = COALESCE($5, "defaultTaxRate"),
          "trialDays" = COALESCE($6, "trialDays"),
          "gracePeriodDays" = COALESCE($7, "gracePeriodDays"),
          "autoRetryFailedPayments" = COALESCE($8, "autoRetryFailedPayments"),
          "sendPaymentReceipts" = COALESCE($9, "sendPaymentReceipts"),
          "sendFailedPaymentAlerts" = COALESCE($10, "sendFailedPaymentAlerts"),
          "isActive" = COALESCE($11, "isActive"),
          "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $12`,
        [
          stripePublishableKey || null,
          updateSecretKey,
          updateWebhookSecret,
          currency || null,
          defaultTaxRate != null ? defaultTaxRate : null,
          trialDays != null ? trialDays : null,
          gracePeriodDays != null ? gracePeriodDays : null,
          autoRetryFailedPayments != null ? autoRetryFailedPayments : null,
          sendPaymentReceipts != null ? sendPaymentReceipts : null,
          sendFailedPaymentAlerts != null ? sendFailedPaymentAlerts : null,
          isActive != null ? isActive : null,
          existing.id
        ]
      );

      // Invalidate the Stripe client cache for this location
      invalidateStripeCache(locationId ? Number(locationId) : undefined);

      const updated = await pool.query('SELECT * FROM billing_settings WHERE id = $1', [existing.id]);
      const row = updated.rows[0];
      row.stripeSecretKey = row.stripeSecretKey ? '••••••••' : null;
      row.stripeWebhookSecret = row.stripeWebhookSecret ? '••••••••' : null;
      res.json(row);
    } else {
      // Create new settings
      const insertResult = await pool.query(
        `INSERT INTO billing_settings (
          "locationId", "stripePublishableKey", "stripeSecretKey", "stripeWebhookSecret",
          currency, "defaultTaxRate", "trialDays", "gracePeriodDays",
          "autoRetryFailedPayments", "sendPaymentReceipts", "sendFailedPaymentAlerts", "isActive"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          locationId || null,
          stripePublishableKey || null,
          stripeSecretKey || null,
          stripeWebhookSecret || null,
          currency || 'usd',
          defaultTaxRate ?? 0,
          trialDays ?? 7,
          gracePeriodDays ?? 3,
          autoRetryFailedPayments ?? true,
          sendPaymentReceipts ?? true,
          sendFailedPaymentAlerts ?? true,
          isActive ?? true
        ]
      );

      const newId = insertResult.rows[0].id;

      // Invalidate the Stripe client cache for this location
      invalidateStripeCache(locationId ? Number(locationId) : undefined);

      const created = await pool.query('SELECT * FROM billing_settings WHERE id = $1', [newId]);
      const row = created.rows[0];
      row.stripeSecretKey = row.stripeSecretKey ? '••••••••' : null;
      row.stripeWebhookSecret = row.stripeWebhookSecret ? '••••••••' : null;
      res.status(201).json(row);
    }
  } catch (error) {
    console.error('Update billing settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test Stripe connection (admin only)
router.post('/test', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { stripeSecretKey, locationId } = req.body;

    let secretKey = stripeSecretKey;

    // If masked key provided, get real key from database
    if (!secretKey || secretKey.includes('••••')) {
      let settingsResult;
      if (locationId) {
        settingsResult = await pool.query(
          'SELECT "stripeSecretKey" FROM billing_settings WHERE "locationId" = $1',
          [locationId]
        );
      } else {
        settingsResult = await pool.query(
          'SELECT "stripeSecretKey" FROM billing_settings WHERE "locationId" IS NULL'
        );
      }

      const settings = settingsResult.rows[0] || null;
      if (!settings?.stripeSecretKey) {
        return res.status(400).json({ error: 'No Stripe secret key configured' });
      }

      secretKey = settings.stripeSecretKey;
    }

    const result = await testStripeConnection(secretKey);

    if (result.success) {
      res.json({ success: true, message: 'Successfully connected to Stripe' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Test Stripe connection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
