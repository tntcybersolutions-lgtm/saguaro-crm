'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── Color palette ──────────────────────────────────────────────
const GOLD   = '#D4A017';
const DARK   = '#0d1117';
const RAISED = 'rgba(255,255,255,0.04)';
const BORDER = 'rgba(255,255,255,0.08)';
const DIM    = '#8fa3c0';
const TEXT   = '#e8edf8';
const GREEN  = '#22C55E';
const YELLOW = '#F59E0B';
const RED    = '#EF4444';
const BLUE   = '#3B82F6';

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
  title: string;
  ts: number;
}

// ── Standard report card definitions ──────────────────────────
const STANDARD_REPORTS = [
  { id: 'pay-app',      title: 'Pay App Status',          icon: '💰', desc: 'Pay applications with amounts and status',        query: 'Show all pay applications with amounts and status' },
  { id: 'job-cost',     title: 'Job Cost Report',         icon: '📊', desc: 'Budget vs actual variance by cost code',          query: 'Job cost breakdown by cost code with budget vs actual variance' },
  { id: 'rfi-log',      title: 'RFI Log',                 icon: '📋', desc: 'All RFIs with status, due dates, and impact',     query: 'All RFIs with status, due dates, and cost/schedule impact' },
  { id: 'change-order', title: 'Change Order Log',        icon: '🔄', desc: 'Change orders with approval and cost impact',     query: 'All change orders with approval status and cost impact' },
  { id: 'lien-waiver',  title: 'Lien Waiver Log',         icon: '🔏', desc: 'Lien waivers by subcontractor with status',       query: 'All lien waivers by subcontractor with status' },
  { id: 'insurance',    title: 'Insurance Compliance',    icon: '🛡️', desc: 'COI status and expiry dates by sub',              query: 'Insurance certificates by subcontractor with expiry dates' },
  { id: 'daily-log',    title: 'Daily Log Summary',       icon: '📅', desc: 'Last 30 days with crew counts and delays',        query: 'Daily logs for the last 30 days with crew counts and delays' },
  { id: 'punch-list',   title: 'Punch List Report',       icon: '✅', desc: 'Open and in-progress items by trade',             query: 'All open and in-progress punch list items by trade' },
  { id: 'sub-perf',     title: 'Subcontractor Performance', icon: '👷', desc: 'Contract amounts and current status',          query: 'Subcontractor list with contract amounts and status' },
  { id: 'safety',       title: 'Safety Incidents',        icon: '⚠️', desc: 'Incidents by type and severity',                 query: 'Safety incidents by type and severity' },
  { id: 'bid-pkg',      title: 'Bid Package Summary',     icon: '📦', desc: 'Bid packages with trade, due date, and status',  query: 'All bid packages with trade, due date, and status' },
  { id: 'timesheet',    title: 'Timesheet Report',        icon: '🕒', desc: 'Weekly summary with regular and overtime hours', query: 'Weekly timesheet summary with regular and overtime hours' },
] as const;

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
  let bg = 'rgba(255,255,255,0.1)';
  let color = 'rgba(255,255,255,0.6)';
  if (['active', 'approved', 'complete', 'completed', 'paid', 'closed-won'].some(k => s.includes(k))) {
    bg = 'rgba(34,197,94,0.15)'; color = GREEN;
  } else if (['pending', 'submitted', 'in progress', 'in-progress', 'open', 'review'].some(k => s.includes(k))) {
    bg = 'rgba(245,158,11,0.15)'; color = YELLOW;
  } else if (['overdue', 'expired', 'rejected', 'void', 'failed', 'critical'].some(k => s.includes(k))) {
    bg = 'rgba(239,68,68,0.15)'; color = RED;
  } else if (['draft', 'closed', 'cancelled', 'canceled', 'inactive'].some(k => s.includes(k))) {
    bg = 'rgba(255,255,255,0.06)'; color = DIM;
  } else if (['info', 'new', 'assigned'].some(k => s.includes(k))) {
    bg = 'rgba(59,130,246,0.15)'; color = BLUE;
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

  const runSageReport = useCallback((queryOverride?: string) => {
    const q = (queryOverride ?? sageQuery).trim();
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    setPageState('loading');
    setProgress({ step: 0, pct: 5, message: 'Connecting to Sage...' });
    setReportResult(null);

    const params = new URLSearchParams({ q });
    if (projectFilter) params.set('projectId', projectFilter);

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
            const item: HistoryItem = { query: q, projectId: projectFilter, title: result.title, ts: Date.now() };
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
  }, [sageQuery, projectFilter, showError]);

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
    const q = `Show me ${chip.toLowerCase()} for all projects`;
    setSageQuery(q);
    runSageReport(q);
  };

  // ── Export functions ─────────────────────────────────────────
  const exportCSV = () => {
    if (!reportResult) return;
    const headers = reportResult.columns.map(c => c.label).join(',');
    const rows = reportResult.rows.map(row =>
      reportResult.columns.map(col => {
        const v = row[col.key];
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')
    ).join('\n');
    const csv = headers + '\n' + rows;
    downloadBlob(new Blob([csv], { type: 'text/csv' }), `${reportResult.title.replace(/\s+/g, '-')}-${today()}.csv`);
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

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto', color: TEXT }}>

      {/* ── Page Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: DIM, marginBottom: 6 }}>
          Analytics
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: TEXT, margin: '0 0 6px 0', lineHeight: 1.1 }}>
          Reports & Analytics
        </h1>
        <div style={{ fontSize: 14, color: DIM }}>
          Ask Sage to generate any report, or pick from the standard library below.
        </div>
      </div>

      {/* ── Sage Chat Bar ── */}
      <div style={{
        background: RAISED,
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        padding: '16px 20px',
        marginBottom: 16,
      }}>
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
              background: 'rgba(255,255,255,0.05)',
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
                background: 'rgba(255,255,255,0.05)',
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
                ? 'rgba(212,160,23,0.3)'
                : `linear-gradient(135deg, ${GOLD}, #F0C040)`,
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
                background: hoveredChip === chip ? `${GOLD}22` : 'rgba(255,255,255,0.05)',
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
      </div>

      {/* ── Main Content Area ── */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── Left/Main Column ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Loading / Progress state */}
          {pageState === 'loading' && (
            <div style={{
              background: RAISED,
              border: `1px solid ${BORDER}`,
              borderRadius: 14,
              padding: '40px 32px',
              textAlign: 'center',
              marginBottom: 20,
            }}>
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
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 8,
                height: 8,
                overflow: 'hidden',
                maxWidth: 420,
                margin: '0 auto',
              }}>
                <div style={{
                  height: '100%',
                  width: `${progress.pct}%`,
                  background: `linear-gradient(90deg, ${GOLD}, #F0C040)`,
                  borderRadius: 8,
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ fontSize: 12, color: DIM, marginTop: 10 }}>
                {progress.pct}% complete
              </div>
            </div>
          )}

          {/* Results table */}
          {pageState === 'results' && reportResult && (
            <div style={{
              background: RAISED,
              border: `1px solid ${BORDER}`,
              borderRadius: 14,
              overflow: 'hidden',
              marginBottom: 20,
            }}>
              {/* Results header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${BORDER}`,
                background: 'rgba(0,0,0,0.25)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: 12,
              }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: TEXT, marginBottom: 4 }}>
                    {reportResult.title}
                  </div>
                  <div style={{ fontSize: 13, color: DIM }}>{reportResult.description}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <span style={{
                      background: 'rgba(59,130,246,0.15)', color: BLUE,
                      border: '1px solid rgba(59,130,246,0.3)',
                      borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                    }}>
                      {reportResult.rowCount.toLocaleString()} rows
                    </span>
                    <span style={{ fontSize: 11, color: DIM }}>
                      Generated {fmtDate(reportResult.generatedAt)}
                    </span>
                  </div>
                </div>

                {/* Export + Close */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <button
                    onClick={exportCSV}
                    style={{ padding: '7px 14px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    CSV
                  </button>
                  <button
                    onClick={exportXLS}
                    style={{ padding: '7px 14px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Excel
                  </button>
                  <button
                    onClick={exportPDF}
                    style={{ padding: '7px 14px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    PDF
                  </button>
                  <button
                    onClick={() => { setPageState('idle'); setReportResult(null); }}
                    style={{ padding: '7px 12px', background: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, fontSize: 18, lineHeight: 1, cursor: 'pointer', fontWeight: 300 }}
                  >
                    ×
                  </button>
                </div>
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
                          <td
                            colSpan={reportResult.columns.length}
                            style={{ padding: '40px', textAlign: 'center', color: DIM, fontSize: 13 }}
                          >
                            No data found for this report.
                          </td>
                        </tr>
                      ) : (
                        displayRows.map((row, ri) => (
                          <tr
                            key={ri}
                            style={{
                              background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
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
            </div>
          )}

          {/* Standard Report Cards grid (shown when idle or results) */}
          {(pageState === 'idle' || pageState === 'results') && (
            <div>
              {pageState === 'idle' && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: DIM, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Standard Reports
                  </div>
                  <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
                    Click any card to run it instantly with Sage.
                  </div>
                </div>
              )}
              {pageState === 'results' && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: DIM, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Run Another Report
                  </div>
                </div>
              )}
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
                      background: hoveredCard === r.id ? `${GOLD}22` : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${hoveredCard === r.id ? GOLD + '44' : BORDER}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 17, flexShrink: 0,
                      transition: 'all .15s',
                    }}>
                      {r.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: TEXT, marginBottom: 3 }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5 }}>{r.desc}</div>
                    </div>
                    {hoveredCard === r.id && (
                      <div style={{ color: GOLD, fontSize: 16, alignSelf: 'center', flexShrink: 0, marginLeft: 4 }}>
                        →
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Sidebar: History ── */}
        {history.length > 0 && (
          <div style={{
            width: 240,
            flexShrink: 0,
            background: RAISED,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: DIM, marginBottom: 12 }}>
              Recent Reports
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((item, i) => (
                <div
                  key={i}
                  onClick={() => {
                    setSageQuery(item.query);
                    setProjectFilter(item.projectId);
                    runSageReport(item.query);
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
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
              style={{ marginTop: 12, width: '100%', padding: '6px', background: 'none', border: `1px solid ${BORDER}`, borderRadius: 7, color: DIM, fontSize: 11, cursor: 'pointer' }}
            >
              Clear History
            </button>
          </div>
        )}
      </div>

      {/* ── Toast notification ── */}
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
    </div>
  );
}
