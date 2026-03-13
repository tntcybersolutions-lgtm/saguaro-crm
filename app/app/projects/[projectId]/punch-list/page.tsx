'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T } from '@/components/ui/shell';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

interface PunchItem {
  id: string;
  number: string;
  description: string;
  location: string;
  trade: string;
  assigned_to: string;
  due_date: string;
  priority: string;
  status: string;
  project_id: string;
}

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

const PRIORITY_BADGE: Record<string, 'red' | 'amber' | 'gold' | 'muted'> = {
  Critical: 'red',
  High: 'amber',
  Medium: 'gold',
  Low: 'muted',
};

const STATUS_BADGE: Record<string, 'red' | 'amber' | 'blue' | 'green' | 'muted'> = {
  Open: 'red',
  'In Progress': 'amber',
  Complete: 'green',
};

const EMPTY_FORM = { description: '', location: '', trade: '', assigned_to: '', due_date: '', priority: 'Medium' };

export default function PunchListPage() {
  const { projectId } = useParams() as { projectId: string };
  const [items, setItems] = useState<PunchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/punch-list`);
      const json = await res.json();
      setItems(json.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const total = items.length;
  const open = items.filter(i => i.status === 'Open').length;
  const inProgress = items.filter(i => i.status === 'In Progress').length;
  const complete = items.filter(i => i.status === 'Complete').length;

  async function handleSave() {
    if (!form.description) { setErrorMsg('Description is required.'); return; }
    setSaving(true);
    setErrorMsg('');
    const num = `P-${String(items.length + 1).padStart(3, '0')}`;
    try {
      const res = await fetch('/api/punch-list/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, number: num, status: 'Open', ...form }),
      });
      const json = await res.json();
      const newItem: PunchItem = json.item || { id: `p-${Date.now()}`, project_id: projectId, number: num, status: 'Open', ...form };
      setItems(prev => [...prev, newItem]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Punch list item added.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      const newItem: PunchItem = { id: `p-${Date.now()}`, project_id: projectId, number: num, status: 'Open', ...form };
      setItems(prev => [...prev, newItem]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Item added (demo mode).');
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(id: string) {
    setActionLoading(id);
    try {
      await fetch(`/api/punch-list/${id}/complete`, { method: 'PATCH' });
    } catch { /* demo */ }
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'Complete' } : i));
    setActionLoading(null);
    setSuccessMsg('Item marked complete.');
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  async function handleReopen(id: string) {
    setActionLoading(id);
    try {
      await fetch(`/api/punch-list/${id}/reopen`, { method: 'PATCH' });
    } catch { /* demo */ }
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'Open' } : i));
    setActionLoading(null);
    setSuccessMsg('Item reopened.');
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };

  return (
    <PageWrap>
      <div style={{ padding: '24px 24px 0' }}>
        <SectionHeader
          title="Punch List"
          sub="Items before substantial completion"
          action={
            <Btn onClick={() => { setShowForm(p => !p); setErrorMsg(''); }}>
              {showForm ? 'Cancel' : '+ Add Item'}
            </Btn>
          }
        />
      </div>

      {/* Stat Cards */}
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon="📋" label="Total" value={String(total)} />
        <StatCard icon="🔴" label="Open" value={String(open)} />
        <StatCard icon="🔄" label="In Progress" value={String(inProgress)} />
        <StatCard icon="✅" label="Complete" value={String(complete)} />
      </div>

      {successMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.4)`, borderRadius: 8, color: T.green, fontSize: 13 }}>{successMsg}</div>
      )}
      {errorMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.redDim, border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 8, color: T.red, fontSize: 13 }}>{errorMsg}</div>
      )}

      {/* Create Form */}
      {showForm && (
        <div style={{ padding: '0 24px 16px' }}>
          <Card>
            <CardHeader><span style={{ fontWeight: 700, color: T.white }}>Add Punch List Item</span></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={lbl}>Description *</label>
                  <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Priority</label>
                  <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} style={inp}>
                    {PRIORITIES.map(pr => <option key={pr}>{pr}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Location</label>
                  <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Trade</label>
                  <input value={form.trade} onChange={e => setForm(p => ({ ...p, trade: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Assigned To</label>
                  <input value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Due Date</label>
                  <SaguaroDatePicker value={form.due_date} onChange={v => setForm(p => ({ ...p, due_date: v }))} style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Item'}</Btn>
                <Btn variant="ghost" onClick={() => { setShowForm(false); setErrorMsg(''); }}>Cancel</Btn>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Table */}
      <div style={{ padding: '0 24px 40px' }}>
        <Card>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>Loading...</div>
            ) : (
              <Table
                headers={['Item #', 'Description', 'Location', 'Trade', 'Priority', 'Status', 'Assigned To', 'Due Date', 'Actions']}
                rows={items.map(item => [
                  <span key="n" style={{ color: T.gold, fontWeight: 700 }}>{item.number}</span>,
                  item.description,
                  <span key="l" style={{ color: T.muted }}>{item.location || '—'}</span>,
                  <span key="t" style={{ color: T.muted }}>{item.trade || '—'}</span>,
                  <Badge key="p" label={item.priority} color={PRIORITY_BADGE[item.priority] || 'muted'} />,
                  <Badge key="s" label={item.status} color={STATUS_BADGE[item.status] || 'muted'} />,
                  <span key="a" style={{ color: T.muted }}>{item.assigned_to || '—'}</span>,
                  <span key="d" style={{ color: T.muted }}>{item.due_date || '—'}</span>,
                  <div key="act" style={{ display: 'flex', gap: 6 }}>
                    {item.status !== 'Complete' && (
                      <Btn size="sm" onClick={() => handleComplete(item.id)} disabled={actionLoading === item.id}>
                        {actionLoading === item.id ? '...' : 'Complete'}
                      </Btn>
                    )}
                    {item.status === 'Complete' && (
                      <Btn size="sm" variant="ghost" onClick={() => handleReopen(item.id)} disabled={actionLoading === item.id}>
                        Reopen
                      </Btn>
                    )}
                  </div>,
                ])}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </PageWrap>
  );
}
