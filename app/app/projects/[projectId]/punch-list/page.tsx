'use client';
/**
 * Project Punch List — Pass 4, on the RFIs reference layout (dense table + detail).
 *
 * Anatomy: title + one primary action (Add Item) → StatRow (each tile filters
 * the log) → Toolbar → workspace split: DataTable log on the left (a check box
 * on every row flips completion), and when a row is selected, the item beside
 * a 320–384px details + action rail. Phone: list, then detail, stacked. Create /
 * edit open the composer in a FormModal.
 *
 * Every write goes through a route this screen already used:
 *   list     GET    /api/punch-list/list?projectId=
 *   create   POST   /api/punch-list/create
 *   update   PUT    /api/punch-list/[id]        (full form, or { status } from the check box)
 *   delete   DELETE /api/punch-list/[id]
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { sendOrSave, listSaved, updateSaved, removeSaved, savedRowId, savedIdOf, isOffline } from '@/lib/offline/outbox';

/** A row as the create route takes it — without the screen's own markers. */
function asCreateBody(row: Record<string, any>, projectId: string) {
  const { id: _id, _offline, _offlineError, project_id: _p, ...fields } = row;
  void _id; void _offline; void _offlineError; void _p;
  return { ...fields, projectId };
}
import { SUB_TRADES } from '@/lib/construction-intelligence';
import {
  CheckCircle, Check, MapPin, User, X, ArrowUUpLeft, Plus, WarningCircle, ListChecks, Camera,
  PencilSimple, Trash, ArrowClockwise, Lightning,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, RowActions,
  FormModal, Field, Input, Textarea, Select, FormGrid, DetailList, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { AutoChip, FlowSteps } from '@/components/ui/premium';
import RadioEvidence, {
  RadioEvidenceChip,
  radioEvidenceFromRecord,
  stripRadioProvenance,
} from '@/components/RadioEvidence';
import { layout } from '@/lib/design-tokens';
import { useOpenOnNew } from '@/lib/ui/open-on-new';

// Priorities are STORED lowercase ('low'|'medium'|'high'|'critical') and
// DISPLAYED capitalized. Legacy rows may carry capitalized values — every
// read goes through prKey() so both spellings work forever.
const PRIORITIES=[
  {value:'critical',label:'Critical'},
  {value:'high',label:'High'},
  {value:'medium',label:'Medium'},
  {value:'low',label:'Low'},
];
const prKey=(p:unknown)=>String(p||'medium').toLowerCase();
const prLabel=(p:unknown)=>{const k=prKey(p);return k.charAt(0).toUpperCase()+k.slice(1).replace('_',' ');};
const PR_RANK:Record<string,number>={critical:0,high:1,medium:2,low:3};
const STATUSES=['open','in_progress','completed','voided'];
const TRADES=SUB_TRADES; // canonical taxonomy — do not hardcode partial trade lists
const STATUS_LABELS:Record<string,string>={open:'Open',in_progress:'In Progress',completed:'Completed',voided:'Voided'};
const STATUS_RANK:Record<string,number>={open:0,in_progress:1,completed:2,voided:3};

/** One status → one badge. Open stays neutral so the log is not a rainbow:
 *  only In Progress (amber), Completed (green) and Voided (grey) carry a hue. */
function statusBadge(s:string): { label:string; tone:BadgeTone } {
  if (s==='completed') return { label:'Completed', tone:'ongoing' };
  if (s==='in_progress') return { label:'In Progress', tone:'under_contract' };
  if (s==='voided') return { label:'Voided', tone:'closed' };
  return { label: STATUS_LABELS[s]||s||'Open', tone:'neutral' };
}
/** Priority carries a hue only when it demands attention: Critical red, High orange. */
function priorityBadge(p:unknown): { label:string; tone:BadgeTone } {
  const k=prKey(p);
  if (k==='critical') return { label:'Critical', tone:'overdue' };
  if (k==='high') return { label:'High', tone:'completed' };
  return { label: prLabel(p), tone:'neutral' };
}

/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
function fmtDate(iso:string|null|undefined): string {
  if (!iso) return '—';
  const d = iso.length<=10 ? new Date(iso+'T12:00:00') : new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US',{ month:'short', day:'numeric', year:'numeric' });
}
const todayIso = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const isLate = (i:any) => !!i.due_date && i.status!=='completed' && i.status!=='voided' && String(i.due_date).slice(0,10) < todayIso();

const EMPTY:Record<string,any>={
  title:'',description:'',location:'',trade:'General Contractor',
  priority:'medium',status:'open',due_date:'',assigned_to:'',notes:'',
};

const CSS = `
.plWs > .k-page { max-width: none; }
.plCq { container: plws / inline-size; min-width: 0; }
.plSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.plSplit > * { min-width: 0; }
@container plws (min-width: 1080px) {
  .plSplit[data-open="true"] { grid-template-columns: minmax(340px, 0.8fr) minmax(0, 1.6fr); }
}
.plDetailCq { container: pldetail / inline-size; min-width: 0; }
.plDetail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.plDetail > * { min-width: 0; }
.plRail { order: -1; }
@container pldetail (min-width: 720px) {
  .plDetail { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 34%, ${layout.detailRailMax}px); }
  .plRail { order: 0; position: sticky; top: 16px; }
}
.plList .k-table th:first-child, .plList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.plList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.plList .k-table tbody tr:hover td:first-child { background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), var(--bg-solid); }
.plList .k-table tbody tr:has([data-sel="true"]) td { background: var(--brand-primary-08); }
.plList .k-table tbody tr:has([data-sel="true"]) td:first-child { background: linear-gradient(var(--brand-primary-08), var(--brand-primary-08)), var(--bg-solid); box-shadow: inset 3px 0 0 var(--brand-primary); }
.plTitle { display: flex; align-items: center; gap: 10px; max-width: 440px; min-width: 0; }
.plTitle > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; color: var(--text-primary); font-weight: 600; }
.plTitle[data-done="true"] > span { color: var(--text-tertiary); text-decoration: line-through; }
.plCheck { width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0; cursor: pointer; border: 2px solid var(--border-strong); background: transparent; display: inline-flex; align-items: center; justify-content: center; padding: 0; color: var(--on-brand); transition: all .15s; }
.plCheck[aria-checked="true"] { border-color: var(--status-ongoing); background: var(--status-ongoing); }
.plCheck:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
.plBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.plLate { color: var(--status-overdue); font-weight: 700; }
.plMuted { color: var(--text-tertiary); }
.plNum { font-variant-numeric: tabular-nums; }
.plSection { display: flex; flex-direction: column; gap: 8px; }
.plSection + .plSection { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
.plSectionTitle { font-size: var(--fs-sm); font-weight: 700; color: var(--text-tertiary); }
.plProse { font-size: var(--fs-md); line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; max-width: ${layout.readingMaxWidth}; }
.plActions { display: flex; flex-direction: column; gap: 8px; }
.plActions .k-btn { width: 100%; justify-content: flex-start; }
.plActionsRow { display: flex; gap: 8px; align-items: center; }
.plActionsRow > .k-btn { flex: 1 1 auto; }
.plNext { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.5; }
.plBar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--border-subtle); font-size: var(--fs-sm); color: var(--text-tertiary); }
.plBarTrack { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.08); overflow: hidden; min-width: 80px; }
.plBarFill { height: 100%; border-radius: 3px; background: var(--status-ongoing); transition: width .4s; }
.plBar b { color: var(--text-primary); font-variant-numeric: tabular-nums; }
.plHint { display: flex; align-items: flex-start; gap: 6px; }
.plFlow { border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 14px 16px; background: var(--bg-surface-2); margin-top: 16px; }
.plDateInput { width: 100%; }
@media (max-width: 640px) {
  .plWs .k-btn, .plWs .k-stat, .plWs select.k-select, .plWs .k-input { min-height: 44px; }
  .plWs .k-table td { height: 48px; }
  .plTitle { max-width: 220px; }
  /* 24px box, 44px thumb: the hit area grows around the checkbox without moving the row. */
  .plCheck { width: 24px; height: 24px; position: relative; }
  .plCheck::after { content: ''; position: absolute; inset: -10px; }
}
`;

const DATE_INPUT_STYLE: React.CSSProperties = {
  width:'100%', minHeight:40, padding:'8px 12px', fontSize:14,
  background:'var(--bg-surface-2)', border:'1px solid var(--border-default)',
  borderRadius:'var(--radius-sm)', color:'var(--text-primary)',
};

export default function PunchListPage(){
  const {projectId}=useParams() as {projectId:string};
  const [items,setItems]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [selected,setSelected]=useState<any>(null);
  const [mode,setMode]=useState<'view'|'edit'|'create'|null>(null);
  const [form,setForm]=useState<Record<string,any>>({...EMPTY});
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const { toast, show: showToast } = useToast(4000);
  const [search,setSearch]=useState('');
  const [filterStatus,setFilterStatus]=useState('all');
  const [filterPriority,setFilterPriority]=useState('all');
  const [filterTrade,setFilterTrade]=useState('all');
  // Project intelligence — sub roster + smart defaults for the create drawer.
  const { ctx } = useProjectContext(projectId);
  const [autoDue,setAutoDue]=useState(false);
  const [autoAssign,setAutoAssign]=useState(false);
  const [assignOther,setAssignOther]=useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  /** The server's items with what is saved on this phone laid over them:
   *  items added offline, and changes/deletes that haven't been sent yet. */
  const withSaved=useCallback(async(server:any[])=>{
    let rows=server.slice();
    for(const w of await listSaved(projectId,'punch')){
      const mark={_offline:true,_offlineError:w.lastError};
      if(w.method==='POST') rows.unshift({...(w.row||{}),id:savedRowId(w.id),...mark});
      else if(w.method==='PUT'&&w.recordId) rows=rows.map((i:any)=>i.id===w.recordId?{...i,...(w.row||{}),...mark}:i);
      else if(w.method==='DELETE'&&w.recordId) rows=rows.filter((i:any)=>i.id!==w.recordId);
    }
    return rows;
  },[projectId]);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch(`/api/punch-list/list?projectId=${projectId}`,{headers:h});
      if (!r.ok) throw new Error('Failed to load data');
      const d=await r.json();
      setItems(await withSaved(d.items||[]));
    }catch{
      // Offline with nothing saved for this screen: still show the items added on this phone.
      setItems(await withSaved([]));
      setLoadError(isOffline()?'':'Failed to load. Please try again.');
    }
    finally{setLoading(false);}
  },[projectId,withSaved]);

  // Background revalidate — reconciles server truth after an optimistic write
  // without flipping the list back into its loading state.
  const revalidate=useCallback(async()=>{
    try{
      const h=await getAuthHeaders();
      const r=await fetch(`/api/punch-list/list?projectId=${projectId}`,{headers:h});
      if(!r.ok) return;
      const d=await r.json();
      setItems(await withSaved(d.items||[]));
    }catch{/* background refresh — keep the optimistic rows */}
  },[projectId,withSaved]);

  useEffect(()=>{load();},[load]);

  // Items saved offline went up: show the server's copies.
  useEffect(()=>{
    const onSynced=(e:Event)=>{const d=(e as CustomEvent).detail||{}; if(d.kind==='punch'&&(!d.projectId||d.projectId===projectId)) revalidate();};
    window.addEventListener('saguaro:outbox-synced',onSynced);
    return ()=>window.removeEventListener('saguaro:outbox-synced',onSynced);
  },[projectId,revalidate]);

  // Keep the selected row pointed at the live record once a revalidate swaps rows in.
  useEffect(()=>{
    if(!selected) return;
    const live = items.find((i:any)=>i.id===selected.id);
    if(live && live!==selected) setSelected(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[items]);

  function openCreate(){
    // Due date walks in at +7 days — the standard punch turnaround. Editable.
    const d=new Date(Date.now()+7*86400000);
    const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setForm({...EMPTY,due_date:iso});
    setAutoDue(true);setAutoAssign(false);setAssignOther(false);
    setMode('create');setSelected(null);
  }
  // Photo-sheet shortcut (?new=1) lands in the new-item form.
  useOpenOnNew(openCreate, !loading);
  function openEdit(item:any){
    setAutoDue(false);setAutoAssign(false);setAssignOther(false);
    setForm({title:item.title||'',description:item.description||'',location:item.location||'',
      trade:item.trade||'General Contractor',priority:prKey(item.priority),
      status:item.status||'open',due_date:item.due_date||'',
      assigned_to:item.assigned_to||'',notes:item.notes||''});
    setSelected(item);setMode('edit');
  }
  function viewItem(item:any){
    setSelected(item);setMode('view');
  }
  function closePanel(){setSelected(null);setMode(null);}

  /* ── Unsaved-work protection (R14): only the create drawer arms the guard —
   *    dirty once any field differs from a fresh item's defaults (the +7-day
   *    auto due date and the roster auto-assignee never count on their own). ── */
  const createDirty = mode==='create' && (
    !!String(form.title||'').trim() ||
    !!String(form.description||'').trim() || !!String(form.location||'').trim() ||
    !!String(form.notes||'').trim() ||
    (!autoAssign && !!String(form.assigned_to||'').trim()) ||
    form.trade!=='General Contractor' || prKey(form.priority)!=='medium' ||
    form.status!=='open' || !autoDue
  );
  const guard = useUnsavedGuard({
    dirty: createDirty,
    draftKey: `punch:${projectId}`,
    draftData: form,
    restoreDraft: (d) => {
      setForm({...EMPTY,...(d as Record<string,any>)});
      setAutoDue(false);setAutoAssign(false);setAssignOther(false);
      setSelected(null);setMode('create');
    },
    onSave: () => save(),
  });

  /** User-initiated composer closes (backdrop / X / Cancel / Esc) run through the guard. */
  function requestClosePanel(){ guard.requestClose(closePanel); }
  /** Abandoning an edit keeps the item in view. */
  function requestCloseComposer(){
    if(mode==='edit'&&selected){ setMode('view'); return; }
    requestClosePanel();
  }

  /** Create/update the item — shared by the drawer button and the guard's
   *  "Save & leave". Returns true on success (optimistic close, then network). */
  async function save(): Promise<boolean>{
    if(!String(form.title||'').trim()){showToast('Title is required.','bad');return false;}
    // Optimistic save (house pattern: budget saveEdit) — the list updates and
    // the panel closes instantly; the network settles in the background.
    const snapshot={...form};
    const prevMode=mode,prevSelected=selected;
    setSaving(true);
    try{
      const label=`Punch item "${String(snapshot.title||'').slice(0,40)}"`;
      if(mode==='create'){
        const tempId=`temp-${Date.now()}`;
        setItems(prev=>[{id:tempId,...snapshot,project_id:projectId},...prev]);
        closePanel();
        showToast('Item added.');
        // No signal on site is normal: the item is kept on this phone and sent when it's back.
        const res=await sendOrSave({url:'/api/punch-list/create',method:'POST',body:{...form,projectId},projectId,kind:'punch',label,row:{...snapshot,project_id:projectId}});
        if(res.saved){
          setItems(prev=>prev.map((i:any)=>i.id===tempId?{...i,id:savedRowId(res.id),_offline:true}:i));
          showToast("Saved on this phone — it sends when you're back online.");
        }else{
          const r=res.response;
          if(!r.ok){setItems(prev=>prev.filter((i:any)=>i.id!==tempId));throw new Error(await r.text());}
          const d=await r.json();
          if(d.item) setItems(prev=>prev.map((i:any)=>i.id===tempId?d.item:i));
          revalidate();
        }
        guard.clearDraft();
      }else if(mode==='edit'&&selected){
        const prevItem=selected;
        setItems(prev=>prev.map((i:any)=>i.id===prevItem.id?{...i,...snapshot}:i));
        // Stay on the item — it re-renders with the saved values.
        setSelected({...prevItem,...snapshot}); setMode('view');
        showToast('Item updated.');
        const localId=savedIdOf(String(prevItem.id));
        if(localId){
          // Added offline and not sent yet: change what will be sent.
          await updateSaved(localId,{body:JSON.stringify({...form,projectId}),row:{...snapshot,project_id:projectId},label});
          showToast("Updated on this phone — it sends when you're back online.");
        }else{
          const res=await sendOrSave({url:`/api/punch-list/${prevItem.id}`,method:'PUT',body:form,projectId,kind:'punch',label:`Changes to ${label.toLowerCase()}`,row:snapshot,recordId:prevItem.id});
          if(res.saved){
            setItems(prev=>prev.map((i:any)=>i.id===prevItem.id?{...i,_offline:true}:i));
            showToast("Saved on this phone — it sends when you're back online.");
          }else{
            if(!res.response.ok){setItems(prev=>prev.map((i:any)=>i.id===prevItem.id?prevItem:i));throw new Error(await res.response.text());}
            revalidate();
          }
        }
      }
      return true;
    }catch(e:any){
      console.error(e);showToast(humanError(e,'Save failed. Please try again.'),'bad');
      // Rollback already applied — reopen the drawer with the input intact.
      setForm(snapshot);setMode(prevMode);setSelected(prevSelected);
      return false;
    }
    finally{setSaving(false);}
  }

  async function toggleComplete(item:any){
    const prevStatus=item.status;
    const newStatus=item.status==='completed'?'open':'completed';
    // Optimistic flip (house pattern: budget saveEdit) — the checkbox answers
    // the tap instantly; rollback + toast if the server disagrees.
    setItems(prev=>prev.map((i:any)=>i.id===item.id?{...i,status:newStatus}:i));
    setSelected((s:any)=>s?.id===item.id?{...s,status:newStatus}:s);
    try{
      const localId=savedIdOf(String(item.id));
      if(localId){
        // Added offline: the item goes up already marked.
        const row={...item,status:newStatus};
        await updateSaved(localId,{body:JSON.stringify(asCreateBody(row,projectId)),row:{...asCreateBody(row,projectId),project_id:projectId}});
        return;
      }
      const res=await sendOrSave({url:`/api/punch-list/${item.id}`,method:'PUT',body:{status:newStatus},projectId,kind:'punch',label:`${newStatus==='completed'?'Complete':'Reopen'} punch item "${String(item.title||'').slice(0,40)}"`,row:{status:newStatus},recordId:item.id});
      if(res.saved){
        setItems(prev=>prev.map((i:any)=>i.id===item.id?{...i,_offline:true}:i));
        showToast("Saved on this phone — it sends when you're back online.");
        return;
      }
      if (!res.response.ok) throw new Error('Update failed');
      revalidate();
    }catch(e:any){
      setItems(prev=>prev.map((i:any)=>i.id===item.id?{...i,status:prevStatus}:i));
      setSelected((s:any)=>s?.id===item.id?{...s,status:prevStatus}:s);
      console.error(e);showToast(humanError(e,'Something went wrong. Please try again.'),'bad');
    }
  }

  async function deleteItem(item:any){
    if(!(await confirmDialog({ title: 'Please confirm', message: `Delete "${item.title||item.description}"?`, danger: true }))) return;
    // Optimistic remove — the row leaves and the panel closes instantly;
    // rollback restores the exact list on failure.
    const prevItems=items;
    setItems(prev=>prev.filter((i:any)=>i.id!==item.id));
    showToast('Item deleted.');closePanel();
    setDeleting(true);
    try{
      const localId=savedIdOf(String(item.id));
      if(localId){await removeSaved(localId);return;} // never left this phone
      const res=await sendOrSave({url:`/api/punch-list/${item.id}`,method:'DELETE',projectId,kind:'punch',label:`Delete punch item "${String(item.title||'').slice(0,40)}"`,recordId:item.id});
      if(res.saved){showToast("Deleted on this phone — it syncs when you're back online.");return;}
      if (!res.response.ok) throw new Error('Delete failed');
      revalidate();
    }catch{setItems(prevItems);showToast('Delete failed.','bad');}
    finally{setDeleting(false);}
  }

  const trades=Array.from(new Set(items.map((i:any)=>i.trade).filter(Boolean))) as string[];
  const filtered=items.filter((i:any)=>{
    const ms=!search||(i.title||'').toLowerCase().includes(search.toLowerCase())
      ||(i.description||'').toLowerCase().includes(search.toLowerCase())
      ||(i.location||'').toLowerCase().includes(search.toLowerCase())
      ||(i.assigned_to||'').toLowerCase().includes(search.toLowerCase());
    const mst=filterStatus==='all'||i.status===filterStatus;
    // Case-insensitive — legacy rows may carry capitalized priorities.
    const mp=filterPriority==='all'||prKey(i.priority)===prKey(filterPriority);
    const mt=filterTrade==='all'||i.trade===filterTrade;
    return ms&&mst&&mp&&mt;
  });

  const openCount=items.filter((i:any)=>i.status==='open').length;
  const inProg=items.filter((i:any)=>i.status==='in_progress').length;
  const done=items.filter((i:any)=>i.status==='completed').length;
  const crit=items.filter((i:any)=>prKey(i.priority)==='critical'&&i.status!=='completed').length;
  const late=items.filter(isLate).length;
  const pct=items.length>0?Math.round((done/items.length)*100):0;

  const filtersActive = !!search || filterStatus!=='all' || filterPriority!=='all' || filterTrade!=='all';
  const clearFilters = () => { setSearch(''); setFilterStatus('all'); setFilterPriority('all'); setFilterTrade('all'); };
  const toggleStatus = (s:string) => setFilterStatus(prev => (prev===s ? 'all' : s));

  // Radio provenance on the open item. `selectedNotes` is the DISPLAY copy with
  // the provenance block lifted out — the evidence card states those facts far
  // better — while `selected.notes` (and the edit form) keep the stored block.
  const selectedRadio=selected?radioEvidenceFromRecord(selected):null;
  const selectedNotes=selectedRadio?stripRadioProvenance(selected?.notes):(selected?.notes||'');

  // ── Stat tiles: each opens the log filtered to that slice ──
  const stats: StatItem[] = loading
    ? [
        { label:'Open', value:'—', sub:'Loading…' },
        { label:'In Progress', value:'—', sub:'Loading…' },
        { label:'Completed', value:'—', sub:'Loading…' },
        { label:'Critical Open', value:'—', sub:'Loading…' },
      ]
    : [
        { label:'Open', value:openCount, sub: filterStatus==='open' ? 'Filtered — click to clear' : late>0 ? `${late} past due` : 'On the list now', onClick:()=>toggleStatus('open') },
        { label:'In Progress', value:inProg, tone: inProg>0 ? 'warn' : 'default', sub: filterStatus==='in_progress' ? 'Filtered — click to clear' : 'Being corrected', onClick:()=>toggleStatus('in_progress') },
        { label:'Completed', value:done, tone: done>0 ? 'good' : 'default', sub: filterStatus==='completed' ? 'Filtered — click to clear' : `${pct}% of ${items.length} item${items.length===1?'':'s'}`, onClick:()=>toggleStatus('completed') },
        { label:'Critical Open', value:crit, tone: crit>0 ? 'bad' : 'default', sub: filterPriority==='critical' ? 'Filtered — click to clear' : crit>0 ? 'Needs attention first' : 'None open', onClick:()=>setFilterPriority(p => (p==='critical' ? 'all' : 'critical')) },
      ];

  // ── Log columns: full log, or a compact log beside the item ──
  const isSel = (i:any) => selected?.id===i.id && mode!=='create';
  const checkBox = (i:any) => {
    const isDone=i.status==='completed';
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={isDone ? `Reopen ${i.title||'item'}` : `Mark ${i.title||'item'} complete`}
        className="plCheck"
        disabled={String(i.id).startsWith('temp-')}
        onClick={e=>{e.stopPropagation();toggleComplete(i);}}
      >
        {isDone&&<Check size={13} weight="bold"/>}
      </button>
    );
  };
  const titleCol: Column<any> = {
    key:'title', header:'Item', accessor:i=>(i.title||i.description||'').toLowerCase(),
    render:i=>{
      // Filed from a radio transmission? punch_list has no jsonb column, so the
      // provenance rides as the readable block in `notes` — which the list route returns in full.
      const radio=radioEvidenceFromRecord(i);
      return (
        <div className="plTitle" data-done={i.status==='completed'?'true':undefined} data-sel={isSel(i)?'true':undefined}>
          {checkBox(i)}
          <span title={i.title||i.description}>{i.title||i.description||'Untitled item'}</span>
          {radio&&<RadioEvidenceChip durationSecs={radio.audio_duration_secs}/>}
        </div>
      );
    },
  };
  const priorityCol: Column<any> = { key:'priority', header:'Priority', accessor:i=>PR_RANK[prKey(i.priority)]??9, render:i=>{const b=priorityBadge(i.priority);return <Badge tone={b.tone}>{b.label}</Badge>;} };
  const statusCol: Column<any> = { key:'status', header:'Status', accessor:i=>STATUS_RANK[i.status]??9, render:i=>{
    const b=statusBadge(i.status);
    if(!i._offline) return <Badge tone={b.tone}>{b.label}</Badge>;
    return <span style={{display:'inline-flex',gap:6,flexWrap:'wrap'}} title={i._offlineError?`Couldn't send: ${i._offlineError}`:"Saved on this phone — it sends when you're back online."}>
      <Badge tone={b.tone}>{b.label}</Badge><Badge tone={i._offlineError?'overdue':'gold'}>{i._offlineError?"Couldn't Send":'On This Phone'}</Badge>
    </span>;
  } };
  const tradeCol: Column<any> = { key:'trade', header:'Trade', accessor:i=>(i.trade||'').toLowerCase(), render:i=>i.trade?<span>{i.trade}</span>:<span className="plMuted">—</span> };
  const locationCol: Column<any> = { key:'location', header:'Location', accessor:i=>(i.location||'').toLowerCase(), render:i=>i.location?<span style={{display:'inline-flex',alignItems:'center',gap:4}}><MapPin size={12}/>{i.location}</span>:<span className="plMuted">—</span> };
  const assignedCol: Column<any> = { key:'assigned_to', header:'Assigned To', accessor:i=>(i.assigned_to||'').toLowerCase(), render:i=>i.assigned_to?<span style={{color:'var(--text-primary)'}}>{i.assigned_to}</span>:<span className="plMuted">Unassigned</span> };
  const dueCol: Column<any> = { key:'due_date', header:'Due', accessor:i=>i.due_date||'', render:i=><span className={isLate(i)?'plLate':undefined}>{fmtDate(i.due_date)}</span> };
  const columns: Column<any>[] = (selected && mode!=='create')
    ? [titleCol, priorityCol, statusCol, dueCol]
    : [titleCol, priorityCol, statusCol, tradeCol, locationCol, assignedCol, dueCol];

  /** The record's verbs — shared by the row overflow and the rail. */
  function itemActions(item:any): Action[] {
    const temp=String(item.id).startsWith('temp-');
    const isDone=item.status==='completed';
    return [
      { label:'Open Details', icon:<ListChecks size={15}/>, onClick:()=>viewItem(item) },
      { label: isDone?'Reopen Item':'Mark Complete', icon: isDone?<ArrowUUpLeft size={15}/>:<CheckCircle size={15}/>, onClick:()=>toggleComplete(item), disabled:temp },
      { label:'Edit Item', icon:<PencilSimple size={15}/>, onClick:()=>openEdit(item), disabled:temp },
      { label:'Delete', icon:<Trash size={15}/>, onClick:()=>deleteItem(item), tone:'danger', disabled:temp||deleting },
    ];
  }

  // ── Detail workspace ──
  const detailOpen = !!selected && mode!=='create';
  // Stacked layouts: once the record is in the DOM, bring it into view instead of leaving it below the fold.
  useEffect(()=>{
    if(!detailOpen) return;
    const el = detailRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[detailOpen, selected?.id]);
  const detailWorkspace = detailOpen && (
    <div ref={detailRef} className="plDetailCq">
      <div className="plDetail">
        <Card
          title={selected.title||selected.description||'Untitled item'}
          subtitle={[selected.trade, selected.location].filter(Boolean).join(' · ') || undefined}
          actions={<Button variant="ghost" size="sm" icon={<X size={16}/>} aria-label="Close details" title="Close details" onClick={closePanel}/>}
        >
          <div className="plSection">
            <div className="plSectionTitle">Description</div>
            {selected.description && selected.title
              ? <div className="plProse">{selected.description}</div>
              : <div className="plMuted" style={{fontSize:'var(--fs-sm)'}}>No description was entered.</div>}
          </div>

          {/* The voice behind the item, when it was filed from the radio */}
          {selectedRadio&&(
            <div className="plSection">
              <RadioEvidence source={selectedRadio} title="Voice on the Record"/>
            </div>
          )}

          {selectedNotes&&(
            <div className="plSection">
              <div className="plSectionTitle">Notes</div>
              <div className="plProse">{selectedNotes}</div>
            </div>
          )}
        </Card>

        <aside className="plRail" aria-label="Punch item details and actions">
          <Card title="Details">
            <div className="plSection">
              <div className="plBadges">
                <Badge tone={statusBadge(selected.status).tone} dot>{statusBadge(selected.status).label}</Badge>
                <Badge tone={priorityBadge(selected.priority).tone}>{prKey(selected.priority)==='critical'&&<Lightning size={11} weight="fill"/>} {priorityBadge(selected.priority).label}</Badge>
                {isLate(selected)&&<Badge tone="overdue">Past Due</Badge>}
              </div>
              {selected.status==='completed' && selected.completed_at && (
                <div className="plNext">Completed {fmtDate(selected.completed_at)}.</div>
              )}
              {selected.status!=='completed' && selected.status!=='voided' && (
                <div className="plNext">{selected.assigned_to ? `${selected.assigned_to} sees it on their field list.` : 'Assign a sub and it shows on their field list.'}</div>
              )}
            </div>
            <div className="plSection">
              <DetailList items={[
                ['Trade', selected.trade || ''],
                ['Location', selected.location || ''],
                ['Assigned To', selected.assigned_to || 'Unassigned'],
                ['Due Date', <span key="due" className={isLate(selected)?'plLate':undefined}>{fmtDate(selected.due_date)}</span>],
                ['Created', fmtDate(selected.created_at)],
                ['Completed', selected.completed_at ? fmtDate(selected.completed_at) : '—'],
              ]}/>
            </div>
            <div className="plSection">
              <div className="plActions">
                {selected.status!=='voided' && (
                  <Button
                    icon={selected.status==='completed'?<ArrowUUpLeft size={16}/>:<CheckCircle size={16}/>}
                    onClick={()=>toggleComplete(selected)}
                    disabled={String(selected.id).startsWith('temp-')}
                  >
                    {selected.status==='completed'?'Reopen Item':'Mark Complete'}
                  </Button>
                )}
                <div className="plActionsRow">
                  <Button icon={<PencilSimple size={16}/>} onClick={()=>openEdit(selected)} disabled={String(selected.id).startsWith('temp-')||mode==='edit'}>
                    Edit Item
                  </Button>
                  <RowActions actions={[
                    { label:'Delete', icon:<Trash size={15}/>, onClick:()=>deleteItem(selected), tone:'danger', disabled:String(selected.id).startsWith('temp-')||deleting },
                  ]}/>
                </div>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );

  // ── Log body: loading / error / empty / no-match / rows — each distinct ──
  let listBody: React.ReactNode;
  if (!loading && loadError) {
    listBody = (
      <EmptyState
        icon={<WarningCircle size={22}/>}
        title="Couldn't load the punch list"
        text={`${loadError} Nothing has been lost — try again.`}
        action={<Button icon={<ArrowClockwise size={15}/>} onClick={load}>Retry</Button>}
      />
    );
  } else if (!loading && items.length===0) {
    listBody = (
      <EmptyState
        icon={<CheckCircle size={22}/>}
        title="Punch list is empty"
        text="Add deficiencies and correction items to track closeout."
        action={<Button icon={<Plus size={15} weight="bold"/>} onClick={openCreate}>Add First Item</Button>}
      />
    );
  } else {
    listBody = (
      <>
        {!loading && items.length>0 && (
          <div className="plBar" aria-label="Overall completion">
            <span>Overall completion</span>
            <div className="plBarTrack"><div className="plBarFill" style={{width:`${pct}%`}}/></div>
            <b>{pct}%</b>
            <span className="plNum">{done} of {items.length}</span>
          </div>
        )}
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={i=>i.id}
          loading={loading}
          onRowClick={viewItem}
          rowActions={itemActions}
          empty={
            <EmptyState
              icon={<CheckCircle size={22}/>}
              title="No items match these filters"
              text="Clear the search, status, priority, or trade filter to see more."
              action={<Button onClick={clearFilters}>Clear Filters</Button>}
            />
          }
        />
      </>
    );
  }

  const composerOpen = mode==='create'||mode==='edit';

  return (
    <div className="plWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label:'Projects', href:'/app/projects' },
          { label: ctx?.project?.name || 'Project', href:`/app/projects/${projectId}/overview` },
          { label:'Punch List' },
        ]}
        title="Punch List"
        subtitle="Deficiencies and closeout items, tracked to completion."
        actions={
          <Button variant="primary" icon={<Plus size={15} weight="bold"/>} onClick={openCreate}>
            Add Item
          </Button>
        }
      >
        {!loadError && <StatRow items={stats}/>}

        {!loading && !loadError && items.length>0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by title, description, location, or assignee…"
            filters={
              <>
                <Select
                  aria-label="Status"
                  value={filterStatus}
                  onChange={e=>setFilterStatus(e.target.value)}
                  style={{ width:'auto', minWidth:150 }}
                  options={[{ value:'all', label:'All Statuses' }, ...STATUSES.map(s=>({ value:s, label:STATUS_LABELS[s] }))]}
                />
                <Select
                  aria-label="Priority"
                  value={filterPriority}
                  onChange={e=>setFilterPriority(e.target.value)}
                  style={{ width:'auto', minWidth:150 }}
                  options={[{ value:'all', label:'All Priorities' }, ...PRIORITIES]}
                />
                {trades.length>0 && (
                  <Select
                    aria-label="Trade"
                    value={filterTrade}
                    onChange={e=>setFilterTrade(e.target.value)}
                    style={{ width:'auto', minWidth:150, maxWidth:260 }}
                    options={[{ value:'all', label:'All Trades' }, ...trades]}
                  />
                )}
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={<span className="plMuted" style={{ fontSize:'var(--fs-sm)' }}>{filtered.length} of {items.length}</span>}
          />
        )}

        <div className="plCq">
          <div className="plSplit" data-open={detailOpen?'true':'false'}>
            <div className="plList">
              <Card flush>{listBody}</Card>
            </div>
            {detailWorkspace}
          </div>
        </div>
      </PageShell>

      {/* ── Composer: create / edit ───────────────────────────────── */}
      <FormModal
        open={composerOpen}
        onClose={requestCloseComposer}
        title={mode==='edit' ? 'Edit Item' : 'New Punch Item'}
        subtitle={mode==='create' && items.length>0
          ? `${openCount} open${crit>0?`, ${crit} critical`:''} · ${done} done (${pct}%)`
          : (ctx?.project?.name || undefined)}
        onSubmit={async()=>{ await save(); }}
        submitLabel={mode==='create'?'Add Item':'Save Changes'}
        busy={saving}
      >
        <FormGrid cols={2}>
          <Field label="Title" required span>
            <Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Short name — e.g. Patch drywall at Rm 204 door…" autoFocus/>
          </Field>
          <Field label="Description" span>
            <Textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={3} placeholder="Describe the deficiency or item to correct…"/>
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} options={PRIORITIES}/>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} options={STATUSES.map(s=>({ value:s, label:STATUS_LABELS[s] }))}/>
          </Field>
          <Field label="Trade">
            <Select
              value={form.trade}
              onChange={e=>{
                const t=e.target.value;
                // Roster intelligence: picking a trade auto-suggests the awarded sub.
                if(mode==='create'&&!assignOther&&(!form.assigned_to||autoAssign)){
                  const match=(ctx?.subs||[]).find((s:any)=>s.trade===t);
                  if(match){setForm(f=>({...f,trade:t,assigned_to:match.companyName}));setAutoAssign(true);return;}
                  if(autoAssign){setForm(f=>({...f,trade:t,assigned_to:''}));setAutoAssign(false);return;}
                }
                setForm(f=>({...f,trade:t}));
              }}
              options={[
                ...(form.trade&&!TRADES.includes(form.trade) ? [form.trade] : []),
                ...TRADES,
              ]}
            />
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="Room 204, North wall…"/>
          </Field>
          <Field
            label="Assigned To"
            hint={<>{autoAssign&&<AutoChip/>}{autoAssign?` Awarded ${form.trade} sub — change freely.`:(ctx?.subs?.length?`${ctx.subs.length} subs on the roster — pick or type anyone.`:'No subs awarded yet — type a name.')}</>}
          >
            {assignOther?(
              <Input value={form.assigned_to} autoFocus onChange={e=>setForm(f=>({...f,assigned_to:e.target.value}))} placeholder="Subcontractor or person"/>
            ):(
              <Select
                value={form.assigned_to}
                onChange={e=>{
                  if(e.target.value==='__other'){setAssignOther(true);setAutoAssign(false);setForm(f=>({...f,assigned_to:''}));return;}
                  setAutoAssign(false);setForm(f=>({...f,assigned_to:e.target.value}));
                }}
                options={[
                  { value:'', label:'Unassigned' },
                  ...(form.assigned_to&&!(ctx?.subs||[]).some((s:any)=>s.companyName===form.assigned_to) ? [{ value:String(form.assigned_to), label:String(form.assigned_to) }] : []),
                  ...(ctx?.subs||[]).map((s:any)=>({ value:String(s.companyName??''), label:`${s.companyName}${s.trade?` — ${s.trade}`:''}` })),
                  { value:'__other', label:'Other — type a name…' },
                ]}
              />
            )}
          </Field>
          <Field label="Due Date" hint={mode==='create' ? <>{autoDue&&<AutoChip/>} Defaulted to +7 days — standard punch turnaround.</> : undefined}>
            <div className="plDateInput"><SaguaroDatePicker value={form.due_date} onChange={v=>{setAutoDue(false);setForm(f=>({...f,due_date:v}));}} style={DATE_INPUT_STYLE}/></div>
          </Field>
          <Field label="Notes" span hint={<span className="plHint"><Camera size={13} style={{flexShrink:0,marginTop:1}}/><span>Snap photos in Field Mode — documented deficiencies get corrected without a return trip.</span></span>}>
            <Textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Additional notes, photos needed, etc."/>
          </Field>
        </FormGrid>
        {mode==='create'&&(
          <div className="plFlow">
            <FlowSteps title="After You Add" steps={[
              {title:'Lands on the Punch Log',desc:'Counted against open items and overall completion instantly.'},
              {title:'Assigned Sub Sees It in Field Mode',desc:form.assigned_to?`${form.assigned_to} gets it on their filtered field list.`:'Assign a sub and it shows on their filtered field list.'},
              {title:'Check-Off Rolls Up Closeout',desc:'Completion climbs live — critical items surface first.'},
            ]}/>
          </div>
        )}
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position:'relative', zIndex:10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
