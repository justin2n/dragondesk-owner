import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { ABTest, Audience } from '../types';
import VisualPageEditor from '../components/VisualPageEditor';
import ABTestAnalytics from '../components/ABTestAnalytics';
import styles from './DragonDeskOptimize.module.css';

type ViewMode = 'list' | 'create' | 'edit' | 'analytics' | 'tracking';

const DragonDeskOptimize = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [abtests, setAbtests] = useState<ABTest[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTest, setEditingTest] = useState<ABTest | null>(null);
  const [activeTab, setActiveTab] = useState<'variantA' | 'variantB'>('variantA');
  const [previewUrl, setPreviewUrl] = useState('');

  // Behavior tracking state
  const [trackingToken, setTrackingToken] = useState('');
  const [trackingTab, setTrackingTab] = useState<'install' | 'events' | 'pages' | 'audiences'>('install');
  const [trackingSummary, setTrackingSummary] = useState<any>(null);
  const [trackingEvents, setTrackingEvents] = useState<any[]>([]);
  const [topElements, setTopElements] = useState<any[]>([]);
  const [topPages, setTopPages] = useState<any[]>([]);
  const [behaviorRules, setBehaviorRules] = useState<any[]>([]);
  const [audienceName, setAudienceName] = useState('');
  const [audienceOperator, setAudienceOperator] = useState<'any' | 'all'>('any');
  const [eventsFilter, setEventsFilter] = useState('');

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
    setPreviewUrl('');
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
    const url = (test as any).pageUrl || '';
    setPreviewUrl(url);
    setFormData({
      name: test.name,
      audienceId: test.audienceId.toString(),
      pageUrl: url,
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
        <div className={styles.headerActions}>
          <button onClick={() => { setViewMode('tracking'); loadTrackingData(); }} className={styles.cancelBtn}>
            Experience Signals
          </button>
          <button onClick={handleCreateTest} className={styles.primaryBtn}>
            + Create Experience
          </button>
        </div>
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
            <div className={styles.urlInputRow}>
              <input
                type="url"
                value={formData.pageUrl}
                onChange={(e) => setFormData({ ...formData, pageUrl: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setPreviewUrl(formData.pageUrl); } }}
                className={styles.input}
                placeholder="https://yourdomain.com/page-to-test"
                required
              />
              <button
                type="button"
                className={styles.loadPreviewBtn}
                onClick={() => setPreviewUrl(formData.pageUrl)}
                disabled={!formData.pageUrl}
              >
                Load Preview
              </button>
            </div>
            <p className={styles.fieldHelp}>
              Enter a URL then click Load Preview to open the visual editor
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
          {previewUrl ? (
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
                    pageUrl={previewUrl}
                    variant={formData.variantA}
                    onChange={(updatedVariant) =>
                      setFormData({ ...formData, variantA: updatedVariant })
                    }
                    variantLabel="Variant A"
                  />
                )}

                {activeTab === 'variantB' && (
                  <VisualPageEditor
                    pageUrl={previewUrl}
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

  const loadTrackingData = async () => {
    try {
      const config = await api.get('/tracking/config');
      setTrackingToken(config.token);
      const [summary, events, elements, pages] = await Promise.all([
        api.get('/tracking/summary'),
        api.get(`/tracking/events?limit=50${eventsFilter ? `&type=${eventsFilter}` : ''}`),
        api.get('/tracking/top-elements'),
        api.get('/tracking/top-pages'),
      ]);
      setTrackingSummary(summary);
      setTrackingEvents(events);
      setTopElements(elements);
      setTopPages(pages);
    } catch (e) { console.error(e); }
  };

  const handleCreateBehaviorAudience = async () => {
    if (!audienceName || behaviorRules.length === 0) {
      alert('Please enter a name and add at least one rule.');
      return;
    }
    try {
      await api.post('/tracking/audiences', { name: audienceName, rules: behaviorRules, operator: audienceOperator });
      alert(`Audience "${audienceName}" created! It will appear in your A/B test audience selector.`);
      setAudienceName('');
      setBehaviorRules([]);
    } catch (e: any) { alert(e.message); }
  };

  const addRule = (type: string) => {
    setBehaviorRules(prev => [...prev, { type, value: '' }]);
  };

  const renderTracking = () => {
    const scriptTag = trackingToken
      ? `<script async src="${window.location.origin}/api/tracking/script.js?token=${trackingToken}"></script>`
      : '';

    const RULE_TYPES = [
      { type: 'clicked_selector', label: 'Clicked element (CSS selector)', placeholder: '.cta-button or #signup' },
      { type: 'visited_page', label: 'Visited page (path contains)', placeholder: '/pricing or /contact' },
      { type: 'submitted_form', label: 'Submitted any form', placeholder: '' },
      { type: 'min_pages', label: 'Visited at least N pages', placeholder: '3' },
    ];

    return (
      <>
        <div className={styles.pageHeader}>
          <div>
            <h2 className={styles.pageTitle}>Experience Signals</h2>
            <p className={styles.pageSubtitle}>Understand how visitors engage with your site and build audiences from their interactions</p>
          </div>
          <button onClick={() => setViewMode('list')} className={styles.cancelBtn}>← Back</button>
        </div>

        {trackingSummary && (
          <div className={styles.trackingStats}>
            <div className={styles.statCard}><div className={styles.statNum}>{trackingSummary.totalVisitors || 0}</div><div className={styles.statLabel}>Unique Visitors</div></div>
            <div className={styles.statCard}><div className={styles.statNum}>{trackingSummary.pageviews || 0}</div><div className={styles.statLabel}>Page Views</div></div>
            <div className={styles.statCard}><div className={styles.statNum}>{trackingSummary.clicks || 0}</div><div className={styles.statLabel}>Clicks</div></div>
            <div className={styles.statCard}><div className={styles.statNum}>{trackingSummary.form_submits || 0}</div><div className={styles.statLabel}>Form Submits</div></div>
          </div>
        )}

        <div className={styles.trackingTabs}>
          {(['install', 'events', 'pages', 'audiences'] as const).map(tab => (
            <button key={tab} className={`${styles.trackingTab} ${trackingTab === tab ? styles.trackingTabActive : ''}`}
              onClick={() => setTrackingTab(tab)}>
              {tab === 'install' ? 'Install' : tab === 'events' ? 'Event Feed' : tab === 'pages' ? 'Top Pages & Elements' : 'Audience Builder'}
            </button>
          ))}
        </div>

        {/* INSTALL TAB */}
        {trackingTab === 'install' && (
          <div className={styles.trackingPanel}>
            <h3 className={styles.trackingPanelTitle}>Install the Tracking Script</h3>
            <p className={styles.trackingPanelDesc}>
              Add this single line to the <code>&lt;head&gt;</code> of your website or paste it into your tag manager (Google Tag Manager, Segment, etc.).
              It automatically tracks page views, clicks, form submissions, and scroll depth.
            </p>
            <div className={styles.codeBlock}>
              <pre>{scriptTag}</pre>
              <button className={styles.copyBtn} onClick={() => { navigator.clipboard.writeText(scriptTag); alert('Copied!'); }}>Copy</button>
            </div>
            <div className={styles.installDetails}>
              <h4>What gets tracked automatically:</h4>
              <ul>
                <li><strong>Page views</strong> — every page your visitors land on</li>
                <li><strong>Clicks</strong> — every element clicked, with CSS selector and text</li>
                <li><strong>Form submissions</strong> — when any form is submitted</li>
                <li><strong>Scroll depth</strong> — how far down visitors scroll (25%, 50%, 75%, 100%)</li>
              </ul>
              <h4>Personalization:</h4>
              <p>The script also automatically fetches and applies variant changes for running A/B tests targeting behavior audiences — no additional setup needed.</p>
              <h4>Your site token:</h4>
              <div className={styles.tokenDisplay}><code>{trackingToken}</code></div>
            </div>
          </div>
        )}

        {/* EVENTS TAB */}
        {trackingTab === 'events' && (
          <div className={styles.trackingPanel}>
            <div className={styles.eventsHeader}>
              <h3 className={styles.trackingPanelTitle}>Live Event Feed</h3>
              <div className={styles.eventsFilter}>
                <select value={eventsFilter} onChange={e => { setEventsFilter(e.target.value); }} className={styles.filterSelect}>
                  <option value="">All events</option>
                  <option value="pageview">Page views</option>
                  <option value="click">Clicks</option>
                  <option value="form_submit">Form submits</option>
                  <option value="scroll_depth">Scroll depth</option>
                </select>
                <button onClick={loadTrackingData} className={styles.refreshBtn}>Refresh</button>
              </div>
            </div>
            <table className={styles.eventsTable}>
              <thead><tr><th>Type</th><th>Visitor</th><th>Page</th><th>Selector / Detail</th><th>Time</th></tr></thead>
              <tbody>
                {trackingEvents.length === 0 && (
                  <tr><td colSpan={5} className={styles.emptyRow}>No events yet — install the tracking script on your website to start collecting data.</td></tr>
                )}
                {trackingEvents.map(evt => (
                  <tr key={evt.id}>
                    <td><span className={`${styles.eventBadge} ${styles[`evt_${evt.eventType}`]}`}>{evt.eventType}</span></td>
                    <td className={styles.visitorCell}>{evt.visitorId?.slice(0, 8)}…</td>
                    <td className={styles.pathCell}>{evt.pagePath || '—'}</td>
                    <td className={styles.selectorCell}>{evt.selector || evt.elementText || evt.pageTitle || '—'}</td>
                    <td className={styles.timeCell}>{new Date(evt.createdAt).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TOP PAGES & ELEMENTS TAB */}
        {trackingTab === 'pages' && (
          <div className={styles.trackingPanel}>
            <div className={styles.twoCol}>
              <div>
                <h3 className={styles.trackingPanelTitle}>Top Pages</h3>
                <table className={styles.eventsTable}>
                  <thead><tr><th>Page</th><th>Views</th><th>Unique</th></tr></thead>
                  <tbody>
                    {topPages.length === 0 && <tr><td colSpan={3} className={styles.emptyRow}>No data yet</td></tr>}
                    {topPages.map((p, i) => (
                      <tr key={i}>
                        <td className={styles.pathCell}>{p.pagePath}</td>
                        <td>{p.views}</td>
                        <td>{p.uniqueVisitors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className={styles.trackingPanelTitle}>Most Clicked Elements</h3>
                <table className={styles.eventsTable}>
                  <thead><tr><th>Selector</th><th>Text</th><th>Clicks</th><th>Unique</th></tr></thead>
                  <tbody>
                    {topElements.length === 0 && <tr><td colSpan={4} className={styles.emptyRow}>No clicks yet</td></tr>}
                    {topElements.map((el, i) => (
                      <tr key={i}>
                        <td className={styles.selectorCell}><code>{el.selector?.slice(0, 40)}</code></td>
                        <td>{el.elementText?.slice(0, 30) || '—'}</td>
                        <td>{el.clicks}</td>
                        <td>{el.uniqueVisitors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* AUDIENCE BUILDER TAB */}
        {trackingTab === 'audiences' && (
          <div className={styles.trackingPanel}>
            <h3 className={styles.trackingPanelTitle}>Build a Behavior Audience</h3>
            <p className={styles.trackingPanelDesc}>
              Define rules based on visitor behavior. The audience will automatically be available in your A/B test targeting.
            </p>

            <div className={styles.audienceForm}>
              <div className={styles.audienceRow}>
                <label>Audience Name</label>
                <input value={audienceName} onChange={e => setAudienceName(e.target.value)}
                  placeholder="e.g. Clicked Pricing CTA" className={styles.audienceInput} />
              </div>

              <div className={styles.audienceRow}>
                <label>Match</label>
                <select value={audienceOperator} onChange={e => setAudienceOperator(e.target.value as any)} className={styles.filterSelect}>
                  <option value="any">Any of these rules</option>
                  <option value="all">All of these rules</option>
                </select>
              </div>

              <div className={styles.rulesList}>
                {behaviorRules.map((rule, i) => {
                  const def = RULE_TYPES.find(r => r.type === rule.type);
                  return (
                    <div key={i} className={styles.ruleRow}>
                      <span className={styles.ruleLabel}>{def?.label}</span>
                      {def?.placeholder !== '' && (
                        <input value={rule.value}
                          onChange={e => setBehaviorRules(prev => prev.map((r, j) => j === i ? { ...r, value: e.target.value } : r))}
                          placeholder={def?.placeholder}
                          className={styles.ruleInput}
                        />
                      )}
                      <button onClick={() => setBehaviorRules(prev => prev.filter((_, j) => j !== i))} className={styles.removeRuleBtn}>✕</button>
                    </div>
                  );
                })}
              </div>

              <div className={styles.addRuleButtons}>
                {RULE_TYPES.map(rt => (
                  <button key={rt.type} onClick={() => addRule(rt.type)} className={styles.addRuleBtn}>+ {rt.label}</button>
                ))}
              </div>

              <button onClick={handleCreateBehaviorAudience} className={styles.createAudienceBtn}
                disabled={!audienceName || behaviorRules.length === 0}>
                Create Audience
              </button>
            </div>
          </div>
        )}
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
        {viewMode === 'tracking' && renderTracking()}
      </div>
    </div>
  );
};

export default DragonDeskOptimize;
