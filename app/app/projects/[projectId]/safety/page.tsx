'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface Incident {
  id: string;
  date: string;
  type: string;
  description: string;
  injured_party: string;
  severity: string;
  reported_by: string;
  status: string;
  project_id: string;
}

interface Inspection {
  id: string;
  date: string;
  inspector: string;
  type: string;
  result: string;
  items: number;
  notes: string;
  project_id: string;
}

const INCIDENT_FORM = { date: '', type: 'Near Miss', description: '', injured_party: 'None', severity: 'Near Miss', reported_by: '' };
const INSPECTION_FORM = { date: '', inspector: '', type: 'Site Safety Walk', result: 'Pass', items: 0, notes: '' };
const SEVERITIES = ['Near Miss','First Aid','Recordable','Lost Time'];
const INSPECTION_TYPES = ['Site Safety Walk','Toolbox Talk','OSHA Compliance','Equipment Inspection','Hazard Assessment'];

export default function SafetyPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [incidentForm, setIncidentForm] = useState(INCIDENT_FORM);
  const [inspectionForm, setInspectionForm] = useState(INSPECTION_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/safety`);
      const json = await res.json();
      setIncidents(json.incidents || []);
      setInspections(json.inspections || []);
    } catch {
      setIncidents([]);
      setInspections([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Days without incident
  const lastIncident = incidents.filter(i => i.severity !== 'Near Miss').sort((a, b) => b.date.localeCompare(a.date))[0];
  const daysWithout = lastIncident
    ? Math.floor((Date.now() - new Date(lastIncident.date).getTime()) / 86400000)
    : incidents.length > 0 ? Math.floor((Date.now() - new Date(incidents[0].date).getTime()) / 86400000) : 0;
  const totalYTD = incidents.filter(i => i.date.startsWith('2026')).length;
  const openActions = incidents.filter(i => i.status === 'Open').length;

  async function handleSaveIncident() {
    if (!incidentForm.description || !incidentForm.date) { setErrorMsg('Date and description required.'); return; }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/safety/incidents/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, status: 'Open', ...incidentForm }) });
      const json = await res.json();
      setIncidents(prev => [json.incident || { id: `i-${Date.now()}`, project_id: projectId, status: 'Open', ...incidentForm }, ...prev]);
    } catch {
      setIncidents(prev => [{ id: `i-${Date.now()}`, project_id: projectId, status: 'Open', ...incidentForm }, ...prev]);
    }
    setShowIncidentForm(false);
    setIncidentForm(INCIDENT_FORM);
    setSaving(false);
    setSuccessMsg('Incident reported.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleSaveInspection() {
    if (!inspectionForm.date || !inspectionForm.inspector) { setErrorMsg('Date and inspector required.'); return; }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/safety/inspections/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...inspectionForm }) });
      const json = await res.json();
      setInspections(prev => [json.inspection || { id: `ins-${Date.now()}`, project_id: projectId, ...inspectionForm }, ...prev]);
    } catch {
      setInspections(prev => [{ id: `ins-${Date.now()}`, project_id: projectId, ...inspectionForm }, ...prev]);
    }
    setShowInspectionForm(false);
    setInspectionForm(INSPECTION_FORM);
    setSaving(false);
    setSuccessMsg('Inspection logged.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };
  const sectionHead: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: TEXT, margin: '24px 24px 0', paddingBottom: 10, borderBottom: '1px solid ' + BORDER };

  const SEVERITY_COLORS: Record<string, string> = { 'Near Miss': '#f59e0b', 'First Aid': GOLD, Recordable: '#f97316', 'Lost Time': RED };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, background: DARK }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Safety</h2>
        <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Safety incidents, inspections, and OSHA records</div>
      </div>

      {/* KPIs */}
      <div style={{ padding: '20px 24px 0', display: 'flex', gap: 12 }}>
        {[
          { label: 'Days Without Incident', value: daysWithout, color: daysWithout > 30 ? GREEN : daysWithout > 7 ? GOLD : RED },
          { label: 'Incidents YTD', value: totalYTD, color: totalYTD === 0 ? GREEN : totalYTD < 3 ? GOLD : RED },
          { label: 'Open Actions', value: openActions, color: openActions === 0 ? GREEN : RED },
        ].map(k => (
          <div key={k.label} style={{ background: RAISED, borderRadius: 8, padding: '12px 20px', border: '1px solid ' + BORDER, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {/* Incidents Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...sectionHead }}>
        <span>Safety Incidents</span>
        <button onClick={() => { setShowIncidentForm(p => !p); setErrorMsg(''); setShowInspectionForm(false); }} style={{ padding: '7px 14px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>+ Report Incident</button>
      </div>

      {showIncidentForm && (
        <div style={{ margin: '0 24px 0', background: RAISED, border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: 24, marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: RED, marginBottom: 16 }}>Report Safety Incident</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div><label style={label}>Date *</label><SaguaroDatePicker value={incidentForm.date} onChange={v => setIncidentForm(p => ({ ...p, date: v }))} style={inp} /></div>
            <div><label style={label}>Type</label>
              <select value={incidentForm.type} onChange={e => setIncidentForm(p => ({ ...p, type: e.target.value }))} style={inp}>
                {['Near Miss','First Aid','Recordable','Lost Time','Property Damage'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={label}>Severity</label>
              <select value={incidentForm.severity} onChange={e => setIncidentForm(p => ({ ...p, severity: e.target.value }))} style={inp}>
                {SEVERITIES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div><label style={label}>Injured Party</label><input type="text" value={incidentForm.injured_party} onChange={e => setIncidentForm(p => ({ ...p, injured_party: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Reported By</label><input type="text" value={incidentForm.reported_by} onChange={e => setIncidentForm(p => ({ ...p, reported_by: e.target.value }))} style={inp} /></div>
            <div style={{ gridColumn: 'span 3' }}><label style={label}>Description *</label><textarea value={incidentForm.description} onChange={e => setIncidentForm(p => ({ ...p, description: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' }} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSaveIncident} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + RED + ',#f87171)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Report Incident'}
            </button>
            <button onClick={() => setShowIncidentForm(false)} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px', overflowX: 'auto' }}>
        {loading ? <div style={{ color: DIM }}>Loading...</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Date','Type','Description','Injured Party','Severity','Reported By','Status'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incidents.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '20px 14px', color: GREEN, textAlign: 'center' }}>No incidents recorded — great work!</td></tr>
              ) : incidents.map(i => (
                <tr key={i.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)' }}>
                  <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{i.date}</td>
                  <td style={{ padding: '10px 14px', color: TEXT }}>{i.type}</td>
                  <td style={{ padding: '10px 14px', color: TEXT }}>{i.description}</td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{i.injured_party}</td>
                  <td style={{ padding: '10px 14px' }}><span style={{ color: SEVERITY_COLORS[i.severity] || DIM, fontWeight: 700 }}>{i.severity}</span></td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{i.reported_by}</td>
                  <td style={{ padding: '10px 14px' }}><span style={{ padding: '3px 10px', borderRadius: 20, background: i.status === 'Resolved' ? 'rgba(61,214,140,.2)' : 'rgba(239,68,68,.2)', color: i.status === 'Resolved' ? GREEN : RED, fontSize: 11, fontWeight: 700 }}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Inspections Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...sectionHead }}>
        <span>Safety Inspections</span>
        <button onClick={() => { setShowInspectionForm(p => !p); setErrorMsg(''); setShowIncidentForm(false); }} style={{ padding: '7px 14px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>+ New Inspection</button>
      </div>

      {showInspectionForm && (
        <div style={{ margin: '0 24px 0', background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24, marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Log Safety Inspection</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div><label style={label}>Date *</label><SaguaroDatePicker value={inspectionForm.date} onChange={v => setInspectionForm(p => ({ ...p, date: v }))} style={inp} /></div>
            <div><label style={label}>Inspector *</label><input type="text" value={inspectionForm.inspector} onChange={e => setInspectionForm(p => ({ ...p, inspector: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Type</label>
              <select value={inspectionForm.type} onChange={e => setInspectionForm(p => ({ ...p, type: e.target.value }))} style={inp}>
                {INSPECTION_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={label}>Result</label>
              <select value={inspectionForm.result} onChange={e => setInspectionForm(p => ({ ...p, result: e.target.value }))} style={inp}>
                <option>Pass</option><option>Fail</option><option>Conditional</option>
              </select>
            </div>
            <div><label style={label}>Items Checked</label><input type="number" value={inspectionForm.items} onChange={e => setInspectionForm(p => ({ ...p, items: Number(e.target.value) }))} style={inp} /></div>
            <div><label style={label}>Notes</label><input type="text" value={inspectionForm.notes} onChange={e => setInspectionForm(p => ({ ...p, notes: e.target.value }))} style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSaveInspection} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Inspection'}
            </button>
            <button onClick={() => setShowInspectionForm(false)} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px 40px', overflowX: 'auto' }}>
        {!loading && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Date','Inspector','Type','Result','Items','Notes'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inspections.map(i => (
                <tr key={i.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)' }}>
                  <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{i.date}</td>
                  <td style={{ padding: '10px 14px', color: TEXT }}>{i.inspector}</td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{i.type}</td>
                  <td style={{ padding: '10px 14px' }}><span style={{ padding: '3px 10px', borderRadius: 20, background: i.result === 'Pass' ? 'rgba(61,214,140,.2)' : 'rgba(239,68,68,.2)', color: i.result === 'Pass' ? GREEN : RED, fontSize: 11, fontWeight: 700 }}>{i.result}</span></td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{i.items}</td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{i.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
