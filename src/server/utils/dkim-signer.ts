import { get } from '../models/database';
import * as crypto from 'crypto';

interface DKIMOptions {
  domainName: string;
  keySelector: string;
  privateKey: string;
}

/**
 * Generate DKIM signature for an email
 * Based on RFC 6376 specification
 */
export function generateDKIMSignature(
  headers: { [key: string]: string },
  body: string,
  options: DKIMOptions
): string {
  const { domainName, keySelector, privateKey } = options;

  // Canonicalize body (simple canonicalization)
  const canonicalBody = body.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

  // Calculate body hash
  const bodyHash = crypto
    .createHash('sha256')
    .update(canonicalBody)
    .digest('base64');

  // Headers to sign (in order)
  const headersToSign = ['from', 'to', 'subject', 'date'];

  // Build canonical headers
  const canonicalHeaders = headersToSign
    .map((name) => {
      const value = headers[name.toLowerCase()] || '';
      return `${name}:${value.trim()}`;
    })
    .join('\r\n');

  // Build DKIM-Signature header (without signature value)
  const dkimHeader = [
    'v=1',
    `a=rsa-sha256`,
    `c=simple/simple`,
    `d=${domainName}`,
    `s=${keySelector}`,
    `h=${headersToSign.join(':')}`,
    `bh=${bodyHash}`,
    `b=`,
  ].join('; ');

  // Create signing string
  const signingString = `${canonicalHeaders}\r\ndkim-signature:${dkimHeader}`;

  // Sign using private key
  const signer = crypto.createSign('SHA256');
  signer.update(signingString);
  const signature = signer.sign(privateKey, 'base64');

  // Return complete DKIM-Signature header
  return `DKIM-Signature: v=1; a=rsa-sha256; c=simple/simple; d=${domainName}; s=${keySelector}; h=${headersToSign.join(
    ':'
  )}; bh=${bodyHash}; b=${signature}`;
}

/**
 * Get active DKIM configuration for a domain
 */
export async function getDKIMConfig(domain: string): Promise<DKIMOptions | null> {
  try {
    const config = await get(
      'SELECT domain, selector, privateKey FROM dkim_config WHERE domain = ? AND isActive = 1',
      [domain]
    );

    if (!config) {
      return null;
    }

    return {
      domainName: config.domain,
      keySelector: config.selector,
      privateKey: config.privateKey,
    };
  } catch (error) {
    console.error('Error fetching DKIM config:', error);
    return null;
  }
}

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string {
  const match = email.match(/@(.+)$/);
  return match ? match[1] : '';
}
