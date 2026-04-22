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
type ActiveSection = 'trials' | 'leads' | 'members' | 'value' | 'web';

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
  summary: {
    programs: ProgramSummary[];
    totals: {
      activeMembers: number;
      currentTrials: number;
      currentLeads: number;
      totalCancellations: number;
      expiredTrials: number;
    };
  };
  programDistribution: { name: string; value: number }[];
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
  total: '#10b981',
};

const CHART_COLORS = ['#dc2626', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

const DragonDeskAnalytics = () => {
  const { selectedLocation, isAllLocations } = useLocation();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<ActiveSection>('trials');
  const [selectedProgram, setSelectedProgram] = useState<string>('all');
  const [selectedMembershipAge, setSelectedMembershipAge] = useState<string>('all');
  const [monthsBack, setMonthsBack] = useState<number>(12);
  const [valueData, setValueData] = useState<ValueData | null>(null);
  const [valueLoading, setValueLoading] = useState(false);
  const [webData, setWebData] = useState<any | null>(null);
  const [webLoading, setWebLoading] = useState(false);
  const [webDays, setWebDays] = useState(30);

  // Chart type preferences for each section
  const [chartTypes, setChartTypes] = useState<Record<ActiveSection, ChartType>>({
    trials: 'bar',
    leads: 'area',
    members: 'line',
    value: 'bar',
    web: 'bar',
  });

  const locationId = isAllLocations ? 'all' : String(selectedLocation?.id || '');

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setIsLoading(true);
        const response = await api.get(`/analytics/programs?months=${monthsBack}&locationId=${locationId}`);
        setData(response);
      } catch (error) {
        console.error('Failed to load analytics:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAnalytics();
  }, [selectedLocation, isAllLocations, monthsBack]);

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
    if (activeSection !== 'web') return;
    const fetchWeb = async () => {
      try {
        setWebLoading(true);
        const response = await api.get(`/analytics/web/overview?days=${webDays}`);
        setWebData(response);
      } catch (error) {
        console.error('Failed to load web analytics:', error);
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
    xAxisKey: string = 'month'
  ) => {
    if (chartType === 'pie') {
      // For pie chart, aggregate the data
      const aggregated = dataKeys.map((key, index) => ({
        name: key.replace(/_/g, ' ').replace('volume', '').replace('active', ''),
        value: chartData.reduce((sum, d) => sum + (d[key] || 0), 0),
        color: CHART_COLORS[index % CHART_COLORS.length],
      }));

      return (
        <ResponsiveContainer width="100%" height={400}>
          <PieChart>
            <Pie
              data={aggregated}
              cx="50%"
              cy="50%"
              labelLine={true}
              label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
              outerRadius={150}
              fill="#8884d8"
              dataKey="value"
            >
              {aggregated.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    const ChartComponent = chartType === 'line' ? LineChart : chartType === 'bar' ? BarChart : AreaChart;
    const DataComponent = chartType === 'line' ? Line : chartType === 'bar' ? Bar : Area;

    return (
      <ResponsiveContainer width="100%" height={400}>
        <ChartComponent data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey={xAxisKey}
            stroke="var(--color-text-secondary)"
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
          />
          <YAxis stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)' }} />
          <Tooltip
            contentStyle={{
              background: 'var(--color-dark-grey)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              color: 'var(--color-text-primary)',
            }}
          />
          <Legend />
          {dataKeys.map((key, index) => (
            <DataComponent
              key={key}
              type="monotone"
              dataKey={key}
              name={key.replace(/_/g, ' ').replace('volume', 'Volume').replace('active', 'Active')}
              stroke={CHART_COLORS[index % CHART_COLORS.length]}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
              fillOpacity={chartType === 'area' ? 0.3 : 1}
              strokeWidth={2}
            />
          ))}
        </ChartComponent>
      </ResponsiveContainer>
    );
  };

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
          {renderChart(data.trialsData, conversionKeys, chartTypes.trials === 'pie' ? 'line' : chartTypes.trials)}
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
            <h3>Lead Volume by Month</h3>
            <p>New leads acquired per program</p>
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
            <div className={styles.statLabel}>All Programs</div>
          </div>
        </div>
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
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.programDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, value, percent }) => `${name}: ${value} (${((percent || 0) * 100).toFixed(0)}%)`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {data.programDistribution.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PROGRAM_COLORS[entry.name] || CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
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
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                tickFormatter={d => d.slice(5)} />
              <YAxis stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)' }} />
              <Tooltip contentStyle={{ background: 'var(--color-dark-grey)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)' }} />
              <Legend />
              <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#dc2626" fill="#dc2626" fillOpacity={0.2} strokeWidth={2} />
              <Area type="monotone" dataKey="newUsers" name="New Users" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
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
                <Pie data={byDevice} cx="50%" cy="50%" outerRadius={90} dataKey="sessions"
                  label={({ device, percent }) => `${device}: ${((percent || 0) * 100).toFixed(0)}%`}>
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
                  value={monthsBack}
                  onChange={(e) => setMonthsBack(parseInt(e.target.value))}
                  className={styles.select}
                >
                  <option value={3}>Last 3 Months</option>
                  <option value={6}>Last 6 Months</option>
                  <option value={12}>Last 12 Months</option>
                  <option value={24}>Last 24 Months</option>
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
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DragonDeskAnalytics;
