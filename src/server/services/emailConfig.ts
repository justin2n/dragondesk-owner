import { pool } from '../models/database';
import { decryptSecret, isEncrypted } from '../utils/crypto';

// Resolved email provider config for a scope (a location, else the org-wide
// default). Mirrors services/stripe.ts. DB values win; env vars are the
// fallback so single-tenant deployments keep working with no DB row.

export type EmailProvider = 'smtp' | 'sendgrid' | 'mailgun';

export interface EmailConfig {
  provider: EmailProvider;
  fromEmail: string | null;
  fromName: string | null;
  sendgrid: { apiKey: string | null; configured: boolean };
  mailgun: { apiKey: string | null; domain: string | null; region: string; configured: boolean };
  smtp: {
    host?: string; port: number; secure: boolean;
    user?: string; pass?: string; configured: boolean;
  };
}

// Decrypt a stored secret value, tolerating plaintext/legacy values.
function resolveSecret(stored: string | null | undefined, envFallback?: string): string | null {
  let val: string | null = null;
  if (stored) {
    try {
      val = isEncrypted(stored) ? decryptSecret(stored) : stored;
    } catch (error) {
      console.error('Failed to decrypt email secret — check APP_ENCRYPTION_KEY:', error);
      val = null;
    }
  }
  return val || envFallback || null;
}

// Small cache keyed by locationId ('global' for null). Invalidated on save.
const configCache = new Map<string, EmailConfig>();

async function loadRow(locationId?: number): Promise<any | null> {
  let result;
  if (locationId) {
    result = await pool.query(
      `SELECT * FROM email_settings WHERE "locationId" = $1 AND "isActive" = true LIMIT 1`,
      [locationId]
    );
  }
  if (!result || result.rows.length === 0) {
    result = await pool.query(
      `SELECT * FROM email_settings WHERE "locationId" IS NULL AND "isActive" = true LIMIT 1`
    );
  }
  return result?.rows[0] || null;
}

export async function getEmailConfig(locationId?: number): Promise<EmailConfig> {
  const cacheKey = locationId ? String(locationId) : 'global';
  const cached = configCache.get(cacheKey);
  if (cached) return cached;

  let row: any = null;
  try {
    row = await loadRow(locationId);
  } catch (error) {
    console.error('Error loading email_settings:', error);
  }

  // Resolve provider secrets: DB (decrypt if encrypted) → env fallback.
  const sendgridApiKey = resolveSecret(row?.sendgridApiKey, process.env.SENDGRID_API_KEY);
  const mailgunApiKey = resolveSecret(row?.mailgunApiKey, process.env.MAILGUN_API_KEY);
  const mailgunDomain = row?.mailgunDomain || process.env.MAILGUN_DOMAIN || null;
  const mailgunRegion = row?.mailgunRegion || process.env.MAILGUN_REGION || 'us';

  const provider: EmailProvider =
    row?.provider === 'sendgrid' ? 'sendgrid' :
    row?.provider === 'mailgun' ? 'mailgun' : 'smtp';

  const fromEnv = provider === 'sendgrid' ? process.env.SENDGRID_FROM_EMAIL
    : provider === 'mailgun' ? process.env.MAILGUN_FROM_EMAIL
    : process.env.SMTP_FROM_EMAIL;
  const fromNameEnv = provider === 'sendgrid' ? process.env.SENDGRID_FROM_NAME
    : provider === 'mailgun' ? process.env.MAILGUN_FROM_NAME
    : process.env.SMTP_FROM_NAME;

  const fromEmail = row?.fromEmail || fromEnv || null;
  const fromName = row?.fromName || fromNameEnv || null;

  const config: EmailConfig = {
    provider,
    fromEmail,
    fromName,
    sendgrid: {
      apiKey: sendgridApiKey,
      configured: !!(sendgridApiKey && (row?.fromEmail || process.env.SENDGRID_FROM_EMAIL)),
    },
    mailgun: {
      apiKey: mailgunApiKey,
      domain: mailgunDomain,
      region: mailgunRegion,
      configured: !!(mailgunApiKey && mailgunDomain),
    },
    smtp: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      configured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    },
  };

  configCache.set(cacheKey, config);
  return config;
}

export function invalidateEmailConfigCache(locationId?: number) {
  const cacheKey = locationId ? String(locationId) : 'global';
  configCache.delete(cacheKey);
  // The global row is the fallback for every scope, so clear all on a global change.
  if (cacheKey === 'global') configCache.clear();
}
