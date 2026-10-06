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

    // A/B experiments that have crossed statistical significance while running —
    // stamped by the significance sweep. One alert per test, keyed by id so it
    // can be dismissed independently.
    try {
      const sigTests = await pool.query(
        `SELECT id, name, "sigWinner", "sigConfidence"
         FROM ab_tests
         WHERE status = 'running' AND "sigReachedAt" IS NOT NULL
         ORDER BY "sigReachedAt" DESC`,
      );
      for (const t of sigTests.rows) {
        const conf = t.sigConfidence != null ? `${Number(t.sigConfidence)}%` : '95%+';
        const verdict = t.sigWinner === 'A'
          ? `the control (A) is winning at ${conf} — the change didn't help`
          : `Variant ${t.sigWinner} wins at ${conf}`;
        alerts.push({
          type: `ab_sig_${t.id}`,
          message: `Experiment "${t.name}" reached statistical significance — ${verdict}. Review and decide.`,
          severity: 'info',
        });
      }
    } catch (err) {
      console.error('[alerts] AB significance check failed:', err);
    }

    res.json({ alerts });
  } catch (err: any) {
    serverError(res, err);
  }
});

export default router;
