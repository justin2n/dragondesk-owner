import { pool } from '../models/database';
import { decryptSecret, isEncrypted } from '../utils/crypto';

// Resolved email provider config for a scope (a location, else the org-wide
// default). Mirrors services/stripe.ts. DB values win; env vars are the
// fallback so single-tenant deployments keep working with no DB row.

export interface EmailConfig {
  provider: 'smtp' | 'sendgrid';
  fromEmail: string | null;
  fromName: string | null;
  sendgrid: { apiKey: string | null; configured: boolean };
  smtp: {
    host?: string; port: number; secure: boolean;
    user?: string; pass?: string; configured: boolean;
  };
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

  // Resolve the SendGrid key: DB (decrypt if encrypted) → env.
  let sendgridApiKey: string | null = null;
  if (row?.sendgridApiKey) {
    try {
      sendgridApiKey = isEncrypted(row.sendgridApiKey) ? decryptSecret(row.sendgridApiKey) : row.sendgridApiKey;
    } catch (error) {
      console.error('Failed to decrypt SendGrid key — check APP_ENCRYPTION_KEY:', error);
      sendgridApiKey = null;
    }
  }
  if (!sendgridApiKey) sendgridApiKey = process.env.SENDGRID_API_KEY || null;

  const provider: 'smtp' | 'sendgrid' = row?.provider === 'sendgrid' ? 'sendgrid' : 'smtp';

  const fromEmail = row?.fromEmail
    || (provider === 'sendgrid' ? process.env.SENDGRID_FROM_EMAIL : process.env.SMTP_FROM_EMAIL)
    || null;
  const fromName = row?.fromName
    || (provider === 'sendgrid' ? process.env.SENDGRID_FROM_NAME : process.env.SMTP_FROM_NAME)
    || null;

  const config: EmailConfig = {
    provider,
    fromEmail,
    fromName,
    sendgrid: {
      apiKey: sendgridApiKey,
      configured: !!(sendgridApiKey && (row?.fromEmail || process.env.SENDGRID_FROM_EMAIL)),
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
