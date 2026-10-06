import { pool } from '../models/database';

// A Quick Start is a fixed number of classes, not a date range — it's finished
// when the classes are used up. Check-ins are what consume them, so every
// check-in path routes through here to keep the count consistent.
//
// Non-fatal by design: a failure to draw down a trial must never block someone
// from being checked into class at the front desk.

/**
 * Consume one class from the member's active Quick Start, closing it out when
 * the last class is used. Returns the resulting state, or null if the member
 * has no active Quick Start (the common case — most check-ins are members).
 */
export async function consumeQuickStartClass(memberId: number): Promise<{
  id: number;
  classesUsed: number;
  classesIncluded: number;
  exhausted: boolean;
} | null> {
  try {
    const result = await pool.query(
      `UPDATE quick_start_enrollments
       SET "classesUsed" = "classesUsed" + 1,
           status = CASE WHEN "classesUsed" + 1 >= "classesIncluded" THEN 'expired' ELSE status END,
           "endDate" = CASE WHEN "classesUsed" + 1 >= "classesIncluded" THEN CURRENT_TIMESTAMP ELSE "endDate" END,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = (
         SELECT id FROM quick_start_enrollments
         WHERE "memberId" = $1 AND status = 'active'
         ORDER BY "createdAt" ASC LIMIT 1
       )
       RETURNING id, "classesUsed", "classesIncluded"`,
      [memberId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      classesUsed: row.classesUsed,
      classesIncluded: row.classesIncluded,
      exhausted: row.classesUsed >= row.classesIncluded,
    };
  } catch (err) {
    console.error('Quick Start consume failed:', err);
    return null;
  }
}

/**
 * Give a class back when a check-in is undone. Reopens a Quick Start that the
 * mistaken check-in had just closed, so an accidental scan doesn't silently
 * burn someone's trial. Never revives one that was converted to a membership.
 */
export async function releaseQuickStartClass(memberId: number): Promise<void> {
  try {
    await pool.query(
      `UPDATE quick_start_enrollments
       SET "classesUsed" = GREATEST(0, "classesUsed" - 1),
           status = CASE WHEN status = 'expired' THEN 'active' ELSE status END,
           "endDate" = CASE WHEN status = 'expired' THEN NULL ELSE "endDate" END,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = (
         SELECT id FROM quick_start_enrollments
         WHERE "memberId" = $1 AND status IN ('active', 'expired') AND "classesUsed" > 0
         ORDER BY "createdAt" DESC LIMIT 1
       )`,
      [memberId],
    );
  } catch (err) {
    console.error('Quick Start release failed:', err);
  }
}
