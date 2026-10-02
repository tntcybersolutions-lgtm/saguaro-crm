'use client';
/*
 * app/app/sales — the Sales rep's home (sales workspace, Phase 1).
 *
 * The ask: a salesperson should land on their own world — pipeline, what's
 * late, the jobs, one hop to everything they touch — the way JobTread drops a
 * rep onto a dashboard, not onto a GC's build board. The pieces already exist
 * (SalesOverview self-fetches /api/sales/overview: pipeline value, follow-ups
 * late/today/upcoming, won vs active). They were only ever buried halfway down
 * the shared dashboard. This assembles them into one rep-facing page and hangs
 * the quick hops (Jobs, Leads, Customers, Reports, People/permissions) above
 * it, so "what does the sales guy see when he logs in" has one answer.
 *
 * Gated on Sales:View. A user without it is sent to the normal dashboard rather
 * than shown an empty sales shell.
 */
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/lib/hooks/usePermissions';
import SalesOverview from '@/components/SalesOverview';
import { ModuleHero } from '@/components/ui/premium';

const BG = '#1c1c1e', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.12)';
const TEXT = '#FFFFFF', DIM = '#CBD5E1', BLUE = '#3B82F6', GOLD = '#F59E0B';

/** One quick-hop tile. */
function Hop({ href, title, desc, tone }: { href: string; title: string; desc: string; tone: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'block', textDecoration: 'none', color: TEXT,
        background: RAISED, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${tone}`,
        borderRadius: 12, padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>{desc}</div>
    </Link>
  );
}

const GREEN = '#22C55E', RED = '#EF4444';
const usd = (cents: number) => '$' + Math.round((cents || 0) / 100).toLocaleString('en-US');

type ProfitJob = {
  projectId: string; name: string | null; revenueCents: number;
  costCents: number | null; marginCents: number | null; marginPct: number | null; hasCostData: boolean;
};
type ProfitData = {
  jobs: ProfitJob[];
  totals: { jobCount: number; costedJobCount: number; totalRevenueCents: number; totalCostCents: number; totalMarginCents: number; marginPct: number | null };
};

/** Booked profit across active jobs — revenue vs the same projected cost Cost Control shows. */
function ProfitPanel() {
  const [data, setData] = React.useState<ProfitData | null>(null);
  const [state, setState] = React.useState<'loading' | 'ok' | 'error'>('loading');

  React.useEffect(() => {
    let off = false;
    fetch('/api/sales/profit')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!off) { setData(d as ProfitData); setState('ok'); } })
      .catch(() => { if (!off) setState('error'); });
    return () => { off = true; };
  }, []);

  const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 14 };
  if (state === 'loading') return <div style={{ ...card, color: DIM }}>Loading booked profit…</div>;
  if (state === 'error' || !data) return <div style={{ ...card, color: DIM }}>Couldn’t load profit right now.</div>;

  const t = data.totals;
  const marginTone = t.totalMarginCents >= 0 ? GREEN : RED;
  const tile = (label: string, value: string, tone = TEXT, sub?: string) => (
    <div style={{ flex: '1 1 150px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: tone, marginTop: 4 }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );

  const costed = data.jobs.filter((j) => j.hasCostData).slice(0, 6);
  const uncosted = t.jobCount - t.costedJobCount;

  return (
    <div style={card}>
      <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 10 }}>
        Booked profit · active jobs
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: costed.length ? 14 : 0 }}>
        {tile('Booked margin', usd(t.totalMarginCents), marginTone, t.marginPct != null ? `${t.marginPct}% of contract` : undefined)}
        {tile('Contract revenue', usd(t.totalRevenueCents), TEXT, `${t.costedJobCount} job${t.costedJobCount === 1 ? '' : 's'} with costs`)}
        {tile('Projected cost', usd(t.totalCostCents), TEXT, 'worst of budget / committed / actual')}
      </div>

      {costed.length > 0 && (
        <div>
          {costed.map((j) => (
            <Link key={j.projectId} href={`/app/projects/${j.projectId}`} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
              padding: '9px 2px', borderBottom: `1px solid ${BORDER}`, textDecoration: 'none', color: TEXT,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.name || 'Untitled job'}</span>
              <span style={{ display: 'flex', gap: 12, alignItems: 'center', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 12, color: DIM }}>{usd(j.revenueCents)}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: (j.marginCents ?? 0) >= 0 ? GREEN : RED, minWidth: 90, textAlign: 'right' }}>
                  {usd(j.marginCents ?? 0)}{j.marginPct != null ? ` · ${j.marginPct}%` : ''}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {uncosted > 0 && (
        <div style={{ fontSize: 11, color: DIM, marginTop: 10 }}>
          {uncosted} active job{uncosted === 1 ? '' : 's'} have no budget or cost yet — add a budget to see their margin.
        </div>
      )}
    </div>
  );
}

export default function SalesHomePage() {
  const { can, resolved, name } = usePermissions();
  const router = useRouter();

  // Only send someone away once we actually know they lack Sales (resolved);
  // until then usePermissions fails open, so we render rather than flash-redirect.
  React.useEffect(() => {
    if (resolved && !can('Sales', 'View')) router.replace('/app');
  }, [resolved, can, router]);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto', color: TEXT }}>
      <ModuleHero
        eyebrow="Winning the work"
        title={name ? `${name.split(' ')[0]}'s pipeline` : 'Your pipeline'}
        subtitle="What you're chasing, what it's worth, and what's gone quiet — first thing, every day."
        accentColor={BLUE}
        actions={
          <Link href="/app/leads" style={{
            padding: '9px 18px', background: GOLD, color: '#000', borderRadius: 8,
            fontWeight: 800, fontSize: 13, textDecoration: 'none',
          }}>Open the pipeline →</Link>
        }
      />

      {/* Quick hops — the rep's whole surface, one tap each. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 12, marginBottom: 22,
      }}>
        <Hop href="/app/leads"     title="Leads & deals"  desc="The stage board — move a deal, open its page" tone={BLUE} />
        <Hop href="/app/projects"  title="Jobs"           desc="Everything won and running" tone={GOLD} />
        <Hop href="/app/customers" title="Customers"      desc="Who you're working with" tone={BLUE} />
        <Hop href="/app/reports"   title="Reports"        desc="Win rate, revenue, activity" tone={GOLD} />
        <Hop href="/app/people"    title="Reps & access"  desc="Add a rep, set what each role can touch" tone={BLUE} />
      </div>

      {/* Booked profit across active jobs (same cost engine as Cost Control). */}
      <ProfitPanel />

      {/* Pipeline + follow-ups, self-fetched from /api/sales/overview. */}
      <SalesOverview />
    </div>
  );
}
