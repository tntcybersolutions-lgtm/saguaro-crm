'use client';
/**
 * Saguaro Field — Photos
 * Fixed response parsing. Camera capture + gallery with category filter. Offline queue.
 */
import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const GREEN  = '#22C55E';
const BLUE   = '#3B82F6';

const CATEGORIES = ['All', 'Progress', 'Issue', 'Delivery', 'Inspection', 'Safety', 'Completion', 'Other'];
const CAT_COLORS: Record<string, string> = {
  Progress: '#3B82F6', Issue: RED, Delivery: '#F59E0B',
  Inspection: '#8B5CF6', Safety: RED, Completion: '#22C55E', Other: DIM,
};

interface Photo { id: string; url: string; filename: string; category: string; caption: string; uploaded: boolean; created_at: string; }

function PhotosPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [filterCat, setFilterCat] = useState('All');
  const [selected, setSelected] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [online, setOnline] = useState(true);
  const [loadingGallery, setLoadingGallery] = useState(true);

  // Markup state
  const [markupMode, setMarkupMode] = useState(false);
  const [markupColor, setMarkupColor] = useState('#EF4444');
  const [markupStrokes, setMarkupStrokes] = useState<Array<{x:number;y:number;drawing:boolean}[]>>([]);
  const [currentStroke, setCurrentStroke] = useState<{x:number;y:number;drawing:boolean}[]>([]);

  // Pending
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState('');
  const [pendingCat, setPendingCat] = useState('Progress');
  const [pendingCaption, setPendingCaption] = useState('');

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Load gallery from GET /api/photos
  useEffect(() => {
    if (!projectId) { setLoadingGallery(false); return; }
    fetch(`/api/photos?projectId=${projectId}`)
      .then((r) => r.ok ? r.json() : { photos: [] })
      .then((d) => {
        const list: Photo[] = (d.photos || []).map((p: Record<string, unknown>) => ({
          id: String(p.id || ''),
          url: String(p.url || ''),          // FIXED: .url not .file_url
          filename: String(p.filename || ''),
          category: String(p.category || 'Progress'),
          caption: String(p.caption || ''),
          uploaded: true,
          created_at: String(p.created_at || new Date().toISOString()),
        }));
        setPhotos(list);
      })
      .catch(() => {})
      .finally(() => setLoadingGallery(false));
  }, [projectId]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPendingPreview(String(ev.target?.result || ''));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const cancelPending = () => {
    setPendingFile(null);
    setPendingPreview('');
    setPendingCaption('');
    setPendingCat('Progress');
  };

  const uploadPhoto = useCallback(async () => {
    if (!pendingFile) return;
    setUploading(true);

    const localPhoto: Photo = {
      id: `local-${Date.now()}`,
      url: pendingPreview,
      filename: pendingFile.name,
      category: pendingCat,
      caption: pendingCaption,
      uploaded: false,
      created_at: new Date().toISOString(),
    };

    try {
      if (!online) throw new Error('offline');
      const fd = new FormData();
      fd.append('file', pendingFile, pendingFile.name);
      fd.append('category', pendingCat);
      fd.append('caption', pendingCaption);
      if (projectId) fd.append('projectId', projectId);

      const res = await fetch('/api/photos/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();

      // FIXED: API returns photo.url not photo.file_url
      const savedPhoto: Photo = {
        id: String(data.photo?.id || Date.now()),
        url: String(data.photo?.url || pendingPreview),
        filename: String(data.photo?.filename || pendingFile.name),
        category: pendingCat,
        caption: pendingCaption,
        uploaded: true,
        created_at: String(data.photo?.created_at || new Date().toISOString()),
      };
      setPhotos((prev) => [savedPhoto, ...prev]);
    } catch {
      // Queue for offline sync
      const base64 = pendingPreview.split(',')[1] || '';
      await enqueue({
        url: '/api/photos/upload',
        method: 'POST',
        body: null,
        contentType: '',
        isFormData: true,
        formDataEntries: [
          { name: 'file', value: base64, filename: pendingFile.name, type: pendingFile.type },
          { name: 'category', value: pendingCat },
          { name: 'caption', value: pendingCaption },
          ...(projectId ? [{ name: 'projectId', value: projectId }] : []),
        ],
      });
      setPhotos((prev) => [localPhoto, ...prev]);
    }

    cancelPending();
    setUploading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFile, pendingPreview, pendingCat, pendingCaption, projectId, online]);

  const enterMarkup = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMarkupMode(true);
    setMarkupStrokes([]);
    setCurrentStroke([]);
    // Clear canvas on next tick after it mounts
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    }, 50);
  };

  const exitMarkup = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMarkupMode(false);
    setMarkupStrokes([]);
    setCurrentStroke([]);
  };

  const undoStroke = (e: React.MouseEvent) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const newStrokes = markupStrokes.slice(0, -1);
    setMarkupStrokes(newStrokes);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Redraw remaining strokes
    newStrokes.forEach(stroke => {
      ctx.beginPath();
      stroke.forEach((pt, idx) => {
        if (idx === 0) { ctx.moveTo(pt.x, pt.y); }
        else {
          ctx.lineTo(pt.x, pt.y);
          ctx.strokeStyle = markupColor;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      });
    });
  };

  const saveMarkup = (e: React.MouseEvent) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas || !selected) return;
    const dataUrl = canvas.toDataURL('image/png');
    const savedPhoto: Photo = {
      id: `markup-${Date.now()}`,
      url: dataUrl,
      filename: `markup-${selected.filename || 'photo'}.png`,
      category: selected.category,
      caption: `Markup of: ${selected.caption || selected.filename}`,
      uploaded: false,
      created_at: new Date().toISOString(),
    };
    setPhotos(prev => [savedPhoto, ...prev]);
    setMarkupMode(false);
    setMarkupStrokes([]);
    setCurrentStroke([]);
    setSelected(savedPhoto);
  };

  const handleCanvasTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (e.type === 'touchstart') {
      ctx.beginPath();
      ctx.moveTo(x, y);
      setCurrentStroke([{x, y, drawing: false}]);
    } else {
      ctx.lineTo(x, y);
      ctx.strokeStyle = markupColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
      setCurrentStroke(prev => [...prev, {x, y, drawing: true}]);
    }
  };

  const handleCanvasTouchEnd = () => {
    if (currentStroke.length > 0) {
      setMarkupStrokes(prev => [...prev, currentStroke]);
      setCurrentStroke([]);
    }
  };

  // Mouse drawing support (desktop/dev)
  const mouseDrawing = useRef(false);
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    mouseDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setCurrentStroke([{x, y, drawing: false}]);
  };
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mouseDrawing.current) return;
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.strokeStyle = markupColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    setCurrentStroke(prev => [...prev, {x, y, drawing: true}]);
  };
  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    mouseDrawing.current = false;
    if (currentStroke.length > 0) {
      setMarkupStrokes(prev => [...prev, currentStroke]);
      setCurrentStroke([]);
    }
  };

  const filteredPhotos = filterCat === 'All' ? photos : photos.filter((p) => p.category === filterCat);

  return (
    <div style={{ padding: '18px 16px' }}>
      {/* Header */}
      <button onClick={() => router.back()} style={backBtn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg></button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Photos</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: DIM }}>{photos.length} photo{photos.length !== 1 ? 's' : ''} on this project</p>
        </div>
        {!online && <span style={{ fontSize: 12, color: RED, fontWeight: 700 }}>Offline</span>}
      </div>

      {/* Capture button */}
      {!pendingPreview && (
        <>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFilePick} style={{ display: 'none' }} />
          <button
            onClick={() => fileRef.current?.click()}
            style={{ width: '100%', background: RAISED, border: `2px dashed rgba(212,160,23,.5)`, borderRadius: 14, padding: '22px', color: GOLD, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={32} height={32}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx={12} cy={13} r={4}/></svg>
            Take or Upload a Photo
          </button>
        </>
      )}

      {/* Preview + form */}
      {pendingPreview && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingPreview} alt="Preview" style={{ width: '100%', maxHeight: 280, objectFit: 'cover' }} />
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Category chips */}
            <div>
              <label style={lbl}>Category</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPendingCat(c)}
                    style={{ background: pendingCat === c ? `rgba(${hexRgb(CAT_COLORS[c])}, .2)` : 'transparent', border: `1px solid ${pendingCat === c ? CAT_COLORS[c] : BORDER}`, borderRadius: 20, padding: '5px 12px', color: pendingCat === c ? CAT_COLORS[c] : DIM, fontSize: 13, fontWeight: pendingCat === c ? 700 : 400, cursor: 'pointer' }}
                  >{c}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Caption</label>
              <input type="text" value={pendingCaption} onChange={(e) => setPendingCaption(e.target.value)} placeholder="Describe what you're capturing..." style={{ ...inp, marginTop: 5 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={cancelPending} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, color: DIM, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
              <button
                type="button"
                onClick={uploadPhoto}
                disabled={uploading}
                style={{ flex: 2, background: uploading ? '#1E3A5F' : GOLD, border: 'none', borderRadius: 10, padding: 14, color: uploading ? DIM : '#000', fontSize: 15, fontWeight: 800, cursor: uploading ? 'wait' : 'pointer' }}
              >
                {uploading ? 'Uploading...' : online ? 'Upload Photo' : 'Save Offline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category filter */}
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCat(c)}
              style={{ flexShrink: 0, background: filterCat === c ? (c === 'All' ? 'rgba(212,160,23,.2)' : `rgba(${hexRgb(CAT_COLORS[c])}, .2)`) : 'transparent', border: `1px solid ${filterCat === c ? (c === 'All' ? GOLD : CAT_COLORS[c]) : BORDER}`, borderRadius: 20, padding: '5px 12px', color: filterCat === c ? (c === 'All' ? GOLD : CAT_COLORS[c]) : DIM, fontSize: 12, fontWeight: filterCat === c ? 700 : 400, cursor: 'pointer' }}
            >
              {c}
              {c !== 'All' && photos.filter((p) => p.category === c).length > 0 && (
                <span style={{ marginLeft: 4, opacity: 0.7 }}>({photos.filter((p) => p.category === c).length})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Gallery grid */}
      {loadingGallery ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: DIM, fontSize: 14 }}>Loading photos...</div>
      ) : filteredPhotos.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {filteredPhotos.map((p) => (
            <div key={p.id} onClick={() => setSelected(p)} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: `1px solid ${BORDER}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.caption} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              {!p.uploaded && (
                <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(239,68,68,.9)', borderRadius: 4, padding: '1px 5px', fontSize: 9, color: '#fff', fontWeight: 700 }}>PENDING</div>
              )}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(0,0,0,.75))', padding: '10px 5px 4px' }}>
                <div style={{ display: 'inline-block', background: `rgba(${hexRgb(CAT_COLORS[p.category] || DIM)}, .6)`, borderRadius: 3, padding: '1px 5px', fontSize: 9, color: '#fff', fontWeight: 700 }}>{p.category}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !pendingPreview && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: DIM }}>
            <div style={{ display: 'flex', justifyContent: 'center', color: DIM, marginBottom: 8, opacity: 0.5 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx={12} cy={13} r={4}/></svg></div>
            <p style={{ margin: 0, fontSize: 14 }}>{filterCat === 'All' ? 'No photos yet. Tap above to take the first one.' : `No ${filterCat} photos.`}</p>
          </div>
        )
      )}

      {/* Lightbox */}
      {selected && (
        <div
          onClick={() => { if (!markupMode) { setSelected(null); setMarkupMode(false); } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.96)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          {/* Image + canvas wrapper */}
          <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '72vh', display: 'flex' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.url}
              alt={selected.caption}
              style={{ maxWidth: '100%', maxHeight: '72vh', borderRadius: markupMode ? 0 : 12, objectFit: 'contain', display: 'block' }}
              id="lightbox-img"
            />
            {/* Markup canvas overlay */}
            {markupMode && (
              <canvas
                ref={canvasRef}
                width={canvasRef.current?.offsetWidth || 320}
                height={canvasRef.current?.offsetHeight || 240}
                onTouchStart={handleCanvasTouch}
                onTouchMove={handleCanvasTouch}
                onTouchEnd={handleCanvasTouchEnd}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  cursor: 'crosshair',
                  touchAction: 'none',
                  borderRadius: 0,
                  zIndex: 10,
                }}
              />
            )}
          </div>

          {/* Controls */}
          <div
            onClick={e => e.stopPropagation()}
            style={{ marginTop: 14, textAlign: 'center', width: '100%' }}
          >
            {/* Category + Markup toggle row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ background: `rgba(${hexRgb(CAT_COLORS[selected.category] || DIM)}, .25)`, border: `1px solid ${CAT_COLORS[selected.category] || DIM}`, borderRadius: 20, padding: '3px 14px', fontSize: 12, color: CAT_COLORS[selected.category] || DIM, fontWeight: 700 }}>
                {selected.category}
              </span>
              {!markupMode ? (
                <button
                  onClick={enterMarkup}
                  style={{ background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.4)', borderRadius: 20, padding: '3px 14px', fontSize: 12, color: AMBER, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Markup
                </button>
              ) : (
                <span style={{ background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 20, padding: '3px 14px', fontSize: 12, color: RED, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Drawing...
                </span>
              )}
            </div>

            {/* Markup toolbar */}
            {markupMode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                {/* Color picker */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: DIM }}>Color:</span>
                  {[RED, AMBER, BLUE, GREEN].map(color => (
                    <button
                      key={color}
                      onClick={e => { e.stopPropagation(); setMarkupColor(color); }}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: color, cursor: 'pointer',
                        border: markupColor === color ? '3px solid #fff' : '2px solid transparent',
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </div>
                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={undoStroke}
                    disabled={markupStrokes.length === 0}
                    style={{ background: 'rgba(255,255,255,.08)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 14px', color: markupStrokes.length === 0 ? DIM : TEXT, fontSize: 13, cursor: markupStrokes.length === 0 ? 'default' : 'pointer', fontWeight: 600 }}
                  >
                    ↩ Undo
                  </button>
                  <button
                    onClick={exitMarkup}
                    style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '8px 14px', color: RED, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveMarkup}
                    style={{ background: GREEN, border: 'none', borderRadius: 10, padding: '8px 14px', color: '#000', fontSize: 13, cursor: 'pointer', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Markup
                  </button>
                </div>
              </div>
            )}

            {!markupMode && (
              <>
                {selected.caption && <p style={{ margin: '8px 0 0', color: TEXT, fontSize: 15 }}>{selected.caption}</p>}
                <p style={{ margin: '6px 0 0', color: DIM, fontSize: 12 }}>
                  {new Date(selected.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · Tap outside to close
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FieldPhotosPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}><PhotosPage /></Suspense>;
}

const lbl: React.CSSProperties = { fontSize: 12, color: '#8BAAC8', fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '11px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8BAAC8', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
