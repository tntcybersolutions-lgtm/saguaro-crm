'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  WarningCircle, FolderOpen, CheckCircle, XCircle, Warning, ArrowRight,
  Buildings, CurrencyDollar, Receipt, HandCoins, Coins, CalendarBlank,
  Lightning, Plus, ChartLineUp, ClipboardText, ListChecks, CalendarCheck, UsersThree,
  Question, Tray, ClockCounterClockwise, NotePencil, ArrowsLeftRight,
} from '@phosphor-icons/react';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { toCents, toDollars, sumCents, subCents, summarizeContract } from '@/lib/calc';
import { Skeleton, SkeletonKPI } from '@/components/ui/Skeleton';
import {
  CinematicPage, ModuleHero, HeroButton, StatCard, SectionCard, SectionLink, EmptyStatePremium, CIN,
} from '@/components/ui/cinematic';
import GettingStartedRail from '@/components/GettingStartedRail';
import ProjectOwnershipCard from '@/components/projects/ProjectOwnershipCard';
import { StatStrip } from '@/components/ui/premium';
import { accentForProject } from '@/lib/project-identity';
import { normalisePhase } from '@/lib/project-phase';
import { isClosedStatus } from '@/lib/project-lifecycle';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface-2)',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF',GREEN='#22C55E',RED='#EF4444';
const fmt = (n:number|null|undefined) => '$'+((n ?? 0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));
const fmtPct = (a:number|null|undefined,b:number|null|undefined) => (b ?? 0)>0?(((a ?? 0)/(b as number))*100).toFixed(1)+'%':'0%';

// Shared-key fetcher for the project aggregate: auth headers + explicit 404
// handling (a {notFound:true} sentinel instead of a thrown error) so the
// error / not-found render states stay distinct.
const overviewFetcher = async (url: string) => {
  const auth = await getAuthHeaders();
  const r = await fetch(url, { headers: auth });
  if (r.status === 404) return { notFound: true };
  if (!r.ok) {
    let msg = '';
    try { const body = await r.json(); msg = body?.error || body?.message || ''; } catch { /* non-JSON body */ }
    console.error('load project overview failed', r.status, msg);
    throw new Error(msg || 'Request failed');
  }
  const d = await r.json();
  if (!d?.project) return { notFound: true };
  return d;
};

export default function OverviewPage(){
  const { projectId } = useParams<{projectId:string}>();
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  // One SWR key per resource (W-2): '/api/projects/'+projectId is the same
  // cache entry the project sidebar header reads — opening a project costs a
  // single aggregate request, and a revisit paints instantly from cache.
  const { data: swrData, error: loadError, isLoading, mutate: revalidate } = useSWR<any>(
    projectId ? '/api/projects/' + projectId : null,
    overviewFetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  );
  const notFound = !!swrData?.notFound;
  const data = notFound ? null : (swrData ?? null);
  const loading = isLoading && !swrData;
  const error = loadError ? humanError(loadError, 'Network error. Check your connection and try again.') : '';
  const load = () => { revalidate(); };

  // Project-context snapshot — one fetch fills the money fallbacks, the
  // open-items rollup, the schedule pulse, and the recent-activity rail.
  // Enhancement-only: the page still renders fully without it.
  const { ctx } = useProjectContext(projectId);
  async function runAutopilot(){
    setScanning(true); setScanMsg('');
    try {
      const auth = await getAuthHeaders();
      const res = await fetch('/api/autopilot/run', {
        method:'POST',
        headers:{'Content-Type':'application/json', ...auth},
        body: JSON.stringify({projectId}),
      });
      if (!res.ok) throw new Error('Scan failed');
      const json = await res.json();
      setScanMsg(json.summary || 'Autopilot scan complete.');
      // Refresh data to pick up new alerts
      await revalidate();
    } catch { setScanMsg('Scan failed. Please try again.'); }
    finally { setScanning(false); }
  }

  // LOADING — skeleton placeholders, never computed zeros or an empty state.
  if(loading) return (
    <CinematicPage soft>
      <div style={{marginBottom:26}}>
        <Skeleton width={140} height={26} style={{marginBottom:14,borderRadius:999}}/>
        <Skeleton width={300} height={40} style={{marginBottom:10}}/>
        <Skeleton width={220} height={14}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:14,marginBottom:26}}>
        {[0,1,2,3,4].map(i=><SkeletonKPI key={i}/>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(380px,1fr))',gap:18}}>
        {[0,1].map(col=>(
          <div key={col} style={{background:CIN.surface,border:`1px solid ${CIN.border}`,borderRadius:18,padding:20}}>
            <Skeleton width="40%" height={16} style={{marginBottom:16}}/>
            {[0,1,2,3,4,5].map(i=><Skeleton key={i} height={13} style={{marginBottom:12}}/>)}
          </div>
        ))}
      </div>
    </CinematicPage>
  );

  // ERROR — fetch threw / network failure / non-2xx (not a 404). Clear block + Retry.
  if(error) return (
    <CinematicPage soft>
      <div style={{maxWidth:560,margin:'40px auto'}}>
        <EmptyStatePremium
          icon={<WarningCircle size={38} weight="duotone" color={RED}/>}
          title="Couldn't Load Project"
          description={error}
          actionLabel="Retry"
          onAction={load}
        />
      </div>
    </CinematicPage>
  );

  // NOT FOUND — true 404 (or success with no project). Distinct from a load error.
  if(notFound || !data?.project) return (
    <CinematicPage soft>
      <div style={{maxWidth:560,margin:'40px auto'}}>
        <EmptyStatePremium
          icon={<FolderOpen size={38} weight="duotone" color={GOLD}/>}
          title="Project Not Found"
          description="This project doesn't exist or you don't have access to it."
          actionLabel="Back to Projects"
          actionHref="/app/projects"
        />
      </div>
    </CinematicPage>
  );

  const p = data.project;
  const payApps = data.payApps||[];
  const changeOrders = data.changeOrders||[];
  const rfis = data.rfis||[];
  const subs = data.subs||[];
  const budgetHealth = data.budgetHealth||{originalBudget:0,revisedBudget:0,approvedChanges:0,committedCost:0,actualCost:0,forecastCost:0,lineCount:0};
  const punchSummary = data.punchSummary||{total:0,open:0,complete:0};
  const schedulePhases = data.schedulePhases||[];
  const alerts = data.alerts||[];

  const contractSummary = summarizeContract(toCents(p.contract_amount||0), changeOrders.map((c:any)=>({ id:String(c.id??''), description:String(c.description??''), amount:toCents(c.cost_impact||0), status:c.status })));
  const approvedCOs = toDollars(contractSummary.approvedChangeOrders);
  const contractToDate = toDollars(contractSummary.revisedContract);
  const billedToDateCents = payApps.length>0?toCents(payApps[0].total_completed_and_stored||0):0;
  const billedToDate = toDollars(billedToDateCents);
  const paidToDateCents = sumCents(payApps.filter((pa:any)=>pa.status==='paid').map((pa:any)=>toCents(pa.current_payment_due||0)));
  const paidToDate = toDollars(paidToDateCents);
  const retainageHeldCents = sumCents(payApps.map((pa:any)=>toCents(pa.retainage_amount||0)));
  const retainageHeld = toDollars(retainageHeldCents);
  const balanceDueCents = subCents(subCents(billedToDateCents, retainageHeldCents), paidToDateCents);
  const balanceDue = Math.max(0, toDollars(balanceDueCents));
  const daysRemaining = p.end_date?Math.max(0,Math.ceil((new Date(p.end_date).getTime()-Date.now())/86400000)):0;
  const overdueRFIs = rfis.filter((r:any)=>r.status==='open'&&r.due_date&&r.due_date<new Date().toISOString().split('T')[0]);
  /* Judge spend against the REVISED budget — the original plus every approved
     change order — not against the original alone. Measuring against the
     original made any job carrying an approved CO read as over budget: a job
     at 99.4% of what it is actually allowed to spend was showing "104.6%
     spent" in red, which is the opposite of the truth. Falls back to the
     original where the API predates the field. */
  const budgetBasis = Number(budgetHealth.revisedBudget) || Number(budgetHealth.originalBudget) || 0;
  const budgetVariance = toDollars(subCents(toCents(budgetHealth.forecastCost), toCents(budgetBasis)));
  const budgetPct = budgetBasis > 0 ? (budgetHealth.actualCost / budgetBasis * 100).toFixed(1) : '0';

  // ── Context-snapshot intelligence (DB numerics can round-trip as strings — always Number()||0 before math) ──
  const cm = ctx?.money;
  const ctxRevised = Number(cm?.revisedContract)||0;
  const ctxBilled = Number(cm?.billedToDate)||0;
  const ctxPaid = Number(cm?.paidToDate)||0;
  const ctxCoTotal = Number(cm?.approvedCoTotal)||0;
  const ctxLastApp = cm?.lastPayApp||null;
  const heroContract = contractToDate>0?contractToDate:ctxRevised;
  const heroBilled = billedToDate>0?billedToDate:ctxBilled;
  const heroPaid = paidToDate>0?paidToDate:ctxPaid;
  const openRfiCount = Number(ctx?.counts?.openRfis)||0;
  const openSubmittalCount = Number(ctx?.counts?.openSubmittals)||0;
  const openPunchCount = Number(ctx?.counts?.openPunch)||punchSummary.open||0;
  const criticalTasks = Number(ctx?.schedule?.criticalCount)||0;
  const nextTasks = (ctx?.schedule?.nextTasks||[]) as any[];
  const invoiceCount = Number(ctx?.counts?.invoices)||0;
  const billCount = Number(ctx?.counts?.bills)||0;
  const poCount = Number(ctx?.counts?.purchaseOrders)||0;
  const moneyDocCount = invoiceCount+billCount+poCount;
  const lastLogDate = ctx?.recent?.lastDailyLogDate?String(ctx.recent.lastDailyLogDate).slice(0,10):null;
  const logAgeDays = lastLogDate?Math.max(0,Math.floor((Date.now()-new Date(lastLogDate+'T00:00:00').getTime())/86400000)):null;
  const fmtShortDate = (d?:string|null) => d?new Date(String(d).slice(0,10)+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';

  const detailRow = (l:string,v:React.ReactNode) => (
    <div key={l} style={{display:'flex',padding:'8px 0',borderBottom:`1px solid ${CIN.border}`,fontSize:13}}>
      <span style={{minWidth:150,color:CIN.faint,fontWeight:600}}>{l}</span>
      <span style={{color:TEXT,textTransform:'capitalize' as const}}>{v}</span>
    </div>
  );
  const summaryRow = (l:string,v:React.ReactNode,color?:string) => (
    <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:`1px solid ${CIN.border}`,fontSize:13}}>
      <span style={{color:CIN.faint}}>{l}</span><span style={{color:color||TEXT,fontWeight:600}}>{v}</span>
    </div>
  );

  return (
    <CinematicPage>
      <ModuleHero
        eyebrow="Project Overview"
        eyebrowIcon={<Buildings size={12} weight="fill" />}
        icon={<Buildings size={26} weight="duotone" color={CIN.goldHi} />}
        title={<span style={{ color: accentForProject(projectId).hex, textShadow: `0 0 18px ${accentForProject(projectId).ring}` }}>{p.name}</span>}
        subtitle={[p.address,p.city,p.state].filter(Boolean).join(', ') || 'Command center for this project — financials, schedule, and field health at a glance.'}
        actions={<>
          {/* The one primary action follows where the job is. A pay app is
              meaningless on a bid nobody has won yet or a job already closed. */}
          {isClosedStatus(p.status) ? (
            <HeroButton href={'/app/projects/'+projectId+'/closeout'} icon={<ArrowRight size={15} weight="bold" color="#0A0A00" />}>
              Open Closeout
            </HeroButton>
          ) : normalisePhase(p.phase) === 'bidding' ? (
            <HeroButton href={'/app/projects/'+projectId+'/takeoff'} icon={<ArrowRight size={15} weight="bold" color="#0A0A00" />}>
              Open Takeoff
            </HeroButton>
          ) : (
            <HeroButton href={'/app/projects/'+projectId+'/pay-apps/new'} icon={<Plus size={15} weight="bold" color="#0A0A00" />}>
              New Pay App
            </HeroButton>
          )}
        </>}
      />

      {/* ONE path, not two.
          This page used to stack PreConFlow ("PROJECT SETUP 3/6") directly above
          the journey ("Your path to first payment 4/9"). Two roadmaps, different
          step counts, different names for the same work — "Measure the plans"
          against "Price the drawings" — and they disagreed about what to do
          next: one said Design low voltage, the other said Set contract &
          budget. A GC reading both cannot tell which is the product's opinion.

          The journey wins because it is the whole job, project through to
          payment, and every PreConFlow step except low voltage already appears
          in it. Low voltage is a Signal Studio feature, not a gate every
          general contractor has to pass to set a job up. */}
      <GettingStartedRail projectId={projectId}/>

      {scanMsg&&<div style={{marginBottom:20,padding:'13px 18px',background: scanMsg.includes('failed') ? 'rgba(239,68,68,.1)' : 'rgba(34,197,94,.1)',border:`1px solid ${scanMsg.includes('failed') ? 'rgba(239,68,68,.35)' : 'rgba(34,197,94,.35)'}`,borderRadius:14,fontSize:13,fontWeight:600,color: scanMsg.includes('failed') ? RED : GREEN,display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:16,display:'inline-flex',verticalAlign:'middle'}}>{scanMsg.includes('failed') ? <XCircle size={16} weight="fill" color={RED}/> : <CheckCircle size={16} weight="fill" color={GREEN}/>}</span>
        {scanMsg}
      </div>}

      {/* KPI stat tiles */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:14,marginBottom:22}}>
        <StatCard delay={0.02} icon={<CurrencyDollar size={17} weight="duotone" color={CIN.goldHi}/>} label="Contract to Date" value={fmt(heroContract)} sub={approvedCOs>0?'+'+fmt(approvedCOs)+' in COs':ctxCoTotal>0?'+'+fmt(ctxCoTotal)+' in COs':'No change orders'} href={`/app/projects/${projectId}/contracts`}/>
        <StatCard delay={0.06} icon={<Receipt size={17} weight="duotone" color={CIN.goldHi}/>} label="Billed to Date" value={fmt(heroBilled)} sub={fmtPct(heroBilled,heroContract)+' complete'} href={`/app/projects/${projectId}/overview`}/>
        <StatCard delay={0.10} icon={<HandCoins size={17} weight="duotone" color={CIN.goldHi}/>} label="Paid to Date" value={fmt(heroPaid)} sub={payApps.filter((pa:any)=>pa.status==='paid').length+' payment(s)'} href={`/app/projects/${projectId}/overview`}/>
        <StatCard delay={0.14} icon={<Coins size={17} weight="duotone" color={CIN.goldHi}/>} label="Retainage Held" value={fmt(retainageHeld)} sub={(p.retainage_percent||10)+'% retained'} href={`/app/projects/${projectId}/overview`}/>
        <StatCard delay={0.18} icon={<CalendarBlank size={17} weight="duotone" color={CIN.goldHi}/>} label="Days Remaining" value={daysRemaining>0?String(daysRemaining):'—'} valueColor={daysRemaining>0&&daysRemaining<14?CIN.red:undefined} sub={p.end_date?'Due '+p.end_date:'No end date set'} href={`/app/projects/${projectId}/overview`}/>
      </div>

      {/* Field pulse — open items, schedule risk, and documentation, from the context snapshot */}
      {ctx&&<StatStrip items={[
        {href: `/app/projects/${projectId}/rfis`, icon:<Question size={11} weight="bold" color={CIN.goldHi}/>, label:'Open RFIs', value:String(openRfiCount), accent:overdueRFIs.length>0?RED:openRfiCount>0?CIN.goldHi:undefined, sub:overdueRFIs.length>0?overdueRFIs.length+' overdue — respond now':openRfiCount>0?'Awaiting answers':'All answered'},
        {href: `/app/projects/${projectId}/submittals`, icon:<Tray size={11} weight="bold" color={CIN.goldHi}/>, label:'Open Submittals', value:String(openSubmittalCount), accent:openSubmittalCount>0?CIN.goldHi:undefined, sub:openSubmittalCount>0?'In review':'Nothing in court'},
        {href: `/app/projects/${projectId}/punch-list`, icon:<ListChecks size={11} weight="bold" color={CIN.goldHi}/>, label:'Open Punch', value:String(openPunchCount), accent:openPunchCount>0?CIN.goldHi:undefined, sub:punchSummary.complete>0?punchSummary.complete+' closed to date':openPunchCount>0?'Items to close':'List is clear'},
        {href: `/app/projects/${projectId}/schedule`, icon:<Warning size={11} weight="bold" color={CIN.goldHi}/>, label:'Critical Path', value:String(criticalTasks), accent:criticalTasks>0?RED:undefined, sub:criticalTasks>0?'Tasks can slip the finish':'No critical tasks open'},
        {href: `/app/projects/${projectId}/daily-logs`, icon:<NotePencil size={11} weight="bold" color={CIN.goldHi}/>, label:'Last Daily Log', value:logAgeDays==null?'—':logAgeDays===0?'Today':logAgeDays+'d ago', accent:logAgeDays!=null&&logAgeDays>3?RED:undefined, sub:lastLogDate?fmtShortDate(lastLogDate):'No field logs yet'},
        {href: `/app/projects/${projectId}/overview`, icon:<CurrencyDollar size={11} weight="bold" color={CIN.goldHi}/>, label:'Money Docs', value:String(moneyDocCount), sub:invoiceCount+' inv · '+billCount+' bills · '+poCount+' POs'},
      ]}/>}

      {overdueRFIs.length>0&&<div style={{background:'rgba(239,68,68,.07)',border:'1px solid rgba(239,68,68,.28)',borderRadius:14,padding:'14px 18px',marginBottom:18,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <span style={{fontWeight:700,color:TEXT,fontSize:14,display:'inline-flex',alignItems:'center',gap:8}}><Warning size={16} weight="fill" color={RED}/> {overdueRFIs.length} overdue RFI(s) need a response</span>
        <Link href={'/app/projects/'+projectId+'/rfis'} style={{fontSize:12,color:CIN.goldHi,textDecoration:'none',fontWeight:700,display:'inline-flex',alignItems:'center',gap:4}}>View RFIs <ArrowRight size={12} weight="bold" color={CIN.goldHi}/></Link>
      </div>}

      {alerts.length>0&&<div style={{marginBottom:18}}>
        {/* Autopilot de-featured: a secondary Intelligence card, not a hero action. */}
        <SectionCard flat title="Intelligence · Autopilot Alerts" icon={<Lightning size={18} weight="duotone" color={CIN.goldHi}/>}
          action={<span style={{display:'inline-flex',gap:14,alignItems:'center'}}>
            <button onClick={runAutopilot} disabled={scanning} style={{all:'unset',cursor:scanning?'wait':'pointer',fontSize:12,fontWeight:700,color:CIN.goldHi}}>{scanning?'Scanning…':'Re-Scan'}</button>
            <SectionLink href={'/app/projects/'+projectId+'/autopilot'}>All Alerts <ArrowRight size={11} weight="bold" color={CIN.goldHi}/></SectionLink>
          </span>}>
          {alerts.slice(0,3).map((a:any)=>(
            <div key={a.id} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'8px 0',borderBottom:`1px solid ${CIN.border}`}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:GOLD,marginTop:6,flexShrink:0,boxShadow:'0 0 8px color-mix(in srgb, var(--brand-primary) 70%, transparent)'}}/>
              <div style={{minWidth:0}}><div style={{fontSize:13,color:TEXT,fontWeight:600}}>{a.title}</div><div style={{fontSize:11.5,color:CIN.faint,marginTop:1}}>{a.message}</div></div>
              <div style={{marginLeft:'auto',fontSize:10,color:CIN.faint,whiteSpace:'nowrap' as const}}>{new Date(a.created_at).toLocaleDateString()}</div>
            </div>
          ))}
        </SectionCard>
      </div>}

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(380px,1fr))',gap:18,alignItems:'start'}}>
        <div style={{display:'flex',flexDirection:'column',gap:18}}>
          <ProjectOwnershipCard projectId={projectId} project={p} onSaved={()=>{ void revalidate(); }}/>
          <SectionCard flat title="Project Details" icon={<ClipboardText size={18} weight="duotone" color={CIN.goldHi}/>} delay={0.05}>
            {[['Status',p.status||'active'],['Type',p.project_type||'—'],['State',p.state||'—'],['Owner',p.owner_entity?.name||p.owner_name||'—'],['Architect',p.architect_entity?.name||p.architect_name||'—'],['Start Date',p.start_date||'—'],['End Date',p.end_date||'—'],['GC License',p.gc_license||'—'],['Prevailing Wage',p.prevailing_wage?'Yes':'No'],['Public Project',p.is_public_project?'Yes':'No']].map(([l,v]:any)=>detailRow(l,v))}
          </SectionCard>
          {budgetHealth.lineCount>0&&<SectionCard flat title="Budget Health" icon={<ChartLineUp size={18} weight="duotone" color={CIN.goldHi}/>} action={<SectionLink href={'/app/projects/'+projectId+'/budget'}>View Budget <ArrowRight size={11} weight="bold" color={CIN.goldHi}/></SectionLink>} delay={0.1}>
            <div style={{marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:8,fontSize:12}}>
                <span style={{color:CIN.faint}}>Actual vs. Budget</span>
                <span style={{color:budgetVariance>0?RED:GREEN,fontWeight:700}}>{budgetPct}% spent</span>
              </div>
              <div style={{height:9,background:'rgba(255,255,255,0.06)',borderRadius:999,overflow:'hidden'}}>
                <div style={{height:'100%',background:parseFloat(budgetPct)>90?RED:parseFloat(budgetPct)>75?GOLD:GREEN,width:Math.min(100,parseFloat(budgetPct))+'%',borderRadius:999,transition:'width .5s ease',boxShadow:'0 0 12px var(--brand-primary-35)'}}/>
              </div>
            </div>
            {[['Original Budget',fmt(budgetHealth.originalBudget)],...(Number(budgetHealth.approvedChanges)?[['Approved Changes','+'+fmt(budgetHealth.approvedChanges)],['Revised Budget',fmt(budgetBasis)]]:[]),['Committed Cost',fmt(budgetHealth.committedCost)],['Actual Cost',fmt(budgetHealth.actualCost)],['Forecast',fmt(budgetHealth.forecastCost)],['Variance',fmt(Math.abs(budgetVariance))+(budgetVariance>0?' over':' under')]].map(([l,v]:any)=>summaryRow(l,v,l==='Variance'?(budgetVariance>0?RED:GREEN):undefined))}
          </SectionCard>}
          {ctx&&<SectionCard flat title="Next Scheduled Work" icon={<CalendarCheck size={18} weight="duotone" color={CIN.goldHi}/>} action={<SectionLink href={'/app/projects/'+projectId+'/schedule'}>Full Schedule <ArrowRight size={11} weight="bold" color={CIN.goldHi}/></SectionLink>} delay={0.15}>
            {nextTasks.length===0
              ?<div style={{color:CIN.faint,fontSize:13,lineHeight:1.6,padding:'4px 0'}}>
                {Number(ctx?.counts?.scheduleTasks)>0
                  ?'Every scheduled task is complete or past its window — update the schedule to keep this lookahead live.'
                  :<>No schedule yet. <Link href={'/app/projects/'+projectId+'/schedule'} style={{color:CIN.goldHi,fontWeight:700}}>Build the schedule</Link> and the next tasks, critical-path count, and finish risk all light up here.</>}
              </div>
              :nextTasks.map((tk:any)=>(
                <div key={tk.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:`1px solid ${CIN.border}`}}>
                  <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:(Number(tk.pctComplete)||0)>0?GOLD:CIN.faint}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,color:TEXT,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{tk.name}</div>
                    <div style={{fontSize:11.5,color:CIN.faint}}>{[tk.trade,fmtShortDate(tk.startDate)+' – '+fmtShortDate(tk.endDate)].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span style={{fontSize:11,fontWeight:800,color:(Number(tk.pctComplete)||0)>0?CIN.goldHi:CIN.faint,whiteSpace:'nowrap' as const}}>{Number(tk.pctComplete)||0}%</span>
                </div>
              ))}
            {criticalTasks>0&&<div style={{marginTop:12,padding:'9px 12px',borderRadius:10,background:'rgba(239,68,68,.07)',border:'1px solid rgba(239,68,68,.25)',fontSize:12,color:RED,fontWeight:600,display:'flex',alignItems:'center',gap:7}}>
              <Warning size={14} weight="fill" color={RED}/> {criticalTasks} critical-path task{criticalTasks===1?'':'s'} open — a slip here moves the finish date.
            </div>}
          </SectionCard>}
          {ctx&&<SectionCard flat title="Recent Activity" icon={<ClockCounterClockwise size={18} weight="duotone" color={CIN.goldHi}/>} delay={0.2}>
            {[
              {icon:<Receipt size={15} weight="duotone" color={CIN.goldHi}/>, href:'/app/projects/'+projectId+'/pay-apps',
                title: ctxLastApp?'Pay App #'+ctxLastApp.appNumber+' · '+String(ctxLastApp.status||'draft').replace(/_/g,' '):'No pay applications yet',
                sub: ctxLastApp?'Billed through '+fmtShortDate(ctxLastApp.periodTo):'Billing starts with App #1',
                value: ctxLastApp?fmt(Number(ctxLastApp.currentPaymentDue)||0):'—'},
              {icon:<ArrowsLeftRight size={15} weight="duotone" color={CIN.goldHi}/>, href:'/app/projects/'+projectId+'/change-orders',
                title:(Number(cm?.approvedCoCount)||0)+' change order'+((Number(cm?.approvedCoCount)||0)===1?'':'s')+' approved',
                sub:(Number(cm?.pendingCoCount)||0)>0?(Number(cm?.pendingCoCount)||0)+' pending decision':'None pending decision',
                value:(ctxCoTotal>=0?'+':'')+fmt(ctxCoTotal)},
              {icon:<NotePencil size={15} weight="duotone" color={CIN.goldHi}/>, href:'/app/projects/'+projectId+'/daily-logs',
                title: lastLogDate?'Daily log filed':'No daily logs yet',
                sub: lastLogDate?(logAgeDays===0?'Today':logAgeDays+' day'+(logAgeDays===1?'':'s')+' ago'):'Field history builds the claim file',
                value: lastLogDate?fmtShortDate(lastLogDate):'—'},
              {icon:<CurrencyDollar size={15} weight="duotone" color={CIN.goldHi}/>, href:'/app/projects/'+projectId+'/invoices',
                title: moneyDocCount>0?'Outstanding receivable':'No billing documents yet',
                sub: invoiceCount+' invoices · '+billCount+' bills · '+poCount+' POs',
                value: fmt(Math.max(0,ctxBilled-ctxPaid))},
            ].map(row=>(
              <Link key={row.href} href={row.href} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:`1px solid ${CIN.border}`,textDecoration:'none'}}>
                <span style={{width:28,height:28,borderRadius:8,flexShrink:0,display:'inline-flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(150deg, var(--brand-primary-18), color-mix(in srgb, var(--brand-primary) 4%, transparent))',border:'1px solid var(--brand-primary-25)'}}>{row.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,color:TEXT,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{row.title}</div>
                  <div style={{fontSize:11.5,color:CIN.faint}}>{row.sub}</div>
                </div>
                <span style={{fontSize:12,fontWeight:700,color:CIN.goldHi,whiteSpace:'nowrap' as const}}>{row.value}</span>
                <ArrowRight size={11} weight="bold" color={CIN.faint}/>
              </Link>
            ))}
          </SectionCard>}
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:18}}>
          <SectionCard flat title="Financial Summary" icon={<CurrencyDollar size={18} weight="duotone" color={CIN.goldHi}/>} action={<SectionLink href={'/app/projects/'+projectId+'/pay-apps'}>All Pay Apps <ArrowRight size={11} weight="bold" color={CIN.goldHi}/></SectionLink>} delay={0.05}>
            {heroContract>0&&<div style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:7,fontSize:12}}>
                <span style={{color:CIN.faint}}>Billed {fmt(heroBilled)} of {fmt(heroContract)}</span>
                <span style={{color:CIN.goldHi,fontWeight:800}}>{fmtPct(heroBilled,heroContract)}</span>
              </div>
              <div style={{height:8,background:'rgba(255,255,255,0.06)',borderRadius:999,overflow:'hidden'}}>
                <div style={{height:'100%',width:Math.min(100,heroContract>0?(heroBilled/heroContract)*100:0)+'%',background:`linear-gradient(90deg,${GOLD},var(--brand-primary-strong))`,borderRadius:999,boxShadow:'0 0 12px var(--brand-primary-35)'}}/>
              </div>
            </div>}
            {[['Original Contract',fmt(Number(p.original_contract)||Number(p.contract_amount)||Number(cm?.originalContract)||0)],['Change Orders','+'+fmt(approvedCOs>0?approvedCOs:ctxCoTotal)],['Contract to Date',fmt(heroContract)],['Billed to Date',fmt(heroBilled)+' ('+fmtPct(heroBilled,heroContract)+')'],['Retainage Held',fmt(retainageHeld)],['Total Paid',fmt(heroPaid)],['Balance Due',fmt(balanceDue)]].map(([l,v]:any)=>summaryRow(l,v))}
          </SectionCard>
          {punchSummary.total>0&&<SectionCard flat title="Punch List" icon={<ListChecks size={18} weight="duotone" color={CIN.goldHi}/>} action={<SectionLink href={'/app/projects/'+projectId+'/punch-list'}>View All <ArrowRight size={11} weight="bold" color={CIN.goldHi}/></SectionLink>} delay={0.1}>
            <div style={{display:'flex',gap:12,marginBottom:14}}>
              {[
                {v:punchSummary.open,l:'Open',c:RED,bg:'rgba(239,68,68,.08)',bd:'rgba(239,68,68,.22)'},
                {v:punchSummary.complete,l:'Complete',c:GREEN,bg:'rgba(34,197,94,.08)',bd:'rgba(34,197,94,.22)'},
                {v:punchSummary.total,l:'Total',c:TEXT,bg:'rgba(255,255,255,.04)',bd:CIN.border},
              ].map(s=>(
                <div key={s.l} style={{flex:1,textAlign:'center' as const,padding:'12px 0',background:s.bg,borderRadius:12,border:`1px solid ${s.bd}`}}>
                  <div style={{fontSize:24,fontWeight:900,color:s.c}}>{s.v}</div>
                  <div style={{fontSize:10,fontWeight:800,color:CIN.faint,marginTop:3}}>{s.l}</div>
                </div>
              ))}
            </div>
            {punchSummary.total>0&&<div style={{height:9,background:'rgba(255,255,255,0.06)',borderRadius:999,overflow:'hidden'}}>
              <div style={{height:'100%',background:GREEN,width:(punchSummary.complete/punchSummary.total*100).toFixed(1)+'%',borderRadius:999,boxShadow:'0 0 12px rgba(34,197,94,.4)'}}/>
            </div>}
          </SectionCard>}
          {schedulePhases.length>0&&<SectionCard flat title="Schedule" icon={<CalendarCheck size={18} weight="duotone" color={CIN.goldHi}/>} action={<SectionLink href={'/app/projects/'+projectId+'/schedule'}>Full Schedule <ArrowRight size={11} weight="bold" color={CIN.goldHi}/></SectionLink>} delay={0.15}>
            {schedulePhases.slice(0,4).map((phase:any)=>{
              const planned = phase.planned_end;
              const actual = phase.actual_end||phase.forecast_end;
              const late = planned&&actual&&actual>planned&&phase.status!=='complete';
              return <div key={phase.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`1px solid ${CIN.border}`}}>
                <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:phase.status==='complete'?GREEN:late?RED:phase.status==='in_progress'?GOLD:CIN.faint}}/>
                <div style={{flex:1,fontSize:13,color:TEXT,fontWeight:600}}>{phase.name}</div>
                <div style={{fontSize:11,color:late?RED:CIN.faint}}>{phase.planned_end||'—'}</div>
                <span style={{fontSize:10,padding:'3px 8px',borderRadius:999,background:phase.status==='complete'?'rgba(34,197,94,.14)':phase.status==='in_progress'?'var(--brand-primary-12)':'rgba(148,163,184,.1)',color:phase.status==='complete'?GREEN:phase.status==='in_progress'?GOLD:CIN.faint,fontWeight:800}}>{((x:string)=>x.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()))(phase.status||'pending')}</span>
              </div>;
            })}
          </SectionCard>}
          <SectionCard title="Subcontractors" icon={<UsersThree size={18} weight="duotone" color={CIN.goldHi}/>} action={<SectionLink href={'/app/projects/'+projectId+'/team'}>Manage <ArrowRight size={11} weight="bold" color={CIN.goldHi}/></SectionLink>} delay={0.2}>
            {subs.length===0
              ?<div style={{color:CIN.faint,fontSize:13,textAlign:'center',padding:'14px 0'}}>No subs yet. <Link href={'/app/projects/'+projectId+'/team'} style={{color:CIN.goldHi,fontWeight:700}}>Add Subs</Link></div>
              :subs.slice(0,4).map((sub:any)=>(
                <div key={sub.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:`1px solid ${CIN.border}`}}>
                  <div style={{width:32,height:32,borderRadius:'50%',background:'linear-gradient(150deg, var(--brand-primary-25), var(--brand-primary-08))',border:'1px solid var(--brand-primary-25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,flexShrink:0,color:CIN.goldHi}}>{sub.name?.[0]||'?'}</div>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,color:TEXT,fontWeight:600}}>{sub.name}</div><div style={{fontSize:11.5,color:CIN.faint}}>{sub.trade} — {fmt(sub.contract_amount||0)}</div></div>
                  <span style={{fontSize:10,padding:'3px 8px',borderRadius:999,background:sub.status==='active'?'rgba(34,197,94,.14)':'rgba(148,163,184,.1)',color:sub.status==='active'?GREEN:CIN.faint,fontWeight:800}}>{((x:string)=>x.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()))(String(sub.status||''))}</span>
                </div>
              ))
            }
          </SectionCard>
        </div>
      </div>
    </CinematicPage>
  );
}
