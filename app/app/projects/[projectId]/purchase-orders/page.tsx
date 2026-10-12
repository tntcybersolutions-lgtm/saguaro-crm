'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { openPdf } from '@/components/PdfViewer';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import { Badge, Table, T } from '@/components/ui/shell';
import {
  PremiumSurface, ModuleHero, SectionCard, PremiumEmpty,
  StatStrip, FlowSteps, InsightRow, AutoChip,
  goldButtonStyle, ghostButtonStyle, secondaryButtonStyle
} from '@/components/ui/premium';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { Package, Plus, X, Wallet, Copy } from '@phosphor-icons/react';
import { getLastUsed, setLastUsed, postLearningEvent } from '@/lib/last-used';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { StatusPill } from '@/components/ui/Status';
import { localDay } from '@/lib/calendar-day';

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

const STATUS_BADGE: Record<string, 'muted' | 'blue' | 'green' | 'amber' | 'red'> = {
  draft: 'muted',
  sent: 'blue',
  received: 'green',
  closed: 'muted',
};

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

export default function PurchaseOrdersPage() {
  const { projectId } = useParams() as { projectId: string };
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

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
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  // Raw DB rows by id — duplicates copy the full server row (cost code, tax,
  // shipping, vendor contact), not just the display projection.
  const [rawById, setRawById] = useState<Record<string, Record<string, unknown>>>({});
  const [dupId, setDupId] = useState<string | null>(null);
  // Last-used memory (per user, per project): what was prefilled this open,
  // so AUTO chips show only while the value still matches the memory.
  const [lastPrefill, setLastPrefill] = useState<{ vendor?: string; cost_code?: string; tax_pct?: number }>({});
  // SmartCreate: the project-context snapshot — vendors, cost codes, budget, next PO number.
  const { ctx } = useProjectContext(projectId);
  const [autoDate, setAutoDate] = useState(false);
  // ListToolbar state — filters + sort persist per module via sag_flt_purchase-orders.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const fetchPos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/purchase-orders`);
      const json = await res.json();
      const rows: Record<string, unknown>[] = json.purchase_orders || [];
      setPos(rows.map(normalizePo));
      setRawById(Object.fromEntries(rows.filter(r => r.id).map(r => [String(r.id), r])));
    } catch {
      setPos([]);
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
  const fmt = (n: number) => '$' + ((n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }));
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

  function plus30() {
    const d = new Date(Date.now() + 30 * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function openForm(open: boolean) {
    setErrorMsg('');
    setShowForm(open);
    if (open) {
      // Last-used memory: prefill vendor / cost code / tax from the last PO
      // this user saved on this project — marked AUTO, one keystroke to change.
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
      setAutoDate(true);
    }
  }

  // AUTO chips live only while the field still equals the remembered value —
  // the moment the user edits, the chip drops and the accept is not counted.
  const vendorAuto = !!lastPrefill.vendor && form.vendor === lastPrefill.vendor;
  const costAuto = !!lastPrefill.cost_code && form.cost_code === lastPrefill.cost_code;
  const taxAuto = typeof lastPrefill.tax_pct === 'number' && Number(form.tax_pct) === lastPrefill.tax_pct;

  async function handleSave(): Promise<boolean> {
    if (!form.vendor || !form.description) { setErrorMsg('Vendor and description are required.'); return false; }
    setSaving(true);
    setErrorMsg('');
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
      setSuccessMsg('Purchase order created.');
      setTimeout(() => setSuccessMsg(''), 4000);
      guard.clearDraft();
      return true;
    } catch {
      setErrorMsg('Could not create the purchase order. Please try again.');
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
    setErrorMsg('');
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
      setSuccessMsg(`Duplicated ${po.po_num || 'PO'} as ${num} (draft) — new delivery date set 30 days out.`);
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch {
      setErrorMsg('Could not duplicate the purchase order. Please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setDupId(null);
    }
  }

  async function handleGeneratePdf(po: PurchaseOrder) {
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
      setErrorMsg('Could not generate the PO PDF. Please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
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
      setSuccessMsg(`PO status updated to ${status}.`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setErrorMsg('Could not update the PO status. Please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
      fetchPos();
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: T.surface2,
    border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 };
  const hint: React.CSSProperties = { fontSize: 12, color: 'var(--c-text-2)', marginTop: 5, lineHeight: 1.45 };

  // Toolbar-driven view of the PO log.
  const q = search.trim().toLowerCase();
  const filteredPos = pos
    .filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      return [p.po_num, p.vendor, p.description].some(v => String(v || '').toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (sortBy === 'amount') return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (sortBy === 'vendor') return String(a.vendor || '').localeCompare(String(b.vendor || ''));
      return String(b.issued_date || '').localeCompare(String(a.issued_date || ''));
    });

  // Compact button presets derived from the cinematic kit for inline/table actions.
  const smallGold: React.CSSProperties = { ...goldButtonStyle, padding: '7px 14px', fontSize: 13, borderRadius: 9 };
  const smallGhost: React.CSSProperties = { ...ghostButtonStyle, padding: '7px 14px', fontSize: 13, borderRadius: 9 };
  const smallDanger: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '7px 12px', borderRadius: 9, cursor: 'pointer',
    background: 'rgba(248,113,113,0.12)', color: 'var(--danger)', border: '1px solid rgba(248,113,113,0.35)',
    fontWeight: 800, fontSize: 13,
  };

  return (
    <PremiumSurface maxWidth={2200}>

      {/* Header */}
      <ModuleHero
        eyebrow="Procurement"
        eyebrowIcon={<Package size={13} weight="fill" color="var(--text-secondary)" />}
        title="Purchase"
        accent="Orders"
        subtitle="Vendor and supplier purchase orders"
        actions={
          <button
            className="pmBtn"
            onClick={() => openForm(!showForm)}
            style={showForm ? ghostButtonStyle : goldButtonStyle}
          >
            {showForm ? <><X size={15} weight="bold" /> Cancel</> : <><Plus size={15} weight="bold" /> New PO</>}
          </button>
        }
      />

      {/* One summary: PO value and status counts, then what is left uncommitted on the budget */}
      <StatStrip items={[
        {href: `/app/projects/${projectId}/purchase-orders`,  label: 'Total PO Value', value: `$${totalValue.toLocaleString()}` },
        {href: `/app/projects/${projectId}/purchase-orders`,  label: 'Draft', value: String(draftCount) },
        {href: `/app/projects/${projectId}/purchase-orders`,  label: 'Sent', value: String(sentCount), accent: sentCount > 0 ? 'var(--warning)' : undefined },
        {href: `/app/projects/${projectId}/purchase-orders`,  label: 'Received', value: String(receivedCount), accent: receivedCount > 0 ? 'var(--success)' : undefined },
        ...(ctx ? [
          {href: `/app/projects/${projectId}/purchase-orders`,  label: 'Uncommitted', value: fmt(bUncommitted), accent: bUncommitted < 0 ? T.red : T.green, sub: 'Original less committed' },
        ] : []),
      ]} />

      {successMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(74,222,128,0.4)`, borderRadius: 10, color: T.green, fontSize: 13 }}>{successMsg}</div>
      )}
      {errorMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: T.redDim, border: `1px solid rgba(248,113,113,0.4)`, borderRadius: 10, color: T.red, fontSize: 13 }}>{errorMsg}</div>
      )}

      {/* Create Form — walks in knowing the project: vendors, cost codes, budget, next number */}
      {showForm && (
        <div style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 16, alignItems: 'start' }}>
          <SectionCard title="New Purchase Order" icon={<Package size={17} weight="duotone" color="var(--text-secondary)" />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <div>
                <label style={lbl}>PO Number{!form.po_num && <AutoChip />}</label>
                <input value={form.po_num || nextPoStr} onChange={e => setForm(p => ({ ...p, po_num: e.target.value }))} style={inp} />
                <div style={hint}>Next in sequence — {pos.length} PO{pos.length === 1 ? '' : 's'} on this project so far.</div>
              </div>
              <div>
                <label style={lbl}>Vendor *{vendorAuto && <AutoChip />}</label>
                <Suggest value={form.vendor} onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))} style={inp} options={vendors} />
                <div style={hint}>{vendorAuto ? 'Your last PO here used this vendor — type to change.' : vendors.length > 0 ? `${vendors.length} known vendor${vendors.length === 1 ? '' : 's'} on this project — start typing.` : 'New vendors are remembered for next time.'}</div>
              </div>
              <div>
                <label style={lbl}>Cost Code{costAuto && <AutoChip />}</label>
                {costCodeOptions.length > 0 ? (
                  <select value={form.cost_code} onChange={e => setForm(p => ({ ...p, cost_code: e.target.value }))} style={inp}>
                    <option value="">— Select cost code —</option>
                    {costCodeOptions.map((c: any) => (
                      <option key={c.costCode} value={c.costCode}>{c.costCode + ' — ' + (c.description || CSI_DIVISIONS[String(c.division)]?.name || '')}</option>
                    ))}
                  </select>
                ) : (
                  <select value={form.cost_code} onChange={e => setForm(p => ({ ...p, cost_code: e.target.value }))} style={inp}>
                    <option value="">— CSI division —</option>
                    {Object.entries(CSI_DIVISIONS).map(([dv, d]) => (
                      <option key={dv} value={dv}>{dv + ' — ' + d.name}</option>
                    ))}
                  </select>
                )}
                <div style={hint}>{costCodeOptions.length > 0 ? "From this project's budget — the PO total commits against that line." : 'No cost-coded budget yet — commit by CSI division.'}</div>
              </div>
              <div>
                <label style={lbl}>Delivery Date{autoDate && <AutoChip />}</label>
                <SaguaroDatePicker value={form.delivery_date} onChange={v => setForm(p => ({ ...p, delivery_date: v }))} style={inp} />
                <div style={hint}>{"Defaulted 30 days out — match the vendor's quoted lead time."}</div>
              </div>
              <div>
                <label style={lbl}>Tax %{taxAuto && <AutoChip />}</label>
                <input type="number" value={form.tax_pct} onChange={e => setForm(p => ({ ...p, tax_pct: Number(e.target.value) }))} style={inp} />
                <div style={hint}>{taxAuto ? 'Same rate as your last PO on this project.' : 'Applied to the line-item subtotal below.'}</div>
              </div>
              <div>
                <label style={lbl}>Shipping ($)</label>
                <input type="number" value={form.shipping} onChange={e => setForm(p => ({ ...p, shipping: Number(e.target.value) }))} style={inp} />
                <div style={hint}>Freight and delivery — leave 0 if included.</div>
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <label style={lbl}>Description *</label>
                <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={inp} />
              </div>
              {selLine && (
                <div style={{ gridColumn: 'span 3', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
                  <Wallet size={16} weight="duotone" color="var(--text-secondary)" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Commits <b style={{ color: T.white }}>{fmt(poTotal)}</b> against <b style={{ color: 'var(--text-primary)' }}>{selLine.costCode || selLine.division}</b>{selLine.description ? ` (${selLine.description})` : ''} — budget <b style={{ color: T.white }}>{fmt(lineBudget)}</b>, committed <b style={{ color: T.white }}>{fmt(lineCommitted)}</b>, remaining <b style={{ color: lineRemaining < 0 ? T.red : T.green }}>{fmt(lineRemaining)}</b> after this PO.
                  </span>
                </div>
              )}
            </div>

            {/* Line Items */}
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.white }}>Line Items</span>
                <button className="pmBtn" onClick={addLineItem} style={smallGhost}><Plus size={13} weight="bold" /> Add Line</button>
              </div>
              {form.line_items.map((li, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, marginBottom: 8 }}>
                  <input placeholder="Description" value={li.description} onChange={e => updateLineItem(idx, 'description', e.target.value)} style={inp} />
                  <input type="number" placeholder="Qty" value={li.quantity} onChange={e => updateLineItem(idx, 'quantity', Number(e.target.value))} style={inp} />
                  <input type="number" placeholder="Unit Price" value={li.unit_price} onChange={e => updateLineItem(idx, 'unit_price', Number(e.target.value))} style={inp} />
                  <button
                    className="pmBtn"
                    onClick={() => removeLineItem(idx)}
                    disabled={form.line_items.length <= 1}
                    style={{ ...smallDanger, ...(form.line_items.length <= 1 ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
                    aria-label="Remove line item"
                  >
                    <X size={13} weight="bold" />
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <div style={{ minWidth: 250 }}>
                  <InsightRow label="Subtotal" value={fmt(poSubtotal)} />
                  <InsightRow label={`Tax (${poTaxPct}%)`} value={fmt(poTax)} />
                  <InsightRow label="Shipping" value={fmt(poShipping)} />
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '6px 0' }} />
                  <InsightRow label="PO Total" value={fmt(poTotal)} accent={T.gold} strong />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                className="pmBtn"
                onClick={handleSave}
                disabled={saving}
                style={{ ...goldButtonStyle, ...(saving ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }}
              >
                {saving ? 'Saving…' : 'Create PO'}
              </button>
              <button className="pmBtn" onClick={() => { setShowForm(false); setErrorMsg(''); }} style={ghostButtonStyle}>Cancel</button>
            </div>
          </SectionCard>

          {/* Context rail — what creating this PO sets in motion */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selLine && (
              <SectionCard flat title={`Cost Code ${selLine.costCode || selLine.division}`} icon={<Wallet size={17} weight="duotone" color="var(--text-secondary)" />}>
                <InsightRow label="Line Budget" value={fmt(lineBudget)} />
                <InsightRow label="Committed to Date" value={fmt(lineCommitted)} />
                <InsightRow label="This PO" value={fmt(poTotal)} accent={T.gold} />
                <InsightRow label="Remaining After" value={fmt(lineRemaining)} accent={lineRemaining < 0 ? T.red : T.green} strong />
              </SectionCard>
            )}
            <SectionCard flat title="After You Create" icon={<Package size={17} weight="duotone" color="var(--text-secondary)" />}>
              <FlowSteps title="" steps={[
                { title: 'Draft PO on the Log', desc: `Saved as ${form.po_num || nextPoStr} in the procurement log for this project.` },
                { title: 'Budget Committed Rolls Up Server-Side', desc: form.cost_code ? `${fmt(poTotal)} commits against ${form.cost_code} the moment you save.` : 'Pick a cost code and the total commits against that budget line automatically.' },
                { title: 'Send to the Vendor', desc: 'One click generates the PO PDF and flips the status to Sent.' },
                { title: 'Received Closes the Commitment', desc: 'Mark it Received on delivery — vendor bills then reconcile committed cost to actual.' },
              ]} />
            </SectionCard>
          </div>
        </div>
      )}

      {/* Table */}
      <ListToolbar
        module="purchase-orders"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search purchase orders…"
        filters={[{ key: 'status', label: 'Status', value: statusFilter, onChange: setStatusFilter, allLabel: 'All Statuses', options: [
          { value: 'draft', label: 'Draft' },
          { value: 'sent', label: 'Sent' },
          { value: 'received', label: 'Received' },
          { value: 'closed', label: 'Closed' },
        ] }]}
        sort={sortBy}
        onSort={setSortBy}
        sortOptions={[
          { value: 'newest', label: 'Newest First' },
          { value: 'amount', label: 'Amount (High First)' },
          { value: 'vendor', label: 'Vendor A–Z' },
        ]}
        count={{ shown: filteredPos.length, total: pos.length }}
        style={{ marginBottom: 16 }}
      />

      <SectionCard title="All Purchase Orders" icon={<Package size={17} weight="duotone" color="var(--text-secondary)" />} flush>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-2)', fontSize: 13 }}>Loading purchase orders…</div>
        ) : pos.length === 0 ? (
          <PremiumEmpty
            icon={<Package size={30} weight="duotone" color="var(--text-secondary)" />}
            title="No purchase orders yet"
            description="Create your first purchase order to track vendor and supplier commitments for this project."
            action={
              <button className="pmBtn" onClick={() => openForm(true)} style={secondaryButtonStyle}>
                <Plus size={15} weight="bold" /> New Purchase Order
              </button>
            }
          />
        ) : (
          <Table
            headers={['PO #', 'Vendor', 'Description', 'Amount', 'Status', 'Date', 'Actions']}
            rows={filteredPos.map(p => [
              <span key="n" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{p.po_num}</span>,
              p.vendor,
              <span key="d" style={{ color: T.muted }}>{p.description}</span>,
              <span key="a" style={{ fontWeight: 700 }}>${(p.amount || 0).toLocaleString()}</span>,
              <StatusPill key="s" module="purchase_orders" status={p.status} size="sm" />,
              <span key="dt" style={{ color: T.muted }}>{p.issued_date}</span>,
              <div key="act" style={{ display: 'flex', gap: 6 }}>
                <button className="pmBtn" onClick={() => handleGeneratePdf(p)} style={smallGhost}>PDF</button>
                <button
                  className="pmBtn"
                  onClick={() => handleDuplicate(p)}
                  disabled={dupId === p.id}
                  title="Create a new draft PO with the same vendor, lines, and cost code — number and dates regenerate"
                  style={{ ...smallGhost, ...(dupId === p.id ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }}
                >
                  <Copy size={13} weight="bold" /> {dupId === p.id ? 'Duplicating…' : 'Duplicate'}
                </button>
                {p.status === 'draft' && (
                  <button className="pmBtn" onClick={() => handleStatusChange(p.id, 'sent')} style={smallGold}>Send</button>
                )}
                {p.status === 'sent' && (
                  <button className="pmBtn" onClick={() => handleStatusChange(p.id, 'received')} style={smallGold}>Received</button>
                )}
                {p.status === 'received' && (
                  <button className="pmBtn" onClick={() => handleStatusChange(p.id, 'closed')} style={smallGhost}>Close</button>
                )}
              </div>,
            ])}
          />
        )}
      </SectionCard>
      <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
