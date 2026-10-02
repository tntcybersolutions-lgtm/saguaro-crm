'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import DragHandle, { useDragReorder } from '../../../../../components/DragHandle';
import { Clipboard, ClipboardText, CheckCircle, FileText, CaretDown, PencilSimple, Copy, Trash, Receipt, Plus, Hourglass } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, FlowSteps, InsightRow, goldButtonStyle } from '@/components/ui/premium';
import { SortableTh, usePersistedSort, useSortedRows } from '@/app/app/_shared/table-sort';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { moduleAccent } from '@/lib/module-identity';
import { LifecycleRail } from '@/components/ui/Status';
import { useLiveStatus } from '@/lib/hooks/useLiveStatus';
import NudgeRing from '@/components/intelligence/NudgeRing';
import { ANCHOR_PAY_APPS_DUE } from '@/lib/suggestions';
import { ScribbleNote } from '@/components/Scribble';
import { openPdf } from '@/components/PdfViewer';

const GOLD='#F59E0B',DARK='#0a0a0a',RAISED='#141416',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF',GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A';
const SAGE='#45B37D',AMBER='#F0A63C';
// MONEY: several DB numerics round-trip as strings — coerce before any math/format.
const fmt = (n:number|string|null|undefined) => '$'+((Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

function statusBadge(s:string){
  const map:Record<string,{c:string,bg:string}> = {
    draft:      {c:'#CBD5E1',bg:'rgba(148,163,184,.14)'},
    submitted:  {c:'#4a9de8',bg:'rgba(74,157,232,.14)'},
    approved:   {c:'#3dd68c',bg:'rgba(26,138,74,.14)'},
    certified:  {c:GOLD,    bg:'rgba(245, 158, 11,.14)'},
    paid:       {c:'#3dd68c',bg:'rgba(26,138,74,.14)'},
  };
  const st = map[s]||{c:DIM,bg:'rgba(143,163,192,.12)'};
  return (
    <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:4,background:st.bg,color:st.c,textTransform:'uppercase' as const,letterSpacing:.3}}>
      {s}
    </span>
  );
}

// Lifecycle mini pipeline — draft -> submitted -> approved -> paid (certified rides
// between approved and paid), with waiver coverage under it once the project's lien
// waivers load. Inline primitive: premium.tsx is shared and intentionally untouched.
const STAGE_RANK:Record<string,number> = {draft:0,submitted:1,approved:2,certified:2.5,paid:3};
const STAGE_LABELS = ['Draft','Submitted','Approved','Paid'];
/**
 * The rail that started here now lives in components/ui/Status and is used by
 * every module. This keeps the one thing that is specific to a pay
 * application — waiver coverage, which gates whether payment can be released —
 * and defers everything else to the shared treatment.
 */
function MiniPipeline({status,waivers,since,changed}:{status:string;waivers?:{total:number;signed:number};since?:string|null;changed?:boolean}){
  const allSigned = !!waivers && waivers.total>0 && waivers.signed===waivers.total;
  return (
    <div style={{minWidth:150}}>
      <LifecycleRail module="pay_applications" status={status} since={since} changed={changed} showAction={false}/>
      {waivers && waivers.total>0 && (
        <div style={{fontSize:10,fontWeight:700,color:allSigned?'#3dd68c':AMBER,whiteSpace:'nowrap' as const,marginTop:3}}>
          {waivers.signed}/{waivers.total} waivers signed
        </div>
      )}
    </div>
  );
}

export default function PayAppsPage() {
  const params = useParams();
  const projectId = params['projectId'] as string;
  const router = useRouter();

  const [payApps,setPayApps]   = useState<any[]>([]);
  const [loading,setLoading]   = useState(true);
  const [error,setError]       = useState('');
  const [downloading,setDownloading] = useState<string|null>(null);
  const [toast,setToast] = useState<{msg:string;type:'success'|'error'}|null>(null);
  const [menuId, setMenuId] = useState<string|null>(null);
  const [copiedId, setCopiedId] = useState<string|null>(null);
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  // Project intelligence + waiver coverage — fetched once on mount. The list walks
  // in knowing the contract money and every lien waiver tied to a billing period.
  const { ctx } = useProjectContext(projectId);
  const [waiversByApp,setWaiversByApp] = useState<Record<string,{total:number;signed:number}>>({});
  useEffect(()=>{
    // Both mount reads race in parallel — context never gates waiver coverage.
    Promise.all([
      (async()=>{
        try{
          const r = await fetch(`/api/lien-waivers/list?projectId=${projectId}`);
          const d = await r.json();
          const map:Record<string,{total:number;signed:number}> = {};
          for(const w of (d.lienWaivers||[])){
            if(!w?.pay_application_id) continue;
            const m = map[w.pay_application_id] || (map[w.pay_application_id]={total:0,signed:0});
            m.total++;
            if(w.status==='signed') m.signed++;
          }
          setWaiversByApp(map);
        }catch{}
      })(),
    ]);
  },[projectId]);



  const { dragHandlers, draggingIndex } = useDragReorder(payApps, (reordered) => {
    setPayApps(reordered);
    // Persist new order to DB
    reordered.forEach((pa: any, idx: number) => {
      fetch(`/api/pay-apps/${pa.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: idx }),
      }).catch(() => {});
    });
  });

  const toggleBulk = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkApprove = async () => {
    for (const id of bulkSelected) {
      await fetch(`/api/pay-apps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      }).catch(() => {});
    }
    setPayApps(prev => prev.map(p => bulkSelected.has(p.id) ? { ...p, status: 'approved' } : p));
    setBulkSelected(new Set());
    setToast({ msg: `${bulkSelected.size} pay app(s) approved`, type: 'success' });
  };

  const handleBulkExport = async () => {
    for (const id of bulkSelected) {
      const pa = payApps.find((p: any) => p.id === id);
      if (pa) await downloadG702(pa);
    }
    setBulkSelected(new Set());
  };

  useEffect(()=>{ const t=toast?setTimeout(()=>setToast(null),4000):null; return ()=>{ if(t) clearTimeout(t); }; },[toast]);

  const load = useCallback(async()=>{
    setLoading(true);
    setError('');
    try{
      const r = await fetch(`/api/pay-apps/list?projectId=${projectId}`);
      if(!r.ok) throw new Error(await r.text());
      const d = await r.json();
      // Honor the persisted drag-reorder (sort_order) first; rows never reordered
      // (null) fall back to newest-app-first. Column is app_number in the DB.
      setPayApps((d.payApps??[]).sort((a:any,b:any)=>{
        const sa = a.sort_order ?? null, sb = b.sort_order ?? null;
        if (sa !== null && sb !== null && sa !== sb) return sa - sb;
        if (sa !== null && sb === null) return -1;
        if (sa === null && sb !== null) return 1;
        return (b.app_number||b.application_number||0)-(a.app_number||a.application_number||0);
      }));
    }catch(e:any){
      console.error(e); setError(humanError(e, 'Failed to load pay applications. Please try again.'));
    }finally{
      setLoading(false);
    }
  },[projectId]);

  /* Live: a status that changes while this table is open should change on the
     table, not the next time somebody reloads. changed drives the flash so the
     movement is noticed rather than silently swapped. */
  const { changed: liveChanged } = useLiveStatus(
    'pay_applications',
    projectId ? `project_id=eq.${projectId}` : undefined,
    load,
    Boolean(projectId),
  );


  useEffect(()=>{ load(); },[load]);

  async function downloadG702(pa:any){
    setDownloading(pa.id);
    try{
      const r = await fetch('/api/documents/pay-application',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({payAppId:pa.id,projectId}),
      });
      const d = await r.json();
      const url = d.g702Url || d.url || d.pdfUrl;
      if(url) {
        openPdf({ url });
        if(d.g703Url) openPdf({ url: d.g703Url });
      } else { if (d.error) console.error('pay app PDF error', d.error); setToast({msg:humanError(d.error, 'PDF generation failed — check the Documents section.'),type:'error'}); }
    }catch{
      setToast({msg:'Failed to generate PDF.',type:'error'});
    }finally{
      setDownloading(null);
    }
  }

  function openPayMenu(id: string) { setMenuId(id); setDeleteId(null); }

  function handleCopyPay(id: string, amount: number) {
    navigator.clipboard.writeText(fmt(amount)).catch(() => {});
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
    setMenuId(null);
  }

  async function handleDeletePayApp(id: string) {
    setPayApps(prev => prev.filter(p => p.id !== id));
    setDeleteId(null);
    try {
      const r = await fetch(`/api/pay-apps/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed');
      setToast({ msg: 'Pay app deleted', type: 'success' });
    } catch {
      setToast({ msg: 'Could not delete the pay app. Please try again.', type: 'error' });
      load();
    }
  }

  const totalCertified = payApps.filter(p=>p.status==='approved'||p.status==='certified'||p.status==='paid').reduce((s:number,p:any)=>s+(Number(p.current_payment_due)||0),0);
  // Each app's total_retainage is CUMULATIVE (retainage on completed-to-date), so
  // summing across apps re-counts every prior period. Retainage held to date is
  // the LATEST application's figure alone.
  const latestApp = payApps.reduce((best:any,p:any)=>{
    const n = Number(p.app_number ?? p.application_number)||0;
    const b = best ? (Number(best.app_number ?? best.application_number)||0) : -1;
    return n>b ? p : best;
  }, null as any);
  const retainageHeld  = Number(latestApp?.total_retainage ?? latestApp?.retainage_amount)||0;

  // Contract intelligence (from /api/project-context) + waiver coverage rollup
  const money    = ctx?.money;
  const original = Number(money?.originalContract)||0;
  const coTotal  = Number(money?.approvedCoTotal)||0;
  const revised  = Number(money?.revisedContract)||(original+coTotal);
  const ctxBilled= Number(money?.billedToDate)||0;
  const ctxPaid  = Number(money?.paidToDate)||0;
  const subCount = (ctx?.subs||[]).length;
  const outstandingCertified = Math.max(0, totalCertified - ctxPaid);
  const waiverTotals = Object.values(waiversByApp).reduce((a,w)=>({total:a.total+w.total,signed:a.signed+w.signed}),{total:0,signed:0});
  const pendingApproval = payApps.filter((p:any)=>p.status==='submitted').length;

  // Sortable columns (R11 sweep). Default = no sort so the persisted
  // drag-reorder (sort_order) stays the source of truth; while a column sort
  // is active the drag handles pause (reordering a sorted view is meaningless).
  const { sort, cycleSort } = usePersistedSort('project-pay-apps');
  const sortedApps = useSortedRows(payApps, sort, (pa:any, key:string) => {
    switch (key) {
      case 'app':       return Number(pa.app_number ?? pa.application_number)||0;
      case 'period':    return pa.period_from || pa.period_to || null;
      case 'lifecycle': return STAGE_RANK[pa.status||'draft'] ?? 0;
      case 'completed': return Number(pa.total_completed_stored ?? pa.total_completed)||0;
      case 'thisPeriod':return Number(pa.this_period)||0;
      case 'retainage': return Number(pa.total_retainage ?? pa.retainage_amount)||0;
      case 'due':       return Number(pa.current_payment_due)||0;
      default:          return pa[key];
    }
  });

  return (
    <PremiumSurface maxWidth={2200}>
      {toast && (
        <div style={{position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',zIndex:99999,padding:'12px 20px',borderRadius:'8px',background:toast.type==='success'?'rgba(34,197,94,0.9)':'rgba(239,68,68,0.9)',color:'#fff',fontWeight:600,fontSize:'14px',pointerEvents:'none'}}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <ModuleHero
        eyebrow="AIA BILLING"
        eyebrowIcon={<Receipt size={13} weight="fill" color={moduleAccent('payapps').hex} />}
        title="Pay"
        accent="Applications"
        subtitle="AIA G702/G703 — Application and Certificate for Payment"
          note="retainage comes off the top"
        actions={
          <Link data-tour="new-pay-app"
            href={`/app/projects/${projectId}/pay-apps/new`}
            style={goldButtonStyle}
            className="pmBtn"
          >
            <Plus size={15} weight="bold" /> New Pay Application
          </Link>
        }
      />

      {/* Contract intelligence strip — what the system already knows */}
      {ctx && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/contracts`, label:'Original Contract', value:fmt(original), sub:'G702 line 1'},
          {href: `/app/projects/${projectId}/change-orders`, label:'Approved COs', value:(coTotal>=0?'+':'')+fmt(coTotal), accent:coTotal>0?'#3dd68c':undefined, sub:`${Number(money?.approvedCoCount)||0} approved${Number(money?.pendingCoCount)?` · ${money.pendingCoCount} pending`:''}`},
          {href: `/app/projects/${projectId}/contracts`, label:'Revised Contract', value:fmt(revised), sub:'contract sum to date'},
          {href: `/app/projects/${projectId}/pay-apps`, label:'Billed to Date', value:fmt(ctxBilled), sub:`${Number(money?.billedPct)||0}% of revised`},
          {href: `/app/projects/${projectId}/pay-apps`, label:'Retainage Held', value:fmt(retainageHeld), sub:`held to date · ${Number(money?.retainagePct)||10}% per contract`},
          {href: `/app/projects/${projectId}/pay-apps`, label:'Paid to Date', value:fmt(ctxPaid), accent:ctxPaid>0?'#3dd68c':undefined, sub:outstandingCertified>0?`${fmt(outstandingCertified)} certified, unpaid`:'all certified money collected'},
        ]}/>
      )}

      {/* Error */}
      {error && (
        <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'12px 16px',marginBottom:20,color:RED,fontSize:13}}>
          {error}
        </div>
      )}

      {/* KPI Row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(190px, 1fr))',gap:16,marginBottom:28}}>
        <StatCard
          icon={<ClipboardText size={19} weight="duotone" color={moduleAccent('payapps').hex} />}
          label="Total Apps" value={String(payApps.length)} accent={GOLD}
          sub={money?.lastPayApp?`latest #${money.lastPayApp.appNumber} · ${String(money.lastPayApp.status||'draft').replace(/_/g,' ')}`:(payApps.length===1?'1 application':`${payApps.length} applications`)} delay={0.02}
         href={`/app/projects/${projectId}/pay-apps`}/>
        <StatCard
          icon={<CheckCircle size={19} weight="duotone" color={SAGE} />}
          label="Total Certified" value={fmt(totalCertified)} accent={SAGE}
          sub={ctxPaid>0?`${fmt(ctxPaid)} of it collected`:'approved / paid'} delay={0.06}
         href={`/app/projects/${projectId}/pay-apps`}/>
        <StatCard
          icon={<FileText size={19} weight="duotone" color={waiverTotals.total>0&&waiverTotals.signed===waiverTotals.total?SAGE:AMBER} />}
          label="Lien Waivers" value={waiverTotals.total>0?`${waiverTotals.signed}/${waiverTotals.total}`:'—'}
          accent={waiverTotals.total>0?(waiverTotals.signed===waiverTotals.total?SAGE:AMBER):undefined}
          sub={waiverTotals.total>0?'signed — payment is waiver-gated':'generate at owner approval'} delay={0.10}
         href={`/app/projects/${projectId}/lien-waivers`}/>
        <StatCard
          icon={<Hourglass size={19} weight="duotone" color={AMBER} />}
          label="Pending Approval"
          value={String(pendingApproval)}
          accent={pendingApproval>0?AMBER:undefined}
          sub={pendingApproval>0?'awaiting owner sign-off':'nothing awaiting the owner'} delay={0.14}
         href={`/app/projects/${projectId}/pay-apps`}/>
      </div>

      {/* Loading — skeleton rows shaped like the real table (house pattern: rfis) */}
      {loading && (
        <SectionCard flat flush>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </SectionCard>
      )}

      {/* Empty — teach the G702 flow instead of a bare button */}
      {!loading && payApps.length===0 && (
        <SectionCard flush>
          <div style={{display:'grid',gridTemplateColumns:ctx?'minmax(0,1fr) 380px':'1fr',alignItems:'stretch'}}>
            <PremiumEmpty
              icon={<Clipboard size={30} weight="duotone" color={GOLD} />}
              title={revised>0?`${fmt(revised)} under contract — nothing billed yet`:'No pay applications yet'}
              description={revised>0
                ? `Application #1 builds your schedule of values against the ${fmt(revised)} contract${coTotal>0?` (${fmt(original)} base + ${fmt(coTotal)} approved COs)`:''}. Every application after it rolls the SOV forward — you only enter each period's work.`
                : 'A pay application is the AIA G702/G703 packet that bills the owner for a period of work. Build the schedule of values once — it rolls forward automatically every period after.'}
              action={
                <Link
                  href={`/app/projects/${projectId}/pay-apps/new`}
                  style={goldButtonStyle}
                  className="pmBtn"
                >
                  <Plus size={15} weight="bold" /> Create Application #1
                </Link>
              }
            />
            {ctx && (
              <div style={{borderLeft:'1px solid rgba(255,255,255,0.08)',padding:'22px 24px'}}>
                <FlowSteps title="How G702 billing works" steps={[
                  {title:'Build the SOV & bill the period',desc:'Scheduled values, work completed, stored materials — retainage and payment due compute themselves.'},
                  {title:'Submit to the owner',desc:'The G702/G703 packet goes out with a one-click owner approval link.'},
                  {title:'Approval generates lien waivers',desc: subCount>0?`Conditional waivers for your ${subCount} sub${subCount===1?'':'s'}, each sized to their share of the period.`:'Conditional waivers for every sub on the job, sized to their share of the period.'},
                  {title:'Payment is waiver-gated',desc:'Mark Paid is blocked until required waivers are signed — then paid-to-date and retainage update the ledger.'},
                ]}/>
                <div style={{height:1,background:'rgba(255,255,255,0.08)',margin:'16px 0 10px'}}/>
                <InsightRow label="Revised contract" value={fmt(revised)} strong/>
                <InsightRow label="Retainage rate" value={`${Number(money?.retainagePct)||10}%`}/>
                <InsightRow label="Subs on the job" value={String(subCount)}/>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Table — NudgeRing pulses when the suggestion engine flags uncollected
          certified money or held retainage on THIS project (ticker deep links
          land on this anchor). */}
      {!loading && payApps.length>0 && (
        <NudgeRing anchorId={ANCHOR_PAY_APPS_DUE} projectId={projectId}>
        <SectionCard style={{overflow:'visible'}} bodyStyle={{padding:0}}>
          <div style={{overflowX:'auto',padding:16}}>
            {/* Bulk action bar */}
            {bulkSelected.size > 0 && (
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',background:'rgba(245, 158, 11,0.08)',border:`1px solid rgba(245, 158, 11,0.2)`,borderRadius:8,marginBottom:12}}>
                <span style={{color:GOLD,fontWeight:700,fontSize:13}}>{bulkSelected.size} selected</span>
                <button onClick={handleBulkApprove} style={{padding:'6px 14px',background:'rgba(34,197,94,0.15)',border:'1px solid rgba(34,197,94,0.3)',borderRadius:6,color:'#22C55E',fontSize:12,fontWeight:700,cursor:'pointer'}}><CheckCircle size={13} weight="fill" color="#22C55E" style={{verticalAlign:'middle'}} /> Approve All</button>
                <button onClick={handleBulkExport} style={{padding:'6px 14px',background:'rgba(245, 158, 11,0.15)',border:`1px solid rgba(245, 158, 11,0.3)`,borderRadius:6,color:GOLD,fontSize:12,fontWeight:700,cursor:'pointer'}}><FileText size={13} color={GOLD} style={{verticalAlign:'middle'}} /> Export All PDFs</button>
                <button onClick={()=>setBulkSelected(new Set())} style={{padding:'6px 14px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:6,color:DIM,fontSize:12,cursor:'pointer'}}>Clear</button>
              </div>
            )}
            <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
              <thead>
                <tr>
                  <SortableTh label="" sort={sort} onSort={cycleSort} style={{padding:'10px 8px',width:28}} />
                  <SortableTh
                    label={<input type="checkbox" checked={bulkSelected.size === payApps.length && payApps.length > 0} onChange={() => { if (bulkSelected.size === payApps.length) setBulkSelected(new Set()); else setBulkSelected(new Set(payApps.map((p:any) => p.id))); }} style={{accentColor:GOLD,cursor:'pointer'}} />}
                    sort={sort} onSort={cycleSort} style={{padding:'10px 8px',width:28}}
                  />
                  {([
                    ['App #','app'],['Period','period'],['Lifecycle','lifecycle'],['Completed to Date','completed'],
                    ['This Period','thisPeriod'],['Retainage','retainage'],['Payment Due','due'],['G702 PDF',undefined],
                  ] as [string, string|undefined][]).map(([h,k])=>(
                    <SortableTh key={h} label={h} sortKey={k} sort={sort} onSort={cycleSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedApps.map((pa:any,idx:number)=>{
                  // Drag-reorder only makes sense in the persisted (unsorted) order.
                  const handlers = sort ? null : dragHandlers(idx);
                  return (
                  <tr
                    key={pa.id}
                    onClick={()=>router.push(`/app/projects/${projectId}/pay-apps/${pa.id}`)}
                    style={{borderBottom:`1px solid rgba(229,229,234,.5)`,cursor:'pointer',transition:'background .15s',opacity:!sort&&draggingIndex===idx?0.5:1}}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(245, 158, 11,.06)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='')}
                    {...(handlers||{})}
                  >
                    <td style={{padding:'4px 4px'}} onClick={e=>e.stopPropagation()}>
                      {handlers && <DragHandle {...handlers} index={idx} isDragging={draggingIndex===idx} />}
                    </td>
                    <td style={{padding:'4px 8px'}} onClick={e=>e.stopPropagation()}>
                      <input type="checkbox" checked={bulkSelected.has(pa.id)} onChange={()=>toggleBulk(pa.id)} style={{accentColor:GOLD,cursor:'pointer'}} />
                    </td>
                    <td style={{padding:'12px 14px',color:GOLD,fontWeight:800,whiteSpace:'nowrap' as const}}>#{pa.app_number ?? pa.application_number}</td>
                    <td style={{padding:'12px 14px',color:DIM,whiteSpace:'nowrap' as const}}>
                      {pa.period_from ? new Date(pa.period_from+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'}
                      {' – '}
                      {pa.period_to ? new Date(pa.period_to+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}
                    </td>
                    <td style={{padding:'12px 14px'}}>
                      <MiniPipeline status={pa.status||'draft'} waivers={waiversByApp[pa.id]} since={pa.updated_at || pa.created_at} changed={liveChanged.has(pa.id)}/>
                    </td>
                    <td style={{padding:'12px 14px',color:TEXT,whiteSpace:'nowrap' as const}}>
                      {(()=>{ const done=Number(pa.total_completed_stored ?? pa.total_completed)||0; const cs=Number(pa.contract_sum_to_date ?? pa.contract_sum)||0; return (<>
                        <span style={{fontWeight:700}}>{fmt(done)}</span>
                        {cs>0 && <div style={{fontSize:10.5,color:'rgba(255,255,255,0.45)',marginTop:2}}>{Math.round((done/cs)*100)}% of {fmt(cs)}</div>}
                      </>); })()}
                    </td>
                    <td style={{padding:'12px 14px',color:TEXT}}>{fmt(pa.this_period||0)}</td>
                    <td style={{padding:'12px 14px',color:ORANGE}}>{fmt(pa.total_retainage ?? pa.retainage_amount)}</td>
                    <td style={{padding:'12px 14px',position:'relative' as const}} onClick={e=>e.stopPropagation()}>
                      {deleteId===pa.id ? (
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <span style={{fontSize:11,color:RED,fontWeight:600}}>Delete?</span>
                          <button onClick={()=>handleDeletePayApp(pa.id)} style={{padding:'3px 8px',background:'rgba(192,48,48,.15)',border:'1px solid rgba(192,48,48,.3)',borderRadius:5,color:RED,fontSize:11,fontWeight:700,cursor:'pointer'}}>Yes</button>
                          <button onClick={()=>setDeleteId(null)} style={{padding:'3px 8px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,cursor:'pointer'}}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{display:'flex',alignItems:'center',gap:4}}>
                          <span style={{color:TEXT,fontWeight:700}}>{fmt(pa.current_payment_due||0)}</span>
                          {copiedId===pa.id&&<span style={{fontSize:10,color:'#3dd68c',fontWeight:600}}>Copied!</span>}
                          <button onClick={()=>openPayMenu(pa.id)} style={{background:'none',border:'none',color:DIM,cursor:'pointer',fontSize:10,padding:'2px 4px',lineHeight:1,opacity:0.6}} onMouseEnter={e=>(e.currentTarget.style.opacity='1')} onMouseLeave={e=>(e.currentTarget.style.opacity='0.6')}><span style={{display:'inline-flex',verticalAlign:'middle'}}><CaretDown size={12} color={DIM} /></span></button>
                          {menuId===pa.id&&(
                            <div style={{position:'absolute',top:36,right:14,background:RAISED,border:`1px solid ${BORDER}`,borderRadius:'var(--radius-md)',padding:6,zIndex:100,minWidth:150,boxShadow:'var(--shadow-lg)'}}>
                              {[
                                // No inline amount edit: PATCHing current_payment_due raw would
                                // bypass the exact-cents engine and desync retainage/earned/G702.
                                // The pay app composer recomputes every figure server-side.
                                {label:'Edit in Pay App',icon:<PencilSimple size={14} color={TEXT} />,title:'Payment due is computed from the period’s work by the exact-cents engine — edit the work in the pay app so retainage and every G702 field stay in sync.',action:()=>{setMenuId(null);router.push(`/app/projects/${projectId}/pay-apps/${pa.id}`);}},
                                {label:'Copy Amount',icon:<Copy size={14} color={TEXT} />,title:'Copy the formatted payment due',action:()=>handleCopyPay(pa.id,pa.current_payment_due||0)},
                              ].map(item=>(
                                <div key={item.label} title={item.title} onClick={item.action} style={{padding:'7px 12px',fontSize:12,color:TEXT,cursor:'pointer',borderRadius:6,display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.06)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                                  <span style={{fontSize:14}}>{item.icon}</span>{item.label}
                                </div>
                              ))}
                              <div style={{height:1,background:BORDER,margin:'4px 0'}}/>
                              <div onClick={()=>{setMenuId(null);setDeleteId(pa.id);}} style={{padding:'7px 12px',fontSize:12,color:RED,cursor:'pointer',borderRadius:6,display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(192,48,48,.08)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                                <span style={{fontSize:14}}><Trash size={14} color={RED} /></span>Delete Pay App
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{padding:'12px 14px'}}>
                      <button
                        onClick={()=>downloadG702(pa)}
                        disabled={downloading===pa.id}
                        style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:GOLD,fontSize:11,padding:'4px 10px',cursor:'pointer',opacity:downloading===pa.id?.5:1}}
                      >
                        {downloading===pa.id ? '…' : <><FileText size={13} color={GOLD} style={{verticalAlign:'middle'}} /> Download</>}
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              {menuId&&<div style={{position:'fixed',inset:0,zIndex:50}} onClick={()=>setMenuId(null)}/>}
            </table>
          </div>
        </SectionCard>
        </NudgeRing>
      )}
    </PremiumSurface>
  );
}
