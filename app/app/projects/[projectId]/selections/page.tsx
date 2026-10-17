'use client';
/**
 * Selections — materials, finishes and owner approvals on the job, on the kit
 * layout: StatRow (tiles filter the log) → Toolbar → DataTable, with the
 * selected record in a details rail beside it (stacked on a phone).
 *
 * Reads   GET    /api/selections/list?projectId=
 * Create  POST   /api/selections/create
 * Edit    PUT    /api/selections/:id
 * Approve PUT    /api/selections/:id   { owner_approved: true, status: 'selected' }
 * Delete  DELETE /api/selections/:id
 * Options          components/selections/SelectionOptions (client choices)
 */
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { apiErrorFrom } from '@/lib/api-refusal';
import { confirmDialog } from '@/lib/ui/async-dialog';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { SUB_TRADES, SUB_TRADES_BY_DIVISION } from '@/lib/construction-intelligence';
import {
  Palette, X, Plus, Package, Hourglass, SealCheck, Scales, WarningCircle,
  PencilSimple, Trash, Eye, ArrowSquareOut, ArrowClockwise,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select,
  FormModal, Field, Input, DateInput, Textarea, FormGrid, DetailList, Callout, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import SelectionOptions from '@/components/selections/SelectionOptions';
import { layout } from '@/lib/design-tokens';

const CATEGORIES=['Flooring','Countertops','Cabinets','Plumbing Fixtures','Lighting',
  'Appliances','Tile','Paint','Hardware','Other'];
const STATUSES=['pending','selected','ordered','delivered','installed'];
const STATUS_TONE:Record<string,BadgeTone>={
  pending:'lead',selected:'neutral',ordered:'neutral',delivered:'closed',installed:'ongoing',
};
const STATUS_LABELS:Record<string,string>={
  pending:'Pending',selected:'Selected',ordered:'Ordered',
  delivered:'Delivered',installed:'Installed',
};

// Cents when there are cents: an $899.99 option must not read "$900".
const fmt=(n:number)=>'$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2}));
const signed=(n:number)=>(n>0?'+':'')+fmt(n);
const isoDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const fmtDate=(iso:string|null|undefined)=>iso?new Date(iso.slice(0,10)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';

const EMPTY:Record<string,any>={
  category:'Flooring',item:'',manufacturer:'',model:'',color:'',finish:'',
  cost:'',allowance:'',status:'pending',selected_by:'',
  owner_approved:false,due_date:'',notes:'',link:'',
};

type StatusFilter='all'|'pending'|'approved'|(typeof STATUSES)[number];

const CSS = `
.selWs > .k-page { max-width: none; }
.selCq { container: selws / inline-size; min-width: 0; }
.selSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.selSplit > * { min-width: 0; }
@container selws (min-width: 1080px) {
  .selSplit[data-open="true"] { grid-template-columns: minmax(340px, 1fr) clamp(${layout.detailRailMin}px, 36%, ${layout.detailRailMax}px); }
  .selRail { position: sticky; top: 16px; }
}
.selSection { display: flex; flex-direction: column; gap: 10px; }
.selSection + .selSection { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--border-subtle); }
.selBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.selMuted { color: var(--text-tertiary); }
.selMoney { font-variant-numeric: tabular-nums; white-space: nowrap; }
.selOver { color: var(--danger); font-weight: 700; }
.selUnder { color: var(--success); font-weight: 700; }
.selProse { font-size: var(--fs-md); line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
.selBar { height: 8px; border-radius: 6px; background: var(--bg-surface-2); overflow: hidden; }
.selBar > span { display: block; height: 100%; border-radius: 6px; transition: width .4s; }
.selBarHead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: var(--fs-sm); color: var(--text-secondary); }
.selCheck { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 14px; color: var(--text-primary); cursor: pointer; }
.selCheck input { width: 18px; height: 18px; }
@media (max-width: 640px) {
  .selWs .k-btn, .selWs .k-stat, .selWs select.k-select, .selWs .k-input { min-height: 44px; }
}
`;

export default function SelectionsPage(){
  const {projectId}=useParams() as {projectId:string};
  const [items,setItems]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [selected,setSelected]=useState<any>(null);
  const [mode,setMode]=useState<'view'|'edit'|'create'|null>(null);
  const [form,setForm]=useState<Record<string,any>>({...EMPTY});
  const railRef=useRef<HTMLDivElement>(null);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(mode==='create'||mode==='edit', form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `selections:${projectId}`,
    draftData: mode==='create'?form:undefined,
    restoreDraft: (d) => { setForm(d as Record<string,any>); setMode('create'); setSelected(null); },
    onSave: () => save(),
  });
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const { toast, show } = useToast(4000);
  const showToast=(msg:string,type:'success'|'error'='success')=>show(msg,type==='success'?'good':'bad');
  const [search,setSearch]=useState('');
  const [filterCat,setFilterCat]=useState('all');
  const [filterStatus,setFilterStatus]=useState<StatusFilter>('all');
  // SmartCreate: one-shot project snapshot — known vendors, owner, allowance money.
  const { ctx } = useProjectContext(projectId);
  const [auto,setAuto]=useState<{due?:boolean}>({});

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch(`/api/selections/list?projectId=${projectId}`,{headers:h});
      if (!r.ok) throw await apiErrorFrom(r, 'Failed to load data');
      const d=await r.json();
      // The DB uses item_name / selected_amount; this page reads item / cost.
      // Alias them so a saved selection's name + cost render on reload (the rest
      // — manufacturer/model/color/finish/link/owner_approved — are real columns).
      const next=(d.selections||[]).map((s:any)=>({
        ...s,
        item: s.item ?? s.item_name ?? '',
        cost: Number(s.cost ?? s.selected_amount ?? 0),
        allowance: Number(s.allowance ?? 0),
      }));
      setItems(next);
      // Keep the open record in step with the fresh read.
      setSelected((prev:any)=>prev?(next.find((x:any)=>x.id===prev.id)??prev):prev);
    }catch{setItems([]);setLoadError('Failed to load. Please try again.');}
    finally{setLoading(false);}
  },[projectId]);

  useEffect(()=>{load();},[load]);

  function openCreate(){
    setForm({...EMPTY,due_date:isoDate(new Date(Date.now()+30*86400000))});
    setAuto({due:true});
    setMode('create');setSelected(null);
  }
  function openEdit(item:any){
    setForm({category:item.category||'Flooring',item:item.item||'',
      manufacturer:item.manufacturer||'',model:item.model||'',
      color:item.color||'',finish:item.finish||'',
      cost:item.cost??'',allowance:item.allowance??'',
      status:item.status||'pending',selected_by:item.selected_by||'',
      owner_approved:item.owner_approved||false,due_date:item.due_date||'',
      notes:item.notes||'',link:item.link||''});
    setAuto({});setSelected(item);setMode('edit');
  }
  function viewItem(item:any){
    setSelected(item);setMode('view');
    requestAnimationFrame(()=>{
      const el=railRef.current;
      if(el&&el.getBoundingClientRect().top>window.innerHeight*0.6) el.scrollIntoView({behavior:'smooth',block:'start'});
    });
  }
  function closePanel(){setSelected(null);setMode(null);}
  /** Closing the composer: back to the record it came from (edit) or nothing (create). */
  function closeComposer(){
    guard.requestClose(()=>{ if(mode==='edit'&&selected) setMode('view'); else closePanel(); });
  }

  async function save(): Promise<boolean> {
    if(!form.item.trim()){showToast('Item name is required.','error');return false;}
    setSaving(true);
    try{
      const h=await getAuthHeaders();
      const payload={...form,cost:form.cost!==''?Number(form.cost):0,allowance:form.allowance!==''?Number(form.allowance):0};
      if(mode==='create'){
        const r=await fetch('/api/selections/create',{
          method:'POST',headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify({...payload,projectId}),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Selection added');
      }else if(mode==='edit'&&selected){
        const r=await fetch(`/api/selections/${selected.id}`,{
          method:'PUT',headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify(payload),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Selection updated');
      }
      await load();closePanel();
      guard.clearDraft();
      return true;
    }catch(e:any){console.error(e);showToast(humanError(e,'Save failed. Please try again.'),'error');}
    finally{setSaving(false);}
    return false;
  }

  async function approve(item:any){
    try{
      const h=await getAuthHeaders();
      const ar=await fetch(`/api/selections/${item.id}`,{
        method:'PUT',headers:{...h,'Content-Type':'application/json'},
        body:JSON.stringify({owner_approved:true,status:'selected'}),
      });
      if (!ar.ok) throw await apiErrorFrom(ar, 'Approval failed');
      showToast('Owner approval recorded');await load();
    }catch(e:any){console.error(e);showToast(humanError(e,'Something went wrong. Please try again.'),'error');}
  }

  async function deleteItem(item:any){
    if(!(await confirmDialog({ title: 'Please confirm', message: `Delete "${item.item}"?`, danger: true }))) return;
    setDeleting(true);
    try{
      const h=await getAuthHeaders();
      const dr=await fetch(`/api/selections/${item.id}`,{method:'DELETE',headers:h});
      if (!dr.ok) throw await apiErrorFrom(dr, 'Delete failed');
      showToast('Selection deleted');closePanel();await load();
    }catch{showToast('Delete failed','error');}
    finally{setDeleting(false);}
  }

  const cats=Array.from(new Set(items.map((i:any)=>i.category).filter(Boolean))) as string[];
  const filtered=items.filter((i:any)=>{
    const q=search.toLowerCase();
    const ms=!search||(i.item||'').toLowerCase().includes(q)
      ||(i.manufacturer||'').toLowerCase().includes(q);
    const mc=filterCat==='all'||i.category===filterCat;
    const mst=filterStatus==='all'||(filterStatus==='approved'?!!i.owner_approved:i.status===filterStatus);
    return ms&&mc&&mst;
  });

  const totalCost=items.reduce((s:number,i:any)=>s+(Number(i.cost)||0),0);
  const totalAllowance=items.reduce((s:number,i:any)=>s+(Number(i.allowance)||0),0);
  const pendingCount=items.filter((i:any)=>i.status==='pending').length;
  const approvedCount=items.filter((i:any)=>i.owner_approved).length;
  const overage=totalCost-totalAllowance;
  const filtersActive=!!search||filterCat!=='all'||filterStatus!=='all';
  const clearFilters=()=>{setSearch('');setFilterCat('all');setFilterStatus('all');};

  const stats:StatItem[]=[
    {label:'Total items',value:items.length,sub:loading?undefined:`${cats.length} ${cats.length===1?'category':'categories'}`,icon:<Package size={15}/>,onClick:()=>setFilterStatus('all'),active:filterStatus==='all'},
    {label:'Pending decision',value:pendingCount,tone:pendingCount>0?'warn':'default',sub:loading?undefined:pendingCount>0?'Waiting on the owner':'None waiting',icon:<Hourglass size={15}/>,onClick:()=>setFilterStatus('pending'),active:filterStatus==='pending'},
    {label:'Owner approved',value:approvedCount,tone:approvedCount>0?'good':'default',sub:loading?undefined:`of ${items.length}`,icon:<SealCheck size={15}/>,onClick:()=>setFilterStatus('approved'),active:filterStatus==='approved'},
    ...(totalAllowance>0?[{label:overage>0?'Over allowance':'Under allowance',value:fmt(Math.abs(overage)),tone:(overage>0?'bad':'good') as 'bad'|'good',sub:`${fmt(totalCost)} of ${fmt(totalAllowance)}`,icon:<Scales size={15}/>}]:[]),
  ];

  const columns:Column<any>[]=[
    {key:'item',header:'Item',primary:true,accessor:(r)=>(r.item||'').toLowerCase(),render:(r)=>r.item||'Untitled'},
    {key:'category',header:'Category',render:(r)=>r.category||'Other'},
    {key:'manufacturer',header:'Manufacturer',render:(r)=>r.manufacturer||''},
    {key:'model',header:'Model / SKU',hidden:true,render:(r)=>r.model||''},
    {key:'color',header:'Color',hidden:true,render:(r)=>r.color||''},
    {key:'finish',header:'Finish',hidden:true,render:(r)=>r.finish||''},
    {key:'status',header:'Status',phone:'show',accessor:(r)=>STATUS_LABELS[r.status]||r.status||'',render:(r)=>(
      <span className="selBadges">
        <Badge tone={STATUS_TONE[r.status]||'neutral'} dot>{STATUS_LABELS[r.status]||r.status}</Badge>
        {r.owner_approved&&<Badge tone="ongoing">Owner approved</Badge>}
      </span>
    )},
    {key:'cost',header:'Price',align:'right',phone:'show',total:'sum',format:fmt,accessor:(r)=>Number(r.cost)||0,render:(r)=><span className="selMoney">{r.cost>0?fmt(r.cost):''}</span>},
    {key:'allowance',header:'Allowance',align:'right',total:'sum',format:fmt,accessor:(r)=>Number(r.allowance)||0,render:(r)=><span className="selMoney">{r.allowance>0?fmt(r.allowance):''}</span>},
    {key:'variance',header:'Variance',align:'right',phone:'show',total:'sum',format:signed,accessor:(r)=>(Number(r.cost)||0)-(Number(r.allowance)||0),render:(r)=>{
      const v=(Number(r.cost)||0)-(Number(r.allowance)||0);
      if(!(r.cost>0)&&!(r.allowance>0)) return '';
      return <span className={`selMoney ${v>0?'selOver':v<0?'selUnder':''}`}>{signed(v)}</span>;
    }},
    {key:'selected_by',header:'Selected by',hidden:true,render:(r)=>r.selected_by||''},
    {key:'due_date',header:'Decision due',accessor:(r)=>r.due_date||'',render:(r)=>fmtDate(r.due_date)},
  ];

  function rowActions(item:any):Action[]{
    const pending=String(item.status||'pending').toLowerCase()==='pending';
    return [
      {label:'View',icon:<Eye size={15}/>,onClick:()=>viewItem(item)},
      {label:'Edit',icon:<PencilSimple size={15}/>,onClick:()=>openEdit(item)},
      {label:'Record owner approval',icon:<SealCheck size={15}/>,onClick:()=>approve(item),hidden:!!item.owner_approved||!pending},
      {label:'Delete',icon:<Trash size={15}/>,onClick:()=>deleteItem(item),tone:'danger',disabled:deleting},
    ];
  }

  const base=`/app/projects/${projectId}`;
  const showRail=!!selected&&mode==='view';
  const formPrice=Number(form.cost)||0, formAllow=Number(form.allowance)||0, formVar=formPrice-formAllow;

  const rail=showRail&&(()=>{
    const s=selected;
    const pending=String(s.status||'pending').toLowerCase()==='pending';
    const over=s.cost>0&&s.allowance>0&&s.cost>s.allowance;
    return(
      <aside ref={railRef} className="selRail" aria-label="Selection details">
        <Card
          title={s.item||'Untitled'}
          subtitle={s.category}
          actions={<>
            <Button size="sm" icon={<PencilSimple size={14}/>} onClick={()=>openEdit(s)}>Edit</Button>
            <Button size="sm" variant="danger" icon={<Trash size={14}/>} onClick={()=>deleteItem(s)} disabled={deleting}>{deleting?'Deleting…':'Delete'}</Button>
            <Button variant="ghost" size="sm" icon={<X size={16}/>} aria-label="Close details" title="Close details" onClick={closePanel}/>
          </>}
        >
          <div className="selSection">
            <div className="selBadges">
              <Badge tone={STATUS_TONE[s.status]||'neutral'} dot>{STATUS_LABELS[s.status]||s.status}</Badge>
              {s.owner_approved&&<Badge tone="ongoing">Owner approved</Badge>}
            </div>
            {!s.owner_approved&&pending&&(
              <Button icon={<SealCheck size={15}/>} onClick={()=>approve(s)}>Record owner approval</Button>
            )}
          </div>

          <div className="selSection">
            <SelectionOptions
              key={s.id}
              selectionId={s.id}
              projectId={projectId}
              allowance={Number(s.allowance)||0}
              pending={pending}
              onToast={showToast}
            />
          </div>

          <div className="selSection">
            <DetailList items={[
              ['Manufacturer',s.manufacturer||''],
              ['Model / SKU',s.model||''],
              ['Color',s.color||''],
              ['Finish',s.finish||''],
              ['Cost',s.cost>0?fmt(s.cost):''],
              ['Allowance',s.allowance>0?fmt(s.allowance):''],
              ['Selected By',s.selected_by||''],
              ['Decision Due',s.due_date?fmtDate(s.due_date):''],
            ]}/>
          </div>

          {s.cost>0&&s.allowance>0&&(
            <div className="selSection">
              <Callout
                tone={over?'danger':'success'}
                icon={<Scales size={16}/>}
                title={`${fmt(s.cost-s.allowance)} vs allowance`}
                actions={over&&s.owner_approved&&String(s.status||'').toLowerCase()!=='pending'
                  ?<Button size="sm" href={`${base}/change-orders`}>Open change orders</Button>:undefined}
              />
            </div>
          )}

          {(s.link||s.notes)&&(
            <div className="selSection">
              {s.link&&(
                <a className="k-btn k-btn-secondary" href={s.link} target="_blank" rel="noopener noreferrer">
                  <ArrowSquareOut size={15}/>View product link
                </a>
              )}
              {s.notes&&<div className="selProse">{s.notes}</div>}
            </div>
          )}
        </Card>
      </aside>
    );
  })();

  let listBody:React.ReactNode;
  if(loadError){
    listBody=(
      <EmptyState icon={<WarningCircle size={22}/>} title="Couldn't load selections" text={loadError}
        action={<Button icon={<ArrowClockwise size={15}/>} onClick={()=>load()}>Try again</Button>}/>
    );
  }else if(!loading&&items.length===0){
    listBody=(
      <EmptyState icon={<Palette size={22}/>} title="No selections yet"
        action={<Button icon={<Plus size={15} weight="bold"/>} onClick={openCreate}>Add selection</Button>}/>
    );
  }else{
    listBody=(
      <DataTable<any>
        tableId="project-selections"
        exportName="selections"
        columns={columns}
        rows={filtered}
        loading={loading}
        rowKey={(r)=>r.id}
        defaultSort={{key:'category',dir:'asc'}}
        onRowClick={viewItem}
        isSelected={(r)=>showRail&&selected?.id===r.id}
        rowActions={rowActions}
        empty={items.length===0?(
          <EmptyState icon={<Palette size={22}/>} title="No selections yet"
            action={<Button icon={<Plus size={15} weight="bold"/>} onClick={openCreate}>Add selection</Button>}/>
        ):(
          <EmptyState title="Nothing matches" onClearFilters={clearFilters}/>
        )}
      />
    );
  }

  return(
    <div className="selWs">
      <style dangerouslySetInnerHTML={{__html:CSS}}/>
      <PageShell
        crumbs={[
          {label:'Projects',href:'/app/projects'},
          {label:ctx?.project?.name||'Project',href:`${base}/overview`},
          {label:'Selections'},
        ]}
        title="Selections"
        actions={
          <Button variant="primary" icon={<Plus size={15} weight="bold"/>} onClick={openCreate}>Add selection</Button>
        }
      >
        {!loadError&&!loading&&items.length>0&&<StatRow items={stats}/>}

        {!loading&&!loadError&&totalAllowance>0&&(
          <Card>
            <div className="selBarHead">
              <span>Budget vs allowance</span>
              <strong className={overage>0?'selOver':'selUnder'}>{fmt(totalCost)} / {fmt(totalAllowance)}</strong>
            </div>
            <div className="selBar" role="img" aria-label={`${fmt(totalCost)} selected against ${fmt(totalAllowance)} in allowances`}>
              <span style={{background:overage>0?'var(--danger)':'var(--success)',width:`${Math.min(100,totalAllowance>0?(totalCost/totalAllowance*100):0)}%`}}/>
            </div>
          </Card>
        )}

        {!loading&&!loadError&&items.length>0&&(
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search selections by item or manufacturer…"
            filters={
              <>
                <Select aria-label="Category" value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{width:'auto',minWidth:170}}
                  options={[{value:'all',label:'All categories'},...cats]}/>
                <Select aria-label="Status" value={filterStatus} onChange={e=>setFilterStatus(e.target.value as StatusFilter)} style={{width:'auto',minWidth:160}}
                  options={[{value:'all',label:'All statuses'},...STATUSES.map(s=>({value:s,label:STATUS_LABELS[s]})),{value:'approved',label:'Owner approved'}]}/>
                {filtersActive&&<Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={filtersActive?<span className="selMuted" style={{fontSize:'var(--fs-sm)'}}>{filtered.length} of {items.length}</span>:undefined}
          />
        )}

        <div className="selCq">
          <div className="selSplit" data-open={showRail?'true':'false'}>
            {!loading&&items.length===0&&!loadError?listBody:<Card flush>{listBody}</Card>}
            {rail}
          </div>
        </div>
      </PageShell>

      <FormModal
        open={mode==='create'||mode==='edit'}
        onClose={closeComposer}
        title={mode==='create'?'New selection':'Edit selection'}
        subtitle={mode==='create'?`${items.length} logged · ${pendingCount} pending · ${fmt(totalAllowance)} in allowances`:selected?.item}
        onSubmit={async()=>{await save();}}
        submitLabel={mode==='create'?'Add selection':'Save changes'}
        busy={saving}
      >
        <FormGrid cols={2}>
          <Field label="Category">
            <select className="k-select" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
              {form.category&&!CATEGORIES.includes(form.category)&&!SUB_TRADES.includes(form.category)&&(
                <option value={form.category}>{form.category}</option>
              )}
              <optgroup label="Material Categories">
                {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
              </optgroup>
              {SUB_TRADES_BY_DIVISION.map(g=>(
                <optgroup key={g.division} label={'Trade Verticals — '+g.division+' '+g.name}>
                  {g.trades.map(t=><option key={t} value={t}>{t}</option>)}
                </optgroup>
              ))}
              <optgroup label="Trade Verticals — Other / Specialty">
                {SUB_TRADES.filter(t=>!SUB_TRADES_BY_DIVISION.some(g=>g.trades.includes(t))).map(t=><option key={t} value={t}>{t}</option>)}
              </optgroup>
            </select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}
              options={STATUSES.map(s=>({value:s,label:STATUS_LABELS[s]}))}/>
          </Field>
          <Field label="Item name" required span>
            <Input value={form.item} onChange={e=>setForm(f=>({...f,item:e.target.value}))}
              placeholder="Kitchen faucet, quartz countertop…" autoFocus/>
          </Field>
          <Field label="Manufacturer / Vendor" hint={(ctx?.vendors||[]).length>0?`${(ctx.vendors||[]).length} known vendors on this project — start typing to match.`:undefined}>
            <Suggest className="k-input" value={form.manufacturer} onChange={e=>setForm(f=>({...f,manufacturer:e.target.value}))}
              placeholder="Kohler, Moen…" options={((ctx?.vendors || []) as string[]).filter(Boolean)}/>
          </Field>
          <Field label="Model / SKU">
            <Input value={form.model} onChange={e=>setForm(f=>({...f,model:e.target.value}))} placeholder="K-99273-0"/>
          </Field>
          <Field label="Color">
            <Input value={form.color} onChange={e=>setForm(f=>({...f,color:e.target.value}))} placeholder="Matte Black"/>
          </Field>
          <Field label="Finish">
            <Input value={form.finish} onChange={e=>setForm(f=>({...f,finish:e.target.value}))} placeholder="Brushed Nickel"/>
          </Field>
          <Field label="Selected price ($)">
            <Input type="number" inputMode="decimal" value={form.cost} onChange={e=>setForm(f=>({...f,cost:e.target.value}))} placeholder="0" min={0}/>
          </Field>
          <Field label="Allowance ($)">
            <Input type="number" inputMode="decimal" value={form.allowance} onChange={e=>setForm(f=>({...f,allowance:e.target.value}))} placeholder="0" min={0}/>
          </Field>
          {(formPrice>0||formAllow>0)&&(
            <div className="k-span-all">
              <Callout
                tone={formVar>0?'danger':'success'}
                icon={<Scales size={16}/>}
                title={`${formVar>0?'Over allowance':formVar<0?'Under allowance':'On allowance'}: ${signed(formVar)}`}
                text={`${fmt(formPrice)} selected against ${fmt(formAllow)} allowance.`}
              />
            </div>
          )}
          <Field label="Selected by">
            <Input value={form.selected_by} onChange={e=>setForm(f=>({...f,selected_by:e.target.value}))} placeholder="Owner or designer name"/>
          </Field>
          <Field label="Decision due" hint={auto.due?'Defaulted 30 days out — tighten to order lead times.':undefined}>
            <DateInput value={form.due_date} onChange={e=>{const v=e.target.value;setAuto(a=>({...a,due:false}));setForm(f=>({...f,due_date:v}));}}/>
          </Field>
          <Field label="Product link" span>
            <Input type="url" value={form.link} onChange={e=>setForm(f=>({...f,link:e.target.value}))} placeholder="https://…"/>
          </Field>
          <Field label="Notes" span>
            <Textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Additional notes…"/>
          </Field>
          <div className="k-field k-span-all">
            <label className="selCheck">
              <input type="checkbox" checked={!!form.owner_approved} onChange={e=>setForm(f=>({...f,owner_approved:e.target.checked}))}/>
              Owner approved
            </label>
            <span className="k-hint">Leave unchecked to track the decision{ctx?.project?.ownerName?` with ${ctx.project.ownerName}`:''} — approval can be recorded later from the detail view.</span>
          </div>
        </FormGrid>
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{position:'relative',zIndex:10001}}>
        <UnsavedGuardModal guard={guard}/>
      </div>
      <Toast message={toast?.message??null} tone={toast?.tone}/>
    </div>
  );
}
