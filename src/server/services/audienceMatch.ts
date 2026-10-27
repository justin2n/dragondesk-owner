import { pool, query } from '../models/database';
import { buildAudienceQuery } from '../utils/audienceMembers';

// Is this website visitor in an audience? Used to decide which chat agent a
// visitor sees. An audience combines contact filters (stage, programs,
// membership, ...) with website-behavior rules; a visitor must pass both.
// Contact filters can only match a visitor we can tie to a contact, which is
// someone who identified themselves on this browser (a form, a chat signup).

export async function checkBehaviorAudience(
  visitorId: string,
  token: string,
  rules: any[],
  operator: 'any' | 'all'
): Promise<boolean> {
  const results = await Promise.all(rules.map(async (rule) => {
    if (rule.type === 'clicked_selector') {
      const r = await pool.query(
        `SELECT 1 FROM tracking_events WHERE "visitorId"=$1 AND token=$2 AND "eventType"='click' AND selector LIKE $3 LIMIT 1`,
        [visitorId, token, `%${rule.value}%`]
      );
      return r.rows.length > 0;
    }
    if (rule.type === 'visited_page') {
      const r = await pool.query(
        `SELECT 1 FROM tracking_events WHERE "visitorId"=$1 AND token=$2 AND "eventType"='pageview' AND "pagePath" ILIKE $3 LIMIT 1`,
        [visitorId, token, `%${rule.value}%`]
      );
      return r.rows.length > 0;
    }
    if (rule.type === 'submitted_form') {
      const r = await pool.query(
        `SELECT 1 FROM tracking_events WHERE "visitorId"=$1 AND token=$2 AND "eventType"='form_submit' LIMIT 1`,
        [visitorId, token]
      );
      return r.rows.length > 0;
    }
    if (rule.type === 'min_pages') {
      const r = await pool.query(
        `SELECT COUNT(*) as cnt FROM tracking_events WHERE "visitorId"=$1 AND token=$2 AND "eventType"='pageview'`,
        [visitorId, token]
      );
      return parseInt(r.rows[0].cnt) >= parseInt(rule.value);
    }
    return false;
  }));

  return operator === 'all' ? results.every(Boolean) : results.some(Boolean);
}

// The contact this browser belongs to, if it has identified itself.
export async function visitorMemberId(visitorId: string, token: string): Promise<number | null> {
  const r = await pool.query(
    `SELECT "memberId" FROM visitor_identities
      WHERE "visitorId" = $1 AND token = $2 AND "memberId" IS NOT NULL
      ORDER BY (type = 'email') DESC LIMIT 1`,
    [visitorId, token]
  );
  return r.rows[0]?.memberId ?? null;
}

export async function visitorInAudience(audienceId: number, visitorId: string | null, token: string): Promise<boolean> {
  if (!visitorId) return false;
  const a = await pool.query('SELECT filters FROM audiences WHERE id = $1', [audienceId]);
  if (!a.rows[0]) return false;
  const filters = typeof a.rows[0].filters === 'string' ? JSON.parse(a.rows[0].filters) : (a.rows[0].filters || {});

  const behaviorRules = Array.isArray(filters.behaviorRules) ? filters.behaviorRules : [];
  if (behaviorRules.length && !(await checkBehaviorAudience(visitorId, token, behaviorRules, filters.behaviorOperator || 'any'))) {
    return false;
  }

  const { sql, params, filterCount } = buildAudienceQuery(filters, { columns: 'id' });
  if (filterCount === 0) return true; // no contact filters: the behavior rules (already passed) decide
  const memberId = await visitorMemberId(visitorId, token);
  if (!memberId) return false;
  const rows = await query(`${sql} AND id = ? LIMIT 1`, [...params, memberId]);
  return rows.length > 0;
}
