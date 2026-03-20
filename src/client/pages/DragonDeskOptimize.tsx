import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { ABTest, Audience } from '../types';
import VisualPageEditor from '../components/VisualPageEditor';
import ABTestAnalytics from '../components/ABTestAnalytics';
import styles from './DragonDeskOptimize.module.css';

type ViewMode = 'list' | 'create' | 'edit' | 'analytics';

const DragonDeskOptimize = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [abtests, setAbtests] = useState<ABTest[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTest, setEditingTest] = useState<ABTest | null>(null);
  const [activeTab, setActiveTab] = useState<'variantA' | 'variantB'>('variantA');

  const [formData, setFormData] = useState({
    name: '',
    audienceId: '',
    pageUrl: '',
    trafficSplit: 50,
    variantA: {
      title: '',
      headline: '',
      content: '',
      cta: '',
      ctaLink: '',
      image: '',
      changes: [] as any[],
    },
    variantB: {
      title: '',
      headline: '',
      content: '',
      cta: '',
      ctaLink: '',
      image: '',
      changes: [] as any[],
    },
    status: 'draft' as 'draft' | 'running' | 'completed',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [abtestsData, audiencesData] = await Promise.all([
        api.get('/abtests'),
        api.get('/audiences'),
      ]);

      const parsedAudiences = audiencesData.map((a: any) => ({
        ...a,
        filters: typeof a.filters === 'string' ? JSON.parse(a.filters) : a.filters,
      }));

      const parsedAbtests = abtestsData.map((test: any) => ({
        ...test,
        variantA: typeof test.variantA === 'string' ? JSON.parse(test.variantA) : test.variantA,
        variantB: typeof test.variantB === 'string' ? JSON.parse(test.variantB) : test.variantB,
        results: test.results && typeof test.results === 'string' ? JSON.parse(test.results) : test.results,
      }));

      setAbtests(parsedAbtests);
      setAudiences(parsedAudiences);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTest = () => {
    setEditingTest(null);
    setFormData({
      name: '',
      audienceId: '',
      pageUrl: '',
      trafficSplit: 50,
      variantA: { title: '', headline: '', content: '', cta: '', ctaLink: '', image: '', changes: [] },
      variantB: { title: '', headline: '', content: '', cta: '', ctaLink: '', image: '', changes: [] },
      status: 'draft',
    });
    setActiveTab('variantA');
    setViewMode('create');
  };

  const handleEditTest = (test: ABTest) => {
    setEditingTest(test);
    setFormData({
      name: test.name,
      audienceId: test.audienceId.toString(),
      pageUrl: (test as any).pageUrl || '',
      trafficSplit: (test as any).trafficSplit || 50,
      variantA: { ...test.variantA, changes: test.variantA.changes || [] },
      variantB: { ...test.variantB, changes: test.variantB.changes || [] },
      status: test.status,
    });
    setActiveTab('variantA');
    setViewMode('edit');
  };

  const handleSubmitTest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        audienceId: parseInt(formData.audienceId),
      };

      if (editingTest) {
        await api.put(`/abtests/${editingTest.id}`, payload);
      } else {
        await api.post('/abtests', payload);
      }

      setViewMode('list');
      loadData();
    } catch (error: any) {
      alert(error.message || 'Failed to save A/B test');
    }
  };

  const handleCancel = () => {
    setViewMode('list');
    setEditingTest(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this A/B test?')) return;

    try {
      await api.delete(`/abtests/${id}`);
      loadData();
    } catch (error: any) {
      alert(error.message || 'Failed to delete A/B test');
    }
  };

  const handleViewAnalytics = (test: ABTest) => {
    setEditingTest(test);
    setViewMode('analytics');
  };

  // Render test list
  const renderTestsList = () => (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Experiences</h2>
          <p className={styles.pageSubtitle}>Manage your website optimization experiences</p>
        </div>
        <button onClick={handleCreateTest} className={styles.primaryBtn}>
          + Create Experience
        </button>
      </div>

      <div className={styles.info}>
        <p>
          Create personalized website experiences for different audiences.
          Test variations of headlines, CTAs, and content to optimize conversion rates.
        </p>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading tests...</div>
      ) : abtests.length === 0 ? (
        <div className={styles.empty}>
          <p>No A/B tests yet. Create your first test to get started!</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {abtests.map((test) => {
            const audience = audiences.find((a) => a.id === test.audienceId);
            return (
              <div key={test.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{test.name}</h3>
                  <span className={`${styles.badge} ${styles[test.status]}`}>
                    {test.status}
                  </span>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardInfo}>
                    <span className={styles.label}>Page URL:</span>
                    <span style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>
                      {(test as any).pageUrl || 'Not specified'}
                    </span>
                  </div>
                  <div className={styles.cardInfo}>
                    <span className={styles.label}>Audience:</span>
                    <span>{audience?.name || 'Unknown'}</span>
                  </div>
                  <div className={styles.cardInfo}>
                    <span className={styles.label}>Traffic Split:</span>
                    <span>
                      <strong style={{ color: 'var(--color-red)' }}>A: {(test as any).trafficSplit || 50}%</strong>
                      {' / '}
                      <strong>B: {100 - ((test as any).trafficSplit || 50)}%</strong>
                    </span>
                  </div>
                  <div className={styles.variants}>
                    <div className={styles.variant}>
                      <div className={styles.variantLabel}>Variant A</div>
                      <div className={styles.variantInfo}>
                        <strong>
                          {test.variantA.changes?.length || 0} change{test.variantA.changes?.length !== 1 ? 's' : ''}
                        </strong>
                        <p>{test.variantA.headline || 'Control version'}</p>
                      </div>
                    </div>
                    <div className={styles.variant}>
                      <div className={styles.variantLabel}>Variant B</div>
                      <div className={styles.variantInfo}>
                        <strong>
                          {test.variantB.changes?.length || 0} change{test.variantB.changes?.length !== 1 ? 's' : ''}
                        </strong>
                        <p>{test.variantB.headline || 'Test version'}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className={styles.cardFooter}>
                  <button onClick={() => handleViewAnalytics(test)} className={styles.useBtn}>
                    View Analytics
                  </button>
                  <button onClick={() => handleEditTest(test)} className={styles.editBtn}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(test.id)} className={styles.deleteBtn}>
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

  // Render test editor
  const renderTestEditor = () => (
    <div className={styles.editor}>
      <div className={styles.editorHeader}>
        <h2 className={styles.editorTitle}>
          {editingTest ? 'Edit Experience' : 'Create Experience'}
        </h2>
        <button onClick={handleCancel} className={styles.cancelBtn}>
          ← Back to Experiences
        </button>
      </div>

      <form onSubmit={handleSubmitTest} className={styles.editorForm}>
        <div className={styles.editorSidebar}>
          <div className={styles.infoBox}>
            <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>💡</div>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Visual Editor Tips:</strong>
            <p style={{ fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
              The visual editor works best with pages on your own domain. External websites often block
              embedding due to security policies.
            </p>
          </div>

          <div className={styles.formGroup}>
            <label>Test Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={styles.input}
              placeholder="e.g., Homepage CTA Test"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Page URL *</label>
            <input
              type="url"
              value={formData.pageUrl}
              onChange={(e) => setFormData({ ...formData, pageUrl: e.target.value })}
              className={styles.input}
              placeholder="https://yourdomain.com/page-to-test"
              required
            />
            <p className={styles.fieldHelp}>
              Enter a URL from your website or a staging environment
            </p>
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
            <label>Traffic Split</label>
            <div className={styles.trafficSplitContainer}>
              <div className={styles.trafficSplitSlider}>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formData.trafficSplit}
                  onChange={(e) =>
                    setFormData({ ...formData, trafficSplit: parseInt(e.target.value) })
                  }
                  className={styles.slider}
                />
              </div>
              <div className={styles.trafficSplitLabels}>
                <div className={styles.trafficSplitLabel}>
                  <span className={styles.variantLetter}>A</span>
                  <span className={styles.percentage}>{formData.trafficSplit}%</span>
                </div>
                <div className={styles.trafficSplitLabel}>
                  <span className={styles.variantLetter}>B</span>
                  <span className={styles.percentage}>{100 - formData.trafficSplit}%</span>
                </div>
              </div>
            </div>
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
              <option value="running">Running</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <button type="submit" className={styles.saveBtn}>
            {editingTest ? 'Update Test' : 'Create Test'}
          </button>
        </div>

        <div className={styles.editorMain}>
          {formData.pageUrl ? (
            <>
              <div className={styles.tabsContainer}>
                <div className={styles.tabs}>
                  <button
                    type="button"
                    className={`${styles.tab} ${activeTab === 'variantA' ? styles.activeTab : ''}`}
                    onClick={() => setActiveTab('variantA')}
                  >
                    <span className={styles.tabIcon}>A</span>
                    Variant A (Control)
                    <span className={styles.tabBadge}>
                      {formData.variantA.changes?.length || 0} changes
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.tab} ${activeTab === 'variantB' ? styles.activeTab : ''}`}
                    onClick={() => setActiveTab('variantB')}
                  >
                    <span className={styles.tabIcon}>B</span>
                    Variant B (Test)
                    <span className={styles.tabBadge}>
                      {formData.variantB.changes?.length || 0} changes
                    </span>
                  </button>
                </div>
              </div>

              <div className={styles.tabContent}>
                {activeTab === 'variantA' && (
                  <VisualPageEditor
                    pageUrl={formData.pageUrl}
                    variant={formData.variantA}
                    onChange={(updatedVariant) =>
                      setFormData({ ...formData, variantA: updatedVariant })
                    }
                    variantLabel="Variant A"
                  />
                )}

                {activeTab === 'variantB' && (
                  <VisualPageEditor
                    pageUrl={formData.pageUrl}
                    variant={formData.variantB}
                    onChange={(updatedVariant) =>
                      setFormData({ ...formData, variantB: updatedVariant })
                    }
                    variantLabel="Variant B"
                  />
                )}
              </div>
            </>
          ) : (
            <div className={styles.info} style={{ margin: '2rem', textAlign: 'center' }}>
              <p>Please enter a page URL in the sidebar to start creating variants.</p>
            </div>
          )}
        </div>
      </form>
    </div>
  );

  // Render analytics view
  const renderAnalytics = () => {
    if (!editingTest) return null;

    return (
      <>
        <div className={styles.pageHeader}>
          <div>
            <h2 className={styles.pageTitle}>{editingTest.name} - Analytics</h2>
            <p className={styles.pageSubtitle}>Performance metrics and insights</p>
          </div>
          <button onClick={handleCancel} className={styles.cancelBtn}>
            ← Back to Experiences
          </button>
        </div>

        <ABTestAnalytics testId={editingTest.id} testName={editingTest.name} />
      </>
    );
  };

  return (
    <div className={styles.container}>
      {viewMode === 'list' && (
        <div className={styles.header}>
          <h1 className={styles.title}>DragonDesk: Optimize</h1>
          <p className={styles.subtitle}>Website Personalization & Experience Platform</p>
        </div>
      )}

      <div className={styles.content}>
        {viewMode === 'list' && renderTestsList()}
        {(viewMode === 'create' || viewMode === 'edit') && renderTestEditor()}
        {viewMode === 'analytics' && renderAnalytics()}
      </div>
    </div>
  );
};

export default DragonDeskOptimize;
