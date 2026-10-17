'use client';
/**
 * Home finance — the landing page's money picture, in calm slate panels.
 *
 *   Company finances · Live                         heading + live dot
 *   8 figures                                       2 across on a phone, 4 on a desk
 *   Cash flow — billed vs collected, 12 months      area chart
 *   Owed to you — by age                            bars
 *   Biggest jobs — billed of contract               progress rows
 *   Jobs by stage                                   donut
 *
 * Every number is from /api/home's `flat.finance` (lib/home/finance.ts), built
 * from the same rows as the lists below it. A figure the user may not see (no
 * Budget / Pay Apps access) shows a dash and why; nothing is invented.
 */
import React from 'react';
import Link from 'next/link';
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FinanceHome } from '@/lib/home/finance';
import type { StripFigure } from '@/lib/home/flat';
import { CHART } from '@/components/charts/shared';

type Strip = StripFigure;

// Yellow is for actions and the selected item only (and --info / --chart-1
// are the brand yellow now), so billed is slate and collected is green, and
// every colour sits beside its label.
const BLUE = 'var(--text-secondary)';
const GREEN = CHART.green;
const STAGE_COLOR: Record<string, string> = {
  Bidding: 'var(--warning)',
  Building: 'var(--text-primary)',
  Closeout: 'var(--c-gray)',
  Complete: 'var(--success)',
};

function money(n: number | null | undefined): string {
  if (n == null) return '—';
  const a = Math.abs(n);
  if (a >= 999_500) return `$${(n / 1e6).toFixed(a >= 1e8 ? 0 : 2).replace(/\.?0+$/, '')}M`;
  if (a >= 10_000) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
const axisMoney = (n: number) => (n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`);
const plural = (n: number, w: string) => `${n} ${n === 1 ? w : `${w}s`}`;

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function Kpi({ label, value, sub, href, pct, spark, tone, note }: {
  label: string; value: string; sub?: React.ReactNode; href?: string; pct?: number | null;
  spark?: number[]; tone?: 'good' | 'warn' | 'bad'; note?: string;
}) {
  const line = tone === 'good' ? GREEN : BLUE;
  const body = (
    <>
      <span className="hf-k-label">{label}</span>
      <b className="hf-k-val" data-tone={tone} title={note}>{value}</b>
      {pct != null && <span className="hf-k-bar" data-tone={tone} aria-hidden><i style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} /></span>}
      {sub && <span className="hf-k-sub">{sub}</span>}
      {spark && spark.some(v => v > 0) && (
        <span className="hf-k-spark" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`hfsp-${label.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={line} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={line} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={line} strokeWidth={1.6} fill={`url(#hfsp-${label.replace(/\W/g, '')})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </span>
      )}
    </>
  );
  return href
    ? <Link href={href} className="hf-card hf-kpi" aria-label={`${label}: ${value}`}>{body}</Link>
    : <div className="hf-card hf-kpi">{body}</div>;
}

function Panel({ title, sub, children, action, className }: { title: string; sub?: React.ReactNode; children: React.ReactNode; action?: { label: string; href: string }; className?: string }) {
  return (
    <section className={`hf-card hf-panel ${className || ''}`}>
      <header className="hf-p-head">
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        {action && <Link href={action.href} className="hf-p-act">{action.label} ›</Link>}
      </header>
      {children}
    </section>
  );
}

function CashTip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const v = (k: string) => payload.find(p => p.dataKey === k)?.value ?? 0;
  return (
    <div className="hf-tip">
      <b>{label}</b>
      <span><i style={{ background: BLUE }} />Billed {money(v('billed'))}</span>
      <span><i style={{ background: GREEN }} />Collected {money(v('collected'))}</span>
    </div>
  );
}

function CashFlow({ f }: { f: FinanceHome }) {
  const billed12 = f.monthly.reduce((s, m) => s + m.billed, 0);
  const coll12 = f.monthly.reduce((s, m) => s + m.collected, 0);
  const any = billed12 > 0 || coll12 > 0;
  return (
    <Panel
      className="hf-wide"
      title="Cash flow"
      sub={<>Billed <b className="hf-blue">{money(billed12)}</b> · collected <b className="hf-green">{money(coll12)}</b> in the last 12 months</>}
      action={{ label: 'Pay apps', href: '/app/billing/payapp' }}
    >
      {any ? (
        <div className="hf-chart" role="img" aria-label={`Billed ${money(billed12)} and collected ${money(coll12)} over the last 12 months`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={f.monthly} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="hf-billed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BLUE} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: CHART.textTertiary, fontSize: 12 }} interval="preserveStartEnd" minTickGap={14} />
              <YAxis tickFormatter={axisMoney} tickLine={false} axisLine={false} width={46} tick={{ fill: CHART.textTertiary, fontSize: 12 }} />
              <Tooltip content={<CashTip />} cursor={{ stroke: 'rgba(255,255,255,0.18)' }} />
              <Area type="monotone" dataKey="billed" stroke={BLUE} strokeWidth={2.2} fill="url(#hf-billed)" isAnimationActive={false} />
              {/* Collected is a dashed line over the billed area: when an owner pays every
                  app in the month it was sent, the two match and a second filled area
                  would hide billed completely. */}
              <Area type="monotone" dataKey="collected" stroke={GREEN} strokeWidth={2.4} strokeDasharray="6 5" fill="none" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="hf-empty">No pay apps sent in the last 12 months. Bill your first job from Progress Billing and the chart fills in.</p>
      )}
      <div className="hf-legend"><span><i style={{ background: BLUE }} />Billed (pay apps sent)</span><span><i style={{ background: GREEN }} />Collected (payments in)</span></div>
    </Panel>
  );
}

function Aging({ f }: { f: FinanceHome }) {
  const total = f.aging.reduce((s, b) => s + b.amount, 0);
  const max = Math.max(1, ...f.aging.map(b => b.amount));
  return (
    <Panel title="Owed to you" sub={total ? <>{money(total)} waiting on owners{f.kpis.daysToPay != null ? <> · usually paid in {f.kpis.daysToPay} days</> : null}</> : 'Every pay app sent has been paid.'}
      action={{ label: 'Collect', href: '/app/billing/payapp' }}>
      {total > 0 && <div className="hf-aging">
        {f.aging.map((b, i) => (
          <div key={b.key} className="hf-age" data-k={b.key}>
            <span className="hf-age-l">{b.label}</span>
            <span className="hf-age-bar"><i style={{ width: `${b.amount ? Math.max(3, (b.amount / max) * 100) : 0}%`, opacity: 1 - i * 0.12 }} /></span>
            <span className="hf-age-v">{money(b.amount)}{b.count ? <small>{plural(b.count, 'app')}</small> : null}</span>
          </div>
        ))}
      </div>}
    </Panel>
  );
}

function TopJobs({ f }: { f: FinanceHome }) {
  return (
    <Panel className="hf-wide" title="Biggest jobs" sub="Contract and how much of it is billed" action={{ label: 'All jobs', href: '/app/projects' }}>
      {f.topJobs.length ? (
        <ul className="hf-jobs">
          {f.topJobs.map(j => (
            <li key={j.id}>
              <Link href={j.href}>
                <span className="hf-j-top">
                  <span className="hf-j-name">{j.name}</span>
                  <span className="hf-j-amt">{money(j.contract)}</span>
                </span>
                <span className="hf-j-bar" aria-hidden><i style={{ width: `${Math.max(j.pct ? 2 : 0, j.pct)}%` }} /></span>
                <span className="hf-j-meta"><span>{j.stage}</span><span>{j.pct}% billed · {money(j.billed)}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="hf-empty">No jobs with a contract value yet. Add the contract on a job and it shows here.</p>}
    </Panel>
  );
}

function Stages({ f }: { f: FinanceHome }) {
  const total = f.stages.reduce((s, x) => s + x.count, 0);
  return (
    <Panel title="Jobs by stage" sub={`${plural(total, 'job')} on the books`} action={{ label: 'Jobs', href: '/app/projects' }}>
      {total ? (
        <div className="hf-donut">
          <div className="hf-donut-c" role="img" aria-label={f.stages.map(s => `${s.stage} ${s.count}`).join(', ')}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={f.stages} dataKey="count" nameKey="stage" innerRadius="64%" outerRadius="96%" paddingAngle={3} stroke="none" isAnimationActive={false}>
                  {f.stages.map(s => <Cell key={s.stage} fill={STAGE_COLOR[s.stage]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <span className="hf-donut-mid"><b>{total}</b><small>jobs</small></span>
          </div>
          <ul className="hf-stages">
            {f.stages.map(s => (
              <li key={s.stage}>
                <i style={{ background: STAGE_COLOR[s.stage] }} />
                <span>{s.stage}</span>
                <b>{s.count}</b>
                {f.canMoney && <small>{money(s.contract)}</small>}
              </li>
            ))}
          </ul>
        </div>
      ) : <p className="hf-empty">No jobs yet.</p>}
    </Panel>
  );
}

/* ── The block ──────────────────────────────────────────────────────────── */

export default function HomeFinance({ f, strip, updatedAt, timeZone, refreshing, onRefresh }: {
  f: FinanceHome; strip: Strip[]; updatedAt: string; timeZone: string; refreshing: boolean; onRefresh: () => void;
}) {
  const k = f.kpis;
  const bids = strip.find(s => s.key === 'bids');
  const coi = strip.find(s => s.key === 'coi');
  const time = new Date(updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
  const sparkBilled = f.monthly.map(m => m.billed);
  const sparkColl = f.monthly.map(m => m.collected);
  const noMoney = 'Needs Budget access';
  const noPay = 'Needs Pay Apps access';

  return (
    <div className="hf" aria-label="Company finances">
      <style dangerouslySetInnerHTML={{ __html: HF_CSS }} />
      <div className="hf-head">
        <h2>Company finances</h2>
        <button type="button" className="hf-live" onClick={onRefresh} disabled={refreshing} title="Refreshes on its own every 2 minutes — tap to refresh now">
          <i data-busy={refreshing || undefined} />{refreshing ? 'Refreshing…' : `Live · ${time}`}
        </button>
      </div>

      <div className="hf-kpis">
        <Kpi label="Under contract" value={money(k.contract)} note={k.contract == null ? noMoney : undefined}
          sub={k.contract == null ? noMoney : `${plural(k.wonJobs, 'job')} won`} href="/app/projects" />
        <Kpi label="Billed to date" value={money(k.billed)} pct={k.billedPct} note={k.billed == null ? noPay : undefined}
          sub={k.billed == null ? noPay : `${k.billedPct ?? 0}% of contract`} href="/app/billing/payapp" spark={sparkBilled} />
        <Kpi label="Collected" value={money(k.collected)} pct={k.collectedPct} tone={k.collected ? 'good' : undefined}
          sub={k.collected == null ? noPay : `${k.collectedPct ?? 0}% of billed · ${money(k.collected30)} last 30 days`} href="/app/billing/payapp" spark={sparkColl} />
        <Kpi label="Owed to you" value={money(k.outstanding)} tone={k.outstanding ? 'warn' : undefined}
          sub={k.outstanding == null ? noPay : k.outstanding ? `${plural(k.outstandingCount, 'pay app')} waiting${k.daysToPay != null ? ` · ~${k.daysToPay} days to pay` : ''}` : `All paid${k.daysToPay != null ? ` · paid in ~${k.daysToPay} days` : ''}`}
          href="/app/billing/payapp" />
        <Kpi label="Retainage held" value={money(k.retainage)} sub={k.retainage == null ? noPay : k.retainage ? 'Comes back at closeout' : 'None held now'} href="/app/billing/payapp" />
        <Kpi label="Bidding pipeline" value={money(k.bidding)} sub={k.bidding == null ? noMoney : `${plural(k.biddingJobs, 'job')} out to bid`} href="/app/projects" />
        <Kpi label="Open bid packages" value={bids?.value ?? (k.openPackages != null ? String(k.openPackages) : '—')} sub={bids?.note || 'Taking sub bids now'} href="/app/bids" />
        <Kpi label={coi?.label || 'COIs current'} value={coi?.value ?? '—'} tone={coi?.tone || (coi?.value ? 'good' : undefined)}
          sub={coi?.note || 'Subs’ insurance on file'} href="/app/compliance" />
      </div>

      <div className="hf-grid">
        {f.canBilling && <CashFlow f={f} />}
        {f.canBilling && <Aging f={f} />}
        {f.canMoney && <TopJobs f={f} />}
        <Stages f={f} />
      </div>
    </div>
  );
}

/* ── Look: slate panels on navy; no glow, no gradient fills ──────────────── */

const HF_CSS = `
.hf{margin:14px 0 6px}
.hf-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px}
.hf-head h2{margin:0;font-size:var(--fs-section);font-weight:700;letter-spacing:-0.005em;color:var(--title-section)}
.hf-live{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 4px;background:none;border:0;color:var(--text-secondary);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.hf-live i{width:8px;height:8px;border-radius:50%;background:${GREEN}}
.hf-live i[data-busy]{background:${BLUE}}

/* Flat (no boxed cards): figures sit on the page as one scoreboard, divided
   by hairlines; panels are a title over a hairline, then the content. */
.hf-card{position:relative;display:block;border-radius:0;text-decoration:none;color:inherit;overflow:hidden;
  background:none;border:0}
/* Every figure sits on the page alike: no fill on hover/tap (a phone keeps
   :hover after a tap, which left one tile lit). Hover brightens the label. */
a.hf-card:hover{background:none;color:inherit}
@media (hover:hover){a.hf-card:hover .hf-k-label{color:var(--text-primary)}}
a.hf-card:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}

.hf-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border-top:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle)}
.hf-kpi{display:flex;flex-direction:column;gap:4px;min-height:112px;padding:14px 14px 12px;border-left:1px solid var(--border-subtle)}
.hf-kpi:nth-child(2n+1){border-left:0;padding-left:2px}
.hf-kpi:nth-child(n+3){border-top:1px solid var(--border-subtle)}
.hf-k-label{font-size:13px;font-weight:600;letter-spacing:0;color:var(--text-secondary)}
.hf-k-val{font-size:24px;line-height:1.15;font-weight:800;letter-spacing:-.01em;color:var(--text-primary);font-variant-numeric:tabular-nums}
.hf-k-val[data-tone=good]{color:var(--success)}
.hf-k-val[data-tone=warn]{color:var(--warning)}
.hf-k-val[data-tone=bad]{color:var(--danger)}
.hf-k-sub{font-size:13px;line-height:1.35;color:var(--text-secondary);position:relative;z-index:1}
.hf-k-bar{display:block;height:6px;border-radius:3px;background:var(--bg-surface-2);overflow:hidden;margin:3px 0 1px}
.hf-k-bar i{display:block;height:100%;border-radius:3px;background:${BLUE}}
.hf-k-bar[data-tone=good] i{background:${GREEN}}
.hf-k-bar[data-tone=warn] i{background:var(--warning)}
.hf-k-bar[data-tone=bad] i{background:var(--danger)}
.hf-k-spark{position:absolute;left:0;right:0;bottom:0;height:40px;opacity:.5;pointer-events:none}

.hf-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:26px;margin-top:22px}
.hf-panel{padding:0;overflow:visible}
.hf-p-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border-subtle)}
.hf-p-head h3{margin:0;font-size:var(--fs-section);font-weight:700;letter-spacing:-0.005em;color:var(--title-section)}
.hf-p-head p{margin:3px 0 0;font-size:13px;line-height:1.4;color:var(--text-secondary)}
.hf-p-act{flex:none;display:inline-flex;align-items:center;min-height:44px;margin:-12px -4px -12px 0;padding:0 4px;font-size:14px;font-weight:600;color:var(--link);text-decoration:none}
.hf-p-act:hover{color:var(--link-hover)}
.hf-blue{color:var(--text-primary)} .hf-green{color:${GREEN}}
.hf-chart{height:210px;margin:0 -4px}
.hf-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:6px;font-size:13px;color:var(--text-secondary)}
.hf-legend i,.hf-tip i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.hf-legend span:last-child i{height:0;width:14px;border-radius:0;border-top:2.4px dashed ${GREEN};background:none !important;vertical-align:3px}
.hf-tip{display:grid;gap:3px;padding:8px 10px;border-radius:10px;background:var(--bg-surface-2);border:1px solid var(--border-default);font-size:13px;color:var(--text-primary);box-shadow:0 8px 24px rgba(0,0,0,.35)}
.hf-tip b{font-size:12px;color:var(--text-secondary)}
.hf-empty{margin:6px 0 2px;font-size:14px;line-height:1.45;color:var(--text-secondary)}

.hf-aging{display:grid;gap:9px;margin-top:4px}
.hf-age{display:grid;grid-template-columns:70px minmax(0,1fr) auto;align-items:center;gap:10px;font-size:13px}
.hf-age-l{color:var(--text-secondary)}
.hf-age-bar{height:10px;border-radius:5px;background:var(--bg-surface-2);overflow:hidden}
.hf-age-bar i{display:block;height:100%;border-radius:5px;background:${BLUE}}
.hf-age[data-k="61-90"] .hf-age-bar i,.hf-age[data-k="90+"] .hf-age-bar i{background:var(--danger)}
.hf-age-v{font-weight:700;color:var(--text-primary);font-variant-numeric:tabular-nums;text-align:right;min-width:60px}
.hf-age-v small{display:block;font-weight:600;font-size:12px;color:var(--text-tertiary)}

.hf-jobs{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.hf-jobs a{display:grid;gap:5px;padding:9px 2px;min-height:44px;color:inherit;text-decoration:none;border-radius:10px}
.hf-jobs a:hover .hf-j-name{color:var(--link)}
.hf-j-top,.hf-j-meta{display:flex;justify-content:space-between;gap:10px;min-width:0}
.hf-j-name{font-size:14px;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hf-j-amt{flex:none;font-size:14px;font-weight:700;color:var(--text-primary);font-variant-numeric:tabular-nums;text-align:right}
.hf-j-bar{display:block;height:6px;border-radius:3px;background:var(--bg-surface-2);overflow:hidden}
.hf-j-bar i{display:block;height:100%;border-radius:3px;background:${BLUE}}
.hf-j-meta{font-size:13px;color:var(--text-secondary)}

.hf-donut{display:flex;align-items:center;gap:18px}
.hf-donut-c{position:relative;flex:none;width:140px;height:140px}
.hf-donut-mid{position:absolute;inset:0;display:grid;place-content:center;text-align:center;pointer-events:none}
.hf-donut-mid b{font-size:26px;font-weight:800;color:var(--text-primary);line-height:1}
.hf-donut-mid small{font-size:12px;color:var(--text-secondary)}
.hf-stages{list-style:none;margin:0;padding:0;display:grid;gap:8px;flex:1;min-width:0}
.hf-stages li{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:center;gap:4px 8px;font-size:14px;color:var(--text-primary)}
.hf-stages li i{width:10px;height:10px;border-radius:3px}
.hf-stages li b{font-variant-numeric:tabular-nums}
.hf-stages li small{grid-column:2 / 4;margin-top:-4px;font-size:12px;color:var(--text-tertiary)}

@media (min-width:768px){
  .hf-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}
  .hf-kpi{min-height:122px;padding:16px 18px;border-top:0}
  .hf-kpi:nth-child(2n+1){border-left:1px solid var(--border-subtle);padding-left:18px}
  .hf-kpi:nth-child(4n+1){border-left:0;padding-left:2px}
  .hf-kpi:nth-child(n+5){border-top:1px solid var(--border-subtle)}
  .hf-k-val{font-size:30px}
  .hf-grid{grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:30px 40px}
  .hf-chart{height:240px}
}
`;
