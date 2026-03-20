import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';
import {
  createSetupIntent,
  attachPaymentMethod,
  detachPaymentMethod,
  getOrCreateCustomer
} from '../services/stripe';

const router = Router();

router.use(authenticateToken);

// Get payment methods for a member
router.get('/member/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;

    const paymentMethods = await query(
      `SELECT * FROM payment_methods WHERE memberId = ? ORDER BY isDefault DESC, createdAt DESC`,
      [memberId]
    );

    res.json(paymentMethods);
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single payment method
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const paymentMethod = await get(
      'SELECT * FROM payment_methods WHERE id = ?',
      [req.params.id]
    );

    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    res.json(paymentMethod);
  } catch (error) {
    console.error('Get payment method error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create setup intent for adding a payment method
router.post('/setup-intent', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.body;

    if (!memberId) {
      return res.status(400).json({ error: 'memberId is required' });
    }

    // Check if member exists
    const member = await get('SELECT * FROM members WHERE id = ?', [memberId]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const result = await createSetupIntent(memberId);

    if (result.success) {
      res.json({ clientSecret: result.clientSecret });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Create setup intent error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Attach a payment method to a member
router.post('/:paymentMethodId/attach', async (req: AuthRequest, res) => {
  try {
    const { paymentMethodId } = req.params;
    const { memberId, setAsDefault } = req.body;

    if (!memberId) {
      return res.status(400).json({ error: 'memberId is required' });
    }

    const result = await attachPaymentMethod(
      memberId,
      paymentMethodId,
      setAsDefault !== false
    );

    if (result.success) {
      const paymentMethod = await get(
        'SELECT * FROM payment_methods WHERE stripePaymentMethodId = ?',
        [paymentMethodId]
      );
      res.json(paymentMethod);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Attach payment method error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set payment method as default
router.post('/:id/default', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const paymentMethod = await get(
      'SELECT * FROM payment_methods WHERE id = ?',
      [id]
    );

    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    // Clear existing default
    await run(
      'UPDATE payment_methods SET isDefault = 0 WHERE memberId = ?',
      [paymentMethod.memberId]
    );

    // Set new default
    await run(
      'UPDATE payment_methods SET isDefault = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    // Update stripe customer
    await run(
      'UPDATE stripe_customers SET defaultPaymentMethodId = ?, updatedAt = CURRENT_TIMESTAMP WHERE memberId = ?',
      [paymentMethod.stripePaymentMethodId, paymentMethod.memberId]
    );

    const updated = await get('SELECT * FROM payment_methods WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    console.error('Set default payment method error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete/detach payment method
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const paymentMethod = await get(
      'SELECT * FROM payment_methods WHERE id = ?',
      [id]
    );

    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    const result = await detachPaymentMethod(paymentMethod.stripePaymentMethodId);

    if (result.success) {
      res.json({ message: 'Payment method removed successfully' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Delete payment method error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
