import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { User, WorkSchedule, MyStudioSyncLog } from '../types';
import { useLocation } from '../contexts/LocationContext';
import { AddIcon, EditIcon, DeleteIcon, CalendarIcon } from '../components/Icons';
import styles from './WorkforceManagement.module.css';

const WorkforceManagement = () => {
  const { locations, selectedLocation, isAllLocations } = useLocation();
  const [activeTab, setActiveTab] = useState<'instructors' | 'schedules' | 'sync'>('instructors');

  // Instructors state
  const [instructors, setInstructors] = useState<User[]>([]);
  const [showInstructorModal, setShowInstructorModal] = useState(false);
  const [editingInstructor, setEditingInstructor] = useState<User | null>(null);

  // Schedules state
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<WorkSchedule | null>(null);
  const [selectedInstructorFilter, setSelectedInstructorFilter] = useState<number | null>(null);
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('');
  const [selectedScheduleTypeFilter, setSelectedScheduleTypeFilter] = useState<string>('');

  // Sync state
  const [syncLogs, setSyncLogs] = useState<MyStudioSyncLog[]>([]);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  // Form states
  const [instructorForm, setInstructorForm] = useState({
    id: 0,
    certifications: '',
    specialties: '',
    isInstructor: true,
    locationId: selectedLocation?.id || null,
  });

  const [scheduleForm, setScheduleForm] = useState({
    instructorId: 0,
    locationId: selectedLocation?.id || null,
    dayOfWeek: 'Monday' as WorkSchedule['dayOfWeek'],
    startTime: '09:00',
    endTime: '17:00',
    isRecurring: true,
    specificDate: '',
    scheduleType: 'instructor' as WorkSchedule['scheduleType'],
    notes: '',
  });

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  useEffect(() => {
    if (activeTab === 'instructors') {
      loadInstructors();
    } else if (activeTab === 'schedules') {
      loadSchedules();
    } else if (activeTab === 'sync') {
      loadSyncLogs();
    }
  }, [activeTab, selectedLocation, isAllLocations]);

  const loadInstructors = async () => {
    try {
      const params = new URLSearchParams();
      if (!isAllLocations && selectedLocation) {
        params.append('locationId', selectedLocation.id.toString());
      }
      const data = await api.get(`/workforce/instructors?${params.toString()}`);
      setInstructors(data);
    } catch (error) {
      console.error('Failed to load instructors:', error);
    }
  };

  const loadSchedules = async () => {
    try {
      const params = new URLSearchParams();
      if (!isAllLocations && selectedLocation) {
        params.append('locationId', selectedLocation.id.toString());
      }
      if (selectedInstructorFilter) {
        params.append('instructorId', selectedInstructorFilter.toString());
      }
      if (selectedDayFilter) {
        params.append('dayOfWeek', selectedDayFilter);
      }
      if (selectedScheduleTypeFilter) {
        params.append('scheduleType', selectedScheduleTypeFilter);
      }
      const data = await api.get(`/workforce/schedules?${params.toString()}`);
      setSchedules(data);
    } catch (error) {
      console.error('Failed to load schedules:', error);
    }
  };

  const loadSyncLogs = async () => {
    try {
      const data = await api.get('/workforce/sync-logs');
      setSyncLogs(data);
    } catch (error) {
      console.error('Failed to load sync logs:', error);
    }
  };

  const handleEditInstructor = (instructor: User) => {
    setEditingInstructor(instructor);
    setInstructorForm({
      id: instructor.id,
      certifications: instructor.certifications || '',
      specialties: instructor.specialties || '',
      isInstructor: instructor.isInstructor || false,
      locationId: instructor.locationId || null,
    });
    setShowInstructorModal(true);
  };

  const handleSaveInstructor = async () => {
    try {
      await api.put(`/workforce/instructors/${instructorForm.id}`, instructorForm);
      setShowInstructorModal(false);
      setEditingInstructor(null);
      loadInstructors();
    } catch (error) {
      console.error('Failed to save instructor:', error);
      alert('Failed to save instructor');
    }
  };

  const handleAddSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm({
      instructorId: 0,
      locationId: selectedLocation?.id || null,
      dayOfWeek: 'Monday',
      startTime: '09:00',
      endTime: '17:00',
      isRecurring: true,
      specificDate: '',
      scheduleType: 'instructor',
      notes: '',
    });
    setShowScheduleModal(true);
  };

  const handleEditSchedule = (schedule: WorkSchedule) => {
    setEditingSchedule(schedule);
    setScheduleForm({
      instructorId: schedule.instructorId,
      locationId: schedule.locationId || null,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      isRecurring: schedule.isRecurring,
      specificDate: schedule.specificDate || '',
      scheduleType: schedule.scheduleType,
      notes: schedule.notes || '',
    });
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = async () => {
    try {
      if (editingSchedule) {
        await api.put(`/workforce/schedules/${editingSchedule.id}`, {
          ...scheduleForm,
          status: 'scheduled',
        });
      } else {
        await api.post('/workforce/schedules', scheduleForm);
      }
      setShowScheduleModal(false);
      setEditingSchedule(null);
      loadSchedules();
    } catch (error) {
      console.error('Failed to save schedule:', error);
      alert('Failed to save schedule');
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      await api.delete(`/workforce/schedules/${id}`);
      loadSchedules();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      alert('Failed to delete schedule');
    }
  };

  const parseCSV = (text: string) => {
    // Handle different line endings (Windows \r\n, Unix \n, Mac \r)
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) {
      console.error('CSV is empty');
      return [];
    }

    // Parse CSV handling quoted values
    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            current += '"';
            i++; // Skip next quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseLine(lines[0]);
    console.log('CSV Headers:', headers);

    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      data.push(row);
    }

    console.log('Parsed CSV data:', data);
    return data;
  };

  const handleImportSchedule = async () => {
    if (!importFile) {
      alert('Please select a file to import');
      return;
    }

    try {
      setImporting(true);
      const text = await importFile.text();
      console.log('File content length:', text.length);

      let scheduleData;
      if (importFile.name.endsWith('.csv')) {
        // Parse CSV file
        scheduleData = parseCSV(text);
        console.log('CSV parsed into', scheduleData.length, 'records');
      } else if (importFile.name.endsWith('.json')) {
        // Parse JSON file
        scheduleData = JSON.parse(text);
      } else {
        throw new Error('Unsupported file format. Please upload a CSV or JSON file.');
      }

      if (!scheduleData || scheduleData.length === 0) {
        alert('No data found in the file. Please check the CSV format.');
        return;
      }

      console.log('Sending to API:', scheduleData);
      const result = await api.post('/workforce/import-mystudio-schedule', { scheduleData });
      console.log('API response:', result);

      if (result.errors && result.errors.length > 0) {
        alert(`Import completed with errors:\n${result.imported} records imported\n${result.errors.length} errors:\n${result.errors.slice(0, 3).join('\n')}`);
      } else {
        alert(`Import completed successfully: ${result.imported} records imported`);
      }

      loadSyncLogs();
      setImportFile(null);
    } catch (error: any) {
      console.error('Failed to import schedule:', error);
      alert(error.message || 'Failed to import schedule');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Workforce Management</h1>
        <p>Manage instructors, schedules, and teaching assignments</p>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'instructors' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('instructors')}
        >
          Instructors
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'schedules' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('schedules')}
        >
          Schedules
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'sync' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('sync')}
        >
          MyStudio Sync
        </button>
      </div>

      {activeTab === 'instructors' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Instructors ({instructors.length})</h2>
          </div>

          <div className={styles.instructorsList}>
            {instructors.map((instructor) => (
              <div key={instructor.id} className={styles.instructorCard}>
                <div className={styles.instructorInfo}>
                  <h3>
                    {instructor.firstName} {instructor.lastName}
                  </h3>
                  <p className={styles.email}>{instructor.email}</p>
                  <div className={styles.instructorDetails}>
                    {instructor.certifications && (
                      <div className={styles.detail}>
                        <strong>Certifications:</strong> {instructor.certifications}
                      </div>
                    )}
                    {instructor.specialties && (
                      <div className={styles.detail}>
                        <strong>Specialties:</strong> {instructor.specialties}
                      </div>
                    )}
                    {instructor.locationId && (
                      <div className={styles.detail}>
                        <strong>Location:</strong>{' '}
                        {locations.find((l) => l.id === instructor.locationId)?.name}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleEditInstructor(instructor)}
                  className={styles.editBtn}
                >
                  <EditIcon size={16} />
                  Edit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'schedules' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Work Schedules</h2>
            <button onClick={handleAddSchedule} className={styles.primaryBtn}>
              <AddIcon size={16} />
              Add Schedule
            </button>
          </div>

          <div className={styles.filters}>
            <div className={styles.filterGroup}>
              <label>Instructor:</label>
              <select
                value={selectedInstructorFilter || ''}
                onChange={(e) => {
                  setSelectedInstructorFilter(e.target.value ? parseInt(e.target.value) : null);
                  loadSchedules();
                }}
              >
                <option value="">All Instructors</option>
                {instructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {instructor.firstName} {instructor.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label>Day:</label>
              <select
                value={selectedDayFilter}
                onChange={(e) => {
                  setSelectedDayFilter(e.target.value);
                  loadSchedules();
                }}
              >
                <option value="">All Days</option>
                {daysOfWeek.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label>Type:</label>
              <select
                value={selectedScheduleTypeFilter}
                onChange={(e) => {
                  setSelectedScheduleTypeFilter(e.target.value);
                  loadSchedules();
                }}
              >
                <option value="">All Types</option>
                <option value="instructor">Instructors</option>
                <option value="front_desk">Front Desk</option>
              </select>
            </div>
          </div>

          <div className={styles.schedulesList}>
            {schedules.map((schedule: any) => (
              <div key={schedule.id} className={styles.scheduleCard}>
                <div className={styles.scheduleInfo}>
                  <h3>{schedule.instructorName}</h3>
                  <div className={styles.scheduleDetails}>
                    <div className={styles.scheduleTime}>
                      <CalendarIcon size={16} />
                      {schedule.dayOfWeek}: {schedule.startTime} - {schedule.endTime}
                    </div>
                    {schedule.locationName && (
                      <div className={styles.scheduleLocation}>{schedule.locationName}</div>
                    )}
                    {schedule.notes && <div className={styles.scheduleNotes}>{schedule.notes}</div>}
                    <div className={styles.badges}>
                      {schedule.isRecurring && (
                        <span className={styles.recurringBadge}>Recurring</span>
                      )}
                      <span
                        className={`${styles.scheduleTypeBadge} ${schedule.scheduleType === 'front_desk' ? styles.frontDeskBadge : styles.instructorBadge}`}
                      >
                        {schedule.scheduleType === 'front_desk' ? 'Front Desk' : 'Instructor'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={styles.scheduleActions}>
                  <button
                    onClick={() => handleEditSchedule(schedule)}
                    className={styles.editBtn}
                  >
                    <EditIcon size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteSchedule(schedule.id)}
                    className={styles.deleteBtn}
                  >
                    <DeleteIcon size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'sync' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>MyStudio Schedule Import</h2>
          </div>

          <div className={styles.importSection}>
            <div className={styles.importForm}>
              <h3>Import Schedule from MyStudio</h3>
              <p>Upload a CSV or JSON file containing your MyStudio class schedule data.</p>
              <div className={styles.fileInputWrapper}>
                <input
                  type="file"
                  accept=".csv,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setImportFile(file);
                    console.log('File selected:', file?.name, file?.type);
                  }}
                  className={styles.fileInput}
                  id="csvFileInput"
                />
                <label htmlFor="csvFileInput" className={styles.fileInputLabel}>
                  {importFile ? `Selected: ${importFile.name}` : 'Choose CSV or JSON file...'}
                </label>
              </div>
              <button
                onClick={handleImportSchedule}
                disabled={!importFile || importing}
                className={styles.primaryBtn}
              >
                {importing ? 'Importing...' : 'Import Schedule'}
              </button>
            </div>

            <div className={styles.syncHistory}>
              <h3>Sync History</h3>
              <table className={styles.syncTable}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Records</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {syncLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.syncedAt).toLocaleString()}</td>
                      <td>{log.syncType}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[log.status]}`}>
                          {log.status}
                        </span>
                      </td>
                      <td>{log.recordsImported}</td>
                      <td>{log.errorMessage || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showInstructorModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>Edit Instructor</h2>
              <button onClick={() => setShowInstructorModal(false)} className={styles.closeBtn}>
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label>Certifications</label>
                <input
                  type="text"
                  value={instructorForm.certifications}
                  onChange={(e) =>
                    setInstructorForm({ ...instructorForm, certifications: e.target.value })
                  }
                  placeholder="e.g., Black Belt BJJ, CPR Certified"
                />
              </div>

              <div className={styles.formGroup}>
                <label>Specialties</label>
                <input
                  type="text"
                  value={instructorForm.specialties}
                  onChange={(e) =>
                    setInstructorForm({ ...instructorForm, specialties: e.target.value })
                  }
                  placeholder="e.g., Kids Classes, Competition Training"
                />
              </div>

              <div className={styles.formGroup}>
                <label>Primary Location</label>
                <select
                  value={instructorForm.locationId || ''}
                  onChange={(e) =>
                    setInstructorForm({
                      ...instructorForm,
                      locationId: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                >
                  <option value="">No specific location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button onClick={() => setShowInstructorModal(false)} className={styles.secondaryBtn}>
                Cancel
              </button>
              <button onClick={handleSaveInstructor} className={styles.saveBtn}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showScheduleModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>{editingSchedule ? 'Edit Schedule' : 'Add Schedule'}</h2>
              <button onClick={() => setShowScheduleModal(false)} className={styles.closeBtn}>
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label>Instructor *</label>
                <select
                  value={scheduleForm.instructorId}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, instructorId: parseInt(e.target.value) })
                  }
                  required
                >
                  <option value="0">Select Instructor</option>
                  {instructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.firstName} {instructor.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Location</label>
                <select
                  value={scheduleForm.locationId || ''}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      locationId: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                >
                  <option value="">All Locations</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Schedule Type *</label>
                <select
                  value={scheduleForm.scheduleType}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      scheduleType: e.target.value as WorkSchedule['scheduleType'],
                    })
                  }
                  required
                >
                  <option value="instructor">Instructor Schedule</option>
                  <option value="front_desk">Front Desk Staff</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Day of Week *</label>
                <select
                  value={scheduleForm.dayOfWeek}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      dayOfWeek: e.target.value as WorkSchedule['dayOfWeek'],
                    })
                  }
                >
                  {daysOfWeek.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Start Time *</label>
                  <input
                    type="time"
                    value={scheduleForm.startTime}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, startTime: e.target.value })
                    }
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>End Time *</label>
                  <input
                    type="time"
                    value={scheduleForm.endTime}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, endTime: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={scheduleForm.isRecurring}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, isRecurring: e.target.checked })
                    }
                  />
                  <span>Recurring Weekly</span>
                </label>
              </div>

              {!scheduleForm.isRecurring && (
                <div className={styles.formGroup}>
                  <label>Specific Date</label>
                  <input
                    type="date"
                    value={scheduleForm.specificDate}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, specificDate: e.target.value })
                    }
                  />
                </div>
              )}

              <div className={styles.formGroup}>
                <label>Notes</label>
                <textarea
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Any additional notes about this schedule"
                />
              </div>
            </div>

            <div className={styles.modalActions}>
              <button onClick={() => setShowScheduleModal(false)} className={styles.secondaryBtn}>
                Cancel
              </button>
              <button onClick={handleSaveSchedule} className={styles.saveBtn}>
                {editingSchedule ? 'Update Schedule' : 'Create Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkforceManagement;
