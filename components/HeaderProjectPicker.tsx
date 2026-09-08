'use client';

/**
 * The job you are in, in the header, on every screen.
 *
 * Before this, the only clue about which job you were looking at was a
 * breadcrumb that said "Project" — the literal word — and changing jobs meant
 * going back to the list and clicking in again. There was a switcher, but it
 * only opened on a keyboard shortcut almost nobody finds.
 *
 * The part that makes this worth having, and the reason Procore's works: it
 * KEEPS YOUR PLACE. On the pay applications for one job and you want the pay
 * applications for another, you get pay applications — not that job's
 * overview. Comparing the same screen across two jobs is most of what a GC
 * does with a project list, and making them re-navigate every time is what
 * turns a two-second question into a thirty-second one.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CaretUpDown, MagnifyingGlass, Buildings, Check } from '@phosphor-icons/react';
import { useProjects } from '@/lib/hooks/useProjects';

const GOLD = '#F59E0B';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = 'rgba(255,255,255,0.12)';
const PANEL = '#12161C';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Proj { id: string; name?: string; project_name?: string; title?: string; status?: string; project_number?: string }

const nameOf = (p: Proj) => p.name || p.project_name || p.title || 'Untitled project';

/**
 * Which project is on screen, and which sub-page of it.
 *
 *   /app/projects/<id>/pay-apps/new  ->  { id, tail: 'pay-apps/new' }
 *
 * The tail is what gets carried across when you switch jobs.
 */
function readPath(pathname: string): { id: string | null; tail: string } {
  const seg = pathname.split('/').filter(Boolean);
  const i = seg.indexOf('projects');
  if (i < 0 || !seg[i + 1] || !UUID_RE.test(seg[i + 1])) return { id: null, tail: '' };
  return { id: seg[i + 1], tail: seg.slice(i + 2).join('/') };
}

export default function HeaderProjectPicker() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { projects } = useProjects();
  const list = (projects as Proj[]) ?? [];

  const { id: currentId, tail } = readPath(pathname);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  /**
   * The name of the job we are in, even when it is not in the header's list.
   *
   * useProjects caps at fifteen for the shell, so a GC with more than that
   * could open the sixteenth job and see the breadcrumb read "Project" — the
   * one crumb whose whole purpose is telling you where you are.
   */
  const [fetchedName, setFetchedName] = useState<string | null>(null);
  useEffect(() => {
    setFetchedName(null);
    if (!currentId) return;
    if (list.some((p) => p.id === currentId)) return;
    let cancelled = false;
    /* Same reasoning as the fetcher in useProjects: send the bearer token as
       well as the cookie, so the crumb resolves as the same identity the page
       body is using. Asking as somebody else returns 404 and the crumb silently
       falls back to "Choose a job" — the one crumb whose whole purpose is
       telling you where you are. */
    import('@/lib/supabase-browser')
      .then(({ getAuthHeaders }) => getAuthHeaders())
      .then((headers) => fetch(`/api/projects/${currentId}?fields=id,name`, { headers, credentials: 'include' }))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const p = d.project ?? d;
        if (p?.name || p?.project_name) setFetchedName(p.name || p.project_name);
      })
      .catch(() => { /* the picker still works, it just reads "Select a job" */ });
    return () => { cancelled = true; };
  }, [currentId, list]);

  const current = list.find((p) => p.id === currentId);
  const currentName = current ? nameOf(current) : fetchedName;

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((p) => {
      const hay = `${nameOf(p)} ${p.project_number ?? ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [list, q]);

  useEffect(() => { setActive(0); }, [q, open]);

  /* Close on outside click and on Escape. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { if (open) window.setTimeout(() => searchRef.current?.focus(), 10); }, [open]);

  /** Same screen, different job. */
  function go(id: string) {
    setOpen(false);
    setQ('');
    router.push(tail ? `/app/projects/${id}/${tail}` : `/app/projects/${id}`);
  }

  function keys(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); go(matches[active].id); }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        data-tour="project-picker"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={currentName ? `${currentName} — switch job` : 'Choose a job'}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          height: 34, maxWidth: 260, padding: '0 10px',
          background: currentName ? 'rgba(245,158,11,0.10)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${currentName ? 'rgba(245,158,11,0.38)' : BORDER}`,
          borderRadius: 9, cursor: 'pointer',
          color: currentName ? TEXT : DIM,
          fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
        }}
      >
        <Buildings size={15} weight="duotone" color={currentName ? GOLD : DIM} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {currentName ?? 'Choose a job'}
        </span>
        <CaretUpDown size={13} weight="bold" color={DIM} />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 3000,
            width: 340, maxHeight: 420, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12,
            boxShadow: '0 26px 60px -20px rgba(0,0,0,0.92)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${BORDER}` }}>
            <MagnifyingGlass size={14} weight="bold" color={DIM} />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={keys}
              placeholder="Search jobs…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: TEXT, fontSize: 13.5 }}
            />
          </div>

          {tail && (
            <div style={{ padding: '7px 12px', fontSize: 11, color: DIM, borderBottom: `1px solid ${BORDER}` }}>
              Switching keeps you on this screen
            </div>
          )}

          <div style={{ overflowY: 'auto', padding: 5 }}>
            {matches.length === 0 && (
              <div style={{ padding: '14px 12px', fontSize: 12.5, color: DIM }}>
                {list.length === 0 ? 'No jobs yet.' : 'No job matches that.'}
              </div>
            )}
            {matches.map((p, i) => {
              const isCurrent = p.id === currentId;
              return (
                <button
                  key={p.id}
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => go(p.id)}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                    padding: '9px 10px', borderRadius: 8, cursor: 'pointer', border: 'none',
                    background: i === active ? 'rgba(245,158,11,0.12)' : 'transparent',
                    color: TEXT, fontSize: 13.5, fontWeight: isCurrent ? 800 : 600,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nameOf(p)}
                    {p.project_number && (
                      <span style={{ color: DIM, fontWeight: 500, marginLeft: 7, fontSize: 11.5 }}>{p.project_number}</span>
                    )}
                  </span>
                  {isCurrent && <Check size={14} weight="bold" color={GOLD} />}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => { setOpen(false); router.push('/app/projects'); }}
            style={{
              borderTop: `1px solid ${BORDER}`, padding: '10px 12px', textAlign: 'left',
              background: 'transparent', border: 'none', color: DIM, fontSize: 12.5,
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            See all jobs →
          </button>
        </div>
      )}
    </div>
  );
}
