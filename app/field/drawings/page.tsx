'use client';
/**
 * Saguaro Field — Drawing Viewer with Pindrops + Markup Persistence
 * Load project drawings, full-screen viewer, tap to pin, draw markups, offline queue.
 */
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD = '#C8960F', RAISED = '#0D1D2E', BORDER = '#1E3A5F', TEXT = '#F0F4FF', DIM = '#8BAAC8';
const GREEN = '#22C55E', RED = '#EF4444', AMBER = '#C8960F', BLUE = '#3B82F6';

const PRESET_COLORS = [RED, BLUE, GREEN, AMBER, GOLD, '#8B5CF6', '#EC4899', '#06B6D4'];
const USER_COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#C8960F', '#8B5CF6', '#EC4899', '#06B6D4', '#C8960F'];

function hr(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}

const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '11px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none', boxSizing: 'border-box' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8BAAC8', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };
const CATEGORY_COLORS: Record<string, string> = { RFI: BLUE, Punch: RED, Safety: AMBER, Other: DIM };

type MarkupTool = 'pen' | 'pin' | 'text' | 'rect' | 'circle' | 'arrow' | 'measure' | 'eraser';

interface Drawing { id: string; sheet: string; name: string; description: string; file_url: string; thumbnail_url?: string; }
interface DrawingPin { id: string; drawing_id: string; x_pct: number; y_pct: number; title: string; note: string; category: string; created_at: string; }
interface PendingPin { x_pct: number; y_pct: number; }

interface StrokePoint { x: number; y: number; }
interface Stroke { points: StrokePoint[]; color: string; lineWidth: number; }
interface ShapeData { type: 'rect' | 'circle' | 'arrow' | 'measure'; x1: number; y1: number; x2: number; y2: number; color: string; lineWidth: number; label?: string; }
interface TextAnnotation { x: number; y: number; text: string; color: string; fontSize: number; }
interface PinAnnotation { x: number; y: number; number: number; note: string; }

interface MarkupData {
  strokes?: Stroke[];
  shapes?: ShapeData[];
  texts?: TextAnnotation[];
  pins?: PinAnnotation[];
}

interface SavedMarkup {
  id: string;
  project_id: string;
  drawing_id: string;
  title: string;
  markup_data: MarkupData;
  markup_type: string;
  color: string;
  line_width: number;
  visibility: 'all' | 'private';
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  comments: MarkupComment[];
}

interface MarkupComment {
  id: string;
  markup_id: string;
  comment: string;
  author: string;
  author_name: string;
  created_at: string;
}

type View = 'list' | 'viewer';

function getUserColorForEmail(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) { hash = ((hash << 5) - hash) + email.charCodeAt(i); hash |= 0; }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

function DrawingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [view, setView] = useState<View>('list');
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);
  const [pins, setPins] = useState<DrawingPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const [projectName, setProjectName] = useState('');

  // Pin drop state (original)
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinTitle, setPinTitle] = useState('');
  const [pinNote, setPinNote] = useState('');
  const [pinCategory, setPinCategory] = useState('Other');
  const [savingPin, setSavingPin] = useState(false);
  const [selectedPin, setSelectedPin] = useState<DrawingPin | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);

  // ── Markup State ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTool, setActiveTool] = useState<MarkupTool | null>(null);
  const [drawColor, setDrawColor] = useState(RED);
  const [lineWidth, setLineWidth] = useState(3);

  // Drawing data
  const [currentStrokes, setCurrentStrokes] = useState<Stroke[]>([]);
  const [currentShapes, setCurrentShapes] = useState<ShapeData[]>([]);
  const [currentTexts, setCurrentTexts] = useState<TextAnnotation[]>([]);
  const [currentPins, setCurrentPins] = useState<PinAnnotation[]>([]);
  const [undoStack, setUndoStack] = useState<Array<{ strokes: Stroke[]; shapes: ShapeData[]; texts: TextAnnotation[]; pins: PinAnnotation[] }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ strokes: Stroke[]; shapes: ShapeData[]; texts: TextAnnotation[]; pins: PinAnnotation[] }>>([]);

  // Active drawing state
  const isDrawing = useRef(false);
  const currentStrokeRef = useRef<StrokePoint[]>([]);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);

  // Save markup form
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [markupTitle, setMarkupTitle] = useState('');
  const [markupVisibility, setMarkupVisibility] = useState<'all' | 'private'>('all');
  const [savingMarkup, setSavingMarkup] = useState(false);

  // Saved markups / layers
  const [savedMarkups, setSavedMarkups] = useState<SavedMarkup[]>([]);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set());
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [selectedMarkup, setSelectedMarkup] = useState<SavedMarkup | null>(null);
  const [filterUser, setFilterUser] = useState<string | null>(null);

  // Comment on markup
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Text annotation placement
  const [placingText, setPlacingText] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);

  // Markup pin placement
  const [placingMarkupPin, setPlacingMarkupPin] = useState(false);
  const [markupPinNote, setMarkupPinNote] = useState('');
  const [markupPinPos, setMarkupPinPos] = useState<{ x: number; y: number } | null>(null);

  // Selected markup pin detail
  const [selectedMarkupPin, setSelectedMarkupPin] = useState<PinAnnotation | null>(null);
  const [editingPinNote, setEditingPinNote] = useState('');

  // Canvas dimensions
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    fetch('/api/projects/list')
      .then(r => r.ok ? r.json() : null)
      .then(d => { const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId); if (p) setProjectName(p.name); })
      .catch(() => {});
    loadDrawings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadDrawings = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/drawings`);
      const d = await r.json();
      setDrawings(d.drawings || []);
    } catch { /* offline */ }
    setLoading(false);
  };

  const loadMarkups = useCallback(async (drawingId: string) => {
    try {
      const r = await fetch(`/api/projects/${projectId}/drawings/markups?drawing_id=${drawingId}`);
      const d = await r.json();
      const markups: SavedMarkup[] = d.markups || [];
      setSavedMarkups(markups);
      setVisibleLayers(new Set(markups.map((m: SavedMarkup) => m.id)));
    } catch {
      setSavedMarkups([]);
      setVisibleLayers(new Set());
    }
  }, [projectId]);

  const openDrawing = async (drawing: Drawing) => {
    setSelectedDrawing(drawing);
    setView('viewer');
    setPendingPin(null);
    setShowPinForm(false);
    setSelectedPin(null);
    setActiveTool(null);
    setCurrentStrokes([]);
    setCurrentShapes([]);
    setCurrentTexts([]);
    setCurrentPins([]);
    setUndoStack([]);
    setRedoStack([]);
    setShowSaveForm(false);
    setSelectedMarkup(null);
    setShowLayerPanel(false);
    setFilterUser(null);
    setPinsLoading(true);
    try {
      const r = await fetch(`/api/drawings/pins?drawingId=${drawing.id}`);
      const d = await r.json();
      setPins(d.pins || []);
    } catch { setPins([]); }
    setPinsLoading(false);
    loadMarkups(drawing.id);
  };

  // ── Canvas sizing ──
  useEffect(() => {
    if (view !== 'viewer' || !imgRef.current) return;
    const resize = () => {
      const img = imgRef.current;
      if (!img) return;
      const rect = img.getBoundingClientRect();
      setCanvasSize({ w: rect.width, h: rect.height });
    };
    const img = imgRef.current;
    if (img.complete) resize();
    else img.onload = resize;
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [view, selectedDrawing]);

  // ── Redraw canvas ──
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw current strokes
    for (const stroke of currentStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }

    // Draw current shapes
    for (const shape of currentShapes) {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.lineWidth;
      ctx.lineCap = 'round';
      if (shape.type === 'rect') {
        ctx.strokeRect(shape.x1, shape.y1, shape.x2 - shape.x1, shape.y2 - shape.y1);
      } else if (shape.type === 'circle') {
        const cx = (shape.x1 + shape.x2) / 2;
        const cy = (shape.y1 + shape.y2) / 2;
        const rx = Math.abs(shape.x2 - shape.x1) / 2;
        const ry = Math.abs(shape.y2 - shape.y1) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (shape.type === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(shape.x1, shape.y1);
        ctx.lineTo(shape.x2, shape.y2);
        ctx.stroke();
        const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
        const headLen = 12;
        ctx.beginPath();
        ctx.moveTo(shape.x2, shape.y2);
        ctx.lineTo(shape.x2 - headLen * Math.cos(angle - Math.PI / 6), shape.y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(shape.x2, shape.y2);
        ctx.lineTo(shape.x2 - headLen * Math.cos(angle + Math.PI / 6), shape.y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      } else if (shape.type === 'measure') {
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.moveTo(shape.x1, shape.y1);
        ctx.lineTo(shape.x2, shape.y2);
        ctx.stroke();
        ctx.setLineDash([]);
        const dist = Math.sqrt(Math.pow(shape.x2 - shape.x1, 2) + Math.pow(shape.y2 - shape.y1, 2));
        const midX = (shape.x1 + shape.x2) / 2;
        const midY = (shape.y1 + shape.y2) / 2;
        const label = shape.label || `${Math.round(dist)}px`;
        ctx.fillStyle = shape.color;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(label, midX + 4, midY - 4);
        // End marks
        ctx.beginPath();
        const a = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1) + Math.PI / 2;
        const tick = 6;
        ctx.moveTo(shape.x1 - tick * Math.cos(a), shape.y1 - tick * Math.sin(a));
        ctx.lineTo(shape.x1 + tick * Math.cos(a), shape.y1 + tick * Math.sin(a));
        ctx.moveTo(shape.x2 - tick * Math.cos(a), shape.y2 - tick * Math.sin(a));
        ctx.lineTo(shape.x2 + tick * Math.cos(a), shape.y2 + tick * Math.sin(a));
        ctx.stroke();
      }
    }

    // Draw text annotations
    for (const t of currentTexts) {
      ctx.fillStyle = t.color;
      ctx.font = `bold ${t.fontSize}px sans-serif`;
      ctx.fillText(t.text, t.x, t.y);
    }

    // Draw markup pins
    for (const p of currentPins) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239,68,68,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.number), p.x, p.y);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
  }, [currentStrokes, currentShapes, currentTexts, currentPins]);

  // Redraw saved markup overlays
  const redrawOverlays = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const filtered = savedMarkups.filter(m => {
      if (!visibleLayers.has(m.id)) return false;
      if (filterUser && m.created_by !== filterUser) return false;
      return true;
    });

    for (const markup of filtered) {
      const data = markup.markup_data;
      const isHighlighted = selectedMarkup?.id === markup.id;
      const alpha = isHighlighted ? 1 : 0.7;
      ctx.globalAlpha = alpha;

      // Strokes
      if (data.strokes) {
        for (const stroke of data.strokes) {
          if (stroke.points.length < 2) continue;
          ctx.beginPath();
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.lineWidth;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
          ctx.stroke();
        }
      }

      // Shapes
      if (data.shapes) {
        for (const shape of data.shapes) {
          ctx.strokeStyle = shape.color;
          ctx.lineWidth = shape.lineWidth;
          ctx.lineCap = 'round';
          if (shape.type === 'rect') {
            ctx.strokeRect(shape.x1, shape.y1, shape.x2 - shape.x1, shape.y2 - shape.y1);
          } else if (shape.type === 'circle') {
            const cx = (shape.x1 + shape.x2) / 2;
            const cy = (shape.y1 + shape.y2) / 2;
            const rx = Math.abs(shape.x2 - shape.x1) / 2;
            const ry = Math.abs(shape.y2 - shape.y1) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();
          } else if (shape.type === 'arrow') {
            ctx.beginPath();
            ctx.moveTo(shape.x1, shape.y1);
            ctx.lineTo(shape.x2, shape.y2);
            ctx.stroke();
            const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
            const headLen = 12;
            ctx.beginPath();
            ctx.moveTo(shape.x2, shape.y2);
            ctx.lineTo(shape.x2 - headLen * Math.cos(angle - Math.PI / 6), shape.y2 - headLen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(shape.x2, shape.y2);
            ctx.lineTo(shape.x2 - headLen * Math.cos(angle + Math.PI / 6), shape.y2 - headLen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
          } else if (shape.type === 'measure') {
            ctx.beginPath();
            ctx.setLineDash([6, 4]);
            ctx.moveTo(shape.x1, shape.y1);
            ctx.lineTo(shape.x2, shape.y2);
            ctx.stroke();
            ctx.setLineDash([]);
            const dist = Math.sqrt(Math.pow(shape.x2 - shape.x1, 2) + Math.pow(shape.y2 - shape.y1, 2));
            const midX = (shape.x1 + shape.x2) / 2;
            const midY = (shape.y1 + shape.y2) / 2;
            ctx.fillStyle = shape.color;
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(shape.label || `${Math.round(dist)}px`, midX + 4, midY - 4);
          }
        }
      }

      // Texts
      if (data.texts) {
        for (const t of data.texts) {
          ctx.fillStyle = t.color;
          ctx.font = `bold ${t.fontSize}px sans-serif`;
          ctx.fillText(t.text, t.x, t.y);
        }
      }

      // Pins
      if (data.pins) {
        for (const p of data.pins) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(239,68,68,0.85)';
          ctx.globalAlpha = alpha;
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(p.number), p.x, p.y);
          ctx.textAlign = 'start';
          ctx.textBaseline = 'alphabetic';
        }
      }
    }
    ctx.globalAlpha = 1;
  }, [savedMarkups, visibleLayers, filterUser, selectedMarkup]);

  useEffect(() => { redrawCanvas(); }, [redrawCanvas]);
  useEffect(() => { redrawOverlays(); }, [redrawOverlays]);

  // ── Push undo state ──
  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev, { strokes: currentStrokes, shapes: currentShapes, texts: currentTexts, pins: currentPins }]);
    setRedoStack([]);
  }, [currentStrokes, currentShapes, currentTexts, currentPins]);

  const undo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, { strokes: currentStrokes, shapes: currentShapes, texts: currentTexts, pins: currentPins }]);
    setCurrentStrokes(prev.strokes);
    setCurrentShapes(prev.shapes);
    setCurrentTexts(prev.texts);
    setCurrentPins(prev.pins);
    setUndoStack(s => s.slice(0, -1));
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(u => [...u, { strokes: currentStrokes, shapes: currentShapes, texts: currentTexts, pins: currentPins }]);
    setCurrentStrokes(next.strokes);
    setCurrentShapes(next.shapes);
    setCurrentTexts(next.texts);
    setCurrentPins(next.pins);
    setRedoStack(r => r.slice(0, -1));
  };

  const clearAll = () => {
    pushUndo();
    setCurrentStrokes([]);
    setCurrentShapes([]);
    setCurrentTexts([]);
    setCurrentPins([]);
  };

  // ── Canvas event handlers ──
  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handleCanvasDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!activeTool) return;
    e.preventDefault();
    const pos = getCanvasPos(e);

    if (activeTool === 'text') {
      setTextPos(pos);
      setPlacingText(true);
      setTextInput('');
      return;
    }

    if (activeTool === 'pin') {
      setMarkupPinPos(pos);
      setPlacingMarkupPin(true);
      setMarkupPinNote('');
      return;
    }

    if (activeTool === 'eraser') {
      pushUndo();
      // Remove strokes near click
      const threshold = 10;
      setCurrentStrokes(prev => prev.filter(s => {
        return !s.points.some(p => Math.abs(p.x - pos.x) < threshold && Math.abs(p.y - pos.y) < threshold);
      }));
      // Remove shapes near click
      setCurrentShapes(prev => prev.filter(s => {
        const cx = (s.x1 + s.x2) / 2;
        const cy = (s.y1 + s.y2) / 2;
        return Math.abs(cx - pos.x) > threshold || Math.abs(cy - pos.y) > threshold;
      }));
      // Remove texts near click
      setCurrentTexts(prev => prev.filter(t => Math.abs(t.x - pos.x) > threshold || Math.abs(t.y - pos.y) > threshold));
      // Remove pins near click
      setCurrentPins(prev => prev.filter(p => Math.abs(p.x - pos.x) > 14 || Math.abs(p.y - pos.y) > 14));
      return;
    }

    isDrawing.current = true;

    if (activeTool === 'pen') {
      currentStrokeRef.current = [pos];
    } else if (['rect', 'circle', 'arrow', 'measure'].includes(activeTool)) {
      shapeStartRef.current = pos;
    }
  };

  const handleCanvasMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || !activeTool) return;
    e.preventDefault();
    const pos = getCanvasPos(e);

    if (activeTool === 'pen') {
      currentStrokeRef.current.push(pos);
      // Live draw
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && currentStrokeRef.current.length >= 2) {
        const pts = currentStrokeRef.current;
        ctx.beginPath();
        ctx.strokeStyle = drawColor;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();
      }
    }
  };

  const handleCanvasUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || !activeTool) return;
    isDrawing.current = false;

    if (activeTool === 'pen' && currentStrokeRef.current.length >= 2) {
      pushUndo();
      setCurrentStrokes(prev => [...prev, { points: [...currentStrokeRef.current], color: drawColor, lineWidth }]);
      currentStrokeRef.current = [];
    } else if (['rect', 'circle', 'arrow', 'measure'].includes(activeTool) && shapeStartRef.current) {
      const pos = getCanvasPos(e);
      pushUndo();
      const shape: ShapeData = {
        type: activeTool as 'rect' | 'circle' | 'arrow' | 'measure',
        x1: shapeStartRef.current.x,
        y1: shapeStartRef.current.y,
        x2: pos.x,
        y2: pos.y,
        color: drawColor,
        lineWidth,
      };
      if (activeTool === 'measure') {
        const dist = Math.sqrt(Math.pow(pos.x - shapeStartRef.current.x, 2) + Math.pow(pos.y - shapeStartRef.current.y, 2));
        shape.label = `${Math.round(dist)}px`;
      }
      setCurrentShapes(prev => [...prev, shape]);
      shapeStartRef.current = null;
    }
  };

  const confirmTextAnnotation = () => {
    if (!textInput.trim() || !textPos) return;
    pushUndo();
    setCurrentTexts(prev => [...prev, { x: textPos.x, y: textPos.y, text: textInput.trim(), color: drawColor, fontSize: 14 }]);
    setPlacingText(false);
    setTextPos(null);
    setTextInput('');
  };

  const confirmMarkupPin = () => {
    if (!markupPinPos) return;
    pushUndo();
    const num = currentPins.length + 1;
    setCurrentPins(prev => [...prev, { x: markupPinPos.x, y: markupPinPos.y, number: num, note: markupPinNote.trim() }]);
    setPlacingMarkupPin(false);
    setMarkupPinPos(null);
    setMarkupPinNote('');
  };

  // ── Save markup to API ──
  const hasMarkupData = currentStrokes.length > 0 || currentShapes.length > 0 || currentTexts.length > 0 || currentPins.length > 0;

  const saveMarkup = async () => {
    if (!selectedDrawing || !hasMarkupData) return;
    setSavingMarkup(true);

    const payload = {
      drawing_id: selectedDrawing.id,
      title: markupTitle.trim() || 'Untitled Markup',
      markup_data: {
        strokes: currentStrokes,
        shapes: currentShapes,
        texts: currentTexts,
        pins: currentPins,
      },
      markup_type: 'mixed',
      color: drawColor,
      line_width: lineWidth,
      visibility: markupVisibility,
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/projects/${projectId}/drawings/markups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setCurrentStrokes([]);
        setCurrentShapes([]);
        setCurrentTexts([]);
        setCurrentPins([]);
        setUndoStack([]);
        setRedoStack([]);
        setShowSaveForm(false);
        setMarkupTitle('');
        await loadMarkups(selectedDrawing.id);
      }
    } catch {
      await enqueue({
        url: `/api/projects/${projectId}/drawings/markups`,
        method: 'POST',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
      setCurrentStrokes([]);
      setCurrentShapes([]);
      setCurrentTexts([]);
      setCurrentPins([]);
      setShowSaveForm(false);
      setMarkupTitle('');
    }
    setSavingMarkup(false);
  };

  const deleteMarkup = async (id: string) => {
    try {
      if (!online) throw new Error('offline');
      await fetch(`/api/projects/${projectId}/drawings/markups/${id}`, { method: 'DELETE' });
    } catch {
      await enqueue({ url: `/api/projects/${projectId}/drawings/markups/${id}`, method: 'DELETE', body: null, contentType: 'application/json', isFormData: false });
    }
    setSavedMarkups(prev => prev.filter(m => m.id !== id));
    setVisibleLayers(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (selectedMarkup?.id === id) setSelectedMarkup(null);
  };

  const submitComment = async () => {
    if (!selectedMarkup || !commentText.trim()) return;
    setSubmittingComment(true);
    const payload = { comment: commentText.trim() };
    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/projects/${projectId}/drawings/markups/${selectedMarkup.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const d = await res.json();
        setSavedMarkups(prev => prev.map(m => m.id === selectedMarkup.id ? { ...m, comments: [...m.comments, d.comment] } : m));
        setSelectedMarkup(prev => prev ? { ...prev, comments: [...prev.comments, d.comment] } : null);
        setCommentText('');
      }
    } catch {
      await enqueue({ url: `/api/projects/${projectId}/drawings/markups/${selectedMarkup.id}`, method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
    }
    setSubmittingComment(false);
  };

  const toggleLayerVisibility = (id: string) => {
    setVisibleLayers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Original pin handlers
  const handleImageTap = (e: React.MouseEvent<HTMLImageElement>) => {
    if (activeTool) return; // markup tool active, skip pin drop
    if (showPinForm) return;
    if (selectedPin) { setSelectedPin(null); return; }
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x_pct = (e.clientX - rect.left) / rect.width;
    const y_pct = (e.clientY - rect.top) / rect.height;
    setPendingPin({ x_pct, y_pct });
    setShowPinForm(true);
    setPinTitle('');
    setPinNote('');
    setPinCategory('Other');
  };

  const cancelPin = () => { setPendingPin(null); setShowPinForm(false); };

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinTitle.trim() || !pendingPin || !selectedDrawing) return;
    setSavingPin(true);
    const payload = { drawing_id: selectedDrawing.id, projectId, x_pct: pendingPin.x_pct, y_pct: pendingPin.y_pct, title: pinTitle.trim(), note: pinNote.trim(), category: pinCategory };
    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/drawings/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json();
      const newPin: DrawingPin = d.pin || { id: `local-${Date.now()}`, drawing_id: selectedDrawing.id, ...pendingPin, title: pinTitle.trim(), note: pinNote.trim(), category: pinCategory, created_at: new Date().toISOString() };
      setPins(prev => [...prev, newPin]);
    } catch {
      await enqueue({ url: '/api/drawings/pin', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      setPins(prev => [...prev, { id: `local-${Date.now()}`, drawing_id: selectedDrawing.id, ...pendingPin, title: pinTitle.trim(), note: pinNote.trim(), category: pinCategory, created_at: new Date().toISOString() }]);
    }
    setPendingPin(null);
    setShowPinForm(false);
    setSavingPin(false);
  };

  const relTime = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  // Unique creators for filter
  const uniqueCreators = Array.from(new Set(savedMarkups.map(m => m.created_by))).filter(Boolean);

  // ── Handle markup pin tap on overlay ──
  const handleOverlayClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool) return;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check current pins
    for (const p of currentPins) {
      if (Math.abs(p.x - x) < 14 && Math.abs(p.y - y) < 14) {
        setSelectedMarkupPin(p);
        setEditingPinNote(p.note);
        return;
      }
    }

    // Check saved markup pins
    for (const markup of savedMarkups) {
      if (!visibleLayers.has(markup.id)) continue;
      if (markup.markup_data.pins) {
        for (const p of markup.markup_data.pins) {
          if (Math.abs(p.x - x) < 14 && Math.abs(p.y - y) < 14) {
            setSelectedMarkupPin(p);
            setEditingPinNote(p.note);
            setSelectedMarkup(markup);
            return;
          }
        }
      }
    }
  };

  const updatePinNote = () => {
    if (!selectedMarkupPin) return;
    pushUndo();
    setCurrentPins(prev => prev.map(p => p.number === selectedMarkupPin.number && p.x === selectedMarkupPin.x ? { ...p, note: editingPinNote } : p));
    setSelectedMarkupPin(null);
  };

  // ── Toolbar button style helper ──
  const toolBtn = (tool: MarkupTool | null, label: string, icon: string): React.ReactNode => (
    <button
      onClick={() => {
        setActiveTool(activeTool === tool ? null : tool);
        setPlacingText(false);
        setPlacingMarkupPin(false);
      }}
      style={{
        background: activeTool === tool ? `rgba(${hr(GOLD)}, .25)` : 'transparent',
        border: `1px solid ${activeTool === tool ? GOLD : BORDER}`,
        borderRadius: 8,
        padding: '6px 8px',
        color: activeTool === tool ? GOLD : DIM,
        fontSize: 11,
        fontWeight: activeTool === tool ? 700 : 400,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        minWidth: 42,
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );

  // ── VIEWER ──
  if (view === 'viewer' && selectedDrawing) {
    return (
      <div style={{ padding: '18px 16px', paddingBottom: 32 }}>
        <button onClick={() => { setView('list'); setSelectedDrawing(null); setPins([]); setPendingPin(null); setShowPinForm(false); setSelectedPin(null); setActiveTool(null); setSavedMarkups([]); setSelectedMarkup(null); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT, display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x={2} y={2} width={20} height={20} rx={2}/><path d="M2 9h20M9 2v20"/></svg>
              {selectedDrawing.sheet}
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: DIM }}>{selectedDrawing.name}</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['RFI', 'Punch', 'Safety', 'Other'] as const).map(cat => {
              const count = pins.filter(p => p.category === cat).length;
              if (!count) return null;
              return (
                <div key={cat} style={{ background: `rgba(${hr(CATEGORY_COLORS[cat])}, .15)`, border: `1px solid rgba(${hr(CATEGORY_COLORS[cat])}, .3)`, borderRadius: 12, padding: '3px 8px', fontSize: 11, fontWeight: 700, color: CATEGORY_COLORS[cat] }}>
                  {count} {cat}
                </div>
              );
            })}
          </div>
        </div>

        {!online && (
          <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13, color: RED, fontWeight: 600 }}>
            Offline — changes will sync when reconnected
          </div>
        )}

        {/* ── Markup Toolbar ── */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {toolBtn('pen', 'Pen', '\u270F\uFE0F')}
            {toolBtn('pin', 'Pin', '\uD83D\uDCCC')}
            {toolBtn('text', 'Text', 'T')}
            {toolBtn('rect', 'Rect', '\u25A1')}
            {toolBtn('circle', 'Circle', '\u25CB')}
            {toolBtn('arrow', 'Arrow', '\u2197')}
            {toolBtn('measure', 'Measure', '\uD83D\uDCCF')}
            {toolBtn('eraser', 'Eraser', '\u2716')}
          </div>

          {/* Color picker + line width */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: DIM }}>Color:</span>
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => setDrawColor(c)} style={{
                width: 20, height: 20, borderRadius: '50%', background: c,
                border: drawColor === c ? '2px solid #fff' : '2px solid transparent',
                cursor: 'pointer', padding: 0,
              }} />
            ))}
            <span style={{ fontSize: 11, color: DIM, marginLeft: 8 }}>Width:</span>
            <input type="range" min={1} max={8} value={lineWidth} onChange={e => setLineWidth(Number(e.target.value))}
              style={{ width: 70, accentColor: GOLD }} />
            <span style={{ fontSize: 11, color: TEXT }}>{lineWidth}px</span>
          </div>

          {/* Undo/Redo/Clear + Save + Layers */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button onClick={undo} disabled={undoStack.length === 0} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 10px', color: undoStack.length > 0 ? TEXT : DIM, fontSize: 12, cursor: undoStack.length > 0 ? 'pointer' : 'default' }}>Undo</button>
            <button onClick={redo} disabled={redoStack.length === 0} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 10px', color: redoStack.length > 0 ? TEXT : DIM, fontSize: 12, cursor: redoStack.length > 0 ? 'pointer' : 'default' }}>Redo</button>
            <button onClick={clearAll} disabled={!hasMarkupData} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 10px', color: hasMarkupData ? RED : DIM, fontSize: 12, cursor: hasMarkupData ? 'pointer' : 'default' }}>Clear</button>
            <button onClick={() => { if (hasMarkupData) setShowSaveForm(true); }} disabled={!hasMarkupData} style={{ background: hasMarkupData ? GOLD : 'transparent', border: `1px solid ${hasMarkupData ? GOLD : BORDER}`, borderRadius: 8, padding: '6px 12px', color: hasMarkupData ? '#000' : DIM, fontSize: 12, fontWeight: 700, cursor: hasMarkupData ? 'pointer' : 'default', marginLeft: 'auto' }}>Save Markup</button>
            <button onClick={() => setShowLayerPanel(!showLayerPanel)} style={{ background: showLayerPanel ? `rgba(${hr(BLUE)}, .2)` : 'transparent', border: `1px solid ${showLayerPanel ? BLUE : BORDER}`, borderRadius: 8, padding: '6px 10px', color: showLayerPanel ? BLUE : DIM, fontSize: 12, cursor: 'pointer' }}>Layers ({savedMarkups.length})</button>
          </div>
        </div>

        {/* ── Save Markup Form ── */}
        {showSaveForm && (
          <div style={{ background: RAISED, border: `1px solid ${GOLD}`, borderRadius: 12, padding: '14px', marginBottom: 10 }}>
            <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: TEXT }}>Save Markup</p>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Title</label>
              <input value={markupTitle} onChange={e => setMarkupTitle(e.target.value)} placeholder="e.g. Electrical routing issue" style={inp} autoFocus />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 6 }}>Visibility</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setMarkupVisibility('all')} style={{
                  flex: 1, background: markupVisibility === 'all' ? `rgba(${hr(GREEN)}, .15)` : 'transparent',
                  border: `1px solid ${markupVisibility === 'all' ? GREEN : BORDER}`, borderRadius: 8, padding: '8px',
                  color: markupVisibility === 'all' ? GREEN : DIM, fontSize: 13, fontWeight: markupVisibility === 'all' ? 700 : 400, cursor: 'pointer',
                }}>Everyone</button>
                <button type="button" onClick={() => setMarkupVisibility('private')} style={{
                  flex: 1, background: markupVisibility === 'private' ? `rgba(${hr(AMBER)}, .15)` : 'transparent',
                  border: `1px solid ${markupVisibility === 'private' ? AMBER : BORDER}`, borderRadius: 8, padding: '8px',
                  color: markupVisibility === 'private' ? AMBER : DIM, fontSize: 13, fontWeight: markupVisibility === 'private' ? 700 : 400, cursor: 'pointer',
                }}>Just Me</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowSaveForm(false)} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px', color: DIM, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveMarkup} disabled={savingMarkup} style={{ flex: 2, background: savingMarkup ? BORDER : GOLD, border: 'none', borderRadius: 10, padding: '10px', color: savingMarkup ? DIM : '#000', fontSize: 14, fontWeight: 800, cursor: savingMarkup ? 'wait' : 'pointer' }}>
                {savingMarkup ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* ── Layer Panel ── */}
        {showLayerPanel && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>Markup Layers</p>
              {uniqueCreators.length > 1 && (
                <select value={filterUser || ''} onChange={e => setFilterUser(e.target.value || null)} style={{ background: '#07101C', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 8px', color: TEXT, fontSize: 12 }}>
                  <option value="">All Users</option>
                  {uniqueCreators.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              )}
            </div>
            {savedMarkups.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: DIM }}>No saved markups yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {savedMarkups.filter(m => !filterUser || m.created_by === filterUser).map(markup => (
                  <div key={markup.id} style={{
                    background: selectedMarkup?.id === markup.id ? `rgba(${hr(BLUE)}, .1)` : 'transparent',
                    border: `1px solid ${selectedMarkup?.id === markup.id ? BLUE : BORDER}`,
                    borderRadius: 10, padding: '10px 12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Visibility toggle */}
                      <button onClick={() => toggleLayerVisibility(markup.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: visibleLayers.has(markup.id) ? TEXT : DIM, fontSize: 16 }}>
                        {visibleLayers.has(markup.id) ? '\uD83D\uDC41' : '\u25CB'}
                      </button>
                      {/* Color dot */}
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: getUserColorForEmail(markup.created_by), flexShrink: 0 }} />
                      {/* Title + meta */}
                      <button onClick={() => setSelectedMarkup(selectedMarkup?.id === markup.id ? null : markup)} style={{ background: 'none', border: 'none', cursor: 'pointer', flex: 1, textAlign: 'left', padding: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT }}>{markup.title}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: DIM }}>{markup.created_by_name} &middot; {relTime(markup.created_at)} {markup.visibility === 'private' && <span style={{ color: AMBER }}> (Private)</span>}</p>
                      </button>
                      {/* Delete */}
                      <button onClick={() => deleteMarkup(markup.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: DIM, fontSize: 14, padding: '2px 4px' }} title="Delete markup">&times;</button>
                    </div>

                    {/* Comment thread */}
                    {selectedMarkup?.id === markup.id && (
                      <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
                        {markup.comments.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            {markup.comments.map(c => (
                              <div key={c.id} style={{ marginBottom: 6, fontSize: 12 }}>
                                <span style={{ color: getUserColorForEmail(c.author), fontWeight: 600 }}>{c.author_name}</span>
                                <span style={{ color: DIM }}> &middot; {relTime(c.created_at)}</span>
                                <p style={{ margin: '2px 0 0', color: TEXT, fontSize: 12 }}>{c.comment}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Add a comment..." style={{ ...inp, fontSize: 12, padding: '8px 10px' }} onKeyDown={e => { if (e.key === 'Enter') submitComment(); }} />
                          <button onClick={submitComment} disabled={submittingComment || !commentText.trim()} style={{ background: commentText.trim() ? GOLD : 'transparent', border: `1px solid ${commentText.trim() ? GOLD : BORDER}`, borderRadius: 8, padding: '6px 12px', color: commentText.trim() ? '#000' : DIM, fontSize: 12, fontWeight: 700, cursor: commentText.trim() ? 'pointer' : 'default', flexShrink: 0 }}>
                            {submittingComment ? '...' : 'Post'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!activeTool && <p style={{ margin: '0 0 8px', fontSize: 12, color: DIM }}>Tap the drawing to add a pin, or select a tool above to mark up</p>}
        {activeTool && <p style={{ margin: '0 0 8px', fontSize: 12, color: GOLD }}>
          {activeTool === 'pen' && 'Draw freehand on the drawing'}
          {activeTool === 'pin' && 'Tap to place a numbered pin'}
          {activeTool === 'text' && 'Tap to place text'}
          {activeTool === 'rect' && 'Drag to draw a rectangle'}
          {activeTool === 'circle' && 'Drag to draw a circle'}
          {activeTool === 'arrow' && 'Drag to draw an arrow'}
          {activeTool === 'measure' && 'Drag to measure between two points'}
          {activeTool === 'eraser' && 'Tap on markup elements to erase them'}
        </p>}

        {/* ── Drawing image with overlay canvases ── */}
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}`, background: '#000', marginBottom: 14 }}>
          <img
            ref={imgRef}
            src={selectedDrawing.file_url}
            alt={selectedDrawing.name}
            onClick={handleImageTap}
            onLoad={() => {
              const img = imgRef.current;
              if (img) {
                const rect = img.getBoundingClientRect();
                setCanvasSize({ w: rect.width, h: rect.height });
              }
            }}
            style={{ width: '100%', display: 'block', cursor: activeTool ? 'crosshair' : (showPinForm ? 'default' : 'crosshair'), userSelect: 'none' }}
            draggable={false}
          />

          {/* Overlay canvas for saved markups */}
          <canvas
            ref={overlayCanvasRef}
            width={canvasSize.w}
            height={canvasSize.h}
            onClick={handleOverlayClick}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: activeTool ? 'none' : 'auto' }}
          />

          {/* Active drawing canvas */}
          <canvas
            ref={canvasRef}
            width={canvasSize.w}
            height={canvasSize.h}
            onMouseDown={handleCanvasDown}
            onMouseMove={handleCanvasMove}
            onMouseUp={handleCanvasUp}
            onMouseLeave={handleCanvasUp}
            onTouchStart={handleCanvasDown}
            onTouchMove={handleCanvasMove}
            onTouchEnd={handleCanvasUp}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: activeTool ? 'auto' : 'none', touchAction: 'none' }}
          />

          {/* Existing pins (original) */}
          {!pinsLoading && pins.map(pin => (
            <button
              key={pin.id}
              onClick={(e) => { e.stopPropagation(); setSelectedPin(pin); setShowPinForm(false); setPendingPin(null); }}
              style={{
                position: 'absolute', left: `${pin.x_pct * 100}%`, top: `${pin.y_pct * 100}%`,
                transform: 'translate(-50%, -50%)', width: 22, height: 22, borderRadius: '50%',
                background: CATEGORY_COLORS[pin.category] || DIM, border: '2px solid #fff',
                cursor: 'pointer', padding: 0, boxShadow: '0 2px 6px rgba(0,0,0,.08)', zIndex: 10,
              }}
              title={pin.title}
            />
          ))}

          {/* Pending pin */}
          {pendingPin && (
            <div style={{
              position: 'absolute', left: `${pendingPin.x_pct * 100}%`, top: `${pendingPin.y_pct * 100}%`,
              transform: 'translate(-50%, -50%)', width: 22, height: 22, borderRadius: '50%',
              background: RED, border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,.08)', zIndex: 20,
              animation: 'pulse 1s infinite',
            }} />
          )}
        </div>

        {/* ── Text annotation input ── */}
        {placingText && textPos && (
          <div style={{ background: RAISED, border: `1px solid ${GOLD}`, borderRadius: 12, padding: '12px', marginBottom: 10 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: TEXT }}>Add Text Annotation</p>
            <input value={textInput} onChange={e => setTextInput(e.target.value)} placeholder="Type annotation text..." style={inp} autoFocus onKeyDown={e => { if (e.key === 'Enter') confirmTextAnnotation(); }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => { setPlacingText(false); setTextPos(null); }} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px', color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmTextAnnotation} disabled={!textInput.trim()} style={{ flex: 2, background: textInput.trim() ? GOLD : BORDER, border: 'none', borderRadius: 10, padding: '10px', color: textInput.trim() ? '#000' : DIM, fontSize: 13, fontWeight: 800, cursor: textInput.trim() ? 'pointer' : 'default' }}>Place Text</button>
            </div>
          </div>
        )}

        {/* ── Markup pin input ── */}
        {placingMarkupPin && markupPinPos && (
          <div style={{ background: RAISED, border: `1px solid ${RED}`, borderRadius: 12, padding: '12px', marginBottom: 10 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: TEXT }}>Pin #{currentPins.length + 1}</p>
            <textarea value={markupPinNote} onChange={e => setMarkupPinNote(e.target.value)} placeholder="Add a note for this pin..." rows={2} style={{ ...inp, resize: 'vertical' }} autoFocus />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => { setPlacingMarkupPin(false); setMarkupPinPos(null); }} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px', color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmMarkupPin} style={{ flex: 2, background: GOLD, border: 'none', borderRadius: 10, padding: '10px', color: '#000', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Place Pin</button>
            </div>
          </div>
        )}

        {/* ── Markup Pin Detail Panel ── */}
        {selectedMarkupPin && !placingMarkupPin && (
          <div style={{ background: RAISED, border: `2px solid ${RED}`, borderRadius: 14, padding: '14px', marginBottom: 14, position: 'relative' }}>
            <button onClick={() => setSelectedMarkupPin(null)} style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', color: DIM, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: TEXT }}>Pin #{selectedMarkupPin.number}</p>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Note</label>
              <textarea value={editingPinNote} onChange={e => setEditingPinNote(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
            </div>
            <button onClick={updatePinNote} style={{ background: GOLD, border: 'none', borderRadius: 8, padding: '8px 16px', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Update Note</button>
          </div>
        )}

        {/* Selected pin popup (original) */}
        {selectedPin && (
          <div style={{ background: RAISED, border: `2px solid ${CATEGORY_COLORS[selectedPin.category] || DIM}`, borderRadius: 14, padding: '14px', marginBottom: 14, position: 'relative' }}>
            <button onClick={() => setSelectedPin(null)} style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', color: DIM, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: CATEGORY_COLORS[selectedPin.category] || DIM }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: CATEGORY_COLORS[selectedPin.category] || DIM, textTransform: 'uppercase' }}>{selectedPin.category}</span>
              <span style={{ fontSize: 11, color: DIM, marginLeft: 'auto' }}>{relTime(selectedPin.created_at)}</span>
            </div>
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: TEXT }}>{selectedPin.title}</p>
            {selectedPin.note && <p style={{ margin: 0, fontSize: 13, color: DIM, lineHeight: 1.4 }}>{selectedPin.note}</p>}
          </div>
        )}

        {/* Add Note form (original) */}
        {showPinForm && (
          <form onSubmit={submitPin} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px', marginBottom: 14 }}>
            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: TEXT }}>Add Note at Pin</p>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Title *</label>
              <input value={pinTitle} onChange={e => setPinTitle(e.target.value)} placeholder="e.g. Missing anchor bolt" style={inp} required autoFocus />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Note</label>
              <textarea value={pinNote} onChange={e => setPinNote(e.target.value)} placeholder="Additional details..." rows={3} style={{ ...inp, resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 6 }}>Category</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['RFI', 'Punch', 'Safety', 'Other'] as const).map(cat => (
                  <button key={cat} type="button" onClick={() => setPinCategory(cat)} style={{
                    flex: 1, background: pinCategory === cat ? `rgba(${hr(CATEGORY_COLORS[cat])}, .2)` : 'transparent',
                    border: `1px solid ${pinCategory === cat ? CATEGORY_COLORS[cat] : BORDER}`, borderRadius: 8, padding: '8px 4px',
                    color: pinCategory === cat ? CATEGORY_COLORS[cat] : DIM, fontSize: 12, fontWeight: pinCategory === cat ? 700 : 400, cursor: 'pointer',
                  }}>{cat}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={cancelPin} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px', color: DIM, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={savingPin} style={{ flex: 2, background: savingPin ? '#1E3A5F' : GOLD, border: 'none', borderRadius: 10, padding: '12px', color: savingPin ? DIM : '#000', fontSize: 14, fontWeight: 800, cursor: savingPin ? 'wait' : 'pointer' }}>
                {savingPin ? 'Saving...' : 'Save Pin'}
              </button>
            </div>
          </form>
        )}

        {/* Pins list (original) */}
        {pins.length > 0 && !showPinForm && (
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>{pins.length} Pin{pins.length !== 1 ? 's' : ''}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pins.map(pin => (
                <button key={pin.id} onClick={() => { setSelectedPin(pin); setShowPinForm(false); }} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: CATEGORY_COLORS[pin.category] || DIM, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT }}>{pin.title}</p>
                    {pin.note && <p style={{ margin: '2px 0 0', fontSize: 12, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pin.note}</p>}
                  </div>
                  <span style={{ fontSize: 11, color: DIM, flexShrink: 0 }}>{pin.category}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List view ──
  return (
    <div style={{ padding: '18px 16px' }}>
      <button onClick={() => router.back()} style={backBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
      </button>

      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT, display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><rect x={2} y={2} width={20} height={20} rx={2}/><path d="M2 9h20M9 2v20"/></svg>
          Drawings
        </h1>
        <p style={{ margin: '3px 0 0', fontSize: 13, color: DIM }}>{projectName}</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading drawings...</div>
      ) : drawings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: DIM }}>
          <div style={{ marginBottom: 12, color: DIM, display: 'flex', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={48} height={48}><rect x={2} y={2} width={20} height={20} rx={2}/><path d="M2 9h20M9 2v20"/></svg>
          </div>
          <p style={{ margin: 0, fontSize: 15 }}>No drawings found for this project.</p>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>Upload drawings in the web portal.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {drawings.map(drawing => (
            <button key={drawing.id} onClick={() => openDrawing(drawing)} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
              {drawing.thumbnail_url ? (
                <img src={drawing.thumbnail_url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0, background: '#07101C' }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 8, background: '#07101C', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ background: `rgba(${hr(GOLD)}, .15)`, border: `1px solid rgba(${hr(GOLD)}, .3)`, borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 700, color: GOLD }}>{drawing.sheet}</span>
                </div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT, lineHeight: 1.3 }}>{drawing.name}</p>
                {drawing.description && <p style={{ margin: '3px 0 0', fontSize: 12, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{drawing.description}</p>}
              </div>
              <span style={{ color: DIM, fontSize: 20, flexShrink: 0 }}>&rsaquo;</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FieldDrawingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <DrawingsPage />
    </Suspense>
  );
}
