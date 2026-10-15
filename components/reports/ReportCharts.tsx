'use client';
/**
 * The Reports chart library — ready-made charts for the whole company or one
 * job, from GET /api/reports/summary?projectId=&range=. Every number is the
 * server's (lib/reports); a tile with no data hides itself, and one empty
 * state shows when every tile is empty. Tiles are arrangeable per person
 * (usePanelLayout scope 'reports'), each with its headline, an Open link to
 * the source tool and a CSV of its data.
 */
import React, { useMemo } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowSquareOut, DownloadSimple, ChartBar } from '@phosphor-icons/react';
import { Select, EmptyState } from '@/components/ui/kit';
import { usePanelLayout, ArrangeButton, type PanelDef } from '@/components/layout/ArrangePanels';
import { toCsv } from '@/lib/report-csv';
import type { ReportRange, ReportSummary } from '@/lib/reports';

type Job = { id: string; name: string };
type Csv = { header: string[]; rows: unknown[][] };
type TileView = { headline: string; sub: string; chart: React.ReactNode; csv: Csv; href: string };

const PANELS: PanelDef[] = [
  { key: 'money', label: 'Money by month' },
  { key: 'contract', label: 'Contract vs billed' },
  { key: 'budget', label: 'Budget health' },
  { key: 'rfis', label: 'RFIs' },
  { key: 'submittals', label: 'Submittals' },
  { key: 'punch', label: 'Punch list' },
  { key: 'cos', label: 'Change orders' },
  { key: 'safety', label: 'Safety' },
  { key: 'schedule', label: 'Schedule' },
];
const RANGES: { key: ReportRange; label: string }[] = [
  { key: '90d', label: '90 days' },
  { key: '12m', label: '12 months' },
  { key: 'all', label: 'All time' },
];

const money = (n: number) => { const a = Math.abs(n); const s = n < 0 ? '−' : ''; return a >= 999_500 ? `${s}$${(a / 1e6).toFixed(2).replace(/\.?0+$/, '')}M` : a >= 10_000 ? `${s}$${Math.round(a / 1e3)}K` : `${s}$${Math.round(a).toLocaleString('en-US')}`; };
const axisMoney = (n: number) => { const a = Math.abs(n); const s = n < 0 ? '−' : ''; return a >= 1e6 ? `${s}$${+(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${Math.round(a / 1e3)}K` : `${s}$${a}`; };
const plural = (n: number, w: string) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;

const TIP = {
  cursor: { fill: 'rgba(148,163,184,.08)' },
  contentStyle: { background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)' },
  labelStyle: { color: 'var(--text-primary)', fontWeight: 700 },
  itemStyle: { color: 'var(--text-secondary)' },
};
const X_TICK = { fill: 'var(--text-secondary)', fontSize: 12 };
const Y_TICK = { fill: 'var(--text-tertiary)', fontSize: 12 };
const GRID = <CartesianGrid vertical={false} stroke="var(--border-subtle)" />;
const shortName = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);
/** Horizontal bar charts grow with the number of rows; capped so a tile stays a tile. */
const MAX_ROWS = 12;
const hHeight = (n: number) => Math.max(120, Math.min(n, MAX_ROWS) * 30 + 30);

const fetcher = async (u: string) => {
  const r = await fetch(u, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Couldn't load the reports.");
  return j as ReportSummary & { projectId: string | null };
};

function download(name: string, csv: Csv) {
  const blob = new Blob([toCsv(csv.header, csv.rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="rc-legend">
      {items.map((i) => <li key={i.label}><i style={{ background: i.color }} />{i.label}{i.value && <b>{i.value}</b>}</li>)}
    </ul>
  );
}

export default function ReportCharts({ jobs, projectId, onProjectChange, range, onRangeChange }: {
  jobs: Job[];
  projectId: string;
  onProjectChange: (id: string) => void;
  range: ReportRange;
  onRangeChange: (r: ReportRange) => void;
}) {
  const router = useRouter();
  const layout = usePanelLayout('reports', PANELS);
  const qs = new URLSearchParams({ range });
  if (projectId) qs.set('projectId', projectId);
  const { data, error, isLoading } = useSWR(`/api/reports/summary?${qs}`, fetcher, { revalidateOnFocus: false, keepPreviousData: true });

  const job = (id: string, tool: string) => `/app/projects/${id}/${tool}`;
  const toolHref = (tool: string, company: string) => (projectId ? job(projectId, tool) : company);
  const openJob = (tool: string) => (bar: unknown) => {
    const b = bar as { projectId?: string; payload?: { projectId?: string } } | null;
    const id = b?.projectId || b?.payload?.projectId;
    if (id) router.push(job(id, tool));
  };
  const rangeLabel = RANGES.find((r) => r.key === range)!.label.toLowerCase();

  const tiles = useMemo<Record<string, TileView | null>>(() => {
    if (!data) return {};
    const out: Record<string, TileView | null> = {};

    const m = data.money;
    out.money = m && {
      headline: money(m.totals.billed - m.totals.costs),
      sub: `billed minus costs, ${m.months.length} months`,
      href: toolHref('pay-apps', '/app/billing'),
      csv: { header: ['Month', 'Billed', 'Collected', 'Costs', 'Approved changes'], rows: m.months.map((x) => [x.month, x.billed, x.collected, x.costs, x.changes]) },
      chart: (
        <>
          <Legend items={[{ label: 'Billed', color: 'var(--chart-2)', value: money(m.totals.billed) }, { label: 'Collected', color: 'var(--success)', value: money(m.totals.collected) }, { label: 'Costs', color: 'var(--warning)', value: money(m.totals.costs) }]} />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={m.months} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
              {GRID}
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={X_TICK} minTickGap={4} />
              <YAxis tickFormatter={axisMoney} tickLine={false} axisLine={false} width={52} tick={Y_TICK} />
              <Tooltip {...TIP} formatter={(v, n) => [money(Number(v ?? 0)), String(n)]} />
              <Bar name="Billed" dataKey="billed" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={14} />
              <Bar name="Collected" dataKey="collected" fill="var(--success)" radius={[3, 3, 0, 0]} maxBarSize={14} />
              <Bar name="Costs" dataKey="costs" fill="var(--warning)" radius={[3, 3, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </>
      ),
    };

    const c = data.contract;
    out.contract = c && {
      headline: money(c.totals.remaining),
      sub: `left to bill of ${money(c.totals.contract)}`,
      href: toolHref('pay-apps', '/app/billing'),
      csv: { header: ['Job', 'Contract', 'Billed to date', 'Remaining'], rows: c.rows.map((r) => [r.name, r.contract, r.billed, r.remaining]) },
      chart: (
        <>
          <Legend items={[{ label: 'Billed', color: 'var(--chart-2)', value: money(c.totals.billed) }, { label: 'Remaining', color: 'var(--chart-5)', value: money(c.totals.remaining) }]} />
          <ResponsiveContainer width="100%" height={hHeight(c.rows.length)}>
            <BarChart layout="vertical" data={c.rows.slice(0, MAX_ROWS).map((r) => ({ ...r, left: Math.max(0, r.remaining) }))} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
              <CartesianGrid horizontal={false} stroke="var(--border-subtle)" />
              <XAxis type="number" tickFormatter={axisMoney} tickLine={false} axisLine={false} tick={Y_TICK} />
              <YAxis type="category" dataKey="name" tickFormatter={shortName} tickLine={false} axisLine={false} width={118} tick={X_TICK} />
              <Tooltip {...TIP} formatter={(v, n) => [money(Number(v ?? 0)), String(n)]} />
              <Bar name="Billed" dataKey="billed" stackId="a" fill="var(--chart-2)" onClick={openJob('pay-apps')} cursor="pointer" />
              <Bar name="Remaining" dataKey="left" stackId="a" fill="var(--chart-5)" radius={[0, 3, 3, 0]} onClick={openJob('pay-apps')} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </>
      ),
    };

    const b = data.budget;
    out.budget = b && {
      headline: `${b.net < 0 ? '' : '+'}${money(b.net)}`,
      sub: b.overCount ? `${b.net < 0 ? 'net over' : 'net under'} budget · ${plural(b.overCount, 'job')} over` : 'under budget on every job',
      href: toolHref('budget', '/app/command-center/budget'),
      csv: { header: ['Job', 'Revised budget', 'Forecast at completion', 'Under (+) / over (−)'], rows: b.rows.map((r) => [r.name, r.budget, r.forecast, r.variance]) },
      chart: (
        <>
          <Legend items={[{ label: 'Under budget', color: 'var(--success)' }, { label: 'Over budget', color: 'var(--danger)' }]} />
          <ResponsiveContainer width="100%" height={hHeight(b.rows.length)}>
            <BarChart layout="vertical" data={b.rows.slice(0, MAX_ROWS)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
              <CartesianGrid horizontal={false} stroke="var(--border-subtle)" />
              <XAxis type="number" tickFormatter={axisMoney} tickLine={false} axisLine={false} tick={Y_TICK} />
              <YAxis type="category" dataKey="name" tickFormatter={shortName} tickLine={false} axisLine={false} width={118} tick={X_TICK} />
              <ReferenceLine x={0} stroke="var(--border-default)" />
              <Tooltip {...TIP} formatter={(v) => { const n = Number(v ?? 0); return [`${money(Math.abs(n))} ${n < 0 ? 'over' : 'under'}`, 'Budget']; }} />
              <Bar dataKey="variance" name="Budget" onClick={openJob('budget')} cursor="pointer" radius={2}>
                {b.rows.slice(0, MAX_ROWS).map((r) => <Cell key={r.projectId} fill={r.variance < 0 ? 'var(--danger)' : 'var(--success)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      ),
    };

    const r = data.rfis;
    out.rfis = r && {
      headline: r.openNow.toLocaleString('en-US'),
      sub: `open now${r.avgDays != null ? ` · ${r.avgDays} days avg to answer` : ''}`,
      href: toolHref('rfis', '/app/projects'),
      csv: { header: ['Month', 'Opened', 'Closed'], rows: r.months.map((x) => [x.month, x.opened, x.closed]) },
      chart: (
        <>
          <Legend items={[{ label: 'Opened', color: 'var(--chart-2)' }, { label: 'Closed', color: 'var(--success)' }]} />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={r.months} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
              {GRID}
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={X_TICK} minTickGap={4} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={Y_TICK} />
              <Tooltip {...TIP} />
              <Bar name="Opened" dataKey="opened" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={14} />
              <Bar name="Closed" dataKey="closed" fill="var(--success)" radius={[3, 3, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </>
      ),
    };

    const s = data.submittals;
    const subTone = (st: string) => (/approved/.test(st) ? 'var(--success)' : /reject|revise/.test(st) ? 'var(--danger)' : /pending|review|submitted/.test(st) ? 'var(--warning)' : 'var(--chart-5)');
    out.submittals = s && {
      headline: s.avgReviewDays != null ? `${s.avgReviewDays} days` : s.total.toLocaleString('en-US'),
      sub: s.avgReviewDays != null ? `avg review · ${plural(s.total, 'submittal')}` : `submittals, ${rangeLabel}`,
      href: toolHref('submittals', '/app/projects'),
      csv: { header: ['Status', 'Submittals'], rows: s.byStatus.map((x) => [x.label, x.count]) },
      chart: (
        <ResponsiveContainer width="100%" height={hHeight(s.byStatus.length)}>
          <BarChart layout="vertical" data={s.byStatus} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid horizontal={false} stroke="var(--border-subtle)" />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={Y_TICK} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={118} tick={X_TICK} />
            <Tooltip {...TIP} />
            <Bar dataKey="count" name="Submittals" radius={[0, 3, 3, 0]}>
              {s.byStatus.map((x) => <Cell key={x.status} fill={subTone(x.status)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ),
    };

    const p = data.punch;
    out.punch = p && {
      headline: p.open.toLocaleString('en-US'),
      sub: `open punch items · ${plural(p.byTrade.length, 'trade')}`,
      href: toolHref('punch-list', '/app/projects'),
      csv: { header: ['Trade', 'Open items'], rows: p.byTrade.map((x) => [x.trade, x.count]) },
      chart: (
        <ResponsiveContainer width="100%" height={hHeight(p.byTrade.length)}>
          <BarChart layout="vertical" data={p.byTrade.slice(0, MAX_ROWS)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid horizontal={false} stroke="var(--border-subtle)" />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={Y_TICK} />
            <YAxis type="category" dataKey="trade" tickFormatter={shortName} tickLine={false} axisLine={false} width={118} tick={X_TICK} />
            <Tooltip {...TIP} />
            <Bar dataKey="count" name="Open" fill="var(--chart-2)" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ),
    };

    const co = data.changeOrders;
    out.cos = co && {
      headline: money(co.pendingTotal),
      sub: `pending in ${plural(co.pendingCount, 'change order')} · ${money(co.approvedTotal)} approved`,
      href: toolHref('change-orders', '/app/projects'),
      csv: { header: ['Month', 'Approved $'], rows: [...co.months.map((x) => [x.month, x.approved]), ['Pending now', co.pendingTotal]] },
      chart: (
        <>
          <Legend items={[{ label: 'Approved', color: 'var(--chart-2)', value: money(co.approvedTotal) }]} />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={co.months} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
              {GRID}
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={X_TICK} minTickGap={4} />
              <YAxis tickFormatter={axisMoney} tickLine={false} axisLine={false} width={52} tick={Y_TICK} />
              <Tooltip {...TIP} formatter={(v) => [money(Number(v ?? 0)), 'Approved']} />
              <Bar name="Approved" dataKey="approved" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </>
      ),
    };

    const sf = data.safety;
    out.safety = sf && {
      headline: sf.daysSinceLast != null ? `${sf.daysSinceLast.toLocaleString('en-US')} days` : '—',
      sub: `since the last incident · ${plural(sf.total, 'incident')}, ${rangeLabel}`,
      href: toolHref('safety', '/app/projects'),
      csv: { header: ['Month', 'Incidents'], rows: sf.months.map((x) => [x.month, x.incidents]) },
      chart: (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={sf.months} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
            {GRID}
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={X_TICK} minTickGap={4} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={Y_TICK} />
            <Tooltip {...TIP} />
            <Bar name="Incidents" dataKey="incidents" fill="var(--danger)" radius={[3, 3, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      ),
    };

    const sc = data.schedule;
    out.schedule = sc && {
      headline: `${sc.pctOnTime}%`,
      sub: `of tasks on time · ${plural(sc.late, 'late task')}`,
      href: toolHref('schedule', '/app/schedule'),
      csv: { header: ['Job', 'On time', 'Late', 'Tasks', '% on time'], rows: sc.rows.map((x) => [x.name, x.onTime, x.late, x.total, x.pctOnTime]) },
      chart: (
        <>
          <Legend items={[{ label: 'On time', color: 'var(--success)' }, { label: 'Late', color: 'var(--danger)' }]} />
          <ResponsiveContainer width="100%" height={hHeight(sc.rows.length)}>
            <BarChart layout="vertical" data={sc.rows.slice(0, MAX_ROWS)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
              <CartesianGrid horizontal={false} stroke="var(--border-subtle)" />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={Y_TICK} />
              <YAxis type="category" dataKey="name" tickFormatter={shortName} tickLine={false} axisLine={false} width={118} tick={X_TICK} />
              <Tooltip {...TIP} />
              <Bar name="On time" dataKey="onTime" stackId="s" fill="var(--success)" onClick={openJob('schedule')} cursor="pointer" />
              <Bar name="Late" dataKey="late" stackId="s" fill="var(--danger)" radius={[0, 3, 3, 0]} onClick={openJob('schedule')} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </>
      ),
    };
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, projectId, range]);

  const label = new Map(PANELS.map((p) => [p.key, p.label]));
  const shown = layout.visible.filter((k) => tiles[k]);
  const allEmpty = !!data && PANELS.every((p) => !tiles[p.key]);
  const jobName = projectId ? jobs.find((j) => j.id === projectId)?.name || 'job' : 'company';
  const slug = jobName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return (
    <section className="rc" aria-label="Report charts">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="rc-bar">
        <Select aria-label="Job" value={projectId} onChange={(e) => onProjectChange(e.target.value)} placeholder="All jobs" options={jobs.map((j) => ({ value: j.id, label: j.name }))} className="rc-job" />
        <div className="rc-seg" role="group" aria-label="Date range">
          {RANGES.map((r) => <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => onRangeChange(r.key)}>{r.label}</button>)}
        </div>
        <span className="rc-grow" />
        <ArrangeButton panels={PANELS} state={layout} />
      </div>

      {error ? <p className="rc-note" role="alert">{String((error as Error).message)}</p>
        : isLoading && !data ? <div className="rc-grid" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="rc-skel" />)}</div>
        : allEmpty ? <EmptyState icon={<ChartBar size={22} />} title={projectId ? 'Nothing to chart on this job yet' : 'Nothing to chart yet'} text="Pay apps, budgets, RFIs, submittals, punch items, change orders, incidents and schedules chart here as they are entered." />
        : (
          <div className="rc-grid">
            {shown.map((k) => {
              const t = tiles[k]!;
              return (
                <article key={k} className="rc-tile" aria-label={label.get(k)}>
                  <header className="rc-head">
                    <h3>{label.get(k)}</h3>
                    <div className="rc-acts">
                      <button type="button" className="rc-act" onClick={() => download(`${k}-${slug}-${range}-${data!.today}.csv`, t.csv)} aria-label={`Download ${label.get(k)} as CSV`} title="Download CSV"><DownloadSimple size={15} weight="bold" />CSV</button>
                      <a className="rc-act" href={t.href}>Open<ArrowSquareOut size={14} weight="bold" /></a>
                    </div>
                  </header>
                  <p className="rc-big">{t.headline}<span>{t.sub}</span></p>
                  <div className="rc-chart">{t.chart}</div>
                </article>
              );
            })}
          </div>
        )}
    </section>
  );
}

const CSS = `
.rc{container:rc / inline-size;min-width:0;margin-bottom:8px}
.rc-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px}
.rc-job{width:auto;min-width:180px;max-width:100%}
.rc-grow{flex:1}
.rc-seg{display:inline-flex;border:1px solid var(--border-default);border-radius:8px;overflow:hidden}
.rc-seg button{all:unset;box-sizing:border-box;min-height:36px;padding:0 14px;display:inline-flex;align-items:center;font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer}
.rc-seg button+button{border-left:1px solid var(--border-default)}
.rc-seg button:hover{color:var(--text-primary)}
.rc-seg button[aria-pressed="true"]{color:var(--brand-primary);background:var(--brand-primary-12)}
.rc-seg button:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
.rc-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:28px 32px}
@container rc (min-width: 720px){.rc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container rc (min-width: 1140px){.rc-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.rc-tile{min-width:0;padding-top:14px;border-top:1px solid var(--border-default)}
.rc-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.rc-head h3{margin:0;font-size:15px;font-weight:700;color:var(--title-section,var(--text-primary))}
.rc-acts{display:flex;gap:4px;flex-shrink:0}
.rc-act{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:5px;min-height:32px;padding:0 8px;border-radius:6px;font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer}
.rc-act:hover{color:var(--text-primary);background:var(--bg-surface-2)}
.rc-act:focus-visible{outline:2px solid var(--focus-ring)}
.rc-big{margin:6px 0 10px;font-size:30px;line-height:1.1;font-weight:800;color:var(--text-primary);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.rc-big span{display:block;margin-top:4px;font-size:13px;font-weight:500;letter-spacing:0;color:var(--text-secondary)}
.rc-chart{width:100%;min-width:0}
.rc-legend{display:flex;flex-wrap:wrap;gap:4px 14px;margin:0 0 6px;padding:0;list-style:none;font-size:13px;color:var(--text-secondary)}
.rc-legend li{display:inline-flex;align-items:center;gap:6px}
.rc-legend i{width:10px;height:10px;border-radius:2px;display:inline-block}
.rc-legend b{color:var(--text-primary);font-variant-numeric:tabular-nums}
.rc-note{margin:0;padding:18px 0;color:var(--text-secondary);font-size:14px}
.rc-skel{height:280px;border-radius:8px;background:var(--bg-surface-2)}
@media (max-width: 640px){.rc-seg button,.rc-act{min-height:44px}.rc-job{flex:1 1 100%}}
`;
