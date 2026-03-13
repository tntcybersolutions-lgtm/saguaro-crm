'use client';
/**
 * Saguaro Field — Daily Log
 * Fixed API endpoint + field mapping. Touch-optimized sections. Offline-first.
 * Enhanced with tabbed sub-logs: Manpower, Equipment, Weather, Visitor, Notes/General.
 */
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import SignaturePad from '@/components/SignaturePad';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';

const WEATHER_OPTS = ['Sunny', 'Partly Cloudy', 'Overcast', 'Windy', 'Light Rain', 'Heavy Rain', 'Storm', 'Snow', 'Fog', 'Extreme Heat'];
const PURPLE = '#8B5CF6';
const ORANGE = '#F59E0B';
const CYAN   = '#06B6D4';

/* ── Type definitions for sub-logs ─────────────────────────── */
interface ManpowerEntry {
  id: string;
  trade: string;
  headcount: number;
  hours: number;
  productivityNotes: string;
}
interface EquipmentEntry {
  id: string;
  name: string;
  hoursUsed: number;
  idleHours: number;
  fuelUsage: string;
  condition: string;
  operatorName: string;
}
interface WeatherDetail {
  temperature: string;
  conditions: string;
  wind: string;
  precipitation: string;
  delayHours: number;
  impactNotes: string;
}
interface VisitorEntry {
  id: string;
  name: string;
  company: string;
  timeIn: string;
  timeOut: string;
  purpose: string;
  badgeNumber: string;
}

const LOG_TABS = ['Notes/General', 'Manpower', 'Equipment', 'Weather', 'Visitors'] as const;
type LogTab = typeof LOG_TABS[number];

const TAB_ICONS: Record<LogTab, React.ReactNode> = {
  'Notes/General': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  'Manpower': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx={9} cy={7} r={4}/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  'Equipment': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><rect x={2} y={7} width={20} height={14} rx={2} ry={2}/><path d="M16 3l-4 4-4-4"/></svg>,
  'Weather': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>,
  'Visitors': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx={8.5} cy={7} r={4}/><line x1={20} y1={8} x2={20} y2={14}/><line x1={23} y1={11} x2={17} y2={11}/></svg>,
};

const uid = () => Math.random().toString(36).slice(2, 9);

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

  // Active sub-log tab
  const [activeTab, setActiveTab] = useState<LogTab>('Notes/General');

  // Form state (original fields)
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

  // ── NEW sub-log state ──────────────────────────────
  const [manpowerEntries, setManpowerEntries] = useState<ManpowerEntry[]>([]);
  const [equipmentEntries, setEquipmentEntries] = useState<EquipmentEntry[]>([]);
  const [weatherDetail, setWeatherDetail] = useState<WeatherDetail>({
    temperature: '', conditions: '', wind: '', precipitation: '', delayHours: 0, impactNotes: '',
  });
  const [visitorEntries, setVisitorEntries] = useState<VisitorEntry[]>([]);
  const [copyingYesterday, setCopyingYesterday] = useState(false);

  // Site photos
  const sitePhotoRef = useRef<HTMLInputElement>(null);
  const [sitePhotoPreviews, setSitePhotoPreviews] = useState<string[]>([]);
  const [sitePhotoFiles, setSitePhotoFiles] = useState<File[]>([]);
  // Signature
  const [showSignature, setShowSignature] = useState(false);
  const [signatureData, setSignatureData] = useState('');

  const handleSitePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setSitePhotoPreviews((prev) => [...prev, String(ev.target?.result || '')]);
        setSitePhotoFiles((prev) => [...prev, file]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeSitePhoto = (idx: number) => {
    setSitePhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
    setSitePhotoFiles((prev) => prev.filter((_, i) => i !== idx));
  };

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
            // Also populate weather detail tab
            setWeatherDetail((prev) => ({
              ...prev,
              temperature: `${today?.mintempF ?? ''}°F - ${today?.maxtempF ?? ''}°F`,
              conditions: current.weatherDesc?.[0]?.value ?? '',
              wind: current.windspeedMiles ? `${current.windspeedMiles} mph ${current.winddir16Point ?? ''}` : '',
              precipitation: current.precipMM ? `${current.precipMM} mm` : '0 mm',
            }));
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

  /* ── Copy from Yesterday ─────────────────────────── */
  const copyFromYesterday = useCallback(async () => {
    if (!projectId) return;
    setCopyingYesterday(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/daily-logs?limit=1`);
      if (!res.ok) throw new Error('fetch failed');
      const d = await res.json();
      const last = d?.logs?.[0];
      if (!last) { setError('No previous log found to copy from.'); setCopyingYesterday(false); return; }

      // Fill original fields
      if (last.crew_count) setCrewCount(String(last.crew_count));
      if (last.weather) setWeather(last.weather);
      if (last.work_performed) setWorkPerformed(last.work_performed);
      if (last.delays) setDelays(last.delays);
      if (last.safety_notes) setSafetyNotes(last.safety_notes);
      if (last.materials_delivered) setMaterialsDelivered(last.materials_delivered);
      if (last.visitors) setVisitors(last.visitors);
      if (last.notes) setNotes(last.notes);

      // Fill extended sub-log data if stored in notes JSON
      try {
        const ext = last.extended_data ? (typeof last.extended_data === 'string' ? JSON.parse(last.extended_data) : last.extended_data) : null;
        if (ext) {
          if (ext.manpowerEntries?.length) setManpowerEntries(ext.manpowerEntries.map((e: ManpowerEntry) => ({ ...e, id: uid() })));
          if (ext.equipmentEntries?.length) setEquipmentEntries(ext.equipmentEntries.map((e: EquipmentEntry) => ({ ...e, id: uid() })));
          if (ext.weatherDetail) setWeatherDetail(ext.weatherDetail);
          if (ext.visitorEntries?.length) setVisitorEntries(ext.visitorEntries.map((e: VisitorEntry) => ({ ...e, id: uid() })));
        }
      } catch { /* extended data parse error — skip */ }

      const supMatch = (last.notes || '').match(/^Superintendent: ([^\n]+)/);
      if (supMatch) setSuperintendent(supMatch[1]);
    } catch {
      setError('Could not load previous log.');
    }
    setCopyingYesterday(false);
  }, [projectId]);

  /* ── Manpower helpers ───────────────────────────── */
  const addManpower = () => setManpowerEntries((prev) => [...prev, { id: uid(), trade: '', headcount: 0, hours: 0, productivityNotes: '' }]);
  const updateManpower = (id: string, field: keyof ManpowerEntry, value: string | number) => {
    setManpowerEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };
  const removeManpower = (id: string) => setManpowerEntries((prev) => prev.filter((e) => e.id !== id));

  /* ── Equipment helpers ──────────────────────────── */
  const addEquipment = () => setEquipmentEntries((prev) => [...prev, { id: uid(), name: '', hoursUsed: 0, idleHours: 0, fuelUsage: '', condition: 'Good', operatorName: '' }]);
  const updateEquipmentEntry = (id: string, field: keyof EquipmentEntry, value: string | number) => {
    setEquipmentEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };
  const removeEquipmentEntry = (id: string) => setEquipmentEntries((prev) => prev.filter((e) => e.id !== id));

  /* ── Visitor helpers ────────────────────────────── */
  const addVisitor = () => setVisitorEntries((prev) => [...prev, { id: uid(), name: '', company: '', timeIn: '', timeOut: '', purpose: '', badgeNumber: '' }]);
  const updateVisitor = (id: string, field: keyof VisitorEntry, value: string) => {
    setVisitorEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };
  const removeVisitor = (id: string) => setVisitorEntries((prev) => prev.filter((e) => e.id !== id));

  /* ── Computed summaries ─────────────────────────── */
  const totalManpowerHours = manpowerEntries.reduce((s, e) => s + (e.headcount * e.hours), 0);
  const totalHeadcount = manpowerEntries.reduce((s, e) => s + e.headcount, 0);
  const tradeDistribution = manpowerEntries.filter((e) => e.trade && e.headcount > 0);
  const maxTradeCount = Math.max(1, ...tradeDistribution.map((e) => e.headcount));

  const totalEquipHours = equipmentEntries.reduce((s, e) => s + e.hoursUsed, 0);
  const totalEquipIdle = equipmentEntries.reduce((s, e) => s + e.idleHours, 0);
  const equipUtilization = (totalEquipHours + totalEquipIdle) > 0
    ? Math.round((totalEquipHours / (totalEquipHours + totalEquipIdle)) * 100)
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) { setError('No project selected. Go back home and pick a project first.'); return; }
    if (!workPerformed.trim()) { setError('Please describe the work performed today.'); return; }
    setSaving(true);
    // suppress unused var lint
    void aiLoading; void listening;
    setError('');

    // Upload site photos if online
    const photoUrls: string[] = [];
    if (sitePhotoFiles.length > 0 && online) {
      for (const file of sitePhotoFiles) {
        try {
          const fd = new FormData();
          fd.append('file', file, file.name);
          fd.append('category', 'Progress');
          fd.append('caption', `Daily Log - ${new Date().toLocaleDateString()}`);
          if (projectId) fd.append('projectId', projectId);
          const r = await fetch('/api/photos/upload', { method: 'POST', body: fd });
          if (r.ok) { const d = await r.json(); photoUrls.push(String(d.photo?.url || '')); }
        } catch { /* skip */ }
      }
    }

    // Build extended data blob for sub-logs
    const extendedData = {
      manpowerEntries,
      equipmentEntries,
      weatherDetail,
      visitorEntries,
      manpowerSummary: { totalHours: totalManpowerHours, totalHeadcount },
      equipmentSummary: { totalHours: totalEquipHours, utilization: equipUtilization },
    };

    // Build notes with superintendent prefix
    const fullNotes = [
      superintendent.trim() ? `Superintendent: ${superintendent.trim()}` : '',
      equipment.trim() ? `Equipment: ${equipment.trim()}` : '',
      notes.trim(),
      photoUrls.length ? `Site Photos: ${photoUrls.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    // Build enriched visitors string from visitor entries
    const enrichedVisitors = [
      visitors.trim(),
      ...visitorEntries.filter((v) => v.name).map((v) => `${v.name} (${v.company || 'N/A'}) ${v.timeIn}-${v.timeOut} [${v.purpose}]`),
    ].filter(Boolean).join('; ');

    // FIXED: correct field names matching /api/daily-logs/create
    const payload = {
      projectId,
      logDate: new Date().toISOString().split('T')[0],
      weather,
      temperatureHigh: tempHigh ? parseInt(tempHigh) : null,
      temperatureLow: tempLow ? parseInt(tempLow) : null,
      crewCount: crewCount ? parseInt(crewCount) : totalHeadcount || 0,
      workPerformed: workPerformed.trim(),
      delays: delays.trim() || (weatherDetail.delayHours > 0 ? `Weather delay: ${weatherDetail.delayHours}h — ${weatherDetail.impactNotes}` : ''),
      safetyNotes: safetyNotes.trim(),
      materialsDelivered: materialsDelivered.trim(),
      visitors: enrichedVisitors,
      notes: fullNotes,
      signature_data: signatureData || null,
      photo_urls: photoUrls,
      extended_data: extendedData,
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
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(34,197,94,.15)', border: '2px solid rgba(34,197,94,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GREEN }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={44} height={44}><polyline points="20 6 9 17 4 12"/></svg></div>
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
      <button onClick={() => router.back()} style={backBtn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg></button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Daily Log</h1>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: DIM }}>
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        {projectName ? ` · ${projectName}` : ''}
      </p>

      {!online && <OfflineBanner />}

      {/* Copy from Yesterday button */}
      <button
        type="button"
        disabled={copyingYesterday}
        onClick={copyFromYesterday}
        style={{
          width: '100%',
          background: copyingYesterday ? RAISED : 'rgba(6,182,212,.08)',
          border: `1px solid rgba(6,182,212,.25)`,
          borderRadius: 10,
          padding: '12px',
          color: copyingYesterday ? DIM : CYAN,
          fontSize: 13,
          fontWeight: 700,
          cursor: copyingYesterday ? 'wait' : 'pointer',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><rect x={9} y={9} width={13} height={13} rx={2} ry={2}/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        {copyingYesterday ? 'Loading...' : 'Copy from Yesterday'}
      </button>

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
              {WEATHER_OPTS.map((o) => <option key={o} value={o} style={{ background: '#0D1D2E' }}>{o}</option>)}
            </select>
          </Field>
          <Row>
            <Field label="High Temp (\u00B0F)">
              <input type="number" inputMode="numeric" value={tempHigh} onChange={(e) => setTempHigh(e.target.value)} placeholder="e.g. 92" style={inp} />
            </Field>
            <Field label="Low Temp (\u00B0F)">
              <input type="number" inputMode="numeric" value={tempLow} onChange={(e) => setTempLow(e.target.value)} placeholder="e.g. 68" style={inp} />
            </Field>
          </Row>
        </Section>

        {/* ── Work & Equipment (original) ─────────────────────────── */}
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
              style={{ flex: 1, background: aiLoading ? '#1E3A5F' : 'rgba(139,92,246,.15)', border: `1px solid rgba(139,92,246,.3)`, borderRadius: 10, padding: '10px', color: aiLoading ? DIM : PURPLE, fontSize: 13, fontWeight: 700, cursor: aiLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {aiLoading ? (
                <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14} style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-9-9"/></svg> Drafting...</>
              ) : (
                <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> AI Draft Log</>
              )}
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
              {listening ? (
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: RED, animation: 'pulse 1s infinite' }} />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1={12} y1={19} x2={12} y2={23}/><line x1={8} y1={23} x2={16} y2={23}/></svg>
              )}
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

        {/* ══════════════════════════════════════════════════════════
            ═══  TABBED SUB-LOG SECTIONS  ═══════════════════════════
            ══════════════════════════════════════════════════════════ */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, marginBottom: 12, overflow: 'hidden' }}>
          <p style={{ margin: '14px 14px 0', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Detailed Log Sections</p>

          {/* Tab bar */}
          <div style={{ display: 'flex', overflowX: 'auto', gap: 0, borderBottom: `1px solid ${BORDER}`, margin: '10px 0 0' }}>
            {LOG_TABS.map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: '0 0 auto',
                    background: active ? 'rgba(212,160,23,.1)' : 'transparent',
                    border: 'none',
                    borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
                    padding: '10px 14px',
                    color: active ? GOLD : DIM,
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    whiteSpace: 'nowrap',
                    transition: 'all .15s',
                  }}
                >
                  {TAB_ICONS[tab]}
                  {tab}
                  {/* Badge counts */}
                  {tab === 'Manpower' && manpowerEntries.length > 0 && <span style={badgeStyle}>{manpowerEntries.length}</span>}
                  {tab === 'Equipment' && equipmentEntries.length > 0 && <span style={badgeStyle}>{equipmentEntries.length}</span>}
                  {tab === 'Visitors' && visitorEntries.length > 0 && <span style={badgeStyle}>{visitorEntries.length}</span>}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div style={{ padding: '14px' }}>

            {/* ── Notes/General Tab ────────────────────── */}
            {activeTab === 'Notes/General' && (
              <div>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: DIM }}>
                  General notes, materials, and other information already captured above. Use the other tabs for detailed tracking by category.
                </p>
                <div style={{ background: 'rgba(212,160,23,.06)', border: `1px solid rgba(212,160,23,.15)`, borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: DIM }}>Crew Count</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{crewCount || totalHeadcount || '--'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: DIM }}>Weather</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{weather}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: DIM }}>Temp Range</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{tempLow || '--'}\u00B0 - {tempHigh || '--'}\u00B0F</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Manpower Tab ─────────────────────────── */}
            {activeTab === 'Manpower' && (
              <div>
                {/* Summary bar */}
                {manpowerEntries.length > 0 && (
                  <div style={{ background: 'rgba(34,197,94,.06)', border: `1px solid rgba(34,197,94,.15)`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                    <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: 0.6 }}>Manpower Summary</p>
                    <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT }}>{totalHeadcount}</div>
                        <div style={{ fontSize: 11, color: DIM }}>Total Headcount</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT }}>{totalManpowerHours.toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: DIM }}>Total Man-Hours</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT }}>{manpowerEntries.length}</div>
                        <div style={{ fontSize: 11, color: DIM }}>Trades</div>
                      </div>
                    </div>
                    {/* CSS bar chart — crew distribution by trade */}
                    {tradeDistribution.length > 0 && (
                      <div>
                        <p style={{ margin: '0 0 6px', fontSize: 11, color: DIM, fontWeight: 600 }}>Crew Distribution by Trade</p>
                        {tradeDistribution.map((entry) => (
                          <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: DIM, width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.trade}</span>
                            <div style={{ flex: 1, height: 14, background: 'rgba(255,255,255,.05)', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{
                                width: `${Math.round((entry.headcount / maxTradeCount) * 100)}%`,
                                height: '100%',
                                background: `linear-gradient(90deg, ${GOLD}, ${ORANGE})`,
                                borderRadius: 4,
                                transition: 'width .3s ease',
                              }} />
                            </div>
                            <span style={{ fontSize: 11, color: TEXT, fontWeight: 700, width: 24, textAlign: 'right' }}>{entry.headcount}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Entry rows */}
                {manpowerEntries.map((entry, idx) => (
                  <div key={entry.id} style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 10, position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>Trade #{idx + 1}</span>
                      <button type="button" onClick={() => removeManpower(entry.id)} style={removeBtnStyle}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
                      </button>
                    </div>
                    <Field label="Trade Name">
                      <input value={entry.trade} onChange={(e) => updateManpower(entry.id, 'trade', e.target.value)} placeholder="e.g. Electricians, Plumbers, Iron Workers" style={inp} />
                    </Field>
                    <Row>
                      <Field label="Headcount">
                        <input type="number" inputMode="numeric" value={entry.headcount || ''} onChange={(e) => updateManpower(entry.id, 'headcount', parseInt(e.target.value) || 0)} placeholder="0" style={inp} />
                      </Field>
                      <Field label="Hours per Person">
                        <input type="number" inputMode="decimal" value={entry.hours || ''} onChange={(e) => updateManpower(entry.id, 'hours', parseFloat(e.target.value) || 0)} placeholder="8" style={inp} />
                      </Field>
                    </Row>
                    <Field label="Productivity Notes">
                      <input value={entry.productivityNotes} onChange={(e) => updateManpower(entry.id, 'productivityNotes', e.target.value)} placeholder="Progress, issues, areas worked..." style={inp} />
                    </Field>
                  </div>
                ))}

                <button type="button" onClick={addManpower} style={addBtnStyle}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><line x1={12} y1={5} x2={12} y2={19}/><line x1={5} y1={12} x2={19} y2={12}/></svg>
                  Add Trade / Crew
                </button>
              </div>
            )}

            {/* ── Equipment Tab ────────────────────────── */}
            {activeTab === 'Equipment' && (
              <div>
                {/* Summary */}
                {equipmentEntries.length > 0 && (
                  <div style={{ background: 'rgba(245,158,11,.06)', border: `1px solid rgba(245,158,11,.15)`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                    <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 0.6 }}>Equipment Summary</p>
                    <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT }}>{totalEquipHours}h</div>
                        <div style={{ fontSize: 11, color: DIM }}>Total Hours</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: equipUtilization >= 70 ? GREEN : equipUtilization >= 40 ? ORANGE : RED }}>{equipUtilization}%</div>
                        <div style={{ fontSize: 11, color: DIM }}>Utilization</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT }}>{equipmentEntries.length}</div>
                        <div style={{ fontSize: 11, color: DIM }}>Pieces</div>
                      </div>
                    </div>
                    {/* Equipment list with status */}
                    {equipmentEntries.filter((e) => e.name).map((entry) => {
                      const statusColor = entry.condition === 'Good' ? GREEN : entry.condition === 'Needs Repair' ? RED : ORANGE;
                      return (
                        <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: TEXT, flex: 1 }}>{entry.name}</span>
                          <span style={{ fontSize: 11, color: DIM }}>{entry.hoursUsed}h active</span>
                          <span style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>{entry.condition}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Entry rows */}
                {equipmentEntries.map((entry, idx) => (
                  <div key={entry.id} style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 10, position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: ORANGE }}>Equipment #{idx + 1}</span>
                      <button type="button" onClick={() => removeEquipmentEntry(entry.id)} style={removeBtnStyle}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
                      </button>
                    </div>
                    <Field label="Equipment Name">
                      <input value={entry.name} onChange={(e) => updateEquipmentEntry(entry.id, 'name', e.target.value)} placeholder="e.g. CAT 320 Excavator" style={inp} />
                    </Field>
                    <Row>
                      <Field label="Hours Used">
                        <input type="number" inputMode="decimal" value={entry.hoursUsed || ''} onChange={(e) => updateEquipmentEntry(entry.id, 'hoursUsed', parseFloat(e.target.value) || 0)} placeholder="0" style={inp} />
                      </Field>
                      <Field label="Idle Hours">
                        <input type="number" inputMode="decimal" value={entry.idleHours || ''} onChange={(e) => updateEquipmentEntry(entry.id, 'idleHours', parseFloat(e.target.value) || 0)} placeholder="0" style={inp} />
                      </Field>
                    </Row>
                    <Row>
                      <Field label="Fuel Usage">
                        <input value={entry.fuelUsage} onChange={(e) => updateEquipmentEntry(entry.id, 'fuelUsage', e.target.value)} placeholder="e.g. 40 gal" style={inp} />
                      </Field>
                      <Field label="Condition">
                        <select value={entry.condition} onChange={(e) => updateEquipmentEntry(entry.id, 'condition', e.target.value)} style={inp}>
                          {['Good', 'Fair', 'Needs Repair', 'Out of Service'].map((c) => <option key={c} value={c} style={{ background: RAISED }}>{c}</option>)}
                        </select>
                      </Field>
                    </Row>
                    <Field label="Operator Name">
                      <input value={entry.operatorName} onChange={(e) => updateEquipmentEntry(entry.id, 'operatorName', e.target.value)} placeholder="Operator name" style={inp} />
                    </Field>
                  </div>
                ))}

                <button type="button" onClick={addEquipment} style={addBtnStyle}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><line x1={12} y1={5} x2={12} y2={19}/><line x1={5} y1={12} x2={19} y2={12}/></svg>
                  Add Equipment
                </button>
              </div>
            )}

            {/* ── Weather Tab ──────────────────────────── */}
            {activeTab === 'Weather' && (
              <div>
                <Field label="Temperature Range">
                  <input value={weatherDetail.temperature} onChange={(e) => setWeatherDetail((p) => ({ ...p, temperature: e.target.value }))} placeholder="e.g. 65°F - 92°F" style={inp} />
                </Field>
                <Field label="Conditions">
                  <input value={weatherDetail.conditions} onChange={(e) => setWeatherDetail((p) => ({ ...p, conditions: e.target.value }))} placeholder="e.g. Partly cloudy, afternoon thunderstorm" style={inp} />
                </Field>
                <Row>
                  <Field label="Wind">
                    <input value={weatherDetail.wind} onChange={(e) => setWeatherDetail((p) => ({ ...p, wind: e.target.value }))} placeholder="e.g. 15 mph NW" style={inp} />
                  </Field>
                  <Field label="Precipitation">
                    <input value={weatherDetail.precipitation} onChange={(e) => setWeatherDetail((p) => ({ ...p, precipitation: e.target.value }))} placeholder="e.g. 0.5 in" style={inp} />
                  </Field>
                </Row>
                <Field label="Weather Delay (hours)">
                  <input type="number" inputMode="decimal" value={weatherDetail.delayHours || ''} onChange={(e) => setWeatherDetail((p) => ({ ...p, delayHours: parseFloat(e.target.value) || 0 }))} placeholder="0" style={inp} />
                </Field>
                <Field label="Weather Impact Notes">
                  <textarea value={weatherDetail.impactNotes} onChange={(e) => setWeatherDetail((p) => ({ ...p, impactNotes: e.target.value }))} placeholder="Describe how weather affected work today..." rows={3} style={inp} />
                </Field>

                {/* Weather delay warning */}
                {weatherDetail.delayHours > 0 && (
                  <div style={{ background: 'rgba(239,68,68,.08)', border: `1px solid rgba(239,68,68,.2)`, borderRadius: 8, padding: '10px 12px', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2} width={16} height={16}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1={12} y1={9} x2={12} y2={13}/><line x1={12} y1={17} x2={12.01} y2={17}/></svg>
                    <span style={{ fontSize: 13, color: RED, fontWeight: 600 }}>{weatherDetail.delayHours}h weather delay recorded</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Visitors Tab ─────────────────────────── */}
            {activeTab === 'Visitors' && (
              <div>
                {visitorEntries.map((entry, idx) => (
                  <div key={entry.id} style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 10, position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: CYAN }}>Visitor #{idx + 1}</span>
                      <button type="button" onClick={() => removeVisitor(entry.id)} style={removeBtnStyle}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
                      </button>
                    </div>
                    <Row>
                      <Field label="Name">
                        <input value={entry.name} onChange={(e) => updateVisitor(entry.id, 'name', e.target.value)} placeholder="Full name" style={inp} />
                      </Field>
                      <Field label="Company">
                        <input value={entry.company} onChange={(e) => updateVisitor(entry.id, 'company', e.target.value)} placeholder="Company" style={inp} />
                      </Field>
                    </Row>
                    <Row>
                      <Field label="Time In">
                        <input type="time" value={entry.timeIn} onChange={(e) => updateVisitor(entry.id, 'timeIn', e.target.value)} style={inp} />
                      </Field>
                      <Field label="Time Out">
                        <input type="time" value={entry.timeOut} onChange={(e) => updateVisitor(entry.id, 'timeOut', e.target.value)} style={inp} />
                      </Field>
                    </Row>
                    <Row>
                      <Field label="Purpose">
                        <input value={entry.purpose} onChange={(e) => updateVisitor(entry.id, 'purpose', e.target.value)} placeholder="e.g. Inspection" style={inp} />
                      </Field>
                      <Field label="Badge #">
                        <input value={entry.badgeNumber} onChange={(e) => updateVisitor(entry.id, 'badgeNumber', e.target.value)} placeholder="Badge #" style={inp} />
                      </Field>
                    </Row>
                  </div>
                ))}

                <button type="button" onClick={addVisitor} style={addBtnStyle}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><line x1={12} y1={5} x2={12} y2={19}/><line x1={5} y1={12} x2={19} y2={12}/></svg>
                  Add Visitor
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Site Photos */}
        <Section label="Site Photos">
          <input ref={sitePhotoRef} type="file" accept="image/*" capture="environment" multiple onChange={handleSitePhoto} style={{ display: 'none' }} />
          <button type="button" onClick={() => sitePhotoRef.current?.click()} style={{ width: '100%', background: 'transparent', border: `2px dashed rgba(212,160,23,.4)`, borderRadius: 10, padding: '14px', color: GOLD, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: sitePhotoPreviews.length ? 10 : 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx={12} cy={13} r={4}/></svg>
            Take Site Photo
          </button>
          {sitePhotoPreviews.length > 0 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {sitePhotoPreviews.map((src, i) => (
                <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Site photo ${i + 1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid #1E3A5F' }} />
                  <button type="button" onClick={() => removeSitePhoto(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: RED, border: 'none', color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Superintendent Signature */}
        <Section label="Superintendent Signature">
          {signatureData ? (
            <div style={{ textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={signatureData} alt="Signature" style={{ maxWidth: '100%', height: 80, borderRadius: 8, border: '1px solid #1E3A5F' }} />
              <button type="button" onClick={() => { setSignatureData(''); setShowSignature(true); }} style={{ marginTop: 6, background: 'transparent', border: '1px solid #1E3A5F', borderRadius: 8, padding: '6px 14px', color: DIM, fontSize: 12, cursor: 'pointer' }}>Re-sign</button>
            </div>
          ) : showSignature ? (
            <SignaturePad onSave={(d) => { setSignatureData(d); setShowSignature(false); }} onCancel={() => setShowSignature(false)} label="Superintendent Signature" />
          ) : (
            <button type="button" onClick={() => setShowSignature(true)} style={{ width: '100%', background: 'transparent', border: '2px dashed rgba(212,160,23,.4)', borderRadius: 10, padding: '14px', color: GOLD, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Tap to Sign
            </button>
          )}
        </Section>

        {error && <ErrorBox msg={error} />}

        <button
          type="submit"
          disabled={saving}
          style={{ width: '100%', background: saving ? '#1E3A5F' : GOLD, border: 'none', borderRadius: 14, padding: '18px', color: saving ? DIM : '#000', fontSize: 17, fontWeight: 800, cursor: saving ? 'wait' : 'pointer', marginTop: 4, letterSpacing: 0.3 }}
        >
          {saving ? 'Submitting...' : online ? 'Submit Daily Log' : 'Save Offline'}
        </button>
      </form>
    </div>
  );
}

export default function FieldLogPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}><DailyLogForm /></Suspense>;
}

// ── Shared UI helpers ─────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#0D1D2E', border: '1px solid #1E3A5F', borderRadius: 14, padding: '14px 14px 6px', marginBottom: 12 }}>
      <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#8BAAC8', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</p>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#8BAAC8', marginBottom: 5 }}>{label}</label>
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

const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '12px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8BAAC8', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };

const badgeStyle: React.CSSProperties = {
  background: GOLD,
  color: '#000',
  fontSize: 10,
  fontWeight: 800,
  borderRadius: 8,
  padding: '1px 6px',
  marginLeft: 2,
  lineHeight: '16px',
};

const addBtnStyle: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: `2px dashed rgba(212,160,23,.3)`,
  borderRadius: 10,
  padding: '12px',
  color: GOLD,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

const removeBtnStyle: React.CSSProperties = {
  background: 'rgba(239,68,68,.1)',
  border: `1px solid rgba(239,68,68,.2)`,
  borderRadius: 6,
  padding: 4,
  color: RED,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
