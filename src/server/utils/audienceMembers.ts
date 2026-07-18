import { query, get } from '../models/database';

// Single source of truth for turning an audience's filters into a member query.
// Both the Audiences preview and campaign sending MUST use this so they can
// never drift — a mismatch here is how a campaign can accidentally email every
// member instead of the targeted audience.

export interface AudienceQuery { sql: string; params: any[]; filterCount: number; }

// Build the WHERE clause for the given filters. `filterCount` reports how many
// filter dimensions were actually applied — 0 means the query matches ALL
// members (used by callers to fail closed on unexpected broad sends).
export function buildAudienceQuery(
  filters: any,
  opts: { columns?: string; locationId?: string | number } = {}
): AudienceQuery {
  const columns = opts.columns || '*';
  let sql = `SELECT ${columns} FROM members WHERE 1=1`;
  const params: any[] = [];
  let filterCount = 0;
  const f = filters || {};

  const inClause = (col: string, values: any[]) => {
    sql += ` AND ${col} IN (${values.map(() => '?').join(',')})`;
    params.push(...values);
    filterCount++;
  };

  if (f.locationIds && f.locationIds.length > 0) {
    inClause('"locationId"', f.locationIds);
  } else if (opts.locationId && opts.locationId !== 'all') {
    sql += ' AND "locationId" = ?';
    params.push(opts.locationId);
    // A caller-supplied location scope is not an audience filter, so don't count it.
  }

  if (f.accountStatus?.length) inClause('accountStatus', f.accountStatus);
  if (f.accountType?.length) inClause('accountType', f.accountType);
  if (f.programType?.length) inClause('programType', f.programType);
  if (f.membershipAge?.length) inClause('membershipAge', f.membershipAge);
  if (f.ranking?.length) inClause('ranking', f.ranking);
  if (f.leadSource?.length) inClause('leadSource', f.leadSource);
  if (f.tags?.length) {
    const tagConditions = f.tags.map(() => 'tags LIKE ?').join(' OR ');
    sql += ` AND (${tagConditions})`;
    params.push(...f.tags.map((tag: string) => `%${tag}%`));
    filterCount++;
  }
  if (f.memberType?.length) {
    sql += ` AND COALESCE(memberType, 'account_holder') IN (${f.memberType.map(() => '?').join(',')})`;
    params.push(...f.memberType);
    filterCount++;
  }

  return { sql, params, filterCount };
}

// Resolve an audience id to its matching members. Returns null if the audience
// doesn't exist. `result.filterCount` lets senders refuse an unintended
// send-to-everyone.
export async function resolveAudienceMembers(
  audienceId: number | string,
  opts: { columns?: string; locationId?: string | number } = {}
): Promise<{ members: any[]; filterCount: number } | null> {
  const audience = await get('SELECT * FROM audiences WHERE id = ?', [audienceId]);
  if (!audience) return null;
  const filters = typeof audience.filters === 'string' ? JSON.parse(audience.filters) : audience.filters;
  const { sql, params, filterCount } = buildAudienceQuery(filters, opts);
  const members = await query(sql, params);
  return { members, filterCount };
}
