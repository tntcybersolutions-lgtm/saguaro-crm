'use client';
/**
 * Projects — the portfolio, Pass 4 on the kit.
 *
 * Anatomy: title + one primary action (New Project) → StatRow (portfolio at a
 * glance — each tile filters the list) → Toolbar (search, status, sort, view
 * toggle) → the portfolio as cards (default) or a dense DataTable. Under five
 * projects the controls and tiles stay hidden: a GC reads a list that short.
 *
 * Reads the same SWR key the dashboard fills (useProjects) — unchanged.
 */
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fmtDate } from '@/lib/format-date';
import { useProjects } from '@/lib/hooks/useProjects';
import { humanError } from '@/lib/errors';
import { FolderOpen, MagnifyingGlass, Plus, ArrowRight, WarningCircle, SquaresFour, Rows } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select,
  type Column, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { accentForProject, projectMonogram } from '@/lib/project-identity';
import { statusKindForProject } from '@/lib/status-colors';
// One vocabulary for "this job is over", shared with the close API — see
// lib/project-lifecycle.ts. 'complete' is a bucket that has to catch every
// spelling the app writes, or closing a job hides it from its own filter.
import { isDoneStatus } from '@/lib/project-lifecycle';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (n: number) => money.format(Number(n) || 0);
const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** One status → one badge, from lib/status-colors. Planning / precon read amber
 *  (under contract, not yet building); bidding blue; active green; done grey/orange. */
function statusBadge(s: string): { label: string; tone: BadgeTone } {
  const k = String(s || '').toLowerCase();
  if (k === 'planning' || k === 'preconstruction' || k === 'precon') return { label: titleCase(k), tone: 'under_contract' };
  if (k === 'bidding') return { label: 'Bidding', tone: 'lead' };
  return { label: k ? titleCase(k) : 'Unknown', tone: statusKindForProject(k) };
}

type StatusFilter = 'all' | 'active' | 'planning' | 'bidding' | 'complete';
type SortKey = 'name' | 'status' | 'contract' | 'start';

const CSS = `
.prWs > .k-page { max-width: none; }
.prGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.prCard { position: relative; display: block; overflow: hidden; text-decoration: none; padding: 16px; border-radius: var(--radius-md); background: var(--bg-surface); border: 1px solid var(--glass-border); transition: border-color .15s ease, transform .15s ease; }
.prCard:hover { border-color: var(--border-strong); transform: translateY(-1px); }
.prCard:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
.prAccent { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; opacity: .85; }
.prHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 14px; }
.prId { display: flex; align-items: center; gap: 10px; min-width: 0; }
.prMono { width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0; display: grid; place-items: center; font-size: 12px; font-weight: 900; letter-spacing: .03em; border: 1px solid transparent; }
.prMonoSm { width: 24px; height: 24px; border-radius: 7px; font-size: 9px; }
.prName { font-weight: 800; font-size: var(--fs-lg); color: var(--text-primary); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prAddr { font-size: var(--fs-xs); color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
.prFacts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.prFact { background: var(--bg-surface-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 9px 11px; min-width: 0; }
.prFactLabel { font-size: var(--fs-xs); color: var(--text-tertiary); font-weight: 700; margin-bottom: 3px; }
.prFactValue { font-size: var(--fs-md); font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prFactValue[data-muted="true"] { color: var(--text-tertiary); font-weight: 600; }
.prFoot { display: flex; justify-content: space-between; align-items: center; font-size: var(--fs-xs); color: var(--text-tertiary); }
.prOpen { display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-sm); font-weight: 700; color: var(--brand-primary); }
.prNew { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 100%; padding: 24px; border-radius: var(--radius-md); border: 1px dashed var(--brand-primary-35); background: var(--brand-primary-08); text-decoration: none; color: var(--brand-primary); font-weight: 800; }
.prNew:hover { background: var(--brand-primary-12); }
.prNewIcon { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: var(--brand-primary-12); border: 1px solid var(--brand-primary-35); }
.prSkel { height: 196px; border-radius: var(--radius-md); background: var(--bg-surface); border: 1px solid var(--glass-border); padding: 16px; }
.prSkel > div { border-radius: 6px; background: rgba(255,255,255,0.06); }
.prSeg { display: inline-flex; gap: 2px; padding: 2px; border-radius: var(--radius-sm); background: var(--bg-surface-2); border: 1px solid var(--glass-border); }
.prSeg button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 6px; font-size: var(--fs-sm); font-weight: 700; color: var(--text-tertiary); cursor: pointer; }
.prSeg button[aria-pressed="true"] { background: var(--bg-solid-2); color: var(--text-primary); }
.prSeg button:focus-visible { outline: 2px solid var(--brand-primary); }
.prRowName { display: flex; align-items: center; gap: 8px; min-width: 0; }
.prRowName > div { min-width: 0; }
.prRowName b { display: block; color: var(--text-primary); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 320px; }
.prRowName span { display: block; font-size: var(--fs-xs); color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 320px; }
.prMoney { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--text-primary); font-weight: 600; }
.prMuted { color: var(--text-tertiary); }
@media (max-width: 640px) {
  .prWs .k-btn, .prWs .k-stat, .prWs select.k-select, .prWs .k-input, .prSeg button { min-height: 44px; }
  .prWs .k-table td { height: 48px; }
  .prGrid { grid-template-columns: minmax(0, 1fr); }
}
`;

export default function ProjectsPage() {
  const router = useRouter();
  const { projects, loading, error: loadError } = useProjects();
  const error = loadError ? humanError(loadError, 'Failed to load projects. Please try again.') : '';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [sort, setSort] = useState<SortKey>('name');

  useEffect(() => { try { const v = localStorage.getItem('sag_projects_view'); if (v === 'table' || v === 'cards') setView(v); } catch { /* per-device preference only */ } }, []);
  const setViewPersist = (v: 'cards' | 'table') => { setView(v); try { localStorage.setItem('sag_projects_view', v); } catch { /* per-device preference only */ } };

  const filtered = projects.filter((p) => {
    const matchStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'complete' ? isDoneStatus(p.status)
      : p.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  }).sort((a, b) => {
    if (sort === 'contract') return Number(b.contract_amount || 0) - Number(a.contract_amount || 0);
    if (sort === 'status') return String(a.status || '').localeCompare(String(b.status || ''));
    if (sort === 'start') return new Date(b.start_date || 0).getTime() - new Date(a.start_date || 0).getTime();
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  /* Controls appear when there is something to control. Under five projects a
     GC reads the list; the sort, the search, the status filter and the view
     toggle are all noise at that size, and at zero they are a wall in front of
     an empty page. */
  const needsControls = !loading && projects.length >= 5;
  const filtersActive = !!search || statusFilter !== 'all';
  const clearFilters = () => { setSearch(''); setStatusFilter('all'); };
  const toggleStatus = (s: StatusFilter) => setStatusFilter((prev) => (prev === s ? 'all' : s));

  const active = projects.filter((p: any) => p.status === 'active').length;
  const bidding = projects.filter((p: any) => p.status === 'bidding').length;
  const complete = projects.filter((p: any) => isDoneStatus(p.status)).length;
  const totalContract = projects.reduce((s: number, p: any) => s + (Number(p.contract_amount) || 0), 0);

  const stats: StatItem[] = [
    { label: 'Projects', value: projects.length, sub: filtersActive ? 'Click to show everything' : 'In your portfolio', onClick: clearFilters },
    { label: 'Active', value: active, tone: active > 0 ? 'good' : 'default', sub: statusFilter === 'active' ? 'Filtered — click to clear' : 'Under construction', onClick: () => toggleStatus('active') },
    { label: 'Bidding', value: bidding, tone: bidding > 0 ? 'warn' : 'default', sub: statusFilter === 'bidding' ? 'Filtered — click to clear' : 'In pursuit', onClick: () => toggleStatus('bidding') },
    { label: 'Complete / Closed', value: complete, sub: statusFilter === 'complete' ? 'Filtered — click to clear' : 'Delivered jobs', onClick: () => toggleStatus('complete') },
    { label: 'Portfolio Value', value: totalContract > 0 ? fmtUsd(totalContract) : '—', sub: 'Combined contracts' },
  ];

  const columns: Column<any>[] = [
    { key: 'name', header: 'Project', accessor: (p) => String(p.name || '').toLowerCase(), render: (p) => { const acc = accentForProject(p.id); return (
      <div className="prRowName">
        <span aria-hidden className="prMono prMonoSm" style={{ background: acc.soft, borderColor: acc.ring, color: acc.hex }}>{projectMonogram(p.name)}</span>
        <div><b>{p.name}</b><span>{p.address || 'No address set'}</span></div>
      </div>
    ); } },
    { key: 'status', header: 'Status', accessor: (p) => String(p.status || ''), render: (p) => { const b = statusBadge(p.status || ''); return <Badge tone={b.tone}>{b.label}</Badge>; } },
    { key: 'project_type', header: 'Type', accessor: (p) => String(p.project_type || ''), render: (p) => <span className="prMuted">{p.project_type ? titleCase(String(p.project_type)) : '—'}</span> },
    { key: 'contract_amount', header: 'Contract', accessor: (p) => Number(p.contract_amount) || 0, align: 'right', render: (p) => { const c = Number(p.contract_amount) || 0; return c > 0 ? <span className="prMoney">{fmtUsd(c)}</span> : <span className="prMuted">—</span>; } },
    { key: 'start_date', header: 'Start', accessor: (p) => String(p.start_date || ''), render: (p) => <span className="prMuted">{p.start_date ? fmtDate(p.start_date) : '—'}</span> },
  ];

  let body: React.ReactNode;
  if (error) {
    body = <Card flush><EmptyState icon={<WarningCircle size={22} />} title="Couldn't load projects" text={error} /></Card>;
  } else if (loading) {
    body = (
      <div className="prGrid" aria-busy="true" aria-label="Loading projects">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="prSkel">
            <div style={{ height: 16, width: '60%', marginBottom: 10 }} />
            <div style={{ height: 12, width: '40%', marginBottom: 18 }} />
            <div style={{ height: 56 }} />
          </div>
        ))}
      </div>
    );
  } else if (filtered.length === 0) {
    body = (
      <Card flush>
        {projects.length === 0
          ? <EmptyState icon={<FolderOpen size={22} />} title="No projects yet" text="Create your first project to start tracking the work — bids, schedule, field, and billing all hang off it." action={<Button variant="primary" icon={<Plus size={15} weight="bold" />} href="/app/projects/new">Create Your First Project</Button>} />
          : <EmptyState icon={<MagnifyingGlass size={22} />} title="No projects match these filters" text="Clear the search or status filter to see more." action={<Button onClick={clearFilters}>Clear Filters</Button>} />}
      </Card>
    );
  } else if (view === 'table' && needsControls) {
    body = (
      <Card flush>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(p) => p.id}
          defaultSort={{ key: 'name', dir: 'asc' }}
          onRowClick={(p) => router.push(`/app/projects/${p.id}`)}
        />
      </Card>
    );
  } else {
    body = (
      <div className="prGrid">
        {filtered.map((p: any) => {
          const b = statusBadge(p.status || '');
          const contract = Number(p.contract_amount || 0);
          const acc = accentForProject(p.id);
          return (
            <Link key={p.id} data-tour="project-card" href={`/app/projects/${p.id}`} className="prCard">
              <div aria-hidden className="prAccent" style={{ background: `linear-gradient(180deg, ${acc.hex}, transparent)` }} />
              <div className="prHead">
                <div className="prId">
                  <div aria-hidden className="prMono" style={{ background: acc.soft, borderColor: acc.ring, color: acc.hex }}>{projectMonogram(p.name)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="prName">{p.name}</div>
                    <div className="prAddr">{p.address || 'No address set'}</div>
                  </div>
                </div>
                <Badge tone={b.tone}>{b.label}</Badge>
              </div>
              <div className="prFacts">
                <div className="prFact"><div className="prFactLabel">Contract</div><div className="prFactValue" data-muted={contract > 0 ? undefined : 'true'}>{contract > 0 ? fmtUsd(contract) : '—'}</div></div>
                <div className="prFact"><div className="prFactLabel">Type</div><div className="prFactValue" data-muted={p.project_type ? undefined : 'true'}>{p.project_type ? titleCase(String(p.project_type)) : '—'}</div></div>
              </div>
              <div className="prFoot">
                <span>{p.start_date ? fmtDate(p.start_date, { month: 'short', year: 'numeric' }) : 'No start date'}</span>
                <span className="prOpen">Open <ArrowRight size={13} weight="bold" /></span>
              </div>
            </Link>
          );
        })}
        <Link href="/app/projects/new" className="prNew">
          <div className="prNewIcon"><Plus size={22} weight="bold" /></div>
          <div>New Project</div>
        </Link>
      </div>
    );
  }

  return (
    <div className="prWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Projects' }]}
        title="Projects"
        subtitle={loading ? 'Loading your projects…' : `${filtered.length} project${filtered.length !== 1 ? 's' : ''}${filtersActive ? ` of ${projects.length}` : ' across your portfolio'}.`}
        actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} href="/app/projects/new">New Project</Button>}
      >
        {!error && needsControls && <StatRow items={stats} />}

        {needsControls && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by name or address…"
            filters={
              <>
                <Select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={{ width: 'auto', minWidth: 150 }} options={[
                  { value: 'all', label: 'All Statuses' }, { value: 'active', label: 'Active' }, { value: 'planning', label: 'Planning' }, { value: 'bidding', label: 'Bidding' }, { value: 'complete', label: 'Complete / Closed' },
                ]} />
                <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ width: 'auto', minWidth: 150 }} options={[
                  { value: 'name', label: 'Sort: Name' }, { value: 'status', label: 'Sort: Status' }, { value: 'contract', label: 'Sort: Contract' }, { value: 'start', label: 'Sort: Start Date' },
                ]} />
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={
              <div className="prSeg" role="group" aria-label="View">
                <button type="button" aria-pressed={view === 'cards'} onClick={() => setViewPersist('cards')}><SquaresFour size={14} weight="bold" /> Cards</button>
                <button type="button" aria-pressed={view === 'table'} onClick={() => setViewPersist('table')}><Rows size={14} weight="bold" /> Table</button>
              </div>
            }
          />
        )}

        {body}
      </PageShell>
    </div>
  );
}
