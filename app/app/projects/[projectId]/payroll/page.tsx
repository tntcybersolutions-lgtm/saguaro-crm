'use client';
/**
 * Certified Payroll — the DOL WH-347 for one week on the job: an editable money
 * grid (hours by day, rates, gross, every deduction column, net) with totals and
 * export, the Davis-Bacon rate assist, an import from the field time clock, the
 * Statement of Compliance and the filed history.
 *
 * Reads  GET  /api/payroll/list?projectId=      (filed WH-347s)
 *        GET  /api/projects/:id                  (prevailing-wage flag, state, county)
 *        GET  /api/prevailing-wage?state=&county= (classification rates)
 *        GET  /api/projects/:id/timesheets        (clocked field time)
 * Writes POST /api/payroll/generate               (builds the WH-347 PDF)
 */
import React, { useState, useEffect } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import {
  XCircle, FileText, ShieldCheck, Clock, CalendarBlank, UserPlus, PencilSimple, Scales, CurrencyDollar,
  Wallet, ClockCounterClockwise, WarningCircle,
} from '@phosphor-icons/react';
import {
  PageShell, StatRow, Button, Card, DataTable, EmptyState, Badge, Callout, Toolbar, FormModal, Field, Input,
  DateInput, FormGrid, Toast, useToast, type Column, type StatItem, type BadgeTone,
} from '@/components/ui/kit';
import { SUB_TRADES_BY_DIVISION } from '@/lib/construction-intelligence';
import { leaveOf } from '@/lib/leave-entry';
import { inAppFileClick } from '@/lib/media-save';

/* Currency style puts the sign first: -$1.00, never $-1.00. */
const fmt = (n: number) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const hrs = (n: number) => String(Math.round((Number(n) || 0) * 100) / 100);

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type Day = typeof DAYS[number];

const WORK_CLASSIFICATIONS = [
  'Laborer', 'Carpenter', 'Electrician', 'Plumber', 'Ironworker',
  'Operating Engineer', 'Roofer', 'Painter', 'Cement Mason', 'HVAC Tech', 'Foreman', 'Superintendent',
];

/** Grouped classification options — the WH-347 labor classes first, then the
 *  full CSI trade taxonomy (never a hardcoded partial list), plus the row's
 *  current value when it came from a timesheet trade outside both lists. */
function ClassificationOptions({ current }: { current?: string }) {
  const known = new Set<string>(WORK_CLASSIFICATIONS);
  SUB_TRADES_BY_DIVISION.forEach(g => g.trades.forEach(t => known.add(t)));
  return (
    <>
      {current && !known.has(current) && <option value={current}>{current}</option>}
      <optgroup label="Labor Classifications">
        {WORK_CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
      </optgroup>
      {SUB_TRADES_BY_DIVISION.map(g => (
        <optgroup key={g.division} label={`Div ${g.division} — ${g.name}`}>
          {g.trades.map(t => <option key={t} value={t}>{t}</option>)}
        </optgroup>
      ))}
    </>
  );
}

interface Employee {
  id: string;
  name: string;
  last4ssn: string;
  classification: string;
  hours: Record<Day, number>;
  hourlyRate: number;
  otRate: number;
  // WH-347 deduction columns — actual per-employee amounts from the employer's
  // payroll system. These feed the FICA / Fed WH / State WH / Other columns of
  // the certified payroll; no column is silently hardcoded to $0.
  fica: number;
  fedWH: number;
  stateWH: number;
  deductions: number; // "Other" deductions (union dues, garnishments, etc.)
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

interface PwContext {
  state: string;
  county: string;
  wageDecision: string;
}
interface PwRate {
  classification: string;
  base: number;
  fringe: number;
  total: number;
  determination_number: string | null;
  effective_date: string | null;
}

const defaultEmployee = (): Employee => ({
  id: 'emp-' + Date.now() + Math.random(),
  name: '',
  last4ssn: '',
  classification: 'Laborer',
  hours: { Mon: 8, Tue: 8, Wed: 8, Thu: 8, Fri: 8, Sat: 0, Sun: 0 },
  hourlyRate: 0,
  otRate: 0,
  fica: 0,
  fedWH: 0,
  stateWH: 0,
  deductions: 0,
  overtime: false,
});

function calcHours(emp: Employee): number {
  return Object.values(emp.hours).reduce((s, h) => s + h, 0);
}

function calcGross(emp: Employee): number {
  const totalHours = calcHours(emp);
  const regularHours = Math.min(totalHours, 40);
  const otHours = Math.max(0, totalHours - 40);
  const otRate = emp.otRate || emp.hourlyRate * 1.5;
  return regularHours * emp.hourlyRate + otHours * otRate;
}

/** Sum of every deduction column (FICA + Fed WH + State WH + Other). */
function calcTotalDeductions(emp: Employee): number {
  return (emp.fica || 0) + (emp.fedWH || 0) + (emp.stateWH || 0) + (emp.deductions || 0);
}

function calcNet(emp: Employee): number {
  return Math.max(0, calcGross(emp) - calcTotalDeductions(emp));
}

const STATUS_TONE: Record<string, BadgeTone> = { submitted: 'under_contract', draft: 'neutral', certified: 'completed' };
const statusLabel = (s: string) => { const t = s || 'draft'; return t.charAt(0).toUpperCase() + t.slice(1); };
const fileUrl = (u: string) => `/api/files/open?u=${encodeURIComponent(u || '')}`;
const shortDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/* Grid cells hold inputs: arrow keys and Enter belong to the field (number
   steppers, select options), not to the table's row-to-row keyboard nav. */
const keepKeys = { onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation() };
const NUM_W = 84;
const DAY_W = 58;

export default function PayrollPage() {
  const params = useParams();
  const pid = params['projectId'] as string;

  const [weekEndingDate, setWeekEndingDate] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([defaultEmployee()]);
  // Add / edit employee modal. editId null = adding a new row.
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newEmp, setNewEmp] = useState<Employee>(defaultEmployee());
  const [complianceAgreed, setComplianceAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const { toast, show } = useToast(6000);

  // Prevailing-wage context for this project (Davis-Bacon rate assist).
  const [pw, setPw] = useState<PwContext | null>(null);
  const [pwRates, setPwRates] = useState<PwRate[]>([]);

  // Project intelligence snapshot + clocked field time — the screen walks in
  // knowing the project and the hours the crew already logged.
  const { ctx } = useProjectContext(pid);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);

  useEffect(() => { loadRecords(); loadPrevailingWage(); loadTimesheets(); }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTimesheets() {
    try {
      const r = await fetch(`/api/projects/${pid}/timesheets`);
      const d = await r.json() as any;
      setTimeEntries(Array.isArray(d.entries) ? d.entries : []);
    } catch (e) {
      console.error('[payroll] timesheets', e);
      setTimeEntries([]);
    }
  }

  async function loadPrevailingWage() {
    try {
      const r = await fetch(`/api/projects/${pid}`);
      const d = (await r.json()) as { project?: { prevailing_wage?: boolean; state?: string | null; county?: string | null; davis_bacon_wage_decision?: string | null } };
      const p = d.project;
      if (!p || !p.prevailing_wage) { setPw(null); return; }
      const pctx: PwContext = {
        state: (p.state || '').toUpperCase(),
        county: p.county || '',
        wageDecision: p.davis_bacon_wage_decision || '',
      };
      setPw(pctx);
      if (pctx.state) {
        const qs = new URLSearchParams({ state: pctx.state });
        if (pctx.county) qs.set('county', pctx.county);
        const rr = await fetch(`/api/prevailing-wage?${qs.toString()}`);
        const dd = (await rr.json()) as { rates?: PwRate[] };
        setPwRates(dd.rates || []);
      }
    } catch (e) {
      console.error('[payroll] prevailing wage', e);
      setPw(null);
      setPwRates([]);
    }
  }

  /** Resolve a classification to its prevailing base+fringe rate. */
  function findPwRate(classification: string): PwRate | null {
    if (!classification) return null;
    const want = classification.trim().toLowerCase();
    return (
      pwRates.find((r) => r.classification.toLowerCase() === want) ||
      pwRates.find((r) => r.classification.toLowerCase().includes(want)) ||
      pwRates.find((r) => want.includes(r.classification.toLowerCase())) ||
      null
    );
  }

  /** Apply the prevailing base+fringe rate to a single employee row. */
  function applyPwRate(empId: string) {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const r = findPwRate(emp.classification);
    if (!r) { show(`No prevailing wage rate found for "${emp.classification}" in ${pw?.state || ''}${pw?.county ? ' / ' + pw.county : ''}.`, 'bad'); return; }
    setEmployees((prev) => prev.map((e) => e.id === empId
      ? { ...e, hourlyRate: r.total, otRate: Math.round(r.total * 1.5 * 100) / 100 }
      : e));
    show(`Applied ${r.classification}: base ${fmt(r.base)} + fringe ${fmt(r.fringe)} = ${fmt(r.total)}/hr.`);
  }

  /** Apply prevailing rates to every employee whose classification matches. */
  function applyPwRateAll() {
    // Counted from the current rows, not inside the state updater (which React
    // may run later, or twice in Strict Mode, and miscount).
    let applied = 0, missed = 0;
    const next = employees.map((e) => {
      const r = findPwRate(e.classification);
      if (!r) { missed++; return e; }
      applied++;
      return { ...e, hourlyRate: r.total, otRate: Math.round(r.total * 1.5 * 100) / 100 };
    });
    setEmployees(next);
    show(`Applied prevailing wage to ${applied} employee${applied === 1 ? '' : 's'}${missed ? ` (${missed} without a matching classification)` : ''}.`, applied ? 'good' : 'bad');
  }

  async function loadRecords() {
    setRecordsLoading(true);
    try {
      const r = await fetch(`/api/payroll/list?projectId=${pid}`);
      const d = await r.json() as any;
      setRecords(d.records || []);
    } catch (e) {
      console.error('[payroll] list', e);
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  }

  // Field-time rollup for the selected week: time_entries whose work_date
  // falls in the 7 days ending on the Week Ending Date, per-employee.
  // Worked shifts only: a PTO / sick row (lib/leave-entry) is filed on the
  // job's timesheet with 0 regular / OT hours, and certified payroll is hours
  // worked on the job — importing it added a 0-hour WH-347 line for someone
  // who was on leave.
  const weekEntries = React.useMemo(() => {
    if (!weekEndingDate) return [] as any[];
    const end = new Date(weekEndingDate + 'T00:00:00');
    const start = new Date(end.getTime() - 6 * 86400000);
    return timeEntries.filter((t: any) => {
      if (leaveOf(t)) return false;
      if (!t.date) return false;
      const d = new Date(String(t.date).slice(0, 10) + 'T00:00:00');
      return d >= start && d <= end;
    });
  }, [timeEntries, weekEndingDate]);
  const weekClockedHours = weekEntries.reduce((s: number, t: any) => s + (Number(t.regular_hrs) || 0) + (Number(t.ot_hrs) || 0), 0);
  const weekClockedNames = Array.from(new Set(weekEntries.map((t: any) => t.employee).filter((n: any) => n && n !== '—')));

  // WH-347 history rollups (records arrive newest-first).
  const grossFiled = records.reduce((s, r) => s + (Number(r.total_gross) || 0), 0);

  /** Build employee rows from the clocked field time for the selected week. */
  function importFromTimesheets() {
    if (weekEntries.length === 0) return;
    const dayName = (iso: string): Day => DAYS[(new Date(String(iso).slice(0, 10) + 'T00:00:00').getDay() + 6) % 7];
    const byEmp = new Map<string, Employee>();
    weekEntries.forEach((t: any, i: number) => {
      const name = (t.employee && t.employee !== '—') ? String(t.employee) : 'Employee ' + (i + 1);
      if (!byEmp.has(name)) {
        byEmp.set(name, { ...defaultEmployee(), id: 'emp-ts-' + Date.now() + '-' + byEmp.size, name, classification: t.classification || 'Laborer', hours: { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 } });
      }
      const emp = byEmp.get(name)!;
      const day = dayName(t.date);
      emp.hours[day] = Math.round((emp.hours[day] + (Number(t.regular_hrs) || 0) + (Number(t.ot_hrs) || 0)) * 100) / 100;
      if ((Number(t.ot_hrs) || 0) > 0) emp.overtime = true;
    });
    const imported = Array.from(byEmp.values());
    setEmployees(prev => {
      const blankOnly = prev.length === 1 && !prev[0].name && calcGross(prev[0]) === 0;
      const base = blankOnly ? [] : prev.filter(e => e.name);
      return [...base, ...imported.filter(im => !base.some(e => e.name.toLowerCase() === im.name.toLowerCase()))];
    });
    show('Imported ' + imported.length + ' employee' + (imported.length === 1 ? '' : 's') + ' (' + weekClockedHours.toFixed(1) + ' hrs) from the field time clock — set rates and deductions, then generate.');
  }

  const totalWeekHours = employees.reduce((s, e) => s + calcHours(e), 0);
  const totalWeekGross = employees.reduce((s, e) => s + calcGross(e), 0);
  const totalWeekNet = employees.reduce((s, e) => s + calcNet(e), 0);
  const totalWeekDeductions = employees.reduce((s, e) => s + calcTotalDeductions(e), 0);

  function updateEmpHours(empId: string, day: Day, val: number) {
    setEmployees(prev => prev.map(e => e.id === empId ? { ...e, hours: { ...e.hours, [day]: val } } : e));
  }

  function updateEmp(empId: string, field: keyof Employee, val: any) {
    setEmployees(prev => prev.map(e => e.id === empId ? { ...e, [field]: val } : e));
  }

  function removeEmp(empId: string) {
    setEmployees(prev => prev.filter(e => e.id !== empId));
  }

  function openAddEmployee() {
    setEditId(null);
    setNewEmp(defaultEmployee());
    setEmpModalOpen(true);
  }

  function openEditEmployee(emp: Employee) {
    setEditId(emp.id);
    setNewEmp({ ...emp, hours: { ...emp.hours } });
    setEmpModalOpen(true);
  }

  function addEmployee() {
    if (!newEmp.name) return;
    if (editId) {
      setEmployees(prev => prev.map(e => e.id === editId ? { ...newEmp, id: editId } : e));
    } else {
      setEmployees(prev => [...prev, { ...newEmp, id: 'emp-' + Date.now() }]);
    }
    setNewEmp(defaultEmployee());
    setEditId(null);
    setEmpModalOpen(false);
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
          // Real per-employee WH-347 deduction columns.
          fica: e.fica,
          fedWH: e.fedWH,
          stateWH: e.stateWH,
          deductions: e.deductions, // "Other"
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
        setSuccess('WH-347 generated for the week ending ' + shortDate(weekEndingDate) + '.');
        setGeneratedUrl(d.downloadUrl || null);
        setWeekEndingDate('');
        setEmployees([defaultEmployee()]);
        setComplianceAgreed(false);
        await loadRecords();
      }
    } catch (e) {
      console.error('[payroll] generate', e);
      setError('Request failed. Check your connection and try again.');
    }
    setLoading(false);
  }

  const base = `/app/projects/${pid}`;

  const stats: StatItem[] = [
    { label: 'Filed to date', value: recordsLoading ? '—' : String(records.length), sub: grossFiled > 0 ? fmt0(grossFiled) + ' gross certified' : undefined, icon: <ClockCounterClockwise size={15} /> },
    { label: 'This week', value: totalWeekHours.toFixed(1) + ' hrs', sub: `${employees.length} employee${employees.length === 1 ? '' : 's'}`, icon: <CalendarBlank size={15} /> },
    {
      label: 'Field time clock',
      value: weekEndingDate ? weekClockedHours.toFixed(1) + ' hrs' : String(timeEntries.length),
      sub: weekEndingDate ? weekClockedNames.length + ' employee' + (weekClockedNames.length === 1 ? '' : 's') + ' clocked this week' : 'entries on this job',
      tone: weekEndingDate && weekEntries.length > 0 && Math.abs(weekClockedHours - totalWeekHours) > 0.01 ? 'warn' : 'default',
      icon: <Clock size={15} />,
      href: `${base}/timesheets`,
    },
    { label: 'Gross wages', value: fmt(totalWeekGross), sub: `${fmt(totalWeekDeductions)} withheld`, icon: <CurrencyDollar size={15} /> },
    { label: 'Net wages', value: fmt(totalWeekNet), tone: totalWeekNet > 0 ? 'good' : 'default', icon: <Wallet size={15} /> },
  ];

  const numCell = (emp: Employee, field: 'hourlyRate' | 'otRate' | 'fica' | 'fedWH' | 'stateWH' | 'deductions', label: string, step = 0.01) => (
    <Input
      type="number" min={0} step={step} inputMode="decimal"
      value={emp[field]}
      onChange={e => updateEmp(emp.id, field, Number(e.target.value))}
      aria-label={`${emp.name || 'Employee'} ${label}`} title={label}
      style={{ width: NUM_W, textAlign: 'right' }}
      {...keepKeys}
    />
  );
  const money = (key: 'fica' | 'fedWH' | 'stateWH' | 'deductions', header: string, label: string): Column<Employee> => ({
    key, header, align: 'right', sortable: false, groupable: false, phone: 'hide', total: 'sum', format: fmt,
    accessor: (e) => e[key] || 0, render: (e) => numCell(e, key, label),
  });

  const weekColumns: Column<Employee>[] = [
    {
      key: 'name', header: 'Employee', primary: true, phone: 'show', sortable: false, groupable: false, fit: 'full', accessor: (e) => e.name,
      render: (e) => <Input value={e.name} onChange={ev => updateEmp(e.id, 'name', ev.target.value)} placeholder="Name" aria-label="Employee name" style={{ minWidth: 150 }} {...keepKeys} />,
    },
    {
      key: 'classification', header: 'Class', sortable: false, phone: 'hide', fit: 'full', accessor: (e) => e.classification,
      render: (e) => (
        <select className="k-select" value={e.classification} onChange={ev => updateEmp(e.id, 'classification', ev.target.value)} aria-label={`${e.name || 'Employee'} classification`} style={{ minWidth: 150 }} {...keepKeys}>
          <ClassificationOptions current={e.classification} />
        </select>
      ),
    },
    { key: 'hourlyRate', header: 'Reg $', align: 'right', sortable: false, groupable: false, phone: 'hide', accessor: (e) => e.hourlyRate, render: (e) => numCell(e, 'hourlyRate', 'Regular rate') },
    { key: 'otRate', header: 'OT $', align: 'right', sortable: false, groupable: false, phone: 'hide', accessor: (e) => e.otRate, render: (e) => numCell(e, 'otRate', 'Overtime rate') },
    ...DAYS.map((day): Column<Employee> => ({
      key: `day_${day}`, header: day, align: 'right', sortable: false, groupable: false, phone: 'hide', total: 'sum', format: hrs,
      accessor: (e) => e.hours[day],
      render: (e) => (
        <Input
          type="number" min={0} max={24} step={0.5} inputMode="decimal"
          value={e.hours[day]}
          onChange={ev => updateEmpHours(e.id, day, Number(ev.target.value))}
          aria-label={`${e.name || 'Employee'} ${day} hours`}
          style={{ width: DAY_W, textAlign: 'center', paddingLeft: 4, paddingRight: 4 }}
          {...keepKeys}
        />
      ),
    })),
    {
      key: 'hours', header: 'Hrs', align: 'right', sortable: false, groupable: false, phone: 'show', total: 'sum', format: (n) => n.toFixed(1),
      accessor: (e) => calcHours(e),
      render: (e) => { const h = calcHours(e); return <strong style={{ color: h > 40 ? 'var(--warning)' : 'var(--text-primary)' }}>{h.toFixed(1)}</strong>; },
    },
    { key: 'gross', header: 'Gross', align: 'right', sortable: false, groupable: false, phone: 'show', total: 'sum', format: fmt, accessor: (e) => calcGross(e), render: (e) => <strong style={{ color: 'var(--text-primary)' }}>{fmt(calcGross(e))}</strong> },
    money('fica', 'FICA', 'FICA withheld'),
    money('fedWH', 'Fed WH', 'Federal withholding'),
    money('stateWH', 'St WH', 'State withholding'),
    money('deductions', 'Other', 'Other deductions'),
    { key: 'net', header: 'Net', align: 'right', sortable: false, groupable: false, phone: 'show', total: 'sum', format: fmt, accessor: (e) => calcNet(e), render: (e) => <strong style={{ color: 'var(--success)' }}>{fmt(calcNet(e))}</strong> },
    {
      key: 'overtime', header: 'OT', align: 'center', sortable: false, groupable: false, phone: 'hide', accessor: (e) => (e.overtime ? 'Yes' : 'No'),
      render: (e) => <input type="checkbox" checked={e.overtime} onChange={ev => updateEmp(e.id, 'overtime', ev.target.checked)} title="OT eligible" aria-label={`${e.name || 'Employee'} OT eligible`} style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--brand-primary)' }} {...keepKeys} />,
    },
  ];

  const historyColumns: Column<PayrollRecord>[] = [
    { key: 'week_ending', header: 'Week ending', primary: true, phone: 'show', groupable: false, render: (r) => shortDate(r.week_ending) },
    { key: 'employee_count', header: 'Employees', align: 'right', groupable: false, accessor: (r) => Number(r.employee_count) || 0 },
    { key: 'total_gross', header: 'Total gross', align: 'right', phone: 'show', total: 'sum', format: fmt, accessor: (r) => Number(r.total_gross) || 0, render: (r) => fmt(Number(r.total_gross) || 0) },
    { key: 'status', header: 'Status', phone: 'show', render: (r) => <Badge tone={STATUS_TONE[r.status] || 'neutral'} dot>{statusLabel(r.status)}</Badge> },
    {
      key: 'pdf_url', header: 'WH-347', sortable: false, groupable: false, phone: 'show', accessor: (r) => (r.pdf_url ? fileUrl(r.pdf_url) : ''),
      render: (r) => r.pdf_url ? (
        <a
          className="k-btn k-btn-secondary k-btn-sm"
          href={fileUrl(r.pdf_url)} target="_blank" rel="noopener noreferrer"
          onClick={(e) => { e.stopPropagation(); inAppFileClick(fileUrl(r.pdf_url || ''), 'WH-347 certified payroll', setError)(e); }}
        >
          <FileText size={14} />PDF
        </a>
      ) : null,
    },
  ];

  const pwPlace = pw ? `${pw.state}${pw.county ? ` · ${pw.county} County` : ' · statewide'}${pw.wageDecision ? ` · ${pw.wageDecision}` : ''}` : '';

  return (
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
        { label: 'Certified Payroll' },
      ]}
      title="Certified Payroll"
      subtitle="DOL WH-347 · Davis-Bacon and prevailing wage"
      actions={
        <>
          <Button icon={<UserPlus size={15} />} onClick={openAddEmployee}>Add employee</Button>
          <Button variant="primary" icon={<FileText size={15} weight="bold" />} onClick={handleGenerate} disabled={loading}>
            {loading ? 'Generating…' : 'Generate WH-347'}
          </Button>
        </>
      }
    >
      <StatRow items={stats} />

      {error && (
        <Callout tone="danger" icon={<WarningCircle size={18} />} title={error} actions={<Button size="sm" variant="ghost" onClick={() => setError('')}>Dismiss</Button>} />
      )}
      {success && (
        <Callout
          tone="success"
          icon={<ShieldCheck size={18} />}
          title={success}
          text={generatedUrl ? undefined : 'It is listed under Filed WH-347s below.'}
          actions={
            <>
              {generatedUrl && (
                <a className="k-btn k-btn-secondary k-btn-sm" href={fileUrl(generatedUrl)} target="_blank" rel="noopener noreferrer" onClick={inAppFileClick(fileUrl(generatedUrl), 'WH-347 certified payroll', setError)}>
                  <FileText size={14} />Open PDF
                </a>
              )}
              <Button size="sm" variant="ghost" onClick={() => { setSuccess(''); setGeneratedUrl(null); }}>Dismiss</Button>
            </>
          }
        />
      )}

      {/* Prevailing Wage assist — only when the project is flagged prevailing-wage */}
      {pw && (
        <Callout
          tone={pwRates.length > 0 ? 'info' : 'warning'}
          icon={<Scales size={18} />}
          title={`Prevailing wage project · ${pwPlace}`}
          text={pwRates.length > 0 ? (
            <>
              {pwRates.length} classifications · sample rates, verify on{' '}
              <a className="k-link" href="https://sam.gov/content/wage-determinations" target="_blank" rel="noopener noreferrer">SAM.gov (WDOL)</a>{' '}
              before certifying
            </>
          ) : 'No determination on file for this state/county.'}
          actions={pwRates.length > 0 ? <Button size="sm" icon={<Scales size={14} />} onClick={applyPwRateAll}>Apply prevailing rates</Button> : undefined}
        />
      )}

      {/* Field time clock rollup — import instead of retyping hours */}
      {weekEndingDate && weekEntries.length > 0 && (
        <Callout
          tone="success"
          icon={<Clock size={18} />}
          title={`${weekClockedHours.toFixed(1)} hrs clocked in the field`}
          text={`${weekEntries.length} time ${weekEntries.length === 1 ? 'entry' : 'entries'} from ${weekClockedNames.length} employee${weekClockedNames.length === 1 ? '' : 's'} in the 7 days ending ${shortDate(weekEndingDate)}.`}
          actions={<Button size="sm" icon={<Clock size={14} weight="bold" />} onClick={importFromTimesheets}>Import clocked hours</Button>}
        />
      )}
      {weekEndingDate && weekEntries.length === 0 && timeEntries.length > 0 && (
        <Callout
          tone="info"
          icon={<Clock size={18} />}
          title={`No field time in the 7 days ending ${shortDate(weekEndingDate)}`}
          text={`${timeEntries.length} ${timeEntries.length === 1 ? 'entry' : 'entries'} on this job overall`}
        />
      )}

      <Card
        title="Week's hours and wages"
        subtitle="OT after 40 hrs · 1.5× when the OT rate is blank"
        flush
        actions={
          <Toolbar
            filters={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="k-label" htmlFor="payroll-week-ending" style={{ whiteSpace: 'nowrap' }}>Week ending<span className="k-req">*</span></label>
                <DateInput id="payroll-week-ending" value={weekEndingDate} onChange={e => setWeekEndingDate(e.target.value)} style={{ width: 170 }} />
              </div>
            }
          />
        }
      >
        <DataTable<Employee>
          tableId="project-payroll-week"
          exportName={`payroll-week${weekEndingDate ? '-' + weekEndingDate : ''}`}
          columns={weekColumns}
          rows={employees}
          rowKey={(e) => e.id}
          rowActions={(e) => [
            { label: 'Apply prevailing rate', icon: <Scales size={14} />, onClick: () => applyPwRate(e.id), hidden: !(pw && pwRates.length > 0) },
            { label: 'Edit details', icon: <PencilSimple size={14} />, onClick: () => openEditEmployee(e) },
            { label: 'Remove', icon: <XCircle size={14} />, tone: 'danger', onClick: () => removeEmp(e.id) },
          ]}
          empty={
            <EmptyState
              icon={<UserPlus size={22} />}
              title="No employees on this week"
              action={<Button icon={<UserPlus size={15} />} onClick={openAddEmployee}>Add employee</Button>}
            />
          }
        />
      </Card>

      {/* Statement of Compliance — the certification the WH-347 carries */}
      <Card
        title="Statement of Compliance"
        actions={complianceAgreed ? <Badge tone="completed" dot>Certified</Badge> : <Badge tone="lead" dot>Not certified</Badge>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            I hereby certify that the payroll records shown for the week ending above are correct and complete, that the wage rates are not less than those determined by the Secretary of Labor under the Davis-Bacon Act, and that the classifications set forth therein are proper. This certification is required under the Davis-Bacon and related acts.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', minHeight: 44 }}>
            <input type="checkbox" id="compliance" checked={complianceAgreed} onChange={e => setComplianceAgreed(e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0, accentColor: 'var(--brand-primary)' }} />
            <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>I certify this payroll is accurate and compliant with prevailing wage requirements</span>
          </label>
          <div>
            <Button icon={<FileText size={15} weight="bold" />} onClick={handleGenerate} disabled={loading}>
              {loading ? 'Generating WH-347…' : 'Generate WH-347 PDF'}
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Filed WH-347s" flush>
        <DataTable<PayrollRecord>
          tableId="project-payroll-history"
          exportName="certified-payroll-history"
          columns={historyColumns}
          rows={records}
          loading={recordsLoading}
          rowKey={(r) => r.id}
          defaultSort={{ key: 'week_ending', dir: 'desc' }}
          empty={
            <EmptyState
              icon={<FileText size={22} />}
              title="No WH-347s filed yet"
              text={pw ? `Prevailing wage · ${pw.state}${pw.county ? ' · ' + pw.county + ' County' : ''}` : undefined}
              primary={{ label: 'Start a WH-347', icon: <FileText size={15} weight="bold" />, onClick: () => {
                const el = document.getElementById('payroll-week-ending');
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el?.focus();
              } }}
              perm={['Pay Apps', 'Full']}
            />
          }
        />
      </Card>

      <FormModal
        open={empModalOpen}
        onClose={() => { setEmpModalOpen(false); setEditId(null); }}
        title={editId ? 'Edit employee' : 'Add employee'}
        subtitle={weekEndingDate ? `Week ending ${shortDate(weekEndingDate)}` : undefined}
        onSubmit={addEmployee}
        submitLabel={editId ? 'Save employee' : 'Add to payroll'}
      >
        <FormGrid cols={2}>
          <Field label="Full name" required>
            <Input value={newEmp.name} onChange={e => setNewEmp(p => ({ ...p, name: e.target.value }))} placeholder="Full legal name" required autoFocus />
          </Field>
          <Field label="Last 4 SSN">
            <Input value={newEmp.last4ssn} onChange={e => setNewEmp(p => ({ ...p, last4ssn: e.target.value }))} placeholder="1234" maxLength={4} inputMode="numeric" />
          </Field>
          <Field label="Classification">
            <select className="k-select" value={newEmp.classification} onChange={e => setNewEmp(p => ({ ...p, classification: e.target.value }))}>
              <ClassificationOptions current={newEmp.classification} />
            </select>
          </Field>
          <Field label="OT eligible">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minHeight: 44 }}>
              <input type="checkbox" checked={newEmp.overtime} onChange={e => setNewEmp(p => ({ ...p, overtime: e.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--brand-primary)' }} />
              <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>1.5× after 40 hrs</span>
            </label>
          </Field>
          <Field label="Regular rate ($/hr)">
            <Input type="number" min={0} step={0.01} inputMode="decimal" value={newEmp.hourlyRate} onChange={e => setNewEmp(p => ({ ...p, hourlyRate: Number(e.target.value) }))} placeholder="28.50" style={{ textAlign: 'right' }} />
          </Field>
          <Field label="OT rate ($/hr)" hint="Blank or 0 uses 1.5× the regular rate.">
            <Input type="number" min={0} step={0.01} inputMode="decimal" value={newEmp.otRate} onChange={e => setNewEmp(p => ({ ...p, otRate: Number(e.target.value) }))} placeholder="42.75" style={{ textAlign: 'right' }} />
          </Field>
        </FormGrid>
        <div className="k-label" style={{ margin: '20px 0 8px' }}>Daily hours</div>
        <FormGrid cols={4}>
          {DAYS.map(day => (
            <Field key={day} label={day}>
              <Input type="number" min={0} max={24} step={0.5} inputMode="decimal" value={newEmp.hours[day]} onChange={e => setNewEmp(p => ({ ...p, hours: { ...p.hours, [day]: Number(e.target.value) } }))} style={{ textAlign: 'center' }} />
            </Field>
          ))}
        </FormGrid>
        <div className="k-label" style={{ margin: '20px 0 8px' }}>Deductions ($) — actual amounts withheld</div>
        <FormGrid cols={4}>
          {([
            { label: 'FICA', key: 'fica' as const },
            { label: 'Fed W/H', key: 'fedWH' as const },
            { label: 'State W/H', key: 'stateWH' as const },
            { label: 'Other', key: 'deductions' as const },
          ]).map(({ label, key }) => (
            <Field key={key} label={label}>
              <Input type="number" min={0} step={0.01} inputMode="decimal" value={newEmp[key]} onChange={e => setNewEmp(p => ({ ...p, [key]: Number(e.target.value) }))} style={{ textAlign: 'right' }} />
            </Field>
          ))}
        </FormGrid>
        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
          {calcHours(newEmp).toFixed(1)} hrs · gross <strong style={{ color: 'var(--text-primary)' }}>{fmt(calcGross(newEmp))}</strong> · net <strong style={{ color: 'var(--success)' }}>{fmt(calcNet(newEmp))}</strong>
        </div>
      </FormModal>

      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
