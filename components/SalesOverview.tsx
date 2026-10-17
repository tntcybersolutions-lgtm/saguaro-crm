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
import { apiErrorFrom } from '@/lib/api-refusal';
import Link from 'next/link';
import {
  CurrencyDollar, Kanban, WarningCircle, Target, ArrowRight, CheckCircle,
} from '@phosphor-icons/react';
import { StatRow, EmptyState, Button, type StatItem } from '@/components/ui/kit';
import { WinLossBar, DonutRatio } from '@/components/charts';

const DIM = 'var(--text-tertiary)', RED = 'var(--danger)', AMBER = 'var(--warning)', GREEN = 'var(--success)';

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
  const href = f.leadId ? `/app/leads/${f.leadId}` : f.projectId ? `/app/projects/${f.projectId}` : '/app/my-work';
  return (
    <Link href={href} className="so-row">
      <span className="so-when" style={{ color: tone }}>{dayLabel(f.due)}</span>
      <span className="so-what">{f.what}</span>
      {f.who && <span className="so-who">{f.who}</span>}
    </Link>
  );
}

/* Flat: figures on the page, rows divided by hairlines, no panels. */
const SO_CSS = `
.so { display: flex; flex-direction: column; gap: var(--section-gap, 16px); min-width: 0; }
.so-charts { display: grid; gap: 24px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); align-items: start; }
.so-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-default); }
.so-head h2 { margin: 0; font-size: var(--fs-section, 16px); font-weight: 700; color: var(--title-section); }
.so-head a { font-size: 13px; font-weight: 600; color: var(--link); text-decoration: none; display: inline-flex; align-items: center; gap: 5px; min-height: 44px; }
.so-group { padding: 12px 0 4px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.so-row { display: flex; gap: 12px; align-items: baseline; padding: 12px 0; min-height: 44px; box-sizing: border-box; border-bottom: 1px solid var(--border-default); text-decoration: none; }
.so-row:hover { background: var(--bg-row-hover); }
.so-when { font-size: 13px; font-weight: 700; white-space: nowrap; min-width: 84px; }
.so-what { color: var(--text-primary); font-size: 14px; flex: 1; min-width: 0; }
.so-who { color: var(--text-secondary); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40%; }
.so-none { display: flex; align-items: center; gap: 8px; padding: 14px 0; color: var(--text-secondary); font-size: 14px; }
@media (max-width: 767px) {
  .so-row { flex-wrap: wrap; row-gap: 2px; }
  .so-who { max-width: none; flex-basis: 100%; padding-left: 96px; }
}
`;
const FLAT_CHART: React.CSSProperties = { background: 'transparent', border: 'none', boxShadow: 'none', padding: 0, borderRadius: 0 };

export default function SalesOverview({ style }: { style?: React.CSSProperties }) {
  const [d, setD] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/sales/overview');
      if (!r.ok) throw await apiErrorFrom(r, 'Could not load your sales overview.');
      setD(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your sales overview.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div style={style} className="k-hint" aria-busy="true">Loading your pipeline…</div>;
  }
  if (error || !d) {
    return (
      <div style={style}>
        <EmptyState
          icon={<WarningCircle size={20} />}
          title="Couldn't load your sales overview"
          text={error || 'No data came back.'}
          action={<Button onClick={load}>Try again</Button>}
        />
      </div>
    );
  }

  const { contract, pipeline, outcomes, followUps } = d;
  const stages = Object.entries(pipeline.byStage).filter(([, v]) => v.value > 0).sort((a, b) => b[1].value - a[1].value);
  const decided = outcomes.wonCount + outcomes.lostCount;
  const nothingDue = followUps.overdueCount + followUps.todayCount + followUps.upcomingCount === 0;

  /* Every figure routes to the section it summarises — pipeline and win rate
     to the leads board, past due to the follow-up list on My Work, contract
     value to the jobs it totals. Past due leads: it is the number a summary
     is most likely to hide. */
  const stats: StatItem[] = [
    { label: 'Past due', value: followUps.overdueCount, icon: <WarningCircle size={15} />, tone: followUps.overdueCount ? 'bad' : 'good',
      sub: followUps.overdueCount ? `follow-up${followUps.overdueCount === 1 ? '' : 's'} late` : 'Nothing late', href: '/app/my-work' },
    { label: 'Pipeline', value: money(pipeline.value), icon: <Kanban size={15} />,
      sub: `${pipeline.openCount} open · ${money(pipeline.weightedValue)} weighted`, href: '/app/leads' },
    ...(decided > 0 ? [{ label: 'Win rate', value: `${outcomes.winRate ?? 0}%`, icon: <Target size={15} />,
      sub: `${outcomes.wonCount} won · ${outcomes.lostCount} lost`, href: '/app/leads' } as StatItem] : []),
    { label: 'Active contracts', value: money(contract.activeValue), icon: <CurrencyDollar size={15} />,
      sub: `${contract.activeCount} job${contract.activeCount === 1 ? '' : 's'}`, href: '/app/projects' },
  ];

  return (
    <div style={style} className="so">
      <style dangerouslySetInnerHTML={{ __html: SO_CSS }} />
      <StatRow items={stats} />

      <section aria-labelledby="so-fu">
        <div className="so-head">
          <h2 id="so-fu">Follow-ups</h2>
          <Link href="/app/leads">Open leads <ArrowRight size={13} weight="bold" /></Link>
        </div>
        {nothingDue ? (
          <div className="so-none"><CheckCircle size={18} weight="fill" color={GREEN} /> Nothing late, due today or due this week.</div>
        ) : (
          <div>
            {followUps.overdue.length > 0 && <div className="so-group" style={{ color: RED }}>Late · {followUps.overdueCount}</div>}
            {followUps.overdue.map(f => <FollowUpRow key={f.id} f={f} tone={RED} />)}
            {followUps.today.length > 0 && <div className="so-group" style={{ color: AMBER }}>Today · {followUps.todayCount}</div>}
            {followUps.today.map(f => <FollowUpRow key={f.id} f={f} tone={AMBER} />)}
            {followUps.upcoming.length > 0 && <div className="so-group" style={{ color: DIM }}>Next 7 days · {followUps.upcomingCount}</div>}
            {followUps.upcoming.map(f => <FollowUpRow key={f.id} f={f} tone={DIM} />)}
          </div>
        )}
      </section>

      {(decided > 0 || stages.length > 0) && (
        <div className="so-charts">
          {decided > 0 && <WinLossBar won={outcomes.wonCount} lost={outcomes.lostCount} title="Win / loss" style={FLAT_CHART} />}
          {stages.length > 0 && (
            <DonutRatio
              title="Pipeline by stage"
              data={stages.map(([stage, v]) => ({ label: stage.replace(/_/g, ' '), value: v.value }))}
              format="currency"
              centerValue={money(pipeline.value)}
              centerLabel="Pipeline"
              size={168}
              style={FLAT_CHART}
            />
          )}
        </div>
      )}
    </div>
  );
}
