'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';

const GOLD = '#D4A017', BG = '#07101C', RAISED = '#0D1D2E', BORDER = '#1E3A5F', TEXT = '#F0F4FF',
  DIM = '#8BAAC8', GREEN = '#22C55E', RED = '#EF4444', AMBER = '#F59E0B', BLUE = '#3B82F6', PURPLE = '#8B5CF6';

type PayrollStatus = 'Draft' | 'Submitted' | 'Approved';
type ComplianceStatus = 'Compliant' | 'Non-Compliant' | 'Pending';

interface Project {
  id: string;
  name: string;
  number: string;
  location: string;
  contractNumber: string;
}

interface DavisBaconRate {
  trade: string;
  classification: string;
  baseRate: number;
  fringeBenefit: number;
  totalRate: number;
}

interface WorkerEntry {
  id: string;
  name: string;
  ssn: string;
  trade: string;
  classification: string;
  hoursSTPerDay: number[];
  hoursOTPerDay: number[];
  hoursDTPerDay: number[];
  baseRate: number;
  fringeBenefit: number;
  deductions: number;
  isApprentice: boolean;
  apprenticeRatio?: string;
}

interface PayrollPeriod {
  id: string;
  projectId: string;
  weekEnding: string;
  status: PayrollStatus;
  workers: WorkerEntry[];
  complianceSigned: boolean;
  signedBy: string;
  signedDate: string;
  notes: string;
}

const MOCK_PROJECTS: Project[] = [
  { id: 'p1', name: 'Federal Courthouse Renovation', number: 'PRJ-2026-001', location: 'Phoenix, AZ', contractNumber: 'FC-2026-0412' },
  { id: 'p2', name: 'Highway I-17 Bridge Repair', number: 'PRJ-2026-002', location: 'Flagstaff, AZ', contractNumber: 'DOT-2026-0087' },
  { id: 'p3', name: 'VA Medical Center Expansion', number: 'PRJ-2026-003', location: 'Tucson, AZ', contractNumber: 'VA-2026-0193' },
  { id: 'p4', name: 'Army Corps Flood Control', number: 'PRJ-2026-004', location: 'Yuma, AZ', contractNumber: 'USACE-2026-0051' },
];

const DAVIS_BACON_RATES: DavisBaconRate[] = [
  { trade: 'Electrician', classification: 'Journeyman', baseRate: 52.30, fringeBenefit: 18.45, totalRate: 70.75 },
  { trade: 'Electrician', classification: 'Apprentice 1st Year', baseRate: 26.15, fringeBenefit: 18.45, totalRate: 44.60 },
  { trade: 'Electrician', classification: 'Apprentice 2nd Year', baseRate: 31.38, fringeBenefit: 18.45, totalRate: 49.83 },
  { trade: 'Plumber', classification: 'Journeyman', baseRate: 49.80, fringeBenefit: 17.20, totalRate: 67.00 },
  { trade: 'Plumber', classification: 'Apprentice 1st Year', baseRate: 24.90, fringeBenefit: 17.20, totalRate: 42.10 },
  { trade: 'Carpenter', classification: 'Journeyman', baseRate: 45.60, fringeBenefit: 16.80, totalRate: 62.40 },
  { trade: 'Carpenter', classification: 'Foreman', baseRate: 50.16, fringeBenefit: 16.80, totalRate: 66.96 },
  { trade: 'Carpenter', classification: 'Apprentice 1st Year', baseRate: 22.80, fringeBenefit: 16.80, totalRate: 39.60 },
  { trade: 'Ironworker', classification: 'Journeyman', baseRate: 54.10, fringeBenefit: 22.30, totalRate: 76.40 },
  { trade: 'Ironworker', classification: 'Apprentice 1st Year', baseRate: 27.05, fringeBenefit: 22.30, totalRate: 49.35 },
  { trade: 'Laborer', classification: 'General', baseRate: 32.40, fringeBenefit: 14.50, totalRate: 46.90 },
  { trade: 'Laborer', classification: 'Skilled', baseRate: 36.20, fringeBenefit: 14.50, totalRate: 50.70 },
  { trade: 'Operating Engineer', classification: 'Group 1', baseRate: 55.80, fringeBenefit: 21.60, totalRate: 77.40 },
  { trade: 'Operating Engineer', classification: 'Group 2', baseRate: 50.40, fringeBenefit: 21.60, totalRate: 72.00 },
  { trade: 'Pipefitter', classification: 'Journeyman', baseRate: 51.20, fringeBenefit: 19.10, totalRate: 70.30 },
  { trade: 'Sheet Metal Worker', classification: 'Journeyman', baseRate: 48.70, fringeBenefit: 17.90, totalRate: 66.60 },
  { trade: 'Painter', classification: 'Journeyman', baseRate: 38.90, fringeBenefit: 15.20, totalRate: 54.10 },
  { trade: 'Cement Mason', classification: 'Journeyman', baseRate: 42.50, fringeBenefit: 16.10, totalRate: 58.60 },
];

function generateWeekDates(weekEnding: string): string[] {
  const end = new Date(weekEnding + 'T12:00:00');
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    dates.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }));
  }
  return dates;
}

function getWeekEnding(offset: number): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (6 - day + 7) % 7;
  d.setDate(d.getDate() + diff + offset * 7);
  return d.toISOString().split('T')[0];
}

function createMockWorkers(): WorkerEntry[] {
  return [
    { id: 'w1', name: 'Marcus Rivera', ssn: '***-**-4521', trade: 'Electrician', classification: 'Journeyman', hoursSTPerDay: [8, 8, 8, 8, 8, 0, 0], hoursOTPerDay: [0, 0, 2, 0, 0, 0, 0], hoursDTPerDay: [0, 0, 0, 0, 0, 0, 0], baseRate: 52.30, fringeBenefit: 18.45, deductions: 285.00, isApprentice: false },
    { id: 'w2', name: 'James Chen', ssn: '***-**-7834', trade: 'Electrician', classification: 'Apprentice 1st Year', hoursSTPerDay: [8, 8, 8, 8, 8, 0, 0], hoursOTPerDay: [0, 0, 0, 0, 0, 0, 0], hoursDTPerDay: [0, 0, 0, 0, 0, 0, 0], baseRate: 26.15, fringeBenefit: 18.45, deductions: 142.50, isApprentice: true, apprenticeRatio: '1:3' },
    { id: 'w3', name: 'Roberto Gutierrez', ssn: '***-**-2198', trade: 'Carpenter', classification: 'Journeyman', hoursSTPerDay: [8, 8, 8, 8, 8, 4, 0], hoursOTPerDay: [0, 0, 0, 2, 0, 0, 0], hoursDTPerDay: [0, 0, 0, 0, 0, 0, 0], baseRate: 45.60, fringeBenefit: 16.80, deductions: 310.00, isApprentice: false },
    { id: 'w4', name: 'Angela Thompson', ssn: '***-**-6743', trade: 'Laborer', classification: 'Skilled', hoursSTPerDay: [8, 8, 8, 8, 8, 0, 0], hoursOTPerDay: [0, 0, 0, 0, 0, 0, 0], hoursDTPerDay: [0, 0, 0, 0, 0, 0, 0], baseRate: 36.20, fringeBenefit: 14.50, deductions: 198.00, isApprentice: false },
    { id: 'w5', name: 'Derek Washington', ssn: '***-**-9012', trade: 'Ironworker', classification: 'Journeyman', hoursSTPerDay: [8, 8, 8, 8, 8, 0, 0], hoursOTPerDay: [2, 0, 2, 0, 2, 0, 0], hoursDTPerDay: [0, 0, 0, 0, 0, 0, 0], baseRate: 54.10, fringeBenefit: 22.30, deductions: 345.00, isApprentice: false },
    { id: 'w6', name: 'Sofia Martinez', ssn: '***-**-3456', trade: 'Carpenter', classification: 'Apprentice 1st Year', hoursSTPerDay: [8, 8, 8, 8, 8, 0, 0], hoursOTPerDay: [0, 0, 0, 0, 0, 0, 0], hoursDTPerDay: [0, 0, 0, 0, 0, 0, 0], baseRate: 22.80, fringeBenefit: 16.80, deductions: 120.00, isApprentice: true, apprenticeRatio: '1:4' },
  ];
}

function createMockPeriods(): PayrollPeriod[] {
  return [
    { id: 'pp1', projectId: 'p1', weekEnding: getWeekEnding(0), status: 'Draft', workers: createMockWorkers(), complianceSigned: false, signedBy: '', signedDate: '', notes: '' },
    { id: 'pp2', projectId: 'p1', weekEnding: getWeekEnding(-1), status: 'Submitted', workers: createMockWorkers().slice(0, 4), complianceSigned: true, signedBy: 'John Mitchell', signedDate: getWeekEnding(-1), notes: '' },
    { id: 'pp3', projectId: 'p1', weekEnding: getWeekEnding(-2), status: 'Approved', workers: createMockWorkers().slice(0, 3), complianceSigned: true, signedBy: 'John Mitchell', signedDate: getWeekEnding(-2), notes: '' },
    { id: 'pp4', projectId: 'p2', weekEnding: getWeekEnding(0), status: 'Draft', workers: createMockWorkers().slice(2, 5), complianceSigned: false, signedBy: '', signedDate: '', notes: '' },
    { id: 'pp5', projectId: 'p3', weekEnding: getWeekEnding(-1), status: 'Approved', workers: createMockWorkers().slice(0, 2), complianceSigned: true, signedBy: 'Sarah Davis', signedDate: getWeekEnding(-1), notes: '' },
  ];
}

function calcWorkerTotals(w: WorkerEntry) {
  const totalST = w.hoursSTPerDay.reduce((a, b) => a + b, 0);
  const totalOT = w.hoursOTPerDay.reduce((a, b) => a + b, 0);
  const totalDT = w.hoursDTPerDay.reduce((a, b) => a + b, 0);
  const grossPay = (totalST * w.baseRate) + (totalOT * w.baseRate * 1.5) + (totalDT * w.baseRate * 2);
  const fringeTotal = (totalST + totalOT + totalDT) * w.fringeBenefit;
  const netPay = grossPay - w.deductions;
  return { totalST, totalOT, totalDT, grossPay, fringeTotal, netPay, totalHours: totalST + totalOT + totalDT };
}

const statusColor = (s: PayrollStatus) => s === 'Approved' ? GREEN : s === 'Submitted' ? AMBER : DIM;
const complianceColor = (s: ComplianceStatus) => s === 'Compliant' ? GREEN : s === 'Non-Compliant' ? RED : AMBER;

const btn = (bg: string, hover = false): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 6, border: 'none', fontWeight: 600, fontSize: 13,
  cursor: 'pointer', color: bg === GOLD ? BG : TEXT, backgroundColor: bg,
  opacity: hover ? 0.85 : 1, transition: 'opacity 0.15s',
});

const input: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG,
  color: TEXT, fontSize: 13, outline: 'none', width: '100%',
};

const select: React.CSSProperties = { ...input, cursor: 'pointer' };

const card: React.CSSProperties = {
  background: RAISED, borderRadius: 10, border: `1px solid ${BORDER}`, padding: 20, marginBottom: 16,
};

export default function CertifiedPayrollPage() {
  const [loading, setLoading] = useState(true);
  const [projects] = useState<Project[]>(MOCK_PROJECTS);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<PayrollStatus | 'All'>('All');
  const [showWageRates, setShowWageRates] = useState(false);
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [showWH347, setShowWH347] = useState(false);
  const [tradeFilter, setTradeFilter] = useState('All');
  const [error, setError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [multiProjectView, setMultiProjectView] = useState(false);

  // New worker form state
  const [newWorker, setNewWorker] = useState<Partial<WorkerEntry>>({
    name: '', trade: '', classification: '', baseRate: 0, fringeBenefit: 0, deductions: 0, isApprentice: false,
    hoursSTPerDay: [0, 0, 0, 0, 0, 0, 0], hoursOTPerDay: [0, 0, 0, 0, 0, 0, 0], hoursDTPerDay: [0, 0, 0, 0, 0, 0, 0],
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setPeriods(createMockPeriods());
      setLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const filteredPeriods = useMemo(() => {
    return periods.filter(p => {
      if (selectedProjectId !== 'all' && p.projectId !== selectedProjectId) return false;
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;
      return true;
    });
  }, [periods, selectedProjectId, statusFilter]);

  const activePeriod = useMemo(() => periods.find(p => p.id === activePeriodId) || null, [periods, activePeriodId]);

  const periodSummary = useMemo(() => {
    if (!activePeriod) return null;
    let totalGross = 0, totalNet = 0, totalDeductions = 0, totalFringe = 0, totalHours = 0;
    let apprenticeCount = 0, journeymanCount = 0;
    activePeriod.workers.forEach(w => {
      const t = calcWorkerTotals(w);
      totalGross += t.grossPay;
      totalNet += t.netPay;
      totalDeductions += w.deductions;
      totalFringe += t.fringeTotal;
      totalHours += t.totalHours;
      if (w.isApprentice) apprenticeCount++; else journeymanCount++;
    });
    return { totalGross, totalNet, totalDeductions, totalFringe, totalHours, apprenticeCount, journeymanCount, workerCount: activePeriod.workers.length };
  }, [activePeriod]);

  const getComplianceStatus = useCallback((w: WorkerEntry): ComplianceStatus => {
    const dbRate = DAVIS_BACON_RATES.find(r => r.trade === w.trade && r.classification === w.classification);
    if (!dbRate) return 'Pending';
    return w.baseRate >= dbRate.baseRate ? 'Compliant' : 'Non-Compliant';
  }, []);

  const apprenticeRatio = useMemo(() => {
    if (!activePeriod) return { ratio: '0:0', compliant: true };
    const apprentices = activePeriod.workers.filter(w => w.isApprentice).length;
    const journeymen = activePeriod.workers.filter(w => !w.isApprentice).length;
    const ratio = `${apprentices}:${journeymen}`;
    const compliant = journeymen === 0 ? apprentices === 0 : (apprentices / journeymen) <= 0.25;
    return { ratio, compliant };
  }, [activePeriod]);

  const handleAddWorker = useCallback(() => {
    if (!activePeriod || !newWorker.name || !newWorker.trade) return;
    const worker: WorkerEntry = {
      id: 'w' + Date.now(),
      name: newWorker.name || '',
      ssn: '***-**-' + Math.floor(1000 + Math.random() * 9000),
      trade: newWorker.trade || '',
      classification: newWorker.classification || '',
      hoursSTPerDay: newWorker.hoursSTPerDay || [0, 0, 0, 0, 0, 0, 0],
      hoursOTPerDay: newWorker.hoursOTPerDay || [0, 0, 0, 0, 0, 0, 0],
      hoursDTPerDay: newWorker.hoursDTPerDay || [0, 0, 0, 0, 0, 0, 0],
      baseRate: newWorker.baseRate || 0,
      fringeBenefit: newWorker.fringeBenefit || 0,
      deductions: newWorker.deductions || 0,
      isApprentice: newWorker.isApprentice || false,
    };
    setPeriods(prev => prev.map(p => p.id === activePeriod.id ? { ...p, workers: [...p.workers, worker] } : p));
    setShowAddWorker(false);
    setNewWorker({ name: '', trade: '', classification: '', baseRate: 0, fringeBenefit: 0, deductions: 0, isApprentice: false, hoursSTPerDay: [0, 0, 0, 0, 0, 0, 0], hoursOTPerDay: [0, 0, 0, 0, 0, 0, 0], hoursDTPerDay: [0, 0, 0, 0, 0, 0, 0] });
  }, [activePeriod, newWorker]);

  const handleDeleteWorker = useCallback((workerId: string) => {
    if (!activePeriod) return;
    setPeriods(prev => prev.map(p => p.id === activePeriod.id ? { ...p, workers: p.workers.filter(w => w.id !== workerId) } : p));
  }, [activePeriod]);

  const handleStatusChange = useCallback((periodId: string, newStatus: PayrollStatus) => {
    setPeriods(prev => prev.map(p => {
      if (p.id !== periodId) return p;
      const updated = { ...p, status: newStatus };
      if (newStatus === 'Submitted') { updated.signedDate = new Date().toISOString().split('T')[0]; }
      return updated;
    }));
  }, []);

  const handleComplianceSign = useCallback((periodId: string, signerName: string) => {
    setPeriods(prev => prev.map(p => p.id === periodId ? { ...p, complianceSigned: true, signedBy: signerName, signedDate: new Date().toISOString().split('T')[0] } : p));
  }, []);

  const handleExport = useCallback((format: 'pdf' | 'excel') => {
    setExportingFormat(format);
    setTimeout(() => {
      setExportingFormat(null);
      alert(`${format.toUpperCase()} export generated successfully. In production this would trigger a file download.`);
    }, 1500);
  }, []);

  const handleUpdateWorkerHours = useCallback((workerId: string, dayIndex: number, type: 'ST' | 'OT' | 'DT', value: number) => {
    if (!activePeriod) return;
    setPeriods(prev => prev.map(p => {
      if (p.id !== activePeriod.id) return p;
      return {
        ...p,
        workers: p.workers.map(w => {
          if (w.id !== workerId) return w;
          const field = type === 'ST' ? 'hoursSTPerDay' : type === 'OT' ? 'hoursOTPerDay' : 'hoursDTPerDay';
          const updated = [...w[field]];
          updated[dayIndex] = value;
          return { ...w, [field]: updated };
        }),
      };
    }));
  }, [activePeriod]);

  const handleLookupRate = useCallback((trade: string, classification: string) => {
    const rate = DAVIS_BACON_RATES.find(r => r.trade === trade && r.classification === classification);
    if (rate) {
      setNewWorker(prev => ({ ...prev, baseRate: rate.baseRate, fringeBenefit: rate.fringeBenefit }));
    }
  }, []);

  const uniqueTrades = useMemo(() => [...new Set(DAVIS_BACON_RATES.map(r => r.trade))], []);

  // Multi-project summary
  const multiProjectSummary = useMemo(() => {
    if (!multiProjectView) return [];
    return projects.map(proj => {
      const projPeriods = periods.filter(p => p.projectId === proj.id);
      let totalWorkers = 0, totalHours = 0, totalGross = 0;
      projPeriods.forEach(pp => {
        totalWorkers += pp.workers.length;
        pp.workers.forEach(w => {
          const t = calcWorkerTotals(w);
          totalHours += t.totalHours;
          totalGross += t.grossPay;
        });
      });
      return { ...proj, periodsCount: projPeriods.length, totalWorkers, totalHours, totalGross,
        statuses: { draft: projPeriods.filter(p => p.status === 'Draft').length, submitted: projPeriods.filter(p => p.status === 'Submitted').length, approved: projPeriods.filter(p => p.status === 'Approved').length } };
    });
  }, [multiProjectView, projects, periods]);

  if (loading) {
    return (
      <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: DIM }}>Compliance</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: TEXT, margin: '4px 0' }}>Certified Payroll</h1>
        <div style={{ marginTop: 60, textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ color: DIM, fontSize: 14 }}>Loading payroll data...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: DIM }}>Compliance</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: TEXT, margin: '4px 0' }}>Certified Payroll</h1>
          <div style={{ fontSize: 13, color: DIM, marginTop: 2 }}>WH-347 compliant payroll management with Davis-Bacon wage tracking</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btn(multiProjectView ? GOLD : RAISED)} onClick={() => { setMultiProjectView(!multiProjectView); setActivePeriodId(null); }}>
            {multiProjectView ? 'Single View' : 'Multi-Project'}
          </button>
          <button style={btn(RAISED)} onClick={() => setShowWageRates(true)}>Davis-Bacon Rates</button>
          <button style={btn(RAISED)} onClick={() => handleExport('pdf')} disabled={!!exportingFormat}>
            {exportingFormat === 'pdf' ? 'Generating...' : 'Export PDF'}
          </button>
          <button style={btn(RAISED)} onClick={() => handleExport('excel')} disabled={!!exportingFormat}>
            {exportingFormat === 'excel' ? 'Generating...' : 'Export Excel'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ ...card, borderColor: RED, background: '#1a0a0a', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: RED, fontSize: 13 }}>{error}</span>
          <button style={{ ...btn(RED), padding: '4px 12px', fontSize: 12 }} onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div style={{ ...card, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', padding: 16 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Project</label>
          <select style={select} value={selectedProjectId} onChange={e => { setSelectedProjectId(e.target.value); setActivePeriodId(null); }}>
            <option value="all">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.number} - {p.name}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 140 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Status</label>
          <select style={select} value={statusFilter} onChange={e => setStatusFilter(e.target.value as PayrollStatus | 'All')}>
            <option value="All">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Submitted">Submitted</option>
            <option value="Approved">Approved</option>
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Week Navigation</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={{ ...btn(RAISED), padding: '8px 12px' }} onClick={() => setWeekOffset(w => w - 1)}>Prev</button>
            <button style={{ ...btn(RAISED), padding: '8px 12px' }} onClick={() => setWeekOffset(0)}>Current</button>
            <button style={{ ...btn(RAISED), padding: '8px 12px' }} onClick={() => setWeekOffset(w => w + 1)}>Next</button>
          </div>
        </div>
        <div style={{ fontSize: 13, color: TEXT, minWidth: 170 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Week Ending</label>
          <span style={{ fontWeight: 600 }}>{new Date(getWeekEnding(weekOffset) + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Multi-Project View */}
      {multiProjectView && (
        <div style={card}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Multi-Project Payroll Overview</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {['Project', 'Contract #', 'Periods', 'Workers', 'Total Hours', 'Total Gross', 'Draft', 'Submitted', 'Approved'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {multiProjectSummary.map(proj => (
                  <tr key={proj.id} style={{ borderBottom: `1px solid ${BORDER}22`, cursor: 'pointer' }}
                    onClick={() => { setSelectedProjectId(proj.id); setMultiProjectView(false); }}>
                    <td style={{ padding: '12px', color: TEXT, fontWeight: 600 }}>{proj.name}</td>
                    <td style={{ padding: '12px', color: DIM }}>{proj.contractNumber}</td>
                    <td style={{ padding: '12px', color: TEXT }}>{proj.periodsCount}</td>
                    <td style={{ padding: '12px', color: TEXT }}>{proj.totalWorkers}</td>
                    <td style={{ padding: '12px', color: TEXT }}>{proj.totalHours.toFixed(1)}</td>
                    <td style={{ padding: '12px', color: GREEN, fontWeight: 600 }}>${proj.totalGross.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '12px' }}><span style={{ background: `${DIM}22`, color: DIM, padding: '2px 8px', borderRadius: 10, fontSize: 12 }}>{proj.statuses.draft}</span></td>
                    <td style={{ padding: '12px' }}><span style={{ background: `${AMBER}22`, color: AMBER, padding: '2px 8px', borderRadius: 10, fontSize: 12 }}>{proj.statuses.submitted}</span></td>
                    <td style={{ padding: '12px' }}><span style={{ background: `${GREEN}22`, color: GREEN, padding: '2px 8px', borderRadius: 10, fontSize: 12 }}>{proj.statuses.approved}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Period List */}
      {!multiProjectView && (
        <div style={{ ...card, padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT, margin: 0 }}>Payroll Periods ({filteredPeriods.length})</h2>
            <button style={btn(GOLD)} onClick={() => {
              if (selectedProjectId === 'all') { setError('Select a project before creating a payroll period.'); return; }
              const newPeriod: PayrollPeriod = {
                id: 'pp' + Date.now(), projectId: selectedProjectId, weekEnding: getWeekEnding(weekOffset),
                status: 'Draft', workers: [], complianceSigned: false, signedBy: '', signedDate: '', notes: '',
              };
              setPeriods(prev => [newPeriod, ...prev]);
              setActivePeriodId(newPeriod.id);
            }}>+ New Period</button>
          </div>

          {filteredPeriods.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>&#128203;</div>
              <div style={{ color: DIM, fontSize: 14, marginBottom: 4 }}>No payroll periods found</div>
              <div style={{ color: DIM, fontSize: 12 }}>Select a project and create a new period to get started</div>
            </div>
          ) : (
            <div>
              {filteredPeriods.map(period => {
                const proj = projects.find(p => p.id === period.projectId);
                const workerCount = period.workers.length;
                let totalGross = 0;
                period.workers.forEach(w => { totalGross += calcWorkerTotals(w).grossPay; });
                const isActive = activePeriodId === period.id;
                return (
                  <div key={period.id}
                    style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}22`, cursor: 'pointer',
                      background: isActive ? `${GOLD}08` : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}
                    onClick={() => setActivePeriodId(isActive ? null : period.id)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{proj?.name || 'Unknown'}</div>
                      <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Week ending: {new Date(period.weekEnding + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    </div>
                    <div style={{ fontSize: 12, color: DIM }}>{workerCount} worker{workerCount !== 1 ? 's' : ''}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: GREEN }}>${totalGross.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                    <span style={{ padding: '4px 12px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                      color: statusColor(period.status), background: `${statusColor(period.status)}18` }}>
                      {period.status}
                    </span>
                    <span style={{ color: DIM, fontSize: 16, transform: isActive ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>&#9660;</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Active Period Detail */}
      {activePeriod && !multiProjectView && (() => {
        const proj = projects.find(p => p.id === activePeriod.projectId);
        const weekDates = generateWeekDates(activePeriod.weekEnding);
        return (
          <>
            {/* Summary Cards */}
            {periodSummary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Workers', value: periodSummary.workerCount, color: BLUE },
                  { label: 'Total Hours', value: periodSummary.totalHours.toFixed(1), color: PURPLE },
                  { label: 'Gross Pay', value: '$' + periodSummary.totalGross.toLocaleString('en-US', { minimumFractionDigits: 2 }), color: GREEN },
                  { label: 'Deductions', value: '$' + periodSummary.totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2 }), color: RED },
                  { label: 'Net Pay', value: '$' + periodSummary.totalNet.toLocaleString('en-US', { minimumFractionDigits: 2 }), color: GOLD },
                  { label: 'Fringe Benefits', value: '$' + periodSummary.totalFringe.toLocaleString('en-US', { minimumFractionDigits: 2 }), color: AMBER },
                ].map(c => (
                  <div key={c.label} style={{ ...card, padding: 16, marginBottom: 0 }}>
                    <div style={{ fontSize: 11, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>{c.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: c.color, marginTop: 6 }}>{c.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Apprentice Ratio */}
            <div style={{ ...card, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 12, color: DIM, marginRight: 8 }}>Apprentice to Journeyman Ratio:</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: apprenticeRatio.compliant ? GREEN : RED }}>{apprenticeRatio.ratio}</span>
              </div>
              <span style={{ padding: '4px 12px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                color: apprenticeRatio.compliant ? GREEN : RED,
                background: apprenticeRatio.compliant ? `${GREEN}18` : `${RED}18` }}>
                {apprenticeRatio.compliant ? 'Within Limits' : 'Exceeds Limit'}
              </span>
            </div>

            {/* Worker Actions */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {activePeriod.status === 'Draft' && (
                <button style={btn(GOLD)} onClick={() => setShowAddWorker(true)}>+ Add Worker</button>
              )}
              <button style={btn(RAISED)} onClick={() => setShowWH347(true)}>View WH-347 Form</button>
              {activePeriod.status === 'Draft' && (
                <button style={btn(BLUE)} onClick={() => handleStatusChange(activePeriod.id, 'Submitted')}>Submit for Approval</button>
              )}
              {activePeriod.status === 'Submitted' && (
                <button style={btn(GREEN)} onClick={() => handleStatusChange(activePeriod.id, 'Approved')}>Approve Payroll</button>
              )}
              {activePeriod.status === 'Submitted' && (
                <button style={btn(RAISED)} onClick={() => handleStatusChange(activePeriod.id, 'Draft')}>Return to Draft</button>
              )}
            </div>

            {/* Workers Table */}
            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: 0 }}>Employee / Worker Detail</h3>
                <div style={{ fontSize: 12, color: DIM }}>{proj?.contractNumber} | Week Ending {activePeriod.weekEnding}</div>
              </div>
              {activePeriod.workers.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ color: DIM, fontSize: 14 }}>No workers added to this period yet</div>
                  {activePeriod.status === 'Draft' && (
                    <button style={{ ...btn(GOLD), marginTop: 12 }} onClick={() => setShowAddWorker(true)}>+ Add First Worker</button>
                  )}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1100 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                      {['Name / SSN', 'Trade / Class', ...weekDates.map((d, i) => d), 'ST', 'OT', 'DT', 'Rate', 'Gross', 'Fringe', 'Deduct', 'Net', 'Status', ''].map((h, i) => (
                        <th key={i} style={{ padding: '10px 6px', textAlign: i >= 2 && i <= 8 ? 'center' : 'left', color: DIM, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activePeriod.workers.map(worker => {
                      const t = calcWorkerTotals(worker);
                      const compliance = getComplianceStatus(worker);
                      const isEditing = editingWorkerId === worker.id;
                      return (
                        <tr key={worker.id} style={{ borderBottom: `1px solid ${BORDER}15` }}>
                          <td style={{ padding: '10px 6px', whiteSpace: 'nowrap' }}>
                            <div style={{ color: TEXT, fontWeight: 600, fontSize: 13 }}>{worker.name}</div>
                            <div style={{ color: DIM, fontSize: 11 }}>{worker.ssn}{worker.isApprentice && <span style={{ color: PURPLE, marginLeft: 6 }}>APPR</span>}</div>
                          </td>
                          <td style={{ padding: '10px 6px' }}>
                            <div style={{ color: TEXT, fontSize: 12 }}>{worker.trade}</div>
                            <div style={{ color: DIM, fontSize: 11 }}>{worker.classification}</div>
                          </td>
                          {weekDates.map((_, dayIdx) => (
                            <td key={dayIdx} style={{ padding: '4px 2px', textAlign: 'center' }}>
                              {isEditing && activePeriod.status === 'Draft' ? (
                                <input type="number" style={{ ...input, width: 40, padding: '4px', textAlign: 'center', fontSize: 11 }}
                                  value={worker.hoursSTPerDay[dayIdx]}
                                  onChange={e => handleUpdateWorkerHours(worker.id, dayIdx, 'ST', parseFloat(e.target.value) || 0)} />
                              ) : (
                                <span style={{ color: worker.hoursSTPerDay[dayIdx] > 0 ? TEXT : `${DIM}44`, fontSize: 12 }}>
                                  {worker.hoursSTPerDay[dayIdx] || '-'}
                                  {worker.hoursOTPerDay[dayIdx] > 0 && <span style={{ color: AMBER, fontSize: 10, display: 'block' }}>+{worker.hoursOTPerDay[dayIdx]}OT</span>}
                                  {worker.hoursDTPerDay[dayIdx] > 0 && <span style={{ color: RED, fontSize: 10, display: 'block' }}>+{worker.hoursDTPerDay[dayIdx]}DT</span>}
                                </span>
                              )}
                            </td>
                          ))}
                          <td style={{ padding: '10px 6px', textAlign: 'center', color: TEXT, fontWeight: 600 }}>{t.totalST}</td>
                          <td style={{ padding: '10px 6px', textAlign: 'center', color: t.totalOT > 0 ? AMBER : `${DIM}44` }}>{t.totalOT || '-'}</td>
                          <td style={{ padding: '10px 6px', textAlign: 'center', color: t.totalDT > 0 ? RED : `${DIM}44` }}>{t.totalDT || '-'}</td>
                          <td style={{ padding: '10px 6px', color: TEXT, whiteSpace: 'nowrap' }}>${worker.baseRate.toFixed(2)}</td>
                          <td style={{ padding: '10px 6px', color: GREEN, fontWeight: 600, whiteSpace: 'nowrap' }}>${t.grossPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 6px', color: AMBER, whiteSpace: 'nowrap' }}>${t.fringeTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 6px', color: RED, whiteSpace: 'nowrap' }}>${worker.deductions.toFixed(2)}</td>
                          <td style={{ padding: '10px 6px', color: GOLD, fontWeight: 600, whiteSpace: 'nowrap' }}>${t.netPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 6px' }}>
                            <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                              color: complianceColor(compliance), background: `${complianceColor(compliance)}18` }}>
                              {compliance}
                            </span>
                          </td>
                          <td style={{ padding: '10px 6px', whiteSpace: 'nowrap' }}>
                            {activePeriod.status === 'Draft' && (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button style={{ ...btn(RAISED), padding: '4px 8px', fontSize: 11 }}
                                  onClick={e => { e.stopPropagation(); setEditingWorkerId(isEditing ? null : worker.id); }}>
                                  {isEditing ? 'Done' : 'Edit'}
                                </button>
                                <button style={{ ...btn(RAISED), padding: '4px 8px', fontSize: 11, color: RED }}
                                  onClick={e => { e.stopPropagation(); handleDeleteWorker(worker.id); }}>
                                  Del
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${BORDER}` }}>
                      <td colSpan={2} style={{ padding: '12px 6px', fontWeight: 700, color: TEXT, fontSize: 13 }}>Period Totals</td>
                      {weekDates.map((_, i) => {
                        const dayTotal = activePeriod.workers.reduce((sum, w) => sum + w.hoursSTPerDay[i] + w.hoursOTPerDay[i] + w.hoursDTPerDay[i], 0);
                        return <td key={i} style={{ padding: '12px 2px', textAlign: 'center', color: GOLD, fontWeight: 700, fontSize: 12 }}>{dayTotal || '-'}</td>;
                      })}
                      <td style={{ padding: '12px 6px', textAlign: 'center', color: GOLD, fontWeight: 700 }}>{periodSummary?.totalHours.toFixed(0)}</td>
                      <td colSpan={2} />
                      <td style={{ padding: '12px 6px', color: GOLD, fontWeight: 700 }}></td>
                      <td style={{ padding: '12px 6px', color: GREEN, fontWeight: 700 }}>${periodSummary?.totalGross.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '12px 6px', color: AMBER, fontWeight: 700 }}>${periodSummary?.totalFringe.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '12px 6px', color: RED, fontWeight: 700 }}>${periodSummary?.totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '12px 6px', color: GOLD, fontWeight: 700 }}>${periodSummary?.totalNet.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Statement of Compliance */}
            <div style={card}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Statement of Compliance</h3>
              <div style={{ fontSize: 12, color: DIM, lineHeight: 1.8, marginBottom: 16 }}>
                I, the undersigned, do hereby state: (1) That I pay or supervise the payment of the persons employed on this
                contract; that during the payroll period commencing on the first day and ending on the last day of the week
                indicated above, all persons employed on said project have been paid the full weekly wages earned, that no
                rebates have been or will be made either directly or indirectly to or on behalf of the contractor from the full
                weekly wages earned by any person, and that no deductions have been made either directly or indirectly from the
                full wages earned by any person, other than permissible deductions as defined in Regulations 29 CFR Part 3;
                (2) That any payrolls otherwise under this contract required to be submitted for the above period are correct and
                complete; that the wage rates for laborers or mechanics contained therein are not less than the applicable wage
                rates contained in any wage determination incorporated into the contract; (3) That any apprentices employed in
                the above period are duly registered in a bona fide apprenticeship program registered with a State apprenticeship
                agency recognized by the Bureau of Apprenticeship and Training, United States Department of Labor.
              </div>
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={activePeriod.complianceSigned}
                    disabled={activePeriod.status === 'Approved'}
                    onChange={() => {
                      if (!activePeriod.complianceSigned) {
                        const name = prompt('Enter signer full name:');
                        if (name) handleComplianceSign(activePeriod.id, name);
                      }
                    }}
                    style={{ width: 18, height: 18, accentColor: GOLD }} />
                  <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>I certify this payroll is correct and complete</span>
                </label>
                {activePeriod.complianceSigned && (
                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    <div>
                      <span style={{ color: DIM }}>Signed by: </span>
                      <span style={{ color: TEXT, fontWeight: 600, fontStyle: 'italic' }}>{activePeriod.signedBy}</span>
                    </div>
                    <div>
                      <span style={{ color: DIM }}>Date: </span>
                      <span style={{ color: TEXT }}>{activePeriod.signedDate}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {/* Add Worker Modal */}
      {showAddWorker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddWorker(false); }}>
          <div style={{ background: RAISED, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 28, maxWidth: 620, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: 0 }}>Add Worker Entry</h3>
              <button style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer' }} onClick={() => setShowAddWorker(false)}>&#10005;</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Full Name *</label>
                <input style={input} value={newWorker.name || ''} onChange={e => setNewWorker(p => ({ ...p, name: e.target.value }))} placeholder="e.g. John Smith" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Trade *</label>
                <select style={select} value={newWorker.trade || ''} onChange={e => {
                  const trade = e.target.value;
                  setNewWorker(p => ({ ...p, trade, classification: '' }));
                }}>
                  <option value="">Select Trade</option>
                  {uniqueTrades.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Classification *</label>
                <select style={select} value={newWorker.classification || ''} onChange={e => {
                  const cls = e.target.value;
                  setNewWorker(p => ({ ...p, classification: cls }));
                  if (newWorker.trade) handleLookupRate(newWorker.trade, cls);
                }}>
                  <option value="">Select Classification</option>
                  {DAVIS_BACON_RATES.filter(r => r.trade === newWorker.trade).map(r => (
                    <option key={r.classification} value={r.classification}>{r.classification}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Base Rate ($/hr)</label>
                <input style={input} type="number" step="0.01" value={newWorker.baseRate || ''} onChange={e => setNewWorker(p => ({ ...p, baseRate: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Fringe Benefit ($/hr)</label>
                <input style={input} type="number" step="0.01" value={newWorker.fringeBenefit || ''} onChange={e => setNewWorker(p => ({ ...p, fringeBenefit: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Weekly Deductions ($)</label>
                <input style={input} type="number" step="0.01" value={newWorker.deductions || ''} onChange={e => setNewWorker(p => ({ ...p, deductions: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 18 }}>
                <input type="checkbox" checked={newWorker.isApprentice || false} onChange={e => setNewWorker(p => ({ ...p, isApprentice: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: GOLD }} />
                <label style={{ fontSize: 13, color: TEXT }}>Apprentice</label>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 8 }}>Daily Hours (ST) - Sat through Fri</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                  {['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, i) => (
                    <div key={day}>
                      <div style={{ fontSize: 10, color: DIM, textAlign: 'center', marginBottom: 2 }}>{day}</div>
                      <input type="number" style={{ ...input, textAlign: 'center', padding: '6px 4px' }}
                        value={newWorker.hoursSTPerDay?.[i] || 0}
                        onChange={e => {
                          const arr = [...(newWorker.hoursSTPerDay || [0, 0, 0, 0, 0, 0, 0])];
                          arr[i] = parseFloat(e.target.value) || 0;
                          setNewWorker(p => ({ ...p, hoursSTPerDay: arr }));
                        }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button style={btn(RAISED)} onClick={() => setShowAddWorker(false)}>Cancel</button>
              <button style={btn(GOLD)} onClick={handleAddWorker}
                disabled={!newWorker.name || !newWorker.trade || !newWorker.classification}>Add Worker</button>
            </div>
          </div>
        </div>
      )}

      {/* Davis-Bacon Wage Rates Modal */}
      {showWageRates && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowWageRates(false); }}>
          <div style={{ background: RAISED, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 28, maxWidth: 800, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: 0 }}>Davis-Bacon Prevailing Wage Rates</h3>
              <button style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer' }} onClick={() => setShowWageRates(false)}>&#10005;</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Filter by Trade</label>
              <select style={{ ...select, maxWidth: 220 }} value={tradeFilter} onChange={e => setTradeFilter(e.target.value)}>
                <option value="All">All Trades</option>
                {uniqueTrades.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {['Trade', 'Classification', 'Base Rate', 'Fringe', 'Total Rate'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAVIS_BACON_RATES.filter(r => tradeFilter === 'All' || r.trade === tradeFilter).map((rate, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${BORDER}15` }}>
                    <td style={{ padding: '10px 12px', color: TEXT, fontWeight: 600 }}>{rate.trade}</td>
                    <td style={{ padding: '10px 12px', color: DIM }}>
                      {rate.classification}
                      {rate.classification.includes('Apprentice') && <span style={{ color: PURPLE, marginLeft: 6, fontSize: 10 }}>APPR</span>}
                    </td>
                    <td style={{ padding: '10px 12px', color: GREEN }}>${rate.baseRate.toFixed(2)}</td>
                    <td style={{ padding: '10px 12px', color: AMBER }}>${rate.fringeBenefit.toFixed(2)}</td>
                    <td style={{ padding: '10px 12px', color: GOLD, fontWeight: 700 }}>${rate.totalRate.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 16, fontSize: 11, color: DIM, lineHeight: 1.6 }}>
              Rates effective for Maricopa County, AZ. General Decision AZ20260001. Published by the U.S. Department of Labor,
              Wage and Hour Division. Last updated for the current fiscal year. Verify rates at sam.gov for the most current determination.
            </div>
          </div>
        </div>
      )}

      {/* WH-347 Form Modal */}
      {showWH347 && activePeriod && (() => {
        const proj = projects.find(p => p.id === activePeriod.projectId);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowWH347(false); }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 32, maxWidth: 900, width: '100%', maxHeight: '90vh', overflowY: 'auto', color: '#111' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#666' }}>U.S. Department of Labor | Wage and Hour Division</div>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: '#111', margin: '4px 0' }}>PAYROLL (WH-347)</h3>
                  <div style={{ fontSize: 11, color: '#666' }}>OMB Control No. 1235-0008 | Expires 03/31/2027</div>
                </div>
                <button style={{ background: '#eee', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                  onClick={() => setShowWH347(false)}>Close</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16, fontSize: 12, borderBottom: '2px solid #333', paddingBottom: 14 }}>
                <div><span style={{ color: '#666' }}>Contractor/Subcontractor: </span><strong>TNT Cyber Solutions</strong></div>
                <div><span style={{ color: '#666' }}>Contract #: </span><strong>{proj?.contractNumber}</strong></div>
                <div><span style={{ color: '#666' }}>Payroll No: </span><strong>{activePeriod.id.replace('pp', '')}</strong></div>
                <div><span style={{ color: '#666' }}>Project: </span><strong>{proj?.name}</strong></div>
                <div><span style={{ color: '#666' }}>Location: </span><strong>{proj?.location}</strong></div>
                <div><span style={{ color: '#666' }}>Week Ending: </span><strong>{activePeriod.weekEnding}</strong></div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, border: '1px solid #ccc' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    {['#', 'Name & SSN', 'Work Classification', 'ST Hrs', 'OT Hrs', 'Rate', 'Gross', 'Deductions', 'Net Wages'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '2px solid #333', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activePeriod.workers.map((w, idx) => {
                    const t = calcWorkerTotals(w);
                    return (
                      <tr key={w.id} style={{ borderBottom: '1px solid #ddd' }}>
                        <td style={{ padding: '6px', color: '#666' }}>{idx + 1}</td>
                        <td style={{ padding: '6px' }}>
                          <div style={{ fontWeight: 600 }}>{w.name}</div>
                          <div style={{ color: '#999', fontSize: 10 }}>{w.ssn}</div>
                        </td>
                        <td style={{ padding: '6px' }}>{w.trade} - {w.classification}</td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>{t.totalST}</td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>{t.totalOT || '-'}</td>
                        <td style={{ padding: '6px' }}>${w.baseRate.toFixed(2)}</td>
                        <td style={{ padding: '6px', fontWeight: 600 }}>${t.grossPay.toFixed(2)}</td>
                        <td style={{ padding: '6px' }}>${w.deductions.toFixed(2)}</td>
                        <td style={{ padding: '6px', fontWeight: 600 }}>${t.netPay.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #333', fontWeight: 700 }}>
                    <td colSpan={3} style={{ padding: '8px 6px' }}>TOTALS</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>{periodSummary?.totalHours}</td>
                    <td style={{ padding: '8px 6px' }} />
                    <td style={{ padding: '8px 6px' }} />
                    <td style={{ padding: '8px 6px' }}>${periodSummary?.totalGross.toFixed(2)}</td>
                    <td style={{ padding: '8px 6px' }}>${periodSummary?.totalDeductions.toFixed(2)}</td>
                    <td style={{ padding: '8px 6px' }}>${periodSummary?.totalNet.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>

              <div style={{ marginTop: 20, padding: 16, border: '1px solid #ccc', borderRadius: 6, fontSize: 11, lineHeight: 1.7 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>STATEMENT OF COMPLIANCE</div>
                <div style={{ color: '#444' }}>
                  I, <strong>{activePeriod.signedBy || '________________________'}</strong>, do hereby state that during the payroll period
                  commencing on the first day of the week shown above and ending the last day thereof, all persons employed on said
                  project have been paid the full weekly wages earned, that no rebates or deductions have been made, and that the
                  wage rates contained herein are not less than the applicable wage rates contained in any wage determination
                  incorporated into the contract.
                </div>
                <div style={{ display: 'flex', gap: 40, marginTop: 16 }}>
                  <div>
                    <div style={{ borderBottom: '1px solid #333', width: 200, height: 24, display: 'flex', alignItems: 'flex-end', fontStyle: 'italic', fontWeight: 600 }}>
                      {activePeriod.signedBy || ''}
                    </div>
                    <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>Signature</div>
                  </div>
                  <div>
                    <div style={{ borderBottom: '1px solid #333', width: 200, height: 24, display: 'flex', alignItems: 'flex-end' }}>
                      {activePeriod.signedBy ? 'Project Manager' : ''}
                    </div>
                    <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>Title</div>
                  </div>
                  <div>
                    <div style={{ borderBottom: '1px solid #333', width: 140, height: 24, display: 'flex', alignItems: 'flex-end' }}>
                      {activePeriod.signedDate || ''}
                    </div>
                    <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>Date</div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                  onClick={() => handleExport('pdf')}>
                  {exportingFormat === 'pdf' ? 'Generating...' : 'Export as PDF'}
                </button>
                <button style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                  onClick={() => { window.print(); }}>Print</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}