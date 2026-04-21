import { BetaAnalyticsDataClient } from '@google-analytics/data';

const propertyId = process.env.GA_PROPERTY_ID; // e.g. "properties/123456789"

function getClient(): BetaAnalyticsDataClient | null {
  if (!propertyId) return null;

  const credJson = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!credJson) return null;

  try {
    const credentials = JSON.parse(credJson);
    return new BetaAnalyticsDataClient({ credentials });
  } catch {
    return null;
  }
}

export function isGAConfigured(): boolean {
  return !!(process.env.GA_PROPERTY_ID && process.env.GA_SERVICE_ACCOUNT_JSON);
}

/** Aggregate web overview — last N days */
export async function getWebOverview(days: number = 30) {
  const client = getClient();
  if (!client) return null;

  const startDate = `${days}daysAgo`;

  const [overviewRes, channelRes, pagesRes, deviceRes, dailyRes] = await Promise.all([
    // Summary KPIs
    client.runReport({
      property: propertyId,
      dateRanges: [{ startDate, endDate: 'today' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'bounceRate' },
        { name: 'newUsers' },
      ],
    }),

    // Sessions by channel
    client.runReport({
      property: propertyId,
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'sessionDefaultChannelGrouping' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),

    // Top landing pages
    client.runReport({
      property: propertyId,
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'landingPage' }],
      metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }, { name: 'bounceRate' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),

    // Device breakdown
    client.runReport({
      property: propertyId,
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    }),

    // Daily sessions trend
    client.runReport({
      property: propertyId,
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'newUsers' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    }),
  ]);

  const kpis = overviewRes[0]?.rows?.[0];

  const fmt = (v: any) => v?.value ?? '0';

  return {
    kpis: {
      sessions: parseInt(fmt(kpis?.metricValues?.[0])),
      users: parseInt(fmt(kpis?.metricValues?.[1])),
      pageviews: parseInt(fmt(kpis?.metricValues?.[2])),
      avgSessionDuration: parseFloat(fmt(kpis?.metricValues?.[3])),
      bounceRate: parseFloat(fmt(kpis?.metricValues?.[4])),
      newUsers: parseInt(fmt(kpis?.metricValues?.[5])),
    },
    byChannel: (channelRes[0]?.rows || []).map(row => ({
      channel: row.dimensionValues?.[0]?.value ?? 'Unknown',
      sessions: parseInt(fmt(row.metricValues?.[0])),
      users: parseInt(fmt(row.metricValues?.[1])),
      conversions: parseInt(fmt(row.metricValues?.[2])),
    })),
    topPages: (pagesRes[0]?.rows || []).map(row => ({
      page: row.dimensionValues?.[0]?.value ?? '/',
      sessions: parseInt(fmt(row.metricValues?.[0])),
      pageviews: parseInt(fmt(row.metricValues?.[1])),
      bounceRate: parseFloat(fmt(row.metricValues?.[2])),
    })),
    byDevice: (deviceRes[0]?.rows || []).map(row => ({
      device: row.dimensionValues?.[0]?.value ?? 'Unknown',
      sessions: parseInt(fmt(row.metricValues?.[0])),
      users: parseInt(fmt(row.metricValues?.[1])),
    })),
    dailyTrend: (dailyRes[0]?.rows || []).map(row => {
      const d = row.dimensionValues?.[0]?.value ?? '';
      return {
        date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        sessions: parseInt(fmt(row.metricValues?.[0])),
        users: parseInt(fmt(row.metricValues?.[1])),
        newUsers: parseInt(fmt(row.metricValues?.[2])),
      };
    }),
  };
}

/**
 * Fetch GA4 sessions for a specific GA client ID.
 * GA4 Data API supports filtering by clientId when the User-ID / client ID
 * dimension is available. This requires the clientId to have been captured
 * from the _ga cookie and sent as a GA user property or user ID.
 *
 * We filter using the `clientId` dimension (available in GA4 standard reports).
 */
export async function getUserWebSessions(gaClientId: string, days: number = 90) {
  const client = getClient();
  if (!client) return null;

  try {
    const [res] = await client.runReport({
      property: propertyId,
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      dimensions: [
        { name: 'date' },
        { name: 'sessionDefaultChannelGrouping' },
        { name: 'deviceCategory' },
        { name: 'landingPage' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'conversions' },
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'clientId',
          stringFilter: { value: gaClientId, matchType: 'EXACT' },
        },
      },
      orderBys: [{ dimension: { dimensionName: 'date' }, desc: true }],
      limit: 50,
    });

    const fmt = (v: any) => v?.value ?? '0';

    return (res?.rows || []).map(row => ({
      date: (() => {
        const d = row.dimensionValues?.[0]?.value ?? '';
        return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
      })(),
      channel: row.dimensionValues?.[1]?.value ?? 'Unknown',
      device: row.dimensionValues?.[2]?.value ?? 'Unknown',
      landingPage: row.dimensionValues?.[3]?.value ?? '/',
      source: row.dimensionValues?.[4]?.value ?? '',
      medium: row.dimensionValues?.[5]?.value ?? '',
      sessions: parseInt(fmt(row.metricValues?.[0])),
      pageviews: parseInt(fmt(row.metricValues?.[1])),
      avgDuration: parseFloat(fmt(row.metricValues?.[2])),
      conversions: parseInt(fmt(row.metricValues?.[3])),
    }));
  } catch {
    // clientId dimension may not be available on all GA4 properties
    return [];
  }
}
