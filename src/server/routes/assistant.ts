import { serverError } from '../utils/errors';
import { Router, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../models/database';
import { computeSignificance } from '../utils/abStats';
import { stampIfSignificant } from '../services/abSignificance';
import { getOptimizeSettings } from '../services/optimizeSettings';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Tool definitions ──────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_members',
    description: 'Search and list members. Can filter by name, email, or account status. Returns member list with key details.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term for name or email (optional)' },
        status: { type: 'string', enum: ['lead', 'trialer', 'member', 'cancelled'], description: 'Filter by account status' },
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
        accountStatus: { type: 'string', enum: ['lead', 'trialer', 'member', 'cancelled'], description: 'Default: lead' },
        programType: { type: 'string', description: 'e.g. Adult BJJ, Adult Muay Thai & Kickboxing, No Program Selected' },
        ranking: { type: 'string', description: 'Belt rank e.g. White, Blue, Purple, Brown, Black' },
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
        accountStatus: { type: 'string', enum: ['lead', 'trialer', 'member', 'cancelled'] },
        programType: { type: 'string' },
        ranking: { type: 'string' },
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

  // ─── DragonDesk: Optimize ──────────────────────────────────────────────────
  {
    name: 'list_experiences',
    description: 'List DragonDesk: Optimize website experiences (A/B tests) — page edits, promo bars, and offer modals. Use this to see what is running, what is still a draft, and which experiences have already crossed 95% statistical significance and are ready to ship.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'running', 'completed'], description: 'Filter by status' },
        experienceType: { type: 'string', enum: ['page_edit', 'promo_bar', 'offer_modal'], description: 'Filter by experience type' },
        significantOnly: { type: 'boolean', description: 'Only return experiences that have reached statistical significance' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'get_experience',
    description: 'Get the full configuration of one Optimize experience by ID — both variants, the conversion goal, targeting, traffic split, and audience.',
    input_schema: {
      type: 'object',
      properties: {
        experience_id: { type: 'number', description: 'The experience (A/B test) ID' },
      },
      required: ['experience_id'],
    },
  },
  {
    name: 'get_experience_results',
    description: 'Get performance results for an Optimize experience: per-variant views, clicks, conversions, CTR, conversion rate, plus a two-proportion z-test verdict (confidence, winner, lift) and a plain-English recommendation on whether to ship, keep running, or stop. Use this whenever the user asks how an experience is doing or which variant is winning.',
    input_schema: {
      type: 'object',
      properties: {
        experience_id: { type: 'number', description: 'The experience (A/B test) ID' },
      },
      required: ['experience_id'],
    },
  },
  {
    name: 'create_experience',
    description: "Create a new Optimize experience. For 'promo_bar' and 'offer_modal', supply the promoBar/offerModal config and the treatment is shown to the percentage of visitors in trafficSplit (default 100). For 'page_edit', supply variantA (control) and variantB (treatment) copy. Created as a draft unless status says otherwise.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the experience' },
        experienceType: { type: 'string', enum: ['page_edit', 'promo_bar', 'offer_modal'], description: 'Default: page_edit' },
        status: { type: 'string', enum: ['draft', 'running'], description: 'Default: draft' },
        pageUrl: { type: 'string', description: 'The page this experience runs on' },
        audienceId: { type: 'number', description: 'Audience to target. Omit to show to everyone.' },
        trafficSplit: { type: 'number', description: 'Percent of visitors seeing variant B. Default 50 for page_edit, 100 for promo_bar/offer_modal.' },
        goal: {
          type: 'object',
          description: 'Conversion goal. Completing it records a lead, which drives the conversion rate and winner.',
          properties: {
            type: { type: 'string', enum: ['none', 'form_submit', 'tel_click', 'email_click', 'selector_click'] },
            selector: { type: 'string', description: 'CSS selector, required when type is selector_click' },
          },
          required: ['type'],
        },
        variantA: {
          type: 'object',
          description: 'Control copy (page_edit only)',
          properties: {
            title: { type: 'string' }, headline: { type: 'string' }, content: { type: 'string' },
            cta: { type: 'string' }, ctaLink: { type: 'string' }, image: { type: 'string' },
          },
        },
        variantB: {
          type: 'object',
          description: 'Treatment copy (page_edit only)',
          properties: {
            title: { type: 'string' }, headline: { type: 'string' }, content: { type: 'string' },
            cta: { type: 'string' }, ctaLink: { type: 'string' }, image: { type: 'string' },
          },
        },
        promoBar: {
          type: 'object',
          description: 'Promo bar config (promo_bar only)',
          properties: {
            message: { type: 'string' }, ctaLabel: { type: 'string' }, ctaLink: { type: 'string' },
            bgColor: { type: 'string', description: 'Hex colour e.g. #c0392b' },
            textColor: { type: 'string', description: 'Hex colour e.g. #ffffff' },
            position: { type: 'string', enum: ['top', 'bottom'] },
            dismissible: { type: 'boolean' },
            frequency: { type: 'string', enum: ['session', 'once', 'always'] },
          },
        },
        offerModal: {
          type: 'object',
          description: 'Offer modal config (offer_modal only)',
          properties: {
            heading: { type: 'string' }, body: { type: 'string' }, imageUrl: { type: 'string' },
            ctaLabel: { type: 'string' }, ctaLink: { type: 'string' },
            bgColor: { type: 'string' }, textColor: { type: 'string' }, accentColor: { type: 'string' },
            triggerType: { type: 'string', enum: ['load', 'exit', 'scroll'] },
            delaySeconds: { type: 'number', description: 'Used when triggerType is load' },
            scrollPct: { type: 'number', description: 'Used when triggerType is scroll' },
            dismissible: { type: 'boolean' },
            frequency: { type: 'string', enum: ['session', 'once', 'always'] },
          },
        },
        targeting: {
          type: 'object',
          description: 'Where a bar/modal shows (promo_bar and offer_modal only)',
          properties: {
            scope: { type: 'string', enum: ['site', 'page'] },
            matchType: { type: 'string', enum: ['contains', 'exact', 'startsWith'] },
            value: { type: 'string', description: 'Path to match when scope is page' },
          },
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_experience',
    description: "Update an Optimize experience. Use this to start one (status 'running'), stop one (status 'completed'), retarget it, or change its copy. Only the fields you pass are changed.",
    input_schema: {
      type: 'object',
      properties: {
        experience_id: { type: 'number' },
        name: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'running', 'completed'], description: "'running' starts it, 'completed' stops it" },
        pageUrl: { type: 'string' },
        audienceId: { type: 'number' },
        trafficSplit: { type: 'number' },
        goal: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['none', 'form_submit', 'tel_click', 'email_click', 'selector_click'] },
            selector: { type: 'string' },
          },
          required: ['type'],
        },
        variantA: {
          type: 'object',
          properties: {
            title: { type: 'string' }, headline: { type: 'string' }, content: { type: 'string' },
            cta: { type: 'string' }, ctaLink: { type: 'string' }, image: { type: 'string' },
          },
        },
        variantB: {
          type: 'object',
          properties: {
            title: { type: 'string' }, headline: { type: 'string' }, content: { type: 'string' },
            cta: { type: 'string' }, ctaLink: { type: 'string' }, image: { type: 'string' },
          },
        },
        promoBar: {
          type: 'object',
          properties: {
            message: { type: 'string' }, ctaLabel: { type: 'string' }, ctaLink: { type: 'string' },
            bgColor: { type: 'string' }, textColor: { type: 'string' },
            position: { type: 'string', enum: ['top', 'bottom'] },
            dismissible: { type: 'boolean' },
            frequency: { type: 'string', enum: ['session', 'once', 'always'] },
          },
        },
        offerModal: {
          type: 'object',
          properties: {
            heading: { type: 'string' }, body: { type: 'string' }, imageUrl: { type: 'string' },
            ctaLabel: { type: 'string' }, ctaLink: { type: 'string' },
            bgColor: { type: 'string' }, textColor: { type: 'string' }, accentColor: { type: 'string' },
            triggerType: { type: 'string', enum: ['load', 'exit', 'scroll'] },
            delaySeconds: { type: 'number' }, scrollPct: { type: 'number' },
            dismissible: { type: 'boolean' },
            frequency: { type: 'string', enum: ['session', 'once', 'always'] },
          },
        },
        targeting: {
          type: 'object',
          properties: {
            scope: { type: 'string', enum: ['site', 'page'] },
            matchType: { type: 'string', enum: ['contains', 'exact', 'startsWith'] },
            value: { type: 'string' },
          },
        },
      },
      required: ['experience_id'],
    },
  },
  {
    name: 'delete_experience',
    description: 'Delete an Optimize experience and all of its recorded analytics events. This cannot be undone — confirm with the user first.',
    input_schema: {
      type: 'object',
      properties: {
        experience_id: { type: 'number' },
      },
      required: ['experience_id'],
    },
  },
];

// ─── Optimize helpers ──────────────────────────────────────────────────────
// Variant/goal config is stored as JSON text on ab_tests. These defaults mirror
// the ones the Optimize UI seeds a new experience with, so an experience the
// assistant creates renders and edits exactly like a hand-built one.

const EXPERIENCE_TYPES = ['page_edit', 'promo_bar', 'offer_modal'];

const DEFAULT_PROMO_BAR = {
  message: 'Join today and get your first month free!',
  ctaLabel: 'Claim Offer', ctaLink: '',
  bgColor: '#c0392b', textColor: '#ffffff',
  position: 'top', dismissible: true, frequency: 'session',
};
const DEFAULT_OFFER_MODAL = {
  heading: 'Limited-time offer', body: 'Sign up this week and get your first month free.',
  imageUrl: '', ctaLabel: 'Get Started', ctaLink: '',
  bgColor: '#ffffff', textColor: '#1a1a2e', accentColor: '#c0392b',
  trigger: { type: 'load', delaySeconds: 3, scrollPct: 50 },
  dismissible: true, frequency: 'session',
};
const DEFAULT_TARGETING = { scope: 'site', matchType: 'contains', value: '' };
const EMPTY_VARIANT = { title: '', headline: '', content: '', cta: '', ctaLink: '', image: '', changes: [] as any[] };

function parseJson(value: any, fallback: any = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// The tool schema takes the modal trigger flat (triggerType/delaySeconds/
// scrollPct) because nested objects are easy for a model to get wrong; the
// stored shape nests them under `trigger`.
function buildOfferModal(patch: any, base: any) {
  const { triggerType, delaySeconds, scrollPct, ...rest } = patch || {};
  const trigger = { ...base.trigger };
  if (triggerType !== undefined) trigger.type = triggerType;
  if (delaySeconds !== undefined) trigger.delaySeconds = delaySeconds;
  if (scrollPct !== undefined) trigger.scrollPct = scrollPct;
  return { ...base, ...rest, trigger };
}

// A is always the control. For bar/modal experiences the treatment config rides
// inside B — the same two-variant structure page edits use.
function buildVariants(experienceType: string, input: any, existingA: any, existingB: any) {
  const a = { ...EMPTY_VARIANT, ...(existingA || {}), ...(input.variantA || {}) };
  const b: any = { ...EMPTY_VARIANT, ...(existingB || {}), ...(input.variantB || {}) };

  if (experienceType === 'promo_bar') {
    b.promoBar = { ...DEFAULT_PROMO_BAR, ...(existingB?.promoBar || {}), ...(input.promoBar || {}) };
  }
  if (experienceType === 'offer_modal') {
    b.offerModal = buildOfferModal(input.offerModal, { ...DEFAULT_OFFER_MODAL, ...(existingB?.offerModal || {}) });
  }
  if (experienceType !== 'page_edit') {
    b.targeting = { ...DEFAULT_TARGETING, ...(existingB?.targeting || {}), ...(input.targeting || {}) };
  }
  return { a, b };
}

// A goal of 'none' is stored as NULL — that's what "track views & clicks only"
// means to the analytics side.
function buildGoal(goal: any): string | null {
  if (!goal || !goal.type || goal.type === 'none') return null;
  return JSON.stringify(
    goal.type === 'selector_click' && goal.selector
      ? { type: goal.type, selector: goal.selector }
      : { type: goal.type },
  );
}

// ─── Tool executors ────────────────────────────────────────────────────────

async function executeTool(name: string, input: any, userId: number): Promise<string> {
  try {
    switch (name) {
      case 'search_members': {
        const limit = input.limit || 20;
        let query = 'SELECT id, "firstName", "lastName", email, phone, "accountStatus", "programType", ranking, "createdAt" FROM members WHERE 1=1';
        const params: any[] = [];
        if (input.query) {
          params.push(`%${input.query}%`);
          query += ` AND ("firstName" ILIKE $${params.length} OR "lastName" ILIKE $${params.length} OR email ILIKE $${params.length})`;
        }
        if (input.status) {
          params.push(input.status);
          query += ` AND "accountStatus" = $${params.length}`;
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
          `INSERT INTO members ("firstName", "lastName", email, phone, "accountStatus", "accountType", "programType", ranking, notes, "locationId")
           VALUES ($1, $2, $3, $4, $5, 'basic', $6, $7, $8,
             (SELECT id FROM locations WHERE "isPrimary" = true LIMIT 1))
           RETURNING *`,
          [
            input.firstName, input.lastName,
            input.email || null, input.phone || null,
            input.accountStatus || 'lead',
            input.programType || 'No Program Selected',
            input.ranking || 'White',
            input.notes || null,
          ]
        );
        return JSON.stringify({ success: true, member: result.rows[0] });
      }

      case 'update_member': {
        const fields: string[] = [];
        const params: any[] = [];
        const updatable = ['firstName', 'lastName', 'email', 'phone', 'accountStatus', 'programType', 'ranking', 'notes'];
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
            SUM(CASE WHEN "accountStatus" = 'member' THEN 1 ELSE 0 END) AS active_members,
            SUM(CASE WHEN "accountStatus" = 'trialer' THEN 1 ELSE 0 END) AS trialers,
            SUM(CASE WHEN "accountStatus" = 'lead' THEN 1 ELSE 0 END) AS leads,
            SUM(CASE WHEN "accountStatus" = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
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
          new_contacts_last_30_days: recentSignups.rows[0].count,
        });
      }


      // ─── DragonDesk: Optimize ────────────────────────────────────────────

      case 'list_experiences': {
        const limit = input.limit || 20;
        let sql = `SELECT t.id, t.name, t.status, t."experienceType", t."pageUrl", t."trafficSplit",
                          t."audienceId", a.name AS "audienceName", t.goal,
                          t."sigReachedAt", t."sigWinner", t."sigConfidence", t."createdAt"
                   FROM ab_tests t
                   LEFT JOIN audiences a ON a.id = t."audienceId"
                   WHERE 1=1`;
        const params: any[] = [];
        if (input.status) {
          params.push(input.status);
          sql += ` AND t.status = $${params.length}`;
        }
        if (input.experienceType) {
          params.push(input.experienceType);
          sql += ` AND t."experienceType" = $${params.length}`;
        }
        if (input.significantOnly) sql += ` AND t."sigReachedAt" IS NOT NULL`;
        params.push(limit);
        sql += ` ORDER BY t."createdAt" DESC LIMIT $${params.length}`;
        const result = await pool.query(sql, params);
        return JSON.stringify({
          count: result.rows.length,
          experiences: result.rows.map((r: any) => ({
            ...r,
            experienceType: r.experienceType || 'page_edit',
            goal: parseJson(r.goal),
            audience: r.audienceName || 'Everyone',
            reachedSignificance: !!r.sigReachedAt,
          })),
        });
      }

      case 'get_experience': {
        const result = await pool.query(
          `SELECT t.*, a.name AS "audienceName" FROM ab_tests t
           LEFT JOIN audiences a ON a.id = t."audienceId" WHERE t.id = $1`,
          [input.experience_id]
        );
        if (result.rows.length === 0) return JSON.stringify({ error: 'Experience not found' });
        const row = result.rows[0];
        return JSON.stringify({
          ...row,
          experienceType: row.experienceType || 'page_edit',
          variantA: parseJson(row.variantA),
          variantB: parseJson(row.variantB),
          goal: parseJson(row.goal),
          results: parseJson(row.results),
          audience: row.audienceName || 'Everyone',
        });
      }

      case 'get_experience_results': {
        const testId = input.experience_id;
        const test = await pool.query(
          `SELECT id, name, status, "experienceType", goal, "sigReachedAt", "sigWinner"
           FROM ab_tests WHERE id = $1`,
          [testId]
        );
        if (test.rows.length === 0) return JSON.stringify({ error: 'Experience not found' });

        const rows = (await pool.query(
          `SELECT variant,
                  COUNT(*) FILTER (WHERE "eventType" = 'view')   AS views,
                  COUNT(*) FILTER (WHERE "eventType" = 'click')  AS clicks,
                  COUNT(*) FILTER (WHERE "eventType" = 'lead')   AS leads,
                  COUNT(*) FILTER (WHERE "eventType" = 'bounce') AS bounces,
                  COUNT(DISTINCT "sessionId") AS "uniqueVisitors"
           FROM ab_test_events WHERE "testId" = $1 GROUP BY variant`,
          [testId]
        )).rows;

        const pick = (v: string) => {
          const r = rows.find((x: any) => x.variant === v);
          const views = Number(r?.views) || 0;
          const clicks = Number(r?.clicks) || 0;
          const leads = Number(r?.leads) || 0;
          return {
            variant: v, views, clicks, leads,
            bounces: Number(r?.bounces) || 0,
            uniqueVisitors: Number(r?.uniqueVisitors) || 0,
            ctr: views > 0 ? Number(((clicks / views) * 100).toFixed(2)) : 0,
            conversionRate: views > 0 ? Number(((leads / views) * 100).toFixed(2)) : 0,
          };
        };
        const A = pick('A');
        const B = pick('B');

        // Recent traffic rate drives the time-to-significance forecast — same
        // basis the Optimize analytics view uses.
        const dayRow = (await pool.query(
          `SELECT COUNT(DISTINCT ("createdAt")::date) AS days FROM ab_test_events
           WHERE "testId" = $1 AND "createdAt" >= NOW() - INTERVAL '30 days'`,
          [testId]
        )).rows[0];
        const days = Number(dayRow?.days) || 1;

        const significance = computeSignificance(
          { views: A.views, conversions: A.leads },
          { views: B.views, conversions: B.leads },
          (A.views + B.views) / days,
          await getOptimizeSettings(),
        );
        // Same milestone stamp the analytics view performs. Idempotent.
        stampIfSignificant(Number(testId), significance).catch(() => {});

        return JSON.stringify({
          experience: { ...test.rows[0], goal: parseJson(test.rows[0].goal) },
          variants: [A, B],
          significance,
        });
      }

      case 'create_experience': {
        const experienceType = EXPERIENCE_TYPES.includes(input.experienceType)
          ? input.experienceType
          : 'page_edit';
        const status = input.status === 'running' ? 'running' : 'draft';

        if (input.audienceId) {
          const aud = await pool.query('SELECT id FROM audiences WHERE id = $1', [input.audienceId]);
          if (aud.rows.length === 0) return JSON.stringify({ error: 'Audience not found' });
        }

        const { a, b } = buildVariants(experienceType, input, null, null);
        const trafficSplit = input.trafficSplit ?? (experienceType === 'page_edit' ? 50 : 100);

        const result = await pool.query(
          `INSERT INTO ab_tests (name, "audienceId", "pageUrl", "trafficSplit", "variantA", "variantB",
                                 status, "experienceType", goal, "createdBy")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
          [
            input.name, input.audienceId || null, input.pageUrl || null, trafficSplit,
            JSON.stringify(a), JSON.stringify(b), status, experienceType,
            buildGoal(input.goal), userId,
          ]
        );
        const row = result.rows[0];
        return JSON.stringify({
          success: true,
          experience: {
            ...row,
            variantA: parseJson(row.variantA),
            variantB: parseJson(row.variantB),
            goal: parseJson(row.goal),
          },
        });
      }

      case 'update_experience': {
        const existing = (await pool.query('SELECT * FROM ab_tests WHERE id = $1', [input.experience_id])).rows[0];
        if (!existing) return JSON.stringify({ error: 'Experience not found' });

        const experienceType = EXPERIENCE_TYPES.includes(input.experienceType)
          ? input.experienceType
          : (existing.experienceType || 'page_edit');

        if (input.audienceId) {
          const aud = await pool.query('SELECT id FROM audiences WHERE id = $1', [input.audienceId]);
          if (aud.rows.length === 0) return JSON.stringify({ error: 'Audience not found' });
        }

        const fields: string[] = [];
        const params: any[] = [];
        const set = (col: string, value: any) => {
          params.push(value);
          fields.push(`"${col}" = $${params.length}`);
        };

        if (input.name !== undefined) set('name', input.name);
        if (input.status !== undefined) set('status', input.status);
        if (input.pageUrl !== undefined) set('pageUrl', input.pageUrl);
        if (input.audienceId !== undefined) set('audienceId', input.audienceId || null);
        if (input.trafficSplit !== undefined) set('trafficSplit', input.trafficSplit);
        if (input.experienceType !== undefined) set('experienceType', experienceType);
        if (input.goal !== undefined) set('goal', buildGoal(input.goal));

        // Only rebuild the variant pair when variant/config fields were supplied,
        // so a plain status change can't rewrite the creative.
        const touchesVariants = ['variantA', 'variantB', 'promoBar', 'offerModal', 'targeting']
          .some((k) => input[k] !== undefined);
        if (touchesVariants || input.experienceType !== undefined) {
          const { a, b } = buildVariants(
            experienceType, input,
            parseJson(existing.variantA, {}), parseJson(existing.variantB, {}),
          );
          set('variantA', JSON.stringify(a));
          set('variantB', JSON.stringify(b));
        }

        if (fields.length === 0) return JSON.stringify({ error: 'No fields to update' });

        params.push(input.experience_id);
        const result = await pool.query(
          `UPDATE ab_tests SET ${fields.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP
           WHERE id = $${params.length} RETURNING *`,
          params
        );
        const row = result.rows[0];
        return JSON.stringify({
          success: true,
          experience: {
            ...row,
            variantA: parseJson(row.variantA),
            variantB: parseJson(row.variantB),
            goal: parseJson(row.goal),
          },
        });
      }

      case 'delete_experience': {
        const result = await pool.query(
          'DELETE FROM ab_tests WHERE id = $1 RETURNING id, name',
          [input.experience_id]
        );
        if (result.rows.length === 0) return JSON.stringify({ error: 'Experience not found' });
        return JSON.stringify({ success: true, deleted_id: input.experience_id, name: result.rows[0].name });
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
- Run DragonDesk: Optimize — website experiences (A/B tests)

DragonDesk: Optimize
An experience is an A/B test on the studio's website. There are three kinds:
- page_edit — changes text or styles on an existing page. Variant A is the control, B is the treatment, and trafficSplit is the percentage who see B (usually 50).
- promo_bar — a banner injected at the top or bottom of the site.
- offer_modal — a popup triggered on load, exit intent, or scroll depth.
Bars and modals have no meaningful control, so they default to a trafficSplit of 100 — everyone in the audience sees them.

Each experience can have a conversion goal (a form submit, a phone or email click, or a click on a specific CSS selector). Completing the goal records a conversion, which is what the conversion rate and the winner are calculated from. An experience with no goal only tracks views and clicks, so it can never declare a winner — if the user creates one without a goal, mention that.

An experience with no audience shows to everyone. Leave audienceId unset for that rather than hunting for an "All Traffic" audience.

Reading results: get_experience_results returns a two-proportion z-test verdict. Report it honestly and only describe a variant as the winner when status is 'significant' — an early lead is not a result. How to answer "how close are we?" depends on the status:
- 'insufficient_data' — there is not yet enough data to attempt a verdict. Read dataGate for exactly what is missing (views still needed per arm, conversions still needed, and days at current traffic) and give those numbers.
- 'not_significant' — the test is live and measurable. Give the confidence against the 95% target, and read projection for the visitors and days still needed.
- 'significant' — say which variant won, the confidence, and the lift, then offer to stop the experience.
Both dataGate.daysRemaining and projection are estimates from current traffic and the effect measured so far, so they move as data lands — present them as a live forecast, not a countdown. When either is null the forecast is genuinely not projectable yet; say that rather than substituting a guess.

Experiences start as drafts. Starting one is update_experience with status 'running'; stopping one is status 'completed'. Deleting an experience also destroys its recorded analytics, so always confirm before calling delete_experience.

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
