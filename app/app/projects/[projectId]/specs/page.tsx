'use client';
/**
 * Spec Sections — the project manual by CSI MasterFormat division.
 *
 * Reads   GET  /api/projects/:id/specs
 * Create  POST /api/specs/create          { projectId, status:'draft', last_updated, division, section, title }
 * Upload  POST /api/specs/:specId/upload  (multipart: file, specId)
 * View    openPdf(url)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { openPdf } from '@/components/PdfViewer';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, Tabs, DataTable, EmptyState, Select,
  FormModal, Field, Input, FormGrid, Callout, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { FileText, Plus, Eye, UploadSimple, Files, PencilLine, PaperPlaneTilt, SealCheck, WarningCircle } from '@phosphor-icons/react';
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

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  issued: 'neutral',
  revised: 'lead',
  approved: 'ongoing',
};
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');

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
const specDiv = (s: Spec) => divCode(s.division) || divCode(s.section);

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

function fmtDay(v: string): string {
  if (!v) return '—';
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  return isNaN(d.getTime()) ? v.substring(0, 10) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
  const { toast, show } = useToast(4000);
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [autoDiv, setAutoDiv] = useState(false);
  const [grouped, setGrouped] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string | null>(null);

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
    const code = specDiv(s) || '__';
    (byDivision[code] = byDivision[code] || []).push(s);
  }
  const divisionOrder = [...DIV_CODES.filter(c => byDivision[c]), ...(byDivision['__'] ? ['__'] : [])];
  const coveredDivisions = new Set(specs.map(specDiv).filter(Boolean)).size;

  // Bid packages tell us which divisions the spec book still owes sections for.
  const pkgs = (ctx?.bidPackages || []) as { id: string; name: string; trade: string; csiDivision?: string; status?: string }[];
  const pkgDivisions = new Set(pkgs.map(p => divCode(String(p.csiDivision || ''))).filter(Boolean));
  const uncoveredPkgDivs = [...pkgDivisions].filter(c => !specs.some(s => specDiv(s) === c));
  const openSubmittals = Number(ctx?.counts?.openSubmittals) || 0;

  function openForm() { setShowForm(true); setErrorMsg(''); }
  function closeForm() { guard.requestClose(() => { setShowForm(false); setErrorMsg(''); }); }

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
      show('Spec section added.');
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
      show('Spec file uploaded.');
      fetchSpecs();
    } catch {
      show('Could not upload the spec file. Please try again.', 'bad');
    } finally {
      setUploading(null);
    }
  }

  function pickFile(specId: string) {
    uploadFor.current = specId;
    if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click(); }
  }

  const toggleStatus = (s: string) => setStatusFilter(prev => (prev === s ? 'all' : s));
  const stats: StatItem[] = [
    { label: 'Total sections', value: loading ? '—' : specs.length, sub: coveredDivisions > 0 ? `Across ${coveredDivisions} of ${DIV_CODES.length} divisions` : 'Across all divisions', icon: <Files size={15} />, onClick: () => setStatusFilter('all'), active: statusFilter === 'all' },
    { label: 'Draft', value: loading ? '—' : draftCount, sub: 'Not yet issued', icon: <PencilLine size={15} />, onClick: () => toggleStatus('draft'), active: statusFilter === 'draft' },
    { label: 'Issued', value: loading ? '—' : issuedCount, tone: issuedCount > 0 ? 'warn' : 'default', sub: 'Out for review', icon: <PaperPlaneTilt size={15} />, onClick: () => toggleStatus('issued'), active: statusFilter === 'issued' },
    { label: 'Approved', value: loading ? '—' : approvedCount, tone: approvedCount > 0 ? 'good' : 'default', sub: 'Finalized', icon: <SealCheck size={15} />, onClick: () => toggleStatus('approved'), active: statusFilter === 'approved' },
    ...(ctx ? [{
      label: 'Spec gaps', value: uncoveredPkgDivs.length, tone: uncoveredPkgDivs.length > 0 ? 'warn' : 'good',
      sub: uncoveredPkgDivs.length > 0 ? `Div ${uncoveredPkgDivs.slice(0, 3).join(', ')}${uncoveredPkgDivs.length > 3 ? '…' : ''} unspecified` : 'Every package covered',
      icon: <WarningCircle size={15} />,
    } as StatItem] : []),
  ];

  const columns: Column<Spec>[] = [
    { key: 'section', header: 'Section #', primary: true, phone: 'show', width: 130, accessor: (s) => s.section, render: (s) => s.section || '—' },
    { key: 'title', header: 'Title', phone: 'show', render: (s) => s.title || '—' },
    { key: 'division', header: 'Division', accessor: (s) => specDiv(s) || s.division, render: (s) => { const c = specDiv(s); return c ? `${c} — ${divName(c)}` : (s.division || '—'); } },
    { key: 'status', header: 'Status', phone: 'show', accessor: (s) => cap(s.status), render: (s) => <Badge tone={STATUS_TONE[s.status] || 'neutral'} dot>{cap(s.status)}</Badge> },
    { key: 'last_updated', header: 'Last updated', accessor: (s) => s.last_updated || '', render: (s) => fmtDay(s.last_updated) },
    { key: 'related_submittals', header: 'Submittals', accessor: (s) => (s.related_submittals || []).join(', '), render: (s) => (s.related_submittals && s.related_submittals.length > 0 ? s.related_submittals.join(', ') : '—') },
  ];

  const rowActions = (s: Spec): Action[] => [
    { label: 'View', icon: <Eye size={14} />, onClick: () => openPdf({ url: s.url!, title: `${s.section} — ${s.title}` }), inline: true, hidden: !s.url },
    { label: uploading === s.id ? 'Uploading…' : 'Upload', icon: <UploadSimple size={14} />, onClick: () => pickFile(s.id), inline: true, disabled: uploading === s.id },
  ];

  const table = (rows: Spec[], opts: { id: string; bar: boolean }) => (
    <DataTable<Spec>
      tableId={opts.id}
      exportName="spec-sections"
      toolbar={opts.bar}
      columns={columns}
      rows={rows}
      loading={loading}
      rowKey={(s) => s.id}
      defaultSort={{ key: 'section', dir: 'asc' }}
      rowActions={rowActions}
      empty={specs.length === 0 ? (
        <EmptyState
          icon={<FileText size={22} />}
          title="Start the spec book"
          text={pkgs.length > 0
            ? `Your ${pkgs.length} bid package${pkgs.length === 1 ? ' references' : 's reference'} ${pkgDivisions.size > 0 ? `${pkgDivisions.size} CSI division${pkgDivisions.size === 1 ? '' : 's'}` : 'the CSI divisions'} — add a section per division.`
            : 'Add sections by CSI MasterFormat number.'}
          action={<Button icon={<Plus size={15} weight="bold" />} onClick={openForm}>Add section</Button>}
        />
      ) : (
        <EmptyState title="Nothing matches" text="Change the search or the status filter." action={<Button onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear filters</Button>} />
      )}
    />
  );

  const base = `/app/projects/${projectId}`;
  return (
    <div className="specWs">
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
          { label: 'Specifications' },
        ]}
        title="Spec sections"
        subtitle={specs.length > 0 ? `${specs.length} section${specs.length === 1 ? '' : 's'} across ${coveredDivisions} of ${DIV_CODES.length} CSI divisions.` : (ctx?.project?.name || undefined)}
        actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openForm}>Add section</Button>}
      >
        {(loading || specs.length > 0) && <StatRow items={stats} />}

        {!loading && specs.length > 0 && (
          <>
            <Tabs
              tabs={[{ key: 'division', label: 'By division', count: divisionOrder.length }, { key: 'flat', label: 'Flat list', count: filtered.length }]}
              value={grouped ? 'division' : 'flat'}
              onChange={(k) => setGrouped(k === 'division')}
            />
            <Toolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search sections…"
              filters={
                <Select aria-label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 'auto', minWidth: 150 }}
                  options={[{ value: 'all', label: 'All statuses' }, { value: 'draft', label: 'Draft' }, { value: 'issued', label: 'Issued' }, { value: 'revised', label: 'Revised' }, { value: 'approved', label: 'Approved' }]} />
              }
            />
          </>
        )}

        {grouped && !loading && filtered.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {divisionOrder.map(code => (
              <Card
                key={code}
                flush
                title={code === '__' ? 'Unassigned' : `Div ${code} — ${divName(code)}`}
                subtitle={`${byDivision[code].length} section${byDivision[code].length === 1 ? '' : 's'}`}
                actions={pkgDivisions.has(code) ? <Badge tone="neutral">Bid package scoped</Badge> : undefined}
              >
                {table(byDivision[code], { id: 'project-specs-division', bar: false })}
              </Card>
            ))}
          </div>
        ) : (
          <Card flush>{table(filtered, { id: 'project-specs', bar: true })}</Card>
        )}
      </PageShell>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; const id = uploadFor.current; if (f && id) handleUploadSpec(id, f); }}
      />

      <FormModal
        open={showForm}
        onClose={closeForm}
        title="Add spec section"
        subtitle={`${specs.length} section${specs.length === 1 ? '' : 's'} · ${pkgs.length} bid package${pkgs.length === 1 ? '' : 's'} · ${openSubmittals} open submittal${openSubmittals === 1 ? '' : 's'}`}
        onSubmit={async () => { await handleSave(); }}
        submitLabel="Save section"
        busy={saving}
        error={errorMsg}
      >
        {uncoveredPkgDivs.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Callout
              tone="warning"
              icon={<WarningCircle size={16} />}
              title={`Division${uncoveredPkgDivs.length === 1 ? '' : 's'} ${uncoveredPkgDivs.join(', ')} ${uncoveredPkgDivs.length === 1 ? 'has' : 'have'} a bid package but no spec section`}
            />
          </div>
        )}
        <FormGrid cols={3}>
          <Field label="Section #" required hint="The division fills itself from the first two digits.">
            <Input value={form.section} onChange={e => {
              const v = e.target.value;
              const auto = divCode(v);
              if (auto) setAutoDiv(true);
              setForm(p => ({ ...p, section: v, division: auto || p.division }));
            }} placeholder="e.g. 03 31 00" autoFocus />
          </Field>
          <Field label="Division" hint={form.division && divName(form.division) ? `${autoDiv ? 'Filled from the section number — ' : ''}Division ${form.division} — ${divName(form.division)}.` : `All ${DIV_CODES.length} CSI MasterFormat divisions.`}>
            <Select value={form.division} onChange={e => { setAutoDiv(false); setForm(p => ({ ...p, division: e.target.value })); }}
              placeholder="Select division…" options={DIV_CODES.map(c => ({ value: c, label: `${c} — ${divName(c)}` }))} />
          </Field>
          <Field label="Title" required hint="As it reads in the project manual.">
            <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder={form.division && divName(form.division) ? `e.g. ${divName(form.division)}` : 'e.g. Cast-in-Place Concrete'} />
          </Field>
        </FormGrid>
      </FormModal>

      <div style={{ position: 'relative', zIndex: 10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
