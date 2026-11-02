import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import { useToast } from './Toast';
import outreach from '../pages/DragonDeskOutreach.module.css';
import styles from './WebsiteChatAgent.module.css';
import { AgentConfig, AgentRow, FieldKey } from './agentTypes';

// Settings for one website chat agent, in tabs. Edits are kept as a draft
// until "Save changes"; going live / off saves straight away.

type Tab = 'general' | 'knowledge' | 'chat' | 'booking' | 'form';

const FIELD_LABELS: { key: FieldKey; label: string }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'fullName', label: 'Full name (single field)' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Business / studio name' },
  { key: 'program', label: 'Program / interest' },
  { key: 'location', label: 'Location' },
  { key: 'message', label: 'Message / notes' },
];

interface KnowledgeFile {
  name: string; path: string; mimeType: string; chars: number;
  status: 'ok' | 'skipped' | 'error'; detail: string | null; used?: boolean;
}
interface Knowledge {
  folderUrl: string; folderId: string | null; syncedAt: string | null; error: string | null;
  syncing: boolean; files: KnowledgeFile[]; usedChars: number; limitChars: number;
}

const KIND: Record<string, string> = {
  'application/vnd.google-apps.document': 'Google Doc',
  'application/vnd.google-apps.spreadsheet': 'Google Sheet',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'application/pdf': 'PDF',
};
const kindOf = (m: string) => KIND[m] || (m.startsWith('text/') ? 'Text' : m.split('/').pop() || 'File');

interface Props {
  agent: AgentRow;
  audiences: { id: number; name: string }[];
  canDelete: boolean;
  onBack: () => void;
  onChanged: (agentId?: number) => Promise<void>;
}

const AgentSettings = ({ agent, audiences, canDelete, onBack, onChanged }: Props) => {
  const { toast, confirm } = useToast();
  const [tab, setTab] = useState<Tab>('general');
  const [draft, setDraft] = useState<AgentConfig>(() => ({ ...agent, fieldMap: { ...agent.fieldMap } }));
  const [domainsText, setDomainsText] = useState(agent.domains.join('\n'));
  const [showAdvanced, setShowAdvanced] = useState(Object.values(agent.fieldMap || {}).some(Boolean) || !!agent.formSelector);
  const [isSaving, setIsSaving] = useState(false);
  const [drive, setDrive] = useState<{ configured: boolean; email: string | null } | null>(null);
  const [knowledge, setKnowledge] = useState<Knowledge | null>(null);

  // A fresh copy whenever the saved agent changes (after a save or reload).
  useEffect(() => {
    setDraft({ ...agent, fieldMap: { ...agent.fieldMap } });
    setDomainsText(agent.domains.join('\n'));
  }, [agent]);

  // Only what the form edits counts as a change (not live status, stats, or
  // what the server reads from the website form and Drive folder).
  const editable = (c: AgentConfig, domains: string) => {
    const { enabled, formFields, formFieldsAt, driveFolderId, knowledgeSyncedAt, knowledgeError, ...rest } = c as any;
    delete rest.stats; delete rest.audienceName; delete rest.domains; delete rest.updatedAt;
    return JSON.stringify({ ...rest, domains: domains.split(/\s+/).filter(Boolean).join('\n') });
  };
  const savedState = useMemo(() => editable(agent, agent.domains.join('\n')), [agent]);
  const dirty = editable(draft, domainsText) !== savedState;

  const update = <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => setDraft(d => ({ ...d, [key]: value }));

  const loadKnowledge = async () => {
    try { setKnowledge(await api.get(`/inbound-agent/agents/${agent.id}/knowledge`)); } catch { /* shown as empty */ }
  };
  useEffect(() => {
    api.get('/inbound-agent/drive').then(setDrive).catch(() => setDrive({ configured: false, email: null }));
    loadKnowledge();
  }, [agent.id, agent.driveFolderId, agent.knowledgeSyncedAt]);
  // Poll while a sync runs.
  useEffect(() => {
    if (!knowledge?.syncing) return;
    const t = setInterval(async () => {
      const k: Knowledge = await api.get(`/inbound-agent/agents/${agent.id}/knowledge`).catch(() => null);
      if (k) { setKnowledge(k); if (!k.syncing) { clearInterval(t); onChanged(agent.id); } }
    }, 3000);
    return () => clearInterval(t);
  }, [knowledge?.syncing]);

  const save = async (patch?: Partial<AgentConfig>) => {
    setIsSaving(true);
    try {
      const body = patch || { ...draft, domains: domainsText };
      const data = await api.put(`/inbound-agent/agents/${agent.id}`, body);
      await onChanged(agent.id);
      if (patch && 'enabled' in patch) toast(data.agent.enabled ? `"${data.agent.name}" is live.` : `"${data.agent.name}" is off.`, 'success');
      else toast('Changes saved.', 'success');
      if (!patch && body.driveFolderUrl !== agent.driveFolderUrl) setTimeout(loadKnowledge, 800);
    } catch (error: any) {
      toast(error.message || 'Failed to save', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const discard = () => {
    setDraft({ ...agent, fieldMap: { ...agent.fieldMap } });
    setDomainsText(agent.domains.join('\n'));
  };

  const remove = async () => {
    if (!await confirm({ title: 'Delete Agent', message: `Delete "${agent.name}"? Its past conversations are kept.`, confirmLabel: 'Delete', danger: true })) return;
    try {
      await api.delete(`/inbound-agent/agents/${agent.id}`);
      await onChanged();
      onBack();
    } catch (error: any) {
      toast(error.message || 'Failed to delete agent', 'error');
    }
  };

  const rereadForm = async () => {
    try {
      await api.put(`/inbound-agent/agents/${agent.id}`, { rescanForm: true });
      await onChanged(agent.id);
      toast('The form will be read again at the start of the next chat.', 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to reset the form check', 'error');
    }
  };

  const syncNow = async () => {
    try {
      await api.post(`/inbound-agent/agents/${agent.id}/knowledge/sync`);
      setKnowledge(k => (k ? { ...k, syncing: true, error: null } : k));
    } catch (error: any) {
      toast(error.message || 'Failed to start the sync', 'error');
    }
  };

  const tabs: { id: Tab; label: string; hidden?: boolean }[] = [
    { id: 'general', label: 'General' },
    { id: 'knowledge', label: 'Knowledge' },
    { id: 'chat', label: 'Chat window' },
    { id: 'booking', label: draft.purpose === 'support' ? 'Scheduling & follow-up' : 'Booking & follow-up' },
    { id: 'form', label: 'Website form', hidden: draft.purpose !== 'signup' },
  ];

  return (
    <div className={styles.settingsPage}>
      <button type="button" className={styles.backLink} onClick={() => { if (!dirty || window.confirm('Leave without saving your changes?')) onBack(); }}>
        &larr; All chat agents
      </button>

      <div className={styles.settingsHeader}>
        <div>
          <h2 className={outreach.pageTitle}>{agent.name}</h2>
          <p className={outreach.pageSubtitle}>
            {agent.domains.length ? agent.domains.join(', ') : 'All other websites'}
            {' · '}{agent.audienceName ? `Only: ${agent.audienceName}` : 'Everyone'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.status} ${agent.enabled ? styles.live : ''}`}><span className={styles.dot} />{agent.enabled ? 'Live' : 'Off'}</span>
          <button onClick={() => save({ enabled: !agent.enabled })} className={agent.enabled ? outreach.cancelBtn : outreach.primaryBtn} disabled={isSaving}>
            {agent.enabled ? 'Turn Off' : 'Go Live'}
          </button>
          {canDelete && <button onClick={remove} className={outreach.deleteBtn} disabled={isSaving}>Delete</button>}
        </div>
      </div>

      <div className={styles.settingsLayout}>
        <nav className={styles.tabNav} aria-label="Agent settings">
          {tabs.filter(t => !t.hidden).map(t => (
            <button key={t.id} type="button" className={`${styles.tabBtn} ${tab === t.id ? styles.tabBtnActive : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        <form className={styles.settings} onSubmit={(e) => { e.preventDefault(); save(); }}>
          {tab === 'general' && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>General</h3>
              <div className={styles.row}>
                <div className={outreach.formGroup}>
                  <label>Label</label>
                  <input className={outreach.input} value={draft.name} maxLength={80}
                    onChange={(e) => update('name', e.target.value)} placeholder="e.g., Dragon Gym website" />
                  <span className={styles.hint}>Only shown here, to tell your agents apart.</span>
                </div>
                <div className={outreach.formGroup}>
                  <label>Websites</label>
                  <textarea className={outreach.textarea} rows={2} value={domainsText} style={{ minHeight: 0 }}
                    onChange={(e) => setDomainsText(e.target.value)} placeholder="dragongym.com" />
                  <span className={styles.hint}>
                    One domain per line. Covers www and other subdomains. Leave empty to use this agent on any website no other agent claims.
                  </span>
                </div>
              </div>
              <div className={styles.row}>
                <div className={outreach.formGroup}>
                  <label>Audience</label>
                  <select className={outreach.input} value={draft.audienceId ?? ''}
                    onChange={(e) => update('audienceId', e.target.value ? parseInt(e.target.value, 10) : null)}>
                    <option value="">Everyone</option>
                    {audiences.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <span className={styles.hint}>
                    Show this agent only to visitors in an audience, such as current customers. Everyone else on these websites sees the agent set
                    to Everyone. Visitors count as contacts once they've filled in a form or signed up in the chat on that browser.
                  </span>
                </div>
                <div className={outreach.formGroup}>
                  <label>Purpose</label>
                  <div className={styles.radioGroup}>
                    <label className={styles.radio}>
                      <input type="radio" name="purpose" checked={draft.purpose === 'signup'} onChange={() => update('purpose', 'signup')} />
                      <span>Sign up new visitors for your offer</span>
                    </label>
                    <label className={styles.radio}>
                      <input type="radio" name="purpose" checked={draft.purpose === 'support'} onChange={() => update('purpose', 'support')} />
                      <span>Help existing customers with questions and scheduling</span>
                    </label>
                  </div>
                </div>
              </div>
            </section>
          )}

          {tab === 'knowledge' && (
            <>
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>What the agent knows</h3>
                <p className={styles.hint}>The agent only answers from what's here and in your Google Drive folder. Anything else, it says the team will follow up.</p>
                <div className={outreach.formGroup}>
                  <label>Business name</label>
                  <input className={outreach.input} value={draft.businessName} maxLength={120}
                    onChange={(e) => update('businessName', e.target.value)} placeholder="e.g., Dragon Gym" />
                </div>
                {draft.purpose === 'signup' && (
                  <div className={outreach.formGroup}>
                    <label>Trial offer</label>
                    <textarea className={outreach.textarea} rows={3} value={draft.trialOffer} maxLength={2000}
                      onChange={(e) => update('trialOffer', e.target.value)}
                      placeholder="e.g., One free week of unlimited classes for new adults, including a free uniform. Kids get two free classes." />
                  </div>
                )}
                <div className={outreach.formGroup}>
                  <label>About the business</label>
                  <textarea className={outreach.textarea} rows={8} value={draft.businessInfo} maxLength={8000}
                    onChange={(e) => update('businessInfo', e.target.value)}
                    placeholder="Location, hours, class schedule, programs, pricing you are happy to share, parking, what to bring, FAQs..." />
                </div>
                <div className={outreach.formGroup}>
                  <label>Extra instructions</label>
                  <textarea className={outreach.textarea} rows={4} value={draft.aiInstructions} maxLength={4000}
                    onChange={(e) => update('aiInstructions', e.target.value)}
                    placeholder="e.g., Mention that beginners are welcome in every class. If someone asks about competition team, say coach Mike will reach out." />
                </div>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Google Drive folder</h3>
                <p className={styles.hint}>
                  Keep your schedules, pricing, FAQs, and policies in a Drive folder and the agent reads them too. Changes are picked up within the
                  hour. Only put customer-facing material here: anything in the folder can end up in the agent's answers.
                </p>
                {drive && !drive.configured ? (
                  <div className={styles.warning}>
                    Google Drive isn't set up on this server yet. A DragonDesk admin needs to add the GOOGLE_SERVICE_ACCOUNT_JSON setting
                    (a Google service account key with the Drive API enabled). Then share folders with that account's email.
                  </div>
                ) : (
                  <>
                    {drive?.email && (
                      <div className={styles.shareBox}>
                        <span>1. In Google Drive, share your folder with this address as a <strong>Viewer</strong>:</span>
                        <div className={styles.snippet}>
                          <code>{drive.email}</code>
                          <button type="button" className={outreach.editBtn}
                            onClick={() => { navigator.clipboard.writeText(drive.email!); toast('Email copied', 'success'); }}>Copy</button>
                        </div>
                        <span>2. Paste the folder's link below and save.</span>
                      </div>
                    )}
                    <div className={outreach.formGroup}>
                      <label>Folder link</label>
                      <input className={outreach.input} value={draft.driveFolderUrl} maxLength={1000}
                        onChange={(e) => update('driveFolderUrl', e.target.value)}
                        placeholder="https://drive.google.com/drive/folders/..." />
                    </div>
                    {knowledge?.folderId && (
                      <div className={styles.knowledge}>
                        <div className={styles.knowledgeHead}>
                          <span className={styles.hint}>
                            {knowledge.syncing ? 'Reading your folder...'
                              : knowledge.syncedAt ? `Last synced ${new Date(knowledge.syncedAt).toLocaleString()}` : 'Not synced yet.'}
                          </span>
                          <button type="button" className={outreach.editBtn} onClick={syncNow} disabled={knowledge.syncing}>
                            {knowledge.syncing ? 'Syncing...' : 'Sync now'}
                          </button>
                        </div>
                        {knowledge.error && <div className={styles.warning}>{knowledge.error}</div>}
                        {knowledge.files.length > 0 && (
                          <>
                            <div className={styles.usage}>
                              <div className={styles.usageBar}><span style={{ width: `${Math.min(100, Math.round((knowledge.usedChars / knowledge.limitChars) * 100))}%` }} /></div>
                              <span className={styles.hint}>{Math.round((knowledge.usedChars / knowledge.limitChars) * 100)}% of what the agent can read</span>
                            </div>
                            <ul className={styles.fileList}>
                              {knowledge.files.map((f, i) => (
                                <li key={i}>
                                  <span className={styles.fileName}>{f.path}{f.name}</span>
                                  <span className={styles.sub}>{kindOf(f.mimeType)}</span>
                                  <span className={
                                    f.status === 'ok' && f.used ? styles.fileOk : f.status === 'error' ? styles.fileBad : styles.fileSkip
                                  } title={f.detail || ''}>
                                    {f.status === 'ok' ? (f.used ? 'Read' : 'Left out (over the limit)') : f.status === 'error' ? 'Error' : 'Skipped'}
                                  </span>
                                  {f.detail && <span className={styles.fileDetail}>{f.detail}</span>}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        {!knowledge.syncing && knowledge.syncedAt && knowledge.files.length === 0 && (
                          <p className={styles.hint}>The folder is empty.</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          )}

          {tab === 'chat' && (
            <>
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Chat window</h3>
                <div className={styles.row}>
                  <div className={outreach.formGroup}>
                    <label>Agent name</label>
                    <input className={outreach.input} value={draft.agentName} maxLength={80}
                      onChange={(e) => update('agentName', e.target.value)} placeholder="e.g., Dragon Gym Assistant" />
                    <span className={styles.hint}>Shown at the top of the chat window.</span>
                  </div>
                  <div className={`${outreach.formGroup} ${styles.colorGroup}`}>
                    <label>Color</label>
                    <div className={styles.colorRow}>
                      <input type="color" value={draft.accentColor} onChange={(e) => update('accentColor', e.target.value)} className={styles.colorInput} />
                      <input className={outreach.input} value={draft.accentColor} maxLength={9}
                        onChange={(e) => update('accentColor', e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className={outreach.formGroup}>
                  <label>Greeting</label>
                  <input className={outreach.input} value={draft.greeting} maxLength={500}
                    onChange={(e) => update('greeting', e.target.value)} />
                  <span className={styles.hint}>Shown when the chat opens, and as a small prompt next to the chat button.</span>
                </div>
              </section>
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>When the chat opens</h3>
                <div className={styles.radioGroup}>
                  <label className={styles.radio}>
                    <input type="radio" name="autoOpen" checked={draft.autoOpen === 'off'} onChange={() => update('autoOpen', 'off')} />
                    <span>Only when the visitor clicks the chat button <span className={styles.hint}>(the greeting pops up next to the button after 8 seconds)</span></span>
                  </label>
                  <label className={styles.radio}>
                    <input type="radio" name="autoOpen" checked={draft.autoOpen === 'time'} onChange={() => update('autoOpen', 'time')} />
                    <span>Open automatically after</span>
                    <input type="number" className={`${outreach.input} ${styles.smallNumber}`} min={1} max={600}
                      value={draft.autoOpenDelay} disabled={draft.autoOpen !== 'time'}
                      onChange={(e) => update('autoOpenDelay', parseInt(e.target.value, 10) || 1)} />
                    <span>seconds on a page</span>
                  </label>
                  <label className={styles.radio}>
                    <input type="radio" name="autoOpen" checked={draft.autoOpen === 'scroll'} onChange={() => update('autoOpen', 'scroll')} />
                    <span>Open automatically after the visitor scrolls</span>
                    <input type="number" className={`${outreach.input} ${styles.smallNumber}`} min={5} max={100}
                      value={draft.autoOpenScroll} disabled={draft.autoOpen !== 'scroll'}
                      onChange={(e) => update('autoOpenScroll', parseInt(e.target.value, 10) || 5)} />
                    <span>% of the page</span>
                  </label>
                </div>
                <p className={styles.hint}>
                  Opens at most once per visit, and never again once the visitor closes it. On phones, where the chat fills the screen, it shows the
                  greeting next to the button instead of opening.
                </p>
              </section>
            </>
          )}

          {tab === 'booking' && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{draft.purpose === 'support' ? 'Scheduling & follow-up' : 'Booking & follow-up'}</h3>
              <div className={styles.row}>
                <div className={outreach.formGroup}>
                  <label>{draft.purpose === 'support' ? 'Scheduling link' : 'Booking link'}</label>
                  <input className={outreach.input} value={draft.bookingUrl} maxLength={1000}
                    onChange={(e) => update('bookingUrl', e.target.value)} placeholder="e.g., https://cp.mystudio.io/t/..." />
                  <span className={styles.hint}>
                    {draft.purpose === 'support'
                      ? "Where customers book or change classes. The agent shares it as a button whenever they want to schedule, and clicks on it are this agent's main result. It can be on any website."
                      : "Where visitors pick their first class. The agent shares it as a button right after signup, and clicks on it are this agent's main result. It can be on any website."}
                  </span>
                </div>
                <div className={outreach.formGroup}>
                  <label>Button label</label>
                  <input className={outreach.input} value={draft.bookingLabel} maxLength={40}
                    onChange={(e) => update('bookingLabel', e.target.value)} placeholder={draft.purpose === 'support' ? 'Book a class' : 'Pick your first class'} />
                </div>
              </div>
              <label className={styles.checkbox}>
                <input type="checkbox" checked={draft.followUpEnabled} onChange={(e) => update('followUpEnabled', e.target.checked)} />
                Follow up after they click the link
              </label>
              {draft.followUpEnabled && (
                <div className={styles.row}>
                  <div className={outreach.formGroup}>
                    <label>Follow-up message</label>
                    <input className={outreach.input} value={draft.followUpMessage} maxLength={500}
                      onChange={(e) => update('followUpMessage', e.target.value)} />
                  </div>
                  <div className={outreach.formGroup}>
                    <label>Send it after</label>
                    <div className={styles.radio}>
                      <input type="number" className={`${outreach.input} ${styles.smallNumber}`} min={1} max={120}
                        value={draft.followUpMinutes} onChange={(e) => update('followUpMinutes', parseInt(e.target.value, 10) || 1)} />
                      <span>minutes</span>
                    </div>
                  </div>
                </div>
              )}
              <p className={styles.hint}>
                The follow-up appears in the chat once the visitor is back on your site, and the agent reads their answer with that context, so it can
                help anyone who got stuck.
              </p>
            </section>
          )}

          {tab === 'form' && draft.purpose === 'signup' && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Website form</h3>
              <label className={styles.checkbox}>
                <input type="checkbox" checked={draft.submitNativeForm} onChange={(e) => update('submitNativeForm', e.target.checked)} />
                Also submit my website's own signup form for each new signup
              </label>
              <p className={styles.hint}>
                Every signup is added to DragonDesk as a lead. With this on, the agent also fills in and submits the form on your site in the
                background, so the signup reaches everything that form already feeds. Each conversation shows whether the form went through.
              </p>
              <label className={styles.checkbox}>
                <input type="checkbox" checked={draft.requirePhone} onChange={(e) => update('requirePhone', e.target.checked)} />
                Always require a phone number
              </label>
              {draft.submitNativeForm && (
                <>
                  <div className={styles.advanced}>
                    <strong>What your form asks for</strong>
                    {draft.formFields ? (
                      <>
                        <p className={styles.hint}>
                          Besides name and email, your form requires:{' '}
                          {[
                            ...draft.formFields.required.map(k => {
                              const label = { lastName: 'last name', phone: 'phone', company: 'business name', program: 'program', location: 'location' }[k];
                              const opts = (k === 'program' || k === 'location') ? draft.formFields!.options[k] : undefined;
                              return opts?.length ? `${label} (${opts.length} choices)` : label;
                            }),
                            ...draft.formFields.extras.map(e => e.kind === 'checkbox' ? `"${e.label}" checkbox` : `"${e.label}"`),
                          ].join(', ') || 'nothing else'}. The agent collects all of it before signing someone up.
                        </p>
                        <span className={styles.hint}>
                          Read from your form {draft.formFieldsAt ? new Date(draft.formFieldsAt).toLocaleString() : ''}. It's re-read daily.
                        </span>
                      </>
                    ) : (
                      <p className={styles.hint}>Not read yet. The widget reads your form at the start of the next chat, so the agent knows every required field.</p>
                    )}
                    <button type="button" className={styles.linkBtn} onClick={rereadForm}>Read the form again</button>
                  </div>
                  <div className={outreach.formGroup}>
                    <label>Form page URL</label>
                    <input className={outreach.input} value={draft.formPageUrl} maxLength={1000}
                      onChange={(e) => update('formPageUrl', e.target.value)} placeholder="e.g., https://yourgym.com/free-trial" />
                    <span className={styles.hint}>
                      A page on this agent's website that has your signup or contact form. Leave blank to use the page the visitor is on. A page on
                      another website (like a booking system) goes in the Booking link instead.
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
                        <input className={outreach.input} value={draft.formSelector} maxLength={300}
                          onChange={(e) => update('formSelector', e.target.value)} placeholder="e.g., #trial-form" />
                      </div>
                      <div className={styles.fieldGrid}>
                        {FIELD_LABELS.map(f => (
                          <div key={f.key} className={outreach.formGroup}>
                            <label>{f.label}</label>
                            <input className={outreach.input} value={draft.fieldMap[f.key] || ''} maxLength={300} placeholder="Auto-detect"
                              onChange={(e) => update('fieldMap', { ...draft.fieldMap, [f.key]: e.target.value })} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          <div className={`${styles.saveBar} ${dirty ? styles.saveBarDirty : ''}`}>
            <span className={styles.hint}>{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
            <div className={styles.headerActions}>
              {dirty && <button type="button" className={outreach.cancelBtn} onClick={discard} disabled={isSaving}>Discard</button>}
              <button type="submit" className={outreach.saveBtn} disabled={!dirty || isSaving}>
                {isSaving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AgentSettings;
