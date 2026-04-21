import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';
import { useLocation } from '../contexts/LocationContext';
import { api } from '../utils/api';
import { CheckIcon, WarningIcon, AddIcon, EditIcon, DeleteIcon } from '../components/Icons';
import styles from './Settings.module.css';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'super_admin' | 'admin' | 'staff' | 'instructor';
  firstName: string;
  lastName: string;
  locationId?: number;
  isInstructor?: boolean;
  certifications?: string;
  specialties?: string;
  createdAt: string;
  updatedAt: string;
}

interface Location {
  id: number;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country: string;
  phone?: string;
  email?: string;
  timezone: string;
  isActive: boolean;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApiIntegration {
  id: string;
  name: string;
  enabled: boolean;
  apiKey?: string;
  apiSecret?: string;
  endpoint?: string;
}

interface Program {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const Settings = () => {
  const { user } = useAuth();
  const { branding, updateBranding } = useBranding();
  const { loadLocations } = useLocation();
  const [activeTab, setActiveTab] = useState('mystudio');
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [saveMessage, setSaveMessage] = useState('');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // MyStudio API Settings
  const [myStudioConfig, setMyStudioConfig] = useState({
    enabled: false,
    apiKey: '',
    apiSecret: '',
    endpoint: 'https://api.mystudio.io',
    syncInterval: 60,
  });

  // API Integrations
  const [integrations, setIntegrations] = useState<ApiIntegration[]>([
    { id: 'sendgrid', name: 'SendGrid (Email)', enabled: false, apiKey: '' },
    { id: 'twilio', name: 'Twilio (SMS/Voice)', enabled: false, apiKey: '', apiSecret: '', endpoint: '' },
    { id: 'stripe', name: 'Stripe (Payments)', enabled: false, apiKey: '', apiSecret: '' },
    { id: 'google-analytics', name: 'Google Analytics', enabled: false, apiKey: '' },
  ]);

  const [twilioTestStatus, setTwilioTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [twilioTestMessage, setTwilioTestMessage] = useState('');

  // Database Settings
  const [databaseConfig, setDatabaseConfig] = useState({
    autoBackup: true,
    backupInterval: 24,
    maxBackups: 7,
    enableLogging: true,
  });

  // Email/SMTP Settings (server-side env vars only)
  const [smtpStatus, setSmtpStatus] = useState<any>(null);
  const [smtpTestStatus, setSmtpTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [smtpTestMessage, setSmtpTestMessage] = useState('');

  // Social Media Accounts
  const [socialAccounts, setSocialAccounts] = useState<any[]>([]);
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [editingSocialAccount, setEditingSocialAccount] = useState<any | null>(null);
  const [socialForm, setSocialForm] = useState({
    platform: 'facebook' as 'facebook' | 'instagram' | 'twitter' | 'linkedin',
    accountName: '',
    accountId: '',
    pageId: '',
    pageName: '',
    accessToken: '',
    refreshToken: '',
    tokenExpiresAt: '',
    isActive: true,
  });

  // DKIM Configuration
  const [dkimDomain, setDkimDomain] = useState('');
  const [dkimConfig, setDkimConfig] = useState<any>(null);
  const [dkimConfigs, setDkimConfigs] = useState<any[]>([]);
  const [dkimGenerating, setDkimGenerating] = useState(false);
  const [dkimVerifying, setDkimVerifying] = useState(false);
  const [dkimMessage, setDkimMessage] = useState('');
  const [dkimVerifyResult, setDkimVerifyResult] = useState<any>(null);

  // Billing/Stripe Settings
  const [billingLocationId, setBillingLocationId] = useState<number | null>(null);
  const [billingSettings, setBillingSettings] = useState({
    stripePublishableKey: '',
    stripeSecretKey: '',
    stripeWebhookSecret: '',
    currency: 'usd',
    defaultTaxRate: 0,
    trialDays: 7,
    gracePeriodDays: 3,
    autoRetryFailedPayments: true,
    sendPaymentReceipts: true,
    sendFailedPaymentAlerts: true,
    isActive: false,
  });
  const [stripeTestStatus, setStripeTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [stripeTestMessage, setStripeTestMessage] = useState('');

  // Pricing Plans
  const [pricingPlans, setPricingPlans] = useState<any[]>([]);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [amountDisplay, setAmountDisplay] = useState('0.00');
  const [pricingForm, setPricingForm] = useState({
    name: '',
    description: '',
    accountType: 'basic' as 'basic' | 'premium' | 'elite' | 'family',
    programType: 'All' as "Children's Martial Arts" | 'Adult BJJ' | 'Adult TKD & HKD' | 'DG Barbell' | 'Adult Muay Thai & Kickboxing' | 'The Ashtanga Club' | 'Dragon Gym Learning Center' | 'Kids BJJ' | 'Kids Muay Thai' | 'Young Ladies Yoga' | 'DG Workspace' | 'Dragon Launch' | 'Personal Training' | 'DGMT Private Training' | 'All',
    membershipAge: 'All' as 'Adult' | 'Kids' | 'All',
    amount: 0,
    currency: 'usd',
    billingInterval: 'month' as 'month' | 'year' | 'week',
    intervalCount: 1,
    trialDays: 0,
    isActive: true,
  });

  // Location Form
  const [locationForm, setLocationForm] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'USA',
    phone: '',
    email: '',
    timezone: 'America/New_York',
    isActive: true,
    isPrimary: false,
  });

  // User Form
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'staff' as User['role'],
    firstName: '',
    lastName: '',
    locationId: null as number | null,
    isInstructor: false,
    certifications: '',
    specialties: '',
  });

  useEffect(() => {
    loadUsers();
    loadLocationsData();
    loadPrograms();
    loadSettings();
    loadSocialAccounts();
    loadDkimConfigs();
    loadBillingSettings();
    loadPricingPlans();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadLocationsData = async () => {
    try {
      const response = await api.get('/locations');
      setLocations(response);
    } catch (error) {
      console.error('Failed to load locations:', error);
    }
  };

  const loadPrograms = async () => {
    try {
      const response = await api.get('/programs');
      setPrograms(response);
    } catch (error) {
      console.error('Failed to load programs:', error);
    }
  };

  const handleSaveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const programData = {
        name: (e.target as any).programName.value,
        description: (e.target as any).programDescription.value || '',
      };

      if (editingProgram) {
        await api.put(`/programs/${editingProgram.id}`, programData);
        showSaveMessage('Program updated successfully!');
      } else {
        await api.post('/programs', programData);
        showSaveMessage('Program created successfully!');
      }

      await loadPrograms();
      setShowProgramModal(false);
      setEditingProgram(null);
    } catch (error: any) {
      alert(error.message || 'Failed to save program');
    }
  };

  const handleDeleteProgram = async (id: number) => {
    if (!confirm('Are you sure you want to delete this program?')) return;

    try {
      await api.delete(`/programs/${id}`);
      await loadPrograms();
      showSaveMessage('Program deleted successfully!');
    } catch (error: any) {
      alert(error.message || 'Failed to delete program');
    }
  };

  const handleToggleProgramActive = async (program: Program) => {
    try {
      await api.put(`/programs/${program.id}`, { isActive: !program.isActive });
      await loadPrograms();
      showSaveMessage(`Program ${!program.isActive ? 'activated' : 'deactivated'} successfully!`);
    } catch (error: any) {
      alert(error.message || 'Failed to update program status');
    }
  };

  const loadSettings = () => {
    // Load settings from localStorage
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }

    const savedMyStudio = localStorage.getItem('myStudioConfig');
    if (savedMyStudio) {
      setMyStudioConfig(JSON.parse(savedMyStudio));
    }

    const savedIntegrations = localStorage.getItem('integrations');
    if (savedIntegrations) {
      setIntegrations(JSON.parse(savedIntegrations));
    }

    const savedDatabase = localStorage.getItem('databaseConfig');
    if (savedDatabase) {
      setDatabaseConfig(JSON.parse(savedDatabase));
    }

    // Load server-side SMTP config status
    api.get('/email/config-status').then(setSmtpStatus).catch(() => {});
  };

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    showSaveMessage('Theme updated successfully');
  };

  const handleMyStudioSave = () => {
    localStorage.setItem('myStudioConfig', JSON.stringify(myStudioConfig));
    showSaveMessage('MyStudio configuration saved');
  };

  const handleIntegrationToggle = (id: string) => {
    setIntegrations(prev =>
      prev.map(int => (int.id === id ? { ...int, enabled: !int.enabled } : int))
    );
  };

  const handleIntegrationUpdate = (id: string, field: string, value: string) => {
    setIntegrations(prev =>
      prev.map(int => (int.id === id ? { ...int, [field]: value } : int))
    );
  };

  const handleIntegrationsSave = () => {
    localStorage.setItem('integrations', JSON.stringify(integrations));
    showSaveMessage('API integrations saved');
  };

  const handleTestTwilioConnection = async () => {
    setTwilioTestStatus('testing');
    setTwilioTestMessage('Testing Twilio connection...');

    const twilioIntegration = integrations.find(int => int.id === 'twilio');

    if (!twilioIntegration?.apiKey || !twilioIntegration?.apiSecret) {
      setTwilioTestStatus('error');
      setTwilioTestMessage('✗ Please enter both Account SID and Auth Token');
      setTimeout(() => {
        setTwilioTestStatus('idle');
        setTwilioTestMessage('');
      }, 5000);
      return;
    }

    try {
      // This would normally call a backend endpoint to verify Twilio credentials
      // For now, we'll simulate the test
      const response = await api.post('/twilio/test-connection', {
        accountSid: twilioIntegration.apiKey,
        authToken: twilioIntegration.apiSecret,
        phoneNumber: twilioIntegration.endpoint,
      });

      if (response.success) {
        setTwilioTestStatus('success');
        setTwilioTestMessage('✓ Twilio connection successful! Your credentials are valid.');
      } else {
        setTwilioTestStatus('error');
        setTwilioTestMessage(`✗ Connection failed: ${response.message || 'Invalid credentials'}`);
      }
    } catch (error: any) {
      // If endpoint doesn't exist yet, show a helpful message
      if (error.message?.includes('404')) {
        setTwilioTestStatus('error');
        setTwilioTestMessage('✗ Twilio test endpoint not yet implemented on server. Save your credentials to use them in SMS campaigns.');
      } else {
        setTwilioTestStatus('error');
        setTwilioTestMessage(`✗ Connection failed: ${error.message || 'Could not verify credentials'}`);
      }
    }

    // Clear message after 5 seconds
    setTimeout(() => {
      setTwilioTestStatus('idle');
      setTwilioTestMessage('');
    }, 5000);
  };

  const handleDatabaseSave = () => {
    localStorage.setItem('databaseConfig', JSON.stringify(databaseConfig));
    showSaveMessage('Database settings saved');
  };

  const handleTestSmtpConnection = async () => {
    setSmtpTestStatus('testing');
    setSmtpTestMessage('Testing connection...');

    try {
      const response = await api.post('/email/test-server-connection', {});
      if (response.success) {
        setSmtpTestStatus('success');
        setSmtpTestMessage('Connection successful. SMTP is configured correctly.');
      } else {
        setSmtpTestStatus('error');
        setSmtpTestMessage(`Connection failed: ${response.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      setSmtpTestStatus('error');
      setSmtpTestMessage(`Connection failed: ${error.message || 'Could not reach server'}`);
    }

    setTimeout(() => {
      setSmtpTestStatus('idle');
      setSmtpTestMessage('');
    }, 5000);
  };

  // Billing/Stripe Settings Functions
  const loadBillingSettings = async (locId?: number | null) => {
    try {
      const query = locId != null ? `/billing?locationId=${locId}` : '/billing';
      const response = await api.get(query);
      if (response && Object.keys(response).length > 0) {
        setBillingSettings({
          stripePublishableKey: response.stripePublishableKey || '',
          stripeSecretKey: response.stripeSecretKey || '',
          stripeWebhookSecret: response.stripeWebhookSecret || '',
          currency: response.currency || 'usd',
          defaultTaxRate: response.defaultTaxRate || 0,
          trialDays: response.trialDays || 7,
          gracePeriodDays: response.gracePeriodDays || 3,
          autoRetryFailedPayments: response.autoRetryFailedPayments ?? true,
          sendPaymentReceipts: response.sendPaymentReceipts ?? true,
          sendFailedPaymentAlerts: response.sendFailedPaymentAlerts ?? true,
          isActive: response.isActive ?? false,
        });
      } else {
        // No settings for this location yet — reset to defaults
        setBillingSettings({
          stripePublishableKey: '',
          stripeSecretKey: '',
          stripeWebhookSecret: '',
          currency: 'usd',
          defaultTaxRate: 0,
          trialDays: 7,
          gracePeriodDays: 3,
          autoRetryFailedPayments: true,
          sendPaymentReceipts: true,
          sendFailedPaymentAlerts: true,
          isActive: false,
        });
      }
    } catch (error) {
      console.error('Failed to load billing settings:', error);
    }
  };

  const loadPricingPlans = async () => {
    try {
      const response = await api.get('/pricing-plans');
      setPricingPlans(response || []);
    } catch (error) {
      console.error('Failed to load pricing plans:', error);
    }
  };

  const handleSaveBillingSettings = async () => {
    try {
      await api.put('/billing', { ...billingSettings, locationId: billingLocationId });
      showSaveMessage('Billing settings saved successfully!');
      loadBillingSettings(billingLocationId);
    } catch (error: any) {
      alert(error.message || 'Failed to save billing settings');
    }
  };

  const handleTestStripeConnection = async () => {
    setStripeTestStatus('testing');
    setStripeTestMessage('');

    try {
      const response = await api.post('/billing/test', {
        stripeSecretKey: billingSettings.stripeSecretKey,
        locationId: billingLocationId,
      });

      if (response.success) {
        setStripeTestStatus('success');
        setStripeTestMessage('Successfully connected to Stripe!');
      } else {
        setStripeTestStatus('error');
        setStripeTestMessage(response.error || 'Failed to connect to Stripe');
      }
    } catch (error: any) {
      setStripeTestStatus('error');
      setStripeTestMessage(error.message || 'Failed to connect to Stripe');
    }

    setTimeout(() => {
      setStripeTestStatus('idle');
      setStripeTestMessage('');
    }, 5000);
  };

  const handleAddPricingPlan = () => {
    setEditingPlan(null);
    setAmountDisplay('0.00');
    setPricingForm({
      name: '',
      description: '',
      accountType: 'basic',
      programType: 'All',
      membershipAge: 'All',
      amount: 0,
      currency: 'usd',
      billingInterval: 'month',
      intervalCount: 1,
      trialDays: 0,
      isActive: true,
    });
    setShowPricingModal(true);
  };

  const handleEditPricingPlan = (plan: any) => {
    setEditingPlan(plan);
    setAmountDisplay((plan.amount / 100).toFixed(2));
    setPricingForm({
      name: plan.name,
      description: plan.description || '',
      accountType: plan.accountType,
      programType: plan.programType || 'All',
      membershipAge: plan.membershipAge || 'All',
      amount: plan.amount,
      currency: plan.currency || 'usd',
      billingInterval: plan.billingInterval,
      intervalCount: plan.intervalCount || 1,
      trialDays: plan.trialDays || 0,
      isActive: plan.isActive ?? true,
    });
    setShowPricingModal(true);
  };

  const handleSavePricingPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const planData = {
        ...pricingForm,
        syncToStripe: true,
      };

      if (editingPlan) {
        await api.put(`/pricing-plans/${editingPlan.id}`, planData);
        showSaveMessage('Pricing plan updated successfully!');
      } else {
        await api.post('/pricing-plans', planData);
        showSaveMessage('Pricing plan created successfully!');
      }

      await loadPricingPlans();
      setShowPricingModal(false);
      setEditingPlan(null);
    } catch (error: any) {
      alert(error.message || 'Failed to save pricing plan');
    }
  };

  const handleDeletePricingPlan = async (id: number) => {
    if (!confirm('Are you sure you want to delete this pricing plan?')) return;

    try {
      await api.delete(`/pricing-plans/${id}`);
      await loadPricingPlans();
      showSaveMessage('Pricing plan deleted successfully!');
    } catch (error: any) {
      alert(error.message || 'Failed to delete pricing plan');
    }
  };

  const handleSyncPlanToStripe = async (id: number) => {
    try {
      await api.post(`/pricing-plans/${id}/sync`);
      await loadPricingPlans();
      showSaveMessage('Pricing plan synced to Stripe successfully!');
    } catch (error: any) {
      alert(error.message || 'Failed to sync to Stripe');
    }
  };

  const formatCurrency = (amount: number, currency: string = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  // Social Accounts Management
  const loadSocialAccounts = async () => {
    try {
      const response = await api.get('/social-accounts');
      setSocialAccounts(response);
    } catch (error) {
      console.error('Failed to load social accounts:', error);
    }
  };

  const handleAddSocialAccount = () => {
    setEditingSocialAccount(null);
    setSocialForm({
      platform: 'facebook',
      accountName: '',
      accountId: '',
      pageId: '',
      pageName: '',
      accessToken: '',
      refreshToken: '',
      tokenExpiresAt: '',
      isActive: true,
    });
    setShowSocialModal(true);
  };

  const handleEditSocialAccount = (account: any) => {
    setEditingSocialAccount(account);
    setSocialForm({
      platform: account.platform,
      accountName: account.accountName,
      accountId: account.accountId,
      pageId: account.pageId || '',
      pageName: account.pageName || '',
      accessToken: account.accessToken,
      refreshToken: account.refreshToken || '',
      tokenExpiresAt: account.tokenExpiresAt || '',
      isActive: account.isActive,
    });
    setShowSocialModal(true);
  };

  const handleSaveSocialAccount = async () => {
    try {
      if (editingSocialAccount) {
        await api.put(`/social-accounts/${editingSocialAccount.id}`, socialForm);
      } else {
        await api.post('/social-accounts', socialForm);
      }
      setShowSocialModal(false);
      loadSocialAccounts();
      showSaveMessage(`Social account ${editingSocialAccount ? 'updated' : 'added'} successfully`);
    } catch (error: any) {
      alert(error.message || 'Failed to save social account');
    }
  };

  const handleDeleteSocialAccount = async (id: number) => {
    if (!confirm('Are you sure you want to delete this social account?')) return;

    try {
      await api.delete(`/social-accounts/${id}`);
      loadSocialAccounts();
      showSaveMessage('Social account deleted successfully');
    } catch (error: any) {
      alert(error.message || 'Failed to delete social account');
    }
  };

  // DKIM Handlers
  const loadDkimConfigs = async () => {
    try {
      const configs = await api.get('/dkim/config');
      setDkimConfigs(configs);
    } catch (error) {
      console.error('Failed to load DKIM configs:', error);
    }
  };

  const handleGenerateDkimKeys = async () => {
    setDkimGenerating(true);
    setDkimMessage('');
    setDkimVerifyResult(null);

    try {
      const result = await api.post('/dkim/generate', {
        domain: dkimDomain,
        selector: 'dragondesk',
      });

      setDkimConfig(result);
      setDkimMessage('DKIM keys generated successfully!');
      loadDkimConfigs();
    } catch (error: any) {
      setDkimMessage(error.message || 'Failed to generate DKIM keys');
    } finally {
      setDkimGenerating(false);
    }
  };

  const handleVerifyDkim = async () => {
    setDkimVerifying(true);
    setDkimVerifyResult(null);

    try {
      const result = await api.post(`/dkim/verify/${dkimDomain}`);
      setDkimVerifyResult(result);

      if (result.verified) {
        // Reload configs to get updated status
        loadDkimConfigs();
      }
    } catch (error: any) {
      setDkimVerifyResult({
        verified: false,
        message: error.message || 'Failed to verify DKIM DNS record',
      });
    } finally {
      setDkimVerifying(false);
    }
  };

  const handleToggleDkim = async (isActive: boolean) => {
    try {
      await api.patch(`/dkim/config/${dkimDomain}/toggle`, { isActive });
      setDkimConfig({ ...dkimConfig, isActive });
      loadDkimConfigs();
      showSaveMessage(`DKIM signing ${isActive ? 'enabled' : 'disabled'}`);
    } catch (error: any) {
      alert(error.message || 'Failed to toggle DKIM status');
    }
  };

  const handleDeleteDkimConfig = async (domain: string) => {
    if (!confirm(`Are you sure you want to delete the DKIM configuration for ${domain}?`)) return;

    try {
      await api.delete(`/dkim/config/${domain}`);
      loadDkimConfigs();

      if (dkimConfig && dkimConfig.domain === domain) {
        setDkimConfig(null);
        setDkimDomain('');
      }

      showSaveMessage('DKIM configuration deleted successfully');
    } catch (error: any) {
      alert(error.message || 'Failed to delete DKIM configuration');
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setUserForm({
      username: '',
      email: '',
      password: '',
      role: 'staff',
      firstName: '',
      lastName: '',
      locationId: null,
      isInstructor: false,
      certifications: '',
      specialties: '',
    });
    setShowUserModal(true);
  };

  const handleEditUser = (userToEdit: User) => {
    setEditingUser(userToEdit);
    setUserForm({
      username: userToEdit.username,
      email: userToEdit.email,
      password: '', // Don't pre-fill password
      role: userToEdit.role,
      firstName: userToEdit.firstName,
      lastName: userToEdit.lastName,
      locationId: userToEdit.locationId || null,
      isInstructor: userToEdit.isInstructor || false,
      certifications: userToEdit.certifications || '',
      specialties: userToEdit.specialties || '',
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async () => {
    try {
      if (editingUser) {
        // Update existing user - only send fields that are filled
        const updateData: any = {
          role: userForm.role,
          firstName: userForm.firstName,
          lastName: userForm.lastName,
          email: userForm.email,
          locationId: userForm.locationId,
          isInstructor: userForm.isInstructor,
          certifications: userForm.certifications,
          specialties: userForm.specialties,
        };
        // Only include password if it's being changed
        if (userForm.password) {
          updateData.password = userForm.password;
        }
        await api.put(`/users/${editingUser.id}`, updateData);
        showSaveMessage('User updated successfully');
      } else {
        // Create new user
        await api.post('/users', userForm);
        showSaveMessage('User created successfully');
      }
      setShowUserModal(false);
      loadUsers();
    } catch (error: any) {
      alert(error.message || 'Failed to save user');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      await api.delete(`/users/${userId}`);
      loadUsers();
      showSaveMessage('User deleted successfully');
    } catch (error: any) {
      alert(error.message || 'Failed to delete user');
    }
  };

  const showSaveMessage = (message: string) => {
    setSaveMessage(message);
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleBrandingSave = () => {
    showSaveMessage('Branding settings saved');
  };

  const handleOpenLocationModal = (location?: Location) => {
    if (location) {
      setEditingLocation(location);
      setLocationForm({
        name: location.name,
        address: location.address || '',
        city: location.city || '',
        state: location.state || '',
        zipCode: location.zipCode || '',
        country: location.country,
        phone: location.phone || '',
        email: location.email || '',
        timezone: location.timezone,
        isActive: location.isActive,
        isPrimary: location.isPrimary,
      });
    } else {
      setEditingLocation(null);
      setLocationForm({
        name: '',
        address: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'USA',
        phone: '',
        email: '',
        timezone: 'America/New_York',
        isActive: true,
        isPrimary: false,
      });
    }
    setShowLocationModal(true);
  };

  const handleSaveLocation = async () => {
    try {
      if (editingLocation) {
        await api.put(`/locations/${editingLocation.id}`, locationForm);
        showSaveMessage('Location updated successfully');
      } else {
        await api.post('/locations', locationForm);
        showSaveMessage('Location created successfully');
      }
      setShowLocationModal(false);
      loadLocationsData();
      loadLocations(); // Refresh location context
    } catch (error: any) {
      alert(error.message || 'Failed to save location');
    }
  };

  const handleDeleteLocation = async (locationId: number) => {
    if (!confirm('Are you sure you want to delete this location?')) return;

    try {
      await api.delete(`/locations/${locationId}`);
      showSaveMessage('Location deleted successfully');
      loadLocationsData();
      loadLocations(); // Refresh location context
    } catch (error: any) {
      alert(error.message || 'Failed to delete location');
    }
  };

  const tabGroups = [
    {
      label: 'General',
      tabs: [
        { id: 'branding', label: 'Branding' },
        { id: 'theme', label: 'Appearance' },
      ]
    },
    {
      label: 'Gym Settings',
      tabs: [
        { id: 'locations', label: 'Locations' },
        { id: 'programs', label: 'Programs' },
      ]
    },
    {
      label: 'Integrations',
      tabs: [
        { id: 'mystudio', label: 'MyStudio API' },
        { id: 'email', label: 'Email Settings' },
        { id: 'dkim', label: 'DKIM Authentication' },
        { id: 'social', label: 'Social Settings' },
        { id: 'integrations', label: 'API Integrations' },
        { id: 'leadforms', label: 'Lead Forms' },
      ]
    },
    {
      label: 'Billing',
      tabs: [
        { id: 'stripe', label: 'Stripe Payments' },
        { id: 'pricing', label: 'Pricing Plans' },
      ]
    },
    {
      label: 'Administration',
      tabs: [
        { id: 'users', label: 'User Management' },
        { id: 'database', label: 'Database' },
      ]
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Settings</h1>
          <p className={styles.subtitle}>Configure your DragonDesk CRM</p>
        </div>
      </div>

      {saveMessage && (
        <div className={styles.saveMessage}>
          <CheckIcon size={20} />
          {saveMessage}
        </div>
      )}

      <div className={styles.content}>
        <div className={styles.sidebar}>
          {tabGroups.map((group, groupIndex) => (
            <div key={groupIndex} className={styles.tabGroup}>
              <div className={styles.tabGroupLabel}>{group.label}</div>
              {group.tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className={styles.main}>
          {/* Branding Settings */}
          {activeTab === 'branding' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Branding & White Label</h2>
              <p className={styles.sectionDesc}>
                Customize DragonDesk with your gym's branding and logo.
              </p>

              <div className={styles.formGroup}>
                <label className={styles.label}>Gym Name *</label>
                <input
                  type="text"
                  value={branding.gymName}
                  onChange={e => updateBranding({ gymName: e.target.value })}
                  className={styles.input}
                  placeholder="Enter your gym name"
                />
                <small className={styles.helpText}>
                  This name will appear in the sidebar and throughout the application
                </small>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Logo URL</label>
                <input
                  type="url"
                  value={branding.logo || ''}
                  onChange={e => updateBranding({ logo: e.target.value || null })}
                  className={styles.input}
                  placeholder="https://example.com/logo.png"
                />
                <small className={styles.helpText}>
                  Enter a URL to your gym's logo image (PNG, JPG, or SVG)
                </small>
              </div>

              {branding.logo && (
                <div className={styles.logoPreview}>
                  <label className={styles.label}>Logo Preview</label>
                  <div className={styles.previewBox}>
                    <img
                      src={branding.logo}
                      alt={branding.gymName}
                      className={styles.previewImage}
                      onError={e => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.label}>Accent Color</label>
                <div className={styles.colorPicker}>
                  <input
                    type="color"
                    value={branding.primaryColor}
                    onChange={e => updateBranding({ primaryColor: e.target.value })}
                    className={styles.colorInput}
                  />
                  <input
                    type="text"
                    value={branding.primaryColor}
                    onChange={e => {
                      if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                        updateBranding({ primaryColor: e.target.value });
                      }
                    }}
                    className={styles.input}
                    placeholder="#dc2626"
                  />
                </div>
                <div className={styles.colorSwatches}>
                  {[
                    { label: 'Dragon Red', color: '#dc2626' },
                    { label: 'Midnight Blue', color: '#1d4ed8' },
                    { label: 'Forest', color: '#15803d' },
                    { label: 'Amethyst', color: '#7c3aed' },
                    { label: 'Ember', color: '#ea580c' },
                    { label: 'Gold', color: '#ca8a04' },
                    { label: 'Steel', color: '#475569' },
                    { label: 'Obsidian', color: '#18181b' },
                  ].map(({ label, color }) => (
                    <button
                      key={color}
                      title={label}
                      onClick={() => updateBranding({ primaryColor: color })}
                      className={styles.colorSwatch}
                      style={{
                        backgroundColor: color,
                        outline: branding.primaryColor === color ? '2px solid white' : 'none',
                        outlineOffset: '2px',
                      }}
                    />
                  ))}
                </div>
                <small className={styles.helpText}>
                  Accent color applied to buttons, links, badges, and highlights across the interface
                </small>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={branding.showPoweredBy}
                    onChange={e => updateBranding({ showPoweredBy: e.target.checked })}
                    className={styles.checkbox}
                  />
                  <span>Show "Powered by DragonDesk"</span>
                </label>
                <small className={styles.helpText}>
                  Display DragonDesk branding in the footer (helps support our development)
                </small>
              </div>

              <button onClick={handleBrandingSave} className={styles.saveBtn}>
                Save Branding Settings
              </button>

              <div className={styles.info}>
                Changes to branding are saved automatically and will appear immediately.
              </div>
            </div>
          )}

          {/* Locations Management */}
          {activeTab === 'locations' && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Locations</h2>
                  <p className={styles.sectionDesc}>
                    Manage your gym locations for multi-location support.
                  </p>
                </div>
                <button onClick={() => handleOpenLocationModal()} className={styles.primaryBtn}>
                  <AddIcon size={20} />
                  Add Location
                </button>
              </div>

              <div className={styles.locationsList}>
                {locations.map((location) => (
                  <div key={location.id} className={styles.locationCard}>
                    <div className={styles.locationInfo}>
                      <div className={styles.locationHeader}>
                        <h3 className={styles.locationName}>{location.name}</h3>
                        <div className={styles.locationBadges}>
                          {location.isPrimary && (
                            <span className={styles.primaryBadge}>Primary</span>
                          )}
                          {!location.isActive && (
                            <span className={styles.inactiveBadge}>Inactive</span>
                          )}
                        </div>
                      </div>
                      {location.address && (
                        <p className={styles.locationAddress}>
                          {location.address}
                          {location.city && `, ${location.city}`}
                          {location.state && `, ${location.state}`}
                          {location.zipCode && ` ${location.zipCode}`}
                        </p>
                      )}
                      <div className={styles.locationMeta}>
                        {location.phone && <span>📞 {location.phone}</span>}
                        {location.email && <span>✉️ {location.email}</span>}
                        <span>🌍 {location.timezone}</span>
                      </div>
                    </div>
                    <div className={styles.locationActions}>
                      <button
                        onClick={() => handleOpenLocationModal(location)}
                        className={styles.editBtn}
                      >
                        <EditIcon size={18} />
                        Edit
                      </button>
                      {!location.isPrimary && (
                        <button
                          onClick={() => handleDeleteLocation(location.id)}
                          className={styles.deleteBtn}
                        >
                          <DeleteIcon size={18} />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {locations.length === 0 && (
                  <div className={styles.emptyState}>
                    <p>No locations yet. Add your first location to get started!</p>
                  </div>
                )}
              </div>

              {showLocationModal && (
                <div className={styles.modal}>
                  <div className={styles.modalContent}>
                    <div className={styles.modalHeader}>
                      <h2>{editingLocation ? 'Edit Location' : 'Add New Location'}</h2>
                      <button
                        onClick={() => setShowLocationModal(false)}
                        className={styles.closeBtn}
                      >
                        ×
                      </button>
                    </div>

                    <div className={styles.modalBody}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>Location Name *</label>
                        <input
                          type="text"
                          value={locationForm.name}
                          onChange={(e) =>
                            setLocationForm({ ...locationForm, name: e.target.value })
                          }
                          className={styles.input}
                          placeholder="e.g., Downtown Dojo"
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.label}>Address</label>
                        <input
                          type="text"
                          value={locationForm.address}
                          onChange={(e) =>
                            setLocationForm({ ...locationForm, address: e.target.value })
                          }
                          className={styles.input}
                          placeholder="Street address"
                        />
                      </div>

                      <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>City</label>
                          <input
                            type="text"
                            value={locationForm.city}
                            onChange={(e) =>
                              setLocationForm({ ...locationForm, city: e.target.value })
                            }
                            className={styles.input}
                          />
                        </div>

                        <div className={styles.formGroup}>
                          <label className={styles.label}>State</label>
                          <input
                            type="text"
                            value={locationForm.state}
                            onChange={(e) =>
                              setLocationForm({ ...locationForm, state: e.target.value })
                            }
                            className={styles.input}
                          />
                        </div>

                        <div className={styles.formGroup}>
                          <label className={styles.label}>Zip Code</label>
                          <input
                            type="text"
                            value={locationForm.zipCode}
                            onChange={(e) =>
                              setLocationForm({ ...locationForm, zipCode: e.target.value })
                            }
                            className={styles.input}
                          />
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Phone</label>
                          <input
                            type="tel"
                            value={locationForm.phone}
                            onChange={(e) =>
                              setLocationForm({ ...locationForm, phone: e.target.value })
                            }
                            className={styles.input}
                          />
                        </div>

                        <div className={styles.formGroup}>
                          <label className={styles.label}>Email</label>
                          <input
                            type="email"
                            value={locationForm.email}
                            onChange={(e) =>
                              setLocationForm({ ...locationForm, email: e.target.value })
                            }
                            className={styles.input}
                          />
                        </div>
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.label}>Timezone</label>
                        <select
                          value={locationForm.timezone}
                          onChange={(e) =>
                            setLocationForm({ ...locationForm, timezone: e.target.value })
                          }
                          className={styles.input}
                        >
                          <option value="America/New_York">Eastern Time</option>
                          <option value="America/Chicago">Central Time</option>
                          <option value="America/Denver">Mountain Time</option>
                          <option value="America/Los_Angeles">Pacific Time</option>
                          <option value="America/Anchorage">Alaska Time</option>
                          <option value="Pacific/Honolulu">Hawaii Time</option>
                        </select>
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.toggleLabel}>
                          <input
                            type="checkbox"
                            checked={locationForm.isPrimary}
                            onChange={(e) =>
                              setLocationForm({ ...locationForm, isPrimary: e.target.checked })
                            }
                            className={styles.checkbox}
                          />
                          <span>Set as Primary Location</span>
                        </label>
                        <small className={styles.helpText}>
                          The primary location is the default for new members and events
                        </small>
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.toggleLabel}>
                          <input
                            type="checkbox"
                            checked={locationForm.isActive}
                            onChange={(e) =>
                              setLocationForm({ ...locationForm, isActive: e.target.checked })
                            }
                            className={styles.checkbox}
                          />
                          <span>Active</span>
                        </label>
                        <small className={styles.helpText}>
                          Inactive locations won't appear in selection dropdowns
                        </small>
                      </div>
                    </div>

                    <div className={styles.modalActions}>
                      <button
                        onClick={() => setShowLocationModal(false)}
                        className={styles.secondaryBtn}
                      >
                        Cancel
                      </button>
                      <button onClick={handleSaveLocation} className={styles.saveBtn}>
                        {editingLocation ? 'Update Location' : 'Create Location'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Programs Management */}
          {activeTab === 'programs' && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Programs</h2>
                  <p className={styles.sectionDesc}>
                    Manage your martial arts programs and disciplines.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingProgram(null);
                    setShowProgramModal(true);
                  }}
                  className={styles.primaryBtn}
                >
                  <AddIcon size={20} />
                  Add Program
                </button>
              </div>

              <div className={styles.locationsList}>
                {programs.map((program) => (
                  <div key={program.id} className={styles.locationCard}>
                    <div className={styles.locationInfo}>
                      <div className={styles.locationHeader}>
                        <h3 className={styles.locationName}>{program.name}</h3>
                        <div className={styles.locationBadges}>
                          {!program.isActive && (
                            <span className={styles.inactiveBadge}>Inactive</span>
                          )}
                        </div>
                      </div>
                      {program.description && (
                        <p className={styles.locationAddress}>{program.description}</p>
                      )}
                    </div>
                    <div className={styles.locationActions}>
                      <button
                        onClick={() => handleToggleProgramActive(program)}
                        className={styles.editBtn}
                      >
                        {program.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingProgram(program);
                          setShowProgramModal(true);
                        }}
                        className={styles.editBtn}
                      >
                        <EditIcon size={18} />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteProgram(program.id)}
                        className={styles.deleteBtn}
                      >
                        <DeleteIcon size={18} />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}

                {programs.length === 0 && (
                  <div className={styles.emptyState}>
                    <p>No programs yet. Add your first program to get started!</p>
                  </div>
                )}
              </div>

              {showProgramModal && (
                <div className={styles.modal}>
                  <div className={styles.modalContent}>
                    <div className={styles.modalHeader}>
                      <h2>{editingProgram ? 'Edit Program' : 'Add New Program'}</h2>
                      <button
                        onClick={() => {
                          setShowProgramModal(false);
                          setEditingProgram(null);
                        }}
                        className={styles.closeBtn}
                      >
                        ×
                      </button>
                    </div>

                    <form onSubmit={handleSaveProgram}>
                      <div className={styles.modalBody}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Program Name *</label>
                          <input
                            type="text"
                            name="programName"
                            defaultValue={editingProgram?.name || ''}
                            className={styles.input}
                            placeholder="e.g., Boxing, Kickboxing, Wrestling"
                            required
                          />
                        </div>

                        <div className={styles.formGroup}>
                          <label className={styles.label}>Description</label>
                          <textarea
                            name="programDescription"
                            defaultValue={editingProgram?.description || ''}
                            className={styles.textarea}
                            placeholder="Brief description of the program"
                            rows={3}
                          />
                        </div>
                      </div>

                      <div className={styles.modalActions}>
                        <button
                          type="button"
                          onClick={() => {
                            setShowProgramModal(false);
                            setEditingProgram(null);
                          }}
                          className={styles.secondaryBtn}
                        >
                          Cancel
                        </button>
                        <button type="submit" className={styles.saveBtn}>
                          {editingProgram ? 'Update Program' : 'Create Program'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MyStudio API Configuration */}
          {activeTab === 'mystudio' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>MyStudio API Integration</h2>
              <p className={styles.sectionDesc}>
                Connect to MyStudio to sync member data, schedules, and payments.
              </p>

              <div className={styles.formGroup}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={myStudioConfig.enabled}
                    onChange={e =>
                      setMyStudioConfig({ ...myStudioConfig, enabled: e.target.checked })
                    }
                    className={styles.checkbox}
                  />
                  <span>Enable MyStudio Integration</span>
                </label>
              </div>

              {myStudioConfig.enabled && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>API Key *</label>
                    <input
                      type="text"
                      value={myStudioConfig.apiKey}
                      onChange={e =>
                        setMyStudioConfig({ ...myStudioConfig, apiKey: e.target.value })
                      }
                      className={styles.input}
                      placeholder="Enter your MyStudio API key"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>API Endpoint</label>
                    <input
                      type="url"
                      value={myStudioConfig.endpoint}
                      onChange={e =>
                        setMyStudioConfig({ ...myStudioConfig, endpoint: e.target.value })
                      }
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Sync Interval (minutes)</label>
                    <input
                      type="number"
                      value={myStudioConfig.syncInterval}
                      onChange={e =>
                        setMyStudioConfig({
                          ...myStudioConfig,
                          syncInterval: parseInt(e.target.value),
                        })
                      }
                      className={styles.input}
                      min="5"
                      max="1440"
                    />
                    <small className={styles.helpText}>
                      How often to sync data with MyStudio (5-1440 minutes)
                    </small>
                  </div>
                </>
              )}

              <button onClick={handleMyStudioSave} className={styles.saveBtn}>
                Save MyStudio Settings
              </button>
            </div>
          )}

          {/* Email/SMTP Settings */}
          {activeTab === 'email' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Email Settings (SMTP)</h2>
              <p className={styles.sectionDesc}>
                SMTP credentials are managed via server environment variables. Set these in your Railway project variables to configure email sending.
              </p>

              <div className={styles.envVarTable}>
                <div className={styles.envVarRow}>
                  <div className={styles.envVarName}>SMTP_HOST</div>
                  <div className={styles.envVarValue}>{smtpStatus?.host || <span className={styles.notSet}>not set</span>}</div>
                </div>
                <div className={styles.envVarRow}>
                  <div className={styles.envVarName}>SMTP_PORT</div>
                  <div className={styles.envVarValue}>{smtpStatus?.port || <span className={styles.notSet}>not set</span>}</div>
                </div>
                <div className={styles.envVarRow}>
                  <div className={styles.envVarName}>SMTP_SECURE</div>
                  <div className={styles.envVarValue}>{smtpStatus ? String(smtpStatus.secure) : <span className={styles.notSet}>not set</span>}</div>
                </div>
                <div className={styles.envVarRow}>
                  <div className={styles.envVarName}>SMTP_USER</div>
                  <div className={styles.envVarValue}>
                    {smtpStatus?.userConfigured
                      ? <span className={styles.configured}>configured</span>
                      : <span className={styles.notSet}>not set</span>}
                  </div>
                </div>
                <div className={styles.envVarRow}>
                  <div className={styles.envVarName}>SMTP_PASS</div>
                  <div className={styles.envVarValue}>
                    {smtpStatus?.passConfigured
                      ? <span className={styles.configured}>configured</span>
                      : <span className={styles.notSet}>not set</span>}
                  </div>
                </div>
                <div className={styles.envVarRow}>
                  <div className={styles.envVarName}>SMTP_FROM_EMAIL</div>
                  <div className={styles.envVarValue}>{smtpStatus?.fromEmail || <span className={styles.notSet}>not set</span>}</div>
                </div>
                <div className={styles.envVarRow}>
                  <div className={styles.envVarName}>SMTP_FROM_NAME</div>
                  <div className={styles.envVarValue}>{smtpStatus?.fromName || <span className={styles.notSet}>not set</span>}</div>
                </div>
              </div>

              {smtpTestMessage && (
                <div className={smtpTestStatus === 'success' ? styles.successMessage : smtpTestStatus === 'error' ? styles.errorMessage : styles.infoMessage}>
                  {smtpTestMessage}
                </div>
              )}

              <div className={styles.buttonGroup}>
                <button
                  onClick={handleTestSmtpConnection}
                  className={styles.testBtn}
                  disabled={smtpTestStatus === 'testing' || !smtpStatus?.configured}
                >
                  {smtpTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                </button>
              </div>

              {!smtpStatus?.configured && (
                <div className={styles.warning}>
                  <WarningIcon size={20} />
                  <span>SMTP is not fully configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in your Railway environment variables.</span>
                </div>
              )}
            </div>
          )}

          {/* DKIM Settings */}
          {activeTab === 'dkim' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>DKIM Email Authentication</h2>
              <p className={styles.sectionDesc}>
                Configure DKIM (DomainKeys Identified Mail) to improve email deliverability and prevent spoofing.
              </p>

              <div className={styles.infoBox}>
                <h4>What is DKIM?</h4>
                <p>
                  DKIM adds a digital signature to your emails, proving they're actually from your domain.
                  This significantly improves deliverability and reduces the chance of your emails being marked as spam.
                </p>
              </div>

              <div className={styles.dkimSection}>
                <h3 className={styles.subsectionTitle}>Domain Configuration</h3>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Domain Name</label>
                  <div className={styles.inputGroup}>
                    <input
                      type="text"
                      value={dkimDomain}
                      onChange={(e) => setDkimDomain(e.target.value)}
                      className={styles.input}
                      placeholder="yourgym.com"
                    />
                    <button
                      onClick={handleGenerateDkimKeys}
                      className={styles.primaryBtn}
                      disabled={!dkimDomain || dkimGenerating}
                    >
                      {dkimGenerating ? 'Generating...' : 'Generate DKIM Keys'}
                    </button>
                  </div>
                  <small className={styles.helpText}>
                    Enter your email domain (e.g., if your email is contact@yourgym.com, enter yourgym.com)
                  </small>
                </div>

                {dkimConfig && (
                  <div className={styles.dkimDetails}>
                    <div className={styles.successMessage}>
                      DKIM keys generated successfully! Follow the steps below to activate DKIM.
                    </div>

                    <div className={styles.dkimSteps}>
                      <div className={styles.step}>
                        <span className={styles.stepNumber}>1</span>
                        <div className={styles.stepContent}>
                          <h4>Add DNS TXT Record</h4>
                          <p>Add this TXT record to your domain's DNS settings:</p>

                          <div className={styles.dnsRecord}>
                            <div className={styles.dnsField}>
                              <strong>Host/Name:</strong>
                              <code className={styles.code}>{dkimConfig.selector}._domainkey</code>
                            </div>
                            <div className={styles.dnsField}>
                              <strong>Type:</strong>
                              <code className={styles.code}>TXT</code>
                            </div>
                            <div className={styles.dnsField}>
                              <strong>Value:</strong>
                              <textarea
                                readOnly
                                value={`v=DKIM1; k=rsa; p=${dkimConfig.publicKey}`}
                                className={styles.dnsTextarea}
                                rows={3}
                              />
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(`v=DKIM1; k=rsa; p=${dkimConfig.publicKey}`);
                                  setDkimMessage('DNS record copied to clipboard!');
                                  setTimeout(() => setDkimMessage(''), 3000);
                                }}
                                className={styles.copyBtn}
                              >
                                Copy
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className={styles.step}>
                        <span className={styles.stepNumber}>2</span>
                        <div className={styles.stepContent}>
                          <h4>Wait for DNS Propagation</h4>
                          <p>DNS changes can take up to 48 hours to propagate, but usually happen within a few minutes.</p>
                        </div>
                      </div>

                      <div className={styles.step}>
                        <span className={styles.stepNumber}>3</span>
                        <div className={styles.stepContent}>
                          <h4>Verify DNS Configuration</h4>
                          <button
                            onClick={handleVerifyDkim}
                            className={styles.testBtn}
                            disabled={dkimVerifying}
                          >
                            {dkimVerifying ? 'Verifying...' : 'Verify DNS Record'}
                          </button>

                          {dkimVerifyResult && (
                            <div
                              className={
                                dkimVerifyResult.verified
                                  ? styles.successMessage
                                  : styles.errorMessage
                              }
                              style={{ marginTop: '1rem' }}
                            >
                              {dkimVerifyResult.message}
                            </div>
                          )}
                        </div>
                      </div>

                      {dkimVerifyResult?.verified && (
                        <div className={styles.step}>
                          <span className={styles.stepNumber}>4</span>
                          <div className={styles.stepContent}>
                            <h4>Enable DKIM Signing</h4>
                            <label className={styles.toggleLabel}>
                              <input
                                type="checkbox"
                                checked={dkimConfig.isActive}
                                onChange={(e) => handleToggleDkim(e.target.checked)}
                                className={styles.checkbox}
                              />
                              <span>Enable DKIM signing for outgoing emails</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {dkimMessage && !dkimVerifyResult && (
                  <div className={styles.infoMessage}>{dkimMessage}</div>
                )}

                {dkimConfigs.length > 0 && (
                  <div className={styles.existingConfigs}>
                    <h3 className={styles.subsectionTitle}>Configured Domains</h3>
                    <div className={styles.configsList}>
                      {dkimConfigs.map((config) => (
                        <div key={config.id} className={styles.configCard}>
                          <div className={styles.configInfo}>
                            <h4>{config.domain}</h4>
                            <p className={styles.configMeta}>
                              Selector: <code>{config.selector}</code> •
                              Created: {new Date(config.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className={styles.configActions}>
                            <span
                              className={`${styles.statusBadge} ${
                                config.isActive ? styles.active : styles.inactive
                              }`}
                            >
                              {config.isActive ? 'Active' : 'Inactive'}
                            </span>
                            <button
                              onClick={() => handleDeleteDkimConfig(config.domain)}
                              className={styles.iconBtnDanger}
                              title="Delete"
                            >
                              <DeleteIcon size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Social Settings */}
          {activeTab === 'social' && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Social Media Accounts</h2>
                  <p className={styles.sectionDesc}>
                    Connect your social media accounts to publish posts from DragonDesk: Social
                  </p>
                </div>
                <button onClick={handleAddSocialAccount} className={styles.primaryBtn}>
                  <AddIcon size={18} />
                  Add Account
                </button>
              </div>

              {socialAccounts.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No social media accounts connected yet.</p>
                  <p className={styles.helpText}>
                    Connect Facebook, Instagram, Twitter, or LinkedIn accounts to start posting.
                  </p>
                </div>
              ) : (
                <div className={styles.accountsList}>
                  {socialAccounts.map((account) => (
                    <div key={account.id} className={styles.accountCard}>
                      <div className={styles.accountHeader}>
                        <div className={styles.accountInfo}>
                          <span className={styles.platformBadge}>
                            {account.platform === 'facebook' && '📘 Facebook'}
                            {account.platform === 'instagram' && '📷 Instagram'}
                            {account.platform === 'twitter' && '🐦 Twitter'}
                            {account.platform === 'linkedin' && '💼 LinkedIn'}
                          </span>
                          <h3 className={styles.accountName}>{account.accountName}</h3>
                          {account.pageName && (
                            <span className={styles.pageName}>Page: {account.pageName}</span>
                          )}
                        </div>
                        <div className={styles.accountActions}>
                          <span className={`${styles.statusBadge} ${account.isActive ? styles.active : styles.inactive}`}>
                            {account.isActive ? 'Active' : 'Inactive'}
                          </span>
                          <button
                            onClick={() => handleEditSocialAccount(account)}
                            className={styles.iconBtn}
                            title="Edit"
                          >
                            <EditIcon size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteSocialAccount(account.id)}
                            className={styles.iconBtnDanger}
                            title="Delete"
                          >
                            <DeleteIcon size={18} />
                          </button>
                        </div>
                      </div>
                      <div className={styles.accountMeta}>
                        <span className={styles.metaItem}>
                          <strong>Account ID:</strong> {account.accountId}
                        </span>
                        {account.tokenExpiresAt && (
                          <span className={styles.metaItem}>
                            <strong>Token Expires:</strong> {new Date(account.tokenExpiresAt).toLocaleDateString()}
                          </span>
                        )}
                        <span className={styles.metaItem}>
                          <strong>Added:</strong> {new Date(account.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.infoBox} style={{ marginTop: '2rem' }}>
                <WarningIcon size={20} />
                <div>
                  <strong>Important:</strong> Social media access tokens are stored securely in the database.
                  <br />
                  You'll need to obtain API credentials from each platform's developer console.
                  <ul style={{ marginTop: '0.5rem', marginLeft: '1.5rem' }}>
                    <li>Facebook: <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-red)' }}>developers.facebook.com</a></li>
                    <li>Instagram: Requires Facebook Business account</li>
                    <li>Twitter: <a href="https://developer.twitter.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-red)' }}>developer.twitter.com</a></li>
                    <li>LinkedIn: <a href="https://developer.linkedin.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-red)' }}>developer.linkedin.com</a></li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Social Account Modal */}
          {showSocialModal && (
            <div className={styles.modal}>
              <div className={styles.modalContent}>
                <div className={styles.modalHeader}>
                  <h3>{editingSocialAccount ? 'Edit Social Account' : 'Add Social Account'}</h3>
                  <button
                    onClick={() => setShowSocialModal(false)}
                    className={styles.closeBtn}
                  >
                    ✕
                  </button>
                </div>
                <div className={styles.modalBody}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Platform *</label>
                    <select
                      value={socialForm.platform}
                      onChange={(e) => setSocialForm({ ...socialForm, platform: e.target.value as any })}
                      className={styles.select}
                    >
                      <option value="facebook">Facebook</option>
                      <option value="instagram">Instagram</option>
                      <option value="twitter">Twitter</option>
                      <option value="linkedin">LinkedIn</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Account Name *</label>
                    <input
                      type="text"
                      value={socialForm.accountName}
                      onChange={(e) => setSocialForm({ ...socialForm, accountName: e.target.value })}
                      className={styles.input}
                      placeholder="My Business Account"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Account ID *</label>
                    <input
                      type="text"
                      value={socialForm.accountId}
                      onChange={(e) => setSocialForm({ ...socialForm, accountId: e.target.value })}
                      className={styles.input}
                      placeholder="123456789"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Page ID (for Facebook/Instagram)</label>
                    <input
                      type="text"
                      value={socialForm.pageId}
                      onChange={(e) => setSocialForm({ ...socialForm, pageId: e.target.value })}
                      className={styles.input}
                      placeholder="987654321"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Page Name</label>
                    <input
                      type="text"
                      value={socialForm.pageName}
                      onChange={(e) => setSocialForm({ ...socialForm, pageName: e.target.value })}
                      className={styles.input}
                      placeholder="My Business Page"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Access Token *</label>
                    <textarea
                      value={socialForm.accessToken}
                      onChange={(e) => setSocialForm({ ...socialForm, accessToken: e.target.value })}
                      className={styles.textarea}
                      rows={3}
                      placeholder="Paste your access token here"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Refresh Token (optional)</label>
                    <input
                      type="text"
                      value={socialForm.refreshToken}
                      onChange={(e) => setSocialForm({ ...socialForm, refreshToken: e.target.value })}
                      className={styles.input}
                      placeholder="Refresh token"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Token Expiration Date</label>
                    <input
                      type="datetime-local"
                      value={socialForm.tokenExpiresAt}
                      onChange={(e) => setSocialForm({ ...socialForm, tokenExpiresAt: e.target.value })}
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={socialForm.isActive}
                        onChange={(e) => setSocialForm({ ...socialForm, isActive: e.target.checked })}
                      />
                      <span>Account is active</span>
                    </label>
                  </div>
                </div>
                <div className={styles.modalFooter}>
                  <button onClick={() => setShowSocialModal(false)} className={styles.cancelBtn}>
                    Cancel
                  </button>
                  <button onClick={handleSaveSocialAccount} className={styles.saveBtn}>
                    {editingSocialAccount ? 'Update Account' : 'Add Account'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Theme Settings */}
          {activeTab === 'theme' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Appearance</h2>
              <p className={styles.sectionDesc}>Customize how DragonDesk looks to you.</p>

              <div className={styles.themeOptions}>
                <div
                  className={`${styles.themeOption} ${theme === 'dark' ? styles.selected : ''}`}
                  onClick={() => handleThemeChange('dark')}
                >
                  <div className={styles.themePreview} data-theme="dark">
                    <div className={styles.previewHeader}></div>
                    <div className={styles.previewSidebar}></div>
                    <div className={styles.previewContent}></div>
                  </div>
                  <div className={styles.themeName}>Dark Mode</div>
                  {theme === 'dark' && (
                    <div className={styles.checkmark}>
                      <CheckIcon size={20} />
                    </div>
                  )}
                </div>

                <div
                  className={`${styles.themeOption} ${theme === 'light' ? styles.selected : ''}`}
                  onClick={() => handleThemeChange('light')}
                >
                  <div className={styles.themePreview} data-theme="light">
                    <div className={styles.previewHeader}></div>
                    <div className={styles.previewSidebar}></div>
                    <div className={styles.previewContent}></div>
                  </div>
                  <div className={styles.themeName}>Light Mode</div>
                  {theme === 'light' && (
                    <div className={styles.checkmark}>
                      <CheckIcon size={20} />
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.warning}>
                <WarningIcon size={20} />
                <span>Theme preference is saved locally to your browser.</span>
              </div>
            </div>
          )}

          {/* User Management */}
          {activeTab === 'users' && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>User Management</h2>
                  <p className={styles.sectionDesc}>
                    Create and manage system users and their permissions.
                  </p>
                </div>
                <button onClick={handleAddUser} className={styles.primaryBtn}>
                  <AddIcon size={16} />
                  Add User
                </button>
              </div>

              <div className={styles.userList}>
                {users.map(u => (
                  <div key={u.id} className={styles.userCard}>
                    <div className={styles.userInfo}>
                      <div className={styles.userName}>
                        {u.firstName} {u.lastName}
                        {u.id === user?.id && <span className={styles.currentUserBadge}>(You)</span>}
                      </div>
                      <div className={styles.userEmail}>{u.email}</div>
                      <div className={styles.userMeta}>
                        <span>@{u.username}</span>
                        {' • '}
                        <span className={styles.userRole}>{u.role.replace('_', ' ')}</span>
                      </div>
                      {u.isInstructor && (
                        <div className={styles.instructorBadge}>Instructor</div>
                      )}
                      {u.locationId && (
                        <div className={styles.userLocation}>
                          Location: {locations.find(l => l.id === u.locationId)?.name || 'Unknown'}
                        </div>
                      )}
                    </div>
                    <div className={styles.userActions}>
                      <button
                        onClick={() => handleEditUser(u)}
                        className={styles.editBtn}
                      >
                        <EditIcon size={16} />
                        Edit
                      </button>
                      {u.id !== user?.id && (
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className={styles.deleteBtn}
                        >
                          <DeleteIcon size={16} />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {showUserModal && (
                <div className={styles.modal}>
                  <div className={styles.modalContent}>
                    <div className={styles.modalHeader}>
                      <h2>{editingUser ? 'Edit User' : 'Create New User'}</h2>
                      <button onClick={() => setShowUserModal(false)} className={styles.closeBtn}>
                        ×
                      </button>
                    </div>

                    <div className={styles.modalBody}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>Username *</label>
                        <input
                          type="text"
                          value={userForm.username}
                          onChange={e => setUserForm({ ...userForm, username: e.target.value })}
                          className={styles.input}
                          placeholder="e.g., jsmith"
                          disabled={!!editingUser}
                        />
                        {editingUser && (
                          <small className={styles.helpText}>Username cannot be changed</small>
                        )}
                      </div>

                      <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>First Name *</label>
                          <input
                            type="text"
                            value={userForm.firstName}
                            onChange={e => setUserForm({ ...userForm, firstName: e.target.value })}
                            className={styles.input}
                            placeholder="John"
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Last Name *</label>
                          <input
                            type="text"
                            value={userForm.lastName}
                            onChange={e => setUserForm({ ...userForm, lastName: e.target.value })}
                            className={styles.input}
                            placeholder="Smith"
                          />
                        </div>
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.label}>Email *</label>
                        <input
                          type="email"
                          value={userForm.email}
                          onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                          className={styles.input}
                          placeholder="john@example.com"
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          Password {editingUser ? '(leave blank to keep current)' : '*'}
                        </label>
                        <input
                          type="password"
                          value={userForm.password}
                          onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                          className={styles.input}
                          placeholder={editingUser ? 'Enter new password or leave blank' : 'Enter password'}
                        />
                      </div>

                      <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Role *</label>
                          <select
                            value={userForm.role}
                            onChange={e => setUserForm({ ...userForm, role: e.target.value as User['role'] })}
                            className={styles.input}
                          >
                            <option value="staff">Staff</option>
                            <option value="instructor">Instructor</option>
                            {(user?.role === 'admin' || user?.role === 'super_admin') && (
                              <>
                                <option value="admin">Admin</option>
                                <option value="super_admin">Super Admin</option>
                              </>
                            )}
                          </select>
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Location</label>
                          <select
                            value={userForm.locationId || ''}
                            onChange={e => setUserForm({ ...userForm, locationId: e.target.value ? parseInt(e.target.value) : null })}
                            className={styles.input}
                          >
                            <option value="">All Locations</option>
                            {locations.map(location => (
                              <option key={location.id} value={location.id}>
                                {location.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.toggleLabel}>
                          <input
                            type="checkbox"
                            checked={userForm.isInstructor}
                            onChange={e => setUserForm({ ...userForm, isInstructor: e.target.checked })}
                          />
                          <span>This user is an instructor</span>
                        </label>
                      </div>

                      {userForm.isInstructor && (
                        <>
                          <div className={styles.formGroup}>
                            <label className={styles.label}>Certifications</label>
                            <input
                              type="text"
                              value={userForm.certifications}
                              onChange={e => setUserForm({ ...userForm, certifications: e.target.value })}
                              className={styles.input}
                              placeholder="e.g., Black Belt BJJ, CPR Certified"
                            />
                          </div>

                          <div className={styles.formGroup}>
                            <label className={styles.label}>Specialties</label>
                            <input
                              type="text"
                              value={userForm.specialties}
                              onChange={e => setUserForm({ ...userForm, specialties: e.target.value })}
                              className={styles.input}
                              placeholder="e.g., Kids Classes, Competition Training"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <div className={styles.modalActions}>
                      <button onClick={() => setShowUserModal(false)} className={styles.secondaryBtn}>
                        Cancel
                      </button>
                      <button onClick={handleSaveUser} className={styles.saveBtn}>
                        {editingUser ? 'Update User' : 'Create User'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Database Settings */}
          {activeTab === 'database' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Database Settings</h2>
              <p className={styles.sectionDesc}>
                Configure database backup and maintenance options.
              </p>

              <div className={styles.formGroup}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={databaseConfig.autoBackup}
                    onChange={e =>
                      setDatabaseConfig({ ...databaseConfig, autoBackup: e.target.checked })
                    }
                    className={styles.checkbox}
                  />
                  <span>Enable Automatic Backups</span>
                </label>
              </div>

              {databaseConfig.autoBackup && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Backup Interval (hours)</label>
                    <input
                      type="number"
                      value={databaseConfig.backupInterval}
                      onChange={e =>
                        setDatabaseConfig({
                          ...databaseConfig,
                          backupInterval: parseInt(e.target.value),
                        })
                      }
                      className={styles.input}
                      min="1"
                      max="168"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Maximum Backups to Keep</label>
                    <input
                      type="number"
                      value={databaseConfig.maxBackups}
                      onChange={e =>
                        setDatabaseConfig({
                          ...databaseConfig,
                          maxBackups: parseInt(e.target.value),
                        })
                      }
                      className={styles.input}
                      min="1"
                      max="30"
                    />
                  </div>
                </>
              )}

              <div className={styles.formGroup}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={databaseConfig.enableLogging}
                    onChange={e =>
                      setDatabaseConfig({
                        ...databaseConfig,
                        enableLogging: e.target.checked,
                      })
                    }
                    className={styles.checkbox}
                  />
                  <span>Enable Query Logging</span>
                </label>
                <small className={styles.helpText}>
                  Log all database queries for debugging (may impact performance)
                </small>
              </div>

              <button onClick={handleDatabaseSave} className={styles.saveBtn}>
                Save Database Settings
              </button>

              <div className={styles.warning}>
                <WarningIcon size={20} />
                <span>
                  Database backup functionality requires additional server configuration.
                </span>
              </div>
            </div>
          )}

          {/* API Integrations */}
          {activeTab === 'integrations' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>API Integrations</h2>
              <p className={styles.sectionDesc}>
                Connect third-party services to extend DragonDesk functionality.
              </p>

              {integrations.map(integration => (
                <div key={integration.id} className={styles.integrationCard}>
                  <div className={styles.integrationHeader}>
                    <label className={styles.toggleLabel}>
                      <input
                        type="checkbox"
                        checked={integration.enabled}
                        onChange={() => handleIntegrationToggle(integration.id)}
                        className={styles.checkbox}
                      />
                      <span className={styles.integrationName}>{integration.name}</span>
                    </label>
                  </div>

                  {integration.enabled && (
                    <div className={styles.integrationBody}>
                      {/* Twilio-specific fields */}
                      {integration.id === 'twilio' ? (
                        <>
                          <div className={styles.infoBox}>
                            <h4>Twilio Setup</h4>
                            <p>
                              Get your Twilio credentials from the{' '}
                              <a
                                href="https://console.twilio.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--color-red)' }}
                              >
                                Twilio Console
                              </a>
                              . You'll need your Account SID, Auth Token, and a Twilio phone number to send SMS.
                            </p>
                          </div>

                          <div className={styles.formGroup}>
                            <label className={styles.label}>Account SID *</label>
                            <input
                              type="text"
                              value={integration.apiKey || ''}
                              onChange={e =>
                                handleIntegrationUpdate(integration.id, 'apiKey', e.target.value)
                              }
                              className={styles.input}
                              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            />
                            <small className={styles.helpText}>
                              Your Twilio Account SID (starts with "AC")
                            </small>
                          </div>

                          <div className={styles.formGroup}>
                            <label className={styles.label}>Auth Token *</label>
                            <input
                              type="password"
                              value={integration.apiSecret || ''}
                              onChange={e =>
                                handleIntegrationUpdate(integration.id, 'apiSecret', e.target.value)
                              }
                              className={styles.input}
                              placeholder="Your Twilio Auth Token"
                            />
                            <small className={styles.helpText}>
                              Found in the Twilio Console under Account Info
                            </small>
                          </div>

                          <div className={styles.formGroup}>
                            <label className={styles.label}>Twilio Phone Number *</label>
                            <input
                              type="tel"
                              value={integration.endpoint || ''}
                              onChange={e =>
                                handleIntegrationUpdate(integration.id, 'endpoint', e.target.value)
                              }
                              className={styles.input}
                              placeholder="+1234567890"
                            />
                            <small className={styles.helpText}>
                              Your Twilio phone number in E.164 format (e.g., +1234567890)
                            </small>
                          </div>

                          {twilioTestMessage && (
                            <div
                              className={
                                twilioTestStatus === 'success'
                                  ? styles.successMessage
                                  : twilioTestStatus === 'error'
                                  ? styles.errorMessage
                                  : styles.infoMessage
                              }
                            >
                              {twilioTestMessage}
                            </div>
                          )}

                          <div className={styles.buttonGroup}>
                            <button
                              onClick={handleTestTwilioConnection}
                              className={styles.testBtn}
                              disabled={
                                twilioTestStatus === 'testing' ||
                                !integration.apiKey ||
                                !integration.apiSecret
                              }
                            >
                              {twilioTestStatus === 'testing' ? 'Testing Connection...' : 'Test Connection'}
                            </button>
                          </div>
                        </>
                      ) : (
                        /* Generic integration fields */
                        <>
                          <div className={styles.formGroup}>
                            <label className={styles.label}>API Key</label>
                            <input
                              type="text"
                              value={integration.apiKey || ''}
                              onChange={e =>
                                handleIntegrationUpdate(integration.id, 'apiKey', e.target.value)
                              }
                              className={styles.input}
                              placeholder="Enter API key"
                            />
                          </div>

                          {integration.apiSecret !== undefined && (
                            <div className={styles.formGroup}>
                              <label className={styles.label}>API Secret</label>
                              <input
                                type="password"
                                value={integration.apiSecret || ''}
                                onChange={e =>
                                  handleIntegrationUpdate(
                                    integration.id,
                                    'apiSecret',
                                    e.target.value
                                  )
                                }
                                className={styles.input}
                                placeholder="Enter API secret"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <button onClick={handleIntegrationsSave} className={styles.saveBtn}>
                Save Integrations
              </button>

              <div className={styles.warning}>
                <WarningIcon size={20} />
                <span>
                  API credentials are stored locally in your browser. For production use,
                  consider using environment variables on the server.
                </span>
              </div>
            </div>
          )}

          {/* Stripe Payments Settings */}
          {activeTab === 'stripe' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Stripe Payments</h2>
              <p className={styles.sectionDesc}>
                Configure Stripe to accept payments and manage subscriptions for your members. Each location can have its own Stripe account.
              </p>

              <div className={styles.infoBox}>
                <h4>How to configure per-location Stripe accounts</h4>
                <p>
                  Each location can have its own separate Stripe account (useful when locations are separate LLCs).
                  Use the <strong style={{ color: '#60a5fa' }}>Location dropdown below</strong> to switch between locations —
                  the keys you enter and save will apply only to that location.
                  Select <strong style={{ color: '#60a5fa' }}>Global</strong> to set a shared fallback account used by any location
                  that doesn't have its own keys configured. Get your API keys from the{' '}
                  <a
                    href="https://dashboard.stripe.com/apikeys"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--color-red)' }}
                  >
                    Stripe Dashboard
                  </a>
                  .
                </p>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Location</label>
                <select
                  value={billingLocationId ?? ''}
                  onChange={e => {
                    const val = e.target.value === '' ? null : Number(e.target.value);
                    setBillingLocationId(val);
                    loadBillingSettings(val);
                  }}
                  className={styles.select}
                >
                  <option value="">Global (All Locations)</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={billingSettings.isActive}
                    onChange={e => setBillingSettings({ ...billingSettings, isActive: e.target.checked })}
                    className={styles.checkbox}
                  />
                  <span>Enable Stripe Payments</span>
                </label>
              </div>

              {billingSettings.isActive && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Publishable Key *</label>
                    <input
                      type="text"
                      value={billingSettings.stripePublishableKey}
                      onChange={e => setBillingSettings({ ...billingSettings, stripePublishableKey: e.target.value })}
                      className={styles.input}
                      placeholder="pk_test_..."
                    />
                    <small className={styles.helpText}>
                      This key is used client-side for Stripe Elements
                    </small>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Secret Key *</label>
                    <input
                      type="password"
                      value={billingSettings.stripeSecretKey}
                      onChange={e => setBillingSettings({ ...billingSettings, stripeSecretKey: e.target.value })}
                      className={styles.input}
                      placeholder="sk_test_..."
                    />
                    <small className={styles.helpText}>
                      Keep this key secret. Never expose it in client-side code.
                    </small>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Webhook Secret</label>
                    <input
                      type="password"
                      value={billingSettings.stripeWebhookSecret}
                      onChange={e => setBillingSettings({ ...billingSettings, stripeWebhookSecret: e.target.value })}
                      className={styles.input}
                      placeholder="whsec_..."
                    />
                    <small className={styles.helpText}>
                      Found in Stripe Dashboard → Developers → Webhooks
                    </small>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Webhook URL</label>
                    <div className={styles.inputGroup}>
                      <input
                        type="text"
                        value={`${window.location.origin}/api/stripe/webhooks`}
                        readOnly
                        className={styles.input}
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/stripe/webhooks`)}
                        className={styles.copyBtn}
                        title="Copy to clipboard"
                      >
                        Copy
                      </button>
                    </div>
                    <small className={styles.helpText}>
                      Add this URL to your Stripe webhook endpoints
                    </small>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Currency</label>
                      <select
                        value={billingSettings.currency}
                        onChange={e => setBillingSettings({ ...billingSettings, currency: e.target.value })}
                        className={styles.select}
                      >
                        <option value="usd">USD - US Dollar</option>
                        <option value="eur">EUR - Euro</option>
                        <option value="gbp">GBP - British Pound</option>
                        <option value="cad">CAD - Canadian Dollar</option>
                        <option value="aud">AUD - Australian Dollar</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Default Tax Rate (%)</label>
                      <input
                        type="number"
                        value={billingSettings.defaultTaxRate}
                        onChange={e => setBillingSettings({ ...billingSettings, defaultTaxRate: parseFloat(e.target.value) || 0 })}
                        className={styles.input}
                        min="0"
                        max="100"
                        step="0.01"
                      />
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Default Trial Days</label>
                      <input
                        type="number"
                        value={billingSettings.trialDays}
                        onChange={e => setBillingSettings({ ...billingSettings, trialDays: parseInt(e.target.value) || 0 })}
                        className={styles.input}
                        min="0"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Grace Period Days</label>
                      <input
                        type="number"
                        value={billingSettings.gracePeriodDays}
                        onChange={e => setBillingSettings({ ...billingSettings, gracePeriodDays: parseInt(e.target.value) || 0 })}
                        className={styles.input}
                        min="0"
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.toggleLabel}>
                      <input
                        type="checkbox"
                        checked={billingSettings.autoRetryFailedPayments}
                        onChange={e => setBillingSettings({ ...billingSettings, autoRetryFailedPayments: e.target.checked })}
                        className={styles.checkbox}
                      />
                      <span>Auto-retry failed payments</span>
                    </label>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.toggleLabel}>
                      <input
                        type="checkbox"
                        checked={billingSettings.sendPaymentReceipts}
                        onChange={e => setBillingSettings({ ...billingSettings, sendPaymentReceipts: e.target.checked })}
                        className={styles.checkbox}
                      />
                      <span>Send payment receipts to members</span>
                    </label>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.toggleLabel}>
                      <input
                        type="checkbox"
                        checked={billingSettings.sendFailedPaymentAlerts}
                        onChange={e => setBillingSettings({ ...billingSettings, sendFailedPaymentAlerts: e.target.checked })}
                        className={styles.checkbox}
                      />
                      <span>Send failed payment alerts</span>
                    </label>
                  </div>

                  {stripeTestMessage && (
                    <div
                      className={
                        stripeTestStatus === 'success'
                          ? styles.successMessage
                          : stripeTestStatus === 'error'
                          ? styles.errorMessage
                          : styles.infoMessage
                      }
                    >
                      {stripeTestMessage}
                    </div>
                  )}

                  <div className={styles.buttonGroup}>
                    <button
                      onClick={handleTestStripeConnection}
                      className={styles.testBtn}
                      disabled={stripeTestStatus === 'testing' || !billingSettings.stripeSecretKey}
                    >
                      {stripeTestStatus === 'testing' ? 'Testing Connection...' : 'Test Connection'}
                    </button>
                  </div>
                </>
              )}

              <button onClick={handleSaveBillingSettings} className={styles.saveBtn}>
                Save Billing Settings
              </button>
            </div>
          )}

          {/* Pricing Plans Settings */}
          {activeTab === 'pricing' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Pricing Plans</h2>
              <p className={styles.sectionDesc}>
                Create and manage subscription pricing plans for your members.
              </p>

              <button onClick={handleAddPricingPlan} className={styles.addPricingBtn}>
                <AddIcon size={20} />
                Add Pricing Plan
              </button>

              {pricingPlans.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No pricing plans yet. Create your first plan to start accepting payments.</p>
                </div>
              ) : (
                <div className={styles.pricingGrid}>
                  {pricingPlans.map(plan => (
                    <div key={plan.id} className={`${styles.pricingCard} ${!plan.isActive ? styles.inactive : ''}`}>
                      <div className={styles.pricingHeader}>
                        <h3>{plan.name}</h3>
                        {!plan.isActive && <span className={styles.inactiveBadge}>Inactive</span>}
                      </div>
                      <div className={styles.pricingPrice}>
                        {formatCurrency(plan.amount, plan.currency)}
                        <span className={styles.pricingInterval}>/{plan.billingInterval}</span>
                      </div>
                      <div className={styles.pricingDetails}>
                        <p><strong>Account Type:</strong> {plan.accountType}</p>
                        <p><strong>Program:</strong> {plan.programType || 'All'}</p>
                        <p><strong>Age Group:</strong> {plan.membershipAge || 'All'}</p>
                        {plan.trialDays > 0 && <p><strong>Trial:</strong> {plan.trialDays} days</p>}
                        {plan.stripePriceId && (
                          <p className={styles.stripeSynced}>
                            <CheckIcon size={14} /> Synced to Stripe
                          </p>
                        )}
                      </div>
                      <div className={styles.pricingActions}>
                        <button onClick={() => handleEditPricingPlan(plan)} className={styles.editBtn}>
                          <EditIcon size={16} /> Edit
                        </button>
                        {!plan.stripePriceId && (
                          <button onClick={() => handleSyncPlanToStripe(plan.id)} className={styles.syncBtn}>
                            Sync to Stripe
                          </button>
                        )}
                        <button onClick={() => handleDeletePricingPlan(plan.id)} className={styles.deleteBtn}>
                          <DeleteIcon size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pricing Plan Modal */}
          {showPricingModal && (
            <div className={styles.modal}>
              <div className={styles.modalContent}>
                <div className={styles.modalHeader}>
                  <h2>{editingPlan ? 'Edit Pricing Plan' : 'Add Pricing Plan'}</h2>
                  <button onClick={() => setShowPricingModal(false)} className={styles.closeBtn}>×</button>
                </div>
                <form onSubmit={handleSavePricingPlan} className={styles.form}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Plan Name *</label>
                    <input
                      type="text"
                      value={pricingForm.name}
                      onChange={e => setPricingForm({ ...pricingForm, name: e.target.value })}
                      className={styles.input}
                      placeholder="e.g., Basic Monthly"
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Description</label>
                    <textarea
                      value={pricingForm.description}
                      onChange={e => setPricingForm({ ...pricingForm, description: e.target.value })}
                      className={styles.textarea}
                      placeholder="Plan description..."
                      rows={2}
                    />
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Amount *</label>
                      <div className={styles.currencyInput}>
                        <span className={styles.currencySymbol}>$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={amountDisplay}
                          onChange={e => {
                            const val = e.target.value;
                            if (/^\d*\.?\d{0,2}$/.test(val) || val === '') {
                              setAmountDisplay(val);
                              setPricingForm({ ...pricingForm, amount: Math.round(parseFloat(val || '0') * 100) });
                            }
                          }}
                          onBlur={() => {
                            const num = parseFloat(amountDisplay) || 0;
                            setAmountDisplay(num.toFixed(2));
                          }}
                          className={styles.input}
                          placeholder="0.00"
                          required
                        />
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Billing Interval *</label>
                      <select
                        value={pricingForm.billingInterval}
                        onChange={e => setPricingForm({ ...pricingForm, billingInterval: e.target.value as any })}
                        className={styles.select}
                        required
                      >
                        <option value="week">Weekly</option>
                        <option value="month">Monthly</option>
                        <option value="year">Yearly</option>
                      </select>
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Account Type *</label>
                      <select
                        value={pricingForm.accountType}
                        onChange={e => setPricingForm({ ...pricingForm, accountType: e.target.value as any })}
                        className={styles.select}
                        required
                      >
                        <option value="basic">Basic</option>
                        <option value="premium">Premium</option>
                        <option value="elite">Elite</option>
                        <option value="family">Family</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Program</label>
                      <select
                        value={pricingForm.programType}
                        onChange={e => setPricingForm({ ...pricingForm, programType: e.target.value as any })}
                        className={styles.select}
                      >
                        <option value="All">All Programs</option>
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
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Age Group</label>
                      <select
                        value={pricingForm.membershipAge}
                        onChange={e => setPricingForm({ ...pricingForm, membershipAge: e.target.value as any })}
                        className={styles.select}
                      >
                        <option value="All">All Ages</option>
                        <option value="Adult">Adult</option>
                        <option value="Kids">Kids</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Trial Days</label>
                      <input
                        type="number"
                        value={pricingForm.trialDays}
                        onChange={e => setPricingForm({ ...pricingForm, trialDays: parseInt(e.target.value) || 0 })}
                        className={styles.input}
                        min="0"
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.toggleLabel}>
                      <input
                        type="checkbox"
                        checked={pricingForm.isActive}
                        onChange={e => setPricingForm({ ...pricingForm, isActive: e.target.checked })}
                        className={styles.checkbox}
                      />
                      <span>Active</span>
                    </label>
                  </div>

                  <div className={styles.modalFooter}>
                    <button type="button" onClick={() => setShowPricingModal(false)} className={styles.cancelBtn}>
                      Cancel
                    </button>
                    <button type="submit" className={styles.saveBtn}>
                      {editingPlan ? 'Update Plan' : 'Create Plan'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Lead Forms Section */}
          {activeTab === 'leadforms' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Lead Forms</h2>
              <p className={styles.sectionDesc}>
                Capture leads from your website with embeddable forms. Add leads directly to your CRM.
              </p>

              <div className={styles.infoBox}>
                <h4>How to Use</h4>
                <p>
                  Copy the embed code below and paste it into your website where you want the lead form to appear.
                  Or use the direct link to send prospects to a standalone form page.
                </p>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Direct Form Link</label>
                <div className={styles.inputGroup}>
                  <input
                    type="text"
                    value={`${window.location.origin}/lead-form`}
                    readOnly
                    className={styles.input}
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/lead-form`);
                      showSaveMessage('Link copied to clipboard!');
                    }}
                    className={styles.primaryBtn}
                  >
                    Copy Link
                  </button>
                </div>
                <span className={styles.helpText}>
                  Share this link on social media, email campaigns, or anywhere you want to collect leads.
                </span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Embed Code (iframe)</label>
                <textarea
                  value={`<iframe src="${window.location.origin}/lead-form" width="100%" height="800" frameborder="0" style="border: none; border-radius: 8px;"></iframe>`}
                  readOnly
                  className={styles.dnsTextarea}
                  rows={4}
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`<iframe src="${window.location.origin}/lead-form" width="100%" height="800" frameborder="0" style="border: none; border-radius: 8px;"></iframe>`);
                    showSaveMessage('Embed code copied to clipboard!');
                  }}
                  className={styles.copyBtn}
                >
                  Copy Embed Code
                </button>
                <span className={styles.helpText}>
                  Paste this code into your website's HTML to embed the lead form.
                </span>
              </div>

              <div className={styles.dkimSection}>
                <h3 className={styles.subsectionTitle}>Customization Options</h3>
                <p className={styles.sectionDesc}>
                  You can customize the form appearance by adding URL parameters:
                </p>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Theme</label>
                  <div className={styles.inputGroup}>
                    <input
                      type="text"
                      value={`${window.location.origin}/lead-form?theme=light`}
                      readOnly
                      className={styles.input}
                    />
                  </div>
                  <span className={styles.helpText}>
                    Add <span className={styles.code}>?theme=light</span> or <span className={styles.code}>?theme=dark</span> to change the form theme.
                  </span>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Custom Colors</label>
                  <textarea
                    value={`${window.location.origin}/lead-form?theme=light&bg=%23ffffff&text=%23000000&accent=%23dc2626`}
                    readOnly
                    className={styles.dnsTextarea}
                    rows={2}
                  />
                  <span className={styles.helpText}>
                    Add URL-encoded hex colors: <span className={styles.code}>bg</span> (background),
                    <span className={styles.code}>text</span> (text color), <span className={styles.code}>accent</span> (button color).
                  </span>
                </div>
              </div>

              <div className={styles.dkimSection}>
                <h3 className={styles.subsectionTitle}>Form Preview</h3>
                <p className={styles.sectionDesc}>
                  See how your lead form looks:
                </p>
                <div style={{ marginTop: '1rem', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <iframe
                    src="/lead-form"
                    width="100%"
                    height="800"
                    style={{ border: 'none' }}
                    title="Lead Form Preview"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
