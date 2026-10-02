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
 * Built on components/ui/kit (design system Phase 2).
 *
 * Gated on Sales:View. A user without it is sent to the normal dashboard rather
 * than shown an empty sales shell.
 */
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Kanban, FolderSimple, AddressBook, ChartBar, Users, MagnifyingGlass } from '@phosphor-icons/react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import SalesOverview from '@/components/SalesOverview';
import { PageShell, Card, StatRow, Button, Badge, DataTable, EmptyState, type Column, type BadgeTone } from '@/components/ui/kit';

const usd = (cents: number) => '$' + Math.round((cents || 0) / 100).toLocaleString('en-US');

type SearchHit = { type: string; id: string; label: string; sub?: string; href: string };
const HIT_TONE: Record<string, BadgeTone> = { lead: 'lead', job: 'under_contract', customer: 'lead' };

/** Universal search — one box across leads, jobs, customers, photos (/api/search). */
function UniversalSearch() {
  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setOpen(false); return; }
    setBusy(true);
    const h = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d) => { setHits(d.results || []); setOpen(true); })
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 220);
    return () => clearTimeout(h);
  }, [q]);

  // Close the results on an outside click.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={boxRef} className="k-search" style={{ flex: '1 1 420px', maxWidth: 640 }}>
      <MagnifyingGlass size={15} />
      <input
        className="k-input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (hits.length) setOpen(true); }}
        placeholder="Search leads, jobs, customers, photos…"
        aria-label="Search leads, jobs, customers, photos"
      />
      {open && (
        <div className="k-menu-list" role="listbox" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60 }}>
          {hits.length === 0 ? (
            <div className="k-hint" style={{ padding: '8px 10px' }}>{busy ? 'Searching…' : `No matches for “${q.trim()}”.`}</div>
          ) : hits.map((h) => (
            <Link key={`${h.type}:${h.id}`} href={h.href} className="k-menu-item" onClick={() => setOpen(false)} style={{ justifyContent: 'space-between' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.label}</span>
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                {h.sub ? <span className="k-hint">{h.sub}</span> : null}
                <Badge tone={HIT_TONE[h.type] ?? 'neutral'}>{h.type}</Badge>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const router = useRouter();
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

  const columns: Column<ProfitJob>[] = [
    { key: 'name', header: 'Job', primary: true, accessor: (j) => j.name || 'Untitled job' },
    { key: 'revenueCents', header: 'Contract', align: 'right', render: (j) => usd(j.revenueCents) },
    { key: 'costCents', header: 'Projected cost', align: 'right', render: (j) => usd(j.costCents ?? 0) },
    {
      key: 'marginCents', header: 'Margin', align: 'right', accessor: (j) => j.marginCents ?? 0,
      render: (j) => (
        <span style={{ fontWeight: 700, color: (j.marginCents ?? 0) >= 0 ? '#34D399' : '#F87171' }}>
          {usd(j.marginCents ?? 0)}{j.marginPct != null ? ` · ${j.marginPct}%` : ''}
        </span>
      ),
    },
  ];

  if (state === 'error') {
    return (
      <Card title="Booked profit · active jobs">
        <EmptyState title="Couldn’t load profit right now" text="Check your connection and reload the page." />
      </Card>
    );
  }

  const t = data?.totals;
  const costed = (data?.jobs ?? []).filter((j) => j.hasCostData).slice(0, 6);
  const uncosted = t ? t.jobCount - t.costedJobCount : 0;

  return (
    <>
      {t && (
        <StatRow items={[
          { label: 'Booked margin', value: usd(t.totalMarginCents), tone: t.totalMarginCents >= 0 ? 'good' : 'bad', sub: t.marginPct != null ? `${t.marginPct}% of contract` : undefined },
          { label: 'Contract revenue', value: usd(t.totalRevenueCents), sub: `${t.costedJobCount} job${t.costedJobCount === 1 ? '' : 's'} with costs` },
          { label: 'Projected cost', value: usd(t.totalCostCents), sub: 'worst of budget / committed / actual' },
        ]} />
      )}
      <Card
        flush
        title="Booked profit · active jobs"
        subtitle={uncosted > 0 ? `${uncosted} active job${uncosted === 1 ? ' has' : 's have'} no budget or cost yet — add a budget to see the margin.` : undefined}
        actions={<Button size="sm" variant="ghost" href="/app/billing/cost-control" icon={<ArrowRight size={13} />}>Cost Control</Button>}
      >
        <DataTable
          columns={columns}
          rows={costed}
          rowKey={(j) => j.projectId}
          loading={state === 'loading'}
          onRowClick={(j) => router.push(`/app/projects/${j.projectId}`)}
          empty={<EmptyState title="No costed jobs yet" text="Add a budget to an active job to see its booked margin here." />}
        />
      </Card>
    </>
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
    <PageShell
      title={name ? `${name.split(' ')[0]}'s pipeline` : 'Your pipeline'}
      subtitle="What you're chasing, what it's worth, and what's gone quiet — first thing, every day."
      actions={<Button variant="primary" href="/app/leads" icon={<ArrowRight size={15} />}>Open the pipeline</Button>}
    >
      {/* Universal search + the rep's quick hops, one row. */}
      <div className="k-toolbar">
        <UniversalSearch />
        <div className="k-toolbar-spacer" />
        <Button href="/app/leads" icon={<Kanban size={15} />} title="The stage board — move a deal, open its page">Leads & deals</Button>
        <Button href="/app/projects" icon={<FolderSimple size={15} />} title="Everything won and running">Jobs</Button>
        <Button href="/app/customers" icon={<AddressBook size={15} />} title="Who you're working with">Customers</Button>
        <Button href="/app/reports" icon={<ChartBar size={15} />} title="Win rate, revenue, activity">Reports</Button>
        <Button href="/app/people" icon={<Users size={15} />} title="Add a rep, set what each role can touch">Reps & access</Button>
      </div>

      {/* Booked profit across active jobs (same cost engine as Cost Control). */}
      <ProfitPanel />

      {/* Pipeline + follow-ups, self-fetched from /api/sales/overview (shared with the dashboard). */}
      <SalesOverview />
    </PageShell>
  );
}
