'use client';

/**
 * A figure that never ends in "…".
 *
 * Money in a summary strip ("$2,539,650.00") is too wide for a phone strip of
 * four, and cutting it to "$2,539,650…" hides the one part that matters. On a
 * phone a large amount reads short instead ("$2.54M"); the exact value is the
 * title (hover / long-press) and a tap on the figure shows it in full. Desktop
 * always shows the exact value. Anything that is not a dollar amount passes
 * through untouched.
 *
 * Styles: `.k-fig*` in app/globals.css.
 */

import React from 'react';

const MONEY = /^\s*(\()?\s*([-+])?\s*\$\s*(-)?\s*([\d,]+(?:\.\d+)?)\s*(\))?\s*$/;

/** "$2,539,650.00" → "$2.54M"; null when the text is not a dollar amount or is already short. */
export function shortMoney(text: string): string | null {
  const m = MONEY.exec(text);
  if (!m) return null;
  const n = Number(m[4].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const neg = m[2] === '-' || !!m[3] || !!(m[1] && m[5]);
  const plus = m[2] === '+';
  // Short enough already: "$-2,150.00", "$48,200".
  if (n < 10_000 || text.trim().length <= 9) return null;
  // 999,999 rounds to "1000K" — read it as the next unit up.
  const r = n >= 999_500_000 ? Math.max(n, 1e9) : n >= 999_500 ? Math.max(n, 1e6) : n;
  const [div, unit] = r >= 1e9 ? [1e9, 'B'] : r >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
  const v = n / div;
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  const s = v.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  return `${neg ? '-' : plus ? '+' : ''}$${s}${unit}`;
}

function textOf(v: React.ReactNode): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return null; // a bare count, never money
  return null;
}

/** The value of a stat. Wraps a long dollar amount so a phone shows it short. */
export function Figure({ value }: { value: React.ReactNode }) {
  const [full, setFull] = React.useState(false);
  // A value element that only wraps the amount (<span style>…</span>) keeps its element.
  if (React.isValidElement(value)) {
    const kids = (value.props as { children?: React.ReactNode }).children;
    const t = textOf(kids);
    if (t && shortMoney(t)) return React.cloneElement(value as React.ReactElement<{ children?: React.ReactNode }>, undefined, <Figure value={t} />);
    return <>{value}</>;
  }
  const text = textOf(value);
  const short = text ? shortMoney(text) : null;
  if (!text || !short) return <>{value}</>;
  return (
    <span className="k-fig" title={text} data-full={full ? 'true' : undefined} onClick={() => setFull((f) => !f)}>
      <span className="k-fig-full">{text}</span>
      <span className="k-fig-short" aria-hidden>{short}</span>
    </span>
  );
}
