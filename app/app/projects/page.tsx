'use client';
/**
 * Jobs — every job as one flat row, the way the home's Jobs section shows
 * them: name, then stage · start or finish · % billed with a thin bar, and the
 * contract over the city on the right. Stage chips filter in place, a search
 * box narrows by name, address, city or number, and a sort sits beside it.
 *
 * Reads the shared SWR key (useProjects → /api/projects/list), which also
 * carries each job's billing from its pay apps (billed_live). The page chrome
 * paints at once and the rows stand in as skeletons while the list loads.
 */
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useProjects } from '@/lib/hooks/useProjects';
import { humanError } from '@/lib/errors';
import { dayIn, deviceTimeZone } from '@/lib/time-zone';
import { FlatStyles, Brief, FlatList, Row, RowAction, RowSkeleton, FlatEmpty } from '@/components/ui/flat';
import { jobStage, stageLabel, dateLine, fmtMoneyShort, billedPct, plural, ymd, type JobStage } from '@/lib/job-page';
import { isDoneStatus } from '@/lib/project-lifecycle';

type StageFilter = 'all' | 'bidding' | 'building' | 'complete' | 'closed';
type SortKey = 'name' | 'newest' | 'contract' | 'start';

type JobRow = {
  id: string; name?: string | null; status?: string | null; phase?: string | null;
  address?: string | null; city?: string | null; state?: string | null; project_number?: string | null;
  start_date?: string | null; end_date?: string | null; created_at?: string | null;
  contract_amount?: unknown; billed_live?: number; pay_apps_total?: number;
};

/** The chip a job sits under: a closed job is Complete when it was finished, Closed when it was cancelled or lost. */
function bucket(p: JobRow): Exclude<StageFilter, 'all'> {
  const s: JobStage = jobStage(p);
  if (s === 'closed') return isDoneStatus(p.status) ? 'complete' : 'closed';
  return s;
}

const CHIPS: { key: StageFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'bidding', label: 'Bidding' },
  { key: 'building', label: 'Building' },
  { key: 'complete', label: 'Complete' },
  { key: 'closed', label: 'Closed' },
];

export default function JobsPage() {
  const { projects, loading, error: loadError, degraded, revalidate } = useProjects();
  const rows = projects as unknown as JobRow[];
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<StageFilter>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const today = useMemo(() => dayIn(deviceTimeZone() || 'UTC'), []);

  const failed = !!loadError || degraded;
  const ready = !loading && !failed;
  const counts = useMemo(() => {
    const c: Record<StageFilter, number> = { all: rows.length, bidding: 0, building: 0, complete: 0, closed: 0 };
    for (const p of rows) c[bucket(p)]++;
    return c;
  }, [rows]);
  const total = rows.reduce((s, p) => s + (Number(p.contract_amount) || 0), 0);

  const needle = q.trim().toLowerCase();
  const shown = rows
    .filter((p) => stage === 'all' || bucket(p) === stage)
    .filter((p) => !needle || [p.name, p.address, p.city, p.project_number].some((v) => String(v || '').toLowerCase().includes(needle)))
    .sort((a, b) => {
      if (sort === 'contract') return (Number(b.contract_amount) || 0) - (Number(a.contract_amount) || 0);
      if (sort === 'newest') return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      if (sort === 'start') return String(b.start_date || '0000').localeCompare(String(a.start_date || '0000'));
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  const filtering = !!needle || stage !== 'all';
  const clear = () => { setQ(''); setStage('all'); };

  let body: React.ReactNode;
  if (failed) {
    body = <Brief action={{ label: 'Retry', onClick: () => { void revalidate(); } }}>Couldn&apos;t load your jobs. {humanError(loadError, 'The server did not answer.')}</Brief>;
  } else if (loading) {
    body = <RowSkeleton rows={6} />;
  } else if (rows.length === 0) {
    body = <FlatEmpty>No jobs yet. <Link href="/app/projects/new" className="jl-inline">Start the first one ›</Link></FlatEmpty>;
  } else if (shown.length === 0) {
    body = <FlatEmpty>No jobs match. <button type="button" className="jl-inline" onClick={clear}>Clear the filters</button></FlatEmpty>;
  } else {
    body = (
      <FlatList label="Jobs">
        {shown.map((p) => {
          const s = jobStage(p);
          const contract = Number(p.contract_amount) || 0;
          const pct = typeof p.billed_live === 'number' ? billedPct(p.billed_live, contract) : null;
          const when = dateLine(s, ymd(p.start_date), ymd(p.end_date), today);
          const meta = [stageLabel(p), when?.text || null, pct != null ? `${pct}% billed` : null].filter(Boolean).join(' · ');
          return (
            <li key={p.id} data-tour="project-card">
              <Row
                title={p.name || 'Untitled job'}
                meta={meta}
                bar={pct}
                right={contract > 0 ? fmtMoneyShort(contract) : '—'}
                rightSub={p.city || p.state || undefined}
                href={`/app/projects/${p.id}`}
                chevron={false}
              />
            </li>
          );
        })}
      </FlatList>
    );
  }

  return (
    <div className="jl">
      <FlatStyles />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header className="jl-head">
        <div className="jl-title">
          <h1>Jobs</h1>
          <p>{ready ? `${plural(rows.length, 'job')}${total > 0 ? ` · ${fmtMoneyShort(total)} in contracts` : ''}` : loading ? 'Loading your jobs…' : ' '}</p>
        </div>
        <RowAction kind="primary" href="/app/projects/new">New job</RowAction>
      </header>

      <div className="jl-tools">
        <input
          type="search"
          className="jl-search"
          placeholder="Search jobs"
          aria-label="Search jobs by name, address, city or number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
        />
        <select className="jl-sort" aria-label="Sort jobs" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="name">Name</option>
          <option value="newest">Newest</option>
          <option value="contract">Contract</option>
          <option value="start">Start date</option>
        </select>
      </div>

      <div className="jl-chips" role="group" aria-label="Filter by stage">
        {CHIPS.filter((c) => c.key !== 'closed' || counts.closed > 0).map((c) => (
          <button key={c.key} type="button" className="jl-chip" aria-pressed={stage === c.key} onClick={() => setStage(c.key)}>
            {c.label}{ready ? <span>{counts[c.key]}</span> : null}
          </button>
        ))}
        {filtering && ready && <span className="jl-count" role="status">{shown.length} of {rows.length}</span>}
      </div>

      {body}
    </div>
  );
}

/* Theme variables only; injected with dangerouslySetInnerHTML so the server
   and client text match (tools/check-style-escapes.mjs). */
const CSS = `
.jl{max-width:1040px;box-sizing:border-box;padding:4px 0 32px;color:var(--sg-text);background:var(--bg-base);min-height:calc(100vh - 120px)}
.jl-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px 6px}
.jl-title{min-width:0}
.jl-title h1{margin:0;font-size:22px !important;font-weight:700;line-height:1.2;color:var(--sg-text)}
.jl-title p{margin:2px 0 0;font-size:13px;color:var(--sg-text-2);min-height:18px}
.jl-tools{display:flex;gap:8px;padding:6px 16px 4px}
.jl-search,.jl-sort{height:44px;box-sizing:border-box;border:1px solid var(--sg-border);border-radius:10px;background:var(--bg-base);color:var(--sg-text);font:inherit;font-size:16px}
.jl-search{flex:1;min-width:0;padding:0 12px}
.jl-search::placeholder{color:var(--sg-text-3)}
.jl-sort{flex:none;width:auto;max-width:42%;padding:0 10px}
.jl-search:focus-visible,.jl-sort:focus-visible,.jl-chip:focus-visible{outline:2px solid var(--brand-primary);outline-offset:1px}
.jl-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 16px 12px}
.jl-chip{position:relative;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:16px;border:1px solid var(--sg-border);background:none;color:var(--sg-text-2);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;white-space:nowrap}
.jl-chip::after{content:"";position:absolute;inset:-6px -3px}
.jl-chip span{font-variant-numeric:tabular-nums;color:var(--sg-text-3);font-weight:600}
.jl-chip[aria-pressed=true]{background:var(--sg-border);color:var(--sg-text);border-color:var(--sg-border-strong)}
.jl-chip[aria-pressed=true] span{color:var(--sg-text-2)}
.jl-count{margin-left:auto;font-size:12.5px;color:var(--sg-text-3)}
.jl-inline{color:var(--brand-primary);font-weight:650;text-decoration:none;background:none;border:0;padding:0;font:inherit;cursor:pointer;min-height:44px}
@media (min-width:1100px){.jl{padding:12px 8px 48px}}
`;
