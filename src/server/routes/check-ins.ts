import express from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../models/database';

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
        m."firstName", m."lastName", m.email, m."programType", m.ranking,
        l.name as "locationName",
        e.name as "eventName"
      FROM check_ins ci
      JOIN members m ON ci."memberId" = m.id
      LEFT JOIN locations l ON ci."locationId" = l.id
      LEFT JOIN events e ON ci."eventId" = e.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (locationId && locationId !== 'all') {
      params.push(locationId);
      sql += ` AND ci."locationId" = $${params.length}`;
    }

    if (memberId) {
      params.push(memberId);
      sql += ` AND ci."memberId" = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      sql += ` AND DATE(ci."checkInTime") >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      sql += ` AND DATE(ci."checkInTime") <= $${params.length}`;
    }

    if (method) {
      params.push(method);
      sql += ` AND ci."checkInMethod" = $${params.length}`;
    }

    params.push(parseInt(limit as string), parseInt(offset as string));
    sql += ` ORDER BY ci."checkInTime" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await pool.query(sql, params);
    res.json(result.rows);
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
        m."firstName", m."lastName", m.email, m."programType", m.ranking,
        l.name as "locationName",
        e.name as "eventName"
      FROM check_ins ci
      JOIN members m ON ci."memberId" = m.id
      LEFT JOIN locations l ON ci."locationId" = l.id
      LEFT JOIN events e ON ci."eventId" = e.id
      WHERE DATE(ci."checkInTime") = CURRENT_DATE
    `;
    const params: any[] = [];

    if (locationId && locationId !== 'all') {
      params.push(locationId);
      sql += ` AND ci."locationId" = $${params.length}`;
    }

    sql += ` ORDER BY ci."checkInTime" DESC`;

    const result = await pool.query(sql, params);
    res.json(result.rows);
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
    const locParam = filterByLocation ? [locationId] : [];
    const locClause = filterByLocation ? `WHERE "locationId" = $1` : '';
    const locAndClause = filterByLocation ? `AND "locationId" = $1` : '';

    const [totalResult, uniqueResult, byMethod, byProgram, todayResult, avgResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total FROM check_ins ${locClause}`, locParam),
      pool.query(`SELECT COUNT(DISTINCT "memberId") as "uniqueMembers" FROM check_ins ${locClause}`, locParam),
      pool.query(
        `SELECT "checkInMethod", COUNT(*) as count FROM check_ins ${locClause} GROUP BY "checkInMethod"`,
        locParam
      ),
      pool.query(
        `SELECT m."programType", COUNT(*) as count FROM check_ins ci JOIN members m ON ci."memberId" = m.id ${filterByLocation ? 'WHERE ci."locationId" = $1' : ''} GROUP BY m."programType"`,
        locParam
      ),
      pool.query(
        `SELECT COUNT(*) as today FROM check_ins WHERE DATE("checkInTime") = CURRENT_DATE ${locAndClause}`,
        locParam
      ),
      pool.query(
        `SELECT COUNT(*)::DECIMAL / 30 as "avgPerDay" FROM check_ins WHERE "checkInTime" >= NOW() - INTERVAL '30 days' ${locAndClause}`,
        locParam
      ),
    ]);

    res.json({
      totalCheckIns: parseInt(totalResult.rows[0]?.total) || 0,
      uniqueMembers: parseInt(uniqueResult.rows[0]?.uniqueMembers) || 0,
      todayCheckIns: parseInt(todayResult.rows[0]?.today) || 0,
      averagePerDay: parseFloat(avgResult.rows[0]?.avgPerDay) || 0,
      checkInsByMethod: byMethod.rows.reduce((acc: any, row: any) => {
        acc[row.checkInMethod] = parseInt(row.count) || 0;
        return acc;
      }, {}),
      checkInsByProgram: byProgram.rows.reduce((acc: any, row: any) => {
        acc[row.programType] = parseInt(row.count) || 0;
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

    const [checkInsResult, summaryResult, monthlyResult] = await Promise.all([
      pool.query(`
        SELECT ci.*,
          l.name as "locationName",
          e.name as "eventName"
        FROM check_ins ci
        LEFT JOIN locations l ON ci."locationId" = l.id
        LEFT JOIN events e ON ci."eventId" = e.id
        WHERE ci."memberId" = $1
        ORDER BY ci."checkInTime" DESC
        LIMIT $2
      `, [memberId, parseInt(limit as string)]),

      pool.query(`
        SELECT
          COUNT(*) as "totalCheckIns",
          COUNT(DISTINCT DATE("checkInTime")) as "uniqueDays",
          MIN("checkInTime") as "firstCheckIn",
          MAX("checkInTime") as "lastCheckIn"
        FROM check_ins
        WHERE "memberId" = $1
      `, [memberId]),

      pool.query(`
        SELECT
          TO_CHAR("checkInTime", 'YYYY-MM') as month,
          COUNT(*) as count
        FROM check_ins
        WHERE "memberId" = $1
          AND "checkInTime" >= NOW() - INTERVAL '6 months'
        GROUP BY TO_CHAR("checkInTime", 'YYYY-MM')
        ORDER BY month DESC
      `, [memberId]),
    ]);

    res.json({
      checkIns: checkInsResult.rows,
      summary: summaryResult.rows[0],
      monthlyBreakdown: monthlyResult.rows
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

    const memberCheck = await pool.query('SELECT id FROM members WHERE id = $1', [memberId]);
    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const insertResult = await pool.query(`
      INSERT INTO check_ins ("memberId", "locationId", "checkInMethod", "eventId", notes, "checkInTime", "createdAt")
      VALUES ($1, $2, 'manual', $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `, [memberId, locationId, eventId || null, notes || null]);

    await pool.query(`
      UPDATE members
      SET "totalClassesAttended" = COALESCE("totalClassesAttended", 0) + 1,
          "lastCheckInAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [memberId]);

    if (eventId) {
      await pool.query(`
        INSERT INTO event_attendees ("eventId", "memberId", status, "checkedInAt", "checkInMethod")
        VALUES ($1, $2, 'attended', CURRENT_TIMESTAMP, 'manual')
        ON CONFLICT ("eventId", "memberId") DO UPDATE
          SET status = 'attended', "checkedInAt" = CURRENT_TIMESTAMP
      `, [eventId, memberId]);
    }

    res.json({
      success: true,
      checkInId: insertResult.rows[0].id,
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

    const checkIn = await pool.query('SELECT "memberId" FROM check_ins WHERE id = $1', [id]);
    if (checkIn.rows.length === 0) {
      return res.status(404).json({ error: 'Check-in not found' });
    }

    await pool.query('DELETE FROM check_ins WHERE id = $1', [id]);

    await pool.query(`
      UPDATE members
      SET "totalClassesAttended" = GREATEST(0, COALESCE("totalClassesAttended", 0) - 1),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [checkIn.rows[0].memberId]);

    res.json({ success: true, message: 'Check-in deleted' });
  } catch (error) {
    console.error('Error deleting check-in:', error);
    res.status(500).json({ error: 'Failed to delete check-in' });
  }
});

export default router;
