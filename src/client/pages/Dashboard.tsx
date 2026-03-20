import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { Member } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  MembersIcon,
  AudiencesIcon,
  AddPersonIcon,
  StarIcon,
  BJJIcon,
  MuayThaiIcon,
  TaekwondoIcon,
  EngageIcon,
  OptimizeIcon,
  SocialIcon,
} from '../components/Icons';
import { useLocation } from '../contexts/LocationContext';
import styles from './Dashboard.module.css';

const Dashboard = () => {
  const { selectedLocation, isAllLocations } = useLocation();
  const [stats, setStats] = useState({
    totalMembers: 0,
    leads: 0,
    trialers: 0,
    members: 0,
    bjj: 0,
    muayThai: 0,
    taekwondo: 0,
  });
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'year'>('week');
  const [selectedProgram, setSelectedProgram] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [zoom, setZoom] = useState<number>(100);

  useEffect(() => {
    loadStats();
    loadAnalytics();
  }, [selectedLocation, isAllLocations]);

  useEffect(() => {
    loadAnalytics();
  }, [timeframe, selectedProgram, selectedLocation, isAllLocations]);

  const loadStats = async () => {
    try {
      const locationId = isAllLocations ? 'all' : selectedLocation?.id;
      const members: Member[] = await api.get(`/members?locationId=${locationId}`);

      const stats = {
        totalMembers: members.length,
        leads: members.filter((m) => m.accountStatus === 'lead').length,
        trialers: members.filter((m) => m.accountStatus === 'trialer').length,
        members: members.filter((m) => m.accountStatus === 'member').length,
        bjj: members.filter((m) => m.programType === 'BJJ').length,
        muayThai: members.filter((m) => m.programType === 'Muay Thai').length,
        taekwondo: members.filter((m) => m.programType === 'Taekwondo').length,
      };

      setStats(stats);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const locationId = isAllLocations ? 'all' : selectedLocation?.id;
      const data = await api.get(`/analytics/dashboard?timeframe=${timeframe}&program=${selectedProgram}&locationId=${locationId}`);
      setAnalyticsData(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Welcome to DragonDesk: CRM</p>
        </div>
        <div className={styles.zoomControls}>
          <button
            onClick={() => setZoom(Math.max(50, zoom - 10))}
            className={styles.zoomBtn}
            disabled={zoom <= 50}
            title="Zoom out"
          >
            -
          </button>
          <span className={styles.zoomLevel}>{zoom}%</span>
          <button
            onClick={() => setZoom(Math.min(150, zoom + 10))}
            className={styles.zoomBtn}
            disabled={zoom >= 150}
            title="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setZoom(100)}
            className={styles.resetBtn}
            title="Reset zoom"
          >
            Reset
          </button>
        </div>
      </div>

      <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left', width: `${10000 / zoom}%` }}>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <MembersIcon size={40} />
          </div>
          <div className={styles.statInfo}>
            <div className={styles.statValue}>{stats.totalMembers}</div>
            <div className={styles.statLabel}>Total Profiles</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <AudiencesIcon size={40} />
          </div>
          <div className={styles.statInfo}>
            <div className={styles.statValue}>{stats.leads}</div>
            <div className={styles.statLabel}>Leads</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <AddPersonIcon size={40} />
          </div>
          <div className={styles.statInfo}>
            <div className={styles.statValue}>{stats.trialers}</div>
            <div className={styles.statLabel}>Trialers</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <StarIcon size={40} />
          </div>
          <div className={styles.statInfo}>
            <div className={styles.statValue}>{stats.members}</div>
            <div className={styles.statLabel}>Members</div>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Programs</h2>
        <div className={styles.programsGrid}>
          <div className={styles.programCard}>
            <div className={styles.programHeader}>
              <span className={styles.programIcon}>
                <BJJIcon size={28} />
              </span>
              <h3>Brazilian Jiu Jitsu</h3>
            </div>
            <div className={styles.programValue}>{stats.bjj} Members</div>
          </div>

          <div className={styles.programCard}>
            <div className={styles.programHeader}>
              <span className={styles.programIcon}>
                <MuayThaiIcon size={28} />
              </span>
              <h3>Muay Thai</h3>
            </div>
            <div className={styles.programValue}>{stats.muayThai} Members</div>
          </div>

          <div className={styles.programCard}>
            <div className={styles.programHeader}>
              <span className={styles.programIcon}>
                <TaekwondoIcon size={28} />
              </span>
              <h3>Taekwondo</h3>
            </div>
            <div className={styles.programValue}>{stats.taekwondo} Members</div>
          </div>
        </div>
      </div>

      {analyticsData && (
        <div className={styles.section}>
          <div className={styles.analyticsHeader}>
            <h2 className={styles.sectionTitle}>Growth Analytics</h2>
            <div className={styles.analyticsControls}>
              <select
                value={selectedProgram}
                onChange={(e) => setSelectedProgram(e.target.value)}
                className={styles.programFilter}
              >
                <option value="all">All Programs</option>
                <option value="BJJ">Brazilian Jiu Jitsu</option>
                <option value="Muay Thai">Muay Thai</option>
                <option value="Taekwondo">Taekwondo</option>
              </select>
              <div className={styles.timeframeToggle}>
                <button
                  className={`${styles.timeframeBtn} ${timeframe === 'week' ? styles.active : ''}`}
                  onClick={() => setTimeframe('week')}
                >
                  Week over Week
                </button>
                <button
                  className={`${styles.timeframeBtn} ${timeframe === 'month' ? styles.active : ''}`}
                  onClick={() => setTimeframe('month')}
                >
                  Month over Month
                </button>
                <button
                  className={`${styles.timeframeBtn} ${timeframe === 'year' ? styles.active : ''}`}
                  onClick={() => setTimeframe('year')}
                >
                  Year over Year
                </button>
              </div>
            </div>
          </div>

          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Conversion Rate</div>
              <div className={styles.metricValue}>{analyticsData.metrics.conversionRate}%</div>
              <div className={styles.metricDesc}>Trialers who became paid members</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Churn Rate</div>
              <div className={styles.metricValue}>{analyticsData.metrics.churnRate}%</div>
              <div className={styles.metricDesc}>Paid members who canceled (30 days)</div>
            </div>
          </div>

          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={analyticsData.timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="period" stroke="#999" />
                <YAxis stroke="#999" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '4px',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="leads"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Leads"
                  dot={{ fill: '#3b82f6' }}
                />
                <Line
                  type="monotone"
                  dataKey="trialers"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  name="Trialers"
                  dot={{ fill: '#f59e0b' }}
                />
                <Line
                  type="monotone"
                  dataKey="members"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Paid Members"
                  dot={{ fill: '#10b981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
        <div className={styles.actionsGrid}>
          <Link to="/members" className={styles.actionCard}>
            <span className={styles.actionIcon}>
              <MembersIcon size={32} />
            </span>
            <div className={styles.actionTitle}>Manage Members</div>
            <div className={styles.actionDesc}>View, add, edit, or delete member profiles</div>
          </Link>

          <Link to="/audiences" className={styles.actionCard}>
            <span className={styles.actionIcon}>
              <AudiencesIcon size={32} />
            </span>
            <div className={styles.actionTitle}>Create Audiences</div>
            <div className={styles.actionDesc}>Build targeted audiences for campaigns</div>
          </Link>

          <Link to="/engage" className={styles.actionCard}>
            <span className={styles.actionIcon}>
              <EngageIcon size={32} />
            </span>
            <div className={styles.actionTitle}>Email Campaign</div>
            <div className={styles.actionDesc}>Send targeted emails to your members</div>
          </Link>

          <Link to="/optimize" className={styles.actionCard}>
            <span className={styles.actionIcon}>
              <OptimizeIcon size={32} />
            </span>
            <div className={styles.actionTitle}>Website Personalization</div>
            <div className={styles.actionDesc}>Create A/B tests and personalized experiences</div>
          </Link>

          <Link to="/social" className={styles.actionCard}>
            <span className={styles.actionIcon}>
              <SocialIcon size={32} />
            </span>
            <div className={styles.actionTitle}>Create Social Post</div>
            <div className={styles.actionDesc}>Schedule posts across social media platforms</div>
          </Link>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Dashboard;
