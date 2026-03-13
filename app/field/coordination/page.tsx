'use client';
/**
 * Saguaro Field — Coordination Issues (BIM / Field Clash Tracking)
 * Track, filter, resolve coordination issues across trades. Offline queue support.
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

/* ─── Types ─── */
interface CoordinationIssue {
  id: string;
  issue_number?: number;
  title: string;
  description?: string;
  issue_type: string;
  location?: string;
  drawing_ref?: string;
  trades_involved: string[];
  assigned_to?: string;
  ball_in_court?: string;
  priority: string;
  status: string;
  resolution?: string;
  resolved_by?: string;
  resolved_date?: string;
  cost_impact?: number;
  schedule_impact?: number;
  linked_rfi_id?: string;
  photos?: string[];
  due_date?: string;
  meeting_date?: string;
  notes?: string;
  created_at?: string;
}

type View = 'list' | 'detail' | 'create';

/* ─── Constants ─── */
const ISSUE_TYPES: { value: string; label: string; icon: string }[] = [
  { value: 'bim_clash',        label: 'BIM Clash',         icon: '⚡' },
  { value: 'field_conflict',   label: 'Field Conflict',    icon: '🔧' },
  { value: 'design_conflict',  label: 'Design Conflict',   icon: '📐' },
  { value: 'rfi_related',      label: 'RFI Related',       icon: '📋' },
  { value: 'scope_gap',        label: 'Scope Gap',         icon: '📏' },
  { value: 'coordination',     label: 'Coordination',      icon: '🔗' },
  { value: 'other',            label: 'Other',             icon: '📌' },
];

const TRADES = [
  'General Contractor', 'Electrical', 'Mechanical', 'Plumbing', 'HVAC',
  'Fire Protection', 'Structural Steel', 'Concrete', 'Framing', 'Drywall',
  'Roofing', 'Glazing', 'Elevators', 'Low Voltage', 'Controls',
  'Insulation', 'Painting', 'Flooring', 'Landscaping', 'Sitework',
];

const STATUSES = ['open', 'in_review', 'resolved', 'closed', 'deferred'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUS_FLOW: Record<string, string[]> = {
  open:      ['in_review', 'deferred'],
  in_review: ['resolved', 'deferred', 'open'],
  resolved:  ['closed', 'open'],
  closed:    [],
  deferred:  ['open'],
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open', in_review: 'In Review', resolved: 'Resolved', closed: 'Closed', deferred: 'Deferred',
};

const PRIORITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/* ─── Helpers ─── */
function statusColor(s: string): string {
  if (s === 'open') return BLUE;
  if (s === 'in_review') return AMBER;
  if (s === 'resolved') return GREEN;
  if (s === 'closed') return DIM;
  if (s === 'deferred') return '#A855F7';
  return DIM;
}

function priorityColor(p: string): string {
  if (p === 'critical') return RED;
  if (p === 'high') return AMBER;
  if (p === 'medium') return BLUE;
  if (p === 'low') return GREEN;
  return DIM;
}

function typeIcon(t: string): string {
  return ISSUE_TYPES.find(it => it.value === t)?.icon || '📌';
}

function typeLabel(t: string): string {
  return ISSUE_TYPES.find(it => it.value === t)?.label || t;
}

function formatDate(d: string | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatUSD(val: number | undefined): string {
  if (val === undefined || val === null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}

/* ─── PDF Export ─── */
function exportPDF(title: string, content: string) {
  const pw = window.open('', '_blank');
  if (!pw) return;
  pw.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #1a1a1a; max-width: 900px; margin: 0 auto; }
      h1 { font-size: 22px; border-bottom: 2px solid #D4A017; padding-bottom: 8px; }
      h2 { font-size: 16px; color: #333; margin-top: 20px; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; }
      th, td { padding: 6px 10px; border: 1px solid #ddd; font-size: 13px; text-align: left; }
      th { background: #f5f5f5; font-weight: 600; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; }
      @media print { body { padding: 20px; } }
    </style></head><body>${content}</body></html>`);
  pw.document.close();
  setTimeout(() => pw.print(), 400);
}

/* ─── Main Component ─── */
function CoordinationPage() {
  const projectId = useSearchParams().get('projectId') || '';
  const [issues, setIssues] = useState<CoordinationIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<CoordinationIssue | null>(null);
  const [toast, setToast] = useState('');

  /* Filters */
  const [filterType, setFilterType] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBIC, setFilterBIC] = useState('');
  const [sortBy, setSortBy] = useState<'priority' | 'date' | 'cost'>('priority');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');

  /* Create form */
  const emptyForm = {
    title: '', description: '', issue_type: 'bim_clash', location: '', drawing_ref: '',
    trades_involved: [] as string[], assigned_to: '', ball_in_court: '', priority: 'medium',
    status: 'open', resolution: '', cost_impact: '', schedule_impact: '', linked_rfi_id: '',
    due_date: '', meeting_date: '', notes: '',
  };
  const [form, setForm] = useState(emptyForm);
  const [formPhotos, setFormPhotos] = useState<File[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  /* Resolution form (for detail view) */
  const [resText, setResText] = useState('');
  const [resBy, setResBy] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  /* ─── Fetch ─── */
  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/coordination-issues`);
        if (res.ok) { const data = await res.json(); setIssues(Array.isArray(data) ? data : data.data || []); }
      } catch { /* offline — use cached */ }
      setLoading(false);
    })();
  }, [projectId]);

  /* ─── Filtered & Sorted ─── */
  const filtered = useMemo(() => {
    let list = [...issues];
    if (filterType) list = list.filter(i => i.issue_type === filterType);
    if (filterPriority) list = list.filter(i => i.priority === filterPriority);
    if (filterStatus) list = list.filter(i => i.status === filterStatus);
    if (filterBIC) list = list.filter(i => i.ball_in_court?.toLowerCase().includes(filterBIC.toLowerCase()));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.location?.toLowerCase().includes(q) ||
        i.drawing_ref?.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q) ||
        i.trades_involved.some(t => t.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'priority') cmp = (PRIORITY_RANK[a.priority] || 0) - (PRIORITY_RANK[b.priority] || 0);
      else if (sortBy === 'date') cmp = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      else if (sortBy === 'cost') cmp = (a.cost_impact || 0) - (b.cost_impact || 0);
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [issues, filterType, filterPriority, filterStatus, filterBIC, search, sortBy, sortDir]);

  /* ─── Summary Stats ─── */
  const summary = useMemo(() => {
    const open = issues.filter(i => i.status === 'open' || i.status === 'in_review').length;
    const totalCost = issues.reduce((s, i) => s + (i.cost_impact || 0), 0);
    const totalSchedule = issues.reduce((s, i) => s + (i.schedule_impact || 0), 0);
    const byType: Record<string, number> = {};
    issues.forEach(i => { byType[i.issue_type] = (byType[i.issue_type] || 0) + 1; });
    return { open, totalCost, totalSchedule, byType };
  }, [issues]);

  /* ─── Create Issue ─── */
  const handleCreate = async () => {
    if (!form.title.trim()) { showToast('Title is required'); return; }
    setSaving(true);
    const payload = {
      ...form,
      cost_impact: form.cost_impact ? parseFloat(form.cost_impact) : null,
      schedule_impact: form.schedule_impact ? parseInt(form.schedule_impact) : null,
      photos: [] as string[],
    };
    const url = `/api/projects/${projectId}/coordination-issues`;
    const body = JSON.stringify(payload);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (res.ok) {
        const created = await res.json();
        setIssues(prev => [created, ...prev]);
        showToast('Issue created');
      } else throw new Error('API error');
    } catch {
      await enqueue({ url, method: 'POST', body, contentType: 'application/json', isFormData: false });
      const optimistic: CoordinationIssue = {
        id: `pending-${Date.now()}`, ...payload, cost_impact: payload.cost_impact ?? undefined,
        schedule_impact: payload.schedule_impact ?? undefined, trades_involved: form.trades_involved,
        created_at: new Date().toISOString(),
      };
      setIssues(prev => [optimistic, ...prev]);
      showToast('Saved offline — will sync');
    }
    setForm(emptyForm);
    setFormPhotos([]);
    setPhotoPreview([]);
    setSaving(false);
    setView('list');
  };

  /* ─── Update Status ─── */
  const handleStatusChange = async (issue: CoordinationIssue, newStatus: string) => {
    const url = `/api/projects/${projectId}/coordination-issues/${issue.id}`;
    const patch: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'resolved') {
      patch.resolution = resText;
      patch.resolved_by = resBy;
      patch.resolved_date = new Date().toISOString();
    }
    const body = JSON.stringify(patch);
    try {
      const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      if (res.ok) {
        const updated = await res.json();
        setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, ...updated } : i));
        if (selected?.id === issue.id) setSelected(s => s ? { ...s, ...updated } : s);
        showToast(`Status → ${STATUS_LABELS[newStatus]}`);
      } else throw new Error('API error');
    } catch {
      await enqueue({ url, method: 'PATCH', body, contentType: 'application/json', isFormData: false });
      setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, ...patch as Partial<CoordinationIssue> } : i));
      if (selected?.id === issue.id) setSelected(s => s ? { ...s, ...patch as Partial<CoordinationIssue> } : s);
      showToast('Saved offline — will sync');
    }
    setResText('');
    setResBy('');
  };

  /* ─── Photo Capture ─── */
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setFormPhotos(prev => [...prev, ...files]);
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removePhoto = (idx: number) => {
    setFormPhotos(prev => prev.filter((_, i) => i !== idx));
    setPhotoPreview(prev => prev.filter((_, i) => i !== idx));
  };

  /* ─── Trade Toggle ─── */
  const toggleTrade = (trade: string) => {
    setForm(prev => ({
      ...prev,
      trades_involved: prev.trades_involved.includes(trade)
        ? prev.trades_involved.filter(t => t !== trade)
        : [...prev.trades_involved, trade],
    }));
  };

  /* ─── PDF Export ─── */
  const handleExportPDF = () => {
    let rows = '';
    filtered.forEach(i => {
      rows += `<tr>
        <td>${i.issue_number || '—'}</td>
        <td>${typeLabel(i.issue_type)}</td>
        <td>${i.title}</td>
        <td>${i.priority}</td>
        <td>${STATUS_LABELS[i.status] || i.status}</td>
        <td>${i.ball_in_court || '—'}</td>
        <td>${i.location || '—'}</td>
        <td>${formatUSD(i.cost_impact)}</td>
        <td>${i.schedule_impact ? i.schedule_impact + 'd' : '—'}</td>
      </tr>`;
    });
    const content = `
      <h1>Coordination Issues Report</h1>
      <p style="color:#666;font-size:13px;">Generated ${new Date().toLocaleString()} | ${filtered.length} issues</p>
      <h2>Summary</h2>
      <table>
        <tr><td><strong>Open / In Review</strong></td><td>${summary.open}</td></tr>
        <tr><td><strong>Total Cost Impact</strong></td><td>${formatUSD(summary.totalCost)}</td></tr>
        <tr><td><strong>Total Schedule Impact</strong></td><td>${summary.totalSchedule} days</td></tr>
      </table>
      <h2>Issues</h2>
      <table>
        <thead><tr><th>#</th><th>Type</th><th>Title</th><th>Priority</th><th>Status</th><th>Ball in Court</th><th>Location</th><th>Cost</th><th>Schedule</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    exportPDF('Coordination Issues', content);
  };

  /* ─── Render ─── */
  if (!projectId) return <div style={{ padding: 32, color: DIM, textAlign: 'center' }}>No project selected.</div>;
  if (loading) return <div style={{ padding: 32, color: DIM, textAlign: 'center' }}>Loading coordination issues...</div>;

  /* ─────────── LIST VIEW ─────────── */
  if (view === 'list') return (
    <div style={{ minHeight: '100vh', background: '#07101C', color: TEXT }}>
      {toast && <div style={toastStyle}>{toast}</div>}
      {/* Header */}
      <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: GOLD }}>Coordination Issues</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleExportPDF} style={headerBtn} title="Export PDF">🖨</button>
          <button onClick={() => { setForm(emptyForm); setFormPhotos([]); setPhotoPreview([]); setView('create'); }} style={{ ...headerBtn, background: GOLD, color: '#07101C' }}>+ New</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: '12px 16px' }}>
        <div style={summaryCard}>
          <div style={{ fontSize: 11, color: DIM, marginBottom: 2 }}>Open Issues</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: AMBER }}>{summary.open}</div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11, color: DIM, marginBottom: 2 }}>Cost Impact</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: RED }}>{formatUSD(summary.totalCost)}</div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11, color: DIM, marginBottom: 2 }}>Schedule Impact</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: AMBER }}>{summary.totalSchedule}d</div>
        </div>
      </div>

      {/* Type Breakdown */}
      {Object.keys(summary.byType).length > 0 && (
        <div style={{ padding: '0 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(summary.byType).map(([type, count]) => (
            <span key={type} style={{ fontSize: 11, background: `rgba(${hexRgb(BORDER)},0.5)`, borderRadius: 8, padding: '3px 8px', color: DIM }}>
              {typeIcon(type)} {typeLabel(type)}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ padding: '0 16px 8px' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search issues..." style={{ ...inp, fontSize: 14 }} />
      </div>

      {/* Filters Row */}
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={filterSelect}>
          <option value="">All Types</option>
          {ISSUE_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={filterSelect}>
          <option value="">All Priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={filterSelect}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <input value={filterBIC} onChange={e => setFilterBIC(e.target.value)} placeholder="Ball in court..." style={{ ...filterSelect, minWidth: 110 }} />
      </div>

      {/* Sort Row */}
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: DIM }}>Sort:</span>
        {(['priority', 'date', 'cost'] as const).map(s => (
          <button key={s} onClick={() => { if (sortBy === s) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy(s); setSortDir('desc'); } }}
            style={{ ...sortBtn, color: sortBy === s ? GOLD : DIM, borderColor: sortBy === s ? GOLD : BORDER }}>
            {s.charAt(0).toUpperCase() + s.slice(1)} {sortBy === s ? (sortDir === 'desc' ? '↓' : '↑') : ''}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: DIM }}>{filtered.length} issue{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Issue List */}
      <div style={{ padding: '0 16px 100px' }}>
        {filtered.length === 0 && <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>No coordination issues found.</div>}
        {filtered.map(issue => (
          <div key={issue.id} onClick={() => { setSelected(issue); setView('detail'); }}
            style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 10, cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ fontSize: 18 }}>{typeIcon(issue.issue_type)}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {issue.issue_number ? `#${issue.issue_number} — ` : ''}{issue.title}
                  </div>
                  {issue.location && <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{issue.location}</div>}
                </div>
              </div>
              <span style={{ ...badge, background: `rgba(${hexRgb(priorityColor(issue.priority))},0.2)`, color: priorityColor(issue.priority) }}>
                {issue.priority}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ ...badge, background: `rgba(${hexRgb(statusColor(issue.status))},0.2)`, color: statusColor(issue.status) }}>
                {STATUS_LABELS[issue.status] || issue.status}
              </span>
              {issue.ball_in_court && (
                <span style={{ ...badge, background: `rgba(${hexRgb(GOLD)},0.15)`, color: GOLD }}>
                  BIC: {issue.ball_in_court}
                </span>
              )}
              {issue.drawing_ref && (
                <span style={{ fontSize: 11, color: DIM }}>DWG: {issue.drawing_ref}</span>
              )}
              {(issue.cost_impact ?? 0) > 0 && (
                <span style={{ fontSize: 11, color: RED, marginLeft: 'auto' }}>{formatUSD(issue.cost_impact)}</span>
              )}
              {(issue.schedule_impact ?? 0) > 0 && (
                <span style={{ fontSize: 11, color: AMBER }}>+{issue.schedule_impact}d</span>
              )}
            </div>
            {issue.trades_involved.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {issue.trades_involved.map(t => (
                  <span key={t} style={{ fontSize: 10, background: `rgba(${hexRgb(BLUE)},0.15)`, color: BLUE, borderRadius: 6, padding: '1px 6px' }}>{t}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  /* ─────────── DETAIL VIEW ─────────── */
  if (view === 'detail' && selected) {
    const avail = STATUS_FLOW[selected.status] || [];
    return (
      <div style={{ minHeight: '100vh', background: '#07101C', color: TEXT }}>
        {toast && <div style={toastStyle}>{toast}</div>}
        <div style={{ padding: 16 }}>
          <button onClick={() => setView('list')} style={backBtn}>← Back</button>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
              {typeIcon(selected.issue_type)} {selected.issue_number ? `#${selected.issue_number} — ` : ''}{selected.title}
            </h2>
            <span style={{ ...badge, background: `rgba(${hexRgb(priorityColor(selected.priority))},0.2)`, color: priorityColor(selected.priority), fontSize: 12 }}>
              {selected.priority}
            </span>
          </div>

          {/* Status Badge */}
          <div style={{ marginBottom: 16 }}>
            <span style={{ ...badge, background: `rgba(${hexRgb(statusColor(selected.status))},0.2)`, color: statusColor(selected.status), fontSize: 13, padding: '4px 12px' }}>
              {STATUS_LABELS[selected.status] || selected.status}
            </span>
          </div>

          {/* Info Grid */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={detailGrid}>
              <div><span style={detailLbl}>Type</span><span style={detailVal}>{typeLabel(selected.issue_type)}</span></div>
              <div><span style={detailLbl}>Location</span><span style={detailVal}>{selected.location || '—'}</span></div>
              <div><span style={detailLbl}>Drawing Ref</span><span style={detailVal}>{selected.drawing_ref || '—'}</span></div>
              <div><span style={detailLbl}>Assigned To</span><span style={detailVal}>{selected.assigned_to || '—'}</span></div>
              <div><span style={detailLbl}>Ball in Court</span><span style={{ ...detailVal, color: GOLD, fontWeight: 600 }}>{selected.ball_in_court || '—'}</span></div>
              <div><span style={detailLbl}>Due Date</span><span style={detailVal}>{formatDate(selected.due_date)}</span></div>
              <div><span style={detailLbl}>Meeting Date</span><span style={detailVal}>{formatDate(selected.meeting_date)}</span></div>
              <div><span style={detailLbl}>Linked RFI</span><span style={detailVal}>{selected.linked_rfi_id || '—'}</span></div>
            </div>
          </div>

          {/* Description */}
          {selected.description && (
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: DIM, marginBottom: 4, fontWeight: 600 }}>Description</div>
              <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{selected.description}</div>
            </div>
          )}

          {/* Cost & Schedule Impact */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, color: DIM, marginBottom: 4 }}>Cost Impact</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: (selected.cost_impact ?? 0) > 0 ? RED : GREEN }}>
                {formatUSD(selected.cost_impact)}
              </div>
            </div>
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, color: DIM, marginBottom: 4 }}>Schedule Impact</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: (selected.schedule_impact ?? 0) > 0 ? AMBER : GREEN }}>
                {selected.schedule_impact ? `${selected.schedule_impact} days` : '0 days'}
              </div>
            </div>
          </div>

          {/* Trades Involved */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: DIM, marginBottom: 6, fontWeight: 600 }}>Trades Involved</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {selected.trades_involved.length === 0 && <span style={{ color: DIM, fontSize: 13 }}>None specified</span>}
              {selected.trades_involved.map(t => (
                <span key={t} style={{ fontSize: 12, background: `rgba(${hexRgb(BLUE)},0.15)`, color: BLUE, borderRadius: 8, padding: '3px 10px' }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Photos */}
          {selected.photos && selected.photos.length > 0 && (
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: DIM, marginBottom: 6, fontWeight: 600 }}>Photos</div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                {selected.photos.map((p, i) => (
                  <img key={i} src={p} alt={`Photo ${i + 1}`} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
                ))}
              </div>
            </div>
          )}

          {/* Resolution */}
          {selected.resolution && (
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: GREEN, marginBottom: 4, fontWeight: 600 }}>Resolution</div>
              <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{selected.resolution}</div>
              {selected.resolved_by && <div style={{ fontSize: 11, color: DIM, marginTop: 6 }}>Resolved by: {selected.resolved_by} — {formatDate(selected.resolved_date)}</div>}
            </div>
          )}

          {/* Notes */}
          {selected.notes && (
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: DIM, marginBottom: 4, fontWeight: 600 }}>Notes</div>
              <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{selected.notes}</div>
            </div>
          )}

          {/* Status Workflow */}
          {avail.length > 0 && (
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: DIM, marginBottom: 8, fontWeight: 600 }}>Update Status</div>
              {avail.includes('resolved') && (
                <div style={{ marginBottom: 10 }}>
                  <label style={lbl}>Resolution Details</label>
                  <textarea value={resText} onChange={e => setResText(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="Describe the resolution..." />
                  <label style={{ ...lbl, marginTop: 8 }}>Resolved By</label>
                  <input value={resBy} onChange={e => setResBy(e.target.value)} style={inp} placeholder="Name" />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {avail.map(ns => (
                  <button key={ns} onClick={() => handleStatusChange(selected, ns)}
                    style={{ padding: '8px 16px', borderRadius: 10, border: `1px solid ${statusColor(ns)}`, background: `rgba(${hexRgb(statusColor(ns))},0.15)`, color: statusColor(ns), fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    → {STATUS_LABELS[ns]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Export Single Issue */}
          <button onClick={() => {
            const content = `
              <h1>Coordination Issue ${selected.issue_number ? '#' + selected.issue_number : ''}</h1>
              <h2>${selected.title}</h2>
              <table>
                <tr><td><strong>Type</strong></td><td>${typeLabel(selected.issue_type)}</td></tr>
                <tr><td><strong>Priority</strong></td><td>${selected.priority}</td></tr>
                <tr><td><strong>Status</strong></td><td>${STATUS_LABELS[selected.status]}</td></tr>
                <tr><td><strong>Location</strong></td><td>${selected.location || '—'}</td></tr>
                <tr><td><strong>Drawing Ref</strong></td><td>${selected.drawing_ref || '—'}</td></tr>
                <tr><td><strong>Ball in Court</strong></td><td>${selected.ball_in_court || '—'}</td></tr>
                <tr><td><strong>Assigned To</strong></td><td>${selected.assigned_to || '—'}</td></tr>
                <tr><td><strong>Due Date</strong></td><td>${formatDate(selected.due_date)}</td></tr>
                <tr><td><strong>Meeting Date</strong></td><td>${formatDate(selected.meeting_date)}</td></tr>
                <tr><td><strong>Cost Impact</strong></td><td>${formatUSD(selected.cost_impact)}</td></tr>
                <tr><td><strong>Schedule Impact</strong></td><td>${selected.schedule_impact ? selected.schedule_impact + ' days' : '—'}</td></tr>
                <tr><td><strong>Linked RFI</strong></td><td>${selected.linked_rfi_id || '—'}</td></tr>
                <tr><td><strong>Trades</strong></td><td>${selected.trades_involved.join(', ') || '—'}</td></tr>
              </table>
              ${selected.description ? `<h2>Description</h2><p>${selected.description}</p>` : ''}
              ${selected.resolution ? `<h2>Resolution</h2><p>${selected.resolution}</p><p style="color:#666;font-size:12px;">Resolved by ${selected.resolved_by || '—'} on ${formatDate(selected.resolved_date)}</p>` : ''}
              ${selected.notes ? `<h2>Notes</h2><p>${selected.notes}</p>` : ''}`;
            exportPDF(`Issue ${selected.issue_number || ''}`, content);
          }} style={{ ...headerBtn, width: '100%', marginTop: 4, fontSize: 14, padding: 12 }}>
            🖨 Export Issue PDF
          </button>
        </div>
      </div>
    );
  }

  /* ─────────── CREATE VIEW ─────────── */
  if (view === 'create') return (
    <div style={{ minHeight: '100vh', background: '#07101C', color: TEXT }}>
      {toast && <div style={toastStyle}>{toast}</div>}
      <div style={{ padding: 16 }}>
        <button onClick={() => setView('list')} style={backBtn}>← Cancel</button>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: GOLD }}>New Coordination Issue</h2>

        {/* Title */}
        <label style={lbl}>Title *</label>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inp} placeholder="Issue title" />

        {/* Issue Type */}
        <label style={{ ...lbl, marginTop: 14 }}>Issue Type</label>
        <select value={form.issue_type} onChange={e => setForm(f => ({ ...f, issue_type: e.target.value }))} style={inp}>
          {ISSUE_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
        </select>

        {/* Description */}
        <label style={{ ...lbl, marginTop: 14 }}>Description</label>
        <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} style={{ ...inp, resize: 'vertical' }} placeholder="Describe the coordination issue..." />

        {/* Location & Drawing Ref */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          <div>
            <label style={lbl}>Location</label>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} style={inp} placeholder="Building / Floor / Area" />
          </div>
          <div>
            <label style={lbl}>Drawing Reference</label>
            <input value={form.drawing_ref} onChange={e => setForm(f => ({ ...f, drawing_ref: e.target.value }))} style={inp} placeholder="e.g. M-201" />
          </div>
        </div>

        {/* Priority & Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          <div>
            <label style={lbl}>Priority</label>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inp}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inp}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </div>

        {/* Assigned To & Ball in Court */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          <div>
            <label style={lbl}>Assigned To</label>
            <input value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} style={inp} placeholder="Person responsible" />
          </div>
          <div>
            <label style={lbl}>Ball in Court</label>
            <input value={form.ball_in_court} onChange={e => setForm(f => ({ ...f, ball_in_court: e.target.value }))} style={inp} placeholder="Who must act next" />
          </div>
        </div>

        {/* Due Date & Meeting Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          <div>
            <label style={lbl}>Due Date</label>
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={lbl}>Meeting Date</label>
            <input type="date" value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} style={inp} />
          </div>
        </div>

        {/* Cost & Schedule Impact */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          <div>
            <label style={lbl}>Cost Impact ($)</label>
            <input type="number" value={form.cost_impact} onChange={e => setForm(f => ({ ...f, cost_impact: e.target.value }))} style={inp} placeholder="0.00" step="0.01" />
          </div>
          <div>
            <label style={lbl}>Schedule Impact (days)</label>
            <input type="number" value={form.schedule_impact} onChange={e => setForm(f => ({ ...f, schedule_impact: e.target.value }))} style={inp} placeholder="0" />
          </div>
        </div>

        {/* Linked RFI */}
        <label style={{ ...lbl, marginTop: 14 }}>Linked RFI ID</label>
        <input value={form.linked_rfi_id} onChange={e => setForm(f => ({ ...f, linked_rfi_id: e.target.value }))} style={inp} placeholder="RFI reference" />

        {/* Trades Involved (Multi-select checkboxes) */}
        <label style={{ ...lbl, marginTop: 14 }}>Trades Involved</label>
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, maxHeight: 200, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {TRADES.map(trade => (
              <label key={trade} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: form.trades_involved.includes(trade) ? BLUE : DIM, cursor: 'pointer', padding: '4px 0' }}>
                <input type="checkbox" checked={form.trades_involved.includes(trade)} onChange={() => toggleTrade(trade)}
                  style={{ accentColor: BLUE, width: 16, height: 16 }} />
                {trade}
              </label>
            ))}
          </div>
        </div>
        {form.trades_involved.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
            {form.trades_involved.map(t => (
              <span key={t} onClick={() => toggleTrade(t)} style={{ fontSize: 11, background: `rgba(${hexRgb(BLUE)},0.15)`, color: BLUE, borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                {t} ✕
              </span>
            ))}
          </div>
        )}

        {/* Notes */}
        <label style={{ ...lbl, marginTop: 14 }}>Notes</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="Additional notes..." />

        {/* Photo Capture */}
        <label style={{ ...lbl, marginTop: 14 }}>Photos</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {photoPreview.map((src, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={src} alt={`Preview ${i + 1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
              <button onClick={() => removePhoto(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: RED, color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
          ))}
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: `rgba(${hexRgb(BLUE)},0.15)`, border: `1px solid ${BLUE}`, borderRadius: 10, color: BLUE, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
          📷 Capture Photo
          <input type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoCapture} style={{ display: 'none' }} />
        </label>

        {/* Submit */}
        <button onClick={handleCreate} disabled={saving}
          style={{ width: '100%', marginTop: 20, marginBottom: 40, padding: 14, background: GOLD, color: '#07101C', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving...' : 'Create Issue'}
        </button>
      </div>
    </div>
  );

  return null;
}

/* ─── Shared Styles ─── */
const toastStyle: React.CSSProperties = {
  position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: GOLD, color: '#07101C',
  padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
};
const headerBtn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: RAISED, color: TEXT,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const summaryCard: React.CSSProperties = {
  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px',
};
const filterSelect: React.CSSProperties = {
  background: '#07101C', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 8px',
  color: TEXT, fontSize: 12, outline: 'none', flex: 1, minWidth: 90,
};
const sortBtn: React.CSSProperties = {
  background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '3px 10px',
  fontSize: 11, cursor: 'pointer', fontWeight: 600,
};
const badge: React.CSSProperties = {
  display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
};
const backBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: '8px', marginLeft: -8,
  display: 'flex', alignItems: 'center', marginBottom: 4, fontSize: 14,
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, color: DIM, marginBottom: 4, fontWeight: 600,
};
const inp: React.CSSProperties = {
  width: '100%', background: '#07101C', border: `1px solid ${BORDER}`, borderRadius: 10,
  padding: '11px 14px', color: TEXT, fontSize: 15, outline: 'none', boxSizing: 'border-box',
};
const detailGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px',
};
const detailLbl: React.CSSProperties = {
  display: 'block', fontSize: 11, color: DIM, marginBottom: 2,
};
const detailVal: React.CSSProperties = {
  display: 'block', fontSize: 14, fontWeight: 500,
};

/* ─── Suspense Wrapper ─── */
export default function FieldCoordinationPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: DIM, textAlign: 'center' }}>Loading...</div>}>
      <CoordinationPage />
    </Suspense>
  );
}
