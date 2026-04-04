'use client';
/**
 * Invoicing Page — Fully wired to /api/invoices/list and /api/invoices/create.
 * Uses DataTable with sorting, filtering, pagination.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, CurrencyDollar, PaperPlaneTilt, Eye, Trash, Warning } from '@phosphor-icons/react';
import DataTable from '../../../components/DataTable';
import { colors, font, radius } from '../../../lib/design-tokens';

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
  notes: string | null;
  created_at: string;
}

interface Project { id: string; name: string; }

const columnHelper = createColumnHelper<Invoice>();

const STATUS_COLORS: Record<string, string> = {
  draft: colors.textDim,
  pending: colors.orange,
  sent: colors.blue,
  paid: colors.green,
  overdue: colors.red,
};

export default function InvoicingPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch('/api/invoices/list');
      if (!res.ok) throw new Error('Failed to load invoices');
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : data.invoices ?? []);
    } catch (e: any) {
      setError(e.message);
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.project_id || !form.vendor_name) return;
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
          amount: form.amount ? parseFloat(form.amount) : null,
          tax: form.tax ? parseFloat(form.tax) : null,
          total: form.amount ? parseFloat(form.amount) + (form.tax ? parseFloat(form.tax) : 0) : null,
          due_date: form.due_date || null,
          status: form.status || null,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to create invoice');
      setShowCreate(false);
      setForm({ project_id: '', vendor_name: '', invoice_number: '', vendor_email: '', description: '', category: '', cost_code: '', amount: '', tax: '', due_date: '', status: 'draft', notes: '' });
      await fetchInvoices();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this invoice?')) return;
    try {
      await fetch(`/api/invoices/${id}/delete`, { method: 'DELETE' });
      await fetchInvoices();
    } catch {}
  }

  async function handleSend(id: string) {
    try {
      await fetch(`/api/invoices/${id}/send`, { method: 'POST' });
      await fetchInvoices();
    } catch {}
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
      cell: (info) => {
        const v = info.getValue();
        return v != null ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';
      },
    }),
    columnHelper.accessor('total', {
      header: 'Total',
      cell: (info) => {
        const v = info.getValue();
        return v != null ? <span style={{ fontWeight: font.weight.bold, color: colors.gold }}>${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> : '—';
      },
    }),
    columnHelper.accessor('due_date', {
      header: 'Due Date',
      cell: (info) => {
        const v = info.getValue();
        if (!v) return '—';
        const d = new Date(v);
        const overdue = d < new Date() && info.row.original.status !== 'paid';
        return <span style={{ color: overdue ? colors.red : colors.text }}>{d.toLocaleDateString()}</span>;
      },
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => {
        const s = info.getValue() ?? 'draft';
        return (
          <span style={{
            padding: '3px 10px', borderRadius: 999, fontSize: font.size.xs, fontWeight: font.weight.bold,
            textTransform: 'uppercase', letterSpacing: 0.5,
            background: `${STATUS_COLORS[s] ?? colors.textDim}20`,
            color: STATUS_COLORS[s] ?? colors.textDim,
          }}>
            {s}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: (info) => (
        <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => handleSend(info.row.original.id)} title="Send" style={actionBtnStyle}><PaperPlaneTilt size={14} /></button>
          <button onClick={() => handleDelete(info.row.original.id)} title="Delete" style={{ ...actionBtnStyle, color: colors.red }}><Trash size={14} /></button>
        </div>
      ),
    }),
  ], []);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', background: colors.raised,
    border: `1px solid ${colors.border}`, borderRadius: radius.md,
    color: colors.text, fontSize: font.size.md, outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textMuted, marginBottom: 4, display: 'block',
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: font.size['3xl'], fontWeight: font.weight.black, color: colors.text }}>Invoicing</h1>
          <p style={{ margin: '4px 0 0', fontSize: font.size.md, color: colors.textMuted }}>Manage invoices, track payments, and send to vendors.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
            background: colors.gold, border: 'none', borderRadius: radius.lg,
            color: colors.dark, fontSize: font.size.md, fontWeight: font.weight.black,
            cursor: 'pointer', transition: 'opacity .15s',
          }}
        >
          <Plus size={16} weight="bold" /> New Invoice
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.1)', border: `1px solid rgba(239,68,68,.3)`, borderRadius: radius.md, color: colors.red, fontSize: font.size.md, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Warning size={16} /> {error}
        </div>
      )}

      <DataTable
        data={invoices}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search invoices..."
        emptyMessage="No invoices yet. Create your first invoice to get started."
        onRowClick={(row) => router.push(`/app/invoicing/${row.id}`)}
      />

      {/* ── Create Modal ─────────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, width: '100%', maxWidth: 600, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,.1)' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: colors.surface, zIndex: 1 }}>
              <h2 style={{ margin: 0, fontSize: font.size.xl, fontWeight: font.weight.black, color: colors.text }}>New Invoice</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Project *</label>
                  <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} required style={inputStyle}>
                    <option value="">Select project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Vendor Name *</label>
                  <input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} required style={inputStyle} placeholder="Vendor name" />
                </div>
                <div>
                  <label style={labelStyle}>Invoice #</label>
                  <input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} style={inputStyle} placeholder="INV-001" />
                </div>
                <div>
                  <label style={labelStyle}>Vendor Email</label>
                  <input type="email" value={form.vendor_email} onChange={(e) => setForm({ ...form, vendor_email: e.target.value })} style={inputStyle} placeholder="vendor@email.com" />
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
                  <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}>
                    <option value="draft">Draft</option>
                    <option value="pending">Pending</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                  </select>
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
                <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '10px 20px', background: 'none', border: `1px solid ${colors.border}`, borderRadius: radius.lg, color: colors.textMuted, fontSize: font.size.md, fontWeight: font.weight.semibold, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={creating} style={{ padding: '10px 24px', background: colors.gold, border: 'none', borderRadius: radius.lg, color: colors.dark, fontSize: font.size.md, fontWeight: font.weight.black, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}>
                  {creating ? 'Creating...' : 'Create Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, background: 'none', border: 'none',
  color: colors.textMuted, cursor: 'pointer', borderRadius: 4,
};
