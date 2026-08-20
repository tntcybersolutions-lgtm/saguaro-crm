'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface Bill {
  id: string;
  invoice_num: string;
  vendor: string;
  description: string;
  amount: number;
  due_date: string;
  status: string;
  category: string;
  project_id: string;
}

const EMPTY_FORM = { invoice_num: '', vendor: '', description: '', amount: 0, due_date: '', category: '03 - Concrete' };
const CATEGORIES = ['03 - Concrete','04 - Masonry','05 - Metals','06 - Wood & Plastics','07 - Thermal & Moisture','08 - Openings','09 - Finishes','21 - Fire Suppression','22 - Plumbing','23 - HVAC','26 - Electrical','31 - Earthwork','32 - Exterior Improvements'];

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    Pending: { bg: 'rgba(245,158,11,.2)', color: '#f59e0b' },
    Approved: { bg: 'rgba(59,130,246,.2)', color: '#60a5fa' },
    Paid: { bg: 'rgba(61,214,140,.2)', color: GREEN },
    Overdue: { bg: 'rgba(239,68,68,.2)', color: RED },
  };
  const s = map[status] || { bg: 'rgba(143,163,192,.2)', color: DIM };
  return <span style={{ padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700 }}>{status}</span>;
}

function isOverdue(dueDate: string, status: string): boolean {
  if (status === 'Paid') return false;
  return new Date(dueDate) < new Date();
}

export default function BillsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/bills`);
      const json = await res.json();
      setBills(json.bills || []);
    } catch {
      setBills([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  async function handleSave() {
    if (!form.vendor || !form.invoice_num || !form.amount) {
      setErrorMsg('Vendor, invoice number, and amount are required.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/bills/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...form }),
      });
      const json = await res.json();
      const newBill: Bill = json.bill || { id: `b-${Date.now()}`, project_id: projectId, status: 'Pending', ...form };
      setBills(prev => [newBill, ...prev]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Bill added successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      const newBill: Bill = { id: `b-${Date.now()}`, project_id: projectId, status: 'Pending', ...form };
      setBills(prev => [newBill, ...prev]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Bill added (demo mode).');
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(id: string) {
    setActionLoading(id + '-approve');
    try {
      await fetch(`/api/bills/${id}/approve`, { method: 'PATCH' });
    } catch { /* demo mode */ }
    setBills(prev => prev.map(b => b.id === id ? { ...b, status: 'Approved' } : b));
    setActionLoading(null);
    setSuccessMsg('Bill approved.');
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  async function handlePay(id: string) {
    setActionLoading(id + '-pay');
    try {
      await fetch(`/api/bills/${id}/pay`, { method: 'PATCH' });
    } catch { /* demo mode */ }
    setBills(prev => prev.map(b => b.id === id ? { ...b, status: 'Paid' } : b));
    setActionLoading(null);
    setSuccessMsg('Bill marked as paid.');
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  const fmt = (n: number) => '$' + ((n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }));

  function openBillMenu(id: string) { setMenuId(id); setEditId(null); setAdjustId(null); setDeleteId(null); }

  async function handleEditBill(id: string) {
    const amount = parseFloat(editVal);
    if (isNaN(amount) || amount < 0) return;
    setBills(prev => prev.map(b => b.id === id ? { ...b, amount } : b));
    setEditId(null);
    try { await fetch(`/api/bills/${id}/update`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }) }); setSuccessMsg('Amount updated.'); setTimeout(() => setSuccessMsg(''), 3000); } catch { setSuccessMsg('Updated locally.'); setTimeout(() => setSuccessMsg(''), 3000); }
  }

  async function handleAdjustBill(id: string, pct: number) {
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    const newAmt = Math.round(bill.amount * (1 + pct / 100));
    setBills(prev => prev.map(b => b.id === id ? { ...b, amount: newAmt } : b));
    setAdjustId(null);
    try { await fetch(`/api/bills/${id}/update`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: newAmt }) }); setSuccessMsg(`Adjusted ${pct > 0 ? '+' : ''}${pct}%`); setTimeout(() => setSuccessMsg(''), 3000); } catch { setSuccessMsg('Adjusted locally.'); setTimeout(() => setSuccessMsg(''), 3000); }
  }

  function handleCopyBill(id: string, amount: number) {
    navigator.clipboard.writeText(fmt(amount)).catch(() => {});
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
    setMenuId(null);
  }

  async function handleDeleteBill(id: string) {
    setBills(prev => prev.filter(b => b.id !== id));
    setDeleteId(null);
    try { await fetch(`/api/bills/${id}/delete`, { method: 'DELETE' }); setSuccessMsg('Bill deleted.'); setTimeout(() => setSuccessMsg(''), 3000); } catch { setSuccessMsg('Deleted locally.'); setTimeout(() => setSuccessMsg(''), 3000); }
  }

  const pendingTotal = bills.filter(b => b.status === 'Pending' || b.status === 'Approved').reduce((s, b) => s + (b.amount || 0), 0);
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Bills</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Vendor bills and supplier invoices</div>
        </div>
        <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          + New Bill
        </button>
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>New Bill</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div><label style={label}>Invoice # *</label><input type="text" value={form.invoice_num} onChange={e => setForm(p => ({ ...p, invoice_num: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Vendor *</label><input type="text" value={form.vendor} onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Amount ($) *</label><input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} style={inp} /></div>
            <div><label style={label}>Due Date</label><SaguaroDatePicker value={form.due_date} onChange={v => setForm(p => ({ ...p, due_date: v }))} style={inp} /></div>
            <div><label style={label}>CSI Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={inp}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: 'span 3' }}><label style={label}>Description</label><input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Bill'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px 24px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0a1117' }}>
                  {['Invoice #','Vendor','Description','Amount','Due Date','Status','Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bills.map(b => {
                  const overdue = isOverdue(b.due_date, b.status);
                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)', background: overdue ? 'rgba(239,68,68,.05)' : 'transparent' }}>
                      <td style={{ padding: '10px 14px', color: GOLD, fontWeight: 600 }}>{b.invoice_num}</td>
                      <td style={{ padding: '10px 14px', color: TEXT }}>{b.vendor}</td>
                      <td style={{ padding: '10px 14px', color: DIM, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.description}</td>
                      <td style={{ padding: '10px 14px', position: 'relative' as const }}>
                        {deleteId === b.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: RED, fontWeight: 600 }}>Delete bill?</span>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteBill(b.id); }} style={{ padding: '3px 8px', background: 'rgba(239,68,68,.15)', border: `1px solid rgba(239,68,68,.3)`, borderRadius: 5, color: RED, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Yes</button>
                            <button onClick={(e) => { e.stopPropagation(); setDeleteId(null); }} style={{ padding: '3px 8px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 5, color: DIM, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                          </div>
                        ) : editId === b.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input value={editVal} onChange={e => setEditVal(e.target.value)} type="number" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleEditBill(b.id); if (e.key === 'Escape') setEditId(null); }} style={{ width: 100, padding: '4px 8px', background: DARK, border: `1px solid ${GOLD}`, borderRadius: 5, color: TEXT, fontSize: 12, outline: 'none', textAlign: 'right' }} />
                            <button onClick={() => handleEditBill(b.id)} style={{ padding: '3px 8px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 5, color: '#0d1117', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                            <button onClick={() => setEditId(null)} style={{ padding: '3px 8px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 5, color: DIM, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                          </div>
                        ) : adjustId === b.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            {[-10, -5, 5, 10].map(p => (
                              <button key={p} onClick={(e) => { e.stopPropagation(); handleAdjustBill(b.id, p); }} style={{ padding: '3px 7px', background: p > 0 ? 'rgba(61,214,140,.1)' : 'rgba(239,68,68,.1)', border: `1px solid ${p > 0 ? 'rgba(61,214,140,.25)' : 'rgba(239,68,68,.25)'}`, borderRadius: 5, color: p > 0 ? GREEN : RED, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{p > 0 ? '+' : ''}{p}%</button>
                            ))}
                            <button onClick={(e) => { e.stopPropagation(); setAdjustId(null); }} style={{ padding: '3px 6px', background: 'none', border: 'none', color: DIM, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ color: TEXT, fontWeight: 700 }}>{fmt(b.amount)}</span>
                            {copiedId === b.id && <span style={{ fontSize: 10, color: GREEN, fontWeight: 600 }}>Copied!</span>}
                            <button onClick={(e) => { e.stopPropagation(); openBillMenu(b.id); }} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 10, padding: '2px 4px', lineHeight: 1, opacity: 0.6 }} onMouseEnter={e => (e.currentTarget.style.opacity = '1')} onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}>&#9662;</button>
                            {menuId === b.id && (
                              <div style={{ position: 'absolute', top: 36, right: 14, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 4, zIndex: 100, minWidth: 150, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                                {[
                                  { label: 'Edit Amount', icon: '\u270F\uFE0F', action: () => { setMenuId(null); setEditId(b.id); setEditVal(String(b.amount)); } },
                                  { label: 'Adjust %', icon: '\uD83D\uDCCA', action: () => { setMenuId(null); setAdjustId(b.id); } },
                                  { label: 'Copy Amount', icon: '\uD83D\uDCCB', action: () => handleCopyBill(b.id, b.amount) },
                                ].map(item => (
                                  <div key={item.label} onClick={(e) => { e.stopPropagation(); item.action(); }} style={{ padding: '7px 12px', fontSize: 12, color: TEXT, cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }} onMouseEnter={e => (e.currentTarget.style.background = DARK)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                    <span style={{ fontSize: 14 }}>{item.icon}</span>{item.label}
                                  </div>
                                ))}
                                <div style={{ height: 1, background: BORDER, margin: '4px 0' }} />
                                <div onClick={(e) => { e.stopPropagation(); setMenuId(null); setDeleteId(b.id); }} style={{ padding: '7px 12px', fontSize: 12, color: RED, cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,.08)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                  <span style={{ fontSize: 14 }}>{'\uD83D\uDDD1\uFE0F'}</span>Delete Bill
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', color: overdue ? RED : DIM, whiteSpace: 'nowrap' }}>{b.due_date || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{statusBadge(overdue && b.status !== 'Paid' ? 'Overdue' : b.status)}</td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        {b.status === 'Pending' && (
                          <button onClick={() => handleApprove(b.id)} disabled={actionLoading === b.id + '-approve'} style={{ padding: '4px 10px', background: 'rgba(59,130,246,.2)', border: '1px solid rgba(59,130,246,.4)', borderRadius: 5, color: '#60a5fa', fontSize: 12, cursor: 'pointer', marginRight: 6 }}>
                            {actionLoading === b.id + '-approve' ? '...' : 'Approve'}
                          </button>
                        )}
                        {(b.status === 'Pending' || b.status === 'Approved') && (
                          <button onClick={() => handlePay(b.id)} disabled={actionLoading === b.id + '-pay'} style={{ padding: '4px 10px', background: 'rgba(61,214,140,.2)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 5, color: GREEN, fontSize: 12, cursor: 'pointer' }}>
                            {actionLoading === b.id + '-pay' ? '...' : 'Mark Paid'}
                          </button>
                        )}
                        {b.status === 'Paid' && <span style={{ color: GREEN, fontSize: 12 }}>Paid</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {menuId && <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setMenuId(null)} />}
            <div style={{ marginTop: 20, padding: '14px 20px', background: RAISED, borderRadius: 8, display: 'flex', justifyContent: 'flex-end', gap: 40 }}>
              <div style={{ fontSize: 13, color: DIM }}>Bills: <span style={{ color: TEXT, fontWeight: 700 }}>{bills.length}</span></div>
              <div style={{ fontSize: 13, color: DIM }}>Pending + Approved: <span style={{ color: GOLD, fontWeight: 800, fontSize: 15 }}>${pendingTotal.toLocaleString()}</span></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
