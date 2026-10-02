'use client';
import React, { useState, useEffect } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import { XCircle, FileText, ShieldCheck, CurrencyDollar, Clock, Wallet, CalendarBlank, UserPlus, Table as TableIcon, SealCheck, ClockCounterClockwise } from '@phosphor-icons/react';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, StatStrip, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { SUB_TRADES_BY_DIVISION } from '@/lib/construction-intelligence';

const GOLD='#F59E0B',DARK='#0a0a0a',RAISED='#141416',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF',GREEN='#1a8a4a',RED='#c03030';
const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

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

function calcGross(emp: Employee): number {
  const totalHours = Object.values(emp.hours).reduce((s, h) => s + h, 0);
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

const statusCfg: Record<string, { color: string; bg: string }> = {
  submitted: { color: GOLD,      bg: 'rgba(245, 158, 11,.12)' },
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

  // Prevailing-wage context for this project (Davis-Bacon rate assist).
  const [pw, setPw] = useState<PwContext | null>(null);
  const [pwRates, setPwRates] = useState<PwRate[]>([]);
  const [pwNote, setPwNote] = useState('');

  // Project intelligence snapshot + clocked field time — the screen walks in
  // knowing the project and the hours the crew already logged.
  const { ctx } = useProjectContext(pid);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);

  useEffect(() => { loadRecords(); loadPrevailingWage(); loadTimesheets(); }, [pid]);

  async function loadTimesheets() {
    try {
      const r = await fetch(`/api/projects/${pid}/timesheets`);
      const d = await r.json() as any;
      setTimeEntries(Array.isArray(d.entries) ? d.entries : []);
    } catch { setTimeEntries([]); }
  }

  async function loadPrevailingWage() {
    try {
      const r = await fetch(`/api/projects/${pid}`);
      const d = (await r.json()) as { project?: { prevailing_wage?: boolean; state?: string | null; county?: string | null; davis_bacon_wage_decision?: string | null } };
      const p = d.project;
      if (!p || !p.prevailing_wage) { setPw(null); return; }
      const ctx: PwContext = {
        state: (p.state || '').toUpperCase(),
        county: p.county || '',
        wageDecision: p.davis_bacon_wage_decision || '',
      };
      setPw(ctx);
      if (ctx.state) {
        const qs = new URLSearchParams({ state: ctx.state });
        if (ctx.county) qs.set('county', ctx.county);
        const rr = await fetch(`/api/prevailing-wage?${qs.toString()}`);
        const dd = (await rr.json()) as { rates?: PwRate[] };
        setPwRates(dd.rates || []);
      }
    } catch {
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
    if (!r) { setPwNote(`No prevailing wage rate found for "${emp.classification}" in ${pw?.state || ''}${pw?.county ? ' / ' + pw.county : ''}.`); return; }
    setEmployees((prev) => prev.map((e) => e.id === empId
      ? { ...e, hourlyRate: r.total, otRate: Math.round(r.total * 1.5 * 100) / 100 }
      : e));
    setPwNote(`Applied ${r.classification}: base ${fmt(r.base)} + fringe ${fmt(r.fringe)} = ${fmt(r.total)}/hr.`);
  }

  /** Apply prevailing rates to every employee whose classification matches. */
  function applyPwRateAll() {
    let applied = 0, missed = 0;
    setEmployees((prev) => prev.map((e) => {
      const r = findPwRate(e.classification);
      if (!r) { missed++; return e; }
      applied++;
      return { ...e, hourlyRate: r.total, otRate: Math.round(r.total * 1.5 * 100) / 100 };
    }));
    setPwNote(`Applied prevailing wage to ${applied} employee${applied === 1 ? '' : 's'}${missed ? ` (${missed} without a matching classification)` : ''}.`);
  }

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

  // Field-time rollup for the selected week: time_entries whose work_date
  // falls in the 7 days ending on the Week Ending Date, per-employee.
  const weekEntries = React.useMemo(() => {
    if (!weekEndingDate) return [] as any[];
    const end = new Date(weekEndingDate + 'T00:00:00');
    const start = new Date(end.getTime() - 6 * 86400000);
    return timeEntries.filter((t: any) => {
      if (!t.date) return false;
      const d = new Date(String(t.date).slice(0, 10) + 'T00:00:00');
      return d >= start && d <= end;
    });
  }, [timeEntries, weekEndingDate]);
  const weekClockedHours = weekEntries.reduce((s: number, t: any) => s + (Number(t.regular_hrs) || 0) + (Number(t.ot_hrs) || 0), 0);
  const weekClockedNames = Array.from(new Set(weekEntries.map((t: any) => t.employee).filter((n: any) => n && n !== '—')));

  // WH-347 history rollups (records arrive newest-first).
  const grossFiled = records.reduce((s, r) => s + (Number(r.total_gross) || 0), 0);
  const lastFiled = records[0] || null;

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
    setSuccess('Imported ' + imported.length + ' employee' + (imported.length === 1 ? '' : 's') + ' (' + weekClockedHours.toFixed(1) + ' hrs) from the field time clock — set rates and deductions, then generate.');
    setTimeout(() => setSuccess(''), 6000);
  }

  const totalWeekHours = employees.reduce((s, e) => s + Object.values(e.hours).reduce((h, v) => h + v, 0), 0);
  const totalWeekGross = employees.reduce((s, e) => s + calcGross(e), 0);
  const totalWeekNet = employees.reduce((s, e) => s + calcNet(e), 0);
  const totalWeekFica = employees.reduce((s, e) => s + (e.fica || 0), 0);
  const totalWeekFedWH = employees.reduce((s, e) => s + (e.fedWH || 0), 0);
  const totalWeekStateWH = employees.reduce((s, e) => s + (e.stateWH || 0), 0);
  const totalWeekOther = employees.reduce((s, e) => s + (e.deductions || 0), 0);

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
    <PremiumSurface maxWidth={2200}>

      {/* Header */}
      <ModuleHero
        eyebrow={ctx?.project?.name || 'Certified Payroll'}
        eyebrowIcon={<ShieldCheck size={13} weight="fill" color={GOLD} />}
        title="Certified"
        accent="Payroll"
        subtitle="DOL WH-347 — Davis-Bacon & prevailing wage compliance"
        actions={
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="pmBtn"
            style={{ ...goldButtonStyle, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            <FileText size={15} weight="bold" /> {loading ? 'Generating...' : 'Generate WH-347'}
          </button>
        }
      />

      {/* Project intelligence strip — what the system already knows */}
      {(ctx || records.length > 0 || timeEntries.length > 0) && (
        <StatStrip items={[
          {href: `/app/projects/${pid}/payroll`,  label: 'Payroll', value: '#' + (records.length + 1), sub: lastFiled ? 'follows week ' + lastFiled.week_ending : 'first WH-347 on this project' },
          {href: `/app/projects/${pid}/payroll`,  label: 'Filed to Date', value: String(records.length), sub: grossFiled > 0 ? fmt0(grossFiled) + ' gross certified' : 'no WH-347s yet' },
          {href: `/app/projects/${pid}/crews`,  label: 'Crew This Week', value: String(employees.length), sub: totalWeekHours.toFixed(1) + ' hrs entered' },
          {href: `/app/projects/${pid}/timesheets`,  label: 'Field Time Clock', value: weekEndingDate ? weekClockedHours.toFixed(1) + ' hrs' : timeEntries.length + ' entries', accent: weekClockedHours > 0 ? '#3dd68c' : undefined, sub: weekEndingDate ? weekClockedNames.length + ' employee' + (weekClockedNames.length === 1 ? '' : 's') + ' clocked this week' : 'pick a week ending to match' },
          {href: `/app/projects/${pid}/payroll`,  label: 'Prevailing Wage', value: pw ? 'Flagged' : 'Standard', accent: pw ? GOLD : undefined, sub: pw ? pw.state + (pw.county ? ' · ' + pw.county : '') + (pw.wageDecision ? ' · ' + pw.wageDecision : '') : 'not a Davis-Bacon project' },
          {href: `/app/projects/${pid}/subs`,  label: 'Subs on Job', value: String((ctx?.subs || []).length), sub: 'on the project roster' },
        ]} />
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard
          icon={<Clock size={19} weight="duotone" color={GOLD} />}
          label="Current Week Hours"
          value={totalWeekHours.toFixed(1) + ' hrs'}
          sub={`${employees.length} employee${employees.length === 1 ? '' : 's'}`}
          delay={0.02}
         href={`/app/projects/${pid}/payroll`}/>
        <StatCard
          icon={<CurrencyDollar size={19} weight="duotone" color={GOLD} />}
          label="Gross Wages This Week"
          value={fmt(totalWeekGross)}
          accent={GOLD}
          sub="before deductions"
          delay={0.06}
         href={`/app/projects/${pid}/payroll`}/>
        <StatCard
          icon={<Wallet size={19} weight="duotone" color="#1db954" />}
          label="Net Wages This Week"
          value={fmt(totalWeekNet)}
          accent="#1db954"
          sub="after deductions"
          delay={0.10}
         href={`/app/projects/${pid}/payroll`}/>
      </div>

      {/* Messages */}
      {error && <div style={{ background: 'rgba(192,48,48,.1)', border: '1px solid rgba(192,48,48,.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#ff7070' }}>{error}</div>}
      {success && <div style={{ background: 'rgba(26,138,74,.08)', border: '1px solid rgba(26,138,74,.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#1db954' }}>{success}</div>}

      {/* Prevailing Wage assist — only when the project is flagged prevailing-wage */}
      {pw && (
        <div style={{ background: 'rgba(245, 158, 11,.08)', border: `1px solid rgba(245, 158, 11,.3)`, borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: DIM }}>
              <span style={{ fontWeight: 700, color: GOLD }}>Prevailing wage project</span>
              {' — '}
              {pw.state}{pw.county ? ` · ${pw.county} County` : ' · statewide'}
              {pw.wageDecision ? ` · ${pw.wageDecision}` : ''}
              {pwRates.length > 0
                ? <span style={{ color: DIM }}>{'. '}{pwRates.length} classifications available.</span>
                : <span style={{ color: '#ff9d70' }}>{'. '}No determination on file for this state/county.</span>}
            </div>
            {pwRates.length > 0 && (
              <button
                onClick={applyPwRateAll}
                style={{ padding: '7px 16px', background: `linear-gradient(135deg,${GOLD},#FBBF24)`, border: 'none', borderRadius: 7, color: DARK, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Apply prevailing rates
              </button>
            )}
          </div>
          {pwRates.length > 0 && (
            <div style={{ fontSize: 11.5, color: '#FCD9A0', marginTop: 8, lineHeight: 1.5, borderTop: `1px solid rgba(245, 158, 11,.2)`, paddingTop: 8 }}>
              <strong style={{ color: GOLD }}>Sample / reference rates.</strong> Applied rates are Davis-Bacon-style samples for planning — not an official determination. Verify against the official{' '}
              <a href="https://sam.gov/content/wage-determinations" target="_blank" rel="noopener noreferrer" style={{ color: GOLD, fontWeight: 700 }}>SAM.gov (WDOL)</a>{' '}
              determination for this project before certifying. Rows marked <span style={{ color: '#7fb3ff', fontWeight: 800 }}>custom</span> are your own entered determination.
            </div>
          )}
        </div>
      )}
      {pwNote && <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 8, padding: '9px 16px', marginBottom: 20, fontSize: 12.5, color: '#7fb3ff' }}>{pwNote}</div>}

      {/* Field time clock rollup — import instead of retyping hours */}
      {weekEndingDate && weekEntries.length > 0 && (
        <div style={{ background: 'rgba(61,214,140,.07)', border: '1px solid rgba(61,214,140,.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: DIM }}>
            <span style={{ fontWeight: 700, color: '#3dd68c' }}>{weekClockedHours.toFixed(1)} hrs clocked in the field</span>
            {' — '}{weekEntries.length} time {weekEntries.length === 1 ? 'entry' : 'entries'} from {weekClockedNames.length} employee{weekClockedNames.length === 1 ? '' : 's'} fall in the 7 days ending {weekEndingDate}. Import them below instead of retyping.
          </div>
          <button onClick={importFromTimesheets} className="pmBtn" style={{ ...goldOutlineButtonStyle, padding: '8px 16px', fontSize: 12.5, whiteSpace: 'nowrap' }}>
            <Clock size={15} weight="bold" /> Import clocked hours
          </button>
        </div>
      )}
      {weekEndingDate && weekEntries.length === 0 && timeEntries.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 12.5, color: DIM }}>
          No field time entries fall in the 7 days ending {weekEndingDate} — {timeEntries.length} exist on this project overall. Enter hours manually below.
        </div>
      )}

      {/* Week Ending */}
      <SectionCard
        title="Pay Period"
        icon={<CalendarBlank size={17} weight="duotone" color={GOLD} />}
        style={{ marginBottom: 20 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, maxWidth: 240 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Week Ending Date *</label>
            <SaguaroDatePicker value={weekEndingDate} onChange={setWeekEndingDate} style={inp} />
          </div>
          <button
            onClick={() => setShowAddEmployee(!showAddEmployee)}
            className="pmBtn"
            style={showAddEmployee ? { ...ghostButtonStyle } : { ...goldButtonStyle }}>
            {showAddEmployee ? 'Cancel' : <><UserPlus size={15} weight="bold" /> Add Employee</>}
          </button>
        </div>
      </SectionCard>

      {/* Add Employee Form */}
      {showAddEmployee && (
        <SectionCard
          title="Add Employee"
          icon={<UserPlus size={17} weight="duotone" color={GOLD} />}
          style={{ marginBottom: 20 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            {[
              { label: 'Full Name *', el: <input value={newEmp.name} onChange={e => setNewEmp(p => ({ ...p, name: e.target.value }))} placeholder="John Smith" style={inp} /> },
              { label: 'Last 4 SSN', el: <input value={newEmp.last4ssn} onChange={e => setNewEmp(p => ({ ...p, last4ssn: e.target.value }))} placeholder="1234" maxLength={4} style={inp} /> },
              { label: 'Classification', el: <select value={newEmp.classification} onChange={e => setNewEmp(p => ({ ...p, classification: e.target.value }))} style={inp}><ClassificationOptions current={newEmp.classification} /></select> },
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
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Deductions ($) — actual amounts withheld</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              {[
                { label: 'FICA', key: 'fica' as const },
                { label: 'Fed W/H', key: 'fedWH' as const },
                { label: 'State W/H', key: 'stateWH' as const },
                { label: 'Other', key: 'deductions' as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <div style={{ fontSize: 10, color: DIM, fontWeight: 700, marginBottom: 4 }}>{label}</div>
                  <input type="number" min={0} step={0.01} value={newEmp[key]} onChange={e => setNewEmp(p => ({ ...p, [key]: Number(e.target.value) }))} style={{ ...inp, textAlign: 'right' }} />
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 16, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={newEmp.overtime} onChange={e => setNewEmp(p => ({ ...p, overtime: e.target.checked }))} style={{ width: 16, height: 16, accentColor: GOLD }} />
              <span style={{ fontSize: 13, color: TEXT }}>OT eligible (1.5× after 40h)</span>
            </label>
          </div>
          <button onClick={addEmployee} className="pmBtn" style={{ ...goldButtonStyle }}>Add to Payroll</button>
        </SectionCard>
      )}

      {/* Employee Table */}
      {employees.length > 0 && (
        <SectionCard
          title="Employee Hours — Current Week"
          icon={<TableIcon size={17} weight="duotone" color={GOLD} />}
          flush
          style={{ marginBottom: 20 }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1c1c1e' }}>
                  {['Employee', 'Class', 'Reg $', 'OT $', ...DAYS, 'Hrs', 'Gross', 'FICA', 'Fed WH', 'St WH', 'Other', 'Net', 'OT', ''].map(h => (
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
                    <tr key={emp.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,.02)', borderBottom: `1px solid rgba(229,229,234,.5)` }}>
                      <td style={{ padding: '7px 8px', minWidth: 140 }}>
                        <input value={emp.name} onChange={e => updateEmp(emp.id, 'name', e.target.value)} placeholder="Name" style={{ ...inp, fontSize: 11 }} />
                      </td>
                      <td style={{ padding: '7px 6px', minWidth: 120 }}>
                        <select value={emp.classification} onChange={e => updateEmp(emp.id, 'classification', e.target.value)} style={{ ...inp, fontSize: 11 }}>
                          <ClassificationOptions current={emp.classification} />
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
                      <td style={{ padding: '7px 6px', width: 64 }}>
                        <input type="number" min={0} step={0.01} value={emp.fica} onChange={e => updateEmp(emp.id, 'fica', Number(e.target.value))} title="FICA withheld" style={{ ...inp, fontSize: 11, textAlign: 'right', width: 56 }} />
                      </td>
                      <td style={{ padding: '7px 6px', width: 64 }}>
                        <input type="number" min={0} step={0.01} value={emp.fedWH} onChange={e => updateEmp(emp.id, 'fedWH', Number(e.target.value))} title="Federal withholding" style={{ ...inp, fontSize: 11, textAlign: 'right', width: 56 }} />
                      </td>
                      <td style={{ padding: '7px 6px', width: 64 }}>
                        <input type="number" min={0} step={0.01} value={emp.stateWH} onChange={e => updateEmp(emp.id, 'stateWH', Number(e.target.value))} title="State withholding" style={{ ...inp, fontSize: 11, textAlign: 'right', width: 56 }} />
                      </td>
                      <td style={{ padding: '7px 6px', width: 64 }}>
                        <input type="number" min={0} step={0.01} value={emp.deductions} onChange={e => updateEmp(emp.id, 'deductions', Number(e.target.value))} title="Other deductions" style={{ ...inp, fontSize: 11, textAlign: 'right', width: 56 }} />
                      </td>
                      <td style={{ padding: '7px 8px', color: '#1db954', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(net)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                        <input type="checkbox" checked={emp.overtime} onChange={e => updateEmp(emp.id, 'overtime', e.target.checked)} title="OT eligible" style={{ cursor: 'pointer', accentColor: GOLD }} />
                      </td>
                      <td style={{ padding: '7px 5px', whiteSpace: 'nowrap' }}>
                        {pw && pwRates.length > 0 && (
                          <button onClick={() => applyPwRate(emp.id)} title="Apply prevailing wage rate for this classification" style={{ background: 'none', border: `1px solid rgba(245, 158, 11,.4)`, color: GOLD, cursor: 'pointer', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, marginRight: 4 }}>PW</button>
                        )}
                        <button onClick={() => removeEmp(emp.id)} title="Remove" style={{ background: 'none', border: 'none', color: '#ff7070', cursor: 'pointer', fontSize: 13, padding: '2px 4px', display: 'inline-flex', alignItems: 'center' }}><XCircle size={15} weight="regular" color="#ff7070" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#1c1c1e', borderTop: `2px solid ${BORDER}` }}>
                  <td colSpan={4} style={{ padding: '10px 8px', fontWeight: 800, fontSize: 12, color: TEXT, textTransform: 'uppercase', letterSpacing: 0.3 }}>TOTALS</td>
                  {DAYS.map(day => (
                    <td key={day} style={{ padding: '10px 4px', fontWeight: 700, color: GOLD, textAlign: 'center', fontSize: 12 }}>
                      {employees.reduce((s, e) => s + e.hours[day], 0)}
                    </td>
                  ))}
                  <td style={{ padding: '10px 8px', fontWeight: 800, color: GOLD, textAlign: 'right' }}>{totalWeekHours.toFixed(1)}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 800, color: GOLD, whiteSpace: 'nowrap' }}>{fmt(totalWeekGross)}</td>
                  <td style={{ padding: '10px 6px', fontWeight: 700, color: DIM, textAlign: 'right', fontSize: 11, whiteSpace: 'nowrap' }}>{fmt(totalWeekFica)}</td>
                  <td style={{ padding: '10px 6px', fontWeight: 700, color: DIM, textAlign: 'right', fontSize: 11, whiteSpace: 'nowrap' }}>{fmt(totalWeekFedWH)}</td>
                  <td style={{ padding: '10px 6px', fontWeight: 700, color: DIM, textAlign: 'right', fontSize: 11, whiteSpace: 'nowrap' }}>{fmt(totalWeekStateWH)}</td>
                  <td style={{ padding: '10px 6px', fontWeight: 700, color: DIM, textAlign: 'right', fontSize: 11, whiteSpace: 'nowrap' }}>{fmt(totalWeekOther)}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 800, color: '#1db954', whiteSpace: 'nowrap' }}>{fmt(totalWeekNet)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Statement of Compliance */}
      <SectionCard
        title="Statement of Compliance"
        icon={<SealCheck size={17} weight="duotone" color={complianceAgreed ? '#1db954' : GOLD} />}
        accent={complianceAgreed ? '#1db954' : GOLD}
        style={{ marginBottom: 20 }}
      >
        <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6, marginBottom: 14 }}>
          I hereby certify that the payroll records shown for the week ending above are correct and complete, that the wage rates are not less than those determined by the Secretary of Labor under the Davis-Bacon Act, and that the classifications set forth therein are proper. This certification is required under the Davis-Bacon and related acts.
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <input type="checkbox" id="compliance" checked={complianceAgreed} onChange={e => setComplianceAgreed(e.target.checked)} style={{ width: 18, height: 18, accentColor: GOLD }} />
          <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>I certify this payroll is accurate and compliant with prevailing wage requirements</span>
        </label>
      </SectionCard>

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="pmBtn"
        style={{
          ...goldButtonStyle,
          padding: '12px 32px',
          marginBottom: 32,
          ...(complianceAgreed ? {} : { background: 'rgba(245, 158, 11,.2)', color: DIM, boxShadow: 'none' }),
          cursor: complianceAgreed && !loading ? 'pointer' : 'not-allowed',
          opacity: loading ? 0.7 : 1,
        }}>
        <FileText size={16} weight="bold" /> {loading ? 'Generating WH-347...' : 'Generate WH-347 PDF'}
      </button>

      {/* Payroll History */}
      <SectionCard
        title="Payroll History"
        icon={<ClockCounterClockwise size={17} weight="duotone" color={GOLD} />}
        flush
      >
        {recordsLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: DIM, fontSize: 13 }}>Loading records...</div>
        ) : records.length === 0 ? (
          <PremiumEmpty
            icon={<FileText size={30} weight="duotone" color={GOLD} />}
            title="No payroll records yet"
            description={pw
              ? `This project is flagged prevailing wage (${pw.state}${pw.county ? ' · ' + pw.county + ' County' : ''}) — a certified WH-347 is due for every week your crew works. Pick the week ending above, import clocked hours, and generate the first one.`
              : timeEntries.length > 0
                ? `Your crew has ${timeEntries.length} field time ${timeEntries.length === 1 ? 'entry' : 'entries'} on this project — pick a week ending above and import them to file the first WH-347.`
                : 'Generate your first WH-347 above — weekly certified payroll is required on Davis-Bacon and most public work.'}
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#1c1c1e' }}>
                {['Week Ending', '# Employees', 'Total Gross', 'Status', 'Download'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map(record => {
                const sc = statusCfg[record.status] || statusCfg.draft;
                return (
                  <tr key={record.id} style={{ borderBottom: `1px solid rgba(229,229,234,.5)` }}>
                    <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>{record.week_ending}</td>
                    <td style={{ padding: '12px 16px', color: DIM }}>{record.employee_count}</td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>{fmt(record.total_gross)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: sc.bg, color: sc.color, textTransform: 'uppercase', letterSpacing: 0.3 }}>{record.status}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {record.pdf_url ? (
                        <a href={`/api/files/open?u=${encodeURIComponent(record.pdf_url || '')}`} target="_blank" rel="noopener noreferrer" style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 5, color: GOLD, fontSize: 11, padding: '3px 10px', textDecoration: 'none', fontWeight: 700 }}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 4 }}><FileText size={13} weight="regular" color={GOLD} /></span>WH-347 PDF</a>
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
      </SectionCard>
    </PremiumSurface>
  );
}
