'use client';
/**
 * Saguaro Field — Change Orders
 * View, create, approve, and reject change orders from the field. Offline queue.
 */
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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

const STATUS_COLORS: Record<string, string> = { pending: AMBER, approved: GREEN, rejected: RED, draft: DIM };
const STATUS_LABELS: Record<string, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', draft: 'Draft' };

const REASONS = ['Owner Request', 'Field Condition', 'Design Change', 'Regulatory', 'Value Engineering'];

interface ChangeOrder {
  id: string;
  co_number?: number;
  title: string;
  description?: string;
  reason?: string;
  amount: number;
  status: string;
  cost_breakdown?: Array<{ item: string; amount: number }>;
  approval_history?: Array<{ action: string; by: string; date: string; reason?: string }>;
  created_at?: string;
}

type View = 'list' | 'detail' | 'create';

function formatUSD(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function formatDate(d: string | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ChangeOrdersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [cos, setCos] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<ChangeOrder | null>(null);
  const [online, setOnline] = useState(true);
  const [filter, setFilter] = useState('all');
  const [projectName, setProjectName] = useState('');

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newReason, setNewReason] = useState('Owner Request');
  const [newAmount, setNewAmount] = useState('');
  const [saving, setSaving] = useState(false);

  // Approve / Reject
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    fetch('/api/projects/list')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId); if (p) setProjectName(p.name); })
      .catch(() => {});
    loadCOs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadCOs = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/change-orders`);
      const d = await r.json();
      setCos(d.change_orders || d.items || d.data || []);
    } catch { /* offline */ }
    setLoading(false);
  };

  const openDetail = (co: ChangeOrder) => {
    setSelected(co);
    setView('detail');
    setRejectReason('');
    setActionMsg('');
  };

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/change-orders/${selected.id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed');
      setActionMsg('Change order approved');
    } catch {
      await enqueue({
        url: `/api/change-orders/${selected.id}/approve`,
        method: 'PUT',
        body: JSON.stringify({}),
        contentType: 'application/json',
        isFormData: false,
      });
      setActionMsg('Approval queued — will sync when online');
    }
    // Optimistic update
    const updated = { ...selected, status: 'approved', approval_history: [...(selected.approval_history || []), { action: 'approved', by: 'You (field)', date: new Date().toISOString() }] };
    setSelected(updated);
    setCos((prev) => prev.map((c) => c.id === selected.id ? updated : c));
    setActionLoading(false);
    setTimeout(() => setActionMsg(''), 3500);
  };

  const handleReject = async () => {
    if (!selected || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/change-orders/${selected.id}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (!res.ok) throw new Error('Failed');
      setActionMsg('Change order rejected');
    } catch {
      await enqueue({
        url: `/api/change-orders/${selected.id}/reject`,
        method: 'PUT',
        body: JSON.stringify({ reason: rejectReason.trim() }),
        contentType: 'application/json',
        isFormData: false,
      });
      setActionMsg('Rejection queued — will sync when online');
    }
    const updated = { ...selected, status: 'rejected', approval_history: [...(selected.approval_history || []), { action: 'rejected', by: 'You (field)', date: new Date().toISOString(), reason: rejectReason.trim() }] };
    setSelected(updated);
    setCos((prev) => prev.map((c) => c.id === selected.id ? updated : c));
    setRejectReason('');
    setActionLoading(false);
    setTimeout(() => setActionMsg(''), 3500);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newAmount) return;
    setSaving(true);

    const payload = {
      projectId,
      title: newTitle.trim(),
      description: newDesc.trim(),
      reason: newReason,
      amount: parseFloat(newAmount),
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/change-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json().catch(() => ({}));
      const newCO: ChangeOrder = {
        id: data.id || `temp-${Date.now()}`,
        co_number: (cos.length + 1),
        title: newTitle.trim(),
        description: newDesc.trim(),
        reason: newReason,
        amount: parseFloat(newAmount),
        status: 'pending',
        created_at: new Date().toISOString(),
        approval_history: [],
      };
      setCos((prev) => [newCO, ...prev]);
    } catch {
      await enqueue({
        url: '/api/change-orders',
        method: 'POST',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
      const newCO: ChangeOrder = {
        id: `queued-${Date.now()}`,
        co_number: (cos.length + 1),
        title: newTitle.trim(),
        description: newDesc.trim(),
        reason: newReason,
        amount: parseFloat(newAmount),
        status: 'pending',
        created_at: new Date().toISOString(),
        approval_history: [],
      };
      setCos((prev) => [newCO, ...prev]);
    }

    setNewTitle('');
    setNewDesc('');
    setNewReason('Owner Request');
    setNewAmount('');
    setSaving(false);
    setView('list');
  };

  const filtered = filter === 'all' ? cos : cos.filter((c) => c.status === filter);
  const totalValue = cos.reduce((sum, c) => sum + (c.amount || 0), 0);
  const approvedValue = cos.filter((c) => c.status === 'approved').reduce((sum, c) => sum + (c.amount || 0), 0);
  const pendingCount = cos.filter((c) => c.status === 'pending').length;

  // ─── LIST VIEW ────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div style={{ padding: '18px 16px' }}>
        <button onClick={() => router.back()} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Change Orders</h1>
            <p style={{ margin: 0, fontSize: 13, color: DIM }}>{projectName}</p>
          </div>
          <button onClick={() => setView('create')} style={{
            background: GOLD, border: 'none', borderRadius: 10, padding: '10px 16px',
            color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
          }}>
            + New CO
          </button>
        </div>

        {!online && <OfflineBanner />}

        {/* Stats */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto' }}>
          <StatCard label="Total Value" value={formatUSD(totalValue)} color={GOLD} />
          <StatCard label="Approved" value={formatUSD(approvedValue)} color={GREEN} />
          <StatCard label="Pending" value={String(pendingCount)} color={AMBER} />
          <StatCard label="Total COs" value={String(cos.length)} color={BLUE} />
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
          {['all', 'pending', 'approved', 'rejected', 'draft'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ flexShrink: 0, background: filter === f ? 'rgba(212,160,23,.2)' : 'transparent', border: `1px solid ${filter === f ? GOLD : BORDER}`, borderRadius: 20, padding: '5px 12px', color: filter === f ? GOLD : DIM, fontSize: 12, fontWeight: filter === f ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {f === 'all' ? 'All' : STATUS_LABELS[f] || f}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading change orders...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
            <div style={{ marginBottom: 8, color: GOLD, display: 'flex', justifyContent: 'center', opacity: 0.6 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1={12} y1={18} x2={12} y2={12}/><line x1={9} y1={15} x2={15} y2={15}/>
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 14 }}>{filter === 'all' ? 'No change orders yet. Tap "+ New CO" to create one.' : 'No change orders match this filter.'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((co) => {
              const sc = STATUS_COLORS[co.status] || DIM;
              return (
                <button
                  key={co.id}
                  onClick={() => openDetail(co)}
                  style={{
                    background: RAISED, border: `1px solid ${BORDER}`,
                    borderRadius: 14, padding: '14px', textAlign: 'left', width: '100%', cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {co.co_number != null && (
                          <span style={{ fontSize: 11, fontWeight: 800, color: GOLD, background: 'rgba(212,160,23,.12)', padding: '2px 8px', borderRadius: 6 }}>
                            CO-{co.co_number}
                          </span>
                        )}
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          background: `rgba(${hexRgb(sc)},.12)`,
                          color: sc,
                        }}>
                          {STATUS_LABELS[co.status] || co.status}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>{co.title}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: co.amount >= 0 ? GREEN : RED }}>{formatUSD(co.amount)}</span>
                        {co.reason && <span style={{ fontSize: 11, color: DIM }}>{co.reason}</span>}
                      </div>
                    </div>
                    <span style={{ color: DIM, fontSize: 18, flexShrink: 0, marginTop: 4 }}>›</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── DETAIL VIEW ──────────────────────────────────────────────
  if (view === 'detail' && selected) {
    const sc = STATUS_COLORS[selected.status] || DIM;
    return (
      <div style={{ padding: '18px 16px' }}>
        <button onClick={() => { setView('list'); setActionMsg(''); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {selected.co_number != null && (
            <span style={{ fontSize: 12, fontWeight: 800, color: GOLD, background: 'rgba(212,160,23,.12)', padding: '3px 10px', borderRadius: 6 }}>
              CO-{selected.co_number}
            </span>
          )}
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
            background: `rgba(${hexRgb(sc)},.12)`,
            color: sc,
          }}>
            {STATUS_LABELS[selected.status] || selected.status}
          </span>
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: TEXT }}>{selected.title}</h1>
        <p style={{ margin: '0 0 6px', fontSize: 12, color: DIM }}>
          {selected.reason ? `Reason: ${selected.reason}` : ''}
          {selected.created_at ? ` · Created ${formatDate(selected.created_at)}` : ''}
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 24, fontWeight: 800, color: selected.amount >= 0 ? GREEN : RED }}>{formatUSD(selected.amount)}</p>

        {actionMsg && (
          <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: GREEN, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg>{actionMsg}
          </div>
        )}

        {!online && <OfflineBanner />}

        {/* Description */}
        {selected.description && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
            <p style={secLbl}>Description</p>
            <p style={{ margin: 0, fontSize: 14, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selected.description}</p>
          </div>
        )}

        {/* Cost Breakdown */}
        {selected.cost_breakdown && selected.cost_breakdown.length > 0 && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
            <p style={secLbl}>Cost Breakdown</p>
            {selected.cost_breakdown.map((line, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                <span style={{ fontSize: 14, color: TEXT }}>{line.item}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{formatUSD(line.amount)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: `1px solid ${GOLD}`, marginTop: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>Total</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>{formatUSD(selected.amount)}</span>
            </div>
          </div>
        )}

        {/* Approval History */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
          <p style={secLbl}>Approval History ({selected.approval_history?.length || 0})</p>
          {(!selected.approval_history || selected.approval_history.length === 0) ? (
            <p style={{ margin: 0, fontSize: 13, color: DIM, fontStyle: 'italic' }}>No approval actions yet</p>
          ) : (
            selected.approval_history.map((entry, i) => (
              <div key={i} style={{ padding: '10px 0', borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: entry.action === 'approved' ? GREEN : entry.action === 'rejected' ? RED : GOLD }}>{entry.action.charAt(0).toUpperCase() + entry.action.slice(1)}</span>
                  <span style={{ fontSize: 11, color: DIM }}>{formatDate(entry.date)}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: TEXT }}>by {entry.by}</p>
                {entry.reason && <p style={{ margin: '4px 0 0', fontSize: 13, color: DIM, fontStyle: 'italic' }}>Reason: {entry.reason}</p>}
              </div>
            ))
          )}
        </div>

        {/* Approval Actions */}
        {selected.status === 'pending' && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
            <p style={secLbl}>Actions</p>
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              style={{
                width: '100%', background: actionLoading ? '#1E3A5F' : GREEN, border: 'none', borderRadius: 12,
                padding: '16px', color: actionLoading ? DIM : '#000', fontSize: 16, fontWeight: 800,
                cursor: actionLoading ? 'wait' : 'pointer', marginBottom: 10,
              }}
            >
              {actionLoading ? 'Processing...' : 'Approve Change Order'}
            </button>

            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Rejection Reason</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Provide a reason for rejecting this change order..."
                rows={3}
                style={inp}
              />
            </div>
            <button
              onClick={handleReject}
              disabled={actionLoading || !rejectReason.trim()}
              style={{
                width: '100%', background: actionLoading || !rejectReason.trim() ? '#1E3A5F' : RED, border: 'none', borderRadius: 12,
                padding: '16px', color: actionLoading || !rejectReason.trim() ? DIM : '#fff', fontSize: 16, fontWeight: 800,
                cursor: actionLoading || !rejectReason.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              Reject Change Order
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── CREATE VIEW ──────────────────────────────────────────────
  return (
    <div style={{ padding: '18px 16px' }}>
      <button onClick={() => setView('list')} style={backBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
          <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: GOLD }}>New Change Order</h1>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: DIM }}>Submit a change order for this project</p>

      {!online && <OfflineBanner />}

      <form onSubmit={handleCreate}>
        <div style={card}>
          <p style={secLbl}>Change Order Details</p>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Title *</label>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Brief CO title" style={inp} required />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Description</label>
            <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Describe the change order scope, impact, and justification..." rows={4} style={inp} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Reason *</label>
              <select value={newReason} onChange={(e) => setNewReason(e.target.value)} style={inp}>
                {REASONS.map((r) => <option key={r} value={r} style={{ background: '#0D1D2E' }}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Amount (USD) *</label>
              <input
                type="number"
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0.00"
                style={inp}
                required
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setView('list')} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px', color: DIM, fontSize: 15, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving} style={{ flex: 2, background: saving ? '#1E3A5F' : GOLD, border: 'none', borderRadius: 12, padding: '16px', color: saving ? DIM : '#000', fontSize: 15, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Saving...' : online ? 'Submit Change Order' : 'Submit (Offline — will sync)'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function FieldChangeOrdersPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <ChangeOrdersPage />
    </Suspense>
  );
}

// Shared helpers
function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', flex: '1 0 auto', minWidth: 100 }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 800, color }}>{value}</p>
    </div>
  );
}

function OfflineBanner() {
  return <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: RED, fontWeight: 600 }}>Offline — will sync when reconnected</div>;
}

const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 14px 6px', marginBottom: 12 };
const secLbl: React.CSSProperties = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: DIM, marginBottom: 4, fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '11px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: '8px', marginLeft: -8, display: 'flex', alignItems: 'center', marginBottom: 4 };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
