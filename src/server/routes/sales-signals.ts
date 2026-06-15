import express from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../models/database';

const router = express.Router();

router.use(authenticateToken);

// GET /api/sales-signals?threshold=10&hours=24
// Returns identified visitors who exceeded the event threshold in the window
router.get('/', async (req: AuthRequest, res) => {
  try {
    const threshold = parseInt(req.query.threshold as string) || 10;
    const hours = parseInt(req.query.hours as string) || 24;

    const result = await pool.query(`
      SELECT
        tv."visitorId",
        tv.token,
        tv."lastSeen",
        vi.value                                  AS email,
        vi."memberId",
        m.id                                      AS "memberTableId",
        m."firstName",
        m."lastName",
        m.phone,
        m."programType",
        m."accountStatus",
        COUNT(te.id)                              AS "recentEventCount",
        MAX(te."createdAt")                       AS "lastActivity",
        array_agg(DISTINCT te."pagePath")
          FILTER (WHERE te."eventType" = 'pageview'
                    AND te."pagePath" IS NOT NULL) AS "recentPages"
      FROM tracking_visitors tv
      JOIN visitor_identities vi
        ON  vi."visitorId" = tv."visitorId"
        AND vi.token       = tv.token
        AND vi.type        = 'email'
      JOIN tracking_events te
        ON  te."visitorId" = tv."visitorId"
        AND te.token       = tv.token
        AND te."createdAt" >= NOW() - ($2 || ' hours')::interval
      LEFT JOIN members m ON m.id = vi."memberId"
      GROUP BY
        tv."visitorId", tv.token, tv."lastSeen",
        vi.value, vi."memberId",
        m.id, m."firstName", m."lastName", m.phone, m."programType", m."accountStatus"
      HAVING COUNT(te.id) > $1
      ORDER BY COUNT(te.id) DESC, MAX(te."createdAt") DESC
      LIMIT 100
    `, [threshold, hours]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sales signals:', error);
    res.status(500).json({ error: 'Failed to fetch sales signals' });
  }
});

// GET /api/sales-signals/count — lightweight, used for sidebar badge
router.get('/count', async (req: AuthRequest, res) => {
  try {
    const threshold = parseInt(req.query.threshold as string) || 10;
    const hours = parseInt(req.query.hours as string) || 24;

    const result = await pool.query(`
      SELECT COUNT(*) AS count
      FROM (
        SELECT tv."visitorId"
        FROM tracking_visitors tv
        JOIN visitor_identities vi
          ON  vi."visitorId" = tv."visitorId"
          AND vi.token       = tv.token
          AND vi.type        = 'email'
        JOIN tracking_events te
          ON  te."visitorId" = tv."visitorId"
          AND te.token       = tv.token
          AND te."createdAt" >= NOW() - ($2 || ' hours')::interval
        GROUP BY tv."visitorId", tv.token
        HAVING COUNT(te.id) > $1
      ) hot
    `, [threshold, hours]);

    res.json({ count: parseInt(result.rows[0].count) || 0 });
  } catch (error) {
    console.error('Error fetching signal count:', error);
    res.json({ count: 0 });
  }
});

export default router;
