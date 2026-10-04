'use client';

/**
 * ProjectNav — compact project navigation. Seven destinations, neutral dark
 * pills, the selected one yellow. It is NAVIGATION: it never says how far the
 * job is (that is NextAction's job), so no step numbers, no done/undone tints.
 *
 * Overflow is deliberate: destinations that do not fit the row move into a
 * "More" menu instead of clipping the last tab. Measured with a
 * ResizeObserver; on a phone the row also scrolls.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CaretDown, List } from '@phosphor-icons/react';
import { PROJECT_PHASES, phaseForPath } from '@/lib/project-nav';

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function ProjectNav({ projectId, onOpenModules }: { projectId: string; onOpenModules?: () => void }) {
  const pathname = usePathname() || '';
  const base = `/app/projects/${projectId}`;
  const rel = pathname.startsWith(base) ? pathname.slice(base.length) : '';
  const activeKey = rel === '' || rel === '/' || rel.startsWith('/overview') ? 'overview' : phaseForPath(rel);

  const rowRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [visible, setVisible] = useState<number>(PROJECT_PHASES.length);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // How many pills fit beside the More button. Phones (< 768) scroll instead.
  useIso(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      if (window.matchMedia('(max-width: 767px)').matches) { setVisible(PROJECT_PHASES.length); return; }
      const avail = row.clientWidth - 96; // room for "More"
      let used = 0; let n = 0;
      for (let i = 0; i < PROJECT_PHASES.length; i++) {
        const el = itemRefs.current[i];
        // Each pill's natural width, cached once it has really been laid out.
        // A zero (measured before fonts/layout) must not be cached — that is
        // how the row once claimed every pill fit and clipped the last one.
        const cached = el?.dataset.w ? Number(el.dataset.w) : 0;
        const w = cached > 0 ? cached : (el?.offsetWidth || 0);
        if (el && !cached && w > 0) el.dataset.w = String(w);
        if (w === 0) { n = PROJECT_PHASES.length; break; } // not laid out yet — show all, re-measure on the next resize
        if (used + w + 6 > avail) break;
        used += w + 6; n++;
      }
      setVisible(Math.max(1, n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    // Belt and braces: a window resize also re-measures (ResizeObserver
    // callbacks are not delivered while a tab is throttled in the background).
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const hidden = PROJECT_PHASES.slice(visible);
  const activeHidden = hidden.some((p) => p.key === activeKey);

  return (
    <nav className="pj-nav" aria-label="Project sections">
      {onOpenModules && (
        <button type="button" className="pj-nav-modules" onClick={onOpenModules} aria-label="Open project modules">
          <List size={16} weight="bold" /> <span>Modules</span>
        </button>
      )}
      <div className="pj-nav-row" ref={rowRef}>
        {PROJECT_PHASES.map((ph, i) => {
          const Icon = ph.icon;
          const active = ph.key === activeKey;
          const href = base + (ph.key === 'overview' ? '/overview' : ph.href);
          return (
            <Link
              key={ph.key}
              ref={(el) => { itemRefs.current[i] = el; }}
              href={href}
              className="pj-nav-item"
              data-active={active ? 'true' : undefined}
              data-overflow={i >= visible ? 'true' : undefined}
              aria-current={active ? 'page' : undefined}
              title={ph.tagline}
            >
              <Icon size={15} weight={active ? 'fill' : 'bold'} />
              <span>{ph.label}</span>
            </Link>
          );
        })}
      </div>
      {hidden.length > 0 && (
        <div className="pj-nav-more" ref={menuRef}>
          <button type="button" className="pj-nav-item pj-nav-morebtn" data-active={activeHidden ? 'true' : undefined} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <span>More</span> <CaretDown size={13} weight="bold" />
          </button>
          {open && (
            <div className="k-menu-list pj-nav-menu" role="menu">
              {hidden.map((ph) => {
                const Icon = ph.icon;
                return (
                  <Link key={ph.key} role="menuitem" href={base + ph.href} className="k-menu-item" data-active={ph.key === activeKey ? 'true' : undefined} onClick={() => setOpen(false)}>
                    <Icon size={15} weight="bold" /> {ph.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
