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

export default function InvoicesPage(){
  const invoices = [{id:'inv-1',number:'INV-2026-001',from:'Desert Health Partners LLC',type:'Progress Billing',amount:128250,balance:0,due:'2026-02-14',status:'paid'},{id:'inv-2',number:'INV-2026-002',from:'Desert Health Partners LLC',type:'Progress Billing',amount:257400,balance:257400,due:'2026-03-20',status:'approved'},{id:'inv-3',number:'INV-SUB-042',from:'Rio Framing & Carpentry',type:'Sub Invoice',amount:48000,balance:48000,due:'2026-02-20',status:'overdue'}];
  return <div>
    <PageHeader title="Client Invoices" sub="AIA G702 pay applications and sub invoices" actions={<button style={{padding:'8px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ New Invoice</button>}/>
    <div style={{padding:24}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Total Billed',v:'$385,650'},{l:'Paid',v:'$128,250'},{l:'Outstanding',v:'$257,400',c:'#f97316'},{l:'Overdue',v:'$48,000',c:RED}].map(k=>(
          <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>{k.l}</div>
            <div style={{fontSize:20,fontWeight:800,color:(k as any).c||TEXT}}>{k.v}</div>
          </div>
        ))}
      </div>
      <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
        <thead><tr style={{background:'#0a1117'}}>
          {['Invoice #','From/To','Type','Amount','Balance','Due Date','Status','Actions'].map(h=>(
            <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>{invoices.map(inv=>(
          <tr key={inv.id} style={{borderBottom:`1px solid rgba(38,51,71,.5)`}}>
            <td style={{padding:'12px 14px',color:GOLD,fontWeight:700}}>{inv.number}</td>
            <td style={{padding:'12px 14px',color:TEXT}}>{inv.from}</td>
            <td style={{padding:'12px 14px',color:DIM}}>{inv.type}</td>
            <td style={{padding:'12px 14px',color:TEXT,fontWeight:600}}>{fmt(inv.amount)}</td>
            <td style={{padding:'12px 14px',color:inv.balance>0?'#f97316':'#3dd68c',fontWeight:600}}>{fmt(inv.balance)}</td>
            <td style={{padding:'12px 14px',color:inv.status==='overdue'?RED:DIM}}>{inv.due}</td>
            <td style={{padding:'12px 14px'}}><Badge label={inv.status} color={inv.status==='paid'?'#3dd68c':inv.status==='approved'?'#4a9de8':inv.status==='overdue'?RED:GOLD} bg={inv.status==='paid'?'rgba(26,138,74,.12)':inv.status==='approved'?'rgba(26,95,168,.12)':inv.status==='overdue'?'rgba(192,48,48,.12)':'rgba(212,160,23,.12)'}/></td>
            <td style={{padding:'12px 14px',display:'flex',gap:6}}>
              <button style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,padding:'3px 8px',cursor:'pointer'}}>📄 PDF</button>
              {inv.status==='overdue'&&<button style={{background:'rgba(192,48,48,.12)',border:'1px solid rgba(192,48,48,.3)',borderRadius:5,color:RED,fontSize:11,padding:'3px 8px',cursor:'pointer',fontWeight:700}}>Send Reminder</button>}
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  </div>;
}
