'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const GOLD = '#C8960F', DARK = '#0d1117', RAISED = '#161b22', BORDER = '#30363d';
const DIM = '#8B9DB8', TEXT = '#F0F4FF', GREEN = '#2ea043', RED = '#f85149', AMBER = '#e3b341';
const BLUE = '#3B82F6';

const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('en-US');

interface Employee {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  title: string | null;
  trade: string | null;
  regular_rate: number;
  overtime_rate: number | null;
  default_csi_division: string | null;
}

interface CostCode {
  id: string;
  code: string;
  description: string;
  csi_division: string | null;
}

interface TimeEntry {
  id: string;
  employee_id: string;
  work_date: string;
  regular_hours: number;
  overtime_hours: number;
  doubletime_hours: number;
  total_hours: number;
  labor_cost: number;
  cost_code_id: string | null;
  cost_code_description: string | null;
  work_description: string | null;
  status: string;
  employees?: { full_name: string; title: string | null; trade: string | null };
  cost_codes?: { code: string; description: string } | null;
}

interface EntryForm {
  employee_id: string;
  regular_hours: number;
  overtime_hours: number;
  cost_code_id: string;
  work_description: string;
  per_diem?: boolean;
}

const STATUS_BADGE: Record<string, { color: string; label: string }> = {
  pending: { color: DIM, label: 'Pending' },
  approved: { color: GREEN, label: 'Approved' },
  rejected: { color: RED, label: 'Rejected' },
  locked: { color: '#555', label: 'Locked' },
};

function formatDate(d: string): string {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function TimecardsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState({ total_regular_hours: 0, total_overtime_hours: 0, total_labor_cost: 0, entries_count: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [entryForms, setEntryForms] = useState<EntryForm[]>([]);
  const [savingEntries, setSavingEntries] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees');
      const data = await res.json();
      setEmployees(data.employees || []);
    } catch { /* handled */ }
  }, []);

  const fetchCostCodes = useCallback(async () => {
    try {
      const res = await fetch('/api/cost-codes');
      const data = await res.json();
      setCostCodes(data.cost_codes || data || []);
    } catch {
      // Fallback: no cost codes API yet, we'll handle inline
    }
  }, []);

  const fetchEntries = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/timecards/${projectId}?date=${date}`);
      const data = await res.json();
      setEntries(data.entries || []);
      setSummary(data.summary || { total_regular_hours: 0, total_overtime_hours: 0, total_labor_cost: 0, entries_count: 0 });
    } catch { /* handled */ } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchEmployees(); fetchCostCodes(); }, [fetchEmployees, fetchCostCodes]);
  useEffect(() => { fetchEntries(selectedDate); }, [selectedDate, fetchEntries]);

  const handleAddRow = () => {
    setEntryForms([...entryForms, { employee_id: '', regular_hours: 8, overtime_hours: 0, cost_code_id: '', work_description: '', per_diem: false }]);
  };

  const updateForm = (idx: number, field: keyof EntryForm, value: any) => {
    const updated = [...entryForms];
    (updated[idx] as any)[field] = value;
    setEntryForms(updated);
  };

  const removeRow = (idx: number) => {
    setEntryForms(entryForms.filter((_, i) => i !== idx));
  };

  const getRate = (empId: string) => {
    const emp = employees.find((e) => e.id === empId);
    return Number(emp?.regular_rate || 0);
  };

  const calcCost = (form: EntryForm) => {
    const rate = getRate(form.employee_id);
    const otRate = rate * 1.5;
    return (form.regular_hours * rate) + (form.overtime_hours * otRate);
  };

  const handleSaveEntries = async () => {
    const validForms = entryForms.filter((f) => f.employee_id);
    if (validForms.length === 0) return;
    setSavingEntries(true);
    try {
      const res = await fetch(`/api/timecards/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ work_date: selectedDate, entries: validForms }),
      });
      if (res.ok) {
        setEntryForms([]);
        await fetchEntries(selectedDate);
      }
    } finally { setSavingEntries(false); }
  };

  const handleApproveAll = async () => {
    const pendingIds = entries.filter((e) => e.status === 'pending').map((e) => e.id);
    if (pendingIds.length === 0) return;
    setApprovingAll(true);
    try {
      const res = await fetch(`/api/timecards/${projectId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_ids: pendingIds, approved: true }),
      });
      if (res.ok) await fetchEntries(selectedDate);
    } finally { setApprovingAll(false); }
  };

  const handleExportCSV = () => {
    const weekStart = new Date(selectedDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const weekStr = weekStart.toISOString().split('T')[0];
    window.open(`/api/timecards/${projectId}/export?week=${weekStr}`, '_blank');
  };

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const uniqueWorkers = new Set(entries.map((e) => e.employee_id)).size;
  const totalHours = entries.reduce((s, e) => s + Number(e.total_hours || 0), 0);
  const totalCost = summary.total_labor_cost;
  const pendingCount = entries.filter((e) => e.status === 'pending').length;

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px', background: DARK, border: `1px solid ${BORDER}`,
    borderRadius: 6, color: TEXT, fontSize: 14, outline: 'none',
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ color: TEXT, fontSize: 24, margin: 0 }}>Timecards</h1>
        <button onClick={handleExportCSV}
          style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${BORDER}`,
            borderRadius: 6, color: BLUE, cursor: 'pointer', fontSize: 13 }}>
          Export Week CSV
        </button>
      </div>

      {/* DATE NAVIGATION */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
        <button onClick={() => changeDate(-1)}
          style={{ padding: '8px 14px', background: RAISED, border: `1px solid ${BORDER}`,
            borderRadius: 6, color: TEXT, cursor: 'pointer', fontSize: 16 }}>
          ←
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: TEXT, fontSize: 18, fontWeight: 600 }}>{formatDate(selectedDate)}</div>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: DIM, fontSize: 12, cursor: 'pointer' }} />
        </div>
        <button onClick={() => changeDate(1)}
          style={{ padding: '8px 14px', background: RAISED, border: `1px solid ${BORDER}`,
            borderRadius: 6, color: TEXT, cursor: 'pointer', fontSize: 16 }}>
          →
        </button>
      </div>

      {/* SUMMARY BAR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Workers', value: String(uniqueWorkers), color: TEXT },
          { label: 'Total Hours', value: String(totalHours), color: BLUE },
          { label: 'Labor Cost', value: fmt(totalCost), color: GOLD },
          { label: 'Pending', value: String(pendingCount), color: pendingCount > 0 ? AMBER : GREEN },
        ].map((k) => (
          <div key={k.label} style={{ background: RAISED, border: `1px solid ${BORDER}`,
            borderRadius: 8, padding: '14px', textAlign: 'center' }}>
            <div style={{ color: DIM, fontSize: 11, marginBottom: 4, textTransform: 'uppercase' }}>{k.label}</div>
            <div style={{ color: k.color, fontSize: 20, fontWeight: 700 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* EXISTING ENTRIES */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: GOLD }}>Loading timecards...</div>
      ) : (
        <>
          {entries.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                    {['Employee', 'Trade', 'Regular', 'OT', 'Cost Code', 'Cost', 'Status'].map((h) => (
                      <th key={h} style={{ padding: '10px 8px', color: DIM, fontSize: 11,
                        textTransform: 'uppercase', fontWeight: 600, textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const sb = STATUS_BADGE[e.status] || STATUS_BADGE.pending;
                    return (
                      <tr key={e.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <td style={{ padding: '10px 8px', color: TEXT, fontWeight: 500 }}>
                          {(e.employees as any)?.full_name || 'Unknown'}
                        </td>
                        <td style={{ padding: '10px 8px', color: DIM }}>{(e.employees as any)?.trade || '-'}</td>
                        <td style={{ padding: '10px 8px', color: TEXT }}>{e.regular_hours}h</td>
                        <td style={{ padding: '10px 8px', color: e.overtime_hours > 0 ? AMBER : DIM }}>
                          {e.overtime_hours}h
                        </td>
                        <td style={{ padding: '10px 8px', color: DIM }}>
                          {(e.cost_codes as any)?.code || ''} {e.cost_code_description || ''}
                        </td>
                        <td style={{ padding: '10px 8px', color: GOLD, fontWeight: 600 }}>{fmt(e.labor_cost)}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11,
                            color: '#fff', background: sb.color, fontWeight: 600 }}>{sb.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {entries.length === 0 && entryForms.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48, color: DIM }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⏱️</div>
              <div style={{ fontSize: 16, marginBottom: 8, color: TEXT }}>No time entries for this date</div>
              {employees.length === 0 ? (
                <div>
                  <div style={{ marginBottom: 16 }}>No employees set up yet.</div>
                  <a href="/app/employees" style={{ padding: '10px 20px', background: GOLD, color: '#000',
                    border: 'none', borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}>
                    + Add Employees
                  </a>
                </div>
              ) : (
                <button onClick={handleAddRow}
                  style={{ padding: '10px 20px', background: GOLD, color: '#000', border: 'none',
                    borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                  + Add Crew Row
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* NEW ENTRY FORMS */}
      {entryForms.length > 0 && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ color: GOLD, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>New Entries</div>
          {entryForms.map((form, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr auto 1fr auto',
              gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select value={form.employee_id} onChange={(e) => updateForm(idx, 'employee_id', e.target.value)}
                style={{ ...inputStyle, width: '100%' }}>
                <option value="">Select Employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name} — {emp.trade || emp.title || 'Worker'}</option>
                ))}
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="number" value={form.regular_hours} min={0} max={12} step={0.5}
                  onChange={(e) => updateForm(idx, 'regular_hours', Number(e.target.value))}
                  style={{ ...inputStyle, width: 60, textAlign: 'center' }} />
                <span style={{ color: DIM, fontSize: 11 }}>reg</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="number" value={form.overtime_hours} min={0} max={8} step={0.5}
                  onChange={(e) => updateForm(idx, 'overtime_hours', Number(e.target.value))}
                  style={{ ...inputStyle, width: 60, textAlign: 'center' }} />
                <span style={{ color: DIM, fontSize: 11 }}>OT</span>
              </div>
              <select value={form.cost_code_id} onChange={(e) => updateForm(idx, 'cost_code_id', e.target.value)}
                style={{ ...inputStyle, width: '100%' }}>
                <option value="">Cost Code</option>
                {costCodes.map((cc) => (
                  <option key={cc.id} value={cc.id}>{cc.code} — {cc.description}</option>
                ))}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: DIM, fontSize: 11 }}>
                <input type="checkbox" checked={form.per_diem || false}
                  onChange={(e) => updateForm(idx, 'per_diem', e.target.checked)} />
                Per Diem
              </label>
              <div style={{ color: GOLD, fontWeight: 600, fontSize: 13, textAlign: 'right' }}>
                {fmt(calcCost(form))}
              </div>
              <button onClick={() => removeRow(idx)}
                style={{ padding: '4px 8px', background: 'transparent', border: `1px solid ${BORDER}`,
                  borderRadius: 4, color: RED, cursor: 'pointer', fontSize: 14 }}>
                ×
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={handleAddRow}
              style={{ padding: '8px 14px', background: 'transparent', border: `1px solid ${BORDER}`,
                borderRadius: 6, color: TEXT, cursor: 'pointer', fontSize: 13 }}>
              + Add Row
            </button>
            <button onClick={handleSaveEntries} disabled={savingEntries}
              style={{ padding: '8px 16px', background: GOLD, color: '#000', border: 'none',
                borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: savingEntries ? 0.6 : 1 }}>
              {savingEntries ? 'Saving...' : 'Save All Entries'}
            </button>
          </div>
        </div>
      )}

      {/* ACTION BUTTONS */}
      {(entries.length > 0 || entryForms.length === 0) && employees.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {entryForms.length === 0 && (
            <button onClick={handleAddRow}
              style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${BORDER}`,
                borderRadius: 6, color: TEXT, cursor: 'pointer', fontSize: 13 }}>
              + Add Crew Row
            </button>
          )}
          {pendingCount > 0 && (
            <button onClick={handleApproveAll} disabled={approvingAll}
              style={{ padding: '8px 16px', background: GREEN, color: '#fff', border: 'none',
                borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: approvingAll ? 0.6 : 1 }}>
              {approvingAll ? 'Approving...' : `Approve All (${pendingCount})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
