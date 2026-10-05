import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { pool } from '../models/database';
import { sendPasswordResetEmail, appUrl } from '../services/transactionalEmail';

// Self-serve password reset, ported from DragonDesk: Optimize. Requests are
// deliberately opaque (always 200) so this can't be used to discover which
// accounts exist. Only the SHA-256 of a token is stored, so a database leak
// yields no usable links.

const router = Router();

const newToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

// The link's host comes from config, never the request — a forged Host header
// would otherwise send a live reset token to an attacker's domain.
const resetBase = () => appUrl(
  process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5173'
);

// Separate budgets: requesting links (email flooding) vs redeeming them, so a
// user who asked for a couple of links can still set their password.
const limiter = (max: number) => rateLimit({
  windowMs: 15 * 60 * 1000,
  max,
  message: { error: 'Too many reset requests. Please try again in 15 minutes.' },
  standardHeaders: true, legacyHeaders: false,
});
const requestLimiter = limiter(5);
const resetLimiter = limiter(10);

// Accepts an email or a username — logins are by username, which is often the
// thing that was forgotten. The email goes to the address on file either way.
router.post('/forgot-password', requestLimiter, async (req, res) => {
  const ok = { ok: true, message: 'If that matches an account, a reset link is on its way.' };
  try {
    const identifier = String(req.body.identifier || req.body.email || '').trim().toLowerCase();
    if (!identifier) return res.status(400).json({ error: 'Email or username is required' });

    const { rows } = await pool.query(
      `SELECT id, username, email FROM users WHERE lower(email) = $1 OR lower(username) = $1 LIMIT 1`,
      [identifier]
    );
    const user = rows[0];
    if (!user?.email) return res.json(ok);

    const token = newToken();
    // Supersede any outstanding link, so the newest email is the only one that works.
    await pool.query(`DELETE FROM password_resets WHERE "userId" = $1 AND "usedAt" IS NULL`, [user.id]);
    await pool.query(
      `INSERT INTO password_resets ("tokenHash", "userId", "expiresAt") VALUES ($1, $2, NOW() + interval '1 hour')`,
      [hashToken(token), user.id]
    );
    await sendPasswordResetEmail(user.email, user.username, `${resetBase()}/reset?token=${token}`);
    res.json(ok);
  } catch (error) {
    console.error('Forgot-password error:', error);
    res.json(ok); // still opaque to the caller
  }
});

// Validity probe so the reset page can show an expired/used state up front.
router.get('/reset/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.username
         FROM password_resets pr JOIN users u ON u.id = pr."userId"
        WHERE pr."tokenHash" = $1 AND pr."usedAt" IS NULL AND pr."expiresAt" > NOW()`,
      [hashToken(String(req.params.token))]
    );
    res.json({ valid: !!rows[0], username: rows[0]?.username });
  } catch (error) {
    console.error('Reset probe error:', error);
    res.json({ valid: false });
  }
});

router.post('/reset-password', resetLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Burn the token first, conditionally, so two simultaneous submits can't
    // both redeem it and a failed update below leaves no live token behind.
    const { rows } = await pool.query(
      `UPDATE password_resets SET "usedAt" = NOW()
        WHERE "tokenHash" = $1 AND "usedAt" IS NULL AND "expiresAt" > NOW()
        RETURNING "userId"`,
      [hashToken(String(token))]
    );
    if (!rows[0]) return res.status(400).json({ error: 'That reset link is invalid, expired, or already used.' });
    const { userId } = rows[0];

    const hashed = await bcrypt.hash(String(password), 12);
    await pool.query(`UPDATE users SET password = $1, "mustChangePassword" = false WHERE id = $2`, [hashed, userId]);
    await pool.query(`DELETE FROM password_resets WHERE "userId" = $1 AND "usedAt" IS NULL`, [userId]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Reset-password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
