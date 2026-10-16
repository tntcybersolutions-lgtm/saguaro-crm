'use client';

/**
 * Flat UI — the app's list-first look (Chad approved it on 2026-10-10).
 *
 * Content sits on the page in full-width rows with hairline dividers, lit
 * section headings and one action per row. No trays, no fat cards, no glow,
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
import { CheckCircle, Circle, Clock, Info, Sparkle, Star, WarningCircle } from '@phosphor-icons/react';

const CSS = `
:root{--fl-line:var(--border-default);--fl-line-strong:var(--border-strong);--fl-text:var(--text-primary);--fl-text-2:var(--text-secondary);--fl-text-3:var(--text-tertiary);--fl-surface:var(--surface-card);--fl-neutral:var(--c-gray)}
.sgUi{--fl-line:var(--sg-border);--fl-line-strong:var(--sg-border-strong);--fl-text:var(--sg-text);--fl-text-2:var(--sg-text-2);--fl-text-3:var(--sg-text-3);--fl-surface:var(--sg-surface-solid)}
/* Sage's read of the data, as the concept's alert card: a status circle, the
   sentence, and its one action as the screen's yellow button. */
.fl-brief{display:flex;align-items:flex-start;gap:12px;margin:8px 0 12px;padding:4px 0 4px 14px;border-radius:0;background:none;border:0;border-left:3px solid var(--border-strong);box-shadow:none;color:var(--fl-text)}
.fl-brief[data-tone=warning]{border-left-color:var(--warning)}.fl-brief[data-tone=danger]{border-left-color:var(--danger)}.fl-brief[data-tone=success]{border-left-color:var(--success)}
.fl-brief-ic{flex:none;display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--info-bg);border:1px solid var(--info-border);color:var(--info-fg)}
.fl-brief[data-tone=warning] .fl-brief-ic{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-fg)}
.fl-brief[data-tone=danger] .fl-brief-ic{background:var(--danger-bg);border-color:var(--danger-border);color:var(--danger-fg)}
.fl-brief[data-tone=success] .fl-brief-ic{background:var(--success-bg);border-color:var(--success-border);color:var(--success-fg)}
.fl-brief-body{flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding-top:6px}
.fl-brief-text{margin:0;font-size:15px;line-height:1.45;color:var(--fl-text)}
.fl-brief b{font-weight:700}
.fl-brief .fl-brief-act{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 18px;border-radius:10px;border:0;background:var(--action-primary-bg);color:var(--action-primary-fg);font:inherit;font-size:14px;font-weight:700;white-space:nowrap;text-decoration:none;cursor:pointer}
.fl-brief .fl-brief-act:hover{background:var(--action-primary-hover)}
.fl-brief .fl-brief-act:active{background:var(--action-primary-pressed)}
.fl-brief .fl-brief-act:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
@media (pointer:coarse){.fl-brief .fl-brief-act{min-height:44px}}
@media (max-width:640px){.fl-brief-body{align-items:stretch}.fl-brief .fl-brief-act{width:100%}}
.fl-strip{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;margin:0;background:none;border:0;border-top:1px solid var(--fl-line);border-bottom:1px solid var(--fl-line);box-shadow:none;border-radius:0;overflow:hidden}
.fl-strip>div{padding:10px 8px 10px 16px;border-right:1px solid var(--fl-line);min-width:0}
.fl-strip>div:first-child{padding-left:0}
.fl-strip>div:last-child{border-right:0}
.fl-strip b{display:block;font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--fl-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fl-strip span{display:block;font-size:12px;color:var(--fl-text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fl-strip [data-tone=bad] b{color:var(--danger)}
.fl-strip [data-tone=warn] b{color:var(--warning)}
.fl-strip [data-tone=good] b{color:var(--success)}
/* A section heading: the section colour (--title-section), 16px, bold — the
   same look as .pmSecTitle / .k-card-title in globals.css. Its action
   ("See all ›") is a blue link. */
.fl-sec.fl-sec{margin:0;line-height:1.25;-webkit-text-fill-color:currentColor;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:20px 0 8px;font-size:var(--fs-section);font-weight:700;letter-spacing:-0.005em;color:var(--title-section);text-transform:none;text-shadow:none}
.fl-sec>span:first-child{display:inline-flex;align-items:center;gap:9px;min-width:0}
.fl-sec .fl-sec-act{position:relative;color:var(--link);-webkit-text-fill-color:currentColor;font-weight:600;letter-spacing:0;text-transform:none;font-size:13px;text-decoration:none;background:none;border:0;padding:0;cursor:pointer}
.fl-sec .fl-sec-act::after{content:'';position:absolute;inset:-14px -10px}
.fl-list{list-style:none;margin:0;padding:0;background:none;border:0;border-top:1px solid var(--fl-line);border-bottom:1px solid var(--fl-line);box-shadow:none;border-radius:0;overflow:hidden}
.fl-list>li{border-bottom:1px solid var(--fl-line)}
.fl-list>li:last-child{border-bottom:0}
.fl-row{display:flex;align-items:center;gap:12px;padding:10px 8px;min-height:58px;color:var(--fl-text);text-decoration:none;background:transparent;-webkit-tap-highlight-color:transparent}
a.fl-row:hover,button.fl-row:hover{background:var(--bg-row-hover)}
a.fl-row:active,button.fl-row:active{background:var(--fl-line)}
a.fl-row:focus-visible,button.fl-row:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
button.fl-row{width:100%;border:0;font:inherit;text-align:left;cursor:pointer}
.fl-dot{width:8px;height:8px;border-radius:4px;flex:none}
.fl-dot[data-c=red]{background:var(--danger)} .fl-dot[data-c=amber]{background:var(--warning)} .fl-dot[data-c=green]{background:var(--success)} .fl-dot[data-c=blue]{background:var(--fl-neutral)} .fl-dot[data-c=gold]{background:var(--brand-primary)} .fl-dot[data-c=grey]{background:var(--fl-text-3)}
.fl-row>.k-tile{width:36px;height:36px}
.fl-m{flex:1;min-width:0}
.fl-t{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* A row with a button beside it keeps its whole title: two lines, not an ellipsis. */
.fl-row:has(>.fl-act) .fl-t,.fl-row:has(>.fl-act) .fl-s{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3}
.fl-s{font-size:13px;color:var(--fl-text-2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fl-s b{font-weight:500;color:var(--fl-text)}
.fl-r{font-size:13px;color:var(--fl-text-2);text-align:right;flex:none;font-variant-numeric:tabular-nums}
.fl-r b{display:block;color:var(--fl-text);font-size:15px;font-weight:650}
.fl-bar{height:3px;background:var(--fl-line);border-radius:2px;margin-top:6px;overflow:hidden}
.fl-bar i{display:block;height:100%;background:var(--success)}
.fl-chev{color:var(--fl-text-3);font-size:18px;flex:none;line-height:1}
.fl-act{position:relative;box-sizing:border-box;flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:0 12px;border-radius:8px;font-size:13px;font-weight:650;white-space:nowrap;cursor:pointer;border:1px solid transparent;font-family:inherit}
.fl-act::after{content:'';position:absolute;inset:-5px -2px}
.fl-act[data-k=primary]{background:var(--action-primary-bg);color:var(--action-primary-fg)}
.fl-act[data-k=primary]:hover:not([disabled]){background:var(--action-primary-hover)}
.fl-act[data-k=primary]:active:not([disabled]){background:var(--action-primary-pressed)}
.fl-act[data-k=ghost]{background:var(--action-secondary-bg);color:var(--action-secondary-fg);border-color:var(--action-secondary-border)}
.fl-act[data-k=ghost]:hover:not([disabled]){background:var(--action-secondary-hover)}
.fl-act[data-k=ghost]:active:not([disabled]){background:var(--action-secondary-pressed)}
.fl-act:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.fl-act[disabled]:not([aria-busy=true]){background:var(--disabled-bg);color:var(--disabled-fg);border-color:var(--disabled-border);cursor:default}
.fl-act[aria-busy=true]{opacity:.8;cursor:progress}
.fl-tabs{display:flex;margin:10px 0 4px;background:var(--fl-surface);border:1px solid var(--fl-line);border-radius:10px;padding:2px}
.fl-tabs{gap:2px}
.fl-tabs button{flex:1 1 auto;min-width:0;min-height:36px;padding:0 10px;border:0;background:none;font:inherit;font-size:14px;font-weight:600;color:var(--tab-fg);border-radius:8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:420px){.fl-tabs button{padding:0 6px;font-size:13px}}
.fl-tabs button:hover:not([aria-selected=true]){background:var(--tab-hover-bg)}
.fl-tabs button[aria-selected=true]{background:var(--tab-selected-bg);color:var(--tab-selected-fg);font-weight:700}
.fl-tabs button:focus-visible{outline:2px solid var(--focus-ring);outline-offset:1px}
@media (pointer:coarse){.fl-tabs button{min-height:44px}}
.fl-tool{display:flex;align-items:center;gap:12px;padding:0 8px;min-height:56px;color:var(--fl-text);text-decoration:none;-webkit-tap-highlight-color:transparent}
a.fl-tool:hover{background:var(--bg-row-hover)}
a.fl-tool:active{background:var(--fl-line)}
a.fl-tool:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
.fl-tool .fl-ti{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;flex:none;color:var(--acc);background:color-mix(in srgb,var(--acc) 14%,var(--bg-surface-2));border:1px solid color-mix(in srgb,var(--acc) 38%,var(--bg-surface-2))}
.fl-tool .fl-tm{flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:12px}
.fl-tool .fl-tn{min-width:0;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fl-tool .fl-tc{font-size:13px;color:var(--fl-text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fl-tool .fl-tc[data-warn=true]{color:var(--warning)}
/* The concept's "More project tools": a two-column grid of separate tiles,
   each an icon, its name over its count, and a chevron. */
.fl-list[data-grid]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px;background:none;border:0;border-radius:0;overflow:visible}
.fl-list[data-grid]>li,.fl-list[data-grid]>li:last-child{border:0;border-bottom:1px solid var(--fl-line);border-radius:0;background:none;overflow:hidden}
.fl-list[data-grid] .fl-tool{gap:10px;padding:8px 10px 8px 12px;min-height:60px}
.fl-list[data-grid] .fl-ti{width:32px;height:32px;border-radius:9px}
.fl-list[data-grid] .fl-tm{flex-direction:column;align-items:flex-start;justify-content:center;gap:2px}
.fl-list[data-grid] .fl-tn{font-size:14px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.25;overflow-wrap:anywhere}
.fl-list[data-grid] .fl-tc{max-width:100%;font-size:13px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3}
.fl-swipe{position:relative;overflow:hidden;touch-action:pan-y}
.fl-swipe-acts{position:absolute;top:0;right:0;bottom:0;display:flex}
.fl-swipe-acts button{width:78px;border:0;font:inherit;font-size:13px;font-weight:700;cursor:pointer;color:var(--fl-text);background:var(--fl-line)}
.fl-swipe-acts button[data-k=primary]{background:var(--brand-primary);color:var(--on-brand)}
.fl-swipe-acts button[data-k=good]{background:var(--success);color:var(--on-brand)}
.fl-swipe-body{position:relative;background:var(--bg-base);transition:transform .2s cubic-bezier(.2,.7,.3,1)}
.fl-swipe-body[data-drag=true]{transition:none}
.fl-skel{display:flex;align-items:center;gap:12px;padding:12px 8px;min-height:58px;border-bottom:1px solid var(--fl-line)}
.fl-skel i{display:block;height:10px;border-radius:5px;background:var(--fl-line);animation:fl-pulse 1.2s ease-in-out infinite}
@keyframes fl-pulse{50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.fl-skel i{animation:none}.fl-swipe-body{transition:none}}
.fl-empty{padding:14px 0;font-size:14px;color:var(--fl-text-2)}
`;

/** The flat stylesheet. Render once per page; extra copies are harmless. */
export function FlatStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

export type DotColor = 'red' | 'amber' | 'green' | 'blue' | 'gold' | 'grey';

export function Dot({ c }: { c: DotColor }) {
  return <span className="fl-dot" data-c={c} aria-hidden="true" />;
}

export type FlatTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Sage's read of the data, with at most one action: the concept's alert card. */
export function Brief({ children, action, tone = 'info', icon }: {
  children: React.ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
  tone?: Exclude<FlatTone, 'neutral'>;
  icon?: React.ReactNode;
}) {
  return (
    <div className="fl-brief" data-tone={tone}>
      <span className="fl-brief-ic" aria-hidden="true">{icon ?? <Sparkle size={18} weight="fill" />}</span>
      <div className="fl-brief-body">
        <p className="fl-brief-text">{children}</p>
        {action && (action.href
          ? <Link className="fl-brief-act" href={action.href}>{action.label}</Link>
          : <button type="button" className="fl-brief-act" onClick={action.onClick}>{action.label}</button>)}
      </div>
    </div>
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

/** A section heading (lit yellow, easy to find), with an optional link on the right. */
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

/** A grouped list. `grid` lays tool rows out as the concept's two-column tiles. */
export function FlatList({ children, label, grid }: { children: React.ReactNode; label?: string; grid?: boolean }) {
  return <ul className="fl-list" aria-label={label} data-grid={grid || undefined}>{children}</ul>;
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
  /** The row's icon, drawn in a tile. A row with a `dot` and no icon gets the
      status icon for that colour, so every status row reads the same way. */
  icon?: React.ReactNode;
  tone?: FlatTone;
};

const DOT_TONE: Record<DotColor, FlatTone> = { red: 'danger', amber: 'warning', green: 'success', blue: 'info', gold: 'info', grey: 'neutral' };
const DOT_ICON: Record<DotColor, React.ElementType> = { red: WarningCircle, amber: Clock, green: CheckCircle, blue: Info, gold: Star, grey: Circle };

/** A row's icon tile (the concept's list rows). */
export function RowIcon({ tone = 'neutral', children }: { tone?: FlatTone; children: React.ReactNode }) {
  return <span className="k-tile" data-tone={tone === 'neutral' ? undefined : tone} aria-hidden="true">{children}</span>;
}

/** A list row: icon tile · title over meta · right value or one action. Wrap in <li>. */
export function Row({ title, meta, dot, right, rightSub, action, href, onClick, bar, chevron, icon, tone }: RowProps) {
  const DotIcon = dot && !icon ? DOT_ICON[dot] : null;
  const body = (
    <>
      {icon ? <RowIcon tone={tone ?? (dot ? DOT_TONE[dot] : 'neutral')}>{icon}</RowIcon>
        : DotIcon && dot ? <RowIcon tone={tone ?? DOT_TONE[dot]}><DotIcon size={18} weight="bold" /></RowIcon> : null}
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

/** One of a job's tools: icon · name · count or state · chevron. `accent` is
 *  the tool's module hue (lib/ui/app-accent); without it the tile takes the
 *  page's accent. */
export function ToolRow({ icon, label, value, warn, href, accent }: { icon: React.ReactNode; label: string; value?: React.ReactNode; warn?: boolean; href: string; accent?: string }) {
  return (
    <Link className="fl-tool" href={href} style={accent ? ({ ['--acc' as string]: accent } as React.CSSProperties) : undefined}>
      <span className="fl-ti" aria-hidden="true">{icon}</span>
      <span className="fl-tm">
        <span className="fl-tn">{label}</span>
        {value != null && <span className="fl-tc" data-warn={warn || undefined}>{value}</span>}
      </span>
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
