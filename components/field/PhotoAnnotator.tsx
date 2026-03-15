'use client';
import React, { useRef, useState, useCallback, useEffect } from 'react';

interface Annotation {
  id: string;
  x: number; // 0-100 percent
  y: number; // 0-100 percent
  text: string;
  color: string;
}

interface PhotoAnnotatorProps {
  onSave: (blob: Blob, annotations: Annotation[]) => void;
  onCancel: () => void;
}

const COLORS = ['#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#A855F7', '#FFFFFF'];

export function PhotoAnnotator({ onSave, onCancel }: PhotoAnnotatorProps) {
  const fileRef     = useRef<HTMLInputElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const [imgSrc, setImgSrc]         = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeColor, setActiveColor] = useState('#EF4444');
  const [adding, setAdding]           = useState(false);
  const [newText, setNewText]         = useState('');
  const [pendingPos, setPendingPos]   = useState<{ x: number; y: number } | null>(null);

  // Load image onto canvas
  useEffect(() => {
    if (!imgSrc || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width  = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = imgSrc;
  }, [imgSrc]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImgSrc(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!adding) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width)  * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;
    setPendingPos({ x, y });
  }

  function commitAnnotation() {
    if (!pendingPos || !newText.trim()) return;
    setAnnotations(prev => [
      ...prev,
      { id: crypto.randomUUID(), x: pendingPos.x, y: pendingPos.y, text: newText.trim(), color: activeColor },
    ]);
    setNewText('');
    setPendingPos(null);
    setAdding(false);
  }

  function removeAnnotation(id: string) {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  }

  const handleSave = useCallback(() => {
    if (!canvasRef.current || !imgSrc) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    if (!ctx) return;

    // Draw annotations onto canvas before export
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      annotations.forEach(a => {
        const px = (a.x / 100) * canvas.width;
        const py = (a.y / 100) * canvas.height;
        // Draw pin circle
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.fillStyle = a.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Draw text label
        ctx.fillStyle = '#000';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(a.text.slice(0, 3), px, py);
      });
      canvas.toBlob(blob => {
        if (blob) onSave(blob, annotations);
      }, 'image/jpeg', 0.9);
    };
    img.src = imgSrc;
  }, [imgSrc, annotations, onSave]);

  const DARK   = '#07101C';
  const RAISED = '#1f2c3e';
  const BORDER = '#1E3A5F';
  const TEXT   = '#F0F4FF';
  const DIM    = '#8BAAC8';
  const GOLD   = '#D4A017';

  return (
    <div style={{ background: DARK, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, background: RAISED }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Cancel</button>
        <span style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>Photo + Annotate</span>
        <button
          onClick={handleSave}
          disabled={!imgSrc}
          style={{ background: imgSrc ? GOLD : 'rgba(212,160,23,.3)', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#0d1117', fontWeight: 700, fontSize: 13, cursor: imgSrc ? 'pointer' : 'not-allowed' }}
        >
          Attach
        </button>
      </div>

      {/* Image area */}
      {!imgSrc ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          <div style={{ fontSize: 48 }}>📷</div>
          <div style={{ color: DIM, fontSize: 14 }}>Take or choose a photo to annotate</div>
          <button
            onClick={() => fileRef.current?.click()}
            style={{ padding: '12px 28px', background: GOLD, border: 'none', borderRadius: 10, color: '#0d1117', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >
            Choose Photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: 'none' }} />
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div
            onClick={handleCanvasClick}
            style={{ position: 'relative', width: '100%', cursor: adding ? 'crosshair' : 'default' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgSrc} alt="annotate" style={{ width: '100%', display: 'block' }} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {/* Render annotation pins */}
            {annotations.map(a => (
              <div
                key={a.id}
                style={{
                  position: 'absolute',
                  left: `${a.x}%`,
                  top: `${a.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: a.color,
                  border: '2px solid white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 800,
                  color: '#000',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,.4)',
                  zIndex: 10,
                }}
                onClick={e => { e.stopPropagation(); removeAnnotation(a.id); }}
                title={`${a.text} (tap to remove)`}
              >
                {a.text.slice(0, 2)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      {imgSrc && (
        <div style={{ background: RAISED, borderTop: `1px solid ${BORDER}`, padding: '12px 16px' }}>
          {/* Color palette */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: DIM, fontWeight: 600 }}>Color:</span>
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setActiveColor(c)}
                style={{
                  width: 24, height: 24, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                  outline: activeColor === c ? `3px solid ${GOLD}` : '2px solid transparent',
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>

          {/* Add annotation button */}
          {!adding && !pendingPos && (
            <button
              onClick={() => setAdding(true)}
              style={{ width: '100%', padding: '10px', background: 'rgba(212,160,23,.12)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 8, color: GOLD, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              + Add Annotation (tap photo to place)
            </button>
          )}

          {adding && !pendingPos && (
            <div style={{ textAlign: 'center', color: DIM, fontSize: 13, padding: '8px 0' }}>
              Tap on the photo to place your annotation
              <button onClick={() => setAdding(false)} style={{ marginLeft: 12, background: 'none', border: 'none', color: DIM, cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>Cancel</button>
            </div>
          )}

          {pendingPos && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                autoFocus
                value={newText}
                onChange={e => setNewText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitAnnotation(); if (e.key === 'Escape') { setPendingPos(null); setAdding(false); } }}
                placeholder="Label (e.g. crack, leak, mark...)"
                maxLength={20}
                style={{ flex: 1, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '9px 12px', color: TEXT, fontSize: 13, outline: 'none' }}
              />
              <button
                onClick={commitAnnotation}
                disabled={!newText.trim()}
                style={{ padding: '9px 18px', background: newText.trim() ? GOLD : 'rgba(212,160,23,.3)', border: 'none', borderRadius: 8, color: '#0d1117', fontWeight: 700, fontSize: 13, cursor: newText.trim() ? 'pointer' : 'not-allowed' }}
              >
                Add
              </button>
            </div>
          )}

          {annotations.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: DIM }}>
              {annotations.length} annotation{annotations.length > 1 ? 's' : ''} — tap pin to remove
            </div>
          )}
        </div>
      )}
    </div>
  );
}
