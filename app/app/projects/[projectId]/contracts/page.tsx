'use client';
import { StatusPill } from '@/components/ui/Status';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { toCents, toDollars, sumCents } from '@/lib/calc';
import { SUB_TRADES } from '@/lib/construction-intelligence';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, StatStrip, FlowSteps, FlowStrip, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { SortableTh, usePersistedSort, useSortedRows } from '@/app/app/_shared/table-sort';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { FileText, CurrencyDollar, Plus, FilePlus, FileArrowUp, Eye, FileDashed, UsersThree, Signature } from '@phosphor-icons/react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { openPdf } from '@/components/PdfViewer';

const GOLD='var(--brand-primary)', DARK='var(--bg-base)', RAISED='var(--bg-surface)', BORDER='rgba(255,255,255,0.12)', DIM='var(--text-secondary)', TEXT='var(--text-primary)', GREEN='var(--success)', RED='var(--danger)';

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

function statusBadge(status: string) {
  return <StatusPill module="contracts" status={status} size="sm" />;
}

export default function ContractsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

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
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
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

  // Derived intelligence for the strip and the context rail.
  const money = ctx?.money;
  const roster = ((ctx?.subs || []) as any[]);
  const awardedPkgs = ((ctx?.bidPackages || []) as any[]).filter(b => b.awardedTo);
  const contractedNames = new Set(contracts.map(c => (c.sub_name || '').toLowerCase()).filter(Boolean));
  const unpapered = awardedPkgs.filter(b => !contractedNames.has(String(b.awardedTo).toLowerCase()));
  const selSub = party.startsWith('sub:') ? roster.find((x: any) => String(x.membershipId) === party.slice(4)) : null;
  const selPkg = party.startsWith('pkg:') ? awardedPkgs.find((x: any) => String(x.id) === party.slice(4)) : null;

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/contracts`);
      const json = await res.json();
      setContracts((json.contracts || []).map(normalizeContract));
    } catch {
      setContracts([]);
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
    if (!loading && contracts.length === 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setShowForm(true);
    }
  }, [loading, contracts.length]);

  async function handleSave(): Promise<boolean> {
    if (!form.sub_name || !form.trade || !form.amount) {
      setErrorMsg('Subcontractor name, trade, and amount are required.');
      return false;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      // The create route reads snake_case and requires project_id + title +
      // party_name (both NOT NULL). This form's fields are sub_name/scope, so the
      // old `{ projectId, ...form }` body left all three unset and the route 400'd
      // every time — no contract ever persisted. Map to the real column names.
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
      setSuccessMsg('Contract created successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
      guard.clearDraft();
      return true;
    } catch (err: any) {
      console.error(err); setErrorMsg(humanError(err, 'Failed to save the contract. Please try again.'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(id: string, file: File) {
    setUploadingId(id);
    setErrorMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/contracts/${id}/upload`, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to upload the signed contract.');
      // Attach the freshly signed url to this contract so "View PDF" appears now.
      const signedUrl: string | null = json.pdf_url || json.file_url || json.url || null;
      setContracts(prev => prev.map(c => (c.id === id ? { ...c, pdf_url: signedUrl } : c)));
      setSuccessMsg('Signed contract uploaded.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error(err); setErrorMsg(humanError(err, 'Failed to upload the signed contract. Please try again.'));
    } finally {
      setUploadingId(null);
    }
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

  // Sortable columns (R11 sweep) — amount sorts numerically, execution date as ISO.
  const { sort, cycleSort } = usePersistedSort('project-contracts', { key: 'sub', dir: 'asc' });
  const sortedContracts = useSortedRows(filteredContracts, sort, (c, key) => {
    switch (key) {
      case 'sub':    return c.sub_name || null;
      case 'trade':  return c.trade || null;
      case 'amount': return Number(c.amount) || 0;
      case 'status': return c.status || 'Draft';
      case 'exec':   return c.execution_date || null;
      default:       return (c as unknown as Record<string, unknown>)[key];
    }
  });
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: 'var(--bg-surface-2)', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };
  const hint: React.CSSProperties = { fontSize: 11, color: 'var(--c-text-2)', marginTop: 5, lineHeight: 1.45 };
  // Compact ghost action buttons for in-row actions (View PDF / Upload Signed).
  const rowBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + BORDER, borderRadius: 8, color: 'var(--c-text-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' };

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow="Contracts"
        eyebrowIcon={<FileText size={13} weight="fill" color={GOLD} />}
        title="Contract"
        accent="Ledger"
        subtitle="Subcontractor and vendor contracts"
        actions={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Papering from a template is the common job, so it leads. "New
                Contract" below still records a contract that was papered
                elsewhere, which is a different thing and stays available. */}
            {([
              ['subcontract', 'Subcontract'],
              ['purchase-order', 'Purchase Order'],
              ['change-order', 'Change Order'],
              ['prime-contract', 'Prime Contract'],
            ] as const).map(([slug, label], i) => (
              <a
                key={slug}
                href={`/app/projects/${projectId}/contracts/new/${slug}`}
                className="pmBtn"
                style={i === 0
                  ? { ...goldButtonStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }
                  : { minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.16)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
              >
                {i === 0 && <Plus size={15} weight="bold" />} {label}
              </a>
            ))}
            <button
              onClick={() => { setShowForm(p => !p); setErrorMsg(''); }}
              style={{ minHeight: 44, padding: '0 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.16)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Record Existing
            </button>
          </div>
        }
      />

      {/* What the system already knows — money, roster, awards */}
      {ctx && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/contracts`,  label: 'Prime Contract', value: fmt(money?.revisedContract || 0), sub: (money?.approvedCoCount || 0) > 0 ? `${fmt(money?.originalContract || 0)} + ${money.approvedCoCount} approved CO${money.approvedCoCount === 1 ? '' : 's'}` : 'Original + approved COs' },
          {href: `/app/projects/${projectId}/subs`,  label: 'Sub Commitments', value: fmt(total), sub: `${contracts.length} contract${contracts.length === 1 ? '' : 's'} on the ledger` },
          {href: `/app/projects/${projectId}/subs`,  label: 'Subs on Roster', value: String(roster.length), sub: 'Available as contract parties' },
          {href: `/app/projects/${projectId}/bid-packages`,  label: 'Awarded Packages', value: String(awardedPkgs.length), sub: `${fmt(awardedPkgs.reduce((s, b) => s + (Number(b.awardedAmount) || 0), 0))} awarded` },
          {href: `/app/projects/${projectId}/contracts`,  label: 'Ready to Paper', value: String(unpapered.length), accent: unpapered.length > 0 ? 'var(--brand-primary-strong)' : GREEN, sub: unpapered.length > 0 ? 'Awards without a contract' : 'Every award is contracted' },
          {href: `/app/projects/${projectId}/contracts`,  label: 'Default Retainage', value: `${Number(ctx.defaults?.retainagePct) || 10}%`, sub: 'From project contract terms' },
        ]} />
      )}

      {successMsg && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(74,222,128,.15)', border: '1px solid rgba(74,222,128,.4)', borderRadius: 10, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(248,113,113,.15)', border: '1px solid rgba(248,113,113,.4)', borderRadius: 10, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ marginBottom: 24, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 330px', gap: 18, alignItems: 'start' }}>
          <SectionCard title="New Contract" subtitle="Pick the party — the system fills in what it already knows" icon={<FilePlus size={17} weight="duotone" color={GOLD} />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <div style={{ gridColumn: 'span 3' }}>
                <label style={label}>Contract Party</label>
                <select value={party} onChange={e => pickParty(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="">Type a new party manually…</option>
                  {roster.length > 0 && (
                    <optgroup label={`Subs on This Project (${roster.length})`}>
                      {roster.map((s: any) => (
                        <option key={`sub-${s.membershipId}`} value={`sub:${s.membershipId}`}>
                          {s.companyName || 'Unnamed Sub'}{s.trade ? ` — ${s.trade}` : ''}{Number(s.contractAmount) > 0 ? ` — ${fmt(Number(s.contractAmount))}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {awardedPkgs.length > 0 && (
                    <optgroup label={`Awarded Bid Packages (${awardedPkgs.length})`}>
                      {awardedPkgs.map((b: any) => (
                        <option key={`pkg-${b.id}`} value={`pkg:${b.id}`}>
                          {b.name} — {b.awardedTo}{Number(b.awardedAmount) > 0 ? ` — ${fmt(Number(b.awardedAmount))}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <div style={hint}>Picking a roster sub or an awarded package auto-fills the party, trade, amount, and scope — everything stays editable.</div>
              </div>
              <div>
                <label style={label}>Subcontractor Name *{auto.name && <AutoChip/>}</label>
                <input type="text" value={form.sub_name} onChange={e => setForm(p => ({ ...p, sub_name: e.target.value }))} style={inp} />
                {auto.name && <div style={hint}>{selPkg ? `Awarded "${selPkg.name}".` : 'From the project sub roster.'}</div>}
              </div>
              <div>
                <label style={label}>Trade *{auto.trade && <AutoChip/>}</label>
                <select value={form.trade} onChange={e => setForm(p => ({ ...p, trade: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="">Select trade…</option>
                  {form.trade && !SUB_TRADES.includes(form.trade) && <option value={form.trade}>{form.trade}</option>}
                  {SUB_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Contract Amount ($) *{auto.amount && <AutoChip/>}</label>
                <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} style={inp} />
                {auto.amount && <div style={hint}>{selPkg ? 'The awarded bid amount.' : 'Their committed amount on the roster.'}</div>}
              </div>
              <div>
                <label style={label}>Start Date{auto.dates && form.start_date ? <AutoChip/> : null}</label>
                <SaguaroDatePicker value={form.start_date} onChange={v => setForm(p => ({ ...p, start_date: v }))} style={inp} />
                {auto.dates && form.start_date ? <div style={hint}>Defaulted to today.</div> : null}
              </div>
              <div>
                <label style={label}>End Date{auto.dates && form.end_date ? <AutoChip/> : null}</label>
                <SaguaroDatePicker value={form.end_date} onChange={v => setForm(p => ({ ...p, end_date: v }))} style={inp} />
                {auto.dates && form.end_date ? <div style={hint}>Defaulted to project completion.</div> : null}
              </div>
              <div>
                <label style={label}>Retainage %{auto.ret && <AutoChip/>}</label>
                <input type="number" value={form.retainage_pct} onChange={e => setForm(p => ({ ...p, retainage_pct: Number(e.target.value) }))} style={inp} />
                {auto.ret && <div style={hint}>Project default — carried into pay apps and lien waivers.</div>}
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <label style={label}>Scope of Work{auto.scope && <AutoChip/>}</label>
                <textarea value={form.scope} onChange={e => setForm(p => ({ ...p, scope: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' }} />
                {auto.scope && <div style={hint}>Seeded from the awarded bid package — edit to match the executed scope.</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={handleSave} disabled={saving} style={{ ...goldButtonStyle, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} className="pmBtn">
                {saving ? 'Saving…' : 'Save Contract'}
              </button>
              <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={ghostButtonStyle} className="pmBtn">Cancel</button>
            </div>
          </SectionCard>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SectionCard flat title={selSub ? 'Party Snapshot' : selPkg ? 'Award Snapshot' : 'Ready to Paper'} icon={<UsersThree size={17} weight="duotone" color={GOLD} />}>
              {selSub ? (
                <>
                  <InsightRow label="Company" value={selSub.companyName || '—'} strong/>
                  <InsightRow label="Trade" value={selSub.trade || '—'}/>
                  <InsightRow label="Roster Commitment" value={fmt(Number(selSub.contractAmount) || 0)} accent={GOLD}/>
                  <InsightRow label="Email" value={selSub.email || 'Not on file'}/>
                  <InsightRow label="Roster Status" value={String(selSub.status || '—').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}/>
                </>
              ) : selPkg ? (
                <>
                  <InsightRow label="Package" value={selPkg.name} strong/>
                  <InsightRow label="Awarded To" value={selPkg.awardedTo || '—'}/>
                  <InsightRow label="Awarded Amount" value={fmt(Number(selPkg.awardedAmount) || 0)} accent={GOLD} strong/>
                  {Number(selPkg.budgetEstimate) > 0 && <InsightRow label="Budget Estimate" value={fmt(Number(selPkg.budgetEstimate) || 0)}/>}
                  {Number(selPkg.budgetEstimate) > 0 && (
                    <InsightRow
                      label="vs. Estimate"
                      value={`${Number(selPkg.awardedAmount) - Number(selPkg.budgetEstimate) > 0 ? '+' : ''}${fmt(Number(selPkg.awardedAmount) - Number(selPkg.budgetEstimate))}`}
                      accent={Number(selPkg.awardedAmount) - Number(selPkg.budgetEstimate) > 0 ? 'var(--brand-primary-strong)' : GREEN}
                    />
                  )}
                  {selPkg.csiDivision && <InsightRow label="CSI Division" value={String(selPkg.csiDivision)}/>}
                </>
              ) : ctx ? (
                <>
                  <InsightRow label="Subs on Roster" value={String(roster.length)}/>
                  <InsightRow label="Awarded Packages" value={String(awardedPkgs.length)}/>
                  <InsightRow label="Awards Without Contract" value={String(unpapered.length)} accent={unpapered.length > 0 ? 'var(--brand-primary-strong)' : GREEN} strong/>
                  {unpapered.slice(0, 3).map((b: any) => (
                    <div key={b.id} style={{ fontSize: 11.5, color: DIM, padding: '5px 0', borderTop: '1px solid rgba(255,255,255,0.06)', lineHeight: 1.5 }}>
                      {b.name} — <span style={{ color: TEXT, fontWeight: 700 }}>{b.awardedTo}</span> ({fmt(Number(b.awardedAmount) || 0)})
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: DIM, lineHeight: 1.6 }}>Pick a roster sub or an awarded bid package above and the contract fills itself in.</div>
              )}
            </SectionCard>
            <SectionCard flat title="After You Save" icon={<Signature size={17} weight="duotone" color={GOLD} />}>
              <FlowSteps title="" steps={[
                { title: 'Draft on the Ledger', desc: 'The contract lands here as a Draft, counted in sub commitments.' },
                { title: 'Send for Signature', desc: 'Send the package out — status moves to Sent while you wait on ink.' },
                { title: 'Executed', desc: 'Upload the signed copy; the linked bid package flips to contracted and committed costs update.' },
              ]}/>
            </SectionCard>
          </div>
        </div>
      )}

      {/* KPI stats (fallback when the project snapshot is unavailable) */}
      {!loading && !ctx && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          <StatCard
            icon={<FileText size={19} weight="duotone" color={GOLD} />}
            label="Total Contracts"
            value={String(contracts.length)}
            accent={GOLD}
            sub="On this project"
           href={`/app/projects/${projectId}/contracts`}/>
          <StatCard
            icon={<CurrencyDollar size={19} weight="duotone" color={GOLD} />}
            label="Total Value"
            value={`$${total.toLocaleString()}`}
            accent={GOLD}
            sub="Combined contract value"
           href={`/app/projects/${projectId}/contracts`}/>
        </div>
      )}

      {/* Toolbar */}
      {!loading && contracts.length > 0 && (
        <ListToolbar
          module="contracts"
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search contracts by party, trade, or scope…"
          filters={[
            { key: 'status', label: 'Status', value: filterStatus, onChange: setFilterStatus, allLabel: 'All Statuses',
              options: ['Draft', 'Sent', 'Executed', 'Complete'] },
            { key: 'trade', label: 'Trade', value: filterTrade, onChange: setFilterTrade, allLabel: 'All Trades',
              options: contractTrades },
          ]}
          count={{ shown: filteredContracts.length, total: contracts.length }}
          style={{ marginBottom: 14 }}
        />
      )}

      {/* Contract table */}
      <SectionCard title="Contracts" subtitle="Subcontractor and vendor contracts" icon={<FileText size={17} weight="duotone" color={GOLD} />}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading…</div>
        ) : contracts.length === 0 ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>
                <FileDashed size={16} weight="duotone" color={GOLD} style={{ marginRight: 7, verticalAlign: 'text-bottom' }} />
                No Contracts Yet
                <span style={{ fontWeight: 400, color: DIM }}>
                  {unpapered.length > 0
                    ? ` — ${unpapered.length} awarded bid package${unpapered.length === 1 ? ' is' : 's are'} ready to paper: pick one in the form ${showForm ? 'above' : 'here'} and it fills itself in.`
                    : showForm ? ' — the form above pre-fills from your roster and awarded packages.' : ' — paper the first sub or vendor commitment.'}
                </span>
              </div>
              {!showForm && (
                <button onClick={() => { setShowForm(true); setErrorMsg(''); }} style={goldButtonStyle} className="pmBtn">
                  <Plus size={15} weight="bold" /> New Contract
                </button>
              )}
            </div>
            <FlowStrip steps={[
              { title: 'Pick the Party', desc: 'Roster sub or awarded package' },
              { title: 'Draft on the Ledger', desc: 'Counted in commitments' },
              { title: 'Send for Signature' },
              { title: 'Executed', desc: 'Committed costs update' },
            ]} />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {([
                    ['Sub / Vendor','sub'],['Trade','trade'],['Contract Amount','amount'],
                    ['Status','status'],['Execution Date','exec'],['Actions',undefined],
                  ] as [string, string|undefined][]).map(([h,k]) => (
                    <SortableTh key={h} label={h} sortKey={k} sort={sort} onSort={cycleSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedContracts.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '26px 14px', textAlign: 'center', color: DIM, fontSize: 13 }}>No contracts match your search or filters.</td></tr>
                )}
                {sortedContracts.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <td style={{ padding: '10px 14px', color: TEXT, fontWeight: 600 }}>{c.sub_name}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{c.trade}</td>
                    <td style={{ padding: '10px 14px', color: GOLD, fontWeight: 700 }}>${c.amount?.toLocaleString()}</td>
                    <td style={{ padding: '10px 14px' }}>{statusBadge(c.status)}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{c.execution_date || '—'}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {c.pdf_url && (
                        <button onClick={() => openPdf({ url: c.pdf_url! })} style={{ ...rowBtn, marginRight: 6 }}><Eye size={13} weight="bold" /> View PDF</button>
                      )}
                      <label style={rowBtn}>
                        <FileArrowUp size={13} weight="bold" /> {uploadingId === c.id ? 'Uploading…' : 'Upload Signed'}
                        <input type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUpload(c.id, e.target.files[0]); }} />
                      </label>
                    </td>
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
