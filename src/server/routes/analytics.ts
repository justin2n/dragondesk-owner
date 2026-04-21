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

// Get analytics data for dashboard (legacy endpoint)
router.get('/dashboard', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { timeframe = 'week', program, locationId } = req.query;

    const params: any[] = [];
    let sql = `SELECT
        id,
        "accountStatus",
        "programType",
        "locationId",
        "createdAt",
        "updatedAt"
      FROM members
      WHERE 1=1`;

    if (locationId && locationId !== 'all') {
      params.push(locationId);
      sql += ` AND "locationId" = $${params.length}`;
    }

    sql += ' ORDER BY "createdAt" ASC';

    let members: any[] = (await pool.query(sql, params)).rows;

    if (program && program !== 'all') {
      members = members.filter(m => m.programType === program);
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
    res.status(500).json({ error: error.message });
  }
});

// NEW: Comprehensive program-based analytics for DragonDesk: Analytics page
router.get('/programs', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { locationId, months = '12' } = req.query;
    const monthsBack = parseInt(months as string) || 12;

    // Build base query
    const params: any[] = [];
    let sql = `SELECT
        m.id,
        m."accountStatus",
        m."programType",
        m."locationId",
        m."trialStartDate",
        m."memberStartDate",
        m."createdAt",
        m."updatedAt",
        m."pricingPlanId",
        pp.amount AS "planAmount",
        pp."billingInterval",
        pp."intervalCount",
        pp.name AS "planName"
      FROM members m
      LEFT JOIN pricing_plans pp ON m."pricingPlanId" = pp.id
      WHERE 1=1`;

    if (locationId && locationId !== 'all') {
      params.push(locationId);
      sql += ` AND m."locationId" = $${params.length}`;
    }

    const allMembers: any[] = (await pool.query(sql, params)).rows;
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

    // Generate month periods
    const periods = generateMonthPeriods(monthsBack);

    // Calculate trials data by program and month
    const trialsData = periods.map(period => {
      const dataPoint: any = { month: period.label };

      programs.forEach(program => {
        const programMembers = allMembers.filter(m => m.programType === program);

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

    // Calculate leads data by program and month
    const leadsData = periods.map(period => {
      const dataPoint: any = { month: period.label };

      programs.forEach(program => {
        const newLeads = allMembers.filter(m => {
          const createdAt = new Date(m.createdAt);
          return m.programType === program &&
            m.accountStatus === 'lead' &&
            createdAt >= period.start && createdAt <= period.end;
        }).length;

        dataPoint[program] = newLeads;
      });

      // Total leads across all programs
      dataPoint.total = programs.reduce((sum, p) => sum + (dataPoint[p] || 0), 0);

      return dataPoint;
    });

    // Calculate members data (active members and churn) by program and month
    const membersData = periods.map(period => {
      const dataPoint: any = { month: period.label };

      programs.forEach(program => {
        // Active members at end of period
        const activeMembers = allMembers.filter(m => {
          const memberDate = m.memberStartDate ? new Date(m.memberStartDate) : new Date(m.createdAt);
          return m.programType === program &&
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

    // Helper: annualised monthly revenue for a member given their plan
    const annualizedMonthly = (m: any): number => {
      if (!m.planAmount) return 0;
      const amount = m.planAmount / 100; // cents → dollars
      const count = m.intervalCount || 1;
      switch (m.billingInterval) {
        case 'week':  return (amount * 52) / 12;
        case 'month': return amount / count;
        case 'year':  return (amount / count) / 12;
        default:      return amount;
      }
    };

    // Summary statistics
    const summary = {
      programs: programs.map(program => {
        const programMembers = allMembers.filter(m => m.programType === program);
        const activeMembers = programMembers.filter(m => m.accountStatus === 'member');
        const currentTrials = programMembers.filter(m => m.accountStatus === 'trialer').length;
        const currentLeads = programMembers.filter(m => m.accountStatus === 'lead').length;
        const programCancellations = churnData.filter(c => c.programType === program).length;
        const mrr = activeMembers.reduce((sum, m) => sum + annualizedMonthly(m), 0);

        return {
          name: program,
          activeMembers: activeMembers.length,
          currentTrials,
          currentLeads,
          totalCancellations: programCancellations,
          mrr: Math.round(mrr * 100) / 100,
          arr: Math.round(mrr * 12 * 100) / 100,
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
        mrr: Math.round(allMembers.filter(m => m.accountStatus === 'member').reduce((sum, m) => sum + annualizedMonthly(m), 0) * 100) / 100,
        arr: Math.round(allMembers.filter(m => m.accountStatus === 'member').reduce((sum, m) => sum + annualizedMonthly(m), 0) * 12 * 100) / 100,
      },
    };

    // Program distribution for pie chart
    const programDistribution = programs.map(program => ({
      name: program,
      value: allMembers.filter(m => m.programType === program && m.accountStatus === 'member').length,
    }));

    res.json({
      programs,
      trialsData,
      leadsData,
      membersData,
      summary,
      programDistribution,
    });
  } catch (error: any) {
    console.error('Error fetching program analytics:', error);
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    const data = await getWebOverview(days);
    res.json({ configured: true, ...data });
  } catch (error: any) {
    console.error('GA overview error:', error);
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

export default router;
