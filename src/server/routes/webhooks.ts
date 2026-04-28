import { serverError } from '../utils/errors';
import { auditLog } from '../utils/audit';
import express from 'express';
import { pool } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { randomBytes, createHash } from 'crypto';

const router = express.Router();

const hashApiKey = (key: string): string =>
  createHash('sha256').update(key).digest('hex');

// ── API key management (authenticated) ──────────────────────────────────────

router.get('/keys', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT id, label, key_prefix, created_at, last_used_at, is_active
       FROM webhook_api_keys ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err: any) {
    serverError(res, err);
  }
});

router.post('/keys', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { label } = req.body;
    const rawKey = `ddk_${randomBytes(24).toString('hex')}`;
    const prefix = rawKey.slice(0, 12);
    const keyHash = hashApiKey(rawKey);

    const result = await pool.query(
      `INSERT INTO webhook_api_keys (label, api_key, key_prefix, created_by, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING id, label, key_prefix, created_at`,
      [label || 'Zapier', keyHash, prefix, req.user?.id || null]
    );

    await auditLog('api_key.create', req.user?.id ?? null, req, {
      keyId: result.rows[0].id,
      label: label || 'Zapier',
      prefix,
    });

    // Return raw key exactly once — never stored in plain text
    res.json({ ...result.rows[0], api_key: rawKey, showOnce: true });
  } catch (err: any) {
    serverError(res, err);
  }
});

router.delete('/keys/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await pool.query(`UPDATE webhook_api_keys SET is_active = false WHERE id = $1`, [req.params.id]);
    await auditLog('api_key.revoke', req.user?.id ?? null, req, { keyId: req.params.id });
    res.json({ success: true });
  } catch (err: any) {
    serverError(res, err);
  }
});

// ── Public Zapier webhook — no auth middleware, uses API key in header ───────

router.post('/zapier/leads', async (req, res) => {
  const apiKey = req.headers['x-api-key'] as string || req.query.api_key as string;

  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key. Pass X-Api-Key header.' });
  }

  try {
    const keyHash = hashApiKey(apiKey);
    const keyResult = await pool.query(
      `SELECT id FROM webhook_api_keys WHERE api_key = $1 AND is_active = true`,
      [keyHash]
    );
    if (keyResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or revoked API key.' });
    }

    await pool.query(
      `UPDATE webhook_api_keys SET last_used_at = NOW() WHERE id = $1`,
      [keyResult.rows[0].id]
    );

    const body = req.body;
    const firstName = (body.firstName || body.first_name || body.FirstName || '').trim();
    const lastName  = (body.lastName  || body.last_name  || body.LastName  || '').trim();
    const email     = (body.email     || body.Email      || '').trim().toLowerCase();
    const phone     = (body.phone     || body.Phone      || body.mobile    || '').trim() || null;
    const program   = (body.program   || body.programType || body.program_type || '').trim() || null;
    const source    = (body.source    || body.leadSource  || body.lead_source  || 'zapier').trim();
    const notes     = (body.notes     || body.message     || body.Notes    || '').trim() || null;
    const company   = (body.company   || body.companyName || body.studio   || '').trim() || null;

    if (!firstName || !email) {
      return res.status(400).json({ error: 'firstName and email are required.' });
    }

    const locResult = await pool.query(
      `SELECT id FROM locations WHERE "isPrimary" = true LIMIT 1`
    );
    const locationId = locResult.rows[0]?.id || null;

    const result = await pool.query(
      `INSERT INTO members (
        "firstName", "lastName", email, phone,
        "accountStatus", "accountType", "programType",
        "membershipAge", ranking, "leadSource",
        "companyName", notes, "locationId"
      ) VALUES ($1,$2,$3,$4,'lead','basic',$5,'Adult','White',$6,$7,$8,$9)
      ON CONFLICT (email) DO UPDATE SET
        "leadSource" = COALESCE(EXCLUDED."leadSource", members."leadSource"),
        "companyName" = COALESCE(EXCLUDED."companyName", members."companyName"),
        notes = COALESCE(EXCLUDED.notes, members.notes),
        "updatedAt" = NOW()
      RETURNING id, "firstName", "lastName", email, "accountStatus"`,
      [firstName, lastName, email, phone, program || 'No Program Selected', source, company, notes, locationId]
    );

    res.json({ success: true, member: result.rows[0] });
  } catch (err: any) {
    console.error('Zapier webhook error:', err);
    serverError(res, err);
  }
});

export default router;
