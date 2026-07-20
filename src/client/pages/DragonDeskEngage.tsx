import React, { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { api } from '../utils/api';
import { Campaign, Audience, EmailTemplate } from '../types';
import EmailEditor from '../components/EmailEditor';
import { useLocation } from '../contexts/LocationContext';
import { useToast } from '../components/Toast';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import styles from './DragonDeskEngage.module.css';

type ViewMode = 'list' | 'create' | 'edit';

interface SMSCampaign {
  id: number;
  name: string;
  description?: string;
  audienceId: number;
  audienceName?: string;
  message: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledFor?: string;
  sentAt?: string;
  recipientCount: number;
  successCount: number;
  failureCount: number;
  cost: number;
  createdAt: string;
}

const DragonDeskEngage = () => {
  const { toast, confirm } = useToast();
  const { selectedLocation, isAllLocations } = useLocation();
  const [activeTab, setActiveTab] = useState<'campaigns' | 'templates' | 'sms' | 'analytics'>('campaigns');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [smsCampaigns, setSmsCampaigns] = useState<SMSCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [editingSMSCampaign, setEditingSMSCampaign] = useState<SMSCampaign | null>(null);

  // "Preview Recipients" modal — shows exactly who a campaign would email.
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewSms, setPreviewSms] = useState<SMSCampaign | null>(null);
  const [previewSmsData, setPreviewSmsData] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: '',
    audienceId: '',
    subject: '',
    body: '',
    status: 'draft' as 'draft' | 'active' | 'paused' | 'completed',
  });

  const [templateFormData, setTemplateFormData] = useState({
    name: '',
    description: '',
    subject: '',
    body: '',
  });

  const [smsFormData, setSmsFormData] = useState({
    name: '',
    description: '',
    audienceId: '',
    message: '',
    scheduledFor: '',
  });

  const [testEmail, setTestEmail] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [characterCount, setCharacterCount] = useState(0);

  useEffect(() => {
    loadData();
  }, [selectedLocation, isAllLocations]);

  const loadData = async () => {
    try {
      const locationId = isAllLocations ? 'all' : selectedLocation?.id;
      const [campaignsData, audiencesData, templatesData, smsData] = await Promise.all([
        api.get(`/campaigns?type=email&locationId=${locationId}`),
        api.get('/audiences'),
        api.get('/templates'),
        api.get(`/sms-campaigns?locationId=${locationId}`),
      ]);

      const parsedAudiences = audiencesData.map((a: any) => ({
        ...a,
        filters: typeof a.filters === 'string' ? JSON.parse(a.filters) : a.filters,
      }));

      const parsedCampaigns = campaignsData.map((c: any) => ({
        ...c,
        content: c.content && typeof c.content === 'string' ? JSON.parse(c.content) : c.content,
      }));

      setCampaigns(parsedCampaigns);
      setAudiences(parsedAudiences);
      setTemplates(templatesData);
      setSmsCampaigns(smsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCampaign = () => {
    setEditingCampaign(null);
    setFormData({
      name: '',
      audienceId: '',
      subject: '',
      body: '',
      status: 'draft',
    });
    setViewMode('create');
  };

  const handleEditCampaign = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name,
      audienceId: campaign.audienceId.toString(),
      subject: campaign.content?.subject || '',
      body: campaign.content?.body || '',
      status: campaign.status,
    });
    setViewMode('edit');
  };

  const handleSubmitCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        type: 'email',
        audienceId: parseInt(formData.audienceId),
        status: formData.status,
        content: {
          subject: formData.subject,
          body: formData.body,
        },
      };

      if (editingCampaign) {
        await api.put(`/campaigns/${editingCampaign.id}`, payload);
      } else {
        await api.post('/campaigns', payload);
      }

      setViewMode('list');
      setEditingCampaign(null);
      loadData();
    } catch (error: any) {
      toast(error.message || `Failed to ${editingCampaign ? 'update' : 'create'} campaign`, 'error');
    }
  };

  const handleDeleteCampaign = async (id: number) => {
    if (!await confirm({ title: 'Delete Campaign', message: 'Are you sure you want to delete this campaign?', confirmLabel: 'Delete', danger: true })) return;

    try {
      await api.delete(`/campaigns/${id}`);
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to delete campaign', 'error');
    }
  };

  const handleSendCampaign = async (campaign: Campaign) => {
    const audience = audiences.find((a) => a.id === campaign.audienceId);

    // Resolve the EXACT recipient count the send will use, so the confirmation
    // shows a real number (this is the safeguard against a wrong-audience blast).
    let preview: any;
    try {
      preview = await api.get(`/email/send-campaign/${campaign.id}/preview`);
    } catch (error: any) {
      toast(error.message || 'Could not load the recipient count for this campaign', 'error');
      return;
    }

    const n = preview.recipientCount ?? 0;
    if (n === 0) {
      toast('No recipients with an email address match this audience.', 'error');
      return;
    }

    const allMembers = preview.filterCount === 0;
    const warn = allMembers
      ? ' ⚠ This audience has NO filters, so it targets EVERY member.'
      : '';
    const skipped = preview.totalMatched > n ? ` (${preview.totalMatched - n} matched but have no email and will be skipped.)` : '';

    if (!await confirm({
      title: allMembers ? 'Send to ALL members?' : 'Send Campaign',
      message: `This will email ${n} ${n === 1 ? 'person' : 'people'} in the "${audience?.name || 'selected'}" audience.${warn}${skipped} This sends real email and can't be undone.`,
      confirmLabel: `Send to ${n}`,
      danger: allMembers,
    })) return;

    try {
      // Pass confirmSendAll only when the user knowingly confirmed a no-filter send.
      const result = await api.post(`/email/send-campaign/${campaign.id}`, { confirmSendAll: allMembers });
      toast(`Campaign sent — ${result.sent} delivered${result.failed ? `, ${result.failed} failed` : ''}.`, 'success');
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to send campaign', 'error');
    }
  };

  const openRecipientPreview = async (campaign: Campaign) => {
    setPreviewCampaign(campaign);
    setPreviewData(null);
    setPreviewSearch('');
    setPreviewLoading(true);
    try {
      const data = await api.get(`/email/send-campaign/${campaign.id}/recipients`);
      setPreviewData(data);
    } catch (error: any) {
      toast(error.message || 'Failed to load recipients', 'error');
      setPreviewCampaign(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateFormData({
      name: '',
      description: '',
      subject: '',
      body: '',
    });
    setViewMode('create');
  };

  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setTemplateFormData({
      name: template.name,
      description: template.description || '',
      subject: template.subject || '',
      body: template.body,
    });
    setViewMode('edit');
  };

  const handleSubmitTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTemplate) {
        await api.put(`/templates/${editingTemplate.id}`, templateFormData);
      } else {
        await api.post('/templates', templateFormData);
      }
      setViewMode('list');
      setEditingTemplate(null);
      loadData();
    } catch (error: any) {
      toast(error.message || `Failed to ${editingTemplate ? 'update' : 'create'} template`, 'error');
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!await confirm({ title: 'Delete Template', message: 'Are you sure you want to delete this template?', confirmLabel: 'Delete', danger: true })) return;

    try {
      await api.delete(`/templates/${id}`);
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to delete template', 'error');
    }
  };

  const handleUseTemplate = (template: EmailTemplate) => {
    setFormData({
      ...formData,
      subject: template.subject || '',
      body: template.body,
    });
    setActiveTab('campaigns');
    handleCreateCampaign();
  };

  const handleCancel = () => {
    setViewMode('list');
    setEditingCampaign(null);
    setEditingTemplate(null);
  };

  const handleSendTest = async () => {
    if (!testEmail) {
      toast('Please enter an email address', 'error');
      return;
    }

    if (!formData.subject || !formData.body) {
      toast('Please fill in subject and body before sending a test', 'error');
      return;
    }

    try {
      // Get SMTP settings from localStorage
      const smtpSettings = localStorage.getItem('smtpConfig');
      const emailSettings = smtpSettings ? JSON.parse(smtpSettings) : null;

      const result = await api.post('/email/send-test', {
        to: testEmail,
        subject: formData.subject,
        body: formData.body,
        emailSettings: emailSettings && emailSettings.enabled ? {
          host: emailSettings.host,
          port: emailSettings.port,
          secure: emailSettings.secure,
          username: emailSettings.username,
          password: emailSettings.password,
          fromEmail: emailSettings.fromEmail,
          fromName: emailSettings.fromName,
        } : null,
      });

      toast(`Test email sent to ${testEmail}!`, 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to send test email', 'error');
    }
  };

  // SMS Campaign Handlers
  const handleCreateSMSCampaign = () => {
    setEditingSMSCampaign(null);
    setSmsFormData({
      name: '',
      description: '',
      audienceId: '',
      message: '',
      scheduledFor: '',
    });
    setCharacterCount(0);
    setViewMode('create');
  };

  const handleEditSMSCampaign = (campaign: SMSCampaign) => {
    setEditingSMSCampaign(campaign);
    setSmsFormData({
      name: campaign.name,
      description: campaign.description || '',
      audienceId: campaign.audienceId.toString(),
      message: campaign.message,
      scheduledFor: campaign.scheduledFor || '',
    });
    setCharacterCount(campaign.message.length);
    setViewMode('edit');
  };

  const handleSubmitSMSCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: smsFormData.name,
        description: smsFormData.description || undefined,
        audienceId: parseInt(smsFormData.audienceId),
        message: smsFormData.message,
        scheduledFor: smsFormData.scheduledFor || undefined,
      };

      if (editingSMSCampaign) {
        await api.put(`/sms-campaigns/${editingSMSCampaign.id}`, payload);
      } else {
        await api.post('/sms-campaigns', payload);
      }

      setViewMode('list');
      setEditingSMSCampaign(null);
      loadData();
    } catch (error: any) {
      toast(error.message || `Failed to ${editingSMSCampaign ? 'update' : 'create'} SMS campaign`, 'error');
    }
  };

  const handleDeleteSMSCampaign = async (id: number) => {
    if (!await confirm({ title: 'Delete SMS Campaign', message: 'Are you sure you want to delete this SMS campaign?', confirmLabel: 'Delete', danger: true })) return;

    try {
      await api.delete(`/sms-campaigns/${id}`);
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to delete SMS campaign', 'error');
    }
  };

  const handleSendSMSCampaign = async (campaign: SMSCampaign) => {
    // Show the exact number of texts (pending recipients) before sending.
    let count = campaign.recipientCount ?? 0;
    try {
      const preview = await api.get(`/sms-campaigns/${campaign.id}/recipients`);
      const pending = (preview.recipients || []).filter((r: any) => r.status === 'pending');
      count = pending.length || preview.recipientCount || count;
    } catch { /* fall back to the stored recipientCount */ }

    if (count === 0) {
      toast('No pending recipients to text for this campaign.', 'error');
      return;
    }
    if (!await confirm({
      title: 'Send SMS Campaign',
      message: `This will text ${count} ${count === 1 ? 'person' : 'people'}. Standard messaging rates and carrier/TCPA rules apply, and this can't be undone.`,
      confirmLabel: `Send to ${count}`,
      danger: true,
    })) return;

    try {
      const result = await api.post(`/sms-campaigns/${campaign.id}/send`, {});
      toast(`SMS campaign sending to ${result.recipientCount ?? count}…`, 'success');
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to send SMS campaign', 'error');
    }
  };

  const openSmsRecipientPreview = async (campaign: SMSCampaign) => {
    setPreviewSms(campaign);
    setPreviewSmsData(null);
    setPreviewSearch('');
    try {
      setPreviewSmsData(await api.get(`/sms-campaigns/${campaign.id}/recipients`));
    } catch (error: any) {
      toast(error.message || 'Failed to load recipients', 'error');
      setPreviewSms(null);
    }
  };

  const handleSMSMessageChange = (message: string) => {
    setSmsFormData({ ...smsFormData, message });
    setCharacterCount(message.length);
  };

  const handleSendTestSMS = async () => {
    if (!testPhone) {
      toast('Please enter a phone number', 'error');
      return;
    }

    if (!smsFormData.message) {
      toast('Please write a message before sending a test', 'error');
      return;
    }

    try {
      await api.post('/sms-campaigns/send-test', {
        to: testPhone,
        message: smsFormData.message,
      });
      toast(`Test SMS sent to ${testPhone}!`, 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to send test SMS', 'error');
    }
  };

  // Render campaign list
  const renderCampaignsList = () => (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Email Campaigns</h2>
          <p className={styles.pageSubtitle}>Manage your email marketing campaigns</p>
        </div>
        <button onClick={handleCreateCampaign} className={styles.primaryBtn}>
          + Create Campaign
        </button>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className={styles.empty}>
          <p>No email campaigns yet. Create your first campaign to get started!</p>
          <button onClick={handleCreateCampaign} className={styles.primaryBtn}>
            + Create Your First Campaign
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {campaigns.map((campaign) => {
            const audience = audiences.find((a) => a.id === campaign.audienceId);
            return (
              <div key={campaign.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{campaign.name}</h3>
                  <span className={`${styles.badge} ${styles[campaign.status]}`}>
                    {campaign.status}
                  </span>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardInfo}>
                    <span className={styles.label}>Audience:</span>
                    <span>{audience?.name || 'Unknown'}</span>
                  </div>
                  {campaign.content && (
                    <>
                      <div className={styles.cardInfo}>
                        <span className={styles.label}>Subject:</span>
                        <span>{campaign.content.subject}</span>
                      </div>
                      <div className={styles.preview}>
                        <div className={styles.label}>Preview:</div>
                        <div
                          className={styles.previewBody}
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(
                              (campaign.content.body?.substring(0, 200) ?? '') +
                              (campaign.content.body?.length > 200 ? '...' : '')
                            )
                          }}
                        />
                      </div>
                    </>
                  )}

                  {(campaign.status === 'completed' || campaign.sent || campaign.opens || campaign.clicks) && (
                    <div className={styles.analyticsSection}>
                      <div className={styles.analyticsHeader}>
                        <span className={styles.label}>Campaign Analytics</span>
                      </div>
                      <div className={styles.analyticsGrid}>
                        {(campaign.status === 'completed' || campaign.sent) && (
                          <div className={styles.analyticsItem}>
                            <div className={styles.analyticsValue}>{campaign.sent || 0}</div>
                            <div className={styles.analyticsLabel}>Sent</div>
                          </div>
                        )}
                        {campaign.opens !== undefined && (
                          <div className={styles.analyticsItem}>
                            <div className={styles.analyticsValue}>{campaign.opens}</div>
                            <div className={styles.analyticsLabel}>Opens</div>
                          </div>
                        )}
                        {campaign.openRate !== undefined && campaign.openRate > 0 && (
                          <div className={styles.analyticsItem}>
                            <div className={styles.analyticsValue}>{campaign.openRate}%</div>
                            <div className={styles.analyticsLabel}>Open Rate</div>
                          </div>
                        )}
                        {campaign.clicks !== undefined && (
                          <div className={styles.analyticsItem}>
                            <div className={styles.analyticsValue}>{campaign.clicks}</div>
                            <div className={styles.analyticsLabel}>Clicks</div>
                          </div>
                        )}
                        {campaign.clickThroughRate !== undefined && campaign.clickThroughRate > 0 && (
                          <div className={styles.analyticsItem}>
                            <div className={styles.analyticsValue}>{campaign.clickThroughRate}%</div>
                            <div className={styles.analyticsLabel}>CTR</div>
                          </div>
                        )}
                        {campaign.leads !== undefined && campaign.leads > 0 && (
                          <div className={styles.analyticsItem}>
                            <div className={styles.analyticsValue}>{campaign.leads}</div>
                            <div className={styles.analyticsLabel}>Leads</div>
                          </div>
                        )}
                        {campaign.trialers !== undefined && campaign.trialers > 0 && (
                          <div className={styles.analyticsItem}>
                            <div className={styles.analyticsValue}>{campaign.trialers}</div>
                            <div className={styles.analyticsLabel}>Trialers</div>
                          </div>
                        )}
                        {campaign.members !== undefined && campaign.members > 0 && (
                          <div className={styles.analyticsItem}>
                            <div className={styles.analyticsValue}>{campaign.members}</div>
                            <div className={styles.analyticsLabel}>Members</div>
                          </div>
                        )}
                        {campaign.conversions !== undefined && campaign.conversions > 0 && (
                          <div className={styles.analyticsItem}>
                            <div className={styles.analyticsValue}>{campaign.conversions}</div>
                            <div className={styles.analyticsLabel}>Conversions</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className={styles.cardFooter}>
                  <button onClick={() => openRecipientPreview(campaign)} className={styles.editBtn}>
                    Preview Recipients
                  </button>
                  {!campaign.sent && (
                    <button onClick={() => handleSendCampaign(campaign)} className={styles.sendBtn}>
                      Send Campaign
                    </button>
                  )}
                  <button onClick={() => handleEditCampaign(campaign)} className={styles.editBtn}>
                    Edit
                  </button>
                  <button onClick={() => handleDeleteCampaign(campaign.id)} className={styles.deleteBtn}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Recipients modal — the exact set the send will email */}
      {previewCampaign && (
        <div
          onClick={() => setPreviewCampaign(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--color-dark-grey, #1a1a2e)', border: '1px solid var(--color-border, #333)', borderRadius: 10, width: 'min(640px, 100%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', color: 'var(--color-text-primary, #eee)' }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border, #333)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Recipients — {previewCampaign.name}</h3>
              <button onClick={() => setPreviewCampaign(null)} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {previewLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary, #999)' }}>Loading recipients…</div>
            ) : previewData && (() => {
              const audience = audiences.find((a) => a.id === previewCampaign.audienceId);
              const all = previewData.recipients || [];
              const q = previewSearch.trim().toLowerCase();
              const filtered = q
                ? all.filter((r: any) => `${r.firstName} ${r.lastName} ${r.email}`.toLowerCase().includes(q))
                : all;
              const skipped = (previewData.totalMatched || 0) - (previewData.recipientCount || 0);
              return (
                <>
                  <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border, #333)' }}>
                    <div style={{ fontSize: '0.95rem' }}>
                      <strong>{previewData.recipientCount}</strong> will be emailed{audience ? <> in <strong>"{audience.name}"</strong></> : ''}.
                    </div>
                    {previewData.filterCount === 0 && (
                      <div style={{ color: '#f59e0b', fontSize: '0.85rem', marginTop: 4 }}>⚠ This audience has NO filters — it targets EVERY member.</div>
                    )}
                    {skipped > 0 && (
                      <div style={{ color: 'var(--color-text-secondary, #999)', fontSize: '0.85rem', marginTop: 4 }}>{skipped} matched but have no email and will be skipped.</div>
                    )}
                    <input
                      value={previewSearch}
                      onChange={(e) => setPreviewSearch(e.target.value)}
                      placeholder="Search name or email…"
                      style={{ marginTop: 10, width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border, #333)', background: 'var(--color-bg, #12121f)', color: 'inherit', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {filtered.length === 0 ? (
                      <div style={{ padding: 20, color: 'var(--color-text-secondary, #999)' }}>No matching recipients.</div>
                    ) : (
                      filtered.map((r: any) => (
                        <div key={r.id} style={{ padding: '8px 20px', borderBottom: '1px solid var(--color-border, #222)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <div>
                            <div style={{ fontSize: '0.9rem' }}>{r.firstName} {r.lastName}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #999)' }}>{r.email}</div>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #999)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {r.accountStatus}{r.programType && r.programType !== 'No Program Selected' ? ` • ${r.programType}` : ''}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-border, #333)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #999)' }}>
                      {q ? `${filtered.length} of ${all.length} shown` : `${all.length} total`}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setPreviewCampaign(null)} className={styles.editBtn}>Close</button>
                      {!previewCampaign.sent && (
                        <button
                          className={styles.sendBtn}
                          onClick={() => { const c = previewCampaign; setPreviewCampaign(null); handleSendCampaign(c); }}
                        >
                          Send to {previewData.recipientCount}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );

  // Render campaign editor
  const renderCampaignEditor = () => (
    <div className={styles.editor}>
      <div className={styles.editorHeader}>
        <h2 className={styles.editorTitle}>
          {editingCampaign ? 'Edit Campaign' : 'Create New Campaign'}
        </h2>
        <button onClick={handleCancel} className={styles.cancelBtn}>
          ← Back to Campaigns
        </button>
      </div>

      <form onSubmit={handleSubmitCampaign} className={styles.editorForm}>
        <div className={styles.editorSidebar}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Campaign Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={styles.input}
              placeholder="e.g., New BJJ Class Promotion"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Target Audience *</label>
            <select
              value={formData.audienceId}
              onChange={(e) => setFormData({ ...formData, audienceId: e.target.value })}
              className={styles.input}
              required
            >
              <option value="">Select an audience</option>
              {audiences.map((audience) => (
                <option key={audience.id} value={audience.id}>
                  {audience.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className={styles.input}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Use Template (Optional)</label>
            <select
              onChange={(e) => {
                const template = templates.find(t => t.id === parseInt(e.target.value));
                if (template) handleUseTemplate(template);
              }}
              className={styles.input}
            >
              <option value="">Select a template...</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.testSection}>
            <h3 className={styles.sectionTitle}>Test Email</h3>
            <div className={styles.formGroup}>
              <label className={styles.label}>Send test to:</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className={styles.input}
                placeholder="your@email.com"
              />
            </div>
            <button
              type="button"
              onClick={handleSendTest}
              className={styles.testBtn}
              disabled={!testEmail || !formData.subject || !formData.body}
            >
              Send Test Email
            </button>
          </div>

          <button type="submit" className={styles.saveBtn}>
            {editingCampaign ? 'Update Campaign' : 'Create Campaign'}
          </button>
        </div>

        <div className={styles.editorMain}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Email Subject *</label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className={styles.input}
              placeholder="e.g., New BJJ Classes Starting Next Week!"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Email Body *</label>
            <EmailEditor
              value={formData.body}
              onChange={(html) => setFormData({ ...formData, body: html })}
            />
          </div>
        </div>
      </form>
    </div>
  );

  // Render templates list
  const renderTemplatesList = () => (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Email Templates</h2>
          <p className={styles.pageSubtitle}>Create reusable email templates</p>
        </div>
        <button onClick={handleCreateTemplate} className={styles.primaryBtn}>
          + Create Template
        </button>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className={styles.empty}>
          <p>No templates yet. Create your first template to reuse email designs!</p>
          <button onClick={handleCreateTemplate} className={styles.primaryBtn}>
            + Create Your First Template
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {templates.map((template) => (
            <div key={template.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{template.name}</h3>
                {template.isDefault && (
                  <span className={`${styles.badge} ${styles.default}`}>Default</span>
                )}
              </div>
              <div className={styles.cardBody}>
                {template.description && (
                  <p className={styles.description}>{template.description}</p>
                )}
                {template.subject && (
                  <div className={styles.cardInfo}>
                    <span className={styles.label}>Subject:</span>
                    <span>{template.subject}</span>
                  </div>
                )}
                <div className={styles.preview}>
                  <div className={styles.label}>Preview:</div>
                  <div
                    className={styles.previewBody}
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(
                        (template.body?.substring(0, 200) ?? '') +
                        (template.body?.length > 200 ? '...' : '')
                      )
                    }}
                  />
                </div>
              </div>
              <div className={styles.cardFooter}>
                <button onClick={() => handleUseTemplate(template)} className={styles.useBtn}>
                  Use Template
                </button>
                <button onClick={() => handleEditTemplate(template)} className={styles.editBtn}>
                  Edit
                </button>
                <button onClick={() => handleDeleteTemplate(template.id)} className={styles.deleteBtn}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // Render template editor
  const renderTemplateEditor = () => (
    <div className={styles.editor}>
      <div className={styles.editorHeader}>
        <h2 className={styles.editorTitle}>
          {editingTemplate ? 'Edit Template' : 'Create New Template'}
        </h2>
        <button onClick={handleCancel} className={styles.cancelBtn}>
          ← Back to Templates
        </button>
      </div>

      <form onSubmit={handleSubmitTemplate} className={styles.editorForm}>
        <div className={styles.editorSidebar}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Template Name *</label>
            <input
              type="text"
              value={templateFormData.name}
              onChange={(e) => setTemplateFormData({ ...templateFormData, name: e.target.value })}
              className={styles.input}
              placeholder="e.g., Welcome Email"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Description</label>
            <textarea
              value={templateFormData.description}
              onChange={(e) => setTemplateFormData({ ...templateFormData, description: e.target.value })}
              className={styles.textarea}
              placeholder="What is this template for?"
              rows={3}
            />
          </div>

          <button type="submit" className={styles.saveBtn}>
            {editingTemplate ? 'Update Template' : 'Create Template'}
          </button>
        </div>

        <div className={styles.editorMain}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Default Subject (Optional)</label>
            <input
              type="text"
              value={templateFormData.subject}
              onChange={(e) => setTemplateFormData({ ...templateFormData, subject: e.target.value })}
              className={styles.input}
              placeholder="e.g., Welcome to [Studio Name]!"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Template Body *</label>
            <EmailEditor
              value={templateFormData.body}
              onChange={(html) => setTemplateFormData({ ...templateFormData, body: html })}
            />
          </div>
        </div>
      </form>
    </div>
  );

  // Render SMS campaigns list
  const renderSMSCampaignsList = () => (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>SMS Campaigns</h2>
          <p className={styles.pageSubtitle}>Send text messages to your members</p>
        </div>
        <button onClick={handleCreateSMSCampaign} className={styles.primaryBtn}>
          + Create SMS Campaign
        </button>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading SMS campaigns...</div>
      ) : smsCampaigns.length === 0 ? (
        <div className={styles.empty}>
          <p>No SMS campaigns yet. Create your first SMS campaign to get started!</p>
          <button onClick={handleCreateSMSCampaign} className={styles.primaryBtn}>
            + Create Your First SMS Campaign
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {smsCampaigns.map((campaign) => {
            const audience = audiences.find((a) => a.id === campaign.audienceId);
            return (
              <div key={campaign.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{campaign.name}</h3>
                  <span className={`${styles.badge} ${styles[campaign.status]}`}>
                    {campaign.status}
                  </span>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardInfo}>
                    <span className={styles.label}>Audience:</span>
                    <span>{audience?.name || 'Unknown'}</span>
                  </div>
                  <div className={styles.cardInfo}>
                    <span className={styles.label}>Recipients:</span>
                    <span>{campaign.recipientCount}</span>
                  </div>
                  {campaign.status === 'sent' && (
                    <>
                      <div className={styles.cardInfo}>
                        <span className={styles.label}>Sent:</span>
                        <span>{campaign.successCount} / {campaign.recipientCount}</span>
                      </div>
                      <div className={styles.cardInfo}>
                        <span className={styles.label}>Cost:</span>
                        <span>${campaign.cost.toFixed(4)}</span>
                      </div>
                    </>
                  )}
                  <div className={styles.preview}>
                    <div className={styles.label}>Message:</div>
                    <div className={styles.previewBody}>
                      {campaign.message}
                    </div>
                  </div>
                </div>
                <div className={styles.cardFooter}>
                  <button onClick={() => openSmsRecipientPreview(campaign)} className={styles.editBtn}>
                    Preview Recipients
                  </button>
                  {campaign.status === 'draft' && (
                    <>
                      <button onClick={() => handleEditSMSCampaign(campaign)} className={styles.editBtn}>
                        Edit
                      </button>
                      <button onClick={() => handleSendSMSCampaign(campaign)} className={styles.sendBtn}>
                        Send Now
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleDeleteSMSCampaign(campaign.id)}
                    className={styles.deleteBtn}
                    disabled={campaign.status === 'sending' || campaign.status === 'sent'}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SMS Preview Recipients modal */}
      {previewSms && (
        <div
          onClick={() => setPreviewSms(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--color-dark-grey, #1a1a2e)', border: '1px solid var(--color-border, #333)', borderRadius: 10, width: 'min(600px, 100%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', color: 'var(--color-text-primary, #eee)' }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border, #333)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Recipients — {previewSms.name}</h3>
              <button onClick={() => setPreviewSms(null)} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            {!previewSmsData ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary, #999)' }}>Loading recipients…</div>
            ) : (() => {
              const all = previewSmsData.recipients || [];
              const q = previewSearch.trim().toLowerCase();
              const filtered = q ? all.filter((r: any) => `${r.firstName || ''} ${r.lastName || ''} ${r.phoneNumber}`.toLowerCase().includes(q)) : all;
              const pending = all.filter((r: any) => r.status === 'pending').length;
              return (
                <>
                  <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border, #333)' }}>
                    <div style={{ fontSize: '0.95rem' }}><strong>{pending}</strong> will be texted ({all.length} total in this campaign).</div>
                    <input value={previewSearch} onChange={(e) => setPreviewSearch(e.target.value)} placeholder="Search name or phone…"
                      style={{ marginTop: 10, width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border, #333)', background: 'var(--color-bg, #12121f)', color: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {filtered.length === 0 ? (
                      <div style={{ padding: 20, color: 'var(--color-text-secondary, #999)' }}>No matching recipients.</div>
                    ) : filtered.map((r: any) => (
                      <div key={r.id} style={{ padding: '8px 20px', borderBottom: '1px solid var(--color-border, #222)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <div style={{ fontSize: '0.9rem' }}>{[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #999)' }}>{r.phoneNumber}</div>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #999)' }}>{r.status}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-border, #333)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => setPreviewSms(null)} className={styles.editBtn}>Close</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );

  // Render SMS campaign editor
  const renderSMSCampaignEditor = () => {
    const messageSegments = Math.ceil(characterCount / 160);
    const segmentInfo = characterCount === 0 ? '0/160 characters' :
      messageSegments === 1 ? `${characterCount}/160 characters (1 message)` :
      `${characterCount} characters (${messageSegments} messages)`;

    return (
      <div className={styles.editor}>
        <div className={styles.editorHeader}>
          <h2 className={styles.editorTitle}>
            {editingSMSCampaign ? 'Edit SMS Campaign' : 'Create New SMS Campaign'}
          </h2>
          <button onClick={handleCancel} className={styles.cancelBtn}>
            ← Back to SMS Campaigns
          </button>
        </div>

        <form onSubmit={handleSubmitSMSCampaign} className={styles.editorForm}>
          <div className={styles.editorSidebar}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Campaign Name *</label>
              <input
                type="text"
                value={smsFormData.name}
                onChange={(e) => setSmsFormData({ ...smsFormData, name: e.target.value })}
                className={styles.input}
                placeholder="e.g., Weekend Class Reminder"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Description</label>
              <textarea
                value={smsFormData.description}
                onChange={(e) => setSmsFormData({ ...smsFormData, description: e.target.value })}
                className={styles.textarea}
                placeholder="What is this campaign about?"
                rows={3}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Target Audience *</label>
              <select
                value={smsFormData.audienceId}
                onChange={(e) => setSmsFormData({ ...smsFormData, audienceId: e.target.value })}
                className={styles.input}
                required
              >
                <option value="">Select an audience</option>
                {audiences.map((audience) => (
                  <option key={audience.id} value={audience.id}>
                    {audience.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Schedule For (Optional)</label>
              <input
                type="datetime-local"
                value={smsFormData.scheduledFor}
                onChange={(e) => setSmsFormData({ ...smsFormData, scheduledFor: e.target.value })}
                className={styles.input}
              />
              <small className={styles.helpText}>Leave empty to send immediately</small>
            </div>

            <div className={styles.testSection}>
              <h3 className={styles.sectionTitle}>Test SMS</h3>
              <div className={styles.formGroup}>
                <label className={styles.label}>Send test to:</label>
                <input
                  type="tel"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className={styles.input}
                  placeholder="+1234567890"
                />
              </div>
              <button
                type="button"
                onClick={handleSendTestSMS}
                className={styles.testBtn}
                disabled={!testPhone || !smsFormData.message}
              >
                Send Test SMS
              </button>
            </div>

            <button type="submit" className={styles.saveBtn}>
              {editingSMSCampaign ? 'Update Campaign' : 'Create Campaign'}
            </button>
          </div>

          <div className={styles.editorMain}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Message * {segmentInfo}</label>
              <textarea
                value={smsFormData.message}
                onChange={(e) => handleSMSMessageChange(e.target.value)}
                className={styles.smsTextarea}
                placeholder="Write your SMS message here..."
                maxLength={1600}
                rows={8}
                required
              />
              <small className={styles.helpText}>
                SMS messages over 160 characters will be sent as multiple messages.
                Maximum 1600 characters (10 messages).
              </small>
            </div>

            <div className={styles.smsPreview}>
              <h3 className={styles.sectionTitle}>Preview</h3>
              <div className={styles.phonePreview}>
                <div className={styles.phoneScreen}>
                  <div className={styles.smsMessage}>
                    {smsFormData.message || 'Your message will appear here...'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    );
  };

  const renderAnalytics = () => {
    const sentCampaigns = campaigns.filter((c) => (c.sent || 0) > 0 || c.status === 'completed');
    const totalSent = sentCampaigns.reduce((s, c) => s + (c.sent || 0), 0);
    const totalOpens = sentCampaigns.reduce((s, c) => s + (c.opens || 0), 0);
    const totalConversions = sentCampaigns.reduce((s, c) => s + (c.conversions || 0), 0);
    const avgOpenRate = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0;

    const kpis = [
      { label: 'Campaigns Sent', value: String(sentCampaigns.length) },
      { label: 'Emails Sent', value: totalSent.toLocaleString() },
      { label: 'Total Opens', value: totalOpens.toLocaleString() },
      { label: 'Avg Open Rate', value: `${avgOpenRate}%` },
      { label: 'Conversions', value: totalConversions.toLocaleString() },
    ];

    // Trends over time: group sent campaigns by calendar month. sentAt is the true
    // send date; fall back to updatedAt/createdAt for older rows without one.
    const monthly = new Map<string, { sent: number; opens: number; conversions: number }>();
    for (const c of sentCampaigns) {
      const when = c.sentAt || c.updatedAt || c.createdAt;
      if (!when) continue;
      const d = new Date(when);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const row = monthly.get(key) || { sent: 0, opens: 0, conversions: 0 };
      row.sent += c.sent || 0;
      row.opens += c.opens || 0;
      row.conversions += c.conversions || 0;
      monthly.set(key, row);
    }
    const trend = Array.from(monthly.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => {
        const [y, m] = key.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
        return {
          month: label,
          sent: v.sent,
          opens: v.opens,
          conversions: v.conversions,
          openRate: v.sent > 0 ? Math.round((v.opens / v.sent) * 100) : 0,
        };
      });

    const cardBg = 'var(--color-dark-grey, #1a1a2e)';
    const border = '1px solid var(--color-border, #333)';
    const dim = 'var(--color-text-secondary, #999)';
    const th: React.CSSProperties = { padding: '8px 12px', fontWeight: 600, color: dim, fontSize: '0.8rem' };
    const thR: React.CSSProperties = { ...th, textAlign: 'right' };
    const td: React.CSSProperties = { padding: '10px 12px' };
    const tdR: React.CSSProperties = { ...td, textAlign: 'right' };
    const tooltipStyle: React.CSSProperties = { background: 'var(--color-dark-grey)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)' };

    return (
      <div>
        <h2 style={{ fontSize: '1.15rem', margin: '0 0 4px' }}>Email Performance</h2>
        <p style={{ color: dim, fontSize: '0.9rem', margin: '0 0 20px' }}>Across all sent email campaigns.</p>

        {sentCampaigns.length === 0 ? (
          <div className={styles.emptyState}>
            No sent campaigns yet — analytics appear here once you send a campaign.
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
              {kpis.map((k) => (
                <div key={k.label} style={{ background: cardBg, border, borderRadius: 8, padding: '16px 18px' }}>
                  <div style={{ fontSize: '1.7rem', fontWeight: 700, lineHeight: 1.1 }}>{k.value}</div>
                  <div style={{ fontSize: '0.75rem', color: dim, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 4 }}>{k.label}</div>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: '1rem', margin: '0 0 4px' }}>Trends Over Time</h3>
            <p style={{ color: dim, fontSize: '0.85rem', margin: '0 0 14px' }}>Email marketing performance by month.</p>
            {trend.length < 2 ? (
              <div style={{ background: cardBg, border, borderRadius: 8, padding: '20px', color: dim, fontSize: '0.9rem', marginBottom: 28 }}>
                Trends appear once you've sent campaigns across at least two different months.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 28 }}>
                <div style={{ background: cardBg, border, borderRadius: 8, padding: '16px 16px 8px' }}>
                  <div style={{ fontSize: '0.8rem', color: dim, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Volume — Sent vs Opens</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="month" stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                      <YAxis stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                      <Line type="monotone" dataKey="sent" name="Emails Sent" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="opens" name="Opens" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: cardBg, border, borderRadius: 8, padding: '16px 16px 8px' }}>
                  <div style={{ fontSize: '0.8rem', color: dim, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Open Rate</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="month" stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                      <YAxis stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} unit="%" domain={[0, 100]} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v}%`, 'Open Rate']} />
                      <Line type="monotone" dataKey="openRate" name="Open Rate" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: cardBg, border, borderRadius: 8, padding: '16px 16px 8px' }}>
                  <div style={{ fontSize: '0.8rem', color: dim, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Conversions</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="month" stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                      <YAxis stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="conversions" name="Conversions" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <h3 style={{ fontSize: '1rem', margin: '0 0 10px' }}>Campaign Breakdown</h3>
            <div style={{ overflowX: 'auto', border, borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: border, textAlign: 'left' }}>
                    <th style={th}>Campaign</th>
                    <th style={thR}>Sent</th>
                    <th style={thR}>Opens</th>
                    <th style={thR}>Open Rate</th>
                    <th style={thR}>Conversions</th>
                  </tr>
                </thead>
                <tbody>
                  {sentCampaigns.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border, #222)' }}>
                      <td style={td}>{c.name}</td>
                      <td style={tdR}>{(c.sent || 0).toLocaleString()}</td>
                      <td style={tdR}>{(c.opens || 0).toLocaleString()}</td>
                      <td style={tdR}>{c.openRate || 0}%</td>
                      <td style={tdR}>{c.conversions || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '0.8rem', color: dim, marginTop: 12 }}>
              Opens depend on the recipient's mail client loading images, so they're a floor, not exact. Click tracking (CTR) is not yet available.
            </p>
          </>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>DragonDesk: Engage</h1>
          <p className={styles.subtitle}>Email Marketing Platform for Martial Arts Studios</p>
        </div>
      </div>

      {viewMode === 'list' && (
        <div className={styles.tabs}>
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`${styles.tab} ${activeTab === 'campaigns' ? styles.activeTab : ''}`}
          >
            Email Campaigns
          </button>
          <button
            onClick={() => setActiveTab('sms')}
            className={`${styles.tab} ${activeTab === 'sms' ? styles.activeTab : ''}`}
          >
            SMS Campaigns
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`${styles.tab} ${activeTab === 'templates' ? styles.activeTab : ''}`}
          >
            Templates
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`${styles.tab} ${activeTab === 'analytics' ? styles.activeTab : ''}`}
          >
            Analytics
          </button>
        </div>
      )}

      <div className={styles.content}>
        {activeTab === 'campaigns' && (
          viewMode === 'list' ? renderCampaignsList() : renderCampaignEditor()
        )}
        {activeTab === 'sms' && (
          viewMode === 'list' ? renderSMSCampaignsList() : renderSMSCampaignEditor()
        )}
        {activeTab === 'templates' && (
          viewMode === 'list' ? renderTemplatesList() : renderTemplateEditor()
        )}
        {activeTab === 'analytics' && renderAnalytics()}
      </div>
    </div>
  );
};

export default DragonDeskEngage;
