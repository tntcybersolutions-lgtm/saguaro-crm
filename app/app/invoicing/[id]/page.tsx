'use client';
/**
 * Invoice Detail — Pass 4, on the RFIs reference layout (record + rail).
 *
 * Anatomy: crumbs → title (invoice number) + the one primary action (Send) with
 * Edit and PDF as secondaries → StatRow (amount / tax / total / due) →
 * workspace: the invoice line, the document and the notes on the left, a
 * 320–384px rail (status, vendor and meta, payment, actions) on the right.
 * Phone: stacked. Edits open in a FormModal.
 *
 * API surface (unchanged):
 *   GET    /api/invoices/[id]          -> { invoice }
 *   POST   /api/invoices/[id]/send     -> marks status "Sent" only once the route reports success
 *   PATCH  /api/invoices/[id]/update   -> { invoice }   (server recomputes total = amount + tax)
 *   POST   /api/invoices/[id]/pdf      -> { pdfUrl }
 *   DELETE /api/invoices/[id]/delete   -> { success }
 */
import React, { useState, useEffect, useCallback } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { humanError } from '@/lib/errors';
import { useParams, useRouter } from 'next/navigation';
import { useProjects } from '@/lib/hooks/useProjects';
import {
  ArrowLeft, PaperPlaneTilt, Trash, PencilSimple, Receipt, FilePdf, ArrowSquareOut, ArrowsClockwise, WarningCircle,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, EmptyState, RowActions, DetailList,
  FormModal, Field, Input, Textarea, Select, FormGrid, Toast, useToast,
  type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';
import { openPdf } from '@/components/PdfViewer';
import { layout } from '@/lib/design-tokens';

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

/** Edit-form snapshot of an invoice — used both to seed the modal and as the
 *  clean baseline for the unsaved-work guard. */
function formFromInvoice(inv: Invoice) {
  return {
    /* The job the invoice was created on. The edit form had no Project field
       at all, so an invoice created against a job reopened for editing with
       the job blank and no way to move it to the right one. */
    project_id: inv.project_id ?? '',
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

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function money(v: number | null | undefined): string {
  if (v == null) return '—';
  return moneyFmt.format(Number(v) || 0);
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
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** DATE-ONLY fields (due dates): 'YYYY-MM-DD' -> LOCAL midnight. Feeding the
 *  raw string to new Date() means UTC midnight — the previous evening in
 *  Arizona — so the date renders (and goes overdue) a day early. */
function dateOnlyStr(v: string | null | undefined): string {
  if (!v) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return dateStr(v);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

/** One status → one badge (same map as the register). */
function statusBadge(s?: string | null): { label: string; tone: BadgeTone } {
  const k = (s || 'draft').toLowerCase();
  if (k === 'pending') return { label: 'Pending', tone: 'under_contract' };
  if (k === 'sent') return { label: 'Sent', tone: 'lead' };
  if (k === 'approved') return { label: 'Approved', tone: 'ongoing' };
  if (k === 'paid') return { label: 'Paid', tone: 'completed' };
  if (k === 'overdue') return { label: 'Overdue', tone: 'overdue' };
  return { label: 'Draft', tone: 'neutral' };
}

const CSS = `
.idWs > .k-page { max-width: none; }
.idCq { container: idws / inline-size; min-width: 0; }
.idSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.idSplit > * { min-width: 0; }
.idMain { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.idRail { order: -1; }
@container idws (min-width: 860px) {
  .idSplit { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 30%, ${layout.detailRailMax}px); }
  .idRail { order: 0; position: sticky; top: 16px; }
}
.idTableWrap { overflow-x: auto; }
.idTable { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.idTable th { text-align: left; padding: 8px 12px; font-size: 12px; font-weight: 700; color: var(--text-tertiary); background: var(--bg-surface-2); border-bottom: 1px solid var(--border-default); white-space: nowrap; }
.idTable td { padding: 10px 12px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary); vertical-align: top; font-variant-numeric: tabular-nums; }
.idTable th:first-child, .idTable td:first-child { padding-left: var(--sp-4); }
.idTable th[data-align="right"], .idTable td[data-align="right"] { text-align: right; white-space: nowrap; }
.idTable td[data-desc] { color: var(--text-primary); min-width: 220px; white-space: normal; }
.idTable tfoot td { font-weight: 800; color: var(--text-primary); background: var(--bg-surface-2); border-top: 2px solid var(--border-default); }
.idTotalDue { font-size: var(--fs-lg); }
.idDoc { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.idDocIcon { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--radius-sm); background: var(--bg-surface-2); border: 1px solid var(--border-default); color: var(--text-secondary); flex-shrink: 0; }
.idDocMeta { flex: 1 1 240px; min-width: 0; }
.idDocMeta > div:first-child { font-size: var(--fs-md); font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.idDocMeta > div + div { font-size: var(--fs-sm); color: var(--text-tertiary); margin-top: 2px; }
.idBtns { display: flex; gap: 8px; flex-wrap: wrap; }
.idProse { font-size: var(--fs-md); line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; max-width: ${layout.readingMaxWidth}; }
.idSection { display: flex; flex-direction: column; gap: 8px; }
.idSection + .idSection { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
.idSectionTitle { font-size: var(--fs-sm); font-weight: 700; color: var(--text-tertiary); }
.idBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.idNext { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.5; }
.idActions { display: flex; flex-direction: column; gap: 8px; }
.idActions .k-btn { width: 100%; justify-content: flex-start; }
.idActionsRow { display: flex; gap: 8px; align-items: center; }
.idActionsRow > .k-btn { flex: 1 1 auto; }
.idMuted { color: var(--text-tertiary); }
.idDateInput { width: 100%; }
@media (max-width: 640px) {
  .idWs .k-btn, .idWs .k-stat, .idWs .k-input { min-height: 44px; }
}
`;

const DATE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', fontSize: 14,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
};

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
  /* Tenant jobs for the edit form's Project picker (same source as the register). */
  const { projects: jobList } = useProjects();
  const { toast, show } = useToast(4000);
  const showToast = (msg: string, bad = false) => show(msg, bad ? 'bad' : 'good');

  // Edit modal
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    project_id: '', invoice_number: '', vendor_name: '', vendor_email: '', description: '',
    category: '', cost_code: '', amount: '', tax: '', due_date: '', status: 'draft', notes: '',
  });

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
          project_id: form.project_id || null,
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
      const saved: Invoice = data.invoice ?? data;
      setInvoice(saved);
      setProjectName(jobList.find(p => p.id === saved?.project_id)?.name ?? null);
      setEditing(false);
      showToast('Invoice updated.');
      return true;
    } catch (e: any) {
      console.error(e); showToast(humanError(e, 'Update failed. Please try again.'), true);
      return false;
    } finally {
      setBusy('');
    }
  }

  async function handleSave() {
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
      showToast(data?.to ? `Invoice emailed to ${data.to}.` : 'Invoice sent to vendor.');
      await loadInvoice();
    } catch (e: any) {
      console.error(e); showToast(humanError(e, 'Send failed. Please try again.'), true);
    } finally {
      setBusy('');
    }
  }

  /** Generate (or regenerate) the invoice PDF server-side, then open it.
   *  POST /api/invoices/[id]/pdf -> { pdfUrl }; the Document card below picks
   *  up the stored pdf_url on reload. */
  async function handlePdf(regenerate = false) {
    if (!regenerate && invoice?.pdf_url) { openPdf({ url: `/api/files/open?u=${encodeURIComponent(invoice.pdf_url)}` }); return; }
    setBusy('pdf');
    try {
      const res = await fetch(`/api/invoices/${id}/pdf`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.pdfUrl) throw new Error(data?.error || 'PDF generation failed');
      openPdf({ url: data.pdfUrl });
      showToast(regenerate ? 'PDF regenerated.' : 'PDF generated.');
      await loadInvoice();
    } catch (e: any) {
      console.error(e); showToast(humanError(e, 'PDF failed. Please try again.'), true);
    } finally {
      setBusy('');
    }
  }

  async function handleDelete() {
    if (!(await confirmDialog({ title: 'Please confirm', message: 'Delete this invoice? This cannot be undone.', danger: true }))) return;
    setBusy('delete');
    try {
      const res = await fetch(`/api/invoices/${id}/delete`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete invoice');
      router.push('/app/invoicing');
    } catch (e: any) {
      console.error(e); showToast(humanError(e, 'Delete failed. Please try again.'), true);
      setBusy('');
    }
  }

  const crumbs = [{ label: 'Invoicing', href: '/app/invoicing' }, { label: invoice?.invoice_number || 'Invoice' }];

  // ── Loading / Error / Not found ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="idWs">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <PageShell crumbs={[{ label: 'Invoicing', href: '/app/invoicing' }, { label: 'Loading…' }]} title="Invoice" subtitle="Loading the invoice…">
          <Card flush><div style={{ padding: 16 }}><ModuleSkeleton hero={false} kpis={4} rows={4} /></div></Card>
        </PageShell>
      </div>
    );
  }

  if (notFound || (!invoice && !error)) {
    return (
      <div className="idWs">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <PageShell crumbs={[{ label: 'Invoicing', href: '/app/invoicing' }, { label: 'Not Found' }]} title="Invoice">
          <Card flush>
            <EmptyState
              icon={<Receipt size={22} />}
              title="Invoice not found"
              text="This invoice may have been deleted or you don't have access to it."
              action={<Button icon={<ArrowLeft size={14} />} onClick={() => router.push('/app/invoicing')}>Back to Invoicing</Button>}
            />
          </Card>
        </PageShell>
      </div>
    );
  }

  if (error && !invoice) {
    return (
      <div className="idWs">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <PageShell crumbs={[{ label: 'Invoicing', href: '/app/invoicing' }, { label: 'Error' }]} title="Invoice">
          <Card flush>
            <EmptyState
              icon={<WarningCircle size={22} />}
              title="Couldn't load the invoice"
              text={`${error} Nothing has been lost — try again.`}
              action={<div className="idBtns" style={{ justifyContent: 'center' }}><Button icon={<ArrowsClockwise size={15} />} onClick={loadInvoice}>Retry</Button><Button icon={<ArrowLeft size={14} />} onClick={() => router.push('/app/invoicing')}>Back to Invoicing</Button></div>}
            />
          </Card>
        </PageShell>
      </div>
    );
  }

  const inv = invoice as Invoice;
  const status = statusBadge(inv.status);
  const computedTotal = effectiveTotal(inv);
  const overdue = isOverdue(inv);
  const paidKey = (inv.status || 'draft').toLowerCase() === 'paid';

  const stats: StatItem[] = [
    { label: 'Amount', value: money(inv.amount), sub: 'Pre-tax' },
    { label: 'Tax', value: money(inv.tax), sub: inv.amount != null && inv.tax != null && Number(inv.amount) > 0 ? `${((Number(inv.tax) / Number(inv.amount)) * 100).toFixed(2)}% of amount` : 'As recorded' },
    { label: 'Total', value: money(computedTotal), sub: 'Amount + tax' },
    { label: 'Due Date', value: dateOnlyStr(inv.due_date), tone: overdue ? 'bad' : 'default', sub: overdue ? 'Past due' : paidKey ? 'Paid' : 'Overdue flags itself from this date' },
  ];

  return (
    <div className="idWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={crumbs}
        title={inv.invoice_number || 'Invoice'}
        badge={<span className="idBadges"><Badge tone={status.tone} dot>{status.label}</Badge>{overdue && <Badge tone="overdue">Overdue</Badge>}</span>}
        subtitle={`${inv.vendor_name || 'Unknown vendor'}${projectName || inv.project_id ? ` · ${projectName || 'Project'}` : ''}`}
        actions={
          <>
            <Button icon={<PencilSimple size={15} />} onClick={openEdit} disabled={editing}>Edit</Button>
            <Button icon={<FilePdf size={15} />} onClick={() => handlePdf()} disabled={busy === 'pdf'}>{busy === 'pdf' ? 'Generating…' : inv.pdf_url ? 'Open PDF' : 'Generate PDF'}</Button>
            {!paidKey && (
              <Button variant="primary" icon={<PaperPlaneTilt size={15} />} onClick={handleSend} disabled={busy === 'send'}>{busy === 'send' ? 'Sending…' : 'Send to Vendor'}</Button>
            )}
          </>
        }
      >
        {error && (
          <div className="idNext" role="alert" style={{ color: 'var(--status-overdue)' }}><WarningCircle size={15} /> {error}</div>
        )}

        <StatRow items={stats} />

        <div className="idCq">
          <div className="idSplit">
            <div className="idMain">
              <Card title="Invoice Details" subtitle="One line — the server computes the total from amount + tax." flush>
                <div className="idTableWrap">
                  <table className="idTable k-table-skin">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Cost Code</th>
                        <th data-align="right">Amount</th>
                        <th data-align="right">Tax</th>
                        <th data-align="right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td data-desc="true">{inv.description || <span className="idMuted">—</span>}</td>
                        <td>{inv.category || <span className="idMuted">—</span>}</td>
                        <td>{inv.cost_code || <span className="idMuted">—</span>}</td>
                        <td data-align="right">{money(inv.amount)}</td>
                        <td data-align="right">{money(inv.tax)}</td>
                        <td data-align="right" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{money(computedTotal)}</td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5} data-align="right">Total Due</td>
                        <td data-align="right" className="idTotalDue">{money(computedTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>

              <Card title="Document" subtitle={inv.pdf_url ? 'Generated invoice document' : 'No PDF yet'}>
                {inv.pdf_url ? (
                  <div className="idDoc">
                    <span className="idDocIcon"><FilePdf size={20} /></span>
                    <div className="idDocMeta">
                      <div>{(inv.invoice_number || 'Invoice')}.pdf</div>
                      <div>Open it, attach it, or send it — regenerate after an edit.</div>
                    </div>
                    <div className="idBtns">
                      <Button icon={<ArrowSquareOut size={14} />} onClick={() => openPdf({ url: `/api/files/open?u=${encodeURIComponent(inv.pdf_url || '')}`, title: 'Invoice' })}>Open PDF</Button>
                      <Button icon={<ArrowsClockwise size={14} />} onClick={() => handlePdf(true)} disabled={busy === 'pdf'}>{busy === 'pdf' ? 'Regenerating…' : 'Regenerate'}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="idDoc">
                    <div className="idDocMeta"><div style={{ fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'normal' }}>No PDF yet — generate one to get a document you can open, attach, or send.</div></div>
                    <Button icon={<FilePdf size={14} />} onClick={() => handlePdf()} disabled={busy === 'pdf'}>{busy === 'pdf' ? 'Generating…' : 'Generate PDF'}</Button>
                  </div>
                )}
              </Card>

              {inv.notes && (
                <Card title="Notes" subtitle="Internal — never printed on the invoice.">
                  <div className="idProse">{inv.notes}</div>
                </Card>
              )}
            </div>

            <aside className="idRail" aria-label="Invoice details and actions">
              <Card title="Details">
                <div className="idSection">
                  <div className="idNext">
                    {status.label === 'Draft' && 'Draft — generate the PDF and send it to put it on the clock.'}
                    {status.label === 'Pending' && 'Pending — waiting to go out.'}
                    {status.label === 'Sent' && (overdue ? 'Sent and past due.' : 'Sent — overdue flags itself from the due date.')}
                    {status.label === 'Approved' && 'Approved by the customer — awaiting payment.'}
                    {status.label === 'Paid' && 'Paid — this invoice is settled.'}
                  </div>
                </div>
                <div className="idSection">
                  <DetailList items={[
                    ['Vendor', inv.vendor_name || ''],
                    ['Vendor Email', inv.vendor_email || ''],
                    ['Project', projectName || inv.project_id || ''],
                    ['Category', inv.category || ''],
                    ['Cost Code', inv.cost_code || ''],
                    ['Due', <span key="d" style={{ color: overdue ? 'var(--status-overdue)' : undefined }}>{dateOnlyStr(inv.due_date)}</span>],
                    ['Created', dateStr(inv.created_at)],
                    ['Updated', dateStr(inv.updated_at)],
                  ]} />
                </div>
                {(inv.paid_at || inv.paid_amount != null || inv.payment_method || inv.check_number) && (
                  <div className="idSection">
                    <div className="idSectionTitle">Payment</div>
                    <DetailList items={[
                      ['Paid Amount', money(inv.paid_amount)],
                      ['Paid At', dateStr(inv.paid_at)],
                      ['Method', inv.payment_method || ''],
                      ['Check #', inv.check_number || ''],
                    ]} />
                  </div>
                )}
                <div className="idSection">
                  <div className="idActions">
                    {!paidKey && (
                      <Button icon={<PaperPlaneTilt size={16} />} onClick={handleSend} disabled={busy === 'send'}>{busy === 'send' ? 'Sending…' : 'Send to Vendor'}</Button>
                    )}
                    <div className="idActionsRow">
                      <Button icon={<PencilSimple size={16} />} onClick={openEdit} disabled={editing}>Edit Invoice</Button>
                      <RowActions actions={[
                        { label: inv.pdf_url ? 'Regenerate PDF' : 'Generate PDF', icon: <FilePdf size={15} />, onClick: () => handlePdf(!!inv.pdf_url), disabled: busy === 'pdf' },
                        { label: 'Delete', icon: <Trash size={15} />, onClick: handleDelete, tone: 'danger', disabled: busy === 'delete' },
                      ]} />
                    </div>
                    <Button icon={<ArrowLeft size={16} />} onClick={() => guard.requestLeave('/app/invoicing')}>All Invoices</Button>
                  </div>
                </div>
              </Card>
            </aside>
          </div>
        </div>
      </PageShell>

      {/* ── Edit ───────────────────────────────────────────────────────── */}
      <FormModal
        open={editing}
        onClose={closeEdit}
        title={`Edit ${inv.invoice_number || 'Invoice'}`}
        subtitle="Total updates automatically when you save."
        onSubmit={handleSave}
        submitLabel="Save Changes"
        busy={busy === 'save'}
      >
        <FormGrid cols={2}>
          <Field label="Project" span>
            <Select
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              placeholder="Select project…"
              options={[
                ...jobList.map(p => ({ value: p.id, label: p.name })),
                /* Keep the saved job selectable even if it is not in the active list. */
                ...(form.project_id && !jobList.some(p => p.id === form.project_id)
                  ? [{ value: form.project_id, label: projectName || 'Current project' }]
                  : []),
              ]}
            />
          </Field>
          <Field label="Invoice #">
            <Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} placeholder="INV-001" />
          </Field>
          <Field label="Vendor Name">
            <Input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} placeholder="Vendor name" />
          </Field>
          <Field label="Vendor Email">
            <Input type="email" value={form.vendor_email} onChange={(e) => setForm({ ...form, vendor_email: e.target.value })} placeholder="vendor@email.com" />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={[
              { value: 'draft', label: 'Draft' }, { value: 'pending', label: 'Pending' }, { value: 'sent', label: 'Sent' }, { value: 'approved', label: 'Approved' }, { value: 'paid', label: 'Paid' }, { value: 'overdue', label: 'Overdue' },
            ]} />
          </Field>
          <Field label="Amount">
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Tax">
            <Input type="number" step="0.01" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Due Date">
            <div className="idDateInput"><SaguaroDatePicker value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} style={DATE_INPUT_STYLE} /></div>
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Materials, Labor, etc." />
          </Field>
          <Field label="Cost Code">
            <Input value={form.cost_code} onChange={(e) => setForm({ ...form, cost_code: e.target.value })} placeholder="03-100" />
          </Field>
          <Field label="Description" span>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Invoice description…" />
          </Field>
          <Field label="Notes" span hint="Internal — never printed on the invoice.">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Internal notes…" />
          </Field>
        </FormGrid>
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position: 'relative', zIndex: 10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
