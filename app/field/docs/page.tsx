'use client';
/**
 * Saguaro Field — Document Viewer with Markup
 * View PDFs, images with canvas markup overlay. Download & share support.
 */
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

const MARKUP_COLORS = [
  { name: 'Red', value: '#EF4444' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Yellow', value: '#FACC15' },
];

const LINE_WIDTHS = [
  { name: 'Thin', value: 2 },
  { name: 'Medium', value: 4 },
  { name: 'Thick', value: 8 },
];

interface DocFile {
  id: string;
  name?: string;
  filename?: string;
  file_name?: string;
  type?: string;
  mime_type?: string;
  url?: string;
  file_url?: string;
  date?: string;
  created_at?: string;
  size?: number;
  file_size?: number;
  category?: string;
}

function getFileName(doc: DocFile): string {
  return doc.name || doc.filename || doc.file_name || 'Unnamed';
}

function getFileUrl(doc: DocFile): string {
  return doc.url || doc.file_url || '';
}

function getFileDate(doc: DocFile): string {
  return doc.date || doc.created_at || '';
}

function getFileSize(doc: DocFile): number {
  return doc.size || doc.file_size || 0;
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(d?: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getFileType(doc: DocFile): 'pdf' | 'image' | 'other' {
  const name = getFileName(doc).toLowerCase();
  const mime = (doc.type || doc.mime_type || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('image') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(name)) return 'image';
  return 'other';
}

function FileIcon({ type }: { type: 'pdf' | 'image' | 'other' }) {
  if (type === 'pdf') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2} width={20} height={20}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <text x="7" y="18" fill={RED} stroke="none" fontSize="7" fontWeight="bold">PDF</text>
      </svg>
    );
  }
  if (type === 'image') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={2} width={20} height={20}>
        <rect x={3} y={3} width={18} height={18} rx={2}/><circle cx={8.5} cy={8.5} r={1.5}/><polyline points="21 15 16 10 5 21"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={2} width={20} height={20}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
  );
}

interface Stroke {
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
}

function DocsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [files, setFiles] = useState<DocFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DocFile | null>(null);
  const [fullScreen, setFullScreen] = useState(false);

  // Markup state
  const [markupMode, setMarkupMode] = useState(false);
  const [markupColor, setMarkupColor] = useState(MARKUP_COLORS[0].value);
  const [lineWidth, setLineWidth] = useState(LINE_WIDTHS[1].value);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    fetch(`/api/projects/${projectId}/files`)
      .then((r) => r.ok ? r.json() : { files: [] })
      .then((d) => setFiles(d.files || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  // Draw strokes on canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }, [strokes]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Resize canvas to match container
  useEffect(() => {
    if (!markupMode || !canvasRef.current || !containerRef.current) return;
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      redrawCanvas();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [markupMode, selected, redrawCanvas]);

  function getCanvasPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (!markupMode) return;
    e.preventDefault();
    setIsDrawing(true);
    const pos = getCanvasPos(e);
    setStrokes((prev) => [...prev, { points: [pos], color: markupColor, width: lineWidth }]);
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || !markupMode) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    setStrokes((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last) {
        last.points = [...last.points, pos];
      }
      return updated;
    });
  }

  function handlePointerUp() {
    setIsDrawing(false);
  }

  function handleUndo() {
    setStrokes((prev) => prev.slice(0, -1));
  }

  function handleClearAll() {
    setStrokes([]);
  }

  async function handleSaveMarkup() {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) { showToast('Failed to capture markup.'); setSaving(false); return; }
      const fd = new FormData();
      fd.append('file', blob, `markup-${Date.now()}.png`);
      fd.append('projectId', projectId);
      fd.append('category', 'Markup');
      fd.append('caption', `Markup on ${getFileName(selected!)}`);
      const res = await fetch('/api/photos/upload', { method: 'POST', body: fd });
      if (res.ok) {
        showToast('Markup saved successfully.');
        setMarkupMode(false);
        setStrokes([]);
      } else {
        showToast('Failed to save markup.');
      }
    } catch {
      showToast('Error saving markup.');
    }
    setSaving(false);
  }

  function handleDownload() {
    if (!selected) return;
    const url = getFileUrl(selected);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = getFileName(selected);
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleShare() {
    if (!selected) return;
    const url = getFileUrl(selected);
    if (navigator.share) {
      try {
        await navigator.share({ title: getFileName(selected), url });
      } catch {
        // user cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        showToast('Link copied to clipboard.');
      } catch {
        showToast('Unable to share.');
      }
    }
  }

  // Viewer
  if (selected) {
    const fileType = getFileType(selected);
    const url = getFileUrl(selected);
    const containerStyle: React.CSSProperties = fullScreen
      ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column' }
      : { padding: '18px 16px', minHeight: '100vh', background: '#060C15' };

    return (
      <div style={containerStyle}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: fullScreen ? '12px 16px' : '0 0 12px', background: fullScreen ? 'rgba(6,12,21,.95)' : 'transparent' }}>
          <button onClick={() => { if (fullScreen) { setFullScreen(false); } else { setSelected(null); setMarkupMode(false); setStrokes([]); } }} style={backBtn}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
            <span style={{ marginLeft: 6, fontSize: 13 }}>{fullScreen ? 'Exit Full Screen' : 'Back'}</span>
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setFullScreen(!fullScreen)} style={iconBtn} title="Full Screen">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}>
                {fullScreen ? (<><polyline points="4 14 4 20 10 20"/><polyline points="20 10 20 4 14 4"/><line x1={14} y1={10} x2={21} y2={3}/><line x1={3} y1={21} x2={10} y2={14}/></>) : (<><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1={21} y1={3} x2={14} y2={10}/><line x1={3} y1={21} x2={10} y2={14}/></>)}
              </svg>
            </button>
            <button onClick={handleDownload} style={iconBtn} title="Download">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg>
            </button>
            <button onClick={handleShare} style={iconBtn} title="Share">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><circle cx={18} cy={5} r={3}/><circle cx={6} cy={12} r={3}/><circle cx={18} cy={19} r={3}/><line x1={8.59} y1={13.51} x2={15.42} y2={17.49}/><line x1={15.41} y1={6.51} x2={8.59} y2={10.49}/></svg>
            </button>
            {(fileType === 'pdf' || fileType === 'image') && (
              <button onClick={() => { setMarkupMode(!markupMode); if (markupMode) setStrokes([]); }} style={{ ...iconBtn, background: markupMode ? GOLD : undefined, color: markupMode ? '#000' : DIM }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx={11} cy={11} r={2}/></svg>
              </button>
            )}
          </div>
        </div>

        {toast && (
          <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, color: GREEN, fontSize: 12, textAlign: 'center' }}>{toast}</div>
        )}

        {/* Markup toolbar */}
        {markupMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: RAISED, borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: DIM, fontWeight: 600 }}>Color:</span>
            {MARKUP_COLORS.map((c) => (
              <button key={c.value} onClick={() => setMarkupColor(c.value)}
                style={{ width: 24, height: 24, borderRadius: 12, background: c.value, border: markupColor === c.value ? '3px solid #fff' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
            ))}
            <span style={{ fontSize: 11, color: DIM, fontWeight: 600, marginLeft: 8 }}>Width:</span>
            {LINE_WIDTHS.map((w) => (
              <button key={w.name} onClick={() => setLineWidth(w.value)}
                style={{ padding: '3px 8px', borderRadius: 6, background: lineWidth === w.value ? GOLD : 'transparent', border: `1px solid ${lineWidth === w.value ? GOLD : BORDER}`, color: lineWidth === w.value ? '#000' : DIM, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                {w.name}
              </button>
            ))}
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <button onClick={handleUndo} disabled={strokes.length === 0} style={{ ...smallBtn, opacity: strokes.length === 0 ? 0.4 : 1 }}>Undo</button>
              <button onClick={handleClearAll} disabled={strokes.length === 0} style={{ ...smallBtn, opacity: strokes.length === 0 ? 0.4 : 1 }}>Clear</button>
              <button onClick={handleSaveMarkup} disabled={strokes.length === 0 || saving} style={{ ...smallBtn, background: GREEN, color: '#000', fontWeight: 700, opacity: strokes.length === 0 || saving ? 0.4 : 1 }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Document viewer */}
        <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'auto', touchAction: markupMode ? 'none' : 'auto' }}>
          {fileType === 'pdf' && url && (
            <iframe src={url} style={{ width: '100%', height: '100%', minHeight: fullScreen ? '100%' : '70vh', border: 'none', background: '#fff' }} />
          )}
          {fileType === 'image' && url && (
            <img src={url} alt={getFileName(selected)} style={{ width: '100%', height: 'auto', display: 'block' }} />
          )}
          {fileType === 'other' && (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: DIM }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={48} height={48} style={{ marginBottom: 12 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <p style={{ margin: '0 0 12px', fontSize: 15, color: TEXT }}>Preview not available</p>
              <p style={{ margin: 0, fontSize: 13 }}>Download to view this file.</p>
            </div>
          )}
          {/* Canvas overlay for markup */}
          {markupMode && (
            <canvas
              ref={canvasRef}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
            />
          )}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div style={{ padding: '18px 16px', minHeight: '100vh', background: '#060C15' }}>
      <button onClick={() => router.back()} style={backBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
      </button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Documents</h1>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: DIM }}>Project files and documents</p>

      {toast && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, color: GREEN, fontSize: 12, textAlign: 'center' }}>{toast}</div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading documents...</div>
      ) : files.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={40} height={40} style={{ marginBottom: 8 }}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
          <p style={{ margin: 0, fontSize: 14 }}>No documents found for this project.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {files.map((f) => {
            const fType = getFileType(f);
            const fName = getFileName(f);
            const fDate = getFileDate(f);
            const fSize = getFileSize(f);
            return (
              <button
                key={f.id}
                onClick={() => setSelected(f)}
                style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', textAlign: 'left', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <FileIcon type={fType} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fName}</p>
                  <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                    {fDate && <span style={{ fontSize: 11, color: DIM }}>{formatDate(fDate)}</span>}
                    {fSize > 0 && <span style={{ fontSize: 11, color: DIM }}>{formatSize(fSize)}</span>}
                    {f.category && <span style={{ fontSize: 11, color: GOLD }}>{f.category}</span>}
                  </div>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={2} width={16} height={16}><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FieldDocsPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}><DocsPage /></Suspense>;
}

const backBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#8BAAC8', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'flex', alignItems: 'center',
};

const iconBtn: React.CSSProperties = {
  background: 'rgba(13,29,46,.8)', border: `1px solid #1E3A5F`, borderRadius: 8, padding: 6, color: '#8BAAC8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const smallBtn: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 6, background: 'transparent', border: `1px solid #1E3A5F`, color: '#8BAAC8', fontSize: 11, cursor: 'pointer',
};
