'use client';

/**
 * Every drop-down on a phone opens as our own sheet, not the system list.
 *
 * On an iPhone a native <select> opens UIKit's picker: white system type on
 * a grey blur that ignores every style the page sets. Chad found it on "lots
 * of drop-down menus" — the app has 231 selects across 84 files, so restyling
 * them one by one was never going to reach the open list.
 *
 * Mounted once in the app shell. On a touch screen at phone width it catches
 * the tap on any single-choice <select>, opens a bottom sheet in the premium
 * system (champagne rows, a yellow check on the chosen one, the job's dot
 * when the option carries one, groups, search on long lists, swipe down to
 * close) and writes the choice back to the real element — through the native
 * value setter plus input/change events, so React's onChange runs exactly as
 * if the person had used the system picker. Nothing on any page changes.
 *
 * Desktop, mouse users at narrow widths, multi-selects and listboxes keep the
 * native control. A select can opt out with data-native-select.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, MagnifyingGlass, X } from '@phosphor-icons/react';

type Opt = { index: number; label: string; value: string; disabled: boolean; group: string | null; dot: string | null };
type Open = { el: HTMLSelectElement; title: string; options: Opt[]; selected: number };

const PHONE = '(max-width: 767px) and (pointer: coarse)';

function eligible(t: EventTarget | null): HTMLSelectElement | null {
  if (!(t instanceof Element)) return null;
  let el = t.closest('select');
  if (!el) {
    /* A tap on a <label> — or on something layered over the select inside it,
       like a chip's enlarged ::after hit area — activates its select, and iOS
       then opens its own picker AND ours (through focus): two lists. Take the
       tap as a tap on the select so only ours opens. */
    const ctl = t.closest('label')?.control;
    el = ctl instanceof HTMLSelectElement ? ctl : null;
  }
  if (!el || el.multiple || el.size > 1 || el.disabled) return null;
  if (el.closest('[data-native-select]')) return null;
  return el;
}

/** What the drop-down is for, in the words the page already uses. */
function titleOf(el: HTMLSelectElement): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria;
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const t = by.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
    if (t) return t;
  }
  if (el.id) {
    // window.CSS: this module's own stylesheet constant is also named CSS.
    const l = document.querySelector(`label[for="${window.CSS.escape(el.id)}"]`);
    if (l?.textContent?.trim()) return l.textContent.trim();
  }
  const wrap = el.closest('label');
  if (wrap) {
    const clone = wrap.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('select').forEach(s => s.remove());
    const t = clone.textContent?.trim();
    if (t) return t;
  }
  return 'Choose one';
}

function readOptions(el: HTMLSelectElement): Opt[] {
  return Array.from(el.options).map((o, index) => {
    const grp = o.parentElement instanceof HTMLOptGroupElement ? o.parentElement : null;
    const dot = o.style.getPropertyValue('--dot').trim() || null;
    return {
      index, value: o.value, label: o.label || o.text,
      disabled: o.disabled || !!grp?.disabled, group: grp?.label || null, dot,
    };
  });
}

/** Set the value the way a person would, so React and plain listeners both hear it. */
function commit(el: HTMLSelectElement, index: number) {
  const opt = el.options[index];
  if (!opt || el.selectedIndex === index) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(el, opt.value); else el.value = opt.value;
  el.selectedIndex = index;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export default function MobileSelectSheet() {
  const [open, setOpen] = useState<Open | null>(null);
  const [q, setQ] = useState('');
  const openRef = useRef<Open | null>(null);
  openRef.current = open;
  const touch = useRef<{ x: number; y: number; el: HTMLSelectElement } | null>(null);
  /* Swipe down to close, the same gesture as the job picker. */
  const drag = useRef<{ y0: number; t0: number; dy: number; live: boolean } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const close = useCallback(() => { setOpen(null); setDragY(0); }, []);

  const show = useCallback((el: HTMLSelectElement) => {
    const options = readOptions(el);
    if (!options.length) return;
    setQ('');
    setOpen({ el, title: titleOf(el), options, selected: el.selectedIndex });
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    /* A tap, not a scroll that started on a drop-down: remember where the
       finger went down and only take over if it lifted close by. Cancelling
       touchend stops the browser's own click, focus and picker. */
    const onStart = (e: TouchEvent) => {
      const el = mq.matches ? eligible(e.target) : null;
      touch.current = el ? { x: e.touches[0].clientX, y: e.touches[0].clientY, el } : null;
    };
    const onEnd = (e: TouchEvent) => {
      const t = touch.current;
      touch.current = null;
      if (!t || !mq.matches) return;
      const p = e.changedTouches[0];
      if (Math.abs(p.clientX - t.x) > 10 || Math.abs(p.clientY - t.y) > 10) return;
      if (e.cancelable) e.preventDefault();
      show(t.el);
    };
    /* Anything that still reaches the element as mouse events (a stylus, a
       trackpad on a tablet, an emulator): mousedown is cancelled so the system
       picker never opens, and ours opens on the click — once the button is
       back up. Opened on mousedown, the sheet appeared under a pointer that was
       still pressed: the release landed on whatever row or backdrop was now
       under it, and the walk's taps on "Sort by" read as covered. */
    const onMouse = (e: MouseEvent) => {
      if (!mq.matches) return;
      const el = eligible(e.target);
      if (!el) return;
      e.preventDefault();
      if (e.type === 'click' && !openRef.current) show(el);
    };
    const onFocus = (e: FocusEvent) => {
      if (!mq.matches || openRef.current) return;
      const el = eligible(e.target);
      // Keyboard users (a hardware keyboard on an iPad) keep the native control.
      if (!el || el.matches(':focus-visible')) return;
      el.blur();
      show(el);
    };
    document.addEventListener('touchstart', onStart, { capture: true, passive: true });
    document.addEventListener('touchend', onEnd, { capture: true, passive: false });
    document.addEventListener('mousedown', onMouse, true);
    document.addEventListener('click', onMouse, true);
    document.addEventListener('focusin', onFocus, true);
    return () => {
      document.removeEventListener('touchstart', onStart, true);
      document.removeEventListener('touchend', onEnd, true);
      document.removeEventListener('mousedown', onMouse, true);
      document.removeEventListener('click', onMouse, true);
      document.removeEventListener('focusin', onFocus, true);
    };
  }, [show]);


  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [open, close]);

  /* Scroll the chosen row into view when the sheet opens on a long list. */
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-selected]')?.scrollIntoView({ block: 'center' });
  }, [open]);

  const onSheetStart = (e: React.TouchEvent) => {
    const t = e.target as HTMLElement;
    const list = t.closest('.ms-list');
    if ((list && list.scrollTop > 0) || t.closest('input, button')) { drag.current = null; return; }
    drag.current = { y0: e.touches[0].clientY, t0: Date.now(), dy: 0, live: false };
  };
  const onSheetMove = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.touches[0].clientY - d.y0;
    if (dy <= 0) { if (d.live) { d.dy = 0; setDragY(0); } return; }
    if (!d.live && dy < 6) return;
    d.live = true; d.dy = dy; setDragging(true); setDragY(dy);
  };
  const onSheetEnd = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || !d.live) return;
    const speed = d.dy / Math.max(1, Date.now() - d.t0);
    if (d.dy > 110 || (d.dy > 40 && speed > 0.7)) close(); else setDragY(0);
  };

  const shown = useMemo(() => {
    if (!open) return [];
    const n = q.trim().toLowerCase();
    return n ? open.options.filter(o => o.label.toLowerCase().includes(n)) : open.options;
  }, [open, q]);

  if (!open || typeof document === 'undefined') return null;
  const searchable = open.options.length > 8;
  let lastGroup: string | null = null;

  return createPortal(
    <div className="ms-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ms-scrim" onClick={close} aria-hidden style={dragY ? { opacity: Math.max(0.15, 1 - dragY / 320) } : undefined} />
      <div
        className="ms-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={open.title}
        data-dragging={dragging ? 'true' : undefined}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        onTouchStart={onSheetStart}
        onTouchMove={onSheetMove}
        onTouchEnd={onSheetEnd}
        onTouchCancel={onSheetEnd}
      >
        <div className="ms-grab" aria-hidden />
        <div className="ms-head">
          <div className="ms-title">{open.title}</div>
          <button type="button" className="ms-x" onClick={close} aria-label="Close"><X size={18} weight="bold" /></button>
        </div>
        {searchable && (
          <label className="ms-search">
            <MagnifyingGlass size={16} weight="bold" aria-hidden />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" aria-label={`Search ${open.title}`} autoComplete="off" spellCheck={false} />
            {q && <button type="button" className="ms-x" onClick={() => setQ('')} aria-label="Clear search"><X size={15} weight="bold" /></button>}
          </label>
        )}
        <div className="ms-list" ref={listRef} role="listbox" aria-label={open.title}>
          {shown.length === 0 && <div className="ms-empty">Nothing matches &ldquo;{q.trim()}&rdquo;.</div>}
          {shown.map(o => {
            const head = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            const sel = o.index === open.selected;
            return (
              <React.Fragment key={o.index}>
                {head && <div className="ms-group">{head}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={sel}
                  disabled={o.disabled}
                  data-selected={sel ? 'true' : undefined}
                  className="ms-opt"
                  onClick={() => { commit(open.el, o.index); close(); }}
                >
                  {o.dot && <span className="ms-dot" style={{ background: o.dot }} aria-hidden />}
                  <span className="ms-label">{o.label || '—'}</span>
                  {sel && <Check size={17} weight="bold" className="ms-check" aria-hidden />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const CSS = `
.ms-root { position: fixed; inset: 0; z-index: 10200; /* above every modal (.k-overlay 10000) and overlay panel — a drop-down in a form opens on top of it */ }
.ms-scrim { position: absolute; inset: 0; background: rgba(0,0,0,0.6); transition: opacity .24s ease; }
.ms-sheet { position: absolute; left: 0; right: 0; bottom: 0; max-height: 82vh; max-height: 82dvh; display: flex; flex-direction: column;
  background: var(--c-raised); border: 1px solid var(--border-default); border-bottom: 0; border-radius: 22px 22px 0 0;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 -24px 60px -20px rgba(0,0,0,0.9); color: var(--c-text);
  padding-bottom: env(safe-area-inset-bottom, 0px); transition: transform .24s cubic-bezier(.2,.8,.2,1); touch-action: pan-y;
  font-family: inherit; animation: msUp .22s cubic-bezier(.2,.8,.2,1); }
.ms-sheet[data-dragging] { transition: none; }
@keyframes msUp { from { transform: translateY(40px); opacity: .6; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .ms-sheet, .ms-scrim { transition: none; animation: none; } }
.ms-grab { width: 40px; height: 5px; border-radius: 99px; background: rgba(255,255,255,0.22); margin: 10px auto 2px; flex-shrink: 0; }
.ms-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 10px 10px 18px; }
.ms-title { font-size: 17px; font-weight: 800; color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms-x { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex-shrink: 0; border: 0; border-radius: 12px; background: transparent; color: var(--c-text-2); cursor: pointer; }
.ms-search { display: flex; align-items: center; gap: 10px; margin: 0 12px 6px; padding: 0 4px 0 14px; min-height: 48px; border-radius: 14px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); color: var(--c-text-3); }
.ms-search input { flex: 1; min-width: 0; height: 44px; border: 0 !important; outline: none !important; box-shadow: none !important; background: transparent !important; color: var(--c-text) !important; -webkit-text-fill-color: var(--c-text) !important; font: inherit; font-size: 16px !important; font-weight: 600; }
.ms-list { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 4px 8px 12px; }
.ms-group { padding: 14px 12px 6px; font-size: 10.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--c-text-3); }
.ms-opt { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 54px; padding: 10px 12px; border: 0; border-radius: 12px; background: transparent;
  color: var(--c-text-2); font: inherit; font-size: 16px; font-weight: 650; text-align: left; cursor: pointer; }
.ms-opt:active { background: rgba(255,224,0,0.08); }
.ms-opt[data-selected] { background: rgba(255,224,0,0.08); color: var(--c-text); font-weight: 800; }
.ms-opt:disabled { color: var(--c-text-4); cursor: not-allowed; }
.ms-dot { width: 10px; height: 10px; border-radius: 999px; flex-shrink: 0; }
.ms-label { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.ms-check { color: var(--c-yellow); flex-shrink: 0; }
.ms-empty { padding: 18px 12px; font-size: 14.5px; color: var(--c-text-2); }
`;
