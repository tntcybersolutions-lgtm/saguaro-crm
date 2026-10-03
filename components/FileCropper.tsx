'use client';
/**
 * Image crop + rotate modal. The user drags a crop rectangle and/or rotates;
 * on Apply we convert the on-screen rect to NATURAL pixels and POST to
 * /api/files/crop (server-side sharp does the actual edit). Returns the updated
 * row via onDone. Overwrites the stored image in place.
 */
import React, { useRef, useState } from 'react';
import { ArrowClockwise, ArrowCounterClockwise, Crop, X, Check } from '@phosphor-icons/react';

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

  const rel = (e: React.MouseEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(e.clientX - r.left, r.width)), y: Math.max(0, Math.min(e.clientY - r.top, r.height)) };
  };

  const apply = async () => {
    setBusy(true); setErr('');
    try {
      const img = imgRef.current!;
      const disp = img.getBoundingClientRect();
      let cropRect: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (rect && rect.w > 6 && rect.h > 6 && img.naturalWidth) {
        const sx = img.naturalWidth / disp.width, sy = img.naturalHeight / disp.height;
        cropRect = { left: Math.round(rect.x * sx), top: Math.round(rect.y * sy), width: Math.round(rect.w * sx), height: Math.round(rect.h * sy) };
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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 16, width: 'min(720px,100%)', maxHeight: '92vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <Crop size={18} color="var(--brand-primary)" weight="fill" />
          <div style={{ fontWeight: 800, fontSize: 16, marginLeft: 8, flex: 1, color: '#fff' }}>Edit Image</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#CBD5E1" /></button>
        </div>
        <div
          ref={wrapRef}
          onMouseDown={(e) => { const p = rel(e); setDrag(p); setRect({ x: p.x, y: p.y, w: 0, h: 0 }); }}
          onMouseMove={(e) => { if (!drag) return; const p = rel(e); setRect({ x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) }); }}
          onMouseUp={() => setDrag(null)}
          style={{ position: 'relative', display: 'inline-block', width: '100%', textAlign: 'center', cursor: 'crosshair', userSelect: 'none', background: '#0b0f14', borderRadius: 10, overflow: 'hidden' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={url} alt={name || ''} draggable={false} style={{ maxWidth: '100%', maxHeight: '58vh', transform: `rotate(${rotate}deg)`, transition: 'transform .15s' }} />
          {rect && rect.w > 2 && (
            <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, border: '2px solid var(--brand-primary)', background: 'var(--brand-primary-12)', pointerEvents: 'none' }} />
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setRotate((r) => (r - 90) % 360)} style={btn}><ArrowCounterClockwise size={16} />Rotate Left</button>
          <button onClick={() => setRotate((r) => (r + 90) % 360)} style={btn}><ArrowClockwise size={16} />Rotate Right</button>
          <button onClick={() => setRect(null)} style={btn}>Clear Box</button>
          <span style={{ color: '#64748B', fontSize: 12, marginLeft: 4 }}>Drag on the image to crop</span>
          <div style={{ flex: 1 }} />
          {err && <span style={{ color: '#FF6B6B', fontSize: 12 }}>{err}</span>}
          <button onClick={apply} disabled={busy} style={{ ...btn, background: 'var(--brand-primary)', color: '#0A0A00', fontWeight: 800, border: 'none' }}><Check size={16} weight="bold" />{busy ? 'Saving…' : 'Apply'}</button>
        </div>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg-surface-2)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 13px', fontSize: 13, cursor: 'pointer' };
