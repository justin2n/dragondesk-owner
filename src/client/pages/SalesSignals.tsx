import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import styles from './SalesSignals.module.css';

interface HotLead {
  visitorId: string;
  token: string;
  lastSeen: string;
  email: string;
  memberId: number | null;
  memberTableId: number | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  programType: string | null;
  accountStatus: string | null;
  recentEventCount: string;
  lastActivity: string;
  recentPages: string[] | null;
}

const REFRESH_INTERVAL = 60;

const timeAgo = (dateStr: string): string => {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const SalesSignals: React.FC = () => {
  const [leads, setLeads] = useState<HotLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(10);
  const [hours, setHours] = useState(24);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const navigate = useNavigate();

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/sales-signals?threshold=${threshold}&hours=${hours}`);
      setLeads(Array.isArray(data) ? data : []);
      setLastRefresh(new Date());
      setCountdown(REFRESH_INTERVAL);
    } catch (err: any) {
      setError(err?.message || 'Failed to load signals');
    } finally {
      setLoading(false);
    }
  }, [threshold, hours]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // Auto-refresh countdown
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          loadLeads();
          return REFRESH_INTERVAL;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [loadLeads]);

  const eventCount = (lead: HotLead) => parseInt(lead.recentEventCount) || 0;

  const urgencyLabel = (count: number) => {
    if (count >= 50) return { label: 'ON FIRE', cls: styles.urgencyFire };
    if (count >= 25) return { label: 'HOT', cls: styles.urgencyHot };
    return { label: 'WARM', cls: styles.urgencyWarm };
  };

  const displayName = (lead: HotLead) =>
    lead.firstName ? `${lead.firstName} ${lead.lastName || ''}`.trim() : lead.email;

  const cleanPages = (pages: string[] | null): string[] => {
    if (!pages) return [];
    return [...new Set(pages.filter(Boolean))].slice(0, 5);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>DragonDesk: Pulse</h1>
          <p className={styles.subtitle}>
            Identified leads with high engagement — contact them now
          </p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.controls}>
            <div className={styles.controlGroup}>
              <label className={styles.controlLabel}>Min events</label>
              <select
                className={styles.select}
                value={threshold}
                onChange={e => setThreshold(parseInt(e.target.value))}
              >
                <option value={5}>5+</option>
                <option value={10}>10+</option>
                <option value={20}>20+</option>
                <option value={50}>50+</option>
              </select>
            </div>
            <div className={styles.controlGroup}>
              <label className={styles.controlLabel}>Time window</label>
              <select
                className={styles.select}
                value={hours}
                onChange={e => setHours(parseInt(e.target.value))}
              >
                <option value={1}>Last 1 hour</option>
                <option value={6}>Last 6 hours</option>
                <option value={24}>Last 24 hours</option>
                <option value={48}>Last 48 hours</option>
              </select>
            </div>
          </div>
          <button className={styles.refreshBtn} onClick={loadLeads} disabled={loading}>
            {loading ? 'Loading…' : `Refresh (${countdown}s)`}
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className={styles.summaryBar}>
        <div className={styles.summaryItem}>
          <span className={`${styles.summaryCount} ${leads.length > 0 ? styles.hot : ''}`}>
            {leads.length}
          </span>
          <span className={styles.summaryLabel}>Hot leads right now</span>
        </div>
        {lastRefresh && (
          <span className={styles.lastRefresh}>
            Last updated {timeAgo(lastRefresh.toISOString())}
          </span>
        )}
      </div>

      {error && (
        <div className={styles.errorBanner}>
          {error}
        </div>
      )}

      {!loading && leads.length === 0 && !error && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>✓</div>
          <h2 className={styles.emptyTitle}>All clear</h2>
          <p className={styles.emptyText}>
            No identified leads have crossed {threshold}+ events in the last {hours}h.
            Check back soon or lower the threshold.
          </p>
        </div>
      )}

      {leads.length > 0 && (
        <div className={styles.leadGrid}>
          {leads.map(lead => {
            const count = eventCount(lead);
            const urgency = urgencyLabel(count);
            const pages = cleanPages(lead.recentPages);
            const isMember = !!lead.memberTableId;

            return (
              <div
                key={`${lead.visitorId}-${lead.token}`}
                className={`${styles.leadCard} ${urgency.cls} ${isMember ? styles.clickable : ''}`}
                onClick={() => isMember && navigate(`/members?member=${lead.memberTableId}&tab=history`)}
              >
                <div className={styles.cardHeader}>
                  <div className={styles.leadInfo}>
                    <span className={styles.leadName}>{displayName(lead)}</span>
                    {lead.firstName && (
                      <span className={styles.leadEmail}>{lead.email}</span>
                    )}
                  </div>
                  <div className={styles.badges}>
                    <span className={`${styles.urgencyBadge} ${urgency.cls}`}>
                      {urgency.label}
                    </span>
                    {isMember && (
                      <span className={styles.memberBadge}>Member</span>
                    )}
                    {lead.programType && (
                      <span className={styles.programBadge}>{lead.programType}</span>
                    )}
                  </div>
                </div>

                <div className={styles.statsRow}>
                  <div className={styles.stat}>
                    <span className={styles.statValue}>{count}</span>
                    <span className={styles.statLabel}>events</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statValue}>{timeAgo(lead.lastActivity)}</span>
                    <span className={styles.statLabel}>last active</span>
                  </div>
                  {lead.phone && (
                    <div className={styles.stat}>
                      <span className={styles.statValue}>{lead.phone}</span>
                      <span className={styles.statLabel}>phone</span>
                    </div>
                  )}
                </div>

                {pages.length > 0 && (
                  <div className={styles.pagesSection}>
                    <span className={styles.pagesLabel}>Pages visited:</span>
                    <div className={styles.pagesList}>
                      {pages.map(p => (
                        <span key={p} className={styles.pagePill}>{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className={styles.actions} onClick={e => e.stopPropagation()}>
                  {lead.phone && (
                    <a
                      href={`tel:${lead.phone}`}
                      className={`${styles.actionBtn} ${styles.callBtn}`}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                      </svg>
                      Call
                    </a>
                  )}
                  <a
                    href={`mailto:${lead.email}`}
                    className={`${styles.actionBtn} ${styles.emailBtn}`}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                    </svg>
                    Email
                  </a>
                  {isMember && (
                    <a
                      href={`/members?member=${lead.memberTableId}`}
                      onClick={(e) => { e.preventDefault(); navigate(`/members?member=${lead.memberTableId}`); }}
                      className={`${styles.actionBtn} ${styles.profileBtn}`}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                      View Profile
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SalesSignals;
