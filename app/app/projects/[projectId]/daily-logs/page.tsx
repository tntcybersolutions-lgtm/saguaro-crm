'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DEMO_PROJECT, DEMO_SUBS, DEMO_PAY_APPS, DEMO_RFIS, DEMO_CHANGE_ORDERS, DEMO_BUDGET_LINES, DEMO_AUTOPILOT_ALERTS, DEMO_CONTEXT } from '../../../../../demo-data';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030',BLUE='#1a5fa8';
const fmt = (n:number) => '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function Badge({label,color='#94a3b8',bg='rgba(148,163,184,.12)'}:{label:string,color?:string,bg?:string}){
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:bg,color,textTransform:'uppercase' as const,letterSpacing:.3}}>{label}</span>;
}
function Card({title,children,action}:{title:string,children:React.ReactNode,action?:React.ReactNode}){
  return <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden',marginBottom:18}}>
    <div style={{padding:'12px 18px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <span style={{fontWeight:700,fontSize:14,color:TEXT}}>{title}</span>
      {action}
    </div>
    <div style={{padding:18}}>{children}</div>
  </div>;
}
function PageHeader({title,sub,actions}:{title:string,sub?:string,actions?:React.ReactNode}){
  return <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:DARK}}>
    <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>{title}</h2>{sub&&<div style={{fontSize:12,color:DIM,marginTop:3}}>{sub}</div>}</div>
    {actions&&<div style={{display:'flex',gap:10}}>{actions}</div>}
  </div>;
}

export default function DailyLogsPage(){
  const [showNew, setShowNew] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  return <div>
    <PageHeader title="Daily Logs" sub="Field reports and site conditions" actions={<button onClick={()=>setShowNew(!showNew)} style={{padding:'8px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ Today's Log</button>}/>
    {showNew&&<div style={{margin:24,background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:24}}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:16,color:TEXT}}>Daily Log — {today}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:16}}>
        {[['Date',today],['Weather','Clear'],['Temperature (°F)','82'],['Workers on Site','14'],['Supervisor','Chad D.'],['Visitors','0']].map(f=>(
          <div key={f[0]}><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>{f[0]}</label>
            <input defaultValue={f[1]} style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none'}}/></div>
        ))}
      </div>
      {[['Work Performed Today','Electrical rough-in on floors 1-2. Installed 14 circuits in panel room A. Sub-slab plumbing complete on north wing.'],['Delays / Issues','None'],['Safety Notes','All workers with PPE. Tailgate meeting held 7am.']].map(f=>(
        <div key={f[0]} style={{marginBottom:14}}>
          <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>{f[0]}</label>
          <textarea defaultValue={f[1]} rows={3} style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',resize:'vertical'}}/>
        </div>
      ))}
      <div style={{display:'flex',gap:10}}>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>Save Daily Log</button>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 20px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
      </div>
    </div>}
    <div style={{padding:24}}>
      {[{date:'2026-03-06',weather:'Clear 78°F',workers:14,work:'Electrical rough-in floors 1-2. 14 circuits installed. Sub-slab plumbing complete north wing.',delays:'None',safety:'PPE compliance 100%. Tailgate 7am.'},
        {date:'2026-03-05',weather:'Partly Cloudy 74°F',workers:12,work:'Framing completion east wing. 320 LF exterior wall complete. Roof decking 60% installed.',delays:'Material delivery delayed 2hrs - lumber delivery.',safety:'No incidents.'},
        {date:'2026-03-04',weather:'Clear 80°F',workers:10,work:'Foundation inspection passed. Concrete pour north wing complete 42 CY. Formwork removal started.',delays:'None',safety:'PPE 100%.'}
      ].map(log=>(
        <div key={log.date} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:20,marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
            <div><div style={{fontWeight:700,fontSize:15,color:TEXT,marginBottom:2}}>{log.date}</div>
              <div style={{fontSize:12,color:DIM}}>{log.weather} · {log.workers} workers on site</div></div>
            <button style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:12,padding:'4px 10px',cursor:'pointer'}}>Edit</button>
          </div>
          {[['Work Performed',log.work],['Delays',log.delays],['Safety',log.safety]].map(f=>(
            <div key={f[0]} style={{marginBottom:8}}>
              <span style={{fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5}}>{f[0]}: </span>
              <span style={{fontSize:13,color:TEXT}}>{f[1]}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>;
}
