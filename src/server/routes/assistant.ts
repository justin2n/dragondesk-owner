import { Router, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../models/database';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Tool definitions ──────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_members',
    description: 'Search and list members. Can filter by name, email, status, or belt rank. Returns member list with key details.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term for name or email (optional)' },
        status: { type: 'string', enum: ['active', 'inactive', 'prospect'], description: 'Filter by membership status' },
        limit: { type: 'number', description: 'Max results to return (default 20)' },
      },
    },
  },
  {
    name: 'get_member',
    description: 'Get full details for a specific member by their ID.',
    input_schema: {
      type: 'object',
      properties: {
        member_id: { type: 'number', description: 'The member ID' },
      },
      required: ['member_id'],
    },
  },
  {
    name: 'create_member',
    description: 'Create a new member in the CRM.',
    input_schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        status: { type: 'string', enum: ['active', 'inactive', 'prospect'], description: 'Default: prospect' },
        program: { type: 'string', description: 'e.g. BJJ, Muay Thai, Taekwondo' },
        beltRank: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['firstName', 'lastName'],
    },
  },
  {
    name: 'update_member',
    description: 'Update an existing member\'s details.',
    input_schema: {
      type: 'object',
      properties: {
        member_id: { type: 'number' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        status: { type: 'string', enum: ['active', 'inactive', 'prospect'] },
        program: { type: 'string' },
        beltRank: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['member_id'],
    },
  },
  {
    name: 'list_events',
    description: 'List upcoming or recent events. Can filter by type, program, or status.',
    input_schema: {
      type: 'object',
      properties: {
        eventType: { type: 'string', enum: ['class', 'seminar', 'workshop', 'tournament', 'testing', 'social', 'other'] },
        status: { type: 'string', enum: ['scheduled', 'cancelled', 'completed'] },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'create_event',
    description: 'Create a new event.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        eventType: { type: 'string', enum: ['class', 'seminar', 'workshop', 'tournament', 'testing', 'social', 'other'] },
        programType: { type: 'string', enum: ['BJJ', 'Muay Thai', 'Taekwondo', 'All'] },
        startDateTime: { type: 'string', description: 'ISO 8601 format e.g. 2025-06-15T10:00:00' },
        endDateTime: { type: 'string', description: 'ISO 8601 format' },
        description: { type: 'string' },
        location: { type: 'string' },
        maxAttendees: { type: 'number' },
        price: { type: 'number' },
        instructor: { type: 'string' },
      },
      required: ['name', 'eventType', 'startDateTime', 'endDateTime'],
    },
  },
  {
    name: 'update_event',
    description: 'Update an existing event.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'number' },
        name: { type: 'string' },
        status: { type: 'string', enum: ['scheduled', 'cancelled', 'completed'] },
        description: { type: 'string' },
        startDateTime: { type: 'string' },
        endDateTime: { type: 'string' },
        location: { type: 'string' },
        maxAttendees: { type: 'number' },
        price: { type: 'number' },
        instructor: { type: 'string' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'delete_event',
    description: 'Delete an event by ID.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'number' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'list_campaigns',
    description: 'List marketing campaigns.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'list_audiences',
    description: 'List all defined audiences/segments.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_analytics_summary',
    description: 'Get a high-level analytics summary: total members, active members, upcoming events, recent sign-ups, and revenue metrics.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

// ─── Tool executors ────────────────────────────────────────────────────────

async function executeTool(name: string, input: any, userId: number): Promise<string> {
  try {
    switch (name) {
      case 'search_members': {
        const limit = input.limit || 20;
        let query = 'SELECT id, "firstName", "lastName", email, phone, status, program, "beltRank", "createdAt" FROM members WHERE 1=1';
        const params: any[] = [];
        if (input.query) {
          params.push(`%${input.query}%`);
          query += ` AND ("firstName" ILIKE $${params.length} OR "lastName" ILIKE $${params.length} OR email ILIKE $${params.length})`;
        }
        if (input.status) {
          params.push(input.status);
          query += ` AND status = $${params.length}`;
        }
        params.push(limit);
        query += ` ORDER BY "createdAt" DESC LIMIT $${params.length}`;
        const result = await pool.query(query, params);
        return JSON.stringify({ count: result.rows.length, members: result.rows });
      }

      case 'get_member': {
        const result = await pool.query(
          'SELECT * FROM members WHERE id = $1',
          [input.member_id]
        );
        if (result.rows.length === 0) return JSON.stringify({ error: 'Member not found' });
        return JSON.stringify(result.rows[0]);
      }

      case 'create_member': {
        const result = await pool.query(
          `INSERT INTO members ("firstName", "lastName", email, phone, status, program, "beltRank", notes, "createdBy")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [
            input.firstName, input.lastName,
            input.email || null, input.phone || null,
            input.status || 'prospect', input.program || null,
            input.beltRank || null, input.notes || null,
            userId,
          ]
        );
        return JSON.stringify({ success: true, member: result.rows[0] });
      }

      case 'update_member': {
        const fields: string[] = [];
        const params: any[] = [];
        const updatable = ['firstName', 'lastName', 'email', 'phone', 'status', 'program', 'beltRank', 'notes'];
        for (const field of updatable) {
          if (input[field] !== undefined) {
            params.push(input[field]);
            fields.push(`"${field}" = $${params.length}`);
          }
        }
        if (fields.length === 0) return JSON.stringify({ error: 'No fields to update' });
        params.push(input.member_id);
        const result = await pool.query(
          `UPDATE members SET ${fields.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $${params.length} RETURNING *`,
          params
        );
        if (result.rows.length === 0) return JSON.stringify({ error: 'Member not found' });
        return JSON.stringify({ success: true, member: result.rows[0] });
      }

      case 'list_events': {
        const limit = input.limit || 20;
        let query = 'SELECT id, name, "eventType", "programType", "startDateTime", "endDateTime", location, instructor, status, "currentAttendees", "maxAttendees", price FROM events WHERE 1=1';
        const params: any[] = [];
        if (input.eventType) {
          params.push(input.eventType);
          query += ` AND "eventType" = $${params.length}`;
        }
        if (input.status) {
          params.push(input.status);
          query += ` AND status = $${params.length}`;
        }
        params.push(limit);
        query += ` ORDER BY "startDateTime" DESC LIMIT $${params.length}`;
        const result = await pool.query(query, params);
        return JSON.stringify({ count: result.rows.length, events: result.rows });
      }

      case 'create_event': {
        const result = await pool.query(
          `INSERT INTO events (name, "eventType", "programType", "startDateTime", "endDateTime", description, location, "maxAttendees", price, instructor, status, "createdBy")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled', $11) RETURNING *`,
          [
            input.name, input.eventType, input.programType || 'All',
            input.startDateTime, input.endDateTime,
            input.description || null, input.location || null,
            input.maxAttendees || null, input.price || 0,
            input.instructor || null, userId,
          ]
        );
        return JSON.stringify({ success: true, event: result.rows[0] });
      }

      case 'update_event': {
        const fields: string[] = [];
        const params: any[] = [];
        const updatable = ['name', 'eventType', 'programType', 'startDateTime', 'endDateTime', 'description', 'location', 'maxAttendees', 'price', 'instructor', 'status'];
        for (const field of updatable) {
          if (input[field] !== undefined) {
            params.push(input[field]);
            fields.push(`"${field}" = $${params.length}`);
          }
        }
        if (fields.length === 0) return JSON.stringify({ error: 'No fields to update' });
        params.push(input.event_id);
        const result = await pool.query(
          `UPDATE events SET ${fields.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $${params.length} RETURNING *`,
          params
        );
        if (result.rows.length === 0) return JSON.stringify({ error: 'Event not found' });
        return JSON.stringify({ success: true, event: result.rows[0] });
      }

      case 'delete_event': {
        const result = await pool.query('DELETE FROM events WHERE id = $1 RETURNING id', [input.event_id]);
        if (result.rows.length === 0) return JSON.stringify({ error: 'Event not found' });
        return JSON.stringify({ success: true, deleted_id: input.event_id });
      }

      case 'list_campaigns': {
        const limit = input.limit || 20;
        const params: any[] = [limit];
        let statusClause = '';
        if (input.status) {
          params.unshift(input.status);
          statusClause = `WHERE status = $1`;
          params[params.length - 1] = limit;
        }
        const result = await pool.query(
          `SELECT id, name, type, status, "createdAt" FROM campaigns ${statusClause} ORDER BY "createdAt" DESC LIMIT $${params.length}`,
          params
        );
        return JSON.stringify({ count: result.rows.length, campaigns: result.rows });
      }

      case 'list_audiences': {
        const result = await pool.query('SELECT id, name, description FROM audiences ORDER BY name');
        return JSON.stringify({ count: result.rows.length, audiences: result.rows });
      }

      case 'get_analytics_summary': {
        const [members, events, recentSignups] = await Promise.all([
          pool.query(`SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status = 'prospect' THEN 1 ELSE 0 END) AS prospects,
            SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive
            FROM members`),
          pool.query(`SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'scheduled' AND "startDateTime" >= NOW() THEN 1 ELSE 0 END) AS upcoming
            FROM events`),
          pool.query(`SELECT COUNT(*) AS count FROM members WHERE "createdAt" >= NOW() - INTERVAL '30 days'`),
        ]);
        return JSON.stringify({
          members: members.rows[0],
          events: events.rows[0],
          new_members_last_30_days: recentSignups.rows[0].count,
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

// ─── SSE streaming chat endpoint ──────────────────────────────────────────

router.post('/chat', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { messages } = req.body as { messages: Anthropic.MessageParam[] };
  const userId = req.user!.id;
  const userName = `${req.user!.username}`;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering (Railway)

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    (res as any).flush?.(); // Force flush through proxy buffers
  };

  const systemPrompt = `You are the DragonDesk AI assistant — a helpful assistant built into the DragonDesk martial arts CRM platform. You can read and manage data across the entire platform including members, events, campaigns, audiences, and analytics.

The logged-in user is: ${userName} (role: ${req.user!.role})

Key capabilities:
- Search, create, and update members
- Manage events (create, update, delete)
- View campaigns and audiences
- Get analytics summaries

Always be concise and action-oriented. When users ask you to do something, use the available tools to do it directly — don't just describe how to do it. After completing an action, summarize what you did.

Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

  const conversationMessages: Anthropic.MessageParam[] = [...messages];

  try {
    // Agentic loop with streaming
    while (true) {
      const stream = anthropic.messages.stream({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOLS,
        messages: conversationMessages,
      });

      // Stream text deltas to client
      stream.on('text', (delta) => {
        send('delta', { text: delta });
      });

      const message = await stream.finalMessage();

      // Collect any text content for the conversation history
      conversationMessages.push({ role: 'assistant', content: message.content });

      if (message.stop_reason === 'end_turn') break;

      if (message.stop_reason === 'tool_use') {
        const toolUseBlocks = message.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        );

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolBlock of toolUseBlocks) {
          send('tool_start', { name: toolBlock.name, input: toolBlock.input });

          const result = await executeTool(toolBlock.name, toolBlock.input, userId);

          send('tool_end', { name: toolBlock.name });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: result,
          });
        }

        conversationMessages.push({ role: 'user', content: toolResults });
      } else {
        break;
      }
    }

    send('done', {});
    res.end();
  } catch (err: any) {
    send('error', { message: err.message || 'An error occurred' });
    res.end();
  }
});

export default router;
