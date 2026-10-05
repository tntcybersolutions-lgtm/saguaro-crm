'use client';

/**
 * TableLabels — gives every hand-rolled `.k-table` its phone card labels.
 *
 * DataTable writes `data-label` on each cell so the phone card CSS can print
 * the column name beside the value. The fifty raw tables that were promoted to
 * `.k-table` by class alone have no such attribute, so on a phone their cards
 * showed bare values. This mounts once in the app shell, reads each table's
 * header row and stamps the labels on, and keeps doing so as tables render,
 * re-render or paginate (MutationObserver, batched per animation frame).
 * Nothing changes on desktop; the attribute is only read by the phone CSS.
 */

import { useEffect } from 'react';

function label(th: HTMLTableCellElement): string {
  const aria = th.getAttribute('aria-label');
  const text = (th.innerText || th.textContent || '').replace(/[▲▼↕]/g, '').trim();
  return text || aria || '';
}

export function stampTableLabels(root: ParentNode = document) {
  const tables = root.querySelectorAll<HTMLTableElement>('table.k-table');
  tables.forEach((table) => {
    const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>(':scope > thead th'));
    if (ths.length === 0) return;
    const labels = ths.map(label);
    const rows = table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr');
    rows.forEach((tr) => {
      let col = 0;
      Array.from(tr.children).forEach((cell) => {
        if (!(cell instanceof HTMLTableCellElement)) return;
        const span = cell.colSpan || 1;
        if (!cell.hasAttribute('data-label') && span === 1) {
          const l = labels[col];
          if (l) cell.setAttribute('data-label', l);
        }
        col += span;
      });
    });
  });
}

export default function TableLabels() {
  useEffect(() => {
    // A timer, not requestAnimationFrame: frames never fire while a tab is
    // hidden or background-throttled, and the labels must be there the
    // moment the tab is shown.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => { timer = null; stampTableLabels(); };
    const schedule = () => { if (!timer) timer = setTimeout(run, 0); };
    stampTableLabels();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); if (timer) clearTimeout(timer); };
  }, []);
  return null;
}
