import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// Get comments for a post
router.get('/post/:postId', async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;
    const { includeHidden, locationId } = req.query;

    let sql = `
      SELECT c.*,
        (SELECT COUNT(*) FROM social_comment_replies WHERE commentId = c.id) as ourReplyCount
      FROM social_comments c
      LEFT JOIN social_posts p ON c.postId = p.id
      LEFT JOIN social_accounts sa ON p.accountId = sa.id
      WHERE c.postId = ?
    `;
    const params: any[] = [postId];

    // Filter by location if specified (if not specified, return all locations)
    if (locationId && locationId !== 'all') {
      sql += ' AND sa.locationId = ?';
      params.push(locationId);
    }

    if (!includeHidden || includeHidden === 'false') {
      sql += ' AND c.isHidden = 0';
    }

    sql += ' ORDER BY c.commentedAt DESC';

    const comments = await query(sql, params);
    res.json(comments);
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single comment
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const comment = await get('SELECT * FROM social_comments WHERE id = ?', [req.params.id]);

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    res.json(comment);
  } catch (error) {
    console.error('Get comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create or update comment (from sync)
router.post('/', async (req: AuthRequest, res) => {
  try {
    const {
      postId,
      platform,
      platformCommentId,
      authorName,
      authorId,
      authorProfileUrl,
      authorImageUrl,
      commentText,
      likes,
      replyCount,
      parentCommentId,
      sentiment,
      commentedAt,
    } = req.body;

    if (!postId || !platform || !platformCommentId || !authorName || !authorId || !commentText || !commentedAt) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    // Check if comment already exists
    const existing = await get(
      'SELECT id FROM social_comments WHERE platform = ? AND platformCommentId = ?',
      [platform, platformCommentId]
    );

    if (existing) {
      // Update existing comment
      await run(
        `UPDATE social_comments SET
          commentText = ?,
          likes = ?,
          replyCount = ?,
          sentiment = ?,
          updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [commentText, likes || 0, replyCount || 0, sentiment, existing.id]
      );

      const updatedComment = await get('SELECT * FROM social_comments WHERE id = ?', [existing.id]);
      res.json(updatedComment);
    } else {
      // Create new comment
      const result = await run(
        `INSERT INTO social_comments
        (postId, platform, platformCommentId, authorName, authorId, authorProfileUrl,
         authorImageUrl, commentText, likes, replyCount, parentCommentId, sentiment, commentedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [postId, platform, platformCommentId, authorName, authorId, authorProfileUrl,
         authorImageUrl, commentText, likes || 0, replyCount || 0, parentCommentId, sentiment, commentedAt]
      );

      const newComment = await get('SELECT * FROM social_comments WHERE id = ?', [result.id]);
      res.status(201).json(newComment);
    }
  } catch (error) {
    console.error('Create/update comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Hide/unhide comment
router.patch('/:id/hide', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { isHidden } = req.body;

    const existingComment = await get('SELECT * FROM social_comments WHERE id = ?', [id]);

    if (!existingComment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    await run(
      'UPDATE social_comments SET isHidden = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [isHidden ? 1 : 0, id]
    );

    const updatedComment = await get('SELECT * FROM social_comments WHERE id = ?', [id]);
    res.json(updatedComment);
  } catch (error) {
    console.error('Hide comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get replies for a comment
router.get('/:id/replies', async (req: AuthRequest, res) => {
  try {
    const replies = await query(
      'SELECT * FROM social_comment_replies WHERE commentId = ? ORDER BY createdAt DESC',
      [req.params.id]
    );
    res.json(replies);
  } catch (error) {
    console.error('Get replies error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create reply to comment
router.post('/:id/reply', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { replyText, sendNow } = req.body;

    if (!replyText) {
      return res.status(400).json({ error: 'replyText is required' });
    }

    const comment = await get('SELECT * FROM social_comments WHERE id = ?', [id]);

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const status = sendNow ? 'sent' : 'draft';
    const sentAt = sendNow ? new Date().toISOString() : null;

    const result = await run(
      `INSERT INTO social_comment_replies
      (commentId, platform, replyText, status, sentAt, sentBy)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [id, comment.platform, replyText, status, sentAt, req.user!.id]
    );

    // Mark comment as replied if sent now
    if (sendNow) {
      await run(
        'UPDATE social_comments SET isReplied = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );
    }

    const newReply = await get('SELECT * FROM social_comment_replies WHERE id = ?', [result.id]);

    // TODO: If sendNow is true, actually post reply to social platform API

    res.status(201).json(newReply);
  } catch (error) {
    console.error('Reply to comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sync comments for a post (placeholder - would call actual API)
router.post('/sync', async (req: AuthRequest, res) => {
  try {
    const { postId } = req.body;

    if (!postId) {
      return res.status(400).json({ error: 'postId is required' });
    }

    const post = await get('SELECT * FROM social_posts WHERE id = ?', [postId]);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // TODO: Implement actual API calls to fetch comments from platforms
    res.json({
      message: 'Comment sync initiated',
      postId,
      platform: post.platform,
      status: 'pending',
      note: 'API integration required for actual sync'
    });
  } catch (error) {
    console.error('Sync comments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
