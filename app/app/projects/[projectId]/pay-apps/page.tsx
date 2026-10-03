'use client';
/**
 * Pay Applications — Pass 4, on the RFIs reference layout (dense register).
 *
 * Anatomy: title + one primary action (New Pay Application) → StatRow
 * (contract position: revised / billed / retainage / paid / lien waivers) →
 * Toolbar → the G702 register. A row opens the application's own page.
 *
 * Money: every DB numeric can round-trip as a string — Number() before any
 * math, and amounts are never truncated. Retainage held to date is the LATEST
 * application's cumulative figure (summing across apps would re-count every
 * prior period). Approval / record-payment stay the explicit existing
 * workflows on the application page; this register only lists, bulk-approves
 * (the same PATCH it always sent), exports and deletes.
 *
 * Every read / write is the one this screen already used:
 *   list      GET    /api/pay-apps/list?projectId=
 *   waivers   GET    /api/lien-waivers/list?projectId=
 *   reorder   PATCH  /api/pay-apps/[id]   { sort_order }
 *   approve   PATCH  /api/pay-apps/[id]   { status: 'approved' }   (bulk)
 *   pdf       POST   /api/documents/pay-application
 *   delete    DELETE /api/pay-apps/[id]
 * Live status (useLiveStatus) and the NudgeRing anchor are unchanged; the
 * persisted drag-reorder (sort_order) stays the source of truth for row order.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { humanError } from '@/lib/errors';
import { useParams, useRouter } from 'next/navigation';
import DragHandle, { useDragReorder } from '../../../../../components/DragHandle';
import { Clipboard, CheckCircle, FileText, PencilSimple, Copy, Trash, Plus, ArrowClockwise, WarningCircle, X } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, EmptyState, RowActions, Select, Toast, useToast,
  type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { FlowSteps, InsightRow } from '@/components/ui/premium';
import { LifecycleRail } from '@/components/ui/Status';
import { useLiveStatus } from '@/lib/hooks/useLiveStatus';
import NudgeRing from '@/components/intelligence/NudgeRing';
import { ANCHOR_PAY_APPS_DUE } from '@/lib/suggestions';
import { openPdf } from '@/components/PdfViewer';

// MONEY: several DB numerics round-trip as strings — coerce before any math/format.
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n:number|string|null|undefined) => money.format(Number(n)||0);
const fmtSigned = (n:number) => (n<0 ? '-' : n>0 ? '+' : '') + money.format(Math.abs(n||0));
/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
const fmtDay = (d?:string|null, year=false) => d ? new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('en-US', year ? {month:'short',day:'numeric',year:'numeric'} : {month:'short',day:'numeric'}) : '—';

/** One status → one badge. Draft neutral, Submitted amber (owner decision owed),
 *  Approved / Certified green, Paid orange (closed money), from lib/status-colors. */
function statusBadge(s:string|null|undefined): { label:string; tone:BadgeTone } {
  const k = String(s||'draft').toLowerCase();
  if (k==='submitted') return { label:'Submitted', tone:'under_contract' };
  if (k==='approved') return { label:'Approved', tone:'ongoing' };
  if (k==='certified') return { label:'Certified', tone:'ongoing' };
  if (k==='paid') return { label:'Paid', tone:'completed' };
  return { label:'Draft', tone:'neutral' };
}
const STAGE_RANK:Record<string,number> = {draft:0,submitted:1,approved:2,certified:2.5,paid:3};
const STATUS_OPTIONS = ['draft','submitted','approved','certified','paid'];

const CSS = `
.paWs > .k-page { max-width: none; }
.paBulk { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 16px; border-bottom: 1px solid var(--border-subtle); background: var(--brand-primary-08); font-size: var(--fs-sm); }
.paBulk > b { color: var(--text-primary); }
.paTableWrap { overflow-x: auto; }
.paTable { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.paTable th { position: sticky; top: 0; z-index: 1; background: rgba(21,23,28,0.88); text-align: left; padding: 8px 12px; font-size: 12px; font-weight: 700; color: var(--text-tertiary); border-bottom: 1px solid var(--border-default); white-space: nowrap; }
.paTable td { padding: 0 12px; height: 52px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: middle; }
.paTable th:first-child, .paTable td:first-child { padding-left: var(--sp-4); width: 28px; }
.paTable th:last-child, .paTable td:last-child { padding-right: var(--sp-4); }
.paTable th[data-align="right"], .paTable td[data-align="right"] { text-align: right; }
.paTable tbody tr { cursor: pointer; }
.paTable tbody tr:hover td { background: rgba(255,255,255,0.03); }
.paTable tbody tr[data-dragging="true"] td { opacity: .5; }
.paNum { color: var(--text-primary); font-weight: 800; }
.paMoney { color: var(--text-primary); font-weight: 700; }
.paMuted { color: var(--text-tertiary); }
.paSub { display: block; font-size: var(--fs-xs); color: var(--text-tertiary); margin-top: 2px; font-weight: 500; }
.paLife { min-width: 150px; }
.paWaivers { font-size: var(--fs-xs); font-weight: 700; color: var(--status-under-contract); white-space: nowrap; margin-top: 3px; }
.paWaivers[data-ok="true"] { color: var(--status-ongoing); }
.paCheck { accent-color: var(--brand-primary); cursor: pointer; width: 16px; height: 16px; }
.paEmptyGrid { display: grid; grid-template-columns: minmax(0, 1fr); }
@container paws (min-width: 900px) { .paEmptyGrid[data-ctx="true"] { grid-template-columns: minmax(0, 1fr) 380px; } .paEmptyRail { border-left: 1px solid var(--border-subtle); } }
.paCq { container: paws / inline-size; min-width: 0; }
.paEmptyRail { padding: 22px 24px; border-top: 1px solid var(--border-subtle); }
.paRule { height: 1px; background: var(--border-subtle); margin: 14px 0 8px; }
.paInlineErr { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--fs-sm); color: var(--status-overdue); padding: 10px 14px; border: 1px solid rgba(255,77,94,.35); border-radius: var(--radius-sm); background: rgba(255,77,94,.08); }
.paSkel { height: 14px; border-radius: 4px; background: var(--border-subtle); }
@media (max-width: 640px) {
  .paWs .k-btn, .paWs .k-stat, .paWs select.k-select, .paWs .k-input { min-height: 44px; }
  .paTable td { height: 56px; }
}
`;

export default function PayAppsPage() {
  const params = useParams();
  const projectId = params['projectId'] as string;
  const router = useRouter();

  const [payApps,setPayApps]   = useState<any[]>([]);
  const [loading,setLoading]   = useState(true);
  const [error,setError]       = useState('');
  const [downloading,setDownloading] = useState<string|null>(null);
  const { toast, show } = useToast(4000);
  const setToast = (t:{msg:string;type:'success'|'error'}) => show(t.msg, t.type==='success'?'good':'bad');
  const [copiedId, setCopiedId] = useState<string|null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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
    setToast({ msg: `${bulkSelected.size} pay app(s) approved.`, type: 'success' });
  };

  const handleBulkExport = async () => {
    for (const id of bulkSelected) {
      const pa = payApps.find((p: any) => p.id === id);
      if (pa) await downloadG702(pa);
    }
    setBulkSelected(new Set());
  };

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

  function handleCopyPay(id: string, amount: number) {
    navigator.clipboard.writeText(fmt(amount)).catch(() => {});
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
    setToast({ msg: `${fmt(amount)} copied.`, type: 'success' });
  }

  async function handleDeletePayApp(id: string) {
    setPayApps(prev => prev.filter(p => p.id !== id));
    try {
      const r = await fetch(`/api/pay-apps/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed');
      setToast({ msg: 'Pay app deleted.', type: 'success' });
    } catch {
      setToast({ msg: 'Could not delete the pay app. Please try again.', type: 'error' });
      load();
    }
  }
  async function confirmDeletePayApp(pa:any) {
    if (await confirmDialog({ title: `Delete pay app #${pa.app_number ?? pa.application_number}?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) handleDeletePayApp(pa.id);
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

  // Register view — search matches the app number and period; status filters.
  const q = search.trim().toLowerCase();
  const visible = payApps.filter((pa:any)=>{
    if (statusFilter!=='all' && String(pa.status||'draft')!==statusFilter) return false;
    if (!q) return true;
    const n = String(pa.app_number ?? pa.application_number ?? '');
    return [`#${n}`, n, fmtDay(pa.period_from, true), fmtDay(pa.period_to, true), pa.status].some(v => String(v||'').toLowerCase().includes(q));
  });
  const filtersActive = !!search || statusFilter!=='all';
  const clearFilters = () => { setSearch(''); setStatusFilter('all'); };
  // Drag-reorder only makes sense on the whole, unfiltered register.
  const dragEnabled = !filtersActive;

  // ── Stat tiles: contract position ──
  const stats: StatItem[] = loading && !ctx
    ? [
        { label:'Revised Contract', value:'—', sub:'Loading…' },
        { label:'Billed to Date', value:'—', sub:'Loading…' },
        { label:'Retainage Held', value:'—', sub:'Loading…' },
        { label:'Paid to Date', value:'—', sub:'Loading…' },
        { label:'Lien Waivers', value:'—', sub:'Loading…' },
      ]
    : [
        { label:'Revised Contract', value:fmt(revised), sub:`${fmt(original)} original ${coTotal>=0?'+':'-'} ${fmt(Math.abs(coTotal))} approved COs`, href:`/app/projects/${projectId}/contracts` },
        { label:'Billed to Date', value:fmt(ctxBilled), sub:`${Number(money?.billedPct)||0}% of revised · ${payApps.length} application${payApps.length===1?'':'s'}` },
        { label:'Retainage Held', value:fmt(retainageHeld), sub:`Held to date · ${Number(money?.retainagePct)||10}% per contract` },
        { label:'Paid to Date', value:fmt(ctxPaid), tone: outstandingCertified>0 ? 'warn' : ctxPaid>0 ? 'good' : 'default', sub: outstandingCertified>0 ? `${fmt(outstandingCertified)} certified, unpaid` : 'All certified money collected', onClick: pendingApproval>0 ? () => setStatusFilter(s => (s==='submitted' ? 'all' : 'submitted')) : undefined },
        { label:'Lien Waivers', value: waiverTotals.total>0 ? `${waiverTotals.signed} of ${waiverTotals.total}` : '—', tone: waiverTotals.total>0 ? (waiverTotals.signed===waiverTotals.total ? 'good' : 'warn') : 'default', sub: waiverTotals.total>0 ? 'Signed — payment is waiver-gated' : 'Generate at owner approval', href:`/app/projects/${projectId}/lien-waivers` },
      ];

  const allVisibleSelected = visible.length>0 && visible.every((p:any)=>bulkSelected.has(p.id));

  // ── Register body: loading / error / empty / no-match / rows — each distinct ──
  let listBody: React.ReactNode;
  if (loading) {
    listBody = (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }} aria-busy="true">
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 150px 1fr 120px 120px 120px', gap: 14, alignItems: 'center' }}>
            <div className="paSkel" /><div className="paSkel" /><div className="paSkel" style={{ width: '70%' }} /><div className="paSkel" /><div className="paSkel" /><div className="paSkel" />
          </div>
        ))}
      </div>
    );
  } else if (error) {
    listBody = (
      <EmptyState
        icon={<WarningCircle size={22}/>}
        title="Couldn't load pay applications"
        text={`${error} Nothing has been lost — try again.`}
        action={<Button icon={<ArrowClockwise size={15}/>} onClick={load}>Retry</Button>}
      />
    );
  } else if (payApps.length===0) {
    listBody = (
      <div className="paCq">
        <div className="paEmptyGrid" data-ctx={ctx ? 'true' : 'false'}>
          <EmptyState
            icon={<Clipboard size={22}/>}
            title={revised>0?`${fmt(revised)} under contract — nothing billed yet`:'No pay applications yet'}
            text={revised>0
              ? `Application #1 builds your schedule of values against the ${fmt(revised)} contract${coTotal>0?` (${fmt(original)} base + ${fmt(coTotal)} approved COs)`:''}. Every application after it rolls the SOV forward — you only enter each period's work.`
              : 'A pay application is the AIA G702/G703 packet that bills the owner for a period of work. Build the schedule of values once — it rolls forward automatically every period after.'}
            action={<Button icon={<Plus size={15} weight="bold"/>} href={`/app/projects/${projectId}/pay-apps/new`}>Create Application #1</Button>}
          />
          {ctx && (
            <div className="paEmptyRail">
              <FlowSteps title="How G702 Billing Works" steps={[
                {title:'Build the SOV & Bill the Period',desc:'Scheduled values, work completed, stored materials — retainage and payment due compute themselves.'},
                {title:'Submit to the Owner',desc:'The G702/G703 packet goes out with a one-click owner approval link.'},
                {title:'Approval Generates Lien Waivers',desc: subCount>0?`Conditional waivers for your ${subCount} sub${subCount===1?'':'s'}, each sized to their share of the period.`:'Conditional waivers for every sub on the job, sized to their share of the period.'},
                {title:'Payment Is Waiver-Gated',desc:'Mark Paid is blocked until required waivers are signed — then paid-to-date and retainage update the ledger.'},
              ]}/>
              <div className="paRule"/>
              <InsightRow label="Revised Contract" value={fmt(revised)} strong/>
              <InsightRow label="Retainage Rate" value={`${Number(money?.retainagePct)||10}%`}/>
              <InsightRow label="Subs on the Job" value={String(subCount)}/>
            </div>
          )}
        </div>
      </div>
    );
  } else if (visible.length===0) {
    listBody = (
      <EmptyState
        icon={<Clipboard size={22}/>}
        title="No applications match these filters"
        text="Clear the search or status filter to see more."
        action={<Button onClick={clearFilters}>Clear Filters</Button>}
      />
    );
  } else {
    listBody = (
      <>
        {bulkSelected.size > 0 && (
          <div className="paBulk" role="region" aria-label="Bulk actions">
            <b>{bulkSelected.size} selected</b>
            <Button size="sm" icon={<CheckCircle size={14}/>} onClick={handleBulkApprove}>Approve Selected</Button>
            <Button size="sm" icon={<FileText size={14}/>} onClick={handleBulkExport} disabled={!!downloading}>Export Selected PDFs</Button>
            <Button size="sm" variant="ghost" icon={<X size={14}/>} onClick={()=>setBulkSelected(new Set())}>Clear</Button>
          </div>
        )}
        <div className="paTableWrap">
          <table className="paTable">
            <thead>
              <tr>
                <th aria-label="Reorder" />
                <th style={{ width: 28 }}>
                  <input type="checkbox" className="paCheck" aria-label="Select all" checked={allVisibleSelected} onChange={() => { if (allVisibleSelected) setBulkSelected(new Set()); else setBulkSelected(new Set(visible.map((p:any) => p.id))); }} />
                </th>
                <th>App #</th>
                <th>Period</th>
                <th>Lifecycle</th>
                <th data-align="right">Completed to Date</th>
                <th data-align="right">This Period</th>
                <th data-align="right">Retainage</th>
                <th data-align="right">Payment Due</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((pa:any)=>{
                const idx = payApps.indexOf(pa);
                const handlers = dragEnabled ? dragHandlers(idx) : null;
                const done=Number(pa.total_completed_stored ?? pa.total_completed)||0;
                const cs=Number(pa.contract_sum_to_date ?? pa.contract_sum)||0;
                const w = waiversByApp[pa.id];
                const num = pa.app_number ?? pa.application_number;
                return (
                  <tr
                    key={pa.id}
                    onClick={()=>router.push(`/app/projects/${projectId}/pay-apps/${pa.id}`)}
                    data-dragging={dragEnabled && draggingIndex===idx ? 'true' : undefined}
                    {...(handlers||{})}
                  >
                    <td onClick={e=>e.stopPropagation()}>
                      {handlers && <DragHandle {...handlers} index={idx} isDragging={draggingIndex===idx} />}
                    </td>
                    <td onClick={e=>e.stopPropagation()}>
                      <input type="checkbox" className="paCheck" aria-label={`Select pay app #${num}`} checked={bulkSelected.has(pa.id)} onChange={()=>toggleBulk(pa.id)} />
                    </td>
                    <td><span className="paNum">#{num}</span></td>
                    <td className="paMuted">{fmtDay(pa.period_from)} – {fmtDay(pa.period_to, true)}</td>
                    <td>
                      <div className="paLife">
                        <LifecycleRail module="pay_applications" status={pa.status||'draft'} since={pa.updated_at || pa.created_at} changed={liveChanged.has(pa.id)} showAction={false}/>
                        {w && w.total>0 && <div className="paWaivers" data-ok={w.signed===w.total ? 'true' : undefined}>{w.signed} of {w.total} waivers signed</div>}
                      </div>
                    </td>
                    <td data-align="right">
                      <span className="paMoney">{fmt(done)}</span>
                      {cs>0 && <span className="paSub">{Math.round((done/cs)*100)}% of {fmt(cs)}</span>}
                    </td>
                    <td data-align="right">{fmt(pa.this_period||0)}</td>
                    <td data-align="right">{fmt(pa.total_retainage ?? pa.retainage_amount)}</td>
                    <td data-align="right">
                      <span className="paMoney">{fmt(pa.current_payment_due||0)}</span>
                      {copiedId===pa.id && <span className="paSub">Copied</span>}
                    </td>
                    <td onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                        <Badge tone={statusBadge(pa.status).tone}>{statusBadge(pa.status).label}</Badge>
                        <RowActions actions={[
                          { label:'Open Pay App', icon:<Clipboard size={15}/>, href:`/app/projects/${projectId}/pay-apps/${pa.id}` },
                          { label: downloading===pa.id ? 'Generating…' : 'G702 / G703 PDF', icon:<FileText size={15}/>, onClick:()=>downloadG702(pa), disabled:!!downloading },
                          // No inline amount edit: PATCHing current_payment_due raw would
                          // bypass the exact-cents engine and desync retainage/earned/G702.
                          // The pay app composer recomputes every figure server-side.
                          { label:'Edit in Pay App', icon:<PencilSimple size={15}/>, href:`/app/projects/${projectId}/pay-apps/${pa.id}` },
                          { label:'Copy Payment Due', icon:<Copy size={15}/>, onClick:()=>handleCopyPay(pa.id, Number(pa.current_payment_due)||0) },
                          { label:'Delete', icon:<Trash size={15}/>, onClick:()=>confirmDeletePayApp(pa), tone:'danger' },
                        ]}/>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <div className="paWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label:'Projects', href:'/app/projects' },
          { label: ctx?.project?.name || 'Project', href:`/app/projects/${projectId}/overview` },
          { label:'Pay Applications' },
        ]}
        title="Pay Applications"
        subtitle="AIA G702/G703 — Application and Certificate for Payment. Retainage comes off the top."
        actions={
          <Button variant="primary" data-tour="new-pay-app" icon={<Plus size={15} weight="bold"/>} href={`/app/projects/${projectId}/pay-apps/new`}>
            New Pay Application
          </Button>
        }
      >
        {!error && <StatRow items={stats}/>}

        {!loading && !error && payApps.length>0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by application number or period…"
            filters={
              <>
                <Select
                  aria-label="Status"
                  value={statusFilter}
                  onChange={e=>setStatusFilter(e.target.value)}
                  style={{ width:'auto', minWidth:150 }}
                  options={[{ value:'all', label:'All Statuses' }, ...STATUS_OPTIONS.map(s=>({ value:s, label:`${statusBadge(s).label}${s==='submitted'&&pendingApproval?` (${pendingApproval})`:''}` }))]}
                />
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={<span className="paMuted" style={{ fontSize:'var(--fs-sm)' }}>{visible.length} of {payApps.length}{dragEnabled ? ' · drag to reorder' : ''}</span>}
          />
        )}

        {/* NudgeRing pulses when the suggestion engine flags uncollected
            certified money or held retainage on THIS project (ticker deep links
            land on this anchor). */}
        <NudgeRing anchorId={ANCHOR_PAY_APPS_DUE} projectId={projectId}>
          <Card flush>{listBody}</Card>
        </NudgeRing>
      </PageShell>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
