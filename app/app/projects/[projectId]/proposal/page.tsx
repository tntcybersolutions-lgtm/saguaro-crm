'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import MarkOutcomeModal from '@/components/bids/MarkOutcomeModal';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, StatStrip, FlowSteps, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { FileText, FilePlus, ClockCounterClockwise, SealCheck, Plus } from '@phosphor-icons/react';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { openPdf } from '@/components/PdfViewer';

const GOLD='var(--brand-primary)', RAISED='var(--bg-surface-2)', BORDER='rgba(255,255,255,0.12)', DIM='#CBD5E1', TEXT='#FFFFFF', GREEN='#3dd68c', RED='#ef4444';

interface Proposal {
  id: string;
  version: string;
  created_date: string;
  amount: number;
  status: string;
  notes: string;
  pdf_url: string | null;
  project_id: string;
}

const STATUS_MAP: Record<string, { bg: string; color: string }> = {
  Draft: { bg: 'rgba(143,163,192,.2)', color: DIM },
  Sent: { bg: 'color-mix(in srgb, var(--brand-primary) 20%, transparent)', color: 'var(--brand-primary-strong)' },
  Under_Review: { bg: 'color-mix(in srgb, var(--warning) 20%, transparent)', color: 'var(--warning)' },
  Accepted: { bg: 'rgba(61,214,140,.2)', color: GREEN },
  Superseded: { bg: 'rgba(143,163,192,.2)', color: DIM },
  Rejected: { bg: 'rgba(239,68,68,.2)', color: RED },
  Declined: { bg: 'rgba(239,68,68,.2)', color: RED },
};

const EMPTY_FORM = { amount: 0, notes: '' };

/* Statuses are stored in mixed case — the create route writes 'Draft', the
   send route 'sent', the status route 'accepted' / 'declined' / 'superseded'.
   Compare on the lowercase key and DISPLAY a title-case label, so the table
   never reads "Draft" beside "accepted" and an accepted version is always
   recognised as accepted. Stored values are left untouched. */
const statusKey = (s: string | null | undefined) => String(s || '').trim().toLowerCase().replace(/\s+/g, '_');
const statusLabel = (s: string | null | undefined) =>
  statusKey(s).split('_').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || '—';
const statusStyle = (s: string | null | undefined) => STATUS_MAP[statusLabel(s).replace(/ /g, '_')] || { bg: 'rgba(143,163,192,.2)', color: DIM };

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

  async function handleSend(id: string) {
    try {
      const res = await fetch(`/api/proposals/${id}/send`, { method: 'POST' });
      if (!res.ok) throw new Error('send failed');
      setProposals(prev => prev.map(p => p.id === id ? { ...p, status: 'Sent' } : p));
      setSuccessMsg('Proposal marked as sent.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      setErrorMsg('Could not mark the proposal as sent. Please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
    }
  }

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

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: 'var(--bg-surface-2)', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow={ctx?.project?.name || 'Proposal'}
        eyebrowIcon={<FileText size={13} weight="fill" style={{ color: 'var(--brand-primary)' }} />}
        title="Proposals &"
        accent="Contract Amounts"
        subtitle="Versions, contract amounts, and win/loss outcomes."
        actions={
          <button onClick={() => { if (showForm) { setShowForm(false); setErrorMsg(''); } else { openCreate(); } }} style={goldButtonStyle} className="pmBtn">
            <Plus size={15} weight="bold" /> New Version
          </button>
        }
      />

      {/* Contract intelligence strip — what the system already knows */}
      {ctx && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/contracts`,  label: 'Original Contract', value: fmt(original), sub: 'Base agreement' },
          {href: `/app/projects/${projectId}/change-orders`,  label: 'Approved COs', value: (coTotal >= 0 ? '+' : '') + fmt(coTotal), accent: coTotal > 0 ? GREEN : undefined, sub: `${Number(money?.approvedCoCount) || 0} approved${Number(money?.pendingCoCount) ? ` · ${money.pendingCoCount} pending` : ''}` },
          {href: `/app/projects/${projectId}/contracts`,  label: 'Contract to Date', value: fmt(revised), sub: 'Original + approved COs' },
          {href: `/app/projects/${projectId}/proposal`,  label: 'Versions', value: String(proposals.length), sub: lastProposal ? `Latest ${lastProposal.version} — ${statusLabel(lastProposal.status)}` : 'None yet' },
          {href: `/app/projects/${projectId}/proposal`,  label: 'Accepted', value: accepted ? fmt(Number(accepted.amount) || 0) : '—', accent: accepted ? GREEN : undefined, sub: accepted ? accepted.version : 'No accepted version yet' },
          {href: `/app/projects/${projectId}/proposal`,  label: 'Billed to Date', value: fmt(Number(money?.billedToDate) || 0), sub: `${Number(money?.billedPct) || 0}% of contract` },
        ]} />
      )}

      {/* Accepted proposal callout — the headline KPI */}
      {accepted && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard
            icon={<SealCheck size={19} weight="duotone" style={{ color: GREEN }} />}
            label="Accepted Proposal"
            value={`$${accepted.amount.toLocaleString()}`}
            accent={GREEN}
            sub={(() => { const d = revised > 0 ? (Number(accepted.amount) || 0) - revised : 0; const base = accepted.notes ? `${accepted.version} — ${accepted.notes}` : accepted.version; return d !== 0 ? `${base} · ${d > 0 ? '+' : '-'}${fmt(Math.abs(d))} vs contract to date` : base; })()}
           href={`/app/projects/${projectId}/proposal`}/>
        </div>
      )}

      {successMsg && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 10, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 10, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ display: 'grid', gridTemplateColumns: ctx ? 'minmax(0, 1fr) 320px' : '1fr', gap: 18, alignItems: 'start', marginBottom: 24 }}>
          <SectionCard title={`New Proposal Version (${latestVersion})`} icon={<FilePlus size={17} weight="duotone" style={{ color: GOLD }} />} subtitle={lastProposal ? `Supersedes ${lastProposal.version} — prior versions stay in the history below.` : 'First version on this project.'}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
              <div>
                <label style={label}>Amount ($) *{auto.amt && <AutoChip />}</label>
                <input type="number" value={form.amount} onChange={e => { setForm(p => ({ ...p, amount: Number(e.target.value) })); setAuto({}); }} style={inp} />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5, lineHeight: 1.45 }}>
                  {seed
                    ? <>Seeded from {seed.source} ({fmt(seed.amount)}).{seedOptions.filter(o => o.amount > 0 && o.amount !== seed.amount && o.amount !== Number(form.amount)).slice(0, 2).map(o => (
                        <span key={o.source}> Use {o.source}: <span onClick={() => { setForm(p => ({ ...p, amount: o.amount })); setAuto({ amt: true }); }} style={{ color: 'var(--brand-primary-strong)', fontWeight: 700, cursor: 'pointer' }}>{fmt(o.amount)}</span>.</span>
                      ))}</>
                    : <>No contract amount or takeoff on file yet — enter the proposed sum.</>}
                </div>
              </div>
              <div>
                <label style={label}>Notes</label>
                <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. Revised after value engineering" style={inp} />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5, lineHeight: 1.45 }}>What changed in this version — shows in the history table.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={handleSave} disabled={saving} style={{ ...goldButtonStyle, opacity: saving ? 0.7 : 1 }} className="pmBtn">
                {saving ? 'Saving…' : 'Create Version'}
              </button>
              <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={ghostButtonStyle} className="pmBtn">Cancel</button>
            </div>
          </SectionCard>
          {ctx && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionCard flat title="What Saguaro Knows" icon={<ClockCounterClockwise size={17} weight="duotone" style={{ color: GOLD }} />}>
                <InsightRow label="Original Contract" value={fmt(original)} />
                {coTotal !== 0 && <InsightRow label="Approved COs" value={(coTotal > 0 ? '+' : '') + fmt(coTotal)} accent={GREEN} />}
                <InsightRow label="Contract to Date" value={fmt(revised)} strong />
                <InsightRow label="Billed to Date" value={fmt(Number(money?.billedToDate) || 0)} />
                {accepted && <InsightRow label={`Accepted — ${accepted.version}`} value={fmt(acceptedAmount)} accent={GREEN} />}
                {takeoffSell > 0 && <InsightRow label="AI Takeoff Sell Total" value={fmt(takeoffSell)} accent={GOLD} />}
                {lastProposal && (
                  <>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
                    <InsightRow label={`Last Version — ${lastProposal.version}`} value={statusLabel(lastProposal.status)} />
                    <InsightRow label="Last Amount" value={fmt(Number(lastProposal.amount) || 0)} accent={GOLD} />
                  </>
                )}
              </SectionCard>
              <SectionCard flat title="After You Create" icon={<SealCheck size={17} weight="duotone" style={{ color: GOLD }} />}>
                <FlowSteps title="" steps={[
                  { title: 'Draft Is Versioned', desc: 'Prior versions mark themselves Superseded — the history stays intact.' },
                  { title: 'Attach the PDF & Send', desc: 'Upload the signed proposal and mark it sent to the client.' },
                  { title: 'Capture the Outcome', desc: 'Mark Accepted or Declined — win/loss feeds bidding analytics.' },
                  { title: 'Accepted Becomes the Contract', desc: 'The accepted amount headlines this project going forward.' },
                ]} />
              </SectionCard>
            </div>
          )}
        </div>
      )}

      {/* Version history */}
      <SectionCard title="Proposal Versions" icon={<ClockCounterClockwise size={17} weight="duotone" style={{ color: GOLD }} />} flush>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading…</div>
        ) : proposals.length === 0 ? (
          <PremiumEmpty
            icon={<FileText size={30} weight="duotone" style={{ color: GOLD }} />}
            title="No Proposals Yet"
            description={revised > 0
              ? `The contract sum to date is ${fmt(revised)} — start v1.0 prefilled at that amount, then version every revision and capture the win or loss.`
              : 'Create your first proposal version to start tracking contract amounts and outcomes.'}
            action={
              <button onClick={openCreate} style={goldButtonStyle} className="pmBtn">
                <Plus size={15} weight="bold" /> {revised > 0 ? `Start v1.0 at ${fmt(revised)}` : 'New Version'}
              </button>
            }
          />
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {['Version','Created','Amount','Status','Notes','Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {proposals.map(p => {
                  const sc = statusStyle(p.status);
                  const s = statusKey(p.status);
                  const outcomeSet = s === 'accepted' || s === 'declined' || s === 'rejected';
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: s === 'accepted' ? 'rgba(61,214,140,.06)' : 'transparent' }}>
                      <td style={{ padding: '10px 16px', color: GOLD, fontWeight: 700 }}>{p.version}</td>
                      <td style={{ padding: '10px 16px', color: DIM }}>{p.created_date}</td>
                      <td style={{ padding: '10px 16px', color: TEXT, fontWeight: 800, fontSize: 14 }}>${p.amount?.toLocaleString()}</td>
                      <td style={{ padding: '10px 16px' }}><span style={{ padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700 }}>{statusLabel(p.status)}</span></td>
                      <td style={{ padding: '10px 16px', color: DIM }}>{p.notes}</td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', display: 'flex', gap: 6, alignItems: 'center' }}>
                        {p.pdf_url && <button onClick={() => openPdf({ url: p.pdf_url! })} style={{ padding: '4px 10px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 5, color: DIM, fontSize: 12, cursor: 'pointer' }}>View PDF</button>}
                        {s === 'draft' && <button onClick={() => handleSend(p.id)} style={{ padding: '4px 10px', background: 'color-mix(in srgb, var(--brand-primary) 20%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-primary) 40%, transparent)', borderRadius: 5, color: 'var(--brand-primary-strong)', fontSize: 12, cursor: 'pointer' }}>Send</button>}
                        {!outcomeSet && <button onClick={() => handleMarkOutcome(p, true)} style={{ padding: '4px 10px', background: 'rgba(61,214,140,.2)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 5, color: GREEN, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Mark Accepted</button>}
                        {!outcomeSet && <button onClick={() => handleMarkOutcome(p, false)} style={{ padding: '4px 10px', background: 'rgba(239,68,68,.2)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 5, color: RED, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Mark Declined</button>}
                        <label style={{ padding: '4px 10px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 5, color: DIM, fontSize: 12, cursor: 'pointer' }}>
                          {uploadingId === p.id ? 'Uploading…' : 'Upload PDF'}
                          <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUpload(p.id, e.target.files[0]); }} />
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

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
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
