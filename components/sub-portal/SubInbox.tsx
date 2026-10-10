'use client';
/**
 * The GC's inbox for everything subs send in from their portal links:
 * invoices to approve and pay, RFIs to answer, message threads to reply to,
 * daily logs to read, and lien waivers still waiting on a sub's signature.
 *
 * Every row is a real record (GET /api/sub-portal/inbox); every button writes
 * through a tenant-scoped route and the list reloads from the server after it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChatCircleText, CheckCircle, CurrencyDollar, FileText, PaperPlaneTilt, Question, Signature, Notebook, CaretDown, CaretUp } from '@phosphor-icons/react';
import { StatusPill } from '@/components/ui/Status';
import { PremiumEmpty } from '@/components/ui/premium';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { humanError } from '@/lib/errors';
import { groupThreads, usd, sumUsd, type InboxMessage } from '@/lib/sub-inbox';
import { invoiceActions, type SubInvoiceAction } from '@/lib/sub-invoice-status';

type Row = Record<string, any>;
interface Inbox {
  invoices: Row[]; rfis: Row[]; dailyLogs: Row[]; messages: InboxMessage[]; waivers: Row[];
  counts: { invoicesWaiting: number; rfisOpen: number; messagesUnread: number; waiversWaiting: number };
}
type View = 'invoices' | 'rfis' | 'messages' | 'logs' | 'waivers';

const CSS = `
.sbx { display: grid; gap: 16px; min-width: 0; }
.sbx-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.sbx-kpi { text-align: left; min-height: 76px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-primary); cursor: pointer; display: grid; gap: 2px; align-content: start; }
.sbx-kpi[aria-pressed="true"] { border-color: var(--brand-primary); box-shadow: 0 0 0 2px var(--brand-primary-25); }
.sbx-kpi b { font-size: 24px; line-height: 1.1; }
.sbx-kpi span { font-size: 12.5px; color: var(--text-secondary); font-weight: 600; }
.sbx-kpi small { font-size: 12px; color: var(--text-tertiary); }
.sbx-kpi[data-hot="true"] b { color: var(--brand-primary); }
.sbx-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.sbx-bar select, .sbx-bar input { min-height: 44px; font-size: 16px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--border-default); background: var(--bg-surface-2); color: var(--text-primary); min-width: 0; }
.sbx-list { display: grid; gap: 10px; }
.sbx-card { border: 1px solid var(--border-default); background: var(--bg-surface); border-radius: 14px; padding: 14px; display: grid; gap: 10px; min-width: 0; }
.sbx-card[data-hot="true"] { border-color: color-mix(in srgb, var(--brand-primary) 45%, transparent); }
.sbx-head { display: flex; gap: 10px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
.sbx-title { font-weight: 800; font-size: 15.5px; color: var(--text-primary); overflow-wrap: anywhere; }
.sbx-sub { font-size: 13px; color: var(--text-secondary); overflow-wrap: anywhere; }
.sbx-money { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.sbx-money div { background: var(--bg-surface-2); border-radius: 10px; padding: 8px 10px; }
.sbx-money small { display: block; font-size: 11.5px; color: var(--text-tertiary); font-weight: 700; }
.sbx-money b { font-size: 15px; }
.sbx-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.sbx-btn { min-height: 44px; padding: 0 16px; border-radius: 10px; font-weight: 800; font-size: 14px; cursor: pointer; border: 1px solid var(--border-default); background: var(--bg-surface-2); color: var(--text-primary); display: inline-flex; align-items: center; gap: 6px; }
.sbx-btn[data-kind="go"] { background: var(--brand-primary); color: var(--on-brand); border-color: transparent; }
.sbx-btn[data-kind="bad"] { color: var(--c-red); border-color: color-mix(in srgb, var(--c-red) 45%, transparent); }
.sbx-btn:disabled { opacity: .55; cursor: wait; }
.sbx textarea { width: 100%; box-sizing: border-box; min-height: 88px; font-size: 16px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-default); background: var(--bg-surface-2); color: var(--text-primary); resize: vertical; font-family: inherit; }
.sbx-err { color: var(--c-red); font-size: 13px; font-weight: 700; }
.sbx-lines { overflow-x: auto; }
.sbx-lines table { width: 100%; border-collapse: collapse; min-width: 520px; font-size: 13px; }
.sbx-lines th { text-align: left; font-size: 11.5px; color: var(--text-tertiary); padding: 6px 8px; border-bottom: 1px solid var(--border-default); }
.sbx-lines td { padding: 7px 8px; border-bottom: 1px solid var(--border-subtle); }
.sbx-answer { background: color-mix(in srgb, var(--success) 8%, transparent); border: 1px solid color-mix(in srgb, var(--success) 30%, transparent); border-radius: 10px; padding: 10px 12px; font-size: 14px; white-space: pre-wrap; }
.sbx-q { white-space: pre-wrap; font-size: 14px; color: var(--text-primary); }
.sbx-threads { display: grid; grid-template-columns: minmax(240px, 340px) minmax(0, 1fr); gap: 12px; min-height: 420px; }
.sbx-tlist { display: grid; gap: 8px; align-content: start; }
.sbx-titem { text-align: left; border: 1px solid var(--border-default); background: var(--bg-surface); border-radius: 12px; padding: 10px 12px; cursor: pointer; color: var(--text-primary); min-height: 64px; display: grid; gap: 2px; }
.sbx-titem[aria-current="true"] { border-color: var(--brand-primary); }
.sbx-titem .sbx-snip { font-size: 13px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sbx-dot { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--brand-primary); color: var(--on-brand); font-size: 11.5px; font-weight: 800; margin-left: 6px; }
.sbx-chat { border: 1px solid var(--border-default); background: var(--bg-surface); border-radius: 14px; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 420px; max-height: 70vh; min-width: 0; }
.sbx-chat-head { padding: 12px 14px; border-bottom: 1px solid var(--border-default); display: flex; gap: 8px; align-items: center; }
.sbx-chat-body { overflow-y: auto; padding: 12px 14px; display: grid; gap: 8px; align-content: start; }
.sbx-bubble { max-width: 82%; padding: 9px 12px; border-radius: 14px; font-size: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
.sbx-bubble[data-me="true"] { justify-self: end; background: color-mix(in srgb, var(--brand-primary) 18%, transparent); border: 1px solid color-mix(in srgb, var(--brand-primary) 35%, transparent); }
.sbx-bubble[data-me="false"] { justify-self: start; background: var(--bg-surface-2); border: 1px solid var(--border-default); }
.sbx-bubble small { display: block; font-size: 11.5px; color: var(--text-tertiary); margin-top: 3px; }
.sbx-compose { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--border-default); }
.sbx-compose textarea { min-height: 44px; height: 44px; }
.sbx-back { display: none; }
@media (max-width: 900px) {
  .sbx-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sbx-threads { grid-template-columns: minmax(0, 1fr); }
  .sbx-threads[data-open="true"] .sbx-tlist { display: none; }
  .sbx-threads[data-open="false"] .sbx-chat { display: none; }
  .sbx-back { display: inline-flex; }
  .sbx-money { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 420px) { .sbx-money { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
`;

const fmtDay = (d?: string | null) => {
  if (!d) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  const date = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtWhen = (d?: string | null) => {
  if (!d) return '';
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const ACTION_LABEL: Record<SubInvoiceAction, string> = { review: 'Start review', approve: 'Approve', paid: 'Mark paid', reject: 'Send back' };
const WAIVER_LABEL: Record<string, string> = {
  conditional_progress: 'Conditional · progress', unconditional_progress: 'Unconditional · progress',
  conditional_final: 'Conditional · final', unconditional_final: 'Unconditional · final',
};

async function send(url: string, method: string, body: unknown): Promise<Row> {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as Row).error || 'That did not save. Please try again.');
  return j as Row;
}

export default function SubInbox({ onCounts }: { onCounts?: (n: number) => void }) {
  const [data, setData] = useState<Inbox | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('invoices');
  const [job, setJob] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/sub-portal/inbox');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as Row).error || 'Could not load what your subs sent in.');
      setData(j as Inbox); setError('');
    } catch (e) { setError(humanError(e, 'Could not load what your subs sent in.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!data || !onCounts) return;
    const c = data.counts;
    onCounts(c.invoicesWaiting + c.rfisOpen + c.messagesUnread);
  }, [data, onCounts]);

  const jobs = useMemo(() => {
    const m = new Map<string, string>();
    if (data) for (const r of [...data.invoices, ...data.rfis, ...data.dailyLogs, ...data.messages, ...data.waivers] as Row[]) if (r.project_id) m.set(r.project_id, r.project_name || 'Job');
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);
  const keep = useCallback((r: Row) => (!job || r.project_id === job) && (!q.trim() || `${r.sub_name} ${r.project_name} ${r.subject || ''} ${r.content || ''}`.toLowerCase().includes(q.trim().toLowerCase())), [job, q]);

  if (error && !data) return <div className="sbx-card" role="alert"><span className="sbx-err">{error}</span><button className="sbx-btn" onClick={() => void load()}>Retry</button></div>;
  if (!data) return <div className="sbx-card" aria-busy="true">Loading what your subs sent in…</div>;

  const c = data.counts;
  const waitingInv = data.invoices.filter((i) => i.status === 'submitted' || i.status === 'under_review');
  const kpis: Array<{ v: View; n: number; label: string; sub: string; icon: React.ReactNode }> = [
    { v: 'invoices', n: c.invoicesWaiting, label: 'Invoices to review', sub: c.invoicesWaiting ? `${usd(sumUsd(waitingInv, 'net_amount'))} waiting` : 'Nothing waiting', icon: <CurrencyDollar size={16} weight="bold" /> },
    { v: 'rfis', n: c.rfisOpen, label: 'RFIs to answer', sub: c.rfisOpen ? 'Subs are waiting on you' : 'All answered', icon: <Question size={16} weight="bold" /> },
    { v: 'messages', n: c.messagesUnread, label: 'Unread messages', sub: `${groupThreads(data.messages).length} conversation${groupThreads(data.messages).length === 1 ? '' : 's'}`, icon: <ChatCircleText size={16} weight="bold" /> },
    { v: 'waivers', n: c.waiversWaiting, label: 'Waivers to be signed', sub: c.waiversWaiting ? 'Holding payment' : 'None outstanding', icon: <Signature size={16} weight="bold" /> },
  ];

  return (
    <div className="sbx">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sbx-kpis" role="group" aria-label="What needs you">
        {kpis.map((k) => (
          <button key={k.v} type="button" className="sbx-kpi" aria-pressed={view === k.v} data-hot={k.n > 0} onClick={() => setView(k.v)}>
            <span>{k.icon} {k.label}</span><b>{k.n}</b><small>{k.sub}</small>
          </button>
        ))}
      </div>
      <div className="sbx-bar">
        <div role="group" aria-label="Show" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['invoices', 'rfis', 'messages', 'logs', 'waivers'] as View[]).map((v) => (
            <button key={v} type="button" className="sbx-btn" data-kind={view === v ? 'go' : undefined} aria-pressed={view === v} onClick={() => setView(v)}>
              {{ invoices: 'Invoices', rfis: 'RFIs', messages: 'Messages', logs: 'Daily logs', waivers: 'Waivers' }[v]}
            </button>
          ))}
        </div>
        <select aria-label="Job" value={job} onChange={(e) => setJob(e.target.value)} style={{ flex: '1 1 180px' }}>
          <option value="">All jobs</option>
          {jobs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <input aria-label="Search" placeholder="Search sub, job, subject…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: '1 1 200px' }} />
      </div>
      {error && <div className="sbx-err" role="alert">{error}</div>}

      {view === 'invoices' && <Invoices rows={data.invoices.filter(keep)} reload={load} />}
      {view === 'rfis' && <Rfis rows={data.rfis.filter(keep)} reload={load} />}
      {view === 'messages' && <Messages rows={data.messages.filter(keep)} reload={load} />}
      {view === 'logs' && <Logs rows={data.dailyLogs.filter(keep)} />}
      {view === 'waivers' && <Waivers rows={data.waivers.filter(keep)} />}
    </div>
  );
}

function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <PremiumEmpty compact icon={icon} title={title} description={text} />;
}

/* ── Invoices ───────────────────────────────────────────────────────────── */
function Invoices({ rows, reload }: { rows: Row[]; reload: () => Promise<void> }) {
  const order = (r: Row) => ({ submitted: 0, under_review: 1, approved: 2, rejected: 3, paid: 4 } as Record<string, number>)[r.status] ?? 5;
  const sorted = [...rows].sort((a, b) => order(a) - order(b) || String(b.created_at).localeCompare(String(a.created_at)));
  if (!sorted.length) return <Empty icon={<CurrencyDollar size={30} weight="duotone" />} title="No sub invoices yet" text="When a sub submits an invoice from their portal link it lands here to approve, send back or mark paid." />;
  return <div className="sbx-list">{sorted.map((r) => <InvoiceCard key={r.id} r={r} reload={reload} />)}</div>;
}

function InvoiceCard({ r, reload }: { r: Row; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const act = async (action: SubInvoiceAction, note?: string) => {
    if (action === 'approve' || action === 'paid') {
      const ok = await confirmDialog({
        title: action === 'approve' ? `Approve ${usd(r.net_amount ?? r.amount)}?` : `Mark ${usd(r.net_amount ?? r.amount)} paid?`,
        message: action === 'approve'
          ? `${r.sub_name} on ${r.project_name}. They can sign a conditional lien waiver for it in their portal.`
          : `${r.sub_name} on ${r.project_name}. They can then sign the unconditional waiver for this payment.`,
        confirmLabel: ACTION_LABEL[action],
      });
      if (!ok) return;
    }
    setBusy(true); setErr('');
    try { await send(`/api/sub-portal/inbox/invoices/${r.id}`, 'PATCH', { action, note }); setReason(null); await reload(); }
    catch (e) { setErr(humanError(e, "Couldn't update the invoice.")); }
    finally { setBusy(false); }
  };
  const lines = (r.lines || []) as Row[];
  return (
    <article className="sbx-card" data-hot={r.status === 'submitted' || r.status === 'under_review'}>
      <div className="sbx-head">
        <div style={{ minWidth: 0 }}>
          <div className="sbx-title">{r.sub_name}</div>
          <div className="sbx-sub">{r.project_name} · {r.period_from ? `${fmtDay(r.period_from)} – ` : 'through '}{fmtDay(r.period_to)} · filed {fmtDay(r.submitted_at || r.created_at)}</div>
        </div>
        <StatusPill module="sub_invoices" status={r.status} />
      </div>
      <div className="sbx-money">
        <div><small>Requested</small><b>{usd(r.amount)}</b></div>
        <div><small>Retainage</small><b>{usd(r.retainage)}</b></div>
        <div><small>Net due</small><b>{usd(r.net_amount)}</b></div>
      </div>
      {lines.length > 0 && (
        <button type="button" className="sbx-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? <CaretUp size={14} /> : <CaretDown size={14} />} {lines.length} line{lines.length === 1 ? '' : 's'}
        </button>
      )}
      {open && (
        <div className="sbx-lines">
          <table className="k-table">
            <thead><tr><th>Description</th><th>Scheduled</th><th>Previous</th><th>This period</th><th>To date</th><th>%</th><th>Balance</th></tr></thead>
            <tbody>{lines.map((l) => (
              <tr key={l.id}><td>{l.description}</td><td>{usd(l.scheduled_value)}</td><td>{usd(l.prev_completed)}</td><td><b>{usd(l.this_period)}</b></td><td>{usd(l.total_completed)}</td><td>{Number(l.percent_complete || 0).toFixed(0)}%</td><td>{usd(l.balance)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {reason !== null ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <label className="sbx-sub" htmlFor={`why-${r.id}`}>Why is it going back? The sub sees this.</label>
          <textarea id={`why-${r.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Line 3 is billed past 100% — revise and resubmit." />
          <div className="sbx-actions">
            <button type="button" className="sbx-btn" data-kind="bad" disabled={busy || !reason.trim()} onClick={() => void act('reject', reason.trim())}>{busy ? 'Sending…' : 'Send back'}</button>
            <button type="button" className="sbx-btn" disabled={busy} onClick={() => setReason(null)}>Cancel</button>
          </div>
        </div>
      ) : invoiceActions(r.status).length > 0 && (
        <div className="sbx-actions">
          {invoiceActions(r.status).map((a) => (
            <button key={a} type="button" className="sbx-btn" data-kind={a === 'reject' ? 'bad' : a === 'approve' || a === 'paid' ? 'go' : undefined} disabled={busy}
              onClick={() => (a === 'reject' ? setReason('') : void act(a))}>
              {a === 'approve' || a === 'paid' ? <CheckCircle size={16} weight="bold" /> : null}{ACTION_LABEL[a]}
            </button>
          ))}
        </div>
      )}
      {err && <div className="sbx-err" role="alert">{err}</div>}
    </article>
  );
}

/* ── RFIs ───────────────────────────────────────────────────────────────── */
function Rfis({ rows, reload }: { rows: Row[]; reload: () => Promise<void> }) {
  const sorted = [...rows].sort((a, b) => Number(!!a.answer) - Number(!!b.answer) || String(b.created_at).localeCompare(String(a.created_at)));
  if (!sorted.length) return <Empty icon={<Question size={30} weight="duotone" />} title="No RFIs from subs" text="Questions subs send from their portal land here. Your answer shows on their RFIs tab." />;
  return <div className="sbx-list">{sorted.map((r) => <RfiCard key={r.id} r={r} reload={reload} />)}</div>;
}

function RfiCard({ r, reload }: { r: Row; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState<string | null>(r.answer ? null : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    if (!draft?.trim()) { setErr('Type the answer first.'); return; }
    setBusy(true); setErr('');
    try { await send(`/api/sub-portal/inbox/rfis/${r.id}`, 'PATCH', { answer: draft.trim() }); setDraft(null); await reload(); }
    catch (e) { setErr(humanError(e, "Couldn't save the answer.")); }
    finally { setBusy(false); }
  };
  return (
    <article className="sbx-card" data-hot={!r.answer}>
      <div className="sbx-head">
        <div style={{ minWidth: 0 }}>
          <div className="sbx-title">{r.subject}</div>
          <div className="sbx-sub">{r.sub_name} · {r.project_name} · asked {fmtWhen(r.submitted_at || r.created_at)}</div>
        </div>
        <StatusPill module="rfis" status={r.answer ? (r.status === 'closed' ? 'closed' : 'answered') : 'submitted'} />
      </div>
      <div className="sbx-q">{r.question}</div>
      {r.answer && draft === null && (
        <>
          <div className="sbx-answer"><b>Your answer</b> · {fmtWhen(r.answered_at)}{'\n'}{r.answer}</div>
          <div className="sbx-actions"><button type="button" className="sbx-btn" onClick={() => setDraft(r.answer)}>Edit answer</button></div>
        </>
      )}
      {draft !== null && (
        <div style={{ display: 'grid', gap: 8 }}>
          <label className="sbx-sub" htmlFor={`ans-${r.id}`}>Your answer — the sub sees it on their RFIs tab</label>
          <textarea id={`ans-${r.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Answer the question, cite the sheet or spec if it helps." />
          <div className="sbx-actions">
            <button type="button" className="sbx-btn" data-kind="go" disabled={busy} onClick={() => void save()}><PaperPlaneTilt size={16} weight="bold" />{busy ? 'Sending…' : r.answer ? 'Save answer' : 'Send answer'}</button>
            {r.answer && <button type="button" className="sbx-btn" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>}
          </div>
        </div>
      )}
      {err && <div className="sbx-err" role="alert">{err}</div>}
    </article>
  );
}

/* ── Messages ───────────────────────────────────────────────────────────── */
function Messages({ rows, reload }: { rows: InboxMessage[]; reload: () => Promise<void> }) {
  const threads = useMemo(() => groupThreads(rows), [rows]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const thread = threads.find((t) => t.key === openKey) || null;

  // Opening a thread marks the sub's messages in it read.
  useEffect(() => {
    if (!thread) return;
    const unread = thread.messages.filter((m) => m.sender_type === 'sub' && !m.read_at).map((m) => m.id);
    if (unread.length) void send('/api/sub-portal/inbox/messages', 'PATCH', { ids: unread }).then(() => reload()).catch((e) => console.error('[sub-inbox] mark read', e));
    requestAnimationFrame(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; });
  }, [thread?.key, thread?.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const reply = async () => {
    if (!thread || !draft.trim()) return;
    if (!thread.projectId || !thread.subId) { setErr('This conversation has no job or sub on it, so a reply has nowhere to go.'); return; }
    setBusy(true); setErr('');
    try { await send('/api/sub-portal/inbox/messages', 'POST', { projectId: thread.projectId, subId: thread.subId, content: draft.trim() }); setDraft(''); await reload(); }
    catch (e) { setErr(humanError(e, "Couldn't send the message.")); }
    finally { setBusy(false); }
  };

  if (!threads.length) return <Empty icon={<ChatCircleText size={30} weight="duotone" />} title="No messages from subs" text="Messages subs send from their portal land here, one conversation per sub per job. Your replies show in their portal." />;
  return (
    <div className="sbx-threads" data-open={!!thread}>
      <div className="sbx-tlist" role="list" aria-label="Conversations">
        {threads.map((t) => (
          <button key={t.key} role="listitem" type="button" className="sbx-titem" aria-current={t.key === openKey} onClick={() => { setOpenKey(t.key); setErr(''); }}>
            <span style={{ fontWeight: 800 }}>{t.subName}{t.unread > 0 && <span className="sbx-dot" aria-label={`${t.unread} unread`}>{t.unread}</span>}</span>
            <span className="sbx-sub">{t.projectName} · {fmtWhen(t.last.created_at)}</span>
            <span className="sbx-snip">{t.last.sender_type === 'sub' ? '' : 'You: '}{t.last.content}</span>
          </button>
        ))}
      </div>
      <section className="sbx-chat" aria-label="Conversation">
        {thread ? (
          <>
            <div className="sbx-chat-head">
              <button type="button" className="sbx-btn sbx-back" aria-label="Back to conversations" onClick={() => setOpenKey(null)}><ArrowLeft size={16} weight="bold" /></button>
              <div style={{ minWidth: 0 }}><div className="sbx-title">{thread.subName}</div><div className="sbx-sub">{thread.projectName}</div></div>
            </div>
            <div className="sbx-chat-body" ref={bodyRef}>
              {thread.messages.map((m) => (
                <div key={m.id} className="sbx-bubble" data-me={m.sender_type !== 'sub'}>
                  {m.content}<small>{m.sender_name || (m.sender_type === 'sub' ? thread.subName : 'You')} · {fmtWhen(m.created_at)}</small>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid' }}>
              {err && <div className="sbx-err" role="alert" style={{ padding: '6px 12px 0' }}>{err}</div>}
              <div className="sbx-compose">
                <textarea aria-label="Reply" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Reply to ${thread.subName}…`}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void reply(); } }} />
                <button type="button" className="sbx-btn" data-kind="go" disabled={busy || !draft.trim()} onClick={() => void reply()} aria-label="Send"><PaperPlaneTilt size={18} weight="bold" /></button>
              </div>
            </div>
          </>
        ) : (
          <div className="sbx-sub" style={{ padding: 20, alignSelf: 'center', justifySelf: 'center' }}>Pick a conversation.</div>
        )}
      </section>
    </div>
  );
}

/* ── Daily logs ─────────────────────────────────────────────────────────── */
function Logs({ rows }: { rows: Row[] }) {
  if (!rows.length) return <Empty icon={<Notebook size={30} weight="duotone" />} title="No daily logs from subs" text="Daily logs subs file from their portal land here — crew, hours and work done." />;
  return (
    <div className="sbx-list">
      {rows.map((r) => (
        <article key={r.id} className="sbx-card">
          <div className="sbx-head">
            <div style={{ minWidth: 0 }}><div className="sbx-title">{r.sub_name}</div><div className="sbx-sub">{r.project_name} · {fmtDay(r.log_date)}</div></div>
            <div className="sbx-sub">{r.crew_count != null ? `${r.crew_count} crew` : ''}{r.hours != null ? ` · ${Number(r.hours)} h` : ''}</div>
          </div>
          {r.work_performed && <div className="sbx-q">{r.work_performed}</div>}
          {r.delays && <div className="sbx-sub"><b>Delays:</b> {r.delays}</div>}
          {r.materials_used && <div className="sbx-sub"><b>Materials:</b> {r.materials_used}</div>}
          {r.notes && <div className="sbx-sub" style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</div>}
        </article>
      ))}
    </div>
  );
}

/* ── Waivers waiting on subs ────────────────────────────────────────────── */
function Waivers({ rows }: { rows: Row[] }) {
  if (!rows.length) return <Empty icon={<FileText size={30} weight="duotone" />} title="No waivers waiting on subs" text="Lien waivers a sub still has to sign show here. Subs sign them in their portal." />;
  return (
    <div className="sbx-list">
      {rows.map((r) => (
        <article key={r.id} className="sbx-card" data-hot>
          <div className="sbx-head">
            <div style={{ minWidth: 0 }}>
              <div className="sbx-title">{r.sub_name}</div>
              <div className="sbx-sub">{r.project_name} · {WAIVER_LABEL[r.waiver_type] || 'Lien waiver'} · {usd(r.amount)}{r.through_date ? ` through ${fmtDay(r.through_date)}` : ''}</div>
            </div>
            <StatusPill module="lien_waivers" status={r.status} />
          </div>
          <div className="sbx-actions">
            <a className="sbx-btn" href={`/app/projects/${r.project_id}/lien-waivers`} style={{ textDecoration: 'none' }}>Open the job&apos;s lien waivers</a>
          </div>
        </article>
      ))}
    </div>
  );
}
