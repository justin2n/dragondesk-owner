import { createHmac, timingSafeEqual } from 'crypto';

// Email click tracking. Each absolute link in a campaign email is rewritten to
// /api/tracking/click/:token?u=<dest>&s=<sig>. The signature binds the
// destination to the recipient token so the endpoint can't be used as an open
// redirect to arbitrary URLs.

function sign(token: string, url: string): string {
  const secret = process.env.JWT_SECRET || '';
  return createHmac('sha256', secret).update(`${token}|${url}`).digest('base64url').slice(0, 22);
}

export function verifyClickSignature(token: string, url: string, sig: string): boolean {
  const expected = Buffer.from(sign(token, url));
  const given = Buffer.from(sig || '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// Rewrite http(s) hrefs to go through the click redirect. Skips mailto/tel/
// anchors/relative links (same matching rules as the UTM tagger).
export function wrapLinksForClickTracking(html: string, base: string, token: string): string {
  if (!html) return html;
  return html.replace(/href\s*=\s*"([^"]*)"/gi, (m, raw) => {
    const url = raw.replace(/&amp;/g, '&').trim();
    if (!/^https?:\/\//i.test(url)) return m;
    const tracked = `${base}/api/tracking/click/${token}?u=${encodeURIComponent(url)}&s=${sign(token, url)}`;
    return `href="${tracked.replace(/&/g, '&amp;')}"`;
  });
}
