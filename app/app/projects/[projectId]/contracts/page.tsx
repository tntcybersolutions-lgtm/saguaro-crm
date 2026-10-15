'use client';
/**
 * Contracts — the job's subcontractor and vendor contract ledger, on the kit layout.
 *
 * Reads   GET  /api/projects/:id/contracts
 * Paper   /app/projects/:id/contracts/new/{subcontract|purchase-order|change-order|prime-contract}
 * Record  POST /api/contracts/create        (a contract papered elsewhere — "Record existing")
 * Upload  POST /api/contracts/:id/upload    (the signed copy; FormData { file })
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { humanError } from '@/lib/errors';
import { toCents, toDollars, sumCents } from '@/lib/calc';
import { SUB_TRADES } from '@/lib/construction-intelligence';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { openPdf } from '@/components/PdfViewer';
import { MODULES } from '@/lib/status-system';
import {
  PageShell, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select, Callout, Menu,
  FormModal, Field, Input, DateInput, Textarea, FormGrid, DetailList, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import {
  FileText, Plus, FileArrowUp, Eye, UsersThree, Gavel, Handshake, WarningCircle, CheckCircle,
  ShoppingCart, ArrowsClockwise, Scroll, Files, NotePencil,
} from '@phosphor-icons/react';

interface Contract {
  id: string;
  sub_name: string;
  trade: string;
  amount: number;
  status: string;
  execution_date: string | null;
  scope: string;
  start_date: string;
  end_date: string;
  retainage_pct: number;
  pdf_url: string | null;
  project_id: string;
}

const fmt = (n: number) => '$' + ((Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }));
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Date-only values parse at local noon so they never shift a day under UTC. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const EMPTY_FORM = { sub_name: '', trade: '', amount: 0, scope: '', start_date: '', end_date: '', retainage_pct: 10, party_email: '' };

// The `contracts` table stores party_name / scope_of_work / executed_date /
// amount — NOT the sub_name / scope / execution_date this UI was reading, so
// rows came back blank. Map the real DB columns onto the shape the page renders.
function normalizeContract(r: any): Contract {
  return {
    id: r.id,
    sub_name: r.party_name ?? r.vendor_name ?? r.counterparty_name ?? '',
    trade: r.trade ?? '',
    amount: Number(r.amount ?? r.contract_amount ?? 0),
    status: r.status ?? 'Draft',
    execution_date: r.executed_date ?? (r.executed_at ? String(r.executed_at).slice(0, 10) : null),
    scope: r.scope_of_work ?? r.scope_summary ?? '',
    start_date: r.start_date ?? '',
    end_date: r.end_date ?? '',
    retainage_pct: Number(r.retainage_pct ?? 0),
    pdf_url: r.pdf_url ?? r.file_url ?? null,
    project_id: r.project_id,
  };
}

const TONE: Record<string, BadgeTone> = { draft: 'neutral', waiting: 'under_contract', good: 'ongoing', done: 'completed', bad: 'overdue', warn: 'lead', active: 'ongoing' };
function contractBadge(status: string): { label: string; tone: BadgeTone } {
  const s = status || 'Draft';
  const def = MODULES.contracts?.statuses?.[s.toLowerCase()];
  return { label: def?.label || s, tone: (def && TONE[def.tone]) || 'neutral' };
}

/** Papering from a template is the common job, so it leads. */
const TEMPLATES = [
  { slug: 'subcontract', label: 'Subcontract', icon: <Handshake size={15} /> },
  { slug: 'purchase-order', label: 'Purchase order', icon: <ShoppingCart size={15} /> },
  { slug: 'change-order', label: 'Change order', icon: <ArrowsClockwise size={15} /> },
  { slug: 'prime-contract', label: 'Prime contract', icon: <Scroll size={15} /> },
] as const;

export default function ContractsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const base = `/app/projects/${projectId}`;
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const { toast, show } = useToast(4000);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `contracts:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSave(),
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTrade, setFilterTrade] = useState('all');

  // SmartCreate: the form walks in knowing the roster, the awards, and the
  // project defaults — /api/project-context in one round trip.
  const { ctx } = useProjectContext(projectId);
  const [party, setParty] = useState('');
  const [auto, setAuto] = useState<{ name?: boolean; trade?: boolean; amount?: boolean; ret?: boolean; scope?: boolean; dates?: boolean }>({});

  const freshForm = (c: any) => ({
    ...EMPTY_FORM,
    retainage_pct: Number(c?.defaults?.retainagePct) || EMPTY_FORM.retainage_pct,
    start_date: isoToday(),
    end_date: c?.project?.endDate ? String(c.project.endDate).slice(0, 10) : '',
  });

  // Seed the form defaults once the shared snapshot arrives — one-time
  // (ref-guarded) so a background revalidation never stomps what the GC typed.
  const ctxSeededRef = useRef(false);
  useEffect(() => {
    if (!ctx || ctxSeededRef.current) return;
    ctxSeededRef.current = true;
    setForm(p => ({
      ...p,
      retainage_pct: Number(ctx.defaults?.retainagePct) || p.retainage_pct,
      start_date: p.start_date || isoToday(),
      end_date: p.end_date || (ctx.project?.endDate ? String(ctx.project.endDate).slice(0, 10) : ''),
    }));
    setAuto(a => ({ ...a, ret: true, dates: true }));
  }, [ctx]);

  // Party picker: a roster sub or an awarded bid package pre-fills the form.
  function pickParty(val: string) {
    setParty(val);
    if (!val || !ctx) { setAuto(a => ({ ...a, name: false, trade: false, amount: false, scope: false })); return; }
    if (val.startsWith('sub:')) {
      const s = (ctx.subs || []).find((x: any) => String(x.membershipId) === val.slice(4));
      if (!s) return;
      const award = (ctx.bidPackages || []).find((b: any) => b.awardedTo && s.companyName && String(b.awardedTo).toLowerCase() === String(s.companyName).toLowerCase());
      const amount = Number(s.contractAmount) || Number(award?.awardedAmount) || 0;
      setForm(p => ({ ...p, sub_name: s.companyName || '', trade: s.trade || p.trade, amount: amount || p.amount, party_email: s.email || '' }));
      setAuto(a => ({ ...a, name: true, trade: !!s.trade, amount: amount > 0, scope: false }));
    } else if (val.startsWith('pkg:')) {
      const b = (ctx.bidPackages || []).find((x: any) => String(x.id) === val.slice(4));
      if (!b) return;
      const rosterMatch = (ctx.subs || []).find((x: any) => x.companyName && b.awardedTo && String(x.companyName).toLowerCase() === String(b.awardedTo).toLowerCase());
      const seededScope = `Full scope of the "${b.name}" bid package${b.csiDivision ? ` (CSI Division ${b.csiDivision})` : ''}, per the awarded proposal.`;
      const willSeedScope = !form.scope;
      setForm(p => ({ ...p, sub_name: b.awardedTo || '', trade: b.trade || p.trade, amount: Number(b.awardedAmount) || p.amount, scope: p.scope || seededScope, party_email: rosterMatch?.email || '' }));
      setAuto(a => ({ ...a, name: true, trade: !!b.trade, amount: Number(b.awardedAmount) > 0, scope: willSeedScope }));
    }
  }

  // Derived intelligence for the stats and the party snapshot.
  const money = ctx?.money;
  const roster = ((ctx?.subs || []) as any[]);
  const awardedPkgs = ((ctx?.bidPackages || []) as any[]).filter(b => b.awardedTo);
  const contractedNames = new Set(contracts.map(c => (c.sub_name || '').toLowerCase()).filter(Boolean));
  const unpapered = awardedPkgs.filter(b => !contractedNames.has(String(b.awardedTo).toLowerCase()));
  const selSub = party.startsWith('sub:') ? roster.find((x: any) => String(x.membershipId) === party.slice(4)) : null;
  const selPkg = party.startsWith('pkg:') ? awardedPkgs.find((x: any) => String(x.id) === party.slice(4)) : null;

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/contracts`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't load contracts.");
      setContracts((json.contracts || []).map(normalizeContract));
    } catch (e) {
      setContracts([]);
      setLoadError(e instanceof Error ? e.message : "Couldn't load contracts.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  // Dead-space kill (spec 4.1): an empty ledger opens straight into the
  // composer — the party picker (roster subs + awarded packages) IS the seed
  // flow. One-shot per visit so Cancel stays cancelled.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!loading && !loadError && contracts.length === 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setShowForm(true);
    }
  }, [loading, loadError, contracts.length]);

  function openRecord() { setFormError(''); setShowForm(true); }
  function closeRecord() { guard.requestClose(() => { setShowForm(false); setFormError(''); }); }

  async function handleSave(): Promise<boolean> {
    if (!form.sub_name || !form.trade || !form.amount) {
      setFormError('Subcontractor name, trade, and amount are required.');
      return false;
    }
    setSaving(true);
    setFormError('');
    try {
      // The create route reads snake_case and requires project_id + title +
      // party_name (both NOT NULL). Map the form's fields to the real column names.
      const res = await fetch('/api/contracts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          title: form.sub_name,
          party_name: form.sub_name,
          trade: form.trade,
          amount: form.amount,
          scope_of_work: form.scope,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          retainage_pct: form.retainage_pct,
          party_email: form.party_email || null,
          status: 'Draft',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.contract) throw new Error(json.error || 'Failed to save the contract.');
      setContracts(prev => [normalizeContract(json.contract), ...prev]);
      setShowForm(false);
      setForm(freshForm(ctx));
      setParty('');
      setAuto(a => ({ ret: a.ret, dates: a.dates }));
      show('Contract created successfully.');
      guard.clearDraft();
      return true;
    } catch (err: any) {
      console.error(err); setFormError(humanError(err, 'Failed to save the contract. Please try again.'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(id: string, file: File) {
    setUploadingId(id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/contracts/${id}/upload`, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to upload the signed contract.');
      // Attach the freshly signed url to this contract so "View PDF" appears now.
      const signedUrl: string | null = json.pdf_url || json.file_url || json.url || null;
      setContracts(prev => prev.map(c => (c.id === id ? { ...c, pdf_url: signedUrl } : c)));
      show('Signed contract uploaded.');
    } catch (err: any) {
      console.error(err); show(humanError(err, 'Failed to upload the signed contract. Please try again.'), 'bad');
    } finally {
      setUploadingId(null);
    }
  }

  function pickUpload(id: string) {
    uploadTarget.current = id;
    uploadInput.current?.click();
  }

  const total = toDollars(sumCents(contracts.map(c => toCents(c.amount || 0))));
  const contractTrades = Array.from(new Set(contracts.map(c => c.trade).filter(Boolean))).sort();
  const filteredContracts = contracts.filter(c => {
    if (search) {
      const q = search.toLowerCase();
      const hit = (c.sub_name || '').toLowerCase().includes(q)
        || (c.trade || '').toLowerCase().includes(q)
        || (c.scope || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (filterStatus !== 'all' && (c.status || 'Draft') !== filterStatus) return false;
    if (filterTrade !== 'all' && c.trade !== filterTrade) return false;
    return true;
  });
  const clearFilters = () => { setSearch(''); setFilterStatus('all'); setFilterTrade('all'); };

  const awardedTotal = awardedPkgs.reduce((s, b) => s + (Number(b.awardedAmount) || 0), 0);
  const approvedCoCount = Number(money?.approvedCoCount) || 0;
  const stats: StatItem[] = ctx ? [
    { label: 'Prime contract', value: fmt(money?.revisedContract || 0), icon: <Scroll size={15} />, sub: approvedCoCount > 0 ? `${fmt(money?.originalContract || 0)} + ${approvedCoCount} approved CO${approvedCoCount === 1 ? '' : 's'}` : 'Original + approved COs' },
    { label: 'Sub commitments', value: loading ? '—' : fmt(total), icon: <Handshake size={15} />, sub: loading ? undefined : `${contracts.length} contract${contracts.length === 1 ? '' : 's'} on the ledger`, onClick: clearFilters, active: !search && filterStatus === 'all' && filterTrade === 'all' },
    { label: 'Subs on roster', value: String(roster.length), icon: <UsersThree size={15} />, sub: 'Available as contract parties', href: `${base}/subs` },
    { label: 'Awarded packages', value: String(awardedPkgs.length), icon: <Gavel size={15} />, sub: `${fmt(awardedTotal)} awarded`, href: `${base}/bid-packages` },
    { label: 'Ready to paper', value: loading ? '—' : String(unpapered.length), icon: unpapered.length > 0 ? <WarningCircle size={15} /> : <CheckCircle size={15} />, tone: loading ? 'default' : unpapered.length > 0 ? 'warn' : 'good', sub: unpapered.length > 0 ? 'Awards without a contract' : 'Every award is contracted', onClick: unpapered.length > 0 ? openRecord : undefined },
  ] : [
    { label: 'Total contracts', value: loading ? '—' : String(contracts.length), icon: <FileText size={15} />, sub: 'On this project' },
    { label: 'Total value', value: loading ? '—' : fmt(total), icon: <Handshake size={15} />, sub: 'Combined contract value' },
  ];

  const columns: Column<Contract>[] = [
    { key: 'sub_name', header: 'Sub / vendor', primary: true, phone: 'show', render: c => c.sub_name || '—' },
    { key: 'trade', header: 'Trade' },
    { key: 'amount', header: 'Contract amount', align: 'right', total: 'sum', format: fmt, phone: 'show', accessor: c => Number(c.amount) || 0, render: c => <strong>{fmt(c.amount)}</strong> },
    { key: 'retainage_pct', header: 'Retainage', align: 'right', hidden: true, render: c => (c.retainage_pct ? `${c.retainage_pct}%` : '—') },
    { key: 'status', header: 'Status', phone: 'show', accessor: c => c.status || 'Draft', render: c => { const st = contractBadge(c.status); return <Badge tone={st.tone} dot>{st.label}</Badge>; } },
    { key: 'execution_date', header: 'Execution date', accessor: c => c.execution_date || '', render: c => fmtDate(c.execution_date) },
    { key: 'scope', header: 'Scope', hidden: true, render: c => <span title={c.scope} style={{ display: 'inline-block', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{c.scope || '—'}</span> },
  ];

  const rowActions = (c: Contract): Action[] => [
    { label: 'View PDF', icon: <Eye size={14} />, inline: true, hidden: !c.pdf_url, onClick: () => openPdf({ url: c.pdf_url! }) },
    { label: uploadingId === c.id ? 'Uploading…' : 'Upload signed', icon: <FileArrowUp size={14} />, inline: true, disabled: !!uploadingId, onClick: () => pickUpload(c.id) },
  ];

  const partySnapshot: [string, React.ReactNode][] | null = selSub ? [
    ['Company', selSub.companyName || '—'],
    ['Trade', selSub.trade || '—'],
    ['Roster commitment', fmt(Number(selSub.contractAmount) || 0)],
    ['Email', selSub.email || 'Not on file'],
    ['Roster status', String(selSub.status || '—').replace(/_/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase())],
  ] : selPkg ? [
    ['Package', selPkg.name],
    ['Awarded to', selPkg.awardedTo || '—'],
    ['Awarded amount', fmt(Number(selPkg.awardedAmount) || 0)],
    ...(Number(selPkg.budgetEstimate) > 0 ? [
      ['Budget estimate', fmt(Number(selPkg.budgetEstimate) || 0)] as [string, React.ReactNode],
      ['Vs. estimate', `${Number(selPkg.awardedAmount) - Number(selPkg.budgetEstimate) > 0 ? '+' : ''}${fmt(Number(selPkg.awardedAmount) - Number(selPkg.budgetEstimate))}`] as [string, React.ReactNode],
    ] : []),
    ...(selPkg.csiDivision ? [['CSI division', String(selPkg.csiDivision)] as [string, React.ReactNode]] : []),
  ] : null;

  return (
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
        { label: 'Contracts' },
      ]}
      title="Contracts"
      subtitle="Subcontractor and vendor contracts."
      actions={
        <>
          {/* "Record existing" logs a contract papered elsewhere — a different job from papering one here. */}
          <Button variant="ghost" icon={<NotePencil size={15} />} onClick={openRecord}>Record existing</Button>
          <Menu
            triggerLabel="Other templates"
            triggerIcon={<Files size={15} />}
            actions={TEMPLATES.slice(1).map(t => ({ label: t.label, icon: t.icon, href: `${base}/contracts/new/${t.slug}` }))}
          />
          <Button variant="primary" icon={<Plus size={15} weight="bold" />} href={`${base}/contracts/new/subcontract`}>New subcontract</Button>
        </>
      }
    >
      {!loadError && <StatRow items={stats} />}

      {!loading && !loadError && unpapered.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Callout
            tone="warning"
            icon={<WarningCircle size={18} />}
            title={`${unpapered.length} awarded bid package${unpapered.length === 1 ? ' has' : 's have'} no contract yet`}
            text={unpapered.slice(0, 3).map((b: any) => `${b.name} — ${b.awardedTo} (${fmt(Number(b.awardedAmount) || 0)})`).join(' · ') + (unpapered.length > 3 ? ` · +${unpapered.length - 3} more` : '')}
            actions={
              <>
                <Button size="sm" variant="ghost" onClick={openRecord}>Record existing</Button>
                <Button size="sm" href={`${base}/contracts/new/subcontract`}>Paper a subcontract</Button>
              </>
            }
          />
        </div>
      )}

      {!loading && !loadError && contracts.length > 0 && (
        <Toolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search contracts by party, trade, or scope…"
          filters={
            <>
              <Select aria-label="Status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 'auto', minWidth: 150 }}
                options={[{ value: 'all', label: 'All statuses' }, 'Draft', 'Sent', 'Executed', 'Complete']} />
              {contractTrades.length > 0 && (
                <Select aria-label="Trade" value={filterTrade} onChange={e => setFilterTrade(e.target.value)} style={{ width: 'auto', minWidth: 150, maxWidth: 260 }}
                  options={[{ value: 'all', label: 'All trades' }, ...contractTrades]} />
              )}
            </>
          }
        />
      )}

      {loadError ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load contracts" text={loadError} action={<Button onClick={fetchContracts}>Try again</Button>} />
      ) : (
        <DataTable<Contract>
          tableId="project-contracts"
          exportName="contracts"
          columns={columns}
          rows={filteredContracts}
          loading={loading}
          rowKey={c => c.id}
          defaultSort={{ key: 'sub_name', dir: 'asc' }}
          rowActions={rowActions}
          empty={
            contracts.length === 0 ? (
              <EmptyState
                icon={<FileText size={22} />}
                title="No contracts yet"
                text={unpapered.length > 0
                  ? `${unpapered.length} awarded bid package${unpapered.length === 1 ? ' is' : 's are'} ready to paper — pick one in Record existing and it fills itself in.`
                  : 'Paper the first sub or vendor commitment from a template, or record one signed elsewhere.'}
                action={<Button variant="primary" icon={<Plus size={15} weight="bold" />} href={`${base}/contracts/new/subcontract`}>New subcontract</Button>}
              />
            ) : (
              <EmptyState title="No contracts match" text="Change the search or the filters." action={<Button onClick={clearFilters}>Clear filters</Button>} />
            )
          }
        />
      )}

      <input
        ref={uploadInput}
        type="file"
        accept=".pdf,.doc,.docx"
        aria-label="Signed contract file"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; const id = uploadTarget.current; e.target.value = ''; if (f && id) handleUpload(id, f); }}
      />

      {/* Record an existing contract */}
      <FormModal
        open={showForm}
        onClose={closeRecord}
        title="Record existing contract"
        subtitle="Pick the party — the form fills in what the job already knows. Lands as a Draft on the ledger."
        onSubmit={async () => { await handleSave(); }}
        submitLabel="Save contract"
        busy={saving}
        error={formError}
      >
        <FormGrid cols={3}>
          <Field label="Contract party" span hint="Picking a roster sub or an awarded package auto-fills the party, trade, amount, and scope — everything stays editable.">
            <select className="k-select" value={party} onChange={e => pickParty(e.target.value)}>
              <option value="">Type a new party manually…</option>
              {roster.length > 0 && (
                <optgroup label={`Subs on this project (${roster.length})`}>
                  {roster.map((s: any) => (
                    <option key={`sub-${s.membershipId}`} value={`sub:${s.membershipId}`}>
                      {s.companyName || 'Unnamed sub'}{s.trade ? ` — ${s.trade}` : ''}{Number(s.contractAmount) > 0 ? ` — ${fmt(Number(s.contractAmount))}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {awardedPkgs.length > 0 && (
                <optgroup label={`Awarded bid packages (${awardedPkgs.length})`}>
                  {awardedPkgs.map((b: any) => (
                    <option key={`pkg-${b.id}`} value={`pkg:${b.id}`}>
                      {b.name} — {b.awardedTo}{Number(b.awardedAmount) > 0 ? ` — ${fmt(Number(b.awardedAmount))}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
          {partySnapshot && (
            <div className="k-span-all">
              <DetailList items={partySnapshot} />
            </div>
          )}
          <Field label="Subcontractor name" required hint={auto.name ? (selPkg ? `Awarded "${selPkg.name}".` : 'From the project sub roster.') : undefined}>
            <Input value={form.sub_name} onChange={e => setForm(p => ({ ...p, sub_name: e.target.value }))} />
          </Field>
          <Field label="Trade" required>
            <Select value={form.trade} onChange={e => setForm(p => ({ ...p, trade: e.target.value }))} placeholder="Select trade…"
              options={[...(form.trade && !SUB_TRADES.includes(form.trade) ? [form.trade] : []), ...SUB_TRADES]} />
          </Field>
          <Field label="Contract amount ($)" required hint={auto.amount ? (selPkg ? 'The awarded bid amount.' : 'Their committed amount on the roster.') : undefined}>
            <Input type="number" inputMode="decimal" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} />
          </Field>
          <Field label="Start date" hint={auto.dates && form.start_date ? 'Defaulted to today.' : undefined}>
            <DateInput value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
          </Field>
          <Field label="End date" hint={auto.dates && form.end_date ? 'Defaulted to project completion.' : undefined}>
            <DateInput value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
          </Field>
          <Field label="Retainage %" hint={auto.ret ? 'Project default — carried into pay apps and lien waivers.' : undefined}>
            <Input type="number" inputMode="decimal" value={form.retainage_pct} onChange={e => setForm(p => ({ ...p, retainage_pct: Number(e.target.value) }))} />
          </Field>
          <Field label="Scope of work" span hint={auto.scope ? 'Seeded from the awarded bid package — edit to match the executed scope.' : undefined}>
            <Textarea value={form.scope} onChange={e => setForm(p => ({ ...p, scope: e.target.value }))} rows={3} />
          </Field>
        </FormGrid>
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position: 'relative', zIndex: 10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
