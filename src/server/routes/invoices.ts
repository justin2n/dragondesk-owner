import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';
import { retryInvoicePayment } from '../services/stripe';

const router = Router();

router.use(authenticateToken);

// Get all invoices
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { status, locationId, memberId, limit, offset } = req.query;

    let sql = `
      SELECT i.*,
             m.firstName || ' ' || m.lastName as memberName,
             m.email as memberEmail,
             p.name as planName
      FROM invoices i
      LEFT JOIN members m ON i.memberId = m.id
      LEFT JOIN subscriptions s ON i.subscriptionId = s.id
      LEFT JOIN pricing_plans p ON s.pricingPlanId = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      sql += ' AND i.status = ?';
      params.push(status);
    }

    if (locationId && locationId !== 'all') {
      sql += ' AND m.locationId = ?';
      params.push(locationId);
    }

    if (memberId) {
      sql += ' AND i.memberId = ?';
      params.push(memberId);
    }

    sql += ' ORDER BY i.createdAt DESC';

    if (limit) {
      sql += ' LIMIT ?';
      params.push(parseInt(limit as string));
    }

    if (offset) {
      sql += ' OFFSET ?';
      params.push(parseInt(offset as string));
    }

    const invoices = await query(sql, params);
    res.json(invoices);
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get invoice stats
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const { locationId } = req.query;

    let locationFilter = '';
    const params: any[] = [];

    if (locationId && locationId !== 'all') {
      locationFilter = ' AND m.locationId = ?';
      params.push(locationId);
    }

    // Get total paid this month
    const paidThisMonth = await get(
      `SELECT SUM(amountPaid) as total FROM invoices i
       LEFT JOIN members m ON i.memberId = m.id
       WHERE i.status = 'paid'
       AND i.paidAt >= date('now', 'start of month')
       ${locationFilter}`,
      params
    );

    // Get total outstanding
    const outstanding = await get(
      `SELECT SUM(amountRemaining) as total FROM invoices i
       LEFT JOIN members m ON i.memberId = m.id
       WHERE i.status IN ('open', 'past_due')
       ${locationFilter}`,
      params
    );

    // Get failed payments count
    const failed = await get(
      `SELECT COUNT(*) as count FROM invoices i
       LEFT JOIN members m ON i.memberId = m.id
       WHERE i.status = 'open' AND i.attemptCount > 0
       ${locationFilter}`,
      params
    );

    res.json({
      paidThisMonth: paidThisMonth?.total || 0,
      outstanding: outstanding?.total || 0,
      failedPaymentsCount: failed?.count || 0
    });
  } catch (error) {
    console.error('Get invoice stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single invoice
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const invoice = await get(
      `SELECT i.*,
              m.firstName || ' ' || m.lastName as memberName,
              m.email as memberEmail,
              p.name as planName
       FROM invoices i
       LEFT JOIN members m ON i.memberId = m.id
       LEFT JOIN subscriptions s ON i.subscriptionId = s.id
       LEFT JOIN pricing_plans p ON s.pricingPlanId = p.id
       WHERE i.id = ?`,
      [req.params.id]
    );

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get invoices for a member
router.get('/member/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;
    const { limit } = req.query;

    let sql = `
      SELECT i.*,
             p.name as planName
      FROM invoices i
      LEFT JOIN subscriptions s ON i.subscriptionId = s.id
      LEFT JOIN pricing_plans p ON s.pricingPlanId = p.id
      WHERE i.memberId = ?
      ORDER BY i.createdAt DESC
    `;
    const params: any[] = [memberId];

    if (limit) {
      sql += ' LIMIT ?';
      params.push(parseInt(limit as string));
    }

    const invoices = await query(sql, params);
    res.json(invoices);
  } catch (error) {
    console.error('Get member invoices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Retry invoice payment
router.post('/:id/pay', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await retryInvoicePayment(parseInt(id));

    if (result.success) {
      const invoice = await get('SELECT * FROM invoices WHERE id = ?', [id]);
      res.json(invoice);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Retry invoice payment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Void an invoice
router.post('/:id/void', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const invoice = await get('SELECT * FROM invoices WHERE id = ?', [id]);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Cannot void a paid invoice' });
    }

    await run(
      `UPDATE invoices SET status = 'void', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );

    const updated = await get('SELECT * FROM invoices WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    console.error('Void invoice error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
