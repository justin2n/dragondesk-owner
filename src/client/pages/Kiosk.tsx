import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import styles from './Kiosk.module.css';

interface Location {
  id: number;
  name: string;
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

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  programType?: string;
  ranking?: string;
}

type ViewMode = 'loading' | 'search' | 'select-class' | 'success' | 'already-checked-in' | 'error' | 'select-location';

const Kiosk: React.FC = () => {
  const { locationId: paramLocationId } = useParams<{ locationId?: string }>();
  const [viewMode, setViewMode] = useState<ViewMode>('loading');
  const [location, setLocation] = useState<Location | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(
    paramLocationId ? parseInt(paramLocationId) : null
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberClasses, setMemberClasses] = useState<ClassEvent[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);

  const [checkedInMember, setCheckedInMember] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ todayCheckIns: 0 });

  useEffect(() => {
    if (locationId) {
      setViewMode('search');
    } else {
      loadLocations();
    }
  }, []);

  useEffect(() => {
    if (locationId) {
      loadLocation();
      loadStats();
    }
  }, [locationId]);

  useEffect(() => {
    if (viewMode === 'success' || viewMode === 'already-checked-in') {
      const timer = setTimeout(resetToSearch, 5000);
      return () => clearTimeout(timer);
    }
  }, [viewMode]);

  const loadLocations = async () => {
    try {
      const res = await fetch('/api/kiosk/locations');
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.length === 1) {
        setLocations(data);
        setLocationId(data[0].id);
        setViewMode('search');
      } else if (data.length > 1) {
        setLocations(data);
        setViewMode('select-location');
      } else {
        setError('No locations are configured. Please set up a location in the admin panel.');
        setViewMode('error');
      }
    } catch {
      setError('Unable to connect to the server. Please try again.');
      setViewMode('error');
    }
  };

  const loadLocation = async () => {
    try {
      const res = await fetch(`/api/kiosk/location/${locationId}`);
      if (res.ok) setLocation(await res.json());
    } catch {}
  };

  const loadStats = async () => {
    try {
      const res = await fetch(`/api/kiosk/stats/${locationId}`);
      if (res.ok) setStats(await res.json());
    } catch {}
  };

  const resetToSearch = () => {
    setViewMode('search');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedMember(null);
    setMemberClasses([]);
    setCheckedInMember(null);
    setError(null);
    loadStats();
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `/api/kiosk/member/lookup?search=${encodeURIComponent(searchQuery)}&locationId=${locationId}`
      );
      setSearchResults(await res.json());
    } catch {}
    finally { setSearching(false); }
  };

  const handleSelectMember = async (member: Member) => {
    setSelectedMember(member);
    setMemberClasses([]);
    setLoadingClasses(true);
    setViewMode('select-class');
    try {
      const res = await fetch(`/api/kiosk/classes/member/${member.id}`);
      if (res.ok) setMemberClasses(await res.json());
    } catch {}
    finally { setLoadingClasses(false); }
  };

  const handleClassCheckIn = async (classId: number) => {
    if (!selectedMember) return;
    try {
      const res = await fetch('/api/kiosk/check-in/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: selectedMember.id,
          locationId,
          eventId: classId,
          method: 'name_search',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCheckedInMember(data.member);
        setViewMode(data.alreadyCheckedIn ? 'already-checked-in' : 'success');
      } else {
        setError(data.error || 'Check-in failed');
        setViewMode('error');
      }
    } catch {
      setError('Unable to process check-in. Please try again.');
      setViewMode('error');
    }
  };

  const formatTime = (dt: string) =>
    new Date(dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (viewMode === 'loading') {
    return (
      <div className={styles.kioskContainer}>
        <div className={styles.loadingView}><div className={styles.loadingSpinner} /></div>
      </div>
    );
  }

  if (viewMode === 'error' && !locationId) {
    return (
      <div className={styles.kioskContainer}>
        <div className={styles.loadingView}>
          <div className={styles.errorView}>
            <div className={styles.errorIcon}>
              <svg viewBox="0 0 24 24" width="80" height="80" fill="#ef4444">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
            </div>
            <h2 className={styles.errorTitle}>Connection Error</h2>
            <p className={styles.errorMessage}>{error}</p>
            <button className={styles.retryBtn} onClick={() => { setViewMode('loading'); loadLocations(); }}>
              Retry
            </button>
          </div>
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
              <button key={loc.id} className={styles.locationCard}
                onClick={() => { setLocationId(loc.id); setViewMode('search'); }}>
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
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>{location?.name || 'Welcome'}</h1>
        <div className={styles.stats}>
          <span className={styles.statItem}>
            <strong>{stats.todayCheckIns}</strong> check-ins today
          </span>
        </div>
      </header>

      <div className={styles.flowContainer}>

        {/* Step 1: Search */}
        {viewMode === 'search' && (
          <div className={styles.searchView}>
            <h2 className={styles.sectionTitle}>Check In</h2>
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
              <button onClick={handleSearch} disabled={searching} className={styles.searchSubmitBtn}>
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className={styles.searchResults}>
                {searchResults.map(member => (
                  <button key={member.id} className={styles.memberCard}
                    onClick={() => handleSelectMember(member)}>
                    <div className={styles.memberName}>{member.firstName} {member.lastName}</div>
                    <div className={styles.memberDetails}>
                      {member.programType && <span>{member.programType}</span>}
                      {member.ranking && <span className={styles.ranking}>{member.ranking}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchQuery.trim() && searchResults.length === 0 && !searching && (
              <p className={styles.noResults}>No members found. Try a different name or phone number.</p>
            )}
          </div>
        )}

        {/* Step 2: Select class */}
        {viewMode === 'select-class' && selectedMember && (
          <div className={styles.selectClassView}>
            <div className={styles.memberHeader}>
              <h2 className={styles.memberWelcome}>
                Hi, {selectedMember.firstName} {selectedMember.lastName}!
              </h2>
              {selectedMember.programType && (
                <span className={styles.memberProgramBadge}>{selectedMember.programType}</span>
              )}
            </div>

            <h3 className={styles.selectClassTitle}>Select your class:</h3>

            {loadingClasses ? (
              <div className={styles.loadingSpinner} style={{ margin: '32px auto' }} />
            ) : memberClasses.length > 0 ? (
              <div className={styles.memberClassesList}>
                {memberClasses.map(cls => (
                  <button key={cls.id} className={styles.classCheckInBtn}
                    onClick={() => handleClassCheckIn(cls.id)}>
                    <div className={styles.classTime}>{formatTime(cls.startDateTime)}</div>
                    <div className={styles.classInfo}>
                      <span className={styles.className}>{cls.name}</span>
                      {cls.instructorFirstName && (
                        <span className={styles.instructor}>
                          with {cls.instructorFirstName} {cls.instructorLastName}
                        </span>
                      )}
                    </div>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ opacity: 0.4, flexShrink: 0 }}>
                      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
                    </svg>
                  </button>
                ))}
              </div>
            ) : (
              <p className={styles.noClasses}>No classes scheduled for your program today.</p>
            )}

            <button className={styles.backBtn} onClick={resetToSearch}>← Back to Search</button>
          </div>
        )}

        {/* Success */}
        {viewMode === 'success' && checkedInMember && (
          <div className={styles.successView}>
            <div className={styles.successIcon}>
              <svg viewBox="0 0 24 24" width="96" height="96" fill="#10b981">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <h2 className={styles.successTitle}>Welcome!</h2>
            <p className={styles.memberGreeting}>{checkedInMember.firstName} {checkedInMember.lastName}</p>
            {checkedInMember.ranking && <p className={styles.memberRank}>{checkedInMember.ranking}</p>}
            <p className={styles.checkInMessage}>You're checked in!</p>
          </div>
        )}

        {/* Already checked in */}
        {viewMode === 'already-checked-in' && checkedInMember && (
          <div className={styles.alreadyCheckedInView}>
            <div className={styles.infoIcon}>
              <svg viewBox="0 0 24 24" width="96" height="96" fill="#3b82f6">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
              </svg>
            </div>
            <h2 className={styles.infoTitle}>Welcome Back!</h2>
            <p className={styles.memberGreeting}>{checkedInMember.firstName} {checkedInMember.lastName}</p>
            <p className={styles.alreadyMessage}>You've already checked in today</p>
          </div>
        )}

        {/* Error */}
        {viewMode === 'error' && (
          <div className={styles.errorView}>
            <div className={styles.errorIcon}>
              <svg viewBox="0 0 24 24" width="80" height="80" fill="#ef4444">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
            </div>
            <h2 className={styles.errorTitle}>Oops!</h2>
            <p className={styles.errorMessage}>{error}</p>
            <button className={styles.retryBtn} onClick={resetToSearch}>Try Again</button>
          </div>
        )}

      </div>
    </div>
  );
};

export default Kiosk;
