'use client';
import React from 'react';
import { createPortal } from 'react-dom';

/* ─────────────────────────────────────────────────────────────────────
   SaguaroDatePicker — custom dark-material calendar popover.
   Public API unchanged: { value: ISO 'YYYY-MM-DD', onChange, style, placeholder }.
   Popover is portaled to document.body with position:fixed +
   getBoundingClientRect anchoring so parent transforms / overflow /
   stacking contexts can never clip it. All dates parsed/formatted in
   LOCAL time (never UTC-shifted).
   ──────────────────────────────────────────────────────────────────── */

const FIELD_BG = 'var(--surface-raised)';
const SURFACE = '#101011';
const BORDER = 'var(--border-default)';
const TEXT = 'var(--text-primary)';
const TEXT_DIM = 'rgba(255,255,255,0.55)';
const TEXT_FAINT = 'rgba(255,255,255,0.30)';
const GOLD = 'var(--gold)';
const GOLD_SOFT = 'var(--gold-soft)';
const GOLD_RING = 'var(--gold-ring)';
const POP_W = 292;
const POP_H_EST = 384;
const Z_POP = 100000;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const DEFAULT_INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: FIELD_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 'var(--radius-sm)',
  color: TEXT,
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
};

const NAV_BTN: React.CSSProperties = {
  width: 26,
  height: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  padding: 0,
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 7,
  color: 'rgba(255,255,255,0.65)',
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
};

const POP_CSS = `
.sgdp-nav:hover { background: rgba(255,255,255,0.10); color: #FFFFFF; }
.sgdp-day:hover { background: rgba(255,255,255,0.10); }
.sgdp-day[data-sel="true"]:hover { background: var(--gold); }
.sgdp-yr:hover { background: rgba(255,255,255,0.10); }
.sgdp-yr[data-active="true"]:hover { background: var(--gold); }
.sgdp-today:hover { background: var(--gold-soft); }
.sgdp-scroll::-webkit-scrollbar { width: 8px; }
.sgdp-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
`;

interface SaguaroDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
  placeholder?: string;
}

/* Local-time ISO parsing — a YYYY-MM-DD is a calendar date, never UTC-shift it. */
function parseISOString(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISOString(d: Date | null): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplay(iso: string): string {
  const d = parseISOString(iso);
  if (!d) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}/${day}/${d.getFullYear()}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function SaguaroDatePicker({ value, onChange, style, placeholder }: SaguaroDatePickerProps) {
  const selected = parseISOString(value);
  const today = new Date();
  const inputStyle = { ...DEFAULT_INPUT_STYLE, ...style };

  const inputRef = React.useRef<HTMLInputElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  const yearPanelRef = React.useRef<HTMLDivElement>(null);
  const suppressOpen = React.useRef(false);

  const [open, setOpen] = React.useState(false);
  const [yearOpen, setYearOpen] = React.useState(false);
  const [viewYear, setViewYear] = React.useState(() => (selected ?? today).getFullYear());
  const [viewMonth, setViewMonth] = React.useState(() => (selected ?? today).getMonth());
  const [pos, setPos] = React.useState({ top: 0, left: 0 });

  /* Anchor with getBoundingClientRect + position:fixed (portal escapes
     parent transforms; fixed keeps it out of every overflow clip). */
  const updatePosition = React.useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const popH = popRef.current ? popRef.current.getBoundingClientRect().height : POP_H_EST;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(r.left, vw - POP_W - 8));
    let top = r.bottom + 6;
    if (top + popH > vh - 8 && r.top - popH - 6 >= 8) top = r.top - popH - 6; // flip above when cramped
    setPos({ top, left });
  }, []);

  const openPopover = () => {
    if (suppressOpen.current || open) return;
    const sel = parseISOString(value) ?? new Date();
    setViewYear(sel.getFullYear());
    setViewMonth(sel.getMonth());
    setYearOpen(false);
    setOpen(true);
  };

  const focusInputSilently = () => {
    suppressOpen.current = true;
    inputRef.current?.focus();
    window.setTimeout(() => { suppressOpen.current = false; }, 0);
  };

  const pick = (d: Date) => {
    onChange(toISOString(d));
    setOpen(false);
    focusInputSilently();
  };

  const moveMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  /* Position on open; re-anchor on any scroll (capture) or resize. */
  React.useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onMove = () => updatePosition();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, updatePosition]);

  /* Outside click closes; Escape closes year panel first, then popover.
     Escape uses capture + stopPropagation so a host modal doesn't also close. */
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (inputRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (yearOpen) {
        setYearOpen(false);
      } else {
        setOpen(false);
        focusInputSilently();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, yearOpen]);

  /* Rolling year list: auto-center the active year when the panel opens. */
  React.useEffect(() => {
    if (!yearOpen) return;
    const panel = yearPanelRef.current;
    if (!panel) return;
    const btn = panel.querySelector<HTMLButtonElement>('[data-active="true"]');
    if (btn) panel.scrollTop = btn.offsetTop - panel.clientHeight / 2 + btn.offsetHeight / 2;
  }, [yearOpen]);

  /* Rolling range: current year ±60, stretched to always include the view year. */
  const nowYear = today.getFullYear();
  const yearFrom = Math.min(nowYear - 60, viewYear);
  const yearTo = Math.max(nowYear + 60, viewYear);
  const years: number[] = [];
  for (let y = yearFrom; y <= yearTo; y++) years.push(y);

  const firstOffset = new Date(viewYear, viewMonth, 1).getDay();
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(new Date(viewYear, viewMonth, 1 - firstOffset + i));

  return (
    <>
      <input
        ref={inputRef}
        value={formatDisplay(value)}
        placeholder={placeholder ?? 'MM/DD/YYYY'}
        style={inputStyle}
        readOnly
        onClick={openPopover}
        onFocus={openPopover}
        onKeyDown={(e) => {
          if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
            e.preventDefault();
            openPopover();
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      />
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="Choose date"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: POP_W,
            zIndex: Z_POP,
            background: SURFACE,
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 12,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 18px 48px rgba(255,255,255,0.07)',
            padding: 12,
            color: TEXT,
            fontSize: 13,
            userSelect: 'none',
          }}
        >
          <style dangerouslySetInnerHTML={{ __html: POP_CSS }} />

          {/* Header: « ‹ [Month ▾ select] [Year ▾ roller] › » */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <button type="button" className="sgdp-nav" aria-label="Previous year" onClick={() => setViewYear(y => y - 1)} style={NAV_BTN}>«</button>
            <button type="button" className="sgdp-nav" aria-label="Previous month" onClick={() => moveMonth(-1)} style={NAV_BTN}>‹</button>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <select
                aria-label="Month"
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value) || 0)}
                style={{
                  background: FIELD_BG,
                  color: TEXT,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 7,
                  fontSize: 12.5,
                  fontWeight: 600,
                  padding: '3px 6px',
                  cursor: 'pointer',
                  outline: 'none',
                  maxWidth: 118,
                }}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i} style={{ background: SURFACE, color: TEXT }}>{m}</option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Choose year"
                aria-expanded={yearOpen}
                onClick={() => setYearOpen(o => !o)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: FIELD_BG,
                  color: yearOpen ? GOLD : TEXT,
                  border: `1px solid ${yearOpen ? GOLD_RING : BORDER}`,
                  borderRadius: 7,
                  fontSize: 12.5,
                  fontWeight: 600,
                  padding: '3px 10px',
                  cursor: 'pointer',
                }}
              >
                {viewYear} <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
              </button>
            </div>
            <button type="button" className="sgdp-nav" aria-label="Next month" onClick={() => moveMonth(1)} style={NAV_BTN}>›</button>
            <button type="button" className="sgdp-nav" aria-label="Next year" onClick={() => setViewYear(y => y + 1)} style={NAV_BTN}>»</button>
          </div>

          {yearOpen ? (
            /* Rolling year selector — scrollable, auto-centered on the active year */
            <div
              ref={yearPanelRef}
              className="sgdp-scroll"
              style={{
                position: 'relative',
                height: 254,
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 4,
                alignContent: 'start',
                paddingRight: 2,
              }}
            >
              {years.map(y => {
                const active = y === viewYear;
                const isNow = y === nowYear;
                return (
                  <button
                    key={y}
                    type="button"
                    className="sgdp-yr"
                    data-active={active ? 'true' : 'false'}
                    onClick={() => { setViewYear(y); setYearOpen(false); }}
                    style={{
                      padding: '7px 0',
                      borderRadius: 8,
                      fontSize: 12.5,
                      cursor: 'pointer',
                      background: active ? GOLD : 'transparent',
                      color: active ? SURFACE : isNow ? GOLD : 'rgba(255,255,255,0.78)',
                      border: `1px solid ${isNow && !active ? GOLD_RING : 'transparent'}`,
                      fontWeight: active ? 700 : 500,
                    }}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              {/* Weekday headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
                {WEEKDAYS.map(w => (
                  <div key={w} style={{ textAlign: 'center', fontSize: 10.5, letterSpacing: 0.4, color: TEXT_FAINT, fontWeight: 600, padding: '4px 0' }}>{w}</div>
                ))}
              </div>
              {/* Day grid — 6 fixed weeks, adjacent-month days dimmed but pickable */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {cells.map((d, i) => {
                  const inMonth = d.getMonth() === viewMonth;
                  const isSel = !!selected && sameDay(d, selected);
                  const isToday = sameDay(d, today);
                  return (
                    <button
                      key={i}
                      type="button"
                      className="sgdp-day"
                      data-sel={isSel ? 'true' : 'false'}
                      onClick={() => pick(d)}
                      aria-label={d.toDateString()}
                      style={{
                        height: 32,
                        borderRadius: 8,
                        fontSize: 12.5,
                        cursor: 'pointer',
                        background: isSel ? GOLD : 'transparent',
                        color: isSel ? SURFACE : isToday ? GOLD : inMonth ? 'rgba(255,255,255,0.85)' : TEXT_FAINT,
                        border: `1px solid ${isToday && !isSel ? GOLD_RING : 'transparent'}`,
                        fontWeight: isSel ? 700 : isToday ? 600 : 400,
                        padding: 0,
                      }}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Footer: readout + Today shortcut */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 11, color: TEXT_DIM }}>{selected ? formatDisplay(value) : 'No date selected'}</span>
            <button
              type="button"
              className="sgdp-today"
              onClick={() => pick(new Date())}
              style={{
                padding: '5px 12px',
                borderRadius: 8,
                border: `1px solid ${GOLD_RING}`,
                background: 'transparent',
                color: GOLD,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Today
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
