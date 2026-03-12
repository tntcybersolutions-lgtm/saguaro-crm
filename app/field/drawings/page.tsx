'use client';
/**
 * Saguaro Field — Drawing Viewer with Pindrops
 * Load project drawings, full-screen viewer, tap to pin, offline queue.
 */
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD = '#D4A017', RAISED = '#0f1d2b', BORDER = '#1e3148', TEXT = '#e8edf8', DIM = '#8fa3c0';
const GREEN = '#22C55E', RED = '#EF4444', AMBER = '#F59E0B', BLUE = '#3B82F6';

function hr(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}

const inp: React.CSSProperties = { width: '100%', background: '#09111A', border: '1px solid #1e3148', borderRadius: 10, padding: '11px 14px', color: '#e8edf8', fontSize: 15, outline: 'none', boxSizing: 'border-box' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8fa3c0', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };

const CATEGORY_COLORS: Record<string, string> = { RFI: BLUE, Punch: RED, Safety: AMBER, Other: DIM };

interface Drawing {
  id: string;
  sheet: string;
  name: string;
  description: string;
  file_url: string;
  thumbnail_url?: string;
}

interface DrawingPin {
  id: string;
  drawing_id: string;
  x_pct: number;
  y_pct: number;
  title: string;
  note: string;
  category: string;
  created_at: string;
}

interface PendingPin {
  x_pct: number;
  y_pct: number;
}

type View = 'list' | 'viewer';

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

  // Pin drop state
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinTitle, setPinTitle] = useState('');
  const [pinNote, setPinNote] = useState('');
  const [pinCategory, setPinCategory] = useState('Other');
  const [savingPin, setSavingPin] = useState(false);

  // Popup for existing pin
  const [selectedPin, setSelectedPin] = useState<DrawingPin | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);

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

  const openDrawing = async (drawing: Drawing) => {
    setSelectedDrawing(drawing);
    setView('viewer');
    setPendingPin(null);
    setShowPinForm(false);
    setSelectedPin(null);
    setPinsLoading(true);
    try {
      const r = await fetch(`/api/drawings/pins?drawingId=${drawing.id}`);
      const d = await r.json();
      setPins(d.pins || []);
    } catch { setPins([]); }
    setPinsLoading(false);
  };

  const handleImageTap = (e: React.MouseEvent<HTMLImageElement>) => {
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

  const cancelPin = () => {
    setPendingPin(null);
    setShowPinForm(false);
  };

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinTitle.trim() || !pendingPin || !selectedDrawing) return;
    setSavingPin(true);

    const payload = {
      drawing_id: selectedDrawing.id,
      projectId,
      x_pct: pendingPin.x_pct,
      y_pct: pendingPin.y_pct,
      title: pinTitle.trim(),
      note: pinNote.trim(),
      category: pinCategory,
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/drawings/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      const newPin: DrawingPin = d.pin || { id: `local-${Date.now()}`, drawing_id: selectedDrawing.id, ...pendingPin, title: pinTitle.trim(), note: pinNote.trim(), category: pinCategory, created_at: new Date().toISOString() };
      setPins(prev => [...prev, newPin]);
    } catch {
      await enqueue({ url: '/api/drawings/pin', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      setPins(prev => [...prev, {
        id: `local-${Date.now()}`,
        drawing_id: selectedDrawing.id,
        ...pendingPin,
        title: pinTitle.trim(),
        note: pinNote.trim(),
        category: pinCategory,
        created_at: new Date().toISOString(),
      }]);
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

  if (view === 'viewer' && selectedDrawing) {
    return (
      <div style={{ padding: '18px 16px', paddingBottom: 32 }}>
        <button onClick={() => { setView('list'); setSelectedDrawing(null); setPins([]); setPendingPin(null); setShowPinForm(false); setSelectedPin(null); }} style={backBtn}>← Back to Drawings</button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT, display: 'flex', alignItems: 'center', gap: 8 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x={2} y={2} width={20} height={20} rx={2}/><path d="M2 9h20M9 2v20"/></svg>{selectedDrawing.sheet}</h1>
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
            Offline — pins will sync when reconnected
          </div>
        )}

        <p style={{ margin: '0 0 8px', fontSize: 12, color: DIM }}>Tap the drawing to add a pin</p>

        {/* Drawing image with pins */}
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}`, background: '#000', marginBottom: 14 }}>
          <img
            ref={imgRef}
            src={selectedDrawing.file_url}
            alt={selectedDrawing.name}
            onClick={handleImageTap}
            style={{ width: '100%', display: 'block', cursor: showPinForm ? 'default' : 'crosshair', userSelect: 'none' }}
            draggable={false}
          />

          {/* Existing pins */}
          {!pinsLoading && pins.map(pin => (
            <button
              key={pin.id}
              onClick={(e) => { e.stopPropagation(); setSelectedPin(pin); setShowPinForm(false); setPendingPin(null); }}
              style={{
                position: 'absolute',
                left: `${pin.x_pct * 100}%`,
                top: `${pin.y_pct * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: CATEGORY_COLORS[pin.category] || DIM,
                border: '2px solid #fff',
                cursor: 'pointer',
                padding: 0,
                boxShadow: '0 2px 6px rgba(0,0,0,.5)',
                zIndex: 10,
              }}
              title={pin.title}
            />
          ))}

          {/* Pending pin */}
          {pendingPin && (
            <div style={{
              position: 'absolute',
              left: `${pendingPin.x_pct * 100}%`,
              top: `${pendingPin.y_pct * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: RED,
              border: '2px solid #fff',
              boxShadow: '0 2px 6px rgba(0,0,0,.5)',
              zIndex: 20,
              animation: 'pulse 1s infinite',
            }} />
          )}
        </div>

        {/* Selected pin popup */}
        {selectedPin && (
          <div style={{ background: RAISED, border: `2px solid ${CATEGORY_COLORS[selectedPin.category] || DIM}`, borderRadius: 14, padding: '14px', marginBottom: 14, position: 'relative' }}>
            <button onClick={() => setSelectedPin(null)} style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', color: DIM, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: CATEGORY_COLORS[selectedPin.category] || DIM }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: CATEGORY_COLORS[selectedPin.category] || DIM, textTransform: 'uppercase' }}>{selectedPin.category}</span>
              <span style={{ fontSize: 11, color: DIM, marginLeft: 'auto' }}>{relTime(selectedPin.created_at)}</span>
            </div>
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: TEXT }}>{selectedPin.title}</p>
            {selectedPin.note && <p style={{ margin: 0, fontSize: 13, color: DIM, lineHeight: 1.4 }}>{selectedPin.note}</p>}
          </div>
        )}

        {/* Add Note form */}
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
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setPinCategory(cat)}
                    style={{
                      flex: 1,
                      background: pinCategory === cat ? `rgba(${hr(CATEGORY_COLORS[cat])}, .2)` : 'transparent',
                      border: `1px solid ${pinCategory === cat ? CATEGORY_COLORS[cat] : BORDER}`,
                      borderRadius: 8,
                      padding: '8px 4px',
                      color: pinCategory === cat ? CATEGORY_COLORS[cat] : DIM,
                      fontSize: 12,
                      fontWeight: pinCategory === cat ? 700 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={cancelPin} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px', color: DIM, fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" disabled={savingPin} style={{ flex: 2, background: savingPin ? '#1e3148' : GOLD, border: 'none', borderRadius: 10, padding: '12px', color: savingPin ? DIM : '#000', fontSize: 14, fontWeight: 800, cursor: savingPin ? 'wait' : 'pointer' }}>
                {savingPin ? 'Saving...' : 'Save Pin'}
              </button>
            </div>
          </form>
        )}

        {/* Pins list */}
        {pins.length > 0 && !showPinForm && (
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>{pins.length} Pin{pins.length !== 1 ? 's' : ''}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pins.map(pin => (
                <button
                  key={pin.id}
                  onClick={() => { setSelectedPin(pin); setShowPinForm(false); }}
                  style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                >
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

  // List view
  return (
    <div style={{ padding: '18px 16px' }}>
      <button onClick={() => router.back()} style={backBtn}>← Back</button>

      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT, display: 'flex', alignItems: 'center', gap: 8 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><rect x={2} y={2} width={20} height={20} rx={2}/><path d="M2 9h20M9 2v20"/></svg>Drawings</h1>
        <p style={{ margin: '3px 0 0', fontSize: 13, color: DIM }}>{projectName}</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading drawings...</div>
      ) : drawings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: DIM }}>
          <div style={{ marginBottom: 12, color: DIM, display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={48} height={48}><rect x={2} y={2} width={20} height={20} rx={2}/><path d="M2 9h20M9 2v20"/></svg></div>
          <p style={{ margin: 0, fontSize: 15 }}>No drawings found for this project.</p>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>Upload drawings in the web portal.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {drawings.map(drawing => (
            <button
              key={drawing.id}
              onClick={() => openDrawing(drawing)}
              style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
            >
              {drawing.thumbnail_url ? (
                <img src={drawing.thumbnail_url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0, background: '#09111A' }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 8, background: '#09111A', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, flexShrink: 0 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ background: `rgba(${hr(GOLD)}, .15)`, border: `1px solid rgba(${hr(GOLD)}, .3)`, borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 700, color: GOLD }}>{drawing.sheet}</span>
                </div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT, lineHeight: 1.3 }}>{drawing.name}</p>
                {drawing.description && <p style={{ margin: '3px 0 0', fontSize: 12, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{drawing.description}</p>}
              </div>
              <span style={{ color: DIM, fontSize: 20, flexShrink: 0 }}>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FieldDrawingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8fa3c0', textAlign: 'center' }}>Loading...</div>}>
      <DrawingsPage />
    </Suspense>
  );
}
