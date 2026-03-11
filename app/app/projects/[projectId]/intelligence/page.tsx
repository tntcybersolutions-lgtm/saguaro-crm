'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import ErrorBoundary from '../../../../../components/ErrorBoundary';

const GOLD = '#D4A017';
const DARK = '#0d1117';
const RAISED = '#1f2c3e';
const BORDER = '#263347';
const DIM = '#8fa3c0';
const TEXT = '#e8edf8';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

const QUICK_QUESTIONS = [
  "What needs my attention today?",
  "What are my biggest cash flow risks?",
  "Which lien waiver deadlines are coming up?",
  "Analyze budget vs actual spending",
  "What are the schedule risks on this project?",
  "Which subs have compliance issues?",
  "How should I handle a change order dispute?",
  "What OSHA requirements apply to my site?",
];

function IntelligenceChat() {
  const params = useParams();
  const projectId = params?.projectId as string;

  const [messages, setMessages] = useState<Message[]>([{
    id: '0',
    role: 'assistant',
    content: "**Welcome to Saguaro Intelligence**\n\nI'm your AI construction expert with deep knowledge of CSI MasterFormat, AIA contracts, lien law, prevailing wages, estimating, and construction best practices.\n\nI have full context on this project — ask me anything about budget, RFIs, change orders, subs, schedule, or construction best practices.",
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsLoading(true);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      // Build history for context (last 20 messages)
      const history = [...messages, userMsg].slice(-20).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          projectId,
          context: 'project_intelligence',
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const ev = JSON.parse(raw);
            // Handle both old format (type:delta, text:...) and new format (type:content, content:...)
            const chunk = ev.text || ev.delta || ev.content || '';
            if (chunk && (ev.type === 'delta' || ev.type === 'content' || ev.delta || ev.text)) {
              accumulated += chunk;
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: accumulated, isStreaming: true } : m
              ));
            }
            if (ev.type === 'done') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, isStreaming: false } : m
              ));
            }
          } catch {}
        }
      }

      // Finalize
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, isStreaming: false } : m
      ));

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages(prev => prev.filter(m => m.id !== assistantId));
        return;
      }
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: "I had a brief connection issue. Please try your question again — I'm ready to help.", isStreaming: false }
          : m
      ));
    } finally {
      setIsLoading(false);
    }
  }, [messages, projectId, isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const renderContent = (content: string, isUser: boolean) => {
    if (!content) return null;
    // Simple markdown: **bold** → strong, newlines → <br>
    const lines = content.split('\n');
    return lines.map((line, li) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <span key={li}>
          {parts.map((part, pi) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={pi} style={{ color: isUser ? '#0d1117' : GOLD }}>{part.slice(2, -2)}</strong>;
            }
            return <span key={pi}>{part}</span>;
          })}
          {li < lines.length - 1 && <br />}
        </span>
      );
    });
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', background: DARK, borderRadius: '12px', overflow: 'hidden', border: `1px solid ${BORDER}` }}>
      {/* Sidebar */}
      <div style={{ width: 260, background: '#0a1117', borderRight: `1px solid ${BORDER}`, padding: '20px 16px', overflowY: 'auto', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <div style={{ width: '32px', height: '32px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🧠</div>
          <div>
            <div style={{ color: TEXT, fontWeight: 700, fontSize: '13px' }}>Saguaro Intelligence</div>
            <div style={{ color: DIM, fontSize: '11px' }}>AI Construction Expert</div>
          </div>
        </div>

        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px #22C55E', marginBottom: '20px', display: 'inline-block' }} />
        <span style={{ fontSize: '11px', color: DIM, marginLeft: '6px' }}>Online</span>

        <div style={{ fontSize: '10px', fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: '1px', marginBottom: '10px', marginTop: '8px' }}>Quick Questions</div>
        {QUICK_QUESTIONS.map(q => (
          <button key={q} onClick={() => sendMessage(q)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', marginBottom: '6px', background: 'rgba(212,160,23,0.06)', border: '1px solid rgba(212,160,23,0.15)', borderRadius: '6px', color: GOLD, fontSize: '11px', cursor: 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(212,160,23,0.12)'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(212,160,23,0.06)'}
          >{q}</button>
        ))}

        <div style={{ marginTop: '24px', fontSize: '10px', fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: '1px', marginBottom: '8px' }}>Expertise</div>
        {['CSI MasterFormat', 'AIA Contracts', 'Lien Law (AZ/CA/TX)', 'Davis-Bacon / WH-347', 'OSHA 29 CFR 1926', 'Change Orders & Claims', 'Pay Application Process', 'Construction Finance'].map(item => (
          <div key={item} style={{ fontSize: '11px', color: DIM, padding: '4px 0', borderBottom: `1px solid rgba(38,51,71,0.5)` }}>{item}</div>
        ))}
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map(msg => (
            <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {msg.role === 'assistant' && (
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},#F0C040)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', marginRight: '8px', flexShrink: 0, alignSelf: 'flex-end', fontWeight: 900, color: '#0d1117' }}>S</div>
              )}
              <div style={{
                maxWidth: '78%',
                background: msg.role === 'user' ? `linear-gradient(135deg,${GOLD},#F0C040)` : RAISED,
                color: msg.role === 'user' ? '#0d1117' : TEXT,
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                fontSize: '13px', lineHeight: '1.6',
                whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
                border: msg.role === 'assistant' ? `1px solid ${BORDER}` : 'none',
              }}>
                {renderContent(msg.content, msg.role === 'user')}
                {msg.isStreaming && (
                  <span style={{ display: 'inline-block', width: '2px', height: '14px', background: GOLD, marginLeft: '2px', animation: 'blink 0.8s infinite', verticalAlign: 'middle' }} />
                )}
              </div>
            </div>
          ))}
          {isLoading && messages[messages.length - 1]?.isStreaming === false && (
            <div style={{ alignSelf: 'flex-start', padding: '12px 16px', borderRadius: '10px', background: RAISED, border: `1px solid ${BORDER}`, color: GOLD, fontSize: '18px', letterSpacing: '4px' }}>●●●</div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '12px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about costs, schedules, lien waivers, change orders..."
            disabled={isLoading}
            style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '10px 14px', color: TEXT, fontSize: '13px', outline: 'none' }}
          />
          <button onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()}
            style={{ padding: '10px 20px', background: isLoading || !input.trim() ? 'rgba(212,160,23,0.3)' : `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: '8px', color: '#0d1117', fontSize: '13px', fontWeight: 800, cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer' }}>
            {isLoading ? '...' : 'Ask →'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
      `}</style>
    </div>
  );
}

export default function IntelligencePage() {
  return (
    <ErrorBoundary>
      <IntelligenceChat />
    </ErrorBoundary>
  );
}
