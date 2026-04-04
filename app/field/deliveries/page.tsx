'use client';
/**
 * Saguaro Field — Delivery Tracking
 * List deliveries, add new, mark arrived. Offline queue.
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD = '#C8960F';
const CARD = '#F8F9FB';
const BASE = '#F8F9FB';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const GREEN = '#22C55E';
const BLUE = '#3B82F6';
const RED = '#EF4444';
const BORDER = '#1E3A5F';

function hr(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  in_transit: { color: BLUE, label: 'In Transit', icon: '\u{1F69A}' },
  arriving_soon: { color: GOLD, label: 'Arriving Soon', icon: '\u{23F0}' },
  delivered: { color: GREEN, label: 'Delivered', icon: '\u{2705}' },
  delayed: { color: RED, label: 'Delayed', icon: '\u{26A0}\u{FE0F}' },
};

interface Delivery {
  id: string;
  project_id: string;
  description: string;
  carrier: string;
  tracking_number?: string;
  eta?: string;
  status: string;
  contact_phone?: string;
  actual_arrival?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

type View = 'list' | 'add';

const glass: React.CSSProperties = {
  background: 'rgba(26,31,46,0.7)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid #EEF0F3',
  borderRadius: 16,
};

const inp: React.CSSProperties = {
  width: '100%', background: BASE, border: `1px solid ${BORDER}`,
  borderRadius: 10, padding: '11px 14px', color: TEXT, fontSize: 15, outline: 'none',
  boxSizing: 'border-box',
};

function DeliveriesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const paramProjectId = searchParams.get('projectId') || '';
  const [projectId, setProjectId] = useState(paramProjectId);

  const [view, setView] = useState<View>('list');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [markingId, setMarkingId] = useState<string | null>(null);

  // Form fields
  const [formDesc, setFormDesc] = useState('');
  const [formCarrier, setFormCarrier] = useState('');
  const [formTracking, setFormTracking] = useState('');
  const [formEta, setFormEta] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Pull to refresh
  const [touchStart, setTouchStart] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('sag_active_project') : null;
    if (!projectId && stored) setProjectId(stored);
  }, [projectId]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  const fetchDeliveries = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/field/delivery-tracking?projectId=${projectId}`);
      if (res.ok) {
        const d = await res.json();
        setDeliveries(d.deliveries || d.data || []);
      }
    } catch { /* offline */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  const resetForm = () => {
    setFormDesc('');
    setFormCarrier('');
    setFormTracking('');
    setFormEta('');
    setFormPhone('');
    setFormNotes('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDesc.trim() || !formCarrier.trim()) return;
    setSaving(true);

    const payload = {
      projectId,
      description: formDesc.trim(),
      carrier: formCarrier.trim(),
      tracking_number: formTracking.trim(),
      eta: formEta || null,
      contact_phone: formPhone.trim(),
      notes: formNotes.trim(),
      status: 'in_transit',
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/field/delivery-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      const d = await res.json();
      setDeliveries(prev => [d.delivery || { id: `local-${Date.now()}`, ...payload, project_id: projectId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev]);
    } catch {
      await enqueue({
        url: '/api/field/delivery-tracking',
        method: 'POST',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
      setDeliveries(prev => [{
        id: `local-${Date.now()}`, project_id: projectId, ...payload,
        tracking_number: payload.tracking_number || undefined,
        eta: payload.eta || undefined,
        contact_phone: payload.contact_phone || undefined,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      } as Delivery, ...prev]);
    }

    resetForm();
    setView('list');
    setSaving(false);
  };

  const markArrived = async (delivery: Delivery) => {
    setMarkingId(delivery.id);
    const now = new Date().toISOString();
    const payload = {
      id: delivery.id,
      projectId,
      status: 'delivered',
      actual_arrival: now,
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/field/delivery-tracking', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      await enqueue({
        url: '/api/field/delivery-tracking',
        method: 'PUT',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
    }

    setDeliveries(prev => prev.map(d => d.id === delivery.id ? { ...d, status: 'delivered', actual_arrival: now, updated_at: now } : d));
    setMarkingId(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDeliveries();
    setRefreshing(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientY);
  const handleTouchMove = (e: React.TouchEvent) => {
    const diff = e.touches[0].clientY - touchStart;
    if (diff > 0 && diff < 120) setPullDistance(diff);
  };
  const handleTouchEnd = () => {
    if (pullDistance > 60) handleRefresh();
    setPullDistance(0);
    setTouchStart(0);
  };

  const filteredDeliveries = filterStatus === 'all' ? deliveries : deliveries.filter(d => d.status === filterStatus);

  const pendingCount = deliveries.filter(d => d.status !== 'delivered').length;

  function formatEta(eta?: string): string {
    if (!eta) return '';
    const d = new Date(eta);
    const now = new Date();
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <div
      style={{ padding: '18px 16px', minHeight: '100%' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {pullDistance > 10 && (
        <div style={{ textAlign: 'center', padding: '8px 0', color: DIM, fontSize: 12, opacity: pullDistance > 30 ? 1 : 0.5 }}>
          {pullDistance > 60 ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}
      {refreshing && <div style={{ textAlign: 'center', padding: '8px 0', color: GOLD, fontSize: 12 }}>Refreshing...</div>}

      <button onClick={() => view === 'add' ? setView('list') : router.back()} style={{ background: 'none', border: 'none', color: DIM, fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
        {view === 'add' ? 'Deliveries' : 'Back'}
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Deliveries</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: DIM }}>
            {deliveries.length} total &middot; {pendingCount} pending
          </p>
        </div>
        {view === 'list' && (
          <button onClick={() => setView('add')} style={{ background: GOLD, border: 'none', borderRadius: 10, padding: '10px 16px', color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            + Add
          </button>
        )}
      </div>

      {!online && <div style={{ ...glass, padding: '8px 14px', marginBottom: 14, fontSize: 13, color: RED, fontWeight: 600, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>Offline — changes will sync when reconnected</div>}

      {/* ── LIST ── */}
      {view === 'list' && (
        <>
          {/* Filter bar */}
          {deliveries.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
              <button onClick={() => setFilterStatus('all')} style={{ ...glass, padding: '6px 12px', fontSize: 12, fontWeight: filterStatus === 'all' ? 700 : 400, color: filterStatus === 'all' ? GOLD : DIM, cursor: 'pointer', whiteSpace: 'nowrap', background: filterStatus === 'all' ? `rgba(${hr(GOLD)},0.15)` : 'rgba(26,31,46,0.7)' }}>
                All ({deliveries.length})
              </button>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const count = deliveries.filter(d => d.status === key).length;
                if (count === 0) return null;
                return (
                  <button key={key} onClick={() => setFilterStatus(key)} style={{ ...glass, padding: '6px 12px', fontSize: 12, fontWeight: filterStatus === key ? 700 : 400, color: filterStatus === key ? cfg.color : DIM, cursor: 'pointer', whiteSpace: 'nowrap', background: filterStatus === key ? `rgba(${hr(cfg.color)},0.15)` : 'rgba(26,31,46,0.7)' }}>
                    {cfg.icon} {cfg.label} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ ...glass, padding: 16, height: 100, animation: 'pulse 1.5s ease-in-out infinite' }}>
                  <div style={{ background: '#F3F4F6', borderRadius: 8, height: 16, width: '60%', marginBottom: 8 }} />
                  <div style={{ background: '#F8F9FB', borderRadius: 8, height: 12, width: '40%', marginBottom: 8 }} />
                  <div style={{ background: '#FAFBFC', borderRadius: 8, height: 10, width: '30%' }} />
                </div>
              ))}
            </div>
          ) : filteredDeliveries.length === 0 ? (
            <div style={{ ...glass, padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{'\u{1F4E6}'}</div>
              <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: TEXT }}>
                {deliveries.length === 0 ? 'No Deliveries Tracked' : 'No Matching Deliveries'}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: DIM }}>
                {deliveries.length === 0 ? 'Tap "+ Add" to log an incoming delivery.' : 'Try a different filter.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredDeliveries.map(delivery => {
                const sCfg = STATUS_CONFIG[delivery.status] || STATUS_CONFIG.in_transit;
                const etaStr = formatEta(delivery.eta);
                const isOverdue = delivery.eta && new Date(delivery.eta) < new Date() && delivery.status !== 'delivered';

                return (
                  <div key={delivery.id} style={{
                    ...glass, padding: 14,
                    border: isOverdue ? `1px solid rgba(${hr(RED)},0.3)` : '1px solid #EEF0F3',
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {delivery.description}
                        </p>
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: DIM }}>
                          {delivery.carrier}
                          {delivery.tracking_number ? ` \u00B7 #${delivery.tracking_number}` : ''}
                        </p>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: sCfg.color,
                        background: `rgba(${hr(sCfg.color)},0.12)`,
                        padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap', marginLeft: 8,
                      }}>
                        {sCfg.icon} {sCfg.label}
                      </span>
                    </div>

                    {/* ETA row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 12, color: DIM }}>
                        {delivery.status === 'delivered' && delivery.actual_arrival ? (
                          <span style={{ color: GREEN }}>
                            Arrived: {new Date(delivery.actual_arrival).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </span>
                        ) : etaStr ? (
                          <span style={{ color: isOverdue ? RED : DIM }}>
                            ETA: {etaStr}
                          </span>
                        ) : null}
                        {delivery.contact_phone && (
                          <span style={{ marginLeft: 8 }}>
                            {'\u{1F4DE}'} {delivery.contact_phone}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Mark Arrived button */}
                    {delivery.status !== 'delivered' && (
                      <button
                        onClick={() => markArrived(delivery)}
                        disabled={markingId === delivery.id}
                        style={{
                          width: '100%', marginTop: 10,
                          background: markingId === delivery.id ? '#F3F4F6' : `rgba(${hr(GREEN)},0.1)`,
                          border: `1px solid ${markingId === delivery.id ? BORDER : `rgba(${hr(GREEN)},0.3)`}`,
                          borderRadius: 10, padding: '10px', cursor: markingId === delivery.id ? 'wait' : 'pointer',
                          color: markingId === delivery.id ? DIM : GREEN, fontSize: 13, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        {markingId === delivery.id ? 'Updating...' : `${'\u{2705}'} Mark Arrived`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── ADD FORM ── */}
      {view === 'add' && (
        <form onSubmit={submit}>
          <div style={{ ...glass, padding: '14px 14px 6px', marginBottom: 12 }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Delivery Info</p>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Description *</label>
              <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder='e.g. Steel beams, 4" PVC pipe, Cabinets' style={inp} required />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Carrier *</label>
              <input value={formCarrier} onChange={e => setFormCarrier(e.target.value)} placeholder="e.g. FedEx, UPS, Direct from vendor" style={inp} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Tracking #</label>
                <input value={formTracking} onChange={e => setFormTracking(e.target.value)} placeholder="Optional" style={inp} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>ETA</label>
                <input type="date" value={formEta} onChange={e => setFormEta(e.target.value)} style={{ ...inp, colorScheme: 'dark' }} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Contact Phone</label>
              <input type="tel" value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="Driver or vendor phone" style={inp} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Notes</label>
              <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Special instructions, staging area, etc..." rows={2} style={inp} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => { resetForm(); setView('list'); }} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px', color: DIM, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ flex: 2, background: saving ? BORDER : GOLD, border: 'none', borderRadius: 12, padding: '16px', color: saving ? DIM : '#000', fontSize: 15, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving...' : 'Add Delivery'}
            </button>
          </div>
        </form>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

export default function FieldDeliveriesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <DeliveriesPage />
    </Suspense>
  );
}
