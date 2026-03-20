import express from 'express';
import { query, get, run } from '../models/database';
import { lookupMemberByQRCode } from '../services/qr-generator';

const router = express.Router();

// NOTE: Kiosk routes are PUBLIC (no auth required) per user preference
// All operations are logged for audit trail

// Log kiosk activity
async function logKioskActivity(locationId: number, action: string, memberId?: number, metadata?: any) {
  try {
    await run(
      `INSERT INTO kiosk_activity_logs (locationId, action, memberId, metadata, createdAt)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [locationId, action, memberId || null, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (error) {
    console.error('Error logging kiosk activity:', error);
  }
}

// Get today's classes for a location
router.get('/classes/today/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;

    // Get today's classes - don't filter by locationId since not all events have it
    const classes = await query(`
      SELECT e.*, u.firstName as instructorFirstName, u.lastName as instructorLastName
      FROM events e
      LEFT JOIN users u ON e.instructorId = u.id
      WHERE DATE(e.startDateTime) = DATE('now', 'localtime')
        AND e.status = 'scheduled'
        AND e.eventType = 'class'
      ORDER BY e.startDateTime ASC
    `);

    await logKioskActivity(parseInt(locationId), 'view_classes');

    res.json(classes);
  } catch (error) {
    console.error('Error fetching today\'s classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// Check in via QR code scan
router.post('/check-in/qr', async (req, res) => {
  try {
    const { qrCode, locationId, eventId } = req.body;

    if (!qrCode || !locationId) {
      return res.status(400).json({ error: 'QR code and location ID are required' });
    }

    // Look up member by QR code
    const member = await lookupMemberByQRCode(qrCode);

    if (!member) {
      await logKioskActivity(locationId, 'failed_qr_scan', undefined, { qrCode });
      return res.status(404).json({ error: 'Invalid or inactive QR code' });
    }

    // Check for duplicate check-in today
    const existingCheckIn = await get(`
      SELECT id FROM check_ins
      WHERE memberId = ? AND locationId = ? AND DATE(checkInTime) = DATE('now', 'localtime')
    `, [member.id, locationId]);

    if (existingCheckIn) {
      return res.json({
        success: true,
        alreadyCheckedIn: true,
        member: {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          programType: member.programType,
          ranking: member.ranking
        },
        message: 'Already checked in today'
      });
    }

    // Create check-in record
    const result = await run(`
      INSERT INTO check_ins (memberId, locationId, checkInMethod, eventId, checkInTime, createdAt)
      VALUES (?, ?, 'qr_scan', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [member.id, locationId, eventId || null]);

    // Update member's attendance stats
    await run(`
      UPDATE members
      SET totalClassesAttended = COALESCE(totalClassesAttended, 0) + 1,
          lastCheckInAt = CURRENT_TIMESTAMP,
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [member.id]);

    // If event specified, update event_attendees
    if (eventId) {
      await run(`
        INSERT OR REPLACE INTO event_attendees (eventId, memberId, status, checkedInAt, checkInMethod)
        VALUES (?, ?, 'attended', CURRENT_TIMESTAMP, 'qr_scan')
      `, [eventId, member.id]);
    }

    await logKioskActivity(locationId, 'qr_check_in', member.id);

    res.json({
      success: true,
      checkInId: result.id,
      member: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        programType: member.programType,
        ranking: member.ranking
      },
      message: 'Check-in successful!'
    });
  } catch (error) {
    console.error('Error processing QR check-in:', error);
    res.status(500).json({ error: 'Failed to process check-in' });
  }
});

// Look up member by name/email/phone for check-in
router.get('/member/lookup', async (req, res) => {
  try {
    const { search, locationId } = req.query;

    if (!search || !locationId) {
      return res.status(400).json({ error: 'Search term and location ID are required' });
    }

    const searchTerm = `%${search}%`;

    const members = await query(`
      SELECT id, firstName, lastName, email, phone, programType, ranking
      FROM members
      WHERE (firstName || ' ' || lastName LIKE ?
             OR email LIKE ?
             OR phone LIKE ?)
      ORDER BY firstName, lastName
      LIMIT 10
    `, [searchTerm, searchTerm, searchTerm]);

    await logKioskActivity(parseInt(locationId as string), 'member_search', undefined, { search });

    res.json(members);
  } catch (error) {
    console.error('Error looking up member:', error);
    res.status(500).json({ error: 'Failed to look up member' });
  }
});

// Check in via name/phone search
router.post('/check-in/search', async (req, res) => {
  try {
    const { memberId, locationId, eventId, method = 'name_search' } = req.body;

    if (!memberId || !locationId) {
      return res.status(400).json({ error: 'Member ID and location ID are required' });
    }

    // Verify member exists
    const member = await get(`
      SELECT id, firstName, lastName, programType, ranking
      FROM members WHERE id = ?
    `, [memberId]);

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Check for duplicate check-in today
    const existingCheckIn = await get(`
      SELECT id FROM check_ins
      WHERE memberId = ? AND locationId = ? AND DATE(checkInTime) = DATE('now', 'localtime')
    `, [memberId, locationId]);

    if (existingCheckIn) {
      return res.json({
        success: true,
        alreadyCheckedIn: true,
        member: {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          programType: member.programType,
          ranking: member.ranking
        },
        message: 'Already checked in today'
      });
    }

    // Create check-in record
    const result = await run(`
      INSERT INTO check_ins (memberId, locationId, checkInMethod, eventId, checkInTime, createdAt)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [memberId, locationId, method, eventId || null]);

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
        VALUES (?, ?, 'attended', CURRENT_TIMESTAMP, ?)
      `, [eventId, memberId, method]);
    }

    await logKioskActivity(locationId, 'search_check_in', memberId, { method });

    res.json({
      success: true,
      checkInId: result.id,
      member: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        programType: member.programType,
        ranking: member.ranking
      },
      message: 'Check-in successful!'
    });
  } catch (error) {
    console.error('Error processing search check-in:', error);
    res.status(500).json({ error: 'Failed to process check-in' });
  }
});

// Get location info for kiosk display
router.get('/location/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;

    const location = await get(`
      SELECT id, name, address, city, state, phone
      FROM locations WHERE id = ? AND isActive = 1
    `, [locationId]);

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json(location);
  } catch (error) {
    console.error('Error fetching location:', error);
    res.status(500).json({ error: 'Failed to fetch location' });
  }
});

// Get all active locations (for kiosk setup)
router.get('/locations', async (_req, res) => {
  try {
    const locations = await query(`
      SELECT id, name, address, city, state
      FROM locations WHERE isActive = 1
      ORDER BY name
    `);

    res.json(locations);
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// Get today's check-in count for location (for kiosk display)
router.get('/stats/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;

    const stats = await get(`
      SELECT
        COUNT(*) as todayCheckIns,
        COUNT(DISTINCT memberId) as uniqueMembers
      FROM check_ins
      WHERE locationId = ? AND DATE(checkInTime) = DATE('now', 'localtime')
    `, [locationId]);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching kiosk stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
