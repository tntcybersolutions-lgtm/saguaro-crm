'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ChartLineUp, Lightbulb, SquaresFour, Selection, ArrowsClockwise } from '@phosphor-icons/react';
import {
  PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, StatStrip,
  InsightRow, Pill, GoldButton, GhostButton, goldButtonStyle,
} from '@/components/ui/premium';
import { useProjects } from '@/lib/hooks/useProjects';
import { Skeleton } from '@/components/ui/Skeleton';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';
import SuggestionTicker from '@/components/intelligence/SuggestionTicker';

// No 'intelligence' key exists in lib/module-identity — this surface stays on
// the gold ground (money + flagship voice) rather than inventing a module hue.
const GOLD = '#F59E0B', DIM = '#CBD5E1', TEXT = '#FFFFFF';
// Desert-dusk semantic palette — harmonized with the dashboard (muted emerald,
// terracotta, warm amber) so severity accents sit on the aurora bg.
const GREEN = '#45B37D', RED = '#E0644E', AMBER = '#F0A63C';
// Nested surfaces layered on the PremiumSurface aurora (white-alpha glass —
// dark-shell surfaces never take black alphas).
const NEST = 'rgba(20,20,22,0.55)', NEST_BORDER = 'rgba(255,255,255,0.08)';
const HAIR = 'rgba(255,255,255,0.06)';

// ─── Honest number handling ──────────────────────────────────────────────────
// NUMERIC columns round-trip as strings; Number() ALWAYS. `null` means "the
// API genuinely didn't have this figure" and renders as an em-dash + note —
// never a fake zero.
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n < 0 ? '-' : '') + '$' + (abs / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return (n < 0 ? '-' : '') + '$' + (abs / 1_000).toFixed(0) + 'K';
  return fmt(n);
};

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
function healthGrade(score: number | null): { color: string; verdict: string } {
  if (score == null) return { color: 'rgba(255,255,255,0.35)', verdict: 'No score' };
  if (score >= 85) return { color: GREEN, verdict: 'Excellent' };
  if (score >= 70) return { color: GREEN, verdict: 'Healthy' };
  if (score >= 50) return { color: AMBER, verdict: 'Watch' };
  return { color: RED, verdict: 'At risk' };
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
function sevRail(s?: string): { rail: string; rank: number } {
  const k = String(s || '').toLowerCase();
  if (SEV_RED.includes(k)) return { rail: RED, rank: 0 };
  if (SEV_AMBER.includes(k)) return { rail: AMBER, rank: 1 };
  return { rail: 'rgba(255,255,255,0.25)', rank: 2 };
}

// ─── API shapes (every key optional — the page tolerates partial payloads) ───
interface SummaryProject {
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
    id: String(sp.project?.id ?? ''),
    name: sp.project?.name || fallbackName || 'Untitled Project',
    status: sp.project?.status ?? null,
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

// ─── Health ring — color-graded score dial with a component tooltip ──────────
function HealthRing({ score, components }: { score: number | null; components: string[] }) {
  const g = healthGrade(score);
  const R = 26, C = 2 * Math.PI * R;
  const frac = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const tip = components.length
    ? `Health components:\n${components.join('\n')}`
    : score != null ? 'No component breakdown provided' : 'No health score for this project yet';
  return (
    <div title={tip} style={{ textAlign: 'center' as const, flexShrink: 0, cursor: 'help' }}>
      <div style={{ position: 'relative' as const, width: 64, height: 64, margin: '0 auto' }}>
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="6" />
          {score != null && (
            <circle
              cx="32" cy="32" r={R} fill="none"
              stroke={g.color} strokeWidth="6"
              strokeDasharray={`${frac * C} ${C}`}
              strokeLinecap="round"
              transform="rotate(-90 32 32)"
            />
          )}
        </svg>
        <div style={{
          position: 'absolute' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          fontSize: 16, fontWeight: 800, color: score == null ? DIM : g.color, fontVariantNumeric: 'tabular-nums',
        }}>
          {score == null ? '—' : Math.round(score)}
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 800, color: g.color, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginTop: 4 }}>
        {g.verdict}
      </div>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: DIM, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
          Billing burn vs schedule
        </span>
        {delta != null ? (
          <span style={{ fontSize: 11, fontWeight: 800, color: ahead ? GREEN : RED, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' as const }}>
            {ahead ? '+' : '-'}{Math.abs(delta).toFixed(1)} pts {ahead ? 'ahead' : 'behind'}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: DIM, whiteSpace: 'nowrap' as const }}>no schedule dates</span>
        )}
      </div>
      <div style={{ position: 'relative' as const, height: 12 }}>
        <div style={{ position: 'absolute' as const, inset: 0, background: 'rgba(255,255,255,0.08)', borderRadius: 6, overflow: 'hidden' }}>
          {actual != null && (
            <div style={{
              height: '100%', width: `${aw}%`, borderRadius: 6,
              background: 'linear-gradient(90deg, rgba(245,158,11,0.5), #F59E0B)',
            }} />
          )}
        </div>
        {ew != null && (
          <div
            title={`Expected ${expected!.toFixed(1)}% burned by today (share of schedule elapsed)`}
            style={{
              position: 'absolute' as const, left: `calc(${ew}% - 1px)`, top: -3, bottom: -3, width: 2,
              background: TEXT, opacity: 0.9, borderRadius: 1, boxShadow: '0 0 6px rgba(255,255,255,0.55)',
            }}
          />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10.5, color: DIM, fontVariantNumeric: 'tabular-nums' }}>
        <span>Actual {actual == null ? '— no billing data' : `${actual.toFixed(1)}%`}</span>
        <span>Expected {expected == null ? '—' : `${expected.toFixed(1)}%`}</span>
      </div>
    </div>
  );
}

// Money row — value gold when real, em-dash when the API had nothing.
function moneyVal(v: number | null, suffix?: React.ReactNode): { value: React.ReactNode; accent?: string } {
  if (v == null) return { value: '—', accent: 'rgba(255,255,255,0.35)' };
  return { value: <>{fmtK(v)}{suffix}</>, accent: GOLD };
}

const RULE_LABEL: React.CSSProperties = {
  fontSize: 10, color: DIM, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em',
  margin: '14px 0 4px', paddingTop: 12, borderTop: `1px solid ${HAIR}`,
};

// ─── Per-project comparison card ─────────────────────────────────────────────
function ProjectCard({ r }: { r: Row }) {
  const co = moneyVal(r.coValue, r.coCount != null ? (
    <span style={{ color: DIM, fontWeight: 600, fontSize: 11 }}> ({r.coCount})</span>
  ) : undefined);
  const marginAccent = r.margin == null ? 'rgba(255,255,255,0.35)' : r.margin < 0 ? RED : GOLD;
  // Overdue = the oldest open RFI has aged past 14 days — that age reads red.
  const rfiOverdue = r.openRfis != null && r.openRfis > 0 && r.oldestRfiDays != null && r.oldestRfiDays > 14;
  const noField = r.openRfis == null && r.openPunch == null && r.logStreak == null && r.lastActivityDays == null;
  return (
    <SectionCard bodyStyle={{ padding: '18px 20px' }}>
      {/* Header: identity left, health ring right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <Link href={`/app/projects/${r.id}`} style={{ fontSize: 15.5, fontWeight: 800, color: TEXT, textDecoration: 'none', letterSpacing: '-0.01em' }}>
            {r.name}
          </Link>
          <div style={{ marginTop: 6 }}>
            {r.status ? (
              <Pill tone={r.status === 'active' ? 'green' : 'neutral'} caps>{r.status}</Pill>
            ) : (
              <span style={{ fontSize: 11, color: DIM }}>status unknown</span>
            )}
          </div>
        </div>
        <HealthRing score={r.health} components={r.components} />
      </div>

      <BurnBar actual={r.actual} expected={r.expected} delta={r.delta} />

      {/* Money — gold, Number()-guarded upstream, em-dash when absent */}
      <div style={RULE_LABEL}>Money</div>
      <InsightRow label="Contract" {...moneyVal(r.contract)} />
      <InsightRow label="Billed to date" {...moneyVal(r.billed)} />
      <InsightRow label="Invoiced costs" {...moneyVal(r.invoiced)} />
      <InsightRow label="Approved COs" value={co.value} accent={co.accent} />
      <InsightRow label="Margin" value={r.margin == null ? '—' : fmtK(r.margin)} accent={marginAccent} strong />

      {/* Field signals */}
      <div style={RULE_LABEL}>Field</div>
      {noField ? (
        <div style={{ fontSize: 11.5, color: DIM, padding: '4px 0' }}>{'—'} no field telemetry yet</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, paddingTop: 4 }}>
          {r.openRfis != null && (
            <Pill tone={rfiOverdue ? 'red' : r.openRfis > 0 ? 'amber' : 'green'}>
              {r.openRfis} open RFI{r.openRfis === 1 ? '' : 's'}
              {r.openRfis > 0 && r.oldestRfiDays != null ? ` · oldest ${r.oldestRfiDays}d` : ''}
            </Pill>
          )}
          {r.openPunch != null && (
            <Pill tone={r.openPunch > 0 ? 'amber' : 'green'}>{r.openPunch} punch open</Pill>
          )}
          {r.logStreak != null && (
            <Pill tone={r.logStreak >= 3 ? 'green' : 'neutral'}>{r.logStreak}d log streak</Pill>
          )}
          {r.lastActivityDays != null && (
            <Pill tone="neutral">
              {r.lastActivityDays === 0 ? 'active today' : `active ${r.lastActivityDays}d ago`}
            </Pill>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// Grid-shaped loading skeleton — same card silhouette as ProjectCard.
function GridSkeleton({ count }: { count: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 24 }}>
      {Array.from({ length: Math.max(count, 1) }).map((_, i) => (
        <div key={i} style={{ background: NEST, border: `1px solid ${NEST_BORDER}`, borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <Skeleton width={150} height={16} />
              <div style={{ height: 8 }} />
              <Skeleton width={64} height={12} />
            </div>
            <Skeleton width={64} height={64} borderRadius={32} />
          </div>
          <Skeleton height={12} />
          <div style={{ height: 16 }} />
          {[0, 1, 2, 3].map((k) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <Skeleton width={90} height={11} />
              <Skeleton width={64} height={11} />
            </div>
          ))}
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

  // Auto-select the first 3 projects once the (cached) list is in.
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current || projects.length === 0) return;
    autoSelectedRef.current = true;
    setSelectedIds(new Set(projects.slice(0, 3).map((p) => p.id)));
  }, [projects]);

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
      const id = sp.project?.id; if (id && sp.project?.name) m.set(String(id), sp.project.name);
    }
    return m;
  }, [projects, data]);

  const rows = useMemo(
    () => (data?.projects ?? []).map((sp) => deriveRow(sp, sp.project?.id ? nameOf.get(String(sp.project.id)) : undefined)),
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
        if (next.size >= 5) return prev; // max 5
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
  const coverage = (s: { n: number }) => s.n === rows.length ? `across ${rows.length} project${rows.length === 1 ? '' : 's'}` : `${s.n} of ${rows.length} reporting`;
  const moneyStat = (label: string, s: { total: number; n: number }, sub?: string) =>
    s.n > 0
      ? { label, value: fmtK(s.total), sub: sub ?? coverage(s), accent: GOLD }
      : { label, value: '—', sub: 'no data yet' };

  if (loading) {
    return (
      <PremiumSurface maxWidth={1600}>
        <ModuleSkeleton kpis={4} rows={5} />
      </PremiumSurface>
    );
  }

  return (
    <PremiumSurface maxWidth={1600}>
      {/* Header */}
      <ModuleHero
        eyebrow="Cross-Project Analytics"
        eyebrowIcon={<ChartLineUp size={13} weight="fill" color={GOLD} />}
        title="Project"
        accent="Intelligence"
        subtitle={`Health, burn, money, and field signals for ${ids.length} selected project${ids.length !== 1 ? 's' : ''} — every figure real or absent.`}
        actions={
          <div style={{ position: 'relative' as const, display: 'flex', gap: 10, alignItems: 'center' }}>
            {ids.length > 0 && (
              <GhostButton size="md" icon={<ArrowsClockwise size={14} weight="bold" />} onClick={() => void mutate()}>
                Refresh
              </GhostButton>
            )}
            <GoldButton size="md" onClick={() => setSelectorOpen(!selectorOpen)}>
              Select Projects ({selectedIds.size})
            </GoldButton>

            {/* Project selector dropdown */}
            {selectorOpen && (
              <div style={{
                position: 'absolute' as const, top: '100%', right: 0, marginTop: 8,
                background: '#141416', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14,
                padding: 12, minWidth: 320, maxHeight: 400, overflowY: 'auto' as const,
                zIndex: 100, boxShadow: '0 24px 60px -20px rgba(4,6,10,0.8)',
              }}>
                <div style={{ fontSize: 11, color: DIM, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 }}>
                  Select up to 5 projects
                </div>
                {projects.map((p) => (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      borderRadius: 8, cursor: 'pointer',
                      background: selectedIds.has(p.id) ? 'rgba(245, 158, 11,0.1)' : 'transparent',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = selectedIds.has(p.id) ? 'rgba(245, 158, 11,0.15)' : 'rgba(255,255,255,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = selectedIds.has(p.id) ? 'rgba(245, 158, 11,0.1)' : 'transparent'}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleProject(p.id)}
                      style={{ accentColor: GOLD, width: 16, height: 16 }}
                    />
                    <div>
                      <div style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: DIM }}>
                        {fmt(Number(p.contract_amount) || 0)} &middot; {p.status}
                      </div>
                    </div>
                  </label>
                ))}
                <GoldButton size="md" onClick={() => setSelectorOpen(false)} style={{ width: '100%', marginTop: 8 }}>
                  Done
                </GoldButton>
              </div>
            )}
          </div>
        }
      />

      {/* Live suggestion ticker — the same feed the module NudgeRings sync to:
          every item is a real row with an honest $ figure, deep-linked. */}
      <SuggestionTicker style={{ marginBottom: 24 }} />

      {/* Empty portfolio / empty selection */}
      {ids.length === 0 && (
        <SectionCard>
          {projects.length === 0 ? (
            <PremiumEmpty
              icon={<Selection size={30} weight="duotone" color={GOLD} />}
              title="No projects to analyze yet"
              description="Intelligence scores every project from its pay apps, invoices, change orders, RFIs, punch list, and daily logs — then compares them side by side. Create your first project and this page builds itself. No setup needed."
              action={<Link href="/app/projects" style={goldButtonStyle} className="pmBtn">Go to Projects</Link>}
            />
          ) : (
            <PremiumEmpty
              icon={<Selection size={30} weight="duotone" color={GOLD} />}
              title="No projects selected"
              description={`You have ${projects.length} project${projects.length === 1 ? '' : 's'} available — pick up to 5 to compare health scores, billing burn vs schedule, money position, and field signals side by side.`}
              action={<GoldButton onClick={() => setSelectorOpen(true)}>Select Projects</GoldButton>}
            />
          )}
        </SectionCard>
      )}

      {/* Summary failed and we have nothing cached to show */}
      {ids.length > 0 && error && rows.length === 0 && (
        <SectionCard>
          <PremiumEmpty
            tone="error"
            icon={<Lightbulb size={30} weight="duotone" color={RED} />}
            title="Couldn't load the intelligence summary"
            description="The portfolio summary request failed. Your project data is untouched — retry when ready."
            action={<GhostButton icon={<ArrowsClockwise size={15} weight="bold" />} onClick={() => void mutate()}>Retry</GhostButton>}
          />
        </SectionCard>
      )}

      {/* Loading — skeletons shaped like the surface they become */}
      {summaryLoading && !error && (
        <>
          <SectionCard flat
            title="Portfolio Insights"
            icon={<Lightbulb size={17} weight="duotone" color={GOLD} />}
            style={{ marginBottom: 24 }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
              {ids.map((id) => <Skeleton key={id} height={54} borderRadius={12} />)}
            </div>
          </SectionCard>
          <GridSkeleton count={ids.length} />
        </>
      )}

      {rows.length > 0 && (
        <>
          {/* 1 — INSIGHTS: the honest sentences, severity first */}
          <SectionCard flat
            title="Portfolio Insights"
            subtitle="What the numbers say across your selected projects"
            icon={<Lightbulb size={17} weight="duotone" color={GOLD} />}
            style={{ marginBottom: 24 }}
          >
            {insights.length === 0 ? (
              <div style={{ fontSize: 13, color: DIM, padding: '2px 0' }}>
                All projects tracking clean — nothing needs your attention right now.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                {insights.map((ins, i) => {
                  const { rail } = sevRail(ins.severity);
                  const pname = ins.projectId ? nameOf.get(String(ins.projectId)) : undefined;
                  return (
                    <div key={i} style={{
                      position: 'relative' as const, overflow: 'hidden',
                      background: NEST, border: `1px solid ${NEST_BORDER}`, borderRadius: 12,
                      padding: '12px 14px 12px 18px',
                    }}>
                      <div aria-hidden style={{ position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: 3, background: rail }} />
                      {pname && (
                        <div style={{ fontSize: 10, fontWeight: 800, color: DIM, textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 4 }}>
                          {pname}
                        </div>
                      )}
                      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.88)', lineHeight: 1.5 }}>{ins.text}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* 2 — Comparison grid: one machined card per project */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <SquaresFour size={15} weight="duotone" color={GOLD} />
            <span style={{ fontSize: 11, fontWeight: 800, color: DIM, textTransform: 'uppercase' as const, letterSpacing: '0.09em' }}>
              Project Comparison
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 24 }}>
            {rows.map((r) => <ProjectCard key={r.id || r.name} r={r} />)}
          </div>

          {/* 3 — Portfolio totals: sums over projects that report the figure */}
          <StatStrip items={[
            moneyStat('Combined Contract', tContract),
            moneyStat('Billed to Date', tBilled,
              tContract.n > 0 && tContract.total > 0 && tBilled.n > 0
                ? `${((tBilled.total / tContract.total) * 100).toFixed(1)}% of combined contract`
                : undefined),
            moneyStat('Invoiced Costs', tInvoiced),
            moneyStat('Approved COs', tCO, tCOCount.n > 0 ? `${tCOCount.total} approved change order${tCOCount.total === 1 ? '' : 's'}` : undefined),
            tMargin.n > 0
              ? { label: 'Portfolio Margin', value: fmtK(tMargin.total), sub: coverage(tMargin), accent: tMargin.total < 0 ? RED : GOLD }
              : { label: 'Portfolio Margin', value: '—', sub: 'no data yet' },
            tRfi.n > 0
              ? { label: 'Open RFIs', value: String(tRfi.total), sub: tRfi.total > 0 ? 'awaiting answers' : 'all answered', accent: tRfi.total > 10 ? RED : tRfi.total > 5 ? AMBER : undefined }
              : { label: 'Open RFIs', value: '—', sub: 'no data yet' },
            tPunch.n > 0
              ? { label: 'Open Punch', value: String(tPunch.total), sub: coverage(tPunch), accent: tPunch.total > 0 ? AMBER : undefined }
              : { label: 'Open Punch', value: '—', sub: 'no data yet' },
          ]} />
        </>
      )}
    </PremiumSurface>
  );
}
