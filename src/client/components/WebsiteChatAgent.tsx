import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../utils/api';
import { useToast } from './Toast';
import outreach from '../pages/DragonDeskOutreach.module.css';
import styles from './WebsiteChatAgent.module.css';
import ChattingNowBadge from './ChattingNowBadge';
import AgentSettings from './AgentSettings';
import { AgentRow } from './agentTypes';
import { useLiveChats } from '../hooks/useLiveChats';

// DragonDesk: Outreach — website chat agents. The overview lists the agents
// and their conversations; each agent's settings open on their own screen
// (?agent=<id>), see AgentSettings.

interface ChatRow {
  id: string;
  agentId: number | null;
  agentLabel: string | null;
  pageUrl: string | null;
  userTurns: number;
  status: 'open' | 'lead_captured';
  memberId: number | null;
  leadData: { firstName?: string; lastName?: string; email?: string } | null;
  nativeStatus: 'pending' | 'submitted' | 'failed' | null;
  nativeDetail: string | null;
  bookingClickedAt: string | null;
  followUpSentAt: string | null;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [audiences, setAudiences] = useState<{ id: number; name: string }[]>([]);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [stats, setStats] = useState({ chats: 0, signups: 0, bookings: 0, followUps: 0, nativeSubmitted: 0, nativeFailed: 0 });
  const [filter, setFilter] = useState<'all' | 'booked' | 'lead_captured'>('all');
  const [agentFilter, setAgentFilter] = useState<number | 'all'>('all');
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const liveChats = useLiveChats();

  const openId = parseInt(searchParams.get('agent') || '', 10);
  const openAgent = agents.find(a => a.id === openId) || null;
  const openSettings = (id: number | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('agent', String(id)); else next.delete('agent');
    setSearchParams(next);
    window.scrollTo(0, 0);
  };

  const loadAgents = async () => {
    const data = await api.get('/inbound-agent/agents');
    setAgents(data.agents);
    setTrackingToken(data.trackingToken);
    setAiConfigured(data.aiConfigured);
    setAudiences(data.audiences || []);
  };

  useEffect(() => {
    (async () => {
      try {
        // Creates the site's tracking token if it doesn't exist yet.
        await api.get('/tracking/config').catch(() => null);
        await loadAgents();
      } catch (error: any) {
        toast(error.message || 'Failed to load chat agents', 'error');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!openAgent) loadChats();
  }, [filter, agentFilter, openAgent?.id]);

  const loadChats = async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filter !== 'all') params.set('status', filter);
      if (agentFilter !== 'all') params.set('agentId', String(agentFilter));
      const data = await api.get(`/inbound-agent/chats?${params}`);
      setChats(data.chats);
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to load chats:', error);
    }
  };

  const toggleLive = async (a: AgentRow) => {
    setBusyId(a.id);
    try {
      const data = await api.put(`/inbound-agent/agents/${a.id}`, { enabled: !a.enabled });
      await loadAgents();
      toast(data.agent.enabled ? `"${a.name}" is live.` : `"${a.name}" is off.`, 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to update agent', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const addAgent = async () => {
    try {
      const first = agents[0];
      const data = await api.post('/inbound-agent/agents', {
        name: 'New website',
        // Start from an existing agent's look so a second site isn't built from scratch.
        accentColor: first?.accentColor,
        agentName: first?.agentName,
      });
      await loadAgents();
      openSettings(data.agent.id);
      toast('Agent added. Set its website and what it should know, then go live.', 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to add agent', 'error');
    }
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

  if (isLoading) return <div className={outreach.loading}>Loading chat agents...</div>;

  if (openAgent) {
    return (
      <AgentSettings
        key={openAgent.id}
        agent={openAgent}
        audiences={audiences}
        canDelete={agents.length > 1}
        onBack={() => openSettings(null)}
        onChanged={loadAgents}
      />
    );
  }

  return (
    <>
      <div className={outreach.pageHeader}>
        <div>
          <h2 className={outreach.pageTitle}>Website Chat Agents</h2>
          <p className={outreach.pageSubtitle}>
            AI sales reps that chat with visitors on your websites. Use one agent per website, or per audience.
          </p>
        </div>
        <button onClick={addAgent} className={outreach.primaryBtn}>+ New Agent</button>
      </div>

      {!aiConfigured && (
        <div className={styles.warning}>
          ANTHROPIC_API_KEY is not set on the server, so the agents cannot reply yet. Add it to the server environment before going live.
        </div>
      )}

      <div className={styles.agentCards}>
        {agents.map(a => (
          <div key={a.id} className={styles.agentCard}>
            <button type="button" className={styles.agentCardMain} onClick={() => openSettings(a.id)}>
              <span className={styles.agentCardTop}>
                <span className={styles.agentCardName}>{a.name}</span>
                <span className={`${styles.status} ${a.enabled ? styles.live : ''}`}><span className={styles.dot} />{a.enabled ? 'Live' : 'Off'}</span>
              </span>
              <span className={styles.agentCardSites}>{a.domains.length ? a.domains.join(', ') : 'All other websites'}</span>
              <span className={styles.agentCardSites}>
                {a.audienceName ? `Only: ${a.audienceName}` : 'Everyone'}{a.purpose === 'support' ? ' · Helps customers' : ' · Signs up visitors'}
                {a.driveFolderId ? ' · Drive folder' : ''}
              </span>
              <span className={styles.agentCardStats}>{a.stats.chats} chats, {a.stats.bookings} booking clicks (30 days)</span>
            </button>
            <div className={styles.agentCardActions}>
              <button type="button" className={outreach.editBtn} onClick={() => openSettings(a.id)}>Settings</button>
              <button type="button" className={a.enabled ? outreach.cancelBtn : outreach.primaryBtn} onClick={() => toggleLive(a)} disabled={busyId === a.id}>
                {a.enabled ? 'Turn Off' : 'Go Live'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <details className={styles.install}>
        <summary>How to add agents to your website</summary>
        <p className={styles.infoText}>
          Agents run through your DragonDesk tracking snippet. Put the same snippet in the <code>&lt;head&gt;</code> of each website; each page shows the
          agent assigned to its domain (and audience), or the agent with no websites listed if none matches. Changes reach your sites within about 5 minutes.
        </p>
        {snippet && (
          <div className={styles.snippet}>
            <code>{snippet}</code>
            <button type="button" className={outreach.editBtn}
              onClick={() => { navigator.clipboard.writeText(snippet); toast('Snippet copied', 'success'); }}>Copy</button>
          </div>
        )}
      </details>

      <div className={styles.chatsHeader}>
        <h3 className={styles.sectionTitle}>Conversations</h3>
        <div className={styles.filters}>
          {agents.length > 1 && (
            <select
              className={styles.filterSelect}
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
              aria-label="Filter by agent"
            >
              <option value="all">All agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          <button className={`${styles.filterBtn} ${filter === 'all' ? styles.filterActive : ''}`} onClick={() => setFilter('all')}>All</button>
          <button className={`${styles.filterBtn} ${filter === 'booked' ? styles.filterActive : ''}`} onClick={() => setFilter('booked')}>Clicked to book</button>
          <button className={`${styles.filterBtn} ${filter === 'lead_captured' ? styles.filterActive : ''}`} onClick={() => setFilter('lead_captured')}>Leads</button>
          <button className={styles.filterBtn} onClick={loadChats}>Refresh</button>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}><span className={styles.statValue}>{stats.chats}</span><span className={styles.statLabel}>Chats (30 days)</span></div>
        <div className={styles.stat}><span className={styles.statValue}>{stats.bookings}</span><span className={styles.statLabel}>Booking link clicks</span></div>
        <div className={styles.stat}><span className={styles.statValue}>{stats.chats ? Math.round((stats.bookings / stats.chats) * 100) : 0}%</span><span className={styles.statLabel}>Chat to booking</span></div>
        <div className={styles.stat}><span className={styles.statValue}>{stats.signups}</span><span className={styles.statLabel}>Leads captured</span></div>
        <div className={styles.stat}><span className={styles.statValue}>{stats.nativeSubmitted}</span><span className={styles.statLabel}>Site forms submitted</span></div>
        <div className={styles.stat}><span className={`${styles.statValue} ${stats.nativeFailed ? styles.bad : ''}`}>{stats.nativeFailed}</span><span className={styles.statLabel}>Site forms failed</span></div>
      </div>

      {chats.length === 0 ? (
        <div className={outreach.empty}><p>No conversations yet.</p></div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Last message</th><th>Visitor</th><th>Opened with</th>{agents.length > 1 && <th>Agent</th>}<th>Page</th><th>Messages</th><th>Status</th></tr>
            </thead>
            <tbody>
              {chats.map(c => {
                const name = [c.firstName || c.leadData?.firstName, c.lastName || c.leadData?.lastName].filter(Boolean).join(' ');
                return (
                  <tr key={c.id} onClick={() => openTranscript(c.id)}>
                    <td className={styles.nowrap}>{formatDate(c.updatedAt)}</td>
                    <td>{name ? <><div>{name}</div><div className={styles.sub}>{c.email || c.leadData?.email}</div></> : <span className={styles.sub}>Anonymous</span>}</td>
                    <td className={styles.preview}>{c.firstMessage}</td>
                    {agents.length > 1 && <td className={styles.sub}>{c.agentLabel || 'Deleted agent'}</td>}
                    <td className={styles.sub}>{pathOf(c.pageUrl)}</td>
                    <td>{c.userTurns}</td>
                    <td>
                      <div className={styles.badges}>
                        {liveChats.byChat.has(c.id) && <ChattingNowBadge agentLabel={c.agentLabel} />}
                        {c.bookingClickedAt ? (
                          <span className={`${outreach.badge} ${outreach.active}`}>Clicked to book</span>
                        ) : (
                          <span className={`${outreach.badge} ${c.status === 'lead_captured' ? outreach.completed : outreach.draft}`}>
                            {c.status === 'lead_captured' ? 'Lead' : 'Chatting'}
                          </span>
                        )}
                        {c.followUpSentAt && <span className={`${outreach.badge} ${outreach.paused}`}>Followed up</span>}
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
