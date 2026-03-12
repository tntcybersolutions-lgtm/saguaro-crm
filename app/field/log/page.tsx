'use client';
/**
 * Saguaro Field — Daily Log
 * Touch-optimized daily log form. Works offline via IndexedDB queue.
 */
import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const DARK   = '#09111A';
const RAISED = '#0f1d2b';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const GREEN  = '#22C55E';
const RED    = '#EF4444';

const WEATHER_OPTIONS = ['Sunny', 'Partly Cloudy', 'Overcast', 'Windy', 'Light Rain', 'Heavy Rain', 'Storm', 'Snow', 'Fog'];

interface Field { label: string; key: string; type: 'text' | 'number' | 'textarea' | 'select'; options?: string[]; placeholder?: string; }

const FIELDS: Field[] = [
  { label: 'Superintendent / Foreman', key: 'superintendent', type: 'text', placeholder: 'Your name' },
  { label: 'Weather', key: 'weather', type: 'select', options: WEATHER_OPTIONS },
  { label: 'Temperature (°F)', key: 'temperature', type: 'number', placeholder: 'e.g. 78' },
  { label: 'Crew on Site', key: 'crew_count', type: 'number', placeholder: 'e.g. 12' },
  { label: 'Work Performed', key: 'work_performed', type: 'textarea', placeholder: 'Describe what was accomplished today...' },
  { label: 'Equipment Used', key: 'equipment', type: 'textarea', placeholder: 'List equipment on site...' },
  { label: 'Materials Delivered', key: 'materials', type: 'textarea', placeholder: 'List any deliveries...' },
  { label: 'Visitors / Inspectors', key: 'visitors', type: 'text', placeholder: 'e.g. Owner rep, building inspector' },
  { label: 'Incidents / Safety Notes', key: 'incidents', type: 'textarea', placeholder: 'Near misses, safety concerns, etc.' },
];

type FormData = Record<string, string>;

export default function FieldLogPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [projectName, setProjectName] = useState('');
  const [form, setForm] = useState<FormData>({
    superintendent: '',
    weather: 'Sunny',
    temperature: '',
    crew_count: '',
    work_performed: '',
    equipment: '',
    materials: '',
    visitors: '',
    incidents: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Load project name and last entry defaults
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/list`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId);
        if (p) setProjectName(p.name);
      })
      .catch(() => {});

    // Pull last log to pre-fill superintendent + crew
    fetch(`/api/projects/${projectId}/daily-logs?limit=1`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const last = d?.data?.[0] || d?.[0];
        if (last) {
          setForm((prev) => ({
            ...prev,
            superintendent: last.superintendent || prev.superintendent,
            crew_count: last.crew_count ? String(last.crew_count) : prev.crew_count,
          }));
        }
      })
      .catch(() => {});
  }, [projectId]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) { setError('No project selected. Go back and pick a project.'); return; }
    setSaving(true);
    setError('');

    const payload = {
      ...form,
      date: new Date().toISOString().split('T')[0],
      crew_count: form.crew_count ? parseInt(form.crew_count) : null,
      temperature: form.temperature ? parseInt(form.temperature) : null,
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/projects/${projectId}/daily-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => router.push('/field'), 1500);
    } catch (err) {
      // Queue for later sync
      try {
        await enqueue({
          url: `/api/projects/${projectId}/daily-logs`,
          method: 'POST',
          body: JSON.stringify(payload),
          contentType: 'application/json',
          isFormData: false,
        });
        setSaved(true);
        setTimeout(() => router.push('/field'), 1500);
      } catch {
        setError(String(err) || 'Failed to save. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, padding: 32 }}>
        <div style={{ fontSize: 64 }}>✅</div>
        <h2 style={{ margin: 0, fontSize: 22, color: GREEN }}>Log Saved!</h2>
        <p style={{ margin: 0, color: DIM, fontSize: 14, textAlign: 'center' }}>
          {online ? 'Submitted to dashboard.' : 'Saved offline — will sync when connected.'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: DIM, fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Daily Log</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: DIM }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {projectName ? ` · ${projectName}` : ''}
        </p>
        {!online && (
          <div style={{ marginTop: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: RED }}>
            Offline — will sync when reconnected
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label style={{ display: 'block', fontSize: 12, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 }}>
              {f.label}
            </label>
            {f.type === 'textarea' ? (
              <textarea
                value={form[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                rows={4}
                style={inputStyle}
              />
            ) : f.type === 'select' ? (
              <select
                value={form[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                style={inputStyle}
              >
                {f.options?.map((o) => <option key={o} value={o} style={{ background: '#0f1d2b' }}>{o}</option>)}
              </select>
            ) : (
              <input
                type={f.type}
                value={form[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                inputMode={f.type === 'number' ? 'numeric' : undefined}
                style={inputStyle}
              />
            )}
          </div>
        ))}

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: RED, fontSize: 14 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          style={{
            background: saving ? '#1e3148' : GOLD,
            border: 'none',
            borderRadius: 14,
            padding: '18px',
            color: saving ? DIM : '#000',
            fontSize: 17,
            fontWeight: 800,
            cursor: saving ? 'wait' : 'pointer',
            letterSpacing: 0.5,
            marginTop: 4,
          }}
        >
          {saving ? 'Saving...' : online ? 'Submit Daily Log' : 'Save Offline'}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0f1d2b',
  border: '1px solid #1e3148',
  borderRadius: 10,
  padding: '14px 16px',
  color: '#e8edf8',
  fontSize: 16,
  outline: 'none',
  resize: 'vertical',
};
