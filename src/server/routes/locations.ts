import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// Get all locations
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { isActive } = req.query;

    let sql = 'SELECT * FROM locations WHERE 1=1';
    const params: any[] = [];

    if (isActive !== undefined) {
      sql += ' AND isActive = ?';
      params.push(isActive === 'true' ? 1 : 0);
    }

    sql += ' ORDER BY isPrimary DESC, name ASC';

    const locations = await query(sql, params);
    res.json(locations);
  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single location
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const location = await get('SELECT * FROM locations WHERE id = ?', [req.params.id]);

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Parse settings if they exist
    if (location.settings) {
      location.settings = JSON.parse(location.settings);
    }

    res.json(location);
  } catch (error) {
    console.error('Get location error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create location (admin only)
router.post('/', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      name,
      address,
      city,
      state,
      zipCode,
      country,
      phone,
      email,
      timezone,
      isActive,
      isPrimary,
      settings,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Location name is required' });
    }

    // If setting as primary, unset other primary locations
    if (isPrimary) {
      await run('UPDATE locations SET isPrimary = 0 WHERE isPrimary = 1');
    }

    const result = await run(
      `INSERT INTO locations (
        name, address, city, state, zipCode, country, phone, email,
        timezone, isActive, isPrimary, settings
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        address || null,
        city || null,
        state || null,
        zipCode || null,
        country || 'USA',
        phone || null,
        email || null,
        timezone || 'America/New_York',
        isActive !== undefined ? (isActive ? 1 : 0) : 1,
        isPrimary ? 1 : 0,
        settings ? JSON.stringify(settings) : null,
      ]
    );

    const newLocation = await get('SELECT * FROM locations WHERE id = ?', [result.id]);
    res.status(201).json(newLocation);
  } catch (error) {
    console.error('Create location error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update location (admin only)
router.put('/:id', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const location = await get('SELECT * FROM locations WHERE id = ?', [id]);

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const {
      name,
      address,
      city,
      state,
      zipCode,
      country,
      phone,
      email,
      timezone,
      isActive,
      isPrimary,
      settings,
    } = req.body;

    // If setting as primary, unset other primary locations
    if (isPrimary && !location.isPrimary) {
      await run('UPDATE locations SET isPrimary = 0 WHERE isPrimary = 1');
    }

    await run(
      `UPDATE locations SET
        name = ?, address = ?, city = ?, state = ?, zipCode = ?,
        country = ?, phone = ?, email = ?, timezone = ?, isActive = ?,
        isPrimary = ?, settings = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name || location.name,
        address !== undefined ? address : location.address,
        city !== undefined ? city : location.city,
        state !== undefined ? state : location.state,
        zipCode !== undefined ? zipCode : location.zipCode,
        country || location.country,
        phone !== undefined ? phone : location.phone,
        email !== undefined ? email : location.email,
        timezone || location.timezone,
        isActive !== undefined ? (isActive ? 1 : 0) : location.isActive,
        isPrimary !== undefined ? (isPrimary ? 1 : 0) : location.isPrimary,
        settings !== undefined ? (settings ? JSON.stringify(settings) : null) : location.settings,
        id,
      ]
    );

    const updatedLocation = await get('SELECT * FROM locations WHERE id = ?', [id]);
    res.json(updatedLocation);
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete location (admin only)
router.delete('/:id', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const location = await get('SELECT * FROM locations WHERE id = ?', [req.params.id]);

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    if (location.isPrimary) {
      return res.status(400).json({ error: 'Cannot delete primary location' });
    }

    // Check if location has associated data
    const memberCount = await get(
      'SELECT COUNT(*) as count FROM members WHERE locationId = ?',
      [req.params.id]
    );

    if (memberCount.count > 0) {
      return res.status(400).json({
        error: `Cannot delete location with ${memberCount.count} associated members. Reassign or delete them first.`,
      });
    }

    await run('DELETE FROM locations WHERE id = ?', [req.params.id]);
    res.json({ message: 'Location deleted successfully' });
  } catch (error) {
    console.error('Delete location error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get location statistics
router.get('/:id/stats', async (req: AuthRequest, res) => {
  try {
    const locationId = req.params.id;

    const [members, events, campaigns] = await Promise.all([
      get('SELECT COUNT(*) as count FROM members WHERE locationId = ?', [locationId]),
      get('SELECT COUNT(*) as count FROM events WHERE locationId = ?', [locationId]),
      get('SELECT COUNT(*) as count FROM campaigns WHERE locationId = ?', [locationId]),
    ]);

    const membersByType = await query(
      'SELECT membershipType, COUNT(*) as count FROM members WHERE locationId = ? GROUP BY membershipType',
      [locationId]
    );

    res.json({
      totalMembers: members.count,
      totalEvents: events.count,
      totalCampaigns: campaigns.count,
      membersByType: membersByType.reduce(
        (acc: any, item: any) => {
          acc[item.membershipType] = item.count;
          return acc;
        },
        {}
      ),
    });
  } catch (error) {
    console.error('Get location stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
