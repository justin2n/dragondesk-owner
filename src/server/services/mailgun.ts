// Mailgun HTTP API sender. Uses the account's API key + a verified sending
// domain (US or EU region). The from address must be on that domain.

export function isMailgunConfigured(apiKey?: string | null, domain?: string | null): boolean {
  return !!(apiKey && domain);
}

export async function sendViaMailgun(opts: {
  apiKey: string;
  domain: string;
  region?: string; // 'us' (default) | 'eu'
  to: string;
  subject: string;
  html: string;
  fromEmail: string;
  fromName?: string;
}): Promise<{ messageId?: string }> {
  const { apiKey, domain } = opts;
  if (!apiKey) throw new Error('Mailgun API key is not configured');
  if (!domain) throw new Error('Mailgun sending domain is not set');
  if (!opts.fromEmail) throw new Error('Mailgun from address is not set (use an address on your Mailgun domain)');

  const baseUrl = opts.region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  const from = opts.fromName ? `${opts.fromName} <${opts.fromEmail}>` : opts.fromEmail;

  const body = new URLSearchParams();
  body.set('from', from);
  body.set('to', opts.to);
  body.set('subject', opts.subject);
  body.set('html', opts.html);

  const response = await fetch(`${baseUrl}/v3/${domain}/messages`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`api:${apiKey}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Mailgun error ${response.status}: ${errText}`);
  }
  const data: any = await response.json().catch(() => ({}));
  return { messageId: data?.id };
}
