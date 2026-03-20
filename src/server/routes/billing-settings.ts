import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';
import { testStripeConnection, getPublishableKey } from '../services/stripe';

const router = Router();

router.use(authenticateToken);

// Get billing settings
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { locationId } = req.query;

    let settings;
    if (locationId && locationId !== 'all') {
      settings = await get(
        'SELECT * FROM billing_settings WHERE locationId = ?',
        [locationId]
      );
    }

    // Fall back to global settings
    if (!settings) {
      settings = await get(
        'SELECT * FROM billing_settings WHERE locationId IS NULL'
      );
    }

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

    // Check if settings exist
    let existing;
    if (locationId) {
      existing = await get(
        'SELECT * FROM billing_settings WHERE locationId = ?',
        [locationId]
      );
    } else {
      existing = await get(
        'SELECT * FROM billing_settings WHERE locationId IS NULL'
      );
    }

    if (existing) {
      // Update existing settings
      // Only update secret key if a new value is provided (not masked)
      const updateSecretKey = stripeSecretKey && !stripeSecretKey.includes('••••') ? stripeSecretKey : existing.stripeSecretKey;
      const updateWebhookSecret = stripeWebhookSecret && !stripeWebhookSecret.includes('••••') ? stripeWebhookSecret : existing.stripeWebhookSecret;

      await run(
        `UPDATE billing_settings SET
          stripePublishableKey = COALESCE(?, stripePublishableKey),
          stripeSecretKey = ?,
          stripeWebhookSecret = ?,
          currency = COALESCE(?, currency),
          defaultTaxRate = COALESCE(?, defaultTaxRate),
          trialDays = COALESCE(?, trialDays),
          gracePeriodDays = COALESCE(?, gracePeriodDays),
          autoRetryFailedPayments = COALESCE(?, autoRetryFailedPayments),
          sendPaymentReceipts = COALESCE(?, sendPaymentReceipts),
          sendFailedPaymentAlerts = COALESCE(?, sendFailedPaymentAlerts),
          isActive = COALESCE(?, isActive),
          updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          stripePublishableKey,
          updateSecretKey,
          updateWebhookSecret,
          currency,
          defaultTaxRate,
          trialDays,
          gracePeriodDays,
          autoRetryFailedPayments ? 1 : 0,
          sendPaymentReceipts ? 1 : 0,
          sendFailedPaymentAlerts ? 1 : 0,
          isActive ? 1 : 0,
          existing.id
        ]
      );

      const updated = await get('SELECT * FROM billing_settings WHERE id = ?', [existing.id]);
      updated.stripeSecretKey = updated.stripeSecretKey ? '••••••••' : null;
      updated.stripeWebhookSecret = updated.stripeWebhookSecret ? '••••••••' : null;
      res.json(updated);
    } else {
      // Create new settings
      const result = await run(
        `INSERT INTO billing_settings (
          locationId, stripePublishableKey, stripeSecretKey, stripeWebhookSecret,
          currency, defaultTaxRate, trialDays, gracePeriodDays,
          autoRetryFailedPayments, sendPaymentReceipts, sendFailedPaymentAlerts, isActive
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          locationId || null,
          stripePublishableKey || null,
          stripeSecretKey || null,
          stripeWebhookSecret || null,
          currency || 'usd',
          defaultTaxRate || 0,
          trialDays || 7,
          gracePeriodDays || 3,
          autoRetryFailedPayments ? 1 : 1,
          sendPaymentReceipts ? 1 : 1,
          sendFailedPaymentAlerts ? 1 : 1,
          isActive ? 1 : 1
        ]
      );

      const created = await get('SELECT * FROM billing_settings WHERE id = ?', [result.id]);
      created.stripeSecretKey = created.stripeSecretKey ? '••••••••' : null;
      created.stripeWebhookSecret = created.stripeWebhookSecret ? '••••••••' : null;
      res.status(201).json(created);
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
      let settings;
      if (locationId) {
        settings = await get(
          'SELECT stripeSecretKey FROM billing_settings WHERE locationId = ?',
          [locationId]
        );
      } else {
        settings = await get(
          'SELECT stripeSecretKey FROM billing_settings WHERE locationId IS NULL'
        );
      }

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
