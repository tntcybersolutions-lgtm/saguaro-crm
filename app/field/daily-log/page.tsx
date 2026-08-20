'use client';
/**
 * Saguaro Field — Daily Log Creation
 * Full-featured daily log entry for construction superintendents.
 * Mobile-first, GPS weather auto-populate, photo capture, crew tracking.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import VoiceToLog from '../../../components/field/VoiceToLog';
import OfflineSyncStatus from '../../../components/field/OfflineSyncStatus';
import { enqueue } from '@/lib/field-db';
import { F } from '@/lib/field-tokens';
import { fieldFetch } from '@/lib/field-fetch';
import ErrorBanner from '@/components/field/ErrorBanner';
import EmptyState from '@/components/field/EmptyState';
import { useAutoSave, getDraft } from '@/hooks/useAutoSave';
import DraftRestoredBanner from '@/components/field/DraftRestoredBanner';


/* ── WMO weather-code map ─────────────────────────────────── */
const WMO: Record<number, string> = {
  0:'Clear',1:'Mainly Clear',2:'Partly Cloudy',3:'Overcast',
  45:'Fog',48:'Icy Fog',51:'Light Drizzle',53:'Drizzle',55:'Dense Drizzle',
  61:'Light Rain',63:'Rain',65:'Heavy Rain',66:'Freezing Rain',67:'Heavy Freezing Rain',
  71:'Light Snow',73:'Snow',75:'Heavy Snow',77:'Snow Grains',
  80:'Light Showers',81:'Showers',82:'Heavy Showers',
  85:'Light Snow Showers',86:'Heavy Snow Showers',
  95:'Thunderstorm',96:'Thunderstorm w/ Hail',99:'Heavy Thunderstorm w/ Hail',
};

const TRADES = [
  'Concrete','Framing','Electrical','Plumbing','HVAC','Roofing',
  'Drywall','Paint','Flooring','Landscape','General Labor','Other',
];
const CONDITIONS = ['Clear','Partly Cloudy','Overcast','Rain','Snow','Fog','Wind'];
const PRECIP     = ['None','Light','Moderate','Heavy'];
const IMPACTS    = ['None','Minor Delay','Major Delay','Work Stopped'];
const EQ_COND    = ['Good','Fair','Poor'];
const SEVERITIES = ['None','Minor','Major','Critical'];
const PERIODS    = ['Morning','Afternoon','Evening'] as const;

interface CrewEntry { trade: string; company: string; headcount: number; hours: number; foreman: string; notes: string; }
interface EquipEntry { name: string; operator: string; hours: number; condition: string; }
interface WeatherPeriod { temp: string; conditions: string; wind: string; precip: string; impact: string; }
interface PhotoEntry { file: File; preview: string; caption: string; }

const blankCrew = (): CrewEntry => ({ trade: 'General Labor', company: '', headcount: 1, hours: 8, foreman: '', notes: '' });
const blankEquip = (): EquipEntry => ({ name: '', operator: '', hours: 0, condition: 'Good' });
const blankWeather = (): WeatherPeriod => ({ temp: '', conditions: 'Clear', wind: '', precip: 'None', impact: 'None' });

/* ── Reusable styles ──────────────────────────────────────── */
const sInput: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: F.dark, border: `1px solid ${F.border}`,
  borderRadius: 8, color: F.text, fontSize: 16, outline: 'none', boxSizing: 'border-box',
};
const sLabel: React.CSSProperties = { fontSize: 12, color: F.dim, marginBottom: 4, display: 'block', fontWeight: 600 };
const sSection: React.CSSProperties = {
  background: F.raised, border: `1px solid ${F.border}`, borderRadius: 12,
  padding: 16, marginBottom: 16,
};
const sBtn: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6,
};

export default function DailyLogPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── State ───────────────────────────────────────────────── */
  const [projectId, setProjectId]       = useState('');
  const [projectName, setProjectName]   = useState('');
  const [userName, setUserName]         = useState('');
  const [logDate, setLogDate]           = useState(() => new Date().toISOString().split('T')[0]);

  // Weather
  const [autoWeather, setAutoWeather]   = useState<{ temp: number; desc: string; wind: number } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherPeriods, setWeatherPeriods] = useState<Record<string, WeatherPeriod>>({
    Morning: blankWeather(), Afternoon: blankWeather(), Evening: blankWeather(),
  });

  // Crew
  const [crew, setCrew]                 = useState<CrewEntry[]>([blankCrew()]);

  // Work
  const [workPerformed, setWorkPerformed] = useState('');

  // Equipment
  const [equipment, setEquipment]       = useState<EquipEntry[]>([]);

  // Issues
  const [delays, setDelays]             = useState('');
  const [severity, setSeverity]         = useState('None');

  // Visitors
  const [visitors, setVisitors]         = useState('');

  // Photos
  const [photos, setPhotos]             = useState<PhotoEntry[]>([]);

  // Notes
  const [notes, setNotes]               = useState('');

  // GPS
  const [gpsCoords, setGpsCoords]       = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsStatus, setGpsStatus]       = useState<'pending' | 'captured' | 'unavailable'>('pending');

  // Submit
  const [submitting, setSubmitting]     = useState(false);
  const [toast, setToast]               = useState('');

  /* ── Auto-save draft ─────────────────────────────────────── */
  const formState = { logDate, weatherPeriods, crew, workPerformed, equipment, delays, severity, visitors, notes };
  const { restored, restoredAgo, clearDraft, discardDraft } = useAutoSave('daily-log-draft', formState);

  useEffect(() => {
    getDraft<typeof formState>('daily-log-draft').then(draft => {
      if (draft) {
        if (draft.logDate) setLogDate(draft.logDate);
        if (draft.weatherPeriods) setWeatherPeriods(draft.weatherPeriods);
        if (draft.crew) setCrew(draft.crew);
        if (draft.workPerformed) setWorkPerformed(draft.workPerformed);
        if (draft.equipment) setEquipment(draft.equipment);
        if (draft.delays) setDelays(draft.delays);
        if (draft.severity) setSeverity(draft.severity);
        if (draft.visitors) setVisitors(draft.visitors);
        if (draft.notes) setNotes(draft.notes);
      }
    });
  }, []);

  /* ── Init: read projectId, fetch user + project + weather ── */
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('projectId') || '';
    setProjectId(pid);

    // Fetch user
    (async () => {
      const { data: userData } = await fieldFetch<{ name?: string }>('/api/auth/me', { credentials: 'include' });
      if (userData?.name) setUserName(userData.name);
    })();

    // Fetch project name
    if (pid) {
      (async () => {
        const { data: projData } = await fieldFetch<{ name?: string; project?: { name: string } }>(`/api/projects/${pid}`, { credentials: 'include' });
        if (projData?.name) setProjectName(projData.name);
        else if (projData?.project?.name) setProjectName(projData.project.name);
      })();
    }

    // GPS + weather (external API — keep raw fetch for third-party)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          setGpsCoords({ lat: latitude, lng: longitude, accuracy });
          setGpsStatus('captured');
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=fahrenheit`)
            .then(r => r.json())
            .then(d => {
              if (d?.current_weather) {
                const cw = d.current_weather;
                setAutoWeather({
                  temp: Math.round(cw.temperature),
                  desc: WMO[cw.weathercode] || 'Unknown',
                  wind: Math.round(cw.windspeed),
                });
              }
              setWeatherLoading(false);
            })
            .catch(() => setWeatherLoading(false));
        },
        () => { setWeatherLoading(false); setGpsStatus('unavailable'); },
        { timeout: 10000 },
      );
    } else {
      setWeatherLoading(false);
      setGpsStatus('unavailable');
    }
  }, []);

  /* ── Helpers ─────────────────────────────────────────────── */
  const updateCrew = useCallback((i: number, patch: Partial<CrewEntry>) => {
    setCrew(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  }, []);

  const updateEquip = useCallback((i: number, patch: Partial<EquipEntry>) => {
    setEquipment(prev => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  }, []);

  const updateWeatherPeriod = useCallback((period: string, patch: Partial<WeatherPeriod>) => {
    setWeatherPeriods(prev => ({ ...prev, [period]: { ...prev[period], ...patch } }));
  }, []);

  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newPhotos: PhotoEntry[] = [];
    Array.from(files).forEach(f => {
      newPhotos.push({ file: f, preview: URL.createObjectURL(f), caption: '' });
    });
    setPhotos(prev => [...prev, ...newPhotos]);
    e.target.value = '';
  };

  const removePhoto = (i: number) => {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[i].preview);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const totalCrew = crew.reduce((s, c) => s + (c.headcount || 0), 0);

  /* ── Submit ──────────────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!workPerformed.trim()) {
      setToast('Please describe work performed today.');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    setSubmitting(true);
    try {
      // Build weather summary string
      const weatherSummary = autoWeather
        ? `${autoWeather.temp}°F, ${autoWeather.desc}, Wind ${autoWeather.wind} mph`
        : Object.entries(weatherPeriods)
            .filter(([, v]) => v.temp)
            .map(([k, v]) => `${k}: ${v.temp}°F ${v.conditions} Wind ${v.wind}mph`)
            .join(' | ') || 'Not recorded';

      const logPayload = {
        projectId,
        logDate,
        crewCount: totalCrew,
        weather: weatherSummary,
        temperatureHigh: autoWeather?.temp || null,
        temperatureLow: null,
        workPerformed,
        delays: severity !== 'None' ? `[${severity}] ${delays}` : delays,
        visitors,
        notes,
        safetyNotes: '',
        materialsDelivered: '',
        latitude: gpsCoords?.lat || null,
        longitude: gpsCoords?.lng || null,
        gpsAccuracy: gpsCoords?.accuracy || null,
      };

      // Offline mode — queue for later sync
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue({
          url: '/api/daily-logs/create',
          method: 'POST',
          body: JSON.stringify(logPayload),
          contentType: 'application/json',
          isFormData: false,
        });
        clearDraft();
        setToast('Saved offline — will sync when reconnected!');
        setTimeout(() => router.push('/field'), 1500);
        return;
      }

      // 1. Create daily log (online)
      const res = await fetch('/api/daily-logs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logPayload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to create log');

      const logId = result.log?.id;

      // 2. Upload photos to Supabase Storage
      if (photos.length > 0 && logId) {
        for (const photo of photos) {
          const formData = new FormData();
          formData.append('file', photo.file);
          formData.append('projectId', projectId);
          formData.append('folder', `daily-logs/${logId}`);
          formData.append('caption', photo.caption);
          await fetch('/api/files/upload', {
            method: 'POST',
            body: formData,
          }).catch(() => {});
        }
      }

      clearDraft();
      setToast('Daily log submitted successfully!');
      setTimeout(() => router.push('/field'), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit log';
      setToast(msg);
      setTimeout(() => setToast(''), 4000);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="field-page-enter" style={{ minHeight: '100dvh', background: F.dark, color: F.text, paddingBottom: 110 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: toast.includes('success') ? '#166534' : '#7f1d1d',
          color: '#fff', padding: '10px 20px', borderRadius: 8, zIndex: 9999,
          fontSize: 14, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,.08)',
        }}>{toast}</div>
      )}

      {/* ── Header ────────────────────────────────────────── */}
      <FieldPageHeader
        title="New Daily Log"
        subtitle={projectName || undefined}
        icon={scopedFieldIcon('dailyLog', 'ph')}
      />

      <div style={{ padding: '16px 16px 0' }}>
        {restored && <DraftRestoredBanner timeAgo={restoredAgo} onDiscard={discardDraft} />}

        {/* ── Date Picker ─────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <label style={sLabel}>Log Date</label>
          <input
            type="date"
            value={logDate}
            onChange={e => setLogDate(e.target.value)}
            style={{ ...sInput, colorScheme: 'dark' }}
          />
        </div>

        {/* ── GPS Badge ────────────────────────────────────── */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
          padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
          background: gpsStatus === 'captured' ? 'rgba(34,197,94,.1)' : gpsStatus === 'unavailable' ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)',
          border: `1px solid ${gpsStatus === 'captured' ? 'rgba(34,197,94,.25)' : gpsStatus === 'unavailable' ? 'rgba(239,68,68,.25)' : 'rgba(245,158,11,.25)'}`,
          color: gpsStatus === 'captured' ? F.green : gpsStatus === 'unavailable' ? F.red : F.amber,
        }}>
          <span>{gpsStatus === 'captured' ? '\u{1F4CD}' : gpsStatus === 'unavailable' ? '\u{1F4CD}' : '\u23F3'}</span>
          {gpsStatus === 'captured' && `Location captured (${gpsCoords?.accuracy ? Math.round(gpsCoords.accuracy) + 'm' : ''})`}
          {gpsStatus === 'unavailable' && 'Location unavailable'}
          {gpsStatus === 'pending' && 'Getting location...'}
        </div>

        {/* ── Weather Section ─────────────────────────────── */}
        <div style={sSection}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>&#9729;</span> Weather
          </div>

          {/* Auto-populated current weather */}
          {weatherLoading ? (
            <div style={{ color: F.dim, fontSize: 13, marginBottom: 12 }}>Fetching weather from GPS...</div>
          ) : autoWeather ? (
            <div style={{
              background: F.dark, borderRadius: 8, padding: 12, marginBottom: 14,
              border: `1px solid ${F.border}`, display: 'flex', gap: 16, alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{autoWeather.temp}&#176;F</div>
                <div style={{ fontSize: 13, color: F.dim }}>{autoWeather.desc}</div>
              </div>
              <div style={{ fontSize: 13, color: F.dim }}>
                Wind: {autoWeather.wind} mph
              </div>
            </div>
          ) : (
            <div style={{ color: F.dim, fontSize: 13, marginBottom: 12 }}>Weather not available. Enter manually below.</div>
          )}

          {/* Manual override periods */}
          <div style={{ fontSize: 12, color: F.dim, marginBottom: 8, fontWeight: 600 }}>Manual Override (optional)</div>
          {PERIODS.map(period => (
            <details key={period} style={{ marginBottom: 8 }}>
              <summary style={{
                cursor: 'pointer', fontSize: 13, fontWeight: 600, color: F.text,
                padding: '8px 0', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 10, color: F.dim }}>&#9654;</span> {period}
              </summary>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 8 }}>
                <div>
                  <label style={sLabel}>Temp (&#176;F)</label>
                  <input type="number" placeholder="--" value={weatherPeriods[period].temp}
                    onChange={e => updateWeatherPeriod(period, { temp: e.target.value })}
                    style={sInput} />
                </div>
                <div>
                  <label style={sLabel}>Wind (mph)</label>
                  <input type="number" placeholder="--" value={weatherPeriods[period].wind}
                    onChange={e => updateWeatherPeriod(period, { wind: e.target.value })}
                    style={sInput} />
                </div>
                <div>
                  <label style={sLabel}>Conditions</label>
                  <select value={weatherPeriods[period].conditions}
                    onChange={e => updateWeatherPeriod(period, { conditions: e.target.value })}
                    style={sInput}>
                    {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={sLabel}>Precipitation</label>
                  <select value={weatherPeriods[period].precip}
                    onChange={e => updateWeatherPeriod(period, { precip: e.target.value })}
                    style={sInput}>
                    {PRECIP.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={sLabel}>Work Impact</label>
                  <select value={weatherPeriods[period].impact}
                    onChange={e => updateWeatherPeriod(period, { impact: e.target.value })}
                    style={sInput}>
                    {IMPACTS.map(im => <option key={im} value={im}>{im}</option>)}
                  </select>
                </div>
              </div>
            </details>
          ))}
        </div>

        {/* ── Crew Section ────────────────────────────────── */}
        <div style={sSection}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>&#128119;</span> Crew on Site
          </div>
          <div style={{ fontSize: 12, color: F.dim, marginBottom: 12 }}>Total: {totalCrew} workers</div>

          {crew.map((c, i) => (
            <div key={i} style={{
              background: F.dark, border: `1px solid ${F.border}`, borderRadius: 8,
              padding: 12, marginBottom: 10, position: 'relative',
            }}>
              {crew.length > 1 && (
                <button
                  onClick={() => setCrew(prev => prev.filter((_, idx) => idx !== i))}
                  style={{
                    position: 'absolute', top: 8, right: 8, background: 'transparent',
                    border: 'none', color: '#ef4444', fontSize: 18, cursor: 'pointer', lineHeight: 1,
                  }}
                  aria-label="Remove crew entry"
                >&#10005;</button>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={sLabel}>Trade</label>
                  <select value={c.trade} onChange={e => updateCrew(i, { trade: e.target.value })} style={sInput}>
                    {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={sLabel}>Company</label>
                  <input value={c.company} onChange={e => updateCrew(i, { company: e.target.value })}
                    placeholder="Company name" style={sInput} />
                </div>
                <div>
                  <label style={sLabel}>Headcount</label>
                  <input type="number" min={0} value={c.headcount}
                    onChange={e => updateCrew(i, { headcount: parseInt(e.target.value) || 0 })}
                    style={sInput} />
                </div>
                <div>
                  <label style={sLabel}>Hours</label>
                  <input type="number" min={0} step={0.5} value={c.hours}
                    onChange={e => updateCrew(i, { hours: parseFloat(e.target.value) || 0 })}
                    style={sInput} />
                </div>
                <div>
                  <label style={sLabel}>Foreman</label>
                  <input value={c.foreman} onChange={e => updateCrew(i, { foreman: e.target.value })}
                    placeholder="Foreman name" style={sInput} />
                </div>
                <div>
                  <label style={sLabel}>Notes</label>
                  <input value={c.notes} onChange={e => updateCrew(i, { notes: e.target.value })}
                    placeholder="Optional" style={sInput} />
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={() => setCrew(prev => [...prev, blankCrew()])}
            style={{ ...sBtn, background: `${F.gold}22`, color: F.gold, width: '100%', justifyContent: 'center' }}
          >+ Add Trade</button>
        </div>

        {/* ── Work Performed ──────────────────────────────── */}
        <div style={sSection}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>&#128295;</span> Work Performed
            </div>
            <VoiceToLog onTranscript={(text) => setWorkPerformed(prev => prev ? prev + '\n' + text : text)} />
          </div>
          <textarea
            value={workPerformed}
            onChange={e => setWorkPerformed(e.target.value)}
            placeholder="Describe work completed today... (or tap mic to dictate)"
            rows={5}
            style={{ ...sInput, resize: 'vertical', minHeight: 100 }}
          />
        </div>

        {/* ── Equipment ───────────────────────────────────── */}
        <div style={sSection}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>&#128668;</span> Equipment
          </div>

          {equipment.length === 0 && (
            <div style={{ fontSize: 13, color: F.dim, marginBottom: 10 }}>No equipment logged yet.</div>
          )}

          {equipment.map((eq, i) => (
            <div key={i} style={{
              background: F.dark, border: `1px solid ${F.border}`, borderRadius: 8,
              padding: 12, marginBottom: 10, position: 'relative',
            }}>
              <button
                onClick={() => setEquipment(prev => prev.filter((_, idx) => idx !== i))}
                style={{
                  position: 'absolute', top: 8, right: 8, background: 'transparent',
                  border: 'none', color: '#ef4444', fontSize: 18, cursor: 'pointer', lineHeight: 1,
                }}
                aria-label="Remove equipment"
              >&#10005;</button>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={sLabel}>Equipment</label>
                  <input value={eq.name} onChange={e => updateEquip(i, { name: e.target.value })}
                    placeholder="e.g. Excavator" style={sInput} />
                </div>
                <div>
                  <label style={sLabel}>Operator</label>
                  <input value={eq.operator} onChange={e => updateEquip(i, { operator: e.target.value })}
                    placeholder="Name" style={sInput} />
                </div>
                <div>
                  <label style={sLabel}>Hours Used</label>
                  <input type="number" min={0} step={0.5} value={eq.hours}
                    onChange={e => updateEquip(i, { hours: parseFloat(e.target.value) || 0 })}
                    style={sInput} />
                </div>
                <div>
                  <label style={sLabel}>Condition</label>
                  <select value={eq.condition} onChange={e => updateEquip(i, { condition: e.target.value })}
                    style={sInput}>
                    {EQ_COND.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={() => setEquipment(prev => [...prev, blankEquip()])}
            style={{ ...sBtn, background: `${F.gold}22`, color: F.gold, width: '100%', justifyContent: 'center' }}
          >+ Add Equipment</button>
        </div>

        {/* ── Issues / Delays ─────────────────────────────── */}
        <div style={sSection}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>&#9888;</span> Issues / Delays
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={sLabel}>Severity</label>
            <select value={severity} onChange={e => setSeverity(e.target.value)} style={sInput}>
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <textarea
            value={delays}
            onChange={e => setDelays(e.target.value)}
            placeholder="Describe any delays, issues, or incidents..."
            rows={3}
            style={{ ...sInput, resize: 'vertical' }}
          />
        </div>

        {/* ── Visitors ────────────────────────────────────── */}
        <div style={sSection}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>&#128101;</span> Visitors
          </div>
          <textarea
            value={visitors}
            onChange={e => setVisitors(e.target.value)}
            placeholder="List visitor names and companies..."
            rows={2}
            style={{ ...sInput, resize: 'vertical' }}
          />
        </div>

        {/* ── Photos ──────────────────────────────────────── */}
        <div style={sSection}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>&#128247;</span> Photos
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handlePhotos}
            style={{ display: 'none' }}
          />

          {photos.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: 10, marginBottom: 12,
            }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img
                    src={p.preview}
                    alt={`Photo ${i + 1}`}
                    style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8, border: `1px solid ${F.border}` }}
                  />
                  <button
                    onClick={() => removePhoto(i)}
                    style={{
                      position: 'absolute', top: 4, right: 4, width: 22, height: 22,
                      borderRadius: '50%', background: 'rgba(0,0,0,.12)', border: 'none',
                      color: '#ef4444', fontSize: 14, cursor: 'pointer', lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >&#10005;</button>
                  <input
                    value={p.caption}
                    onChange={e => {
                      setPhotos(prev => prev.map((ph, idx) => idx === i ? { ...ph, caption: e.target.value } : ph));
                    }}
                    placeholder="Caption..."
                    style={{ ...sInput, fontSize: 11, padding: '4px 6px', marginTop: 4 }}
                  />
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => fileRef.current?.click()}
            style={{ ...sBtn, background: `${F.gold}22`, color: F.gold, width: '100%', justifyContent: 'center' }}
          >&#128247; Take Photo</button>
        </div>

        {/* ── Notes ────────────────────────────────────────── */}
        <div style={sSection}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>&#128221;</span> Notes
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="General notes, reminders, observations..."
            rows={3}
            style={{ ...sInput, resize: 'vertical' }}
          />
        </div>
      </div>

      {/* ── Sticky Submit Button ──────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        background: `linear-gradient(to top, ${F.dark} 60%, transparent)`,
        zIndex: 200,
      }}>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
            background: submitting ? F.border : `linear-gradient(135deg, ${F.gold}, #b8860b)`,
            color: submitting ? F.dim : '#000', fontWeight: 700, fontSize: 16,
            cursor: submitting ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: submitting ? 'none' : `0 4px 20px ${F.gold}44`,
            transition: 'all .2s',
          }}
        >
          {submitting ? (
            <>
              <span style={{
                width: 18, height: 18, border: '2px solid #666', borderTopColor: F.gold,
                borderRadius: '50%', display: 'inline-block',
                animation: 'dlspin .8s linear infinite',
              }} />
              Submitting...
            </>
          ) : (
            <>Submit Daily Log</>
          )}
        </button>
      </div>

      {/* Offline sync status indicator */}
      <OfflineSyncStatus />

      {/* Spinner keyframes */}
      <style>{`@keyframes dlspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}