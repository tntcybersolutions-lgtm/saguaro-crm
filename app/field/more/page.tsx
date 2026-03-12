'use client';
/**
 * Saguaro Field — More
 * Timesheet entry, RFI filing, safety incident reporting.
 */
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0f1d2b';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';

type Panel = null | 'timesheet' | 'rfi' | 'safety';

const COST_CODES = [
  'General Conditions', 'Concrete', 'Masonry', 'Metals / Structural', 'Carpentry',
  'Thermal & Moisture', 'Openings', 'Finishes', 'Electrical', 'Plumbing',
  'HVAC / Mechanical', 'Earthwork / Site', 'Specialties', 'Equipment', 'Other',
];
const SEVERITY = ['Minor', 'Moderate', 'Serious', 'Critical'];
const INJURY_TYPES = ['No Injury', 'First Aid', 'Medical Treatment', 'Lost Time', 'Fatality'];
const SPEC_SECTIONS = ['Division 01 – Gen. Requirements', 'Division 03 – Concrete', 'Division 04 – Masonry', 'Division 05 – Metals', 'Division 06 – Wood & Plastics', 'Division 07 – Thermal', 'Division 08 – Openings', 'Division 09 – Finishes', 'Division 22 – Plumbing', 'Division 23 – HVAC', 'Division 26 – Electrical', 'Other'];

function MorePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';
  const openPanel = (searchParams.get('panel') as Panel) || null;

  const [online, setOnline] = useState(true);
  const [panel, setPanel] = useState<Panel>(openPanel);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // Timesheet
  const [tsEmployee, setTsEmployee] = useState('');
  const [tsHours, setTsHours] = useState('');
  const [tsCostCode, setTsCostCode] = useState('General Conditions');
  const [tsNotes, setTsNotes] = useState('');

  // RFI
  const [rfiSubject, setRfiSubject] = useState('');
  const [rfiQuestion, setRfiQuestion] = useState('');
  const [rfiSpec, setRfiSpec] = useState('Other');
  const [rfiDueDate, setRfiDueDate] = useState('');

  // Safety
  const [safetyDesc, setSafetyDesc] = useState('');
  const [safetySeverity, setSafetySeverity] = useState('Minor');
  const [safetyInjury, setSafetyInjury] = useState('No Injury');
  const [safetyLocation, setSafetyLocation] = useState('');
  const [safetyReported, setSafetyReported] = useState('');

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const showSaved = (msg: string) => {
    setSavedMsg(msg);
    setPanel(null);
    setTimeout(() => setSavedMsg(''), 3500);
  };

  // ── Submit Timesheet ──
  const submitTimesheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tsEmployee.trim()) return;
    setSaving(true);
    const payload = {
      project_id: projectId,
      employee_name: tsEmployee.trim(),
      hours: parseFloat(tsHours) || 0,
      cost_code: tsCostCode,
      work_date: new Date().toISOString().split('T')[0],
      notes: tsNotes.trim(),
    };
    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/timesheets/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Failed');
      showSaved('Timesheet entry saved!');
    } catch {
      await enqueue({ url: '/api/timesheets/create', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      showSaved('Timesheet queued — will sync when online.');
    }
    setSaving(false);
  };

  // ── Submit RFI ──
  const submitRFI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfiSubject.trim() || !rfiQuestion.trim()) return;
    setSaving(true);
    const payload = { projectId, subject: rfiSubject.trim(), question: rfiQuestion.trim(), specSection: rfiSpec, dueDate: rfiDueDate || null };
    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/rfis/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Failed');
      showSaved('RFI filed successfully!');
    } catch {
      await enqueue({ url: '/api/rfis/create', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      showSaved('RFI queued — will sync when online.');
    }
    setSaving(false);
  };

  // ── Submit Safety ──
  const submitSafety = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!safetyDesc.trim()) return;
    setSaving(true);
    const payload = {
      project_id: projectId,
      description: safetyDesc.trim(),
      severity: safetySeverity,
      injury_type: safetyInjury,
      location: safetyLocation.trim(),
      reported_to: safetyReported.trim(),
      incident_date: new Date().toISOString().split('T')[0],
      type: 'incident',
    };
    try {
      if (!online) throw new Error('offline');
      // POST to inspections endpoint with type=incident (best available)
      const res = await fetch('/api/inspections/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Failed');
      showSaved('Safety incident logged!');
    } catch {
      await enqueue({ url: '/api/inspections/create', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      showSaved('Safety report queued — will sync when online.');
    }
    setSaving(false);
  };

  const MENU_ITEMS = [
    { id: 'timesheet', emoji: '⏱', label: 'Timesheet Entry', desc: 'Log hours for any crew member', color: AMBER,  bg: 'rgba(245,158,11,.1)',   border: 'rgba(245,158,11,.25)' },
    { id: 'rfi',       emoji: '❓', label: 'File an RFI',      desc: 'Request for information from office', color: PURPLE, bg: 'rgba(139,92,246,.1)',  border: 'rgba(139,92,246,.25)' },
    { id: 'safety',    emoji: '🦺', label: 'Safety Incident',  desc: 'Log near miss, injury or hazard', color: RED,    bg: 'rgba(239,68,68,.1)',   border: 'rgba(239,68,68,.25)' },
  ];

  const DESKTOP_LINKS = [
    { emoji: '📁', label: 'All Projects',       href: '/app/projects' },
    { emoji: '💰', label: 'Bids & Proposals',   href: '/app/bids' },
    { emoji: '📄', label: 'Documents',           href: '/app/documents' },
    { emoji: '📊', label: 'Reports',             href: '/app/reports' },
    { emoji: '🤖', label: 'AI Autopilot',        href: '/app/autopilot' },
    { emoji: '📐', label: 'AI Takeoff',          href: '/app/takeoff' },
  ];

  return (
    <div style={{ padding: '18px 16px' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: TEXT }}>More</h1>
      <p style={{ margin: '0 0 18px', fontSize: 14, color: DIM }}>Additional field tools</p>

      {/* Success toast */}
      {savedMsg && (
        <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: GREEN, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          ✅ {savedMsg}
        </div>
      )}

      {!online && (
        <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: RED, fontWeight: 600 }}>
          Offline — submissions will queue and sync automatically
        </div>
      )}

      {/* Action cards */}
      {panel === null && (
        <>
          <p style={secLabel}>Field Tools</p>
          {MENU_ITEMS.map((m) => (
            <button
              key={m.id}
              onClick={() => setPanel(m.id as Panel)}
              style={{ width: '100%', background: m.bg, border: `1px solid ${m.border}`, borderRadius: 14, padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', marginBottom: 10, textAlign: 'left' }}
            >
              <div style={{ width: 50, height: 50, borderRadius: 12, background: `rgba(${hexRgb(m.color)}, .15)`, border: `1px solid rgba(${hexRgb(m.color)}, .3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>{m.emoji}</div>
              <div>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: m.color }}>{m.label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: DIM }}>{m.desc}</p>
              </div>
              <span style={{ marginLeft: 'auto', color: DIM, fontSize: 18 }}>›</span>
            </button>
          ))}

          <p style={{ ...secLabel, marginTop: 20 }}>Desktop Modules</p>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
            {DESKTOP_LINKS.map((l, i) => (
              <a
                key={l.href}
                href={l.href}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < DESKTOP_LINKS.length - 1 ? `1px solid ${BORDER}` : 'none', color: TEXT, textDecoration: 'none', fontSize: 15 }}
              >
                <span style={{ fontSize: 20 }}>{l.emoji}</span>
                <span style={{ fontWeight: 600 }}>{l.label}</span>
                <span style={{ marginLeft: 'auto', color: DIM }}>›</span>
              </a>
            ))}
          </div>
        </>
      )}

      {/* ── Timesheet Panel ── */}
      {panel === 'timesheet' && (
        <form onSubmit={submitTimesheet}>
          <button type="button" onClick={() => setPanel(null)} style={backBtn}>← Back</button>
          <h2 style={{ margin: '0 0 14px', fontSize: 20, fontWeight: 800, color: AMBER }}>⏱ Timesheet Entry</h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM }}>Log hours for a crew member on {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>

          <Sec label="Crew Member">
            <Fld label="Employee Name *">
              <input value={tsEmployee} onChange={(e) => setTsEmployee(e.target.value)} placeholder="Full name" style={inp} required />
            </Fld>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Fld label="Hours Worked">
                <input type="number" inputMode="decimal" step="0.5" min="0" max="24" value={tsHours} onChange={(e) => setTsHours(e.target.value)} placeholder="e.g. 8.5" style={inp} />
              </Fld>
              <Fld label="Cost Code">
                <select value={tsCostCode} onChange={(e) => setTsCostCode(e.target.value)} style={inp}>
                  {COST_CODES.map((c) => <option key={c} value={c} style={{ background: '#0f1d2b' }}>{c}</option>)}
                </select>
              </Fld>
            </div>
            <Fld label="Notes">
              <input value={tsNotes} onChange={(e) => setTsNotes(e.target.value)} placeholder="Work area, task, overtime reason..." style={inp} />
            </Fld>
          </Sec>

          <SubmitBtn saving={saving} label="Save Timesheet" online={online} color={AMBER} />
        </form>
      )}

      {/* ── RFI Panel ── */}
      {panel === 'rfi' && (
        <form onSubmit={submitRFI}>
          <button type="button" onClick={() => setPanel(null)} style={backBtn}>← Back</button>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: PURPLE }}>❓ File an RFI</h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM }}>Request for information — office will respond in the dashboard</p>

          <Sec label="RFI Details">
            <Fld label="Subject *">
              <input value={rfiSubject} onChange={(e) => setRfiSubject(e.target.value)} placeholder="Brief description of the question" style={inp} required />
            </Fld>
            <Fld label="Question / Description *">
              <textarea value={rfiQuestion} onChange={(e) => setRfiQuestion(e.target.value)} placeholder="Describe the issue, what clarification you need, and any field conditions..." rows={5} style={inp} required />
            </Fld>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Fld label="Spec Section">
                <select value={rfiSpec} onChange={(e) => setRfiSpec(e.target.value)} style={inp}>
                  {SPEC_SECTIONS.map((s) => <option key={s} value={s} style={{ background: '#0f1d2b' }}>{s}</option>)}
                </select>
              </Fld>
              <Fld label="Response Needed By">
                <input type="date" value={rfiDueDate} onChange={(e) => setRfiDueDate(e.target.value)} style={inp} />
              </Fld>
            </div>
          </Sec>

          <SubmitBtn saving={saving} label="File RFI" online={online} color={PURPLE} />
        </form>
      )}

      {/* ── Safety Panel ── */}
      {panel === 'safety' && (
        <form onSubmit={submitSafety}>
          <button type="button" onClick={() => setPanel(null)} style={backBtn}>← Back</button>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: RED }}>🦺 Safety Incident</h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM }}>Log any near miss, injury, hazard, or safety observation</p>

          <Sec label="Incident Details">
            <Fld label="What Happened *">
              <textarea value={safetyDesc} onChange={(e) => setSafetyDesc(e.target.value)} placeholder="Describe the incident, near miss, or hazard in detail. Include what caused it and what was done immediately..." rows={5} style={inp} required />
            </Fld>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Fld label="Severity">
                <select value={safetySeverity} onChange={(e) => setSafetySeverity(e.target.value)} style={inp}>
                  {SEVERITY.map((s) => <option key={s} value={s} style={{ background: '#0f1d2b' }}>{s}</option>)}
                </select>
              </Fld>
              <Fld label="Injury Type">
                <select value={safetyInjury} onChange={(e) => setSafetyInjury(e.target.value)} style={inp}>
                  {INJURY_TYPES.map((s) => <option key={s} value={s} style={{ background: '#0f1d2b' }}>{s}</option>)}
                </select>
              </Fld>
            </div>
            <Fld label="Location on Site">
              <input value={safetyLocation} onChange={(e) => setSafetyLocation(e.target.value)} placeholder="e.g. Level 3 east stairwell" style={inp} />
            </Fld>
            <Fld label="Reported To">
              <input value={safetyReported} onChange={(e) => setSafetyReported(e.target.value)} placeholder="Supervisor / PM name" style={inp} />
            </Fld>
          </Sec>

          {safetySeverity === 'Critical' && (
            <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 14, color: RED, fontWeight: 600 }}>
              ⛔ Critical incident — call 911 if needed. Notify PM, safety officer, and owner immediately. OSHA 300 log may be required.
            </div>
          )}

          <SubmitBtn saving={saving} label="Report Incident" online={online} color={RED} />
        </form>
      )}
    </div>
  );
}

export default function FieldMorePage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8fa3c0', textAlign: 'center' }}>Loading...</div>}><MorePage /></Suspense>;
}

// ── Shared helpers ────────────────────────────────────────
function Sec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#0f1d2b', border: '1px solid #1e3148', borderRadius: 14, padding: '14px 14px 6px', marginBottom: 12 }}>
      <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#8fa3c0', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</p>
      {children}
    </div>
  );
}
function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}><label style={{ display: 'block', fontSize: 12, color: '#8fa3c0', marginBottom: 4 }}>{label}</label>{children}</div>;
}
function SubmitBtn({ saving, label, online, color }: { saving: boolean; label: string; online: boolean; color: string }) {
  return (
    <button
      type="submit"
      disabled={saving}
      style={{ width: '100%', background: saving ? '#1e3148' : color, border: 'none', borderRadius: 14, padding: '18px', color: saving ? '#8fa3c0' : (color === '#EF4444' || color === '#8B5CF6' ? '#fff' : '#000'), fontSize: 17, fontWeight: 800, cursor: saving ? 'wait' : 'pointer', marginTop: 4 }}
    >
      {saving ? 'Saving...' : online ? `✓ ${label}` : `💾 ${label} (Offline)`}
    </button>
  );
}

const inp: React.CSSProperties = { width: '100%', background: '#09111A', border: '1px solid #1e3148', borderRadius: 10, padding: '11px 14px', color: '#e8edf8', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8fa3c0', fontSize: 14, cursor: 'pointer', padding: '0 0 12px', display: 'block' };
const secLabel: React.CSSProperties = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#8fa3c0', textTransform: 'uppercase', letterSpacing: 0.8 };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
