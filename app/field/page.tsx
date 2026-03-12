'use client';
/**
 * Saguaro Field — Home Screen
 * Today's project, weather, and quick-action buttons.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const GOLD   = '#D4A017';
const DARK   = '#09111A';
const RAISED = '#0f1d2b';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const GREEN  = '#22C55E';

interface Project { id: string; name: string; status?: string; }
interface WeatherData { temp: number; description: string; icon: string; }

const WMO_CODES: Record<number, { desc: string; icon: string }> = {
  0:  { desc: 'Clear sky', icon: '☀️' },
  1:  { desc: 'Mainly clear', icon: '🌤️' },
  2:  { desc: 'Partly cloudy', icon: '⛅' },
  3:  { desc: 'Overcast', icon: '☁️' },
  45: { desc: 'Foggy', icon: '🌫️' },
  48: { desc: 'Icy fog', icon: '🌫️' },
  51: { desc: 'Light drizzle', icon: '🌦️' },
  53: { desc: 'Drizzle', icon: '🌦️' },
  61: { desc: 'Light rain', icon: '🌧️' },
  63: { desc: 'Rain', icon: '🌧️' },
  65: { desc: 'Heavy rain', icon: '🌧️' },
  71: { desc: 'Light snow', icon: '🌨️' },
  73: { desc: 'Snow', icon: '❄️' },
  80: { desc: 'Rain showers', icon: '🌦️' },
  95: { desc: 'Thunderstorm', icon: '⛈️' },
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayStr() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

const QUICK_ACTIONS = [
  { label: 'Daily Log',   href: '/field/log',     color: GOLD,  emoji: '📋', desc: 'Log today\'s work' },
  { label: 'Take Photo',  href: '/field/photos',  color: '#3B82F6', emoji: '📸', desc: 'Capture job site' },
  { label: 'Inspection',  href: '/field/inspect', color: GREEN, emoji: '✅', desc: 'Run a checklist' },
];

export default function FieldHomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);

  // Load user + projects
  useEffect(() => {
    (async () => {
      try {
        const [userRes, projRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/projects/list'),
        ]);
        if (userRes.ok) {
          const u = await userRes.json();
          if (u?.name) setUserName(u.name.split(' ')[0]);
        }
        if (projRes.ok) {
          const p = await projRes.json();
          const list: Project[] = p.projects || [];
          setProjects(list);
          // Restore last active project
          const saved = localStorage.getItem('field_active_project');
          const found = saved ? list.find((x) => x.id === saved) : null;
          setActiveProject(found || list[0] || null);
        }
      } catch { /* offline — projects won't load */ }
      setLoading(false);
    })();
  }, []);

  // Load weather via browser geolocation → Open-Meteo (no API key needed)
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current_weather=true`
          );
          if (!res.ok) return;
          const data = await res.json();
          const cw = data.current_weather;
          const wmo = WMO_CODES[cw.weathercode] || { desc: 'Unknown', icon: '🌡️' };
          setWeather({
            temp: Math.round(cw.temperature * 9/5 + 32), // C → F
            description: wmo.desc,
            icon: wmo.icon,
          });
        } catch { /* no weather */ }
      },
      () => { /* denied — no weather */ },
      { timeout: 5000 }
    );
  }, []);

  const switchProject = (id: string) => {
    const p = projects.find((x) => x.id === id);
    if (p) {
      setActiveProject(p);
      localStorage.setItem('field_active_project', id);
    }
  };

  return (
    <div style={{ padding: '20px 16px', paddingBottom: 8 }}>
      {/* Greeting */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: 0, color: DIM, fontSize: 13 }}>{todayStr()}</p>
        <h1 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 800, color: TEXT }}>
          {getGreeting()}{userName ? `, ${userName}` : ''}
        </h1>
      </div>

      {/* Weather card */}
      {weather && (
        <div style={{
          background: RAISED,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: DIM }}>Current Conditions</p>
            <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 700, color: TEXT }}>
              {weather.icon} {weather.description}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 32, fontWeight: 800, color: GOLD }}>{weather.temp}°F</p>
          </div>
        </div>
      )}

      {/* Active project selector */}
      <div style={{
        background: RAISED,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 20,
      }}>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Active Project
        </p>
        {loading ? (
          <div style={{ height: 24, background: '#1e3148', borderRadius: 4, width: '60%' }} />
        ) : projects.length === 0 ? (
          <p style={{ margin: 0, color: DIM, fontSize: 14 }}>No projects found</p>
        ) : (
          <select
            value={activeProject?.id || ''}
            onChange={(e) => switchProject(e.target.value)}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: TEXT,
              fontSize: 18,
              fontWeight: 700,
              outline: 'none',
              cursor: 'pointer',
              padding: 0,
              appearance: 'none',
              WebkitAppearance: 'none',
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id} style={{ background: '#0f1d2b' }}>{p.name}</option>
            ))}
          </select>
        )}
        {activeProject && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <a
              href={`/app/projects/${activeProject.id}/overview`}
              style={{ fontSize: 12, color: GOLD, textDecoration: 'none' }}
            >
              Open in Dashboard →
            </a>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <p style={{ margin: '0 0 12px', fontSize: 12, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        Quick Actions
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={activeProject ? `${a.href}?projectId=${activeProject.id}` : a.href}
            style={{
              background: RAISED,
              border: `1px solid ${BORDER}`,
              borderRadius: 14,
              padding: '18px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              textDecoration: 'none',
              color: TEXT,
              transition: 'border-color 0.15s',
            }}
          >
            <div style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: `rgba(${hexToRgb(a.color)}, 0.12)`,
              border: `1px solid rgba(${hexToRgb(a.color)}, 0.25)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              flexShrink: 0,
            }}>
              {a.emoji}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{a.label}</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: DIM }}>{a.desc}</p>
            </div>
            <div style={{ marginLeft: 'auto', color: DIM, fontSize: 18 }}>›</div>
          </Link>
        ))}
      </div>

      {/* Desktop link */}
      <div style={{
        background: 'rgba(212,160,23,0.06)',
        border: '1px solid rgba(212,160,23,0.15)',
        borderRadius: 10,
        padding: '12px 16px',
        textAlign: 'center',
      }}>
        <p style={{ margin: 0, fontSize: 13, color: DIM }}>
          Need the full dashboard?{' '}
          <a href="/app" style={{ color: GOLD, textDecoration: 'none', fontWeight: 600 }}>
            Open Desktop View →
          </a>
        </p>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}
