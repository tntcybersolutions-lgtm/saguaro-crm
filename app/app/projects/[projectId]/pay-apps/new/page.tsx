'use client';
import React, { useState, useEffect, useRef } from 'react';
import { humanError } from '@/lib/errors';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import SaguaroDatePicker from '../../../../../../components/SaguaroDatePicker';
import { ArrowLeft, ArrowRight, Plus, X, Receipt, CalendarBlank, Table, Calculator, ClockCounterClockwise, Info } from '@phosphor-icons/react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { PremiumSurface, ModuleHero, SectionCard, StatStrip, FlowSteps, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',BORDER='rgba(255,255,255,0.12)',DIM='#D4D4D8',TEXT='#FFFFFF',GREEN='#2CFF7A',RED='#FF3B30',ORANGE='#FF8A00';
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));
const fmtDate = (d?:string|null) => d ? new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

interface SovLine {
  lineNumber: number;
  description: string;
  scheduledValue: number;
  workFromPrev: number;
  workThisPeriod: number;
  materialsStored: number;
  percentComplete: number;
  balanceToFinish: number;
  retainage: number;
}

function blankLine(n:number):SovLine{
  return {lineNumber:n,description:'',scheduledValue:0,workFromPrev:0,workThisPeriod:0,materialsStored:0,percentComplete:0,balanceToFinish:0,retainage:0};
}

const INP:React.CSSProperties = {padding:'8px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',width:'100%',boxSizing:'border-box'};
const LBL:React.CSSProperties = {display:'block',fontSize:11,fontWeight:700,color:DIM,marginBottom:6};
const HINT:React.CSSProperties = {fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:5,lineHeight:1.45};

export default function NewPayAppPage() {
  const params    = useParams();
  const router    = useRouter();
  const projectId = params['projectId'] as string;

  const [step,setStep]             = useState(1);
  const [saving,setSaving]         = useState(false);
  const [error,setError]           = useState('');
  // Unsaved-work protection (R14): arms once the GC touches any field —
  // seeded defaults alone never arm the guard.
  const [touched,setTouched]       = useState(false);
  const [leaveTo,setLeaveTo]       = useState<string|null>(null);
  const draftRestoredRef           = useRef(false);

  // Step 1
  const [periodFrom,setPeriodFrom]     = useState('');
  const [periodTo,setPeriodTo]         = useState('');
  const [contractSum,setContractSum]   = useState('');
  const [retainagePct,setRetainagePct] = useState('10');

  // SOV
  const [lines,setLines] = useState<SovLine[]>([blankLine(1),blankLine(2),blankLine(3)]);

  // The screen walks in knowing the project: contract money, approved COs,
  // the prior application, and the prior SOV — the GC types only this
  // period's work. `ctx` = /api/project-context snapshot; `appNumber` from
  // the pay-app seeder.
  const { ctx } = useProjectContext(projectId);
  const [appNumber,setAppNumber]     = useState<number|null>(null);
  const [rolledForward,setRolledForward] = useState(false);
  const [auto,setAuto]               = useState<{period?:boolean;sum?:boolean;ret?:boolean}>({});

  // Seed money defaults once the shared snapshot arrives. One-time (ref-guarded)
  // so a background revalidation never stomps what the GC typed; the seeder
  // below keeps its original priority on retainage.
  const ctxSeededRef = useRef(false);
  const seederSetRetRef = useRef(false);
  useEffect(()=>{
    if(!ctx || ctxSeededRef.current) return;
    ctxSeededRef.current = true;
    const original = ctx.money?.originalContract || 0;
    if(original>0){ setContractSum(prev=>prev||String(original)); setAuto(a=>({...a,sum:true})); }
    if(ctx.money?.retainagePct!=null && !seederSetRetRef.current && !draftRestoredRef.current){ setRetainagePct(String(ctx.money.retainagePct)); setAuto(a=>({...a,ret:true})); }
    // Suggested billing period: the day after the last app's period end,
    // through that month's end; first app defaults to the current month.
    const lastTo = ctx.money?.lastPayApp?.periodTo as string|undefined;
    const start = lastTo ? new Date(new Date(lastTo+'T00:00:00').getTime()+86400000) : new Date(new Date().getFullYear(),new Date().getMonth(),1);
    const end   = new Date(start.getFullYear(),start.getMonth()+1,0);
    const iso   = (d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setPeriodFrom(prev=>{ if(!prev){ setAuto(a=>({...a,period:true})); return iso(start); } return prev; });
    setPeriodTo(prev=>prev||iso(end));
  },[ctx]);

  useEffect(()=>{
    (async()=>{
      try{
        const r = await fetch(`/api/pay-apps/create?projectId=${projectId}`);
        const seed = await r.json();
        if(seed.nextAppNumber) setAppNumber(seed.nextAppNumber);
        // A restored draft owns the SOV + retainage — the seeder never stomps it.
        if(Array.isArray(seed.priorSov) && seed.priorSov.length>0 && !draftRestoredRef.current){
          setLines(seed.priorSov.map((s:any,i:number)=>({
            lineNumber:i+1, description:s.description||'',
            scheduledValue:s.scheduledValue||0, workFromPrev:s.workFromPrev||0,
            workThisPeriod:0, materialsStored:0, percentComplete:0, balanceToFinish:0, retainage:0,
          })));
          setRolledForward(true);
        }
        if(seed.retainagePercent!=null && !draftRestoredRef.current){ seederSetRetRef.current = true; setRetainagePct(String(seed.retainagePercent)); }
      }catch{}
    })();
  },[projectId]);

  /* ── Unsaved-work protection (R14): dirty once the GC has touched any field
   *    (seeded defaults never arm the guard); the draft covers the full
   *    header + SOV so a lost session comes back intact. ── */
  const guard = useUnsavedGuard({
    dirty: touched,
    draftKey: `pay-app:${projectId}`,
    draftData: { step, periodFrom, periodTo, contractSum, retainagePct, lines },
    restoreDraft: (d) => {
      const dr = d as { step?:number; periodFrom?:string; periodTo?:string; contractSum?:string; retainagePct?:string; lines?:SovLine[] };
      draftRestoredRef.current = true;
      if(dr.step) setStep(dr.step);
      if(dr.periodFrom) setPeriodFrom(dr.periodFrom);
      if(dr.periodTo) setPeriodTo(dr.periodTo);
      if(dr.contractSum) setContractSum(dr.contractSum);
      if(dr.retainagePct) setRetainagePct(dr.retainagePct);
      if(Array.isArray(dr.lines) && dr.lines.length>0) setLines(dr.lines);
      setTouched(true);
    },
    onSave: () => submitPayApp('draft'),
  });

  // Post-save exit routes through the guard (uniform with the rollout); dirty
  // is cleared first, so the deferred requestLeave navigates without prompting.
  useEffect(()=>{ if(leaveTo) guard.requestLeave(leaveTo); },[leaveTo, guard.requestLeave]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = Math.max(0,Math.min(100,Number(retainagePct)||10));

  function recalcLine(l:SovLine):SovLine{
    const total = (l.workFromPrev||0)+(l.workThisPeriod||0)+(l.materialsStored||0);
    const sv    = l.scheduledValue||0;
    return {
      ...l,
      percentComplete: sv>0 ? Math.round((total/sv)*1000)/10 : 0,
      balanceToFinish: sv - total,
      retainage: total*(pct/100),
    };
  }

  function updateLine(i:number, field:keyof SovLine, val:string){
    setTouched(true);
    setLines(prev=>{
      const next = [...prev];
      const updated = {...next[i], [field]: field==='description' ? val : (parseFloat(val)||0)};
      next[i] = recalcLine(updated);
      return next;
    });
  }

  function addLine(){ setTouched(true); setLines(prev=>[...prev,blankLine(prev.length+1)]); }
  function removeLine(i:number){ setTouched(true); setLines(prev=>prev.filter((_,idx)=>idx!==i).map((l,idx)=>({...l,lineNumber:idx+1}))); }

  // Live totals
  const thisPeriodTotal  = lines.reduce((s,l)=>s+(l.workThisPeriod||0),0);
  const prevTotal        = lines.reduce((s,l)=>s+(l.workFromPrev||0),0);
  const matsTotal        = lines.reduce((s,l)=>s+(l.materialsStored||0),0);
  const totalCompleted   = prevTotal+thisPeriodTotal+matsTotal;
  const retainageAmt     = totalCompleted*(pct/100);
  const earnedLessRet    = totalCompleted - retainageAmt;
  const paymentDue       = Math.max(0, earnedLessRet - prevTotal*(1-pct/100));
  const contractSumNum   = Number(contractSum)||0;

  // Contract intelligence (from /api/project-context)
  const money       = ctx?.money;
  const original    = money?.originalContract || 0;
  const coTotal     = money?.approvedCoTotal || 0;
  const revised     = money?.revisedContract || (contractSumNum + coTotal);
  const lastApp     = money?.lastPayApp;
  const sovScheduled= lines.reduce((s,l)=>s+(l.scheduledValue||0),0);
  const subCount    = (ctx?.subs||[]).length;

  /** POST the application — shared by the page buttons and the guard's
   *  "Save & leave". Returns true on success; never navigates itself. */
  async function submitPayApp(status:'draft'|'submitted'): Promise<boolean>{
    if(!periodFrom||!periodTo){ setError('Period From and Period To are required.'); return false; }
    setSaving(true); setError('');
    try{
      const body = {
        projectId,
        periodFrom,
        periodTo,
        contractSum: contractSumNum,
        retainagePercent: pct,
        status,
        prevCompleted: prevTotal,
        thisPeriod: thisPeriodTotal,
        materialsStored: matsTotal,
        totalCompleted,
        percentComplete: contractSumNum>0 ? Math.round((totalCompleted/contractSumNum)*100) : 0,
        retainageAmount: retainageAmt,
        totalEarnedLessRetainage: earnedLessRet,
        currentPaymentDue: paymentDue,
        lineItems: lines.filter(l=>l.description||l.scheduledValue>0).map(l=>({
          description: l.description,
          scheduledValue: l.scheduledValue,
          workFromPrev: l.workFromPrev,
          workThisPeriod: l.workThisPeriod,
          materialsStored: l.materialsStored,
          percentComplete: l.percentComplete,
          balanceToFinish: l.balanceToFinish,
          retainage: l.retainage,
        })),
      };

      const r1 = await fetch('/api/pay-apps/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d1 = await r1.json();
      if(d1.error) throw new Error(d1.error);

      if(status==='submitted'){
        const paId = (d1.payApp as any).id;
        const r2 = await fetch(`/api/pay-apps/${paId}/submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId})});
        const d2 = await r2.json();
        if(d2.error) throw new Error(d2.error);
      }

      return true;
    }catch(e:any){
      console.error(e); setError(humanError(e, 'Failed to save the pay application. Please try again.'));
      return false;
    }finally{
      setSaving(false);
    }
  }

  async function save(status:'draft'|'submitted'){
    if(await submitPayApp(status)){
      guard.clearDraft();
      setTouched(false);
      setLeaveTo(`/app/projects/${projectId}/pay-apps`);
    }
  }

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Back to list */}
      <Link href={`/app/projects/${projectId}/pay-apps`} style={{...ghostButtonStyle,padding:'7px 14px',fontSize:12.5,marginBottom:18}} className="pmBtn">
        <ArrowLeft size={14} weight="bold" /> Pay Applications
      </Link>

      {/* Header */}
      <ModuleHero
        eyebrow={ctx?.project?.name || 'Pay Application'}
        eyebrowIcon={<Receipt size={13} weight="fill" color={GOLD} />}
        title={appNumber ? `Application #${appNumber}` : 'New Pay'}
        accent={appNumber ? '' : 'Application'}
        subtitle="AIA G702/G703 — Application and Certificate for Payment"
        actions={
          /* Step tabs */
          <div style={{display:'flex',background:'rgba(255,255,255,0.04)',borderRadius:10,padding:4,border:`1px solid rgba(255,255,255,0.08)`}}>
            {[{n:1,l:'1. Period'},{n:2,l:'2. Schedule of Values'}].map(s=>(
              <button key={s.n} onClick={()=>setStep(s.n)} className="pmBtn"
                style={{padding:'7px 16px',borderRadius:7,border:'none',fontWeight:800,fontSize:12,cursor:'pointer',background:step===s.n?`linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`:'transparent',color:step===s.n?'#0A0A00':DIM,transition:'all .15s'}}
              >{s.l}</button>
            ))}
          </div>
        }
      />

      {/* Contract intelligence strip — what the system already knows */}
      {ctx && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/pay-apps/new`, label:'Application', value:`#${appNumber ?? (money?.payAppCount??0)+1}`, sub: lastApp ? `Follows App #${lastApp.appNumber}` : 'First on this project'},
          {href: `/app/projects/${projectId}/contracts`, label:'Original Contract', value:fmt(original), sub:'G702 line 1'},
          {href: `/app/projects/${projectId}/change-orders`, label:'Approved COs', value:(coTotal>=0?'+':'')+fmt(coTotal), accent:coTotal>0?'#2CFF7A':undefined, sub:`${money?.approvedCoCount||0} approved${money?.pendingCoCount?` · ${money.pendingCoCount} pending`:''}`},
          {href: `/app/projects/${projectId}/contracts`, label:'Revised Contract', value:fmt(revised), sub:'Contract sum to date'},
          {href: `/app/projects/${projectId}/pay-apps/new`, label:'Billed to Date', value:fmt(money?.billedToDate||0), sub:`${money?.billedPct||0}% of revised`},
          {href: `/app/projects/${projectId}/pay-apps/new`, label:'Retainage', value:`${pct}%`, sub: subCount ? `${subCount} sub${subCount===1?'':'s'} on the job` : 'Per contract terms'},
        ]}/>
      )}

      <div>
        {error && (
          <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'12px 16px',marginBottom:20,color:RED,fontSize:13}}>
            {error}
          </div>
        )}

        {/* STEP 1: Period & Contract + automation rail */}
        {step===1 && (
          <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 340px',gap:22,alignItems:'start'}}>
            <div>
              <SectionCard title="Billing Period" icon={<CalendarBlank size={17} weight="duotone" color={GOLD} />} style={{marginBottom:16}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18,marginBottom:6}}>
                  <div>
                    <label style={LBL}>Period From *{auto.period && <AutoChip/>}</label>
                    <SaguaroDatePicker value={periodFrom} onChange={v=>{setTouched(true);setPeriodFrom(v);}} style={INP}/>
                    {lastApp && <div style={HINT}>Suggested — App #{lastApp.appNumber} billed through {fmtDate(lastApp.periodTo)}.</div>}
                  </div>
                  <div>
                    <label style={LBL}>Period To *{auto.period && <AutoChip/>}</label>
                    <SaguaroDatePicker value={periodTo} onChange={v=>{setTouched(true);setPeriodTo(v);}} style={INP}/>
                    {auto.period && <div style={HINT}>Defaulted to month end — adjust freely.</div>}
                  </div>
                  <div>
                    <label style={LBL}>Original Contract Sum ($){auto.sum && <AutoChip/>}</label>
                    <input type="number" value={contractSum} onChange={e=>{setTouched(true);setContractSum(e.target.value);}} placeholder="0" min="0" style={INP}/>
                    <div style={HINT}>
                      {coTotal>0
                        ? <>G702 line 1. With {money?.approvedCoCount} approved CO{money?.approvedCoCount===1?'':'s'} ({fmt(coTotal)}), contract sum to date is <b style={{color:TEXT}}>{fmt(revised)}</b> — change orders print on line 2 automatically.</>
                        : <>G702 line 1 — pulled from the project contract. Approved change orders will print on line 2 automatically.</>}
                    </div>
                  </div>
                  <div>
                    <label style={LBL}>Retainage %{auto.ret && <AutoChip/>}</label>
                    <input type="number" value={retainagePct} onChange={e=>{setTouched(true);setRetainagePct(e.target.value);}} placeholder="10" min="0" max="100" style={INP}/>
                    <div style={HINT}>{lastApp ? `Carried from App #${lastApp.appNumber}.` : 'From project contract terms.'}</div>
                  </div>
                </div>
              </SectionCard>

              {/* SOV readiness — the rollforward the system already did */}
              <SectionCard title="Schedule of Values — Ready" icon={<Table size={17} weight="duotone" color={GOLD} />} style={{marginBottom:16}}>
                {rolledForward ? (
                  <>
                    <div style={{fontSize:13,color:DIM,lineHeight:1.55,marginBottom:14}}>
                      <b style={{color:'#2CFF7A'}}>{lines.length} lines rolled forward</b> from App #{lastApp?.appNumber ?? '—'} — scheduled values and completed-to-date are pre-filled. In Step 2 you only enter <b style={{color:TEXT}}>this period&apos;s work</b>.
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11.5,color:DIM,marginBottom:6}}>
                      <span>Billed {fmt(prevTotal)} of {fmt(sovScheduled)} scheduled</span>
                      <span style={{fontWeight:800,color:GOLD}}>{sovScheduled>0?Math.round((prevTotal/sovScheduled)*100):0}%</span>
                    </div>
                    <div style={{height:7,borderRadius:999,background:'rgba(255,255,255,0.07)',overflow:'hidden',marginBottom:4}}>
                      <div style={{height:'100%',width:`${sovScheduled>0?Math.min(100,(prevTotal/sovScheduled)*100):0}%`,background:`linear-gradient(90deg,${GOLD},var(--brand-primary-strong))`,borderRadius:999}}/>
                    </div>
                  </>
                ) : (
                  <div style={{display:'flex',gap:10,alignItems:'flex-start',fontSize:13,color:DIM,lineHeight:1.55}}>
                    <Info size={17} color={GOLD} style={{flexShrink:0,marginTop:1}}/>
                    <span>First application on this project — build the schedule of values in Step 2. It rolls forward automatically on every application after this one.</span>
                  </div>
                )}
                <button onClick={()=>setStep(2)} style={{...goldButtonStyle,marginTop:16}} className="pmBtn">
                  Next: Schedule of Values <ArrowRight size={15} weight="bold" color="#0A0A00" />
                </button>
              </SectionCard>
            </div>

            {/* Context rail — prior app + what the system automates */}
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <SectionCard flat title={lastApp ? `Last Application — #${lastApp.appNumber}` : 'First Application'} icon={<ClockCounterClockwise size={17} weight="duotone" color={GOLD} />}>
                {lastApp ? (
                  <>
                    <InsightRow label="Period" value={`${fmtDate(lastApp.periodFrom)} – ${fmtDate(lastApp.periodTo)}`}/>
                    <InsightRow label="Status" value={String(lastApp.status||'—').replace(/_/g,' ')}/>
                    <InsightRow label="Completed & Stored" value={fmt(lastApp.totalCompletedStored)}/>
                    <InsightRow label="Payment Certified" value={fmt(lastApp.currentPaymentDue)} accent="#2CFF7A" strong/>
                  </>
                ) : (
                  <div style={{fontSize:12.5,color:DIM,lineHeight:1.6}}>
                    This is the first pay application on {ctx?.project?.name || 'this project'}. Everything you enter here rolls forward automatically next month.
                  </div>
                )}
              </SectionCard>
              <SectionCard flat title="After You Submit" icon={<Calculator size={17} weight="duotone" color={GOLD} />}>
                <FlowSteps title="" steps={[
                  {title:'Owner Receives the G702/G703', desc:'A signed application packet goes out for one-click owner approval.'},
                  {title:'Lien Waivers Auto-Generate', desc: subCount>0 ? `Conditional waivers for all ${subCount} subs, each sized to their share of this period.` : 'Conditional waivers for every sub on the job, sized to their share of this period.'},
                  {title:'Payment Is Waiver-Gated', desc:'Mark-paid is blocked until required waivers are signed — then unconditional waivers issue automatically.'},
                  {title:'Money Flows to the Ledger', desc:'Paid-to-date, retainage held, and the prime contract update themselves.'},
                ]}/>
              </SectionCard>
            </div>
          </div>
        )}

        {/* STEP 2: SOV */}
        {step===2 && (
          <div style={{display:'flex',gap:22,alignItems:'flex-start'}}>
            {/* Table */}
            <div style={{flex:1,minWidth:0}}>
              {rolledForward && (
                <div style={{marginBottom:12,padding:'10px 14px',borderRadius:10,background:'rgba(44,255,122,0.08)',border:'1px solid rgba(44,255,122,0.3)',color:'#2CFF7A',fontSize:12.5,fontWeight:600}}>
                  Rolled forward from App #{lastApp?.appNumber ?? '—'} — scheduled values and completed-to-date are pre-filled. Just enter this period&apos;s work.
                </div>
              )}
              <SectionCard
                title="Schedule of Values (G703)"
                icon={<Table size={17} weight="duotone" color={GOLD} />}
                flush
                style={{marginBottom:16}}
                action={
                  <button onClick={addLine} className="pmBtn" style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'var(--brand-primary-12)',border:`1px solid color-mix(in srgb, var(--brand-primary) 45%, transparent)`,borderRadius:9,color:'var(--brand-primary-strong)',fontSize:12,fontWeight:800,cursor:'pointer'}}>
                    <Plus size={13} color="var(--brand-primary-strong)" weight="bold" /> Add Row
                  </button>
                }
              >
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:12}}>
                    <thead>
                      <tr style={{background:'var(--bg-surface-2)'}}>
                        {['#','Description','Sched. Value','Work Prev ($)','This Period ($)','Mat. Stored ($)','% Complete','Balance','Retainage',''].map(h=>(
                          <th key={h} style={{padding:'9px 10px',textAlign:'left' as const,fontSize:10,fontWeight:700,color:DIM,borderBottom:`1px solid ${BORDER}`,whiteSpace:'nowrap' as const}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l,i)=>(
                        <tr key={i} style={{borderBottom:`1px solid rgba(229,229,234,.4)`,background:i%2===0?'transparent':'rgba(0,0,0,.015)'}}>
                          <td style={{padding:'6px 10px',color:DIM,fontWeight:700,minWidth:28}}>{l.lineNumber}</td>
                          <td style={{padding:'4px 6px',minWidth:170}}>
                            <input value={l.description} onChange={e=>updateLine(i,'description',e.target.value)}
                              placeholder="Description" style={{...INP,padding:'5px 8px',fontSize:12}}/>
                          </td>
                          {(['scheduledValue','workFromPrev','workThisPeriod','materialsStored'] as const).map(f=>(
                            <td key={f} style={{padding:'4px 6px',minWidth:100}}>
                              <input type="number" value={(l as any)[f]||''} onChange={e=>updateLine(i,f,e.target.value)}
                                placeholder="0" style={{...INP,padding:'5px 8px',fontSize:12,textAlign:'right' as const}}/>
                            </td>
                          ))}
                          <td style={{padding:'6px 10px',color:TEXT,textAlign:'right' as const,whiteSpace:'nowrap' as const,minWidth:70}}>{l.percentComplete.toFixed(1)}%</td>
                          <td style={{padding:'6px 10px',color:l.balanceToFinish<0?RED:DIM,textAlign:'right' as const,whiteSpace:'nowrap' as const,minWidth:90}}>{fmt(l.balanceToFinish)}</td>
                          <td style={{padding:'6px 10px',color:ORANGE,textAlign:'right' as const,whiteSpace:'nowrap' as const,minWidth:90}}>{fmt(l.retainage)}</td>
                          <td style={{padding:'6px 8px'}}>
                            <button onClick={()=>removeLine(i)} style={{background:'none',border:'none',color:RED,cursor:'pointer',fontSize:15,padding:'3px 6px'}}><span style={{display:'inline-flex',verticalAlign:'middle'}}><X size={15} color={RED} /></span></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{background:'var(--bg-surface-2)',borderTop:`2px solid ${BORDER}`}}>
                        <td colSpan={2} style={{padding:'10px 10px',fontWeight:800,fontSize:12,color:TEXT}}>Totals</td>
                        <td style={{padding:'10px 10px',fontWeight:800,color:GOLD,textAlign:'right' as const}}>{fmt(lines.reduce((s,l)=>s+(l.scheduledValue||0),0))}</td>
                        <td style={{padding:'10px 10px',fontWeight:700,color:TEXT,textAlign:'right' as const}}>{fmt(prevTotal)}</td>
                        <td style={{padding:'10px 10px',fontWeight:800,color:'#2CFF7A',textAlign:'right' as const}}>{fmt(thisPeriodTotal)}</td>
                        <td style={{padding:'10px 10px',fontWeight:700,color:TEXT,textAlign:'right' as const}}>{fmt(matsTotal)}</td>
                        <td style={{padding:'10px 10px',fontWeight:700,color:DIM}}>{contractSumNum>0?((totalCompleted/contractSumNum)*100).toFixed(1):0}%</td>
                        <td style={{padding:'10px 10px',fontWeight:700,color:DIM,textAlign:'right' as const}}>{fmt(lines.reduce((s,l)=>s+(l.balanceToFinish||0),0))}</td>
                        <td style={{padding:'10px 10px',fontWeight:700,color:ORANGE,textAlign:'right' as const}}>{fmt(retainageAmt)}</td>
                        <td/>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </SectionCard>

              {/* Actions */}
              <div style={{display:'flex',gap:10,flexWrap:'wrap' as const}}>
                <button onClick={()=>setStep(1)} style={ghostButtonStyle} className="pmBtn">
                  <ArrowLeft size={15} weight="bold" /> Back
                </button>
                <button onClick={()=>save('draft')} disabled={saving}
                  style={{...goldOutlineButtonStyle,cursor:saving?'wait':'pointer',opacity:saving?.6:1}} className="pmBtn">
                  {saving ? 'Saving…' : 'Save Draft'}
                </button>
                <button onClick={()=>save('submitted')} disabled={saving}
                  style={{...goldButtonStyle,cursor:saving?'wait':'pointer',opacity:saving?.6:1}} className="pmBtn">
                  {saving ? 'Submitting…' : <>Submit to Owner <ArrowRight size={15} weight="bold" color="#0A0A00" /></>}
                </button>
              </div>
            </div>

            {/* Live Calc Panel */}
            <div style={{width:256,flexShrink:0,position:'sticky' as const,top:80}}>
              <SectionCard flat title="Live G702 Summary" icon={<Calculator size={17} weight="duotone" color={GOLD} />}>
                <InsightRow label="Original Contract" value={fmt(contractSumNum)}/>
                {coTotal!==0 && <InsightRow label="Approved COs" value={(coTotal>0?'+':'')+fmt(coTotal)} accent="#2CFF7A"/>}
                {coTotal!==0 && <InsightRow label="Contract to Date" value={fmt(contractSumNum+coTotal)}/>}
                <div style={{height:1,background:'rgba(255,255,255,0.08)',margin:'8px 0'}}/>
                <InsightRow label="Prev Completed" value={fmt(prevTotal)}/>
                <InsightRow label="This Period" value={fmt(thisPeriodTotal)} accent={GOLD}/>
                <InsightRow label="Materials Stored" value={fmt(matsTotal)}/>
                <InsightRow label="Total Completed" value={fmt(totalCompleted)}/>
                <InsightRow label={`Retainage (${pct}%)`} value={fmt(retainageAmt)} accent={ORANGE}/>
                <InsightRow label="Balance to Finish" value={fmt(Math.max(0,(contractSumNum+coTotal)-totalCompleted))}/>
                <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid rgba(255,255,255,0.1)`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:12,fontWeight:800,color:TEXT}}>Payment Due</span>
                    <span style={{fontSize:18,fontWeight:800,color:GREEN}}>{fmt(paymentDue)}</span>
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        )}
      </div>

      <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
