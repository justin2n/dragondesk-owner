import express from 'express';
import { query, run } from '../models/database';

const router = express.Router();

// Track an event (view, click, lead, engagement, bounce)
router.post('/track', async (req, res) => {
  try {
    const { testId, variant, eventType, sessionId, metadata } = req.body;

    if (!testId || !variant || !eventType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Record the event
    await run(
      `INSERT INTO ab_test_events (testId, variant, eventType, sessionId, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [testId, variant, eventType, sessionId || null, metadata ? JSON.stringify(metadata) : null]
    );

    res.status(201).json({ success: true });
  } catch (error: any) {
    console.error('Error tracking event:', error);
    res.status(500).json({ error: error.message });
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

    // Get engagement time data
    const engagementData = await query(
      `SELECT
        variant,
        AVG(CAST(json_extract(metadata, '$.duration') AS INTEGER)) as avgEngagementTime
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
        DATE(createdAt) as date,
        COUNT(CASE WHEN eventType = 'view' THEN 1 END) as views,
        COUNT(CASE WHEN eventType = 'click' THEN 1 END) as clicks,
        COUNT(CASE WHEN eventType = 'lead' THEN 1 END) as leads
       FROM ab_test_events
       WHERE testId = ? AND createdAt >= datetime('now', '-30 days')
       GROUP BY variant, DATE(createdAt)
       ORDER BY date ASC`,
      [testId]
    );

    res.json({
      summary: analyticsWithEngagement,
      timeSeries: timeSeriesData,
    });
  } catch (error: any) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
        COUNT(DISTINCT DATE(createdAt)) as activeDays
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
    res.status(500).json({ error: error.message });
  }
});

export default router;
