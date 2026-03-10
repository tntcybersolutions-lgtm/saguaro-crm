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

export default function SchedulePage(){
  const tasks = [
    {id:'t1',name:'Site Mobilization',phase:'Mobilization',start:'2026-01-15',end:'2026-01-22',pct:100,status:'complete',trade:'GC',critical:true},
    {id:'t2',name:'Foundation & Footings',phase:'Foundation',start:'2026-01-22',end:'2026-02-14',pct:100,status:'complete',trade:'Concrete',critical:true},
    {id:'t3',name:'Slab-on-Grade Pour',phase:'Foundation',start:'2026-02-10',end:'2026-02-20',pct:100,status:'complete',trade:'Concrete',critical:true},
    {id:'t4',name:'Framing — Exterior Walls',phase:'Framing',start:'2026-02-20',end:'2026-03-15',pct:85,status:'in_progress',trade:'Framing',critical:true},
    {id:'t5',name:'Framing — Interior Partitions',phase:'Framing',start:'2026-03-01',end:'2026-03-25',pct:40,status:'in_progress',trade:'Framing',critical:false},
    {id:'t6',name:'Roof Framing & Sheathing',phase:'Framing',start:'2026-03-10',end:'2026-03-28',pct:0,status:'pending',trade:'Framing',critical:true},
    {id:'t7',name:'MEP Rough-In — Electrical',phase:'MEP Rough-In',start:'2026-03-15',end:'2026-04-20',pct:15,status:'in_progress',trade:'Electrical',critical:false},
    {id:'t8',name:'MEP Rough-In — Plumbing',phase:'MEP Rough-In',start:'2026-03-20',end:'2026-04-25',pct:5,status:'in_progress',trade:'Plumbing',critical:false},
    {id:'t9',name:'MEP Rough-In — HVAC',phase:'MEP Rough-In',start:'2026-04-01',end:'2026-05-10',pct:0,status:'pending',trade:'HVAC',critical:true},
    {id:'t10',name:'Roofing — TPO Membrane',phase:'Exterior',start:'2026-03-28',end:'2026-04-15',pct:0,status:'pending',trade:'Roofing',critical:true},
    {id:'t11',name:'Insulation',phase:'Insulation',start:'2026-04-25',end:'2026-05-10',pct:0,status:'pending',trade:'Insulation',critical:false},
    {id:'t12',name:'Drywall — Hang & Tape',phase:'Drywall',start:'2026-05-10',end:'2026-06-05',pct:0,status:'pending',trade:'Drywall',critical:true},
    {id:'t13',name:'Painting — Interior',phase:'Finishes',start:'2026-06-05',end:'2026-07-01',pct:0,status:'pending',trade:'Painting',critical:false},
    {id:'t14',name:'Flooring Installation',phase:'Finishes',start:'2026-06-20',end:'2026-07-20',pct:0,status:'pending',trade:'Flooring',critical:false},
    {id:'t15',name:'MEP Trim-Out & Testing',phase:'Finishes',start:'2026-07-01',end:'2026-08-15',pct:0,status:'pending',trade:'MEP',critical:true},
    {id:'t16',name:'Punch List & Final Inspections',phase:'Closeout',start:'2026-08-15',end:'2026-09-15',pct:0,status:'pending',trade:'GC',critical:true},
    {id:'t17',name:'Certificate of Occupancy',phase:'Closeout',start:'2026-09-15',end:'2026-09-30',pct:0,status:'pending',trade:'GC',critical:true},
  ];
  const phases = [...new Set(tasks.map(t=>t.phase))];
  return <div>
    <PageHeader title="Schedule" sub={`${tasks.filter(t=>t.status==='in_progress').length} in progress · ${tasks.filter(t=>t.status==='complete').length} complete · Substantial: Sep 30, 2026`} actions={<><button style={{padding:'8px 14px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:12,cursor:'pointer'}}>Gantt View</button><button style={{padding:'8px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ Add Task</button></>}/>
    <div style={{padding:24}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Total Tasks',v:tasks.length.toString()},{l:'In Progress',v:tasks.filter(t=>t.status==='in_progress').length.toString()},{l:'Complete',v:tasks.filter(t=>t.status==='complete').length.toString()},{l:'Overall Progress',v:'14.8%'}].map(k=>(
          <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>{k.l}</div>
            <div style={{fontSize:22,fontWeight:800,color:TEXT}}>{k.v}</div>
          </div>
        ))}
      </div>
      {phases.map(phase=>(
        <div key={phase} style={{marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:800,textTransform:'uppercase' as const,letterSpacing:1,color:DIM,marginBottom:8,padding:'4px 0',borderBottom:`1px solid ${BORDER}`}}>{phase}</div>
          {tasks.filter(t=>t.phase===phase).map(task=>(
            <div key={task.id} style={{display:'grid',gridTemplateColumns:'2fr .8fr .8fr .8fr 1.5fr .6fr',gap:10,padding:'10px 14px',background:task.status==='in_progress'?'rgba(212,160,23,.04)':'transparent',borderRadius:8,marginBottom:4,alignItems:'center',border:`1px solid ${task.status==='in_progress'?'rgba(212,160,23,.15)':'transparent'}`}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                {task.critical&&<span style={{fontSize:9,background:'rgba(192,48,48,.15)',color:RED,padding:'1px 5px',borderRadius:3,fontWeight:700}}>CP</span>}
                <span style={{color:TEXT,fontWeight:task.status==='in_progress'?700:400,fontSize:13}}>{task.name}</span>
              </div>
              <span style={{fontSize:11,color:DIM}}>{task.trade}</span>
              <span style={{fontSize:11,color:DIM}}>{task.start}</span>
              <span style={{fontSize:11,color:DIM}}>{task.end}</span>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{flex:1,height:5,background:'rgba(255,255,255,.06)',borderRadius:3}}>
                  <div style={{height:'100%',width:`${task.pct}%`,background:task.pct===100?'#3dd68c':task.pct>0?GOLD:'rgba(255,255,255,.1)',borderRadius:3}}/>
                </div>
                <span style={{fontSize:11,color:DIM,minWidth:30}}>{task.pct}%</span>
              </div>
              <Badge label={task.status.replace('_',' ')} color={task.status==='complete'?'#3dd68c':task.status==='in_progress'?GOLD:'#94a3b8'} bg={task.status==='complete'?'rgba(26,138,74,.12)':task.status==='in_progress'?'rgba(212,160,23,.12)':'rgba(148,163,184,.08)'}/>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>;
}
