'use client';

/**
 * Phone list tools — one row, one sheet.
 *
 * On a phone a list screen used to stack a search box, two filter selects, a
 * count, a second count, six tool buttons and a Sort row before the first
 * record. Procore shows the list. Here the phone gets ONE row — search plus a
 * single "Filter" button (with a dot counting what is on) — and everything
 * else lives in a bottom sheet behind that button: the page's own filters
 * (status, person…), then the table's Sort, Group, Views, Filter-by-column,
 * Fields, Select and Export.
 *
 * The page's toolbar (kit `Toolbar`, `ListToolbar`) and the list (kit
 * `DataTable`) are siblings, so they meet through this hub: `PageShell` and
 * `PremiumSurface` provide it; the toolbar registers and opens a slot in its
 * sheet; when the screen has exactly one toolbar and one table, the table
 * renders its tools into that slot instead of drawing its own row. Any other
 * arrangement (a table on its own, two lists on one screen) keeps each list's
 * tools with that list — still one row and one sheet each.
 *
 * Desktop is unchanged: the toolbar and the table bar draw inline.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, X } from '@phosphor-icons/react';

const PHONE_QUERY = '(max-width: 767px)';

/** True on a phone-width screen. False on the server and the first render
 *  (the phone CSS hides desktop-only rows until this flips, so nothing flashes). */
export function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return phone;
}

type Hub = {
  /** Exactly one toolbar and one table on the screen: the table's tools go in the toolbar's sheet. */
  paired: boolean;
  addToolbar: () => () => void;
  addTable: () => () => void;
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
  /** How many of the table's own filters are on (for the toolbar's dot). */
  tableActive: number;
  setTableActive: (n: number) => void;
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
};

const HubContext = React.createContext<Hub | null>(null);

export function ListHubProvider({ children }: { children: React.ReactNode }) {
  const [toolbars, setToolbars] = React.useState(0);
  const [tables, setTables] = React.useState(0);
  const [slot, setSlot] = React.useState<HTMLElement | null>(null);
  const [tableActive, setTableActive] = React.useState(0);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const addToolbar = React.useCallback(() => { setToolbars((n) => n + 1); return () => setToolbars((n) => n - 1); }, []);
  const addTable = React.useCallback(() => { setTables((n) => n + 1); return () => setTables((n) => n - 1); }, []);
  const value = React.useMemo<Hub>(() => ({
    paired: toolbars === 1 && tables === 1,
    addToolbar, addTable, slot, setSlot, tableActive, setTableActive, sheetOpen, setSheetOpen,
  }), [toolbars, tables, addToolbar, addTable, slot, tableActive, sheetOpen]);
  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}

export function useListHub(): Hub | null {
  return React.useContext(HubContext);
}

/** The one tools button on a phone list row: an icon, and a dot with the count of filters that are on. */
export function ToolsButton({ active, open, onClick, label = 'Filter and sort' }: { active: number; open: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      className="k-tools-btn"
      aria-label={active ? `${label} — ${active} on` : label}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onClick}
    >
      <SlidersHorizontal size={18} weight="bold" aria-hidden />
      {active > 0 && <span className="k-tools-dot" aria-hidden>{active}</span>}
    </button>
  );
}

/** The bottom sheet behind the tools button. It stays mounted while closed
 *  (hidden) so a table can keep its tools in it and a filter keeps its state. */
export function ListSheet({ open, onClose, title = 'Filter and sort', children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // The list behind the sheet holds still while the sheet is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    // Search, sort and filter tools: never unsaved work, so closing the sheet never asks.
    <div className="k-lsheet-root" data-open={open ? 'true' : undefined} hidden={!open} data-no-guard>
      <div className="k-lsheet-back" onClick={onClose} aria-hidden />
      <div className="k-lsheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="k-lsheet-head">
          <span className="k-dialog-title">{title}</span>
          <button type="button" className="k-lsheet-x" aria-label="Close" onClick={onClose}><X size={16} weight="bold" /></button>
        </div>
        <div className="k-lsheet-body">{children}</div>
        <div className="k-lsheet-foot">
          <button type="button" className="k-btn k-btn-primary" onClick={onClose}>Show results</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** How many filter selects inside `el` are set away from their first option ("All …"). */
export function countSetSelects(el: HTMLElement | null): number {
  if (!el) return 0;
  let n = 0;
  el.querySelectorAll('select').forEach((s) => { if (s.selectedIndex > 0) n += 1; });
  el.querySelectorAll('input[type="search"], input[type="number"], input[type="date"]').forEach((i) => { if ((i as HTMLInputElement).value) n += 1; });
  return n;
}

/**
 * A sideways-scrolling strip (tabs, figures) fades its right edge only while
 * there is more to swipe to, so the last item is never cut off for no reason.
 * Sets data-more="right|left|both" on the element.
 */
export function useScrollFade<T extends HTMLElement>(): React.RefCallback<T> {
  const cleanup = React.useRef<(() => void) | null>(null);
  return React.useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const left = el.scrollLeft > 1;
      const right = max - el.scrollLeft > 1;
      const v = left && right ? 'both' : right ? 'right' : left ? 'left' : '';
      if (v) el.setAttribute('data-more', v); else el.removeAttribute('data-more');
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    window.addEventListener('resize', update);
    cleanup.current = () => { el.removeEventListener('scroll', update); ro?.disconnect(); window.removeEventListener('resize', update); };
  }, []);
}
