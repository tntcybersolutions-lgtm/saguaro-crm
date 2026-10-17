'use client';
/**
 * Project Daily Logs — Pass 4, on the RFIs reference layout (dense table + detail).
 *
 * Anatomy: title + one primary action (Auto-Fill Today) → StatRow (each tile
 * filters the register) → Toolbar → workspace split: DataTable register on the
 * left, and when a row is selected, the day's record beside a 320–384px
 * details + action rail. Phone: list, then detail, stacked. Create / edit
 * open the composer in a FormModal.
 *
 * Every read / write is the one this screen already used:
 *   list      GET    /api/daily-logs/list?projectId=
 *   prefill   GET    /api/projects/[id]/daily-logs/prefill?date=   (Auto-Fill Today)
 *   create    POST   /api/daily-logs/create
 *   update    PUT    /api/daily-logs/[id]
 *   delete    DELETE /api/daily-logs/[id]
 * Headcount comes from the clocks, weather from NWS — the create route stamps
 * conditions server-side whenever the fields are left blank.
 */
import { itemBulkEdit } from '@/lib/items/bulk';
import { useEditRights } from '@/lib/hooks/usePermissions';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { unloggedWorkdays } from '@/lib/daily-log-gap';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { reasonFromResponse } from '@/lib/ui/status-fetch';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { sendOrSave, listSaved, updateSaved, removeSaved, savedRowId, savedIdOf, isOffline } from '@/lib/offline/outbox';
import {
  ClipboardText, Thermometer, HardHat, WarningCircle, Plus, X, Sparkle, CopySimple,
  UsersThree, PencilSimple, Trash, ArrowSquareOut, ArrowClockwise, ShieldCheck, Package, Wrench, PaperPlaneTilt,
  CalendarCheck, CalendarBlank, Info,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, RowActions, Menu, Callout,
  FormModal, Field, Input, Textarea, Select, FormGrid, DetailList, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { SUB_TRADES } from '@/lib/construction-intelligence';
import { layout } from '@/lib/design-tokens';
import OwnerUpdateModal from '@/components/owner-update/OwnerUpdateModal';
import { useOpenOnNew } from '@/lib/ui/open-on-new';

/** A refusal the server already worded for a GC (apiError, or the 409 "a log
 *  already exists for this day"). Shown as-is: humanError would flatten the 409
 *  to "That already exists.", and the raw response text was a JSON blob. */
class ServerSaid extends Error {}

/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
/** Today as YYYY-MM-DD on the user's wall clock. toISOString() is the UTC day —
 *  in Arizona every log started after 5 pm was dated tomorrow. */
/* What the Weather field suggests (free text is still allowed). */
const WEATHER_OPTS = ['Clear', 'Partly Cloudy', 'Overcast', 'Rain', 'Thunderstorm', 'Snow', 'Fog', 'Windy'];
const localToday = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fmtDay = (d?:string|null) => d ? new Date(d.slice(0,10)+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) : '—';
const fmtDate = (d?:string|null) => d ? new Date(d.slice(0,10)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
const fmtLong = (d?:string|null) => d ? new Date(d.slice(0,10)+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}) : '—';

const tempStr = (l:any) => (l.high_temp!=null||l.low_temp!=null) ? `${l.high_temp??'—'}° / ${l.low_temp??'—'}°` : '—';

/** One status → one badge. Draft stays neutral so the register is not a
 *  rainbow: only Submitted / Approved carry a hue, from lib/status-colors. */
function logStatus(l:any): { label:string; tone:BadgeTone } {
  const s = String(l.status||'draft').toLowerCase();
  if (s==='submitted') return { label:'Submitted', tone:'ongoing' };
  if (s==='approved') return { label:'Approved', tone:'ongoing' };
  if (s==='draft') return { label:'Draft', tone:'neutral' };
  return { label: s.replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase()), tone:'neutral' };
}

type MonthFilter = string; // '' = all months, else 'YYYY-MM'
type FlagFilter = 'all' | 'delays' | 'safety';

const EMPTY: Record<string,any> = {
  log_date:'',
  weather:'', high_temp:'', low_temp:'', crew_count:'', superintendent:'',
  work_performed:'', delays:'', safety_notes:'', materials_delivered:'', visitors:'', notes:'',
  phase_of_work:'', equipment:'',
  // Structured field-log sections — arrays round-trip through create AND edit.
  manpower_by_trade:[] as any[], subcontractors_on_site:[] as string[], equipment_on_site:[] as string[],
};

const CSS = `
.pdlWs > .k-page { max-width: none; }
.pdlCq { container: pdlws / inline-size; min-width: 0; }
.pdlSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.pdlSplit > * { min-width: 0; }
@container pdlws (min-width: 1080px) {
  .pdlSplit[data-open="true"] { grid-template-columns: minmax(340px, 0.8fr) minmax(0, 1.6fr); }
}
.pdlDetailCq { container: pdldetail / inline-size; min-width: 0; }
.pdlDetail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.pdlDetail > * { min-width: 0; }
.pdlRail { order: -1; }
@container pdldetail (min-width: 720px) {
  .pdlDetail { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 34%, ${layout.detailRailMax}px); }
  .pdlRail { order: 0; position: sticky; top: 16px; }
}
.pdlList .k-table th:first-child, .pdlList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.pdlList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.pdlList .k-table tbody tr:hover td:first-child { background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), var(--bg-solid); }
.pdlList .k-table tbody tr:has([data-sel="true"]) td { background: var(--brand-primary-08); }
.pdlList .k-table tbody tr:has([data-sel="true"]) td:first-child { background: linear-gradient(var(--brand-primary-08), var(--brand-primary-08)), var(--bg-solid); box-shadow: inset 3px 0 0 var(--brand-primary); }
.pdlDate { color: var(--text-primary); font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pdlClamp { display: inline-block; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.pdlMuted { color: var(--text-tertiary); }
.pdlNum { font-variant-numeric: tabular-nums; }
.pdlBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pdlSection { display: flex; flex-direction: column; gap: 8px; }
.pdlSection + .pdlSection { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
.pdlSectionTitle { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); font-weight: 700; color: var(--text-tertiary); }
.pdlSectionTitle[data-warn="true"] { color: var(--status-overdue); }
.pdlProse { font-size: var(--fs-md); line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; max-width: ${layout.readingMaxWidth}; }
.pdlProse[data-warn="true"] { color: var(--text-primary); }
.pdlChips { display: flex; flex-wrap: wrap; gap: 6px; }
.pdlChip { display: inline-flex; align-items: center; gap: 7px; padding: 5px 11px; border-radius: 999px; font-size: var(--fs-sm); font-weight: 600; color: var(--text-secondary); background: var(--bg-surface-2); border: 1px solid var(--border-default); }
.pdlChip b { color: var(--text-primary); font-weight: 800; }
.pdlChip button { display: inline-flex; align-items: center; background: none; border: 0; padding: 0; cursor: pointer; color: var(--text-tertiary); }
.pdlActions { display: flex; flex-direction: column; gap: 8px; }
.pdlActions .k-btn { width: 100%; justify-content: flex-start; }
.pdlActionsRow { display: flex; gap: 8px; align-items: center; }
.pdlActionsRow > .k-btn { flex: 1 1 auto; }
.pdlNext { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.5; }
.pdlGap { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.pdlRow { display: flex; gap: 8px; align-items: center; }
.pdlRow .k-input { flex: 1 1 auto; }
.pdlRow .k-input[data-narrow="true"] { flex: 0 0 72px; text-align: center; }
.pdlLine { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: var(--radius-sm); background: var(--bg-surface-2); border: 1px solid var(--border-subtle); }
.pdlLine > .pdlLineName { flex: 1; min-width: 0; font-size: var(--fs-sm); font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pdlLine > .pdlLineName small { font-weight: 500; color: var(--text-tertiary); margin-left: 8px; }
.pdlLine .k-input { flex: 0 0 72px; min-height: 32px; padding: 4px 8px; text-align: center; }
.pdlTotal { font-size: var(--fs-xs); color: var(--text-tertiary); text-align: right; font-weight: 700; }
.pdlTotal b { color: var(--text-primary); }
.pdlInlineErr { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--fs-sm); color: var(--status-overdue); }
.pdlDateInput { width: 100%; }
@media (max-width: 640px) {
  .pdlWs .k-btn, .pdlWs .k-stat, .pdlWs select.k-select, .pdlWs .k-input { min-height: 44px; }
  .pdlWs .k-table td { height: 48px; }
  .pdlClamp { max-width: 200px; }
  .pdlLine .k-input, .pdlRow .k-input[data-narrow="true"] { min-height: 40px; }
}
`;

const DATE_INPUT_STYLE: React.CSSProperties = {
  width:'100%', minHeight:40, padding:'8px 12px', fontSize:14,
  background:'var(--bg-surface-2)', border:'1px solid var(--border-default)',
  borderRadius:'var(--radius-sm)', color:'var(--text-primary)',
};

/** Removable-chip list with an inline add input — subs & equipment on site. */
function ChipEditor({items,onChange,placeholder}:{items:string[];onChange:(v:string[])=>void;placeholder:string}){
  const [draft,setDraft]=useState('');
  const add=()=>{const v=draft.trim(); if(!v) return; if(!items.includes(v)) onChange([...items,v]); setDraft('');};
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {items.length>0&&(
        <div className="pdlChips">
          {items.map(it=>(
            <span key={it} className="pdlChip">
              {it}
              <button type="button" aria-label={`Remove ${it}`} onClick={()=>onChange(items.filter(x=>x!==it))}>
                <X size={11} weight="bold"/>
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="pdlRow">
        <Input value={draft} onChange={e=>setDraft(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}
          placeholder={placeholder}/>
        <Button onClick={add} disabled={!draft.trim()} icon={<Plus size={13} weight="bold"/>}>Add</Button>
      </div>
    </div>
  );
}

/** Manpower-by-trade grid: one row per trade with a headcount input, plus an
 * inline add row. The saved crew count rolls up from these lines on create. */
function ManpowerEditor({rows,onChange}:{rows:any[];onChange:(v:any[])=>void}){
  const [trade,setTrade]=useState('');
  const [count,setCount]=useState('');
  const total = rows.reduce((s:number,r:any)=>s+(Number(r.count)||0),0);
  const add=()=>{
    const t=trade.trim(); if(!t) return;
    if(!rows.some((r:any)=>r.trade===t)) onChange([...rows,{trade:t,count:Number(count)||0}]);
    setTrade(''); setCount('');
  };
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {rows.length>0&&(
        <>
          {rows.map((r:any,i:number)=>(
            <div key={`${r.trade}-${i}`} className="pdlLine">
              <HardHat size={14} weight="fill" style={{flexShrink:0,color:'var(--text-tertiary)'}}/>
              <div className="pdlLineName">
                {r.trade}
                {Array.isArray(r.crews)&&r.crews.length>0&&<small>{r.crews.join(', ')}</small>}
              </div>
              <Input type="number" value={r.count} min={0} aria-label={`${r.trade} headcount`}
                onChange={e=>onChange(rows.map((x:any,xi:number)=>xi===i?{...x,count:e.target.value===''?'':Number(e.target.value)}:x))}/>
              <Button variant="ghost" size="sm" icon={<X size={12} weight="bold"/>} aria-label={`Remove ${r.trade}`} onClick={()=>onChange(rows.filter((_:any,xi:number)=>xi!==i))}/>
            </div>
          ))}
          <div className="pdlTotal">Total on site: <b>{total}</b></div>
        </>
      )}
      <div className="pdlRow">
        <Suggest className="k-input" value={trade} onChange={e=>setTrade(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}
          placeholder="Add a trade…" options={SUB_TRADES} />
        <Input type="number" value={count} min={0} data-narrow="true" aria-label="Headcount"
          onChange={e=>setCount(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}
          placeholder="0"/>
        <Button onClick={add} disabled={!trade.trim()} icon={<Plus size={13} weight="bold"/>}>Add</Button>
      </div>
    </div>
  );
}

export default function DailyLogsPage(){
  const {projectId} = useParams() as {projectId:string};
  const [logs,setLogs]       = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState('');
  const [selected,setSelected] = useState<any>(null);
  const [mode,setMode]       = useState<'view'|'edit'|'create'|null>(null);
  const [form,setForm]       = useState<Record<string,any>>({...EMPTY});
  const detailRef = useRef<HTMLDivElement>(null);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(mode==='create'||mode==='edit', form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `project-daily-log:${projectId}`,
    draftData: mode==='create'?form:undefined,
    restoreDraft: (d) => { setForm(d as Record<string,any>); setMode('create'); setSelected(null); },
    onSave: () => save(),
  });
  const [saving,setSaving]   = useState(false);
  const [deleting,setDeleting]=useState(false);
  const { toast, show: showToast } = useToast(4000);
  const rights = useEditRights('Projects');
  // Homeowner Update: drafted from these logs, approved before it is sent.
  const [ownerUpdateOpen, setOwnerUpdateOpen] = useState(false);
  const [search,setSearch]   = useState('');
  const [monthFilter,setMonthFilter] = useState<MonthFilter>('');
  const [flagFilter,setFlagFilter] = useState<FlagFilter>('all');
  // Project snapshot (/api/project-context) — the page walks in knowing the job:
  // last log date, open items, schedule — so create prefills itself.
  const { ctx } = useProjectContext(projectId);
  const [auto,setAuto]       = useState<{date?:boolean;crew?:boolean;manpower?:boolean;subs?:boolean;carry?:boolean}>({});
  const [prefilling,setPrefilling] = useState(false);

  /** The server's logs with what is saved on this phone laid over them:
   *  logs written offline, edits and deletes that haven't been sent yet. */
  const withSaved = useCallback(async(server:any[])=>{
    let rows = server.slice();
    for(const w of await listSaved(projectId,'daily-log')){
      const mark = { _offline:true, _offlineError:w.lastError };
      if(w.method==='POST') rows.unshift({...(w.row||{}), id:savedRowId(w.id), ...mark});
      else if(w.method==='PUT'&&w.recordId) rows = rows.map((l:any)=>l.id===w.recordId?{...l,...(w.row||{}),...mark}:l);
      else if(w.method==='DELETE'&&w.recordId) rows = rows.filter((l:any)=>l.id!==w.recordId);
    }
    return rows.sort((a:any,b:any)=>(b.log_date||'').localeCompare(a.log_date||''));
  },[projectId]);

  const load = useCallback(async()=>{
    setLoading(true);
    try{
      setLoadError('');
      const h = await getAuthHeaders();
      const r = await fetch(`/api/daily-logs/list?projectId=${projectId}`,{headers:h});
      if (!r.ok) throw new Error('Failed to load data');
      const d = await r.json();
      setLogs(await withSaved(d.logs||[]));
    }catch{
      // Offline with nothing saved for this screen: still show the logs written on this phone.
      setLogs(await withSaved([]));
      setLoadError(isOffline() ? '' : 'Failed to load. Please try again.');
    }
    finally{setLoading(false);}
  },[projectId, withSaved]);

  // Background revalidate — reconciles server truth after an optimistic write
  // without flipping the list back into its loading state.
  const revalidate = useCallback(async()=>{
    try{
      const h = await getAuthHeaders();
      const r = await fetch(`/api/daily-logs/list?projectId=${projectId}`,{headers:h});
      if(!r.ok) return;
      const d = await r.json();
      setLogs(await withSaved(d.logs||[]));
    }catch{/* background refresh — keep the optimistic rows */}
  },[projectId, withSaved]);

  useEffect(()=>{load();},[load]);

  // Logs written offline went up: show the server's copies.
  useEffect(()=>{
    const onSynced = (e: Event) => { const d = (e as CustomEvent).detail || {}; if(d.kind==='daily-log' && (!d.projectId || d.projectId===projectId)) revalidate(); };
    window.addEventListener('saguaro:outbox-synced', onSynced);
    return () => window.removeEventListener('saguaro:outbox-synced', onSynced);
  },[projectId, revalidate]);

  // Keep the selected row pointed at the live record once a revalidate swaps rows in.
  useEffect(()=>{
    if(!selected) return;
    const live = logs.find((l:any)=>l.id===selected.id);
    if(live && live!==selected) setSelected(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[logs]);

  function openCreate(){
    // Blank manual log — kept as the fallback path; the primary entry is
    // openAutoFill below. Today's date + crew carried from the last log.
    const prev = logs[0]; // list arrives sorted date-desc
    setForm({
      ...EMPTY,
      log_date: localToday(),
      crew_count: prev?.crew_count ? String(prev.crew_count) : '',
    });
    setAuto({date:true, crew:!!(prev?.crew_count)});
    setMode('create'); setSelected(null);
  }

  // AUTO-FIRST: one tap → the prefill route assembles the draft server-side
  // (headcount from BOTH clock systems, manpower from active crews, subs from
  // the project team, carry-forward off the last log, deliveries) and the
  // composer opens pre-filled. The GC only types what the system can't know.
  // Photo-sheet shortcut (?new=1): today's log, drafted when there's signal, blank when not.
  useOpenOnNew(() => (isOffline() ? openCreate() : void openAutoFill()), !loading);

  async function openAutoFill(){
    setPrefilling(true);
    try{
      const h = await getAuthHeaders();
      const today = localToday();
      const r = await fetch(`/api/projects/${projectId}/daily-logs/prefill?date=${today}`,{headers:h});
      if(!r.ok) throw new Error('Prefill failed');
      const p = await r.json();
      const cf = p.carryForward||{};
      const manpower = Array.isArray(p.manpowerByTrade)
        ? p.manpowerByTrade.map((m:any)=>({trade:m.trade,count:Number(m.count)||0,crews:m.crews}))
        : [];
      setForm({
        ...EMPTY,
        log_date: today,
        crew_count: p.crewCount ? String(p.crewCount) : (logs[0]?.crew_count ? String(logs[0].crew_count) : ''),
        superintendent: cf.superintendent||'',
        phase_of_work: cf.phase_of_work||'',
        equipment: cf.equipment||'',
        manpower_by_trade: manpower,
        subcontractors_on_site: Array.isArray(p.subcontractorsOnSite)?p.subcontractorsOnSite:[],
        materials_delivered: Array.isArray(p.deliveriesToday)&&p.deliveriesToday.length>0
          ? p.deliveriesToday.map((d:any)=>[d.item_name,d.vendor?`(${d.vendor})`:'',d.quantity?`x ${d.quantity}`:''].filter(Boolean).join(' ')).join('\n')
          : '',
      });
      setAuto({
        date:true,
        crew:Number(p.crewCount)>0,
        manpower:manpower.length>0,
        subs:Array.isArray(p.subcontractorsOnSite)&&p.subcontractorsOnSite.length>0,
        carry:!!(cf.superintendent||cf.phase_of_work||cf.equipment),
      });
      setMode('create'); setSelected(null);
    }catch(e:any){
      console.error(e);
      showToast(humanError(e,'Auto-fill failed — opening a blank log.'),'bad');
      openCreate();
    }finally{setPrefilling(false);}
  }

  // Copy yesterday: carries the structural fields off the latest log — the
  // day-specific narrative (work / delays / safety) intentionally starts blank.
  function copyYesterday(){
    const prev = logs[0];
    if(!prev) return;
    setForm({
      ...EMPTY,
      log_date: localToday(),
      crew_count: prev.crew_count ? String(prev.crew_count) : '',
      superintendent: prev.superintendent||'',
      phase_of_work: prev.phase_of_work||'',
      equipment: prev.equipment||'',
      manpower_by_trade: Array.isArray(prev.manpower_by_trade)?prev.manpower_by_trade:[],
      subcontractors_on_site: Array.isArray(prev.subcontractors_on_site)?prev.subcontractors_on_site:[],
      equipment_on_site: Array.isArray(prev.equipment_on_site)?prev.equipment_on_site:[],
    });
    setAuto({
      date:true, crew:!!prev.crew_count, carry:true,
      manpower:Array.isArray(prev.manpower_by_trade)&&prev.manpower_by_trade.length>0,
      subs:Array.isArray(prev.subcontractors_on_site)&&prev.subcontractors_on_site.length>0,
    });
    setMode('create'); setSelected(null);
  }

  function openEdit(log:any){
    setForm({
      log_date:log.log_date||'',weather:log.weather||'',
      high_temp:log.high_temp??'',low_temp:log.low_temp??'',
      superintendent:log.superintendent||'',
      crew_count:log.crew_count??'',work_performed:log.work_performed||'',
      delays:log.delays||'',safety_notes:log.safety_notes||'',
      materials_delivered:log.materials_delivered||'',visitors:log.visitors||'',notes:log.notes||'',
      phase_of_work:log.phase_of_work||'',equipment:log.equipment||'',
      manpower_by_trade:Array.isArray(log.manpower_by_trade)?log.manpower_by_trade:[],
      subcontractors_on_site:Array.isArray(log.subcontractors_on_site)?log.subcontractors_on_site:[],
      equipment_on_site:Array.isArray(log.equipment_on_site)?log.equipment_on_site:[],
    });
    setSelected(log); setMode('edit');
  }
  function viewLog(log:any){
    setSelected(log); setMode('view');
  }
  function closePanel(){ setSelected(null); setMode(null); }
  /** The composer's close paths (X, Cancel, Esc, backdrop) keep the day's
   *  record in view when an edit is abandoned. */
  function closeComposer(){
    if(mode==='edit'&&selected){ setMode('view'); return; }
    closePanel();
  }

  async function save(): Promise<boolean> {
    // Optimistic save (house pattern: budget saveEdit) — the log lands in the
    // list and the panel closes instantly; the network settles in the background.
    const snapshot = {...form};
    const prevMode = mode, prevSelected = selected;
    setSaving(true);
    try{
      // Structured sections — empty arrays go up as null: the create route
      // rolls crew_count up from manpower lines whenever an array is present,
      // so an empty [] would zero the typed headcount.
      const manpower = (form.manpower_by_trade||[])
        .map((m:any)=>({...m,count:Number(m.count)||0}))
        .filter((m:any)=>m.trade);
      const payload: Record<string,any> = {
        ...form,
        crew_count:Number(form.crew_count)||0,
        high_temp:form.high_temp!==''?Number(form.high_temp):null,
        low_temp:form.low_temp!==''?Number(form.low_temp):null,
        manpower_by_trade: manpower.length>0 ? manpower : null,
        subcontractors_on_site: (form.subcontractors_on_site||[]).length>0 ? form.subcontractors_on_site : null,
        equipment_on_site: (form.equipment_on_site||[]).length>0 ? form.equipment_on_site : null,
      };
      const createBody = {...payload,projectId,
        logDate:payload.log_date,workPerformed:payload.work_performed,
        safetyNotes:payload.safety_notes,materialsDelivered:payload.materials_delivered,
        crewCount:payload.crew_count,
        temperatureHigh:payload.high_temp,temperatureLow:payload.low_temp,
      };
      const row = {...payload,project_id:projectId};
      if(mode==='create'){
        const tempId = `temp-${Date.now()}`;
        setLogs(prev=>[{id:tempId,...row},...prev]
          .sort((a:any,b:any)=>(b.log_date||'').localeCompare(a.log_date||'')));
        closePanel();
        showToast('Daily log created.');
        // No signal on site is normal: the log is kept on this phone and sent when it's back.
        const res = await sendOrSave({ url:'/api/daily-logs/create', method:'POST', body:createBody, projectId, kind:'daily-log', label:`Daily log ${payload.log_date||''}`.trim(), row });
        if(res.saved){
          setLogs(prev=>prev.map((l:any)=>l.id===tempId?{...l,id:savedRowId(res.id),_offline:true}:l));
          showToast("Saved on this phone — it sends when you're back online.");
        } else {
          const r = res.response;
          if(!r.ok){ setLogs(prev=>prev.filter((l:any)=>l.id!==tempId)); throw new ServerSaid(await reasonFromResponse(r)); }
          const d = await r.json();
          if(d.log) setLogs(prev=>prev.map((l:any)=>l.id===tempId?d.log:l));
          revalidate();
        }
      } else if(mode==='edit'&&selected){
        const prevLog = selected;
        setLogs(prev=>prev.map((l:any)=>l.id===prevLog.id?{...l,...payload}:l));
        // Stay on the day's record — it re-renders with the saved values.
        setSelected({...prevLog,...payload}); setMode('view');
        showToast('Log updated.');
        const localId = savedIdOf(String(prevLog.id));
        if(localId){
          // Written offline and not sent yet: change what will be sent.
          await updateSaved(localId,{ body:JSON.stringify(createBody), row, label:`Daily log ${payload.log_date||''}`.trim() });
          showToast("Updated on this phone — it sends when you're back online.");
        } else {
          const res = await sendOrSave({ url:`/api/daily-logs/${prevLog.id}`, method:'PUT', body:payload, projectId, kind:'daily-log', label:`Changes to the ${payload.log_date||''} daily log`, row:payload, recordId:prevLog.id });
          if(res.saved){
            setLogs(prev=>prev.map((l:any)=>l.id===prevLog.id?{...l,_offline:true}:l));
            showToast("Saved on this phone — it sends when you're back online.");
          } else {
            if(!res.response.ok){ setLogs(prev=>prev.map((l:any)=>l.id===prevLog.id?prevLog:l)); throw new ServerSaid(await reasonFromResponse(res.response)); }
            revalidate();
          }
        }
      }
      guard.clearDraft();
      return true;
    }catch(e:any){
      console.error(e); showToast(e instanceof ServerSaid ? e.message : humanError(e,'Save failed. Please try again.'),'bad');
      // Rollback already applied — reopen the panel with the input intact.
      setForm(snapshot); setMode(prevMode); setSelected(prevSelected);
    }
    finally{setSaving(false);}
    return false;
  }

  async function deleteLog(log:any){
    if(!(await confirmDialog({ title: 'Please confirm', message: `Delete log for ${log.log_date}?`, danger: true }))) return;
    // Optimistic remove — the log leaves and the panel closes instantly;
    // rollback restores the exact list on failure.
    const prevLogs = logs;
    setLogs(prev=>prev.filter((l:any)=>l.id!==log.id));
    showToast('Log deleted.');
    closePanel();
    setDeleting(true);
    try{
      const localId = savedIdOf(String(log.id));
      if(localId){ await removeSaved(localId); return; } // never left this phone
      const res = await sendOrSave({ url:`/api/daily-logs/${log.id}`, method:'DELETE', projectId, kind:'daily-log', label:`Delete the ${log.log_date||''} daily log`, recordId:log.id });
      if(res.saved){ showToast("Deleted on this phone — it syncs when you're back online."); return; }
      if (!res.response.ok) throw new Error('Delete failed');
      revalidate();
    }catch{setLogs(prevLogs);showToast('Delete failed. Please try again.','bad');}
    finally{setDeleting(false);}
  }

  const months = Array.from(new Set(logs.map(l=>(l.log_date||'').slice(0,7)))).sort().reverse();
  const monthLabel = (m:string) => m ? new Date(m+'-01T12:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'}) : m;
  const thisMonthIso = localToday().slice(0,7);

  const filtered = logs.filter(l=>{
    const q = search.toLowerCase();
    const ms = !search || (l.work_performed||'').toLowerCase().includes(q)
      ||(l.notes||'').toLowerCase().includes(q)
      ||(l.superintendent||'').toLowerCase().includes(q)
      ||(l.weather||'').toLowerCase().includes(q)
      ||(l.log_date||'').includes(search);
    const mm = !monthFilter||(l.log_date||'').startsWith(monthFilter);
    const ff = flagFilter==='all' || (flagFilter==='delays' ? !!(l.delays||'').trim() : !!(l.safety_notes||'').trim());
    return ms&&mm&&ff;
  });

  const totalCrew  = logs.reduce((s:number,l:any)=>s+(Number(l.crew_count)||0),0);
  const avgCrew    = logs.length?Math.round(totalCrew/logs.length):0;
  const delayDays  = logs.filter((l:any)=>l.delays?.trim()).length;
  const thisMonth  = logs.filter((l:any)=>(l.log_date||'').startsWith(thisMonthIso)).length;
  const lastLogIso = (ctx?.recent?.lastDailyLogDate as string|null) || logs[0]?.log_date || null;
  const gapDays    = unloggedWorkdays(lastLogIso, localToday(), ctx?.project);

  const filtersActive = !!search || !!monthFilter || flagFilter!=='all';
  const clearFilters = () => { setSearch(''); setMonthFilter(''); setFlagFilter('all'); };

  // ── Stat tiles: each opens the register filtered to that slice ──
  const stats: StatItem[] = loading
    ? [
        { label:'Last Log', value:'—', sub:'Loading…', icon:<CalendarCheck size={15}/> },
        { label:'This Month', value:'—', sub:'Loading…', icon:<CalendarBlank size={15}/> },
        { label:'Days with Delays', value:'—', sub:'Loading…', icon:<WarningCircle size={15}/> },
        { label:'Avg Crew / Day', value:'—', sub:'Loading…', icon:<UsersThree size={15}/> },
      ]
    : [
        { label:'Last Log', value: lastLogIso ? fmtDay(lastLogIso) : 'None yet',
          tone: gapDays>0 ? 'bad' : (lastLogIso ? 'good' : 'default'),
          sub: lastLogIso ? (gapDays>0 ? `${gapDays} workday${gapDays===1?'':'s'} unlogged` : 'Record is current') : 'Start the record',
          onClick: logs[0] ? () => viewLog(logs[0]) : undefined, icon:<CalendarCheck size={15}/> },
        { label:'This Month', value: thisMonth, sub: monthFilter===thisMonthIso ? 'Filtered — click to clear' : monthLabel(thisMonthIso),
          onClick: () => setMonthFilter(m => (m===thisMonthIso ? '' : thisMonthIso)), active: monthFilter===thisMonthIso, icon:<CalendarBlank size={15}/> },
        { label:'Days with Delays', value: delayDays, tone: delayDays>0 ? 'bad' : 'default',
          sub: flagFilter==='delays' ? 'Filtered — click to clear' : delayDays>0 ? 'Flagged in the record' : 'None flagged',
          onClick: () => setFlagFilter(f => (f==='delays' ? 'all' : 'delays')), active: flagFilter==='delays', icon:<WarningCircle size={15}/> },
        { label:'Avg Crew / Day', value: avgCrew, sub: `${logs.length} field report${logs.length===1?'':'s'}`, href: `/app/projects/${projectId}/crews`, icon:<UsersThree size={15}/> },
      ];

  // ── Register columns: full register, or a compact one beside the day's record ──
  const isSel = (l:any) => selected?.id===l.id && mode!=='create';
  const dateCol: Column<any> = { key:'log_date', header:'Date', primary:true, phone:'show', accessor:l=>l.log_date||'', width:130, render:l=><span className="pdlDate" data-sel={isSel(l)?'true':undefined}>{fmtDate(l.log_date)}</span> };
  const statusCol: Column<any> = { key:'status', header:'Status', phone:'show', accessor:l=>l._offline?'Waiting for Signal':logStatus(l).label, render:l=>{
    if(l._offline) return <span title={l._offlineError?`Couldn't send: ${l._offlineError}`:"Saved on this phone — it sends when you're back online."}><Badge tone={l._offlineError?'overdue':'gold'}>{l._offlineError?"Couldn't Send":'Waiting for Signal'}</Badge></span>;
    const s=logStatus(l);return <Badge tone={s.tone}>{s.label}</Badge>;
  } };
  const weatherCol: Column<any> = { key:'weather', header:'Weather', phone:'hide', accessor:l=>l.weather||'', render:l=>l.weather?<span className="pdlClamp" style={{maxWidth:160}} title={l.weather}>{l.weather}</span>:<span className="pdlMuted">—</span> };
  const tempCol: Column<any> = { key:'temp', header:'Temp', phone:'hide', accessor:l=>Number(l.high_temp)||0, align:'right', render:l=><span className="pdlMuted pdlNum">{tempStr(l)}</span> };
  const crewCol: Column<any> = { key:'crew_count', header:'Crew', phone:'show', total:'sum', accessor:l=>Number(l.crew_count)||0, align:'right', render:l=><span className="pdlNum" style={{display:'inline-flex',alignItems:'center',gap:4}}><UsersThree size={14} style={{color:'var(--text-tertiary)'}}/>{Number(l.crew_count)||0}</span> };
  const superCol: Column<any> = { key:'superintendent', header:'Superintendent', phone:'hide', accessor:l=>l.superintendent||'', render:l=>l.superintendent?<span style={{color:'var(--text-primary)'}}>{l.superintendent}</span>:<span className="pdlMuted">—</span> };
  const workCol: Column<any> = { key:'work_performed', header:'Work Performed', phone:'hide', accessor:l=>l.work_performed||'', render:l=>l.work_performed?<span className="pdlClamp" title={l.work_performed}>{l.work_performed}</span>:<span className="pdlMuted">—</span> };
  const flagsCol: Column<any> = { key:'flags', header:'Flags', phone:'show', groupable:false, accessor:l=>((l.delays||'').trim()?2:0)+((l.safety_notes||'').trim()?1:0), render:l=>{
    const hasDelay=!!(l.delays||'').trim(), hasSafety=!!(l.safety_notes||'').trim();
    if(!hasDelay&&!hasSafety) return <span className="pdlMuted">Clear</span>;
    return <span className="pdlBadges">{hasDelay&&<Badge tone="overdue">Delays</Badge>}{hasSafety&&<Badge tone="neutral">Safety</Badge>}</span>;
  } };
  const columns: Column<any>[] = (selected && mode!=='create')
    ? [dateCol, crewCol, flagsCol, statusCol]
    : [dateCol, statusCol, weatherCol, tempCol, crewCol, superCol, workCol, flagsCol];

  /** The record's verbs — shared by the row overflow and the rail. */
  function logActions(log:any): Action[] {
    const temp = String(log.id).startsWith('temp-');
    const local = !!savedIdOf(String(log.id));
    return [
      { label:'Open Day', icon:<ClipboardText size={15}/>, onClick:()=>viewLog(log) },
      { label:'Edit Log', icon:<PencilSimple size={15}/>, onClick:()=>openEdit(log), disabled:temp },
      { label:'Open Full Record', icon:<ArrowSquareOut size={15}/>, href:`/app/projects/${projectId}/items/daily_logs/${log.id}`, hidden:temp||local },
      { label:'Delete', icon:<Trash size={15}/>, onClick:()=>deleteLog(log), tone:'danger', disabled:temp||deleting },
    ];
  }

  // ── Day's record (detail workspace) ──
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
  const chips = (items:any[], withCount=false) => (
    <div className="pdlChips">
      {items.map((it:any,i:number)=>(
        <span key={i} className="pdlChip">
          {withCount ? <>{it.trade}<b>{Number(it.count)||0}</b></> : String(it)}
        </span>
      ))}
    </div>
  );
  const textSection = (title:string, value:string|null|undefined, opts:{warn?:boolean;icon?:React.ReactNode;emptyText?:string}={}) => {
    const v = (value||'').trim();
    if(!v && !opts.emptyText) return null;
    return (
      <div className="pdlSection">
        <div className="pdlSectionTitle" data-warn={opts.warn&&v?'true':undefined}>{opts.icon}{title}</div>
        {v ? <div className="pdlProse" data-warn={opts.warn?'true':undefined}>{v}</div>
           : <div className="pdlMuted" style={{fontSize:'var(--fs-sm)'}}>{opts.emptyText}</div>}
      </div>
    );
  };

  const detailWorkspace = detailOpen && (
    <div ref={detailRef} className="pdlDetailCq">
      <div className="pdlDetail">
        <Card
          title={fmtLong(selected.log_date)}
          subtitle={[selected.weather, tempStr(selected)!=='—'?`${tempStr(selected)}F`:null, selected.superintendent?`Super: ${selected.superintendent}`:null].filter(Boolean).join(' · ') || undefined}
          actions={<Button variant="ghost" size="sm" icon={<X size={16}/>} aria-label="Close day" title="Close day" onClick={closePanel}/>}
        >
          {Array.isArray(selected.manpower_by_trade)&&selected.manpower_by_trade.length>0&&(
            <div className="pdlSection">
              <div className="pdlSectionTitle"><UsersThree size={14}/>Manpower by Trade</div>
              {chips(selected.manpower_by_trade, true)}
            </div>
          )}
          {Array.isArray(selected.subcontractors_on_site)&&selected.subcontractors_on_site.length>0&&(
            <div className="pdlSection">
              <div className="pdlSectionTitle"><HardHat size={14}/>Subcontractors On Site</div>
              {chips(selected.subcontractors_on_site)}
            </div>
          )}
          {Array.isArray(selected.equipment_on_site)&&selected.equipment_on_site.length>0&&(
            <div className="pdlSection">
              <div className="pdlSectionTitle"><Wrench size={14}/>Equipment On Site</div>
              {chips(selected.equipment_on_site)}
            </div>
          )}
          {textSection('Work Performed', selected.work_performed, { icon:<ClipboardText size={14}/>, emptyText:'No work recorded for this day.' })}
          {textSection('Delays / Issues', selected.delays, { warn:true, icon:<WarningCircle size={14}/>, emptyText:'No delays reported.' })}
          {textSection('Safety Notes', selected.safety_notes, { icon:<ShieldCheck size={14}/>, emptyText:'No safety issues reported.' })}
          {textSection('Materials Delivered', selected.materials_delivered, { icon:<Package size={14}/> })}
          {textSection('Phase of Work', selected.phase_of_work)}
          {textSection('Equipment Notes', selected.equipment, { icon:<Wrench size={14}/> })}
          {textSection('Visitors / Inspections', selected.visitors)}
          {textSection('General Notes', selected.notes)}
        </Card>

        <aside className="pdlRail" aria-label="Daily log details and actions">
          <Card title="Details">
            <div className="pdlSection">
              <div className="pdlBadges">
                <Badge tone={logStatus(selected).tone} dot>{logStatus(selected).label}</Badge>
                {!!(selected.delays||'').trim() && <Badge tone="overdue">Delays</Badge>}
                {!!(selected.safety_notes||'').trim() && <Badge tone="neutral">Safety Note</Badge>}
              </div>
            </div>
            <div className="pdlSection">
              <DetailList items={([
                ['Crew on Site', <span key="crew" className="pdlNum">{Number(selected.crew_count)||0}</span>],
                ['Superintendent', selected.superintendent || ''],
                ['Weather', selected.weather || ''],
                ['High / Low', tempStr(selected)],
                ['Precipitation', selected.precipitation || ''],
                ['Wind', selected.wind_conditions || ''],
                ['Phase of Work', selected.phase_of_work || ''],
                ['Created', fmtDate(selected.created_at)],
              ] as [string, React.ReactNode][]).filter(([,v])=>v!=null&&v!==''&&v!=='—')}/>
            </div>
            <div className="pdlSection">
              <div className="pdlActions">
                <Button icon={<PencilSimple size={16}/>} onClick={()=>openEdit(selected)} disabled={String(selected.id).startsWith('temp-')}>
                  Edit Log
                </Button>
                <div className="pdlActionsRow">
                  <Button icon={<ArrowSquareOut size={16}/>} href={String(selected.id).startsWith('temp-')||savedIdOf(String(selected.id))?undefined:`/app/projects/${projectId}/items/daily_logs/${selected.id}`} disabled={String(selected.id).startsWith('temp-')||!!savedIdOf(String(selected.id))} title={savedIdOf(String(selected.id))?"Opens once it's sent from this phone":undefined}>
                    Open Full Record
                  </Button>
                  <RowActions actions={[
                    { label:'Delete', icon:<Trash size={15}/>, onClick:()=>deleteLog(selected), tone:'danger', disabled:String(selected.id).startsWith('temp-')||deleting },
                  ]}/>
                </div>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );

  // ── Register body: loading / error / empty / no-match / rows — each distinct ──
  let listBody: React.ReactNode;
  if (!loading && loadError) {
    listBody = (
      <EmptyState
        icon={<WarningCircle size={22}/>}
        title="Couldn't load daily logs"
        text={`${loadError} Nothing has been lost — try again.`}
        action={<Button icon={<ArrowClockwise size={15}/>} onClick={load}>Retry</Button>}
      />
    );
  } else if (!loading && logs.length===0) {
    listBody = (
      <EmptyState
        icon={<ClipboardText size={22}/>}
        title="No daily logs yet"
        action={<Button icon={<Sparkle size={15} weight="fill"/>} onClick={openAutoFill} disabled={prefilling}>Start Today&apos;s Log</Button>}
      />
    );
  } else {
    listBody = (
      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={l=>l.id}
        loading={loading}
        defaultSort={{ key:'log_date', dir:'desc' }}
        onRowClick={viewLog}
        rowActions={logActions}
        tableId="project-daily-logs"
        bulkEdit={itemBulkEdit('daily_logs', { allowed: rights.edit, canDelete: rights.full, deleteUrl: r => `/api/daily-logs/${r.id}`, onDone: () => { void revalidate(); } })}
        exportName="daily-logs"
        isSelected={isSel}
        empty={
          <EmptyState
            icon={<ClipboardText size={22}/>}
            title="No logs match these filters"
            action={<Button onClick={clearFilters}>Clear Filters</Button>}
          />
        }
      />
    );
  }

  const composerOpen = mode==='create'||mode==='edit';
  const prev = logs[0];

  return (
    <div className="pdlWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label:'Projects', href:'/app/projects' },
          { label: ctx?.project?.name || 'Project', href:`/app/projects/${projectId}/overview` },
          { label:'Daily Logs' },
        ]}
        title="Daily Logs"
        subtitle={ctx?.project?.name || undefined}
        actions={
          /* Primary last. Auto-fill is the action this screen exists for,
             so it sits on the right where the eye lands, not buried at
             the head of the row ahead of two fallbacks. */
          <>
            <Menu
              label="More log actions"
              actions={[
                { label:'Blank Log', icon:<Plus size={15} weight="bold"/>, onClick:openCreate },
                ...(logs.length>0 ? [{ label:'Homeowner Update', icon:<PaperPlaneTilt size={15} weight="bold"/>, onClick:()=>setOwnerUpdateOpen(true) }] : []),
              ]}
            />
            {logs.length>0&&(
              <Button icon={<CopySimple size={15} weight="bold"/>} onClick={copyYesterday}>Copy Yesterday</Button>
            )}
            <Button variant="primary" icon={<Sparkle size={15} weight="fill"/>} onClick={openAutoFill} disabled={prefilling}>
              {prefilling?'Assembling draft…':'Auto-Fill Today'}
            </Button>
          </>
        }
      >
        {!loadError && <StatRow items={stats}/>}

        {!loading && !loadError && logs.length>0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search logs by work, notes, super, or date…"
            filters={
              <>
                <Select
                  aria-label="Month"
                  value={monthFilter}
                  onChange={e=>setMonthFilter(e.target.value)}
                  style={{ width:'auto', minWidth:160 }}
                  options={[{ value:'', label:'All Months' }, ...months.map(m=>({ value:m, label:monthLabel(m) }))]}
                />
                <Select
                  aria-label="Flags"
                  value={flagFilter}
                  onChange={e=>setFlagFilter(e.target.value as FlagFilter)}
                  style={{ width:'auto', minWidth:150 }}
                  options={[
                    { value:'all', label:'All Days' },
                    { value:'delays', label:'Days with Delays' },
                    { value:'safety', label:'Days with Safety Notes' },
                  ]}
                />
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
          />
        )}

        <div className="pdlCq">
          <div className="pdlSplit" data-open={detailOpen?'true':'false'}>
            <div className="pdlList">
              <Card flush>{listBody}</Card>
            </div>
            {detailWorkspace}
          </div>
        </div>
      </PageShell>

      {/* ── Composer: create / edit ───────────────────────────────── */}
      <FormModal
        open={composerOpen}
        onClose={closeComposer}
        title={mode==='edit' ? `Edit Log — ${fmtDate(form.log_date)}` : 'New Daily Log'}
        subtitle={ctx?.project?.name || undefined}
        onSubmit={async()=>{ await save(); }}
        submitLabel={mode==='create'?'Create Log':'Save Changes'}
        busy={saving}
      >
        {mode==='create' && (()=>{
          const lastLog = ctx?.recent?.lastDailyLogDate || logs[0]?.log_date || null;
          const gap = unloggedWorkdays(lastLog, localToday(), ctx?.project);
          const prevLine = prev ? [
            `Prev crew ${prev.crew_count||0}`,
            prev.weather ? `${prev.weather}${prev.high_temp!=null?` ${prev.high_temp}°/${prev.low_temp??'—'}°F`:''}` : null,
            prev.superintendent ? `Super ${prev.superintendent}` : null,
          ].filter(Boolean).join(' · ') : undefined;
          return (
            <div className="pdlGap">
              <Callout
                tone={gap>0 ? 'danger' : 'info'}
                icon={gap>0 ? <WarningCircle size={16} weight="fill"/> : <Info size={16}/>}
                title={lastLog
                  ? gap>0
                    ? `Last log ${fmtDay(lastLog)} — ${gap} workday${gap===1?'':'s'} unlogged`
                    : `Last log ${fmtDay(lastLog)} — record is current`
                  : 'First daily log on this project'}
                text={prevLine}
              />
              {/* NOBODY TYPES WEATHER — the create route stamps NWS server-side
                  whenever the fields are left blank. */}
            </div>
          );
        })()}

        <FormGrid cols={2}>
          <Field label="Log Date" hint={mode==='create'?'Defaulted to today.':undefined}>
            <div className="pdlDateInput"><SaguaroDatePicker value={form.log_date} onChange={v=>setForm(f=>({...f,log_date:v}))} style={DATE_INPUT_STYLE}/></div>
          </Field>
          <Field label="Superintendent" hint={mode==='create'&&logs[0]?.superintendent?`Last log: ${logs[0].superintendent}.`:undefined}>
            <Input value={form.superintendent} onChange={e=>setForm(f=>({...f,superintendent:e.target.value}))} placeholder="Who ran the site today"/>
          </Field>
          <Field label="Weather" hint={mode==='create'?'Blank = stamped from NWS on save.':undefined}>
            <Suggest className="k-input" value={form.weather} onChange={e=>setForm(f=>({...f,weather:e.target.value}))} placeholder={mode==='create'?'Auto (NWS)':'Clear, 10 mph W, dusty…'} options={WEATHER_OPTS} />
          </Field>
          <Field label="Crew Count" hint={mode==='create'&&auto.crew ? 'From clock-ins or your last log.' : undefined}>
            <Input type="number" value={form.crew_count} onChange={e=>setForm(f=>({...f,crew_count:e.target.value}))} placeholder="0" min={0}/>
          </Field>
          <Field label="High °F">
            <Input type="number" value={form.high_temp} onChange={e=>setForm(f=>({...f,high_temp:e.target.value}))} placeholder={mode==='create'?'Auto':'95'}/>
          </Field>
          <Field label="Low °F">
            <Input type="number" value={form.low_temp} onChange={e=>setForm(f=>({...f,low_temp:e.target.value}))} placeholder={mode==='create'?'Auto':'72'}/>
          </Field>
          <Field label="Manpower by Trade" span
            hint={auto.manpower
              ? 'From your active crews. The total becomes the saved crew count.'
              : 'The total becomes the saved crew count.'}>
            <ManpowerEditor rows={form.manpower_by_trade||[]} onChange={v=>setForm(f=>({...f,manpower_by_trade:v}))}/>
          </Field>
          <Field label="Subcontractors On Site" hint={auto.subs?'From the project team — remove any not on site.':undefined}>
            <ChipEditor items={form.subcontractors_on_site||[]} onChange={v=>setForm(f=>({...f,subcontractors_on_site:v}))} placeholder="Add a subcontractor…"/>
          </Field>
          <Field label="Equipment On Site">
            <ChipEditor items={form.equipment_on_site||[]} onChange={v=>setForm(f=>({...f,equipment_on_site:v}))} placeholder="Add equipment (excavator, crane, lifts…)"/>
          </Field>
          <Field label="Phase of Work" hint={mode==='create'&&auto.carry&&!!form.phase_of_work?'Carried from the last log.':undefined}>
            <Input value={form.phase_of_work} onChange={e=>setForm(f=>({...f,phase_of_work:e.target.value}))} placeholder="Foundations, framing, MEP rough-in…"/>
          </Field>
          <Field label="Equipment Notes" hint={mode==='create'&&auto.carry&&!!form.equipment?'Carried from the last log.':undefined}>
            <Input value={form.equipment} onChange={e=>setForm(f=>({...f,equipment:e.target.value}))} placeholder="Hours, downtime, rentals…"/>
          </Field>
          <Field label="Work Performed" span>
            <Textarea value={form.work_performed} onChange={e=>setForm(f=>({...f,work_performed:e.target.value}))} rows={4} placeholder="Describe work completed today…"/>
          </Field>
          <Field label="Delays / Issues" span>
            <Textarea value={form.delays} onChange={e=>setForm(f=>({...f,delays:e.target.value}))} rows={2} placeholder="Any delays, blockers, or issues encountered…"/>
          </Field>
          <Field label="Safety Notes" span>
            <Textarea value={form.safety_notes} onChange={e=>setForm(f=>({...f,safety_notes:e.target.value}))} rows={2} placeholder="Safety observations, incidents, toolbox talks…"/>
          </Field>
          <Field label="Materials Delivered" span>
            <Textarea value={form.materials_delivered} onChange={e=>setForm(f=>({...f,materials_delivered:e.target.value}))} rows={2} placeholder="List materials received on site…"/>
          </Field>
          <Field label="Visitors / Inspections" span>
            <Input value={form.visitors} onChange={e=>setForm(f=>({...f,visitors:e.target.value}))} placeholder="Inspector, owner rep, architect…"/>
          </Field>
          <Field label="General Notes" span>
            <Textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Any other notes…"/>
          </Field>
        </FormGrid>
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position:'relative', zIndex:10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <OwnerUpdateModal projectId={projectId} open={ownerUpdateOpen} onClose={()=>setOwnerUpdateOpen(false)} onToast={showToast} />
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
