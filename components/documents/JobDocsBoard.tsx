'use client';
/**
 * Documents → Jobs. One row per job with its paperwork at a glance:
 * billed against contract, pay apps paid, lien waivers signed vs waiting
 * (and paid pay apps with NO waiver, in red), certified payroll weeks,
 * closeout done — and one dot for the lot. Tapping a job filters the whole
 * Documents page to it.
 */
import React from 'react';
import { CaretRight, X, Warning, CheckCircle, Clock } from '@phosphor-icons/react';
import type { JobDocs, DocTone } from '@/lib/documents-by-job';
import { fmtMoneyShort } from '@/lib/home/rank';
import { projectColor, jobTileStyle } from '@/lib/project-colors';

const CSS = `
.jdb { display: flex; flex-direction: column; gap: 10px; margin-bottom: 22px; }
.jdbHead { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.jdbHead h2 { margin: 0; font-size: 16px; font-weight: 800; color: var(--text-primary); }
.jdbLegend { display: inline-flex; gap: 12px; font-size: 13px; font-weight: 700; color: var(--text-secondary); }
.jdbLegend span { display: inline-flex; align-items: center; gap: 6px; }
.jdbLegend i, .jdbDot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex: 0 0 auto; }
[data-tone="red"] > .jdbDot, .jdbLegend i[data-tone="red"] { background: var(--c-red); box-shadow: 0 0 0 3px rgba(248,113,113,0.18); }
[data-tone="yellow"] > .jdbDot, .jdbLegend i[data-tone="yellow"] { background: var(--warning); box-shadow: 0 0 0 3px color-mix(in srgb, var(--warning) 16%, transparent); }
[data-tone="green"] > .jdbDot, .jdbLegend i[data-tone="green"] { background: var(--c-green); box-shadow: 0 0 0 3px rgba(74,222,128,0.16); }
.jdbList { display: flex; flex-direction: column; border-radius: 16px; border: 1px solid var(--border-subtle); background: linear-gradient(180deg, var(--c-raised), var(--c-card)); overflow: hidden; }
.jdbRow { display: grid; grid-template-columns: minmax(220px, 1.5fr) minmax(170px, 1.2fr) repeat(4, minmax(92px, .7fr)) 24px; align-items: center; gap: 16px; padding: 14px 16px; border: 0; border-top: 1px solid var(--border-subtle); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; width: 100%; }
.jdbRow:first-child { border-top: 0; }
.jdbRow:hover { background: rgba(255,255,255,0.03); }
.jdbRow:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: -2px; }
.jdbRow[data-sel="true"] { background: rgba(255,224,0,0.05); box-shadow: inset 3px 0 0 var(--brand-primary); cursor: default; }
.jdbJob { display: flex; align-items: center; gap: 12px; min-width: 0; }
.jdbName { min-width: 0; }
.jdbName b { display: block; font-size: 14.5px; font-weight: 800; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jdbName small { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 12px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jdbWhy { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 12px; font-weight: 700; }
.jdbWhy[data-tone="red"] { color: var(--c-red); }
.jdbWhy[data-tone="yellow"] { color: var(--warning); }
.jdbWhy[data-tone="green"] { color: var(--c-green); }
.jdbM { min-width: 0; }
.jdbM label { display: block; font-size: 12px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 4px; }
.jdbM b { font-size: 15px; font-weight: 900; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.jdbM small { display: block; margin-top: 2px; font-size: 12px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jdbM small[data-bad="true"] { color: var(--c-red); font-weight: 800; }
.jdbBar { height: 6px; border-radius: 6px; background: rgba(255,255,255,0.08); overflow: hidden; margin-top: 6px; }
.jdbBar > i { display: block; height: 100%; border-radius: 6px; background: var(--info); }
.jdbGo { color: var(--text-tertiary); }
.jdbClear { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border-default); background: rgba(255,255,255,0.04); color: var(--text-primary); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.jdbClear:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
.jdbEmpty { padding: 18px 16px; font-size: 14px; color: var(--text-tertiary); }
@media (max-width: 1100px) { .jdbRow { grid-template-columns: minmax(200px, 1.4fr) minmax(150px, 1fr) repeat(2, minmax(88px, .7fr)) 20px; } .jdbHideMd { display: none; } }
@media (max-width: 767px) {
  .jdbRow { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; padding: 14px; }
  .jdbJob { grid-column: 1 / -1; }
  .jdbBill { grid-column: 1 / -1; }
  .jdbHideMd { display: block; }
  .jdbGo { display: none; }
  .jdbClear { min-height: 44px; }
}
`;

const initials = (name: string) =>
  name.replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
const phaseLabel = (p: string | null) => (p ? p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null);
const TONE_ICON: Record<DocTone, React.ReactNode> = {
  red: <Warning size={13} weight="fill" />,
  yellow: <Clock size={13} weight="fill" />,
  green: <CheckCircle size={13} weight="fill" />,
};

export default function JobDocsBoard({
  jobs, colors, selectedId, onPick, onClear, loading, error, onRetry,
}: {
  jobs: JobDocs[];
  /** Stored job colours by id (falls back to the stable hash). */
  colors?: Record<string, string | null | undefined>;
  selectedId: string | null;
  onPick: (id: string) => void;
  onClear: () => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const shown = selectedId ? jobs.filter((j) => j.id === selectedId) : jobs;
  const count = (t: DocTone) => jobs.filter((j) => j.tone === t).length;

  return (
    <section className="jdb" aria-label="Paperwork by job">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="jdbHead">
        <h2>{selectedId ? 'This job' : 'Jobs'}</h2>
        {!selectedId && !loading && !error && jobs.length > 0 && (
          <span className="jdbLegend">
            <span><i data-tone="red" />{count('red')} need a waiver</span>
            <span><i data-tone="yellow" />{count('yellow')} waiting</span>
            <span><i data-tone="green" />{count('green')} up to date</span>
          </span>
        )}
        {selectedId && (
          <button type="button" className="jdbClear" onClick={onClear}><X size={14} weight="bold" /> Show all jobs</button>
        )}
      </div>
      <div className="jdbList">
        {loading ? (
          <div className="jdbEmpty">Loading jobs…</div>
        ) : error ? (
          <div className="jdbEmpty">Couldn&apos;t load paperwork by job. {onRetry && <button type="button" className="jdbClear" onClick={onRetry}>Retry</button>}</div>
        ) : shown.length === 0 ? (
          <div className="jdbEmpty">{selectedId ? 'This job has no paperwork yet.' : 'No jobs yet. Paperwork for each job shows up here.'}</div>
        ) : shown.map((j) => {
          const hex = projectColor({ id: j.id, color: colors?.[j.id] ?? null });
          const pct = j.contract ? Math.min(100, Math.round((j.billed / j.contract) * 100)) : null;
          const sel = selectedId === j.id;
          return (
            <button key={j.id} type="button" className="jdbRow" data-sel={sel ? 'true' : undefined}
              onClick={() => !sel && onPick(j.id)} aria-pressed={sel}
              aria-label={`${j.name}: ${j.why}${sel ? '' : '. Show only this job.'}`}>
              <div className="jdbJob" data-tone={j.tone}>
                <span style={jobTileStyle(hex)} aria-hidden>{initials(j.name)}</span>
                <span className="jdbName">
                  <b>{j.name}</b>
                  <small>{[j.number, phaseLabel(j.phase)].filter(Boolean).join(' · ') || 'Job'}</small>
                  <span className="jdbWhy" data-tone={j.tone}>{TONE_ICON[j.tone]} {j.why}</span>
                </span>
              </div>
              <div className="jdbM jdbBill">
                <label>Billed</label>
                <b>{fmtMoneyShort(j.billed)}</b>{j.contract ? <small style={{ display: 'inline', marginLeft: 6 }}>of {fmtMoneyShort(j.contract)}{pct != null ? ` · ${pct}%` : ''}</small> : <small style={{ display: 'inline', marginLeft: 6 }}>no contract value</small>}
                {pct != null && <div className="jdbBar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% billed`}><i style={{ width: `${pct}%` }} /></div>}
              </div>
              <div className="jdbM">
                <label>Pay apps</label>
                <b>{j.payApps.total}</b>
                <small>{j.payApps.total ? `${j.payApps.paid} paid${j.payApps.awaiting ? ` · ${j.payApps.awaiting} waiting` : ''}` : 'none yet'}</small>
              </div>
              <div className="jdbM">
                <label>Lien waivers</label>
                <b>{j.waivers.signed}<span style={{ color: 'var(--text-tertiary)', fontWeight: 700 }}> / {j.waivers.signed + j.waivers.waiting}</span></b>
                {j.paidNoWaiver
                  ? <small data-bad="true">{j.paidNoWaiver} paid, no waiver</small>
                  : <small>{j.waivers.waiting ? `${j.waivers.waiting} waiting` : j.waivers.signed ? 'all signed' : 'none yet'}</small>}
              </div>
              <div className="jdbM jdbHideMd">
                <label>Payroll</label>
                <b>{j.payroll.weeks}</b>
                <small>{j.payroll.weeks ? `week${j.payroll.weeks === 1 ? '' : 's'} filed` : 'none filed'}</small>
              </div>
              <div className="jdbM jdbHideMd">
                <label>Closeout</label>
                <b>{j.closeout.total ? `${j.closeout.done}/${j.closeout.total}` : '—'}</b>
                <small>{j.closeout.total ? (j.closeout.done === j.closeout.total ? 'complete' : 'items done') : 'no checklist'}</small>
              </div>
              <span className="jdbGo" aria-hidden>{sel ? null : <CaretRight size={16} />}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
