'use client';
/**
 * Saguaro Field -- Enhanced Floor Plan Viewer
 * Full rewrite: keeps all original pin functionality + adds:
 *   a) Room polygon editor with progress overlays
 *   b) Progress heatmap by room
 *   c) Enhanced pins (thumbnails, clustering, measurement/issue types, GPS locate)
 *   d) Drawing markup tools (freehand, line, arrow, text, highlight)
 */
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

/* ââ Design Tokens ââ */
const GOLD = '#D4A017';
const CARD = '#1A1F2E';
const BASE = '#0F1419';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const GREEN = '#22C55E';
const BLUE = '#3B82F6';
const RED = '#EF4444';
const BORDER = '#1E3A5F';

const glass: React.CSSProperties = {
  background: 'rgba(26,31,46,0.7)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 16,
};
const inp: React.CSSProperties = {
  width: '100%', background: BASE, border: `1px solid ${BORDER}`,
  borderRadius: 10, padding: '11px 14px', color: TEXT, fontSize: 15, outline: 'none',
  boxSizing: 'border-box' as const,
};

function hr(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}

/* ââ Pin Types (original + new measurement & issue) ââ */
const PIN_TYPES: Record<string, { color: string; icon: string; label: string }> = {
  location: { color: BLUE, icon: '\u{1F4CD}', label: 'Location' },
  photo:    { color: GREEN, icon: '\u{1F4F7}', label: 'Photo' },
  punch:    { color: RED, icon: '\u{26A0}\u{FE0F}', label: 'Punch' },
  rfi:      { color: '#8B5CF6', icon: '\u{2753}', label: 'RFI' },
  note:     { color: GOLD, icon: '\u{1F4DD}', label: 'Note' },
  measurement: { color: '#06B6D4', icon: '\u{1F4CF}', label: 'Measurement' },
  issue:    { color: '#F97316', icon: '\u{26A0}', label: 'Issue' },
};

/* ââ Heatmap colors ââ */
const HEAT_COLORS: { max: number; color: string; label: string }[] = [
  { max: 25, color: '#EF4444', label: '0-25%' },
  { max: 50, color: '#F97316', label: '26-50%' },
  { max: 75, color: '#EAB308', label: '51-75%' },
  { max: 99, color: '#3B82F6', label: '76-99%' },
  { max: 100, color: '#22C55E', label: '100%' },
];
function heatColor(pct: number): string {
  for (const h of HEAT_COLORS) { if (pct <= h.max) return h.color; }
  return GREEN;
}

/* ââ Markup colors ââ */
const MARKUP_COLORS = [RED, BLUE, GREEN, GOLD, '#FFFFFF'];

/* ââ Types ââ */
interface Drawing {
  id: string; sheet: string; name: string; description: string;
  file_url: string; thumbnail_url?: string;
}
interface FloorPin {
  id: string; drawing_id: string; x_pct: number; y_pct: number;
  label: string; pin_type: string; linked_item_type?: string;
  linked_item_id?: string; note?: string; created_at: string;
  photo_url?: string;
}
interface RoomPolygon {
  id: string; project_id: string; drawing_id: string;
  room_name: string; floor_id?: string;
  polygon_points: { x: number; y: number }[];
  percent_complete?: number; color?: string;
}
type MarkupTool = 'freehand' | 'line' | 'arrow' | 'text' | 'highlight';
interface MarkupAction {
  tool: MarkupTool; color: string;
  points: { x: number; y: number }[];
  text?: string;
}
type View = 'list' | 'viewer';
type Mode = 'view' | 'pin' | 'room' | 'markup';

/* ââ Cluster helper ââ */
function clusterPins(pins: FloorPin[], threshold: number): { pins: FloorPin[]; x: number; y: number }[] {
  const used = new Set<string>();
  const clusters: { pins: FloorPin[]; x: number; y: number }[] = [];
  for (const pin of pins) {
    if (used.has(pin.id)) continue;
    const group = [pin];
    used.add(pin.id);
    for (const other of pins) {
      if (used.has(other.id)) continue;
      const d = Math.sqrt((pin.x_pct - other.x_pct) ** 2 + (pin.y_pct - other.y_pct) ** 2);
      if (d < threshold) { group.push(other); used.add(other.id); }
    }
    const avgX = group.reduce((s, p) => s + p.x_pct, 0) / group.length;
    const avgY = group.reduce((s, p) => s + p.y_pct, 0) / group.length;
    clusters.push({ pins: group, x: avgX, y: avgY });
  }
  return clusters;
}

/* ================================================================ */
function FloorPlanPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const paramProjectId = searchParams.get('projectId') || '';
  const [projectId, setProjectId] = useState(paramProjectId);

  /* refs */
  const imgRef = useRef<HTMLDivElement>(null);
  const markupCanvasRef = useRef<HTMLCanvasElement>(null);

  /* core state */
  const [view, setView] = useState<View>('list');
  const [mode, setMode] = useState<Mode>('view');
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);
  const [pins, setPins] = useState<FloorPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [zoom, setZoom] = useState(1);

  /* Pin placement */
  const [pendingPin, setPendingPin] = useState<{ x_pct: number; y_pct: number } | null>(null);
  const [pinLabel, setPinLabel] = useState('');
  const [pinType, setPinType] = useState('location');
  const [pinNote, setPinNote] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  /* GPS */
  const [gpsPosition, setGpsPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [showGpsOnPlan, setShowGpsOnPlan] = useState(false);

  /* Pull to refresh */
  const [touchStart, setTouchStart] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);

  /* Room polygons */
  const [rooms, setRooms] = useState<RoomPolygon[]>([]);
  const [drawingRoom, setDrawingRoom] = useState(false);
  const [roomPoints, setRoomPoints] = useState<{ x: number; y: number }[]>([]);
  const [roomName, setRoomName] = useState('');
  const [roomFloor, setRoomFloor] = useState('');
  const [savingRoom, setSavingRoom] = useState(false);

  /* Progress heatmap */
  const [showProgress, setShowProgress] = useState(false);

  /* Markup */
  const [markupMode, setMarkupMode] = useState(false);
  const [markupTool, setMarkupTool] = useState<MarkupTool>('freehand');
  const [markupColor, setMarkupColor] = useState(RED);
  const [markupActions, setMarkupActions] = useState<MarkupAction[]>([]);
  const [currentMarkup, setCurrentMarkup] = useState<MarkupAction | null>(null);
  const [isDrawingMarkup, setIsDrawingMarkup] = useState(false);
  const [markupText, setMarkupText] = useState('');
  const [savingMarkup, setSavingMarkup] = useState(false);

  /* ---- init projectId ---- */
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('sag_active_project') : null;
    if (!projectId && stored) setProjectId(stored);
  }, [projectId]);

  /* ---- online/offline ---- */
  useEffect(() => {
    setOnline(navigator.onLine);
    const goOn = () => setOnline(true);
    const goOff = () => setOnline(false);
    window.addEventListener('online', goOn);
    window.addEventListener('offline', goOff);
    return () => { window.removeEventListener('online', goOn); window.removeEventListener('offline', goOff); };
  }, []);

  /* ---- fetch drawings ---- */
  const fetchDrawings = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/drawings/list?projectId=${projectId}`);
      if (res.ok) {
        const d = await res.json();
        setDrawings(d.drawings || d.data || []);
      }
    } catch { /* offline */ }
    setLoading(false);
  }, [projectId]);
  useEffect(() => { fetchDrawings(); }, [fetchDrawings]);

  /* ---- fetch pins ---- */
  const fetchPins = useCallback(async (drawingId?: string) => {
    if (!projectId) return;
    try {
      let url = `/api/field/floor-plan-pins?projectId=${projectId}`;
      if (drawingId) url += `&drawingId=${drawingId}`;
      const res = await fetch(url);
      if (res.ok) { const d = await res.json(); setPins(d.pins || d.data || []); }
    } catch { /* offline */ }
  }, [projectId]);

  /* ---- fetch rooms ---- */
  const fetchRooms = useCallback(async (drawingId?: string) => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/field/room-progress?project_id=${projectId}`);
      if (res.ok) {
        const d = await res.json();
        const all = (d.rooms || []).filter((r: any) => r.polygon_points);
        if (drawingId) setRooms(all.filter((r: any) => r.drawing_id === drawingId));
        else setRooms(all);
      }
    } catch { /* offline */ }
  }, [projectId]);

  /* ---- open drawing ---- */
  const openDrawing = (d: Drawing) => {
    setSelectedDrawing(d);
    setView('viewer');
    setMode('view');
    setZoom(1);
    fetchPins(d.id);
    fetchRooms(d.id);
  };

  /* ---- image tap handler ---- */
  const handleImageTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x_pct = ((e.clientX - rect.left) / rect.width) * 100;
    const y_pct = ((e.clientY - rect.top) / rect.height) * 100;

    if (mode === 'pin') {
      setPendingPin({ x_pct, y_pct });
    }

    if (mode === 'room' && drawingRoom) {
      const newPt = { x: x_pct, y: y_pct };
      /* close polygon if tap near first point */
      if (roomPoints.length >= 3) {
        const first = roomPoints[0];
        const d = Math.sqrt((x_pct - first.x) ** 2 + (y_pct - first.y) ** 2);
        if (d < 3) { /* close! */ setDrawingRoom(false); return; }
      }
      setRoomPoints(prev => [...prev, newPt]);
    }
  };

  /* ---- save pin ---- */
  const savePin = async () => {
    if (!pendingPin || !selectedDrawing || !pinLabel.trim()) return;
    setSavingPin(true);
    const payload = {
      projectId, drawing_id: selectedDrawing.id,
      x_pct: pendingPin.x_pct, y_pct: pendingPin.y_pct,
      label: pinLabel.trim(), pin_type: pinType, note: pinNote.trim(),
    };
    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/field/floor-plan-pins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      const d = await res.json();
      setPins(prev => [...prev, d.pin || { id: `local-${Date.now()}`, ...payload, created_at: new Date().toISOString() }]);
    } catch {
      await enqueue({ url: '/api/field/floor-plan-pins', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      setPins(prev => [...prev, { id: `local-${Date.now()}`, ...payload, created_at: new Date().toISOString() } as FloorPin]);
    }
    setPendingPin(null); setPinLabel(''); setPinType('location'); setPinNote('');
    setMode('view'); setSavingPin(false);
  };

  /* ---- save room polygon ---- */
  const saveRoom = async () => {
    if (roomPoints.length < 3 || !roomName.trim() || !selectedDrawing) return;
    setSavingRoom(true);
    const payload = {
      project_id: projectId, drawing_id: selectedDrawing.id,
      room_name: roomName.trim(), floor_id: roomFloor || null,
      polygon_points: roomPoints,
    };
    try {
      const res = await fetch('/api/field/room-progress', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const d = await res.json();
        setRooms(prev => [...prev, { ...payload, id: d.room?.id || `local-${Date.now()}`, percent_complete: 0 } as RoomPolygon]);
      }
    } catch { /* offline */ }
    setRoomPoints([]); setRoomName(''); setRoomFloor('');
    setDrawingRoom(false); setSavingRoom(false); setMode('view');
  };

  /* ---- GPS ---- */
  const getGPS = () => {
    if (!navigator.geolocation) { setGpsError('Geolocation not supported'); return; }
    setGpsLoading(true); setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGpsPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsLoading(false); setShowGpsOnPlan(true); },
      (err) => { setGpsError(err.message); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  /* ---- Markup drawing handlers ---- */
  const handleMarkupStart = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!markupMode || !markupCanvasRef.current) return;
    const rect = markupCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (markupTool === 'text') {
      const t = prompt('Enter text label:');
      if (t) {
        setMarkupActions(prev => [...prev, { tool: 'text', color: markupColor, points: [{ x, y }], text: t }]);
      }
      return;
    }
    setIsDrawingMarkup(true);
    setCurrentMarkup({ tool: markupTool, color: markupColor, points: [{ x, y }] });
  };

  const handleMarkupMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingMarkup || !currentMarkup || !markupCanvasRef.current) return;
    const rect = markupCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (markupTool === 'freehand' || markupTool === 'highlight') {
      setCurrentMarkup(prev => prev ? { ...prev, points: [...prev.points, { x, y }] } : null);
    } else {
      /* line, arrow: keep only start + current end */
      setCurrentMarkup(prev => prev ? { ...prev, points: [prev.points[0], { x, y }] } : null);
    }
  };

  const handleMarkupEnd = () => {
    if (!isDrawingMarkup || !currentMarkup) return;
    setIsDrawingMarkup(false);
    if (currentMarkup.points.length >= 2) {
      setMarkupActions(prev => [...prev, currentMarkup]);
    }
    setCurrentMarkup(null);
  };

  /* ---- render markup to canvas ---- */
  useEffect(() => {
    const canvas = markupCanvasRef.current;
    if (!canvas || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allActions = [...markupActions, ...(currentMarkup ? [currentMarkup] : [])];
    for (const action of allActions) {
      ctx.strokeStyle = action.color;
      ctx.fillStyle = action.color;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (action.tool === 'freehand') {
        ctx.lineWidth = 3;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        action.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
      } else if (action.tool === 'highlight') {
        ctx.lineWidth = 20;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        action.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (action.tool === 'line' && action.points.length >= 2) {
        ctx.lineWidth = 3;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(action.points[0].x, action.points[0].y);
        ctx.lineTo(action.points[1].x, action.points[1].y);
        ctx.stroke();
      } else if (action.tool === 'arrow' && action.points.length >= 2) {
        ctx.lineWidth = 3;
        ctx.globalAlpha = 1;
        const [p1, p2] = action.points;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        /* arrowhead */
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const headLen = 14;
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (action.tool === 'text' && action.text) {
        ctx.globalAlpha = 1;
        ctx.font = 'bold 16px system-ui';
        const tw = ctx.measureText(action.text).width;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(action.points[0].x - 4, action.points[0].y - 18, tw + 8, 24);
        ctx.fillStyle = action.color;
        ctx.fillText(action.text, action.points[0].x, action.points[0].y);
      }
    }
  }, [markupActions, currentMarkup]);

  /* ---- save markup as PNG ---- */
  const saveMarkup = async () => {
    if (!markupCanvasRef.current || !imgRef.current || markupActions.length === 0) return;
    setSavingMarkup(true);
    try {
      /* composite: draw image + markup onto offscreen canvas */
      const imgEl = imgRef.current.querySelector('img');
      if (!imgEl) { setSavingMarkup(false); return; }
      const offscreen = document.createElement('canvas');
      offscreen.width = imgEl.naturalWidth || imgEl.clientWidth;
      offscreen.height = imgEl.naturalHeight || imgEl.clientHeight;
      const octx = offscreen.getContext('2d');
      if (!octx) { setSavingMarkup(false); return; }
      octx.drawImage(imgEl, 0, 0, offscreen.width, offscreen.height);
      /* scale markup canvas to match */
      const sx = offscreen.width / markupCanvasRef.current.width;
      const sy = offscreen.height / markupCanvasRef.current.height;
      octx.drawImage(markupCanvasRef.current, 0, 0, markupCanvasRef.current.width * sx, markupCanvasRef.current.height * sy);

      const blob = await new Promise<Blob | null>(r => offscreen.toBlob(r, 'image/png'));
      if (!blob) { setSavingMarkup(false); return; }

      const fd = new FormData();
      fd.append('file', blob, `markup-${Date.now()}.png`);
      fd.append('projectId', projectId);
      fd.append('drawing_id', selectedDrawing?.id || '');
      fd.append('type', 'markup');

      await fetch('/api/photos/upload', { method: 'POST', body: fd });
    } catch { /* offline */ }
    setSavingMarkup(false);
  };

  /* ---- refresh ---- */
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDrawings();
    if (selectedDrawing) { await fetchPins(selectedDrawing.id); await fetchRooms(selectedDrawing.id); }
    setRefreshing(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientY);
  const handleTouchMove = (e: React.TouchEvent) => { const d = e.touches[0].clientY - touchStart; if (d > 0 && d < 120) setPullDistance(d); };
  const handleTouchEnd = () => { if (pullDistance > 60) handleRefresh(); setPullDistance(0); setTouchStart(0); };

  const drawingPins = pins.filter(p => p.drawing_id === selectedDrawing?.id);
  const drawingRooms = rooms.filter(r => r.drawing_id === selectedDrawing?.id);
  const pinClusters = clusterPins(drawingPins, zoom < 0.8 ? 5 : 2);

  /* ---- Toolbar button helper ---- */
  const TBtn = ({ active, onClick, children, color }: { active?: boolean; onClick: () => void; children: React.ReactNode; color?: string }) => (
    <button onClick={onClick} style={{
      ...glass, padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
      color: active ? BASE : (color || GOLD),
      background: active ? (color || GOLD) : 'rgba(26,31,46,0.7)',
      border: active ? `1px solid ${color || GOLD}` : '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
    }}>
      {children}
    </button>
  );

  return (
    <div
      style={{ padding: '18px 16px', minHeight: '100%' }}
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
    >
      {pullDistance > 10 && (
        <div style={{ textAlign: 'center', padding: '8px 0', color: DIM, fontSize: 12, transition: 'opacity .2s', opacity: pullDistance > 30 ? 1 : 0.5 }}>
          {pullDistance > 60 ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}
      {refreshing && <div style={{ textAlign: 'center', padding: '8px 0', color: GOLD, fontSize: 12 }}>Refreshing...</div>}

      <button onClick={() => { if (view === 'viewer') { setView('list'); setMode('view'); setMarkupMode(false); setDrawingRoom(false); } else router.back(); }} style={{ background: 'none', border: 'none', color: DIM, fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
        {view === 'viewer' ? 'Drawings' : 'Back'}
      </button>

      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: TEXT }}>Floor Plans</h1>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM }}>
        {view === 'list' ? `${drawings.length} drawing${drawings.length !== 1 ? 's' : ''} available` : selectedDrawing?.name}
      </p>

      {/* ââ Drawing List ââ */}
      {view === 'list' && (
        loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ ...glass, padding: 16, height: 88, animation: 'pulse 1.5s ease-in-out infinite' }}>
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, height: 16, width: '60%', marginBottom: 8 }} />
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, height: 12, width: '40%' }} />
              </div>
            ))}
          </div>
        ) : drawings.length === 0 ? (
          <div style={{ ...glass, padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{'\u{1F5FA}\u{FE0F}'}</div>
            <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: TEXT }}>No Floor Plans Yet</p>
            <p style={{ margin: 0, fontSize: 13, color: DIM }}>Upload drawings from the web app to view and pin them here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {drawings.map(d => (
              <button key={d.id} onClick={() => openDrawing(d)} style={{ ...glass, padding: 14, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', width: '100%', textAlign: 'left', color: TEXT }}>
                {d.thumbnail_url ? (
                  <img src={d.thumbnail_url} alt={d.name} style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.06)' }} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: 10, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>{'\u{1F4D0}'}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: DIM }}>{d.sheet || d.description || 'Floor Plan'}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 11, color: DIM }}>
                    {pins.filter(p => p.drawing_id === d.id).length} pin{pins.filter(p => p.drawing_id === d.id).length !== 1 ? 's' : ''}
                  </p>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={2} width={18} height={18}><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            ))}
          </div>
        )
      )}

      {/* ââ Drawing Viewer ââ */}
      {view === 'viewer' && selectedDrawing && (
        <div>
          {/* Toolbar Row 1 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <TBtn active={mode === 'pin'} onClick={() => { setMode(mode === 'pin' ? 'view' : 'pin'); setMarkupMode(false); setDrawingRoom(false); }}>
              {'\u{1F4CC}'} {mode === 'pin' ? 'Cancel' : 'Place Pin'}
            </TBtn>
            <TBtn active={drawingRoom} onClick={() => { if (drawingRoom) { setDrawingRoom(false); setRoomPoints([]); setMode('view'); } else { setMode('room'); setDrawingRoom(true); setRoomPoints([]); setMarkupMode(false); } }} color={BLUE}>
              {'\u{2B1B}'} {drawingRoom ? 'Cancel Room' : 'Draw Room'}
            </TBtn>
            <TBtn active={markupMode} onClick={() => { setMarkupMode(!markupMode); if (!markupMode) setMode('markup'); else setMode('view'); setDrawingRoom(false); }} color="#F97316">
              {'\u{270F}\u{FE0F}'} Markup
            </TBtn>
            <TBtn active={showProgress} onClick={() => setShowProgress(!showProgress)} color={GREEN}>
              {'\u{1F4CA}'} Progress
            </TBtn>
            <TBtn onClick={getGPS} color={GREEN}>
              {gpsLoading ? '...' : '\u{1F4E1}'} GPS
            </TBtn>
          </div>

          {/* Markup Tools (when markup active) */}
          {markupMode && (
            <div style={{ ...glass, padding: '8px 12px', marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {(['freehand', 'line', 'arrow', 'text', 'highlight'] as MarkupTool[]).map(t => (
                <button key={t} onClick={() => setMarkupTool(t)} style={{
                  padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  background: markupTool === t ? 'rgba(249,115,22,0.2)' : 'transparent',
                  border: markupTool === t ? '1px solid #F97316' : `1px solid ${BORDER}`,
                  color: markupTool === t ? '#F97316' : DIM,
                  textTransform: 'capitalize',
                }}>
                  {t === 'freehand' ? '\u{270D}' : t === 'line' ? '\u{2F}' : t === 'arrow' ? '\u{2197}' : t === 'text' ? 'Aa' : '\u{1F7E8}'} {t}
                </button>
              ))}
              <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                {MARKUP_COLORS.map(c => (
                  <button key={c} onClick={() => setMarkupColor(c)} style={{
                    width: 22, height: 22, borderRadius: '50%', background: c, border: markupColor === c ? '2px solid #fff' : '2px solid transparent',
                    cursor: 'pointer',
                  }} />
                ))}
              </div>
              <button onClick={saveMarkup} disabled={savingMarkup || markupActions.length === 0} style={{
                padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                background: markupActions.length > 0 ? GREEN : 'transparent',
                color: markupActions.length > 0 ? '#000' : DIM,
                border: `1px solid ${markupActions.length > 0 ? GREEN : BORDER}`,
              }}>
                {savingMarkup ? '...' : 'Save'}
              </button>
              <button onClick={() => { setMarkupActions([]); setCurrentMarkup(null); }} style={{
                padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                background: 'transparent', color: RED, border: `1px solid ${BORDER}`,
              }}>
                Clear
              </button>
            </div>
          )}

          {/* Mode hints */}
          {mode === 'pin' && !pendingPin && (
            <div style={{ ...glass, padding: '8px 14px', marginBottom: 8, fontSize: 13, color: GOLD, fontWeight: 600 }}>
              Tap on the drawing below to place a pin
            </div>
          )}
          {mode === 'room' && drawingRoom && (
            <div style={{ ...glass, padding: '8px 14px', marginBottom: 8, fontSize: 13, color: BLUE, fontWeight: 600 }}>
              Tap corners to draw room boundary ({roomPoints.length} points) -- tap near first point to close
            </div>
          )}

          {/* GPS info */}
          {gpsPosition && (
            <div style={{ ...glass, padding: '8px 14px', marginBottom: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: GREEN }}>{'\u{1F4CD}'} Located</span>
              <span style={{ color: DIM, marginLeft: 8, fontSize: 11 }}>
                {gpsPosition.lat.toFixed(6)}, {gpsPosition.lng.toFixed(6)}
              </span>
            </div>
          )}
          {gpsError && <div style={{ ...glass, padding: '8px 14px', marginBottom: 8, fontSize: 13, color: RED }}>GPS: {gpsError}</div>}

          {/* Drawing Image with Overlays */}
          <div
            ref={imgRef}
            onClick={handleImageTap}
            style={{
              position: 'relative', borderRadius: 12, overflow: 'hidden',
              border: mode === 'pin' ? `2px solid ${GOLD}` : mode === 'room' ? `2px solid ${BLUE}` : '1px solid rgba(255,255,255,0.06)',
              cursor: mode === 'pin' || mode === 'room' ? 'crosshair' : 'default',
              marginBottom: 12,
              transform: `scale(${zoom})`, transformOrigin: 'top left',
            }}
          >
            <img src={selectedDrawing.file_url} alt={selectedDrawing.name} style={{ width: '100%', display: 'block' }} />

            {/* Room polygon overlays */}
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {drawingRooms.map(room => {
                const pts = room.polygon_points;
                if (!pts || pts.length < 3) return null;
                const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x}% ${p.y}%`).join(' ') + ' Z';
                const pct = room.percent_complete || 0;
                const fill = showProgress ? heatColor(pct) : (room.color || BLUE);
                const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
                const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
                return (
                  <g key={room.id}>
                    <path d={pathD} fill={fill} fillOpacity={showProgress ? 0.35 : 0.15} stroke={fill} strokeWidth={2} strokeOpacity={0.7} />
                    <text x={`${cx}%`} y={`${cy}%`} textAnchor="middle" dominantBaseline="middle"
                      fill="#fff" fontSize={11} fontWeight={700} fontFamily="system-ui"
                      stroke="rgba(0,0,0,0.6)" strokeWidth={3} paintOrder="stroke">
                      {showProgress ? `${pct}%` : room.room_name}
                    </text>
                  </g>
                );
              })}
              {/* Drawing-in-progress room polygon */}
              {drawingRoom && roomPoints.length > 0 && (
                <g>
                  <polyline
                    points={roomPoints.map(p => `${p.x}% ${p.y}%`).join(' ')}
                    fill="none" stroke={BLUE} strokeWidth={2} strokeDasharray="6 3"
                  />
                  {roomPoints.map((p, i) => (
                    <circle key={i} cx={`${p.x}%`} cy={`${p.y}%`} r={4} fill={i === 0 ? GREEN : BLUE} stroke="#fff" strokeWidth={1.5} />
                  ))}
                </g>
              )}
            </svg>

            {/* Markup canvas */}
            {markupMode && (
              <canvas
                ref={markupCanvasRef}
                onMouseDown={handleMarkupStart}
                onMouseMove={handleMarkupMove}
                onMouseUp={handleMarkupEnd}
                onMouseLeave={handleMarkupEnd}
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                  cursor: markupTool === 'text' ? 'text' : 'crosshair',
                  zIndex: 15,
                }}
              />
            )}

            {/* GPS approximate position */}
            {showGpsOnPlan && gpsPosition && (
              <div style={{
                position: 'absolute', left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)', zIndex: 12,
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: `rgba(${hr(BLUE)}, 0.3)`, border: `3px solid ${BLUE}`,
                  animation: 'pulse 2s ease-in-out infinite',
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: BLUE, margin: '5px auto' }} />
                </div>
              </div>
            )}

            {/* Pins with clustering */}
            {pinClusters.map((cluster, ci) => {
              if (cluster.pins.length === 1) {
                const pin = cluster.pins[0];
                const pType = PIN_TYPES[pin.pin_type] || PIN_TYPES.note;
                return (
                  <div key={pin.id} style={{ position: 'absolute', left: `${pin.x_pct}%`, top: `${pin.y_pct}%`, transform: 'translate(-50%, -100%)', zIndex: 10 }} title={`${pin.label} (${pType.label})`}>
                    {/* Mini thumbnail for photo pins */}
                    {pin.photo_url && (
                      <img src={pin.photo_url} alt="" style={{
                        position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
                        width: 36, height: 36, borderRadius: 6, objectFit: 'cover',
                        border: `2px solid ${pType.color}`, boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                      }} />
                    )}
                    <div style={{
                      width: 28, height: 28, borderRadius: '50% 50% 50% 0',
                      background: pType.color, transform: 'rotate(-45deg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 2px 8px rgba(${hr(pType.color)}, 0.5)`,
                      border: '2px solid rgba(255,255,255,0.3)',
                    }}>
                      <span style={{ transform: 'rotate(45deg)', fontSize: 12 }}>{pType.icon}</span>
                    </div>
                    <div style={{
                      position: 'absolute', top: -26, left: '50%', transform: 'translateX(-50%)',
                      background: 'rgba(0,0,0,0.85)', borderRadius: 6, padding: '2px 8px',
                      whiteSpace: 'nowrap', fontSize: 10, color: TEXT, fontWeight: 600,
                    }}>
                      {pin.label}
                    </div>
                  </div>
                );
              }
              /* Cluster bubble */
              return (
                <div key={`cluster-${ci}`} style={{
                  position: 'absolute', left: `${cluster.x}%`, top: `${cluster.y}%`,
                  transform: 'translate(-50%, -50%)', zIndex: 10,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: `rgba(${hr(GOLD)}, 0.2)`, border: `2px solid ${GOLD}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800, color: GOLD,
                    boxShadow: `0 2px 12px rgba(${hr(GOLD)}, 0.3)`,
                  }}>
                    {cluster.pins.length}
                  </div>
                </div>
              );
            })}

            {/* Pending pin */}
            {pendingPin && (
              <div style={{ position: 'absolute', left: `${pendingPin.x_pct}%`, top: `${pendingPin.y_pct}%`, transform: 'translate(-50%, -100%)', zIndex: 20 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50% 50% 50% 0',
                  background: GOLD, transform: 'rotate(-45deg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 2px 12px rgba(${hr(GOLD)}, 0.6)`,
                  border: '2px solid #fff', animation: 'pulse 1.5s ease-in-out infinite',
                }}>
                  <span style={{ transform: 'rotate(45deg)', fontSize: 14 }}>{'\u{1F4CC}'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Zoom controls */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} style={{ ...glass, padding: '6px 14px', cursor: 'pointer', color: DIM, fontSize: 16, fontWeight: 700 }}>-</button>
            <button onClick={() => setZoom(1)} style={{ ...glass, padding: '6px 14px', cursor: 'pointer', color: DIM, fontSize: 12, fontWeight: 600 }}>{Math.round(zoom * 100)}%</button>
            <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} style={{ ...glass, padding: '6px 14px', cursor: 'pointer', color: DIM, fontSize: 16, fontWeight: 700 }}>+</button>
          </div>

          {/* Progress heatmap legend */}
          {showProgress && (
            <div style={{ ...glass, padding: '10px 14px', marginBottom: 12 }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Progress Legend</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {HEAT_COLORS.map(h => (
                  <div key={h.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: h.color }} />
                    <span style={{ fontSize: 11, color: DIM }}>{h.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Room creation form */}
          {mode === 'room' && !drawingRoom && roomPoints.length >= 3 && (
            <div style={{ ...glass, padding: 16, marginBottom: 12 }}>
              <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: TEXT }}>Name This Room</p>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Room Name *</label>
                <input value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="e.g. Kitchen, Unit 203" style={inp} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Floor</label>
                <select value={roomFloor} onChange={e => setRoomFloor(e.target.value)} style={inp}>
                  <option value="">Select floor...</option>
                  <option value="1">Floor 1</option><option value="2">Floor 2</option><option value="3">Floor 3</option>
                  <option value="B1">Basement 1</option><option value="R">Roof</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => { setRoomPoints([]); setMode('view'); }} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px', color: DIM, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                <button type="button" onClick={saveRoom} disabled={savingRoom || !roomName.trim()} style={{ flex: 2, background: savingRoom ? BORDER : BLUE, border: 'none', borderRadius: 12, padding: '12px', color: savingRoom ? DIM : '#fff', fontSize: 14, fontWeight: 800, cursor: savingRoom ? 'wait' : 'pointer' }}>
                  {savingRoom ? 'Saving...' : 'Save Room'}
                </button>
              </div>
            </div>
          )}

          {/* Pin form */}
          {pendingPin && (
            <div style={{ ...glass, padding: 16, marginBottom: 12 }}>
              <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: TEXT }}>New Pin Details</p>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Label *</label>
                <input value={pinLabel} onChange={e => setPinLabel(e.target.value)} placeholder="e.g. Column A3, Junction Box" style={inp} required />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Pin Type</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(PIN_TYPES).map(([key, cfg]) => (
                    <button key={key} type="button" onClick={() => setPinType(key)} style={{
                      background: pinType === key ? `rgba(${hr(cfg.color)}, 0.2)` : 'transparent',
                      border: `1.5px solid ${pinType === key ? cfg.color : BORDER}`,
                      borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                      color: pinType === key ? cfg.color : DIM, fontSize: 11, fontWeight: pinType === key ? 700 : 400,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {cfg.icon} {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Note</label>
                <textarea value={pinNote} onChange={e => setPinNote(e.target.value)} placeholder="Optional note..." rows={2} style={inp} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => { setPendingPin(null); setMode('view'); }} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px', color: DIM, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                <button type="button" onClick={savePin} disabled={savingPin || !pinLabel.trim()} style={{ flex: 2, background: savingPin ? BORDER : GOLD, border: 'none', borderRadius: 12, padding: '12px', color: savingPin ? DIM : '#000', fontSize: 14, fontWeight: 800, cursor: savingPin ? 'wait' : 'pointer' }}>
                  {savingPin ? 'Saving...' : 'Save Pin'}
                </button>
              </div>
            </div>
          )}

          {/* Pin legend */}
          {drawingPins.length > 0 && (
            <div style={{ ...glass, padding: 14 }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Pins on this drawing ({drawingPins.length})</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {drawingPins.slice(0, 20).map(pin => {
                  const pType = PIN_TYPES[pin.pin_type] || PIN_TYPES.note;
                  return (
                    <div key={pin.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {pin.photo_url ? (
                        <img src={pin.photo_url} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', border: `1.5px solid ${pType.color}`, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: pType.color, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT }}>{pin.label}</p>
                        {pin.note && <p style={{ margin: '2px 0 0', fontSize: 11, color: DIM }}>{pin.note}</p>}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: pType.color }}>{pType.label}</span>
                    </div>
                  );
                })}
                {drawingPins.length > 20 && (
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: DIM, textAlign: 'center' }}>+ {drawingPins.length - 20} more pins</p>
                )}
              </div>
            </div>
          )}

          {/* Rooms list */}
          {drawingRooms.length > 0 && (
            <div style={{ ...glass, padding: 14, marginTop: 12 }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Rooms ({drawingRooms.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {drawingRooms.map(room => {
                  const pct = room.percent_complete || 0;
                  return (
                    <div key={room.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: heatColor(pct), flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT }}>{room.room_name}</p>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: heatColor(pct) }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

export default function FieldFloorPlanPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <FloorPlanPage />
    </Suspense>
  );
}
