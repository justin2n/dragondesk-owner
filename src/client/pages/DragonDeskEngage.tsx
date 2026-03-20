import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { Campaign, Audience, EmailTemplate } from '../types';
import EmailEditor from '../components/EmailEditor';
import { useLocation } from '../contexts/LocationContext';
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
  const { selectedLocation, isAllLocations } = useLocation();
  const [activeTab, setActiveTab] = useState<'campaigns' | 'templates' | 'sms'>('campaigns');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [smsCampaigns, setSmsCampaigns] = useState<SMSCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [editingSMSCampaign, setEditingSMSCampaign] = useState<SMSCampaign | null>(null);

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
      alert(error.message || `Failed to ${editingCampaign ? 'update' : 'create'} campaign`);
    }
  };

  const handleDeleteCampaign = async (id: number) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;

    try {
      await api.delete(`/campaigns/${id}`);
      loadData();
    } catch (error: any) {
      alert(error.message || 'Failed to delete campaign');
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
      alert(error.message || `Failed to ${editingTemplate ? 'update' : 'create'} template`);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      await api.delete(`/templates/${id}`);
      loadData();
    } catch (error: any) {
      alert(error.message || 'Failed to delete template');
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
      alert('Please enter an email address');
      return;
    }

    if (!formData.subject || !formData.body) {
      alert('Please fill in subject and body before sending a test');
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

      if (result.previewUrl) {
        alert(`Test email sent to ${testEmail}!\n\nPreview URL: ${result.previewUrl}`);
      } else {
        alert(`Test email sent successfully to ${testEmail}!`);
      }
    } catch (error: any) {
      alert(error.message || 'Failed to send test email');
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
      alert(error.message || `Failed to ${editingSMSCampaign ? 'update' : 'create'} SMS campaign`);
    }
  };

  const handleDeleteSMSCampaign = async (id: number) => {
    if (!confirm('Are you sure you want to delete this SMS campaign?')) return;

    try {
      await api.delete(`/sms-campaigns/${id}`);
      loadData();
    } catch (error: any) {
      alert(error.message || 'Failed to delete SMS campaign');
    }
  };

  const handleSendSMSCampaign = async (id: number) => {
    if (!confirm('Are you sure you want to send this SMS campaign? This action cannot be undone.')) return;

    try {
      await api.post(`/sms-campaigns/${id}/send`);
      alert('SMS campaign is being sent!');
      loadData();
    } catch (error: any) {
      alert(error.message || 'Failed to send SMS campaign');
    }
  };

  const handleSMSMessageChange = (message: string) => {
    setSmsFormData({ ...smsFormData, message });
    setCharacterCount(message.length);
  };

  const handleSendTestSMS = async () => {
    if (!testPhone) {
      alert('Please enter a phone number');
      return;
    }

    if (!smsFormData.message) {
      alert('Please write a message before sending a test');
      return;
    }

    try {
      alert(`Test SMS would be sent to ${testPhone}:\n\n"${smsFormData.message}"\n\n(Test SMS sending is simulated in development)`);
    } catch (error: any) {
      alert(error.message || 'Failed to send test SMS');
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
                            __html: campaign.content.body?.substring(0, 200) +
                                   (campaign.content.body?.length > 200 ? '...' : '')
                          }}
                        />
                      </div>
                    </>
                  )}

                  {(campaign.sent || campaign.opens || campaign.clicks) && (
                    <div className={styles.analyticsSection}>
                      <div className={styles.analyticsHeader}>
                        <span className={styles.label}>Campaign Analytics</span>
                      </div>
                      <div className={styles.analyticsGrid}>
                        {campaign.sent && (
                          <div className={styles.analyticsItem}>
                            <div className={styles.analyticsValue}>{campaign.sent}</div>
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
                      </div>
                    </div>
                  )}
                </div>
                <div className={styles.cardFooter}>
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
                      __html: template.body?.substring(0, 200) +
                             (template.body?.length > 200 ? '...' : '')
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
                  {campaign.status === 'draft' && (
                    <>
                      <button onClick={() => handleEditSMSCampaign(campaign)} className={styles.editBtn}>
                        Edit
                      </button>
                      <button onClick={() => handleSendSMSCampaign(campaign.id)} className={styles.sendBtn}>
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
      </div>
    </div>
  );
};

export default DragonDeskEngage;
