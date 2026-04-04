'use client';
import React, { useState, useRef, useCallback, useEffect } from 'react';

const GOLD = '#C8960F', DARK = '#07101C', BORDER = '#1E3A5F', TEXT = '#F0F4FF', DIM = '#8BAAC8';
const RED = '#EF4444', GREEN = '#22C55E';

interface PhotoEditorProps {
  src: string;
  photoId?: string;
  onSave?: (blob: Blob, photoId?: string) => void | Promise<void>;
  onDelete?: (photoId?: string) => void | Promise<void>;
  onClose: () => void;
}

type Tool = 'crop' | 'rotate' | 'draw' | 'text' | 'arrow' | null;

export default function PhotoEditor({ src, photoId, onSave, onDelete, onClose }: PhotoEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>(null);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saving, setSaving] = useState(false);
  const [drawColor, setDrawColor] = useState('#EF4444');
  const [drawWidth, setDrawWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [annotations, setAnnotations] = useState<Array<{ type: string; points: number[][]; color: string; width: number; text?: string }>>([]);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const currentPath = useRef<number[][]>([]);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      renderCanvas();
    };
    img.src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => { renderCanvas(); }, [rotation, flipH, flipV, brightness, contrast, annotations]);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const isRotated = rotation % 180 !== 0;
    canvas.width = isRotated ? h : w;
    canvas.height = isRotated ? w : h;

    ctx.save();
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();

    // Draw annotations
    ctx.filter = 'none';
    for (const ann of annotations) {
      if (ann.type === 'draw' && ann.points.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(ann.points[0][0], ann.points[0][1]);
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i][0], ann.points[i][1]);
        }
        ctx.stroke();
      }
      if (ann.type === 'arrow' && ann.points.length === 2) {
        const [start, end] = ann.points;
        ctx.beginPath();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.width;
        ctx.moveTo(start[0], start[1]);
        ctx.lineTo(end[0], end[1]);
        ctx.stroke();
        // Arrowhead
        const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
        const headLen = 15;
        ctx.beginPath();
        ctx.moveTo(end[0], end[1]);
        ctx.lineTo(end[0] - headLen * Math.cos(angle - Math.PI / 6), end[1] - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(end[0], end[1]);
        ctx.lineTo(end[0] - headLen * Math.cos(angle + Math.PI / 6), end[1] - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
      if (ann.type === 'text' && ann.text && ann.points.length > 0) {
        ctx.font = `bold ${Math.max(16, ann.width * 6)}px -apple-system, sans-serif`;
        ctx.fillStyle = ann.color;
        ctx.fillText(ann.text, ann.points[0][0], ann.points[0][1]);
      }
    }

    // Draw crop overlay
    if (cropStart && cropEnd && tool === 'crop') {
      const sx = Math.min(cropStart.x, cropEnd.x);
      const sy = Math.min(cropStart.y, cropEnd.y);
      const sw = Math.abs(cropEnd.x - cropStart.x);
      const sh = Math.abs(cropEnd.y - cropStart.y);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.clearRect(sx, sy, sw, sh);
      ctx.drawImage(canvas, sx, sy, sw, sh, sx, sy, sw, sh);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
    }
  }, [rotation, flipH, flipV, brightness, contrast, annotations, cropStart, cropEnd, tool]);

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getCanvasPos(e);
    if (tool === 'crop') {
      setCropStart(pos);
      setCropEnd(pos);
      setIsCropping(true);
    } else if (tool === 'draw') {
      setIsDrawing(true);
      currentPath.current = [[pos.x, pos.y]];
    } else if (tool === 'arrow') {
      setIsDrawing(true);
      currentPath.current = [[pos.x, pos.y]];
    } else if (tool === 'text') {
      setTextPos(pos);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool === 'crop' && isCropping) {
      setCropEnd(getCanvasPos(e));
    } else if ((tool === 'draw') && isDrawing) {
      const pos = getCanvasPos(e);
      currentPath.current.push([pos.x, pos.y]);
      // Live preview
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && currentPath.current.length > 1) {
        const pts = currentPath.current;
        ctx.beginPath();
        ctx.strokeStyle = drawColor;
        ctx.lineWidth = drawWidth;
        ctx.lineCap = 'round';
        ctx.moveTo(pts[pts.length - 2][0], pts[pts.length - 2][1]);
        ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        ctx.stroke();
      }
    }
  };

  const handlePointerUp = () => {
    if (tool === 'crop' && isCropping) {
      setIsCropping(false);
    } else if (tool === 'draw' && isDrawing) {
      setIsDrawing(false);
      if (currentPath.current.length > 1) {
        setAnnotations(prev => [...prev, { type: 'draw', points: [...currentPath.current], color: drawColor, width: drawWidth }]);
      }
      currentPath.current = [];
    } else if (tool === 'arrow' && isDrawing) {
      setIsDrawing(false);
      // For arrow we just stored start, now get end
    }
  };

  const applyCrop = () => {
    if (!cropStart || !cropEnd || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const sx = Math.min(cropStart.x, cropEnd.x);
    const sy = Math.min(cropStart.y, cropEnd.y);
    const sw = Math.abs(cropEnd.x - cropStart.x);
    const sh = Math.abs(cropEnd.y - cropStart.y);
    if (sw < 10 || sh < 10) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sw;
    tempCanvas.height = sh;
    const tCtx = tempCanvas.getContext('2d');
    if (!tCtx) return;
    tCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

    const newImg = new Image();
    newImg.onload = () => {
      imgRef.current = newImg;
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setCropStart(null);
      setCropEnd(null);
      setTool(null);
      setAnnotations([]);
      renderCanvas();
    };
    newImg.src = tempCanvas.toDataURL('image/jpeg', 0.92);
  };

  const addTextAnnotation = () => {
    if (!textInput.trim() || !textPos) return;
    setAnnotations(prev => [...prev, { type: 'text', points: [[textPos.x, textPos.y]], color: drawColor, width: drawWidth, text: textInput }]);
    setTextInput('');
    setTextPos(null);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !onSave) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Failed to export')), 'image/jpeg', 0.92);
      });
      await onSave(blob, photoId);
      onClose();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm('Delete this photo permanently?')) return;
    setSaving(true);
    try {
      await onDelete(photoId);
      onClose();
    } catch { /* */ } finally { setSaving(false); }
  };

  const tools: Array<{ id: Tool; label: string; icon: string }> = [
    { id: 'crop', label: 'Crop', icon: '✂️' },
    { id: 'rotate', label: 'Rotate', icon: '🔄' },
    { id: 'draw', label: 'Draw', icon: '✏️' },
    { id: 'text', label: 'Text', icon: '🔤' },
    { id: 'arrow', label: 'Arrow', icon: '➡️' },
  ];

  const colors = ['#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#8B5CF6', '#FFFFFF'];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.95)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '6px 10px' }}>Cancel</button>
        <span style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>Edit Photo</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {onDelete && (
            <button onClick={handleDelete} disabled={saving} style={{ background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, color: RED, fontSize: 12, fontWeight: 700, padding: '6px 12px', cursor: 'pointer' }}>
              Delete
            </button>
          )}
          {onSave && (
            <button onClick={handleSave} disabled={saving} style={{ background: `linear-gradient(135deg, ${GOLD}, #C8960F)`, border: 'none', borderRadius: 8, color: '#000', fontSize: 12, fontWeight: 800, padding: '6px 14px', cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Canvas area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: tool === 'crop' ? 'crosshair' : tool === 'draw' ? 'crosshair' : tool === 'text' ? 'text' : 'default', borderRadius: 8 }}
        />
      </div>

      {/* Text input overlay */}
      {tool === 'text' && textPos && (
        <div style={{ position: 'absolute', bottom: 160, left: 14, right: 14, display: 'flex', gap: 8 }}>
          <input
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            placeholder="Type annotation text..."
            autoFocus
            style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,.08)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14 }}
          />
          <button onClick={addTextAnnotation} style={{ padding: '10px 18px', background: GOLD, border: 'none', borderRadius: 8, color: '#000', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Add</button>
        </div>
      )}

      {/* Crop confirm */}
      {tool === 'crop' && cropStart && cropEnd && !isCropping && Math.abs(cropEnd.x - cropStart.x) > 10 && (
        <div style={{ position: 'absolute', bottom: 160, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 10 }}>
          <button onClick={applyCrop} style={{ padding: '10px 24px', background: GREEN, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Apply Crop</button>
          <button onClick={() => { setCropStart(null); setCropEnd(null); renderCanvas(); }} style={{ padding: '10px 24px', background: 'rgba(255,255,255,.1)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Reset</button>
        </div>
      )}

      {/* Tool bar */}
      <div style={{ padding: '8px 14px', borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
        {/* Tools row */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
          {tools.map(t => (
            <button key={t.id} onClick={() => {
              if (t.id === 'rotate') {
                setRotation(prev => (prev + 90) % 360);
                return;
              }
              setTool(tool === t.id ? null : t.id);
            }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 14px', background: tool === t.id ? 'rgba(212,160,23,.2)' : 'rgba(255,255,255,.06)', border: `1px solid ${tool === t.id ? GOLD : 'rgba(255,255,255,.1)'}`, borderRadius: 10, color: tool === t.id ? GOLD : DIM, cursor: 'pointer', minWidth: 52 }}>
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 600 }}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Quick actions row */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
          <button onClick={() => setFlipH(!flipH)} style={qBtn}>↔ Flip H</button>
          <button onClick={() => setFlipV(!flipV)} style={qBtn}>↕ Flip V</button>
          <button onClick={() => { setAnnotations(prev => prev.slice(0, -1)); }} style={qBtn} disabled={annotations.length === 0}>↩ Undo</button>
          <button onClick={() => { setAnnotations([]); setRotation(0); setFlipH(false); setFlipV(false); setBrightness(100); setContrast(100); renderCanvas(); }} style={qBtn}>🗑 Reset</button>
        </div>

        {/* Color/size row when drawing */}
        {(tool === 'draw' || tool === 'text' || tool === 'arrow') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 6 }}>
            {colors.map(c => (
              <button key={c} onClick={() => setDrawColor(c)}
                style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: drawColor === c ? '3px solid #fff' : '2px solid rgba(255,255,255,.2)', cursor: 'pointer' }} />
            ))}
            <input type="range" min={1} max={10} value={drawWidth} onChange={e => setDrawWidth(Number(e.target.value))}
              style={{ width: 60, accentColor: GOLD }} />
          </div>
        )}

        {/* Brightness/contrast */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: DIM }}>
            ☀️ <input type="range" min={50} max={150} value={brightness} onChange={e => setBrightness(Number(e.target.value))} style={{ width: 70, accentColor: GOLD }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: DIM }}>
            🔲 <input type="range" min={50} max={150} value={contrast} onChange={e => setContrast(Number(e.target.value))} style={{ width: 70, accentColor: GOLD }} />
          </div>
        </div>
      </div>
    </div>
  );
}

const qBtn: React.CSSProperties = {
  padding: '6px 12px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 8, color: '#8BAAC8', fontSize: 11, fontWeight: 600, cursor: 'pointer',
};
