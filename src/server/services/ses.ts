import { createHash, createHmac } from 'crypto';

// Amazon SES v2 sender. Signs a SendEmail request with AWS Signature V4 (no AWS
// SDK dependency — same fetch-based approach as the other providers). Requires
// an IAM access key with ses:SendEmail and a verified sending identity/domain.

function sha256hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

export function isSesConfigured(accessKeyId?: string | null, secretAccessKey?: string | null, region?: string | null): boolean {
  return !!(accessKeyId && secretAccessKey && region);
}

export async function sendViaSes(opts: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  to: string;
  subject: string;
  html: string;
  fromEmail: string;
  fromName?: string;
}): Promise<{ messageId?: string }> {
  const { accessKeyId, secretAccessKey, region } = opts;
  if (!accessKeyId || !secretAccessKey) throw new Error('SES credentials are not configured');
  if (!region) throw new Error('SES region is not set (e.g. us-east-1)');
  if (!opts.fromEmail) throw new Error('SES from address is not set (verify the identity/domain in SES)');

  const service = 'ses';
  const host = `email.${region}.amazonaws.com`;
  const path = '/v2/email/outbound-emails';
  const from = opts.fromName ? `${opts.fromName} <${opts.fromEmail}>` : opts.fromEmail;

  const payload = JSON.stringify({
    FromEmailAddress: from,
    Destination: { ToAddresses: [opts.to] },
    Content: {
      Simple: {
        Subject: { Data: opts.subject, Charset: 'UTF-8' },
        Body: { Html: { Data: opts.html, Charset: 'UTF-8' } },
      },
    },
  });

  // YYYYMMDDTHHMMSSZ
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(payload);

  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['POST', path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, sha256hex(canonicalRequest)].join('\n');

  const kDate = hmac('AWS4' + secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // Note: don't set Host manually — the runtime sets it from the URL and it
  // matches the signed value.
  const response = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Amz-Date': amzDate,
      'X-Amz-Content-Sha256': payloadHash,
      Authorization: authorization,
    },
    body: payload,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`SES error ${response.status}: ${errText}`);
  }
  const data: any = await response.json().catch(() => ({}));
  return { messageId: data?.MessageId };
}
