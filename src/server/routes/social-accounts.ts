import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// Get all social accounts
router.get('/', async (req: AuthRequest, res) => {
  try {
    const accounts = await query('SELECT * FROM social_accounts ORDER BY platform, accountName');
    res.json(accounts);
  } catch (error) {
    console.error('Get social accounts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single social account
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const account = await get('SELECT * FROM social_accounts WHERE id = ?', [req.params.id]);

    if (!account) {
      return res.status(404).json({ error: 'Social account not found' });
    }

    res.json(account);
  } catch (error) {
    console.error('Get social account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new social account
router.post('/', async (req: AuthRequest, res) => {
  try {
    const {
      platform,
      accountName,
      accountId,
      pageId,
      pageName,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      isActive
    } = req.body;

    if (!platform || !accountName || !accountId || !accessToken) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    const result = await run(
      `INSERT INTO social_accounts
        (platform, accountName, accountId, pageId, pageName, accessToken, refreshToken, tokenExpiresAt, isActive, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        platform,
        accountName,
        accountId,
        pageId || null,
        pageName || null,
        accessToken,
        refreshToken || null,
        tokenExpiresAt || null,
        isActive !== undefined ? isActive : 1,
        req.user!.id
      ]
    );

    const newAccount = await get('SELECT * FROM social_accounts WHERE id = ?', [result.id]);
    res.status(201).json(newAccount);
  } catch (error) {
    console.error('Create social account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update social account
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      platform,
      accountName,
      accountId,
      pageId,
      pageName,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      isActive
    } = req.body;

    const existingAccount = await get('SELECT * FROM social_accounts WHERE id = ?', [id]);

    if (!existingAccount) {
      return res.status(404).json({ error: 'Social account not found' });
    }

    await run(
      `UPDATE social_accounts SET
        platform = ?, accountName = ?, accountId = ?, pageId = ?, pageName = ?,
        accessToken = ?, refreshToken = ?, tokenExpiresAt = ?, isActive = ?,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        platform,
        accountName,
        accountId,
        pageId || null,
        pageName || null,
        accessToken,
        refreshToken || null,
        tokenExpiresAt || null,
        isActive !== undefined ? isActive : 1,
        id
      ]
    );

    const updatedAccount = await get('SELECT * FROM social_accounts WHERE id = ?', [id]);
    res.json(updatedAccount);
  } catch (error) {
    console.error('Update social account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete social account
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existingAccount = await get('SELECT * FROM social_accounts WHERE id = ?', [id]);

    if (!existingAccount) {
      return res.status(404).json({ error: 'Social account not found' });
    }

    await run('DELETE FROM social_accounts WHERE id = ?', [id]);
    res.json({ message: 'Social account deleted successfully' });
  } catch (error) {
    console.error('Delete social account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
