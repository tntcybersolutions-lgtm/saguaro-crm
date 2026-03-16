'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, Btn, Card, CardBody, T } from '@/components/ui/shell';

interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  project_id: string;
}

function relativeTime(ts: string): string {
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function MessagesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/messages`);
      const json = await res.json();
      setMessages(json.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Poll for new messages every 15 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/messages`);
        const json = await res.json();
        const newMsgs: Message[] = json.messages || [];
        setMessages(prev => {
          if (newMsgs.length !== prev.length) return newMsgs;
          return prev;
        });
      } catch { /* non-fatal */ }
    }, 15000);
    return () => clearInterval(interval);
  }, [projectId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    if (!text.trim()) return;
    setSending(true);
    const newMsg: Message = {
      id: `m-${Date.now()}`,
      sender: 'Me',
      text: text.trim(),
      timestamp: new Date().toISOString(),
      project_id: projectId,
    };
    try {
      await fetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
    } catch { /* demo */ }
    setMessages(prev => [...prev, newMsg]);
    setText('');
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <PageWrap>
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
        <SectionHeader
          title="Messages"
          sub="Project team communication"
        />

        {/* Message thread */}
        <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div
            ref={scrollRef}
            style={{ flex: 1, overflowY: 'auto', padding: 20 }}
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.muted }}>Loading...</div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.muted }}>No messages yet. Start the conversation.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {messages.map(msg => {
                  const isMe = msg.sender === 'Me';
                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: isMe ? T.gold : T.white }}>{msg.sender}</span>
                        <span style={{ fontSize: 11, color: T.muted }}>{relativeTime(msg.timestamp)}</span>
                      </div>
                      <div style={{
                        maxWidth: '70%',
                        padding: '10px 16px',
                        borderRadius: 12,
                        background: isMe ? T.goldDim : T.surface2,
                        border: `1px solid ${isMe ? T.borderGold : T.border}`,
                        color: T.white,
                        fontSize: 14,
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                      }}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Send bar */}
          <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              style={{
                flex: 1, padding: '10px 14px',
                background: T.surface2, border: `1px solid ${T.border}`,
                borderRadius: 8, color: T.white, fontSize: 14, outline: 'none',
              }}
            />
            <Btn onClick={handleSend} disabled={sending || !text.trim()}>
              {sending ? 'Sending...' : 'Send'}
            </Btn>
          </div>
        </Card>
      </div>
    </PageWrap>
  );
}
