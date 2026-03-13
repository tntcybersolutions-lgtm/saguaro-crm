'use client';
import React, { useRef, useEffect, useCallback } from 'react';

const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const GOLD = '#D4A017';
const RED = '#EF4444';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  label?: string;
}

export default function SignaturePad({ onSave, onCancel, label = 'Signature' }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasStrokes = useRef(false);

  const getCtx = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return null;
    return c.getContext('2d');
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const parent = c.parentElement;
    if (parent) {
      c.width = parent.clientWidth;
      c.height = 160;
    }
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#07101C';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = TEXT;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Draw baseline
      ctx.beginPath();
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 1;
      ctx.moveTo(16, c.height - 30);
      ctx.lineTo(c.width - 16, c.height - 30);
      ctx.stroke();
      ctx.fillStyle = DIM;
      ctx.font = '11px sans-serif';
      ctx.fillText('Sign above', 16, c.height - 12);
    }
  }, []);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e) e.preventDefault();
    drawing.current = true;
    hasStrokes.current = true;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.strokeStyle = TEXT;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(x, y);
  };

  const moveDraw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing.current) return;
    if ('touches' in e) e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    drawing.current = false;
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    hasStrokes.current = false;
    ctx.fillStyle = '#07101C';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.beginPath();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.moveTo(16, c.height - 30);
    ctx.lineTo(c.width - 16, c.height - 30);
    ctx.stroke();
    ctx.fillStyle = DIM;
    ctx.font = '11px sans-serif';
    ctx.fillText('Sign above', 16, c.height - 12);
  };

  const save = () => {
    const c = canvasRef.current;
    if (!c || !hasStrokes.current) return;
    onSave(c.toDataURL('image/png'));
  };

  return (
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
      <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</p>
      <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: 160, touchAction: 'none', cursor: 'crosshair' }}
          onTouchStart={startDraw}
          onTouchMove={moveDraw}
          onTouchEnd={endDraw}
          onMouseDown={startDraw}
          onMouseMove={moveDraw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" onClick={clear} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px', color: DIM, fontSize: 13, cursor: 'pointer' }}>Clear</button>
        <button type="button" onClick={onCancel} style={{ flex: 1, background: 'rgba(239,68,68,.1)', border: `1px solid rgba(239,68,68,.3)`, borderRadius: 10, padding: '10px', color: RED, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        <button type="button" onClick={save} style={{ flex: 2, background: GOLD, border: 'none', borderRadius: 10, padding: '10px', color: '#000', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Save Signature</button>
      </div>
    </div>
  );
}
