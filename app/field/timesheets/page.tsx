'use client';
/**
 * Saguaro Field — Weekly Timesheet Management
 * Create, submit, approve/reject timesheet entries with weekly grid view.
 * Offline queue support, batch submit, copy previous week, PDF export.
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

const STATUS_COLORS: Record<string, string> = {
  draft: DIM, submitted: AMBER, approved: GREEN, rejected: RED, revision_requested: AMBER,
};
const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', submitted: 'Submitted', approved: 'Approved',
  rejected: 'Rejected', revision_requested: 'Revision',
};

const CSI_CODES = [
  { code: '01', label: '01 — General Requirements' },
  { code: '02', label: '02 — Existing Conditions' },
  { code: '03', label: '03 — Concrete' },
  { code: '04', label: '04 — Masonry' },
  { code: '05', label: '05 — Metals' },
  { code: '06', label: '06 — Wood, Plastics, Composites' },
  { code: '07', label: '07 — Thermal & Moisture Protection' },
  { code: '08', label: '08 — Openings' },
  { code: '09', label: '09 — Finishes' },
  { code: '22', label: '22 — Plumbing' },
  { code: '23', label: '23 — HVAC' },
  { code: '26', label: '26 — Electrical' },
  { code: '31', label: '31 — Earthwork' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface TimesheetEntry {
  id: string;
  employee_name: string;
  employee_id: string;
  week_ending: string;
  work_date: string;
  hours_regular: number;
  hours_overtime: number;
  hours_double: number;
  total_hours: number;
  cost_code: string;
  location: string;
  description: string;
  status: string;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

type View = 'list' | 'weekly' | 'create';
type SortField = 'work_date' | 'employee_name' | 'total_hours';

function uid(): string { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function getSunday(mon: Date): Date {
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return sun;
}

function getWeekDates(mon: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function fmtShort(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtFull(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function hexAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ─── Inner Component ─── */
function TimesheetsInner() {
  const params = useSearchParams();
  const projectId = params.get('projectId') || '';
  const base = `/api/projects/${projectId}/timesheets`;

  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [weekStart, setWeekStart] = useState<Date>(getMonday(new Date()));
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortField, setSortField] = useState<SortField>('work_date');
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<TimesheetEntry>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ type: 'approve' | 'reject'; ids: string[] } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [toast, setToast] = useState('');

  // Create form state
  const [formName, setFormName] = useState('');
  const [formEmpId, setFormEmpId] = useState('');
  const [formDate, setFormDate] = useState(fmtDate(new Date()));
  const [formRegular, setFormRegular] = useState(8);
  const [formOT, setFormOT] = useState(0);
  const [formDouble, setFormDouble] = useState(0);
  const [formCostCode, setFormCostCode] = useState(CSI_CODES[0].code);
  const [formLocation, setFormLocation] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formNotes, setFormNotes] = useState('');

  /* ── Toast helper ── */
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  /* ── Fetch ── */
  async function fetchEntries() {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(base);
      if (res.ok) {
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : data.data ?? []);
      }
    } catch {
      showToast('Offline — showing cached data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchEntries(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── API helpers ── */
  async function apiCall(url: string, method: string, body?: unknown) {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) return await res.json();
      throw new Error(`${res.status}`);
    } catch {
      if (body) {
        await enqueue({
          url,
          method,
          body: JSON.stringify(body),
          contentType: 'application/json',
          isFormData: false,
        });
        showToast('Queued offline — will sync when connected');
      }
      return null;
    }
  }

  /* ── Create entry ── */
  async function handleCreate() {
    if (!formName.trim() || !formDate) {
      showToast('Employee name and date are required');
      return;
    }
    const weekEnd = getSunday(getMonday(new Date(formDate + 'T00:00:00')));
    const payload = {
      employee_name: formName.trim(),
      employee_id: formEmpId.trim(),
      week_ending: fmtDate(weekEnd),
      work_date: formDate,
      hours_regular: formRegular,
      hours_overtime: formOT,
      hours_double: formDouble,
      total_hours: formRegular + formOT + formDouble,
      cost_code: formCostCode,
      location: formLocation.trim(),
      description: formDescription.trim(),
      status: 'draft',
      notes: formNotes.trim() || null,
    };
    const result = await apiCall(base, 'POST', payload);
    if (result) {
      showToast('Timesheet entry created');
      resetForm();
      setView('list');
      fetchEntries();
    } else {
      showToast('Queued offline — entry will sync');
      resetForm();
      setView('list');
    }
  }

  function resetForm() {
    setFormName('');
    setFormEmpId('');
    setFormDate(fmtDate(new Date()));
    setFormRegular(8);
    setFormOT(0);
    setFormDouble(0);
    setFormCostCode(CSI_CODES[0].code);
    setFormLocation('');
    setFormDescription('');
    setFormNotes('');
  }

  /* ── Edit entry (inline save) ── */
  async function handleSaveEdit(id: string) {
    const total = (editDraft.hours_regular ?? 0) + (editDraft.hours_overtime ?? 0) + (editDraft.hours_double ?? 0);
    const payload = { ...editDraft, total_hours: total };
    const result = await apiCall(`${base}/${id}`, 'PATCH', payload);
    if (result) {
      showToast('Entry updated');
      setEditingId(null);
      setEditDraft({});
      fetchEntries();
    }
  }

  /* ── Delete entry ── */
  async function handleDelete(id: string) {
    const result = await apiCall(`${base}/${id}`, 'DELETE');
    if (result !== null) {
      showToast('Entry deleted');
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }
    setDeleteConfirm(null);
  }

  /* ── Status workflow ── */
  async function handleSubmit(ids: string[]) {
    for (const id of ids) {
      await apiCall(`${base}/${id}`, 'PATCH', { status: 'submitted', submitted_at: new Date().toISOString() });
    }
    showToast(`${ids.length} entry(ies) submitted`);
    setSelected(new Set());
    fetchEntries();
  }

  async function handleApprove(ids: string[]) {
    for (const id of ids) {
      await apiCall(`${base}/${id}`, 'PATCH', {
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: 'Current User',
      });
    }
    showToast(`${ids.length} entry(ies) approved`);
    setActionModal(null);
    fetchEntries();
  }

  async function handleReject(ids: string[], reason: string) {
    for (const id of ids) {
      await apiCall(`${base}/${id}`, 'PATCH', {
        status: 'rejected',
        rejection_reason: reason,
      });
    }
    showToast(`${ids.length} entry(ies) rejected`);
    setRejectionReason('');
    setActionModal(null);
    fetchEntries();
  }

  /* ── Copy previous week ── */
  async function handleCopyPreviousWeek() {
    const prevMonday = new Date(weekStart);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const prevSunday = getSunday(prevMonday);
    const prevStart = fmtDate(prevMonday);
    const prevEnd = fmtDate(prevSunday);
    const prevEntries = entries.filter(
      (e) => e.work_date >= prevStart && e.work_date <= prevEnd,
    );
    if (prevEntries.length === 0) {
      showToast('No entries found in the previous week to copy');
      return;
    }
    let count = 0;
    for (const e of prevEntries) {
      const oldDate = new Date(e.work_date + 'T00:00:00');
      const dayOfWeek = oldDate.getDay();
      const dayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const newDate = new Date(weekStart);
      newDate.setDate(weekStart.getDate() + dayOffset);
      const weekEnd = getSunday(weekStart);
      const payload = {
        employee_name: e.employee_name,
        employee_id: e.employee_id,
        week_ending: fmtDate(weekEnd),
        work_date: fmtDate(newDate),
        hours_regular: e.hours_regular,
        hours_overtime: e.hours_overtime,
        hours_double: e.hours_double,
        total_hours: e.total_hours,
        cost_code: e.cost_code,
        location: e.location,
        description: e.description,
        status: 'draft',
        notes: null,
      };
      await apiCall(base, 'POST', payload);
      count++;
    }
    showToast(`Copied ${count} entries from previous week`);
    fetchEntries();
  }

  /* ── PDF export ── */
  function handlePrint() {
    window.print();
  }

  /* ── Selection helpers ── */
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    const allSelected = ids.every((id) => selected.has(id));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  /* ── Filtering & sorting ── */
  const filtered = useMemo(() => {
    let result = [...entries];
    if (filterStatus !== 'all') result = result.filter((e) => e.status === filterStatus);
    if (filterEmployee) result = result.filter((e) => e.employee_name.toLowerCase().includes(filterEmployee.toLowerCase()));
    if (filterDateFrom) result = result.filter((e) => e.work_date >= filterDateFrom);
    if (filterDateTo) result = result.filter((e) => e.work_date <= filterDateTo);
    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'work_date') cmp = a.work_date.localeCompare(b.work_date);
      else if (sortField === 'employee_name') cmp = a.employee_name.localeCompare(b.employee_name);
      else if (sortField === 'total_hours') cmp = a.total_hours - b.total_hours;
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [entries, filterStatus, filterEmployee, filterDateFrom, filterDateTo, sortField, sortAsc]);

  /* ── Weekly grid data ── */
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const weekEntries = useMemo(() => {
    const start = fmtDate(weekStart);
    const end = fmtDate(getSunday(weekStart));
    return entries.filter((e) => e.work_date >= start && e.work_date <= end);
  }, [entries, weekStart]);

  const employeeWeekMap = useMemo(() => {
    const map = new Map<string, Map<string, TimesheetEntry[]>>();
    for (const e of weekEntries) {
      if (!map.has(e.employee_name)) map.set(e.employee_name, new Map());
      const dayMap = map.get(e.employee_name)!;
      if (!dayMap.has(e.work_date)) dayMap.set(e.work_date, []);
      dayMap.get(e.work_date)!.push(e);
    }
    return map;
  }, [weekEntries]);

  /* ── Summary stats ── */
  const stats = useMemo(() => {
    const totalHours = entries.reduce((s, e) => s + e.total_hours, 0);
    const totalOT = entries.reduce((s, e) => s + e.hours_overtime + e.hours_double, 0);
    const employees = new Set(entries.map((e) => e.employee_name)).size;
    const pending = entries.filter((e) => e.status === 'submitted').length;
    return { totalHours, totalOT, employees, pending };
  }, [entries]);

  /* ── Sort toggler ── */
  function handleSort(field: SortField) {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  }

  /* ── Employees list for filter ── */
  const employeeNames = useMemo(() => {
    return [...new Set(entries.map((e) => e.employee_name))].sort();
  }, [entries]);

  /* ── Start inline edit ── */
  function startEdit(entry: TimesheetEntry) {
    setEditingId(entry.id);
    setEditDraft({
      employee_name: entry.employee_name,
      hours_regular: entry.hours_regular,
      hours_overtime: entry.hours_overtime,
      hours_double: entry.hours_double,
      cost_code: entry.cost_code,
      location: entry.location,
      description: entry.description,
      notes: entry.notes,
    });
  }

  /* ── Shared styles ── */
  const btnStyle = (bg: string): React.CSSProperties => ({
    background: bg, color: bg === GOLD ? '#000' : '#fff', border: 'none',
    borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer',
    fontSize: 14, transition: 'opacity .15s',
  });
  const inputStyle: React.CSSProperties = {
    background: hexAlpha(BORDER, 0.4), border: `1px solid ${BORDER}`, borderRadius: 8,
    color: TEXT, padding: '10px 14px', fontSize: 14, width: '100%', boxSizing: 'border-box',
    outline: 'none',
  };
  const labelStyle: React.CSSProperties = { color: DIM, fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' };
  const cardStyle: React.CSSProperties = {
    background: RAISED, borderRadius: 14, border: `1px solid ${BORDER}`,
    padding: 16, marginBottom: 12,
  };

  /* ────────────────────────── RENDER ────────────────────────── */
  return (
    <div style={{ background: '#0A1628', minHeight: '100vh', color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          background: GOLD, color: '#000', padding: '12px 28px', borderRadius: 10,
          fontWeight: 700, fontSize: 14, boxShadow: `0 8px 32px ${hexAlpha(GOLD, 0.4)}`,
        }}>
          {toast}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{
        background: `linear-gradient(135deg, ${RAISED} 0%, #142740 100%)`,
        padding: '20px 16px 16px', borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
            <span style={{ color: GOLD }}>Timesheets</span>
          </h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handlePrint} style={{ ...btnStyle('transparent'), border: `1px solid ${BORDER}`, color: DIM, padding: '8px 12px' }}>
              PDF
            </button>
            <button onClick={() => { resetForm(); setView('create'); }} style={btnStyle(GOLD)}>
              + New Entry
            </button>
          </div>
        </div>

        {/* ── View tabs ── */}
        <div style={{ display: 'flex', gap: 4, background: hexAlpha(BORDER, 0.3), borderRadius: 10, padding: 3 }}>
          {(['list', 'weekly'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 13, transition: 'all .2s',
                background: view === v ? GOLD : 'transparent',
                color: view === v ? '#000' : DIM,
              }}
            >
              {v === 'list' ? 'List View' : 'Weekly Grid'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '12px 16px' }}>
        {[
          { label: 'Total Hours', value: stats.totalHours.toFixed(1), color: BLUE },
          { label: 'OT / Double', value: stats.totalOT.toFixed(1), color: AMBER },
          { label: 'Employees', value: String(stats.employees), color: GREEN },
          { label: 'Pending', value: String(stats.pending), color: stats.pending > 0 ? RED : DIM },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: hexAlpha(s.color, 0.1), border: `1px solid ${hexAlpha(s.color, 0.3)}`,
              borderRadius: 12, padding: '12px 8px', textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: DIM, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      {view === 'list' && (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ ...cardStyle, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={labelStyle}>Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  style={{ ...inputStyle, padding: '8px 10px' }}
                >
                  <option value="all">All Statuses</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Employee</label>
                <select
                  value={filterEmployee}
                  onChange={(e) => setFilterEmployee(e.target.value)}
                  style={{ ...inputStyle, padding: '8px 10px' }}
                >
                  <option value="">All Employees</option>
                  {employeeNames.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={labelStyle}>From</label>
                <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={{ ...inputStyle, padding: '8px 10px' }} />
              </div>
              <div>
                <label style={labelStyle}>To</label>
                <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={{ ...inputStyle, padding: '8px 10px' }} />
              </div>
            </div>
          </div>

          {/* ── Sort row ── */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([['work_date', 'Date'], ['employee_name', 'Employee'], ['total_hours', 'Hours']] as [SortField, string][]).map(([f, l]) => (
              <button
                key={f}
                onClick={() => handleSort(f)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: `1px solid ${sortField === f ? GOLD : BORDER}`,
                  background: sortField === f ? hexAlpha(GOLD, 0.15) : 'transparent',
                  color: sortField === f ? GOLD : DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {l} {sortField === f ? (sortAsc ? '\u2191' : '\u2193') : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Batch actions ── */}
      {view === 'list' && selected.size > 0 && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 50, padding: '10px 16px',
          background: `linear-gradient(135deg, ${hexAlpha(BLUE, 0.95)}, ${hexAlpha(GOLD, 0.85)})`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${BORDER}`,
        }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{selected.size} selected</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleSubmit([...selected])} style={btnStyle(AMBER)}>Submit</button>
            <button onClick={() => setActionModal({ type: 'approve', ids: [...selected] })} style={btnStyle(GREEN)}>Approve</button>
            <button onClick={() => setActionModal({ type: 'reject', ids: [...selected] })} style={btnStyle(RED)}>Reject</button>
            <button onClick={() => setSelected(new Set())} style={{ ...btnStyle('transparent'), border: `1px solid #fff`, color: '#fff', padding: '8px 12px' }}>Clear</button>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
          <div style={{
            width: 40, height: 40, border: `3px solid ${BORDER}`, borderTopColor: GOLD,
            borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px',
          }} />
          Loading timesheets...
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ═══════════════════ LIST VIEW ═══════════════════ */}
      {!loading && view === 'list' && (
        <div style={{ padding: '0 16px 100px' }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>No timesheet entries</div>
              <div style={{ fontSize: 14 }}>Create one to get started</div>
            </div>
          )}

          {/* ── Select All ── */}
          {filtered.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
              <input
                type="checkbox"
                checked={filtered.every((e) => selected.has(e.id))}
                onChange={() => toggleSelectAll(filtered.map((e) => e.id))}
                style={{ width: 18, height: 18, accentColor: GOLD }}
              />
              <span style={{ fontSize: 12, color: DIM, fontWeight: 600 }}>Select All ({filtered.length})</span>
            </div>
          )}

          {/* ── Grouped by employee ── */}
          {(() => {
            const groups = new Map<string, TimesheetEntry[]>();
            filtered.forEach((e) => {
              if (!groups.has(e.employee_name)) groups.set(e.employee_name, []);
              groups.get(e.employee_name)!.push(e);
            });
            return [...groups.entries()].map(([emp, items]) => {
              const empTotal = items.reduce((s, e) => s + e.total_hours, 0);
              const empOT = items.reduce((s, e) => s + e.hours_overtime, 0);
              const empDbl = items.reduce((s, e) => s + e.hours_double, 0);
              return (
                <div key={emp} style={{ marginBottom: 20 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0 6px', borderBottom: `1px solid ${BORDER}`, marginBottom: 8,
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: GOLD }}>{emp}</div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
                      <span style={{ color: TEXT }}>{empTotal.toFixed(1)}h total</span>
                      {empOT > 0 && <span style={{ color: AMBER }}>{empOT.toFixed(1)}h OT</span>}
                      {empDbl > 0 && <span style={{ color: RED }}>{empDbl.toFixed(1)}h Dbl</span>}
                    </div>
                  </div>

                  {items.map((entry) => {
                    const isEditing = editingId === entry.id;
                    const statusColor = STATUS_COLORS[entry.status] || DIM;
                    return (
                      <div
                        key={entry.id}
                        style={{
                          ...cardStyle,
                          borderLeft: `4px solid ${statusColor}`,
                          opacity: deleteConfirm === entry.id ? 0.5 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <input
                            type="checkbox"
                            checked={selected.has(entry.id)}
                            onChange={() => toggleSelect(entry.id)}
                            style={{ width: 18, height: 18, accentColor: GOLD, marginTop: 2 }}
                          />
                          <div style={{ flex: 1 }}>
                            {isEditing ? (
                              /* ── Inline edit ── */
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                  <div>
                                    <label style={labelStyle}>Regular</label>
                                    <input
                                      type="number" step="0.5" min="0"
                                      value={editDraft.hours_regular ?? 0}
                                      onChange={(e) => setEditDraft({ ...editDraft, hours_regular: parseFloat(e.target.value) || 0 })}
                                      style={{ ...inputStyle, padding: '6px 8px', fontSize: 13 }}
                                    />
                                  </div>
                                  <div>
                                    <label style={labelStyle}>OT</label>
                                    <input
                                      type="number" step="0.5" min="0"
                                      value={editDraft.hours_overtime ?? 0}
                                      onChange={(e) => setEditDraft({ ...editDraft, hours_overtime: parseFloat(e.target.value) || 0 })}
                                      style={{ ...inputStyle, padding: '6px 8px', fontSize: 13 }}
                                    />
                                  </div>
                                  <div>
                                    <label style={labelStyle}>Double</label>
                                    <input
                                      type="number" step="0.5" min="0"
                                      value={editDraft.hours_double ?? 0}
                                      onChange={(e) => setEditDraft({ ...editDraft, hours_double: parseFloat(e.target.value) || 0 })}
                                      style={{ ...inputStyle, padding: '6px 8px', fontSize: 13 }}
                                    />
                                  </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                  <div>
                                    <label style={labelStyle}>Cost Code</label>
                                    <select
                                      value={editDraft.cost_code ?? ''}
                                      onChange={(e) => setEditDraft({ ...editDraft, cost_code: e.target.value })}
                                      style={{ ...inputStyle, padding: '6px 8px', fontSize: 13 }}
                                    >
                                      {CSI_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label style={labelStyle}>Location</label>
                                    <input
                                      value={editDraft.location ?? ''}
                                      onChange={(e) => setEditDraft({ ...editDraft, location: e.target.value })}
                                      style={{ ...inputStyle, padding: '6px 8px', fontSize: 13 }}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label style={labelStyle}>Description</label>
                                  <input
                                    value={editDraft.description ?? ''}
                                    onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                                    style={{ ...inputStyle, padding: '6px 8px', fontSize: 13 }}
                                  />
                                </div>
                                <div>
                                  <label style={labelStyle}>Notes</label>
                                  <input
                                    value={editDraft.notes ?? ''}
                                    onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                                    style={{ ...inputStyle, padding: '6px 8px', fontSize: 13 }}
                                  />
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button onClick={() => handleSaveEdit(entry.id)} style={btnStyle(GREEN)}>Save</button>
                                  <button onClick={() => { setEditingId(null); setEditDraft({}); }} style={{ ...btnStyle('transparent'), border: `1px solid ${BORDER}`, color: DIM }}>Cancel</button>
                                </div>
                              </div>
                            ) : (
                              /* ── Read-only row ── */
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{fmtShort(entry.work_date)}</span>
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                      background: hexAlpha(statusColor, 0.2), color: statusColor,
                                    }}>
                                      {STATUS_LABELS[entry.status] || entry.status}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    {entry.status === 'draft' && (
                                      <button onClick={() => startEdit(entry)} style={{ background: 'none', border: 'none', color: BLUE, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Edit</button>
                                    )}
                                    <button
                                      onClick={() => setDeleteConfirm(entry.id)}
                                      style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                                    >
                                      Del
                                    </button>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: DIM, marginBottom: 4 }}>
                                  <span>{entry.hours_regular}h reg</span>
                                  {entry.hours_overtime > 0 && <span style={{ color: AMBER }}>{entry.hours_overtime}h OT</span>}
                                  {entry.hours_double > 0 && <span style={{ color: RED }}>{entry.hours_double}h dbl</span>}
                                  <span style={{ fontWeight: 700, color: TEXT }}>{entry.total_hours}h total</span>
                                </div>
                                <div style={{ fontSize: 12, color: DIM }}>
                                  {entry.cost_code && <span style={{ marginRight: 10 }}>CSI {entry.cost_code}</span>}
                                  {entry.location && <span style={{ marginRight: 10 }}>{entry.location}</span>}
                                </div>
                                {entry.description && (
                                  <div style={{ fontSize: 12, color: TEXT, marginTop: 4 }}>{entry.description}</div>
                                )}
                                {entry.rejection_reason && (
                                  <div style={{ fontSize: 12, color: RED, marginTop: 4, fontStyle: 'italic' }}>
                                    Rejection: {entry.rejection_reason}
                                  </div>
                                )}
                                {entry.approved_by && entry.approved_at && (
                                  <div style={{ fontSize: 11, color: GREEN, marginTop: 4 }}>
                                    Approved by {entry.approved_by} on {fmtFull(entry.approved_at.split('T')[0])}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* ── Delete confirmation ── */}
                        {deleteConfirm === entry.id && (
                          <div style={{
                            marginTop: 10, padding: 12, background: hexAlpha(RED, 0.1),
                            border: `1px solid ${hexAlpha(RED, 0.3)}`, borderRadius: 10,
                          }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: RED, marginBottom: 8 }}>
                              Delete this entry? This cannot be undone.
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => handleDelete(entry.id)} style={btnStyle(RED)}>Delete</button>
                              <button onClick={() => setDeleteConfirm(null)} style={{ ...btnStyle('transparent'), border: `1px solid ${BORDER}`, color: DIM }}>Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* ═══════════════════ WEEKLY GRID VIEW ═══════════════════ */}
      {!loading && view === 'weekly' && (
        <div style={{ padding: '0 16px 100px' }}>
          {/* ── Week navigation ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
            <button
              onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}
              style={{ ...btnStyle('transparent'), border: `1px solid ${BORDER}`, color: DIM, padding: '8px 14px' }}
            >
              Prev
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>
                {fmtShort(fmtDate(weekStart))} — {fmtShort(fmtDate(getSunday(weekStart)))}
              </div>
              <div style={{ fontSize: 11, color: DIM }}>Week ending {fmtFull(fmtDate(getSunday(weekStart)))}</div>
            </div>
            <button
              onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}
              style={{ ...btnStyle('transparent'), border: `1px solid ${BORDER}`, color: DIM, padding: '8px 14px' }}
            >
              Next
            </button>
          </div>

          {/* ── Copy previous week ── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={handleCopyPreviousWeek} style={{ ...btnStyle(BLUE), fontSize: 12, padding: '8px 14px' }}>
              Copy Previous Week
            </button>
            <button
              onClick={() => setWeekStart(getMonday(new Date()))}
              style={{ ...btnStyle('transparent'), border: `1px solid ${BORDER}`, color: DIM, fontSize: 12, padding: '8px 14px' }}
            >
              Today
            </button>
          </div>

          {/* ── Day headers ── */}
          <div style={{
            display: 'grid', gridTemplateColumns: '120px repeat(7, 1fr) 60px',
            gap: 2, marginBottom: 4,
          }}>
            <div style={{ padding: 8, fontWeight: 800, fontSize: 12, color: DIM }}>Employee</div>
            {weekDates.map((d, i) => {
              const isToday = fmtDate(d) === fmtDate(new Date());
              return (
                <div
                  key={i}
                  style={{
                    padding: '8px 4px', textAlign: 'center', fontWeight: 700, fontSize: 11,
                    color: isToday ? GOLD : DIM,
                    background: isToday ? hexAlpha(GOLD, 0.08) : 'transparent',
                    borderRadius: 6,
                  }}
                >
                  <div>{DAYS[i]}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: isToday ? GOLD : TEXT }}>{d.getDate()}</div>
                </div>
              );
            })}
            <div style={{ padding: 8, fontWeight: 800, fontSize: 12, color: GOLD, textAlign: 'center' }}>Total</div>
          </div>

          {/* ── Employee rows ── */}
          {employeeWeekMap.size === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: DIM, fontSize: 14 }}>
              No entries this week
            </div>
          )}

          {[...employeeWeekMap.entries()].map(([emp, dayMap]) => {
            let weekTotal = 0;
            return (
              <div
                key={emp}
                style={{
                  display: 'grid', gridTemplateColumns: '120px repeat(7, 1fr) 60px',
                  gap: 2, background: RAISED, borderRadius: 10, border: `1px solid ${BORDER}`,
                  marginBottom: 6, overflow: 'hidden',
                }}
              >
                <div style={{
                  padding: '10px 8px', fontWeight: 700, fontSize: 12, color: TEXT,
                  display: 'flex', alignItems: 'center', borderRight: `1px solid ${BORDER}`,
                  background: hexAlpha(GOLD, 0.05),
                }}>
                  {emp}
                </div>
                {weekDates.map((d, i) => {
                  const dateStr = fmtDate(d);
                  const dayEntries = dayMap.get(dateStr) || [];
                  const dayTotal = dayEntries.reduce((s, e) => s + e.total_hours, 0);
                  weekTotal += dayTotal;
                  const hasOT = dayEntries.some((e) => e.hours_overtime > 0 || e.hours_double > 0);
                  return (
                    <div
                      key={i}
                      style={{
                        padding: '8px 4px', textAlign: 'center', fontSize: 14, fontWeight: 700,
                        color: dayTotal > 0 ? TEXT : hexAlpha(DIM, 0.3),
                        background: dayTotal > 8 ? hexAlpha(AMBER, 0.1) : 'transparent',
                        borderRight: i < 6 ? `1px solid ${hexAlpha(BORDER, 0.3)}` : 'none',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        minHeight: 44, cursor: 'default',
                      }}
                      title={dayEntries.map((e) => `${e.hours_regular}reg + ${e.hours_overtime}OT + ${e.hours_double}dbl — ${e.cost_code}`).join('\n')}
                    >
                      {dayTotal > 0 ? dayTotal.toFixed(1) : '-'}
                      {hasOT && <div style={{ fontSize: 9, color: AMBER, fontWeight: 600 }}>OT</div>}
                    </div>
                  );
                })}
                <div style={{
                  padding: '8px 4px', textAlign: 'center', fontSize: 14, fontWeight: 800,
                  color: weekTotal > 40 ? AMBER : GREEN,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: hexAlpha(GOLD, 0.05), borderLeft: `1px solid ${BORDER}`,
                }}>
                  {weekTotal.toFixed(1)}
                </div>
              </div>
            );
          })}

          {/* ── Week totals footer ── */}
          {employeeWeekMap.size > 0 && (() => {
            const dayTotals = weekDates.map((d) => {
              const dateStr = fmtDate(d);
              return weekEntries.filter((e) => e.work_date === dateStr).reduce((s, e) => s + e.total_hours, 0);
            });
            const grandTotal = dayTotals.reduce((a, b) => a + b, 0);
            return (
              <div style={{
                display: 'grid', gridTemplateColumns: '120px repeat(7, 1fr) 60px',
                gap: 2, background: hexAlpha(GOLD, 0.08), borderRadius: 10,
                border: `1px solid ${hexAlpha(GOLD, 0.3)}`, marginTop: 4,
              }}>
                <div style={{ padding: '10px 8px', fontWeight: 800, fontSize: 12, color: GOLD }}>
                  TOTALS
                </div>
                {dayTotals.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '10px 4px', textAlign: 'center', fontSize: 13, fontWeight: 800,
                      color: t > 0 ? GOLD : hexAlpha(DIM, 0.3),
                    }}
                  >
                    {t > 0 ? t.toFixed(1) : '-'}
                  </div>
                ))}
                <div style={{
                  padding: '10px 4px', textAlign: 'center', fontSize: 14, fontWeight: 900, color: GOLD,
                }}>
                  {grandTotal.toFixed(1)}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════════════ CREATE VIEW ═══════════════════ */}
      {view === 'create' && (
        <div style={{ padding: '16px 16px 100px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: GOLD }}>New Timesheet Entry</h2>
            <button onClick={() => setView('list')} style={{ ...btnStyle('transparent'), border: `1px solid ${BORDER}`, color: DIM }}>Cancel</button>
          </div>

          <div style={{ ...cardStyle, padding: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Employee info */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Employee Name *</label>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Full name" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Employee ID</label>
                  <input value={formEmpId} onChange={(e) => setFormEmpId(e.target.value)} placeholder="ID" style={inputStyle} />
                </div>
              </div>

              {/* Date */}
              <div>
                <label style={labelStyle}>Work Date *</label>
                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} style={inputStyle} />
              </div>

              {/* Hours */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Regular Hours</label>
                  <input
                    type="number" step="0.5" min="0" value={formRegular}
                    onChange={(e) => setFormRegular(parseFloat(e.target.value) || 0)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>OT Hours</label>
                  <input
                    type="number" step="0.5" min="0" value={formOT}
                    onChange={(e) => setFormOT(parseFloat(e.target.value) || 0)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Double Time</label>
                  <input
                    type="number" step="0.5" min="0" value={formDouble}
                    onChange={(e) => setFormDouble(parseFloat(e.target.value) || 0)}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Total preview */}
              <div style={{
                background: hexAlpha(GOLD, 0.1), border: `1px solid ${hexAlpha(GOLD, 0.3)}`,
                borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: DIM }}>Total Hours</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>
                  {(formRegular + formOT + formDouble).toFixed(1)}
                </span>
              </div>

              {/* Cost code */}
              <div>
                <label style={labelStyle}>Cost Code (CSI Division)</label>
                <select value={formCostCode} onChange={(e) => setFormCostCode(e.target.value)} style={inputStyle}>
                  {CSI_CODES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Location */}
              <div>
                <label style={labelStyle}>Location</label>
                <input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="Building, floor, area" style={inputStyle} />
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle}>Work Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Describe work performed"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Additional notes"
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Submit */}
              <button onClick={handleCreate} style={{ ...btnStyle(GOLD), width: '100%', padding: '14px 0', fontSize: 16 }}>
                Create Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ APPROVE / REJECT MODAL ═══════════════════ */}
      {actionModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)', padding: 16,
        }}>
          <div style={{
            background: RAISED, borderRadius: 16, border: `1px solid ${BORDER}`,
            padding: 24, maxWidth: 420, width: '100%',
            boxShadow: `0 20px 60px rgba(0,0,0,0.5)`,
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 16px', color: actionModal.type === 'approve' ? GREEN : RED }}>
              {actionModal.type === 'approve' ? 'Approve' : 'Reject'} {actionModal.ids.length} Entry(ies)
            </h3>

            {actionModal.type === 'reject' && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Rejection Reason *</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Provide reason for rejection"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
            )}

            {actionModal.type === 'approve' && (
              <p style={{ color: DIM, fontSize: 14, margin: '0 0 16px' }}>
                This will approve {actionModal.ids.length} timesheet entry(ies). This action records your name and timestamp.
              </p>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              {actionModal.type === 'approve' ? (
                <button onClick={() => handleApprove(actionModal.ids)} style={btnStyle(GREEN)}>
                  Confirm Approval
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (!rejectionReason.trim()) { showToast('Please enter a reason'); return; }
                    handleReject(actionModal.ids, rejectionReason.trim());
                  }}
                  style={btnStyle(RED)}
                >
                  Confirm Rejection
                </button>
              )}
              <button
                onClick={() => { setActionModal(null); setRejectionReason(''); }}
                style={{ ...btnStyle('transparent'), border: `1px solid ${BORDER}`, color: DIM }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print styles ── */}
      <style>{`
        @media print {
          body { background: #fff !important; color: #000 !important; }
          div { border-color: #ccc !important; }
          button, input[type="checkbox"] { display: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ─── Default Export with Suspense ─── */
export default function TimesheetsPage() {
  return (
    <Suspense fallback={
      <div style={{ background: '#0A1628', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#D4A017', fontWeight: 700, fontSize: 16 }}>Loading Timesheets...</div>
      </div>
    }>
      <TimesheetsInner />
    </Suspense>
  );
}
