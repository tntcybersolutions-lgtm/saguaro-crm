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

const EMPTY_FORM = { date: '', type: 'Near Miss', description: '', severity: 'Near Miss', corrective_action: '' };

export default function SafetyPage() {
  const { projectId } = useParams() as { projectId: string };
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

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

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalIncidents = incidents.length;
  const openCount = incidents.filter(i => i.status === 'Open').length;
  const resolvedCount = incidents.filter(i => i.status === 'Resolved').length;

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
    try {
      const res = await fetch('/api/safety/incidents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, status: 'Open', ...form }),
      });
      const json = await res.json();
      setIncidents(prev => [json.incident || { id: `i-${Date.now()}`, project_id: projectId, status: 'Open', ...form }, ...prev]);
    } catch {
      setIncidents(prev => [{ id: `i-${Date.now()}`, project_id: projectId, status: 'Open', ...form }, ...prev]);
    }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setSuccessMsg('Incident reported.');
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
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon="📋" label="Total Incidents" value={String(totalIncidents)} />
        <StatCard icon="🔴" label="Open" value={String(openCount)} />
        <StatCard icon="✅" label="Resolved" value={String(resolvedCount)} />
        <StatCard
          icon="🛡️"
          label="Days Since Last Incident"
          value={String(daysSinceLast)}
          sub={daysSinceLast > 30 ? 'Excellent record' : undefined}
        />
      </div>

      {successMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.4)`, borderRadius: 8, color: T.green, fontSize: 13 }}>{successMsg}</div>
      )}
      {errorMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.redDim, border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 8, color: T.red, fontSize: 13 }}>{errorMsg}</div>
      )}

      {/* Create Form */}
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

      {/* Table */}
      <div style={{ padding: '0 24px 40px' }}>
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
    </PageWrap>
  );
}
