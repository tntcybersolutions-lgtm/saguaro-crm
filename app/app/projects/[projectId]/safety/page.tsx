'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T } from '@/components/ui/shell';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

interface Incident {
  id: string;
  date: string;
  type: string;
  description: string;
  severity: string;
  corrective_action: string;
  status: string;
  project_id: string;
}

interface CorrectiveAction {
  id: string;
  description: string;
  assigned_to: string;
  due_date: string;
  status: string;
  verification_date?: string;
  verified_by?: string;
  incident_id?: string;
  created_at?: string;
  project_id?: string;
}

const TYPES = ['Near Miss', 'First Aid', 'Recordable', 'Lost Time'];

const SEVERITY_BADGE: Record<string, 'amber' | 'gold' | 'red' | 'muted'> = {
  'Near Miss': 'amber',
  'First Aid': 'gold',
  'Recordable': 'red',
  'Lost Time': 'red',
};

const STATUS_BADGE: Record<string, 'red' | 'green' | 'muted'> = {
  Open: 'red',
  Resolved: 'green',
};

const CA_STATUS_BADGE: Record<string, 'red' | 'amber' | 'gold' | 'green' | 'muted'> = {
  open: 'red',
  in_progress: 'amber',
  verified: 'gold',
  closed: 'green',
};

const CA_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  verified: 'Verified',
  closed: 'Closed',
};

const CA_STATUS_FLOW: Record<string, string> = {
  open: 'in_progress',
  in_progress: 'verified',
  verified: 'closed',
};

const EMPTY_FORM = { date: '', type: 'Near Miss', description: '', severity: 'Near Miss', corrective_action: '' };

const EMPTY_CA_FORM = { description: '', assigned_to: '', due_date: '' };

export default function SafetyPage() {
  const { projectId } = useParams() as { projectId: string };
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Corrective Actions state
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [showCAForm, setShowCAForm] = useState(false);
  const [caForm, setCaForm] = useState(EMPTY_CA_FORM);
  const [caSaving, setCaSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/safety`);
      const json = await res.json();
      setIncidents(json.incidents || []);
    } catch {
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchActions = useCallback(async () => {
    setActionsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/safety/corrective-actions`);
      const json = await res.json();
      setActions(json.actions || []);
    } catch {
      setActions([]);
    } finally {
      setActionsLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); fetchActions(); }, [fetchData, fetchActions]);

  const totalIncidents = incidents.length;
  const openCount = incidents.filter(i => i.status === 'Open').length;
  const resolvedCount = incidents.filter(i => i.status === 'Resolved').length;

  const openActionsCount = actions.filter(a => a.status === 'open' || a.status === 'in_progress').length;
  const overdueActionsCount = actions.filter(a => {
    if (a.status === 'closed' || a.status === 'verified') return false;
    if (!a.due_date) return false;
    return new Date(a.due_date) < new Date();
  }).length;

  const lastIncident = incidents
    .filter(i => i.severity !== 'Near Miss')
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const daysSinceLast = lastIncident
    ? Math.floor((Date.now() - new Date(lastIncident.date).getTime()) / 86400000)
    : incidents.length > 0
      ? Math.floor((Date.now() - new Date(incidents[0].date).getTime()) / 86400000)
      : 0;

  async function handleSave() {
    if (!form.description || !form.date) { setErrorMsg('Date and description are required.'); return; }
    setSaving(true);
    setErrorMsg('');
    let newIncident: Incident;
    try {
      const res = await fetch('/api/safety/incidents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, status: 'Open', ...form }),
      });
      const json = await res.json();
      newIncident = json.incident || { id: `i-${Date.now()}`, project_id: projectId, status: 'Open', ...form };
      setIncidents(prev => [newIncident, ...prev]);
    } catch {
      newIncident = { id: `i-${Date.now()}`, project_id: projectId, status: 'Open', ...form };
      setIncidents(prev => [newIncident, ...prev]);
    }

    // Auto-create corrective action if corrective_action text is provided
    if (form.corrective_action && form.corrective_action.trim()) {
      try {
        const caRes = await fetch(`/api/projects/${projectId}/safety/corrective-actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: form.corrective_action,
            incident_id: newIncident.id,
            due_date: '',
            assigned_to: '',
          }),
        });
        const caJson = await caRes.json();
        if (caJson.action) {
          setActions(prev => [caJson.action, ...prev]);
        }
      } catch {
        // Corrective action creation failed silently -- incident was still recorded
      }
    }

    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setSuccessMsg('Incident reported.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleCreateCA() {
    if (!caForm.description) { setErrorMsg('Corrective action description is required.'); return; }
    setCaSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/projects/${projectId}/safety/corrective-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caForm),
      });
      const json = await res.json();
      const newAction = json.action || { id: `ca-${Date.now()}`, project_id: projectId, status: 'open', ...caForm, created_at: new Date().toISOString() };
      setActions(prev => [newAction, ...prev]);
    } catch {
      setActions(prev => [{ id: `ca-${Date.now()}`, project_id: projectId, status: 'open', ...caForm, created_at: new Date().toISOString() } as CorrectiveAction, ...prev]);
    }
    setShowCAForm(false);
    setCaForm(EMPTY_CA_FORM);
    setCaSaving(false);
    setSuccessMsg('Corrective action created.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleAdvanceCAStatus(action: CorrectiveAction) {
    const nextStatus = CA_STATUS_FLOW[action.status];
    if (!nextStatus) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/safety/corrective-actions/${action.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      setActions(prev => prev.map(a => a.id === action.id ? { ...a, ...json.action, status: nextStatus } : a));
    } catch {
      setActions(prev => prev.map(a => a.id === action.id ? { ...a, status: nextStatus } : a));
    }
    setSuccessMsg(`Action updated to ${CA_STATUS_LABELS[nextStatus]}.`);
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleGenerateJHA() {
    try {
      const res = await fetch('/api/documents/jha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const json = await res.json();
      if (json.url) window.open(json.url, '_blank');
      else { setSuccessMsg('JHA generation queued.'); setTimeout(() => setSuccessMsg(''), 4000); }
    } catch {
      setSuccessMsg('JHA generation requested (demo mode).');
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  }

  function isOverdue(action: CorrectiveAction): boolean {
    if (action.status === 'closed' || action.status === 'verified') return false;
    if (!action.due_date) return false;
    return new Date(action.due_date) < new Date();
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };

  return (
    <PageWrap>
      <div style={{ padding: '24px 24px 0' }}>
        <SectionHeader
          title="Safety"
          sub="Safety incidents, inspections, and OSHA records"
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={handleGenerateJHA}>Generate JHA</Btn>
              <Btn onClick={() => { setShowForm(p => !p); setErrorMsg(''); }}>
                {showForm ? 'Cancel' : '+ Report Incident'}
              </Btn>
            </div>
          }
        />
      </div>

      {/* Stat Cards */}
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard icon="&#128203;" label="Total Incidents" value={String(totalIncidents)} />
        <StatCard icon="&#128308;" label="Open" value={String(openCount)} />
        <StatCard icon="&#9989;" label="Resolved" value={String(resolvedCount)} />
        <StatCard
          icon="&#128737;"
          label="Days Since Last Incident"
          value={String(daysSinceLast)}
          sub={daysSinceLast > 30 ? 'Excellent record' : undefined}
        />
        <StatCard icon="&#9888;" label="Open Actions" value={String(openActionsCount)} />
        <StatCard
          icon="&#9200;"
          label="Overdue Actions"
          value={String(overdueActionsCount)}
          sub={overdueActionsCount > 0 ? 'Needs attention' : undefined}
        />
      </div>

      {successMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.4)`, borderRadius: 8, color: T.green, fontSize: 13 }}>{successMsg}</div>
      )}
      {errorMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.redDim, border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 8, color: T.red, fontSize: 13 }}>{errorMsg}</div>
      )}

      {/* Create Incident Form */}
      {showForm && (
        <div style={{ padding: '0 24px 16px' }}>
          <Card>
            <CardHeader><span style={{ fontWeight: 700, color: T.red }}>Report Safety Incident</span></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                <div>
                  <label style={lbl}>Date *</label>
                  <SaguaroDatePicker value={form.date} onChange={v => setForm(p => ({ ...p, date: v }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Type</label>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={inp}>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Severity</label>
                  <select value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))} style={inp}>
                    {TYPES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: 'span 3' }}>
                  <label style={lbl}>Description *</label>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' }} />
                </div>
                <div style={{ gridColumn: 'span 3' }}>
                  <label style={lbl}>Corrective Action</label>
                  <textarea value={form.corrective_action} onChange={e => setForm(p => ({ ...p, corrective_action: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn variant="danger" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Report Incident'}</Btn>
                <Btn variant="ghost" onClick={() => { setShowForm(false); setErrorMsg(''); }}>Cancel</Btn>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Incidents Table */}
      <div style={{ padding: '0 24px 24px' }}>
        <Card>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>Loading...</div>
            ) : incidents.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: T.green }}>
                No incidents recorded -- great work!
              </div>
            ) : (
              <Table
                headers={['Date', 'Type', 'Description', 'Severity', 'Status']}
                rows={incidents.map(i => [
                  <span key="d" style={{ color: T.muted, whiteSpace: 'nowrap' }}>{i.date}</span>,
                  i.type,
                  <span key="desc" style={{ maxWidth: 300, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.description}
                  </span>,
                  <Badge key="sev" label={i.severity} color={SEVERITY_BADGE[i.severity] || 'muted'} />,
                  <Badge key="st" label={i.status} color={STATUS_BADGE[i.status] || 'muted'} />,
                ])}
              />
            )}
          </CardBody>
        </Card>
      </div>

      {/* Corrective Actions Section */}
      <div style={{ padding: '0 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.white }}>Corrective Actions</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: T.muted }}>Track and verify corrective actions from incidents</p>
          </div>
          <Btn onClick={() => { setShowCAForm(p => !p); setErrorMsg(''); }}>
            {showCAForm ? 'Cancel' : '+ New Action'}
          </Btn>
        </div>
      </div>

      {/* Create Corrective Action Form */}
      {showCAForm && (
        <div style={{ padding: '0 24px 16px' }}>
          <Card>
            <CardHeader><span style={{ fontWeight: 700, color: T.gold }}>New Corrective Action</span></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={lbl}>Description *</label>
                  <textarea value={caForm.description} onChange={e => setCaForm(p => ({ ...p, description: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' }} />
                </div>
                <div>
                  <label style={lbl}>Assigned To</label>
                  <input value={caForm.assigned_to} onChange={e => setCaForm(p => ({ ...p, assigned_to: e.target.value }))} style={inp} placeholder="Name or email" />
                </div>
                <div>
                  <label style={lbl}>Due Date</label>
                  <SaguaroDatePicker value={caForm.due_date} onChange={v => setCaForm(p => ({ ...p, due_date: v }))} style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn onClick={handleCreateCA} disabled={caSaving}>{caSaving ? 'Creating...' : 'Create Action'}</Btn>
                <Btn variant="ghost" onClick={() => { setShowCAForm(false); setErrorMsg(''); }}>Cancel</Btn>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Corrective Actions Table */}
      <div style={{ padding: '0 24px 40px' }}>
        <Card>
          <CardBody style={{ padding: 0 }}>
            {actionsLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>Loading corrective actions...</div>
            ) : actions.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>
                No corrective actions recorded.
              </div>
            ) : (
              <Table
                headers={['Description', 'Assigned To', 'Due Date', 'Status', 'Actions']}
                rows={actions.map(a => {
                  const overdue = isOverdue(a);
                  const nextStatus = CA_STATUS_FLOW[a.status];
                  const nextLabel = nextStatus ? CA_STATUS_LABELS[nextStatus] : null;
                  return [
                    <span key="desc" style={{ maxWidth: 280, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.description}
                    </span>,
                    <span key="assign" style={{ color: a.assigned_to ? T.white : T.muted }}>{a.assigned_to || 'Unassigned'}</span>,
                    <span key="due" style={{ color: overdue ? T.red : T.muted, fontWeight: overdue ? 700 : 400, whiteSpace: 'nowrap' }}>
                      {a.due_date || 'No date'}
                      {overdue && <span style={{ display: 'block', fontSize: 10, color: T.red }}>OVERDUE</span>}
                    </span>,
                    <Badge key="st" label={CA_STATUS_LABELS[a.status] || a.status} color={CA_STATUS_BADGE[a.status] || 'muted'} />,
                    <span key="action">
                      {nextLabel ? (
                        <Btn variant="ghost" onClick={() => handleAdvanceCAStatus(a)} style={{ fontSize: 11, padding: '4px 10px' }}>
                          {'\u2192'} {nextLabel}
                        </Btn>
                      ) : (
                        <span style={{ fontSize: 11, color: T.green, fontWeight: 600 }}>Complete</span>
                      )}
                    </span>,
                  ];
                })}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </PageWrap>
  );
}
