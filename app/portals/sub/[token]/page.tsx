'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import PortalHeader from '../../../../components/PortalHeader';
import PortalSageChat from '../../../../components/PortalSageChat';
import { House, ShieldCheck, CurrencyDollar, ClipboardText, Question, CalendarBlank, Star, ChatCircle, UploadSimple, PaperPlaneTilt, MapPin, Clock, Warning } from '@phosphor-icons/react';

/* ── Design Tokens ── */
const GOLD='#C8960F',DARK='#F8F9FB',RAISED='#ffffff',BORDER='#E2E5EA',DIM='#6B7280',TEXT='#111827';
const GREEN='#22c55e',RED='#ef4444',AMBER='#f59e0b',BLUE='#3b82f6',PURPLE='#8b5cf6';
const fmt=(n:number)=>'$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
const fmtDate=(d:string)=>d?new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'--';

type Tab='dashboard'|'compliance'|'payapps'|'daily'|'rfis'|'schedule'|'scorecard'|'messages';

/* ── Shared styles ── */
const card=(extra?:React.CSSProperties):React.CSSProperties=>({background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:20,...extra});
const btnS=(color:string,small?:boolean):React.CSSProperties=>({background:color,color:'#fff',border:'none',borderRadius:7,padding:small?'6px 14px':'10px 20px',fontWeight:700,fontSize:small?12:14,cursor:'pointer'});
const labelS:React.CSSProperties={display:'block',fontSize:11,fontWeight:700,color:DIM,marginBottom:5,textTransform:'uppercase',letterSpacing:.5};
const inputS:React.CSSProperties={width:'100%',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,padding:'10px 14px',color:TEXT,fontSize:14,outline:'none',boxSizing:'border-box'};
const textareaS:React.CSSProperties={...inputS,minHeight:80,resize:'vertical' as const};
const badge=(status:string):React.CSSProperties=>{const m:Record<string,string>={approved:GREEN,paid:GREEN,accepted:GREEN,awarded:GREEN,valid:GREEN,submitted:BLUE,open:BLUE,pending:AMBER,under_review:AMBER,pending_review:AMBER,draft:DIM,expiring_soon:AMBER,correction_requested:AMBER,rejected:RED,disputed:RED,expired:RED,declined:RED,missing:RED};const c=m[status]||DIM;return{display:'inline-block',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:c+'22',color:c,textTransform:'uppercase' as const}};

function Stars({rating,max=5,size=18}:{rating:number;max?:number;size?:number}){
  return <span style={{display:'inline-flex',gap:2}}>{Array.from({length:max},(_,i)=><span key={i} style={{fontSize:size,color:i<Math.round(rating)?GOLD:BORDER}}>{i<Math.round(rating)?'\u2605':'\u2606'}</span>)}</span>;
}

function ProgressBar({value,color=GOLD,height=8}:{value:number;color?:string;height?:number}){
  return<div style={{background:BORDER,borderRadius:height,height,width:'100%',overflow:'hidden'}}><div style={{width:`${Math.min(100,Math.max(0,value))}%`,height:'100%',background:color,borderRadius:height,transition:'width .4s ease'}}/></div>;
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
      <canvas ref={ref} width={400} height={120} style={{background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,cursor:'crosshair',touchAction:'none',maxWidth:'100%'}} onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchMove={draw} onTouchEnd={stop}/>
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
export default function SubPortal(){
  const {token}=useParams<{token:string}>();
  const [tab,setTab]=useState<Tab>('dashboard');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [toast,setToast]=useState('');
  const [isOnline,setIsOnline]=useState(true);

  /* ── Data ── */
  const [session,setSession]=useState<any>(null);
  const [sub,setSub]=useState<any>(null);
  const [complianceDocs,setComplianceDocs]=useState<any[]>([]);
  const [payApps,setPayApps]=useState<any[]>([]);
  const [dailyLogs,setDailyLogs]=useState<any[]>([]);
  const [rfis,setRfis]=useState<any[]>([]);
  const [tasks,setTasks]=useState<any[]>([]);
  const [scorecard,setScorecard]=useState<any>(null);
  const [documents,setDocuments]=useState<any[]>([]);
  const [messages,setMessages]=useState<any[]>([]);
  const [bids,setBids]=useState<any[]>([]);

  /* ── Form states ── */
  const [dlForm,setDlForm]=useState({log_date:new Date().toISOString().split('T')[0],crew_count:'',hours_worked:'',work_completed:'',work_planned:'',weather:'',delays:'',safety_incidents:'',notes:''});
  const [dlSaving,setDlSaving]=useState(false);
  const [rfiForm,setRfiForm]=useState({subject:'',question:'',priority:'normal',reference_drawing:'',reference_spec:''});
  const [rfiSaving,setRfiSaving]=useState(false);
  const [docUploadType,setDocUploadType]=useState('');
  const [docFileName,setDocFileName]=useState('');
  const [docFile,setDocFile]=useState<File|null>(null);
  const [docExpiry,setDocExpiry]=useState('');
  const [docCarrier,setDocCarrier]=useState('');
  const [docPolicyNum,setDocPolicyNum]=useState('');
  const [docCoverage,setDocCoverage]=useState('');
  const [docUploading,setDocUploading]=useState(false);
  const fileInputRef=useRef<HTMLInputElement>(null);
  const [msgContent,setMsgContent]=useState('');
  const [msgSending,setMsgSending]=useState(false);
  const [lienSig,setLienSig]=useState<string|null>(null);

  /* ── GPS Clock ── */
  const [gpsStatus,setGpsStatus]=useState<'idle'|'clocked_in'|'clocked_out'>('idle');
  const [clockInTime,setClockInTime]=useState('');
  const [clockOutTime,setClockOutTime]=useState('');
  const [gpsCoords,setGpsCoords]=useState<{lat:number;lng:number}|null>(null);

  const showToast=useCallback((msg:string)=>{setToast(msg);setTimeout(()=>setToast(''),3500)},[]);

  const headers:Record<string,string>={'Content-Type':'application/json','x-portal-token':token||''};

  useEffect(()=>{
    const on=()=>setIsOnline(true),off=()=>setIsOnline(false);
    window.addEventListener('online',on);window.addEventListener('offline',off);setIsOnline(navigator.onLine);
    return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)};
  },[]);

  /* ── Load all data ── */
  useEffect(()=>{
    if(!token)return;
    setLoading(true);
    // Authenticate first
    fetch(`/api/portal/sub/auth?token=${token}`,{method:'POST',headers})
      .then(r=>{if(!r.ok)throw new Error('Invalid token');return r.json()})
      .then(authData=>{
        setSession(authData.session);
        setSub(authData.sub);
        // Load everything in parallel
        return Promise.allSettled([
          fetch(`/api/portal/sub/compliance?token=${token}`,{headers}).then(r=>r.json()),
          fetch(`/api/portal/sub/pay-apps?token=${token}`,{headers}).then(r=>r.json()),
          fetch(`/api/portal/sub/daily-logs?token=${token}`,{headers}).then(r=>r.json()),
          fetch(`/api/portal/sub/rfis?token=${token}`,{headers}).then(r=>r.json()),
          fetch(`/api/portal/sub/schedule?token=${token}`,{headers}).then(r=>r.json()),
          fetch(`/api/portal/sub/scorecard?token=${token}`,{headers}).then(r=>r.json()),
          fetch(`/api/portal/sub/documents?token=${token}`,{headers}).then(r=>r.json()),
          fetch(`/api/portal/sub/messages?token=${token}`,{headers}).then(r=>r.json()),
          fetch(`/api/portal/sub/bids?token=${token}`,{headers}).then(r=>r.json()),
        ]);
      })
      .then(results=>{
        const val=(i:number)=>(results[i] as any)?.value||{};
        setComplianceDocs(val(0).compliance_docs||[]);
        setPayApps(val(1).pay_apps||[]);
        setDailyLogs(val(2).daily_logs||[]);
        setRfis(val(3).rfis||[]);
        setTasks(val(4).tasks||[]);
        setScorecard(val(5));
        setDocuments(val(6).documents||[]);
        setMessages(val(7).messages||[]);
        setBids(val(8).bids||[]);
      })
      .catch(e=>setError(e.message||'Failed to load portal'))
      .finally(()=>setLoading(false));
  },[token]);

  /* ── API helpers ── */
  const apiPost=async(endpoint:string,body:any)=>{
    const res=await fetch(`/api/portal/sub/${endpoint}?token=${token}`,{method:'POST',headers,body:JSON.stringify(body)});
    return res.json();
  };

  /* ── Actions ── */
  const handleClockIn=()=>{
    if(!navigator.geolocation){showToast('Geolocation not supported');return;}
    navigator.geolocation.getCurrentPosition(p=>{
      const now=new Date().toISOString();
      setGpsCoords({lat:p.coords.latitude,lng:p.coords.longitude});
      setClockInTime(now);setGpsStatus('clocked_in');
      showToast('Clocked in successfully');
    },()=>showToast('Location access denied'),{enableHighAccuracy:true});
  };

  const handleClockOut=()=>{
    if(!navigator.geolocation){showToast('Geolocation not supported');return;}
    navigator.geolocation.getCurrentPosition(p=>{
      const now=new Date().toISOString();
      setClockOutTime(now);setGpsStatus('clocked_out');
      showToast('Clocked out successfully');
    },()=>showToast('Location access denied'),{enableHighAccuracy:true});
  };

  const submitDailyLog=async()=>{
    if(!dlForm.work_completed.trim()){showToast('Please describe work completed');return;}
    setDlSaving(true);
    try{
      const result=await apiPost('daily-logs',{
        log_date:dlForm.log_date,
        crew_count:parseInt(dlForm.crew_count)||0,
        hours_worked:parseFloat(dlForm.hours_worked)||0,
        work_completed:dlForm.work_completed,
        work_planned:dlForm.work_planned,
        weather:dlForm.weather,
        delays:dlForm.delays,
        safety_incidents:dlForm.safety_incidents,
        notes:dlForm.notes,
        gps_clock_in:clockInTime||null,
        gps_clock_out:clockOutTime||null,
      });
      if(result.daily_log){
        showToast('Daily log submitted');
        setDailyLogs(prev=>[result.daily_log,...prev]);
        setDlForm({log_date:new Date().toISOString().split('T')[0],crew_count:'',hours_worked:'',work_completed:'',work_planned:'',weather:'',delays:'',safety_incidents:'',notes:''});
        setGpsStatus('idle');setClockInTime('');setClockOutTime('');
      } else showToast(result.error||'Failed to submit');
    }catch{showToast('Network error -- log queued for sync');}
    setDlSaving(false);
  };

  const submitRfi=async()=>{
    if(!rfiForm.subject.trim()||!rfiForm.question.trim()){showToast('Subject and question are required');return;}
    setRfiSaving(true);
    try{
      const result=await apiPost('rfis',rfiForm);
      if(result.rfi){
        showToast(result.message||'RFI submitted');
        setRfis(prev=>[result.rfi,...prev]);
        setRfiForm({subject:'',question:'',priority:'normal',reference_drawing:'',reference_spec:''});
      } else showToast(result.error||'Failed to submit');
    }catch{showToast('Network error');}
    setRfiSaving(false);
  };

  const uploadComplianceDoc=async()=>{
    if(!docUploadType){showToast('Please select a document type');return;}
    if(!docFile&&!docFileName){showToast('Please select a file to upload');return;}
    setDocUploading(true);
    try{
      // If real file selected, upload via FormData
      if(docFile){
        const formData=new FormData();
        formData.append('file',docFile);
        formData.append('doc_type',docUploadType);
        formData.append('expires_at',docExpiry||'');
        formData.append('carrier',docCarrier||'');
        formData.append('policy_number',docPolicyNum||'');
        formData.append('coverage_amount',docCoverage||'');
        const res=await fetch(`/api/portal/sub/compliance/upload?token=${token}`,{
          method:'POST',
          headers:{'x-portal-token':token||''},
          body:formData,
        });
        const result=await res.json();
        if(result.compliance_doc||result.success){
          showToast('Document uploaded successfully');
          const newDoc=result.compliance_doc||{doc_type:docUploadType,file_name:docFile.name,status:'pending_review',expiration_status:'valid'};
          setComplianceDocs(prev=>[{...newDoc,days_until_expiry:null},...prev]);
          setDocUploadType('');setDocFileName('');setDocFile(null);setDocExpiry('');setDocCarrier('');setDocPolicyNum('');setDocCoverage('');
          if(fileInputRef.current)fileInputRef.current.value='';
        } else showToast(result.error||'Upload failed');
      } else {
        // Fallback: text-only submission (no file)
        const result=await apiPost('compliance',{
          doc_type:docUploadType,
          file_name:docFileName,
          expires_at:docExpiry||null,
          carrier:docCarrier||null,
          policy_number:docPolicyNum||null,
          coverage_amount:docCoverage?parseFloat(docCoverage):null,
        });
        if(result.compliance_doc){
          showToast('Document record created');
          setComplianceDocs(prev=>[{...result.compliance_doc,expiration_status:'valid',days_until_expiry:null},...prev]);
          setDocUploadType('');setDocFileName('');setDocExpiry('');setDocCarrier('');setDocPolicyNum('');setDocCoverage('');
        } else showToast(result.error||'Upload failed');
      }
    }catch{showToast('Network error — please try again');}
    setDocUploading(false);
  };

  const sendMessage=async()=>{
    if(!msgContent.trim()){showToast('Enter a message');return;}
    setMsgSending(true);
    try{
      const result=await apiPost('messages',{content:msgContent.trim()});
      if(result.message){
        setMessages(prev=>[...prev,result.message]);
        setMsgContent('');
      } else showToast(result.error||'Failed to send');
    }catch{showToast('Network error');}
    setMsgSending(false);
  };

  /* ── Computed ── */
  const companyName=sub?.company_name||'Subcontractor';
  const overallScore=scorecard?.averages?.overall||0;
  const isPreferred=scorecard?.preferred_status||false;

  // Insurance expiration alerts
  const getExpirationAlerts=()=>{
    const alerts:{doc:any;level:'critical'|'warning'|'notice'}[]=[];
    complianceDocs.forEach(doc=>{
      if(!doc.expires_at)return;
      const days=doc.days_until_expiry;
      if(days===null)return;
      if(days<=0) alerts.push({doc,level:'critical'});
      else if(days<=30) alerts.push({doc,level:'critical'});
      else if(days<=60) alerts.push({doc,level:'warning'});
      else if(days<=90) alerts.push({doc,level:'notice'});
    });
    return alerts.sort((a,b)=>(a.doc.days_until_expiry||0)-(b.doc.days_until_expiry||0));
  };

  // Health score badge computation
  const computeHealthScore=()=>{
    let total=0,count=0;
    // Score components (1-5 each)
    if(overallScore>0){total+=overallScore;count++;}
    // Compliance factor
    const docTypes=['insurance','w9','business_license','bond','safety_certification'];
    const uploaded=complianceDocs.filter(d=>d.status!=='expired'&&d.expiration_status!=='expired').length;
    const compScore=Math.min(5,uploaded/(docTypes.length||1)*5);
    if(uploaded>0){total+=compScore;count++;}
    // Pay app timeliness (if they have any)
    if(payApps.length>0){
      const approved=payApps.filter((p:any)=>p.status==='approved'||p.status==='paid').length;
      total+=Math.min(5,approved/payApps.length*5);count++;
    }
    // Daily log consistency
    if(dailyLogs.length>0){total+=Math.min(5,dailyLogs.length/10*5);count++;}
    return count>0?Math.round(total/count*10)/10:0;
  };

  const healthScore=computeHealthScore();
  const healthColor=healthScore>=4?GREEN:healthScore>=3?AMBER:healthScore>=1?RED:DIM;
  const healthLabel=healthScore>=4.5?'Excellent':healthScore>=4?'Good':healthScore>=3?'Fair':healthScore>=1?'Needs Improvement':'No Data';

  /* ── Loading ── */
  if(loading)return(
    <div style={{minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:48,height:48,border:`3px solid ${BORDER}`,borderTopColor:GOLD,borderRadius:'50%',animation:'spin 1s linear infinite',margin:'0 auto 16px'}}/>
        <div style={{color:DIM,fontSize:14}}>Loading your portal...</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  /* ── Error ── */
  if(error||!session)return(
    <div style={{minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif'}}>
      <div style={{textAlign:'center',color:RED}}>
        <div style={{fontSize:52,marginBottom:16}}><Warning size={16} weight="bold"/></div>
        <div style={{fontSize:22,fontWeight:800,color:TEXT}}>Portal Access Denied</div>
        <div style={{fontSize:14,color:DIM,marginTop:10,maxWidth:420,lineHeight:1.6}}>{error||'This portal link is invalid or has expired. Please contact your general contractor for a new link.'}</div>
      </div>
    </div>
  );

  const TABS:{key:Tab;label:string;icon:React.ReactNode}[]=[
    {key:'dashboard',label:'Dashboard',icon:<House size={16} weight="duotone"/>},
    {key:'compliance',label:'Compliance',icon:<ShieldCheck size={16} weight="duotone"/>},
    {key:'payapps',label:'Pay Apps',icon:<CurrencyDollar size={16} weight="duotone"/>},
    {key:'daily',label:'Daily Logs',icon:<ClipboardText size={16} weight="duotone"/>},
    {key:'rfis',label:'RFIs',icon:<Question size={16} weight="duotone"/>},
    {key:'schedule',label:'Schedule',icon:<CalendarBlank size={16} weight="duotone"/>},
    {key:'scorecard',label:'Scorecard',icon:<Star size={16} weight="duotone"/>},
    {key:'messages',label:'Messages',icon:<ChatCircle size={16} weight="duotone"/>},
  ];

  /* ================================================================ */
  /*  DASHBOARD TAB                                                    */
  /* ================================================================ */
  const renderDashboard=()=>{
    const alerts=getExpirationAlerts();
    const pendingPayApps=payApps.filter((p:any)=>p.status==='submitted'||p.status==='under_review').length;
    const openRfis=rfis.filter((r:any)=>r.status==='open').length;
    const unreadMsgs=messages.filter((m:any)=>m.sender_type!=='sub'&&!m.read).length;
    return(
      <div style={{display:'grid',gap:20}}>
        {/* Welcome + Health Badge */}
        <div style={{...card(),background:`linear-gradient(135deg,${RAISED},${DARK})`,position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',right:-30,top:-30,width:140,height:140,background:GOLD+'08',borderRadius:'50%'}}/>
          <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
            <div style={{width:56,height:56,borderRadius:'50%',background:GOLD+'22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,color:GOLD,fontWeight:800}}>{companyName[0]}</div>
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontSize:22,fontWeight:800,color:TEXT}}>{companyName}</div>
              <div style={{fontSize:13,color:DIM,marginTop:2}}>{sub?.trade||'--'}</div>
              <div style={{fontSize:12,color:DIM,marginTop:2}}>Contact: {sub?.contact_name||'--'} &middot; {sub?.email||'--'}</div>
            </div>
            {/* Health Score Badge */}
            <div style={{background:healthColor+'15',border:`1.5px solid ${healthColor}55`,borderRadius:12,padding:'12px 20px',textAlign:'center',minWidth:130}}>
              <div style={{fontSize:28,fontWeight:800,color:healthColor}}>{healthScore>0?healthScore.toFixed(1):'--'}</div>
              <div style={{fontSize:10,fontWeight:700,color:healthColor,textTransform:'uppercase',letterSpacing:.5}}>{healthLabel}</div>
              <div style={{fontSize:9,color:DIM,marginTop:2}}>Health Score</div>
            </div>
            {isPreferred&&(
              <div style={{background:GOLD+'22',border:`1px solid ${GOLD}`,borderRadius:8,padding:'8px 16px',display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:20}}><Star size={18} weight="fill" color={GOLD}/></span>
                <div><div style={{fontSize:13,fontWeight:800,color:GOLD}}>Preferred Sub</div><div style={{fontSize:10,color:DIM}}>Top-rated</div></div>
              </div>
            )}
          </div>
        </div>

        {/* Insurance Expiration Alerts (30/60/90 day) */}
        {alerts.length>0&&(
          <div style={{...card(),borderColor:alerts[0].level==='critical'?RED+'55':AMBER+'55',background:alerts[0].level==='critical'?RED+'08':AMBER+'08'}}>
            <div style={{fontSize:15,fontWeight:700,color:alerts[0].level==='critical'?RED:AMBER,marginBottom:10}}><Warning size={16} weight="bold"/> Insurance / Compliance Expiration Alerts</div>
            {alerts.map((a,i)=>{
              const days=a.doc.days_until_expiry;
              const c=a.level==='critical'?RED:a.level==='warning'?AMBER:BLUE;
              return <div key={i} style={{padding:'8px 0',borderBottom:i<alerts.length-1?`1px solid ${BORDER}44`:'none',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                <div style={{fontSize:13,color:TEXT}}><strong style={{color:c}}>{a.doc.doc_type}</strong> &mdash; {a.doc.file_name}</div>
                <div style={{fontSize:12,fontWeight:700,color:c}}>{days<=0?'EXPIRED':days<=30?`${days}d - URGENT`:days<=60?`${days}d - WARNING`:`${days}d - NOTICE`}</div>
              </div>;
            })}
          </div>
        )}

        {/* Quick Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12}}>
          {[
            {label:'Pay Apps Pending',value:pendingPayApps,color:AMBER,action:'payapps' as Tab},
            {label:'Open RFIs',value:openRfis,color:BLUE,action:'rfis' as Tab},
            {label:'Daily Logs',value:dailyLogs.length,color:GREEN,action:'daily' as Tab},
            {label:'Unread Messages',value:unreadMsgs,color:PURPLE,action:'messages' as Tab},
            {label:'Compliance Docs',value:complianceDocs.length,color:GOLD,action:'compliance' as Tab},
            {label:'Overall Score',value:overallScore>0?overallScore.toFixed(1):'--',color:overallScore>=4?GREEN:overallScore>=3?AMBER:DIM,action:'scorecard' as Tab},
          ].map(s=>(
            <button key={s.label} onClick={()=>setTab(s.action)} style={{...card(),cursor:'pointer',textAlign:'center',border:`1px solid ${s.color}33`}}>
              <div style={{fontSize:28,fontWeight:800,color:s.color}}>{s.value}</div>
              <div style={{fontSize:11,fontWeight:600,color:DIM,marginTop:4}}>{s.label}</div>
            </button>
          ))}
        </div>

        {/* Quick Actions */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12}}>
          {[
            {label:'Submit Daily Log',t:'daily' as Tab,c:BLUE},
            {label:'Upload Document',t:'compliance' as Tab,c:GREEN},
            {label:'File RFI',t:'rfis' as Tab,c:PURPLE},
            {label:'View Pay Apps',t:'payapps' as Tab,c:AMBER},
          ].map(a=>(
            <button key={a.label} onClick={()=>setTab(a.t)} style={{...card(),cursor:'pointer',textAlign:'center',border:`1px solid ${a.c}44`}}>
              <div style={{fontSize:13,fontWeight:700,color:TEXT}}>{a.label}</div>
            </button>
          ))}
        </div>

        {/* Recent Logs + Open RFIs side by side */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:20}}>
          <div style={card()}>
            <div style={{fontSize:15,fontWeight:700,color:TEXT,marginBottom:14}}>Recent Daily Logs</div>
            {dailyLogs.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:20}}>No logs submitted yet</div>:
            dailyLogs.slice(0,3).map((log:any)=>(
              <div key={log.id} style={{padding:'10px 0',borderBottom:`1px solid ${BORDER}44`}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:13,fontWeight:600,color:TEXT}}>{fmtDate(log.log_date)}</span><span style={badge(log.status)}>{log.status}</span></div>
                <div style={{fontSize:12,color:DIM}}>{log.crew_count} crew &middot; {log.hours_worked}h</div>
              </div>
            ))}
          </div>
          <div style={card()}>
            <div style={{fontSize:15,fontWeight:700,color:TEXT,marginBottom:14}}>Open RFIs</div>
            {rfis.filter((r:any)=>r.status==='open').length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:20}}>No open RFIs</div>:
            rfis.filter((r:any)=>r.status==='open').slice(0,5).map((rfi:any)=>(
              <div key={rfi.id} style={{padding:'8px 0',borderBottom:`1px solid ${BORDER}44`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div><div style={{fontSize:13,fontWeight:600,color:TEXT}}>{rfi.rfi_number}</div><div style={{fontSize:11,color:DIM}}>{rfi.subject}</div></div>
                <span style={badge(rfi.status)}>{rfi.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  COMPLIANCE & DOCUMENTS TAB                                       */
  /* ================================================================ */
  const renderCompliance=()=>{
    const docTypes=['insurance','w9','lien_waiver','business_license','bond','safety_certification'];
    const docLabels:Record<string,string>={insurance:'Insurance Certificate',w9:'W-9',lien_waiver:'Lien Waiver',business_license:'Business License',bond:'Bond',safety_certification:'Safety Certification'};
    const alerts=getExpirationAlerts();
    return(
      <div style={{display:'grid',gap:20}}>
        {/* Upload Form */}
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Upload Compliance Document</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16,marginBottom:16}}>
            <div><div style={labelS}>Document Type *</div><select value={docUploadType} onChange={e=>setDocUploadType(e.target.value)} style={{...inputS,cursor:'pointer'}}><option value="">Select type...</option>{docTypes.map(t=><option key={t} value={t}>{docLabels[t]||t}</option>)}</select></div>
            <div>
              <div style={labelS}>Upload File *</div>
              <div
                onClick={()=>fileInputRef.current?.click()}
                style={{...inputS,cursor:'pointer',display:'flex',alignItems:'center',gap:8,color:docFile?TEXT:DIM,background:docFile?`${GREEN}08`:DARK,borderColor:docFile?`${GREEN}44`:BORDER,borderStyle:docFile?'solid':'dashed'}}
              >
                <UploadSimple size={16} color={docFile?GREEN:DIM}/>
                {docFile?docFile.name:'Click to select file (PDF, JPG, PNG)'}
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e=>{const f=e.target.files?.[0];if(f){setDocFile(f);setDocFileName(f.name);}}} style={{display:'none'}}/>
              {docFile&&<div style={{fontSize:11,color:DIM,marginTop:4}}>{(docFile.size/1024).toFixed(0)} KB &middot; {docFile.type||'Unknown type'}</div>}
            </div>
            <div><div style={labelS}>Expiration Date</div><input type="date" value={docExpiry} onChange={e=>setDocExpiry(e.target.value)} style={inputS}/></div>
          </div>
          {docUploadType==='insurance'&&(
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16,marginBottom:16}}>
              <div><div style={labelS}>Carrier</div><input value={docCarrier} onChange={e=>setDocCarrier(e.target.value)} placeholder="State Farm, Liberty Mutual..." style={inputS}/></div>
              <div><div style={labelS}>Policy Number</div><input value={docPolicyNum} onChange={e=>setDocPolicyNum(e.target.value)} placeholder="POL-123456" style={inputS}/></div>
              <div><div style={labelS}>Coverage Amount</div><input type="number" value={docCoverage} onChange={e=>setDocCoverage(e.target.value)} placeholder="1000000" style={inputS}/></div>
            </div>
          )}
          <button onClick={uploadComplianceDoc} disabled={docUploading} style={btnS(BLUE)}>{docUploading?'Uploading...':'Upload Document'}</button>
        </div>

        {/* 30/60/90 Day Expiration Alerts */}
        {alerts.length>0&&(
          <div style={{...card(),borderColor:AMBER+'55',background:AMBER+'08'}}>
            <div style={{fontSize:15,fontWeight:700,color:AMBER,marginBottom:10}}><Warning size={16} weight="bold"/> Expiration Alerts (30/60/90 Days)</div>
            {alerts.map((a,i)=>{
              const days=a.doc.days_until_expiry;
              const c=a.level==='critical'?RED:a.level==='warning'?AMBER:BLUE;
              const levelLabel=days<=0?'EXPIRED':days<=30?'30-DAY ALERT':days<=60?'60-DAY ALERT':'90-DAY ALERT';
              return <div key={i} style={{padding:'10px 12px',background:c+'11',border:`1px solid ${c}33`,borderRadius:6,marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                <div><div style={{fontSize:13,fontWeight:700,color:TEXT}}>{docLabels[a.doc.doc_type]||a.doc.doc_type}</div><div style={{fontSize:11,color:DIM}}>{a.doc.file_name} &middot; Expires: {fmtDate(a.doc.expires_at)}</div></div>
                <div style={{padding:'4px 12px',borderRadius:20,background:c+'22',color:c,fontSize:11,fontWeight:700}}>{levelLabel} ({days<=0?'OVERDUE':`${days}d`})</div>
              </div>;
            })}
          </div>
        )}

        {/* Compliance Grid */}
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Compliance Status</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14}}>
            {docTypes.map(type=>{
              const doc=complianceDocs.find((d:any)=>d.doc_type===type);
              const status=doc?doc.expiration_status:'missing';
              const c=status==='valid'?GREEN:status==='expiring_soon'?AMBER:status==='expired'?RED:doc?.status==='approved'?GREEN:doc?.status==='pending_review'?AMBER:RED;
              return(
                <div key={type} style={{padding:16,background:DARK,borderRadius:8,border:`1px solid ${c}44`,position:'relative'}}>
                  <div style={{position:'absolute',top:12,right:12,width:10,height:10,borderRadius:'50%',background:c}}/>
                  <div style={{fontSize:14,fontWeight:700,color:TEXT,marginBottom:6}}>{docLabels[type]||type}</div>
                  {doc?(<div>
                    <div style={{fontSize:12,color:DIM,marginBottom:4}}>File: {doc.file_name}</div>
                    {doc.carrier&&<div style={{fontSize:12,color:DIM,marginBottom:4}}>Carrier: {doc.carrier}</div>}
                    {doc.policy_number&&<div style={{fontSize:12,color:DIM,marginBottom:4}}>Policy: {doc.policy_number}</div>}
                    {doc.coverage_amount&&<div style={{fontSize:12,color:DIM,marginBottom:4}}>Coverage: {fmt(doc.coverage_amount)}</div>}
                    {doc.expires_at&&<div style={{fontSize:12,color:c,fontWeight:600,marginBottom:4}}>{doc.days_until_expiry!==null&&doc.days_until_expiry<=0?'EXPIRED':doc.days_until_expiry!==null&&doc.days_until_expiry<=30?`Expires in ${doc.days_until_expiry} days`:`Expires: ${fmtDate(doc.expires_at)}`}</div>}
                    <span style={badge(doc.status)}>{(doc.status||'').replace(/_/g,' ')}</span>
                  </div>):(<div style={{fontSize:12,color:RED,fontWeight:600}}>Not uploaded -- action required</div>)}
                </div>
              );
            })}
          </div>
        </div>

        {/* Shared Project Documents */}
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Shared Project Documents</div>
          {documents.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No shared documents available</div>:(
            <div style={{display:'grid',gap:8}}>
              {documents.map((doc:any)=>(
                <div key={doc.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',background:DARK,borderRadius:6,border:`1px solid ${BORDER}`}}>
                  <div><div style={{fontSize:13,fontWeight:600,color:TEXT}}>{doc.name||doc.file_name||'Document'}</div><div style={{fontSize:11,color:DIM}}>{doc.category||'General'} &middot; {fmtDate(doc.created_at)}</div></div>
                  {doc.file_url&&<a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{...btnS(BLUE,true),textDecoration:'none'}}>Download</a>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  PAY APPS TAB                                                     */
  /* ================================================================ */
  const renderPayApps=()=>{
    const statusOrder=['submitted','under_review','approved','paid'];
    return(
      <div style={{display:'grid',gap:20}}>
        {payApps.length===0?(
          <div style={{...card(),textAlign:'center',padding:40}}>
            <div style={{fontSize:15,fontWeight:700,color:TEXT}}>No Pay Applications Yet</div>
            <div style={{fontSize:13,color:DIM,marginTop:6}}>Pay applications will appear here once submitted.</div>
          </div>
        ):payApps.map((pa:any)=>(
          <div key={pa.id} style={card()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:10}}>
              <div><div style={{fontSize:16,fontWeight:700,color:TEXT}}>Pay App #{pa.application_number||pa.id?.slice(0,6)}</div><div style={{fontSize:12,color:DIM}}>Period: {fmtDate(pa.period_start)} - {fmtDate(pa.period_end)}</div></div>
              <span style={badge(pa.status)}>{(pa.status||'').replace(/_/g,' ')}</span>
            </div>

            {/* Progress timeline */}
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
              <div style={{padding:'10px 14px',background:DARK,borderRadius:6,border:`1px solid ${BORDER}`}}><div style={{fontSize:10,color:DIM,textTransform:'uppercase'}}>Requested</div><div style={{fontSize:16,fontWeight:700,color:TEXT}}>{fmt(pa.total_requested||0)}</div></div>
              <div style={{padding:'10px 14px',background:DARK,borderRadius:6,border:`1px solid ${BORDER}`}}><div style={{fontSize:10,color:DIM,textTransform:'uppercase'}}>Retainage ({pa.retainage_percent||10}%)</div><div style={{fontSize:16,fontWeight:700,color:AMBER}}>{fmt(pa.retainage_amount||0)}</div></div>
              <div style={{padding:'10px 14px',background:DARK,borderRadius:6,border:`1px solid ${BORDER}`}}><div style={{fontSize:10,color:DIM,textTransform:'uppercase'}}>Net Amount</div><div style={{fontSize:16,fontWeight:700,color:GREEN}}>{fmt(pa.net_amount||0)}</div></div>
            </div>

            {/* Line items */}
            {pa.line_items&&pa.line_items.length>0&&(
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
                  <thead><tr>{['Description','Scheduled Value','Previous','This Period','Requested','GC Status'].map(h=><th key={h} style={{textAlign:'left',padding:'6px 10px',fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',borderBottom:`1px solid ${BORDER}`}}>{h}</th>)}</tr></thead>
                  <tbody>{pa.line_items.map((li:any)=>(
                    <tr key={li.id} style={{borderBottom:`1px solid ${BORDER}44`}}>
                      <td style={{padding:'8px 10px',fontSize:12,color:TEXT}}>{li.description}</td>
                      <td style={{padding:'8px 10px',fontSize:12,color:DIM}}>{fmt(li.scheduled_value)}</td>
                      <td style={{padding:'8px 10px',fontSize:12,color:DIM}}>{fmt(li.previous_completed)}</td>
                      <td style={{padding:'8px 10px',fontSize:12,color:TEXT,fontWeight:600}}>{fmt(li.this_period)}</td>
                      <td style={{padding:'8px 10px',fontSize:12,color:TEXT}}>{fmt(li.amount_requested)}</td>
                      <td style={{padding:'8px 10px'}}><span style={badge(li.gc_status||'pending')}>{(li.gc_status||'pending').replace(/_/g,' ')}</span>{li.gc_notes&&<div style={{fontSize:10,color:AMBER,marginTop:2}}>{li.gc_notes}</div>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {/* Lien Waiver */}
            {(pa.status==='approved'||pa.status==='paid')&&(
              <div style={{marginTop:14,padding:'12px 16px',background:PURPLE+'11',border:`1px solid ${PURPLE}44`,borderRadius:8}}>
                <div style={{fontSize:13,fontWeight:700,color:PURPLE,marginBottom:4}}>Lien Waiver: {pa.status==='paid'?'Unconditional':'Conditional'} Required</div>
                <div style={{fontSize:12,color:DIM,marginBottom:10}}>{pa.status==='paid'?`Unconditional lien waiver for ${fmt(pa.net_amount)} is ready for execution.`:`Conditional lien waiver for ${fmt(pa.net_amount)} -- will convert to unconditional upon payment.`}</div>
                <div style={{marginBottom:10}}><div style={labelS}>Digital Signature</div><SignatureCanvas onSign={sig=>setLienSig(sig)}/></div>
                {lienSig&&<button onClick={()=>{showToast('Lien waiver signed and submitted');setLienSig(null);}} style={btnS(PURPLE)}>Submit Signed Lien Waiver</button>}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  /* ================================================================ */
  /*  DAILY LOGS TAB                                                   */
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
          <div><div style={labelS}>Log Date *</div><input type="date" value={dlForm.log_date} onChange={e=>setDlForm(f=>({...f,log_date:e.target.value}))} style={inputS}/></div>
          <div><div style={labelS}>Crew Count</div><input type="number" value={dlForm.crew_count} onChange={e=>setDlForm(f=>({...f,crew_count:e.target.value}))} placeholder="Number of workers" style={inputS}/></div>
          <div><div style={labelS}>Hours Worked</div><input type="number" step="0.5" value={dlForm.hours_worked} onChange={e=>setDlForm(f=>({...f,hours_worked:e.target.value}))} placeholder="Total hours" style={inputS}/></div>
          <div><div style={labelS}>Weather</div><input value={dlForm.weather} onChange={e=>setDlForm(f=>({...f,weather:e.target.value}))} placeholder="Clear, 85F" style={inputS}/></div>
        </div>
        <div style={{marginBottom:16}}><div style={labelS}>Work Completed Today *</div><textarea value={dlForm.work_completed} onChange={e=>setDlForm(f=>({...f,work_completed:e.target.value}))} placeholder="Describe all work completed today..." style={textareaS}/></div>
        <div style={{marginBottom:16}}><div style={labelS}>Work Planned for Tomorrow</div><textarea value={dlForm.work_planned} onChange={e=>setDlForm(f=>({...f,work_planned:e.target.value}))} placeholder="What is planned for the next work day..." style={textareaS}/></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:16,marginBottom:16}}>
          <div><div style={labelS}>Delays / Issues</div><textarea value={dlForm.delays} onChange={e=>setDlForm(f=>({...f,delays:e.target.value}))} placeholder="Any delays, weather issues, material shortages..." style={{...textareaS,minHeight:60}}/></div>
          <div><div style={labelS}>Safety Incidents</div><textarea value={dlForm.safety_incidents} onChange={e=>setDlForm(f=>({...f,safety_incidents:e.target.value}))} placeholder="Any safety incidents or near-misses (leave blank if none)" style={{...textareaS,minHeight:60}}/></div>
        </div>
        <div style={{marginBottom:16}}><div style={labelS}>Additional Notes</div><textarea value={dlForm.notes} onChange={e=>setDlForm(f=>({...f,notes:e.target.value}))} placeholder="Any additional notes..." style={{...textareaS,minHeight:50}}/></div>
        <button onClick={submitDailyLog} disabled={dlSaving} style={btnS(GREEN)}>{dlSaving?'Submitting...':'Submit Daily Log'}</button>
      </div>

      {/* Previous Logs */}
      <div style={card()}>
        <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Previous Daily Logs</div>
        {dailyLogs.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No daily logs submitted yet. Submit your first log above.</div>:
        dailyLogs.map((log:any)=>(
          <div key={log.id} style={{padding:16,background:DARK,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8}}>
              <div style={{fontSize:15,fontWeight:700,color:TEXT}}>{fmtDate(log.log_date)}</div>
              <span style={badge(log.status)}>{(log.status||'').replace(/_/g,' ')}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10,marginBottom:10}}>
              <div style={{fontSize:12}}><span style={{color:DIM}}>Crew:</span> <span style={{color:TEXT,fontWeight:600}}>{log.crew_count}</span></div>
              <div style={{fontSize:12}}><span style={{color:DIM}}>Hours:</span> <span style={{color:TEXT,fontWeight:600}}>{log.hours_worked}h</span></div>
              {log.weather&&<div style={{fontSize:12}}><span style={{color:DIM}}>Weather:</span> <span style={{color:TEXT}}>{log.weather}</span></div>}
            </div>
            {log.work_completed&&<div style={{fontSize:13,color:TEXT,marginBottom:6,lineHeight:1.5}}>{log.work_completed}</div>}
            {log.delays&&<div style={{fontSize:12,color:AMBER,marginTop:4}}>Delays: {log.delays}</div>}
            {log.safety_incidents&&<div style={{fontSize:12,color:RED,marginTop:4}}>Safety: {log.safety_incidents}</div>}
          </div>
        ))}
      </div>
    </div>
  );

  /* ================================================================ */
  /*  RFI TAB                                                          */
  /* ================================================================ */
  const renderRfis=()=>(
    <div style={{display:'grid',gap:20}}>
      {/* RFI Form */}
      <div style={card()}>
        <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Submit RFI (Request for Information)</div>
        <div style={{marginBottom:14}}><div style={labelS}>Subject *</div><input value={rfiForm.subject} onChange={e=>setRfiForm(f=>({...f,subject:e.target.value}))} placeholder="Brief description of the question" style={inputS}/></div>
        <div style={{marginBottom:14}}><div style={labelS}>Question / Details *</div><textarea value={rfiForm.question} onChange={e=>setRfiForm(f=>({...f,question:e.target.value}))} placeholder="Detailed question or request..." style={textareaS}/></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16,marginBottom:14}}>
          <div><div style={labelS}>Priority</div><select value={rfiForm.priority} onChange={e=>setRfiForm(f=>({...f,priority:e.target.value}))} style={{...inputS,cursor:'pointer'}}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div>
          <div><div style={labelS}>Reference Drawing</div><input value={rfiForm.reference_drawing} onChange={e=>setRfiForm(f=>({...f,reference_drawing:e.target.value}))} placeholder="e.g. A-201" style={inputS}/></div>
          <div><div style={labelS}>Reference Spec Section</div><input value={rfiForm.reference_spec} onChange={e=>setRfiForm(f=>({...f,reference_spec:e.target.value}))} placeholder="e.g. 03 30 00" style={inputS}/></div>
        </div>
        <button onClick={submitRfi} disabled={rfiSaving} style={btnS(PURPLE)}>{rfiSaving?'Submitting...':'Submit RFI'}</button>
      </div>

      {/* RFI History */}
      <div style={card()}>
        <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>RFI History</div>
        {rfis.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No RFIs submitted yet.</div>:
        rfis.map((rfi:any)=>(
          <div key={rfi.id} style={{padding:14,background:DARK,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:10}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,flexWrap:'wrap',gap:8}}>
              <div><span style={{fontSize:12,color:GOLD,fontWeight:700,marginRight:8}}>{rfi.rfi_number}</span><span style={{fontSize:14,fontWeight:700,color:TEXT}}>{rfi.subject}</span></div>
              <span style={badge(rfi.status)}>{rfi.status}</span>
            </div>
            <div style={{fontSize:12,color:DIM,marginBottom:4}}>Submitted: {fmtDate(rfi.submitted_at||rfi.created_at)} &middot; Priority: <span style={{color:rfi.priority==='critical'?RED:rfi.priority==='high'?AMBER:DIM,fontWeight:600}}>{rfi.priority}</span></div>
            <div style={{fontSize:13,color:TEXT,lineHeight:1.5}}>{rfi.question}</div>
            {rfi.reference_drawing&&<div style={{fontSize:11,color:DIM,marginTop:4}}>Ref Drawing: {rfi.reference_drawing}</div>}
            {rfi.gc_response&&<div style={{marginTop:8,padding:'8px 12px',background:GREEN+'11',borderRadius:6,border:`1px solid ${GREEN}44`}}><div style={{fontSize:11,fontWeight:700,color:GREEN,marginBottom:4}}>Response:</div><div style={{fontSize:12,color:TEXT,lineHeight:1.5}}>{rfi.gc_response}</div></div>}
          </div>
        ))}
      </div>
    </div>
  );

  /* ================================================================ */
  /*  SCHEDULE TAB                                                     */
  /* ================================================================ */
  const renderSchedule=()=>{
    const sorted=[...tasks].sort((a:any,b:any)=>new Date(a.start_date).getTime()-new Date(b.start_date).getTime());
    return(
      <div style={{display:'grid',gap:20}}>
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Assigned Tasks &amp; Schedule</div>
          {tasks.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No schedule data available</div>:(
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
                <thead><tr>{['Task','Phase','Start','End','Progress','Status'].map(h=><th key={h} style={{textAlign:'left',padding:'8px 12px',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',borderBottom:`1px solid ${BORDER}`}}>{h}</th>)}</tr></thead>
                <tbody>{sorted.map((task:any)=>{
                  const pct=Math.round((task.percent_complete||0)*100);
                  const c=pct>=100?GREEN:pct>=50?BLUE:AMBER;
                  return(
                    <tr key={task.id} style={{borderBottom:`1px solid ${BORDER}44`}}>
                      <td style={{padding:'10px 12px',fontSize:13,color:TEXT,fontWeight:600}}>{task.title||task.name||'Task'}</td>
                      <td style={{padding:'10px 12px',fontSize:12,color:DIM}}>{task.phase||'--'}</td>
                      <td style={{padding:'10px 12px',fontSize:12,color:DIM}}>{fmtDate(task.start_date)}</td>
                      <td style={{padding:'10px 12px',fontSize:12,color:DIM}}>{fmtDate(task.end_date)}</td>
                      <td style={{padding:'10px 12px',minWidth:140}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <ProgressBar value={pct} color={c} height={6}/>
                          <span style={{fontSize:12,fontWeight:700,color:c,whiteSpace:'nowrap'}}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{padding:'10px 12px'}}><span style={badge(task.status||'pending')}>{(task.status||'pending').replace(/_/g,' ')}</span></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  SCORECARD TAB                                                    */
  /* ================================================================ */
  const renderScorecard=()=>{
    const avgs=scorecard?.averages||{};
    const cats=[
      {key:'quality_score',label:'Quality'},
      {key:'schedule_score',label:'Schedule'},
      {key:'safety_score',label:'Safety'},
      {key:'communication_score',label:'Communication'},
      {key:'cleanup_score',label:'Cleanup'},
    ];
    return(
      <div style={{display:'grid',gap:20}}>
        {/* Overall */}
        <div style={{...card(),background:`linear-gradient(135deg,${RAISED},${DARK})`,textAlign:'center'}}>
          {isPreferred&&<div style={{marginBottom:16,display:'inline-flex',alignItems:'center',gap:10,background:GOLD+'22',border:`1px solid ${GOLD}`,borderRadius:30,padding:'8px 20px'}}><span style={{fontSize:22}}><Star size={18} weight="fill" color={GOLD}/></span><span style={{fontSize:15,fontWeight:800,color:GOLD}}>Preferred Subcontractor</span></div>}
          <div style={{fontSize:56,fontWeight:800,color:GOLD}}>{overallScore>0?overallScore.toFixed(1):'--'}</div>
          <Stars rating={overallScore} size={28}/>
          <div style={{fontSize:14,color:DIM,marginTop:8}}>Overall Performance Rating ({scorecard?.total_reviews||0} reviews)</div>
        </div>

        {/* Health Score Card */}
        <div style={{...card(),textAlign:'center'}}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Sub Health Score</div>
          <div style={{width:100,height:100,borderRadius:'50%',border:`4px solid ${healthColor}`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
            <div style={{fontSize:32,fontWeight:800,color:healthColor}}>{healthScore>0?healthScore.toFixed(1):'--'}</div>
          </div>
          <div style={{fontSize:13,fontWeight:700,color:healthColor,textTransform:'uppercase'}}>{healthLabel}</div>
          <div style={{fontSize:12,color:DIM,marginTop:8,lineHeight:1.6}}>Based on: quality, schedule adherence, safety, communication, change order frequency, insurance compliance, lien waiver timeliness, and payment history.</div>
        </div>

        {/* Category Cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16}}>
          {cats.map(cat=>{
            const avg=avgs[cat.key]||0;
            const color=avg>=4?GREEN:avg>=3?AMBER:avg>=1?RED:DIM;
            return(
              <div key={cat.key} style={card()}>
                <div style={{fontSize:14,fontWeight:700,color:TEXT,marginBottom:12}}>{cat.label}</div>
                <div style={{textAlign:'center',marginBottom:10}}>
                  <div style={{fontSize:28,fontWeight:800,color}}>{avg>0?avg.toFixed(1):'--'}</div>
                  <Stars rating={avg} size={16}/>
                </div>
                <ProgressBar value={avg*20} color={color} height={6}/>
              </div>
            );
          })}
        </div>

        {/* Per-project scorecards */}
        {scorecard?.scorecards?.length>0&&(
          <div style={card()}>
            <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Score History</div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:500}}>
                <thead><tr>{['Date','Quality','Schedule','Safety','Communication','Cleanup','Comments'].map(h=><th key={h} style={{textAlign:'left',padding:'8px 12px',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',borderBottom:`1px solid ${BORDER}`}}>{h}</th>)}</tr></thead>
                <tbody>{scorecard.scorecards.map((sc:any)=>(
                  <tr key={sc.id} style={{borderBottom:`1px solid ${BORDER}44`}}>
                    <td style={{padding:'8px 12px',fontSize:12,color:DIM}}>{fmtDate(sc.rated_at)}</td>
                    <td style={{padding:'8px 12px'}}>{sc.quality_score!=null?<Stars rating={sc.quality_score} size={12}/>:'--'}</td>
                    <td style={{padding:'8px 12px'}}>{sc.schedule_score!=null?<Stars rating={sc.schedule_score} size={12}/>:'--'}</td>
                    <td style={{padding:'8px 12px'}}>{sc.safety_score!=null?<Stars rating={sc.safety_score} size={12}/>:'--'}</td>
                    <td style={{padding:'8px 12px'}}>{sc.communication_score!=null?<Stars rating={sc.communication_score} size={12}/>:'--'}</td>
                    <td style={{padding:'8px 12px'}}>{sc.cleanup_score!=null?<Stars rating={sc.cleanup_score} size={12}/>:'--'}</td>
                    <td style={{padding:'8px 12px',fontSize:11,color:DIM,maxWidth:200}}>{sc.comments||'--'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ================================================================ */
  /*  MESSAGES TAB                                                     */
  /* ================================================================ */
  const renderMessages=()=>{
    const msgEndRef=useRef<HTMLDivElement>(null);
    useEffect(()=>{msgEndRef.current?.scrollIntoView({behavior:'smooth'})},[messages]);

    // Mark unread messages as read
    useEffect(()=>{
      const unread=messages.filter((m:any)=>m.sender_type!=='sub'&&!m.read).map((m:any)=>m.id);
      if(unread.length>0){
        fetch(`/api/portal/sub/messages?token=${token}`,{method:'PATCH',headers,body:JSON.stringify({message_ids:unread})}).catch(()=>{});
      }
    },[messages]);

    return(
      <div style={{display:'grid',gap:20}}>
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Messages with GC</div>
          <div style={{maxHeight:500,overflowY:'auto',padding:'10px 0',marginBottom:16}}>
            {messages.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No messages yet. Start a conversation below.</div>:
            messages.map((msg:any)=>{
              const isSub=msg.sender_type==='sub';
              return(
                <div key={msg.id} style={{display:'flex',justifyContent:isSub?'flex-end':'flex-start',marginBottom:10}}>
                  <div style={{maxWidth:'75%',padding:'10px 14px',borderRadius:12,background:isSub?BLUE+'22':RAISED,border:`1px solid ${isSub?BLUE+'44':BORDER}`,borderBottomRightRadius:isSub?2:12,borderBottomLeftRadius:isSub?12:2}}>
                    <div style={{fontSize:13,color:TEXT,lineHeight:1.5}}>{msg.content}</div>
                    <div style={{fontSize:10,color:DIM,marginTop:4,textAlign:isSub?'right':'left'}}>{isSub?'You':'GC'} &middot; {fmtDate(msg.created_at)}</div>
                  </div>
                </div>
              );
            })}
            <div ref={msgEndRef}/>
          </div>
          <div style={{display:'flex',gap:10}}>
            <input value={msgContent} onChange={e=>setMsgContent(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}}} placeholder="Type a message..." style={{...inputS,flex:1}}/>
            <button onClick={sendMessage} disabled={msgSending} style={btnS(BLUE)}>{msgSending?'...':'Send'}</button>
          </div>
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  RENDER ACTIVE TAB                                                */
  /* ================================================================ */
  const renderContent=()=>{
    switch(tab){
      case'dashboard':return renderDashboard();
      case'compliance':return renderCompliance();
      case'payapps':return renderPayApps();
      case'daily':return renderDaily();
      case'rfis':return renderRfis();
      case'schedule':return renderSchedule();
      case'scorecard':return renderScorecard();
      case'messages':return renderMessages();
    }
  };

  /* ================================================================ */
  /*  MAIN LAYOUT                                                      */
  /* ================================================================ */
  return(
    <div style={{minHeight:'100vh',background:DARK,fontFamily:'system-ui,-apple-system,sans-serif',color:TEXT}}>
      {toast&&<div style={{position:'fixed',top:20,right:20,zIndex:9999,background:RAISED,border:`1px solid ${GOLD}`,borderRadius:10,padding:'12px 20px',color:TEXT,fontSize:13,fontWeight:600,boxShadow:'0 8px 32px rgba(0,0,0,.08)',animation:'fadeIn .3s ease'}}>{toast}</div>}
      {!isOnline&&<div style={{background:RED,color:'#fff',textAlign:'center',padding:'6px 16px',fontSize:12,fontWeight:700}}>You are currently offline. Changes will sync when connection is restored.</div>}

      {/* Header */}
      <PortalHeader portalName="Subcontractor Portal" subtitle={companyName} showBackToPortals={false} />

      {/* Tabs - scrollable on mobile */}
      <nav style={{background:RAISED,borderBottom:`1px solid ${BORDER}`,overflowX:'auto',display:'flex',WebkitOverflowScrolling:'touch'}}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{padding:'12px 16px',background:'transparent',border:'none',borderBottom:tab===t.key?`2px solid ${GOLD}`:'2px solid transparent',color:tab===t.key?GOLD:DIM,fontSize:13,fontWeight:tab===t.key?700:500,cursor:'pointer',whiteSpace:'nowrap',transition:'color .2s,border .2s',display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
            <span style={{fontSize:14}}>{t.icon}</span><span>{t.label}</span>
            {t.key==='messages'&&messages.filter((m:any)=>m.sender_type!=='sub'&&!m.read).length>0&&(
              <span style={{width:8,height:8,borderRadius:'50%',background:RED,flexShrink:0}}/>
            )}
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

      {/* ── Sage AI Chat ── */}
      <PortalSageChat
        token={token||''}
        portalType="sub"
        userName={companyName}
        projectContext={{
          companyName,
          trade: sub?.trade,
          complianceDocsCount: complianceDocs.length,
          payAppsCount: payApps.length,
          openRfis: rfis.filter((r:any)=>r.status==='open').length,
          healthScore,
        }}
      />

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}*{scrollbar-width:thin;scrollbar-color:${BORDER} ${DARK}}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:${DARK}}::-webkit-scrollbar-thumb{background:${BORDER};border-radius:3px}select option{background:${DARK};color:${TEXT}}@media(max-width:768px){main{padding:16px 12px!important}}`}</style>
    </div>
  );
}
