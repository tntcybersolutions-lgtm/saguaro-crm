'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface Invoice {
  id: string;
  invoice_num: string;
  period: string;
  amount: number;
  issued_date: string;
  due_date: string;
  status: string;
  notes: string;
  project_id: string;
}

const STATUS_MAP: Record<string, { bg: string; color: string }> = {
  Draft: { bg: 'rgba(143,163,192,.2)', color: DIM },
  Sent: { bg: 'rgba(59,130,246,.2)', color: '#60a5fa' },
  Pending: { bg: 'rgba(245,158,11,.2)', color: '#f59e0b' },
  Paid: { bg: 'rgba(61,214,140,.2)', color: GREEN },
  Overdue: { bg: 'rgba(239,68,68,.2)', color: RED },
};

const EMPTY_FORM = { invoice_num: '', period: '', amount: 0, issued_date: '', due_date: '', notes: '' };

export default function InvoicesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/invoices`);
      const json = await res.json();
      setInvoices(json.invoices ?? []);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const today = new Date().toISOString().split('T')[0];
  const totalBilled = invoices.reduce((s, i) => s + (i.amount || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
  const totalOutstanding = invoices.filter(i => i.status !== 'Paid' && i.status !== 'Draft').reduce((s, i) => s + (i.amount || 0), 0);

  async function handleSave() {
    if (!form.invoice_num || !form.amount) { setErrorMsg('Invoice number and amount are required.'); return; }
    setSaving(true);
    setErrorMsg('');
    const newInv: Invoice = { id: `inv-${Date.now()}`, project_id: projectId, status: 'Draft', ...form };
    try {
      const res = await fetch('/api/invoices/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...newInv }) });
      const json = await res.json();
      setInvoices(prev => [...prev, json.invoice || newInv]);
    } catch {
      setInvoices(prev => [...prev, newInv]);
    }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setSuccessMsg('Invoice created.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleSend(id: string) {
    try { await fetch(`/api/invoices/${id}/send`, { method: 'POST' }); } catch { /* demo */ }
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: 'Sent' } : i));
    setSuccessMsg('Invoice sent to owner.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Invoices</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Owner billing and payment tracking</div>
        </div>
        <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ New Invoice</button>
      </div>

      {/* KPIs */}
      <div style={{ padding: '20px 24px 0', display: 'flex', gap: 12 }}>
        {[
          { label: 'Total Billed', value: `$${totalBilled.toLocaleString()}`, color: TEXT },
          { label: 'Total Paid', value: `$${totalPaid.toLocaleString()}`, color: GREEN },
          { label: 'Outstanding', value: `$${totalOutstanding.toLocaleString()}`, color: totalOutstanding > 0 ? GOLD : GREEN },
        ].map(k => (
          <div key={k.label} style={{ background: RAISED, borderRadius: 8, padding: '14px 24px', border: '1px solid ' + BORDER }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>New Invoice</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div><label style={label}>Invoice # *</label><input type="text" value={form.invoice_num} onChange={e => setForm(p => ({ ...p, invoice_num: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Period</label><input type="text" value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))} placeholder="e.g. Mar 2026" style={inp} /></div>
            <div><label style={label}>Amount ($) *</label><input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} style={inp} /></div>
            <div><label style={label}>Issue Date</label><input type="date" value={form.issued_date} onChange={e => setForm(p => ({ ...p, issued_date: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Due Date</label><input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Notes</label><input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Create Invoice'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px 40px', overflowX: 'auto' }}>
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div> : invoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: DIM, fontSize: 13 }}>No invoices yet. Create your first invoice above.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Invoice #','Period','Amount','Issued','Due','Status','Notes','Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const overdue = inv.due_date < today && inv.status !== 'Paid';
                const effectiveStatus = overdue ? 'Overdue' : inv.status;
                const sc = STATUS_MAP[effectiveStatus] || { bg: 'rgba(143,163,192,.2)', color: DIM };
                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)', background: overdue ? 'rgba(239,68,68,.04)' : 'transparent' }}>
                    <td style={{ padding: '10px 14px', color: GOLD, fontWeight: 700 }}>{inv.invoice_num}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{inv.period}</td>
                    <td style={{ padding: '10px 14px', color: TEXT, fontWeight: 700 }}>${inv.amount?.toLocaleString()}</td>
                    <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{inv.issued_date || '—'}</td>
                    <td style={{ padding: '10px 14px', color: overdue ? RED : DIM, whiteSpace: 'nowrap' }}>{inv.due_date || '—'}</td>
                    <td style={{ padding: '10px 14px' }}><span style={{ padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700 }}>{effectiveStatus}</span></td>
                    <td style={{ padding: '10px 14px', color: DIM, fontSize: 12 }}>{inv.notes}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {inv.status === 'Draft' && (
                        <button onClick={() => handleSend(inv.id)} style={{ padding: '4px 12px', background: 'rgba(59,130,246,.2)', border: '1px solid rgba(59,130,246,.4)', borderRadius: 5, color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}>Send to Owner</button>
                      )}
                      {inv.status === 'Paid' && <span style={{ color: GREEN, fontSize: 12 }}>Paid</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
