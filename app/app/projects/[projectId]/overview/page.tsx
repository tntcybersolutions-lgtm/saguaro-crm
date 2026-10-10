'use client';
/**
 * The job page — Procore's tool list, in the flat look (Chad, 2026-10-10).
 *
 *   job name, one line of address · stage · start or finish
 *   Contract · Billed · Finish, a thin bar once anything is billed
 *   one rule-based sentence about the job, with one thing to do
 *   every tool the job has, grouped, each with its real count or state
 *   then: needs attention · coming up · the job itself (phase, steps,
 *   details, ownership, colour, archive)
 *
 * Data:
 *   /api/projects/[id]        the aggregate — money, RFIs, COs, pay apps,
 *                             schedule, alerts (same SWR key the layout reads)
 *   /api/projects/[id]/tools  one cheap count per tool + the header + today
 *   /api/project-context      the phase steps and the critical-path count
 * Each fails on its own: a tool whose count failed says "—", a section whose
 * source failed says so with a Retry, and the page never goes blank.
 *
 * Wording and rules live in lib/job-page (pure, tested). Nothing here scrolls
 * the page.
 */
import React, { useEffect, useState } from 'react';
import useSWR, { mutate as swrMutate } from 'swr';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Flag, Hash, Calculator, FileText, GridFour, Paragraph, Question, CheckSquareOffset, Folder, Bank,
  PencilSimpleLine, Camera, CalendarBlank, MagnifyingGlass, HardHat, ListChecks, CheckSquare, Money,
  Users, Timer, CurrencyDollar, Receipt, PlusMinus, Signature, Clipboard, NotePencil, Invoice,
  ChartLineUp, IdentificationBadge, UsersThree, ShieldCheck, AddressBook, Stamp, ChatCircle,
  FlagCheckered, Palette, Robot, Brain, Globe, Laptop, ArrowsSplit, Plug, Shield, WifiHigh, Gear,
  Lightning, ChartBar, Broadcast,
} from '@phosphor-icons/react';
import {
  FlatStyles, Brief, SectionLabel, FlatList, Row, RowAction, ToolRow, RowSkeleton, FlatEmpty, type DotColor,
} from '@/components/ui/flat';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { humanError } from '@/lib/errors';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { useProjectContext, refreshProjectContext } from '@/lib/hooks/useProjectContext';
import { stepsForPhase, stepsDone, normalisePhase } from '@/lib/project-phase';
import { isClosedStatus } from '@/lib/project-lifecycle';
import { dayIn, deviceTimeZone } from '@/lib/time-zone';
import type { JobToolsResponse, JobTools } from '@/lib/job-tools';
import {
  jobStage, stageLabel, shortAddress, dateLine, fmtDay, fmtMoneyShort, billedPct, plural, ymd,
  toolList, toolHref, jobBrief, type JobFacts, type ToolRowModel,
} from '@/lib/job-page';
import JobColorPicker from '@/components/project/JobColorPicker';
import ProjectOwnershipCard from '@/components/projects/ProjectOwnershipCard';

/* ── Fetchers ─────────────────────────────────────────────────────────── */

type NotFound = { notFound: true };

/* The project aggregate. 404 is a {notFound} sentinel, not a throw, so "not
   yours / not there" and "did not load" stay different screens. */
const aggregateFetcher = async (url: string) => {
  const auth = await getAuthHeaders();
  const r = await fetch(url, { headers: auth });
  if (r.status === 404) return { notFound: true } as NotFound;
  if (!r.ok) {
    let msg = '';
    try { const body = await r.json(); msg = body?.error || ''; } catch { /* non-JSON body: the status line is all there is */ }
    console.error('load job failed', r.status, msg);
    throw new Error(msg || 'Request failed');
  }
  const d = await r.json();
  if (!d?.project) return { notFound: true } as NotFound;
  return d;
};

const toolsFetcher = async (url: string): Promise<JobToolsResponse | NotFound> => {
  const auth = await getAuthHeaders();
  const r = await fetch(url, { headers: auth });
  if (r.status === 404) return { notFound: true };
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.tools) throw new Error(body?.error || `Request failed (${r.status})`);
  return body as JobToolsResponse;
};

/* ── Icons: one small glyph per tool (lib/job-page TOOLS ids) ─────────── */

const ICONS: Record<string, React.ElementType> = {
  'bid-packages': Flag, takeoff: Hash, estimate: Calculator, proposal: FileText,
  drawings: GridFour, specs: Paragraph, rfis: Question, submittals: CheckSquareOffset, files: Folder, permits: Bank,
  'daily-logs': PencilSimpleLine, photos: Camera, schedule: CalendarBlank, inspections: MagnifyingGlass,
  safety: HardHat, 'punch-list': ListChecks, todos: CheckSquare, 'tm-tickets': Money, crews: Users, timesheets: Timer,
  budget: CurrencyDollar, 'pay-apps': Receipt, 'change-orders': PlusMinus, 'lien-waivers': Signature,
  contracts: Clipboard, 'purchase-orders': NotePencil, invoices: Invoice, bills: FileText, 'cash-flow': ChartLineUp,
  payroll: IdentificationBadge, team: UsersThree, compliance: ShieldCheck, subs: Users, directory: AddressBook,
  insurance: Shield, w9: Stamp, messages: ChatCircle, closeout: FlagCheckered, selections: Palette,
  autopilot: Robot, intelligence: Brain, network: Globe, 'network-devices': Laptop, 'network-vlans': ArrowsSplit,
  'network-cables': Plug, 'network-firewall': Shield, 'network-wifi': WifiHigh, 'network-config': Gear,
  'network-wizard': Lightning, 'network-reports': ChartBar, 'signal-studio': Broadcast,
};

/* ── Small pieces ─────────────────────────────────────────────────────── */

const OPEN_STATUSES = ['open', 'pending', 'submitted', 'in_review', 'draft'];
const titleCase = (x: string) => x.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const sentence = (x: string) => { const t = String(x || '').replace(/_/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : t; };
const usd = (n: number) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

function ToolLine({ m, projectId }: { m: ToolRowModel; projectId: string }) {
  const Icon = ICONS[m.tool.id] || Folder;
  const v = m.value;
  const value = v.loading ? <i className="jx-skel-val" aria-label="Counting" /> : v.text;
  /* data-tour keeps the Help Mode walkthroughs (lib/help-tours projectNav)
     pointing at the tool they open. */
  const slug = m.tool.href.replace(/^.*\//, '');
  return (
    <li data-tour={`project-nav-${slug}`} data-tool={m.tool.id}>
      <ToolRow icon={<Icon size={16} weight="bold" />} label={m.tool.label} value={value} warn={v.warn} href={toolHref(m.tool, projectId)} />
    </li>
  );
}

/** A row that opens and closes the panel under it, in place. */
function Disclosure({ title, meta, open, onToggle, children, id }: { title: string; meta?: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode; id: string }) {
  return (
    <li>
      <button type="button" className="fl-row jx-disc" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="fl-m"><span className="fl-t" style={{ display: 'block' }}>{title}</span>{meta != null && <span className="fl-s" style={{ display: 'block' }}>{meta}</span>}</span>
        <span className="fl-chev jx-chev" aria-hidden="true" data-open={open || undefined}>›</span>
      </button>
      {open && <div id={id} className="jx-panel">{children}</div>}
    </li>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function JobPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const base = '/app/projects/' + projectId;

  const { data: agg, error: aggError, isLoading: aggLoading, mutate: reloadAgg } = useSWR<any>(
    projectId ? '/api/projects/' + projectId : null, aggregateFetcher, { revalidateOnFocus: false, keepPreviousData: true },
  );
  const { data: toolsRes, error: toolsError, isLoading: toolsLoading, mutate: reloadTools } = useSWR<JobToolsResponse | NotFound>(
    projectId ? `/api/projects/${projectId}/tools` : null, toolsFetcher, { revalidateOnFocus: false, keepPreviousData: true },
  );
  const { ctx, error: ctxError, revalidate: reloadCtx } = useProjectContext(projectId);

  const [showMore, setShowMore] = useState(false);
  useEffect(() => { try { setShowMore(localStorage.getItem('sag_all_tools') === '1'); } catch { /* private mode: starts folded */ } }, []);
  const toggleMore = () => setShowMore((v) => { const next = !v; try { localStorage.setItem('sag_all_tools', next ? '1' : '0'); } catch { /* private mode: not remembered */ } return next; });
  const [showAllWork, setShowAllWork] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const flip = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [phaseBusy, setPhaseBusy] = useState(false);
  const [phaseErr, setPhaseErr] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [archiveErr, setArchiveErr] = useState('');

  const notFound = !!(agg as NotFound | undefined)?.notFound || !!(toolsRes as NotFound | undefined)?.notFound;
  const data = agg && !(agg as NotFound).notFound ? agg : null;
  const tr = toolsRes && !(toolsRes as NotFound).notFound ? (toolsRes as JobToolsResponse) : null;
  const p = data?.project ?? tr?.project ?? null;
  const retryAll = () => { void reloadAgg(); void reloadTools(); };

  const css = <><FlatStyles /><style dangerouslySetInnerHTML={{ __html: CSS }} /></>;

  if (notFound) {
    return (
      <div className="jx">{css}
        <header className="jx-head"><h1>Job not found</h1></header>
        <Brief action={{ label: 'All jobs', href: '/app/projects' }}>This job doesn&apos;t exist, or it belongs to another company.</Brief>
      </div>
    );
  }

  if (!p) {
    if ((aggError || !aggLoading) && (toolsError || !toolsLoading) && (aggError || toolsError)) {
      const why = humanError(aggError || toolsError, 'Network error. Check your connection and try again.');
      return (
        <div className="jx" role="alert">{css}
          <header className="jx-head"><h1>Couldn&apos;t load this job</h1></header>
          <Brief action={{ label: 'Retry', onClick: retryAll }}>{why}</Brief>
        </div>
      );
    }
    return <JobSkeleton css={css} />;
  }

  /* ── Facts ── */
  const today = tr?.today || dayIn(deviceTimeZone() || 'UTC');
  const stage = jobStage(p);
  const closed = stage === 'closed';
  const start = ymd(p.start_date);
  const end = ymd(p.end_date);
  /* Money comes from the project-context snapshot: original (the ORIGINAL
     column, a prime contract or an accepted proposal) + approved COs, billed =
     the latest pay app. The aggregate's contractSumToDate starts from
     contract_value, which already includes approved COs on some jobs, and adds
     them again — so it is only the fallback when the snapshot did not load. */
  const cm = ctx?.money as { revisedContract?: unknown; billedToDate?: unknown; originalContract?: unknown; approvedCoTotal?: unknown; payAppCount?: unknown } | undefined;
  const ctxFailed = !ctx && !!ctxError;
  const moneyState: 'ok' | 'loading' | 'failed' = cm || (ctxFailed && data) ? 'ok' : ctxFailed && aggError ? 'failed' : 'loading';
  const contract = cm ? Number(cm.revisedContract) || 0 : Number(data?.project?.contractSumToDate) || 0;
  const billed = cm ? Number(cm.billedToDate) || 0 : Number(data?.project?.totalBilledToDate) || 0;
  const facts: JobFacts = { stage, today, start, end, contract };
  const toolsState: JobTools | 'loading' | 'failed' = tr ? tr.tools : toolsError ? 'failed' : 'loading';
  const list = toolList(toolsState, facts);
  const brief = tr ? jobBrief(tr.tools, facts) : null;
  const when = dateLine(stage, start, end, today);
  const addr = shortAddress(p);
  const pct = billedPct(billed, contract);

  /* Third money figure: the finish date, or how far along when there is none. */
  const pctComplete = Number(data?.project?.percent_complete) || 0;
  const third = end
    ? { value: fmtDay(end, today), label: closed ? 'Finished' : 'Finish' }
    : pctComplete > 0 ? { value: `${Math.round(pctComplete)}%`, label: 'Complete' } : { value: '—', label: 'Finish' };

  /* ── Needs attention: ranked; every row opens what resolves it ── */
  type Attn = { id: string; dot: DotColor; rank: number; title: string; meta: string; href: string; sort?: string | null };
  const attn: Attn[] = [];
  if (data) {
    const rfis = (data.rfis || []) as any[];
    const openRfis = rfis.filter((r) => OPEN_STATUSES.includes(String(r.status || 'open')));
    const overdueRfi = (r: any) => !!ymd(r.due_date) && (ymd(r.due_date) as string) < today;
    const rfiTitle = (r: any) => `RFI${r.rfi_number != null ? ' #' + r.rfi_number : ''}: ${r.subject || r.question || 'Untitled'}`;
    const owner = (r: any) => String(r.ball_in_court || r.assigned_to_name || '').trim() || 'No one assigned';
    for (const a of (data.alerts || []) as any[]) {
      const sev = String(a.severity || '').toLowerCase();
      const crit = sev === 'critical' || sev === 'high';
      attn.push({ id: 'alert:' + a.id, dot: crit ? 'red' : 'grey', rank: crit ? 0 : 4, title: sentence(String(a.title || a.alert_type || 'Autopilot alert')), meta: [a.message, ymd(a.created_at) ? `Flagged ${fmtDay(ymd(a.created_at) as string, today)}` : ''].filter(Boolean).join(' · '), href: `${base}/autopilot`, sort: ymd(a.created_at) });
    }
    const critical = Number(ctx?.schedule?.criticalCount) || 0;
    if (critical > 0 && !closed) attn.push({ id: 'critical', dot: 'red', rank: 0, title: `${plural(critical, 'critical-path task')} open`, meta: 'A slip here moves the finish date', href: `${base}/schedule` });
    for (const r of openRfis.filter(overdueRfi)) {
      attn.push({ id: 'rfi:' + r.id, dot: 'red', rank: 1, title: rfiTitle(r), meta: `${owner(r)} · due ${fmtDay(ymd(r.due_date) as string, today)}`, href: `${base}/rfis`, sort: ymd(r.due_date) });
    }
    const late = ((data.schedulePhases || []) as any[]).filter((t) => !['complete', 'completed'].includes(String(t.status || '')) && !!ymd(t.planned_end) && (ymd(t.planned_end) as string) < today);
    if (stage === 'building' && late.length) attn.push({ id: 'late', dot: 'red', rank: 1, title: `${plural(late.length, 'schedule task')} past the end date`, meta: late.slice(0, 2).map((t) => t.name).join(', ') + (late.length > 2 ? ` and ${late.length - 2} more` : ''), href: `${base}/schedule` });
    const pendingCos = ((data.changeOrders || []) as any[]).filter((c) => OPEN_STATUSES.includes(String(c.status || '')));
    if (pendingCos.length) {
      const total = pendingCos.reduce((s, c) => s + (Number(c.cost_impact ?? c.amount) || 0), 0);
      attn.push({ id: 'cos', dot: 'amber', rank: 2, title: `${plural(pendingCos.length, 'change order')} waiting on a decision`, meta: `${total < 0 ? '−' : ''}${usd(Math.abs(total))} in play`, href: `${base}/change-orders` });
    }
    const pa = ((data.payApps || []) as any[])[0];
    if (stage !== 'bidding' && pa && String(pa.status || '').toLowerCase() === 'draft') attn.push({ id: 'payapp', dot: 'amber', rank: 2, title: `Pay App #${pa.app_number ?? ''} is still a draft`, meta: ymd(pa.period_to) ? `Period to ${fmtDay(ymd(pa.period_to) as string, today)} · not sent` : 'Not sent to the owner', href: `${base}/pay-apps/${pa.id}` });
    for (const r of openRfis.filter((r) => !overdueRfi(r))) {
      attn.push({ id: 'rfi:' + r.id, dot: 'blue', rank: 3, title: rfiTitle(r), meta: `${owner(r)} · ${ymd(r.due_date) ? 'due ' + fmtDay(ymd(r.due_date) as string, today) : 'no due date'}`, href: `${base}/rfis`, sort: ymd(r.due_date) });
    }
  }
  if (tr?.tools.submittals && tr.tools.submittals.open > 0) attn.push({ id: 'subm', dot: 'blue', rank: 3, title: `${plural(tr.tools.submittals.open, 'submittal')} open`, meta: 'Waiting on review or a resubmittal', href: `${base}/submittals` });
  if (tr?.tools.punch && tr.tools.punch.open > 0 && !closed) attn.push({ id: 'punch', dot: 'blue', rank: 3, title: `${plural(tr.tools.punch.open, 'punch item')} open`, meta: tr.tools.punch.total > tr.tools.punch.open ? `${tr.tools.punch.total - tr.tools.punch.open} closed so far` : 'None closed yet', href: `${base}/punch-list` });
  attn.sort((a, b) => a.rank - b.rank || String(a.sort || '9999').localeCompare(String(b.sort || '9999')));
  const attnShown = showAllWork ? attn : attn.slice(0, 5);
  const alertCount = ((data?.alerts || []) as any[]).length;

  /* ── Coming up: open schedule tasks by end date + scheduled inspections ── */
  type Up = { id: string; date: string; title: string; meta: string; href: string };
  const ups: Up[] = [];
  for (const t of (data?.schedulePhases || []) as any[]) {
    const d = ymd(t.planned_end);
    if (!d || d < today || ['complete', 'completed'].includes(String(t.status || ''))) continue;
    ups.push({ id: 'task:' + t.id, date: d, title: t.name || 'Untitled task', meta: `Task due${t.status ? ' · ' + titleCase(String(t.status)) : ''}`, href: `${base}/schedule` });
  }
  for (const i of tr?.tools.inspections?.upcoming || []) ups.push({ id: 'insp:' + i.id, date: i.date, title: i.type, meta: `Inspection${i.inspector ? ' · ' + i.inspector : ''}`, href: `${base}/inspections` });
  ups.sort((a, b) => a.date.localeCompare(b.date));
  const upDay = (d: string) => { const s = fmtDay(d, today, true); return s[0].toUpperCase() + s.slice(1); };

  /* ── Steps (the job's journey) from the project-context snapshot ── */
  const phase = normalisePhase(p.phase);
  const steps = stepsForPhase(phase);
  const done = ctx ? stepsDone(ctx as any, (ctx as any)?.money, isClosedStatus) : null;
  const doneCount = done ? steps.filter((s) => done[s.key]).length : 0;
  const nextStep = done ? steps.find((s) => !done[s.key]) : null;

  async function runAutopilot() {
    setScanning(true); setScanMsg(null);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch('/api/autopilot/run', { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ projectId }) });
      if (!res.ok) throw new Error('Scan failed');
      const json = await res.json();
      setScanMsg({ ok: true, text: json.summary || 'Autopilot scan complete.' });
      await Promise.all([reloadAgg(), reloadTools()]);
    } catch (e) {
      console.error('autopilot scan failed', e);
      setScanMsg({ ok: false, text: 'The scan did not run. Try again.' });
    } finally { setScanning(false); }
  }

  async function switchPhase() {
    const to = phase === 'building' ? 'bidding' : 'building';
    setPhaseBusy(true); setPhaseErr('');
    try {
      const r = await fetch(`/api/projects/${projectId}/phase`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phase: to }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'The phase did not change.');
      await Promise.all([refreshProjectContext(projectId), reloadAgg(), reloadTools(), swrMutate('/api/projects/list')]);
    } catch (e) {
      setPhaseErr(humanError(e, 'The phase did not change. Try again.'));
    } finally { setPhaseBusy(false); }
  }

  async function archive() {
    if (!(await confirmDialog({ title: 'Archive this job?', message: `"${p?.name || 'This job'}" leaves the job list, the pickers and Intelligence. Its records stay and support can restore it.`, danger: true }))) return;
    setArchiving(true); setArchiveErr('');
    try {
      const r = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not archive the job');
      await swrMutate('/api/projects/list');
      router.push('/app/projects');
    } catch (e) {
      setArchiveErr(humanError(e, 'Could not archive the job.'));
      setArchiving(false);
    }
  }

  const pr = data?.project || {};
  const details: [string, string][] = [
    ['Job number', pr.project_number || pr.number || '—'],
    ['Type', pr.project_type ? titleCase(String(pr.project_type)) : '—'],
    ['Owner', pr.owner_entity?.name || pr.owner_name || '—'],
    ['Architect', pr.architect_entity?.name || pr.architect_name || '—'],
    ['Start', start ? fmtDay(start, today) + (start.slice(0, 4) !== today.slice(0, 4) ? `, ${start.slice(0, 4)}` : '') : '—'],
    ['Finish', end ? fmtDay(end, today) + (end.slice(0, 4) !== today.slice(0, 4) ? `, ${end.slice(0, 4)}` : '') : '—'],
    ['State', pr.state || '—'],
    ['GC license', pr.gc_license || '—'],
    ['Prevailing wage', pr.prevailing_wage ? 'Yes' : 'No'],
    ['Public project', pr.is_public_project ? 'Yes' : 'No'],
  ];
  /* Pay apps arrive newest first; each carries the retainage held AS OF that
     app, so the job's retainage is the latest one's — not their sum. */
  const payApps = (data?.payApps || []) as any[];
  const retainage = Number(payApps[0]?.retainage_amount) || 0;
  const paidApps = payApps.filter((a) => String(a.status || '').toLowerCase() === 'paid').length;
  const approvedCos = Number(cm?.approvedCoTotal) || 0;
  const money: [string, string][] = moneyState !== 'ok' ? [] : [
    ['Original contract', usd(cm ? Number(cm.originalContract) || 0 : contract - approvedCos)],
    ['Approved change orders', (approvedCos < 0 ? '−' : '+') + usd(Math.abs(approvedCos))],
    ['Contract to date', usd(contract)],
    ['Billed to date', usd(billed) + (pct != null ? ` (${pct}%)` : '')],
    ['Retainage held', payApps.length ? usd(retainage) : '—'],
    ['Pay apps paid', payApps.length ? `${paidApps} of ${payApps.length}` : 'None yet'],
  ];

  const tools = (
    <section aria-label="Tools">
      {list.groups.map((g) => (
        <div key={g.key}>
          <SectionLabel>{g.label}</SectionLabel>
          <FlatList label={g.label}>{g.rows.map((m) => <ToolLine key={m.tool.id} m={m} projectId={projectId} />)}</FlatList>
        </div>
      ))}
      <SectionLabel action={{ label: showMore ? 'Hide' : `Show ${list.more.length}`, onClick: toggleMore }}>More tools</SectionLabel>
      {showMore
        ? <FlatList label="More tools">{list.more.map((m) => <ToolLine key={m.tool.id} m={m} projectId={projectId} />)}</FlatList>
        : <FlatEmpty>{list.more.slice(0, 4).map((m) => m.tool.label).join(', ')}{list.more.length > 4 ? ` and ${list.more.length - 4} more` : ''}.</FlatEmpty>}
    </section>
  );

  const side = (
    <div className="jx-side">
      {(attn.length > 0 || alertCount > 0 || aggError) && (
        <section aria-label="Needs attention">
          <SectionLabel action={alertCount > 0 ? { label: scanning ? 'Scanning…' : 'Re-scan', onClick: () => { if (!scanning) void runAutopilot(); } } : undefined}>Needs attention</SectionLabel>
          {scanMsg && <p className="jx-note" data-ok={scanMsg.ok || undefined} role="status">{scanMsg.text}</p>}
          {aggError && !data && <Brief action={{ label: 'Retry', onClick: () => { void reloadAgg(); } }}>Couldn&apos;t load RFIs, change orders and pay apps for this list.</Brief>}
          {attn.length > 0 && (
            <FlatList label="Needs attention">
              {attnShown.map((a) => <li key={a.id}><Row dot={a.dot} title={a.title} meta={a.meta} href={a.href} /></li>)}
            </FlatList>
          )}
          {attn.length > 5 && <button type="button" className="jx-more" onClick={() => setShowAllWork((v) => !v)}>{showAllWork ? 'Show fewer' : `Show all ${attn.length}`}</button>}
        </section>
      )}

      <section aria-label="Coming up">
        <SectionLabel action={{ label: 'Schedule', href: `${base}/schedule` }}>Coming up</SectionLabel>
        {!data && !aggError ? <RowSkeleton rows={2} /> : ups.length === 0 ? (
          <FlatEmpty>Nothing scheduled ahead. <Link href={`${base}/schedule`} className="jx-inline">Add to the schedule ›</Link></FlatEmpty>
        ) : (
          <FlatList label="Coming up">
            {ups.slice(0, 5).map((u) => <li key={u.id}><Row title={u.title} meta={u.meta} rightSub={upDay(u.date)} href={u.href} /></li>)}
          </FlatList>
        )}
        {ups.length > 5 && <p className="fl-empty">{ups.length - 5} more on the <Link href={`${base}/schedule`} className="jx-inline">schedule</Link>.</p>}
      </section>

      <section aria-label="The job">
        <SectionLabel>Job</SectionLabel>
        <FlatList label="The job">
          <li>
            {closed ? (
              <Row title={`Phase · ${stageLabel(p)}`} meta="The job is closed out" href={`${base}/closeout`} />
            ) : (
              <Row
                title={`Phase · ${stageLabel(p)}`}
                meta={phase === 'building' ? 'Won — budget, field and billing lead' : 'Chasing it — takeoff, bids and proposal lead'}
                action={<RowAction kind={phase === 'building' ? 'ghost' : 'primary'} busy={phaseBusy} onClick={() => void switchPhase()}>{phaseBusy ? 'Saving…' : phase === 'building' ? 'Back to bidding' : 'We won it'}</RowAction>}
              />
            )}
            {phaseErr && <p className="jx-note" role="alert">{phaseErr}</p>}
          </li>
          <Disclosure id="jx-steps" title={done ? `Steps · ${doneCount} of ${steps.length} done` : 'Steps'} meta={!done ? 'Loading the steps…' : closed ? 'Every step is behind you' : nextStep ? `Next: ${nextStep.title}` : 'Every step is done'} open={!!open.steps} onToggle={() => flip('steps')}>
            {!done ? <p className="fl-empty">Couldn&apos;t read the steps yet. <button type="button" className="jx-inline" onClick={() => { void reloadCtx(); }}>Retry</button></p> : (
              <ul className="jx-sub">
                {steps.map((s) => (
                  <li key={s.key}><Row dot={done[s.key] ? 'green' : s === nextStep ? 'gold' : 'grey'} title={s.title} meta={done[s.key] ? 'Done' : s.desc} href={base + (s.href || '')} /></li>
                ))}
              </ul>
            )}
          </Disclosure>
          <Disclosure id="jx-details" title="Details" meta={[pr.project_number || null, pr.owner_entity?.name || pr.owner_name || null].filter(Boolean).join(' · ') || 'Number, owner, dates, contract and billing'} open={!!open.details} onToggle={() => flip('details')}>
            {!data ? <p className="fl-empty">{aggError ? <>Couldn&apos;t load the details. <button type="button" className="jx-inline" onClick={() => { void reloadAgg(); }}>Retry</button></> : 'Loading…'}</p> : (
              <dl className="jx-dl">
                {[...details, ...money].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
            )}
          </Disclosure>
          <Disclosure id="jx-own" title="Ownership" meta={pr.assigned_to_name ? `Assigned to ${pr.assigned_to_name}` : 'Who runs it, and whose job it is'} open={!!open.own} onToggle={() => flip('own')}>
            {data ? <div className="jx-own"><ProjectOwnershipCard projectId={projectId} project={data.project} onSaved={() => { void reloadAgg(); }} /></div> : <p className="fl-empty">Loading…</p>}
          </Disclosure>
          <Disclosure id="jx-color" title="Job color" meta="The dot beside this job everywhere" open={!!open.color} onToggle={() => flip('color')}>
            <div className="jx-color"><JobColorPicker projectId={projectId} color={pr.color ?? null} onSaved={() => { void reloadAgg(); }} /></div>
          </Disclosure>
          <li>
            <Row
              title="Archive job"
              meta="Off the job list; records stay"
              action={<button type="button" className="fl-act jx-danger" data-k="ghost" disabled={archiving} onClick={() => void archive()}>{archiving ? 'Archiving…' : 'Archive'}</button>}
            />
            {archiveErr && <p className="jx-note" role="alert">{archiveErr}</p>}
          </li>
        </FlatList>
      </section>
    </div>
  );

  return (
    <div className="jx">
      {css}
      <header className="jx-head">
        <h1>{p.name || 'Untitled job'}</h1>
        <p className="jx-sub-line">
          {[addr || null, stageLabel(p)].filter(Boolean).join(' · ')}
          {when && <> · <span data-late={when.late || undefined}>{when.text}</span></>}
        </p>
      </header>

      <div className="jx-money" aria-busy={moneyState === 'loading' || undefined}>
        <div><b>{moneyState === 'ok' ? (contract > 0 ? fmtMoneyShort(contract) : 'Not set') : moneyState === 'failed' ? '—' : <i className="jx-skel-val" />}</b>Contract</div>
        <div><b>{moneyState === 'ok' ? fmtMoneyShort(billed) : moneyState === 'failed' ? '—' : <i className="jx-skel-val" />}</b>Billed{moneyState === 'ok' && billed > 0 && pct != null ? ` · ${pct}%` : ''}</div>
        <div><b>{third.value}</b>{third.label}</div>
      </div>
      {moneyState === 'ok' && billed > 0 && contract > 0 && (
        <div className="jx-bar" role="progressbar" aria-label="Billed of contract" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? 0}><i style={{ width: `${Math.min(100, pct ?? 0)}%` }} /></div>
      )}

      {brief ? (
        <Brief action={{ label: brief.action.label, href: base + brief.action.href }}>
          {brief.parts.map((x, i) => (typeof x === 'string' ? <React.Fragment key={i}>{x}</React.Fragment> : <b key={i}>{x.b}</b>))}
        </Brief>
      ) : toolsError ? (
        <Brief action={{ label: 'Retry', onClick: () => { void reloadTools(); } }}>Couldn&apos;t count this job&apos;s tools, so there is no read on it yet.</Brief>
      ) : (
        <div className="jx-brief-skel" aria-busy="true" aria-label="Reading the job"><i /><i /></div>
      )}

      <div className="jx-cols">
        <div className="jx-main">{tools}</div>
        {side}
      </div>
    </div>
  );
}

/* The shape of the page while the first answer is on its way — never blank. */
function JobSkeleton({ css }: { css: React.ReactNode }) {
  return (
    <div className="jx" aria-busy="true" aria-label="Loading job">
      {css}
      <header className="jx-head"><i className="jx-skel" style={{ width: '70%', height: 20 }} /><i className="jx-skel" style={{ width: '50%', height: 12, marginTop: 10 }} /></header>
      <div className="jx-money"><div><i className="jx-skel-val" />Contract</div><div><i className="jx-skel-val" />Billed</div><div><i className="jx-skel-val" />Finish</div></div>
      <div className="jx-brief-skel"><i /><i /></div>
      <RowSkeleton rows={8} />
    </div>
  );
}

/* Injected with dangerouslySetInnerHTML (tools/check-style-escapes.mjs), so the
   server and client text match. */
const CSS = `
.jx{width:100%;max-width:1240px;box-sizing:border-box;padding:4px 0 32px;color:var(--sg-text);background:var(--bg-base);min-height:calc(100vh - 120px)}
.jx-head{padding:12px 16px 4px}
.jx-head h1{margin:0;font-size:20px !important;font-weight:700;line-height:1.2;color:var(--sg-text);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.jx-sub-line{margin:4px 0 0;font-size:13px;color:var(--sg-text-2);line-height:1.4}
.jx-sub-line [data-late]{color:var(--warning)}
.jx-money{display:flex;gap:18px;padding:10px 16px 10px;font-size:13px;color:var(--sg-text-2)}
.jx-money>div{min-width:0}
.jx-money b{display:block;font-size:16px;font-weight:700;color:var(--sg-text);font-variant-numeric:tabular-nums;white-space:nowrap}
.jx-bar{height:3px;margin:0 16px 12px;background:var(--sg-border);border-radius:2px;overflow:hidden}
.jx-bar i{display:block;height:100%;background:var(--brand-primary)}
.jx .fl-brief{margin-top:2px}
.jx-skel,.jx-skel-val,.jx-brief-skel i{display:block;border-radius:5px;background:var(--sg-border);animation:jx-pulse 1.2s ease-in-out infinite}
.jx-skel-val{display:inline-block;width:44px;height:12px;vertical-align:middle}
.jx-money .jx-skel-val{display:block;height:16px;width:56px;margin-bottom:4px}
.jx-brief-skel{margin:8px 16px 12px;padding:2px 0 2px 12px;border-left:2px solid var(--sg-border)}
.jx-brief-skel i{height:12px;width:92%;margin:4px 0 8px}
.jx-brief-skel i+i{width:60%}
@keyframes jx-pulse{50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.jx-skel,.jx-skel-val,.jx-brief-skel i{animation:none}}
.jx-more{display:flex;align-items:center;min-height:44px;padding:0 16px;background:none;border:0;color:var(--brand-primary);font:inherit;font-size:14px;font-weight:650;cursor:pointer}
.jx-inline{color:var(--brand-primary);font-weight:650;text-decoration:none;background:none;border:0;padding:0;font:inherit;cursor:pointer}
.jx-note{margin:0;padding:6px 16px 10px;font-size:13px;color:var(--danger)}
.jx-note[data-ok]{color:var(--success)}
.jx-disc{background:none}
.jx-chev{transition:transform .15s ease}
.jx-chev[data-open]{transform:rotate(90deg)}
.jx-panel{padding:0 0 8px}
.jx-sub{list-style:none;margin:0;padding:0 0 0 12px}
.jx-sub>li{border-top:1px solid var(--sg-border)}
.jx-dl{margin:0;padding:0 16px}
.jx-dl>div{display:flex;justify-content:space-between;gap:16px;min-height:40px;align-items:center;border-top:1px solid var(--sg-border);font-size:14px}
.jx-dl dt{color:var(--sg-text-2)}
.jx-dl dd{margin:0;color:var(--sg-text);font-weight:600;text-align:right;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;min-width:0}
.jx-own{padding:0 16px}
.jx-own .k-card{background:none !important;border:0 !important;box-shadow:none !important;padding:0 !important;border-radius:0 !important}
.jx-color{padding:6px 16px 10px}
.jx-color [role=radio]{width:36px !important;height:36px !important;position:relative}
.jx-color [role=radio]::after{content:"";position:absolute;inset:-4px}
.jx-danger{color:var(--danger) !important}
.jx [data-tool] .fl-tc{max-width:52vw;overflow:hidden;text-overflow:ellipsis}
@media (pointer:coarse){.jx .fl-sec .fl-sec-act{min-height:44px}}
@media (min-width:1100px){
  .jx{padding:12px 8px 48px}
  .jx-head h1{font-size:22px !important}
  .jx-cols{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:0 40px;align-items:start}
  .jx [data-tool] .fl-tc{max-width:none}
}
`;
