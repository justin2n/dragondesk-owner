import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { ABTest, Audience } from '../types';
import VisualPageEditor from '../components/VisualPageEditor';
import ABTestAnalytics from '../components/ABTestAnalytics';
import { useToast } from '../components/Toast';
import styles from './DragonDeskOptimize.module.css';

type ViewMode = 'list' | 'create' | 'edit' | 'analytics' | 'tracking';
type ExperienceType = 'page_edit' | 'promo_bar' | 'offer_modal';

const EXPERIENCE_TYPES: { value: ExperienceType; label: string; desc: string }[] = [
  { value: 'page_edit', label: 'Page Edit', desc: 'Change text, styles, or attributes on an existing page.' },
  { value: 'promo_bar', label: 'Promo Bar', desc: 'A banner injected at the top or bottom of every page.' },
  { value: 'offer_modal', label: 'Offer Modal', desc: 'A popup shown on load, exit intent, or scroll depth.' },
];

// Treatment config defaults. The bar/modal config rides inside variantB so the
// existing two-variant structure is reused (A = control, B = treatment).
const DEFAULT_PROMO_BAR = {
  message: 'Join today and get your first month free!',
  ctaLabel: 'Claim Offer', ctaLink: '',
  bgColor: '#c0392b', textColor: '#ffffff',
  position: 'top' as 'top' | 'bottom',
  dismissible: true, frequency: 'session' as 'session' | 'once' | 'always',
};
const DEFAULT_OFFER_MODAL = {
  heading: 'Limited-time offer', body: 'Sign up this week and get your first month free.',
  imageUrl: '', ctaLabel: 'Get Started', ctaLink: '',
  bgColor: '#ffffff', textColor: '#1a1a2e', accentColor: '#c0392b',
  trigger: { type: 'load' as 'load' | 'exit' | 'scroll', delaySeconds: 3, scrollPct: 50 },
  dismissible: true, frequency: 'session' as 'session' | 'once' | 'always',
};
// Where a bar/modal shows: the whole site, or a specific page matched by path.
const DEFAULT_TARGETING = {
  scope: 'site' as 'site' | 'page',
  matchType: 'contains' as 'contains' | 'exact' | 'startsWith',
  value: '',
};

// Conversion goal — completing it records a 'lead' event, which drives the
// conversion rate + winner in analytics. 'none' just tracks views/clicks.
type GoalType = 'none' | 'form_submit' | 'tel_click' | 'email_click' | 'selector_click';
const GOAL_OPTIONS: { value: GoalType; label: string }[] = [
  { value: 'none', label: 'No goal (track views & clicks only)' },
  { value: 'form_submit', label: 'Form submitted (a lead fills out any form)' },
  { value: 'tel_click', label: 'Phone number clicked (tel: link)' },
  { value: 'email_click', label: 'Email clicked (mailto: link)' },
  { value: 'selector_click', label: 'Specific button/link clicked (by CSS selector)' },
];

const DragonDeskOptimize = () => {
  const { toast, confirm } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [abtests, setAbtests] = useState<ABTest[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTest, setEditingTest] = useState<ABTest | null>(null);
  const [activeTab, setActiveTab] = useState<'variantA' | 'variantB'>('variantA');
  const [previewUrl, setPreviewUrl] = useState('');

  // Behavior tracking state
  const [trackingToken, setTrackingToken] = useState('');
  const [trackingTab, setTrackingTab] = useState<'events' | 'pages' | 'audiences' | 'identity' | 'install'>('events');
  const [trackingSummary, setTrackingSummary] = useState<any>(null);
  const [trackingEvents, setTrackingEvents] = useState<any[]>([]);
  const [topElements, setTopElements] = useState<any[]>([]);
  const [topPages, setTopPages] = useState<any[]>([]);
  const [behaviorRules, setBehaviorRules] = useState<any[]>([]);
  const [audienceName, setAudienceName] = useState('');
  const [audienceOperator, setAudienceOperator] = useState<'any' | 'all'>('any');
  const [eventsFilter, setEventsFilter] = useState('');
  const [showEmbedCode, setShowEmbedCode] = useState(false);
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(null);
  const [visitorDetail, setVisitorDetail] = useState<any | null>(null);
  const [visitorDetailLoading, setVisitorDetailLoading] = useState(false);
  const [identitySettings, setIdentitySettings] = useState<{ priority: string[]; autoResolve: boolean } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    experienceType: 'page_edit' as ExperienceType,
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
      promoBar: { ...DEFAULT_PROMO_BAR },
      offerModal: { ...DEFAULT_OFFER_MODAL },
      targeting: { ...DEFAULT_TARGETING },
    },
    goal: { type: 'none' as GoalType, selector: '' },
    status: 'draft' as 'draft' | 'running' | 'completed',
  });

  // If the form opened before audiences loaded, default the target to All Traffic
  // (everyone) once it's available, so an experience is never left unassigned.
  useEffect(() => {
    const allTraffic = audiences.find(a => a.name === 'All Traffic');
    if ((viewMode === 'create' || viewMode === 'edit') && !formData.audienceId && allTraffic) {
      setFormData(fd => ({ ...fd, audienceId: String(allTraffic.id) }));
    }
  }, [audiences, viewMode, formData.audienceId]);

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

  // The seeded "All Traffic" audience — default target for new experiences.
  const allTrafficId = audiences.find(a => a.name === 'All Traffic')?.id;

  const handleCreateTest = () => {
    setEditingTest(null);
    setPreviewUrl('');
    setFormData({
      name: '',
      experienceType: 'page_edit',
      audienceId: allTrafficId ? String(allTrafficId) : '',
      pageUrl: '',
      trafficSplit: 50,
      variantA: { title: '', headline: '', content: '', cta: '', ctaLink: '', image: '', changes: [] },
      variantB: { title: '', headline: '', content: '', cta: '', ctaLink: '', image: '', changes: [], promoBar: { ...DEFAULT_PROMO_BAR }, offerModal: { ...DEFAULT_OFFER_MODAL }, targeting: { ...DEFAULT_TARGETING } },
      goal: { type: 'none', selector: '' },
      status: 'draft',
    });
    setActiveTab('variantA');
    setViewMode('create');
  };

  const handleEditTest = (test: ABTest) => {
    setEditingTest(test);
    const url = (test as any).pageUrl || '';
    setPreviewUrl(url);
    const vb: any = test.variantB || {};
    setFormData({
      name: test.name,
      experienceType: ((test as any).experienceType as ExperienceType) || 'page_edit',
      audienceId: test.audienceId ? test.audienceId.toString() : (allTrafficId ? String(allTrafficId) : ''),
      pageUrl: url,
      trafficSplit: (test as any).trafficSplit ?? 50,
      variantA: { ...test.variantA, changes: test.variantA.changes || [] },
      // Backfill bar/modal config for older tests that predate these fields.
      variantB: { ...vb, changes: vb.changes || [], promoBar: { ...DEFAULT_PROMO_BAR, ...(vb.promoBar || {}) }, offerModal: { ...DEFAULT_OFFER_MODAL, ...(vb.offerModal || {}), trigger: { ...DEFAULT_OFFER_MODAL.trigger, ...((vb.offerModal || {}).trigger || {}) } }, targeting: { ...DEFAULT_TARGETING, ...(vb.targeting || {}) } },
      goal: (() => { const g: any = (test as any).goal; const parsed = typeof g === 'string' ? (g ? JSON.parse(g) : null) : g; return { type: (parsed?.type as GoalType) || 'none', selector: parsed?.selector || '' }; })(),
      status: test.status,
    });
    setActiveTab('variantA');
    setViewMode('edit');
  };

  const handleSubmitTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.audienceId) {
      toast('Please select a target audience before publishing.', 'error');
      return;
    }
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
      toast(error.message || 'Failed to save A/B test', 'error');
    }
  };

  const handleSaveDraft = async () => {
    if (!formData.name) {
      toast('Please enter a test name before saving.', 'error');
      return;
    }
    try {
      const payload = {
        ...formData,
        status: 'draft',
        audienceId: formData.audienceId ? parseInt(formData.audienceId) : null,
      };

      if (editingTest) {
        await api.put(`/abtests/${editingTest.id}`, payload);
      } else {
        await api.post('/abtests', payload);
      }

      toast('Draft saved.', 'success');
      setViewMode('list');
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to save draft', 'error');
    }
  };

  const handleCancel = () => {
    setViewMode('list');
    setEditingTest(null);
  };

  const handleDelete = async (id: number) => {
    if (!await confirm({ title: 'Delete A/B Test', message: 'Are you sure you want to delete this A/B test?', confirmLabel: 'Delete', danger: true })) return;

    try {
      await api.delete(`/abtests/${id}`);
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to delete A/B test', 'error');
    }
  };

  const handleViewAnalytics = (test: ABTest) => {
    setEditingTest(test);
    setViewMode('analytics');
  };

  // Patch the treatment (variant B) bar/modal config.
  const updateBar = (patch: Partial<typeof DEFAULT_PROMO_BAR>) =>
    setFormData(fd => ({ ...fd, variantB: { ...fd.variantB, promoBar: { ...fd.variantB.promoBar, ...patch } } }));
  const updateModal = (patch: Partial<typeof DEFAULT_OFFER_MODAL>) =>
    setFormData(fd => ({ ...fd, variantB: { ...fd.variantB, offerModal: { ...fd.variantB.offerModal, ...patch } } }));
  const updateTargeting = (patch: Partial<typeof DEFAULT_TARGETING>) =>
    setFormData(fd => ({ ...fd, variantB: { ...fd.variantB, targeting: { ...fd.variantB.targeting, ...patch } } }));

  // Config form + live preview for promo bar / offer modal experiences. Variant A
  // is always control (nothing shown), so there's a single treatment editor.
  const renderTreatmentEditor = () => {
    const isBar = formData.experienceType === 'promo_bar';
    const bar = formData.variantB.promoBar;
    const modal = formData.variantB.offerModal;
    const field = (label: string, node: React.ReactNode) => (
      <div className={styles.formGroup}><label>{label}</label>{node}</div>
    );
    return (
      <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <h3 style={{ marginTop: 0 }}>{isBar ? 'Promo Bar' : 'Offer Modal'} — Treatment</h3>
          <p className={styles.fieldHelp} style={{ marginBottom: '1rem' }}>
            Variant A is the control (nothing shown). This is what the treatment group sees.
          </p>

          {isBar ? (
            <>
              {field('Message', <input className={styles.input} value={bar.message} onChange={e => updateBar({ message: e.target.value })} />)}
              {field('Button Label', <input className={styles.input} value={bar.ctaLabel} onChange={e => updateBar({ ctaLabel: e.target.value })} placeholder="Leave blank for no button" />)}
              {field('Button Link', <input className={styles.input} value={bar.ctaLink} onChange={e => updateBar({ ctaLink: e.target.value })} placeholder="https://..." />)}
              <div style={{ display: 'flex', gap: '1rem' }}>
                {field('Background', <input type="color" value={bar.bgColor} onChange={e => updateBar({ bgColor: e.target.value })} />)}
                {field('Text', <input type="color" value={bar.textColor} onChange={e => updateBar({ textColor: e.target.value })} />)}
                {field('Position', <select className={styles.input} value={bar.position} onChange={e => updateBar({ position: e.target.value as 'top' | 'bottom' })}><option value="top">Top</option><option value="bottom">Bottom</option></select>)}
              </div>
            </>
          ) : (
            <>
              {field('Heading', <input className={styles.input} value={modal.heading} onChange={e => updateModal({ heading: e.target.value })} />)}
              {field('Body', <textarea className={styles.input} rows={3} value={modal.body} onChange={e => updateModal({ body: e.target.value })} />)}
              {field('Image URL', <input className={styles.input} value={modal.imageUrl} onChange={e => updateModal({ imageUrl: e.target.value })} placeholder="Optional https://..." />)}
              {field('Button Label', <input className={styles.input} value={modal.ctaLabel} onChange={e => updateModal({ ctaLabel: e.target.value })} />)}
              {field('Button Link', <input className={styles.input} value={modal.ctaLink} onChange={e => updateModal({ ctaLink: e.target.value })} placeholder="https://..." />)}
              <div style={{ display: 'flex', gap: '1rem' }}>
                {field('Background', <input type="color" value={modal.bgColor} onChange={e => updateModal({ bgColor: e.target.value })} />)}
                {field('Text', <input type="color" value={modal.textColor} onChange={e => updateModal({ textColor: e.target.value })} />)}
                {field('Button', <input type="color" value={modal.accentColor} onChange={e => updateModal({ accentColor: e.target.value })} />)}
              </div>
              {field('Trigger', (
                <select className={styles.input} value={modal.trigger.type} onChange={e => updateModal({ trigger: { ...modal.trigger, type: e.target.value as 'load' | 'exit' | 'scroll' } })}>
                  <option value="load">On page load (after delay)</option>
                  <option value="exit">Exit intent</option>
                  <option value="scroll">On scroll depth</option>
                </select>
              ))}
              {modal.trigger.type === 'load' && field('Delay (seconds)', <input type="number" min="0" className={styles.input} value={modal.trigger.delaySeconds} onChange={e => updateModal({ trigger: { ...modal.trigger, delaySeconds: parseInt(e.target.value) || 0 } })} />)}
              {modal.trigger.type === 'scroll' && field('Scroll depth (%)', <input type="number" min="1" max="100" className={styles.input} value={modal.trigger.scrollPct} onChange={e => updateModal({ trigger: { ...modal.trigger, scrollPct: parseInt(e.target.value) || 50 } })} />)}
            </>
          )}

          {field('Show frequency', (
            <select className={styles.input} value={isBar ? bar.frequency : modal.frequency} onChange={e => (isBar ? updateBar : updateModal)({ frequency: e.target.value as 'session' | 'once' | 'always' })}>
              <option value="session">Once per session</option>
              <option value="once">Once ever (per visitor)</option>
              <option value="always">Every page view</option>
            </select>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input type="checkbox" checked={isBar ? bar.dismissible : modal.dismissible} onChange={e => (isBar ? updateBar : updateModal)({ dismissible: e.target.checked })} />
            Visitors can dismiss it
          </label>

          {/* URL targeting — whole site or a specific page. */}
          <h4 style={{ margin: '1.5rem 0 0.5rem' }}>Show on</h4>
          {field('Pages', (
            <select className={styles.input} value={formData.variantB.targeting.scope} onChange={e => updateTargeting({ scope: e.target.value as 'site' | 'page' })}>
              <option value="site">Whole site — every page</option>
              <option value="page">A specific page</option>
            </select>
          ))}
          {formData.variantB.targeting.scope === 'page' && (
            <>
              {field('Match', (
                <select className={styles.input} value={formData.variantB.targeting.matchType} onChange={e => updateTargeting({ matchType: e.target.value as 'contains' | 'exact' | 'startsWith' })}>
                  <option value="exact">URL path is exactly</option>
                  <option value="startsWith">URL path starts with</option>
                  <option value="contains">URL path contains</option>
                </select>
              ))}
              {field('Path', (
                <input className={styles.input} value={formData.variantB.targeting.value}
                  onChange={e => updateTargeting({ value: e.target.value })}
                  placeholder="/pricing" />
              ))}
              <p className={styles.fieldHelp}>
                Match the page path, e.g. <code>/pricing</code>. Paste a full <code>https://</code> URL to match the whole address instead.
              </p>
            </>
          )}
        </div>

        {/* Live preview */}
        <div>
          <h3 style={{ marginTop: 0 }}>Preview</h3>
          {isBar ? (
            <div style={{ background: bar.bgColor, color: bar.textColor, padding: '12px 16px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, fontWeight: 600 }}>
              <span>{bar.message}</span>
              {bar.ctaLabel && <span style={{ background: bar.textColor, color: bar.bgColor, padding: '7px 16px', borderRadius: 6, fontWeight: 700 }}>{bar.ctaLabel}</span>}
              {bar.dismissible && <span style={{ marginLeft: 8, opacity: 0.8 }}>×</span>}
            </div>
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: 24, display: 'flex', justifyContent: 'center' }}>
              <div style={{ background: modal.bgColor, color: modal.textColor, borderRadius: 12, padding: 28, maxWidth: 340, textAlign: 'center', position: 'relative' }}>
                {modal.dismissible && <span style={{ position: 'absolute', right: 12, top: 8, opacity: 0.6 }}>×</span>}
                {modal.imageUrl && <img src={modal.imageUrl} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 12 }} />}
                {modal.heading && <h2 style={{ margin: '0 0 10px', fontSize: 20 }}>{modal.heading}</h2>}
                {modal.body && <p style={{ margin: '0 0 16px', opacity: 0.9 }}>{modal.body}</p>}
                {modal.ctaLabel && <span style={{ display: 'inline-block', background: modal.accentColor, color: '#fff', padding: '12px 24px', borderRadius: 8, fontWeight: 700 }}>{modal.ctaLabel}</span>}
              </div>
            </div>
          )}
          <p className={styles.fieldHelp} style={{ marginTop: '1rem' }}>
            Runs on any page where your DragonDesk tracking snippet is installed. Set status to Running to go live.
          </p>
        </div>
      </div>
    );
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

      {/* Embed code section */}
      <div className={styles.embedSection}>
        <div className={styles.embedHeader} onClick={() => {
          if (!showEmbedCode && !trackingToken) loadTrackingData();
          setShowEmbedCode(v => !v);
        }}>
          <span>Site Embed Code</span>
          <span className={styles.embedToggle}>{showEmbedCode ? '▲ Hide' : '▼ Show'}</span>
        </div>
        {showEmbedCode && (
          <div className={styles.embedBody}>
            <p className={styles.embedDesc}>
              Add this script to the <code>&lt;head&gt;</code> of your website (or via Google Tag Manager) to enable personalization and Experience Signals tracking.
            </p>
            {trackingToken ? (
              <div className={styles.codeBlock}>
                <pre>{`<script async src="${window.location.origin}/api/tracking/script.js?token=${trackingToken}"></script>`}</pre>
                <button className={styles.copyBtn} onClick={() => {
                  navigator.clipboard.writeText(`<script async src="${window.location.origin}/api/tracking/script.js?token=${trackingToken}"></script>`);
                  toast('Copied!', 'success');
                }}>Copy</button>
              </div>
            ) : (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Loading token…</p>
            )}
          </div>
        )}
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
            <label>Experience Type</label>
            <select
              value={formData.experienceType}
              onChange={(e) => {
                const experienceType = e.target.value as ExperienceType;
                // Bar/modal default to 100% ("just run it"); page edits to a 50/50 split.
                const trafficSplit = experienceType === 'page_edit' ? 50 : 100;
                setFormData({ ...formData, experienceType, trafficSplit });
              }}
              className={styles.input}
            >
              {EXPERIENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <p className={styles.fieldHelp}>
              {EXPERIENCE_TYPES.find(t => t.value === formData.experienceType)?.desc}
            </p>
          </div>

          {formData.experienceType === 'page_edit' && (
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
          )}

          <div className={styles.formGroup}>
            <label>Who sees it</label>
            <select
              value={formData.audienceId}
              onChange={(e) => setFormData({ ...formData, audienceId: e.target.value })}
              className={styles.input}
            >
              {/* All Traffic (everyone) is the default and sits at the top; other
                  audiences narrow to visitors matching their behavior rules. */}
              {[...audiences]
                .sort((a, b) => (a.name === 'All Traffic' ? -1 : b.name === 'All Traffic' ? 1 : 0))
                .map((audience) => (
                  <option key={audience.id} value={audience.id}>
                    {audience.name === 'All Traffic' ? 'All Traffic — everyone' : audience.name}
                  </option>
                ))}
            </select>
            <p className={styles.fieldHelp}>
              {audiences.find(a => String(a.id) === formData.audienceId)?.name === 'All Traffic'
                ? 'Shown to every visitor. Set "Show To" to 100% to reach everyone, or lower it to test it against a holdout.'
                : 'Only visitors matching this audience will see it. Choose All Traffic to show it to everyone.'}
            </p>
          </div>

          <div className={styles.formGroup}>
            <label>{formData.experienceType === 'page_edit' ? 'Traffic Split' : 'Show To'}</label>
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
              {formData.experienceType === 'page_edit' ? (
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
              ) : (
                <div className={styles.trafficSplitLabels}>
                  <div className={styles.trafficSplitLabel}>
                    <span className={styles.percentage}>{formData.trafficSplit}% see it</span>
                  </div>
                  <div className={styles.trafficSplitLabel}>
                    <span className={styles.percentage}>{100 - formData.trafficSplit}% control</span>
                  </div>
                </div>
              )}
            </div>
            {formData.experienceType !== 'page_edit' && (
              <p className={styles.fieldHelp}>100% just runs it. Lower it to A/B test showing it vs not.</p>
            )}
          </div>

          <div className={styles.formGroup}>
            <label>Conversion Goal</label>
            <select
              value={formData.goal.type}
              onChange={(e) => setFormData({ ...formData, goal: { ...formData.goal, type: e.target.value as GoalType } })}
              className={styles.input}
            >
              {GOAL_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            {formData.goal.type === 'selector_click' && (
              <input
                className={styles.input}
                style={{ marginTop: 8 }}
                value={formData.goal.selector}
                onChange={(e) => setFormData({ ...formData, goal: { ...formData.goal, selector: e.target.value } })}
                placeholder=".book-now, #signup-btn"
              />
            )}
            <p className={styles.fieldHelp}>
              Completing the goal counts as a conversion in analytics. Works for any experience type.
            </p>
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

          <div className={styles.editorActions}>
            <button type="button" onClick={handleSaveDraft} className={styles.saveDraftBtn}>
              Save Draft
            </button>
            <button type="submit" className={styles.saveBtn}>
              {editingTest ? 'Update Test' : 'Create Test'}
            </button>
          </div>
        </div>

        <div className={styles.editorMain}>
          {formData.experienceType !== 'page_edit' ? (
            renderTreatmentEditor()
          ) : previewUrl ? (
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

  const loadEvents = async () => {
    try {
      const events = await api.get(`/tracking/events?limit=50${eventsFilter ? `&type=${eventsFilter}` : ''}`);
      setTrackingEvents(events);
    } catch (e) { console.error(e); }
  };

  const loadVisitorDetail = async (visitorId: string) => {
    setSelectedVisitorId(visitorId);
    setVisitorDetailLoading(true);
    setVisitorDetail(null);
    try {
      const data = await api.get(`/tracking/visitor/${visitorId}`);
      setVisitorDetail(data);
    } catch (e) { console.error(e); }
    finally { setVisitorDetailLoading(false); }
  };

  const loadIdentitySettings = async () => {
    try {
      const data = await api.get('/tracking/identity-settings');
      setIdentitySettings(data);
    } catch (e) { console.error(e); }
  };

  // Auto-refresh events every 10 seconds when on events tab
  useEffect(() => {
    if (trackingTab !== 'events' || !autoRefresh) return;
    const interval = setInterval(() => { loadEvents(); }, 10000);
    return () => clearInterval(interval);
  }, [trackingTab, autoRefresh, eventsFilter]);

  // Load identity settings when switching to identity tab
  useEffect(() => {
    if (trackingTab === 'identity' && identitySettings === null) {
      loadIdentitySettings();
    }
  }, [trackingTab]);

  const handleCreateBehaviorAudience = async () => {
    if (!audienceName || behaviorRules.length === 0) {
      toast('Please enter a name and add at least one rule.', 'error');
      return;
    }
    try {
      await api.post('/tracking/audiences', { name: audienceName, rules: behaviorRules, operator: audienceOperator });
      toast(`Audience "${audienceName}" created! It will appear in your A/B test audience selector.`, 'success');
      setAudienceName('');
      setBehaviorRules([]);
    } catch (e: any) { toast(e.message, 'error'); }
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
          {(['events', 'pages', 'audiences', 'identity', 'install'] as const).map(tab => (
            <button key={tab} className={`${styles.trackingTab} ${trackingTab === tab ? styles.trackingTabActive : ''}`}
              onClick={() => {
                setTrackingTab(tab);
                if (tab === 'identity' && identitySettings === null) loadIdentitySettings();
              }}>
              {tab === 'install' ? 'Install' : tab === 'events' ? 'Event Feed' : tab === 'pages' ? 'Top Pages & Elements' : tab === 'audiences' ? 'Audience Builder' : 'Identity Settings'}
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
              <button className={styles.copyBtn} onClick={() => { navigator.clipboard.writeText(scriptTag); toast('Copied!', 'success'); }}>Copy</button>
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
                <button
                  onClick={() => setAutoRefresh(v => !v)}
                  className={autoRefresh ? styles.autoRefreshOn : styles.refreshBtn}
                  title={autoRefresh ? 'Auto-refresh on (every 10s)' : 'Auto-refresh off'}
                >
                  {autoRefresh ? '⟳ Live' : '⟳ Paused'}
                </button>
              </div>
            </div>
            <table className={styles.eventsTable}>
              <thead><tr><th>Type</th><th>Visitor</th><th>Identity</th><th>Page</th><th>Selector / Detail</th><th>Time</th></tr></thead>
              <tbody>
                {trackingEvents.length === 0 && (
                  <tr><td colSpan={6} className={styles.emptyRow}>No events yet — install the tracking script on your website to start collecting data.</td></tr>
                )}
                {trackingEvents.map(evt => (
                  <tr key={evt.id} onClick={() => loadVisitorDetail(evt.visitorId)} style={{ cursor: 'pointer' }}>
                    <td><span className={`${styles.eventBadge} ${styles[`evt_${evt.eventType}`]}`}>{evt.eventType}</span></td>
                    <td className={styles.visitorCell}>{evt.visitorId?.slice(0, 8)}…</td>
                    <td></td>
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

        {/* IDENTITY SETTINGS TAB */}
        {trackingTab === 'identity' && !identitySettings && (
          <div className={styles.trackingPanel}>
            <div className={styles.drawerLoading}>Loading...</div>
          </div>
        )}

        {trackingTab === 'identity' && identitySettings && (
          <div className={styles.trackingPanel}>
            <h3 className={styles.trackingPanelTitle}>Identity Resolution Settings</h3>
            <p className={styles.trackingPanelDesc}>
              Configure how anonymous visitor IDs are matched to known contacts. When a visitor submits a form with their email,
              they are automatically resolved to a contact if one exists.
            </p>

            {/* Auto-resolve toggle */}
            <div className={styles.identitySettingRow}>
              <div>
                <div className={styles.identitySettingLabel}>Auto-resolve identities</div>
                <div className={styles.identitySettingDesc}>Automatically link visitors to contacts when email is captured from form submissions</div>
              </div>
              <button
                className={identitySettings.autoResolve ? styles.toggleOn : styles.toggleOff}
                onClick={async () => {
                  const updated = { ...identitySettings, autoResolve: !identitySettings.autoResolve };
                  setIdentitySettings(updated);
                  await api.put('/tracking/identity-settings', updated);
                }}
              >
                {identitySettings.autoResolve ? 'On' : 'Off'}
              </button>
            </div>

            {/* Priority order */}
            <div className={styles.identitySettingRow} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div className={styles.identitySettingLabel}>Identity signal priority</div>
              <div className={styles.identitySettingDesc}>Order in which identity signals are used for matching. Use arrows to reorder.</div>
              <div className={styles.priorityList}>
                {identitySettings.priority.map((signal: string, idx: number) => (
                  <div key={signal} className={styles.priorityItem}>
                    <span className={styles.priorityRank}>{idx + 1}</span>
                    <span className={styles.prioritySignal}>{signal}</span>
                    <div className={styles.priorityActions}>
                      <button
                        disabled={idx === 0}
                        onClick={async () => {
                          const newPriority = [...identitySettings.priority];
                          [newPriority[idx-1], newPriority[idx]] = [newPriority[idx], newPriority[idx-1]];
                          const updated = { ...identitySettings, priority: newPriority };
                          setIdentitySettings(updated);
                          await api.put('/tracking/identity-settings', updated);
                        }}
                        className={styles.priorityBtn}
                      >↑</button>
                      <button
                        disabled={idx === identitySettings.priority.length - 1}
                        onClick={async () => {
                          const newPriority = [...identitySettings.priority];
                          [newPriority[idx], newPriority[idx+1]] = [newPriority[idx+1], newPriority[idx]];
                          const updated = { ...identitySettings, priority: newPriority };
                          setIdentitySettings(updated);
                          await api.put('/tracking/identity-settings', updated);
                        }}
                        className={styles.priorityBtn}
                      >↓</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* How it works */}
            <div className={styles.identityHowItWorks}>
              <h4>How identity resolution works</h4>
              <ol>
                <li>Visitor arrives on your site — assigned anonymous ID stored in a 1-year cookie</li>
                <li>Script captures email address when visitor submits any form containing an email field</li>
                <li>Email is matched against Contacts — if found, the visitor is linked to that contact</li>
                <li>All past and future events from that anonymous ID are attributed to the matched contact</li>
              </ol>
            </div>
          </div>
        )}

        {/* VISITOR DETAIL DRAWER */}
        {selectedVisitorId && (
          <div className={styles.drawerOverlay} onClick={() => setSelectedVisitorId(null)}>
            <div className={styles.drawer} onClick={e => e.stopPropagation()}>
              <div className={styles.drawerHeader}>
                <h3>Visitor Profile</h3>
                <button onClick={() => setSelectedVisitorId(null)} className={styles.drawerClose}>✕</button>
              </div>

              {visitorDetailLoading ? (
                <div className={styles.drawerLoading}>Loading...</div>
              ) : visitorDetail ? (
                <div className={styles.drawerBody}>
                  {/* Anonymous ID */}
                  <div className={styles.drawerSection}>
                    <div className={styles.drawerSectionLabel}>Anonymous ID</div>
                    <code className={styles.visitorIdFull}>{visitorDetail.visitor?.visitorId}</code>
                  </div>

                  {/* Location */}
                  <div className={styles.drawerSection}>
                    <div className={styles.drawerSectionLabel}>Location</div>
                    <div>{visitorDetail.visitor?.city && visitorDetail.visitor?.country
                      ? `${visitorDetail.visitor.city}, ${visitorDetail.visitor.country}`
                      : visitorDetail.visitor?.country || 'Unknown'}</div>
                  </div>

                  {/* Identity / Matched Contact */}
                  <div className={styles.drawerSection}>
                    <div className={styles.drawerSectionLabel}>Identity</div>
                    {visitorDetail.matchedMember ? (
                      <div className={styles.matchedContact}>
                        <div className={styles.matchedContactName}>
                          {visitorDetail.matchedMember.firstName} {visitorDetail.matchedMember.lastName}
                        </div>
                        <div className={styles.matchedContactEmail}>{visitorDetail.matchedMember.email}</div>
                        <div className={styles.matchedContactMeta}>
                          <span className={styles.statusBadge}>{visitorDetail.matchedMember.accountStatus}</span>
                          {visitorDetail.matchedMember.programType && (
                            <span className={styles.programBadge}>{visitorDetail.matchedMember.programType}</span>
                          )}
                        </div>
                        <a href={`/contacts?id=${visitorDetail.matchedMember.id}`} className={styles.viewContactLink} target="_blank" rel="noreferrer">
                          View in Contacts →
                        </a>
                      </div>
                    ) : visitorDetail.identities?.length > 0 ? (
                      <div>
                        {visitorDetail.identities.map((id: any) => (
                          <div key={id.id} className={styles.identityChip}>
                            <span className={styles.identityType}>{id.type}</span>
                            <span>{id.value}</span>
                          </div>
                        ))}
                        <div className={styles.noMatch}>No contact match found</div>
                      </div>
                    ) : (
                      <div className={styles.anonymous}>Anonymous visitor — no identity signals captured yet</div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className={styles.drawerSection}>
                    <div className={styles.drawerSectionLabel}>Activity</div>
                    <div className={styles.visitorStats}>
                      <div><strong>{visitorDetail.visitor?.eventCount || 0}</strong> events</div>
                      <div><strong>{visitorDetail.visitor?.pageCount || 0}</strong> page views</div>
                      <div>First seen: {visitorDetail.visitor?.firstSeen ? new Date(visitorDetail.visitor.firstSeen).toLocaleDateString() : '—'}</div>
                      <div>Last seen: {visitorDetail.visitor?.lastSeen ? new Date(visitorDetail.visitor.lastSeen).toLocaleString() : '—'}</div>
                    </div>
                  </div>

                  {/* Recent events timeline */}
                  <div className={styles.drawerSection}>
                    <div className={styles.drawerSectionLabel}>Recent Events</div>
                    <div className={styles.eventTimeline}>
                      {(visitorDetail.events || []).slice(0, 20).map((evt: any) => (
                        <div key={evt.id} className={styles.timelineEvent}>
                          <span className={`${styles.eventBadge} ${styles[`evt_${evt.eventType}`]}`}>{evt.eventType}</span>
                          <span className={styles.timelinePath}>{evt.pagePath || '—'}</span>
                          <span className={styles.timelineTime}>{new Date(evt.createdAt).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
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
