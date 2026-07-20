import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { buildAudienceQuery } from '../utils/audienceMembers';

const router = Router();

router.use(authenticateToken);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const audiences = await query('SELECT * FROM audiences ORDER BY createdAt DESC');
    res.json(audiences);
  } catch (error) {
    console.error('Get audiences error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const audience = await get('SELECT * FROM audiences WHERE id = ?', [req.params.id]);

    if (!audience) {
      return res.status(404).json({ error: 'Audience not found' });
    }

    res.json(audience);
  } catch (error) {
    console.error('Get audience error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/members', async (req: AuthRequest, res) => {
  try {
    const { locationId } = req.query;

    const audience = await get('SELECT * FROM audiences WHERE id = ?', [req.params.id]);

    if (!audience) {
      return res.status(404).json({ error: 'Audience not found' });
    }

    const filters = JSON.parse(audience.filters);

    // Shared with campaign sending so the preview and the actual send always
    // target the exact same members.
    const { sql, params } = buildAudienceQuery(filters, { locationId: locationId as string | undefined });
    const members = await query(sql, params);
    res.json(members);
  } catch (error) {
    console.error('Get audience members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Preview matching members for a set of filters WITHOUT saving an audience.
// Powers the live preview in the create/edit modal — uses the same
// buildAudienceQuery as the saved-audience members endpoint and campaign
// sending, so the preview always matches the eventual send.
router.post('/preview', async (req: AuthRequest, res) => {
  try {
    const { filters, locationId } = req.body;
    const { sql, params } = buildAudienceQuery(filters, { locationId: locationId as string | undefined });
    const members = await query(sql, params);
    res.json(members);
  } catch (error) {
    console.error('Preview audience error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, description, filters } = req.body;

    if (!name || !filters) {
      return res.status(400).json({ error: 'Name and filters are required' });
    }

    const filtersJson = JSON.stringify(filters);

    const result = await run(
      'INSERT INTO audiences (name, description, filters, createdBy) VALUES (?, ?, ?, ?)',
      [name, description, filtersJson, req.user!.id]
    );

    const newAudience = await get('SELECT * FROM audiences WHERE id = ?', [result.id]);
    res.status(201).json(newAudience);
  } catch (error) {
    console.error('Create audience error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description, filters } = req.body;

    const existingAudience = await get('SELECT * FROM audiences WHERE id = ?', [id]);

    if (!existingAudience) {
      return res.status(404).json({ error: 'Audience not found' });
    }

    const filtersJson = JSON.stringify(filters);

    await run(
      'UPDATE audiences SET name = ?, description = ?, filters = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [name, description, filtersJson, id]
    );

    const updatedAudience = await get('SELECT * FROM audiences WHERE id = ?', [id]);
    res.json(updatedAudience);
  } catch (error) {
    console.error('Update audience error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existingAudience = await get('SELECT * FROM audiences WHERE id = ?', [id]);

    if (!existingAudience) {
      return res.status(404).json({ error: 'Audience not found' });
    }

    await run('DELETE FROM audiences WHERE id = ?', [id]);
    res.json({ message: 'Audience deleted successfully' });
  } catch (error) {
    console.error('Delete audience error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
