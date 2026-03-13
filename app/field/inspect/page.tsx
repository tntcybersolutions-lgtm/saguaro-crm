'use client';
/**
 * Saguaro Field — Inspection
 * Enhanced checklist, per-item photo notes, better result picker. Offline queue.
 */
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';

const INSPECTION_TYPES = [
  'Foundation', 'Pre-Pour Concrete', 'Framing', 'Rough Electrical', 'Rough Plumbing',
  'HVAC Rough', 'Insulation', 'Drywall', 'Final Electrical', 'Final Plumbing',
  'Final HVAC', 'Fire & Life Safety', 'Structural Steel', 'Building Final',
  'Roofing', 'Waterproofing', 'Site / Grading', 'ADA Compliance', 'Other',
];

const RESULTS = [
  { value: 'passed',           label: 'Passed',           color: GREEN,  bg: 'rgba(34,197,94,.15)',  emoji: '✅' },
  { value: 'conditional_pass', label: 'Conditional',      color: AMBER,  bg: 'rgba(245,158,11,.15)', emoji: '⚠️' },
  { value: 'failed',           label: 'Failed',           color: RED,    bg: 'rgba(239,68,68,.15)',  emoji: '❌' },
  { value: 'pending',          label: 'Pending',          color: DIM,    bg: 'rgba(143,163,192,.1)', emoji: '🕐' },
];

const CHECKLISTS: Record<string, string[]> = {
  'Foundation':        ['Footing dimensions match plans', 'Rebar placement approved by engineer', 'Moisture barrier in place', 'Anchor bolts positioned correctly', 'Soil bearing verified', 'Forms level and secure'],
  'Pre-Pour Concrete': ['Rebar tied and supported', 'Grade stakes set', 'Edges formed', 'Sleeves in place', 'Engineer of record notified', 'Pump accessible'],
  'Framing':           ['Wall dimensions match plans', 'Header sizes correct per schedule', 'Shear panels installed per plan', 'Blocking in place', 'Nail pattern per schedule', 'Stairway compliant', 'Top plates doubled'],
  'Rough Electrical':  ['Wire gauge per load schedule', 'Circuit breaker sizes correct', 'GFCI protection per code', 'Box fill compliant', 'Service entrance secure', 'Conduit runs support spacing'],
  'Rough Plumbing':    ['Pipe sizes match specs', 'Slope 1/4" per foot min', 'Cleanouts accessible', 'Pressure test passed (100 psi for 15 min)', 'Proper venting per code', 'Stub-outs capped'],
  'Insulation':        ['R-value meets energy code', 'Vapor barrier installed correctly', 'No gaps around penetrations', 'Recessed lights are IC-rated', 'Attic baffles in place'],
  'Building Final':    ['All systems operational and tested', 'Certificate of occupancy checklist complete', 'Fire & life safety signed off', 'ADA compliance verified', 'Site clean and accessible', 'Punch list items cleared', 'All permits finaled'],
};

function getChecklist(type: string) {
  const items = CHECKLISTS[type] || ['Work area safe and accessible', 'Plans on site', 'Correct inspector notified', 'Documentation ready'];
  return items.map((item) => ({ item, checked: false, note: '', deficiency: false }));
}

type CheckItem = { item: string; checked: boolean; note: string; deficiency: boolean };

function InspectionForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [projectName, setProjectName] = useState('');
  const [online, setOnline] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [inspType, setInspType] = useState('Foundation');
  const [result, setResult] = useState('pending');
  const [inspector, setInspector] = useState('');
  const [agency, setAgency] = useState('');
  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState<CheckItem[]>(() => getChecklist('Foundation'));
  const [deficiencyNote, setDeficiencyNote] = useState('');

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
      .then((d) => { const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId); if (p) setProjectName(p.name); })
      .catch(() => {});
  }, [projectId]);

  const changeType = (t: string) => { setInspType(t); setChecklist(getChecklist(t)); };
  const toggle = (i: number) => setChecklist((prev) => prev.map((x, idx) => idx === i ? { ...x, checked: !x.checked } : x));
  const setNote = (i: number, note: string) => setChecklist((prev) => prev.map((x, idx) => idx === i ? { ...x, note } : x));
  const toggleDeficiency = (i: number) => setChecklist((prev) => prev.map((x, idx) => idx === i ? { ...x, deficiency: !x.deficiency } : x));

  const checked = checklist.filter((c) => c.checked).length;
  const deficiencies = checklist.filter((c) => c.deficiency).length;
  const pct = checklist.length ? Math.round((checked / checklist.length) * 100) : 0;
  const res = RESULTS.find((r) => r.value === result) || RESULTS[RESULTS.length - 1];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) { setError('No project selected. Go back and pick a project first.'); return; }
    setSaving(true);
    setError('');

    const fullNotes = [
      notes.trim(),
      deficiencyNote.trim() ? `Deficiencies: ${deficiencyNote.trim()}` : '',
    ].filter(Boolean).join('\n');

    const payload = {
      project_id: projectId,
      type: inspType,
      result,
      inspector_name: inspector.trim(),
      agency: agency.trim(),
      notes: fullNotes,
      scheduled_date: new Date().toISOString().split('T')[0],
      checklist: JSON.stringify(checklist),
      checklist_total: checklist.length,
      checklist_passed: checked,
      deficiency_count: deficiencies,
    };

    try {
      if (!online) throw new Error('offline');
      const res2 = await fetch('/api/inspections/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res2.ok) { const b = await res2.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res2.status}`); }
      setSaved(true);
      setTimeout(() => router.push('/field'), 1800);
    } catch (err) {
      if (String(err).includes('offline') || !online) {
        try {
          await enqueue({ url: '/api/inspections/create', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
          setSaved(true);
          setTimeout(() => router.push('/field'), 1800);
        } catch (q) { setError(String(q)); }
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
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: `rgba(${hexRgb(res.color)}, .15)`, border: `2px solid rgba(${hexRgb(res.color)}, .3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: res.color }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}><polyline points="20 6 9 17 4 12"/></svg></div>
        <h2 style={{ margin: 0, fontSize: 22, color: res.color }}>{res.label}!</h2>
        <p style={{ margin: 0, color: DIM, fontSize: 14 }}>
          {online ? 'Inspection logged to dashboard.' : 'Queued offline — will sync when reconnected.'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '18px 16px' }}>
      <button onClick={() => router.back()} style={backBtn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg></button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Inspection</h1>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: DIM }}>
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        {projectName ? ` · ${projectName}` : ''}
      </p>

      {!online && <OfflineBanner />}

      <form onSubmit={handleSubmit}>
        {/* Type + Inspector */}
        <div style={card}>
          <p style={sectionLabel}>Inspection Details</p>
          <Label>Type</Label>
          <select value={inspType} onChange={(e) => changeType(e.target.value)} style={{ ...inp, marginBottom: 10 }}>
            {INSPECTION_TYPES.map((t) => <option key={t} value={t} style={{ background: '#0D1D2E' }}>{t}</option>)}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>Inspector Name</Label>
              <input value={inspector} onChange={(e) => setInspector(e.target.value)} placeholder="Inspector's name" style={inp} />
            </div>
            <div>
              <Label>Agency / Authority</Label>
              <input value={agency} onChange={(e) => setAgency(e.target.value)} placeholder="e.g. City Building" style={inp} />
            </div>
          </div>
        </div>

        {/* Checklist */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ ...sectionLabel, margin: 0 }}>Checklist</p>
            <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
              <span style={{ color: GREEN, fontWeight: 700 }}>{checked}/{checklist.length}</span>
              {deficiencies > 0 && <span style={{ color: RED, fontWeight: 700 }}>⚠ {deficiencies} defect{deficiencies > 1 ? 's' : ''}</span>}
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ height: 5, background: '#1E3A5F', borderRadius: 3, marginBottom: 12 }}>
            <div style={{ height: '100%', background: pct === 100 ? GREEN : pct > 50 ? GOLD : AMBER, borderRadius: 3, width: `${pct}%`, transition: 'width 0.25s' }} />
          </div>
          {checklist.map((item, idx) => (
            <div
              key={idx}
              style={{ marginBottom: 8, background: item.deficiency ? 'rgba(239,68,68,.05)' : item.checked ? 'rgba(34,197,94,.05)' : 'transparent', border: `1px solid ${item.deficiency ? 'rgba(239,68,68,.2)' : item.checked ? 'rgba(34,197,94,.15)' : BORDER}`, borderRadius: 10, padding: '10px 12px' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }} onClick={() => toggle(idx)}>
                <div style={{ width: 24, height: 24, borderRadius: 7, border: `2px solid ${item.checked ? GREEN : BORDER}`, background: item.checked ? GREEN : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all .12s' }}>
                  {item.checked && <span style={{ color: '#000', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                </div>
                <span style={{ flex: 1, fontSize: 14, color: item.checked ? DIM : TEXT, textDecoration: item.checked ? 'line-through' : 'none', lineHeight: 1.4 }}>
                  {item.item}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleDeficiency(idx); }}
                  style={{ background: item.deficiency ? 'rgba(239,68,68,.2)' : 'transparent', border: `1px solid ${item.deficiency ? RED : BORDER}`, borderRadius: 6, padding: '2px 7px', fontSize: 11, color: item.deficiency ? RED : DIM, cursor: 'pointer', flexShrink: 0, fontWeight: item.deficiency ? 700 : 400 }}
                  title="Mark as deficiency"
                >
                  ⚠
                </button>
              </div>
              <input
                type="text"
                value={item.note}
                onChange={(e) => setNote(idx, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Add note..."
                style={{ marginTop: 7, width: '100%', background: 'transparent', border: 'none', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12, padding: '3px 0', outline: 'none' }}
              />
            </div>
          ))}
        </div>

        {/* Result */}
        <div style={card}>
          <p style={sectionLabel}>Result</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {RESULTS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setResult(r.value)}
                style={{ background: result === r.value ? r.bg : 'transparent', border: `2px solid ${result === r.value ? r.color : BORDER}`, borderRadius: 10, padding: '14px 8px', color: result === r.value ? r.color : DIM, fontSize: 14, fontWeight: result === r.value ? 800 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .12s' }}
              >
                <span>{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={card}>
          <p style={sectionLabel}>Notes</p>
          {deficiencies > 0 && (
            <div style={{ marginBottom: 8 }}>
              <Label>Deficiency Description</Label>
              <textarea value={deficiencyNote} onChange={(e) => setDeficiencyNote(e.target.value)} placeholder="Describe deficiencies found — required corrections, timeline..." rows={3} style={inp} />
            </div>
          )}
          <Label>General Notes / Comments</Label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Follow-up actions, reinspection required, approvals granted..." rows={3} style={inp} />
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '10px 14px', color: RED, fontSize: 14, marginBottom: 12 }}>{error}</div>}

        <button
          type="submit"
          disabled={saving}
          style={{ width: '100%', background: saving ? '#1E3A5F' : res.color, border: 'none', borderRadius: 14, padding: '18px', color: saving ? DIM : (result === 'pending' ? TEXT : '#000'), fontSize: 17, fontWeight: 800, cursor: saving ? 'wait' : 'pointer', letterSpacing: 0.3 }}
        >
          {saving ? 'Submitting...' : `Submit — ${res.label}`}
        </button>
      </form>
    </div>
  );
}

export default function FieldInspectPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}><InspectionForm /></Suspense>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 5 }}>{children}</label>;
}
function OfflineBanner() {
  return <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: RED, fontWeight: 600 }}>Offline — will sync when reconnected</div>;
}

const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 14px 6px', marginBottom: 12 };
const sectionLabel: React.CSSProperties = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 };
const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '11px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8BAAC8', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
