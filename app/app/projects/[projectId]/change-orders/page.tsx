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

export default function ChangeOrdersPage(){
  const [showNew, setShowNew] = useState(false);
  return <div>
    <PageHeader title="Change Orders" sub="2 change orders · $63,200 net impact" actions={<button onClick={()=>setShowNew(!showNew)} style={{padding:'8px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ New Change Order</button>}/>
    {showNew&&<div style={{margin:24,background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:24}}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:16,color:TEXT}}>New Change Order</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
        {[['CO Number','CO-003 (auto)'],['Title',''],['Cost Impact','$'],['Schedule Impact (days)','0'],['Reason',''],['Initiated By','']].map(f=>(
          <div key={f[0]}><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>{f[0]}</label>
            <input defaultValue={f[1]} placeholder={f[0]} style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none'}}/></div>
        ))}
      </div>
      <textarea rows={4} placeholder="Description of change..." style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',resize:'vertical',marginBottom:16}}/>
      <div style={{display:'flex',gap:10}}>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>Create CO</button>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 20px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
      </div>
    </div>}
    <div style={{padding:24}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Total COs',v:'2'},{l:'Approved',v:'$45,000'},{l:'Pending Approval',v:'$18,200'},{l:'Net Impact',v:'+$63,200'}].map(k=>(
          <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>{k.l}</div>
            <div style={{fontSize:22,fontWeight:800,color:TEXT}}>{k.v}</div>
          </div>
        ))}
      </div>
      <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
        <thead><tr style={{background:'#0a1117'}}>
          {['CO #','Title','Status','Cost Impact','Schedule Impact','Submitted','Approved','Actions'].map(h=>(
            <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>{DEMO_CHANGE_ORDERS.map(co=>(
          <tr key={co.id} style={{borderBottom:`1px solid rgba(38,51,71,.5)`}}>
            <td style={{padding:'12px 14px',color:GOLD,fontWeight:700}}>{co.co_number}</td>
            <td style={{padding:'12px 14px',color:TEXT}}>{co.title}</td>
            <td style={{padding:'12px 14px'}}><Badge label={co.status} color={co.status==='approved'?'#3dd68c':GOLD} bg={co.status==='approved'?'rgba(26,138,74,.12)':'rgba(212,160,23,.12)'}/></td>
            <td style={{padding:'12px 14px',color:'#f97316',fontWeight:700}}>+${co.cost_impact.toLocaleString()}</td>
            <td style={{padding:'12px 14px',color:co.schedule_impact_days>0?'#f97316':DIM}}>{co.schedule_impact_days>0?co.schedule_impact_days+' days':'None'}</td>
            <td style={{padding:'12px 14px',color:DIM}}>{co.created_at.split('T')[0]}</td>
            <td style={{padding:'12px 14px',color:co.status==='approved'?'#3dd68c':DIM}}>{co.status==='approved'?'Feb 14, 2026':'Pending'}</td>
            <td style={{padding:'12px 14px'}}><button style={{background:'none',border:'none',color:DIM,cursor:'pointer',fontSize:16}}>⋯</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  </div>;
}
