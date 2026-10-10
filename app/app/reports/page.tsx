'use client';
/**
 * Reports & Analytics — Pass 4 on the kit.
 *
 * Anatomy: title + one primary action (Ask Sage, in the query bar) → StatRow
 * (what the engine already knows) → the Sage query bar (question, project,
 * period, suggestion chips) → workspace split: progress / results / the
 * standard report library on the left, recent runs in a rail on the right.
 *
 * Every read / write is the one this screen already used:
 *   projects  GET  /api/projects
 *   branding  GET  /api/branding
 *   run       SSE  /api/reports/sage?q=&projectId=
 *   export    POST /api/reports/export  { format, title, columns, rows, totals, companyName, logoUrl }
 *
 * Sage is AI: every result says so, and no figure is invented client-side —
 * cells render what the engine returned or an em-dash.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CurrencyDollar, ChartBar, Clipboard, ArrowsClockwise, Lock, ShieldCheck, CalendarBlank, CheckCircle, HardHat, Warning, Package, Clock, ArrowRight, X, Sparkle } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Input, Select, DataTable, EmptyState, Toast, useToast,
  type Column, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { AutoChip } from '@/components/ui/premium';
import { PdfIcon, XlsIcon, CsvIcon, DocIcon, FileButton } from '@/components/ui/FileTypeIcon';
import { layout } from '@/lib/design-tokens';

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
  { id: 'pay-app', title: 'Pay App Status', icon: CurrencyDollar, desc: 'Pay applications with amounts and status', query: 'Show all pay applications with amounts and status' },
  { id: 'job-cost', title: 'Job Cost Report', icon: ChartBar, desc: 'Budget vs actual variance by cost code', query: 'Job cost breakdown by cost code with budget vs actual variance' },
  { id: 'rfi-log', title: 'RFI Log', icon: Clipboard, desc: 'All RFIs with status, due dates, and impact', query: 'All RFIs with status, due dates, and cost/schedule impact' },
  { id: 'change-order', title: 'Change Order Log', icon: ArrowsClockwise, desc: 'Change orders with approval and cost impact', query: 'All change orders with approval status and cost impact' },
  { id: 'lien-waiver', title: 'Lien Waiver Log', icon: Lock, desc: 'Lien waivers by subcontractor with status', query: 'All lien waivers by subcontractor with status' },
  { id: 'insurance', title: 'Insurance Compliance', icon: ShieldCheck, desc: 'COI status and expiry dates by sub', query: 'Insurance certificates by subcontractor with expiry dates' },
  { id: 'daily-log', title: 'Daily Log Summary', icon: CalendarBlank, desc: 'Last 30 days with crew counts and delays', query: 'Daily logs for the last 30 days with crew counts and delays' },
  { id: 'punch-list', title: 'Punch List Report', icon: CheckCircle, desc: 'Open and in-progress items by trade', query: 'All open and in-progress punch list items by trade' },
  { id: 'sub-perf', title: 'Subcontractor Performance', icon: HardHat, desc: 'Contract amounts and current status', query: 'Subcontractor list with contract amounts and status' },
  { id: 'safety', title: 'Safety Incidents', icon: Warning, desc: 'Incidents by type and severity', query: 'Safety incidents by type and severity' },
  { id: 'bid-pkg', title: 'Bid Package Summary', icon: Package, desc: 'Bid packages with trade, due date, and status', query: 'All bid packages with trade, due date, and status' },
  { id: 'timesheet', title: 'Timesheet Report', icon: Clock, desc: 'Weekly summary with regular and overtime hours', query: 'Weekly timesheet summary with regular and overtime hours' },
] as const;

// What each standard report actually answers - shown on the catalog card so a
// GC picks by the question, not the table name.
const REPORT_ANSWERS: Record<string, string> = {
  'pay-app':      'How much have we billed, certified, and collected?',
  'job-cost':     'Where is the budget over or under, by cost code?',
  'rfi-log':      'Which RFIs are open, who owes answers, and what is at risk?',
  'change-order': 'How much has the contract grown — approved vs pending?',
  'lien-waiver':  'Which subs still owe waivers before money can move?',
  'insurance':    'Whose COIs are expired or expiring soon?',
  'daily-log':    'What happened on site — crews, delays, conditions?',
  'punch-list':   'What is still open, by trade, before closeout?',
  'sub-perf':     'Which subs carry the most contract value and risk?',
  'safety':       'What incidents happened, and how severe were they?',
  'bid-pkg':      'Which packages are out, due, or awarded — and for how much?',
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
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtCurrency(v: unknown): string {
  const n = Number(v);
  if (isNaN(n)) return String(v ?? '');
  return money.format(n);
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
/** Report badges carry whatever word the engine returned — map it onto the six status kinds. */
function badgeTone(v: unknown): BadgeTone {
  const s = String(v ?? '').toLowerCase();
  if (['active', 'approved', 'complete', 'completed', 'closed-won'].some(k => s.includes(k))) return 'ongoing';
  if (['paid', 'billed'].some(k => s.includes(k))) return 'completed';
  if (['pending', 'submitted', 'in progress', 'in-progress', 'open', 'review'].some(k => s.includes(k))) return 'under_contract';
  if (['overdue', 'expired', 'rejected', 'void', 'failed', 'critical'].some(k => s.includes(k))) return 'overdue';
  if (['draft', 'closed', 'cancelled', 'canceled', 'inactive'].some(k => s.includes(k))) return 'closed';
  if (['info', 'new', 'assigned', 'sent'].some(k => s.includes(k))) return 'lead';
  return 'neutral';
}
function formatCell(col: ReportColumn, v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === '') return <span className="rpMuted">—</span>;
  switch (col.type) {
    case 'currency': return <span className="rpMoney">{fmtCurrency(v)}</span>;
    case 'date':     return <span className="rpMuted">{fmtDate(v)}</span>;
    case 'number':   return <span className="rpNum">{fmtNumber(v)}</span>;
    case 'percent':  return <span className="rpNum">{fmtPercent(v)}</span>;
    case 'badge':    return <Badge tone={badgeTone(v)}>{String(v)}</Badge>;
    default:         return <span className="rpText" title={String(v)}>{String(v)}</span>;
  }
}
const isNumericCol = (c: ReportColumn) => ['currency', 'number', 'percent'].includes(c.type);

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

const CSS = `
.rpWs > .k-page { max-width: none; }
.rpCq { container: rpws / inline-size; min-width: 0; }
.rpSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.rpSplit > * { min-width: 0; }
@container rpws (min-width: 1080px) {
  .rpSplit[data-rail="true"] { grid-template-columns: minmax(340px, 1fr) clamp(${layout.detailRailMin}px, 26%, ${layout.detailRailMax}px); }
}
.rpRail { position: sticky; top: 16px; }
.rpAsk { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.rpAsk .rpQ { flex: 1 1 280px; min-width: 0; }
.rpSage { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: grid; place-items: center; background: var(--brand-primary-12); border: 1px solid var(--brand-primary-35); color: var(--brand-primary); }
.rpChips { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.rpChipLabel { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); margin-right: 2px; }
.rpChip { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; min-height: 28px; padding: 3px 12px; border-radius: 999px; font-size: var(--fs-xs); font-weight: 600; color: var(--text-secondary); background: var(--bg-surface-2); border: 1px solid var(--glass-border); cursor: pointer; }
.rpChip:hover { color: var(--text-primary); border-color: var(--border-strong); }
.rpChip[aria-pressed="true"] { color: var(--brand-primary); background: var(--brand-primary-12); border-color: var(--brand-primary-35); }
.rpChip:disabled { opacity: .5; cursor: not-allowed; }
.rpChip:focus-visible { outline: 2px solid var(--brand-primary); }
.rpProgress { padding: 40px 24px; text-align: center; }
.rpProgress .rpSage { width: 52px; height: 52px; border-radius: 14px; margin: 0 auto 16px; }
.rpBar { background: rgba(255,255,255,.08); border-radius: 8px; height: 8px; overflow: hidden; max-width: 420px; margin: 0 auto; }
.rpBar > div { height: 100%; background: var(--brand-primary); border-radius: 8px; transition: width .4s ease; }
.rpMeta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 16px; border-bottom: 1px solid var(--border-subtle); font-size: var(--fs-xs); color: var(--text-tertiary); }
.rpNote { padding: 8px 16px; border-bottom: 1px solid var(--border-subtle); font-size: var(--fs-xs); color: var(--status-under-contract); }
.rpTotals { display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 12px 16px; border-top: 2px solid var(--brand-primary-35); background: var(--brand-primary-08); font-size: var(--fs-sm); }
.rpTotals b { color: var(--text-tertiary); font-weight: 700; margin-right: 6px; }
.rpTotals span { color: var(--text-primary); font-weight: 800; font-variant-numeric: tabular-nums; }
.rpMoney { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--text-primary); font-weight: 600; }
.rpNum { font-variant-numeric: tabular-nums; white-space: nowrap; }
.rpMuted { color: var(--text-tertiary); }
.rpText { display: inline-block; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.rpExports { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
/* The library is a list of rows on hairlines (flat UI), two columns on a wide screen. */
.rpGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); column-gap: 28px; }
.rpCard { all: unset; box-sizing: border-box; display: flex; align-items: flex-start; gap: 12px; padding: 12px 4px; min-height: 58px; border-bottom: 1px solid var(--sg-border); cursor: pointer; min-width: 0; -webkit-tap-highlight-color: transparent; }
.rpCard:hover, .rpCard:active { background: rgba(255,255,255,0.03); }
.rpCard:focus-visible { outline: 2px solid var(--brand-primary); }
.rpCardIcon { width: 24px; height: 24px; flex-shrink: 0; display: grid; place-items: center; margin-top: 1px; color: var(--brand-primary); }
.rpCardTitle { font-weight: 700; font-size: var(--fs-md); color: var(--text-primary); margin-bottom: 3px; }
.rpCardDesc { font-size: var(--fs-xs); color: var(--text-tertiary); line-height: 1.5; }
.rpCardAsk { font-size: var(--fs-xs); color: var(--brand-primary); line-height: 1.45; margin-top: 5px; }
.rpHist { all: unset; box-sizing: border-box; display: block; width: 100%; padding: 10px 4px; border-bottom: 1px solid var(--sg-border); cursor: pointer; min-height: 44px; }
.rpHist:hover { background: rgba(255,255,255,0.03); }
.rpHist:focus-visible { outline: 2px solid var(--brand-primary); }
.rpHistTitle { font-size: var(--fs-sm); font-weight: 600; color: var(--text-primary); line-height: 1.3; }
.rpHistSub { font-size: var(--fs-xs); color: var(--text-tertiary); margin-top: 3px; }
.rpStack { display: flex; flex-direction: column; gap: 0; }
@media (max-width: 640px) {
  .rpWs .k-btn, .rpWs .k-stat, .rpWs select.k-select, .rpWs .k-input, .rpChip { min-height: 44px; }
  .rpWs .k-table td { height: 48px; }
  .rpText { max-width: 180px; }
}
`;

// ── Main Page Component ────────────────────────────────────────
export default function ReportsPage() {
  const [sageQuery, setSageQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [pageState, setPageState] = useState<PageState>('idle');
  const [progress, setProgress] = useState<ReportProgress>({ step: 0, pct: 5, message: 'Connecting to Sage…' });
  const [reportResult, setReportResult] = useState<ReportResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const { toast, show } = useToast(4000);
  const [branding, setBranding] = useState<{ company_name: string; logo_url: string }>({ company_name: '', logo_url: '' });
  const esRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

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

  const showError = useCallback((msg: string) => { show(msg, 'bad'); }, [show]);

  const runSageReport = useCallback((queryOverride?: string, opts?: { projectId?: string; range?: string }) => {
    const q = (queryOverride ?? sageQuery).trim();
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    setPageState('loading');
    setProgress({ step: 0, pct: 5, message: 'Connecting to Sage…' });
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
          setProgress({ step: evt.step ?? 0, pct: evt.pct ?? 50, message: evt.message ?? 'Processing…' });
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

  /* No auto-scroll to the result. The page used to scrollIntoView the result
     card the moment it landed — on a phone that yanked the page out from
     under a thumb already reaching for the next chip (the live walk's
     "covered" Job Cost / Punch List / Bid Analysis taps). The progress and
     result cards open directly under the Ask Sage bar instead. */

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
  async function exportAs(format: 'csv' | 'xlsx' | 'docx' | 'pdf', failMsg: string) {
    if (!reportResult) return;
    try {
      const res = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          title: reportResult.title,
          columns: reportResult.columns,
          rows: reportResult.rows,
          totals: reportResult.totals,
          companyName: branding.company_name || undefined,
          ...(format === 'pdf' ? { logoUrl: branding.logo_url || undefined } : {}),
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      downloadBlob(blob, `${reportResult.title.replace(/\s+/g, '-')}-${today()}.${format}`);
      show(`${format.toUpperCase()} downloaded.`);
    } catch {
      showError(failMsg);
    }
  }
  const exportCSV = () => exportAs('csv', 'CSV export failed.');
  const exportXLS = () => exportAs('xlsx', 'Excel export failed. Try CSV instead.');
  const exportDOC = () => exportAs('docx', 'Word export failed. Try PDF instead.');
  const exportPDF = () => exportAs('pdf', 'PDF export failed. Try CSV instead.');

  const displayRows = reportResult ? reportResult.rows.slice(0, 100) : [];
  const hasTotals = !!(reportResult?.totals && Object.keys(reportResult.totals).length > 0);
  const busy = pageState === 'loading';
  const selectedProjectName = projectFilter ? projects.find(p => p.id === projectFilter)?.name : '';
  const rd = rangeDates(dateRange);

  const stats: StatItem[] = [
    { label: 'Report Library', value: STANDARD_REPORTS.length, sub: 'Standard reports, one tap each' },
    { label: 'Projects In Scope', value: projectFilter ? 1 : projects.length, sub: selectedProjectName || 'All projects' },
    { label: 'Runs This Session', value: history.length, sub: history[0] ? `Last: ${timeAgo(history[0].ts)}` : 'None yet' },
    { label: 'Export Formats', value: 4, sub: 'PDF, Excel, Word, and CSV' },
  ];

  const resultColumns: Column<Record<string, unknown>>[] = (reportResult?.columns ?? []).map((col, ci) => ({
    key: col.key,
    header: col.label,
    accessor: (row) => { const v = row[col.key]; return isNumericCol(col) ? (Number(v) || 0) : String(v ?? '').toLowerCase(); },
    align: isNumericCol(col) ? 'right' : undefined,
    render: (row) => ci === 0 ? <span style={{ fontWeight: 600 }}>{formatCell(col, row[col.key])}</span> : formatCell(col, row[col.key]),
  }));

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="rpWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Reports' }]}
        title="Reports & Analytics"
        subtitle="Ask Sage, the AI assistant, for any report — or run one from the standard library. Every export carries your letterhead."
        actions={<Button icon={<ChartBar size={15} weight="bold" />} href="/app/reports/builder">Custom Report Builder</Button>}
      >
        <StatRow items={stats} />

        {/* ── Sage query bar ── */}
        <Card title="Ask Sage" subtitle="AI-generated reports from your live data — results say what they are and where the figures came from.">
          <div className="rpAsk">
            <div className="rpSage" aria-hidden><Sparkle size={18} weight="fill" /></div>
            <div className="rpQ">
              <Input
                ref={inputRef}
                type="text"
                value={sageQuery}
                onChange={e => setSageQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder='Ask Sage anything… "Show me all open RFIs on Project Alpha" or "Cost breakdown this month"'
                aria-label="Report question"
              />
            </div>
            {projects.length > 0 && (
              <Select aria-label="Project" value={projectFilter} onChange={e => setProjectFilter(e.target.value)} placeholder="All Projects" style={{ width: 'auto', minWidth: 170 }} options={projects.map(p => ({ value: p.id, label: p.name }))} />
            )}
            <Button variant="primary" onClick={() => runSageReport()} disabled={!sageQuery.trim()} aria-busy={busy || undefined}>{busy ? 'Running…' : 'Ask Sage'}</Button>
          </div>

          {/* Date-range chips - the range resolves to real dates and rides along with every query and card run */}
          <div className="rpChips">
            <span className="rpChipLabel"><CalendarBlank size={13} weight="bold" /> Period</span>
            {['', ...DATE_RANGES].map(rg => (
              <button key={rg || 'all-time'} type="button" className="rpChip" aria-pressed={dateRange === rg} onClick={() => setDateRange(rg)}>{rg || 'All time'}</button>
            ))}
            {rd && <span className="rpMuted" style={{ fontSize: 'var(--fs-xs)' }}>{rd.from} to {rd.to} <AutoChip /></span>}
          </div>

          {/* Quick suggestion chips */}
          <div className="rpChips">
            <span className="rpChipLabel"><Sparkle size={13} weight="bold" /> Try</span>
            {SUGGESTION_CHIPS.map(chip => (
              <button key={chip} type="button" className="rpChip" onClick={() => handleChipClick(chip)}>{chip}</button>
            ))}
          </div>
        </Card>

        <div className="rpCq">
          <div className="rpSplit" data-rail={history.length > 0 ? 'true' : 'false'}>
            <div className="rpStack" style={{ gap: 16 }}>
              {/* Loading / Progress state */}
              {busy && (
                <Card flush>
                  <div className="rpProgress" role="status" aria-live="polite">
                    <div className="rpSage" aria-hidden><Sparkle size={24} weight="fill" /></div>
                    <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Sage is building your report…</div>
                    <div className="rpMuted" style={{ fontSize: 'var(--fs-sm)', marginBottom: 20, minHeight: 20 }}>{progress.message}</div>
                    <div className="rpBar"><div style={{ width: `${progress.pct}%` }} /></div>
                    <div className="rpMuted" style={{ fontSize: 'var(--fs-xs)', marginTop: 10 }}>{progress.pct}% complete</div>
                  </div>
                </Card>
              )}

              {/* Results */}
              {pageState === 'results' && reportResult && (
                <div ref={resultsRef}>
                  <Card
                    flush
                    title={reportResult.title}
                    subtitle={reportResult.description}
                    actions={
                      <div className="rpExports">
                        <FileButton icon={<PdfIcon size={16} />} label="PDF" onClick={exportPDF} title="Branded corporate PDF — letterhead, KPI band, totals" />
                        <FileButton icon={<XlsIcon size={16} />} label="Excel" onClick={exportXLS} title="Excel workbook (.xlsx) with typed money columns and totals" />
                        <FileButton icon={<DocIcon size={16} />} label="Word" onClick={exportDOC} title="Word document (.docx) with a real table you can restyle" />
                        <FileButton icon={<CsvIcon size={16} />} label="CSV" onClick={exportCSV} title="Plain CSV (.csv) for any spreadsheet tool" />
                        <Button variant="ghost" size="sm" icon={<X size={16} />} aria-label="Close report" title="Close report" onClick={() => { setPageState('idle'); setReportResult(null); }} />
                      </div>
                    }
                  >
                    <div className="rpMeta">
                      <Badge tone="gold">AI-generated by Sage</Badge>
                      <Badge tone="neutral">{reportResult.rowCount.toLocaleString()} rows</Badge>
                      <span>Generated {fmtDate(reportResult.generatedAt)}</span>
                    </div>
                    {reportResult.rowCount > 100 && (
                      <div className="rpNote">Showing 100 of {reportResult.rowCount.toLocaleString()} rows. Export to see all data.</div>
                    )}
                    {reportResult.columns.length > 0 && (
                      <DataTable
                        columns={resultColumns}
                        rows={displayRows.map((r, i) => ({ ...r, __i: i }))}
                        rowKey={(r) => String(r.__i)}
                        empty={<EmptyState icon={<ChartBar size={22} />} title="No data found" text="This report returned no rows. Try a different question, period, or project." />}
                      />
                    )}
                    {hasTotals && (
                      <div className="rpTotals">
                        <b>Totals</b>
                        {reportResult.columns.filter(c => reportResult.totals![c.key] !== undefined).map(c => (
                          <div key={c.key}><b>{c.label}</b><span>{c.type === 'currency' ? fmtCurrency(reportResult.totals![c.key]) : c.type === 'percent' ? fmtPercent(reportResult.totals![c.key]) : fmtNumber(reportResult.totals![c.key])}</span></div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {/* Standard report library — stays put while a report runs, so
                  nothing under a thumb moves; a tap starts that report instead. */}
              {(
                <Card title={pageState === 'results' ? 'Run Another Report' : 'Standard Reports'} subtitle="One tap each — Sage runs the report with the project and period above.">
                  <div className="rpGrid">
                    {STANDARD_REPORTS.map(r => (
                      <button key={r.id} type="button" className="rpCard" onClick={() => handleCardClick(r.query)}>
                        <div className="rpCardIcon"><r.icon size={18} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="rpCardTitle">{r.title}</div>
                          <div className="rpCardDesc">{r.desc}</div>
                          {REPORT_ANSWERS[r.id] && <div className="rpCardAsk">Answers: {REPORT_ANSWERS[r.id]}</div>}
                        </div>
                        <ArrowRight size={16} style={{ color: 'var(--text-tertiary)', alignSelf: 'center', flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            {/* Recent runs rail */}
            {history.length > 0 && (
              <aside className="rpRail" aria-label="Recent reports">
                <Card title="Recent Reports" subtitle="This session — tap to rerun with the same project and period." actions={<Button variant="ghost" size="sm" onClick={() => setHistory([])}>Clear</Button>}>
                  <div className="rpStack">
                    {history.map((item, i) => (
                      <button
                        key={i}
                        type="button"
                        className="rpHist"
                        onClick={() => {
                          setSageQuery(item.query);
                          setProjectFilter(item.projectId);
                          setDateRange(item.range || '');
                          // Pass overrides so the rerun uses the STORED project + range
                          // now - the state setters above only land next render.
                          runSageReport(item.query, { projectId: item.projectId, range: item.range || '' });
                        }}
                      >
                        <div className="rpHistTitle">{item.title}</div>
                        <div className="rpHistSub">{timeAgo(item.ts)}{item.range ? ` · ${item.range}` : ''}{item.projectId ? ` · ${projects.find(p => p.id === item.projectId)?.name || 'one project'}` : ''}</div>
                      </button>
                    ))}
                  </div>
                </Card>
              </aside>
            )}
          </div>
        </div>
      </PageShell>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
