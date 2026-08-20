'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';

const DARK = '#0d1117', RAISED = '#161b22', BORDER = '#30363d', TEXT = '#F0F4FF';
const DIM = '#8B9DB8', GOLD = '#C8960F', GREEN = '#2ea043', RED = '#f85149', AMBER = '#e3b341';

interface Transmittal {
  id: string; transmittal_number: string; transmittal_date: string;
  sent_to_name: string; sent_to_company: string; sent_to_email: string | null;
  subject: string; purpose: string; description: string | null;
  items: Array<{ description: string; copies: number; format: string; remarks: string; quantity?: string }>;
  total_items: number; response_required: boolean; response_due_date: string | null;
  response_received_at: string | null;
  response_status: string | null; status: string; sent_at: string | null;
}

const purposeLabels: Record<string, string> = {
  for_review: 'For Review', for_approval: 'For Approval', for_information: 'For Information',
  for_record: 'For Record', for_construction: 'For Construction', resubmittal: 'Resubmittal',
  resubmission: 'Resubmission', as_requested: 'As Requested',
};

function fmtDate(d: string | null): string {
  if (!d) return '\u2014';
  return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function responseBadge(t: Transmittal): { label: string; color: string; bg: string } {
  if (!t.response_required) return { label: 'N/A', color: DIM, bg: 'rgba(139,157,184,.1)' };
  if (t.response_received_at) return { label: 'Received', color: GREEN, bg: 'rgba(46,160,67,.15)' };
  if (t.response_due_date) {
    const today = new Date().toISOString().split('T')[0];
    if (t.response_due_date < today) return { label: 'Overdue', color: RED, bg: 'rgba(248,81,73,.15)' };
    return { label: 'Pending', color: AMBER, bg: 'rgba(227,179,65,.15)' };
  }
  return { label: 'Pending', color: AMBER, bg: 'rgba(227,179,65,.15)' };
}

export default function TransmittalsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [transmittals, setTransmittals] = useState<Transmittal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    sent_to_name: '', sent_to_company: '', sent_to_email: '', subject: '',
    purpose: 'for_review', description: '', response_due_date: '',
    items: [{ description: '', copies: 1, format: 'PDF', remarks: '' }],
  });

  const fetchTransmittals = useCallback(async () => {
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/transmittals/${projectId}`, { headers: h });
      const j = await r.json();
      if (r.ok) setTransmittals(j.transmittals || j.data || []);
    } catch { /* network */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchTransmittals(); }, [fetchTransmittals]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  const handleCreate = async () => {
    if (!form.sent_to_name || !form.subject) return;
    setSaving(true);
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/transmittals/${projectId}`, {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, items: form.items.filter(i => i.description) }),
      });
      if (r.ok) {
        setShowNew(false);
        setForm({ sent_to_name: '', sent_to_company: '', sent_to_email: '', subject: '', purpose: 'for_review', description: '', response_due_date: '', items: [{ description: '', copies: 1, format: 'PDF', remarks: '' }] });
        setToast({ msg: 'Transmittal created', ok: true });
        fetchTransmittals();
      } else { const e = await r.json(); setToast({ msg: e.error || 'Failed', ok: false }); }
    } catch { setToast({ msg: 'Network error', ok: false }); }
    setSaving(false);
  };

  const addItem = () => setForm(p => ({ ...p, items: [...p.items, { description: '', copies: 1, format: 'PDF', remarks: '' }] }));
  const updateItem = (idx: number, field: string, value: string | number) => {
    setForm(p => {
      const items = [...p.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...p, items };
    });
  };

  const pendingResponse = transmittals.filter(t => t.response_required && !t.response_received_at).length;
  const overdueResponse = transmittals.filter(t => {
    if (!t.response_required || t.response_received_at) return false;
    const today = new Date().toISOString().split('T')[0];
    return t.response_due_date && t.response_due_date < today;
  }).length;

  if (loading) return <div style={{ padding: 32, color: DIM, background: DARK, minHeight: '100vh' }}>Loading transmittals...</div>;

  return (
    <div style={{ background: DARK, minHeight: '100vh', color: TEXT }}>
      {toast && <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 999, padding: '12px 24px', borderRadius: 8, background: toast.ok ? '#1a3a2a' : '#3a1a1a', border: `1px solid ${toast.ok ? GREEN : RED}`, color: TEXT, fontSize: 14 }}>{toast.msg}</div>}

      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Transmittals</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Document transmittals and response tracking</div>
        </div>
        <button onClick={() => setShowNew(true)} style={{ padding: '8px 16px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`, border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ New Transmittal</button>
      </div>

      {/* Stats */}
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Total', value: transmittals.length, color: TEXT },
          { label: 'Pending Response', value: pendingResponse, color: pendingResponse > 0 ? AMBER : DIM },
          { label: 'Overdue', value: overdueResponse, color: overdueResponse > 0 ? RED : DIM },
        ].map(s => (
          <div key={s.label} style={{ background: RAISED, borderRadius: 8, padding: '12px 20px', border: `1px solid ${BORDER}`, textAlign: 'center', minWidth: 90, flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 24px 40px' }}>
        {transmittals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: DIM, fontSize: 13 }}>No transmittals created yet. Create one to start tracking document deliveries.</div>
        ) : (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {['#', 'Date', 'To', 'Subject', 'Purpose', 'Items', 'Status', 'Response'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transmittals.map(t => {
                  const rb = responseBadge(t);
                  return (
                    <React.Fragment key={t.id}>
                      <tr onClick={() => setExpanded(expanded === t.id ? null : t.id)} style={{ borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', background: expanded === t.id ? 'rgba(200,150,15,0.05)' : 'transparent' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: GOLD, fontSize: 13 }}>{t.transmittal_number}</td>
                        <td style={{ padding: '12px 14px', fontSize: 12, color: DIM, whiteSpace: 'nowrap' }}>{fmtDate(t.transmittal_date)}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13 }}>
                          <div style={{ color: TEXT }}>{t.sent_to_name}</div>
                          {t.sent_to_company && <div style={{ fontSize: 11, color: DIM }}>{t.sent_to_company}</div>}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: TEXT, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</td>
                        <td style={{ padding: '12px 14px', fontSize: 12 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: 'rgba(200,150,15,.15)', color: GOLD }}>
                            {purposeLabels[t.purpose] || t.purpose}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 12, color: DIM, textAlign: 'center' }}>{t.total_items}</td>
                        <td style={{ padding: '12px 14px', fontSize: 12 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: t.status === 'sent' ? 'rgba(46,160,67,.15)' : 'rgba(139,157,184,.1)', color: t.status === 'sent' ? GREEN : DIM }}>
                            {t.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: rb.bg, color: rb.color }}>
                            {rb.label}
                          </span>
                        </td>
                      </tr>
                      {expanded === t.id && (
                        <tr>
                          <td colSpan={8} style={{ padding: '12px 24px 16px', background: 'rgba(13,17,23,0.5)' }}>
                            {t.description && <div style={{ fontSize: 12, color: DIM, marginBottom: 8 }}><span style={{ fontWeight: 600 }}>Description:</span> {t.description}</div>}
                            {t.sent_to_email && <div style={{ fontSize: 12, color: DIM, marginBottom: 8 }}><span style={{ fontWeight: 600 }}>Email:</span> {t.sent_to_email}</div>}
                            {t.response_due_date && <div style={{ fontSize: 12, color: AMBER, marginBottom: 8 }}><span style={{ fontWeight: 600 }}>Response due:</span> {fmtDate(t.response_due_date)}</div>}
                            {t.response_received_at && <div style={{ fontSize: 12, color: GREEN, marginBottom: 8 }}><span style={{ fontWeight: 600 }}>Response received:</span> {fmtDate(t.response_received_at)}</div>}
                            <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 6, letterSpacing: 1 }}>ITEMS ({t.total_items})</div>
                            {(t.items || []).length > 0 ? (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr>{['#', 'Description', 'Qty/Copies', 'Format', 'Remarks'].map(h => (
                                    <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: DIM, fontWeight: 600, borderBottom: `1px solid ${BORDER}`, fontSize: 10 }}>{h}</th>
                                  ))}</tr>
                                </thead>
                                <tbody>
                                  {(t.items || []).map((item, idx) => (
                                    <tr key={idx} style={{ borderBottom: `1px solid rgba(48,54,61,0.3)` }}>
                                      <td style={{ padding: '4px 8px', color: DIM }}>{idx + 1}</td>
                                      <td style={{ padding: '4px 8px', color: TEXT }}>{item.description}</td>
                                      <td style={{ padding: '4px 8px', color: DIM }}>{item.quantity || item.copies || 1}</td>
                                      <td style={{ padding: '4px 8px', color: DIM }}>{item.format || '\u2014'}</td>
                                      <td style={{ padding: '4px 8px', color: DIM }}>{item.remarks || '\u2014'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div style={{ color: DIM, fontSize: 12 }}>No items listed</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Transmittal Modal */}
      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 32, width: 560, maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>New Transmittal</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'To Name *', key: 'sent_to_name' }, { label: 'To Company *', key: 'sent_to_company' },
                { label: 'To Email', key: 'sent_to_email' }, { label: 'Response Due', key: 'response_due_date', type: 'date' },
                { label: 'Subject *', key: 'subject', span: 2 }, { label: 'Description', key: 'description', span: 2 },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: (f as { span?: number }).span === 2 ? '1 / -1' : undefined }}>
                  <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input type={f.type || 'text'} value={(form as unknown as Record<string, string>)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, padding: '10px 12px', fontSize: 14 }}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>Purpose</label>
                <select value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))}
                  style={{ width: '100%', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, padding: '10px 12px', fontSize: 14 }}>
                  {Object.entries(purposeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 8 }}>ITEMS</div>
              {form.items.map((item, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px', gap: 8, marginBottom: 8 }}>
                  <input placeholder="Description" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                    style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, padding: '8px 10px', fontSize: 13 }} />
                  <input type="number" value={item.copies} onChange={e => updateItem(idx, 'copies', parseInt(e.target.value) || 1)} min={1}
                    style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, padding: '8px 10px', fontSize: 13, textAlign: 'center' }} />
                  <input value={item.format} onChange={e => updateItem(idx, 'format', e.target.value)}
                    style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, padding: '8px 10px', fontSize: 13 }} />
                </div>
              ))}
              <button onClick={addItem} style={{ background: 'transparent', border: `1px dashed ${BORDER}`, borderRadius: 6, color: DIM, padding: '6px 12px', cursor: 'pointer', fontSize: 12, width: '100%' }}>+ Add Item</button>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNew(false)} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, padding: '10px 20px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.sent_to_name || !form.subject} style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Creating...' : 'Create Transmittal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
