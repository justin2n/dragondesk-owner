import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import styles from './Kiosk.module.css';

interface Location {
  id: number;
  name: string;
  address?: string;
  city?: string;
  state?: string;
}

interface ClassEvent {
  id: number;
  name: string;
  startDateTime: string;
  endDateTime: string;
  programType: string;
  instructorFirstName?: string;
  instructorLastName?: string;
}

interface CheckedInMember {
  id: number;
  firstName: string;
  lastName: string;
  programType?: string;
  ranking?: string;
}

interface SearchResult {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  programType?: string;
  ranking?: string;
}

type ViewMode = 'loading' | 'scan' | 'search' | 'success' | 'already-checked-in' | 'error' | 'select-location';

const Kiosk: React.FC = () => {
  const { locationId: paramLocationId } = useParams<{ locationId?: string }>();
  const [viewMode, setViewMode] = useState<ViewMode>('loading');
  const [location, setLocation] = useState<Location | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [todaysClasses, setTodaysClasses] = useState<ClassEvent[]>([]);
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [checkedInMember, setCheckedInMember] = useState<CheckedInMember | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ todayCheckIns: 0, uniqueMembers: 0 });
  const [locationId, setLocationId] = useState<number | null>(paramLocationId ? parseInt(paramLocationId) : null);

  // Load locations if no locationId in URL
  useEffect(() => {
    if (locationId) {
      setViewMode('scan');
    } else {
      loadLocations();
    }
  }, []);

  // Load location details and today's classes
  useEffect(() => {
    if (locationId) {
      loadLocation();
      loadTodaysClasses();
      loadStats();
    }
  }, [locationId]);

  // Auto-return to scan mode after success
  useEffect(() => {
    if (viewMode === 'success' || viewMode === 'already-checked-in') {
      const timer = setTimeout(() => {
        resetToScan();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [viewMode]);

  const loadLocations = async () => {
    try {
      const response = await fetch('/api/kiosk/locations');
      const data = await response.json();
      setLocations(data);
      if (data.length === 1) {
        setLocationId(data[0].id);
        setViewMode('scan');
      } else {
        setViewMode('select-location');
      }
    } catch (error) {
      console.error('Error loading locations:', error);
    }
  };

  const loadLocation = async () => {
    try {
      const response = await fetch(`/api/kiosk/location/${locationId}`);
      if (response.ok) {
        const data = await response.json();
        setLocation(data);
      }
    } catch (error) {
      console.error('Error loading location:', error);
    }
  };

  const loadTodaysClasses = async () => {
    try {
      const response = await fetch(`/api/kiosk/classes/today/${locationId}`);
      const data = await response.json();
      setTodaysClasses(data);
    } catch (error) {
      console.error('Error loading classes:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch(`/api/kiosk/stats/${locationId}`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const resetToScan = () => {
    setViewMode('scan');
    setCheckedInMember(null);
    setSearchQuery('');
    setSearchResults([]);
    setError(null);
    loadStats();
  };

  const handleQRScan = useCallback(async (code: string) => {
    try {
      const response = await fetch('/api/kiosk/check-in/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCode: code,
          locationId,
          eventId: selectedClass
        })
      });

      const data = await response.json();

      if (response.ok) {
        setCheckedInMember(data.member);
        if (data.alreadyCheckedIn) {
          setViewMode('already-checked-in');
        } else {
          setViewMode('success');
        }
      } else {
        setError(data.error || 'Check-in failed');
        setViewMode('error');
      }
    } catch (error) {
      console.error('Check-in error:', error);
      setError('Unable to process check-in. Please try again.');
      setViewMode('error');
    }
  }, [locationId, selectedClass]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const response = await fetch(
        `/api/kiosk/member/lookup?search=${encodeURIComponent(searchQuery)}&locationId=${locationId}`
      );
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchCheckIn = async (memberId: number) => {
    try {
      const response = await fetch('/api/kiosk/check-in/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          locationId,
          eventId: selectedClass,
          method: 'name_search'
        })
      });

      const data = await response.json();

      if (response.ok) {
        setCheckedInMember(data.member);
        if (data.alreadyCheckedIn) {
          setViewMode('already-checked-in');
        } else {
          setViewMode('success');
        }
      } else {
        setError(data.error || 'Check-in failed');
        setViewMode('error');
      }
    } catch (error) {
      console.error('Check-in error:', error);
      setError('Unable to process check-in. Please try again.');
      setViewMode('error');
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const selectLocation = (id: number) => {
    setLocationId(id);
    setViewMode('scan');
  };

  if (viewMode === 'loading') {
    return (
      <div className={styles.kioskContainer}>
        <div className={styles.loadingView}>
          <div className={styles.loadingSpinner} />
        </div>
      </div>
    );
  }

  if (viewMode === 'select-location') {
    return (
      <div className={styles.kioskContainer}>
        <div className={styles.selectLocationView}>
          <h1 className={styles.title}>Select Your Location</h1>
          <div className={styles.locationGrid}>
            {locations.map(loc => (
              <button
                key={loc.id}
                className={styles.locationCard}
                onClick={() => selectLocation(loc.id)}
              >
                <span className={styles.locationName}>{loc.name}</span>
                {loc.city && loc.state && (
                  <span className={styles.locationAddress}>{loc.city}, {loc.state}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.kioskContainer}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.locationName}>{location?.name || 'Welcome'}</h1>
        <div className={styles.stats}>
          <span className={styles.statItem}>
            <strong>{stats.todayCheckIns}</strong> check-ins today
          </span>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Left side - Class Schedule */}
        <div className={styles.classesPanel}>
          <h2 className={styles.sectionTitle}>Today's Classes</h2>
          {todaysClasses.length === 0 ? (
            <p className={styles.noClasses}>No classes scheduled today</p>
          ) : (
            <div className={styles.classesList}>
              {todaysClasses.map(cls => (
                <button
                  key={cls.id}
                  className={`${styles.classCard} ${selectedClass === cls.id ? styles.selected : ''}`}
                  onClick={() => setSelectedClass(selectedClass === cls.id ? null : cls.id)}
                >
                  <div className={styles.classTime}>{formatTime(cls.startDateTime)}</div>
                  <div className={styles.classInfo}>
                    <span className={styles.className}>{cls.name}</span>
                    {cls.instructorFirstName && (
                      <span className={styles.instructor}>
                        with {cls.instructorFirstName} {cls.instructorLastName}
                      </span>
                    )}
                  </div>
                  <div className={`${styles.programBadge} ${styles[cls.programType?.toLowerCase().replace(/\s+/g, '') || 'general']}`}>
                    {cls.programType || 'General'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right side - Check-in Area */}
        <div className={styles.checkInPanel}>
          {viewMode === 'scan' && (
            <div className={styles.scanView}>
              <h2 className={styles.sectionTitle}>Check In</h2>
              <button
                className={styles.primaryBtn}
                onClick={() => setViewMode('search')}
              >
                Find Your Name to Check In
              </button>
            </div>
          )}

          {viewMode === 'search' && (
            <div className={styles.searchView}>
              <h2 className={styles.sectionTitle}>Find Your Name</h2>
              <div className={styles.searchBox}>
                <input
                  type="text"
                  placeholder="Enter your name or phone number"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className={styles.searchInput}
                  autoFocus
                />
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className={styles.searchSubmitBtn}
                >
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className={styles.searchResults}>
                  {searchResults.map(member => (
                    <button
                      key={member.id}
                      className={styles.memberCard}
                      onClick={() => handleSearchCheckIn(member.id)}
                    >
                      <div className={styles.memberName}>
                        {member.firstName} {member.lastName}
                      </div>
                      <div className={styles.memberDetails}>
                        {member.programType && <span>{member.programType}</span>}
                        {member.ranking && <span className={styles.ranking}>{member.ranking}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button
                className={styles.backBtn}
                onClick={resetToScan}
              >
                ← Back
              </button>
            </div>
          )}

          {viewMode === 'success' && checkedInMember && (
            <div className={styles.successView}>
              <div className={styles.successIcon}>
                <svg viewBox="0 0 24 24" width="80" height="80" fill="#10b981">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <h2 className={styles.successTitle}>Welcome!</h2>
              <p className={styles.memberGreeting}>
                {checkedInMember.firstName} {checkedInMember.lastName}
              </p>
              {checkedInMember.ranking && (
                <p className={styles.memberRank}>{checkedInMember.ranking}</p>
              )}
              <p className={styles.checkInMessage}>You're checked in!</p>
            </div>
          )}

          {viewMode === 'already-checked-in' && checkedInMember && (
            <div className={styles.alreadyCheckedInView}>
              <div className={styles.infoIcon}>
                <svg viewBox="0 0 24 24" width="80" height="80" fill="#3b82f6">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                </svg>
              </div>
              <h2 className={styles.infoTitle}>Welcome Back!</h2>
              <p className={styles.memberGreeting}>
                {checkedInMember.firstName} {checkedInMember.lastName}
              </p>
              <p className={styles.alreadyMessage}>You've already checked in today</p>
            </div>
          )}

          {viewMode === 'error' && (
            <div className={styles.errorView}>
              <div className={styles.errorIcon}>
                <svg viewBox="0 0 24 24" width="80" height="80" fill="#ef4444">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
              </div>
              <h2 className={styles.errorTitle}>Oops!</h2>
              <p className={styles.errorMessage}>{error}</p>
              <button
                className={styles.retryBtn}
                onClick={resetToScan}
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Kiosk;
