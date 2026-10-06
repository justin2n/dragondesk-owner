// Marketing attribution helpers — parse UTM params from a URL and derive a
// normalized channel from the UTM/click-id/referrer signals.

export interface Utms {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
}

// Pull UTM params + click ids from a URL string (e.g. a landing page href).
export function parseUtms(url?: string | null): Utms {
  if (!url) return {};
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    // Fall back to the query portion if it's not a full URL.
    const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : url;
    params = new URLSearchParams(q);
  }
  const get = (k: string) => params.get(k) || null;
  return {
    utmSource: get('utm_source'),
    utmMedium: get('utm_medium'),
    utmCampaign: get('utm_campaign'),
    utmTerm: get('utm_term'),
    utmContent: get('utm_content'),
    gclid: get('gclid'),
    fbclid: get('fbclid'),
    landingPage: url,
  };
}

// Map the signals to one of six channels for reporting.
export function deriveChannel(u: Utms): string {
  const source = (u.utmSource || '').toLowerCase();
  const medium = (u.utmMedium || '').toLowerCase();

  if (medium === 'email' || source === 'email') return 'Email';

  if (u.gclid || ['cpc', 'ppc', 'paid', 'paidsearch', 'paid-search', 'sem'].includes(medium)) {
    return 'Paid Search';
  }
  if (u.fbclid || ['paid-social', 'paidsocial', 'social-paid', 'cpc-social'].includes(medium)
      || (['facebook', 'instagram', 'meta', 'fb', 'ig', 'tiktok'].includes(source) && (medium.includes('paid') || medium === 'cpc'))) {
    return 'Paid Social';
  }
  if (medium === 'organic' || medium === 'social' || medium === 'organic-social') return 'Organic';

  // A UTM-less visit: referral if a referrer exists, else direct.
  if (!medium && !source) {
    return u.referrer ? 'Referral' : 'Direct';
  }
  if (medium === 'referral') return 'Referral';

  // Anything else that carries a source/medium counts as referral traffic.
  return 'Referral';
}

// True if any real attribution signal is present.
export function hasAttribution(u: Utms): boolean {
  return !!(u.utmSource || u.utmMedium || u.utmCampaign || u.gclid || u.fbclid || u.referrer);
}
