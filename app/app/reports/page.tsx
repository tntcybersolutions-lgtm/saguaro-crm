'use client';
import React, { useState } from 'react';
const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#3dd68c';

interface ReportResult {
  message: string;
  reportType: string;
  format: string;
  title: string;
  columns: string[];
  rows: string[][];
  totals?: Record<string, number | string>;
  source?: string;
}

const REPORT_DEFS = [
  {icon:'💰',title:'Job Cost Report',desc:'Budget vs actuals by cost code, variance analysis',key:'job-cost'},
  {icon:'📈',title:'Bid Win/Loss Summary',desc:'Win rate by trade, margin analysis, competitor comparison',key:'bid-win-loss'},
  {icon:'📅',title:'Schedule Variance Report',desc:'Critical path delays, milestone status, float analysis',key:'schedule-variance'},
  {icon:'🧾',title:'Pay Application Status',desc:'All pay apps — billed, certified, paid, retainage held',key:'pay-app-status'},
  {icon:'🔏',title:'Lien Waiver Log',desc:'All conditional and unconditional waivers by project and sub',key:'lien-waiver-log'},
  {icon:'🛡️',title:'Insurance Compliance',desc:'COI status, expiry dates, deficiencies by subcontractor',key:'insurance-compliance'},
  {icon:'⚠️',title:'Autopilot Alert History',desc:'All AI alerts — open, acknowledged, resolved by project',key:'autopilot-alerts'},
  {icon:'📋',title:'RFI Log',desc:'All RFIs with status, cost/schedule impact, response times',key:'rfi-log'},
];

function downloadCSV(result: ReportResult) {
  const header = result.columns.join(',');
  const rows = result.rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const csv = `${header}\n${rows}`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${result.reportType}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [generating, setGenerating] = useState<string|null>(null);
  const [results, setResults] = useState<Record<string, ReportResult>>({});
  const [activeReport, setActiveReport] = useState<string|null>(null);
  const [error, setError] = useState<string|null>(null);

  async function generate(key: string, format: 'pdf'|'csv') {
    setGenerating(key+'-'+format);
    setError(null);
    try {
      const r = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: key, format }),
      });
      if (!r.ok) throw new Error('Report generation failed');
      const d: ReportResult = await r.json();
      setResults(prev => ({ ...prev, [key]: d }));
      if (format === 'csv') {
        downloadCSV(d);
      } else {
        setActiveReport(key);
      }
    } catch {
      setError('Failed to generate report. Please try again.');
    } finally {
      setGenerating(null);
    }
  }

  const activeResult = activeReport ? results[activeReport] : null;

  return (
    <div style={{padding:'24px 28px',maxWidth:1300,margin:'0 auto'}}>
      <div style={{marginBottom:28,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:'uppercase',color:DIM}}>Analytics</div>
          <h1 style={{fontSize:26,fontWeight:800,color:TEXT,margin:'4px 0'}}>Reports</h1>
          <div style={{fontSize:13,color:DIM,marginTop:2}}>Generate and export project and portfolio reports</div>
        </div>
        {activeResult && (
          <button
            onClick={() => downloadCSV(activeResult)}
            style={{padding:'9px 18px',background:'none',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:13,fontWeight:700,cursor:'pointer'}}
          >
            ⬇ Download CSV
          </button>
        )}
      </div>

      {error && (
        <div style={{background:'rgba(192,48,48,.1)',border:'1px solid rgba(192,48,48,.3)',borderRadius:8,padding:'12px 16px',marginBottom:20,color:'#ff7070',fontSize:13}}>
          {error}
        </div>
      )}

      {/* Report cards grid */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14,marginBottom:28}}>
        {REPORT_DEFS.map(r=>(
          <div
            key={r.key}
            style={{
              background: activeReport === r.key ? 'rgba(212,160,23,.06)' : RAISED,
              border: `1px solid ${activeReport === r.key ? 'rgba(212,160,23,.4)' : BORDER}`,
              borderRadius:10,padding:18,display:'flex',alignItems:'flex-start',gap:14,
              transition:'border-color .15s',
            }}
          >
            <div style={{width:40,height:40,borderRadius:9,background:'rgba(212,160,23,.1)',border:'1px solid rgba(212,160,23,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>{r.icon}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,color:TEXT,fontSize:13,marginBottom:4}}>{r.title}</div>
              <div style={{fontSize:11,color:DIM,lineHeight:1.5,marginBottom:10}}>{r.desc}</div>
              {results[r.key] && (
                <div style={{fontSize:11,color:GREEN,background:'rgba(26,138,74,.08)',borderRadius:5,padding:'4px 8px',marginBottom:8}}>
                  ✓ {results[r.key].message}
                </div>
              )}
              <div style={{display:'flex',gap:8}}>
                <button
                  onClick={()=>generate(r.key,'pdf')}
                  disabled={generating===r.key+'-pdf'||generating===r.key+'-csv'}
                  style={{padding:'5px 12px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:6,color:'#0d1117',fontSize:11,fontWeight:700,cursor:'pointer',opacity:generating ? 0.7 : 1}}
                >
                  {generating===r.key+'-pdf'?'Generating...':'Run Report'}
                </button>
                <button
                  onClick={()=>generate(r.key,'csv')}
                  disabled={generating===r.key+'-pdf'||generating===r.key+'-csv'}
                  style={{padding:'5px 10px',background:'none',border:`1px solid ${BORDER}`,borderRadius:6,color:DIM,fontSize:11,cursor:'pointer',opacity:generating ? 0.7 : 1}}
                >
                  {generating===r.key+'-csv'?'…':'CSV'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Report results table */}
      {activeResult && (
        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
          <div style={{padding:'14px 20px',borderBottom:`1px solid ${BORDER}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:'rgba(0,0,0,.2)'}}>
            <div>
              <div style={{fontWeight:800,fontSize:15,color:TEXT}}>{activeResult.title}</div>
              <div style={{fontSize:11,color:DIM,marginTop:2}}>{activeResult.message}</div>
            </div>
            <button onClick={()=>setActiveReport(null)} style={{background:'none',border:'none',color:DIM,cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{background:DARK}}>
                  {activeResult.columns.map(col=>(
                    <th key={col} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`,whiteSpace:'nowrap'}}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeResult.rows.map((row, ri)=>(
                  <tr key={ri} style={{borderBottom:`1px solid rgba(38,51,71,.5)`}}>
                    {row.map((cell, ci)=>(
                      <td key={ci} style={{padding:'10px 14px',color:ci===0?TEXT:DIM,fontWeight:ci===0?600:400,whiteSpace:'nowrap'}}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {activeResult.totals && (
                <tfoot>
                  <tr style={{background:'rgba(212,160,23,.06)',borderTop:`2px solid ${BORDER}`}}>
                    <td style={{padding:'10px 14px',fontWeight:800,color:TEXT}}>TOTALS</td>
                    {activeResult.columns.slice(1).map((col, i)=>{
                      const key = Object.keys(activeResult.totals!)[i];
                      const val = key ? activeResult.totals![key] : '';
                      return (
                        <td key={col} style={{padding:'10px 14px',fontWeight:700,color:GOLD}}>
                          {typeof val === 'number' ? `$${val.toLocaleString()}` : val}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {activeResult.rows.length === 0 && (
            <div style={{padding:40,textAlign:'center',color:DIM,fontSize:13}}>
              No data found for this report period.
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!activeReport && (
        <div style={{textAlign:'center',padding:'40px 0',color:DIM,fontSize:13}}>
          Click <strong style={{color:GOLD}}>Run Report</strong> on any card above to view the data below.
        </div>
      )}
    </div>
  );
}
