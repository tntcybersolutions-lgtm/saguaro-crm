'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { openPdf } from '@/components/PdfViewer';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import { Badge, Btn, Table, T } from '@/components/ui/shell';
import {
  PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty,
  StatStrip, FlowSteps, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle,
} from '@/components/ui/premium';
import { FileText, NotePencil, Export, CheckCircle, Plus, ClockCounterClockwise } from '@phosphor-icons/react';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { localDay } from '@/lib/calendar-day';

interface Spec {
  id: string;
  division: string;
  section: string;
  title: string;
  status: string;
  last_updated: string;
  url: string | null;
  related_submittals: string[];
  project_id: string;
}

const STATUS_BADGE: Record<string, 'muted' | 'blue' | 'amber' | 'green'> = {
  draft: 'muted',
  issued: 'blue',
  revised: 'amber',
  approved: 'green',
};

const EMPTY_FORM = { division: '', section: '', title: '' };

// Canonical CSI MasterFormat divisions — the shared taxonomy, never a partial list.
const DIV_CODES = Object.keys(CSI_DIVISIONS);
// Normalize any stored division value ("3", "03", "Division 03") to a 2-digit code.
function divCode(raw: string): string {
  const m = String(raw || '').match(/\d{1,2}/);
  if (!m) return '';
  const two = m[0].padStart(2, '0');
  return (CSI_DIVISIONS as Record<string, { name: string }>)[two] ? two : '';
}
function divName(code: string): string {
  return (CSI_DIVISIONS as Record<string, { name: string }>)[code]?.name || '';
}

// The API returns raw `specifications` rows (section_number / updated_at /
// file_url) whose names don't match this page's display fields. Normalize so a
// saved spec's section number and file link actually render on reload.
function normalizeSpec(r: Record<string, unknown>): Spec {
  return {
    id: String(r.id ?? ''),
    division: String(r.division ?? ''),
    section: String(r.section ?? r.section_number ?? ''),
    title: String(r.title ?? ''),
    status: String(r.status ?? 'draft'),
    last_updated: String(r.last_updated ?? r.updated_at ?? r.created_at ?? ''),
    url: (r.url as string | null) ?? (r.file_url as string | null) ?? (r.pdf_url as string | null) ?? null,
    related_submittals: Array.isArray(r.related_submittals) ? (r.related_submittals as string[]) : [],
    project_id: String(r.project_id ?? ''),
  };
}

export default function SpecsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `specs:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSave(),
  });
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [autoDiv, setAutoDiv] = useState(false);
  const [grouped, setGrouped] = useState(true);
  // ListToolbar state — status joins the existing search + view toggle (sag_flt_specs).
  const [statusFilter, setStatusFilter] = useState('all');

  // Project intelligence — one snapshot; the spec book walks in knowing the job.
  const { ctx } = useProjectContext(projectId);

  const fetchSpecs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/specs`);
      const json = await res.json();
      setSpecs((json.specs || []).map(normalizeSpec));
    } catch {
      setSpecs([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchSpecs(); }, [fetchSpecs]);

  const filtered = specs.filter(s =>
    (statusFilter === 'all' || s.status === statusFilter) &&
    (!search || s.title.toLowerCase().includes(search.toLowerCase()) || s.section.includes(search) || s.division.includes(search))
  );

  const draftCount = specs.filter(s => s.status === 'draft').length;
  const issuedCount = specs.filter(s => s.status === 'issued').length;
  const approvedCount = specs.filter(s => s.status === 'approved').length;

  // CSI-division grouping — canonical MasterFormat order, unknowns last.
  const byDivision: Record<string, Spec[]> = {};
  for (const s of filtered) {
    const code = divCode(s.division) || divCode(s.section) || '__';
    (byDivision[code] = byDivision[code] || []).push(s);
  }
  for (const code of Object.keys(byDivision)) byDivision[code].sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
  const divisionOrder = [...DIV_CODES.filter(c => byDivision[c]), ...(byDivision['__'] ? ['__'] : [])];
  const coveredDivisions = new Set(specs.map(s => divCode(s.division) || divCode(s.section)).filter(Boolean)).size;

  // Bid packages tell us which divisions the spec book still owes sections for.
  const pkgs = (ctx?.bidPackages || []) as { id: string; name: string; trade: string; csiDivision?: string; status?: string }[];
  const pkgDivisions = new Set(pkgs.map(p => divCode(String(p.csiDivision || ''))).filter(Boolean));
  const uncoveredPkgDivs = [...pkgDivisions].filter(c => !specs.some(s => (divCode(s.division) || divCode(s.section)) === c));
  const openSubmittals = Number(ctx?.counts?.openSubmittals) || 0;

  async function handleSave(): Promise<boolean> {
    if (!form.section || !form.title) { setErrorMsg('Section number and title are required.'); return false; }
    setSaving(true);
    setErrorMsg('');
    const today = localDay(); // This device's day — toISOString() is the UTC day, tomorrow from 7 PM on in Iowa.
    try {
      const res = await fetch('/api/specs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, status: 'draft', last_updated: today, ...form }),
      });
      const json = await res.json();
      if (!res.ok || !json.spec) throw new Error(json.error || 'Create failed');
      setSpecs(prev => [...prev, normalizeSpec(json.spec)].sort((a, b) => a.section.localeCompare(b.section)));
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Spec section added.');
      setTimeout(() => setSuccessMsg(''), 4000);
      guard.clearDraft();
      return true;
    } catch {
      setErrorMsg('Could not add the spec section. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadSpec(specId: string, file: File) {
    setUploading(specId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('specId', specId);
      const res = await fetch(`/api/specs/${specId}/upload`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('upload failed');
      setSuccessMsg('Spec file uploaded.');
      fetchSpecs();
    } catch {
      setErrorMsg('Could not upload the spec file. Please try again.');
    } finally {
      setUploading(null);
      setTimeout(() => { setSuccessMsg(''); setErrorMsg(''); }, 4000);
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, fontSize: 13, outline: 'none',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6 };
  const hint: React.CSSProperties = { fontSize: 11, color: 'var(--c-text-2)', marginTop: 5, lineHeight: 1.45 };

  const specRow = (s: Spec) => {
    const code = divCode(s.division) || divCode(s.section);
    return [
      <span key="sec" style={{ color: T.gold, fontWeight: 700 }}>{s.section}</span>,
      s.title,
      <span key="div" style={{ color: T.muted }}>{code ? `${code} — ${divName(code)}` : (s.division || '—')}</span>,
      <Badge key="st" label={s.status ? s.status.charAt(0).toUpperCase() + s.status.slice(1) : '—'} color={STATUS_BADGE[s.status] || 'muted'} />,
      <span key="upd" style={{ color: T.muted, whiteSpace: 'nowrap' }}>{s.last_updated ? String(s.last_updated).substring(0, 10) : '—'}</span>,
      <span key="sub" style={{ color: T.muted, fontSize: 12 }}>
        {s.related_submittals && s.related_submittals.length > 0 ? s.related_submittals.join(', ') : '—'}
      </span>,
      <div key="act" style={{ display: 'flex', gap: 6 }}>
        {s.url && (
          <Btn size="sm" variant="ghost" onClick={() => openPdf({ url: s.url!, title: `${s.section} — ${s.title}` })}>View</Btn>
        )}
        <label style={{ cursor: 'pointer' }}>
          <Btn size="sm" variant="ghost" disabled={uploading === s.id}>
            {uploading === s.id ? 'Uploading…' : 'Upload'}
          </Btn>
          <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUploadSpec(s.id, e.target.files[0]); }} />
        </label>
      </div>,
    ];
  };

  return (
    <PremiumSurface maxWidth={2200}>

      {/* Header */}
      <ModuleHero
        eyebrow={ctx?.project?.name || 'Specifications'}
        eyebrowIcon={<FileText size={13} weight="fill" style={{ color: 'var(--brand-primary)' }} />}
        title="Spec"
        accent="Sections"
        subtitle={specs.length > 0 ? `${specs.length} section${specs.length === 1 ? '' : 's'} across ${coveredDivisions} of ${DIV_CODES.length} CSI divisions.` : 'Project specifications organized by CSI division.'}
        actions={
          <button
            onClick={() => { setShowForm(p => !p); setErrorMsg(''); }}
            className="pmBtn"
            style={showForm ? ghostButtonStyle : goldButtonStyle}
          >
            {showForm ? 'Cancel' : (<><Plus size={15} weight="bold" /> Add Section</>)}
          </button>
        }
      />

      {/* Project intelligence strip — what the system already knows */}
      {ctx && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/specs`,  label: 'Project', value: ctx.project?.projectNumber || ctx.project?.name || '—', sub: ctx.project?.status ? String(ctx.project.status).replace(/_/g, ' ') : 'Active' },
          {href: `/app/projects/${projectId}/specs`,  label: 'Divisions Covered', value: `${coveredDivisions} of ${DIV_CODES.length}`, sub: 'CSI MasterFormat' },
          {href: `/app/projects/${projectId}/bid-packages`,  label: 'Bid Packages', value: String(pkgs.length), sub: pkgDivisions.size > 0 ? `Across ${pkgDivisions.size} division${pkgDivisions.size === 1 ? '' : 's'}` : 'None scoped yet' },
          {href: `/app/projects/${projectId}/specs`,  label: 'Spec Gaps', value: String(uncoveredPkgDivs.length), accent: uncoveredPkgDivs.length > 0 ? T.gold : T.green, sub: uncoveredPkgDivs.length > 0 ? `Div ${uncoveredPkgDivs.slice(0, 3).join(', ')}${uncoveredPkgDivs.length > 3 ? '…' : ''} unspecified` : 'Every package covered' },
          {href: `/app/projects/${projectId}/submittals`,  label: 'Open Submittals', value: String(openSubmittals), accent: openSubmittals > 0 ? T.gold : undefined, sub: 'Reviewed against the book' },
          {href: `/app/projects/${projectId}/subs`,  label: 'Subs on the Job', value: String((ctx.subs || []).length), sub: 'Bound by these sections' },
        ]} />
      )}

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard
          icon={<FileText size={19} weight="duotone" color={T.gold} />}
          label="Total Sections" value={String(specs.length)} accent={T.gold}
          sub={coveredDivisions > 0 ? `Across ${coveredDivisions} division${coveredDivisions === 1 ? '' : 's'}` : 'Across all divisions'} delay={0.02}
         href={`/app/projects/${projectId}/specs`}/>
        <StatCard
          icon={<NotePencil size={19} weight="duotone" color={T.gold} />}
          label="Draft" value={String(draftCount)}
          sub="Not yet issued" delay={0.06}
         href={`/app/projects/${projectId}/specs`}/>
        <StatCard
          icon={<Export size={19} weight="duotone" color={T.gold} />}
          label="Issued" value={String(issuedCount)} accent={T.gold}
          sub="Out for review" delay={0.10}
         href={`/app/projects/${projectId}/specs`}/>
        <StatCard
          icon={<CheckCircle size={19} weight="duotone" color={T.green} />}
          label="Approved" value={String(approvedCount)} accent={T.green}
          sub="Finalized" delay={0.14}
         href={`/app/projects/${projectId}/specs`}/>
      </div>

      {successMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(74,222,128,0.4)`, borderRadius: 10, color: T.green, fontSize: 13 }}>{successMsg}</div>
      )}
      {errorMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: T.redDim, border: `1px solid rgba(248,113,113,0.4)`, borderRadius: 10, color: T.red, fontSize: 13 }}>{errorMsg}</div>
      )}

      {/* Create Form */}
      {showForm && (
        <div style={{ display: 'grid', gridTemplateColumns: ctx ? 'minmax(0, 1fr) 320px' : '1fr', gap: 18, alignItems: 'start', marginBottom: 24 }}>
        <SectionCard
          icon={<Plus size={17} weight="bold" color={T.gold} />}
          title="Add Spec Section"
          subtitle={uncoveredPkgDivs.length > 0 ? `${uncoveredPkgDivs.length} bid-package division${uncoveredPkgDivs.length === 1 ? ' still has' : 's still have'} no spec section.` : 'Sections file themselves under their CSI division.'}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div>
              <label style={lbl}>Division{autoDiv && form.division ? <AutoChip /> : null}</label>
              <select value={form.division} onChange={e => { setAutoDiv(false); setForm(p => ({ ...p, division: e.target.value })); }} style={inp}>
                <option value="">Select division…</option>
                {DIV_CODES.map(c => <option key={c} value={c}>{c} — {divName(c)}</option>)}
              </select>
              <div style={hint}>{form.division && divName(form.division) ? `Files under Division ${form.division} — ${divName(form.division)}.` : `All ${DIV_CODES.length} CSI MasterFormat divisions — or type the section number and it fills itself.`}</div>
            </div>
            <div>
              <label style={lbl}>Section # *</label>
              <input value={form.section} onChange={e => {
                const v = e.target.value;
                const auto = divCode(v);
                if (auto) setAutoDiv(true);
                setForm(p => ({ ...p, section: v, division: auto || p.division }));
              }} placeholder="e.g. 03 31 00" style={inp} />
              <div style={hint}>MasterFormat number — the division fills itself from the first two digits.</div>
            </div>
            <div>
              <label style={lbl}>Title *</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder={form.division && divName(form.division) ? `e.g. ${divName(form.division)}` : 'e.g. Cast-in-Place Concrete'} style={inp} />
              <div style={hint}>Section title as it reads in the project manual.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              className="pmBtn"
              style={{ ...goldButtonStyle, opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Saving…' : 'Save Section'}
            </button>
            <button
              onClick={() => { setShowForm(false); setErrorMsg(''); }}
              className="pmBtn"
              style={ghostButtonStyle}
            >
              Cancel
            </button>
          </div>
        </SectionCard>
        {ctx && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SectionCard flat title="What Saguaro Knows" icon={<ClockCounterClockwise size={17} weight="duotone" color={T.gold} />}>
              <InsightRow label="Spec Sections" value={`${specs.length} across ${coveredDivisions} division${coveredDivisions === 1 ? '' : 's'}`} />
              <InsightRow label="Bid Packages" value={String(pkgs.length)} />
              <InsightRow label="Open Submittals" value={String(openSubmittals)} accent={openSubmittals > 0 ? T.gold : undefined} />
              <InsightRow label="Subs on the Job" value={String((ctx.subs || []).length)} />
              {uncoveredPkgDivs.length > 0 && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--brand-primary-08)', border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)', fontSize: 12, color: 'var(--brand-primary-strong)', lineHeight: 1.5 }}>
                  Bid packages reference Division{uncoveredPkgDivs.length === 1 ? '' : 's'} {uncoveredPkgDivs.join(', ')} with no spec section yet — start there.
                </div>
              )}
            </SectionCard>
            <SectionCard flat title="After You Save" icon={<FileText size={17} weight="duotone" color={T.gold} />}>
              <FlowSteps title="" steps={[
                { title: 'Section Files by Division', desc: 'The book groups itself in CSI MasterFormat order.' },
                { title: 'Upload the PDF', desc: 'Attach the section document right from the register row.' },
                { title: 'Issue for Coordination', desc: 'Move draft to issued when it goes out to bidders and subs.' },
                { title: 'Submittals Check Against It', desc: 'Product data and shop drawings get reviewed against this section.' },
              ]} />
            </SectionCard>
          </div>
        )}
        </div>
      )}

      {/* List toolbar — search + status filter; view toggle rides in extra */}
      <ListToolbar
        module="specs"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search sections…"
        filters={[{ key: 'status', label: 'Status', value: statusFilter, onChange: setStatusFilter, allLabel: 'All Statuses', options: [
          { value: 'draft', label: 'Draft' },
          { value: 'issued', label: 'Issued' },
          { value: 'revised', label: 'Revised' },
          { value: 'approved', label: 'Approved' },
        ] }]}
        count={{ shown: filtered.length, total: specs.length }}
        style={{ marginBottom: 16 }}
        extra={
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <button onClick={() => setGrouped(true)} style={{ padding: '7px 13px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: grouped ? T.gold : 'transparent', color: grouped ? 'var(--on-brand)' : T.muted }}>By Division</button>
            <button onClick={() => setGrouped(false)} style={{ padding: '7px 13px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: !grouped ? T.gold : 'transparent', color: !grouped ? 'var(--on-brand)' : T.muted }}>Flat List</button>
          </div>
        }
      />

      {/* Table */}
      <SectionCard
        icon={<FileText size={17} weight="duotone" color={T.gold} />}
        title="Sections"
        flush
      >
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: T.muted, fontSize: 13 }}>Loading specifications…</div>
        ) : specs.length === 0 ? (
          <div style={{ padding: '12px 8px' }}>
            <PremiumEmpty
              icon={<FileText size={30} weight="duotone" color={T.gold} />}
              title="Start the Spec Book"
              description={pkgs.length > 0
                ? `Your ${pkgs.length} bid package${pkgs.length === 1 ? ' already references' : 's already reference'} ${pkgDivisions.size > 0 ? `${pkgDivisions.size} CSI division${pkgDivisions.size === 1 ? '' : 's'}` : 'the CSI divisions'} — add a section per division and the book files itself in MasterFormat order. Submittals get reviewed against these sections.`
                : 'Add sections by CSI MasterFormat number — the book groups itself by division, and submittals get reviewed against each section.'}
              action={
                <button onClick={() => { setShowForm(true); setErrorMsg(''); }} className="pmBtn" style={goldButtonStyle}>
                  <Plus size={15} weight="bold" /> Add Section
                </button>
              }
            />
          </div>
        ) : grouped ? (
          <div>
            {divisionOrder.map(code => (
              <div key={code}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', background: 'var(--bg-surface-2)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--brand-primary-strong)' }}>{code === '__' ? 'Unassigned' : `Div ${code}`}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.white }}>{code === '__' ? 'No division set' : divName(code)}</span>
                  <span style={{ fontSize: 11.5, color: T.muted, marginLeft: 'auto' }}>{byDivision[code].length} section{byDivision[code].length === 1 ? '' : 's'}{pkgDivisions.has(code) ? ' · bid package scoped' : ''}</span>
                </div>
                <Table headers={['Section #', 'Title', 'Division', 'Status', 'Last Updated', 'Submittals', 'Actions']} rows={byDivision[code].map(specRow)} />
              </div>
            ))}
          </div>
        ) : (
          <Table
            headers={['Section #', 'Title', 'Division', 'Status', 'Last Updated', 'Submittals', 'Actions']}
            rows={filtered.map(s => [
              <span key="sec" style={{ color: T.gold, fontWeight: 700 }}>{s.section}</span>,
              s.title,
              <span key="div" style={{ color: T.muted }}>{s.division || '—'}</span>,
              <Badge key="st" label={s.status ? s.status.charAt(0).toUpperCase() + s.status.slice(1) : '—'} color={STATUS_BADGE[s.status] || 'muted'} />,
              <span key="upd" style={{ color: T.muted, whiteSpace: 'nowrap' }}>{s.last_updated || '—'}</span>,
              <span key="sub" style={{ color: T.muted, fontSize: 12 }}>
                {s.related_submittals && s.related_submittals.length > 0
                  ? s.related_submittals.join(', ')
                  : '—'}
              </span>,
              <div key="act" style={{ display: 'flex', gap: 6 }}>
                {s.url && (
                  <Btn size="sm" variant="ghost" onClick={() => openPdf({ url: s.url!, title: `${s.section} — ${s.title}` })}>View</Btn>
                )}
                <label style={{ cursor: 'pointer' }}>
                  <Btn size="sm" variant="ghost" disabled={uploading === s.id}>
                    {uploading === s.id ? 'Uploading…' : 'Upload'}
                  </Btn>
                  <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUploadSpec(s.id, e.target.files[0]); }} />
                </label>
              </div>,
            ])}
          />
        )}
      </SectionCard>
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
