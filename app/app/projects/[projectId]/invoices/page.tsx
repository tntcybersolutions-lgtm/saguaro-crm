'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useSort, useSortedRows, SortTh, SortBar } from '@/components/ui/sort';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { toCents, toDollars, sumCents, scaleCents } from '@/lib/calc';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, StatStrip, FlowSteps, InsightRow, AutoChip, IconChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { Receipt, CurrencyDollar, CheckCircle, WarningCircle, PencilSimple, Percent, Copy, Trash, Plus, CaretDown, ClockCounterClockwise, Calculator } from '@phosphor-icons/react';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { moduleAccent } from '@/lib/module-identity';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { openPdf } from '@/components/PdfViewer';

const GOLD='var(--brand-primary)', DARK='var(--bg-base)', RAISED='var(--bg-surface)', BORDER='rgba(255,255,255,0.12)', DIM='#D4D4D8', TEXT='#FFFFFF', GREEN='#2CFF7A', RED='#FF3B30';

interface Invoice {
  id: string;
  invoice_number: string;
  vendor_name: string;
  vendor_email?: string;
  description: string;
  amount: number;
  tax?: number | null;
  total?: number | null;
  pdf_url?: string | null;
  due_date: string;
  status: string;
  notes: string;
  project_id: string;
  created_at?: string;
}

// Lowercase-keyed — the server stores lowercase statuses; rows written before
// the normalization ('Sent', 'Draft') resolve to the same keys via statusKey().
const STATUS_MAP: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: 'rgba(143,163,192,.2)', color: DIM, label: 'Draft' },
  sent: { bg: 'var(--brand-primary-18)', color: 'var(--brand-primary-strong)', label: 'Sent' },
  pending: { bg: 'color-mix(in srgb, var(--warning) 20%, transparent)', color: 'var(--warning)', label: 'Pending' },
  approved: { bg: 'rgba(44,255,122,.2)', color: GREEN, label: 'Approved' },
  paid: { bg: 'rgba(44,255,122,.2)', color: GREEN, label: 'Paid' },
  overdue: { bg: 'rgba(255,59,48,.2)', color: RED, label: 'Overdue' },
};

/** Lowercase-normalized status — kills the 'Sent' vs 'sent' split-brain. */
const statusKey = (s?: string | null) => (s || 'draft').toLowerCase();

/** Canonical invoice figure: stored total when non-zero, else amount + tax.
 *  TEXT-typed money columns -> Number() always; a stale 0 total defers to
 *  amount so real money never rolls up as $0. */
const INVOICE_COLS: { key: string; label: string }[] = [
  { key: 'invoice_number', label: 'Invoice #' }, { key: 'vendor_name', label: 'Bill To' }, { key: 'total', label: 'Total' }, { key: 'created_at', label: 'Issued' },
  { key: 'due_date', label: 'Due' }, { key: 'status', label: 'Status' }, { key: 'notes', label: 'Notes' }, { key: '', label: 'Actions' },
];

function effectiveTotal(i: { amount?: number | null; tax?: number | null; total?: number | null }): number {
  const t = Number(i.total);
  if (t > 0) return t;
  return (Number(i.amount) || 0) + (Number(i.tax) || 0);
}

const EMPTY_FORM = { invoice_number: '', vendor_name: '', vendor_email: '', description: '', amount: 0, tax: 0, cost_code: '', due_date: '', notes: '' };

export default function InvoicesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `invoices:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSave(),
  });
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // ListToolbar state — filters + sort persist per module via sag_flt_invoices.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/invoices`);
      const json = await res.json();
      setInvoices(json.invoices ?? []);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // Project intelligence — one snapshot; the create flow walks in already knowing the money.
  const { ctx } = useProjectContext(projectId);
  const [auto, setAuto] = useState<{ num?: boolean; billto?: boolean; email?: boolean; due?: boolean; desc?: boolean; amt?: boolean }>({});

  const money = ctx?.money;
  const original = Number(money?.originalContract) || 0;
  const coTotal = Number(money?.approvedCoTotal) || 0;
  const revised = Number(money?.revisedContract) || (original + coTotal);
  const ctxBilled = Number(money?.billedToDate) || 0;
  const ctxPaid = Number(money?.paidToDate) || 0;
  const lastApp = money?.lastPayApp || null;
  const certified = Number(lastApp?.currentPaymentDue) || 0;
  const costCodes = (ctx?.costCodes || []) as { division: string; costCode: string; description: string }[];
  const vendorNames = (ctx?.vendors || []) as string[];

  function openCreate(useCertified?: boolean) {
    const nextNum = Math.max(Number(ctx?.defaults?.nextInvoiceNumber) || 1, invoices.length + 1);
    const due = new Date(Date.now() + 30 * 86400000);
    const dueIso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    setForm({
      ...EMPTY_FORM,
      invoice_number: `INV-${String(nextNum).padStart(3, '0')}`,
      vendor_name: ctx?.defaults?.ownerName || '',
      vendor_email: ctx?.defaults?.ownerEmail || '',
      description: lastApp ? `Progress billing — Application #${lastApp.appNumber}` : '',
      amount: useCertified && certified > 0 ? certified : 0,
      due_date: dueIso,
    });
    setAuto({
      num: true,
      billto: !!ctx?.defaults?.ownerName,
      email: !!ctx?.defaults?.ownerEmail,
      due: true,
      desc: !!lastApp,
      amt: !!(useCertified && certified > 0),
    });
    setShowForm(true);
    setErrorMsg('');
  }

  // Local today (YYYY-MM-DD) — toISOString() is UTC, which rolls to tomorrow
  // in the Arizona evening and flags invoices overdue a day early.
  const nowD = new Date();
  const today = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')}`;
  // Overdue = due before today (local), and not paid / not a draft.
  const isOverdue = (i: Invoice) => !!i.due_date && i.due_date.slice(0, 10) < today && statusKey(i.status) !== 'paid' && statusKey(i.status) !== 'draft';
  const totalBilled = toDollars(sumCents(invoices.map(i => toCents(effectiveTotal(i)))));
  const totalPaid = toDollars(sumCents(invoices.filter(i => statusKey(i.status) === 'paid').map(i => toCents(effectiveTotal(i)))));
  const totalOutstanding = toDollars(sumCents(invoices.filter(i => { const st = statusKey(i.status); return st !== 'paid' && st !== 'draft'; }).map(i => toCents(effectiveTotal(i)))));

  // Toolbar-driven view of the list. Status matches the effective (overdue-aware) status.
  const q = search.trim().toLowerCase();
  const filteredInvoices = invoices
    .filter(inv => {
      const effStatus = isOverdue(inv) ? 'overdue' : statusKey(inv.status);
      if (statusFilter !== 'all' && effStatus !== statusFilter) return false;
      if (!q) return true;
      return [inv.invoice_number, inv.vendor_name, inv.description, inv.notes].some(v => String(v || '').toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (sortBy === 'amount') return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (sortBy === 'due') return String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'));
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
  // Column sort (any header, both directions) overrides the toolbar order above.
  const { sort: invSort, setSort: setInvSort, cycle: cycleInvSort } = useSort(null);
  const invSortValue = useCallback((inv: (typeof invoices)[number], key: string): unknown => {
    if (key === 'total') return effectiveTotal(inv);
    if (key === 'status') return isOverdue(inv) ? 'overdue' : statusKey(inv.status);
    return (inv as unknown as Record<string, unknown>)[key];
  }, []);
  const sortedInvoices = useSortedRows(filteredInvoices, invSort, invSortValue);

  async function handleSave(): Promise<boolean> {
    if (!form.invoice_number || !form.vendor_name || !form.amount) { setErrorMsg('Invoice number, bill-to, and amount are required.'); return false; }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/invoices/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        project_id: projectId,
        invoice_number: form.invoice_number,
        vendor_name: form.vendor_name,
        vendor_email: form.vendor_email || null,
        description: form.description,
        cost_code: form.cost_code || null,
        // Server is canonical for money — it computes total = amount + tax
        // itself and stores lowercase statuses.
        amount: Number(form.amount) || 0,
        tax: Number(form.tax) || 0,
        due_date: form.due_date || null,
        notes: form.notes,
        status: 'draft',
      }) });
      if (!res.ok) throw new Error('save failed');
      const json = await res.json();
      if (!json.invoice) throw new Error('save failed');
      setInvoices(prev => [...prev, json.invoice as Invoice]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Invoice created.');
      setTimeout(() => setSuccessMsg(''), 4000);
      guard.clearDraft();
      return true;
    } catch {
      setErrorMsg('Could not create the invoice. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSend(id: string) {
    try {
      const res = await fetch(`/api/invoices/${id}/send`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErrorMsg(json.error || 'Could not send the invoice.'); setTimeout(() => setErrorMsg(''), 5000); return; }
      setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: 'sent' } : i));
      setSuccessMsg('Invoice emailed to the client.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      setErrorMsg('Could not send the invoice. Please try again.');
      setTimeout(() => setErrorMsg(''), 5000);
    }
  }

  const fmt = (n: number) => '$' + ((Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }));

  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  /** POST /api/invoices/[id]/pdf -> { pdfUrl }, then open the document. Rows
   *  that already carry pdf_url open the real .pdf directly. */
  async function handlePdf(inv: Invoice) {
    if (inv.pdf_url) { openPdf({ url: `/api/files/open?u=${encodeURIComponent(inv.pdf_url)}` }); return; }
    setPdfBusy(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}/pdf`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.pdfUrl) throw new Error('pdf failed');
      openPdf({ url: data.pdfUrl });
      fetchInvoices();
    } catch {
      setErrorMsg('Could not generate the PDF. Please try again.'); setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setPdfBusy(null);
    }
  }

  function openInvMenu(id: string) { setMenuId(id); setEditId(null); setAdjustId(null); setDeleteId(null); }

  async function handleEditInv(id: string) {
    const amount = parseFloat(editVal);
    if (isNaN(amount) || amount < 0) return;
    const tax = Number(invoices.find(i => i.id === id)?.tax) || 0;
    // Send {amount, tax} and let the server recompute total = amount + tax;
    // the optimistic total mirrors that so effectiveTotal never shows stale money.
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, amount, total: amount + tax } : i));
    setEditId(null);
    try {
      const res = await fetch(`/api/invoices/${id}/update`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, tax }) });
      if (!res.ok) throw new Error('update failed');
      setSuccessMsg('Amount updated.'); setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setErrorMsg('Could not update the amount. Please try again.'); setTimeout(() => setErrorMsg(''), 4000);
      fetchInvoices();
    }
  }

  async function handleAdjustInv(id: string, pct: number) {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    const newAmt = toDollars(scaleCents(toCents(inv.amount), 1 + pct / 100));
    const tax = Number(inv.tax) || 0;
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, amount: newAmt, total: newAmt + tax } : i));
    setAdjustId(null);
    try {
      const res = await fetch(`/api/invoices/${id}/update`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: newAmt, tax }) });
      if (!res.ok) throw new Error('update failed');
      setSuccessMsg(`Adjusted ${pct > 0 ? '+' : ''}${pct}%`); setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setErrorMsg('Could not adjust the amount. Please try again.'); setTimeout(() => setErrorMsg(''), 4000);
      fetchInvoices();
    }
  }

  function handleCopyInv(id: string, amount: number) {
    navigator.clipboard.writeText(fmt(amount)).catch(() => {});
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
    setMenuId(null);
  }

  async function handleDeleteInv(id: string) {
    setInvoices(prev => prev.filter(i => i.id !== id));
    setDeleteId(null);
    try {
      const res = await fetch(`/api/invoices/${id}/delete`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setSuccessMsg('Invoice deleted.'); setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setErrorMsg('Could not delete the invoice. Please try again.'); setTimeout(() => setErrorMsg(''), 4000);
      fetchInvoices();
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: 'var(--bg-surface-2)', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };
  const hint: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5, lineHeight: 1.45 };

  return (
    <PremiumSurface maxWidth={2200}>

      {/* Header */}
      <ModuleHero
        eyebrow="Project Billing"
        eyebrowIcon={<IconChip size={24} vivid={moduleAccent('invoices').vivid ?? moduleAccent('invoices').hex}><Receipt size={13} weight="fill" color="#F8FAFC" /></IconChip>}
        accentColor={moduleAccent('invoices').hex}
        title="Client"
        accent="Invoices"
        subtitle="Owner billing and payment tracking."
        actions={
          <button onClick={() => { if (showForm) { setShowForm(false); setErrorMsg(''); } else { openCreate(); } }} style={goldButtonStyle} className="pmBtn">
            <Plus size={15} weight="bold" /> New Invoice
          </button>
        }
      />

      {/* Contract intelligence strip — what the system already knows */}
      {ctx && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/contracts`,  label: 'Original Contract', value: fmt(original), sub: 'Base agreement' },
          {href: `/app/projects/${projectId}/change-orders`,  label: 'Approved COs', value: (coTotal >= 0 ? '+' : '') + fmt(coTotal), accent: coTotal > 0 ? GREEN : undefined, sub: `${Number(money?.approvedCoCount) || 0} approved${Number(money?.pendingCoCount) ? ` · ${money.pendingCoCount} pending` : ''}` },
          {href: `/app/projects/${projectId}/contracts`,  label: 'Revised Contract', value: fmt(revised), sub: 'Contract sum to date' },
          {href: `/app/projects/${projectId}/invoices`,  label: 'Billed to Date', value: fmt(ctxBilled), sub: `${Number(money?.billedPct) || 0}% of revised` },
          {href: `/app/projects/${projectId}/invoices`,  label: 'Outstanding', value: fmt(Math.max(0, ctxBilled - ctxPaid)), accent: ctxBilled - ctxPaid > 0 ? GOLD : GREEN, sub: 'Billed, not yet collected' },
        ]} />
      )}

      {/* KPIs — invoice totals, falling back to live project money instead of $0 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard
          icon={<CurrencyDollar size={19} weight="duotone" color={GOLD} />}
          label="Total Billed" value={fmt(totalBilled > 0 ? totalBilled : ctxBilled)}
          sub={totalBilled > 0 ? `Across ${invoices.length} invoice${invoices.length === 1 ? '' : 's'}` : ctxBilled > 0 ? 'Project billed to date (pay apps)' : 'Across all invoices'} delay={0.02}
         href={`/app/projects/${projectId}/invoices`}/>
        <StatCard
          icon={<CheckCircle size={19} weight="duotone" color={GREEN} />}
          label="Total Paid" value={fmt(totalPaid > 0 ? totalPaid : ctxPaid)} accent={GREEN}
          sub={totalPaid > 0 ? 'Collected on invoices' : ctxPaid > 0 ? 'Collected on the contract' : 'Collected'} delay={0.06}
         href={`/app/projects/${projectId}/invoices`}/>
        <StatCard
          icon={<WarningCircle size={19} weight="duotone" color={totalOutstanding > 0 ? GOLD : GREEN} />}
          label="Outstanding" value={fmt(totalOutstanding > 0 ? totalOutstanding : Math.max(0, ctxBilled - ctxPaid))} accent={totalOutstanding > 0 || ctxBilled - ctxPaid > 0 ? GOLD : GREEN}
          sub={totalOutstanding > 0 ? 'Awaiting payment' : ctxBilled - ctxPaid > 0 ? 'Billed less collected (contract)' : 'Awaiting payment'} delay={0.10}
         href={`/app/projects/${projectId}/invoices`}/>
      </div>

      {successMsg && <div style={{ margin: '0 0 16px', padding: '10px 14px', background: 'rgba(44,255,122,.15)', border: '1px solid rgba(44,255,122,.4)', borderRadius: 10, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '0 0 16px', padding: '10px 14px', background: 'rgba(255,59,48,.15)', border: '1px solid rgba(255,59,48,.4)', borderRadius: 10, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ display: 'grid', gridTemplateColumns: ctx ? 'minmax(0, 1fr) 320px' : '1fr', gap: 18, alignItems: 'start', marginBottom: 24 }}>
          <SectionCard title="New Invoice" icon={<Plus size={17} weight="bold" color={GOLD} />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <div>
                <label style={label}>Invoice # *{auto.num && <AutoChip />}</label>
                <input type="text" value={form.invoice_number} onChange={e => setForm(p => ({ ...p, invoice_number: e.target.value }))} style={inp} />
                <div style={hint}>Next in sequence — {invoices.length} invoice{invoices.length === 1 ? '' : 's'} on this project so far.</div>
              </div>
              <div>
                <label style={label}>Bill To *{auto.billto && <AutoChip />}</label>
                <Suggest type="text" value={form.vendor_name} onChange={e => setForm(p => ({ ...p, vendor_name: e.target.value }))} placeholder="Client / owner name" style={inp} options={['ctx.defaults.ownerName', 'v']} />
                <div style={hint}>{auto.billto ? 'Owner of record from project setup.' : 'Who receives this invoice.'}</div>
              </div>
              <div>
                <label style={label}>Bill To Email{auto.email && <AutoChip />}</label>
                <input type="email" value={form.vendor_email} onChange={e => setForm(p => ({ ...p, vendor_email: e.target.value }))} placeholder="Required to email/send" style={inp} />
                <div style={hint}>{auto.email ? 'From the project owner record — Send to Owner delivers here.' : 'Needed for one-click Send to Owner.'}</div>
              </div>
              <div>
                <label style={label}>Amount ($) *{auto.amt && <AutoChip />}</label>
                <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} style={inp} />
                {lastApp && certified > 0 ? (
                  <div style={hint}>
                    App #{lastApp.appNumber} certified {fmt(certified)}.{' '}
                    <span onClick={() => { setForm(p => ({ ...p, amount: certified })); setAuto(a => ({ ...a, amt: true })); }} style={{ color: 'var(--brand-primary-strong)', fontWeight: 700, cursor: 'pointer' }}>Use Certified Amount</span>
                  </div>
                ) : (
                  <div style={hint}>Pre-tax invoice amount.</div>
                )}
              </div>
              <div>
                <label style={label}>Tax ($)</label>
                <input type="number" value={form.tax} onChange={e => setForm(p => ({ ...p, tax: Number(e.target.value) }))} style={inp} />
                <div style={hint}>Optional sales / use tax.</div>
              </div>
              <div>
                <label style={label}>Invoice Total</label>
                <div style={{ ...inp, display: 'flex', alignItems: 'center', fontWeight: 800, color: GOLD, background: 'var(--brand-primary-08)', border: '1px solid var(--brand-primary-35)' }}>
                  {'$' + ((Number(form.amount) || 0) + (Number(form.tax) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={hint}>Amount + tax — computed live.</div>
              </div>
              <div>
                <label style={label}>Issue Date<AutoChip /></label>
                <div style={{ ...inp, display: 'flex', alignItems: 'center', color: DIM }}>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                <div style={hint}>Recorded automatically when the invoice is created.</div>
              </div>
              <div>
                <label style={label}>Due Date{auto.due && <AutoChip />}</label>
                <SaguaroDatePicker value={form.due_date} onChange={v => setForm(p => ({ ...p, due_date: v }))} style={inp} />
                <div style={hint}>Net 30 from today — adjust freely. Overdue flags itself.</div>
              </div>
              <div>
                <label style={label}>Cost Code</label>
                {costCodes.length > 0 ? (
                  <select value={form.cost_code} onChange={e => setForm(p => ({ ...p, cost_code: e.target.value }))} style={inp}>
                    <option value="">No cost code</option>
                    {costCodes.map(c => <option key={c.costCode} value={c.costCode}>{c.costCode} — {c.description}</option>)}
                  </select>
                ) : (
                  <input type="text" value={form.cost_code} onChange={e => setForm(p => ({ ...p, cost_code: e.target.value }))} placeholder="e.g. 01-000" style={inp} />
                )}
                <div style={hint}>{costCodes.length > 0 ? `${costCodes.length} codes from the project budget.` : 'Optional — ties billing to the budget.'}</div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={label}>Description{auto.desc && <AutoChip />}</label>
                <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Mar 2026 progress" style={inp} />
                {auto.desc && lastApp && <div style={hint}>Suggested from Pay Application #{lastApp.appNumber}.</div>}
              </div>
              <div>
                <label style={label}>Notes</label>
                <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={handleSave} disabled={saving} style={{ ...goldButtonStyle, opacity: saving ? 0.7 : 1 }} className="pmBtn">
                {saving ? 'Saving…' : 'Create Invoice'}
              </button>
              <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={ghostButtonStyle} className="pmBtn">Cancel</button>
            </div>
          </SectionCard>
          {ctx && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionCard flat title="What Saguaro Knows" icon={<ClockCounterClockwise size={17} weight="duotone" color={GOLD} />}>
                <InsightRow label="Original Contract" value={fmt(original)} />
                {coTotal !== 0 && <InsightRow label="Approved COs" value={(coTotal > 0 ? '+' : '') + fmt(coTotal)} accent={GREEN} />}
                <InsightRow label="Revised Contract" value={fmt(revised)} />
                <InsightRow label="Billed to Date" value={fmt(ctxBilled)} />
                <InsightRow label="Paid to Date" value={fmt(ctxPaid)} accent={GREEN} />
                {lastApp && (
                  <>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
                    <InsightRow label={`Pay App #${lastApp.appNumber}`} value={String(lastApp.status || '—').replace(/_/g, ' ')} />
                    <InsightRow label="Certified This Period" value={fmt(certified)} accent={GREEN} strong />
                  </>
                )}
              </SectionCard>
              <SectionCard flat title="After You Create" icon={<Calculator size={17} weight="duotone" color={GOLD} />}>
                <FlowSteps title="" steps={[
                  { title: 'Draft Is Saved', desc: 'Edit the amount or adjust by % any time before sending.' },
                  { title: 'Send to Owner', desc: 'One click emails the invoice to the bill-to address above.' },
                  { title: 'Payment Is Tracked', desc: 'Outstanding and overdue status update automatically from the due date.' },
                  { title: 'Ledger updates', desc: 'Billed and paid totals roll into the project money snapshot.' },
                ]} />
              </SectionCard>
            </div>
          )}
        </div>
      )}

      <ListToolbar
        module="invoices"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search invoices…"
        filters={[{ key: 'status', label: 'Status', value: statusFilter, onChange: setStatusFilter, allLabel: 'All Statuses', options: [
          { value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' }, { value: 'paid', label: 'Paid' }, { value: 'overdue', label: 'Overdue' },
        ] }]}
        sort={sortBy}
        onSort={setSortBy}
        sortOptions={[
          { value: 'newest', label: 'Newest First' },
          { value: 'due', label: 'Due Date' },
          { value: 'amount', label: 'Amount (High First)' },
        ]}
        count={{ shown: filteredInvoices.length, total: invoices.length }}
        style={{ marginBottom: 16 }}
      />

      <SectionCard title="All Invoices" icon={<Receipt size={17} weight="duotone" color={moduleAccent('invoices').hex} />} flush>
        {loading ? <div><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /></div> : invoices.length === 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: ctx ? 'minmax(0, 1fr) 360px' : '1fr', alignItems: 'stretch' }}>
            <PremiumEmpty
              icon={<Receipt size={30} weight="duotone" color={GOLD} />}
              title="No invoices yet"
              description={ctxBilled > 0
                ? `You have certified ${fmt(ctxBilled)} across ${Number(money?.payAppCount) || 0} pay application${(Number(money?.payAppCount) || 0) === 1 ? '' : 's'} — client invoices track the money you collect against it.`
                : 'Create your first invoice to start billing owners and tracking payments.'}
              action={<button onClick={() => openCreate(certified > 0)} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> {certified > 0 ? `Invoice Certified ${fmt(certified)}` : 'New Invoice'}</button>}
            />
            {ctx && (
              <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', padding: '22px 24px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 900, color: 'rgba(255,255,255,0.45)', marginBottom: 10 }}>What Saguaro Already Knows</div>
                <InsightRow label="Original Contract" value={fmt(original)} />
                <InsightRow label="Approved COs" value={`${(coTotal > 0 ? '+' : '') + fmt(coTotal)} (${Number(money?.approvedCoCount) || 0})`} accent={coTotal > 0 ? GREEN : undefined} />
                <InsightRow label="Revised Contract" value={fmt(revised)} strong />
                <InsightRow label="Billed to Date" value={`${fmt(ctxBilled)} · ${Number(money?.billedPct) || 0}%`} />
                <InsightRow label="Paid to Date" value={fmt(ctxPaid)} accent={GREEN} />
                {lastApp ? (
                  <>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '10px 0' }} />
                    <InsightRow label={`Last Pay App — #${lastApp.appNumber}`} value={String(lastApp.status || '—').replace(/_/g, ' ')} />
                    <InsightRow label="Certified This Period" value={fmt(certified)} accent={GREEN} strong />
                    {certified > 0 && (
                      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--brand-primary-08)', border: '1px solid var(--brand-primary-25)', fontSize: 12, color: 'var(--brand-primary-strong)', lineHeight: 1.5 }}>
                        Start by invoicing the certified amount from App #{lastApp.appNumber} — the form pre-fills it.
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ marginTop: 12, fontSize: 12, color: DIM, lineHeight: 1.55 }}>
                    No pay applications yet — invoices can bill any milestone or deposit against the contract.
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <SortBar columns={INVOICE_COLS.filter(c => c.key) as { key: string; label: string }[]} sort={invSort} onChange={setInvSort} />
          <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {INVOICE_COLS.map(c => c.key
                  ? <SortTh key={c.key} col={c.key} label={c.label} sort={invSort} onSort={cycleInvSort} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }} />
                  : <th key={c.label} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{c.label}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedInvoices.map(inv => {
                const overdue = isOverdue(inv);
                const effKey = overdue ? 'overdue' : statusKey(inv.status);
                const sc = STATUS_MAP[effKey] || { bg: 'rgba(143,163,192,.2)', color: DIM, label: statusKey(inv.status) };
                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: overdue ? 'rgba(255,59,48,.05)' : 'transparent' }}>
                    <td style={{ padding: '10px 14px', color: GOLD, fontWeight: 700 }}>{inv.invoice_number}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{inv.vendor_name}</td>
                    <td style={{ padding: '10px 14px', position: 'relative' as const }}>
                      {deleteId === inv.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: RED, fontWeight: 600 }}>Delete?</span>
                          <button onClick={() => handleDeleteInv(inv.id)} style={{ padding: '3px 8px', background: 'rgba(255,59,48,.15)', border: '1px solid rgba(255,59,48,.3)', borderRadius: 5, color: RED, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Yes</button>
                          <button onClick={() => setDeleteId(null)} style={{ padding: '3px 8px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 5, color: DIM, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      ) : editId === inv.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input value={editVal} onChange={e => setEditVal(e.target.value)} type="number" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleEditInv(inv.id); if (e.key === 'Escape') setEditId(null); }} style={{ width: 100, padding: '4px 8px', background: DARK, border: `1px solid ${GOLD}`, borderRadius: 5, color: TEXT, fontSize: 12, outline: 'none', textAlign: 'right' }} />
                          <button onClick={() => handleEditInv(inv.id)} style={{ padding: '3px 8px', background: 'linear-gradient(135deg,var(--brand-primary),var(--brand-primary-strong))', border: 'none', borderRadius: 5, color: '#0A0A00', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                          <button onClick={() => setEditId(null)} style={{ padding: '3px 8px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 5, color: DIM, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      ) : adjustId === inv.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          {[-10, -5, 5, 10].map(p => (
                            <button key={p} onClick={() => handleAdjustInv(inv.id, p)} style={{ padding: '3px 7px', background: p > 0 ? 'rgba(44,255,122,.1)' : 'rgba(255,59,48,.1)', border: `1px solid ${p > 0 ? 'rgba(44,255,122,.25)' : 'rgba(255,59,48,.25)'}`, borderRadius: 5, color: p > 0 ? GREEN : RED, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{p > 0 ? '+' : ''}{p}%</button>
                          ))}
                          <button onClick={() => setAdjustId(null)} style={{ padding: '3px 6px', background: 'none', border: 'none', color: DIM, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: GOLD, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(effectiveTotal(inv))}</span>
                          {copiedId === inv.id && <span style={{ fontSize: 10, color: GREEN, fontWeight: 600 }}>Copied</span>}
                          <button onClick={() => openInvMenu(inv.id)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, opacity: 0.6, display: 'inline-flex', alignItems: 'center' }} onMouseEnter={e => (e.currentTarget.style.opacity = '1')} onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}><CaretDown size={11} weight="bold" /></button>
                          {menuId === inv.id && (
                            <div style={{ position: 'absolute', top: 36, right: 14, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 'var(--radius-md)', padding: 6, zIndex: 100, minWidth: 160, boxShadow: 'var(--shadow-lg)' }}>
                              {[
                                { label: 'Edit Amount', icon: <PencilSimple size={15} weight="bold" color={DIM} />, action: () => { setMenuId(null); setEditId(inv.id); setEditVal(String(inv.amount)); } },
                                { label: 'Adjust %', icon: <Percent size={15} weight="bold" color={DIM} />, action: () => { setMenuId(null); setAdjustId(inv.id); } },
                                { label: 'Copy Total', icon: <Copy size={15} weight="bold" color={DIM} />, action: () => handleCopyInv(inv.id, effectiveTotal(inv)) },
                              ].map(item => (
                                <div key={item.label} onClick={item.action} style={{ padding: '7px 12px', fontSize: 12, color: TEXT, cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 9 }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                  {item.icon}{item.label}
                                </div>
                              ))}
                              <div style={{ height: 1, background: BORDER, margin: '4px 0' }} />
                              <div onClick={() => { setMenuId(null); setDeleteId(inv.id); }} style={{ padding: '7px 12px', fontSize: 12, color: RED, cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 9 }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,59,48,.08)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                <Trash size={15} weight="bold" color={RED} />Delete Invoice
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '10px 14px', color: overdue ? RED : DIM, whiteSpace: 'nowrap' }}>{inv.due_date ? inv.due_date.slice(0, 10) : '—'}</td>
                    <td style={{ padding: '10px 14px' }}><span style={{ padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700 }}>{sc.label}</span></td>
                    <td style={{ padding: '10px 14px', color: DIM, fontSize: 12 }}>{inv.notes}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => handlePdf(inv)} disabled={pdfBusy === inv.id} title={inv.pdf_url ? 'Open PDF' : 'Generate PDF'} style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + BORDER, borderRadius: 5, color: inv.pdf_url ? 'var(--brand-primary-strong)' : DIM, fontSize: 12, cursor: 'pointer', opacity: pdfBusy === inv.id ? 0.5 : 1 }}>{pdfBusy === inv.id ? '…' : 'PDF'}</button>
                        {statusKey(inv.status) === 'draft' && (
                          <button onClick={() => handleSend(inv.id)} style={{ padding: '4px 12px', background: 'var(--brand-primary-18)', border: '1px solid var(--brand-primary-35)', borderRadius: 5, color: 'var(--brand-primary-strong)', fontSize: 12, cursor: 'pointer' }}>Send to Owner</button>
                        )}
                        {statusKey(inv.status) === 'paid' && <span style={{ color: GREEN, fontSize: 12 }}>Paid</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {menuId && <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setMenuId(null)} />}
          </div>
        )}
      </SectionCard>
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
