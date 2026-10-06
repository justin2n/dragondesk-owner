import { Router } from 'express';
import { pool } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';
import { getStripe } from '../services/stripe';
import { serverError } from '../utils/errors';

const router = Router();

// ── Products ─────────────────────────────────────────────────────────────────

router.get('/products', async (req, res) => {
  try {
    const { locationId, category, activeOnly } = req.query;
    let sql = `SELECT * FROM pos_products WHERE 1=1`;
    const params: any[] = [];
    let i = 1;

    if (activeOnly !== 'false') {
      sql += ` AND "isActive" = true`;
    }
    if (locationId) {
      sql += ` AND ("locationId" = $${i} OR "locationId" IS NULL)`;
      params.push(locationId); i++;
    }
    if (category) {
      sql += ` AND category = $${i}`;
      params.push(category); i++;
    }
    sql += ` ORDER BY category ASC, name ASC`;

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err: any) {
    serverError(res, err);
  }
});

router.post('/products', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, description, price, sku, category, imageUrl, isActive, inventory, locationId } = req.body;
    if (!name || price == null) return res.status(400).json({ error: 'name and price are required' });

    const result = await pool.query(
      `INSERT INTO pos_products (name, description, price, sku, category, "imageUrl", "isActive", inventory, "locationId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, description || null, Math.round(price), sku || null, category || 'General',
       imageUrl || null, isActive !== false, inventory != null ? parseInt(inventory) : null,
       locationId || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    serverError(res, err);
  }
});

router.put('/products/:id', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, description, price, sku, category, imageUrl, isActive, inventory, locationId } = req.body;
    const result = await pool.query(
      `UPDATE pos_products SET
         name = COALESCE($1, name),
         description = $2,
         price = COALESCE($3, price),
         sku = $4,
         category = COALESCE($5, category),
         "imageUrl" = $6,
         "isActive" = COALESCE($7, "isActive"),
         inventory = $8,
         "locationId" = $9,
         "updatedAt" = NOW()
       WHERE id = $10 RETURNING *`,
      [name, description ?? null, price != null ? Math.round(price) : null,
       sku ?? null, category ?? null, imageUrl ?? null,
       isActive !== undefined ? isActive : null,
       inventory != null ? parseInt(inventory) : null,
       locationId ?? null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err: any) {
    serverError(res, err);
  }
});

router.delete('/products/:id', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    await pool.query(`UPDATE pos_products SET "isActive" = false WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    serverError(res, err);
  }
});

// ── Stripe Terminal ──────────────────────────────────────────────────────────

router.post('/connection-token', async (req, res) => {
  try {
    const { locationId } = req.body;
    const stripe = await getStripe(locationId);
    const token = await stripe.terminal.connectionTokens.create();
    res.json({ secret: token.secret });
  } catch (err: any) {
    serverError(res, err);
  }
});

router.post('/payment-intent', async (req, res) => {
  try {
    const { amount, locationId, method } = req.body;
    if (!amount || amount < 50) return res.status(400).json({ error: 'amount must be at least 50 cents' });

    const stripe = await getStripe(locationId);

    if (method === 'terminal') {
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amount),
        currency: 'usd',
        payment_method_types: ['card_present'],
        capture_method: 'manual',
      });
      return res.json({ clientSecret: intent.client_secret, id: intent.id });
    }

    // Online card (Stripe Elements)
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: 'usd',
      payment_method_types: ['card'],
      capture_method: 'automatic',
    });
    res.json({ clientSecret: intent.client_secret, id: intent.id });
  } catch (err: any) {
    serverError(res, err);
  }
});

router.post('/capture-payment/:intentId', async (req, res) => {
  try {
    const { locationId } = req.body;
    const stripe = await getStripe(locationId);
    const intent = await stripe.paymentIntents.capture(req.params.intentId);
    res.json({ status: intent.status });
  } catch (err: any) {
    serverError(res, err);
  }
});

// ── Transactions ─────────────────────────────────────────────────────────────

router.post('/transactions', async (req, res) => {
  try {
    const { locationId, memberId, items, subtotal, tax, total, paymentMethod,
            stripePaymentIntentId, cashReceived, changeGiven, notes } = req.body;

    if (!items?.length || !total || !paymentMethod) {
      return res.status(400).json({ error: 'items, total, and paymentMethod are required' });
    }

    const txResult = await pool.query(
      `INSERT INTO pos_transactions
         ("locationId","memberId",subtotal,tax,total,"paymentMethod","stripePaymentIntentId",
          status,"cashReceived","changeGiven",notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'completed',$8,$9,$10) RETURNING *`,
      [locationId || null, memberId || null,
       Math.round(subtotal), Math.round(tax || 0), Math.round(total),
       paymentMethod, stripePaymentIntentId || null,
       cashReceived ? Math.round(cashReceived) : null,
       changeGiven ? Math.round(changeGiven) : null,
       notes || null]
    );
    const tx = txResult.rows[0];

    // Insert line items and decrement inventory
    for (const item of items) {
      await pool.query(
        `INSERT INTO pos_transaction_items
           ("transactionId","productId","productName","productPrice",quantity,subtotal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [tx.id, item.productId || null, item.productName,
         Math.round(item.productPrice), item.quantity,
         Math.round(item.productPrice * item.quantity)]
      );
      if (item.productId) {
        await pool.query(
          `UPDATE pos_products SET inventory = GREATEST(inventory - $1, 0)
           WHERE id = $2 AND inventory IS NOT NULL`,
          [item.quantity, item.productId]
        );
      }
    }

    res.status(201).json(tx);
  } catch (err: any) {
    serverError(res, err);
  }
});

router.get('/transactions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { locationId, limit = 50, offset = 0 } = req.query;
    let sql = `
      SELECT t.*,
        m."firstName" || ' ' || m."lastName" AS "memberName",
        json_agg(json_build_object(
          'id', i.id, 'productName', i."productName",
          'productPrice', i."productPrice", 'quantity', i.quantity,
          'subtotal', i.subtotal
        )) AS items
      FROM pos_transactions t
      LEFT JOIN members m ON m.id = t."memberId"
      LEFT JOIN pos_transaction_items i ON i."transactionId" = t.id
      WHERE 1=1`;
    const params: any[] = [];
    let p = 1;

    if (locationId) { sql += ` AND t."locationId" = $${p++}`; params.push(locationId); }
    sql += ` GROUP BY t.id, m."firstName", m."lastName"`;
    sql += ` ORDER BY t."createdAt" DESC LIMIT $${p++} OFFSET $${p++}`;
    params.push(limit, offset);

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err: any) {
    serverError(res, err);
  }
});

router.post('/transactions/:id/void', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      `UPDATE pos_transactions SET status = 'voided' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json(result.rows[0]);
  } catch (err: any) {
    serverError(res, err);
  }
});

export default router;
