import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { Audience, AudienceFilter, Member, AccountStatus, AccountType, ProgramType, MembershipAge, LeadSource } from '../types';
import { DeleteIcon } from '../components/Icons';
import { useToast } from '../components/Toast';
import { useLocation } from '../contexts/LocationContext';
import styles from './Audiences.module.css';

const PROGRAM_TYPES: ProgramType[] = [
  "Children's Martial Arts", 'Adult BJJ', 'Adult TKD & HKD', 'DG Barbell',
  'Adult Muay Thai & Kickboxing', 'The Ashtanga Club', 'Dragon Gym Learning Center',
  'Kids BJJ', 'Kids Muay Thai', 'Young Ladies Yoga', 'DG Workspace',
  'Dragon Launch', 'Personal Training', 'DGMT Private Training',
];

const RANKINGS: Record<string, string[]> = {
  "Children's Martial Arts": ['Beginner', 'Intermediate', 'Advanced'],
  'Adult BJJ': ['White', 'Blue', 'Purple', 'Brown', 'Black'],
  'Adult TKD & HKD': ['White', 'Yellow', 'Orange', 'Green', 'Purple', 'Blue', 'Red', 'Brown', 'Il Dan Bo', 'Black'],
  'DG Barbell': ['Beginner', 'Intermediate', 'Advanced'],
  'Adult Muay Thai & Kickboxing': ['White', 'Green', 'Purple', 'Blue', 'Red'],
  'The Ashtanga Club': ['Beginner', 'Intermediate', 'Advanced'],
  'Dragon Gym Learning Center': ['Beginner', 'Intermediate', 'Advanced'],
  'Kids BJJ': ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black'],
  'Kids Muay Thai': ['White', 'Green', 'Purple', 'Blue', 'Red'],
  'Young Ladies Yoga': ['Beginner', 'Intermediate', 'Advanced'],
  'DG Workspace': ['Beginner', 'Intermediate', 'Advanced'],
  'Dragon Launch': ['Beginner', 'Intermediate', 'Advanced'],
  'Personal Training': ['Beginner', 'Intermediate', 'Advanced'],
  'DGMT Private Training': ['Beginner', 'Intermediate', 'Advanced'],
};

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
}

const Audiences = () => {
  const { toast, confirm } = useToast();
  const { locations } = useLocation();
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [selectedAudience, setSelectedAudience] = useState<Audience | null>(null);
  const [audienceMembers, setAudienceMembers] = useState<Member[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [previewMembers, setPreviewMembers] = useState<Member[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const emptyFilters = {
    accountStatus: [] as AccountStatus[],
    accountType: [] as AccountType[],
    programType: [] as ProgramType[],
    membershipAge: [] as MembershipAge[],
    ranking: [] as string[],
    leadSource: [] as LeadSource[],
    locationIds: [] as number[],
    tags: [] as string[],
  };

  const [formData, setFormData] = useState({ name: '', description: '', filters: emptyFilters });

  useEffect(() => { loadAudiences(); }, []);

  const loadAudiences = async () => {
    try {
      const data = await api.get('/audiences');
      setAudiences(data.map((a: any) => ({
        ...a,
        filters: typeof a.filters === 'string' ? JSON.parse(a.filters) : a.filters,
      })));
    } catch (error) {
      console.error('Failed to load audiences:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAudienceMembers = async (audienceId: number) => {
    try {
      const members = await api.get(`/audiences/${audienceId}/members`);
      setAudienceMembers(members);
    } catch (error) {
      console.error('Failed to load audience members:', error);
    }
  };

  const handleSelectAudience = (audience: Audience) => {
    setSelectedAudience(audience);
    loadAudienceMembers(audience.id);
  };

  const handleOpenModal = () => {
    setEditingId(null);
    setFormData({ name: '', description: '', filters: emptyFilters });
    setRankingOpen(false);
    setTagInput('');
    setPreviewMembers([]);
    setIsModalOpen(true);
    api.get('/members/tags').then(setAvailableTags).catch(() => {});
  };

  const handleEditAudience = (audience: Audience) => {
    const af = audience.filters || {};
    setEditingId(audience.id);
    setFormData({
      name: audience.name,
      description: audience.description || '',
      filters: {
        accountStatus: af.accountStatus ?? [],
        accountType: af.accountType ?? [],
        programType: af.programType ?? [],
        membershipAge: af.membershipAge ?? [],
        ranking: af.ranking ?? [],
        leadSource: af.leadSource ?? [],
        locationIds: af.locationIds ?? [],
        tags: af.tags ?? [],
      },
    });
    setRankingOpen((af.ranking?.length || 0) > 0);
    setTagInput('');
    setPreviewMembers([]);
    setIsModalOpen(true);
    api.get('/members/tags').then(setAvailableTags).catch(() => {});
  };

  const handleAddTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setFormData(prev => {
      if (prev.filters.tags.includes(trimmed)) return prev;
      return { ...prev, filters: { ...prev.filters, tags: [...prev.filters.tags, trimmed] } };
    });
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setFormData(prev => ({ ...prev, filters: { ...prev.filters, tags: prev.filters.tags.filter(t => t !== tag) } }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId !== null) {
        await api.put(`/audiences/${editingId}`, formData);
      } else {
        await api.post('/audiences', formData);
      }
      const savedId = editingId;
      setIsModalOpen(false);
      await loadAudiences();
      // Keep the edited audience selected, refreshing its header and member list.
      if (savedId !== null && selectedAudience?.id === savedId) {
        setSelectedAudience({ ...selectedAudience, name: formData.name, description: formData.description, filters: formData.filters });
        loadAudienceMembers(savedId);
      }
      toast(savedId !== null ? 'Audience updated successfully' : 'Audience created successfully', 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to save audience', 'error');
    }
  };

  const handleDeleteAudience = async (id: number) => {
    if (!await confirm({ title: 'Delete Audience', message: 'Are you sure you want to delete this audience?', confirmLabel: 'Delete', danger: true })) return;
    try {
      await api.delete(`/audiences/${id}`);
      if (selectedAudience?.id === id) { setSelectedAudience(null); setAudienceMembers([]); }
      loadAudiences();
    } catch (error: any) {
      toast(error.message || 'Failed to delete audience', 'error');
    }
  };

  // Live preview: whenever the modal's filters change, fetch matching members
  // (debounced) so the user sees who the audience targets before saving.
  useEffect(() => {
    if (!isModalOpen) return;
    setPreviewLoading(true);
    const handle = setTimeout(() => {
      api.post('/audiences/preview', { filters: formData.filters })
        .then((members: Member[]) => setPreviewMembers(members))
        .catch(() => setPreviewMembers([]))
        .finally(() => setPreviewLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [isModalOpen, formData.filters]);

  const f = formData.filters;
  const setFilter = (patch: Partial<typeof emptyFilters>) =>
    setFormData(prev => ({ ...prev, filters: { ...prev.filters, ...patch } }));

  // Selected ranking count for display
  const selectedRankingCount = f.ranking.length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Audiences</h1>
          <p className={styles.subtitle}>Create targeted audiences for campaigns</p>
        </div>
        <button onClick={handleOpenModal} className={styles.addBtn}>+ Create Audience</button>
      </div>

      <div className={styles.content}>
        <div className={styles.sidebar}>
          <h3 className={styles.sidebarTitle}>All Audiences</h3>
          {isLoading ? (
            <div className={styles.loading}>Loading...</div>
          ) : audiences.length === 0 ? (
            <div className={styles.empty}>No audiences yet</div>
          ) : (
            <div className={styles.audienceList}>
              {audiences.map((audience) => (
                <div
                  key={audience.id}
                  className={`${styles.audienceItem} ${selectedAudience?.id === audience.id ? styles.active : ''}`}
                  onClick={() => handleSelectAudience(audience)}
                >
                  <div className={styles.audienceName}>{audience.name}</div>
                  <div className={styles.audienceDesc}>{audience.description}</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteAudience(audience.id); }}
                    className={styles.deleteIconBtn}
                    aria-label="Delete audience"
                  >
                    <DeleteIcon size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.main}>
          {selectedAudience ? (
            <>
              <div className={styles.audienceHeader}>
                <div>
                  <h2>{selectedAudience.name}</h2>
                  <p>{selectedAudience.description}</p>
                </div>
                <button className={styles.editBtn} onClick={() => handleEditAudience(selectedAudience)}>
                  Edit Audience
                </button>
              </div>
              <div className={styles.membersSection}>
                <h3 className={styles.sectionTitle}>Members in Audience ({audienceMembers.length})</h3>
                {audienceMembers.length === 0 ? (
                  <div className={styles.empty}>No members match this audience criteria</div>
                ) : (
                  <div className={styles.membersList}>
                    {audienceMembers.map((member) => (
                      <div key={member.id} className={styles.memberCard}>
                        <div className={styles.memberName}>{member.firstName} {member.lastName}</div>
                        <div className={styles.memberInfo}>{member.email} • {member.programType} • {member.ranking}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={styles.placeholder}><p>Select an audience to view its members</p></div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className={styles.modal} onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div>
                <h2>{editingId !== null ? 'Edit Audience' : 'Create Audience'}</h2>
                <p className={styles.modalSubtitle}>Define filters to automatically match members</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className={styles.closeBtn}>✕</button>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              {/* Name + Description */}
              <div className={styles.formRow2}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Audience Name <span className={styles.req}>*</span></label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={styles.input}
                    placeholder="e.g. Active Adult Members"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className={styles.input}
                    placeholder="Optional notes about this audience"
                  />
                </div>
              </div>

              <div className={styles.divider}>
                <span>Filters</span>
                <small>Members matching ALL selected criteria will be included</small>
              </div>

              {/* Location */}
              {locations.length > 0 && (
                <div className={styles.filterBlock}>
                  <label className={styles.filterLabel}>Location</label>
                  <div className={styles.pillGroup}>
                    {locations.filter(l => l.isActive).map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        className={`${styles.pill} ${f.locationIds.includes(loc.id) ? styles.pillActive : ''}`}
                        onClick={() => setFilter({ locationIds: toggle(f.locationIds, loc.id) })}
                      >
                        {loc.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Status + Age Group */}
              <div className={styles.filterGrid2}>
                <div className={styles.filterBlock}>
                  <label className={styles.filterLabel}>Account Status</label>
                  <div className={styles.pillGroup}>
                    {(['lead', 'trialer', 'member', 'cancelled'] as AccountStatus[]).map(s => (
                      <button key={s} type="button"
                        className={`${styles.pill} ${f.accountStatus.includes(s) ? styles.pillActive : ''}`}
                        onClick={() => setFilter({ accountStatus: toggle(f.accountStatus, s) })}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.filterBlock}>
                  <label className={styles.filterLabel}>Age Group</label>
                  <div className={styles.pillGroup}>
                    {(['Adult', 'Kids'] as MembershipAge[]).map(a => (
                      <button key={a} type="button"
                        className={`${styles.pill} ${f.membershipAge.includes(a) ? styles.pillActive : ''}`}
                        onClick={() => setFilter({ membershipAge: toggle(f.membershipAge, a) })}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Account Type + Lead Source */}
              <div className={styles.filterGrid2}>
                <div className={styles.filterBlock}>
                  <label className={styles.filterLabel}>Account Type</label>
                  <div className={styles.pillGroup}>
                    {(['basic', 'premium', 'elite', 'family'] as AccountType[]).map(t => (
                      <button key={t} type="button"
                        className={`${styles.pill} ${f.accountType.includes(t) ? styles.pillActive : ''}`}
                        onClick={() => setFilter({ accountType: toggle(f.accountType, t) })}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.filterBlock}>
                  <label className={styles.filterLabel}>Lead Source</label>
                  <div className={styles.pillGroup}>
                    {([
                      { val: 'web_form', label: 'Web Form' },
                      { val: 'inbound_call', label: 'Inbound Call' },
                      { val: 'manual_add', label: 'Manual Add' },
                      { val: 'referral', label: 'Referral' },
                      { val: 'walk_in', label: 'Walk In' },
                      { val: 'social_media', label: 'Social Media' },
                    ] as { val: LeadSource; label: string }[]).map(({ val, label }) => (
                      <button key={val} type="button"
                        className={`${styles.pill} ${f.leadSource.includes(val) ? styles.pillActive : ''}`}
                        onClick={() => setFilter({ leadSource: toggle(f.leadSource, val) })}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Program Type */}
              <div className={styles.filterBlock}>
                <label className={styles.filterLabel}>Program Type</label>
                <div className={styles.pillGroup}>
                  {PROGRAM_TYPES.map(p => (
                    <button key={p} type="button"
                      className={`${styles.pill} ${f.programType.includes(p) ? styles.pillActive : ''}`}
                      onClick={() => setFilter({ programType: toggle(f.programType, p) })}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ranking — collapsible */}
              <div className={styles.filterBlock}>
                <button type="button" className={styles.rankingToggle} onClick={() => setRankingOpen(v => !v)}>
                  <span className={styles.filterLabel} style={{ margin: 0 }}>
                    Ranking {selectedRankingCount > 0 && <span className={styles.rankingBadge}>{selectedRankingCount} selected</span>}
                  </span>
                  <span className={styles.rankingChevron}>{rankingOpen ? '▲' : '▼'}</span>
                </button>
                {rankingOpen && (
                  <div className={styles.rankingGrid}>
                    {Object.entries(RANKINGS).map(([program, ranks]) => (
                      <div key={program} className={styles.rankingProgram}>
                        <div className={styles.rankingProgramTitle}>{program}</div>
                        <div className={styles.pillGroup}>
                          {ranks.map(rank => (
                            <button key={rank} type="button"
                              className={`${styles.pill} ${styles.pillSmall} ${f.ranking.includes(rank) ? styles.pillActive : ''}`}
                              onClick={() => setFilter({ ranking: toggle(f.ranking, rank) })}>
                              {rank}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tags */}
              <div className={styles.filterBlock}>
                <label className={styles.filterLabel}>
                  Tags {f.tags.length > 0 && <span className={styles.rankingBadge}>{f.tags.length} selected</span>}
                </label>
                {availableTags.length > 0 && (
                  <div className={styles.pillGroup}>
                    {availableTags.map(tag => (
                      <button key={tag} type="button"
                        className={`${styles.pill} ${styles.pillSmall} ${f.tags.includes(tag) ? styles.pillActive : ''}`}
                        onClick={() => f.tags.includes(tag) ? handleRemoveTag(tag) : handleAddTag(tag)}>
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
                <div className={styles.tagInputRow}>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(tagInput); } }}
                    className={styles.input}
                    placeholder="Type a tag and press Enter or Add"
                  />
                  <button type="button" className={styles.tagAddBtn} onClick={() => handleAddTag(tagInput)}>Add</button>
                </div>
                {f.tags.length > 0 && (
                  <div className={styles.pillGroup} style={{ marginTop: 8 }}>
                    {f.tags.map(tag => (
                      <span key={tag} className={styles.tagChip}>
                        {tag}
                        <button type="button" className={styles.tagChipRemove} onClick={() => handleRemoveTag(tag)}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Live preview */}
              <div className={styles.previewBlock}>
                <div className={styles.previewHeader}>
                  <span className={styles.filterLabel} style={{ margin: 0 }}>Preview</span>
                  <span className={styles.previewCount}>
                    {previewLoading ? 'Updating...' : `${previewMembers.length} matching member${previewMembers.length === 1 ? '' : 's'}`}
                  </span>
                </div>
                {previewMembers.length === 0 ? (
                  <div className={styles.previewEmpty}>
                    {previewLoading ? 'Calculating...' : 'No members match these filters'}
                  </div>
                ) : (
                  <div className={styles.previewList}>
                    {previewMembers.slice(0, 50).map((member) => (
                      <div key={member.id} className={styles.previewItem}>
                        <span className={styles.previewName}>{member.firstName} {member.lastName}</span>
                        <span className={styles.previewMeta}>{member.email}{member.programType ? ` • ${member.programType}` : ''}</span>
                      </div>
                    ))}
                    {previewMembers.length > 50 && (
                      <div className={styles.previewMore}>+ {previewMembers.length - 50} more</div>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button type="button" onClick={() => setIsModalOpen(false)} className={styles.cancelBtn}>Cancel</button>
                <button type="submit" className={styles.saveBtn}>{editingId !== null ? 'Save Changes' : 'Create Audience'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Audiences;
