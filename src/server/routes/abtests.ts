import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const abtests = await query('SELECT * FROM ab_tests ORDER BY createdAt DESC');
    res.json(abtests);
  } catch (error) {
    console.error('Get AB tests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const abtest = await get('SELECT * FROM ab_tests WHERE id = ?', [req.params.id]);

    if (!abtest) {
      return res.status(404).json({ error: 'AB test not found' });
    }

    res.json(abtest);
  } catch (error) {
    console.error('Get AB test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, audienceId, pageUrl, trafficSplit, variantA, variantB, status } = req.body;

    if (!name || !audienceId || !variantA || !variantB || !status) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    const audience = await get('SELECT * FROM audiences WHERE id = ?', [audienceId]);

    if (!audience) {
      return res.status(404).json({ error: 'Audience not found' });
    }

    const variantAJson = JSON.stringify(variantA);
    const variantBJson = JSON.stringify(variantB);

    const result = await run(
      'INSERT INTO ab_tests (name, audienceId, pageUrl, trafficSplit, variantA, variantB, status, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, audienceId, pageUrl || null, trafficSplit || 50, variantAJson, variantBJson, status, req.user!.id]
    );

    const newABTest = await get('SELECT * FROM ab_tests WHERE id = ?', [result.id]);
    res.status(201).json(newABTest);
  } catch (error) {
    console.error('Create AB test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, audienceId, pageUrl, trafficSplit, variantA, variantB, status, results } = req.body;

    const existingABTest = await get('SELECT * FROM ab_tests WHERE id = ?', [id]);

    if (!existingABTest) {
      return res.status(404).json({ error: 'AB test not found' });
    }

    const variantAJson = JSON.stringify(variantA);
    const variantBJson = JSON.stringify(variantB);
    const resultsJson = results ? JSON.stringify(results) : null;

    await run(
      `UPDATE ab_tests SET
        name = ?, audienceId = ?, pageUrl = ?, trafficSplit = ?, variantA = ?, variantB = ?,
        status = ?, results = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [name, audienceId, pageUrl || null, trafficSplit || 50, variantAJson, variantBJson, status, resultsJson, id]
    );

    const updatedABTest = await get('SELECT * FROM ab_tests WHERE id = ?', [id]);
    res.json(updatedABTest);
  } catch (error) {
    console.error('Update AB test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existingABTest = await get('SELECT * FROM ab_tests WHERE id = ?', [id]);

    if (!existingABTest) {
      return res.status(404).json({ error: 'AB test not found' });
    }

    await run('DELETE FROM ab_tests WHERE id = ?', [id]);
    res.json({ message: 'AB test deleted successfully' });
  } catch (error) {
    console.error('Delete AB test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
