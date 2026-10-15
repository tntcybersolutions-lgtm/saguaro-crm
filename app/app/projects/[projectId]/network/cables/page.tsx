'use client';
/**
 * Network › Cables — the cable schedule: every run's label, type,
 * terminations, length, pathway and certification result. Untested runs
 * carry Pass / Fail on the row.
 *
 * Reads  GET   /api/network/projects?projectId=  →  GET /api/network/cables?networkProjectId=
 * Writes POST  /api/network/cables
 *        PATCH /api/network/cables/:id   { tested, test_result, tested_at }
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  PageShell, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select, Field, Input, Textarea,
  FormGrid, FormModal, Toast, useToast,
  type Column, type StatItem,
} from '@/components/ui/kit';
import { CheckCircle, Square, XCircle, Plus, PlugsConnected, ListChecks, Gauge, Percent, WarningCircle } from '@phosphor-icons/react';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import NetworkTabs, { networkCrumbs } from '../_components/NetworkTabs';

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

const CABLE_LABELS: Record<string, string> = {
  cat5e: 'Cat5e', cat6: 'Cat6', cat6a: 'Cat6a', fiber_sm: 'Fiber SM', fiber_mm: 'Fiber MM',
  coax_rg6: 'Coax RG6', coax_rg59: 'Coax RG59', speaker: 'Speaker', hdmi: 'HDMI', usb: 'USB',
};
const cableLabel = (t: string) => CABLE_LABELS[t] || (t || '').replace(/_/g, ' ');

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono, monospace)' };
const fmtFt = (n: number) => `${(Number(n) || 0).toLocaleString('en-US')} ft`;

export default function CableSchedulePage() {
  const { projectId } = useParams() as { projectId: string };
  const { ctx } = useProjectContext(projectId);
  const { toast, show } = useToast();
  const [networkProjectId, setNetworkProjectId] = useState('');
  const [cables, setCables] = useState<CableRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterTested, setFilterTested] = useState('');
  const [filterFloor, setFilterFloor] = useState('');
  const [search, setSearch] = useState('');
  const [markingId, setMarkingId] = useState('');

  const emptyForm = {
    label: '', cable_type: 'cat6', from_location: '', to_location: '', from_port: '', to_port: '',
    length_ft: 0, pathway: '', floor: 1, notes: '',
  };
  const [form, setForm] = useState(emptyForm);

  /* Unsaved-work guard: the composer holds real typing, so leaving the page
   * confirms first and the draft is kept on this device either way. */
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
    setLoadError('');
    try {
      const npRes = await fetch(`/api/network/projects?projectId=${projectId}`);
      const npData = await npRes.json();
      if (!npData.networkProject) { setLoading(false); return; }
      setNetworkProjectId(npData.networkProject.id);
      const res = await fetch(`/api/network/cables?networkProjectId=${npData.networkProject.id}`);
      const data = await res.json();
      setCables(data.cables || []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load cable runs");
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async (): Promise<boolean> => {
    if (!form.label || !networkProjectId) return false;
    setSaving(true);
    setFormError('');
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
        show('Cable run saved');
        return true;
      }
      const j = await res.json().catch(() => ({}));
      setFormError(j.error || "Couldn't save the cable run.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save the cable run.");
    }
    setSaving(false);
    return false;
  };

  const markTested = async (cableId: string, result: string) => {
    setMarkingId(cableId);
    try {
      const res = await fetch(`/api/network/cables/${cableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tested: true, test_result: result, tested_at: new Date().toISOString() }),
      });
      if (res.ok) show(result === 'pass' ? 'Marked passed' : 'Marked failed');
      else show("Couldn't record the test result", 'bad');
      fetchData();
    } catch {
      show("Couldn't record the test result", 'bad');
    }
    setMarkingId('');
  };

  const filteredCables = cables.filter(c => {
    if (filterType && c.cable_type !== filterType) return false;
    if (filterTested === 'tested' && !c.tested) return false;
    if (filterTested === 'untested' && c.tested) return false;
    if (filterTested === 'failed' && c.test_result !== 'fail') return false;
    if (filterFloor && c.floor !== +filterFloor) return false;
    const q = search.trim().toLowerCase();
    if (q && ![c.label, c.from_location, c.to_location, c.from_port, c.to_port, c.pathway].some(v => String(v || '').toLowerCase().includes(q))) return false;
    return true;
  });

  const totalRuns = cables.length;
  const testedCount = cables.filter(c => c.tested).length;
  const passCount = cables.filter(c => c.test_result === 'pass').length;
  const failCount = cables.filter(c => c.test_result === 'fail').length;
  const passRate = testedCount > 0 ? Math.round((passCount / testedCount) * 100) : 0;
  const floors = [...new Set(cables.map(c => c.floor))].sort();

  const stats: StatItem[] = [
    { label: 'Total runs', value: loading ? '—' : String(totalRuns), sub: 'Cable runs', icon: <ListChecks size={15} />, onClick: () => setFilterTested(''), active: filterTested === '' },
    { label: 'Tested', value: loading ? '—' : `${testedCount}/${totalRuns}`, sub: loading ? undefined : `${totalRuns - testedCount} untested`, icon: <Gauge size={15} />, onClick: () => setFilterTested('tested'), active: filterTested === 'tested' },
    { label: 'Passed', value: loading ? '—' : String(passCount), sub: 'Passed tests', tone: passCount ? 'good' : 'default', icon: <CheckCircle size={15} /> },
    { label: 'Failed', value: loading ? '—' : String(failCount), sub: 'Failed tests', tone: failCount > 0 ? 'bad' : 'default', icon: <XCircle size={15} />, onClick: () => setFilterTested('failed'), active: filterTested === 'failed' },
    { label: 'Pass rate', value: loading ? '—' : `${passRate}%`, sub: 'Of tested', tone: testedCount === 0 ? 'default' : passRate >= 95 ? 'good' : passRate >= 80 ? 'warn' : 'bad', icon: <Percent size={15} /> },
  ];

  const columns: Column<CableRun>[] = [
    { key: 'label', header: 'Label', primary: true, phone: 'show', render: (c) => <span style={mono}>{c.label}</span>, groupable: false },
    { key: 'cable_type', header: 'Type', accessor: (c) => cableLabel(c.cable_type), render: (c) => <Badge>{cableLabel(c.cable_type)}</Badge> },
    { key: 'from', header: 'From', accessor: (c) => `${c.from_location || ''}${c.from_port ? ` (${c.from_port})` : ''}`, render: (c) => (c.from_location || c.from_port) ? `${c.from_location || ''}${c.from_port ? ` (${c.from_port})` : ''}` : '—', groupable: false },
    { key: 'to', header: 'To', accessor: (c) => `${c.to_location || ''}${c.to_port ? ` (${c.to_port})` : ''}`, render: (c) => (c.to_location || c.to_port) ? `${c.to_location || ''}${c.to_port ? ` (${c.to_port})` : ''}` : '—', groupable: false },
    { key: 'length_ft', header: 'Length', align: 'right', total: 'sum', format: fmtFt, accessor: (c) => Number(c.length_ft) || 0, render: (c) => (c.length_ft ? fmtFt(c.length_ft) : '—') },
    { key: 'pathway', header: 'Pathway', render: (c) => c.pathway || '—' },
    { key: 'floor', header: 'Floor', hidden: true, align: 'right' },
    { key: 'tested', header: 'Tested', align: 'center', accessor: (c) => (c.tested ? 'Yes' : 'No'), render: (c) => (
      <span style={{ display: 'inline-flex', verticalAlign: 'middle', color: c.tested ? 'var(--success)' : 'var(--text-secondary)' }} aria-label={c.tested ? 'Tested' : 'Not tested'}>
        {c.tested ? <CheckCircle size={18} weight="fill" /> : <Square size={18} />}
      </span>
    ) },
    { key: 'test_result', header: 'Result', phone: 'show', accessor: (c) => c.test_result || '', render: (c) => c.test_result
      ? <Badge tone={c.test_result === 'pass' ? 'ongoing' : 'overdue'} dot>{c.test_result === 'pass' ? 'Pass' : c.test_result === 'fail' ? 'Fail' : c.test_result}</Badge>
      : '—' },
  ];

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm({ ...form, [k]: v });
  const openForm = () => { setFormError(''); setShowForm(true); };

  return (
    <PageShell
      crumbs={networkCrumbs(projectId, ctx?.project?.name, 'Cables')}
      title="Cable schedule"
      subtitle="Every cable run, its terminations, pathway and test result."
      actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openForm}>Add cable run</Button>}
    >
      <NetworkTabs projectId={projectId} value="cables" />
      {!loadError && <StatRow items={stats} />}

      {!loadError && cables.length > 0 && (
        <Toolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search label, location or port…"
          filters={
            <>
              <Select aria-label="Cable type" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 'auto', minWidth: 150 }}
                options={[{ value: '', label: 'All types' }, ...CABLE_TYPES.map(t => ({ value: t, label: cableLabel(t) }))]} />
              <Select aria-label="Tested" value={filterTested} onChange={e => setFilterTested(e.target.value)} style={{ width: 'auto', minWidth: 140 }}
                options={[{ value: '', label: 'All' }, { value: 'tested', label: 'Tested' }, { value: 'untested', label: 'Untested' }, { value: 'failed', label: 'Failed' }]} />
              {floors.length > 1 && (
                <Select aria-label="Floor" value={filterFloor} onChange={e => setFilterFloor(e.target.value)} style={{ width: 'auto', minWidth: 120 }}
                  options={[{ value: '', label: 'All floors' }, ...floors.map(f => ({ value: String(f), label: `Floor ${f}` }))]} />
              )}
            </>
          }
        />
      )}

      {loadError ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load cable runs" text={loadError} action={<Button onClick={fetchData}>Try again</Button>} />
      ) : (
        <DataTable<CableRun>
          tableId="project-network-cables"
          exportName="cable-schedule"
          columns={columns}
          rows={filteredCables}
          loading={loading}
          rowKey={(c) => c.id}
          defaultSort={{ key: 'label', dir: 'asc' }}
          rowActions={(c) => [
            { label: 'Pass', icon: <CheckCircle size={14} />, inline: true, hidden: c.tested, disabled: markingId === c.id, onClick: () => markTested(c.id, 'pass') },
            { label: 'Fail', icon: <XCircle size={14} />, inline: true, tone: 'danger', hidden: c.tested, disabled: markingId === c.id, onClick: () => markTested(c.id, 'fail') },
          ]}
          empty={
            cables.length === 0 ? (
              <EmptyState icon={<PlugsConnected size={22} />} title="No cable runs yet" text="Add the first run to start this job's cable schedule."
                action={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openForm}>Add cable run</Button>} />
            ) : (
              <EmptyState title="No cable runs match your filters" text="Clear or change the filters to see more runs."
                action={<Button onClick={() => { setSearch(''); setFilterType(''); setFilterTested(''); setFilterFloor(''); }}>Clear filters</Button>} />
            )
          }
        />
      )}

      <FormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Add cable run"
        onSubmit={async () => { await handleSubmit(); }}
        submitLabel="Save cable run"
        busy={saving}
        error={formError}
      >
        <FormGrid cols={3}>
          <Field label="Label" required>
            <Input required value={form.label} onChange={e => set('label', e.target.value)} placeholder="D-101" />
          </Field>
          <Field label="Cable type">
            <Select value={form.cable_type} onChange={e => set('cable_type', e.target.value)} options={CABLE_TYPES.map(t => ({ value: t, label: cableLabel(t) }))} />
          </Field>
          <Field label="Floor">
            <Input type="number" value={form.floor} onChange={e => set('floor', +e.target.value)} />
          </Field>
          <Field label="From location">
            <Input value={form.from_location} onChange={e => set('from_location', e.target.value)} placeholder="MDF Patch Panel A" />
          </Field>
          <Field label="To location">
            <Input value={form.to_location} onChange={e => set('to_location', e.target.value)} placeholder="Office 101 Wall Jack" />
          </Field>
          <Field label="Length (ft)">
            <Input type="number" value={form.length_ft} onChange={e => set('length_ft', +e.target.value)} />
          </Field>
          <Field label="From port">
            <Input value={form.from_port} onChange={e => set('from_port', e.target.value)} placeholder="PP-A-01" />
          </Field>
          <Field label="To port">
            <Input value={form.to_port} onChange={e => set('to_port', e.target.value)} placeholder="WJ-101" />
          </Field>
          <Field label="Pathway">
            <Input value={form.pathway} onChange={e => set('pathway', e.target.value)} placeholder="Ceiling plenum" />
          </Field>
          <Field label="Notes" span>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
          </Field>
        </FormGrid>
      </FormModal>

      <UnsavedGuardModal guard={guard} />
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
