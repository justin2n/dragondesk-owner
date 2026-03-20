import { Router } from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// Get all events
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, eventType, programType, status, locationId } = req.query;

    let sql = 'SELECT * FROM events WHERE 1=1';
    const params: any[] = [];

    // Filter by location if specified (if not specified, return all locations)
    if (locationId && locationId !== 'all') {
      sql += ' AND locationId = ?';
      params.push(locationId);
    }

    if (startDate) {
      sql += ' AND startDateTime >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND endDateTime <= ?';
      params.push(endDate);
    }

    if (eventType) {
      sql += ' AND eventType = ?';
      params.push(eventType);
    }

    if (programType) {
      sql += ' AND programType = ?';
      params.push(programType);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY startDateTime ASC';

    const events = await query(sql, params);
    res.json(events);
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single event
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const event = await get('SELECT * FROM events WHERE id = ?', [req.params.id]);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get attendees
    const attendees = await query(
      `SELECT ea.*, m.firstName, m.lastName, m.email, m.phone
       FROM event_attendees ea
       JOIN members m ON ea.memberId = m.id
       WHERE ea.eventId = ?`,
      [req.params.id]
    );

    res.json({ ...event, attendees });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create event
router.post('/', async (req: AuthRequest, res) => {
  try {
    const {
      name,
      description,
      eventType,
      programType,
      startDateTime,
      endDateTime,
      location,
      maxAttendees,
      price,
      requiresRegistration,
      isRecurring,
      recurrencePattern,
      instructor,
      tags,
      imageUrl,
    } = req.body;

    if (!name || !eventType || !startDateTime || !endDateTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await run(
      `INSERT INTO events (
        name, description, eventType, programType, startDateTime, endDateTime,
        location, maxAttendees, price, requiresRegistration, isRecurring,
        recurrencePattern, instructor, tags, imageUrl, createdBy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || null,
        eventType,
        programType || null,
        startDateTime,
        endDateTime,
        location || null,
        maxAttendees || null,
        price || 0,
        requiresRegistration ? 1 : 0,
        isRecurring ? 1 : 0,
        recurrencePattern || null,
        instructor || null,
        tags || null,
        imageUrl || null,
        req.user!.id,
      ]
    );

    const newEvent = await get('SELECT * FROM events WHERE id = ?', [result.id]);
    res.status(201).json(newEvent);
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update event
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const event = await get('SELECT * FROM events WHERE id = ?', [id]);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const {
      name,
      description,
      eventType,
      programType,
      startDateTime,
      endDateTime,
      location,
      maxAttendees,
      price,
      requiresRegistration,
      isRecurring,
      recurrencePattern,
      instructor,
      tags,
      imageUrl,
      status,
    } = req.body;

    await run(
      `UPDATE events SET
        name = ?, description = ?, eventType = ?, programType = ?,
        startDateTime = ?, endDateTime = ?, location = ?, maxAttendees = ?,
        price = ?, requiresRegistration = ?, isRecurring = ?, recurrencePattern = ?,
        instructor = ?, tags = ?, imageUrl = ?, status = ?,
        updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name || event.name,
        description !== undefined ? description : event.description,
        eventType || event.eventType,
        programType !== undefined ? programType : event.programType,
        startDateTime || event.startDateTime,
        endDateTime || event.endDateTime,
        location !== undefined ? location : event.location,
        maxAttendees !== undefined ? maxAttendees : event.maxAttendees,
        price !== undefined ? price : event.price,
        requiresRegistration !== undefined ? (requiresRegistration ? 1 : 0) : event.requiresRegistration,
        isRecurring !== undefined ? (isRecurring ? 1 : 0) : event.isRecurring,
        recurrencePattern !== undefined ? recurrencePattern : event.recurrencePattern,
        instructor !== undefined ? instructor : event.instructor,
        tags !== undefined ? tags : event.tags,
        imageUrl !== undefined ? imageUrl : event.imageUrl,
        status || event.status,
        id,
      ]
    );

    const updatedEvent = await get('SELECT * FROM events WHERE id = ?', [id]);
    res.json(updatedEvent);
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete event
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const event = await get('SELECT * FROM events WHERE id = ?', [req.params.id]);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    await run('DELETE FROM events WHERE id = ?', [req.params.id]);
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register member for event
router.post('/:id/register', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.body;
    const eventId = req.params.id;

    if (!memberId) {
      return res.status(400).json({ error: 'Member ID is required' });
    }

    const event = await get('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if already registered
    const existing = await get(
      'SELECT * FROM event_attendees WHERE eventId = ? AND memberId = ?',
      [eventId, memberId]
    );

    if (existing) {
      return res.status(400).json({ error: 'Member already registered for this event' });
    }

    // Check max attendees
    if (event.maxAttendees && event.currentAttendees >= event.maxAttendees) {
      return res.status(400).json({ error: 'Event is full' });
    }

    await run('INSERT INTO event_attendees (eventId, memberId) VALUES (?, ?)', [
      eventId,
      memberId,
    ]);

    await run(
      'UPDATE events SET currentAttendees = currentAttendees + 1 WHERE id = ?',
      [eventId]
    );

    res.json({ message: 'Member registered successfully' });
  } catch (error) {
    console.error('Register member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unregister member from event
router.delete('/:id/register/:memberId', async (req: AuthRequest, res) => {
  try {
    const { id: eventId, memberId } = req.params;

    const result = await run(
      'DELETE FROM event_attendees WHERE eventId = ? AND memberId = ?',
      [eventId, memberId]
    );

    if (result.changes > 0) {
      await run(
        'UPDATE events SET currentAttendees = currentAttendees - 1 WHERE id = ?',
        [eventId]
      );
      res.json({ message: 'Member unregistered successfully' });
    } else {
      res.status(404).json({ error: 'Registration not found' });
    }
  } catch (error) {
    console.error('Unregister member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get event attendees
router.get('/:id/attendees', async (req: AuthRequest, res) => {
  try {
    const attendees = await query(
      `SELECT ea.*, m.firstName, m.lastName, m.email, m.phone, m.programType
       FROM event_attendees ea
       JOIN members m ON ea.memberId = m.id
       WHERE ea.eventId = ?
       ORDER BY ea.registeredAt DESC`,
      [req.params.id]
    );

    res.json(attendees);
  } catch (error) {
    console.error('Get attendees error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sync events from MyStudio API
router.post('/sync-mystudio', async (req: AuthRequest, res) => {
  try {
    const myStudioConfig = req.body.config;
    const userId = req.user?.id;

    if (!myStudioConfig?.enabled || !myStudioConfig?.apiKey) {
      return res.status(400).json({ error: 'MyStudio API is not configured' });
    }

    // In production, this would make an actual API call to MyStudio
    // For now, we'll provide a way to import via JSON data
    // You can extend this to make real API calls when MyStudio provides the endpoint

    // Example of how to extend this for real API calls:
    // const response = await fetch(`${myStudioConfig.endpoint}/classes`, {
    //   headers: { 'Authorization': `Bearer ${myStudioConfig.apiKey}` }
    // });
    // const myStudioEvents = await response.json();

    // For now, return instructions for CSV/JSON import
    res.json({
      message: 'MyStudio sync is configured. To import events, go to Workforce Management > MyStudio Sync tab and upload a CSV or JSON file with your class schedule.',
      syncedCount: 0,
      lastSyncedAt: new Date().toISOString(),
      note: 'CSV/JSON import available in Workforce Management section for manual imports'
    });
  } catch (error) {
    console.error('Sync MyStudio events error:', error);
    res.status(500).json({ error: 'Failed to sync events from MyStudio' });
  }
});

// Create multi-platform campaign from event
router.post('/:id/create-campaign', async (req: AuthRequest, res) => {
  try {
    const eventId = req.params.id;
    const { platforms, audienceId } = req.body;

    const event = await get('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (!platforms || platforms.length === 0) {
      return res.status(400).json({ error: 'At least one platform is required' });
    }

    if (!audienceId) {
      return res.status(400).json({ error: 'Audience ID is required' });
    }

    const createdItems = [];

    // Create appropriate items for each selected platform
    for (const platform of platforms) {
      switch (platform) {
        case 'optimize': {
          // Create an Experience (A/B Test) for Optimize
          const variations = [
            {
              name: 'Control',
              headline: event.name,
              description: event.description,
              ctaText: 'Learn More',
              ctaUrl: `/events/${event.id}`,
            },
            {
              name: 'Variant A',
              headline: `Join us for ${event.name}`,
              description: `${event.description}\n\n📅 ${new Date(event.startDateTime).toLocaleDateString()}\n📍 ${event.location || 'TBA'}`,
              ctaText: 'Register Now',
              ctaUrl: `/events/${event.id}`,
            },
          ];

          const result = await run(
            `INSERT INTO abtests (name, audienceId, variations, status, createdBy)
             VALUES (?, ?, ?, ?, ?)`,
            [
              `${event.name} - Event Experience`,
              audienceId,
              JSON.stringify(variations),
              'draft',
              req.user!.id,
            ]
          );

          const experience = await get('SELECT * FROM abtests WHERE id = ?', [result.id]);
          createdItems.push({ type: 'experience', data: experience });
          break;
        }

        case 'engage': {
          // Create Email Campaign for Engage
          const campaignContent = {
            eventId: event.id,
            eventName: event.name,
            eventDate: event.startDateTime,
            eventLocation: event.location,
            subject: `Don't miss: ${event.name}`,
            body: `${event.description}\n\nDate: ${new Date(event.startDateTime).toLocaleDateString()}\nLocation: ${event.location || 'TBA'}`,
          };

          const result = await run(
            `INSERT INTO campaigns (name, type, audienceId, status, content, createdBy)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              `${event.name} - Email Campaign`,
              'email',
              audienceId,
              'draft',
              JSON.stringify(campaignContent),
              req.user!.id,
            ]
          );

          const campaign = await get('SELECT * FROM campaigns WHERE id = ?', [result.id]);
          createdItems.push({ type: 'campaign', data: campaign });
          break;
        }

        case 'outreach': {
          // Create Call Campaign for Outreach
          const campaignContent = {
            eventId: event.id,
            eventName: event.name,
            eventDate: event.startDateTime,
            eventLocation: event.location,
            script: `Hi, this is calling from the gym. We wanted to let you know about our upcoming ${event.eventType}: ${event.name} on ${new Date(event.startDateTime).toLocaleDateString()}. Would you be interested in joining us?`,
          };

          const result = await run(
            `INSERT INTO campaigns (name, type, audienceId, status, content, createdBy)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              `${event.name} - Call Campaign`,
              'call',
              audienceId,
              'draft',
              JSON.stringify(campaignContent),
              req.user!.id,
            ]
          );

          const campaign = await get('SELECT * FROM campaigns WHERE id = ?', [result.id]);
          createdItems.push({ type: 'campaign', data: campaign });
          break;
        }

        case 'social': {
          // Create Social Post for DragonDesk: Social
          const postContent = {
            eventId: event.id,
            eventName: event.name,
            message: `Join us for ${event.name}! 🥋\n\n${event.description}\n\n📅 ${new Date(event.startDateTime).toLocaleDateString()}\n📍 ${event.location || 'TBA'}\n\nRegister now!`,
            hashtags: ['martialarts', 'training', event.programType?.toLowerCase().replace(/\s/g, '')].filter(Boolean),
          };

          const result = await run(
            `INSERT INTO social_campaigns (name, platforms, content, scheduledFor, status, createdBy)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              `${event.name} - Social Post`,
              JSON.stringify(['facebook', 'instagram', 'twitter']),
              JSON.stringify(postContent),
              event.startDateTime, // Schedule for event date
              'draft',
              req.user!.id,
            ]
          );

          const socialPost = await get('SELECT * FROM social_campaigns WHERE id = ?', [result.id]);
          createdItems.push({ type: 'social_post', data: socialPost });
          break;
        }

        default:
          continue;
      }
    }

    res.json({
      message: `Created ${createdItems.length} item(s) successfully!`,
      items: createdItems,
      campaigns: createdItems.filter(item => item.type === 'campaign').map(item => item.data),
    });
  } catch (error) {
    console.error('Create campaign from event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
