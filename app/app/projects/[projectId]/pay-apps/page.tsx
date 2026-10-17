'use client';
/**
 * Pay Applications — the G702 register for the job.
 *
 * Anatomy: title + one primary action (New Pay Application) → StatRow
 * (contract position: revised / billed / retainage / paid / lien waivers) →
 * Toolbar → the register in the shared DataTable (saved views, grouping,
 * columns, CSV export, row checkboxes for bulk approve / bulk PDF). A row opens
 * the application's own page.
 *
 * Money: every DB numeric can round-trip as a string — Number() before any
 * math, and amounts are never truncated. Completed-to-date and retainage are
 * CUMULATIVE per application, so their totals are the latest application's
 * figure, never a sum across apps (that would re-count every prior period).
 * This Period and Payment Due are per-period, so those totals are sums.
 * Approval / record-payment stay the explicit existing workflows on the
 * application page; this register only lists, bulk-approves (the same PATCH it
 * always sent), exports and deletes.
 *
 * Every read / write is the one this screen already used:
 *   list      GET    /api/pay-apps/list?projectId=
 *   waivers   GET    /api/lien-waivers/list?projectId=
 *   reorder   PATCH  /api/pay-apps/[id]   { sort_order }
 *   approve   POST   /api/pay-apps/[id]/approve                     (bulk)
 *   pdf       POST   /api/documents/pay-application
 *   delete    DELETE /api/pay-apps/[id]
 * Live status (useLiveStatus) and the NudgeRing anchor are unchanged; the
 * persisted drag-reorder (sort_order) stays the source of truth for row order
 * (drag the grip beside the app number while no filter is on).
 */
import { useEditRights } from '@/lib/hooks/usePermissions';
import { jsonRequest } from '@/lib/list-view';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { humanError } from '@/lib/errors';
import { useParams, useRouter } from 'next/navigation';
import DragHandle, { useDragReorder } from '../../../../../components/DragHandle';
import {
  Clipboard, CheckCircle, FileText, PencilSimple, Copy, Trash, Plus, ArrowClockwise, WarningCircle,
  Scales, Receipt, Vault, Wallet, Lock,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select, Toast, useToast,
  type BadgeTone, type StatItem, type Column, type Action,
} from '@/components/ui/kit';
import { LifecycleRail } from '@/components/ui/Status';
import { useLiveStatus } from '@/lib/hooks/useLiveStatus';
import NudgeRing from '@/components/intelligence/NudgeRing';
import { ANCHOR_PAY_APPS_DUE } from '@/lib/suggestions';
import { openPdf } from '@/components/PdfViewer';
import { retainageRate } from '@/lib/retainage';

// MONEY: several DB numerics round-trip as strings — coerce before any math/format.
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n:number|string|null|undefined) => money.format(Number(n)||0);
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
const STATUS_OPTIONS = ['draft','submitted','approved','certified','paid'];

const appNo = (pa:any) => Number(pa?.app_number ?? pa?.application_number) || 0;
const doneOf = (pa:any) => Number(pa?.total_completed_stored ?? pa?.total_completed) || 0;
const retOf = (pa:any) => Number(pa?.total_retainage ?? pa?.retainage_amount) || 0;
/** The highest-numbered application in a list — cumulative figures are read from it alone. */
const latestOf = (list:any[]) => list.reduce((best:any, p:any) => (!best || appNo(p) > appNo(best) ? p : best), null as any);

const CSS = `
.paWs > .k-page { max-width: none; }
.paNum { display: inline-flex; align-items: center; gap: 6px; color: var(--text-primary); font-weight: 800; font-variant-numeric: tabular-nums; }
.paMoney { color: var(--text-primary); font-weight: 700; font-variant-numeric: tabular-nums; }
.paMuted { color: var(--text-tertiary); }
.paSub { display: block; font-size: var(--fs-xs); color: var(--text-tertiary); margin-top: 2px; font-weight: 500; }
.paLife { min-width: 150px; }
.paWaivers { font-size: var(--fs-xs); font-weight: 700; color: var(--status-under-contract); white-space: nowrap; margin-top: 3px; }
.paWaivers[data-ok="true"] { color: var(--status-ongoing); }
@media (max-width: 767px) {
  .paGrip { display: none; }
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
  const [bulkBusy,setBulkBusy] = useState(false);
  const { toast, show } = useToast(4000);
  const payRights = useEditRights('Pay Apps');
  const setToast = (t:{msg:string;type:'success'|'error'}) => show(t.msg, t.type==='success'?'good':'bad');
  const [copiedId, setCopiedId] = useState<string|null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Project intelligence + waiver coverage — fetched once on mount. The list walks
  // in knowing the contract money and every lien waiver tied to a billing period.
  const { ctx } = useProjectContext(projectId);
  const [waiversByApp,setWaiversByApp] = useState<Record<string,{total:number;signed:number}>>({});
  useEffect(()=>{
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
      }catch(e){
        // Waiver coverage is enrichment only — the register still renders without it.
        console.error('lien waiver coverage', e);
      }
    })();
  },[projectId]);

  const { dragHandlers, draggingIndex } = useDragReorder(payApps, (reordered) => {
    setPayApps(reordered);
    // Persist new order to DB — one PATCH per row, as before.
    void Promise.all(reordered.map((pa: any, idx: number) =>
      fetch(`/api/pay-apps/${pa.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: idx }),
      }).then(r => r.ok, () => false),
    )).then(oks => { if (oks.some(ok => !ok)) setToast({ msg: "The new order didn't fully save. Reload to see the saved order.", type: 'error' }); });
  });

  const handleBulkExport = async (list:any[]) => {
    for (const pa of list) await downloadG702(pa);
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
    navigator.clipboard.writeText(fmt(amount)).catch((e) => console.error('clipboard', e));
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
  const latestApp = latestOf(payApps);
  const retainageHeld  = retOf(latestApp);

  // Contract intelligence (from /api/project-context) + waiver coverage rollup
  const ctxMoney = ctx?.money;
  const original = Number(ctxMoney?.originalContract)||0;
  const coTotal  = Number(ctxMoney?.approvedCoTotal)||0;
  const revised  = Number(ctxMoney?.revisedContract)||(original+coTotal);
  const ctxBilled= Number(ctxMoney?.billedToDate)||0;
  const ctxPaid  = Number(ctxMoney?.paidToDate)||0;
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
        { label:'Revised Contract', value:'—', sub:'Loading…', icon:<Scales size={15}/> },
        { label:'Billed to Date', value:'—', sub:'Loading…', icon:<Receipt size={15}/> },
        { label:'Retainage Held', value:'—', sub:'Loading…', icon:<Vault size={15}/> },
        { label:'Paid to Date', value:'—', sub:'Loading…', icon:<Wallet size={15}/> },
        { label:'Lien Waivers', value:'—', sub:'Loading…', icon:<Lock size={15}/> },
      ]
    : [
        { label:'Revised Contract', value:fmt(revised), sub:`${fmt(original)} original ${coTotal>=0?'+':'-'} ${fmt(Math.abs(coTotal))} approved COs`, icon:<Scales size={15}/>, href:`/app/projects/${projectId}/contracts` },
        { label:'Billed to Date', value:fmt(ctxBilled), sub: revised > 0 ? `${Math.round((ctxBilled / revised) * 1000) / 10}% of revised · ${payApps.length} application${payApps.length===1?'':'s'}` : `No contract value set · ${payApps.length} application${payApps.length===1?'':'s'}`, icon:<Receipt size={15}/> },
        { label:'Retainage Held', value:fmt(retainageHeld), sub: latestApp ? `Held to date · App #${appNo(latestApp)} at ${retainageRate(ctxMoney?.retainagePct)}%` : 'Held to date', icon:<Vault size={15}/> },
        { label:'Paid to Date', value:fmt(ctxPaid), tone: outstandingCertified>0 ? 'warn' : ctxPaid>0 ? 'good' : 'default', sub: outstandingCertified>0 ? `${fmt(outstandingCertified)} certified, unpaid` : 'All certified money collected', icon:<Wallet size={15}/>, onClick: pendingApproval>0 ? () => setStatusFilter(s => (s==='submitted' ? 'all' : 'submitted')) : undefined, active: pendingApproval>0 ? statusFilter==='submitted' : undefined },
        { label:'Lien Waivers', value: waiverTotals.total>0 ? `${waiverTotals.signed} of ${waiverTotals.total}` : '—', tone: waiverTotals.total>0 ? (waiverTotals.signed===waiverTotals.total ? 'good' : 'warn') : 'default', sub: waiverTotals.total>0 ? 'Signed' : undefined, icon:<Lock size={15}/>, href:`/app/projects/${projectId}/lien-waivers` },
      ];

  // ── Register columns ──
  const latestMoney = (pick:(pa:any)=>number) => (list:any[]) => <span className="paMoney" title="Latest application (cumulative)">{fmt(pick(latestOf(list)))}</span>;
  const columns: Column<any>[] = [
    {
      key:'num', header:'App #', primary:true, width:96, groupable:false,
      accessor:pa=>appNo(pa),
      render:pa=>{
        const idx = payApps.indexOf(pa);
        const handlers = dragEnabled && idx>=0 ? dragHandlers(idx) : null;
        return (
          <span className="paNum">
            {handlers && (
              <span className="paGrip" onClick={e=>e.stopPropagation()}>
                <DragHandle {...handlers} index={idx} isDragging={draggingIndex===idx} />
              </span>
            )}
            #{pa.app_number ?? pa.application_number}
          </span>
        );
      },
    },
    { key:'period', header:'Period', phone:'show', accessor:pa=>pa.period_to ? String(pa.period_to).slice(0,10) : pa.period_from ? String(pa.period_from).slice(0,10) : '', fit:'full', render:pa=><span className="paMuted" style={{ whiteSpace:'nowrap' }}>{fmtDay(pa.period_from)} – {fmtDay(pa.period_to, true)}</span> },
    { key:'status', header:'Status', phone:'show', accessor:pa=>statusBadge(pa.status).label, render:pa=>{
      const b=statusBadge(pa.status); const w=waiversByApp[pa.id];
      return <><Badge tone={b.tone} dot>{b.label}</Badge>{w && w.total>0 && <div className="paWaivers" data-ok={w.signed===w.total ? 'true' : undefined}>{w.signed} of {w.total} waivers</div>}</>;
    } },
    {
      /* The stage rail repeats the status badge, so it starts hidden (Columns turns it on). */
      key:'lifecycle', header:'Lifecycle', phone:'hide', hidden:true, sortable:false, groupable:false,
      accessor:pa=>{ const w=waiversByApp[pa.id]; return w && w.total>0 ? `${w.signed} of ${w.total} waivers signed` : ''; },
      render:pa=>{
        const w = waiversByApp[pa.id];
        return (
          <div className="paLife">
            <LifecycleRail module="pay_applications" status={pa.status||'draft'} since={pa.updated_at || pa.created_at} changed={liveChanged.has(pa.id)} showAction={false}/>
            {w && w.total>0 && <div className="paWaivers" data-ok={w.signed===w.total ? 'true' : undefined}>{w.signed} of {w.total} waivers signed</div>}
          </div>
        );
      },
    },
    {
      key:'done', header:'Completed to Date', align:'right', phone:'hide', accessor:doneOf, total:latestMoney(doneOf), format:fmt,
      render:pa=>{ const done=doneOf(pa); const cs=Number(pa.contract_sum_to_date ?? pa.contract_sum)||0; return <><span className="paMoney">{fmt(done)}</span>{cs>0 && <span className="paSub">{Math.round((done/cs)*100)}% of {fmt(cs)}</span>}</>; },
    },
    { key:'this', header:'This Period', align:'right', phone:'hide', accessor:pa=>Number(pa.this_period)||0, total:'sum', format:fmt, render:pa=>fmt(pa.this_period||0) },
    { key:'ret', header:'Retainage', align:'right', phone:'hide', accessor:retOf, total:latestMoney(retOf), format:fmt, render:pa=>fmt(retOf(pa)) },
    {
      key:'due', header:'Payment Due', align:'right', phone:'show', accessor:pa=>Number(pa.current_payment_due)||0, total:'sum', format:fmt,
      render:pa=><><span className="paMoney">{fmt(pa.current_payment_due||0)}</span>{copiedId===pa.id && <span className="paSub">Copied</span>}</>,
    },
    { key:'contract', header:'Contract to Date', align:'right', hidden:true, phone:'hide', accessor:pa=>Number(pa.contract_sum_to_date ?? pa.contract_sum)||0, render:pa=>fmt(pa.contract_sum_to_date ?? pa.contract_sum) },
  ];

  const payAppActions = (pa:any): Action[] => [
    { label:'Open Pay App', icon:<Clipboard size={15}/>, href:`/app/projects/${projectId}/pay-apps/${pa.id}` },
    { label: downloading===pa.id ? 'Generating…' : 'G702 / G703 PDF', icon:<FileText size={15}/>, onClick:()=>downloadG702(pa), disabled:!!downloading },
    // No inline amount edit: PATCHing current_payment_due raw would
    // bypass the exact-cents engine and desync retainage/earned/G702.
    // The pay app composer recomputes every figure server-side.
    { label:'Edit in Pay App', icon:<PencilSimple size={15}/>, href:`/app/projects/${projectId}/pay-apps/${pa.id}` },
    { label:'Copy Payment Due', icon:<Copy size={15}/>, onClick:()=>handleCopyPay(pa.id, Number(pa.current_payment_due)||0) },
    { label:'Delete', icon:<Trash size={15}/>, onClick:()=>confirmDeletePayApp(pa), tone:'danger' },
  ];

  // ── Register body: error / empty / rows (loading is the table's own skeleton) ──
  let listBody: React.ReactNode;
  if (!loading && error) {
    listBody = (
      <EmptyState
        icon={<WarningCircle size={22}/>}
        title="Couldn't load pay applications"
        text={`${error} Nothing has been lost — try again.`}
        action={<Button icon={<ArrowClockwise size={15}/>} onClick={load}>Retry</Button>}
      />
    );
  } else if (!loading && payApps.length===0) {
    listBody = (
      <EmptyState
        icon={<Clipboard size={22}/>}
        title={revised>0?`${fmt(revised)} under contract — nothing billed yet`:'No pay applications yet'}
        text={revised>0 && coTotal>0 ? `${fmt(original)} base + ${fmt(coTotal)} approved COs` : undefined}
        action={<Button icon={<Plus size={15} weight="bold"/>} href={`/app/projects/${projectId}/pay-apps/new`}>Create Application #1</Button>}
      />
    );
  } else {
    listBody = (
      <DataTable<any>
        tableId="project-pay-apps"
        exportName="pay-applications"
        columns={columns}
        rows={visible}
        loading={loading}
        rowKey={pa=>pa.id}
        onRowClick={pa=>router.push(`/app/projects/${projectId}/pay-apps/${pa.id}`)}
        rowActions={payAppActions}
        rowStyle={pa=>(dragEnabled && draggingIndex===payApps.indexOf(pa) ? { opacity: 0.5 } : undefined)}
        /* Status moves through the same doors as the detail page — submit and
           approve both run lib/pay-app-status (stamps, owner email, the
           conditional lien-waiver cascade) — one pay app at a time. */
        bulkEdit={{
          noun: 'pay application',
          allowed: payRights.edit,
          status: {
            options: payRights.full
              ? [{ value: 'submitted', label: 'Submitted to the owner' }, { value: 'approved', label: 'Approved' }]
              : [{ value: 'submitted', label: 'Submitted to the owner' }],
            apply: (pa, v) => jsonRequest(`/api/pay-apps/${pa.id}/${v === 'approved' ? 'approve' : 'submit'}`, 'POST', { projectId }),
          },
          remove: { allowed: payRights.full, apply: (pa) => jsonRequest(`/api/pay-apps/${pa.id}`, 'DELETE') },
          onDone: () => { void load(); },
        }}
        bulkActions={payRights.edit ? (list => [
          { label:'Export Selected PDFs', icon:<FileText size={14}/>, onClick:()=>{ void handleBulkExport(list); }, disabled: !!downloading },
        ]) : undefined}
        empty={
          <EmptyState
            icon={<Clipboard size={22}/>}
            title="No applications match these filters"
            action={<Button onClick={clearFilters}>Clear Filters</Button>}
          />
        }
      />
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
        subtitle="AIA G702 / G703 billing"
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
