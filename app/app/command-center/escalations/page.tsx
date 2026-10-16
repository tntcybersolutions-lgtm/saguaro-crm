'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useEscalations } from '@/lib/hooks/useFranchise';
import { escalationSeverity, escalationLevel, SEVERITY_ORDER, num, type Severity } from '@/lib/franchise';
import {
  C, font, fmtDate, useFranchiseGate, GateLoading,
  SevDot, SevBadge, Chip, SearchInput, AttentionBanner, Metric, LiftCard,
} from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, PremiumEmpty } from '@/components/ui/premium';
import { Flag, Ladder } from '@phosphor-icons/react';

const SEV_LABEL: Record<Severity, string> = { red: 'Critical', yellow: 'Watch', green: 'Resolved' };
const RESOLVED_RE = /resolved|closed/i;

interface EscHealth { severity: Severity; resolved: boolean; label: string; daysOverdue: number }

// Resolved escalations are history — always green. Otherwise days-overdue drives severity.
function computeEscalation(e: Record<string, any>): EscHealth {
  const resolved = RESOLVED_RE.test(String(e.status || ''));
  const daysOverdue = num(e.days_overdue) ?? 0;
  const severity: Severity = resolved ? 'green' : escalationSeverity(e.days_overdue);
  const label = resolved
    ? 'Resolved'
    : daysOverdue > 0 ? `${daysOverdue}d Overdue`
    : daysOverdue === 0 ? 'Due Today'
    : 'On Time';
  return { severity, resolved, label, daysOverdue };
}

export default function EscalationsPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { escalations: raw, loading } = useEscalations();
  const [filter, setFilter] = useState<'all' | Severity>('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const list = ((raw as any[]) || []).map((it) => ({ it, h: computeEscalation(it) }));
    // Worst-first by severity, then most days overdue first.
    list.sort((a, b) =>
      SEVERITY_ORDER[a.h.severity] - SEVERITY_ORDER[b.h.severity] ||
      b.h.daysOverdue - a.h.daysOverdue);
    return list;
  }, [raw]);

  const summary = useMemo(() => {
    const s = { green: 0, yellow: 0, red: 0, total: rows.length, open: 0, resolved: 0, levels: [0, 0, 0, 0] };
    rows.forEach(({ it, h }) => {
      s[h.severity]++;
      if (h.resolved) { s.resolved++; }
      else { s.open++; s.levels[escalationLevel(it.days_overdue).level - 1]++; }
    });
    return s;
  }, [rows]);

  const filtered = rows.filter(({ it, h }) =>
    (filter === 'all' || h.severity === filter) &&
    (!q || `${it.reason || ''} ${it.project_name || ''} ${it.project_city || ''} ${it.item_type || ''} ${it.assigned_to || ''}`.toLowerCase().includes(q.toLowerCase())));

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  const pill: React.CSSProperties = { fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-surface-2)', color: C.dim };

  return (
    <PremiumSurface>
      <div style={{ fontFamily: font, color: C.text }}>
      <ModuleHero
        eyebrow="Command Center"
        eyebrowIcon={<Flag size={13} weight="fill" color="var(--text-secondary)" />}
        title="Escalation"
        accent="Matrix"
        subtitle="Everything past its date across all sites."
      />

      {/* Escalation pulse — open vs resolved, worst-first */}
      {!loading && (
        <StatStrip items={[
          {href: '/app/command-center/escalations',  label: 'Escalations', value: String(summary.total), sub: 'Across all sites' },
          {href: '/app/command-center/escalations',  label: 'Open', value: String(summary.open), accent: summary.open > 0 ? C.gold : undefined, sub: summary.open ? 'Still in the chain' : 'Nothing in flight' },
          {href: '/app/command-center/escalations',  label: 'Critical', value: String(summary.red), accent: summary.red > 0 ? C.red : undefined, sub: '7d+ overdue' },
          {href: '/app/command-center/escalations',  label: 'Watch', value: String(summary.yellow), accent: summary.yellow > 0 ? C.yellow : undefined, sub: '1–6d overdue' },
          {href: '/app/command-center/escalations',  label: 'Resolved', value: String(summary.resolved), accent: C.green, sub: 'Cleared the chain' },
        ]} />
      )}

      <AttentionBanner red={summary.red} yellow={summary.yellow} noun="escalation" />

      {/* 4-level escalation matrix — who owns it as it ages (Super → PM → Director → Exec). */}
      <SectionCard flat title="Escalation Matrix" subtitle="Who owns it now — ownership climbs as items age." icon={<Ladder size={16} weight="duotone" color="var(--text-secondary)" />} style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          {[
            { n: 1, owner: 'Superintendent', hint: '0–2d overdue', color: 'var(--success)' },
            { n: 2, owner: 'Project Manager', hint: '3–6d overdue', color: 'var(--text-primary)' },
            { n: 3, owner: 'Director of Construction', hint: '7–13d overdue', color: 'var(--warning)' },
            { n: 4, owner: 'Executive Leadership', hint: '14d+ overdue', color: 'var(--danger)' },
          ].map((lv) => {
            const count = summary.levels[lv.n - 1];
            return (
              <div key={lv.n} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: `4px solid ${lv.color}`, borderRadius: 12, padding: '12px 14px', opacity: count ? 1 : 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', background: lv.color, borderRadius: 6, padding: '2px 7px' }}>L{lv.n}</span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: count ? lv.color : C.dim, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>{lv.owner}</div>
                <div style={{ fontSize: 12, color: C.faint }}>{lv.hint}</div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {(['all', 'red', 'yellow', 'green'] as const).map((f) => (
          <Chip key={f} active={filter === f} color={f === 'all' ? C.text : ({ red: C.red, yellow: C.yellow, green: C.green } as any)[f]}
            onClick={() => setFilter(f)} count={f === 'all' ? summary.total : (summary as any)[f]}>
            {f !== 'all' && <SevDot sev={f as Severity} size={8} />}
            {f === 'all' ? 'All' : SEV_LABEL[f as Severity]}
          </Chip>
        ))}
        <SearchInput value={q} onChange={setQ} placeholder="Search reason, site…" />
      </div>

      {loading ? (
        <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Loading escalations…</div>
      ) : filtered.length === 0 ? (
        rows.length === 0 ? (
          <SectionCard flat>
            <PremiumEmpty icon={<Flag size={32} weight="duotone" color="var(--text-secondary)" />} title="No escalations"
              description="Nothing has been escalated across your sites. When an RFI, submittal or action item runs past its date and gets bumped up the chain, it lands here — sorted worst first so you always know what to chase." />
          </SectionCard>
        ) : (
          <SectionCard flat>
            <PremiumEmpty compact icon={<Flag size={26} weight="duotone" color="var(--text-secondary)" />} title="Nothing matches this filter"
              description="No escalation matches the current severity or search." onClearFilters={() => { setFilter('all'); setQ(''); }} />
          </SectionCard>
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {filtered.map(({ it, h }) => {
            const dovColor = h.resolved ? C.text : h.daysOverdue >= 7 ? C.red : h.daysOverdue >= 1 ? C.yellow : C.text;
            const lvl = h.resolved ? null : escalationLevel(it.days_overdue);
            return (
              <LiftCard key={it.id} sev={h.severity}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.reason || 'Escalation'}</div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                      {it.project_id ? (
                        <Link href={`/app/projects/${it.project_id}`} style={{ color: C.blue, textDecoration: 'none' }}>{it.project_name || 'Project'}</Link>
                      ) : 'Unassigned'}
                      {it.project_city ? ` · ${it.project_city}, ${it.project_state}` : ''}
                    </div>
                  </div>
                  <SevBadge sev={h.severity} label={h.label} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 13 }}>
                  <Metric label="Type" value={it.item_type || '—'} />
                  <Metric label="Days Overdue" value={it.days_overdue != null ? `${num(it.days_overdue)}d` : '—'} color={dovColor} />
                  <Metric label="Original Due" value={fmtDate(it.original_due)} />
                  <Metric label="Assigned To" value={it.assigned_to || '—'} />
                  <Metric label="Status" value={it.status || '—'} />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12, alignItems: 'center' }}>
                  {lvl && <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: `color-mix(in srgb, ${lvl.color} 9%, transparent)`, color: lvl.color, border: `1px solid color-mix(in srgb, ${lvl.color} 27%, transparent)` }}>L{lvl.level} · {lvl.owner}</span>}
                  {it.item_type && <span style={pill}>{(() => { const t = String(it.item_type).replace(/_/g, ' '); return t.length <= 3 ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1); })()}</span>}
                  {h.resolved && it.resolved_at && <span style={pill}>Resolved {fmtDate(it.resolved_at)}</span>}
                  {!h.resolved && h.daysOverdue > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.dim, marginLeft: 'auto' }}>{h.daysOverdue}d overdue</span>
                  )}
                </div>
              </LiftCard>
            );
          })}
        </div>
      )}
      </div>
    </PremiumSurface>
  );
}
