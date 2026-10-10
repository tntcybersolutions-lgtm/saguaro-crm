'use client';
/**
 * Home's header: the date, the greeting, and ONE row of compact controls —
 * the view chip ("Owner ▾", which also holds Mine/Team and "always start
 * here"), the job chip, and "+" for Create. Nothing here scrolls the page.
 */
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus } from '@phosphor-icons/react';
import { jobOptionStyle } from '@/lib/project-colors';
import type { Project } from '@/lib/hooks/useProjects';
import type { HomeView } from '@/lib/home/rank';

export interface HeaderContext {
  view: HomeView; viewLabel: string; defaultView: HomeView; savedView: HomeView | null;
  views: Array<{ key: HomeView; label: string }>;
  scope: 'mine' | 'team'; today: string; timeZone: string; firstName: string | null;
}

/** "Good morning" in the person's zone (the device's, else the company's). */
export function greeting(timeZone: string, now: Date = new Date()): string {
  let h = 12;
  try {
    h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now));
  } catch (e) {
    console.error('[home] unknown time zone for greeting', timeZone, e);
  }
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** SATURDAY · OCT 10 */
export function dateLine(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00Z');
  const wd = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${wd} · ${md}`;
}

/** Close a popover on a tap outside it or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

function ViewChip({ ctx, onView, onScope, onSaveDefault, saving }: {
  ctx: HeaderContext; onView: (v: HomeView) => void; onScope: (s: 'mine' | 'team') => void; onSaveDefault: () => void; saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const hasScope = ctx.view !== 'field' && ctx.view !== 'owner';
  const offerDefault = ctx.savedView ? ctx.savedView !== ctx.view : ctx.view !== ctx.defaultView;
  if (ctx.views.length <= 1 && !hasScope && !offerDefault) return null;
  return (
    <div className="fh-pop" ref={ref}>
      <button type="button" className="fh-chip" aria-haspopup="menu" aria-expanded={open} aria-label={`Dashboard view: ${ctx.viewLabel}${hasScope ? `, ${ctx.scope === 'mine' ? 'my work' : 'team'}` : ''}`} onClick={() => setOpen(o => !o)}>
        <span>{ctx.viewLabel}{hasScope && ctx.scope === 'mine' ? ' · Mine' : ''}</span><i aria-hidden="true">▾</i>
      </button>
      {open && (
        <div className="fh-menu" data-side="right" role="menu" aria-label="Dashboard view">
          {ctx.views.length > 1 && <h3>View</h3>}
          {ctx.views.length > 1 && ctx.views.map(v => (
            <button key={v.key} type="button" role="menuitemradio" aria-checked={v.key === ctx.view} onClick={() => { setOpen(false); if (v.key !== ctx.view) onView(v.key); }}>{v.label}</button>
          ))}
          {hasScope && <><hr /><h3>Whose work</h3>
            {(['mine', 'team'] as const).map(s => (
              <button key={s} type="button" role="menuitemradio" aria-checked={ctx.scope === s} onClick={() => { setOpen(false); if (s !== ctx.scope) onScope(s); }}>{s === 'mine' ? 'My work' : 'Team'}</button>
            ))}</>}
          {offerDefault && <><hr />
            <button type="button" role="menuitem" disabled={saving} onClick={() => { onSaveDefault(); setOpen(false); }}>{saving ? 'Saving…' : `Always start on ${ctx.viewLabel}`}</button>
            {ctx.savedView && <p>Your default is {ctx.views.find(v => v.key === ctx.savedView)?.label || ctx.savedView}.</p>}</>}
        </div>
      )}
    </div>
  );
}

/** The job chip: a real <select> under the chip, so a phone gets the app's picker sheet. */
function JobChip({ projects, value, onChange }: { projects: Project[]; value: string; onChange: (id: string | null) => void }) {
  const current = projects.find(p => p.id === value);
  const label = current ? current.name.split(/\s+[—–-]\s+/)[0] : 'All jobs';
  return (
    <label className="fh-chip" title={current?.name || 'All jobs'}>
      <span>{label}</span><i aria-hidden="true">▾</i>
      <select aria-label="Job" value={value} onChange={e => onChange(e.target.value || null)}>
        <option value="">All jobs</option>
        {projects.map(p => <option key={p.id} value={p.id} style={jobOptionStyle(p)}>{p.name}</option>)}
      </select>
    </label>
  );
}

/** "+": Create. Job-level items need a job picked in the job chip; nothing guesses one. */
function CreateMenu({ view, projectId }: { view: HomeView; projectId: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const p = projectId ? `/app/projects/${projectId}` : null;
  const items: Array<{ label: string; href: string | null }> = [
    { label: 'Photo or video', href: p && `${p}/photos?add=1` },
    { label: 'Task', href: p && `${p}/todos` },
    { label: 'Daily log', href: p && `${p}/daily-logs` },
    { label: 'RFI', href: p && `${p}/rfis` },
    { label: 'Punch item', href: p && `${p}/punch-list` },
    { label: 'Change order', href: p && `${p}/change-orders` },
    ...(view === 'sales' || view === 'owner' ? [{ label: 'Lead', href: '/app/leads' }] : []),
    ...(view === 'service' ? [{ label: 'Service call', href: '/app/service?new=1' }, { label: 'Warranty claim', href: '/app/warranty-claims' }] : []),
    { label: 'Job', href: '/app/projects/new' },
  ];
  return (
    <div className="fh-pop" ref={ref}>
      <button type="button" className="fh-plus" aria-label="Create" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Plus size={16} weight="bold" />
      </button>
      {open && (
        <div className="fh-menu" data-side="right" role="menu" aria-label="Create">
          {!projectId && <p>Pick a job in the job chip for job items.</p>}
          {items.map(i => i.href
            ? <Link key={i.label} role="menuitem" href={i.href} onClick={() => setOpen(false)}>{i.label}</Link>
            : <span key={i.label} role="menuitem" aria-disabled="true" className="fh-off">{i.label}</span>)}
        </div>
      )}
    </div>
  );
}

export default function HomeHeader({ ctx, loading, projects, projectId, onParam, onSaveDefault, saving }: {
  ctx: HeaderContext | null;
  /** True until the first answer; a failed load shows a plain title, not skeletons. */
  loading: boolean;
  projects: Project[];
  projectId: string | null;
  onParam: (k: 'view' | 'scope' | 'project', v: string | null) => void;
  onSaveDefault: () => void;
  saving: boolean;
}) {
  return (
    <header className="fh-head">
      <div className="fh-top">
        {ctx ? <div className="fh-date">{dateLine(ctx.today)}</div> : loading ? <span className="fh-skel-line" style={{ width: 120 }} aria-hidden="true" /> : <span />}
        <div className="fh-ctrls">
          {ctx && <ViewChip ctx={ctx} onView={v => onParam('view', v)} onScope={s => onParam('scope', s)} onSaveDefault={onSaveDefault} saving={saving} />}
          <JobChip projects={projects} value={projectId || ''} onChange={id => onParam('project', id)} />
          <CreateMenu view={ctx?.view || 'operations'} projectId={projectId} />
        </div>
      </div>
      {ctx
        ? <h1 className="fh-hello">{ctx.firstName ? `${greeting(ctx.timeZone)}, ${ctx.firstName}` : `${ctx.viewLabel} home`}</h1>
        : loading ? <span className="fh-skel-line" style={{ width: 220, height: 20, marginTop: 6 }} aria-hidden="true" />
        : <h1 className="fh-hello">Home</h1>}
    </header>
  );
}
