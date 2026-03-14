'use client';
import React, { useState, useEffect, useMemo } from 'react';

/* ───── PALETTE ───── */
const GOLD = '#D4A017', BG = '#07101C', RAISED = '#0D1D2E', BORDER = '#1E3A5F',
  TEXT = '#F0F4FF', DIM = '#8BAAC8', GREEN = '#22C55E', RED = '#EF4444',
  AMBER = '#F59E0B', BLUE = '#3B82F6', PURPLE = '#8B5CF6';

/* ───── TYPES ───── */
interface WarrantyClaim {
  id: string;
  claim_number: string;
  title: string;
  description: string;
  category: string;
  location: string;
  reported_by: string;
  reported_date: string;
  priority: string;
  status: string;
  assigned_trade: string;
  assigned_contractor: string;
  scheduled_date: string;
  completed_date: string;
  resolution: string;
  cost: number;
  covered_under_warranty: boolean;
  warranty_expiry: string;
  photos: string[];
  notes: string;
  communication_log?: CommEntry[];
}

interface CommEntry {
  id: string;
  date: string;
  from: string;
  message: string;
}

interface Project {
  id: string;
  name: string;
}

/* ───── CONSTANTS ───── */
const CATEGORIES = ['structural','mechanical','electrical','plumbing','roofing','exterior','interior','appliance','landscaping','general','other'];
const PRIORITIES = ['low','medium','high','emergency'];
const STATUSES = ['submitted','acknowledged','scheduled','in_progress','completed','denied','closed'];
const STATUS_FLOW: Record<string, string[]> = {
  submitted: ['acknowledged','denied'],
  acknowledged: ['scheduled','denied'],
  scheduled: ['in_progress','denied'],
  in_progress: ['completed','denied'],
  completed: ['closed'],
  denied: ['closed'],
  closed: [],
};

const PRIORITY_COLORS: Record<string, string> = { low: DIM, medium: AMBER, high: '#FF8C00', emergency: RED };
const STATUS_COLORS: Record<string, string> = {
  submitted: DIM, acknowledged: BLUE, scheduled: AMBER,
  in_progress: '#FF8C00', completed: GREEN, denied: RED, closed: '#6B7280',
};
const CATEGORY_ICONS: Record<string, string> = {
  structural: '\u2302', mechanical: '\u2699', electrical: '\u26A1', plumbing: '\u{1F6BF}',
  roofing: '\u25B2', exterior: '\u{1F3E0}', interior: '\u{1F6AA}', appliance: '\u2668',
  landscaping: '\u2618', general: '\u2605', other: '\u2731',
};

const EMPTY_FORM: Omit<WarrantyClaim, 'id'> = {
  claim_number: '', title: '', description: '', category: 'general', location: '',
  reported_by: '', reported_date: new Date().toISOString().slice(0, 10),
  priority: 'medium', status: 'submitted', assigned_trade: '', assigned_contractor: '',
  scheduled_date: '', completed_date: '', resolution: '', cost: 0,
  covered_under_warranty: true, warranty_expiry: '', photos: [], notes: '',
  communication_log: [],
};

/* ───── STYLE HELPERS ───── */
const css = {
  page: { background: BG, minHeight: '100vh', color: TEXT, fontFamily: "'Inter','Segoe UI',sans-serif", padding: 32 } as React.CSSProperties,
  h1: { fontSize: 28, fontWeight: 700, color: GOLD, margin: 0 } as React.CSSProperties,
  h2: { fontSize: 20, fontWeight: 600, color: TEXT, margin: '24px 0 12px' } as React.CSSProperties,
  h3: { fontSize: 16, fontWeight: 600, color: TEXT, margin: '16px 0 8px' } as React.CSSProperties,
  card: { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, marginBottom: 16 } as React.CSSProperties,
  row: { display: 'flex', gap: 16, flexWrap: 'wrap' as const } as React.CSSProperties,
  stat: (accent: string) => ({ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 20px', flex: '1 1 160px', borderLeft: `4px solid ${accent}` }) as React.CSSProperties,
  statVal: { fontSize: 28, fontWeight: 700, color: TEXT } as React.CSSProperties,
  statLbl: { fontSize: 12, color: DIM, marginTop: 4, textTransform: 'uppercase' as const, letterSpacing: 1 } as React.CSSProperties,
  badge: (c: string) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: c + '22', color: c, border: `1px solid ${c}44`, textTransform: 'capitalize' as const }) as React.CSSProperties,
  btn: (bg: string) => ({ padding: '8px 18px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#FFF', background: bg, transition: 'opacity .15s' }) as React.CSSProperties,
  btnOutline: (c: string) => ({ padding: '6px 14px', border: `1px solid ${c}`, borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12, color: c, background: 'transparent' }) as React.CSSProperties,
  input: { width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const } as React.CSSProperties,
  select: { width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const } as React.CSSProperties,
  textarea: { width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG, color: TEXT, fontSize: 13, minHeight: 80, outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const } as React.CSSProperties,
  label: { fontSize: 12, color: DIM, marginBottom: 4, display: 'block', fontWeight: 500 } as React.CSSProperties,
  field: { flex: '1 1 220px', marginBottom: 12 } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 } as React.CSSProperties,
  th: { textAlign: 'left' as const, padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 1 } as React.CSSProperties,
  td: { padding: '10px 12px', borderBottom: `1px solid ${BORDER}15` } as React.CSSProperties,
  trHover: { cursor: 'pointer', transition: 'background .15s' } as React.CSSProperties,
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  modal: { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, width: '90%', maxWidth: 820, maxHeight: '90vh', overflowY: 'auto' as const, position: 'relative' as const } as React.CSSProperties,
  close: { position: 'absolute' as const, top: 12, right: 16, background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer' } as React.CSSProperties,
  tab: (active: boolean) => ({ padding: '8px 18px', border: 'none', borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent', background: 'transparent', color: active ? GOLD : DIM, fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer' }) as React.CSSProperties,
  photoThumb: { width: 64, height: 64, objectFit: 'cover' as const, borderRadius: 6, border: `1px solid ${BORDER}`, cursor: 'pointer' } as React.CSSProperties,
  timeline: { borderLeft: `2px solid ${BORDER}`, marginLeft: 8, paddingLeft: 20 } as React.CSSProperties,
  timelineDot: (c: string) => ({ width: 12, height: 12, borderRadius: '50%', background: c, position: 'absolute' as const, left: -27, top: 4 }) as React.CSSProperties,
  expiredTag: { display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: RED + '22', color: RED, border: `1px solid ${RED}44`, marginLeft: 8 } as React.CSSProperties,
};

/* ───── COMPONENT ───── */
export default function WarrantyClaimsPage() {
  /* state */
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard'|'claims'|'create'>('dashboard');
  const [detailClaim, setDetailClaim] = useState<WarrantyClaim | null>(null);
  const [form, setForm] = useState<Omit<WarrantyClaim, 'id'>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  /* filters */
  const [fCategory, setFCategory] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo, setFDateTo] = useState('');
  const [fSearch, setFSearch] = useState('');

  /* dispatch modal */
  const [dispatchClaim, setDispatchClaim] = useState<WarrantyClaim | null>(null);
  const [dispatchForm, setDispatchForm] = useState({ assigned_trade: '', assigned_contractor: '', scheduled_date: '' });

  /* comm log */
  const [commMsg, setCommMsg] = useState('');

  /* photo viewer */
  const [viewPhoto, setViewPhoto] = useState('');

  /* fetch projects */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/projects/list');
        const j = await r.json();
        setProjects(j.projects || j || []);
      } catch { setProjects([]); }
    })();
  }, []);

  /* fetch claims when project changes */
  useEffect(() => {
    if (!selectedProject) { setClaims([]); return; }
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/projects/${selectedProject}/warranty-claims`);
        const j = await r.json();
        setClaims(j.claims || j || []);
      } catch { setClaims([]); }
      finally { setLoading(false); }
    })();
  }, [selectedProject]);

  /* helpers */
  const flash = (text: string, type: 'ok' | 'err' = 'ok') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 3500); };
  const today = new Date().toISOString().slice(0, 10);
  const isExpired = (d: string) => d && d < today;

  /* filtered claims */
  const filtered = useMemo(() => {
    let list = [...claims];
    if (fCategory) list = list.filter(c => c.category === fCategory);
    if (fStatus) list = list.filter(c => c.status === fStatus);
    if (fPriority) list = list.filter(c => c.priority === fPriority);
    if (fDateFrom) list = list.filter(c => c.reported_date >= fDateFrom);
    if (fDateTo) list = list.filter(c => c.reported_date <= fDateTo);
    if (fSearch) {
      const q = fSearch.toLowerCase();
      list = list.filter(c => c.title?.toLowerCase().includes(q) || c.claim_number?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q) || c.reported_by?.toLowerCase().includes(q));
    }
    return list;
  }, [claims, fCategory, fStatus, fPriority, fDateFrom, fDateTo, fSearch]);

  /* dashboard stats */
  const stats = useMemo(() => {
    const total = claims.length;
    const open = claims.filter(c => !['completed','denied','closed'].includes(c.status)).length;
    const closed = claims.filter(c => ['completed','closed'].includes(c.status)).length;
    const denied = claims.filter(c => c.status === 'denied').length;
    const totalCost = claims.reduce((s, c) => s + (c.cost || 0), 0);
    const expiredCount = claims.filter(c => isExpired(c.warranty_expiry)).length;
    const emergency = claims.filter(c => c.priority === 'emergency').length;

    /* avg resolution time */
    const resolved = claims.filter(c => c.completed_date && c.reported_date);
    const avgDays = resolved.length > 0
      ? Math.round(resolved.reduce((s, c) => s + (new Date(c.completed_date).getTime() - new Date(c.reported_date).getTime()) / 86400000, 0) / resolved.length)
      : 0;

    /* cost by category */
    const costByCat: Record<string, number> = {};
    claims.forEach(c => { costByCat[c.category] = (costByCat[c.category] || 0) + (c.cost || 0); });

    /* claims by trade */
    const byTrade: Record<string, number> = {};
    claims.forEach(c => { if (c.assigned_trade) byTrade[c.assigned_trade] = (byTrade[c.assigned_trade] || 0) + 1; });

    /* claims by status */
    const byStatus: Record<string, number> = {};
    claims.forEach(c => { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });

    /* claims by category */
    const byCat: Record<string, number> = {};
    claims.forEach(c => { byCat[c.category] = (byCat[c.category] || 0) + 1; });

    return { total, open, closed, denied, totalCost, expiredCount, emergency, avgDays, costByCat, byTrade, byStatus, byCat };
  }, [claims]);

  /* create claim */
  async function handleCreate() {
    if (!form.title) { flash('Title is required.', 'err'); return; }
    if (!selectedProject) { flash('Select a project first.', 'err'); return; }
    setSaving(true);
    const num = `WC-${String(claims.length + 1).padStart(4, '0')}`;
    try {
      const res = await fetch(`/api/projects/${selectedProject}/warranty-claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, claim_number: num, project_id: selectedProject }),
      });
      const j = await res.json();
      const newClaim: WarrantyClaim = j.claim || { id: `wc-${Date.now()}`, ...form, claim_number: num };
      setClaims(prev => [newClaim, ...prev]);
      setForm(EMPTY_FORM);
      setActiveTab('claims');
      flash('Warranty claim created successfully.');
    } catch { flash('Failed to create claim.', 'err'); }
    finally { setSaving(false); }
  }

  /* update status */
  async function updateStatus(claim: WarrantyClaim, newStatus: string) {
    try {
      await fetch(`/api/projects/${selectedProject}/warranty-claims`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: claim.id, status: newStatus, completed_date: newStatus === 'completed' ? today : claim.completed_date }),
      });
      setClaims(prev => prev.map(c => c.id === claim.id ? { ...c, status: newStatus, completed_date: newStatus === 'completed' ? today : c.completed_date } : c));
      if (detailClaim?.id === claim.id) setDetailClaim(prev => prev ? { ...prev, status: newStatus, completed_date: newStatus === 'completed' ? today : prev.completed_date } : prev);
      flash(`Status updated to ${newStatus}.`);
    } catch { flash('Failed to update status.', 'err'); }
  }

  /* dispatch contractor */
  async function handleDispatch() {
    if (!dispatchClaim) return;
    try {
      await fetch(`/api/projects/${selectedProject}/warranty-claims`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dispatchClaim.id, ...dispatchForm, status: dispatchForm.scheduled_date ? 'scheduled' : dispatchClaim.status }),
      });
      setClaims(prev => prev.map(c => c.id === dispatchClaim.id ? { ...c, ...dispatchForm, status: dispatchForm.scheduled_date ? 'scheduled' : c.status } : c));
      flash('Contractor dispatched.');
      setDispatchClaim(null);
    } catch { flash('Dispatch failed.', 'err'); }
  }

  /* add communication entry */
  async function addCommEntry() {
    if (!commMsg.trim() || !detailClaim) return;
    const entry: CommEntry = { id: `cm-${Date.now()}`, date: new Date().toISOString(), from: 'Staff', message: commMsg };
    const updated = { ...detailClaim, communication_log: [...(detailClaim.communication_log || []), entry] };
    try {
      await fetch(`/api/projects/${selectedProject}/warranty-claims`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: detailClaim.id, communication_log: updated.communication_log }),
      });
    } catch { /* optimistic */ }
    setDetailClaim(updated);
    setClaims(prev => prev.map(c => c.id === detailClaim.id ? updated : c));
    setCommMsg('');
  }

  /* update resolution + cost on detail */
  async function saveResolution(claim: WarrantyClaim, resolution: string, cost: number) {
    try {
      await fetch(`/api/projects/${selectedProject}/warranty-claims`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: claim.id, resolution, cost }),
      });
      setClaims(prev => prev.map(c => c.id === claim.id ? { ...c, resolution, cost } : c));
      setDetailClaim(prev => prev ? { ...prev, resolution, cost } : prev);
      flash('Resolution saved.');
    } catch { flash('Save failed.', 'err'); }
  }

  /* PDF export */
  function exportClaimPDF(claim: WarrantyClaim) {
    const lines = [
      `WARRANTY CLAIM REPORT`, ``, `Claim #: ${claim.claim_number}`, `Title: ${claim.title}`,
      `Category: ${claim.category}`, `Location: ${claim.location}`, `Priority: ${claim.priority}`,
      `Status: ${claim.status}`, `Reported By: ${claim.reported_by}`, `Reported Date: ${claim.reported_date}`,
      `Warranty Expiry: ${claim.warranty_expiry || 'N/A'}`, `Covered: ${claim.covered_under_warranty ? 'Yes' : 'No'}`,
      ``, `--- Description ---`, claim.description || '(none)',
      ``, `--- Resolution ---`, claim.resolution || '(pending)',
      ``, `Assigned Trade: ${claim.assigned_trade || 'N/A'}`, `Contractor: ${claim.assigned_contractor || 'N/A'}`,
      `Scheduled: ${claim.scheduled_date || 'N/A'}`, `Completed: ${claim.completed_date || 'N/A'}`,
      `Cost: $${(claim.cost || 0).toLocaleString()}`,
      ``, `--- Notes ---`, claim.notes || '(none)',
      ``, `--- Communication Log ---`,
    ];
    (claim.communication_log || []).forEach(e => lines.push(`[${new Date(e.date).toLocaleString()}] ${e.from}: ${e.message}`));
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${claim.claim_number || 'warranty-claim'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    flash('Claim report exported.');
  }

  /* bar chart helper */
  function MiniBar({ data, colorMap }: { data: Record<string, number>; colorMap?: Record<string, string> }) {
    const max = Math.max(...Object.values(data), 1);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Object.entries(data).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 90, fontSize: 11, color: DIM, textTransform: 'capitalize', textAlign: 'right', flexShrink: 0 }}>{k}</span>
            <div style={{ flex: 1, height: 16, background: BG, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(v / max) * 100}%`, background: colorMap?.[k] || GOLD, borderRadius: 4, transition: 'width .4s' }} />
            </div>
            <span style={{ fontSize: 11, color: TEXT, width: 36, textAlign: 'right' }}>{typeof v === 'number' && v % 1 !== 0 ? `$${v.toLocaleString()}` : v}</span>
          </div>
        ))}
      </div>
    );
  }

  /* ──────── RENDER ──────── */
  return (
    <div style={css.page}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={css.h1}>Warranty Claims</h1>
          <p style={{ color: DIM, fontSize: 13, margin: '4px 0 0' }}>Track, manage, and resolve warranty claims across all projects</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* project selector */}
          <div>
            <select style={{ ...css.select, width: 240 }} value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
              <option value="">Select a project...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button style={css.btn(GOLD)} onClick={() => { setForm(EMPTY_FORM); setActiveTab('create'); }}>+ New Claim</button>
        </div>
      </div>

      {/* toast */}
      {msg && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 2000, padding: '12px 24px', borderRadius: 8, background: msg.type === 'ok' ? GREEN : RED, color: '#FFF', fontWeight: 600, fontSize: 13, boxShadow: '0 4px 20px rgba(0,0,0,.4)' }}>
          {msg.text}
        </div>
      )}

      {/* tabs */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, marginBottom: 20, display: 'flex', gap: 4 }}>
        {(['dashboard','claims','create'] as const).map(t => (
          <button key={t} style={css.tab(activeTab === t)} onClick={() => setActiveTab(t)}>
            {t === 'dashboard' ? 'Dashboard' : t === 'claims' ? 'Claims' : 'Create Claim'}
          </button>
        ))}
      </div>

      {!selectedProject && (
        <div style={{ ...css.card, textAlign: 'center', padding: 60 }}>
          <p style={{ color: DIM, fontSize: 15 }}>Select a project to view warranty claims</p>
        </div>
      )}

      {selectedProject && loading && (
        <div style={{ textAlign: 'center', padding: 60, color: DIM }}>Loading warranty claims...</div>
      )}

      {/* ═══ DASHBOARD TAB ═══ */}
      {selectedProject && !loading && activeTab === 'dashboard' && (
        <div>
          {/* stat cards */}
          <div style={css.row}>
            <div style={css.stat(GOLD)}><div style={css.statVal}>{stats.total}</div><div style={css.statLbl}>Total Claims</div></div>
            <div style={css.stat(BLUE)}><div style={css.statVal}>{stats.open}</div><div style={css.statLbl}>Open</div></div>
            <div style={css.stat(GREEN)}><div style={css.statVal}>{stats.closed}</div><div style={css.statLbl}>Closed</div></div>
            <div style={css.stat(RED)}><div style={css.statVal}>{stats.denied}</div><div style={css.statLbl}>Denied</div></div>
            <div style={css.stat(AMBER)}><div style={css.statVal}>{stats.avgDays}d</div><div style={css.statLbl}>Avg Resolution</div></div>
            <div style={css.stat(RED)}><div style={css.statVal}>{stats.emergency}</div><div style={css.statLbl}>Emergency</div></div>
          </div>

          <div style={{ ...css.row, marginTop: 20 }}>
            <div style={css.stat(GOLD)}><div style={css.statVal}>${stats.totalCost.toLocaleString()}</div><div style={css.statLbl}>Total Cost</div></div>
            <div style={css.stat(RED)}><div style={css.statVal}>{stats.expiredCount}</div><div style={css.statLbl}>Expired Warranty</div></div>
          </div>

          {/* charts row */}
          <div style={{ ...css.row, marginTop: 24 }}>
            <div style={{ ...css.card, flex: '1 1 340px' }}>
              <h3 style={css.h3}>Claims by Status</h3>
              <MiniBar data={stats.byStatus} colorMap={STATUS_COLORS} />
            </div>
            <div style={{ ...css.card, flex: '1 1 340px' }}>
              <h3 style={css.h3}>Claims by Category</h3>
              <MiniBar data={stats.byCat} />
            </div>
          </div>
          <div style={{ ...css.row }}>
            <div style={{ ...css.card, flex: '1 1 340px' }}>
              <h3 style={css.h3}>Cost by Category</h3>
              <MiniBar data={stats.costByCat} />
            </div>
            <div style={{ ...css.card, flex: '1 1 340px' }}>
              <h3 style={css.h3}>Claims by Trade</h3>
              <MiniBar data={stats.byTrade} />
            </div>
          </div>
        </div>
      )}

      {/* ═══ CLAIMS LIST TAB ═══ */}
      {selectedProject && !loading && activeTab === 'claims' && (
        <div>
          {/* filters */}
          <div style={{ ...css.card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={css.field}>
              <label style={css.label}>Search</label>
              <input style={css.input} placeholder="Title, claim #, reporter..." value={fSearch} onChange={e => setFSearch(e.target.value)} />
            </div>
            <div style={{ ...css.field, flex: '0 1 160px' }}>
              <label style={css.label}>Category</label>
              <select style={css.select} value={fCategory} onChange={e => setFCategory(e.target.value)}>
                <option value="">All</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ ...css.field, flex: '0 1 140px' }}>
              <label style={css.label}>Status</label>
              <select style={css.select} value={fStatus} onChange={e => setFStatus(e.target.value)}>
                <option value="">All</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ ...css.field, flex: '0 1 130px' }}>
              <label style={css.label}>Priority</label>
              <select style={css.select} value={fPriority} onChange={e => setFPriority(e.target.value)}>
                <option value="">All</option>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ ...css.field, flex: '0 1 140px' }}>
              <label style={css.label}>From Date</label>
              <input style={css.input} type="date" value={fDateFrom} onChange={e => setFDateFrom(e.target.value)} />
            </div>
            <div style={{ ...css.field, flex: '0 1 140px' }}>
              <label style={css.label}>To Date</label>
              <input style={css.input} type="date" value={fDateTo} onChange={e => setFDateTo(e.target.value)} />
            </div>
            <div style={{ ...css.field, flex: '0 0 auto' }}>
              <button style={css.btnOutline(DIM)} onClick={() => { setFCategory(''); setFStatus(''); setFPriority(''); setFDateFrom(''); setFDateTo(''); setFSearch(''); }}>Clear</button>
            </div>
          </div>

          {/* claim count */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: DIM, fontSize: 12 }}>{filtered.length} claim{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ ...css.card, textAlign: 'center', padding: 48 }}>
              <p style={{ color: DIM }}>No warranty claims found. Create one to get started.</p>
            </div>
          ) : (
            <div style={{ ...css.card, padding: 0, overflow: 'auto' }}>
              <table style={css.table}>
                <thead>
                  <tr>
                    <th style={css.th}>Claim #</th>
                    <th style={css.th}>Cat</th>
                    <th style={css.th}>Title</th>
                    <th style={css.th}>Priority</th>
                    <th style={css.th}>Status</th>
                    <th style={css.th}>Reported</th>
                    <th style={css.th}>Assigned</th>
                    <th style={css.th}>Cost</th>
                    <th style={css.th}>Warranty</th>
                    <th style={css.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} style={css.trHover} onClick={() => setDetailClaim(c)}
                      onMouseEnter={e => (e.currentTarget.style.background = BORDER + '33')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={css.td}><span style={{ fontFamily: 'monospace', color: GOLD }}>{c.claim_number}</span></td>
                      <td style={css.td}><span title={c.category} style={{ fontSize: 16 }}>{CATEGORY_ICONS[c.category] || '\u2731'}</span></td>
                      <td style={{ ...css.td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</td>
                      <td style={css.td}><span style={css.badge(PRIORITY_COLORS[c.priority] || DIM)}>{c.priority}</span></td>
                      <td style={css.td}><span style={css.badge(STATUS_COLORS[c.status] || DIM)}>{c.status.replace('_', ' ')}</span></td>
                      <td style={{ ...css.td, fontSize: 12, color: DIM }}>{c.reported_date}</td>
                      <td style={{ ...css.td, fontSize: 12 }}>{c.assigned_contractor || <span style={{ color: DIM }}>---</span>}</td>
                      <td style={{ ...css.td, fontFamily: 'monospace' }}>{c.cost ? `$${c.cost.toLocaleString()}` : '---'}</td>
                      <td style={css.td}>
                        {isExpired(c.warranty_expiry) ? <span style={css.expiredTag}>EXPIRED</span> : c.warranty_expiry ? <span style={{ fontSize: 11, color: GREEN }}>Active</span> : <span style={{ color: DIM, fontSize: 11 }}>N/A</span>}
                      </td>
                      <td style={css.td} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={css.btnOutline(BLUE)} onClick={() => { setDispatchForm({ assigned_trade: c.assigned_trade || '', assigned_contractor: c.assigned_contractor || '', scheduled_date: c.scheduled_date || '' }); setDispatchClaim(c); }}>Dispatch</button>
                          <button style={css.btnOutline(GOLD)} onClick={() => exportClaimPDF(c)}>PDF</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ CREATE CLAIM TAB ═══ */}
      {selectedProject && !loading && activeTab === 'create' && (
        <div style={css.card}>
          <h2 style={{ ...css.h2, marginTop: 0 }}>New Warranty Claim</h2>

          <div style={css.row}>
            <div style={css.field}><label style={css.label}>Title *</label><input style={css.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <div style={css.field}><label style={css.label}>Category</label>
              <select style={css.select} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={css.field}><label style={css.label}>Priority</label>
              <select style={css.select} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div style={css.row}>
            <div style={{ ...css.field, flex: '2 1 400px' }}><label style={css.label}>Description</label><textarea style={css.textarea} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          </div>

          <div style={css.row}>
            <div style={css.field}><label style={css.label}>Location</label><input style={css.input} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
            <div style={css.field}><label style={css.label}>Reported By</label><input style={css.input} value={form.reported_by} onChange={e => setForm({ ...form, reported_by: e.target.value })} /></div>
            <div style={css.field}><label style={css.label}>Reported Date</label><input style={css.input} type="date" value={form.reported_date} onChange={e => setForm({ ...form, reported_date: e.target.value })} /></div>
          </div>

          <div style={css.row}>
            <div style={css.field}><label style={css.label}>Assigned Trade</label><input style={css.input} value={form.assigned_trade} onChange={e => setForm({ ...form, assigned_trade: e.target.value })} /></div>
            <div style={css.field}><label style={css.label}>Assigned Contractor</label><input style={css.input} value={form.assigned_contractor} onChange={e => setForm({ ...form, assigned_contractor: e.target.value })} /></div>
            <div style={css.field}><label style={css.label}>Scheduled Date</label><input style={css.input} type="date" value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} /></div>
          </div>

          <div style={css.row}>
            <div style={css.field}><label style={css.label}>Warranty Expiry Date</label><input style={css.input} type="date" value={form.warranty_expiry} onChange={e => setForm({ ...form, warranty_expiry: e.target.value })} /></div>
            <div style={css.field}>
              <label style={css.label}>Covered Under Warranty</label>
              <select style={css.select} value={form.covered_under_warranty ? 'yes' : 'no'} onChange={e => setForm({ ...form, covered_under_warranty: e.target.value === 'yes' })}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div style={css.field}><label style={css.label}>Estimated Cost</label><input style={css.input} type="number" value={form.cost || ''} onChange={e => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })} /></div>
          </div>

          <div style={css.row}>
            <div style={{ ...css.field, flex: '2 1 400px' }}><label style={css.label}>Notes</label><textarea style={css.textarea} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button style={css.btn(GOLD)} disabled={saving} onClick={handleCreate}>{saving ? 'Saving...' : 'Create Claim'}</button>
            <button style={css.btnOutline(DIM)} onClick={() => setActiveTab('claims')}>Cancel</button>
          </div>
        </div>
      )}

      {/* ═══ CLAIM DETAIL MODAL ═══ */}
      {detailClaim && (
        <div style={css.overlay} onClick={() => setDetailClaim(null)}>
          <div style={css.modal} onClick={e => e.stopPropagation()}>
            <button style={css.close} onClick={() => setDetailClaim(null)}>&times;</button>

            {/* header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span style={{ fontFamily: 'monospace', color: GOLD, fontSize: 13 }}>{detailClaim.claim_number}</span>
                <h2 style={{ ...css.h2, marginTop: 4 }}>{detailClaim.title}</h2>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <span style={css.badge(STATUS_COLORS[detailClaim.status] || DIM)}>{detailClaim.status.replace('_', ' ')}</span>
                  <span style={css.badge(PRIORITY_COLORS[detailClaim.priority] || DIM)}>{detailClaim.priority}</span>
                  <span style={{ ...css.badge(GOLD), fontSize: 13 }}>{CATEGORY_ICONS[detailClaim.category] || ''} {detailClaim.category}</span>
                  {isExpired(detailClaim.warranty_expiry) && <span style={css.expiredTag}>WARRANTY EXPIRED</span>}
                </div>
              </div>
              <button style={css.btnOutline(GOLD)} onClick={() => exportClaimPDF(detailClaim)}>Export PDF</button>
            </div>

            {/* info grid */}
            <div style={{ ...css.card, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, fontSize: 13 }}>
              <div><span style={{ color: DIM }}>Location:</span> {detailClaim.location || '---'}</div>
              <div><span style={{ color: DIM }}>Reported By:</span> {detailClaim.reported_by || '---'}</div>
              <div><span style={{ color: DIM }}>Reported Date:</span> {detailClaim.reported_date || '---'}</div>
              <div><span style={{ color: DIM }}>Warranty Expiry:</span> {detailClaim.warranty_expiry || '---'}</div>
              <div><span style={{ color: DIM }}>Covered:</span> {detailClaim.covered_under_warranty ? 'Yes' : 'No'}</div>
              <div><span style={{ color: DIM }}>Trade:</span> {detailClaim.assigned_trade || '---'}</div>
              <div><span style={{ color: DIM }}>Contractor:</span> {detailClaim.assigned_contractor || '---'}</div>
              <div><span style={{ color: DIM }}>Scheduled:</span> {detailClaim.scheduled_date || '---'}</div>
              <div><span style={{ color: DIM }}>Completed:</span> {detailClaim.completed_date || '---'}</div>
              <div><span style={{ color: DIM }}>Cost:</span> <span style={{ fontFamily: 'monospace', color: GOLD }}>${(detailClaim.cost || 0).toLocaleString()}</span></div>
            </div>

            {/* description */}
            <div style={css.card}>
              <h3 style={css.h3}>Description</h3>
              <p style={{ color: TEXT, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{detailClaim.description || 'No description provided.'}</p>
            </div>

            {/* status workflow timeline */}
            <div style={css.card}>
              <h3 style={css.h3}>Status Workflow</h3>
              <div style={{ display: 'flex', gap: 0, alignItems: 'center', flexWrap: 'wrap' }}>
                {STATUSES.map((s, i) => {
                  const isCurrent = detailClaim.status === s;
                  const isPast = STATUSES.indexOf(detailClaim.status) > i;
                  const c = isCurrent ? GOLD : isPast ? GREEN : BORDER;
                  return (
                    <React.Fragment key={s}>
                      {i > 0 && <div style={{ width: 24, height: 2, background: isPast ? GREEN : BORDER }} />}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: isCurrent ? GOLD : isPast ? GREEN + '33' : BG, border: `2px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: isCurrent ? BG : isPast ? GREEN : DIM }}>
                          {isPast ? '\u2713' : i + 1}
                        </div>
                        <span style={{ fontSize: 9, color: isCurrent ? GOLD : DIM, textTransform: 'capitalize', maxWidth: 60, textAlign: 'center' }}>{s.replace('_', ' ')}</span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
              {/* transition buttons */}
              {STATUS_FLOW[detailClaim.status] && STATUS_FLOW[detailClaim.status].length > 0 && (
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <span style={{ color: DIM, fontSize: 12, lineHeight: '32px' }}>Move to:</span>
                  {STATUS_FLOW[detailClaim.status].map(ns => (
                    <button key={ns} style={css.btn(STATUS_COLORS[ns] || BLUE)} onClick={() => updateStatus(detailClaim, ns)}>
                      {ns.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* photo evidence */}
            {detailClaim.photos && detailClaim.photos.length > 0 && (
              <div style={css.card}>
                <h3 style={css.h3}>Photo Evidence</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {detailClaim.photos.map((p, i) => (
                    <img key={i} src={p} alt={`Evidence ${i + 1}`} style={css.photoThumb} onClick={() => setViewPhoto(p)} />
                  ))}
                </div>
              </div>
            )}

            {/* resolution + cost edit */}
            <div style={css.card}>
              <h3 style={css.h3}>Resolution &amp; Cost</h3>
              <div style={css.row}>
                <div style={{ ...css.field, flex: '2 1 300px' }}>
                  <label style={css.label}>Resolution Notes</label>
                  <textarea
                    style={css.textarea}
                    defaultValue={detailClaim.resolution || ''}
                    id="detail-resolution"
                  />
                </div>
                <div style={{ ...css.field, flex: '0 1 140px' }}>
                  <label style={css.label}>Cost ($)</label>
                  <input
                    style={css.input}
                    type="number"
                    defaultValue={detailClaim.cost || 0}
                    id="detail-cost"
                  />
                </div>
              </div>
              <button style={css.btn(GREEN)} onClick={() => {
                const resEl = document.getElementById('detail-resolution') as HTMLTextAreaElement;
                const costEl = document.getElementById('detail-cost') as HTMLInputElement;
                saveResolution(detailClaim, resEl?.value || '', parseFloat(costEl?.value) || 0);
              }}>Save Resolution</button>
            </div>

            {/* homeowner communication log */}
            <div style={css.card}>
              <h3 style={css.h3}>Homeowner Communication Log</h3>
              <div style={css.timeline}>
                {(detailClaim.communication_log || []).length === 0 && <p style={{ color: DIM, fontSize: 12 }}>No communication entries yet.</p>}
                {(detailClaim.communication_log || []).map(entry => (
                  <div key={entry.id} style={{ position: 'relative', marginBottom: 16, paddingBottom: 4 }}>
                    <div style={css.timelineDot(BLUE)} />
                    <div style={{ fontSize: 11, color: DIM }}>{new Date(entry.date).toLocaleString()} &mdash; {entry.from}</div>
                    <div style={{ fontSize: 13, color: TEXT, marginTop: 2 }}>{entry.message}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input style={{ ...css.input, flex: 1 }} placeholder="Add communication entry..." value={commMsg} onChange={e => setCommMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCommEntry()} />
                <button style={css.btn(BLUE)} onClick={addCommEntry}>Send</button>
              </div>
            </div>

            {/* notes */}
            {detailClaim.notes && (
              <div style={css.card}>
                <h3 style={css.h3}>Notes</h3>
                <p style={{ color: TEXT, fontSize: 13, whiteSpace: 'pre-wrap' }}>{detailClaim.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ DISPATCH MODAL ═══ */}
      {dispatchClaim && (
        <div style={css.overlay} onClick={() => setDispatchClaim(null)}>
          <div style={{ ...css.modal, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <button style={css.close} onClick={() => setDispatchClaim(null)}>&times;</button>
            <h2 style={{ ...css.h2, marginTop: 0 }}>Dispatch Contractor</h2>
            <p style={{ color: DIM, fontSize: 13, marginBottom: 16 }}>Assign trade and contractor for claim <span style={{ color: GOLD, fontFamily: 'monospace' }}>{dispatchClaim.claim_number}</span></p>
            <div style={css.row}>
              <div style={css.field}>
                <label style={css.label}>Trade</label>
                <input style={css.input} value={dispatchForm.assigned_trade} onChange={e => setDispatchForm({ ...dispatchForm, assigned_trade: e.target.value })} placeholder="e.g., Plumbing, Electrical..." />
              </div>
              <div style={css.field}>
                <label style={css.label}>Contractor</label>
                <input style={css.input} value={dispatchForm.assigned_contractor} onChange={e => setDispatchForm({ ...dispatchForm, assigned_contractor: e.target.value })} placeholder="Contractor name..." />
              </div>
            </div>
            <div style={{ ...css.field, marginTop: 4 }}>
              <label style={css.label}>Service Date</label>
              <input style={css.input} type="date" value={dispatchForm.scheduled_date} onChange={e => setDispatchForm({ ...dispatchForm, scheduled_date: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button style={css.btn(GREEN)} onClick={handleDispatch}>Dispatch</button>
              <button style={css.btnOutline(DIM)} onClick={() => setDispatchClaim(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PHOTO VIEWER MODAL ═══ */}
      {viewPhoto && (
        <div style={css.overlay} onClick={() => setViewPhoto('')}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <button style={{ ...css.close, top: -36, right: 0, color: TEXT, fontSize: 28 }} onClick={() => setViewPhoto('')}>&times;</button>
            <img src={viewPhoto} alt="Claim photo" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8, border: `2px solid ${BORDER}` }} />
          </div>
        </div>
      )}

      {/* ═══ FOOTER SUMMARY ═══ */}
      {selectedProject && !loading && activeTab === 'claims' && filtered.length > 0 && (
        <div style={{ ...css.card, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <span style={{ color: DIM, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Filtered Total Cost</span>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: GOLD }}>
                ${filtered.reduce((s, c) => s + (c.cost || 0), 0).toLocaleString()}
              </div>
            </div>
            <div>
              <span style={{ color: DIM, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Covered Claims</span>
              <div style={{ fontSize: 18, fontWeight: 700, color: GREEN }}>
                {filtered.filter(c => c.covered_under_warranty).length}
              </div>
            </div>
            <div>
              <span style={{ color: DIM, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Not Covered</span>
              <div style={{ fontSize: 18, fontWeight: 700, color: RED }}>
                {filtered.filter(c => !c.covered_under_warranty).length}
              </div>
            </div>
            <div>
              <span style={{ color: DIM, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Expired Warranties</span>
              <div style={{ fontSize: 18, fontWeight: 700, color: AMBER }}>
                {filtered.filter(c => isExpired(c.warranty_expiry)).length}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={css.btnOutline(GOLD)}
              onClick={() => {
                const csvRows = [
                  ['Claim #','Title','Category','Priority','Status','Reported By','Reported Date','Location','Trade','Contractor','Scheduled','Completed','Cost','Covered','Warranty Expiry','Resolution'].join(','),
                  ...filtered.map(c => [
                    c.claim_number, `"${(c.title || '').replace(/"/g, '""')}"`, c.category, c.priority, c.status,
                    `"${(c.reported_by || '').replace(/"/g, '""')}"`, c.reported_date, `"${(c.location || '').replace(/"/g, '""')}"`,
                    c.assigned_trade, `"${(c.assigned_contractor || '').replace(/"/g, '""')}"`,
                    c.scheduled_date, c.completed_date, c.cost || 0,
                    c.covered_under_warranty ? 'Yes' : 'No', c.warranty_expiry,
                    `"${(c.resolution || '').replace(/"/g, '""')}"`
                  ].join(','))
                ];
                const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'warranty-claims-export.csv';
                a.click();
                URL.revokeObjectURL(url);
                flash('Claims exported to CSV.');
              }}
            >
              Export CSV
            </button>
          </div>
        </div>
      )}

      {/* ═══ DASHBOARD WARRANTY EXPIRY WATCHLIST ═══ */}
      {selectedProject && !loading && activeTab === 'dashboard' && (() => {
        const expiring = claims.filter(c => {
          if (!c.warranty_expiry) return false;
          const exp = new Date(c.warranty_expiry);
          const daysLeft = (exp.getTime() - Date.now()) / 86400000;
          return daysLeft >= 0 && daysLeft <= 30;
        });
        const expired = claims.filter(c => isExpired(c.warranty_expiry));
        const watchlist = [...expired, ...expiring];
        if (watchlist.length === 0) return null;
        return (
          <div style={{ ...css.card, marginTop: 16, borderLeft: `4px solid ${RED}` }}>
            <h3 style={{ ...css.h3, color: RED }}>Warranty Expiry Watchlist</h3>
            <p style={{ color: DIM, fontSize: 12, marginBottom: 12 }}>
              Claims with expired or soon-to-expire warranties (within 30 days)
            </p>
            <table style={css.table}>
              <thead>
                <tr>
                  <th style={css.th}>Claim</th>
                  <th style={css.th}>Title</th>
                  <th style={css.th}>Category</th>
                  <th style={css.th}>Expiry Date</th>
                  <th style={css.th}>Status</th>
                  <th style={css.th}>Days Left</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map(c => {
                  const daysLeft = Math.ceil((new Date(c.warranty_expiry).getTime() - Date.now()) / 86400000);
                  return (
                    <tr key={c.id} style={css.trHover} onClick={() => { setDetailClaim(c); setActiveTab('claims'); }}
                      onMouseEnter={e => (e.currentTarget.style.background = BORDER + '33')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={css.td}><span style={{ fontFamily: 'monospace', color: GOLD }}>{c.claim_number}</span></td>
                      <td style={css.td}>{c.title}</td>
                      <td style={css.td}><span style={{ textTransform: 'capitalize' }}>{c.category}</span></td>
                      <td style={css.td}>{c.warranty_expiry}</td>
                      <td style={css.td}><span style={css.badge(STATUS_COLORS[c.status] || DIM)}>{c.status.replace('_',' ')}</span></td>
                      <td style={css.td}>
                        <span style={{ fontWeight: 700, color: daysLeft < 0 ? RED : daysLeft <= 7 ? AMBER : GREEN }}>
                          {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}
