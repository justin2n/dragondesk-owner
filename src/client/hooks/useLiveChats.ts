import { useEffect, useState } from 'react';
import { api } from '../utils/api';

// Who is chatting with a website chat agent right now (active in the last
// 90 seconds), refreshed every 20 seconds. Fail-soft: errors just mean no
// "Chatting now" badges.

export interface LiveChat {
  chatId: string;
  visitorId: string | null;
  memberId: number | null;
  agentLabel: string | null;
  lastActiveAt: string;
}

export interface LiveChats {
  byMember: Map<number, LiveChat>;
  byVisitor: Map<string, LiveChat>;
  byChat: Map<string, LiveChat>;
}

const EMPTY: LiveChats = { byMember: new Map(), byVisitor: new Map(), byChat: new Map() };

export function useLiveChats(intervalMs = 20000): LiveChats {
  const [live, setLive] = useState<LiveChats>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.get('/inbound-agent/live');
        if (cancelled) return;
        const next: LiveChats = { byMember: new Map(), byVisitor: new Map(), byChat: new Map() };
        for (const c of (data.live || []) as LiveChat[]) {
          next.byChat.set(c.chatId, c);
          if (c.visitorId) next.byVisitor.set(c.visitorId, c);
          if (c.memberId != null && !next.byMember.has(c.memberId)) next.byMember.set(c.memberId, c);
        }
        setLive(next);
      } catch {
        if (!cancelled) setLive(EMPTY);
      }
    };
    load();
    const timer = setInterval(load, intervalMs);
    return () => { cancelled = true; clearInterval(timer); };
  }, [intervalMs]);

  return live;
}
