'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import SubEndOfDay from '@/components/portal/SubEndOfDay';
import {
  fmtDay, sequenceLabels, invoiceView, fmtPercent, dailyLogView, fileNameFromUrl,
  expiryLevel, isUnreadForSub, SCORE_CATEGORIES, overallRating, complianceDocFor,
} from '@/lib/sub-portal-view';
import { invoiceWaiver, isSignedWaiver, isSignableWaiver, waiverTypeForInvoice, waiverTypeLabel } from '@/lib/sub-lien-waiver';
import {
  COMPLIANCE_ACCEPT, COMPLIANCE_MAX_BYTES, checkComplianceFileName,
  DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES, DOCUMENT_MAX_MB, checkDocumentFileName,
} from '@/lib/sub-portal-files';
import { putSigned } from '@/lib/media-upload';

/* ── Design Tokens ── */
const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='#D4D4D8',TEXT='#FFFFFF';
const GREEN='#2CFF7A',RED='#FF3B30',AMBER='#FF8A00',BLUE='var(--brand-primary)',PURPLE='#FF8A00';
const fmt=(n:number)=>'$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
/* A date column ('YYYY-MM-DD') is a calendar day — fmtDay keeps it on that day in every timezone. */
const fmtDate=(d:string|null|undefined)=>fmtDay(d);

type Tab='dashboard'|'photos'|'punch'|'daily'|'schedule'|'rfis'|'radio'|'payapps'|'bids'|'documents'|'drawings'|'compliance'|'scorecard'|'messages'|'history';

/* ── Shared styles ── */
const card=(extra?:React.CSSProperties):React.CSSProperties=>({background:RAISED,backgroundImage:'linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))',border:`1px solid ${BORDER}`,borderRadius:12,padding:20,boxShadow:'0 4px 14px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)',...extra});
const btnS=(color:string,small?:boolean):React.CSSProperties=>({background:color,backgroundImage:color===GOLD?'linear-gradient(180deg,var(--brand-primary-strong),var(--brand-primary) 60%,var(--brand-primary-hover))':'linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0) 55%)',color:color===GOLD?'#0A0A00':'#fff',border:'none',borderRadius:9,padding:small?'6px 14px':'11px 20px',fontWeight:800,fontSize:small?12:14,cursor:'pointer',boxShadow:color===GOLD?'0 4px 14px color-mix(in srgb, var(--brand-primary) 28%, transparent), inset 0 1px 0 rgba(255,255,255,0.35)':'0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.12)'});
const labelS:React.CSSProperties={display:'block',fontSize:11,fontWeight:700,color:DIM,marginBottom:5};
/* 16px text: iOS zooms the page into any input set smaller. 44px: a fingertip target. */
const inputS:React.CSSProperties={width:'100%',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,padding:'10px 14px',color:TEXT,fontSize:16,minHeight:44,outline:'none',boxSizing:'border-box'};
const textareaS:React.CSSProperties={...inputS,minHeight:80,resize:'vertical' as const};
const badge=(status:string):React.CSSProperties=>{const m:Record<string,string>={approved:GREEN,paid:GREEN,signed:GREEN,accepted:GREEN,awarded:GREEN,valid:GREEN,submitted:BLUE,open:BLUE,pending:AMBER,under_review:AMBER,pending_review:AMBER,draft:DIM,expiring_soon:AMBER,correction_requested:AMBER,rejected:RED,disputed:RED,expired:RED,declined:RED,missing:RED};const c=m[status]||DIM;return{display:'inline-block',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:`color-mix(in srgb, ${c} 13%, transparent)`,color:c,textTransform:'capitalize' as const}};

function Stars({rating,max=5,size=18}:{rating:number;max?:number;size?:number}){
  return <span style={{display:'inline-flex',gap:2}}>{Array.from({length:max},(_,i)=><span key={i} style={{fontSize:size,color:i<Math.round(rating)?GOLD:BORDER}}>{i<Math.round(rating)?'\u2605':'\u2606'}</span>)}</span>;
}

function ProgressBar({value,color=GOLD,height=8}:{value:number;color?:string;height?:number}){
  return<div style={{background:BORDER,borderRadius:height,height,width:'100%',overflow:'hidden'}}><div style={{width:`${Math.min(100,Math.max(0,value))}%`,height:'100%',background:color,borderRadius:height,transition:'width .4s ease'}}/></div>;
}

/* Pseudo-waveform for voice rows: deterministic bars seeded by message id. */
function RadioWave({seed,color}:{seed:string;color:string}){
  let h=2166136261;
  for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
  const bars=Array.from({length:26},()=>{h=(Math.imul(h,1103515245)+12345)>>>0;return 5+(h%15);});
  return(
    <div aria-hidden style={{display:'flex',alignItems:'center',gap:2,height:22,marginBottom:4}}>
      {bars.map((b,i)=><div key={i} style={{width:3,height:b,borderRadius:2,background:color,opacity:0.35+(b-5)/28,flexShrink:0}}/>)}
    </div>
  );
}

function SignatureCanvas({onSign,onClear}:{onSign:(data:string)=>void;onClear?:()=>void}){
  const ref=useRef<HTMLCanvasElement>(null);
  // Refs, not state, decide whether a stroke counts: a quick stroke can end
  // before React re-renders, and a stale `has` would drop the signature while
  // the pad still says "Signature captured".
  const drawingRef=useRef(false);
  const hasRef=useRef(false);
  const [has,setHas]=useState(false);
  /* The canvas is 400×120 but shrinks to fit a phone; map the finger from CSS
     pixels to canvas pixels or the stroke lands off to the side of it. */
  const pos=(e:React.MouseEvent|React.TouchEvent)=>{const c=ref.current!;const r=c.getBoundingClientRect();const cx='touches' in e?e.touches[0].clientX:e.clientX;const cy='touches' in e?e.touches[0].clientY:e.clientY;return{x:(cx-r.left)*(c.width/(r.width||c.width)),y:(cy-r.top)*(c.height/(r.height||c.height))}};
  const start=(e:React.MouseEvent|React.TouchEvent)=>{drawingRef.current=true;const ctx=ref.current!.getContext('2d')!;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y)};
  const draw=(e:React.MouseEvent|React.TouchEvent)=>{if(!drawingRef.current)return;const ctx=ref.current!.getContext('2d')!;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.strokeStyle=TEXT;ctx.lineWidth=2;ctx.lineCap='round';ctx.stroke();hasRef.current=true;setHas(true)};
  /* The pad draws light ink for the dark screen; the waiver is printed on white
     paper, so the saved image is the same strokes recoloured to dark ink. */
  const inkPng=()=>{const src=ref.current!;const c=document.createElement('canvas');c.width=src.width;c.height=src.height;const x=c.getContext('2d')!;x.drawImage(src,0,0);x.globalCompositeOperation='source-in';x.fillStyle='rgb(13,17,22)';x.fillRect(0,0,c.width,c.height);return c.toDataURL('image/png')};
  const stop=()=>{if(!drawingRef.current)return;drawingRef.current=false;if(hasRef.current)onSign(inkPng())};
  const clear=()=>{const c=ref.current!;c.getContext('2d')!.clearRect(0,0,c.width,c.height);hasRef.current=false;setHas(false);onClear?.()};
  return(
    <div>
      <canvas ref={ref} width={400} height={120} aria-label="Signature pad — draw your signature" style={{background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,cursor:'crosshair',touchAction:'none',maxWidth:'100%',display:'block'}} onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchMove={draw} onTouchEnd={stop}/>
      <div style={{marginTop:6,display:'flex',gap:8,alignItems:'center'}}>
        <button type="button" onClick={clear} style={{...btnS(BORDER,true),minHeight:44,minWidth:64}}>Clear</button>
        {has&&<span style={{color:GREEN,fontSize:12}}>Signature captured</span>}
      </div>
    </div>
  );
}

/* One waiver to sign: the signer's name and title, the drawn signature, and a
   Submit that saves it (the caller posts to /api/portal/sub/lien-waivers and
   returns an error message, or null once it is saved). */
function LienWaiverSigner({defaultName,onSubmit}:{defaultName:string;onSubmit:(v:{signed_name:string;signer_title:string;signature:string})=>Promise<string|null>}){
  const uid=React.useId();
  const [name,setName]=useState(defaultName);
  const [title,setTitle]=useState('');
  const [sig,setSig]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  const submit=async()=>{
    if(name.trim().length<2){setErr('Type your full name to sign.');return;}
    if(!sig){setErr('Draw your signature in the box first.');return;}
    setSaving(true);setErr('');
    const e=await onSubmit({signed_name:name.trim(),signer_title:title.trim(),signature:sig});
    setSaving(false);
    if(e)setErr(e);
  };
  return(
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginBottom:10}}>
        <div><label htmlFor={`${uid}-n`} style={labelS}>Your full name *</label><input id={`${uid}-n`} value={name} onChange={e=>setName(e.target.value)} autoComplete="name" style={inputS}/></div>
        <div><label htmlFor={`${uid}-t`} style={labelS}>Title</label><input id={`${uid}-t`} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Owner, Project Manager…" autoComplete="organization-title" style={inputS}/></div>
      </div>
      <div style={{marginBottom:10}}><div style={labelS}>Signature *</div><SignatureCanvas onSign={setSig} onClear={()=>setSig(null)}/></div>
      {err&&<div role="alert" style={{color:RED,fontSize:13,fontWeight:600,marginBottom:10}}>{err}</div>}
      <button type="button" onClick={submit} disabled={saving} style={{...btnS(PURPLE),minHeight:44,opacity:saving?0.6:1}}>{saving?'Saving…':'Submit Signed Lien Waiver'}</button>
    </div>
  );
}

/* ================================================================ */
/*  MAIN COMPONENT                                                  */
/* ================================================================ */
export default function SubPortal(){
  const {token}=useParams<{token:string}>();
  const [tab,setTab]=useState<Tab>('dashboard');
  // A GC can text a crew straight to the upload: /portals/sub/<token>?tab=photos
  useEffect(()=>{ if(new URLSearchParams(window.location.search).get('tab')==='photos') setTab('photos'); },[]);
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
  const [drawings,setDrawings]=useState<any[]>([]);
  const [punchItems,setPunchItems]=useState<any[]>([]);
  const [activity,setActivity]=useState<any[]>([]);
  const [uploading,setUploading]=useState(false);
  /* Documents upload progress, 0–100 while the bytes go to storage; null when idle. */
  const [uploadProgress,setUploadProgress]=useState<number|null>(null);
  const [docCategory,setDocCategory]=useState('other');
  // docExpiry is declared with the compliance form states below — shared by both upload paths.

  /* ── Form states ── */
  const [dlForm,setDlForm]=useState({log_date:new Date().toISOString().split('T')[0],crew_count:'',hours_worked:'',work_completed:'',work_planned:'',weather:'',delays:'',safety_incidents:'',notes:''});
  const [dlSaving,setDlSaving]=useState(false);
  const [rfiForm,setRfiForm]=useState({subject:'',question:'',priority:'normal',reference_drawing:'',reference_spec:''});
  const [rfiSaving,setRfiSaving]=useState(false);
  const [docUploadType,setDocUploadType]=useState('');
  const [docFile,setDocFile]=useState<File|null>(null);
  const [docExpiry,setDocExpiry]=useState('');
  const [docUploading,setDocUploading]=useState(false);
  const [docProgress,setDocProgress]=useState<number|null>(null);
  const [docErr,setDocErr]=useState('');
  const [msgContent,setMsgContent]=useState('');
  const [msgSending,setMsgSending]=useState(false);
  /* This sub's lien_waivers rows on this job (signed and waiting), from /api/portal/sub/lien-waivers. */
  const [lienWaivers,setLienWaivers]=useState<any[]>([]);

  /* ── GPS Clock ── */
  const [gpsStatus,setGpsStatus]=useState<'idle'|'clocked_in'|'clocked_out'>('idle');
  const [clockBusy,setClockBusy]=useState(false);
  const [clockInTime,setClockInTime]=useState('');
  const [clockOutTime,setClockOutTime]=useState('');
  const [gpsCoords,setGpsCoords]=useState<{lat:number;lng:number}|null>(null);

  /* ── Radio ── */
  const [radioChannel,setRadioChannel]=useState<any>(null);
  const [radioMsgs,setRadioMsgs]=useState<any[]>([]);
  const [radioLoaded,setRadioLoaded]=useState(false);
  const [radioLang,setRadioLang]=useState<'en'|'es'>('en');
  const [radioText,setRadioText]=useState('');
  const [radioSending,setRadioSending]=useState(false);
  const [radioRecording,setRadioRecording]=useState(false);
  const [radioAttaching,setRadioAttaching]=useState(false);
  const radioRecRef=useRef<MediaRecorder|null>(null);
  const radioFeedRef=useRef<HTMLDivElement>(null);
  const radioIdsRef=useRef<Set<string>>(new Set());
  const radioPrimedRef=useRef(false);
  /* R13 heard-by: one play receipt per clip per session (server dedupes across sessions). */
  const radioReceiptSentRef=useRef<Set<string>>(new Set());
  const [radioFlashIds,setRadioFlashIds]=useState<Set<string>>(new Set());
  const startRadioRecRef=useRef<()=>void>(()=>{});
  const stopRadioRecRef=useRef<()=>void>(()=>{});
  const radioInteractedRef=useRef(false);
  const radioAudioCtxRef=useRef<AudioContext|null>(null);
  const radioVoiceSupported=typeof window!=='undefined'&&typeof MediaRecorder!=='undefined'&&!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);

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
          fetch(`/api/portal/sub/drawings?token=${token}`,{headers}).then(r=>r.json()),
          fetch(`/api/portal/sub/punch?token=${token}`,{headers}).then(r=>r.json()),
          fetch(`/api/portal/sub/activity?token=${token}`,{headers}).then(r=>r.json()),
          fetch(`/api/portal/sub/lien-waivers?token=${token}`,{headers}).then(r=>r.json()),
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
        setDrawings(val(9).drawings||[]);
        setPunchItems(val(10).punch_items||[]);
        setActivity(val(11).events||[]);
        setLienWaivers(val(12).lien_waivers||[]);
      })
      .catch(e=>{ console.error(e); setError(humanError(e, 'Failed to load the portal. Please try again.')); })
      .finally(()=>setLoading(false));
  },[token]);

  /* ── Radio tone beep: WebAudio, armed by the first user gesture (autoplay
     guard — browsers reject AudioContext playback before any interaction). ── */
  useEffect(()=>{
    const arm=()=>{radioInteractedRef.current=true};
    window.addEventListener('pointerdown',arm,{once:true});
    window.addEventListener('keydown',arm,{once:true});
    return()=>{window.removeEventListener('pointerdown',arm);window.removeEventListener('keydown',arm)};
  },[]);
  const playRadioToneBeep=useCallback((tone:string)=>{
    if(!radioInteractedRef.current||typeof window==='undefined')return;
    try{
      const AC=window.AudioContext||(window as any).webkitAudioContext;
      if(!AC)return;
      const ctx=radioAudioCtxRef.current||(radioAudioCtxRef.current=new AC());
      if(ctx.state==='suspended')void ctx.resume();
      const freqs=tone==='negative'?[330,247]:tone==='comein'?[660,880]:[880];
      freqs.forEach((f,i)=>{
        const osc=ctx.createOscillator(),gain=ctx.createGain();
        const t0=ctx.currentTime+i*0.14;
        osc.type='sine';osc.frequency.value=f;
        gain.gain.setValueAtTime(0.0001,t0);
        gain.gain.exponentialRampToValueAtTime(0.18,t0+0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001,t0+0.12);
        osc.connect(gain);gain.connect(ctx.destination);
        osc.start(t0);osc.stop(t0+0.14);
      });
    }catch{/* audio unavailable: the chip still renders */}
  },[]);
  /* ── Radio: fetch on tab open, poll every 5s while the tab is active ── */
  useEffect(()=>{
    if(tab!=='radio'||!token)return;
    let stop=false;
    const load=()=>fetch(`/api/portal/sub/radio?token=${token}`,{headers})
      .then(r=>r.json())
      .then(d=>{
        if(stop||d.error)return;
        setRadioChannel(d.channel||null);
        const incoming=(d.messages||[]) as any[];
        // Unread-style flash: ids this session has never rendered (skip the first fill).
        const freshMsgs=radioPrimedRef.current?incoming.filter((m:any)=>m.id&&!radioIdsRef.current.has(m.id)):[];
        const fresh=freshMsgs.map((m:any)=>m.id);
        const freshTone=freshMsgs.find((m:any)=>m.kind==='tone');
        if(freshTone)playRadioToneBeep(String(freshTone.body||''));
        incoming.forEach((m:any)=>{if(m.id)radioIdsRef.current.add(m.id)});
        radioPrimedRef.current=true;
        if(fresh.length){
          setRadioFlashIds(prev=>{const n=new Set(prev);fresh.forEach((id:string)=>n.add(id));return n});
          setTimeout(()=>setRadioFlashIds(prev=>{const n=new Set(prev);fresh.forEach((id:string)=>n.delete(id));return n}),2600);
        }
        setRadioMsgs(prev=>{
          const seen=new Map(prev.map((p:any)=>[p.id,p]));
          return incoming.map((m:any)=>{const k:any=seen.get(m.id);return k&&k.audio_url?{...m,audio_url:k.audio_url}:m;});
        });
        setRadioLoaded(true);
      })
      .catch(()=>{});
    load();
    const iv=setInterval(load,5000);
    return()=>{stop=true;clearInterval(iv)};
  },[tab,token]);
  /* ── Radio: hold-SPACEBAR PTT while the tab is open (never while typing) ── */
  useEffect(()=>{
    if(tab!=='radio')return;
    const typing=()=>{const el=document.activeElement as HTMLElement|null;return!!el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.isContentEditable)};
    const down=(e:KeyboardEvent)=>{if(e.code!=='Space'||e.repeat||typing())return;e.preventDefault();startRadioRecRef.current()};
    const up=(e:KeyboardEvent)=>{if(e.code!=='Space')return;if(!typing())e.preventDefault();stopRadioRecRef.current()};
    window.addEventListener('keydown',down);
    window.addEventListener('keyup',up);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);stopRadioRecRef.current()};
  },[tab]);
  useEffect(()=>{const el=radioFeedRef.current;if(el)el.scrollTop=el.scrollHeight;},[radioMsgs.length]);

  /* ── API helpers ── */
  const apiPost=async(endpoint:string,body:any)=>{
    const res=await fetch(`/api/portal/sub/${endpoint}?token=${token}`,{method:'POST',headers,body:JSON.stringify(body)});
    return res.json();
  };
  const apiUpload=async(endpoint:string,form:FormData)=>{
    const res=await fetch(`/api/portal/sub/${endpoint}?token=${token}`,{method:'POST',body:form});
    return res.json();
  };
  const refreshActivity=()=>fetch(`/api/portal/sub/activity?token=${token}`,{headers}).then(r=>r.json()).then(d=>setActivity(d.events||[])).catch(()=>{});
  /* Compliance gate: invoices are held until required docs are current. */
  const requiredDocs=['insurance','w9'];
  const docCurrent=(type:string)=>complianceDocs.some((d:any)=>d.doc_type===type&&d.status!=='rejected'&&d.status!=='expired'&&(!d.expiry_date||new Date(d.expiry_date).getTime()>Date.now()));
  const complianceMissing=requiredDocs.filter(t=>!docCurrent(t));
  const complianceGateOpen=complianceMissing.length===0;

  /* ── Actions ── */
  /* Punches are recorded SERVER-SIDE (clock_punches) — these buttons used to
     only set React state and toast "successfully" while storing nothing.
     Coordinates are best-effort: a denied or slow GPS never blocks the punch. */
  const bestEffortCoords=():Promise<{lat:number|null;lng:number|null}>=>new Promise(resolve=>{
    if(!navigator.geolocation){resolve({lat:null,lng:null});return;}
    let settled=false;
    const done=(v:{lat:number|null;lng:number|null})=>{if(!settled){settled=true;resolve(v);}};
    const timer=setTimeout(()=>done({lat:null,lng:null}),5000);
    navigator.geolocation.getCurrentPosition(
      p=>{clearTimeout(timer);done({lat:p.coords.latitude,lng:p.coords.longitude});},
      ()=>{clearTimeout(timer);done({lat:null,lng:null});},
      {enableHighAccuracy:true,timeout:5000},
    );
  });

  const punch=async(type:'in'|'out')=>{
    if(clockBusy)return;
    setClockBusy(true);
    try{
      const c=await bestEffortCoords();
      const res=await fetch(`/api/portal/sub/clock?token=${token}`,{
        method:'POST',headers,body:JSON.stringify({type,lat:c.lat,lng:c.lng}),
      });
      const json=await res.json().catch(()=>null);
      if(!res.ok){
        // The server owns the truth — re-sync to whatever it says.
        if(typeof json?.onClock==='boolean')setGpsStatus(json.onClock?'clocked_in':'clocked_out');
        showToast(json?.error||"Couldn't record the punch.");
        return;
      }
      const at=json?.punch?.punched_at||new Date().toISOString();
      if(c.lat!=null&&c.lng!=null)setGpsCoords({lat:c.lat,lng:c.lng});
      if(type==='in'){setClockInTime(at);setClockOutTime('');setGpsStatus('clocked_in');}
      else{setClockOutTime(at);setGpsStatus('clocked_out');}
      showToast(
        type==='in'
          ? (c.lat==null?'Clocked in — recorded (no location available).':'Clocked in — recorded.')
          : (c.lat==null?'Clocked out — recorded (no location available).':'Clocked out — recorded.'),
      );
    }catch{
      showToast('No connection — punch not recorded. Try again.');
    }finally{
      setClockBusy(false);
    }
  };
  const handleClockIn=()=>punch('in');
  const handleClockOut=()=>punch('out');

  const submitDailyLog=async()=>{
    if(!dlForm.work_completed.trim()){showToast('Please describe work completed.');return;}
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
        showToast('Daily log submitted.');
        setDailyLogs(prev=>[result.daily_log,...prev]);
        setDlForm({log_date:new Date().toISOString().split('T')[0],crew_count:'',hours_worked:'',work_completed:'',work_planned:'',weather:'',delays:'',safety_incidents:'',notes:''});
        setGpsStatus('idle');setClockInTime('');setClockOutTime('');
      } else showToast(result.error||'Failed to submit.');
    }catch{showToast('Network error — log queued for sync.');}
    setDlSaving(false);
  };

  const submitRfi=async()=>{
    if(!rfiForm.subject.trim()||!rfiForm.question.trim()){showToast('Subject and question are required.');return;}
    setRfiSaving(true);
    try{
      const result=await apiPost('rfis',rfiForm);
      if(result.rfi){
        showToast(result.message||'RFI submitted.');
        setRfis(prev=>[result.rfi,...prev]);
        setRfiForm({subject:'',question:'',priority:'normal',reference_drawing:'',reference_spec:''});
      } else showToast(result.error||'Failed to submit.');
    }catch{showToast('Network error.');}
    setRfiSaving(false);
  };

  /* Compliance upload: the file itself goes to storage through a one-time signed
     URL (no serverless size cap), then the record is saved with its URL. This
     used to post a typed file name and store no file at all. */
  const uploadComplianceDoc=async()=>{
    if(!docUploadType){setDocErr('Pick the document type.');return;}
    if(!docFile){setDocErr('Choose the file to upload.');return;}
    const name=checkComplianceFileName(docFile.name);
    if(!name.ok){setDocErr(name.message);return;}
    if(docFile.size>COMPLIANCE_MAX_BYTES){setDocErr('That file is over 50 MB. Upload a smaller scan or PDF.');return;}
    setDocUploading(true);setDocErr('');setDocProgress(0);
    try{
      const urlRes=await fetch(`/api/portal/sub/compliance/upload-url?token=${token}`,{method:'POST',headers,body:JSON.stringify({fileName:docFile.name})});
      const up=await urlRes.json().catch(()=>null);
      if(!urlRes.ok||!up?.path){setDocErr(up?.error||"Couldn't start the upload. Please try again.");return;}
      await putSigned(up,docFile,f=>setDocProgress(Math.round(f*100)));
      const recRes=await fetch(`/api/portal/sub/compliance?token=${token}`,{method:'POST',headers,body:JSON.stringify({doc_type:docUploadType,path:up.path,expiry_date:docExpiry||null})});
      const result=await recRes.json().catch(()=>null);
      if(recRes.ok&&result?.compliance_doc){
        showToast('Document uploaded — your GC can see it now.');
        setComplianceDocs(prev=>[result.compliance_doc,...prev]);
        setDocUploadType('');setDocFile(null);setDocExpiry('');setDocProgress(null);
        refreshActivity();
      } else setDocErr(result?.error||"Couldn't save the document. Please try again.");
    }catch(e){
      console.error('[sub-portal] compliance upload failed',e);
      setDocErr(e instanceof Error&&e.message?`Upload failed: ${e.message}`:'No connection — the file was not uploaded. Try again.');
    }finally{
      setDocUploading(false);
    }
  };

  const sendMessage=async()=>{
    if(!msgContent.trim()){showToast('Enter a message.');return;}
    setMsgSending(true);
    try{
      const result=await apiPost('messages',{content:msgContent.trim()});
      if(result.message){
        setMessages(prev=>[...prev,result.message]);
        setMsgContent('');
      } else showToast(result.error||'Failed to send.');
    }catch{showToast('Network error.');}
    setMsgSending(false);
  };

  /* Sign a lien waiver — for an approved / paid invoice ({pay_app_id}) or one the
     GC filed and is waiting on ({waiver_id}). Saved as a lien_waivers row with a
     signed PDF; the GC is notified. Returns an error to show, or null when saved. */
  const signLienWaiver=async(target:{pay_app_id?:string;waiver_id?:string},v:{signed_name:string;signer_title:string;signature:string}):Promise<string|null>=>{
    try{
      const res=await fetch(`/api/portal/sub/lien-waivers?token=${token}`,{method:'POST',headers,body:JSON.stringify({...target,...v})});
      const json=await res.json().catch(()=>null);
      const saved=json?.lien_waiver;
      if(saved&&(res.ok||res.status===409)){
        setLienWaivers(prev=>[saved,...prev.filter((w:any)=>w.id!==saved.id)]);
        showToast(res.ok?'Lien waiver signed — your GC has it now.':(json?.error||'This lien waiver is already signed.'));
        if(res.ok)refreshActivity();
        return null;
      }
      return json?.error||"Couldn't save your signed lien waiver. Please try again.";
    }catch{
      return 'No connection — the waiver was not sent. Try again.';
    }
  };

  const sendRadioText=async()=>{
    if(!radioText.trim()||!radioChannel)return;
    setRadioSending(true);
    try{
      const result=await apiPost('radio',{body:radioText.trim()});
      if(result.message){
        if(result.message.id)radioIdsRef.current.add(result.message.id);
        setRadioMsgs(prev=>[...prev,result.message]);
        setRadioText('');
      } else showToast(result.error||'Failed to send message.');
    }catch{showToast('Network error.');}
    setRadioSending(false);
  };

  /* Photo/PDF attachment: same multipart endpoint as voice — the server routes
     image/pdf extensions to a kind 'image' message instead of a voice clip. */
  const sendRadioAttachment=async(file:File|null)=>{
    if(!file||!radioChannel||radioAttaching)return;
    if(!/\.(png|jpe?g|webp|heic|pdf)$/i.test(file.name||'')){showToast('Images or PDF only.');return;}
    if(file.size>25*1024*1024){showToast('File too large — 25 MB max.');return;}
    setRadioAttaching(true);
    try{
      const form=new FormData();
      form.append('file',file);
      const result=await apiUpload('radio',form);
      if(result.message){
        if(result.message.id)radioIdsRef.current.add(result.message.id);
        setRadioMsgs(prev=>[...prev,result.message]);
      }else showToast(result.error||'Attachment failed.');
    }catch{showToast('Network error.');}
    setRadioAttaching(false);
  };

  const startRadioRec=async()=>{
    if(radioRecording||!radioChannel||!radioVoiceSupported)return;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg'].find(t=>MediaRecorder.isTypeSupported(t))||'';
      const rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
      const chunks:Blob[]=[];
      const started=Date.now();
      rec.ondataavailable=e=>{if(e.data&&e.data.size>0)chunks.push(e.data)};
      rec.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());
        radioRecRef.current=null;
        const secs=Math.max(1,Math.round((Date.now()-started)/1000));
        const type=rec.mimeType||mime||'audio/webm';
        const ext=/mp4|aac/i.test(type)?'m4a':/ogg/i.test(type)?'ogg':/mpeg/i.test(type)?'mp3':'webm';
        const blob=new Blob(chunks,{type});
        if(blob.size<200)return;
        const form=new FormData();
        form.append('file',new File([blob],`clip.${ext}`,{type}));
        form.append('durationSecs',String(secs));
        try{
          const result=await apiUpload('radio',form);
          if(result.message){
            if(result.message.id)radioIdsRef.current.add(result.message.id);
            setRadioMsgs(prev=>[...prev,result.message]);
          }else showToast(result.error||'Voice message failed.');
        }catch{showToast('Network error.');}
      };
      radioRecRef.current=rec;
      rec.start();
      setRadioRecording(true);
    }catch{showToast('Microphone unavailable — check permissions.');}
  };

  const stopRadioRec=()=>{
    setRadioRecording(false);
    const rec=radioRecRef.current;
    if(rec&&rec.state!=='inactive')rec.stop();
  };
  // Keep spacebar PTT wired to the latest closures (effect binds once per tab entry).
  startRadioRecRef.current=startRadioRec;
  stopRadioRecRef.current=stopRadioRec;

  /* ── Computed ── */
  const companyName=sub?.company_name||'Subcontractor';
  /* An email-only invite (no roster sub) can't file records that must belong to a
     roster sub — the server refuses them (lib/sub-portal-scope). Say so where the
     form would be, instead of letting someone fill one out for nothing. */
  const onRoster=!!session?.sub_id;
  /* Radio identity: the roster sub, or this session for an email-only invite. */
  const radioMemberId=session?.sub_id||session?.id||null;
  const rosterNote=(what:string)=>(
    <div role="note" style={{...card(),borderColor:`color-mix(in srgb, ${AMBER} 33%, transparent)`,background:`color-mix(in srgb, ${AMBER} 4%, transparent)`}}>
      <div style={{fontSize:15,fontWeight:700,color:AMBER,marginBottom:6}}>{what} open once you’re on the subcontractor list</div>
      <div style={{fontSize:13,color:DIM,lineHeight:1.6}}>{companyName} was invited to this job by email and isn’t on the contractor’s subcontractor list yet. Ask them to add you as a subcontractor and send you a new portal link. End-of-day photos, documents, drawings, the punch list, radio and the clock all work from this link now.</div>
    </div>
  );
  /* The GC's rating on the roster (subcontractors.rating), else the scorecard average. */
  const overallScore=overallRating(scorecard);
  const isPreferred=scorecard?.preferred_status||false;
  /* portal_sub_rfis / _pay_apps have no number column: number them in filing order. */
  const rfiNo=sequenceLabels(rfis,'RFI-SUB-');
  const invoiceNo=sequenceLabels(payApps,'#',1);
  const unreadCount=messages.filter(isUnreadForSub).length;
  const docFileLabel=(doc:any)=>fileNameFromUrl(doc?.file_url)||'No file attached';

  // Insurance expiration alerts — expiry_date is the column (expires_at never existed, so these never fired).
  const getExpirationAlerts=()=>{
    const alerts:{doc:any;level:'critical'|'warning'|'notice'}[]=[];
    complianceDocs.forEach(doc=>{
      if(!doc.expiry_date)return;
      const level=expiryLevel(doc.days_until_expiry);
      if(level)alerts.push({doc,level});
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
  /* Messages-tab effects. These used to live INSIDE renderMessages(), which only
     runs while the Messages tab is open — so opening the tab changed how many
     hooks this component called and React threw ("Rendered more hooks than
     during the previous render"). Hooks belong at the top level; the tab gate
     moves into the effects instead. */
  const msgEndRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{ if(tab==='messages') msgEndRef.current?.scrollIntoView({behavior:'smooth'}); },[messages,tab]);
  // Mark unread messages as read once the sub is actually looking at them.
  useEffect(()=>{
    if(tab!=='messages') return;
    /* Read state is read_at (null = unread). This read `m.read`, which the table
       doesn't have, so every GC message stayed "unread" and was re-sent here on
       every render of the tab. */
    const unread=messages.filter(isUnreadForSub).map((m:any)=>m.id);
    if(unread.length>0){
      fetch(`/api/portal/sub/messages?token=${token}`,{method:'PATCH',headers,body:JSON.stringify({message_ids:unread})})
        .then(r=>{
          if(!r.ok)throw new Error(`mark read answered ${r.status}`);
          const at=new Date().toISOString();
          setMessages(prev=>prev.map((m:any)=>unread.includes(m.id)?{...m,read_at:at}:m));
        })
        .catch((e)=>console.error('[sub-portal] mark read failed',e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[messages,tab]);

  if(loading)return(
    <div style={{minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:48,height:48,border:`3px solid ${BORDER}`,borderTopColor:GOLD,borderRadius:'50%',animation:'spin 1s linear infinite',margin:'0 auto 16px'}}/>
        <div style={{color:DIM,fontSize:14}}>Loading your portal…</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  /* ── Error ── */
  if(error||!session)return(
    <div style={{minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif'}}>
      <div style={{textAlign:'center',color:RED}}>
        <div style={{fontSize:52,marginBottom:16}}>{'\u26A0'}</div>
        <div style={{fontSize:22,fontWeight:800,color:TEXT}}>Portal Access Denied</div>
        <div style={{fontSize:14,color:DIM,marginTop:10,maxWidth:420,lineHeight:1.6}}>{error||'This portal link is invalid or has expired. Please contact your general contractor for a new link.'}</div>
      </div>
    </div>
  );

  const TABS:{key:Tab;label:string;icon:string;section:string}[]=[
    {key:'dashboard',label:'Dashboard',icon:'\u2302',section:'Work'},
    {key:'photos',label:'End of Day',icon:'\u{1F4F7}',section:'Work'},
    {key:'punch',label:'Punch List',icon:'\u2713',section:'Work'},
    {key:'daily',label:'Daily Logs',icon:'\u270D',section:'Work'},
    {key:'schedule',label:'Schedule',icon:'\u2630',section:'Work'},
    {key:'rfis',label:'RFIs',icon:'\u2753',section:'Work'},
    {key:'radio',label:'Saguaro Radio',icon:'\u224B',section:'Work'},
    {key:'payapps',label:'Invoices',icon:'\u0024',section:'Money'},
    {key:'bids',label:'Bid Invites',icon:'\u2709',section:'Money'},
    {key:'documents',label:'Documents',icon:'\u2750',section:'Files'},
    {key:'drawings',label:'Drawings',icon:'\u25A4',section:'Files'},
    {key:'compliance',label:'Compliance',icon:'\u2714',section:'Account'},
    {key:'scorecard',label:'Scorecard',icon:'\u2605',section:'Account'},
    {key:'messages',label:'Messages',icon:'\u2709',section:'Account'},
    {key:'history',label:'History',icon:'\u23F1',section:'Account'},
  ];

  /* ================================================================ */
  /*  DASHBOARD TAB                                                    */
  /* ================================================================ */
  const renderDashboard=()=>{
    const alerts=getExpirationAlerts();
    const pendingPayApps=payApps.filter((p:any)=>p.status==='submitted'||p.status==='under_review').length;
    const openRfis=rfis.filter((r:any)=>r.status==='open').length;
    const unreadMsgs=unreadCount;
    return(
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:20}}>
        {/* Welcome + Health Badge */}
        <div style={{...card(),background:`linear-gradient(135deg,${RAISED},${DARK})`,position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',right:-30,top:-30,width:140,height:140,background:`color-mix(in srgb, ${GOLD} 3%, transparent)`,borderRadius:'50%'}}/>
          <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
            <div style={{width:56,height:56,borderRadius:'50%',background:`color-mix(in srgb, ${GOLD} 13%, transparent)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,color:GOLD,fontWeight:800}}>{companyName[0]}</div>
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontSize:22,fontWeight:800,color:TEXT}}>{companyName}</div>
              <div style={{fontSize:13,color:DIM,marginTop:2}}>{sub?.trade||'--'}</div>
              <div style={{fontSize:12,color:DIM,marginTop:2}}>Contact: {sub?.contact_name||'--'} &middot; {sub?.email||'--'}</div>
            </div>
            {/* Health Score Badge */}
            <div style={{background:`color-mix(in srgb, ${healthColor} 8%, transparent)`,border:`1.5px solid color-mix(in srgb, ${healthColor} 33%, transparent)`,borderRadius:12,padding:'12px 20px',textAlign:'center',minWidth:130}}>
              <div style={{fontSize:28,fontWeight:800,color:healthColor}}>{healthScore>0?healthScore.toFixed(1):'--'}</div>
              <div style={{fontSize:10,fontWeight:700,color:healthColor}}>{healthLabel}</div>
              <div style={{fontSize:9,color:DIM,marginTop:2}}>Health Score</div>
            </div>
            {isPreferred&&(
              <div style={{background:`color-mix(in srgb, ${GOLD} 13%, transparent)`,border:`1px solid ${GOLD}`,borderRadius:8,padding:'8px 16px',display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:20}}>{'\u2B50'}</span>
                <div><div style={{fontSize:13,fontWeight:800,color:GOLD}}>Preferred Sub</div><div style={{fontSize:10,color:DIM}}>Top-rated</div></div>
              </div>
            )}
          </div>
        </div>

        {/* Insurance Expiration Alerts (30/60/90 day) */}
        {alerts.length>0&&(
          <div style={{...card(),borderColor:alerts[0].level==='critical'?`color-mix(in srgb, ${RED} 33%, transparent)`:`color-mix(in srgb, ${AMBER} 33%, transparent)`,background:alerts[0].level==='critical'?`color-mix(in srgb, ${RED} 3%, transparent)`:`color-mix(in srgb, ${AMBER} 3%, transparent)`}}>
            <div style={{fontSize:15,fontWeight:700,color:alerts[0].level==='critical'?RED:AMBER,marginBottom:10}}>{'\u26A0'} Insurance / Compliance Expiration Alerts</div>
            {alerts.map((a,i)=>{
              const days=a.doc.days_until_expiry;
              const c=a.level==='critical'?RED:a.level==='warning'?AMBER:BLUE;
              return <div key={i} style={{padding:'8px 0',borderBottom:i<alerts.length-1?`1px solid color-mix(in srgb, ${BORDER} 27%, transparent)`:'none',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                <div style={{fontSize:13,color:TEXT}}><strong style={{color:c}}>{a.doc.doc_type}</strong> &mdash; {docFileLabel(a.doc)}</div>
                <div style={{fontSize:12,fontWeight:700,color:c}}>{days<=0?'Expired':days<=30?`${days}d — Urgent`:days<=60?`${days}d — Warning`:`${days}d — Notice`}</div>
              </div>;
            })}
          </div>
        )}

        {/* The one thing a crew does every day on site: send the day's photos & video. */}
        <button onClick={()=>setTab('photos')} style={{...btnS(GOLD),width:'100%',minHeight:56,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
          <span aria-hidden style={{fontSize:20}}>{'\u{1F4F7}'}</span> Send end-of-day photos &amp; video
        </button>

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
            <button key={s.label} onClick={()=>setTab(s.action)} style={{...card(),cursor:'pointer',textAlign:'center',border:`1px solid color-mix(in srgb, ${s.color} 20%, transparent)`}}>
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
            <button key={a.label} onClick={()=>setTab(a.t)} style={{...card(),cursor:'pointer',textAlign:'center',border:`1px solid color-mix(in srgb, ${a.c} 27%, transparent)`}}>
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
              <div key={log.id} style={{padding:'10px 0',borderBottom:`1px solid color-mix(in srgb, ${BORDER} 27%, transparent)`}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:13,fontWeight:600,color:TEXT}}>{fmtDate(log.log_date)}</span><span style={badge(log.status)}>{log.status}</span></div>
                <div style={{fontSize:12,color:DIM}}>{dailyLogView(log).crew} crew &middot; {dailyLogView(log).hours}h</div>
              </div>
            ))}
          </div>
          <div style={card()}>
            <div style={{fontSize:15,fontWeight:700,color:TEXT,marginBottom:14}}>Open RFIs</div>
            {rfis.filter((r:any)=>r.status==='open').length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:20}}>No open RFIs</div>:
            rfis.filter((r:any)=>r.status==='open').slice(0,5).map((rfi:any)=>(
              <div key={rfi.id} style={{padding:'8px 0',borderBottom:`1px solid color-mix(in srgb, ${BORDER} 27%, transparent)`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div><div style={{fontSize:13,fontWeight:600,color:TEXT}}>{rfiNo[rfi.id]}</div><div style={{fontSize:11,color:DIM}}>{rfi.subject}</div></div>
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
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:20}}>
        {/* Upload Form */}
        {!onRoster?rosterNote('Compliance uploads'):<div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Upload Compliance Document</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16,marginBottom:16}}>
            <div><label htmlFor="cd-type" style={labelS}>Document Type *</label><select id="cd-type" value={docUploadType} onChange={e=>{setDocUploadType(e.target.value);setDocErr('');}} style={{...inputS,cursor:'pointer'}}><option value="">Select type…</option>{docTypes.map(t=><option key={t} value={t}>{docLabels[t]||t}</option>)}</select></div>
            <div><div style={labelS}>File *</div>
              {/* The real file — PDF, photo of the certificate, or Word. */}
              <label style={{...btnS(BORDER),minHeight:44,display:'flex',alignItems:'center',gap:8,width:'100%',boxSizing:'border-box',color:TEXT,opacity:docUploading?0.6:1,cursor:docUploading?'wait':'pointer',overflow:'hidden'}}>
                <span aria-hidden>{'↑'}</span>
                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0}}>{docFile?docFile.name:'Choose file'}</span>
                <input type="file" accept={COMPLIANCE_ACCEPT} style={{display:'none'}} disabled={docUploading}
                  onChange={e=>{setDocFile(e.target.files?.[0]||null);setDocErr('');e.currentTarget.value='';}}/>
              </label>
              {docFile&&<div style={{fontSize:11,color:DIM,marginTop:4}}>{(docFile.size/1024/1024).toFixed(1)} MB</div>}
            </div>
            <div><div style={labelS}>Expiration Date</div><SaguaroDatePicker value={docExpiry} onChange={v=>setDocExpiry(v)} style={inputS}/></div>
          </div>
          {docErr&&<div role="alert" style={{color:RED,fontSize:13,fontWeight:600,marginBottom:12}}>{docErr}</div>}
          <button onClick={uploadComplianceDoc} disabled={docUploading} style={{...btnS(BLUE),minHeight:44}}>{docUploading?(docProgress!=null&&docProgress<100?`Uploading… ${docProgress}%`:'Saving…'):'Upload Document'}</button>
        </div>}

        {/* 30/60/90 Day Expiration Alerts */}
        {alerts.length>0&&(
          <div style={{...card(),borderColor:`color-mix(in srgb, ${AMBER} 33%, transparent)`,background:`color-mix(in srgb, ${AMBER} 3%, transparent)`}}>
            <div style={{fontSize:15,fontWeight:700,color:AMBER,marginBottom:10}}>{'\u26A0'} Expiration Alerts (30/60/90 Days)</div>
            {alerts.map((a,i)=>{
              const days=a.doc.days_until_expiry;
              const c=a.level==='critical'?RED:a.level==='warning'?AMBER:BLUE;
              const levelLabel=days<=0?'Expired':days<=30?'30-Day Alert':days<=60?'60-Day Alert':'90-Day Alert';
              return <div key={i} style={{padding:'10px 12px',background:`color-mix(in srgb, ${c} 7%, transparent)`,border:`1px solid color-mix(in srgb, ${c} 20%, transparent)`,borderRadius:6,marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                <div><div style={{fontSize:13,fontWeight:700,color:TEXT}}>{docLabels[a.doc.doc_type]||a.doc.doc_type}</div><div style={{fontSize:11,color:DIM}}>{docFileLabel(a.doc)} &middot; Expires: {fmtDate(a.doc.expiry_date)}</div></div>
                <div style={{padding:'4px 12px',borderRadius:20,background:`color-mix(in srgb, ${c} 13%, transparent)`,color:c,fontSize:11,fontWeight:700}}>{levelLabel} ({days<=0?'Overdue':`${days}d`})</div>
              </div>;
            })}
          </div>
        )}

        {/* Compliance Grid */}
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Compliance Status</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14}}>
            {docTypes.map(type=>{
              const doc=complianceDocFor(complianceDocs,type);
              const status=doc?doc.expiration_status:'missing';
              const c=status==='valid'?GREEN:status==='expiring_soon'?AMBER:status==='expired'?RED:doc?.status==='approved'?GREEN:doc?.status==='pending_review'?AMBER:RED;
              return(
                <div key={type} style={{padding:16,background:DARK,borderRadius:8,border:`1px solid color-mix(in srgb, ${c} 27%, transparent)`,position:'relative'}}>
                  <div style={{position:'absolute',top:12,right:12,width:10,height:10,borderRadius:'50%',background:c}}/>
                  <div style={{fontSize:14,fontWeight:700,color:TEXT,marginBottom:6}}>{docLabels[type]||type}</div>
                  {doc?(<div>
                    <div style={{fontSize:12,color:DIM,marginBottom:4,overflowWrap:'anywhere'}}>File: {docFileLabel(doc)}</div>
                    {doc.expiry_date&&<div style={{fontSize:12,color:c,fontWeight:600,marginBottom:4}}>{doc.days_until_expiry!==null&&doc.days_until_expiry<=0?'Expired':doc.days_until_expiry!==null&&doc.days_until_expiry<=30?`Expires in ${doc.days_until_expiry} days`:`Expires: ${fmtDate(doc.expiry_date)}`}</div>}
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
                      <span style={badge(doc.status)}>{(doc.status||'').replace(/_/g,' ')}</span>
                      {doc.file_url&&<a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{...btnS(BORDER,true),minHeight:44,display:'inline-flex',alignItems:'center',textDecoration:'none',color:TEXT}}>View file</a>}
                    </div>
                  </div>):(<div style={{fontSize:12,color:RED,fontWeight:600}}>Not uploaded — action required</div>)}
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
                  <div><div style={{fontSize:13,fontWeight:600,color:TEXT}}>{doc.title||fileNameFromUrl(doc.file_url)||'Document'}</div><div style={{fontSize:11,color:DIM}}>{doc.category||'General'} &middot; {fmtDate(doc.created_at)}</div></div>
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
  /* A signed waiver as the sub sees it back: who signed, when, and the signed PDF. */
  const renderSignedWaiver=(w:any)=>(
    <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
      <div style={{fontSize:12,color:DIM,flex:1,minWidth:200,lineHeight:1.5}}>{waiverTypeLabel(w.waiver_type)} for {fmt(Number(w.amount)||0)}{w.through_date?` through ${fmtDate(w.through_date)}`:''} — signed by {w.signed_name||'your company'}{w.signer_title?`, ${w.signer_title}`:''} on {fmtDate(w.signed_at)}.</div>
      {w.file_url?<a href={w.file_url} target="_blank" rel="noopener noreferrer" style={{...btnS(BORDER,true),minHeight:44,display:'inline-flex',alignItems:'center',textDecoration:'none',color:TEXT}}>View signed PDF</a>
        :<span style={{fontSize:11,color:DIM}}>No PDF on file</span>}
    </div>
  );
  const renderPayApps=()=>{
    const statusOrder=['submitted','under_review','approved','paid'];
    /* Waivers not tied to one of the invoices below — ones the GC filed for this sub on this job. */
    const invoiceWaiverIds=new Set(payApps.map((pa:any)=>invoiceWaiver(pa,lienWaivers)?.id).filter(Boolean));
    const otherWaivers=lienWaivers.filter((w:any)=>!invoiceWaiverIds.has(w.id));
    return(
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:20}}>
        {!onRoster&&rosterNote('Invoices')}
        {otherWaivers.length>0&&(
          <div style={card()}>
            <div style={{fontSize:16,fontWeight:700,color:TEXT,marginBottom:4}}>Lien Waivers</div>
            <div style={{fontSize:12,color:DIM,marginBottom:12}}>Waivers your general contractor filed for {companyName} on this job.</div>
            {otherWaivers.map((w:any,i:number)=>{
              const signed=isSignedWaiver(w);
              return(
                <div key={w.id} style={{padding:'12px 0',borderTop:i>0?`1px solid color-mix(in srgb, ${BORDER} 27%, transparent)`:'none'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:8}}>
                    <div style={{fontSize:13,fontWeight:700,color:TEXT}}>{waiverTypeLabel(w.waiver_type)} &mdash; {fmt(Number(w.amount)||0)}{w.through_date?` through ${fmtDate(w.through_date)}`:''}</div>
                    <span style={badge(signed?'signed':(w.status||'pending'))}>{signed?'signed':(w.status||'pending')}</span>
                  </div>
                  {signed?renderSignedWaiver(w)
                    :isSignableWaiver(w)?<LienWaiverSigner defaultName={sub?.contact_name||''} onSubmit={v=>signLienWaiver({waiver_id:w.id},v)}/>
                    :null}
                </div>
              );
            })}
          </div>
        )}
        {payApps.length===0?(
          <div style={{...card(),textAlign:'center',padding:40}}>
            <div style={{fontSize:15,fontWeight:700,color:TEXT}}>No Pay Applications Yet</div>
            <div style={{fontSize:13,color:DIM,marginTop:6}}>Pay applications will appear here once submitted.</div>
          </div>
        ):payApps.map((pa:any)=>{const iv=invoiceView(pa);return(
          <div key={pa.id} style={card()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:10}}>
              <div><div style={{fontSize:16,fontWeight:700,color:TEXT}}>Invoice {invoiceNo[pa.id]}</div><div style={{fontSize:12,color:DIM}}>Period: {iv.periodFrom?`${fmtDate(iv.periodFrom)} – `:'through '}{fmtDate(iv.periodTo)}</div></div>
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
              <div style={{padding:'10px 14px',background:DARK,borderRadius:6,border:`1px solid ${BORDER}`}}><div style={{fontSize:10,color:DIM}}>Requested</div><div style={{fontSize:16,fontWeight:700,color:TEXT}}>{fmt(iv.requested)}</div></div>
              <div style={{padding:'10px 14px',background:DARK,borderRadius:6,border:`1px solid ${BORDER}`}}><div style={{fontSize:10,color:DIM}}>Retainage Held</div><div style={{fontSize:16,fontWeight:700,color:AMBER}}>{fmt(iv.retainage)}</div></div>
              <div style={{padding:'10px 14px',background:DARK,borderRadius:6,border:`1px solid ${BORDER}`}}><div style={{fontSize:10,color:DIM}}>Net Amount</div><div style={{fontSize:16,fontWeight:700,color:GREEN}}>{fmt(iv.net)}</div></div>
            </div>

            {/* Line items — prev_completed / this_period / total_completed / percent_complete / balance are the real columns */}
            {iv.lines.length>0&&(
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',minWidth:640}}>
                  <thead><tr>{['Description','Scheduled Value','Previous','This Period','Completed to Date','% Complete','Balance'].map(h=><th key={h} style={{textAlign:'left',padding:'6px 10px',fontSize:10,fontWeight:700,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>)}</tr></thead>
                  <tbody>{iv.lines.map(li=>(
                    <tr key={li.id} style={{borderBottom:`1px solid color-mix(in srgb, ${BORDER} 27%, transparent)`}}>
                      <td style={{padding:'8px 10px',fontSize:12,color:TEXT}}>{li.description}</td>
                      <td style={{padding:'8px 10px',fontSize:12,color:DIM}}>{fmt(li.scheduled)}</td>
                      <td style={{padding:'8px 10px',fontSize:12,color:DIM}}>{fmt(li.previous)}</td>
                      <td style={{padding:'8px 10px',fontSize:12,color:TEXT,fontWeight:600}}>{fmt(li.thisPeriod)}</td>
                      <td style={{padding:'8px 10px',fontSize:12,color:TEXT}}>{fmt(li.completedToDate)}</td>
                      <td style={{padding:'8px 10px',fontSize:12,color:DIM}}>{fmtPercent(li.percent)}</td>
                      <td style={{padding:'8px 10px',fontSize:12,color:DIM}}>{fmt(li.balance)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {/* Lien Waiver — saved as a lien_waivers row (the GC's Lien Waivers page) with a signed PDF.
                This button used to show a toast and save nothing. */}
            {waiverTypeForInvoice(pa.status)&&(()=>{
              const w=invoiceWaiver(pa,lienWaivers);
              const signed=!!w&&isSignedWaiver(w);
              const c=signed?GREEN:PURPLE;
              return(
                <div style={{marginTop:14,padding:'12px 16px',background:`color-mix(in srgb, ${c} 7%, transparent)`,border:`1px solid color-mix(in srgb, ${c} 27%, transparent)`,borderRadius:8}}>
                  <div style={{fontSize:13,fontWeight:700,color:c,marginBottom:4}}>{signed?'Lien Waiver Signed':`Lien Waiver: ${pa.status==='paid'?'Unconditional':'Conditional'} Required`}</div>
                  {signed&&w?renderSignedWaiver(w):(<>
                    <div style={{fontSize:12,color:DIM,marginBottom:10}}>{pa.status==='paid'?`Unconditional lien waiver for ${fmt(iv.net)} through ${fmtDate(iv.periodTo)} — sign it to confirm this payment was received.`:`Conditional lien waiver for ${fmt(iv.net)} through ${fmtDate(iv.periodTo)} — it takes effect once you are paid.`}</div>
                    <LienWaiverSigner defaultName={sub?.contact_name||''} onSubmit={v=>signLienWaiver({pay_app_id:pa.id},v)}/>
                  </>)}
                </div>
              );
            })()}
          </div>
        );})}
      </div>
    );
  };

  /* ================================================================ */
  /*  DAILY LOGS TAB                                                   */
  /* ================================================================ */
  const renderDaily=()=>(
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:20}}>
      {!isOnline&&<div style={{padding:'10px 16px',background:`color-mix(in srgb, ${AMBER} 13%, transparent)`,border:`1px solid ${AMBER}`,borderRadius:8,display:'flex',alignItems:'center',gap:10}}><div style={{width:10,height:10,borderRadius:'50%',background:AMBER}}/><span style={{fontSize:13,color:AMBER,fontWeight:600}}>You are offline. Logs will be queued and submitted when connection is restored.</span></div>}

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
      {!onRoster?rosterNote('Daily logs'):<div style={card()}>
        <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Submit Daily Log</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16,marginBottom:16}}>
          <div><div style={labelS}>Log Date *</div><SaguaroDatePicker value={dlForm.log_date} onChange={v=>setDlForm(f=>({...f,log_date:v}))} style={inputS}/></div>
          <div><div style={labelS}>Crew Count</div><input type="number" value={dlForm.crew_count} onChange={e=>setDlForm(f=>({...f,crew_count:e.target.value}))} placeholder="Number of workers" style={inputS}/></div>
          <div><div style={labelS}>Hours Worked</div><input type="number" step="0.5" value={dlForm.hours_worked} onChange={e=>setDlForm(f=>({...f,hours_worked:e.target.value}))} placeholder="Total hours" style={inputS}/></div>
          <div><div style={labelS}>Weather</div><input value={dlForm.weather} onChange={e=>setDlForm(f=>({...f,weather:e.target.value}))} placeholder="Clear, 85F" style={inputS}/></div>
        </div>
        <div style={{marginBottom:16}}><div style={labelS}>Work Completed Today *</div><textarea value={dlForm.work_completed} onChange={e=>setDlForm(f=>({...f,work_completed:e.target.value}))} placeholder="Describe all work completed today…" style={textareaS}/></div>
        <div style={{marginBottom:16}}><div style={labelS}>Work Planned for Tomorrow</div><textarea value={dlForm.work_planned} onChange={e=>setDlForm(f=>({...f,work_planned:e.target.value}))} placeholder="What is planned for the next work day…" style={textareaS}/></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:16,marginBottom:16}}>
          <div><div style={labelS}>Delays / Issues</div><textarea value={dlForm.delays} onChange={e=>setDlForm(f=>({...f,delays:e.target.value}))} placeholder="Any delays, weather issues, material shortages…" style={{...textareaS,minHeight:60}}/></div>
          <div><div style={labelS}>Safety Incidents</div><textarea value={dlForm.safety_incidents} onChange={e=>setDlForm(f=>({...f,safety_incidents:e.target.value}))} placeholder="Any safety incidents or near-misses (leave blank if none)" style={{...textareaS,minHeight:60}}/></div>
        </div>
        <div style={{marginBottom:16}}><div style={labelS}>Additional Notes</div><textarea value={dlForm.notes} onChange={e=>setDlForm(f=>({...f,notes:e.target.value}))} placeholder="Any additional notes…" style={{...textareaS,minHeight:50}}/></div>
        <button onClick={submitDailyLog} disabled={dlSaving} style={btnS(GREEN)}>{dlSaving?'Submitting…':'Submit Daily Log'}</button>
      </div>}

      {/* Previous Logs */}
      <div style={card()}>
        <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Previous Daily Logs</div>
        {dailyLogs.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No daily logs submitted yet. Submit your first log above.</div>:
        dailyLogs.map((log:any)=>{const v=dailyLogView(log);return(
          <div key={log.id} style={{padding:16,background:DARK,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8}}>
              <div style={{fontSize:15,fontWeight:700,color:TEXT}}>{fmtDate(log.log_date)}</div>
              <span style={badge(log.status)}>{(log.status||'').replace(/_/g,' ')}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10,marginBottom:10}}>
              <div style={{fontSize:12}}><span style={{color:DIM}}>Crew:</span> <span style={{color:TEXT,fontWeight:600}}>{v.crew}</span></div>
              <div style={{fontSize:12}}><span style={{color:DIM}}>Hours:</span> <span style={{color:TEXT,fontWeight:600}}>{v.hours}h</span></div>
            </div>
            {v.workPerformed&&<div style={{fontSize:13,color:TEXT,marginBottom:6,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{v.workPerformed}</div>}
            {v.materials&&<div style={{fontSize:12,color:DIM,marginTop:4,whiteSpace:'pre-wrap'}}>Materials: {v.materials}</div>}
            {v.delays&&<div style={{fontSize:12,color:AMBER,marginTop:4,whiteSpace:'pre-wrap'}}>Delays: {v.delays}</div>}
            {/* Planned work, weather and safety notes are saved into notes by the daily-log route. */}
            {v.notes&&<div style={{fontSize:12,color:DIM,marginTop:6,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{v.notes}</div>}
          </div>
        );})}
      </div>
    </div>
  );

  /* ================================================================ */
  /*  RFI TAB                                                          */
  /* ================================================================ */
  const renderRfis=()=>(
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:20}}>
      {/* RFI Form */}
      {!onRoster?rosterNote('RFIs'):<div style={card()}>
        <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Submit RFI (Request for Information)</div>
        <div style={{marginBottom:14}}><div style={labelS}>Subject *</div><input value={rfiForm.subject} onChange={e=>setRfiForm(f=>({...f,subject:e.target.value}))} placeholder="Brief description of the question" style={inputS}/></div>
        <div style={{marginBottom:14}}><div style={labelS}>Question / Details *</div><textarea value={rfiForm.question} onChange={e=>setRfiForm(f=>({...f,question:e.target.value}))} placeholder="Detailed question or request…" style={textareaS}/></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16,marginBottom:14}}>
          <div><div style={labelS}>Priority</div><select value={rfiForm.priority} onChange={e=>setRfiForm(f=>({...f,priority:e.target.value}))} style={{...inputS,cursor:'pointer'}}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div>
          <div><div style={labelS}>Reference Drawing</div><input value={rfiForm.reference_drawing} onChange={e=>setRfiForm(f=>({...f,reference_drawing:e.target.value}))} placeholder="e.g. A-201" style={inputS}/></div>
          <div><div style={labelS}>Reference Spec Section</div><input value={rfiForm.reference_spec} onChange={e=>setRfiForm(f=>({...f,reference_spec:e.target.value}))} placeholder="e.g. 03 30 00" style={inputS}/></div>
        </div>
        <button onClick={submitRfi} disabled={rfiSaving} style={btnS(PURPLE)}>{rfiSaving?'Submitting…':'Submit RFI'}</button>
      </div>}

      {/* RFI History */}
      <div style={card()}>
        <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>RFI History</div>
        {rfis.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No RFIs submitted yet.</div>:
        rfis.map((rfi:any)=>(
          <div key={rfi.id} style={{padding:14,background:DARK,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:10}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,flexWrap:'wrap',gap:8}}>
              <div><span style={{fontSize:12,color:GOLD,fontWeight:700,marginRight:8}}>{rfiNo[rfi.id]}</span><span style={{fontSize:14,fontWeight:700,color:TEXT}}>{rfi.subject}</span></div>
              <span style={badge(rfi.status)}>{rfi.status}</span>
            </div>
            <div style={{fontSize:12,color:DIM,marginBottom:4}}>Submitted: {fmtDate(rfi.submitted_at||rfi.created_at)}</div>
            {/* Priority and drawing / spec references are saved inside the question (portal_sub_rfis has no columns for them). */}
            <div style={{fontSize:13,color:TEXT,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{rfi.question}</div>
            {rfi.answer&&<div style={{marginTop:8,padding:'8px 12px',background:`color-mix(in srgb, ${GREEN} 7%, transparent)`,borderRadius:6,border:`1px solid color-mix(in srgb, ${GREEN} 27%, transparent)`}}><div style={{fontSize:11,fontWeight:700,color:GREEN,marginBottom:4}}>Answer{rfi.answered_at?` · ${fmtDate(rfi.answered_at)}`:''}:</div><div style={{fontSize:12,color:TEXT,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{rfi.answer}</div></div>}
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
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:20}}>
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Assigned Tasks &amp; Schedule</div>
          {tasks.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No schedule data available</div>:(
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
                <thead><tr>{['Task','Phase','Start','End','Progress','Status'].map(h=><th key={h} style={{textAlign:'left',padding:'8px 12px',fontSize:11,fontWeight:700,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>)}</tr></thead>
                <tbody>{sorted.map((task:any)=>{
                  const pct=Math.round((task.percent_complete||0)*100);
                  const c=pct>=100?GREEN:pct>=50?BLUE:AMBER;
                  return(
                    <tr key={task.id} style={{borderBottom:`1px solid color-mix(in srgb, ${BORDER} 27%, transparent)`}}>
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
    /* portal_sub_scorecards has quality / schedule / safety / communication — no cleanup score. */
    const cats=SCORE_CATEGORIES;
    const reviews=Number(scorecard?.total_reviews)||0;
    return(
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:20}}>
        {/* Overall */}
        <div style={{...card(),background:`linear-gradient(135deg,${RAISED},${DARK})`,textAlign:'center'}}>
          {isPreferred&&<div style={{marginBottom:16,display:'inline-flex',alignItems:'center',gap:10,background:`color-mix(in srgb, ${GOLD} 13%, transparent)`,border:`1px solid ${GOLD}`,borderRadius:30,padding:'8px 20px'}}><span style={{fontSize:22}}>{'\u2B50'}</span><span style={{fontSize:15,fontWeight:800,color:GOLD}}>Preferred Subcontractor</span></div>}
          <div style={{fontSize:56,fontWeight:800,color:GOLD}}>{overallScore>0?overallScore.toFixed(1):'--'}</div>
          <Stars rating={overallScore} size={28}/>
          <div style={{fontSize:14,color:DIM,marginTop:8}}>{reviews>0?`Overall Performance Rating (${reviews} review${reviews===1?'':'s'})`:overallScore>0?'Overall rating from your general contractor':'Not rated yet'}</div>
        </div>

        {/* Health Score Card */}
        <div style={{...card(),textAlign:'center'}}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Sub Health Score</div>
          <div style={{width:100,height:100,borderRadius:'50%',border:`4px solid ${healthColor}`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
            <div style={{fontSize:32,fontWeight:800,color:healthColor}}>{healthScore>0?healthScore.toFixed(1):'--'}</div>
          </div>
          <div style={{fontSize:13,fontWeight:700,color:healthColor}}>{healthLabel}</div>
          <div style={{fontSize:12,color:DIM,marginTop:8,lineHeight:1.6}}>Based on: your rating, compliance documents on file, invoices approved or paid, and daily logs submitted.</div>
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
                <thead><tr>{['Date',...cats.map(c=>c.label),'Notes'].map(h=><th key={h} style={{textAlign:'left',padding:'8px 12px',fontSize:11,fontWeight:700,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>)}</tr></thead>
                <tbody>{scorecard.scorecards.map((sc:any)=>(
                  <tr key={sc.id} style={{borderBottom:`1px solid color-mix(in srgb, ${BORDER} 27%, transparent)`}}>
                    <td style={{padding:'8px 12px',fontSize:12,color:DIM}}>{fmtDate(sc.created_at)}</td>
                    {cats.map(c=><td key={c.key} style={{padding:'8px 12px'}}>{sc[c.key]!=null?<Stars rating={Number(sc[c.key])} size={12}/>:'--'}</td>)}
                    <td style={{padding:'8px 12px',fontSize:11,color:DIM,maxWidth:200}}>{sc.notes||'--'}</td>
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
    return(
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:20}}>
        <div style={card()}>
          <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:16}}>Messages with GC</div>
          <div style={{maxHeight:500,overflowY:'auto',padding:'10px 0',marginBottom:16}}>
            {messages.length===0?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No messages yet. Start a conversation below.</div>:
            messages.map((msg:any)=>{
              const isSub=msg.sender_type==='sub';
              return(
                <div key={msg.id} style={{display:'flex',justifyContent:isSub?'flex-end':'flex-start',marginBottom:10}}>
                  <div style={{maxWidth:'75%',padding:'10px 14px',borderRadius:12,background:isSub?`color-mix(in srgb, ${BLUE} 13%, transparent)`:RAISED,border:`1px solid ${isSub?`color-mix(in srgb, ${BLUE} 27%, transparent)`:BORDER}`,borderBottomRightRadius:isSub?2:12,borderBottomLeftRadius:isSub?12:2}}>
                    <div style={{fontSize:13,color:TEXT,lineHeight:1.5}}>{msg.content}</div>
                    <div style={{fontSize:10,color:DIM,marginTop:4,textAlign:isSub?'right':'left'}}>{isSub?'You':'GC'} &middot; {fmtDate(msg.created_at)}</div>
                  </div>
                </div>
              );
            })}
            <div ref={msgEndRef}/>
          </div>
          {onRoster&&<div style={{display:'flex',gap:10}}>
            <input value={msgContent} onChange={e=>setMsgContent(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}}} placeholder="Type a message…" style={{...inputS,flex:1}}/>
            <button onClick={sendMessage} disabled={msgSending} style={btnS(BLUE)}>{msgSending?'…':'Send'}</button>
          </div>}
        </div>
        {!onRoster&&rosterNote('Messages')}
      </div>
    );
  };

  /* ================================================================ */
  /*  RADIO TAB                                                        */
  /* ================================================================ */
  const renderRadio=()=>{
    if(!radioLoaded)return(
      <div style={{...card(),textAlign:'center',padding:40}}>
        <div style={{color:DIM,fontSize:13}}>Tuning in to the project channel…</div>
      </div>
    );
    if(!radioChannel)return(
      <div style={{...card(),textAlign:'center',padding:40}}>
        <div style={{fontSize:34,marginBottom:10,color:DIM}}>{'≋'}</div>
        <div style={{fontSize:16,fontWeight:800,color:TEXT}}>Radio Not Enabled Yet</div>
        <div style={{fontSize:13,color:DIM,marginTop:8,lineHeight:1.6,maxWidth:420,marginLeft:'auto',marginRight:'auto'}}>Your general contractor has not opened a radio channel for this project yet. Once they do, live voice and text traffic will appear here.</div>
      </div>
    );
    return(
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:20}}>
        <div style={card()}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:GREEN,boxShadow:`0 0 8px ${GREEN}`,flexShrink:0}}/>
            <div style={{flex:1,minWidth:160}}>
              <div style={{fontSize:17,fontWeight:700,color:TEXT}}>{radioChannel.name||'Radio'}</div>
              {typeof radioChannel.on_channel==='number'&&radioChannel.on_channel>0&&<div style={{fontSize:11,color:DIM,marginTop:2}}>{radioChannel.on_channel} on channel now</div>}
            </div>
            <div style={{display:'flex',border:`1px solid ${BORDER}`,borderRadius:8,overflow:'hidden'}}>
              {(['en','es'] as const).map(l=>(
                <button key={l} onClick={()=>setRadioLang(l)} style={{padding:'6px 14px',border:'none',cursor:'pointer',fontSize:11,fontWeight:800,letterSpacing:.6,background:radioLang===l?GOLD:'transparent',color:radioLang===l?'#0A0A00':DIM}}>{l.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <style>{`@keyframes sgRadioFlash{0%{background:color-mix(in srgb, var(--brand-primary) 16%, transparent)}100%{background:transparent}}@keyframes sgRadioRing{0%{box-shadow:0 0 0 3px color-mix(in srgb, var(--brand-primary) 45%, transparent)}100%{box-shadow:0 0 0 0 transparent}}`}</style>
          <div ref={radioFeedRef} style={{maxHeight:480,overflowY:'auto',padding:'4px 0',marginBottom:14}}>
            {radioMsgs.length===0&&<div style={{color:DIM,fontSize:13,textAlign:'center',padding:40}}>No radio traffic yet. Say something below.</div>}
            {radioMsgs.map((m:any)=>{
              const mine=!!m.sender_portal_sub_id&&m.sender_portal_sub_id===radioMemberId;
              const t=m.translations||{};
              const shown=t[radioLang]||m.body||m.transcript||'';
              if(m.kind==='panic'||m.kind==='alert'){
                const c=m.kind==='panic'?RED:AMBER;
                return(
                  <div key={m.id} style={{padding:'10px 14px',background:`color-mix(in srgb, ${c} 7%, transparent)`,border:`1px solid color-mix(in srgb, ${c} 33%, transparent)`,borderRadius:8,marginBottom:10,...(radioFlashIds.has(m.id)?{animation:'sgRadioRing 2.4s ease-out'}:{})}}>
                    <div style={{fontSize:11,fontWeight:800,color:c,marginBottom:4}}>{'⚠'} {m.kind==='panic'?'Panic':'Alert'} &middot; {m.sender_name||'Unknown'}{m.patched_from?<span style={{marginLeft:6,fontSize:9,fontWeight:700,color:GOLD,background:`color-mix(in srgb, ${GOLD} 8%, transparent)`,border:`1px solid color-mix(in srgb, ${GOLD} 27%, transparent)`,borderRadius:10,padding:'1px 7px',letterSpacing:.5,verticalAlign:'middle'}}>Via Patched Channel</span>:null}</div>
                    {shown&&<div style={{fontSize:13,color:TEXT,lineHeight:1.5}}>{shown}</div>}
                    <div style={{fontSize:10,color:DIM,marginTop:4}}>{new Date(m.created_at).toLocaleTimeString()}</div>
                  </div>
                );
              }
              if(m.kind==='tone'){
                const tone=String(m.body||'');
                const tc=tone==='negative'?RED:tone==='comein'?AMBER:GREEN;
                const tl=tone==='negative'?'Negative':tone==='comein'?'Come In':'Ack';
                return(
                  <div key={m.id} style={{display:'flex',justifyContent:mine?'flex-end':'flex-start',marginBottom:10,...(radioFlashIds.has(m.id)?{animation:'sgRadioFlash 2.4s ease-out',borderRadius:10}:{})}}>
                    <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'6px 12px',background:`color-mix(in srgb, ${tc} 8%, transparent)`,border:`1px solid color-mix(in srgb, ${tc} 33%, transparent)`,borderRadius:20,flexWrap:'wrap'}}>
                      <span style={{width:7,height:7,borderRadius:'50%',background:tc,flexShrink:0}}/>
                      <span style={{fontSize:11,fontWeight:800,color:tc}}>{tl}</span>
                      <span style={{fontSize:10,color:DIM}}>{mine?'You':(m.sender_name||'Unknown')} &middot; {new Date(m.created_at).toLocaleTimeString()}</span>
                      {m.patched_from&&<span style={{fontSize:9,fontWeight:700,color:GOLD,background:`color-mix(in srgb, ${GOLD} 8%, transparent)`,border:`1px solid color-mix(in srgb, ${GOLD} 27%, transparent)`,borderRadius:10,padding:'1px 7px',letterSpacing:.5}}>Via Patched Channel</span>}
                    </div>
                  </div>
                );
              }
              return(
                <div key={m.id} style={{display:'flex',justifyContent:mine?'flex-end':'flex-start',marginBottom:10,...(radioFlashIds.has(m.id)?{animation:'sgRadioFlash 2.4s ease-out',borderRadius:10}:{})}}>
                  <div style={{maxWidth:'80%',padding:'10px 14px',borderRadius:12,background:mine?`color-mix(in srgb, ${BLUE} 13%, transparent)`:RAISED,border:`1px solid ${mine?`color-mix(in srgb, ${BLUE} 27%, transparent)`:BORDER}`,borderBottomRightRadius:mine?2:12,borderBottomLeftRadius:mine?12:2}}>
                    <div style={{fontSize:11,fontWeight:700,color:mine?GOLD:DIM,marginBottom:4}}>{mine?'You':(m.sender_name||'Unknown')}{m.patched_from?<span style={{marginLeft:6,fontSize:9,fontWeight:700,color:GOLD,background:`color-mix(in srgb, ${GOLD} 8%, transparent)`,border:`1px solid color-mix(in srgb, ${GOLD} 27%, transparent)`,borderRadius:10,padding:'1px 7px',letterSpacing:.5,verticalAlign:'middle'}}>Via Patched Channel</span>:null}</div>
                    {m.kind==='voice'?(
                      <div>
                        <RadioWave seed={String(m.id||'')} color={mine?GOLD:DIM}/>
                        {m.audio_url?<audio controls preload="none" src={m.audio_url} onPlay={()=>{if(mine||!m.id||radioReceiptSentRef.current.has(m.id))return;radioReceiptSentRef.current.add(m.id);fetch(`/api/portal/sub/radio?token=${token}`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({receiptMessageIds:[m.id]})}).catch(()=>{});}} style={{width:230,maxWidth:'100%',height:36,display:'block'}}/>:<div style={{fontSize:12,color:DIM}}>Voice message</div>}
                        <div style={{fontSize:10,color:DIM,marginTop:4}}>{m.audio_duration_secs?`${m.audio_duration_secs}s voice`:'voice'}</div>
                        {(t[radioLang]||m.transcript)&&(
                          <div style={{fontSize:12,color:DIM,marginTop:6,lineHeight:1.5,fontStyle:t[radioLang]?'normal':'italic',borderLeft:`2px solid ${BORDER}`,paddingLeft:8}}>
                            {t[radioLang]&&<span style={{color:GOLD,fontWeight:800,fontSize:9,letterSpacing:.8,marginRight:6}}>{radioLang.toUpperCase()}</span>}
                            &ldquo;{t[radioLang]||m.transcript}&rdquo;
                          </div>
                        )}
                      </div>
                    ):m.kind==='image'?(
                      <div>
                        {m.image_url&&<a href={m.image_url} target="_blank" rel="noreferrer"><img src={m.image_url} alt="radio attachment" style={{maxWidth:220,borderRadius:8,display:'block'}}/></a>}
                        {shown&&<div style={{fontSize:13,color:TEXT,marginTop:6,lineHeight:1.5}}>{shown}</div>}
                      </div>
                    ):(
                      <div style={{fontSize:13,color:TEXT,lineHeight:1.5}}>{shown}</div>
                    )}
                    <div style={{fontSize:10,color:DIM,marginTop:4,textAlign:mine?'right':'left'}}>{new Date(m.created_at).toLocaleTimeString()}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{display:'flex',gap:10}}>
            <label title="Attach a photo or PDF" aria-label="Attach a photo or PDF" style={{...btnS(BORDER),padding:'11px 14px',display:'inline-flex',alignItems:'center',justifyContent:'center',opacity:radioAttaching?0.6:1,cursor:radioAttaching?'wait':'pointer',flexShrink:0}}>
              <span style={{fontSize:15,lineHeight:'1'}}>{radioAttaching?'…':'\u{1F4CE}'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/heic,application/pdf,.png,.jpg,.jpeg,.webp,.heic,.pdf" style={{display:'none'}} disabled={radioAttaching}
                onChange={e=>{sendRadioAttachment(e.target.files?.[0]||null);e.currentTarget.value='';}}/>
            </label>
            <input value={radioText} onChange={e=>setRadioText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendRadioText();}}} placeholder="Message the channel…" style={{...inputS,flex:1}}/>
            <button onClick={sendRadioText} disabled={radioSending} style={btnS(BLUE)}>{radioSending?'…':'Send'}</button>
          </div>
          {radioVoiceSupported&&(
            <button
              onMouseDown={startRadioRec} onMouseUp={stopRadioRec} onMouseLeave={stopRadioRec}
              onTouchStart={e=>{e.preventDefault();startRadioRec();}} onTouchEnd={e=>{e.preventDefault();stopRadioRec();}} onContextMenu={e=>e.preventDefault()}
              style={{...btnS(radioRecording?RED:GOLD),width:'100%',marginTop:12,userSelect:'none',touchAction:'none'}}>
              {radioRecording?'● Recording — Release to Send':'≋ Hold to Talk'}
            </button>
          )}
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  RENDER ACTIVE TAB                                                */
  /* ================================================================ */
  /* ── DOCUMENTS: multi-type uploads by category, expiry-tracked, media grid ── */
  const DOC_CATS=[['insurance','Insurance / COI'],['w9','W-9'],['lien_waiver','Lien Waiver'],['safety_cert','Safety Cert'],['license','License'],['bond','Bond'],['closeout','Closeout Doc'],['photo','Photo'],['video','Video'],['other','Other']];
  const isMedia=(d:any)=>/^(image|video)\//.test(d.doc_type||'')||d.category==='photo'||d.category==='video';
  /* Documents upload: the bytes go straight to storage through a one-time signed
     URL (the compliance upload's road), then the record is saved with the path.
     It used to post the file through the server, where the ~4.5 MB serverless
     request cap refused anything bigger although this tab says 100 MB. */
  const handleDocUpload=async(file:File|null)=>{
    if(!file||uploading)return;
    const name=checkDocumentFileName(file.name);
    if(!name.ok){showToast(name.message);return;}
    if(file.size>DOCUMENT_MAX_BYTES){showToast(`That file is over ${DOCUMENT_MAX_MB} MB. Upload a smaller file.`);return;}
    setUploading(true);setUploadProgress(0);
    try{
      const urlRes=await fetch(`/api/portal/sub/documents/upload-url?token=${token}`,{method:'POST',headers,body:JSON.stringify({fileName:file.name,size:file.size})});
      const up=await urlRes.json().catch(()=>null);
      if(!urlRes.ok||!up?.path){showToast(up?.error||"Couldn't start the upload. Please try again.");return;}
      await putSigned(up,file,f=>setUploadProgress(Math.round(f*100)));
      const recRes=await fetch(`/api/portal/sub/documents?token=${token}`,{method:'POST',headers,body:JSON.stringify({path:up.path,category:docCategory,title:file.name,size:file.size,expiry_date:docExpiry||null})});
      const res=await recRes.json().catch(()=>null);
      if(recRes.ok&&res?.success){
        setDocuments((ds:any[])=>[res.document,...ds]);
        showToast('Uploaded — the GC can see it now.');
        if(['insurance','w9','lien_waiver','safety_cert','license','bond'].includes(docCategory)){
          fetch(`/api/portal/sub/compliance?token=${token}`,{headers}).then(r=>r.json()).then(d=>setComplianceDocs(d.compliance_docs||[])).catch(e=>console.error('[sub-portal] compliance refresh failed',e));
        }
        refreshActivity();
      } else showToast(res?.error||"Couldn't save the document. Please try again.");
    }catch(e){
      console.error('[sub-portal] document upload failed',e);
      showToast(e instanceof Error&&e.message?`Upload failed: ${e.message}`:'No connection — the file was not uploaded. Try again.');
    }finally{
      setUploading(false);setUploadProgress(null);
    }
  };
  const renderDocuments=()=>{
    const files=documents.filter((d:any)=>!isMedia(d));
    const media=documents.filter(isMedia);
    return(
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:20}}>
        <div style={card()}>
          <div style={{fontSize:16,fontWeight:800,color:TEXT,marginBottom:4}}>Upload a Document</div>
          <div style={{fontSize:12,color:DIM,marginBottom:14}}>PDF, Excel, Word, CSV, photos or video &middot; {DOCUMENT_MAX_MB} MB max. Insurance, W-9 and other compliance docs update your payment status automatically.</div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
            <div><label style={labelS}>Category</label>
              <select value={docCategory} onChange={e=>setDocCategory(e.target.value)} style={{...inputS,width:200}}>
                {DOC_CATS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select></div>
            {['insurance','safety_cert','license','bond'].includes(docCategory)&&(
              <div><label style={labelS}>Expiration Date</label>
                <SaguaroDatePicker value={docExpiry} onChange={v=>setDocExpiry(v)} style={{...inputS,width:170}}/></div>
            )}
            <label style={{...btnS(GOLD),display:'inline-flex',alignItems:'center',gap:8,minHeight:44,boxSizing:'border-box',opacity:uploading?0.6:1,cursor:uploading?'wait':'pointer'}}>
              {uploading?(uploadProgress!=null&&uploadProgress<100?`Uploading\u2026 ${uploadProgress}%`:'Saving\u2026'):'\u2191 Choose File & Upload'}
              <input type="file" accept={DOCUMENT_ACCEPT} style={{display:'none'}} disabled={uploading}
                onChange={e=>{handleDocUpload(e.target.files?.[0]||null);e.currentTarget.value='';}}/>
            </label>
          </div>
        </div>
        <div style={card()}>
          <div style={{fontSize:15,fontWeight:800,color:TEXT,marginBottom:12}}>Documents ({files.length})</div>
          {files.length===0&&<div style={{color:DIM,fontSize:13}}>Nothing here yet — your uploads and documents the GC shares with you appear here.</div>}
          {files.map((d:any)=>(
            <div key={d.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:`1px solid color-mix(in srgb, ${BORDER} 27%, transparent)`,flexWrap:'wrap'}}>
              <span style={{fontSize:20}}>{/pdf/i.test(d.doc_type||'')?'\u{1F4C4}':/sheet|excel|csv/i.test(d.doc_type||'')?'\u{1F4CA}':/word/i.test(d.doc_type||'')?'\u{1F4DD}':'\u{1F4CE}'}</span>
              <div style={{flex:1,minWidth:180}}>
                <div style={{fontSize:13,fontWeight:700,color:TEXT}}>{d.title}</div>
                <div style={{fontSize:11,color:DIM}}>{(DOC_CATS.find(c=>c[0]===d.category)?.[1])||d.category} &middot; {fmtDate(d.created_at)}{d.file_size?` \u00b7 ${(d.file_size/1024/1024).toFixed(1)} MB`:''}</div>
              </div>
              <span style={badge(d.status||'submitted')}>{d.status||'submitted'}</span>
              {d.file_url&&<a href={d.file_url} target="_blank" rel="noreferrer" style={{...btnS(BORDER,true),textDecoration:'none',color:TEXT}}>View</a>}
            </div>
          ))}
        </div>
        <div style={card()}>
          <div style={{fontSize:15,fontWeight:800,color:TEXT,marginBottom:12}}>Photos & Video ({media.length})</div>
          {media.length===0&&<div style={{color:DIM,fontSize:13}}>Upload site-condition photos or work-proof video with the button above (category Photo or Video).</div>}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10}}>
            {media.map((d:any)=>(
              <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer" style={{display:'block',borderRadius:10,overflow:'hidden',border:`1px solid ${BORDER}`,background:DARK,textDecoration:'none'}}>
                {/^video\//.test(d.doc_type||'')||d.category==='video'
                  ?<video src={d.file_url} style={{width:'100%',height:110,objectFit:'cover',display:'block'}} muted/>
                  :<img src={d.file_url} alt={d.title} style={{width:'100%',height:110,objectFit:'cover',display:'block'}}/>}
                <div style={{padding:'6px 8px',fontSize:11,color:DIM,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{d.title}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  };
  /* ── DRAWINGS: read-only current set, grouped by discipline ── */
  const renderDrawings=()=>{
    const groups=drawings.reduce((m:Record<string,any[]>,d:any)=>{const k=d.discipline||'General';(m[k]=m[k]||[]).push(d);return m;},{} as Record<string,any[]>);
    return(
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:20}}>
        {drawings.length===0&&<div style={card()}><div style={{color:DIM,fontSize:13}}>No current drawings shared for this project yet.</div></div>}
        {Object.entries(groups).map(([disc,list]:[string,any[]])=>(
          <div key={disc} style={card()}>
            <div style={{fontSize:11,fontWeight:700,color:DIM,marginBottom:10}}>{disc} &middot; {list.length} sheet{list.length===1?'':'s'}</div>
            {list.map((d:any)=>(
              <div key={d.id} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 0',borderBottom:`1px solid color-mix(in srgb, ${BORDER} 27%, transparent)`,flexWrap:'wrap'}}>
                <span style={{fontSize:12,fontWeight:800,color:GOLD,minWidth:64}}>{d.sheet_number||'--'}</span>
                <div style={{flex:1,minWidth:160,fontSize:13,color:TEXT}}>{d.name}</div>
                <span style={{fontSize:11,color:DIM}}>Rev {d.version??'--'}{d.revision_date?` \u00b7 ${fmtDate(d.revision_date)}`:''}</span>
                {d.url&&<a href={d.url} target="_blank" rel="noreferrer" style={{...btnS(GOLD,true),textDecoration:'none'}}>Open</a>}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };
  /* ── PUNCH: items on the project, close with photo proof ── */
  const handlePunchComplete=async(itemId:string,photo:File|null)=>{
    const form=new FormData();
    form.append('item_id',itemId);
    if(photo)form.append('photo',photo);
    const res=await apiUpload('punch',form);
    if(res.success){
      setPunchItems((ps:any[])=>ps.map(p=>p.id===itemId?{...p,status:'completed',completed_at:new Date().toISOString()}:p));
      showToast('Punch item completed.');refreshActivity();
    } else showToast(res.error||'Could not complete item.');
  };
  const renderPunch=()=>{
    const open=punchItems.filter((p:any)=>p.status!=='completed'&&p.status!=='verified');
    const done=punchItems.filter((p:any)=>p.status==='completed'||p.status==='verified');
    return(
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:20}}>
        <div style={card()}>
          <div style={{fontSize:15,fontWeight:800,color:TEXT,marginBottom:12}}>Open Items ({open.length})</div>
          {open.length===0&&<div style={{color:DIM,fontSize:13}}>Nothing open — you're clear on this project.</div>}
          {open.map((p:any)=>(
            <div key={p.id} style={{padding:'12px 0',borderBottom:`1px solid color-mix(in srgb, ${BORDER} 27%, transparent)`}}>
              <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                <span style={badge(p.priority==='high'?'rejected':'pending')}>{p.priority||'normal'}</span>
                <div style={{flex:1,minWidth:200,fontSize:13,fontWeight:700,color:TEXT}}>{p.description}</div>
                <label style={{...btnS(GOLD,true),display:'inline-flex',alignItems:'center',gap:6}}>
                  {'\u2713'} Complete w/ Photo
                  <input type="file" accept="image/*" capture="environment" style={{display:'none'}}
                    onChange={e=>{handlePunchComplete(p.id,e.target.files?.[0]||null);e.currentTarget.value='';}}/>
                </label>
              </div>
              {p.location&&<div style={{fontSize:11,color:DIM,marginTop:4}}>Location: {p.location}</div>}
            </div>
          ))}
        </div>
        <div style={card()}>
          <div style={{fontSize:15,fontWeight:800,color:TEXT,marginBottom:12}}>Completed ({done.length})</div>
          {done.map((p:any)=>(
            <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`1px solid color-mix(in srgb, ${BORDER} 27%, transparent)`,flexWrap:'wrap'}}>
              <span style={{color:GREEN,fontWeight:800}}>{'\u2713'}</span>
              <div style={{flex:1,minWidth:200,fontSize:13,color:DIM}}>{p.description}</div>
              <span style={{fontSize:11,color:DIM}}>{fmtDate(p.completed_at)}</span>
              {(p.photo_urls||[]).slice(0,3).map((u:string,i:number)=>(<a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="proof" style={{width:36,height:36,objectFit:'cover',borderRadius:6,border:`1px solid ${BORDER}`}}/></a>))}
            </div>
          ))}
        </div>
      </div>
    );
  };
  /* ── HISTORY: every action, timestamped ── */
  const renderHistory=()=>{
    const label=(e:any)=>e.description||({document_uploaded:`Uploaded ${e.metadata?.title||'a document'}`,invoice_submitted:`Submitted invoice ${fmt(e.metadata?.amount||0)}`,punch_completed:'Completed punch item'}[e.action as string])||String(e.action||'activity').replace(/_/g,' ');
    return(
      <div style={card()}>
        <div style={{fontSize:15,fontWeight:800,color:TEXT,marginBottom:14}}>Activity History</div>
        {activity.length===0&&<div style={{color:DIM,fontSize:13}}>Your uploads, invoice submissions and completed work will appear here, timestamped.</div>}
        {activity.map((e:any)=>(
          <div key={e.id} style={{display:'flex',gap:12,padding:'10px 0',borderBottom:`1px solid color-mix(in srgb, ${BORDER} 27%, transparent)`}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:GOLD,marginTop:6,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13,color:TEXT}}>{label(e)}</div>
              <div style={{fontSize:11,color:DIM,marginTop:2}}>{new Date(e.created_at).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };
  /* ── BID INVITES: open invitations \u2192 scope \u2192 respond ── */
  const renderBids=()=>(
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:20}}>
      {bids.length===0&&<div style={card()}><div style={{color:DIM,fontSize:13}}>No open bid invitations right now.</div></div>}
      {bids.map((b:any)=>(
        <div key={b.id} style={card()}>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:220}}>
              <div style={{fontSize:15,fontWeight:800,color:TEXT}}>{b.bid_packages?.name||b.package_name||'Bid Package'}</div>
              <div style={{fontSize:12,color:DIM,marginTop:2}}>{b.bid_packages?.projects?.name||''}{b.due_date?` \u00b7 Due ${fmtDate(b.due_date)}`:''}</div>
            </div>
            <span style={badge(b.status||'open')}>{b.status||'open'}</span>
          </div>
          {b.bid_packages?.scope_of_work&&<div style={{fontSize:12,color:DIM,marginTop:10,lineHeight:1.6}}>{b.bid_packages.scope_of_work}</div>}
        </div>
      ))}
    </div>
  );
  const renderContent=()=>{
    switch(tab){
      case'dashboard':return renderDashboard();
      case'photos':return <SubEndOfDay token={token} jobName={session?.project_name||null} onToast={showToast}/>;
      case'compliance':return renderCompliance();
      case'payapps':return renderPayApps();
      case'daily':return renderDaily();
      case'rfis':return renderRfis();
      case'schedule':return renderSchedule();
      case'scorecard':return renderScorecard();
      case'messages':return renderMessages();
      case'documents':return renderDocuments();
      case'drawings':return renderDrawings();
      case'punch':return renderPunch();
      case'history':return renderHistory();
      case'bids':return renderBids();
      case'radio':return renderRadio();
    }
  };

  /* ================================================================ */
  /*  MAIN LAYOUT                                                      */
  /* ================================================================ */
  return(
    <div style={{minHeight:'100vh',background:DARK,fontFamily:'system-ui,-apple-system,sans-serif',color:TEXT}}>
      {toast&&<div role="status" style={{position:'fixed',left:16,right:16,bottom:'max(20px, env(safe-area-inset-bottom))',margin:'0 auto',width:'fit-content',maxWidth:520,textAlign:'center',zIndex:9999,background:RAISED,border:`1px solid ${GOLD}`,borderRadius:10,padding:'12px 20px',color:TEXT,fontSize:13,fontWeight:600,boxShadow:'0 8px 32px rgba(0,0,0,.5)',animation:'fadeIn .3s ease'}}>{toast}</div>}
      {!isOnline&&<div style={{background:RED,color:'#fff',textAlign:'center',padding:'6px 16px',fontSize:12,fontWeight:700}}>You are currently offline. Changes will sync when connection is restored.</div>}

      {/* Header */}
      <header style={{background:RAISED,borderBottom:`1px solid ${BORDER}`,padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:26}}>{'\u{1F335}'}</span>
          <div><span style={{fontWeight:800,fontSize:16,color:GOLD,letterSpacing:'-0.01em'}}>Saguaro</span><span style={{fontSize:12,color:DIM,marginLeft:8}}>Subcontractor Portal</span></div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:13,fontWeight:700,color:TEXT}}>{companyName}</div>
            <div style={{fontSize:11,color:DIM}}>{sub?.trade||''}</div>
          </div>
          {/* Health Badge mini — only once there is a score to show */}
          {healthScore>0&&<div style={{width:36,height:36,borderRadius:'50%',border:`2px solid ${healthColor}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,color:healthColor}} title={`Health Score: ${healthScore.toFixed(1)}`}>{healthScore.toFixed(1)}</div>}
          {isPreferred&&<span style={{fontSize:18,color:GOLD}} title="Preferred Subcontractor">{'\u2B50'}</span>}
        </div>
      </header>

      {/* Tabs - scrollable on mobile */}
      <nav style={{background:'linear-gradient(180deg,#17181b,#101114)',borderBottom:'1px solid rgba(0,0,0,0.55)',boxShadow:'0 6px 18px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',overflowX:'auto',display:'flex',gap:6,padding:'10px 12px',WebkitOverflowScrolling:'touch',alignItems:'center'}}>
        {TABS.map((t,i)=>(
          <React.Fragment key={t.key}>
          {i>0&&TABS[i-1].section!==t.section&&<span style={{width:1,height:20,background:BORDER,margin:'0 4px',flexShrink:0}}/>}
          <button onClick={()=>setTab(t.key)} style={{padding:'8px 14px',background:tab===t.key?'linear-gradient(180deg,color-mix(in srgb, var(--brand-primary) 22%, transparent),var(--brand-primary-12))':'rgba(255,255,255,0.03)',border:`1px solid ${tab===t.key?'color-mix(in srgb, var(--brand-primary) 50%, transparent)':BORDER}`,borderRadius:999,color:tab===t.key?'var(--brand-primary-strong)':DIM,fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',transition:'all .15s',display:'flex',alignItems:'center',gap:6,flexShrink:0,boxShadow:tab===t.key?'0 0 0 3px var(--brand-primary-12)':'none'}}>
            <span style={{fontSize:14}}>{t.icon}</span><span>{t.label}</span>
            {t.key==='messages'&&unreadCount>0&&(
              <span style={{width:8,height:8,borderRadius:'50%',background:RED,flexShrink:0}}/>
            )}
          </button>
          </React.Fragment>
        ))}
      </nav>

      {/* Content */}
      <main style={{maxWidth:1100,margin:'0 auto',padding:'24px 20px'}}>
        {!complianceGateOpen&&(tab==='dashboard'||tab==='payapps')&&(
          <div style={{...card({borderColor:`color-mix(in srgb, ${RED} 40%, transparent)`,background:`color-mix(in srgb, ${RED} 5%, transparent)`,marginBottom:20}),display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
            <span style={{fontSize:22}}>{'\u26A0'}</span>
            <div style={{flex:1,minWidth:220}}>
              <div style={{fontSize:14,fontWeight:800,color:RED}}>Payment Hold — Compliance Documents Needed</div>
              <div style={{fontSize:12,color:DIM,marginTop:2}}>Missing or expired: {complianceMissing.map(m=>m==='w9'?'W-9':'Insurance / COI').join(', ')}. Invoices release automatically once these are current.</div>
            </div>
            <button onClick={()=>{setDocCategory(complianceMissing[0]==='w9'?'w9':'insurance');setTab('documents');}} style={btnS(GOLD,true)}>Upload Now</button>
          </div>
        )}
        {renderContent()}
      </main>

      {/* Footer */}
      <footer style={{textAlign:'center',padding:'24px 20px',borderTop:`1px solid ${BORDER}`,marginTop:40}}>
        <div style={{fontSize:12,color:DIM}}>Powered by <strong style={{color:GOLD}}>Saguaro Control Systems</strong> &middot; Construction Management Platform</div>
        <div style={{fontSize:10,color:BORDER,marginTop:4}}>&copy; {new Date().getFullYear()} Saguaro. All rights reserved.</div>
      </footer>

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}*{scrollbar-width:thin;scrollbar-color:${BORDER} ${DARK}}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:${DARK}}::-webkit-scrollbar-thumb{background:${BORDER};border-radius:3px}select option{background:${DARK};color:${TEXT}}@media(max-width:768px){main{padding:16px 12px!important}}`}</style>
    </div>
  );
}
