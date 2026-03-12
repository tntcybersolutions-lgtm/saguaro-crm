'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD='#D4A017',RAISED='#0f1d2b',BORDER='#1e3148',TEXT='#e8edf8',DIM='#8fa3c0';
const GREEN='#22C55E',RED='#EF4444',AMBER='#F59E0B',PURPLE='#8B5CF6',BLUE='#3B82F6',TEAL='#06B6D4';
type Panel=null|'timesheet'|'rfi'|'safety';
const COST_CODES=['General Conditions','Concrete','Masonry','Metals / Structural','Carpentry','Thermal & Moisture','Openings','Finishes','Electrical','Plumbing','HVAC / Mechanical','Earthwork / Site','Other'];
const SEVERITY=['Minor','Moderate','Serious','Critical'];
const INJURY_TYPES=['No Injury','First Aid','Medical Treatment','Lost Time','Fatality'];
const SPEC_SECTIONS=['Division 01 – Gen. Requirements','Division 03 – Concrete','Division 04 – Masonry','Division 05 – Metals','Division 06 – Wood & Plastics','Division 07 – Thermal','Division 08 – Openings','Division 09 – Finishes','Division 22 – Plumbing','Division 23 – HVAC','Division 26 – Electrical','Other'];

const ICONS: Record<string, React.ReactNode> = {
  clock:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/></svg>,
  pin:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx={12} cy={10} r={3}/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x={3} y={4} width={18} height={18} rx={2}/><line x1={16} y1={2} x2={16} y2={6}/><line x1={8} y1={2} x2={8} y2={6}/><line x1={3} y1={10} x2={21} y2={10}/></svg>,
  box:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  users:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx={9} cy={7} r={4}/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  check:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  plan:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x={2} y={2} width={20} height={20} rx={2}/><path d="M2 9h20M9 2v20"/></svg>,
  truck:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x={1} y={3} width={15} height={13}/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx={5.5} cy={18.5} r={2.5}/><circle cx={18.5} cy={18.5} r={2.5}/></svg>,
  message:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  sparkle:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  qr:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x={3} y={3} width={7} height={7} rx={1}/><rect x={14} y={3} width={7} height={7} rx={1}/><rect x={3} y={14} width={7} height={7} rx={1}/><rect x={14} y={14} width={3} height={3}/></svg>,
  download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg>,
  question: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><circle cx={12} cy={12} r={10}/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1={12} y1={17} x2={12.01} y2={17}/></svg>,
  shield:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  folder:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  dollar:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={12} y1={1} x2={12} y2={23}/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  document: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  chart:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={18} y1={20} x2={18} y2={10}/><line x1={12} y1={20} x2={12} y2={4}/><line x1={6} y1={20} x2={6} y2={14}/></svg>,
};

function MorePage(){
  const sp=useSearchParams();
  const projectId=sp.get('projectId')||'';
  const [online,setOnline]=useState(true);
  const [panel,setPanel]=useState<Panel>(null);
  const [saving,setSaving]=useState(false);
  const [savedMsg,setSavedMsg]=useState('');
  const [tsEmployee,setTsEmployee]=useState('');
  const [tsHours,setTsHours]=useState('');
  const [tsCostCode,setTsCostCode]=useState('General Conditions');
  const [tsNotes,setTsNotes]=useState('');
  const [rfiSubject,setRfiSubject]=useState('');
  const [rfiQuestion,setRfiQuestion]=useState('');
  const [rfiSpec,setRfiSpec]=useState('Other');
  const [rfiDueDate,setRfiDueDate]=useState('');
  const [safetyDesc,setSafetyDesc]=useState('');
  const [safetySeverity,setSafetySeverity]=useState('Minor');
  const [safetyInjury,setSafetyInjury]=useState('No Injury');
  const [safetyLocation,setSafetyLocation]=useState('');
  const [safetyReported,setSafetyReported]=useState('');

  useEffect(()=>{
    setOnline(navigator.onLine);
    const on=()=>setOnline(true),off=()=>setOnline(false);
    window.addEventListener('online',on); window.addEventListener('offline',off);
    return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);};
  },[]);

  const showSaved=(msg:string)=>{setSavedMsg(msg);setPanel(null);setTimeout(()=>setSavedMsg(''),3500);};

  const submitTimesheet=async(e:React.FormEvent)=>{
    e.preventDefault(); if(!tsEmployee.trim())return; setSaving(true);
    const p={project_id:projectId,employee_name:tsEmployee.trim(),hours:parseFloat(tsHours)||0,cost_code:tsCostCode,work_date:new Date().toISOString().split('T')[0],notes:tsNotes.trim()};
    try{if(!online)throw new Error('offline');const r=await fetch('/api/timesheets/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});if(!r.ok)throw new Error();showSaved(`${tsHours||'0'}h saved for ${tsEmployee.trim()}`);}
    catch{await enqueue({url:'/api/timesheets/create',method:'POST',body:JSON.stringify(p),contentType:'application/json',isFormData:false});showSaved('Timesheet queued — syncs when online');}
    setTsEmployee('');setTsHours('');setTsNotes('');setSaving(false);
  };

  const submitRFI=async(e:React.FormEvent)=>{
    e.preventDefault(); if(!rfiSubject.trim()||!rfiQuestion.trim())return; setSaving(true);
    const p={projectId,subject:rfiSubject.trim(),question:rfiQuestion.trim(),specSection:rfiSpec,dueDate:rfiDueDate||null};
    try{if(!online)throw new Error('offline');const r=await fetch('/api/rfis/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});if(!r.ok)throw new Error();showSaved('RFI filed — office will respond in dashboard');}
    catch{await enqueue({url:'/api/rfis/create',method:'POST',body:JSON.stringify(p),contentType:'application/json',isFormData:false});showSaved('RFI queued — will sync when online');}
    setRfiSubject('');setRfiQuestion('');setRfiDueDate('');setSaving(false);
  };

  const submitSafety=async(e:React.FormEvent)=>{
    e.preventDefault(); if(!safetyDesc.trim())return; setSaving(true);
    const p={project_id:projectId,description:safetyDesc.trim(),severity:safetySeverity,injury_type:safetyInjury,location:safetyLocation.trim(),reported_to:safetyReported.trim(),incident_date:new Date().toISOString().split('T')[0],type:'incident'};
    try{if(!online)throw new Error('offline');await fetch('/api/safety/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});showSaved('Safety incident logged');}
    catch{await enqueue({url:'/api/safety/create',method:'POST',body:JSON.stringify(p),contentType:'application/json',isFormData:false});showSaved('Safety report queued — will sync when online');}
    setSafetyDesc('');setSafetyLocation('');setSafetyReported('');setSaving(false);
  };

  const PAGE_LINKS=[
    {href:`/field/clock${projectId?`?projectId=${projectId}`:''}`,icon:'clock',label:'Clock In / Out',desc:'GPS-stamped time tracking',color:GREEN,bg:'rgba(34,197,94,.1)',border:'rgba(34,197,94,.25)'},
    {href:`/field/punch${projectId?`?projectId=${projectId}`:''}`,icon:'pin',label:'Punch List',desc:'Log defects and assign to trades',color:RED,bg:'rgba(239,68,68,.1)',border:'rgba(239,68,68,.25)'},
    {href:`/field/schedule${projectId?`?projectId=${projectId}`:''}`,icon:'calendar',label:'Schedule',desc:"Today's activities and deadlines",color:BLUE,bg:'rgba(59,130,246,.1)',border:'rgba(59,130,246,.25)'},
    {href:`/field/delivery${projectId?`?projectId=${projectId}`:''}`,icon:'box',label:'Deliveries',desc:'Confirm deliveries, flag damage',color:AMBER,bg:'rgba(245,158,11,.1)',border:'rgba(245,158,11,.25)'},
    {href:`/field/contacts${projectId?`?projectId=${projectId}`:''}`,icon:'users',label:'Team Contacts',desc:'Quick-dial PM, subs, owner',color:TEAL,bg:'rgba(6,182,212,.1)',border:'rgba(6,182,212,.25)'},
    {href:`/field/inspect${projectId?`?projectId=${projectId}`:''}`,icon:'check',label:'Inspections',desc:'19 checklist types with deficiency tracking',color:GREEN,bg:'rgba(34,197,94,.1)',border:'rgba(34,197,94,.25)'},
    {href:`/field/drawings${projectId?`?projectId=${projectId}`:''}`,icon:'plan',label:'Drawings',desc:'View plans, drop pins on issues',color:BLUE,bg:'rgba(59,130,246,.1)',border:'rgba(59,130,246,.25)'},
    {href:`/field/equipment${projectId?`?projectId=${projectId}`:''}`,icon:'truck',label:'Equipment Log',desc:'Track equipment hours and condition',color:AMBER,bg:'rgba(245,158,11,.1)',border:'rgba(245,158,11,.25)'},
    {href:`/field/chat${projectId?`?projectId=${projectId}`:''}`,icon:'message',label:'Job Board',desc:'Crew messages and announcements',color:TEAL,bg:'rgba(6,182,212,.1)',border:'rgba(6,182,212,.25)'},
    {href:`/field/sage${projectId?`?projectId=${projectId}`:''}`,icon:'sparkle',label:'Sage AI',desc:'Ask anything about your project',color:GOLD,bg:'rgba(212,160,23,.08)',border:'rgba(212,160,23,.2)'},
    {href:`/field/qr${projectId?`?projectId=${projectId}`:''}`,icon:'qr',label:'QR Scanner',desc:'Scan or generate QR codes',color:PURPLE,bg:'rgba(139,92,246,.1)',border:'rgba(139,92,246,.25)'},
  ];
  const QUICK=[
    {id:'timesheet',icon:'clock',label:'Quick Timesheet',desc:'Log hours in 10 seconds',color:AMBER,bg:'rgba(245,158,11,.1)',border:'rgba(245,158,11,.25)'},
    {id:'rfi',icon:'question',label:'File RFI',desc:'Request from office',color:PURPLE,bg:'rgba(139,92,246,.1)',border:'rgba(139,92,246,.25)'},
    {id:'safety',icon:'shield',label:'Safety Incident',desc:'Log near miss or injury',color:RED,bg:'rgba(239,68,68,.1)',border:'rgba(239,68,68,.25)'},
  ];
  const DESKTOP=[
    {icon:'folder',label:'All Projects',href:'/app/projects'},{icon:'dollar',label:'Bids',href:'/app/bids'},
    {icon:'document',label:'Documents',href:'/app/documents'},{icon:'chart',label:'Reports',href:'/app/reports'},
    {icon:'sparkle',label:'AI Autopilot',href:'/app/autopilot'},{icon:'plan',label:'AI Takeoff',href:'/app/takeoff'},
  ];
  const APP_INSTALL={icon:'download',label:'Install App',desc:'Add to home screen — works offline',href:'/field/install',color:GOLD,bg:'rgba(212,160,23,.08)',border:'rgba(212,160,23,.2)'};

  return(
    <div style={{padding:'18px 16px'}}>
      <h1 style={{margin:'0 0 4px',fontSize:22,fontWeight:800,color:TEXT}}>More Tools</h1>
      <p style={{margin:'0 0 16px',fontSize:14,color:DIM}}>All field tools in one place</p>
      {savedMsg&&<div style={{background:'rgba(34,197,94,.1)',border:'1px solid rgba(34,197,94,.3)',borderRadius:10,padding:'12px 14px',marginBottom:14,color:GREEN,fontSize:14,fontWeight:600,display:'flex',alignItems:'center',gap:8}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg>{savedMsg}</div>}
      {!online&&<div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.25)',borderRadius:8,padding:'8px 12px',marginBottom:14,fontSize:13,color:RED,fontWeight:600}}>Offline — will queue and sync automatically</div>}

      {panel===null&&(
        <>
          <p style={sLbl}>Field Modules</p>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:18}}>
            {PAGE_LINKS.map(l=>(
              <a key={l.href} href={l.href} style={{background:l.bg,border:`1px solid ${l.border}`,borderRadius:14,padding:'14px 16px',display:'flex',alignItems:'center',gap:12,textDecoration:'none'}}>
                <div style={{width:44,height:44,borderRadius:12,background:`rgba(${hr(l.color)},.15)`,border:`1px solid rgba(${hr(l.color)},.3)`,display:'flex',alignItems:'center',justifyContent:'center',color:l.color,flexShrink:0}}>{ICONS[l.icon]}</div>
                <div><p style={{margin:0,fontSize:15,fontWeight:700,color:l.color}}>{l.label}</p><p style={{margin:'2px 0 0',fontSize:12,color:DIM}}>{l.desc}</p></div>
                <span style={{marginLeft:'auto',color:DIM,fontSize:18}}>›</span>
              </a>
            ))}
          </div>
          <p style={sLbl}>Quick Submit</p>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:18}}>
            {QUICK.map(t=>(
              <button key={t.id} onClick={()=>setPanel(t.id as Panel)} style={{background:t.bg,border:`1px solid ${t.border}`,borderRadius:14,padding:'14px 16px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',textAlign:'left',width:'100%'}}>
                <div style={{width:44,height:44,borderRadius:12,background:`rgba(${hr(t.color)},.15)`,border:`1px solid rgba(${hr(t.color)},.3)`,display:'flex',alignItems:'center',justifyContent:'center',color:t.color,flexShrink:0}}>{ICONS[t.icon]}</div>
                <div><p style={{margin:0,fontSize:15,fontWeight:700,color:t.color}}>{t.label}</p><p style={{margin:'2px 0 0',fontSize:12,color:DIM}}>{t.desc}</p></div>
                <span style={{marginLeft:'auto',color:DIM,fontSize:18}}>›</span>
              </button>
            ))}
          </div>
          {/* Install app */}
          <a href={APP_INSTALL.href} style={{background:APP_INSTALL.bg,border:`1px solid ${APP_INSTALL.border}`,borderRadius:14,padding:'14px 16px',display:'flex',alignItems:'center',gap:12,textDecoration:'none',marginBottom:18}}>
            <div style={{width:44,height:44,borderRadius:12,background:'rgba(212,160,23,.12)',border:'1px solid rgba(212,160,23,.3)',display:'flex',alignItems:'center',justifyContent:'center',color:APP_INSTALL.color,flexShrink:0}}>{ICONS[APP_INSTALL.icon]}</div>
            <div><p style={{margin:0,fontSize:15,fontWeight:700,color:APP_INSTALL.color}}>{APP_INSTALL.label}</p><p style={{margin:'2px 0 0',fontSize:12,color:DIM}}>{APP_INSTALL.desc}</p></div>
            <span style={{marginLeft:'auto',color:DIM,fontSize:18}}>›</span>
          </a>
          <p style={sLbl}>Desktop</p>
          <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:14,overflow:'hidden'}}>
            {DESKTOP.map((l,i)=>(
              <a key={l.href} href={l.href} style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',borderBottom:i<DESKTOP.length-1?`1px solid ${BORDER}`:'none',color:TEXT,textDecoration:'none',fontSize:15}}>
                <span style={{color:DIM,display:'flex',alignItems:'center'}}>{ICONS[l.icon]}</span><span style={{fontWeight:600}}>{l.label}</span><span style={{marginLeft:'auto',color:DIM}}>›</span>
              </a>
            ))}
          </div>
        </>
      )}

      {panel==='timesheet'&&(
        <form onSubmit={submitTimesheet}>
          <button type="button" onClick={()=>setPanel(null)} style={bkBtn}>← Back</button>
          <h2 style={{margin:'0 0 4px',fontSize:20,fontWeight:800,color:AMBER}}>Quick Timesheet</h2>
          <p style={{margin:'0 0 16px',fontSize:13,color:DIM}}>Log hours for any crew member — {new Date().toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</p>
          <S label="Entry">
            <F label="Employee Name *"><input value={tsEmployee} onChange={e=>setTsEmployee(e.target.value)} placeholder="Full name" style={inp} required/></F>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <F label="Hours Worked"><input type="number" inputMode="decimal" step="0.5" min="0" max="24" value={tsHours} onChange={e=>setTsHours(e.target.value)} placeholder="e.g. 8.5" style={inp}/></F>
              <F label="Cost Code"><select value={tsCostCode} onChange={e=>setTsCostCode(e.target.value)} style={inp}>{COST_CODES.map(c=><option key={c} value={c} style={{background:'#0f1d2b'}}>{c}</option>)}</select></F>
            </div>
            <F label="Notes"><input value={tsNotes} onChange={e=>setTsNotes(e.target.value)} placeholder="Work area, task, OT reason..." style={inp}/></F>
          </S>
          <Sub saving={saving} label="Save Timesheet" online={online} color={AMBER} dark/>
        </form>
      )}

      {panel==='rfi'&&(
        <form onSubmit={submitRFI}>
          <button type="button" onClick={()=>setPanel(null)} style={bkBtn}>← Back</button>
          <h2 style={{margin:'0 0 4px',fontSize:20,fontWeight:800,color:PURPLE}}>File an RFI</h2>
          <p style={{margin:'0 0 16px',fontSize:13,color:DIM}}>Request for information — office responds in dashboard</p>
          <S label="RFI Details">
            <F label="Subject *"><input value={rfiSubject} onChange={e=>setRfiSubject(e.target.value)} placeholder="Brief description" style={inp} required/></F>
            <F label="Question / Description *"><textarea value={rfiQuestion} onChange={e=>setRfiQuestion(e.target.value)} placeholder="Describe the issue and what clarification you need..." rows={4} style={inp} required/></F>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <F label="Spec Section"><select value={rfiSpec} onChange={e=>setRfiSpec(e.target.value)} style={inp}>{SPEC_SECTIONS.map(s=><option key={s} value={s} style={{background:'#0f1d2b'}}>{s}</option>)}</select></F>
              <F label="Need By"><input type="date" value={rfiDueDate} onChange={e=>setRfiDueDate(e.target.value)} style={inp}/></F>
            </div>
          </S>
          <Sub saving={saving} label="File RFI" online={online} color={PURPLE}/>
        </form>
      )}

      {panel==='safety'&&(
        <form onSubmit={submitSafety}>
          <button type="button" onClick={()=>setPanel(null)} style={bkBtn}>← Back</button>
          <h2 style={{margin:'0 0 4px',fontSize:20,fontWeight:800,color:RED}}>Safety Incident</h2>
          <p style={{margin:'0 0 16px',fontSize:13,color:DIM}}>Log any near miss, injury, or hazard</p>
          <S label="Incident Details">
            <F label="What Happened *"><textarea value={safetyDesc} onChange={e=>setSafetyDesc(e.target.value)} placeholder="Describe the incident, near miss, or hazard in detail..." rows={5} style={inp} required/></F>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <F label="Severity"><select value={safetySeverity} onChange={e=>setSafetySeverity(e.target.value)} style={inp}>{SEVERITY.map(s=><option key={s} value={s} style={{background:'#0f1d2b'}}>{s}</option>)}</select></F>
              <F label="Injury Type"><select value={safetyInjury} onChange={e=>setSafetyInjury(e.target.value)} style={inp}>{INJURY_TYPES.map(s=><option key={s} value={s} style={{background:'#0f1d2b'}}>{s}</option>)}</select></F>
            </div>
            <F label="Location"><input value={safetyLocation} onChange={e=>setSafetyLocation(e.target.value)} placeholder="e.g. Level 3 east stairwell" style={inp}/></F>
            <F label="Reported To"><input value={safetyReported} onChange={e=>setSafetyReported(e.target.value)} placeholder="Supervisor / PM name" style={inp}/></F>
          </S>
          {safetySeverity==='Critical'&&<div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:10,padding:'12px 14px',marginBottom:12,fontSize:14,color:RED,fontWeight:600}}>Critical severity — call 911 if needed. Notify PM immediately. OSHA 300 log required.</div>}
          <Sub saving={saving} label="Report Incident" online={online} color={RED}/>
        </form>
      )}
    </div>
  );
}

export default function FieldMorePage(){
  return <Suspense fallback={<div style={{padding:32,color:'#8fa3c0',textAlign:'center'}}>Loading...</div>}><MorePage/></Suspense>;
}

function S({label,children}:{label:string;children:React.ReactNode}){return <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:14,padding:'14px 14px 6px',marginBottom:12}}><p style={{...sLbl,margin:'0 0 10px'}}>{label}</p>{children}</div>;}
function F({label,children}:{label:string;children:React.ReactNode}){return <div style={{marginBottom:10}}><label style={{display:'block',fontSize:12,color:DIM,marginBottom:4}}>{label}</label>{children}</div>;}
function Sub({saving,label,online,color,dark}:{saving:boolean;label:string;online:boolean;color:string;dark?:boolean}){
  return <button type="submit" disabled={saving} style={{width:'100%',background:saving?'#1e3148':color,border:'none',borderRadius:14,padding:'18px',color:saving?DIM:(dark?'#000':'#fff'),fontSize:17,fontWeight:800,cursor:saving?'wait':'pointer',marginTop:4}}>{saving?'Saving...':(online?`Save ${label}`:`${label} (Offline — will sync)`)}</button>;
}

const inp:React.CSSProperties={width:'100%',background:'#09111A',border:'1px solid #1e3148',borderRadius:10,padding:'11px 14px',color:'#e8edf8',fontSize:15,outline:'none'};
const bkBtn:React.CSSProperties={background:'none',border:'none',color:DIM,fontSize:14,cursor:'pointer',padding:'0 0 12px',display:'block'};
const sLbl:React.CSSProperties={margin:'0 0 8px',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:0.8};

function hr(hex:string):string{const r=parseInt((hex||'#888').slice(1,3),16),g=parseInt((hex||'#888').slice(3,5),16),b=parseInt((hex||'#888').slice(5,7),16);return `${r},${g},${b}`;}
