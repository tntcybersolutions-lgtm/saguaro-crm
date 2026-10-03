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
} from '@phosphor-icons/react';

const EVENT = 'saguaro-open-pdf';

const TEXT = '#F0F4FF';
const DIM = '#93A9C4';
const HAIR = 'rgba(255,255,255,0.10)';
const GOLD = 'var(--brand-primary)';

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
  url, label, zoom, page, onPages, fit,
}: {
  url: string; label?: string; zoom: number; page: number;
  onPages?: (n: number) => void; fit: boolean;
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
        const pdfjs = await import('pdfjs-dist');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pdfjs as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = await (pdfjs as any).getDocument({ url }).promise;
        if (cancelled || mine !== seq.current) return;
        onPages?.(doc.numPages);

        const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
        if (cancelled || mine !== seq.current) return;

        /* Fit uses the pane's real width, so a wide sheet lands readable
           instead of at an arbitrary percentage. */
        const base = p.getViewport({ scale: 1 });
        const avail = (wrapRef.current?.clientWidth ?? 900) - 48;
        const scale = fit ? Math.max(0.2, avail / base.width) : zoom;

        /* Raster at device pixel ratio, or a dimension string on a plan is a
           blur the GC has to zoom into to read. */
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = p.getViewport({ scale: scale * dpr });
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
  }, [url, zoom, page, fit, onPages]);

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {label && (
        <div style={{
          padding: '8px 14px', fontSize: 11, fontWeight: 800,
          color: DIM, whiteSpace: 'nowrap', overflow: 'hidden',
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
          <div style={{ color: '#FF3B30', fontSize: 13, maxWidth: 360, textAlign: 'center', marginTop: 56, lineHeight: 1.65 }}>
            {err}
            <div style={{ marginTop: 14 }}>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: DIM, fontSize: 12.5 }}>
                Try Opening It Directly
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
  const dragging = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail as OpenPdfRequest;
      setReq(d);
      setZoom(1.2); setFit(true); setPage(1); setPages(1);
      setCompare(Boolean(d.compareUrl)); setStacked(false); setSplit(50);
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  const close = useCallback(() => setReq(null), []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') setPage((p) => Math.min(p + 1, pages));
      else if (e.key === 'ArrowLeft') setPage((p) => Math.max(p - 1, 1));
      else if (e.key === '+' || e.key === '=') { setFit(false); setZoom((z) => Math.min(z + 0.2, 5)); }
      else if (e.key === '-') { setFit(false); setZoom((z) => Math.max(z - 0.2, 0.3)); }
      else if (e.key === '0') setFit(true);
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
    background: 'var(--brand-primary-18)',
    borderColor: 'color-mix(in srgb, var(--brand-primary) 55%, transparent)',
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

        <button style={chip} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page">
          <CaretLeft size={14} weight="bold" />
        </button>
        <span style={{ fontSize: 12.5, color: DIM, fontVariantNumeric: 'tabular-nums', minWidth: 72, textAlign: 'center' }}>
          {page} / {pages}
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

        {req.compareUrl && (
          <>
            <span style={{ width: 1, height: 20, background: HAIR, margin: '0 5px' }} />
            <button style={{ ...chip, ...(compare ? active : {}) }} onClick={() => setCompare((v) => !v)}>
              <Columns size={14} weight="bold" /> Compare
            </button>
            {compare && (
              <button style={chip} onClick={() => setStacked((v) => !v)} title={stacked ? 'Side by side' : 'Stacked'}>
                {stacked ? <Columns size={14} weight="bold" /> : <Rows size={14} weight="bold" />}
                {stacked ? 'Side by Side' : 'Stacked'}
              </button>
            )}
          </>
        )}

        <span style={{ marginLeft: 'auto', display: 'flex', gap: 9, alignItems: 'center' }}>
          {req.editHref && (
            <a href={req.editHref} style={{ ...chip, ...active, textDecoration: 'none' }}>
              <PencilSimple size={14} weight="bold" /> Mark Up
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
            style={{ ...chip, background: 'rgba(255,59,48,0.16)', borderColor: 'rgba(255,59,48,0.45)', color: '#FCA5A5' }}
            onClick={close}
            aria-label="Close"
          >
            <X size={14} weight="bold" />
          </button>
        </span>
      </div>

      {/* ── panes ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: stacked ? 'column' : 'row', minHeight: 0 }}>
        {compare && req.compareUrl && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, flex: stacked ? 1 : `0 0 ${split}%` }}>
              <Pane url={req.compareUrl} label={req.compareTitle || 'Previous Revision'} zoom={zoom} page={page} fit={fit} />
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
          <Pane url={req.url} label={compare ? (req.title || 'Current') : undefined} zoom={zoom} page={page} onPages={onPages} fit={fit} />
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

/* The same single-page renderer, for a screen that shows a sheet inline (the
   drawings canvas) and hands off to openPdf() for zoom and compare. */
export { Pane as PdfPane };
