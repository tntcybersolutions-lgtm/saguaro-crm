'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { CheckCircle, Hourglass, Lightning, FileText, DownloadSimple, Receipt } from '@phosphor-icons/react';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, StatStrip, FlowSteps, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { SortableTh, usePersistedSort, useSortedRows } from '@/app/app/_shared/table-sort';

const GOLD='#F59E0B',DARK='#0a0a0a',RAISED='#141416',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF',GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A';
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

const WAIVER_TYPES = [
  {key:'conditional_partial',   label:'Conditional Progress'},
  {key:'unconditional_partial', label:'Unconditional Progress'},
  {key:'conditional_final',     label:'Conditional Final'},
  {key:'unconditional_final',   label:'Unconditional Final'},
];
// The pay-app approval cascade writes waiver_type 'conditional_progress' and the
// mark-paid conversion writes 'unconditional_progress' — the same instruments as
// the manual "partial" types. Normalize so auto-generated waivers land in the
// matrix instead of vanishing into unmapped columns.
const TYPE_ALIAS:Record<string,string> = {
  conditional_progress:'conditional_partial',
  unconditional_progress:'unconditional_partial',
};
const normalizeType = (t:string)=>TYPE_ALIAS[t]||t;
const typeLabel = (t:string)=>WAIVER_TYPES.find(x=>x.key===normalizeType(t))?.label||t;

const INP:React.CSSProperties = {padding:'8px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',width:'100%',boxSizing:'border-box'};
const LBL:React.CSSProperties = {display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:6};
const HINT:React.CSSProperties = {fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:5,lineHeight:1.45};
const fmtDate = (d?:string|null) => d ? new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

type WaiverStatus = 'signed'|'pending'|null;

interface MatrixRow {
  subId: string;
  subName: string;
  waivers: Record<string,{id:string,status:string,pdf_url?:string}|null>;
}

function buildMatrix(waivers:any[]):MatrixRow[]{
  const bySubId:Record<string,MatrixRow> = {};
  for(const w of waivers){
    const subId   = w.sub_id||w.subId||w.id;
    const subName = (w.subcontractors as any)?.company_name||(w.subcontractors as any)?.name||w.company_name||w.claimant_name||w.sub_name||'Unknown';
    if(!bySubId[subId]){
      bySubId[subId] = {subId,subName,waivers:{}};
    }
    bySubId[subId].waivers[normalizeType(w.waiver_type)] = {id:w.id,status:w.status,pdf_url:w.pdf_url};
  }
  return Object.values(bySubId);
}

function CellIcon({status,pdfUrl}:{status:string|undefined|null,pdfUrl?:string}){
  if(status==='signed'){
    return (
      <div style={{display:'flex',flexDirection:'column' as const,alignItems:'center',gap:4}}>
        <span style={{display:'inline-flex',color:'#3dd68c'}}><CheckCircle size={16} weight="fill" color="#3dd68c" /></span>
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noreferrer"
            style={{fontSize:10,color:GOLD,textDecoration:'none',padding:'2px 7px',border:`1px solid rgba(245, 158, 11,.3)`,borderRadius:4}}>
            PDF
          </a>
        )}
      </div>
    );
  }
  if(status==='pending'){
    return <span style={{display:'inline-flex',verticalAlign:'middle',color:'#f59e0b'}} title="Pending signature"><Hourglass size={16} weight="fill" color="#f59e0b" /></span>;
  }
  return <span style={{fontSize:14,color:BORDER}}>—</span>;
}

export default function LienWaiversPage() {
  const params    = useParams();
  const projectId = params['projectId'] as string;

  const [waivers,setWaivers]   = useState<any[]>([]);
  const [loading,setLoading]   = useState(true);
  const [error,setError]       = useState('');
  const [showForm,setShowForm] = useState(false);
  const [generating,setGenerating] = useState(false);
  const [genAll,setGenAll]     = useState(false);

  // form
  const [fType,setFType]         = useState('conditional_partial');
  const [fState,setFState]       = useState('AZ');
  const [fClaimant,setFClaimant] = useState('');
  const [fAmount,setFAmount]     = useState('');
  const [fThrough,setFThrough]   = useState(new Date().toISOString().slice(0,10));
  const [fSubId,setFSubId]       = useState('');
  const [fPayAppId,setFPayAppId] = useState('');
  const [autoAmt,setAutoAmt]     = useState(false);

  // ListToolbar state — filters persist per module via sag_flt_lien-waivers.
  const [wSearch,setWSearch] = useState('');
  const [wStatusFilter,setWStatusFilter] = useState('all');
  const [wTypeFilter,setWTypeFilter] = useState('all');

  // Project intelligence — one snapshot (roster + money) plus the pay-app list,
  // so every waiver can name the application it gates.
  const { ctx } = useProjectContext(projectId);
  const [payApps,setPayApps] = useState<any[]>([]);
  useEffect(()=>{
    (async()=>{
      try{
        const r = await fetch(`/api/pay-apps/list?projectId=${projectId}`);
        const d = await r.json();
        setPayApps(Array.isArray(d.payApps)?d.payApps:[]);
      }catch{}
    })();
  },[projectId]);

  const load = useCallback(async()=>{
    setLoading(true); setError('');
    try{
      const r = await fetch(`/api/lien-waivers/list?projectId=${projectId}`);
      if(!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setWaivers(d.lienWaivers??[]);
    }catch(e:any){
      console.error(e); setError(humanError(e, 'Failed to load lien waivers. Please try again.'));
    }finally{
      setLoading(false);
    }
  },[projectId]);

  useEffect(()=>{ load(); },[load]);

  async function generate(){
    if(!fClaimant.trim()||!fAmount||!fThrough){ setError('Claimant, amount, and through date are required'); return; }
    setGenerating(true); setError('');
    try{
      const r = await fetch('/api/lien-waivers/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        projectId,waiverType:fType,state:fState,claimantName:fClaimant,amount:parseFloat(fAmount)||0,throughDate:fThrough,
        ...(fSubId?{subId:fSubId}:{}),...(fPayAppId?{payAppId:fPayAppId}:{}),
      })});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setFClaimant(''); setFAmount(''); setFThrough(new Date().toISOString().slice(0,10));
      setFSubId(''); setFPayAppId(''); setAutoAmt(false);
      setShowForm(false);
      await load();
    }catch(e:any){
      console.error(e); setError(humanError(e, 'Failed to generate the lien waiver. Please try again.'));
    }finally{
      setGenerating(false);
    }
  }

  async function generateAll(){
    setGenAll(true);
    try{
      /* Generate a conditional partial for every sub on the roster that does
         not already have one. This used to walk buildMatrix(waivers) — rows
         derived from waivers that already exist — so on a project with none
         the loop body never ran: the button said "Generating…", finished, and
         produced nothing, with no error to explain it. The roster is the right
         source; existing waivers are what we skip against. */
      const covered = new Set(
        buildMatrix(waivers)
          .filter(r => r.waivers['conditional_partial'])
          .map(r => r.subId)
      );
      const targets = subs.filter((sub: any) => !covered.has(sub.id));
      if(targets.length === 0){
        setError(subs.length === 0
          ? 'No subcontractors on this project yet — add subs before generating waivers.'
          : 'Every sub already has a conditional partial for this period.');
        return;
      }
      for(const sub of targets){
        await fetch('/api/lien-waivers/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          projectId,waiverType:'conditional_partial',claimantName:sub.companyName||sub.name||'',throughDate:fThrough,amount:0,subId:sub.id,
        })});
      }
      await load();
    }catch(e:any){
      console.error(e); setError(humanError(e, 'Failed to generate all waivers. Please try again.'));
    }finally{
      setGenAll(false);
    }
  }

  const matrix = buildMatrix(waivers);
  const signed  = waivers.filter(w=>w.status==='signed').length;
  const pending = waivers.filter(w=>w.status==='pending'||w.status==='sent').length;
  // Unsigned waivers with blocks_payment !== false hold mark-paid on their pay app.
  const blocking = waivers.filter(w=>(w.status==='pending'||w.status==='sent')&&w.blocks_payment!==false&&w.pay_application_id).length;
  const waiverTotal = waivers.reduce((s,w)=>s+(Number(w.amount)||0),0);
  // Toolbar-driven view of the All Waivers table (matrix stays a full-coverage view).
  const wq = wSearch.trim().toLowerCase();
  const filteredWaivers = waivers.filter((w:any)=>{
    const st = w.status==='sent' ? 'pending' : String(w.status||'pending');
    if (wStatusFilter!=='all' && st!==wStatusFilter) return false;
    if (wTypeFilter!=='all' && normalizeType(String(w.waiver_type||''))!==wTypeFilter) return false;
    if (!wq) return true;
    const claimant = w.claimant_name||(w.subcontractors as any)?.company_name||(w.subcontractors as any)?.name||'';
    return [claimant, typeLabel(w.waiver_type), w.state].some(v=>String(v||'').toLowerCase().includes(wq));
  });
  const subs = (ctx?.subs||[]) as any[];
  const lastApp = ctx?.money?.lastPayApp||null;
  const appNoById:Record<string,number> = {};
  for(const pa of payApps){ if(pa?.id) appNoById[pa.id] = Number(pa.app_number)||0; }

  // Sortable columns on the All Waivers table (R11 sweep) — money sorts on the
  // coerced number, through-date on the raw ISO date, claimant on what renders.
  const { sort: wSort, cycleSort: wCycleSort } = usePersistedSort('lien-waivers-all', { key: 'through', dir: 'desc' });
  const sortedWaivers = useSortedRows(filteredWaivers, wSort, (w:any, key:string) => {
    switch (key) {
      case 'claimant': return w.claimant_name||(w.subcontractors as any)?.company_name||(w.subcontractors as any)?.name||null;
      case 'type':     return typeLabel(w.waiver_type);
      case 'app':      return w.pay_application_id ? (appNoById[w.pay_application_id]||null) : null;
      case 'state':    return w.state||null;
      case 'amount':   return Number(w.amount)||0;
      case 'through':  return w.through_date?String(w.through_date).slice(0,10):null;
      case 'status':   return w.status==='sent'?'pending':(w.status||'pending');
      default:         return w[key];
    }
  });
  const selSub = subs.find(s=>s.id===fSubId);
  const selPa  = payApps.find(p=>p.id===fPayAppId);
  const rosterTotal = subs.reduce((t,s)=>t+(Number(s.contractAmount)||0),0);
  const suggestedShare = selSub&&selPa&&rosterTotal>0
    ? Math.round(((Number(selSub.contractAmount)||0)/rosterTotal)*(Number(selPa.current_payment_due)||0)*100)/100
    : 0;

  return (
    <PremiumSurface maxWidth={1600}>
      {/* Header */}
      <ModuleHero
        eyebrow="LIEN WAIVERS"
        eyebrowIcon={<FileText size={13} weight="fill" color={GOLD} />}
        title="Lien"
        accent="Waivers"
        subtitle={loading
          ? 'Loading lien waivers…'
          : 'State-specific conditional & unconditional waivers by sub — auto-generated when a pay app is approved, gating mark-paid until signed.'}
        actions={<>
          <button onClick={()=>setShowForm(!showForm)} style={goldOutlineButtonStyle} className="pmBtn">
            + Generate Waiver
          </button>
          <button onClick={generateAll} disabled={genAll}
            style={{...goldButtonStyle, cursor:genAll?'wait':'pointer', opacity:genAll?.6:1}} className="pmBtn">
            {genAll ? 'Generating…' : <><Lightning size={14} weight="fill" color="#1A1206" /> Generate All</>}
          </button>
        </>}
      />

      {/* Waiver intelligence strip — coverage, exposure, and what's gating payment */}
      {!loading && waivers.length>0 && (
        <StatStrip items={[
          {label:'Total Waivers', value:String(waivers.length), sub:subs.length>0?`${matrix.length} of ${subs.length} subs covered`:'generated on this project'},
          {label:'Signed', value:String(signed), accent:'#3dd68c', sub:'fully executed'},
          {label:'Pending', value:String(pending), accent:pending>0?'#FBBF24':undefined, sub:'awaiting signature'},
          {label:'Blocking Payment', value:String(blocking), accent:blocking>0?'#ff7070':'#3dd68c', sub:blocking>0?'unsigned — mark-paid is held':'nothing holds mark-paid'},
          {label:'Waiver Value', value:fmt(waiverTotal), sub:'released across all waivers'},
          ...(lastApp?[{label:`Pay App #${lastApp.appNumber}`, value:String(lastApp.status||'—').replace(/_/g,' '), sub:`certified ${fmt(Number(lastApp.currentPaymentDue)||0)}`}]:[]),
        ]}/>
      )}

      {/* Form */}
      {showForm && (
        <div style={{marginBottom:24,display:'grid',gridTemplateColumns:ctx?'minmax(0,1fr) 330px':'1fr',gap:18,alignItems:'start'}}>
          <SectionCard title="Generate Lien Waiver" icon={<FileText size={17} weight="duotone" color={GOLD} />}>
            {error && (
              <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'10px 14px',marginBottom:16,color:RED,fontSize:13}}>{error}</div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:16}}>
              <div>
                <label style={LBL}>Waiver Type</label>
                <select value={fType} onChange={e=>setFType(e.target.value)} style={INP}>
                  {WAIVER_TYPES.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <div style={HINT}>{fType.startsWith('conditional')?'Conditional — effective only once payment clears. Safe to sign before the check.':'Unconditional — effective the moment it is signed. Collect only after payment.'}</div>
              </div>
              <div>
                <label style={LBL}>State</label>
                <select value={fState} onChange={e=>setFState(e.target.value)} style={INP}>
                  {['AZ','CA','TX','NV','CO','FL','WA','OR','UT','NM','OTHER'].map(s=><option key={s}>{s}</option>)}
                </select>
                <div style={HINT}>Statutory language: AZ ARS §33-1008 · CA Civil Code §8132 · TX Prop. Code Ch. 53.</div>
              </div>
              <div>
                <label style={LBL}>Claimant *{!!fSubId && <AutoChip label="ROSTER"/>}</label>
                {subs.length>0 ? (
                  <>
                    <select value={fSubId||'__custom'} onChange={e=>{
                      const v = e.target.value;
                      if(v==='__custom'){ setFSubId(''); }
                      else{ const s = subs.find(x=>x.id===v); setFSubId(v); setFClaimant(s?.companyName||''); }
                    }} style={INP}>
                      <option value="__custom">Other — type a name below…</option>
                      {subs.map((s:any)=><option key={s.id} value={s.id}>{s.companyName}{s.trade?` — ${s.trade}`:''}</option>)}
                    </select>
                    {!fSubId && <input value={fClaimant} onChange={e=>setFClaimant(e.target.value)} placeholder="ABC Electrical LLC" style={{...INP,marginTop:8}}/>}
                  </>
                ) : (
                  <input value={fClaimant} onChange={e=>setFClaimant(e.target.value)} placeholder="ABC Electrical LLC" style={INP}/>
                )}
                <div style={HINT}>{subs.length>0?`${subs.length} sub${subs.length===1?'':'s'} on the project roster — picking one links the waiver to their record and the matrix.`:'Subs added to the project roster appear here for one-click selection.'}</div>
              </div>
              <div>
                <label style={LBL}>Amount ($) *{autoAmt && <AutoChip/>}</label>
                <input type="number" value={fAmount} onChange={e=>{setFAmount(e.target.value);setAutoAmt(false);}} placeholder="45000" min="0" style={INP}/>
                {selSub && suggestedShare>0
                  ? <div style={HINT}>App #{selPa.app_number} certified {fmt(Number(selPa.current_payment_due)||0)} — {selSub.companyName}&apos;s pro-rata share is <span onClick={()=>{setFAmount(String(suggestedShare));setAutoAmt(true);}} style={{color:'#FBBF24',fontWeight:700,cursor:'pointer'}}>{fmt(suggestedShare)} — use it</span></div>
                  : selSub && Number(selSub.contractAmount)>0
                    ? <div style={HINT}>{selSub.companyName} contract: <b style={{color:TEXT}}>{fmt(Number(selSub.contractAmount)||0)}</b>. Link a pay app below to compute their pro-rata share.</div>
                    : <div style={HINT}>Dollars released through the date below.</div>}
              </div>
              <div>
                <label style={LBL}>Through Date *</label>
                <SaguaroDatePicker value={fThrough} onChange={setFThrough} style={INP}/>
                {lastApp && <div style={HINT}>Pay App #{lastApp.appNumber} billed through {fmtDate(lastApp.periodTo)}.</div>}
              </div>
              <div>
                <label style={LBL}>Link to Pay App</label>
                <select value={fPayAppId} onChange={e=>setFPayAppId(e.target.value)} style={INP}>
                  <option value="">Not linked</option>
                  {payApps.map((pa:any)=><option key={pa.id} value={pa.id}>App #{pa.app_number} — {String(pa.status||'draft').replace(/_/g,' ')}</option>)}
                </select>
                <div style={HINT}>A linked unsigned waiver gates that application&apos;s mark-paid.</div>
              </div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={generate} disabled={generating}
                style={{...goldButtonStyle, cursor:generating?'wait':'pointer', opacity:generating?.6:1}} className="pmBtn">
                {generating ? 'Generating…' : 'Generate PDF'}
              </button>
              <button onClick={()=>{setShowForm(false);setError('');}} style={ghostButtonStyle} className="pmBtn">
                Cancel
              </button>
            </div>
          </SectionCard>
          {ctx && (
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <SectionCard flat title="How Waivers Flow" icon={<Lightning size={17} weight="duotone" color={GOLD} />}>
                <FlowSteps title="" steps={[
                  {title:'Pay app approved', desc:subs.length>0?`Conditional waivers auto-generate for all ${subs.length} sub${subs.length===1?'':'s'}, each sized to their share of the certified amount.`:'Conditional waivers auto-generate for every sub on the roster, sized to their share.'},
                  {title:'Subs sign via portal', desc:'Each sub gets a secure signing link by email — status flips to signed here.'},
                  {title:'Payment is gated', desc:'Mark-paid on the pay app is blocked while required waivers are unsigned.'},
                  {title:'Unconditionals issue', desc:'On payment, signed conditionals convert to unconditional waivers automatically.'},
                ]}/>
              </SectionCard>
              {lastApp && (
                <SectionCard flat title={`Pay App #${lastApp.appNumber}`} icon={<Receipt size={17} weight="duotone" color={GOLD} />}>
                  <InsightRow label="Status" value={String(lastApp.status||'—').replace(/_/g,' ')}/>
                  <InsightRow label="Certified" value={fmt(Number(lastApp.currentPaymentDue)||0)} accent="#3dd68c" strong/>
                  <InsightRow label="Period to" value={fmtDate(lastApp.periodTo)}/>
                </SectionCard>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error outside form */}
      {error && !showForm && (
        <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'12px 16px',marginBottom:20,color:RED,fontSize:13}}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <SectionCard flat>
          <div style={{padding:'24px 8px',textAlign:'center' as const,color:DIM,fontSize:13}}>Loading lien waivers…</div>
        </SectionCard>
      )}

      {/* Empty */}
      {!loading && waivers.length===0 && (
        <SectionCard flush>
          <div style={{display:'grid',gridTemplateColumns:ctx?'minmax(0,1fr) 360px':'1fr',alignItems:'stretch'}}>
            <PremiumEmpty
              icon={<FileText size={30} weight="duotone" color={GOLD} />}
              title="No lien waivers yet — they mostly write themselves"
              description={subs.length>0
                ? `When a pay application is approved, conditional waivers auto-generate for all ${subs.length} sub${subs.length===1?'':'s'} on the roster — each sized to their share of the certified amount — and mark-paid is gated until they are signed. AZ, CA, and TX statutory forms included.`
                : 'When a pay application is approved, conditional waivers auto-generate for every sub on the roster and gate mark-paid until signed. AZ (ARS §33-1008), CA (Civil Code §8132), TX (Prop. Code Ch. 53) statutory forms included.'}
              action={<button onClick={()=>setShowForm(true)} style={goldButtonStyle} className="pmBtn">+ Generate a Waiver Manually</button>}
            />
            {ctx && (
              <div style={{borderLeft:'1px solid rgba(255,255,255,0.08)',padding:'22px 24px'}}>
                <FlowSteps steps={[
                  {title:'Approve a pay app', desc:lastApp?`App #${lastApp.appNumber} is ${String(lastApp.status||'draft').replace(/_/g,' ')} — approval fires the cascade.`:'Approval fires the waiver cascade.'},
                  {title:'Conditional waivers generate', desc:subs.length>0?`One per sub — ${subs.slice(0,3).map((s:any)=>s.companyName).join(', ')}${subs.length>3?` +${subs.length-3} more`:''}.`:'One per roster sub, sized to their share.'},
                  {title:'Signatures gate payment', desc:'Mark-paid is held until required waivers are signed.'},
                  {title:'Unconditionals on payment', desc:'Signed conditionals convert automatically when the check clears.'},
                ]}/>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Matrix View */}
      {!loading && matrix.length>0 && (
        <>
          <div style={{marginBottom:20}}>
            <SectionCard title="Waiver Matrix" subtitle="Coverage by subcontractor & waiver type" icon={<CheckCircle size={17} weight="duotone" color={GOLD} />} flush>
              <div style={{padding:'14px 20px',fontSize:13,color:DIM,borderBottom:`1px solid rgba(255,255,255,0.06)`,display:'flex',flexWrap:'wrap' as const,gap:16,alignItems:'center'}}>
                <span><span style={{display:'inline-flex',verticalAlign:'middle',color:'#3dd68c'}}><CheckCircle size={14} weight="fill" color="#3dd68c" /></span> Signed</span>
                <span><span style={{display:'inline-flex',verticalAlign:'middle',color:'#f59e0b'}}><Hourglass size={14} weight="fill" color="#f59e0b" /></span> Pending</span>
                <span><span style={{color:BORDER}}>—</span> Not generated</span>
                <span style={{marginLeft:'auto',fontSize:11.5,color:'rgba(255,255,255,0.45)'}}>Conditional waivers auto-generate on pay-app approval and gate mark-paid until signed</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
                  <thead>
                    <tr style={{background:DARK}}>
                      <th style={{padding:'10px 16px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`,minWidth:180}}>
                        Subcontractor
                      </th>
                      {WAIVER_TYPES.map(t=>(
                        <th key={t.key} style={{padding:'10px 16px',textAlign:'center' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`,minWidth:140}}>
                          {t.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map(row=>(
                      <tr key={row.subId} style={{borderBottom:`1px solid rgba(255,255,255,0.12)`}}>
                        <td style={{padding:'14px 16px',color:TEXT,fontWeight:700}}>{row.subName}</td>
                        {WAIVER_TYPES.map(t=>{
                          const w = row.waivers[t.key];
                          return (
                            <td key={t.key} style={{padding:'14px 16px',textAlign:'center' as const}}>
                              <CellIcon status={w?.status} pdfUrl={w?.pdf_url}/>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>

          {/* List of individual waivers */}
          {waivers.length>0 && (<>
            <ListToolbar
              module="lien-waivers"
              search={wSearch}
              onSearch={setWSearch}
              searchPlaceholder="Search waivers..."
              filters={[
                { key: 'status', label: 'Status', value: wStatusFilter, onChange: setWStatusFilter, allLabel: 'All Statuses', options: [
                  { value: 'pending', label: 'Pending' },
                  { value: 'signed', label: 'Signed' },
                ] },
                { key: 'type', label: 'Type', value: wTypeFilter, onChange: setWTypeFilter, allLabel: 'All Types', options: WAIVER_TYPES.map(t => ({ value: t.key, label: t.label })) },
              ]}
              count={{ shown: filteredWaivers.length, total: waivers.length }}
              style={{ marginBottom: 16 }}
            />
            <SectionCard title="All Waivers" icon={<FileText size={17} weight="duotone" color={GOLD} />} flush>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
                  <thead>
                    <tr>
                      {([
                        ['Claimant','claimant'],['Type','type'],['Pay App','app'],['State','state'],
                        ['Amount','amount'],['Through Date','through'],['Status','status'],['Download',undefined],
                      ] as [string, string|undefined][]).map(([h,k])=>(
                        <SortableTh key={h} label={h} sortKey={k} sort={wSort} onSort={wCycleSort} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedWaivers.map((w:any)=>{
                      const wBlocks = (w.status==='pending'||w.status==='sent')&&w.blocks_payment!==false&&w.pay_application_id;
                      const appNo = w.pay_application_id?appNoById[w.pay_application_id]:undefined;
                      return (
                        <tr key={w.id} style={{borderBottom:`1px solid rgba(255,255,255,0.12)`,background:wBlocks?'rgba(192,48,48,.05)':'transparent'}}>
                          <td style={{padding:'10px 14px',color:TEXT,fontWeight:600}}>{w.claimant_name||(w.subcontractors as any)?.company_name||(w.subcontractors as any)?.name||'—'}</td>
                          <td style={{padding:'10px 14px',color:DIM,whiteSpace:'nowrap' as const}}>{typeLabel(w.waiver_type)}{w.converted_from_id?<span style={{marginLeft:6,fontSize:9,fontWeight:800,letterSpacing:'0.06em',color:'#3dd68c'}}>AUTO</span>:null}</td>
                          <td style={{padding:'10px 14px',color:DIM,whiteSpace:'nowrap' as const}}>{appNo?`App #${appNo}`:'—'}{wBlocks?<span style={{marginLeft:6,fontSize:9,fontWeight:800,letterSpacing:'0.06em',color:'#ff7070'}}>GATES PAID</span>:null}</td>
                          <td style={{padding:'10px 14px',color:DIM}}>{w.state||'—'}</td>
                          <td style={{padding:'10px 14px',color:TEXT}}>{fmt(Number(w.amount)||0)}</td>
                          <td style={{padding:'10px 14px',color:DIM}}>{fmtDate(w.through_date?String(w.through_date).slice(0,10):null)}</td>
                          <td style={{padding:'10px 14px'}}>
                            <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,textTransform:'uppercase' as const,
                              background:w.status==='signed'?'rgba(26,138,74,.14)':'rgba(245, 158, 11,.14)',
                              color:w.status==='signed'?'#3dd68c':GOLD}}>
                              {w.status||'pending'}
                            </span>
                          </td>
                          <td style={{padding:'10px 14px'}}>
                            {w.pdf_url && (
                              <a href={`/api/files/open?u=${encodeURIComponent(w.pdf_url || '')}`} target="_blank" rel="noreferrer"
                                style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:GOLD,fontSize:11,padding:'3px 9px',textDecoration:'none',cursor:'pointer'}}>
                                <span style={{display:'inline-flex',alignItems:'center',gap:5,verticalAlign:'middle'}}><DownloadSimple size={12} weight="regular" color={GOLD} /> Download</span>
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </>)}
        </>
      )}
    </PremiumSurface>
  );
}
