'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface TimeEntry {
  id: string;
  employee: string;
  mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number;
  cost_code: string;
  status: string;
  week_start: string;
  project_id: string;
}

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const;
const COST_CODES = ['01 - General Conditions','03 - Concrete','05 - Metals','06 - Wood & Plastics','07 - Thermal & Moisture','08 - Openings','09 - Finishes','22 - Plumbing','23 - HVAC','26 - Electrical','31 - Earthwork'];
const LABOR_RATE = 85;

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

const DEMO_ENTRIES: TimeEntry[] = [
  { id: 'ts-1', employee: 'Mike Torres', mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 4, sun: 0, cost_code: '06 - Wood & Plastics', status: 'Approved', week_start: getWeekStart(new Date()), project_id: '' },
  { id: 'ts-2', employee: 'Jose Morales', mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 8, sun: 0, cost_code: '06 - Wood & Plastics', status: 'Approved', week_start: getWeekStart(new Date()), project_id: '' },
  { id: 'ts-3', employee: 'David Kim', mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0, cost_code: '26 - Electrical', status: 'Submitted', week_start: getWeekStart(new Date()), project_id: '' },
  { id: 'ts-4', employee: 'Ana Rivera', mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0, cost_code: '09 - Finishes', status: 'Draft', week_start: getWeekStart(new Date()), project_id: '' },
];

const EMPTY_FORM: Omit<TimeEntry, 'id' | 'project_id'> = { employee: '', mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0, cost_code: '06 - Wood & Plastics', status: 'Draft', week_start: getWeekStart(new Date()) };

function totalHours(e: TimeEntry) { return e.mon + e.tue + e.wed + e.thu + e.fri + e.sat + e.sun; }

export default function TimesheetsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [currentWeek, setCurrentWeek] = useState(getWeekStart(new Date()));

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timesheets?week=${currentWeek}`);
      const json = await res.json();
      setEntries(json.entries?.length ? json.entries : DEMO_ENTRIES.map(e => ({ ...e, project_id: projectId, week_start: currentWeek })));
    } catch {
      setEntries(DEMO_ENTRIES.map(e => ({ ...e, project_id: projectId, week_start: currentWeek })));
    } finally {
      setLoading(false);
    }
  }, [projectId, currentWeek]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  function shiftWeek(n: number) {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + n * 7);
    setCurrentWeek(d.toISOString().split('T')[0]);
  }

  async function handleSave() {
    if (!form.employee) { setErrorMsg('Employee name is required.'); return; }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/timesheets/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...form }) });
      const json = await res.json();
      setEntries(prev => [...prev, json.entry || { id: `ts-${Date.now()}`, project_id: projectId, ...form }]);
    } catch {
      setEntries(prev => [...prev, { id: `ts-${Date.now()}`, project_id: projectId, ...form }]);
    }
    setShowForm(false);
    setForm({ ...EMPTY_FORM, week_start: currentWeek });
    setSaving(false);
    setSuccessMsg('Timesheet entry added.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleSubmitWeek() {
    try {
      await fetch('/api/timesheets/submit-week', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, week_start: currentWeek }) });
    } catch { /* demo */ }
    setEntries(prev => prev.map(e => e.status === 'Draft' ? { ...e, status: 'Submitted' } : e));
    setSuccessMsg('Week submitted for approval.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  const totalWeekHours = entries.reduce((s, e) => s + totalHours(e), 0);
  const totalLaborCost = totalWeekHours * LABOR_RATE;

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };
  const numInp: React.CSSProperties = { width: '100%', padding: '6px 4px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 4, color: TEXT, fontSize: 12, textAlign: 'center' };

  const STATUS_COLORS: Record<string, string> = { Draft: DIM, Submitted: '#60a5fa', Approved: GREEN };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Timesheets</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Weekly crew timesheets and labor hours</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSubmitWeek} style={{ padding: '8px 14px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Submit Week</button>
          <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ Add Entry</button>
        </div>
      </div>

      {/* Week picker */}
      <div style={{ padding: '16px 24px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => shiftWeek(-1)} style={{ padding: '6px 14px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 6, color: DIM, cursor: 'pointer', fontSize: 13 }}>Prev Week</button>
        <div style={{ background: RAISED, padding: '8px 16px', borderRadius: 7, border: '1px solid ' + BORDER }}>
          <span style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>Week of {currentWeek}</span>
        </div>
        <button onClick={() => shiftWeek(1)} style={{ padding: '6px 14px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 6, color: DIM, cursor: 'pointer', fontSize: 13 }}>Next Week</button>
      </div>

      {/* Summary */}
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 12 }}>
        {[
          { label: 'Total Hours This Week', value: `${totalWeekHours}h`, color: GOLD },
          { label: 'Total Labor Cost', value: `$${totalLaborCost.toLocaleString()}`, color: GREEN },
          { label: 'Employees', value: entries.length, color: TEXT },
        ].map(k => (
          <div key={k.label} style={{ background: RAISED, borderRadius: 8, padding: '12px 20px', border: '1px solid ' + BORDER }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
        <div style={{ marginLeft: 8, fontSize: 11, color: DIM, alignSelf: 'center' }}>Rate: ${LABOR_RATE}/hr</div>
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Add Timesheet Entry</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div><label style={label}>Employee Name *</label><input type="text" value={form.employee} onChange={e => setForm(p => ({ ...p, employee: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Cost Code</label>
              <select value={form.cost_code} onChange={e => setForm(p => ({ ...p, cost_code: e.target.value }))} style={inp}>
                {COST_CODES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div />
            <div style={{ gridColumn: 'span 3' }}>
              <label style={label}>Hours by Day</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                {DAYS.map(day => (
                  <div key={day}>
                    <div style={{ fontSize: 11, color: DIM, textAlign: 'center', marginBottom: 4 }}>{day}</div>
                    <input type="number" min={0} max={24} value={form[day.toLowerCase() as DayKey]} onChange={e => setForm(p => ({ ...p, [day.toLowerCase()]: Number(e.target.value) }))} style={numInp} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: GOLD }}>Total: {DAYS.reduce((s, d) => s + (form[d.toLowerCase() as DayKey] || 0), 0)}h</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Entry'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px 40px', overflowX: 'auto' }}>
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Employee','Mon','Tue','Wed','Thu','Fri','Sat','Sun','Total Hrs','Cost Code','Status'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const tot = totalHours(e);
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)' }}>
                    <td style={{ padding: '10px 12px', color: TEXT, fontWeight: 600, textAlign: 'left' }}>{e.employee}</td>
                    {DAYS.map(d => <td key={d} style={{ padding: '10px 12px', color: DIM, textAlign: 'center' }}>{e[d.toLowerCase() as DayKey] || 0}</td>)}
                    <td style={{ padding: '10px 12px', color: GOLD, fontWeight: 800, textAlign: 'center' }}>{tot}h</td>
                    <td style={{ padding: '10px 12px', color: DIM, fontSize: 12, textAlign: 'left' }}>{e.cost_code}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}><span style={{ padding: '3px 10px', borderRadius: 20, background: STATUS_COLORS[e.status] + '33', color: STATUS_COLORS[e.status], fontSize: 11, fontWeight: 700 }}>{e.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
