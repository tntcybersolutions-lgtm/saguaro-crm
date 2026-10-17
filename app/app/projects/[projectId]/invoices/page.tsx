'use client';
/**
 * Client invoices — owner billing and payment tracking, on the kit layout.
 *
 * Reads   GET    /api/projects/:id/invoices
 * Create  POST   /api/invoices/create        (server computes total = amount + tax)
 * Verbs   POST   /api/invoices/:id/send      (email to the bill-to address)
 *         POST   /api/invoices/:id/pdf       (→ { pdfUrl }; rows with pdf_url open it directly)
 *         PATCH  /api/invoices/:id/update    ({ amount, tax })
 *         DELETE /api/invoices/:id/delete
 */
import { jsonRequest } from '@/lib/list-view';
import { useEditRights } from '@/lib/hooks/usePermissions';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { toCents, toDollars, sumCents, scaleCents } from '@/lib/calc';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { openPdf } from '@/components/PdfViewer';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { MODULES } from '@/lib/status-system';
import {
  PageShell, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select, Callout,
  FormModal, Field, Input, DateInput, FormGrid, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import {
  Receipt, PencilSimple, Percent, Copy, Trash, Plus, FilePdf, PaperPlaneTilt,
  Handshake, Wallet, WarningCircle, ClockCounterClockwise, CheckCircle,
} from '@phosphor-icons/react';

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

/** Lowercase-normalized status — kills the 'Sent' vs 'sent' split-brain. */
const statusKey = (s?: string | null) => (s || 'draft').toLowerCase();

const TONE: Record<string, BadgeTone> = { draft: 'neutral', waiting: 'lead', good: 'ongoing', done: 'completed', bad: 'overdue', warn: 'lead', active: 'ongoing' };
function invBadge(key: string): { label: string; tone: BadgeTone } {
  const def = MODULES.invoices?.statuses?.[key];
  return { label: def?.label || (key.charAt(0).toUpperCase() + key.slice(1)), tone: (def && TONE[def.tone]) || 'neutral' };
}

/** Canonical invoice figure: stored total when non-zero, else amount + tax.
 *  TEXT-typed money columns -> Number() always; a stale 0 total defers to
 *  amount so real money never rolls up as $0. */
function effectiveTotal(i: { amount?: number | null; tax?: number | null; total?: number | null }): number {
  const t = Number(i.total);
  if (t > 0) return t;
  return (Number(i.amount) || 0) + (Number(i.tax) || 0);
}

const fmt = (n: number) => '$' + ((Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }));

/** Date-only values parse at local noon so they never shift a day under UTC. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const EMPTY_FORM = { invoice_number: '', vendor_name: '', vendor_email: '', description: '', amount: 0, tax: 0, cost_code: '', due_date: '', notes: '' };

type StatusFilter = 'all' | 'outstanding' | 'draft' | 'sent' | 'pending' | 'approved' | 'paid' | 'overdue';

export default function InvoicesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const base = `/app/projects/${projectId}`;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const { toast, show } = useToast(4000);
  const rights = useEditRights('Budget');

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
  const [formError, setFormError] = useState('');
  const [editInv, setEditInv] = useState<Invoice | null>(null);
  const [editVal, setEditVal] = useState('');
  const [adjustInv, setAdjustInv] = useState<Invoice | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/invoices`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't load invoices.");
      setInvoices(json.invoices ?? []);
    } catch (e) {
      setInvoices([]);
      setLoadError(e instanceof Error ? e.message : "Couldn't load invoices.");
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
    setFormError('');
  }

  function closeCreate() {
    guard.requestClose(() => { setShowForm(false); setFormError(''); });
  }

  // Local today (YYYY-MM-DD) — toISOString() is UTC, which rolls to tomorrow
  // in the Arizona evening and flags invoices overdue a day early.
  const nowD = new Date();
  const today = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')}`;
  // Overdue = due before today (local), and not paid / not a draft.
  const isOverdue = (i: Invoice) => !!i.due_date && i.due_date.slice(0, 10) < today && statusKey(i.status) !== 'paid' && statusKey(i.status) !== 'draft';
  const effKey = (i: Invoice) => (isOverdue(i) ? 'overdue' : statusKey(i.status));
  const isOutstanding = (i: Invoice) => { const st = statusKey(i.status); return st !== 'paid' && st !== 'draft'; };
  const totalBilled = toDollars(sumCents(invoices.map(i => toCents(effectiveTotal(i)))));
  const totalPaid = toDollars(sumCents(invoices.filter(i => statusKey(i.status) === 'paid').map(i => toCents(effectiveTotal(i)))));
  const totalOutstanding = toDollars(sumCents(invoices.filter(isOutstanding).map(i => toCents(effectiveTotal(i)))));
  const overdueList = invoices.filter(isOverdue);
  const overdueTotal = toDollars(sumCents(overdueList.map(i => toCents(effectiveTotal(i)))));

  // Toolbar-driven view of the list. Status matches the effective (overdue-aware) status.
  const q = search.trim().toLowerCase();
  const filteredInvoices = invoices.filter(inv => {
    if (statusFilter === 'outstanding') { if (!isOutstanding(inv)) return false; }
    else if (statusFilter !== 'all' && effKey(inv) !== statusFilter) return false;
    if (!q) return true;
    return [inv.invoice_number, inv.vendor_name, inv.description, inv.notes].some(v => String(v || '').toLowerCase().includes(q));
  });

  async function handleSave(): Promise<boolean> {
    if (!form.invoice_number || !form.vendor_name || !form.amount) { setFormError('Invoice number, bill-to, and amount are required.'); return false; }
    setSaving(true);
    setFormError('');
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
      show('Invoice created.');
      guard.clearDraft();
      return true;
    } catch {
      setFormError('Could not create the invoice. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSend(id: string) {
    setSendingId(id);
    try {
      const res = await fetch(`/api/invoices/${id}/send`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { show(json.error || 'Could not send the invoice.', 'bad'); return; }
      setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: 'sent' } : i));
      show('Invoice emailed to the client.');
    } catch {
      show('Could not send the invoice. Please try again.', 'bad');
    } finally {
      setSendingId(null);
    }
  }

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
      show('Could not generate the PDF. Please try again.', 'bad');
    } finally {
      setPdfBusy(null);
    }
  }

  async function handleEditInv(id: string) {
    const amount = parseFloat(editVal);
    if (isNaN(amount) || amount < 0) return;
    const tax = Number(invoices.find(i => i.id === id)?.tax) || 0;
    // Send {amount, tax} and let the server recompute total = amount + tax;
    // the optimistic total mirrors that so effectiveTotal never shows stale money.
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, amount, total: amount + tax } : i));
    setEditInv(null);
    try {
      const res = await fetch(`/api/invoices/${id}/update`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, tax }) });
      if (!res.ok) throw new Error('update failed');
      show('Amount updated.');
    } catch {
      show('Could not update the amount. Please try again.', 'bad');
      fetchInvoices();
    }
  }

  async function handleAdjustInv(id: string, pct: number) {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    const newAmt = toDollars(scaleCents(toCents(inv.amount), 1 + pct / 100));
    const tax = Number(inv.tax) || 0;
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, amount: newAmt, total: newAmt + tax } : i));
    setAdjustInv(null);
    try {
      const res = await fetch(`/api/invoices/${id}/update`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: newAmt, tax }) });
      if (!res.ok) throw new Error('update failed');
      show(`Adjusted ${pct > 0 ? '+' : ''}${pct}%`);
    } catch {
      show('Could not adjust the amount. Please try again.', 'bad');
      fetchInvoices();
    }
  }

  function handleCopyInv(amount: number) {
    navigator.clipboard.writeText(fmt(amount)).then(
      () => show(`Copied ${fmt(amount)}.`),
      () => show('Could not copy — your browser blocked the clipboard.', 'bad'),
    );
  }

  async function handleDeleteInv(inv: Invoice) {
    const ok = await confirmDialog({ title: 'Delete invoice?', message: `Delete invoice ${inv.invoice_number || ''}? This cannot be undone.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    setInvoices(prev => prev.filter(i => i.id !== inv.id));
    try {
      const res = await fetch(`/api/invoices/${inv.id}/delete`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      show('Invoice deleted.');
    } catch {
      show('Could not delete the invoice. Please try again.', 'bad');
      fetchInvoices();
    }
  }

  const toggle = (f: StatusFilter) => setStatusFilter(p => (p === f ? 'all' : f));
  const billedShown = totalBilled > 0 ? totalBilled : ctxBilled;
  const paidShown = totalPaid > 0 ? totalPaid : ctxPaid;
  const outstandingShown = totalOutstanding > 0 ? totalOutstanding : Math.max(0, ctxBilled - ctxPaid);

  const stats: StatItem[] = [
    ...(ctx ? [{
      label: 'Revised contract', value: fmt(revised), href: `${base}/contracts`, icon: <Handshake size={15} />,
      sub: `${(coTotal >= 0 ? '+' : '') + fmt(coTotal)} in ${Number(money?.approvedCoCount) || 0} approved COs${Number(money?.pendingCoCount) ? ` · ${money.pendingCoCount} pending` : ''}`,
    }] : []),
    { label: 'Total billed', value: loading ? '—' : fmt(billedShown), icon: <Receipt size={15} />, onClick: () => setStatusFilter('all'), active: statusFilter === 'all',
      sub: loading ? undefined : totalBilled > 0 ? `Across ${invoices.length} invoice${invoices.length === 1 ? '' : 's'}` : ctxBilled > 0 ? 'Project billed to date (pay apps)' : 'Across all invoices' },
    { label: 'Total paid', value: loading ? '—' : fmt(paidShown), icon: <CheckCircle size={15} />, tone: paidShown > 0 ? 'good' : 'default', onClick: () => toggle('paid'), active: statusFilter === 'paid',
      sub: loading ? undefined : totalPaid > 0 ? 'Collected on invoices' : ctxPaid > 0 ? 'Collected on the contract' : 'Collected' },
    { label: 'Outstanding', value: loading ? '—' : fmt(outstandingShown), icon: <Wallet size={15} />, onClick: () => toggle('outstanding'), active: statusFilter === 'outstanding',
      sub: loading ? undefined : totalOutstanding > 0 ? 'Awaiting payment' : ctxBilled - ctxPaid > 0 ? 'Billed less collected (contract)' : 'Awaiting payment' },
    { label: 'Overdue', value: loading ? '—' : String(overdueList.length), icon: <WarningCircle size={15} />, tone: overdueList.length ? 'bad' : 'default', onClick: () => toggle('overdue'), active: statusFilter === 'overdue',
      sub: loading ? undefined : overdueList.length ? `${fmt(overdueTotal)} past due` : 'None past due' },
  ];

  const columns: Column<Invoice>[] = [
    { key: 'invoice_number', header: 'Invoice #', primary: true, groupable: false, width: 150, render: i => <span style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{i.invoice_number}</span> },
    { key: 'vendor_name', header: 'Bill to' },
    { key: 'description', header: 'Description', hidden: true },
    { key: 'total', header: 'Total', align: 'right', total: 'sum', format: fmt, phone: 'show', accessor: effectiveTotal, render: i => <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(effectiveTotal(i))}</strong> },
    { key: 'created_at', header: 'Issued', width: 120, accessor: i => i.created_at || '', render: i => <span style={{ whiteSpace: 'nowrap' }}>{fmtDate(i.created_at)}</span> },
    { key: 'due_date', header: 'Due', width: 120, accessor: i => i.due_date || '', render: i => (i.due_date ? <span style={{ color: isOverdue(i) ? 'var(--danger)' : undefined, whiteSpace: 'nowrap' }}>{fmtDate(i.due_date.slice(0, 10))}</span> : null) },
    { key: 'status', header: 'Status', phone: 'show', accessor: effKey, render: i => { const st = invBadge(effKey(i)); return <Badge tone={st.tone} dot>{st.label}</Badge>; } },
    { key: 'notes', header: 'Notes', hidden: true, render: i => (i.notes ? <span style={{ color: 'var(--text-secondary)' }}>{i.notes}</span> : null) },
  ];

  const rowActions = (inv: Invoice): Action[] => [
    { label: sendingId === inv.id ? 'Sending…' : 'Send to owner', icon: <PaperPlaneTilt size={14} />, inline: true, hidden: statusKey(inv.status) !== 'draft', disabled: sendingId === inv.id, onClick: () => { void handleSend(inv.id); } },
    { label: pdfBusy === inv.id ? 'Building…' : 'PDF', icon: <FilePdf size={14} />, inline: true, disabled: pdfBusy === inv.id, onClick: () => { void handlePdf(inv); } },
    { label: 'Edit amount', icon: <PencilSimple size={14} />, onClick: () => { setEditInv(inv); setEditVal(String(inv.amount)); } },
    { label: 'Adjust %', icon: <Percent size={14} />, onClick: () => setAdjustInv(inv) },
    { label: 'Copy total', icon: <Copy size={14} />, onClick: () => handleCopyInv(effectiveTotal(inv)) },
    { label: 'Delete invoice', icon: <Trash size={14} />, tone: 'danger', onClick: () => { void handleDeleteInv(inv); } },
  ];

  const payAppCount = Number(money?.payAppCount) || 0;

  return (
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
        { label: 'Client invoices' },
      ]}
      title="Client invoices"
      subtitle={ctx?.project?.name || undefined}
      actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={() => openCreate()}>New invoice</Button>}
    >
      {!loadError && <StatRow items={stats} />}

      {!loading && !loadError && invoices.length > 0 && (
        <Toolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by number, bill-to or notes…"
          filters={
            <Select aria-label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} style={{ width: 'auto', minWidth: 170 }}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'outstanding', label: 'Outstanding' },
                { value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' }, { value: 'paid', label: 'Paid' }, { value: 'overdue', label: 'Overdue' },
              ]} />
          }
        />
      )}

      {loadError ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load invoices" text={loadError} action={<Button onClick={fetchInvoices}>Try again</Button>} />
      ) : (
        <DataTable<Invoice>
          tableId="project-invoices"
          /* Send and delete use the row's own routes: send emails the client and stamps the invoice sent. */
          bulkEdit={{
            noun: 'invoice',
            allowed: rights.edit,
            status: { label: 'Send to client', options: [{ value: 'sent', label: 'Email each invoice to its client' }], apply: (inv) => jsonRequest(`/api/invoices/${inv.id}/send`, 'POST') },
            remove: { allowed: rights.full, apply: (inv) => jsonRequest(`/api/invoices/${inv.id}/delete`, 'DELETE') },
            onDone: () => { void fetchInvoices(); },
          }}
          exportName="client-invoices"
          columns={columns}
          rows={filteredInvoices}
          loading={loading}
          rowKey={i => i.id}
          defaultSort={{ key: 'created_at', dir: 'desc' }}
          rowActions={rowActions}
          empty={
            invoices.length === 0 ? (
              <EmptyState
                icon={<Receipt size={22} />}
                title="No invoices yet"
                text={ctxBilled > 0
                  ? `You have certified ${fmt(ctxBilled)} across ${payAppCount} pay application${payAppCount === 1 ? '' : 's'} — client invoices track the money you collect against it.`
                  : 'Create your first invoice to start billing owners and tracking payments.'}
                action={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={() => openCreate(certified > 0)}>{certified > 0 ? `Invoice certified ${fmt(certified)}` : 'New invoice'}</Button>}
              />
            ) : (
              <EmptyState title="Nothing matches" text="Change the search or the status filter." action={<Button onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear filters</Button>} />
            )
          }
        />
      )}

      {/* New invoice */}
      <FormModal
        open={showForm}
        onClose={closeCreate}
        title="New invoice"
        subtitle={ctx ? `Revised contract ${fmt(revised)} · billed ${fmt(ctxBilled)} · paid ${fmt(ctxPaid)}` : 'Saved as a draft — send it to the owner from the list.'}
        onSubmit={async () => { await handleSave(); }}
        submitLabel="Create invoice"
        busy={saving}
        error={formError}
      >
        {lastApp && certified > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Callout
              tone="info"
              icon={<ClockCounterClockwise size={17} />}
              title={`Pay App #${lastApp.appNumber} certified ${fmt(certified)} this period`}
              text={`Status: ${String(lastApp.status || '—').replace(/_/g, ' ')}.`}
              actions={Number(form.amount) === certified
                ? undefined
                : <Button size="sm" onClick={() => { setForm(p => ({ ...p, amount: certified })); setAuto(a => ({ ...a, amt: true })); }}>Use certified amount</Button>}
            />
          </div>
        )}
        <FormGrid cols={3}>
          <Field label="Invoice #" required hint={`Next in sequence — ${invoices.length} invoice${invoices.length === 1 ? '' : 's'} on this project so far.`}>
            <Input value={form.invoice_number} onChange={e => setForm(p => ({ ...p, invoice_number: e.target.value }))} />
          </Field>
          <Field label="Bill to" required hint={auto.billto ? 'Owner of record from project setup.' : 'Who receives this invoice.'}>
            <Suggest type="text" className="k-input" value={form.vendor_name} onChange={e => setForm(p => ({ ...p, vendor_name: e.target.value }))} placeholder="Client / owner name" options={[ctx?.defaults?.ownerName, ...vendorNames].filter((n): n is string => !!n)} />
          </Field>
          <Field label="Bill-to email" hint={auto.email ? 'From the project owner record — Send to owner delivers here.' : 'Needed for one-click Send to owner.'}>
            <Input type="email" value={form.vendor_email} onChange={e => setForm(p => ({ ...p, vendor_email: e.target.value }))} placeholder="Required to email/send" />
          </Field>
          <Field label="Amount ($)" required hint={auto.amt ? `Certified amount from App #${lastApp?.appNumber}.` : 'Pre-tax invoice amount.'}>
            <Input type="number" inputMode="decimal" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} />
          </Field>
          <Field label="Tax ($)" hint="Optional sales / use tax.">
            <Input type="number" inputMode="decimal" value={form.tax} onChange={e => setForm(p => ({ ...p, tax: Number(e.target.value) }))} />
          </Field>
          <Field label="Invoice total" hint="Amount + tax — computed live.">
            <Input readOnly value={'$' + ((Number(form.amount) || 0) + (Number(form.tax) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} style={{ fontWeight: 800 }} />
          </Field>
          <Field label="Issue date" hint="Recorded automatically when the invoice is created.">
            <Input readOnly value={new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
          </Field>
          <Field label="Due date" hint="Net 30 from today — adjust freely. Overdue flags itself.">
            <DateInput value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
          </Field>
          <Field label="Cost code" hint={costCodes.length > 0 ? `${costCodes.length} codes from the project budget.` : 'Optional — ties billing to the budget.'}>
            {costCodes.length > 0 ? (
              <Select value={form.cost_code} onChange={e => setForm(p => ({ ...p, cost_code: e.target.value }))} placeholder="No cost code"
                options={costCodes.map(c => ({ value: c.costCode, label: `${c.costCode} — ${c.description}` }))} />
            ) : (
              <Input value={form.cost_code} onChange={e => setForm(p => ({ ...p, cost_code: e.target.value }))} placeholder="e.g. 01-000" />
            )}
          </Field>
          <Field label="Description" span hint={auto.desc && lastApp ? `Suggested from Pay Application #${lastApp.appNumber}.` : undefined}>
            <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Mar 2026 progress" />
          </Field>
          <Field label="Notes" span>
            <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </Field>
        </FormGrid>
      </FormModal>

      {/* Edit amount */}
      <FormModal
        open={!!editInv}
        onClose={() => setEditInv(null)}
        size="sm"
        title="Edit amount"
        subtitle={editInv ? `${editInv.invoice_number} · pre-tax amount; the total is recomputed with tax` : undefined}
        onSubmit={() => { if (editInv) void handleEditInv(editInv.id); }}
        submitLabel="Save"
      >
        <Field label="Amount ($)" required>
          <Input type="number" inputMode="decimal" min={0} step="0.01" value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus />
        </Field>
      </FormModal>

      {/* Adjust % */}
      <FormModal
        open={!!adjustInv}
        onClose={() => setAdjustInv(null)}
        size="sm"
        title="Adjust amount"
        subtitle={adjustInv ? `${adjustInv.invoice_number} · now ${fmt(Number(adjustInv.amount) || 0)} before tax` : undefined}
        footer={<Button variant="ghost" onClick={() => setAdjustInv(null)}>Cancel</Button>}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[-10, -5, 5, 10].map(p => (
            <Button key={p} onClick={() => { if (adjustInv) void handleAdjustInv(adjustInv.id, p); }}>
              {p > 0 ? '+' : ''}{p}%
            </Button>
          ))}
        </div>
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position: 'relative', zIndex: 10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
