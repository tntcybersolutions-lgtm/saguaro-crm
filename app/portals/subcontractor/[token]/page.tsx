'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017',BG='#07101C',RAISED='#0D1D2E',BORDER='#1E3A5F',TEXT='#F0F4FF',DIM='#8BAAC8',GREEN='#22C55E',RED='#EF4444',AMBER='#F59E0B',BLUE='#3B82F6',PURPLE='#8B5CF6';
const fmt=(n:number)=>'$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
const fmtDate=(d:string)=>d?new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'--';

type Tab='dashboard'|'bids'|'schedule'|'daily'|'payapps'|'documents'|'scorecard';
type ComplianceDoc={id:string;type:string;status:'pending'|'approved'|'rejected'|'expired';file_name:string;uploaded_at:string;expiration_date:string|null;notes:string};
type Task={id:string;title:string;phase:string;start_date:string;end_date:string;percent_complete:number;status:string;dependencies:string[]};
type DailyLog={id:string;date:string;crew_count:number;hours_worked:number;work_completed:string;work_planned:string;safety_incidents:string;material_deliveries:string;photos:string[];gc_comments:string;status:'submitted'|'accepted'|'correction_requested';correction_note:string;clock_in:string;clock_out:string};
type PayAppLine={id:string;description:string;scheduled_value:number;previous_completed:number;this_period:number;stored_materials:number;total_completed:number;gc_status:'pending'|'approved'|'disputed';gc_notes:string};
type PayApp={id:string;app_number:number;period_start:string;period_end:string;status:'draft'|'submitted'|'under_review'|'approved'|'paid'|'disputed';total_amount:number;approved_amount:number;paid_date:string|null;payment_method:string;line_items:PayAppLine[]};
type BidInvitation={id:string;title:string;scope:string;due_date:string;status:'open'|'submitted'|'awarded'|'declined';budget_range:string;documents:string[];nda_required:boolean;nda_signed:boolean;submitted_amount:number|null};
type ScoreEntry={project_name:string;quality:number;schedule:number;communication:number;safety:number;date:string};
type PortalData={company_name:string;project_name:string;trade:string;contract_amount:number;is_preferred:boolean;compliance:ComplianceDoc[];tasks:Task[];daily_logs:DailyLog[];pay_apps:PayApp[];bids:BidInvitation[];scores:ScoreEntry[];shared_documents:{id:string;name:string;url:string;category:string;uploaded_at:string}[];rfis:{id:string;subject:string;status:string;submitted_at:string;response:string;responded_at:string}[];schedule_conflicts:string[];notifications:string[];overall_score:number;avg_score:number;score_trend:number[]};

const card=(extra?:React.CSSProperties):React.CSSProperties=>({background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:20,...extra});
const btnS=(color:string,small?:boolean):React.CSSProperties=>({background:color,color:'#fff',border:'none',borderRadius:7,padding:small?'6px 14px':'10px 20px',fontWeight:700,fontSize:small?12:14,cursor:'pointer'});
const labelS:React.CSSProperties={display:'block',fontSize:11,fontWeight:700,color:DIM,marginBottom:5,textTransform:'uppercase',letterSpacing:.5};
const inputS:React.CSSProperties={width:'100%',background:BG,border:`1px solid ${BORDER}`,borderRadius:7,padding:'10px 14px',color:TEXT,fontSize:14,outline:'none',boxSizing:'border-box'};
const textareaS:React.CSSProperties={...inputS,minHeight:80,resize:'vertical' as const};
const badge=(status:string):React.CSSProperties=>{const m:Record<string,string>={approved:GREEN,paid:GREEN,accepted:GREEN,awarded:GREEN,submitted:BLUE,open:BLUE,pending:AMBER,under_review:AMBER,draft:DIM,correction_requested:AMBER,rejected:RED,disputed:RED,expired:RED,declined:RED};const c=m[status]||DIM;return{display:'inline-block',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:c+'22',color:c,textTransform:'uppercase' as const}};

function Stars({rating,max=5,size=18}:{rating:number;max?:number;size?:number}){
  return <span style={{display:'inline-flex',gap:2}}>{Array.from({length:max},(_,i)=><span key={i} style={{fontSize:size,color:i<Math.round(rating)?GOLD:BORDER}}>{i<Math.round(rating)?'\u2605':'\u2606'}</span>)}</span>;
}

function TrendChart({data,width=280,height=80}:{data:number[];width?:number;height?:number}){
  if(!data||data.length<2)return<span style={{color:DIM,fontSize:12}}>Not enough data</span>;
  const mn=Math.min(...data)-.3,mx=Math.max(...data)+.3,rng=mx-mn||1;
  const pts=data.map((v,i)=>{const x=(i/(data.length-1))*(width-20)+10;const y=height-10-((v-mn)/rng)*(height-20);return`${x},${y}`;});
  return(
    <svg width={width} height={height} style={{display:'block'}}>
      <polyline points={pts.join(' ')} fill="none" stroke={GOLD} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>
      {data.map((v,i)=>{const x=(i/(data.length-1))*(width-20)+10;const y=height-10-((v-mn)/rng)*(height-20);return<circle key={i} cx={x} cy={y} r={3.5} fill={GOLD} stroke={BG} strokeWidth={1.5}/>;
      })}
    </svg>
  );
}

function ProgressBar({value,color=GOLD,height=8}:{value:number;color?:string;height?:number}){
  return<div style={{background:BORDER,borderRadius:height,height,width:'100%',overflow:'hidden'}}><div style={{width:`${Math.min(100,Math.max(0,value))}%`,height:'100%',background:color,borderRadius:height,transition:'width .4s ease'}}/></div>;
}

function GanttBar({task,minDate,maxDate}:{task:Task;minDate:number;maxDate:number}){
  const s=new Date(task.start_date).getTime(),e=new Date(task.end_date).getTime();
  const range=maxDate-minDate||1;
  const left=((s-minDate)/range)*100,w=Math.max(2,((e-s)/range)*100);
  const color=task.percent_complete>=1?GREEN:task.percent_complete>=.5?BLUE:AMBER;
  return(
    <div style={{position:'relative',height:28,marginBottom:6}}>
      <div style={{position:'absolute',left:`${left}%`,width:`${w}%`,height:22,top:3,background:color+'33',border:`1px solid ${color}`,borderRadius:5}}>
        <div style={{width:`${task.percent_complete*100}%`,height:'100%',background:color+'66',borderRadius:4}}/>
        <span style={{position:'absolute',left:6,top:2,fontSize:10,fontWeight:700,color:TEXT,whiteSpace:'nowrap'}}>{task.title} ({Math.round(task.percent_complete*100)}%)</span>
      </div>
    </div>
  );
}

function SignatureCanvas({onSign}:{onSign:(data:string)=>void}){
  const ref=useRef<HTMLCanvasElement>(null);
  const [drawing,setDrawing]=useState(false);
  const [has,setHas]=useState(false);
  const pos=(e:React.MouseEvent|React.TouchEvent)=>{const r=ref.current!.getBoundingClientRect();const cx='touches' in e?e.touches[0].clientX:e.clientX;const cy='touches' in e?e.touches[0].clientY:e.clientY;return{x:cx-r.left,y:cy-r.top}};
  const start=(e:React.MouseEvent|React.TouchEvent)=>{setDrawing(true);const ctx=ref.current!.getContext('2d')!;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y)};
  const draw=(e:React.MouseEvent|React.TouchEvent)=>{if(!drawing)return;const ctx=ref.current!.getContext('2d')!;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.strokeStyle=TEXT;ctx.lineWidth=2;ctx.lineCap='round';ctx.stroke();setHas(true)};
  const stop=()=>{setDrawing(false);if(has)onSign(ref.current!.toDataURL())};
  const clear=()=>{ref.current!.getContext('2d')!.clearRect(0,0,400,120);setHas(false)};
  return(
    <div>
      <canvas ref={ref} width={400} height={120} style={{background:BG,border:`1px solid ${BORDER}`,borderRadius:7,cursor:'crosshair',touchAction:'none',maxWidth:'100%'}} onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchMove={draw} onTouchEnd={stop}/>
      <div style={{marginTop:6,display:'flex',gap:8}}>
        <button onClick={clear} style={btnS(BORDER,true)}>Clear</button>
        {has&&<span style={{color:GREEN,fontSize:12,alignSelf:'center'}}>Signature captured</span>}
      </div>
    </div>
  );
}

/* ================================================================ */
/*  MAIN COMPONENT                                                  */
/* ================================================================ */
export default function SubcontractorPortal(){
  const {token}=useParams<{token:string}>();
  const [tab,setTab]=useState<Tab>('dashboard');
  const [data,setData]=useState<PortalData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [isOnline,setIsOnline]=useState(true);
  const [toast,setToast]=useState('');
  const [mobileMenu,setMobileMenu]=useState(false);

  // Daily log form
  const [dlForm,setDlForm]=useState({crew_count:'',hours_worked:'',work_completed:'',work_planned:'',safety_incidents:'',material_deliveries:'',photos:[] as File[]});
  const [dlSaving,setDlSaving]=useState(false);

  // Pay app form
  const [paForm,setPaForm]=useState<{line_items:{description:string;this_period:string;stored_materials:string}[]}>({line_items:[]});
  const [paSaving,setPaSaving]=useState(false);
  const [paTab,setPaTab]=useState<'new'|'history'>('history');

  // Bid form
  const [bidFormOpen,setBidFormOpen]=useState<string|null>(null);
  const [bidForm,setBidForm]=useState({amount:'',notes:'',line_items:''});
  const [bidSaving,setBidSaving]=useState(false);
  const [ndaSig,setNdaSig]=useState<string|null>(null);
  const [ndaAgreed,setNdaAgreed]=useState(false);

  // Doc upload
  const [docUploadType,setDocUploadType]=useState('');
  const [docFile,setDocFile]=useState<File|null>(null);
  const [docExpiry,setDocExpiry]=useState('');
  const [docUploading,setDocUploading]=useState(false);

  // RFI
  const [rfiForm,setRfiForm]=useState({subject:'',description:'',urgency:'normal'});
  const [rfiSaving,setRfiSaving]=useState(false);

  // GPS
  const [gpsStatus,setGpsStatus]=useState<'idle'|'clocked_in'|'clocked_out'>('idle');
  const [clockInTime,setClockInTime]=useState('');
  const [clockOutTime,setClockOutTime]=useState('');
  const [gpsCoords,setGpsCoords]=useState<{lat:number;lng:number}|null>(null);

  // Task updates
  const [taskUpdates,setTaskUpdates]=useState<Record<string,number>>({});

  const showToast=useCallback((msg:string)=>{setToast(msg);setTimeout(()=>setToast(''),3500)},[]);

  useEffect(()=>{
    const on=()=>setIsOnline(true),off=()=>setIsOnline(false);
    window.addEventListener('online',on);window.addEventListener('offline',off);setIsOnline(navigator.onLine);
    return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)};
  },[]);

  useEffect(()=>{
    if(!token)return;setLoading(true);
    fetch(`/api/portals/subcontractor?token=${token}`,{headers:{'x-portal-token':token}})
      .then(r=>{if(!r.ok)throw new Error('Invalid token');return r.json()})
      .then(d=>{
        setData(d);
        if(d.pay_apps?.length){
          const latest=d.pay_apps[0];
          setPaForm({line_items:(latest.line_items||[]).map((li:PayAppLine)=>({description:li.description,this_period:'',stored_materials:''}))});
        }
      })
      .catch(e=>setError(e.message||'Failed to load portal'))
      .finally(()=>setLoading(false));
  },[token]);

  const apiPost=async(endpoint:string,body:any)=>{
    const res=await fetch(`/api/portals/subcontractor/${endpoint}?token=${token}`,{method:'POST',headers:{'Content-Type':'application/json','x-portal-token':token},body:JSON.stringify(body)});
    return res.json();
  };

  const handleClockIn=()=>{
    if(!navigator.geolocation){showToast('Geolocation not supported');return;}
    navigator.geolocation.getCurrentPosition(p=>{
      const now=new Date().toISOString();
      setGpsCoords({lat:p.coords.latitude,lng:p.coords.longitude});setClockInTime(now);setGpsStatus('clocked_in');
      apiPost('clock',{action:'in',lat:p.coords.latitude,lng:p.coords.longitude,time:now});showToast('Clocked in successfully');
    },()=>showToast('Location access denied'),{enableHighAccuracy:true});
  };

  const handleClockOut=()=>{
    if(!navigator.geolocation){showToast('Geolocation not supported');return;}
    navigator.geolocation.getCurrentPosition(p=>{
      const now=new Date().toISOString();
      setClockOutTime(now);setGpsStatus('clocked_out');
      apiPost('clock',{action:'out',lat:p.coords.latitude,lng:p.coords.longitude,time:now});showToast('Clocked out successfully');
    },()=>showToast('Location access denied'),{enableHighAccuracy:true});
  };

  const submitDailyLog=async()=>{
    if(!dlForm.work_completed.trim()){showToast('Please describe work completed');return;}
    setDlSaving(true);
    try{
      const result=await apiPost('daily-log',{...dlForm,crew_count:parseInt(dlForm.crew_count)||0,hours_worked:parseFloat(dlForm.hours_worked)||0,clock_in:clockInTime,clock_out:clockOutTime,gps:gpsCoords});
      if(result.success){showToast('Daily log submitted');setDlForm({crew_count:'',hours_worked:'',work_completed:'',work_planned:'',safety_incidents:'',material_deliveries:'',photos:[]});setGpsStatus('idle');setClockInTime('');setClockOutTime('');}
      else showToast(result.error||'Failed to submit');
    }catch{showToast('Network error -- log queued for sync');}
    setDlSaving(false);
  };

  const submitPayApp=async()=>{
    setPaSaving(true);
    try{const result=await apiPost('pay-app',{line_items:paForm.line_items});if(result.success){showToast('Pay application submitted');setPaTab('history');}else showToast(result.error||'Failed to submit');}
    catch{showToast('Network error');}
    setPaSaving(false);
  };

  const submitBid=async(bidId:string)=>{
    if(!bidForm.amount){showToast('Enter bid amount');return;}
    setBidSaving(true);
    try{const result=await apiPost('bid',{bid_id:bidId,...bidForm,nda_signature:ndaSig});if(result.success){showToast('Bid submitted');setBidFormOpen(null);}else showToast(result.error||'Failed to submit');}
    catch{showToast('Network error');}
    setBidSaving(false);
  };

  const uploadDoc=async()=>{
    if(!docFile||!docUploadType){showToast('Select file and type');return;}
    setDocUploading(true);
    try{
      const fd=new FormData();fd.append('file',docFile);fd.append('type',docUploadType);fd.append('expiration_date',docExpiry);
      const res=await fetch(`/api/portals/subcontractor/document?token=${token}`,{method:'POST',headers:{'x-portal-token':token},body:fd});
      const result=await res.json();if(result.success){showToast('Document uploaded');setDocFile(null);setDocUploadType('');setDocExpiry('');}else showToast(result.error||'Upload failed');
    }catch{showToast('Network error');}
    setDocUploading(false);
  };

  const submitRfi=async()=>{
    if(!rfiForm.subject.trim()){showToast('Enter RFI subject');return;}
    setRfiSaving(true);
    try{const result=await apiPost('rfi',rfiForm);if(result.success){showToast('RFI submitted');setRfiForm({subject:'',description:'',urgency:'normal'});}else showToast(result.error||'Failed to submit');}
    catch{showToast('Network error');}
    setRfiSaving(false);
  };

  const updateTaskProgress=async(taskId:string,value:number)=>{
    setTaskUpdates(prev=>({...prev,[taskId]:value}));
    try{await apiPost('task-progress',{task_id:taskId,percent_complete:value/100});}catch{showToast('Failed to update');}
  };

  /* ── LOADING ── */
  if(loading)return(
    <div style={{minHeight:'100vh',background:BG,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:48,height:48,border:`3px solid ${BORDER}`,borderTopColor:GOLD,borderRadius:'50%',animation:'spin 1s linear infinite',margin:'0 auto 16px'}}/>
        <div style={{color:DIM,fontSize:14}}>Loading your portal...</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  /* ── ERROR ── */
  if(error||!data)return(
    <div style={{minHeight:'100vh',background:BG,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif'}}>
      <div style={{textAlign:'center',color:RED}}>
        <div style={{fontSize:52,marginBottom:16}}>{'\u26A0'}</div>
        <div style={{fontSize:22,fontWeight:800,color:TEXT}}>Portal Access Denied</div>
        <div style={{fontSize:14,color:DIM,marginTop:10,maxWidth:420,lineHeight:1.6}}>{error||'This portal link is invalid or has expired. Please contact your general contractor for a new link.'}</div>
      </div>
    </div>
  );

  const compliance=data.compliance||[];
  const tasks=data.tasks||[];
  const dailyLogs=data.daily_logs||[];
  const payApps=data.pay_apps||[];
  const bids=data.bids||[];
  const scores=data.scores||[];
  const sharedDocs=data.shared_documents||[];
  const rfis=data.rfis||[];
  const compStatus=(type:string)=>{const doc=compliance.find(d=>d.type===type);if(!doc)return'missing';if(doc.status==='expired')return'expired';if(doc.status==='rejected')return'rejected';if(doc.expiration_date){const days=Math.ceil((new Date(doc.expiration_date).getTime()-Date.now())/86400000);if(days<=0)return'expired';if(days<=30)return'expiring';}return doc.status};
  const compColor=(s:string)=>s==='approved'?GREEN:s==='pending'||s==='expiring'?AMBER:RED;
  const avgScore=scores.length?scores.reduce((a,s)=>a+(s.quality+s.schedule+s.communication+s.safety)/4,0)/scores.length:0;

  const TABS:{key:Tab;label:string;icon:string}[]=[
    {key:'dashboard',label:'Dashboard',icon:'\u2302'},
    {key:'bids',label:'Bids & Scope',icon:'\u2696'},
    {key:'schedule',label:'Schedule',icon:'\u2630'},
    {key:'daily',label:'Daily Reports',icon:'\u270D'},
    {key:'payapps',label:'Pay Apps',icon:'\u2709'},
    {key:'documents',label:'Documents',icon:'\u2750'},
    {key:'scorecard',label:'Scorecard',icon:'\u2605'},
  ];

  /* ================================================================ */
  /*  TAB 1: DASHBOARD                                                */
  /* ================================================================ */
  const renderDashboard=()=>{
    const upcoming=tasks.filter(t=>t.percent_complete<1).sort((a,b)=>new Date(a.end_date).getTime()-new Date(b.end_date).getTime()).slice(0,5);
    const recentLogs=dailyLogs.slice(0,3);
    const compTypes=['Insurance Certificate','W-9','Business License','Bond','Safety Certification'];
    return(
      <div style={{display:'grid',gap:20}}>
        {/* Welcome */}
        <div style={{...card(),background:`linear-gradient(135deg,${RAISED},${BG})`,position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',right:-30,top:-30,width:140,height:140,background:GOLD+'08',borderRadius:'50%'}}/>
          <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
            <div style={{width:56,height:56,borderRadius:'50%',background:GOLD+'22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,color:GOLD,fontWeight:800}}>{(data.company_name||'S')[0]}</div>
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontSize:22,fontWeight:800,color:TEXT}}>{data.company_name}</div>
              <div style={{fontSize:13,color:DIM,marginTop:2}}>{data.project_name} &middot; {data.trade}</div>
              <div style={{fontSize:12,color:DIM,marginTop:2}}>Contract: {fmt(data.contract_amount)}</div>
            </div>
            {data.is_preferred&&(
              <div style={{background:GOLD+'22',border:`1px solid ${GOLD}`,borderRadius:8,padding:'8px 16px',display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:20}}>{'\u2B50'}</span>
                <div><div style={{fontSize:13,fontWeight:800,color:GOLD}}>Preferred Subcontractor</div><div style={{fontSize:10,color:DIM}}>Top-rated performance</div></div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12}}>
          {[{label:'Submit Daily Log',icon:'\u{1F4DD}',t:'daily' as Tab,c:BLUE},{label:'Submit Pay App',icon:'\u{1F4B0}',t:'payapps' as Tab,c:GREEN},{label:'File RFI',icon:'\u{1F4AC}',t:'documents' as Tab,c:PURPLE},{label:'View Bids',icon:'\u{1F4C8}',t:'bids' as Tab,c:AMBER}].map(a=>(
            <button key={a.label} onClick={()=>setTab(a.t)} style={{...card(),cursor:'pointer',textAlign:'center',border:`1px solid ${a.c}44`,background:RAISED}}>
              <div style={{fontSize:24,marginBottom:6}}>{a.icon}</div>
              <div style={{fontSize:13,fontWeight:700,color:TEXT}}>{a.label}</div>
            </button>
          ))}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:20}}>
          {/* Upcoming Tasks */}
          <div style={card()}>
            <div style={{fontSize:15,fontWeight:700,color:TEXT,marginBottom:14}}>Upcoming Deadlines</div>
            {upcoming.length===0?<div style={{color:DIM,fontSize:13,padding:20,textAlign:'center'}}>No upcoming tasks</div>:
            upcoming.map(t=>{const d=Math.ceil((new Date(t.end_date).getTime()-Date.now())/86400000);return(
              <div key={t.id} style={{padding:'10px 0',borderBottom:`1px solid ${BORDER}44`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div><div style={{fontSize:13,fontWeight:600,color:TEXT}}>{t.title}</div><div style={{fontSize:11,color:DIM}}>{t.phase} &middot; Due {fmtDate(t.end_date)}</div></div>
                <div style={{fontSize:12,fontWeight:700,color:d<=3?RED:d<=7?AMBER:GREEN}}>{d<=0?'OVERDUE':`${d}d left`}</div>
              </div>
            )})}
          </div>

          {/* Compliance */}
          <div style={card()}>
            <div style={{fontSize:15,fontWeight:700,color:TEXT,marginBottom:14}}>Compliance Status</div>
            {compTypes.map(type=>{const s=compStatus(type);const c=compColor(s);const doc=compliance.find(d=>d.type===type);const dl=doc?.expiration_date?Math.ceil((new Date(doc.expiration_date).getTime()-Date.now())/86400000):null;return(
              <div key={type} style={{padding:'9px 0',borderBottom:`1px solid ${BORDER}44`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:10,height:10,borderRadius:'50%',background:c}}/><span style={{fontSize:13,color:TEXT}}>{type}</span></div>
                <div style={{fontSize:11,color:c,fontWeight:600}}>{s==='missing'?'Not Uploaded':s==='expiring'?`Expires in ${dl}d`:s.toUpperCase()}</div>
              </div>
            )})}
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:20}}>
          {/* Performance */}
          <div style={card()}>
            <div style={{fontSize:15,fontWeight:700,color:TEXT,marginBottom:14}}>Performance Scorecard</div>
            {scores.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:20}}>No scores yet</div>:(
              <div>
                <div style={{textAlign:'center',marginBottom:16}}>
                  <div style={{fontSize:36,fontWeight:800,color:GOLD}}>{avgScore.toFixed(1)}</div>
                  <Stars rating={avgScore} size={22}/><div style={{fontSize:11,color:DIM,marginTop:4}}>Overall Rating</div>
                </div>
                {['Quality','Schedule','Communication','Safety'].map(cat=>{const key=cat.toLowerCase() as keyof ScoreEntry;const avg=scores.reduce((a,s)=>a+(s[key] as number),0)/scores.length;return(
                  <div key={cat} style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <span style={{fontSize:12,color:DIM,width:100}}>{cat}</span>
                    <div style={{flex:1,margin:'0 8px'}}><ProgressBar value={avg*20} color={avg>=4?GREEN:avg>=3?AMBER:RED}/></div>
                    <span style={{fontSize:12,fontWeight:700,color:TEXT,width:30,textAlign:'right'}}>{avg.toFixed(1)}</span>
                  </div>
                )})}
              </div>
            )}
          </div>

          {/* Recent Logs */}
          <div style={card()}>
            <div style={{fontSize:15,fontWeight:700,color:TEXT,marginBottom:14}}>Recent Daily Logs</div>
            {recentLogs.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:20}}>No logs submitted yet</div>:
            recentLogs.map(log=>(
              <div key={log.id} style={{padding:'10px 0',borderBottom:`1px solid ${BORDER}44`}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:13,fontWeight:600,color:TEXT}}>{fmtDate(log.date)}</span><span style={badge(log.status)}>{log.status.replace(/_/g,' ')}</span></div>
                <div style={{fontSize:12,color:DIM}}>{log.crew_count} crew &middot; {log.hours_worked}h &middot; {log.work_completed.substring(0,80)}...</div>
                {log.gc_comments&&<div style={{fontSize:11,color:AMBER,marginTop:4,padding:'4px 8px',background:AMBER+'11',borderRadius:4}}>GC: {log.gc_comments}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Notifications */}
        {data.notifications&&data.notifications.length>0&&(
          <div style={card()}>
            <div style={{fontSize:15,fontWeight:700,color:TEXT,marginBottom:14}}>Notifications</div>
            {data.notifications.map((n,i)=><div key={i} style={{padding:'8px 12px',background:BLUE+'11',borderLeft:`3px solid ${BLUE}`,borderRadius:4,marginBottom:8,fontSize:13,color:TEXT}}>{n}</div>)}
          </div>
        )}
      </div>
    );
  };

  /* ================================================================ */
  /*  TAB 2: BIDS & SCOPE                                            */
  /* ================================================================ */
  const renderBids=()=>{
    const active=bids.filter(b=>b.status==='open');
    const submitted=bids.filter(b=>b.status!=='open');
    return(
      <div style={{display:'grid',gap:20}}>
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Active Bid Invitations</div>
          {active.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No active bid invitations at this time</div>:
          active.map(bid=>(
            <div key={bid.id} style={{padding:16,background:BG,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:10}}>
                <div><div style={{fontSize:16,fontWeight:700,color:TEXT}}>{bid.title}</div><div style={{fontSize:12,color:DIM,marginTop:4}}>Due: {fmtDate(bid.due_date)} &middot; Budget Range: {bid.budget_range}</div></div>
                <span style={badge(bid.status)}>{bid.status}</span>
              </div>
              <div style={{fontSize:13,color:DIM,marginTop:10,lineHeight:1.6}}>{bid.scope}</div>

              {/* NDA Gate */}
              {bid.nda_required&&!bid.nda_signed&&(
                <div style={{marginTop:16,padding:16,background:AMBER+'11',border:`1px solid ${AMBER}44`,borderRadius:8}}>
                  <div style={{fontSize:14,fontWeight:700,color:AMBER,marginBottom:10}}>NDA Required Before Viewing Full Documents</div>
                  <div style={{fontSize:12,color:DIM,marginBottom:12,lineHeight:1.6}}>By signing below, you agree to keep all project documents, pricing, and scope details strictly confidential. You will not share, distribute, or disclose any information contained within to third parties.</div>
                  <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,cursor:'pointer'}}>
                    <input type="checkbox" checked={ndaAgreed} onChange={e=>setNdaAgreed(e.target.checked)} style={{width:18,height:18,accentColor:GOLD}}/>
                    <span style={{fontSize:13,color:TEXT}}>I agree to the Non-Disclosure Agreement terms above</span>
                  </label>
                  {ndaAgreed&&<div><div style={labelS}>Your Signature</div><SignatureCanvas onSign={sig=>setNdaSig(sig)}/></div>}
                </div>
              )}

              {/* Documents */}
              {bid.documents&&bid.documents.length>0&&(!bid.nda_required||bid.nda_signed||ndaSig)&&(
                <div style={{marginTop:14}}>
                  <div style={{...labelS,marginBottom:8}}>Project Documents</div>
                  {bid.documents.map((doc,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:RAISED,borderRadius:5,marginBottom:4,fontSize:12,color:BLUE,cursor:'pointer'}}>{'\u{1F4C4}'} {doc}</div>)}
                </div>
              )}

              {/* Bid Form */}
              {bidFormOpen===bid.id?(
                <div style={{marginTop:16,padding:16,background:RAISED,borderRadius:8,border:`1px solid ${BORDER}`}}>
                  <div style={{fontSize:15,fontWeight:700,color:TEXT,marginBottom:14}}>Submit Your Bid</div>
                  <div style={{marginBottom:14}}><div style={labelS}>Total Bid Amount ($)</div><input type="number" value={bidForm.amount} onChange={e=>setBidForm(f=>({...f,amount:e.target.value}))} placeholder="Enter total amount" style={inputS}/></div>
                  <div style={{marginBottom:14}}><div style={labelS}>Line Item Breakdown</div><textarea value={bidForm.line_items} onChange={e=>setBidForm(f=>({...f,line_items:e.target.value}))} placeholder={"Item 1: $XX,XXX\nItem 2: $XX,XXX\nItem 3: $XX,XXX"} style={textareaS}/><div style={{fontSize:10,color:DIM,marginTop:4}}>One line item per line with amount</div></div>
                  <div style={{marginBottom:14}}><div style={labelS}>Notes / Qualifications / Exclusions</div><textarea value={bidForm.notes} onChange={e=>setBidForm(f=>({...f,notes:e.target.value}))} placeholder="Any notes, exclusions, alternates, or qualifications..." style={textareaS}/></div>
                  <div style={{display:'flex',gap:10}}><button onClick={()=>submitBid(bid.id)} disabled={bidSaving} style={btnS(GREEN)}>{bidSaving?'Submitting...':'Submit Bid'}</button><button onClick={()=>setBidFormOpen(null)} style={btnS(BORDER)}>Cancel</button></div>
                </div>
              ):<button onClick={()=>setBidFormOpen(bid.id)} style={{...btnS(GOLD),marginTop:14}}>Prepare Bid Response</button>}
            </div>
          ))}
        </div>

        {/* Submitted Bids */}
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Previously Submitted Bids</div>
          {submitted.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No bid submissions yet</div>:(
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Bid Package','Amount','Submitted','Status'].map(h=><th key={h} style={{textAlign:'left',padding:'8px 12px',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',borderBottom:`1px solid ${BORDER}`}}>{h}</th>)}</tr></thead>
              <tbody>{submitted.map(bid=>(
                <tr key={bid.id} style={{borderBottom:`1px solid ${BORDER}44`}}>
                  <td style={{padding:'10px 12px',fontSize:13,color:TEXT}}>{bid.title}</td>
                  <td style={{padding:'10px 12px',fontSize:13,color:TEXT,fontWeight:600}}>{bid.submitted_amount?fmt(bid.submitted_amount):'--'}</td>
                  <td style={{padding:'10px 12px',fontSize:12,color:DIM}}>{fmtDate(bid.due_date)}</td>
                  <td style={{padding:'10px 12px'}}><span style={badge(bid.status)}>{bid.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  TAB 3: SCHEDULE & TASKS                                        */
  /* ================================================================ */
  const renderSchedule=()=>{
    const sorted=[...tasks].sort((a,b)=>new Date(a.start_date).getTime()-new Date(b.start_date).getTime());
    const minD=sorted.length?new Date(sorted[0].start_date).getTime():Date.now();
    const maxD=sorted.length?Math.max(...sorted.map(t=>new Date(t.end_date).getTime())):Date.now()+86400000*30;
    const phases=[...new Set(tasks.map(t=>t.phase))];
    const conflicts=data.schedule_conflicts||[];
    return(
      <div style={{display:'grid',gap:20}}>
        {conflicts.length>0&&(
          <div style={{...card(),borderColor:RED+'55',background:RED+'08'}}>
            <div style={{fontSize:15,fontWeight:700,color:RED,marginBottom:10}}>{'\u26A0'} Schedule Conflicts</div>
            {conflicts.map((c,i)=><div key={i} style={{padding:'8px 0',fontSize:13,color:TEXT,borderBottom:i<conflicts.length-1?`1px solid ${BORDER}44`:'none'}}>{c}</div>)}
          </div>
        )}

        {/* Gantt */}
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Schedule Overview</div>
          {tasks.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No schedule data available</div>:(
            <div style={{overflowX:'auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:8,fontSize:10,color:DIM}}>
                <span>{fmtDate(new Date(minD).toISOString())}</span><span>{fmtDate(new Date((minD+maxD)/2).toISOString())}</span><span>{fmtDate(new Date(maxD).toISOString())}</span>
              </div>
              <div style={{position:'relative',minHeight:sorted.length*34+10}}>
                {[0,25,50,75,100].map(p=><div key={p} style={{position:'absolute',left:`${p}%`,top:0,bottom:0,width:1,background:BORDER+'44'}}/>)}
                {sorted.map(task=><GanttBar key={task.id} task={task} minDate={minD} maxDate={maxD}/>)}
              </div>
            </div>
          )}
        </div>

        {/* Per-phase checklists */}
        {phases.map(phase=>{
          const pt=tasks.filter(t=>t.phase===phase);
          const pc=pt.reduce((a,t)=>a+t.percent_complete,0)/(pt.length||1);
          return(
            <div key={phase} style={card()}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                <div style={{fontSize:15,fontWeight:700,color:TEXT}}>{phase}</div>
                <div style={{fontSize:12,color:pc>=1?GREEN:DIM}}>{Math.round(pc*100)}% Complete</div>
              </div>
              <ProgressBar value={pc*100} color={pc>=1?GREEN:pc>=.5?BLUE:AMBER}/>
              <div style={{marginTop:14}}>
                {pt.map(task=>{const cv=taskUpdates[task.id]??Math.round(task.percent_complete*100);return(
                  <div key={task.id} style={{padding:'10px 0',borderBottom:`1px solid ${BORDER}44`,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                    <input type="checkbox" checked={task.percent_complete>=1} readOnly style={{width:18,height:18,accentColor:GREEN,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:150}}>
                      <div style={{fontSize:13,fontWeight:600,color:task.percent_complete>=1?GREEN:TEXT}}>{task.title}</div>
                      <div style={{fontSize:11,color:DIM}}>{fmtDate(task.start_date)} - {fmtDate(task.end_date)}</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8,minWidth:180}}>
                      <input type="range" min={0} max={100} value={cv} onChange={e=>updateTaskProgress(task.id,parseInt(e.target.value))} style={{flex:1,accentColor:GOLD}}/>
                      <span style={{fontSize:12,fontWeight:700,color:GOLD,width:36,textAlign:'right'}}>{cv}%</span>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /* ================================================================ */
  /*  TAB 4: DAILY REPORTING                                         */
  /* ================================================================ */
  const renderDaily=()=>(
    <div style={{display:'grid',gap:20}}>
      {!isOnline&&<div style={{padding:'10px 16px',background:AMBER+'22',border:`1px solid ${AMBER}`,borderRadius:8,display:'flex',alignItems:'center',gap:10}}><div style={{width:10,height:10,borderRadius:'50%',background:AMBER}}/><span style={{fontSize:13,color:AMBER,fontWeight:600}}>You are offline. Logs will be queued and submitted when connection is restored.</span></div>}

      {/* GPS Clock */}
      <div style={card()}>
        <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:14}}>GPS Clock In / Out</div>
        <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'center'}}>
          <button onClick={handleClockIn} disabled={gpsStatus==='clocked_in'} style={{...btnS(gpsStatus==='clocked_in'?GREEN:BLUE),opacity:gpsStatus==='clocked_in'?.6:1}}>{gpsStatus==='clocked_in'?'Clocked In':'Clock In'}</button>
          <button onClick={handleClockOut} disabled={gpsStatus!=='clocked_in'} style={{...btnS(RED),opacity:gpsStatus!=='clocked_in'?.5:1}}>Clock Out</button>
          {clockInTime&&<span style={{fontSize:12,color:GREEN}}>In: {new Date(clockInTime).toLocaleTimeString()}</span>}
          {clockOutTime&&<span style={{fontSize:12,color:RED}}>Out: {new Date(clockOutTime).toLocaleTimeString()}</span>}
          {gpsCoords&&<span style={{fontSize:11,color:DIM}}>GPS: {gpsCoords.lat.toFixed(4)}, {gpsCoords.lng.toFixed(4)}</span>}
        </div>
      </div>

      {/* Daily Log Form */}
      <div style={card()}>
        <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Submit Daily Log</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16,marginBottom:16}}>
          <div><div style={labelS}>Crew Count</div><input type="number" value={dlForm.crew_count} onChange={e=>setDlForm(f=>({...f,crew_count:e.target.value}))} placeholder="Number of workers" style={inputS}/></div>
          <div><div style={labelS}>Hours Worked</div><input type="number" step="0.5" value={dlForm.hours_worked} onChange={e=>setDlForm(f=>({...f,hours_worked:e.target.value}))} placeholder="Total hours" style={inputS}/></div>
        </div>
        <div style={{marginBottom:16}}><div style={labelS}>Work Completed Today *</div><textarea value={dlForm.work_completed} onChange={e=>setDlForm(f=>({...f,work_completed:e.target.value}))} placeholder="Describe all work completed today..." style={textareaS}/></div>
        <div style={{marginBottom:16}}><div style={labelS}>Work Planned for Tomorrow</div><textarea value={dlForm.work_planned} onChange={e=>setDlForm(f=>({...f,work_planned:e.target.value}))} placeholder="What is planned for the next work day..." style={textareaS}/></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:16,marginBottom:16}}>
          <div><div style={labelS}>Safety Incidents</div><textarea value={dlForm.safety_incidents} onChange={e=>setDlForm(f=>({...f,safety_incidents:e.target.value}))} placeholder="Any safety incidents or near-misses (leave blank if none)" style={{...textareaS,minHeight:60}}/></div>
          <div><div style={labelS}>Material Deliveries</div><textarea value={dlForm.material_deliveries} onChange={e=>setDlForm(f=>({...f,material_deliveries:e.target.value}))} placeholder="List any material deliveries received today" style={{...textareaS,minHeight:60}}/></div>
        </div>
        <div style={{marginBottom:16}}>
          <div style={labelS}>Photos</div>
          <input type="file" multiple accept="image/*" onChange={e=>setDlForm(f=>({...f,photos:Array.from(e.target.files||[])}))} style={{...inputS,padding:'8px 14px'}}/>
          {dlForm.photos.length>0&&<div style={{fontSize:12,color:GREEN,marginTop:4}}>{dlForm.photos.length} photo(s) selected</div>}
        </div>
        <button onClick={submitDailyLog} disabled={dlSaving} style={btnS(GREEN)}>{dlSaving?'Submitting...':'Submit Daily Log'}</button>
      </div>

      {/* Previous Logs */}
      <div style={card()}>
        <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Previous Daily Logs</div>
        {dailyLogs.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No daily logs submitted yet. Submit your first log above.</div>:
        dailyLogs.map(log=>(
          <div key={log.id} style={{padding:16,background:BG,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8}}>
              <div style={{fontSize:15,fontWeight:700,color:TEXT}}>{fmtDate(log.date)}</div>
              <span style={badge(log.status)}>{log.status.replace(/_/g,' ')}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:10}}>
              <div style={{fontSize:12}}><span style={{color:DIM}}>Crew:</span> <span style={{color:TEXT,fontWeight:600}}>{log.crew_count}</span></div>
              <div style={{fontSize:12}}><span style={{color:DIM}}>Hours:</span> <span style={{color:TEXT,fontWeight:600}}>{log.hours_worked}h</span></div>
              {log.clock_in&&<div style={{fontSize:12}}><span style={{color:DIM}}>In:</span> <span style={{color:GREEN,fontWeight:600}}>{new Date(log.clock_in).toLocaleTimeString()}</span></div>}
              {log.clock_out&&<div style={{fontSize:12}}><span style={{color:DIM}}>Out:</span> <span style={{color:RED,fontWeight:600}}>{new Date(log.clock_out).toLocaleTimeString()}</span></div>}
            </div>
            <div style={{fontSize:13,color:TEXT,marginBottom:6,lineHeight:1.5}}>{log.work_completed}</div>
            {log.gc_comments&&<div style={{padding:'8px 12px',background:BLUE+'11',border:`1px solid ${BLUE}44`,borderRadius:6,marginTop:8}}><div style={{fontSize:11,fontWeight:700,color:BLUE,marginBottom:4}}>GC Comment:</div><div style={{fontSize:12,color:TEXT}}>{log.gc_comments}</div></div>}
            {log.status==='correction_requested'&&log.correction_note&&<div style={{padding:'8px 12px',background:AMBER+'11',border:`1px solid ${AMBER}44`,borderRadius:6,marginTop:8}}><div style={{fontSize:11,fontWeight:700,color:AMBER,marginBottom:4}}>Correction Requested:</div><div style={{fontSize:12,color:TEXT}}>{log.correction_note}</div></div>}
          </div>
        ))}
      </div>
    </div>
  );

  /* ================================================================ */
  /*  TAB 5: PAY APPLICATIONS                                       */
  /* ================================================================ */
  const renderPayApps=()=>{
    const statusOrder=['submitted','under_review','approved','paid'];
    return(
      <div style={{display:'grid',gap:20}}>
        <div style={{display:'flex',gap:0}}>
          {(['history','new'] as const).map(t=><button key={t} onClick={()=>setPaTab(t)} style={{padding:'10px 24px',background:paTab===t?GOLD+'22':'transparent',color:paTab===t?GOLD:DIM,border:`1px solid ${paTab===t?GOLD:BORDER}`,fontWeight:700,fontSize:13,cursor:'pointer',borderRadius:t==='history'?'8px 0 0 8px':'0 8px 8px 0'}}>{t==='history'?'Payment History':'New Pay App'}</button>)}
        </div>

        {paTab==='new'?(
          <div style={card()}>
            <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Submit Pay Application</div>
            {paForm.line_items.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No schedule of values found. Contact your GC to set up line items.</div>:(
              <div>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',minWidth:500}}>
                    <thead><tr>{['Description','This Period ($)','Stored Materials ($)'].map(h=><th key={h} style={{textAlign:'left',padding:'8px 12px',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',borderBottom:`1px solid ${BORDER}`}}>{h}</th>)}</tr></thead>
                    <tbody>{paForm.line_items.map((li,i)=>(
                      <tr key={i} style={{borderBottom:`1px solid ${BORDER}44`}}>
                        <td style={{padding:'8px 12px',fontSize:13,color:TEXT}}>{li.description}</td>
                        <td style={{padding:'8px 12px'}}><input type="number" value={li.this_period} onChange={e=>{const items=[...paForm.line_items];items[i]={...items[i],this_period:e.target.value};setPaForm({line_items:items});}} placeholder="0.00" style={{...inputS,width:120}}/></td>
                        <td style={{padding:'8px 12px'}}><input type="number" value={li.stored_materials} onChange={e=>{const items=[...paForm.line_items];items[i]={...items[i],stored_materials:e.target.value};setPaForm({line_items:items});}} placeholder="0.00" style={{...inputS,width:120}}/></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:16}}>
                  <div style={{fontSize:14,color:DIM}}>Total This Period: <strong style={{color:GOLD}}>{fmt(paForm.line_items.reduce((a,li)=>a+(parseFloat(li.this_period)||0)+(parseFloat(li.stored_materials)||0),0))}</strong></div>
                  <button onClick={submitPayApp} disabled={paSaving} style={btnS(GREEN)}>{paSaving?'Submitting...':'Submit Pay Application'}</button>
                </div>
              </div>
            )}
          </div>
        ):(
          <>
            {payApps.length===0?(
              <div style={{...card(),textAlign:'center',padding:40}}>
                <div style={{fontSize:36,marginBottom:12,color:DIM}}>{'\u{1F4B0}'}</div>
                <div style={{fontSize:15,fontWeight:700,color:TEXT}}>No Pay Applications Yet</div>
                <div style={{fontSize:13,color:DIM,marginTop:6}}>Submit your first pay application to get started.</div>
              </div>
            ):payApps.map(pa=>(
              <div key={pa.id} style={card()}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:10}}>
                  <div><div style={{fontSize:16,fontWeight:700,color:TEXT}}>Pay App #{pa.app_number}</div><div style={{fontSize:12,color:DIM}}>Period: {fmtDate(pa.period_start)} - {fmtDate(pa.period_end)}</div></div>
                  <span style={badge(pa.status)}>{pa.status.replace(/_/g,' ')}</span>
                </div>

                {/* Timeline */}
                <div style={{display:'flex',alignItems:'center',gap:0,marginBottom:16,overflowX:'auto'}}>
                  {statusOrder.map((s,i)=>{const reached=statusOrder.indexOf(pa.status)>=i;return(
                    <React.Fragment key={s}>
                      {i>0&&<div style={{flex:1,height:2,background:reached?GREEN:BORDER,minWidth:30}}/>}
                      <div style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:70}}>
                        <div style={{width:24,height:24,borderRadius:'50%',background:reached?GREEN:BORDER,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:reached?'#fff':DIM,fontWeight:700}}>{reached?'\u2713':i+1}</div>
                        <div style={{fontSize:10,color:reached?TEXT:DIM,marginTop:4,textTransform:'capitalize'}}>{s.replace(/_/g,' ')}</div>
                      </div>
                    </React.Fragment>
                  )})}
                </div>

                {/* Amounts */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,marginBottom:14}}>
                  <div style={{padding:'10px 14px',background:BG,borderRadius:6,border:`1px solid ${BORDER}`}}><div style={{fontSize:10,color:DIM,textTransform:'uppercase'}}>Requested</div><div style={{fontSize:16,fontWeight:700,color:TEXT}}>{fmt(pa.total_amount)}</div></div>
                  <div style={{padding:'10px 14px',background:BG,borderRadius:6,border:`1px solid ${BORDER}`}}><div style={{fontSize:10,color:DIM,textTransform:'uppercase'}}>Approved</div><div style={{fontSize:16,fontWeight:700,color:GREEN}}>{fmt(pa.approved_amount)}</div></div>
                  {pa.paid_date&&<div style={{padding:'10px 14px',background:GREEN+'11',borderRadius:6,border:`1px solid ${GREEN}44`}}><div style={{fontSize:10,color:GREEN,textTransform:'uppercase'}}>Paid</div><div style={{fontSize:14,fontWeight:700,color:GREEN}}>{fmtDate(pa.paid_date)}</div><div style={{fontSize:10,color:DIM}}>{pa.payment_method}</div></div>}
                </div>

                {/* Line Items */}
                {pa.line_items&&pa.line_items.length>0&&(
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
                      <thead><tr>{['Item','Scheduled','Prev','This Period','Total','GC Status'].map(h=><th key={h} style={{textAlign:'left',padding:'6px 10px',fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',borderBottom:`1px solid ${BORDER}`}}>{h}</th>)}</tr></thead>
                      <tbody>{pa.line_items.map(li=>(
                        <tr key={li.id} style={{borderBottom:`1px solid ${BORDER}44`}}>
                          <td style={{padding:'8px 10px',fontSize:12,color:TEXT}}>{li.description}</td>
                          <td style={{padding:'8px 10px',fontSize:12,color:DIM}}>{fmt(li.scheduled_value)}</td>
                          <td style={{padding:'8px 10px',fontSize:12,color:DIM}}>{fmt(li.previous_completed)}</td>
                          <td style={{padding:'8px 10px',fontSize:12,color:TEXT,fontWeight:600}}>{fmt(li.this_period)}</td>
                          <td style={{padding:'8px 10px',fontSize:12,color:TEXT}}>{fmt(li.total_completed)}</td>
                          <td style={{padding:'8px 10px'}}><span style={badge(li.gc_status)}>{li.gc_status}</span>{li.gc_notes&&<div style={{fontSize:10,color:AMBER,marginTop:2}}>{li.gc_notes}</div>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}

                {/* Lien Waiver */}
                {(pa.status==='approved'||pa.status==='paid')&&(
                  <div style={{marginTop:14,padding:'12px 16px',background:PURPLE+'11',border:`1px solid ${PURPLE}44`,borderRadius:8}}>
                    <div style={{fontSize:13,fontWeight:700,color:PURPLE,marginBottom:4}}>Lien Waiver: {pa.status==='paid'?'Unconditional':'Conditional'} Required</div>
                    <div style={{fontSize:12,color:DIM}}>{pa.status==='paid'?`Unconditional lien waiver for ${fmt(pa.approved_amount)} is ready for execution.`:`Conditional lien waiver for ${fmt(pa.approved_amount)} -- will convert to unconditional upon payment.`}</div>
                    <button style={{...btnS(PURPLE,true),marginTop:8}}>Sign Lien Waiver</button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  /* ================================================================ */
  /*  TAB 6: DOCUMENTS & COMPLIANCE                                  */
  /* ================================================================ */
  const renderDocuments=()=>{
    const docTypes=['Insurance Certificate','W-9','Business License','Bond','Safety Certification'];
    return(
      <div style={{display:'grid',gap:20}}>
        {/* Upload */}
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Upload Compliance Document</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16,marginBottom:16}}>
            <div><div style={labelS}>Document Type *</div><select value={docUploadType} onChange={e=>setDocUploadType(e.target.value)} style={{...inputS,cursor:'pointer'}}><option value="">Select type...</option>{docTypes.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div><div style={labelS}>Expiration Date</div><input type="date" value={docExpiry} onChange={e=>setDocExpiry(e.target.value)} style={inputS}/></div>
          </div>
          <div style={{marginBottom:16}}><div style={labelS}>File *</div><input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e=>setDocFile(e.target.files?.[0]||null)} style={{...inputS,padding:'8px 14px'}}/></div>
          <button onClick={uploadDoc} disabled={docUploading} style={btnS(BLUE)}>{docUploading?'Uploading...':'Upload Document'}</button>
        </div>

        {/* Compliance Grid */}
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Compliance Status</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14}}>
            {docTypes.map(type=>{const doc=compliance.find(d=>d.type===type);const s=compStatus(type);const c=compColor(s);const dl=doc?.expiration_date?Math.ceil((new Date(doc.expiration_date).getTime()-Date.now())/86400000):null;return(
              <div key={type} style={{padding:16,background:BG,borderRadius:8,border:`1px solid ${c}44`,position:'relative'}}>
                <div style={{position:'absolute',top:12,right:12,width:10,height:10,borderRadius:'50%',background:c}}/>
                <div style={{fontSize:14,fontWeight:700,color:TEXT,marginBottom:6}}>{type}</div>
                {doc?(<div>
                  <div style={{fontSize:12,color:DIM,marginBottom:4}}>File: {doc.file_name}</div>
                  <div style={{fontSize:12,color:DIM,marginBottom:4}}>Uploaded: {fmtDate(doc.uploaded_at)}</div>
                  {doc.expiration_date&&<div style={{fontSize:12,color:c,fontWeight:600,marginBottom:4}}>{dl!==null&&dl<=0?'EXPIRED':dl!==null&&dl<=30?`Expires in ${dl} days`:`Expires: ${fmtDate(doc.expiration_date)}`}</div>}
                  <span style={badge(doc.status)}>{doc.status}</span>
                  {doc.notes&&<div style={{fontSize:11,color:AMBER,marginTop:6}}>{doc.notes}</div>}
                </div>):(<div style={{fontSize:12,color:RED,fontWeight:600}}>Not uploaded -- action required</div>)}
              </div>
            )})}
          </div>
        </div>

        {/* Expiration Alerts */}
        {(()=>{const expiring=compliance.filter(d=>{if(!d.expiration_date)return false;const days=Math.ceil((new Date(d.expiration_date).getTime()-Date.now())/86400000);return days<=30&&days>0;});return expiring.length>0?(
          <div style={{...card(),borderColor:AMBER+'55',background:AMBER+'08'}}>
            <div style={{fontSize:15,fontWeight:700,color:AMBER,marginBottom:10}}>{'\u26A0'} Expiration Alerts</div>
            {expiring.map(doc=>{const days=Math.ceil((new Date(doc.expiration_date!).getTime()-Date.now())/86400000);return<div key={doc.id} style={{padding:'8px 0',fontSize:13,color:TEXT,borderBottom:`1px solid ${BORDER}44`}}><strong style={{color:AMBER}}>{doc.type}</strong> expires in {days} day{days!==1?'s':''} ({fmtDate(doc.expiration_date!)})</div>})}
          </div>
        ):null})()}

        {/* Shared Docs */}
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Shared Project Documents</div>
          {sharedDocs.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No shared documents available</div>:(
            <div style={{display:'grid',gap:8}}>
              {sharedDocs.map(doc=>(
                <div key={doc.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',background:BG,borderRadius:6,border:`1px solid ${BORDER}`}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontSize:20}}>{'\u{1F4C4}'}</span>
                    <div><div style={{fontSize:13,fontWeight:600,color:TEXT}}>{doc.name}</div><div style={{fontSize:11,color:DIM}}>{doc.category} &middot; {fmtDate(doc.uploaded_at)}</div></div>
                  </div>
                  <button style={btnS(BLUE,true)}>Download</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RFI Form */}
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Submit RFI (Request for Information)</div>
          <div style={{marginBottom:14}}><div style={labelS}>Subject *</div><input type="text" value={rfiForm.subject} onChange={e=>setRfiForm(f=>({...f,subject:e.target.value}))} placeholder="Brief description of the question" style={inputS}/></div>
          <div style={{marginBottom:14}}><div style={labelS}>Description</div><textarea value={rfiForm.description} onChange={e=>setRfiForm(f=>({...f,description:e.target.value}))} placeholder="Detailed question or request..." style={textareaS}/></div>
          <div style={{marginBottom:14}}><div style={labelS}>Urgency</div><select value={rfiForm.urgency} onChange={e=>setRfiForm(f=>({...f,urgency:e.target.value}))} style={{...inputS,cursor:'pointer'}}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div>
          <button onClick={submitRfi} disabled={rfiSaving} style={btnS(PURPLE)}>{rfiSaving?'Submitting...':'Submit RFI'}</button>
        </div>

        {/* RFI History */}
        {rfis.length>0&&(
          <div style={card()}>
            <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>RFI History</div>
            {rfis.map(rfi=>(
              <div key={rfi.id} style={{padding:14,background:BG,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,flexWrap:'wrap',gap:8}}>
                  <div style={{fontSize:14,fontWeight:700,color:TEXT}}>{rfi.subject}</div><span style={badge(rfi.status)}>{rfi.status}</span>
                </div>
                <div style={{fontSize:12,color:DIM}}>Submitted: {fmtDate(rfi.submitted_at)}</div>
                {rfi.response&&<div style={{marginTop:8,padding:'8px 12px',background:GREEN+'11',borderRadius:6,border:`1px solid ${GREEN}44`}}><div style={{fontSize:11,fontWeight:700,color:GREEN,marginBottom:4}}>Response ({fmtDate(rfi.responded_at)}):</div><div style={{fontSize:12,color:TEXT,lineHeight:1.5}}>{rfi.response}</div></div>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  /* ================================================================ */
  /*  TAB 7: SCORECARD                                               */
  /* ================================================================ */
  const renderScorecard=()=>{
    const cats:{key:keyof ScoreEntry;label:string;icon:string}[]=[
      {key:'quality',label:'Quality',icon:'\u2726'},{key:'schedule',label:'Schedule',icon:'\u23F0'},
      {key:'communication',label:'Communication',icon:'\u2709'},{key:'safety',label:'Safety',icon:'\u26A1'},
    ];
    const tips:Record<string,string[]>={
      quality:['Submit punch list items promptly','Follow specs to the letter','Self-inspect before requesting GC inspection'],
      schedule:['Submit daily logs on time','Update percent complete weekly','Communicate delays immediately'],
      communication:['Respond to RFIs within 24 hours','Keep daily logs detailed','Proactively flag issues'],
      safety:['Zero safety incidents','Complete daily safety toolbox talks','Keep certifications current'],
    };
    return(
      <div style={{display:'grid',gap:20}}>
        {/* Overall */}
        <div style={{...card(),background:`linear-gradient(135deg,${RAISED},${BG})`,textAlign:'center'}}>
          {data.is_preferred&&<div style={{marginBottom:16,display:'inline-flex',alignItems:'center',gap:10,background:GOLD+'22',border:`1px solid ${GOLD}`,borderRadius:30,padding:'8px 20px'}}><span style={{fontSize:22}}>{'\u2B50'}</span><span style={{fontSize:15,fontWeight:800,color:GOLD}}>Preferred Subcontractor</span></div>}
          <div style={{fontSize:56,fontWeight:800,color:GOLD}}>{(data.overall_score||avgScore).toFixed(1)}</div>
          <Stars rating={data.overall_score||avgScore} size={28}/>
          <div style={{fontSize:14,color:DIM,marginTop:8}}>Overall Performance Rating</div>
          {data.avg_score>0&&<div style={{fontSize:12,color:(data.overall_score||avgScore)>=data.avg_score?GREEN:AMBER,marginTop:8}}>{(data.overall_score||avgScore)>=data.avg_score?`You are above average (avg: ${data.avg_score.toFixed(1)})`:`Industry average: ${data.avg_score.toFixed(1)} -- room to improve`}</div>}
        </div>

        {/* Category Cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:16}}>
          {cats.map(cat=>{const avg=scores.length?scores.reduce((a,s)=>a+(s[cat.key] as number),0)/scores.length:0;const color=avg>=4?GREEN:avg>=3?AMBER:avg>=1?RED:DIM;return(
            <div key={cat.key} style={card()}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}><span style={{fontSize:22}}>{cat.icon}</span><div style={{fontSize:15,fontWeight:700,color:TEXT}}>{cat.label}</div></div>
              <div style={{textAlign:'center',marginBottom:12}}><div style={{fontSize:32,fontWeight:800,color}}>{avg.toFixed(1)}</div><Stars rating={avg} size={18}/></div>
              <ProgressBar value={avg*20} color={color} height={6}/>
            </div>
          )})}
        </div>

        {/* Trend */}
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Score Trend Over Time</div>
          {data.score_trend&&data.score_trend.length>=2?<div style={{display:'flex',justifyContent:'center'}}><TrendChart data={data.score_trend} width={Math.min(600,280)} height={100}/></div>:
          <div style={{color:DIM,fontSize:13,textAlign:'center',padding:30}}>Not enough data points to display trend. Scores will appear after multiple evaluations.</div>}
        </div>

        {/* Per-project */}
        {scores.length>0&&(
          <div style={card()}>
            <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Per-Project Score Breakdown</div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:500}}>
                <thead><tr>{['Project','Quality','Schedule','Communication','Safety','Avg'].map(h=><th key={h} style={{textAlign:'left',padding:'8px 12px',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',borderBottom:`1px solid ${BORDER}`}}>{h}</th>)}</tr></thead>
                <tbody>{scores.map((s,i)=>{const a=(s.quality+s.schedule+s.communication+s.safety)/4;return(
                  <tr key={i} style={{borderBottom:`1px solid ${BORDER}44`}}>
                    <td style={{padding:'10px 12px',fontSize:13,color:TEXT,fontWeight:600}}>{s.project_name}</td>
                    <td style={{padding:'10px 12px'}}><Stars rating={s.quality} size={14}/></td>
                    <td style={{padding:'10px 12px'}}><Stars rating={s.schedule} size={14}/></td>
                    <td style={{padding:'10px 12px'}}><Stars rating={s.communication} size={14}/></td>
                    <td style={{padding:'10px 12px'}}><Stars rating={s.safety} size={14}/></td>
                    <td style={{padding:'10px 12px',fontSize:13,fontWeight:700,color:a>=4?GREEN:a>=3?AMBER:RED}}>{a.toFixed(1)}</td>
                  </tr>
                )})}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tips */}
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Tips to Improve Your Score</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:16}}>
            {cats.map(cat=>{const avg=scores.length?scores.reduce((a,s)=>a+(s[cat.key] as number),0)/scores.length:0;if(avg>=4.5)return null;return(
              <div key={cat.key} style={{padding:14,background:BG,borderRadius:8,border:`1px solid ${BORDER}`}}>
                <div style={{fontSize:13,fontWeight:700,color:GOLD,marginBottom:10}}>{cat.icon} {cat.label}</div>
                {(tips[cat.key as string]||[]).map((tip,i)=><div key={i} style={{display:'flex',gap:8,marginBottom:6,fontSize:12,color:DIM}}><span style={{color:GREEN,flexShrink:0}}>{'\u2192'}</span><span>{tip}</span></div>)}
              </div>
            )})}
          </div>
        </div>

        {/* Comparison */}
        {data.avg_score>0&&(
          <div style={card()}>
            <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>How You Compare (Anonymized Industry Average)</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16}}>
              {cats.map(cat=>{const yours=scores.length?scores.reduce((a,s)=>a+(s[cat.key] as number),0)/scores.length:0;const ind=data.avg_score;const diff=yours-ind;return(
                <div key={cat.key} style={{textAlign:'center'}}>
                  <div style={{fontSize:12,color:DIM,marginBottom:8}}>{cat.label}</div>
                  <div style={{display:'flex',justifyContent:'center',alignItems:'flex-end',gap:12,height:80}}>
                    <div style={{width:40,textAlign:'center'}}><div style={{width:40,background:GOLD,borderRadius:'4px 4px 0 0',height:Math.max(8,yours*14)}}/><div style={{fontSize:10,color:GOLD,marginTop:4}}>You</div></div>
                    <div style={{width:40,textAlign:'center'}}><div style={{width:40,background:DIM+'66',borderRadius:'4px 4px 0 0',height:Math.max(8,ind*14)}}/><div style={{fontSize:10,color:DIM,marginTop:4}}>Avg</div></div>
                  </div>
                  <div style={{fontSize:12,fontWeight:700,color:diff>=0?GREEN:RED,marginTop:6}}>{diff>=0?'+':''}{diff.toFixed(1)}</div>
                </div>
              )})}
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ================================================================ */
  /*  RENDER ACTIVE TAB                                              */
  /* ================================================================ */
  const renderContent=()=>{switch(tab){case'dashboard':return renderDashboard();case'bids':return renderBids();case'schedule':return renderSchedule();case'daily':return renderDaily();case'payapps':return renderPayApps();case'documents':return renderDocuments();case'scorecard':return renderScorecard();}};

  /* ================================================================ */
  /*  MAIN LAYOUT                                                    */
  /* ================================================================ */
  return(
    <div style={{minHeight:'100vh',background:BG,fontFamily:'system-ui,-apple-system,sans-serif',color:TEXT}}>
      {toast&&<div style={{position:'fixed',top:20,right:20,zIndex:9999,background:RAISED,border:`1px solid ${GOLD}`,borderRadius:10,padding:'12px 20px',color:TEXT,fontSize:13,fontWeight:600,boxShadow:'0 8px 32px rgba(0,0,0,.5)',animation:'fadeIn .3s ease'}}>{toast}</div>}
      {!isOnline&&<div style={{background:RED,color:'#fff',textAlign:'center',padding:'6px 16px',fontSize:12,fontWeight:700}}>You are currently offline. Changes will sync when connection is restored.</div>}

      {/* Header */}
      <header style={{background:RAISED,borderBottom:`1px solid ${BORDER}`,padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:26}}>{'\u{1F335}'}</span>
          <div><span style={{fontWeight:800,fontSize:16,color:GOLD,letterSpacing:1}}>SAGUARO</span><span style={{fontSize:12,color:DIM,marginLeft:8}}>Subcontractor Portal</span></div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{textAlign:'right'}}><div style={{fontSize:13,fontWeight:700,color:TEXT}}>{data.company_name}</div><div style={{fontSize:11,color:DIM}}>{data.project_name} &middot; {data.trade}</div></div>
          {data.is_preferred&&<span style={{fontSize:18,color:GOLD}} title="Preferred Subcontractor">{'\u2B50'}</span>}
        </div>
      </header>

      {/* Tabs */}
      <nav style={{background:RAISED,borderBottom:`1px solid ${BORDER}`,overflowX:'auto',display:'flex'}}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>{setTab(t.key);setMobileMenu(false);}} style={{padding:'12px 20px',background:'transparent',border:'none',borderBottom:tab===t.key?`2px solid ${GOLD}`:'2px solid transparent',color:tab===t.key?GOLD:DIM,fontSize:13,fontWeight:tab===t.key?700:500,cursor:'pointer',whiteSpace:'nowrap',transition:'color .2s,border .2s',display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:14}}>{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main style={{maxWidth:1100,margin:'0 auto',padding:'24px 20px'}}>{renderContent()}</main>

      {/* Footer */}
      <footer style={{textAlign:'center',padding:'24px 20px',borderTop:`1px solid ${BORDER}`,marginTop:40}}>
        <div style={{fontSize:12,color:DIM}}>Powered by <strong style={{color:GOLD}}>Saguaro CRM</strong> &middot; Construction Management Platform</div>
        <div style={{fontSize:10,color:BORDER,marginTop:4}}>&copy; {new Date().getFullYear()} Saguaro. All rights reserved.</div>
      </footer>

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}*{scrollbar-width:thin;scrollbar-color:${BORDER} ${BG}}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:${BG}}::-webkit-scrollbar-thumb{background:${BORDER};border-radius:3px}select option{background:${BG};color:${TEXT}}`}</style>
    </div>
  );
}
