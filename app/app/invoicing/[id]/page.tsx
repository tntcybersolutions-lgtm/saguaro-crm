'use client';
/**
 * Invoice Detail — wired to GET /api/invoices/[id] with Send / Edit / Delete actions.
 * Matches the invoicing list page design tokens (colors / font / radius / space) and
 * uses @phosphor-icons/react (no emoji), consistent with app/app/invoicing/page.tsx.
 *
 * API surface:
 *   GET    /api/invoices/[id]          -> { invoice }
 *   POST   /api/invoices/[id]/send     -> marks status "Sent"
 *   PATCH  /api/invoices/[id]/update   -> { invoice }   (allowed columns updated)
 *   DELETE /api/invoices/[id]/delete   -> { success }
 */
import React, { useState, useEffect, useCallback } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { humanError } from '@/lib/errors';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, PaperPlaneTilt, Trash, PencilSimple, Warning, Check,
  X as XIcon, Receipt, CurrencyDollar, Percent, Coins, CalendarBlank,
  FileText, Buildings, CreditCard, Note, FilePdf, ArrowSquareOut, ArrowsClockwise,
} from '@phosphor-icons/react';
import { colors, font, radius } from '@/lib/design-tokens';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';
import {
  PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, Pill,
  goldButtonStyle, ghostButtonStyle,
} from '@/components/ui/premium';

const GOLD = '#F59E0B';

interface Invoice {
  id: string;
  project_id: string | null;
  invoice_number: string | null;
  vendor_name: string | null;
  vendor_email: string | null;
  description: string | null;
  category: string | null;
  cost_code: string | null;
  amount: number | null;
  tax: number | null;
  total: number | null;
  due_date: string | null;
  status: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  payment_method: string | null;
  check_number: string | null;
  pdf_url: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface Project { id: string; name: string; }

const STATUS_COLORS: Record<string, string> = {
  draft: colors.textDim,
  pending: colors.orange,
  sent: colors.blue,
  approved: colors.green,
  paid: colors.green,
  overdue: colors.red,
};

function statusColor(status?: string | null): string {
  const key = (status ?? 'draft').toLowerCase();
  return STATUS_COLORS[key] ?? colors.textDim;
}

/** Edit-form snapshot of an invoice — used both to seed the modal and as the
 *  clean baseline for the unsaved-work guard. */
function formFromInvoice(inv: Invoice) {
  return {
    invoice_number: inv.invoice_number ?? '',
    vendor_name: inv.vendor_name ?? '',
    vendor_email: inv.vendor_email ?? '',
    description: inv.description ?? '',
    category: inv.category ?? '',
    cost_code: inv.cost_code ?? '',
    amount: inv.amount != null ? String(inv.amount) : '',
    tax: inv.tax != null ? String(inv.tax) : '',
    due_date: inv.due_date ? inv.due_date.slice(0, 10) : '',
    status: (inv.status ?? 'draft').toLowerCase(),
    notes: inv.notes ?? '',
  };
}

function money(v: number | null | undefined): string {
  if (v == null) return '—';
  return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Canonical invoice figure: the stored total when it's a real non-zero
 *  number, else amount + tax. NUMERIC arrives as TEXT (Number() always) and
 *  total is often a stale 0 — a $67,800 invoice must never render as $0. */
function effectiveTotal(i: { amount?: number | null; tax?: number | null; total?: number | null }): number | null {
  const t = Number(i.total);
  if (t > 0) return t;
  if (i.amount == null && i.total == null) return null;
  return (Number(i.amount) || 0) + (Number(i.tax) || 0);
}

/** Timestamps (created/updated/paid) — real instants, parse as-is. */
function dateStr(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/** DATE-ONLY fields (due dates): 'YYYY-MM-DD' -> LOCAL midnight. Feeding the
 *  raw string to new Date() means UTC midnight — the previous evening in
 *  Arizona — so the date renders (and goes overdue) a day early. */
function dateOnlyStr(v: string | null | undefined): string {
  if (!v) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return dateStr(v);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString();
}

/** Overdue = due before today (local), status not paid and not a draft. */
function isOverdue(i: { due_date?: string | null; status?: string | null }): boolean {
  if (!i.due_date) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(i.due_date);
  if (!m) return false;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const st = (i.status || 'draft').toLowerCase();
  return due < today && st !== 'paid' && st !== 'draft';
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params['id'] as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const [busy, setBusy] = useState<'' | 'send' | 'delete' | 'save' | 'pdf'>('');
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);

  // Edit modal
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    invoice_number: '', vendor_name: '', vendor_email: '', description: '',
    category: '', cost_code: '', amount: '', tax: '', due_date: '', status: 'draft', notes: '',
  });

  function showToast(msg: string, color: string = colors.green) {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3500);
  }

  const loadInvoice = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/invoices/${id}`);
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) throw new Error('Failed to load invoice');
      const data = await res.json();
      const inv: Invoice = data.invoice ?? data;
      setInvoice(inv);
      if (inv?.project_id) {
        fetch(`/api/projects?limit=200&fields=id,name`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (!d) return;
            const list: Project[] = Array.isArray(d) ? d : d.projects ?? [];
            const match = list.find(p => p.id === inv.project_id);
            if (match) setProjectName(match.name);
          })
          .catch(() => {});
      }
    } catch (e: any) {
      console.error(e);
      setError(humanError(e, 'Failed to load invoice.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadInvoice(); }, [loadInvoice]);

  function openEdit() {
    if (!invoice) return;
    setForm(formFromInvoice(invoice));
    setEditing(true);
  }

  /* ── Unsaved-work protection (R14): dirty when the edit modal's fields
   *    differ from the loaded invoice; draft autosaves per invoice id. ── */
  const editDirty = editing && !!invoice && JSON.stringify(form) !== JSON.stringify(formFromInvoice(invoice));
  const guard = useUnsavedGuard({
    dirty: editDirty,
    draftKey: `invoice:${id}`,
    draftData: form,
    draftEnabled: !loading && !!invoice,
    restoreDraft: (d) => {
      setForm(f => ({ ...f, ...(d as Partial<typeof form>) }));
      setEditing(true);
    },
    onSave: () => submitSave(),
  });

  /** Close the edit modal through the guard — clean closes immediately,
   *  dirty asks Save / Discard / Stay first. */
  function closeEdit() {
    guard.requestClose(() => setEditing(false));
  }

  async function submitSave(): Promise<boolean> {
    setBusy('save');
    try {
      const amountNum = form.amount ? parseFloat(form.amount) : null;
      const taxNum = form.tax ? parseFloat(form.tax) : null;
      const res = await fetch(`/api/invoices/${id}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_number: form.invoice_number || null,
          vendor_name: form.vendor_name || null,
          vendor_email: form.vendor_email || null,
          description: form.description || null,
          category: form.category || null,
          cost_code: form.cost_code || null,
          // Server is canonical for money — it recomputes total = amount + tax
          // on every write; the client never sends a total.
          amount: amountNum,
          tax: taxNum,
          due_date: form.due_date || null,
          status: (form.status || 'draft').toLowerCase(),
          notes: form.notes || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to update invoice');
      const data = await res.json();
      setInvoice(data.invoice ?? data);
      setEditing(false);
      showToast('Invoice updated');
      return true;
    } catch (e: any) {
      console.error(e); showToast(humanError(e, 'Update failed. Please try again.'), colors.red);
      return false;
    } finally {
      setBusy('');
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (await submitSave()) guard.clearDraft();
  }

  async function handleSend() {
    setBusy('send');
    try {
      const res = await fetch(`/api/invoices/${id}/send`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        // Surface the server's honest reason (e.g. email not configured, no vendor
        // email, provider rejected) instead of a phantom "sent" toast.
        throw new Error(data?.error || 'Failed to send invoice');
      }
      showToast(data?.to ? `Invoice emailed to ${data.to}` : 'Invoice sent to vendor');
      await loadInvoice();
    } catch (e: any) {
      console.error(e); showToast(humanError(e, 'Send failed. Please try again.'), colors.red);
    } finally {
      setBusy('');
    }
  }

  /** Generate (or regenerate) the invoice PDF server-side, then open it.
   *  POST /api/invoices/[id]/pdf -> { pdfUrl }; the Document card below picks
   *  up the stored pdf_url on reload. */
  async function handlePdf(regenerate = false) {
    if (!regenerate && invoice?.pdf_url) { window.open(`/api/files/open?u=${encodeURIComponent(invoice.pdf_url)}`, '_blank', 'noopener'); return; }
    setBusy('pdf');
    try {
      const res = await fetch(`/api/invoices/${id}/pdf`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.pdfUrl) throw new Error(data?.error || 'PDF generation failed');
      window.open(data.pdfUrl, '_blank', 'noopener');
      showToast(regenerate ? 'PDF regenerated' : 'PDF generated');
      await loadInvoice();
    } catch (e: any) {
      console.error(e); showToast(humanError(e, 'PDF failed. Please try again.'), colors.red);
    } finally {
      setBusy('');
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    setBusy('delete');
    try {
      const res = await fetch(`/api/invoices/${id}/delete`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete invoice');
      router.push('/app/invoicing');
    } catch (e: any) {
      console.error(e); showToast(humanError(e, 'Delete failed. Please try again.'), colors.red);
      setBusy('');
    }
  }

  // ── Styles ───────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', background: colors.raised,
    border: `1px solid ${colors.border}`, borderRadius: radius.md,
    color: colors.text, fontSize: font.size.md, outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textMuted,
    marginBottom: 4, display: 'block',
  };

  // ── Loading / Error / Not found ──────────────────────────────────────────
  if (loading) {
    return (
      <PremiumSurface maxWidth={1100}>
        <ModuleSkeleton kpis={4} rows={5} />
      </PremiumSurface>
    );
  }

  if (notFound || (!invoice && !error)) {
    return (
      <PremiumSurface maxWidth={1100}>
        <PremiumEmpty
          icon={<Receipt size={34} weight="duotone" color={GOLD} />}
          title="Invoice not found"
          description="This invoice may have been deleted or you don't have access to it."
          action={
            <button onClick={() => router.push('/app/invoicing')} style={ghostButtonStyle} className="pmBtn">
              <ArrowLeft size={14} /> Back to Invoicing
            </button>
          }
        />
      </PremiumSurface>
    );
  }

  if (error && !invoice) {
    return (
      <PremiumSurface maxWidth={1100}>
        <PremiumEmpty
          tone="error"
          icon={<Warning size={34} weight="duotone" color={colors.red} />}
          title="Couldn't load invoice"
          description={error}
          action={
            <button onClick={() => router.push('/app/invoicing')} style={ghostButtonStyle} className="pmBtn">
              <ArrowLeft size={14} /> Back to Invoicing
            </button>
          }
        />
      </PremiumSurface>
    );
  }

  const inv = invoice as Invoice;
  const sc = statusColor(inv.status);
  const statusLabel = (inv.status ?? 'draft').toLowerCase();
  const computedTotal = effectiveTotal(inv);
  const overdue = isOverdue(inv);

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 600, background: colors.surface, border: `1px solid ${toast.color}`, borderRadius: radius.xl, padding: '12px 20px', color: toast.color, fontSize: font.size.lg, fontWeight: font.weight.bold, boxShadow: '0 8px 32px rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {toast.color === colors.red ? <Warning size={16} /> : <Check size={16} />} {toast.msg}
        </div>
      )}

      <PremiumSurface maxWidth={1100}>
      {/* Back link */}
      <button
        onClick={() => guard.requestLeave('/app/invoicing')}
        style={{ background: 'none', border: 'none', color: colors.textMuted, fontSize: font.size.md, cursor: 'pointer', padding: 0, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <ArrowLeft size={14} /> Invoicing
      </button>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.1)', border: `1px solid rgba(239,68,68,.3)`, borderRadius: radius.md, color: colors.red, fontSize: font.size.md, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Warning size={16} /> {error}
        </div>
      )}

      {/* Header */}
      <ModuleHero
        eyebrow="INVOICE"
        eyebrowIcon={<Receipt size={13} weight="fill" color={GOLD} />}
        aux={
          <>
            <span style={{
              padding: '3px 12px', borderRadius: 999, fontSize: font.size.xs, fontWeight: font.weight.bold,
              textTransform: 'uppercase', letterSpacing: 0.5, background: `${sc}20`, color: sc,
            }}>
              {statusLabel}
            </span>
            {overdue && <Pill tone="red" caps>Overdue</Pill>}
          </>
        }
        title={inv.invoice_number || 'Invoice'}
        subtitle={
          <>
            {inv.vendor_name || 'Unknown vendor'}
            {(projectName || inv.project_id) && <span> · {projectName || 'Project'}</span>}
          </>
        }
        actions={
          <>
            <button onClick={openEdit} style={ghostButtonStyle} className="pmBtn">
              <PencilSimple size={14} /> Edit
            </button>
            <button
              onClick={() => handlePdf()}
              disabled={busy === 'pdf'}
              style={{ ...ghostButtonStyle, opacity: busy === 'pdf' ? 0.6 : 1, cursor: busy === 'pdf' ? 'not-allowed' : 'pointer' }}
              className="pmBtn"
            >
              <FilePdf size={14} /> {busy === 'pdf' ? 'Generating...' : 'PDF'}
            </button>
            <button
              onClick={handleSend}
              disabled={busy === 'send'}
              style={{ ...goldButtonStyle, opacity: busy === 'send' ? 0.6 : 1, cursor: busy === 'send' ? 'not-allowed' : 'pointer' }}
              className="pmBtn"
            >
              <PaperPlaneTilt size={14} /> {busy === 'send' ? 'Sending...' : 'Send'}
            </button>
            <button
              onClick={handleDelete}
              disabled={busy === 'delete'}
              style={{ ...ghostButtonStyle, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: colors.red, opacity: busy === 'delete' ? 0.6 : 1, cursor: busy === 'delete' ? 'not-allowed' : 'pointer' }}
              className="pmBtn"
            >
              <Trash size={14} /> {busy === 'delete' ? 'Deleting...' : 'Delete'}
            </button>
          </>
        }
      />

      {/* Totals strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard icon={<CurrencyDollar size={19} weight="duotone" color={GOLD} />} label="Amount" value={money(inv.amount)} sub="Pre-tax" delay={0.02} />
        <StatCard icon={<Percent size={19} weight="duotone" color={GOLD} />} label="Tax" value={money(inv.tax)} delay={0.06} />
        <StatCard icon={<Coins size={19} weight="duotone" color={GOLD} />} label="Total" value={money(computedTotal)} accent={GOLD} sub="Amount + tax" delay={0.10} />
        <StatCard icon={<CalendarBlank size={19} weight="duotone" color={overdue ? colors.red : GOLD} />} label="Due Date" value={dateOnlyStr(inv.due_date)} accent={overdue ? colors.red : undefined} sub={overdue ? 'Past due' : undefined} delay={0.14} />
      </div>

      {/* Line item / details */}
      <SectionCard title="Invoice Details" icon={<FileText size={17} weight="duotone" color={GOLD} />} flush style={{ marginBottom: 20 }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.md }}>
            <thead>
              <tr style={{ background: colors.darkAlt }}>
                {['Description', 'Category', 'Cost Code', 'Amount', 'Tax', 'Total'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: font.size.xs, fontWeight: font.weight.bold, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.textMuted, borderBottom: `1px solid ${colors.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: `1px solid ${colors.borderDim}` }}>
                <td style={{ padding: '12px 16px', color: colors.text }}>{inv.description || '—'}</td>
                <td style={{ padding: '12px 16px', color: colors.textMuted }}>{inv.category || '—'}</td>
                <td style={{ padding: '12px 16px', color: colors.textMuted, fontFamily: font.mono }}>{inv.cost_code || '—'}</td>
                <td style={{ padding: '12px 16px', color: colors.text, fontVariantNumeric: 'tabular-nums' }}>{money(inv.amount)}</td>
                <td style={{ padding: '12px 16px', color: colors.text, fontVariantNumeric: 'tabular-nums' }}>{money(inv.tax)}</td>
                <td style={{ padding: '12px 16px', color: colors.gold, fontWeight: font.weight.semibold, fontVariantNumeric: 'tabular-nums' }}>{money(computedTotal)}</td>
              </tr>
              <tr style={{ background: 'rgba(245, 158, 11,.05)' }}>
                <td colSpan={5} style={{ padding: '12px 16px', color: colors.textMuted, fontWeight: font.weight.bold, textTransform: 'uppercase', fontSize: font.size.xs, letterSpacing: 0.5, textAlign: 'right' }}>Total Due</td>
                <td style={{ padding: '12px 16px', color: colors.gold, fontWeight: font.weight.black, fontSize: font.size.xl, fontVariantNumeric: 'tabular-nums' }}>{money(computedTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Document — the generated PDF, or the machinery to make one */}
      <SectionCard title="Document" icon={<FilePdf size={17} weight="duotone" color={GOLD} />} style={{ marginBottom: 20 }}>
        {inv.pdf_url ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 260px', minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 11, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' }}>
                <FilePdf size={20} weight="duotone" color={GOLD} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(inv.invoice_number || 'Invoice')}.pdf
                </div>
                <div style={{ fontSize: font.size.sm, color: colors.textMuted, marginTop: 2 }}>Generated invoice document</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href={`/api/files/open?u=${encodeURIComponent(inv.pdf_url || '')}`} target="_blank" rel="noopener noreferrer" style={{ ...goldButtonStyle, padding: '9px 16px', fontSize: 13 }} className="pmBtn">
                <ArrowSquareOut size={14} /> Open PDF
              </a>
              <button onClick={() => handlePdf(true)} disabled={busy === 'pdf'} style={{ ...ghostButtonStyle, padding: '9px 16px', fontSize: 13, opacity: busy === 'pdf' ? 0.6 : 1, cursor: busy === 'pdf' ? 'not-allowed' : 'pointer' }} className="pmBtn">
                <ArrowsClockwise size={14} /> {busy === 'pdf' ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px', fontSize: font.size.md, color: colors.textMuted, lineHeight: 1.6 }}>
              No PDF yet — generate one to get a document you can open, attach, or send.
            </div>
            <button onClick={() => handlePdf()} disabled={busy === 'pdf'} style={{ ...goldButtonStyle, padding: '9px 16px', fontSize: 13, opacity: busy === 'pdf' ? 0.6 : 1, cursor: busy === 'pdf' ? 'not-allowed' : 'pointer' }} className="pmBtn">
              <FilePdf size={14} /> {busy === 'pdf' ? 'Generating...' : 'Generate PDF'}
            </button>
          </div>
        )}
      </SectionCard>

      {/* Vendor & meta */}
      <SectionCard flat title="Vendor & Meta" icon={<Buildings size={17} weight="duotone" color={GOLD} />} style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
          {[
            { l: 'Vendor', v: inv.vendor_name || '—' },
            { l: 'Vendor Email', v: inv.vendor_email || '—' },
            { l: 'Project', v: projectName || inv.project_id || '—' },
            { l: 'Created', v: dateStr(inv.created_at) },
            { l: 'Last Updated', v: dateStr(inv.updated_at) },
          ].map(f => (
            <div key={f.l}>
              <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.textMuted, marginBottom: 4 }}>{f.l}</div>
              <div style={{ fontSize: font.size.md, color: colors.text, wordBreak: 'break-word' }}>{f.v}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Payment (only if relevant) */}
      {(inv.paid_at || inv.paid_amount != null || inv.payment_method || inv.check_number) && (
        <SectionCard flat title="Payment" icon={<CreditCard size={17} weight="duotone" color={GOLD} />} style={{ marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 18 }}>
            {[
              { l: 'Paid Amount', v: money(inv.paid_amount) },
              { l: 'Paid At', v: dateStr(inv.paid_at) },
              { l: 'Method', v: inv.payment_method || '—' },
              { l: 'Check #', v: inv.check_number || '—' },
            ].map(f => (
              <div key={f.l}>
                <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.textMuted, marginBottom: 4 }}>{f.l}</div>
                <div style={{ fontSize: font.size.md, color: colors.text }}>{f.v}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Notes */}
      {inv.notes && (
        <SectionCard flat title="Notes" icon={<Note size={17} weight="duotone" color={GOLD} />} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: font.size.md, color: colors.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {inv.notes}
          </div>
        </SectionCard>
      )}

      </PremiumSurface>

      {/* ── Edit Modal ──────────────────────────────────────────────────── */}
      {editing && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}
        >
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, width: '100%', maxWidth: 600, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,.6)' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: colors.surface, zIndex: 1 }}>
              <h2 style={{ margin: 0, fontSize: font.size.xl, fontWeight: font.weight.black, color: colors.text }}>Edit Invoice</h2>
              <button onClick={closeEdit} style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', display: 'flex' }}>
                <XIcon size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Invoice #</label>
                  <input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} style={inputStyle} placeholder="INV-001" />
                </div>
                <div>
                  <label style={labelStyle}>Vendor Name</label>
                  <input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} style={inputStyle} placeholder="Vendor name" />
                </div>
                <div>
                  <label style={labelStyle}>Vendor Email</label>
                  <input type="email" value={form.vendor_email} onChange={(e) => setForm({ ...form, vendor_email: e.target.value })} style={inputStyle} placeholder="vendor@email.com" />
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}>
                    <option value="draft">Draft</option>
                    <option value="pending">Pending</option>
                    <option value="sent">Sent</option>
                    <option value="approved">Approved</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
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
                  <label style={labelStyle}>Due Date</label>
                  <SaguaroDatePicker value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Category</label>
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle} placeholder="Materials, Labor, etc." />
                </div>
                <div>
                  <label style={labelStyle}>Cost Code</label>
                  <input value={form.cost_code} onChange={(e) => setForm({ ...form, cost_code: e.target.value })} style={inputStyle} placeholder="03-100" />
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
                <button type="button" onClick={closeEdit} style={{ padding: '10px 20px', background: 'none', border: `1px solid ${colors.border}`, borderRadius: radius.lg, color: colors.textMuted, fontSize: font.size.md, fontWeight: font.weight.semibold, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={busy === 'save'} style={{ padding: '10px 24px', background: colors.gold, border: 'none', borderRadius: radius.lg, color: colors.dark, fontSize: font.size.md, fontWeight: font.weight.black, cursor: busy === 'save' ? 'not-allowed' : 'pointer', opacity: busy === 'save' ? 0.6 : 1 }}>
                  {busy === 'save' ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <UnsavedGuardModal guard={guard} />
    </>
  );
}
