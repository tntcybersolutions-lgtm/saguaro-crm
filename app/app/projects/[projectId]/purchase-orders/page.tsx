'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface PurchaseOrder {
  id: string;
  po_num: string;
  vendor: string;
  description: string;
  amount: number;
  issued_date: string;
  expected_delivery: string | null;
  status: string;
  notes: string;
  project_id: string;
}

const DEMO_POS: PurchaseOrder[] = [
  { id: 'po-1', po_num: 'PO-001', vendor: 'Desert Steel Supply', description: 'Structural steel — Phase 1', amount: 28400, issued_date: '2026-01-20', expected_delivery: '2026-02-05', status: 'Delivered', notes: '', project_id: '' },
  { id: 'po-2', po_num: 'PO-002', vendor: 'Phoenix Lumber Co', description: 'Framing lumber — 2x6 studs', amount: 15880, issued_date: '2026-02-01', expected_delivery: '2026-02-10', status: 'Delivered', notes: '', project_id: '' },
  { id: 'po-3', po_num: 'PO-003', vendor: 'Window World AZ', description: 'Windows — 18 units', amount: 6930, issued_date: '2026-02-10', expected_delivery: '2026-04-01', status: 'In Transit', notes: 'Lead time 6-8 weeks', project_id: '' },
  { id: 'po-4', po_num: 'PO-004', vendor: 'AZ Ready Mix', description: 'Concrete — additional pours', amount: 4200, issued_date: '2026-03-01', expected_delivery: '2026-03-15', status: 'Ordered', notes: '', project_id: '' },
];

const STATUSES = ['Draft','Ordered','In Transit','Delivered','Cancelled'];
const STATUS_MAP: Record<string, { bg: string; color: string }> = {
  Draft: { bg: 'rgba(143,163,192,.2)', color: DIM },
  Ordered: { bg: 'rgba(59,130,246,.2)', color: '#60a5fa' },
  'In Transit': { bg: 'rgba(245,158,11,.2)', color: '#f59e0b' },
  Delivered: { bg: 'rgba(61,214,140,.2)', color: GREEN },
  Cancelled: { bg: 'rgba(239,68,68,.2)', color: RED },
};

const EMPTY_FORM = { vendor: '', description: '', amount: 0, issued_date: '', expected_delivery: '', notes: '' };

export default function PurchaseOrdersPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchPos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/purchase-orders`);
      const json = await res.json();
      setPos(json.purchase_orders?.length ? json.purchase_orders : DEMO_POS.map(p => ({ ...p, project_id: projectId })));
    } catch {
      setPos(DEMO_POS.map(p => ({ ...p, project_id: projectId })));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchPos(); }, [fetchPos]);

  const total = pos.reduce((s, p) => s + (p.amount || 0), 0);
  const delivered = pos.filter(p => p.status === 'Delivered').length;
  const inTransit = pos.filter(p => p.status === 'In Transit' || p.status === 'Ordered').length;

  async function handleSave() {
    if (!form.vendor || !form.description || !form.amount) { setErrorMsg('Vendor, description, and amount are required.'); return; }
    setSaving(true);
    setErrorMsg('');
    const num = `PO-${String(pos.length + 1).padStart(3, '0')}`;
    const newPo: PurchaseOrder = { id: `po-${Date.now()}`, project_id: projectId, po_num: num, status: 'Ordered', ...form, expected_delivery: form.expected_delivery || null };
    try {
      const res = await fetch('/api/purchase-orders/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...newPo }) });
      const json = await res.json();
      setPos(prev => [...prev, json.po || newPo]);
    } catch {
      setPos(prev => [...prev, newPo]);
    }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setSuccessMsg('Purchase order created.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleMarkDelivered(id: string) {
    try { await fetch(`/api/purchase-orders/${id}/deliver`, { method: 'PATCH' }); } catch { /* demo */ }
    setPos(prev => prev.map(p => p.id === id ? { ...p, status: 'Delivered' } : p));
    setSuccessMsg('PO marked as delivered.');
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Purchase Orders</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Vendor and supplier purchase orders</div>
        </div>
        <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ New PO</button>
      </div>

      {/* KPIs */}
      <div style={{ padding: '20px 24px 0', display: 'flex', gap: 12 }}>
        {[
          { label: 'Total PO Value', value: `$${total.toLocaleString()}`, color: GOLD },
          { label: 'Delivered', value: delivered, color: GREEN },
          { label: 'In Transit / Ordered', value: inTransit, color: '#f59e0b' },
        ].map(k => (
          <div key={k.label} style={{ background: RAISED, borderRadius: 8, padding: '12px 20px', border: '1px solid ' + BORDER }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>New Purchase Order</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div><label style={label}>Vendor *</label><input type="text" value={form.vendor} onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Amount ($) *</label><input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} style={inp} /></div>
            <div><label style={label}>Issue Date</label><input type="date" value={form.issued_date} onChange={e => setForm(p => ({ ...p, issued_date: e.target.value }))} style={inp} /></div>
            <div style={{ gridColumn: 'span 2' }}><label style={label}>Description *</label><input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Expected Delivery</label><input type="date" value={form.expected_delivery} onChange={e => setForm(p => ({ ...p, expected_delivery: e.target.value }))} style={inp} /></div>
            <div style={{ gridColumn: 'span 3' }}><label style={label}>Notes</label><input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Create PO'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px 40px', overflowX: 'auto' }}>
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['PO #','Vendor','Description','Amount','Issued','Expected Delivery','Status','Notes','Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pos.map(p => {
                const sc = STATUS_MAP[p.status] || { bg: 'rgba(143,163,192,.2)', color: DIM };
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)' }}>
                    <td style={{ padding: '10px 14px', color: GOLD, fontWeight: 700 }}>{p.po_num}</td>
                    <td style={{ padding: '10px 14px', color: TEXT }}>{p.vendor}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{p.description}</td>
                    <td style={{ padding: '10px 14px', color: TEXT, fontWeight: 700 }}>${p.amount?.toLocaleString()}</td>
                    <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{p.issued_date}</td>
                    <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{p.expected_delivery || '—'}</td>
                    <td style={{ padding: '10px 14px' }}><span style={{ padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700 }}>{p.status}</span></td>
                    <td style={{ padding: '10px 14px', color: DIM, fontSize: 12 }}>{p.notes || '—'}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {p.status !== 'Delivered' && p.status !== 'Cancelled' && (
                        <button onClick={() => handleMarkDelivered(p.id)} style={{ padding: '4px 10px', background: 'rgba(61,214,140,.2)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 5, color: GREEN, fontSize: 12, cursor: 'pointer' }}>Mark Delivered</button>
                      )}
                      {p.status === 'Delivered' && <span style={{ color: GREEN, fontSize: 12 }}>Delivered</span>}
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
