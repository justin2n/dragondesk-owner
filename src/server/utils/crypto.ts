import * as crypto from 'crypto';

// Envelope encryption for secrets stored at rest (e.g. a customer's SendGrid API
// key). Uses AES-256-GCM with a 32-byte master key from APP_ENCRYPTION_KEY
// (hex or base64). Ciphertext format: v1:<iv>:<tag>:<data> (each part base64).

const PREFIX = 'v1';

function getKey(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) return null;
  // Accept hex (64 chars) or base64; must resolve to exactly 32 bytes.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }
  return key.length === 32 ? key : null;
}

export function isEncryptionConfigured(): boolean {
  return getKey() !== null;
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  if (!key) throw new Error('APP_ENCRYPTION_KEY is not set (or not a 32-byte hex/base64 key)');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decryptSecret(value: string): string {
  const key = getKey();
  if (!key) throw new Error('APP_ENCRYPTION_KEY is not set (or not a 32-byte hex/base64 key)');
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('Malformed ciphertext');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const data = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// True if the string looks like our ciphertext (vs a plaintext/legacy value).
export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX + ':') && value.split(':').length === 4;
}
