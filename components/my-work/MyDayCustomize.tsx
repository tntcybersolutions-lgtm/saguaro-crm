'use client';
/**
 * Customize My Day — a side sheet (a bottom sheet on a phone) where a person
 * shapes their own day: which sections show and in what order (drag, or the
 * arrows), how dense the rows are, the agenda's working hours, how far the
 * look-ahead runs and how it groups, and whether dollars show. Every change
 * applies live behind the sheet and saves to their account (lib/my-day-prefs,
 * PUT /api/my-day/prefs) — no Save button to forget.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  X, DotsSixVertical, ArrowUp, ArrowDown, Rows, ListBullets, Minus, Plus, ArrowCounterClockwise, CheckCircle, WarningCircle,
  SunHorizon, Sun, MoonStars, Binoculars, Buildings, UserCircle, CurrencyCircleDollar,
} from '@phosphor-icons/react';
import { SECTION_META, hourLabel, type MyDayPrefs, type SectionId } from '@/lib/my-day-prefs';

const CSS = `
.mdc-scrim{position:fixed;inset:0;z-index:10040;background:rgba(5,9,16,.28);animation:mdcFade .18s ease-out}
.mdc{position:fixed;top:0;right:0;bottom:0;z-index:10050;width:min(460px,100vw);display:flex;flex-direction:column;background:var(--md-sheet);border-left:1px solid var(--border-default);box-shadow:-24px 0 60px rgba(2,6,23,.55);color:var(--text-primary);animation:mdcIn .26s cubic-bezier(.2,.8,.2,1)}
@keyframes mdcIn{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes mdcUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes mdcFade{from{opacity:0}to{opacity:1}}
.mdc *{box-sizing:border-box}
.mdc button{font:inherit}
.mdc :focus-visible{outline:2px solid var(--brand-primary);outline-offset:2px;border-radius:8px}
.mdc-h{display:flex;align-items:center;gap:12px;padding:20px 20px 14px;border-bottom:1px solid var(--border-subtle)}
.mdc-h h2{margin:0;font-size:20px;font-weight:900;letter-spacing:-.01em;color:var(--title-section)}
.mdc-h p{margin:2px 0 0;font-size:13px;color:var(--text-tertiary)}
.mdc-x{margin-left:auto;display:grid;place-items:center;width:44px;height:44px;border-radius:12px;border:1px solid var(--border-default);background:none;color:var(--text-primary);cursor:pointer}
.mdc-x:hover{border-color:var(--brand-primary);color:var(--brand-primary)}
.mdc-body{flex:1;overflow-y:auto;padding:6px 20px 24px;overscroll-behavior:contain}
.mdc-sec{padding:18px 0 4px}
.mdc-sec + .mdc-sec{border-top:1px solid var(--border-subtle)}
.mdc-lbl{display:flex;align-items:baseline;justify-content:space-between;margin:0 0 10px;font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--text-tertiary)}
.mdc-lbl span{letter-spacing:0;text-transform:none;font-weight:700;color:var(--text-tertiary)}
.mdc-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.mdc-item{display:grid;grid-template-columns:28px 36px minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:8px 8px 8px 4px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid transparent;transition:border-color .15s,background .15s,opacity .15s,transform .15s}
.mdc-item[data-off=true]{opacity:.5}
.mdc-item[data-drag=true]{border-color:var(--brand-primary);background:rgba(232,255,42,.06);transform:scale(1.01)}
.mdc-item[data-over=true]{box-shadow:0 -2px 0 var(--brand-primary)}
.mdc-grip{display:grid;place-items:center;height:40px;color:var(--text-tertiary);cursor:grab}
.mdc-grip:active{cursor:grabbing}
.mdc-time{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;color:var(--t);background:color-mix(in srgb,var(--t) 14%,transparent)}
.mdc-name{min-width:0}
.mdc-name b{display:block;font-size:14.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mdc-name span{display:block;font-size:12px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mdc-move{display:flex;gap:2px}
.mdc-move button{display:grid;place-items:center;width:30px;height:36px;border-radius:8px;border:0;background:none;color:var(--text-tertiary);cursor:pointer}
.mdc-move button:hover:not([disabled]){color:var(--brand-primary);background:rgba(255,255,255,.04)}
.mdc-move button[disabled]{opacity:.25;cursor:default}
.mdc-sw{position:relative;width:48px;height:28px;flex:none;border-radius:999px;border:0;background:var(--border-default);cursor:pointer;transition:background .18s}
.mdc-sw::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:var(--text-primary);box-shadow:0 2px 6px rgba(0,0,0,.35);transition:transform .2s cubic-bezier(.2,.8,.2,1)}
.mdc-sw[aria-checked=true]{background:var(--brand-primary)}
.mdc-sw[aria-checked=true]::after{transform:translateX(20px);background:var(--bg-base)}
.mdc-sw[disabled]{opacity:.4;cursor:default}
.mdc-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;padding:4px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid var(--border-subtle)}
.mdc-seg button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:64px;padding:8px 6px;border-radius:10px;border:0;background:none;color:var(--text-secondary);font-size:13px;font-weight:800;cursor:pointer;transition:background .15s,color .15s}
.mdc-seg button:hover{color:var(--text-primary);background:rgba(255,255,255,.04)}
.mdc-seg button[aria-checked=true]{background:var(--brand-primary);color:var(--bg-base)}
.mdc-seg[data-small=true] button{min-height:44px;flex-direction:row}
.mdc-dens{display:flex;flex-direction:column;gap:3px;width:34px}
.mdc-dens i{display:block;height:3px;border-radius:2px;background:currentColor;opacity:.8}
.mdc-row{display:flex;align-items:center;gap:12px;padding:10px 0}
.mdc-row > div{flex:1;min-width:0}
.mdc-row b{display:block;font-size:14.5px;font-weight:800}
.mdc-row span{display:block;font-size:12.5px;color:var(--text-tertiary)}
.mdc-hours{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mdc-step{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid var(--border-subtle)}
.mdc-step em{display:block;font-style:normal;font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--text-tertiary);text-align:center}
.mdc-step b{display:block;font-size:18px;font-weight:900;text-align:center;font-variant-numeric:tabular-nums}
.mdc-step button{display:grid;place-items:center;width:40px;height:40px;border-radius:10px;border:1px solid var(--border-default);background:none;color:var(--text-primary);cursor:pointer}
.mdc-step button:hover:not([disabled]){border-color:var(--brand-primary);color:var(--brand-primary)}
.mdc-step button[disabled]{opacity:.3;cursor:default}
.mdc-day{position:relative;height:14px;margin:12px 0 22px;border-radius:8px;background:linear-gradient(90deg,var(--md-night) 0%,var(--md-dusk) 25%,var(--border-default) 50%,var(--md-dusk) 75%,var(--md-night) 100%);overflow:visible}
.mdc-day i{position:absolute;top:0;bottom:0;border-radius:8px;background:linear-gradient(90deg,rgba(232,255,42,.75),rgba(253,186,116,.75));box-shadow:0 0 18px rgba(232,255,42,.35);transition:left .2s,width .2s}
.mdc-day span{position:absolute;top:20px;font-size:12px;font-weight:900;color:var(--text-tertiary)}
.mdc-f{display:flex;align-items:center;gap:10px;padding:14px 20px;border-top:1px solid var(--border-subtle);background:var(--md-sheet-foot)}
.mdc-save{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--text-tertiary)}
.mdc-save[data-s=saved]{color:var(--success)}
.mdc-save[data-s=error]{color:var(--danger)}
.mdc-b{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--border-default);background:none;color:var(--text-primary);font-size:14px;font-weight:800;cursor:pointer}
.mdc-b:hover{border-color:var(--brand-primary);color:var(--brand-primary)}
.mdc-b[data-k=primary]{margin-left:auto;background:var(--brand-primary);border-color:var(--brand-primary);color:var(--bg-base)}
.mdc-b[data-k=primary]:hover{background:var(--action-primary-hover);color:var(--bg-base)}
@media (max-width:640px){
  .mdc{top:auto;left:0;width:100vw;max-height:92vh;border-left:0;border-top:1px solid var(--border-default);border-radius:20px 20px 0 0;animation:mdcUp .26s cubic-bezier(.2,.8,.2,1)}
  .mdc-item{grid-template-columns:24px 32px minmax(0,1fr) auto auto;gap:8px}
}
@media (prefers-reduced-motion: reduce){.mdc,.mdc-scrim,.mdc *{animation:none!important;transition:none!important}}
`;

const TIME_UI: Record<string, { Icon: React.ElementType; color: string }> = {
  Morning: { Icon: SunHorizon, color: 'var(--warning)' },
  Midday: { Icon: Sun, color: 'var(--kind-todo)' },
  'End of day': { Icon: MoonStars, color: 'var(--kind-submittal)' },
  'Look ahead': { Icon: Binoculars, color: 'var(--kind-inspection)' },
};

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="mdc-sw" disabled={disabled} onClick={() => onChange(!on)} />;
}

function Seg<T extends string | number>({ value, options, onChange, label, small }: { value: T; options: Array<{ v: T; label: string; icon?: React.ReactNode }>; onChange: (v: T) => void; label: string; small?: boolean }) {
  return (
    <div className="mdc-seg" role="radiogroup" aria-label={label} data-small={small || undefined}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function MyDayCustomize({ prefs, onChange, onReset, onClose, save, canSeeCompany }: {
  prefs: MyDayPrefs;
  onChange: (p: MyDayPrefs) => void;
  onReset: () => void;
  onClose: () => void;
  save: SaveState;
  canSeeCompany: boolean;
}) {
  const [drag, setDrag] = useState<SectionId | null>(null);
  const [over, setOver] = useState<SectionId | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const set = (patch: Partial<MyDayPrefs>) => onChange({ ...prefs, ...patch });
  const move = (id: SectionId, to: number) => {
    const order = prefs.order.filter((s) => s !== id);
    order.splice(Math.max(0, Math.min(order.length, to)), 0, id);
    set({ order });
  };
  const toggle = (id: SectionId, on: boolean) => set({ hidden: on ? prefs.hidden.filter((s) => s !== id) : [...prefs.hidden, id] });

  const dayPct = (h: number) => `${(h / 24) * 100}%`;

  return (
    <>
      <div className="mdc-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="mdc" role="dialog" aria-modal="true" aria-labelledby="mdc-title">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <header className="mdc-h">
          <div>
            <h2 id="mdc-title">Customize My Day</h2>
            <p>Your layout, saved to your account on every device.</p>
          </div>
          <button ref={closeRef} type="button" className="mdc-x" onClick={onClose} aria-label="Close"><X size={20} weight="bold" /></button>
        </header>

        <div className="mdc-body">
          <section className="mdc-sec" aria-label="Sections">
            <div className="mdc-lbl">Your day, in order <span>Drag to reorder</span></div>
            <ol className="mdc-list">
              {prefs.order.map((id, i) => {
                const meta = SECTION_META[id];
                const t = TIME_UI[meta.time] ?? TIME_UI.Morning;
                const on = !prefs.hidden.includes(id);
                const locked = id === 'start';
                return (
                  <li key={id} className="mdc-item" data-off={!on} data-drag={drag === id} data-over={over === id && drag !== id}
                    draggable onDragStart={(e) => { setDrag(id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={(e) => { e.preventDefault(); if (over !== id) setOver(id); }}
                    onDragLeave={() => setOver((o) => (o === id ? null : o))}
                    onDrop={(e) => { e.preventDefault(); if (drag && drag !== id) move(drag, prefs.order.indexOf(id)); setDrag(null); setOver(null); }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}>
                    <span className="mdc-grip" aria-hidden="true"><DotsSixVertical size={20} weight="bold" /></span>
                    <span className="mdc-time" style={{ ['--t' as string]: t.color }} title={meta.time}><t.Icon size={19} weight="duotone" /></span>
                    <span className="mdc-name"><b>{meta.label}</b><span>{meta.hint}</span></span>
                    <span className="mdc-move">
                      <button type="button" disabled={i === 0} onClick={() => move(id, i - 1)} aria-label={`Move ${meta.label} up`}><ArrowUp size={16} weight="bold" /></button>
                      <button type="button" disabled={i === prefs.order.length - 1} onClick={() => move(id, i + 1)} aria-label={`Move ${meta.label} down`}><ArrowDown size={16} weight="bold" /></button>
                    </span>
                    <Switch on={on} disabled={locked} onChange={(v) => toggle(id, v)} label={locked ? `${meta.label} always shows` : `Show ${meta.label}`} />
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="mdc-sec" aria-label="Look">
            <div className="mdc-lbl">Row density</div>
            <Seg<MyDayPrefs['density']> label="Row density" value={prefs.density} onChange={(v) => set({ density: v })} options={[
              { v: 'comfortable', label: 'Comfortable', icon: <span className="mdc-dens" style={{ gap: 6 }}><i /><i /><i /></span> },
              { v: 'compact', label: 'Compact', icon: <span className="mdc-dens"><i /><i /><i /><i /><i /></span> },
            ]} />
            <div className="mdc-row">
              <CurrencyCircleDollar size={24} weight="duotone" style={{ color: 'var(--success)', flex: 'none' }} />
              <div><b>Show dollar amounts</b><span>Money at stake on rows, sections and jobs</span></div>
              <Switch on={prefs.showMoney} onChange={(v) => set({ showMoney: v })} label="Show dollar amounts" />
            </div>
          </section>

          <section className="mdc-sec" aria-label="Working hours">
            <div className="mdc-lbl">Agenda hours <span>{hourLabel(prefs.dayStart)} – {hourLabel(prefs.dayEnd)}</span></div>
            <div className="mdc-hours">
              <div className="mdc-step">
                <button type="button" disabled={prefs.dayStart <= 0} onClick={() => set({ dayStart: prefs.dayStart - 1 })} aria-label="Start the day an hour earlier"><Minus size={16} weight="bold" /></button>
                <div><em>Day starts</em><b>{hourLabel(prefs.dayStart)}</b></div>
                <button type="button" disabled={prefs.dayEnd - prefs.dayStart <= 4} onClick={() => set({ dayStart: prefs.dayStart + 1 })} aria-label="Start the day an hour later"><Plus size={16} weight="bold" /></button>
              </div>
              <div className="mdc-step">
                <button type="button" disabled={prefs.dayEnd - prefs.dayStart <= 4} onClick={() => set({ dayEnd: prefs.dayEnd - 1 })} aria-label="End the day an hour earlier"><Minus size={16} weight="bold" /></button>
                <div><em>Day ends</em><b>{hourLabel(prefs.dayEnd)}</b></div>
                <button type="button" disabled={prefs.dayEnd >= 23} onClick={() => set({ dayEnd: prefs.dayEnd + 1 })} aria-label="End the day an hour later"><Plus size={16} weight="bold" /></button>
              </div>
            </div>
            <div className="mdc-day" aria-hidden="true">
              <i style={{ left: dayPct(prefs.dayStart), width: dayPct(prefs.dayEnd - prefs.dayStart) }} />
              <span style={{ left: '2%' }}>12A</span><span style={{ left: '47%' }}>12P</span><span style={{ right: '2%' }}>12A</span>
            </div>
          </section>

          <section className="mdc-sec" aria-label="Look ahead">
            <div className="mdc-lbl">Runway length</div>
            <Seg<MyDayPrefs['runwayDays']> small label="Runway length" value={prefs.runwayDays} onChange={(v) => set({ runwayDays: v })} options={[
              { v: 7, label: '1 week' }, { v: 14, label: '2 weeks' }, { v: 30, label: '30 days' },
            ]} />
            <div className="mdc-lbl" style={{ marginTop: 16 }}>Group what&apos;s coming up by</div>
            <Seg<MyDayPrefs['upcomingGroup']> small label="Group what's coming up by" value={prefs.upcomingGroup} onChange={(v) => set({ upcomingGroup: v })} options={[
              { v: 'day', label: 'Day', icon: <ListBullets size={16} weight="bold" /> },
              { v: 'job', label: 'Job', icon: <Buildings size={16} weight="bold" /> },
              { v: 'type', label: 'Type', icon: <Rows size={16} weight="bold" /> },
            ]} />
          </section>

          {canSeeCompany && (
            <section className="mdc-sec" aria-label="Whose work">
              <div className="mdc-lbl">Whose work</div>
              <Seg<MyDayPrefs['scope']> small label="Whose work" value={prefs.scope} onChange={(v) => set({ scope: v })} options={[
                { v: 'company', label: 'Whole company', icon: <Buildings size={16} weight="bold" /> },
                { v: 'mine', label: 'My jobs', icon: <UserCircle size={16} weight="bold" /> },
              ]} />
            </section>
          )}
        </div>

        <footer className="mdc-f">
          <button type="button" className="mdc-b" onClick={onReset}><ArrowCounterClockwise size={16} weight="bold" />Reset</button>
          <span className="mdc-save" data-s={save} role="status" aria-live="polite">
            {save === 'saving' ? 'Saving…' : save === 'saved' ? <><CheckCircle size={16} weight="fill" />Saved</> : save === 'error' ? <><WarningCircle size={16} weight="fill" />Couldn&apos;t save</> : null}
          </span>
          <button type="button" className="mdc-b" data-k="primary" onClick={onClose}>Done</button>
        </footer>
      </aside>
    </>
  );
}
