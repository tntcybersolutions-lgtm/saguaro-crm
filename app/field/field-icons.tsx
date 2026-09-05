import React from 'react';
import { F } from '@/lib/field-tokens';

/* Field page icons.
 *
 * Referenced by app/field/budget and app/field/daily-log, which imported
 * '../field-icons' when no such module existed — that broke `next build`
 * outright. Inline SVG rather than an icon package: no new dependency, and
 * the stroke weight can follow the requested variant.
 *
 *   scopedFieldIcon('dailyLog', 'ph')
 *
 * Unknown names fall back to a neutral glyph so a typo degrades to a plain
 * icon instead of a crash.
 */

export type FieldIconVariant = 'ph' | 'bold' | 'fill';

const PATHS: Record<string, React.ReactNode> = {
  dashboard: <><rect x={3} y={3} width={7} height={9} rx={1.5} /><rect x={14} y={3} width={7} height={5} rx={1.5} /><rect x={14} y={12} width={7} height={9} rx={1.5} /><rect x={3} y={16} width={7} height={5} rx={1.5} /></>,
  dailyLog:  <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1={8} y1={13} x2={16} y2={13} /><line x1={8} y1={17} x2={13} y2={17} /></>,
  budget:    <><line x1={12} y1={1} x2={12} y2={23} /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  photos:    <><rect x={3} y={5} width={18} height={15} rx={2} /><circle cx={12} cy={12} r={3.5} /><path d="M8 5l1.5-2h5L16 5" /></>,
  schedule:  <><rect x={3} y={4} width={18} height={17} rx={2} /><line x1={3} y1={9} x2={21} y2={9} /><line x1={8} y1={2} x2={8} y2={6} /><line x1={16} y1={2} x2={16} y2={6} /></>,
  crew:      <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx={9} cy={7} r={4} /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></>,
  safety:    <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></>,
  clock:     <><circle cx={12} cy={12} r={9} /><polyline points="12 7 12 12 15.5 14" /></>,
  docs:      <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
};

const FALLBACK = <><circle cx={12} cy={12} r={9} /><line x1={12} y1={8} x2={12} y2={12} /><line x1={12} y1={16} x2={12.01} y2={16} /></>;

export function scopedFieldIcon(
  name: string,
  variant: FieldIconVariant = 'ph',
  size = 20,
  color: string = F.gold,
): React.ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={variant === 'bold' ? 2.2 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name] ?? FALLBACK}
    </svg>
  );
}

export default scopedFieldIcon;
