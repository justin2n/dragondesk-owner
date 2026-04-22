import React, { useState, useEffect } from 'react';
import { useLocation } from '../contexts/LocationContext';
import styles from './AttendanceTracking.module.css';

interface CheckIn {
  id: number;
  memberId: number;
  locationId: number;
  checkInTime: string;
  checkInMethod: string;
  firstName: string;
  lastName: string;
  email: string;
  programType?: string;
  ranking?: string;
  locationName?: string;
  eventName?: string;
}

interface Stats {
  totalCheckIns: number;
  uniqueMembers: number;
  todayCheckIns: number;
  averagePerDay: number;
  checkInsByMethod: Record<string, number>;
  checkInsByProgram: Record<string, number>;
}

const AttendanceTracking: React.FC = () => {
  const { selectedLocation, isAllLocations, isLoading: locationLoading } = useLocation();
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalCheckIns: 0,
    uniqueMembers: 0,
    todayCheckIns: 0,
    averagePerDay: 0,
    checkInsByMethod: {},
    checkInsByProgram: {}
  });
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    // Wait for location context to finish loading before fetching data
    if (locationLoading) return;

    // Only load if we have a valid location selection
    if (isAllLocations || selectedLocation) {
      loadCheckIns();
      loadStats();
    }
  }, [selectedLocation, isAllLocations, locationLoading, dateRange, startDate, endDate]);

  const loadCheckIns = async () => {
    setLoading(true);
    try {
      const locationParam = isAllLocations ? 'all' : selectedLocation?.id;
      let url = `/api/check-ins?locationId=${locationParam}`;

      if (dateRange === 'today') {
        url = `/api/check-ins/today?locationId=${locationParam}`;
      } else {
        const dates = getDateRange();
        if (dates.start) url += `&startDate=${dates.start}`;
        if (dates.end) url += `&endDate=${dates.end}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        console.error('Check-ins API error:', response.status);
        return;
      }

      const data = await response.json();
      if (Array.isArray(data)) {
        setCheckIns(data);
      }
    } catch (error) {
      console.error('Error loading check-ins:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const locationParam = isAllLocations ? 'all' : selectedLocation?.id;
      const dates = getDateRange();
      let url = `/api/check-ins/stats?locationId=${locationParam}`;
      if (dates.start) url += `&startDate=${dates.start}`;
      if (dates.end) url += `&endDate=${dates.end}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        console.error('Stats API error:', response.status);
        return;
      }

      const data = await response.json();
      if (data && typeof data === 'object') {
        setStats({
          totalCheckIns: data.totalCheckIns ?? 0,
          uniqueMembers: data.uniqueMembers ?? 0,
          todayCheckIns: data.todayCheckIns ?? 0,
          averagePerDay: data.averagePerDay ?? 0,
          checkInsByMethod: data.checkInsByMethod ?? {},
          checkInsByProgram: data.checkInsByProgram ?? {}
        });
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const getDateRange = () => {
    const today = new Date();
    let start = '';
    let end = today.toISOString().split('T')[0];

    switch (dateRange) {
      case 'today':
        start = end;
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        start = weekAgo.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        start = monthAgo.toISOString().split('T')[0];
        break;
      case 'custom':
        start = startDate;
        end = endDate;
        break;
    }

    return { start, end };
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'qr_scan': return 'QR Scan';
      case 'manual': return 'Manual';
      case 'name_search': return 'Name Search';
      case 'phone_lookup': return 'Phone Lookup';
      default: return method;
    }
  };

  const handleDeleteCheckIn = async (id: number) => {
    if (!confirm('Are you sure you want to delete this check-in?')) return;

    try {
      const response = await fetch(`/api/check-ins/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        setCheckIns(checkIns.filter(c => c.id !== id));
        loadStats();
      }
    } catch (error) {
      console.error('Error deleting check-in:', error);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Attendance Tracking</h1>
        <a href="/kiosk" target="_blank" rel="noopener noreferrer" className={styles.kioskLink}>
          Open Kiosk Mode
        </a>
      </div>

      {/* Stats Cards */}
      {!loading && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.todayCheckIns}</div>
            <div className={styles.statLabel}>Today's Check-ins</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.totalCheckIns}</div>
            <div className={styles.statLabel}>Total Check-ins</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.uniqueMembers}</div>
            <div className={styles.statLabel}>Unique Members</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{(parseFloat(String(stats.averagePerDay)) || 0).toFixed(1)}</div>
            <div className={styles.statLabel}>Avg per Day (30d)</div>
          </div>
        </div>
      )}

      {/* Method & Program Breakdown */}
      {!loading && (
        <div className={styles.breakdownGrid}>
          <div className={styles.breakdownCard}>
            <h3 className={styles.breakdownTitle}>By Check-in Method</h3>
            <div className={styles.breakdownList}>
              {Object.entries(stats.checkInsByMethod || {}).map(([method, count]) => (
                <div key={method} className={styles.breakdownItem}>
                  <span className={styles.breakdownLabel}>{getMethodLabel(method)}</span>
                  <span className={styles.breakdownValue}>{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.breakdownCard}>
            <h3 className={styles.breakdownTitle}>By Program</h3>
            <div className={styles.breakdownList}>
              {Object.entries(stats.checkInsByProgram || {}).map(([program, count]) => (
                <div key={program} className={styles.breakdownItem}>
                  <span className={`${styles.breakdownLabel} ${styles.programLabel}`}>
                    <span className={`${styles.programDot} ${styles[program?.toLowerCase().replace(/\s+/g, '') || 'general']}`} />
                    {program || 'General'}
                  </span>
                  <span className={styles.breakdownValue}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.dateFilters}>
          <button
            className={`${styles.filterBtn} ${dateRange === 'today' ? styles.active : ''}`}
            onClick={() => setDateRange('today')}
          >
            Today
          </button>
          <button
            className={`${styles.filterBtn} ${dateRange === 'week' ? styles.active : ''}`}
            onClick={() => setDateRange('week')}
          >
            This Week
          </button>
          <button
            className={`${styles.filterBtn} ${dateRange === 'month' ? styles.active : ''}`}
            onClick={() => setDateRange('month')}
          >
            This Month
          </button>
          <button
            className={`${styles.filterBtn} ${dateRange === 'custom' ? styles.active : ''}`}
            onClick={() => setDateRange('custom')}
          >
            Custom
          </button>
        </div>

        {dateRange === 'custom' && (
          <div className={styles.customDateRange}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={styles.dateInput}
            />
            <span>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={styles.dateInput}
            />
          </div>
        )}
      </div>

      {/* Check-ins Table */}
      <div className={styles.tableContainer}>
        {loading ? (
          <div className={styles.loading}>Loading check-ins...</div>
        ) : checkIns.length === 0 ? (
          <div className={styles.empty}>No check-ins found for the selected period</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Member</th>
                <th>Program</th>
                <th>Rank</th>
                <th>Method</th>
                {isAllLocations && <th>Location</th>}
                <th>Class</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {checkIns.map(checkIn => (
                <tr key={checkIn.id}>
                  <td>
                    <div className={styles.timeCell}>
                      <span className={styles.time}>{formatTime(checkIn.checkInTime)}</span>
                      {dateRange !== 'today' && (
                        <span className={styles.date}>{formatDate(checkIn.checkInTime)}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className={styles.memberCell}>
                      <span className={styles.memberName}>{checkIn.firstName} {checkIn.lastName}</span>
                      <span className={styles.memberEmail}>{checkIn.email}</span>
                    </div>
                  </td>
                  <td>
                    {checkIn.programType && (
                      <span className={`${styles.programBadge} ${styles[checkIn.programType?.toLowerCase().replace(/\s+/g, '') || 'general']}`}>
                        {checkIn.programType}
                      </span>
                    )}
                  </td>
                  <td>
                    {checkIn.ranking && (
                      <span className={styles.ranking}>{checkIn.ranking}</span>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.methodBadge} ${styles[checkIn.checkInMethod]}`}>
                      {getMethodLabel(checkIn.checkInMethod)}
                    </span>
                  </td>
                  {isAllLocations && <td>{checkIn.locationName}</td>}
                  <td>{checkIn.eventName || '-'}</td>
                  <td>
                    <button
                      onClick={() => handleDeleteCheckIn(checkIn.id)}
                      className={styles.deleteBtn}
                      title="Delete check-in"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AttendanceTracking;
