'use client';
/**
 * Purchase orders — vendor and supplier POs on the job, on the kit layout.
 *
 * Reads   GET   /api/projects/:id/purchase-orders
 * Create  POST  /api/purchase-orders/create       (New PO modal, and Duplicate)
 * Verbs   PATCH /api/purchase-orders/:id/status   (draft → sent → received → closed)
 *         POST  /api/documents/purchase-order     (→ { pdfUrl })
 */
import { jsonRequest } from '@/lib/list-view';
import { useEditRights } from '@/lib/hooks/usePermissions';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { openPdf } from '@/components/PdfViewer';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { getLastUsed, setLastUsed, postLearningEvent } from '@/lib/last-used';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { localDay } from '@/lib/calendar-day';
import { MODULES } from '@/lib/status-system';
import {
  PageShell, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select, Callout,
  FormModal, Field, Input, DateInput, FormGrid, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import {
  Package, Plus, X, Wallet, Copy, FilePdf, PaperPlaneTilt, Truck, CheckCircle,
  NotePencil, WarningCircle,
} from '@phosphor-icons/react';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface PurchaseOrder {
  id: string;
  po_num: string;
  vendor: string;
  description: string;
  amount: number;
  issued_date: string;
  delivery_date: string | null;
  status: string;
  line_items: LineItem[];
  project_id: string;
}

const EMPTY_LINE: LineItem = { description: '', quantity: 1, unit_price: 0 };
const EMPTY_FORM = { po_num: '', vendor: '', description: '', delivery_date: '', cost_code: '', tax_pct: 0, shipping: 0, line_items: [{ ...EMPTY_LINE }] };

// Map a DB purchase_orders row (vendor_name/po_number/total/created_at) onto the display shape.
function normalizePo(row: Record<string, unknown>): PurchaseOrder {
  const created = (row.created_at as string) || '';
  return {
    id: String(row.id ?? `po-${Date.now()}`),
    project_id: String(row.project_id ?? ''),
    po_num: (row.po_number as string) || '',
    vendor: (row.vendor_name as string) || '',
    description: (row.description as string) || '',
    amount: Number(row.total ?? row.subtotal ?? 0),
    // The day it was created on this device's calendar (created_at is an instant; its UTC date is tomorrow every evening).
    issued_date: created && !Number.isNaN(new Date(created).getTime()) ? localDay(new Date(created)) : localDay(),
    delivery_date: (row.delivery_date as string) || null,
    status: (row.status as string) || 'draft',
    line_items: (row.line_items as LineItem[]) || [],
  };
}

const TONE: Record<string, BadgeTone> = { draft: 'neutral', waiting: 'under_contract', good: 'ongoing', done: 'completed', bad: 'overdue', warn: 'lead', active: 'ongoing' };
function poBadge(status: string): { label: string; tone: BadgeTone } {
  const k = String(status || 'draft').toLowerCase();
  const def = MODULES.purchase_orders?.statuses?.[k];
  return { label: def?.label || (k.charAt(0).toUpperCase() + k.slice(1)), tone: (def && TONE[def.tone]) || 'neutral' };
}

/* Currency style puts the sign first: -$127,650, never $-127,650. */
const fmt = (n: number) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Date-only values parse at local noon so they never shift a day under UTC. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function plus30() {
  const d = new Date(Date.now() + 30 * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The one status step each PO offers next. */
const NEXT_STEP: Record<string, { to: string; label: string; icon: React.ReactNode }> = {
  draft: { to: 'sent', label: 'Send', icon: <PaperPlaneTilt size={14} /> },
  sent: { to: 'received', label: 'Received', icon: <Truck size={14} /> },
  received: { to: 'closed', label: 'Close', icon: <CheckCircle size={14} /> },
};

const CSS = `
.poLine { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.poLines { display: flex; flex-direction: column; gap: 8px; }
.poTotals { display: grid; grid-template-columns: auto auto; gap: 4px 24px; justify-content: end; font-size: 13px; color: var(--text-secondary); }
.poTotals strong { color: var(--text-primary); text-align: right; font-variant-numeric: tabular-nums; }
@media (max-width: 560px) {
  .poLine { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
  .poLine > :first-child { grid-column: 1 / -1; }
}
`;

type StatusFilter = 'all' | 'draft' | 'sent' | 'received' | 'closed';

export default function PurchaseOrdersPage() {
  const { projectId } = useParams() as { projectId: string };
  const base = `/app/projects/${projectId}`;
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const { toast, show } = useToast(4000);
  const rights = useEditRights('Budget');

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `purchase-orders:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSave(),
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  // Raw DB rows by id — duplicates copy the full server row (cost code, tax,
  // shipping, vendor contact), not just the display projection.
  const [rawById, setRawById] = useState<Record<string, Record<string, unknown>>>({});
  const [dupId, setDupId] = useState<string | null>(null);
  const [pdfId, setPdfId] = useState<string | null>(null);
  // Last-used memory (per user, per project): what was prefilled this open,
  // so the "same as last time" hints show only while the value still matches.
  const [lastPrefill, setLastPrefill] = useState<{ vendor?: string; cost_code?: string; tax_pct?: number }>({});
  // SmartCreate: the project-context snapshot — vendors, cost codes, budget, next PO number.
  const { ctx } = useProjectContext(projectId);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const fetchPos = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/purchase-orders`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't load purchase orders.");
      const rows: Record<string, unknown>[] = json.purchase_orders || [];
      setPos(rows.map(normalizePo));
      setRawById(Object.fromEntries(rows.filter(r => r.id).map(r => [String(r.id), r])));
    } catch (e) {
      setPos([]);
      setLoadError(e instanceof Error ? e.message : "Couldn't load purchase orders.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchPos(); }, [fetchPos]);

  const totalValue = pos.reduce((s, p) => s + (p.amount || 0), 0);
  const draftCount = pos.filter(p => p.status === 'draft').length;
  const sentCount = pos.filter(p => p.status === 'sent').length;
  const receivedCount = pos.filter(p => p.status === 'received').length;

  function updateLineItem(index: number, field: keyof LineItem, value: string | number) {
    setForm(prev => {
      const items = [...prev.line_items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, line_items: items };
    });
  }

  function addLineItem() {
    setForm(prev => ({ ...prev, line_items: [...prev.line_items, { ...EMPTY_LINE }] }));
  }

  function removeLineItem(index: number) {
    setForm(prev => ({ ...prev, line_items: prev.line_items.filter((_, i) => i !== index) }));
  }

  // ── SmartCreate intelligence (all Number-coerced: DB numerics round-trip as strings) ──
  const poSubtotal = form.line_items.reduce((s, li) => s + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0), 0);
  const poTaxPct = Number(form.tax_pct) || 0;
  const poTax = poSubtotal * (poTaxPct / 100);
  const poShipping = Number(form.shipping) || 0;
  const poTotal = poSubtotal + poTax + poShipping;

  const budget = ctx?.budget;
  const bOriginal = Number(budget?.original) || 0;
  const bCommitted = Number(budget?.committed) || 0;
  const bUncommitted = bOriginal - bCommitted;
  const vendors: string[] = (ctx?.vendors || []).filter(Boolean);
  const budgetLines: any[] = budget?.lines || [];
  const costCodeOptions: any[] = (ctx?.costCodes || []).filter((c: any) => c.costCode);
  const nextPoNum = Math.max(Number(ctx?.defaults?.nextPoNumber) || 0, pos.length + 1);
  const nextPoStr = `PO-${String(nextPoNum).padStart(3, '0')}`;
  // Same line-matching the server rollup uses: exact cost code, else its division.
  const selLine = form.cost_code
    ? (budgetLines.find((l: any) => String(l.costCode) === String(form.cost_code))
      || budgetLines.find((l: any) => String(l.division) === String(form.cost_code).slice(0, 2)))
    : null;
  const lineBudget = Number(selLine?.original) || 0;
  const lineCommitted = Number(selLine?.committed) || 0;
  const lineRemaining = lineBudget - lineCommitted - poTotal;

  function openForm() {
    setFormError('');
    setShowForm(true);
    // Last-used memory: prefill vendor / cost code / tax from the last PO
    // this user saved on this project — one keystroke to change.
    const last = getLastUsed<{ vendor?: string; cost_code?: string; tax_pct?: number }>(`po:${projectId}`) || {};
    const useVendor = !!last.vendor && !form.vendor;
    const useCost = !!last.cost_code && !form.cost_code;
    const useTax = typeof last.tax_pct === 'number' && last.tax_pct > 0 && !form.tax_pct;
    setForm(f => ({
      ...f,
      delivery_date: f.delivery_date || plus30(),
      vendor: useVendor ? (last.vendor as string) : f.vendor,
      cost_code: useCost ? (last.cost_code as string) : f.cost_code,
      tax_pct: useTax ? (last.tax_pct as number) : f.tax_pct,
    }));
    setLastPrefill({
      vendor: useVendor ? last.vendor : undefined,
      cost_code: useCost ? last.cost_code : undefined,
      tax_pct: useTax ? last.tax_pct : undefined,
    });
  }

  function closeForm() {
    guard.requestClose(() => { setShowForm(false); setFormError(''); });
  }

  // Prefill hints live only while the field still equals the remembered value —
  // the moment the user edits, the hint drops and the accept is not counted.
  const vendorAuto = !!lastPrefill.vendor && form.vendor === lastPrefill.vendor;
  const costAuto = !!lastPrefill.cost_code && form.cost_code === lastPrefill.cost_code;
  const taxAuto = typeof lastPrefill.tax_pct === 'number' && Number(form.tax_pct) === lastPrefill.tax_pct;

  async function handleSave(): Promise<boolean> {
    if (!form.vendor || !form.description) { setFormError('Vendor and description are required.'); return false; }
    setSaving(true);
    setFormError('');
    const num = form.po_num || nextPoStr;
    try {
      const res = await fetch('/api/purchase-orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          vendor_name: form.vendor,
          po_number: num,
          description: form.description,
          delivery_date: form.delivery_date || null,
          cost_code: form.cost_code || null,
          line_items: form.line_items,
          subtotal: poSubtotal,
          tax: poTax,
          shipping: poShipping,
          total: poTotal,
          status: 'draft',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.purchaseOrder) throw new Error(json.error || 'Create failed');
      setPos(prev => [...prev, normalizePo(json.purchaseOrder)]);
      if (json.purchaseOrder?.id) setRawById(prev => ({ ...prev, [String(json.purchaseOrder.id)]: json.purchaseOrder }));
      // Remember what was actually saved for next time, and receipt any
      // prefill the user accepted unchanged.
      setLastUsed(`po:${projectId}`, { vendor: form.vendor, cost_code: form.cost_code, tax_pct: poTaxPct });
      const accepted = [vendorAuto && 'vendor', costAuto && 'cost_code', taxAuto && 'tax_pct'].filter(Boolean) as string[];
      if (accepted.length > 0) {
        postLearningEvent('last_used_prefill', { projectId, meta: { scope: 'po', fields: accepted } });
      }
      setLastPrefill({});
      setShowForm(false);
      setForm(EMPTY_FORM);
      show('Purchase order created.');
      guard.clearDraft();
      return true;
    } catch {
      setFormError('Could not create the purchase order. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** One-click repeat: copies the full server row of an existing PO into a new
   *  draft — vendor, contact, description, lines, cost code, tax, shipping —
   *  while the number, delivery date, and status regenerate. */
  async function handleDuplicate(po: PurchaseOrder) {
    if (dupId) return;
    setDupId(po.id);
    const src = rawById[po.id] || {};
    const num = nextPoStr;
    try {
      const res = await fetch('/api/purchase-orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          vendor_name: (src.vendor_name as string) || po.vendor,
          po_number: num,                    // regenerates — next in sequence
          vendor_email: src.vendor_email || null,
          vendor_phone: src.vendor_phone || null,
          vendor_address: src.vendor_address || null,
          description: (src.description as string) || po.description || null,
          line_items: src.line_items || po.line_items || null,
          subtotal: src.subtotal != null ? Number(src.subtotal) : null,
          tax: src.tax != null ? Number(src.tax) : null,
          shipping: src.shipping != null ? Number(src.shipping) : null,
          total: src.total != null ? Number(src.total) : po.amount || null,
          status: 'draft',                   // regenerates — always starts draft
          delivery_date: plus30(),           // regenerates — fresh 30-day lead
          cost_code: src.cost_code || null,
          notes: src.notes || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.purchaseOrder) throw new Error(json.error || 'Duplicate failed');
      setPos(prev => [...prev, normalizePo(json.purchaseOrder)]);
      if (json.purchaseOrder?.id) setRawById(prev => ({ ...prev, [String(json.purchaseOrder.id)]: json.purchaseOrder }));
      postLearningEvent('po_duplicated', { projectId, meta: { fromPoId: po.id, newPoNumber: num } });
      show(`Duplicated ${po.po_num || 'PO'} as ${num} (draft) — new delivery date set 30 days out.`);
    } catch {
      show('Could not duplicate the purchase order. Please try again.', 'bad');
    } finally {
      setDupId(null);
    }
  }

  async function handleGeneratePdf(po: PurchaseOrder) {
    setPdfId(po.id);
    try {
      const res = await fetch('/api/documents/purchase-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, poId: po.id }),
      });
      const json = await res.json().catch(() => ({}));
      const url = json.pdfUrl || json.url;
      if (!res.ok || !url) throw new Error(json.error || 'PDF generation failed');
      openPdf({ url, title: 'Purchase Order' });
    } catch {
      show('Could not generate the PO PDF. Please try again.', 'bad');
    } finally {
      setPdfId(null);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    setPos(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    try {
      const res = await fetch(`/api/purchase-orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('status update failed');
      show(`PO status updated to ${status}.`);
    } catch {
      show('Could not update the PO status. Please try again.', 'bad');
      fetchPos();
    }
  }

  // Toolbar-driven view of the PO log.
  const q = search.trim().toLowerCase();
  const filteredPos = pos.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (!q) return true;
    return [p.po_num, p.vendor, p.description].some(v => String(v || '').toLowerCase().includes(q));
  });

  const toggle = (f: StatusFilter) => setStatusFilter(p => (p === f ? 'all' : f));
  const stats: StatItem[] = [
    { label: 'Total PO value', value: loading ? '—' : fmt(totalValue), sub: loading ? undefined : `${pos.length} purchase order${pos.length === 1 ? '' : 's'}`, icon: <Package size={15} />, onClick: () => setStatusFilter('all'), active: statusFilter === 'all' },
    { label: 'Draft', value: loading ? '—' : String(draftCount), icon: <NotePencil size={15} />, onClick: () => toggle('draft'), active: statusFilter === 'draft' },
    { label: 'Sent', value: loading ? '—' : String(sentCount), tone: sentCount > 0 ? 'warn' : 'default', icon: <PaperPlaneTilt size={15} />, onClick: () => toggle('sent'), active: statusFilter === 'sent' },
    { label: 'Received', value: loading ? '—' : String(receivedCount), tone: receivedCount > 0 ? 'good' : 'default', icon: <Truck size={15} />, onClick: () => toggle('received'), active: statusFilter === 'received' },
    ...(ctx ? [{ label: 'Uncommitted', value: fmt(bUncommitted), sub: 'Original less committed', tone: bUncommitted < 0 ? 'bad' as const : 'good' as const, icon: <Wallet size={15} />, href: `${base}/budget` }] : []),
  ];

  const columns: Column<PurchaseOrder>[] = [
    { key: 'po_num', header: 'PO #', width: 110, groupable: false, render: p => p.po_num || '' },
    { key: 'vendor', header: 'Vendor', primary: true, phone: 'show' },
    { key: 'description', header: 'Description', render: p => <span title={p.description} style={{ color: 'var(--text-secondary)' }}>{p.description}</span> },
    { key: 'amount', header: 'Amount', align: 'right', total: 'sum', format: fmt, phone: 'show', accessor: p => Number(p.amount) || 0, render: p => <strong>{fmt(p.amount)}</strong> },
    { key: 'status', header: 'Status', phone: 'show', render: p => { const st = poBadge(p.status); return <Badge tone={st.tone} dot>{st.label}</Badge>; } },
    { key: 'issued_date', header: 'Date', render: p => fmtDate(p.issued_date) },
    { key: 'delivery_date', header: 'Delivery', hidden: true, accessor: p => p.delivery_date || '', render: p => fmtDate(p.delivery_date) },
  ];

  const rowActions = (p: PurchaseOrder): Action[] => {
    const next = NEXT_STEP[p.status];
    return [
      { label: next?.label || 'Next step', icon: next?.icon, inline: true, hidden: !next, onClick: () => { if (next) void handleStatusChange(p.id, next.to); } },
      { label: pdfId === p.id ? 'Building…' : 'PDF', icon: <FilePdf size={14} />, inline: true, disabled: pdfId === p.id, onClick: () => { void handleGeneratePdf(p); } },
      { label: dupId === p.id ? 'Duplicating…' : 'Duplicate', icon: <Copy size={14} />, disabled: !!dupId, onClick: () => { void handleDuplicate(p); } },
    ];
  };

  return (
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
        { label: 'Purchase orders' },
      ]}
      title="Purchase orders"
      subtitle="Vendor and supplier purchase orders."
      actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openForm}>New PO</Button>}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {!loadError && <StatRow items={stats} />}

      {!loading && !loadError && pos.length > 0 && (
        <Toolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by PO number, vendor or description…"
          filters={
            <Select aria-label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} style={{ width: 'auto', minWidth: 160 }}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'draft', label: 'Draft' },
                { value: 'sent', label: 'Sent' },
                { value: 'received', label: 'Received' },
                { value: 'closed', label: 'Closed' },
              ]} />
          }
        />
      )}

      {loadError ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load purchase orders" text={loadError} action={<Button onClick={fetchPos}>Try again</Button>} />
      ) : (
        <DataTable<PurchaseOrder>
          tableId="project-purchase-orders"
          /* The same status door and the same one-step-at-a-time rule as the
             row's Send / Received / Close: a PO that is not at the step before
             the one picked is left as it is and named in the result. */
          bulkEdit={{
            noun: 'purchase order',
            allowed: rights.edit,
            status: {
              options: [{ value: 'sent', label: 'Sent' }, { value: 'received', label: 'Received' }, { value: 'closed', label: 'Closed' }],
              apply: (p, v) => {
                const from = String(p.status || 'draft').toLowerCase();
                if (NEXT_STEP[from]?.to !== v) {
                  return Promise.resolve(new Response(JSON.stringify({ error: `PO ${p.po_num || p.id.slice(0, 8)} is ${from}; its next step is ${NEXT_STEP[from]?.to ?? 'none'}.` }), { status: 409 }));
                }
                return jsonRequest(`/api/purchase-orders/${p.id}/status`, 'PATCH', { status: v });
              },
            },
            onDone: () => { void fetchPos(); },
          }}
          exportName="purchase-orders"
          columns={columns}
          rows={filteredPos}
          loading={loading}
          rowKey={p => p.id}
          defaultSort={{ key: 'issued_date', dir: 'desc' }}
          rowActions={rowActions}
          empty={
            pos.length === 0 ? (
              <EmptyState
                icon={<Package size={22} />}
                title="No purchase orders yet"
                action={<Button icon={<Plus size={15} weight="bold" />} onClick={openForm}>New purchase order</Button>}
              />
            ) : (
              <EmptyState title="Nothing matches" text="Change the search or the status filter." action={<Button onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear filters</Button>} />
            )
          }
        />
      )}

      {/* New PO — walks in knowing the project: vendors, cost codes, budget, next number */}
      <FormModal
        open={showForm}
        onClose={closeForm}
        title="New purchase order"
        subtitle={`Saved as a draft · ${form.po_num || nextPoStr}`}
        onSubmit={async () => { await handleSave(); }}
        submitLabel="Create PO"
        busy={saving}
        error={formError}
      >
        <FormGrid cols={3}>
          <Field label="PO number" hint={`Next in sequence — ${pos.length} PO${pos.length === 1 ? '' : 's'} on this project so far.`}>
            <Input value={form.po_num || nextPoStr} onChange={e => setForm(p => ({ ...p, po_num: e.target.value }))} />
          </Field>
          <Field label="Vendor" required hint={vendorAuto ? 'Your last PO here used this vendor — type to change.' : vendors.length > 0 ? `${vendors.length} known vendor${vendors.length === 1 ? '' : 's'} on this project — start typing.` : 'New vendors are remembered for next time.'}>
            <Suggest className="k-input" value={form.vendor} onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))} options={vendors} />
          </Field>
          <Field label="Cost code" hint={costAuto ? 'Same cost code as your last PO on this project.' : costCodeOptions.length > 0 ? "From this project's budget — the PO total commits against that line." : 'No cost-coded budget yet — commit by CSI division.'}>
            {costCodeOptions.length > 0 ? (
              <Select value={form.cost_code} onChange={e => setForm(p => ({ ...p, cost_code: e.target.value }))} placeholder="— Select cost code —"
                options={costCodeOptions.map((c: any) => ({ value: String(c.costCode), label: c.costCode + ' — ' + (c.description || CSI_DIVISIONS[String(c.division)]?.name || '') }))} />
            ) : (
              <Select value={form.cost_code} onChange={e => setForm(p => ({ ...p, cost_code: e.target.value }))} placeholder="— CSI division —"
                options={Object.entries(CSI_DIVISIONS).map(([dv, d]) => ({ value: dv, label: dv + ' — ' + d.name }))} />
            )}
          </Field>
          <Field label="Delivery date" hint="Defaulted 30 days out — match the vendor's quoted lead time.">
            <DateInput value={form.delivery_date} onChange={e => setForm(p => ({ ...p, delivery_date: e.target.value }))} />
          </Field>
          <Field label="Tax %" hint={taxAuto ? 'Same rate as your last PO on this project.' : 'Applied to the line-item subtotal below.'}>
            <Input type="number" inputMode="decimal" value={form.tax_pct} onChange={e => setForm(p => ({ ...p, tax_pct: Number(e.target.value) }))} />
          </Field>
          <Field label="Shipping ($)" hint="Freight and delivery — leave 0 if included.">
            <Input type="number" inputMode="decimal" value={form.shipping} onChange={e => setForm(p => ({ ...p, shipping: Number(e.target.value) }))} />
          </Field>
          <Field label="Description" required span>
            <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </Field>
        </FormGrid>

        {selLine && (
          <div style={{ marginTop: 16 }}>
            <Callout
              tone={lineRemaining < 0 ? 'danger' : 'info'}
              icon={<Wallet size={17} />}
              title={`Cost code ${selLine.costCode || selLine.division}${selLine.description ? ` — ${selLine.description}` : ''}`}
              text={<>Budget {fmt(lineBudget)} · committed {fmt(lineCommitted)} · this PO {fmt(poTotal)} · <strong style={{ color: lineRemaining < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmt(lineRemaining)} remaining</strong> after it.</>}
            />
          </div>
        )}

        {/* Line items */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span className="k-label" style={{ margin: 0 }}>Line items</span>
            <Button size="sm" icon={<Plus size={13} weight="bold" />} onClick={addLineItem}>Add line</Button>
          </div>
          <div className="poLines">
            {form.line_items.map((li, idx) => (
              <div key={idx} className="poLine">
                <Input aria-label={`Line ${idx + 1} description`} placeholder="Description" value={li.description} onChange={e => updateLineItem(idx, 'description', e.target.value)} />
                <Input aria-label={`Line ${idx + 1} quantity`} type="number" inputMode="decimal" placeholder="Qty" value={li.quantity} onChange={e => updateLineItem(idx, 'quantity', Number(e.target.value))} />
                <Input aria-label={`Line ${idx + 1} unit price`} type="number" inputMode="decimal" placeholder="Unit price" value={li.unit_price} onChange={e => updateLineItem(idx, 'unit_price', Number(e.target.value))} />
                <Button variant="ghost" icon={<X size={14} weight="bold" />} aria-label="Remove line item" title="Remove line item" onClick={() => removeLineItem(idx)} disabled={form.line_items.length <= 1} />
              </div>
            ))}
          </div>
          <div className="poTotals" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
            <span>Subtotal</span><strong>{fmt(poSubtotal)}</strong>
            <span>Tax ({poTaxPct}%)</span><strong>{fmt(poTax)}</strong>
            <span>Shipping</span><strong>{fmt(poShipping)}</strong>
            <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>PO total</span><strong style={{ fontSize: 15 }}>{fmt(poTotal)}</strong>
          </div>
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
