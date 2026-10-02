'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CurrencyDollar, ChartBar, Clipboard, ArrowsClockwise, Lock, ShieldCheck, CalendarBlank, CheckCircle, HardHat, Warning, Package, Clock, ArrowRight, X } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, StatStrip, PremiumEmpty, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { PdfIcon, XlsIcon, CsvIcon, DocIcon, FileButton } from '@/components/ui/FileTypeIcon';

// ── Color palette ──────────────────────────────────────────────
const GOLD   = '#F59E0B';
const DARK   = '#0a0a0a';
const RAISED = '#141416';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM    = '#CBD5E1';
const TEXT   = '#FFFFFF';
const GREEN  = '#22C55E';
const YELLOW = '#F59E0B';
const RED    = '#EF4444';
const BLUE   = '#F59E0B';

// ── Type definitions ───────────────────────────────────────────
interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'currency' | 'date' | 'number' | 'badge' | 'percent';
}

interface ReportResult {
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, number>;
  rowCount: number;
  chartType: string;
  generatedAt: string;
}

interface ReportProgress {
  step: number;
  pct: number;
  message: string;
}

type PageState = 'idle' | 'loading' | 'results';

interface HistoryItem {
  query: string;
  projectId: string;
  range: string;
  title: string;
  ts: number;
}

// ── Standard report card definitions ──────────────────────────
const STANDARD_REPORTS = [
  { id: 'pay-app',      title: 'Pay App Status',          icon: CurrencyDollar,  desc: 'Pay applications with amounts and status',        query: 'Show all pay applications with amounts and status' },
  { id: 'job-cost',     title: 'Job Cost Report',         icon: ChartBar,        desc: 'Budget vs actual variance by cost code',          query: 'Job cost breakdown by cost code with budget vs actual variance' },
  { id: 'rfi-log',      title: 'RFI Log',                 icon: Clipboard,       desc: 'All RFIs with status, due dates, and impact',     query: 'All RFIs with status, due dates, and cost/schedule impact' },
  { id: 'change-order', title: 'Change Order Log',        icon: ArrowsClockwise, desc: 'Change orders with approval and cost impact',     query: 'All change orders with approval status and cost impact' },
  { id: 'lien-waiver',  title: 'Lien Waiver Log',         icon: Lock,            desc: 'Lien waivers by subcontractor with status',       query: 'All lien waivers by subcontractor with status' },
  { id: 'insurance',    title: 'Insurance Compliance',    icon: ShieldCheck,     desc: 'COI status and expiry dates by sub',              query: 'Insurance certificates by subcontractor with expiry dates' },
  { id: 'daily-log',    title: 'Daily Log Summary',       icon: CalendarBlank,   desc: 'Last 30 days with crew counts and delays',        query: 'Daily logs for the last 30 days with crew counts and delays' },
  { id: 'punch-list',   title: 'Punch List Report',       icon: CheckCircle,     desc: 'Open and in-progress items by trade',             query: 'All open and in-progress punch list items by trade' },
  { id: 'sub-perf',     title: 'Subcontractor Performance', icon: HardHat,       desc: 'Contract amounts and current status',          query: 'Subcontractor list with contract amounts and status' },
  { id: 'safety',       title: 'Safety Incidents',        icon: Warning,         desc: 'Incidents by type and severity',                 query: 'Safety incidents by type and severity' },
  { id: 'bid-pkg',      title: 'Bid Package Summary',     icon: Package,         desc: 'Bid packages with trade, due date, and status',  query: 'All bid packages with trade, due date, and status' },
  { id: 'timesheet',    title: 'Timesheet Report',        icon: Clock,           desc: 'Weekly summary with regular and overtime hours', query: 'Weekly timesheet summary with regular and overtime hours' },
] as const;

// What each standard report actually answers - shown on the catalog card so a
// GC picks by the question, not the table name.
const REPORT_ANSWERS: Record<string, string> = {
  'pay-app':      'How much have we billed, certified, and collected?',
  'job-cost':     'Where is the budget over or under, by cost code?',
  'rfi-log':      'Which RFIs are open, who owes answers, and what is at risk?',
  'change-order': 'How much has the contract grown - approved vs pending?',
  'lien-waiver':  'Which subs still owe waivers before money can move?',
  'insurance':    'Whose COIs are expired or expiring soon?',
  'daily-log':    'What happened on site - crews, delays, conditions?',
  'punch-list':   'What is still open, by trade, before closeout?',
  'sub-perf':     'Which subs carry the most contract value and risk?',
  'safety':       'What incidents happened, and how severe were they?',
  'bid-pkg':      'Which packages are out, due, or awarded - and for how much?',
  'timesheet':    'Who worked, how many hours, and how much overtime?',
};

// Date-range quick filters - resolved to concrete dates so Sage receives an
// exact window, not a vague phrase. Empty string = all time (no clause).
const DATE_RANGES = ['Last 30 days', 'This month', 'Last month', 'This quarter', 'Year to date'] as const;
function rangeDates(range: string): { from: string; to: string } | null {
  const now = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  switch (range) {
    case 'Last 30 days': return { from: iso(new Date(now.getTime() - 30 * 86400000)), to: iso(now) };
    case 'This month':   return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    case 'Last month':   return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case 'This quarter': return { from: iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to: iso(now) };
    case 'Year to date': return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    default: return null;
  }
}

const SUGGESTION_CHIPS = [
  'Pay App Status', 'Open RFIs', 'Change Orders', 'Insurance Compliance',
  'Job Cost', 'Daily Log Summary', 'Punch List', 'Sub Performance',
  'Bid Analysis', 'Safety Incidents',
];

// ── Formatting helpers ─────────────────────────────────────────
function fmtCurrency(v: unknown): string {
  const n = Number(v);
  if (isNaN(n)) return String(v ?? '');
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(v: unknown): string {
  if (!v) return '';
  try {
    const d = new Date(String(v));
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return String(v); }
}

function fmtNumber(v: unknown): string {
  const n = Number(v);
  if (isNaN(n)) return String(v ?? '');
  return n.toLocaleString();
}

function fmtPercent(v: unknown): string {
  const n = Number(v);
  if (isNaN(n)) return String(v ?? '');
  return n + '%';
}

function fmtText(v: unknown): string {
  const s = String(v ?? '');
  return s.length > 60 ? s.slice(0, 57) + '...' : s;
}

function getBadgeStyle(v: unknown): React.CSSProperties {
  const s = String(v ?? '').toLowerCase();
  let bg = 'rgba(0,0,0,0.1)';
  let color = '#CBD5E1';
  if (['active', 'approved', 'complete', 'completed', 'paid', 'closed-won'].some(k => s.includes(k))) {
    bg = 'rgba(34,197,94,0.15)'; color = GREEN;
  } else if (['pending', 'submitted', 'in progress', 'in-progress', 'open', 'review'].some(k => s.includes(k))) {
    bg = 'rgba(245,158,11,0.15)'; color = YELLOW;
  } else if (['overdue', 'expired', 'rejected', 'void', 'failed', 'critical'].some(k => s.includes(k))) {
    bg = 'rgba(239,68,68,0.15)'; color = RED;
  } else if (['draft', 'closed', 'cancelled', 'canceled', 'inactive'].some(k => s.includes(k))) {
    bg = 'rgba(0,0,0,0.06)'; color = DIM;
  } else if (['info', 'new', 'assigned'].some(k => s.includes(k))) {
    bg = 'rgba(245,158,11,0.15)'; color = BLUE;
  }
  return {
    display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 20,
    fontSize: 11, fontWeight: 700, letterSpacing: 0.4, background: bg, color, whiteSpace: 'nowrap',
  };
}

function formatCell(col: ReportColumn, v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === '') return <span style={{ color: DIM }}>—</span>;
  switch (col.type) {
    case 'currency': return <span style={{ color: GOLD, fontWeight: 600 }}>{fmtCurrency(v)}</span>;
    case 'date':     return <span style={{ color: DIM }}>{fmtDate(v)}</span>;
    case 'number':   return <span>{fmtNumber(v)}</span>;
    case 'percent':  return <span>{fmtPercent(v)}</span>;
    case 'badge':    return <span style={getBadgeStyle(v)}>{String(v)}</span>;
    default:         return <span style={{ color: TEXT }}>{fmtText(v)}</span>;
  }
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

// ── Main Page Component ────────────────────────────────────────
export default function ReportsPage() {
  const [sageQuery, setSageQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [pageState, setPageState] = useState<PageState>('idle');
  const [progress, setProgress] = useState<ReportProgress>({ step: 0, pct: 5, message: 'Connecting to Sage...' });
  const [reportResult, setReportResult] = useState<ReportResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [hoveredChip, setHoveredChip] = useState<string | null>(null);
  const [branding, setBranding] = useState<{ company_name: string; logo_url: string }>({ company_name: '', logo_url: '' });
  const esRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Load projects and branding
  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : data.projects ?? [];
        setProjects(list.map((p: Record<string, unknown>) => ({ id: String(p.id ?? p._id ?? ''), name: String(p.name ?? p.projectName ?? '') })));
      })
      .catch(() => {/* non-fatal */});

    fetch('/api/branding')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setBranding({ company_name: d.company_name ?? '', logo_url: d.logo_url ?? '' }); })
      .catch(() => {/* non-fatal */});
  }, []);

  const showError = useCallback((msg: string) => {
    setToast({ msg, type: 'error' });
  }, []);

  const runSageReport = useCallback((queryOverride?: string, opts?: { projectId?: string; range?: string }) => {
    const q = (queryOverride ?? sageQuery).trim();
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    setPageState('loading');
    setProgress({ step: 0, pct: 5, message: 'Connecting to Sage...' });
    setReportResult(null);

    // Effective scope for THIS run - history reruns pass explicit overrides so
    // the stored project/range apply immediately (state setters land a render late).
    const effProject = opts?.projectId !== undefined ? opts.projectId : projectFilter;
    const effRange = opts?.range !== undefined ? opts.range : dateRange;
    const rd = rangeDates(effRange);
    const params = new URLSearchParams({ q: rd ? `${q} between ${rd.from} and ${rd.to}` : q });
    if (effProject) params.set('projectId', effProject);

    const es = new EventSource(`/api/reports/sage?${params.toString()}`);
    esRef.current = es;
    let resolved = false;

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data);
        if (evt.event === 'progress') {
          setProgress({ step: evt.step ?? 0, pct: evt.pct ?? 50, message: evt.message ?? 'Processing...' });
        }
        if (evt.event === 'result') {
          resolved = true;
          es.close();
          esRef.current = null;
          const result = evt as ReportResult;
          setReportResult(result);
          setHistory(prev => {
            const item: HistoryItem = { query: q, projectId: effProject, range: effRange, title: result.title, ts: Date.now() };
            return [item, ...prev.filter(h => h.query !== q)].slice(0, 5);
          });
          setPageState('results');
        }
        if (evt.event === 'error') {
          es.close();
          esRef.current = null;
          showError(evt.message ?? 'Report generation failed');
          setPageState('idle');
        }
        if (evt.event === 'done' && !resolved) {
          es.close();
          esRef.current = null;
          setPageState('idle');
        }
      } catch { /* parse error — ignore */ }
    };

    es.onerror = () => {
      if (!resolved) {
        es.close();
        esRef.current = null;
        showError('Connection lost. Please try again.');
        setPageState('idle');
      }
    };
  }, [sageQuery, projectFilter, dateRange, showError]);

  // Cleanup on unmount
  useEffect(() => () => { esRef.current?.close(); }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') runSageReport();
  };

  const handleCardClick = (query: string) => {
    setSageQuery(query);
    runSageReport(query);
  };

  const handleChipClick = (chip: string) => {
    // Name the actual scope: with a project selected the query text matches the
    // projectId param that rides along, instead of contradicting it.
    const projName = projectFilter ? projects.find(p => p.id === projectFilter)?.name : '';
    const q = `Show me ${chip.toLowerCase()} for ${projName || 'all projects'}`;
    setSageQuery(q);
    runSageReport(q);
  };

  // ── Export functions ─────────────────────────────────────────
  const exportCSV = async () => {
    if (!reportResult) return;
    try {
      const res = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'csv',
          title: reportResult.title,
          columns: reportResult.columns,
          rows: reportResult.rows,
          totals: reportResult.totals,
          companyName: branding.company_name || undefined,
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      downloadBlob(blob, `${reportResult.title.replace(/\s+/g, '-')}-${today()}.csv`);
    } catch {
      showError('CSV export failed.');
    }
  };

  const exportXLS = async () => {
    if (!reportResult) return;
    try {
      const res = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'xlsx',
          title: reportResult.title,
          columns: reportResult.columns,
          rows: reportResult.rows,
          totals: reportResult.totals,
          companyName: branding.company_name || undefined,
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      downloadBlob(blob, `${reportResult.title.replace(/\s+/g, '-')}-${today()}.xlsx`);
    } catch {
      showError('Excel export failed. Try CSV instead.');
    }
  };
  const exportDOC = async () => {
    if (!reportResult) return;
    try {
      const res = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'docx',
          title: reportResult.title,
          columns: reportResult.columns,
          rows: reportResult.rows,
          totals: reportResult.totals,
          companyName: branding.company_name || undefined,
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      downloadBlob(blob, `${reportResult.title.replace(/\s+/g, '-')}-${today()}.docx`);
    } catch {
      showError('Word export failed. Try PDF instead.');
    }
  };

  const exportPDF = async () => {
    if (!reportResult) return;
    try {
      const res = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'pdf',
          title: reportResult.title,
          columns: reportResult.columns,
          rows: reportResult.rows,
          totals: reportResult.totals,
          companyName: branding.company_name || undefined,
          logoUrl: branding.logo_url || undefined,
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      downloadBlob(blob, `${reportResult.title.replace(/\s+/g, '-')}-${today()}.pdf`);
    } catch {
      showError('PDF export failed. Try CSV instead.');
    }
  };

  const displayRows = reportResult ? reportResult.rows.slice(0, 100) : [];
  const hasTotals = reportResult?.totals && Object.keys(reportResult.totals).length > 0;

  // Compact ghost button preset for the results header (export + close).
  const exportBtnStyle: React.CSSProperties = { ...ghostButtonStyle, padding: '7px 14px', fontSize: 12, fontWeight: 700 };

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
    <PremiumSurface maxWidth={1600}>
      <div style={{ color: TEXT }}>

      {/* ── Page Header ── */}
      <ModuleHero
        eyebrow="Analytics"
        eyebrowIcon={<ChartBar size={13} weight="fill" color={GOLD} />}
        title="Reports &"
        accent="Analytics"
        subtitle="Ask Sage to generate any report, or pick from the standard library below."
        actions={
          <a href="/app/reports/builder" style={goldButtonStyle} className="pmBtn">
            <ChartBar size={16} weight="bold" /> Custom Report Builder
          </a>
        }
      />

      {/* What the reporting engine already knows — all figures live on this page */}
      <StatStrip items={[
        {href: '/app/reports',  label: 'Report Library', value: String(STANDARD_REPORTS.length), sub: 'standard reports, one tap each' },
        {href: '/app/reports',  label: 'Projects In Scope', value: String(projects.length), sub: projectFilter ? (projects.find(p => p.id === projectFilter)?.name || 'one selected') : 'all projects' },
        {href: '/app/reports',  label: 'Runs This Session', value: String(history.length), sub: history[0] ? `last: ${timeAgo(history[0].ts)}` : 'none yet' },
        {href: '/app/reports',  label: 'Export Formats', value: '3', sub: 'CSV, Excel, and PDF' },
      ]} />
      <SectionCard flush style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Sage icon */}
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${GOLD}22, ${GOLD}44)`,
            border: `1px solid ${GOLD}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}>
            S
          </div>

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={sageQuery}
            onChange={e => setSageQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Ask Sage anything... "Show me all open RFIs on Project Alpha" or "Cost breakdown this month"'
            disabled={pageState === 'loading'}
            style={{
              flex: 1, minWidth: 240,
              background: 'rgba(0,0,0,0.05)',
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: '10px 16px',
              color: TEXT,
              fontSize: 14,
              outline: 'none',
              transition: 'border-color .15s',
              opacity: pageState === 'loading' ? 0.6 : 1,
            }}
          />

          {/* Project selector */}
          {projects.length > 0 && (
            <select
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
              disabled={pageState === 'loading'}
              style={{
                background: 'rgba(0,0,0,0.05)',
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                padding: '10px 14px',
                color: projectFilter ? TEXT : DIM,
                fontSize: 13,
                cursor: 'pointer',
                minWidth: 160,
                outline: 'none',
                opacity: pageState === 'loading' ? 0.6 : 1,
              }}
            >
              <option value="">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          {/* Run button */}
          <button
            onClick={() => runSageReport()}
            disabled={pageState === 'loading' || !sageQuery.trim()}
            style={{
              padding: '10px 22px',
              background: pageState === 'loading' || !sageQuery.trim()
                ? 'rgba(245, 158, 11,0.3)'
                : `linear-gradient(135deg, ${GOLD}, #FBBF24)`,
              border: 'none',
              borderRadius: 10,
              color: pageState === 'loading' || !sageQuery.trim() ? 'rgba(0,0,0,0.4)' : DARK,
              fontSize: 13,
              fontWeight: 800,
              cursor: pageState === 'loading' || !sageQuery.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              transition: 'opacity .15s',
              letterSpacing: 0.3,
            }}
          >
            {pageState === 'loading' ? 'Running...' : 'Ask Sage'}
          </button>
        </div>

        {/* Date-range AutoChips - the range resolves to real dates and rides along with every query and card run */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <CalendarBlank size={13} weight="bold" color={GOLD} /> Period
          </span>
          {['', ...DATE_RANGES].map(rg => {
            const active = dateRange === rg;
            return (
              <button
                key={rg || 'all-time'}
                onClick={() => setDateRange(rg)}
                disabled={pageState === 'loading'}
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: active ? `${GOLD}22` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${active ? GOLD + '66' : BORDER}`,
                  color: active ? '#FBBF24' : DIM,
                  cursor: pageState === 'loading' ? 'not-allowed' : 'pointer',
                  transition: 'all .15s',
                }}
              >
                {rg || 'All time'}
              </button>
            );
          })}
          {(() => { const rd = rangeDates(dateRange); return rd ? (
            <span style={{ fontSize: 11, color: DIM }}>{rd.from} to {rd.to}<AutoChip /></span>
          ) : null; })()}
        </div>

        {/* Quick suggestion chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {SUGGESTION_CHIPS.map(chip => (
            <button
              key={chip}
              onClick={() => handleChipClick(chip)}
              disabled={pageState === 'loading'}
              onMouseEnter={() => setHoveredChip(chip)}
              onMouseLeave={() => setHoveredChip(null)}
              style={{
                padding: '4px 12px',
                background: hoveredChip === chip ? `${GOLD}22` : 'rgba(0,0,0,0.05)',
                border: `1px solid ${hoveredChip === chip ? GOLD + '55' : BORDER}`,
                borderRadius: 20,
                color: hoveredChip === chip ? GOLD : DIM,
                fontSize: 12,
                fontWeight: 600,
                cursor: pageState === 'loading' ? 'not-allowed' : 'pointer',
                transition: 'all .15s',
                opacity: pageState === 'loading' ? 0.5 : 1,
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      </SectionCard>

      {/* ── Main Content Area ── */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── Left/Main Column ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Loading / Progress state */}
          {pageState === 'loading' && (
            <SectionCard flat flush style={{ marginBottom: 20 }} bodyStyle={{ padding: '40px 32px', textAlign: 'center' }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: `linear-gradient(135deg, ${GOLD}22, ${GOLD}44)`,
                border: `1px solid ${GOLD}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, margin: '0 auto 16px',
              }}>
                S
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
                Sage is analyzing your request...
              </div>
              <div style={{ fontSize: 13, color: DIM, marginBottom: 24, minHeight: 20 }}>
                {progress.message}
              </div>
              {/* Progress bar */}
              <div style={{
                background: 'rgba(0,0,0,0.06)',
                borderRadius: 8,
                height: 8,
                overflow: 'hidden',
                maxWidth: 420,
                margin: '0 auto',
              }}>
                <div style={{
                  height: '100%',
                  width: `${progress.pct}%`,
                  background: `linear-gradient(90deg, ${GOLD}, #FBBF24)`,
                  borderRadius: 8,
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ fontSize: 12, color: DIM, marginTop: 10 }}>
                {progress.pct}% complete
              </div>
            </SectionCard>
          )}

          {/* Results table */}
          {pageState === 'results' && reportResult && (
            <SectionCard
              flush
              icon={<ChartBar size={17} weight="duotone" color={GOLD} />}
              title={reportResult.title}
              subtitle={reportResult.description}
              style={{ marginBottom: 20 }}
              action={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                  <FileButton icon={<PdfIcon size={16} />} label="PDF" onClick={exportPDF} title="Branded corporate PDF — letterhead, KPI band, totals" />
                  <FileButton icon={<XlsIcon size={16} />} label="Excel" onClick={exportXLS} title="Excel workbook (.xlsx) with typed money columns and totals" />
                  <FileButton icon={<DocIcon size={16} />} label="Word" onClick={exportDOC} title="Word document (.docx) with a real table you can restyle" />
                  <FileButton icon={<CsvIcon size={16} />} label="CSV" onClick={exportCSV} title="Plain CSV (.csv) for any spreadsheet tool" />
                  <button
                    onClick={() => { setPageState('idle'); setReportResult(null); }}
                    aria-label="Close report"
                    style={{ ...exportBtnStyle, padding: '7px 10px' }}
                    className="pmBtn"
                  >
                    <X size={16} weight="regular" color={DIM} />
                  </button>
                </div>
              }
            >
              {/* Meta strip: row count + generated timestamp */}
              <div style={{ padding: '12px 20px', borderBottom: `1px solid rgba(255,255,255,0.06)`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{
                  background: 'rgba(245,158,11,0.15)', color: BLUE,
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                }}>
                  {reportResult.rowCount.toLocaleString()} rows
                </span>
                <span style={{ fontSize: 11, color: DIM }}>
                  Generated {fmtDate(reportResult.generatedAt)}
                </span>
              </div>

              {/* Overflow row warning */}
              {reportResult.rowCount > 100 && (
                <div style={{ padding: '8px 20px', background: 'rgba(245,158,11,0.08)', borderBottom: `1px solid ${BORDER}`, fontSize: 12, color: YELLOW }}>
                  Showing 100 of {reportResult.rowCount.toLocaleString()} rows. Export to see all data.
                </div>
              )}

              {/* Table */}
              {reportResult.columns.length > 0 && (
                <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                      <tr style={{ background: DARK }}>
                        {reportResult.columns.map(col => (
                          <th key={col.key} style={{
                            padding: '11px 16px',
                            textAlign: ['currency', 'number', 'percent'].includes(col.type) ? 'right' : 'left',
                            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: 0.6, color: DIM,
                            borderBottom: `1px solid ${BORDER}`,
                            whiteSpace: 'nowrap',
                          }}>
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.length === 0 ? (
                        <tr>
                          <td colSpan={reportResult.columns.length} style={{ padding: 0 }}>
                            <PremiumEmpty
                              compact
                              icon={<ChartBar size={30} weight="duotone" color={GOLD} />}
                              title="No data found"
                              description="This report returned no rows. Try a different query or project filter."
                            />
                          </td>
                        </tr>
                      ) : (
                        displayRows.map((row, ri) => (
                          <tr
                            key={ri}
                            style={{
                              background: ri % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
                              borderBottom: `1px solid ${BORDER}`,
                              transition: 'background .1s',
                            }}
                          >
                            {reportResult.columns.map((col, ci) => (
                              <td key={col.key} style={{
                                padding: '10px 16px',
                                textAlign: ['currency', 'number', 'percent'].includes(col.type) ? 'right' : 'left',
                                fontWeight: ci === 0 ? 600 : 400,
                                whiteSpace: col.type === 'text' ? 'normal' : 'nowrap',
                              }}>
                                {formatCell(col, row[col.key])}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                    {hasTotals && (
                      <tfoot>
                        <tr style={{
                          background: `${GOLD}0f`,
                          borderTop: `2px solid ${GOLD}33`,
                        }}>
                          {reportResult.columns.map((col, ci) => {
                            const val = reportResult.totals![col.key];
                            return (
                              <td key={col.key} style={{
                                padding: '11px 16px',
                                textAlign: ['currency', 'number', 'percent'].includes(col.type) ? 'right' : 'left',
                                fontWeight: 800,
                                color: ci === 0 ? TEXT : (val !== undefined ? GOLD : 'transparent'),
                                fontSize: ci === 0 ? 12 : 13,
                                whiteSpace: 'nowrap',
                              }}>
                                {ci === 0 ? 'TOTALS' : val !== undefined ? (
                                  col.type === 'currency' ? fmtCurrency(val) :
                                  col.type === 'percent' ? fmtPercent(val) :
                                  fmtNumber(val)
                                ) : ''}
                              </td>
                            );
                          })}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {/* Standard Report Cards grid (shown when idle or results) */}
          {(pageState === 'idle' || pageState === 'results') && (
            <SectionCard
              icon={<Clipboard size={17} weight="duotone" color={GOLD} />}
              title={pageState === 'results' ? 'Run Another Report' : 'Standard Reports'}
              subtitle={pageState === 'idle' ? 'Click any card to run it instantly with Sage.' : undefined}
              style={{ marginBottom: 20 }}
            >
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 12,
              }}>
                {STANDARD_REPORTS.map(r => (
                  <div
                    key={r.id}
                    onClick={() => handleCardClick(r.query)}
                    onMouseEnter={() => setHoveredCard(r.id)}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={{
                      background: hoveredCard === r.id ? `${GOLD}0a` : RAISED,
                      border: `1px solid ${hoveredCard === r.id ? GOLD + '44' : BORDER}`,
                      borderRadius: 12,
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      cursor: 'pointer',
                      transition: 'all .15s',
                      opacity: 1,
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 9,
                      background: hoveredCard === r.id ? `${GOLD}22` : 'rgba(0,0,0,0.05)',
                      border: `1px solid ${hoveredCard === r.id ? GOLD + '44' : BORDER}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 17, flexShrink: 0,
                      transition: 'all .15s',
                    }}>
                      <r.icon size={18} weight="regular" color={GOLD} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: TEXT, marginBottom: 3 }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5 }}>{r.desc}</div>
                      {REPORT_ANSWERS[r.id] && (
                        <div style={{ fontSize: 11.5, color: 'rgba(251,191,36,0.8)', lineHeight: 1.45, marginTop: 5 }}>
                          Answers: {REPORT_ANSWERS[r.id]}
                        </div>
                      )}
                    </div>
                    {hoveredCard === r.id && (
                      <div style={{ color: GOLD, fontSize: 16, alignSelf: 'center', flexShrink: 0, marginLeft: 4, display: 'inline-flex' }}>
                        <ArrowRight size={16} weight="regular" color={GOLD} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* ── Right Sidebar: History ── */}
        {history.length > 0 && (
          <SectionCard
            icon={<Clock size={16} weight="duotone" color={GOLD} />}
            title="Recent Reports"
            style={{ width: 240, flexShrink: 0 }}
            bodyStyle={{ padding: 14 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((item, i) => (
                <div
                  key={i}
                  onClick={() => {
                    setSageQuery(item.query);
                    setProjectFilter(item.projectId);
                    setDateRange(item.range || '');
                    // Pass overrides so the rerun uses the STORED project + range
                    // now - the state setters above only land next render.
                    runSageReport(item.query, { projectId: item.projectId, range: item.range || '' });
                  }}
                  style={{
                    background: 'rgba(0,0,0,0.03)',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 8,
                    padding: '9px 11px',
                    cursor: 'pointer',
                    transition: 'border-color .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD + '44')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 3, lineHeight: 1.3 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 10, color: DIM }}>{timeAgo(item.ts)}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setHistory([])}
              style={{ ...ghostButtonStyle, marginTop: 12, width: '100%', padding: '6px', fontSize: 11 }}
              className="pmBtn"
            >
              Clear History
            </button>
          </SectionCard>
        )}
      </div>
      </div>
    </PremiumSurface>

    {/* ── Toast notification (outside PremiumSurface so it stays viewport-fixed) ── */}
    {toast && (
      <div style={{
        position: 'fixed',
        bottom: 28,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        padding: '12px 24px',
        borderRadius: 10,
        background: toast.type === 'success' ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)',
        color: '#fff',
        fontWeight: 700,
        fontSize: 14,
        pointerEvents: 'none',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        whiteSpace: 'nowrap',
      }}>
        {toast.msg}
      </div>
    )}
    </>
  );
}
