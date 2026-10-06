import { serverError } from '../utils/errors';
import express from 'express';
import { pool } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Helper function to generate month periods
const generateMonthPeriods = (monthsBack: number) => {
  const now = new Date();
  const periods: { start: Date; end: Date; label: string; monthKey: string }[] = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

    periods.push({
      start,
      end,
      label: start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      monthKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    });
  }

  return periods;
};

// Helper function to generate day periods (for short windows like "Last 30 Days")
const generateDayPeriods = (daysBack: number) => {
  const now = new Date();
  const periods: { start: Date; end: Date; label: string; monthKey: string }[] = [];

  for (let i = daysBack - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 23, 59, 59);

    periods.push({
      start,
      end,
      label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      monthKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
    });
  }

  return periods;
};

// Get analytics data for dashboard (legacy endpoint)
router.get('/dashboard', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { timeframe = 'week', program, locationId } = req.query;

    const params: any[] = [];
    let sql = `SELECT
        m.id,
        m."accountStatus",
        m."programType",
        m."locationId",
        m."createdAt",
        m."updatedAt",
        COALESCE((
          SELECT array_agg(p.name) FROM member_programs mp
          JOIN programs p ON p.id = mp."programId"
          WHERE mp."memberId" = m.id
        ), ARRAY[]::text[]) AS "programNames"
      FROM members m
      WHERE 1=1`;

    if (locationId && locationId !== 'all') {
      params.push(locationId);
      sql += ` AND m."locationId" = $${params.length}`;
    }

    sql += ' ORDER BY m."createdAt" ASC';

    let members: any[] = (await pool.query(sql, params)).rows;

    // Match on actual enrollment (member_programs) as well as the denormalized
    // primary program, so participants training in several aren't dropped.
    if (program && program !== 'all') {
      members = members.filter(m =>
        (Array.isArray(m.programNames) && m.programNames.includes(program)) || m.programType === program);
    }

    const now = new Date();
    const periods: { start: Date; end: Date; label: string }[] = [];

    if (timeframe === 'week') {
      for (let i = 11; i >= 0; i--) {
        const end = new Date(now);
        end.setDate(end.getDate() - (i * 7));
        const start = new Date(end);
        start.setDate(start.getDate() - 7);

        const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        periods.push({ start, end, label: `${startStr} - ${endStr}` });
      }
    } else if (timeframe === 'month') {
      for (let i = 11; i >= 0; i--) {
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);

        periods.push({
          start,
          end,
          label: start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        });
      }
    } else {
      for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i;
        const start = new Date(year, 0, 1);
        const end = new Date(year, 11, 31, 23, 59, 59);

        periods.push({ start, end, label: year.toString() });
      }
    }

    const timeSeriesData = periods.map(period => {
      const periodMembers = members.filter(m => {
        const createdAt = new Date(m.createdAt);
        return createdAt >= period.start && createdAt < period.end;
      });

      return {
        period: period.label,
        leads: periodMembers.filter(m => m.accountStatus === 'lead').length,
        trialers: periodMembers.filter(m => m.accountStatus === 'trialer').length,
        members: periodMembers.filter(m => m.accountStatus === 'member').length,
      };
    });

    const totalTrialers = members.filter(m => m.accountStatus === 'trialer' || m.accountStatus === 'member').length;
    const paidMembers = members.filter(m => m.accountStatus === 'member').length;
    const conversionRate = totalTrialers > 0 ? (paidMembers / totalTrialers) * 100 : 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activePaidMembers = members.filter(m =>
      m.accountStatus === 'member' && new Date(m.updatedAt) >= thirtyDaysAgo
    ).length;
    const totalPaidMembers = members.filter(m => m.accountStatus === 'member').length;
    const churnRate = totalPaidMembers > 0 ? ((totalPaidMembers - activePaidMembers) / totalPaidMembers) * 100 : 0;

    const currentPeriod = periods[periods.length - 1];
    const currentPeriodMembers = members.filter(m => {
      const createdAt = new Date(m.createdAt);
      return createdAt >= currentPeriod.start && createdAt < currentPeriod.end;
    });

    const currentStats = {
      leads: currentPeriodMembers.filter(m => m.accountStatus === 'lead').length,
      trialers: currentPeriodMembers.filter(m => m.accountStatus === 'trialer').length,
      members: currentPeriodMembers.filter(m => m.accountStatus === 'member').length,
    };

    res.json({
      timeSeriesData,
      metrics: {
        conversionRate: parseFloat(conversionRate.toFixed(2)),
        churnRate: parseFloat(churnRate.toFixed(2)),
      },
      currentStats,
    });
  } catch (error: any) {
    console.error('Error fetching analytics:', error);
    serverError(res, error);
  }
});

// NEW: Comprehensive program-based analytics for DragonDesk: Analytics page
router.get('/programs', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { locationId, months = '12', days } = req.query;
    const monthsBack = parseInt(months as string) || 12;
    const daysBack = days ? parseInt(days as string) : 0;
    // Daily granularity for short windows (e.g. "Last 30 Days"); else monthly.
    const useDays = daysBack > 0;
    const truncUnit = useDays ? 'day' : 'month';

    // Build base query
    const params: any[] = [];
    let sql = `SELECT
        m.id,
        m."accountStatus",
        m."programType",
        m."locationId",
        m."leadSource",
        m."trialStartDate",
        m."memberStartDate",
        m."createdAt",
        m."updatedAt",
        m."pricingPlanId",
        m."memberType",
        m."accountHolderId",
        pp.amount AS "planAmount",
        pp."billingInterval",
        pp."intervalCount",
        pp.name AS "planName",
        -- Recurring revenue is the sum of the ACTIVE SEATS this contact pays
        -- for, not a single plan price: an account holder buys one seat per
        -- participant they cover, so 2 kids on the same plan bill twice.
        COALESCE((
          SELECT SUM(s."priceAmount") FROM membership_seats s
          WHERE s."accountHolderId" = m.id AND s.status = 'active'
        ), 0) AS "seatRevenue",
        COALESCE((
          SELECT COUNT(*) FROM membership_seats s
          WHERE s."accountHolderId" = m.id AND s.status = 'active'
        ), 0) AS "seatCount",
        -- Quick Starts are one-time trial revenue, counted where they were sold.
        -- Every status counts: the money changes hands at enrollment, and
        -- 'expired' is the normal end state once all the classes are used.
        COALESCE((
          SELECT SUM(q."priceAmount") FROM quick_start_enrollments q
          WHERE q."memberId" = m.id
        ), 0) AS "quickStartRevenue",
        -- Programs a contact actually trains in (member_programs is the source
        -- of truth; a participant may be in several).
        COALESCE((
          SELECT array_agg(p.name) FROM member_programs mp
          JOIN programs p ON p.id = mp."programId"
          WHERE mp."memberId" = m.id
        ), ARRAY[]::text[]) AS "programNames"
      FROM members m
      LEFT JOIN pricing_plans pp ON m."pricingPlanId" = pp.id
      WHERE 1=1`;

    if (locationId && locationId !== 'all') {
      params.push(locationId);
      sql += ` AND m."locationId" = $${params.length}`;
    }

    const allMembers: any[] = (await pool.query(sql, params)).rows;

    // A contact counts toward a program if they train in it (member_programs,
    // which supports several) or it's their denormalized primary program.
    // Using programType alone under-counts every multi-program participant.
    const inProgram = (m: any, program: string) =>
      (Array.isArray(m.programNames) && m.programNames.includes(program)) || m.programType === program;
    const membersByStatus = {
      member: allMembers.filter(m => m.accountStatus === 'member').length,
      trialer: allMembers.filter(m => m.accountStatus === 'trialer').length,
      lead: allMembers.filter(m => m.accountStatus === 'lead').length,
    };
    console.log(`[Analytics] locationId=${locationId}, total=${allMembers.length}, breakdown:`, membersByStatus);

    // Get cancellations from churn_metrics table
    const churnParams: any[] = [];
    let churnSql = `
      SELECT cm.*, m."locationId"
      FROM churn_metrics cm
      LEFT JOIN members m ON cm."memberId" = m.id
      WHERE 1=1
    `;

    if (locationId && locationId !== 'all') {
      churnParams.push(locationId);
      churnSql += ` AND m."locationId" = $${churnParams.length}`;
    }

    const churnData: any[] = (await pool.query(churnSql, churnParams)).rows;

    // Get available programs
    const programs = [...new Set(allMembers.map(m => m.programType))].filter(Boolean);

    // Generate periods (daily for short windows, else monthly)
    const periods = useDays ? generateDayPeriods(daysBack) : generateMonthPeriods(monthsBack);

    // Calculate trials data by program and month
    const trialsData = periods.map(period => {
      const dataPoint: any = { month: period.label };

      programs.forEach(program => {
        const programMembers = allMembers.filter(m => inProgram(m, program));

        // Count trials started in this month
        const trialsStarted = programMembers.filter(m => {
          const trialDate = m.trialStartDate ? new Date(m.trialStartDate) : new Date(m.createdAt);
          return (m.accountStatus === 'trialer' || m.accountStatus === 'member') &&
            trialDate >= period.start && trialDate <= period.end;
        }).length;

        // Count conversions (trials that became members) in this month
        const conversions = programMembers.filter(m => {
          const memberDate = m.memberStartDate ? new Date(m.memberStartDate) : null;
          return m.accountStatus === 'member' &&
            memberDate && memberDate >= period.start && memberDate <= period.end;
        }).length;

        dataPoint[`${program}_volume`] = trialsStarted;
        dataPoint[`${program}_conversions`] = conversions;
        dataPoint[`${program}_conversionRate`] = trialsStarted > 0
          ? parseFloat(((conversions / trialsStarted) * 100).toFixed(1))
          : 0;
      });

      // Total across all programs
      const totalTrials = programs.reduce((sum, p) => sum + (dataPoint[`${p}_volume`] || 0), 0);
      const totalConversions = programs.reduce((sum, p) => sum + (dataPoint[`${p}_conversions`] || 0), 0);
      dataPoint.total_volume = totalTrials;
      dataPoint.total_conversions = totalConversions;
      dataPoint.total_conversionRate = totalTrials > 0
        ? parseFloat(((totalConversions / totalTrials) * 100).toFixed(1))
        : 0;

      return dataPoint;
    });

    // Calculate leads data by program and month.
    // Count ALL new contacts created in the period regardless of current status —
    // a lead that quickly converted to trialer/member is still a lead acquisition.
    const leadsData = periods.map(period => {
      const dataPoint: any = { month: period.label };

      programs.forEach(program => {
        const newLeads = allMembers.filter(m => {
          const createdAt = new Date(m.createdAt);
          return inProgram(m, program) &&
            createdAt >= period.start && createdAt <= period.end;
        }).length;

        dataPoint[program] = newLeads;
      });

      // Total leads across all programs
      dataPoint.total = programs.reduce((sum, p) => sum + (dataPoint[p] || 0), 0);

      return dataPoint;
    });

    // Lead source breakdown — shows how many contacts came in from each source
    const leadSourceCounts: Record<string, number> = {};
    for (const m of allMembers) {
      const src = m.leadSource || 'unknown';
      leadSourceCounts[src] = (leadSourceCounts[src] || 0) + 1;
    }
    const leadSources = Object.entries(leadSourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    // Calculate members data (active members and churn) by program and month
    const membersData = periods.map(period => {
      const dataPoint: any = { month: period.label };

      programs.forEach(program => {
        // Active members at end of period
        const activeMembers = allMembers.filter(m => {
          const memberDate = m.memberStartDate ? new Date(m.memberStartDate) : new Date(m.createdAt);
          return inProgram(m, program) &&
            m.accountStatus === 'member' &&
            memberDate <= period.end;
        }).length;

        // Cancellations in this period
        const cancellations = churnData.filter(c => {
          const cancelDate = new Date(c.cancelledAt || c.createdAt);
          return c.programType === program &&
            cancelDate >= period.start && cancelDate <= period.end;
        }).length;

        dataPoint[`${program}_active`] = activeMembers;
        dataPoint[`${program}_cancellations`] = cancellations;
        dataPoint[`${program}_churnRate`] = activeMembers > 0
          ? parseFloat(((cancellations / activeMembers) * 100).toFixed(1))
          : 0;
      });

      // Totals
      dataPoint.total_active = programs.reduce((sum, p) => sum + (dataPoint[`${p}_active`] || 0), 0);
      dataPoint.total_cancellations = programs.reduce((sum, p) => sum + (dataPoint[`${p}_cancellations`] || 0), 0);
      dataPoint.total_churnRate = dataPoint.total_active > 0
        ? parseFloat(((dataPoint.total_cancellations / dataPoint.total_active) * 100).toFixed(1))
        : 0;

      return dataPoint;
    });

    // Monthly recurring revenue for a contact: the sum of the active membership
    // seats they pay for. Seats hang off account holders, so participants add $0
    // here — their cost is already counted on their account holder's row and
    // double-counting it would inflate MRR by the size of every family.
    const memberMonthly = (m: any): number => Number(m.seatRevenue || 0) / 100;

    // One-time Quick Start revenue. Held by account holders and participants
    // alike, and never recurring, so it's reported separately from MRR.
    const quickStartRevenue = allMembers.reduce(
      (sum, m) => sum + Number(m.quickStartRevenue || 0) / 100, 0);

    // Summary statistics
    const summary = {
      programs: programs.map(program => {
        const programMembers = allMembers.filter(m => inProgram(m, program));
        const activeMembers = programMembers.filter(m => m.accountStatus === 'member');
        const currentTrials = programMembers.filter(m => m.accountStatus === 'trialer').length;
        const currentLeads = programMembers.filter(m => m.accountStatus === 'lead').length;
        const programCancellations = churnData.filter(c => c.programType === program).length;

        return {
          name: program,
          activeMembers: activeMembers.length,
          currentTrials,
          currentLeads,
          totalCancellations: programCancellations,
          overallChurnRate: activeMembers.length > 0
            ? parseFloat(((programCancellations / (activeMembers.length + programCancellations)) * 100).toFixed(1))
            : 0,
        };
      }),
      totals: {
        activeMembers: allMembers.filter(m => m.accountStatus === 'member').length,
        currentTrials: allMembers.filter(m => m.accountStatus === 'trialer').length,
        currentLeads: allMembers.filter(m => m.accountStatus === 'lead').length,
        totalCancellations: churnData.length,
        expiredTrials: allMembers.filter(m => {
          if (m.accountStatus !== 'trialer') return false;
          const start = m.trialStartDate ? new Date(m.trialStartDate) : new Date(m.createdAt);
          const daysSince = (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24);
          return daysSince > 30;
        }).length,
        mrr: Math.round(allMembers.reduce((sum, m) => sum + memberMonthly(m), 0) * 100) / 100,
        arr: Math.round(allMembers.reduce((sum, m) => sum + memberMonthly(m), 0) * 12 * 100) / 100,
        // One-time Quick Start revenue, reported apart from MRR so recurring and
        // non-recurring money are never conflated.
        quickStartRevenue: Math.round(quickStartRevenue * 100) / 100,
        activeSeats: allMembers.reduce((sum, m) => sum + Number(m.seatCount || 0), 0),
        // What the average paying account actually costs — the number that makes
        // "2 kids on Basic" visible rather than averaging it away per contact.
        avgRevenuePerAccount: (() => {
          const paying = allMembers.filter(m => Number(m.seatRevenue || 0) > 0);
          if (paying.length === 0) return 0;
          const total = paying.reduce((sum, m) => sum + memberMonthly(m), 0);
          return Math.round((total / paying.length) * 100) / 100;
        })(),
      },
    };

    // Program distribution for pie chart
    const programDistribution = programs.map(program => ({
      name: program,
      value: allMembers.filter(m => inProgram(m, program) && m.accountStatus === 'member').length,
    }));

    // Zapier webhook activity by month — from log table so duplicates are tracked too
    let zapierActivityData: any[] = periods.map(p => ({
      month: p.label,
      total: 0,
      new_contacts: 0,
      returning_contacts: 0,
    }));
    try {
      const zapierResult = await pool.query(
        `SELECT DATE_TRUNC($2, "receivedAt" AT TIME ZONE 'UTC') AS month,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE "wasNew" = true)::int AS new_contacts,
           COUNT(*) FILTER (WHERE "wasNew" = false)::int AS returning_contacts
         FROM zapier_webhook_log
         WHERE "receivedAt" >= $1
         GROUP BY DATE_TRUNC($2, "receivedAt" AT TIME ZONE 'UTC')`,
        [periods[0].start, truncUnit]
      );
      zapierActivityData = periods.map(period => {
        const row = zapierResult.rows.find(r => {
          const d = new Date(r.month);
          return d >= period.start && d <= period.end;
        });
        return {
          month: period.label,
          total: row?.total ?? 0,
          new_contacts: row?.new_contacts ?? 0,
          returning_contacts: row?.returning_contacts ?? 0,
        };
      });
    } catch {
      // table may not exist on older deployments — return zeros
    }

    res.json({
      programs,
      trialsData,
      leadsData,
      membersData,
      summary,
      programDistribution,
      leadSources,
      zapierActivityData,
    });
  } catch (error: any) {
    console.error('Error fetching program analytics:', error);
    serverError(res, error);
  }
});

// Value metrics: ACV, ALE, ALTV, modal engagement, transaction counts
router.get('/value', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { locationId, program, membershipAge } = req.query;

    const memberFilters: string[] = [`m."accountStatus" = 'member'`];
    const params: any[] = [];

    if (locationId && locationId !== 'all') {
      params.push(locationId);
      memberFilters.push(`m."locationId" = $${params.length}`);
    }
    if (program && program !== 'all') {
      params.push(program);
      memberFilters.push(`m."programType" = $${params.length}`);
    }
    if (membershipAge && membershipAge !== 'all') {
      params.push(membershipAge);
      memberFilters.push(`m."membershipAge" = $${params.length}`);
    }

    const memberWhere = memberFilters.join(' AND ');

    // ACV — annualized value per member using:
    //   1. Their assigned pricing plan (pricingPlanId), or
    //   2. Actual paid invoices annualized over their membership tenure
    const acvResult = await pool.query(`
      SELECT AVG(annual_value) AS acv
      FROM (
        SELECT
          m.id,
          CASE
            -- Has a pricing plan assigned: annualize it
            WHEN pp.id IS NOT NULL THEN (
              CASE pp."billingInterval"
                WHEN 'month' THEN pp.amount * 12.0 / GREATEST(pp."intervalCount", 1)
                WHEN 'week'  THEN pp.amount * 52.0
                WHEN 'year'  THEN pp.amount * 1.0  / GREATEST(pp."intervalCount", 1)
                ELSE              pp.amount * 12.0
              END
            ) / 100.0
            -- No plan: use actual paid invoices annualized over tenure
            WHEN inv.total_paid > 0 AND m."memberStartDate" IS NOT NULL THEN
              inv.total_paid / 100.0
              / GREATEST(EXTRACT(EPOCH FROM (NOW() - m."memberStartDate")) / (86400.0 * 365.25), 0.0833)
            ELSE NULL
          END AS annual_value
        FROM members m
        LEFT JOIN pricing_plans pp ON m."pricingPlanId" = pp.id
        LEFT JOIN (
          SELECT "memberId", SUM("amountPaid") AS total_paid
          FROM invoices
          WHERE status = 'paid'
          GROUP BY "memberId"
        ) inv ON inv."memberId" = m.id
        WHERE ${memberWhere}
      ) vals
      WHERE annual_value IS NOT NULL
    `, params);

    // ALE — average lifetime in months using earliest paid invoice → latest paid invoice (or now)
    // Falls back to memberStartDate when no invoices exist
    const aleResult = await pool.query(`
      SELECT AVG(lifetime_months) AS ale_months
      FROM (
        SELECT
          m.id,
          CASE
            WHEN inv.first_paid IS NOT NULL THEN
              EXTRACT(EPOCH FROM (COALESCE(inv.last_paid, NOW()) - inv.first_paid)) / (86400.0 * 30.44)
            WHEN m."memberStartDate" IS NOT NULL THEN
              EXTRACT(EPOCH FROM (COALESCE(sub."canceledAt", NOW()) - m."memberStartDate")) / (86400.0 * 30.44)
            ELSE NULL
          END AS lifetime_months
        FROM members m
        LEFT JOIN (
          SELECT "memberId",
                 MIN("paidAt") AS first_paid,
                 MAX("paidAt") AS last_paid
          FROM invoices
          WHERE status = 'paid' AND "paidAt" IS NOT NULL
          GROUP BY "memberId"
        ) inv ON inv."memberId" = m.id
        LEFT JOIN LATERAL (
          SELECT "canceledAt" FROM subscriptions
          WHERE "memberId" = m.id
          ORDER BY "createdAt" DESC LIMIT 1
        ) sub ON true
        WHERE ${memberWhere}
      ) lifetimes
      WHERE lifetime_months IS NOT NULL AND lifetime_months > 0
    `, params);

    // Modal lifetime engagement
    const modalResult = await pool.query(`
      SELECT
        FLOOR(lifetime_months)::int AS months,
        COUNT(*) AS count
      FROM (
        SELECT
          CASE
            WHEN inv.first_paid IS NOT NULL THEN
              EXTRACT(EPOCH FROM (COALESCE(inv.last_paid, NOW()) - inv.first_paid)) / (86400.0 * 30.44)
            WHEN m."memberStartDate" IS NOT NULL THEN
              EXTRACT(EPOCH FROM (COALESCE(sub."canceledAt", NOW()) - m."memberStartDate")) / (86400.0 * 30.44)
            ELSE NULL
          END AS lifetime_months
        FROM members m
        LEFT JOIN (
          SELECT "memberId", MIN("paidAt") AS first_paid, MAX("paidAt") AS last_paid
          FROM invoices WHERE status = 'paid' AND "paidAt" IS NOT NULL GROUP BY "memberId"
        ) inv ON inv."memberId" = m.id
        LEFT JOIN LATERAL (
          SELECT "canceledAt" FROM subscriptions WHERE "memberId" = m.id ORDER BY "createdAt" DESC LIMIT 1
        ) sub ON true
        WHERE ${memberWhere}
      ) t
      WHERE lifetime_months IS NOT NULL AND lifetime_months > 0
      GROUP BY 1
      ORDER BY count DESC, months ASC
      LIMIT 1
    `, params);

    // Engagement distribution histogram (3-month bands)
    const distributionResult = await pool.query(`
      SELECT
        (FLOOR(lifetime_months / 3) * 3)::int AS bucket_start,
        COUNT(*) AS count
      FROM (
        SELECT
          CASE
            WHEN inv.first_paid IS NOT NULL THEN
              EXTRACT(EPOCH FROM (COALESCE(inv.last_paid, NOW()) - inv.first_paid)) / (86400.0 * 30.44)
            WHEN m."memberStartDate" IS NOT NULL THEN
              EXTRACT(EPOCH FROM (COALESCE(sub."canceledAt", NOW()) - m."memberStartDate")) / (86400.0 * 30.44)
            ELSE NULL
          END AS lifetime_months
        FROM members m
        LEFT JOIN (
          SELECT "memberId", MIN("paidAt") AS first_paid, MAX("paidAt") AS last_paid
          FROM invoices WHERE status = 'paid' AND "paidAt" IS NOT NULL GROUP BY "memberId"
        ) inv ON inv."memberId" = m.id
        LEFT JOIN LATERAL (
          SELECT "canceledAt" FROM subscriptions WHERE "memberId" = m.id ORDER BY "createdAt" DESC LIMIT 1
        ) sub ON true
        WHERE ${memberWhere}
      ) t
      WHERE lifetime_months IS NOT NULL AND lifetime_months > 0
      GROUP BY 1
      ORDER BY 1
    `, params);

    // Transaction counts per member (Stripe invoices)
    const transactionsResult = await pool.query(`
      SELECT
        m.id,
        m."firstName",
        m."lastName",
        m."programType",
        m."membershipAge",
        pp.name                                       AS "planName",
        pp.amount / 100.0                             AS "planAmount",
        pp."billingInterval",
        COUNT(i.id)::int                              AS transaction_count,
        COALESCE(SUM(i."amountPaid"), 0) / 100.0      AS total_paid
      FROM members m
      LEFT JOIN pricing_plans pp ON m."pricingPlanId" = pp.id
      LEFT JOIN invoices i ON i."memberId" = m.id AND i.status = 'paid'
      WHERE ${memberWhere}
      GROUP BY m.id, m."firstName", m."lastName", m."programType", m."membershipAge", pp.name, pp.amount, pp."billingInterval"
      ORDER BY total_paid DESC, transaction_count DESC
      LIMIT 200
    `, params);

    const acv = parseFloat(acvResult.rows[0]?.acv) || 0;
    const aleMonths = parseFloat(aleResult.rows[0]?.ale_months) || 0;
    const aleYears = aleMonths / 12;
    const altv = acv * aleYears;

    res.json({
      acv: Math.round(acv * 100) / 100,
      aleMonths: Math.round(aleMonths * 10) / 10,
      altv: Math.round(altv * 100) / 100,
      modalEngagementMonths: modalResult.rows[0]?.months ?? null,
      engagementDistribution: distributionResult.rows,
      transactions: transactionsResult.rows,
    });
  } catch (error: any) {
    console.error('Error fetching value analytics:', error);
    serverError(res, error);
  }
});

// ─── Google Analytics web overview ───────────────────────────────────────────
router.get('/web/overview', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { getWebOverview, isGAConfigured } = await import('../services/googleAnalytics.js');
    if (!isGAConfigured()) {
      return res.json({ configured: false });
    }
    const days = parseInt(String(req.query.days || '30'));
    let data: any;
    try {
      data = await getWebOverview(days);
    } catch (gaErr: any) {
      console.error('[GA] getWebOverview failed:', gaErr);
      return res.json({ configured: true, error: gaErr?.message || 'GA API request failed' });
    }
    if (!data) {
      return res.json({ configured: true, error: 'Could not initialise GA client — verify GA_SERVICE_ACCOUNT_JSON is valid JSON and GA_PROPERTY_ID uses the format properties/XXXXXXXXX.' });
    }
    res.json({ configured: true, ...data });
  } catch (error: any) {
    console.error('GA overview error:', error);
    serverError(res, error);
  }
});

// Per-user GA sessions by stored client ID
router.get('/web/user/:clientId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { getUserWebSessions, isGAConfigured } = await import('../services/googleAnalytics.js');
    if (!isGAConfigured()) return res.json({ configured: false, sessions: [] });
    const sessions = await getUserWebSessions(req.params.clientId);
    res.json({ configured: true, sessions });
  } catch (error: any) {
    console.error('GA user sessions error:', error);
    serverError(res, error);
  }
});

// Marketing attribution: leads/trialers/members grouped by channel and campaign,
// from first-touch member_attribution. `leads` = attributed contacts acquired in
// the window; convRate = members / leads.
router.get('/attribution', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { locationId, months = '12' } = req.query;
    const monthsBack = parseInt(months as string) || 12;
    const start = new Date();
    start.setMonth(start.getMonth() - monthsBack);

    const params: any[] = [start.toISOString()];
    let locFilter = '';
    if (locationId && locationId !== 'all') {
      params.push(locationId);
      locFilter = `AND m."locationId" = $${params.length}::int`;
    }
    const base = `FROM member_attribution ma JOIN members m ON m.id = ma."memberId"
                  WHERE m."createdAt" >= $1 ${locFilter}`;

    const channelsRes = await pool.query(
      `SELECT COALESCE(ma.channel, 'Direct') AS channel,
         COUNT(*)::int AS leads,
         COUNT(*) FILTER (WHERE m."accountStatus" = 'trialer')::int AS trialers,
         COUNT(*) FILTER (WHERE m."accountStatus" = 'member')::int AS members
       ${base}
       GROUP BY COALESCE(ma.channel, 'Direct')
       ORDER BY leads DESC`, params);

    const campaignsRes = await pool.query(
      `SELECT COALESCE(NULLIF(ma."utmCampaign", ''), '(no campaign)') AS campaign,
         ma."utmSource" AS source, ma."utmMedium" AS medium,
         COALESCE(ma.channel, 'Direct') AS channel,
         COUNT(*)::int AS leads,
         COUNT(*) FILTER (WHERE m."accountStatus" = 'trialer')::int AS trialers,
         COUNT(*) FILTER (WHERE m."accountStatus" = 'member')::int AS members
       ${base}
       GROUP BY COALESCE(NULLIF(ma."utmCampaign", ''), '(no campaign)'), ma."utmSource", ma."utmMedium", COALESCE(ma.channel, 'Direct')
       ORDER BY leads DESC`, params);

    const withRate = (rows: any[]) => rows.map(r => ({
      ...r, convRate: r.leads > 0 ? Math.round((r.members / r.leads) * 1000) / 10 : 0,
    }));
    const channels = withRate(channelsRes.rows);
    const campaigns = withRate(campaignsRes.rows);

    const attributedLeads = channels.reduce((s, c) => s + c.leads, 0);
    const totalMembers = channels.reduce((s, c) => s + c.members, 0);

    res.json({
      kpis: {
        attributedLeads,
        members: totalMembers,
        leadToMemberRate: attributedLeads > 0 ? Math.round((totalMembers / attributedLeads) * 1000) / 10 : 0,
        topChannel: channels[0]?.channel || null,
        topCampaign: campaigns.find(c => c.campaign !== '(no campaign)')?.campaign || null,
      },
      channels,
      campaigns,
    });
  } catch (error: any) {
    serverError(res, error);
  }
});

export default router;
