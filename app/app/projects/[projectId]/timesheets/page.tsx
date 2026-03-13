'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T } from '@/components/ui/shell';

interface TimeEntry {
  id: string;
  employee: string;
  date: string;
  regular_hrs: number;
  ot_hrs: number;
  classification: string;
  status: string;
  project_id: string;
}

type WeekFilter = 'current' | 'last' | 'all';

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 };

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

const CLASSIFICATIONS = ['Laborer', 'Carpenter', 'Electrician', 'Plumber', 'Ironworker', 'Operator', 'Superintendent', 'Foreman'];

const EMPTY_FORM = { employee: '', date: new Date().toISOString().split('T')[0], regular_hrs: 8, ot_hrs: 0, classification: 'Laborer' };

export default function TimesheetsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [weekFilter, setWeekFilter] = useState<WeekFilter>('current');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timesheets?week=${weekFilter}`);
      const json = await res.json();
      setEntries(json.entries || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, weekFilter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const currentWeekStart = getWeekStart(new Date());
  const lastWeekStart = (() => { const d = new Date(currentWeekStart); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; })();

  const filtered = entries.filter(e => {
    if (weekFilter === 'all') return true;
    if (weekFilter === 'current') return e.date >= currentWeekStart;
    if (weekFilter === 'last') return e.date >= lastWeekStart && e.date < currentWeekStart;
    return true;
  });

  const totalEntries = filtered.length;
  const totalHours = filtered.reduce((s, e) => s + e.regular_hrs + e.ot_hrs, 0);
  const pendingCount = filtered.filter(e => e.status === 'pending').length;
  const approvedCount = filtered.filter(e => e.status === 'approved').length;

  async function handleSave() {
    if (!form.employee) return;
    setSaving(true);
    const newEntry: TimeEntry = {
      id: `ts-${Date.now()}`,
      project_id: projectId,
      employee: form.employee,
      date: form.date,
      regular_hrs: form.regular_hrs,
      ot_hrs: form.ot_hrs,
      classification: form.classification,
      status: 'pending',
    };
    try {
      const res = await fetch('/api/timesheets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...form, status: 'pending' }),
      });
      const json = await res.json();
      setEntries(prev => [json.entry || newEntry, ...prev]);
    } catch {
      setEntries(prev => [newEntry, ...prev]);
    }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setToast('Timesheet entry added.');
    setTimeout(() => setToast(''), 4000);
  }

  async function handleAction(id: string, action: 'approved' | 'rejected') {
    try {
      await fetch(`/api/timesheets/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      });
    } catch { /* demo */ }
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: action } : e));
    setToast(`Timesheet ${action}.`);
    setTimeout(() => setToast(''), 4000);
  }

  return (
    <PageWrap>
      <div style={{ padding: 24 }}>
        <SectionHeader
          title="Timesheets"
          sub="Weekly crew timesheets and labor tracking"
          action={<Btn onClick={() => setShowForm(p => !p)}>+ Add Entry</Btn>}
        />

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          <StatCard icon="📝" label="Total Entries" value={String(totalEntries)} />
          <StatCard icon="🕐" label="Total Hours" value={`${totalHours.toFixed(1)}h`} />
          <StatCard icon="⏳" label="Pending Approval" value={String(pendingCount)} />
          <StatCard icon="✅" label="Approved" value={String(approvedCount)} />
        </div>

        {/* Week filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {([['current', 'Current Week'], ['last', 'Last Week'], ['all', 'All']] as [WeekFilter, string][]).map(([key, label]) => (
            <Btn key={key} variant={weekFilter === key ? 'primary' : 'ghost'} size="sm" onClick={() => setWeekFilter(key)}>{label}</Btn>
          ))}
        </div>

        {toast && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 8, color: T.green, fontSize: 13 }}>
            {toast}
          </div>
        )}

        {/* Create Form */}
        {showForm && (
          <Card style={{ marginBottom: 24, borderColor: T.borderGold }}>
            <CardHeader><span style={{ fontWeight: 700, color: T.white }}>Add Timesheet Entry</span></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                <div>
                  <label style={lbl}>Employee *</label>
                  <input type="text" value={form.employee} onChange={e => setForm(p => ({ ...p, employee: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Date</label>
                  <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Classification</label>
                  <select value={form.classification} onChange={e => setForm(p => ({ ...p, classification: e.target.value }))} style={inp}>
                    {CLASSIFICATIONS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Regular Hours</label>
                  <input type="number" min={0} max={24} value={form.regular_hrs} onChange={e => setForm(p => ({ ...p, regular_hrs: Number(e.target.value) }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>OT Hours</label>
                  <input type="number" min={0} max={24} value={form.ot_hrs} onChange={e => setForm(p => ({ ...p, ot_hrs: Number(e.target.value) }))} style={inp} />
                </div>
                <div style={{ display: 'flex', alignItems: 'end' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.gold }}>Total: {form.regular_hrs + form.ot_hrs}h</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Entry'}</Btn>
                <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancel</Btn>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Table */}
        <Card>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.muted }}>Loading...</div>
            ) : (
              <Table
                headers={['Employee', 'Date', 'Regular Hrs', 'OT Hrs', 'Total Hrs', 'Classification', 'Status', 'Actions']}
                rows={filtered.map(e => [
                  <span key="emp" style={{ fontWeight: 600 }}>{e.employee}</span>,
                  <span key="dt" style={{ color: T.muted, whiteSpace: 'nowrap' }}>{e.date}</span>,
                  <span key="rh" style={{ color: T.white }}>{e.regular_hrs}</span>,
                  <span key="oh" style={{ color: e.ot_hrs > 0 ? T.amber : T.muted }}>{e.ot_hrs}</span>,
                  <span key="th" style={{ fontWeight: 700, color: T.gold }}>{(e.regular_hrs + e.ot_hrs).toFixed(1)}h</span>,
                  <span key="cl" style={{ color: T.muted }}>{e.classification}</span>,
                  <Badge key="st" label={e.status} color={e.status === 'approved' ? 'green' : e.status === 'rejected' ? 'red' : 'amber'} />,
                  <div key="act" style={{ display: 'flex', gap: 6 }}>
                    {e.status === 'pending' && (
                      <>
                        <Btn size="sm" onClick={() => handleAction(e.id, 'approved')}>Approve</Btn>
                        <Btn size="sm" variant="danger" onClick={() => handleAction(e.id, 'rejected')}>Reject</Btn>
                      </>
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
