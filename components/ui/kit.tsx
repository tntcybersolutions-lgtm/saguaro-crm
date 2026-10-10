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
import { CaretRight, DotsThree, MagnifyingGlass, X, Tray } from '@phosphor-icons/react';
import { useSortedRows, type SortState, type SortDir } from './premium';
import { SortBar } from './sort';
import { STATUS_COLORS, type StatusKind } from '@/lib/status-colors';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ─── PageShell ───────────────────────────────────────────────────────────────

export type Crumb = { label: string; href?: string };

export function PageShell({
  title,
  subtitle,
  actions,
  crumbs,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right side of the header. Exactly one `variant="primary"` button per page. */
  actions?: React.ReactNode;
  crumbs?: Crumb[];
  children: React.ReactNode;
}) {
  return (
    <div className="k-page">
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
          <h1 className="k-title">{title}</h1>
          {subtitle && <p className="k-sub">{subtitle}</p>}
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
  actions,
  flush,
  children,
  style,
}: {
  title?: React.ReactNode;
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
          <div style={{ minWidth: 0 }}>
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

// ─── StatTile / StatRow ──────────────────────────────────────────────────────

export type StatItem = {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Colors the value only — never the tile. */
  tone?: 'default' | 'good' | 'warn' | 'bad';
  href?: string;
  onClick?: () => void;
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

export function StatTile({ label, value, sub, tone = 'default', href, onClick, icon }: StatItem) {
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
  if (onClick) return <button type="button" className="k-stat" data-tone={tone} onClick={onClick}>{inner}</button>;
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

const BADGE_NEUTRAL = { color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.18)' };
const BADGE_GOLD = { color: 'var(--brand-primary)', bg: 'var(--brand-primary-12)', border: 'var(--brand-primary-35)' };

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
export function Menu({ actions, label = 'More actions' }: { actions: Action[]; label?: string }) {
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
      <Button variant="ghost" size="sm" icon={<DotsThree size={18} weight="bold" />} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle} />
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
};

const valueOf = <T,>(col: Column<T>, row: T): unknown =>
  col.accessor ? col.accessor(row) : (row as Record<string, unknown> | null | undefined)?.[col.key];

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
}) {
  const [sort, setSort] = React.useState<SortState>(defaultSort ?? null);
  const byKey = React.useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const getValue = React.useCallback((row: T, key: string) => {
    const col = byKey.get(key);
    return col ? valueOf(col, row) : undefined;
  }, [byKey]);
  const sorted = useSortedRows(rows, sort, getValue);

  const cycle = (key: string) =>
    setSort((p) => (!p || p.key !== key ? { key, dir: 'asc' } : p.dir === 'asc' ? { key, dir: 'desc' } : null));

  const colCount = columns.length + (rowActions ? 1 : 0);
  // Phones hide the header row (rows become cards), so the sort lives in a
  // control above the list there. Desktop keeps the clickable headers.
  const sortCols = columns.filter((c) => c.sortable !== false && typeof c.header === 'string').map((c) => ({ key: c.key, label: c.header as string }));

  return (
    <div className="k-table-wrap">
      <SortBar columns={sortCols} sort={sort} onChange={setSort} />
      <table className="k-table">
        <thead>
          <tr>
            {columns.map((c) => {
              const sortable = c.sortable !== false;
              const dir = sort?.key === c.key ? sort.dir : null;
              return (
                <th
                  key={c.key}
                  data-sortable={sortable}
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                  onClick={sortable ? () => cycle(c.key) : undefined}
                  style={{ textAlign: c.align, width: c.width }}
                >
                  {c.header}
                  {dir && <span aria-hidden style={{ marginLeft: 4 }}>{dir === 'asc' ? '▲' : '▼'}</span>}
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
              <td className="k-table-empty" colSpan={colCount}>{empty ?? 'Nothing here yet.'}</td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr key={rowKey(row)} style={rowStyle?.(row)} data-clickable={!!onRowClick} data-selected={isSelected?.(row) ? 'true' : undefined} aria-selected={isSelected ? !!isSelected(row) : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {columns.map((c, ci) => {
                  const v = valueOf(c, row);
                  const phone = c.phone ?? (ci < 4 ? 'show' : 'hide');
                  return (
                    <td key={c.key} className={c.primary ? 'k-td-primary' : undefined} style={{ textAlign: c.align }} data-label={typeof c.header === 'string' ? c.header : undefined} data-phone={phone}>
                      {c.render ? c.render(row) : v == null || v === '' ? '—' : String(v)}
                    </td>
                  );
                })}
                {rowActions && (
                  <td className="k-td-actions">
                    <RowActions actions={rowActions(row)} />
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── DetailList ──────────────────────────────────────────────────────────────

/** Label / value rows for a record's details panel. Empty values show "—". */
export function DetailList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="k-dl">
      {items.map(([k, v]) => (
        <div key={k} className="k-dl-row">
          <dt>{k}</dt>
          <dd>{v == null || v === '' ? '—' : v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="k-empty">
      <div className="k-empty-icon">{icon ?? <Tray size={22} />}</div>
      <div className="k-empty-title">{title}</div>
      {text && <div className="k-empty-text">{text}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
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

  const foot = footer ?? (onSubmit ? (
    <>
      {/* role="alert": a blocked save is announced, not just painted red. */}
      {error && <span className="k-error" role="alert" style={{ marginRight: 'auto', alignSelf: 'center' }}>{error}</span>}
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
          <form
            style={{ display: 'contents' }}
            onSubmit={(e) => { e.preventDefault(); void onSubmit(); }}
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
