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

export default function BudgetPage(){
  const lines = DEMO_BUDGET_LINES;
  const totOrig = lines.reduce((s,l)=>s+l.original_budget,0);
  const totComm = lines.reduce((s,l)=>s+l.committed_cost,0);
  const totActual = lines.reduce((s,l)=>s+l.actual_cost,0);
  const totForecast = lines.reduce((s,l)=>s+l.forecast_cost,0);
  return <div>
    <PageHeader title="Budget" sub="Job costing by CSI cost code"/>
    <div style={{padding:24}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Original Budget',v:fmt(totOrig),c:TEXT},{l:'Committed',v:fmt(totComm),c:'#4a9de8'},{l:'Actual Spent',v:fmt(totActual),c:'#f97316'},{l:'Forecast to Complete',v:fmt(totForecast),c:totForecast>totOrig?RED:'#3dd68c'}].map(k=>(
          <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>{k.l}</div>
            <div style={{fontSize:20,fontWeight:800,color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>
      <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
        <thead><tr style={{background:'#0a1117'}}>
          {['Cost Code','Description','Category','Original Budget','Committed','Actual Cost','Forecast','Variance'].map(h=>(
            <th key={h} style={{padding:'10px 14px',textAlign:h==='Original Budget'||h==='Committed'||h==='Actual Cost'||h==='Forecast'||h==='Variance'?'right' as const:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>{lines.map(l=>{
          const variance = l.original_budget - l.forecast_cost;
          return <tr key={l.id} style={{borderBottom:`1px solid rgba(38,51,71,.5)`}}>
            <td style={{padding:'11px 14px',color:GOLD,fontWeight:700,fontFamily:'monospace'}}>{l.cost_code}</td>
            <td style={{padding:'11px 14px',color:TEXT,fontWeight:500}}>{l.description}</td>
            <td style={{padding:'11px 14px'}}><Badge label={l.category.replace('_',' ')} color={DIM}/></td>
            <td style={{padding:'11px 14px',textAlign:'right' as const,color:TEXT}}>{fmt(l.original_budget)}</td>
            <td style={{padding:'11px 14px',textAlign:'right' as const,color:'#4a9de8'}}>{fmt(l.committed_cost)}</td>
            <td style={{padding:'11px 14px',textAlign:'right' as const,color:l.actual_cost>0?'#f97316':DIM}}>{fmt(l.actual_cost)}</td>
            <td style={{padding:'11px 14px',textAlign:'right' as const,color:TEXT}}>{fmt(l.forecast_cost)}</td>
            <td style={{padding:'11px 14px',textAlign:'right' as const,color:variance>=0?'#3dd68c':RED,fontWeight:700}}>{variance>=0?'+':''}{fmt(variance)}</td>
          </tr>;
        })}</tbody>
        <tfoot><tr style={{background:'rgba(255,255,255,.03)',fontWeight:800}}>
          <td colSpan={3} style={{padding:'12px 14px',color:TEXT}}>TOTALS</td>
          <td style={{padding:'12px 14px',textAlign:'right' as const,color:TEXT}}>{fmt(totOrig)}</td>
          <td style={{padding:'12px 14px',textAlign:'right' as const,color:'#4a9de8'}}>{fmt(totComm)}</td>
          <td style={{padding:'12px 14px',textAlign:'right' as const,color:'#f97316'}}>{fmt(totActual)}</td>
          <td style={{padding:'12px 14px',textAlign:'right' as const,color:TEXT}}>{fmt(totForecast)}</td>
          <td style={{padding:'12px 14px',textAlign:'right' as const,color:totOrig-totForecast>=0?'#3dd68c':RED}}>{fmt(totOrig-totForecast)}</td>
        </tr></tfoot>
      </table>
    </div>
  </div>;
}
