'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface FloorPlan {
  id: string;
  project_id: string;
  name: string;
  image_url: string;
  width_px: number;
  height_px: number;
  scale_ft_per_px?: number;
  uploaded_at: string;
}

interface GPSPin {
  id: string;
  floor_plan_id: string;
  project_id: string;
  x_pct: number;
  y_pct: number;
  label: string;
  category: 'photo' | 'issue' | 'measurement' | 'note' | 'inspection' | 'location';
  description?: string;
  media_url?: string;
  created_at: string;
  created_by?: string;
  resolved?: boolean;
}

const PIN_COLORS: Record<string, string> = {
  photo: '#3B82F6', issue: '#EF4444', measurement: '#D4A017',
  note: '#8BAAC8', inspection: '#22C55E', location: '#F59E0B',
};

const PIN_ICONS: Record<string, string> = {
  photo: '📷', issue: '⚠', measurement: '📐', note: '📝', inspection: '✓', location: '📍',
};

async function enqueue(action: string, payload: unknown) {
  try {
    const q = JSON.parse(localStorage.getItem('offline_queue') || '[]');
    q.push({ action, payload, ts: Date.now() });
    localStorage.setItem('offline_queue', JSON.stringify(q));
  } catch { /* silent */ }
}

export default function FloorPlanPage() {
  const router   = useRouter();
  const params   = useSearchParams();
  const [projectId, setProjectId]   = useState<string | null>(null);
  const [plans,     setPlans]       = useState<FloorPlan[]>([]);
  const [pins,      setPins]        = useState<GPSPin[]>([]);
  const [activePlan, setActivePlan] = useState<FloorPlan | null>(null);
  const [online,    setOnline]      = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [addingPin, setAddingPin]   = useState(false);
  const [pinCategory, setPinCategory] = useState<GPSPin['category']>('note');
  const [pinLabel,  setPinLabel]    = useState('');
  const [pinDesc,   setPinDesc]     = useState('');
  const [pendingPin, setPendingPin] = useState<{x:number,y:number}|null>(null);
  const [selectedPin, setSelectedPin] = useState<GPSPin | null>(null);
  const [filterCat, setFilterCat]   = useState<string>('all');
  const [zoom,      setZoom]        = useState(1);
  const [pan,       setPan]         = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning]   = useState(false);
  const [error,     setError]       = useState('');
  const [saving,    setSaving]      = useState(false);
  const imgRef     = useRef<HTMLImageElement>(null);
  const canvasRef  = useRef<HTMLDivElement>(null);
  const fileRef    = useRef<HTMLInputElement>(null);
  const panStart   = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const pid = params.get('projectId') || localStorage.getItem('saguaro_active_project');
    setProjectId(pid);
    setOnline(navigator.onLine);
    window.addEventListener('online',  () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
    if (pid) { fetchPlans(pid); }
  }, [params]);

  const fetchPlans = async (pid: string) => {
    try {
      const res = await fetch(`/api/field/floor-plan-pins?projectId=${pid}&type=plans`);
      if (res.ok) {
        const d = await res.json();
        const planList: FloorPlan[] = d.plans || [];
        setPlans(planList);
        if (planList.length > 0 && !activePlan) {
          setActivePlan(planList[0]);
          fetchPins(pid, planList[0].id);
        }
      }
    } catch { /* offline */ }
  };

  const fetchPins = async (pid: string, planId: string) => {
    try {
      const res = await fetch(`/api/field/floor-plan-pins?projectId=${pid}&floorPlanId=${planId}`);
      if (res.ok) { const d = await res.json(); setPins(d.pins || []); }
    } catch { /* offline */ }
  };

  const uploadPlan = async (file: File) => {
    if (!projectId) { setError('No active project.'); return; }
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      formData.append('name', file.name.replace(/\.[^.]+$/, ''));
      const res = await fetch('/api/field/floor-plan-pins', { method: 'POST', body: formData });
      if (res.ok) {
        const d = await res.json();
        const newPlan: FloorPlan = d.plan;
        setPlans(prev => [newPlan, ...prev]);
        setActivePlan(newPlan);
        setPins([]);
      } else throw new Error('Upload failed');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  /* ── Canvas click → add pin ── */
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!addingPin || !activePlan || isPanning) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x_pct = ((e.clientX - rect.left) / rect.width) * 100;
    const y_pct = ((e.clientY - rect.top)  / rect.height) * 100;
    setPendingPin({ x: x_pct, y: y_pct });
    setSelectedPin(null);
  }, [addingPin, activePlan, isPanning]);

  const savePin = async () => {
    if (!pendingPin || !activePlan || !projectId || !pinLabel.trim()) {
      setError('Label required.');
      return;
    }
    setSaving(true);
    const pin: GPSPin = {
      id:            crypto.randomUUID(),
      floor_plan_id: activePlan.id,
      project_id:    projectId,
      x_pct:         pendingPin.x,
      y_pct:         pendingPin.y,
      label:         pinLabel.trim(),
      category:      pinCategory,
      description:   pinDesc.trim() || undefined,
      created_at:    new Date().toISOString(),
      resolved:      false,
    };

    if (online) {
      try {
        const res = await fetch('/api/field/floor-plan-pins', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ pin }),
        });
        if (!res.ok) throw new Error('Save failed');
      } catch {
        await enqueue('floor-plan-pins', pin);
      }
    } else {
      await enqueue('floor-plan-pins', pin);
    }

    setPins(prev => [...prev, pin]);
    setPendingPin(null);
    setPinLabel('');
    setPinDesc('');
    setAddingPin(false);
    setSaving(false);
  };

  const deletePin = async (id: string) => {
    setPins(prev => prev.filter(p => p.id !== id));
    setSelectedPin(null);
    if (online) await fetch(`/api/field/floor-plan-pins/${id}`, { method: 'DELETE' }).catch(() => {});
  };

  const toggleResolve = async (pin: GPSPin) => {
    const updated = { ...pin, resolved: !pin.resolved };
    setPins(prev => prev.map(p => p.id === pin.id ? updated : p));
    setSelectedPin(updated);
    if (online) {
      await fetch(`/api/field/floor-plan-pins/${pin.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: updated.resolved }),
      }).catch(() => {});
    }
  };

  /* ── Zoom/pan handlers ── */
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(prev => Math.max(0.5, Math.min(5, prev - e.deltaY * 0.001)));
  };
  const handleMouseDown = (e: React.MouseEvent) => {
    if (addingPin) return;
    setIsPanning(true);
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !panStart.current) return;
    setPan({ x: panStart.current.px + e.clientX - panStart.current.mx, y: panStart.current.py + e.clientY - panStart.current.my });
  };
  const handleMouseUp = () => { setIsPanning(false); panStart.current = null; };

  const filteredPins = filterCat === 'all' ? pins : pins.filter(p => p.category === filterCat);

  return (
    <div style={{ minHeight:'100vh', background:'#0F1419', color:'#F0F4FF', fontFamily:'system-ui,sans-serif', display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div style={{ padding:'16px', borderBottom:'1px solid #1E3A5F', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => router.back()} style={{ background:'none', border:'none', color:'#8BAAC8', cursor:'pointer', fontSize:'20px' }}>←</button>
        <div style={{ flex:1 }}>
          <h1 style={{ margin:0, fontSize:'20px', fontWeight:700 }}>🗺 Floor Plan</h1>
          <p style={{ margin:0, fontSize:'12px', color:'#8BAAC8' }}>
            {activePlan ? activePlan.name : 'No plan selected'} · {filteredPins.length} pins ·{' '}
            <span style={{ color: online ? '#22C55E' : '#EF4444' }}>{online ? 'Online' : 'Offline'}</span>
          </p>
        </div>
        <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display:'none' }}
          onChange={e => e.target.files?.[0] && uploadPlan(e.target.files[0])} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{ padding:'8px 16px', background:'#1A1F2E', border:'1px solid #1E3A5F', borderRadius:8, color:'#F0F4FF', cursor:'pointer', fontSize:13 }}>
          {uploading ? '⏳ Uploading...' : '+ Upload Plan'}
        </button>
      </div>

      {error && (
        <div style={{ margin:'12px 16px 0', background:'#7F1D1D', border:'1px solid #EF4444', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#FCA5A5', display:'flex', justifyContent:'space-between' }}>
          ⚠ {error}
          <button onClick={() => setError('')} style={{ background:'none', border:'none', color:'#FCA5A5', cursor:'pointer' }}>✕</button>
        </div>
      )}

      {/* Plan Tabs */}
      {plans.length > 0 && (
        <div style={{ display:'flex', gap:6, padding:'10px 16px', overflowX:'auto', borderBottom:'1px solid #1E3A5F' }}>
          {plans.map(plan => (
            <button key={plan.id} onClick={() => { setActivePlan(plan); if (projectId) fetchPins(projectId, plan.id); }}
              style={{ padding:'6px 14px', borderRadius:20, border:'1px solid', flexShrink:0, borderColor: activePlan?.id === plan.id ? '#D4A017' : '#1E3A5F', background: activePlan?.id === plan.id ? '#D4A017' : '#1A1F2E', color: activePlan?.id === plan.id ? '#0F1419' : '#F0F4FF', cursor:'pointer', fontSize:12, fontWeight: activePlan?.id === plan.id ? 700 : 400 }}>
              {plan.name}
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      {activePlan && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', background:'#1A1F2E', borderBottom:'1px solid #1E3A5F', flexWrap:'wrap' }}>
          {/* Pin toggle */}
          <button onClick={() => { setAddingPin(!addingPin); setPendingPin(null); setSelectedPin(null); }}
            style={{ padding:'6px 14px', background: addingPin ? '#D4A017' : 'transparent', border:'1px solid', borderColor: addingPin ? '#D4A017' : '#1E3A5F', borderRadius:20, color: addingPin ? '#0F1419' : '#F0F4FF', cursor:'pointer', fontSize:12, fontWeight: addingPin ? 700 : 400 }}>
            {addingPin ? '✕ Cancel Pin' : '+ Add Pin'}
          </button>

          {/* Category filter */}
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ padding:'5px 10px', background:'#0F1419', border:'1px solid #1E3A5F', borderRadius:20, color:'#F0F4FF', fontSize:12, cursor:'pointer' }}>
            <option value="all">All ({pins.length})</option>
            {Object.keys(PIN_COLORS).map(cat => (
              <option key={cat} value={cat}>{PIN_ICONS[cat]} {cat} ({pins.filter(p=>p.category===cat).length})</option>
            ))}
          </select>

          {/* Zoom controls */}
          <div style={{ marginLeft:'auto', display:'flex', gap:4, alignItems:'center' }}>
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
              style={{ width:28, height:28, background:'#0F1419', border:'1px solid #1E3A5F', borderRadius:4, color:'#F0F4FF', cursor:'pointer', fontSize:16 }}>−</button>
            <span style={{ fontSize:11, color:'#8BAAC8', minWidth:40, textAlign:'center' }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(5, z + 0.25))}
              style={{ width:28, height:28, background:'#0F1419', border:'1px solid #1E3A5F', borderRadius:4, color:'#F0F4FF', cursor:'pointer', fontSize:16 }}>+</button>
            <button onClick={() => { setZoom(1); setPan({ x:0, y:0 }); }}
              style={{ padding:'4px 8px', background:'#0F1419', border:'1px solid #1E3A5F', borderRadius:4, color:'#8BAAC8', cursor:'pointer', fontSize:11 }}>Reset</button>
          </div>
        </div>
      )}

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Floor Plan Canvas */}
        <div style={{ flex:1, position:'relative', overflow:'hidden', background:'#111827' }}>
          {!activePlan ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color:'#8BAAC8', gap:16 }}>
              <div style={{ fontSize:64 }}>🗺</div>
              <h2 style={{ margin:0 }}>No Floor Plans Yet</h2>
              <p style={{ margin:0, fontSize:14 }}>Upload a floor plan to start pinning locations</p>
              <button onClick={() => fileRef.current?.click()}
                style={{ padding:'12px 28px', background:'#D4A017', border:'none', borderRadius:10, color:'#0F1419', fontWeight:700, fontSize:15, cursor:'pointer' }}>
                Upload Floor Plan
              </button>
            </div>
          ) : (
            <div ref={canvasRef}
              style={{ width:'100%', height:'100%', cursor: addingPin ? 'crosshair' : isPanning ? 'grabbing' : 'grab', userSelect:'none', position:'relative', touchAction:'none' }}
              onClick={handleCanvasClick}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}>
              {/* Transformed container */}
              <div style={{ position:'absolute', top:'50%', left:'50%', transform:`translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin:'center center', transition: isPanning ? 'none' : 'transform 0.1s' }}>
                <div style={{ position:'relative', display:'inline-block' }}>
                  <img ref={imgRef} src={activePlan.image_url} alt={activePlan.name}
                    style={{ display:'block', maxWidth:'80vw', maxHeight:'70vh', userSelect:'none', pointerEvents:'none' }}
                    draggable={false} />
                  {/* Render pins */}
                  {filteredPins.map(pin => (
                    <button key={pin.id}
                      onClick={e => { e.stopPropagation(); setSelectedPin(pin === selectedPin ? null : pin); setPendingPin(null); }}
                      style={{ position:'absolute', left:`${pin.x_pct}%`, top:`${pin.y_pct}%`, transform:'translate(-50%, -100%)', background: PIN_COLORS[pin.category], border: selectedPin?.id === pin.id ? '2px solid #F0F4FF' : '2px solid transparent', borderRadius:'50% 50% 50% 0', width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:14, opacity: pin.resolved ? 0.5 : 1, boxShadow:'0 2px 8px rgba(0,0,0,0.4)', transition:'transform 0.15s', zIndex: selectedPin?.id === pin.id ? 10 : 5 }}>
                      {PIN_ICONS[pin.category]}
                    </button>
                  ))}
                  {/* Pending pin */}
                  {pendingPin && (
                    <div style={{ position:'absolute', left:`${pendingPin.x}%`, top:`${pendingPin.y}%`, transform:'translate(-50%, -100%)', background:'#D4A017', border:'2px solid #fff', borderRadius:'50% 50% 50% 0', width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, animation:'pulse 0.5s infinite alternate', zIndex:20 }}>
                      {PIN_ICONS[pinCategory]}
                    </div>
                  )}
                </div>
              </div>
              {/* Crosshair guide when adding */}
              {addingPin && !pendingPin && (
                <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', background:'rgba(212,160,23,0.9)', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:600, color:'#0F1419', pointerEvents:'none' }}>
                  Tap floor plan to place pin
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div style={{ width:300, background:'#1A1F2E', borderLeft:'1px solid #1E3A5F', overflowY:'auto', flexShrink:0 }}>
          {/* Pending Pin Form */}
          {pendingPin && (
            <div style={{ padding:16, borderBottom:'1px solid #1E3A5F' }}>
              <h3 style={{ margin:'0 0 12px', fontSize:14, color:'#D4A017' }}>📍 New Pin</h3>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:10 }}>
                {(Object.keys(PIN_COLORS) as GPSPin['category'][]).map(cat => (
                  <button key={cat} onClick={() => setPinCategory(cat)}
                    style={{ padding:'4px 8px', borderRadius:12, border:'1px solid', borderColor: pinCategory === cat ? PIN_COLORS[cat] : '#1E3A5F', background: pinCategory === cat ? PIN_COLORS[cat] : 'transparent', color: pinCategory === cat ? '#fff' : '#8BAAC8', cursor:'pointer', fontSize:11 }}>
                    {PIN_ICONS[cat]} {cat}
                  </button>
                ))}
              </div>
              <input placeholder="Label *" value={pinLabel} onChange={e => setPinLabel(e.target.value)}
                style={{ width:'100%', background:'#0F1419', border:'1px solid #1E3A5F', borderRadius:8, color:'#F0F4FF', padding:'8px 10px', fontSize:13, marginBottom:8, boxSizing:'border-box' }} />
              <textarea placeholder="Description" value={pinDesc} onChange={e => setPinDesc(e.target.value)} rows={2}
                style={{ width:'100%', background:'#0F1419', border:'1px solid #1E3A5F', borderRadius:8, color:'#F0F4FF', padding:'8px 10px', fontSize:13, marginBottom:10, boxSizing:'border-box', resize:'vertical' }} />
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={savePin} disabled={saving || !pinLabel.trim()}
                  style={{ flex:1, padding:'8px', background: pinLabel.trim() ? '#D4A017' : '#374151', border:'none', borderRadius:8, color: pinLabel.trim() ? '#0F1419' : '#9CA3AF', fontWeight:700, cursor: pinLabel.trim() ? 'pointer' : 'not-allowed', fontSize:13 }}>
                  {saving ? '...' : 'Save Pin'}
                </button>
                <button onClick={() => { setPendingPin(null); setPinLabel(''); setPinDesc(''); }}
                  style={{ padding:'8px 12px', background:'transparent', border:'1px solid #1E3A5F', borderRadius:8, color:'#8BAAC8', cursor:'pointer', fontSize:13 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Selected Pin Detail */}
          {selectedPin && !pendingPin && (
            <div style={{ padding:16, borderBottom:'1px solid #1E3A5F' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background: PIN_COLORS[selectedPin.category], display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>
                  {PIN_ICONS[selectedPin.category]}
                </div>
                <h3 style={{ margin:0, fontSize:14 }}>{selectedPin.label}</h3>
                <button onClick={() => setSelectedPin(null)} style={{ marginLeft:'auto', background:'none', border:'none', color:'#8BAAC8', cursor:'pointer', fontSize:16 }}>✕</button>
              </div>
              {selectedPin.description && <p style={{ margin:'0 0 10px', fontSize:13, color:'#8BAAC8' }}>{selectedPin.description}</p>}
              <p style={{ margin:'0 0 12px', fontSize:11, color:'#4B5563' }}>{new Date(selectedPin.created_at).toLocaleString()}</p>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => toggleResolve(selectedPin)}
                  style={{ flex:1, padding:'7px', background: selectedPin.resolved ? '#1A1F2E' : '#14532D', border:'1px solid', borderColor: selectedPin.resolved ? '#1E3A5F' : '#22C55E', borderRadius:8, color: selectedPin.resolved ? '#8BAAC8' : '#22C55E', cursor:'pointer', fontSize:12 }}>
                  {selectedPin.resolved ? 'Reopen' : '✓ Resolve'}
                </button>
                <button onClick={() => deletePin(selectedPin.id)}
                  style={{ padding:'7px 12px', background:'#7F1D1D', border:'1px solid #EF4444', borderRadius:8, color:'#FCA5A5', cursor:'pointer', fontSize:12 }}>
                  Delete
                </button>
              </div>
            </div>
          )}

          {/* Pin List */}
          <div style={{ padding:16 }}>
            <h3 style={{ margin:'0 0 12px', fontSize:13, color:'#8BAAC8', textTransform:'uppercase', letterSpacing:'0.05em' }}>
              Pins ({filteredPins.length})
            </h3>
            {filteredPins.length === 0 ? (
              <div style={{ textAlign:'center', padding:'24px 0', color:'#8BAAC8' }}>
                <div style={{ fontSize:32 }}>📍</div>
                <p style={{ margin:'8px 0 4px', fontSize:13 }}>{filterCat === 'all' ? 'No pins yet' : 'No ' + filterCat + ' pins'}</p>
                <p style={{ margin:0, fontSize:11 }}>Click "+ Add Pin" then tap the floor plan</p>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {filteredPins.map(pin => (
                  <button key={pin.id} onClick={() => { setSelectedPin(pin); setPendingPin(null); }}
                    style={{ display:'flex', alignItems:'center', gap:8, background: selectedPin?.id === pin.id ? '#0F1419' : 'transparent', border:'1px solid', borderColor: selectedPin?.id === pin.id ? '#D4A017' : '#1E3A5F', borderRadius:8, padding:'8px 10px', cursor:'pointer', textAlign:'left', opacity: pin.resolved ? 0.6 : 1 }}>
                    <div style={{ width:24, height:24, borderRadius:'50%', background: PIN_COLORS[pin.category], display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}>
                      {PIN_ICONS[pin.category]}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontSize:12, fontWeight:600, color:'#F0F4FF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pin.label}</p>
                      <p style={{ margin:0, fontSize:10, color:'#8BAAC8', textTransform:'capitalize' }}>{pin.category}{pin.resolved ? ' · resolved' : ''}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
