import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../utils/api';
import { Member, ParticipantSummary, AccountStatus, AccountType, ProgramType, MembershipAge, LeadSource, Subscription, Invoice, PaymentMethod, PricingPlan } from '../types';
import { CardViewIcon, TableViewIcon, AddIcon, CheckIcon } from '../components/Icons';
import { useToast } from '../components/Toast';
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

const BULK_FIELD_LABELS: Record<string, string> = {
  accountStatus: 'Status',
  programType: 'Program',
  membershipAge: 'Age Group',
  ranking: 'Ranking',
  locationId: 'Location',
};

const BULK_VALUE_LABELS: Record<string, Record<string, string>> = {
  accountStatus: { lead: 'Lead', trialer: 'Trialer', member: 'Member', cancelled: 'Cancelled' },
  membershipAge: { Adult: 'Adult', Kids: 'Kids' },
};

const Contacts = () => {
  const { selectedLocation, isAllLocations, locations } = useLocation();
  const { toast, confirm } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkHandled = useRef(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [collapsedHolders, setCollapsedHolders] = useState<Set<number>>(new Set());
  const PAGE_SIZE = 60;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [memberToCancel, setMemberToCancel] = useState<Member | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [viewingMember, setViewingMember] = useState<Member | null>(null);
  const [viewTab, setViewTab] = useState<'details' | 'billing' | 'attendance' | 'history'>('details');
  const [memberHistory, setMemberHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [webActivity, setWebActivity] = useState<any[]>([]);
  const [webActivityLoading, setWebActivityLoading] = useState(false);
  const [memberQRCode, setMemberQRCode] = useState<{ qrCode: string; qrCodeData: string } | null>(null);
  const [memberCheckIns, setMemberCheckIns] = useState<any[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [memberSubscription, setMemberSubscription] = useState<Subscription | null>(null);
  const [memberPaymentMethods, setMemberPaymentMethods] = useState<PaymentMethod[]>([]);
  const [memberInvoices, setMemberInvoices] = useState<Invoice[]>([]);
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
  const [allPricingPlans, setAllPricingPlans] = useState<PricingPlan[]>([]);
  const [memberships, setMemberships] = useState<{ id: number; name: string; programs: { id: number; name: string }[] }[]>([]);
  const [programs, setPrograms] = useState<{ id: number; name: string; membershipId: number | null }[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importProgram, setImportProgram] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResults, setImportResults] = useState<any[]>([]);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [contactType, setContactType] = useState<'all' | 'account_holders' | 'participants'>('all');
  const [accountHolders, setAccountHolders] = useState<Member[]>([]);
  const [filters, setFilters] = useState({
    accountStatus: '',
    programType: '',
    membershipAge: '',
    search: '',
    sort: 'newest',
  });
  const [searchInput, setSearchInput] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkField, setBulkField] = useState('');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

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
    companyName: '',
    membershipId: '',
    membershipName: '',
    memberType: 'account_holder' as 'account_holder' | 'participant',
    accountHolderId: '' as string,
  });

  useEffect(() => {
    loadMembers();
  }, [filters, selectedLocation, isAllLocations, contactType]);

  useEffect(() => {
    const t = setTimeout(() => setFilters({ ...filters, search: searchInput }), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    api.get('/pricing-plans?isActive=true').then(setAllPricingPlans).catch(() => {});
    api.get('/memberships').then(setMemberships).catch(() => {});
    api.get('/programs').then(setPrograms).catch(() => {});
    api.get('/members?memberType=account_holder').then(setAccountHolders).catch(() => {});
  }, []);

  // Deep-link: ?member=<id> auto-opens the profile modal
  useEffect(() => {
    const targetId = searchParams.get('member');
    if (!targetId || deepLinkHandled.current) return;

    const open = (member: Member) => {
      deepLinkHandled.current = true;
      handleViewMember(member); // defaults to the 'details' tab
      // Optional ?tab= deep-link (e.g. from Pulse → open straight to History)
      const tab = searchParams.get('tab');
      if (tab === 'history') { setViewTab('history'); loadWebActivity(member.id); }
      else if (tab === 'attendance') { setViewTab('attendance'); loadMemberAttendanceData(member.id); }
      else if (tab === 'billing') { setViewTab('billing'); }
      setSearchParams({}, { replace: true });
    };

    const inList = members.find(m => m.id === parseInt(targetId));
    if (inList) {
      open(inList);
      return;
    }

    // Member may not be in the current filtered list — fetch directly
    api.get(`/members/${targetId}`).then(open).catch(() => {});
  }, [members, searchParams]);

  const loadMembers = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      const locationId = isAllLocations ? 'all' : selectedLocation?.id;
      if (locationId) params.append('locationId', locationId.toString());
      if (filters.accountStatus) params.append('accountStatus', filters.accountStatus);
      if (filters.programType) params.append('programType', filters.programType);
      if (filters.membershipAge) params.append('membershipAge', filters.membershipAge);
      if (filters.search) params.append('search', filters.search);
      if (filters.sort) params.append('sort', filters.sort);
      if (contactType === 'account_holders') params.append('memberType', 'account_holder');
      if (contactType === 'participants') params.append('memberType', 'participant');

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
        companyName: member.companyName || '',
        membershipId: (member as any).membershipId?.toString() || '',
        membershipName: (member as any).membershipName || '',
        memberType: (member.memberType as 'account_holder' | 'participant') || 'account_holder',
        accountHolderId: member.accountHolderId?.toString() || '',
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
        companyName: '',
        membershipId: '',
        membershipName: '',
        memberType: contactType === 'participants' ? 'participant' : 'account_holder',
        accountHolderId: '',
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
      const selectedMembership = memberships.find(m => m.id === parseInt(formData.membershipId));
      const dataToSubmit = {
        ...formData,
        locationId: formData.locationId ? parseInt(formData.locationId) : null,
        pricingPlanId: formData.pricingPlanId ? parseInt(formData.pricingPlanId) : null,
        membershipId: formData.membershipId ? parseInt(formData.membershipId) : null,
        membershipName: selectedMembership?.name || formData.membershipName || null,
      };

      if (editingMember) {
        await api.put(`/members/${editingMember.id}`, dataToSubmit);
      } else {
        await api.post('/members', dataToSubmit);
      }
      handleCloseModal();
      loadMembers();
      api.get('/members?memberType=account_holder').then(setAccountHolders).catch(() => {});
      toast(editingMember ? 'Contact updated successfully.' : 'Contact added successfully.', 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to save contact.', 'error');
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
      toast('Account cancelled and churn recorded.', 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to cancel account.', 'error');
    }
  };

  const handleImport = async (preview = false) => {
    if (!importFiles.length) return;
    setImportLoading(true);
    setImportResults([]);
    const locationId = isAllLocations ? '' : String(selectedLocation?.id || '');
    const results: any[] = [];

    for (let i = 0; i < importFiles.length; i++) {
      setImportProgress({ current: i + 1, total: importFiles.length });
      const file = importFiles[i];
      try {
        const formData = new FormData();
        formData.append('file', file);
        if (importProgram) formData.append('program', importProgram);
        if (locationId) formData.append('locationId', locationId);
        if (preview) formData.append('preview', 'true');
        // api.upload handles auth + token refresh on 401 (a raw fetch here was
        // sending a stale token and getting 401s that surfaced as "Failed to fetch").
        const result = await api.upload('/import-csv', formData);
        results.push({ fileName: file.name, ...result });
      } catch (err: any) {
        results.push({ fileName: file.name, error: err.message || 'Import failed' });
      }
    }

    setImportResults(results);
    setImportProgress(null);
    setImportLoading(false);
    if (!preview) loadMembers(); // preview writes nothing, so no need to refresh
  };

  const handleDelete = async (id: number) => {
    const member = members.find(m => m.id === id);
    const name = member ? `${member.firstName} ${member.lastName}` : 'this contact';
    const ok = await confirm({
      title: 'Delete Contact',
      message: `Are you sure you want to permanently delete ${name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    try {
      await api.delete(`/members/${id}`);
      loadMembers();
      toast(`${name} has been deleted.`, 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to delete contact.', 'error');
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === members.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(members.map(m => m.id)));
    }
  };

  const handleBulkUpdate = async () => {
    if (!bulkField || !bulkValue || selectedIds.size === 0) return;
    const fieldLabel = BULK_FIELD_LABELS[bulkField] || bulkField;
    const valueLabel = bulkField === 'locationId'
      ? (locations.find(l => String(l.id) === String(bulkValue))?.name ?? bulkValue)
      : (BULK_VALUE_LABELS[bulkField]?.[bulkValue] ?? bulkValue);
    const ok = await confirm({
      title: 'Bulk Update',
      message: `Update ${selectedIds.size} contact${selectedIds.size > 1 ? 's' : ''} — set ${fieldLabel} to "${valueLabel}"?`,
      confirmLabel: 'Apply',
    });
    if (!ok) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map(id => {
          const member = members.find(m => m.id === id)!;
          return api.put(`/members/${id}`, { ...member, [bulkField]: bulkValue });
        })
      );
      setSelectedIds(new Set());
      setBulkField('');
      setBulkValue('');
      loadMembers();
      toast(`${selectedIds.size} contact${selectedIds.size > 1 ? 's' : ''} updated — ${fieldLabel} set to "${valueLabel}".`, 'success');
    } catch (err: any) {
      toast(err.message || 'Bulk update failed.', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({
      title: 'Delete Contacts',
      message: `Permanently delete ${selectedIds.size} contact${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setBulkLoading(true);
    const count = selectedIds.size;
    try {
      await Promise.all(Array.from(selectedIds).map(id => api.delete(`/members/${id}`)));
      setSelectedIds(new Set());
      loadMembers();
      toast(`${count} contact${count > 1 ? 's' : ''} deleted.`, 'success');
    } catch (err: any) {
      toast(err.message || 'Bulk delete failed.', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const loadMemberHistory = async (memberId: number) => {
    setHistoryLoading(true);
    try {
      const data = await api.get(`/members/${memberId}/history`);
      setMemberHistory(data);
    } catch {
      setMemberHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadWebActivity = async (memberId: number) => {
    setWebActivityLoading(true);
    try {
      const data = await api.get(`/members/${memberId}/web-activity`);
      setWebActivity(Array.isArray(data) ? data : []);
    } catch {
      setWebActivity([]);
    } finally {
      setWebActivityLoading(false);
    }
  };

  const handleViewMember = (member: Member) => {
    setViewingMember(member);
    setViewTab('details');
    loadMemberBillingData(member.id);
    loadMemberAttendanceData(member.id);
    loadMemberHistory(member.id);
  };

  const handleCloseViewModal = () => {
    setViewingMember(null);
    setMemberSubscription(null);
    setMemberPaymentMethods([]);
    setMemberInvoices([]);
    setMemberQRCode(null);
    setMemberCheckIns([]);
    setAttendanceError(null);
    setShowAddPaymentModal(false);
    setShowSubscribeModal(false);
    setWebActivity([]);
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
    setAttendanceError(null);
    try {
      const qrCode = await api.get(`/qr-codes/member/${memberId}`).catch(() => null);
      setMemberQRCode(qrCode);
    } catch {}
    try {
      const checkInsData = await api.get(`/check-ins?memberId=${memberId}&limit=50`);
      setMemberCheckIns(Array.isArray(checkInsData) ? checkInsData : (checkInsData?.checkIns || []));
    } catch (error: any) {
      console.error('Failed to load check-ins:', error);
      setAttendanceError(error?.message || 'Failed to load check-in history');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleGenerateQRCode = async () => {
    if (!viewingMember) return;
    try {
      const qrCode = await api.post(`/qr-codes/generate/${viewingMember.id}`, {});
      setMemberQRCode(qrCode);
      toast('QR code generated.', 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to generate QR code.', 'error');
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
      toast('Subscription created successfully.', 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to create subscription.', 'error');
    }
  };

  const handleCancelSubscription = async (subscriptionId: number, immediately: boolean) => {
    const ok = await confirm({
      title: 'Cancel Subscription',
      message: immediately
        ? 'Cancel immediately? The member will lose access right away.'
        : 'Cancel at the end of the current billing period?',
      confirmLabel: 'Yes, Cancel',
      danger: true,
    });
    if (!ok) return;

    try {
      await api.post(`/subscriptions/${subscriptionId}/cancel`, { immediately });
      if (viewingMember) loadMemberBillingData(viewingMember.id);
      toast(immediately ? 'Subscription cancelled immediately.' : 'Subscription will cancel at period end.', 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to cancel subscription.', 'error');
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

  const typeLabel = contactType === 'account_holders' ? 'Account Holders'
    : contactType === 'participants' ? 'Participants' : 'All Contacts';

  // Group participants under their account holder for nested/stacked display.
  // Participants whose holder isn't in the current (filtered) view are shown
  // standalone so nothing is hidden.
  const groupedMembers = useMemo(() => {
    const holders = members.filter(m => m.memberType !== 'participant');
    const holderIds = new Set(holders.map(h => h.id));
    const byHolder = new Map<number, Member[]>();
    const orphans: Member[] = [];
    for (const m of members) {
      if (m.memberType !== 'participant') continue;
      const ahId = m.accountHolderId ?? null;
      if (ahId != null && holderIds.has(ahId)) {
        const arr = byHolder.get(ahId) || [];
        arr.push(m);
        byHolder.set(ahId, arr);
      } else {
        orphans.push(m);
      }
    }
    const groups: { holder: Member | null; participants: Member[] }[] =
      holders.map(h => ({ holder: h, participants: byHolder.get(h.id) || [] }));
    // Each orphan participant is its own group so progressive rendering windows
    // them individually (e.g. the Participants tab, which is all orphans).
    for (const o of orphans) groups.push({ holder: null, participants: [o] });
    return groups;
  }, [members]);

  const collapsibleHolderIds = useMemo(
    () => groupedMembers.filter(g => g.holder && g.participants.length > 0).map(g => g.holder!.id),
    [groupedMembers],
  );
  const allCollapsed = collapsibleHolderIds.length > 0 && collapsibleHolderIds.every(id => collapsedHolders.has(id));
  const toggleHolderCollapse = (id: number) =>
    setCollapsedHolders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAllCollapse = () =>
    setCollapsedHolders(allCollapsed ? new Set() : new Set(collapsibleHolderIds));

  // Progressive rendering: only mount the first N holder groups, then grow as
  // the user scrolls near the bottom. Keeps initial DOM small on big lists.
  const visibleGroups = useMemo(() => groupedMembers.slice(0, visibleCount), [groupedMembers, visibleCount]);
  const hasMoreGroups = visibleCount < groupedMembers.length;
  // Reset the window whenever the underlying list changes (filter/search/sort/location).
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [members]);
  useEffect(() => {
    if (!hasMoreGroups) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisibleCount((c) => Math.min(c + PAGE_SIZE, groupedMembers.length)); },
      { rootMargin: '800px' },
    );
    io.observe(el);
    return () => io.disconnect();
    // visibleCount in deps: re-observe after each page so we keep loading while
    // the sentinel remains in view (IO won't re-fire if it never leaves view).
  }, [hasMoreGroups, groupedMembers.length, visibleCount]);

  // O(1) lookups so per-row rendering doesn't scan these lists for every member.
  const pricingPlanById = useMemo(() => {
    const m = new Map<number, PricingPlan>();
    for (const p of allPricingPlans) m.set(p.id, p);
    return m;
  }, [allPricingPlans]);
  const accountHolderById = useMemo(() => {
    const m = new Map<number, Member>();
    for (const ah of accountHolders) m.set(ah.id, ah);
    return m;
  }, [accountHolders]);
  const planName = (id?: number | null) => (id != null ? pricingPlanById.get(id)?.name : undefined) || '—';

  const renderMemberCard = (member: Member, stacked = false) => (
    <div
      key={member.id}
      className={`${styles.card} ${member.memberType === 'participant' ? styles.participantCard : ''} ${stacked ? styles.stackedCard : ''}`}
    >
      <div className={styles.cardHeader} onClick={() => handleViewMember(member)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h3 className={styles.cardTitle}>{member.firstName} {member.lastName}</h3>
          {member.memberType === 'participant' && (
            <span className={styles.memberTypeChip}>Participant</span>
          )}
        </div>
        <span className={`${styles.badge} ${styles[member.accountStatus]}`}>{member.accountStatus}</span>
      </div>
      <div className={styles.cardBody} onClick={() => handleViewMember(member)} style={{ cursor: 'pointer' }}>
        {member.memberType !== 'participant' && member.email && (
          <div className={styles.info}><span className={styles.label}>Email:</span><span>{member.email}</span></div>
        )}
        {member.memberType !== 'participant' && (
          <div className={styles.info}><span className={styles.label}>Phone:</span><span>{member.phone || '—'}</span></div>
        )}
        {member.memberType === 'participant' && !stacked && (
          <div className={styles.info}>
            <span className={styles.label}>Account Holder:</span>
            <span>{(() => {
              const ah = member.accountHolderId != null ? accountHolderById.get(member.accountHolderId) : undefined;
              return ah ? `${ah.firstName} ${ah.lastName}` : '—';
            })()}</span>
          </div>
        )}
        <div className={styles.info}><span className={styles.label}>Program:</span><span>{member.programType || '—'}</span></div>
        <div className={styles.info}><span className={styles.label}>Ranking:</span><span>{member.ranking}</span></div>
        {member.memberType !== 'participant' && (
          <div className={styles.info}><span className={styles.label}>Plan:</span><span>{planName(member.pricingPlanId)}</span></div>
        )}
        <div className={styles.info}><span className={styles.label}>Age Group:</span><span>{member.membershipAge}</span></div>
      </div>
      <div className={styles.cardFooter}>
        <button onClick={() => handleOpenModal(member)} className={styles.editBtn}>Edit</button>
        <button onClick={() => handleDelete(member.id)} className={styles.deleteBtn}>Delete</button>
      </div>
    </div>
  );

  const renderMemberRow = (
    member: Member,
    isChild = false,
    holderToggle?: { count: number; collapsed: boolean; onToggle: () => void },
  ) => (
    <tr
      key={member.id}
      onClick={() => handleViewMember(member)}
      style={{ cursor: 'pointer' }}
      className={`${selectedIds.has(member.id) ? styles.selectedRow : ''} ${isChild ? styles.childRow : ''}`}
    >
      <td onClick={e => e.stopPropagation()} className={styles.checkboxCol}>
        <input type="checkbox" checked={selectedIds.has(member.id)} onChange={() => toggleSelect(member.id)} />
      </td>
      <td className={`${styles.nameCell} ${isChild ? styles.childName : ''}`}>
        {holderToggle && (
          <button
            type="button"
            className={styles.rowToggle}
            onClick={(e) => { e.stopPropagation(); holderToggle.onToggle(); }}
            aria-label={holderToggle.collapsed ? 'Expand participants' : 'Collapse participants'}
          >
            <span className={`${styles.chev} ${holderToggle.collapsed ? styles.chevCollapsed : ''}`} />
          </button>
        )}
        {isChild && <span className={styles.treeBranch}>↳</span>}
        {member.firstName} {member.lastName}
        {member.memberType === 'participant' && <span className={styles.memberTypeChip} style={{ marginLeft: 8 }}>Participant</span>}
        {holderToggle && <span className={styles.countBadge}>{holderToggle.count}</span>}
      </td>
      <td>{member.email}</td>
      <td>{member.phone}</td>
      <td><span className={`${styles.badge} ${styles[member.accountStatus]}`}>{member.accountStatus}</span></td>
      <td>{member.programType}</td>
      <td>{member.ranking}</td>
      <td>{planName(member.pricingPlanId)}</td>
      <td>{member.membershipAge}</td>
      <td onClick={(e) => e.stopPropagation()}>
        <div className={styles.tableActions}>
          <button onClick={() => handleOpenModal(member)} className={styles.editBtn}>Edit</button>
          <button onClick={() => handleDelete(member.id)} className={styles.deleteBtn}>Delete</button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Contacts</h1>
          <p className={styles.subtitle}>Manage leads, trialers, and members</p>
        </div>
        <div className={styles.headerActions}>
          <input
            type="text"
            placeholder="Search by name, email, or phone…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className={styles.searchInput}
          />
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
          {collapsibleHolderIds.length > 0 && (
            <button onClick={toggleAllCollapse} className={styles.collapseAllBtn} type="button">
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          )}
          <button onClick={() => { setShowImportModal(true); setImportResults([]); setImportFiles([]); }} className={styles.importBtn}>
            Import CSV
          </button>
          <button onClick={() => handleOpenModal()} className={styles.addBtn}>
            + Add Contact
          </button>
        </div>
      </div>

      <div className={styles.typeTabs}>
        {(['all', 'account_holders', 'participants'] as const).map(t => (
          <button
            key={t}
            className={`${styles.typeTab} ${contactType === t ? styles.typeTabActive : ''}`}
            onClick={() => setContactType(t)}
          >
            {t === 'all' ? 'All' : t === 'account_holders' ? 'Account Holders' : 'Participants'}
          </button>
        ))}
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
          {programs.map(p => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
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

        <select
          value={filters.sort}
          onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
          className={styles.select}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="name_az">Name A–Z</option>
          <option value="name_za">Name Z–A</option>
          <option value="status">Status</option>
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
          {visibleGroups.map((group) => {
            if (!group.holder) {
              // Orphan participants (account holder not in the current view)
              return group.participants.map((p) => renderMemberCard(p));
            }
            const hasParticipants = group.participants.length > 0;
            const collapsed = collapsedHolders.has(group.holder.id);
            return (
              <div key={`h${group.holder.id}`} className={hasParticipants ? styles.cardStack : undefined}>
                {renderMemberCard(group.holder)}
                {hasParticipants && (
                  <button type="button" className={styles.stackToggle} onClick={() => toggleHolderCollapse(group.holder!.id)}>
                    <span className={`${styles.chev} ${collapsed ? styles.chevCollapsed : ''}`} />
                    {collapsed ? 'Show' : 'Hide'} {group.participants.length} participant{group.participants.length > 1 ? 's' : ''}
                  </button>
                )}
                {hasParticipants && !collapsed && group.participants.map((p) => renderMemberCard(p, true))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.tableContainer}>
          {selectedIds.size > 0 && (
            <div className={styles.bulkBar}>
              <span className={styles.bulkCount}>{selectedIds.size} selected</span>
              <select
                value={bulkField}
                onChange={e => { setBulkField(e.target.value); setBulkValue(''); }}
                className={styles.bulkSelect}
              >
                <option value="">Change field...</option>
                <option value="accountStatus">Status</option>
                <option value="programType">Program</option>
                <option value="membershipAge">Age Group</option>
                <option value="ranking">Ranking</option>
                <option value="locationId">Location</option>
              </select>
              {bulkField === 'accountStatus' && (
                <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className={styles.bulkSelect}>
                  <option value="">Select status...</option>
                  <option value="lead">Lead</option>
                  <option value="trialer">Trialer</option>
                  <option value="member">Member</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              )}
              {bulkField === 'programType' && (
                <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className={styles.bulkSelect}>
                  <option value="">Select program...</option>
                  {Object.keys(RANKINGS).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
              {bulkField === 'membershipAge' && (
                <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className={styles.bulkSelect}>
                  <option value="">Select age group...</option>
                  <option value="Adult">Adult</option>
                  <option value="Kids">Kids</option>
                </select>
              )}
              {bulkField === 'ranking' && (
                <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className={styles.bulkSelect}>
                  <option value="">Select ranking...</option>
                  {(RANKINGS['Adult BJJ']).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
              {bulkField === 'locationId' && (
                <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className={styles.bulkSelect}>
                  <option value="">Select location...</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
              <button
                className={styles.bulkApplyBtn}
                onClick={handleBulkUpdate}
                disabled={bulkLoading || !bulkField || !bulkValue}
              >
                {bulkLoading ? 'Applying...' : 'Apply'}
              </button>
              <button
                className={styles.bulkDeleteBtn}
                onClick={handleBulkDelete}
                disabled={bulkLoading}
              >
                Delete Selected
              </button>
              <button className={styles.bulkCancelBtn} onClick={() => setSelectedIds(new Set())}>
                Clear
              </button>
            </div>
          )}
          <table className={styles.table}>
            <thead>
              <tr>
                <th onClick={e => e.stopPropagation()} className={styles.checkboxCol}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === members.length && members.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
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
              {visibleGroups.map((group) => {
                const collapsed = group.holder ? collapsedHolders.has(group.holder.id) : false;
                const hasParticipants = group.participants.length > 0;
                return (
                  <React.Fragment key={group.holder ? `h${group.holder.id}` : `o${group.participants[0]?.id ?? 'x'}`}>
                    {group.holder && renderMemberRow(
                      group.holder,
                      false,
                      hasParticipants
                        ? { count: group.participants.length, collapsed, onToggle: () => toggleHolderCollapse(group.holder!.id) }
                        : undefined,
                    )}
                    {!collapsed && group.participants.map((p) => renderMemberRow(p, !!group.holder))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasMoreGroups && (
        <div ref={sentinelRef} className={styles.loadMore}>
          <button
            type="button"
            className={styles.loadMoreBtn}
            onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, groupedMembers.length))}
          >
            Load more
          </button>
          <span className={styles.loadMoreHint}>
            Showing {visibleGroups.length} of {groupedMembers.length}
          </span>
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

              {/* Member type toggle */}
              {!editingMember && (
                <div className={styles.memberTypeToggle}>
                  <button
                    type="button"
                    className={`${styles.memberTypeToggleBtn} ${formData.memberType === 'account_holder' ? styles.memberTypeToggleBtnActive : ''}`}
                    onClick={() => setFormData({ ...formData, memberType: 'account_holder', accountHolderId: '' })}
                  >
                    Account Holder
                  </button>
                  <button
                    type="button"
                    className={`${styles.memberTypeToggleBtn} ${formData.memberType === 'participant' ? styles.memberTypeToggleBtnActive : ''}`}
                    onClick={() => setFormData({ ...formData, memberType: 'participant' })}
                  >
                    Participant
                  </button>
                </div>
              )}

              {/* Account Holder picker — shown only for participants */}
              {formData.memberType === 'participant' && (
                <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                  <label className={styles.formLabel}>Account Holder</label>
                  <select
                    value={formData.accountHolderId}
                    onChange={(e) => setFormData({ ...formData, accountHolderId: e.target.value })}
                    className={styles.input}
                  >
                    <option value="">— Select account holder —</option>
                    {accountHolders.map(ah => (
                      <option key={ah.id} value={ah.id}>
                        {ah.firstName} {ah.lastName}{ah.email ? ` (${ah.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                  <label className={styles.formLabel}>Company / Studio Name</label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className={styles.input}
                    placeholder="e.g. Elite BJJ Academy"
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    Email {formData.memberType !== 'participant' ? '*' : ''}
                    {formData.memberType === 'participant' && <span style={{ color: 'var(--text-secondary)', fontSize: '0.8em', marginLeft: 4 }}>(optional for participants)</span>}
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={styles.input}
                    required={formData.memberType !== 'participant'}
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

              {memberships.length > 0 && (
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Membership</label>
                    <select
                      value={formData.membershipId}
                      onChange={(e) => setFormData({ ...formData, membershipId: e.target.value, programType: 'No Program Selected' })}
                      className={styles.input}
                    >
                      <option value="">No membership</option>
                      {memberships.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

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
                    {(formData.membershipId
                      ? programs.filter(p => p.membershipId === parseInt(formData.membershipId))
                      : programs
                    ).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                    {programs.length === 0 && <>
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
                    </>}
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
          <div className={styles.modalContent} style={{ maxWidth: '600px' }}>
            <div className={styles.modalHeader}>
              <h2>Import from MyStudio CSV</h2>
              <button onClick={() => setShowImportModal(false)} className={styles.closeBtn}>&times;</button>
            </div>

            {importResults.length === 0 ? (
              <div className={styles.form}>
                <p className={styles.importHint}>
                  Select one or more CSV exports (Leads, Trials, Members, or Student Details). Each file is processed in order — duplicates are upgraded automatically. Student Details links participants to their account holder and refreshes contact info without overwriting program, rank, or status.
                </p>

                {/* Drop zone / file picker */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>CSV Files</label>
                  <label className={styles.importDropZone}>
                    <input
                      type="file"
                      accept=".csv"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const picked = Array.from(e.target.files || []);
                        setImportFiles(prev => {
                          const existing = new Set(prev.map(f => f.name));
                          return [...prev, ...picked.filter(f => !existing.has(f.name))];
                        });
                        e.target.value = '';
                      }}
                    />
                    <span className={styles.importDropIcon}>📂</span>
                    <span className={styles.importDropText}>Click to select files</span>
                    <span className={styles.importDropHint}>Hold Ctrl/Cmd to select multiple at once</span>
                  </label>
                </div>

                {/* File queue */}
                {importFiles.length > 0 && (
                  <div className={styles.importQueue}>
                    {importFiles.map((file, i) => (
                      <div key={i} className={styles.importQueueItem}>
                        <span className={styles.importQueueIcon}>📄</span>
                        <span className={styles.importQueueName}>{file.name}</span>
                        <span className={styles.importQueueSize}>{(file.size / 1024).toFixed(1)} KB</span>
                        {importLoading && importProgress && importProgress.current === i + 1 ? (
                          <span className={styles.importQueueStatus}>⏳ Importing…</span>
                        ) : importLoading && importProgress && importProgress.current > i + 1 ? (
                          <span className={styles.importQueueStatusDone}>✓</span>
                        ) : (
                          <button
                            type="button"
                            className={styles.importQueueRemove}
                            onClick={() => setImportFiles(prev => prev.filter((_, idx) => idx !== i))}
                          >✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Progress bar */}
                {importLoading && importProgress && (
                  <div className={styles.importProgressWrap}>
                    <div className={styles.importProgressBar}>
                      <div
                        className={styles.importProgressFill}
                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                      />
                    </div>
                    <span className={styles.importProgressLabel}>
                      Processing file {importProgress.current} of {importProgress.total}…
                    </span>
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Program Override <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>(optional — applies to all files)</span></label>
                  <select value={importProgram} onChange={(e) => setImportProgram(e.target.value)} className={styles.input}>
                    <option value="">Auto-detect from each file</option>
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
                  <button onClick={() => handleImport(true)} className={styles.cancelBtn} disabled={!importFiles.length || importLoading} type="button">
                    {importLoading ? 'Working…' : 'Preview changes'}
                  </button>
                  <button onClick={() => handleImport(false)} className={styles.saveBtn} disabled={!importFiles.length || importLoading} type="button">
                    {importLoading
                      ? `Importing ${importProgress?.current ?? 1} of ${importProgress?.total ?? importFiles.length}…`
                      : `Import ${importFiles.length > 0 ? `${importFiles.length} File${importFiles.length > 1 ? 's' : ''}` : ''}`}
                  </button>
                </div>
              </div>
            ) : (
              /* Results view */
              <div className={styles.form}>
                {importResults.some(r => r.preview) && (
                  <p className={styles.importHint}>
                    <strong>Preview only — nothing was saved.</strong> These are the changes that would be made if you import. Review the counts below, then click <strong>Apply import</strong> to commit.
                  </p>
                )}
                {/* Aggregate totals */}
                {importResults.length > 1 && (() => {
                  const totals = importResults.reduce((acc, r) => ({
                    total: acc.total + (r.total || 0),
                    imported: acc.imported + (r.imported || 0),
                    skipped: acc.skipped + (r.skipped || 0),
                    upgraded: acc.upgraded + (r.upgraded || 0),
                    errors: acc.errors + (r.errors || 0),
                  }), { total: 0, imported: 0, skipped: 0, upgraded: 0, errors: 0 });
                  return (
                    <div className={styles.importTotals}>
                      <div className={styles.importTotalsTitle}>Total across {importResults.length} files</div>
                      <div className={styles.importTotalsRow}>
                        <div className={styles.importTotalStat}>
                          <span className={styles.importTotalNum}>{totals.total}</span>
                          <span className={styles.importTotalLbl}>Rows</span>
                        </div>
                        <div className={styles.importTotalStat}>
                          <span className={`${styles.importTotalNum} ${styles.importSuccess}`}>{totals.imported}</span>
                          <span className={styles.importTotalLbl}>Imported</span>
                        </div>
                        {totals.upgraded > 0 && (
                          <div className={styles.importTotalStat}>
                            <span className={`${styles.importTotalNum} ${styles.importUpgraded}`}>{totals.upgraded}</span>
                            <span className={styles.importTotalLbl}>Upgraded</span>
                          </div>
                        )}
                        <div className={styles.importTotalStat}>
                          <span className={styles.importTotalNum}>{totals.skipped}</span>
                          <span className={styles.importTotalLbl}>Skipped</span>
                        </div>
                        {totals.errors > 0 && (
                          <div className={styles.importTotalStat}>
                            <span className={`${styles.importTotalNum} ${styles.importFailed}`}>{totals.errors}</span>
                            <span className={styles.importTotalLbl}>Errors</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Per-file results */}
                <div className={styles.importFileResults}>
                  {importResults.map((r, i) => (
                    <div key={i} className={`${styles.importFileResult} ${r.error ? styles.importFileResultError : ''}`}>
                      <div className={styles.importFileResultName}>
                        <span>{r.error ? '✕' : '✓'}</span>
                        <span>{r.fileName}</span>
                        {r.type && <span className={styles.importTypeBadge}>{r.type}</span>}
                      </div>
                      {r.error ? (
                        <div className={styles.importError}>{r.error}</div>
                      ) : (
                        <>
                          <div className={styles.importFileResultStats}>
                            <span>{r.total} rows</span>
                            <span className={styles.importSuccess}>{r.imported} imported</span>
                            {r.upgraded > 0 && <span className={styles.importUpgraded}>{r.upgraded} upgraded</span>}
                            {r.skipped > 0 && <span>{r.skipped} skipped</span>}
                            {r.errors > 0 && <span className={styles.importFailed}>{r.errors} errors</span>}
                          </div>
                          {/* Student Details breakdown (account holder / participant linking) */}
                          {(r.accountHoldersCreated != null || r.participantsCreated != null || r.relinked != null || r.contactsUpdated != null) && (
                            <div className={styles.importFileResultStats}>
                              {r.accountHoldersCreated > 0 && <span>{r.accountHoldersCreated} account holders created</span>}
                              {r.participantsCreated > 0 && <span>{r.participantsCreated} participants created</span>}
                              {r.relinked > 0 && <span>{r.relinked} participants relinked</span>}
                              {r.contactsUpdated > 0 && <span>{r.contactsUpdated} contacts updated</span>}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <div className={styles.modalFooter}>
                  <button onClick={() => { setImportResults([]); if (!importResults.some(r => r.preview)) setImportFiles([]); }} className={styles.cancelBtn} type="button">
                    {importResults.some(r => r.preview) ? 'Back' : 'Import More'}
                  </button>
                  {importResults.some(r => r.preview)
                    ? <button onClick={() => handleImport(false)} className={styles.saveBtn} disabled={importLoading} type="button">Apply import</button>
                    : <button onClick={() => setShowImportModal(false)} className={styles.saveBtn} type="button">Done</button>}
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
              <div>
                <h2>{viewingMember.firstName} {viewingMember.lastName}</h2>
                {viewingMember.memberType === 'participant' && (
                  <span className={styles.memberTypeChip} style={{ marginTop: 4 }}>Participant</span>
                )}
              </div>
              <button onClick={handleCloseViewModal} className={styles.closeBtn}>
                ✕
              </button>
            </div>

            {/* Account Holder info banner for participants */}
            {viewingMember.memberType === 'participant' && viewingMember.accountHolder && (
              <div className={styles.accountHolderBanner}>
                <span className={styles.accountHolderBannerLabel}>Account Holder:</span>
                <span className={styles.accountHolderBannerName}>
                  {viewingMember.accountHolder.firstName} {viewingMember.accountHolder.lastName}
                </span>
                {viewingMember.accountHolder.email && (
                  <span className={styles.accountHolderBannerEmail}>{viewingMember.accountHolder.email}</span>
                )}
                <button
                  className={styles.accountHolderBannerLink}
                  onClick={() => {
                    const ah = members.find(m => m.id === viewingMember.accountHolderId);
                    if (ah) { handleCloseViewModal(); setTimeout(() => handleViewMember(ah), 50); }
                  }}
                >
                  View →
                </button>
              </div>
            )}

            <div className={styles.modalScrollBody}>
            {/* Tabs */}
            <div className={styles.viewTabs}>
              <button
                className={`${styles.viewTab} ${viewTab === 'details' ? styles.active : ''}`}
                onClick={() => setViewTab('details')}
              >
                Details
              </button>
              {viewingMember.memberType !== 'participant' && (
                <button
                  className={`${styles.viewTab} ${viewTab === 'billing' ? styles.active : ''}`}
                  onClick={() => setViewTab('billing')}
                >
                  Billing
                </button>
              )}
              <button
                className={`${styles.viewTab} ${viewTab === 'attendance' ? styles.active : ''}`}
                onClick={() => { setViewTab('attendance'); loadMemberAttendanceData(viewingMember.id); }}
              >
                Attendance
              </button>
              <button
                className={`${styles.viewTab} ${viewTab === 'history' ? styles.active : ''}`}
                onClick={() => { setViewTab('history'); if (webActivity.length === 0) loadWebActivity(viewingMember.id); }}
              >
                History
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
                    <div className={styles.viewValue}>{planName(viewingMember.pricingPlanId)}</div>
                  </div>

                  {(viewingMember as any).membershipName && (
                    <div className={styles.viewField}>
                      <label className={styles.viewLabel}>Membership</label>
                      <div className={styles.viewValue}>{(viewingMember as any).membershipName}</div>
                    </div>
                  )}

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

                {/* Participants section (account holders only) */}
                {viewingMember.memberType !== 'participant' && (
                  <div className={styles.participantsSection}>
                    <h4 className={styles.participantsSectionTitle}>
                      Participants
                      {viewingMember.participants && viewingMember.participants.length > 0 && (
                        <span className={styles.participantCount}>{viewingMember.participants.length}</span>
                      )}
                    </h4>
                    {viewingMember.participants && viewingMember.participants.length > 0 ? (
                      <div className={styles.participantsList}>
                        {viewingMember.participants.map((p: ParticipantSummary) => (
                          <div
                            key={p.id}
                            className={styles.participantRow}
                            onClick={() => {
                              const full = members.find(m => m.id === p.id);
                              if (full) { handleCloseViewModal(); setTimeout(() => handleViewMember(full), 50); }
                              else {
                                api.get(`/members/${p.id}`).then(data => {
                                  handleCloseViewModal();
                                  setTimeout(() => handleViewMember(data), 50);
                                }).catch(() => {});
                              }
                            }}
                          >
                            <div className={styles.participantRowName}>
                              {p.firstName} {p.lastName}
                              <span className={`${styles.badge} ${styles[p.accountStatus]}`} style={{ marginLeft: 8, fontSize: '0.7rem' }}>
                                {p.accountStatus}
                              </span>
                            </div>
                            <div className={styles.participantRowMeta}>
                              <span>{p.programType || 'No Program'}</span>
                              <span className={styles.participantRankBadge}>{p.ranking}</span>
                              <span>{p.membershipAge}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.noParticipants}>No participants linked yet.</p>
                    )}
                    <button
                      className={styles.addParticipantBtn}
                      onClick={() => {
                        handleCloseViewModal();
                        setTimeout(() => {
                          setFormData(fd => ({ ...fd, memberType: 'participant', accountHolderId: viewingMember.id.toString() }));
                          setEditingMember(null);
                          setIsModalOpen(true);
                        }, 50);
                      }}
                    >
                      + Add Participant
                    </button>
                  </div>
                )}
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                          <h4 className={styles.billingTitle} style={{ margin: 0 }}>Recent Check-ins</h4>
                          <button
                            onClick={() => loadMemberAttendanceData(viewingMember.id)}
                            className={styles.cancelBtn}
                            style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
                          >
                            Refresh
                          </button>
                        </div>
                        {attendanceError ? (
                          <p style={{ color: '#ef4444', fontSize: '0.875rem' }}>
                            Error loading check-ins: {attendanceError}
                          </p>
                        ) : memberCheckIns.length > 0 ? (
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

              {viewTab === 'history' && (
                <div className={styles.viewSection}>
                  {/* CRM change history */}
                  <div className={styles.billingBlock}>
                    <h4 className={styles.billingTitle}>Change History</h4>
                    {historyLoading ? (
                      <div className={styles.billingLoading}>Loading history...</div>
                    ) : memberHistory.length === 0 ? (
                      <p className={styles.billingEmpty}>No history recorded yet.</p>
                    ) : (
                      <div className={styles.historyList}>
                        {memberHistory.map((entry) => (
                          <div key={entry.id} className={styles.historyEntry}>
                            <div className={styles.historyMeta}>
                              <span className={styles.historyAction}>
                                {entry.action === 'created' ? 'Contact created' :
                                 entry.action === 'status_changed' ? 'Status changed' :
                                 'Updated'}
                              </span>
                              <span className={styles.historyBy}>by {entry.userName || 'System'}</span>
                              <span className={styles.historyTime}>
                                {new Date(entry.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {entry.changes && (
                              <div className={styles.historyChanges}>
                                {Object.entries(entry.changes as Record<string, { from: any; to: any }>).map(([field, { from, to }]) => (
                                  <div key={field} className={styles.historyChange}>
                                    <span className={styles.historyField}>{field}</span>
                                    <span className={styles.historyFrom}>{from ?? '—'}</span>
                                    <span className={styles.historyArrow}>→</span>
                                    <span className={styles.historyTo}>{to ?? '—'}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Website activity */}
                  <div className={styles.billingBlock}>
                    <h4 className={styles.billingTitle}>Website Activity</h4>
                    {webActivityLoading ? (
                      <div className={styles.billingLoading}>Loading website activity...</div>
                    ) : webActivity.length === 0 ? (
                      <p className={styles.billingEmpty}>No website activity recorded for this contact.</p>
                    ) : (
                      <div className={styles.webActivityList}>
                        {(() => {
                          let lastDate = '';
                          return webActivity.map((evt, i) => {
                            const d = new Date(evt.createdAt);
                            const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                            const showDate = dateLabel !== lastDate;
                            lastDate = dateLabel;

                            const label = (() => {
                              if (evt.eventType === 'pageview') return evt.pageTitle || evt.pagePath || 'Page view';
                              if (evt.eventType === 'form_submit') return 'Form submitted';
                              if (evt.eventType === 'click') return evt.elementText ? `Clicked "${evt.elementText.slice(0, 40)}"` : 'Clicked element';
                              if (evt.eventType === 'scroll') return 'Scrolled page';
                              return evt.eventType;
                            })();

                            const sub = (() => {
                              if (evt.eventType === 'pageview' && evt.pagePath) return evt.pagePath;
                              if (evt.pagePath && evt.eventType !== 'pageview') return evt.pagePath;
                              return null;
                            })();

                            return (
                              <div key={i}>
                                {showDate && (
                                  <div className={styles.webActivityDateSep}>{dateLabel}</div>
                                )}
                                <div className={styles.webActivityRow}>
                                  <span className={`${styles.webActivityTypePill} ${styles[`webEvt_${evt.eventType}`]}`}>
                                    {evt.eventType === 'pageview' ? 'PV' :
                                     evt.eventType === 'form_submit' ? 'FM' :
                                     evt.eventType === 'click' ? 'CL' :
                                     evt.eventType === 'scroll' ? 'SC' : '—'}
                                  </span>
                                  <div className={styles.webActivityInfo}>
                                    <span className={styles.webActivityLabel}>{label}</span>
                                    {sub && <span className={styles.webActivitySub}>{sub}</span>}
                                  </div>
                                  <span className={styles.webActivityTime}>
                                    {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            </div>{/* end modalScrollBody */}
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
