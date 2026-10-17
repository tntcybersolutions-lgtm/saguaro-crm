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
import { ArrowRight, FolderSimple, AddressBook, ChartBar, Users, MagnifyingGlass } from '@phosphor-icons/react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import SalesOverview from '@/components/SalesOverview';
import { PageShell, Card, Button, Badge, DataTable, EmptyState, type Column, type BadgeTone } from '@/components/ui/kit';

const usd = (cents: number) => {
  const d = Math.round((cents || 0) / 100);
  return `${d < 0 ? '−' : ''}$${Math.abs(d).toLocaleString('en-US')}`;
};

type SearchHit = { type: string; id: string; label: string; sub?: string; href: string };
const HIT_TONE: Record<string, BadgeTone> = { lead: 'lead', job: 'ongoing', customer: 'closed' };
const HIT_LABEL: Record<string, string> = { lead: 'Lead', job: 'Job', customer: 'Customer', photo: 'Photo' };

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
      fetch(`/api/search?q=${encodeURIComponent(term)}&types=lead,job,customer,photo`)
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
                <Badge tone={HIT_TONE[h.type] ?? 'neutral'}>{HIT_LABEL[h.type] ?? h.type}</Badge>
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
        <span style={{ fontWeight: 700, color: (j.marginCents ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
          {usd(j.marginCents ?? 0)}{j.marginPct != null ? ` · ${j.marginPct}%` : ''}
        </span>
      ),
    },
  ];

  if (state === 'error') {
    return (
      <Card title="Booked profit">
        <EmptyState title="Couldn't load profit right now" />
      </Card>
    );
  }

  const t = data?.totals;
  const costed = (data?.jobs ?? []).filter((j) => j.hasCostData).slice(0, 6);
  const uncosted = t ? t.jobCount - t.costedJobCount : 0;

  /* One summary per screen: the pipeline figures lead (SalesOverview); the
     margin totals ride on this section's own line. */
  const totalsLine = t && t.costedJobCount > 0
    ? `${usd(t.totalMarginCents)} margin${t.marginPct != null ? ` (${t.marginPct}%)` : ''} on ${usd(t.totalRevenueCents)}${uncosted > 0 ? ` · ${uncosted} job${uncosted === 1 ? '' : 's'} without a budget` : ''}`
    : uncosted > 0 ? `${uncosted} active job${uncosted === 1 ? '' : 's'} without a budget` : undefined;
  return (
    <>
      <Card
        flush
        title="Booked profit"
        subtitle={totalsLine}
        actions={<Button size="sm" variant="ghost" href="/app/billing/cost-control" icon={<ArrowRight size={13} />}>Cost control</Button>}
      >
        <DataTable
          columns={columns}
          rows={costed}
          rowKey={(j) => j.projectId}
          loading={state === 'loading'}
          onRowClick={(j) => router.push(`/app/projects/${j.projectId}`)}
          empty={<EmptyState title="No job has a budget yet" action={<Button href="/app/billing/cost-control">Open cost control</Button>} />}
        />
      </Card>
    </>
  );
}

const SALES_CSS = `
.slHops { display: flex; flex-wrap: wrap; gap: 4px; }
@media (max-width: 767px) {
  .slHops { width: 100%; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .slHops .k-btn { justify-content: center; min-height: 44px; padding-left: 4px; padding-right: 4px; }
}
`;

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
      actions={<Button variant="primary" href="/app/leads" icon={<ArrowRight size={15} />}>Open leads</Button>}
    >
      <style dangerouslySetInnerHTML={{ __html: SALES_CSS }} />
      {/* Universal search + the rep's quick hops, one row. */}
      <div className="k-toolbar">
        <UniversalSearch />
        <div className="k-toolbar-spacer" />
        <nav className="slHops" aria-label="Sales shortcuts">
          <Button size="sm" variant="ghost" href="/app/projects" icon={<FolderSimple size={15} />} title="Everything won and running">Jobs</Button>
          <Button size="sm" variant="ghost" href="/app/customers" icon={<AddressBook size={15} />} title="Who you're working with">Customers</Button>
          <Button size="sm" variant="ghost" href="/app/reports" icon={<ChartBar size={15} />} title="Win rate, revenue, activity">Reports</Button>
          <Button size="sm" variant="ghost" href="/app/people" icon={<Users size={15} />} title="Add a rep, set what each role can touch">Reps</Button>
        </nav>
      </div>

      {/* Pipeline + follow-ups, self-fetched from /api/sales/overview (shared with the dashboard). */}
      <SalesOverview />

      {/* Booked profit across active jobs (same cost engine as Cost Control). */}
      <ProfitPanel />
    </PageShell>
  );
}
