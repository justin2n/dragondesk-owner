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
type ActiveSection = 'trials' | 'leads' | 'members';

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
    };
  };
  programDistribution: { name: string; value: number }[];
}

const PROGRAM_COLORS: Record<string, string> = {
  BJJ: '#dc2626',
  'Muay Thai': '#f59e0b',
  Taekwondo: '#3b82f6',
  total: '#10b981',
};

const CHART_COLORS = ['#dc2626', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

const DragonDeskAnalytics = () => {
  const { selectedLocation, isAllLocations } = useLocation();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<ActiveSection>('trials');
  const [selectedProgram, setSelectedProgram] = useState<string>('all');
  const [monthsBack, setMonthsBack] = useState<number>(12);

  // Chart type preferences for each section
  const [chartTypes, setChartTypes] = useState<Record<ActiveSection, ChartType>>({
    trials: 'bar',
    leads: 'area',
    members: 'line',
  });

  useEffect(() => {
    console.log('[DragonDeskAnalytics] useEffect triggered:', {
      selectedLocation: selectedLocation?.name || 'none',
      selectedLocationId: selectedLocation?.id,
      isAllLocations,
      monthsBack
    });

    const fetchAnalytics = async () => {
      try {
        setIsLoading(true);
        const locationId = isAllLocations ? 'all' : String(selectedLocation?.id || '');
        console.log('[DragonDeskAnalytics] Fetching with locationId:', locationId);
        const response = await api.get(`/analytics/programs?months=${monthsBack}&locationId=${locationId}`);
        console.log('[DragonDeskAnalytics] Response totals:', response.summary?.totals);
        setData(response);
      } catch (error) {
        console.error('Failed to load analytics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, [selectedLocation, isAllLocations, monthsBack]);

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
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
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
                  label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
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
            </div>

            <div className={styles.tabContent}>
              {activeSection === 'trials' && renderTrialsSection()}
              {activeSection === 'leads' && renderLeadsSection()}
              {activeSection === 'members' && renderMembersSection()}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DragonDeskAnalytics;
