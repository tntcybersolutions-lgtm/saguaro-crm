'use client';
import React, { useState } from 'react';
import { humanError } from '@/lib/errors';
import MarketingNav from '@/components/MarketingNav';
import { CurrencyDollar, TrendUp, CalendarBlank, Receipt, FileLock, ShieldCheck, Warning, ClipboardText, ArrowsClockwise, HardHat, Hourglass, FilePdf, DownloadSimple } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

const GOLD='var(--brand-primary)',DIM='var(--text-secondary)',TEXT='#FFFFFF',HAIR='rgba(255,255,255,0.08)';

const REPORTS: { icon: Icon; title: string; desc: string; reportType: string }[] = [
  { icon:CurrencyDollar, title:'Job Cost Report',          desc:'Budget vs actuals by cost code, variance analysis',              reportType:'job-cost' },
  { icon:TrendUp, title:'Bid Win/Loss Summary',      desc:'Win rate by trade, margin analysis, competitor comparison',      reportType:'bid-win-loss' },
  { icon:CalendarBlank, title:'Schedule Variance Report',  desc:'Critical path delays, milestone status, float analysis',        reportType:'schedule-variance' },
  { icon:Receipt, title:'Pay Application Status',    desc:'All pay apps — billed, certified, paid, retainage held',        reportType:'pay-app-status' },
  { icon:FileLock, title:'Lien Waiver Log',           desc:'All conditional and unconditional waivers by project and sub',  reportType:'lien-waiver-log' },
  { icon:ShieldCheck, title:'Insurance Compliance',     desc:'COI status, expiry dates, deficiencies by subcontractor',      reportType:'insurance-compliance' },
  { icon:Warning, title:'Autopilot Alert History',  desc:'All AI alerts — open, acknowledged, resolved by project',      reportType:'autopilot-alerts' },
  { icon:ClipboardText, title:'RFI Log',                   desc:'All RFIs with status, cost/schedule impact, response times',    reportType:'rfi-log' },
  { icon:ArrowsClockwise, title:'Change Order Log',          desc:'All change orders — status, cost impact, schedule impact',      reportType:'change-order-log' },
  { icon:HardHat, title:'Sub Compliance',           desc:'W-9, insurance, license status by subcontractor',              reportType:'sub-compliance' },
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
      console.error(err); showToast(humanError(err, 'Download failed. Please try again.'), 'error');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mkt-page" style={{ padding: '24px 28px 96px', maxWidth: 1200, margin: '0 auto' }}>
      <MarketingNav />
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ margin: '48px 0 32px' }}>
        <h1 style={{ fontWeight: 600, color: TEXT, margin: 0, letterSpacing: -0.4 }}>Reports</h1>
        <div style={{ fontSize: 14, color: DIM, marginTop: 8 }}>Generate and download live project and portfolio reports — PDF or CSV.</div>
      </div>

      <div style={{ borderTop: `1px solid ${HAIR}` }}>
        {REPORTS.map(r => {
          const pdfBusy = loading === `${r.reportType}-pdf`;
          const csvBusy = loading === `${r.reportType}-csv`;
          const busy = pdfBusy || csvBusy;
          return (
            <div key={r.reportType} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 0', borderBottom: `1px solid ${HAIR}` }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <r.icon size={20} weight="duotone" color={GOLD} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: TEXT, fontSize: 14, marginBottom: 3 }}>{r.title}</div>
                <div style={{ fontSize: 12.5, color: DIM, lineHeight: 1.5 }}>{r.desc}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => downloadReport(r.reportType, r.title, 'pdf')}
                  disabled={busy}
                  style={{ padding: '7px 14px', background: GOLD, border: 'none', borderRadius: 8, color: '#0A0A00', fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1, minWidth: 118 }}
                >
                  {pdfBusy ? <><Hourglass size={13} weight="duotone" style={{ verticalAlign: -2 }} /> Generating…</> : <><FilePdf size={13} weight="duotone" style={{ verticalAlign: -2 }} /> Download PDF</>}
                </button>
                <button
                  onClick={() => downloadReport(r.reportType, r.title, 'csv')}
                  disabled={busy}
                  style={{ padding: '7px 12px', background: 'transparent', border: `1px solid ${HAIR}`, borderRadius: 8, color: csvBusy ? TEXT : DIM, fontSize: 12, fontWeight: 500, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}
                >
                  {csvBusy ? <><Hourglass size={13} weight="duotone" style={{ verticalAlign: -2 }} />…</> : <><DownloadSimple size={13} weight="duotone" style={{ verticalAlign: -2 }} /> CSV</>}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 99999, padding: '12px 22px', borderRadius: 8, background: toast.type === 'success' ? 'rgba(44,255,122,0.92)' : 'rgba(255,59,48,0.92)', color: '#fff', fontWeight: 600, fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,.4)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
