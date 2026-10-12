'use client';
/**
 * Invoicing — Pass 4, on the RFIs reference layout (dense register).
 *
 * Anatomy: title + one primary action (New Invoice) → StatRow (billed /
 * collected / outstanding / overdue / drafts — each tile filters the register)
 * → Toolbar → the invoice register (kit DataTable). A row opens the invoice.
 *
 * Money: NUMERIC columns arrive as TEXT — Number() always — and a stale 0
 * total defers to amount + tax so a $67,800 invoice never rolls up as $0.
 * Amounts are aligned, tabular and two decimals, never truncated. A failed
 * read is shown as a failure, never as an empty, all-clear ledger.
 *
 * Every read / write is the one this screen already used:
 *   list     GET    /api/invoices/list
 *   projects GET    /api/projects?limit=100&fields=id,name
 *   create   POST   /api/invoices/create
 *   send     POST   /api/invoices/[id]/send     (only "sent" once the route reports emailed)
 *   pdf      POST   /api/invoices/[id]/pdf      (always a fresh signed URL)
 *   delete   DELETE /api/invoices/[id]/delete
 * The NudgeRing anchor and the unsaved-work guard are unchanged.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { Plus, PaperPlaneTilt, Trash, Receipt, FilePdf, ArrowClockwise, WarningCircle, ArrowSquareOut } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select,
  FormModal, Field, Input, Textarea, FormGrid, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { FlowSteps, InsightRow, AutoChip } from '@/components/ui/premium';
import NudgeRing from '@/components/intelligence/NudgeRing';
import { ANCHOR_INVOICES_OVERDUE } from '@/lib/suggestions';
import Suggest from '@/components/ui/Suggest';
import { openPdf } from '@/components/PdfViewer';

interface Invoice {
  id: string;
  project_id: string;
  vendor_name: string;
  invoice_number: string | null;
  vendor_email: string | null;
  description: string | null;
  category: string | null;
  cost_code: string | null;
  amount: number | null;
  tax: number | null;
  total: number | null;
  due_date: string | null;
  status: string | null;
  pdf_url: string | null;
  notes: string | null;
  created_at: string;
}

interface Project { id: string; name: string; }

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (n: number) => money.format(Number(n) || 0);

/** Canonical money figure for an invoice: the stored total when it's a real
 *  (non-zero) number, else amount + tax. NUMERIC columns arrive as TEXT so
 *  Number() always — and a stale 0 total defers to amount, so a $67,800
 *  invoice never rolls up as $0. */
function effectiveTotal(i: { amount?: number | null; tax?: number | null; total?: number | null }): number {
  const t = Number(i.total);
  if (t > 0) return t;
  return (Number(i.amount) || 0) + (Number(i.tax) || 0);
}

/** Lowercase-normalized status — rows carry mixed casing ('Sent', 'Draft'). */
function statusKey(s?: string | null): string {
  return (s || 'draft').toLowerCase();
}

/** Parse a date-only 'YYYY-MM-DD' (or an ISO string carrying one) at LOCAL
 *  midnight — new Date('YYYY-MM-DD') is UTC midnight, which lands the previous
 *  evening in Arizona and both renders dates and flags overdue a day early. */
function parseDateOnly(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
const fmtDate = (v?: string | null) => { if (!v) return '—'; const d = parseDateOnly(v); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; };

/** Overdue = due before today (local), and not paid / not a draft. */
function isOverdue(i: { due_date?: string | null; status?: string | null }): boolean {
  if (!i.due_date) return false;
  const due = parseDateOnly(i.due_date);
  if (!due) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const st = statusKey(i.status);
  return due < today && st !== 'paid' && st !== 'draft';
}

/** One status → one badge. Draft neutral; Pending amber; Sent blue (with the
 *  customer); Approved green; Paid orange (closed money). Overdue rides as its
 *  own red badge next to the status, from lib/status-colors. */
function statusBadge(s?: string | null): { label: string; tone: BadgeTone } {
  const k = statusKey(s);
  if (k === 'pending') return { label: 'Pending', tone: 'under_contract' };
  if (k === 'sent') return { label: 'Sent', tone: 'lead' };
  if (k === 'approved') return { label: 'Approved', tone: 'ongoing' };
  if (k === 'paid') return { label: 'Paid', tone: 'completed' };
  if (k === 'overdue') return { label: 'Overdue', tone: 'overdue' };
  return { label: 'Draft', tone: 'neutral' };
}
const STATUS_RANK: Record<string, number> = { draft: 0, pending: 1, sent: 2, approved: 3, paid: 4, overdue: 5 };
type StatusFilter = 'all' | 'draft' | 'pending' | 'sent' | 'approved' | 'paid' | 'outstanding' | 'overdue';

const EMPTY_FORM = { project_id: '', vendor_name: '', invoice_number: '', vendor_email: '', description: '', category: '', cost_code: '', amount: '', tax: '', due_date: '', status: 'draft', notes: '' };

const CSS = `
.ivWs > .k-page { max-width: none; }
.ivList .k-table th:first-child, .ivList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.ivList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.ivList .k-table tbody tr:hover td:first-child { background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), var(--bg-solid); }
.ivNum { color: var(--text-primary); font-weight: 800; white-space: nowrap; }
.ivClamp { display: inline-block; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.ivMoney { font-variant-numeric: tabular-nums; white-space: nowrap; }
.ivTotal { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 800; color: var(--text-primary); }
.ivLate { color: var(--status-overdue); font-weight: 700; }
.ivMuted { color: var(--text-tertiary); }
.ivBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ivLadder { border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 12px 14px; background: var(--bg-surface-2); margin-bottom: 16px; }
.ivTotalBox { display: flex; align-items: center; min-height: 40px; padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--brand-primary-35); background: var(--brand-primary-08); color: var(--text-primary); font-weight: 800; font-variant-numeric: tabular-nums; }
.ivReadonly { display: flex; align-items: center; min-height: 40px; padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); background: var(--bg-surface-2); color: var(--text-tertiary); }
.ivDateInput { width: 100%; }
@media (max-width: 640px) {
  .ivWs .k-btn, .ivWs .k-stat, .ivWs select.k-select, .ivWs .k-input { min-height: 44px; }
  .ivWs .k-table td { height: 48px; }
  .ivClamp { max-width: 180px; }
}
`;

const DATE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', fontSize: 14,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
};

export default function InvoicingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** True when the invoice list read failed — keeps "empty" from reading as an
   *  all-clear (0 overdue, $0 outstanding) on a ledger we never managed to read. */
  const [loadFailed, setLoadFailed] = useState(false);
  const { toast, show } = useToast(6000);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Create form state — matches API schema
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [creating, setCreating] = useState(false);

  // Project intelligence — once a project is picked, the form walks in knowing it.
  const { ctx } = useProjectContext(form.project_id || null);
  const [auto, setAuto] = useState<{ num?: boolean; due?: boolean; billto?: boolean; email?: boolean }>({});
  useEffect(() => {
    if (!form.project_id) setAuto({});
  }, [form.project_id]);
  useEffect(() => {
    if (!ctx) return;
    const n = Number(ctx.defaults?.nextInvoiceNumber) || 1;
    const due = new Date(Date.now() + 30 * 86400000);
    const dueIso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    // "Enter once": pick a project and the invoice's Bill-To (the owner of
    // record) and its email fill in from the project, like the project-level
    // invoice form already does. Only seeds empty fields, so anything typed
    // wins and this never clobbers an edit.
    const ownerName = (ctx.defaults?.ownerName as string) || '';
    const ownerEmail = (ctx.defaults?.ownerEmail as string) || '';
    setForm(f => {
      const seedNum = !f.invoice_number;
      const seedDue = !f.due_date;
      const seedBillto = !f.vendor_name && !!ownerName;
      const seedEmail = !f.vendor_email && !!ownerEmail;
      setAuto(a => ({ num: a.num || seedNum, due: a.due || seedDue, billto: a.billto || seedBillto, email: a.email || seedEmail }));
      return {
        ...f,
        invoice_number: f.invoice_number || `INV-${String(n).padStart(3, '0')}`,
        due_date: f.due_date || dueIso,
        vendor_name: f.vendor_name || ownerName,
        vendor_email: f.vendor_email || ownerEmail,
      };
    });
  }, [ctx]);

  const ctxMoney = ctx?.money;
  const cOriginal = Number(ctxMoney?.originalContract) || 0;
  const cCoTotal = Number(ctxMoney?.approvedCoTotal) || 0;
  const cRevised = Number(ctxMoney?.revisedContract) || (cOriginal + cCoTotal);
  const cBilled = Number(ctxMoney?.billedToDate) || 0;
  const cPaid = Number(ctxMoney?.paidToDate) || 0;
  const ctxVendors = (ctx?.vendors || []) as string[];
  const ctxCodes = (ctx?.costCodes || []) as { division: string; costCode: string; description: string }[];
  const liveTotal = (parseFloat(form.amount) || 0) + (parseFloat(form.tax) || 0);

  const pageBilled = invoices.reduce((s, i) => s + effectiveTotal(i), 0);
  const pagePaid = invoices.filter(i => statusKey(i.status) === 'paid').reduce((s, i) => s + effectiveTotal(i), 0);
  const isOutstanding = (i: Invoice) => { const st = statusKey(i.status); return st !== 'paid' && st !== 'draft'; };
  const pageOutstanding = invoices.filter(isOutstanding).reduce((s, i) => s + effectiveTotal(i), 0);
  const pageOverdue = invoices.filter(isOverdue).length;
  const pageDrafts = invoices.filter(i => statusKey(i.status) === 'draft').length;

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch('/api/invoices/list');
      if (!res.ok) throw new Error('Failed to load invoices');
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : data.invoices ?? []);
      setLoadFailed(false);
    } catch (e: any) {
      console.error(e);
      // An empty ledger and an unread ledger look identical unless we say so.
      setLoadFailed(true);
      setError(humanError(e, "Couldn't load invoices. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    fetch('/api/projects?limit=100&fields=id,name')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setProjects(Array.isArray(d) ? d : d.projects ?? []); })
      .catch(() => {});
  }, [fetchInvoices]);

  /* ── Unsaved-work protection (R14): dirty once anything is typed in the
   *    composer; draft autosaves to this device and restores on return. ── */
  const formDirty = showCreate && (
    !!form.project_id || !!form.vendor_name || !!form.invoice_number || !!form.vendor_email ||
    !!form.description || !!form.category || !!form.cost_code || !!form.amount || !!form.tax ||
    !!form.due_date || !!form.notes
  );
  const guard = useUnsavedGuard({
    dirty: formDirty,
    draftKey: 'invoice-create',
    draftData: form,
    restoreDraft: (d) => {
      setForm(f => ({ ...f, ...(d as Partial<typeof form>) }));
      setShowCreate(true);
    },
    onSave: () => submitCreate(),
  });

  /** POST the composer — shared by the form submit and the guard's "Save & leave". */
  async function submitCreate(): Promise<boolean> {
    if (!form.project_id || !form.vendor_name) {
      setError('Project and vendor name are required before the invoice can be saved.');
      return false;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/invoices/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: form.project_id,
          vendor_name: form.vendor_name,
          invoice_number: form.invoice_number || null,
          vendor_email: form.vendor_email || null,
          description: form.description || null,
          category: form.category || null,
          cost_code: form.cost_code || null,
          // Server is canonical for money: it computes total = amount + tax
          // itself (a client-sent total can be stale or zero) and stores
          // lowercase statuses.
          amount: form.amount !== '' ? parseFloat(form.amount) : null,
          tax: form.tax !== '' ? parseFloat(form.tax) : null,
          due_date: form.due_date || null,
          status: statusKey(form.status),
          notes: form.notes || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to create invoice');
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      setError('');
      show('Invoice created.');
      await fetchInvoices();
      return true;
    } catch (e: any) {
      console.error(e);
      setError(humanError(e, "Couldn't create the invoice. Please try again."));
      return false;
    } finally {
      setCreating(false);
    }
  }

  async function handleCreate() {
    if (await submitCreate()) guard.clearDraft();
  }

  /** Every close path (X / Cancel / Esc / backdrop) runs through the guard:
   *  clean closes immediately, dirty asks Save / Discard / Stay first. */
  function closeComposer() {
    guard.requestClose(() => {
      setShowCreate(false);
      setError('');
      setForm({ ...EMPTY_FORM });
    });
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog({ title: 'Please confirm', message: 'Delete this invoice?', danger: true }))) return;
    try {
      const res = await fetch(`/api/invoices/${id}/delete`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Delete failed (${res.status})`);
      }
      show('Invoice deleted.');
      await fetchInvoices();
    } catch (e: any) {
      console.error(e);
      show(humanError(e, "Couldn't delete the invoice. It is still on the ledger."), 'bad');
    }
  }

  /**
   * The send route is already honest — it refuses with a 400 when the invoice
   * has no vendor_email and a 502 when email is not provisioned or Resend
   * rejects the message, and it only flips the row to "sent" after delivery.
   * The refusal reaches the screen as a toast.
   */
  async function handleSend(id: string) {
    try {
      const res = await fetch(`/api/invoices/${id}/send`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.emailed) {
        throw new Error(data?.error || `The invoice was not sent (${res.status}).`);
      }
      show(`Invoice emailed to ${data.to}.`);
      await fetchInvoices();
    } catch (e: any) {
      console.error(e);
      show(humanError(e, 'The invoice was not emailed. Nothing was sent to the vendor.'), 'bad');
      // Re-read so the row still shows its true (un-sent) status.
      await fetchInvoices();
    }
  }

  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  /** POST /api/invoices/[id]/pdf -> { pdfUrl }. The stored pdf_url is a signed
   *  URL with an hour on it — a "this has a PDF" flag, not a link — so always
   *  ask for a fresh one; the route regenerates cheaply. */
  async function handlePdf(inv: Invoice) {
    setPdfBusy(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}/pdf`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.pdfUrl) throw new Error(data?.error || 'PDF generation failed');
      openPdf({ url: data.pdfUrl });
      await fetchInvoices();
    } catch (e: any) {
      console.error(e);
      show(humanError(e, "Couldn't generate the PDF. Please try again."), 'bad');
    } finally {
      setPdfBusy(null);
    }
  }

  const projectName = useCallback((pid: string) => projects.find(p => p.id === pid)?.name || '', [projects]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter(i => {
      if (projectFilter !== 'all' && i.project_id !== projectFilter) return false;
      if (statusFilter === 'overdue') { if (!isOverdue(i)) return false; }
      else if (statusFilter === 'outstanding') { if (!isOutstanding(i)) return false; }
      else if (statusFilter !== 'all' && statusKey(i.status) !== statusFilter) return false;
      if (!q) return true;
      return [i.invoice_number, i.vendor_name, i.description, i.category, i.cost_code, projectName(i.project_id)].some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [invoices, search, projectFilter, statusFilter, projectName]);
  const filtersActive = !!search || projectFilter !== 'all' || statusFilter !== 'all';
  const clearFilters = () => { setSearch(''); setProjectFilter('all'); setStatusFilter('all'); };
  const toggleStatus = (s: StatusFilter) => setStatusFilter(prev => (prev === s ? 'all' : s));

  // ── Stat tiles: each opens the register filtered to that slice ──
  const stats: StatItem[] = loading
    ? [
        { label: 'Total Billed', value: '—', sub: 'Loading…' },
        { label: 'Collected', value: '—', sub: 'Loading…' },
        { label: 'Outstanding', value: '—', sub: 'Loading…' },
        { label: 'Overdue', value: '—', sub: 'Loading…' },
        { label: 'Drafts', value: '—', sub: 'Loading…' },
      ]
    : [
        { label: 'Total Billed', value: fmtUsd(pageBilled), sub: filtersActive ? 'Click to show everything' : `Across ${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`, onClick: filtersActive ? clearFilters : undefined },
        { label: 'Collected', value: fmtUsd(pagePaid), tone: pagePaid > 0 ? 'good' : 'default', sub: statusFilter === 'paid' ? 'Filtered — click to clear' : 'Marked paid', onClick: () => toggleStatus('paid') },
        { label: 'Outstanding', value: fmtUsd(pageOutstanding), tone: pageOutstanding > 0 ? 'warn' : 'default', sub: statusFilter === 'outstanding' ? 'Filtered — click to clear' : 'Sent, awaiting payment', onClick: () => toggleStatus('outstanding') },
        { label: 'Overdue', value: pageOverdue, tone: pageOverdue > 0 ? 'bad' : 'default', sub: statusFilter === 'overdue' ? 'Filtered — click to clear' : pageOverdue > 0 ? 'Past due, excludes drafts' : 'Nothing past due', onClick: () => toggleStatus('overdue') },
        { label: 'Drafts', value: pageDrafts, sub: statusFilter === 'draft' ? 'Filtered — click to clear' : 'Not yet sent', onClick: () => toggleStatus('draft') },
      ];

  // ── Register columns ──
  const columns: Column<Invoice>[] = [
    { key: 'invoice_number', header: 'Invoice #', accessor: i => i.invoice_number || '', width: 140, render: i => <span className="ivNum">{i.invoice_number || <span className="ivMuted">No number</span>}</span> },
    { key: 'vendor_name', header: 'Bill To', accessor: i => (i.vendor_name || '').toLowerCase(), render: i => <span className="ivClamp" style={{ color: 'var(--text-primary)', fontWeight: 600 }} title={i.vendor_name}>{i.vendor_name || '—'}</span> },
    { key: 'project', phone: 'hide', header: 'Project', accessor: i => projectName(i.project_id).toLowerCase(), render: i => projectName(i.project_id) ? <span className="ivClamp" style={{ maxWidth: 200 }} title={projectName(i.project_id)}>{projectName(i.project_id)}</span> : <span className="ivMuted">—</span> },
    { key: 'description', phone: 'hide', header: 'Description', accessor: i => (i.description || '').toLowerCase(), render: i => i.description ? <span className="ivClamp" title={i.description}>{i.description}</span> : <span className="ivMuted">—</span> },
    { key: 'total', phone: 'show', header: 'Total', accessor: i => effectiveTotal(i), align: 'right', render: i => <span className="ivTotal">{fmtUsd(effectiveTotal(i))}</span> },
    { key: 'due_date', phone: 'show', header: 'Due', accessor: i => i.due_date || '', render: i => <span className={isOverdue(i) ? 'ivLate' : undefined}>{fmtDate(i.due_date)}</span> },
    { key: 'status', phone: 'show', header: 'Status', accessor: i => STATUS_RANK[statusKey(i.status)] ?? 9, render: i => {
      const b = statusBadge(i.status);
      return <span className="ivBadges"><Badge tone={b.tone}>{b.label}</Badge>{isOverdue(i) && <Badge tone="overdue">Overdue</Badge>}</span>;
    } },
  ];
  const rowActions = (i: Invoice): Action[] => [
    { label: 'Open Invoice', icon: <ArrowSquareOut size={15} />, onClick: () => guard.requestLeave(`/app/invoicing/${i.id}`) },
    { label: pdfBusy === i.id ? 'Generating…' : (i.pdf_url ? 'Open PDF' : 'Generate PDF'), icon: <FilePdf size={15} />, onClick: () => handlePdf(i), disabled: pdfBusy === i.id },
    { label: 'Send to Vendor', icon: <PaperPlaneTilt size={15} />, onClick: () => handleSend(i.id), hidden: statusKey(i.status) === 'paid' },
    { label: 'Delete', icon: <Trash size={15} />, onClick: () => handleDelete(i.id), tone: 'danger' },
  ];

  // ── Register body: loading / error / empty / no-match / rows — each distinct ──
  let listBody: React.ReactNode;
  if (!loading && loadFailed) {
    listBody = (
      <EmptyState
        icon={<WarningCircle size={22} />}
        title="Invoices could not be loaded"
        text={`${error || 'The ledger could not be read.'} This is not an empty ledger — nothing has been lost. Try again.`}
        action={<Button icon={<ArrowClockwise size={15} />} onClick={() => { setLoading(true); fetchInvoices(); }}>Retry</Button>}
      />
    );
  } else if (!loading && invoices.length === 0) {
    listBody = (
      <EmptyState
        icon={<Receipt size={22} />}
        title="No invoices yet"
        text="Create the first invoice — generate the PDF, send it from the table, and overdue flags itself from the due date."
        action={<Button icon={<Plus size={15} weight="bold" />} onClick={() => setShowCreate(true)}>New Invoice</Button>}
      />
    );
  } else {
    listBody = (
      <DataTable
        columns={columns}
        rows={visible}
        rowKey={i => i.id}
        loading={loading}
        defaultSort={{ key: 'due_date', dir: 'desc' }}
        onRowClick={(row) => guard.requestLeave(`/app/invoicing/${row.id}`)}
        rowActions={rowActions}
        empty={
          <EmptyState
            icon={<Receipt size={22} />}
            title="No invoices match these filters"
            text="Clear the search, project, or status filter to see more."
            action={<Button onClick={clearFilters}>Clear Filters</Button>}
          />
        }
      />
    );
  }

  return (
    <div className="ivWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Invoicing' }]}
        title="Invoicing"
        subtitle="Invoices, payments, and sending to vendors — money owed to you."
        actions={
          <Button variant="primary" data-tour="new-invoice" icon={<Plus size={15} weight="bold" />} onClick={() => setShowCreate(true)}>
            New Invoice
          </Button>
        }
      >
        {!loadFailed && <StatRow items={stats} />}

        {!loading && !loadFailed && invoices.length > 0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by number, client, project, or description…"
            filters={
              <>
                <Select
                  aria-label="Project"
                  value={projectFilter}
                  onChange={e => setProjectFilter(e.target.value)}
                  style={{ width: 'auto', minWidth: 160, maxWidth: 280 }}
                  options={[{ value: 'all', label: 'All Projects' }, ...projects.map(p => ({ value: p.id, label: p.name }))]}
                />
                <Select
                  aria-label="Status"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                  style={{ width: 'auto', minWidth: 150 }}
                  options={[
                    { value: 'all', label: 'All Statuses' },
                    { value: 'draft', label: 'Draft' },
                    { value: 'pending', label: 'Pending' },
                    { value: 'sent', label: 'Sent' },
                    { value: 'approved', label: 'Approved' },
                    { value: 'paid', label: 'Paid' },
                    { value: 'outstanding', label: 'Outstanding (unpaid)' },
                    { value: 'overdue', label: 'Overdue' },
                  ]}
                />
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={<span className="ivMuted" style={{ fontSize: 'var(--fs-sm)' }}>{visible.length} of {invoices.length}</span>}
          />
        )}

        {/* NudgeRing pulses this section when the suggestion engine flags
            overdue invoices (ticker deep-links land on this anchor). */}
        <NudgeRing anchorId={ANCHOR_INVOICES_OVERDUE}>
          <div className="ivList">
            <Card flush>{listBody}</Card>
          </div>
        </NudgeRing>
      </PageShell>

      {/* ── Composer — SmartCreate: pick a project and it walks in knowing the job ── */}
      <FormModal
        open={showCreate}
        onClose={closeComposer}
        title="New Invoice"
        subtitle={ctx?.project?.name ? `${ctx.project.name} · the server computes the total — amount + tax, every time.` : 'The server computes the total — amount + tax, every time.'}
        onSubmit={handleCreate}
        submitLabel="Create Invoice"
        busy={creating}
        error={error || null}
      >
        {ctx && (
          <div className="ivLadder">
            <InsightRow label="Original Contract" value={fmtUsd(cOriginal)} />
            <InsightRow label="Approved COs" value={(cCoTotal >= 0 ? '+' : '-') + fmtUsd(Math.abs(cCoTotal))} />
            <InsightRow label="Revised Contract" value={fmtUsd(cRevised)} />
            <InsightRow label="Billed to Date" value={fmtUsd(cBilled)} />
            <InsightRow label="Outstanding" value={fmtUsd(Math.max(0, cBilled - cPaid))} strong />
          </div>
        )}
        <FormGrid cols={2}>
          <Field label="Project" required hint={ctx ? 'Snapshot loaded — fields below pre-fill from it.' : 'Pick one to pre-fill the rest.'}>
            <Select value={form.project_id} onChange={(e) => { setForm({ ...form, project_id: e.target.value }); if (error) setError(''); }} required placeholder="Select project…" options={projects.map(p => ({ value: p.id, label: p.name }))} />
          </Field>
          <Field label="Bill To" required hint={<>{auto.billto && <AutoChip />} {ctxVendors.length > 0 ? `${ctxVendors.length} known name${ctxVendors.length === 1 ? '' : 's'} on this project — start typing.` : 'The owner fills in once a project is picked.'}</>}>
            <Suggest className="k-input" value={form.vendor_name} onChange={(e) => { setForm({ ...form, vendor_name: e.target.value }); if (error) setError(''); }} required placeholder="Client / owner name" options={ctxVendors} />
          </Field>
          <Field label="Invoice #" hint={<>{auto.num && <AutoChip />} {auto.num ? 'Next in sequence on this project.' : 'Auto-suggested when you pick a project.'}</>}>
            <Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} placeholder="INV-001" />
          </Field>
          <Field label="Vendor Email" hint={<>{auto.email && <AutoChip />} Needed to send the invoice by email.</>}>
            <Input type="email" value={form.vendor_email} onChange={(e) => setForm({ ...form, vendor_email: e.target.value })} placeholder="vendor@email.com" />
          </Field>
          <Field label="Amount">
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Tax">
            <Input type="number" step="0.01" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Invoice Total" hint="Amount + tax — computed live.">
            <div className="ivTotalBox">{fmtUsd(liveTotal)}</div>
          </Field>
          <Field label="Issue Date" hint={<><AutoChip /> Recorded automatically when the invoice is created.</>}>
            <div className="ivReadonly">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </Field>
          <Field label="Due Date" hint={<>{auto.due && <AutoChip />} {auto.due ? 'Net 30 from today — adjust freely.' : 'Overdue flags itself from this date.'}</>}>
            <div className="ivDateInput"><SaguaroDatePicker value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} style={DATE_INPUT_STYLE} /></div>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={[
              { value: 'draft', label: 'Draft' }, { value: 'pending', label: 'Pending' }, { value: 'sent', label: 'Sent' }, { value: 'approved', label: 'Approved' }, { value: 'paid', label: 'Paid' },
            ]} />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Materials, Labor, etc." />
          </Field>
          <Field label="Cost Code" hint={ctxCodes.length > 0 ? `${ctxCodes.length} codes from the project budget.` : 'Budget codes load from the project.'}>
            {ctxCodes.length > 0 ? (
              <Select value={form.cost_code} onChange={(e) => setForm({ ...form, cost_code: e.target.value })} options={[{ value: '', label: 'No cost code' }, ...ctxCodes.map(c => ({ value: c.costCode, label: `${c.costCode} — ${c.description}` }))]} />
            ) : (
              <Input value={form.cost_code} onChange={(e) => setForm({ ...form, cost_code: e.target.value })} placeholder="03-100" />
            )}
          </Field>
          <Field label="Description" span>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Invoice description…" />
          </Field>
          <Field label="Notes" span hint="Internal — never printed on the invoice.">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Internal notes…" />
          </Field>
        </FormGrid>
        <div style={{ marginTop: 16 }}>
          <FlowSteps title="After You Create" steps={[
            { title: 'Draft Is Saved', desc: 'Review and edit anything before it goes out.' },
            { title: 'Generate the PDF', desc: 'One click builds the document — the row keeps the real .pdf link.' },
            { title: 'Send to Owner', desc: 'One click emails it straight from the register.' },
            { title: 'Payment Is Tracked', desc: 'Overdue flags itself from the due date — drafts never count.' },
          ]} />
        </div>
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position: 'relative', zIndex: 10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
