'use client';
/**
 * New Pay Application — Pass 4, on the RFIs reference layout (form + rail).
 *
 * Anatomy: crumbs → title (Application #N) → StatRow (contract position) →
 * Tabs (1. Period · 2. Schedule of Values) → workspace: the step's form on the
 * left, a 320–384px rail (the prior application and the live G702 summary)
 * on the right. Phone: stacked. The form keeps
 * layout.formMaxWidth; the SOV sheet runs full width.
 *
 * The screen walks in knowing the project: contract money, approved COs, the
 * prior application, and the prior SOV — the GC types only this period's work.
 * `ctx` = /api/project-context snapshot; `appNumber` and the rolled-forward
 * SOV from the pay-app seeder. Every read / write is unchanged:
 *   seed    GET  /api/pay-apps/create?projectId=
 *   create  POST /api/pay-apps/create
 *   submit  POST /api/pay-apps/[id]/submit
 * Money is never truncated; retainage and payment due compute themselves.
 */
import React, { useState, useEffect, useRef } from 'react';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import SaguaroDatePicker from '../../../../../../components/SaguaroDatePicker';
import { ArrowLeft, ArrowRight, Plus, X, WarningCircle } from '@phosphor-icons/react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  PageShell, Card, StatRow, Button, Tabs, Field, Input, FormGrid, ItemList, ItemRow, Callout,
  type StatItem,
} from '@/components/ui/kit';
import { layout } from '@/lib/design-tokens';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n:number) => money.format(Number(n)||0);
const fmtSigned = (n:number) => (n<0 ? '-' : n>0 ? '+' : '') + money.format(Math.abs(n||0));
/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
const fmtDate = (d?:string|null) => d ? new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

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

const DATE_INPUT_STYLE: React.CSSProperties = {
  width:'100%', minHeight:40, padding:'8px 12px', fontSize:14,
  background:'var(--bg-surface-2)', border:'1px solid var(--border-default)',
  borderRadius:'var(--radius-sm)', color:'var(--text-primary)',
};

const CSS = `
.pnWs > .k-page { max-width: none; }
.pnCq { container: pnws / inline-size; min-width: 0; }
.pnSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.pnSplit > * { min-width: 0; }
.pnMain { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.pnRail { order: -1; display: flex; flex-direction: column; gap: 16px; }
@container pnws (min-width: 960px) {
  .pnSplit { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 28%, ${layout.detailRailMax}px); }
  .pnRail { order: 0; position: sticky; top: 16px; }
}
.pnForm { max-width: ${layout.formMaxWidth}px; }
.pnBarLabel { display: flex; justify-content: space-between; font-size: var(--fs-xs); color: var(--text-tertiary); margin: 10px 0 6px; }
.pnBarLabel b { color: var(--text-primary); font-variant-numeric: tabular-nums; }
.pnBarTrack { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.08); overflow: hidden; }
.pnBarFill { height: 100%; border-radius: 3px; background: var(--status-ongoing); }
.pnTableWrap { overflow-x: auto; }
.pnTable { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.pnTable th { position: sticky; top: 0; z-index: 1; background: rgba(21,23,28,0.88); text-align: left; padding: 8px 10px; font-size: 12px; font-weight: 700; color: var(--text-tertiary); border-bottom: 1px solid var(--border-default); white-space: nowrap; }
.pnTable td { padding: 6px 10px; height: 44px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: middle; }
.pnTable th:first-child, .pnTable td:first-child { padding-left: var(--sp-4); position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.pnTable th:first-child { background: var(--bg-solid-2); z-index: 3; }
.pnTable th[data-align="right"], .pnTable td[data-align="right"] { text-align: right; }
.pnTable td[data-desc] { min-width: 200px; }
.pnTable tfoot td { font-weight: 800; color: var(--text-primary); background: var(--bg-surface-2); border-top: 2px solid var(--border-default); }
.pnTable .k-input { min-height: 32px; padding: 4px 8px; font-size: 13px; }
.pnTable .k-input[data-num] { text-align: right; width: 110px; }
.pnNeg { color: var(--status-overdue); }
.pnStrong { color: var(--text-primary); font-weight: 700; }
.pnDue { display: flex; justify-content: space-between; align-items: center; padding: 12px var(--sp-4); border-top: 1px solid var(--border-default); }
.pnDue > span { font-size: var(--fs-sm); font-weight: 800; color: var(--text-primary); }
.pnDue > b { font-size: var(--fs-lg); font-weight: 800; color: var(--status-ongoing); font-variant-numeric: tabular-nums; }
.pnBtns { display: flex; gap: 8px; flex-wrap: wrap; }
.pnMuted { color: var(--text-tertiary); }
.pnDateInput { width: 100%; }
@media (max-width: 640px) {
  .pnWs .k-btn, .pnWs .k-stat, .pnWs .k-input { min-height: 44px; }
}
`;

export default function NewPayAppPage() {
  const params    = useParams();
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
    const start = lastTo ? new Date(new Date(lastTo+'T12:00:00').getTime()+86400000) : new Date(new Date().getFullYear(),new Date().getMonth(),1);
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
      }catch(e){
        // The seeder only pre-fills; the GC can still build the SOV by hand.
        console.error('[pay-apps/new] seed failed', e);
      }
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

  const appLabel = appNumber ?? ((money?.payAppCount??0)+1);
  const stats: StatItem[] = [
    { label:'Application', value:`#${appLabel}`, sub: lastApp ? `Follows App #${lastApp.appNumber}` : 'First on this project' },
    { label:'Original Contract', value:fmt(original||contractSumNum), sub:'G702 line 1', href:`/app/projects/${projectId}/contracts` },
    { label:'Approved COs', value:fmtSigned(coTotal), tone: coTotal>0 ? 'good' : 'default', sub:`${money?.approvedCoCount||0} approved${money?.pendingCoCount?` · ${money.pendingCoCount} pending`:''}`, href:`/app/projects/${projectId}/change-orders` },
    { label:'Revised Contract', value:fmt(revised), sub:'Contract sum to date', href:`/app/projects/${projectId}/contracts` },
    { label:'Billed to Date', value:fmt(money?.billedToDate||0), sub:`${money?.billedPct||0}% of revised` },
  ];

  const liveSummary = (
    <Card title="Live G702 summary" subtitle="Matches the saved application to the cent." flush>
      <ItemList>
        <ItemRow title="Original contract" value={fmt(contractSumNum)}/>
        {coTotal!==0 && <ItemRow title="Approved COs" value={fmtSigned(coTotal)}/>}
        {coTotal!==0 && <ItemRow title="Contract to date" value={fmt(contractSumNum+coTotal)}/>}
        <ItemRow title="Previous completed" value={fmt(prevTotal)}/>
        <ItemRow title="This period" value={fmt(thisPeriodTotal)}/>
        <ItemRow title="Materials stored" value={fmt(matsTotal)}/>
        <ItemRow title="Total completed" value={fmt(totalCompleted)}/>
        <ItemRow title={`Retainage (${pct}%)`} value={fmt(retainageAmt)}/>
        <ItemRow title="Balance to finish" value={fmt(Math.max(0,(contractSumNum+coTotal)-totalCompleted))}/>
      </ItemList>
      <div className="pnDue"><span>Payment due</span><b>{fmt(paymentDue)}</b></div>
    </Card>
  );

  return (
    <div className="pnWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label:'Projects', href:'/app/projects' },
          { label: ctx?.project?.name || 'Project', href:`/app/projects/${projectId}/overview` },
          { label:'Pay Applications', href:`/app/projects/${projectId}/pay-apps` },
          { label:'New' },
        ]}
        title={`Application #${appLabel}`}
        subtitle="AIA G702/G703 — Application and Certificate for Payment."
        actions={
          step===1
            ? <Button variant="primary" icon={<ArrowRight size={15} weight="bold"/>} onClick={()=>setStep(2)}>Next: Schedule of Values</Button>
            : <Button variant="primary" icon={<ArrowRight size={15} weight="bold"/>} onClick={()=>save('submitted')} disabled={saving}>{saving ? 'Submitting…' : 'Submit to Owner'}</Button>
        }
      >
        {ctx && <StatRow items={stats}/>}

        <Tabs value={String(step)} onChange={k=>setStep(Number(k))} tabs={[{ key:'1', label:'1. Period & Contract' }, { key:'2', label:'2. Schedule of Values', count: lines.length }]} />

        {error && (
          <Callout tone="danger" icon={<WarningCircle size={18}/>} title="The application didn't save" text={error} actions={<Button size="sm" variant="ghost" onClick={()=>setError('')}>Dismiss</Button>}/>
        )}

        <div className="pnCq">
          <div className="pnSplit">
            <div className="pnMain">
              {step===1 && (
                <>
                  <Card title="Billing Period" subtitle="The dates and contract figures that print on the G702.">
                    <div className="pnForm">
                      <FormGrid cols={2}>
                        <Field label="Period From" required hint={lastApp ? `App #${lastApp.appNumber} billed through ${fmtDate(lastApp.periodTo)}.` : auto.period ? 'Defaulted to the first of the month.' : undefined}>
                          <div className="pnDateInput"><SaguaroDatePicker value={periodFrom} onChange={v=>{setTouched(true);setPeriodFrom(v);}} style={DATE_INPUT_STYLE}/></div>
                        </Field>
                        <Field label="Period To" required hint={auto.period ? 'Defaulted to month end.' : undefined}>
                          <div className="pnDateInput"><SaguaroDatePicker value={periodTo} onChange={v=>{setTouched(true);setPeriodTo(v);}} style={DATE_INPUT_STYLE}/></div>
                        </Field>
                        <Field label="Original Contract Sum ($)" hint={coTotal>0
                          ? <>G702 line 1. With {money?.approvedCoCount} approved CO{money?.approvedCoCount===1?'':'s'} ({fmt(coTotal)}), contract sum to date is <b>{fmt(revised)}</b>.</>
                          : auto.sum ? 'G702 line 1 — from the project contract.' : 'G702 line 1.'}>
                          <Input type="number" value={contractSum} onChange={e=>{setTouched(true);setContractSum(e.target.value);}} placeholder="0" min="0"/>
                        </Field>
                        <Field label="Retainage %" hint={lastApp ? `Carried from App #${lastApp.appNumber}.` : auto.ret ? 'From project contract terms.' : undefined}>
                          <Input type="number" value={retainagePct} onChange={e=>{setTouched(true);setRetainagePct(e.target.value);}} placeholder="10" min="0" max="100"/>
                        </Field>
                      </FormGrid>
                    </div>
                  </Card>

                  <Card title="Schedule of Values" subtitle={rolledForward ? `${lines.length} lines rolled forward from App #${lastApp?.appNumber ?? '—'}` : 'First application — built in step 2.'}>
                    {rolledForward ? (
                      <>
                        <div className="pnBarLabel"><span>Billed {fmt(prevTotal)} of {fmt(sovScheduled)} scheduled</span><b>{sovScheduled>0?Math.round((prevTotal/sovScheduled)*100):0}%</b></div>
                        <div className="pnBarTrack"><div className="pnBarFill" style={{width:`${sovScheduled>0?Math.min(100,(prevTotal/sovScheduled)*100):0}%`}}/></div>
                      </>
                    ) : null}
                    <div className="pnBtns" style={{marginTop:16}}>
                      <Button icon={<ArrowRight size={15} weight="bold"/>} onClick={()=>setStep(2)}>Next: Schedule of Values</Button>
                    </div>
                  </Card>
                </>
              )}

              {step===2 && (
                <>
                  <Card title="Schedule of Values (G703)" subtitle={rolledForward ? `Rolled forward from App #${lastApp?.appNumber ?? '—'} — enter this period's work.` : 'Retainage and payment due compute themselves.'} flush actions={<Button size="sm" icon={<Plus size={13} weight="bold"/>} onClick={addLine}>Add Row</Button>}>
                    <div className="pnTableWrap">
                      <table className="pnTable k-table-skin">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Description</th>
                            <th data-align="right">Scheduled Value</th>
                            <th data-align="right">Previous</th>
                            <th data-align="right">This Period</th>
                            <th data-align="right">Stored</th>
                            <th data-align="right">% Done</th>
                            <th data-align="right">Balance</th>
                            <th data-align="right">Retainage</th>
                            <th aria-label="Remove"/>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((l,i)=>(
                            <tr key={i}>
                              <td className="pnStrong">{l.lineNumber}</td>
                              <td data-desc="true"><Input value={l.description} onChange={e=>updateLine(i,'description',e.target.value)} placeholder="Description" aria-label={`Line ${l.lineNumber} description`}/></td>
                              {(['scheduledValue','workFromPrev','workThisPeriod','materialsStored'] as const).map(f=>(
                                <td key={f} data-align="right">
                                  <Input type="number" data-num="true" value={(l as any)[f]||''} onChange={e=>updateLine(i,f,e.target.value)} placeholder="0" aria-label={`Line ${l.lineNumber} ${f}`}/>
                                </td>
                              ))}
                              <td data-align="right" className="pnStrong">{l.percentComplete.toFixed(1)}%</td>
                              <td data-align="right" className={l.balanceToFinish<0?'pnNeg':undefined}>{fmt(l.balanceToFinish)}</td>
                              <td data-align="right">{fmt(l.retainage)}</td>
                              <td><Button variant="ghost" size="sm" icon={<X size={14} weight="bold"/>} aria-label={`Remove line ${l.lineNumber}`} onClick={()=>removeLine(i)}/></td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={2}>Totals</td>
                            <td data-align="right">{fmt(sovScheduled)}</td>
                            <td data-align="right">{fmt(prevTotal)}</td>
                            <td data-align="right">{fmt(thisPeriodTotal)}</td>
                            <td data-align="right">{fmt(matsTotal)}</td>
                            <td data-align="right">{contractSumNum>0?((totalCompleted/contractSumNum)*100).toFixed(1):0}%</td>
                            <td data-align="right">{fmt(lines.reduce((s,l)=>s+(l.balanceToFinish||0),0))}</td>
                            <td data-align="right">{fmt(retainageAmt)}</td>
                            <td/>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </Card>

                  <div className="pnBtns">
                    <Button icon={<ArrowLeft size={15} weight="bold"/>} onClick={()=>setStep(1)}>Back</Button>
                    <Button onClick={()=>save('draft')} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</Button>
                    <Button variant="primary" icon={<ArrowRight size={15} weight="bold"/>} onClick={()=>save('submitted')} disabled={saving}>{saving ? 'Submitting…' : 'Submit to Owner'}</Button>
                  </div>
                </>
              )}
            </div>

            <aside className="pnRail" aria-label="Pay application context">
              {step===2 && liveSummary}
              <Card title={lastApp ? `Last application — #${lastApp.appNumber}` : 'First application'} flush={!!lastApp}>
                {lastApp ? (
                  <ItemList>
                    <ItemRow title="Period" value={`${fmtDate(lastApp.periodFrom)} – ${fmtDate(lastApp.periodTo)}`}/>
                    <ItemRow title="Status" value={String(lastApp.status||'—').replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase())}/>
                    <ItemRow title="Completed & stored" value={fmt(lastApp.totalCompletedStored)}/>
                    <ItemRow title="Payment certified" value={<strong>{fmt(lastApp.currentPaymentDue)}</strong>}/>
                  </ItemList>
                ) : (
                  <div className="pnMuted" style={{fontSize:'var(--fs-sm)',lineHeight:1.6}}>
                    No earlier application on {ctx?.project?.name || 'this project'}.
                  </div>
                )}
              </Card>
            </aside>
          </div>
        </div>
      </PageShell>

      <UnsavedGuardModal guard={guard} />
    </div>
  );
}
