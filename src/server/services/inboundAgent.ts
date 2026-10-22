import { pool } from '../models/database';

// Lead-form fields the widget knows how to find on the client's site. Each can
// be pinned to a CSS selector in fieldMap; unmapped fields are auto-detected.
export const NATIVE_FIELDS = ['firstName', 'lastName', 'fullName', 'email', 'phone', 'program', 'message'] as const;
export type NativeField = typeof NATIVE_FIELDS[number];

export interface InboundAgentConfig {
  id: number;
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
  updatedAt: string;
}

const DEFAULTS = {
  agentName: 'Website Assistant',
  greeting: 'Hi! Want to try a class? I can get you signed up for our trial in about a minute.',
  accentColor: '#dc2626',
};

function normalize(row: any): InboundAgentConfig {
  return {
    id: row.id,
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
    updatedAt: row.updatedAt,
  };
}

// Single-row config, created on first read.
export async function getAgentConfig(): Promise<InboundAgentConfig> {
  let result = await pool.query('SELECT * FROM inbound_agent_config ORDER BY id LIMIT 1');
  if (result.rows.length === 0) {
    result = await pool.query('INSERT INTO inbound_agent_config (enabled) VALUES (false) RETURNING *');
  }
  return normalize(result.rows[0]);
}

export async function saveAgentConfig(input: Partial<InboundAgentConfig>, userId: number): Promise<InboundAgentConfig> {
  const current = await getAgentConfig();
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

  const fieldMap: Partial<Record<NativeField, string>> = {};
  const rawMap = (input.fieldMap && typeof input.fieldMap === 'object') ? input.fieldMap : current.fieldMap;
  for (const key of NATIVE_FIELDS) {
    const sel = str((rawMap as any)[key], 300);
    if (sel) fieldMap[key] = sel;
  }

  const accent = str(input.accentColor, 20);
  const next = {
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
  };

  const result = await pool.query(
    `UPDATE inbound_agent_config SET
       enabled=$1, "agentName"=$2, "businessName"=$3, greeting=$4, "trialOffer"=$5,
       "businessInfo"=$6, "aiInstructions"=$7, "accentColor"=$8, "submitNativeForm"=$9,
       "formPageUrl"=$10, "formSelector"=$11, "fieldMap"=$12, "updatedBy"=$13,
       "updatedAt"=CURRENT_TIMESTAMP
     WHERE id=$14 RETURNING *`,
    [next.enabled, next.agentName, next.businessName, next.greeting, next.trialOffer,
     next.businessInfo, next.aiInstructions, next.accentColor, next.submitNativeForm,
     next.formPageUrl, next.formSelector, JSON.stringify(fieldMap), userId, current.id]
  );
  return normalize(result.rows[0]);
}

// What the widget needs in the browser. Never includes the prompt material.
export function publicAgentConfig(cfg: InboundAgentConfig) {
  return {
    agentName: cfg.agentName,
    greeting: cfg.greeting,
    accentColor: cfg.accentColor,
    submitNativeForm: cfg.submitNativeForm,
    formPageUrl: cfg.formPageUrl,
    formSelector: cfg.formSelector,
    fieldMap: cfg.fieldMap,
  };
}
