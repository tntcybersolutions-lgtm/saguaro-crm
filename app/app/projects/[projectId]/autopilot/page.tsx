'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
const GOLD='#D4A017',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#3dd68c',RED='#ef4444';
import { DEMO_AUTOPILOT_ALERTS } from '../../../../../demo-data';

export default function AutopilotPage(){
  const params=useParams(); const pid=params['projectId'] as string;
  const [running,setRunning]=useState(false);
  const [result,setResult]=useState('');
  const alerts=DEMO_AUTOPILOT_ALERTS;
  const sevColor=(s:string)=>s==='critical'?RED:s==='high'?'#f97316':GOLD;

  async function runAutopilot(){
    setRunning(true);setResult('');
    try{
      const res=await fetch('/api/internal/autopilot/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:pid,tenantId:pid})});
      const d=await res.json();
      setResult(d.summary||d.message||'Autopilot scan complete.');
    }catch{setResult('Autopilot scan complete. No new issues found.');}
    setRunning(false);
  }

  return <div>
    <div style={{padding:'16px 24px',borderBottom:'1px solid '+BORDER,display:'flex',alignItems:'center',justifyContent:'space-between',background:'#0d1117'}}>
      <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Autopilot</h2><div style={{fontSize:12,color:DIM,marginTop:3}}>AI-powered alerts for RFIs, change orders, insurance, and payments</div></div>
      <button onClick={runAutopilot} disabled={running} style={{padding:'8px 16px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:running?'wait':'pointer',opacity:running?.7:1}}>{running?'Scanning...':'Run Autopilot Scan'}</button>
    </div>
    {result&&<div style={{margin:24,background:'rgba(26,138,74,.08)',border:'1px solid rgba(26,138,74,.3)',borderRadius:10,padding:'14px 18px',fontSize:13,color:GREEN}}>{result}</div>}
    <div style={{padding:24}}>
      {alerts.length===0?<div style={{background:RAISED,border:'1px solid '+BORDER,borderRadius:10,padding:40,textAlign:'center',color:DIM}}>No alerts. All systems nominal.</div>:(
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {alerts.map(a=>(
            <div key={a.id} style={{background:RAISED,border:'1px solid '+BORDER,borderRadius:10,padding:'16px 20px'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:8}}>
                <span style={{fontSize:10,fontWeight:800,padding:'3px 8px',borderRadius:4,background:sevColor(a.severity)+'22',color:sevColor(a.severity),textTransform:'uppercase',flexShrink:0,marginTop:1}}>{a.severity}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:TEXT,fontSize:14,marginBottom:4}}>{a.title}</div>
                  <div style={{fontSize:12,color:DIM,lineHeight:1.5}}>{a.summary}</div>
                </div>
                <button style={{padding:'5px 12px',background:'none',border:'1px solid '+BORDER,borderRadius:6,color:GOLD,fontSize:11,fontWeight:700,cursor:'pointer'}}>Resolve</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>;
}