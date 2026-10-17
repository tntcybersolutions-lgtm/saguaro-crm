/**
 * Label / value facts with the empty ones left out.
 *
 * A record's details rail should list what is known, not a column of "—"
 * rows for every field nobody filled in. `filledFacts` drops a row whose value
 * is null, blank, a lone dash, or a React element that only wraps one of
 * those; `Facts` is `DetailList` fed through it.
 */
import React from 'react';
import { DetailList } from '@/components/ui/kit';

export type Fact = [string, React.ReactNode];

const EMPTY_TEXT = /^\s*(—|-|–|n\/a|null|undefined)?\s*$/i;

function isBlank(v: React.ReactNode): boolean {
  if (v == null || v === false) return true;
  if (typeof v === 'string') return EMPTY_TEXT.test(v);
  if (typeof v === 'number') return false;
  if (React.isValidElement(v)) {
    const kids = (v.props as { children?: React.ReactNode }).children;
    if (kids === undefined) return false; // an element with no text child (an icon, a link) is a value
    return typeof kids === 'string' ? EMPTY_TEXT.test(kids) : kids == null;
  }
  return false;
}

export function filledFacts(rows: Fact[]): Fact[] {
  return rows.filter(([, v]) => !isBlank(v));
}

export function Facts({ items }: { items: Fact[] }) {
  const rows = filledFacts(items);
  return rows.length ? <DetailList items={rows} /> : null;
}
