'use client';
/**
 * Saguaro Field — Home Screen
 * Active project header, weather, quick actions, Sage slide-up drawer.
 */
import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const BLUE   = '#3B82F6';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';

interface Project { id: string; name: string; status?: string; }
interface Weather { temp: number; description: string; icon: string; windspeed: number; condition: 'good' | 'caution' | 'stop'; }
interface DailyLog { id: string; log_date?: string; date?: string; crew_count?: number; work_performed?: string; }
interface RFI { id: string; subject: string; status: string; }
interface SageMessage { role: 'user' | 'sage'; content: string; id: string; }

const WMO: Record<number, { desc: string; icon: string; condition: 'good' | 'caution' | 'stop' }> = {
  0:  { desc: 'Clear',         icon: '☀️',  condition: 'good' },
  1:  { desc: 'Mainly clear',  icon: '🌤️',  condition: 'good' },
  2:  { desc: 'Partly cloudy', icon: '⛅',  condition: 'good' },
  3:  { desc: 'Overcast',      icon: '☁️',  condition: 'good' },
  45: { desc: 'Foggy',         icon: '🌫️', condition: 'caution' },
  48: { desc: 'Icy fog',       icon: '🌫️', condition: 'stop' },
  51: { desc: 'Light drizzle', icon: '🌦️', condition: 'caution' },
  53: { desc: 'Drizzle',       icon: '🌦️', condition: 'caution' },
  61: { desc: 'Light rain',    icon: '🌧️', condition: 'caution' },
  63: { desc: 'Rain',          icon: '🌧️', condition: 'stop' },
  65: { desc: 'Heavy rain',    icon: '🌧️', condition: 'stop' },
  71: { desc: 'Light snow',    icon: '🌨️', condition: 'caution' },
  73: { desc: 'Snow',          icon: '❄️',  condition: 'stop' },
  75: { desc: 'Heavy snow',    icon: '❄️',  condition: 'stop' },
  80: { desc: 'Showers',       icon: '🌦️', condition: 'caution' },
  95: { desc: 'Thunderstorm',  icon: '⛈️',  condition: 'stop' },
};

const COND_CONFIG = {
  good:    { label: 'Good Conditions',   color: GREEN, bg: 'rgba(34,197,94,.1)',   border: 'rgba(34,197,94,.25)' },
  caution: { label: 'Work with Caution', color: AMBER, bg: 'rgba(245,158,11,.1)',  border: 'rgba(245,158,11,.25)' },
  stop:    { label: 'Consider Stopping', color: RED,   bg: 'rgba(239,68,68,.1)',   border: 'rgba(239,68,68,.25)' },
};

const QUICK_ACTIONS = [
  { label: 'Daily Log',  href: '/field/log',     bg: 'rgba(212,160,23,.15)',  border: 'rgba(212,160,23,.3)',  color: GOLD,   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1={16} y1={13} x2={8} y2={13}/><line x1={16} y1={17} x2={8} y2={17}/></svg> },
  { label: 'Photos',     href: '/field/photos',  bg: 'rgba(59,130,246,.15)',  border: 'rgba(59,130,246,.3)',  color: BLUE,   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx={12} cy={13} r={4}/></svg> },
  { label: 'Punch List', href: '/field/punch',   bg: 'rgba(139,92,246,.15)', border: 'rgba(139,92,246,.3)', color: PURPLE, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
  { label: 'File RFI',   href: '/field/more',    bg: 'rgba(249,115,22,.15)',  border: 'rgba(249,115,22,.3)',  color: '#F97316', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}><circle cx={12} cy={12} r={10}/><line x1={12} y1={8} x2={12} y2={12}/><line x1={12} y1={16} x2={12.01} y2={16}/></svg> },
  { label: 'Clock In',   href: '/field/more',    bg: 'rgba(34,197,94,.15)',   border: 'rgba(34,197,94,.3)',   color: GREEN,  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}><circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/></svg> },
  { label: 'Safety',     href: '/field/more',    bg: 'rgba(239,68,68,.15)',   border: 'rgba(239,68,68,.3)',   color: RED,    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
];

const SAGE_PROMPTS = [
  "What's my punch list status?",
  'Draft a daily log for today',
  'What RFIs are open?',
  'Any deliveries scheduled today?',
];

function todayStr() {
  return new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function daysAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff}d ago`;
}

export default function FieldHome() {
  const [projects, setProjects]         = useState<Project[]>([]);
  const [active, setActive]             = useState<Project | null>(null);
  const [weather, setWeather]           = useState<Weather | null>(null);
  const [userName, setUserName]         = useState('');
  const [lastLog, setLastLog]           = useState<DailyLog | null>(null);
  const [openRFIs, setOpenRFIs]         = useState<RFI[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Sage drawer
  const [sageOpen, setSageOpen]     = useState(false);
  const [sageInput, setSageInput]   = useState('');
  const [sageLoading, setSageLoading] = useState(false);
  const [sageMessages, setSageMessages] = useState<SageMessage[]>([]);
  const sageBottomRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Load user + projects
  useEffect(() => {
    (async () => {
      try {
        const [ur, pr] = await Promise.all([fetch('/api/auth/me'), fetch('/api/projects/list')]);
        if (ur.ok) { const u = await ur.json(); if (u?.name) setUserName(u.name.split(' ')[0]); }
        if (pr.ok) {
          const p = await pr.json();
          const list: Project[] = p.projects || [];
          setProjects(list);
          const saved = localStorage.getItem('field_active_project');
          const found = saved ? list.find((x) => x.id === saved) : null;
          setActive(found || list[0] || null);
        }
      } catch { /* offline */ }
      setLoadingProjects(false);
    })();
  }, []);

  // Load project data when active changes
  useEffect(() => {
    if (!active) return;
    fetch(`/api/projects/${active.id}/daily-logs?limit=1`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { const l = d?.logs?.[0]; if (l) setLastLog(l); })
      .catch(() => {});
    fetch(`/api/rfis?projectId=${active.id}&status=open&limit=3`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setOpenRFIs((d?.rfis || d?.data || []).slice(0, 3)); })
      .catch(() => {});
  }, [active]);

  // Weather
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current_weather=true`);
          if (!r.ok) return;
          const d = await r.json();
          const cw = d.current_weather;
          const wmo = WMO[cw.weathercode] || { desc: 'Unknown', icon: '🌡️', condition: 'good' as const };
          const windCondition: Weather['condition'] = cw.windspeed > 50 ? 'stop' : cw.windspeed > 30 ? 'caution' : wmo.condition;
          setWeather({ temp: Math.round(cw.temperature * 9/5 + 32), description: wmo.desc, icon: wmo.icon, windspeed: Math.round(cw.windspeed * 0.621), condition: windCondition });
        } catch { /* no weather */ }
      },
      () => {},
      { timeout: 5000 }
    );
  }, []);

  // Scroll Sage to bottom on new message
  useEffect(() => {
    if (sageOpen) sageBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sageMessages, sageLoading, sageOpen]);

  // Close drawer when tapping backdrop
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setSageOpen(false);
  };

  const switchProject = (id: string) => {
    const p = projects.find((x) => x.id === id);
    if (p) { setActive(p); localStorage.setItem('field_active_project', id); setLastLog(null); setOpenRFIs([]); }
  };

  const sendSage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sageLoading) return;
    setSageInput('');
    setSageMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: trimmed }]);
    setSageLoading(true);
    try {
      const res = await fetch('/api/chat/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, projectId: active?.id || '', context: 'field' }),
      });
      const data = await res.json();
      const reply = data.reply || data.message || data.content || 'Got it.';
      setSageMessages(prev => [...prev, { id: `s-${Date.now()}`, role: 'sage', content: reply }]);
    } catch {
      setSageMessages(prev => [...prev, { id: `s-err-${Date.now()}`, role: 'sage', content: "Can't connect right now. Check your signal." }]);
    }
    setSageLoading(false);
  };

  const cond = weather ? COND_CONFIG[weather.condition] : null;

  return (
    <div style={{ paddingBottom: 8 }}>
      {/* ── Project header bar ─────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(160deg,#0d1e30 0%,#07101C 70%)', borderBottom: '1px solid rgba(212,160,23,.2)', padding: '14px 16px 12px' }}>
        {/* Top row: date + desktop link */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: DIM, fontWeight: 600, letterSpacing: 0.3 }}>{todayStr()}{userName ? ` · ${userName}` : ''}</span>
          {active && (
            <a href={`/app/projects/${active.id}/overview`} style={{ fontSize: 11, color: GOLD, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><rect x={2} y={3} width={20} height={14} rx={2}/><line x1={8} y1={21} x2={16} y2={21}/><line x1={12} y1={17} x2={12} y2={21}/></svg>
              Desktop
            </a>
          )}
        </div>
        {/* Project name / selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {loadingProjects ? (
            <div style={{ height: 26, background: '#1E3A5F', borderRadius: 4, width: '60%' }} />
          ) : projects.length === 0 ? (
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, color: AMBER, fontWeight: 700 }}>No projects yet</p>
              <a href="/app/projects/new" style={{ fontSize: 12, color: GOLD, fontWeight: 600, textDecoration: 'none' }}>
                + Create your first project →
              </a>
            </div>
          ) : (
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 10, color: 'rgba(212,160,23,.7)', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>Active Project</p>
              <select
                value={active?.id || ''}
                onChange={(e) => switchProject(e.target.value)}
                style={{ width: '100%', background: 'transparent', border: 'none', color: TEXT, fontSize: 19, fontWeight: 900, outline: 'none', cursor: 'pointer', padding: '2px 0 0', appearance: 'none', WebkitAppearance: 'none', letterSpacing: -0.3 }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id} style={{ background: '#0D1D2E' }}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {/* Stats strip */}
        {active && !loadingProjects && (
          <div style={{ display: 'flex', gap: 20, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.07)' }}>
            <Stat label="Last Log" value={lastLog ? daysAgo(lastLog.log_date || lastLog.date || '') : '—'} />
            <Stat label="Crew" value={lastLog?.crew_count ? String(lastLog.crew_count) : '—'} />
            <Stat label="Open RFIs" value={String(openRFIs.length)} color={openRFIs.length > 0 ? AMBER : DIM} />
          </div>
        )}
      </div>

      <div style={{ padding: '14px 16px 0' }}>

        {/* Weather */}
        {weather && cond && (
          <div style={{ background: RAISED, border: `1px solid ${cond.border}`, borderRadius: 14, padding: '13px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: `inset 0 0 0 1px ${cond.border}` }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: cond.color, boxShadow: `0 0 6px ${cond.color}` }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: cond.color, textTransform: 'uppercase', letterSpacing: 0.8 }}>{cond.label}</span>
              </div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT }}>
                {weather.icon} {weather.description}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: DIM }}>Wind: {weather.windspeed} mph</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 42, fontWeight: 900, color: cond.color, lineHeight: 1 }}>{weather.temp}°</p>
              <p style={{ margin: '1px 0 0', fontSize: 10, color: DIM }}>Fahrenheit</p>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <p style={sLbl}>Quick Actions</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.label}
              href={active ? `${a.href}?projectId=${active.id}` : a.href}
              style={{ background: RAISED, border: `1.5px solid ${a.border}`, borderRadius: 14, padding: '16px 10px 13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, textDecoration: 'none', boxShadow: `0 2px 12px rgba(0,0,0,.25)` }}
            >
              <span style={{ color: a.color, display: 'flex', filter: `drop-shadow(0 0 6px ${a.color}40)` }}>{a.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: TEXT, textAlign: 'center', letterSpacing: 0.1 }}>{a.label}</span>
            </Link>
          ))}
        </div>

        {/* Open RFIs alert */}
        {openRFIs.length > 0 && (
          <div style={{ background: RAISED, border: '1px solid rgba(245,158,11,.3)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, color: AMBER, textTransform: 'uppercase', letterSpacing: 0.8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><circle cx={12} cy={12} r={10}/><line x1={12} y1={8} x2={12} y2={12}/><line x1={12} y1={16} x2={12.01} y2={16}/></svg>
              Open RFIs — Needs Response
            </p>
            {openRFIs.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderTop: '1px solid rgba(245,158,11,.1)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: AMBER, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: TEXT }}>{r.subject}</span>
              </div>
            ))}
          </div>
        )}

        {/* Sage CTA button */}
        <button
          onClick={() => setSageOpen(true)}
          style={{ width: '100%', background: RAISED, border: '1.5px solid rgba(212,160,23,.35)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: 14, boxShadow: '0 2px 12px rgba(0,0,0,.25)' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(212,160,23,.15)', border: '1px solid rgba(212,160,23,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD, flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: GOLD }}>Ask Sage AI</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: DIM }}>Project insights, RFIs, schedules, punch list</p>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} style={{ color: DIM, flexShrink: 0 }}><polyline points="18 15 12 9 6 15"/></svg>
        </button>

      </div>

      {/* ── Sage Slide-Up Drawer ─────────────────────────────────── */}
      {sageOpen && (
        <div
          onClick={handleBackdropClick}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', backdropFilter: 'blur(4px)' }}
        >
          <div
            ref={drawerRef}
            style={{ background: '#0a1520', borderRadius: '20px 20px 0 0', border: '1px solid rgba(212,160,23,.2)', borderBottom: 'none', display: 'flex', flexDirection: 'column', maxHeight: '80dvh', minHeight: '50dvh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer handle + header */}
            <div style={{ padding: '10px 16px 0', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, background: '#2a3e57', borderRadius: 2, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid #1E3A5F' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: GOLD, display: 'flex' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: GOLD }}>Sage AI</span>
                  {active && <span style={{ fontSize: 11, color: DIM }}>— {active.name}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {sageMessages.length > 0 && (
                    <button onClick={() => setSageMessages([])} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '4px 10px', color: DIM, fontSize: 11, cursor: 'pointer' }}>Clear</button>
                  )}
                  <a href={`/field/sage${active ? `?projectId=${active.id}` : ''}`} style={{ fontSize: 11, color: DIM, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '4px 10px' }}>Full screen</a>
                  <button onClick={() => setSageOpen(false)} style={{ background: 'none', border: 'none', color: DIM, fontSize: 20, cursor: 'pointer', padding: '4px', lineHeight: 1 }}>×</button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sageMessages.length === 0 && (
                <div style={{ paddingTop: 8 }}>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: DIM }}>Try asking:</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {SAGE_PROMPTS.map(prompt => (
                      <button key={prompt} onClick={() => sendSage(prompt)}
                        style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', color: TEXT, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {sageMessages.map(msg => (
                <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '84%', background: msg.role === 'user' ? GOLD : RAISED, border: msg.role === 'user' ? 'none' : `1px solid ${BORDER}`, borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: '9px 13px', color: msg.role === 'user' ? '#000' : TEXT, fontSize: 14, lineHeight: 1.55, fontWeight: msg.role === 'user' ? 600 : 400, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {sageLoading && (
                <div style={{ display: 'flex' }}>
                  <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: '16px 16px 16px 4px', padding: '10px 14px', display: 'flex', gap: 5, alignItems: 'center' }}>
                    {[0,1,2].map(i => <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: DIM, display: 'inline-block', animation: 'sageB 1.2s infinite', animationDelay: `${i*0.2}s` }} />)}
                    <style>{`@keyframes sageB{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}`}</style>
                  </div>
                </div>
              )}
              <div ref={sageBottomRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '10px 12px', paddingBottom: 'max(12px,env(safe-area-inset-bottom))', borderTop: `1px solid ${BORDER}`, flexShrink: 0, background: '#0a1520' }}>
              <div style={{ display: 'flex', gap: 8, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '6px 6px 6px 14px', alignItems: 'flex-end' }}>
                <input
                  value={sageInput}
                  onChange={e => setSageInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendSage(sageInput); } }}
                  placeholder="Ask about your project…"
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: TEXT, fontSize: 15, padding: '4px 0' }}
                />
                <button
                  onClick={() => sendSage(sageInput)}
                  disabled={!sageInput.trim() || sageLoading}
                  style={{ background: sageInput.trim() && !sageLoading ? GOLD : BORDER, border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sageInput.trim() && !sageLoading ? 'pointer' : 'default', color: sageInput.trim() && !sageLoading ? '#000' : DIM, flexShrink: 0, transition: 'background .15s' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><line x1={12} y1={19} x2={12} y2={5}/><polyline points="5 12 12 5 19 12"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color = DIM }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 10, color: DIM, fontWeight: 600, letterSpacing: 0.3 }}>{label}</p>
      <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 800, color }}>{value}</p>
    </div>
  );
}

const sLbl: React.CSSProperties = { margin: '0 0 10px', fontSize: 11, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 };
