'use client';
import { useProjects } from '@/lib/hooks/useProjects';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { toCents, toDollars, summarizeContract } from '@/lib/calc';
import { Robot, X, Warning, CheckCircle, XCircle, Plus, Clipboard, CaretDown, PencilSimple, Copy, Trash, CurrencyDollar, ClockCounterClockwise } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, FlowSteps, FlowStrip, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { moduleAccent } from '@/lib/module-identity';
import Suggest from '@/components/ui/Suggest';
import { StatusPill } from '@/components/ui/Status';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='#D4D4D8',TEXT='#FFFFFF',GREEN='#2CFF7A',RED='#FF3B30',ORANGE='#FF8A00';
const AMBER='var(--warning)';
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

const INP:React.CSSProperties = {padding:'8px 12px',background:'var(--bg-surface-2)',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',width:'100%',boxSizing:'border-box'};
const LBL:React.CSSProperties = {display:'block',fontSize:11,fontWeight:700,color:DIM, marginBottom:6};
const HINT:React.CSSProperties = {fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:5,lineHeight:1.45};
const fmtDate = (d?:string|null) => d ? new Date(String(d).slice(0,10)+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
const padCo = (n:number|string) => String(n??0).padStart(3,'0');

interface AIRiskResult {
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  approval_likelihood: number;
  flags: string[];
  recommendations: string[];
  summary: string;
}

function RiskBadge({ level }: { level: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  const cfg = {
    LOW:    { bg:'rgba(26,138,74,.18)', color:'#2CFF7A', label:'Low Risk' },
    MEDIUM: { bg:'color-mix(in srgb, var(--warning) 18%, transparent)', color:AMBER, label:'Medium Risk' },
    HIGH:   { bg:'rgba(192,48,48,.18)', color:RED, label:'High Risk' },
  }[level];
  return (
    <span style={{fontSize:12,fontWeight:800,padding:'4px 12px',borderRadius:6,background:cfg.bg,color:cfg.color}}>
      {cfg.label}
    </span>
  );
}

function AIRiskPanel({ result, onClose }: { result: AIRiskResult; onClose: () => void }) {
  const approvalColor = result.approval_likelihood >= 70 ? '#2CFF7A' : result.approval_likelihood >= 40 ? AMBER : RED;
  return (
    <div style={{marginTop:12,background:'var(--bg-surface)',border:`1px solid var(--brand-primary-25)`,borderRadius:12,padding:20,animation:'slideDown .25s ease'}}>
      <style>{`@keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:16,display:'inline-flex',verticalAlign:'middle'}}><Robot size={16} color={GOLD} weight="regular" /></span>
          <span style={{fontWeight:800,fontSize:14,color:TEXT}}>AI Risk Analysis</span>
          <RiskBadge level={result.risk_level} />
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:DIM,fontSize:18,cursor:'pointer',lineHeight:1}}><X size={18} color={DIM} weight="regular" /></button>
      </div>

      {/* Approval Likelihood */}
      <div style={{marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <span style={{fontSize:12,fontWeight:700,color:DIM}}>Approval Likelihood</span>
          <span style={{fontSize:18,fontWeight:800,color:approvalColor}}>{result.approval_likelihood}%</span>
        </div>
        <div style={{height:8,background:BORDER,borderRadius:4,overflow:'hidden'}}>
          <div style={{width:`${result.approval_likelihood}%`,height:'100%',background:approvalColor,borderRadius:4,transition:'width .6s ease'}} />
        </div>
      </div>

      {/* Summary */}
      <div style={{background:'var(--brand-primary-08)',border:`1px solid var(--brand-primary-12)`,borderRadius:8,padding:'12px 14px',marginBottom:14,fontSize:13,color:TEXT,lineHeight:1.6}}>
        {result.summary}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        {/* Flags */}
        {result.flags.length > 0 && (
          <div>
            <div style={{fontSize:11,fontWeight:700,color:DIM, marginBottom:8}}>Flags / Concerns</div>
            <ul style={{margin:0,padding:0,listStyle:'none',display:'flex',flexDirection:'column',gap:5}}>
              {result.flags.map((f) => (
                <li key={f} style={{display:'flex',gap:7,alignItems:'flex-start',fontSize:12,color:'#FF3B30'}}>
                  <span style={{marginTop:1,flexShrink:0,display:'inline-flex'}}><Warning size={12} color="#FF3B30" weight="fill" /></span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Recommendations */}
        {result.recommendations.length > 0 && (
          <div>
            <div style={{fontSize:11,fontWeight:700,color:DIM, marginBottom:8}}>Recommendations</div>
            <ul style={{margin:0,padding:0,listStyle:'none',display:'flex',flexDirection:'column',gap:5}}>
              {result.recommendations.map((r) => (
                <li key={r} style={{display:'flex',gap:7,alignItems:'flex-start',fontSize:12,color:'#2CFF7A'}}>
                  <span style={{marginTop:1,flexShrink:0,display:'inline-flex'}}><CheckCircle size={12} color="#2CFF7A" weight="fill" /></span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function statusStyle(s:string):{c:string,bg:string}{
  if(s==='approved') return {c:'#2CFF7A',bg:'rgba(26,138,74,.14)'};
  if(s==='rejected') return {c:RED, bg:'rgba(192,48,48,.14)'};
  return {c:GOLD,bg:'var(--brand-primary-12)'};
}

export default function ChangeOrdersPage() {
  const params    = useParams();
  const projectId = params['projectId'] as string;

  const [cos,setCos]         = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError]     = useState('');
  const [showForm,setShowForm] = useState(false);
  const [saving,setSaving]   = useState(false);
  const [approvingId,setApprovingId] = useState<string|null>(null);
  const [toast,setToast] = useState<{msg:string;type:'success'|'error'}|null>(null);

  // AI Risk Analysis state
  const [riskTarget,setRiskTarget] = useState<'form'|string|null>(null); // 'form' = new CO form, or CO id
  const [riskResult,setRiskResult] = useState<AIRiskResult|null>(null);
  const [riskLoading,setRiskLoading] = useState(false);
  const [riskError,setRiskError] = useState('');
  const [coMenuId, setCoMenuId] = useState<string|null>(null);
  const [coEditId, setCoEditId] = useState<string|null>(null);
  const [coEditVal, setCoEditVal] = useState('');
  const [coCopiedId, setCoCopiedId] = useState<string|null>(null);
  // ListToolbar state — status persists per module via sag_flt_change-orders.
  const [coSearch,setCoSearch] = useState('');
  const [coStatusFilter,setCoStatusFilter] = useState('all');

  useEffect(()=>{ const t=toast?setTimeout(()=>setToast(null),4000):null; return ()=>{ if(t) clearTimeout(t); }; },[toast]);

  // project contract sum for running total
  const [contractSum,setContractSum] = useState(0);

  // /api/project-context snapshot — the screen walks in knowing the contract
  // money, CO history, bid packages, and schedule before the GC types anything.
  const { ctx } = useProjectContext(projectId);
  useEffect(()=>{
    const original = Number(ctx?.money?.originalContract)||0;
    if(original>0) setContractSum(prev=>prev||original);
  },[ctx]);

  // form
  const [fTitle,setFTitle]         = useState('');
  const [fDesc,setFDesc]           = useState('');
  const [fReason,setFReason]       = useState('');
  const [fCost,setFCost]           = useState('');
  const [fSchedule,setFSchedule]   = useState('');
  const [fRelatedPkg,setFRelatedPkg] = useState('');

  /* ── Unsaved-work protection (R14): dirty once anything is typed in the
   *    composer; draft autosaves per project and restores on return. ── */
  const coFormDirty = showForm && (!!fTitle || !!fDesc || !!fReason || !!fCost || !!fSchedule || !!fRelatedPkg);
  const coDraft = useMemo(() => ({
    fTitle, fDesc, fReason, fCost, fSchedule, fRelatedPkg,
  }), [fTitle, fDesc, fReason, fCost, fSchedule, fRelatedPkg]);
  const guard = useUnsavedGuard({
    dirty: coFormDirty,
    draftKey: `change-order:${projectId}`,
    draftData: coDraft,
    restoreDraft: (d) => {
      const v = d as Partial<typeof coDraft>;
      if (!v) return;
      setFTitle(v.fTitle ?? ''); setFDesc(v.fDesc ?? ''); setFReason(v.fReason ?? '');
      setFCost(v.fCost ?? ''); setFSchedule(v.fSchedule ?? ''); setFRelatedPkg(v.fRelatedPkg ?? '');
      setShowForm(true);
    },
    onSave: () => submitCO(),
  });

  /** Close the composer through the guard — clean closes immediately, dirty
   *  asks Save / Discard / Stay first. */
  function closeCoForm() {
    guard.requestClose(() => { setShowForm(false); setError(''); });
  }

  async function analyzeRisk(coData: Record<string, unknown>, targetKey: 'form' | string) {
    setRiskTarget(targetKey);
    setRiskResult(null);
    setRiskError('');
    setRiskLoading(true);
    try {
      const r = await fetch('/api/ai/change-order-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...coData }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setRiskResult(d);
    } catch(e: unknown) {
      setRiskError((e as Error).message || 'AI analysis failed.');
    } finally {
      setRiskLoading(false);
    }
  }

  const { projects: allProjects } = useProjects();
  useEffect(() => {
    const project = (allProjects as any[]).find((p: any) => p.id === projectId);
    if (project?.contract_amount) setContractSum(Number(project.contract_amount) || 0);
  }, [allProjects, projectId]);

  const load = useCallback(async()=>{
    setLoading(true); setError('');
    try{
      const coRes  = await fetch(`/api/change-orders/list?projectId=${projectId}`);
      const coData = await coRes.json();
      setCos((coData.changeOrders??[]).sort((a:any,b:any)=>(a.co_number||0)-(b.co_number||0)));
    }catch(e:any){
      console.error(e); setError(humanError(e, 'Failed to load change orders. Please try again.'));
    }finally{
      setLoading(false);
    }
  },[projectId]);

  useEffect(()=>{ load(); },[load]);

  // Dead-space kill (spec 4.1): an empty log opens straight into the composer
  // (CO number pre-assigned, contract position live). One-shot per visit so
  // Cancel stays cancelled.
  const autoOpenedRef = useRef(false);
  useEffect(()=>{
    if(!loading && cos.length===0 && !autoOpenedRef.current){
      autoOpenedRef.current = true;
      setShowForm(true);
    }
  },[loading, cos.length]);

  /** POST the composer — shared by the Create button and the guard's "Save & leave". */
  async function submitCO(): Promise<boolean>{
    if(!fTitle.trim()){ setError('Title is required.'); return false; }
    setSaving(true); setError('');
    try{
      const r = await fetch('/api/change-orders/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        projectId,title:fTitle,description:fDesc,reason:fReason,
        costImpact:parseFloat(fCost)||0,scheduleImpact:parseFloat(fSchedule)||0,
        relatedBidPackageId:fRelatedPkg||null,
      })});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setFTitle(''); setFDesc(''); setFReason(''); setFCost(''); setFSchedule(''); setFRelatedPkg('');
      setShowForm(false);
      await load();
      return true;
    }catch(e:any){
      console.error(e); setError(humanError(e, 'Failed to create the change order. Please try again.'));
      return false;
    }finally{
      setSaving(false);
    }
  }

  async function createCO(){
    if(await submitCO()) guard.clearDraft();
  }

  async function approveCO(id:string){
    setApprovingId(id);
    try{
      const r = await fetch(`/api/change-orders/${id}/approve`,{method:'POST',headers:{'Content-Type':'application/json'}});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setCos(prev=>prev.map(c=>c.id===id?{...c,status:'approved'}:c));
      setToast({msg:'Change order approved.',type:'success'});
    }catch(e:any){
      console.error(e); setToast({msg:humanError(e, 'Failed to approve the change order. Please try again.'),type:'error'});
    }finally{
      setApprovingId(null);
    }
  }

  async function rejectCO(id:string){
    if(!(await confirmDialog({ title: 'Reject change order?', message: 'This marks the change order rejected.', confirmLabel: 'Reject', danger: true }))) return;
    setApprovingId(id);
    try{
      const r = await fetch(`/api/change-orders/${id}/reject`,{method:'POST',headers:{'Content-Type':'application/json'}});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setCos(prev=>prev.map(c=>c.id===id?{...c,status:'rejected'}:c));
      setToast({msg:'Change order rejected.',type:'success'});
    }catch(e:any){
      console.error(e); setToast({msg:humanError(e, 'Failed to reject the change order. Please try again.'),type:'error'});
    }finally{
      setApprovingId(null);
    }
  }

  function openCoMenu(id: string) { setCoMenuId(id); setCoEditId(null); }

  async function handleEditCO(id: string) {
    const amount = parseFloat(coEditVal);
    if (isNaN(amount)) return;
    setCos(prev => prev.map(c => c.id === id ? { ...c, cost_impact: amount } : c));
    setCoEditId(null);
    try {
      const r = await fetch(`/api/change-orders/${id}/update`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cost_impact: amount }) });
      if (!r.ok) throw new Error('update failed');
      setToast({ msg: 'Cost impact updated.', type: 'success' });
    } catch {
      setToast({ msg: 'Could not update the change order. Please try again.', type: 'error' });
      load();
    }
  }

  function handleCopyCO(id: string, amount: number) {
    navigator.clipboard.writeText(fmt(amount)).catch(() => {});
    setCoCopiedId(id); setTimeout(() => setCoCopiedId(null), 2000);
    setCoMenuId(null);
  }

  async function handleDeleteCO(id: string) {
    setCos(prev => prev.filter(c => c.id !== id));
    setCoMenuId(null);
    try {
      const r = await fetch(`/api/change-orders/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Delete failed');
      setToast({msg:'Change order deleted.',type:'success'});
    } catch { setToast({msg:'Failed to delete the change order. Please try again.',type:'error'}); load(); }
  }

  // Running totals — exact-cents engine. Revised contract = original + APPROVED
  // change orders only; pending tracked separately (summarizeContract enforces this).
  const contractSummary = summarizeContract(
    toCents(contractSum),
    cos.map((c:any)=>({ id:String(c.id), description:c.title||'', amount:toCents(c.cost_impact||0), status:(c.status||'pending') as 'pending'|'approved'|'rejected' })),
  );
  const approvedCOs   = toDollars(contractSummary.approvedChangeOrders);
  const pendingCOs    = toDollars(contractSummary.pendingChangeOrders);
  const currentContract = toDollars(contractSummary.revisedContract);

  // SmartCreate intelligence — the form walks in knowing the CO history, bid
  // packages, and schedule. cost_impact is TEXT in the DB: Number() everything.
  const approvedCount  = cos.filter(c=>c.status==='approved').length;
  const pendingCount   = cos.filter(c=>c.status==='pending').length;
  const lastCo         = cos.length>0 ? cos[cos.length-1] : null;
  const nextCoNumber   = Math.max(cos.reduce((m,c)=>Math.max(m,Number(c.co_number)||0),0)+1, Number(ctx?.defaults?.nextCoNumber)||1);
  const fCostNum       = Number(fCost)||0;
  const fSchedNum      = Number(fSchedule)||0;
  const newContractSum = toDollars(contractSummary.revisedContract + toCents(fCostNum));
  const bidPkgs        = (ctx?.bidPackages||[]) as any[];
  const selectedPkg    = bidPkgs.find(b=>b.id===fRelatedPkg) || null;
  const projEnd        = ctx?.project?.endDate ? String(ctx.project.endDate) : null;
  const pushedEnd      = projEnd && fSchedNum>0 ? new Date(new Date(projEnd.slice(0,10)+'T00:00:00').getTime()+fSchedNum*86400000) : null;

  // Toolbar-driven view of the CO log (search matches CO number, title, reason).
  const coQ = coSearch.trim().toLowerCase();
  const filteredCos = cos.filter((c:any)=>{
    if (coStatusFilter !== 'all' && String(c.status||'pending') !== coStatusFilter) return false;
    if (!coQ) return true;
    return [c.title, c.description, c.reason, `co-${padCo(c.co_number)}`].some(v => String(v||'').toLowerCase().includes(coQ));
  });

  return (
    <>
      {toast && (
        <div style={{position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',zIndex:99999,padding:'12px 20px',borderRadius:'8px',background:toast.type==='success'?'rgba(44,255,122,0.9)':'rgba(255,59,48,0.9)',color:'#fff',fontWeight:600,fontSize:'14px',pointerEvents:'none'}}>
          {toast.msg}
        </div>
      )}

      <PremiumSurface maxWidth={2200}>

        {/* Header */}
        <ModuleHero
          eyebrow="Cost Control"
          eyebrowIcon={<Clipboard size={13} weight="fill" color={moduleAccent('changeorders').hex} />}
          title="Change"
          accent="Orders"
          subtitle={loading ? 'Loading…' : `${cos.length} change order${cos.length!==1?'s':''} — track scope changes, owner requests, and unforeseen conditions.`}
          note="Price it before you build it"
          actions={
            <button onClick={()=>{ if(showForm) closeCoForm(); else setShowForm(true); }} style={goldButtonStyle} className="pmBtn">
              {showForm
                ? <><X size={15} weight="bold" /> Cancel</>
                : <><Plus size={15} weight="bold" /> New Change Order</>}
            </button>
          }
        />

        {/* Contract intelligence strip — what the system already knows */}
        {(ctx || !loading) && (
          <StatStrip items={[
            {href: `/app/projects/${projectId}/contracts`, label:'Original Contract', value:fmt(contractSum), sub:'Prime contract baseline'},
            {href: `/app/projects/${projectId}/change-orders`, label:'Approved COs', value:(approvedCOs>=0?'+':'')+fmt(approvedCOs), accent:approvedCOs>0?'#2CFF7A':approvedCOs<0?RED:undefined, sub:`${approvedCount} approved`},
            {href: `/app/projects/${projectId}/change-orders`, label:'Pending COs', value:(pendingCOs>=0?'+':'')+fmt(pendingCOs), accent:pendingCount>0?GOLD:undefined, sub:pendingCount>0?`${pendingCount} awaiting decision`:'None awaiting decision'},
            {href: `/app/projects/${projectId}/contracts`, label:'Revised Contract', value:fmt(currentContract), accent:GOLD, sub:'Original + approved COs'},
            {href: `/app/projects/${projectId}/change-orders`, label:'Next CO', value:`CO-${padCo(nextCoNumber)}`, sub:lastCo?`Follows CO-${padCo(lastCo.co_number)}`:'First on this project'},
          ]}/>
        )}

        {/* Create Form — walks in knowing the contract, CO history, and bid packages */}
        {showForm && (
          <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 340px',gap:22,alignItems:'start',marginBottom:24}}>
            <SectionCard title={`New Change Order — CO-${padCo(nextCoNumber)}`} icon={<Plus size={17} weight="duotone" color={GOLD} />}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
                <div>
                  <label style={LBL}>CO Number<AutoChip/></label>
                  <input value={`CO-${padCo(nextCoNumber)}`} readOnly style={{...INP,color:GOLD,fontWeight:800,cursor:'default'}}/>
                  <div style={HINT}>{lastCo ? `Assigned automatically — follows CO-${padCo(lastCo.co_number)}.` : 'Assigned automatically — first change order on this project.'}</div>
                </div>
                <div>
                  <label style={LBL}>Related Bid Package</label>
                  <select value={fRelatedPkg} onChange={e=>setFRelatedPkg(e.target.value)} style={{...INP,cursor:'pointer'}}>
                    <option value="">None — prime contract / general</option>
                    {bidPkgs.map(b=>(<option key={b.id} value={b.id}>{b.name}{b.trade?` — ${b.trade}`:''}</option>))}
                  </select>
                  <div style={HINT}>
                    {selectedPkg
                      ? <>Awarded{selectedPkg.awardedTo?` to ${selectedPkg.awardedTo}`:''} at <b style={{color:TEXT}}>{fmt(Number(selectedPkg.awardedAmount)||0)}</b>{Number(selectedPkg.budgetEstimate)>0 && <> vs {fmt(Number(selectedPkg.budgetEstimate)||0)} budgeted</>}{selectedPkg.csiDivision?` — Div ${selectedPkg.csiDivision}`:''}.</>
                      : bidPkgs.length>0 ? `Optional — ties this CO to one of the ${bidPkgs.length} bid packages so the budget sync lands on the right scope.` : 'No bid packages on this project yet — the CO posts against the prime contract.'}
                  </div>
                </div>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={LBL}>Title *</label>
                  <input value={fTitle} onChange={e=>setFTitle(e.target.value)} placeholder="e.g. Add electrical outlets in server room" style={INP}/>
                </div>
                <div>
                  <label style={LBL}>Cost Impact ($)</label>
                  <input type="number" value={fCost} onChange={e=>setFCost(e.target.value)} placeholder="0" style={INP}/>
                  <div style={HINT}>
                    New contract sum: <b style={{color:fCostNum>0?'#2CFF7A':fCostNum<0?RED:TEXT}}>{fmt(newContractSum)}</b> — {fmt(contractSum)} original{approvedCOs!==0 && <> {approvedCOs>0?'+':'-'} {fmt(Math.abs(approvedCOs))} approved COs</>} + this CO. Enter a negative number for credits.
                  </div>
                </div>
                <div>
                  <label style={LBL}>Schedule Impact (days)</label>
                  <input type="number" value={fSchedule} onChange={e=>setFSchedule(e.target.value)} placeholder="0" style={INP}/>
                  <div style={HINT}>
                    {pushedEnd
                      ? <>Pushes completion from {fmtDate(projEnd)} to <b style={{color:ORANGE}}>{pushedEnd.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</b>.</>
                      : Number(ctx?.schedule?.criticalCount)>0
                        ? `${Number(ctx?.schedule?.criticalCount)||0} critical task${Number(ctx?.schedule?.criticalCount)===1?'':'s'} on the schedule — added days land on the critical path.`
                        : 'Days added to the project completion date, if any.'}
                  </div>
                </div>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={LBL}>Reason</label>
                  <Suggest value={fReason} onChange={e=>setFReason(e.target.value)} placeholder="e.g. Owner request, unforeseen conditions" style={INP} options={['Owner request', 'Unforeseen conditions', 'Design change', 'Code compliance', 'Material substitution', 'Allowance reconciliation']} />
                  </div>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={LBL}>Description</label>
                  <textarea value={fDesc} onChange={e=>setFDesc(e.target.value)} rows={3} placeholder="Describe the change in detail…"
                    style={{...INP,resize:'vertical' as const}}/>
                </div>
              </div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                <button onClick={createCO} disabled={saving||!fTitle.trim()}
                  style={{...goldButtonStyle,cursor:saving?'wait':'pointer',opacity:(saving||!fTitle.trim())?0.6:1}} className="pmBtn">
                  {saving ? 'Creating…' : 'Create Change Order'}
                </button>
                <button onClick={closeCoForm}
                  style={ghostButtonStyle} className="pmBtn">
                  Cancel
                </button>
                <button
                  onClick={()=>analyzeRisk({title:fTitle,description:fDesc,reason:fReason,cost_impact:parseFloat(fCost)||0,schedule_impact:parseFloat(fSchedule)||0},'form')}
                  disabled={(riskLoading&&riskTarget==='form')||!fTitle.trim()}
                  style={{...goldOutlineButtonStyle,opacity:!fTitle.trim()?0.5:1}} className="pmBtn">
                  <Robot size={15} color={GOLD} weight="regular" />
                  {riskLoading&&riskTarget==='form' ? 'Analyzing…' : 'Analyze Risk'}
                </button>
              </div>
              {riskTarget==='form' && riskError && (
                <div style={{marginTop:10,padding:'8px 12px',background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:7,color:RED,fontSize:12}}>{riskError}</div>
              )}
              {riskTarget==='form' && riskResult && (
                <AIRiskPanel result={riskResult} onClose={()=>{setRiskResult(null);setRiskTarget(null);}} />
              )}
            </SectionCard>

            {/* Context rail — live contract position, prior CO, downstream automation */}
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <SectionCard flat title="Contract Position" icon={<CurrencyDollar size={17} weight="duotone" color={GOLD} />}>
                <InsightRow label="Original Contract" value={fmt(contractSum)}/>
                <InsightRow label={`Approved COs (${approvedCount})`} value={(approvedCOs>=0?'+':'')+fmt(approvedCOs)} accent={approvedCOs>0?'#2CFF7A':undefined}/>
                {pendingCount>0 && <InsightRow label={`Pending COs (${pendingCount})`} value={(pendingCOs>=0?'+':'')+fmt(pendingCOs)} accent={GOLD}/>}
                <InsightRow label="This CO" value={(fCostNum>=0?'+':'')+fmt(fCostNum)} accent={fCostNum>0?ORANGE:fCostNum<0?RED:undefined}/>
                <div style={{height:1,background:'rgba(255,255,255,0.08)',margin:'8px 0'}}/>
                <InsightRow label="New Contract Sum" value={fmt(newContractSum)} accent={GREEN} strong/>
                {fSchedNum>0 && <InsightRow label="Schedule Impact" value={`+${fSchedNum} day${fSchedNum===1?'':'s'}`} accent={ORANGE}/>}
              </SectionCard>
              {lastCo && (
                <SectionCard flat title={`Last CO — CO-${padCo(lastCo.co_number)}`} icon={<ClockCounterClockwise size={17} weight="duotone" color={GOLD} />}>
                  <InsightRow label="Title" value={<span style={{display:'inline-block',maxWidth:170,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',verticalAlign:'bottom'}}>{lastCo.title||'—'}</span>}/>
                  <InsightRow label="Status" value={String(lastCo.status||'pending').replace(/^\w/,(c:string)=>c.toUpperCase())} accent={statusStyle(lastCo.status||'pending').c}/>
                  <InsightRow label="Cost Impact" value={(Number(lastCo.cost_impact||0)>=0?'+':'')+fmt(Number(lastCo.cost_impact)||0)} accent={Number(lastCo.cost_impact||0)>0?ORANGE:undefined}/>
                  <InsightRow label="Schedule" value={Number(lastCo.schedule_impact||0)>0?`+${Number(lastCo.schedule_impact)||0} days`:'—'}/>
                </SectionCard>
              )}
              <SectionCard flat title="After You Submit" icon={<CheckCircle size={17} weight="duotone" color={GOLD} />}>
                <FlowSteps title="" steps={[
                  {title:'CO Logged as Pending', desc:`Numbered CO-${padCo(nextCoNumber)} automatically and queued for a decision.`},
                  {title:'Owner Approval', desc:'Approve or reject right from this list — status flips instantly.'},
                  {title:'Contract Sum Auto-Updates', desc:`On approval the revised contract and prime contract move to ${fmt(newContractSum)} on their own.`},
                  {title:'Budget Line Syncs', desc:'The matching budget line absorbs the approved amount — nothing re-typed in Budget.'},
                ]}/>
              </SectionCard>
            </div>
          </div>
        )}

      {/* Error */}
      {error && (
        <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'12px 16px',marginBottom:20,color:RED,fontSize:13}}>
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
        <StatCard icon={<Clipboard size={19} weight="duotone" color={moduleAccent('changeorders').hex} />} label="Total COs" value={String(cos.length)} delay={0.02}  href={`/app/projects/${projectId}/change-orders`}/>
        <StatCard icon={<Warning size={19} weight="duotone" color={GOLD} />} label="Pending" value={String(cos.filter(c=>c.status==='pending').length)} accent={GOLD} delay={0.06}  href={`/app/projects/${projectId}/change-orders`}/>
        <StatCard icon={<CheckCircle size={19} weight="duotone" color="#2CFF7A" />} label="Approved" value={String(cos.filter(c=>c.status==='approved').length)} accent="#2CFF7A" delay={0.10}  href={`/app/projects/${projectId}/change-orders`}/>
        <StatCard icon={<XCircle size={19} weight="duotone" color={RED} />} label="Rejected" value={String(cos.filter(c=>c.status==='rejected').length)} accent={RED} delay={0.14}  href={`/app/projects/${projectId}/change-orders`}/>
      </div>

        {/* Loading */}
        {loading && <div style={{padding:40,textAlign:'center' as const,color:DIM}}>Loading change orders…</div>}

        {/* Empty — the composer above IS the zero state; the strip shows the CO lifecycle */}
        {!loading && cos.length===0 && (
          <SectionCard>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:12}}>
              <div style={{fontSize:13.5,fontWeight:800,color:TEXT}}>
                <Clipboard size={16} weight="duotone" color={GOLD} style={{marginRight:7,verticalAlign:'text-bottom'}} />
                No Change Orders Yet
                <span style={{fontWeight:400,color:DIM}}>{showForm ? ` — CO-${padCo(nextCoNumber)} is numbered and ready in the form above.` : ' — log scope changes, owner requests, and unforeseen conditions.'}</span>
              </div>
              {!showForm && (
                <button onClick={()=>setShowForm(true)} style={goldButtonStyle} className="pmBtn">
                  <Plus size={15} weight="bold" /> New Change Order
                </button>
              )}
            </div>
            <FlowStrip steps={[
              {title:'Log the CO',desc:'Numbered automatically'},
              {title:'Pending Decision',desc:'Approve or reject inline'},
              {title:'Contract Sum Updates',desc:'On approval, automatically'},
              {title:'Budget Line Syncs',desc:'Nothing re-typed'},
            ]} />
          </SectionCard>
        )}

        {/* Table */}
        {!loading && cos.length>0 && (<>
          <ListToolbar
            module="change-orders"
            search={coSearch}
            onSearch={setCoSearch}
            searchPlaceholder="Search change orders…"
            filters={[{ key: 'status', label: 'Status', value: coStatusFilter, onChange: setCoStatusFilter, allLabel: 'All Statuses', options: [
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ] }]}
            count={{ shown: filteredCos.length, total: cos.length }}
            style={{ marginBottom: 16 }}
          />
          <SectionCard title="Change Orders" icon={<Clipboard size={17} weight="duotone" color={moduleAccent('changeorders').hex} />} flush>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
              <thead>
                <tr style={{background:DARK}}>
                  {['CO #','Title','Status','Cost Impact','Schedule Impact','Reason','Actions'].map(h=>(
                    <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700, color:DIM,borderBottom:`1px solid ${BORDER}`}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCos.map((co:any)=>{
                  const st = statusStyle(co.status||'pending');
                  const cost = Number(co.cost_impact||0);
                  return (
                    <React.Fragment key={co.id}>
                    <tr style={{borderBottom:`1px solid rgba(255,255,255,0.12)`}}>
                      <td style={{padding:'12px 14px',color:GOLD,fontWeight:800}}>CO-{String(co.co_number).padStart(3,'0')}</td>
                      <td style={{padding:'12px 14px',color:TEXT,maxWidth:240}}>
                        <div style={{fontWeight:600}}>{co.title}</div>
                        {co.description && <div style={{fontSize:11,color:DIM,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,maxWidth:230}}>{co.description}</div>}
                      </td>
                      <td style={{padding:'12px 14px'}}>
                        <StatusPill module="change_orders" status={co.status||'pending'} size="sm" />
                      </td>
                      <td style={{padding:'12px 14px',position:'relative' as const}}>
                        {coEditId===co.id ? (
                          <div style={{display:'flex',alignItems:'center',gap:4}}>
                            <input value={coEditVal} onChange={e=>setCoEditVal(e.target.value)} type="number" autoFocus onKeyDown={e=>{if(e.key==='Enter')handleEditCO(co.id);if(e.key==='Escape')setCoEditId(null);}} style={{width:100,padding:'4px 8px',background:'var(--bg-surface-2)',border:`1px solid ${GOLD}`,borderRadius:5,color:TEXT,fontSize:12,outline:'none',textAlign:'right' as const}}/>
                            <button onClick={()=>handleEditCO(co.id)} style={{padding:'3px 8px',background:`linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`,border:'none',borderRadius:5,color:'#0A0A00',fontSize:11,fontWeight:700,cursor:'pointer'}}>Save</button>
                            <button onClick={()=>setCoEditId(null)} style={{padding:'3px 8px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,cursor:'pointer'}}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{display:'flex',alignItems:'center',gap:4}}>
                            <span style={{color:cost>0?ORANGE:cost<0?RED:DIM,fontWeight:700}}>{cost>=0?'+':''}{fmt(cost)}</span>
                            {coCopiedId===co.id&&<span style={{fontSize:10,color:'#2CFF7A',fontWeight:600}}>Copied!</span>}
                            <button onClick={()=>openCoMenu(co.id)} style={{background:'none',border:'none',color:DIM,cursor:'pointer',fontSize:10,padding:'2px 4px',lineHeight:1,opacity:0.6}} onMouseEnter={e=>(e.currentTarget.style.opacity='1')} onMouseLeave={e=>(e.currentTarget.style.opacity='0.6')}><CaretDown size={10} color={DIM} weight="regular" /></button>
                            {coMenuId===co.id&&(
                              <div style={{position:'absolute',top:36,right:14,background:RAISED,border:`1px solid ${BORDER}`,borderRadius:'var(--radius-md)',padding:6,zIndex:100,minWidth:150,boxShadow:'var(--shadow-lg)'}}>
                                {[
                                  {label:'Edit Amount',icon:<PencilSimple size={14} color={TEXT} weight="regular" />,action:()=>{setCoMenuId(null);setCoEditId(co.id);setCoEditVal(String(co.cost_impact||0));}},
                                  {label:'Copy Amount',icon:<Copy size={14} color={TEXT} weight="regular" />,action:()=>handleCopyCO(co.id,co.cost_impact||0)},
                                ].map(item=>(
                                  <div key={item.label} onClick={item.action} style={{padding:'7px 12px',fontSize:12,color:TEXT,cursor:'pointer',borderRadius:6,display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.06)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                                    <span style={{fontSize:14,display:'inline-flex',alignItems:'center'}}>{item.icon}</span>{item.label}
                                  </div>
                                ))}
                                <div style={{height:1,background:BORDER,margin:'4px 0'}}/>
                                <div onClick={async ()=>{if(await confirmDialog({ title: 'Delete change order?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))handleDeleteCO(co.id);}} style={{padding:'7px 12px',fontSize:12,color:RED,cursor:'pointer',borderRadius:6,display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(192,48,48,.08)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                                  <span style={{fontSize:14,display:'inline-flex',alignItems:'center'}}><Trash size={14} color={RED} weight="regular" /></span>Delete
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{padding:'12px 14px',color:(co.schedule_impact||0)>0?ORANGE:DIM}}>
                        {(co.schedule_impact||0)>0 ? `+${co.schedule_impact} days` : '—'}
                      </td>
                      <td style={{padding:'12px 14px',color:DIM,maxWidth:150}}>
                        <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{co.reason||'—'}</div>
                      </td>
                      <td style={{padding:'12px 14px'}}>
                        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                          {co.status==='pending' && (
                            <>
                              <button onClick={()=>approveCO(co.id)} disabled={approvingId===co.id}
                                style={{background:`linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`,border:'none',borderRadius:5,color:'#0A0A00',fontSize:11,padding:'4px 12px',fontWeight:800,cursor:approvingId===co.id?'wait':'pointer',opacity:approvingId===co.id?0.6:1}}>
                                {approvingId===co.id ? '…' : 'Approve'}
                              </button>
                              <button onClick={()=>rejectCO(co.id)} disabled={approvingId===co.id}
                                style={{background:'none',border:`1px solid rgba(192,48,48,.4)`,borderRadius:5,color:RED,fontSize:11,padding:'4px 12px',fontWeight:700,cursor:approvingId===co.id?'wait':'pointer',opacity:approvingId===co.id?0.6:1}}>
                                Reject
                              </button>
                            </>
                          )}
                          {co.status==='approved' && <span style={{fontSize:11,color:'#2CFF7A',fontWeight:700,display:'inline-flex',alignItems:'center',gap:4}}><CheckCircle size={12} color="#2CFF7A" weight="fill" />Approved</span>}
                          {co.status==='rejected' && <span style={{fontSize:11,color:RED,fontWeight:700,display:'inline-flex',alignItems:'center',gap:4}}><XCircle size={12} color={RED} weight="fill" />Rejected</span>}
                          <button
                            onClick={()=>{
                              if(riskTarget===co.id&&riskResult){setRiskResult(null);setRiskTarget(null);}
                              else analyzeRisk({title:co.title,description:co.description,reason:co.reason,cost_impact:co.cost_impact,schedule_impact:co.schedule_impact,status:co.status},co.id);
                            }}
                            disabled={riskLoading&&riskTarget===co.id}
                            style={{background:'var(--brand-primary-08)',border:`1px solid var(--brand-primary-25)`,borderRadius:5,color:GOLD,fontSize:11,padding:'4px 10px',fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
                            <Robot size={12} color={GOLD} weight="regular" />
                            {riskLoading&&riskTarget===co.id ? '…' : 'Risk'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {riskTarget===co.id && (riskResult||riskError) && (
                      <tr>
                        <td colSpan={7} style={{padding:'0 14px 14px'}}>
                          {riskError && <div style={{padding:'8px 12px',background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:7,color:RED,fontSize:12}}>{riskError}</div>}
                          {riskResult && <AIRiskPanel result={riskResult} onClose={()=>{setRiskResult(null);setRiskTarget(null);}} />}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {coMenuId&&<div style={{position:'fixed',inset:0,zIndex:50}} onClick={()=>setCoMenuId(null)}/>}
            </table>
          </div>
          </SectionCard>
        </>)}
      </PremiumSurface>

      <UnsavedGuardModal guard={guard} />
    </>
  );
}
