'use client';
/**
 * Saguaro Field — Purchase Orders
 * Full PO lifecycle: create, issue, receive, close. Line items, filtering,
 * receiving workflow, vendor contact, PDF export. Offline queue support.
 */
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

const STATUS_COLORS: Record<string, string> = {
  draft: DIM, issued: BLUE, received: GREEN, partial: AMBER, closed: '#6B7280', void: RED,
};
const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', issued: 'Issued', received: 'Received', partial: 'Partial', closed: 'Closed', void: 'Void',
};
const STATUS_ORDER = ['draft', 'issued', 'received', 'partial', 'closed', 'void'];

interface LineItem {
  id: string;
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  total: number;
  received_qty: number;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_name: string;
  vendor_email: string;
  amount: number;
  status: string;
  issued_date: string;
  required_date: string;
  description: string;
  line_items: LineItem[];
  file_url: string;
  created_at?: string;
}

type View = 'list' | 'create' | 'detail' | 'receive';

function fmt(n: number): string {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyLine(): LineItem {
  return { id: uid(), description: '', qty: 1, unit: 'EA', total: 0, unit_price: 0, received_qty: 0 };
}

/* ─── Main Inner Component ─── */
function PurchaseOrdersInner() {
  const projectId = useSearchParams().get('projectId') || '';

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState('');

  /* Filters */
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterAmtMin, setFilterAmtMin] = useState('');
  const [filterAmtMax, setFilterAmtMax] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'vendor' | 'status'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  /* Create form */
  const [formPoNumber, setFormPoNumber] = useState('');
  const [formVendor, setFormVendor] = useState('');
  const [formVendorEmail, setFormVendorEmail] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIssuedDate, setFormIssuedDate] = useState('');
  const [formRequiredDate, setFormRequiredDate] = useState('');
  const [formLines, setFormLines] = useState<LineItem[]>([emptyLine()]);
  const [formFileUrl, setFormFileUrl] = useState('');
  const [saving, setSaving] = useState(false);

  /* Receiving */
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});

  /* ── Fetch ── */
  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/purchase-orders`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setOrders(Array.isArray(data) ? data : data.data ?? []);
      } catch {
        setError('Failed to load purchase orders. Working offline.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  /* ── Filtered & Sorted ── */
  const vendors = useMemo(() => {
    const s = new Set(orders.map(o => o.vendor_name).filter(Boolean));
    return Array.from(s).sort();
  }, [orders]);

  const filtered = useMemo(() => {
    let list = [...orders];
    if (filterStatus !== 'all') list = list.filter(o => o.status === filterStatus);
    if (filterVendor) list = list.filter(o => o.vendor_name.toLowerCase().includes(filterVendor.toLowerCase()));
    if (filterDateFrom) list = list.filter(o => (o.issued_date || '') >= filterDateFrom);
    if (filterDateTo) list = list.filter(o => (o.issued_date || '') <= filterDateTo);
    if (filterAmtMin) list = list.filter(o => o.amount >= parseFloat(filterAmtMin));
    if (filterAmtMax) list = list.filter(o => o.amount <= parseFloat(filterAmtMax));

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'date': cmp = (a.issued_date || '').localeCompare(b.issued_date || ''); break;
        case 'amount': cmp = a.amount - b.amount; break;
        case 'vendor': cmp = (a.vendor_name || '').localeCompare(b.vendor_name || ''); break;
        case 'status': cmp = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [orders, filterStatus, filterVendor, filterDateFrom, filterDateTo, filterAmtMin, filterAmtMax, sortBy, sortDir]);

  /* ── Summary stats ── */
  const summary = useMemo(() => {
    const totalCommitted = orders.reduce((s, o) => s + (o.status !== 'void' ? o.amount : 0), 0);
    const totalReceived = orders
      .filter(o => o.status === 'received' || o.status === 'closed')
      .reduce((s, o) => s + o.amount, 0);
    const openCount = orders.filter(o => ['draft', 'issued', 'partial'].includes(o.status)).length;
    return { totalCommitted, totalReceived, openCount };
  }, [orders]);

  /* ── Helpers ── */
  async function persist(method: string, body: unknown) {
    const url = `/api/projects/${projectId}/purchase-orders`;
    const payload = JSON.stringify(body);
    try {
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: payload,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      await enqueue({ url, method, body: payload, contentType: 'application/json', isFormData: false });
      return null;
    }
  }

  function resetForm() {
    setFormPoNumber(''); setFormVendor(''); setFormVendorEmail('');
    setFormDescription(''); setFormIssuedDate(''); setFormRequiredDate('');
    setFormLines([emptyLine()]); setFormFileUrl('');
  }

  function updateLine(idx: number, field: keyof LineItem, value: string | number) {
    setFormLines(prev => {
      const next = [...prev];
      const line = { ...next[idx], [field]: value };
      if (field === 'qty' || field === 'unit_price') {
        line.total = Number(line.qty) * Number(line.unit_price);
      }
      next[idx] = line;
      return next;
    });
  }

  function removeLine(idx: number) {
    setFormLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  }

  function addLine() {
    setFormLines(prev => [...prev, emptyLine()]);
  }

  const formTotal = useMemo(() => formLines.reduce((s, l) => s + l.total, 0), [formLines]);

  /* ── Create PO ── */
  async function handleCreate() {
    if (!formPoNumber.trim() || !formVendor.trim()) { setError('PO number and vendor are required.'); return; }
    if (formLines.some(l => !l.description.trim())) { setError('All line items need a description.'); return; }
    setSaving(true); setError('');
    const po: Omit<PurchaseOrder, 'id' | 'created_at'> = {
      po_number: formPoNumber.trim(),
      vendor_name: formVendor.trim(),
      vendor_email: formVendorEmail.trim(),
      amount: formTotal,
      status: 'draft',
      issued_date: formIssuedDate,
      required_date: formRequiredDate,
      description: formDescription.trim(),
      line_items: formLines.map(l => ({ ...l, received_qty: 0 })),
      file_url: formFileUrl.trim(),
    };
    const result = await persist('POST', po);
    if (result) {
      setOrders(prev => [{ ...po, id: result.id ?? uid(), created_at: new Date().toISOString() } as PurchaseOrder, ...prev]);
    } else {
      setOrders(prev => [{ ...po, id: uid(), created_at: new Date().toISOString() } as PurchaseOrder, ...prev]);
    }
    resetForm();
    setSaving(false);
    setView('list');
  }

  /* ── Status transitions ── */
  async function advanceStatus(po: PurchaseOrder, newStatus: string) {
    const updated = { ...po, status: newStatus };
    if (newStatus === 'issued' && !po.issued_date) {
      updated.issued_date = new Date().toISOString().slice(0, 10);
    }
    await persist('POST', { ...updated, _action: 'update' });
    setOrders(prev => prev.map(o => o.id === po.id ? updated : o));
    setSelected(updated);
  }

  /* ── Receiving ── */
  function initReceive(po: PurchaseOrder) {
    const q: Record<string, number> = {};
    po.line_items.forEach(l => { q[l.id] = 0; });
    setReceiveQtys(q);
    setSelected(po);
    setView('receive');
  }

  async function submitReceive() {
    if (!selected) return;
    const updatedLines = selected.line_items.map(l => ({
      ...l,
      received_qty: l.received_qty + (receiveQtys[l.id] || 0),
    }));
    const allReceived = updatedLines.every(l => l.received_qty >= l.qty);
    const someReceived = updatedLines.some(l => l.received_qty > 0);
    let newStatus = selected.status;
    if (allReceived) newStatus = 'received';
    else if (someReceived) newStatus = 'partial';
    const updated = { ...selected, line_items: updatedLines, status: newStatus };
    await persist('POST', { ...updated, _action: 'update' });
    setOrders(prev => prev.map(o => o.id === selected.id ? updated : o));
    setSelected(updated);
    setView('detail');
  }

  /* ── PDF export ── */
  function handlePrint() { window.print(); }

  /* ── Shared styles ── */
  const btnBase: React.CSSProperties = {
    padding: '10px 18px', border: 'none', borderRadius: 8, fontSize: 14,
    fontWeight: 600, cursor: 'pointer', transition: 'opacity .15s',
  };
  const btnGold: React.CSSProperties = { ...btnBase, background: GOLD, color: '#000' };
  const btnOutline: React.CSSProperties = {
    ...btnBase, background: 'transparent', border: `1px solid ${BORDER}`, color: TEXT,
  };
  const btnDanger: React.CSSProperties = { ...btnBase, background: RED, color: '#fff' };
  const btnGreen: React.CSSProperties = { ...btnBase, background: GREEN, color: '#fff' };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', background: RAISED, border: `1px solid ${BORDER}`,
    borderRadius: 8, color: TEXT, fontSize: 14, boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 4, color: DIM, fontSize: 12, fontWeight: 600 };
  const cardStyle: React.CSSProperties = {
    background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 12,
  };

  function Badge({ status }: { status: string }) {
    return (
      <span style={{
        display: 'inline-block', padding: '3px 10px', borderRadius: 12,
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
        background: `${STATUS_COLORS[status] || DIM}22`, color: STATUS_COLORS[status] || DIM,
        border: `1px solid ${STATUS_COLORS[status] || DIM}44`,
      }}>
        {STATUS_LABELS[status] || status}
      </span>
    );
  }

  /* ──────────────── RENDER ──────────────── */

  if (!projectId) {
    return (
      <div style={{ padding: 24, color: TEXT, fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: DIM }}>No project selected. Append <code>?projectId=...</code> to the URL.</p>
      </div>
    );
  }

  /* ── LIST VIEW ── */
  function renderList() {
    return (
      <div>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: GOLD }}>Purchase Orders</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnOutline} onClick={() => setShowFilters(f => !f)}>
              {showFilters ? 'Hide Filters' : 'Filters'}
            </button>
            <button style={btnOutline} onClick={handlePrint}>PDF</button>
            <button style={btnGold} onClick={() => { resetForm(); setView('create'); }}>+ New PO</button>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div style={cardStyle}>
            <div style={{ color: DIM, fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Total Committed</div>
            <div style={{ color: GOLD, fontSize: 22, fontWeight: 700 }}>{fmt(summary.totalCommitted)}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: DIM, fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Total Received</div>
            <div style={{ color: GREEN, fontSize: 22, fontWeight: 700 }}>{fmt(summary.totalReceived)}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: DIM, fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Open POs</div>
            <div style={{ color: AMBER, fontSize: 22, fontWeight: 700 }}>{summary.openCount}</div>
          </div>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">All Statuses</option>
                {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Vendor</label>
              <input style={inputStyle} placeholder="Search vendor..." value={filterVendor} onChange={e => setFilterVendor(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Date From</label>
              <input style={inputStyle} type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Date To</label>
              <input style={inputStyle} type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Min Amount</label>
              <input style={inputStyle} type="number" placeholder="0" value={filterAmtMin} onChange={e => setFilterAmtMin(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Max Amount</label>
              <input style={inputStyle} type="number" placeholder="999999" value={filterAmtMax} onChange={e => setFilterAmtMax(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Sort By</label>
              <select style={inputStyle} value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
                <option value="date">Date</option>
                <option value="amount">Amount</option>
                <option value="vendor">Vendor</option>
                <option value="status">Status</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Direction</label>
              <select style={inputStyle} value={sortDir} onChange={e => setSortDir(e.target.value as 'asc' | 'desc')}>
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button style={{ ...btnOutline, width: '100%' }} onClick={() => {
                setFilterStatus('all'); setFilterVendor(''); setFilterDateFrom('');
                setFilterDateTo(''); setFilterAmtMin(''); setFilterAmtMax('');
                setSortBy('date'); setSortDir('desc');
              }}>Clear Filters</button>
            </div>
          </div>
        )}

        {/* Loading / Error */}
        {loading && <p style={{ color: DIM, textAlign: 'center', padding: 40 }}>Loading purchase orders...</p>}
        {error && <p style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{error}</p>}

        {/* PO cards */}
        {!loading && filtered.length === 0 && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
            <p style={{ color: DIM, margin: 0 }}>No purchase orders found.</p>
          </div>
        )}
        {filtered.map(po => (
          <div
            key={po.id}
            style={{ ...cardStyle, cursor: 'pointer', transition: 'border-color .15s' }}
            onClick={() => { setSelected(po); setView('detail'); }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 700, color: TEXT, fontSize: 15 }}>PO #{po.po_number}</span>
                <Badge status={po.status} />
              </div>
              <span style={{ fontWeight: 700, color: GOLD, fontSize: 16 }}>{fmt(po.amount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: DIM, fontSize: 13 }}>{po.vendor_name}</span>
              <div style={{ display: 'flex', gap: 12, color: DIM, fontSize: 12 }}>
                {po.issued_date && <span>Issued: {po.issued_date}</span>}
                {po.required_date && <span>Required: {po.required_date}</span>}
              </div>
            </div>
            {po.description && (
              <p style={{ color: DIM, fontSize: 12, margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {po.description}
              </p>
            )}
            <div style={{ marginTop: 6, fontSize: 12, color: DIM }}>
              {po.line_items?.length ?? 0} line item{(po.line_items?.length ?? 0) !== 1 ? 's' : ''}
            </div>
          </div>
        ))}
      </div>
    );
  }

  /* ── CREATE VIEW ── */
  function renderCreate() {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button style={btnOutline} onClick={() => setView('list')}>Back</button>
          <h1 style={{ margin: 0, fontSize: 20, color: GOLD }}>New Purchase Order</h1>
        </div>
        {error && <p style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={labelStyle}>PO Number *</label>
            <input style={inputStyle} value={formPoNumber} onChange={e => setFormPoNumber(e.target.value)} placeholder="e.g. PO-001" />
          </div>
          <div>
            <label style={labelStyle}>Vendor Name *</label>
            <input style={inputStyle} value={formVendor} onChange={e => setFormVendor(e.target.value)} placeholder="Vendor name" />
          </div>
          <div>
            <label style={labelStyle}>Vendor Email</label>
            <input style={inputStyle} type="email" value={formVendorEmail} onChange={e => setFormVendorEmail(e.target.value)} placeholder="vendor@example.com" />
          </div>
          <div>
            <label style={labelStyle}>File / Attachment URL</label>
            <input style={inputStyle} value={formFileUrl} onChange={e => setFormFileUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label style={labelStyle}>Issued Date</label>
            <input style={inputStyle} type="date" value={formIssuedDate} onChange={e => setFormIssuedDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Required Date</label>
            <input style={inputStyle} type="date" value={formRequiredDate} onChange={e => setFormRequiredDate(e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Description</label>
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
              value={formDescription}
              onChange={e => setFormDescription(e.target.value)}
              placeholder="PO description / notes"
            />
          </div>
        </div>

        {/* Line Items */}
        <div style={{ ...cardStyle, marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: TEXT, fontSize: 15 }}>Line Items</h3>
            <button style={{ ...btnOutline, padding: '6px 14px', fontSize: 13 }} onClick={addLine}>+ Add Line</button>
          </div>

          {/* Header row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 70px 70px 100px 100px 40px',
            gap: 8, marginBottom: 6, padding: '0 4px',
          }}>
            <span style={{ color: DIM, fontSize: 11, fontWeight: 600 }}>DESCRIPTION</span>
            <span style={{ color: DIM, fontSize: 11, fontWeight: 600 }}>QTY</span>
            <span style={{ color: DIM, fontSize: 11, fontWeight: 600 }}>UNIT</span>
            <span style={{ color: DIM, fontSize: 11, fontWeight: 600 }}>UNIT PRICE</span>
            <span style={{ color: DIM, fontSize: 11, fontWeight: 600 }}>TOTAL</span>
            <span />
          </div>

          {formLines.map((line, idx) => (
            <div key={line.id} style={{
              display: 'grid', gridTemplateColumns: '2fr 70px 70px 100px 100px 40px',
              gap: 8, marginBottom: 8,
            }}>
              <input
                style={inputStyle}
                placeholder="Item description"
                value={line.description}
                onChange={e => updateLine(idx, 'description', e.target.value)}
              />
              <input
                style={inputStyle}
                type="number"
                min={0}
                value={line.qty}
                onChange={e => updateLine(idx, 'qty', parseFloat(e.target.value) || 0)}
              />
              <input
                style={inputStyle}
                value={line.unit}
                onChange={e => updateLine(idx, 'unit', e.target.value)}
                placeholder="EA"
              />
              <input
                style={inputStyle}
                type="number"
                min={0}
                step={0.01}
                value={line.unit_price}
                onChange={e => updateLine(idx, 'unit_price', parseFloat(e.target.value) || 0)}
              />
              <div style={{
                ...inputStyle, display: 'flex', alignItems: 'center',
                background: 'transparent', border: 'none', color: GOLD, fontWeight: 600,
              }}>
                {fmt(line.total)}
              </div>
              <button
                style={{ ...btnBase, background: 'transparent', color: RED, padding: 4, fontSize: 18, border: 'none' }}
                onClick={() => removeLine(idx)}
                title="Remove line"
              >
                x
              </button>
            </div>
          ))}

          <div style={{ textAlign: 'right', paddingTop: 10, borderTop: `1px solid ${BORDER}`, marginTop: 8 }}>
            <span style={{ color: DIM, fontSize: 13, marginRight: 10 }}>PO Total:</span>
            <span style={{ color: GOLD, fontSize: 20, fontWeight: 700 }}>{fmt(formTotal)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button style={btnGold} onClick={handleCreate} disabled={saving}>
            {saving ? 'Saving...' : 'Create Purchase Order'}
          </button>
          <button style={btnOutline} onClick={() => setView('list')}>Cancel</button>
        </div>
      </div>
    );
  }

  /* ── DETAIL VIEW ── */
  function renderDetail() {
    if (!selected) return null;
    const po = selected;
    const lineTotal = po.line_items?.reduce((s, l) => s + l.total, 0) ?? 0;
    const receivedTotal = po.line_items?.reduce((s, l) => s + (l.received_qty * l.unit_price), 0) ?? 0;

    const nextActions: { label: string; status: string; style: React.CSSProperties }[] = [];
    if (po.status === 'draft') nextActions.push({ label: 'Issue PO', status: 'issued', style: btnGold });
    if (po.status === 'issued' || po.status === 'partial') nextActions.push({ label: 'Receive Items', status: '_receive', style: btnGreen });
    if (po.status === 'received') nextActions.push({ label: 'Close PO', status: 'closed', style: { ...btnBase, background: '#6B7280', color: '#fff' } });
    if (po.status !== 'void' && po.status !== 'closed') nextActions.push({ label: 'Void PO', status: 'void', style: btnDanger });

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button style={btnOutline} onClick={() => setView('list')}>Back</button>
          <h1 style={{ margin: 0, fontSize: 20, color: GOLD }}>PO #{po.po_number}</h1>
          <Badge status={po.status} />
          <div style={{ flex: 1 }} />
          <button style={btnOutline} onClick={handlePrint}>Print / PDF</button>
        </div>

        {/* Info grid */}
        <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <span style={labelStyle}>Vendor</span>
            <span style={{ color: TEXT, fontSize: 14 }}>{po.vendor_name}</span>
          </div>
          <div>
            <span style={labelStyle}>Vendor Email</span>
            {po.vendor_email ? (
              <a
                href={`mailto:${po.vendor_email}?subject=PO ${po.po_number}`}
                style={{ color: BLUE, fontSize: 14, textDecoration: 'underline' }}
              >
                {po.vendor_email}
              </a>
            ) : (
              <span style={{ color: DIM, fontSize: 14 }}>N/A</span>
            )}
          </div>
          <div>
            <span style={labelStyle}>Issued Date</span>
            <span style={{ color: TEXT, fontSize: 14 }}>{po.issued_date || 'Not issued'}</span>
          </div>
          <div>
            <span style={labelStyle}>Required Date</span>
            <span style={{ color: TEXT, fontSize: 14 }}>{po.required_date || 'N/A'}</span>
          </div>
          <div>
            <span style={labelStyle}>Amount</span>
            <span style={{ color: GOLD, fontSize: 18, fontWeight: 700 }}>{fmt(po.amount)}</span>
          </div>
          <div>
            <span style={labelStyle}>Received Value</span>
            <span style={{ color: GREEN, fontSize: 18, fontWeight: 700 }}>{fmt(receivedTotal)}</span>
          </div>
          {po.description && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Description</span>
              <p style={{ color: TEXT, fontSize: 14, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{po.description}</p>
            </div>
          )}
          {po.file_url && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Attachment</span>
              <a href={po.file_url} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontSize: 14, textDecoration: 'underline' }}>
                View File
              </a>
            </div>
          )}
        </div>

        {/* Line items table */}
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 12px', color: TEXT, fontSize: 15 }}>Line Items</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Description', 'Qty', 'Unit', 'Unit Price', 'Total', 'Received'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600,
                      color: DIM, borderBottom: `1px solid ${BORDER}`, textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(po.line_items || []).map((li, idx) => {
                  const pct = li.qty > 0 ? Math.round((li.received_qty / li.qty) * 100) : 0;
                  const rowColor = li.received_qty >= li.qty ? `${GREEN}11` : li.received_qty > 0 ? `${AMBER}11` : 'transparent';
                  return (
                    <tr key={li.id || idx} style={{ background: rowColor }}>
                      <td style={{ padding: '8px 10px', color: TEXT, fontSize: 13, borderBottom: `1px solid ${BORDER}22` }}>{li.description}</td>
                      <td style={{ padding: '8px 10px', color: TEXT, fontSize: 13, borderBottom: `1px solid ${BORDER}22` }}>{li.qty}</td>
                      <td style={{ padding: '8px 10px', color: DIM, fontSize: 13, borderBottom: `1px solid ${BORDER}22` }}>{li.unit}</td>
                      <td style={{ padding: '8px 10px', color: TEXT, fontSize: 13, borderBottom: `1px solid ${BORDER}22` }}>{fmt(li.unit_price)}</td>
                      <td style={{ padding: '8px 10px', color: GOLD, fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${BORDER}22` }}>{fmt(li.total)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 13, borderBottom: `1px solid ${BORDER}22` }}>
                        <span style={{ color: pct >= 100 ? GREEN : pct > 0 ? AMBER : DIM }}>
                          {li.received_qty} / {li.qty} ({pct}%)
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ padding: '10px', textAlign: 'right', color: DIM, fontSize: 13, fontWeight: 600, borderTop: `1px solid ${BORDER}` }}>
                    Total:
                  </td>
                  <td style={{ padding: '10px', color: GOLD, fontSize: 15, fontWeight: 700, borderTop: `1px solid ${BORDER}` }}>
                    {fmt(lineTotal)}
                  </td>
                  <td style={{ borderTop: `1px solid ${BORDER}` }} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Actions */}
        {nextActions.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            {nextActions.map(a => (
              <button
                key={a.label}
                style={a.style}
                onClick={() => {
                  if (a.status === '_receive') {
                    initReceive(po);
                  } else {
                    advanceStatus(po, a.status);
                  }
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── RECEIVE VIEW ── */
  function renderReceive() {
    if (!selected) return null;
    const po = selected;

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button style={btnOutline} onClick={() => setView('detail')}>Back</button>
          <h1 style={{ margin: 0, fontSize: 20, color: GOLD }}>Receive Items — PO #{po.po_number}</h1>
        </div>

        <div style={cardStyle}>
          <p style={{ color: DIM, fontSize: 13, margin: '0 0 14px' }}>
            Enter quantities received for each line item. Previously received quantities are shown.
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Description', 'Ordered', 'Previously Received', 'Remaining', 'Receive Now'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600,
                      color: DIM, borderBottom: `1px solid ${BORDER}`, textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(po.line_items || []).map((li, idx) => {
                  const remaining = li.qty - li.received_qty;
                  return (
                    <tr key={li.id || idx}>
                      <td style={{ padding: '8px 10px', color: TEXT, fontSize: 13, borderBottom: `1px solid ${BORDER}22` }}>{li.description}</td>
                      <td style={{ padding: '8px 10px', color: TEXT, fontSize: 13, borderBottom: `1px solid ${BORDER}22` }}>{li.qty} {li.unit}</td>
                      <td style={{ padding: '8px 10px', color: AMBER, fontSize: 13, borderBottom: `1px solid ${BORDER}22` }}>{li.received_qty}</td>
                      <td style={{ padding: '8px 10px', color: remaining > 0 ? RED : GREEN, fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${BORDER}22` }}>
                        {remaining}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${BORDER}22` }}>
                        <input
                          type="number"
                          min={0}
                          max={remaining}
                          style={{ ...inputStyle, width: 80 }}
                          value={receiveQtys[li.id] ?? 0}
                          onChange={e => {
                            const val = Math.min(Math.max(0, parseInt(e.target.value) || 0), remaining);
                            setReceiveQtys(prev => ({ ...prev, [li.id]: val }));
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              style={btnGreen}
              onClick={submitReceive}
              disabled={Object.values(receiveQtys).every(v => v === 0)}
            >
              Confirm Receipt
            </button>
            <button
              style={btnOutline}
              onClick={() => {
                const full: Record<string, number> = {};
                po.line_items.forEach(l => { full[l.id] = l.qty - l.received_qty; });
                setReceiveQtys(full);
              }}
            >
              Receive All Remaining
            </button>
            <button style={btnOutline} onClick={() => setView('detail')}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Router ── */
  return (
    <div style={{
      minHeight: '100vh', background: '#0A1628', color: TEXT,
      fontFamily: 'system-ui, -apple-system, sans-serif', padding: '16px 16px 80px',
      maxWidth: 960, margin: '0 auto', boxSizing: 'border-box',
    }}>
      {view === 'list' && renderList()}
      {view === 'create' && renderCreate()}
      {view === 'detail' && renderDetail()}
      {view === 'receive' && renderReceive()}
    </div>
  );
}

/* ─── Default export with Suspense ─── */
export default function PurchaseOrdersPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh', background: '#0A1628', display: 'flex',
        alignItems: 'center', justifyContent: 'center', color: '#8BAAC8',
        fontFamily: 'system-ui, sans-serif',
      }}>
        Loading purchase orders...
      </div>
    }>
      <PurchaseOrdersInner />
    </Suspense>
  );
}
