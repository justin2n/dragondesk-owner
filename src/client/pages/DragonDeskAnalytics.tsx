import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useLocation } from '../contexts/LocationContext';
import {
  MdPeople,
  MdPersonAdd,
  MdTrendingDown,
  MdGpsFixed,
  MdShowChart,
  MdBarChart,
  MdAreaChart,
  MdPieChart,
  MdLanguage,
  MdDevices,
  MdOpenInNew,
  MdTimerOff,
  MdAttachMoney,
  MdTrendingUp,
} from 'react-icons/md';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import styles from './DragonDeskAnalytics.module.css';

type ChartType = 'line' | 'bar' | 'area' | 'pie';
type ActiveSection = 'trials' | 'leads' | 'members' | 'value' | 'web' | 'marketing';

interface ValueData {
  acv: number;
  aleMonths: number;
  altv: number;
  modalEngagementMonths: number | null;
  engagementDistribution: { bucket_start: number; count: number }[];
  transactions: {
    id: number;
    firstName: string;
    lastName: string;
    programType: string;
    membershipAge: string;
    transaction_count: number;
    total_paid: number;
  }[];
}

interface ProgramSummary {
  name: string;
  activeMembers: number;
  currentTrials: number;
  currentLeads: number;
  totalCancellations: number;
  overallChurnRate: number;
}

interface AnalyticsData {
  programs: string[];
  trialsData: any[];
  leadsData: any[];
  membersData: any[];
  zapierActivityData?: { month: string; total: number; new_contacts: number; returning_contacts: number }[];
  summary: {
    programs: ProgramSummary[];
    totals: {
      activeMembers: number;
      currentTrials: number;
      currentLeads: number;
      totalCancellations: number;
      expiredTrials: number;
      mrr: number;
      arr: number;
    };
  };
  programDistribution: { name: string; value: number }[];
  leadSources: { source: string; count: number }[];
}

const PROGRAM_COLORS: Record<string, string> = {
  "Children's Martial Arts": '#f97316',
  'Adult BJJ': '#dc2626',
  'Adult TKD & HKD': '#3b82f6',
  'DG Barbell': '#78716c',
  'Adult Muay Thai & Kickboxing': '#f59e0b',
  'The Ashtanga Club': '#a3e635',
  'Dragon Gym Learning Center': '#06b6d4',
  'Kids BJJ': '#ef4444',
  'Kids Muay Thai': '#fbbf24',
  'Young Ladies Yoga': '#ec4899',
  'DG Workspace': '#8b5cf6',
  'Dragon Launch': '#14b8a6',
  'Personal Training': '#64748b',
  'DGMT Private Training': '#6366f1',
  'No Program Selected': '#a855f7',
  total: '#10b981',
};

const CHART_COLORS = ['#dc2626', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

// Clicking a legend item hides/shows that series (or pie slice). Returns props to
// spread onto a recharts <Legend> plus an isHidden(key) check.
function useLegendToggle() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const isHidden = (key?: string) => !!key && hidden.has(key);
  const legendProps = (keyOf?: (o: any) => string | undefined) => ({
    onClick: (o: any) => {
      const key = (keyOf ? keyOf(o) : (o?.dataKey ?? o?.value)) as string | undefined;
      if (!key) return;
      setHidden(prev => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    },
    formatter: (value: any, entry: any) => {
      const key = (keyOf ? keyOf(entry) : (entry?.dataKey ?? entry?.value)) as string | undefined;
      const off = isHidden(key);
      return (
        <span style={{ cursor: 'pointer', opacity: off ? 0.4 : 1, textDecoration: off ? 'line-through' : 'none' }}>
          {value}
        </span>
      );
    },
    wrapperStyle: { cursor: 'pointer' } as React.CSSProperties,
  });
  return { isHidden, legendProps };
}

// Line/Bar/Area/Pie chart with legend-click filtering. Replaces the old inline
// renderChart so every section's charts get selectable legends.
const AnalyticsChart: React.FC<{
  chartData: any[];
  dataKeys: string[];
  chartType: ChartType;
  xAxisKey?: string;
  isPercentage?: boolean;
}> = ({ chartData, dataKeys, chartType, xAxisKey = 'month', isPercentage = false }) => {
  const { isHidden, legendProps } = useLegendToggle();

  if (chartType === 'pie') {
    const aggregated = dataKeys.map((key, index) => ({
      name: key.replace(/_/g, ' ').replace('volume', '').replace('active', ''),
      value: chartData.reduce((sum, d) => sum + (d[key] || 0), 0),
      color: CHART_COLORS[index % CHART_COLORS.length],
    })).filter(item => item.value > 0);
    const shown = aggregated.filter(a => !isHidden(a.name));
    return (
      <ResponsiveContainer width="100%" height={400}>
        <PieChart>
          <Pie
            data={shown} cx="50%" cy="50%"
            labelLine={(props: any) => (props.percent || 0) >= 0.05}
            label={({ name, percent }) => (percent || 0) >= 0.05 ? `${name}: ${((percent || 0) * 100).toFixed(0)}%` : ''}
            outerRadius={150} fill="#8884d8" dataKey="value"
          >
            {shown.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
          </Pie>
          <Tooltip formatter={(value: any, name: any) => [value, name]} />
          <Legend
            payload={aggregated.map(a => ({ value: a.name, type: 'square', color: a.color, id: a.name }))}
            {...legendProps((o: any) => o?.value ?? o?.id)}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const ChartComponent = chartType === 'line' ? LineChart : chartType === 'bar' ? BarChart : AreaChart;
  const DataComponent: any = chartType === 'line' ? Line : chartType === 'bar' ? Bar : Area;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ChartComponent data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey={xAxisKey} stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
        <YAxis
          stroke="var(--color-text-secondary)"
          tick={{ fill: 'var(--color-text-secondary)' }}
          tickFormatter={isPercentage ? (v) => `${v}%` : undefined}
          domain={isPercentage ? [0, 100] : undefined}
        />
        <Tooltip
          contentStyle={{ background: 'var(--color-dark-grey)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)' }}
          formatter={isPercentage ? (value: any, name: any) => [`${Math.min(Number(value), 100).toFixed(1)}%`, name] : undefined}
        />
        <Legend {...legendProps()} />
        {dataKeys.map((key, index) => (
          <DataComponent
            key={key}
            type="monotone"
            dataKey={key}
            name={key.replace(/_conversionRate$/, '').replace(/_volume$/, '').replace(/_active$/, '').replace(/_/g, ' ')}
            stroke={CHART_COLORS[index % CHART_COLORS.length]}
            fill={CHART_COLORS[index % CHART_COLORS.length]}
            fillOpacity={chartType === 'area' ? 0.3 : 1}
            strokeWidth={2}
            hide={isHidden(key)}
          />
        ))}
      </ChartComponent>
    </ResponsiveContainer>
  );
};

// Pie with legend-click filtering, for the standalone (already-aggregated) pies.
const TogglePie: React.FC<{
  data: { name: string; value: number; color?: string }[];
  height?: number;
  showValueInLabel?: boolean;
}> = ({ data, height = 300, showValueInLabel = false }) => {
  const { isHidden, legendProps } = useLegendToggle();
  const shown = data.filter(d => !isHidden(d.name));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={shown} cx="50%" cy="50%"
          labelLine={(props: any) => (props.percent || 0) >= 0.05}
          label={({ name, value, percent }) => (percent || 0) >= 0.05
            ? (showValueInLabel ? `${name}: ${value} (${((percent || 0) * 100).toFixed(0)}%)` : `${name}: ${((percent || 0) * 100).toFixed(0)}%`)
            : ''}
          outerRadius={100} fill="#8884d8" dataKey="value"
        >
          {shown.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />))}
        </Pie>
        <Tooltip />
        <Legend
          payload={data.map((d, i) => ({ value: d.name, type: 'square', color: d.color || CHART_COLORS[i % CHART_COLORS.length], id: d.name }))}
          {...legendProps((o: any) => o?.value ?? o?.id)}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

// Web "Daily Sessions" trend with legend-click filtering (sessions / new users).
const DailySessionsChart: React.FC<{ data: any[] }> = ({ data }) => {
  const { isHidden, legendProps } = useLegendToggle();
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="date" stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} tickFormatter={(d: any) => String(d).slice(5)} />
        <YAxis stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)' }} />
        <Tooltip contentStyle={{ background: 'var(--color-dark-grey)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)' }} />
        <Legend {...legendProps()} />
        <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#dc2626" fill="#dc2626" fillOpacity={0.2} strokeWidth={2} hide={isHidden('sessions')} />
        <Area type="monotone" dataKey="newUsers" name="New Users" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} hide={isHidden('newUsers')} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

const DragonDeskAnalytics = () => {
  const { selectedLocation, isAllLocations } = useLocation();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<ActiveSection>('trials');
  const [selectedProgram, setSelectedProgram] = useState<string>('all');
  const [selectedMembershipAge, setSelectedMembershipAge] = useState<string>('all');
  // '30d' = last 30 days (daily granularity); otherwise a month count.
  const [timePeriod, setTimePeriod] = useState<string>('12');
  const [valueData, setValueData] = useState<ValueData | null>(null);
  const [valueLoading, setValueLoading] = useState(false);
  const [webData, setWebData] = useState<any | null>(null);
  const [webLoading, setWebLoading] = useState(false);
  const [webDays, setWebDays] = useState(30);
  const [marketingData, setMarketingData] = useState<any | null>(null);
  const [marketingLoading, setMarketingLoading] = useState(false);

  // Chart type preferences for each section
  const [chartTypes, setChartTypes] = useState<Record<ActiveSection, ChartType>>({
    trials: 'bar',
    leads: 'area',
    members: 'line',
    value: 'bar',
    web: 'bar',
    marketing: 'bar',
  });

  const locationId = isAllLocations ? 'all' : String(selectedLocation?.id || '');

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setIsLoading(true);
        const periodParam = timePeriod === '30d' ? 'days=30' : `months=${timePeriod}`;
        const response = await api.get(`/analytics/programs?${periodParam}&locationId=${locationId}`);
        setData(response);
      } catch (error) {
        console.error('Failed to load analytics:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAnalytics();
  }, [selectedLocation, isAllLocations, timePeriod]);

  useEffect(() => {
    if (activeSection !== 'value') return;
    const fetchValue = async () => {
      try {
        setValueLoading(true);
        const qs = new URLSearchParams({
          locationId,
          ...(selectedProgram !== 'all' && { program: selectedProgram }),
          ...(selectedMembershipAge !== 'all' && { membershipAge: selectedMembershipAge }),
        });
        const response = await api.get(`/analytics/value?${qs}`);
        setValueData(response);
      } catch (error) {
        console.error('Failed to load value analytics:', error);
      } finally {
        setValueLoading(false);
      }
    };
    fetchValue();
  }, [activeSection, selectedLocation, isAllLocations, selectedProgram, selectedMembershipAge]);

  useEffect(() => {
    if (activeSection !== 'marketing') return;
    const fetchMarketing = async () => {
      try {
        setMarketingLoading(true);
        const monthsParam = timePeriod === '30d' ? '1' : timePeriod;
        const response = await api.get(`/analytics/attribution?months=${monthsParam}&locationId=${locationId}`);
        setMarketingData(response);
      } catch (error) {
        console.error('Failed to load marketing analytics:', error);
        setMarketingData(null);
      } finally {
        setMarketingLoading(false);
      }
    };
    fetchMarketing();
  }, [activeSection, selectedLocation, isAllLocations, timePeriod]);

  useEffect(() => {
    if (activeSection !== 'web') return;
    const fetchWeb = async () => {
      try {
        setWebLoading(true);
        const response = await api.get(`/analytics/web/overview?days=${webDays}`);
        setWebData(response);
      } catch (error: any) {
        console.error('Failed to load web analytics:', error);
        setWebData({ configured: true, error: error?.message || 'Failed to reach analytics server.' });
      } finally {
        setWebLoading(false);
      }
    };
    fetchWeb();
  }, [activeSection, webDays]);

  const getChartTypeIcon = (type: ChartType) => {
    switch (type) {
      case 'line':
        return <MdShowChart size={20} />;
      case 'bar':
        return <MdBarChart size={20} />;
      case 'area':
        return <MdAreaChart size={20} />;
      case 'pie':
        return <MdPieChart size={20} />;
    }
  };

  const renderChart = (
    chartData: any[],
    dataKeys: string[],
    chartType: ChartType,
    xAxisKey: string = 'month',
    isPercentage: boolean = false
  ) => (
    <AnalyticsChart
      chartData={chartData}
      dataKeys={dataKeys}
      chartType={chartType}
      xAxisKey={xAxisKey}
      isPercentage={isPercentage}
    />
  );

  const renderTrialsSection = () => {
    if (!data) return null;

    const programs = selectedProgram === 'all' ? data.programs : [selectedProgram];
    const volumeKeys = programs.map((p) => `${p}_volume`);
    const conversionKeys = programs.map((p) => `${p}_conversionRate`);

    return (
      <div className={styles.sectionContent}>
        <div className={styles.chartContainer}>
          <div className={styles.chartHeader}>
            <h3>Trial Volume by Month</h3>
            <p>Number of trials started per program</p>
          </div>
          {renderChart(data.trialsData, volumeKeys, chartTypes.trials)}
        </div>

        <div className={styles.chartContainer}>
          <div className={styles.chartHeader}>
            <h3>Conversion Rate by Month</h3>
            <p>Percentage of trials converted to members</p>
          </div>
          {renderChart(data.trialsData, conversionKeys, chartTypes.trials === 'pie' ? 'line' : chartTypes.trials, 'month', true)}
        </div>

        <div className={styles.statsGrid}>
          {data.summary.programs.map((program) => (
            <div key={program.name} className={styles.statCard}>
              <div
                className={styles.statIndicator}
                style={{ backgroundColor: PROGRAM_COLORS[program.name] || '#6b7280' }}
              />
              <h4>{program.name}</h4>
              <div className={styles.statValue}>{program.currentTrials}</div>
              <div className={styles.statLabel}>Current Trials</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderLeadsSection = () => {
    if (!data) return null;

    const programs = selectedProgram === 'all' ? data.programs : [selectedProgram];
    const leadKeys = selectedProgram === 'all' ? [...programs, 'total'] : programs;

    return (
      <div className={styles.sectionContent}>
        <div className={styles.chartContainer}>
          <div className={styles.chartHeader}>
            <h3>Lead Acquisition by Month</h3>
            <p>New contacts created per program (includes converted leads)</p>
          </div>
          {renderChart(data.leadsData, leadKeys, chartTypes.leads)}
        </div>

        <div className={styles.statsGrid}>
          {data.summary.programs.map((program) => (
            <div key={program.name} className={styles.statCard}>
              <div
                className={styles.statIndicator}
                style={{ backgroundColor: PROGRAM_COLORS[program.name] || '#6b7280' }}
              />
              <h4>{program.name}</h4>
              <div className={styles.statValue}>{program.currentLeads}</div>
              <div className={styles.statLabel}>Current Leads</div>
            </div>
          ))}
          <div className={styles.statCard}>
            <div className={styles.statIndicator} style={{ backgroundColor: PROGRAM_COLORS.total }} />
            <h4>Total</h4>
            <div className={styles.statValue}>{data.summary.totals.currentLeads}</div>
            <div className={styles.statLabel}>Current Leads</div>
          </div>
        </div>

        {data.zapierActivityData && data.zapierActivityData.some(d => d.total > 0) && (
          <div className={styles.chartContainer} style={{ marginTop: '1.5rem' }}>
            <div className={styles.chartHeader}>
              <h3>Zapier Webhook Activity</h3>
              <p>
                Leads submitted via Zapier per month — counts every webhook hit,
                including re-submissions of contacts already in DragonDesk
              </p>
            </div>
            {renderChart(
              data.zapierActivityData,
              ['new_contacts', 'returning_contacts'],
              'bar'
            )}
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '8px' }}>
              <strong>New contacts</strong> = email did not exist in DragonDesk before this Zapier hit.&nbsp;
              <strong>Re-submissions</strong> = email already existed; lead acquisition date is unchanged in the chart above.
            </p>
          </div>
        )}

        {data.leadSources && data.leadSources.length > 0 && (
          <div className={styles.chartContainer} style={{ marginTop: '1.5rem' }}>
            <div className={styles.chartHeader}>
              <h3>Lead Sources</h3>
              <p>All contacts by acquisition channel (total lifetime)</p>
            </div>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Source</th>
                  <th style={{ textAlign: 'right' }}>Contacts</th>
                  <th style={{ textAlign: 'right' }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {data.leadSources.map(({ source, count }) => {
                  const total = data.leadSources.reduce((s, r) => s + r.count, 0);
                  return (
                    <tr key={source}>
                      <td style={{ textTransform: 'capitalize' }}>{source.replace(/_/g, ' ')}</td>
                      <td style={{ textAlign: 'right' }}>{count}</td>
                      <td style={{ textAlign: 'right' }}>{total > 0 ? ((count / total) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderMembersSection = () => {
    if (!data) return null;

    const programs = selectedProgram === 'all' ? data.programs : [selectedProgram];
    const activeKeys = programs.map((p) => `${p}_active`);
    const churnKeys = programs.map((p) => `${p}_cancellations`);

    return (
      <div className={styles.sectionContent}>
        <div className={styles.chartContainer}>
          <div className={styles.chartHeader}>
            <h3>Active Members by Month</h3>
            <p>Total active members per program</p>
          </div>
          {renderChart(data.membersData, activeKeys, chartTypes.members)}
        </div>

        <div className={styles.chartContainer}>
          <div className={styles.chartHeader}>
            <h3>Cancellations (Churn) by Month</h3>
            <p>Member cancellations per program</p>
          </div>
          {renderChart(data.membersData, churnKeys, chartTypes.members === 'pie' ? 'bar' : chartTypes.members)}
        </div>

        <div className={styles.statsGrid}>
          {data.summary.programs.map((program) => (
            <div key={program.name} className={styles.statCard}>
              <div
                className={styles.statIndicator}
                style={{ backgroundColor: PROGRAM_COLORS[program.name] || '#6b7280' }}
              />
              <h4>{program.name}</h4>
              <div className={styles.statRow}>
                <div>
                  <div className={styles.statValue}>{program.activeMembers}</div>
                  <div className={styles.statLabel}>Active</div>
                </div>
                <div>
                  <div className={styles.statValue} style={{ color: '#ef4444' }}>
                    {program.overallChurnRate}%
                  </div>
                  <div className={styles.statLabel}>Churn Rate</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {chartTypes.members !== 'pie' && (
          <div className={styles.chartContainer}>
            <div className={styles.chartHeader}>
              <h3>Program Distribution</h3>
              <p>Active members by program</p>
            </div>
            <TogglePie
              height={300}
              showValueInLabel
              data={data.programDistribution
                .filter((e: any) => e.value > 0)
                .map((e: any, i: number) => ({
                  name: e.name,
                  value: e.value,
                  color: PROGRAM_COLORS[e.name] || CHART_COLORS[i % CHART_COLORS.length],
                }))}
            />
          </div>
        )}
      </div>
    );
  };

  const fmtDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${m}m ${s}s`;
  };

  const renderMarketingSection = () => {
    if (marketingLoading) return <div className={styles.loading}>Loading marketing analytics...</div>;
    if (!marketingData) {
      return (
        <div className={styles.empty}>
          <p>No attribution data yet. It populates as leads come in with UTM parameters — from ads, email links, and tracked forms.</p>
        </div>
      );
    }

    const { kpis, channels = [], campaigns = [] } = marketingData;
    const rightAlign: React.CSSProperties = { textAlign: 'right' };

    return (
      <div className={styles.sectionContent}>
        <div className={styles.webKpiGrid}>
          {[
            { label: 'Attributed Leads', value: (kpis.attributedLeads || 0).toLocaleString() },
            { label: 'Members Won', value: (kpis.members || 0).toLocaleString() },
            { label: 'Lead → Member', value: `${kpis.leadToMemberRate || 0}%` },
            { label: 'Top Channel', value: kpis.topChannel || '—' },
            { label: 'Top Campaign', value: kpis.topCampaign || '—' },
          ].map((k) => (
            <div key={k.label} className={styles.webKpiCard}>
              <div className={styles.webKpiValue}>{k.value}</div>
              <div className={styles.webKpiLabel}>{k.label}</div>
            </div>
          ))}
        </div>

        {channels.length === 0 ? (
          <div className={styles.empty}><p>No attributed leads in this period yet.</p></div>
        ) : (
          <>
            <div className={styles.chartContainer}>
              <div className={styles.chartHeader}>
                <h3>Channel Breakdown</h3>
                <p>Leads and conversions by acquisition channel (first-touch)</p>
              </div>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th style={rightAlign}>Leads</th>
                    <th style={rightAlign}>Trialers</th>
                    <th style={rightAlign}>Members</th>
                    <th style={rightAlign}>Conv. Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((c: any) => (
                    <tr key={c.channel}>
                      <td>{c.channel}</td>
                      <td style={rightAlign}>{c.leads}</td>
                      <td style={rightAlign}>{c.trialers}</td>
                      <td style={rightAlign}>{c.members}</td>
                      <td style={rightAlign}>{c.convRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.chartContainer} style={{ marginTop: '1.5rem' }}>
              <div className={styles.chartHeader}>
                <h3>Campaign Performance</h3>
                <p>Leads and conversions by UTM campaign</p>
              </div>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Source / Medium</th>
                    <th style={rightAlign}>Leads</th>
                    <th style={rightAlign}>Trialers</th>
                    <th style={rightAlign}>Members</th>
                    <th style={rightAlign}>Conv. Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c: any, i: number) => (
                    <tr key={i}>
                      <td>{c.campaign}</td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{[c.source, c.medium].filter(Boolean).join(' / ') || '—'}</td>
                      <td style={rightAlign}>{c.leads}</td>
                      <td style={rightAlign}>{c.trialers}</td>
                      <td style={rightAlign}>{c.members}</td>
                      <td style={rightAlign}>{c.convRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '8px' }}>
              First-touch attribution — a lead is credited to the source that first brought them in. Uses the Time Period selector above.
            </p>
          </>
        )}
      </div>
    );
  };

  const renderWebSection = () => {
    if (webLoading) return <div className={styles.loading}>Loading web analytics...</div>;
    if (!webData) return null;

    if (!webData.configured) {
      return (
        <div className={styles.sectionContent}>
          <div className={styles.webNotConfigured}>
            <MdLanguage size={48} style={{ opacity: 0.3 }} />
            <h3>Google Analytics Not Configured</h3>
            <p>Add these environment variables to your Railway deployment to enable web analytics:</p>
            <div className={styles.webEnvVars}>
              <code>GA_PROPERTY_ID=properties/YOUR_PROPERTY_ID</code>
              <code>GA_SERVICE_ACCOUNT_JSON={`{"type":"service_account","project_id":"..."}`}</code>
            </div>
            <p className={styles.webEnvNote}>
              Create a service account in Google Cloud Console, grant it <strong>Viewer</strong> access
              to your GA4 property, and paste the JSON key as the env var value.
            </p>
          </div>
        </div>
      );
    }

    if (webData.error) {
      return (
        <div className={styles.sectionContent}>
          <div className={styles.webNotConfigured}>
            <MdLanguage size={48} style={{ opacity: 0.3 }} />
            <h3>Google Analytics Error</h3>
            <p>{webData.error}</p>
            <p className={styles.webEnvNote}>
              Common causes: <strong>GA_PROPERTY_ID</strong> must use the format <code>properties/123456789</code>.
              The service account JSON must be the full JSON key file content (not base64-encoded).
              The service account must have <strong>Viewer</strong> role on your GA4 property.
              Check Railway deploy logs for <code>[GA]</code> entries for the exact error.
            </p>
          </div>
        </div>
      );
    }

    const { kpis, byChannel, topPages, byDevice, dailyTrend } = webData;
    const deviceColors: Record<string, string> = { desktop: '#3b82f6', mobile: '#dc2626', tablet: '#f59e0b' };

    return (
      <div className={styles.sectionContent}>
        {/* KPI row */}
        <div className={styles.webKpiGrid}>
          {[
            { label: 'Sessions', value: (kpis.sessions || 0).toLocaleString() },
            { label: 'Users', value: (kpis.users || 0).toLocaleString() },
            { label: 'New Users', value: (kpis.newUsers || 0).toLocaleString() },
            { label: 'Pageviews', value: (kpis.pageviews || 0).toLocaleString() },
            { label: 'Avg Session', value: fmtDuration(kpis.avgSessionDuration || 0) },
            { label: 'Bounce Rate', value: `${((kpis.bounceRate || 0) * 100).toFixed(1)}%` },
          ].map(k => (
            <div key={k.label} className={styles.webKpiCard}>
              <div className={styles.webKpiValue}>{k.value}</div>
              <div className={styles.webKpiLabel}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Daily sessions trend */}
        <div className={styles.chartContainer}>
          <div className={styles.chartHeader}>
            <h3>Daily Sessions</h3>
            <p>Sessions and new users over the selected period</p>
          </div>
          <DailySessionsChart data={dailyTrend} />
        </div>

        <div className={styles.webTwoCol}>
          {/* Traffic by channel */}
          <div className={styles.chartContainer}>
            <div className={styles.chartHeader}>
              <h3>Traffic by Channel</h3>
              <p>Session volume by acquisition channel</p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byChannel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                <YAxis type="category" dataKey="channel" width={110} stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'var(--color-dark-grey)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)' }} />
                <Bar dataKey="sessions" name="Sessions" fill="#dc2626" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Device breakdown */}
          <div className={styles.chartContainer}>
            <div className={styles.chartHeader}>
              <h3>Device Breakdown</h3>
              <p>Sessions by device type</p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byDevice.filter((d: any) => d.sessions > 0)} cx="50%" cy="50%" outerRadius={90} dataKey="sessions"
                  labelLine={(props: any) => (props.percent || 0) >= 0.05}
                  label={({ device, percent }) => (percent || 0) >= 0.05 ? `${device}: ${((percent || 0) * 100).toFixed(0)}%` : ''}>
                  {byDevice.map((entry: any, i: number) => (
                    <Cell key={i} fill={deviceColors[entry.device] || CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top pages table */}
        <div className={styles.chartContainer}>
          <div className={styles.chartHeader}>
            <h3>Top Landing Pages</h3>
            <p>Where visitors are entering the site</p>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Sessions</th>
                  <th>Pageviews</th>
                  <th>Bounce Rate</th>
                </tr>
              </thead>
              <tbody>
                {topPages.map((p: any, i: number) => (
                  <tr key={i}>
                    <td>
                      <span className={styles.webPagePath}>{p.page}</span>
                    </td>
                    <td>{p.sessions.toLocaleString()}</td>
                    <td>{p.pageviews.toLocaleString()}</td>
                    <td>{((p.bounceRate || 0) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stitching note */}
        <div className={styles.webStitchNote}>
          <MdDevices size={18} />
          <span>
            <strong>Lead stitching active.</strong> When a visitor submits the marketing site contact form,
            their GA client ID is captured and stored on their lead record. View per-lead web sessions
            from the Contacts page.
          </span>
        </div>
      </div>
    );
  };

  const renderSummaryCards = () => {
    if (!data) return null;

    return (
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <MdPeople size={28} />
          </div>
          <div className={styles.summaryContent}>
            <div className={styles.summaryValue}>{data.summary.totals.activeMembers}</div>
            <div className={styles.summaryLabel}>Active Members</div>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <MdGpsFixed size={28} />
          </div>
          <div className={styles.summaryContent}>
            <div className={styles.summaryValue}>{data.summary.totals.currentTrials}</div>
            <div className={styles.summaryLabel}>Current Trials</div>
          </div>
        </div>
        <div className={`${styles.summaryCard} ${data.summary.totals.expiredTrials > 0 ? styles.summaryCardWarning : ''}`}>
          <div className={`${styles.summaryIcon} ${data.summary.totals.expiredTrials > 0 ? styles.summaryIconWarning : ''}`}>
            <MdTimerOff size={28} />
          </div>
          <div className={styles.summaryContent}>
            <div className={styles.summaryValue}>{data.summary.totals.expiredTrials}</div>
            <div className={styles.summaryLabel}>Expired Trials</div>
            <div className={styles.summarySubLabel}>Trialers &gt; 30 days</div>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <MdPersonAdd size={28} />
          </div>
          <div className={styles.summaryContent}>
            <div className={styles.summaryValue}>{data.summary.totals.currentLeads}</div>
            <div className={styles.summaryLabel}>Current Leads</div>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <MdTrendingDown size={28} />
          </div>
          <div className={styles.summaryContent}>
            <div className={styles.summaryValue}>{data.summary.totals.totalCancellations}</div>
            <div className={styles.summaryLabel}>Total Cancellations</div>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <MdAttachMoney size={28} />
          </div>
          <div className={styles.summaryContent}>
            <div className={styles.summaryValue}>
              ${(data.summary.totals.mrr || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <div className={styles.summaryLabel}>MRR</div>
            <div className={styles.summarySubLabel}>Active account holders' memberships</div>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <MdTrendingUp size={28} />
          </div>
          <div className={styles.summaryContent}>
            <div className={styles.summaryValue}>
              ${(data.summary.totals.arr || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <div className={styles.summaryLabel}>ARR</div>
            <div className={styles.summarySubLabel}>MRR &times; 12</div>
          </div>
        </div>
      </div>
    );
  };

  const fmt = (n: number, decimals = 2) =>
    n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const renderValueSection = () => {
    if (valueLoading) return <div className={styles.loading}>Loading value metrics...</div>;
    if (!valueData) return null;

    const { acv, aleMonths, altv, modalEngagementMonths, engagementDistribution, transactions } = valueData;

    return (
      <div className={styles.sectionContent}>
        {/* Key metric cards */}
        <div className={styles.valueCards}>
          <div className={styles.valueCard}>
            <div className={styles.valueCardLabel}>ACV</div>
            <div className={styles.valueCardTitle}>Avg Contract Value</div>
            <div className={styles.valueCardAmount}>${fmt(acv)}</div>
            <div className={styles.valueCardSub}>per year, per member</div>
          </div>
          <div className={styles.valueCard}>
            <div className={styles.valueCardLabel}>ALE</div>
            <div className={styles.valueCardTitle}>Avg Lifetime Engagement</div>
            <div className={styles.valueCardAmount}>{fmt(aleMonths, 1)} mo</div>
            <div className={styles.valueCardSub}>{fmt(aleMonths / 12, 1)} years average tenure</div>
          </div>
          <div className={`${styles.valueCard} ${styles.valueCardHighlight}`}>
            <div className={styles.valueCardLabel}>ALTV</div>
            <div className={styles.valueCardTitle}>Avg Lifetime Value</div>
            <div className={styles.valueCardAmount}>${fmt(altv)}</div>
            <div className={styles.valueCardSub}>ACV × ALE</div>
          </div>
        </div>

        {/* Modal engagement */}
        <div className={styles.modalEngagement}>
          <div className={styles.modalEngagementLabel}>Modal Lifetime Engagement</div>
          <div className={styles.modalEngagementValue}>
            {modalEngagementMonths !== null ? `${modalEngagementMonths} months` : 'Insufficient data'}
          </div>
          <div className={styles.modalEngagementSub}>
            Most common membership duration — the single most frequent tenure length across your filtered members
          </div>
        </div>

        {/* Engagement distribution histogram */}
        {engagementDistribution.length > 0 && (
          <div className={styles.chartContainer}>
            <div className={styles.chartHeader}>
              <h3>Engagement Duration Distribution</h3>
              <p>Number of members by tenure length (3-month bands)</p>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={engagementDistribution.map(d => ({
                label: `${d.bucket_start}–${d.bucket_start + 3}mo`,
                count: parseInt(String(d.count)),
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                <YAxis stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)' }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--color-dark-grey)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)' }} />
                <Bar dataKey="count" name="Members" fill="#dc2626" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Transaction counts table */}
        <div className={styles.chartContainer}>
          <div className={styles.chartHeader}>
            <h3>Transaction Counts by Member</h3>
            <p>Paid invoices and total revenue per member</p>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Program</th>
                  <th>Age Group</th>
                  <th>Transactions</th>
                  <th>Total Paid</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan={5} className={styles.emptyRow}>No transaction data found for the selected filters.</td></tr>
                ) : (
                  transactions.map(t => (
                    <tr key={t.id}>
                      <td>{t.firstName} {t.lastName}</td>
                      <td>{t.programType}</td>
                      <td>{t.membershipAge}</td>
                      <td className={styles.txCount}>{t.transaction_count}</td>
                      <td className={styles.txAmount}>${fmt(t.total_paid)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>DragonDesk: Analytics</h1>
        <p className={styles.subtitle}>Program Performance & Membership Insights</p>
      </div>

      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>Loading analytics data...</div>
        ) : !data ? (
          <div className={styles.empty}>
            <p>No analytics data available.</p>
          </div>
        ) : (
          <>
            {renderSummaryCards()}

            <div className={styles.controlsRow}>
              <div className={styles.filterGroup}>
                <label>Time Period:</label>
                <select
                  value={timePeriod}
                  onChange={(e) => setTimePeriod(e.target.value)}
                  className={styles.select}
                >
                  <option value="30d">Last 30 Days</option>
                  <option value="3">Last 3 Months</option>
                  <option value="6">Last 6 Months</option>
                  <option value="12">Last 12 Months</option>
                  <option value="24">Last 24 Months</option>
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label>Program:</label>
                <select
                  value={selectedProgram}
                  onChange={(e) => setSelectedProgram(e.target.value)}
                  className={styles.select}
                >
                  <option value="all">All Programs</option>
                  {data.programs.map((program) => (
                    <option key={program} value={program}>
                      {program}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label>Age Group:</label>
                <select
                  value={selectedMembershipAge}
                  onChange={(e) => setSelectedMembershipAge(e.target.value)}
                  className={styles.select}
                >
                  <option value="all">All Ages</option>
                  <option value="Adult">Adult</option>
                  <option value="Kids">Kids</option>
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label>Chart Type:</label>
                <div className={styles.chartTypeButtons}>
                  {(['line', 'bar', 'area', 'pie'] as ChartType[]).map((type) => (
                    <button
                      key={type}
                      className={`${styles.chartTypeBtn} ${chartTypes[activeSection] === type ? styles.active : ''}`}
                      onClick={() => setChartTypes({ ...chartTypes, [activeSection]: type })}
                      title={type.charAt(0).toUpperCase() + type.slice(1)}
                    >
                      {getChartTypeIcon(type)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${activeSection === 'trials' ? styles.activeTab : ''}`}
                onClick={() => setActiveSection('trials')}
              >
                Trials
              </button>
              <button
                className={`${styles.tab} ${activeSection === 'leads' ? styles.activeTab : ''}`}
                onClick={() => setActiveSection('leads')}
              >
                Leads
              </button>
              <button
                className={`${styles.tab} ${activeSection === 'members' ? styles.activeTab : ''}`}
                onClick={() => setActiveSection('members')}
              >
                Members
              </button>
              <button
                className={`${styles.tab} ${activeSection === 'value' ? styles.activeTab : ''}`}
                onClick={() => setActiveSection('value')}
              >
                Value
              </button>
              <button
                className={`${styles.tab} ${activeSection === 'web' ? styles.activeTab : ''}`}
                onClick={() => setActiveSection('web')}
              >
                <MdLanguage size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Web
              </button>
              <button
                className={`${styles.tab} ${activeSection === 'marketing' ? styles.activeTab : ''}`}
                onClick={() => setActiveSection('marketing')}
              >
                Marketing
              </button>
            </div>

            {activeSection === 'web' && (
              <div className={styles.controlsRow}>
                <div className={styles.filterGroup}>
                  <label>Date Range:</label>
                  <select value={webDays} onChange={e => setWebDays(parseInt(e.target.value))} className={styles.select}>
                    <option value={7}>Last 7 Days</option>
                    <option value={30}>Last 30 Days</option>
                    <option value={90}>Last 90 Days</option>
                    <option value={180}>Last 180 Days</option>
                  </select>
                </div>
              </div>
            )}

            <div className={styles.tabContent}>
              {activeSection === 'trials' && renderTrialsSection()}
              {activeSection === 'leads' && renderLeadsSection()}
              {activeSection === 'members' && renderMembersSection()}
              {activeSection === 'value' && renderValueSection()}
              {activeSection === 'web' && renderWebSection()}
              {activeSection === 'marketing' && renderMarketingSection()}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DragonDeskAnalytics;
