'use client';
import React, { useState, useRef, useCallback, useEffect } from 'react';

const GOLD='#C8960F',DARK='#F8F9FB',RAISED='#ffffff',BORDER='#E2E5EA',DIM='#6B7280',TEXT='#111827';

interface PhotoEditorProps {
  src: string;
  photoId: string;
  onSave?: (editedBlob: Blob, photoId: string) => void;
  onDelete?: (photoId: string) => void;
  onClose: () => void;
}

export default function PhotoEditor({ src, photoId, onSave, onDelete, onClose }: PhotoEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [cropStart, setCropStart] = useState<{x:number,y:number}|null>(null);
  const [cropEnd, setCropEnd] = useState<{x:number,y:number}|null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Load image
  useEffect(() => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => { setImg(image); };
    image.src = src;
  }, [src]);

  // Draw to canvas
  const draw = useCallback(() => {
    if (!img || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isRotated90 = rotation === 90 || rotation === 270;
    const w = isRotated90 ? img.height : img.width;
    const h = isRotated90 ? img.width : img.height;

    // Scale to fit container (max 800px wide)
    const maxW = Math.min(800, window.innerWidth - 48);
    const maxH = Math.min(600, window.innerHeight - 300);
    const scale = Math.min(maxW / w, maxH / h, 1);

    canvas.width = w * scale;
    canvas.height = h * scale;

    ctx.save();
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

    const drawW = img.width * scale;
    const drawH = img.height * scale;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Draw crop overlay
    if (cropping && cropStart && cropEnd) {
      const x = Math.min(cropStart.x, cropEnd.x);
      const y = Math.min(cropStart.y, cropEnd.y);
      const cw = Math.abs(cropEnd.x - cropStart.x);
      const ch = Math.abs(cropEnd.y - cropStart.y);

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.clearRect(x, y, cw, ch);
      ctx.drawImage(canvas, x, y, cw, ch, x, y, cw, ch);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(x, y, cw, ch);
      ctx.setLineDash([]);
    }
  }, [img, rotation, brightness, contrast, flipH, flipV, cropping, cropStart, cropEnd]);

  useEffect(() => { draw(); }, [draw]);

  const handleRotate = (deg: number) => setRotation((rotation + deg + 360) % 360);

  const handleCropMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropping) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    setCropStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setCropEnd(null);
  };

  const handleCropMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropping || !cropStart) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    setCropEnd({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleCropMouseUp = () => {
    // crop selection done — user clicks Apply Crop
  };

  const applyCrop = () => {
    if (!cropStart || !cropEnd || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const cw = Math.abs(cropEnd.x - cropStart.x);
    const ch = Math.abs(cropEnd.y - cropStart.y);

    if (cw < 10 || ch < 10) return;

    const imageData = ctx.getImageData(x, y, cw, ch);
    canvas.width = cw;
    canvas.height = ch;
    ctx.putImageData(imageData, 0, 0);

    setCropping(false);
    setCropStart(null);
    setCropEnd(null);

    // Create new image from cropped canvas
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const newImg = new Image();
      newImg.onload = () => { setImg(newImg); setRotation(0); };
      newImg.src = url;
    }, 'image/jpeg', 0.92);
  };

  const handleSave = async () => {
    if (!canvasRef.current || !onSave) return;
    setSaving(true);
    canvasRef.current.toBlob((blob) => {
      if (blob) onSave(blob, photoId);
      setSaving(false);
    }, 'image/jpeg', 0.92);
  };

  const handleDelete = () => {
    if (onDelete) onDelete(photoId);
  };

  const btnStyle = (active?: boolean): React.CSSProperties => ({
    padding: '8px 14px', background: active ? GOLD : RAISED, border: `1px solid ${active ? GOLD : BORDER}`,
    borderRadius: 7, color: active ? '#000' : TEXT, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ color: TEXT, fontWeight: 700, fontSize: 16 }}>📸 Photo Editor</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onSave && (
            <button onClick={handleSave} disabled={saving} style={{ ...btnStyle(), background: `linear-gradient(135deg,${GOLD},#F0C040)`, color: '#000', border: 'none' }}>
              {saving ? 'Saving…' : '💾 Save'}
            </button>
          )}
          <button onClick={onClose} style={btnStyle()}>✕ Close</button>
        </div>
      </div>

      {/* Canvas area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'auto' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleCropMouseDown}
          onMouseMove={handleCropMouseMove}
          onMouseUp={handleCropMouseUp}
          style={{ borderRadius: 8, cursor: cropping ? 'crosshair' : 'default', maxWidth: '100%' }}
        />
      </div>

      {/* Toolbar */}
      <div style={{ padding: '12px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
        {/* Rotate */}
        <button onClick={() => handleRotate(-90)} style={btnStyle()}>↺ Rotate Left</button>
        <button onClick={() => handleRotate(90)} style={btnStyle()}>↻ Rotate Right</button>
        <button onClick={() => handleRotate(180)} style={btnStyle()}>🔄 Flip 180°</button>

        {/* Flip */}
        <button onClick={() => setFlipH(!flipH)} style={btnStyle(flipH)}>↔ Flip H</button>
        <button onClick={() => setFlipV(!flipV)} style={btnStyle(flipV)}>↕ Flip V</button>

        {/* Crop */}
        {!cropping ? (
          <button onClick={() => setCropping(true)} style={btnStyle()}>✂️ Crop</button>
        ) : (
          <>
            <button onClick={applyCrop} style={btnStyle(true)}>✅ Apply Crop</button>
            <button onClick={() => { setCropping(false); setCropStart(null); setCropEnd(null); draw(); }} style={btnStyle()}>Cancel</button>
          </>
        )}

        {/* Brightness/Contrast */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: DIM, fontSize: 11 }}>☀️</span>
          <input type="range" min={50} max={150} value={brightness} onChange={e => setBrightness(Number(e.target.value))} style={{ width: 80, accentColor: GOLD }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: DIM, fontSize: 11 }}>◐</span>
          <input type="range" min={50} max={150} value={contrast} onChange={e => setContrast(Number(e.target.value))} style={{ width: 80, accentColor: GOLD }} />
        </div>

        {/* Delete */}
        <div style={{ marginLeft: 'auto' }}>
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: '#EF4444', fontSize: 12, fontWeight: 700 }}>Delete photo?</span>
              <button onClick={handleDelete} style={{ padding: '6px 12px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#EF4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Yes, Delete</button>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: '6px 12px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{ ...btnStyle(), color: '#EF4444', borderColor: 'rgba(239,68,68,.3)' }}>🗑️ Delete</button>
          )}
        </div>
      </div>
    </div>
  );
}
