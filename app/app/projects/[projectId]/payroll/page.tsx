'use client';
import React, { useState } from 'react';
import { useParams } from 'next/navigation';

const GOLD = '#D4A017';
const DARK = '#0d1117';
const RAISED = '#1f2c3e';
const BORDER = '#263347';
const DIM = '#8fa3c0';
const TEXT = '#e8edf8';
const GREEN = '#3dd68c';
const RED_COLOR = '#ef4444';

const fmt = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const inp: React.CSSProperties = {
  width: '100%',
  padding: '8px 11px',
  background: '#0d1117',
  border: '1px solid ' + BORDER,
  borderRadius: 6,
  color: TEXT,
  fontSize: 12,
  outline: 'none',
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
  overtime: boolean;
}

interface PayrollRecord {
  id: string;
  weekEnding: string;
  employees: number;
  totalGross: number;
  status: 'submitted' | 'draft' | 'certified';
}

const DEMO_RECORDS: PayrollRecord[] = [
  { id: 'pr-001', weekEnding: '2026-03-07', employees: 14, totalGross: 28_450.00, status: 'submitted' },
  { id: 'pr-002', weekEnding: '2026-02-28', employees: 12, totalGross: 24_800.00, status: 'certified' },
  { id: 'pr-003', weekEnding: '2026-02-21', employees: 11, totalGross: 22_100.00, status: 'certified' },
  { id: 'pr-004', weekEnding: '2026-02-14', employees: 10, totalGross: 19_850.00, status: 'certified' },
];

const defaultEmployee = (): Employee => ({
  id: 'emp-' + Date.now(),
  name: '',
  last4ssn: '',
  classification: 'Laborer',
  hours: { Mon: 8, Tue: 8, Wed: 8, Thu: 8, Fri: 8, Sat: 0, Sun: 0 },
  hourlyRate: 0,
  overtime: false,
});

const calcGross = (emp: Employee): number => {
  const totalHours = Object.values(emp.hours).reduce((s, h) => s + h, 0);
  const regularHours = Math.min(totalHours, 40);
  const otHours = Math.max(0, totalHours - 40);
  return regularHours * emp.hourlyRate + otHours * emp.hourlyRate * (emp.overtime ? 1.5 : 1);
};

const statusConfig: Record<string, { color: string; bg: string }> = {
  submitted: { color: GOLD,       bg: 'rgba(212,160,23,.12)' },
  draft:     { color: DIM,        bg: 'rgba(148,163,184,.1)' },
  certified: { color: GREEN,      bg: 'rgba(61,214,140,.12)' },
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
  const [records, setRecords] = useState<PayrollRecord[]>(DEMO_RECORDS);

  const totalWeekHours = employees.reduce(
    (s, e) => s + Object.values(e.hours).reduce((h, v) => h + v, 0), 0
  );
  const totalWeekGross = employees.reduce((s, e) => s + calcGross(e), 0);
  const ytdWorkers = new Set([...records.map(r => r.employees)]).size > 0
    ? records.reduce((max, r) => Math.max(max, r.employees), 0)
    : employees.length;

  const updateEmpHours = (empId: string, day: Day, val: number) => {
    setEmployees(prev => prev.map(e => e.id === empId ? { ...e, hours: { ...e.hours, [day]: val } } : e));
  };

  const updateEmp = (empId: string, field: keyof Employee, val: string | number | boolean) => {
    setEmployees(prev => prev.map(e => e.id === empId ? { ...e, [field]: val } : e));
  };

  const removeEmp = (empId: string) => {
    setEmployees(prev => prev.filter(e => e.id !== empId));
  };

  const addEmployee = () => {
    if (!newEmp.name) { return; }
    setEmployees(prev => [...prev, { ...newEmp, id: 'emp-' + Date.now() }]);
    setNewEmp(defaultEmployee());
    setShowAddEmployee(false);
  };

  async function handleGenerate() {
    if (!weekEndingDate) { setError('Week Ending Date is required.'); return; }
    if (employees.length === 0) { setError('Add at least one employee.'); return; }
    if (!complianceAgreed) { setError('You must certify compliance (Statement of Compliance) before generating the WH-347.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/payroll/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: pid, weekEndingDate, employees }),
      });
      const d = await res.json();
      if (d.error) {
        setError(d.error);
      } else {
        const newRecord: PayrollRecord = {
          id: d.recordId || 'pr-new-' + Date.now(),
          weekEnding: weekEndingDate,
          employees: employees.length,
          totalGross: totalWeekGross,
          status: 'submitted',
        };
        setRecords(prev => [newRecord, ...prev]);
        setSuccess('WH-347 generated and submitted! Download link: ' + (d.downloadUrl || '(available in records)'));
        setWeekEndingDate('');
        setEmployees([defaultEmployee()]);
        setComplianceAgreed(false);
      }
    } catch {
      setError('Request failed. Please try again.');
    }
    setLoading(false);
  }

  return (
    <div style={{ background: DARK, minHeight: '100%' }}>

      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: DARK,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Certified Payroll</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>DOL WH-347 — Davis-Bacon &amp; prevailing wage compliance</div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            padding: '8px 18px',
            background: `linear-gradient(135deg,${GOLD},#F0C040)`,
            border: 'none', borderRadius: 7,
            color: '#0d1117', fontSize: 13, fontWeight: 800,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >{loading ? 'Generating...' : 'Generate WH-347'}</button>
      </div>

      <div style={{ padding: 24 }}>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Current Week Hours', value: totalWeekHours.toFixed(1) + ' hrs', color: TEXT },
            { label: 'Gross Wages This Week', value: fmt(totalWeekGross), color: GOLD },
            { label: 'Peak Workers (YTD)', value: ytdWorkers.toString(), color: GREEN },
          ].map(kpi => (
            <div key={kpi.label} style={{
              background: RAISED, border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: '16px 18px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: DIM, marginBottom: 6, letterSpacing: 0.5 }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Messages */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)',
            borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: RED_COLOR,
          }}>{error}</div>
        )}
        {success && (
          <div style={{
            background: 'rgba(61,214,140,.08)', border: '1px solid rgba(61,214,140,.3)',
            borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: GREEN,
          }}>{success}</div>
        )}

        {/* Week Ending + Period */}
        <div style={{
          background: RAISED, border: `1px solid ${BORDER}`,
          borderRadius: 10, padding: 20, marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20 }}>
            <div style={{ flex: 1, maxWidth: 240 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                Week Ending Date *
              </label>
              <input
                type="date"
                value={weekEndingDate}
                onChange={e => setWeekEndingDate(e.target.value)}
                style={inp}
              />
            </div>
            <button
              onClick={() => setShowAddEmployee(!showAddEmployee)}
              style={{
                padding: '8px 18px',
                background: showAddEmployee ? RAISED : `linear-gradient(135deg,${GOLD},#F0C040)`,
                border: showAddEmployee ? `1px solid ${BORDER}` : 'none',
                borderRadius: 7,
                color: showAddEmployee ? DIM : '#0d1117',
                fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}
            >{showAddEmployee ? 'Cancel' : '+ Add Employee'}</button>
          </div>
        </div>

        {/* Add Employee Form */}
        {showAddEmployee && (
          <div style={{
            background: RAISED, border: '1px solid rgba(212,160,23,.3)',
            borderRadius: 10, padding: 20, marginBottom: 20,
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 14 }}>Add Employee</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Full Name *</label>
                <input value={newEmp.name} onChange={e => setNewEmp(p => ({ ...p, name: e.target.value }))} placeholder="John Smith" style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Last 4 SSN</label>
                <input value={newEmp.last4ssn} onChange={e => setNewEmp(p => ({ ...p, last4ssn: e.target.value }))} placeholder="1234" maxLength={4} style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Work Classification</label>
                <select value={newEmp.classification} onChange={e => setNewEmp(p => ({ ...p, classification: e.target.value }))} style={inp}>
                  {WORK_CLASSIFICATIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Hourly Rate ($)</label>
                <input type="number" value={newEmp.hourlyRate} onChange={e => setNewEmp(p => ({ ...p, hourlyRate: Number(e.target.value) }))} placeholder="28.50" style={{ ...inp, textAlign: 'right' }} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Daily Hours</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                {DAYS.map(day => (
                  <div key={day}>
                    <div style={{ fontSize: 10, color: DIM, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>{day}</div>
                    <input
                      type="number"
                      min={0} max={24} step={0.5}
                      value={newEmp.hours[day]}
                      onChange={e => setNewEmp(p => ({ ...p, hours: { ...p.hours, [day]: Number(e.target.value) } }))}
                      style={{ ...inp, textAlign: 'center', padding: '6px 4px' }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <input
                type="checkbox"
                id="ot-new"
                checked={newEmp.overtime}
                onChange={e => setNewEmp(p => ({ ...p, overtime: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="ot-new" style={{ fontSize: 13, color: TEXT, cursor: 'pointer' }}>
                Eligible for overtime (1.5x after 40 hours)
              </label>
            </div>
            <button
              onClick={addEmployee}
              style={{
                padding: '9px 22px',
                background: `linear-gradient(135deg,${GOLD},#F0C040)`,
                border: 'none', borderRadius: 7,
                color: '#0d1117', fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}
            >Add to Payroll</button>
          </div>
        )}

        {/* Employee Hours Table */}
        {employees.length > 0 && (
          <div style={{
            background: RAISED, border: `1px solid ${BORDER}`,
            borderRadius: 10, overflow: 'hidden', marginBottom: 20,
          }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Employee Hours — Current Week</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#0a1117' }}>
                    {['Employee', 'Classification', 'Rate', ...DAYS, 'Total Hrs', 'Gross Pay', 'OT', ''].map(h => (
                      <th key={h} style={{
                        padding: '9px 10px', textAlign: 'left',
                        fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: 0.4,
                        color: DIM, borderBottom: `1px solid ${BORDER}`,
                        whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, idx) => {
                    const totalHours = Object.values(emp.hours).reduce((s, h) => s + h, 0);
                    const gross = calcGross(emp);
                    return (
                      <tr key={emp.id} style={{
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)',
                        borderBottom: `1px solid rgba(38,51,71,.5)`,
                      }}>
                        <td style={{ padding: '8px 10px', minWidth: 160 }}>
                          <input
                            value={emp.name}
                            onChange={e => updateEmp(emp.id, 'name', e.target.value)}
                            placeholder="Employee name"
                            style={inp}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', minWidth: 140 }}>
                          <select
                            value={emp.classification}
                            onChange={e => updateEmp(emp.id, 'classification', e.target.value)}
                            style={inp}
                          >
                            {WORK_CLASSIFICATIONS.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '8px 10px', width: 80 }}>
                          <input
                            type="number"
                            value={emp.hourlyRate}
                            onChange={e => updateEmp(emp.id, 'hourlyRate', Number(e.target.value))}
                            style={{ ...inp, textAlign: 'right', width: 70 }}
                          />
                        </td>
                        {DAYS.map(day => (
                          <td key={day} style={{ padding: '8px 6px', width: 52 }}>
                            <input
                              type="number"
                              min={0} max={24} step={0.5}
                              value={emp.hours[day]}
                              onChange={e => updateEmpHours(emp.id, day, Number(e.target.value))}
                              style={{ ...inp, textAlign: 'center', padding: '6px 4px', width: 44 }}
                            />
                          </td>
                        ))}
                        <td style={{ padding: '8px 10px', color: totalHours > 40 ? GOLD : TEXT, fontWeight: 700, textAlign: 'right' }}>
                          {totalHours.toFixed(1)}
                        </td>
                        <td style={{ padding: '8px 10px', color: GREEN, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {fmt(gross)}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={emp.overtime}
                            onChange={e => updateEmp(emp.id, 'overtime', e.target.checked)}
                            title="OT eligible"
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '8px 6px', width: 30 }}>
                          <button
                            onClick={() => removeEmp(emp.id)}
                            title="Remove"
                            style={{
                              background: 'none', border: 'none',
                              color: RED_COLOR, cursor: 'pointer',
                              fontSize: 14, padding: '2px 4px',
                            }}
                          >✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#0a1117', borderTop: `2px solid ${BORDER}` }}>
                    <td colSpan={3} style={{ padding: '10px 10px', fontWeight: 800, fontSize: 12, color: TEXT, textTransform: 'uppercase', letterSpacing: 0.3 }}>TOTALS</td>
                    {DAYS.map(day => (
                      <td key={day} style={{ padding: '10px 6px', fontWeight: 700, color: GOLD, textAlign: 'center', fontSize: 12 }}>
                        {employees.reduce((s, e) => s + e.hours[day], 0)}
                      </td>
                    ))}
                    <td style={{ padding: '10px 10px', fontWeight: 800, color: GOLD, textAlign: 'right' }}>
                      {totalWeekHours.toFixed(1)}
                    </td>
                    <td style={{ padding: '10px 10px', fontWeight: 800, color: GREEN, whiteSpace: 'nowrap' }}>
                      {fmt(totalWeekGross)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Statement of Compliance */}
        <div style={{
          background: RAISED, border: `1px solid ${complianceAgreed ? 'rgba(61,214,140,.3)' : BORDER}`,
          borderRadius: 10, padding: 20, marginBottom: 20,
          transition: 'border-color .2s',
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 10 }}>Statement of Compliance</div>
          <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6, marginBottom: 14 }}>
            I hereby certify that the payroll records shown for the week ending above are correct and complete, that the wage rates contained therein are not less than those determined by the Secretary of Labor (Davis-Bacon Act), and that the classifications set forth therein are proper. This statement of compliance is required under the provisions of the Davis-Bacon Act and related acts.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="checkbox"
              id="compliance"
              checked={complianceAgreed}
              onChange={e => setComplianceAgreed(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: GOLD }}
            />
            <label htmlFor="compliance" style={{ fontSize: 13, color: TEXT, cursor: 'pointer', fontWeight: 600 }}>
              I certify the above payroll is accurate and compliant with prevailing wage requirements
            </label>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            padding: '12px 32px', marginBottom: 32,
            background: complianceAgreed
              ? `linear-gradient(135deg,${GOLD},#F0C040)`
              : 'rgba(212,160,23,.2)',
            border: 'none', borderRadius: 8,
            color: complianceAgreed ? '#0d1117' : DIM,
            fontSize: 14, fontWeight: 800,
            cursor: complianceAgreed && !loading ? 'pointer' : 'not-allowed',
            opacity: loading ? 0.7 : 1,
            transition: 'all .2s',
          }}
        >{loading ? 'Generating WH-347...' : 'Generate WH-347'}</button>

        {/* Previous Records */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Previous Payroll Records</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Week Ending', '# Employees', 'Total Gross', 'Status', 'Download'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left',
                    fontSize: 11, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    color: DIM, borderBottom: `1px solid ${BORDER}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map(record => {
                const sc = statusConfig[record.status] || statusConfig.draft;
                return (
                  <tr key={record.id} style={{ borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                    <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>{record.weekEnding}</td>
                    <td style={{ padding: '12px 16px', color: DIM }}>{record.employees}</td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>{fmt(record.totalGross)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px',
                        borderRadius: 4, background: sc.bg, color: sc.color,
                        textTransform: 'uppercase', letterSpacing: 0.3,
                      }}>{record.status}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button style={{
                        background: 'none', border: `1px solid ${BORDER}`,
                        borderRadius: 5, color: GOLD, fontSize: 11,
                        padding: '3px 10px', cursor: 'pointer',
                      }}>📄 WH-347 PDF</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {records.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: DIM, fontSize: 13 }}>
              No payroll records submitted yet. Generate your first WH-347 above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
