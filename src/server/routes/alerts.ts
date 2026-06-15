import { serverError } from '../utils/errors';
import express from 'express';
import { pool } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

interface Alert {
  type: string;
  message: string;
  severity: 'warning' | 'error' | 'info';
}

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const alerts: Alert[] = [];

    // Check if Zapier is configured (active API keys exist)
    const keyResult = await pool.query(
      `SELECT COUNT(*) FROM webhook_api_keys WHERE is_active = true`
    );
    const zapierConfigured = parseInt(keyResult.rows[0].count) > 0;

    if (zapierConfigured) {
      let hasRecentActivity = false;
      try {
        // Prefer the webhook log (added recently) — counts ALL hits including duplicates
        const logResult = await pool.query(
          `SELECT COUNT(*) FROM zapier_webhook_log
           WHERE "receivedAt" >= NOW() - INTERVAL '24 hours'`
        );
        hasRecentActivity = parseInt(logResult.rows[0].count) > 0;
      } catch {
        // Fallback: check members table for recently created Zapier contacts
        const fallback = await pool.query(
          `SELECT COUNT(*) FROM members
           WHERE "leadSource" = 'zapier' AND "createdAt" >= NOW() - INTERVAL '24 hours'`
        );
        hasRecentActivity = parseInt(fallback.rows[0].count) > 0;
      }

      if (!hasRecentActivity) {
        alerts.push({
          type: 'zapier_silence',
          message: 'No Zapier leads received in the last 24 hours. Check your Zap is active.',
          severity: 'warning',
        });
      }
    }

    res.json({ alerts });
  } catch (err: any) {
    serverError(res, err);
  }
});

export default router;
