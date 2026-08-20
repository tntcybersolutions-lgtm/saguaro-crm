'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';

const GOLD='#C8960F',DARK='#0d1117',RAISED='#161b22',BORDER='#30363d',DIM='#8B9DB8',TEXT='#F0F4FF';
const GREEN='#2ea043',RED='#f85149',AMBER='#e3b341',BLUE='#3b82f6';

const PRIORITY_COLORS: Record<string, string> = {
  low: DIM, medium: BLUE, high: AMBER, critical: RED,
};
const STATUS_COLORS: Record<string, string> = {
  open: BLUE, in_progress: AMBER, resolved: GREEN, converted: '#a78bfa',
};

const EMPTY = {
  title: '', description: '', priority: 'medium', location: '',
  assigned_to_name: '', due_date: '',
  cost_impact: '', schedule_impact_days: '0',
};

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', background: '#151f2e',
  border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
};

export default function FieldIssuesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/field-issues/by-project/${projectId}`, { headers: h });
      const j = await r.json();
      setIssues(j.issues || []);
    } catch { setIssues([]); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!form.title.trim()) { showToast('Title required', 'error'); return; }
    setSaving(true);
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/field-issues/by-project/${projectId}`, {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          cost_impact: form.cost_impact ? Number(form.cost_impact) : null,
          schedule_impact_days: Number(form.schedule_impact_days) || 0,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      showToast('Issue created');
      setShowForm(false);
      setForm({ ...EMPTY });
      await load();
    } catch (e: any) { showToast(e.message || 'Create failed', 'error'); }
    finally { setSaving(false); }
  }

  async function resolve(issue: any) {
    const notes = window.prompt('Resolution notes:');
    if (notes === null) return;
    try {
      const h = await getAuthHeaders();
      await fetch(`/api/field-issues/${issue.id}`, {
        method: 'PATCH',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_notes: notes,
        }),
      });
      showToast('Issue resolved');
      await load();
    } catch { showToast('Resolve failed', 'error'); }
  }

  async function convertToRfi(issue: any) {
    if (!confirm('Convert this field issue to an RFI?')) return;
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/field-issues/${issue.id}/convert-to-rfi`, {
        method: 'POST', headers: h,
      });
      const j = await r.json();
      if (j.rfi?.id) {
        showToast('Converted to RFI');
        window.open(`/app/projects/${projectId}/rfis/${j.rfi.id}`, '_blank');
        await load();
      } else {
        showToast(j.error || 'Convert failed', 'error');
      }
    } catch { showToast('Convert failed', 'error'); }
  }

  const filtered = issues.filter(i =>
    filter === 'all' ? true : filter === 'resolved' ? (i.status === 'resolved' || i.status === 'converted') : i.status !== 'resolved' && i.status !== 'converted'
  );

  const openCount = issues.filter(i => i.status === 'open' || i.status === 'in_progress').length;
  const resolvedCount = issues.filter(i => i.status === 'resolved').length;
  const overdue = issues.filter(i => i.due_date && new Date(i.due_date) < new Date() && i.status !== 'resolved' && i.status !== 'converted').length;

  return (
    <div style={{ background: DARK, minHeight: '100%', color: TEXT }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 99999, padding: '10px 18px', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 13, background: toast.type === 'success' ? 'rgba(46,160,67,.92)' : 'rgba(248,81,73,.92)' }}>
          {toast.msg}
        </div>
      )}

      <div style={{ padding: '18px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Field Issues</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Track and resolve issues found during construction</div>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ padding: '9px 18px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`, border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          + Log Issue
        </button>
      </div>

      <div style={{ padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { l: 'Open', v: openCount, c: BLUE },
            { l: 'Resolved', v: resolvedCount, c: GREEN },
            { l: 'Overdue', v: overdue, c: overdue > 0 ? RED : DIM },
            { l: 'Total', v: issues.length, c: TEXT },
          ].map(k => (
            <div key={k.l} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: DIM, marginBottom: 6 }}>{k.l}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.c }}>{k.v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {(['all', 'open', 'resolved'] as const).map(t => (
            <button key={t} onClick={() => setFilter(t)}
              style={{ padding: '6px 14px', background: filter === t ? 'rgba(200,150,15,.18)' : 'transparent', border: `1px solid ${filter === t ? GOLD : BORDER}`, color: filter === t ? GOLD : DIM, borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}>
              {t}
            </button>
          ))}
        </div>

        {showForm && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>New Field Issue</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 11, color: DIM }}>Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inp} placeholder="Brief issue title" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 11, color: DIM }}>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: DIM }}>Priority</label>
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inp}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: DIM }}>Location</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} style={inp} placeholder="Room 204…" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: DIM }}>Assigned To</label>
                <input value={form.assigned_to_name} onChange={e => setForm(f => ({ ...f, assigned_to_name: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: DIM }}>Due Date</label>
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: DIM }}>Cost Impact ($)</label>
                <input type="number" value={form.cost_impact} onChange={e => setForm(f => ({ ...f, cost_impact: e.target.value }))} style={inp} placeholder="0.00" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: DIM }}>Schedule Impact (days)</label>
                <input type="number" value={form.schedule_impact_days} onChange={e => setForm(f => ({ ...f, schedule_impact_days: e.target.value }))} style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setForm({ ...EMPTY }); }}
                style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={create} disabled={saving}
                style={{ padding: '8px 18px', background: GOLD, border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: DIM }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: DIM, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
            No field issues {filter !== 'all' && `(${filter})`}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(issue => {
              const isOverdue = issue.due_date && new Date(issue.due_date) < new Date() && issue.status !== 'resolved' && issue.status !== 'converted';
              return (
                <div key={issue.id} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: DIM }}>{issue.issue_number}</span>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: `${PRIORITY_COLORS[issue.priority] || DIM}22`, color: PRIORITY_COLORS[issue.priority] || DIM, fontWeight: 700, textTransform: 'uppercase' }}>
                          {issue.priority}
                        </span>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: `${STATUS_COLORS[issue.status] || DIM}22`, color: STATUS_COLORS[issue.status] || DIM, fontWeight: 700, textTransform: 'uppercase' }}>
                          {issue.status}
                        </span>
                        {isOverdue && (
                          <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(248,81,73,.15)', color: RED, padding: '2px 8px', borderRadius: 10 }}>
                            OVERDUE {new Date(issue.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 4 }}>{issue.title}</div>
                      {issue.description && <div style={{ fontSize: 12, color: DIM, marginBottom: 4 }}>{issue.description}</div>}
                      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: DIM, flexWrap: 'wrap' }}>
                        {issue.location && <span>Location: {issue.location}</span>}
                        {issue.assigned_to_name && <span>Assigned: {issue.assigned_to_name}</span>}
                        {issue.due_date && <span>Due: {new Date(issue.due_date).toLocaleDateString()}</span>}
                        {issue.cost_impact != null && <span>Cost: ${Number(issue.cost_impact).toLocaleString()}</span>}
                        {issue.schedule_impact_days > 0 && <span>+{issue.schedule_impact_days}d</span>}
                      </div>
                      {issue.resolution_notes && (
                        <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(46,160,67,.08)', borderRadius: 6, fontSize: 12, color: GREEN }}>
                          Resolution: {issue.resolution_notes}
                        </div>
                      )}
                    </div>
                    {issue.status !== 'resolved' && issue.status !== 'converted' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => resolve(issue)}
                          style={{ background: 'rgba(46,160,67,.15)', border: `1px solid rgba(46,160,67,.4)`, color: GREEN, borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>
                          Resolve
                        </button>
                        <button onClick={() => convertToRfi(issue)}
                          style={{ background: '#21262d', border: `1px solid ${BORDER}`, color: DIM, borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>
                          → RFI
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
