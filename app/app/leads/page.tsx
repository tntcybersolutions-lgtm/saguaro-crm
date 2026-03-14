'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';

/* ─── Palette ─── */
const GOLD = '#D4A017', BG = '#07101C', RAISED = '#0D1D2E', BORDER = '#1E3A5F', TEXT = '#F0F4FF', DIM = '#8BAAC8';
const GREEN = '#22C55E', RED = '#EF4444', AMBER = '#F59E0B', BLUE = '#3B82F6', PURPLE = '#8B5CF6';

/* ─── Constants ─── */
const STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const;
type Stage = typeof STAGES[number];
const STAGE_COLORS: Record<Stage, string> = {
  New: BLUE, Contacted: PURPLE, Qualified: AMBER, Proposal: GOLD,
  Negotiation: '#F97316', Won: GREEN, Lost: RED,
};
const SOURCES = ['Website', 'Referral', 'Cold Call', 'Social Media', 'Trade Show', 'Advertisement', 'Repeat Client', 'Other'] as const;
const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note'] as const;
const ACTIVITY_LABELS: Record<string, string> = { call: 'Phone Call', email: 'Email', meeting: 'Meeting', note: 'Note' };
const ACTIVITY_ICONS: Record<string, string> = { call: '\u260E', email: '\u2709', meeting: '\uD83E\uDD1D', note: '\uD83D\uDCDD' };

/* ─── Types ─── */
type Lead = {
  id: string; company_name: string; contact_name: string; contact_email: string;
  contact_phone: string; source: string; estimated_value: number; stage: Stage;
  notes: string; tags: string[]; created_at: string; updated_at: string;
};
type Activity = {
  id: string; lead_id: string; activity_type: string; description: string;
  scheduled_at: string; created_at: string;
};

/* ─── Helpers ─── */
const fmt = (n: number) =>
  '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014';
const fmtTime = (d: string) =>
  d ? new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

/* ─── Shared Styles ─── */
const inputS: React.CSSProperties = {
  padding: '9px 13px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
  color: TEXT, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
};
const btnS = (bg: string, c: string = '#000'): React.CSSProperties => ({
  padding: '8px 18px', background: bg, color: c, border: 'none', borderRadius: 8,
  fontWeight: 700, fontSize: 13, cursor: 'pointer',
});
const cardS: React.CSSProperties = {
  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14,
  marginBottom: 10, cursor: 'pointer', transition: 'border-color .15s',
};
const chipS = (bg: string, c: string): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11,
  fontWeight: 700, background: bg, color: c, marginRight: 4, marginBottom: 4,
});
const labelS: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 4, display: 'block',
};
const overlayS: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000,
  display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
  paddingTop: 60, overflowY: 'auto',
};
const modalS: React.CSSProperties = {
  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28,
  width: '100%', maxWidth: 620, color: TEXT, position: 'relative', marginBottom: 60,
};
const selectS: React.CSSProperties = { ...inputS, cursor: 'pointer', appearance: 'auto' as any };

const emptyLead = (): Partial<Lead> => ({
  company_name: '', contact_name: '', contact_email: '', contact_phone: '',
  source: 'Website', stage: 'New', estimated_value: 0, notes: '', tags: [],
});

/* ═══════════════════════════════ MAIN PAGE ═══════════════════════════════ */
export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'kanban' | 'list' | 'funnel'>('kanban');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editLead, setEditLead] = useState<Partial<Lead> | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [actLoading, setActLoading] = useState(false);
  const [actForm, setActForm] = useState({ activity_type: 'call', description: '', scheduled_at: '' });
  const [actSaving, setActSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [sortCol, setSortCol] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null);

  /* ─── Fetch leads ─── */
  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const r = await fetch('/api/leads');
      if (!r.ok) throw new Error('Failed to load leads');
      const d = await r.json();
      setLeads(d.leads ?? []);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  /* ─── Fetch activities for a lead ─── */
  const fetchActivities = useCallback(async (leadId: string) => {
    setActLoading(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/activities`);
      if (!r.ok) throw new Error('Failed to load activities');
      const d = await r.json();
      setActivities(d.activities ?? []);
    } catch {
      setActivities([]);
    } finally {
      setActLoading(false);
    }
  }, []);

  /* ─── Filtering ─── */
  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (stageFilter !== 'all' && l.stage !== stageFilter) return false;
      if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;
      if (valueMin && l.estimated_value < Number(valueMin)) return false;
      if (valueMax && l.estimated_value > Number(valueMax)) return false;
      if (search) {
        const q = search.toLowerCase();
        const fields = [l.company_name, l.contact_name, l.contact_email, l.contact_phone, ...(l.tags || [])];
        if (!fields.some(f => (f || '').toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [leads, stageFilter, sourceFilter, valueMin, valueMax, search]);

  /* ─── Sorted (list view) ─── */
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a: any, b: any) => {
      let va = a[sortCol] ?? '', vb = b[sortCol] ?? '';
      if (typeof va === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [filtered, sortCol, sortDir]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  /* ─── Pipeline Metrics ─── */
  const metrics = useMemo(() => {
    const totalVal = leads.reduce((s, l) => s + (l.estimated_value || 0), 0);
    const won = leads.filter(l => l.stage === 'Won');
    const lost = leads.filter(l => l.stage === 'Lost');
    const wonVal = won.reduce((s, l) => s + (l.estimated_value || 0), 0);
    const activeVal = leads
      .filter(l => l.stage !== 'Won' && l.stage !== 'Lost')
      .reduce((s, l) => s + (l.estimated_value || 0), 0);
    const winRate = won.length + lost.length > 0
      ? Math.round(won.length / (won.length + lost.length) * 100)
      : 0;
    const avgDeal = won.length > 0 ? wonVal / won.length : 0;
    const byStage: Record<string, { count: number; value: number }> = {};
    STAGES.forEach(s => { byStage[s] = { count: 0, value: 0 }; });
    leads.forEach(l => {
      if (byStage[l.stage]) {
        byStage[l.stage].count++;
        byStage[l.stage].value += (l.estimated_value || 0);
      }
    });
    return { total: leads.length, totalVal, wonVal, activeVal, winRate, avgDeal, byStage };
  }, [leads]);

  /* ─── Create / Update lead ─── */
  const handleSave = async () => {
    if (!editLead) return;
    setSaving(true);
    try {
      const isEdit = !!editLead.id;
      const url = isEdit ? `/api/leads/${editLead.id}` : '/api/leads';
      const method = isEdit ? 'PATCH' : 'POST';
      const body = {
        company_name: editLead.company_name,
        contact_name: editLead.contact_name,
        contact_email: editLead.contact_email,
        contact_phone: editLead.contact_phone,
        source: editLead.source,
        estimated_value: Number(editLead.estimated_value) || 0,
        stage: editLead.stage,
        notes: editLead.notes,
        tags: editLead.tags || [],
      };
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      setShowModal(false);
      setEditLead(null);
      fetchLeads();
    } catch (e: any) {
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  /* ─── Move stage (kanban click) ─── */
  const moveToStage = async (lead: Lead, newStage: Stage) => {
    setMoveMenuId(null);
    try {
      const r = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });
      if (!r.ok) throw new Error('Failed to update stage');
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: newStage } : l));
    } catch (e: any) {
      alert('Move failed: ' + e.message);
    }
  };

  /* ─── Delete lead ─── */
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this lead permanently?')) return;
    try {
      const r = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Delete failed');
      setLeads(prev => prev.filter(l => l.id !== id));
      if (detailLead?.id === id) setDetailLead(null);
    } catch (e: any) {
      alert(e.message);
    }
  };

  /* ─── Create activity ─── */
  const handleCreateActivity = async () => {
    if (!detailLead || !actForm.description.trim()) return;
    setActSaving(true);
    try {
      const r = await fetch(`/api/leads/${detailLead.id}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actForm),
      });
      if (!r.ok) throw new Error('Failed to create activity');
      setActForm({ activity_type: 'call', description: '', scheduled_at: '' });
      fetchActivities(detailLead.id);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActSaving(false);
    }
  };

  /* ─── Open detail panel ─── */
  const openDetail = (lead: Lead) => {
    setDetailLead(lead);
    fetchActivities(lead.id);
  };

  /* ─── Tag management ─── */
  const addTag = () => {
    if (!tagInput.trim() || !editLead) return;
    const tags = [...(editLead.tags || []), tagInput.trim()];
    setEditLead({ ...editLead, tags });
    setTagInput('');
  };
  const removeTag = (idx: number) => {
    if (!editLead) return;
    const tags = (editLead.tags || []).filter((_, i) => i !== idx);
    setEditLead({ ...editLead, tags });
  };

  /* ─── Funnel data ─── */
  const funnelData = useMemo(() => {
    const pipeline = STAGES.filter(s => s !== 'Lost');
    let maxCount = 0;
    const data = pipeline.map(s => {
      const count = leads.filter(l => l.stage === s).length;
      if (count > maxCount) maxCount = count;
      const value = leads.filter(l => l.stage === s).reduce((a, l) => a + (l.estimated_value || 0), 0);
      return { stage: s, count, value };
    });
    return { data, maxCount: maxCount || 1 };
  }, [leads]);

  /* ─── Conversion rates between stages ─── */
  const conversionRates = useMemo(() => {
    const pipeline = STAGES.filter(s => s !== 'Lost');
    const rates: { from: string; to: string; rate: number }[] = [];
    for (let i = 0; i < pipeline.length - 1; i++) {
      const fromCount = leads.filter(l => {
        const idx = STAGES.indexOf(l.stage);
        return idx >= STAGES.indexOf(pipeline[i]);
      }).length;
      const toCount = leads.filter(l => {
        const idx = STAGES.indexOf(l.stage);
        return idx >= STAGES.indexOf(pipeline[i + 1]);
      }).length;
      const rate = fromCount > 0 ? Math.round(toCount / fromCount * 100) : 0;
      rates.push({ from: pipeline[i], to: pipeline[i + 1], rate });
    }
    return rates;
  }, [leads]);

  /* ─── CSV Export ─── */
  const exportCSV = () => {
    const cols = [
      'company_name', 'contact_name', 'contact_email', 'contact_phone',
      'source', 'stage', 'estimated_value', 'notes', 'tags', 'created_at',
    ];
    const header = cols.join(',');
    const rows = filtered.map(l =>
      cols.map(c => {
        const v = (l as any)[c];
        const s = Array.isArray(v) ? v.join(';') : String(v ?? '');
        return s.includes(',') ? `"${s}"` : s;
      }).join(',')
    );
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'leads_export.csv';
    a.click();
  };

  /* ═══════════════════════════════ RENDER ═══════════════════════════════ */
  return (
    <div style={{
      padding: '28px 32px', maxWidth: 1600, margin: '0 auto', color: TEXT,
      fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
    }}>

      {/* ─── Header ─── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 24, flexWrap: 'wrap', gap: 14,
      }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 2,
            textTransform: 'uppercase', color: DIM,
          }}>CRM</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: TEXT }}>
            Lead Pipeline
          </h1>
          <div style={{ fontSize: 13, color: DIM, marginTop: 4 }}>
            {loading
              ? 'Loading leads...'
              : `${filtered.length} lead${filtered.length !== 1 ? 's' : ''} \u00B7 Pipeline ${fmt(metrics.totalVal)}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {(['kanban', 'list', 'funnel'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              ...btnS(view === v ? GOLD : 'transparent', view === v ? '#000' : DIM),
              border: view === v ? 'none' : `1px solid ${BORDER}`, textTransform: 'capitalize',
            }}>
              {v === 'kanban' ? 'Board' : v === 'list' ? 'List' : 'Funnel'}
            </button>
          ))}
          <button onClick={exportCSV} style={{
            ...btnS('transparent', DIM), border: `1px solid ${BORDER}`,
          }}>Export CSV</button>
          <button onClick={() => { setEditLead(emptyLead()); setShowModal(true); }}
            style={btnS(`linear-gradient(135deg,${GOLD},#F0C040)`)}>
            + New Lead
          </button>
        </div>
      </div>

      {/* ─── Pipeline Value Summary Cards ─── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
        gap: 12, marginBottom: 22,
      }}>
        {[
          { label: 'Total Pipeline', value: fmt(metrics.totalVal), color: GOLD, sub: `${metrics.total} leads` },
          { label: 'Active Pipeline', value: fmt(metrics.activeVal), color: BLUE, sub: 'excl. Won/Lost' },
          { label: 'Won Revenue', value: fmt(metrics.wonVal), color: GREEN, sub: `${metrics.byStage['Won']?.count || 0} deals` },
          { label: 'Win Rate', value: `${metrics.winRate}%`, color: metrics.winRate >= 50 ? GREEN : metrics.winRate >= 25 ? AMBER : RED, sub: 'won / (won+lost)' },
          { label: 'Avg Deal Size', value: fmt(metrics.avgDeal), color: PURPLE, sub: 'won deals' },
        ].map(m => (
          <div key={m.label} style={{
            background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10,
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* ─── Filters ─── */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center',
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search company, contact, email, tags..."
          style={{ ...inputS, width: 280 }}
        />
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
          style={{ ...selectS, width: 150 }}>
          <option value="all">All Stages</option>
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          style={{ ...selectS, width: 160 }}>
          <option value="all">All Sources</option>
          {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="number" placeholder="Min value" value={valueMin}
          onChange={e => setValueMin(e.target.value)}
          style={{ ...inputS, width: 120 }}
        />
        <input
          type="number" placeholder="Max value" value={valueMax}
          onChange={e => setValueMax(e.target.value)}
          style={{ ...inputS, width: 120 }}
        />
        {(search || stageFilter !== 'all' || sourceFilter !== 'all' || valueMin || valueMax) && (
          <button onClick={() => {
            setSearch(''); setStageFilter('all'); setSourceFilter('all');
            setValueMin(''); setValueMax('');
          }} style={{
            ...btnS('transparent', DIM), border: `1px solid ${BORDER}`, fontSize: 12,
          }}>Clear Filters</button>
        )}
      </div>

      {/* ─── Error state ─── */}
      {error && (
        <div style={{
          padding: 14, background: 'rgba(239,68,68,.12)', border: `1px solid ${RED}`,
          borderRadius: 10, color: RED, fontSize: 13, marginBottom: 16,
        }}>
          {error}
          <button onClick={fetchLeads} style={{
            ...btnS(RED, '#fff'), padding: '4px 12px', marginLeft: 10, fontSize: 12,
          }}>Retry</button>
        </div>
      )}

      {/* ─── Loading state ─── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Loading leads...</div>
          <div style={{
            width: 40, height: 40, border: `3px solid ${BORDER}`,
            borderTop: `3px solid ${GOLD}`, borderRadius: '50%',
            margin: '0 auto', animation: 'spin 1s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!loading && !error && leads.length === 0 && (
        <div style={{ textAlign: 'center', padding: 80, color: DIM }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>&#x1F4CB;</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
            No leads yet
          </div>
          <div style={{ fontSize: 14, marginBottom: 20 }}>
            Start building your pipeline by adding your first lead.
          </div>
          <button onClick={() => { setEditLead(emptyLead()); setShowModal(true); }}
            style={btnS(`linear-gradient(135deg,${GOLD},#F0C040)`)}>
            + Add First Lead
          </button>
        </div>
      )}

      {/* ─── No filter results ─── */}
      {!loading && leads.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>No leads match your filters</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            Try adjusting your search or filter criteria.
          </div>
        </div>
      )}

      {/* ═══════════════════ KANBAN VIEW ═══════════════════ */}
      {!loading && view === 'kanban' && filtered.length > 0 && (
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 20 }}>
          {STAGES.map(stage => {
            const stageLeads = filtered.filter(l => l.stage === stage);
            const stageVal = stageLeads.reduce((s, l) => s + (l.estimated_value || 0), 0);
            return (
              <div key={stage} style={{ minWidth: 260, maxWidth: 300, flex: '1 0 260px' }}>
                {/* Column header */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 10, padding: '8px 12px', background: RAISED, borderRadius: 10,
                  border: `1px solid ${BORDER}`, borderTop: `3px solid ${STAGE_COLORS[stage]}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>{stage}</span>
                    <span style={{ ...chipS('rgba(255,255,255,.08)', DIM) }}>
                      {stageLeads.length}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: DIM, fontWeight: 600 }}>{fmt(stageVal)}</span>
                </div>

                {/* Cards container */}
                <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
                  {stageLeads.length === 0 && (
                    <div style={{
                      padding: '20px 12px', textAlign: 'center', color: DIM, fontSize: 12,
                      border: `1px dashed ${BORDER}`, borderRadius: 8,
                      background: 'rgba(255,255,255,.01)',
                    }}>No leads</div>
                  )}

                  {stageLeads.map(lead => (
                    <div key={lead.id} style={{
                      ...cardS, borderLeft: `3px solid ${STAGE_COLORS[stage]}`,
                      position: 'relative',
                    }}>
                      <div onClick={() => openDetail(lead)} style={{ cursor: 'pointer' }}>
                        <div style={{
                          fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 4,
                        }}>{lead.company_name || 'Untitled'}</div>
                        <div style={{ fontSize: 12, color: DIM, marginBottom: 4 }}>
                          {lead.contact_name}
                        </div>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: 6,
                        }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: GOLD }}>
                            {fmt(lead.estimated_value)}
                          </span>
                          <span style={{ fontSize: 11, color: DIM }}>{lead.source}</span>
                        </div>
                        {(lead.tags || []).length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                            {lead.tags.slice(0, 3).map((t, i) => (
                              <span key={i} style={chipS('rgba(212,160,23,.15)', GOLD)}>{t}</span>
                            ))}
                            {lead.tags.length > 3 && (
                              <span style={{ fontSize: 11, color: DIM }}>
                                +{lead.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Move / Edit buttons */}
                      <div style={{ marginTop: 8, display: 'flex', gap: 4, position: 'relative' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoveMenuId(moveMenuId === lead.id ? null : lead.id);
                          }}
                          style={{
                            ...btnS('transparent', DIM), padding: '4px 10px',
                            fontSize: 11, border: `1px solid ${BORDER}`,
                          }}
                        >Move &#x25BE;</button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditLead(lead);
                            setShowModal(true);
                          }}
                          style={{
                            ...btnS('transparent', DIM), padding: '4px 10px',
                            fontSize: 11, border: `1px solid ${BORDER}`,
                          }}
                        >Edit</button>

                        {/* Stage move dropdown */}
                        {moveMenuId === lead.id && (
                          <div style={{
                            position: 'absolute', top: 28, left: 0, background: RAISED,
                            border: `1px solid ${BORDER}`, borderRadius: 8, padding: 4,
                            zIndex: 100, minWidth: 140,
                            boxShadow: '0 8px 24px rgba(0,0,0,.4)',
                          }}>
                            {STAGES.filter(s => s !== lead.stage).map(s => (
                              <div key={s}
                                onClick={(e) => { e.stopPropagation(); moveToStage(lead, s); }}
                                style={{
                                  padding: '6px 12px', fontSize: 12, color: TEXT,
                                  cursor: 'pointer', borderRadius: 6,
                                  display: 'flex', alignItems: 'center', gap: 8,
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = BG)}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              >
                                <div style={{
                                  width: 8, height: 8, borderRadius: 99,
                                  background: STAGE_COLORS[s],
                                }} />
                                {s}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════ LIST VIEW ═══════════════════ */}
      {!loading && view === 'list' && filtered.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                {[
                  { key: 'company_name', label: 'Company' },
                  { key: 'contact_name', label: 'Contact' },
                  { key: 'contact_email', label: 'Email' },
                  { key: 'stage', label: 'Stage' },
                  { key: 'estimated_value', label: 'Value' },
                  { key: 'source', label: 'Source' },
                  { key: 'created_at', label: 'Created' },
                  { key: '_actions', label: 'Actions' },
                ].map(col => (
                  <th key={col.key}
                    onClick={() => col.key !== '_actions' && toggleSort(col.key)}
                    style={{
                      textAlign: 'left', padding: '10px 12px', color: DIM,
                      fontWeight: 700, fontSize: 11, textTransform: 'uppercase',
                      letterSpacing: 1,
                      cursor: col.key !== '_actions' ? 'pointer' : 'default',
                      whiteSpace: 'nowrap', userSelect: 'none',
                    }}
                  >
                    {col.label}{' '}
                    {sortCol === col.key ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(lead => (
                <tr key={lead.id}
                  style={{
                    borderBottom: `1px solid ${BORDER}`, cursor: 'pointer',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: TEXT }}
                    onClick={() => openDetail(lead)}>{lead.company_name}</td>
                  <td style={{ padding: '10px 12px', color: DIM }}
                    onClick={() => openDetail(lead)}>{lead.contact_name}</td>
                  <td style={{ padding: '10px 12px', color: DIM }}
                    onClick={() => openDetail(lead)}>{lead.contact_email}</td>
                  <td style={{ padding: '10px 12px' }} onClick={() => openDetail(lead)}>
                    <span style={{
                      ...chipS(STAGE_COLORS[lead.stage] + '22', STAGE_COLORS[lead.stage]),
                      border: `1px solid ${STAGE_COLORS[lead.stage]}44`,
                    }}>{lead.stage}</span>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: GOLD }}
                    onClick={() => openDetail(lead)}>{fmt(lead.estimated_value)}</td>
                  <td style={{ padding: '10px 12px', color: DIM }}
                    onClick={() => openDetail(lead)}>{lead.source}</td>
                  <td style={{ padding: '10px 12px', color: DIM, fontSize: 12 }}
                    onClick={() => openDetail(lead)}>{fmtDate(lead.created_at)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setEditLead(lead); setShowModal(true); }}
                        style={{
                          ...btnS('transparent', DIM), padding: '3px 10px',
                          fontSize: 11, border: `1px solid ${BORDER}`,
                        }}>Edit</button>
                      <button onClick={() => handleDelete(lead.id)}
                        style={{
                          ...btnS('transparent', RED), padding: '3px 10px',
                          fontSize: 11, border: `1px solid ${RED}44`,
                        }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════════════ FUNNEL VIEW ═══════════════════ */}
      {!loading && view === 'funnel' && leads.length > 0 && (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 18, fontWeight: 700, color: TEXT,
            marginBottom: 20, textAlign: 'center',
          }}>Sales Funnel</h2>

          {funnelData.data.map((item, idx) => {
            const widthPct = Math.max(20, (item.count / funnelData.maxCount) * 100);
            return (
              <div key={item.stage} style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 100, textAlign: 'right', fontSize: 13,
                    fontWeight: 600, color: TEXT, flexShrink: 0,
                  }}>{item.stage}</div>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <div style={{
                      width: `${widthPct}%`, height: 44,
                      background: `linear-gradient(135deg, ${STAGE_COLORS[item.stage as Stage]}CC, ${STAGE_COLORS[item.stage as Stage]}88)`,
                      borderRadius: 6, display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', padding: '0 16px',
                      margin: '0 auto', transition: 'width .3s ease',
                    }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>
                        {item.count} lead{item.count !== 1 ? 's' : ''}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'rgba(255,255,255,.85)' }}>
                        {fmt(item.value)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Conversion rate arrow */}
                {idx < conversionRates.length && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    marginLeft: 100, paddingLeft: 16, marginTop: 2, marginBottom: 2,
                  }}>
                    <div style={{
                      fontSize: 11, color: DIM,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{
                        color: conversionRates[idx].rate >= 50
                          ? GREEN
                          : conversionRates[idx].rate >= 25 ? AMBER : RED,
                        fontWeight: 700,
                      }}>
                        {conversionRates[idx].rate}%
                      </span>
                      <span>{'\u2193'} conversion</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Funnel summary cards */}
          <div style={{
            marginTop: 28, display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr', gap: 14,
          }}>
            <div style={{
              background: RAISED, border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: 16, textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, color: DIM, marginBottom: 4 }}>Overall Win Rate</div>
              <div style={{
                fontSize: 24, fontWeight: 800,
                color: metrics.winRate >= 50 ? GREEN : metrics.winRate >= 25 ? AMBER : RED,
              }}>{metrics.winRate}%</div>
            </div>
            <div style={{
              background: RAISED, border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: 16, textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, color: DIM, marginBottom: 4 }}>
                Avg Deal Size (Won)
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: GOLD }}>
                {fmt(metrics.avgDeal)}
              </div>
            </div>
            <div style={{
              background: RAISED, border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: 16, textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, color: DIM, marginBottom: 4 }}>Active Leads</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: BLUE }}>
                {leads.filter(l => l.stage !== 'Won' && l.stage !== 'Lost').length}
              </div>
            </div>
          </div>

          {/* Stage breakdown table */}
          <div style={{
            marginTop: 24, background: RAISED, border: `1px solid ${BORDER}`,
            borderRadius: 10, padding: 20,
          }}>
            <h3 style={{
              fontSize: 14, fontWeight: 700, color: TEXT,
              marginBottom: 14, marginTop: 0,
            }}>Stage Breakdown</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {['Stage', 'Count', 'Value', '% of Pipeline'].map((h, i) => (
                    <th key={h} style={{
                      textAlign: i === 0 ? 'left' : 'right', padding: '8px 10px',
                      color: DIM, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STAGES.map(s => {
                  const d = metrics.byStage[s];
                  const pct = metrics.total > 0
                    ? Math.round((d?.count || 0) / metrics.total * 100)
                    : 0;
                  return (
                    <tr key={s} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                      <td style={{
                        padding: '8px 10px', display: 'flex',
                        alignItems: 'center', gap: 8,
                      }}>
                        <div style={{
                          width: 10, height: 10, borderRadius: 99,
                          background: STAGE_COLORS[s],
                        }} />
                        <span style={{ color: TEXT, fontWeight: 600 }}>{s}</span>
                      </td>
                      <td style={{
                        padding: '8px 10px', textAlign: 'right',
                        color: TEXT, fontWeight: 700,
                      }}>{d?.count || 0}</td>
                      <td style={{
                        padding: '8px 10px', textAlign: 'right',
                        color: GOLD, fontWeight: 700,
                      }}>{fmt(d?.value || 0)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'flex-end', gap: 8,
                        }}>
                          <div style={{
                            width: 60, height: 6, background: BG,
                            borderRadius: 3, overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${pct}%`, height: '100%',
                              background: STAGE_COLORS[s], borderRadius: 3,
                            }} />
                          </div>
                          <span style={{ color: DIM, fontSize: 12, minWidth: 30 }}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════ ADD/EDIT MODAL ═══════════════════ */}
      {showModal && editLead && (
        <div style={overlayS} onClick={() => { setShowModal(false); setEditLead(null); }}>
          <div style={modalS} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 800, color: TEXT }}>
              {editLead.id ? 'Edit Lead' : 'New Lead'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelS}>Company Name *</label>
                <input
                  value={editLead.company_name || ''}
                  onChange={e => setEditLead({ ...editLead, company_name: e.target.value })}
                  style={inputS} placeholder="Acme Corp"
                />
              </div>
              <div>
                <label style={labelS}>Contact Name</label>
                <input
                  value={editLead.contact_name || ''}
                  onChange={e => setEditLead({ ...editLead, contact_name: e.target.value })}
                  style={inputS} placeholder="John Smith"
                />
              </div>
              <div>
                <label style={labelS}>Contact Email</label>
                <input
                  type="email"
                  value={editLead.contact_email || ''}
                  onChange={e => setEditLead({ ...editLead, contact_email: e.target.value })}
                  style={inputS} placeholder="john@acme.com"
                />
              </div>
              <div>
                <label style={labelS}>Contact Phone</label>
                <input
                  value={editLead.contact_phone || ''}
                  onChange={e => setEditLead({ ...editLead, contact_phone: e.target.value })}
                  style={inputS} placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label style={labelS}>Source</label>
                <select
                  value={editLead.source || 'Website'}
                  onChange={e => setEditLead({ ...editLead, source: e.target.value })}
                  style={selectS}
                >
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelS}>Stage</label>
                <select
                  value={editLead.stage || 'New'}
                  onChange={e => setEditLead({ ...editLead, stage: e.target.value as Stage })}
                  style={selectS}
                >
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelS}>Estimated Value ($)</label>
                <input
                  type="number"
                  value={editLead.estimated_value || ''}
                  onChange={e => setEditLead({ ...editLead, estimated_value: Number(e.target.value) })}
                  style={inputS} placeholder="50000"
                />
              </div>
              <div>
                <label style={labelS}>Tags</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); addTag(); }
                    }}
                    style={{ ...inputS, flex: 1 }} placeholder="Add tag + Enter"
                  />
                  <button onClick={addTag} style={{
                    ...btnS(BORDER, TEXT), padding: '8px 12px',
                  }}>+</button>
                </div>
                {(editLead.tags || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {editLead.tags!.map((t, i) => (
                      <span key={i}
                        style={{ ...chipS('rgba(212,160,23,.15)', GOLD), cursor: 'pointer' }}
                        onClick={() => removeTag(i)}
                      >{t} {'\u2715'}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={labelS}>Notes</label>
              <textarea
                value={editLead.notes || ''}
                onChange={e => setEditLead({ ...editLead, notes: e.target.value })}
                style={{ ...inputS, height: 80, resize: 'vertical' }}
                placeholder="Additional notes about this lead..."
              />
            </div>
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20,
            }}>
              {editLead.id && (
                <button onClick={() => {
                  handleDelete(editLead.id!);
                  setShowModal(false);
                  setEditLead(null);
                }} style={{
                  ...btnS('transparent', RED), border: `1px solid ${RED}44`,
                  marginRight: 'auto',
                }}>Delete</button>
              )}
              <button onClick={() => { setShowModal(false); setEditLead(null); }}
                style={{
                  ...btnS('transparent', DIM), border: `1px solid ${BORDER}`,
                }}>Cancel</button>
              <button onClick={handleSave}
                disabled={saving || !editLead.company_name?.trim()}
                style={{
                  ...btnS(saving ? DIM : `linear-gradient(135deg,${GOLD},#F0C040)`),
                  opacity: saving || !editLead.company_name?.trim() ? 0.5 : 1,
                }}
              >
                {saving ? 'Saving...' : editLead.id ? 'Update Lead' : 'Create Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ LEAD DETAIL / ACTIVITY PANEL ═══════════════════ */}
      {detailLead && (
        <div style={overlayS} onClick={() => setDetailLead(null)}>
          <div style={{ ...modalS, maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-start', marginBottom: 20,
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>
                  {detailLead.company_name}
                </h2>
                <div style={{ fontSize: 13, color: DIM, marginTop: 4 }}>
                  {detailLead.contact_name}
                  {detailLead.contact_email ? ` \u00B7 ${detailLead.contact_email}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{
                  ...chipS(STAGE_COLORS[detailLead.stage] + '22', STAGE_COLORS[detailLead.stage]),
                  border: `1px solid ${STAGE_COLORS[detailLead.stage]}44`,
                  fontSize: 12, padding: '4px 14px',
                }}>{detailLead.stage}</span>
                <button onClick={() => setDetailLead(null)} style={{
                  background: 'none', border: 'none', color: DIM,
                  fontSize: 22, cursor: 'pointer', padding: 4,
                }}>{'\u2715'}</button>
              </div>
            </div>

            {/* Lead info grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12, marginBottom: 20,
            }}>
              <div style={{ background: BG, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: DIM, marginBottom: 2 }}>Value</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>
                  {fmt(detailLead.estimated_value)}
                </div>
              </div>
              <div style={{ background: BG, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: DIM, marginBottom: 2 }}>Source</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>
                  {detailLead.source}
                </div>
              </div>
              <div style={{ background: BG, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: DIM, marginBottom: 2 }}>Phone</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>
                  {detailLead.contact_phone || '\u2014'}
                </div>
              </div>
            </div>

            {/* Tags */}
            {(detailLead.tags || []).length > 0 && (
              <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {detailLead.tags.map((t, i) => (
                  <span key={i} style={chipS('rgba(212,160,23,.15)', GOLD)}>{t}</span>
                ))}
              </div>
            )}

            {/* Notes */}
            {detailLead.notes && (
              <div style={{
                background: BG, borderRadius: 8, padding: 14,
                marginBottom: 20, fontSize: 13, color: DIM, lineHeight: 1.6,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: TEXT, marginBottom: 6,
                }}>Notes</div>
                {detailLead.notes}
              </div>
            )}

            {/* Quick stage move */}
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 8,
              }}>Move to Stage</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STAGES.map(s => (
                  <button key={s}
                    onClick={() => {
                      moveToStage(detailLead, s);
                      setDetailLead({ ...detailLead, stage: s });
                    }}
                    disabled={s === detailLead.stage}
                    style={{
                      ...btnS(
                        s === detailLead.stage ? STAGE_COLORS[s] : 'transparent',
                        s === detailLead.stage ? '#fff' : DIM,
                      ),
                      padding: '5px 14px', fontSize: 12,
                      border: s === detailLead.stage ? 'none' : `1px solid ${BORDER}`,
                      opacity: s === detailLead.stage ? 1 : 0.8,
                    }}
                  >{s}</button>
                ))}
              </div>
            </div>

            {/* Actions row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              <button onClick={() => {
                setEditLead(detailLead); setShowModal(true); setDetailLead(null);
              }} style={{
                ...btnS(GOLD), padding: '7px 16px', fontSize: 12,
              }}>Edit Lead</button>
              <button onClick={() => handleDelete(detailLead.id)} style={{
                ...btnS('transparent', RED), border: `1px solid ${RED}44`,
                padding: '7px 16px', fontSize: 12,
              }}>Delete</button>
            </div>

            {/* ─── Activity Log ─── */}
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 20 }}>
              <h3 style={{
                margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: TEXT,
              }}>Activity Log</h3>

              {/* New activity form */}
              <div style={{
                background: BG, borderRadius: 10, padding: 14,
                marginBottom: 16, border: `1px solid ${BORDER}`,
              }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '140px 1fr',
                  gap: 10, marginBottom: 10,
                }}>
                  <select
                    value={actForm.activity_type}
                    onChange={e => setActForm({ ...actForm, activity_type: e.target.value })}
                    style={{ ...selectS, fontSize: 12 }}
                  >
                    {ACTIVITY_TYPES.map(t => (
                      <option key={t} value={t}>{ACTIVITY_LABELS[t]}</option>
                    ))}
                  </select>
                  <input
                    type="datetime-local"
                    value={actForm.scheduled_at}
                    onChange={e => setActForm({ ...actForm, scheduled_at: e.target.value })}
                    style={{ ...inputS, fontSize: 12 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={actForm.description}
                    onChange={e => setActForm({ ...actForm, description: e.target.value })}
                    placeholder="Describe this activity..."
                    style={{ ...inputS, flex: 1, fontSize: 12 }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && actForm.description.trim()) handleCreateActivity();
                    }}
                  />
                  <button onClick={handleCreateActivity}
                    disabled={actSaving || !actForm.description.trim()}
                    style={{
                      ...btnS(GOLD), padding: '8px 16px', fontSize: 12,
                      opacity: actSaving || !actForm.description.trim() ? 0.5 : 1,
                    }}
                  >{actSaving ? '...' : 'Log'}</button>
                </div>
              </div>

              {/* Activity list */}
              {actLoading && (
                <div style={{
                  textAlign: 'center', color: DIM, padding: 20, fontSize: 13,
                }}>Loading activities...</div>
              )}

              {!actLoading && activities.length === 0 && (
                <div style={{
                  textAlign: 'center', color: DIM, padding: 20, fontSize: 13,
                  border: `1px dashed ${BORDER}`, borderRadius: 8,
                }}>
                  No activities logged yet. Add your first activity above.
                </div>
              )}

              {!actLoading && activities.length > 0 && (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {activities.map((act, idx) => (
                    <div key={act.id} style={{
                      display: 'flex', gap: 12, padding: '12px 0',
                      borderBottom: idx < activities.length - 1
                        ? `1px solid ${BORDER}22` : 'none',
                      position: 'relative',
                    }}>
                      {/* Timeline icon */}
                      <div style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', flexShrink: 0, width: 36,
                      }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, background: BG,
                          border: `1px solid ${BORDER}`, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', fontSize: 16,
                        }}>
                          {ACTIVITY_ICONS[act.activity_type] || '\uD83D\uDCCC'}
                        </div>
                        {idx < activities.length - 1 && (
                          <div style={{
                            width: 1, flex: 1, background: BORDER, marginTop: 4,
                          }} />
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'flex-start',
                        }}>
                          <div>
                            <span style={{
                              fontWeight: 700, fontSize: 13, color: TEXT,
                            }}>
                              {ACTIVITY_LABELS[act.activity_type] || act.activity_type}
                            </span>
                            {act.scheduled_at && (
                              <span style={{ fontSize: 11, color: DIM, marginLeft: 8 }}>
                                Scheduled: {fmtDate(act.scheduled_at)} {fmtTime(act.scheduled_at)}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: DIM, flexShrink: 0 }}>
                            {fmtDate(act.created_at)}
                          </span>
                        </div>
                        <div style={{
                          fontSize: 13, color: DIM, marginTop: 4, lineHeight: 1.5,
                        }}>{act.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Click-away layer for move menu ─── */}
      {moveMenuId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}
          onClick={() => setMoveMenuId(null)} />
      )}
    </div>
  );
}
