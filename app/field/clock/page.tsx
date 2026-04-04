'use client';
/**
 * Saguaro Field — Clock In / Clock Out
 * GPS-stamped time tracking with Foreman Crew Clock view.
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import {
  getCurrentPosition,
  hapticSuccess,
  hapticError,
  hapticMedium,
  hapticLight,
  showToast,
} from '@/lib/native';

const GOLD   = '#C8960F';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';

const COST_CODES = ['General Conditions', 'Concrete', 'Masonry', 'Metals / Structural', 'Carpentry', 'Thermal & Moisture', 'Openings', 'Finishes', 'Electrical', 'Plumbing', 'HVAC / Mechanical', 'Earthwork / Site', 'Other'];

interface ClockState {
  clockedIn: boolean;
  clockInTime: string | null;
  employeeName: string;
  projectId: string;
  projectName: string;
  latitude: number | null;
  longitude: number | null;
  costCode: string;
}

interface CrewMember {
  id: string;
  name: string;
  status: 'clocked_in' | 'clocked_out' | 'on_break';
  clock_in_time?: string;
  total_hours?: number;
  cost_code?: string;
}

const CLOCK_KEY = 'saguaro_clock_state';

function getStoredClock(): ClockState {
  try {
    const s = localStorage.getItem(CLOCK_KEY);
    return s ? JSON.parse(s) : { clockedIn: false, clockInTime: null, employeeName: '', projectId: '', projectName: '', latitude: null, longitude: null, costCode: 'General Conditions' };
  } catch { return { clockedIn: false, clockInTime: null, employeeName: '', projectId: '', projectName: '', latitude: null, longitude: null, costCode: 'General Conditions' }; }
}
function saveClock(state: ClockState) {
  try { localStorage.setItem(CLOCK_KEY, JSON.stringify(state)); } catch { /* ok */ }
}
function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function ClockPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [clock, setClock] = useState<ClockState>(getStoredClock);
  const [elapsed, setElapsed] = useState(0);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(true);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'getting' | 'ok' | 'denied'>('idle');
  const [breakMinutes, setBreakMinutes] = useState('0');
  const [todayEntries, setTodayEntries] = useState<Array<{ name: string; hours: number; time: string }>>([]);

  // Crew view state
  const [viewMode, setViewMode] = useState<'my' | 'crew'>('my');
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [crewLoading, setCrewLoading] = useState(false);
  const [crewClockName, setCrewClockName] = useState('');
  const [crewClockCostCode, setCrewClockCostCode] = useState('General Conditions');
  const [crewAction, setCrewAction] = useState<'clock_in' | null>(null);
  const [crewSaving, setCrewSaving] = useState(false);
  const [crewMsg, setCrewMsg] = useState('');
  const [userRole, setUserRole] = useState('');

  useEffect(() => {
    setOnline(navigator.onLine);
    window.addEventListener('online', () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
  }, []);

  // Elapsed timer
  useEffect(() => {
    if (!clock.clockedIn || !clock.clockInTime) return;
    const update = () => setElapsed(Date.now() - new Date(clock.clockInTime!).getTime());
    update();
    const id = setInterval(update, 15000);
    return () => clearInterval(id);
  }, [clock.clockedIn, clock.clockInTime]);

  // Load projects
  useEffect(() => {
    fetch('/api/projects/list').then((r) => r.ok ? r.json() : null).then((d) => setProjects(d?.projects || [])).catch(() => {});
  }, []);

  // Pre-fill project from URL
  useEffect(() => {
    if (projectId && projects.length > 0 && !clock.clockedIn) {
      const p = projects.find((x) => x.id === projectId);
      if (p) updateClock({ projectId: p.id, projectName: p.name });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, projects]);

  // Load user role
  useEffect(() => {
    try {
      const role = localStorage.getItem('saguaro_user_role') || '';
      setUserRole(role);
    } catch { /* ok */ }
  }, []);

  // Load crew data when switching to crew view
  useEffect(() => {
    if (viewMode !== 'crew') return;
    const pid = clock.projectId || projectId;
    if (!pid) return;
    setCrewLoading(true);
    const today = new Date().toISOString().split('T')[0];
    fetch(`/api/projects/${pid}/timesheets?date=${today}`)
      .then((r) => r.ok ? r.json() : { members: [] })
      .then((d) => setCrewMembers(d.members || d.crew || d.timesheets || []))
      .catch(() => {})
      .finally(() => setCrewLoading(false));
  }, [viewMode, clock.projectId, projectId]);

  // Get GPS — uses Capacitor on native, Web Geolocation API on web
  const getGPS = useCallback(async () => {
    setGpsStatus('getting');
    const pos = await getCurrentPosition(8000);
    if (pos) {
      setLocation({ lat: pos.lat, lng: pos.lng });
      setGpsStatus('ok');
    } else {
      setGpsStatus('denied');
    }
  }, []);

  const updateClock = (patch: Partial<ClockState>) => {
    setClock((prev) => { const next = { ...prev, ...patch }; saveClock(next); return next; });
  };

  const handleClockIn = async () => {
    if (!clock.employeeName.trim()) { alert('Enter your name first.'); return; }
    setSaving(true);
    hapticMedium().catch(() => {});
    getGPS();

    const clockInTime = new Date().toISOString();
    const payload = {
      employeeName: clock.employeeName,
      projectId: clock.projectId,
      latitude: location?.lat || null,
      longitude: location?.lng || null,
    };

    updateClock({ clockedIn: true, clockInTime, latitude: location?.lat || null, longitude: location?.lng || null });

    try {
      if (!online) throw new Error('offline');
      await fetch('/api/clock/in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      hapticSuccess().catch(() => {});
      showToast('Clocked in').catch(() => {});
    } catch {
      await enqueue({ url: '/api/clock/in', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      hapticLight().catch(() => {});
      showToast('Queued — will sync when online').catch(() => {});
    }
    setSaving(false);
  };

  const handleClockOut = async () => {
    setSaving(true);
    hapticMedium().catch(() => {});
    const clockOutTime = new Date().toISOString();
    const breakMins = parseInt(breakMinutes) || 0;
    const rawMs = Date.now() - new Date(clock.clockInTime!).getTime();
    const adjMs = rawMs - (breakMins * 60000);
    const hoursWorked = Math.max(0, Math.round((adjMs / 3600000) * 100) / 100);

    const payload = {
      employeeName: clock.employeeName,
      projectId: clock.projectId,
      clockInTime: clock.clockInTime,
      clockOutTime,
      breakMinutes: breakMins,
      costCode: clock.costCode,
      latitude: location?.lat || null,
      longitude: location?.lng || null,
    };

    // Add to today's log
    setTodayEntries((prev) => [...prev, {
      name: clock.employeeName,
      hours: hoursWorked,
      time: `${formatTime(clock.clockInTime!)} – ${formatTime(clockOutTime)}`,
    }]);

    updateClock({ clockedIn: false, clockInTime: null });

    try {
      if (!online) throw new Error('offline');
      await fetch('/api/clock/out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      hapticSuccess().catch(() => {});
      showToast(`${formatDuration(Date.now() - new Date(clock.clockInTime!).getTime())} logged`).catch(() => {});
    } catch {
      await enqueue({ url: '/api/clock/out', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      hapticLight().catch(() => {});
      showToast('Queued — will sync when online').catch(() => {});
    }
    setSaving(false);
  };

  // ─── Crew Functions ──────────────────────────────────────────

  const handleCrewClockIn = async () => {
    if (!crewClockName.trim()) { alert('Enter crew member name.'); return; }
    setCrewSaving(true);
    const pid = clock.projectId || projectId;
    const payload = {
      employeeName: crewClockName.trim(),
      projectId: pid,
      costCode: crewClockCostCode,
      latitude: location?.lat || null,
      longitude: location?.lng || null,
    };

    // Optimistic update
    const newMember: CrewMember = {
      id: `temp-${Date.now()}`,
      name: crewClockName.trim(),
      status: 'clocked_in',
      clock_in_time: new Date().toISOString(),
      total_hours: 0,
      cost_code: crewClockCostCode,
    };
    setCrewMembers((prev) => [...prev, newMember]);

    try {
      if (!online) throw new Error('offline');
      await fetch('/api/clock/in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setCrewMsg(`${crewClockName.trim()} clocked in`);
      hapticSuccess().catch(() => {});
    } catch {
      await enqueue({ url: '/api/clock/in', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      setCrewMsg(`${crewClockName.trim()} clock-in queued`);
      hapticLight().catch(() => {});
    }

    setCrewClockName('');
    setCrewAction(null);
    setCrewSaving(false);
    setTimeout(() => setCrewMsg(''), 3500);
  };

  const handleCrewClockOut = async (member: CrewMember) => {
    setCrewSaving(true);
    const pid = clock.projectId || projectId;
    const payload = {
      employeeName: member.name,
      projectId: pid,
      clockInTime: member.clock_in_time,
      clockOutTime: new Date().toISOString(),
      costCode: member.cost_code || 'General Conditions',
    };

    // Optimistic update
    setCrewMembers((prev) => prev.map((m) =>
      m.id === member.id ? { ...m, status: 'clocked_out' as const } : m
    ));

    try {
      if (!online) throw new Error('offline');
      await fetch('/api/clock/out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setCrewMsg(`${member.name} clocked out`);
      hapticSuccess().catch(() => {});
    } catch {
      await enqueue({ url: '/api/clock/out', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      setCrewMsg(`${member.name} clock-out queued`);
      hapticLight().catch(() => {});
    }

    setCrewSaving(false);
    setTimeout(() => setCrewMsg(''), 3500);
  };

  const isForeman = userRole.toLowerCase() === 'foreman' || userRole.toLowerCase() === 'superintendent' || userRole.toLowerCase() === 'admin';

  // Crew summary
  const clockedInCount = crewMembers.filter((m) => m.status === 'clocked_in').length;
  const onBreakCount = crewMembers.filter((m) => m.status === 'on_break').length;
  const totalCrewHours = crewMembers.reduce((s, m) => s + (m.total_hours || 0), 0);

  return (
    <div style={{ padding: '18px 16px' }}>
      <button onClick={() => router.back()} style={backBtn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg></button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Clock In / Out</h1>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: DIM }}>GPS-stamped time tracking</p>

      {/* View toggle: My Clock / Crew */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: '#060C15', borderRadius: 10, padding: 4 }}>
        <button
          onClick={() => setViewMode('my')}
          style={{
            flex: 1, background: viewMode === 'my' ? RAISED : 'transparent',
            border: `1px solid ${viewMode === 'my' ? BORDER : 'transparent'}`,
            borderRadius: 8, padding: '10px 4px', color: viewMode === 'my' ? TEXT : DIM,
            fontSize: 13, fontWeight: viewMode === 'my' ? 700 : 500, cursor: 'pointer',
          }}
        >
          My Clock
        </button>
        <button
          onClick={() => setViewMode('crew')}
          style={{
            flex: 1, background: viewMode === 'crew' ? RAISED : 'transparent',
            border: `1px solid ${viewMode === 'crew' ? BORDER : 'transparent'}`,
            borderRadius: 8, padding: '10px 4px', color: viewMode === 'crew' ? TEXT : DIM,
            fontSize: 13, fontWeight: viewMode === 'crew' ? 700 : 500, cursor: 'pointer',
          }}
        >
          Crew
        </button>
      </div>

      {!online && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: RED, fontWeight: 600 }}>Offline — time will sync when reconnected</div>}

      {/* ═══ MY CLOCK VIEW ═══ */}
      {viewMode === 'my' && (
        <>
          {/* Main clock card */}
          <div style={{ background: RAISED, border: `2px solid ${clock.clockedIn ? 'rgba(34,197,94,.4)' : BORDER}`, borderRadius: 18, padding: '24px 20px', marginBottom: 16, textAlign: 'center' }}>
            {clock.clockedIn ? (
              <>
                {/* Clocked in state */}
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: GREEN, margin: '0 auto 12px', boxShadow: `0 0 12px ${GREEN}`, animation: 'pulse 2s infinite' }} />
                <p style={{ margin: '0 0 4px', fontSize: 13, color: GREEN, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Clocked In</p>
                <p style={{ margin: '0 0 4px', fontSize: 44, fontWeight: 900, color: TEXT, letterSpacing: -1 }}>{formatDuration(elapsed)}</p>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM }}>Since {formatTime(clock.clockInTime!)}</p>
                <p style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: TEXT }}>{clock.employeeName} · {clock.projectName || 'No project'}</p>

                {/* Break minutes */}
                <div style={{ background: '#060C15', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                  <span style={{ fontSize: 13, color: DIM }}>Break time:</span>
                  <input type="number" inputMode="numeric" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} min="0" style={{ width: 60, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 8px', color: TEXT, fontSize: 14, textAlign: 'center', outline: 'none' }} />
                  <span style={{ fontSize: 13, color: DIM }}>min</span>
                </div>

                <button
                  onClick={handleClockOut}
                  disabled={saving}
                  style={{ width: '100%', background: saving ? '#1E3A5F' : RED, border: 'none', borderRadius: 14, padding: '18px', color: '#fff', fontSize: 18, fontWeight: 900, cursor: saving ? 'wait' : 'pointer', letterSpacing: 0.5 }}
                >
                  {saving ? 'Processing...' : 'Clock Out'}
                </button>
              </>
            ) : (
              <>
                {/* Ready to clock in */}
                <div style={{ marginBottom: 8, color: GOLD, display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={56} height={56}><circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/></svg></div>
                <p style={{ margin: '0 0 20px', fontSize: 16, color: DIM }}>Ready to clock in</p>

                <div style={{ textAlign: 'left', marginBottom: 16 }}>
                  <label style={lbl}>Your Name</label>
                  <input value={clock.employeeName} onChange={(e) => updateClock({ employeeName: e.target.value })} placeholder="Full name" style={{ ...inp, marginTop: 5, marginBottom: 12 }} />

                  <label style={lbl}>Project</label>
                  <select value={clock.projectId} onChange={(e) => { const p = projects.find((x) => x.id === e.target.value); updateClock({ projectId: e.target.value, projectName: p?.name || '' }); }} style={{ ...inp, marginTop: 5, marginBottom: 12 }}>
                    <option value="" style={{ background: '#0D1D2E' }}>Select project...</option>
                    {projects.map((p) => <option key={p.id} value={p.id} style={{ background: '#0D1D2E' }}>{p.name}</option>)}
                  </select>

                  <label style={lbl}>Cost Code</label>
                  <select value={clock.costCode} onChange={(e) => updateClock({ costCode: e.target.value })} style={{ ...inp, marginTop: 5 }}>
                    {COST_CODES.map((c) => <option key={c} value={c} style={{ background: '#0D1D2E' }}>{c}</option>)}
                  </select>
                </div>

                {/* GPS indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, justifyContent: 'center' }}>
                  <span style={{ fontSize: 11, color: gpsStatus === 'ok' ? GREEN : gpsStatus === 'denied' ? RED : DIM }}>
                    {gpsStatus === 'ok' ? 'GPS captured' : gpsStatus === 'getting' ? 'Getting location...' : gpsStatus === 'denied' ? 'Location denied' : 'GPS will capture on clock-in'}
                  </span>
                </div>

                <button
                  onClick={handleClockIn}
                  disabled={saving}
                  style={{ width: '100%', background: saving ? '#1E3A5F' : GREEN, border: 'none', borderRadius: 14, padding: '18px', color: '#000', fontSize: 18, fontWeight: 900, cursor: saving ? 'wait' : 'pointer', letterSpacing: 0.5 }}
                >
                  {saving ? 'Clocking In...' : 'Clock In'}
                </button>
              </>
            )}
          </div>

          {/* Today's entries */}
          {todayEntries.length > 0 && (
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px' }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Today's Entries</p>
              {todayEntries.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT }}>{e.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: DIM }}>{e.time}</p>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: GOLD }}>{e.hours}h</span>
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: DIM, fontWeight: 600 }}>Total Today</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: GOLD }}>{todayEntries.reduce((s, e) => s + e.hours, 0).toFixed(2)}h</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ CREW VIEW ═══ */}
      {viewMode === 'crew' && (
        <>
          {crewMsg && (
            <div style={{
              background: crewMsg.includes('queued') ? 'rgba(245,158,11,.1)' : 'rgba(34,197,94,.1)',
              border: `1px solid ${crewMsg.includes('queued') ? 'rgba(245,158,11,.3)' : 'rgba(34,197,94,.3)'}`,
              borderRadius: 10, padding: '12px 14px', marginBottom: 14,
              color: crewMsg.includes('queued') ? AMBER : GREEN, fontSize: 14, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg>
              {crewMsg}
            </div>
          )}

          {/* Summary Bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 20, padding: '4px 12px', fontSize: 12, color: GREEN, fontWeight: 700 }}>
              {clockedInCount} Clocked In
            </div>
            <div style={{ background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.25)', borderRadius: 20, padding: '4px 12px', fontSize: 12, color: GOLD, fontWeight: 700 }}>
              {totalCrewHours.toFixed(1)}h Total
            </div>
            {onBreakCount > 0 && (
              <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 20, padding: '4px 12px', fontSize: 12, color: AMBER, fontWeight: 700 }}>
                {onBreakCount} On Break
              </div>
            )}
          </div>

          {/* Foreman: Clock in crew member */}
          {isForeman && (
            <div style={{ marginBottom: 14 }}>
              {crewAction === null ? (
                <button
                  onClick={() => { setCrewAction('clock_in'); getGPS(); }}
                  style={{
                    width: '100%', background: 'rgba(34,197,94,.1)', border: `1px solid rgba(34,197,94,.3)`,
                    borderRadius: 14, padding: '14px', color: GREEN, fontSize: 15, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
                    <line x1={12} y1={5} x2={12} y2={19}/><line x1={5} y1={12} x2={19} y2={12}/>
                  </svg>
                  Clock In Crew Member
                </button>
              ) : (
                <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px' }}>
                  <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Clock In Crew Member</p>
                  <div style={{ marginBottom: 10 }}>
                    <label style={lbl}>Name</label>
                    <input value={crewClockName} onChange={(e) => setCrewClockName(e.target.value)} placeholder="Full name" style={{ ...inp, marginTop: 4 }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Cost Code</label>
                    <select value={crewClockCostCode} onChange={(e) => setCrewClockCostCode(e.target.value)} style={{ ...inp, marginTop: 4 }}>
                      {COST_CODES.map((c) => <option key={c} value={c} style={{ background: '#0D1D2E' }}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setCrewAction(null)} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px', color: DIM, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button onClick={handleCrewClockIn} disabled={crewSaving} style={{ flex: 2, background: crewSaving ? '#1E3A5F' : GREEN, border: 'none', borderRadius: 10, padding: '12px', color: '#000', fontSize: 14, fontWeight: 800, cursor: crewSaving ? 'wait' : 'pointer' }}>
                      {crewSaving ? 'Saving...' : 'Clock In'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Crew List */}
          {crewLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading crew data...</div>
          ) : crewMembers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
              <div style={{ marginBottom: 8, color: GOLD, display: 'flex', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx={9} cy={7} r={4}/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <p style={{ margin: 0, fontSize: 14 }}>No crew members on the clock today.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {crewMembers.map((member) => {
                const statusLabel = member.status === 'clocked_in' ? 'Clocked In' : member.status === 'on_break' ? 'On Break' : 'Clocked Out';
                const statusClr = member.status === 'clocked_in' ? GREEN : member.status === 'on_break' ? AMBER : DIM;
                const memberHours = member.total_hours ?? (member.clock_in_time && member.status === 'clocked_in'
                  ? Math.round(((Date.now() - new Date(member.clock_in_time).getTime()) / 3600000) * 100) / 100
                  : 0);
                return (
                  <div key={member.id} style={{ background: RAISED, border: `1px solid ${member.status === 'clocked_in' ? 'rgba(34,197,94,.25)' : BORDER}`, borderRadius: 14, padding: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          {/* Status dot */}
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusClr, flexShrink: 0, boxShadow: member.status === 'clocked_in' ? `0 0 6px ${GREEN}` : 'none' }} />
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT }}>{member.name}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 18 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: statusClr }}>{statusLabel}</span>
                          {member.clock_in_time && <span style={{ fontSize: 12, color: DIM }}>In: {formatTime(member.clock_in_time)}</span>}
                          {member.cost_code && <span style={{ fontSize: 11, color: DIM }}>{member.cost_code}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: GOLD }}>{memberHours.toFixed(1)}h</div>
                        {isForeman && member.status === 'clocked_in' && (
                          <button
                            onClick={() => handleCrewClockOut(member)}
                            disabled={crewSaving}
                            style={{
                              marginTop: 4, background: 'rgba(239,68,68,.15)', border: `1px solid rgba(239,68,68,.3)`,
                              borderRadius: 6, padding: '4px 10px', color: RED, fontSize: 11, fontWeight: 700,
                              cursor: crewSaving ? 'wait' : 'pointer',
                            }}
                          >
                            Clock Out
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
}

export default function FieldClockPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}><ClockPage /></Suspense>;
}

const lbl: React.CSSProperties = { fontSize: 12, color: DIM, fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '11px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: '8px', marginLeft: -8, display: 'flex', alignItems: 'center', marginBottom: 4 };
