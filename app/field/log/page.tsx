'use client';
/**
 * Saguaro Field — Daily Log
 * Fixed API endpoint + field mapping. Touch-optimized sections. Offline-first.
 */
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

const GOLD   = '#D4A017';
const RAISED = '#0f1d2b';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const GREEN  = '#22C55E';
const RED    = '#EF4444';

const WEATHER_OPTS = ['Sunny', 'Partly Cloudy', 'Overcast', 'Windy', 'Light Rain', 'Heavy Rain', 'Storm', 'Snow', 'Fog', 'Extreme Heat'];
const PURPLE = '#8B5CF6';

function DailyLogForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [projectName, setProjectName] = useState('');
  const [online, setOnline] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [listening, setListening] = useState(false);

  // Form state
  const [superintendent, setSuperintendent] = useState('');
  const [weather, setWeather] = useState('Sunny');
  const [tempHigh, setTempHigh] = useState('');
  const [tempLow, setTempLow] = useState('');
  const [crewCount, setCrewCount] = useState('');
  const [workPerformed, setWorkPerformed] = useState('');
  const [equipment, setEquipment] = useState('');
  const [materialsDelivered, setMaterialsDelivered] = useState('');
  const [visitors, setVisitors] = useState('');
  const [delays, setDelays] = useState('');
  const [safetyNotes, setSafetyNotes] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setOnline(navigator.onLine);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!projectId) return;
    // Load project name
    fetch('/api/projects/list')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId); if (p) setProjectName(p.name); })
      .catch(() => {});

    // Pre-fill from last log — fixed: response is d.logs[0]
    fetch(`/api/projects/${projectId}/daily-logs?limit=1`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const last = d?.logs?.[0];
        if (!last) return;
        if (last.crew_count) setCrewCount(String(last.crew_count));
        if (last.weather) setWeather(last.weather);
        // Try to extract superintendent from notes
        const supMatch = (last.notes || '').match(/^Superintendent: ([^\n]+)/);
        if (supMatch) setSuperintendent(supMatch[1]);
      })
      .catch(() => {});
  }, [projectId]);

  // Auto-populate weather via geolocation + wttr.in (no API key needed)
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(`https://wttr.in/${latitude},${longitude}?format=j1`);
          const data = await res.json();
          const current = data.current_condition?.[0];
          const today   = data.weather?.[0];
          if (current) {
            setWeather(current.weatherDesc?.[0]?.value ?? 'Sunny');
            setTempHigh(today?.maxtempF ?? '');
            setTempLow(today?.mintempF  ?? '');
          }
        } catch {
          // Silent fail — user can fill manually
        }
      },
      () => {} // User denied location — no problem
    );
  }, []);

  // Auto-populate superintendent from Supabase session
  useEffect(() => {
    const getUser = async () => {
      const supabase = getSupabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.full_name) {
        setSuperintendent(user.user_metadata.full_name);
      } else if (user?.email) {
        setSuperintendent(user.email.split('@')[0]);
      }
    };
    getUser();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) { setError('No project selected. Go back home and pick a project first.'); return; }
    if (!workPerformed.trim()) { setError('Please describe the work performed today.'); return; }
    setSaving(true);
    // suppress unused var lint
    void aiLoading; void listening;
    setError('');

    // Build notes with superintendent prefix
    const fullNotes = [
      superintendent.trim() ? `Superintendent: ${superintendent.trim()}` : '',
      equipment.trim() ? `Equipment: ${equipment.trim()}` : '',
      notes.trim(),
    ].filter(Boolean).join('\n');

    // FIXED: correct field names matching /api/daily-logs/create
    const payload = {
      projectId,
      logDate: new Date().toISOString().split('T')[0],
      weather,
      temperatureHigh: tempHigh ? parseInt(tempHigh) : null,
      temperatureLow: tempLow ? parseInt(tempLow) : null,
      crewCount: crewCount ? parseInt(crewCount) : 0,
      workPerformed: workPerformed.trim(),
      delays: delays.trim(),
      safetyNotes: safetyNotes.trim(),
      materialsDelivered: materialsDelivered.trim(),
      visitors: visitors.trim(),
      notes: fullNotes,
    };

    try {
      if (!online) throw new Error('offline');
      // FIXED: correct endpoint /api/daily-logs/create
      const res = await fetch('/api/daily-logs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setSaved(true);
      setTimeout(() => router.push('/field'), 1800);
    } catch (err) {
      if (String(err).includes('offline') || !online) {
        try {
          await enqueue({ url: '/api/daily-logs/create', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
          setSaved(true);
          setTimeout(() => router.push('/field'), 1800);
        } catch (q) { setError(String(q) || 'Failed to queue. Please try again.'); }
      } else {
        setError(String(err) || 'Failed to submit.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '65vh', gap: 14, padding: 32, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(34,197,94,.15)', border: '2px solid rgba(34,197,94,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>✅</div>
        <h2 style={{ margin: 0, fontSize: 22, color: GREEN }}>Log Submitted!</h2>
        <p style={{ margin: 0, color: DIM, fontSize: 14 }}>
          {online ? 'Saved to the project dashboard.' : 'Queued offline — will sync when reconnected.'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '18px 16px' }}>
      {/* Header */}
      <button onClick={() => router.back()} style={backBtn}>← Back</button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Daily Log</h1>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: DIM }}>
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        {projectName ? ` · ${projectName}` : ''}
      </p>

      {!online && <OfflineBanner />}

      <form onSubmit={handleSubmit}>
        {/* ── Site Conditions ─────────────────────────── */}
        <Section label="Site Conditions">
          <Row>
            <Field label="Superintendent">
              <input value={superintendent} onChange={(e) => setSuperintendent(e.target.value)} placeholder="Your name" style={inp} />
            </Field>
            <Field label="Crew Count">
              <input type="number" inputMode="numeric" value={crewCount} onChange={(e) => setCrewCount(e.target.value)} placeholder="0" style={inp} />
            </Field>
          </Row>
          <Field label="Weather">
            <select value={weather} onChange={(e) => setWeather(e.target.value)} style={inp}>
              {WEATHER_OPTS.map((o) => <option key={o} value={o} style={{ background: '#0f1d2b' }}>{o}</option>)}
            </select>
          </Field>
          <Row>
            <Field label="High Temp (°F)">
              <input type="number" inputMode="numeric" value={tempHigh} onChange={(e) => setTempHigh(e.target.value)} placeholder="e.g. 92" style={inp} />
            </Field>
            <Field label="Low Temp (°F)">
              <input type="number" inputMode="numeric" value={tempLow} onChange={(e) => setTempLow(e.target.value)} placeholder="e.g. 68" style={inp} />
            </Field>
          </Row>
        </Section>

        {/* ── Work & Equipment ─────────────────────────── */}
        <Section label="Work Performed">
          {/* AI Draft button */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button
              type="button"
              disabled={aiLoading || !online}
              onClick={async () => {
                setAiLoading(true);
                try {
                  const res = await fetch('/api/field/ai-draft', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectName, weather, tempHigh, crewCount, superintendent }),
                  });
                  const d = await res.json();
                  if (d.draft) {
                    if (d.draft.workPerformed) setWorkPerformed(d.draft.workPerformed);
                    if (d.draft.delays) setDelays(d.draft.delays);
                    if (d.draft.safetyNotes) setSafetyNotes(d.draft.safetyNotes);
                    if (d.draft.notes) setNotes(d.draft.notes);
                  }
                } catch { /* ai unavailable */ }
                setAiLoading(false);
              }}
              style={{ flex: 1, background: aiLoading ? '#1e3148' : 'rgba(139,92,246,.15)', border: `1px solid rgba(139,92,246,.3)`, borderRadius: 10, padding: '10px', color: aiLoading ? DIM : PURPLE, fontSize: 13, fontWeight: 700, cursor: aiLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {aiLoading ? '⟳ Drafting...' : '🤖 AI Draft Log'}
            </button>
            {/* Voice-to-text (Web Speech API) */}
            <button
              type="button"
              onClick={() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const w = window as any;
                const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
                if (!SR) { alert('Voice input not supported on this browser.'); return; }
                const recognition = new SR();
                recognition.continuous = false;
                recognition.interimResults = false;
                recognition.lang = 'en-US';
                setListening(true);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                recognition.onresult = (e: any) => {
                  const transcript = e.results[0][0].transcript;
                  setWorkPerformed((prev: string) => prev ? `${prev} ${transcript}` : transcript);
                  setListening(false);
                };
                recognition.onerror = () => setListening(false);
                recognition.onend = () => setListening(false);
                recognition.start();
              }}
              style={{ background: listening ? 'rgba(239,68,68,.2)' : 'rgba(212,160,23,.1)', border: `1px solid ${listening ? 'rgba(239,68,68,.4)' : 'rgba(212,160,23,.25)'}`, borderRadius: 10, padding: '10px 14px', color: listening ? RED : GOLD, fontSize: 18, cursor: 'pointer' }}
              title="Voice to text"
            >
              {listening ? '🔴' : '🎙'}
            </button>
          </div>
          <Field label="Work Performed Today *">
            <textarea value={workPerformed} onChange={(e) => setWorkPerformed(e.target.value)} placeholder="Describe what was accomplished — trades on site, areas worked, progress milestones..." rows={5} style={inp} required />
          </Field>
          <Field label="Equipment On Site">
            <textarea value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="e.g. Boom lift (60'), concrete pump, excavator..." rows={3} style={inp} />
          </Field>
          <Field label="Materials Delivered">
            <textarea value={materialsDelivered} onChange={(e) => setMaterialsDelivered(e.target.value)} placeholder="List any deliveries received..." rows={2} style={inp} />
          </Field>
        </Section>

        {/* ── Delays & Issues ──────────────────────────── */}
        <Section label="Delays & Issues">
          <Field label="Delays / Schedule Impact">
            <textarea value={delays} onChange={(e) => setDelays(e.target.value)} placeholder="Any delays? Weather, material, labor shortages..." rows={2} style={inp} />
          </Field>
          <Field label="Visitors / Inspectors">
            <input value={visitors} onChange={(e) => setVisitors(e.target.value)} placeholder="e.g. Owner rep, building inspector, architect" style={inp} />
          </Field>
        </Section>

        {/* ── Safety ───────────────────────────────────── */}
        <Section label="Safety">
          <Field label="Safety Notes / Incidents">
            <textarea value={safetyNotes} onChange={(e) => setSafetyNotes(e.target.value)} placeholder="Near misses, hazards, toolbox topics, OSHA items..." rows={3} style={inp} />
          </Field>
          <Field label="Additional Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else to document..." rows={2} style={inp} />
          </Field>
        </Section>

        {error && <ErrorBox msg={error} />}

        <button
          type="submit"
          disabled={saving}
          style={{ width: '100%', background: saving ? '#1e3148' : GOLD, border: 'none', borderRadius: 14, padding: '18px', color: saving ? DIM : '#000', fontSize: 17, fontWeight: 800, cursor: saving ? 'wait' : 'pointer', marginTop: 4, letterSpacing: 0.3 }}
        >
          {saving ? 'Submitting...' : online ? '✓ Submit Daily Log' : '💾 Save Offline'}
        </button>
      </form>
    </div>
  );
}

export default function FieldLogPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8fa3c0', textAlign: 'center' }}>Loading...</div>}><DailyLogForm /></Suspense>;
}

// ── Shared UI helpers ─────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#0f1d2b', border: '1px solid #1e3148', borderRadius: 14, padding: '14px 14px 6px', marginBottom: 12 }}>
      <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#8fa3c0', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</p>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#8fa3c0', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>;
}
function OfflineBanner() {
  return <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: RED, fontWeight: 600 }}>Offline — will sync when reconnected</div>;
}
function ErrorBox({ msg }: { msg: string }) {
  return <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '10px 14px', color: RED, fontSize: 14, marginBottom: 12 }}>{msg}</div>;
}

const inp: React.CSSProperties = { width: '100%', background: '#09111A', border: '1px solid #1e3148', borderRadius: 10, padding: '12px 14px', color: '#e8edf8', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8fa3c0', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };
