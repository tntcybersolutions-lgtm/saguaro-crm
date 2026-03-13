'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T } from '@/components/ui/shell';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

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
const EMPTY_FORM = { vendor: '', description: '', delivery_date: '', line_items: [{ ...EMPTY_LINE }] };

export default function PurchaseOrdersPage() {
  const { projectId } = useParams() as { projectId: string };
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
      setPos(json.purchase_orders || []);
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

  const formTotal = form.line_items.reduce((s, li) => s + li.quantity * li.unit_price, 0);

  async function handleSave() {
    if (!form.vendor || !form.description) { setErrorMsg('Vendor and description are required.'); return; }
    setSaving(true);
    setErrorMsg('');
    const num = `PO-${String(pos.length + 1).padStart(3, '0')}`;
    const amount = formTotal;
    const newPo: PurchaseOrder = {
      id: `po-${Date.now()}`,
      project_id: projectId,
      po_num: num,
      status: 'draft',
      issued_date: new Date().toISOString().split('T')[0],
      amount,
      vendor: form.vendor,
      description: form.description,
      delivery_date: form.delivery_date || null,
      line_items: form.line_items,
    };
    try {
      const res = await fetch('/api/purchase-orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...newPo }),
      });
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

  async function handleGeneratePdf(po: PurchaseOrder) {
    try {
      const res = await fetch('/api/documents/purchase-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, poId: po.id }),
      });
      const json = await res.json();
      if (json.url) window.open(json.url, '_blank');
      else { setSuccessMsg('PDF generation queued.'); setTimeout(() => setSuccessMsg(''), 4000); }
    } catch {
      setSuccessMsg('PDF generation requested (demo mode).');
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      await fetch(`/api/purchase-orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch { /* demo */ }
    setPos(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    setSuccessMsg(`PO status updated to ${status}.`);
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };

  return (
    <PageWrap>
      <div style={{ padding: '24px 24px 0' }}>
        <SectionHeader
          title="Purchase Orders"
          sub="Vendor and supplier purchase orders"
          action={
            <Btn onClick={() => { setShowForm(p => !p); setErrorMsg(''); }}>
              {showForm ? 'Cancel' : '+ New PO'}
            </Btn>
          }
        />
      </div>

      {/* Stat Cards */}
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon="💰" label="Total PO Value" value={`$${totalValue.toLocaleString()}`} />
        <StatCard icon="📝" label="Draft" value={String(draftCount)} />
        <StatCard icon="📤" label="Sent" value={String(sentCount)} />
        <StatCard icon="📦" label="Received" value={String(receivedCount)} />
      </div>

      {successMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.4)`, borderRadius: 8, color: T.green, fontSize: 13 }}>{successMsg}</div>
      )}
      {errorMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.redDim, border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 8, color: T.red, fontSize: 13 }}>{errorMsg}</div>
      )}

      {/* Create Form */}
      {showForm && (
        <div style={{ padding: '0 24px 16px' }}>
          <Card>
            <CardHeader><span style={{ fontWeight: 700, color: T.white }}>New Purchase Order</span></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                <div>
                  <label style={lbl}>Vendor *</label>
                  <input value={form.vendor} onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Description *</label>
                  <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Delivery Date</label>
                  <SaguaroDatePicker value={form.delivery_date} onChange={v => setForm(p => ({ ...p, delivery_date: v }))} style={inp} />
                </div>
              </div>

              {/* Line Items */}
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.white }}>Line Items</span>
                  <Btn size="sm" variant="ghost" onClick={addLineItem}>+ Add Line</Btn>
                </div>
                {form.line_items.map((li, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, marginBottom: 8 }}>
                    <input placeholder="Description" value={li.description} onChange={e => updateLineItem(idx, 'description', e.target.value)} style={inp} />
                    <input type="number" placeholder="Qty" value={li.quantity} onChange={e => updateLineItem(idx, 'quantity', Number(e.target.value))} style={inp} />
                    <input type="number" placeholder="Unit Price" value={li.unit_price} onChange={e => updateLineItem(idx, 'unit_price', Number(e.target.value))} style={inp} />
                    <Btn variant="danger" size="sm" onClick={() => removeLineItem(idx)} disabled={form.line_items.length <= 1}>X</Btn>
                  </div>
                ))}
                <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: T.gold, marginTop: 8 }}>
                  Total: ${formTotal.toLocaleString()}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Create PO'}</Btn>
                <Btn variant="ghost" onClick={() => { setShowForm(false); setErrorMsg(''); }}>Cancel</Btn>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Table */}
      <div style={{ padding: '0 24px 40px' }}>
        <Card>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>Loading...</div>
            ) : (
              <Table
                headers={['PO #', 'Vendor', 'Description', 'Amount', 'Status', 'Date', 'Actions']}
                rows={pos.map(p => [
                  <span key="n" style={{ color: T.gold, fontWeight: 700 }}>{p.po_num}</span>,
                  p.vendor,
                  <span key="d" style={{ color: T.muted }}>{p.description}</span>,
                  <span key="a" style={{ fontWeight: 700 }}>${(p.amount || 0).toLocaleString()}</span>,
                  <Badge key="s" label={p.status} color={STATUS_BADGE[p.status] || 'muted'} />,
                  <span key="dt" style={{ color: T.muted }}>{p.issued_date}</span>,
                  <div key="act" style={{ display: 'flex', gap: 6 }}>
                    <Btn size="sm" variant="ghost" onClick={() => handleGeneratePdf(p)}>PDF</Btn>
                    {p.status === 'draft' && (
                      <Btn size="sm" onClick={() => handleStatusChange(p.id, 'sent')}>Send</Btn>
                    )}
                    {p.status === 'sent' && (
                      <Btn size="sm" onClick={() => handleStatusChange(p.id, 'received')}>Received</Btn>
                    )}
                    {p.status === 'received' && (
                      <Btn size="sm" variant="ghost" onClick={() => handleStatusChange(p.id, 'closed')}>Close</Btn>
                    )}
                  </div>,
                ])}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </PageWrap>
  );
}
