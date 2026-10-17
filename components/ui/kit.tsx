'use client';

/**
 * Saguaro Kit — THE shared UI. Every page is built from these primitives and
 * nothing else: one page frame, one table, one card, one KPI tile, one modal,
 * one field set, one action pattern. Styling lives in the `.k-*` classes in
 * app/globals.css and reads the :root tokens, so a change there restyles every
 * page that uses the kit. Showcase + reference: /app/kit.
 *
 *   import { PageShell, DataTable, StatRow, FormModal, Field, Input, RowActions } from '@/components/ui/kit';
 *
 * Rules (docs/DESIGN-SYSTEM-FIX-PLAN.md):
 *   - No hand-rolled fixed overlays → FormModal.
 *   - No ad-hoc stat cards → StatRow / StatTile.
 *   - No per-page table styling → DataTable (rowActions for the entity's verbs).
 *   - No per-page width/padding → PageShell.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { type Icon as PhosphorIcon, CaretRight, CaretDown, CaretUp, CaretLeft, DotsSixVertical, Funnel, CheckSquare, Star, UsersThree, Trash, ArrowCounterClockwise, FloppyDisk, BookmarkSimple, Rows, Columns, DownloadSimple, DotsThree, MagnifyingGlass, X, EnvelopeSimple, Phone, User, Buildings, MapPin, CalendarBlank, CurrencyDollar, Flag, Tag, Hash, Note, Info } from '@phosphor-icons/react';
import { useSortedRows, type SortState, type SortDir } from './premium';
import { SortBar } from './sort';
import { EmptyActions, hasEmptyActions, type EmptyActionProps } from './empty-actions';
import { STATUS_COLORS, type StatusKind } from '@/lib/status-colors';
import { initialsOf, monoToken } from '@/lib/directory-view';
import {
  mergeOrder, moveColumn, dropColumn, plainValue, humanValue, rowMatches, cleanFilters, distinctValues,
  viewPayload, stateFromView, runBulk, bulkSummary,
  type ListFilters, type ListViewState, type SavedListView,
} from '@/lib/list-view';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ─── PageShell ───────────────────────────────────────────────────────────────

export type Crumb = { label: string; href?: string };

export function PageShell({
  title,
  subtitle,
  badge,
  meta,
  actions,
  crumbs,
  width,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Status pill beside the title (the record's state), as in the approved concept. */
  badge?: React.ReactNode;
  /** One quiet line of facts under the title — icon + text pairs (MetaItem). */
  meta?: React.ReactNode;
  /** Right side of the header. Exactly one `variant="primary"` button per page. */
  actions?: React.ReactNode;
  crumbs?: Crumb[];
  /** "form": the header keeps the full width and the body holds a readable
   *  field column (--form-max) against the left edge. Default: full width. */
  width?: 'form';
  children: React.ReactNode;
}) {
  return (
    <div className="k-page" data-width={width}>
      {crumbs && crumbs.length > 0 && (
        <nav className="k-crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <CaretRight size={11} />}
              {c.href ? <a href={c.href}>{c.label}</a> : <span>{c.label}</span>}
            </React.Fragment>
          ))}
        </nav>
      )}
      <header className="k-head">
        <div style={{ minWidth: 0 }}>
          <div className="k-title-row">
            <h1 className="k-title">{title}</h1>
            {badge}
          </div>
          {subtitle && <p className="k-sub">{subtitle}</p>}
          {meta && <div className="k-meta">{meta}</div>}
        </div>
        {actions && <div className="k-head-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  href?: string;
  children?: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

export function Button({ variant = 'secondary', size = 'md', icon, href, children, className, type = 'button', ...rest }: ButtonProps) {
  const cls = cx('k-btn', `k-btn-${variant}`, size === 'sm' && 'k-btn-sm', !children && 'k-icon-btn', className);
  if (href && !rest.disabled) {
    return (
      <a className={cls} href={href} title={rest.title} aria-label={rest['aria-label']}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button className={cls} type={type} {...rest}>
      {icon}
      {children}
    </button>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

export function Card({
  title,
  subtitle,
  icon,
  actions,
  flush,
  children,
  style,
}: {
  title?: React.ReactNode;
  /** Icon shown in a tile beside the title (IconTile). */
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** No body padding — for a DataTable or list that runs edge to edge. */
  flush?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section className="k-card" style={style}>
      {(title || actions) && (
        <div className="k-card-head">
          {icon && <IconTile>{icon}</IconTile>}
          <div style={{ minWidth: 0, flex: 1 }}>
            {title && <div className="k-card-title">{title}</div>}
            {subtitle && <div className="k-card-sub">{subtitle}</div>}
          </div>
          {actions && <div className="k-row-actions">{actions}</div>}
        </div>
      )}
      <div className={flush ? 'k-card-flush' : 'k-card-body'}>{children}</div>
    </section>
  );
}

// ─── Concept building blocks (DESIGN_SYSTEM.md §3) ───────────────────────────
// The approved mobile concept: icons sit in slate tiles, rows lead with an icon
// and end with an action or a chevron, an alert card names one next step, and a
// picker shows the selected option as the one solid yellow tile.

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** A 36px slate tile holding an icon. Tone colours the icon only. */
export function IconTile({ tone = 'neutral', size = 36, children }: { tone?: Tone; size?: number; children: React.ReactNode }) {
  return <span className="k-tile" data-tone={tone} style={{ width: size, height: size }} aria-hidden>{children}</span>;
}

/** One fact in a PageShell meta line: icon + text. */
export function MetaItem({ icon, children, href }: { icon?: React.ReactNode; children: React.ReactNode; href?: string }) {
  const inner = <>{icon && <span className="k-meta-ic" aria-hidden>{icon}</span>}<span>{children}</span></>;
  return href ? <a className="k-meta-item k-link" href={href}>{inner}</a> : <span className="k-meta-item">{inner}</span>;
}

/** A row: icon tile, title, optional description, then a value, an action or a chevron. */
export function ItemRow({ icon, tone, title, desc, value, action, href, onClick }: {
  icon?: React.ReactNode; tone?: Tone; title: React.ReactNode; desc?: React.ReactNode;
  value?: React.ReactNode; action?: React.ReactNode; href?: string; onClick?: () => void;
}) {
  const body = (
    <>
      {icon && <IconTile tone={tone}>{icon}</IconTile>}
      <span className="k-item-text">
        <span className="k-item-title">{title}</span>
        {desc && <span className="k-item-desc">{desc}</span>}
      </span>
      {value !== undefined && value !== null && <span className="k-item-value">{value}</span>}
      {action && <span className="k-item-action" onClick={(e) => e.stopPropagation()}>{action}</span>}
      {(href || onClick) && !action && <CaretRight size={14} className="k-item-chev" aria-hidden />}
    </>
  );
  if (href) return <a className="k-item k-item-link" href={href}>{body}</a>;
  if (onClick) return <button type="button" className="k-item k-item-link" onClick={onClick}>{body}</button>;
  return <div className="k-item">{body}</div>;
}

/** A stack of ItemRows with hairline separators. */
export function ItemList({ children }: { children: React.ReactNode }) {
  return <div className="k-items">{children}</div>;
}

/** The concept's alert card: a status icon, one bold line, a sentence, then the actions. */
export function Callout({ tone = 'info', icon, title, text, actions }: {
  tone?: Exclude<Tone, 'neutral'>; icon?: React.ReactNode; title: React.ReactNode; text?: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <div className="k-callout" data-tone={tone} role={tone === 'danger' ? 'alert' : undefined}>
      <div className="k-callout-main">
        {icon && <span className="k-callout-ic" aria-hidden>{icon}</span>}
        <div style={{ minWidth: 0 }}>
          <div className="k-callout-title">{title}</div>
          {text && <div className="k-callout-text">{text}</div>}
        </div>
      </div>
      {actions && <div className="k-callout-actions">{actions}</div>}
    </div>
  );
}

/** Ordered stages as one connected strip: done stages carry a check, the current
 *  stage is the solid yellow segment (aria-current), the rest are slate. */
export function StagePicker({ stages, value, onSelect, busy, label = 'Stage' }: {
  stages: readonly string[]; value: string | null; onSelect: (s: string) => void; busy?: string | null; label?: string;
}) {
  const cur = value ? stages.indexOf(value) : -1;
  return (
    <div className="k-stages" role="group" aria-label={label}>
      {stages.map((s, i) => {
        const state = i === cur ? 'current' : cur >= 0 && i < cur ? 'done' : 'todo';
        return (
          <button
            key={s}
            type="button"
            className="k-stage"
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
            disabled={!!busy}
            onClick={() => { if (state !== 'current') onSelect(s); }}
          >
            <span className="k-stage-n" aria-hidden>{state === 'done' ? '✓' : i + 1}</span>
            <span className="k-stage-l">{busy === s ? 'Saving…' : s}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A vertical timeline: an icon dot per entry with a connector line. */
export function Timeline({ items }: { items: { key: string; icon?: React.ReactNode; tone?: Tone; title: React.ReactNode; meta?: React.ReactNode; body?: React.ReactNode }[] }) {
  return (
    <ol className="k-tl">
      {items.map((it) => (
        <li key={it.key} className="k-tl-item">
          <span className="k-tl-dot" data-tone={it.tone || 'neutral'} aria-hidden>{it.icon}</span>
          <div className="k-tl-body">
            <div className="k-tl-head"><span className="k-tl-title">{it.title}</span>{it.meta && <span className="k-tl-meta">{it.meta}</span>}</div>
            {it.body && <div className="k-tl-text">{it.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── StatTile / StatRow ──────────────────────────────────────────────────────

export type StatItem = {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Colors the value only — never the tile. */
  tone?: 'default' | 'good' | 'warn' | 'bad';
  href?: string;
  onClick?: () => void;
  /** A tile that filters the list below: true while its filter is the one
   *  showing (aria-pressed, gold underline). Tapping it again changes nothing. */
  active?: boolean;
  /** Colored icon tile (neon glass) — a phosphor icon at 14–15px. */
  icon?: React.ReactNode;
};

/* Same family as the status pills (lib/status-colors): good = Ongoing green,
   warn = Under Contract amber, bad = Overdue red. */
const TONE_COLOR: Record<NonNullable<StatItem['tone']>, string | undefined> = {
  default: undefined,
  good: STATUS_COLORS.ongoing.color,
  warn: STATUS_COLORS.under_contract.color,
  bad: STATUS_COLORS.overdue.color,
};

export function StatTile({ label, value, sub, tone = 'default', href, onClick, active, icon }: StatItem) {
  const inner = (
    <>
      <span className="k-stat-top">
        {icon && <span className="k-stat-icon" aria-hidden>{icon}</span>}
        <span className="k-stat-label">{label}</span>
      </span>
      <span className="k-stat-value" style={{ color: TONE_COLOR[tone] }}>{value}</span>
      {sub && <span className="k-stat-sub">{sub}</span>}
    </>
  );
  if (href) return <a className="k-stat" data-tone={tone} href={href}>{inner}</a>;
  if (onClick) return <button type="button" className="k-stat" data-tone={tone} onClick={onClick} aria-pressed={active === undefined ? undefined : active}>{inner}</button>;
  return <div className="k-stat" data-tone={tone}>{inner}</div>;
}

export function StatRow({ items }: { items: StatItem[] }) {
  return (
    <div className="k-stats">
      {items.map((it, i) => <StatTile key={i} {...it} />)}
    </div>
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────

export type BadgeTone = StatusKind | 'neutral' | 'gold';

const BADGE_NEUTRAL = { color: 'var(--text-secondary)', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.40)' };
const BADGE_GOLD = { color: 'var(--text-primary)', bg: 'var(--bg-surface-2)', border: 'var(--border-default)' };

/** Status badge. Tones are the six fixed status colors (lib/status-colors). */
export function Badge({ tone = 'neutral', dot, children }: { tone?: BadgeTone; dot?: boolean; children: React.ReactNode }) {
  const c = tone === 'neutral' ? BADGE_NEUTRAL : tone === 'gold' ? BADGE_GOLD : STATUS_COLORS[tone];
  return (
    <span className="k-badge" style={{ color: c.color, background: c.bg, borderColor: c.border }}>
      {dot && <span className="k-badge-dot" />}
      {children}
    </span>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

export type TabItem = { key: string; label: React.ReactNode; count?: number };

export function Tabs({ tabs, value, onChange }: { tabs: TabItem[]; value: string; onChange: (key: string) => void }) {
  return (
    <div className="k-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" className="k-tab" aria-selected={t.key === value} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count != null && <span className="k-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

export function Toolbar({
  search,
  onSearch,
  placeholder = 'Search…',
  filters,
  actions,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  placeholder?: string;
  /** Selects / segmented filters, left side after search. */
  filters?: React.ReactNode;
  /** Right-aligned controls (export, view toggle). */
  actions?: React.ReactNode;
}) {
  return (
    <div className="k-toolbar">
      {onSearch && (
        <div className="k-search">
          <MagnifyingGlass size={15} />
          <input className="k-input" type="search" value={search ?? ''} placeholder={placeholder} onChange={(e) => onSearch(e.target.value)} aria-label={placeholder} />
        </div>
      )}
      {filters}
      <div className="k-toolbar-spacer" />
      {actions}
    </div>
  );
}

// ─── Menu / RowActions / ActionBar ───────────────────────────────────────────

export type Action = {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  tone?: 'default' | 'danger';
  /** Shown as an inline button instead of in the ⋯ menu. */
  inline?: boolean;
  disabled?: boolean;
  hidden?: boolean;
};

/** The ⋯ overflow menu. Rendered in a portal with fixed positioning so a
 *  scrolling table or card can never clip it; flips upward near the bottom of
 *  the viewport. Closes on outside click, Escape, scroll and resize. */
export function Menu({ actions, label = 'More actions', triggerLabel, triggerIcon }: {
  actions: Action[];
  label?: string;
  /** A labelled trigger ("Tools & help") instead of the ⋯ icon. */
  triggerLabel?: string;
  triggerIcon?: React.ReactNode;
}) {
  const [pos, setPos] = React.useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const btnRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const open = pos !== null;

  const toggle = () => {
    if (open) { setPos(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const right = Math.max(8, window.innerWidth - r.right);
    const spaceBelow = window.innerHeight - r.bottom;
    setPos(spaceBelow < 260 && r.top > spaceBelow ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
  };

  React.useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || listRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (actions.length === 0) return null;
  const firstDanger = actions.findIndex((a) => a.tone === 'danger');

  return (
    <div className="k-menu" ref={btnRef} onClick={(e) => e.stopPropagation()}>
      {triggerLabel
        ? <Button size="sm" icon={triggerIcon} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>{triggerLabel}</Button>
        : <Button variant="ghost" size="sm" icon={<DotsThree size={18} weight="bold" />} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle} />}
      {open && createPortal(
        <div className="k-menu-list" role="menu" ref={listRef} style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, right: pos.right }} onClick={(e) => e.stopPropagation()}>
          {actions.map((a, i) => (
            <React.Fragment key={a.label}>
              {i === firstDanger && i > 0 && <div className="k-menu-sep" />}
              {a.href ? (
                <a className="k-menu-item" role="menuitem" href={a.href} data-tone={a.tone} onClick={() => setPos(null)}>
                  {a.icon}{a.label}
                </a>
              ) : (
                <button
                  type="button"
                  className="k-menu-item"
                  role="menuitem"
                  data-tone={a.tone}
                  disabled={a.disabled}
                  onClick={() => { setPos(null); a.onClick?.(); }}
                >
                  {a.icon}{a.label}
                </button>
              )}
            </React.Fragment>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** The entity's verbs on a list row: `inline` actions as small buttons, the rest in ⋯. */
export function RowActions({ actions }: { actions: Action[] }) {
  const visible = actions.filter((a) => !a.hidden);
  const inline = visible.filter((a) => a.inline);
  const rest = visible.filter((a) => !a.inline);
  return (
    <div className="k-row-actions" onClick={(e) => e.stopPropagation()}>
      {inline.map((a) => (
        <Button key={a.label} size="sm" variant={a.tone === 'danger' ? 'danger' : 'secondary'} icon={a.icon} href={a.href} onClick={a.onClick} disabled={a.disabled}>
          {a.label}
        </Button>
      ))}
      <Menu actions={rest} />
    </div>
  );
}

/** The same verbs on a detail page — first `inline` action is the primary. */
export function ActionBar({ actions, children }: { actions: Action[]; children?: React.ReactNode }) {
  const visible = actions.filter((a) => !a.hidden);
  const inline = visible.filter((a) => a.inline);
  const rest = visible.filter((a) => !a.inline);
  return (
    <div className="k-actionbar">
      {children}
      <div className="k-toolbar-spacer" />
      {inline.map((a, i) => (
        <Button
          key={a.label}
          variant={a.tone === 'danger' ? 'danger' : i === 0 ? 'primary' : 'secondary'}
          icon={a.icon}
          href={a.href}
          onClick={a.onClick}
          disabled={a.disabled}
        >
          {a.label}
        </Button>
      ))}
      <Menu actions={rest} />
    </div>
  );
}

// ─── DataTable ───────────────────────────────────────────────────────────────
//
// The ONE list table, and the list tools every list gets with it (Procore's
// modernized list view): pick, reorder and resize columns; filter chips;
// saved views (personal, or shared with the company, with a default); row
// multi-select with bulk actions; and CSV export of exactly what is on screen.
// The pure parts (order, filters, view shape, the bulk runner) are in
// lib/list-view.ts. On a phone the rows stack, Columns becomes a "Fields"
// sheet, a long-press (or Select) starts selecting, and the bulk bar docks
// above the tab bar.

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  /** Value used for sorting (and default rendering). Defaults to row[key]. */
  accessor?: (row: T) => unknown;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  /** Bright, bold cell — the row's name column. */
  primary?: boolean;
  /** Phones show the first column plus up to three more as a stacked card.
   *  'show' keeps this column on the card regardless of position; 'hide'
   *  drops it there. Status and money columns should say 'show'. */
  phone?: 'show' | 'hide';
  /** Starts hidden; people turn it on from Columns. */
  hidden?: boolean;
  /** Totals row: 'sum' adds the accessor's numbers, 'count' counts non-empty, or render your own. */
  total?: 'sum' | 'count' | ((rows: T[]) => React.ReactNode);
  /** How a total or a sum is shown (money columns pass a currency formatter). */
  format?: (n: number) => string;
  /** Offered in "Group by". Defaults to true for text columns that are not the name column. */
  groupable?: boolean;
  /** Offered in "Filter" (pick from the column's values). Defaults to the same rule as groupable. */
  filterable?: boolean;
  /** 'truncate': the cell gives up width before the table overflows and ends
   *  in "…"; 'full': the cell always shows everything. Default: text columns
   *  (left-aligned, no fixed width, not a status/stage badge) truncate; money,
   *  numbers and badges show in full. */
  fit?: 'truncate' | 'full';
};

/* Badge-like columns keep their full width so a pill is never clipped. */
const BADGE_KEY = /status|stage|state|priority|health|risk|badge/i;
const truncates = <T,>(c: Column<T>): boolean =>
  c.fit ? c.fit === 'truncate' : (!c.align || c.align === 'left') && c.width == null && !BADGE_KEY.test(c.key);

/**
 * Bulk edit for a list. Every action runs row by row through `apply`, which
 * must call the SAME route the single-record edit on that screen calls, so
 * the route's permission check, validation, transitions and side effects run
 * for every row. `allowed` false (no edit rights, or not known yet) means no
 * checkboxes and no bulk bar at all.
 */
export type BulkEdit<T> = {
  /** Singular noun for messages: 'RFI', 'punch item'. */
  noun: string;
  allowed: boolean;
  status?: { label?: string; options: { value: string; label: string }[]; apply: (row: T, value: string) => Promise<Response> };
  /** Pick from `options`; with no options (a free-text name field on that record) the person types the name. */
  assignee?: { label?: string; options?: { value: string; label: string }[]; noneLabel?: string; placeholder?: string; apply: (row: T, value: string) => Promise<Response> };
  due?: { label?: string; apply: (row: T, ymd: string) => Promise<Response> };
  remove?: { label?: string; verb?: string; allowed?: boolean; apply: (row: T) => Promise<Response> };
  /** Re-read the list after a bulk run (the rows changed on the server). */
  onDone: () => void;
};

const valueOf = <T,>(col: Column<T>, row: T): unknown =>
  col.accessor ? col.accessor(row) : (row as Record<string, unknown> | null | undefined)?.[col.key];

const headerText = (h: React.ReactNode, key: string) => (typeof h === 'string' ? h : key.replace(/_/g, ' '));

const plainOf = plainValue;

type GridPrefs = {
  hidden?: string[]; sort?: SortState; groupBy?: string | null;
  order?: string[]; widths?: Record<string, number>; filters?: ListFilters;
  /** A view (own or shared) this person picked as their default for this list. */
  defaultViewId?: string | null;
};

/** Stable id for a table: the page's route (ids → :id) + its column keys. */
function autoGridId(keys: string[]): string {
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
  return `${path}|${keys.join(',')}`.slice(0, 200);
}
function projectFromPath(): string | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.pathname.match(/\/projects\/([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}
function readPrefs(id: string): GridPrefs {
  try { return JSON.parse(window.localStorage.getItem(`saguaro.grid.${id}`) || '{}') as GridPrefs; }
  catch (e) { console.warn('[list] saved columns unavailable', e); return {}; }
}
function writePrefs(id: string, p: GridPrefs) {
  try { window.localStorage.setItem(`saguaro.grid.${id}`, JSON.stringify(p)); }
  catch (e) { console.warn('[list] could not remember columns', e); }
}
/** The default view is applied once per browser session per list, so a change you make sticks while you work. */
function defaultAppliedThisSession(id: string): boolean {
  try {
    const k = `saguaro.grid.default.${id}`;
    if (window.sessionStorage.getItem(k)) return true;
    window.sessionStorage.setItem(k, '1');
    return false;
  } catch (e) { console.warn('[list] session storage unavailable', e); return true; }
}

type ViewsPayload = { views: SavedListView[]; canShare: boolean };
const viewsCache = new Map<string, { at: number; data: ViewsPayload }>();

async function fetchViews(gridId: string, force = false): Promise<ViewsPayload & { error?: string }> {
  const pid = projectFromPath();
  const cacheKey = `${gridId}|${pid ?? ''}`;
  const hit = viewsCache.get(cacheKey);
  if (!force && hit && Date.now() - hit.at < 60_000) return hit.data;
  try {
    const r = await fetch(`/api/saved-views?module=${encodeURIComponent(gridId)}${pid ? `&project_id=${pid}` : ''}`, { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { views: [], canShare: false, error: typeof j.error === 'string' ? j.error : "Couldn't load saved views." };
    const data: ViewsPayload = { views: Array.isArray(j.views) ? j.views : [], canShare: !!j.canShare };
    viewsCache.set(cacheKey, { at: Date.now(), data });
    return data;
  } catch (e) {
    console.warn('[list] saved views', e);
    return { views: [], canShare: false, error: 'No connection.' };
  }
}

/** A small popover anchored under a toolbar button (columns, views, group). A bottom sheet on a phone. */
function GridPop({ label, phoneLabel, icon, children, count, onOpen }: { label: string; phoneLabel?: string; icon?: React.ReactNode; children: (close: () => void) => React.ReactNode; count?: number; onOpen?: () => void }) {
  // Rendered in a portal with fixed positioning: the table wrapper scrolls
  // sideways (overflow-x), which would clip an absolutely positioned menu.
  const [pos, setPos] = React.useState<{ top: number; right: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const open = pos !== null;
  const close = () => setPos(null);
  React.useEffect(() => { if (open) onOpen?.(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      // A dialog opened from inside the menu (name a view) lives in its own portal.
      if ((t as HTMLElement).closest?.('[role="dialog"],[role="alertdialog"]')) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', close); };
  }, [open]);
  const toggle = () => {
    if (open) { close(); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
  };
  return (
    <div className="k-grid-pop">
      <button ref={btnRef} type="button" className="k-grid-btn" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
        {icon}
        {phoneLabel ? <><span className="k-lbl-desk">{label}</span><span className="k-lbl-phone">{phoneLabel}</span></> : label}
        {count ? <span className="k-grid-count">{count}</span> : null}<CaretDown size={12} weight="bold" />
      </button>
      {open && createPortal(
        <div ref={menuRef} className="k-grid-menu" role="dialog" aria-label={phoneLabel ?? label} style={{ position: 'fixed', top: pos.top, right: pos.right }}>
          <div className="k-grid-sheet-head">
            <strong>{phoneLabel ?? label}</strong>
            <button type="button" className="k-grid-x" aria-label="Close" onClick={close}><X size={14} /></button>
          </div>
          {children(close)}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Column picker: show/hide, drag to reorder (desktop), up/down (touch), reset. */
function ColumnPanel({ order, hidden, label, onToggle, onMove, onDrop, onReset }: {
  order: string[]; hidden: Set<string>; label: (k: string) => string;
  onToggle: (k: string, on: boolean) => void; onMove: (k: string, d: -1 | 1) => void;
  onDrop: (k: string, target: string) => void; onReset: () => void;
}) {
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  return (
    <div className="k-grid-list">
      {order.map((k, i) => (
        <div
          key={k}
          className="k-col-row"
          data-over={over === k && dragging !== k ? 'true' : undefined}
          draggable={i > 0}
          onDragStart={(e) => { setDragging(k); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k); }}
          onDragOver={(e) => { if (dragging && i > 0) { e.preventDefault(); setOver(k); } }}
          onDragLeave={() => setOver((o) => (o === k ? null : o))}
          onDrop={(e) => { e.preventDefault(); if (dragging) onDrop(dragging, k); setDragging(null); setOver(null); }}
          onDragEnd={() => { setDragging(null); setOver(null); }}
        >
          <span className="k-col-grip" aria-hidden data-locked={i === 0 ? 'true' : undefined}><DotsSixVertical size={14} weight="bold" /></span>
          <label className="k-grid-check">
            <input type="checkbox" checked={!hidden.has(k)} disabled={i === 0} onChange={(e) => onToggle(k, e.target.checked)} />
            {label(k)}
          </label>
          <button type="button" className="k-col-move" aria-label={`Move ${label(k)} up`} disabled={i <= 1} onClick={() => onMove(k, -1)}><CaretUp size={14} weight="bold" /></button>
          <button type="button" className="k-col-move" aria-label={`Move ${label(k)} down`} disabled={i === 0 || i === order.length - 1} onClick={() => onMove(k, 1)}><CaretDown size={14} weight="bold" /></button>
        </div>
      ))}
      <button type="button" className="k-grid-foot" onClick={onReset}><ArrowCounterClockwise size={14} />Reset columns</button>
    </div>
  );
}

/** Add Filter: pick a column, then tick the values to keep. Applied as you tick. */
function FilterPanel({ cols, valuesFor, filters, onChange }: {
  cols: { key: string; label: string }[];
  valuesFor: (key: string) => { value: string; count: number }[];
  filters: ListFilters;
  onChange: (key: string, values: string[]) => void;
}) {
  const [col, setCol] = React.useState<string | null>(cols.length === 1 ? cols[0].key : null);
  const [q, setQ] = React.useState('');
  if (!col) {
    return (
      <div className="k-grid-list">
        {cols.map((c) => (
          <button type="button" key={c.key} data-on={!!filters[c.key]?.length} onClick={() => { setCol(c.key); setQ(''); }}>
            {c.label}{filters[c.key]?.length ? <span className="k-grid-count">{filters[c.key].length}</span> : null}
          </button>
        ))}
      </div>
    );
  }
  const chosen = new Set(filters[col] ?? []);
  const all = valuesFor(col);
  const needle = q.trim().toLowerCase();
  const list = needle ? all.filter((v) => humanValue(v.value).toLowerCase().includes(needle)) : all;
  const label = cols.find((c) => c.key === col)?.label ?? col;
  return (
    <div className="k-grid-list">
      {cols.length > 1 && <button type="button" className="k-grid-back" onClick={() => setCol(null)}><CaretLeft size={12} weight="bold" />{label}</button>}
      {all.length > 12 && <input className="k-input k-grid-search" type="search" placeholder={`Search ${label.toLowerCase()}`} aria-label={`Search ${label}`} value={q} onChange={(e) => setQ(e.target.value)} />}
      {list.map((v) => (
        <label key={v.value} className="k-grid-check">
          <input
            type="checkbox"
            checked={chosen.has(v.value)}
            onChange={(e) => {
              const n = new Set(chosen);
              if (e.target.checked) n.add(v.value); else n.delete(v.value);
              onChange(col, Array.from(n));
            }}
          />
          <span className="k-grid-check-text">{humanValue(v.value)}</span>
          <span className="k-grid-count">{v.count}</span>
        </label>
      ))}
      {list.length === 0 && <div className="k-grid-note">Nothing matches.</div>}
    </div>
  );
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowActions,
  empty,
  defaultSort,
  loading,
  isSelected,
  rowStyle,
  tableId,
  bulkActions,
  bulkEdit,
  exportName,
  toolbar,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  /** The entity's standard verbs for this row — rendered right-aligned. */
  rowActions?: (row: T) => Action[];
  /** Rendered when rows is empty — pass an <EmptyState/>. */
  empty?: React.ReactNode;
  defaultSort?: { key: string; dir: SortDir };
  /** Shows placeholder rows instead of data (never computed zeros). */
  loading?: boolean;
  /** Highlights the row the page is currently showing (detail panel open, etc.). */
  isSelected?: (row: T) => boolean;
  /** Per-row inline style — e.g. rowStripe(project) from components/ui/ProjectColor for the 3px job-colour edge. */
  rowStyle?: (row: T) => React.CSSProperties | undefined;
  /** Names this table for saved views and remembered columns. Defaults to the route + column keys. */
  tableId?: string;
  /** Turns on row checkboxes; the actions act on every checked row. Pass only when the person may run them. */
  bulkActions?: (rows: T[]) => Action[];
  /** Standard bulk edit (status, assignee, due date, delete) through the record's own route. */
  bulkEdit?: BulkEdit<T>;
  /** File name for Export (no extension). */
  exportName?: string;
  /** Show the grid bar (views, filter, group, columns, export). Defaults on for tables with 4+ columns or bulk actions. */
  toolbar?: boolean;
}) {
  const keys = React.useMemo(() => columns.map((c) => c.key), [columns]);
  const keySig = keys.join(',');
  const defaultHidden = React.useMemo(() => columns.filter((c) => c.hidden).map((c) => c.key), [columns]);
  const [gridId, setGridId] = React.useState(tableId || '');
  const [sort, setSort] = React.useState<SortState>(defaultSort ?? null);
  const [hidden, setHidden] = React.useState<Set<string>>(() => new Set(defaultHidden));
  const [order, setOrder] = React.useState<string[]>(keys);
  const [widths, setWidths] = React.useState<Record<string, number>>({});
  const [filters, setFilters] = React.useState<ListFilters>({});
  const [groupBy, setGroupBy] = React.useState<string | null>(null);
  const [defaultViewId, setDefaultViewId] = React.useState<string | null>(null);
  const [checked, setChecked] = React.useState<Set<string | number>>(new Set());
  const [selecting, setSelecting] = React.useState(false);
  const [views, setViews] = React.useState<SavedListView[] | null>(null);
  const [canShare, setCanShare] = React.useState(false);
  const [active, setActive] = React.useState<{ id: string; sig: string } | null>(null);
  const [viewMsg, setViewMsg] = React.useState('');
  const [bulkMsg, setBulkMsg] = React.useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const loadedPrefs = React.useRef(false);
  const press = React.useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean; x: number; y: number }>({ timer: null, fired: false, x: 0, y: 0 });

  const stateNow = (): ListViewState => ({ order, hidden: Array.from(hidden), widths, filters, sort, groupBy });
  const sigOf = (s: ListViewState) => JSON.stringify(viewPayload(s));
  const applyState = React.useCallback((s: ListViewState) => {
    setOrder(s.order); setHidden(new Set(s.hidden)); setWidths(s.widths); setFilters(s.filters); setSort(s.sort); setGroupBy(s.groupBy);
  }, []);

  // Restore this table's remembered layout once its id is known (client only),
  // then apply the person's default view at the start of a session.
  React.useEffect(() => {
    const id = tableId || autoGridId(keys);
    setGridId(id);
    const p = readPrefs(id);
    setOrder(mergeOrder(p.order, keys));
    if (p.hidden) setHidden(new Set(p.hidden.filter((k) => keys.includes(k) && k !== keys[0])));
    if (p.sort !== undefined) setSort(p.sort && keys.includes(p.sort.key) ? p.sort : null);
    if (p.groupBy !== undefined) setGroupBy(p.groupBy && keys.includes(p.groupBy) ? p.groupBy : null);
    if (p.widths) setWidths(Object.fromEntries(Object.entries(p.widths).filter(([k, w]) => keys.includes(k) && typeof w === 'number')));
    setFilters(cleanFilters(p.filters, keys));
    setDefaultViewId(p.defaultViewId ?? null);
    loadedPrefs.current = true;
    if (!id || defaultAppliedThisSession(id)) return;
    let alive = true;
    void fetchViews(id).then((d) => {
      if (!alive) return;
      setViews(d.views); setCanShare(d.canShare);
      const def = d.views.find((v) => v.id === p.defaultViewId) ?? d.views.find((v) => v.mine && v.is_default);
      if (def) {
        const s = stateFromView(def, keys);
        applyState(s);
        setActive({ id: def.id, sig: sigOf(s) });
      }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, keySig]);
  React.useEffect(() => {
    if (!gridId || !loadedPrefs.current) return;
    writePrefs(gridId, { hidden: Array.from(hidden), sort, groupBy, order, widths, filters, defaultViewId });
  }, [gridId, hidden, sort, groupBy, order, widths, filters, defaultViewId]);

  const byKey = React.useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const ordered = React.useMemo(() => mergeOrder(order, keys), [order, keys]);
  const visible = React.useMemo(
    () => ordered.filter((k) => !hidden.has(k) || k === keys[0]).map((k) => byKey.get(k)).filter((c): c is Column<T> => !!c),
    [ordered, hidden, byKey, keys],
  );
  const customized = React.useMemo(
    () => ordered.join(',') !== keys.join(',') || Array.from(hidden).sort().join(',') !== [...defaultHidden].sort().join(','),
    [ordered, keys, hidden, defaultHidden],
  );
  const getValue = React.useCallback((row: T, key: string) => {
    const col = byKey.get(key);
    return col ? valueOf(col, row) : undefined;
  }, [byKey]);
  const activeFilters = React.useMemo(() => cleanFilters(filters, keys), [filters, keys]);
  const filterCount = Object.keys(activeFilters).length;
  const filtered = React.useMemo(
    () => (filterCount ? rows.filter((r) => rowMatches(activeFilters, (k) => getValue(r, k))) : rows),
    [rows, activeFilters, filterCount, getValue],
  );
  const sorted = useSortedRows(filtered, sort, getValue);

  const cycle = (key: string) =>
    setSort((p) => (!p || p.key !== key ? { key, dir: 'asc' } : p.dir === 'asc' ? { key, dir: 'desc' } : null));

  const editAllowed = !!bulkEdit?.allowed && !!(bulkEdit.status || bulkEdit.assignee || bulkEdit.due || (bulkEdit.remove && bulkEdit.remove.allowed !== false));
  const bulk = !!bulkActions || editAllowed;
  const showBar = toolbar ?? (columns.length >= 4 || bulk);
  const colCount = visible.length + (rowActions ? 1 : 0) + (bulk ? 1 : 0);
  const sortCols = visible.filter((c) => c.sortable !== false && typeof c.header === 'string').map((c) => ({ key: c.key, label: c.header as string }));
  const autoPickable = (c: Column<T>) => !c.primary && c.align !== 'right' && typeof c.header === 'string';
  const groupCols = columns.filter((c) => c.groupable ?? autoPickable(c));
  const filterCols = columns.filter((c) => c.filterable ?? c.groupable ?? autoPickable(c)).map((c) => ({ key: c.key, label: headerText(c.header, c.key) }));
  const hasTotals = visible.some((c) => c.total);
  const labelOf = (k: string) => headerText(byKey.get(k)?.header, k);

  // Grouping: rows bucketed by the column's plain value, in sorted order.
  const groups = React.useMemo(() => {
    if (!groupBy) return null;
    const col = byKey.get(groupBy);
    if (!col) return null;
    const m = new Map<string, T[]>();
    sorted.forEach((r) => {
      const k = humanValue(plainOf(valueOf(col, r))).replace('(blank)', '(none)');
      const list = m.get(k);
      if (list) list.push(r); else m.set(k, [r]);
    });
    return Array.from(m.entries());
  }, [groupBy, sorted, byKey]);

  const totalCell = (c: Column<T>, list: T[]): React.ReactNode => {
    if (!c.total) return null;
    if (typeof c.total === 'function') return c.total(list);
    if (c.total === 'count') return list.filter((r) => plainOf(valueOf(c, r)) !== '').length.toLocaleString('en-US');
    const sum = list.reduce((a, r) => { const n = Number(valueOf(c, r)); return Number.isFinite(n) ? a + n : a; }, 0);
    return c.format ? c.format(sum) : sum.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  const keyOf = (r: T) => rowKey(r);
  const allChecked = bulk && sorted.length > 0 && sorted.every((r) => checked.has(keyOf(r)));
  const checkedRows = bulk ? sorted.filter((r) => checked.has(keyOf(r))) : [];
  const toggleRow = (k: string | number, on?: boolean) =>
    setChecked((p) => { const n = new Set(p); if (on ?? !n.has(k)) n.add(k); else n.delete(k); return n; });
  React.useEffect(() => {
    // Drop checks for rows that left the table.
    if (!bulk || checked.size === 0) return;
    const live = new Set(rows.map((r) => rowKey(r)));
    let changed = false;
    const next = new Set<string | number>();
    checked.forEach((k) => { if (live.has(k)) next.add(k); else changed = true; });
    if (changed) setChecked(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  React.useEffect(() => { if (!bulk) { setChecked(new Set()); setSelecting(false); } }, [bulk]);
  const endSelecting = () => { setChecked(new Set()); setSelecting(false); };

  // Export exactly what is on screen: visible columns in their order, current filters and sort.
  const exportCsv = (list: T[]) => {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const head = visible.map((c) => esc(headerText(c.header, c.key)));
    const lines = list.map((r) => visible.map((c) => esc(plainOf(valueOf(c, r)))).join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(exportName || document.title.split('—')[0] || 'saguaro-export').trim().replace(/[^\w-]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ── Saved views ──
  const loadViews = React.useCallback(async (force = false) => {
    if (!gridId) return;
    const d = await fetchViews(gridId, force);
    setViews(d.views); setCanShare(d.canShare);
    if (d.error) setViewMsg(d.error);
  }, [gridId]);
  const applyView = (v: SavedListView) => {
    const s = stateFromView(v, keys);
    applyState(s);
    setActive({ id: v.id, sig: sigOf(s) });
    setViewMsg(`Showing "${v.name}".`);
  };
  const viewRequest = async (url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) => {
    const r = await fetch(url, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, j: j as { error?: string; view?: SavedListView } };
  };
  const saveView = async (share: boolean) => {
    const { textPrompt } = await import('@/lib/ui/async-dialog');
    const name = (await textPrompt({
      title: share ? 'Save and share this view' : 'Save this view',
      message: share ? 'Everyone in your company can load it. Only you can change it.' : 'Name it so you can come back to these columns, filters and sort.',
      placeholder: 'e.g. Overdue by trade',
      required: true,
    }))?.trim();
    if (!name) return;
    const s = stateNow();
    const { ok, j } = await viewRequest('/api/saved-views', 'POST', { name, module: gridId, is_shared: share, ...viewPayload(s) });
    setViewMsg(ok ? `Saved "${name}"${share ? ' and shared it with the company' : ''}.` : (j.error || "Couldn't save the view."));
    if (ok && j.view) setActive({ id: j.view.id, sig: sigOf(s) });
    await loadViews(true);
  };
  const updateView = async (v: SavedListView) => {
    const s = stateNow();
    const { ok, j } = await viewRequest(`/api/saved-views?id=${encodeURIComponent(v.id)}`, 'PATCH', viewPayload(s));
    setViewMsg(ok ? `Updated "${v.name}".` : (j.error || "Couldn't update the view."));
    if (ok) setActive({ id: v.id, sig: sigOf(s) });
    await loadViews(true);
  };
  const shareView = async (v: SavedListView) => {
    const { ok, j } = await viewRequest(`/api/saved-views?id=${encodeURIComponent(v.id)}`, 'PATCH', { is_shared: !v.is_shared });
    setViewMsg(ok ? (v.is_shared ? `"${v.name}" is just yours now.` : `"${v.name}" is shared with the company.`) : (j.error || "Couldn't change sharing."));
    await loadViews(true);
  };
  const makeDefault = async (v: SavedListView) => {
    const isDef = defaultViewId === v.id || (!defaultViewId && v.mine && v.is_default);
    if (isDef) {
      setDefaultViewId(null);
      if (v.mine && v.is_default) await viewRequest(`/api/saved-views?id=${encodeURIComponent(v.id)}`, 'PATCH', { is_default: false });
      setViewMsg(`"${v.name}" is no longer your default.`);
    } else {
      setDefaultViewId(v.id);
      if (v.mine) await viewRequest(`/api/saved-views?id=${encodeURIComponent(v.id)}`, 'PATCH', { is_default: true });
      setViewMsg(`"${v.name}" opens first on this list.`);
    }
    await loadViews(true);
  };
  const deleteView = async (v: SavedListView) => {
    const { ok, j } = await viewRequest(`/api/saved-views?id=${encodeURIComponent(v.id)}`, 'DELETE');
    setViewMsg(ok ? `Removed "${v.name}".` : (j.error || "Couldn't remove the view."));
    if (ok && active?.id === v.id) setActive(null);
    if (ok && defaultViewId === v.id) setDefaultViewId(null);
    await loadViews(true);
  };
  const resetAll = () => {
    applyState({ order: keys, hidden: defaultHidden, widths: {}, filters: {}, sort: defaultSort ?? null, groupBy: null });
    setActive(null);
    setViewMsg('Back to the standard list.');
  };
  const activeView = active ? views?.find((v) => v.id === active.id) ?? null : null;
  const modified = !!active && sigOf(stateNow()) !== active.sig;

  // ── Bulk ──
  const runAction = async (verb: string, run: (r: T) => Promise<Response>) => {
    if (!bulkEdit || checkedRows.length === 0) return;
    setBulkBusy(true);
    setBulkMsg(null);
    const outcome = await runBulk(checkedRows, run);
    setBulkBusy(false);
    setBulkMsg({ text: bulkSummary(outcome, bulkEdit.noun, verb), tone: outcome.failed ? 'bad' : 'good' });
    if (outcome.done > 0) { setChecked(new Set()); setSelecting(false); }
    bulkEdit.onDone();
  };
  const editActions: Action[] = [];
  if (bulkEdit && editAllowed) {
    const n = checkedRows.length;
    if (bulkEdit.status) {
      const st = bulkEdit.status;
      editActions.push({ label: st.label ?? 'Change status', icon: <Flag size={14} />, disabled: bulkBusy, onClick: () => { void (async () => {
        const { choicePrompt } = await import('@/lib/ui/async-dialog');
        const v = await choicePrompt({ title: `Status for ${n} ${bulkEdit.noun}${n === 1 ? '' : 's'}`, options: st.options });
        if (v) await runAction('updated', (r) => st.apply(r, v));
      })(); } });
    }
    if (bulkEdit.assignee) {
      const as = bulkEdit.assignee;
      editActions.push({ label: as.label ?? 'Assign', icon: <User size={14} />, disabled: bulkBusy, onClick: () => { void (async () => {
        const { choicePrompt, textPrompt } = await import('@/lib/ui/async-dialog');
        const title = `${as.label ?? 'Assign'} — ${n} ${bulkEdit.noun}${n === 1 ? '' : 's'}`;
        const v = as.options && as.options.length
          ? await choicePrompt({ title, options: as.options, noneLabel: as.noneLabel })
          : (await textPrompt({ title, placeholder: as.placeholder ?? 'Name', required: true, submitLabel: 'Assign' }))?.trim() || null;
        if (v !== null) await runAction('updated', (r) => as.apply(r, v));
      })(); } });
    }
    if (bulkEdit.due) {
      const du = bulkEdit.due;
      editActions.push({ label: du.label ?? 'Set due date', icon: <CalendarBlank size={14} />, disabled: bulkBusy, onClick: () => { void (async () => {
        const { textPrompt } = await import('@/lib/ui/async-dialog');
        const v = await textPrompt({ title: `${du.label ?? 'Due date'} — ${n} ${bulkEdit.noun}${n === 1 ? '' : 's'}`, type: 'date', required: true, submitLabel: 'Set date' });
        if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) await runAction('updated', (r) => du.apply(r, v));
      })(); } });
    }
    if (bulkEdit.remove && bulkEdit.remove.allowed !== false) {
      const rm = bulkEdit.remove;
      const label = rm.label ?? 'Delete';
      editActions.push({ label, icon: <Trash size={14} />, tone: 'danger', disabled: bulkBusy, onClick: () => { void (async () => {
        const { confirmDialog } = await import('@/lib/ui/async-dialog');
        const ok = await confirmDialog({ title: `${label} ${n} ${bulkEdit.noun}${n === 1 ? '' : 's'}?`, message: label === 'Delete' ? 'This cannot be undone.' : undefined, confirmLabel: label, danger: true });
        if (ok) await runAction(rm.verb ?? 'deleted', rm.apply);
      })(); } });
    }
  }
  const pageActions = bulkActions ? bulkActions(checkedRows).filter((a) => !a.hidden) : [];

  // Keyboard: ↑/↓ move between rows, Enter opens.
  const onRowKey = (e: React.KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (e.key === 'Enter' && onRowClick) { e.preventDefault(); onRowClick(row); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const tr = e.currentTarget;
      let sib = (e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling) as HTMLElement | null;
      while (sib && sib.tabIndex < 0) sib = (e.key === 'ArrowDown' ? sib.nextElementSibling : sib.previousElementSibling) as HTMLElement | null;
      sib?.focus();
    }
  };

  // Touch: a long press starts selecting and picks the row.
  const pressStart = (e: React.PointerEvent, k: string | number) => {
    if (!bulk || e.pointerType !== 'touch') return;
    press.current.fired = false;
    press.current.x = e.clientX; press.current.y = e.clientY;
    if (press.current.timer) clearTimeout(press.current.timer);
    press.current.timer = setTimeout(() => {
      press.current.fired = true;
      setSelecting(true);
      toggleRow(k, true);
      try { navigator.vibrate?.(12); } catch (err) { console.warn('[list] vibrate', err); }
    }, 480);
  };
  const pressMove = (e: React.PointerEvent) => {
    if (!press.current.timer) return;
    if (Math.abs(e.clientX - press.current.x) > 8 || Math.abs(e.clientY - press.current.y) > 8) { clearTimeout(press.current.timer); press.current.timer = null; }
  };
  const pressEnd = () => { if (press.current.timer) { clearTimeout(press.current.timer); press.current.timer = null; } };

  const widthStyle = (k: string): React.CSSProperties | undefined => {
    const w = widths[k];
    return w ? { width: w, minWidth: w, maxWidth: w, overflow: 'hidden', textOverflow: 'ellipsis' } : undefined;
  };
  const startResize = (e: React.PointerEvent<HTMLSpanElement>, k: string) => {
    e.preventDefault(); e.stopPropagation();
    const th = e.currentTarget.parentElement;
    const start = th?.getBoundingClientRect().width ?? 120;
    const x0 = e.clientX;
    const move = (ev: PointerEvent) => setWidths((p) => ({ ...p, [k]: Math.max(60, Math.min(800, Math.round(start + ev.clientX - x0))) }));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const renderRow = (row: T) => {
    const k = keyOf(row);
    const isChecked = checked.has(k);
    const clickable = !!onRowClick || selecting;
    let phoneSlots = 0;
    return (
      <tr
        key={k}
        style={rowStyle?.(row)}
        data-clickable={clickable}
        data-selected={isSelected?.(row) || isChecked ? 'true' : undefined}
        data-checked={isChecked ? 'true' : undefined}
        aria-selected={isSelected ? !!isSelected(row) : bulk ? isChecked : undefined}
        tabIndex={onRowClick ? 0 : -1}
        onKeyDown={(e) => onRowKey(e, row)}
        onPointerDown={bulk ? (e) => pressStart(e, k) : undefined}
        onPointerMove={bulk ? pressMove : undefined}
        onPointerUp={bulk ? pressEnd : undefined}
        onPointerCancel={bulk ? pressEnd : undefined}
        onContextMenu={bulk && selecting ? (e) => e.preventDefault() : undefined}
        onClick={() => {
          if (press.current.fired) { press.current.fired = false; return; }
          if (selecting) { toggleRow(k); return; }
          onRowClick?.(row);
        }}
      >
        {bulk && (
          <td className="k-td-check" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" aria-label="Select row" checked={isChecked} onChange={(e) => toggleRow(k, e.target.checked)} />
          </td>
        )}
        {visible.map((c, ci) => {
          const v = valueOf(c, row);
          // Phones: the name plus three more. Once someone arranges Fields, their first ones win.
          let phone: 'show' | 'hide';
          if (customized) { phone = ci === 0 || c.phone === 'show' || phoneSlots < 4 ? 'show' : 'hide'; if (ci > 0 && phone === 'show') phoneSlots++; }
          else phone = c.phone ?? (ci < 4 ? 'show' : 'hide');
          return (
            <td key={c.key} className={c.primary ? 'k-td-primary' : undefined} style={{ textAlign: c.align, ...widthStyle(c.key) }} data-label={typeof c.header === 'string' ? c.header : undefined} data-phone={phone}>
              {(() => {
                const content = c.render ? c.render(row) : v == null || v === '' ? '—' : String(v);
                if (!truncates(c)) return content;
                // A text cell gives up width before the table overflows its card:
                // .k-cell adds nothing to the column's minimum width, so long
                // text ends in "…" (full text on hover) and the row fits.
                const tip = !c.render && v != null && String(v).length > 16 ? String(v) : undefined;
                return <div className="k-cell"><div className="k-cell-in" title={tip}>{content}</div></div>;
              })()}
            </td>
          );
        })}
        {rowActions && (
          <td className="k-td-actions">
            <RowActions actions={rowActions(row)} />
          </td>
        )}
      </tr>
    );
  };

  const totalsRow = (list: T[], label: string, cls: string) => (
    <tr className={cls}>
      {bulk && <td />}
      {visible.map((c, ci) => (
        <td key={c.key} style={{ textAlign: c.align }} data-phone={ci === 0 || c.total ? 'show' : 'hide'} data-label={typeof c.header === 'string' ? c.header : undefined}>
          {ci === 0 && !c.total ? label : totalCell(c, list)}
        </td>
      ))}
      {rowActions && <td />}
    </tr>
  );

  const myViews = (views ?? []).filter((v) => v.mine);
  const teamViews = (views ?? []).filter((v) => !v.mine);
  const isDefault = (v: SavedListView) => defaultViewId ? defaultViewId === v.id : !!(v.mine && v.is_default);
  const viewItem = (v: SavedListView) => (
    <div key={v.id} className="k-grid-item" data-on={active?.id === v.id ? 'true' : undefined}>
      <button type="button" onClick={() => applyView(v)}>{v.name}</button>
      <button type="button" className="k-grid-x" aria-pressed={isDefault(v)} aria-label={isDefault(v) ? `Stop opening ${v.name} first` : `Open ${v.name} first on this list`} title={isDefault(v) ? 'Your default' : 'Make my default'} onClick={() => void makeDefault(v)}>
        <Star size={14} weight={isDefault(v) ? 'fill' : 'regular'} />
      </button>
      {v.mine && canShare && (
        <button type="button" className="k-grid-x" aria-pressed={!!v.is_shared} aria-label={v.is_shared ? `Stop sharing ${v.name}` : `Share ${v.name} with the company`} title={v.is_shared ? 'Shared with the company' : 'Share with the company'} onClick={() => void shareView(v)}>
          <UsersThree size={14} weight={v.is_shared ? 'fill' : 'regular'} />
        </button>
      )}
      {v.mine && <button type="button" className="k-grid-x" data-tone="danger" aria-label={`Remove view ${v.name}`} onClick={() => void deleteView(v)}><X size={12} /></button>}
    </div>
  );

  return (
    <div className="k-table-wrap" data-selecting={selecting ? 'true' : undefined} data-bulkbar={bulk && checkedRows.length > 0 ? 'true' : undefined}>
      {showBar && !loading && (
        <div className="k-grid-bar">
          <span className="k-grid-n" role="status">
            {filterCount ? `${sorted.length.toLocaleString('en-US')} of ${rows.length.toLocaleString('en-US')}` : sorted.length.toLocaleString('en-US')} {rows.length === 1 && !filterCount ? 'row' : 'rows'}
            {activeView ? <span className="k-grid-view"> · {activeView.name}{modified ? ' (changed)' : ''}</span> : null}
          </span>
          <div className="k-toolbar-spacer" />
          {bulk && (
            <button type="button" className="k-grid-btn k-grid-select" aria-pressed={selecting} onClick={() => (selecting ? endSelecting() : setSelecting(true))}>
              <CheckSquare size={14} />{selecting ? 'Done' : 'Select'}
            </button>
          )}
          {gridId && (
            <GridPop label="Views" icon={<BookmarkSimple size={14} />} onOpen={() => { setViewMsg(''); void loadViews(); }}>
              {() => {
                if (views === null) return <div className="k-grid-note">Loading…</div>;
                return (
                  <div className="k-grid-list">
                    {myViews.length > 0 && <div className="k-grid-sub">My views</div>}
                    {myViews.map(viewItem)}
                    {teamViews.length > 0 && <div className="k-grid-sub">Shared with the company</div>}
                    {teamViews.map(viewItem)}
                    {views.length === 0 && <div className="k-grid-note">No saved views yet.</div>}
                    {activeView?.mine && modified && (
                      <button type="button" className="k-grid-foot" onClick={() => void updateView(activeView)}><FloppyDisk size={14} />Update &quot;{activeView.name}&quot;</button>
                    )}
                    <button type="button" className="k-grid-foot" onClick={() => void saveView(false)}><BookmarkSimple size={14} />Save current view…</button>
                    {canShare && <button type="button" className="k-grid-foot" onClick={() => void saveView(true)}><UsersThree size={14} />Save and share with the company…</button>}
                    {(active || customized || filterCount > 0) && <button type="button" className="k-grid-foot" onClick={resetAll}><ArrowCounterClockwise size={14} />Standard list</button>}
                    {viewMsg && <div className="k-grid-note" role="status">{viewMsg}</div>}
                  </div>
                );
              }}
            </GridPop>
          )}
          {filterCols.length > 0 && (
            <GridPop label="Filter" icon={<Funnel size={14} />} count={filterCount || undefined}>
              {() => (
                <FilterPanel
                  cols={filterCols}
                  filters={activeFilters}
                  valuesFor={(k) => { const col = byKey.get(k); return col ? distinctValues(rows.map((r) => valueOf(col, r))) : []; }}
                  onChange={(k, vals) => setFilters((p) => { const n = { ...p }; if (vals.length) n[k] = vals; else delete n[k]; return n; })}
                />
              )}
            </GridPop>
          )}
          {groupCols.length > 0 && (
            <GridPop label={groupBy ? `Grouped: ${labelOf(groupBy)}` : 'Group'} icon={<Rows size={14} />}>
              {(close) => (
                <div className="k-grid-list">
                  <button type="button" data-on={!groupBy} onClick={() => { setGroupBy(null); close(); }}>No grouping</button>
                  {groupCols.map((c) => (
                    <button type="button" key={c.key} data-on={groupBy === c.key} onClick={() => { setGroupBy(c.key); close(); }}>{headerText(c.header, c.key)}</button>
                  ))}
                </div>
              )}
            </GridPop>
          )}
          <GridPop label="Columns" phoneLabel="Fields" icon={<Columns size={14} />} count={hidden.size || undefined}>
            {() => (
              <ColumnPanel
                order={ordered}
                hidden={hidden}
                label={labelOf}
                onToggle={(k, on) => setHidden((p) => { const n = new Set(p); if (on) n.delete(k); else n.add(k); return n; })}
                onMove={(k, d) => setOrder(moveColumn(ordered, k, d))}
                onDrop={(k, t) => setOrder(dropColumn(ordered, k, t))}
                onReset={() => { setOrder(keys); setHidden(new Set(defaultHidden)); setWidths({}); }}
              />
            )}
          </GridPop>
          <button type="button" className="k-grid-btn" onClick={() => exportCsv(sorted)} disabled={sorted.length === 0}><DownloadSimple size={14} />Export</button>
        </div>
      )}
      {showBar && !loading && filterCount > 0 && (
        <div className="k-fchips" role="group" aria-label="Filters">
          {Object.entries(activeFilters).map(([k, vals]) => (
            <span key={k} className="k-fchip">
              <span className="k-fchip-text"><b>{labelOf(k)}:</b> {vals.map(humanValue).join(', ')}</span>
              <button type="button" aria-label={`Remove the ${labelOf(k)} filter`} onClick={() => setFilters((p) => { const n = { ...p }; delete n[k]; return n; })}><X size={12} weight="bold" /></button>
            </span>
          ))}
          <button type="button" className="k-fchip-clear" onClick={() => setFilters({})}>Clear all</button>
        </div>
      )}
      {bulk && checkedRows.length > 0 && (
        <div className="k-grid-bulk" role="toolbar" aria-label="Bulk actions">
          <strong>{checkedRows.length} selected</strong>
          {[...editActions, ...pageActions].map((a) => (
            <Button key={a.label} size="sm" variant={a.tone === 'danger' ? 'danger' : 'secondary'} icon={a.icon} disabled={a.disabled || bulkBusy} onClick={() => { a.onClick?.(); }}>
              {a.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" icon={<DownloadSimple size={14} />} onClick={() => exportCsv(checkedRows)}>Export</Button>
          <button type="button" className="k-grid-btn" onClick={endSelecting}>Clear</button>
        </div>
      )}
      {bulkMsg && (
        <div className="k-grid-msg" role="status" data-tone={bulkMsg.tone}>
          {bulkBusy ? 'Working…' : bulkMsg.text}
          <button type="button" className="k-grid-x" aria-label="Dismiss" onClick={() => setBulkMsg(null)}><X size={12} /></button>
        </div>
      )}
      <SortBar columns={sortCols} sort={sort} onChange={setSort} />
      {/* Only the table scrolls sideways (when it truly cannot fit) — the list
          tools above it and the page around it stay put. */}
      <div className="k-table-scroll">
      <table className="k-table">
        <thead>
          <tr>
            {bulk && (
              <th className="k-td-check">
                <input type="checkbox" aria-label="Select all rows" checked={allChecked} onChange={(e) => setChecked(e.target.checked ? new Set(sorted.map(keyOf)) : new Set())} />
              </th>
            )}
            {visible.map((c) => {
              const sortable = c.sortable !== false;
              const dir = sort?.key === c.key ? sort.dir : null;
              return (
                <th
                  key={c.key}
                  data-sortable={sortable}
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                  onClick={sortable ? () => cycle(c.key) : undefined}
                  style={{ textAlign: c.align, width: c.width, ...widthStyle(c.key) }}
                >
                  {c.header}
                  {dir && <span aria-hidden style={{ marginLeft: 4 }}>{dir === 'asc' ? '▲' : '▼'}</span>}
                  <span
                    className="k-col-resize"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${headerText(c.header, c.key)}`}
                    onPointerDown={(e) => startResize(e, c.key)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => { e.stopPropagation(); setWidths((p) => { const n = { ...p }; delete n[c.key]; return n; }); }}
                  />
                </th>
              );
            })}
            {rowActions && <th aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: colCount }).map((__, j) => (
                  <td key={j}><span className="k-skel" style={{ width: j === 0 ? '70%' : '50%' }} /></td>
                ))}
              </tr>
            ))
          ) : sorted.length === 0 ? (
            <tr>
              <td className="k-table-empty" colSpan={colCount}>
                {filterCount > 0 && rows.length > 0
                  ? <EmptyState title="No rows match these filters" action={<Button onClick={() => setFilters({})}>Clear filters</Button>} />
                  : (empty ?? 'Nothing here yet.')}
              </td>
            </tr>
          ) : groups ? (
            groups.map(([label, list]) => (
              <React.Fragment key={`g-${label}`}>
                <tr className="k-group-row">
                  <td colSpan={colCount}>
                    <strong>{label}</strong><span className="k-grid-count">{list.length}</span>
                  </td>
                </tr>
                {list.map(renderRow)}
                {hasTotals && totalsRow(list, 'Subtotal', 'k-subtotal-row')}
              </React.Fragment>
            ))
          ) : (
            sorted.map(renderRow)
          )}
        </tbody>
        {hasTotals && !loading && sorted.length > 0 && <tfoot>{totalsRow(sorted, 'Total', 'k-total-row')}</tfoot>}
      </table>
      </div>
    </div>
  );
}

// ─── DetailList ──────────────────────────────────────────────────────────────

/** Label / value rows for a record's details panel. Empty values show "—". */
/* A detail row's icon, chosen from its label so every DetailList in the app gets
   the concept's icon-led rows without each caller listing icons. */
const DETAIL_ICONS: [RegExp, PhosphorIcon][] = [
  [/e-?mail/i, EnvelopeSimple], [/phone|mobile|cell/i, Phone], [/contact|person|owner|assignee|assigned|by$|manager|inspector|foreman|super/i, User],
  [/company|vendor|sub(contractor)?\b|customer|client|gc\b/i, Buildings], [/address|location|site|city/i, MapPin],
  [/date|due|created|updated|submitted|received|sent|issued|approved|expires?|period|week|day/i, CalendarBlank],
  [/amount|value|total|cost|price|budget|paid|billed|retainage|contract|\$/i, CurrencyDollar],
  [/status|stage|phase|result|priority/i, Flag], [/source|channel|type|trade|category|discipline/i, Tag],
  [/number|#|no\.|ref|code|id\b/i, Hash], [/note|description|scope|reason|summary|comment/i, Note],
];
function detailIcon(label: string) {
  const hit = DETAIL_ICONS.find(([re]) => re.test(label));
  const Ic = hit ? hit[1] : Info;
  return <Ic size={15} />;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s().-]{7,}$/;
/** A plain string that is an email or phone number becomes a blue link. */
function detailValue(v: React.ReactNode): React.ReactNode {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') {
    const t = v.trim();
    if (EMAIL_RE.test(t)) return <a className="k-link" href={`mailto:${t}`}>{t}</a>;
    if (PHONE_RE.test(t) && t.replace(/\D/g, '').length >= 7) return <a className="k-link" href={`tel:${t.replace(/[^\d+]/g, '')}`}>{t}</a>;
  }
  return v;
}

/** Label / value facts, as concept rows: an icon tile, the label, the value. */
export function DetailList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="k-dl">
      {items.map(([k, v]) => (
        <div key={k} className="k-dl-row">
          <dt><IconTile size={30}>{detailIcon(k)}</IconTile><span>{k}</span></dt>
          <dd>{detailValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

/** Nothing here yet — flat (2026-10-10): icon, one plain line and the action.
 *  The title leads the line, the text finishes it. Laid on the surface, never
 *  a boxed card. Pass `primary` (+ optional `secondary`, `perm`) for the create
 *  action, `onClearFilters` when a filter emptied the list, or a ready-made
 *  `action` node. See components/ui/empty-actions.tsx. */
export function EmptyState({ icon, title, text, action, primary, secondary, perm, onClearFilters }: { icon?: React.ReactNode; title: string; text?: React.ReactNode; action?: React.ReactNode } & EmptyActionProps) {
  const t = title.trim();
  const structured = hasEmptyActions({ primary, secondary, onClearFilters });
  return (
    <div className="k-empty">
      {icon && <IconTile size={36}>{icon}</IconTile>}
      <p className="k-empty-line">
        <span className="k-empty-title">{t}</span>
        {text ? <>{/[.!?…]$/.test(t) ? ' ' : '. '}<span className="k-empty-text">{text}</span></> : null}
      </p>
      {(action || structured) && (
        <div className="k-empty-act">
          {structured && <EmptyActions primary={primary} secondary={secondary} perm={perm} onClearFilters={onClearFilters} />}
          {action}
        </div>
      )}
    </div>
  );
}

// ─── Fields ──────────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  error,
  required,
  span,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  /** Take the full row of a FormGrid. */
  span?: boolean;
  children: React.ReactNode;
}) {
  // A <div> wrapper with a real <label htmlFor>: wrapping everything in a
  // <label> would pull the hint/error under the global label rule.
  const autoId = React.useId();
  const child = React.isValidElement<{ id?: string }>(children) ? children : null;
  const id = child?.props.id ?? autoId;
  return (
    <div className={cx('k-field', span && 'k-span-all')}>
      <label className="k-label" htmlFor={child ? id : undefined}>
        {label}
        {required && <span className="k-req">*</span>}
      </label>
      {child ? React.cloneElement(child, { id }) : children}
      {error ? <span className="k-error" role="alert">{error}</span> : hint ? <span className="k-hint">{hint}</span> : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...p }, ref) {
    return <input ref={ref} className={cx('k-input', className)} {...p} />;
  },
);

export function DateInput(p: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <Input type="date" {...p} />;
}

export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('k-textarea', className)} {...p} />;
}

export function Select({
  options,
  placeholder,
  className,
  ...p
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: (string | { value: string; label: string })[];
  placeholder?: string;
}) {
  return (
    <select className={cx('k-select', className)} {...p}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        return <option key={opt.value} value={opt.value}>{opt.label}</option>;
      })}
    </select>
  );
}

/** Responsive form grid: `cols` columns on desktop, one on phones. */
export function FormGrid({ cols = 2, children }: { cols?: 1 | 2 | 3 | 4; children: React.ReactNode }) {
  return <div className="k-form-grid" style={{ ['--k-cols' as string]: cols }}>{children}</div>;
}

export function FormSection({ children }: { children: React.ReactNode }) {
  return <div className="k-form-section">{children}</div>;
}

// ─── FormModal ───────────────────────────────────────────────────────────────

/** "Task Name: Fill out this field." — the field's own label, then the browser's reason. */
function describeInvalid(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  const label = (el.labels?.[0]?.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || '')
    .replace(/\*\s*$/, '').trim();
  const why = el.validationMessage || 'Check this field.';
  return label ? `${label}: ${why}` : why;
}

export function FormModal({
  open,
  onClose,
  title,
  subtitle,
  size = 'lg',
  children,
  onSubmit,
  submitLabel = 'Save',
  busy,
  error,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** lg = min(1040px,94vw) — every form. sm = confirmations only. */
  size?: 'lg' | 'sm';
  children: React.ReactNode;
  /** When given, the body is a <form> and the footer gets Cancel + submit. */
  onSubmit?: () => void | Promise<void>;
  submitLabel?: string;
  busy?: boolean;
  error?: string | null;
  /** Replaces the default footer entirely. */
  footer?: React.ReactNode;
}) {
  const titleId = React.useId();
  /* The browser's own constraint check (required, min/max, type=email…) stops
     a submit before onSubmit runs, and its bubble is easy to miss — on a phone
     the tap just looked dead. The first invalid field is named here instead,
     beside the submit button, and the browser still focuses it. */
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const [nativeErr, setNativeErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    const f = formRef.current;
    if (!open) { setNativeErr(null); return; }
    if (!f) return;
    let reported = false;
    const onInvalid = (e: Event) => {
      if (reported) return; // one submit fires `invalid` on every bad field — name the first
      reported = true;
      // A task, not a microtask: microtasks run between the browser's per-field
      // `invalid` dispatches, which would let the last bad field win.
      window.setTimeout(() => { reported = false; }, 0);
      setNativeErr(describeInvalid(e.target as HTMLInputElement));
    };
    const onEdit = () => setNativeErr(null);
    f.addEventListener('invalid', onInvalid, true);
    f.addEventListener('input', onEdit);
    f.addEventListener('change', onEdit);
    return () => {
      f.removeEventListener('invalid', onInvalid, true);
      f.removeEventListener('input', onEdit);
      f.removeEventListener('change', onEdit);
    };
  }, [open, !!onSubmit]); // eslint-disable-line react-hooks/exhaustive-deps -- re-bind when the <form> mounts, not on every new onSubmit closure

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  const shownErr = error || nativeErr;
  const foot = footer ?? (onSubmit ? (
    <>
      {/* role="alert": a blocked save is announced, not just painted red. */}
      {shownErr && <span className="k-error" role="alert" style={{ marginRight: 'auto', alignSelf: 'center' }}>{shownErr}</span>}
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>
    </>
  ) : null);

  const body = (
    <>
      <div className="k-modal-body">{children}</div>
      {foot && <div className="k-modal-foot">{foot}</div>}
    </>
  );

  return (
    <div className="k-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="k-modal" data-size={size} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="k-modal-head">
          <div style={{ minWidth: 0 }}>
            <div className="k-modal-title" id={titleId}>{title}</div>
            {subtitle && <div className="k-card-sub">{subtitle}</div>}
          </div>
          <Button variant="ghost" size="sm" icon={<X size={16} />} aria-label="Close" onClick={onClose} disabled={busy} />
        </div>
        {onSubmit ? (
          <form method="post"
            ref={formRef}
            style={{ display: 'contents' }}
            onSubmit={(e) => { e.preventDefault(); setNativeErr(null); void onSubmit(); }}
          >
            {body}
          </form>
        ) : body}
      </div>
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

/** One-line confirmation, bottom-center. Pair with useToast(). */
export function Toast({ message, tone = 'good' }: { message: string | null; tone?: 'good' | 'bad' }) {
  if (!message) return null;
  return <div className="k-toast" data-tone={tone} role="status">{message}</div>;
}

export function useToast(ms = 2800) {
  const [toast, setToast] = React.useState<{ message: string; tone: 'good' | 'bad' } | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = React.useCallback((message: string, tone: 'good' | 'bad' = 'good') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, tone });
    timer.current = setTimeout(() => setToast(null), ms);
  }, [ms]);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { toast, show };
}

// ─── Avatar / CompanyMark ────────────────────────────────────────────────────
/**
 * A person's face: their photo when there is one, otherwise their initials on
 * a tint of a deterministic accent token (same name → same color everywhere).
 * `mark` overrides the initials (e.g. a role mark like "GC").
 */
export function Avatar({ name, src, size = 32, mark, tone, shape = 'round', title }: {
  name?: string | null; src?: string | null; size?: number; mark?: string; tone?: string; shape?: 'round' | 'tile'; title?: string;
}) {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => { setBroken(false); }, [src]);
  const label = String(name || '').trim();
  const text = mark || initialsOf(label) || '?';
  const style = { ['--face' as string]: `${size}px`, ['--mono' as string]: tone || monoToken(label || text) } as React.CSSProperties;
  return (
    <span className="k-face" data-shape={shape} style={style} title={title ?? (label || undefined)} aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label || undefined}>
      {src && !broken
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
        : text}
    </span>
  );
}

/** A company's logo when it has one, else a monogram tile in its own token color. */
export function CompanyMark({ name, logoUrl, size = 40 }: { name?: string | null; logoUrl?: string | null; size?: number }) {
  return <Avatar name={name} src={logoUrl} size={size} shape="tile" />;
}
