'use client';
/**
 * Saguaro Field — Job Board / Crew Chat
 * Real-time crew messaging with polling, offline queue, name prompt.
 */
import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import { useRealtimeMessages } from '@/lib/useRealtime';

const GOLD = '#D4A017', RAISED = '#0f1d2b', BORDER = '#1e3148', TEXT = '#e8edf8', DIM = '#8fa3c0';
const GREEN = '#22C55E';

function hr(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}

const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8fa3c0', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };

interface Message {
  id: string;
  sender_name: string;
  content: string;
  created_at: string;
  is_system?: boolean;
  metadata?: Record<string, unknown>;
}

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 5) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const d = Math.floor(diff / 86400);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

function ChatPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [projectName, setProjectName] = useState('');
  const [myName, setMyName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Real-time subscription: merge incoming messages without duplicates
  const handleNewMessage = useCallback((msg: Record<string, unknown>) => {
    setMessages(prev => {
      const exists = prev.find(m => m.id === String(msg.id));
      if (exists) return prev;
      return [...prev, {
        id: String(msg.id),
        sender_name: String(msg.sender_name || 'Unknown'),
        content: String(msg.content || ''),
        created_at: String(msg.created_at || new Date().toISOString()),
        is_system: Boolean(msg.is_system),
      }];
    });
  }, []);

  useRealtimeMessages(projectId || null, handleNewMessage);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    // Load stored name
    const stored = localStorage.getItem('field_user_name');
    if (stored) {
      setMyName(stored);
    } else {
      setShowNamePrompt(true);
    }
  }, []);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    fetch('/api/projects/list')
      .then(r => r.ok ? r.json() : null)
      .then(d => { const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId); if (p) setProjectName(p.name); })
      .catch(() => {});
    loadMessages();
    // Poll every 15 seconds
    pollRef.current = setInterval(loadMessages, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const loadMessages = async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/messages`);
      const d = await r.json();
      const msgs: Message[] = d.messages || [];
      // Sort ascending by created_at
      msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setMessages(msgs);
    } catch { /* offline */ }
    setLoading(false);
  };

  const saveName = () => {
    const name = nameInput.trim();
    if (!name) return;
    localStorage.setItem('field_user_name', name);
    setMyName(name);
    setShowNamePrompt(false);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (!text || !myName) return;
    setSending(true);

    const payload = {
      project_id: projectId,
      content: text,
      sender_name: myName,
    };

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      sender_name: myName,
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, optimistic]);
    setContent('');

    try {
      if (!online) throw new Error('offline');
      await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // Refresh to get server-assigned id
      await loadMessages();
    } catch {
      await enqueue({ url: '/api/messages/send', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
    }

    setSending(false);
  };

  // Name prompt overlay
  if (showNamePrompt) {
    return (
      <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 }}>
          <div style={{ textAlign: 'center', marginBottom: 12, color: DIM, display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
          <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: TEXT, textAlign: 'center' }}>What's your name?</h2>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: DIM, textAlign: 'center' }}>Your name will appear with your messages.</p>
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); }}
            placeholder="Your first name or nickname"
            style={{ width: '100%', background: '#09111A', border: '1px solid #1e3148', borderRadius: 10, padding: '12px 14px', color: '#e8edf8', fontSize: 16, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
            autoFocus
          />
          <button
            onClick={saveName}
            disabled={!nameInput.trim()}
            style={{ width: '100%', background: nameInput.trim() ? GOLD : '#1e3148', border: 'none', borderRadius: 10, padding: '14px', color: nameInput.trim() ? '#000' : DIM, fontSize: 16, fontWeight: 800, cursor: nameInput.trim() ? 'pointer' : 'default' }}
          >
            Join Job Board
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', flexShrink: 0, borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={() => router.back()} style={backBtn}>← Back</button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT, display: 'flex', alignItems: 'center', gap: 8 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Job Board</h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: DIM }}>{projectName}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: online ? GREEN : '#EF4444', animation: online ? 'pulse 2s infinite' : 'none' }} />
            <span style={{ fontSize: 12, color: online ? GREEN : '#EF4444', fontWeight: 600 }}>{online ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading messages...</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 16px', color: DIM }}>
            <div style={{ marginBottom: 10, color: DIM, display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
            <p style={{ margin: 0, fontSize: 14 }}>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender_name === myName;
            const isSystem = msg.is_system;

            if (isSystem) {
              return (
                <div key={msg.id} style={{ textAlign: 'center', padding: '4px 0' }}>
                  <span style={{ fontSize: 12, color: DIM, background: 'rgba(255,255,255,.04)', borderRadius: 8, padding: '3px 10px' }}>{msg.content}</span>
                </div>
              );
            }

            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '78%',
                  background: isMe ? `rgba(${hr(GOLD)}, .1)` : RAISED,
                  border: `1px solid ${isMe ? `rgba(${hr(GOLD)}, .35)` : BORDER}`,
                  borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  padding: '10px 13px',
                }}>
                  {!isMe && (
                    <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: 0.5 }}>{msg.sender_name}</p>
                  )}
                  <p style={{ margin: 0, fontSize: 14, color: TEXT, lineHeight: 1.45, wordBreak: 'break-word' }}>{msg.content}</p>
                </div>
                <span style={{ fontSize: 11, color: DIM, marginTop: 3, paddingLeft: isMe ? 0 : 4, paddingRight: isMe ? 4 : 0 }}>
                  {isMe ? 'You · ' : ''}{relTime(msg.created_at)}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{ flexShrink: 0, padding: '10px 12px', borderTop: `1px solid ${BORDER}`, background: '#070f18' }}>
        {!online && (
          <div style={{ fontSize: 12, color: '#EF4444', fontWeight: 600, marginBottom: 6, textAlign: 'center' }}>Offline — message will send when reconnected</div>
        )}
        <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage({ preventDefault: () => {} } as React.FormEvent); } }}
            placeholder={`Message as ${myName}…`}
            rows={1}
            style={{
              flex: 1,
              background: '#09111A',
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: '11px 14px',
              color: '#e8edf8',
              fontSize: 15,
              outline: 'none',
              resize: 'none',
              maxHeight: 120,
              overflowY: 'auto',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={!content.trim() || sending}
            style={{
              background: content.trim() && !sending ? GOLD : '#1e3148',
              border: 'none',
              borderRadius: 10,
              width: 44,
              height: 44,
              fontSize: 20,
              cursor: content.trim() && !sending ? 'pointer' : 'default',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: content.trim() && !sending ? '#000' : DIM,
            }}
          >
            {sending ? '⋯' : '↑'}
          </button>
        </form>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 11, color: DIM }}>Chatting as <strong style={{ color: TEXT }}>{myName}</strong></span>
          <button
            onClick={() => { setShowNamePrompt(true); setNameInput(myName); }}
            style={{ background: 'none', border: 'none', color: DIM, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Change name
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FieldChatPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8fa3c0', textAlign: 'center' }}>Loading...</div>}>
      <ChatPage />
    </Suspense>
  );
}
