import { pool } from '../models/database';

// Outreach website chat agents. An instance can run several (one per website,
// say); each lists the domains it appears on. The widget picks the agent whose
// domains match the page it's on, falling back to an agent with no domains.

// Lead-form fields the widget knows how to find on the client's site. Each can
// be pinned to a CSS selector in fieldMap; unmapped fields are auto-detected.
export const NATIVE_FIELDS = ['firstName', 'lastName', 'fullName', 'email', 'phone', 'program', 'location', 'message'] as const;
export type NativeField = typeof NATIVE_FIELDS[number];

export interface InboundAgentConfig {
  id: number;
  name: string;
  domains: string[];
  enabled: boolean;
  agentName: string;
  businessName: string;
  greeting: string;
  trialOffer: string;
  businessInfo: string;
  aiInstructions: string;
  accentColor: string;
  submitNativeForm: boolean;
  formPageUrl: string;
  formSelector: string;
  fieldMap: Partial<Record<NativeField, string>>;
  autoOpen: AutoOpen;
  autoOpenDelay: number;
  autoOpenScroll: number;
  bookingUrl: string;
  bookingLabel: string;
  followUpEnabled: boolean;
  followUpMinutes: number;
  followUpMessage: string;
  requirePhone: boolean;
  updatedAt: string;
}

export const DEFAULT_BOOKING_LABEL = 'Pick your first class';
export const DEFAULT_FOLLOW_UP = "Were you able to pick a class and get started? If anything got in the way, I'm happy to help.";

// When the chat opens without a click: never, after N seconds, or after the
// visitor scrolls N% of the page.
export type AutoOpen = 'off' | 'time' | 'scroll';
const AUTO_OPEN: AutoOpen[] = ['off', 'time', 'scroll'];
const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const DEFAULTS = {
  agentName: 'Website Assistant',
  greeting: 'Hi! Want to try a class? I can get you signed up for our trial in about a minute.',
  accentColor: '#dc2626',
};

// "https://www.Example.com/path" -> "example.com". Returns '' for junk.
export function normalizeDomain(raw: string): string {
  let s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].split(':')[0].replace(/^www\./, '').replace(/\.$/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) || s === 'localhost' ? s : '';
}

export function parseDomains(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(/[\s,;]+/);
  return [...new Set(list.map(d => normalizeDomain(String(d))).filter(Boolean))].slice(0, 20);
}

// Same rule the widget uses: a domain covers itself and its subdomains.
export function domainMatches(host: string, domains: string[]): boolean {
  const h = normalizeDomain(host);
  return !!h && domains.some(d => h === d || h.endsWith('.' + d));
}

function normalize(row: any): InboundAgentConfig {
  return {
    id: row.id,
    name: row.name || `Agent ${row.id}`,
    domains: parseDomains(row.domains),
    enabled: !!row.enabled,
    agentName: row.agentName || DEFAULTS.agentName,
    businessName: row.businessName || '',
    greeting: row.greeting || DEFAULTS.greeting,
    trialOffer: row.trialOffer || '',
    businessInfo: row.businessInfo || '',
    aiInstructions: row.aiInstructions || '',
    accentColor: row.accentColor || DEFAULTS.accentColor,
    submitNativeForm: row.submitNativeForm !== false,
    formPageUrl: row.formPageUrl || '',
    formSelector: row.formSelector || '',
    fieldMap: (typeof row.fieldMap === 'string' ? JSON.parse(row.fieldMap) : row.fieldMap) || {},
    autoOpen: AUTO_OPEN.includes(row.autoOpen) ? row.autoOpen : 'off',
    autoOpenDelay: clampInt(row.autoOpenDelay, 1, 600, 10),
    autoOpenScroll: clampInt(row.autoOpenScroll, 5, 100, 50),
    bookingUrl: row.bookingUrl || '',
    bookingLabel: row.bookingLabel || DEFAULT_BOOKING_LABEL,
    followUpEnabled: row.followUpEnabled !== false,
    followUpMinutes: clampInt(row.followUpMinutes, 1, 120, 3),
    followUpMessage: row.followUpMessage || DEFAULT_FOLLOW_UP,
    requirePhone: row.requirePhone !== false,
    updatedAt: row.updatedAt,
  };
}

// All agents, oldest first. Creates the first one on an empty table so the
// admin screen always has something to edit.
export async function listAgents(): Promise<InboundAgentConfig[]> {
  let result = await pool.query('SELECT * FROM inbound_agent_config ORDER BY id');
  if (result.rows.length === 0) {
    result = await pool.query(`INSERT INTO inbound_agent_config (enabled, name) VALUES (false, 'Main website') RETURNING *`);
  }
  return result.rows.map(normalize);
}

export async function getAgent(id: number): Promise<InboundAgentConfig | null> {
  if (!Number.isInteger(id)) return null;
  const result = await pool.query('SELECT * FROM inbound_agent_config WHERE id = $1', [id]);
  return result.rows[0] ? normalize(result.rows[0]) : null;
}

export async function createAgent(input: Partial<InboundAgentConfig>, userId: number): Promise<InboundAgentConfig> {
  const result = await pool.query(
    `INSERT INTO inbound_agent_config (enabled, name, "updatedBy") VALUES (false, $1, $2) RETURNING *`,
    [String(input.name || 'New website').trim().slice(0, 80) || 'New website', userId]
  );
  return saveAgent(result.rows[0].id, { ...input, enabled: false }, userId) as Promise<InboundAgentConfig>;
}

export async function saveAgent(id: number, input: Partial<InboundAgentConfig>, userId: number): Promise<InboundAgentConfig | null> {
  const current = await getAgent(id);
  if (!current) return null;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

  const fieldMap: Partial<Record<NativeField, string>> = {};
  const rawMap = (input.fieldMap && typeof input.fieldMap === 'object') ? input.fieldMap : current.fieldMap;
  for (const key of NATIVE_FIELDS) {
    const sel = str((rawMap as any)[key], 300);
    if (sel) fieldMap[key] = sel;
  }

  const accent = str(input.accentColor, 20);
  const next = {
    name: str(input.name, 80) || current.name,
    domains: input.domains === undefined ? current.domains : parseDomains(input.domains),
    enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    agentName: str(input.agentName, 80) ?? current.agentName,
    businessName: str(input.businessName, 120) ?? current.businessName,
    greeting: str(input.greeting, 500) ?? current.greeting,
    trialOffer: str(input.trialOffer, 2000) ?? current.trialOffer,
    businessInfo: str(input.businessInfo, 8000) ?? current.businessInfo,
    aiInstructions: str(input.aiInstructions, 4000) ?? current.aiInstructions,
    accentColor: accent && /^#[0-9a-fA-F]{3,8}$/.test(accent) ? accent : current.accentColor,
    submitNativeForm: typeof input.submitNativeForm === 'boolean' ? input.submitNativeForm : current.submitNativeForm,
    formPageUrl: str(input.formPageUrl, 1000) ?? current.formPageUrl,
    formSelector: str(input.formSelector, 300) ?? current.formSelector,
    autoOpen: AUTO_OPEN.includes(input.autoOpen as AutoOpen) ? input.autoOpen as AutoOpen : current.autoOpen,
    autoOpenDelay: input.autoOpenDelay === undefined ? current.autoOpenDelay : clampInt(input.autoOpenDelay, 1, 600, current.autoOpenDelay),
    autoOpenScroll: input.autoOpenScroll === undefined ? current.autoOpenScroll : clampInt(input.autoOpenScroll, 5, 100, current.autoOpenScroll),
    bookingUrl: input.bookingUrl === undefined ? current.bookingUrl : httpUrl(input.bookingUrl),
    bookingLabel: str(input.bookingLabel, 40) || current.bookingLabel,
    followUpEnabled: typeof input.followUpEnabled === 'boolean' ? input.followUpEnabled : current.followUpEnabled,
    followUpMinutes: input.followUpMinutes === undefined ? current.followUpMinutes : clampInt(input.followUpMinutes, 1, 120, current.followUpMinutes),
    followUpMessage: str(input.followUpMessage, 500) || current.followUpMessage,
    requirePhone: typeof input.requirePhone === 'boolean' ? input.requirePhone : current.requirePhone,
  };

  const result = await pool.query(
    `UPDATE inbound_agent_config SET
       name=$1, domains=$2, enabled=$3, "agentName"=$4, "businessName"=$5, greeting=$6, "trialOffer"=$7,
       "businessInfo"=$8, "aiInstructions"=$9, "accentColor"=$10, "submitNativeForm"=$11,
       "formPageUrl"=$12, "formSelector"=$13, "fieldMap"=$14, "updatedBy"=$15,
       "autoOpen"=$17, "autoOpenDelay"=$18, "autoOpenScroll"=$19,
       "bookingUrl"=$20, "bookingLabel"=$21, "followUpEnabled"=$22, "followUpMinutes"=$23,
       "followUpMessage"=$24, "requirePhone"=$25,
       "updatedAt"=CURRENT_TIMESTAMP
     WHERE id=$16 RETURNING *`,
    [next.name, next.domains.join(','), next.enabled, next.agentName, next.businessName, next.greeting,
     next.trialOffer, next.businessInfo, next.aiInstructions, next.accentColor, next.submitNativeForm,
     next.formPageUrl, next.formSelector, JSON.stringify(fieldMap), userId, id,
     next.autoOpen, next.autoOpenDelay, next.autoOpenScroll,
     next.bookingUrl, next.bookingLabel, next.followUpEnabled, next.followUpMinutes,
     next.followUpMessage, next.requirePhone]
  );
  return normalize(result.rows[0]);
}

export async function deleteAgent(id: number): Promise<boolean> {
  const result = await pool.query('DELETE FROM inbound_agent_config WHERE id = $1', [id]);
  return (result.rowCount || 0) > 0;
}

// The agent for a page: an enabled agent listing its domain, else an enabled
// agent with no domains (the catch-all). Mirrors the widget's own choice, for
// chats sent by scripts cached from before an agent id was included.
export function pickAgentForHost(agents: InboundAgentConfig[], host: string): InboundAgentConfig | null {
  const live = agents.filter(a => a.enabled);
  return live.find(a => a.domains.length && domainMatches(host, a.domains))
    || live.find(a => !a.domains.length)
    || null;
}

// What the widget needs in the browser. Never includes the prompt material.
export function publicAgentConfig(cfg: InboundAgentConfig) {
  return {
    id: cfg.id,
    domains: cfg.domains,
    agentName: cfg.agentName,
    greeting: cfg.greeting,
    accentColor: cfg.accentColor,
    submitNativeForm: cfg.submitNativeForm,
    formPageUrl: cfg.formPageUrl,
    formSelector: cfg.formSelector,
    fieldMap: cfg.fieldMap,
    autoOpen: cfg.autoOpen,
    autoOpenDelay: cfg.autoOpenDelay,
    autoOpenScroll: cfg.autoOpenScroll,
    bookingUrl: cfg.bookingUrl,
    followUpEnabled: cfg.followUpEnabled,
    followUpMinutes: cfg.followUpMinutes,
  };
}

// '' unless it's an absolute http(s) URL.
export function httpUrl(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().slice(0, 1000) : '';
  try { return /^https?:$/.test(new URL(s).protocol) ? s : ''; } catch { return ''; }
}

// Same page, ignoring scheme, www, trailing slash, and hash.
export function sameUrl(a: string, b: string): boolean {
  const norm = (u: string) => {
    try {
      const x = new URL(u);
      return x.hostname.replace(/^www\./, '').toLowerCase() + x.pathname.replace(/\/+$/, '') + x.search;
    } catch { return ''; }
  };
  const na = norm(a);
  return !!na && na === norm(b);
}

// A form page the agent can actually fill: on one of its own websites (the
// browser blocks scripting other sites). Returns an error message or null.
export function formPageProblem(formPageUrl: string, domains: string[]): string | null {
  if (!formPageUrl) return null;
  let host = '';
  try { host = new URL(formPageUrl).hostname; } catch { return 'The form page URL is not a valid web address.'; }
  if (domains.length && !domainMatches(host, domains)) {
    return `The form page has to be on one of this agent's websites (${domains.join(', ')}). ` +
      `Browsers don't let a website fill in another site's form. If ${normalizeDomain(host)} is where visitors book, put it in Booking link instead.`;
  }
  return null;
}
