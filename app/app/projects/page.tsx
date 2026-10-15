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
import { WarningCircle } from '@phosphor-icons/react';
import { FlatStyles, Brief, RowAction, RowSkeleton, FlatEmpty } from '@/components/ui/flat';
import { jobStage, stageLabel, dateLine, fmtMoneyShort, billedPct, plural, ymd, type JobStage } from '@/lib/job-page';
import type { JobHealth } from '@/lib/job-health';
import { HealthRing, ScheduleBar, ItemDots, OverUnder, StagePill, PortfolioBand, ITEM_COLUMNS, fmtMoneyExact, JOB_HEALTH_CSS } from '@/components/jobs/JobHealthParts';
import { isDoneStatus } from '@/lib/project-lifecycle';

type StageFilter = 'all' | 'bidding' | 'building' | 'complete' | 'closed';
type SortKey = 'health' | 'name' | 'newest' | 'contract' | 'start';

type JobRow = {
  id: string; name?: string | null; status?: string | null; phase?: string | null;
  address?: string | null; city?: string | null; state?: string | null; project_number?: string | null;
  start_date?: string | null; end_date?: string | null; created_at?: string | null;
  contract_amount?: unknown; billed_live?: number; pay_apps_total?: number;
  health?: JobHealth;
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
  const [sort, setSort] = useState<SortKey>('health');
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
      if (sort === 'health') return (a.health?.score ?? 101) - (b.health?.score ?? 101) || String(a.name || '').localeCompare(String(b.name || ''));
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
      <>
      <PortfolioBand jobs={shown.map((p) => ({ id: p.id, name: p.name, contract: Number(p.contract_amount) || 0, billed: typeof p.billed_live === 'number' ? p.billed_live : null, health: p.health }))} />
      <div className="jt" role="table" aria-label="Jobs">
        <div className="jt-head" role="row">
          <span role="columnheader">Health</span>
          <span role="columnheader">Job · schedule</span>
          <span role="columnheader" className="jt-money">Over / under</span>
          <span role="columnheader" className="jt-dots-head">{ITEM_COLUMNS.map((c) => <em key={c}>{c}</em>)}</span>
          <span role="columnheader" className="jt-money">Contract</span>
        </div>
        {shown.map((p) => {
          const s = jobStage(p);
          const contract = Number(p.contract_amount) || 0;
          const pct = typeof p.billed_live === 'number' ? billedPct(p.billed_live, contract) : null;
          const when = dateLine(s, ymd(p.start_date), ymd(p.end_date), today);
          const meta = [when?.text || null, p.city || p.state || null, p.project_number ? `#${p.project_number}` : null].filter(Boolean).join(' · ');
          const h = p.health;
          const sched = h?.schedule;
          const schedText = sched && (sched.workPct != null || sched.timePct != null)
            ? [sched.workPct != null ? `${sched.workPct}% done` : null, sched.daysLate > 0 ? `${sched.daysLate}d late` : sched.timePct != null ? `${sched.timePct}% of time` : null].filter(Boolean).join(' · ')
            : 'No dates yet';
          return (
            <Link key={p.id} href={`/app/projects/${p.id}`} className="jt-row" role="row" data-tour="project-card" data-tone={h?.tone || 'none'}>
              <span className="jt-ring" role="cell"><HealthRing health={h} size={46} /></span>
              <span className="jt-name" role="cell">
                <b>{p.name || 'Untitled job'}</b>
                <span className="jt-meta"><StagePill stage={bucket(p)} label={stageLabel(p)} />{meta ? <small>{meta}</small> : null}</span>
                <span className="jt-sched">
                  <ScheduleBar health={h} />
                  <small data-late={sched?.behind ? 'true' : undefined}>{schedText}</small>
                </span>
              </span>
              <span className="jt-ou" role="cell"><OverUnder health={h} /></span>
              <span className="jt-dots" role="cell"><ItemDots health={h} /></span>
              <span className="jt-money" role="cell">
                <b>{contract > 0 ? fmtMoneyExact(contract) : '—'}</b>
                <small>{pct != null ? `${pct}% billed` : contract > 0 ? 'Not billed yet' : ' '}</small>
              </span>
            </Link>
          );
        })}
      </div>
      </>
    );
  }

  return (
    <div className="k-frame jl">
      <FlatStyles />
      <style dangerouslySetInnerHTML={{ __html: JOB_HEALTH_CSS + CSS }} />
      <header className="k-head jl-head">
        <div className="jl-title">
          <h1 className="k-title">Jobs</h1>
          <p className="k-sub">{ready ? `${plural(rows.length, 'job')}${total > 0 ? ` · ${fmtMoneyShort(total)} in contracts` : ''}` : loading ? 'Loading your jobs…' : ' '}</p>
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
          <option value="health">Needs attention</option>
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
.jl{color:var(--fl-text);background:var(--bg-base);min-height:calc(100vh - 120px)}
.jl-title{min-width:0}
.jl-title .k-sub{min-height:21px}
.jl-tools{display:flex;gap:8px;padding:0 0 4px}
/* 16px beats the app-wide 13px !important on fields: under 16px iOS zooms the page on focus. */
.jl-search,.jl-sort{height:44px;min-height:44px;box-sizing:border-box;border:1px solid var(--fl-line);border-radius:10px;background-color:var(--bg-base);color:var(--fl-text);font-family:inherit;font-size:16px !important}
.jl-search{flex:1;min-width:0;padding:0 12px}
.jl-search::placeholder{color:var(--fl-text-3)}
.jl-sort{flex:none;width:auto;max-width:42%;padding:0 34px 0 12px}
.jl-search:focus-visible,.jl-sort:focus-visible,.jl-chip:focus-visible{outline:2px solid var(--focus-ring);outline-offset:1px}
.jl-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 0 12px}
.jl-chip{position:relative;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--fl-line);background:var(--bg-surface);color:var(--fl-text-2);font:inherit;font-size:13px;font-weight:600;letter-spacing:0;cursor:pointer;white-space:nowrap}
.jl-chip::after{content:"";position:absolute;inset:-4px -3px}
.jl-chip span{font-variant-numeric:tabular-nums;color:var(--fl-text-3);font-weight:600}
.jl-chip:hover:not([aria-pressed=true]){background:var(--bg-row-hover)}
.jl-chip[aria-pressed=true]{background:var(--selected-control-bg);color:var(--selected-control-fg);border-color:var(--selected-control-bg);font-weight:700}
.jl-chip[aria-pressed=true] span{color:var(--selected-control-fg)}
.jl-count{margin-left:auto;font-size:13px;color:var(--fl-text-3)}
.jt{border:1px solid var(--fl-line);border-radius:14px;overflow:hidden;background:var(--bg-surface)}
.jt-head,.jt-row{display:grid;grid-template-columns:50px minmax(0,1fr) 122px 312px 132px;align-items:center;gap:14px;padding:0 16px}
.jt-head{height:38px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--fl-text-3);border-bottom:1px solid var(--fl-line);background:color-mix(in srgb,var(--bg-base) 55%,var(--bg-surface))}
.jt-dots-head,.jt-dots .jh-dots{display:grid;grid-template-columns:36px 72px 32px 44px 64px 44px;gap:4px}.jt-dots-head em{font-style:normal;white-space:nowrap;letter-spacing:0}
.jt-ou{display:flex;justify-content:flex-end}
.jt-meta{display:flex;align-items:center;gap:8px;min-width:0}
.jt-row{min-height:76px;padding-top:12px;padding-bottom:12px;color:var(--fl-text);text-decoration:none;border-bottom:1px solid var(--fl-line);position:relative;transition:background .12s}
.jt-row:last-child{border-bottom:0}
.jt-row:hover{background:var(--bg-row-hover)}
.jt-row::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;background:transparent}
.jt-row[data-tone=bad]::before{background:var(--danger)}
.jt-row[data-tone=warn]::before{background:var(--warning)}
.jt-name{min-width:0;display:flex;flex-direction:column;gap:3px}
.jt-name{gap:5px !important}
.jt-name b{font-size:15px;font-weight:700;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.jt-name small,.jt-sched small,.jt-money small{font-size:13px;color:var(--fl-text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jt-sched{display:grid;grid-template-columns:minmax(80px,300px) auto;align-items:center;gap:10px;min-width:0;margin-top:3px}
.jt-sched small[data-late=true]{color:var(--danger);font-weight:600}
.jt-dots .jh-dot{min-width:0}
.jt-money{text-align:right;display:flex;flex-direction:column;gap:3px;align-items:flex-end;font-variant-numeric:tabular-nums}
.jt-money b{font-size:15px;font-weight:700;white-space:nowrap}
@media (max-width:1100px){
  .jt-head{display:none}
  .jt-row{grid-template-columns:48px minmax(0,1fr) auto;grid-template-areas:"ring name money" "ring name ou" "ring dots dots";row-gap:10px;column-gap:12px;padding:14px 14px}
  .jt-ring{grid-area:ring;align-self:start}.jt-name{grid-area:name}.jt-dots{grid-area:dots}.jt-money{grid-area:money;align-self:start}.jt-ou{grid-area:ou;align-self:start}
  .jt-sched{grid-template-columns:1fr;gap:6px}
  .jt-dots .jh-dots{display:flex;flex-wrap:wrap;gap:6px 14px}
  .jt-dots .jh-dot-l{display:inline;font-size:12px;font-weight:600;color:var(--text-secondary)}
  .jt-money b{font-size:14px}
}
.jl-inline{color: var(--link);font-weight:650;text-decoration:none;background:none;border:0;padding:0;font:inherit;cursor:pointer;min-height:44px}
`;
