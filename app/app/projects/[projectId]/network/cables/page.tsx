'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const BASE = '#F8F9FB';
const CARD = '#F8F9FB';
const GOLD = '#C8960F';
const GREEN = '#22C55E';
const BLUE = '#3B82F6';
const RED = '#EF4444';
const BORDER = '#E5E7EB';
const DIM = '#6B7280';
const TEXT = '#111827';

interface CableRun {
  id: string;
  network_project_id: string;
  label: string;
  cable_type: string;
  from_location: string;
  to_location: string;
  from_port: string;
  to_port: string;
  length_ft: number;
  pathway: string;
  floor: number;
  tested: boolean;
  test_result: string;
  tested_by: string;
  tested_at: string;
  notes: string;
  created_at: string;
}

const CABLE_TYPES = ['cat5e', 'cat6', 'cat6a', 'fiber_sm', 'fiber_mm', 'coax_rg6', 'coax_rg59', 'speaker', 'hdmi', 'usb'];

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  cat5e: { bg: `${BLUE}20`, text: BLUE },
  cat6: { bg: `${GREEN}20`, text: GREEN },
  cat6a: { bg: `${GOLD}20`, text: GOLD },
  fiber_sm: { bg: '#F9731620', text: '#F97316' },
  fiber_mm: { bg: '#8B5CF620', text: '#8B5CF6' },
  coax_rg6: { bg: '#6B728020', text: '#9CA3AF' },
  coax_rg59: { bg: '#6B728020', text: '#9CA3AF' },
  speaker: { bg: '#14B8A620', text: '#14B8A6' },
  hdmi: { bg: `${RED}20`, text: RED },
  usb: { bg: '#EC489920', text: '#EC4899' },
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: BASE, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  color: DIM, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4,
};

export default function CableSchedulePage() {
  const { projectId } = useParams() as { projectId: string };
  const [networkProjectId, setNetworkProjectId] = useState('');
  const [cables, setCables] = useState<CableRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterTested, setFilterTested] = useState('');
  const [filterFloor, setFilterFloor] = useState('');
  const [markingId, setMarkingId] = useState('');

  const emptyForm = {
    label: '', cable_type: 'cat6', from_location: '', to_location: '', from_port: '', to_port: '',
    length_ft: 0, pathway: '', floor: 1, notes: '',
  };
  const [form, setForm] = useState(emptyForm);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const npRes = await fetch(`/api/network/projects?projectId=${projectId}`);
      const npData = await npRes.json();
      if (!npData.networkProject) { setLoading(false); return; }
      setNetworkProjectId(npData.networkProject.id);
      const res = await fetch(`/api/network/cables?networkProjectId=${npData.networkProject.id}`);
      const data = await res.json();
      setCables(data.cables || []);
    } catch { /* */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async () => {
    if (!form.label || !networkProjectId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/network/cables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, network_project_id: networkProjectId }),
      });
      if (res.ok) {
        setForm(emptyForm);
        setShowForm(false);
        fetchData();
      }
    } catch { /* */ }
    setSaving(false);
  };

  const markTested = async (cableId: string, result: string) => {
    setMarkingId(cableId);
    try {
      await fetch(`/api/network/cables/${cableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tested: true, test_result: result, tested_at: new Date().toISOString() }),
      });
      fetchData();
    } catch { /* */ }
    setMarkingId('');
  };

  const filteredCables = cables.filter(c => {
    if (filterType && c.cable_type !== filterType) return false;
    if (filterTested === 'tested' && !c.tested) return false;
    if (filterTested === 'untested' && c.tested) return false;
    if (filterFloor && c.floor !== +filterFloor) return false;
    return true;
  });

  const totalRuns = cables.length;
  const testedCount = cables.filter(c => c.tested).length;
  const passCount = cables.filter(c => c.test_result === 'pass').length;
  const failCount = cables.filter(c => c.test_result === 'fail').length;
  const passRate = testedCount > 0 ? Math.round((passCount / testedCount) * 100) : 0;
  const floors = [...new Set(cables.map(c => c.floor))].sort();

  const cardStyle: React.CSSProperties = {
    background: `${CARD}cc`, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20,
  };

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div style={{ color: DIM }}>Loading cables...</div></div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/app/projects/${projectId}/network`} style={{ color: DIM, fontSize: 12, textDecoration: 'none' }}>Network &gt;</Link>
        <span style={{ color: TEXT, fontSize: 12, marginLeft: 4 }}>Cables</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ color: TEXT, fontSize: 22, fontWeight: 700, margin: 0 }}>Cable Schedule</h1>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '10px 18px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`, color: '#000',
          border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}>
          {showForm ? 'Cancel' : '+ Add Cable Run'}
        </button>
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Runs', value: totalRuns, color: BLUE },
          { label: 'Tested', value: `${testedCount}/${totalRuns}`, color: GREEN },
          { label: 'Passed', value: passCount, color: GREEN },
          { label: 'Failed', value: failCount, color: failCount > 0 ? RED : GREEN },
          { label: 'Pass Rate', value: `${passRate}%`, color: passRate >= 95 ? GREEN : passRate >= 80 ? GOLD : RED },
        ].map(s => (
          <div key={s.label} style={cardStyle}>
            <div style={{ color: DIM, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: 22, fontWeight: 700, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Add Form */}
      {showForm && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ color: TEXT, fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>Add Cable Run</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>Label *</label>
              <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="D-101" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Cable Type</label>
              <select value={form.cable_type} onChange={e => setForm({ ...form, cable_type: e.target.value })} style={inputStyle}>
                {CABLE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>From Location</label>
              <input value={form.from_location} onChange={e => setForm({ ...form, from_location: e.target.value })} placeholder="MDF Patch Panel A" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>To Location</label>
              <input value={form.to_location} onChange={e => setForm({ ...form, to_location: e.target.value })} placeholder="Office 101 Wall Jack" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>From Port</label>
              <input value={form.from_port} onChange={e => setForm({ ...form, from_port: e.target.value })} placeholder="PP-A-01" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>To Port</label>
              <input value={form.to_port} onChange={e => setForm({ ...form, to_port: e.target.value })} placeholder="WJ-101" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Length (ft)</label>
              <input type="number" value={form.length_ft} onChange={e => setForm({ ...form, length_ft: +e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Pathway</label>
              <input value={form.pathway} onChange={e => setForm({ ...form, pathway: e.target.value })} placeholder="Ceiling plenum" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Floor</label>
              <input type="number" value={form.floor} onChange={e => setForm({ ...form, floor: +e.target.value })} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <button onClick={handleSubmit} disabled={saving || !form.label} style={{
            marginTop: 16, padding: '10px 24px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`,
            color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            opacity: saving || !form.label ? 0.5 : 1,
          }}>
            {saving ? 'Saving...' : 'Save Cable Run'}
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inputStyle, width: 150, flex: 'none' }}>
          <option value="">All Types</option>
          {CABLE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').toUpperCase()}</option>)}
        </select>
        <select value={filterTested} onChange={e => setFilterTested(e.target.value)} style={{ ...inputStyle, width: 140, flex: 'none' }}>
          <option value="">All</option>
          <option value="tested">Tested</option>
          <option value="untested">Untested</option>
        </select>
        {floors.length > 1 && (
          <select value={filterFloor} onChange={e => setFilterFloor(e.target.value)} style={{ ...inputStyle, width: 120, flex: 'none' }}>
            <option value="">All Floors</option>
            {floors.map(f => <option key={f} value={f}>Floor {f}</option>)}
          </select>
        )}
        <div style={{ color: DIM, fontSize: 12, display: 'flex', alignItems: 'center' }}>{filteredCables.length} run{filteredCables.length !== 1 ? 's' : ''}</div>
      </div>

      {/* Cable Table */}
      <div style={{ ...cardStyle, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Label', 'Type', 'From', 'To', 'Length', 'Pathway', 'Tested', 'Result', 'Actions'].map(col => (
                <th key={col} style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredCables.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: DIM, fontSize: 13 }}>No cable runs found.</td></tr>
            ) : (
              filteredCables.map(cable => {
                const tc = TYPE_COLORS[cable.cable_type] || TYPE_COLORS.cat6;
                return (
                  <tr key={cable.id}>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{cable.label}</td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 600, background: tc.bg, color: tc.text }}>{cable.cable_type.replace(/_/g, ' ').toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 12 }}>
                      {cable.from_location}{cable.from_port ? ` (${cable.from_port})` : ''}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 12 }}>
                      {cable.to_location}{cable.to_port ? ` (${cable.to_port})` : ''}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12 }}>{cable.length_ft ? `${cable.length_ft} ft` : '—'}</td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12 }}>{cable.pathway || '—'}</td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, fontSize: 16, textAlign: 'center' }}>
                      {cable.tested ? '✅' : '⬜'}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}` }}>
                      {cable.test_result ? (
                        <span style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 600,
                          background: cable.test_result === 'pass' ? `${GREEN}20` : `${RED}20`,
                          color: cable.test_result === 'pass' ? GREEN : RED,
                          textTransform: 'uppercase',
                        }}>{cable.test_result}</span>
                      ) : <span style={{ color: DIM, fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}` }}>
                      {!cable.tested && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => markTested(cable.id, 'pass')}
                            disabled={markingId === cable.id}
                            style={{
                              padding: '4px 10px', background: `${GREEN}15`, color: GREEN, border: `1px solid ${GREEN}30`,
                              borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            }}
                          >Pass</button>
                          <button
                            onClick={() => markTested(cable.id, 'fail')}
                            disabled={markingId === cable.id}
                            style={{
                              padding: '4px 10px', background: `${RED}15`, color: RED, border: `1px solid ${RED}30`,
                              borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            }}
                          >Fail</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}