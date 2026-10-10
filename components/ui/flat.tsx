'use client';

/**
 * Flat UI — the app's list-first look (Chad approved it on 2026-10-10).
 *
 * Content sits on the page in full-width rows with hairline dividers, small
 * grey section labels and one action per row. No trays, no fat cards, no glow,
 * no billboard numbers: a phone shows three times as much, the way Procore's
 * open items and JobTread's lists do.
 *
 *   <FlatStyles />                         once per page (idempotent)
 *   <Brief action={…}>one line…</Brief>    Sage's one-line read of the data
 *   <NumberStrip items={[…]} />            3–4 figures in one thin row
 *   <SectionLabel action={…}>Bidding</SectionLabel>
 *   <FlatList>
 *     <Row dot="amber" title="…" meta="…" right="10d" rightSub="Oct 20" href="…" />
 *     <SwipeRow actions={[…]}><Row … /></SwipeRow>
 *   </FlatList>
 *   <Tabs value options onChange />        switches in place — never scrolls the page
 *   <ToolRow icon label value warn href /> a job's tools, Procore-style
 *   <RowSkeleton rows={6} />               instead of a blank screen while loading
 *
 * Colours are the theme's variables only (no hex), tap targets are 44px, and
 * nothing here scrolls the page.
 */

import React, { useRef, useState } from 'react';
import Link from 'next/link';

const CSS = `
:root{--fl-line:var(--border-default);--fl-line-strong:var(--border-strong);--fl-text:var(--text-primary);--fl-text-2:var(--text-secondary);--fl-text-3:var(--text-tertiary);--fl-surface:var(--surface-card);--fl-neutral:var(--c-gray)}
.sgUi{--fl-line:var(--sg-border);--fl-line-strong:var(--sg-border-strong);--fl-text:var(--sg-text);--fl-text-2:var(--sg-text-2);--fl-text-3:var(--sg-text-3);--fl-surface:var(--sg-surface-solid)}
.fl-brief{margin:8px 16px 12px;padding:2px 0 2px 12px;border-left:2px solid var(--brand-primary);font-size:14.5px;line-height:1.45;color:var(--fl-text)}
.fl-brief b{font-weight:700}
.fl-brief .fl-brief-act{color:var(--brand-primary);font-weight:650;white-space:nowrap;background:none;border:0;padding:0;font:inherit;cursor:pointer;text-decoration:none}
.fl-strip{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;border-top:1px solid var(--fl-line);border-bottom:1px solid var(--fl-line)}
.fl-strip>div{padding:10px 8px 10px 16px;border-right:1px solid var(--fl-line);min-width:0}
.fl-strip>div:last-child{border-right:0}
.fl-strip b{display:block;font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--fl-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fl-strip span{display:block;font-size:11px;color:var(--fl-text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fl-strip [data-tone=bad] b{color:var(--danger)}
.fl-strip [data-tone=warn] b{color:var(--warning)}
.fl-strip [data-tone=good] b{color:var(--success)}
.fl-sec.fl-sec{margin:0;line-height:1.2;-webkit-text-fill-color:currentColor;display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:18px 16px 6px;font-size:11.5px;font-weight:700;letter-spacing:.8px;color:var(--fl-text-3);text-transform:uppercase}
.fl-sec .fl-sec-act{position:relative;color:var(--brand-primary);-webkit-text-fill-color:currentColor;font-weight:600;letter-spacing:0;text-transform:none;font-size:13px;text-decoration:none;background:none;border:0;padding:0;cursor:pointer}
.fl-sec .fl-sec-act::after{content:'';position:absolute;inset:-14px -10px}
.fl-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--fl-line)}
.fl-list>li{border-bottom:1px solid var(--fl-line)}
.fl-row{display:flex;align-items:center;gap:12px;padding:10px 16px;min-height:58px;color:var(--fl-text);text-decoration:none;background:var(--bg-base,transparent);-webkit-tap-highlight-color:transparent}
a.fl-row:active,button.fl-row:active{background:var(--fl-line)}
button.fl-row{width:100%;border:0;font:inherit;text-align:left;cursor:pointer}
.fl-dot{width:8px;height:8px;border-radius:4px;flex:none}
.fl-dot[data-c=red]{background:var(--danger)} .fl-dot[data-c=amber]{background:var(--warning)} .fl-dot[data-c=green]{background:var(--success)} .fl-dot[data-c=blue]{background:var(--fl-neutral)} .fl-dot[data-c=gold]{background:var(--brand-primary)} .fl-dot[data-c=grey]{background:var(--fl-text-3)}
.fl-m{flex:1;min-width:0}
.fl-t{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fl-s{font-size:12.5px;color:var(--fl-text-2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fl-s b{font-weight:500;color:var(--fl-text)}
.fl-r{font-size:13px;color:var(--fl-text-2);text-align:right;flex:none;font-variant-numeric:tabular-nums}
.fl-r b{display:block;color:var(--fl-text);font-size:15px;font-weight:650}
.fl-bar{height:3px;background:var(--fl-line);border-radius:2px;margin-top:6px;overflow:hidden}
.fl-bar i{display:block;height:100%;background:var(--brand-primary)}
.fl-chev{color:var(--fl-text-3);font-size:18px;flex:none;line-height:1}
.fl-act{position:relative;box-sizing:border-box;flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:0 12px;border-radius:8px;font-size:13px;font-weight:650;white-space:nowrap;cursor:pointer;border:1px solid transparent;font-family:inherit}
.fl-act::after{content:'';position:absolute;inset:-5px -2px}
.fl-act[data-k=primary]{background:var(--brand-primary);color:var(--bg-base)}
.fl-act[data-k=ghost]{background:none;color:var(--brand-primary);border-color:var(--fl-line-strong)}
.fl-act[disabled]{opacity:.55;cursor:default}
.fl-tabs{display:flex;margin:10px 16px 4px;background:var(--fl-surface);border:1px solid var(--fl-line);border-radius:10px;padding:2px}
.fl-tabs button{flex:1;min-height:36px;border:0;background:none;font:inherit;font-size:13.5px;font-weight:600;color:var(--fl-text-2);border-radius:8px;cursor:pointer;white-space:nowrap}
.fl-tabs button[aria-selected=true]{background:var(--fl-line);color:var(--fl-text)}
@media (pointer:coarse){.fl-tabs button{min-height:44px}}
.fl-tool{display:flex;align-items:center;gap:14px;padding:0 16px;min-height:52px;color:var(--fl-text);text-decoration:none;-webkit-tap-highlight-color:transparent}
a.fl-tool:active{background:var(--fl-line)}
.fl-tool .fl-ti{width:28px;height:28px;border-radius:7px;display:grid;place-items:center;flex:none;color:var(--brand-primary);background:var(--fl-surface);border:1px solid var(--fl-line)}
.fl-tool .fl-tn{flex:1;min-width:0;font-size:15.5px;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fl-tool .fl-tc{font-size:13px;color:var(--fl-text-2);white-space:nowrap}
.fl-tool .fl-tc[data-warn=true]{color:var(--warning)}
.fl-swipe{position:relative;overflow:hidden;touch-action:pan-y}
.fl-swipe-acts{position:absolute;top:0;right:0;bottom:0;display:flex}
.fl-swipe-acts button{width:78px;border:0;font:inherit;font-size:13px;font-weight:700;cursor:pointer;color:var(--fl-text);background:var(--fl-line)}
.fl-swipe-acts button[data-k=primary]{background:var(--brand-primary);color:var(--bg-base)}
.fl-swipe-acts button[data-k=good]{background:var(--success);color:var(--bg-base)}
.fl-swipe-body{position:relative;background:var(--bg-base,transparent);transition:transform .2s cubic-bezier(.2,.7,.3,1)}
.fl-swipe-body[data-drag=true]{transition:none}
.fl-skel{display:flex;align-items:center;gap:12px;padding:12px 16px;min-height:58px;border-bottom:1px solid var(--fl-line)}
.fl-skel i{display:block;height:10px;border-radius:5px;background:var(--fl-line);animation:fl-pulse 1.2s ease-in-out infinite}
@keyframes fl-pulse{50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.fl-skel i{animation:none}.fl-swipe-body{transition:none}}
.fl-empty{padding:14px 16px;font-size:13.5px;color:var(--fl-text-2)}
`;

/** The flat stylesheet. Render once per page; extra copies are harmless. */
export function FlatStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

export type DotColor = 'red' | 'amber' | 'green' | 'blue' | 'gold' | 'grey';

export function Dot({ c }: { c: DotColor }) {
  return <span className="fl-dot" data-c={c} aria-hidden="true" />;
}

/** Sage's one-line read of the data, with at most one action. */
export function Brief({ children, action }: { children: React.ReactNode; action?: { label: string; href?: string; onClick?: () => void } }) {
  return (
    <p className="fl-brief">
      {children}{' '}
      {action && (action.href
        ? <Link className="fl-brief-act" href={action.href}>{action.label} ›</Link>
        : <button type="button" className="fl-brief-act" onClick={action.onClick}>{action.label} ›</button>)}
    </p>
  );
}

export type StripItem = { value: React.ReactNode; label: React.ReactNode; tone?: 'bad' | 'warn' | 'good' };

/** 3–4 figures in one thin row. */
export function NumberStrip({ items }: { items: StripItem[] }) {
  return (
    <div className="fl-strip">
      {items.map((it, i) => (
        <div key={i} data-tone={it.tone}><b>{it.value}</b><span>{it.label}</span></div>
      ))}
    </div>
  );
}

/** A small grey section label, with an optional link on the right. */
export function SectionLabel({ children, action, id }: { children: React.ReactNode; action?: { label: string; href?: string; onClick?: () => void }; id?: string }) {
  return (
    <h2 className="fl-sec" id={id}>
      <span>{children}</span>
      {action && (action.href
        ? <Link className="fl-sec-act" href={action.href}>{action.label}</Link>
        : <button type="button" className="fl-sec-act" onClick={action.onClick}>{action.label}</button>)}
    </h2>
  );
}

export function FlatList({ children, label }: { children: React.ReactNode; label?: string }) {
  return <ul className="fl-list" aria-label={label}>{children}</ul>;
}

/** A row's one action. `primary` is gold-filled, `ghost` is outlined. 44px tap area. */
export function RowAction({ children, kind = 'ghost', onClick, disabled, busy, href, label }: {
  children: React.ReactNode; kind?: 'primary' | 'ghost'; onClick?: () => void; disabled?: boolean; busy?: boolean; href?: string; label?: string;
}) {
  if (href) return <Link className="fl-act" data-k={kind} href={href} aria-label={label}>{children}</Link>;
  return (
    <button type="button" className="fl-act" data-k={kind} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); }} disabled={disabled || busy} aria-busy={busy || undefined} aria-label={label}>
      {children}
    </button>
  );
}

export type RowProps = {
  title: React.ReactNode;
  meta?: React.ReactNode;
  dot?: DotColor;
  /** Right column: a bold value over a small line (e.g. "10d" over "Oct 20"). */
  right?: React.ReactNode;
  rightSub?: React.ReactNode;
  /** One action button (use <RowAction>). Shown instead of the chevron. */
  action?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  /** 0–100: a thin progress bar under the meta line. */
  bar?: number | null;
  chevron?: boolean;
};

/** A list row: dot · title over meta · right value or one action. Wrap in <li>. */
export function Row({ title, meta, dot, right, rightSub, action, href, onClick, bar, chevron }: RowProps) {
  const body = (
    <>
      {dot && <Dot c={dot} />}
      <span className="fl-m">
        <span className="fl-t" style={{ display: 'block' }}>{title}</span>
        {meta != null && <span className="fl-s" style={{ display: 'block' }}>{meta}</span>}
        {bar != null && <span className="fl-bar" style={{ display: 'block' }}><i style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} /></span>}
      </span>
      {(right != null || rightSub != null) && <span className="fl-r">{right != null && <b>{right}</b>}{rightSub}</span>}
      {action}
      {!action && (chevron ?? !!(href || onClick)) && <span className="fl-chev" aria-hidden="true">›</span>}
    </>
  );
  if (href) return <Link className="fl-row" href={href}>{body}</Link>;
  if (onClick) return <button type="button" className="fl-row" onClick={onClick}>{body}</button>;
  return <div className="fl-row">{body}</div>;
}

export type SwipeAction = { label: string; kind?: 'primary' | 'good' | 'plain'; onAct: () => void };

/**
 * Swipe a row left to reveal its actions (iPhone pattern). A tap on an action
 * runs it and closes the row; a tap elsewhere closes it. Mouse users get the
 * same actions as buttons on the row itself, so nothing is swipe-only.
 */
export function SwipeRow({ actions, children }: { actions: SwipeAction[]; children: React.ReactNode }) {
  const width = actions.length * 78;
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; locked: boolean | null } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    start.current = { x: e.clientX, y: e.clientY, base: x, locked: null };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s.locked = Math.abs(dx) > Math.abs(dy);
    if (!s.locked) return;
    setDrag(true);
    setX(Math.max(-width, Math.min(0, s.base + dx)));
  };
  const onUp = () => {
    const s = start.current;
    start.current = null;
    if (!s?.locked) return;
    setDrag(false);
    setX((cur) => (cur < -width / 2 ? -width : 0));
  };

  return (
    <div className="fl-swipe">
      <div className="fl-swipe-acts" aria-hidden={x === 0 || undefined}>
        {actions.map((a) => (
          <button key={a.label} type="button" data-k={a.kind || 'plain'} tabIndex={x === 0 ? -1 : 0} onClick={() => { setX(0); a.onAct(); }}>{a.label}</button>
        ))}
      </div>
      <div
        className="fl-swipe-body"
        data-drag={drag || undefined}
        style={{ transform: `translateX(${x}px)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClickCapture={(e) => { if (x !== 0) { e.preventDefault(); e.stopPropagation(); setX(0); } }}
      >
        {children}
      </div>
    </div>
  );
}

export type TabOption<K extends string> = { key: K; label: string; count?: number };

/** Segmented tabs that switch content in place. Never scrolls the page. */
export function Tabs<K extends string>({ value, options, onChange, label }: { value: K; options: TabOption<K>[]; onChange: (k: K) => void; label: string }) {
  return (
    <div className="fl-tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" role="tab" aria-selected={o.key === value} onClick={() => o.key !== value && onChange(o.key)}>
          {o.label}{o.count != null ? ` · ${o.count}` : ''}
        </button>
      ))}
    </div>
  );
}

/** One of a job's tools: icon · name · count or state · chevron. */
export function ToolRow({ icon, label, value, warn, href }: { icon: React.ReactNode; label: string; value?: React.ReactNode; warn?: boolean; href: string }) {
  return (
    <Link className="fl-tool" href={href}>
      <span className="fl-ti" aria-hidden="true">{icon}</span>
      <span className="fl-tn">{label}</span>
      {value != null && <span className="fl-tc" data-warn={warn || undefined}>{value}</span>}
      <span className="fl-chev" aria-hidden="true">›</span>
    </Link>
  );
}

/** Rows that stand in for a list while it loads — never a blank screen. */
export function RowSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div className="fl-skel" key={i}>
          <span className="fl-m"><i style={{ width: `${55 + ((i * 17) % 35)}%` }} /><i style={{ width: `${30 + ((i * 23) % 30)}%`, marginTop: 8, height: 8 }} /></span>
        </div>
      ))}
    </div>
  );
}

export function FlatEmpty({ children }: { children: React.ReactNode }) {
  return <p className="fl-empty">{children}</p>;
}
