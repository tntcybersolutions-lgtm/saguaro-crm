'use client';
/**
 * Saguaro Field — Resource Planning
 * Crew assignments, headcount tracking, equipment, check-in/out, and week-ahead forecast.
 * Mobile-first, offline-capable field page.
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

/* ── colour palette ────────────────────────────────────────────────── */
const GOLD = '#D4A017', BG = '#07101C', RAISED = '#0D1D2E', BORDER = '#1E3A5F';
const TEXT = '#F0F4FF', DIM = '#8BAAC8', GREEN = '#22C55E', RED = '#EF4444';
const AMBER = '#F59E0B', BLUE = '#3B82F6', PURPLE = '#8B5CF6';

function hr(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}

/* ── shared inline styles ──────────────────────────────────────────── */
const inp: React.CSSProperties = { width: '100%', background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '11px 14px', color: TEXT, fontSize: 15, outline: 'none', boxSizing: 'border-box' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };
const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 14px 10px', marginBottom: 12 };
const secLbl: React.CSSProperties = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 };
const pillBase: React.CSSProperties = { display: 'inline-block', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, marginRight: 6 };
const btnBase: React.CSSProperties = { border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#000' };
const goldBtn: React.CSSProperties = { ...btnBase, background: GOLD };
const blueBtn: React.CSSProperties = { ...btnBase, background: BLUE, color: TEXT };
const ghostBtn: React.CSSProperties = { ...btnBase, background: 'transparent', border: `1px solid ${BORDER}`, color: DIM };
const selectSt: React.CSSProperties = { ...inp, appearance: 'none' as const, WebkitAppearance: 'none' as const };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: BLUE, fontSize: 13, cursor: 'pointer', padding: 0, textDecoration: 'underline' };

/* ── types ─────────────────────────────────────────────────────────── */
type WorkerStatus = 'on-site' | 'off-site' | 'absent';
type Tab = 'crew' | 'equipment' | 'request' | 'forecast' | 'contacts' | 'subs';

interface Worker {
  id: string;
  name: string;
  trade: string;
  role: string;
  phone: string;
  status: WorkerStatus;
  hours_scheduled: number;
  area: string;
  task: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  company: string;
}

interface Equipment {
  id: string;
  name: string;
  type: string;
  operator: string;
  area: string;
  status: string;
  hours_today: number;
}

interface ForecastDay {
  date: string;
  day_label: string;
  workers_planned: number;
  equipment_planned: number;
  weather: string;
  weather_impact: string;
  high_temp: number;
  low_temp: number;
}

interface SubcontractorCrew {
  id: string;
  company: string;
  trade: string;
  headcount: number;
  foreman: string;
  foreman_phone: string;
}

interface ResourceRequest {
  id: string;
  trade: string;
  count: number;
  needed_date: string;
  priority: string;
  notes: string;
  status: string;
  created_at: string;
}

/* ── helpers ───────────────────────────────────────────────────────── */
function todayISO(): string { return new Date().toISOString().split('T')[0]; }
function todayDisplay(): string { return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
function timeDisplay(iso: string | null): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function uid(): string { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

const TRADES = ['Electrical', 'Plumbing', 'HVAC', 'Framing', 'Concrete', 'Roofing', 'Drywall', 'Painting', 'Flooring', 'Steel', 'Fire Protection', 'General Labor', 'Supervision', 'Other'];
const AREAS = ['Building A', 'Building B', 'Site Work', 'Parking', 'Utility', 'Interior', 'Exterior', 'Roof', 'Basement', 'Mechanical Room'];
const STATUS_COLORS: Record<WorkerStatus, string> = { 'on-site': GREEN, 'off-site': AMBER, absent: RED };
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const PRIORITY_COLORS: Record<string, string> = { Low: DIM, Medium: BLUE, High: AMBER, Critical: RED };

/* ── main inner component ──────────────────────────────────────────── */
function ResourcePlanningInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  /* state */
  const [tab, setTab] = useState<Tab>('crew');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const [projectName, setProjectName] = useState('');
  const [saving, setSaving] = useState(false);

  /* data */
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [subCrews, setSubCrews] = useState<SubcontractorCrew[]>([]);
  const [requests, setRequests] = useState<ResourceRequest[]>([]);
  const [weatherNotes, setWeatherNotes] = useState('');

  /* filters */
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTrade, setFilterTrade] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterStatus, setFilterStatus] = useState<WorkerStatus | ''>('');

  /* reassign modal */
  const [reassignWorker, setReassignWorker] = useState<Worker | null>(null);
  const [newArea, setNewArea] = useState('');
  const [newTask, setNewTask] = useState('');

  /* request form */
  const [reqTrade, setReqTrade] = useState('');
  const [reqCount, setReqCount] = useState('1');
  const [reqDate, setReqDate] = useState(todayISO());
  const [reqPriority, setReqPriority] = useState('Medium');
  const [reqNotes, setReqNotes] = useState('');

  /* online detection */
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  /* initial data fetch */
  const loadData = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const [wRes, eRes, fRes, sRes, rRes, pRes] = await Promise.all([
        fetch(`/api/resource-planning/workers?projectId=${projectId}&date=${todayISO()}`),
        fetch(`/api/resource-planning/equipment?projectId=${projectId}&date=${todayISO()}`),
        fetch(`/api/resource-planning/forecast?projectId=${projectId}`),
        fetch(`/api/resource-planning/subcontractors?projectId=${projectId}&date=${todayISO()}`),
        fetch(`/api/resource-planning/requests?projectId=${projectId}`),
        fetch(`/api/projects/${projectId}`),
      ]);
      if (wRes.ok) { const d = await wRes.json(); setWorkers(d.workers || d || []); }
      if (eRes.ok) { const d = await eRes.json(); setEquipment(d.equipment || d || []); }
      if (fRes.ok) { const d = await fRes.json(); setForecast(d.forecast || d || []); setWeatherNotes(d.weather_notes || ''); }
      if (sRes.ok) { const d = await sRes.json(); setSubCrews(d.subcontractors || d || []); }
      if (rRes.ok) { const d = await rRes.json(); setRequests(d.requests || d || []); }
      if (pRes.ok) { const d = await pRes.json(); setProjectName(d.name || d.project_name || ''); }
    } catch (e: unknown) {
      setError('Failed to load resource data. You may be offline.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── actions ── */
  async function handleCheckIn(w: Worker) {
    const now = new Date().toISOString();
    setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, status: 'on-site' as WorkerStatus, checked_in_at: now } : x));
    await enqueue({
      url: `/api/resource-planning/workers/${w.id}/check-in`,
      method: 'POST',
      body: JSON.stringify({ projectId, timestamp: now }),
      contentType: 'application/json',
      isFormData: false,
    });
  }

  async function handleCheckOut(w: Worker) {
    const now = new Date().toISOString();
    setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, status: 'off-site' as WorkerStatus, checked_out_at: now } : x));
    await enqueue({
      url: `/api/resource-planning/workers/${w.id}/check-out`,
      method: 'POST',
      body: JSON.stringify({ projectId, timestamp: now }),
      contentType: 'application/json',
      isFormData: false,
    });
  }

  async function handleMarkAbsent(w: Worker) {
    setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, status: 'absent' as WorkerStatus } : x));
    await enqueue({
      url: `/api/resource-planning/workers/${w.id}/status`,
      method: 'PATCH',
      body: JSON.stringify({ projectId, status: 'absent', date: todayISO() }),
      contentType: 'application/json',
      isFormData: false,
    });
  }

  async function handleReassign() {
    if (!reassignWorker) return;
    setSaving(true);
    const updated = { ...reassignWorker, area: newArea || reassignWorker.area, task: newTask || reassignWorker.task };
    setWorkers(prev => prev.map(x => x.id === updated.id ? updated : x));
    await enqueue({
      url: `/api/resource-planning/workers/${reassignWorker.id}/reassign`,
      method: 'PATCH',
      body: JSON.stringify({ projectId, area: updated.area, task: updated.task }),
      contentType: 'application/json',
      isFormData: false,
    });
    setSaving(false);
    setReassignWorker(null);
    setNewArea('');
    setNewTask('');
  }

  async function handleSubmitRequest() {
    if (!reqTrade) return;
    setSaving(true);
    const req: ResourceRequest = {
      id: uid(),
      trade: reqTrade,
      count: parseInt(reqCount) || 1,
      needed_date: reqDate,
      priority: reqPriority,
      notes: reqNotes,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    setRequests(prev => [req, ...prev]);
    await enqueue({
      url: '/api/resource-planning/requests',
      method: 'POST',
      body: JSON.stringify({ ...req, projectId }),
      contentType: 'application/json',
      isFormData: false,
    });
    setSaving(false);
    setReqTrade('');
    setReqCount('1');
    setReqDate(todayISO());
    setReqPriority('Medium');
    setReqNotes('');
  }

  async function handleSaveWeatherNotes(notes: string) {
    setWeatherNotes(notes);
    await enqueue({
      url: '/api/resource-planning/weather-notes',
      method: 'POST',
      body: JSON.stringify({ projectId, notes, date: todayISO() }),
      contentType: 'application/json',
      isFormData: false,
    });
  }

  /* ── filtered workers ── */
  const filteredWorkers = workers.filter(w => {
    if (filterTrade && w.trade !== filterTrade) return false;
    if (filterArea && w.area !== filterArea) return false;
    if (filterStatus && w.status !== filterStatus) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return w.name.toLowerCase().includes(s) || w.trade.toLowerCase().includes(s) || w.role.toLowerCase().includes(s) || w.company.toLowerCase().includes(s);
    }
    return true;
  });

  /* ── headcount summary ── */
  const onSiteCount = workers.filter(w => w.status === 'on-site').length;
  const offSiteCount = workers.filter(w => w.status === 'off-site').length;
  const absentCount = workers.filter(w => w.status === 'absent').length;
  const totalWorkers = workers.length;
  const totalSubHeadcount = subCrews.reduce((s, c) => s + c.headcount, 0);

  /* unique trades and areas from actual data */
  const activeTrades = [...new Set(workers.map(w => w.trade))].sort();
  const activeAreas = [...new Set(workers.map(w => w.area).filter(Boolean))].sort();

  /* ── no project guard ── */
  if (!projectId) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: TEXT, padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <p style={{ color: RED, fontSize: 16 }}>No project selected. Please return to the dashboard and choose a project.</p>
        <button style={backBtn} onClick={() => router.push('/field')}>Back to Dashboard</button>
      </div>
    );
  }

  /* ── render ── */
  return (
    <div style={{ minHeight: '100dvh', background: BG, color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', paddingBottom: 100 }}>
      {/* offline banner */}
      {!online && (
        <div style={{ background: AMBER, color: '#000', textAlign: 'center', padding: '6px 12px', fontSize: 13, fontWeight: 700 }}>
          Offline -- changes will sync when connected
        </div>
      )}

      {/* header */}
      <div style={{ padding: '16px 16px 0' }}>
        <button style={backBtn} onClick={() => router.back()}>&#8592; Back</button>
        <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: GOLD }}>Resource Planning</h1>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: DIM }}>{projectName || 'Project'} &middot; {todayDisplay()}</p>
      </div>

      {/* headcount summary bar */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto' }}>
        <div style={{ ...card, flex: '1 0 auto', minWidth: 72, textAlign: 'center', padding: '10px 8px', marginBottom: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: TEXT }}>{totalWorkers}</div>
          <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', fontWeight: 700 }}>Total</div>
        </div>
        <div style={{ ...card, flex: '1 0 auto', minWidth: 72, textAlign: 'center', padding: '10px 8px', marginBottom: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: GREEN }}>{onSiteCount}</div>
          <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', fontWeight: 700 }}>On-Site</div>
        </div>
        <div style={{ ...card, flex: '1 0 auto', minWidth: 72, textAlign: 'center', padding: '10px 8px', marginBottom: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: AMBER }}>{offSiteCount}</div>
          <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', fontWeight: 700 }}>Off-Site</div>
        </div>
        <div style={{ ...card, flex: '1 0 auto', minWidth: 72, textAlign: 'center', padding: '10px 8px', marginBottom: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: RED }}>{absentCount}</div>
          <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', fontWeight: 700 }}>Absent</div>
        </div>
        <div style={{ ...card, flex: '1 0 auto', minWidth: 72, textAlign: 'center', padding: '10px 8px', marginBottom: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: PURPLE }}>{totalSubHeadcount}</div>
          <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', fontWeight: 700 }}>Subs</div>
        </div>
      </div>

      {/* tab bar */}
      <div style={{ display: 'flex', gap: 0, padding: '8px 16px', overflowX: 'auto' }}>
        {([
          { key: 'crew' as Tab, label: 'Crew' },
          { key: 'equipment' as Tab, label: 'Equipment' },
          { key: 'request' as Tab, label: 'Request' },
          { key: 'forecast' as Tab, label: 'Forecast' },
          { key: 'contacts' as Tab, label: 'Contacts' },
          { key: 'subs' as Tab, label: 'Subs' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: tab === t.key ? GOLD : 'transparent',
              color: tab === t.key ? '#000' : DIM,
              border: tab === t.key ? 'none' : `1px solid ${BORDER}`,
              borderRadius: 20,
              padding: '7px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              marginRight: 6,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* loading state */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: DIM, fontSize: 14 }}>Loading resource data...</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* error state */}
      {error && !loading && (
        <div style={{ margin: '20px 16px', padding: 16, background: `rgba(${hr(RED)},0.15)`, border: `1px solid ${RED}`, borderRadius: 12, color: RED, fontSize: 14 }}>
          {error}
          <button onClick={loadData} style={{ ...blueBtn, marginTop: 10, display: 'block', fontSize: 13, padding: '8px 14px' }}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div style={{ padding: '4px 16px 20px' }}>

          {/* ═══════════════ CREW TAB ═══════════════ */}
          {tab === 'crew' && (
            <>
              {/* search + filters */}
              <div style={{ marginBottom: 12 }}>
                <input
                  style={{ ...inp, marginBottom: 8 }}
                  placeholder="Search workers by name, trade, role, or company..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select style={{ ...selectSt, flex: '1 1 120px' }} value={filterTrade} onChange={e => setFilterTrade(e.target.value)}>
                    <option value="">All Trades</option>
                    {(activeTrades.length ? activeTrades : TRADES).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select style={{ ...selectSt, flex: '1 1 120px' }} value={filterArea} onChange={e => setFilterArea(e.target.value)}>
                    <option value="">All Areas</option>
                    {(activeAreas.length ? activeAreas : AREAS).map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <select style={{ ...selectSt, flex: '1 1 110px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value as WorkerStatus | '')}>
                    <option value="">All Status</option>
                    <option value="on-site">On-Site</option>
                    <option value="off-site">Off-Site</option>
                    <option value="absent">Absent</option>
                  </select>
                </div>
              </div>

              {/* empty state */}
              {filteredWorkers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>&#128101;</div>
                  <p style={{ color: DIM, fontSize: 15, margin: '0 0 4px' }}>
                    {workers.length === 0 ? 'No crew assigned today' : 'No workers match filters'}
                  </p>
                  {workers.length > 0 && (
                    <button style={linkBtn} onClick={() => { setSearchTerm(''); setFilterTrade(''); setFilterArea(''); setFilterStatus(''); }}>
                      Clear all filters
                    </button>
                  )}
                </div>
              )}

              {/* worker list */}
              {filteredWorkers.map(w => (
                <div key={w.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{w.name}</div>
                      <div style={{ fontSize: 12, color: DIM }}>{w.role} &middot; {w.trade} &middot; {w.company}</div>
                    </div>
                    <span style={{ ...pillBase, background: `rgba(${hr(STATUS_COLORS[w.status])},0.18)`, color: STATUS_COLORS[w.status] }}>
                      {w.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: DIM, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span>Area: <strong style={{ color: TEXT }}>{w.area || 'Unassigned'}</strong></span>
                    <span>Task: <strong style={{ color: TEXT }}>{w.task || '--'}</strong></span>
                    <span>Hrs: <strong style={{ color: TEXT }}>{w.hours_scheduled}h</strong></span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, fontSize: 12, color: DIM, marginBottom: 10 }}>
                    <span>In: <strong style={{ color: w.checked_in_at ? GREEN : DIM }}>{timeDisplay(w.checked_in_at)}</strong></span>
                    <span>Out: <strong style={{ color: w.checked_out_at ? AMBER : DIM }}>{timeDisplay(w.checked_out_at)}</strong></span>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {!w.checked_in_at && w.status !== 'absent' && (
                      <button style={{ ...btnBase, background: GREEN, color: '#000', fontSize: 12, padding: '6px 12px' }} onClick={() => handleCheckIn(w)}>
                        Check In
                      </button>
                    )}
                    {w.checked_in_at && !w.checked_out_at && (
                      <button style={{ ...btnBase, background: AMBER, color: '#000', fontSize: 12, padding: '6px 12px' }} onClick={() => handleCheckOut(w)}>
                        Check Out
                      </button>
                    )}
                    {w.status !== 'absent' && (
                      <button style={{ ...ghostBtn, fontSize: 12, padding: '6px 12px' }} onClick={() => handleMarkAbsent(w)}>
                        Mark Absent
                      </button>
                    )}
                    <button
                      style={{ ...ghostBtn, fontSize: 12, padding: '6px 12px', borderColor: BLUE, color: BLUE }}
                      onClick={() => { setReassignWorker(w); setNewArea(w.area); setNewTask(w.task); }}
                    >
                      Reassign
                    </button>
                    {w.phone && (
                      <a href={`tel:${w.phone}`} style={{ ...ghostBtn, fontSize: 12, padding: '6px 12px', borderColor: GREEN, color: GREEN, textDecoration: 'none', display: 'inline-block' }}>
                        Call
                      </a>
                    )}
                  </div>
                </div>
              ))}

              {/* filtered count */}
              {filteredWorkers.length > 0 && (
                <p style={{ textAlign: 'center', fontSize: 12, color: DIM, margin: '8px 0' }}>
                  Showing {filteredWorkers.length} of {workers.length} workers
                </p>
              )}
            </>
          )}

          {/* ═══════════════ EQUIPMENT TAB ═══════════════ */}
          {tab === 'equipment' && (
            <>
              <p style={secLbl}>Equipment on site today</p>
              {equipment.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>&#128296;</div>
                  <p style={{ color: DIM, fontSize: 15 }}>No equipment assigned today</p>
                </div>
              )}
              {equipment.map(eq => (
                <div key={eq.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{eq.name}</div>
                      <div style={{ fontSize: 12, color: DIM }}>{eq.type}</div>
                    </div>
                    <span style={{
                      ...pillBase,
                      background: `rgba(${hr(eq.status === 'In Use' ? GREEN : eq.status === 'Idle' ? AMBER : RED)},0.18)`,
                      color: eq.status === 'In Use' ? GREEN : eq.status === 'Idle' ? AMBER : RED,
                    }}>
                      {eq.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: DIM, marginTop: 8 }}>
                    <span>Operator: <strong style={{ color: TEXT }}>{eq.operator || 'Unassigned'}</strong></span>
                    <span>Area: <strong style={{ color: TEXT }}>{eq.area || '--'}</strong></span>
                    <span>Hours: <strong style={{ color: TEXT }}>{eq.hours_today}h</strong></span>
                  </div>
                </div>
              ))}
              {equipment.length > 0 && (
                <div style={{ ...card, background: `rgba(${hr(BLUE)},0.08)`, borderColor: BLUE }}>
                  <p style={{ margin: 0, fontSize: 13, color: DIM }}>
                    <strong style={{ color: TEXT }}>{equipment.length}</strong> pieces of equipment &middot;{' '}
                    <strong style={{ color: GREEN }}>{equipment.filter(e => e.status === 'In Use').length}</strong> in use &middot;{' '}
                    <strong style={{ color: AMBER }}>{equipment.filter(e => e.status === 'Idle').length}</strong> idle &middot;{' '}
                    <strong style={{ color: RED }}>{equipment.filter(e => e.status !== 'In Use' && e.status !== 'Idle').length}</strong> down
                  </p>
                </div>
              )}
            </>
          )}

          {/* ═══════════════ REQUEST TAB ═══════════════ */}
          {tab === 'request' && (
            <>
              <p style={secLbl}>Request additional resources</p>
              <div style={card}>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Trade *</label>
                  <select style={selectSt} value={reqTrade} onChange={e => setReqTrade(e.target.value)}>
                    <option value="">Select trade...</option>
                    {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Workers needed</label>
                    <input style={inp} type="number" min="1" value={reqCount} onChange={e => setReqCount(e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Needed by</label>
                    <input style={inp} type="date" value={reqDate} onChange={e => setReqDate(e.target.value)} />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Priority</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {PRIORITIES.map(p => (
                      <button
                        key={p}
                        onClick={() => setReqPriority(p)}
                        style={{
                          ...pillBase,
                          cursor: 'pointer',
                          border: reqPriority === p ? `2px solid ${PRIORITY_COLORS[p]}` : `1px solid ${BORDER}`,
                          background: reqPriority === p ? `rgba(${hr(PRIORITY_COLORS[p])},0.18)` : 'transparent',
                          color: reqPriority === p ? PRIORITY_COLORS[p] : DIM,
                          padding: '6px 12px',
                          fontSize: 12,
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Notes</label>
                  <textarea
                    style={{ ...inp, minHeight: 70, resize: 'vertical' }}
                    placeholder="Describe the work or reason for the request..."
                    value={reqNotes}
                    onChange={e => setReqNotes(e.target.value)}
                  />
                </div>
                <button
                  style={{ ...goldBtn, width: '100%', opacity: (!reqTrade || saving) ? 0.5 : 1 }}
                  disabled={!reqTrade || saving}
                  onClick={handleSubmitRequest}
                >
                  {saving ? 'Submitting...' : 'Submit Resource Request'}
                </button>
              </div>

              {/* existing requests */}
              {requests.length > 0 && (
                <>
                  <p style={{ ...secLbl, marginTop: 20 }}>Previous requests</p>
                  {requests.map(r => (
                    <div key={r.id} style={card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{r.count}x {r.trade}</span>
                        <span style={{
                          ...pillBase,
                          background: `rgba(${hr(r.status === 'approved' ? GREEN : r.status === 'denied' ? RED : AMBER)},0.18)`,
                          color: r.status === 'approved' ? GREEN : r.status === 'denied' ? RED : AMBER,
                        }}>
                          {r.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: DIM }}>
                        Needed by {r.needed_date} &middot; <span style={{ color: PRIORITY_COLORS[r.priority] || DIM }}>{r.priority}</span>
                      </div>
                      {r.notes && <p style={{ fontSize: 12, color: DIM, margin: '4px 0 0' }}>{r.notes}</p>}
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* ═══════════════ FORECAST TAB ═══════════════ */}
          {tab === 'forecast' && (
            <>
              <p style={secLbl}>Week-ahead resource forecast</p>
              {forecast.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>&#128197;</div>
                  <p style={{ color: DIM, fontSize: 15 }}>No forecast data available</p>
                </div>
              )}
              {forecast.map((day, idx) => (
                <div key={day.date} style={{ ...card, borderLeftWidth: 3, borderLeftColor: idx === 0 ? GOLD : BORDER }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: idx === 0 ? GOLD : TEXT }}>{day.day_label}</div>
                      <div style={{ fontSize: 12, color: DIM }}>{day.date}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: DIM }}>
                        {day.high_temp !== undefined ? `${day.high_temp}/${day.low_temp}F` : ''}
                      </div>
                      <div style={{ fontSize: 12, color: DIM }}>{day.weather}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                    <span style={{ color: DIM }}>Workers: <strong style={{ color: TEXT }}>{day.workers_planned}</strong></span>
                    <span style={{ color: DIM }}>Equipment: <strong style={{ color: TEXT }}>{day.equipment_planned}</strong></span>
                  </div>
                  {day.weather_impact && (
                    <div style={{ marginTop: 6, padding: '6px 10px', background: `rgba(${hr(AMBER)},0.1)`, borderRadius: 8, fontSize: 12, color: AMBER }}>
                      Weather impact: {day.weather_impact}
                    </div>
                  )}
                </div>
              ))}

              {/* weather impact notes */}
              <p style={{ ...secLbl, marginTop: 20 }}>Weather impact notes</p>
              <div style={card}>
                <textarea
                  style={{ ...inp, minHeight: 80, resize: 'vertical' }}
                  placeholder="Note any weather-related schedule impacts, delays, or precautions..."
                  value={weatherNotes}
                  onChange={e => setWeatherNotes(e.target.value)}
                />
                <button
                  style={{ ...blueBtn, marginTop: 8, width: '100%', fontSize: 13 }}
                  onClick={() => handleSaveWeatherNotes(weatherNotes)}
                >
                  Save Weather Notes
                </button>
              </div>
            </>
          )}

          {/* ═══════════════ CONTACTS TAB ═══════════════ */}
          {tab === 'contacts' && (
            <>
              <p style={secLbl}>Crew contact list</p>
              {workers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>&#128222;</div>
                  <p style={{ color: DIM, fontSize: 15 }}>No crew members assigned</p>
                </div>
              )}

              {/* group by trade */}
              {activeTrades.map(trade => {
                const tradeWorkers = workers.filter(w => w.trade === trade);
                if (tradeWorkers.length === 0) return null;
                return (
                  <div key={trade} style={{ marginBottom: 16 }}>
                    <p style={{ ...secLbl, color: GOLD, marginBottom: 6 }}>{trade} ({tradeWorkers.length})</p>
                    {tradeWorkers.map(w => (
                      <div key={w.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{w.name}</div>
                          <div style={{ fontSize: 12, color: DIM }}>{w.role} &middot; {w.company}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ ...pillBase, background: `rgba(${hr(STATUS_COLORS[w.status])},0.18)`, color: STATUS_COLORS[w.status], fontSize: 10 }}>
                            {w.status}
                          </span>
                          {w.phone ? (
                            <a
                              href={`tel:${w.phone}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                background: `rgba(${hr(GREEN)},0.15)`,
                                color: GREEN,
                                textDecoration: 'none',
                                fontSize: 16,
                              }}
                            >
                              &#9742;
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: DIM }}>No phone</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* sub foremen contacts */}
              {subCrews.length > 0 && (
                <>
                  <p style={{ ...secLbl, color: PURPLE, marginTop: 20 }}>Subcontractor foremen</p>
                  {subCrews.map(sc => (
                    <div key={sc.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{sc.foreman}</div>
                        <div style={{ fontSize: 12, color: DIM }}>{sc.company} &middot; {sc.trade}</div>
                      </div>
                      {sc.foreman_phone ? (
                        <a
                          href={`tel:${sc.foreman_phone}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: `rgba(${hr(GREEN)},0.15)`,
                            color: GREEN,
                            textDecoration: 'none',
                            fontSize: 16,
                          }}
                        >
                          &#9742;
                        </a>
                      ) : (
                        <span style={{ fontSize: 11, color: DIM }}>No phone</span>
                      )}
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* ═══════════════ SUBS TAB ═══════════════ */}
          {tab === 'subs' && (
            <>
              <p style={secLbl}>Subcontractor crew counts</p>
              {subCrews.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>&#127959;</div>
                  <p style={{ color: DIM, fontSize: 15 }}>No subcontractor crews reported today</p>
                </div>
              )}
              {subCrews.map(sc => (
                <div key={sc.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{sc.company}</div>
                      <div style={{ fontSize: 12, color: DIM }}>{sc.trade}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: PURPLE }}>{sc.headcount}</div>
                      <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase' }}>workers</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: DIM }}>
                    Foreman: <strong style={{ color: TEXT }}>{sc.foreman}</strong>
                    {sc.foreman_phone && (
                      <> &middot; <a href={`tel:${sc.foreman_phone}`} style={{ color: GREEN, textDecoration: 'none' }}>{sc.foreman_phone}</a></>
                    )}
                  </div>
                </div>
              ))}
              {subCrews.length > 0 && (
                <div style={{ ...card, background: `rgba(${hr(PURPLE)},0.08)`, borderColor: PURPLE }}>
                  <p style={{ margin: 0, fontSize: 14, color: DIM }}>
                    <strong style={{ color: PURPLE }}>{subCrews.length}</strong> subcontractors &middot;{' '}
                    <strong style={{ color: TEXT }}>{totalSubHeadcount}</strong> total workers on site
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════ REASSIGN MODAL ═══════════════ */}
      {reassignWorker && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          onClick={() => setReassignWorker(null)}
        >
          <div
            style={{
              background: RAISED,
              border: `1px solid ${BORDER}`,
              borderRadius: '20px 20px 0 0',
              padding: '20px 16px 32px',
              width: '100%',
              maxWidth: 500,
              maxHeight: '80dvh',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 40, height: 4, background: BORDER, borderRadius: 2, margin: '0 auto 16px' }} />
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: GOLD }}>Reassign Worker</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM }}>
              {reassignWorker.name} &middot; {reassignWorker.trade}
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>New Area</label>
              <select style={selectSt} value={newArea} onChange={e => setNewArea(e.target.value)}>
                <option value="">Select area...</option>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>New Task</label>
              <input
                style={inp}
                placeholder="Enter task description..."
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ ...ghostBtn, flex: 1 }} onClick={() => setReassignWorker(null)}>Cancel</button>
              <button
                style={{ ...goldBtn, flex: 1, opacity: saving ? 0.5 : 1 }}
                disabled={saving}
                onClick={handleReassign}
              >
                {saving ? 'Saving...' : 'Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Suspense wrapper (required for useSearchParams) ── */
export default function Page() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100dvh', background: '#07101C', color: '#8BAAC8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #1E3A5F', borderTopColor: '#D4A017', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, margin: 0 }}>Loading Resource Planning...</p>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        </div>
      }
    >
      <ResourcePlanningInner />
    </Suspense>
  );
}
