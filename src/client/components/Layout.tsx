import React, { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation as useRouterLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';
import { useLocation } from '../contexts/LocationContext';
import {
  DashboardIcon,
  MembersIcon,
  AudiencesIcon,
  CalendarIcon,
  OptimizeIcon,
  EngageIcon,
  OutreachIcon,
  SocialIcon,
  AnalyticsIcon,
  LogoutIcon,
  DojoIcon,
  MenuIcon,
  CloseIcon,
  SettingsIcon,
  WorkforceIcon,
  BillingIcon,
  CheckIcon,
  SalesSignalsIcon,
  BellIcon,
} from './Icons';
import styles from './Layout.module.css';
import AIAssistant from './AIAssistant';
import { useToast } from './Toast';
import defaultLogo from '../assets/dragondesk-logo.png';

const Layout = () => {
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const routerLocation = useRouterLocation();
  const { locations, selectedLocation, isAllLocations, setSelectedLocation, setAllLocations, loadLocations } = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const [signalCount, setSignalCount] = useState(0);
  const [alerts, setAlerts] = useState<{ type: string; message: string; severity: string }[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('dd_dismissed_alerts') || '{}'); } catch { return {}; }
  });

  const dismissAlert = (type: string) => {
    const updated = { ...dismissedAlerts, [type]: Date.now() };
    setDismissedAlerts(updated);
    localStorage.setItem('dd_dismissed_alerts', JSON.stringify(updated));
  };

  // In-app notifications (new leads). Shared across users; unread is per user.
  const { toast } = useToast();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<{ id: number; title: string; body: string | null; link: string | null; createdAt: string; unread: boolean }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const newestSeenId = useRef<number | null>(null);

  const visibleAlerts = alerts.filter(a => {
    const dismissedAt = dismissedAlerts[a.type];
    if (!dismissedAt) return true;
    return Date.now() - dismissedAt > 24 * 60 * 60 * 1000;
  });

  // Load locations when Layout mounts (user is authenticated at this point)
  useEffect(() => {
    if (locations.length === 0) {
      loadLocations();
    }
  }, []);

  // Poll signal count for sidebar badge
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/sales-signals/count', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setSignalCount(data.count || 0);
        }
      } catch {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, []);

  // Poll system alerts every 5 minutes
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/alerts', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setAlerts(data.alerts || []);
        }
      } catch {}
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Poll notifications every minute; toast anything that arrived since the last poll.
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/notifications', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        const list = data.notifications || [];
        if (newestSeenId.current !== null) {
          list.filter((n: any) => n.id > newestSeenId.current! && n.unread).slice(0, 3).forEach((n: any) => toast(n.title, 'info'));
        }
        if (list.length) newestSeenId.current = Math.max(newestSeenId.current ?? 0, ...list.map((n: any) => n.id));
        else if (newestSeenId.current === null) newestSeenId.current = 0;
        setNotifications(list);
        setUnreadCount(data.unread || 0);
      } catch {}
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleAlerts = () => {
    const opening = !showAlerts;
    setShowAlerts(opening);
    if (opening && unreadCount > 0) {
      // Clear the badge now; rows stay highlighted until the next poll.
      setUnreadCount(0);
      const token = localStorage.getItem('token');
      fetch('/api/notifications/seen', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => {});
    }
  };

  const openNotification = (link: string | null) => {
    setShowAlerts(false);
    if (link) navigate(link);
  };

  const timeAgo = (iso: string) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  };

  const bellCount = visibleAlerts.length + unreadCount;

  const navItems = [
    { path: '/', label: 'Dashboard', Icon: DashboardIcon },
    { path: '/members', label: 'Contacts', Icon: MembersIcon },
    { path: '/audiences', label: 'Audiences', Icon: AudiencesIcon },
    { path: '/events', label: 'Events & Calendar', Icon: CalendarIcon },
    { path: '/attendance', label: 'Attendance', Icon: CheckIcon },
    { path: '/sales-signals', label: 'DragonDesk: Pulse', Icon: SalesSignalsIcon, badge: signalCount },
    { path: '/optimize', label: 'DragonDesk: Optimize', Icon: OptimizeIcon },
    { path: '/engage', label: 'DragonDesk: Engage', Icon: EngageIcon },
    { path: '/outreach', label: 'DragonDesk: Outreach', Icon: OutreachIcon },
    { path: '/social', label: 'DragonDesk: Social', Icon: SocialIcon },
    { path: '/analytics', label: 'DragonDesk: Analytics', Icon: AnalyticsIcon },
  ];

  const adminNavItems = user?.role === 'admin' || user?.role === 'super_admin'
    ? [
        { path: '/workforce', label: 'Workforce Management', Icon: WorkforceIcon },
        { path: '/billing', label: 'Billing', Icon: BillingIcon },
        { path: '/settings', label: 'Settings', Icon: SettingsIcon }
      ]
    : [];

  const allNavItems = [...navItems, ...adminNavItems];

  return (
    <div className={styles.layout}>
      <aside className={`${styles.sidebar} ${isSidebarOpen ? styles.open : styles.closed}`}>
        <div className={styles.sidebarHeader}>
          {isSidebarOpen && (
            <h1 className={styles.logo}>
              <img src={branding.logo || defaultLogo} alt={branding.gymName} className={styles.logoImage} />
              {!branding.logo && (
                <span className={styles.logoText}>
                  Dragon<span className={styles.logoTextAccent}>Desk</span>
                  <sup className={styles.logoTm}>™</sup>
                </span>
              )}
            </h1>
          )}
          {!isSidebarOpen && (
            <div className={styles.logoIcon}>
              <img src={branding.logo || defaultLogo} alt={branding.gymName} className={styles.logoImageSmall} />
            </div>
          )}
          <button
            className={styles.toggleBtn}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isSidebarOpen ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>
        <nav className={styles.nav}>
          {allNavItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`${styles.navItem} ${
                routerLocation.pathname === item.path ? styles.active : ''
              }`}
            >
              <span className={styles.navIcon}>
                <item.Icon size={20} />
              </span>
              {isSidebarOpen && <span>{item.label}</span>}
              {isSidebarOpen && (item as any).badge > 0 && (
                <span className={styles.navBadge}>{(item as any).badge}</span>
              )}
              {!isSidebarOpen && (item as any).badge > 0 && (
                <span className={styles.navBadgeDot} />
              )}
            </Link>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.footerUserRow}>
            {isSidebarOpen && (
              <div className={styles.userInfo}>
                <div className={styles.userName}>
                  {user?.firstName} {user?.lastName}
                </div>
                <div className={styles.userRole}>{user?.role}</div>
              </div>
            )}
            <div className={styles.bellWrapper}>
              <button
                className={`${styles.bellBtn} ${bellCount > 0 ? styles.bellActive : ''}`}
                onClick={toggleAlerts}
                aria-label="Notifications"
              >
                <BellIcon size={20} />
                {bellCount > 0 && isSidebarOpen && (
                  <span className={styles.bellBadge}>{bellCount}</span>
                )}
                {bellCount > 0 && !isSidebarOpen && (
                  <span className={styles.bellDot} />
                )}
              </button>
              {showAlerts && (
                <div className={styles.alertDropdown}>
                  <div className={styles.alertDropdownTitle}>New Leads</div>
                  {notifications.length === 0 ? (
                    <div className={styles.alertEmpty}>No new leads yet</div>
                  ) : (
                    <div className={styles.notificationList}>
                      {notifications.slice(0, 8).map(n => (
                        <button
                          key={n.id}
                          className={`${styles.notificationItem} ${n.unread ? styles.notificationUnread : ''}`}
                          onClick={() => openNotification(n.link)}
                        >
                          <span className={styles.notificationTitle}>{n.title}</span>
                          <span className={styles.notificationMeta}>
                            {n.body ? `${n.body} - ` : ''}{timeAgo(n.createdAt)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={styles.alertDropdownTitle}>System Alerts</div>
                  {visibleAlerts.length === 0 ? (
                    <div className={styles.alertEmpty}>No active alerts</div>
                  ) : (
                    visibleAlerts.map((alert, i) => (
                      <div key={i} className={`${styles.alertItem} ${styles[`alertSev_${alert.severity}`]}`}>
                        <span className={styles.alertItemDot} />
                        <span className={styles.alertItemMsg}>{alert.message}</span>
                        <button
                          className={styles.alertDismissBtn}
                          onClick={() => dismissAlert(alert.type)}
                          aria-label="Dismiss alert"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          <button onClick={logout} className={styles.logoutBtn}>
            <LogoutIcon size={20} />
            {isSidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>
      <div className={styles.mainContainer}>
        {locations.length > 1 && (
          <div className={styles.locationBar}>
            <div className={styles.locationSelector}>
              <label className={styles.locationLabel}>Location:</label>
              <div className={styles.locationDropdown}>
                <button
                  className={styles.locationBtn}
                  onClick={() => setShowLocationMenu(!showLocationMenu)}
                >
                  {isAllLocations ? 'All Locations' : selectedLocation?.name || 'Select Location'}
                </button>
                {showLocationMenu && (
                  <div className={styles.locationMenu}>
                    <div
                      className={`${styles.locationOption} ${isAllLocations ? styles.selected : ''}`}
                      onClick={() => {
                        setAllLocations();
                        setShowLocationMenu(false);
                      }}
                    >
                      All Locations
                    </div>
                    {locations.map((location) => (
                      <div
                        key={location.id}
                        className={`${styles.locationOption} ${
                          selectedLocation?.id === location.id ? styles.selected : ''
                        }`}
                        onClick={() => {
                          setSelectedLocation(location);
                          setShowLocationMenu(false);
                        }}
                      >
                        {location.name}
                        {location.isPrimary && <span className={styles.primaryBadge}>Primary</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
      <AIAssistant />
    </div>
  );
};

export default Layout;
