import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// Get all social posts with comments count
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { platform, accountId, locationId } = req.query;

    let sql = `
      SELECT p.*,
        (SELECT COUNT(*) FROM social_comments WHERE postId = p.id AND isHidden = 0) as commentCount
      FROM social_posts p
      LEFT JOIN social_accounts sa ON p.accountId = sa.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Filter by location if specified (if not specified, return all locations)
    if (locationId && locationId !== 'all') {
      sql += ' AND sa.locationId = ?';
      params.push(locationId);
    }

    if (platform) {
      sql += ' AND p.platform = ?';
      params.push(platform);
    }

    if (accountId) {
      sql += ' AND p.accountId = ?';
      params.push(accountId);
    }

    sql += ' ORDER BY p.publishedAt DESC, p.createdAt DESC';

    const posts = await query(sql, params);

    // Parse mediaUrls JSON
    const parsedPosts = posts.map((post: any) => ({
      ...post,
      mediaUrls: post.mediaUrls ? JSON.parse(post.mediaUrls) : [],
    }));

    res.json(parsedPosts);
  } catch (error) {
    console.error('Get social posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single post with details
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const post = await get('SELECT * FROM social_posts WHERE id = ?', [req.params.id]);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const parsedPost = {
      ...post,
      mediaUrls: post.mediaUrls ? JSON.parse(post.mediaUrls) : [],
    };

    res.json(parsedPost);
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create or update post (typically from sync/webhook)
router.post('/', async (req: AuthRequest, res) => {
  try {
    const {
      campaignId,
      accountId,
      platform,
      platformPostId,
      postContent,
      mediaUrls,
      postUrl,
      likes,
      shares,
      comments,
      impressions,
      engagement,
      publishedAt,
    } = req.body;

    if (!accountId || !platform || !platformPostId || !postContent) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    const mediaUrlsJson = mediaUrls ? JSON.stringify(mediaUrls) : null;

    // Check if post already exists
    const existing = await get(
      'SELECT id FROM social_posts WHERE platform = ? AND platformPostId = ?',
      [platform, platformPostId]
    );

    if (existing) {
      // Update existing post
      await run(
        `UPDATE social_posts SET
          postContent = ?,
          mediaUrls = ?,
          postUrl = ?,
          likes = ?,
          shares = ?,
          comments = ?,
          impressions = ?,
          engagement = ?,
          lastSyncedAt = CURRENT_TIMESTAMP,
          updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [postContent, mediaUrlsJson, postUrl, likes || 0, shares || 0, comments || 0,
         impressions || 0, engagement || 0, existing.id]
      );

      const updatedPost = await get('SELECT * FROM social_posts WHERE id = ?', [existing.id]);
      res.json({
        ...updatedPost,
        mediaUrls: updatedPost.mediaUrls ? JSON.parse(updatedPost.mediaUrls) : [],
      });
    } else {
      // Create new post
      const result = await run(
        `INSERT INTO social_posts
        (campaignId, accountId, platform, platformPostId, postContent, mediaUrls, postUrl,
         likes, shares, comments, impressions, engagement, publishedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [campaignId, accountId, platform, platformPostId, postContent, mediaUrlsJson, postUrl,
         likes || 0, shares || 0, comments || 0, impressions || 0, engagement || 0, publishedAt]
      );

      const newPost = await get('SELECT * FROM social_posts WHERE id = ?', [result.id]);
      res.status(201).json({
        ...newPost,
        mediaUrls: newPost.mediaUrls ? JSON.parse(newPost.mediaUrls) : [],
      });
    }
  } catch (error) {
    console.error('Create/update post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sync posts from platform (placeholder - would call actual API)
router.post('/sync', async (req: AuthRequest, res) => {
  try {
    const { accountId, platform } = req.body;

    if (!accountId || !platform) {
      return res.status(400).json({ error: 'accountId and platform are required' });
    }

    // TODO: Implement actual API calls to Facebook, Instagram, Twitter
    // For now, return mock data
    res.json({
      message: 'Sync initiated',
      accountId,
      platform,
      status: 'pending',
      note: 'API integration required for actual sync'
    });
  } catch (error) {
    console.error('Sync posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete post
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const existingPost = await get('SELECT * FROM social_posts WHERE id = ?', [req.params.id]);

    if (!existingPost) {
      return res.status(404).json({ error: 'Post not found' });
    }

    await run('DELETE FROM social_posts WHERE id = ?', [req.params.id]);
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
