import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation as useRouterLocation } from 'react-router-dom';
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
} from './Icons';
import styles from './Layout.module.css';

const Layout = () => {
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const routerLocation = useRouterLocation();
  const { locations, selectedLocation, isAllLocations, setSelectedLocation, setAllLocations, loadLocations } = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showLocationMenu, setShowLocationMenu] = useState(false);

  // Load locations when Layout mounts (user is authenticated at this point)
  useEffect(() => {
    if (locations.length === 0) {
      loadLocations();
    }
  }, []);

  const navItems = [
    { path: '/', label: 'Dashboard', Icon: DashboardIcon },
    { path: '/members', label: 'Contacts', Icon: MembersIcon },
    { path: '/audiences', label: 'Audiences', Icon: AudiencesIcon },
    { path: '/events', label: 'Events & Calendar', Icon: CalendarIcon },
    { path: '/attendance', label: 'Attendance', Icon: CheckIcon },
    { path: '/optimize', label: 'DragonDesk: Optimize', Icon: OptimizeIcon },
    { path: '/engage', label: 'DragonDesk: Engage', Icon: EngageIcon },
    { path: '/outreach', label: 'DragonDesk: Outreach', Icon: OutreachIcon },
    { path: '/social', label: 'DragonDesk: Social', Icon: SocialIcon },
    { path: '/analytics', label: 'DragonDesk: Analytics', Icon: AnalyticsIcon },
  ];

  const superAdminNavItems = user?.role === 'super_admin'
    ? [{ path: '/workforce', label: 'Workforce Management', Icon: WorkforceIcon }]
    : [];

  const adminNavItems = user?.role === 'admin' || user?.role === 'super_admin'
    ? [
        { path: '/billing', label: 'Billing', Icon: BillingIcon },
        { path: '/settings', label: 'Settings', Icon: SettingsIcon }
      ]
    : [];

  const allNavItems = [...navItems, ...superAdminNavItems, ...adminNavItems];

  return (
    <div className={styles.layout}>
      <aside className={`${styles.sidebar} ${isSidebarOpen ? styles.open : styles.closed}`}>
        <div className={styles.sidebarHeader}>
          {isSidebarOpen && (
            <h1 className={styles.logo}>
              {branding.logo ? (
                <img src={branding.logo} alt={branding.gymName} className={styles.logoImage} />
              ) : (
                <>
                  <DojoIcon size={24} /> {branding.gymName}
                </>
              )}
            </h1>
          )}
          {!isSidebarOpen && (
            <div className={styles.logoIcon}>
              {branding.logo ? (
                <img src={branding.logo} alt={branding.gymName} className={styles.logoImageSmall} />
              ) : (
                <DojoIcon size={28} />
              )}
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
            </Link>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          {isSidebarOpen && (
            <div className={styles.userInfo}>
              <div className={styles.userName}>
                {user?.firstName} {user?.lastName}
              </div>
              <div className={styles.userRole}>{user?.role}</div>
            </div>
          )}
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
    </div>
  );
};

export default Layout;
