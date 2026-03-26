'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── TYPES ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  dbId?: string;
  thumbsUp?: boolean;
  thumbsDown?: boolean;
  timestamp: Date;
}

interface Chip {
  label: string;
  prompt: string;
}

interface GreetingResponse {
  greeting?: string;
  chips?: Chip[];
  pendingInsightsCount?: number;
  relationshipDepth?: string;
}

interface SageV6ChatProps {
  pageContext?: string;
  projectId?: string;
  projectName?: string;
  projectContext?: Record<string, unknown> | null;
  defaultOpen?: boolean;
}

// ─── PALETTE ───────────────────────────────────────────────────────────────────

const C = {
  DARK:   '#0d1117',
  RAISED: '#111827',
  BORDER: '#1f2c3e',
  GOLD:   '#D4A017',
  TEXT:   '#e8edf8',
  DIM:    '#8fa3c0',
  GREEN:  '#1a8a4a',
  RED:    '#c03030',
  BLUE:   '#1a5fa8',
  CARD:   '#162032',
} as const;

// ─── MARKDOWN RENDERER ─────────────────────────────────────────────────────────

import { renderSafeMarkdown } from '@/lib/sanitize-html';

function renderMarkdown(text: string): string {
  return renderSafeMarkdown(text);
}

// ─── DEPTH BADGE ───────────────────────────────────────────────────────────────

function DepthBadge({ depth }: { depth: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    new:      { label: 'New',      bg: 'rgba(26,138,74,0.18)',  color: '#22c55e' },
    familiar: { label: 'Familiar', bg: 'rgba(212,160,23,0.15)', color: C.GOLD   },
    deep:     { label: 'Deep',     bg: 'rgba(26,95,168,0.2)',   color: '#60a5fa' },
  };
  const config = map[depth] ?? map['new'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: config.bg, color: config.color,
      fontSize: 10, fontWeight: 600, letterSpacing: '0.4px',
      padding: '2px 8px', borderRadius: 20,
      border: `1px solid ${config.color}33`,
      textTransform: 'uppercase',
    }}>
      {config.label}
    </span>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function SageV6Chat({
  pageContext,
  projectId,
  projectName,
  projectContext,
  defaultOpen,
}: SageV6ChatProps) {

  const [isOpen, setIsOpen]                   = useState(defaultOpen ?? false);
  const [messages, setMessages]               = useState<Message[]>([]);
  const [input, setInput]                     = useState('');
  const [isStreaming, setIsStreaming]          = useState(false);
  const [greeting, setGreeting]               = useState('');
  const [chips, setChips]                     = useState<Chip[]>([]);
  const [sessionId]                           = useState(() => crypto.randomUUID());
  const [messageIndex, setMessageIndex]       = useState(0);
  const [pendingInsightsCount, setPendingInsightsCount] = useState(0);
  const [relationshipDepth, setRelationshipDepth] = useState('new');
  const [showFeedback, setShowFeedback]       = useState<string | null>(null);
  const [error, setError]                     = useState('');
  const [isMobile, setIsMobile]               = useState(false);
  const [greetingFetched, setGreetingFetched] = useState(false);

  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLTextAreaElement>(null);
  const sessionStartRef = useRef(new Date().toISOString());
  const abortControllerRef = useRef<AbortController | null>(null);

  // ─── MOBILE DETECTION ────────────────────────────────────────────────────────

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth <= 480);
    }
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // ─── AUTO-SCROLL ─────────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── GREETING FETCH ──────────────────────────────────────────────────────────

  const fetchGreeting = useCallback(async () => {
    if (greetingFetched) return;
    setGreetingFetched(true);
    try {
      const params = new URLSearchParams();
      if (pageContext) params.set('pageContext', pageContext);
      params.set('sessionId', sessionId);
      const res = await fetch(`/api/sage/greeting?${params.toString()}`);
      if (!res.ok) return;
      const data: GreetingResponse = await res.json();
      if (data.greeting)           setGreeting(data.greeting);
      if (data.chips)              setChips(data.chips);
      if (data.pendingInsightsCount !== undefined) setPendingInsightsCount(data.pendingInsightsCount);
      if (data.relationshipDepth)  setRelationshipDepth(data.relationshipDepth);
    } catch {
      // silently fail — greeting is optional
    }
  }, [greetingFetched, pageContext, sessionId]);

  // Fetch greeting on mount if defaultOpen, otherwise on first open
  useEffect(() => {
    if (defaultOpen) {
      fetchGreeting();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── END SESSION ─────────────────────────────────────────────────────────────

  const endSession = useCallback(() => {
    if (messages.length < 2) return;
    fetch('/api/sage/end-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        sessionStartedAt: sessionStartRef.current,
      }),
    }).catch(() => {});
  }, [messages, sessionId]);

  // ─── FEEDBACK ────────────────────────────────────────────────────────────────

  const submitFeedback = useCallback(async (
    messageId: string,
    dbId: string | undefined,
    thumbsUp: boolean
  ) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId
          ? { ...m, thumbsUp, thumbsDown: !thumbsUp }
          : m
      )
    );
    setShowFeedback(null);
    if (!dbId) return;
    await fetch('/api/sage/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: dbId, thumbsUp }),
    }).catch(() => {});
  }, []);

  // ─── SEND MESSAGE ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text?: string) => {
    const content = text ?? input.trim();
    if (!content || isStreaming) return;

    setInput('');
    setError('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setMessageIndex(prev => prev + 1);
    setIsStreaming(true);

    const assistantMsgId = crypto.randomUUID();
    setMessages(prev => [
      ...prev,
      { id: assistantMsgId, role: 'assistant', content: '', timestamp: new Date() },
    ]);

    try {
      abortControllerRef.current = new AbortController();

      const res = await fetch('/api/sage/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          sessionId,
          messageIndex,
          pageContext,
          projectId,
          projectName,
          projectContext: projectContext ?? null,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) throw new Error('Failed to reach Sage');

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';
      let fullText  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              fullText += data.text;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId ? { ...m, content: fullText } : m
                )
              );
            }
            if (data.done && data.chips) {
              setChips(data.chips);
            }
            if (data.done && data.dbId) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId ? { ...m, dbId: data.dbId } : m
                )
              );
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        // user cancelled — leave partial text intact
      } else {
        setError('Sage is unavailable right now. Try again.');
        setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [input, isStreaming, messages, sessionId, messageIndex, pageContext, projectId, projectName, projectContext]);

  // ─── OPEN / CLOSE ────────────────────────────────────────────────────────────

  const handleOpen = () => {
    setIsOpen(true);
    fetchGreeting();
    setTimeout(() => inputRef.current?.focus(), 120);
  };

  const handleClose = () => {
    endSession();
    setIsOpen(false);
  };

  // ─── TEXTAREA AUTO-RESIZE ────────────────────────────────────────────────────

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ─── DERIVED ─────────────────────────────────────────────────────────────────

  const showChips        = messages.length === 0 && chips.length > 0;
  const showGreeting     = messages.length === 0 && !!greeting;
  const lastMsg          = messages[messages.length - 1];
  const showStreamingDot = isStreaming && lastMsg?.role === 'assistant' && lastMsg?.content === '';

  // ─── PANEL POSITION STYLES ───────────────────────────────────────────────────

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position:    'fixed',
        inset:       0,
        width:       '100%',
        height:      '100dvh',
        borderRadius: 0,
        zIndex:      1000,
        display:     'flex',
        flexDirection: 'column',
        background:  C.RAISED,
        border:      'none',
        boxShadow:   'none',
        animation:   'slideUp 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards',
      }
    : {
        position:    'fixed',
        bottom:      24,
        right:       24,
        width:       400,
        height:      600,
        borderRadius: 16,
        zIndex:      1000,
        display:     'flex',
        flexDirection: 'column',
        background:  C.RAISED,
        border:      `1px solid ${C.BORDER}`,
        boxShadow:   '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
        overflow:    'hidden',
        animation:   'slideUp 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        transformOrigin: 'bottom right',
      };

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── KEYFRAMES ─────────────────────────────────────────────────── */}
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(26,138,74,0.6); }
          50%       { opacity: 0.75; box-shadow: 0 0 0 4px rgba(26,138,74,0); }
        }
        @keyframes dotPulse1 {
          0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
          30%            { opacity: 1;   transform: translateY(-4px); }
        }
        @keyframes dotPulse2 {
          0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
          30%            { opacity: 1;   transform: translateY(-4px); }
        }
        @keyframes dotPulse3 {
          0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
          30%            { opacity: 1;   transform: translateY(-4px); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: scale(0.92) translateY(20px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes badgeBounce {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.3); }
        }
        .sageV6-scroll::-webkit-scrollbar          { width: 4px; }
        .sageV6-scroll::-webkit-scrollbar-track    { background: transparent; }
        .sageV6-scroll::-webkit-scrollbar-thumb    { background: rgba(212,160,23,0.22); border-radius: 2px; }
        .sageV6-bubble strong { color: #D4A017; }
        .sageV6-bubble em     { color: #c8d4e8; }
        .sageV6-bubble code   { background: rgba(212,160,23,0.12); color: #D4A017; padding: 1px 5px; border-radius: 4px; font-size: 12px; font-family: monospace; }
        .sageV6-bubble ul     { margin: 6px 0; padding-left: 18px; }
        .sageV6-bubble li     { margin: 3px 0; color: #e8edf8; }
        .sageV6-bubble p      { margin: 0 0 8px; }
        .sageV6-bubble p:last-child { margin: 0; }
        .sageV6-chip:hover    { background: rgba(212,160,23,0.16) !important; transform: translateY(-1px); box-shadow: 0 3px 12px rgba(212,160,23,0.15); }
        .sageV6-send:hover:not(:disabled) { transform: scale(1.06); }
        .sageV6-thumb:hover   { background: rgba(212,160,23,0.14) !important; }
      `}</style>

      {/* ── LAUNCHER BUTTON (closed state) ────────────────────────────── */}
      {!isOpen && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}>
          {/* pending insights badge */}
          {pendingInsightsCount > 0 && (
            <div style={{
              position: 'absolute', top: -4, right: -4,
              width: 18, height: 18, borderRadius: '50%',
              background: C.RED, border: `2px solid ${C.DARK}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, color: '#fff', zIndex: 2,
              animation: 'badgeBounce 2s ease-in-out infinite',
            }}>
              {pendingInsightsCount > 9 ? '9+' : pendingInsightsCount}
            </div>
          )}
          {/* unread dot (no count — just presence) */}
          {pendingInsightsCount === 0 && greeting && (
            <div style={{
              position: 'absolute', top: 2, right: 2,
              width: 8, height: 8, borderRadius: '50%',
              background: C.GREEN, border: `2px solid ${C.DARK}`,
              zIndex: 2, animation: 'badgeBounce 3s ease-in-out infinite',
            }} />
          )}
          <button
            onClick={handleOpen}
            title="Open Sage AI"
            style={{
              width: 52, height: 52, borderRadius: '50%',
              background: C.GOLD, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 24px rgba(212,160,23,0.45), 0 2px 6px rgba(0,0,0,0.4)',
              transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s',
              padding: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 10px 32px rgba(212,160,23,0.6), 0 2px 6px rgba(0,0,0,0.4)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 24px rgba(212,160,23,0.45), 0 2px 6px rgba(0,0,0,0.4)';
            }}
          >
            {/* S monogram */}
            <span style={{
              fontSize: 22, fontWeight: 800, color: C.DARK,
              fontFamily: 'Georgia, serif', lineHeight: 1, userSelect: 'none',
            }}>S</span>
          </button>
        </div>
      )}

      {/* ── OPEN CHAT PANEL ───────────────────────────────────────────── */}
      {isOpen && (
        <div style={panelStyle}>

          {/* ── HEADER ──────────────────────────────────────────────────── */}
          <div style={{
            flexShrink: 0,
            background: `linear-gradient(135deg, #131c2a 0%, ${C.RAISED} 100%)`,
            borderBottom: `1px solid ${C.BORDER}`,
            padding: '0 16px',
          }}>
            {/* top row */}
            <div style={{
              height: 58, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              {/* S avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: C.GOLD, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 10px rgba(212,160,23,0.35)',
              }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: C.DARK, fontFamily: 'Georgia, serif', lineHeight: 1 }}>S</span>
              </div>

              {/* name + depth */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.TEXT, letterSpacing: '-0.1px' }}>
                  Sage
                </span>
                <DepthBadge depth={relationshipDepth} />
              </div>

              {/* close */}
              <button
                onClick={handleClose}
                title="Close"
                style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', color: C.DIM, fontSize: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'background 0.15s, color 0.15s',
                  lineHeight: 1,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(192,48,48,0.18)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#f87171';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = C.DIM;
                }}
              >✕</button>
            </div>

            {/* sub-header */}
            <div style={{
              paddingBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, color: C.DIM, letterSpacing: '0.2px',
            }}>
              <span>Powered by Claude</span>
              <span style={{ color: C.BORDER }}>·</span>
              {/* green live dot */}
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#22c55e',
                animation: 'livePulse 2.4s ease-in-out infinite',
                flexShrink: 0,
              }} />
              <span style={{ color: '#22c55e', fontWeight: 500 }}>Online</span>
              {projectName && (
                <>
                  <span style={{ color: C.BORDER }}>·</span>
                  <span style={{ color: C.DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                    {projectName}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* ── MESSAGES AREA ───────────────────────────────────────────── */}
          <div
            className="sageV6-scroll"
            style={{
              flex: 1, overflowY: 'auto',
              padding: '16px 14px',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            {/* GREETING (shown only before first message) */}
            {showGreeting && (
              <div style={{
                padding: '10px 14px',
                borderLeft: `3px solid ${C.GOLD}`,
                background: 'rgba(212,160,23,0.05)',
                borderRadius: '0 8px 8px 0',
                animation: 'fadeIn 0.4s ease forwards',
                marginBottom: 4,
              }}>
                <p style={{
                  margin: 0, fontSize: 13, lineHeight: 1.6,
                  color: 'rgba(212,160,23,0.85)', fontStyle: 'italic',
                }}>
                  {greeting}
                </p>
              </div>
            )}

            {/* MESSAGES */}
            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: 4,
                  animation: idx === messages.length - 1 ? 'fadeIn 0.25s ease forwards' : 'none',
                }}
              >
                {msg.role === 'user' ? (
                  /* ── USER BUBBLE ────────────────────────────────────── */
                  <>
                    <div style={{
                      maxWidth: '80%',
                      background: 'rgba(212,160,23,0.15)',
                      border: '1px solid rgba(212,160,23,0.3)',
                      color: C.TEXT,
                      fontSize: 14, lineHeight: 1.55,
                      padding: '10px 14px',
                      borderRadius: '16px 16px 4px 16px',
                      wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                    }}>
                      {msg.content}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(232,237,248,0.25)', paddingRight: 4 }}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </>
                ) : (
                  /* ── ASSISTANT BUBBLE ───────────────────────────────── */
                  <div
                    style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 4 }}
                    onMouseEnter={() => { if (msg.content && !isStreaming) setShowFeedback(msg.id); }}
                    onMouseLeave={() => setShowFeedback(null)}
                  >
                    {/* streaming empty state → dots */}
                    {msg.id === lastMsg?.id && showStreamingDot ? (
                      <div style={{
                        background: C.CARD,
                        border: `1px solid ${C.BORDER}`,
                        padding: '14px 18px', borderRadius: '16px 16px 16px 4px',
                        display: 'flex', gap: 6, alignItems: 'center',
                      }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.GOLD, animation: 'dotPulse1 1.3s ease-in-out infinite', animationDelay: '0s' }} />
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.GOLD, animation: 'dotPulse2 1.3s ease-in-out infinite', animationDelay: '0.22s' }} />
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.GOLD, animation: 'dotPulse3 1.3s ease-in-out infinite', animationDelay: '0.44s' }} />
                      </div>
                    ) : (
                      <div
                        className="sageV6-bubble"
                        style={{
                          background: C.CARD,
                          border: `1px solid ${C.BORDER}`,
                          color: C.TEXT,
                          fontSize: 14, lineHeight: 1.65,
                          padding: '12px 15px',
                          borderRadius: '16px 16px 16px 4px',
                          wordBreak: 'break-word',
                        }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                    )}

                    {/* timestamp + feedback */}
                    {msg.content && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        paddingLeft: 4,
                      }}>
                        <span style={{ fontSize: 10, color: 'rgba(232,237,248,0.25)' }}>
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>

                        {/* thumbs (show on hover or after vote) */}
                        {(showFeedback === msg.id || msg.thumbsUp || msg.thumbsDown) && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="sageV6-thumb"
                              onClick={() => submitFeedback(msg.id, msg.dbId, true)}
                              title="Helpful"
                              style={{
                                background: msg.thumbsUp ? 'rgba(26,138,74,0.2)' : 'rgba(143,163,192,0.1)',
                                border: `1px solid ${msg.thumbsUp ? 'rgba(26,138,74,0.4)' : 'rgba(143,163,192,0.15)'}`,
                                borderRadius: 6, width: 26, height: 26,
                                cursor: 'pointer', fontSize: 12,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.15s',
                                color: msg.thumbsUp ? '#22c55e' : C.DIM,
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 001.94-1.53l1.54-6a2 2 0 00-1.94-2.47H14z"/>
                                <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
                              </svg>
                            </button>
                            <button
                              className="sageV6-thumb"
                              onClick={() => submitFeedback(msg.id, msg.dbId, false)}
                              title="Not helpful"
                              style={{
                                background: msg.thumbsDown ? 'rgba(192,48,48,0.2)' : 'rgba(143,163,192,0.1)',
                                border: `1px solid ${msg.thumbsDown ? 'rgba(192,48,48,0.4)' : 'rgba(143,163,192,0.15)'}`,
                                borderRadius: 6, width: 26, height: 26,
                                cursor: 'pointer', fontSize: 12,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.15s',
                                color: msg.thumbsDown ? '#f87171' : C.DIM,
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-1.94 1.53l-1.54 6a2 2 0 001.94 2.47H10z"/>
                                <path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/>
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* SUGGESTION CHIPS — 2×2 grid shown before first message */}
            {showChips && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                marginTop: 8,
                animation: 'fadeIn 0.4s ease 0.1s forwards',
                opacity: 0,
              }}>
                {chips.slice(0, 4).map((chip, i) => (
                  <button
                    key={i}
                    className="sageV6-chip"
                    onClick={() => sendMessage(chip.prompt)}
                    style={{
                      background: 'rgba(212,160,23,0.08)',
                      border: '1px solid rgba(212,160,23,0.2)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 12, lineHeight: 1.4,
                      color: C.GOLD, cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── ERROR BANNER ────────────────────────────────────────────── */}
          {error && (
            <div style={{
              margin: '0 14px 2px',
              padding: '10px 14px',
              background: 'rgba(192,48,48,0.12)',
              border: `1px solid rgba(192,48,48,0.3)`,
              borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 10,
              flexShrink: 0,
              animation: 'fadeIn 0.2s ease forwards',
            }}>
              <span style={{ fontSize: 13, color: '#f87171', flex: 1, lineHeight: 1.4 }}>
                {error}
              </span>
              <button
                onClick={() => setError('')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#f87171', fontSize: 16, lineHeight: 1, padding: 2, flexShrink: 0,
                }}
              >✕</button>
            </div>
          )}

          {/* ── INPUT AREA ──────────────────────────────────────────────── */}
          <div style={{
            flexShrink: 0,
            borderTop: `1px solid ${C.BORDER}`,
            padding: '12px 14px 14px',
            background: 'rgba(13,17,23,0.6)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 10,
              background: C.DARK,
              border: `1px solid ${C.BORDER}`,
              borderRadius: 10,
              padding: '10px 12px',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
              onFocusCapture={e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = 'rgba(212,160,23,0.4)';
                el.style.boxShadow = '0 0 0 3px rgba(212,160,23,0.07)';
              }}
              onBlurCapture={e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = C.BORDER;
                el.style.boxShadow = 'none';
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask Sage anything…"
                rows={1}
                disabled={isStreaming}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none', outline: 'none',
                  color: C.TEXT,
                  fontSize: 14, lineHeight: 1.5,
                  resize: 'none',
                  fontFamily: 'inherit',
                  minHeight: 22, maxHeight: 120,
                  overflowY: 'auto',
                  caretColor: C.GOLD,
                }}
              />

              {/* send / stop button */}
              <button
                className="sageV6-send"
                onClick={isStreaming
                  ? () => { abortControllerRef.current?.abort(); }
                  : () => sendMessage()
                }
                disabled={!isStreaming && !input.trim()}
                title={isStreaming ? 'Stop' : 'Send'}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  border: 'none', cursor: (isStreaming || input.trim()) ? 'pointer' : 'default',
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                  background: isStreaming
                    ? 'rgba(192,48,48,0.2)'
                    : input.trim()
                      ? C.GOLD
                      : C.BORDER,
                  boxShadow: (!isStreaming && input.trim())
                    ? '0 2px 10px rgba(212,160,23,0.3)'
                    : 'none',
                }}
              >
                {isStreaming ? (
                  /* stop square */
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: '#f87171' }} />
                ) : (
                  /* send arrow */
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                      stroke={input.trim() ? C.DARK : C.DIM}
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>

            {/* footer caption */}
            <div style={{
              marginTop: 7, textAlign: 'center',
              fontSize: 10, color: 'rgba(143,163,192,0.35)',
              letterSpacing: '0.3px',
            }}>
              Sage · Saguaro Control Systems · Powered by Claude
            </div>
          </div>

        </div>
      )}
    </>
  );
}
