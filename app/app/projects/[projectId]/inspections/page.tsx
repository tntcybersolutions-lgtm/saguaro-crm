'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { ClipboardText, CheckCircle, XCircle, CalendarCheck, Plus, Warning, ClockCounterClockwise, ArrowsClockwise } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, FlowSteps, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { StatusPill } from '@/components/ui/Status';

const GOLD='var(--brand-primary)', BORDER='rgba(255,255,255,0.12)', DIM='#CBD5E1', TEXT='#FFFFFF', GREEN='#3dd68c', RED='#ef4444';

interface Inspection {
  id: string;
  type: string;
  date: string;
  inspector: string;
  agency: string;
  result: string;
  notes: string;
  status: string;
  re_inspection_date: string | null;
  project_id: string;
  deficiency_count: number;
  checklist_total: number;
  checklist_passed: number;
}

const INSPECTION_TYPES = ['Foundation','Framing','Rough Electrical','Rough Plumbing','Rough HVAC','Insulation','Drywall','Final Electrical','Final Plumbing','Final Building'];
const EMPTY_FORM = { type: 'Framing', date: '', inspector: '', agency: '', notes: '' };

const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDate = (d?: string | null) => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
// Results arrive in two dialects: the web form writes 'Passed'/'Failed'/'Pending'
// while the wizard/mobile route writes 'passed'/'conditional_pass'. Canonicalize
// before comparing so stats and re-inspection tracking see both.
const canonResult = (r: string) => String(r || '').toLowerCase().replace(/[\s_]+/g, ' ').trim();

// The API returns raw `inspections` rows whose columns don't match this page's
// display fields (scheduled_date/inspection_type/inspector_name). Normalize so
// the user's saved date + inspector actually render on reload.
function normalizeInspection(r: Record<string, unknown>): Inspection {
  return {
    id: String(r.id ?? ''),
    type: String(r.type ?? r.inspection_type ?? ''),
    date: String(r.date ?? r.scheduled_date ?? ''),
    inspector: String(r.inspector ?? r.inspector_name ?? ''),
    agency: String(r.agency ?? r.inspector_agency ?? ''),
    result: String(r.result ?? ''),
    notes: String(r.notes ?? ''),
    status: String(r.status ?? ''),
    re_inspection_date: (r.re_inspection_date as string | null) ?? null,
    project_id: String(r.project_id ?? ''),
    deficiency_count: Number(r.deficiency_count) || 0,
    checklist_total: Number(r.checklist_total) || 0,
    checklist_passed: Number(r.checklist_passed) || 0,
  };
}

function resultBadge(result: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    'passed': { bg: 'rgba(61,214,140,.2)', color: GREEN, label: 'Passed' },
    'failed': { bg: 'rgba(239,68,68,.2)', color: RED, label: 'Failed' },
    'pending': { bg: 'color-mix(in srgb, var(--warning) 20%, transparent)', color: 'var(--warning)', label: 'Pending' },
    'conditional pass': { bg: 'color-mix(in srgb, var(--warning) 20%, transparent)', color: 'var(--warning)', label: 'Conditional Pass' },
  };
  const s = map[canonResult(result)] || { bg: 'rgba(143,163,192,.2)', color: DIM, label: result || '—' };
  return <span style={{ padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700 }}>{s.label}</span>;
}

export default function InspectionsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `inspections:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSave(),
  });
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');
  const [filterResult, setFilterResult] = useState('all');
  const [filterType, setFilterType] = useState('all');

  const fetchInspections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/inspections`);
      const json = await res.json();
      setInspections((json.inspections ?? []).map(normalizeInspection));
    } catch {
      setInspections([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchInspections(); }, [fetchInspections]);

  // Project intelligence — one snapshot; the schedule flow walks in knowing the job.
  const { ctx } = useProjectContext(projectId);
  const [auto, setAuto] = useState<{ date?: boolean; type?: boolean; insp?: boolean; agency?: boolean }>({});

  const passed = inspections.filter(i => canonResult(i.result) === 'passed').length;
  const failed = inspections.filter(i => canonResult(i.result) === 'failed').length;
  const conditional = inspections.filter(i => canonResult(i.result) === 'conditional pass').length;
  const resulted = passed + failed + conditional;
  const passRate = resulted > 0 ? Math.round(((passed + conditional) / resulted) * 100) : 0;
  const scheduled = inspections.filter(i => /sched/i.test(i.status)).length;
  const deficiencies = inspections.reduce((s, i) => s + (Number(i.deficiency_count) || 0), 0);

  // Re-inspection tracking: a failed inspection stays open until a later
  // inspection of the same type passes (or conditionally passes).
  const awaitingReinspection = inspections.filter(f =>
    canonResult(f.result) === 'failed' &&
    !inspections.some(p =>
      p.type === f.type && p.id !== f.id &&
      (canonResult(p.result) === 'passed' || canonResult(p.result) === 'conditional pass') &&
      (p.date || '') >= (f.date || '')
    )
  );

  const todayIso = localIso(new Date());
  const upcoming = inspections
    .filter(i => /sched/i.test(i.status) && (i.date || '') >= todayIso)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const nextUp = upcoming[0] || null;
  const byDateDesc = [...inspections].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const lastRecord = byDateDesc[0] || null;
  const passedTypes = new Set(inspections.filter(i => canonResult(i.result) === 'passed').map(i => i.type));
  const suggestedType = INSPECTION_TYPES.find(t => !passedTypes.has(t)) || 'Final Building';
  const openPunch = Number(ctx?.counts?.openPunch) || 0;
  const pctComplete = Number(ctx?.project?.percentComplete) || 0;

  // Toolbar filtering — client-side over the loaded records.
  const filteredInspections = inspections.filter(i => {
    if (search) {
      const q = search.toLowerCase();
      const hit = (i.type || '').toLowerCase().includes(q)
        || (i.inspector || '').toLowerCase().includes(q)
        || (i.agency || '').toLowerCase().includes(q)
        || (i.notes || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (filterResult !== 'all' && canonResult(i.result) !== filterResult) return false;
    if (filterType !== 'all' && i.type !== filterType) return false;
    return true;
  });

  // Prefilled schedule flow: date today, the last inspector/agency of record,
  // and the next milestone type (or the failed type for a re-inspection).
  function openCreate(prefType?: string) {
    const lastWithInspector = byDateDesc.find(i => i.inspector);
    const lastWithAgency = byDateDesc.find(i => i.agency);
    setForm({
      type: prefType || suggestedType,
      date: localIso(new Date()),
      inspector: lastWithInspector?.inspector || '',
      agency: lastWithAgency?.agency || '',
      notes: prefType ? `Re-inspection — prior ${prefType} inspection failed.` : '',
    });
    setAuto({ date: true, type: true, insp: !!lastWithInspector?.inspector, agency: !!lastWithAgency?.agency });
    setShowForm(true);
    setErrorMsg('');
  }

  async function handleSave(): Promise<boolean> {
    if (!form.type || !form.date || !form.inspector) { setErrorMsg('Type, date, and inspector are required.'); return false; }
    setSaving(true);
    setErrorMsg('');
    const payload = { projectId, result: 'Pending', status: 'Scheduled', ...form };
    try {
      let res = await fetch('/api/inspections/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      // QC-before-inspections gate (franchise sites): allow an explicit override.
      if (res.status === 409) {
        const g = await res.json().catch(() => ({}));
        if (g?.requiresQcOverride && typeof window !== 'undefined' &&
            (await confirmDialog({ title: 'Schedule anyway?', message: g.error || 'QC is not complete for this site.', confirmLabel: 'Schedule anyway' }))) {
          res = await fetch('/api/inspections/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, override: true }) });
        } else if (g?.requiresQcOverride) {
          setErrorMsg(g.error || 'QC not complete for this site.'); setSaving(false); return false;
        }
      }
      const json = await res.json();
      if (!res.ok || !json.inspection) throw new Error(json.error || 'Create failed');
      setInspections(prev => [...prev, normalizeInspection(json.inspection)]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Inspection scheduled.');
      setTimeout(() => setSuccessMsg(''), 4000);
      guard.clearDraft();
      return true;
    } catch {
      setErrorMsg('Could not schedule the inspection. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: 'var(--bg-surface-2)', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };
  const hint: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5, lineHeight: 1.45 };

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow={ctx?.project?.name || 'Quality Assurance'}
        eyebrowIcon={<ClipboardText size={13} weight="fill" style={{ color: GOLD }} />}
        title="Inspections"
        subtitle="Building inspections and approval records."
        actions={
          <button onClick={() => { if (showForm) { setShowForm(false); setErrorMsg(''); } else { openCreate(); } }} style={goldButtonStyle} className="pmBtn">
            <Plus size={15} weight="bold" /> Schedule Inspection
          </button>
        }
      />

      {/* Inspection intelligence strip — what the record already shows */}
      {!loading && (ctx || inspections.length > 0) && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/inspections`,  label: 'Pass Rate', value: resulted > 0 ? `${passRate}%` : '—', accent: resulted > 0 ? (passRate >= 80 ? GREEN : passRate >= 60 ? GOLD : RED) : undefined, sub: resulted > 0 ? `${passed} passed of ${resulted} resulted` : 'No results recorded yet' },
          {href: `/app/projects/${projectId}/inspections`,  label: 'Deficiencies', value: String(deficiencies), accent: deficiencies > 0 ? 'var(--warning)' : undefined, sub: deficiencies > 0 ? 'Flagged on inspection checklists' : 'None flagged' },
          {href: `/app/projects/${projectId}/inspections`,  label: 'Re-Inspections Due', value: String(awaitingReinspection.length), accent: awaitingReinspection.length > 0 ? RED : GREEN, sub: awaitingReinspection.length > 0 ? awaitingReinspection.slice(0, 2).map(f => f.type).join(', ') : 'Every failure re-passed' },
          {href: `/app/projects/${projectId}/inspections`,  label: 'Next Scheduled', value: nextUp ? fmtDate(nextUp.date) : '—', sub: nextUp ? nextUp.type : 'Nothing on the calendar' },
          {href: `/app/projects/${projectId}/inspections`,  label: 'Project Progress', value: `${pctComplete}%`, sub: `Next milestone: ${suggestedType}` },
          {href: `/app/projects/${projectId}/punch-list`,  label: 'Open Punch Items', value: String(openPunch), accent: openPunch > 0 ? GOLD : undefined, sub: openPunch > 0 ? 'Clear before final inspections' : 'Nothing blocking finals' },
        ]} />
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard icon={<CheckCircle size={19} weight="duotone" style={{ color: GREEN }} />} label="Passed" value={String(passed)} accent={GREEN} sub={resulted > 0 ? `${passRate}% pass rate` : undefined} delay={0.02}  href={`/app/projects/${projectId}/inspections`}/>
        <StatCard icon={<XCircle size={19} weight="duotone" style={{ color: RED }} />} label="Failed" value={String(failed)} accent={failed > 0 ? RED : undefined} sub={awaitingReinspection.length > 0 ? `${awaitingReinspection.length} awaiting re-inspection` : undefined} delay={0.06}  href={`/app/projects/${projectId}/inspections`}/>
        <StatCard icon={<Warning size={19} weight="duotone" style={{ color: deficiencies > 0 ? 'var(--warning)' : GOLD }} />} label="Deficiencies" value={String(deficiencies)} accent={deficiencies > 0 ? 'var(--warning)' : undefined} sub="Checklist items flagged" delay={0.10}  href={`/app/projects/${projectId}/inspections`}/>
        <StatCard icon={<CalendarCheck size={19} weight="duotone" style={{ color: GOLD }} />} label="Scheduled" value={String(scheduled)} accent={GOLD} sub={nextUp ? `Next: ${fmtDate(nextUp.date)}` : undefined} delay={0.14}  href={`/app/projects/${projectId}/inspections`}/>
        <StatCard icon={<ClipboardText size={19} weight="duotone" style={{ color: GOLD }} />} label="Total" value={String(inspections.length)} sub={lastRecord ? `Last: ${fmtDate(lastRecord.date)}` : undefined} delay={0.18}  href={`/app/projects/${projectId}/inspections`}/>
      </div>

      {successMsg && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 10, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 10, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ display: 'grid', gridTemplateColumns: ctx ? 'minmax(0, 1fr) 320px' : '1fr', gap: 18, alignItems: 'start', marginBottom: 24 }}>
          <SectionCard title="Schedule Inspection" icon={<CalendarCheck size={17} weight="duotone" style={{ color: GOLD }} />}>
            {awaitingReinspection.length > 0 && (
              <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#fca5a5', lineHeight: 1.6 }}>
                <ArrowsClockwise size={13} weight="bold" color="#fca5a5" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                {awaitingReinspection.length} failed inspection{awaitingReinspection.length === 1 ? '' : 's'} awaiting re-inspection:{' '}
                {awaitingReinspection.slice(0, 3).map(f => (
                  <span key={f.id} onClick={() => openCreate(f.type)} style={{ color: 'var(--brand-primary-strong)', fontWeight: 700, cursor: 'pointer', marginRight: 10 }}>
                    {f.type} (failed {fmtDate(f.date)})
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <div><label style={label}>Inspection Type *{auto.type && <AutoChip />}</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={inp}>
                  {INSPECTION_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <div style={hint}>{passedTypes.size > 0 ? `${passedTypes.size} of ${INSPECTION_TYPES.length} milestone types passed — ${suggestedType} is next.` : 'Typical sequence runs Foundation through Final Building.'}</div>
              </div>
              <div><label style={label}>Date *{auto.date && <AutoChip />}</label>
                <SaguaroDatePicker value={form.date} onChange={v => setForm(p => ({ ...p, date: v }))} style={inp} />
                <div style={hint}>Defaulted to today — most agencies need 24–48h notice.</div>
              </div>
              <div><label style={label}>Inspector *{auto.insp && <AutoChip />}</label>
                <Suggest type="text" value={form.inspector} onChange={e => setForm(p => ({ ...p, inspector: e.target.value }))} style={inp} options={['n']} />
                <div style={hint}>{auto.insp ? `Carried from the last inspection (${fmtDate(lastRecord?.date)}).` : 'Who performs the inspection.'}</div>
              </div>
              <div><label style={label}>Agency{auto.agency && <AutoChip />}</label>
                <Suggest type="text" value={form.agency} onChange={e => setForm(p => ({ ...p, agency: e.target.value }))} placeholder="e.g. City of Phoenix" style={inp} options={['n']} />
                <div style={hint}>{auto.agency ? 'Same authority as the last inspection.' : 'The authority having jurisdiction.'}</div>
              </div>
              <div style={{ gridColumn: 'span 2' }}><label style={label}>Notes</label>
                <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Gate code, area under inspection, permit reference…" style={inp} />
                <div style={hint}>Anything the inspector needs on arrival.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={handleSave} disabled={saving} style={{ ...goldButtonStyle, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} className="pmBtn">
                {saving ? 'Saving…' : 'Schedule Inspection'}
              </button>
              <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={ghostButtonStyle} className="pmBtn">Cancel</button>
            </div>
          </SectionCard>
          {ctx && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionCard flat title="What Saguaro Knows" icon={<ClockCounterClockwise size={17} weight="duotone" style={{ color: GOLD }} />}>
                <InsightRow label="Project" value={`${pctComplete}% complete`} />
                <InsightRow label="Inspections Held" value={String(inspections.length)} />
                <InsightRow label="Pass Rate" value={resulted > 0 ? `${passRate}%` : '—'} accent={resulted > 0 && passRate >= 80 ? GREEN : undefined} />
                <InsightRow label="Open Punch Items" value={String(openPunch)} accent={openPunch > 0 ? GOLD : undefined} />
                <InsightRow label="Subs on the Job" value={String((ctx?.subs || []).length)} />
                {lastRecord && (
                  <>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
                    <InsightRow label="Last Inspection" value={lastRecord.type} />
                    <InsightRow label="Held" value={fmtDate(lastRecord.date)} />
                    <InsightRow label="Result" value={lastRecord.result || 'Pending'} strong />
                  </>
                )}
              </SectionCard>
              <SectionCard flat title="After You Schedule" icon={<CalendarCheck size={17} weight="duotone" style={{ color: GOLD }} />}>
                <FlowSteps title="" steps={[
                  { title: 'Inspection Is on the Calendar', desc: 'Saved as Scheduled with the inspector and agency of record.' },
                  { title: 'Record the Result', desc: 'Pass, fail, or conditional — checklist deficiencies are counted per inspection.' },
                  { title: 'Failures Queue a Re-Inspection', desc: 'A failed type stays flagged here until a later inspection of that type passes.' },
                  { title: 'Records Feed Closeout', desc: 'Passed finals roll into the project closeout package.' },
                ]} />
              </SectionCard>
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      {!loading && inspections.length > 0 && (
        <ListToolbar
          module="inspections"
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by type, inspector, agency, or notes…"
          filters={[
            {key:'result',label:'Result',value:filterResult,onChange:setFilterResult,allLabel:'All Results',
              options:[
                {value:'passed',label:'Passed'},
                {value:'failed',label:'Failed'},
                {value:'pending',label:'Pending'},
                {value:'conditional pass',label:'Conditional Pass'},
              ]},
            {key:'type',label:'Type',value:filterType,onChange:setFilterType,allLabel:'All Types',
              options:INSPECTION_TYPES},
          ]}
          count={{shown:filteredInspections.length,total:inspections.length}}
          style={{marginBottom:14}}
        />
      )}

      {/* Records */}
      <SectionCard title="Inspection Records" icon={<ClipboardText size={17} weight="duotone" style={{ color: GOLD }} />} flush>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading…</div>
        ) : inspections.length === 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: ctx ? 'minmax(0, 1fr) 360px' : '1fr', alignItems: 'stretch' }}>
            <PremiumEmpty
              icon={<ClipboardText size={30} weight="duotone" style={{ color: GOLD }} />}
              title="No Inspections on Record"
              description={pctComplete > 0
                ? `${ctx?.project?.name || 'This project'} is ${pctComplete}% complete — inspection records are how the work gets signed off. ${suggestedType} is the next milestone in a typical sequence.`
                : 'Every passed inspection becomes part of the permanent project record — and failed ones are tracked until they re-pass. Schedule the first one to start the log.'}
              action={<button onClick={() => openCreate()} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Schedule {suggestedType}</button>}
            />
            {ctx && (
              <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', padding: '22px 24px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 900, color: 'rgba(255,255,255,0.45)', marginBottom: 10 }}>The Typical Sequence</div>
                {INSPECTION_TYPES.map((t, idx) => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '3.5px 0', fontSize: 12.5, color: t === suggestedType ? 'var(--brand-primary-strong)' : DIM, fontWeight: t === suggestedType ? 700 : 400 }}>
                    <span style={{ width: 17, height: 17, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, background: t === suggestedType ? 'var(--brand-primary-18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${t === suggestedType ? 'color-mix(in srgb, var(--brand-primary) 45%, transparent)' : 'rgba(255,255,255,0.12)'}`, color: t === suggestedType ? 'var(--brand-primary-strong)' : 'rgba(255,255,255,0.45)' }}>{idx + 1}</span>
                    {t}
                  </div>
                ))}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '10px 0' }} />
                <InsightRow label="Project Progress" value={`${pctComplete}%`} />
                <InsightRow label="Open Punch Items" value={String(openPunch)} accent={openPunch > 0 ? GOLD : undefined} />
                <InsightRow label="Subs on the Job" value={String((ctx?.subs || []).length)} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {['Type','Date','Inspector','Agency','Result','Deficiencies','Notes','Status'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredInspections.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: '26px 14px', textAlign: 'center', color: DIM, fontSize: 13 }}>No inspections match your search or filters.</td></tr>
                )}
                {filteredInspections.map(i => (
                  <tr key={i.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <td style={{ padding: '10px 14px', color: TEXT, fontWeight: 600 }}>{i.type}</td>
                    <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{i.date ? fmtDate(i.date) : '—'}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{i.inspector}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{i.agency}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {resultBadge(i.result)}
                      {awaitingReinspection.some(f => f.id === i.id) && (
                        <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, color: '#fca5a5' }}>Re-Inspect</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: (Number(i.deficiency_count) || 0) > 0 ? 'var(--warning)' : DIM, fontWeight: (Number(i.deficiency_count) || 0) > 0 ? 700 : 400 }}>
                      {(Number(i.deficiency_count) || 0) > 0 ? i.deficiency_count : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{i.notes || '—'}</td>
                    <td style={{ padding: '10px 14px' }}><StatusPill module="inspections" status={i.status} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
