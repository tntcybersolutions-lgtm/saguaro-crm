'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import MarkOutcomeModal from '@/components/bids/MarkOutcomeModal';
import {
  PageShell, Card, StatRow, Badge, Button, DataTable, EmptyState, Callout,
  FormModal, Field, Input, FormGrid, Toast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import {
  FileText, ClockCounterClockwise, SealCheck, Plus, Receipt, Handshake, Wallet, WarningCircle,
  X, PaperPlaneTilt, FilePdf, UploadSimple, ThumbsUp, ThumbsDown,
} from '@phosphor-icons/react';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { openPdf } from '@/components/PdfViewer';
import ProposalSignPanel from '@/components/proposals/ProposalSignPanel';

interface Proposal {
  id: string;
  version: string;
  created_date: string;
  amount: number;
  status: string;
  notes: string;
  pdf_url: string | null;
  project_id: string;
  // Sent for e-signature (lib/esign-events keeps these current).
  client_name: string;
  client_email: string;
  viewed_at: string | null;
  signed_by: string | null;
  signed_at: string | null;
  decline_reason: string | null;
}

const EMPTY_FORM = { amount: 0, notes: '' };

/* Statuses are stored in mixed case — the create route writes 'Draft', the
   send route 'sent', the status route 'accepted' / 'declined' / 'superseded'.
   Compare on the lowercase key and DISPLAY a title-case label, so the table
   never reads "Draft" beside "accepted" and an accepted version is always
   recognised as accepted. Stored values are left untouched. */
const statusKey = (s: string | null | undefined) => String(s || '').trim().toLowerCase().replace(/\s+/g, '_');
const statusLabel = (s: string | null | undefined) =>
  statusKey(s).split('_').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || '—';
/** One status → one badge: draft neutral, out with the client amber, accepted green, declined red, superseded grey. */
function statusTone(s: string | null | undefined): BadgeTone {
  const k = statusKey(s);
  if (k === 'accepted' || k === 'signed') return 'ongoing';
  if (k === 'declined' || k === 'rejected') return 'overdue';
  if (k === 'superseded') return 'closed';
  if (k === 'sent' || k === 'under_review' || k === 'viewed') return 'lead';
  return 'neutral';
}

// The API returns raw `proposals` rows (proposal_number / created_at /
// description) that don't match this page's display fields (version /
// created_date / notes). Normalize so a saved proposal's version, date, and
// notes actually render on reload.
function normalizeProposal(r: Record<string, any>): Proposal {
  return {
    id: String(r.id ?? ''),
    version: String(r.version ?? r.proposal_number ?? ''),
    created_date: String(r.created_date ?? r.created_at ?? '').split('T')[0],
    amount: Number(r.amount ?? r.total_amount ?? 0),
    status: String(r.status ?? 'Draft'),
    notes: String(r.notes ?? r.description ?? ''),
    pdf_url: (r.pdf_url as string | null) ?? null,
    project_id: String(r.project_id ?? ''),
    client_name: String(r.client_name ?? ''),
    client_email: String(r.client_email ?? ''),
    viewed_at: (r.viewed_at as string | null) ?? null,
    signed_by: (r.signed_by as string | null) ?? null,
    signed_at: (r.signed_at as string | null) ?? null,
    decline_reason: (r.decline_reason as string | null) ?? null,
  };
}

export default function ProposalPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `proposal:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSave(),
  });
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // The version open in the e-sign panel (send to the client, then track it).
  const [signingId, setSigningId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  // Win/Loss capture: after flipping accept/decline we open the universal outcome modal.
  const [outcomeModal, setOutcomeModal] = useState<{ proposalId: string; defaultOutcome: 'won' | 'lost'; ourAmount: number } | null>(null);
  // Project intelligence — the proposal screen walks in knowing the contract money.
  const { ctx, revalidate: revalidateCtx } = useProjectContext(projectId);
  const [auto, setAuto] = useState<{ amt?: boolean }>({});

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/proposals`);
      const json = await res.json();
      setProposals((json.proposals || []).map(normalizeProposal));
    } catch {
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchProposals(); }, [fetchProposals]);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then(r => r.json())
      .then(d => { if (d?.project?.name) setProjectName(d.project.name); })
      .catch(() => {});
  }, [projectId]);

  // The newest accepted version is the contract (the status route supersedes older ones).
  const accepted = [...proposals].reverse().find(p => statusKey(p.status) === 'accepted') ?? null;
  const acceptedAmount = Number(accepted?.amount) || 0;
  const latestVersion = proposals.length ? `v${proposals.length + 1}.0` : 'v1.0';

  // Contract intelligence (from /api/project-context). DB numerics may be strings.
  const fmt = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const money = ctx?.money;
  // An accepted version IS the contract: if the project's contract columns are
  // still $0 (accepted before the status route wrote them), show the accepted amount.
  const original = Number(money?.originalContract) || acceptedAmount;
  const coTotal = Number(money?.approvedCoTotal) || 0;
  const revised = (Number(money?.revisedContract) || 0) > 0 ? Number(money?.revisedContract) : (original > 0 ? original + coTotal : 0);
  const lastProposal = proposals.length ? proposals[proposals.length - 1] : null;
  // The completed AI takeoff's SELL total (job cost through the markup stack),
  // from /api/project-context — the number a first proposal is built on.
  const takeoffSell = Number(ctx?.takeoff?.sellTotal) || 0;

  /* Prefill the new version from the best number the system already has, in
     order: the accepted version, the prior version, the contract sum to date,
     the completed takeoff's sell total. `seed.source` names where it came from. */
  const seedOptions: Array<{ amount: number; source: string }> = [
    { amount: acceptedAmount, source: accepted ? `accepted ${accepted.version}` : '' },
    { amount: Number(lastProposal?.amount) || 0, source: lastProposal ? `${lastProposal.version} (${statusLabel(lastProposal.status)})` : '' },
    { amount: revised, source: 'contract sum to date' },
    { amount: takeoffSell, source: 'AI takeoff sell total' },
  ];
  const seed = seedOptions.find(o => o.amount > 0) ?? null;

  function openCreate() {
    setForm({ amount: seed?.amount || 0, notes: '' });
    setAuto({ amt: Boolean(seed) });
    setShowForm(true);
    setErrorMsg('');
  }

  async function handleSave(): Promise<boolean> {
    if (!form.amount) { setErrorMsg('Amount is required.'); return false; }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/proposals/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, version: latestVersion, status: 'Draft', ...form }) });
      const json = await res.json();
      if (!res.ok || !json.proposal) throw new Error(json.error || 'Create failed');
      setProposals(prev => [...prev.map(p => statusKey(p.status) !== 'accepted' ? { ...p, status: 'Superseded' } : p), normalizeProposal(json.proposal)]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Proposal version created.');
      setTimeout(() => setSuccessMsg(''), 4000);
      guard.clearDraft();
      return true;
    } catch {
      setErrorMsg('Could not create the proposal. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  const signing = signingId ? proposals.find(p => p.id === signingId) ?? null : null;
  const fmtWhen = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  async function handleUpload(id: string, file: File) {
    setUploadingId(id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/proposals/${id}/upload`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('upload failed');
      setSuccessMsg('PDF uploaded.');
      fetchProposals();
    } catch {
      setErrorMsg('Could not upload the PDF. Please try again.');
    } finally {
      setUploadingId(null);
      setTimeout(() => { setSuccessMsg(''); setErrorMsg(''); }, 4000);
    }
  }

  // Flip the proposal's status, then open the universal win/loss capture modal.
  async function handleMarkOutcome(p: Proposal, accepted: boolean) {
    try {
      const res = await fetch(`/api/proposals/${p.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: accepted ? 'accepted' : 'declined' }),
      });
      if (!res.ok) throw new Error('status failed');
      // Optimistic: the accepted version supersedes any earlier accepted one.
      setProposals(prev => prev.map(x => x.id === p.id
        ? { ...x, status: accepted ? 'accepted' : 'declined' }
        : (accepted && statusKey(x.status) === 'accepted' ? { ...x, status: 'superseded' } : x)));
      setSuccessMsg(accepted ? `Proposal accepted — ${p.version} (${fmt(Number(p.amount) || 0)}) is now the contract.` : 'Proposal marked declined.');
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchProposals();
      // The contract columns changed server-side — refresh the money strip.
      if (accepted) revalidateCtx();
      setOutcomeModal({ proposalId: p.id, defaultOutcome: accepted ? 'won' : 'lost', ourAmount: p.amount });
    } catch {
      setErrorMsg(accepted ? 'Could not mark the proposal accepted. Please try again.' : 'Could not mark the proposal declined. Please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
    }
  }

  const base = `/app/projects/${projectId}`;
  const closeForm = () => { setShowForm(false); setErrorMsg(''); };
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadForRef = useRef<string | null>(null);
  const pickUpload = (id: string) => { uploadForRef.current = id; fileRef.current?.click(); };

  const stats: StatItem[] = [
    ...(ctx ? [
      { label: 'Approved COs', value: (coTotal >= 0 ? '+' : '') + fmt(coTotal), sub: `${Number(money?.approvedCoCount) || 0} approved${Number(money?.pendingCoCount) ? ` · ${money.pendingCoCount} pending` : ''}`, icon: <Receipt size={15} />, href: `${base}/change-orders` } as StatItem,
      { label: 'Contract to Date', value: fmt(revised), sub: `${fmt(original)} original + approved COs`, icon: <Handshake size={15} />, href: `${base}/contracts` } as StatItem,
    ] : []),
    { label: 'Versions', value: loading && proposals.length === 0 ? '—' : String(proposals.length), sub: lastProposal ? `Latest ${lastProposal.version} — ${statusLabel(lastProposal.status)}` : 'None yet', icon: <ClockCounterClockwise size={15} /> },
    {
      label: 'Accepted', value: accepted ? fmt(Number(accepted.amount) || 0) : '—', tone: accepted ? 'good' : 'default', icon: <SealCheck size={15} />,
      sub: accepted ? (() => { const d = revised > 0 ? (Number(accepted.amount) || 0) - revised : 0; const b = accepted.notes ? `${accepted.version} — ${accepted.notes}` : accepted.version; return d !== 0 ? `${b} · ${d > 0 ? '+' : '-'}${fmt(Math.abs(d))} vs contract to date` : b; })() : 'No accepted version yet',
    },
    ...(ctx ? [
      { label: 'Billed to Date', value: fmt(Number(money?.billedToDate) || 0), sub: `${Number(money?.billedPct) || 0}% of contract`, icon: <Wallet size={15} /> } as StatItem,
    ] : []),
  ];

  const columns: Column<Proposal>[] = [
    { key: 'version', header: 'Version', primary: true, phone: 'show', width: 96 },
    { key: 'created_date', header: 'Created', render: p => p.created_date || '—' },
    { key: 'amount', header: 'Amount', align: 'right', phone: 'show', accessor: p => Number(p.amount) || 0, render: p => <strong style={{ fontVariantNumeric: 'tabular-nums' }}>${(Number(p.amount) || 0).toLocaleString()}</strong> },
    {
      key: 'status', header: 'Status', phone: 'show', accessor: p => statusLabel(p.status),
      render: p => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <Badge tone={statusTone(p.status)} dot>{statusLabel(p.status)}</Badge>
          {p.signed_at
            ? <span style={{ fontSize: 12, color: 'var(--success)' }}>Signed by {p.signed_by || 'client'} · {fmtWhen(p.signed_at)}</span>
            : p.viewed_at && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Opened {fmtWhen(p.viewed_at)}</span>}
          {p.decline_reason && <span style={{ fontSize: 12, color: 'var(--danger)' }}>“{p.decline_reason}”</span>}
        </div>
      ),
    },
    { key: 'notes', header: 'Notes', render: p => p.notes || '—' },
  ];

  const rowActions = (p: Proposal): Action[] => {
    const s = statusKey(p.status);
    const outcomeSet = s === 'accepted' || s === 'declined' || s === 'rejected';
    return [
      { label: s === 'draft' ? 'Send to Client' : 'E-Sign Status', icon: <PaperPlaneTilt size={14} />, inline: true, hidden: !((!outcomeSet || p.signed_at || p.decline_reason) && s !== 'superseded'), onClick: () => setSigningId(signingId === p.id ? null : p.id) },
      { label: 'View PDF', icon: <FilePdf size={14} />, hidden: !p.pdf_url, onClick: () => openPdf({ url: p.pdf_url! }) },
      { label: uploadingId === p.id ? 'Uploading…' : 'Upload PDF', icon: <UploadSimple size={14} />, disabled: uploadingId === p.id, onClick: () => pickUpload(p.id) },
      { label: 'Mark Accepted', icon: <ThumbsUp size={14} />, hidden: outcomeSet, onClick: () => handleMarkOutcome(p, true) },
      { label: 'Mark Declined', icon: <ThumbsDown size={14} />, tone: 'danger', hidden: outcomeSet || s === 'signed', onClick: () => handleMarkOutcome(p, false) },
    ];
  };

  const altSeeds = seedOptions.filter(o => o.amount > 0 && seed && o.amount !== seed.amount && o.amount !== Number(form.amount)).slice(0, 2);

  return (
    <>
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || projectName || 'Project', href: `${base}/overview` },
          { label: 'Proposals' },
        ]}
        title="Proposals"
        subtitle="Versions, contract amounts and win/loss outcomes."
        actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={() => { if (showForm) closeForm(); else openCreate(); }}>New Version</Button>}
      >
        <StatRow items={stats} />

        {errorMsg && !showForm && (
          <div style={{ marginBottom: 16 }}>
            <Callout tone="danger" icon={<WarningCircle size={18} />} title={errorMsg} actions={<Button size="sm" variant="ghost" onClick={() => setErrorMsg('')}>Dismiss</Button>} />
          </div>
        )}

        {signing && (
          <div style={{ marginBottom: 16 }}>
            <Card
              title={signing.signed_at ? `${signing.version} — Signed` : signing.decline_reason || statusKey(signing.status) === 'declined' ? `${signing.version} — Declined` : statusKey(signing.status) === 'draft' ? `Send ${signing.version} to Your Client` : `${signing.version} — Waiting on Your Client`}
              icon={<SealCheck size={17} />}
              subtitle={signing.signed_at
                ? `${fmt(signing.amount)} — signed by ${signing.signed_by || 'your client'}. This is the contract.`
                : `${fmt(signing.amount)} — they read the terms and sign online. Signing makes it the contract.`}
              actions={<Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setSigningId(null)}>Close</Button>}
            >
              <ProposalSignPanel
                key={signing.id}
                proposalId={signing.id}
                defaultSigner={{
                  name: signing.client_name || ctx?.project?.ownerName || '',
                  email: signing.client_email || ctx?.project?.ownerEmail || '',
                  title: 'Owner',
                }}
                winLabel="make it the contract and mark the job won"
                canSend={(Number(signing.amount) || 0) > 0}
                onChanged={() => { fetchProposals(); revalidateCtx(); }}
              />
            </Card>
          </div>
        )}

        {/* Version history */}
        <Card title="Proposal Versions" icon={<ClockCounterClockwise size={17} />} flush>
          <DataTable<Proposal>
            tableId="project-proposals"
            exportName="proposals"
            columns={columns}
            rows={proposals}
            rowKey={p => p.id}
            loading={loading && proposals.length === 0}
            rowStyle={p => (statusKey(p.status) === 'accepted' ? { background: 'color-mix(in srgb, var(--success) 6%, transparent)' } : undefined)}
            rowActions={rowActions}
            empty={
              <EmptyState
                icon={<FileText size={22} />}
                title="No proposals yet"
                text={revised > 0 ? `The contract sum to date is ${fmt(revised)}.` : 'Create the first version to track contract amounts and outcomes.'}
                action={<Button icon={<Plus size={15} weight="bold" />} onClick={openCreate}>{revised > 0 ? `Start v1.0 at ${fmt(revised)}` : 'New Version'}</Button>}
              />
            }
          />
        </Card>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          aria-hidden
          tabIndex={-1}
          onChange={e => {
            const f = e.target.files?.[0];
            const id = uploadForRef.current;
            e.target.value = '';
            if (f && id) handleUpload(id, f);
          }}
        />
      </PageShell>

      <FormModal
        open={showForm}
        onClose={closeForm}
        title={`New Proposal Version (${latestVersion})`}
        subtitle={lastProposal ? `Supersedes ${lastProposal.version} — prior versions stay in the history.` : 'First version on this project.'}
        onSubmit={async () => { await handleSave(); }}
        submitLabel="Create Version"
        busy={saving}
        error={errorMsg}
      >
        <FormGrid cols={2}>
          <Field
            label="Amount ($)"
            required
            hint={seed
              ? <>Seeded from {seed.source} ({fmt(seed.amount)}).{altSeeds.map(o => (
                  <span key={o.source}> Use {o.source}: <button type="button" className="k-link" style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 700, cursor: 'pointer' }} onClick={() => { setForm(p => ({ ...p, amount: o.amount })); setAuto({ amt: true }); }}>{fmt(o.amount)}</button>.</span>
                ))}</>
              : 'No contract amount or takeoff on file yet — enter the proposed sum.'}
          >
            <Input type="number" inputMode="decimal" value={form.amount} onChange={e => { setForm(p => ({ ...p, amount: Number(e.target.value) })); setAuto({}); }} />
          </Field>
          <Field label="Notes" hint="What changed in this version — shows in the history.">
            <Input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. Revised after value engineering" />
          </Field>
        </FormGrid>
      </FormModal>

      {outcomeModal && (
        <MarkOutcomeModal
          open
          onClose={() => setOutcomeModal(null)}
          source="proposal"
          sourceId={outcomeModal.proposalId}
          defaultOutcome={outcomeModal.defaultOutcome}
          projectName={projectName || undefined}
          ourAmount={outcomeModal.ourAmount || undefined}
          onRecorded={() => fetchProposals()}
        />
      )}
      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position: 'relative', zIndex: 10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <Toast message={successMsg || null} />
    </>
  );
}
