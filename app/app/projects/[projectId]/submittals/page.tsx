'use client';
/**
 * Submittal Log — Pass 4, on the RFIs reference layout (dense table + detail).
 *
 * Anatomy: title + one primary action (New Submittal) → StatRow (total /
 * pending / under review / overdue — each tile filters the log) → Toolbar →
 * workspace split: the log on the left, and when a row is selected, the
 * submittal beside a 320–384px details + action rail (advance the workflow,
 * reassign ball-in-court, edit, delete). Phone: stacked. Create / edit open
 * the composer in a FormModal. The log is the shared DataTable: saved views,
 * grouping, column picker and CSV export.
 *
 * Every read / write is the one this screen already used:
 *   list    GET    /api/submittals/list?projectId=
 *   create  POST   /api/submittals/create
 *   update  PUT    /api/submittals/[id]
 *   quick   PATCH  /api/submittals/[id]   { status } / { ball_in_court }
 *   delete  DELETE /api/submittals/[id]
 */
import { itemBulkEdit } from '@/lib/items/bulk';
import { useEditRights } from '@/lib/hooks/usePermissions';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { confirmDialog } from '@/lib/ui/async-dialog';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOpenOnNew } from '@/lib/ui/open-on-new';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { Plus, Clipboard, X, CaretRight, ClipboardText, WarningCircle, PencilSimple, Trash, UserSwitch, ArrowClockwise, ArrowSquareOut, Stack, HourglassMedium, MagnifyingGlass, CalendarX, Compass } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Avatar, Button, Toolbar, DataTable, EmptyState, RowActions,
  FormModal, Field, Input, Textarea, Select, FormGrid, DetailList, Toast, useToast, Callout,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { CSI_DIVISIONS, SUB_TRADES } from '@/lib/construction-intelligence';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { layout } from '@/lib/design-tokens';
import { localDay } from '@/lib/calendar-day';
import { useOpenRecord } from '@/lib/ui/open-on-new';
import WorkflowChain from '@/components/submittals/WorkflowChain';
import { ballHolder, isWithDesign } from '@/lib/submittal-workflow';

const STATUSES=['pending','submitted','under_review','approved','rejected','revise_resubmit'];
const STATUS_LABELS:Record<string,string>={
  pending:'Pending',
  submitted:'Submitted',
  under_review:'Under Review',
  approved:'Approved',
  rejected:'Rejected',
  revise_resubmit:'Revise & Resubmit',
};
/** One status → one badge. Pending neutral, Submitted blue (with the architect),
 *  Under Review amber, Approved green, Rejected red, Revise & Resubmit orange. */
function statusBadge(s:string|null|undefined): { label:string; tone:BadgeTone } {
  const k = String(s||'pending');
  if (k==='submitted') return { label:'Submitted', tone:'lead' };
  if (k==='under_review') return { label:'Under Review', tone:'under_contract' };
  if (k==='approved') return { label:'Approved', tone:'ongoing' };
  if (k==='rejected') return { label:'Rejected', tone:'overdue' };
  if (k==='revise_resubmit') return { label:'Revise & Resubmit', tone:'completed' };
  return { label: STATUS_LABELS[k] || k.replace(/_/g,' ').replace(/\b\w/g,(c)=>c.toUpperCase()) || 'Pending', tone:'neutral' };
}
const BIC_OPTIONS=['Contractor','Architect','Owner','Engineer'];
type StatusFilter = 'all' | 'overdue' | 'with_design' | (typeof STATUSES)[number];

const isoDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
function fmtDate(s:string|null|undefined){
  if(!s) return '—';
  return new Date(String(s).slice(0,10)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}

const EMPTY_FORM={
  submittal_number:'',title:'',spec_section:'',trade:'',
  status:'pending',ball_in_court:'Contractor',
  submitted_at:'',due_date:'',revision_number:0,notes:'',
};

const CSS = `
.sbWs > .k-page { max-width: none; }
.sbCq { container: sbws / inline-size; min-width: 0; }
.sbSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.sbSplit > * { min-width: 0; }
@container sbws (min-width: 1080px) {
  .sbSplit[data-open="true"] { grid-template-columns: minmax(340px, 0.8fr) minmax(0, 1.6fr); }
}
.sbDetailCq { container: sbdetail / inline-size; min-width: 0; }
.sbDetail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.sbDetail > * { min-width: 0; }
.sbRail { order: -1; }
@container sbdetail (min-width: 720px) {
  .sbDetail { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 34%, ${layout.detailRailMax}px); }
  .sbRail { order: 0; position: sticky; top: 16px; }
}
.sbList .k-table th:first-child, .sbList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.sbList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.sbList .k-table tbody tr:hover td:first-child { background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), var(--bg-solid); }
.sbList .k-table tbody tr:has([data-sel="true"]) td { background: var(--brand-primary-08); }
.sbList .k-table tbody tr:has([data-sel="true"]) td:first-child { background: linear-gradient(var(--brand-primary-08), var(--brand-primary-08)), var(--bg-solid); box-shadow: inset 3px 0 0 var(--brand-primary); }
.sbNum { color: var(--text-primary); font-weight: 800; white-space: nowrap; }
.sbTitle { display: flex; flex-direction: column; gap: 2px; max-width: 360px; min-width: 0; }
.sbTitle > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.sbTitle > span:first-child { color: var(--text-primary); font-weight: 600; }
.sbTitle > span + span { font-size: var(--fs-xs); color: var(--text-tertiary); }
.sbMuted { color: var(--text-tertiary); }
.sbLate { color: var(--status-overdue); font-weight: 700; }
.sbBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.sbSection { display: flex; flex-direction: column; gap: 8px; }
.sbSection + .sbSection { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
.sbSectionTitle { font-size: var(--fs-sm); font-weight: 700; color: var(--text-tertiary); }
.sbProse { font-size: var(--fs-md); line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; max-width: ${layout.readingMaxWidth}; }
.sbBic { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.sbBicText { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.sbBicText > span:first-child { color: var(--text-primary); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
.sbBicText > span + span { font-size: var(--fs-xs); color: var(--text-tertiary); font-weight: 700; }
.sbBic[data-late="true"] .sbBicText > span + span { color: var(--danger); }
.sbActions { display: flex; flex-direction: column; gap: 8px; }
.sbActions .k-btn { width: 100%; justify-content: flex-start; }
.sbActionsRow { display: flex; gap: 8px; align-items: center; }
.sbActionsRow > .k-btn { flex: 1 1 auto; }
.sbNext { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.5; }
.sbDateInput { width: 100%; }
@media (max-width: 640px) {
  .sbWs .k-btn, .sbWs .k-stat, .sbWs select.k-select, .sbWs .k-input { min-height: 44px; }
  .sbWs .k-table td { height: 48px; }
  .sbTitle { max-width: 200px; }
}
`;

const DATE_INPUT_STYLE: React.CSSProperties = {
  width:'100%', minHeight:40, padding:'8px 12px', fontSize:14,
  background:'var(--bg-surface-2)', border:'1px solid var(--border-default)',
  borderRadius:'var(--radius-sm)', color:'var(--text-primary)',
};

export default function SubmittalsPage(){
  const {projectId}=useParams() as {projectId:string};
  const [submittals,setSubmittals]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [selected,setSelected]=useState<any>(null);
  const [mode,setMode]=useState<'view'|'edit'|'create'|null>(null);
  const [form,setForm]=useState<Record<string,any>>({...EMPTY_FORM});
  const detailRef = useRef<HTMLDivElement>(null);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(mode==='create'||mode==='edit', form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `submittals:${projectId}`,
    draftData: mode==='create'?form:undefined,
    restoreDraft: (d) => { setForm(d as Record<string,any>); setMode('create'); setSelected(null); },
    onSave: () => save(),
  });
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [rowBusyId,setRowBusyId]=useState<string|null>(null);
  const { toast, show: showToast } = useToast(4000);
  const rights = useEditRights('Submittals');
  const [search,setSearch]=useState('');
  const [filterStatus,setFilterStatus]=useState<StatusFilter>('all');
  const [filterBIC,setFilterBIC]=useState('all');
  // SmartCreate: the create panel walks in knowing the project — reviewer,
  // sub roster, log state — via the one-shot /api/project-context snapshot.
  const { ctx } = useProjectContext(projectId);
  const [auto,setAuto]=useState<{num?:boolean;due?:boolean;bic?:boolean}>({});

  const today=localDay(); // This device's day — toISOString() is the UTC day, tomorrow from 7 PM on in Iowa.

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch(`/api/submittals/list?projectId=${projectId}`,{headers:h});
      if (!r.ok) throw new Error('Failed to load data');
      const d=await r.json();
      setSubmittals(d.submittals||[]);
    }catch{setSubmittals([]);setLoadError('Failed to load. Please try again.');}
    finally{setLoading(false);}
  },[projectId]);

  useEffect(()=>{load();},[load]);

  // Keep the selected row pointed at the live record once a reload swaps rows in.
  useEffect(()=>{
    if(!selected) return;
    const live = submittals.find((s:any)=>s.id===selected.id);
    if(live && live!==selected) setSelected(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[submittals]);

  // ?new=1 (the job page's empty tool row) opens the create form.
  useOpenOnNew(openCreate, !loading);
  function openCreate(){
    const num=`S-${String(submittals.length+1).padStart(3,'0')}`;
    const due=isoDate(new Date(Date.now()+14*86400000));
    setForm({...EMPTY_FORM,submittal_number:num,due_date:due});
    setAuto({num:true,due:true,bic:true});
    setMode('create');setSelected(null);
  }
  function openEdit(sub:any){
    setForm({
      submittal_number:sub.submittal_number||'',
      title:sub.title||'',
      spec_section:sub.spec_section||'',
      trade:sub.trade||'',
      status:sub.status||'pending',
      ball_in_court:sub.ball_in_court||'Contractor',
      submitted_at:sub.submitted_at?sub.submitted_at.substring(0,10):'',
      due_date:sub.due_date?sub.due_date.substring(0,10):'',
      revision_number:sub.revision_number??0,
      notes:sub.notes||'',
    });
    setAuto({});setSelected(sub);setMode('edit');
  }
  function viewSub(sub:any){setSelected(sub);setMode('view');}
  // Search hit (?open=<id>) lands on that submittal's detail.
  useOpenRecord((id)=>{const s=submittals.find((x:any)=>x.id===id); if(s) viewSub(s);}, !loading);
  function closePanel(){setSelected(null);setMode(null);}
  /** Abandoning an edit keeps the submittal in view. */
  function closeComposer(){ if(mode==='edit'&&selected){ setMode('view'); return; } closePanel(); }

  async function save(): Promise<boolean> {
    if(!form.title.trim()){showToast('Title is required.','bad');return false;}
    setSaving(true);
    try{
      const h=await getAuthHeaders();
      const payload={
        ...form,
        revision_number:Number(form.revision_number)||0,
        submitted_at:form.submitted_at||null,
        due_date:form.due_date||null,
      };
      if(mode==='create'){
        const r=await fetch('/api/submittals/create',{
          method:'POST',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify({...payload,projectId}),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Submittal created.');
      }else if(mode==='edit'&&selected){
        const r=await fetch(`/api/submittals/${selected.id}`,{
          method:'PUT',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify(payload),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Submittal updated.');
      }
      await load();closePanel();
      guard.clearDraft();
      return true;
    }catch(e:any){console.error(e);showToast(humanError(e,'Save failed. Please try again.'),'bad');}
    finally{setSaving(false);}
    return false;
  }

  async function deleteSub(sub:any){
    if(!(await confirmDialog({ title: 'Please confirm', message: `Delete submittal "${sub.submittal_number} — ${sub.title}"?`, danger: true }))) return;
    setDeleting(true);
    try{
      const h=await getAuthHeaders();
      const dr=await fetch(`/api/submittals/${sub.id}`,{method:'DELETE',headers:h});
      if (!dr.ok) throw new Error('Delete failed');
      showToast('Submittal deleted.');closePanel();await load();
    }catch{showToast('Delete failed.','bad');}
    finally{setDeleting(false);}
  }

  // Inline PATCH used by the list-row quick actions (status advance + ball-in-court
  // reassign). Optimistically updates local rows so the change shows instantly.
  async function patchSubmittal(sub:any,patch:Record<string,any>,msg:string){
    setRowBusyId(sub.id);
    setSubmittals(prev=>prev.map(x=>x.id===sub.id?{...x,...patch}:x));
    if(selected?.id===sub.id) setSelected((p:any)=>p?{...p,...patch}:p);
    try{
      const h=await getAuthHeaders();
      const r=await fetch(`/api/submittals/${sub.id}`,{
        method:'PATCH',
        headers:{...h,'Content-Type':'application/json'},
        body:JSON.stringify(patch),
      });
      if(!r.ok) throw new Error('Update failed');
      showToast(msg);
    }catch{showToast('Update failed — reloading.','bad');await load();}
    finally{setRowBusyId(null);}
  }

  // Advance a submittal one step along the review workflow.
  function advanceStatus(sub:any){
    const cur=sub.status||'pending';
    const idx=STATUSES.indexOf(cur);
    const next=idx>=0&&idx<STATUSES.length-1?STATUSES[idx+1]:null;
    if(!next) return;
    patchSubmittal(sub,{status:next},`Advanced to ${STATUS_LABELS[next]}`);
  }
  function nextStatusLabel(sub:any){
    const idx=STATUSES.indexOf(sub.status||'pending');
    return idx>=0&&idx<STATUSES.length-1?STATUS_LABELS[STATUSES[idx+1]]:null;
  }
  function reassignBIC(sub:any,bic:string){
    if(!bic||bic===sub.ball_in_court) return;
    patchSubmittal(sub,{ball_in_court:bic},`Ball in court → ${bic}`);
  }

  const total=submittals.length;
  const pending=submittals.filter(s=>s.status==='pending').length;
  const underReview=submittals.filter(s=>s.status==='under_review').length;
  function isOverdue(s:any){
    return !!(s.due_date&&s.due_date.substring(0,10)<today&&s.status!=='approved'&&s.status!=='rejected');
  }
  const overdue=submittals.filter(isOverdue).length;
  const withDesign=submittals.filter(isWithDesign).length;

  // Canonical CSI spec-section options + the live sub roster for the create panel.
  const specOptions=Object.entries(CSI_DIVISIONS).map(([code,d])=>`${code} — ${d.name}`);
  const roster=(ctx?.subs||[]) as any[];

  const filtered=submittals.filter(s=>{
    const ms=!search
      ||(s.submittal_number||'').toLowerCase().includes(search.toLowerCase())
      ||(s.title||'').toLowerCase().includes(search.toLowerCase())
      ||(s.spec_section||'').toLowerCase().includes(search.toLowerCase())
      ||(s.trade||'').toLowerCase().includes(search.toLowerCase());
    const mst=filterStatus==='all'||(filterStatus==='overdue'?isOverdue(s):filterStatus==='with_design'?isWithDesign(s):s.status===filterStatus);
    const mb=filterBIC==='all'||s.ball_in_court===filterBIC;
    return ms&&mst&&mb;
  });
  const filtersActive = !!search || filterStatus!=='all' || filterBIC!=='all';
  const clearFilters = () => { setSearch(''); setFilterStatus('all'); setFilterBIC('all'); };
  const toggleStatus = (s:StatusFilter) => setFilterStatus(prev => (prev===s ? 'all' : s));

  const detailOpen = !!selected && mode!=='create';
  useEffect(()=>{
    if(!detailOpen) return;
    const el = detailRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ behavior:'smooth', block:'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[detailOpen, selected?.id]);

  // ── Stat tiles: each filters the log ──
  const stats: StatItem[] = loading
    ? [
        { label:'Total', value:'—', sub:'Loading…', icon:<Stack size={15}/> },
        { label:'Pending', value:'—', sub:'Loading…', icon:<HourglassMedium size={15}/> },
        { label:'Under Review', value:'—', sub:'Loading…', icon:<MagnifyingGlass size={15}/> },
        { label:'With Architect', value:'—', sub:'Loading…', icon:<Compass size={15}/> },
        { label:'Overdue', value:'—', sub:'Loading…', icon:<CalendarX size={15}/> },
      ]
    : [
        { label:'Total', value:total, sub: filtersActive ? 'Click to show everything' : 'Submittals on the log', icon:<Stack size={15}/>, onClick: filtersActive ? clearFilters : undefined },
        { label:'Pending', value:pending, sub: filterStatus==='pending' ? 'Filtered — click to clear' : 'Awaiting submission', icon:<HourglassMedium size={15}/>, onClick:()=>toggleStatus('pending'), active: filterStatus==='pending' },
        { label:'Under Review', value:underReview, tone: underReview>0 ? 'warn' : 'default', sub: filterStatus==='under_review' ? 'Filtered — click to clear' : 'With the reviewer', icon:<MagnifyingGlass size={15}/>, onClick:()=>toggleStatus('under_review'), active: filterStatus==='under_review' },
        { label:'With Architect', value:withDesign, tone: withDesign>0 ? 'warn' : 'default', sub: filterStatus==='with_design' ? 'Filtered — click to clear' : withDesign>0 ? 'Ball with the A/E or owner' : 'None out for review', icon:<Compass size={15}/>, onClick:()=>toggleStatus('with_design'), active: filterStatus==='with_design' },
        { label:'Overdue', value:overdue, tone: overdue>0 ? 'bad' : 'default', sub: filterStatus==='overdue' ? 'Filtered — click to clear' : overdue>0 ? 'Past required date' : 'None overdue', icon:<CalendarX size={15}/>, onClick:()=>toggleStatus('overdue'), active: filterStatus==='overdue' },
      ];

  // ── Log columns ──
  const isSel = (s:any) => selected?.id===s.id && mode!=='create';
  const numCol: Column<any> = { key:'submittal_number', header:'#', accessor:s=>s.submittal_number||'', width:90, render:s=><span className="sbNum" data-sel={isSel(s)?'true':undefined}>{s.submittal_number||'—'}</span> };
  const titleCol: Column<any> = { key:'title', header:'Title', primary:true, phone:'show', accessor:s=>s.title||'', render:s=><div className="sbTitle"><span title={s.title}>{s.title||'—'}</span>{s.trade&&<span>{s.trade}</span>}</div> };
  const specCol: Column<any> = { key:'spec_section', phone:'hide', header:'Spec Section', accessor:s=>s.spec_section||'', render:s=>s.spec_section?<span className="sbMuted">{s.spec_section}</span>:<span className="sbMuted">—</span> };
  const statusCol: Column<any> = { key:'status', phone:'show', header:'Status', accessor:s=>statusBadge(s.status).label, render:s=>{const b=statusBadge(s.status);return <span className="sbBadges"><Badge tone={b.tone}>{b.label}</Badge>{isOverdue(s)&&<Badge tone="overdue">Overdue</Badge>}</span>;} };
  const bicCol: Column<any> = { key:'ball_in_court', phone:'show', header:'Ball in Court', accessor:s=>s.ball_in_court||'', render:s=>{
    const h = ballHolder(s, today);
    if (!h) return <span className="sbMuted">—</span>;
    return (
      <span className="sbBic" data-late={h.overdue?'true':undefined}>
        <Avatar name={h.label} mark={h.initials} size={28} tone={h.overdue ? 'var(--danger)' : undefined}/>
        <span className="sbBicText"><span>{h.label}</span>{h.daysHeld!=null&&<span>{h.daysHeld===0?'Today':`${h.daysHeld}d held`}</span>}</span>
      </span>
    );
  } };
  const dueCol: Column<any> = { key:'due_date', phone:'show', header:'Required', accessor:s=>s.due_date?String(s.due_date).slice(0,10):'', render:s=><span className={isOverdue(s)?'sbLate':undefined}>{s.due_date?fmtDate(s.due_date):'—'}</span> };
  const revCol: Column<any> = { key:'revision_number', phone:'hide', header:'Rev.', accessor:s=>Number(s.revision_number)||0, align:'right', render:s=><span className="sbMuted">R{s.revision_number??0}</span> };
  const tradeCol: Column<any> = { key:'trade', header:'Trade', hidden:true, phone:'hide', accessor:s=>s.trade||'' };
  const submittedCol: Column<any> = { key:'submitted_at', header:'Submitted', hidden:true, phone:'hide', accessor:s=>s.submitted_at?String(s.submitted_at).slice(0,10):'', render:s=>s.submitted_at?fmtDate(s.submitted_at):'—' };
  const columns: Column<any>[] = detailOpen ? [numCol, titleCol, statusCol, bicCol] : [numCol, titleCol, specCol, statusCol, bicCol, dueCol, revCol, tradeCol, submittedCol];

  /** The record's verbs — shared by the row overflow and the rail. */
  function subActions(s:any): Action[] {
    const next = nextStatusLabel(s);
    const busy = rowBusyId===s.id;
    return [
      { label:'Open Details', icon:<ClipboardText size={15}/>, onClick:()=>viewSub(s) },
      { label:'Open full page', icon:<ArrowSquareOut size={15}/>, href:`/app/projects/${projectId}/items/submittals/${s.id}`, hidden:String(s.id).startsWith('temp-') },
      { label: next ? `Advance to ${next}` : 'Advance', icon:<CaretRight size={15}/>, onClick:()=>advanceStatus(s), hidden:!next, disabled:busy },
      ...BIC_OPTIONS.filter(b=>b!==s.ball_in_court).map(b=>({ label:`Ball to ${b}`, icon:<UserSwitch size={15}/>, onClick:()=>reassignBIC(s,b), disabled:busy })),
      { label:'Edit', icon:<PencilSimple size={15}/>, onClick:()=>openEdit(s) },
      { label:'Delete', icon:<Trash size={15}/>, onClick:()=>deleteSub(s), tone:'danger', disabled:deleting },
    ];
  }

  // ── Detail workspace ──
  const detailWorkspace = detailOpen && (()=>{
    const b = statusBadge(selected.status); const next = nextStatusLabel(selected); const busy = rowBusyId===selected.id;
    return (
      <div ref={detailRef} className="sbDetailCq">
        <div className="sbDetail">
          <Card
            title={`${selected.submittal_number||'—'} — ${selected.title||'Untitled submittal'}`}
            subtitle={[selected.spec_section, selected.trade, `R${selected.revision_number??0}`].filter(Boolean).join(' · ')}
            actions={<Button variant="ghost" size="sm" icon={<X size={16}/>} aria-label="Close details" title="Close details" onClick={closePanel}/>}
          >
            <div className="sbSection">
              <div className="sbSectionTitle">Approval Workflow</div>
              <WorkflowChain submittal={selected} entityId={selected.id} architectName={ctx?.project?.architectName || null}/>
            </div>
            <div className="sbSection">
              <div className="sbSectionTitle">Notes</div>
              {selected.notes ? <div className="sbProse">{selected.notes}</div> : <div className="sbMuted" style={{fontSize:'var(--fs-sm)'}}>No notes were entered.</div>}
            </div>
          </Card>

          <aside className="sbRail" aria-label="Submittal details and actions">
            <Card title="Details">
              <div className="sbSection">
                <div className="sbBadges">
                  <Badge tone={b.tone} dot>{b.label}</Badge>
                  {selected.ball_in_court && <Badge tone="neutral">Ball: {selected.ball_in_court}</Badge>}
                  {isOverdue(selected) && <Badge tone="overdue">Overdue</Badge>}
                </div>
                <div className="sbNext">{next ? `Next step: ${next}.` : 'Final state — a resubmittal keeps this number and bumps the revision.'}</div>
              </div>
              <div className="sbSection">
                <DetailList items={[
                  ['Spec Section', selected.spec_section || ''],
                  ['Trade', selected.trade || ''],
                  ['Ball in Court', selected.ball_in_court || ''],
                  ['Submitted', selected.submitted_at ? fmtDate(selected.submitted_at) : ''],
                  ['Required', <span key="d" className={isOverdue(selected)?'sbLate':undefined}>{selected.due_date ? fmtDate(selected.due_date) : '—'}</span>],
                  ['Revision', `R${selected.revision_number??0}`],
                ]}/>
              </div>
              <div className="sbSection">
                <Field label="Reassign Ball in Court">
                  <Select value={selected.ball_in_court||'Contractor'} disabled={busy} onChange={e=>reassignBIC(selected,e.target.value)} options={BIC_OPTIONS}/>
                </Field>
              </div>
              <div className="sbSection">
                <div className="sbActions">
                  {next && <Button icon={<CaretRight size={16}/>} onClick={()=>advanceStatus(selected)} disabled={busy}>{busy?'Working…':`Advance to ${next}`}</Button>}
                  <div className="sbActionsRow">
                    <Button icon={<PencilSimple size={16}/>} onClick={()=>openEdit(selected)} disabled={mode==='edit'}>Edit</Button>
                    <RowActions actions={[{ label:'Delete', icon:<Trash size={15}/>, onClick:()=>deleteSub(selected), tone:'danger', disabled:deleting }]}/>
                  </div>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    );
  })();

  // ── Log body ──
  let listBody: React.ReactNode;
  if (!loading && loadError) {
    listBody = <EmptyState icon={<WarningCircle size={22}/>} title="Couldn't load submittals" text={`${loadError} Nothing has been lost — try again.`} action={<Button icon={<ArrowClockwise size={15}/>} onClick={load}>Retry</Button>}/>;
  } else if (!loading && submittals.length===0) {
    listBody = (
      <EmptyState
        icon={<Clipboard size={22}/>}
        title="No submittals yet"
        text="Shop drawings and product data land here. S-001 and a 14-day review window are already set."
        action={<Button icon={<Plus size={15} weight="bold"/>} onClick={openCreate}>New Submittal</Button>}
      />
    );
  } else {
    listBody = (
      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={s=>s.id}
        loading={loading}
        defaultSort={{ key:'submittal_number', dir:'asc' }}
        onRowClick={viewSub}
        rowActions={subActions}
        tableId="project-submittals"
        bulkEdit={itemBulkEdit('submittals', { allowed: rights.edit, canDelete: rights.full, deleteUrl: r => `/api/submittals/${r.id}`, people: submittals.map((s: any) => String(s.ball_in_court || '')), onDone: () => { void load(); } })}
        exportName="submittals"
        empty={<EmptyState icon={<Clipboard size={22}/>} title="No submittals match these filters" text="Clear the search, status, or ball-in-court filter to see more." action={<Button onClick={clearFilters}>Clear Filters</Button>}/>}
      />
    );
  }

  const composerOpen = mode==='create'||mode==='edit';

  return(
    <div className="sbWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label:'Projects', href:'/app/projects' },
          { label: ctx?.project?.name || 'Project', href:`/app/projects/${projectId}/overview` },
          { label:'Submittals' },
        ]}
        title="Submittal Log"
        subtitle="Shop drawings, product data, and the review workflow."
        actions={<Button variant="primary" icon={<Plus size={15} weight="bold"/>} onClick={openCreate}>New Submittal</Button>}
      >
        {!loadError && <StatRow items={stats}/>}

        {!loading && !loadError && submittals.length>0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by number, title, spec section, or trade…"
            filters={
              <>
                <Select aria-label="Status" value={filterStatus} onChange={e=>setFilterStatus(e.target.value as StatusFilter)} style={{ width:'auto', minWidth:160 }} options={[{ value:'all', label:'All Statuses' }, ...STATUSES.map(s=>({ value:s, label:STATUS_LABELS[s] })), { value:'overdue', label:'Overdue' }]}/>
                <Select aria-label="Ball in Court" value={filterBIC} onChange={e=>setFilterBIC(e.target.value)} style={{ width:'auto', minWidth:150 }} options={[{ value:'all', label:'Anyone' }, ...BIC_OPTIONS]}/>
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={<span className="sbMuted" style={{ fontSize:'var(--fs-sm)' }}>{filtered.length} of {total}</span>}
          />
        )}

        <div className="sbCq">
          <div className="sbSplit" data-open={detailOpen?'true':'false'}>
            <div className="sbList"><Card flush>{listBody}</Card></div>
            {detailWorkspace}
          </div>
        </div>
      </PageShell>

      {/* ── Composer: create / edit ── */}
      <FormModal
        open={composerOpen}
        onClose={closeComposer}
        title={mode==='edit' ? `Edit ${selected?.submittal_number||'Submittal'}` : 'New Submittal'}
        subtitle={mode==='create' ? `${ctx?.project?.name ? `${ctx.project.name} · ` : ''}${total} on the log · reviewer ${ctx?.project?.architectName||'the architect'}${roster.length>0?` · ${roster.length} subs on the roster`:''}` : (ctx?.project?.name || undefined)}
        onSubmit={async()=>{ await save(); }}
        submitLabel={mode==='create'?'Create Submittal':'Save Changes'}
        busy={saving}
      >
        {mode==='create'&&overdue>0&&(
          <div style={{marginBottom:16}}>
            <Callout tone="warning" icon={<CalendarX size={16}/>} title={`${overdue} submittal${overdue===1?' is':'s are'} past the required date`} text={`${ctx?.counts?.openSubmittals??pending} open on the log now.`}/>
          </div>
        )}
        <FormGrid cols={2}>
          <Field label="Submittal #" hint={auto.num ? `Next in sequence — ${total} already on the log.` : undefined}>
            <Input value={form.submittal_number} onChange={e=>{const v=e.target.value;setAuto(a=>({...a,num:false}));setForm(f=>({...f,submittal_number:v}));}} placeholder="S-001"/>
          </Field>
          <Field label="Revision">
            <Input type="number" min={0} value={form.revision_number} onChange={e=>setForm(f=>({...f,revision_number:e.target.value}))}/>
          </Field>
          <Field label="Title" required span>
            <Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Structural Steel Shop Drawings" autoFocus/>
          </Field>
          <Field label="Spec Section" hint="CSI MasterFormat divisions.">
            <Select value={form.spec_section} onChange={e=>setForm(f=>({...f,spec_section:e.target.value}))} placeholder="Select division…" options={[
              ...(form.spec_section&&!specOptions.includes(form.spec_section) ? [form.spec_section] : []),
              ...specOptions,
            ]}/>
          </Field>
          <Field label="Trade / Sub" hint={roster.length>0 ? `${roster.length} sub${roster.length===1?'':'s'} on the project roster.` : undefined}>
            <Select value={form.trade} onChange={e=>setForm(f=>({...f,trade:e.target.value}))} placeholder="Select trade…" options={[
              ...(form.trade&&!roster.some((s:any)=>(s.trade||s.companyName)===form.trade)&&!SUB_TRADES.includes(form.trade) ? [form.trade] : []),
              ...roster.map((s:any)=>({ value:String(s.trade||s.companyName||''), label:`${s.companyName}${s.trade?` — ${s.trade}`:''} (on this project)` })),
              ...SUB_TRADES.map(t=>({ value:t, label:t })),
            ]}/>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} options={STATUSES.map(s=>({ value:s, label:STATUS_LABELS[s] }))}/>
          </Field>
          <Field label="Ball in Court" hint={auto.bic ? `Starts with you — flips to ${ctx?.project?.architectName||'the architect'} on submit.` : undefined}>
            <Select value={form.ball_in_court} onChange={e=>{const v=e.target.value;setAuto(a=>({...a,bic:false}));setForm(f=>({...f,ball_in_court:v}));}} options={BIC_OPTIONS}/>
          </Field>
          <Field label="Submitted Date">
            <div className="sbDateInput"><SaguaroDatePicker value={form.submitted_at} onChange={v=>setForm(f=>({...f,submitted_at:v}))} style={DATE_INPUT_STYLE}/></div>
          </Field>
          <Field label="Required Date" hint={auto.due ? 'Standard 14-day review window — adjust to the spec.' : undefined}>
            <div className="sbDateInput"><SaguaroDatePicker value={form.due_date} onChange={v=>{setAuto(a=>({...a,due:false}));setForm(f=>({...f,due_date:v}));}} style={DATE_INPUT_STYLE}/></div>
          </Field>
          <Field label="Notes" span>
            <Textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Additional notes or comments…"/>
          </Field>
        </FormGrid>
      </FormModal>

      <div style={{ position:'relative', zIndex:10001 }}><UnsavedGuardModal guard={guard} /></div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
