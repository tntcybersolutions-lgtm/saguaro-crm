'use client';
/**
 * The job's money by month — billed, collected and costs as bars, the last 12
 * months, with the 12-month totals beside the legend. Reads
 * GET /api/projects/:id/monthly. A person without Budget access sees nothing
 * here (the panel hides itself on 403).
 */
import React from 'react';
import useSWR from 'swr';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { JobMonthly } from '@/lib/job-monthly';

const SERIES = [
  { key: 'billed', label: 'Billed', color: 'var(--chart-2)' },
  { key: 'collected', label: 'Collected', color: 'var(--success)' },
  { key: 'costs', label: 'Costs', color: 'var(--warning)' },
] as const;

const money = (n: number) => { const a = Math.abs(n); return a >= 999_500 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M` : a >= 10_000 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n).toLocaleString('en-US')}`; };
const axis = (n: number) => (n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`);

const fetcher = async (u: string) => {
  const r = await fetch(u);
  if (r.status === 403) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Couldn't load this job's months.");
  return j as JobMonthly;
};

export default function JobMonthlyChart({ projectId }: { projectId: string }) {
  const { data, error, isLoading } = useSWR(`/api/projects/${projectId}/monthly`, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  if (data === null) return null; // no Budget access
  const empty = data && data.months.every((m) => !m.billed && !m.collected && !m.costs);
  return (
    <section className="jm" aria-label="Money by month">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header className="jm-head">
        <h2>Money by month</h2>
        {data && (
          <ul className="jm-legend">
            {SERIES.map((s) => <li key={s.key}><i style={{ background: s.color }} />{s.label}<b>{money(data.totals[s.key])}</b></li>)}
            {data.totals.changes !== 0 && <li><i className="jm-co" />Approved changes<b>{data.totals.changes > 0 ? '+' : '−'}{money(Math.abs(data.totals.changes))}</b></li>}
          </ul>
        )}
      </header>
      {error ? <p className="jm-note">{String((error as Error).message)}</p>
        : isLoading && !data ? <div className="jm-skel" aria-busy="true" />
        : empty ? <p className="jm-note">No pay apps, payments or bills in the last 12 months yet. They chart here as they come in.</p>
        : data && (
          <div className="jm-chart" role="img" aria-label={`Last 12 months: billed ${money(data.totals.billed)}, collected ${money(data.totals.collected)}, costs ${money(data.totals.costs)}`}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.months} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} interval={0} />
                <YAxis tickFormatter={axis} tickLine={false} axisLine={false} width={52} tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} />
                <Tooltip cursor={{ fill: 'rgba(148,163,184,.08)' }}
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)' }}
                  formatter={(v, name) => [money(Number(v ?? 0)), SERIES.find((s) => s.key === String(name))?.label ?? String(name)]} />
                {SERIES.map((s) => <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={14} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
    </section>
  );
}

const CSS = `
.jm{margin:18px 0 6px}
.jm-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px 16px;margin-bottom:8px}
.jm-head h2{margin:0;font-size:15px;font-weight:700;color:var(--title-section,var(--brand-primary))}
.jm-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0;padding:0;list-style:none;font-size:13px;color:var(--text-secondary)}
.jm-legend li{display:inline-flex;align-items:center;gap:6px}
.jm-legend i{width:10px;height:10px;border-radius:2px;display:inline-block}
.jm-legend b{color:var(--text-primary);font-variant-numeric:tabular-nums}
.jm-co{border:2px dashed var(--text-secondary);background:none!important}
.jm-chart{width:100%;min-width:0}
.jm-note{margin:0;padding:18px 0;color:var(--text-secondary);font-size:14px}
.jm-skel{height:220px;border-radius:8px;background:var(--bg-surface-2)}
`;
