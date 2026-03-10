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

export default function OverviewPage(){
  const params = useParams();
  const p = DEMO_PROJECT;
  const ctx = DEMO_CONTEXT;
  return <div>
    <PageHeader title="Project Overview" sub={p.name} actions={<><Link href={'/app/projects/'+p.id+'/autopilot'} style={{padding:'8px 14px',background:'rgba(212,160,23,.12)',border:'1px solid rgba(212,160,23,.3)',borderRadius:7,color:GOLD,fontSize:12,fontWeight:700,textDecoration:'none'}}>🤖 Autopilot ({DEMO_AUTOPILOT_ALERTS.length})</Link><button style={{padding:'8px 14px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:12,fontWeight:800,cursor:'pointer'}}>+ Add Item</button></>}/>
    <div style={{padding:24}}>
      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Contract Value',v:'$2,850,000',s:'+$45K COs'},{l:'Billed to Date',v:'$428,500',s:'14.8% complete'},{l:'Paid to Date',v:'$128,250',s:'Payment #1'},{l:'Retainage Held',v:'$42,850',s:'10% on $428.5K'},{l:'Days Remaining',v:'204',s:'Sub: Sep 30, 2026'}].map(k=>(
          <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:1,color:DIM,marginBottom:6}}>{k.l}</div>
            <div style={{fontSize:22,fontWeight:800,color:TEXT,lineHeight:1}}>{k.v}</div>
            <div style={{fontSize:11,color:DIM,marginTop:4}}>{k.s}</div>
          </div>
        ))}
      </div>
      {/* Alerts */}
      {DEMO_AUTOPILOT_ALERTS.length>0&&<div style={{background:'rgba(192,48,48,.06)',border:'1px solid rgba(192,48,48,.2)',borderRadius:10,padding:'14px 18px',marginBottom:18}}>
        <div style={{fontWeight:700,marginBottom:10,color:TEXT}}>🤖 Autopilot — {DEMO_AUTOPILOT_ALERTS.length} Active Alerts</div>
        {DEMO_AUTOPILOT_ALERTS.map(a=><div key={a.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderTop:'1px solid rgba(38,51,71,.5)'}}>
          <Badge label={a.severity} color={a.severity==='high'?'#f97316':'#ef4444'} bg={a.severity==='high'?'rgba(249,115,22,.12)':'rgba(239,68,68,.12)'}/>
          <span style={{fontSize:13,color:TEXT,flex:1}}>{a.title}</span>
          <span style={{fontSize:11,color:DIM,maxWidth:360}}>{a.summary.slice(0,80)}...</span>
        </div>)}
      </div>}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
        <Card title="Project Details">
          {[['Address',DEMO_PROJECT.address],['Type',DEMO_PROJECT.project_type],['State',DEMO_PROJECT.state_jurisdiction||'AZ'],['Contract Type','Lump Sum GMP'],['Owner','Desert Health Partners LLC'],['Architect','Sonoran Architecture Group'],['Start Date','January 15, 2026'],['Substantial','September 30, 2026'],['Contract Value','$2,850,000'],['Retainage','10%']].map(r=>(
            <div key={r[0]} style={{display:'flex',padding:'7px 0',borderBottom:'1px solid rgba(38,51,71,.4)',fontSize:13}}>
              <span style={{minWidth:150,color:DIM,fontWeight:600}}>{r[0]}</span>
              <span style={{color:TEXT}}>{r[1]}</span>
            </div>
          ))}
        </Card>
        <Card title="Financial Summary">
          {[['Original Contract','$2,850,000'],['Approved Change Orders','+$45,000'],['Contract to Date','$2,895,000'],['Billed to Date','$428,500 (14.8%)'],['Retainage Held','$42,850'],['Total Paid','$128,250'],['Balance Due','$257,400'],['Est. Cost to Complete','$2,466,500']].map(r=>(
            <div key={r[0]} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid rgba(38,51,71,.4)',fontSize:13}}>
              <span style={{color:DIM}}>{r[0]}</span>
              <span style={{color:TEXT,fontWeight:600}}>{r[1]}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  </div>;
}
