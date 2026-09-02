'use client';

/**
 * <Suggest> — a text field with suggestions, in our own colours.
 *
 * Replaces `<input list="x">` + `<datalist id="x">`. The native datalist popup
 * is drawn by the browser, not the page: it ignores `color-scheme: dark`, it
 * ignores every stylesheet, and on Windows Chrome it renders as a white box
 * with black text hanging off a dark form. Twenty-three of them across the app,
 * every one of them looking like a bug.
 *
 * Behaves the way the datalist did — free text is still allowed, the list is
 * only a shortcut — plus the things the native one never gave us: keyboard
 * navigation, a highlighted match, and a panel that belongs to the page.
 *
 *   <Suggest value={v} onChange={setV} options={ROLES} placeholder="Role" style={INP} />
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

const GOLD = '#F59E0B';
const PANEL = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';

export interface SuggestProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'list'> {
  value: string;
  /**
   * The native input signature, deliberately.
   *
   * Every one of the twenty-three call sites already has a handler written
   * against an event — `e => setX(e.target.value)`, and plenty that do more
   * than that. Keeping the signature makes this a drop-in: the tag name
   * changes and `list=` becomes `options=`, and nothing else moves. Picking
   * from the list calls the same handler with an event-shaped object.
   */
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  options: readonly string[];
  /** Show the whole list on focus even before typing. Matches datalist. */
  openOnFocus?: boolean;
}

export default function Suggest({
  value,
  onChange,
  options,
  openOnFocus = true,
  style,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: SuggestProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const seen = new Set<string>();
    const uniq = options.filter((o) => {
      const k = o.toLowerCase();
      if (!o || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (!q) return uniq.slice(0, 50);
    /* Prefix matches first — typing "Own" should put "Owner request" on top. */
    const starts = uniq.filter((o) => o.toLowerCase().startsWith(q));
    const contains = uniq.filter((o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, 50);
  }, [options, value]);

  /* Click anywhere else closes it. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const pick = (v: string) => {
    /* Drive the real input and let React's own change event fire, so the
       caller's handler runs exactly as it would have from typing — including
       handlers that do more than set state. Falls back to an event-shaped
       object if the native setter is unavailable. */
    const el = inputRef.current;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (el && setter) {
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      onChange({ target: { value: v } } as unknown as React.ChangeEvent<HTMLInputElement>);
    }
    setOpen(false);
    setActive(-1);
  };

  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(0); return; }
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && matches[active]) {
        e.preventDefault();
        pick(matches[active]);
      }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false); setActive(-1); }
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        {...rest}
        ref={inputRef}
        value={value}
        onChange={(e) => { onChange(e); setOpen(true); setActive(-1); }}
        onFocus={(e) => { if (openOnFocus) setOpen(true); onFocus?.(e); }}
        onBlur={onBlur}
        onKeyDown={keys}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        style={style}
      />

      {open && matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: 'absolute', zIndex: 60, top: 'calc(100% + 4px)', left: 0, right: 0,
            margin: 0, padding: 4, listStyle: 'none',
            maxHeight: 260, overflowY: 'auto',
            background: PANEL,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            boxShadow: '0 18px 40px -16px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {matches.map((o, i) => (
            <li
              key={o}
              role="option"
              aria-selected={i === active}
              /* mousedown, not click: the input's blur would close the panel
                 before a click ever landed. */
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: '8px 10px',
                borderRadius: 7,
                cursor: 'pointer',
                fontSize: 13.5,
                color: i === active ? '#241500' : TEXT,
                background: i === active ? GOLD : 'transparent',
              }}
            >
              {o}
            </li>
          ))}
        </ul>
      )}

      {open && matches.length === 0 && value.trim() !== '' && (
        <div
          style={{
            position: 'absolute', zIndex: 60, top: 'calc(100% + 4px)', left: 0, right: 0,
            background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10,
            padding: '9px 11px', fontSize: 12.5, color: DIM,
          }}
        >
          No match — what you typed will be used as-is.
        </div>
      )}
    </div>
  );
}
