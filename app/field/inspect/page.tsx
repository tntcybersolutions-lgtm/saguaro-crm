'use client';
/**
 * Saguaro Field — Inspection Checklist
 * Touch-optimized inspection form. Works offline via IndexedDB queue.
 */
import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0f1d2b';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const YELLOW = '#F59E0B';

const INSPECTION_TYPES = [
  'Foundation', 'Framing', 'Rough Electrical', 'Rough Plumbing', 'HVAC Rough',
  'Insulation', 'Drywall', 'Final Electrical', 'Final Plumbing', 'Final HVAC',
  'Fire & Life Safety', 'Structural', 'Building Final', 'Pre-Pour Concrete',
  'Roofing', 'Waterproofing', 'Site / Grading', 'ADA Compliance', 'Other',
];

const RESULTS = [
  { value: 'passed',           label: 'Passed',           color: GREEN,  emoji: '✅' },
  { value: 'failed',           label: 'Failed',           color: RED,    emoji: '❌' },
  { value: 'conditional_pass', label: 'Conditional Pass', color: YELLOW, emoji: '⚠️' },
  { value: 'pending',          label: 'Pending',          color: DIM,    emoji: '🕐' },
];

const CHECKLIST_ITEMS: Record<string, string[]> = {
  Foundation: ['Footing dimensions correct', 'Rebar placement approved', 'Moisture barrier in place', 'Anchor bolts positioned', 'Ready for pour'],
  Framing: ['Wall dimensions match plans', 'Header sizes correct', 'Shear panels installed', 'Blocking in place', 'Nail pattern correct', 'Stairway compliant'],
  'Rough Electrical': ['Wire gauge correct', 'Circuit breaker sizes', 'Ground fault protection', 'Box fill compliant', 'Service entrance secure'],
  'Rough Plumbing': ['Pipe sizes match specs', 'Slope correct (1/4" per ft)', 'Cleanouts accessible', 'Pressure test passed', 'Venting proper'],
  'Building Final': ['All systems operational', 'Certificate of occupancy ready', 'Fire safety complete', 'ADA accessible', 'Site clean', 'Punch list clear'],
};

function getDefaultChecklist(type: string): Array<{ item: string; checked: boolean; note: string }> {
  const items = CHECKLIST_ITEMS[type] || ['Inspection items reviewed', 'Documents on site', 'Work area safe', 'Ready for inspector'];
  return items.map((item) => ({ item, checked: false, note: '' }));
}

export default function FieldInspectPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [projectName, setProjectName] = useState('');
  const [inspType, setInspType] = useState('Foundation');
  const [result, setResult] = useState('pending');
  const [inspector, setInspector] = useState('');
  const [agency, setAgency] = useState('');
  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState(() => getDefaultChecklist('Foundation'));
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

  useEffect(() => {
    if (!projectId) return;
    fetch('/api/projects/list')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId);
        if (p) setProjectName(p.name);
      })
      .catch(() => {});
  }, [projectId]);

  const handleTypeChange = (type: string) => {
    setInspType(type);
    setChecklist(getDefaultChecklist(type));
  };

  const toggleCheck = (idx: number) => {
    setChecklist((prev) => prev.map((item, i) => i === idx ? { ...item, checked: !item.checked } : item));
  };

  const setItemNote = (idx: number, note: string) => {
    setChecklist((prev) => prev.map((item, i) => i === idx ? { ...item, note } : item));
  };

  const checkedCount = checklist.filter((c) => c.checked).length;
  const progress = checklist.length > 0 ? Math.round((checkedCount / checklist.length) * 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) { setError('No project selected. Go back and pick a project.'); return; }
    setSaving(true);
    setError('');

    const payload = {
      project_id: projectId,
      type: inspType,
      result,
      inspector_name: inspector,
      agency,
      notes,
      scheduled_date: new Date().toISOString().split('T')[0],
      checklist: JSON.stringify(checklist),
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/inspections/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => router.push('/field'), 1500);
    } catch {
      try {
        await enqueue({
          url: '/api/inspections/create',
          method: 'POST',
          body: JSON.stringify(payload),
          contentType: 'application/json',
          isFormData: false,
        });
        setSaved(true);
        setTimeout(() => router.push('/field'), 1500);
      } catch (err2) {
        setError(String(err2) || 'Failed to save.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, padding: 32 }}>
        <div style={{ fontSize: 64 }}>{RESULTS.find((r) => r.value === result)?.emoji || '✅'}</div>
        <h2 style={{ margin: 0, fontSize: 22, color: GREEN }}>Inspection Logged!</h2>
        <p style={{ margin: 0, color: DIM, fontSize: 14, textAlign: 'center' }}>
          {online ? 'Submitted to dashboard.' : 'Saved offline — will sync when connected.'}
        </p>
      </div>
    );
  }

  const selectedResult = RESULTS.find((r) => r.value === result)!;

  return (
    <div style={{ padding: '20px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: DIM, fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 8 }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Inspection</h1>
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

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Inspection type */}
        <div>
          <label style={labelStyle}>Inspection Type</label>
          <select
            value={inspType}
            onChange={(e) => handleTypeChange(e.target.value)}
            style={{ ...inputStyle, marginTop: 6 }}
          >
            {INSPECTION_TYPES.map((t) => (
              <option key={t} value={t} style={{ background: '#0f1d2b' }}>{t}</option>
            ))}
          </select>
        </div>

        {/* Inspector */}
        <div>
          <label style={labelStyle}>Inspector Name</label>
          <input
            type="text"
            value={inspector}
            onChange={(e) => setInspector(e.target.value)}
            placeholder="Inspector or agency representative"
            style={{ ...inputStyle, marginTop: 6 }}
          />
        </div>

        {/* Agency */}
        <div>
          <label style={labelStyle}>Agency / Authority</label>
          <input
            type="text"
            value={agency}
            onChange={(e) => setAgency(e.target.value)}
            placeholder="e.g. City of Phoenix Building Dept."
            style={{ ...inputStyle, marginTop: 6 }}
          />
        </div>

        {/* Checklist */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <label style={labelStyle}>Checklist</label>
            <span style={{ fontSize: 12, color: progress === 100 ? GREEN : DIM, fontWeight: 600 }}>
              {checkedCount}/{checklist.length} ({progress}%)
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: '#1e3148', borderRadius: 2, marginBottom: 12 }}>
            <div style={{ height: '100%', background: progress === 100 ? GREEN : GOLD, borderRadius: 2, width: `${progress}%`, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {checklist.map((item, idx) => (
              <div
                key={idx}
                style={{
                  background: item.checked ? 'rgba(34,197,94,0.06)' : RAISED,
                  border: `1px solid ${item.checked ? 'rgba(34,197,94,0.2)' : BORDER}`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  transition: 'all 0.15s',
                }}
              >
                <div
                  onClick={() => toggleCheck(idx)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                >
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: `2px solid ${item.checked ? GREEN : BORDER}`,
                    background: item.checked ? GREEN : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 0.15s',
                  }}>
                    {item.checked && <span style={{ color: '#000', fontSize: 16, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 15, color: item.checked ? DIM : TEXT, textDecoration: item.checked ? 'line-through' : 'none' }}>
                    {item.item}
                  </span>
                </div>
                {/* Note input — shown when checked with a note */}
                <input
                  type="text"
                  value={item.note}
                  onChange={(e) => setItemNote(idx, e.target.value)}
                  placeholder="Add a note..."
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: `1px solid ${BORDER}`,
                    color: DIM,
                    fontSize: 13,
                    padding: '4px 0',
                    outline: 'none',
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Result */}
        <div>
          <label style={labelStyle}>Result</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {RESULTS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setResult(r.value)}
                style={{
                  background: result === r.value ? `rgba(${hexToRgb(r.color)}, 0.15)` : 'transparent',
                  border: `2px solid ${result === r.value ? r.color : BORDER}`,
                  borderRadius: 10,
                  padding: '14px 8px',
                  color: result === r.value ? r.color : DIM,
                  fontSize: 14,
                  fontWeight: result === r.value ? 700 : 400,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'all 0.15s',
                }}
              >
                <span>{r.emoji}</span>
                <span>{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label style={labelStyle}>Notes / Comments</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional inspection notes, corrections required, follow-up actions..."
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', marginTop: 6 }}
          />
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: RED, fontSize: 14 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          style={{
            background: saving ? '#1e3148' : selectedResult.color,
            border: 'none',
            borderRadius: 14,
            padding: '18px',
            color: saving ? DIM : (result === 'pending' ? TEXT : '#000'),
            fontSize: 17,
            fontWeight: 800,
            cursor: saving ? 'wait' : 'pointer',
            letterSpacing: 0.5,
          }}
        >
          {saving ? 'Saving...' : `Submit — ${selectedResult.label} ${selectedResult.emoji}`}
        </button>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 12, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.7 };
const inputStyle: React.CSSProperties = { width: '100%', background: '#0f1d2b', border: '1px solid #1e3148', borderRadius: 10, padding: '14px 16px', color: '#e8edf8', fontSize: 16, outline: 'none' };

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}
