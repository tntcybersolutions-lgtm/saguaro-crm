'use client';
/**
 * Project Intelligence — cross-project comparison, Pass 4 on the kit.
 *
 * Anatomy: title + one primary action (Select Projects) → the live suggestion
 * ticker → Portfolio Insights (the honest sentences, severity first) → one
 * comparison card per selected project (health ring, cost burn vs schedule,
 * money, field signals) → StatRow of portfolio totals summed over the projects
 * that actually report each figure.
 *
 * Reads (unchanged): useProjects for the roster, SWR on
 * /api/intelligence/summary?projectIds= for the comparison set. Every figure
 * is real or absent — `null` renders as an em-dash, never a fake zero.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Lightbulb, SquaresFour, Selection, ArrowsClockwise, Robot, Check } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, EmptyState, Toast, useToast,
  type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { InsightRow } from '@/components/ui/premium';
import { useProjects } from '@/lib/hooks/useProjects';
import SuggestionTicker from '@/components/intelligence/SuggestionTicker';

// ─── Honest number handling ──────────────────────────────────────────────────
// NUMERIC columns round-trip as strings; Number() ALWAYS. `null` means "the
// API genuinely didn't have this figure" and renders as an em-dash + note —
// never a fake zero.
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n: number) => money.format(n);

// Local date-only parsing — never new Date('YYYY-MM-DD') (UTC shift). Full
// timestamps go through Date directly; bare dates parse as local midnight.
function daysAgo(iso?: string | null): number | null {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (isNaN(d.getTime())) return null;
  const mid = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.max(0, Math.round((mid(new Date()) - mid(d)) / 86400000));
}

// ─── Health grading ──────────────────────────────────────────────────────────
// Verdict bands over the server's 0–100 healthScore: >=85 Excellent, >=70
// Healthy (both green), >=50 Watch (amber), <50 At Risk (red). No score ⇒ no
// verdict — the ring stays empty rather than pretending.
function healthGrade(score: number | null): { color: string; verdict: string; tone: BadgeTone } {
  if (score == null) return { color: 'var(--text-tertiary)', verdict: 'No Score', tone: 'neutral' };
  if (score >= 85) return { color: 'var(--status-ongoing)', verdict: 'Excellent', tone: 'ongoing' };
  if (score >= 70) return { color: 'var(--status-ongoing)', verdict: 'Healthy', tone: 'ongoing' };
  if (score >= 50) return { color: 'var(--status-under-contract)', verdict: 'Watch', tone: 'under_contract' };
  return { color: 'var(--status-overdue)', verdict: 'At Risk', tone: 'overdue' };
}

// healthComponents arrives in whatever shape the server settles on — tolerate
// an array of {label,score,note}-ish entries or a plain record, and flatten to
// tooltip lines.
function componentLines(hc: unknown): string[] {
  if (!hc) return [];
  if (Array.isArray(hc)) {
    return hc.map((c: any) => {
      if (c == null) return '';
      if (typeof c === 'string') return c;
      if (typeof c !== 'object') return String(c);
      const label = c.label ?? c.name ?? c.key ?? '';
      const val = c.score ?? c.value ?? c.pts ?? c.points;
      const note = c.note ?? c.text ?? c.detail ?? '';
      return [label, val != null ? String(val) : '', note].filter(Boolean).join(' — ');
    }).filter(Boolean);
  }
  if (typeof hc === 'object') {
    return Object.entries(hc as Record<string, unknown>).map(([k, v]) =>
      `${k}: ${v != null && typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  }
  return [];
}

// ─── Insight severity ────────────────────────────────────────────────────────
const SEV_RED = ['red', 'critical', 'high', 'severe', 'danger', 'error'];
const SEV_AMBER = ['amber', 'yellow', 'warn', 'warning', 'medium', 'moderate', 'caution'];
function sevRail(s?: string): { tone: 'late' | 'warn' | 'info'; rank: number } {
  const k = String(s || '').toLowerCase();
  if (SEV_RED.includes(k)) return { tone: 'late', rank: 0 };
  if (SEV_AMBER.includes(k)) return { tone: 'warn', rank: 1 };
  return { tone: 'info', rank: 2 };
}

// ─── API shapes (every key optional — the page tolerates partial payloads) ───
interface SummaryProject {
  /* /api/intelligence/summary returns these FLAT — { projectId, name, status,
     money, … }. The nested shape is kept as a fallback in case an older
     payload is ever served. */
  projectId?: string;
  name?: string;
  status?: string;
  project?: { id?: string; name?: string; status?: string };
  money?: {
    contract?: unknown; billedToDate?: unknown; invoicedCosts?: unknown;
    approvedCOs?: { value?: unknown; count?: unknown }; margin?: unknown;
  };
  schedule?: { expectedBurnPct?: unknown; actualBurnPct?: unknown };
  burnDelta?: unknown;
  field?: {
    openRfis?: unknown; oldestRfiDays?: unknown; openPunch?: unknown;
    dailyLogStreak?: unknown; lastActivityAt?: string | null;
  };
  healthScore?: unknown;
  healthComponents?: unknown;
}
interface Insight { severity?: string; projectId?: string; text?: string }
interface SummaryResponse { projects?: SummaryProject[]; totals?: unknown; insights?: Insight[] }

interface Row {
  id: string; name: string; status: string | null;
  contract: number | null; billed: number | null; invoiced: number | null;
  coValue: number | null; coCount: number | null; margin: number | null;
  expected: number | null; actual: number | null; delta: number | null;
  openRfis: number | null; oldestRfiDays: number | null; openPunch: number | null;
  logStreak: number | null; lastActivityDays: number | null;
  health: number | null; components: string[];
}

function deriveRow(sp: SummaryProject, fallbackName?: string): Row {
  const expected = num(sp.schedule?.expectedBurnPct);
  const actual = num(sp.schedule?.actualBurnPct);
  // burnDelta = actualBurnPct − expectedBurnPct (billing pace vs calendar
  // pace); positive = billed ahead of the calendar. Server figure wins; when
  // absent we derive it only if BOTH sides are real.
  const delta = num(sp.burnDelta) ?? (actual != null && expected != null ? actual - expected : null);
  return {
    id: String(sp.projectId ?? sp.project?.id ?? ''),
    name: sp.name || sp.project?.name || fallbackName || 'Untitled Project',
    status: sp.status ?? sp.project?.status ?? null,
    contract: num(sp.money?.contract),
    billed: num(sp.money?.billedToDate),
    invoiced: num(sp.money?.invoicedCosts),
    coValue: num(sp.money?.approvedCOs?.value),
    coCount: num(sp.money?.approvedCOs?.count),
    margin: num(sp.money?.margin),
    expected, actual, delta,
    openRfis: num(sp.field?.openRfis),
    oldestRfiDays: num(sp.field?.oldestRfiDays),
    openPunch: num(sp.field?.openPunch),
    logStreak: num(sp.field?.dailyLogStreak),
    lastActivityDays: daysAgo(sp.field?.lastActivityAt),
    health: num(sp.healthScore),
    components: componentLines(sp.healthComponents),
  };
}

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
};

const CSS = `
.igWs > .k-page { max-width: none; }
.igActions { position: relative; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.igPop { position: absolute; top: 100%; right: 0; margin-top: 8px; z-index: 100; width: min(360px, calc(100vw - 32px)); max-height: 420px; overflow-y: auto; background: var(--bg-solid); border: 1px solid var(--border-strong); border-radius: var(--radius-md); padding: 10px; box-shadow: 0 24px 60px -20px rgba(0,0,0,.8); }
.igPopHead { font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); padding: 4px 8px 8px; }
.igOpt { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--radius-sm); cursor: pointer; min-height: 44px; }
.igOpt:hover { background: rgba(255,255,255,0.05); }
.igOpt[data-on="true"] { background: var(--brand-primary-08); }
.igOpt input { accent-color: var(--brand-primary); width: 16px; height: 16px; flex-shrink: 0; }
.igOptName { font-size: var(--fs-sm); color: var(--text-primary); font-weight: 600; }
.igOptSub { font-size: var(--fs-xs); color: var(--text-tertiary); }
.igStack { display: flex; flex-direction: column; gap: 16px; }
.igInsights { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; }
.igInsight { position: relative; overflow: hidden; background: var(--bg-surface-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 12px 14px 12px 18px; }
.igInsight::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--border-strong); }
.igInsight[data-tone="late"]::before { background: var(--status-overdue); }
.igInsight[data-tone="warn"]::before { background: var(--status-under-contract); }
.igInsightProj { font-size: var(--fs-xs); font-weight: 800; color: var(--text-tertiary); margin-bottom: 4px; }
.igInsightText { font-size: var(--fs-sm); color: var(--text-primary); line-height: 1.5; }
.igGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
.igHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; margin-bottom: 14px; }
.igName { font-size: var(--fs-lg); font-weight: 800; color: var(--text-primary); text-decoration: none; letter-spacing: -0.01em; }
.igName:hover { color: var(--link); }
.igRing { text-align: center; flex-shrink: 0; cursor: help; }
.igRingWrap { position: relative; width: 64px; height: 64px; margin: 0 auto; }
.igRingVal { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }
.igRingVerdict { font-size: 12px; font-weight: 800; margin-top: 4px; }
.igBurnHead { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 6px; font-size: var(--fs-xs); }
.igBurnHead b { color: var(--text-tertiary); font-weight: 700; }
.igBurnDelta { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
.igBurnDelta[data-ahead="true"] { color: var(--status-ongoing); }
.igBurnDelta[data-ahead="false"] { color: var(--status-overdue); }
.igBurnTrack { position: relative; height: 12px; }
.igBurnBg { position: absolute; inset: 0; background: rgba(255,255,255,0.08); border-radius: 6px; overflow: hidden; }
.igBurnFill { height: 100%; border-radius: 6px; background: var(--chart-1); }
.igBurnMark { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--text-primary); opacity: .9; border-radius: 1px; box-shadow: 0 0 6px rgba(255,255,255,.55); }
.igBurnFoot { display: flex; justify-content: space-between; margin-top: 5px; font-size: var(--fs-xs); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.igRule { font-size: var(--fs-xs); color: var(--text-tertiary); font-weight: 800; margin: 14px 0 4px; padding-top: 12px; border-top: 1px solid var(--border-subtle); }
.igPills { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 4px; }
.igSkel { border-radius: var(--radius-md); background: var(--bg-surface); border: 1px solid var(--glass-border); padding: 18px 20px; }
.igSkel div { border-radius: 6px; background: rgba(255,255,255,0.06); }
.igSection { display: flex; align-items: center; gap: 8px; font-size: var(--fs-xs); font-weight: 800; color: var(--text-tertiary); }
.igMuted { color: var(--text-tertiary); }
@media (max-width: 640px) {
  .igWs .k-btn, .igWs .k-stat { min-height: 44px; }
  .igGrid { grid-template-columns: minmax(0, 1fr); }
}
`;

// ─── Health ring — color-graded score dial with a component tooltip ──────────
function HealthRing({ score, components }: { score: number | null; components: string[] }) {
  const g = healthGrade(score);
  const R = 26, C = 2 * Math.PI * R;
  const frac = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const tip = components.length
    ? `Health components:\n${components.join('\n')}`
    : score != null ? 'No component breakdown provided' : 'No health score for this project yet';
  return (
    <div title={tip} className="igRing">
      <div className="igRingWrap">
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="6" />
          {score != null && (
            <circle cx="32" cy="32" r={R} fill="none" style={{ stroke: g.color }} strokeWidth="6" strokeDasharray={`${frac * C} ${C}`} strokeLinecap="round" transform="rotate(-90 32 32)" />
          )}
        </svg>
        <div className="igRingVal" style={{ color: g.color }}>{score == null ? '—' : Math.round(score)}</div>
      </div>
      <div className="igRingVerdict" style={{ color: g.color }}>{g.verdict}</div>
    </div>
  );
}

// ─── Burn bar — actual fill with the expected pace as a hairline marker ──────
function BurnBar({ actual, expected, delta }: { actual: number | null; expected: number | null; delta: number | null }) {
  // Fills cap at 100% visually; the labels keep the real figure.
  const aw = actual == null ? 0 : Math.max(0, Math.min(actual, 100));
  const ew = expected == null ? null : Math.max(0, Math.min(expected, 100));
  const ahead = delta != null && delta >= 0;
  return (
    <div>
      <div className="igBurnHead">
        {/* This plots actualBurnPct, which is invoicedCosts / contract — what
            has been SPENT, not what has been billed to the owner. */}
        <b>Cost Burn vs Schedule</b>
        {delta != null
          ? <span className="igBurnDelta" data-ahead={ahead ? 'true' : 'false'}>{ahead ? '+' : '-'}{Math.abs(delta).toFixed(1)} pts {ahead ? 'ahead' : 'behind'}</span>
          : <span className="igMuted" style={{ whiteSpace: 'nowrap' }}>No schedule dates</span>}
      </div>
      <div className="igBurnTrack">
        <div className="igBurnBg">{actual != null && <div className="igBurnFill" style={{ width: `${aw}%` }} />}</div>
        {ew != null && <div className="igBurnMark" title={`Expected ${expected!.toFixed(1)}% burned by today (share of schedule elapsed)`} style={{ left: `calc(${ew}% - 1px)` }} />}
      </div>
      <div className="igBurnFoot">
        <span>Actual {actual == null ? '— no billing data' : `${actual.toFixed(1)}%`}</span>
        <span>Expected {expected == null ? '—' : `${expected.toFixed(1)}%`}</span>
      </div>
    </div>
  );
}

// Money row — value bright when real, em-dash when the API had nothing.
function moneyVal(v: number | null, suffix?: React.ReactNode): { value: React.ReactNode; accent?: string } {
  if (v == null) return { value: '—', accent: 'var(--text-tertiary)' };
  return { value: <>{fmt(v)}{suffix}</>, accent: 'var(--brand-primary)' };
}

// ─── Per-project comparison card ─────────────────────────────────────────────
function ProjectCard({ r }: { r: Row }) {
  const co = moneyVal(r.coValue, r.coCount != null ? <span className="igMuted" style={{ fontWeight: 600, fontSize: 'var(--fs-xs)' }}> ({r.coCount})</span> : undefined);
  const marginAccent = r.margin == null ? 'var(--text-tertiary)' : r.margin < 0 ? 'var(--status-overdue)' : 'var(--brand-primary)';
  // Overdue = the oldest open RFI has aged past 14 days — that age reads red.
  const rfiOverdue = r.openRfis != null && r.openRfis > 0 && r.oldestRfiDays != null && r.oldestRfiDays > 14;
  const noField = r.openRfis == null && r.openPunch == null && r.logStreak == null && r.lastActivityDays == null;
  const g = healthGrade(r.health);
  return (
    <Card>
      <div className="igHead">
        <div style={{ minWidth: 0 }}>
          <Link href={`/app/projects/${r.id}`} className="igName">{r.name}</Link>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {r.status
              ? <Badge tone={r.status === 'active' ? 'ongoing' : 'neutral'}>{r.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>
              : <span className="igMuted" style={{ fontSize: 'var(--fs-xs)' }}>Status unknown</span>}
            <Badge tone={g.tone}>{g.verdict}</Badge>
          </div>
        </div>
        <HealthRing score={r.health} components={r.components} />
      </div>

      <BurnBar actual={r.actual} expected={r.expected} delta={r.delta} />

      <div className="igRule">Money</div>
      <InsightRow label="Contract" {...moneyVal(r.contract)} />
      <InsightRow label="Billed to Date" {...moneyVal(r.billed)} />
      <InsightRow label="Invoiced Costs" {...moneyVal(r.invoiced)} />
      <InsightRow label="Approved COs" value={co.value} accent={co.accent} />
      <InsightRow label="Margin" value={r.margin == null ? '—' : fmt(r.margin)} accent={marginAccent} strong />

      <div className="igRule">Field</div>
      {noField ? (
        <div className="igMuted" style={{ fontSize: 'var(--fs-xs)', padding: '4px 0' }}>— No field telemetry yet</div>
      ) : (
        <div className="igPills">
          {r.openRfis != null && (
            <Badge tone={rfiOverdue ? 'overdue' : r.openRfis > 0 ? 'under_contract' : 'ongoing'}>
              {r.openRfis} Open RFI{r.openRfis === 1 ? '' : 's'}{r.openRfis > 0 && r.oldestRfiDays != null ? ` · Oldest ${r.oldestRfiDays}d` : ''}
            </Badge>
          )}
          {r.openPunch != null && <Badge tone={r.openPunch > 0 ? 'under_contract' : 'ongoing'}>{r.openPunch} Punch Open</Badge>}
          {r.logStreak != null && <Badge tone={r.logStreak >= 3 ? 'ongoing' : 'neutral'}>{r.logStreak}d Log Streak</Badge>}
          {r.lastActivityDays != null && <Badge tone="neutral">{r.lastActivityDays === 0 ? 'Active Today' : `Active ${r.lastActivityDays}d Ago`}</Badge>}
        </div>
      )}
    </Card>
  );
}

// Grid-shaped loading skeleton — same card silhouette as ProjectCard.
function GridSkeleton({ count }: { count: number }) {
  return (
    <div className="igGrid" aria-busy="true" aria-label="Loading comparison">
      {Array.from({ length: Math.max(count, 1) }).map((_, i) => (
        <div key={i} className="igSkel">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18, background: 'none' }}>
            <div style={{ width: 150, height: 16 }} />
            <div style={{ width: 64, height: 64, borderRadius: 32 }} />
          </div>
          <div style={{ height: 12, marginBottom: 16 }} />
          {[0, 1, 2, 3].map((k) => <div key={k} style={{ height: 11, marginBottom: 10, maxWidth: `${80 - k * 8}%` }} />)}
        </div>
      ))}
    </div>
  );
}

export default function IntelligencePage() {
  const { projects: liveProjects, loading } = useProjects();
  // Archived projects never enter the comparison set.
  const projects = useMemo(() => liveProjects.filter((p) => p.status !== 'archived'), [liveProjects]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectorOpen, setSelectorOpen] = useState(false);
  const { toast, show } = useToast(3000);
  const popRef = useRef<HTMLDivElement>(null);

  // Auto-select the first 3 projects once the (cached) list is in.
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current || projects.length === 0) return;
    autoSelectedRef.current = true;
    setSelectedIds(new Set(projects.slice(0, 3).map((p) => p.id)));
  }, [projects]);

  // Close the picker on outside click / Escape.
  useEffect(() => {
    if (!selectorOpen) return;
    const onDown = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setSelectorOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectorOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [selectorOpen]);

  const ids = useMemo(() => Array.from(selectedIds).sort(), [selectedIds]);
  const { data, error, isLoading, mutate } = useSWR<SummaryResponse>(
    ids.length > 0 ? `/api/intelligence/summary?projectIds=${ids.join(',')}` : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    for (const sp of data?.projects ?? []) {
      const id = sp.projectId ?? sp.project?.id;
      const nm = sp.name ?? sp.project?.name;
      if (id && nm) m.set(String(id), nm);
    }
    return m;
  }, [projects, data]);

  const rows = useMemo(
    () => (data?.projects ?? []).map((sp) => {
      const id = sp.projectId ?? sp.project?.id;
      return deriveRow(sp, id ? nameOf.get(String(id)) : undefined);
    }),
    [data, nameOf],
  );
  const insights = useMemo(() => {
    const list = Array.isArray(data?.insights) ? data!.insights! : [];
    return list.filter((i) => i && i.text).sort((a, b) => sevRail(a.severity).rank - sevRail(b.severity).rank);
  }, [data]);

  const summaryLoading = ids.length > 0 && isLoading && rows.length === 0;

  function toggleProject(pid: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
      } else {
        if (next.size >= 5) { show('Compare up to 5 projects at a time.', 'bad'); return prev; } // max 5
        next.add(pid);
      }
      return next;
    });
  }

  // Portfolio roll-up — real sums over the projects that actually report the
  // figure. `n` says how many contributed; zero contributors renders em-dash.
  const sum = (get: (r: Row) => number | null): { total: number; n: number } => {
    let total = 0, n = 0;
    for (const r of rows) { const v = get(r); if (v != null) { total += v; n++; } }
    return { total, n };
  };
  const tContract = sum((r) => r.contract);
  const tBilled = sum((r) => r.billed);
  const tInvoiced = sum((r) => r.invoiced);
  const tCO = sum((r) => r.coValue);
  const tCOCount = sum((r) => r.coCount);
  const tMargin = sum((r) => r.margin);
  const tRfi = sum((r) => r.openRfis);
  const tPunch = sum((r) => r.openPunch);
  const coverage = (s: { n: number }) => s.n === rows.length ? `Across ${rows.length} project${rows.length === 1 ? '' : 's'}` : `${s.n} of ${rows.length} reporting`;
  const moneyStat = (label: string, s: { total: number; n: number }, sub?: string): StatItem =>
    s.n > 0 ? { label, value: fmt(s.total), sub: sub ?? coverage(s) } : { label, value: '—', sub: 'No data yet' };

  const totals: StatItem[] = [
    moneyStat('Combined Contract', tContract),
    moneyStat('Billed to Date', tBilled, tContract.n > 0 && tContract.total > 0 && tBilled.n > 0 ? `${((tBilled.total / tContract.total) * 100).toFixed(1)}% of combined contract` : undefined),
    moneyStat('Invoiced Costs', tInvoiced),
    moneyStat('Approved COs', tCO, tCOCount.n > 0 ? `${tCOCount.total} approved change order${tCOCount.total === 1 ? '' : 's'}` : undefined),
    tMargin.n > 0 ? { label: 'Portfolio Margin', value: fmt(tMargin.total), sub: coverage(tMargin), tone: tMargin.total < 0 ? 'bad' : 'good' } : { label: 'Portfolio Margin', value: '—', sub: 'No data yet' },
    tRfi.n > 0 ? { label: 'Open RFIs', value: tRfi.total, sub: tRfi.total > 0 ? 'Awaiting answers' : 'All answered', tone: tRfi.total > 10 ? 'bad' : tRfi.total > 5 ? 'warn' : 'default' } : { label: 'Open RFIs', value: '—', sub: 'No data yet' },
    tPunch.n > 0 ? { label: 'Open Punch', value: tPunch.total, sub: coverage(tPunch), tone: tPunch.total > 0 ? 'warn' : 'default' } : { label: 'Open Punch', value: '—', sub: 'No data yet' },
  ];

  const selector = (
    <div className="igActions" ref={popRef}>
      {/* Autopilot's only nav entry (de-featured from the sidebar). */}
      <Button icon={<Robot size={15} weight="fill" />} href="/app/autopilot" title="Overdue RFIs, expiring insurance, stale change orders — flagged across every project">Autopilot Alerts</Button>
      {ids.length > 0 && <Button variant="ghost" icon={<ArrowsClockwise size={14} weight="bold" />} onClick={() => void mutate()}>Refresh</Button>}
      <Button variant="primary" icon={<Selection size={15} weight="bold" />} onClick={() => setSelectorOpen(!selectorOpen)} aria-expanded={selectorOpen} aria-haspopup="dialog">{projects.length ? `Select Projects (${selectedIds.size})` : 'Select Projects'}</Button>
      {selectorOpen && (
        <div className="igPop" role="dialog" aria-label="Select projects to compare">
          <div className="igPopHead">Select up to 5 projects — {selectedIds.size} selected</div>
          {projects.map((p) => (
            <label key={p.id} className="igOpt" data-on={selectedIds.has(p.id) ? 'true' : undefined}>
              <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleProject(p.id)} />
              <div style={{ minWidth: 0 }}>
                <div className="igOptName">{p.name}</div>
                <div className="igOptSub">{fmt(Number(p.contract_amount) || 0)} · {p.status}</div>
              </div>
            </label>
          ))}
          <Button variant="primary" icon={<Check size={14} weight="bold" />} onClick={() => setSelectorOpen(false)} style={{ width: '100%', marginTop: 8 }}>Done</Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="igWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Intelligence' }]}
        title="Project Intelligence"
        subtitle={`Health, burn, money, and field signals for ${ids.length} selected project${ids.length !== 1 ? 's' : ''} — every figure real or absent.`}
        actions={selector}
      >
        {/* Live suggestion ticker — the same feed the module NudgeRings sync to:
            every item is a real row with an honest $ figure, deep-linked. */}
        <SuggestionTicker />

        {loading && <GridSkeleton count={3} />}

        {/* Empty portfolio / empty selection */}
        {!loading && ids.length === 0 && (
          <Card flush>
            {projects.length === 0 ? (
              <EmptyState
                icon={<Selection size={22} />}
                title="No projects to analyze yet"
                text="Intelligence scores every project from its pay apps, invoices, change orders, RFIs, punch list, and daily logs — then compares them side by side. Create your first project and this page builds itself. No setup needed."
                action={<Button variant="primary" href="/app/projects">Go to Projects</Button>}
              />
            ) : (
              <EmptyState
                icon={<Selection size={22} />}
                title="No projects selected"
                text={`You have ${projects.length} project${projects.length === 1 ? '' : 's'} available — pick up to 5 to compare health scores, cost burn vs schedule, money position, and field signals side by side.`}
                action={<Button onClick={() => setSelectorOpen(true)}>Select Projects</Button>}
              />
            )}
          </Card>
        )}

        {/* Summary failed and we have nothing cached to show */}
        {ids.length > 0 && error && rows.length === 0 && (
          <Card flush>
            <EmptyState
              icon={<Lightbulb size={22} />}
              title="Couldn't load the intelligence summary"
              text="The portfolio summary request failed. Your project data is untouched — retry when ready."
              action={<Button icon={<ArrowsClockwise size={15} weight="bold" />} onClick={() => void mutate()}>Retry</Button>}
            />
          </Card>
        )}

        {/* Loading — skeletons shaped like the surface they become */}
        {summaryLoading && !error && (
          <div className="igStack">
            <Card title="Portfolio Insights" subtitle="Reading the numbers…"><div className="igInsights">{ids.map((id) => <div key={id} className="igSkel" style={{ height: 54, padding: 0 }} />)}</div></Card>
            <GridSkeleton count={ids.length} />
          </div>
        )}

        {rows.length > 0 && (
          <div className="igStack">
            {/* 1 — INSIGHTS: the honest sentences, severity first */}
            <Card title="Portfolio Insights" subtitle="What the numbers say across your selected projects — computed from the records, not guessed.">
              {insights.length === 0 ? (
                <div className="igMuted" style={{ fontSize: 'var(--fs-sm)' }}>All projects tracking clean — nothing needs your attention right now.</div>
              ) : (
                <div className="igInsights">
                  {insights.map((ins, i) => {
                    const { tone } = sevRail(ins.severity);
                    const pname = ins.projectId ? nameOf.get(String(ins.projectId)) : undefined;
                    return (
                      <div key={i} className="igInsight" data-tone={tone}>
                        {pname && <div className="igInsightProj">{pname}</div>}
                        <div className="igInsightText">{ins.text}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* 2 — Comparison grid: one card per project */}
            <div className="igSection"><SquaresFour size={15} weight="bold" /> Project Comparison</div>
            <div className="igGrid">
              {rows.map((r) => <ProjectCard key={r.id || r.name} r={r} />)}
            </div>

            {/* 3 — Portfolio totals: sums over projects that report the figure */}
            <div className="igSection"><Lightbulb size={15} weight="bold" /> Portfolio Totals</div>
            <StatRow items={totals} />
          </div>
        )}
      </PageShell>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
