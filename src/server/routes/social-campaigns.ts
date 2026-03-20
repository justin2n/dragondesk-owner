import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// Get all social campaigns
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { locationId } = req.query;

    let sql = 'SELECT * FROM social_campaigns WHERE 1=1';
    const params: any[] = [];

    // Filter by location if specified (if not specified, return all locations)
    if (locationId && locationId !== 'all') {
      sql += ' AND locationId = ?';
      params.push(locationId);
    }

    sql += ' ORDER BY createdAt DESC';

    const campaigns = await query(sql, params);
    res.json(campaigns);
  } catch (error) {
    console.error('Get social campaigns error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single social campaign
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const campaign = await get('SELECT * FROM social_campaigns WHERE id = ?', [req.params.id]);

    if (!campaign) {
      return res.status(404).json({ error: 'Social campaign not found' });
    }

    res.json(campaign);
  } catch (error) {
    console.error('Get social campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new social campaign
router.post('/', async (req: AuthRequest, res) => {
  try {
    const {
      name,
      description,
      audienceId,
      postContent,
      mediaUrls,
      platforms,
      accountIds,
      scheduledFor,
      status
    } = req.body;

    if (!name || !postContent || !platforms || !accountIds) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    const platformsJson = JSON.stringify(platforms);
    const accountIdsJson = JSON.stringify(accountIds);
    const mediaUrlsJson = mediaUrls ? JSON.stringify(mediaUrls) : null;

    const result = await run(
      `INSERT INTO social_campaigns
        (name, description, audienceId, postContent, mediaUrls, platforms, accountIds, scheduledFor, status, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || null,
        audienceId || null,
        postContent,
        mediaUrlsJson,
        platformsJson,
        accountIdsJson,
        scheduledFor || null,
        status || 'draft',
        req.user!.id
      ]
    );

    const newCampaign = await get('SELECT * FROM social_campaigns WHERE id = ?', [result.id]);
    res.status(201).json(newCampaign);
  } catch (error) {
    console.error('Create social campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update social campaign
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      audienceId,
      postContent,
      mediaUrls,
      platforms,
      accountIds,
      scheduledFor,
      status,
      results
    } = req.body;

    const existingCampaign = await get('SELECT * FROM social_campaigns WHERE id = ?', [id]);

    if (!existingCampaign) {
      return res.status(404).json({ error: 'Social campaign not found' });
    }

    const platformsJson = JSON.stringify(platforms);
    const accountIdsJson = JSON.stringify(accountIds);
    const mediaUrlsJson = mediaUrls ? JSON.stringify(mediaUrls) : null;
    const resultsJson = results ? JSON.stringify(results) : null;

    await run(
      `UPDATE social_campaigns SET
        name = ?, description = ?, audienceId = ?, postContent = ?, mediaUrls = ?,
        platforms = ?, accountIds = ?, scheduledFor = ?, status = ?, results = ?,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        name,
        description || null,
        audienceId || null,
        postContent,
        mediaUrlsJson,
        platformsJson,
        accountIdsJson,
        scheduledFor || null,
        status,
        resultsJson,
        id
      ]
    );

    const updatedCampaign = await get('SELECT * FROM social_campaigns WHERE id = ?', [id]);
    res.json(updatedCampaign);
  } catch (error) {
    console.error('Update social campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete social campaign
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existingCampaign = await get('SELECT * FROM social_campaigns WHERE id = ?', [id]);

    if (!existingCampaign) {
      return res.status(404).json({ error: 'Social campaign not found' });
    }

    await run('DELETE FROM social_campaigns WHERE id = ?', [id]);
    res.json({ message: 'Social campaign deleted successfully' });
  } catch (error) {
    console.error('Delete social campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Publish social campaign immediately
router.post('/:id/publish', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const campaign = await get('SELECT * FROM social_campaigns WHERE id = ?', [id]);

    if (!campaign) {
      return res.status(404).json({ error: 'Social campaign not found' });
    }

    // In a real implementation, this would actually post to social media APIs
    // For now, we'll just update the status
    await run(
      `UPDATE social_campaigns SET
        status = 'published',
        publishedAt = CURRENT_TIMESTAMP,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [id]
    );

    const updatedCampaign = await get('SELECT * FROM social_campaigns WHERE id = ?', [id]);
    res.json(updatedCampaign);
  } catch (error) {
    console.error('Publish social campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
