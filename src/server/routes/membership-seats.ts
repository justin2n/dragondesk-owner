import { serverError } from '../utils/errors';
import express from 'express';
import { pool } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
router.use(authenticateToken);

// A seat is one purchased membership license. The account holder pays for it;
// the participant occupying it trains under it. This table — not members — is
// the source of truth for MRR, so the invariants below are enforced here AND in
// the DB (unique partial index on one active seat per participant).
//
// Invariants:
//   1. Seats hang off an account holder in the 'member' stage.
//   2. A seat's participant must belong to that same account holder (or BE them,
//      since an account holder may train on their own seat).
//   3. A participant occupies at most one active seat.
//   4. A family-plan seat has no participant — it covers the whole account.
//   5. priceAmount is snapshotted at purchase so Settings edits never rewrite
//      historical revenue.

export const SEAT_SELECT = `
  SELECT s.*,
         ms.name AS "membershipName",
         ms."isFamilyPlan",
         ms."maxProgramsPerParticipant",
         p."firstName" AS "participantFirstName",
         p."lastName"  AS "participantLastName"
  FROM membership_seats s
  JOIN memberships ms ON ms.id = s."membershipId"
  LEFT JOIN members p ON p.id = s."participantId"
`;

// Resolve the account holder a seat may be attached to. An account holder may
// sit on their own seat, so a participant id resolves to their holder.
async function loadAccountHolder(id: number) {
  const r = await pool.query(`SELECT * FROM members WHERE id = $1`, [id]);
  if (r.rows.length === 0) return { error: 'Account holder not found' as const };
  const m = r.rows[0];
  if ((m.memberType || 'account_holder') !== 'account_holder') {
    return { error: 'Seats are held by account holders, not participants' as const };
  }
  return { holder: m };
}

// Validate that `participantId` may occupy a seat on `holderId`.
async function validateParticipant(participantId: number, holderId: number, seatId: number | null) {
  const r = await pool.query(`SELECT * FROM members WHERE id = $1`, [participantId]);
  if (r.rows.length === 0) return 'Participant not found';
  const p = r.rows[0];

  // The account holder training on their own seat is allowed.
  const belongs = p.id === holderId || p.accountHolderId === holderId;
  if (!belongs) return 'That participant belongs to a different account holder';

  const existing = await pool.query(
    `SELECT id FROM membership_seats
     WHERE "participantId" = $1 AND status = 'active' AND ($2::int IS NULL OR id <> $2::int)`,
    [participantId, seatId],
  );
  if (existing.rows.length > 0) {
    return `${p.firstName} ${p.lastName} already occupies an active seat. Unassign it first.`;
  }
  return null;
}

// How many programs a participant may train in, given the seat covering them.
// NULL limit = unlimited. Family-plan seats cover every participant on the
// account, so they're matched by account holder rather than participant id.
export async function programLimitFor(participantId: number, accountHolderId: number | null) {
  const r = await pool.query(
    `SELECT ms."maxProgramsPerParticipant" AS limit, ms."isFamilyPlan"
     FROM membership_seats s
     JOIN memberships ms ON ms.id = s."membershipId"
     WHERE s.status = 'active'
       AND (s."participantId" = $1 OR (ms."isFamilyPlan" = true AND s."accountHolderId" = $2))
     ORDER BY ms."isFamilyPlan" DESC, ms."maxProgramsPerParticipant" IS NULL DESC,
              ms."maxProgramsPerParticipant" DESC
     LIMIT 1`,
    [participantId, accountHolderId],
  );
  if (r.rows.length === 0) return { hasSeat: false, limit: 0 };
  return { hasSeat: true, limit: r.rows[0].limit === null ? null : Number(r.rows[0].limit) };
}

// GET /api/membership-seats?accountHolderId=123
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { accountHolderId, participantId, status } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (accountHolderId) {
      params.push(accountHolderId);
      conditions.push(`s."accountHolderId" = $${params.length}::int`);
    }
    if (participantId) {
      params.push(participantId);
      conditions.push(`s."participantId" = $${params.length}::int`);
    }
    if (status) {
      params.push(status);
      conditions.push(`s.status = $${params.length}`);
    }

    const sql = SEAT_SELECT
      + (conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '')
      + ` ORDER BY s."createdAt" ASC`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (error: any) {
    serverError(res, error);
  }
});

// POST /api/membership-seats — buy a seat.
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { accountHolderId, membershipId, participantId } = req.body;
    if (!accountHolderId || !membershipId) {
      return res.status(400).json({ error: 'accountHolderId and membershipId are required' });
    }

    const holderResult = await loadAccountHolder(Number(accountHolderId));
    if ('error' in holderResult) return res.status(400).json({ error: holderResult.error });
    const holder = holderResult.holder;

    if (holder.accountStatus !== 'member') {
      return res.status(400).json({ error: 'Only contacts in the Member stage can hold membership seats' });
    }

    const msResult = await pool.query(`SELECT * FROM memberships WHERE id = $1`, [membershipId]);
    if (msResult.rows.length === 0) return res.status(404).json({ error: 'Membership type not found' });
    const membership = msResult.rows[0];

    // A family plan covers the whole account, so it never binds to one person.
    let seatParticipant: number | null = membership.isFamilyPlan ? null : (participantId ? Number(participantId) : null);
    if (seatParticipant !== null) {
      const problem = await validateParticipant(seatParticipant, holder.id, null);
      if (problem) return res.status(400).json({ error: problem });
    }
    if (membership.isFamilyPlan) {
      const dupe = await pool.query(
        `SELECT s.id FROM membership_seats s JOIN memberships ms ON ms.id = s."membershipId"
         WHERE s."accountHolderId" = $1 AND s.status = 'active' AND ms."isFamilyPlan" = true`,
        [holder.id],
      );
      if (dupe.rows.length > 0) {
        return res.status(409).json({ error: 'This account already has an active family plan seat' });
      }
    }

    const result = await pool.query(
      `INSERT INTO membership_seats
         ("accountHolderId", "membershipId", "participantId", "priceAmount", status, "locationId")
       VALUES ($1, $2, $3, $4, 'active', $5) RETURNING id`,
      [holder.id, membership.id, seatParticipant, membership.priceAmount || 0, holder.locationId || null],
    );

    const full = await pool.query(`${SEAT_SELECT} WHERE s.id = $1`, [result.rows[0].id]);
    res.status(201).json(full.rows[0]);
  } catch (error: any) {
    serverError(res, error);
  }
});

// PUT /api/membership-seats/:id — reassign the occupant or swap the plan.
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { participantId, membershipId, status } = req.body;

    const seatResult = await pool.query(`SELECT * FROM membership_seats WHERE id = $1`, [id]);
    if (seatResult.rows.length === 0) return res.status(404).json({ error: 'Seat not found' });
    const seat = seatResult.rows[0];

    // Swapping the plan re-snapshots the price — this is a genuine plan change,
    // not a backfill of an old price.
    let nextMembershipId = seat.membershipId;
    let nextPrice = seat.priceAmount;
    let isFamilyPlan = false;
    if (membershipId !== undefined && Number(membershipId) !== seat.membershipId) {
      const msResult = await pool.query(`SELECT * FROM memberships WHERE id = $1`, [membershipId]);
      if (msResult.rows.length === 0) return res.status(404).json({ error: 'Membership type not found' });
      nextMembershipId = msResult.rows[0].id;
      nextPrice = msResult.rows[0].priceAmount || 0;
      isFamilyPlan = msResult.rows[0].isFamilyPlan === true;
    } else {
      const msResult = await pool.query(`SELECT "isFamilyPlan" FROM memberships WHERE id = $1`, [seat.membershipId]);
      isFamilyPlan = msResult.rows[0]?.isFamilyPlan === true;
    }

    let nextParticipant: number | null = seat.participantId;
    if (isFamilyPlan) {
      nextParticipant = null;
    } else if (participantId !== undefined) {
      nextParticipant = participantId === null || participantId === '' ? null : Number(participantId);
      if (nextParticipant !== null) {
        const problem = await validateParticipant(nextParticipant, seat.accountHolderId, seat.id);
        if (problem) return res.status(400).json({ error: problem });
      }
    }

    const nextStatus = status === 'cancelled' || status === 'active' ? status : seat.status;

    await pool.query(
      `UPDATE membership_seats SET
         "participantId" = $1,
         "membershipId" = $2,
         "priceAmount" = $3,
         status = $4,
         "endDate" = CASE WHEN $4 = 'cancelled' AND "endDate" IS NULL THEN CURRENT_TIMESTAMP
                          WHEN $4 = 'active' THEN NULL ELSE "endDate" END,
         "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [nextParticipant, nextMembershipId, nextPrice, nextStatus, seat.id],
    );

    const full = await pool.query(`${SEAT_SELECT} WHERE s.id = $1`, [seat.id]);
    res.json(full.rows[0]);
  } catch (error: any) {
    serverError(res, error);
  }
});

// DELETE — cancel rather than hard-delete, so past revenue stays auditable.
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const seat = await pool.query(`SELECT id FROM membership_seats WHERE id = $1`, [id]);
    if (seat.rows.length === 0) return res.status(404).json({ error: 'Seat not found' });

    await pool.query(
      `UPDATE membership_seats
       SET status = 'cancelled', "endDate" = COALESCE("endDate", CURRENT_TIMESTAMP), "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id],
    );
    res.json({ message: 'Seat cancelled' });
  } catch (error: any) {
    serverError(res, error);
  }
});

export default router;
