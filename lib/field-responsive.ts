/**
 * Saguaro Field — Responsive Design Utilities
 *
 * Shared style constants and helpers for consistent responsive behavior
 * across all field app pages. Import as: import { FR } from '@/lib/field-responsive';
 */
import { F } from '@/lib/field-tokens';

export const FR = {
  /** Max container width matching layout.tsx */
  maxWidth: 640,

  /** Standard card style */
  card: {
    background: F.raised,
    border: `1px solid ${F.border}`,
    borderRadius: F.radius,
    padding: '14px',
    boxShadow: F.shadowCard,
  } as React.CSSProperties,

  /** Standard input style (prevents iOS auto-zoom at 16px) */
  input: {
    width: '100%',
    background: F.surface,
    border: `1px solid ${F.border}`,
    borderRadius: F.radiusSm,
    padding: '11px 14px',
    color: F.text,
    fontSize: 16, // 16px prevents iOS auto-zoom
    outline: 'none',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  /** Standard select style */
  select: {
    width: '100%',
    background: F.surface,
    border: `1px solid ${F.border}`,
    borderRadius: F.radiusSm,
    padding: '11px 14px',
    color: F.text,
    fontSize: 16,
    outline: 'none',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  /** Standard button — primary (gold) */
  btnPrimary: {
    width: '100%',
    background: F.gold,
    border: 'none',
    borderRadius: F.radiusSm,
    padding: '14px',
    color: '#000',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
    letterSpacing: 0.3,
  } as React.CSSProperties,

  /** Standard button — secondary (outline) */
  btnSecondary: {
    width: '100%',
    background: 'transparent',
    border: `1px solid ${F.border}`,
    borderRadius: F.radiusSm,
    padding: '12px',
    color: F.dim,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,

  /** Image containment — prevents overflow */
  img: {
    maxWidth: '100%',
    height: 'auto',
    borderRadius: F.radiusSm,
    display: 'block',
  } as React.CSSProperties,

  /** Table scroll wrapper — horizontal scroll without page scroll */
  tableWrap: {
    overflowX: 'auto' as const,
    WebkitOverflowScrolling: 'touch' as const,
    borderRadius: F.radiusSm,
    maxWidth: '100%',
  } as React.CSSProperties,

  /** Section label */
  sectionLabel: {
    margin: '0 0 10px',
    fontSize: F.fontXs,
    color: F.dim,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  } as React.CSSProperties,

  /** Back button */
  backBtn: {
    background: 'none',
    border: 'none',
    color: F.dim,
    cursor: 'pointer',
    padding: 8,
    display: 'flex',
    alignItems: 'center',
    marginLeft: -8,
    marginBottom: 4,
  } as React.CSSProperties,

  /** Page container with standard padding */
  page: {
    padding: '14px 16px',
    paddingBottom: 80, // space for bottom nav
  } as React.CSSProperties,
} as const;
