import { serverError } from '../utils/errors';
import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import dns from 'dns/promises';

const router = Router();

// The proxy fetches an arbitrary URL server-side, so it's an SSRF sink. Require
// auth so it can't be used as an open proxy against the internal network /
// cloud metadata. The visual-editor iframe is same-origin and sends the
// httpOnly auth cookie, so this doesn't break it.
router.use(authenticateToken);

// Headers to strip from proxied responses so pages can be iframed
const BLOCKED_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-content-type-options',
  // fetch() auto-decompresses the body, so these would cause double-decode
  'content-encoding',
  'transfer-encoding',
  // content-length is wrong after we rewrite the HTML
  'content-length',
]);

// True if an IP literal is private / loopback / link-local / unique-local, for
// both IPv4 and IPv6 (incl. IPv4-mapped IPv6 like ::ffff:127.0.0.1). This is the
// real SSRF gate — hostnames are resolved to IPs first, so DNS rebinding and
// alternate hostname encodings can't slip a private address past it.
function isPrivateIp(ip: string): boolean {
  let addr = ip.toLowerCase().trim();
  // Unwrap IPv4-mapped/compatible IPv6 (::ffff:127.0.0.1) to the IPv4 part.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) addr = mapped[1];

  if (addr.includes('.')) {
    const p = addr.split('.').map(Number);
    if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformed → block
    const [a, b] = p;
    return (
      a === 0 || a === 127 || a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||           // link-local / cloud metadata
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      a >= 224                              // multicast / reserved
    );
  }
  // IPv6
  return (
    addr === '::' || addr === '::1' ||       // unspecified / loopback
    addr.startsWith('fe80') ||               // link-local
    addr.startsWith('fc') || addr.startsWith('fd') || // unique-local fc00::/7
    addr.startsWith('ff')                     // multicast
  );
}

// Resolve the hostname and reject if ANY resolved address is private. Blocks a
// public hostname that resolves to an internal IP (DNS rebinding).
async function assertPublicHost(hostname: string): Promise<void> {
  // A bare IP literal in the URL: check it directly.
  if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) {
    if (isPrivateIp(hostname.replace(/^\[|\]$/g, ''))) throw new Error('blocked address');
    return;
  }
  if (hostname === 'localhost') throw new Error('blocked address');
  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0 || records.some(r => isPrivateIp(r.address))) {
    throw new Error('blocked address');
  }
}

// Inject a <base> tag so relative URLs resolve against the target origin,
// and strip inline CSP meta tags.
function rewriteHtml(html: string, targetUrl: string): string {
  // Use the full URL (with trailing slash on the directory) so that relative
  // paths like "../assets/" resolve correctly, not just same-origin paths.
  const parsed = new URL(targetUrl);
  const baseHref = parsed.origin + parsed.pathname.replace(/\/[^/]*$/, '/');
  const baseTag = `<base href="${baseHref}">`;

  // Remove existing <base> tags
  let result = html.replace(/<base[^>]*>/gi, '');

  // Remove inline CSP meta tags
  result = result.replace(
    /<meta[^>]+http-equiv=["']content-security-policy["'][^>]*>/gi,
    ''
  );

  // Inject our <base> tag as early as possible
  if (/<head[^>]*>/i.test(result)) {
    result = result.replace(/(<head[^>]*>)/i, `$1${baseTag}`);
  } else {
    result = baseTag + result;
  }

  return result;
}

// GET /api/proxy?url=https://...
router.get('/', async (req: Request, res: Response) => {
  const urlParam = req.query.url as string;

  if (!urlParam) {
    res.status(400).json({ error: 'url query parameter is required' });
    return;
  }

  let targetUrl: string;
  try {
    const parsed = new URL(urlParam);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      res.status(400).json({ error: 'Only http and https URLs are supported' });
      return;
    }
    targetUrl = parsed.toString();
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  try {
    // Follow redirects manually, re-validating every hop — otherwise a public
    // URL could 302 to http://169.254.169.254/ (cloud metadata) or 127.0.0.1
    // and bypass the check that only ran on the first URL.
    let current = targetUrl;
    let response: globalThis.Response | null = null;
    for (let hop = 0; hop < 5; hop++) {
      await assertPublicHost(new URL(current).hostname);
      response = await fetch(current, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DragonDesk-Preview/1.0)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        current = new URL(response.headers.get('location')!, current).toString();
        const proto = new URL(current).protocol;
        if (proto !== 'http:' && proto !== 'https:') { res.status(400).json({ error: 'Unsupported redirect target' }); return; }
        continue;
      }
      break;
    }
    if (!response) { res.status(502).json({ error: 'No response' }); return; }

    const contentType = response.headers.get('content-type') || 'text/html';

    // Forward safe headers, drop blocking ones
    response.headers.forEach((value, key) => {
      if (!BLOCKED_HEADERS.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // Ensure the browser won't block the iframe
    res.removeHeader('x-frame-options');
    res.removeHeader('content-security-policy');

    res.setHeader('content-type', contentType);
    res.status(response.status);

    if (contentType.includes('text/html')) {
      const html = await response.text();
      res.send(rewriteHtml(html, current));
    } else {
      // For non-HTML resources (CSS, JS, images) stream through as-is
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (err: any) {
    res.status(502).json({ error: `Failed to fetch URL: ${err.message}` });
  }
});

export default router;
