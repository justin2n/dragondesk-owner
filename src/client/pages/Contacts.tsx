import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { Member, AccountStatus, AccountType, ProgramType, MembershipAge, LeadSource, Subscription, Invoice, PaymentMethod, PricingPlan } from '../types';
import { CardViewIcon, TableViewIcon, AddIcon, CheckIcon } from '../components/Icons';
import { useLocation } from '../contexts/LocationContext';
import StripeElements from '../components/StripeElements';
import BeltProgressionCard from '../components/BeltProgressionCard';
import QRCodeDisplay from '../components/QRCodeDisplay';
import styles from './Contacts.module.css';

const RANKINGS: Record<string, string[]> = {
  'No Program Selected': ['N/A'],
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

const Contacts = () => {
  const { selectedLocation, isAllLocations, locations } = useLocation();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [memberToCancel, setMemberToCancel] = useState<Member | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [viewingMember, setViewingMember] = useState<Member | null>(null);
  const [viewTab, setViewTab] = useState<'details' | 'billing' | 'attendance'>('details');
  const [memberQRCode, setMemberQRCode] = useState<{ qrCode: string; qrCodeData: string } | null>(null);
  const [memberCheckIns, setMemberCheckIns] = useState<any[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [memberSubscription, setMemberSubscription] = useState<Subscription | null>(null);
  const [memberPaymentMethods, setMemberPaymentMethods] = useState<PaymentMethod[]>([]);
  const [memberInvoices, setMemberInvoices] = useState<Invoice[]>([]);
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
  const [allPricingPlans, setAllPricingPlans] = useState<PricingPlan[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgram, setImportProgram] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [filters, setFilters] = useState({
    accountStatus: '',
    programType: '',
    membershipAge: '',
  });

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    accountStatus: 'lead' as AccountStatus,
    accountType: 'basic' as AccountType,
    programType: 'Adult BJJ' as ProgramType,
    membershipAge: 'Adult' as MembershipAge,
    ranking: 'White',
    leadSource: '' as LeadSource | '',
    dateOfBirth: '',
    emergencyContact: '',
    emergencyPhone: '',
    notes: '',
    tags: '',
    locationId: '',
    trialStartDate: '',
    memberStartDate: '',
    pricingPlanId: '' as string,
  });

  useEffect(() => {
    loadMembers();
  }, [filters, selectedLocation, isAllLocations]);

  useEffect(() => {
    api.get('/pricing-plans?isActive=true').then(setAllPricingPlans).catch(() => {});
  }, []);

  const loadMembers = async () => {
    try {
      const params = new URLSearchParams();
      const locationId = isAllLocations ? 'all' : selectedLocation?.id;
      if (locationId) params.append('locationId', locationId.toString());
      if (filters.accountStatus) params.append('accountStatus', filters.accountStatus);
      if (filters.programType) params.append('programType', filters.programType);
      if (filters.membershipAge) params.append('membershipAge', filters.membershipAge);

      const queryString = params.toString();
      const data = await api.get(`/members${queryString ? `?${queryString}` : ''}`);
      setMembers(data);
    } catch (error) {
      console.error('Failed to load members:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (member?: Member) => {
    if (member) {
      setEditingMember(member);
      setFormData({
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        phone: member.phone,
        accountStatus: member.accountStatus,
        accountType: member.accountType,
        programType: member.programType || 'No Program Selected',
        membershipAge: member.membershipAge,
        ranking: member.ranking,
        leadSource: member.leadSource || '',
        dateOfBirth: member.dateOfBirth || '',
        emergencyContact: member.emergencyContact || '',
        emergencyPhone: member.emergencyPhone || '',
        notes: member.notes || '',
        tags: member.tags || '',
        locationId: member.locationId?.toString() || '',
        trialStartDate: member.trialStartDate || '',
        memberStartDate: member.memberStartDate || '',
        pricingPlanId: member.pricingPlanId?.toString() || '',
      });
    } else {
      setEditingMember(null);
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        accountStatus: 'lead',
        accountType: 'basic',
        programType: 'Adult BJJ',
        membershipAge: 'Adult',
        ranking: 'White',
        leadSource: '',
        dateOfBirth: '',
        emergencyContact: '',
        emergencyPhone: '',
        notes: '',
        tags: '',
        locationId: '',
        trialStartDate: '',
        memberStartDate: '',
        pricingPlanId: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingMember(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if status is being changed to cancelled
    if (editingMember && formData.accountStatus === 'cancelled' && editingMember.accountStatus !== 'cancelled') {
      setMemberToCancel(editingMember);
      setShowCancelModal(true);
      return;
    }

    try {
      const dataToSubmit = {
        ...formData,
        locationId: formData.locationId ? parseInt(formData.locationId) : null,
        pricingPlanId: formData.pricingPlanId ? parseInt(formData.pricingPlanId) : null,
      };

      if (editingMember) {
        await api.put(`/members/${editingMember.id}`, dataToSubmit);
      } else {
        await api.post('/members', dataToSubmit);
      }
      handleCloseModal();
      loadMembers();
    } catch (error: any) {
      alert(error.message || 'Failed to save member');
    }
  };

  const handleCancelAccount = async () => {
    if (!memberToCancel) return;

    try {
      await api.put(`/members/${memberToCancel.id}`, {
        ...formData,
        accountStatus: 'cancelled',
      });

      // Record churn metric
      await api.post('/churn-metrics', {
        memberId: memberToCancel.id,
        firstName: memberToCancel.firstName,
        lastName: memberToCancel.lastName,
        email: memberToCancel.email,
        accountType: memberToCancel.accountType,
        programType: memberToCancel.programType,
        membershipAge: memberToCancel.membershipAge,
        cancellationReason: cancellationReason,
      });

      setShowCancelModal(false);
      setMemberToCancel(null);
      setCancellationReason('');
      handleCloseModal();
      loadMembers();
    } catch (error: any) {
      alert(error.message || 'Failed to cancel account');
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      if (importProgram) formData.append('program', importProgram);
      const locationId = isAllLocations ? '' : String(selectedLocation?.id || '');
      if (locationId) formData.append('locationId', locationId);

      const token = localStorage.getItem('token');
      const response = await fetch('/api/import-csv', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Import failed');
      setImportResult(result);
      loadMembers();
    } catch (err: any) {
      setImportResult({ error: err.message });
    } finally {
      setImportLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this member?')) return;

    try {
      await api.delete(`/members/${id}`);
      loadMembers();
    } catch (error: any) {
      alert(error.message || 'Failed to delete member');
    }
  };

  const handleViewMember = (member: Member) => {
    setViewingMember(member);
    setViewTab('details');
    loadMemberBillingData(member.id);
    loadMemberAttendanceData(member.id);
  };

  const handleCloseViewModal = () => {
    setViewingMember(null);
    setMemberSubscription(null);
    setMemberPaymentMethods([]);
    setMemberInvoices([]);
    setMemberQRCode(null);
    setMemberCheckIns([]);
    setShowAddPaymentModal(false);
    setShowSubscribeModal(false);
  };

  const loadMemberBillingData = async (memberId: number) => {
    setBillingLoading(true);
    try {
      const [subscriptions, paymentMethods, invoices, plans] = await Promise.all([
        api.get(`/subscriptions/member/${memberId}`),
        api.get(`/payment-methods/member/${memberId}`),
        api.get(`/invoices/member/${memberId}?limit=5`),
        api.get('/pricing-plans?isActive=true')
      ]);

      const activeSubscription = subscriptions?.find((s: Subscription) =>
        s.status === 'active' || s.status === 'trialing'
      );
      setMemberSubscription(activeSubscription || null);
      setMemberPaymentMethods(paymentMethods || []);
      setMemberInvoices(invoices || []);
      setPricingPlans(plans || []);
    } catch (error) {
      console.error('Failed to load billing data:', error);
    } finally {
      setBillingLoading(false);
    }
  };

  const loadMemberAttendanceData = async (memberId: number) => {
    setAttendanceLoading(true);
    try {
      const [qrCode, checkInsData] = await Promise.all([
        api.get(`/qr-codes/member/${memberId}`).catch(() => null),
        api.get(`/check-ins/member/${memberId}?limit=10`)
      ]);

      setMemberQRCode(qrCode);
      setMemberCheckIns(checkInsData?.checkIns || []);
    } catch (error) {
      console.error('Failed to load attendance data:', error);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleGenerateQRCode = async () => {
    if (!viewingMember) return;
    try {
      const qrCode = await api.post(`/qr-codes/generate/${viewingMember.id}`, {});
      setMemberQRCode(qrCode);
    } catch (error: any) {
      alert(error.message || 'Failed to generate QR code');
    }
  };

  const handleCreateSubscription = async () => {
    if (!viewingMember || !selectedPlanId) return;

    try {
      await api.post('/subscriptions', {
        memberId: viewingMember.id,
        pricingPlanId: selectedPlanId
      });
      loadMemberBillingData(viewingMember.id);
      setShowSubscribeModal(false);
      setSelectedPlanId(null);
    } catch (error: any) {
      alert(error.message || 'Failed to create subscription');
    }
  };

  const handleCancelSubscription = async (subscriptionId: number, immediately: boolean) => {
    const message = immediately
      ? 'Cancel immediately? The member will lose access right away.'
      : 'Cancel at end of billing period?';
    if (!confirm(message)) return;

    try {
      await api.post(`/subscriptions/${subscriptionId}/cancel`, { immediately });
      if (viewingMember) {
        loadMemberBillingData(viewingMember.id);
      }
    } catch (error: any) {
      alert(error.message || 'Failed to cancel subscription');
    }
  };

  const handlePaymentMethodAdded = () => {
    setShowAddPaymentModal(false);
    if (viewingMember) {
      loadMemberBillingData(viewingMember.id);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getLocationName = (locationId?: number) => {
    if (!locationId) return 'N/A';
    const location = locations.find(loc => loc.id === locationId);
    return location ? location.name : 'N/A';
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Contacts</h1>
          <p className={styles.subtitle}>Manage leads, trialers, and members</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.viewToggle}>
            <button
              onClick={() => setViewMode('card')}
              className={`${styles.viewBtn} ${viewMode === 'card' ? styles.active : ''}`}
              title="Card view"
            >
              <CardViewIcon size={20} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`${styles.viewBtn} ${viewMode === 'table' ? styles.active : ''}`}
              title="Table view"
            >
              <TableViewIcon size={20} />
            </button>
          </div>
          <button onClick={() => { setShowImportModal(true); setImportResult(null); setImportFile(null); }} className={styles.importBtn}>
            Import CSV
          </button>
          <button onClick={() => handleOpenModal()} className={styles.addBtn}>
            + Add Contact
          </button>
        </div>
      </div>

      <div className={styles.filters}>
        <select
          value={filters.accountStatus}
          onChange={(e) => setFilters({ ...filters, accountStatus: e.target.value })}
          className={styles.select}
        >
          <option value="">All Account Statuses</option>
          <option value="lead">Lead</option>
          <option value="trialer">Trialer</option>
          <option value="member">Member</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={filters.programType}
          onChange={(e) => setFilters({ ...filters, programType: e.target.value })}
          className={styles.select}
        >
          <option value="">All Programs</option>
          <option value="Children's Martial Arts">Children's Martial Arts</option>
          <option value="Adult BJJ">Adult BJJ</option>
          <option value="Adult TKD & HKD">Adult TKD & HKD</option>
          <option value="DG Barbell">DG Barbell</option>
          <option value="Adult Muay Thai & Kickboxing">Adult Muay Thai & Kickboxing</option>
          <option value="The Ashtanga Club">The Ashtanga Club</option>
          <option value="Dragon Gym Learning Center">Dragon Gym Learning Center</option>
          <option value="Kids BJJ">Kids BJJ</option>
          <option value="Kids Muay Thai">Kids Muay Thai</option>
          <option value="Young Ladies Yoga">Young Ladies Yoga</option>
          <option value="DG Workspace">DG Workspace</option>
          <option value="Dragon Launch">Dragon Launch</option>
          <option value="Personal Training">Personal Training</option>
          <option value="DGMT Private Training">DGMT Private Training</option>
        </select>

        <select
          value={filters.membershipAge}
          onChange={(e) => setFilters({ ...filters, membershipAge: e.target.value })}
          className={styles.select}
        >
          <option value="">All Ages</option>
          <option value="Adult">Adult</option>
          <option value="Kids">Kids</option>
        </select>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading members...</div>
      ) : members.length === 0 ? (
        <div className={styles.empty}>
          <p>No members found.</p>
          <p className={styles.emptyHint}>If you have members, check the location dropdown at the top — members are filtered by the selected location.</p>
        </div>
      ) : viewMode === 'card' ? (
        <div className={styles.grid}>
          {members.map((member) => (
            <div key={member.id} className={styles.card}>
              <div
                className={styles.cardHeader}
                onClick={() => handleViewMember(member)}
                style={{ cursor: 'pointer' }}
              >
                <h3 className={styles.cardTitle}>
                  {member.firstName} {member.lastName}
                </h3>
                <span className={`${styles.badge} ${styles[member.accountStatus]}`}>
                  {member.accountStatus}
                </span>
              </div>
              <div
                className={styles.cardBody}
                onClick={() => handleViewMember(member)}
                style={{ cursor: 'pointer' }}
              >
                <div className={styles.info}>
                  <span className={styles.label}>Email:</span>
                  <span>{member.email}</span>
                </div>
                <div className={styles.info}>
                  <span className={styles.label}>Phone:</span>
                  <span>{member.phone}</span>
                </div>
                <div className={styles.info}>
                  <span className={styles.label}>Program:</span>
                  <span>{member.programType}</span>
                </div>
                <div className={styles.info}>
                  <span className={styles.label}>Ranking:</span>
                  <span>{member.ranking}</span>
                </div>
                <div className={styles.info}>
                  <span className={styles.label}>Plan:</span>
                  <span>{allPricingPlans.find(p => p.id === member.pricingPlanId)?.name || '—'}</span>
                </div>
                <div className={styles.info}>
                  <span className={styles.label}>Age Group:</span>
                  <span>{member.membershipAge}</span>
                </div>
              </div>
              <div className={styles.cardFooter}>
                <button onClick={() => handleOpenModal(member)} className={styles.editBtn}>
                  Edit
                </button>
                <button onClick={() => handleDelete(member.id)} className={styles.deleteBtn}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Program</th>
                <th>Ranking</th>
                <th>Account</th>
                <th>Age</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} onClick={() => handleViewMember(member)} style={{ cursor: 'pointer' }}>
                  <td className={styles.nameCell}>
                    {member.firstName} {member.lastName}
                  </td>
                  <td>{member.email}</td>
                  <td>{member.phone}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[member.accountStatus]}`}>
                      {member.accountStatus}
                    </span>
                  </td>
                  <td>{member.programType}</td>
                  <td>{member.ranking}</td>
                  <td>{allPricingPlans.find(p => p.id === member.pricingPlanId)?.name || '—'}</td>
                  <td>{member.membershipAge}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className={styles.tableActions}>
                      <button onClick={() => handleOpenModal(member)} className={styles.editBtn}>
                        Edit
                      </button>
                      <button onClick={() => handleDelete(member.id)} className={styles.deleteBtn}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>{editingMember ? 'Edit Contact' : 'Add Contact'}</h2>
              <button onClick={handleCloseModal} className={styles.closeBtn}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>First Name *</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className={styles.input}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Last Name *</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className={styles.input}
                    required
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={styles.input}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Account Status *</label>
                  <select
                    value={formData.accountStatus}
                    onChange={(e) => setFormData({ ...formData, accountStatus: e.target.value as AccountStatus })}
                    className={styles.input}
                    required
                  >
                    <option value="lead">Lead</option>
                    <option value="trialer">Trialer</option>
                    <option value="member">Member</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Subscription Type</label>
                  <select
                    value={formData.pricingPlanId}
                    onChange={(e) => setFormData({ ...formData, pricingPlanId: e.target.value })}
                    className={styles.input}
                  >
                    <option value="">No plan selected</option>
                    {allPricingPlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} — ${(plan.amount / 100).toFixed(0)}/{plan.billingInterval}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Location</label>
                  <select
                    value={formData.locationId}
                    onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                    className={styles.input}
                  >
                    <option value="">Select a location (optional)</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Program *</label>
                  <select
                    value={formData.programType}
                    onChange={(e) => {
                      const newProgram = e.target.value as ProgramType;
                      setFormData({
                        ...formData,
                        programType: newProgram,
                        ranking: RANKINGS[newProgram]?.[0] || 'Beginner',
                      });
                    }}
                    className={styles.input}
                    required
                  >
                    <option value="No Program Selected">No Program Selected</option>
                    <option value="Children's Martial Arts">Children's Martial Arts</option>
                    <option value="Adult BJJ">Adult BJJ</option>
                    <option value="Adult TKD & HKD">Adult TKD & HKD</option>
                    <option value="DG Barbell">DG Barbell</option>
                    <option value="Adult Muay Thai & Kickboxing">Adult Muay Thai & Kickboxing</option>
                    <option value="The Ashtanga Club">The Ashtanga Club</option>
                    <option value="Dragon Gym Learning Center">Dragon Gym Learning Center</option>
                    <option value="Kids BJJ">Kids BJJ</option>
                    <option value="Kids Muay Thai">Kids Muay Thai</option>
                    <option value="Young Ladies Yoga">Young Ladies Yoga</option>
                    <option value="DG Workspace">DG Workspace</option>
                    <option value="Dragon Launch">Dragon Launch</option>
                    <option value="Personal Training">Personal Training</option>
                    <option value="DGMT Private Training">DGMT Private Training</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Ranking *</label>
                  <select
                    value={formData.ranking}
                    onChange={(e) => setFormData({ ...formData, ranking: e.target.value })}
                    className={styles.input}
                    required
                  >
                    {(RANKINGS[formData.programType] || ['N/A']).map((rank) => (
                      <option key={rank} value={rank}>
                        {rank}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Age Group *</label>
                  <select
                    value={formData.membershipAge}
                    onChange={(e) => setFormData({ ...formData, membershipAge: e.target.value as MembershipAge })}
                    className={styles.input}
                    required
                  >
                    <option value="Adult">Adult</option>
                    <option value="Kids">Kids</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Lead Source</label>
                  <select
                    value={formData.leadSource}
                    onChange={(e) => setFormData({ ...formData, leadSource: e.target.value as LeadSource })}
                    className={styles.input}
                  >
                    <option value="">Select source (optional)</option>
                    <option value="web_form">Web Form</option>
                    <option value="inbound_call">Inbound Call</option>
                    <option value="manual_add">Manual Add</option>
                    <option value="referral">Referral</option>
                    <option value="walk_in">Walk In</option>
                    <option value="social_media">Social Media</option>
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Date of Birth</label>
                  <input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className={styles.input}
                  />
                </div>
                <div className={styles.formGroup}></div>
              </div>

              {(formData.accountStatus === 'trialer' || formData.accountStatus === 'member') && (
                <div className={styles.formRow}>
                  {formData.accountStatus === 'trialer' && (
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Trial Start Date</label>
                      <input
                        type="date"
                        value={formData.trialStartDate}
                        onChange={(e) => setFormData({ ...formData, trialStartDate: e.target.value })}
                        className={styles.input}
                      />
                    </div>
                  )}
                  {formData.accountStatus === 'member' && (
                    <>
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Trial Start Date</label>
                        <input
                          type="date"
                          value={formData.trialStartDate}
                          onChange={(e) => setFormData({ ...formData, trialStartDate: e.target.value })}
                          className={styles.input}
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Member Start Date</label>
                        <input
                          type="date"
                          value={formData.memberStartDate}
                          onChange={(e) => setFormData({ ...formData, memberStartDate: e.target.value })}
                          className={styles.input}
                        />
                      </div>
                    </>
                  )}
                  {formData.accountStatus === 'trialer' && <div className={styles.formGroup}></div>}
                </div>
              )}

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Emergency Contact</label>
                  <input
                    type="text"
                    value={formData.emergencyContact}
                    onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                    className={styles.input}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Emergency Phone</label>
                  <input
                    type="tel"
                    value={formData.emergencyPhone}
                    onChange={(e) => setFormData({ ...formData, emergencyPhone: e.target.value })}
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tags (comma separated)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className={styles.input}
                  placeholder="e.g., vip, returning, interested-in-private-lessons"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className={styles.textarea}
                  rows={4}
                />
              </div>

              <div className={styles.modalFooter}>
                <button type="button" onClick={handleCloseModal} className={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" className={styles.saveBtn}>
                  {editingMember ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent} style={{ maxWidth: '520px' }}>
            <div className={styles.modalHeader}>
              <h2>Import from MyStudio CSV</h2>
              <button onClick={() => setShowImportModal(false)} className={styles.closeBtn}>&times;</button>
            </div>
            {!importResult ? (
              <div className={styles.form}>
                <p className={styles.importHint}>
                  Supports Lead, Trial, and Member exports from MyStudio. Duplicate emails are skipped automatically.
                </p>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>CSV File</label>
                  <input type="file" accept=".csv" className={styles.input} onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Program Override</label>
                  <select value={importProgram} onChange={(e) => setImportProgram(e.target.value)} className={styles.input}>
                    <option value="">Auto-detect from file</option>
                    <option value="Children's Martial Arts">Children's Martial Arts</option>
                    <option value="Adult BJJ">Adult BJJ</option>
                    <option value="Adult TKD & HKD">Adult TKD & HKD</option>
                    <option value="DG Barbell">DG Barbell</option>
                    <option value="Adult Muay Thai & Kickboxing">Adult Muay Thai & Kickboxing</option>
                    <option value="The Ashtanga Club">The Ashtanga Club</option>
                    <option value="Dragon Gym Learning Center">Dragon Gym Learning Center</option>
                    <option value="Kids BJJ">Kids BJJ</option>
                    <option value="Kids Muay Thai">Kids Muay Thai</option>
                    <option value="Young Ladies Yoga">Young Ladies Yoga</option>
                    <option value="DG Workspace">DG Workspace</option>
                    <option value="Dragon Launch">Dragon Launch</option>
                    <option value="Personal Training">Personal Training</option>
                    <option value="DGMT Private Training">DGMT Private Training</option>
                  </select>
                </div>
                <div className={styles.modalFooter}>
                  <button onClick={() => setShowImportModal(false)} className={styles.cancelBtn} type="button">Cancel</button>
                  <button onClick={handleImport} className={styles.saveBtn} disabled={!importFile || importLoading} type="button">
                    {importLoading ? 'Importing...' : 'Import'}
                  </button>
                </div>
              </div>
            ) : importResult.error ? (
              <div className={styles.form}>
                <div className={styles.importError}>{importResult.error}</div>
                <div className={styles.modalFooter}>
                  <button onClick={() => setImportResult(null)} className={styles.cancelBtn} type="button">Try Again</button>
                  <button onClick={() => setShowImportModal(false)} className={styles.saveBtn} type="button">Close</button>
                </div>
              </div>
            ) : (
              <div className={styles.form}>
                <div className={styles.importResults}>
                  <div className={styles.importResultRow}>
                    <span className={styles.importResultLabel}>Type detected</span>
                    <span className={styles.importResultValue}>{importResult.type}</span>
                  </div>
                  <div className={styles.importResultRow}>
                    <span className={styles.importResultLabel}>Total rows</span>
                    <span className={styles.importResultValue}>{importResult.total}</span>
                  </div>
                  <div className={styles.importResultRow}>
                    <span className={styles.importResultLabel}>Imported</span>
                    <span className={`${styles.importResultValue} ${styles.importSuccess}`}>{importResult.imported}</span>
                  </div>
                  <div className={styles.importResultRow}>
                    <span className={styles.importResultLabel}>Skipped</span>
                    <span className={styles.importResultValue}>{importResult.skipped}</span>
                  </div>
                  {importResult.errors > 0 && (
                    <div className={styles.importResultRow}>
                      <span className={styles.importResultLabel}>Errors</span>
                      <span className={`${styles.importResultValue} ${styles.importFailed}`}>{importResult.errors}</span>
                    </div>
                  )}
                  {importResult.duplicateCount > 0 && (
                    <div className={styles.importResultRow}>
                      <span className={styles.importResultLabel}>Duplicates</span>
                      <span className={`${styles.importResultValue} ${styles.importFailed}`}>{importResult.duplicateCount}</span>
                    </div>
                  )}
                </div>
                {importResult.duplicateList?.length > 0 && (
                  <div className={styles.duplicateList}>
                    <p className={styles.duplicateListTitle}>Duplicate records (already in system):</p>
                    {importResult.duplicateList.map((d: string, i: number) => (
                      <div key={i} className={styles.duplicateRow}>{d}</div>
                    ))}
                  </div>
                )}
                <div className={styles.modalFooter}>
                  <button onClick={() => { setImportResult(null); setImportFile(null); }} className={styles.cancelBtn} type="button">Import Another</button>
                  <button onClick={() => setShowImportModal(false)} className={styles.saveBtn} type="button">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {showCancelModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent} style={{ maxWidth: '500px' }}>
            <div className={styles.modalHeader}>
              <h2>Cancel Account</h2>
              <button onClick={() => setShowCancelModal(false)} className={styles.closeBtn}>
                ✕
              </button>
            </div>
            <div className={styles.form}>
              <p style={{ color: 'var(--color-text-primary)', marginBottom: '1rem' }}>
                Are you sure you want to cancel the account for <strong>{memberToCancel?.firstName} {memberToCancel?.lastName}</strong>?
              </p>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                This will mark their account as cancelled and record this in churn metrics.
              </p>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Cancellation Reason (Optional)</label>
                <textarea
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className={styles.textarea}
                  rows={4}
                  placeholder="e.g., Moving out of area, Financial reasons, Not satisfied with service..."
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  setMemberToCancel(null);
                  setCancellationReason('');
                }}
                className={styles.cancelBtn}
              >
                Keep Account Active
              </button>
              <button
                onClick={handleCancelAccount}
                className={styles.deleteBtn}
                style={{ flex: '0 0 auto', padding: '0.75rem 1.5rem' }}
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Member Modal */}
      {viewingMember && (
        <div className={styles.modal}>
          <div className={styles.modalContent} style={{ maxWidth: '800px' }}>
            <div className={styles.modalHeader}>
              <h2>{viewingMember.firstName} {viewingMember.lastName}</h2>
              <button onClick={handleCloseViewModal} className={styles.closeBtn}>
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className={styles.viewTabs}>
              <button
                className={`${styles.viewTab} ${viewTab === 'details' ? styles.active : ''}`}
                onClick={() => setViewTab('details')}
              >
                Details
              </button>
              <button
                className={`${styles.viewTab} ${viewTab === 'billing' ? styles.active : ''}`}
                onClick={() => setViewTab('billing')}
              >
                Billing
              </button>
              <button
                className={`${styles.viewTab} ${viewTab === 'attendance' ? styles.active : ''}`}
                onClick={() => setViewTab('attendance')}
              >
                Attendance
              </button>
            </div>

            <div className={styles.viewContent}>
              {/* Details Tab */}
              {viewTab === 'details' && (
              <div className={styles.viewSection}>
                <div className={styles.viewHeader}>
                  <div>
                    <span className={`${styles.badge} ${styles[viewingMember.accountStatus]}`}>
                      {viewingMember.accountStatus}
                    </span>
                  </div>
                </div>

                <div className={styles.viewGrid}>
                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Email</label>
                    <div className={styles.viewValue}>{viewingMember.email}</div>
                  </div>

                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Phone</label>
                    <div className={styles.viewValue}>{viewingMember.phone || 'N/A'}</div>
                  </div>

                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Subscription Type</label>
                    <div className={styles.viewValue}>{allPricingPlans.find(p => p.id === viewingMember.pricingPlanId)?.name || '—'}</div>
                  </div>

                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Program</label>
                    <div className={styles.viewValue}>{viewingMember.programType}</div>
                  </div>

                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Membership Age</label>
                    <div className={styles.viewValue}>{viewingMember.membershipAge}</div>
                  </div>

                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Ranking</label>
                    <div className={styles.viewValue}>{viewingMember.ranking}</div>
                  </div>

                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Location</label>
                    <div className={styles.viewValue}>{getLocationName(viewingMember.locationId)}</div>
                  </div>

                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Lead Source</label>
                    <div className={styles.viewValue}>
                      {viewingMember.leadSource ? viewingMember.leadSource.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'N/A'}
                    </div>
                  </div>

                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Date of Birth</label>
                    <div className={styles.viewValue}>{formatDate(viewingMember.dateOfBirth)}</div>
                  </div>

                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Trial Start Date</label>
                    <div className={styles.viewValue}>{formatDate(viewingMember.trialStartDate)}</div>
                  </div>

                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Member Start Date</label>
                    <div className={styles.viewValue}>{formatDate(viewingMember.memberStartDate)}</div>
                  </div>

                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Emergency Contact</label>
                    <div className={styles.viewValue}>{viewingMember.emergencyContact || 'N/A'}</div>
                  </div>

                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Emergency Phone</label>
                    <div className={styles.viewValue}>{viewingMember.emergencyPhone || 'N/A'}</div>
                  </div>

                  <div className={styles.viewField} style={{ gridColumn: '1 / -1' }}>
                    <label className={styles.viewLabel}>Tags</label>
                    <div className={styles.viewValue}>{viewingMember.tags || 'N/A'}</div>
                  </div>

                  <div className={styles.viewField} style={{ gridColumn: '1 / -1' }}>
                    <label className={styles.viewLabel}>Notes</label>
                    <div className={styles.viewValue}>{viewingMember.notes || 'N/A'}</div>
                  </div>

                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Created At</label>
                    <div className={styles.viewValue}>{formatDate(viewingMember.createdAt)}</div>
                  </div>

                  <div className={styles.viewField}>
                    <label className={styles.viewLabel}>Updated At</label>
                    <div className={styles.viewValue}>{formatDate(viewingMember.updatedAt)}</div>
                  </div>
                </div>
              </div>
              )}

              {/* Billing Tab */}
              {viewTab === 'billing' && (
                <div className={styles.viewSection}>
                  {billingLoading ? (
                    <div className={styles.billingLoading}>Loading billing info...</div>
                  ) : (
                    <>
                      {/* Current Subscription */}
                      <div className={styles.billingBlock}>
                        <h4 className={styles.billingTitle}>Subscription</h4>
                        {memberSubscription ? (
                          <div className={styles.subscriptionInfo}>
                            <div className={styles.subscriptionMain}>
                              <span className={styles.planName}>{memberSubscription.planName}</span>
                              <span className={styles.planPrice}>
                                {formatCurrency(memberSubscription.planAmount || 0)}/{memberSubscription.planInterval}
                              </span>
                            </div>
                            <div className={styles.subscriptionStatus}>
                              <span className={`${styles.statusBadge} ${styles[memberSubscription.status]}`}>
                                {memberSubscription.status}
                                {memberSubscription.cancelAtPeriodEnd && ' (canceling)'}
                              </span>
                              {memberSubscription.currentPeriodEnd && (
                                <span className={styles.nextBilling}>
                                  Next billing: {formatDate(memberSubscription.currentPeriodEnd)}
                                </span>
                              )}
                            </div>
                            <div className={styles.subscriptionActions}>
                              {!memberSubscription.cancelAtPeriodEnd && (
                                <button
                                  onClick={() => handleCancelSubscription(memberSubscription.id, false)}
                                  className={styles.actionBtnSmall}
                                >
                                  Cancel at End of Period
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className={styles.noSubscription}>
                            <p>No active subscription</p>
                            <button
                              onClick={() => setShowSubscribeModal(true)}
                              className={styles.addSubscriptionBtn}
                            >
                              <AddIcon size={16} /> Add Subscription
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Payment Methods */}
                      <div className={styles.billingBlock}>
                        <div className={styles.billingHeader}>
                          <h4 className={styles.billingTitle}>Payment Methods</h4>
                          <button
                            onClick={() => setShowAddPaymentModal(true)}
                            className={styles.addBtnSmall}
                          >
                            <AddIcon size={14} /> Add
                          </button>
                        </div>
                        {memberPaymentMethods.length > 0 ? (
                          <div className={styles.paymentMethodsList}>
                            {memberPaymentMethods.map(pm => (
                              <div key={pm.id} className={styles.paymentMethod}>
                                <div className={styles.cardInfo}>
                                  <span className={styles.cardBrand}>{pm.brand || pm.type}</span>
                                  <span className={styles.cardLast4}>•••• {pm.last4}</span>
                                  {pm.expMonth && pm.expYear && (
                                    <span className={styles.cardExpiry}>Exp {pm.expMonth}/{pm.expYear}</span>
                                  )}
                                </div>
                                {pm.isDefault && (
                                  <span className={styles.defaultBadge}>
                                    <CheckIcon size={12} /> Default
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.noPaymentMethods}>No payment methods on file</p>
                        )}
                      </div>

                      {/* Recent Invoices */}
                      <div className={styles.billingBlock}>
                        <h4 className={styles.billingTitle}>Recent Invoices</h4>
                        {memberInvoices.length > 0 ? (
                          <div className={styles.invoicesList}>
                            {memberInvoices.map(inv => (
                              <div key={inv.id} className={styles.invoiceItem}>
                                <div className={styles.invoiceMain}>
                                  <span className={styles.invoiceNumber}>
                                    {inv.invoiceNumber || `INV-${inv.id}`}
                                  </span>
                                  <span className={styles.invoiceAmount}>
                                    {formatCurrency(inv.amountDue, inv.currency)}
                                  </span>
                                </div>
                                <div className={styles.invoiceStatus}>
                                  <span className={`${styles.statusBadge} ${styles[inv.status]}`}>
                                    {inv.status}
                                  </span>
                                  <span className={styles.invoiceDate}>
                                    {formatDate(inv.createdAt)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.noInvoices}>No invoices yet</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Attendance Tab */}
              {viewTab === 'attendance' && (
                <div className={styles.viewSection}>
                  {attendanceLoading ? (
                    <div className={styles.billingLoading}>Loading attendance info...</div>
                  ) : (
                    <>
                      {/* Belt Progression */}
                      <div className={styles.billingBlock}>
                        <h4 className={styles.billingTitle}>Belt Progression</h4>
                        <BeltProgressionCard memberId={viewingMember.id} />
                      </div>

                      {/* QR Code */}
                      <div className={styles.billingBlock}>
                        <h4 className={styles.billingTitle}>Member QR Code</h4>
                        {memberQRCode ? (
                          <div className={styles.qrCodeSection}>
                            <QRCodeDisplay
                              qrCodeData={memberQRCode.qrCodeData}
                              memberName={`${viewingMember.firstName} ${viewingMember.lastName}`}
                              memberId={viewingMember.id}
                              size={180}
                              showDownload={true}
                              showWalletButtons={true}
                            />
                          </div>
                        ) : (
                          <div className={styles.noQRCode}>
                            <p>No QR code generated yet</p>
                            <button
                              onClick={handleGenerateQRCode}
                              className={styles.addSubscriptionBtn}
                            >
                              Generate QR Code
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Recent Check-ins */}
                      <div className={styles.billingBlock}>
                        <h4 className={styles.billingTitle}>Recent Check-ins</h4>
                        {memberCheckIns.length > 0 ? (
                          <div className={styles.checkInsList}>
                            {memberCheckIns.map((checkIn: any) => (
                              <div key={checkIn.id} className={styles.checkInItem}>
                                <div className={styles.checkInMain}>
                                  <span className={styles.checkInDate}>
                                    {new Date(checkIn.checkInTime).toLocaleDateString('en-US', {
                                      weekday: 'short',
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </span>
                                  <span className={styles.checkInTime}>
                                    {new Date(checkIn.checkInTime).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                                <div className={styles.checkInDetails}>
                                  {checkIn.locationName && (
                                    <span className={styles.checkInLocation}>{checkIn.locationName}</span>
                                  )}
                                  {checkIn.eventName && (
                                    <span className={styles.checkInEvent}>{checkIn.eventName}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.noInvoices}>No check-ins recorded yet</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button onClick={handleCloseViewModal} className={styles.cancelBtn}>
                Close
              </button>
              <button
                onClick={() => {
                  handleCloseViewModal();
                  handleOpenModal(viewingMember);
                }}
                className={styles.saveBtn}
              >
                Edit Contact
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Payment Method Modal */}
      {showAddPaymentModal && viewingMember && (
        <div className={styles.modal}>
          <div className={styles.modalContent} style={{ maxWidth: '500px' }}>
            <div className={styles.modalHeader}>
              <h2>Add Payment Method</h2>
              <button onClick={() => setShowAddPaymentModal(false)} className={styles.closeBtn}>
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <StripeElements
                memberId={viewingMember.id}
                onSuccess={handlePaymentMethodAdded}
                onCancel={() => setShowAddPaymentModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Subscribe Modal */}
      {showSubscribeModal && viewingMember && (
        <div className={styles.modal}>
          <div className={styles.modalContent} style={{ maxWidth: '500px' }}>
            <div className={styles.modalHeader}>
              <h2>Add Subscription</h2>
              <button onClick={() => setShowSubscribeModal(false)} className={styles.closeBtn}>
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Select a Plan</label>
                {pricingPlans.length > 0 ? (
                  <div className={styles.plansList}>
                    {pricingPlans.map(plan => (
                      <div
                        key={plan.id}
                        className={`${styles.planOption} ${selectedPlanId === plan.id ? styles.selected : ''}`}
                        onClick={() => setSelectedPlanId(plan.id)}
                      >
                        <div className={styles.planOptionMain}>
                          <span className={styles.planOptionName}>{plan.name}</span>
                          <span className={styles.planOptionPrice}>
                            {formatCurrency(plan.amount, plan.currency)}/{plan.billingInterval}
                          </span>
                        </div>
                        {plan.description && (
                          <p className={styles.planOptionDesc}>{plan.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.noPlansMsssage}>
                    No pricing plans available. Create plans in Settings first.
                  </p>
                )}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button onClick={() => setShowSubscribeModal(false)} className={styles.cancelBtn}>
                Cancel
              </button>
              <button
                onClick={handleCreateSubscription}
                className={styles.saveBtn}
                disabled={!selectedPlanId}
              >
                Subscribe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Contacts;
