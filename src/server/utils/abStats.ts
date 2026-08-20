// A/B test statistical significance + a simple "time to significance" forecast.
//
// Conversions are binomial (a visitor converts or doesn't), so we compare the two
// variants' conversion rates with a two-proportion z-test — the standard test for
// "is B's rate really different from A's, or is this just noise?". We report the
// confidence (1 - p), which arm is ahead, the observed lift, and — if it's not
// significant yet — an estimate of how many more visitors (and days, at the
// current traffic rate) it'll take to get there.

const Z_95 = 1.959964; // two-sided 95% confidence
const Z_99 = 2.575829; // two-sided 99% confidence
const Z_POWER_80 = 0.8416212; // 80% power

// Standard normal CDF via an erf approximation (Abramowitz & Stegun 7.1.26).
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export interface VariantStat { views: number; conversions: number }

export interface SignificanceResult {
  status: 'insufficient_data' | 'not_significant' | 'significant';
  confidence: number;              // 0-100, = (1 - pValue) * 100
  pValue: number;
  significanceLevel: 95 | 99 | null; // highest milestone crossed
  winner: 'A' | 'B' | null;        // arm with the higher rate (only trust when significant)
  controlRate: number;             // % (variant A)
  treatmentRate: number;           // % (variant B)
  relativeLift: number;            // % change of B vs A
  sample: { a: number; b: number };
  conversions: { a: number; b: number };
  recommendation: string;
  // Forecast to reach 95% (null when already significant or not projectable).
  projection: { visitorsNeeded: number; daysRemaining: number | null } | null;
}

// Minimum data before we'll even attempt a verdict — below this, small-sample
// swings make the z-test meaningless.
const MIN_VIEWS_PER_ARM = 30;
const MIN_TOTAL_CONVERSIONS = 5;

export function computeSignificance(
  a: VariantStat,
  b: VariantStat,
  dailyViews?: number, // combined views/day, for the time forecast
): SignificanceResult {
  const nA = a.views, nB = b.views;
  const xA = a.conversions, xB = b.conversions;
  const rateA = nA > 0 ? xA / nA : 0;
  const rateB = nB > 0 ? xB / nB : 0;
  const relLift = rateA > 0 ? ((rateB - rateA) / rateA) * 100 : (rateB > 0 ? Infinity : 0);
  const winner: 'A' | 'B' | null = rateB > rateA ? 'B' : rateA > rateB ? 'A' : null;

  const base = {
    controlRate: rateA * 100,
    treatmentRate: rateB * 100,
    relativeLift: Number.isFinite(relLift) ? Math.round(relLift * 10) / 10 : 0,
    sample: { a: nA, b: nB },
    conversions: { a: xA, b: xB },
    winner,
  };

  if (nA < MIN_VIEWS_PER_ARM || nB < MIN_VIEWS_PER_ARM || xA + xB < MIN_TOTAL_CONVERSIONS) {
    return {
      ...base,
      status: 'insufficient_data',
      confidence: 0,
      pValue: 1,
      significanceLevel: null,
      recommendation: 'Still collecting data — keep the test running until each variant has enough visitors and conversions.',
      projection: null,
    };
  }

  // Two-proportion z-test with a pooled standard error.
  const pPool = (xA + xB) / (nA + nB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
  const z = se > 0 ? (rateB - rateA) / se : 0;
  const pValue = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  const confidence = Math.round((1 - pValue) * 1000) / 10;
  const level: 95 | 99 | null = pValue < (1 - normalCdf(Z_99)) * 2 ? 99 : Math.abs(z) >= Z_95 ? 95 : null;
  const significant = Math.abs(z) >= Z_95;

  let recommendation: string;
  let projection: SignificanceResult['projection'] = null;

  if (significant && winner) {
    recommendation = winner === 'B'
      ? `Variant B is the winner with ${confidence}% confidence${base.relativeLift ? ` (${base.relativeLift > 0 ? '+' : ''}${base.relativeLift}% lift)` : ''}. Safe to ship it.`
      : `The control (A) is winning with ${confidence}% confidence — the change didn't help. Safe to stop.`;
  } else {
    recommendation = 'No significant difference yet — keep it running or increase traffic.';
    // Estimate additional sample needed to detect the CURRENT observed effect at
    // 95% confidence / 80% power, then how long that takes at recent traffic.
    const diff = Math.abs(rateB - rateA);
    if (diff > 0) {
      const nPerArm = Math.ceil(
        Math.pow(Z_95 + Z_POWER_80, 2) * (rateA * (1 - rateA) + rateB * (1 - rateB)) / (diff * diff),
      );
      const visitorsNeeded = Math.max(0, nPerArm * 2 - (nA + nB));
      const daysRemaining = dailyViews && dailyViews > 0 ? Math.ceil(visitorsNeeded / dailyViews) : null;
      if (visitorsNeeded > 0) projection = { visitorsNeeded, daysRemaining };
    }
  }

  return {
    ...base,
    status: significant ? 'significant' : 'not_significant',
    confidence,
    pValue: Math.round(pValue * 10000) / 10000,
    significanceLevel: level,
    recommendation,
    projection,
  };
}
