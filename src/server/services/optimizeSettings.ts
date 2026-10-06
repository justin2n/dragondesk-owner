import { pool } from '../models/database';
import {
  ConfidenceLevel,
  DEFAULT_SIGNIFICANCE_OPTIONS,
  SignificanceOptions,
} from '../utils/abStats';

// DragonDesk: Optimize studio settings — the statistical bar a test must clear
// and the minimum data before a verdict is attempted. Stored in the app_settings
// key/value table; defaults match what these were hardcoded to, so a studio that
// never opens the settings page behaves exactly as before.

const KEYS = {
  confidenceThreshold: 'optimize.confidenceThreshold',
  minViewsPerArm: 'optimize.minViewsPerArm',
  minTotalConversions: 'optimize.minTotalConversions',
} as const;

export const ALLOWED_CONFIDENCE_LEVELS: ConfidenceLevel[] = [90, 95, 99];
const MIN_GATE = 1;
const MAX_GATE = 100000;

export type OptimizeSettings = Required<SignificanceOptions>;

// Read on nearly every analytics request and once per test in the sweep, so a
// short cache keeps this off the hot path. Writes clear it immediately.
let cache: { value: OptimizeSettings; at: number } | null = null;
const CACHE_TTL_MS = 30_000;

export function clearOptimizeSettingsCache(): void {
  cache = null;
}

function clampGate(raw: any, fallback: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_GATE, Math.max(MIN_GATE, n));
}

function toConfidence(raw: any, fallback: ConfidenceLevel): ConfidenceLevel {
  const n = Number(raw);
  return (ALLOWED_CONFIDENCE_LEVELS as number[]).includes(n) ? (n as ConfidenceLevel) : fallback;
}

export async function getOptimizeSettings(): Promise<OptimizeSettings> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const value: OptimizeSettings = { ...DEFAULT_SIGNIFICANCE_OPTIONS };
  try {
    const rows = (await pool.query(
      'SELECT key, value FROM app_settings WHERE key = ANY($1)',
      [Object.values(KEYS)],
    )).rows;
    const byKey = new Map(rows.map((r: any) => [r.key, r.value]));

    value.confidenceThreshold = toConfidence(
      byKey.get(KEYS.confidenceThreshold), DEFAULT_SIGNIFICANCE_OPTIONS.confidenceThreshold,
    );
    value.minViewsPerArm = clampGate(
      byKey.get(KEYS.minViewsPerArm), DEFAULT_SIGNIFICANCE_OPTIONS.minViewsPerArm,
    );
    value.minTotalConversions = clampGate(
      byKey.get(KEYS.minTotalConversions), DEFAULT_SIGNIFICANCE_OPTIONS.minTotalConversions,
    );
  } catch (err) {
    // A settings read must never take analytics down — fall back to defaults.
    console.error('[optimizeSettings] read failed, using defaults:', err);
    return { ...DEFAULT_SIGNIFICANCE_OPTIONS };
  }

  cache = { value, at: Date.now() };
  return value;
}

export async function saveOptimizeSettings(patch: Partial<OptimizeSettings>): Promise<OptimizeSettings> {
  const current = await getOptimizeSettings();
  const next: OptimizeSettings = {
    confidenceThreshold: patch.confidenceThreshold !== undefined
      ? toConfidence(patch.confidenceThreshold, current.confidenceThreshold)
      : current.confidenceThreshold,
    minViewsPerArm: patch.minViewsPerArm !== undefined
      ? clampGate(patch.minViewsPerArm, current.minViewsPerArm)
      : current.minViewsPerArm,
    minTotalConversions: patch.minTotalConversions !== undefined
      ? clampGate(patch.minTotalConversions, current.minTotalConversions)
      : current.minTotalConversions,
  };

  const entries: [string, string][] = [
    [KEYS.confidenceThreshold, String(next.confidenceThreshold)],
    [KEYS.minViewsPerArm, String(next.minViewsPerArm)],
    [KEYS.minTotalConversions, String(next.minTotalConversions)],
  ];
  for (const [key, val] of entries) {
    await pool.query(
      `INSERT INTO app_settings (key, value, "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = CURRENT_TIMESTAMP`,
      [key, val],
    );
  }

  clearOptimizeSettingsCache();
  return next;
}
