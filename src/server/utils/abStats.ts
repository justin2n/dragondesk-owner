// A/B test statistical significance + a simple "time to significance" forecast.
//
// Conversions are binomial (a visitor converts or doesn't), so we compare the two
// variants' conversion rates with a two-proportion z-test — the standard test for
// "is B's rate really different from A's, or is this just noise?". We report the
// confidence (1 - p), which arm is ahead, the observed lift, and — if it's not
// significant yet — an estimate of how many more visitors (and days, at the
// current traffic rate) it'll take to get there.

const Z_BY_LEVEL: Record<ConfidenceLevel, number> = {
  90: 1.644854, // two-sided 90% confidence
  95: 1.959964, // two-sided 95% confidence
  99: 2.575829, // two-sided 99% confidence
};
const LEVELS: ConfidenceLevel[] = [90, 95, 99];
const Z_POWER_80 = 0.8416212; // 80% power

export type ConfidenceLevel = 90 | 95 | 99;

// Studio-configurable Optimize settings. Defaults match the values these were
// hardcoded to before they became settings, so an unconfigured studio is
// unaffected.
export interface SignificanceOptions {
  confidenceThreshold?: ConfidenceLevel; // bar a test must clear to be called
  minViewsPerArm?: number;               // data gate: views each arm needs
  minTotalConversions?: number;          // data gate: conversions across arms
}

export const DEFAULT_SIGNIFICANCE_OPTIONS: Required<SignificanceOptions> = {
  confidenceThreshold: 95,
  minViewsPerArm: 30,
  minTotalConversions: 5,
};

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
  significanceLevel: ConfidenceLevel | null; // highest standard milestone crossed
  threshold: ConfidenceLevel;      // the bar this verdict was judged against
  winner: 'A' | 'B' | null;        // arm with the higher rate (only trust when significant)
  controlRate: number;             // % (variant A)
  treatmentRate: number;           // % (variant B)
  relativeLift: number;            // % change of B vs A
  sample: { a: number; b: number };
  conversions: { a: number; b: number };
  recommendation: string;
  // Forecast to reach the configured threshold (null when already significant
  // or not projectable).
  projection: { visitorsNeeded: number; daysRemaining: number | null } | null;
  // Progress toward the minimum data a verdict needs. Only set while status is
  // 'insufficient_data' — past the gate, `projection` answers "how much longer?".
  dataGate: DataGate | null;
}

export interface DataGate {
  viewsNeededA: number;         // more views variant A still needs
  viewsNeededB: number;         // more views variant B still needs
  conversionsNeeded: number;    // more conversions needed across both arms
  daysRemaining: number | null; // at recent traffic; null when not projectable
  thresholds: { minViewsPerArm: number; minTotalConversions: number };
}

// The minimum data gate and the confidence bar both come from options now — see
// DEFAULT_SIGNIFICANCE_OPTIONS for the values they default to. Below the gate,
// small-sample swings make the z-test meaningless.

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] || '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}
const plural = (n: number, word: string) => `${n} more ${word}${n === 1 ? '' : 's'}`;

export function computeSignificance(
  a: VariantStat,
  b: VariantStat,
  dailyViews?: number, // combined views/day, for the time forecast
  options?: SignificanceOptions,
): SignificanceResult {
  const { confidenceThreshold: requested, minViewsPerArm, minTotalConversions } = {
    ...DEFAULT_SIGNIFICANCE_OPTIONS,
    ...(options || {}),
  };
  // Normalise before use so the bar we report is the bar we actually applied.
  const confidenceThreshold: ConfidenceLevel = Z_BY_LEVEL[requested]
    ? requested
    : DEFAULT_SIGNIFICANCE_OPTIONS.confidenceThreshold;
  const zThreshold = Z_BY_LEVEL[confidenceThreshold];
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

  if (nA < minViewsPerArm || nB < minViewsPerArm || xA + xB < minTotalConversions) {
    // Below the gate the z-test is meaningless, but "not enough data" on its own
    // gives no sense of progress — so report exactly what's still missing.
    const viewsNeededA = Math.max(0, minViewsPerArm - nA);
    const viewsNeededB = Math.max(0, minViewsPerArm - nB);
    const conversionsNeeded = Math.max(0, minTotalConversions - (xA + xB));

    // Time to clear the gate is bounded by whichever constraint is slower. With
    // no conversions yet there's no rate to extrapolate from, so don't guess.
    let daysRemaining: number | null = null;
    if (dailyViews && dailyViews > 0) {
      const viewDays = (viewsNeededA + viewsNeededB) / dailyViews;
      const observedRate = nA + nB > 0 ? (xA + xB) / (nA + nB) : 0;
      if (conversionsNeeded === 0) {
        daysRemaining = Math.ceil(viewDays);
      } else if (observedRate > 0) {
        daysRemaining = Math.ceil(Math.max(viewDays, conversionsNeeded / (observedRate * dailyViews)));
      }
    }

    const missing: string[] = [];
    if (viewsNeededA > 0) missing.push(`${plural(viewsNeededA, 'visitor')} on A`);
    if (viewsNeededB > 0) missing.push(`${plural(viewsNeededB, 'visitor')} on B`);
    if (conversionsNeeded > 0) missing.push(plural(conversionsNeeded, 'conversion'));

    return {
      ...base,
      status: 'insufficient_data',
      confidence: 0,
      pValue: 1,
      significanceLevel: null,
      threshold: confidenceThreshold,
      recommendation: missing.length
        ? `Still collecting data — needs ${joinList(missing)} before a verdict is possible${
            daysRemaining != null ? ` (~${daysRemaining} day${daysRemaining === 1 ? '' : 's'} at current traffic)` : ''
          }.`
        : 'Still collecting data — keep the test running.',
      projection: null,
      dataGate: {
        viewsNeededA,
        viewsNeededB,
        conversionsNeeded,
        daysRemaining,
        thresholds: { minViewsPerArm, minTotalConversions },
      },
    };
  }

  // Two-proportion z-test with a pooled standard error.
  const pPool = (xA + xB) / (nA + nB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
  const z = se > 0 ? (rateB - rateA) / se : 0;
  const pValue = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  const confidence = Math.round((1 - pValue) * 1000) / 10;
  const absZ = Math.abs(z);
  const level = LEVELS.reduce<ConfidenceLevel | null>(
    (best, l) => (absZ >= Z_BY_LEVEL[l] ? l : best), null,
  );
  const significant = absZ >= zThreshold;

  let recommendation: string;
  let projection: SignificanceResult['projection'] = null;

  if (significant && winner) {
    recommendation = winner === 'B'
      ? `Variant B is the winner with ${confidence}% confidence${base.relativeLift ? ` (${base.relativeLift > 0 ? '+' : ''}${base.relativeLift}% lift)` : ''}. Safe to ship it.`
      : `The control (A) is winning with ${confidence}% confidence — the change didn't help. Safe to stop.`;
  } else {
    recommendation = `No significant difference yet — ${confidence}% confidence against a ${confidenceThreshold}% bar. Keep it running or increase traffic.`;
    // Estimate additional sample needed to detect the CURRENT observed effect at
    // the configured confidence / 80% power, then how long that takes at recent
    // traffic.
    const diff = Math.abs(rateB - rateA);
    if (diff > 0) {
      const nPerArm = Math.ceil(
        Math.pow(zThreshold + Z_POWER_80, 2) * (rateA * (1 - rateA) + rateB * (1 - rateB)) / (diff * diff),
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
    threshold: confidenceThreshold,
    recommendation,
    projection,
    dataGate: null,
  };
}
