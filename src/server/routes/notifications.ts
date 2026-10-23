import { Router, Response } from 'express';
import { pool } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';
import { serverError } from '../utils/errors';
import { isValidEmail } from '../utils/validate';
import { getAlertSettings, saveAlertSettings, sendTestLeadEmail } from '../services/leadAlerts';
import { platformEmailTransport } from '../services/transactionalEmail';

// In-app notifications (the sidebar bell) and new-lead alert settings.

const router = Router();
router.use(authenticateToken);

// GET /api/notifications — latest notifications plus this user's unread count
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '15'), 10) || 15, 1), 50);
    // A user who has never opened the bell starts from when their account was made.
    const seenAt = `(SELECT COALESCE("notificationsSeenAt", "createdAt") FROM users WHERE id = $1)`;
    const [list, unread] = await Promise.all([
      pool.query(
        `SELECT id, type, title, body, link, "memberId", "createdAt",
                ("createdAt" > COALESCE(${seenAt}, '-infinity')) AS unread
           FROM notifications ORDER BY "createdAt" DESC LIMIT $2`,
        [req.user!.id, limit]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS n FROM notifications WHERE "createdAt" > COALESCE(${seenAt}, '-infinity')`,
        [req.user!.id]
      ),
    ]);
    res.json({ notifications: list.rows, unread: unread.rows[0].n });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /api/notifications/seen — mark everything up to now as seen for this user
router.post('/seen', async (req: AuthRequest, res: Response) => {
  try {
    await pool.query(`UPDATE users SET "notificationsSeenAt" = NOW() WHERE id = $1`, [req.user!.id]);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
});

// GET /api/notifications/settings
router.get('/settings', async (_req: AuthRequest, res: Response) => {
  try {
    res.json({ settings: await getAlertSettings(), emailTransport: platformEmailTransport() });
  } catch (err) {
    serverError(res, err);
  }
});

// PUT /api/notifications/settings
router.put('/settings', authorizeAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { settings, invalid } = await saveAlertSettings(req.body || {}, req.user!.id);
    res.json({ settings, invalid, emailTransport: platformEmailTransport() });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /api/notifications/test-email { to?: string[] } — defaults to the saved recipients
router.post('/test-email', authorizeAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const requested: string[] = Array.isArray(req.body?.to) ? req.body.to : [];
    const to = (requested.length ? requested : (await getAlertSettings()).newLeadRecipients)
      .map(e => String(e).trim().toLowerCase())
      .filter(e => isValidEmail(e))
      .slice(0, 25);
    if (!to.length) {
      res.status(400).json({ error: 'Add at least one valid recipient email first.' });
      return;
    }
    await sendTestLeadEmail(to);
    res.json({ success: true, message: `Test alert sent to ${to.join(', ')}` });
  } catch (err: any) {
    console.error('[alerts] test email failed:', err);
    res.status(502).json({ error: err?.message || 'Failed to send test email' });
  }
});

export default router;
