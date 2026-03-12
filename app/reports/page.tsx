'use client';
import React, { useState } from 'react';

const GOLD='#D4A017',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';

const REPORTS = [
  { icon:'💰', title:'Job Cost Report',          desc:'Budget vs actuals by cost code, variance analysis',              reportType:'job-cost' },
  { icon:'📈', title:'Bid Win/Loss Summary',      desc:'Win rate by trade, margin analysis, competitor comparison',      reportType:'bid-win-loss' },
  { icon:'📅', title:'Schedule Variance Report',  desc:'Critical path delays, milestone status, float analysis',        reportType:'schedule-variance' },
  { icon:'🧾', title:'Pay Application Status',    desc:'All pay apps — billed, certified, paid, retainage held',        reportType:'pay-app-status' },
  { icon:'🔏', title:'Lien Waiver Log',           desc:'All conditional and unconditional waivers by project and sub',  reportType:'lien-waiver-log' },
  { icon:'🛡️', title:'Insurance Compliance',     desc:'COI status, expiry dates, deficiencies by subcontractor',      reportType:'insurance-compliance' },
  { icon:'⚠️', title:'Autopilot Alert History',  desc:'All AI alerts — open, acknowledged, resolved by project',      reportType:'autopilot-alerts' },
  { icon:'📋', title:'RFI Log',                   desc:'All RFIs with status, cost/schedule impact, response times',    reportType:'rfi-log' },
  { icon:'🔄', title:'Change Order Log',          desc:'All change orders — status, cost impact, schedule impact',      reportType:'change-order-log' },
  { icon:'🏗️', title:'Sub Compliance',           desc:'W-9, insurance, license status by subcontractor',              reportType:'sub-compliance' },
];

type Toast = { msg: string; type: 'success' | 'error' } | null;

export default function ReportsPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  }

  async function downloadReport(reportType: string, title: string, format: 'pdf' | 'csv') {
    const key = `${reportType}-${format}`;
    setLoading(key);
    try {
      // 1. Generate report data from live DB
      const genRes = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType, format }),
      });
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({ error: 'Generation failed' }));
        throw new Error((err as any).error || 'Report generation failed');
      }
      const genData = await genRes.json() as any;

      // 2. Export to downloadable file
      const exportRes = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: reportType,
          title: genData.title || title,
          columns: genData.columns || [],
          rows: genData.rows || [],
          format,
        }),
      });
      if (!exportRes.ok) throw new Error('Export failed');

      // 3. Trigger browser download
      const blob = await exportRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const count = (genData.rows || []).length;
      showToast(`${title} — ${count} record${count !== 1 ? 's' : ''} downloaded`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Download failed', 'error');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: TEXT, margin: 0 }}>Reports</h1>
        <div style={{ fontSize: 13, color: DIM, marginTop: 4 }}>Generate and download live project and portfolio reports — PDF or CSV</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16 }}>
        {REPORTS.map(r => {
          const pdfBusy = loading === `${r.reportType}-pdf`;
          const csvBusy = loading === `${r.reportType}-csv`;
          const busy = pdfBusy || csvBusy;
          return (
            <div key={r.reportType} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 22, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                {r.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: TEXT, fontSize: 14, marginBottom: 5 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5, marginBottom: 14 }}>{r.desc}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => downloadReport(r.reportType, r.title, 'pdf')}
                    disabled={busy}
                    style={{ padding: '6px 14px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 6, color: '#0d1117', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1, minWidth: 110 }}
                  >
                    {pdfBusy ? '⏳ Generating...' : '📄 Download PDF'}
                  </button>
                  <button
                    onClick={() => downloadReport(r.reportType, r.title, 'csv')}
                    disabled={busy}
                    style={{ padding: '6px 12px', background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: csvBusy ? GOLD : DIM, fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}
                  >
                    {csvBusy ? '⏳...' : '⬇ CSV'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 99999, padding: '12px 22px', borderRadius: 8, background: toast.type === 'success' ? 'rgba(34,197,94,0.92)' : 'rgba(239,68,68,0.92)', color: '#fff', fontWeight: 600, fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,.4)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
