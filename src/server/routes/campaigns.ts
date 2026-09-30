import { Router } from 'express';
import { query, run, get, pool } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// Live per-campaign metrics computed from campaign_recipients — the ground
// truth of who was emailed and who opened. Computed on read (not from the
// cached campaigns.* columns) so a stale/zero `sent` can never produce a bogus
// open rate, and so conversions stay current as member statuses change.
const RANK = (col: string) => `(CASE ${col} WHEN 'trialer' THEN 1 WHEN 'member' THEN 2 ELSE 0 END)`;

interface CampaignMetric { sent: number; opens: number; openRate: number; clicks: number; clickThroughRate: number; trialers: number; members: number; conversions: number; }

async function campaignMetrics(campaignIds: number[]): Promise<Map<number, CampaignMetric>> {
  const map = new Map<number, CampaignMetric>();
  if (campaignIds.length === 0) return map;
  const advanced = `${RANK('m."accountStatus"')} > ${RANK('cr."statusAtSend"')}`;
  const result = await pool.query(
    `SELECT cr."campaignId",
       COUNT(*)::int AS sent,
       COUNT(*) FILTER (WHERE cr."openedAt" IS NOT NULL)::int AS opens,
       COUNT(*) FILTER (WHERE cr."clickedAt" IS NOT NULL)::int AS clicks,
       COUNT(*) FILTER (WHERE m."accountStatus" = 'trialer' AND ${advanced})::int AS trialers,
       COUNT(*) FILTER (WHERE m."accountStatus" = 'member'  AND ${advanced})::int AS members
     FROM campaign_recipients cr
     LEFT JOIN members m ON m.id = cr."memberId"
     WHERE cr."campaignId" = ANY($1::int[])
     GROUP BY cr."campaignId"`,
    [campaignIds]
  );
  for (const row of result.rows) {
    const openRate = row.sent > 0 ? Math.round((row.opens / row.sent) * 100) : 0;
    const clickThroughRate = row.sent > 0 ? Math.round((row.clicks / row.sent) * 100) : 0;
    map.set(row.campaignId, {
      sent: row.sent, opens: row.opens, openRate, clicks: row.clicks, clickThroughRate,
      trialers: row.trialers, members: row.members, conversions: row.trialers + row.members,
    });
  }
  return map;
}

// Overlay the live metrics onto campaign rows (overriding the cached columns).
function mergeMetrics(campaigns: any[], metrics: Map<number, CampaignMetric>) {
  for (const c of campaigns) {
    const m = metrics.get(c.id);
    if (m) { c.sent = m.sent; c.opens = m.opens; c.openRate = m.openRate; c.clicks = m.clicks; c.clickThroughRate = m.clickThroughRate; c.trialers = m.trialers; c.members = m.members; c.conversions = m.conversions; }
  }
}

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { type, locationId } = req.query;

    let sql = 'SELECT * FROM campaigns WHERE 1=1';
    const params: any[] = [];

    // Filter by location if specified (if not specified, return all locations)
    if (locationId && locationId !== 'all') {
      sql += ' AND locationId = ?';
      params.push(locationId);
    }

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY createdAt DESC';

    const campaigns = await query(sql, params);

    // Overlay live metrics (sent/opens/clicks/rates/conversions) from recipients.
    mergeMetrics(campaigns, await campaignMetrics(campaigns.map((c: any) => c.id)));

    res.json(campaigns);
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const campaign = await get('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    mergeMetrics([campaign], await campaignMetrics([campaign.id]));

    res.json(campaign);
  } catch (error) {
    console.error('Get campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, type, audienceId, status, content, settings } = req.body;

    if (!name || !type || !audienceId || !status) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    const audience = await get('SELECT * FROM audiences WHERE id = ?', [audienceId]);

    if (!audience) {
      return res.status(404).json({ error: 'Audience not found' });
    }

    const contentJson = content ? JSON.stringify(content) : null;
    const settingsJson = settings ? JSON.stringify(settings) : null;

    const result = await run(
      'INSERT INTO campaigns (name, type, audienceId, status, content, settings, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, type, audienceId, status, contentJson, settingsJson, req.user!.id]
    );

    const newCampaign = await get('SELECT * FROM campaigns WHERE id = ?', [result.id]);
    res.status(201).json(newCampaign);
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      type,
      audienceId,
      status,
      content,
      settings,
      sent,
      delivered,
      opens,
      clicks,
      openRate,
      clickThroughRate,
      leads,
      trialers,
      members
    } = req.body;

    const existingCampaign = await get('SELECT * FROM campaigns WHERE id = ?', [id]);

    if (!existingCampaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const contentJson = content ? JSON.stringify(content) : null;
    const settingsJson = settings ? JSON.stringify(settings) : null;

    await run(
      `UPDATE campaigns SET
        name = ?, type = ?, audienceId = ?, status = ?,
        content = ?, settings = ?,
        sent = COALESCE(?, sent),
        delivered = COALESCE(?, delivered),
        opens = COALESCE(?, opens),
        clicks = COALESCE(?, clicks),
        openRate = COALESCE(?, openRate),
        clickThroughRate = COALESCE(?, clickThroughRate),
        leads = COALESCE(?, leads),
        trialers = COALESCE(?, trialers),
        members = COALESCE(?, members),
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        name, type, audienceId, status, contentJson, settingsJson,
        sent, delivered, opens, clicks, openRate, clickThroughRate,
        leads, trialers, members, id
      ]
    );

    const updatedCampaign = await get('SELECT * FROM campaigns WHERE id = ?', [id]);
    res.json(updatedCampaign);
  } catch (error) {
    console.error('Update campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/analytics', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      sent,
      delivered,
      opens,
      clicks,
      leads,
      trialers,
      members
    } = req.body;

    const existingCampaign = await get('SELECT * FROM campaigns WHERE id = ?', [id]);

    if (!existingCampaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Calculate rates
    const openRate = sent && sent > 0 ? ((opens || 0) / sent * 100).toFixed(2) : 0;
    const clickThroughRate = delivered && delivered > 0 ? ((clicks || 0) / delivered * 100).toFixed(2) : 0;

    await run(
      `UPDATE campaigns SET
        sent = COALESCE(?, sent),
        delivered = COALESCE(?, delivered),
        opens = COALESCE(?, opens),
        clicks = COALESCE(?, clicks),
        openRate = ?,
        clickThroughRate = ?,
        leads = COALESCE(?, leads),
        trialers = COALESCE(?, trialers),
        members = COALESCE(?, members),
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [sent, delivered, opens, clicks, openRate, clickThroughRate, leads, trialers, members, id]
    );

    const updatedCampaign = await get('SELECT * FROM campaigns WHERE id = ?', [id]);
    res.json(updatedCampaign);
  } catch (error) {
    console.error('Update campaign analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existingCampaign = await get('SELECT * FROM campaigns WHERE id = ?', [id]);

    if (!existingCampaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    await run('DELETE FROM campaigns WHERE id = ?', [id]);
    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Delete campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
