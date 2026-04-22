import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { AudienceFilter } from '../types';

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

    const filters: AudienceFilter = JSON.parse(audience.filters);

    let sql = 'SELECT * FROM members WHERE 1=1';
    const params: any[] = [];

    // Filter by locationIds stored in audience filters (saved with audience definition)
    if (filters.locationIds && filters.locationIds.length > 0) {
      sql += ` AND "locationId" IN (${filters.locationIds.map(() => '?').join(',')})`;
      params.push(...filters.locationIds);
    } else if (locationId && locationId !== 'all') {
      // Fallback: filter by query param for ad-hoc queries
      sql += ' AND "locationId" = ?';
      params.push(locationId);
    }

    if (filters.accountStatus && filters.accountStatus.length > 0) {
      sql += ` AND accountStatus IN (${filters.accountStatus.map(() => '?').join(',')})`;
      params.push(...filters.accountStatus);
    }

    if (filters.accountType && filters.accountType.length > 0) {
      sql += ` AND accountType IN (${filters.accountType.map(() => '?').join(',')})`;
      params.push(...filters.accountType);
    }

    if (filters.programType && filters.programType.length > 0) {
      sql += ` AND programType IN (${filters.programType.map(() => '?').join(',')})`;
      params.push(...filters.programType);
    }

    if (filters.membershipAge && filters.membershipAge.length > 0) {
      sql += ` AND membershipAge IN (${filters.membershipAge.map(() => '?').join(',')})`;
      params.push(...filters.membershipAge);
    }

    if (filters.ranking && filters.ranking.length > 0) {
      sql += ` AND ranking IN (${filters.ranking.map(() => '?').join(',')})`;
      params.push(...filters.ranking);
    }

    if (filters.leadSource && filters.leadSource.length > 0) {
      sql += ` AND leadSource IN (${filters.leadSource.map(() => '?').join(',')})`;
      params.push(...filters.leadSource);
    }

    if (filters.tags && filters.tags.length > 0) {
      const tagConditions = filters.tags.map(() => 'tags LIKE ?').join(' OR ');
      sql += ` AND (${tagConditions})`;
      params.push(...filters.tags.map(tag => `%${tag}%`));
    }

    const members = await query(sql, params);
    res.json(members);
  } catch (error) {
    console.error('Get audience members error:', error);
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
