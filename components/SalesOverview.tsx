'use client';
/**
 * SalesOverview — the salesperson's first screen.
 *
 * The dashboard answers a builder's questions: what is on site, what is
 * outstanding, where the job stands. The person who brings the work IN opens
 * the app with a different set — what am I chasing, what is it worth, what did
 * I win, and what is late — and had to assemble that from four pages.
 *
 * OVERDUE FOLLOW-UPS LEAD, and are their own number rather than part of a
 * total. A lead nobody called does not announce itself: it goes quiet and gets
 * counted as "open" forever, so the most expensive thing in a pipeline is the
 * one a summary is most likely to hide. Late and upcoming are never added
 * together here.
 */
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  TrendUp, CurrencyDollar, Kanban, WarningCircle, CalendarBlank,
  Target, ArrowRight, CheckCircle,
} from '@phosphor-icons/react';
import { SectionCard, StatCard, PremiumEmpty } from '@/components/ui/premium';
import { WinLossBar, DonutRatio } from '@/components/charts';

const GOLD = 'var(--brand-primary)', TEXT = '#FFFFFF', DIM = 'rgba(255,255,255,0.62)';
const BORDER = 'rgba(255,255,255,0.10)', RED = '#FF3B30', AMBER = '#FF8A00', GREEN = '#2CFF7A';

interface FollowUp {
  id: string; what: string; who: string; due: string;
  source: string; leadId?: string; projectId?: string;
}
interface Overview {
  contract: { activeValue: number; activeCount: number; closedValue: number; closedCount: number; completedCount: number };
  pipeline: { openCount: number; value: number; weightedValue: number; byStage: Record<string, { count: number; value: number }> };
  outcomes: { wonCount: number; wonValue: number; lostCount: number; winRate: number | null };
  followUps: {
    overdueCount: number; todayCount: number; upcomingCount: number;
    overdue: FollowUp[]; today: FollowUp[]; upcoming: FollowUp[];
  };
  degraded?: { projects?: boolean; todos?: boolean };
}

const money = (n: number) => `$${(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

/** A calendar day rendered as one — never through Date(), which lands a day
 *  early west of Greenwich on a bare YYYY-MM-DD. */
function dayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return iso || '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === -1) return 'yesterday';
  if (diff === 1) return 'tomorrow';
  if (diff < 0) return `${Math.abs(diff)} days late`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function FollowUpRow({ f, tone }: { f: FollowUp; tone: string }) {
  const href = f.leadId ? '/app/leads' : f.projectId ? `/app/projects/${f.projectId}` : '/app/my-work';
  return (
    <Link
      href={href}
      style={{
        display: 'flex', gap: 10, alignItems: 'baseline', padding: '9px 20px',
        borderTop: `1px solid ${BORDER}`, textDecoration: 'none',
      }}
    >
      <span style={{ color: tone, fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap', minWidth: 78 }}>
        {dayLabel(f.due)}
      </span>
      <span style={{ color: TEXT, fontSize: 13, flex: 1, minWidth: 0 }}>{f.what}</span>
      <span style={{ color: DIM, fontSize: 12.5, whiteSpace: 'nowrap' }}>{f.who}</span>
    </Link>
  );
}

export default function SalesOverview({ style }: { style?: React.CSSProperties }) {
  const [d, setD] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/sales/overview');
      if (!r.ok) throw new Error('Could not load your sales overview.');
      setD(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your sales overview.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SectionCard title="Sales" icon={<TrendUp size={17} weight="duotone" color={GOLD} />} style={style} flush>
        <div style={{ padding: '18px 20px', color: DIM, fontSize: 13 }}>Loading your pipeline…</div>
      </SectionCard>
    );
  }
  if (error || !d) {
    return (
      <SectionCard title="Sales" icon={<TrendUp size={17} weight="duotone" color={GOLD} />} style={style} flush>
        <PremiumEmpty
          icon={<WarningCircle size={28} weight="duotone" color={RED} />}
          title="Could not load your sales overview"
          description={error || 'No data came back.'}
          tone="error"
          compact
          action={<button onClick={load} style={{ padding: '8px 14px', background: 'var(--brand-primary-12)', border: `1px solid var(--brand-primary-25)`, borderRadius: 8, color: GOLD, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Try Again</button>}
        />
      </SectionCard>
    );
  }

  const { contract, pipeline, outcomes, followUps } = d;
  const stages = Object.entries(pipeline.byStage).sort((a, b) => b[1].value - a[1].value);

  return (
    <div style={style}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', marginBottom: 16 }}>
        {/* Every card routes to the section it summarises — contract value to
            the jobs it totals, pipeline and win rate to the leads board, past
            due to the follow-up list on My Work. */}
        <StatCard
          label="Contract Value"
          value={money(contract.activeValue)}
          sub={`${contract.activeCount} active job${contract.activeCount === 1 ? '' : 's'}`}
          icon={<CurrencyDollar size={17} weight="duotone" color={GOLD} />}
          href="/app/projects"
        />
        <StatCard
          label="Pipeline"
          value={money(pipeline.value)}
          sub={`${pipeline.openCount} open · ${money(pipeline.weightedValue)} weighted`}
          icon={<Kanban size={17} weight="duotone" color={GOLD} />}
          href="/app/leads"
        />
        <StatCard
          label="Past Due"
          value={String(followUps.overdueCount)}
          sub={followUps.overdueCount ? 'follow-ups already late' : 'nothing is late'}
          icon={<WarningCircle size={17} weight="duotone" color={followUps.overdueCount ? RED : GREEN} />}
          href="/app/my-work"
        />
        <StatCard
          label="Win Rate"
          value={outcomes.winRate === null ? '—' : `${outcomes.winRate}%`}
          sub={outcomes.winRate === null ? 'nothing decided yet' : `${outcomes.wonCount} won · ${outcomes.lostCount} lost`}
          icon={<Target size={17} weight="duotone" color={GOLD} />}
          href="/app/leads"
        />
      </div>

      {/* Real tracking graphs — win/loss ratio + pipeline mix, live numbers */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: 16 }}>
        <WinLossBar won={outcomes.wonCount} lost={outcomes.lostCount} title="Win / Loss" subtitle="Closed deals" />
        {stages.length > 0 && (
          <DonutRatio
            title="Pipeline by Stage"
            data={stages.map(([stage, v]) => ({ label: stage.replace(/_/g, ' '), value: v.value }))}
            format="currency"
            centerValue={money(pipeline.value)}
            centerLabel="Pipeline"
          />
        )}
      </div>

      <SectionCard
        title="Follow-ups"
        subtitle="Late first, then today, then the week ahead"
        icon={<CalendarBlank size={17} weight="duotone" color={GOLD} />}
        action={
          <Link href="/app/leads" style={{ fontSize: 12.5, fontWeight: 700, color: GOLD, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            Open leads <ArrowRight size={13} weight="bold" />
          </Link>
        }
        style={{ marginBottom: 16 }}
        flush
      >
        {followUps.overdueCount + followUps.todayCount + followUps.upcomingCount === 0 ? (
          <PremiumEmpty
            icon={<CheckCircle size={28} weight="duotone" color={GREEN} />}
            title="Nothing outstanding"
            description="No follow-up is late, due today, or falling due this week. Set a next action on a lead and it appears here."
            compact
          />
        ) : (
          <div>
            {followUps.overdue.length > 0 && (
              <div style={{ padding: '10px 20px 2px', color: RED, fontSize: 12, fontWeight: 800 }}>
                Late · {followUps.overdueCount}
              </div>
            )}
            {followUps.overdue.map(f => <FollowUpRow key={f.id} f={f} tone={RED} />)}

            {followUps.today.length > 0 && (
              <div style={{ padding: '12px 20px 2px', color: AMBER, fontSize: 12, fontWeight: 800 }}>
                Today · {followUps.todayCount}
              </div>
            )}
            {followUps.today.map(f => <FollowUpRow key={f.id} f={f} tone={AMBER} />)}

            {followUps.upcoming.length > 0 && (
              <div style={{ padding: '12px 20px 2px', color: DIM, fontSize: 12, fontWeight: 800 }}>
                Next 7 Days · {followUps.upcomingCount}
              </div>
            )}
            {followUps.upcoming.map(f => <FollowUpRow key={f.id} f={f} tone={DIM} />)}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
