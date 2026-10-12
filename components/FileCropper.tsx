'use client';
/**
 * Image crop + rotate modal. The user drags a crop rectangle and/or rotates;
 * on Apply we convert the on-screen rect to NATURAL pixels and POST to
 * /api/files/crop (server-side sharp does the actual edit). Returns the updated
 * row via onDone. Overwrites the stored image in place.
 */
import React, { useId, useRef, useState } from 'react';
import { ArrowClockwise, ArrowCounterClockwise, Crop, X, Check } from '@phosphor-icons/react';
import { z } from '@/lib/design-tokens';
import { toNaturalRect, type CropRect } from '@/lib/crop-rect';
import { useEscapeClose } from '@/lib/ui/use-escape-close';

export function FileCropper({ fileId, url, name, onDone, onClose }: {
  fileId: string; url: string; name?: string;
  onDone: (row: any) => void; onClose: () => void; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [rotate, setRotate] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const titleId = useId();

  const rel = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(e.clientX - r.left, r.width)), y: Math.max(0, Math.min(e.clientY - r.top, r.height)) };
  };

  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeClose(dialogRef, onClose);

  const apply = async () => {
    setBusy(true); setErr('');
    try {
      const img = imgRef.current!;
      let cropRect: CropRect | null = null;
      if (rect && rect.w > 6 && rect.h > 6 && img.naturalWidth) {
        cropRect = toNaturalRect(rect, img, wrapRef.current!, rotate);
        if (!cropRect) { setErr('Draw the crop box on the photo itself.'); setBusy(false); return; }
      }
      if (!cropRect && !rotate) { setErr('Draw a crop box or rotate first.'); setBusy(false); return; }
      const res = await fetch('/api/files/crop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId, cropRect, rotate: rotate || undefined }) });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      onDone(json.file);
    } catch (e: any) { setErr(e?.message || 'Crop failed'); } // eslint-disable-line @typescript-eslint/no-explicit-any
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: z.modal, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))' }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 16, width: 'min(720px,100%)', maxHeight: '92vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <Crop size={18} color="var(--text-secondary)" weight="fill" />
          <div id={titleId} style={{ fontWeight: 800, fontSize: 16, marginLeft: 8, flex: 1, color: 'var(--text-primary)' }}>Edit Image</div>
          <button onClick={onClose} aria-label="Close" style={closeBtn}><X size={20} color="var(--text-secondary)" /></button>
        </div>
        {/* Pointer events, not mouse events: on an iPhone a finger drag never
            fires mousemove, so the crop box could not be drawn at all. */}
        <div
          ref={wrapRef}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const p = rel(e); setDrag(p); setRect({ x: p.x, y: p.y, w: 0, h: 0 }); }}
          onPointerMove={(e) => { if (!drag) return; const p = rel(e); setRect({ x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) }); }}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
          style={{ position: 'relative', display: 'inline-block', width: '100%', textAlign: 'center', cursor: 'crosshair', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none', background: '#0b0f14', borderRadius: 10, overflow: 'hidden' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={url} alt={name || ''} draggable={false} style={{ maxWidth: '100%', maxHeight: '58vh', transform: `rotate(${rotate}deg)`, transition: 'transform .15s' }} />
          {rect && rect.w > 2 && (
            <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, border: '2px solid var(--brand-primary)', background: 'var(--bg-surface-2)', pointerEvents: 'none' }} />
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setRotate((r) => (r - 90) % 360)} style={btn}><ArrowCounterClockwise size={16} />Rotate Left</button>
          <button onClick={() => setRotate((r) => (r + 90) % 360)} style={btn}><ArrowClockwise size={16} />Rotate Right</button>
          <button onClick={() => setRect(null)} style={btn}>Clear Box</button>
          <span style={{ color: 'var(--status-closed)', fontSize: 12, marginLeft: 4 }}>Drag on the photo to crop</span>
          <div style={{ flex: 1 }} />
          {err && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{err}</span>}
          <button onClick={apply} disabled={busy} style={{ ...btn, background: 'var(--brand-primary)', color: 'var(--on-brand)', fontWeight: 800, border: 'none' }}><Check size={16} weight="bold" />{busy ? 'Saving…' : 'Apply'}</button>
        </div>
      </div>
    </div>
  );
}

const closeBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 13px', minHeight: 44, fontSize: 13, cursor: 'pointer' };
