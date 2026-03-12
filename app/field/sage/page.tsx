'use client';
/**
 * Saguaro Field — Sage AI Chat
 * Full-screen mobile chat interface with streaming, voice input, and contextual suggestions.
 */
import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const GOLD   = '#D4A017';
const RAISED = '#0f1d2b';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';
const BLUE   = '#3B82F6';

interface Message {
  id: string;
  role: 'user' | 'sage';
  content: string;
  timestamp: Date;
  suggestions?: string[];
}

const QUICK_PROMPTS = [
  "What's my punch list status?",
  'Draft a daily log for today',
  'What RFIs are open?',
  'Summarize project progress',
  'What deliveries are scheduled?',
];

function getSuggestions(response: string): string[] {
  const lower = response.toLowerCase();
  if (lower.includes('rfi')) return ['Show all open RFIs', 'File a new RFI', 'What should I do next?'];
  if (lower.includes('punch')) return ['View punch list', 'Add punch item', 'What should I do next?'];
  if (lower.includes('schedule') || lower.includes('activit') || lower.includes('deadline')) return ["What's delayed?", "Today's activities", 'Summarize this project'];
  if (lower.includes('deliver') || lower.includes('material')) return ['Log a delivery', 'Check pending deliveries', 'What should I do next?'];
  if (lower.includes('safety') || lower.includes('incident') || lower.includes('hazard')) return ['Log safety incident', 'View safety reports', 'What should I do next?'];
  if (lower.includes('inspect') || lower.includes('checklist')) return ['Start an inspection', 'View inspection history', 'What should I do next?'];
  return ['Tell me more', 'What should I do next?', 'Summarize this project'];
}

function DotsLoader() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 7, height: 7, borderRadius: '50%', background: DIM,
            animation: 'sageBounce 1.2s infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`@keyframes sageBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}`}</style>
    </span>
  );
}

function SagePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const startListening = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e: any) => setInput(e.results[0][0].transcript);
    recognition.start();
    setListening(true);
    recognition.onend = () => setListening(false);
  };

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, projectId, context: 'field' }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get('content-type') || '';
      let reply = '';

      if (contentType.includes('text/event-stream') || contentType.includes('text/plain')) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        const sageId = `s-${Date.now()}`;

        setMessages(prev => [...prev, {
          id: sageId,
          role: 'sage',
          content: '',
          timestamp: new Date(),
        }]);
        setLoading(false);

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            // Handle SSE format (data: ...) or raw text
            const lines = chunk.split('\n');
            for (const line of lines) {
              let piece = '';
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  piece = parsed.choices?.[0]?.delta?.content || parsed.content || parsed.text || data;
                } catch {
                  piece = data;
                }
              } else if (line.trim()) {
                piece = line.trim();
              }
              if (piece) {
                reply += piece;
                setMessages(prev => prev.map(m =>
                  m.id === sageId ? { ...m, content: reply } : m
                ));
              }
            }
          }
          setMessages(prev => prev.map(m =>
            m.id === sageId ? { ...m, suggestions: getSuggestions(reply) } : m
          ));
        }
      } else {
        const data = await res.json();
        reply = data.reply || data.message || data.content || 'I received your message.';

        const sageMsg: Message = {
          id: `s-${Date.now()}`,
          role: 'sage',
          content: reply,
          timestamp: new Date(),
          suggestions: getSuggestions(reply),
        };
        setMessages(prev => [...prev, sageMsg]);
        setLoading(false);
      }
    } catch (err) {
      const errMsg: Message = {
        id: `s-err-${Date.now()}`,
        role: 'sage',
        content: "Sorry, I couldn't connect right now. Please check your connection and try again.",
        timestamp: new Date(),
        suggestions: ['Try again', 'What should I do next?'],
      };
      setMessages(prev => [...prev, errMsg]);
      setLoading(false);
    }
  }, [loading, projectId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setInput('');
  };

  const hasMessages = messages.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#09111A', position: 'relative' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, background: RAISED, flexShrink: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>‹</button>
          <span style={{ color: GOLD, display: 'flex', alignItems: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: GOLD, lineHeight: 1 }}>Sage AI</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 1 }}>Your construction intelligence</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.35)', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: GREEN, fontWeight: 700 }}>Field Mode</span>
          {hasMessages && (
            <button onClick={clearChat} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '5px 10px', color: DIM, fontSize: 12, cursor: 'pointer' }}>Clear</button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {!hasMessages && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 20, paddingBottom: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 10, color: GOLD, display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={56} height={56}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
              <div style={{ fontSize: 20, fontWeight: 800, color: GOLD, marginBottom: 4 }}>Sage AI</div>
              <div style={{ fontSize: 14, color: DIM, maxWidth: 260, lineHeight: 1.5 }}>Ask me anything about your project — I know your RFIs, schedule, punch list, and more.</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 340 }}>
              {QUICK_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 16px', color: TEXT, fontSize: 14, cursor: 'pointer', textAlign: 'left', fontWeight: 500, transition: 'border-color 0.2s' }}
                  onMouseOver={e => (e.currentTarget.style.borderColor = GOLD)}
                  onMouseOut={e => (e.currentTarget.style.borderColor = BORDER)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
            {/* Bubble */}
            <div style={{
              maxWidth: '82%',
              background: msg.role === 'user' ? GOLD : RAISED,
              border: msg.role === 'user' ? 'none' : `1px solid ${BORDER}`,
              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              padding: '10px 14px',
              color: msg.role === 'user' ? '#000' : TEXT,
              fontSize: 15,
              lineHeight: 1.55,
              fontWeight: msg.role === 'user' ? 600 : 400,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.content || (msg.role === 'sage' && <DotsLoader />)}
            </div>
            {/* Timestamp */}
            <div style={{ fontSize: 10, color: DIM, paddingLeft: msg.role === 'user' ? 0 : 4, paddingRight: msg.role === 'user' ? 4 : 0 }}>
              {msg.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
            {/* Suggestion chips */}
            {msg.role === 'sage' && msg.suggestions && msg.suggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: '90%' }}>
                {msg.suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    style={{ background: 'rgba(212,160,23,.08)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 20, padding: '5px 12px', color: GOLD, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: '18px 18px 18px 4px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: DIM }}>Sage is thinking</span>
              <DotsLoader />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{ padding: '10px 12px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', background: RAISED, borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: '#09111A', border: `1px solid ${BORDER}`, borderRadius: 22, padding: '6px 6px 6px 14px' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              // Auto-resize
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask Sage anything..."
            rows={1}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: TEXT,
              fontSize: 15,
              lineHeight: 1.5,
              resize: 'none',
              padding: '4px 0',
              maxHeight: 120,
              overflowY: 'auto',
            }}
          />
          {/* Mic button */}
          <button
            onClick={startListening}
            style={{
              background: listening ? 'rgba(239,68,68,.2)' : 'transparent',
              border: `1px solid ${listening ? RED : BORDER}`,
              borderRadius: '50%',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              fontSize: 16,
              color: listening ? RED : DIM,
              transition: 'all 0.2s',
            }}
            title="Voice input"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1={12} y1={19} x2={12} y2={23}/><line x1={8} y1={23} x2={16} y2={23}/></svg>
          </button>
          {/* Send button */}
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            style={{
              background: input.trim() && !loading ? GOLD : BORDER,
              border: 'none',
              borderRadius: '50%',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              flexShrink: 0,
              fontSize: 16,
              color: input.trim() && !loading ? '#000' : DIM,
              transition: 'background 0.2s',
            }}
            title="Send message"
          >
            ↑
          </button>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 10, color: DIM, textAlign: 'center' }}>Sage AI · Powered by your project data</p>
      </div>
    </div>
  );
}

export default function FieldSagePage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8fa3c0', textAlign: 'center' }}>Loading...</div>}>
      <SagePage />
    </Suspense>
  );
}
