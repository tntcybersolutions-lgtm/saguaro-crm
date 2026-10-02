'use client';
/**
 * Invoicing Page — Fully wired to /api/invoices/list and /api/invoices/create.
 * Uses DataTable with sorting, filtering, pagination.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, CurrencyDollar, PaperPlaneTilt, Trash, Warning, Receipt, FilePdf } from '@phosphor-icons/react';
import DataTable from '../../../components/DataTable';
import { colors, font, radius } from '../../../lib/design-tokens';
import { PremiumSurface, ModuleHero, SectionCard, StatStrip, FlowSteps, InsightRow, AutoChip, IconChip, Pill, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { moduleAccent } from '@/lib/module-identity';
import NudgeRing from '@/components/intelligence/NudgeRing';
import { ANCHOR_INVOICES_OVERDUE } from '@/lib/suggestions';
import Suggest from '@/components/ui/Suggest';
import { StatusPill } from '@/components/ui/Status';
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

const columnHelper = createColumnHelper<Invoice>();

const STATUS_COLORS: Record<string, string> = {
  draft: colors.textDim,
  pending: colors.orange,
  sent: colors.blue,
  approved: colors.green,
  paid: colors.green,
  overdue: colors.red,
};

const INV_ACCENT = moduleAccent('invoices');

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

export default function InvoicingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** True when the invoice list read failed — keeps "empty" from reading as an
   *  all-clear (0 overdue, $0 outstanding) on a ledger we never managed to read. */
  const [loadFailed, setLoadFailed] = useState(false);
  /** Confirmed delivery message — only set after the send route reports emailed. */
  const [sentNotice, setSentNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state — matches API schema
  const [form, setForm] = useState({
    project_id: '',
    vendor_name: '',
    invoice_number: '',
    vendor_email: '',
    description: '',
    category: '',
    cost_code: '',
    amount: '',
    tax: '',
    due_date: '',
    status: 'draft',
    notes: '',
  });
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

  const money = ctx?.money;
  const cOriginal = Number(money?.originalContract) || 0;
  const cCoTotal = Number(money?.approvedCoTotal) || 0;
  const cRevised = Number(money?.revisedContract) || (cOriginal + cCoTotal);
  const cBilled = Number(money?.billedToDate) || 0;
  const cPaid = Number(money?.paidToDate) || 0;
  const ctxVendors = (ctx?.vendors || []) as string[];
  const ctxCodes = (ctx?.costCodes || []) as { division: string; costCode: string; description: string }[];
  const fmtUsd = (n: number) => '$' + ((Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }));
  const liveTotal = (parseFloat(form.amount) || 0) + (parseFloat(form.tax) || 0);

  const pageBilled = invoices.reduce((s, i) => s + effectiveTotal(i), 0);
  const pagePaid = invoices.filter(i => statusKey(i.status) === 'paid').reduce((s, i) => s + effectiveTotal(i), 0);
  const pageOutstanding = invoices.filter(i => { const st = statusKey(i.status); return st !== 'paid' && st !== 'draft'; }).reduce((s, i) => s + effectiveTotal(i), 0);
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
      setForm({ project_id: '', vendor_name: '', invoice_number: '', vendor_email: '', description: '', category: '', cost_code: '', amount: '', tax: '', due_date: '', status: 'draft', notes: '' });
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (await submitCreate()) guard.clearDraft();
  }

  /** Every close path (Close / Cancel / hero toggle) runs through the guard:
   *  clean closes immediately, dirty asks Save / Discard / Stay first. */
  function closeComposer() {
    guard.requestClose(() => {
      setShowCreate(false);
      setForm({ project_id: '', vendor_name: '', invoice_number: '', vendor_email: '', description: '', category: '', cost_code: '', amount: '', tax: '', due_date: '', status: 'draft', notes: '' });
    });
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this invoice?')) return;
    setError('');
    try {
      const res = await fetch(`/api/invoices/${id}/delete`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Delete failed (${res.status})`);
      }
      await fetchInvoices();
    } catch (e: any) {
      console.error(e);
      setError(humanError(e, "Couldn't delete the invoice. It is still on the ledger."));
    }
  }

  /**
   * The send route is already honest — it refuses with a 400 when the invoice
   * has no vendor_email and a 502 when email is not provisioned or Resend
   * rejects the message, and it only flips the row to "sent" after delivery.
   * This used to swallow both, so accounting saw the button click succeed and
   * believed the vendor had been emailed. Now the refusal reaches the screen.
   */
  async function handleSend(id: string) {
    setError(''); setSentNotice('');
    try {
      const res = await fetch(`/api/invoices/${id}/send`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.emailed) {
        throw new Error(data?.error || `The invoice was not sent (${res.status}).`);
      }
      setSentNotice(`Invoice emailed to ${data.to}.`);
      setTimeout(() => setSentNotice(''), 6000);
      await fetchInvoices();
    } catch (e: any) {
      console.error(e);
      setError(humanError(e, 'The invoice was NOT emailed. Nothing was sent to the vendor.'));
      // Re-read so the row still shows its true (un-sent) status.
      await fetchInvoices();
    }
  }

  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  /**
   * POST /api/invoices/[id]/pdf -> { pdfUrl }.
   *
   * This used to short-circuit: if the row already carried a pdf_url it opened
   * that directly. But the stored value is a SIGNED url with an hour on it —
   * the route that writes it says so in its own comment — so any invoice
   * looked at more than an hour after its PDF was made opened to
   *
   *   {"error":"InvalidJWT","message":"\"exp\" claim timestamp check failed"}
   *
   * which is what a GC sees when they click PDF on last week's invoice. The
   * stored value is a "this has a PDF" flag, not a link. Always ask for a
   * fresh one; the route regenerates cheaply and returns a working URL.
   */
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
      setError(humanError(e, "Couldn't generate the PDF. Please try again."));
    } finally {
      setPdfBusy(null);
    }
  }

  const columns = useMemo(() => [
    columnHelper.accessor('invoice_number', {
      header: 'Invoice #',
      cell: (info) => <span style={{ fontWeight: font.weight.semibold }}>{info.getValue() || '—'}</span>,
    }),
    columnHelper.accessor('vendor_name', {
      header: 'Vendor',
      cell: (info) => info.getValue(),
    }),
    columnHelper.accessor('description', {
      header: 'Description',
      cell: (info) => <span style={{ color: colors.textMuted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }}>{info.getValue() || '—'}</span>,
    }),
    columnHelper.accessor('amount', {
      header: 'Amount',
      // DB money columns round-trip as TEXT — sort on the coerced number, not the string.
      sortingFn: (a, b) => (Number(a.original.amount) || 0) - (Number(b.original.amount) || 0),
      cell: (info) => {
        const v = info.getValue();
        return v != null ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';
      },
    }),
    columnHelper.accessor('total', {
      header: 'Total',
      // Sort on the same effective total the cell renders (raw `total` can be null/stale).
      sortingFn: (a, b) => effectiveTotal(a.original) - effectiveTotal(b.original),
      cell: (info) => {
        const v = effectiveTotal(info.row.original);
        return <span style={{ fontWeight: font.weight.bold, color: colors.gold, fontVariantNumeric: 'tabular-nums' }}>${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>;
      },
    }),
    columnHelper.accessor('due_date', {
      header: 'Due Date',
      cell: (info) => {
        const v = info.getValue();
        if (!v) return '—';
        const d = parseDateOnly(v);
        if (!d) return '—';
        const overdue = isOverdue(info.row.original);
        return <span style={{ color: overdue ? colors.red : colors.text }}>{d.toLocaleDateString()}</span>;
      },
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => {
        const s = statusKey(info.getValue());
        const overdue = isOverdue(info.row.original);
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <StatusPill module="invoices" status={s} size="sm" />
            {overdue && <Pill tone="red" caps>Overdue</Pill>}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: (info) => {
        const inv = info.row.original;
        return (
          <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => handlePdf(inv)}
              title={inv.pdf_url ? 'Open PDF' : 'Generate PDF'}
              disabled={pdfBusy === inv.id}
              style={{ ...rowActionStyle, color: inv.pdf_url ? colors.gold : colors.textMuted, opacity: pdfBusy === inv.id ? 0.5 : 1 }}
            >
              <FilePdf size={13} weight={inv.pdf_url ? 'fill' : 'regular'} /> {pdfBusy === inv.id ? '...' : 'PDF'}
            </button>
            <button onClick={() => handleSend(inv.id)} title="Send" style={rowActionStyle}><PaperPlaneTilt size={13} /> Send</button>
            <button onClick={() => handleDelete(inv.id)} title="Delete" style={{ ...rowActionStyle, color: colors.red, border: '1px solid rgba(239,68,68,0.35)' }}><Trash size={13} /></button>
          </div>
        );
      },
    }),
  ], [pdfBusy]);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', background: colors.raised,
    border: `1px solid ${colors.border}`, borderRadius: radius.md,
    color: colors.text, fontSize: font.size.md, outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textMuted, marginBottom: 6, display: 'block',
  };

  const hintStyle: React.CSSProperties = {
    fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5, lineHeight: 1.45,
  };

  return (
    <>
    <PremiumSurface maxWidth={1600}>
      {/* Header */}
      <ModuleHero
        eyebrow="Finance"
        eyebrowIcon={<IconChip size={24} vivid={INV_ACCENT.vivid ?? INV_ACCENT.hex}><Receipt size={13} weight="fill" color="#F8FAFC" /></IconChip>}
        accentColor={INV_ACCENT.hex}
        title="Invoicing"
        subtitle="Manage invoices, track payments, and send to vendors."
        note="money owed to you"
        actions={
          <button data-tour="new-invoice" onClick={() => (showCreate ? closeComposer() : setShowCreate(true))} style={goldButtonStyle} className="pmBtn">
            <Plus size={15} weight="bold" /> New Invoice
          </button>
        }
      />

      {!loading && invoices.length > 0 && (
        <StatStrip items={[
          {href: '/app/invoicing',  label: 'Total Billed', value: fmtUsd(pageBilled), sub: `across ${invoices.length} invoice${invoices.length === 1 ? '' : 's'}` },
          {href: '/app/invoicing',  label: 'Collected', value: fmtUsd(pagePaid), accent: '#3dd68c', sub: 'marked paid' },
          {href: '/app/invoicing',  label: 'Outstanding', value: fmtUsd(pageOutstanding), accent: pageOutstanding > 0 ? '#F59E0B' : undefined, sub: 'sent, awaiting payment' },
          {href: '/app/invoicing',  label: 'Overdue', value: String(pageOverdue), accent: pageOverdue > 0 ? colors.red : undefined, sub: pageOverdue > 0 ? 'past due, excludes drafts' : 'nothing past due' },
          {href: '/app/invoicing',  label: 'Drafts', value: String(pageDrafts), sub: 'not yet sent' },
        ]} />
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.1)', border: `1px solid rgba(239,68,68,.3)`, borderRadius: radius.md, color: colors.red, fontSize: font.size.md, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Warning size={16} /> {error}
        </div>
      )}

      {/* A confirmed delivery — named recipient, so "sent" means something. */}
      {sentNotice && (
        <div style={{ padding: '12px 16px', background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: radius.md, color: colors.green, fontSize: font.size.md, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          {sentNotice}
        </div>
      )}

      {/* ── Inline Composer — SmartCreate anatomy, right above the ledger ── */}
      {showCreate && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 18, alignItems: 'start', marginBottom: 24 }}>
          <SectionCard
            title="New Invoice"
            icon={<Plus size={17} weight="bold" color="#F59E0B" />}
            subtitle="The server computes the total — amount + tax, every time."
            action={<button type="button" onClick={closeComposer} style={{ ...ghostButtonStyle, padding: '7px 14px', fontSize: 12.5 }} className="pmBtn">Close</button>}
          >
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              {ctx && (
                <StatStrip items={[
                  {href: '/app/invoicing',  label: 'Original Contract', value: fmtUsd(cOriginal) },
                  {href: '/app/invoicing',  label: 'Approved COs', value: (cCoTotal >= 0 ? '+' : '') + fmtUsd(cCoTotal), accent: cCoTotal > 0 ? '#3dd68c' : undefined },
                  {href: '/app/invoicing',  label: 'Revised', value: fmtUsd(cRevised) },
                  {href: '/app/invoicing',  label: 'Billed to Date', value: fmtUsd(cBilled) },
                  {href: '/app/invoicing',  label: 'Outstanding', value: fmtUsd(Math.max(0, cBilled - cPaid)), accent: '#F59E0B' },
                ]} />
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Project *</label>
                  <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} required style={inputStyle}>
                    <option value="">Select project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <div style={hintStyle}>{ctx ? 'Snapshot loaded — fields below pre-fill from it.' : 'Pick one to pre-fill the rest.'}</div>
                </div>
                <div>
                  <label style={labelStyle}>Vendor Name *</label>
                  <Suggest value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} required style={inputStyle} placeholder="Vendor name" options={['v']} />
                  <div style={hintStyle}>{ctxVendors.length > 0 ? `${ctxVendors.length} known vendor${ctxVendors.length === 1 ? '' : 's'} on this project — start typing.` : 'Vendors suggest once a project is picked.'}</div>
                </div>
                <div>
                  <label style={labelStyle}>Invoice #{auto.num && <AutoChip />}</label>
                  <input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} style={inputStyle} placeholder="INV-001" />
                  <div style={hintStyle}>{auto.num ? 'Next in sequence on this project.' : 'Auto-suggested when you pick a project.'}</div>
                </div>
                <div>
                  <label style={labelStyle}>Vendor Email</label>
                  <input type="email" value={form.vendor_email} onChange={(e) => setForm({ ...form, vendor_email: e.target.value })} style={inputStyle} placeholder="vendor@email.com" />
                  <div style={hintStyle}>Needed to send the invoice by email.</div>
                </div>
                <div>
                  <label style={labelStyle}>Amount</label>
                  <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inputStyle} placeholder="0.00" />
                </div>
                <div>
                  <label style={labelStyle}>Tax</label>
                  <input type="number" step="0.01" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} style={inputStyle} placeholder="0.00" />
                </div>
                <div>
                  <label style={labelStyle}>Invoice Total</label>
                  <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', fontWeight: 800, color: colors.gold, background: 'rgba(245,158,11,0.07)', borderColor: 'rgba(245,158,11,0.35)' }}>
                    {'$' + liveTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={hintStyle}>Amount + tax — computed live.</div>
                </div>
                <div>
                  <label style={labelStyle}>Issue Date<AutoChip /></label>
                  <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: colors.textMuted }}>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  <div style={hintStyle}>Recorded automatically when the invoice is created.</div>
                </div>
                <div>
                  <label style={labelStyle}>Due Date{auto.due && <AutoChip />}</label>
                  <SaguaroDatePicker value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} style={inputStyle} />
                  <div style={hintStyle}>{auto.due ? 'Net 30 from today — adjust freely.' : 'Overdue flags itself from this date.'}</div>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}>
                    <option value="draft">Draft</option>
                    <option value="pending">Pending</option>
                    <option value="sent">Sent</option>
                    <option value="approved">Approved</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Category</label>
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle} placeholder="Materials, Labor, etc." />
                </div>
                <div>
                  <label style={labelStyle}>Cost Code</label>
                  {ctxCodes.length > 0 ? (
                    <select value={form.cost_code} onChange={(e) => setForm({ ...form, cost_code: e.target.value })} style={inputStyle}>
                      <option value="">No cost code</option>
                      {ctxCodes.map(c => <option key={c.costCode} value={c.costCode}>{c.costCode} — {c.description}</option>)}
                    </select>
                  ) : (
                    <input value={form.cost_code} onChange={(e) => setForm({ ...form, cost_code: e.target.value })} style={inputStyle} placeholder="03-100" />
                  )}
                  <div style={hintStyle}>{ctxCodes.length > 0 ? `${ctxCodes.length} codes from the project budget.` : 'Budget codes load from the project.'}</div>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Invoice description..." />
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Internal notes..." />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" onClick={closeComposer} style={ghostButtonStyle}>Cancel</button>
                <button type="submit" disabled={creating} className="pmBtn" style={{ ...goldButtonStyle, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}>
                  {creating ? 'Creating...' : 'Create Invoice'}
                </button>
              </div>
            </form>
          </SectionCard>
          <SectionCard flat title="Project Intelligence" icon={<CurrencyDollar size={17} weight="duotone" color="#F59E0B" />}>
            {ctx ? (
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 900, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10 }}>{ctx.project?.name || 'Project'}</div>
                <InsightRow label="Owner" value={ctx.defaults?.ownerName || '—'} />
                <InsightRow label="Invoices on project" value={String(Number(ctx.counts?.invoices) || 0)} />
                <InsightRow label="Pay applications" value={String(Number(money?.payAppCount) || 0)} />
                <InsightRow label="Known vendors" value={String(ctxVendors.length)} />
                <InsightRow label="Budget cost codes" value={String(ctxCodes.length)} />
              </div>
            ) : (
              <div style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.55 }}>
                Pick a project and Saguaro pre-fills the invoice number, known vendors, and budget cost codes from what it already tracks.
              </div>
            )}
            <div style={{ height: 18 }} />
            <FlowSteps title="After you create" steps={[
              { title: 'Draft is saved', desc: 'Review and edit anything before it goes out.' },
              { title: 'Generate the PDF', desc: 'One click builds the document — the row keeps the real .pdf link.' },
              { title: 'Send to owner', desc: 'One click emails it straight from the table.' },
              { title: 'Payment is tracked', desc: 'Overdue flags itself from the due date — drafts never count.' },
            ]} />
          </SectionCard>
        </div>
      )}

      {/* All invoices — DataTable rides its own machined .pmTable plate.
          NudgeRing pulses this section when the suggestion engine flags
          overdue invoices (ticker deep-links land on this anchor). */}
      <NudgeRing anchorId={ANCHOR_INVOICES_OVERDUE}>
        <DataTable
          data={invoices}
          columns={columns}
          loading={loading}
          tableId="invoicing"
          searchPlaceholder="Search invoices..."
          emptyMessage={loadFailed
            ? 'Invoices could not be loaded — this is not an empty ledger. Reload to try again.'
            : 'No invoices yet. Create your first invoice to get started.'}
          onRowClick={(row) => guard.requestLeave(`/app/invoicing/${row.id}`)}
        />
      </NudgeRing>
    </PremiumSurface>
    <UnsavedGuardModal guard={guard} />
    </>
  );
}

/** Uniform machined row action — mini frosted-glass part, one geometry for
 *  PDF / Send / Delete so the action column reads as a single toolkit. */
const rowActionStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  padding: '5px 10px', background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
  border: `1px solid ${colors.border}`, borderRadius: 8,
  color: colors.textMuted, cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
  lineHeight: 1.2, whiteSpace: 'nowrap',
};
