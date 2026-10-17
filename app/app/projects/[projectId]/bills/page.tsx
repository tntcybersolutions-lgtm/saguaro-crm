'use client';
/**
 * Bills — vendor bills and supplier invoices on the job, on the kit layout.
 *
 * Reads   GET    /api/projects/:id/bills
 * Create  POST   /api/bills/create            (from the New bill modal)
 * Scan    upload to the job's Receipts folder → POST /api/bills/scan-receipt (prefills the modal)
 * Verbs   PATCH  /api/bills/:id/approve | /pay | /update ({ amount })
 *         DELETE /api/bills/:id/delete
 */
import { jsonRequest } from '@/lib/list-view';
import { useEditRights } from '@/lib/hooks/usePermissions';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { toCents, toDollars, sumCents, scaleCents } from '@/lib/calc';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { uploadFileDirect } from '@/lib/upload-direct';
import { shrinkForUpload } from '@/lib/image-shrink';
import { openPdf } from '@/components/PdfViewer';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { MODULES } from '@/lib/status-system';
import type { ReceiptFields } from '@/lib/receipt-read';
import {
  PageShell, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select, Callout,
  FormModal, Field, Input, DateInput, FormGrid, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import {
  Receipt, Plus, Camera, Sparkle, Wallet, PencilSimple, ChartBar, Copy, Trash, CheckCircle,
  CurrencyDollar, WarningCircle, Clock, FileText,
} from '@phosphor-icons/react';

interface Bill {
  id: string;
  bill_number: string;
  vendor_name: string;
  description: string;
  amount: number;
  total?: number;
  due_date: string;
  status: string;
  category: string;
  project_id: string;
  /** The receipt or invoice the bill was read from (signed by the list route). */
  pdf_url?: string | null;
}

const EMPTY_FORM = { invoice_num: '', vendor: '', description: '', amount: 0, tax: 0, due_date: '', category: '03 - Concrete', cost_code: '' };

/* Bills arrive with whatever casing wrote them ('paid' from imports, 'unpaid'
   from older rows, null from a blank form). Read them as the three states this
   screen works in, or a paid bill reads Overdue and an unpaid one drops out of
   Awaiting payment. */
function billStatus(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'paid') return 'Paid';
  if (s === 'approved') return 'Approved';
  return 'Pending';
}

function isOverdue(dueDate: string, status: string): boolean {
  if (status === 'Paid') return false;
  return new Date(dueDate) < new Date();
}

/** The overdue-aware status the list filters and badges on. */
const effStatus = (b: Bill) => (isOverdue(b.due_date, b.status) && b.status !== 'Paid' ? 'Overdue' : b.status);

const TONE: Record<string, BadgeTone> = { draft: 'neutral', waiting: 'under_contract', good: 'ongoing', done: 'completed', bad: 'overdue', warn: 'lead', active: 'ongoing' };
function billBadge(status: string): { label: string; tone: BadgeTone } {
  const def = MODULES.bills?.statuses?.[String(status || '').toLowerCase()];
  return { label: def?.label || status || 'Pending', tone: (def && TONE[def.tone]) || 'neutral' };
}

// Cents when there are cents: a $602.73 bill must not read "$603".
/* Currency style puts the sign first: -$111,256, never $-111,256. */
const fmt = (n: number) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });

function plus30() {
  const d = new Date(Date.now() + 30 * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Date-only values parse at local noon so they never shift a day under UTC. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type StatusFilter = 'all' | 'unpaid' | 'Pending' | 'Approved' | 'Paid' | 'Overdue';

export default function BillsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const base = `/app/projects/${projectId}`;
  const [bills, setBills] = useState<Bill[]>([]);
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
    draftKey: `bills:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSave(),
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editBill, setEditBill] = useState<Bill | null>(null);
  const [editVal, setEditVal] = useState('');
  const [adjustBill, setAdjustBill] = useState<Bill | null>(null);
  // SmartCreate: the project-context snapshot — vendors, cost codes, budget rollups.
  const { ctx } = useProjectContext(projectId);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // Scan a receipt: the photo is saved to the job's files, read, and prefills the form.
  const [scanning, setScanning] = useState<'' | 'upload' | 'read'>('');
  const [receipt, setReceipt] = useState<{ url: string; isPdf: boolean; fields: ReceiptFields | null; note: string } | null>(null);
  const receiptInput = useRef<HTMLInputElement>(null);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/bills`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't load bills.");
      setBills(((json.bills || []) as Bill[]).map((b) => ({ ...b, status: billStatus(b.status) })));
    } catch (e) {
      setBills([]);
      setLoadError(e instanceof Error ? e.message : "Couldn't load bills.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  // Dead-space kill (spec 4.1): an empty module opens straight into the
  // composer — the create form IS the zero state. One-shot per visit so
  // Cancel stays cancelled.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!loading && !loadError && bills.length === 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      openForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadError, bills.length]);

  async function handleSave(): Promise<boolean> {
    if (!form.vendor || !form.invoice_num || !form.amount) {
      setFormError('Vendor, invoice number, and amount are required.');
      return false;
    }
    setSaving(true);
    setFormError('');
    // MONEY: coerce before math — form/DB numerics can round-trip as strings.
    const billSubtotal = Number(form.amount) || 0;
    const billTax = Number(form.tax) || 0;
    const billTotal = billSubtotal + billTax;
    try {
      const res = await fetch('/api/bills/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          vendor_name: form.vendor,
          bill_number: form.invoice_num,
          description: form.description,
          category: form.category,
          cost_code: form.cost_code || null,
          amount: billTotal,
          tax: billTax,
          total: billTotal,
          due_date: form.due_date || null,
          status: 'Pending',
          pdf_url: receipt?.url || null,
          vendor_email: receipt?.fields?.vendor_email || null,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      const json = await res.json();
      if (!json.bill) throw new Error('save failed');
      setBills(prev => [json.bill as Bill, ...prev]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setReceipt(null);
      show(receipt ? 'Bill added — the receipt is attached.' : 'Bill added successfully.');
      guard.clearDraft();
      return true;
    } catch {
      setFormError('Could not save the bill. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(id: string) {
    setActionLoading(id + '-approve');
    try {
      const res = await fetch(`/api/bills/${id}/approve`, { method: 'PATCH' });
      if (!res.ok) throw new Error('approve failed');
      setBills(prev => prev.map(b => b.id === id ? { ...b, status: 'Approved' } : b));
      show('Bill approved.');
    } catch {
      show('Could not approve the bill. Please try again.', 'bad');
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePay(id: string) {
    setActionLoading(id + '-pay');
    try {
      const res = await fetch(`/api/bills/${id}/pay`, { method: 'PATCH' });
      if (!res.ok) throw new Error('pay failed');
      setBills(prev => prev.map(b => b.id === id ? { ...b, status: 'Paid' } : b));
      show('Bill marked as paid.');
    } catch {
      show('Could not mark the bill as paid. Please try again.', 'bad');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleEditBill(id: string) {
    const amount = parseFloat(editVal);
    if (isNaN(amount) || amount < 0) return;
    setBills(prev => prev.map(b => b.id === id ? { ...b, amount } : b));
    setEditBill(null);
    try {
      const res = await fetch(`/api/bills/${id}/update`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }) });
      if (!res.ok) throw new Error('update failed');
      show('Amount updated.');
    } catch {
      show('Could not update the amount. Please try again.', 'bad');
      fetchBills();
    }
  }

  async function handleAdjustBill(id: string, pct: number) {
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    const newAmt = toDollars(scaleCents(toCents(bill.amount), 1 + pct / 100));
    setBills(prev => prev.map(b => b.id === id ? { ...b, amount: newAmt } : b));
    setAdjustBill(null);
    try {
      const res = await fetch(`/api/bills/${id}/update`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: newAmt }) });
      if (!res.ok) throw new Error('update failed');
      show(`Adjusted ${pct > 0 ? '+' : ''}${pct}%.`);
    } catch {
      show('Could not adjust the amount. Please try again.', 'bad');
      fetchBills();
    }
  }

  function handleCopyBill(amount: number) {
    navigator.clipboard.writeText(fmt(amount)).then(
      () => show(`Copied ${fmt(amount)}.`),
      () => show('Could not copy — your browser blocked the clipboard.', 'bad'),
    );
  }

  async function handleDeleteBill(b: Bill) {
    const ok = await confirmDialog({ title: 'Delete bill?', message: `Delete bill ${b.bill_number || ''} from ${b.vendor_name || 'this vendor'}? This cannot be undone.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    setBills(prev => prev.filter(x => x.id !== b.id));
    try {
      const res = await fetch(`/api/bills/${b.id}/delete`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      show('Bill deleted.');
    } catch {
      show('Could not delete the bill. Please try again.', 'bad');
      fetchBills();
    }
  }

  // Toolbar-driven view of the list. Status matches the effective (overdue-aware) status.
  const q = search.trim().toLowerCase();
  const filteredBills = bills.filter(b => {
    const s = effStatus(b);
    if (statusFilter === 'unpaid') { if (b.status !== 'Pending' && b.status !== 'Approved') return false; }
    else if (statusFilter !== 'all' && s !== statusFilter) return false;
    if (!q) return true;
    return [b.bill_number, b.vendor_name, b.description, b.category].some(v => String(v || '').toLowerCase().includes(q));
  });

  const unpaid = bills.filter(b => b.status === 'Pending' || b.status === 'Approved');
  const pendingTotal = toDollars(sumCents(unpaid.map(b => toCents(b.amount || 0))));
  const paidCount = bills.filter(b => b.status === 'Paid').length;
  const overdueBills = bills.filter(b => effStatus(b) === 'Overdue');
  const overdueTotal = toDollars(sumCents(overdueBills.map(b => toCents(b.amount || 0))));

  // ── SmartCreate intelligence (all Number-coerced: DB numerics round-trip as strings) ──
  const budget = ctx?.budget;
  // Revised budget (original + approved changes) — the Budget screen's roll-up (lib/budget-rollup).
  const bRevised = Number(budget?.revised) || 0;
  const bActual = Number(budget?.actual) || 0;
  const bRemaining = budget?.remaining != null ? Number(budget.remaining) || 0 : bRevised - bActual;
  const vendors: string[] = (ctx?.vendors || []).filter(Boolean);
  const budgetLines: any[] = budget?.lines || [];
  const costCodeOptions: any[] = (ctx?.costCodes || []).filter((c: any) => c.costCode);
  const subtotalNum = Number(form.amount) || 0;
  const taxNum = Number(form.tax) || 0;
  const grandTotal = subtotalNum + taxNum;
  // Same line-matching the server rollup uses: exact cost code, else its division.
  const selLine = form.cost_code
    ? (budgetLines.find((l: any) => String(l.costCode) === String(form.cost_code))
      || budgetLines.find((l: any) => String(l.division) === String(form.cost_code).slice(0, 2)))
    : null;
  const lineBudget = Number(selLine?.revised ?? selLine?.original) || 0;
  const lineActual = Number(selLine?.actual) || 0;
  const lineRemaining = lineBudget - lineActual - grandTotal;

  function openForm() {
    setFormError('');
    setShowForm(true);
    setForm(f => f.due_date ? f : { ...f, due_date: plus30() });
  }

  function closeForm() {
    guard.requestClose(() => { setShowForm(false); setFormError(''); setReceipt(null); });
  }

  function pickCostCode(code: string) {
    const line = costCodeOptions.find((c: any) => String(c.costCode) === code);
    const div = String(line?.division ?? code).slice(0, 2);
    const divName = CSI_DIVISIONS[div]?.name;
    setForm(p => ({ ...p, cost_code: code, category: code && divName ? `${div} - ${divName}` : p.category }));
  }

  function pickDivision(div: string) {
    const divName = CSI_DIVISIONS[div]?.name;
    setForm(p => ({ ...p, cost_code: div, category: div && divName ? `${div} - ${divName}` : p.category }));
  }

  /* Scan a receipt: save it to the job's files first (so it is kept even if
     reading fails), then read it (POST /api/bills/scan-receipt) and prefill
     the form. Nothing becomes a bill until Save Bill. */
  async function scanReceipt(original: File) {
    setFormError('');
    setScanning('upload');
    let url = '';
    const isPdf = original.type === 'application/pdf' || /\.pdf$/i.test(original.name);
    try {
      const file = isPdf ? original : await shrinkForUpload(original);
      const row = await uploadFileDirect(file, { projectId, folder: 'Receipts', category: 'Receipt' });
      url = String(row?.file_url || row?.url || '');
      if (!url) throw new Error('upload');
    } catch {
      setScanning('');
      show('The receipt could not be uploaded. Check the connection and try again.', 'bad');
      return;
    }
    setReceipt({ url, isPdf, fields: null, note: '' });
    setForm(f => f.due_date ? f : { ...f, due_date: plus30() });
    setShowForm(true);
    setScanning('read');
    try {
      const res = await fetch('/api/bills/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, fileUrl: url }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.receipt) throw new Error(j.error || 'The receipt could not be read. Enter the bill by hand; your receipt is saved.');
      const r = j.receipt as ReceiptFields;
      const subtotal = r.subtotal ?? (r.total !== null ? r.total - (r.tax || 0) : 0);
      setForm(p => ({
        ...p,
        invoice_num: r.bill_number || (r.bill_date ? `Receipt ${r.bill_date}` : p.invoice_num || 'Receipt'),
        vendor: r.vendor_name || p.vendor,
        description: r.description || p.description,
        amount: Math.round((subtotal || 0) * 100) / 100,
        tax: r.tax || 0,
        // A receipt with no printed due date is due on normal terms, not on the
        // day it was bought (that made every scanned receipt read Overdue).
        due_date: r.due_date || p.due_date || plus30(),
      }));
      if (r.cost_code && costCodeOptions.some((c: any) => String(c.costCode) === r.cost_code)) pickCostCode(r.cost_code);
      else if (r.division && costCodeOptions.length === 0) pickDivision(r.division);
      const unread = [!r.vendor_name && 'vendor', r.total === null && 'total', !r.bill_number && 'invoice number'].filter(Boolean);
      setReceipt({ url, isPdf, fields: r, note: unread.length ? `Not on the receipt: ${unread.join(', ')} — fill ${unread.length === 1 ? 'it' : 'them'} in.` : '' });
    } catch (e) {
      setReceipt({ url, isPdf, fields: null, note: e instanceof Error ? e.message : 'The receipt could not be read. Enter the bill by hand; your receipt is saved.' });
    } finally {
      setScanning('');
    }
  }

  const openReceipt = (url: string, isPdf: boolean) => (isPdf ? openPdf({ url }) : window.open(url, '_blank', 'noopener'));
  const toggle = (f: StatusFilter) => setStatusFilter(p => (p === f ? 'all' : f));

  const stats: StatItem[] = [
    { label: 'Bills', value: loading ? '—' : String(bills.length), sub: loading ? undefined : `${paidCount} paid`, icon: <Receipt size={15} />, onClick: () => setStatusFilter('all'), active: statusFilter === 'all' },
    { label: 'Awaiting payment', value: loading ? '—' : fmt(pendingTotal), sub: loading ? undefined : `${unpaid.length} pending or approved`, icon: <Clock size={15} />, onClick: () => toggle('unpaid'), active: statusFilter === 'unpaid' },
    { label: 'Overdue', value: loading ? '—' : String(overdueBills.length), sub: loading || !overdueBills.length ? undefined : `${fmt(overdueTotal)} past due`, tone: overdueBills.length ? 'bad' : 'default', icon: <WarningCircle size={15} />, onClick: () => toggle('Overdue'), active: statusFilter === 'Overdue' },
    ...(ctx ? [
      { label: 'Actual to date', value: fmt(bActual), sub: `of ${fmt(bRevised)} revised budget · ${Number(budget?.lineCount) || budgetLines.length} lines`, icon: <CurrencyDollar size={15} />, href: `${base}/budget` },
      { label: 'Budget remaining', value: fmt(bRemaining), sub: 'Revised budget less actual', tone: bRemaining < 0 ? 'bad' as const : 'good' as const, icon: <Wallet size={15} />, href: `${base}/budget` },
    ] : []),
  ];

  const columns: Column<Bill>[] = [
    { key: 'bill_number', header: 'Invoice #', width: 120, accessor: b => b.bill_number || '', groupable: false },
    { key: 'vendor_name', header: 'Vendor', primary: true, phone: 'show' },
    { key: 'description', header: 'Description', render: b => <span title={b.description}>{b.description}</span> },
    { key: 'category', header: 'Category', hidden: true },
    { key: 'amount', header: 'Amount', align: 'right', total: 'sum', format: fmt, phone: 'show', accessor: b => Number(b.amount) || 0, render: b => <strong>{fmt(b.amount)}</strong> },
    { key: 'due_date', header: 'Due date', accessor: b => b.due_date || '', render: b => <span style={{ color: effStatus(b) === 'Overdue' ? 'var(--danger)' : undefined, whiteSpace: 'nowrap' }}>{fmtDate(b.due_date)}</span> },
    { key: 'status', header: 'Status', phone: 'show', accessor: b => effStatus(b), render: b => { const st = billBadge(effStatus(b)); return <Badge tone={st.tone} dot>{st.label}</Badge>; } },
  ];

  const rowActions = (b: Bill): Action[] => [
    { label: actionLoading === b.id + '-approve' ? 'Approving…' : 'Approve', icon: <CheckCircle size={14} />, inline: true, hidden: b.status !== 'Pending', disabled: !!actionLoading, onClick: () => handleApprove(b.id) },
    { label: actionLoading === b.id + '-pay' ? 'Saving…' : 'Mark paid', icon: <CurrencyDollar size={14} />, inline: true, hidden: b.status !== 'Pending' && b.status !== 'Approved', disabled: !!actionLoading, onClick: () => handlePay(b.id) },
    { label: 'Receipt', icon: <FileText size={14} />, hidden: !b.pdf_url, onClick: () => openReceipt(b.pdf_url!, /\.pdf(\?|$)/i.test(b.pdf_url!)) },
    { label: 'Edit amount', icon: <PencilSimple size={14} />, onClick: () => { setEditBill(b); setEditVal(String(b.amount)); } },
    { label: 'Adjust %', icon: <ChartBar size={14} />, onClick: () => setAdjustBill(b) },
    { label: 'Copy amount', icon: <Copy size={14} />, onClick: () => handleCopyBill(b.amount) },
    { label: 'Delete bill', icon: <Trash size={14} />, tone: 'danger', onClick: () => { void handleDeleteBill(b); } },
  ];

  return (
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
        { label: 'Bills' },
      ]}
      title="Bills"
      subtitle="Vendor bills and supplier invoices."
      actions={
        <>
          <Button icon={<Camera size={15} />} onClick={() => receiptInput.current?.click()} disabled={!!scanning}>
            {scanning === 'upload' ? 'Uploading…' : scanning === 'read' ? 'Reading…' : 'Scan receipt'}
          </Button>
          <Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openForm}>New bill</Button>
          <input ref={receiptInput} type="file" accept="image/*,application/pdf" aria-label="Receipt photo or PDF" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) scanReceipt(f); }} />
        </>
      }
    >
      {!loadError && <StatRow items={stats} />}

      {!loading && !loadError && bills.length > 0 && (
        <Toolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by invoice, vendor or description…"
          filters={
            <Select aria-label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} style={{ width: 'auto', minWidth: 170 }}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'unpaid', label: 'Awaiting payment' },
                { value: 'Pending', label: 'Pending' },
                { value: 'Approved', label: 'Approved' },
                { value: 'Paid', label: 'Paid' },
                { value: 'Overdue', label: 'Overdue' },
              ]} />
          }
        />
      )}

      {loadError ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load bills" text={loadError} action={<Button onClick={fetchBills}>Try again</Button>} />
      ) : (
        <DataTable<Bill>
          tableId="project-bills"
          /* Approve, pay and delete use the row's own routes (each needs Full on Budget). */
          bulkEdit={{
            noun: 'bill',
            allowed: rights.full,
            status: {
              options: [{ value: 'approve', label: 'Approved' }, { value: 'pay', label: 'Paid' }],
              apply: (b, v) => jsonRequest(`/api/bills/${b.id}/${v === 'pay' ? 'pay' : 'approve'}`, 'PATCH'),
            },
            remove: { allowed: rights.full, apply: (b) => jsonRequest(`/api/bills/${b.id}/delete`, 'DELETE') },
            onDone: () => { void fetchBills(); },
          }}
          exportName="bills"
          columns={columns}
          rows={filteredBills}
          loading={loading}
          rowKey={b => b.id}
          defaultSort={{ key: 'due_date', dir: 'asc' }}
          rowActions={rowActions}
          empty={
            bills.length === 0 ? (
              <EmptyState
                icon={<Receipt size={22} />}
                title="No bills yet"
                action={<Button icon={<Plus size={15} weight="bold" />} onClick={openForm}>New bill</Button>}
              />
            ) : (
              <EmptyState title="Nothing matches" text="Change the search or the status filter." action={<Button onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear filters</Button>} />
            )
          }
        />
      )}

      {/* New bill */}
      <FormModal
        open={showForm}
        onClose={closeForm}
        title="New bill"
        subtitle="Saved as Pending"
        onSubmit={async () => { await handleSave(); }}
        submitLabel="Save bill"
        busy={saving}
        error={formError}
      >
        {receipt && (
          <div style={{ marginBottom: 16 }}>
            <Callout
              tone={receipt.fields || scanning === 'read' ? 'info' : 'warning'}
              icon={<Sparkle size={17} weight="fill" />}
              title={scanning === 'read'
                ? 'Reading the receipt…'
                : receipt.fields
                  ? `Read from the receipt${receipt.fields.confidence !== 'high' ? ` (${receipt.fields.confidence} confidence)` : ''} — check each field before saving.`
                  : 'Receipt saved to the job files.'}
              text={receipt.note || undefined}
              actions={<Button size="sm" onClick={() => openReceipt(receipt.url, receipt.isPdf)}>View receipt</Button>}
            />
          </div>
        )}
        <FormGrid cols={3}>
          <Field label="Invoice #" required>
            <Input value={form.invoice_num} onChange={e => setForm(p => ({ ...p, invoice_num: e.target.value }))} />
          </Field>
          <Field label="Vendor" required hint={vendors.length > 0 ? `${vendors.length} known vendor${vendors.length === 1 ? '' : 's'} on this job` : undefined}>
            <Suggest type="text" className="k-input" value={form.vendor} onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))} options={vendors} />
          </Field>
          <Field label="Cost code" hint={costCodeOptions.length > 0 ? undefined : 'No cost-coded budget yet'}>
            {costCodeOptions.length > 0 ? (
              <Select value={form.cost_code} onChange={e => pickCostCode(e.target.value)} placeholder="— Select cost code —"
                options={costCodeOptions.map((c: any) => ({ value: String(c.costCode), label: c.costCode + ' — ' + (c.description || CSI_DIVISIONS[String(c.division)]?.name || '') }))} />
            ) : (
              <Select value={form.cost_code} onChange={e => pickDivision(e.target.value)} placeholder="— CSI division —"
                options={Object.entries(CSI_DIVISIONS).map(([dv, d]) => ({ value: dv, label: dv + ' — ' + d.name }))} />
            )}
          </Field>
          <Field label="Amount before tax ($)" required>
            <Input type="number" inputMode="decimal" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} />
          </Field>
          <Field label="Tax ($)">
            <Input type="number" inputMode="decimal" value={form.tax} onChange={e => setForm(p => ({ ...p, tax: Number(e.target.value) }))} />
          </Field>
          <Field label="Due date" hint="Net 30 from today">
            <DateInput value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
          </Field>
          <Field label="Description" span>
            <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </Field>
        </FormGrid>
        {selLine && (
          <div style={{ marginTop: 16 }}>
            <Callout
              tone={lineRemaining < 0 ? 'danger' : 'info'}
              icon={<Wallet size={17} />}
              title={`Cost code ${selLine.costCode || selLine.division}${selLine.description ? ` — ${selLine.description}` : ''}`}
              text={<>Budget {fmt(lineBudget)} · actual to date {fmt(lineActual)} · this bill {fmt(grandTotal)} · <strong style={{ color: lineRemaining < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmt(lineRemaining)} remaining</strong> after it.</>}
            />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 24, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>Subtotal <strong style={{ color: 'var(--text-primary)' }}>{fmt(subtotalNum)}</strong></span>
          <span>Tax <strong style={{ color: 'var(--text-primary)' }}>{fmt(taxNum)}</strong></span>
          <span>Bill total <strong style={{ color: 'var(--text-primary)', fontSize: 15 }}>{fmt(grandTotal)}</strong></span>
        </div>
      </FormModal>

      {/* Edit amount */}
      <FormModal
        open={!!editBill}
        onClose={() => setEditBill(null)}
        size="sm"
        title="Edit amount"
        subtitle={editBill ? `${editBill.bill_number} · ${editBill.vendor_name}` : undefined}
        onSubmit={() => { if (editBill) void handleEditBill(editBill.id); }}
        submitLabel="Save"
      >
        <Field label="Amount ($)" required>
          <Input type="number" inputMode="decimal" min={0} step="0.01" value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus />
        </Field>
      </FormModal>

      {/* Adjust % */}
      <FormModal
        open={!!adjustBill}
        onClose={() => setAdjustBill(null)}
        size="sm"
        title="Adjust amount"
        subtitle={adjustBill ? `${adjustBill.bill_number} · now ${fmt(adjustBill.amount)}` : undefined}
        footer={<Button variant="ghost" onClick={() => setAdjustBill(null)}>Cancel</Button>}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[-10, -5, 5, 10].map(p => (
            <Button key={p} onClick={() => { if (adjustBill) void handleAdjustBill(adjustBill.id, p); }}>
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
