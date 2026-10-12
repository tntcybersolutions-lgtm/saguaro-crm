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
import { Archive, CheckCircle, Flag, HardHat, WarningCircle } from '@phosphor-icons/react';
import { FlatStyles, Brief, FlatList, Row, RowAction, RowSkeleton, FlatEmpty, type FlatTone } from '@/components/ui/flat';
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

/** Each stage's icon in its row tile. */
const STAGE_ICON: Record<Exclude<StageFilter, 'all'>, { icon: React.ElementType; tone: FlatTone }> = {
  bidding: { icon: Flag, tone: 'neutral' },
  building: { icon: HardHat, tone: 'info' },
  complete: { icon: CheckCircle, tone: 'success' },
  closed: { icon: Archive, tone: 'neutral' },
};

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
    body = <Brief tone="danger" icon={<WarningCircle size={18} weight="fill" />} action={{ label: 'Retry', onClick: () => { void revalidate(); } }}>Couldn&apos;t load your jobs. {humanError(loadError, 'The server did not answer.')}</Brief>;
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
          const st = STAGE_ICON[bucket(p)];
          return (
            <li key={p.id} data-tour="project-card">
              <Row
                icon={<st.icon size={18} weight="bold" />}
                tone={st.tone}
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
.jl{max-width:1040px;box-sizing:border-box;padding:4px 0 32px;color:var(--fl-text);background:var(--bg-base);min-height:calc(100vh - 120px)}
.jl-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px 6px}
.jl-title{min-width:0}
.jl-title h1{margin:0;font-size:22px !important;font-weight:700;line-height:1.2;color:var(--fl-text)}
.jl-title p{margin:2px 0 0;font-size:13px;color:var(--fl-text-2);min-height:18px}
.jl-tools{display:flex;gap:8px;padding:6px 16px 4px}
/* 16px beats the app-wide 13px !important on fields: under 16px iOS zooms the page on focus. */
.jl-search,.jl-sort{height:44px;min-height:44px;box-sizing:border-box;border:1px solid var(--fl-line);border-radius:10px;background-color:var(--bg-base);color:var(--fl-text);font-family:inherit;font-size:16px !important}
.jl-search{flex:1;min-width:0;padding:0 12px}
.jl-search::placeholder{color:var(--fl-text-3)}
.jl-sort{flex:none;width:auto;max-width:42%;padding:0 34px 0 12px}
.jl-search:focus-visible,.jl-sort:focus-visible,.jl-chip:focus-visible{outline:2px solid var(--focus-ring);outline-offset:1px}
.jl-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 16px 12px}
.jl-chip{position:relative;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--fl-line);background:var(--bg-surface);color:var(--fl-text-2);font:inherit;font-size:13px;font-weight:600;letter-spacing:0;cursor:pointer;white-space:nowrap}
.jl-chip::after{content:"";position:absolute;inset:-4px -3px}
.jl-chip span{font-variant-numeric:tabular-nums;color:var(--fl-text-3);font-weight:600}
.jl-chip:hover:not([aria-pressed=true]){background:var(--bg-row-hover)}
.jl-chip[aria-pressed=true]{background:var(--selected-control-bg);color:var(--selected-control-fg);border-color:var(--selected-control-bg);font-weight:700}
.jl-chip[aria-pressed=true] span{color:var(--selected-control-fg)}
.jl-count{margin-left:auto;font-size:13px;color:var(--fl-text-3)}
.jl-inline{color: var(--link);font-weight:650;text-decoration:none;background:none;border:0;padding:0;font:inherit;cursor:pointer;min-height:44px}
@media (min-width:1100px){.jl{padding:12px 8px 48px}}
`;
