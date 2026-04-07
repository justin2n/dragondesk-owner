import { Router, Request, Response } from 'express';

const router = Router();

// Headers to strip from proxied responses so pages can be iframed
const BLOCKED_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-content-type-options',
]);

// Basic SSRF protection: block private/loopback ranges
function isPrivateUrl(urlStr: string): boolean {
  try {
    const { hostname } = new URL(urlStr);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^169\.254\./.test(hostname)
    );
  } catch {
    return true;
  }
}

// Inject a <base> tag so relative URLs resolve against the target origin,
// and strip inline CSP meta tags.
function rewriteHtml(html: string, targetUrl: string): string {
  const origin = new URL(targetUrl).origin;
  const baseTag = `<base href="${origin}/">`;

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

  if (isPrivateUrl(targetUrl)) {
    res.status(403).json({ error: 'Private/local URLs are not allowed' });
    return;
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DragonDesk-Preview/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

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
      res.send(rewriteHtml(html, targetUrl));
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
