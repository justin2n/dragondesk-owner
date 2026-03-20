import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { Audience, AudienceFilter, Member, AccountStatus, AccountType, ProgramType, MembershipAge, LeadSource } from '../types';
import { DeleteIcon } from '../components/Icons';
import styles from './Audiences.module.css';

const RANKINGS = {
  BJJ: ['White', 'Blue', 'Purple', 'Brown', 'Black'],
  'Muay Thai': ['White', 'Green', 'Purple', 'Blue', 'Red'],
  Taekwondo: ['White', 'Yellow', 'Orange', 'Green', 'Purple', 'Blue', 'Red', 'Brown', 'Il Dan Bo', 'Black'],
};

const Audiences = () => {
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [selectedAudience, setSelectedAudience] = useState<Audience | null>(null);
  const [audienceMembers, setAudienceMembers] = useState<Member[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    filters: {
      accountStatus: [] as AccountStatus[],
      accountType: [] as AccountType[],
      programType: [] as ProgramType[],
      membershipAge: [] as MembershipAge[],
      ranking: [] as string[],
      leadSource: [] as LeadSource[],
      tags: [] as string[],
    },
  });

  useEffect(() => {
    loadAudiences();
  }, []);

  const loadAudiences = async () => {
    try {
      const data = await api.get('/audiences');
      const parsedAudiences = data.map((a: any) => ({
        ...a,
        filters: typeof a.filters === 'string' ? JSON.parse(a.filters) : a.filters,
      }));
      setAudiences(parsedAudiences);
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
    setFormData({
      name: '',
      description: '',
      filters: {
        accountStatus: [],
        accountType: [],
        programType: [],
        membershipAge: [],
        ranking: [],
        leadSource: [],
        tags: [],
      },
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/audiences', formData);
      setIsModalOpen(false);
      loadAudiences();
    } catch (error: any) {
      alert(error.message || 'Failed to create audience');
    }
  };

  const handleFilterChange = (category: keyof AudienceFilter, value: string) => {
    const currentValues = formData.filters[category] as string[];
    const newValues = currentValues.includes(value)
      ? currentValues.filter((v) => v !== value)
      : [...currentValues, value];

    setFormData({
      ...formData,
      filters: {
        ...formData.filters,
        [category]: newValues,
      },
    });
  };

  const handleDeleteAudience = async (id: number) => {
    if (!confirm('Are you sure you want to delete this audience?')) return;

    try {
      await api.delete(`/audiences/${id}`);
      if (selectedAudience?.id === id) {
        setSelectedAudience(null);
        setAudienceMembers([]);
      }
      loadAudiences();
    } catch (error: any) {
      alert(error.message || 'Failed to delete audience');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Audiences</h1>
          <p className={styles.subtitle}>Create targeted audiences for campaigns</p>
        </div>
        <button onClick={handleOpenModal} className={styles.addBtn}>
          + Create Audience
        </button>
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
                  className={`${styles.audienceItem} ${
                    selectedAudience?.id === audience.id ? styles.active : ''
                  }`}
                  onClick={() => handleSelectAudience(audience)}
                >
                  <div className={styles.audienceName}>{audience.name}</div>
                  <div className={styles.audienceDesc}>{audience.description}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAudience(audience.id);
                    }}
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
                <h2>{selectedAudience.name}</h2>
                <p>{selectedAudience.description}</p>
              </div>
              <div className={styles.membersSection}>
                <h3 className={styles.sectionTitle}>
                  Members in Audience ({audienceMembers.length})
                </h3>
                {audienceMembers.length === 0 ? (
                  <div className={styles.empty}>No members match this audience criteria</div>
                ) : (
                  <div className={styles.membersList}>
                    {audienceMembers.map((member) => (
                      <div key={member.id} className={styles.memberCard}>
                        <div className={styles.memberName}>
                          {member.firstName} {member.lastName}
                        </div>
                        <div className={styles.memberInfo}>
                          {member.email} • {member.programType} • {member.ranking}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={styles.placeholder}>
              <p>Select an audience to view its members</p>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>Create Audience</h2>
              <button onClick={() => setIsModalOpen(false)} className={styles.closeBtn}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Audience Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={styles.input}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={styles.textarea}
                  rows={3}
                />
              </div>

              <div className={styles.filterSection}>
                <h4>Audience Filters</h4>
                <p className={styles.filterDescription}>
                  Select criteria to build your target audience. All selected filters will be combined.
                </p>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Account Status</label>
                    <select
                      multiple
                      value={formData.filters.accountStatus || []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, option => option.value as AccountStatus);
                        setFormData({
                          ...formData,
                          filters: { ...formData.filters, accountStatus: selected }
                        });
                      }}
                      className={styles.multiSelect}
                      size={1}
                    >
                      <option value="lead">Lead</option>
                      <option value="trialer">Trialer</option>
                      <option value="member">Member</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <small className={styles.helpText}>Click to expand • Ctrl/Cmd for multiple</small>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Program Type</label>
                    <select
                      multiple
                      value={formData.filters.programType || []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, option => option.value as ProgramType);
                        setFormData({
                          ...formData,
                          filters: { ...formData.filters, programType: selected }
                        });
                      }}
                      className={styles.multiSelect}
                      size={1}
                    >
                      <option value="BJJ">Brazilian Jiu Jitsu</option>
                      <option value="Muay Thai">Muay Thai</option>
                      <option value="Taekwondo">Taekwondo</option>
                    </select>
                    <small className={styles.helpText}>Click to expand • Ctrl/Cmd for multiple</small>
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Age Group</label>
                    <select
                      multiple
                      value={formData.filters.membershipAge || []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, option => option.value as MembershipAge);
                        setFormData({
                          ...formData,
                          filters: { ...formData.filters, membershipAge: selected }
                        });
                      }}
                      className={styles.multiSelect}
                      size={1}
                    >
                      <option value="Adult">Adult</option>
                      <option value="Kids">Kids</option>
                    </select>
                    <small className={styles.helpText}>Click to expand • Ctrl/Cmd for multiple</small>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Account Type</label>
                    <select
                      multiple
                      value={formData.filters.accountType || []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, option => option.value as AccountType);
                        setFormData({
                          ...formData,
                          filters: { ...formData.filters, accountType: selected }
                        });
                      }}
                      className={styles.multiSelect}
                      size={1}
                    >
                      <option value="basic">Basic</option>
                      <option value="premium">Premium</option>
                      <option value="elite">Elite</option>
                      <option value="family">Family</option>
                    </select>
                    <small className={styles.helpText}>Click to expand • Ctrl/Cmd for multiple</small>
                  </div>
                </div>

                <div className={styles.rankingSection}>
                  <label className={styles.formLabel}>Ranking (by Program)</label>
                  <div className={styles.rankingGrid}>
                    <div className={styles.rankingProgram}>
                      <h5 className={styles.rankingProgramTitle}>BJJ</h5>
                      <select
                        multiple
                        value={formData.filters.ranking?.filter(r => RANKINGS.BJJ.includes(r)) || []}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions, option => option.value);
                          const otherRankings = formData.filters.ranking?.filter(r => !RANKINGS.BJJ.includes(r)) || [];
                          setFormData({
                            ...formData,
                            filters: { ...formData.filters, ranking: [...otherRankings, ...selected] }
                          });
                        }}
                        className={styles.rankingSelect}
                        size={1}
                      >
                        {RANKINGS.BJJ.map(rank => (
                          <option key={rank} value={rank}>{rank}</option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.rankingProgram}>
                      <h5 className={styles.rankingProgramTitle}>Muay Thai</h5>
                      <select
                        multiple
                        value={formData.filters.ranking?.filter(r => RANKINGS['Muay Thai'].includes(r)) || []}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions, option => option.value);
                          const otherRankings = formData.filters.ranking?.filter(r => !RANKINGS['Muay Thai'].includes(r)) || [];
                          setFormData({
                            ...formData,
                            filters: { ...formData.filters, ranking: [...otherRankings, ...selected] }
                          });
                        }}
                        className={styles.rankingSelect}
                        size={1}
                      >
                        {RANKINGS['Muay Thai'].map(rank => (
                          <option key={rank} value={rank}>{rank}</option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.rankingProgram}>
                      <h5 className={styles.rankingProgramTitle}>Taekwondo</h5>
                      <select
                        multiple
                        value={formData.filters.ranking?.filter(r => RANKINGS.Taekwondo.includes(r)) || []}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions, option => option.value);
                          const otherRankings = formData.filters.ranking?.filter(r => !RANKINGS.Taekwondo.includes(r)) || [];
                          setFormData({
                            ...formData,
                            filters: { ...formData.filters, ranking: [...otherRankings, ...selected] }
                          });
                        }}
                        className={styles.rankingSelect}
                        size={1}
                      >
                        {RANKINGS.Taekwondo.map(rank => (
                          <option key={rank} value={rank}>{rank}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <small className={styles.helpText}>Click to expand • Ctrl/Cmd for multiple ranks from any program</small>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Lead Source</label>
                  <select
                    multiple
                    value={formData.filters.leadSource || []}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, option => option.value as LeadSource);
                      setFormData({
                        ...formData,
                        filters: { ...formData.filters, leadSource: selected }
                      });
                    }}
                    className={styles.multiSelect}
                    size={1}
                  >
                    <option value="web_form">Web Form</option>
                    <option value="inbound_call">Inbound Call</option>
                    <option value="manual_add">Manual Add</option>
                    <option value="referral">Referral</option>
                    <option value="walk_in">Walk In</option>
                    <option value="social_media">Social Media</option>
                  </select>
                  <small className={styles.helpText}>Click to expand • Ctrl/Cmd for multiple</small>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" onClick={() => setIsModalOpen(false)} className={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" className={styles.saveBtn}>
                  Create Audience
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Audiences;
