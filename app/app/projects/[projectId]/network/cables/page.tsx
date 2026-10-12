'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Square, XCircle, Plus, PlugsConnected, ListChecks, Gauge, Percent } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, goldButtonStyle, ghostButtonStyle, secondaryButtonStyle } from '@/components/ui/premium';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';

const BASE = 'var(--bg-surface-2)';
const GOLD = 'var(--brand-primary)';
const GREEN = '#4ADE80';
const BLUE = 'var(--brand-primary)';
const RED = '#F87171';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = 'var(--text-secondary)';
const TEXT = 'var(--text-primary)';

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
  cat5e: { bg: 'var(--brand-primary-12)', text: BLUE },
  cat6: { bg: `color-mix(in srgb, ${GREEN} 13%, transparent)`, text: GREEN },
  cat6a: { bg: 'var(--brand-primary-12)', text: GOLD },
  fiber_sm: { bg: '#F9731620', text: 'var(--warning)' },
  fiber_mm: { bg: '#8B5CF620', text: 'var(--warning)' },
  coax_rg6: { bg: '#6B728020', text: 'var(--status-closed)' },
  coax_rg59: { bg: '#6B728020', text: 'var(--status-closed)' },
  speaker: { bg: '#14B8A620', text: 'var(--success)' },
  hdmi: { bg: `color-mix(in srgb, ${RED} 13%, transparent)`, text: RED },
  usb: { bg: '#EC489920', text: 'var(--warning)' },
};

const CABLE_LABELS: Record<string, string> = {
  cat5e: 'Cat5e', cat6: 'Cat6', cat6a: 'Cat6a', fiber_sm: 'Fiber SM', fiber_mm: 'Fiber MM',
  coax_rg6: 'Coax RG6', coax_rg59: 'Coax RG59', speaker: 'Speaker', hdmi: 'HDMI', usb: 'USB',
};
const cableLabel = (t: string) => CABLE_LABELS[t] || t.replace(/_/g, ' ');

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

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `network-cables:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSubmit(),
  });

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

  const handleSubmit = async (): Promise<boolean> => {
    if (!form.label || !networkProjectId) return false;
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
        guard.clearDraft();
        setSaving(false);
        return true;
      }
    } catch { /* */ }
    setSaving(false);
    return false;
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

  if (loading) {
    return (
      <PremiumSurface maxWidth={2200}>
        <ModuleSkeleton kpis={5} rows={5} />
      </PremiumSurface>
    );
  }

  return (
    <PremiumSurface maxWidth={2200}>
      <div style={{ marginBottom: 12 }}>
        <Link href={`/app/projects/${projectId}/network`} style={{ color: DIM, fontSize: 12, textDecoration: 'none' }}>Network →</Link>
        <span style={{ color: TEXT, fontSize: 12, marginLeft: 4 }}>Cables</span>
      </div>

      {/* Header */}
      <ModuleHero
        eyebrow="Network"
        eyebrowIcon={<PlugsConnected size={13} weight="fill" color="var(--text-secondary)" />}
        title="Cable"
        accent="Schedule"
        subtitle="Track every cable run, its terminations, pathway, and test results."
        actions={
          <button onClick={() => setShowForm(!showForm)} style={showForm ? ghostButtonStyle : goldButtonStyle} className="pmBtn">
            {showForm ? 'Cancel' : <><Plus size={15} weight="bold" /> Add Cable Run</>}
          </button>
        }
      />

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard icon={<ListChecks size={19} weight="duotone" color="var(--text-secondary)" />} label="Total Runs" value={String(totalRuns)} accent={BLUE} sub="Cable runs" delay={0.02}  href={`/app/projects/${projectId}/network/cables`}/>
        <StatCard icon={<Gauge size={19} weight="duotone" color={GREEN} />} label="Tested" value={`${testedCount}/${totalRuns}`} accent={GREEN} sub="Tested" delay={0.06}  href={`/app/projects/${projectId}/network/cables`}/>
        <StatCard icon={<CheckCircle size={19} weight="duotone" color={GREEN} />} label="Passed" value={String(passCount)} accent={GREEN} sub="Passed tests" delay={0.10}  href={`/app/projects/${projectId}/network/cables`}/>
        <StatCard icon={<XCircle size={19} weight="duotone" color={failCount > 0 ? RED : GREEN} />} label="Failed" value={String(failCount)} accent={failCount > 0 ? RED : GREEN} sub="Failed tests" delay={0.14}  href={`/app/projects/${projectId}/network/cables`}/>
        <StatCard icon={<Percent size={19} weight="duotone" color={passRate >= 95 ? GREEN : passRate >= 80 ? 'var(--warning)' : RED} />} label="Pass Rate" value={`${passRate}%`} accent={passRate >= 95 ? GREEN : passRate >= 80 ? 'var(--warning)' : RED} sub="Of tested" delay={0.18}  href={`/app/projects/${projectId}/network/cables`}/>
      </div>

      {/* Add Form */}
      {showForm && (
        <SectionCard title="Add Cable Run" icon={<Plus size={17} weight="bold" color="var(--text-secondary)" />} style={{ marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>Label *</label>
              <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="D-101" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Cable Type</label>
              <select value={form.cable_type} onChange={e => setForm({ ...form, cable_type: e.target.value })} style={inputStyle}>
                {CABLE_TYPES.map(t => <option key={t} value={t}>{cableLabel(t)}</option>)}
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
          <button onClick={handleSubmit} disabled={saving || !form.label} className="pmBtn" style={{
            ...goldButtonStyle, marginTop: 16,
            opacity: saving || !form.label ? 0.5 : 1,
            cursor: saving || !form.label ? 'not-allowed' : 'pointer',
          }}>
            {saving ? 'Saving…' : 'Save Cable Run'}
          </button>
        </SectionCard>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inputStyle, width: 150, flex: 'none' }}>
          <option value="">All Types</option>
          {CABLE_TYPES.map(t => <option key={t} value={t}>{cableLabel(t)}</option>)}
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
      <SectionCard title="Cable Runs" icon={<ListChecks size={17} weight="duotone" color="var(--text-secondary)" />} flush>
        {filteredCables.length === 0 ? (
          <PremiumEmpty
            icon={<PlugsConnected size={30} weight="duotone" color="var(--text-secondary)" />}
            title={cables.length === 0 ? 'No cable runs yet' : 'No cable runs match your filters'}
            description={cables.length === 0
              ? 'Add your first cable run to start building this project’s cable schedule.'
              : 'Try clearing or adjusting the filters above to see more runs.'}
            action={cables.length === 0
              ? <button onClick={() => setShowForm(true)} style={secondaryButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Add Cable Run</button>
              : undefined}
          />
        ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
        <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Label', 'Type', 'From', 'To', 'Length', 'Pathway', 'Tested', 'Result', 'Actions'].map(col => (
                <th key={col} style={{ padding: '12px 14px', textAlign: 'left', color: DIM, fontSize: 12, fontWeight: 700, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredCables.map(cable => {
                const tc = TYPE_COLORS[cable.cable_type] || TYPE_COLORS.cat6;
                return (
                  <tr key={cable.id}>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{cable.label}</td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, fontWeight: 600, background: tc.bg, color: tc.text }}>{cableLabel(cable.cable_type)}</span>
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
                      <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
                        {cable.tested
                          ? <CheckCircle size={18} weight="fill" color={GREEN} />
                          : <Square size={18} weight="regular" color={DIM} />}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}` }}>
                      {cable.test_result ? (
                        <span style={{
                          fontSize: 12, padding: '3px 10px', borderRadius: 10, fontWeight: 600,
                          background: cable.test_result === 'pass' ? `color-mix(in srgb, ${GREEN} 13%, transparent)` : `color-mix(in srgb, ${RED} 13%, transparent)`,
                          color: cable.test_result === 'pass' ? GREEN : RED,
                          textTransform: 'capitalize',
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
                              padding: '4px 10px', background: `color-mix(in srgb, ${GREEN} 8%, transparent)`, color: GREEN, border: `1px solid color-mix(in srgb, ${GREEN} 19%, transparent)`,
                              borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}
                          >Pass</button>
                          <button
                            onClick={() => markTested(cable.id, 'fail')}
                            disabled={markingId === cable.id}
                            style={{
                              padding: '4px 10px', background: `color-mix(in srgb, ${RED} 8%, transparent)`, color: RED, border: `1px solid color-mix(in srgb, ${RED} 19%, transparent)`,
                              borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}
                          >Fail</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        </div>
        )}
      </SectionCard>
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}