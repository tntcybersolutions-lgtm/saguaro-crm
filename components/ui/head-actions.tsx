'use client';

/**
 * A page header's actions. Desktop: unchanged — every action in one row on the
 * right. Phone: the ONE primary action stays a button and everything else
 * folds into a "⋯" menu beside it, instead of two or three full-size buttons
 * stacked over the content.
 *
 * Used by PageShell (kit) and ModuleHero (premium). The actions are rendered
 * once: on a phone the secondary ones sit in a dropdown panel (hidden until
 * opened), so a hidden file input or a ref inside them keeps working.
 *
 * Styles: `.k-hacts*` in app/globals.css.
 */

import React from 'react';
import { DotsThree } from '@phosphor-icons/react';

function flatten(node: React.ReactNode): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  React.Children.forEach(node, (c) => {
    if (c == null || typeof c === 'boolean' || c === '') return;
    if (React.isValidElement(c) && c.type === React.Fragment) out.push(...flatten((c.props as { children?: React.ReactNode }).children));
    else out.push(c);
  });
  return out;
}

type AnyProps = { variant?: string; className?: string; style?: React.CSSProperties; children?: React.ReactNode; 'data-primary'?: unknown };

/** The screen's one yellow action: kit `variant="primary"`, the gold button
 *  class or style, `GoldButton`, or a link wrapping one of those. */
function isPrimary(node: React.ReactNode, depth = 0): boolean {
  if (!React.isValidElement(node)) return false;
  const p = node.props as AnyProps;
  const t = node.type as { displayName?: string };
  if (p['data-primary'] != null || p.variant === 'primary' || t.displayName === 'GoldButton') return true;
  if (typeof p.className === 'string' && /\b(k-btn-primary|pmGold)\b/.test(p.className)) return true;
  const bg = p.style ? String(p.style.background ?? p.style.backgroundColor ?? '') : '';
  if (/--brand-primary\)|--gold\)/.test(bg)) return true;
  if (depth < 1) {
    const kids = flatten(p.children);
    if (kids.length === 1) return isPrimary(kids[0], depth + 1);
  }
  return false;
}

export function HeadActions({ className, children }: { className: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = React.Children.toArray(flatten(children));
  if (items.length < 2) return <div className={className}>{children}</div>;
  const found = items.findIndex((n) => isPrimary(n));
  const pi = found >= 0 ? found : 0;
  const primary = items[pi];
  const rest = items.filter((_, i) => i !== pi);
  const restBlock = (
    <div
      className="k-hacts-rest"
      role="group"
      aria-label="More actions"
      // Hide the panel after the tap has done its job (a file picker opened
      // from it still gets its change event — the panel is hidden, not removed).
      onClick={() => { if (open) window.setTimeout(() => setOpen(false), 0); }}
    >
      {rest}
    </div>
  );
  return (
    <div className={`${className} k-hacts`} ref={ref} data-open={open ? 'true' : undefined}>
      {pi === 0 && primary}
      {restBlock}
      {pi !== 0 && primary}
      <button
        type="button"
        className="k-hacts-more"
        aria-label="More actions"
        title="More actions"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <DotsThree size={20} weight="bold" aria-hidden />
      </button>
    </div>
  );
}
