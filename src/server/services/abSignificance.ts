import { pool } from '../models/database';
import { computeSignificance, SignificanceResult } from '../utils/abStats';

// Detects when a running A/B experiment first crosses 95% statistical
// significance and stamps the milestone on the ab_tests row (sigReachedAt +
// winner/confidence/level). Stamped once — the alerts endpoint reads it to
// notify, and it's idempotent so the sweep and on-view checks can't double-fire.

async function aggregatesFor(testId: number): Promise<{ a: { views: number; conversions: number }; b: { views: number; conversions: number } }> {
  const rows = (await pool.query(
    `SELECT variant,
            COUNT(*) FILTER (WHERE "eventType" = 'view') AS views,
            COUNT(*) FILTER (WHERE "eventType" = 'lead') AS leads
     FROM ab_test_events WHERE "testId" = $1 GROUP BY variant`,
    [testId],
  )).rows;
  const pick = (v: string) => {
    const r = rows.find((x: any) => x.variant === v);
    return { views: Number(r?.views) || 0, conversions: Number(r?.leads) || 0 };
  };
  return { a: pick('A'), b: pick('B') };
}

// Stamp the milestone if this result is significant and it hasn't been stamped
// yet. Returns true only on the transition (so callers can notify exactly once).
export async function stampIfSignificant(testId: number, sig: SignificanceResult): Promise<boolean> {
  if (sig.status !== 'significant' || !sig.winner) return false;
  const res = await pool.query(
    `UPDATE ab_tests
       SET "sigReachedAt" = CURRENT_TIMESTAMP, "sigWinner" = $2, "sigConfidence" = $3, "sigLevel" = $4
     WHERE id = $1 AND "sigReachedAt" IS NULL`,
    [testId, sig.winner, sig.confidence, sig.significanceLevel],
  );
  return (res.rowCount ?? 0) > 0;
}

// Evaluate one test from its raw events and stamp if newly significant.
export async function evaluateAndStamp(testId: number): Promise<boolean> {
  const { a, b } = await aggregatesFor(testId);
  const sig = computeSignificance(a, b);
  return stampIfSignificant(testId, sig);
}

// Periodic sweep: check every running test that hasn't hit the milestone yet.
// Kept cheap by only looking at un-stamped running tests.
export async function sweepRunningTests(): Promise<number> {
  let stamped = 0;
  try {
    const rows = (await pool.query(
      `SELECT id FROM ab_tests WHERE status = 'running' AND "sigReachedAt" IS NULL`,
    )).rows;
    for (const row of rows) {
      try {
        if (await evaluateAndStamp(row.id)) stamped++;
      } catch (err) {
        console.error(`[abSignificance] evaluate failed for test ${row.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[abSignificance] sweep failed:', err);
  }
  return stamped;
}
