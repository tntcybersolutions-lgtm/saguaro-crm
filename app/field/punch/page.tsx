'use client';
/**
 * Saguaro Field — Punch List
 * Create, view, and update punch list items. Offline queue.
 */
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0f1d2b';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const STATUSES   = ['open', 'in_progress', 'ready_to_inspect', 'complete'];
const STATUS_LABELS: Record<string, string> = { open: 'Open', in_progress: 'In Progress', ready_to_inspect: 'Ready to Inspect', complete: 'Complete' };
const PRIORITY_COLORS: Record<string, string> = { Critical: RED, High: AMBER, Medium: BLUE, Low: DIM };
const STATUS_COLORS: Record<string, string>   = { open: RED, in_progress: AMBER, ready_to_inspect: BLUE, complete: GREEN };

const TRADES = ['General Contractor', 'Concrete', 'Framing / Carpentry', 'Roofing', 'Electrical', 'Plumbing', 'HVAC', 'Drywall', 'Painting', 'Flooring', 'Tile', 'Landscaping', 'Other'];

interface PunchItem {
  id: string;
  description: string;
  location: string;
  trade: string;
  priority: string;
  status: string;
  due_date?: string;
  notes?: string;
  created_at: string;
}

type View = 'list' | 'new' | 'detail';

function PunchListPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [view, setView]       = useState<View>('list');
  const [items, setItems]     = useState<PunchItem[]>([]);
  const [selected, setSelected] = useState<PunchItem | null>(null);
  const [filter, setFilter]   = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [online, setOnline]   = useState(true);
  const [projectName, setProjectName] = useState('');

  // New item form
  const [desc, setDesc]         = useState('');
  const [location, setLocation] = useState('');
  const [trade, setTrade]       = useState('General Contractor');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate]   = useState('');
  const [notes, setNotes]       = useState('');

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
    loadItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/punch-list`);
      const d = await r.json();
      setItems(d.items || d.data || []);
    } catch { /* offline */ }
    setLoading(false);
  };

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim()) return;
    setSaving(true);

    const payload = {
      projectId,
      description: desc.trim(),
      location: location.trim(),
      trade,
      priority,
      due_date: dueDate || null,
      notes: notes.trim(),
      status: 'open',
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/punch-list/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      await loadItems();
      resetForm();
      setView('list');
    } catch {
      await enqueue({ url: '/api/punch-list/create', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      // Optimistic local add
      setItems((prev) => [{
        id: `local-${Date.now()}`,
        description: desc.trim(), location: location.trim(), trade, priority, status: 'open',
        due_date: dueDate || undefined, notes: notes.trim(), created_at: new Date().toISOString(),
      }, ...prev]);
      resetForm();
      setView('list');
    }
    setSaving(false);
  };

  const updateStatus = async (item: PunchItem, newStatus: string) => {
    const optimistic = items.map((i) => i.id === item.id ? { ...i, status: newStatus } : i);
    setItems(optimistic);
    setSelected((prev) => prev ? { ...prev, status: newStatus } : null);

    try {
      if (!online) throw new Error('offline');
      await fetch(`/api/punch-list/${item.id}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      await enqueue({ url: `/api/punch-list/${item.id}/complete`, method: 'PATCH', body: JSON.stringify({ status: newStatus }), contentType: 'application/json', isFormData: false });
    }
  };

  const resetForm = () => { setDesc(''); setLocation(''); setTrade('General Contractor'); setPriority('Medium'); setDueDate(''); setNotes(''); };

  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter || i.priority.toLowerCase() === filter);
  const openCount = items.filter((i) => i.status !== 'complete').length;
  const criticalCount = items.filter((i) => i.priority === 'Critical' && i.status !== 'complete').length;

  return (
    <div style={{ padding: '18px 16px' }}>
      <button onClick={() => router.back()} style={backBtn}>← Back</button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Punch List</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: DIM }}>{projectName}</p>
        </div>
        {view === 'list' && (
          <button
            onClick={() => setView('new')}
            style={{ background: GOLD, border: 'none', borderRadius: 10, padding: '10px 16px', color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
          >
            + Add Item
          </button>
        )}
      </div>

      {/* Stats */}
      {view === 'list' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <Chip label={`${openCount} Open`} color={openCount > 0 ? AMBER : GREEN} />
          {criticalCount > 0 && <Chip label={`${criticalCount} Critical`} color={RED} />}
          <Chip label={`${items.filter((i) => i.status === 'complete').length} Done`} color={GREEN} />
        </div>
      )}

      {/* Filter chips */}
      {view === 'list' && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
          {['all', 'open', 'in_progress', 'ready_to_inspect', 'complete', 'Critical', 'High'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ flexShrink: 0, background: filter === f ? 'rgba(212,160,23,.2)' : 'transparent', border: `1px solid ${filter === f ? GOLD : BORDER}`, borderRadius: 20, padding: '5px 12px', color: filter === f ? GOLD : DIM, fontSize: 12, fontWeight: filter === f ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {STATUS_LABELS[f] || f}
            </button>
          ))}
        </div>
      )}

      {/* ── List view ── */}
      {view === 'list' && (
        loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: DIM }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <p style={{ margin: 0, fontSize: 14 }}>{filter === 'all' ? 'No punch list items. Tap "+ Add Item" to log one.' : 'No items match this filter.'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((item) => (
              <div
                key={item.id}
                onClick={() => { setSelected(item); setView('detail'); }}
                style={{ background: RAISED, border: `1px solid ${item.priority === 'Critical' ? 'rgba(239,68,68,.3)' : BORDER}`, borderRadius: 12, padding: '14px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: PRIORITY_COLORS[item.priority] || DIM, marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT, lineHeight: 1.3 }}>{item.description}</p>
                    {item.location && <p style={{ margin: '3px 0 0', fontSize: 12, color: DIM }}>📍 {item.location}</p>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <Tag label={item.trade} />
                      <Tag label={STATUS_LABELS[item.status] || item.status} color={STATUS_COLORS[item.status]} />
                      {item.due_date && <Tag label={`Due ${new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`} color={new Date(item.due_date) < new Date() ? RED : DIM} />}
                    </div>
                  </div>
                  <span style={{ color: DIM, fontSize: 18, flexShrink: 0 }}>›</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── New item form ── */}
      {view === 'new' && (
        <form onSubmit={submitNew}>
          <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 800, color: TEXT }}>New Punch List Item</h2>
          {!online && <OfflineBanner />}

          <div style={card}>
            <p style={secLbl}>Description</p>
            <Fld label="What needs to be fixed? *">
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe the deficiency, missing work, or issue..." rows={4} style={inp} required />
            </Fld>
            <Fld label="Location on Site">
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Level 2, Unit 204 bathroom" style={inp} />
            </Fld>
          </div>

          <div style={card}>
            <p style={secLbl}>Assignment</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Fld label="Responsible Trade">
                <select value={trade} onChange={(e) => setTrade(e.target.value)} style={inp}>
                  {TRADES.map((t) => <option key={t} value={t} style={{ background: '#0f1d2b' }}>{t}</option>)}
                </select>
              </Fld>
              <Fld label="Priority">
                <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inp}>
                  {PRIORITIES.map((p) => <option key={p} value={p} style={{ background: '#0f1d2b' }}>{p}</option>)}
                </select>
              </Fld>
            </div>
            <Fld label="Due Date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inp} />
            </Fld>
            <Fld label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional details, spec reference, photos needed..." rows={2} style={inp} />
            </Fld>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => { setView('list'); resetForm(); }} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px', color: DIM, fontSize: 15, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ flex: 2, background: saving ? '#1e3148' : GOLD, border: 'none', borderRadius: 12, padding: '16px', color: saving ? DIM : '#000', fontSize: 15, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving...' : '+ Add to Punch List'}
            </button>
          </div>
        </form>
      )}

      {/* ── Detail / Update view ── */}
      {view === 'detail' && selected && (
        <div>
          <button onClick={() => setView('list')} style={backBtn}>← Back to list</button>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <Tag label={selected.priority} color={PRIORITY_COLORS[selected.priority]} large />
            <Tag label={STATUS_LABELS[selected.status] || selected.status} color={STATUS_COLORS[selected.status]} large />
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: TEXT, lineHeight: 1.3 }}>{selected.description}</h2>
          {selected.location && <p style={{ margin: '0 0 4px', fontSize: 14, color: DIM }}>📍 {selected.location}</p>}
          <p style={{ margin: '0 0 16px', fontSize: 14, color: DIM }}>🔧 {selected.trade}</p>
          {selected.due_date && <p style={{ margin: '0 0 16px', fontSize: 14, color: new Date(selected.due_date) < new Date() ? RED : DIM }}>📅 Due {new Date(selected.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</p>}
          {selected.notes && <p style={{ margin: '0 0 16px', fontSize: 14, color: TEXT, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px' }}>{selected.notes}</p>}

          <p style={secLbl}>Update Status</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(selected, s)}
                style={{ background: selected.status === s ? `rgba(${hexRgb(STATUS_COLORS[s])}, .15)` : 'transparent', border: `2px solid ${selected.status === s ? STATUS_COLORS[s] : BORDER}`, borderRadius: 12, padding: '14px 16px', color: selected.status === s ? STATUS_COLORS[s] : DIM, fontSize: 15, fontWeight: selected.status === s ? 800 : 400, cursor: 'pointer', textAlign: 'left', transition: 'all .1s' }}
              >
                {selected.status === s ? '● ' : '○ '}{STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FieldPunchPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8fa3c0', textAlign: 'center' }}>Loading...</div>}><PunchListPage /></Suspense>;
}

// Shared helpers
function Chip({ label, color }: { label: string; color: string }) {
  return <div style={{ background: `rgba(${hexRgb(color)}, .12)`, border: `1px solid rgba(${hexRgb(color)}, .3)`, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700, color }}>{label}</div>;
}
function Tag({ label, color = DIM, large }: { label: string; color?: string; large?: boolean }) {
  return <span style={{ background: `rgba(${hexRgb(color)}, .12)`, border: `1px solid rgba(${hexRgb(color)}, .25)`, borderRadius: 20, padding: large ? '4px 12px' : '2px 8px', fontSize: large ? 13 : 11, fontWeight: 700, color }}>{label}</span>;
}
function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}><label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>{label}</label>{children}</div>;
}
function OfflineBanner() {
  return <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: RED, fontWeight: 600 }}>Offline — will sync when reconnected</div>;
}

const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 14px 6px', marginBottom: 12 };
const secLbl: React.CSSProperties = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 };
const inp: React.CSSProperties = { width: '100%', background: '#09111A', border: '1px solid #1e3148', borderRadius: 10, padding: '11px 14px', color: '#e8edf8', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
