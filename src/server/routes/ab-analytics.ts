import { serverError } from '../utils/errors';
import express from 'express';
import { query, run } from '../models/database';
import { computeSignificance } from '../utils/abStats';

const router = express.Router();

// CORS for the public tracking beacon: the site snippet posts here cross-origin
// (promo bar / offer modal views + clicks), same as /api/tracking/collect.
router.options('/track', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.status(204).end();
});

const ALLOWED_EVENT_TYPES = new Set(['view', 'click', 'lead', 'engagement', 'bounce']);
const runningTestCache = new Map<number, { ok: boolean; at: number }>();

// This endpoint is public (the site snippet posts to it cross-origin), so it's
// unauthenticated and must validate aggressively: a real running test id, a
// known event type, one variant letter, and a bounded metadata blob — otherwise
// it's an A/B-result-poisoning and storage-exhaustion sink.
router.post('/track', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  try {
    const testId = Number(req.body?.testId);
    const variant = req.body?.variant;
    const eventType = req.body?.eventType;
    const sessionId = req.body?.sessionId;
    let { metadata } = req.body || {};

    if (!Number.isInteger(testId) || testId <= 0) return res.status(400).json({ error: 'Invalid testId' });
    if (variant !== 'A' && variant !== 'B') return res.status(400).json({ error: 'Invalid variant' });
    if (!ALLOWED_EVENT_TYPES.has(eventType)) return res.status(400).json({ error: 'Invalid eventType' });

    // Only accept events for a real, running test (cached 60s to avoid a DB hit
    // per beacon). Silently 204 unknown ids so scanners learn nothing.
    const cached = runningTestCache.get(testId);
    let ok = cached && Date.now() - cached.at < 60_000 ? cached.ok : undefined;
    if (ok === undefined) {
      const rows = await query(`SELECT 1 FROM ab_tests WHERE id = ? AND status = 'running'`, [testId]);
      ok = rows.length > 0;
      runningTestCache.set(testId, { ok, at: Date.now() });
    }
    if (!ok) return res.status(204).end();

    // Cap metadata so a single beacon can't store an unbounded blob.
    let metaStr: string | null = null;
    if (metadata != null) {
      metaStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
      if (metaStr.length > 2000) metaStr = metaStr.slice(0, 2000);
    }

    await run(
      `INSERT INTO ab_test_events (testId, variant, eventType, sessionId, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [testId, variant, eventType, sessionId ? String(sessionId).slice(0, 100) : null, metaStr]
    );

    res.status(201).json({ success: true });
  } catch (error: any) {
    console.error('Error tracking event:', error);
    serverError(res, error);
  }
});

// Get analytics for a specific test
router.get('/:testId', async (req, res) => {
  try {
    const { testId } = req.params;

    // Get aggregated analytics for both variants
    const analytics = await query(
      `SELECT
        variant,
        COUNT(CASE WHEN eventType = 'view' THEN 1 END) as views,
        COUNT(CASE WHEN eventType = 'click' THEN 1 END) as clicks,
        COUNT(CASE WHEN eventType = 'lead' THEN 1 END) as leads,
        COUNT(CASE WHEN eventType = 'bounce' THEN 1 END) as bounces,
        COUNT(DISTINCT sessionId) as uniqueVisitors
       FROM ab_test_events
       WHERE testId = ?
       GROUP BY variant`,
      [testId]
    );

    // Get engagement time data. metadata is stored as JSON text, so read
    // duration via jsonb (Postgres) rather than SQLite's json_extract.
    const engagementData = await query(
      `SELECT
        variant,
        AVG((NULLIF(metadata, '')::jsonb->>'duration')::numeric) as avgEngagementTime
       FROM ab_test_events
       WHERE testId = ? AND eventType = 'engagement' AND metadata IS NOT NULL
       GROUP BY variant`,
      [testId]
    );

    // Merge engagement data into analytics
    const analyticsWithEngagement = analytics.map((a: any) => {
      const engagement = engagementData.find((e: any) => e.variant === a.variant);
      return {
        ...a,
        avgEngagementTime: engagement?.avgEngagementTime || 0,
        ctr: a.views > 0 ? ((a.clicks / a.views) * 100).toFixed(2) : '0.00',
        conversionRate: a.views > 0 ? ((a.leads / a.views) * 100).toFixed(2) : '0.00',
        bounceRate: a.views > 0 ? ((a.bounces / a.views) * 100).toFixed(2) : '0.00',
      };
    });

    // Get time series data for charts (last 30 days)
    const timeSeriesData = await query(
      `SELECT
        variant,
        (createdAt)::date as date,
        COUNT(CASE WHEN eventType = 'view' THEN 1 END) as views,
        COUNT(CASE WHEN eventType = 'click' THEN 1 END) as clicks,
        COUNT(CASE WHEN eventType = 'lead' THEN 1 END) as leads
       FROM ab_test_events
       WHERE testId = ? AND createdAt >= NOW() - INTERVAL '30 days'
       GROUP BY variant, (createdAt)::date
       ORDER BY date ASC`,
      [testId]
    );

    // Statistical significance: compare the two variants' conversion rates.
    // Conversions are 'lead' events (the goal); the denominator is views.
    const A = analytics.find((v: any) => v.variant === 'A');
    const B = analytics.find((v: any) => v.variant === 'B');
    // Recent traffic rate (combined views/day) to forecast time-to-significance.
    const days = new Set(timeSeriesData.map((r: any) => String(r.date))).size || 1;
    const totalViews = analytics.reduce((s: number, v: any) => s + Number(v.views || 0), 0);
    const dailyViews = totalViews / days;

    const significance = (A && B)
      ? computeSignificance(
          { views: Number(A.views) || 0, conversions: Number(A.leads) || 0 },
          { views: Number(B.views) || 0, conversions: Number(B.leads) || 0 },
          dailyViews,
        )
      : null;

    res.json({
      summary: analyticsWithEngagement,
      timeSeries: timeSeriesData,
      significance,
    });
  } catch (error: any) {
    console.error('Error fetching analytics:', error);
    serverError(res, error);
  }
});

// Get recent events for a test
router.get('/:testId/events', async (req, res) => {
  try {
    const { testId } = req.params;
    const { limit = 100, eventType } = req.query;

    let sql = `SELECT * FROM ab_test_events WHERE testId = ?`;
    const params: any[] = [testId];

    if (eventType) {
      sql += ` AND eventType = ?`;
      params.push(eventType);
    }

    sql += ` ORDER BY createdAt DESC LIMIT ?`;
    params.push(Number(limit));

    const events = await query(sql, params);

    res.json(events);
  } catch (error: any) {
    console.error('Error fetching events:', error);
    serverError(res, error);
  }
});

// Get comparison between variants
router.get('/:testId/comparison', async (req, res) => {
  try {
    const { testId } = req.params;

    const comparison = await query(
      `SELECT
        variant,
        COUNT(CASE WHEN eventType = 'view' THEN 1 END) as views,
        COUNT(CASE WHEN eventType = 'click' THEN 1 END) as clicks,
        COUNT(CASE WHEN eventType = 'lead' THEN 1 END) as leads,
        COUNT(DISTINCT sessionId) as uniqueVisitors,
        COUNT(DISTINCT (createdAt)::date) as activeDays
       FROM ab_test_events
       WHERE testId = ?
       GROUP BY variant`,
      [testId]
    );

    if (comparison.length === 2) {
      const [variantA, variantB] = comparison;

      const result = {
        variantA,
        variantB,
        comparison: {
          viewsDiff: variantB.views - variantA.views,
          viewsDiffPercent: variantA.views > 0 ? (((variantB.views - variantA.views) / variantA.views) * 100).toFixed(2) : '0.00',
          clicksDiff: variantB.clicks - variantA.clicks,
          clicksDiffPercent: variantA.clicks > 0 ? (((variantB.clicks - variantA.clicks) / variantA.clicks) * 100).toFixed(2) : '0.00',
          leadsDiff: variantB.leads - variantA.leads,
          leadsDiffPercent: variantA.leads > 0 ? (((variantB.leads - variantA.leads) / variantA.leads) * 100).toFixed(2) : '0.00',
        },
      };

      res.json(result);
    } else {
      res.json({ variantA: comparison[0] || {}, variantB: {}, comparison: {} });
    }
  } catch (error: any) {
    console.error('Error fetching comparison:', error);
    serverError(res, error);
  }
});

export default router;
