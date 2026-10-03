'use client';

/**
 * StandardSelect — THE canonical dropdown for every module (module anatomy §1.2).
 *
 * One machined face for all 200+ native selects in the app: dark surface,
 * hairline border, radius 9, 13px type — matching the premium kit — so pages
 * never need a per-page SEL style const again. Stays a NATIVE <select>
 * (keyboard navigation, screen readers, mobile pickers all free); the global
 * stylesheet supplies the brand chevron and focus ring.
 *
 * Options accept flat lists, grouped lists, or a mix:
 *   - 'Electrical'                                  (string)
 *   - { value: 'e', label: 'Electrical', count: 4 } (count renders "(4)")
 *   - { group: 'Div 26 — Electrical', options: [...] }
 * Taxonomy helpers in lib/taxonomy.ts (tradeOptions(), verticalOptions(),
 * sectorOptions(), csiDivisionOptions()) plug straight in.
 *
 * A current value missing from the options list still renders as a temporary
 * option (list-derived option sets usually arrive after the first fetch), and
 * an optional accent hex retints the chevron + focus ring for module accents.
 */

import React from 'react';
import type { SelectGroup, SelectOption } from '@/lib/taxonomy';

export type StandardOption = string | SelectOption;

export interface StandardOptionGroup {
  group: string;
  options: StandardOption[];
}

export type StandardSelectOptions = ReadonlyArray<StandardOption | StandardOptionGroup>;

const isGroup = (o: StandardOption | StandardOptionGroup): o is StandardOptionGroup =>
  typeof o === 'object' && o !== null && 'group' in o && Array.isArray((o as StandardOptionGroup).options);

const optValue = (o: StandardOption) => (typeof o === 'string' ? o : o.value);
const optLabel = (o: StandardOption) =>
  typeof o === 'string' ? o : o.count != null ? `${o.label} (${o.count})` : o.label;

const SURFACE = '#15171C'; // solid: the OS option list cannot show glass
const HAIRLINE = '1px solid rgba(255,255,255,0.12)';
const WHITE = '#FFFFFF';
const MUTED = '#A9B4C4';

const SIZES = {
  md: { padding: '9px 12px', fontSize: 13 },
  sm: { padding: '6px 10px', fontSize: 12.5 },
} as const;

/** #RRGGBB (or #RGB) -> rgba(...) at the given alpha; passthrough on anything else. */
function hexAlpha(hex: string, alpha: number): string {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (full.length !== 6 || Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export interface StandardSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** Flat options, grouped options, or a mix — strings or {value,label,count?}. */
  options: StandardSelectOptions;
  /** Rendered as the first option (e.g. "All Trades", "Select a project…"). */
  placeholder?: string;
  /** The value the placeholder option carries (default ''). */
  placeholderValue?: string;
  size?: 'md' | 'sm';
  /** Module accent hex — retints the chevron and focus ring (default brand gold). */
  accent?: string;
  /** Shorthand for style.width. */
  width?: number | string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  ariaLabel?: string;
  title?: string;
  className?: string;
  /** Merged last — page-level overrides win (maxWidth, pill styling, etc.). */
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLSelectElement>;
}

export function StandardSelect({
  value,
  onChange,
  options,
  placeholder,
  placeholderValue,
  size = 'md',
  accent,
  width,
  disabled,
  required,
  id,
  name,
  ariaLabel,
  title,
  className,
  style,
  onClick,
}: StandardSelectProps) {
  const ref = React.useRef<HTMLSelectElement>(null);
  const phVal = placeholderValue ?? '';

  // Accent chevron: the global stylesheet paints the brand-gold chevron with
  // !important, so an accent retint must also be set at !important priority.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!accent) {
      el.style.removeProperty('background-image');
      return;
    }
    const svg = `url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='${encodeURIComponent(accent)}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
    el.style.setProperty('background-image', svg, 'important');
  }, [accent]);

  const flat = React.useMemo(
    () => options.flatMap((o) => (isGroup(o) ? o.options : [o])),
    [options]
  );
  const known = flat.some((o) => optValue(o) === value);
  const showUnknown = !known && value !== phVal && value !== '';
  const isPlaceholder = placeholder != null && value === phVal;

  // Accent focus ring: the global :focus rule reads these custom properties,
  // so redefining them on the element retints the ring without new CSS.
  const accentVars = accent
    ? ({ '--gold-ring': accent, '--brand-primary-12': hexAlpha(accent, 0.12) } as React.CSSProperties)
    : undefined;

  const dims = SIZES[size];
  const base: React.CSSProperties = {
    padding: dims.padding,
    background: SURFACE,
    border: HAIRLINE,
    borderRadius: 9,
    color: isPlaceholder ? MUTED : WHITE,
    fontSize: dims.fontSize,
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    boxSizing: 'border-box',
    ...(width != null ? { width } : {}),
    ...accentVars,
    ...style,
  };

  const optionStyle: React.CSSProperties = { background: SURFACE, color: WHITE };

  return (
    <select
      ref={ref}
      id={id}
      name={name}
      title={title}
      aria-label={ariaLabel}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={onClick}
      disabled={disabled}
      required={required}
      style={base}
    >
      {placeholder != null && <option value={phVal} style={optionStyle}>{placeholder}</option>}
      {showUnknown && <option value={value} style={optionStyle}>{value}</option>}
      {options.map((o) =>
        isGroup(o) ? (
          <optgroup key={`g:${o.group}`} label={o.group}>
            {o.options.map((so) => (
              <option key={optValue(so)} value={optValue(so)} style={optionStyle}>{optLabel(so)}</option>
            ))}
          </optgroup>
        ) : (
          <option key={optValue(o)} value={optValue(o)} style={optionStyle}>{optLabel(o)}</option>
        )
      )}
    </select>
  );
}

export type { SelectGroup, SelectOption };
export default StandardSelect;
