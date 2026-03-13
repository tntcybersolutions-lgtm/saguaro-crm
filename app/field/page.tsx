'use client';
/**
 * Saguaro Field — Home Screen
 * Project stats, weather with work conditions, quick actions, recent activity.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const GOLD   = '#D4A017';
const RAISED = '#0f1d2b';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const BLUE   = '#3B82F6';
const AMBER  = '#F59E0B';

interface Project { id: string; name: string; status?: string; }
interface Weather { temp: number; description: string; icon: string; windspeed: number; condition: 'good' | 'caution' | 'stop'; }
interface DailyLog { id: string; log_date?: string; date?: string; crew_count?: number; work_performed?: string; }
interface RFI { id: string; subject: string; status: string; }

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
  good:    { label: 'Good Conditions',    color: GREEN,  bg: 'rgba(34,197,94,.1)',    border: 'rgba(34,197,94,.25)' },
  caution: { label: 'Work With Caution',  color: AMBER,  bg: 'rgba(245,158,11,.1)',   border: 'rgba(245,158,11,.25)' },
  stop:    { label: 'Consider Stopping',  color: RED,    bg: 'rgba(239,68,68,.1)',     border: 'rgba(239,68,68,.25)' },
};

const QUICK_ACTIONS: { label: string; href: string; bg: string; border: string; color: string; icon: React.ReactNode }[] = [
  { label: 'Daily Log',   href: '/field/log',     bg: 'rgba(212,160,23,.12)',  border: 'rgba(212,160,23,.25)',  color: GOLD,      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1={16} y1={13} x2={8} y2={13}/><line x1={16} y1={17} x2={8} y2={17}/></svg> },
  { label: 'Take Photo',  href: '/field/photos',  bg: 'rgba(59,130,246,.12)',  border: 'rgba(59,130,246,.25)',  color: BLUE,      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx={12} cy={13} r={4}/></svg> },
  { label: 'Inspection',  href: '/field/inspect', bg: 'rgba(34,197,94,.12)',   border: 'rgba(34,197,94,.25)',   color: GREEN,     icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
  { label: 'File RFI',    href: '/field/more',    bg: 'rgba(139,92,246,.12)',  border: 'rgba(139,92,246,.25)',  color: '#8B5CF6', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}><circle cx={12} cy={12} r={10}/><line x1={12} y1={8} x2={12} y2={12}/><line x1={12} y1={16} x2={12.01} y2={16}/></svg> },
  { label: 'Timesheet',   href: '/field/more',    bg: 'rgba(245,158,11,.12)',  border: 'rgba(245,158,11,.25)',  color: AMBER,     icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}><circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/></svg> },
  { label: 'Safety',      href: '/field/more',    bg: 'rgba(239,68,68,.12)',   border: 'rgba(239,68,68,.25)',   color: RED,       icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
];

function todayStr() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
function daysAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff}d ago`;
}

export default function FieldHome() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [userName, setUserName] = useState('');
  const [lastLog, setLastLog] = useState<DailyLog | null>(null);
  const [openRFIs, setOpenRFIs] = useState<RFI[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

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

  // Load project-level data when active project changes
  useEffect(() => {
    if (!active) return;
    // Last log
    fetch(`/api/projects/${active.id}/daily-logs?limit=1`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { const l = d?.logs?.[0]; if (l) setLastLog(l); })
      .catch(() => {});
    // Open RFIs
    fetch(`/api/rfis?projectId=${active.id}&status=open&limit=3`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { const list = d?.rfis || d?.data || []; setOpenRFIs(list.slice(0, 3)); })
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

  const switchProject = (id: string) => {
    const p = projects.find((x) => x.id === id);
    if (p) { setActive(p); localStorage.setItem('field_active_project', id); setLastLog(null); setOpenRFIs([]); }
  };

  const cond = weather ? COND_CONFIG[weather.condition] : null;

  return (
    <div style={{ padding: '0 0 8px' }}>
      {/* Branded hero banner */}
      <div style={{
        background: 'linear-gradient(160deg, #0d1e30 0%, #09111A 60%, #0f1d2b 100%)',
        borderBottom: '1px solid rgba(212,160,23,.18)',
        padding: '18px 16px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        marginBottom: 16,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192x192.png"
          alt="Saguaro"
          width={52}
          height={52}
          style={{ borderRadius: 14, border: '1.5px solid rgba(212,160,23,.35)', boxShadow: '0 4px 20px rgba(212,160,23,.15)' }}
        />
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 1px', fontSize: 11, color: 'rgba(212,160,23,.7)', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Saguaro Field</p>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: TEXT, lineHeight: 1.2 }}>
            {greeting()}{userName ? `, ${userName}` : ''}
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: DIM }}>{todayStr()}</p>
        </div>
      </div>
      <div style={{ padding: '0 16px' }}>

      {/* Weather */}
      {weather && (
        <div style={{ background: cond?.bg, border: `1px solid ${cond?.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: cond?.color }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: cond?.color, textTransform: 'uppercase', letterSpacing: 0.6 }}>{cond?.label}</span>
            </div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT }}>
              {weather.icon} {weather.description}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: DIM }}>Wind: {weather.windspeed} mph</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 38, fontWeight: 900, color: cond?.color, lineHeight: 1 }}>{weather.temp}°</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: DIM }}>Fahrenheit</p>
          </div>
        </div>
      )}

      {/* Project selector */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
        <p style={{ margin: '0 0 6px', fontSize: 11, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Active Project</p>
        {loadingProjects ? (
          <div style={{ height: 22, background: '#1e3148', borderRadius: 4, width: '70%' }} />
        ) : projects.length === 0 ? (
          <p style={{ margin: 0, color: DIM, fontSize: 15 }}>No projects found</p>
        ) : (
          <select
            value={active?.id || ''}
            onChange={(e) => switchProject(e.target.value)}
            style={{ width: '100%', background: 'transparent', border: 'none', color: TEXT, fontSize: 18, fontWeight: 800, outline: 'none', cursor: 'pointer', padding: 0, appearance: 'none', WebkitAppearance: 'none' }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id} style={{ background: '#0f1d2b' }}>{p.name}</option>
            ))}
          </select>
        )}

        {/* Project stats strip */}
        {active && (
          <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
            <Stat label="Last Log" value={lastLog ? daysAgo(lastLog.log_date || lastLog.date || '') : '—'} />
            <Stat label="Crew" value={lastLog?.crew_count ? String(lastLog.crew_count) : '—'} />
            <Stat label="Open RFIs" value={openRFIs.length > 0 ? String(openRFIs.length) : '0'} color={openRFIs.length > 0 ? AMBER : DIM} />
            <a href={`/app/projects/${active.id}/overview`} style={{ marginLeft: 'auto', color: GOLD, fontSize: 12, fontWeight: 600, textDecoration: 'none', alignSelf: 'flex-end', flexShrink: 0 }}>
              Desktop →
            </a>
          </div>
        )}
      </div>

      {/* Quick Actions 2×3 grid */}
      <p style={{ margin: '0 0 10px', fontSize: 11, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Quick Actions</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.label}
            href={active ? `${a.href}?projectId=${active.id}` : a.href}
            style={{ background: a.bg, border: `1px solid ${a.border}`, borderRadius: 14, padding: '16px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none' }}
          >
            <span style={{ color: a.color, display: 'flex' }}>{a.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: a.color, textAlign: 'center', letterSpacing: 0.2 }}>{a.label}</span>
          </Link>
        ))}
      </div>

      {/* Open RFIs alert */}
      {openRFIs.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: 0.7 }}>
            Open RFIs — Needs Response
          </p>
          {openRFIs.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderTop: '1px solid rgba(245,158,11,.1)' }}>
              <span style={{ color: '#8B5CF6', display: 'flex', flexShrink: 0 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><circle cx={12} cy={12} r={10}/><line x1={12} y1={8} x2={12} y2={12}/><line x1={12} y1={16} x2={12.01} y2={16}/></svg></span>
              <span style={{ fontSize: 13, color: TEXT, flex: 1 }}>{r.subject}</span>
            </div>
          ))}
        </div>
      )}
      </div>{/* /padding wrapper */}
    </div>
  );
}

function Stat({ label, value, color = DIM }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 11, color: DIM }}>{label}</p>
      <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color }}>{value}</p>
    </div>
  );
}
