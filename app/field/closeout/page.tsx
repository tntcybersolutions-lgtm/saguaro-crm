'use client';
/**
 * Saguaro Field — Project Closeout Tracking
 * Track warranties, O&M manuals, as-builts, attic stock, training,
 * certificates, LEED docs, closeout photos. Full status workflow,
 * progress dashboard, warranty expiration countdown, bulk operations.
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

/* ── constants ────────────────────────────────────────────────────── */

const ITEM_TYPES = [
  'warranty', 'om_manual', 'as_built', 'attic_stock', 'spare_parts',
  'training', 'certificate', 'leed_doc', 'closeout_photo', 'other',
] as const;

const TYPE_LABELS: Record<string, string> = {
  warranty: 'Warranty', om_manual: 'O&M Manual', as_built: 'As-Built',
  attic_stock: 'Attic Stock', spare_parts: 'Spare Parts', training: 'Training',
  certificate: 'Certificate', leed_doc: 'LEED Doc', closeout_photo: 'Closeout Photo',
  other: 'Other',
};

const TABS: { key: string; label: string; types: string[] }[] = [
  { key: 'all', label: 'All', types: [] },
  { key: 'warranty', label: 'Warranties', types: ['warranty'] },
  { key: 'om_manual', label: 'O&M Manuals', types: ['om_manual'] },
  { key: 'as_built', label: 'As-Builts', types: ['as_built'] },
  { key: 'attic_stock', label: 'Attic Stock', types: ['attic_stock', 'spare_parts'] },
  { key: 'training', label: 'Training', types: ['training'] },
  { key: 'certificate', label: 'Certificates', types: ['certificate'] },
];

const STATUSES = ['pending', 'submitted', 'under_review', 'accepted', 'rejected', 'na'] as const;
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', submitted: 'Submitted', under_review: 'Under Review',
  accepted: 'Accepted', rejected: 'Rejected', na: 'N/A',
};
const STATUS_COLORS: Record<string, string> = {
  pending: DIM, submitted: BLUE, under_review: AMBER, accepted: GREEN, rejected: RED, na: '#6B7280',
};

const TRADES = [
  'General Contractor', 'Concrete', 'Framing / Carpentry', 'Roofing',
  'Electrical', 'Plumbing', 'HVAC', 'Drywall', 'Painting', 'Flooring',
  'Tile', 'Fire Protection', 'Landscaping', 'Elevator', 'Steel', 'Glazing',
  'Insulation', 'Waterproofing', 'Other',
];

/* ── interface ────────────────────────────────────────────────────── */

interface CloseoutItem {
  id: string;
  item_type: string;
  title: string;
  description: string;
  trade: string;
  responsible_party: string;
  due_date: string;
  received_date: string;
  status: string;
  warranty_start: string;
  warranty_end: string;
  warranty_duration: string;
  manufacturer: string;
  file_url: string;
  file_name: string;
  notes: string;
  reviewed_by: string;
  reviewed_at: string;
  created_at?: string;
}

/* ── helpers ──────────────────────────────────────────────────────── */

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function fmtDate(d: string): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusBadge(status: string): React.CSSProperties {
  return {
    display: 'inline-block', padding: '2px 10px', borderRadius: 12,
    fontSize: 12, fontWeight: 600, color: '#fff',
    background: STATUS_COLORS[status] || DIM,
  };
}

async function api(url: string, opts?: RequestInit) {
  if (navigator.onLine) {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  }
  if (opts?.method && opts.method !== 'GET') {
    await enqueue({ url, method: opts.method, body: opts.body as string | null, contentType: 'application/json', isFormData: false });
    return null;
  }
  throw new Error('Offline — data unavailable');
}

/* ── inner component ─────────────────────────────────────────────── */

function CloseoutInner() {
  const projectId = useSearchParams().get('projectId') || '';
  const base = `/api/projects/${projectId}/closeout`;

  const [items, setItems] = useState<CloseoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'create' | 'detail' | 'dashboard' | 'checklist' | 'trades'>('list');
  const [activeTab, setActiveTab] = useState('all');
  const [selected, setSelected] = useState<CloseoutItem | null>(null);
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('submitted');

  /* filters */
  const [fType, setFType] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fTrade, setFTrade] = useState('');
  const [fParty, setFParty] = useState('');
  const [search, setSearch] = useState('');

  /* form */
  const empty: Omit<CloseoutItem, 'id'> = {
    item_type: 'warranty', title: '', description: '', trade: '', responsible_party: '',
    due_date: '', received_date: '', status: 'pending', warranty_start: '', warranty_end: '',
    warranty_duration: '', manufacturer: '', file_url: '', file_name: '', notes: '',
    reviewed_by: '', reviewed_at: '',
  };
  const [form, setForm] = useState(empty);

  /* ── fetch ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api(base)
      .then((d) => { if (d) setItems(d); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId, base]);

  /* ── create / patch ────────────────────────────────────────────── */
  async function createItem() {
    if (!form.title.trim()) { setError('Title is required'); return; }
    try {
      const res = await api(base, { method: 'POST', body: JSON.stringify(form), headers: { 'Content-Type': 'application/json' } });
      if (res) setItems((p) => [...p, res]);
      else setItems((p) => [...p, { ...form, id: `tmp-${Date.now()}` } as CloseoutItem]);
      setForm(empty);
      setView('list');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Create failed'); }
  }

  async function patchItem(id: string, patch: Partial<CloseoutItem>) {
    try {
      const res = await api(`${base}/${id}`, { method: 'PATCH', body: JSON.stringify(patch), headers: { 'Content-Type': 'application/json' } });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch, ...(res || {}) } : i)));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Update failed'); }
  }

  async function bulkUpdate() {
    const ids = Array.from(bulkIds);
    if (!ids.length) return;
    for (const id of ids) await patchItem(id, { status: bulkStatus });
    setBulkIds(new Set());
  }

  /* ── filtered items ────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = [...items];
    const tab = TABS.find((t) => t.key === activeTab);
    if (tab && tab.types.length) list = list.filter((i) => tab.types.includes(i.item_type));
    if (fType) list = list.filter((i) => i.item_type === fType);
    if (fStatus) list = list.filter((i) => i.status === fStatus);
    if (fTrade) list = list.filter((i) => i.trade === fTrade);
    if (fParty) list = list.filter((i) => i.responsible_party === fParty);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.title.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q) || i.trade?.toLowerCase().includes(q));
    }
    return list;
  }, [items, activeTab, fType, fStatus, fTrade, fParty, search]);

  /* ── unique values for filters ─────────────────────────────────── */
  const uniqueParties = useMemo(() => [...new Set(items.map((i) => i.responsible_party).filter(Boolean))], [items]);
  const uniqueTrades = useMemo(() => [...new Set(items.map((i) => i.trade).filter(Boolean))], [items]);

  /* ── stats ─────────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const total = items.filter((i) => i.status !== 'na').length;
    const accepted = items.filter((i) => i.status === 'accepted').length;
    const pct = total ? Math.round((accepted / total) * 100) : 0;
    const byType: Record<string, { total: number; accepted: number }> = {};
    for (const it of items) {
      if (it.status === 'na') continue;
      if (!byType[it.item_type]) byType[it.item_type] = { total: 0, accepted: 0 };
      byType[it.item_type].total++;
      if (it.status === 'accepted') byType[it.item_type].accepted++;
    }
    const overdue = items.filter((i) => i.due_date && i.status !== 'accepted' && i.status !== 'na' && daysUntil(i.due_date) !== null && (daysUntil(i.due_date) as number) < 0);
    const expiringWarranties = items.filter((i) => i.item_type === 'warranty' && i.warranty_end && (daysUntil(i.warranty_end) ?? 999) <= 90 && (daysUntil(i.warranty_end) ?? 0) >= 0);
    return { total, accepted, pct, byType, overdue, expiringWarranties };
  }, [items]);

  /* ── trade checklist ───────────────────────────────────────────── */
  const tradeChecklist = useMemo(() => {
    const map: Record<string, { total: number; accepted: number; items: CloseoutItem[] }> = {};
    for (const it of items) {
      if (!it.trade) continue;
      if (!map[it.trade]) map[it.trade] = { total: 0, accepted: 0, items: [] };
      map[it.trade].total++;
      map[it.trade].items.push(it);
      if (it.status === 'accepted' || it.status === 'na') map[it.trade].accepted++;
    }
    return map;
  }, [items]);

  /* ── styles ────────────────────────────────────────────────────── */
  const page: React.CSSProperties = { minHeight: '100vh', background: '#0B1623', color: TEXT, fontFamily: 'system-ui, sans-serif', paddingBottom: 80 };
  const header: React.CSSProperties = { background: RAISED, padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50 };
  const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, marginBottom: 12 };
  const input: React.CSSProperties = { width: '100%', padding: '10px 12px', background: '#0B1623', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, boxSizing: 'border-box' };
  const btnGold: React.CSSProperties = { padding: '10px 20px', background: GOLD, color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' };
  const btnOutline: React.CSSProperties = { padding: '8px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, cursor: 'pointer' };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block', fontWeight: 600 };

  /* ── print ─────────────────────────────────────────────────────── */
  function exportPDF() { window.print(); }

  /* ── render helpers ────────────────────────────────────────────── */
  function renderProgressBar(value: number, max: number, color: string) {
    const pct = max ? Math.round((value / max) * 100) : 0;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 10, background: '#1a2a3d', borderRadius: 5, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 5, transition: 'width 0.4s' }} />
        </div>
        <span style={{ fontSize: 12, color: DIM, minWidth: 40, textAlign: 'right' }}>{pct}%</span>
      </div>
    );
  }

  function renderWarrantyCountdown(it: CloseoutItem) {
    if (it.item_type !== 'warranty' || !it.warranty_end) return null;
    const days = daysUntil(it.warranty_end);
    if (days === null) return null;
    const color = days < 0 ? RED : days <= 30 ? RED : days <= 90 ? AMBER : GREEN;
    const txt = days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? 'Expires today' : `${days}d remaining`;
    return <span style={{ fontSize: 12, color, fontWeight: 600 }}>{txt}</span>;
  }

  /* ── VIEWS ─────────────────────────────────────────────────────── */

  /* ── DASHBOARD ─────────────────────────────────────────────────── */
  function renderDashboard() {
    return (
      <div style={{ padding: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Closeout Progress Dashboard</h2>
        {/* overall */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 700 }}>Overall Completion</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: stats.pct === 100 ? GREEN : GOLD }}>{stats.pct}%</span>
          </div>
          {renderProgressBar(stats.accepted, stats.total, stats.pct === 100 ? GREEN : GOLD)}
          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: DIM }}>{stats.accepted} / {stats.total} items accepted</span>
            {stats.overdue.length > 0 && <span style={{ fontSize: 13, color: RED, fontWeight: 600 }}>{stats.overdue.length} overdue</span>}
            {stats.expiringWarranties.length > 0 && <span style={{ fontSize: 13, color: AMBER, fontWeight: 600 }}>{stats.expiringWarranties.length} warranties expiring soon</span>}
          </div>
        </div>
        {/* by type */}
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 12px' }}>Completion by Type</h3>
        {Object.entries(stats.byType).map(([type, { total, accepted }]) => (
          <div key={type} style={{ ...card, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{TYPE_LABELS[type] || type}</span>
              <span style={{ fontSize: 13, color: DIM }}>{accepted}/{total}</span>
            </div>
            {renderProgressBar(accepted, total, accepted === total ? GREEN : BLUE)}
          </div>
        ))}
        {/* status breakdown */}
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 12px' }}>Status Breakdown</h3>
        <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {STATUSES.map((s) => {
            const c = items.filter((i) => i.status === s).length;
            return (
              <div key={s} style={{ textAlign: 'center', padding: 12 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: STATUS_COLORS[s] }}>{c}</div>
                <div style={{ fontSize: 12, color: DIM }}>{STATUS_LABELS[s]}</div>
              </div>
            );
          })}
        </div>
        {/* overdue */}
        {stats.overdue.length > 0 && (
          <>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 12px', color: RED }}>Overdue Items</h3>
            {stats.overdue.map((it) => (
              <div key={it.id} style={{ ...card, borderLeft: `4px solid ${RED}`, cursor: 'pointer' }} onClick={() => { setSelected(it); setView('detail'); }}>
                <div style={{ fontWeight: 600 }}>{it.title}</div>
                <div style={{ fontSize: 12, color: RED }}>Due {fmtDate(it.due_date)} — {Math.abs(daysUntil(it.due_date) as number)} days overdue</div>
              </div>
            ))}
          </>
        )}
        {/* expiring warranties */}
        {stats.expiringWarranties.length > 0 && (
          <>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 12px', color: AMBER }}>Expiring Warranties (90 days)</h3>
            {stats.expiringWarranties.map((it) => (
              <div key={it.id} style={{ ...card, borderLeft: `4px solid ${AMBER}`, cursor: 'pointer' }} onClick={() => { setSelected(it); setView('detail'); }}>
                <div style={{ fontWeight: 600 }}>{it.title}</div>
                {renderWarrantyCountdown(it)}
              </div>
            ))}
          </>
        )}
      </div>
    );
  }

  /* ── CHECKLIST ──────────────────────────────────────────────────── */
  function renderChecklist() {
    return (
      <div style={{ padding: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Trade Submission Checklist</h2>
        {Object.entries(tradeChecklist).sort(([a], [b]) => a.localeCompare(b)).map(([trade, data]) => {
          const complete = data.accepted === data.total;
          return (
            <div key={trade} style={{ ...card, borderLeft: `4px solid ${complete ? GREEN : AMBER}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: complete ? GREEN : 'transparent', border: `2px solid ${complete ? GREEN : BORDER}`, fontSize: 14, color: '#fff' }}>
                    {complete ? '✓' : ''}
                  </span>
                  <span style={{ fontWeight: 700 }}>{trade}</span>
                </div>
                <span style={{ fontSize: 13, color: DIM }}>{data.accepted}/{data.total}</span>
              </div>
              {renderProgressBar(data.accepted, data.total, complete ? GREEN : AMBER)}
              <div style={{ marginTop: 10 }}>
                {data.items.map((it) => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS_COLORS[it.status] || DIM, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: it.status === 'accepted' ? DIM : TEXT }}>{it.title}</span>
                    <span style={statusBadge(it.status)}>{STATUS_LABELS[it.status]}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {Object.keys(tradeChecklist).length === 0 && <div style={{ color: DIM, textAlign: 'center', padding: 40 }}>No items with trade assignments</div>}
      </div>
    );
  }

  /* ── TRADE GROUPING ────────────────────────────────────────────── */
  function renderTradeView() {
    const grouped: Record<string, CloseoutItem[]> = {};
    for (const it of items) {
      const t = it.trade || 'Unassigned';
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(it);
    }
    return (
      <div style={{ padding: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Items by Trade</h2>
        {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([trade, list]) => (
          <div key={trade} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: GOLD, marginBottom: 8, borderBottom: `1px solid ${BORDER}`, paddingBottom: 6 }}>
              {trade} <span style={{ fontSize: 12, color: DIM, fontWeight: 400 }}>({list.length})</span>
            </div>
            {list.map((it) => renderItemRow(it))}
          </div>
        ))}
      </div>
    );
  }

  /* ── CREATE FORM ───────────────────────────────────────────────── */
  function renderCreateForm() {
    const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
    return (
      <div style={{ padding: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>New Closeout Item</h2>
        <div style={card}>
          <label style={label}>Item Type *</label>
          <select style={input} value={form.item_type} onChange={(e) => set('item_type', e.target.value)}>
            {ITEM_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>

          <div style={{ height: 12 }} />
          <label style={label}>Title *</label>
          <input style={input} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Enter item title" />

          <div style={{ height: 12 }} />
          <label style={label}>Description</label>
          <textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} value={form.description} onChange={(e) => set('description', e.target.value)} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <label style={label}>Trade</label>
              <select style={input} value={form.trade} onChange={(e) => set('trade', e.target.value)}>
                <option value="">Select trade</option>
                {TRADES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Responsible Party</label>
              <input style={input} value={form.responsible_party} onChange={(e) => set('responsible_party', e.target.value)} placeholder="Name or company" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <label style={label}>Due Date</label>
              <input style={input} type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
            </div>
            <div>
              <label style={label}>Status</label>
              <select style={input} value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          </div>

          {/* warranty fields */}
          {form.item_type === 'warranty' && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '16px 0 8px', color: GOLD }}>Warranty Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={label}>Warranty Start</label>
                  <input style={input} type="date" value={form.warranty_start} onChange={(e) => set('warranty_start', e.target.value)} />
                </div>
                <div>
                  <label style={label}>Warranty End</label>
                  <input style={input} type="date" value={form.warranty_end} onChange={(e) => set('warranty_end', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div>
                  <label style={label}>Duration</label>
                  <input style={input} value={form.warranty_duration} onChange={(e) => set('warranty_duration', e.target.value)} placeholder="e.g. 2 years" />
                </div>
                <div>
                  <label style={label}>Manufacturer</label>
                  <input style={input} value={form.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} />
                </div>
              </div>
            </>
          )}

          <div style={{ height: 12 }} />
          <label style={label}>File URL</label>
          <input style={input} value={form.file_url} onChange={(e) => set('file_url', e.target.value)} placeholder="https://..." />

          <div style={{ height: 12 }} />
          <label style={label}>File Name</label>
          <input style={input} value={form.file_name} onChange={(e) => set('file_name', e.target.value)} />

          <div style={{ height: 12 }} />
          <label style={label}>Notes</label>
          <textarea style={{ ...input, minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={(e) => set('notes', e.target.value)} />

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button style={btnGold} onClick={createItem}>Create Item</button>
            <button style={btnOutline} onClick={() => { setForm(empty); setView('list'); }}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── DETAIL VIEW ───────────────────────────────────────────────── */
  function renderDetail() {
    if (!selected) return null;
    const it = selected;
    const isOverdue = it.due_date && it.status !== 'accepted' && it.status !== 'na' && daysUntil(it.due_date) !== null && (daysUntil(it.due_date) as number) < 0;

    function Field({ lbl, val }: { lbl: string; val: string | React.ReactNode }) {
      return (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: DIM, fontWeight: 600, marginBottom: 2 }}>{lbl}</div>
          <div style={{ fontSize: 14 }}>{val || '—'}</div>
        </div>
      );
    }

    function advanceStatus() {
      const flow: Record<string, string> = { pending: 'submitted', submitted: 'under_review', under_review: 'accepted' };
      const next = flow[it.status];
      if (next) {
        patchItem(it.id, { status: next });
        setSelected({ ...it, status: next });
      }
    }

    function rejectItem() {
      patchItem(it.id, { status: 'rejected' });
      setSelected({ ...it, status: 'rejected' });
    }

    return (
      <div style={{ padding: 20 }}>
        <button style={{ ...btnOutline, marginBottom: 16 }} onClick={() => setView('list')}>Back to List</button>
        <div style={{ ...card, borderLeft: `4px solid ${STATUS_COLORS[it.status] || DIM}` }}>
          {isOverdue && <div style={{ background: RED, color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>OVERDUE — Due {fmtDate(it.due_date)}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 11, color: GOLD, fontWeight: 700, textTransform: 'uppercase' }}>{TYPE_LABELS[it.item_type]}</span>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 0' }}>{it.title}</h2>
            </div>
            <span style={statusBadge(it.status)}>{STATUS_LABELS[it.status]}</span>
          </div>

          {it.description && <Field lbl="Description" val={it.description} />}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field lbl="Trade" val={it.trade} />
            <Field lbl="Responsible Party" val={it.responsible_party} />
            <Field lbl="Due Date" val={fmtDate(it.due_date)} />
            <Field lbl="Received Date" val={fmtDate(it.received_date)} />
          </div>

          {it.item_type === 'warranty' && (
            <>
              <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 12, paddingTop: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 8 }}>Warranty Information</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field lbl="Start Date" val={fmtDate(it.warranty_start)} />
                  <Field lbl="End Date" val={fmtDate(it.warranty_end)} />
                  <Field lbl="Duration" val={it.warranty_duration} />
                  <Field lbl="Manufacturer" val={it.manufacturer} />
                </div>
                {renderWarrantyCountdown(it)}
              </div>
            </>
          )}

          {(it.file_url || it.file_name) && (
            <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 12, paddingTop: 12 }}>
              <Field lbl="File" val={it.file_url ? <a href={it.file_url} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: 'underline' }}>{it.file_name || it.file_url}</a> : it.file_name} />
            </div>
          )}

          {it.notes && <Field lbl="Notes" val={it.notes} />}

          {(it.reviewed_by || it.reviewed_at) && (
            <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 12, paddingTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field lbl="Reviewed By" val={it.reviewed_by} />
                <Field lbl="Reviewed At" val={fmtDate(it.reviewed_at)} />
              </div>
            </div>
          )}

          {/* status workflow buttons */}
          <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 16, paddingTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {it.status === 'pending' && <button style={{ ...btnGold }} onClick={advanceStatus}>Mark Submitted</button>}
            {it.status === 'submitted' && <button style={{ ...btnGold }} onClick={advanceStatus}>Start Review</button>}
            {it.status === 'under_review' && (
              <>
                <button style={{ ...btnGold, background: GREEN }} onClick={advanceStatus}>Accept</button>
                <button style={{ ...btnGold, background: RED }} onClick={rejectItem}>Reject</button>
              </>
            )}
            {it.status === 'rejected' && <button style={{ ...btnGold }} onClick={() => { patchItem(it.id, { status: 'pending' }); setSelected({ ...it, status: 'pending' }); }}>Reset to Pending</button>}
          </div>
        </div>
      </div>
    );
  }

  /* ── ITEM ROW ──────────────────────────────────────────────────── */
  function renderItemRow(it: CloseoutItem) {
    const isOverdue = it.due_date && it.status !== 'accepted' && it.status !== 'na' && daysUntil(it.due_date) !== null && (daysUntil(it.due_date) as number) < 0;
    return (
      <div
        key={it.id}
        style={{ ...card, cursor: 'pointer', borderLeft: `4px solid ${isOverdue ? RED : STATUS_COLORS[it.status] || DIM}`, display: 'flex', gap: 12, alignItems: 'flex-start' }}
        onClick={() => { setSelected(it); setView('detail'); }}
      >
        {/* bulk checkbox */}
        <input
          type="checkbox"
          checked={bulkIds.has(it.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const next = new Set(bulkIds);
            e.target.checked ? next.add(it.id) : next.delete(it.id);
            setBulkIds(next);
          }}
          style={{ marginTop: 4, accentColor: GOLD, cursor: 'pointer' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 10, color: GOLD, fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>{TYPE_LABELS[it.item_type]}</span>
              <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
            </div>
            <span style={statusBadge(it.status)}>{STATUS_LABELS[it.status]}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap', fontSize: 12, color: DIM }}>
            {it.trade && <span>{it.trade}</span>}
            {it.responsible_party && <span>{it.responsible_party}</span>}
            {it.due_date && <span style={{ color: isOverdue ? RED : DIM }}>Due {fmtDate(it.due_date)}</span>}
            {renderWarrantyCountdown(it)}
          </div>
        </div>
      </div>
    );
  }

  /* ── LIST VIEW ─────────────────────────────────────────────────── */
  function renderList() {
    return (
      <div style={{ padding: '0 20px 20px' }}>
        {/* tabs */}
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', marginBottom: 16, borderBottom: `1px solid ${BORDER}` }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
                color: activeTab === t.key ? GOLD : DIM, fontWeight: activeTab === t.key ? 700 : 400,
                borderBottom: activeTab === t.key ? `2px solid ${GOLD}` : '2px solid transparent',
                fontSize: 13, whiteSpace: 'nowrap', transition: 'all 0.2s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* search + filters */}
        <input
          style={{ ...input, marginBottom: 12 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 16 }}>
          <select style={{ ...input, fontSize: 12 }} value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">All Types</option>
            {ITEM_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          <select style={{ ...input, fontSize: 12 }} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <select style={{ ...input, fontSize: 12 }} value={fTrade} onChange={(e) => setFTrade(e.target.value)}>
            <option value="">All Trades</option>
            {uniqueTrades.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select style={{ ...input, fontSize: 12 }} value={fParty} onChange={(e) => setFParty(e.target.value)}>
            <option value="">All Parties</option>
            {uniqueParties.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* bulk bar */}
        {bulkIds.size > 0 && (
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, background: '#132236' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{bulkIds.size} selected</span>
            <select style={{ ...input, width: 'auto', fontSize: 12 }} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
              {STATUSES.filter((s) => s !== 'na').map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <button style={{ ...btnGold, padding: '6px 14px', fontSize: 12 }} onClick={bulkUpdate}>Apply</button>
            <button style={{ ...btnOutline, padding: '6px 14px', fontSize: 12 }} onClick={() => setBulkIds(new Set())}>Clear</button>
          </div>
        )}

        {/* summary row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 13, color: DIM }}>
          <span>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }} onClick={() => { const all = new Set(filtered.map((i) => i.id)); setBulkIds(all); }}>Select All</button>
          </div>
        </div>

        {/* items */}
        {filtered.length === 0 && <div style={{ color: DIM, textAlign: 'center', padding: 40 }}>No closeout items found</div>}
        {filtered.map((it) => renderItemRow(it))}
      </div>
    );
  }

  /* ── MAIN RENDER ───────────────────────────────────────────────── */
  if (!projectId) return <div style={page}><div style={{ padding: 40, textAlign: 'center', color: RED }}>Missing projectId parameter</div></div>;

  return (
    <div style={page}>
      {/* header */}
      <div style={header}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Project Closeout</h1>
          <div style={{ fontSize: 12, color: DIM }}>{stats.accepted}/{stats.total} accepted — {stats.pct}% complete</div>
        </div>
        <button style={{ ...btnOutline, fontSize: 11, padding: '6px 10px' }} onClick={exportPDF} title="Export PDF">Print</button>
      </div>

      {/* nav bar */}
      <div style={{ display: 'flex', gap: 0, overflowX: 'auto', background: RAISED, borderBottom: `1px solid ${BORDER}`, padding: '0 12px' }}>
        {[
          { key: 'list', label: 'Items' },
          { key: 'dashboard', label: 'Dashboard' },
          { key: 'checklist', label: 'Checklist' },
          { key: 'trades', label: 'By Trade' },
          { key: 'create', label: '+ New' },
        ].map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key as typeof view)}
            style={{
              padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
              color: view === v.key ? GOLD : DIM, fontWeight: view === v.key ? 700 : 400,
              borderBottom: view === v.key ? `2px solid ${GOLD}` : '2px solid transparent',
              fontSize: 13, whiteSpace: 'nowrap',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* error */}
      {error && (
        <div style={{ margin: '12px 20px', padding: '10px 14px', background: '#2d1015', border: `1px solid ${RED}`, borderRadius: 8, fontSize: 13, color: RED, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontWeight: 700 }} onClick={() => setError('')}>X</button>
        </div>
      )}

      {/* loading */}
      {loading && <div style={{ padding: 40, textAlign: 'center', color: DIM }}>Loading closeout items...</div>}

      {/* views */}
      {!loading && view === 'list' && renderList()}
      {!loading && view === 'create' && renderCreateForm()}
      {!loading && view === 'detail' && renderDetail()}
      {!loading && view === 'dashboard' && renderDashboard()}
      {!loading && view === 'checklist' && renderChecklist()}
      {!loading && view === 'trades' && renderTradeView()}
    </div>
  );
}

/* ── default export with Suspense ────────────────────────────────── */
export default function CloseoutPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0B1623', color: '#8BAAC8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
      <CloseoutInner />
    </Suspense>
  );
}