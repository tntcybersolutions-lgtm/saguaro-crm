'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMilestones } from '@/lib/hooks/useFranchise';
import { milestoneSlip, SEVERITY_ORDER, type Severity } from '@/lib/franchise';
import {
  C, font, fmtDate, useFranchiseGate, GateLoading,
  SevDot, SevBadge, Chip, SearchInput, AttentionBanner, Metric, LiftCard,
} from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, PremiumEmpty, Pill } from '@/components/ui/premium';
import { FlagCheckered } from '@phosphor-icons/react';

const SEV_LABEL: Record<Severity, string> = { red: 'Critical Slip', yellow: 'Slipping', green: 'On Track' };

// Slip badge/metric text: "+12d" later than baseline, "On Time" when not slipping, "—" when unknown.
const slipLabel = (slip: number | null) => (slip == null ? '—' : slip > 0 ? `+${slip}d` : 'On Time');

export default function MilestonesPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { milestones: raw, loading } = useMilestones();
  const [filter, setFilter] = useState<'all' | Severity>('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const list = ((raw as any[]) || []).map((it) => ({
      it,
      h: milestoneSlip(it.baseline_date, it.current_date, it.actual_date, it.float_days),
    }));
    // Worst-first, then biggest slip first.
    list.sort((a, b) =>
      SEVERITY_ORDER[a.h.severity] - SEVERITY_ORDER[b.h.severity] ||
      (b.h.slip ?? -Infinity) - (a.h.slip ?? -Infinity));
    return list;
  }, [raw]);

  const summary = useMemo(() => {
    const s = { green: 0, yellow: 0, red: 0, critical: 0, total: rows.length };
    rows.forEach(({ it, h }) => {
      s[h.severity]++;
      if (it.is_critical_path) s.critical++;
    });
    return s;
  }, [rows]);

  const filtered = rows.filter(({ it, h }) =>
    (filter === 'all' || h.severity === filter) &&
    (!q || `${it.title || it.name || ''} ${it.project_name || ''}`.toLowerCase().includes(q.toLowerCase())));

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  return (
    <PremiumSurface maxWidth={2200} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
      <ModuleHero
        eyebrow="Command Center"
        eyebrowIcon={<FlagCheckered size={13} weight="fill" color={C.gold} />}
        title="Milestone"
        accent="Variance"
        subtitle="Slippage against each baseline, worst first."
      />

      {/* Schedule pulse — slip mix against baseline, worst-first */}
      {!loading && (
        <StatStrip items={[
          {href: '/app/command-center/milestones',  label: 'Total Milestones', value: String(summary.total), sub: 'Across all sites' },
          {href: '/app/command-center/milestones',  label: 'On Track', value: String(summary.green), accent: C.green, sub: 'Holding baseline' },
          {href: '/app/command-center/milestones',  label: 'Slipping', value: String(summary.yellow), accent: summary.yellow > 0 ? C.yellow : undefined, sub: 'Inside float' },
          {href: '/app/command-center/milestones',  label: 'Critical Slip', value: String(summary.red), accent: summary.red > 0 ? C.red : undefined, sub: 'Recover these first' },
          {href: '/app/command-center/milestones',  label: 'Critical Path', value: String(summary.critical), accent: summary.critical > 0 ? C.gold : undefined, sub: 'Drive the end date' },
        ]} />
      )}

      <AttentionBanner red={summary.red} yellow={summary.yellow} noun="milestone" />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {(['all', 'red', 'yellow', 'green'] as const).map((f) => (
          <Chip key={f} active={filter === f} color={f === 'all' ? C.text : ({ red: C.red, yellow: C.yellow, green: C.green } as any)[f]}
            onClick={() => setFilter(f)} count={f === 'all' ? summary.total : (summary as any)[f]}>
            {f !== 'all' && <SevDot sev={f as Severity} size={8} />}
            {f === 'all' ? 'All' : SEV_LABEL[f as Severity]}
          </Chip>
        ))}
        <SearchInput value={q} onChange={setQ} placeholder="Search milestone, site…" />
      </div>

      {loading ? (
        <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Loading milestones…</div>
      ) : filtered.length === 0 ? (
        rows.length === 0 ? (
          <SectionCard flat>
            <PremiumEmpty icon={<FlagCheckered size={32} weight="duotone" color={C.gold} />} title="No milestones yet"
              description="Milestones roll up here from every site's schedule. Once baseline and forecast dates are set, the tracker computes each one's slip against baseline and surfaces what's blowing the schedule." />
          </SectionCard>
        ) : (
          <SectionCard flat>
            <PremiumEmpty compact icon={<FlagCheckered size={26} weight="duotone" color={C.gold} />} title="Nothing matches this filter"
              description="No milestone matches the current severity or search. Clear the filters to see the full board." />
          </SectionCard>
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {filtered.map(({ it, h }) => (
            <LiftCard key={it.id} sev={h.severity}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title || it.name || 'Untitled Milestone'}</div>
                  <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                    {it.project_id ? (
                      <Link href={`/app/projects/${it.project_id}`} style={{ color: C.blue, textDecoration: 'none' }}>{it.project_name || 'Project'}</Link>
                    ) : 'Unassigned'}
                    {it.project_city ? ` · ${it.project_city}, ${it.project_state}` : ''}
                  </div>
                </div>
                <SevBadge sev={h.severity} label={slipLabel(h.slip)} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 13 }}>
                <Metric label="Baseline" value={fmtDate(it.baseline_date)} />
                <Metric label="Forecast / Actual" value={fmtDate(it.actual_date || it.current_date)} />
                <Metric label="Slip" value={slipLabel(h.slip)} color={h.severity === 'red' ? C.red : h.severity === 'yellow' ? C.yellow : C.text} />
                <Metric label="Float" value={it.float_days != null ? `${it.float_days}d` : '—'} />
                <Metric label="Status" value={it.status || '—'} />
                <Metric label="Owner" value={it.responsible_name || it.responsible_party || '—'} />
              </div>

              {it.is_critical_path && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12, alignItems: 'center' }}>
                  <Pill tone="red">Critical Path</Pill>
                </div>
              )}
            </LiftCard>
          ))}
        </div>
      )}
      </div>
    </PremiumSurface>
  );
}
