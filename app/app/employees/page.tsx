'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';

const GOLD = '#C8960F', DARK = '#0d1117', RAISED = '#161b22', BORDER = '#30363d';
const DIM = '#8B9DB8', TEXT = '#F0F4FF', GREEN = '#2ea043', RED = '#f85149', AMBER = '#e3b341';
const BLUE = '#3B82F6';

const TRADES: Record<string, string> = {
  concrete: '#6366F1', framing: '#F59E0B', electrical: '#3B82F6', plumbing: '#10B981',
  general: '#8B9DB8', drywall: '#EC4899', painting: '#A855F7', steel: '#EF4444',
  hvac: '#06B6D4', roofing: '#D97706', masonry: '#78716C', landscaping: '#22C55E',
};

interface Employee {
  id: string;
  employee_number: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  title: string | null;
  trade: string | null;
  email: string | null;
  phone: string | null;
  hire_date: string | null;
  employment_type: string;
  regular_rate: number;
  overtime_rate: number | null;
  osha_10_certified: boolean;
  osha_30_certified: boolean;
  forklift_certified: boolean;
  is_active: boolean;
  default_csi_division: string | null;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showActive, setShowActive] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: '', last_name: '', title: '', trade: '', email: '', phone: '',
    regular_rate: '', overtime_rate: '', hire_date: '', employment_type: 'hourly',
    osha_10_certified: false, osha_30_certified: false, default_csi_division: '',
    employee_number: '',
  });

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employees?active=${showActive}`);
      const data = await res.json();
      setEmployees(data.employees || []);
    } catch { /* handled */ } finally { setLoading(false); }
  }, [showActive]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const filtered = useMemo(() => {
    if (!search) return employees;
    const q = search.toLowerCase();
    return employees.filter((e) =>
      e.full_name.toLowerCase().includes(q) ||
      (e.trade || '').toLowerCase().includes(q) ||
      (e.title || '').toLowerCase().includes(q)
    );
  }, [employees, search]);

  const handleCreateEmployee = async () => {
    if (!form.first_name || !form.last_name) return;
    setSaving(true);
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          regular_rate: Number(form.regular_rate) || 0,
          overtime_rate: form.overtime_rate ? Number(form.overtime_rate) : null,
        }),
      });
      if (res.ok) {
        setShowModal(false);
        setForm({ first_name: '', last_name: '', title: '', trade: '', email: '', phone: '',
          regular_rate: '', overtime_rate: '', hire_date: '', employment_type: 'hourly',
          osha_10_certified: false, osha_30_certified: false, default_csi_division: '',
          employee_number: '' });
        await fetchEmployees();
      }
    } finally { setSaving(false); }
  };

  const handleToggleActive = async (emp: Employee) => {
    await fetch(`/api/employees/${emp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !emp.is_active }),
    });
    await fetchEmployees();
  };

  const activeCount = employees.filter((e) => e.is_active).length;
  const avgRate = employees.length > 0
    ? employees.reduce((s, e) => s + Number(e.regular_rate || 0), 0) / employees.length
    : 0;
  const oshaCount = employees.filter((e) => e.osha_10_certified || e.osha_30_certified).length;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', background: DARK, border: `1px solid ${BORDER}`,
    borderRadius: 6, color: TEXT, fontSize: 14, outline: 'none',
  };
  const labelStyle: React.CSSProperties = { color: DIM, fontSize: 12, marginBottom: 4, display: 'block' };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ color: TEXT, fontSize: 24, margin: 0 }}>Employees</h1>
        <button onClick={() => setShowModal(true)}
          style={{ padding: '8px 16px', background: GOLD, color: '#000', border: 'none',
            borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          + Add Employee
        </button>
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Active Employees', value: String(activeCount), color: GREEN },
          { label: 'Avg. Rate', value: `$${Math.round(avgRate)}/hr`, color: GOLD },
          { label: 'OSHA Certified', value: String(oshaCount), color: BLUE },
        ].map((k) => (
          <div key={k.label} style={{ background: RAISED, border: `1px solid ${BORDER}`,
            borderRadius: 8, padding: '14px', textAlign: 'center' }}>
            <div style={{ color: DIM, fontSize: 11, marginBottom: 4, textTransform: 'uppercase' }}>{k.label}</div>
            <div style={{ color: k.color, fontSize: 20, fontWeight: 700 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* CONTROLS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, trade, or title..."
          style={{ ...inputStyle, flex: 1 }} />
        <button onClick={() => setShowActive(!showActive)}
          style={{ padding: '8px 14px', background: RAISED, border: `1px solid ${BORDER}`,
            borderRadius: 6, color: showActive ? GREEN : DIM, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}>
          {showActive ? 'Active Only' : 'All Employees'}
        </button>
      </div>

      {/* EMPLOYEE LIST */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: GOLD }}>Loading employees...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: DIM }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>👷</div>
          <div style={{ fontSize: 16, marginBottom: 8, color: TEXT }}>No employees found</div>
          <div style={{ marginBottom: 16 }}>Add your first employee to start tracking timecards.</div>
          <button onClick={() => setShowModal(true)}
            style={{ padding: '10px 20px', background: GOLD, color: '#000', border: 'none',
              borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
            + Add Employee
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map((emp) => (
            <div key={emp.id} style={{ background: RAISED, border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
              opacity: emp.is_active ? 1 : 0.5 }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: DARK,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: GOLD, fontWeight: 700, fontSize: 15 }}>
                {emp.first_name[0]}{emp.last_name[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>
                  {emp.full_name}
                  {emp.employee_number && <span style={{ color: DIM, fontWeight: 400, marginLeft: 8, fontSize: 12 }}>#{emp.employee_number}</span>}
                </div>
                <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>
                  {emp.title || emp.trade || 'Worker'}
                  {emp.hire_date && <span> · Hired {emp.hire_date}</span>}
                </div>
              </div>
              {emp.trade && (
                <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                  color: '#fff', background: TRADES[emp.trade] || DIM, textTransform: 'uppercase' }}>
                  {emp.trade}
                </span>
              )}
              {emp.osha_30_certified && <span style={{ fontSize: 12 }} title="OSHA 30">🦺 30</span>}
              {!emp.osha_30_certified && emp.osha_10_certified && <span style={{ fontSize: 12 }} title="OSHA 10">🦺 10</span>}
              <div style={{ color: GOLD, fontWeight: 600, fontSize: 13, minWidth: 70, textAlign: 'right' }}>
                ${Number(emp.regular_rate || 0)}/hr
              </div>
              <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                color: '#fff', background: emp.is_active ? GREEN : DIM }}>
                {emp.is_active ? 'ACTIVE' : 'INACTIVE'}
              </span>
              <button onClick={() => handleToggleActive(emp)}
                style={{ padding: '4px 8px', background: 'transparent', border: `1px solid ${BORDER}`,
                  borderRadius: 4, color: emp.is_active ? RED : GREEN, cursor: 'pointer', fontSize: 11 }}>
                {emp.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ADD EMPLOYEE MODAL */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12,
            padding: 28, width: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ color: GOLD, margin: '0 0 20px', fontSize: 18 }}>Add Employee</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>First Name *</label>
                <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  style={inputStyle} placeholder="First name" />
              </div>
              <div>
                <label style={labelStyle}>Last Name *</label>
                <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  style={inputStyle} placeholder="Last name" />
              </div>
              <div>
                <label style={labelStyle}>Title</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  style={inputStyle} placeholder="e.g. Foreman" />
              </div>
              <div>
                <label style={labelStyle}>Trade</label>
                <select value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} style={inputStyle}>
                  <option value="">Select trade</option>
                  {Object.keys(TRADES).map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Employee #</label>
                <input value={form.employee_number} onChange={(e) => setForm({ ...form, employee_number: e.target.value })}
                  style={inputStyle} placeholder="HR number" />
              </div>
              <div>
                <label style={labelStyle}>Regular Rate ($/hr)</label>
                <input value={form.regular_rate} onChange={(e) => setForm({ ...form, regular_rate: e.target.value })}
                  style={inputStyle} type="number" placeholder="0" />
              </div>
              <div>
                <label style={labelStyle}>OT Rate ($/hr)</label>
                <input value={form.overtime_rate} onChange={(e) => setForm({ ...form, overtime_rate: e.target.value })}
                  style={inputStyle} type="number" placeholder="Auto: 1.5×" />
              </div>
              <div>
                <label style={labelStyle}>Hire Date</label>
                <input value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
                  style={inputStyle} type="date" />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={inputStyle} type="email" placeholder="email@company.com" />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  style={inputStyle} type="tel" placeholder="(555) 123-4567" />
              </div>
              <div style={{ gridColumn: '1/3', display: 'flex', gap: 16, marginTop: 4 }}>
                <label style={{ color: TEXT, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={form.osha_10_certified}
                    onChange={(e) => setForm({ ...form, osha_10_certified: e.target.checked })} />
                  OSHA 10
                </label>
                <label style={{ color: TEXT, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={form.osha_30_certified}
                    onChange={(e) => setForm({ ...form, osha_30_certified: e.target.checked })} />
                  OSHA 30
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)}
                style={{ padding: '10px 20px', background: 'transparent', border: `1px solid ${BORDER}`,
                  borderRadius: 6, color: DIM, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleCreateEmployee} disabled={saving || !form.first_name || !form.last_name}
                style={{ padding: '10px 24px', background: GOLD, color: '#000', border: 'none',
                  borderRadius: 6, cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Adding...' : 'Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
