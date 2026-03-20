import express from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

// All workforce routes require super_admin role
router.use(authenticateToken);

// Get all instructors
router.get('/instructors', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { locationId } = req.query;

    let sql = `
      SELECT id, username, email, firstName, lastName, role, isInstructor,
             certifications, specialties, locationId, createdAt, updatedAt
      FROM users
      WHERE isInstructor = 1 OR role = 'instructor'
    `;
    const params: any[] = [];

    if (locationId) {
      sql += ' AND (locationId = ? OR locationId IS NULL)';
      params.push(locationId);
    }

    sql += ' ORDER BY firstName, lastName';

    const instructors = await query(sql, params);
    res.json(instructors);
  } catch (error) {
    console.error('Error fetching instructors:', error);
    res.status(500).json({ error: 'Failed to fetch instructors' });
  }
});

// Get instructor by ID
router.get('/instructors/:id', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const instructor = await get(
      `SELECT id, username, email, firstName, lastName, role, isInstructor,
              certifications, specialties, locationId, createdAt, updatedAt
       FROM users WHERE id = ? AND (isInstructor = 1 OR role = 'instructor')`,
      [req.params.id]
    );

    if (!instructor) {
      return res.status(404).json({ error: 'Instructor not found' });
    }

    res.json(instructor);
  } catch (error) {
    console.error('Error fetching instructor:', error);
    res.status(500).json({ error: 'Failed to fetch instructor' });
  }
});

// Update instructor details
router.put('/instructors/:id', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { certifications, specialties, isInstructor, locationId } = req.body;

    await run(
      `UPDATE users
       SET certifications = ?, specialties = ?, isInstructor = ?, locationId = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [certifications, specialties, isInstructor ? 1 : 0, locationId, req.params.id]
    );

    const updated = await get(
      `SELECT id, username, email, firstName, lastName, role, isInstructor,
              certifications, specialties, locationId, createdAt, updatedAt
       FROM users WHERE id = ?`,
      [req.params.id]
    );

    res.json(updated);
  } catch (error) {
    console.error('Error updating instructor:', error);
    res.status(500).json({ error: 'Failed to update instructor' });
  }
});

// Get work schedules
router.get('/schedules', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { instructorId, locationId, dayOfWeek, startDate, endDate, scheduleType } = req.query;

    let sql = `
      SELECT ws.*,
             u.firstName || ' ' || u.lastName as instructorName,
             u.email as instructorEmail,
             l.name as locationName
      FROM work_schedules ws
      LEFT JOIN users u ON ws.instructorId = u.id
      LEFT JOIN locations l ON ws.locationId = l.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (instructorId) {
      sql += ' AND ws.instructorId = ?';
      params.push(instructorId);
    }

    if (locationId) {
      sql += ' AND ws.locationId = ?';
      params.push(locationId);
    }

    if (dayOfWeek) {
      sql += ' AND ws.dayOfWeek = ?';
      params.push(dayOfWeek);
    }

    if (scheduleType) {
      sql += ' AND ws.scheduleType = ?';
      params.push(scheduleType);
    }

    if (startDate && endDate) {
      sql += ' AND (ws.specificDate BETWEEN ? AND ? OR ws.isRecurring = 1)';
      params.push(startDate, endDate);
    }

    sql += ' ORDER BY ws.scheduleType, ws.dayOfWeek, ws.startTime';

    const schedules = await query(sql, params);
    res.json(schedules);
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// Create work schedule
router.post('/schedules', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const {
      instructorId,
      locationId,
      dayOfWeek,
      startTime,
      endTime,
      isRecurring,
      specificDate,
      scheduleType,
      notes,
    } = req.body;

    if (!instructorId || !dayOfWeek || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await run(
      `INSERT INTO work_schedules
       (instructorId, locationId, dayOfWeek, startTime, endTime, isRecurring, specificDate, scheduleType, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [instructorId, locationId, dayOfWeek, startTime, endTime, isRecurring ? 1 : 0, specificDate, scheduleType || 'instructor', notes]
    );

    const schedule = await get('SELECT * FROM work_schedules WHERE id = ?', [result.id]);
    res.status(201).json(schedule);
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// Update work schedule
router.put('/schedules/:id', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const {
      instructorId,
      locationId,
      dayOfWeek,
      startTime,
      endTime,
      isRecurring,
      specificDate,
      scheduleType,
      status,
      notes,
    } = req.body;

    await run(
      `UPDATE work_schedules
       SET instructorId = ?, locationId = ?, dayOfWeek = ?, startTime = ?, endTime = ?,
           isRecurring = ?, specificDate = ?, scheduleType = ?, status = ?, notes = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        instructorId,
        locationId,
        dayOfWeek,
        startTime,
        endTime,
        isRecurring ? 1 : 0,
        specificDate,
        scheduleType,
        status,
        notes,
        req.params.id,
      ]
    );

    const schedule = await get('SELECT * FROM work_schedules WHERE id = ?', [req.params.id]);
    res.json(schedule);
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// Delete work schedule
router.delete('/schedules/:id', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    await run('DELETE FROM work_schedules WHERE id = ?', [req.params.id]);
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// Get instructor schedule overview (classes they're teaching)
router.get('/instructors/:id/classes', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let sql = `
      SELECT e.*
      FROM events e
      WHERE e.instructorId = ? AND e.status = 'scheduled'
    `;
    const params: any[] = [req.params.id];

    if (startDate && endDate) {
      sql += ' AND e.startDateTime BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    sql += ' ORDER BY e.startDateTime';

    const classes = await query(sql, params);
    res.json(classes);
  } catch (error) {
    console.error('Error fetching instructor classes:', error);
    res.status(500).json({ error: 'Failed to fetch instructor classes' });
  }
});

// Get MyStudio sync logs
router.get('/sync-logs', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const logs = await query(
      `SELECT * FROM mystudio_sync_log ORDER BY syncedAt DESC LIMIT 50`
    );
    res.json(logs);
  } catch (error) {
    console.error('Error fetching sync logs:', error);
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
});

// Import schedule from MyStudio
// Accepts CSV or JSON with fields: myStudioId, name, description, eventType, programType,
// startDateTime, endDateTime, instructor, instructorId, locationId, currentAttendees,
// price, requiresRegistration, isRecurring, recurrencePattern
router.post('/import-mystudio-schedule', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { scheduleData } = req.body;
    const userId = (req as any).user.id;

    if (!scheduleData || !Array.isArray(scheduleData)) {
      console.error('Invalid schedule data received:', typeof scheduleData);
      return res.status(400).json({
        error: 'Invalid schedule data. Expected CSV or JSON array with class schedule.',
        expectedFields: 'myStudioId, name, description, eventType, programType, startDateTime, endDateTime, instructor, instructorId, locationId'
      });
    }

    console.log(`Importing ${scheduleData.length} records from MyStudio`);
    let imported = 0;
    let errors: string[] = [];

    for (const item of scheduleData) {
      try {
        console.log('Processing item:', item);

        // Use MyStudio ID if available, otherwise try common alternatives
        const externalId = item.myStudioId || item.ClassScheduleId || item.ScheduleId || item.Id || item.ClassId;

        // If still no ID, create one from name + startDateTime
        const uniqueId = externalId || `${item.name}_${item.startDateTime}`;

        console.log('Using unique ID:', uniqueId);

        // Check if class already exists
        const existing = await get(
          'SELECT id FROM events WHERE myStudioId = ?',
          [uniqueId]
        );

        if (existing) {
          // Update existing event
          await run(
            `UPDATE events
             SET name = ?, description = ?, eventType = ?, programType = ?,
                 startDateTime = ?, endDateTime = ?, instructor = ?, instructorId = ?,
                 locationId = ?, syncedFromMyStudio = 1, lastSyncedAt = CURRENT_TIMESTAMP,
                 updatedAt = CURRENT_TIMESTAMP
             WHERE myStudioId = ?`,
            [
              item.name,
              item.description,
              item.eventType || 'class',
              item.programType,
              item.startDateTime,
              item.endDateTime,
              item.instructor,
              item.instructorId,
              item.locationId,
              uniqueId,
            ]
          );
        } else {
          // Create new event
          await run(
            `INSERT INTO events
             (myStudioId, name, description, eventType, programType, startDateTime, endDateTime,
              instructor, instructorId, locationId, currentAttendees, price, requiresRegistration,
              isRecurring, recurrencePattern, status, syncedFromMyStudio, lastSyncedAt, createdBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?)`,
            [
              uniqueId,
              item.name,
              item.description,
              item.eventType || 'class',
              item.programType,
              item.startDateTime,
              item.endDateTime,
              item.instructor,
              item.instructorId,
              item.locationId,
              item.currentAttendees || 0,
              item.price || 0,
              item.requiresRegistration ? 1 : 0,
              item.isRecurring ? 1 : 0,
              item.recurrencePattern,
              'scheduled',
              userId,
            ]
          );
        }
        imported++;
      } catch (error: any) {
        const itemName = item.name || item.myStudioId || 'Unknown';
        errors.push(`Failed to import ${itemName}: ${error.message}`);
        console.error(`Import error for ${itemName}:`, error);
      }
    }

    console.log(`Import complete: ${imported} imported, ${errors.length} errors`);

    // Log the sync
    await run(
      `INSERT INTO mystudio_sync_log (syncType, status, recordsImported, errorMessage, syncedBy)
       VALUES (?, ?, ?, ?, ?)`,
      [
        'schedule',
        errors.length > 0 ? 'partial' : 'success',
        imported,
        errors.length > 0 ? errors.join('; ') : null,
        userId,
      ]
    );

    res.json({
      message: 'Import completed',
      imported,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error importing MyStudio schedule:', error);
    res.status(500).json({ error: 'Failed to import schedule' });
  }
});

export default router;
