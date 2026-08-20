'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';

const GOLD = '#C8960F', DARK = '#0d1117', RAISED = '#161b22', BORDER = '#30363d';
const DIM = '#8B9DB8', TEXT = '#F0F4FF', GREEN = '#2ea043', RED = '#f85149', AMBER = '#e3b341';
const BLUE = '#3B82F6';

interface OwnerReport {
  id: string;
  report_number: number;
  period_from: string;
  period_to: string;
  report_date: string;
  status: string;
  executive_summary: string | null;
  schedule_status: string | null;
  schedule_narrative: string | null;
  budget_status: string | null;
  budget_narrative: string | null;
  work_completed_narrative: string | null;
  work_planned_narrative: string | null;
  issues_narrative: string | null;
  safety_narrative: string | null;
  metrics: any;
  sage_generated: boolean;
  distributed_at: string | null;
}

interface GenerateStage {
  stage: string;
  message: string;
  detail?: string;
  pct: number;
  done?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  draft: DIM, approved: BLUE, distributed: GREEN, archived: '#555',
};

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatWeek(from: string, to: string): string {
  const f = new Date(from + 'T12:00:00');
  const t = new Date(to + 'T12:00:00');
  return `${f.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export default function ReportsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [reports, setReports] = useState<OwnerReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [generateStages, setGenerateStages] = useState<GenerateStage[]>([]);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [generateResult, setGenerateResult] = useState<any>(null);
  const [generatePreview, setGeneratePreview] = useState('');
  const [showNewReport, setShowNewReport] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<OwnerReport | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const monday = getMonday(new Date(now));
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);

  const [newPeriod, setNewPeriod] = useState({
    from: monday.toISOString().split('T')[0],
    to: friday.toISOString().split('T')[0],
  });

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/owner-reports/${projectId}`);
      const data = await res.json();
      setReports(data.reports || []);
    } catch { /* handled */ } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setGenerateStages([]);
    setGenerateProgress(0);
    setGenerateResult(null);
    setGeneratePreview('');
    setShowNewReport(false);

    try {
      const res = await fetch(`/api/owner-reports/${projectId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_from: newPeriod.from, period_to: newPeriod.to }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.stage && data.stage !== 'preview') {
              setGenerateStages((prev) => [...prev, data]);
              setGenerateProgress(data.pct || 0);
            }
            if (data.stage === 'preview' && data.text) {
              setGeneratePreview(data.text);
              setGenerateProgress(data.pct || 0);
            }
            if (data.type === 'done') {
              setGenerateResult(data);
              setGenerateProgress(100);
              await fetchReports();
            }
            if (data.type === 'error') {
              setGenerateResult({ error: data.message });
            }
          } catch { /* skip */ }
        }
      }
    } finally { setGeneratingReport(false); }
  };

  const handleViewReport = async (reportId: string) => {
    if (selectedReport === reportId) {
      setSelectedReport(null);
      setExpandedReport(null);
      return;
    }
    setSelectedReport(reportId);
    try {
      const res = await fetch(`/api/owner-reports/${projectId}/${reportId}`);
      const data = await res.json();
      setExpandedReport(data.report);
    } catch { /* handled */ }
  };

  const handleDistribute = async (reportId: string) => {
    await fetch(`/api/owner-reports/${projectId}/${reportId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'distribute' }),
    });
    await fetchReports();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', background: DARK, border: `1px solid ${BORDER}`,
    borderRadius: 6, color: TEXT, fontSize: 14, outline: 'none',
  };
  const labelStyle: React.CSSProperties = { color: DIM, fontSize: 12, marginBottom: 4, display: 'block' };

  const sectionStyle: React.CSSProperties = {
    marginBottom: 16, padding: '12px 16px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8,
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ color: TEXT, fontSize: 24, margin: 0 }}>Owner Reports</h1>
        <button onClick={() => setShowNewReport(true)} disabled={generatingReport}
          style={{ padding: '8px 16px', background: GOLD, color: '#000', border: 'none',
            borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          + New Report
        </button>
      </div>

      {/* GENERATE PANEL */}
      {(generatingReport || generateResult) && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10,
          padding: 24, marginBottom: 24 }}>
          <div style={{ color: GOLD, fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            {generateResult ? 'Report Generated' : 'Generating Weekly Report...'}
          </div>

          {/* Progress bar */}
          <div style={{ height: 6, borderRadius: 3, background: '#1c2128', marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: GOLD, borderRadius: 3,
              width: `${generateProgress}%`, transition: 'width 0.4s' }} />
          </div>

          {/* Stages */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {generateStages.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: GREEN, fontSize: 14 }}>✓</span>
                <span style={{ color: TEXT, fontSize: 13 }}>{s.message}</span>
                {s.detail && <span style={{ color: DIM, fontSize: 11, marginLeft: 'auto' }}>{s.detail}</span>}
              </div>
            ))}
            {generatingReport && !generateResult && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: GOLD, fontSize: 14, animation: 'spin 1s linear infinite' }}>◌</span>
                <span style={{ color: GOLD, fontSize: 13 }}>Processing...</span>
              </div>
            )}
          </div>

          {/* Preview */}
          {generatePreview && (
            <div ref={previewRef} style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: 16, maxHeight: 300, overflowY: 'auto', fontSize: 13, color: TEXT, lineHeight: 1.6,
              whiteSpace: 'pre-wrap' }}>
              {generatePreview}
            </div>
          )}

          {/* Result */}
          {generateResult && !generateResult.error && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: '#0d2818', border: `1px solid ${GREEN}`,
              borderRadius: 8, color: GREEN, fontSize: 13 }}>
              Report #{generateResult.report_id ? 'saved' : ''} successfully.
              {generateResult.executive_summary && (
                <div style={{ color: TEXT, marginTop: 8 }}>{generateResult.executive_summary}</div>
              )}
            </div>
          )}

          {generateResult?.error && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: '#2d0a0a', border: `1px solid ${RED}`,
              borderRadius: 8, color: RED, fontSize: 13 }}>
              {generateResult.error}
            </div>
          )}
        </div>
      )}

      {/* NEW REPORT MODAL */}
      {showNewReport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, width: 420 }}>
            <h2 style={{ color: GOLD, margin: '0 0 20px', fontSize: 18 }}>Generate Weekly Report</h2>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={labelStyle}>Period From (Monday)</label>
                <input value={newPeriod.from} onChange={(e) => setNewPeriod({ ...newPeriod, from: e.target.value })}
                  style={inputStyle} type="date" />
              </div>
              <div>
                <label style={labelStyle}>Period To (Friday)</label>
                <input value={newPeriod.to} onChange={(e) => setNewPeriod({ ...newPeriod, to: e.target.value })}
                  style={inputStyle} type="date" />
              </div>
              <div style={{ color: DIM, fontSize: 12, padding: '8px 12px', background: DARK,
                border: `1px solid ${BORDER}`, borderRadius: 6 }}>
                Sage AI will gather all project data for this period — daily logs, RFIs, submittals,
                budget, change orders, punch list — and write a professional 7-section owner report.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewReport(false)}
                style={{ padding: '10px 20px', background: 'transparent', border: `1px solid ${BORDER}`,
                  borderRadius: 6, color: DIM, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleGenerateReport} disabled={!newPeriod.from || !newPeriod.to}
                style={{ padding: '10px 24px', background: GOLD, color: '#000', border: 'none',
                  borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                Generate with Sage AI
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT LIST */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: GOLD }}>Loading reports...</div>
      ) : reports.length === 0 && !generatingReport ? (
        <div style={{ textAlign: 'center', padding: 48, color: DIM }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: 18, marginBottom: 8, color: TEXT }}>No owner reports yet</div>
          <div style={{ marginBottom: 24 }}>Generate your first weekly report with Sage AI.</div>
          <button onClick={() => setShowNewReport(true)}
            style={{ padding: '12px 24px', background: GOLD, color: '#000', border: 'none',
              borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            + Generate First Report
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reports.map((r) => (
            <div key={r.id}>
              <div style={{ background: RAISED, border: `1px solid ${selectedReport === r.id ? GOLD : BORDER}`,
                borderRadius: 8, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
                cursor: 'pointer' }} onClick={() => handleViewReport(r.id)}>
                <div style={{ fontSize: 18, fontWeight: 700, color: GOLD, minWidth: 60 }}>#{r.report_number}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: TEXT, fontSize: 13 }}>Week of {formatWeek(r.period_from, r.period_to)}</div>
                  {r.executive_summary && (
                    <div style={{ color: DIM, fontSize: 11, marginTop: 2, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>
                      {r.executive_summary}
                    </div>
                  )}
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                  color: '#fff', background: STATUS_COLORS[r.status] || DIM, textTransform: 'uppercase' }}>
                  {r.status}
                </span>
                {r.status === 'draft' && (
                  <button onClick={(e) => { e.stopPropagation(); handleDistribute(r.id); }}
                    style={{ padding: '6px 12px', background: BLUE, border: 'none',
                      borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    Distribute
                  </button>
                )}
                <span style={{ color: DIM, fontSize: 14 }}>{selectedReport === r.id ? '▼' : '▶'}</span>
              </div>

              {/* Expanded report view */}
              {selectedReport === r.id && expandedReport && (
                <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderTop: 'none',
                  borderRadius: '0 0 8px 8px', padding: 20 }}>
                  {expandedReport.executive_summary && (
                    <div style={sectionStyle}>
                      <div style={{ color: GOLD, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>Executive Summary</div>
                      <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.6 }}>{expandedReport.executive_summary}</div>
                    </div>
                  )}
                  {expandedReport.schedule_narrative && (
                    <div style={sectionStyle}>
                      <div style={{ color: GOLD, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>
                        Schedule — {expandedReport.schedule_status}
                      </div>
                      <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.6 }}>{expandedReport.schedule_narrative}</div>
                    </div>
                  )}
                  {expandedReport.budget_narrative && (
                    <div style={sectionStyle}>
                      <div style={{ color: GOLD, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>
                        Budget — {expandedReport.budget_status}
                      </div>
                      <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.6 }}>{expandedReport.budget_narrative}</div>
                    </div>
                  )}
                  {expandedReport.work_completed_narrative && (
                    <div style={sectionStyle}>
                      <div style={{ color: GOLD, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>Work Completed</div>
                      <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{expandedReport.work_completed_narrative}</div>
                    </div>
                  )}
                  {expandedReport.work_planned_narrative && (
                    <div style={sectionStyle}>
                      <div style={{ color: GOLD, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>Upcoming Work</div>
                      <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.6 }}>{expandedReport.work_planned_narrative}</div>
                    </div>
                  )}
                  {expandedReport.issues_narrative && (
                    <div style={sectionStyle}>
                      <div style={{ color: GOLD, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>Open Items</div>
                      <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.6 }}>{expandedReport.issues_narrative}</div>
                    </div>
                  )}
                  {expandedReport.safety_narrative && (
                    <div style={sectionStyle}>
                      <div style={{ color: GOLD, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>Safety</div>
                      <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.6 }}>{expandedReport.safety_narrative}</div>
                    </div>
                  )}

                  {/* Metrics */}
                  {expandedReport.metrics && Object.keys(expandedReport.metrics).length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      {Object.entries(expandedReport.metrics).map(([k, v]) => (
                        <div key={k} style={{ background: RAISED, border: `1px solid ${BORDER}`,
                          borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
                          <span style={{ color: DIM }}>{k.replace(/_/g, ' ')}: </span>
                          <span style={{ color: TEXT, fontWeight: 600 }}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
