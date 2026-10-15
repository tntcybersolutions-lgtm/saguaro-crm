'use client';
/**
 * "Arrange" — reorder and hide a page's panels, saved per person
 * (GET/PUT /api/layout-prefs). The page passes its panels in default order;
 * the hook hands back the order to show.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ArrowDown, Eye, EyeSlash, SlidersHorizontal, ArrowCounterClockwise } from '@phosphor-icons/react';
import { arrange, move, type PanelLayout } from '@/lib/panel-layout';

export type PanelDef = { key: string; label: string };

const cacheKey = (scope: string) => `saguaro.layout.${scope}`;

export function usePanelLayout(scope: string, panels: PanelDef[]) {
  const defaults = useMemo(() => panels.map((p) => p.key), [panels]);
  const [layout, setLayout] = useState<PanelLayout | null>(() => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(window.localStorage.getItem(cacheKey(scope)) || 'null'); } catch { return null; }
  });
  const [error, setError] = useState('');

  useEffect(() => {
    let off = false;
    fetch(`/api/layout-prefs?scope=${encodeURIComponent(scope)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (off || !j) return;
        const l = (j.order?.length || j.hidden?.length) ? (j as PanelLayout) : null;
        setLayout(l);
        try { window.localStorage.setItem(cacheKey(scope), JSON.stringify(l)); } catch { /* private mode */ }
      })
      .catch(() => { /* keep the cached or default layout */ });
    return () => { off = true; };
  }, [scope]);

  const save = useCallback(async (next: PanelLayout | null) => {
    setLayout(next);
    setError('');
    try { window.localStorage.setItem(cacheKey(scope), JSON.stringify(next)); } catch { /* private mode */ }
    const r = await fetch('/api/layout-prefs', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next ? { scope, ...next } : { scope, reset: true }),
    }).catch(() => null);
    if (!r || !r.ok) setError("Couldn't save your layout — it's kept on this device for now.");
  }, [scope]);

  const all = useMemo(() => {
    const shown = arrange(defaults, layout ? { order: layout.order, hidden: [] } : null);
    return shown;
  }, [defaults, layout]);
  const hidden = useMemo(() => new Set(layout?.hidden || []), [layout]);
  const visible = useMemo(() => all.filter((k) => !hidden.has(k)), [all, hidden]);

  return {
    visible,
    all,
    hidden,
    error,
    customized: !!layout,
    move: (key: string, dir: -1 | 1) => save({ order: move(all, key, dir), hidden: Array.from(hidden) }),
    toggle: (key: string) => {
      const h = new Set(hidden);
      if (h.has(key)) h.delete(key); else h.add(key);
      return save({ order: all, hidden: Array.from(h) });
    },
    reset: () => save(null),
  };
}

export function ArrangeButton({ panels, state, label = 'Arrange' }: { panels: PanelDef[]; state: ReturnType<typeof usePanelLayout>; label?: string }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = React.useRef<HTMLButtonElement>(null);
  const menu = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pos) return;
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !menu.current?.contains(t)) setPos(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [pos]);
  const byKey = new Map(panels.map((p) => [p.key, p.label]));
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <button ref={btn} type="button" className="ap-btn" aria-haspopup="dialog" aria-expanded={!!pos}
        onClick={() => { if (pos) { setPos(null); return; } const r = btn.current!.getBoundingClientRect(); setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) }); }}>
        <SlidersHorizontal size={15} weight="bold" />{label}{state.customized && <span className="ap-dot" aria-label="customized" />}
      </button>
      {pos && createPortal(
        <div ref={menu} className="ap-menu" role="dialog" aria-label="Arrange panels" style={{ top: pos.top, right: pos.right }}>
          <p className="ap-h">Show and order panels</p>
          <ol className="ap-list">
            {state.all.map((k, i) => {
              const off = state.hidden.has(k);
              return (
                <li key={k} data-off={off || undefined}>
                  <button type="button" className="ap-eye" aria-label={off ? `Show ${byKey.get(k)}` : `Hide ${byKey.get(k)}`} onClick={() => void state.toggle(k)}>
                    {off ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                  <span className="ap-name">{byKey.get(k) || k}</span>
                  <button type="button" className="ap-mv" aria-label={`Move ${byKey.get(k)} up`} disabled={i === 0} onClick={() => void state.move(k, -1)}><ArrowUp size={14} weight="bold" /></button>
                  <button type="button" className="ap-mv" aria-label={`Move ${byKey.get(k)} down`} disabled={i === state.all.length - 1} onClick={() => void state.move(k, 1)}><ArrowDown size={14} weight="bold" /></button>
                </li>
              );
            })}
          </ol>
          {state.error && <p className="ap-err" role="alert">{state.error}</p>}
          <button type="button" className="ap-reset" disabled={!state.customized} onClick={() => void state.reset()}><ArrowCounterClockwise size={14} /> Back to the standard layout</button>
        </div>,
        document.body,
      )}
    </>
  );
}

const CSS = `
.ap-btn{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border-radius:8px;border:1px solid var(--border-default);background:var(--bg-surface);color:var(--text-primary);font:600 13px/1 inherit;cursor:pointer;position:relative}
.ap-btn:hover{border-color:var(--text-tertiary)}
.ap-dot{width:7px;height:7px;border-radius:50%;background:var(--brand-primary)}
.ap-menu{position:fixed;z-index:1000;width:300px;max-width:calc(100vw - 16px);padding:10px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border-default);box-shadow:0 16px 40px rgba(0,0,0,.55);display:grid;gap:8px}
.ap-h{margin:2px 4px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--title-section,var(--brand-primary))}
.ap-list{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.ap-list li{display:flex;align-items:center;gap:6px;padding:4px;border-radius:8px}
.ap-list li:hover{background:var(--bg-surface-2)}
.ap-list li[data-off] .ap-name{color:var(--text-tertiary);text-decoration:line-through}
.ap-name{flex:1;font-size:14px;color:var(--text-primary)}
.ap-eye,.ap-mv{min-width:32px;min-height:32px;display:grid;place-items:center;border-radius:6px;border:0;background:none;color:var(--text-secondary);cursor:pointer}
.ap-eye:hover,.ap-mv:hover:not(:disabled){background:var(--bg-base);color:var(--text-primary)}
.ap-mv:disabled{opacity:.3;cursor:default}
.ap-reset{display:inline-flex;gap:6px;align-items:center;justify-content:center;min-height:34px;border-radius:8px;border:1px solid var(--border-default);background:none;color:var(--text-secondary);font:inherit;font-size:13px;cursor:pointer}
.ap-reset:disabled{opacity:.4;cursor:default}
.ap-err{margin:0;font-size:13px;color:var(--danger)}
`;
