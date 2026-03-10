'use client';
import React, { useState } from 'react';
const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';
export default function ReportsPage() {
  const reports = [
    {icon:'💰',title:'Job Cost Report',desc:'Budget vs actuals by cost code, variance analysis',action:'Generate'},
    {icon:'📈',title:'Bid Win/Loss Summary',desc:'Win rate by trade, margin analysis, competitor comparison',action:'Generate'},
    {icon:'📅',title:'Schedule Variance Report',desc:'Critical path delays, milestone status, float analysis',action:'Generate'},
    {icon:'🧾',title:'Pay Application Status',desc:'All pay apps — billed, certified, paid, retainage held',action:'Generate'},
    {icon:'🔏',title:'Lien Waiver Log',desc:'All conditional and unconditional waivers by project and sub',action:'Generate'},
    {icon:'🛡️',title:'Insurance Compliance Report',desc:'COI status, expiry dates, deficiencies by subcontractor',action:'Generate'},
    {icon:'⚠️',title:'Autopilot Alert History',desc:'All AI alerts — open, acknowledged, resolved by project',action:'Generate'},
    {icon:'📋',title:'RFI Log',desc:'All RFIs with status, cost/schedule impact, response times',action:'Generate'},
  ];
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
              <div style={{fontSize:12,color:DIM,lineHeight:1.5,marginBottom:14}}>{r.desc}</div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>alert(`Generating ${r.title}...\n\nIn production this exports a PDF/CSV with real project data.`)} style={{padding:'6px 14px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:6,color:'#0d1117',fontSize:12,fontWeight:700,cursor:'pointer'}}>📄 {r.action}</button>
                <button style={{padding:'6px 12px',background:'none',border:`1px solid ${BORDER}`,borderRadius:6,color:DIM,fontSize:12,cursor:'pointer'}}>CSV</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
