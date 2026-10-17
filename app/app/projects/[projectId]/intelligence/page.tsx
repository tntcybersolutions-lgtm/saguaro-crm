'use client';
/**
 * Project Intelligence — the job's live numbers (contract, billed, paid, open
 * items) beside an AI chat grounded in this project's own records.
 *
 * Reads  /api/project-context (useProjectContext) for the numbers and questions
 * Writes POST /api/ai/chat  { messages, projectId, context: 'project_intelligence' } — SSE stream
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import ErrorBoundary from '../../../../../components/ErrorBoundary';
import {
  Brain, ArrowRight, FileText, Receipt, Wallet, Question, Swap, ListChecks, Stack, CalendarCheck, ChatCircleText, Sparkle,
} from '@phosphor-icons/react';
import { PageShell, StatRow, Button, Card, Input, ItemList, ItemRow, DetailList, type StatItem } from '@/components/ui/kit';
import { Facts } from '@/lib/ui/filled-facts';

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

const PAGE_CSS = `
.intelGrid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: var(--section-gap); align-items: start; }
.intelRail { display: flex; flex-direction: column; gap: var(--section-gap); min-width: 0; }
.intelChat { display: flex; flex-direction: column; height: max(460px, calc(100vh - 380px)); }
.intelMsgs { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.intelRow { display: flex; gap: 8px; align-items: flex-end; }
.intelRow[data-role="user"] { justify-content: flex-end; }
.intelBubble { max-width: 78%; padding: 12px 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; color: var(--text-primary); border: 1px solid var(--border-default); }
.intelRow[data-role="assistant"] .intelBubble { background: var(--bg-surface); border-radius: 16px 16px 16px 4px; color: var(--text-secondary); }
.intelRow[data-role="user"] .intelBubble { background: var(--bg-surface-2); border-radius: 16px 16px 4px 16px; }
.intelAvatar { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: var(--bg-surface-2); border: 1px solid var(--border-default); color: var(--text-secondary); }
.intelCaret { display: inline-block; width: 2px; height: 14px; margin-left: 2px; vertical-align: middle; background: var(--text-primary); animation: intelBlink 0.8s infinite; }
@keyframes intelBlink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
.intelCompose { display: flex; gap: 10px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--border-subtle); }
.intelCompose .k-input { flex: 1; font-size: 16px; }
.intelMeter { display: flex; gap: 2px; height: 14px; border-radius: 4px; overflow: hidden; background: var(--bg-surface-2); }
.intelMeter > span { display: block; height: 100%; }
.intelMeter > span:first-child { border-radius: 4px 0 0 4px; }
.intelLegend { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.intelLegend > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.intelLegend .lbl { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-tertiary); }
.intelLegend .sw { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.intelLegend .val { font-size: 15px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.intelBar { position: relative; display: block; width: 72px; height: 6px; border-radius: 3px; background: var(--bg-surface-2); }
.intelBar > span { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: var(--text-tertiary); }
@media (max-width: 960px) {
  .intelGrid { grid-template-columns: 1fr; }
  .intelChat { height: max(420px, calc(100vh - 260px)); }
  .intelBubble { max-width: 88%; }
}
`;

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
          } catch (parseErr) {
            // A keep-alive or non-JSON SSE line: skip it, keep streaming.
            console.debug('[intelligence] skipped stream line', parseErr);
          }
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
              return <strong key={pi} style={{ color: 'var(--text-primary)' }}>{part.slice(2, -2)}</strong>;
            }
            return <span key={pi}>{part}</span>;
          })}
          {li < lines.length - 1 && <br />}
        </span>
      );
    });
  };

  const base = `/app/projects/${projectId}`;
  const revised = Number(ctx?.money?.revisedContract) || 0;
  const billed = Number(ctx?.money?.billedToDate) || 0;
  const paid = Number(ctx?.money?.paidToDate) || 0;
  const unpaid = Math.max(0, billed - paid);
  const left = Math.max(0, revised - billed);
  const openRfis = Number(ctx?.counts?.openRfis) || 0;
  const pendingCos = Number(ctx?.money?.pendingCoCount) || 0;
  const approvedCos = Number(ctx?.money?.approvedCoCount) || 0;
  const pct = (n: number) => (revised > 0 ? Math.min(100, Math.max(0, (n / revised) * 100)) : 0);

  const stats: StatItem[] = ctx ? [
    { label: 'Revised contract', value: fmtMoney(revised), sub: `${approvedCos} approved CO${approvedCos === 1 ? '' : 's'}`, icon: <FileText size={15} />, href: `${base}/contracts` },
    { label: 'Billed to date', value: fmtMoney(billed), sub: `${Number(ctx.money?.billedPct) || 0}% of revised`, icon: <Receipt size={15} />, href: `${base}/pay-apps` },
    { label: 'Paid to date', value: fmtMoney(paid), sub: `Retainage ${Number(ctx.money?.retainagePct) || 0}%`, tone: paid > 0 ? 'good' : 'default', icon: <Wallet size={15} /> },
    { label: 'Open RFIs', value: String(openRfis), sub: `${Number(ctx.counts?.openSubmittals) || 0} open submittal${(Number(ctx.counts?.openSubmittals) || 0) === 1 ? '' : 's'}`, tone: openRfis > 5 ? 'bad' : 'default', icon: <Question size={15} />, href: `${base}/rfis` },
    { label: 'Pending COs', value: String(pendingCos), sub: `${(ctx.subs || []).length} sub${(ctx.subs || []).length === 1 ? '' : 's'} on the job`, tone: pendingCos > 0 ? 'warn' : 'default', icon: <Swap size={15} />, href: `${base}/change-orders` },
  ] : [];

  // Open work on the job, ranked by count — each row opens its tool.
  const openItems = ctx ? [
    { key: 'rfis', label: 'Open RFIs', n: openRfis, href: `${base}/rfis`, icon: <Question size={16} /> },
    { key: 'submittals', label: 'Open submittals', n: Number(ctx.counts?.openSubmittals) || 0, href: `${base}/submittals`, icon: <Stack size={16} /> },
    { key: 'punch', label: 'Open punch items', n: Number(ctx.counts?.openPunch) || 0, href: `${base}/punch-list`, icon: <ListChecks size={16} /> },
    { key: 'cos', label: 'Pending change orders', n: pendingCos, href: `${base}/change-orders`, icon: <Swap size={16} /> },
    { key: 'tasks', label: 'Schedule tasks', n: Number(ctx.counts?.scheduleTasks) || 0, href: `${base}/schedule`, icon: <CalendarCheck size={16} /> },
  ].sort((a, b) => b.n - a.n) : [];
  const maxOpen = Math.max(1, ...openItems.map((o) => o.n));

  const segs = [
    { key: 'paid', label: 'Paid', value: paid, color: 'var(--success)' },
    { key: 'unpaid', label: 'Billed, unpaid', value: unpaid, color: 'var(--warning)' },
    { key: 'left', label: 'Left to bill', value: left, color: 'var(--border-strong)' },
  ];

  return (
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
        { label: 'Intelligence' },
      ]}
      title="Intelligence"
      subtitle={ctx?.project?.name || undefined}
      actions={
        <Button icon={<Sparkle size={15} />} onClick={() => sendMessage(QUICK_QUESTIONS[0])} disabled={isLoading}>
          What needs my attention?
        </Button>
      }
    >
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      {/* What the AI already knows - live numbers from the project snapshot */}
      {ctx && <StatRow items={stats} />}

      <div className="intelGrid">
        <Card flush title="Saguaro Intelligence" icon={<Brain size={17} />} subtitle={ctx?.project?.name ? `Grounded in ${ctx.project.name}` : 'Grounded in this project'}>
          <div className="intelChat">
            <div className="intelMsgs" aria-live="polite">
              {messages.map(msg => (
                <div key={msg.id} className="intelRow" data-role={msg.role}>
                  {msg.role === 'assistant' && <span className="intelAvatar" aria-hidden><Brain size={15} /></span>}
                  <div className="intelBubble">
                    {renderContent(msg.content)}
                    {msg.isStreaming && <span className="intelCaret" />}
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.isStreaming === false && (
                <div className="intelRow" data-role="assistant"><div className="intelBubble" style={{ letterSpacing: 4 }}>●●●</div></div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="intelCompose">
              <Input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about costs, schedules, lien waivers, change orders…"
                aria-label="Ask Saguaro Intelligence"
                disabled={isLoading}
              />
              <Button variant="primary" onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()}>
                {isLoading ? '…' : <>Ask <ArrowRight size={14} weight="bold" /></>}
              </Button>
            </div>
          </div>
        </Card>

        <div className="intelRail">
          {ctx && revised > 0 && (
            <Card title="Contract billed" subtitle={`${Math.round(pct(billed))}% of ${fmtMoney(revised)}`}>
              <div className="intelMeter" role="img" aria-label={`Paid ${fmtMoney(paid)}, billed unpaid ${fmtMoney(unpaid)}, left to bill ${fmtMoney(left)} of ${fmtMoney(revised)}`}>
                {segs.filter((s) => s.value > 0).map((s) => (
                  <span key={s.key} title={`${s.label}: ${fmtMoney(s.value)} (${Math.round(pct(s.value))}%)`} style={{ width: `${pct(s.value)}%`, background: s.color }} />
                ))}
              </div>
              <div className="intelLegend">
                {segs.map((s) => (
                  <div key={s.key}>
                    <span className="lbl"><span className="sw" style={{ background: s.color }} />{s.label}</span>
                    <span className="val">{fmtMoney(s.value)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {ctx && (
            <Card title="Open on this job" flush>
              <ItemList>
                {openItems.map((o) => (
                  <ItemRow
                    key={o.key}
                    icon={o.icon}
                    tone={o.n > 0 && (o.key === 'cos' || (o.key === 'rfis' && o.n > 5)) ? 'warning' : 'neutral'}
                    title={o.label}
                    href={o.href}
                    value={
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <span className="intelBar" aria-hidden><span style={{ width: `${(o.n / maxOpen) * 100}%` }} /></span>
                        <strong style={{ minWidth: 24, textAlign: 'right', color: 'var(--text-primary)' }}>{o.n}</strong>
                      </span>
                    }
                  />
                ))}
              </ItemList>
            </Card>
          )}

          <Card title="Ask about" flush>
            <ItemList>
              {[...smartQuestions, ...QUICK_QUESTIONS].map((q, i) => (
                <ItemRow
                  key={q}
                  icon={<ChatCircleText size={16} />}
                  tone={i < smartQuestions.length ? 'warning' : 'neutral'}
                  title={q}
                  onClick={() => sendMessage(q)}
                />
              ))}
            </ItemList>
          </Card>

          {ctx && (
            <Card title="Context loaded">
              <Facts items={[
                ['Project', ctx.project?.name || '—'],
                ['Complete', `${Number(ctx.project?.percentComplete) || 0}%`],
                ['Budget lines', String(Number(ctx.budget?.lineCount) || 0)],
                ['Bid packages', String((ctx.bidPackages || []).length)],
                ...(ctx.recent?.lastDailyLogDate
                  ? [['Last daily log', new Date(ctx.recent.lastDailyLogDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })] as [string, string]]
                  : []),
              ]} />
            </Card>
          )}
        </div>
      </div>
    </PageShell>
  );
}

export default function IntelligencePage() {
  return (
    <ErrorBoundary>
      <IntelligenceChat />
    </ErrorBoundary>
  );
}
