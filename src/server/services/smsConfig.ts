import { pool } from '../models/database';
import { decryptSecret, isEncrypted } from '../utils/crypto';

// Resolved Twilio SMS config for a scope (a location, else the org-wide default).
// Mirrors services/emailConfig.ts — DB values win; env vars are the fallback so
// existing deployments keep working with no DB row.

export interface SmsConfig {
  accountSid: string | null;
  authToken: string | null;
  fromNumber: string | null;
  messagingServiceSid: string | null;
  configured: boolean;
}

const cache = new Map<string, SmsConfig>();

export async function getSmsConfig(locationId?: number): Promise<SmsConfig> {
  const cacheKey = locationId ? String(locationId) : 'global';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let row: any = null;
  try {
    if (locationId) {
      const r = await pool.query(`SELECT * FROM sms_settings WHERE "locationId" = $1 AND "isActive" = true LIMIT 1`, [locationId]);
      row = r.rows[0] || null;
    }
    if (!row) {
      const r = await pool.query(`SELECT * FROM sms_settings WHERE "locationId" IS NULL AND "isActive" = true LIMIT 1`);
      row = r.rows[0] || null;
    }
  } catch (error) {
    console.error('Error loading sms_settings:', error);
  }

  let authToken: string | null = null;
  if (row?.authToken) {
    try {
      authToken = isEncrypted(row.authToken) ? decryptSecret(row.authToken) : row.authToken;
    } catch (error) {
      console.error('Failed to decrypt Twilio auth token — check APP_ENCRYPTION_KEY:', error);
      authToken = null;
    }
  }
  if (!authToken) authToken = process.env.TWILIO_AUTH_TOKEN || null;

  const accountSid = row?.accountSid || process.env.TWILIO_ACCOUNT_SID || null;
  const fromNumber = row?.fromNumber || process.env.TWILIO_PHONE_NUMBER || null;
  const messagingServiceSid = row?.messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID || null;

  const config: SmsConfig = {
    accountSid,
    authToken,
    fromNumber,
    messagingServiceSid,
    // Need SID + token + a sender (a from number or a messaging service).
    configured: !!(accountSid && authToken && (fromNumber || messagingServiceSid)),
  };

  cache.set(cacheKey, config);
  return config;
}

export function invalidateSmsConfigCache(locationId?: number) {
  const cacheKey = locationId ? String(locationId) : 'global';
  cache.delete(cacheKey);
  if (cacheKey === 'global') cache.clear();
}
