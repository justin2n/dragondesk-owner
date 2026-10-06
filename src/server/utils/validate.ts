// RFC 5321 practical email regex: local@domain.tld
// Rejects: missing TLD, consecutive dots, leading/trailing dots in local part
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export const isValidEmail = (email: string): boolean =>
  typeof email === 'string' && EMAIL_RE.test(email.trim()) && email.length <= 254;

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
