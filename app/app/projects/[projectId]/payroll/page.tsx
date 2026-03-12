'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030';
const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 11px', background: DARK,
  border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, outline: 'none',
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type Day = typeof DAYS[number];

const WORK_CLASSIFICATIONS = [
  'Laborer', 'Carpenter', 'Electrician', 'Plumber', 'Ironworker',
  'Operating Engineer', 'Roofer', 'Painter', 'Cement Mason', 'HVAC Tech', 'Foreman', 'Superintendent',
];

interface Employee {
  id: string;
  name: string;
  last4ssn: string;
  classification: string;
  hours: Record<Day, number>;
  hourlyRate: number;
  otRate: number;
  deductions: number;
  overtime: boolean;
}

interface PayrollRecord {
  id: string;
  week_ending: string;
  employee_count: number;
  total_gross: number;
  status: 'submitted' | 'draft' | 'certified';
  pdf_url?: string | null;
}

const defaultEmployee = (): Employee => ({
  id: 'emp-' + Date.now() + Math.random(),
  name: '',
  last4ssn: '',
  classification: 'Laborer',
  hours: { Mon: 8, Tue: 8, Wed: 8, Thu: 8, Fri: 8, Sat: 0, Sun: 0 },
  hourlyRate: 0,
  otRate: 0,
  deductions: 0,
  overtime: false,
});

function calcGross(emp: Employee): number {
  const totalHours = Object.values(emp.hours).reduce((s, h) => s + h, 0);
  const regularHours = Math.min(totalHours, 40);
  const otHours = Math.max(0, totalHours - 40);
  const otRate = emp.otRate || emp.hourlyRate * 1.5;
  return regularHours * emp.hourlyRate + otHours * otRate;
}

function calcNet(emp: Employee): number {
  return Math.max(0, calcGross(emp) - (emp.deductions || 0));
}

const statusCfg: Record<string, { color: string; bg: string }> = {
  submitted: { color: GOLD,      bg: 'rgba(212,160,23,.12)' },
  draft:     { color: DIM,       bg: 'rgba(148,163,184,.1)' },
  certified: { color: '#1db954', bg: 'rgba(26,138,74,.12)' },
};

export default function PayrollPage() {
  const params = useParams();
  const pid = params['projectId'] as string;

  const [weekEndingDate, setWeekEndingDate] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([defaultEmployee()]);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newEmp, setNewEmp] = useState<Employee>(defaultEmployee());
  const [complianceAgreed, setComplianceAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);

  useEffect(() => { loadRecords(); }, [pid]);

  async function loadRecords() {
    setRecordsLoading(true);
    try {
      const r = await fetch(`/api/payroll/list?projectId=${pid}`);
      const d = await r.json() as any;
      setRecords(d.records || []);
    } catch {
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  }

  const totalWeekHours = employees.reduce((s, e) => s + Object.values(e.hours).reduce((h, v) => h + v, 0), 0);
  const totalWeekGross = employees.reduce((s, e) => s + calcGross(e), 0);
  const totalWeekNet = employees.reduce((s, e) => s + calcNet(e), 0);

  function updateEmpHours(empId: string, day: Day, val: number) {
    setEmployees(prev => prev.map(e => e.id === empId ? { ...e, hours: { ...e.hours, [day]: val } } : e));
  }

  function updateEmp(empId: string, field: keyof Employee, val: any) {
    setEmployees(prev => prev.map(e => e.id === empId ? { ...e, [field]: val } : e));
  }

  function removeEmp(empId: string) {
    setEmployees(prev => prev.filter(e => e.id !== empId));
  }

  function addEmployee() {
    if (!newEmp.name) return;
    setEmployees(prev => [...prev, { ...newEmp, id: 'emp-' + Date.now() }]);
    setNewEmp(defaultEmployee());
    setShowAddEmployee(false);
  }

  async function handleGenerate() {
    if (!weekEndingDate) { setError('Week Ending Date is required.'); return; }
    if (employees.length === 0) { setError('Add at least one employee.'); return; }
    if (!complianceAgreed) { setError('You must certify the Statement of Compliance before generating.'); return; }
    setError(''); setLoading(true);
    try {
      const payload = {
        projectId: pid,
        weekEndingDate,
        employees: employees.map(e => ({
          name: e.name,
          last4ssn: e.last4ssn,
          classification: e.classification,
          hours: e.hours,
          hourlyRate: e.hourlyRate,
          otRate: e.otRate || e.hourlyRate * 1.5,
          gross: calcGross(e),
          deductions: e.deductions,
          net: calcNet(e),
          overtime: e.overtime,
        })),
        totalGross: totalWeekGross,
      };
      const res = await fetch('/api/payroll/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json() as any;
      if (d.error) {
        setError(d.error);
      } else {
        setSuccess('WH-347 generated!' + (d.downloadUrl ? ' Download: ' + d.downloadUrl : ' Check history below.'));
        setWeekEndingDate('');
        setEmployees([defaultEmployee()]);
        setComplianceAgreed(false);
        await loadRecords();
      }
    } catch {
      setError('Request failed. Check your connection and try again.');
    }
    setLoading(false);
  }

  return (
    <div style={{ background: DARK, minHeight: '100%' }}>

      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Certified Payroll</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>DOL WH-347 — Davis-Bacon &amp; prevailing wage compliance</div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{ padding: '8px 18px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Generating...' : 'Generate WH-347'}
        </button>
      </div>

      <div style={{ padding: 24 }}>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Current Week Hours', value: totalWeekHours.toFixed(1) + ' hrs', color: TEXT },
            { label: 'Gross Wages This Week', value: fmt(totalWeekGross), color: GOLD },
            { label: 'Net Wages This Week', value: fmt(totalWeekNet), color: '#1db954' },
          ].map(k => (
            <div key={k.label} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: DIM, marginBottom: 6, letterSpacing: 0.5 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Messages */}
        {error && <div style={{ background: 'rgba(192,48,48,.1)', border: '1px solid rgba(192,48,48,.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#ff7070' }}>{error}</div>}
        {success && <div style={{ background: 'rgba(26,138,74,.08)', border: '1px solid rgba(26,138,74,.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#1db954' }}>{success}</div>}

        {/* Week Ending */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20 }}>
            <div style={{ flex: 1, maxWidth: 240 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Week Ending Date *</label>
              <SaguaroDatePicker value={weekEndingDate} onChange={setWeekEndingDate} style={inp} />
            </div>
            <button
              onClick={() => setShowAddEmployee(!showAddEmployee)}
              style={{ padding: '8px 18px', background: showAddEmployee ? RAISED : `linear-gradient(135deg,${GOLD},#F0C040)`, border: showAddEmployee ? `1px solid ${BORDER}` : 'none', borderRadius: 7, color: showAddEmployee ? DIM : DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
              {showAddEmployee ? 'Cancel' : '+ Add Employee'}
            </button>
          </div>
        </div>

        {/* Add Employee Form */}
        {showAddEmployee && (
          <div style={{ background: RAISED, border: `1px solid rgba(212,160,23,.3)`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 14 }}>Add Employee</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
              {[
                { label: 'Full Name *', el: <input value={newEmp.name} onChange={e => setNewEmp(p => ({ ...p, name: e.target.value }))} placeholder="John Smith" style={inp} /> },
                { label: 'Last 4 SSN', el: <input value={newEmp.last4ssn} onChange={e => setNewEmp(p => ({ ...p, last4ssn: e.target.value }))} placeholder="1234" maxLength={4} style={inp} /> },
                { label: 'Classification', el: <select value={newEmp.classification} onChange={e => setNewEmp(p => ({ ...p, classification: e.target.value }))} style={inp}>{WORK_CLASSIFICATIONS.map(c => <option key={c}>{c}</option>)}</select> },
                { label: 'Reg Rate ($)', el: <input type="number" value={newEmp.hourlyRate} onChange={e => setNewEmp(p => ({ ...p, hourlyRate: Number(e.target.value) }))} placeholder="28.50" style={{ ...inp, textAlign: 'right' }} /> },
                { label: 'OT Rate ($)', el: <input type="number" value={newEmp.otRate} onChange={e => setNewEmp(p => ({ ...p, otRate: Number(e.target.value) }))} placeholder="42.75" style={{ ...inp, textAlign: 'right' }} /> },
              ].map(({ label, el }) => (
                <div key={label}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>{label}</label>
                  {el}
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Daily Hours</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
                {DAYS.map(day => (
                  <div key={day}>
                    <div style={{ fontSize: 10, color: DIM, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>{day}</div>
                    <input type="number" min={0} max={24} step={0.5} value={newEmp.hours[day]} onChange={e => setNewEmp(p => ({ ...p, hours: { ...p.hours, [day]: Number(e.target.value) } }))} style={{ ...inp, textAlign: 'center', padding: '6px 4px' }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, marginBottom: 16, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={newEmp.overtime} onChange={e => setNewEmp(p => ({ ...p, overtime: e.target.checked }))} style={{ width: 16, height: 16, accentColor: GOLD }} />
                <span style={{ fontSize: 13, color: TEXT }}>OT eligible (1.5× after 40h)</span>
              </label>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Deductions ($)</label>
                <input type="number" value={newEmp.deductions} onChange={e => setNewEmp(p => ({ ...p, deductions: Number(e.target.value) }))} style={{ ...inp, maxWidth: 120, textAlign: 'right' }} />
              </div>
            </div>
            <button onClick={addEmployee} style={{ padding: '9px 22px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Add to Payroll</button>
          </div>
        )}

        {/* Employee Table */}
        {employees.length > 0 && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Employee Hours — Current Week</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#0a1117' }}>
                    {['Employee', 'Class', 'Reg $', 'OT $', ...DAYS, 'Hrs', 'Gross', 'Ded.', 'Net', 'OT', ''].map(h => (
                      <th key={h + Math.random()} style={{ padding: '9px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: DIM, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, idx) => {
                    const totalHours = Object.values(emp.hours).reduce((s, h) => s + h, 0);
                    const gross = calcGross(emp);
                    const net = calcNet(emp);
                    return (
                      <tr key={emp.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)', borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                        <td style={{ padding: '7px 8px', minWidth: 140 }}>
                          <input value={emp.name} onChange={e => updateEmp(emp.id, 'name', e.target.value)} placeholder="Name" style={{ ...inp, fontSize: 11 }} />
                        </td>
                        <td style={{ padding: '7px 6px', minWidth: 120 }}>
                          <select value={emp.classification} onChange={e => updateEmp(emp.id, 'classification', e.target.value)} style={{ ...inp, fontSize: 11 }}>
                            {WORK_CLASSIFICATIONS.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '7px 6px', width: 70 }}>
                          <input type="number" value={emp.hourlyRate} onChange={e => updateEmp(emp.id, 'hourlyRate', Number(e.target.value))} style={{ ...inp, fontSize: 11, textAlign: 'right', width: 60 }} />
                        </td>
                        <td style={{ padding: '7px 6px', width: 70 }}>
                          <input type="number" value={emp.otRate} onChange={e => updateEmp(emp.id, 'otRate', Number(e.target.value))} style={{ ...inp, fontSize: 11, textAlign: 'right', width: 60 }} />
                        </td>
                        {DAYS.map(day => (
                          <td key={day} style={{ padding: '7px 4px', width: 48 }}>
                            <input type="number" min={0} max={24} step={0.5} value={emp.hours[day]} onChange={e => updateEmpHours(emp.id, day, Number(e.target.value))} style={{ ...inp, fontSize: 11, textAlign: 'center', padding: '5px 3px', width: 40 }} />
                          </td>
                        ))}
                        <td style={{ padding: '7px 8px', color: totalHours > 40 ? GOLD : TEXT, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{totalHours.toFixed(1)}</td>
                        <td style={{ padding: '7px 8px', color: GOLD, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(gross)}</td>
                        <td style={{ padding: '7px 6px', width: 70 }}>
                          <input type="number" value={emp.deductions} onChange={e => updateEmp(emp.id, 'deductions', Number(e.target.value))} style={{ ...inp, fontSize: 11, textAlign: 'right', width: 60 }} />
                        </td>
                        <td style={{ padding: '7px 8px', color: '#1db954', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(net)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                          <input type="checkbox" checked={emp.overtime} onChange={e => updateEmp(emp.id, 'overtime', e.target.checked)} title="OT eligible" style={{ cursor: 'pointer', accentColor: GOLD }} />
                        </td>
                        <td style={{ padding: '7px 5px' }}>
                          <button onClick={() => removeEmp(emp.id)} title="Remove" style={{ background: 'none', border: 'none', color: '#ff7070', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#0a1117', borderTop: `2px solid ${BORDER}` }}>
                    <td colSpan={4} style={{ padding: '10px 8px', fontWeight: 800, fontSize: 12, color: TEXT, textTransform: 'uppercase', letterSpacing: 0.3 }}>TOTALS</td>
                    {DAYS.map(day => (
                      <td key={day} style={{ padding: '10px 4px', fontWeight: 700, color: GOLD, textAlign: 'center', fontSize: 12 }}>
                        {employees.reduce((s, e) => s + e.hours[day], 0)}
                      </td>
                    ))}
                    <td style={{ padding: '10px 8px', fontWeight: 800, color: GOLD, textAlign: 'right' }}>{totalWeekHours.toFixed(1)}</td>
                    <td style={{ padding: '10px 8px', fontWeight: 800, color: GOLD, whiteSpace: 'nowrap' }}>{fmt(totalWeekGross)}</td>
                    <td />
                    <td style={{ padding: '10px 8px', fontWeight: 800, color: '#1db954', whiteSpace: 'nowrap' }}>{fmt(totalWeekNet)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Statement of Compliance */}
        <div style={{ background: RAISED, border: `1px solid ${complianceAgreed ? 'rgba(26,138,74,.3)' : BORDER}`, borderRadius: 10, padding: 20, marginBottom: 20, transition: 'border-color .2s' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 10 }}>Statement of Compliance</div>
          <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6, marginBottom: 14 }}>
            I hereby certify that the payroll records shown for the week ending above are correct and complete, that the wage rates are not less than those determined by the Secretary of Labor under the Davis-Bacon Act, and that the classifications set forth therein are proper. This certification is required under the Davis-Bacon and related acts.
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <input type="checkbox" id="compliance" checked={complianceAgreed} onChange={e => setComplianceAgreed(e.target.checked)} style={{ width: 18, height: 18, accentColor: GOLD }} />
            <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>I certify this payroll is accurate and compliant with prevailing wage requirements</span>
          </label>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{ padding: '12px 32px', marginBottom: 32, background: complianceAgreed ? `linear-gradient(135deg,${GOLD},#F0C040)` : 'rgba(212,160,23,.2)', border: 'none', borderRadius: 8, color: complianceAgreed ? DARK : DIM, fontSize: 14, fontWeight: 800, cursor: complianceAgreed && !loading ? 'pointer' : 'not-allowed', opacity: loading ? 0.7 : 1, transition: 'all .2s' }}>
          {loading ? 'Generating WH-347...' : 'Generate WH-347 PDF'}
        </button>

        {/* Payroll History */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Payroll History</span>
          </div>
          {recordsLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: DIM, fontSize: 13 }}>Loading records...</div>
          ) : records.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: DIM, fontSize: 13 }}>No payroll records submitted yet. Generate your first WH-347 above.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0a1117' }}>
                  {['Week Ending', '# Employees', 'Total Gross', 'Status', 'Download'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map(record => {
                  const sc = statusCfg[record.status] || statusCfg.draft;
                  return (
                    <tr key={record.id} style={{ borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                      <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>{record.week_ending}</td>
                      <td style={{ padding: '12px 16px', color: DIM }}>{record.employee_count}</td>
                      <td style={{ padding: '12px 16px', color: TEXT }}>{fmt(record.total_gross)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: sc.bg, color: sc.color, textTransform: 'uppercase', letterSpacing: 0.3 }}>{record.status}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {record.pdf_url ? (
                          <a href={record.pdf_url} target="_blank" rel="noopener noreferrer" style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 5, color: GOLD, fontSize: 11, padding: '3px 10px', textDecoration: 'none', fontWeight: 700 }}>📄 WH-347 PDF</a>
                        ) : (
                          <span style={{ fontSize: 11, color: DIM }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
