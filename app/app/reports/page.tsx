'use client';
import React, { useState } from 'react';
const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';

const reports = [
  {icon:'💰',title:'Job Cost Report',desc:'Budget vs actuals by cost code, variance analysis',key:'job-cost'},
  {icon:'📈',title:'Bid Win/Loss Summary',desc:'Win rate by trade, margin analysis, competitor comparison',key:'bid-win-loss'},
  {icon:'📅',title:'Schedule Variance Report',desc:'Critical path delays, milestone status, float analysis',key:'schedule-variance'},
  {icon:'🧾',title:'Pay Application Status',desc:'All pay apps — billed, certified, paid, retainage held',key:'pay-app-status'},
  {icon:'🔏',title:'Lien Waiver Log',desc:'All conditional and unconditional waivers by project and sub',key:'lien-waiver-log'},
  {icon:'🛡️',title:'Insurance Compliance Report',desc:'COI status, expiry dates, deficiencies by subcontractor',key:'insurance-compliance'},
  {icon:'⚠️',title:'Autopilot Alert History',desc:'All AI alerts — open, acknowledged, resolved by project',key:'autopilot-alerts'},
  {icon:'📋',title:'RFI Log',desc:'All RFIs with status, cost/schedule impact, response times',key:'rfi-log'},
];

export default function ReportsPage() {
  const [generating, setGenerating] = useState<string|null>(null);
  const [results, setResults] = useState<Record<string,string>>({});

  async function generate(key: string, format: 'pdf'|'csv') {
    setGenerating(key+'-'+format);
    try {
      const token = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('sb-access-token='))?.split('=')[1]||'';
      const r = await fetch('/api/reports/generate', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body: JSON.stringify({reportType:key, format})
      });
      const d = await r.json();
      setResults(prev=>({...prev,[key+'-'+format]:d.message||'Generated!'}));
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div style={{padding:'24px 28px',maxWidth:1200,margin:'0 auto'}}>
      <div style={{marginBottom:28}}>
        <h1 style={{fontSize:26,fontWeight:800,color:TEXT,margin:0}}>Reports</h1>
        <div style={{fontSize:13,color:DIM,marginTop:4}}>Generate and export project and portfolio reports</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:16}}>
        {reports.map(r=>(
          <div key={r.title} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:22,display:'flex',alignItems:'flex-start',gap:16}}>
            <div style={{width:44,height:44,borderRadius:10,background:'rgba(212,160,23,.1)',border:'1px solid rgba(212,160,23,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>{r.icon}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,color:TEXT,fontSize:14,marginBottom:5}}>{r.title}</div>
              <div style={{fontSize:12,color:DIM,lineHeight:1.5,marginBottom:results[r.key+'-pdf']||results[r.key+'-csv']?8:14}}>{r.desc}</div>
              {(results[r.key+'-pdf']||results[r.key+'-csv'])&&(
                <div style={{fontSize:11,color:'#3dd68c',background:'rgba(26,138,74,.08)',borderRadius:6,padding:'6px 10px',marginBottom:10}}>
                  ✓ {results[r.key+'-pdf']||results[r.key+'-csv']}
                </div>
              )}
              <div style={{display:'flex',gap:8}}>
                <button
                  onClick={()=>generate(r.key,'pdf')}
                  disabled={generating===r.key+'-pdf'}
                  style={{padding:'6px 14px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:6,color:'#0d1117',fontSize:12,fontWeight:700,cursor:'pointer',opacity:generating===r.key+'-pdf'?0.7:1}}
                >
                  {generating===r.key+'-pdf'?'Generating...':'📄 Generate'}
                </button>
                <button
                  onClick={()=>generate(r.key,'csv')}
                  disabled={generating===r.key+'-csv'}
                  style={{padding:'6px 12px',background:'none',border:`1px solid ${BORDER}`,borderRadius:6,color:DIM,fontSize:12,cursor:'pointer',opacity:generating===r.key+'-csv'?0.7:1}}
                >
                  {generating===r.key+'-csv'?'..':'CSV'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
