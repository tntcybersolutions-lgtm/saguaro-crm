'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import { BottomSheet } from '@/components/ui/BottomSheet';

/* ── Color tokens ─────────────────────────────────────────────── */
const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

/* ── Types ────────────────────────────────────────────────────── */
type InvoiceStatus = 'draft' | 'submitted' | 'approved' | 'paid' | 'disputed' | 'void';

interface Invoice {
  id: string;
  invoice_number: string;
  vendor_name: string;
  amount: number;
  status: InvoiceStatus;
  due_date: string;
  paid_date: string | null;
  description: string;
  file_url: string | null;
  created_at: string;
}

type SortField = 'due_date' | 'amount' | 'vendor_name' | 'status';
type SortDir = 'asc' | 'desc';
type View = 'list' | 'detail' | 'create' | 'aging';

/* ── Helpers ──────────────────────────────────────────────────── */
const fmt = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const daysBetween = (a: string, b: string) =>
  Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

const today = () => new Date().toISOString().slice(0, 10);

const statusColor: Record<InvoiceStatus, string> = {
  draft: DIM,
  submitted: BLUE,
  approved: AMBER,
  paid: GREEN,
  disputed: RED,
  void: '#6B7280',
};

const statusLabel: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  paid: 'Paid',
  disputed: 'Disputed',
  void: 'Void',
};

/* ── Shared styles ────────────────────────────────────────────── */
const btnBase: React.CSSProperties = {
  padding: '10px 18px',
  border: 'none',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  transition: 'opacity .15s',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: '#0A1628',
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  color: TEXT,
  fontSize: 14,
  boxSizing: 'border-box',
};

const cardStyle: React.CSSProperties = {
  background: RAISED,
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: 16,
  marginBottom: 12,
};

/* ── Main component ───────────────────────────────────────────── */
function InvoicesPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || '';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* Filters */
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | ''>('');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterAmountMin, setFilterAmountMin] = useState('');
  const [filterAmountMax, setFilterAmountMax] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  /* Sort */
  const [sortField, setSortField] = useState<SortField>('due_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  /* Create form */
  const [formNumber, setFormNumber] = useState('');
  const [formVendor, setFormVendor] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDue, setFormDue] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formFileUrl, setFormFileUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /* Money action BottomSheet state */
  const [actionSheet, setActionSheet] = useState<{ invoiceId: string; label: string; amount: number } | null>(null);
  const [sheetMode, setSheetMode] = useState<'menu' | 'edit' | 'adjust'>('menu');
  const [editVal, setEditVal] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [fieldToast, setFieldToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function showFieldToast(msg: string) { setFieldToast(msg); setTimeout(() => setFieldToast(null), 2500); }

  function openActionSheet(invoiceId: string, label: string, amount: number) {
    setActionSheet({ invoiceId, label, amount });
    setSheetMode('menu');
    setEditVal(String(amount));
  }

  function closeActionSheet() { setActionSheet(null); setSheetMode('menu'); }

  async function handleFieldSaveEdit() {
    if (!actionSheet) return;
    const amount = parseFloat(editVal);
    if (isNaN(amount) || amount < 0) return;
    const inv = invoices.find(i => i.id === actionSheet.invoiceId);
    if (!inv) return;
    const url = `/api/projects/${projectId}/invoices`;
    const body = JSON.stringify({ ...inv, amount });
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!r.ok) throw new Error();
    } catch {
      if (typeof window !== 'undefined') {
        try { await enqueue({ url, method: 'POST', body, contentType: 'application/json', isFormData: false }); } catch { /* */ }
      }
    }
    setInvoices(prev => prev.map(i => i.id === actionSheet.invoiceId ? { ...i, amount } : i));
    showFieldToast('Amount updated');
    closeActionSheet();
  }

  async function handleFieldAdjust(pct: number) {
    if (!actionSheet) return;
    const newAmt = Math.round(actionSheet.amount * (1 + pct / 100) * 100) / 100;
    const inv = invoices.find(i => i.id === actionSheet.invoiceId);
    if (!inv) return;
    const url = `/api/projects/${projectId}/invoices`;
    const body = JSON.stringify({ ...inv, amount: newAmt });
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!r.ok) throw new Error();
    } catch {
      if (typeof window !== 'undefined') {
        try { await enqueue({ url, method: 'POST', body, contentType: 'application/json', isFormData: false }); } catch { /* */ }
      }
    }
    setInvoices(prev => prev.map(i => i.id === actionSheet.invoiceId ? { ...i, amount: newAmt } : i));
    showFieldToast(`Adjusted ${pct > 0 ? '+' : ''}${pct}%`);
    closeActionSheet();
  }

  function handleFieldCopy(amount: number, invoiceId: string) {
    navigator.clipboard.writeText(fmt(amount)).catch(() => {});
    setCopiedId(invoiceId);
    setTimeout(() => setCopiedId(null), 2000);
    closeActionSheet();
  }

  async function handleFieldDelete(invoiceId: string) {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    const url = `/api/projects/${projectId}/invoices`;
    const body = JSON.stringify({ ...inv, status: 'void' });
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!r.ok) throw new Error();
    } catch {
      if (typeof window !== 'undefined') {
        try { await enqueue({ url, method: 'POST', body, contentType: 'application/json', isFormData: false }); } catch { /* */ }
      }
    }
    setInvoices(prev => prev.map(i => i.id === invoiceId ? { ...i, status: 'void' as InvoiceStatus } : i));
    setDeleteConfirm(null);
    showFieldToast('Invoice voided');
  }

  /* ── Fetch invoices ──────────────────────────────────────────── */
  const fetchInvoices = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/invoices`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : data.invoices ?? []);
      setError('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load invoices';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoices(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Create invoice ──────────────────────────────────────────── */
  const handleCreate = async () => {
    if (!formNumber || !formVendor || !formAmount || !formDue) return;
    setSubmitting(true);
    const body = JSON.stringify({
      invoice_number: formNumber,
      vendor_name: formVendor,
      amount: parseFloat(formAmount),
      status: 'draft' as InvoiceStatus,
      due_date: formDue,
      description: formDesc,
      file_url: formFileUrl || null,
    });
    try {
      if (navigator.onLine) {
        const res = await fetch(`/api/projects/${projectId}/invoices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        await enqueue({
          url: `/api/projects/${projectId}/invoices`,
          method: 'POST',
          body,
          contentType: 'application/json',
          isFormData: false,
        });
      }
      setFormNumber(''); setFormVendor(''); setFormAmount('');
      setFormDue(''); setFormDesc(''); setFormFileUrl('');
      setView('list');
      await fetchInvoices();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create invoice';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Status transitions ─────────────────────────────────────── */
  const transitionStatus = async (inv: Invoice, newStatus: InvoiceStatus) => {
    const body = JSON.stringify({
      ...inv,
      status: newStatus,
      paid_date: newStatus === 'paid' ? today() : inv.paid_date,
    });
    try {
      if (navigator.onLine) {
        const res = await fetch(`/api/projects/${projectId}/invoices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        await enqueue({
          url: `/api/projects/${projectId}/invoices`,
          method: 'POST',
          body,
          contentType: 'application/json',
          isFormData: false,
        });
      }
      await fetchInvoices();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Status update failed';
      setError(msg);
    }
  };

  /* ── Batch operations ───────────────────────────────────────── */
  const batchAction = async (newStatus: InvoiceStatus) => {
    const targets = invoices.filter((i) => selected.has(i.id));
    for (const inv of targets) {
      await transitionStatus(inv, newStatus);
    }
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((i) => i.id)));
    }
  };

  /* ── Filter + sort logic ────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = [...invoices];
    if (filterStatus) list = list.filter((i) => i.status === filterStatus);
    if (filterVendor) list = list.filter((i) => i.vendor_name.toLowerCase().includes(filterVendor.toLowerCase()));
    if (filterDateFrom) list = list.filter((i) => i.due_date >= filterDateFrom);
    if (filterDateTo) list = list.filter((i) => i.due_date <= filterDateTo);
    if (filterAmountMin) list = list.filter((i) => i.amount >= parseFloat(filterAmountMin));
    if (filterAmountMax) list = list.filter((i) => i.amount <= parseFloat(filterAmountMax));

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'due_date':    cmp = a.due_date.localeCompare(b.due_date); break;
        case 'amount':      cmp = a.amount - b.amount; break;
        case 'vendor_name': cmp = a.vendor_name.localeCompare(b.vendor_name); break;
        case 'status':      cmp = a.status.localeCompare(b.status); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [invoices, filterStatus, filterVendor, filterDateFrom, filterDateTo, filterAmountMin, filterAmountMax, sortField, sortDir]);

  /* ── Summary stats ──────────────────────────────────────────── */
  const summary = useMemo(() => {
    const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0);
    const totalPaid = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    const totalOutstanding = invoices
      .filter((i) => ['draft', 'submitted', 'approved'].includes(i.status))
      .reduce((s, i) => s + i.amount, 0);
    const totalOverdue = invoices
      .filter((i) => ['draft', 'submitted', 'approved'].includes(i.status) && i.due_date < today())
      .reduce((s, i) => s + i.amount, 0);
    return { totalInvoiced, totalPaid, totalOutstanding, totalOverdue };
  }, [invoices]);

  /* ── Aging buckets ──────────────────────────────────────────── */
  const aging = useMemo(() => {
    const buckets = { current: [] as Invoice[], d30: [] as Invoice[], d60: [] as Invoice[], d90: [] as Invoice[] };
    const t = today();
    invoices
      .filter((i) => ['draft', 'submitted', 'approved'].includes(i.status))
      .forEach((i) => {
        const overdue = daysBetween(i.due_date, t);
        if (overdue <= 0) buckets.current.push(i);
        else if (overdue <= 30) buckets.d30.push(i);
        else if (overdue <= 60) buckets.d60.push(i);
        else buckets.d90.push(i);
      });
    return buckets;
  }, [invoices]);

  /* ── Due-date urgency ───────────────────────────────────────── */
  const dueColor = (dueDate: string, status: InvoiceStatus): string => {
    if (status === 'paid' || status === 'void') return DIM;
    const days = daysBetween(today(), dueDate);
    if (days < 0) return RED;
    if (days <= 7) return AMBER;
    if (days <= 30) return GOLD;
    return GREEN;
  };

  const dueLabel = (dueDate: string, status: InvoiceStatus): string => {
    if (status === 'paid') return 'Paid';
    if (status === 'void') return 'Void';
    const days = daysBetween(today(), dueDate);
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'Due today';
    return `${days}d remaining`;
  };

  /* ── PDF export ─────────────────────────────────────────────── */
  const handlePrint = () => window.print();

  /* ── Vendor list for filter ─────────────────────────────────── */
  const vendors = useMemo(() => [...new Set(invoices.map((i) => i.vendor_name))].sort(), [invoices]);

  /* ── Selected detail ────────────────────────────────────────── */
  const detail = invoices.find((i) => i.id === selectedId) || null;

  /* ── Next actions for workflow ───────────────────────────────── */
  const nextActions = (inv: Invoice): { label: string; status: InvoiceStatus; color: string }[] => {
    switch (inv.status) {
      case 'draft':     return [{ label: 'Submit', status: 'submitted', color: BLUE }];
      case 'submitted': return [
        { label: 'Approve', status: 'approved', color: GREEN },
        { label: 'Dispute', status: 'disputed', color: RED },
      ];
      case 'approved':  return [{ label: 'Mark Paid', status: 'paid', color: GREEN }];
      case 'disputed':  return [
        { label: 'Resubmit', status: 'submitted', color: BLUE },
        { label: 'Void', status: 'void', color: '#6B7280' },
      ];
      default: return [];
    }
  };

  /* ── Sort toggle ────────────────────────────────────────────── */
  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  const sortIndicator = (field: SortField) =>
    sortField === field ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';

  /* ── Status badge ───────────────────────────────────────────── */
  const Badge = ({ status }: { status: InvoiceStatus }) => (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 700,
      color: '#fff',
      background: statusColor[status],
    }}>
      {statusLabel[status]}
    </span>
  );

  /* ── RENDER ─────────────────────────────────────────────────── */
  if (!projectId) {
    return (
      <div style={{ padding: 24, color: RED, fontWeight: 600 }}>
        Missing projectId parameter.
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ background: RAISED, borderBottom: `2px solid ${GOLD}`, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {view !== 'list' && (
            <button
              onClick={() => { setView('list'); setSelectedId(null); }}
              style={{ ...btnBase, background: 'transparent', color: GOLD, border: `1px solid ${GOLD}`, padding: '6px 14px' }}
            >
              Back
            </button>
          )}
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: GOLD }}>
            Invoices
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setView('create')} style={{ ...btnBase, background: GOLD, color: '#000' }}>
            + New Invoice
          </button>
          <button onClick={() => setView('aging')} style={{ ...btnBase, background: BLUE, color: '#fff' }}>
            Aging Report
          </button>
          <button onClick={handlePrint} style={{ ...btnBase, background: 'transparent', color: DIM, border: `1px solid ${BORDER}` }}>
            Print / PDF
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 20px', maxWidth: 1200, margin: '0 auto' }}>
        {error && (
          <div style={{ background: '#3B1111', border: `1px solid ${RED}`, borderRadius: 8, padding: 12, marginBottom: 16, color: RED, fontWeight: 600 }}>
            {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: RED, cursor: 'pointer', fontWeight: 700 }}>X</button>
          </div>
        )}

        {/* ── Summary cards ──────────────────────────────────── */}
        {view === 'list' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            {([
              { label: 'Total Invoiced', value: summary.totalInvoiced, color: GOLD },
              { label: 'Total Paid',     value: summary.totalPaid,     color: GREEN },
              { label: 'Outstanding',    value: summary.totalOutstanding, color: BLUE },
              { label: 'Overdue',        value: summary.totalOverdue,  color: RED },
            ] as const).map((c) => (
              <div key={c.label} style={{ ...cardStyle, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: DIM, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{fmt(c.value)}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── LIST VIEW ──────────────────────────────────────── */}
        {view === 'list' && (
          <>
            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters((f) => !f)}
              style={{ ...btnBase, background: 'transparent', color: GOLD, border: `1px solid ${BORDER}`, marginBottom: 12, fontSize: 13 }}
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>

            {/* Filters */}
            {showFilters && (
              <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as InvoiceStatus | '')}
                    style={{ ...inputStyle }}
                  >
                    <option value="">All Statuses</option>
                    {(['draft','submitted','approved','paid','disputed','void'] as InvoiceStatus[]).map((s) => (
                      <option key={s} value={s}>{statusLabel[s]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Vendor</label>
                  <select value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)} style={{ ...inputStyle }}>
                    <option value="">All Vendors</option>
                    {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Due From</label>
                  <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Due To</label>
                  <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Min Amount</label>
                  <input type="number" placeholder="0.00" value={filterAmountMin} onChange={(e) => setFilterAmountMin(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Max Amount</label>
                  <input type="number" placeholder="0.00" value={filterAmountMax} onChange={(e) => setFilterAmountMax(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    onClick={() => {
                      setFilterStatus(''); setFilterVendor('');
                      setFilterDateFrom(''); setFilterDateTo('');
                      setFilterAmountMin(''); setFilterAmountMax('');
                    }}
                    style={{ ...btnBase, background: 'transparent', color: RED, border: `1px solid ${RED}`, width: '100%' }}
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            )}

            {/* Batch actions */}
            {selected.size > 0 && (
              <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#112240' }}>
                <span style={{ color: GOLD, fontWeight: 600 }}>{selected.size} selected</span>
                <button onClick={() => batchAction('approved')} style={{ ...btnBase, background: GREEN, color: '#fff', padding: '6px 14px', fontSize: 13 }}>
                  Batch Approve
                </button>
                <button onClick={() => batchAction('paid')} style={{ ...btnBase, background: BLUE, color: '#fff', padding: '6px 14px', fontSize: 13 }}>
                  Batch Mark Paid
                </button>
                <button onClick={() => setSelected(new Set())} style={{ ...btnBase, background: 'transparent', color: DIM, border: `1px solid ${BORDER}`, padding: '6px 14px', fontSize: 13 }}>
                  Deselect All
                </button>
              </div>
            )}

            {/* Sort bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: DIM, marginRight: 4 }}>Sort:</span>
              {([
                ['due_date', 'Date'],
                ['amount', 'Amount'],
                ['vendor_name', 'Vendor'],
                ['status', 'Status'],
              ] as [SortField, string][]).map(([f, l]) => (
                <button
                  key={f}
                  onClick={() => handleSort(f)}
                  style={{
                    ...btnBase,
                    padding: '4px 10px',
                    fontSize: 12,
                    background: sortField === f ? GOLD : 'transparent',
                    color: sortField === f ? '#000' : DIM,
                    border: `1px solid ${sortField === f ? GOLD : BORDER}`,
                  }}
                >
                  {l}{sortIndicator(f)}
                </button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 13, color: DIM }}>{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Select all */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={filtered.length > 0 && selected.size === filtered.length}
                onChange={toggleSelectAll}
                style={{ accentColor: GOLD, width: 16, height: 16 }}
              />
              <span style={{ fontSize: 12, color: DIM }}>Select All</span>
            </div>

            {loading && <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>Loading invoices...</div>}

            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>
                No invoices found. Create one to get started.
              </div>
            )}

            {/* Invoice list */}
            {filtered.map((inv) => (
              <div
                key={inv.id}
                style={{
                  ...cardStyle,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  border: selected.has(inv.id) ? `1px solid ${GOLD}` : `1px solid ${BORDER}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(inv.id)}
                  onChange={(e) => { e.stopPropagation(); toggleSelect(inv.id); }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ accentColor: GOLD, width: 16, height: 16, flexShrink: 0 }}
                />
                <div
                  style={{ flex: 1, minWidth: 0 }}
                  onClick={() => { setSelectedId(inv.id); setView('detail'); }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>#{inv.invoice_number}</span>
                    <Badge status={inv.status} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                    <span style={{ color: DIM, fontSize: 13 }}>{inv.vendor_name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 16, color: copiedId === inv.id ? GREEN : GOLD }}>{fmt(inv.amount)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); openActionSheet(inv.id, `#${inv.invoice_number} — ${inv.vendor_name}`, inv.amount); }}
                        style={{ background: 'none', border: 'none', color: DIM, fontSize: 18, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                      >&#x22EF;</button>
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, flexWrap: 'wrap', gap: 4 }}>
                    <span style={{ fontSize: 12, color: DIM }}>Due: {inv.due_date}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: dueColor(inv.due_date, inv.status) }}>
                      {dueLabel(inv.due_date, inv.status)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── DETAIL VIEW ────────────────────────────────────── */}
        {view === 'detail' && detail && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: GOLD }}>Invoice #{detail.invoice_number}</h2>
              <Badge status={detail.status} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: DIM, marginBottom: 4, textTransform: 'uppercase' }}>Vendor</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{detail.vendor_name}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: DIM, marginBottom: 4, textTransform: 'uppercase' }}>Amount</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: GOLD }}>{fmt(detail.amount)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: DIM, marginBottom: 4, textTransform: 'uppercase' }}>Due Date</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{detail.due_date}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: dueColor(detail.due_date, detail.status), marginTop: 2 }}>
                  {dueLabel(detail.due_date, detail.status)}
                </div>
              </div>
              {detail.paid_date && (
                <div>
                  <div style={{ fontSize: 12, color: DIM, marginBottom: 4, textTransform: 'uppercase' }}>Paid Date</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: GREEN }}>{detail.paid_date}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 12, color: DIM, marginBottom: 4, textTransform: 'uppercase' }}>Created</div>
                <div style={{ fontSize: 14 }}>{detail.created_at ? new Date(detail.created_at).toLocaleDateString() : 'N/A'}</div>
              </div>
            </div>

            {detail.description && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: DIM, marginBottom: 4, textTransform: 'uppercase' }}>Description</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: TEXT }}>{detail.description}</div>
              </div>
            )}

            {detail.file_url && (
              <div style={{ marginBottom: 20 }}>
                <a
                  href={detail.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: BLUE, textDecoration: 'underline', fontSize: 14 }}
                >
                  View Attached Document
                </a>
              </div>
            )}

            {/* Workflow actions */}
            {nextActions(detail).length > 0 && (
              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: DIM, alignSelf: 'center' }}>Actions:</span>
                {nextActions(detail).map((a) => (
                  <button
                    key={a.status}
                    onClick={() => transitionStatus(detail, a.status)}
                    style={{ ...btnBase, background: a.color, color: '#fff' }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CREATE VIEW ────────────────────────────────────── */}
        {view === 'create' && (
          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: 20, color: GOLD }}>Create Invoice</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Invoice Number *</label>
                <input value={formNumber} onChange={(e) => setFormNumber(e.target.value)} placeholder="INV-001" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Vendor Name *</label>
                <input value={formVendor} onChange={(e) => setFormVendor(e.target.value)} placeholder="Vendor name" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Amount ($) *</label>
                <input type="number" step="0.01" min="0" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Due Date *</label>
                <input type="date" value={formDue} onChange={(e) => setFormDue(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Description</label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Invoice description..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>File URL (optional)</label>
                <input value={formFileUrl} onChange={(e) => setFormFileUrl(e.target.value)} placeholder="https://..." style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button
                onClick={handleCreate}
                disabled={submitting || !formNumber || !formVendor || !formAmount || !formDue}
                style={{
                  ...btnBase,
                  background: GOLD,
                  color: '#000',
                  opacity: submitting || !formNumber || !formVendor || !formAmount || !formDue ? 0.5 : 1,
                }}
              >
                {submitting ? 'Saving...' : 'Create Invoice'}
              </button>
              <button
                onClick={() => setView('list')}
                style={{ ...btnBase, background: 'transparent', color: DIM, border: `1px solid ${BORDER}` }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── AGING REPORT ───────────────────────────────────── */}
        {view === 'aging' && (
          <div>
            <h2 style={{ margin: '0 0 20px 0', fontSize: 20, color: GOLD }}>Aging Report</h2>

            {/* Aging summary row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
              {([
                { label: 'Current', items: aging.current, color: GREEN },
                { label: '1-30 Days', items: aging.d30, color: AMBER },
                { label: '31-60 Days', items: aging.d60, color: '#F97316' },
                { label: '90+ Days', items: aging.d90, color: RED },
              ] as const).map((b) => {
                const total = b.items.reduce((s, i) => s + i.amount, 0);
                return (
                  <div key={b.label} style={{ ...cardStyle, textAlign: 'center', borderLeft: `4px solid ${b.color}` }}>
                    <div style={{ fontSize: 12, color: DIM, marginBottom: 4, textTransform: 'uppercase' }}>{b.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: b.color }}>{fmt(total)}</div>
                    <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{b.items.length} invoice{b.items.length !== 1 ? 's' : ''}</div>
                  </div>
                );
              })}
            </div>

            {/* Aging detail lists */}
            {([
              { label: 'Current (Not Yet Due)', items: aging.current, color: GREEN },
              { label: '1-30 Days Overdue', items: aging.d30, color: AMBER },
              { label: '31-60 Days Overdue', items: aging.d60, color: '#F97316' },
              { label: '90+ Days Overdue', items: aging.d90, color: RED },
            ] as const).map((bucket) => (
              bucket.items.length > 0 && (
                <div key={bucket.label} style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 15, color: bucket.color, marginBottom: 10, borderBottom: `1px solid ${BORDER}`, paddingBottom: 6 }}>
                    {bucket.label} ({bucket.items.length})
                  </h3>
                  {bucket.items.map((inv) => (
                    <div
                      key={inv.id}
                      onClick={() => { setSelectedId(inv.id); setView('detail'); }}
                      style={{
                        ...cardStyle,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        borderLeft: `4px solid ${bucket.color}`,
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>#{inv.invoice_number}</div>
                        <div style={{ fontSize: 13, color: DIM }}>{inv.vendor_name}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: GOLD }}>{fmt(inv.amount)}</div>
                        <div style={{ fontSize: 12, color: bucket.color }}>Due: {inv.due_date}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ))}

            {aging.current.length === 0 && aging.d30.length === 0 && aging.d60.length === 0 && aging.d90.length === 0 && (
              <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>
                No outstanding invoices to age.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Money Action BottomSheet ─────────────────────── */}
      {actionSheet && (
        <BottomSheet open={!!actionSheet} onClose={closeActionSheet} title={actionSheet.label}>
          <div style={{ padding: '8px 20px 24px' }}>
            {/* Current amount display */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Current Amount</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>
                {fmt(actionSheet.amount)}
              </div>
            </div>

            {sheetMode === 'menu' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { label: 'Edit Amount', icon: '\u270F\uFE0F', action: () => { setSheetMode('edit'); setEditVal(String(actionSheet.amount)); } },
                  { label: 'Adjust %', icon: '\uD83D\uDCCA', action: () => setSheetMode('adjust') },
                  { label: 'Copy Amount', icon: '\uD83D\uDCCB', action: () => { handleFieldCopy(actionSheet.amount, actionSheet.invoiceId); } },
                  { label: 'Void Invoice', icon: '\uD83D\uDDD1\uFE0F', action: () => { closeActionSheet(); setDeleteConfirm(actionSheet.invoiceId); } },
                ].map(item => (
                  <button key={item.label} onClick={item.action} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, color: item.label === 'Void Invoice' ? RED : TEXT, fontSize: 15, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 20 }}>{item.icon}</span>{item.label}
                  </button>
                ))}
              </div>
            )}

            {sheetMode === 'edit' && (
              <div>
                <label style={{ display: 'block', fontSize: 12, color: DIM, fontWeight: 700, marginBottom: 6 }}>New Amount ($)</label>
                <input
                  value={editVal} onChange={e => setEditVal(e.target.value)}
                  type="number" inputMode="decimal" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleFieldSaveEdit(); }}
                  style={{ width: '100%', padding: '14px 16px', background: '#0A1628', border: `1px solid ${GOLD}`, borderRadius: 10, color: TEXT, fontSize: 20, fontWeight: 700, outline: 'none', boxSizing: 'border-box', textAlign: 'right' }}
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button onClick={handleFieldSaveEdit} style={{ flex: 1, padding: '14px', background: GOLD, color: '#000', fontWeight: 700, border: 'none', borderRadius: 10, fontSize: 15, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setSheetMode('menu')} style={{ flex: 1, padding: '14px', background: 'transparent', color: DIM, fontWeight: 600, border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 15, cursor: 'pointer' }}>Back</button>
                </div>
              </div>
            )}

            {sheetMode === 'adjust' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  {[-10, -5, 5, 10].map(pct => (
                    <button key={pct} onClick={() => handleFieldAdjust(pct)} style={{
                      padding: '16px', borderRadius: 10, fontSize: 18, fontWeight: 800, cursor: 'pointer', border: 'none',
                      background: pct > 0 ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)',
                      color: pct > 0 ? GREEN : RED,
                    }}>
                      {pct > 0 ? '+' : ''}{pct}%
                    </button>
                  ))}
                </div>
                <button onClick={() => setSheetMode('menu')} style={{ width: '100%', padding: '12px', background: 'transparent', color: DIM, fontWeight: 600, border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 14, cursor: 'pointer' }}>Back</button>
              </div>
            )}
          </div>
        </BottomSheet>
      )}

      {/* ── Delete (Void) Confirmation Overlay ────────────── */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 700, padding: 24 }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 340, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{'\uD83D\uDDD1\uFE0F'}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Void this invoice?</div>
            <div style={{ fontSize: 13, color: DIM, marginBottom: 20 }}>This will mark the invoice as void.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => handleFieldDelete(deleteConfirm)} style={{ flex: 1, padding: '12px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, color: RED, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Yes, Void</button>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, color: DIM, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────── */}
      {fieldToast && (
        <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 20px', color: GREEN, fontSize: 13, fontWeight: 600, zIndex: 800, boxShadow: '0 8px 24px rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{'\u2713'}</span>{fieldToast}
        </div>
      )}
    </div>
  );
}

/* ── Suspense wrapper ─────────────────────────────────────────── */
export default function InvoicesPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#8BAAC8', background: '#0A1628', minHeight: '100vh' }}>Loading...</div>}>
      <InvoicesPage />
    </Suspense>
  );
}
