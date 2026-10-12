'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import ErrorBoundary from '../../../../../components/ErrorBoundary';
import { Brain, ArrowRight } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, StatStrip, InsightRow, AutoChip } from '@/components/ui/premium';

const GOLD = 'var(--brand-primary)';
const SOFT_BORDER = 'rgba(255,255,255,0.08)';
const SURFACE = 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))';
const DIM = 'var(--text-secondary)';
const TEXT = 'var(--text-primary)';
const GREEN = 'var(--success)';
const fmtMoney = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

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

  // Live project snapshot - one /api/project-context fetch so the chat opens
  // already showing the money and open-item picture the AI reasons over.
  const { ctx } = useProjectContext(projectId);

  // Smart questions - generated from the live snapshot so the highest-value
  // prompts surface first, each naming the real number it is about. Purely
  // presentational: they feed the same sendMessage path as the static list.
  const smartQuestions: string[] = [];
  if (ctx) {
    const pendCo = Number(ctx.money?.pendingCoCount) || 0;
    if (pendCo > 0) smartQuestions.push(`Walk me through the ${pendCo} pending change order${pendCo === 1 ? '' : 's'} - approve or push back?`);
    const openRfis = Number(ctx.counts?.openRfis) || 0;
    if (openRfis > 0) smartQuestions.push(`Which of the ${openRfis} open RFI${openRfis === 1 ? '' : 's'} could hit cost or schedule?`);
    const owed = (Number(ctx.money?.billedToDate) || 0) - (Number(ctx.money?.paidToDate) || 0);
    if (owed > 0) smartQuestions.push(`${fmtMoney(owed)} is billed but not yet collected - how do I speed up payment?`);
    const punch = Number(ctx.counts?.openPunch) || 0;
    if (punch > 0) smartQuestions.push(`What is the fastest path to close the ${punch} open punch item${punch === 1 ? '' : 's'}?`);
  }

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

  const renderContent = (content: string) => {
    if (!content) return null;
    // Simple markdown: **bold** → strong, newlines → <br>
    const lines = content.split('\n');
    return lines.map((line, li) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <span key={li}>
          {parts.map((part, pi) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={pi} style={{ color: TEXT }}>{part.slice(2, -2)}</strong>;
            }
            return <span key={pi}>{part}</span>;
          })}
          {li < lines.length - 1 && <br />}
        </span>
      );
    });
  };

  return (
    <PremiumSurface maxWidth={2200} pad="40px 28px 40px">
      <ModuleHero
        eyebrow="Project Intelligence"
        eyebrowIcon={<Brain size={13} weight="fill" color="var(--text-secondary)" />}
        title="Saguaro"
        accent="Intelligence"
        subtitle="Ask about this project — grounded in its own records."
      />

      {/* What the AI already knows - live numbers from the project snapshot */}
      {ctx && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/contracts`,  label: 'Revised Contract', value: fmtMoney(Number(ctx.money?.revisedContract) || 0), sub: `${Number(ctx.money?.approvedCoCount) || 0} approved CO${(Number(ctx.money?.approvedCoCount) || 0) === 1 ? '' : 's'}` },
          {href: `/app/projects/${projectId}/intelligence`,  label: 'Billed to Date', value: fmtMoney(Number(ctx.money?.billedToDate) || 0), sub: `${Number(ctx.money?.billedPct) || 0}% of revised` },
          {href: `/app/projects/${projectId}/intelligence`,  label: 'Paid to Date', value: fmtMoney(Number(ctx.money?.paidToDate) || 0), accent: GREEN, sub: `Retainage ${Number(ctx.money?.retainagePct) || 0}%` },
          {href: `/app/projects/${projectId}/rfis`,  label: 'Open RFIs', value: String(Number(ctx.counts?.openRfis) || 0), accent: (Number(ctx.counts?.openRfis) || 0) > 5 ? 'var(--danger)' : undefined, sub: `${Number(ctx.counts?.openSubmittals) || 0} open submittal${(Number(ctx.counts?.openSubmittals) || 0) === 1 ? '' : 's'}` },
          {href: `/app/projects/${projectId}/punch-list`,  label: 'Open Punch', value: String(Number(ctx.counts?.openPunch) || 0), sub: `${Number(ctx.counts?.scheduleTasks) || 0} schedule tasks` },
          {href: `/app/projects/${projectId}/change-orders`,  label: 'Pending COs', value: String(Number(ctx.money?.pendingCoCount) || 0), accent: (Number(ctx.money?.pendingCoCount) || 0) > 0 ? 'var(--warning)' : undefined, sub: `${(ctx.subs || []).length} sub${(ctx.subs || []).length === 1 ? '' : 's'} on the job` },
        ]} />
      )}

      <SectionCard flush bodyStyle={{ padding: 0 }}>
        <div style={{ display: 'flex', height: ctx ? 'calc(100vh - 396px)' : 'calc(100vh - 300px)', minHeight: 480, overflow: 'hidden', borderRadius: 18 }}>
          {/* Sidebar */}
          <div style={{ width: 260, background: 'rgba(255,255,255,0.015)', borderRight: `1px solid ${SOFT_BORDER}`, padding: '20px 16px', overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <div style={{ width: '32px', height: '32px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}><Brain size={18} weight="bold" color="var(--on-brand)" /></div>
              <div>
                <div style={{ color: TEXT, fontWeight: 700, fontSize: '13px' }}>Saguaro Intelligence</div>
                <div style={{ color: DIM, fontSize: '12px' }}>AI Construction Expert</div>
              </div>
            </div>

            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', marginBottom: '20px', display: 'inline-block' }} />
            <span style={{ fontSize: '12px', color: DIM, marginLeft: '6px' }}>Online</span>

            {ctx && (
              <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', borderRadius: 8 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: DIM, marginBottom: 6 }}>Context Loaded</div>
                <InsightRow label="Project" value={ctx.project?.name || '-'} />
                <InsightRow label="Complete" value={`${Number(ctx.project?.percentComplete) || 0}%`} />
                <InsightRow label="Budget Lines" value={String(Number(ctx.budget?.lineCount) || 0)} />
                <InsightRow label="Bid Packages" value={String((ctx.bidPackages || []).length)} />
                {ctx.recent?.lastDailyLogDate && <InsightRow label="Last Daily Log" value={new Date(ctx.recent.lastDailyLogDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />}
              </div>
            )}
            {smartQuestions.length > 0 && (
              <>
                <div style={{ fontSize: '12px', fontWeight: 700, color: DIM, marginBottom: '10px', marginTop: '8px' }}>From This Project<AutoChip /></div>
                {smartQuestions.map(q => (
                  <button key={q} onClick={() => sendMessage(q)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', marginBottom: '6px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-surface-2)'}
                  >{q}</button>
                ))}
              </>
            )}
            <div style={{ fontSize: '12px', fontWeight: 700, color: DIM, marginBottom: '10px', marginTop: '8px' }}>Quick Questions</div>
            {QUICK_QUESTIONS.map(q => (
              <button key={q} onClick={() => sendMessage(q)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', marginBottom: '6px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-surface-2)'}
              >{q}</button>
            ))}

            <div style={{ marginTop: '24px', fontSize: '12px', fontWeight: 700, color: DIM, marginBottom: '8px' }}>Expertise</div>
            {['CSI MasterFormat', 'AIA Contracts', 'Lien Law (AZ/CA/TX)', 'Davis-Bacon / WH-347', 'OSHA 29 CFR 1926', 'Change Orders & Claims', 'Pay Application Process', 'Construction Finance'].map(item => (
              <div key={item} style={{ fontSize: '12px', color: DIM, padding: '4px 0', borderBottom: `1px solid ${SOFT_BORDER}` }}>{item}</div>
            ))}
          </div>

          {/* Chat area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {messages.map(msg => (
                <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', marginRight: '8px', flexShrink: 0, alignSelf: 'flex-end', fontWeight: 900, color: 'var(--on-brand)' }}>S</div>
                  )}
                  <div style={{
                    maxWidth: '78%',
                    background: msg.role === 'user' ? 'var(--bg-surface-2)' : SURFACE,
                    color: TEXT,
                    padding: '12px 16px',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    fontSize: '13px', lineHeight: '1.6',
                    whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
                    border: msg.role === 'assistant' ? `1px solid ${SOFT_BORDER}` : '1px solid var(--border-strong)',
                    boxShadow: 'none',
                  }}>
                    {renderContent(msg.content)}
                    {msg.isStreaming && (
                      <span style={{ display: 'inline-block', width: '2px', height: '14px', background: TEXT, marginLeft: '2px', animation: 'blink 0.8s infinite', verticalAlign: 'middle' }} />
                    )}
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.isStreaming === false && (
                <div style={{ alignSelf: 'flex-start', padding: '12px 16px', borderRadius: '10px', background: SURFACE, border: `1px solid ${SOFT_BORDER}`, color: 'var(--text-primary)', fontSize: '18px', letterSpacing: '4px' }}>●●●</div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '12px 20px', borderTop: `1px solid ${SOFT_BORDER}`, display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(255,255,255,0.015)' }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about costs, schedules, lien waivers, change orders…"
                disabled={isLoading}
                style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${SOFT_BORDER}`, borderRadius: '10px', padding: '10px 14px', color: TEXT, fontSize: '16px', outline: 'none' }}
              />
              <button type="button" onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()} className="k-btn k-btn-primary">
                {isLoading ? '…' : <>Ask <ArrowRight size={14} weight="bold" /></>}
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      <style>{`
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
      `}</style>
    </PremiumSurface>
  );
}

export default function IntelligencePage() {
  return (
    <ErrorBoundary>
      <IntelligenceChat />
    </ErrorBoundary>
  );
}
