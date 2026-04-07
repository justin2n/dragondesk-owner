import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import {
  AddIcon,
  CalendarIcon,
  LocationIcon,
  UsersIcon,
  DollarIcon,
  CheckIcon,
  CloseIcon,
  OptimizeIcon,
  EngageIcon,
  OutreachIcon,
  SocialIcon,
} from '../components/Icons';
import styles from './Events.module.css';

interface Event {
  id: number;
  name: string;
  description: string;
  eventType: string;
  programType: string;
  startDateTime: string;
  endDateTime: string;
  location: string;
  locationId: number | null;
  maxAttendees: number;
  currentAttendees: number;
  price: number;
  requiresRegistration: boolean;
  isRecurring: boolean;
  recurrencePattern: string | null;
  instructor: string;
  instructorId: number | null;
  status: string;
  attendees?: any[];
}

interface Audience {
  id: number;
  name: string;
}

interface Location {
  id: number;
  name: string;
  address?: string;
  isActive: boolean;
}

interface Instructor {
  id: number;
  firstName: string;
  lastName: string;
  isInstructor: boolean;
}

const Events = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterType, setFilterType] = useState<string>('all');
  const [filterProgram, setFilterProgram] = useState<string>('all');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    eventType: 'class',
    programType: 'All',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    locationId: '',
    maxAttendees: '',
    price: '',
    requiresRegistration: false,
    isRecurring: false,
    recurrencePattern: '',
    recurrenceEndDate: '',
    instructorId: '',
  });

  const [campaignData, setCampaignData] = useState({
    audienceId: '',
    platforms: [] as string[],
  });

  useEffect(() => {
    loadEvents();
    loadAudiences();
    loadLocations();
    loadInstructors();
  }, [filterType, filterProgram]);

  const loadEvents = async () => {
    try {
      const params: any = {};
      if (filterType !== 'all') params.eventType = filterType;
      if (filterProgram !== 'all') params.programType = filterProgram;

      const queryString = new URLSearchParams(params).toString();
      const data = await api.get(`/events${queryString ? `?${queryString}` : ''}`);
      setEvents(data);
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  };

  const loadAudiences = async () => {
    try {
      const data = await api.get('/audiences');
      setAudiences(data);
    } catch (error) {
      console.error('Failed to load audiences:', error);
    }
  };

  const loadLocations = async () => {
    try {
      const data = await api.get('/locations?isActive=true');
      setLocations(data);
    } catch (error) {
      console.error('Failed to load locations:', error);
    }
  };

  const loadInstructors = async () => {
    try {
      const data = await api.get('/users/instructors');
      setInstructors(data);
    } catch (error) {
      console.error('Failed to load instructors:', error);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Combine date and time into ISO datetime strings
      const startDateTime = formData.startDate && formData.startTime
        ? `${formData.startDate}T${formData.startTime}`
        : '';
      const endDateTime = formData.endDate && formData.endTime
        ? `${formData.endDate}T${formData.endTime}`
        : '';

      // Get location name for display
      const selectedLocation = locations.find(l => l.id === Number(formData.locationId));
      const locationName = selectedLocation ? selectedLocation.name : '';

      // Get instructor name for display
      const selectedInstructor = instructors.find(i => i.id === Number(formData.instructorId));
      const instructorName = selectedInstructor
        ? `${selectedInstructor.firstName} ${selectedInstructor.lastName}`
        : '';

      const eventData = {
        name: formData.name,
        description: formData.description,
        eventType: formData.eventType,
        programType: formData.programType,
        startDateTime,
        endDateTime,
        location: locationName,
        locationId: formData.locationId || null,
        maxAttendees: formData.maxAttendees,
        price: formData.price,
        requiresRegistration: formData.requiresRegistration,
        isRecurring: formData.isRecurring,
        recurrencePattern: formData.isRecurring ? JSON.stringify({
          frequency: formData.recurrencePattern,
          endDate: formData.recurrenceEndDate || null,
        }) : null,
        instructor: instructorName,
        instructorId: formData.instructorId || null,
      };

      await api.post('/events', eventData);
      setShowCreateModal(false);
      resetForm();
      loadEvents();
    } catch (error: any) {
      alert(error.message || 'Failed to create event');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
      await api.delete(`/events/${id}`);
      loadEvents();
      setSelectedEvent(null);
    } catch (error: any) {
      alert(error.message || 'Failed to delete event');
    }
  };

  const handleOpenEdit = (event: Event) => {
    const startDT = new Date(event.startDateTime);
    const endDT = new Date(event.endDateTime);

    let recurrencePattern = '';
    let recurrenceEndDate = '';
    if (event.recurrencePattern) {
      try {
        const parsed = JSON.parse(event.recurrencePattern);
        recurrencePattern = parsed.frequency || '';
        recurrenceEndDate = parsed.endDate || '';
      } catch {}
    }

    setFormData({
      name: event.name || '',
      description: event.description || '',
      eventType: event.eventType || 'class',
      programType: event.programType || 'All',
      startDate: startDT.toISOString().slice(0, 10),
      startTime: startDT.toTimeString().slice(0, 5),
      endDate: endDT.toISOString().slice(0, 10),
      endTime: endDT.toTimeString().slice(0, 5),
      locationId: event.locationId ? String(event.locationId) : '',
      maxAttendees: event.maxAttendees ? String(event.maxAttendees) : '',
      price: event.price ? String(event.price) : '',
      requiresRegistration: event.requiresRegistration || false,
      isRecurring: event.isRecurring || false,
      recurrencePattern,
      recurrenceEndDate,
      instructorId: event.instructorId ? String(event.instructorId) : '',
    });
    setEditingEvent(event);
    setShowEditModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;
    try {
      const startDateTime = `${formData.startDate}T${formData.startTime}`;
      const endDateTime = `${formData.endDate}T${formData.endTime}`;

      const selectedLocation = locations.find(l => l.id === Number(formData.locationId));
      const locationName = selectedLocation ? selectedLocation.name : '';

      const selectedInstructor = instructors.find(i => i.id === Number(formData.instructorId));
      const instructorName = selectedInstructor
        ? `${selectedInstructor.firstName} ${selectedInstructor.lastName}`
        : '';

      const eventData = {
        name: formData.name,
        description: formData.description,
        eventType: formData.eventType,
        programType: formData.programType,
        startDateTime,
        endDateTime,
        location: locationName,
        locationId: formData.locationId || null,
        maxAttendees: formData.maxAttendees,
        price: formData.price,
        requiresRegistration: formData.requiresRegistration,
        isRecurring: formData.isRecurring,
        recurrencePattern: formData.isRecurring ? JSON.stringify({
          frequency: formData.recurrencePattern,
          endDate: formData.recurrenceEndDate || null,
        }) : null,
        instructor: instructorName,
        instructorId: formData.instructorId || null,
      };

      await api.put(`/events/${editingEvent.id}`, eventData);
      setShowEditModal(false);
      setEditingEvent(null);
      resetForm();
      loadEvents();
    } catch (error: any) {
      alert(error.message || 'Failed to update event');
    }
  };

  const handleSyncMyStudio = async () => {
    try {
      const config = localStorage.getItem('myStudioConfig');
      const myStudioConfig = config ? JSON.parse(config) : null;

      if (!myStudioConfig?.enabled || !myStudioConfig?.apiKey) {
        alert('Please configure MyStudio API in Settings > MyStudio API first.');
        return;
      }

      const result = await api.post('/events/sync-mystudio', { config: myStudioConfig });

      if (result.syncedCount === 0) {
        alert(result.message + '\n\nNote: ' + result.note);
      } else {
        alert(`Synced ${result.syncedCount} events from MyStudio`);
        loadEvents();
      }
    } catch (error: any) {
      alert(error.message || 'Failed to sync from MyStudio');
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedEvent) return;

    if (campaignData.platforms.length === 0) {
      alert('Please select at least one platform');
      return;
    }

    if (!campaignData.audienceId) {
      alert('Please select an audience');
      return;
    }

    try {
      const result = await api.post(`/events/${selectedEvent.id}/create-campaign`, campaignData);
      alert(`Created ${result.campaigns.length} campaign(s) successfully!`);
      setShowCampaignModal(false);
      resetCampaignForm();
    } catch (error: any) {
      alert(error.message || 'Failed to create campaigns');
    }
  };

  const togglePlatform = (platform: string) => {
    setCampaignData((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform],
    }));
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      eventType: 'class',
      programType: 'All',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      locationId: '',
      maxAttendees: '',
      price: '',
      requiresRegistration: false,
      isRecurring: false,
      recurrencePattern: '',
      recurrenceEndDate: '',
      instructorId: '',
    });
  };

  const resetCampaignForm = () => {
    setCampaignData({
      audienceId: '',
      platforms: [],
    });
  };

  const getEventsForDate = (date: Date) => {
    return events.filter((event) => {
      const eventDate = new Date(event.startDateTime);
      return (
        eventDate.getDate() === date.getDate() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getFullYear() === date.getFullYear()
      );
    });
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1)
    );
  };

  const eventTypes = ['class', 'seminar', 'workshop', 'tournament', 'testing', 'social', 'other'];
  const programTypes = ['All', 'BJJ', 'Muay Thai', 'Taekwondo'];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Events & Calendar</h1>
          <p className={styles.subtitle}>Manage classes, seminars, and special events</p>
        </div>
        <div className={styles.actions}>
          <button onClick={handleSyncMyStudio} className={styles.secondaryBtn}>
            Sync MyStudio
          </button>
          <button onClick={() => setShowCreateModal(true)} className={styles.primaryBtn}>
            <AddIcon size={20} />
            Create Event
          </button>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.filters}>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={styles.select}
          >
            <option value="all">All Types</option>
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>

          <select
            value={filterProgram}
            onChange={(e) => setFilterProgram(e.target.value)}
            className={styles.select}
          >
            <option value="all">All Programs</option>
            {programTypes.map((program) => (
              <option key={program} value={program}>
                {program}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.viewToggle}>
          <button
            className={`${styles.toggleBtn} ${viewMode === 'calendar' ? styles.active : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            Calendar
          </button>
          <button
            className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.active : ''}`}
            onClick={() => setViewMode('list')}
          >
            List
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <div className={styles.calendar}>
          <div className={styles.calendarHeader}>
            <button onClick={() => navigateMonth(-1)} className={styles.navBtn}>
              &larr;
            </button>
            <h2 className={styles.monthTitle}>
              {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <button onClick={() => navigateMonth(1)} className={styles.navBtn}>
              &rarr;
            </button>
          </div>

          <div className={styles.calendarGrid}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className={styles.dayHeader}>
                {day}
              </div>
            ))}

            {getDaysInMonth(currentDate).map((date, index) => (
              <div
                key={index}
                className={`${styles.calendarDay} ${!date ? styles.empty : ''}`}
              >
                {date && (
                  <>
                    <div className={styles.dayNumber}>{date.getDate()}</div>
                    <div className={styles.dayEvents}>
                      {getEventsForDate(date).map((event) => (
                        <div
                          key={event.id}
                          className={styles.calendarEvent}
                          onClick={() => {
                            setSelectedEvent(event);
                            setShowCampaignModal(true);
                          }}
                        >
                          <span className={styles.eventDot}></span>
                          {event.name}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.eventsList}>
          {events.map((event) => (
            <div key={event.id} className={styles.eventCard}>
              <div className={styles.eventHeader}>
                <div>
                  <h3 className={styles.eventName}>{event.name}</h3>
                  <div className={styles.eventMeta}>
                    <span className={styles.badge}>{event.eventType}</span>
                    <span className={styles.badge}>{event.programType}</span>
                  </div>
                </div>
                <div className={styles.eventActions}>
                  <button
                    onClick={() => {
                      setSelectedEvent(event);
                      setShowCampaignModal(true);
                    }}
                    className={styles.campaignBtn}
                  >
                    Create Campaign
                  </button>
                  <button
                    onClick={() => handleOpenEdit(event)}
                    className={styles.secondaryBtn}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(event.id)}
                    className={styles.deleteBtn}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <p className={styles.eventDescription}>{event.description}</p>

              <div className={styles.eventDetails}>
                <div className={styles.detail}>
                  <CalendarIcon size={16} />
                  <span>
                    {new Date(event.startDateTime).toLocaleString()} -{' '}
                    {new Date(event.endDateTime).toLocaleString()}
                  </span>
                </div>
                {event.location && (
                  <div className={styles.detail}>
                    <LocationIcon size={16} />
                    <span>{event.location}</span>
                  </div>
                )}
                {event.instructor && (
                  <div className={styles.detail}>
                    <UsersIcon size={16} />
                    <span>Instructor: {event.instructor}</span>
                  </div>
                )}
                {event.maxAttendees && (
                  <div className={styles.detail}>
                    <UsersIcon size={16} />
                    <span>
                      {event.currentAttendees} / {event.maxAttendees} registered
                    </span>
                  </div>
                )}
                {event.price > 0 && (
                  <div className={styles.detail}>
                    <DollarIcon size={16} />
                    <span>${event.price}</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {events.length === 0 && (
            <div className={styles.empty}>
              <CalendarIcon size={48} />
              <p>No events found</p>
            </div>
          )}
        </div>
      )}

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>Create New Event</h2>
              <button onClick={() => setShowCreateModal(false)} className={styles.closeBtn}>
                <CloseIcon size={24} />
              </button>
            </div>

            <form onSubmit={handleCreate} className={styles.form}>
              <div className={styles.formGroup}>
                <label>Event Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className={styles.input}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Event Type *</label>
                  <select
                    value={formData.eventType}
                    onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                    className={styles.input}
                  >
                    {eventTypes.map((type) => (
                      <option key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Program</label>
                  <select
                    value={formData.programType}
                    onChange={(e) => setFormData({ ...formData, programType: e.target.value })}
                    className={styles.input}
                  >
                    {programTypes.map((program) => (
                      <option key={program} value={program}>
                        {program}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={styles.textarea}
                  rows={3}
                />
              </div>

              <div className={styles.dateTimeSection}>
                <h3 className={styles.sectionTitle}>Schedule</h3>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Start Date *</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          startDate: e.target.value,
                          // Auto-set end date to same day if not set
                          endDate: formData.endDate || e.target.value
                        });
                      }}
                      required
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>Start Time *</label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      required
                      className={styles.input}
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>End Date *</label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      min={formData.startDate}
                      required
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>End Time *</label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      required
                      className={styles.input}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.recurringSection}>
                <div className={styles.formGroup}>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={formData.isRecurring}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isRecurring: e.target.checked,
                          recurrencePattern: e.target.checked ? 'weekly' : '',
                          recurrenceEndDate: ''
                        })
                      }
                    />
                    <span>Make this a recurring event</span>
                  </label>
                </div>

                {formData.isRecurring && (
                  <div className={styles.recurrenceOptions}>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label>Repeat</label>
                        <select
                          value={formData.recurrencePattern}
                          onChange={(e) => setFormData({ ...formData, recurrencePattern: e.target.value })}
                          className={styles.input}
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="biweekly">Every 2 Weeks</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>

                      <div className={styles.formGroup}>
                        <label>Repeat Until (Optional)</label>
                        <input
                          type="date"
                          value={formData.recurrenceEndDate}
                          onChange={(e) => setFormData({ ...formData, recurrenceEndDate: e.target.value })}
                          min={formData.startDate}
                          className={styles.input}
                        />
                      </div>
                    </div>

                    <div className={styles.recurrencePreview}>
                      <CalendarIcon size={16} />
                      <span>
                        {formData.recurrencePattern === 'daily' && 'Repeats every day'}
                        {formData.recurrencePattern === 'weekly' && `Repeats every ${formData.startDate ? new Date(formData.startDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }) : 'week'}`}
                        {formData.recurrencePattern === 'biweekly' && `Repeats every 2 weeks on ${formData.startDate ? new Date(formData.startDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }) : 'the same day'}`}
                        {formData.recurrencePattern === 'monthly' && `Repeats monthly on day ${formData.startDate ? new Date(formData.startDate + 'T12:00:00').getDate() : ''}`}
                        {formData.recurrenceEndDate && ` until ${new Date(formData.recurrenceEndDate + 'T12:00:00').toLocaleDateString()}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Location</label>
                  <select
                    value={formData.locationId}
                    onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                    className={styles.input}
                  >
                    <option value="">Select a location...</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Instructor</label>
                  <select
                    value={formData.instructorId}
                    onChange={(e) => setFormData({ ...formData, instructorId: e.target.value })}
                    className={styles.input}
                  >
                    <option value="">Select an instructor...</option>
                    {instructors.map((instructor) => (
                      <option key={instructor.id} value={instructor.id}>
                        {instructor.firstName} {instructor.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Max Attendees</label>
                  <input
                    type="number"
                    value={formData.maxAttendees}
                    onChange={(e) =>
                      setFormData({ ...formData, maxAttendees: e.target.value })
                    }
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={formData.requiresRegistration}
                    onChange={(e) =>
                      setFormData({ ...formData, requiresRegistration: e.target.checked })
                    }
                  />
                  <span>Requires Registration</span>
                </label>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className={styles.secondaryBtn}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Create Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {showEditModal && editingEvent && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>Edit Event</h2>
              <button onClick={() => { setShowEditModal(false); setEditingEvent(null); resetForm(); }} className={styles.closeBtn}>
                <CloseIcon size={24} />
              </button>
            </div>

            <form onSubmit={handleUpdate} className={styles.form}>
              <div className={styles.formGroup}>
                <label>Event Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className={styles.input}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Event Type *</label>
                  <select
                    value={formData.eventType}
                    onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                    className={styles.input}
                  >
                    {eventTypes.map((type) => (
                      <option key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Program</label>
                  <select
                    value={formData.programType}
                    onChange={(e) => setFormData({ ...formData, programType: e.target.value })}
                    className={styles.input}
                  >
                    {programTypes.map((program) => (
                      <option key={program} value={program}>
                        {program}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={styles.textarea}
                  rows={3}
                />
              </div>

              <div className={styles.dateTimeSection}>
                <h3 className={styles.sectionTitle}>Schedule</h3>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Start Date *</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value, endDate: formData.endDate || e.target.value })}
                      required
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>Start Time *</label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      required
                      className={styles.input}
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>End Date *</label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      min={formData.startDate}
                      required
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>End Time *</label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      required
                      className={styles.input}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.recurringSection}>
                <div className={styles.formGroup}>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={formData.isRecurring}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isRecurring: e.target.checked,
                          recurrencePattern: e.target.checked ? (formData.recurrencePattern || 'weekly') : '',
                          recurrenceEndDate: e.target.checked ? formData.recurrenceEndDate : '',
                        })
                      }
                    />
                    <span>Make this a recurring event</span>
                  </label>
                </div>

                {formData.isRecurring && (
                  <div className={styles.recurrenceOptions}>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label>Repeat</label>
                        <select
                          value={formData.recurrencePattern}
                          onChange={(e) => setFormData({ ...formData, recurrencePattern: e.target.value })}
                          className={styles.input}
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="biweekly">Every 2 Weeks</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>

                      <div className={styles.formGroup}>
                        <label>Repeat Until (Optional)</label>
                        <input
                          type="date"
                          value={formData.recurrenceEndDate}
                          onChange={(e) => setFormData({ ...formData, recurrenceEndDate: e.target.value })}
                          min={formData.startDate}
                          className={styles.input}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Location</label>
                  <select
                    value={formData.locationId}
                    onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                    className={styles.input}
                  >
                    <option value="">Select a location...</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Instructor</label>
                  <select
                    value={formData.instructorId}
                    onChange={(e) => setFormData({ ...formData, instructorId: e.target.value })}
                    className={styles.input}
                  >
                    <option value="">Select an instructor...</option>
                    {instructors.map((instructor) => (
                      <option key={instructor.id} value={instructor.id}>
                        {instructor.firstName} {instructor.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Max Attendees</label>
                  <input
                    type="number"
                    value={formData.maxAttendees}
                    onChange={(e) => setFormData({ ...formData, maxAttendees: e.target.value })}
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={formData.requiresRegistration}
                    onChange={(e) => setFormData({ ...formData, requiresRegistration: e.target.checked })}
                  />
                  <span>Requires Registration</span>
                </label>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingEvent(null); resetForm(); }}
                  className={styles.secondaryBtn}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCampaignModal && selectedEvent && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>Create Campaign for {selectedEvent.name}</h2>
              <button onClick={() => setShowCampaignModal(false)} className={styles.closeBtn}>
                <CloseIcon size={24} />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className={styles.form}>
              <div className={styles.formGroup}>
                <label>Select Audience *</label>
                <select
                  value={campaignData.audienceId}
                  onChange={(e) =>
                    setCampaignData({ ...campaignData, audienceId: e.target.value })
                  }
                  required
                  className={styles.input}
                >
                  <option value="">Choose an audience...</option>
                  {audiences.map((audience) => (
                    <option key={audience.id} value={audience.id}>
                      {audience.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Select Platforms *</label>
                <div className={styles.platformGrid}>
                  <div
                    className={`${styles.platformCard} ${
                      campaignData.platforms.includes('optimize') ? styles.selected : ''
                    }`}
                    onClick={() => togglePlatform('optimize')}
                  >
                    <OptimizeIcon size={32} />
                    <h3>DragonDesk: Optimize</h3>
                    <p>Website personalization</p>
                    {campaignData.platforms.includes('optimize') && (
                      <div className={styles.checkmark}>
                        <CheckIcon size={20} />
                      </div>
                    )}
                  </div>

                  <div
                    className={`${styles.platformCard} ${
                      campaignData.platforms.includes('engage') ? styles.selected : ''
                    }`}
                    onClick={() => togglePlatform('engage')}
                  >
                    <EngageIcon size={32} />
                    <h3>DragonDesk: Engage</h3>
                    <p>Email marketing</p>
                    {campaignData.platforms.includes('engage') && (
                      <div className={styles.checkmark}>
                        <CheckIcon size={20} />
                      </div>
                    )}
                  </div>

                  <div
                    className={`${styles.platformCard} ${
                      campaignData.platforms.includes('outreach') ? styles.selected : ''
                    }`}
                    onClick={() => togglePlatform('outreach')}
                  >
                    <OutreachIcon size={32} />
                    <h3>DragonDesk: Outreach</h3>
                    <p>AI call agent</p>
                    {campaignData.platforms.includes('outreach') && (
                      <div className={styles.checkmark}>
                        <CheckIcon size={20} />
                      </div>
                    )}
                  </div>

                  <div
                    className={`${styles.platformCard} ${
                      campaignData.platforms.includes('social') ? styles.selected : ''
                    }`}
                    onClick={() => togglePlatform('social')}
                  >
                    <SocialIcon size={32} />
                    <h3>DragonDesk: Social</h3>
                    <p>Social media marketing</p>
                    {campaignData.platforms.includes('social') && (
                      <div className={styles.checkmark}>
                        <CheckIcon size={20} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowCampaignModal(false)}
                  className={styles.secondaryBtn}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Create Campaigns
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Events;
