'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProjects } from '@/lib/hooks/useProjects';
import { useFeature } from '@/lib/hooks/useEntitlements';
import { computeHealth, TRIAGE_ORDER, type HealthStatus } from '@/lib/portfolio-health';
import { useRisks, useEscalations, useLongLead, useMilestones } from '@/lib/hooks/useFranchise';
import { computeRisk, computeLongLead, milestoneSlip } from '@/lib/franchise';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard } from '@/components/ui/premium';
import { inspectionOutcome } from '@/lib/inspection-result';
import { FlatStyles, RowSkeleton } from '@/components/ui/flat';
import {
  Warning, SquaresFour, ChartLineUp, Wallet, Bank, ShieldWarning, Siren, Package, FlagCheckered,
  NotePencil, UsersThree, PaperPlaneTilt, Truck, AddressBook, ListChecks, LinkSimple, MapPin,
  CheckSquare, Rocket, SealCheck,
} from '@phosphor-icons/react';

const C = {
  gold: 'var(--brand-primary)', green: 'var(--success)', yellow: 'var(--warning)', red: 'var(--danger)', blue: 'var(--brand-primary)',
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'rgba(255,255,255,0.12)', dim: 'var(--text-secondary)', text: 'var(--text-primary)',
};
const STATUS_COLOR: Record<HealthStatus, string> = { green: C.green, yellow: C.yellow, red: C.red };
const STATUS_LABEL: Record<HealthStatus, string> = { green: 'On Track', yellow: 'Watch', red: 'Escalate' };
const font = "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

const fmtMoney = (n: number | null) => (n == null ? '—' : '$' + Math.round(n).toLocaleString());
const fmtDate = (s: string | null) => {
  if (!s) return '—';
  const t = Date.parse(s);
  return isNaN(t) ? '—' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
};

/** Inline primitive (hub-only): compact module link pill with a live-count badge. */
function ModuleLink({ href, icon, label, count, accent }: { href: string; icon: React.ReactNode; label: string; count?: string | null; accent?: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="pmBtn" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${accent ? `${accent}44` : C.border}`, cursor: 'pointer', height: '100%' }}>
        <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{label}</span>
        {count && <span style={{ fontSize: 11, fontWeight: 800, color: accent || C.dim, background: accent ? `${accent}14` : 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{count}</span>}
      </div>
    </Link>
  );
}

function HealthDot({ status, size = 10 }: { status: HealthStatus; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: '50%', background: STATUS_COLOR[status], display: 'inline-block', boxShadow: `0 0 0 3px ${STATUS_COLOR[status]}22` }} />;
}

export default function CommandCenterPage() {
  const router = useRouter();
  const { enabled, loading: gateLoading } = useFeature('command_center');
  // Fail-closed entitlement gate: only tenants with the flag on can reach this,
  // even by typing the URL. Everyone else is bounced back to the dashboard.
  useEffect(() => {
    if (!gateLoading && !enabled) router.replace('/app');
  }, [gateLoading, enabled, router]);

  const { projects: raw, loading: isLoading } = useProjects();
  const [filter, setFilter] = useState<'all' | HealthStatus>('all');
  const [q, setQ] = useState('');

  // Live module counts — the same SWR feeds the subpages run on, so every hub
  // link walks in already knowing what's waiting behind it.
  const { risks: rawRisks } = useRisks();
  const { escalations: rawEsc } = useEscalations();
  const { items: rawLL } = useLongLead();
  const { milestones: rawMs } = useMilestones();

  // Per-site inspection status (passed / failed / pending) for the dashboard card.
  const [inspByProj, setInspByProj] = useState<Record<string, { passed: number; failed: number; pending: number; total: number }>>({});
  useEffect(() => {
    let alive = true;
    fetch('/api/inspections/list').then((r) => r.json()).then((j) => {
      if (!alive) return;
      const map: Record<string, { passed: number; failed: number; pending: number; total: number }> = {};
      (j.inspections || []).forEach((i: any) => {
        const pid = i.project_id; if (!pid) return;
        const m = map[pid] || (map[pid] = { passed: 0, failed: 0, pending: 0, total: 0 });
        const o = inspectionOutcome(i);
        m.total++;
        if (o === 'passed' || o === 'conditional') m.passed++;
        else if (o === 'failed') m.failed++;
        else m.pending++;
      });
      setInspByProj(map);
    }).catch(() => { /* non-fatal */ });
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => {
    const list = ((raw as any[]) || []).map((p) => ({ p, h: computeHealth(p) }));
    list.sort((a, b) => TRIAGE_ORDER[a.h.status] - TRIAGE_ORDER[b.h.status] || a.h.score - b.h.score);
    return list;
  }, [raw]);

  const summary = useMemo(() => {
    const s = { green: 0, yellow: 0, red: 0, contract: 0, cSum: 0, cN: 0 };
    rows.forEach(({ h }) => {
      s[h.status]++;
      s.contract += h.budget || 0;
      if (h.percentComplete != null) { s.cSum += h.percentComplete; s.cN++; }
    });
    return { ...s, avg: s.cN ? Math.round(s.cSum / s.cN) : 0, total: rows.length };
  }, [rows]);

  const modCounts = useMemo(() => {
    const rk = ((rawRisks as any[]) || []).map((r) => computeRisk(r));
    const openRisks = rk.filter((r) => r.isOpen).length;
    const critRisks = rk.filter((r) => r.isOpen && r.severity === 'red').length;
    const openEsc = ((rawEsc as any[]) || []).filter((e) => !/resolved|closed/i.test(String(e.status || ''))).length;
    const ll = ((rawLL as any[]) || []).map((it) => computeLongLead(it));
    const llAtRisk = ll.filter((x) => x.severity !== 'green').length;
    const ms = ((rawMs as any[]) || []).map((m) => milestoneSlip(m.baseline_date, m.current_date, m.actual_date, m.float_days));
    const msSlip = ms.filter((m) => m.severity !== 'green').length;
    const insp = Object.values(inspByProj).reduce(
      (s, m) => ({ passed: s.passed + m.passed, failed: s.failed + m.failed, total: s.total + m.total }),
      { passed: 0, failed: 0, total: 0 },
    );
    return { openRisks, critRisks, openEsc, llTotal: ll.length, llAtRisk, msTotal: ms.length, msSlip, insp };
  }, [rawRisks, rawEsc, rawLL, rawMs, inspByProj]);

  const filtered = rows.filter(({ p, h }) =>
    (filter === 'all' || h.status === filter) &&
    (!q || `${p.name || ''} ${p.city || ''} ${p.state || ''} ${p.project_number || ''}`.toLowerCase().includes(q.toLowerCase())),
  );

  const needsAttention = summary.red + summary.yellow;

  // Gate: while checking, show nothing heavy; if not entitled, we're redirecting.
  if (gateLoading) return <div style={{ padding: 16 }}><FlatStyles /><RowSkeleton rows={6} /></div>;
  if (!enabled) return null;

  return (
    <PremiumSurface maxWidth={2200} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
      {/* Header */}
      <ModuleHero
        eyebrow="Portfolio Operations"
        eyebrowIcon={<SquaresFour size={13} weight="fill" color={C.gold} />}
        title="Command"
        accent="Center"
        subtitle="Every project, one screen. Worst first."
        actions={<div style={{ fontSize: 12, color: C.dim }}>{summary.total} active {summary.total === 1 ? 'project' : 'projects'}</div>}
      />

      {/* Portfolio pulse — live KPIs from the same feeds the subpages run on */}
      <StatStrip items={[
        {href: '/app/command-center',  label: 'Projects', value: String(summary.total), sub: `${summary.green} on track` },
        {href: '/app/command-center',  label: 'Watch', value: String(summary.yellow), accent: summary.yellow > 0 ? C.yellow : undefined, sub: 'Yellow health' },
        {href: '/app/command-center/escalations',  label: 'Escalate', value: String(summary.red), accent: summary.red > 0 ? C.red : undefined, sub: 'Red — act today' },
        {href: '/app/command-center',  label: 'Portfolio Value', value: fmtMoney(summary.contract), sub: 'Sum of contracts' },
        {href: '/app/command-center',  label: 'Avg Complete', value: `${summary.avg}%`, sub: 'Across reporting projects' },
        {href: '/app/command-center/risks',  label: 'Open Risks', value: String(modCounts.openRisks), accent: modCounts.critRisks > 0 ? C.red : undefined, sub: modCounts.critRisks ? `${modCounts.critRisks} critical` : 'Register-wide' },
        {href: '/app/command-center/escalations',  label: 'Escalations', value: String(modCounts.openEsc), accent: modCounts.openEsc > 0 ? C.red : undefined, sub: 'Open now' },
        {href: '/app/command-center/long-lead',  label: 'Long-Lead Risk', value: `${modCounts.llAtRisk}/${modCounts.llTotal}`, accent: modCounts.llAtRisk > 0 ? C.yellow : undefined, sub: 'Items off runway' },
      ]} />

      {/* Needs-attention banner */}
      {needsAttention > 0 && (
        <div style={{ background: summary.red > 0 ? 'rgba(248,113,113,0.08)' : 'rgba(255,149,0,0.08)', border: `1px solid ${summary.red > 0 ? 'rgba(248,113,113,0.25)' : 'rgba(255,149,0,0.25)'}`, borderRadius: 12, padding: '13px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}><Warning size={18} weight="fill" color={summary.red > 0 ? C.red : C.yellow} /></span>
          <span style={{ color: C.text }}>
            <b>{needsAttention}</b> {needsAttention === 1 ? 'project needs' : 'projects need'} attention today
            {summary.red > 0 && <> — <b style={{ color: C.red }}>{summary.red} to escalate</b></>}. Review these first.
          </span>
        </div>
      )}

      {/* Command modules — every rollout screen, with live counts where the data is already fetched */}
      <SectionCard flat
        title="Command Modules"
        subtitle="The whole rollout. Badges are live counts."
        icon={<SquaresFour size={17} weight="duotone" color={C.gold} />}
        style={{ marginBottom: 18 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: 10 }}>
          <ModuleLink href="/app/command-center/kpis" icon={<ChartLineUp size={17} weight="duotone" color={C.gold} />} label="KPI Dashboard" count={summary.total ? `${summary.total} sites` : null} />
          <ModuleLink href="/app/command-center/budget" icon={<Wallet size={17} weight="duotone" color={C.gold} />} label="Budget & COs" />
          <ModuleLink href="/app/command-center/financials" icon={<Bank size={17} weight="duotone" color={C.gold} />} label="Financials" />
          <ModuleLink href="/app/command-center/risks" icon={<ShieldWarning size={17} weight="duotone" color={modCounts.critRisks ? C.red : C.gold} />} label="Risk Register" count={`${modCounts.openRisks} open`} accent={modCounts.critRisks ? C.red : undefined} />
          <ModuleLink href="/app/command-center/escalations" icon={<Siren size={17} weight="duotone" color={modCounts.openEsc ? C.red : C.gold} />} label="Escalations" count={`${modCounts.openEsc} open`} accent={modCounts.openEsc ? C.red : undefined} />
          <ModuleLink href="/app/command-center/long-lead" icon={<Package size={17} weight="duotone" color={modCounts.llAtRisk ? C.yellow : C.gold} />} label="Long-Lead" count={`${modCounts.llAtRisk} at risk`} accent={modCounts.llAtRisk ? C.yellow : undefined} />
          <ModuleLink href="/app/command-center/milestones" icon={<FlagCheckered size={17} weight="duotone" color={modCounts.msSlip ? C.yellow : C.gold} />} label="Milestones" count={`${modCounts.msSlip} slipping`} accent={modCounts.msSlip ? C.yellow : undefined} />
          <ModuleLink href="/app/command-center/daily-logs" icon={<NotePencil size={17} weight="duotone" color={C.gold} />} label="Daily Logs" />
          <ModuleLink href="/app/command-center/oac" icon={<UsersThree size={17} weight="duotone" color={C.gold} />} label="OAC Meetings" />
          <ModuleLink href="/app/command-center/owner-updates" icon={<PaperPlaneTilt size={17} weight="duotone" color={C.gold} />} label="Owner Updates" />
          <ModuleLink href="/app/command-center/verify" icon={<SealCheck size={17} weight="duotone" color={modCounts.insp.failed ? C.red : C.gold} />} label="Remote Verify" count={modCounts.insp.total ? `${modCounts.insp.passed}/${modCounts.insp.total} passed` : null} accent={modCounts.insp.failed ? C.red : undefined} />
          <ModuleLink href="/app/command-center/rollout" icon={<Rocket size={17} weight="duotone" color={C.gold} />} label="Rollout Pipeline" />
          <ModuleLink href="/app/command-center/checklists" icon={<ListChecks size={17} weight="duotone" color={C.gold} />} label="Phase Checklists" />
          <ModuleLink href="/app/command-center/pre-site" icon={<MapPin size={17} weight="duotone" color={C.gold} />} label="Pre-Site" />
          <ModuleLink href="/app/command-center/qc" icon={<CheckSquare size={17} weight="duotone" color={C.gold} />} label="QC by Trade" />
          <ModuleLink href="/app/command-center/vendors" icon={<Truck size={17} weight="duotone" color={C.gold} />} label="Vendors" />
          <ModuleLink href="/app/command-center/directory" icon={<AddressBook size={17} weight="duotone" color={C.gold} />} label="Directory" />
          <ModuleLink href="/app/command-center/portals" icon={<LinkSimple size={17} weight="duotone" color={C.gold} />} label="Franchisee Portals" />
        </div>
      </SectionCard>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {(['all', 'red', 'yellow', 'green'] as const).map((f) => {
          const on = filter === f;
          const col = f === 'all' ? C.text : STATUS_COLOR[f as HealthStatus];
          const count = f === 'all' ? summary.total : (summary as any)[f];
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${on ? col : C.border}`, background: on ? `${col}14` : C.card, color: on ? col : C.dim,
              display: 'inline-flex', alignItems: 'center', gap: 7,
            }}>
              {f !== 'all' && <HealthDot status={f as HealthStatus} size={8} />}
              {f === 'all' ? 'All' : f === 'red' ? 'Escalate' : f === 'yellow' ? 'Watch' : 'On Track'}
              <span style={{ opacity: 0.7 }}>{count}</span>
            </button>
          );
        })}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project or location…"
          style={{ marginLeft: 'auto', flex: '1 1 220px', maxWidth: 300, padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, outline: 'none', background: C.card }} />
      </div>

      {/* Cards */}
      {isLoading ? (
        <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Loading portfolio…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: C.dim, padding: 48, textAlign: 'center', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
          {rows.length === 0 ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 6 }}>No active projects yet</div>
              <div style={{ fontSize: 13, maxWidth: 520, margin: '0 auto', lineHeight: 1.55 }}>
                Add a project and this screen starts triaging for you — health scores from budget variance, RFI and punch backlog, schedule freshness, and inspections, ranked worst first so the morning scan takes ten seconds.
              </div>
            </>
          ) : 'Nothing matches this filter.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {filtered.map(({ p, h }) => (
            <Link key={p.id} href={`/app/projects/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${STATUS_COLOR[h.status]}`, borderRadius: 14, padding: '15px 16px', boxShadow: 'var(--shadow-sm)', transition: 'box-shadow .15s, transform .15s', height: '100%' }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'none'; }}>
                {/* header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || 'Untitled Project'}</div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                      {[p.city, p.state].filter(Boolean).join(', ') || p.address || '—'}{p.phase ? ` · ${p.phase}` : ''}
                    </div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${STATUS_COLOR[h.status]}14`, color: STATUS_COLOR[h.status], fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                    <HealthDot status={h.status} size={7} />{STATUS_LABEL[h.status]}
                  </span>
                </div>

                {/* progress */}
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.dim, marginBottom: 4 }}>
                    <span>Complete</span><span style={{ fontWeight: 700, color: C.text }}>{h.percentComplete != null ? `${Math.round(h.percentComplete)}%` : '—'}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface-2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, h.percentComplete || 0))}%`, background: STATUS_COLOR[h.status], borderRadius: 3 }} />
                  </div>
                </div>

                {/* metrics grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 13 }}>
                  <Metric label="Budget" value={h.variancePct != null ? `${h.variancePct > 0 ? '+' : ''}${h.variancePct.toFixed(0)}%` : fmtMoney(h.budget)} color={h.variancePct != null && h.variancePct > 5 ? C.red : h.variancePct != null && h.variancePct > 1 ? C.yellow : C.text} />
                  <Metric label="Open RFIs" value={h.openRfis != null ? String(h.openRfis) : '—'} />
                  <Metric label="Change Orders" value={h.openCos != null ? String(h.openCos) : '—'} />
                  <Metric label="Punch" value={h.openPunch != null ? String(h.openPunch) : '—'} />
                  {(() => {
                    const ins = inspByProj[p.id];
                    const val = ins && ins.total ? `${ins.passed}/${ins.total}` : '—';
                    const col = !ins || !ins.total ? C.text : ins.failed > 0 ? C.red : ins.pending > 0 ? C.yellow : C.green;
                    return <Metric label="Inspections" value={val} color={col} />;
                  })()}
                  <Metric label="Finish" value={fmtDate(h.finishDate)} color={h.daysToFinish != null && h.daysToFinish < 0 ? C.red : C.text} />
                  <Metric label="Updated" value={h.daysSinceUpdate != null ? (h.daysSinceUpdate === 0 ? 'Today' : `${h.daysSinceUpdate}d ago`) : '—'} color={h.daysSinceUpdate != null && h.daysSinceUpdate > 7 ? C.yellow : C.text} />
                </div>

                {/* flags */}
                {h.flags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
                    {h.flags.map((f, i) => (
                      <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: `${STATUS_COLOR[f.severity]}12`, color: STATUS_COLOR[f.severity], border: `1px solid ${STATUS_COLOR[f.severity]}30` }}>{f.label}</span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
      </div>
    </PremiumSurface>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: color || 'var(--text-primary)', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
