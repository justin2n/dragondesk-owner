import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { Campaign, Audience } from '../types';
import { useToast } from '../components/Toast';
import styles from './DragonDeskOutreach.module.css';

type ViewMode = 'list' | 'create' | 'edit';

const DragonDeskOutreach = () => {
  const { toast, confirm } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    audienceId: '',
    callScript: '',
    aiInstructions: '',
    callGoal: '',
    status: 'draft' as 'draft' | 'active' | 'paused' | 'completed',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [campaignsData, audiencesData] = await Promise.all([
        api.get('/campaigns?type=call'),
        api.get('/audiences'),
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
      callScript: '',
      aiInstructions: '',
      callGoal: '',
      status: 'draft',
    });
    setViewMode('create');
  };

  const handleEditCampaign = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name,
      audienceId: campaign.audienceId.toString(),
      callScript: campaign.content?.callScript || '',
      aiInstructions: campaign.content?.aiInstructions || '',
      callGoal: campaign.content?.callGoal || '',
      status: campaign.status,
    });
    setViewMode('edit');
  };

  const handleSubmitCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        type: 'call',
        audienceId: parseInt(formData.audienceId),
        status: formData.status,
        content: {
          callScript: formData.callScript,
          aiInstructions: formData.aiInstructions,
          callGoal: formData.callGoal,
        },
      };

      if (editingCampaign) {
        await api.put(`/campaigns/${editingCampaign.id}`, payload);
      } else {
        await api.post('/campaigns', payload);
      }

      setViewMode('list');
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to save outreach campaign', 'error');
    }
  };

  const handleCancel = () => {
    setViewMode('list');
    setEditingCampaign(null);
  };

  const handleDelete = async (id: number) => {
    if (!await confirm({ title: 'Delete Campaign', message: 'Are you sure you want to delete this campaign?', confirmLabel: 'Delete', danger: true })) return;

    try {
      await api.delete(`/campaigns/${id}`);
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to delete campaign', 'error');
    }
  };

  // Render campaign list
  const renderCampaignsList = () => (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Outreach Campaigns</h2>
          <p className={styles.pageSubtitle}>Manage your AI-powered call campaigns</p>
        </div>
        <button onClick={handleCreateCampaign} className={styles.primaryBtn}>
          + Create Campaign
        </button>
      </div>

      <div className={styles.info}>
        <p>
          Deploy AI-powered call agents to reach out to specific audiences. Schedule follow-ups,
          answer questions, and book appointments automatically with conversational AI.
        </p>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className={styles.empty}>
          <p>No outreach campaigns yet. Create your first campaign to get started!</p>
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
                        <span className={styles.label}>Call Goal:</span>
                        <span>{campaign.content.callGoal}</span>
                      </div>
                      <div className={styles.scriptPreview}>
                        <div className={styles.label}>Script Preview:</div>
                        <div className={styles.scriptBody}>
                          {campaign.content.callScript?.substring(0, 150)}
                          {campaign.content.callScript?.length > 150 && '...'}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className={styles.cardFooter}>
                  <button onClick={() => handleEditCampaign(campaign)} className={styles.editBtn}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(campaign.id)} className={styles.deleteBtn}>
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
          {editingCampaign ? 'Edit Campaign' : 'Create Campaign'}
        </h2>
        <button onClick={handleCancel} className={styles.cancelBtn}>
          ← Back to Campaigns
        </button>
      </div>

      <form onSubmit={handleSubmitCampaign} className={styles.editorForm}>
        <div className={styles.editorSidebar}>
          <div className={styles.formGroup}>
            <label>Campaign Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={styles.input}
              placeholder="e.g., Trial Class Follow-ups"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Target Audience *</label>
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
            <label>Call Goal *</label>
            <input
              type="text"
              value={formData.callGoal}
              onChange={(e) => setFormData({ ...formData, callGoal: e.target.value })}
              className={styles.input}
              placeholder="e.g., Schedule trial class"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Status</label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value as any })
              }
              className={styles.input}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <button type="submit" className={styles.saveBtn}>
            {editingCampaign ? 'Update Campaign' : 'Create Campaign'}
          </button>
        </div>

        <div className={styles.editorMain}>
          <div className={styles.formGroup}>
            <label>Call Script *</label>
            <textarea
              value={formData.callScript}
              onChange={(e) => setFormData({ ...formData, callScript: e.target.value })}
              className={styles.textarea}
              rows={12}
              placeholder="Write the script your AI agent will follow during calls...

Example:
Hi [First Name], this is [Agent Name] from [Gym Name]. I'm calling about your interest in our martial arts program. Do you have a moment to chat?

[Wait for response]

Great! I wanted to see if you'd like to schedule a free trial class. We have openings this week on..."
              required
              style={{ minHeight: '300px' }}
            />
          </div>

          <div className={styles.formGroup}>
            <label>AI Instructions</label>
            <textarea
              value={formData.aiInstructions}
              onChange={(e) => setFormData({ ...formData, aiInstructions: e.target.value })}
              className={styles.textarea}
              rows={8}
              placeholder="Special instructions for the AI agent...

Example:
- Use a friendly, conversational tone
- If they have questions, answer confidently
- If they object, acknowledge and gently redirect
- Always end by trying to book an appointment
- Use merge tags: [First Name], [Last Name], [Member Name]"
            />
          </div>
        </div>
      </form>
    </div>
  );

  return (
    <div className={styles.container}>
      {viewMode === 'list' && (
        <div className={styles.header}>
          <h1 className={styles.title}>DragonDesk: Outreach</h1>
          <p className={styles.subtitle}>AI-Powered Outbound Call Agent</p>
        </div>
      )}

      <div className={styles.content}>
        {viewMode === 'list' ? renderCampaignsList() : renderCampaignEditor()}
      </div>
    </div>
  );
};

export default DragonDeskOutreach;
