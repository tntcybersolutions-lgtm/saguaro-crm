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

export default function RFIsPage(){
  const [showNew, setShowNew] = useState(false);
  const [rfis, setRfis] = useState(DEMO_RFIS);
  const params = useParams();
  return <div>
    <PageHeader title="RFIs" sub={`${rfis.filter(r=>r.status!=='closed').length} open · ${rfis.length} total`} actions={<button onClick={()=>setShowNew(!showNew)} style={{padding:'8px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ New RFI</button>}/>
    {showNew&&<div style={{margin:24,background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:24}}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:16,color:TEXT}}>New Request for Information</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
        {[['RFI Number','RFI-004 (auto)'],['Title',''],['Priority','normal'],['Assigned To','Sonoran Architecture Group'],['Response Due',''],['Drawing Reference',''],['Spec Section','']].map(f=>(
          <div key={f[0]}>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>{f[0]}</label>
            <input defaultValue={f[1]} placeholder={f[0]} style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none'}}/>
          </div>
        ))}
      </div>
      <div style={{marginBottom:16}}>
        <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>Description / Question</label>
        <textarea rows={4} placeholder="Describe the RFI in detail..." style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',resize:'vertical'}}/>
      </div>
      <div style={{display:'flex',gap:10}}>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>Submit RFI</button>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 20px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
      </div>
    </div>}
    <div style={{padding:24}}>
      <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
        <thead><tr style={{background:'#0a1117'}}>
          {['RFI #','Title','Status','Priority','Assigned To','Due Date','Cost Impact','Schedule Impact','Actions'].map(h=>(
            <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>{rfis.map(r=>(
          <tr key={r.id} style={{borderBottom:`1px solid rgba(38,51,71,.5)`,cursor:'pointer'}}>
            <td style={{padding:'12px 14px',color:GOLD,fontWeight:700}}>{r.number}</td>
            <td style={{padding:'12px 14px',color:TEXT,maxWidth:250,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{r.title}</td>
            <td style={{padding:'12px 14px'}}><Badge label={r.status.replace('_',' ')} color={r.status==='open'?GOLD:r.status==='answered'?'#3dd68c':'#4a9de8'} bg={r.status==='open'?'rgba(212,160,23,.12)':r.status==='answered'?'rgba(26,138,74,.12)':'rgba(26,95,168,.12)'}/></td>
            <td style={{padding:'12px 14px'}}><Badge label={r.priority} color={r.priority==='urgent'?RED:r.priority==='high'?'#f97316':DIM}/></td>
            <td style={{padding:'12px 14px',color:DIM}}>Sonoran Architecture</td>
            <td style={{padding:'12px 14px',color:r.response_due_date&&new Date(r.response_due_date)<new Date()?RED:DIM}}>{r.response_due_date||'—'}</td>
            <td style={{padding:'12px 14px',color:r.cost_impact_amount&&r.cost_impact_amount>0?'#f97316':DIM}}>{r.cost_impact_amount&&r.cost_impact_amount>0?'$'+r.cost_impact_amount.toLocaleString():'—'}</td>
            <td style={{padding:'12px 14px',color:r.schedule_impact_days&&r.schedule_impact_days>0?'#f97316':DIM}}>{r.schedule_impact_days&&r.schedule_impact_days>0?r.schedule_impact_days+' days':'—'}</td>
            <td style={{padding:'12px 14px'}}><button style={{background:'none',border:'none',color:DIM,cursor:'pointer',fontSize:16}}>⋯</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  </div>;
}
