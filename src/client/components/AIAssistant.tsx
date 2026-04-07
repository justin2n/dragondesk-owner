import React, { useState, useRef, useEffect } from 'react';
import styles from './AIAssistant.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: string[];
}

const TOOL_LABELS: Record<string, string> = {
  search_members: 'Searching members',
  get_member: 'Looking up member',
  create_member: 'Creating member',
  update_member: 'Updating member',
  list_events: 'Fetching events',
  create_event: 'Creating event',
  update_event: 'Updating event',
  delete_event: 'Deleting event',
  list_campaigns: 'Loading campaigns',
  list_audiences: 'Loading audiences',
  get_analytics_summary: 'Fetching analytics',
};

const AIAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTools]);

  const buildApiMessages = (msgs: Message[]) =>
    msgs.map((m) => ({ role: m.role, content: m.content }));

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);
    setActiveTools([]);

    // Placeholder for streaming assistant reply
    const assistantMessage: Message = { role: 'assistant', content: '', toolCalls: [] };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ messages: buildApiMessages(updatedMessages) }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handleEvent = (eventType: string, dataStr: string) => {
        let data: any;
        try { data = JSON.parse(dataStr); } catch { return; }
        if (eventType === 'delta') {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + data.text };
            return next;
          });
        } else if (eventType === 'tool_start') {
          const label = TOOL_LABELS[data.name] || data.name;
          setActiveTools((prev) => [...prev, label]);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, toolCalls: [...(last.toolCalls || []), label] };
            return next;
          });
        } else if (eventType === 'tool_end') {
          setActiveTools((prev) => prev.filter((t) => t !== (TOOL_LABELS[data.name] || data.name)));
        } else if (eventType === 'error') {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content: `Error: ${data.message}` };
            return next;
          });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          let eventType = 'message';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataStr = line.slice(6);
          }
          if (dataStr) handleEvent(eventType, dataStr);
        }
      }
    } catch (err: any) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          content: `Error: ${err.message}`,
        };
        return next;
      });
    } finally {
      setIsLoading(false);
      setActiveTools([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setTimeout(() => textareaRef.current?.focus(), 100);
    if (messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: "Hi! I'm your DragonDesk AI assistant. I can help you manage members, events, campaigns, and more. What would you like to do?",
      }]);
    }
  };

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button className={styles.fab} onClick={handleOpen} title="AI Assistant">
          <span className={styles.fabIcon}>✦</span>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.headerLeft}>
              <span className={styles.headerIcon}>✦</span>
              <span className={styles.headerTitle}>DragonDesk AI</span>
            </div>
            <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>✕</button>
          </div>

          <div className={styles.messages}>
            {messages.map((msg, i) => (
              <div key={i} className={`${styles.message} ${styles[msg.role]}`}>
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className={styles.toolCallList}>
                    {msg.toolCalls.map((tc, j) => (
                      <span key={j} className={styles.toolTag}>⚙ {tc}</span>
                    ))}
                  </div>
                )}
                <div className={styles.bubble}>
                  {msg.content || (isLoading && i === messages.length - 1 && msg.role === 'assistant' ? (
                    <span className={styles.cursor}>▌</span>
                  ) : '')}
                  {isLoading && i === messages.length - 1 && msg.role === 'assistant' && msg.content && (
                    <span className={styles.cursor}>▌</span>
                  )}
                </div>
              </div>
            ))}

            {activeTools.length > 0 && (
              <div className={styles.toolActivity}>
                <span className={styles.spinner} />
                {activeTools[activeTools.length - 1]}…
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className={styles.inputArea}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything or give me a task..."
              rows={1}
              className={styles.textarea}
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className={styles.sendBtn}
            >
              ↑
            </button>
          </div>
          <p className={styles.hint}>Enter to send · Shift+Enter for new line</p>
        </div>
      )}
    </>
  );
};

export default AIAssistant;
