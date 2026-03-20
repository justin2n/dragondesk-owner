import express from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { query, get, run } from '../models/database';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all check-ins with filters
router.get('/', async (req: AuthRequest, res) => {
  try {
    const {
      locationId,
      memberId,
      startDate,
      endDate,
      method,
      limit = 100,
      offset = 0
    } = req.query;

    let sql = `
      SELECT ci.*,
        m.firstName, m.lastName, m.email, m.programType, m.ranking,
        l.name as locationName,
        e.name as eventName
      FROM check_ins ci
      JOIN members m ON ci.memberId = m.id
      LEFT JOIN locations l ON ci.locationId = l.id
      LEFT JOIN events e ON ci.eventId = e.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (locationId && locationId !== 'all') {
      sql += ' AND ci.locationId = ?';
      params.push(locationId);
    }

    if (memberId) {
      sql += ' AND ci.memberId = ?';
      params.push(memberId);
    }

    if (startDate) {
      sql += ' AND DATE(ci.checkInTime) >= DATE(?)';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND DATE(ci.checkInTime) <= DATE(?)';
      params.push(endDate);
    }

    if (method) {
      sql += ' AND ci.checkInMethod = ?';
      params.push(method);
    }

    sql += ' ORDER BY ci.checkInTime DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), parseInt(offset as string));

    const checkIns = await query(sql, params);
    res.json(checkIns);
  } catch (error) {
    console.error('Error fetching check-ins:', error);
    res.status(500).json({ error: 'Failed to fetch check-ins' });
  }
});

// Get today's check-ins
router.get('/today', async (req: AuthRequest, res) => {
  try {
    const { locationId } = req.query;

    let sql = `
      SELECT ci.*,
        m.firstName, m.lastName, m.email, m.programType, m.ranking,
        l.name as locationName,
        e.name as eventName
      FROM check_ins ci
      JOIN members m ON ci.memberId = m.id
      LEFT JOIN locations l ON ci.locationId = l.id
      LEFT JOIN events e ON ci.eventId = e.id
      WHERE DATE(ci.checkInTime) = DATE('now', 'localtime')
    `;
    const params: any[] = [];

    if (locationId && locationId !== 'all') {
      sql += ' AND ci.locationId = ?';
      params.push(locationId);
    }

    sql += ' ORDER BY ci.checkInTime DESC';

    const checkIns = await query(sql, params);
    res.json(checkIns);
  } catch (error) {
    console.error('Error fetching today\'s check-ins:', error);
    res.status(500).json({ error: 'Failed to fetch check-ins' });
  }
});

// Get check-in stats
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const { locationId } = req.query;
    const filterByLocation = locationId && locationId !== 'all';

    // Total check-ins
    const totalResult = await get(
      filterByLocation
        ? `SELECT COUNT(*) as total FROM check_ins WHERE locationId = ?`
        : `SELECT COUNT(*) as total FROM check_ins`,
      filterByLocation ? [locationId] : []
    );

    // Unique members
    const uniqueResult = await get(
      filterByLocation
        ? `SELECT COUNT(DISTINCT memberId) as uniqueMembers FROM check_ins WHERE locationId = ?`
        : `SELECT COUNT(DISTINCT memberId) as uniqueMembers FROM check_ins`,
      filterByLocation ? [locationId] : []
    );

    // Check-ins by method
    const byMethod = await query(
      filterByLocation
        ? `SELECT checkInMethod, COUNT(*) as count FROM check_ins WHERE locationId = ? GROUP BY checkInMethod`
        : `SELECT checkInMethod, COUNT(*) as count FROM check_ins GROUP BY checkInMethod`,
      filterByLocation ? [locationId] : []
    );

    // Check-ins by program
    const byProgram = await query(
      filterByLocation
        ? `SELECT m.programType, COUNT(*) as count FROM check_ins ci JOIN members m ON ci.memberId = m.id WHERE ci.locationId = ? GROUP BY m.programType`
        : `SELECT m.programType, COUNT(*) as count FROM check_ins ci JOIN members m ON ci.memberId = m.id GROUP BY m.programType`,
      filterByLocation ? [locationId] : []
    );

    // Today's check-ins
    const todayResult = await get(
      filterByLocation
        ? `SELECT COUNT(*) as today FROM check_ins WHERE DATE(checkInTime) = DATE('now', 'localtime') AND locationId = ?`
        : `SELECT COUNT(*) as today FROM check_ins WHERE DATE(checkInTime) = DATE('now', 'localtime')`,
      filterByLocation ? [locationId] : []
    );

    // Average per day (last 30 days)
    const avgResult = await get(
      filterByLocation
        ? `SELECT CAST(COUNT(*) AS REAL) / 30 as avgPerDay FROM check_ins WHERE DATE(checkInTime) >= DATE('now', '-30 days') AND locationId = ?`
        : `SELECT CAST(COUNT(*) AS REAL) / 30 as avgPerDay FROM check_ins WHERE DATE(checkInTime) >= DATE('now', '-30 days')`,
      filterByLocation ? [locationId] : []
    );

    res.json({
      totalCheckIns: totalResult?.total || 0,
      uniqueMembers: uniqueResult?.uniqueMembers || 0,
      todayCheckIns: todayResult?.today || 0,
      averagePerDay: avgResult?.avgPerDay || 0,
      checkInsByMethod: (byMethod || []).reduce((acc: any, row: any) => {
        acc[row.checkInMethod] = row.count;
        return acc;
      }, {}),
      checkInsByProgram: (byProgram || []).reduce((acc: any, row: any) => {
        acc[row.programType] = row.count;
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Error fetching check-in stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get check-in history for a specific member
router.get('/member/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;
    const { limit = 50 } = req.query;

    const checkIns = await query(`
      SELECT ci.*,
        l.name as locationName,
        e.name as eventName
      FROM check_ins ci
      LEFT JOIN locations l ON ci.locationId = l.id
      LEFT JOIN events e ON ci.eventId = e.id
      WHERE ci.memberId = ?
      ORDER BY ci.checkInTime DESC
      LIMIT ?
    `, [memberId, parseInt(limit as string)]);

    // Get attendance summary
    const summary = await get(`
      SELECT
        COUNT(*) as totalCheckIns,
        COUNT(DISTINCT DATE(checkInTime)) as uniqueDays,
        MIN(checkInTime) as firstCheckIn,
        MAX(checkInTime) as lastCheckIn
      FROM check_ins
      WHERE memberId = ?
    `, [memberId]);

    // Get monthly breakdown (last 6 months)
    const monthly = await query(`
      SELECT
        strftime('%Y-%m', checkInTime) as month,
        COUNT(*) as count
      FROM check_ins
      WHERE memberId = ?
        AND checkInTime >= DATE('now', '-6 months')
      GROUP BY strftime('%Y-%m', checkInTime)
      ORDER BY month DESC
    `, [memberId]);

    res.json({
      checkIns,
      summary,
      monthlyBreakdown: monthly
    });
  } catch (error) {
    console.error('Error fetching member check-ins:', error);
    res.status(500).json({ error: 'Failed to fetch check-ins' });
  }
});

// Manual check-in (by admin/staff)
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { memberId, locationId, eventId, notes } = req.body;

    if (!memberId || !locationId) {
      return res.status(400).json({ error: 'Member ID and Location ID are required' });
    }

    // Verify member exists
    const member = await get('SELECT id FROM members WHERE id = ?', [memberId]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Create check-in record
    const result = await run(`
      INSERT INTO check_ins (memberId, locationId, checkInMethod, eventId, notes, checkInTime, createdAt)
      VALUES (?, ?, 'manual', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [memberId, locationId, eventId || null, notes || null]);

    // Update member's attendance stats
    await run(`
      UPDATE members
      SET totalClassesAttended = COALESCE(totalClassesAttended, 0) + 1,
          lastCheckInAt = CURRENT_TIMESTAMP,
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [memberId]);

    // If event specified, update event_attendees
    if (eventId) {
      await run(`
        INSERT OR REPLACE INTO event_attendees (eventId, memberId, status, checkedInAt, checkInMethod)
        VALUES (?, ?, 'attended', CURRENT_TIMESTAMP, 'manual')
      `, [eventId, memberId]);
    }

    res.json({
      success: true,
      checkInId: result.id,
      message: 'Check-in recorded successfully'
    });
  } catch (error) {
    console.error('Error creating check-in:', error);
    res.status(500).json({ error: 'Failed to create check-in' });
  }
});

// Delete check-in record
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Get check-in to update member stats
    const checkIn = await get('SELECT memberId FROM check_ins WHERE id = ?', [id]);
    if (!checkIn) {
      return res.status(404).json({ error: 'Check-in not found' });
    }

    await run('DELETE FROM check_ins WHERE id = ?', [id]);

    // Update member's attendance count
    await run(`
      UPDATE members
      SET totalClassesAttended = MAX(0, COALESCE(totalClassesAttended, 0) - 1),
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [checkIn.memberId]);

    res.json({ success: true, message: 'Check-in deleted' });
  } catch (error) {
    console.error('Error deleting check-in:', error);
    res.status(500).json({ error: 'Failed to delete check-in' });
  }
});

export default router;
