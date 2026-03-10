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

export default function BidPackagesPage(){
  const [showNew, setShowNew] = useState(false);
  const packages = [{id:'bp-1',code:'BP-01',name:'Electrical Package',status:'awarded',due:'2025-12-10',subs:4,awarded:'Desert Electrical — $385,000'},{id:'bp-2',code:'BP-02',name:'Concrete & Foundation',status:'awarded',due:'2025-12-08',subs:3,awarded:'AZ Concrete — $290,000'},{id:'bp-3',code:'BP-03',name:'Structural Framing',status:'awarded',due:'2025-12-12',subs:5,awarded:'Rio Framing — $480,000'},{id:'bp-4',code:'BP-04',name:'Mechanical HVAC',status:'awarded',due:'2025-12-14',subs:3,awarded:'Pinnacle Mechanical — $340,000'},{id:'bp-5',code:'BP-05',name:'Plumbing Rough-In & Trim',status:'awarded',due:'2025-12-15',subs:2,awarded:'Blue River Plumbing — $220,000'},{id:'bp-6',code:'BP-06',name:'Roofing — TPO System',status:'awarded',due:'2025-12-10',subs:3,awarded:'Southwest Roofing — $195,000'}];
  return <div>
    <PageHeader title="Bid Packages" sub="Manage subcontractor bid solicitations" actions={<button onClick={()=>setShowNew(!showNew)} style={{padding:'8px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ New Bid Package</button>}/>
    {showNew&&<div style={{margin:24,background:RAISED,border:`1px solid rgba(212,160,23,.3)`,borderRadius:10,padding:24}}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:4,color:TEXT}}>Create Bid Package</div>
      <div style={{fontSize:12,color:DIM,marginBottom:16}}>🤖 AI will generate the complete bid jacket — scope of work, line items, insurance requirements, and invitation letter automatically.</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:16}}>
        {[['Package Name',''],['Package Code','BP-07'],['Bid Due Date','']].map(f=>(
          <div key={f[0]}><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>{f[0]}</label>
            <input defaultValue={f[1]} placeholder={f[0]} style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none'}}/></div>
        ))}
      </div>
      <textarea rows={3} placeholder="Scope description (AI will expand this into a full bid jacket)..." style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',resize:'vertical',marginBottom:16}}/>
      <div style={{display:'flex',gap:10}}>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>🤖 Create + AI Generate Bid Jacket</button>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 20px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
      </div>
    </div>}
    <div style={{padding:24}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Total Packages',v:'6'},{l:'Awarded',v:'6'},{l:'Total Awarded $',v:'$1,910,000'},{l:'Subs Invited',v:'20'}].map(k=>(
          <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>{k.l}</div>
            <div style={{fontSize:20,fontWeight:800,color:TEXT}}>{k.v}</div>
          </div>
        ))}
      </div>
      <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
        <thead><tr style={{background:'#0a1117'}}>
          {['Code','Package Name','Status','Bid Due','Subs Invited','Awarded To','Actions'].map(h=>(
            <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>{packages.map(bp=>(
          <tr key={bp.id} style={{borderBottom:`1px solid rgba(38,51,71,.5)`}}>
            <td style={{padding:'12px 14px',color:GOLD,fontWeight:700,fontFamily:'monospace'}}>{bp.code}</td>
            <td style={{padding:'12px 14px',color:TEXT,fontWeight:600}}>{bp.name}</td>
            <td style={{padding:'12px 14px'}}><Badge label={bp.status} color='#3dd68c' bg='rgba(26,138,74,.12)'/></td>
            <td style={{padding:'12px 14px',color:DIM}}>{bp.due}</td>
            <td style={{padding:'12px 14px',color:DIM}}>{bp.subs}</td>
            <td style={{padding:'12px 14px',color:TEXT}}>{bp.awarded}</td>
            <td style={{padding:'12px 14px',display:'flex',gap:6}}>
              <button style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:GOLD,fontSize:11,padding:'3px 8px',cursor:'pointer'}}>View</button>
              <button style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,padding:'3px 8px',cursor:'pointer'}}>⋯</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  </div>;
}
