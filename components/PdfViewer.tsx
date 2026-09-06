'use client';

/**
 * The document reader — one place every PDF opens, instead of a browser tab.
 *
 * Thirty call sites did `window.open(url)`. A drawing, a pay application, a
 * bid jacket, a signed waiver — all handed to Chrome's viewer, which means the
 * GC leaves the product to look at the thing the product just made, loses the
 * context they were in, and comes back by pressing Back. On a drawings
 * register that is the core workflow leaking out of the app.
 *
 *   import { openPdf } from '@/components/PdfViewer';
 *   openPdf({ url, title: 'A-101 Floor Plan' });
 *   openPdf({ url: revB, title: 'A-101 R1', compareUrl: revA, compareTitle: 'R0' });
 *
 * Side by side is the reason this exists rather than an <iframe>. Comparing
 * two revisions is the most common thing a GC does with a drawing, and no
 * browser tab does it without two windows and a lot of dragging. The split is
 * draggable, both panes share zoom and page, and either can be panned.
 *
 * On the finish: the chrome is glass over the document — a blurred, saturated
 * bar with a lit top edge — because a reader should feel like a lens on the
 * drawing rather than a page containing it. The document itself sits on a
 * near-black ground with a real drop shadow, which is what makes a white sheet
 * read as paper instead of a rectangle of light.
 *
 * Deliberately NOT a replacement for components/drawings/DrawingViewer, which
 * is the full markup and measure surface. This is the reader; when a document
 * is a project drawing, the toolbar links through to the editor.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, CaretLeft, CaretRight, MagnifyingGlassPlus, MagnifyingGlassMinus,
  DownloadSimple, ArrowsOutSimple, Columns, ArrowSquareOut, PencilSimple, Rows,
  ArrowClockwise, MagnifyingGlass, SquaresFour, CircleNotch,
} from '@phosphor-icons/react';

const EVENT = 'saguaro-open-pdf';

const TEXT = '#F0F4FF';
const DIM = '#93A9C4';
const HAIR = 'rgba(255,255,255,0.10)';
const GOLD = '#F59E0B';

/* ── document cache ──────────────────────────────────────────────────────────
   Every pane used to call getDocument() again on each page turn, zoom step and
   rotation — re-downloading and re-parsing the whole file to draw one page. On
   a 40MB drawing set over site wifi that is the difference between a viewer
   that feels instant and one a PM gives up on. Documents are cached per URL and
   shared by every pane and the thumbnail rail. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const docCache = new Map<string, Promise<any>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadDoc(url: string): Promise<any> {
  const hit = docCache.get(url);
  if (hit) return hit;
  const p = (async () => {
    const pdfjs = await import('pdfjs-dist');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjs as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (pdfjs as any).getDocument({ url }).promise;
  })();
  docCache.set(url, p);
  /* A failed load must not poison the cache — the signed link may simply have
     expired, and the next open should retry rather than replay the error. */
  p.catch(() => docCache.delete(url));
  return p;
}

export interface OpenPdfRequest {
  url: string;
  title?: string;
  /** Second document, shown beside the first. */
  compareUrl?: string;
  compareTitle?: string;
  /** Deep link to the markup editor, when this document is a project drawing. */
  editHref?: string;
}

/** Open a document in the in-app reader. Safe to call from anywhere client-side. */
export function openPdf(req: OpenPdfRequest) {
  if (typeof window === 'undefined') return;
  if (!req?.url) return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: req }));
}

/* ── one pane ───────────────────────────────────────────────────────────── */

function Pane({
  url, label, zoom, page, onPages, fit, rotation = 0,
}: {
  url: string; label?: string; zoom: number; page: number;
  onPages?: (n: number) => void; fit: boolean; rotation?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);
  /* Renders are async and a fast page or zoom change can land out of order,
     painting an older page over a newer one. Only the newest render wins. */
  const seq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const mine = ++seq.current;

    (async () => {
      setBusy(true);
      setErr('');
      try {
        const doc = await loadDoc(url);
        if (cancelled || mine !== seq.current) return;
        onPages?.(doc.numPages);

        const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
        if (cancelled || mine !== seq.current) return;

        /* Fit uses the pane's real width, so a wide sheet lands readable
           instead of at an arbitrary percentage. Rotation is folded in first,
           because a sheet turned 90° is as wide as it was tall and fitting the
           unrotated width would push half of it off screen. */
        const base = p.getViewport({ scale: 1, rotation });
        const avail = (wrapRef.current?.clientWidth ?? 900) - 48;
        const scale = fit ? Math.max(0.2, avail / base.width) : zoom;

        /* Raster at device pixel ratio, or a dimension string on a plan is a
           blur the GC has to zoom into to read. */
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = p.getViewport({ scale: scale * dpr, rotation });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        await p.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled && mine === seq.current) setBusy(false);
      } catch (e) {
        if (cancelled || mine !== seq.current) return;
        console.error(e);
        setErr('This file could not be displayed. It may not be a PDF, or the link may have expired.');
        setBusy(false);
      }
    })();

    return () => { cancelled = true; };
  }, [url, zoom, page, fit, rotation, onPages]);

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {label && (
        <div style={{
          padding: '8px 14px', fontSize: 11, fontWeight: 800, letterSpacing: '0.09em',
          textTransform: 'uppercase', color: DIM, whiteSpace: 'nowrap', overflow: 'hidden',
          textOverflow: 'ellipsis', flexShrink: 0,
          background: 'rgba(255,255,255,0.03)',
          borderBottom: `1px solid ${HAIR}`,
        }}>
          {label}
        </div>
      )}
      <div
        ref={wrapRef}
        style={{
          flex: 1, overflow: 'auto', display: 'flex',
          justifyContent: 'center', alignItems: 'flex-start', padding: 24,
          background:
            'radial-gradient(120% 90% at 50% 0%, #10161F 0%, #070A0F 60%, #05070B 100%)',
        }}
      >
        {err ? (
          <div style={{ color: '#F87171', fontSize: 13, maxWidth: 360, textAlign: 'center', marginTop: 56, lineHeight: 1.65 }}>
            {err}
            <div style={{ marginTop: 14 }}>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: DIM, fontSize: 12.5 }}>
                Try opening it directly
              </a>
            </div>
          </div>
        ) : (
          <>
            {busy && (
              <div style={{ color: DIM, fontSize: 12.5, marginTop: 56, letterSpacing: '0.04em' }}>
                Rendering…
              </div>
            )}
            <canvas
              ref={canvasRef}
              style={{
                display: busy ? 'none' : 'block',
                borderRadius: 3,
                /* A real drop shadow plus a hairline is what makes a white
                   sheet read as paper rather than a rectangle of light. */
                boxShadow: '0 30px 80px -20px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.07)',
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ── page rail ──────────────────────────────────────────────────────────────
   A drawing set is navigated by looking, not by counting. Paging through 40
   sheets to find the one with the panel schedule on it is the single slowest
   thing a PM does in a viewer, so the rail renders every page small and lets
   them jump straight to the one they recognise. Thumbnails render lazily, a
   few at a time, so opening a large set does not lock the UI. */

function Thumbs({
  url, page, pages, onPick,
}: {
  url: string; page: number; pages: number; onPick: (n: number) => void;
}) {
  const [shots, setShots] = useState<Record<number, string>>({});
  const railRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const doc = await loadDoc(url);
        if (cancelled) return;
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const p = await doc.getPage(n);
          const base = p.getViewport({ scale: 1 });
          const vp = p.getViewport({ scale: 132 / base.width });
          const c = document.createElement('canvas');
          c.width = vp.width;
          c.height = vp.height;
          const ctx = c.getContext('2d');
          if (!ctx) continue;
          await p.render({ canvasContext: ctx, viewport: vp }).promise;
          if (cancelled) return;
          const data = c.toDataURL('image/png');
          setShots((s) => ({ ...s, [n]: data }));
          /* Yield between pages so a 100-sheet set stays scrollable while it
             fills in behind the user. */
          await new Promise((r) => setTimeout(r, 0));
        }
      } catch {
        /* The main pane already reports load failure; the rail just stays empty
           rather than showing a second copy of the same error. */
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [page]);

  return (
    <div
      ref={railRef}
      style={{
        width: 164, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
        padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
        background: 'linear-gradient(180deg, rgba(14,20,28,0.94), rgba(8,11,17,0.94))',
        borderRight: `1px solid ${HAIR}`,
      }}
    >
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => {
        const on = n === page;
        return (
          <button
            key={n}
            ref={on ? activeRef : undefined}
            type="button"
            onClick={() => onPick(n)}
            aria-label={`Page ${n}`}
            aria-current={on ? 'true' : undefined}
            style={{
              display: 'block', width: '100%', padding: 0, cursor: 'pointer',
              background: 'transparent', border: 'none', textAlign: 'center',
            }}
          >
            <span style={{
              borderRadius: 4, overflow: 'hidden',
              border: `2px solid ${on ? GOLD : 'rgba(255,255,255,0.14)'}`,
              boxShadow: on ? '0 0 0 3px rgba(245,158,11,0.18)' : '0 8px 18px -10px rgba(0,0,0,0.9)',
              background: '#0B0F16', minHeight: 60,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {shots[n]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={shots[n]} alt="" style={{ width: '100%', display: 'block' }} />
                : <CircleNotch size={16} weight="bold" color={DIM} />}
            </span>
            <span style={{
              display: 'block', marginTop: 3, fontSize: 10.5, fontWeight: 700,
              color: on ? GOLD : DIM, fontVariantNumeric: 'tabular-nums',
            }}>
              {n}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── the reader ─────────────────────────────────────────────────────────── */

export default function PdfViewer() {
  const [req, setReq] = useState<OpenPdfRequest | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [fit, setFit] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [compare, setCompare] = useState(false);
  const [stacked, setStacked] = useState(false);
  const [split, setSplit] = useState(50);
  const [mounted, setMounted] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [rail, setRail] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<number[] | null>(null);
  const [searching, setSearching] = useState(false);
  const dragging = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail as OpenPdfRequest;
      setReq(d);
      setZoom(1.2); setFit(true); setPage(1); setPages(1);
      setCompare(Boolean(d.compareUrl)); setStacked(false); setSplit(50);
      setRotation(0); setRail(false); setPageInput('');
      setQuery(''); setHits(null); setSearching(false);
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  const close = useCallback(() => setReq(null), []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      /* Typing a page number or a search term must not also page and zoom the
         document underneath the field. */
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (typing) {
        if (e.key === 'Escape') (t as HTMLInputElement).blur();
        return;
      }
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') setPage((p) => Math.min(p + 1, pages));
      else if (e.key === 'ArrowLeft') setPage((p) => Math.max(p - 1, 1));
      else if (e.key === '+' || e.key === '=') { setFit(false); setZoom((z) => Math.min(z + 0.2, 5)); }
      else if (e.key === '-') { setFit(false); setZoom((z) => Math.max(z - 0.2, 0.3)); }
      else if (e.key === '0') setFit(true);
      else if (e.key === 'r' || e.key === 'R') setRotation((r) => (r + 90) % 360);
      else if (e.key === 't' || e.key === 'T') setRail((v) => !v);
      else if (e.key === 'Home') setPage(1);
      else if (e.key === 'End') setPage(pages);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [req, pages, close]);

  /* Draggable split. Pointer events on window so the drag survives the cursor
     leaving the handle, which is where a naive implementation gets sticky. */
  useEffect(() => {
    if (!compare || stacked) return;
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const pct = (e.clientX / window.innerWidth) * 100;
      setSplit(Math.min(80, Math.max(20, pct)));
    };
    const up = () => { dragging.current = false; document.body.style.cursor = ''; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [compare, stacked]);

  const onPages = useCallback((n: number) => setPages((p) => (p === n ? p : n)), []);

  /* Search reports which PAGES contain the term rather than highlighting hits
     in place. On a drawing set that is the useful answer — "the panel schedule
     is on sheet 12" — and it works on scanned-to-text sheets where a highlight
     rectangle would land in the wrong place anyway. */
  const runSearch = useCallback(async (term: string) => {
    const q = term.trim().toLowerCase();
    if (!req || q.length < 2) { setHits(null); return; }
    setSearching(true);
    try {
      const doc = await loadDoc(req.url);
      const found: number[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const p = await doc.getPage(n);
        const tc = await p.getTextContent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const text = (tc.items as any[]).map((i) => i.str || '').join(' ').toLowerCase();
        if (text.includes(q)) found.push(n);
      }
      setHits(found);
      if (found.length) setPage(found[0]);
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  }, [req]);

  if (!mounted || !req) return null;

  const chip: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    height: 34, padding: '0 12px', borderRadius: 9, cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)',
    border: `1px solid ${HAIR}`,
    color: TEXT, fontSize: 12.5, fontWeight: 700,
    backdropFilter: 'blur(6px)',
    transition: 'background .14s ease, border-color .14s ease',
  };
  const active: React.CSSProperties = {
    background: 'rgba(245,158,11,0.18)',
    borderColor: 'rgba(245,158,11,0.55)',
    color: '#FDE68A',
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={req.title || 'Document'}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483000,
        background: 'rgba(4,7,12,0.86)',
        backdropFilter: 'blur(4px)',
        display: 'flex', flexDirection: 'column',
        animation: 'sagPdfIn .16s ease-out',
      }}
    >
      <style>{`
        @keyframes sagPdfIn { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes sagPdfIn { from { opacity: 1; } to { opacity: 1; } }
        }
      `}</style>

      {/* ── glass toolbar ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px',
        flexShrink: 0, flexWrap: 'wrap',
        background: 'linear-gradient(180deg, rgba(22,29,40,0.92), rgba(12,17,25,0.88))',
        backdropFilter: 'blur(18px) saturate(160%)',
        WebkitBackdropFilter: 'blur(18px) saturate(160%)',
        borderBottom: `1px solid ${HAIR}`,
        /* The lit top edge is what sells glass — without it this is a grey bar. */
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 40px -24px rgba(0,0,0,0.9)',
      }}>
        <span style={{
          fontSize: 14, fontWeight: 800, color: TEXT, marginRight: 4,
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320,
          letterSpacing: '-0.01em',
        }}>
          {req.title || 'Document'}
        </span>

        <button
          style={{ ...chip, ...(rail ? active : {}) }}
          onClick={() => setRail((v) => !v)}
          title="Page thumbnails (T)"
          aria-pressed={rail}
        >
          <SquaresFour size={14} weight="bold" />
        </button>

        <button style={chip} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page">
          <CaretLeft size={14} weight="bold" />
        </button>

        {/* Typing a sheet number beats clicking next 30 times. */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: DIM }}>
          <input
            value={pageInput === '' ? String(page) : pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/[^\d]/g, ''))}
            onFocus={(e) => { setPageInput(''); e.currentTarget.select(); }}
            onBlur={() => setPageInput('')}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const n = Number(pageInput);
              if (n >= 1 && n <= pages) setPage(n);
              setPageInput('');
              (e.target as HTMLInputElement).blur();
            }}
            aria-label="Go to page"
            style={{
              width: 46, height: 30, textAlign: 'center', borderRadius: 7,
              background: 'rgba(0,0,0,0.30)', border: `1px solid ${HAIR}`,
              color: TEXT, fontSize: 12.5, fontWeight: 700, outline: 'none',
              fontVariantNumeric: 'tabular-nums',
            }}
          />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>/ {pages}</span>
        </span>

        <button style={chip} onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} aria-label="Next page">
          <CaretRight size={14} weight="bold" />
        </button>

        <span style={{ width: 1, height: 20, background: HAIR, margin: '0 5px' }} />

        <button style={chip} onClick={() => { setFit(false); setZoom((z) => Math.max(0.3, z - 0.2)); }} aria-label="Zoom out">
          <MagnifyingGlassMinus size={14} weight="bold" />
        </button>
        <span style={{ fontSize: 12.5, color: DIM, minWidth: 52, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
          {fit ? 'Fit' : `${Math.round(zoom * 100)}%`}
        </span>
        <button style={chip} onClick={() => { setFit(false); setZoom((z) => Math.min(5, z + 0.2)); }} aria-label="Zoom in">
          <MagnifyingGlassPlus size={14} weight="bold" />
        </button>
        <button style={{ ...chip, ...(fit ? active : {}) }} onClick={() => setFit(true)}>
          <ArrowsOutSimple size={14} weight="bold" /> Fit
        </button>
        <button
          style={{ ...chip, ...(rotation ? active : {}) }}
          onClick={() => setRotation((r) => (r + 90) % 360)}
          title="Rotate 90° (R)"
        >
          <ArrowClockwise size={14} weight="bold" />
          {rotation ? `${rotation}°` : ''}
        </button>

        <span style={{ width: 1, height: 20, background: HAIR, margin: '0 5px' }} />

        {/* Find the sheet, not the pixel — see runSearch. */}
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <MagnifyingGlass
            size={13}
            weight="bold"
            color={DIM}
            style={{ position: 'absolute', left: 9, pointerEvents: 'none' }}
          />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setHits(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runSearch(query); } }}
            placeholder="Find in document"
            aria-label="Find in document"
            style={{
              width: 178, height: 30, borderRadius: 7, padding: '0 9px 0 26px',
              background: 'rgba(0,0,0,0.30)', border: `1px solid ${HAIR}`,
              color: TEXT, fontSize: 12.5, outline: 'none',
            }}
          />
        </span>

        {/* Enter alone is not a discoverable control, and it is the first thing
            to break behind an IME or an autofill overlay. The button is the
            contract; Enter is the shortcut. */}
        <button
          style={{ ...chip, ...(query.trim().length >= 2 ? active : {}) }}
          onClick={() => void runSearch(query)}
          disabled={query.trim().length < 2 || searching}
          title="Find pages containing this text"
        >
          Find
        </button>

        {searching && <CircleNotch size={14} weight="bold" color={DIM} />}

        {!searching && hits !== null && (
          hits.length === 0 ? (
            <span style={{ fontSize: 12, color: DIM }}>No matches</span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: GOLD, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {hits.length} page{hits.length === 1 ? '' : 's'}
              </span>
              <button
                style={{ ...chip, height: 28, padding: '0 9px' }}
                onClick={() => {
                  const next = hits.find((h) => h > page) ?? hits[0];
                  setPage(next);
                }}
                title="Next page with a match"
              >
                Next hit
              </button>
            </span>
          )
        )}

        {req.compareUrl && (
          <>
            <span style={{ width: 1, height: 20, background: HAIR, margin: '0 5px' }} />
            <button style={{ ...chip, ...(compare ? active : {}) }} onClick={() => setCompare((v) => !v)}>
              <Columns size={14} weight="bold" /> Compare
            </button>
            {compare && (
              <button style={chip} onClick={() => setStacked((v) => !v)} title={stacked ? 'Side by side' : 'Stacked'}>
                {stacked ? <Columns size={14} weight="bold" /> : <Rows size={14} weight="bold" />}
                {stacked ? 'Side by side' : 'Stacked'}
              </button>
            )}
          </>
        )}

        <span style={{ marginLeft: 'auto', display: 'flex', gap: 9, alignItems: 'center' }}>
          {req.editHref && (
            <a href={req.editHref} style={{ ...chip, ...active, textDecoration: 'none' }}>
              <PencilSimple size={14} weight="bold" /> Mark up
            </a>
          )}
          <a href={req.url} download style={{ ...chip, textDecoration: 'none' }} title="Download">
            <DownloadSimple size={14} weight="bold" />
          </a>
          {/* Kept deliberately: a browser tab is still the right answer for
              printing and for anyone who wants the file in its own window. */}
          <a href={req.url} target="_blank" rel="noopener noreferrer" style={{ ...chip, textDecoration: 'none' }} title="Open in a new tab">
            <ArrowSquareOut size={14} weight="bold" />
          </a>
          <button
            style={{ ...chip, background: 'rgba(239,68,68,0.16)', borderColor: 'rgba(239,68,68,0.45)', color: '#FCA5A5' }}
            onClick={close}
            aria-label="Close"
          >
            <X size={14} weight="bold" />
          </button>
        </span>
      </div>

      {/* ── rail + panes ────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0 }}>
        {rail && <Thumbs url={req.url} page={page} pages={pages} onPick={setPage} />}

      <div style={{ flex: 1, display: 'flex', flexDirection: stacked ? 'column' : 'row', minHeight: 0, minWidth: 0 }}>
        {compare && req.compareUrl && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, flex: stacked ? 1 : `0 0 ${split}%` }}>
              <Pane url={req.compareUrl} label={req.compareTitle || 'Previous revision'} zoom={zoom} page={page} fit={fit} rotation={rotation} />
            </div>

            {/* Draggable divider. Wide enough to grab, thin enough to ignore. */}
            <div
              onPointerDown={(e) => { if (stacked) return; dragging.current = true; document.body.style.cursor = 'col-resize'; e.preventDefault(); }}
              role="separator"
              aria-orientation={stacked ? 'horizontal' : 'vertical'}
              style={{
                flexShrink: 0,
                width: stacked ? '100%' : 9,
                height: stacked ? 9 : 'auto',
                cursor: stacked ? 'default' : 'col-resize',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))',
                borderLeft: stacked ? 'none' : `1px solid ${HAIR}`,
                borderRight: stacked ? 'none' : `1px solid ${HAIR}`,
                borderTop: stacked ? `1px solid ${HAIR}` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {!stacked && <span style={{ width: 2, height: 26, borderRadius: 2, background: 'rgba(255,255,255,0.28)' }} />}
            </div>
          </>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, flex: 1 }}>
          <Pane url={req.url} label={compare ? (req.title || 'Current') : undefined} zoom={zoom} page={page} onPages={onPages} fit={fit} rotation={rotation} />
        </div>
      </div>
      </div>

      <div style={{
        padding: '8px 16px', fontSize: 11, color: DIM, flexShrink: 0,
        background: 'linear-gradient(180deg, rgba(12,17,25,0.88), rgba(8,11,17,0.92))',
        backdropFilter: 'blur(18px) saturate(160%)',
        borderTop: `1px solid ${HAIR}`,
        letterSpacing: '0.02em',
      }}>
        <kbd style={{ color: TEXT }}>←</kbd> <kbd style={{ color: TEXT }}>→</kbd> page
        <span style={{ margin: '0 10px', opacity: 0.4 }}>·</span>
        <kbd style={{ color: TEXT }}>+</kbd> <kbd style={{ color: TEXT }}>−</kbd> zoom
        <span style={{ margin: '0 10px', opacity: 0.4 }}>·</span>
        <kbd style={{ color: TEXT }}>0</kbd> fit
        <span style={{ margin: '0 10px', opacity: 0.4 }}>·</span>
        <kbd style={{ color: TEXT }}>R</kbd> rotate
        <span style={{ margin: '0 10px', opacity: 0.4 }}>·</span>
        <kbd style={{ color: TEXT }}>T</kbd> thumbnails
        <span style={{ margin: '0 10px', opacity: 0.4 }}>·</span>
        <kbd style={{ color: TEXT }}>Esc</kbd> close
        {compare && !stacked && (
          <>
            <span style={{ margin: '0 10px', opacity: 0.4 }}>·</span>
            drag the divider to resize
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
