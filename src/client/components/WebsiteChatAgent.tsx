import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useToast } from './Toast';
import outreach from '../pages/DragonDeskOutreach.module.css';
import styles from './WebsiteChatAgent.module.css';

// DragonDesk: Outreach — inbound website chat agent settings and conversations.

type FieldKey = 'firstName' | 'lastName' | 'fullName' | 'email' | 'phone' | 'program' | 'message';

interface AgentConfig {
  enabled: boolean;
  agentName: string;
  businessName: string;
  greeting: string;
  trialOffer: string;
  businessInfo: string;
  aiInstructions: string;
  accentColor: string;
  submitNativeForm: boolean;
  formPageUrl: string;
  formSelector: string;
  fieldMap: Partial<Record<FieldKey, string>>;
}

interface ChatRow {
  id: string;
  pageUrl: string | null;
  userTurns: number;
  status: 'open' | 'lead_captured';
  memberId: number | null;
  leadData: { firstName?: string; lastName?: string; email?: string } | null;
  nativeStatus: 'pending' | 'submitted' | 'failed' | null;
  nativeDetail: string | null;
  createdAt: string;
  updatedAt: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  firstMessage: string | null;
}

interface Transcript extends ChatRow {
  turns: { role: 'visitor' | 'agent' | 'event'; text: string }[];
}

const FIELD_LABELS: { key: FieldKey; label: string }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'fullName', label: 'Full name (single field)' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'program', label: 'Program / interest' },
  { key: 'message', label: 'Message / notes' },
];

const NATIVE_LABEL: Record<string, string> = {
  pending: 'Form pending',
  submitted: 'Form submitted',
  failed: 'Form failed',
};

const formatDate = (s: string) =>
  new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const pathOf = (url: string | null) => {
  if (!url) return '';
  try { return new URL(url).pathname; } catch { return url; }
};

const WebsiteChatAgent = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [stats, setStats] = useState({ chats: 0, signups: 0, nativeSubmitted: 0, nativeFailed: 0 });
  const [filter, setFilter] = useState<'all' | 'lead_captured'>('all');
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Creates the site's tracking token if it doesn't exist yet.
        await api.get('/tracking/config').catch(() => null);
        const data = await api.get('/inbound-agent/settings');
        setConfig(data.config);
        setTrackingToken(data.trackingToken);
        setAiConfigured(data.aiConfigured);
        if (Object.values(data.config.fieldMap || {}).some(Boolean) || data.config.formSelector) setShowAdvanced(true);
      } catch (error: any) {
        toast(error.message || 'Failed to load chat agent settings', 'error');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    loadChats();
  }, [filter]);

  const loadChats = async () => {
    try {
      const data = await api.get(`/inbound-agent/chats?limit=100${filter === 'lead_captured' ? '&status=lead_captured' : ''}`);
      setChats(data.chats);
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to load chats:', error);
    }
  };

  const update = <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) =>
    setConfig(c => (c ? { ...c, [key]: value } : c));

  const save = async (next?: AgentConfig) => {
    const body = next || config;
    if (!body) return;
    setIsSaving(true);
    try {
      const data = await api.put('/inbound-agent/settings', body);
      setConfig(data.config);
      toast(data.config.enabled ? 'Saved. The chat agent is live on your site.' : 'Saved.', 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to save settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleEnabled = () => {
    if (!config) return;
    const next = { ...config, enabled: !config.enabled };
    setConfig(next);
    save(next);
  };

  const openTranscript = async (id: string) => {
    try {
      setTranscript(await api.get(`/inbound-agent/chats/${id}`));
    } catch (error: any) {
      toast(error.message || 'Failed to load conversation', 'error');
    }
  };

  const snippet = trackingToken
    ? `<script async src="${window.location.origin}/api/tracking/script.js?token=${trackingToken}"></script>`
    : '';

  if (isLoading || !config) return <div className={outreach.loading}>Loading chat agent...</div>;

  return (
    <>
      <div className={outreach.pageHeader}>
        <div>
          <h2 className={outreach.pageTitle}>Website Chat Agent</h2>
          <p className={outreach.pageSubtitle}>
            An AI sales rep that chats with visitors on your website and signs them up for your trial offer
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.status} ${config.enabled ? styles.live : ''}`}>
            <span className={styles.dot} />
            {config.enabled ? 'Live' : 'Off'}
          </span>
          <button onClick={toggleEnabled} className={config.enabled ? outreach.cancelBtn : outreach.primaryBtn} disabled={isSaving}>
            {config.enabled ? 'Turn Off' : 'Go Live'}
          </button>
        </div>
      </div>

      {!aiConfigured && (
        <div className={styles.warning}>
          ANTHROPIC_API_KEY is not set on the server, so the agent cannot reply yet. Add it to the server environment before going live.
        </div>
      )}

      <div className={styles.stats}>
        <div className={styles.stat}><span className={styles.statValue}>{stats.chats}</span><span className={styles.statLabel}>Chats (30 days)</span></div>
        <div className={styles.stat}><span className={styles.statValue}>{stats.signups}</span><span className={styles.statLabel}>Trial signups</span></div>
        <div className={styles.stat}><span className={styles.statValue}>{stats.chats ? Math.round((stats.signups / stats.chats) * 100) : 0}%</span><span className={styles.statLabel}>Chat to signup</span></div>
        <div className={styles.stat}><span className={styles.statValue}>{stats.nativeSubmitted}</span><span className={styles.statLabel}>Site forms submitted</span></div>
        <div className={styles.stat}><span className={`${styles.statValue} ${stats.nativeFailed ? styles.bad : ''}`}>{stats.nativeFailed}</span><span className={styles.statLabel}>Site forms failed</span></div>
      </div>

      <div className={outreach.info}>
        <p className={styles.infoText}>
          The agent runs through your DragonDesk tracking snippet. If it is already in your website's <code>&lt;head&gt;</code>, there is nothing else to
          install. Changes reach your site within about 5 minutes.
        </p>
        {snippet && (
          <div className={styles.snippet}>
            <code>{snippet}</code>
            <button
              type="button"
              className={outreach.editBtn}
              onClick={() => { navigator.clipboard.writeText(snippet); toast('Snippet copied', 'success'); }}
            >
              Copy
            </button>
          </div>
        )}
      </div>

      <form
        className={styles.settings}
        onSubmit={(e) => { e.preventDefault(); save(); }}
      >
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Agent</h3>
          <div className={styles.row}>
            <div className={outreach.formGroup}>
              <label>Agent name</label>
              <input className={outreach.input} value={config.agentName} maxLength={80}
                onChange={(e) => update('agentName', e.target.value)} placeholder="e.g., Dragon Gym Assistant" />
            </div>
            <div className={outreach.formGroup}>
              <label>Business name</label>
              <input className={outreach.input} value={config.businessName} maxLength={120}
                onChange={(e) => update('businessName', e.target.value)} placeholder="e.g., Dragon Gym" />
            </div>
          </div>
          <div className={styles.row}>
            <div className={outreach.formGroup}>
              <label>Greeting</label>
              <input className={outreach.input} value={config.greeting} maxLength={500}
                onChange={(e) => update('greeting', e.target.value)} />
              <span className={styles.hint}>Shown when the chat opens, and as a small prompt next to the chat button.</span>
            </div>
            <div className={`${outreach.formGroup} ${styles.colorGroup}`}>
              <label>Color</label>
              <div className={styles.colorRow}>
                <input type="color" value={config.accentColor} onChange={(e) => update('accentColor', e.target.value)} className={styles.colorInput} />
                <input className={outreach.input} value={config.accentColor} maxLength={9}
                  onChange={(e) => update('accentColor', e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>What the agent knows</h3>
          <div className={outreach.formGroup}>
            <label>Trial offer</label>
            <textarea className={outreach.textarea} rows={3} value={config.trialOffer} maxLength={2000}
              onChange={(e) => update('trialOffer', e.target.value)}
              placeholder="e.g., One free week of unlimited classes for new adults, including a free uniform. Kids get two free classes." />
          </div>
          <div className={outreach.formGroup}>
            <label>About the business</label>
            <textarea className={outreach.textarea} rows={8} value={config.businessInfo} maxLength={8000}
              onChange={(e) => update('businessInfo', e.target.value)}
              placeholder={'Location, hours, class schedule, programs, pricing you are happy to share, parking, what to bring, FAQs...\n\nThe agent only answers from what you write here. Anything else, it says the team will follow up.'} />
          </div>
          <div className={outreach.formGroup}>
            <label>Extra instructions</label>
            <textarea className={outreach.textarea} rows={4} value={config.aiInstructions} maxLength={4000}
              onChange={(e) => update('aiInstructions', e.target.value)}
              placeholder="e.g., Mention that beginners are welcome in every class. If someone asks about competition team, say coach Mike will reach out." />
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Your website's signup form</h3>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={config.submitNativeForm}
              onChange={(e) => update('submitNativeForm', e.target.checked)} />
            Also submit my website's own signup form for each new trial signup
          </label>
          <p className={styles.hint}>
            Every signup is added to DragonDesk as a lead. With this on, the agent also fills in and submits the form on your site in the
            background, so the signup reaches everything that form already feeds (email notifications, other software). Each conversation
            shows whether the form went through.
          </p>
          {config.submitNativeForm && (
            <>
              <div className={outreach.formGroup}>
                <label>Form page URL</label>
                <input className={outreach.input} value={config.formPageUrl} maxLength={1000}
                  onChange={(e) => update('formPageUrl', e.target.value)} placeholder="e.g., https://yourgym.com/free-trial" />
                <span className={styles.hint}>
                  The page on your site that has the trial signup form. Leave blank to use the page the visitor is on. It has to be on the same
                  domain as the chat.
                </span>
              </div>
              <button type="button" className={styles.linkBtn} onClick={() => setShowAdvanced(v => !v)}>
                {showAdvanced ? 'Hide' : 'Show'} field matching (advanced)
              </button>
              {showAdvanced && (
                <div className={styles.advanced}>
                  <p className={styles.hint}>
                    The agent finds the form and its fields automatically. If it picks the wrong ones, pin them with CSS selectors here.
                  </p>
                  <div className={outreach.formGroup}>
                    <label>Form selector</label>
                    <input className={outreach.input} value={config.formSelector} maxLength={300}
                      onChange={(e) => update('formSelector', e.target.value)} placeholder="e.g., #trial-form" />
                  </div>
                  <div className={styles.fieldGrid}>
                    {FIELD_LABELS.map(f => (
                      <div key={f.key} className={outreach.formGroup}>
                        <label>{f.label}</label>
                        <input className={outreach.input} value={config.fieldMap[f.key] || ''} maxLength={300} placeholder="Auto-detect"
                          onChange={(e) => update('fieldMap', { ...config.fieldMap, [f.key]: e.target.value })} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <div className={styles.saveRow}>
          <button type="submit" className={outreach.saveBtn} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      <div className={styles.chatsHeader}>
        <h3 className={styles.sectionTitle}>Conversations</h3>
        <div className={styles.filters}>
          <button className={`${styles.filterBtn} ${filter === 'all' ? styles.filterActive : ''}`} onClick={() => setFilter('all')}>All</button>
          <button className={`${styles.filterBtn} ${filter === 'lead_captured' ? styles.filterActive : ''}`} onClick={() => setFilter('lead_captured')}>Signups</button>
          <button className={styles.filterBtn} onClick={loadChats}>Refresh</button>
        </div>
      </div>

      {chats.length === 0 ? (
        <div className={outreach.empty}><p>No conversations yet.</p></div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Last message</th><th>Visitor</th><th>Opened with</th><th>Page</th><th>Messages</th><th>Status</th></tr>
            </thead>
            <tbody>
              {chats.map(c => {
                const name = [c.firstName || c.leadData?.firstName, c.lastName || c.leadData?.lastName].filter(Boolean).join(' ');
                return (
                  <tr key={c.id} onClick={() => openTranscript(c.id)}>
                    <td className={styles.nowrap}>{formatDate(c.updatedAt)}</td>
                    <td>{name ? <><div>{name}</div><div className={styles.sub}>{c.email || c.leadData?.email}</div></> : <span className={styles.sub}>Anonymous</span>}</td>
                    <td className={styles.preview}>{c.firstMessage}</td>
                    <td className={styles.sub}>{pathOf(c.pageUrl)}</td>
                    <td>{c.userTurns}</td>
                    <td>
                      <div className={styles.badges}>
                        <span className={`${outreach.badge} ${c.status === 'lead_captured' ? outreach.active : outreach.draft}`}>
                          {c.status === 'lead_captured' ? 'Signed up' : 'Chatting'}
                        </span>
                        {c.nativeStatus && (
                          <span className={`${outreach.badge} ${c.nativeStatus === 'submitted' ? outreach.completed : c.nativeStatus === 'failed' ? styles.failedBadge : outreach.paused}`}>
                            {NATIVE_LABEL[c.nativeStatus]}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {transcript && (
        <div className={styles.overlay} onClick={() => setTranscript(null)}>
          <div className={styles.drawer} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Conversation">
            <div className={styles.drawerHead}>
              <div>
                <div className={styles.drawerTitle}>
                  {[transcript.firstName, transcript.lastName].filter(Boolean).join(' ') || 'Anonymous visitor'}
                </div>
                <div className={styles.sub}>{formatDate(transcript.createdAt)} on {pathOf(transcript.pageUrl) || 'website'}</div>
              </div>
              <button className={outreach.cancelBtn} onClick={() => setTranscript(null)}>Close</button>
            </div>
            {transcript.nativeStatus && (
              <div className={`${styles.nativeNote} ${transcript.nativeStatus === 'failed' ? styles.nativeFailed : ''}`}>
                <strong>{NATIVE_LABEL[transcript.nativeStatus]}</strong>
                {transcript.nativeDetail ? `: ${transcript.nativeDetail}` : ''}
              </div>
            )}
            <div className={styles.turns}>
              {transcript.turns.map((t, i) => (
                <div key={i} className={`${styles.turn} ${styles[t.role]}`}>{t.text}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WebsiteChatAgent;
