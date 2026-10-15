'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import { useParams, useRouter } from 'next/navigation';
import SheetThumb from '@/components/drawings/SheetThumb';
import { getAuthHeaders } from '@/lib/supabase-browser';
import {
  Plus, Ruler, X, UploadSimple, SidebarSimple, Info, ArrowsOutSimple, Columns,
  CaretLeft, CaretRight, PencilSimple, Trash, Warning, ArrowClockwise, FileX, ArrowSquareOut,
} from '@phosphor-icons/react';
import { SHEET_DISCIPLINES } from '@/lib/construction-intelligence';
import {
  PageShell, Button, Badge, Tabs, Toolbar, Select, StatRow, DataTable, DetailList, EmptyState, Card, Menu, Toast,
  FormModal, FormGrid, Field, Input, Textarea, DateInput, Callout, ItemList, ItemRow,
  type BadgeTone, type Column,
} from '@/components/ui/kit';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { openPdf, PdfPane } from '@/components/PdfViewer';

const TEXT='var(--text-primary)';

// Canonical sheet-discipline taxonomy — the shared list every picker draws from.
const DISCIPLINES=SHEET_DISCIPLINES;
const STATUSES=['current','superseded','for_review','void'];
const STATUS_LABELS:Record<string,string>={
  current:'Current',
  superseded:'Superseded',
  for_review:'For Review',
  void:'Void',
};
/* Status → the six fixed status colors (lib/status-colors) via the kit Badge. */
const STATUS_TONE:Record<string,BadgeTone>={
  current:'ongoing',
  superseded:'closed',
  for_review:'under_contract',
  void:'overdue',
};

const DISCIPLINE_COLORS:Record<string,string>={
  General:'var(--text-tertiary)',
  Architectural:'var(--brand-primary-strong)',
  Sitework:'var(--success)',
  Demolition:'var(--danger)',
  'Fire Protection':'var(--danger)',
  'Low Voltage / Technology':'var(--warning)',
  Interiors:'#e879b9',
  Specialties:'var(--status-closed)',
  Structural:'var(--warning)',
  Mechanical:'var(--warning)',
  Electrical:'var(--brand-primary)',
  Plumbing:'var(--warning)',
  Civil:'var(--success)',
  Landscape:'var(--success)',
  Other:'var(--text-tertiary)',
};


const EMPTY_FORM={
  drawing_number:'',title:'',discipline:'Architectural',
  revision:0,revision_date:'',status:'current',url:'',notes:'',
};


/* revision_date is a timestamptz, so the API hands back "2026-10-02T00:00:00+00:00".
   Appending "T12:00:00" to that (the old code) built an unparseable string and
   every sheet rendered "Invalid Date". Read the calendar day off the front of
   whatever arrives, render it at local noon (so no timezone shifts it a day),
   and never print "Invalid Date" for a value we cannot read. */
function dayOf(s:string|null|undefined):string{
  const m=String(s??'').match(/^(\d{4}-\d{2}-\d{2})/);
  return m?m[1]:'';
}
function fmtDate(s:string|null|undefined){
  const day=dayOf(s);
  if(!day) return '—';
  const d=new Date(day+'T12:00:00');
  if(Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}
/** Today's calendar day in the user's timezone, yyyy-mm-dd (toISOString() is UTC — tomorrow, every evening in Arizona). */
function todayIso(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* The list API normalizes revision to `revision || version || ''`, so a
   rev 0 sheet arrives as ''. Read both columns and fall back to 0. */
function revOf(d:any):number{
  const v=d?.revision!==''&&d?.revision!=null?d.revision:d?.version;
  const n=Number(v);
  return Number.isFinite(n)?n:0;
}

const PHONE='(max-width: 640px)';

/* Layout CSS — injected via __html (tools/check-style-escapes.mjs). No
   backdrop-filter anywhere in the canvas area: the sheet repaints on every
   pan and page, and a blur behind it costs a frame each time. */
const DW_CSS=`
.sg-sec{margin:18px 0 6px}
.sg-h{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:14px;font-weight:700;color:var(--title-section,var(--brand-primary))}
.sg-h span:last-child{color:var(--text-tertiary);font-weight:500}
.sg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
.sg-card{display:grid;grid-template-rows:auto 1fr;border-radius:10px;border:1px solid var(--border-default);background:var(--bg-surface);overflow:hidden;text-decoration:none;color:var(--text-primary);transition:border-color .12s,transform .12s}
.sg-card:hover{border-color:var(--brand-primary);transform:translateY(-1px)}
.sg-card:focus-visible{outline:2px solid var(--brand-primary);outline-offset:2px}
.sg-card[data-old]{opacity:.6}
.st-thumb{position:relative;aspect-ratio:4/3;background:white;display:grid;place-items:center;overflow:hidden;border-bottom:1px solid var(--border-default)}
.st-thumb img{width:100%;height:100%;object-fit:contain;display:block}
.st-skel{position:absolute;inset:0;background:linear-gradient(90deg,var(--bg-surface-2),var(--bg-surface),var(--bg-surface-2));background-size:200% 100%;animation:stsk 1.2s linear infinite}
@keyframes stsk{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.st-skel{animation:none}}
.st-fail{position:absolute;inset:0;display:grid;place-items:center;background:var(--bg-surface-2);color:var(--text-tertiary);font-size:13px}
.sg-meta{display:grid;gap:2px;padding:10px 12px;font-size:13px;align-content:start}
.sg-meta b{font-size:15px}
.sg-title{color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sg-rev{color:var(--text-tertiary);font-size:12px}
.sg-skel{height:14px;width:60%;border-radius:4px;background:var(--bg-surface-2)}

.dw-page>.k-page{max-width:none}
.dw-drop{display:block;cursor:pointer;border:1.5px dashed var(--border-default);border-radius:12px;padding:16px 14px;text-align:center;background:var(--bg-surface-2);color:var(--text-primary)}
.dw-drop:hover,.dw-drop:focus-within{border-color:var(--brand-primary)}
.dw-drop[data-state="ready"]{border-color:var(--success)}
.dw-drop[data-state="failed"]{border-color:var(--danger)}
.dw-drop-name{font-size:13px;font-weight:800;margin-top:6px;overflow-wrap:anywhere}
.dw-drop-sub{font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.5}
.dw-root{--dw-h:calc(100vh - 56px - env(safe-area-inset-top,0px) - var(--sag-header-msg-h,0px) - var(--sag-nextstep-h,0px));width:100%;max-width:none;min-width:0;display:flex;flex-direction:column}
@supports (height:100dvh){.dw-root{--dw-h:calc(100dvh - 56px - env(safe-area-inset-top,0px) - var(--sag-header-msg-h,0px) - var(--sag-nextstep-h,0px))}}
.dw-root[data-view="sheet"]{height:var(--dw-h);min-height:520px}
.dw-err{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px var(--sp-6) 0;padding:10px 14px;border-radius:var(--radius-sm);background:rgba(248,113,113,0.10);border:1px solid rgba(248,113,113,0.40);color:#FFB3BB;font-size:13px}
.dw-work{flex:1;min-height:0;min-width:0;display:flex;margin:0;border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden;background:var(--bg-base)}
.dw-rail{width:280px;flex-shrink:0;display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--border-subtle);background:var(--bg-surface)}
.dw-rail-head{display:flex;align-items:center;gap:6px;padding:10px 10px 8px 12px;border-bottom:1px solid var(--border-subtle)}
.dw-rail-title{flex:1;min-width:0;font-size:13px;font-weight:700;color:var(--text-primary)}
.dw-rail-search{padding:8px 10px;border-bottom:1px solid var(--border-subtle)}
.dw-rail-search input{width:100%;box-sizing:border-box;height:36px;padding:0 10px;border-radius:var(--radius-sm);border:1px solid var(--border-default);background:var(--bg-surface-2);color:var(--text-primary);font-size:13px;outline:none}
.dw-rail-search input:focus-visible{border-color:var(--brand-primary)}
.dw-rail-list{flex:1;min-height:0;overflow-y:auto;padding:4px 0 8px}
.dw-group{display:flex;align-items:center;gap:8px;padding:10px 12px 4px;font-size:12px;font-weight:700;color:var(--text-tertiary)}
.dw-dot{width:8px;height:8px;border-radius:3px;flex-shrink:0}
.dw-item{all:unset;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;width:100%;min-height:44px;padding:7px 12px 7px 10px;border-left:2px solid transparent;cursor:pointer}
.dw-item:hover{background:rgba(255,255,255,0.04)}
.dw-item[aria-current="true"]{background:var(--brand-primary-08);border-left-color:var(--brand-primary)}
.dw-item:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
.dw-item-no{font-size:13px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dw-item-rev{font-size:12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}
.dw-item-title{font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dw-item-date{font-size:12px;color:var(--text-tertiary);white-space:nowrap;font-variant-numeric:tabular-nums}
.dw-item[data-old="true"] .dw-item-no,.dw-item[data-old="true"] .dw-item-title{color:var(--text-tertiary)}
.dw-rail-note{padding:16px 14px;font-size:13px;color:var(--text-tertiary);line-height:1.5}
.dw-skel{height:44px;margin:4px 12px;border-radius:6px;background:rgba(255,255,255,0.05)}
.dw-stage{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}
.dw-bar{display:flex;align-items:center;gap:6px;min-width:0;padding:6px 8px;border-bottom:1px solid var(--border-subtle);background:var(--bg-surface)}
.dw-bar-id{flex:1;min-width:0;display:flex;align-items:center;gap:8px;padding:0 4px}
.dw-bar-no{font-size:14px;font-weight:800;color:var(--text-primary);white-space:nowrap}
.dw-bar-title{font-size:13px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.dw-bar-rev{font-size:12px;font-weight:700;color:var(--text-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}
.dw-pages{display:flex;align-items:center;gap:2px;font-size:12px;color:var(--text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.dw-ibtn{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;flex-shrink:0;border-radius:var(--radius-sm);color:var(--text-secondary);cursor:pointer}
.dw-ibtn:hover{background:rgba(255,255,255,0.07);color:var(--text-primary)}
.dw-ibtn:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
.dw-ibtn[aria-pressed="true"]{color:var(--text-primary);background:rgba(255,255,255,0.08)}
.dw-ibtn:disabled{opacity:.4;cursor:not-allowed}
.dw-canvas{flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;background:var(--bg-base);overflow:hidden}
.dw-canvas-img{flex:1;min-height:0;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:24px}
.dw-canvas-img img{max-width:100%;height:auto;border-radius:3px;box-shadow:0 30px 80px -20px rgba(0,0,0,0.9),0 0 0 1px rgba(255,255,255,0.07)}
.dw-center{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center;color:var(--text-secondary);font-size:13px;line-height:1.55}
.dw-meta{width:340px;flex-shrink:0;min-height:0;overflow-y:auto;border-left:1px solid var(--border-subtle);background:var(--bg-surface)}
.dw-meta-sec{padding:12px 14px;border-bottom:1px solid var(--border-subtle)}
.dw-meta-sec:last-child{border-bottom:none}
.dw-meta-h{font-size:12px;font-weight:700;color:var(--text-tertiary);margin:0 0 6px}
.dw-hist{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:6px 8px;border-radius:var(--radius-sm);cursor:pointer;font-size:13px;color:var(--text-primary)}
.dw-hist:hover{background:rgba(255,255,255,0.05)}
.dw-hist[aria-current="true"]{background:rgba(255,255,255,0.08)}
.dw-hist:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
.dw-link{color:var(--text-primary);text-decoration:underline;text-underline-offset:2px}
.dw-scrim{display:none}
.dw-reg{display:flex;flex-direction:column;gap:var(--sp-4);padding:0;min-width:0}
.dw-seg{display:inline-flex;border:1px solid var(--border-default);border-radius:var(--radius-sm);overflow:hidden}
.dw-seg button{all:unset;box-sizing:border-box;height:36px;padding:0 12px;font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer;white-space:nowrap}
.dw-seg button[aria-pressed="true"]{background:rgba(255,255,255,0.10);color:var(--text-primary)}
.dw-seg button:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
@media ${PHONE}{
  .dw-err{margin:10px 16px 0}
  .dw-work{margin:0;border-radius:0;border-left:none;border-right:none;border-bottom:none}
  .dw-rail,.dw-meta{position:fixed;top:0;bottom:0;z-index:560;width:min(88vw,360px);background:var(--bg-elevated);box-shadow:var(--shadow-lg);padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
  .dw-rail{left:0}
  .dw-meta{right:0;border-left:1px solid var(--border-default)}
  .dw-scrim{display:block;position:fixed;inset:0;z-index:555;background:rgba(0,0,0,0.6)}
  .dw-ibtn{width:44px;height:44px}
  .dw-item{min-height:52px}
  .dw-hist{min-height:44px}
  .dw-hide-sm{display:none}
  .dw-root .k-btn,.dw-seg button{height:44px}
  .dw-rail-search input{height:44px;font-size:16px}
}
`;

export default function DrawingsPage(){
  const {projectId}=useParams() as {projectId:string};
  const [drawings,setDrawings]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [selected,setSelected]=useState<any>(null);
  const [mode,setMode]=useState<'view'|'edit'|'create'|null>(null);
  const [form,setForm]=useState<Record<string,any>>({...EMPTY_FORM});

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(mode==='create'||mode==='edit', form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `drawings:${projectId}`,
    draftData: mode==='create'?form:undefined,
    restoreDraft: (d) => { setForm(d as Record<string,any>); setMode('create'); setSelected(null); },
    onSave: () => save(),
  });
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [toast,setToast]=useState<{msg:string;type:'success'|'error'}|null>(null);
  const [search,setSearch]=useState('');
  const [filterDiscipline,setFilterDiscipline]=useState('all');
  const [filterStatus,setFilterStatus]=useState('all');
  const [groupByDiscipline,setGroupByDiscipline]=useState(true);
  const [drawingSet,setDrawingSet]=useState<'current'|'all'>('current');
  const [uploadFile,setUploadFile]=useState<File|null>(null);
  const [autoFields,setAutoFields]=useState<{num?:boolean;title?:boolean;date?:boolean}>({});
  /* Save/upload failure, kept on screen in the drawer (the toast is gone in
     4s; a failed upload must stay visible until the user acts on it). */
  const [saveError,setSaveError]=useState('');
  /* Set when the drawer is filing a NEW REVISION of an existing sheet. */
  const [replacing,setReplacing]=useState<any>(null);

  /* ── Canvas layout state ── */
  const router=useRouter();
  const [view,setView]=useState<'sheet'|'register'|'grid'>('grid');
  const [activeId,setActiveId]=useState<string|null>(null);
  const [railOpen,setRailOpen]=useState(true);
  const [metaOpen,setMetaOpen]=useState(true);
  const [isPhone,setIsPhone]=useState(false);
  const [page,setPage]=useState(1);
  const [pageCount,setPageCount]=useState(1);
  const [imgError,setImgError]=useState(false);

  // Project intelligence — one snapshot; the register walks in knowing the job.
  const { ctx } = useProjectContext(projectId);

  const showToast=(msg:string,type:'success'|'error'='success')=>{
    setToast({msg,type}); setTimeout(()=>setToast(null),4000);
  };

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch(`/api/drawings/list?projectId=${projectId}`,{headers:h});
      if (!r.ok) throw new Error('Failed to load data');
      const d=await r.json();
      setDrawings(d.drawings||[]);
    }catch{setDrawings([]);setLoadError('Failed to load. Please try again.');}
    finally{setLoading(false);}
  },[projectId]);

  useEffect(()=>{load();},[load]);

  /* Phone: the rail and the metadata panel become drawers, closed by default,
     so the sheet gets the full width. Wide desktop opens both. */
  useEffect(()=>{
    if(typeof window==='undefined'||!window.matchMedia) return;
    const mq=window.matchMedia(PHONE);
    const apply=()=>{
      setIsPhone(mq.matches);
      if(mq.matches){setRailOpen(false);setMetaOpen(false);}
      else{setRailOpen(true);setMetaOpen(window.innerWidth>=1280);}
    };
    apply();
    mq.addEventListener?.('change',apply);
    return()=>mq.removeEventListener?.('change',apply);
  },[]);

  // Escape closes a phone drawer.
  useEffect(()=>{
    if(!isPhone||(!railOpen&&!metaOpen)) return;
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'&&mode===null){setRailOpen(false);setMetaOpen(false);}};
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[isPhone,railOpen,metaOpen,mode]);

  function openCreate(){
    setForm({...EMPTY_FORM,revision_date:todayIso()});
    setAutoFields({date:true});
    setUploadFile(null);
    setSaveError('');setReplacing(null);
    setMode('create');setSelected(null);
  }
  /* New revision of an existing sheet: same create/upload path, with the
     sheet's number, title and discipline carried over and the rev bumped. */
  function openNewRevision(drawing:any){
    setForm({
      ...EMPTY_FORM,
      drawing_number:sheetNo(drawing),
      title:drawing.title||drawing.name||'',
      discipline:drawing.discipline||'Architectural',
      revision:revOf(drawing)+1,
      revision_date:todayIso(),
    });
    setAutoFields({date:true});
    setUploadFile(null);
    setSaveError('');setReplacing(drawing);
    setMode('create');setSelected(null);
  }
  // Mirror the server's sheet-number derivation (drawings/upload) so the form
  // shows exactly what will be saved: "A-101 Floor Plan.pdf" -> "A-101".
  function pickFile(f:File|null){
    setUploadFile(f);
    setSaveError('');
    if(!f) return;
    const base=f.name.replace(/\.[^.]+$/,'');
    const m=base.match(/^([A-Za-z]{1,3}[-\s]?\d{2,4})/);
    setForm(prev=>({
      ...prev,
      drawing_number:prev.drawing_number||(m?m[1].toUpperCase().replace(/\s/,'-'):''),
      title:prev.title||base.replace(/^([A-Za-z]{1,3}[-\s]?\d{2,4})[-\s]*/,'').trim()||base,
    }));
    setAutoFields(a=>({...a,num:!!m,title:true}));
  }
  function openEdit(drawing:any){
    setForm({
      drawing_number:drawing.drawing_number||drawing.sheet_number||'',
      title:drawing.title||drawing.name||'',
      discipline:drawing.discipline||'Architectural',
      revision:drawing.revision??0,
      revision_date:dayOf(drawing.revision_date),
      status:drawing.status||'current',
      url:drawing.url||'',
      notes:drawing.notes||'',
    });
    setSaveError('');setReplacing(null);
    setSelected(drawing);setMode('edit');
  }
  /* Opening a sheet puts it on the canvas (it used to open a side drawer). */
  /* Opening a sheet goes to the drawing workspace (markups, measure, pins). */
  function viewDrawing(drawing:any){
    router.push(`/app/projects/${projectId}/drawings/${drawing.id}`);
  }
  function viewOnLegacyCanvas(drawing:any){
    setActiveId(drawing.id);
    setPage(1);setPageCount(1);setImgError(false);
    setView('sheet');
    if(isPhone) setRailOpen(false);
  }
  function closePanel(){setSelected(null);setMode(null);setReplacing(null);setSaveError('');}

  async function save(): Promise<boolean> {
    if(!form.drawing_number.trim()||!form.title.trim()){
      showToast('Drawing number and title are required.','error');return false;
    }
    setSaving(true);
    setSaveError('');
    try{
      const h=await getAuthHeaders();
      const payload={
        ...form,
        revision:Number(form.revision)||0,
        revision_date:form.revision_date||null,
      };
      if(mode==='create'&&uploadFile){
        // Upload path — the PDF lands in project storage and the sheet row is
        // created in one shot; non-default status/revision date follow via PUT.
        const fd=new FormData();
        fd.append('file',uploadFile);
        fd.append('projectId',projectId);
        fd.append('sheet_number',form.drawing_number);
        fd.append('title',form.title);
        fd.append('discipline',form.discipline);
        if(form.notes) fd.append('notes',form.notes);
        if(form.revision_date) fd.append('revision_date',form.revision_date);
        if(Number(form.revision)) fd.append('version',String(Number(form.revision)));
        const r=await fetch('/api/drawings/upload',{method:'POST',headers:h,body:fd});
        const d=await r.json();
        if(!r.ok||d.error) throw new Error(d.error||'Upload failed');
        // The upload route takes the revision date itself; only a non-default
        // status still needs the follow-up PUT.
        if(d.drawing?.id&&form.status&&form.status!=='current'){
          const st=await fetch(`/api/drawings/${d.drawing.id}`,{
            method:'PUT',
            headers:{...h,'Content-Type':'application/json'},
            body:JSON.stringify({status:form.status}),
          }).catch((e:unknown)=>{console.error('[drawings] status follow-up failed',e);return null;});
          if(!st||!st.ok) showToast('Sheet uploaded, but its status did not save — edit it to set the status.','error');
        }
        setUploadFile(null);
        showToast('Sheet uploaded and filed.');
      }else if(mode==='create'){
        const r=await fetch('/api/drawings/create',{
          method:'POST',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify({...payload,projectId}),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Drawing added.');
      }else if(mode==='edit'&&selected){
        const r=await fetch(`/api/drawings/${selected.id}`,{
          method:'PUT',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify(payload),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Drawing updated.');
      }
      await load();closePanel();
      guard.clearDraft();
      return true;
    }catch(e:any){
      console.error(e);
      const msg=humanError(e,'Save failed. Please try again.');
      setSaveError(msg);
      showToast(msg,'error');
    }
    finally{setSaving(false);}
    return false;
  }

  async function deleteDrawing(drawing:any){
    if(!(await confirmDialog({ title: 'Delete Drawing', message: `Delete drawing "${drawing.drawing_number||drawing.sheet_number||''} - ${drawing.title}"?`, confirmLabel: 'Delete', danger: true }))) return;
    setDeleting(true);
    try{
      const h=await getAuthHeaders();
      const dr=await fetch(`/api/drawings/${drawing.id}`,{method:'DELETE',headers:h});
      if (!dr.ok) throw new Error('Delete failed');
      showToast('Drawing deleted.');closePanel();await load();
    }catch{showToast('Delete failed. Please try again.','error');}
    finally{setDeleting(false);}
  }

  const total=drawings.length;
  const current=drawings.filter(d=>d.status==='current').length;
  const superseded=drawings.filter(d=>d.status==='superseded').length;
  const forReview=drawings.filter(d=>d.status==='for_review').length;
  const disciplineCount=new Set(drawings.map(d=>d.discipline).filter(Boolean)).size;

  // API rows carry sheet_number (canonical column); legacy rows may carry
  // drawing_number. Read both everywhere so no sheet ever renders as a dash.
  function sheetNo(d:any):string{return d?.drawing_number||d?.sheet_number||'';}
  // Natural sheet-number sort: A-2 files before A-10, S1.01 before S1.2.
  const bySheet=(a:any,b:any)=>sheetNo(a).localeCompare(sheetNo(b),undefined,{numeric:true,sensitivity:'base'});

  const filtered=drawings.filter(d=>{
    const ms=!search
      ||sheetNo(d).toLowerCase().includes(search.toLowerCase())
      ||(d.title||'').toLowerCase().includes(search.toLowerCase());
    const md=filterDiscipline==='all'||d.discipline===filterDiscipline;
    const mst=filterStatus==='all'||d.status===filterStatus;
    const mset=drawingSet==='all'||filterStatus==='superseded'||filterStatus==='void'||!(d.status==='superseded'||d.status==='void');
    return ms&&md&&mst&&mset;
  });

  filtered.sort(bySheet);

  // Group by discipline — rendered in canonical taxonomy order, extras last
  const grouped:Record<string,any[]>={};
  if(groupByDiscipline){
    for(const d of filtered){
      const disc=d.discipline||'Other';
      if(!grouped[disc]) grouped[disc]=[];
      grouped[disc].push(d);
    }
  }

  const groupOrder=[...DISCIPLINES.filter(d=>grouped[d]),...Object.keys(grouped).filter(d=>!DISCIPLINES.includes(d)).sort()];
  const counts=ctx?.counts;
  const filtersOn=!!search||filterDiscipline!=='all'||filterStatus!=='all';
  function clearFilters(){setSearch('');setFilterDiscipline('all');setFilterStatus('all');}

  /* The sheet on the canvas: the one the user opened, else the first sheet
     in the current list. Looked up in the whole register so a superseded
     revision opened from history still shows even when the set hides it. */
  const active=(activeId?drawings.find(d=>d.id===activeId):null)??filtered[0]??null;
  const activeUrl:string=active?(active.url||active.file_url||''):'';
  const activeIsPdf=!!active&&(active.file_type==='application/pdf'||/\.pdf(\?|$)/i.test(activeUrl));
  const activeLabel=active?`${sheetNo(active)} ${active.title||''}`.trim()||'Drawing':'';
  /* Every revision filed under this sheet number, newest first. */
  const history=active?drawings
    .filter(d=>sheetNo(d).toLowerCase()===sheetNo(active).toLowerCase())
    .sort((a,b)=>revOf(b)-revOf(a)||dayOf(b.revision_date).localeCompare(dayOf(a.revision_date))):[];
  /* The revision just before the one on screen, for a side-by-side compare. */
  const priorRev=active?history.find(d=>d.id!==active.id&&revOf(d)<revOf(active)&&(d.url||d.file_url)):null;

  // A new sheet resets paging and the image fallback.
  const activeKey=active?.id??'';
  useEffect(()=>{setPage(1);setPageCount(1);setImgError(false);},[activeKey]);

  const onPages=useCallback((n:number)=>setPageCount(n),[]);

  function openReader(){
    if(!active||!activeUrl) return;
    openPdf({url:activeUrl,title:activeLabel});
  }
  function openCompare(other:any){
    if(!active||!activeUrl) return;
    const otherUrl=other.url||other.file_url;
    if(!otherUrl) return;
    openPdf({
      url:activeUrl,title:`${activeLabel} — R${revOf(active)}`,
      compareUrl:otherUrl,compareTitle:`${sheetNo(other)} R${revOf(other)}`,
    });
  }

  /* ── Register (list) view ── */
  const columns:Column<any>[]=[
    {key:'sheet',header:'Sheet',primary:true,accessor:d=>sheetNo(d),render:d=>sheetNo(d)||'—'},
    {key:'title',header:'Title',accessor:d=>d.title||'',render:d=>(
      <span style={{color:(d.status==='superseded'||d.status==='void')?'var(--text-tertiary)':TEXT}}>{d.title||'—'}</span>
    )},
    {key:'discipline',header:'Discipline',accessor:d=>d.discipline||'Other',render:d=>(
      <span style={{display:'inline-flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
        <span className="dw-dot" style={{background:DISCIPLINE_COLORS[d.discipline]||'var(--text-tertiary)'}}/>{d.discipline||'Other'}
      </span>
    )},
    {key:'rev',header:'Rev',align:'right',accessor:d=>revOf(d),render:d=><span style={{fontVariantNumeric:'tabular-nums'}}>R{revOf(d)}</span>},
    {key:'date',header:'Rev Date',accessor:d=>dayOf(d.revision_date),render:d=><span style={{whiteSpace:'nowrap'}}>{fmtDate(d.revision_date)}</span>},
    {key:'status',header:'Status',accessor:d=>d.status,render:d=><Badge tone={STATUS_TONE[d.status]||'neutral'}>{STATUS_LABELS[d.status]||d.status||'—'}</Badge>},
    {key:'file',header:'File',sortable:false,render:d=>(d.url?(
      <a href={d.url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="dw-link" style={{whiteSpace:'nowrap',fontSize:13}}>
        View PDF
      </a>
    ):<span style={{fontSize:12,color:'var(--text-tertiary)'}}>No File</span>)},
  ];
  const rowActions=(d:any)=>[
    {label:'Pins & Revisions',href:`/app/projects/${projectId}/drawings/${d.id}`},
    {label:'Open on Canvas',onClick:()=>viewDrawing(d)},
    {label:'Edit',onClick:()=>openEdit(d)},
    {label:'Upload New Revision',onClick:()=>openNewRevision(d)},
    {label:'Delete',tone:'danger' as const,onClick:()=>deleteDrawing(d),disabled:deleting},
  ];
  const registerEmpty=loadError?(
    <EmptyState icon={<Warning size={22}/>} title="Couldn’t Load the Register" text="The drawings didn’t load, so nothing is shown. This is not an empty register."
      action={<Button icon={<ArrowClockwise size={14}/>} onClick={load}>Retry</Button>}/>
  ):drawings.length===0?(
    <EmptyState icon={<Ruler size={22}/>} title="Start the Drawing Register"
      text={`Upload the issued-for-construction set — each sheet files itself under its discipline, sorted by sheet number, and superseded revisions stay on record so every RFI points at the sheet it was answered against.${(ctx?.subs||[]).length>0?` Your ${ctx.subs.length} sub${ctx.subs.length===1?'':'s'} ${ctx.subs.length===1?'builds':'build'} from whatever is marked current.`:''}`}
      action={<Button icon={<UploadSimple size={14}/>} onClick={openCreate}>Upload First Sheet</Button>}/>
  ):(
    <EmptyState title="No Drawings Match Your Filters"
      text={drawingSet==='current'&&superseded>0
        ?'Nothing in the current set matches — switch to All Revisions to search superseded sheets, or adjust your filters.'
        :'Try adjusting your search or filters.'}
      action={filtersOn?<Button onClick={clearFilters}>Clear Filters</Button>:undefined}/>
  );

  const setToggle=(
    <div className="dw-seg" role="group" aria-label="Drawing set">
      <button type="button" aria-pressed={drawingSet==='current'} onClick={()=>setDrawingSet('current')}>Current Set ({current})</button>
      <button type="button" aria-pressed={drawingSet==='all'} onClick={()=>setDrawingSet('all')}>All Revisions ({total})</button>
    </div>
  );

  /* ── Rail (compact sheet / revision list) ── */
  function RailItem({drawing}:{drawing:any}){
    const isActive=active?.id===drawing.id;
    return(
      <button type="button" className="dw-item" aria-current={isActive?'true':undefined}
        data-old={(drawing.status==='superseded'||drawing.status==='void')?'true':undefined}
        onClick={()=>viewDrawing(drawing)}
        title={`${sheetNo(drawing)} ${drawing.title||''}`.trim()}>
        <span className="dw-item-no">{sheetNo(drawing)||'—'}</span>
        <span className="dw-item-rev">R{revOf(drawing)}</span>
        <span className="dw-item-title">{drawing.title||'Untitled'}</span>
        <span className="dw-item-date">{fmtDate(drawing.revision_date)}</span>
      </button>
    );
  }

  const rail=(
    <aside className="dw-rail" aria-label="Sheets">
      <div className="dw-rail-head">
        <div className="dw-rail-title">
          Sheets{!loading&&!loadError&&<span style={{color:'var(--text-tertiary)',fontWeight:600}}> · {filtered.length}{filtered.length!==total?` of ${total}`:''}</span>}
        </div>
        <button type="button" className="dw-ibtn" aria-label="Collapse sheet list" title="Collapse Sheet List" onClick={()=>setRailOpen(false)}>
          {isPhone?<X size={18}/>:<CaretLeft size={16}/>}
        </button>
      </div>
      <div className="dw-rail-search">
        <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search sheet # or title…" aria-label="Search sheets"/>
        <div style={{display:'flex',gap:6,marginTop:8}}>
          <div className="dw-seg" role="group" aria-label="Drawing set" style={{flex:1}}>
            <button type="button" style={{flex:1,textAlign:'center'}} aria-pressed={drawingSet==='current'} onClick={()=>setDrawingSet('current')}>Current</button>
            <button type="button" style={{flex:1,textAlign:'center'}} aria-pressed={drawingSet==='all'} onClick={()=>setDrawingSet('all')}>All Revs</button>
          </div>
        </div>
      </div>
      <div className="dw-rail-list">
        {loading?(
          <div aria-busy="true" aria-label="Loading sheets">{[0,1,2,3,4,5].map(i=><div key={i} className="dw-skel"/>)}</div>
        ):loadError?(
          <div className="dw-rail-note">The sheet list didn’t load.</div>
        ):drawings.length===0?(
          <div className="dw-rail-note">No sheets yet. Upload the first sheet to start the register.</div>
        ):filtered.length===0?(
          <div className="dw-rail-note">
            {drawingSet==='current'&&superseded>0?'Nothing in the current set matches — try All Revs.':'No sheets match.'}
            {filtersOn&&<div style={{marginTop:10}}><Button size="sm" onClick={clearFilters}>Clear Filters</Button></div>}
          </div>
        ):groupByDiscipline?(
          groupOrder.map(disc=>(
            <div key={disc}>
              <div className="dw-group"><span className="dw-dot" style={{background:DISCIPLINE_COLORS[disc]||'var(--text-tertiary)'}}/>{disc}<span style={{fontWeight:600}}>{grouped[disc].length}</span></div>
              {grouped[disc].map(d=><RailItem key={d.id} drawing={d}/>)}
            </div>
          ))
        ):(
          filtered.map(d=><RailItem key={d.id} drawing={d}/>)
        )}
      </div>
    </aside>
  );

  /* ── Metadata panel ── */
  const meta=active&&(
    <aside className="dw-meta" aria-label="Sheet details">
      <div className="dw-meta-sec" style={{display:'flex',alignItems:'flex-start',gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--text-secondary)'}}>{sheetNo(active)||'—'} · R{revOf(active)}</div>
          <div style={{fontSize:15,fontWeight:800,color:TEXT,marginTop:2,overflowWrap:'anywhere'}}>{active.title||'Untitled'}</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>
            <Badge tone={STATUS_TONE[active.status]||'neutral'}>{STATUS_LABELS[active.status]||active.status||'—'}</Badge>
          </div>
        </div>
        <button type="button" className="dw-ibtn" aria-label="Collapse details" title="Collapse Details" onClick={()=>setMetaOpen(false)}>
          {isPhone?<X size={18}/>:<CaretRight size={16}/>}
        </button>
      </div>
      <div className="dw-meta-sec" style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        <Button size="sm" icon={<PencilSimple size={14}/>} onClick={()=>openEdit(active)}>Edit</Button>
        <Button size="sm" icon={<UploadSimple size={14}/>} onClick={()=>openNewRevision(active)}>New Revision</Button>
        <Menu label="More sheet actions" actions={[
          {label:'Delete Drawing',icon:<Trash size={14}/>,tone:'danger',onClick:()=>deleteDrawing(active),disabled:deleting},
        ]}/>
      </div>
      <div className="dw-meta-sec">
        <div className="dw-meta-h">Details</div>
        <DetailList items={[
          ['Discipline',active.discipline?(
            <span style={{display:'inline-flex',alignItems:'center',gap:6}}><span className="dw-dot" style={{background:DISCIPLINE_COLORS[active.discipline]||'var(--text-tertiary)'}}/>{active.discipline}</span>
          ):null],
          ['Revision',`R${revOf(active)}`],
          ['Revision Date',fmtDate(active.revision_date)==='—'?null:fmtDate(active.revision_date)],
          ['Status',STATUS_LABELS[active.status]||active.status],
          ['Added',fmtDate(active.created_at)==='—'?null:fmtDate(active.created_at)],
          ['File',activeUrl?(activeIsPdf?'PDF':'Linked File'):'None Attached'],
        ]}/>
      </div>
      <div className="dw-meta-sec">
        <div className="dw-meta-h">Revision History</div>
        {history.length<=1?(
          <div style={{fontSize:13,color:'var(--text-tertiary)',lineHeight:1.5}}>Only this revision is on record.</div>
        ):history.map(h=>(
          <div key={h.id} style={{display:'flex',alignItems:'center',gap:4}}>
            <button type="button" className="dw-hist" aria-current={h.id===active.id?'true':undefined} onClick={()=>viewDrawing(h)}>
              <span style={{fontWeight:700,fontVariantNumeric:'tabular-nums',minWidth:30}}>R{revOf(h)}</span>
              <span style={{flex:1,minWidth:0,color:'var(--text-secondary)',fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{fmtDate(h.revision_date)}</span>
              <Badge tone={STATUS_TONE[h.status]||'neutral'}>{STATUS_LABELS[h.status]||h.status||'—'}</Badge>
            </button>
            {h.id!==active.id&&activeUrl&&(h.url||h.file_url)&&(
              <button type="button" className="dw-ibtn" aria-label={`Compare with R${revOf(h)}`} title={`Compare with R${revOf(h)}`} onClick={()=>openCompare(h)}>
                <Columns size={16}/>
              </button>
            )}
          </div>
        ))}
      </div>
      {active.notes&&(
        <div className="dw-meta-sec">
          <div className="dw-meta-h">Notes</div>
          <div style={{fontSize:13,color:TEXT,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{active.notes}</div>
        </div>
      )}
      {ctx&&(
        <div className="dw-meta-sec">
          <div className="dw-meta-h">On This Project</div>
          <ItemList>
            <ItemRow title="Current set" value={`${current} sheet${current===1?'':'s'}`}/>
            <ItemRow title={`${active.discipline||'Other'} sheets current`} value={String(drawings.filter(d=>(d.discipline||'Other')===(active.discipline||'Other')&&d.status==='current').length)}/>
            <ItemRow title="Open RFIs" value={String(Number(counts?.openRfis)||0)}/>
            <ItemRow title="Open submittals" value={String(Number(counts?.openSubmittals)||0)}/>
          </ItemList>
          <div style={{display:'flex',gap:14,flexWrap:'wrap',marginTop:8,fontSize:13}}>
            <a className="dw-link" href={`/app/projects/${projectId}/rfis`}>Open RFIs →</a>
            <a className="dw-link" href={`/app/projects/${projectId}/submittals`}>Open Submittals →</a>
          </div>
        </div>
      )}
    </aside>
  );

  /* ── Canvas body ── */
  let canvasBody:React.ReactNode;
  if(loading){
    canvasBody=<div className="dw-center" aria-busy="true">Loading drawings…</div>;
  }else if(loadError){
    canvasBody=(
      <div className="dw-center">
        <Warning size={28} color="var(--danger)"/>
        <div style={{fontSize:15,fontWeight:700,color:TEXT}}>Couldn’t Load the Drawings</div>
        <div>Nothing is shown because the register didn’t load — this is not an empty set.</div>
        <Button icon={<ArrowClockwise size={14}/>} onClick={load}>Retry</Button>
      </div>
    );
  }else if(drawings.length===0){
    canvasBody=(
      <div className="dw-center">
        <EmptyState icon={<Ruler size={22}/>} title="Start the Drawing Register"
          text="Upload the issued-for-construction set. Each sheet files itself under its discipline and opens here on the canvas."
          action={<Button icon={<UploadSimple size={14}/>} onClick={openCreate}>Upload First Sheet</Button>}/>
      </div>
    );
  }else if(!active){
    canvasBody=(
      <div className="dw-center">
        <div style={{fontSize:15,fontWeight:700,color:TEXT}}>No Sheet Matches</div>
        <div>Adjust the search or filters to pick a sheet.</div>
        {filtersOn&&<Button onClick={clearFilters}>Clear Filters</Button>}
      </div>
    );
  }else if(!activeUrl){
    canvasBody=(
      <div className="dw-center">
        <FileX size={28} color="var(--text-tertiary)"/>
        <div style={{fontSize:15,fontWeight:700,color:TEXT}}>No File on This Sheet</div>
        <div>This register entry has no PDF or link attached yet.</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center'}}>
          <Button icon={<UploadSimple size={14}/>} onClick={()=>openNewRevision(active)}>Upload a Revision</Button>
          <Button variant="ghost" icon={<PencilSimple size={14}/>} onClick={()=>openEdit(active)}>Link a URL</Button>
        </div>
      </div>
    );
  }else if(activeIsPdf){
    /* The reader's own page renderer (components/PdfViewer). Keyed on the
       panel layout so a rail/details toggle re-fits the sheet to its width. */
    canvasBody=(
      <PdfPane key={`${active.id}:${railOpen?1:0}${metaOpen?1:0}`} url={activeUrl} zoom={1} page={page} onPages={onPages} fit/>
    );
  }else if(imgError){
    canvasBody=(
      <div className="dw-center">
        <Warning size={28} color="var(--danger)"/>
        <div style={{fontSize:15,fontWeight:700,color:TEXT}}>This File Couldn’t Be Displayed</div>
        <div>It may not be an image or PDF, or the link may have expired.</div>
        <a className="dw-link" href={activeUrl} target="_blank" rel="noopener noreferrer">Try Opening It Directly</a>
      </div>
    );
  }else{
    canvasBody=(
      <div className="dw-canvas-img">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={activeUrl} alt={activeLabel} onError={()=>setImgError(true)}/>
      </div>
    );
  }

  return(
    <>
      <style dangerouslySetInnerHTML={{__html:DW_CSS}}/>

      <Toast message={toast?.msg??null} tone={toast?.type==='error'?'bad':'good'}/>

      <div className="dw-page">
      <PageShell
        crumbs={[
          {label:'Projects',href:'/app/projects'},
          {label:ctx?.project?.name||'Project',href:`/app/projects/${projectId}/overview`},
          {label:'Drawings'},
        ]}
        title="Drawings"
        subtitle={!loading&&!loadError&&total>0?`${current} current sheet${current===1?'':'s'} across ${disciplineCount} discipline${disciplineCount===1?'':'s'}`:'The sheet set, by discipline and revision.'}
        actions={<Button variant="primary" icon={<Plus size={15} weight="bold"/>} onClick={openCreate}>Add drawing</Button>}
      >
        {!loading&&!loadError&&total>0&&(
          <StatRow items={[
            {label:'Current set',value:current,sub:superseded>0?`${superseded} superseded on record`:'No superseded sheets',tone:'good',icon:<Ruler size={15}/>,onClick:()=>{setFilterStatus('current');setDrawingSet('current');},active:filterStatus==='current'},
            {label:'For review',value:forReview,sub:'Awaiting review',tone:forReview>0?'warn':'default',icon:<Warning size={15}/>,onClick:()=>{setFilterStatus('for_review');},active:filterStatus==='for_review'},
            {label:'Superseded',value:superseded,sub:'Kept on record',icon:<ArrowClockwise size={15}/>,onClick:()=>{setFilterStatus('superseded');setDrawingSet('all');},active:filterStatus==='superseded'},
            {label:'Disciplines',value:disciplineCount,sub:`${total} sheet${total===1?'':'s'} in register`,icon:<Columns size={15}/>,onClick:()=>{clearFilters();setDrawingSet('all');},active:!filtersOn&&drawingSet==='all'},
          ]}/>
        )}
        <Tabs value={view} onChange={k=>setView(k as 'grid'|'register')} tabs={[
          {key:'grid',label:'Sheets',count:loading||loadError?undefined:filtered.length},
          {key:'register',label:'Register',count:loading||loadError?undefined:total},
        ]}/>

      <div className="dw-root" data-view={view}>
        {view==='grid'?(
          <div className="dw-reg">
            <Toolbar search={search} onSearch={setSearch} placeholder="Find a sheet by number or title…"
              filters={<>
                <Select aria-label="Discipline" value={filterDiscipline==='all'?'':filterDiscipline} onChange={e=>setFilterDiscipline(e.target.value||'all')} placeholder="All Disciplines" options={[...DISCIPLINES]} style={{ width: 'auto', minWidth: 170 }}/>
                <Select aria-label="Status" value={filterStatus==='all'?'':filterStatus} onChange={e=>setFilterStatus(e.target.value||'all')} placeholder="All Statuses" options={STATUSES.map(s=>({value:s,label:STATUS_LABELS[s]}))} style={{ width: 'auto', minWidth: 170 }}/>
                {setToggle}
              </>}
            />
            {loading?(
              <div className="sg-grid">{Array.from({length:8}).map((_,i)=><div key={i} className="sg-card" aria-hidden><div className="st-thumb"><span className="st-skel"/></div><div className="sg-meta"><span className="sg-skel"/></div></div>)}</div>
            ):filtered.length===0?registerEmpty:(
              groupOrder.map(disc=>(
                <section key={disc} className="sg-sec" aria-label={disc}>
                  <h2 className="sg-h"><span className="dw-dot" style={{background:DISCIPLINE_COLORS[disc]||'var(--text-tertiary)'}}/>{disc}<span>{grouped[disc].length}</span></h2>
                  <div className="sg-grid">
                    {grouped[disc].map((d:any)=>{
                      const url=d.url||d.file_url||'';
                      return (
                        <a key={d.id} className="sg-card" href={`/app/projects/${projectId}/drawings/${d.id}`} data-old={(d.status==='superseded'||d.status==='void')||undefined}
                          onClick={e=>{if(e.metaKey||e.ctrlKey)return;e.preventDefault();viewDrawing(d);}}>
                          {url?<SheetThumb url={url} isPdf={/\.pdf(\?|$)/i.test(url)} alt={`${sheetNo(d)} ${d.title||''}`}/>:<div className="st-thumb"><span className="st-fail">No file</span></div>}
                          <div className="sg-meta">
                            <b>{sheetNo(d)||'—'}</b>
                            <span className="sg-title">{d.title||''}</span>
                            <span className="sg-rev">R{revOf(d)} · {fmtDate(d.revision_date)}</span>
                            {d.status!=='current'&&<Badge tone={STATUS_TONE[d.status]||'neutral'}>{STATUS_LABELS[d.status]||d.status}</Badge>}
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        ):view==='sheet'?(
          <div className="dw-work">
            {railOpen&&rail}
            {isPhone&&(railOpen||(metaOpen&&!!active))&&(
              <div className="dw-scrim" onClick={()=>{setRailOpen(false);setMetaOpen(false);}} aria-hidden/>
            )}
            <section className="dw-stage" aria-label="Sheet">
              <div className="dw-bar">
                {!railOpen&&(
                  <button type="button" className="dw-ibtn" aria-label="Show sheet list" title="Show Sheet List" onClick={()=>setRailOpen(true)}>
                    <SidebarSimple size={18}/>
                  </button>
                )}
                <div className="dw-bar-id">
                  {active?(
                    <>
                      <span className="dw-bar-no">{sheetNo(active)||'—'}</span>
                      <span className="dw-bar-rev">R{revOf(active)}</span>
                      <span className="dw-bar-title">{active.title||''}</span>
                      <span className="dw-hide-sm"><Badge tone={STATUS_TONE[active.status]||'neutral'}>{STATUS_LABELS[active.status]||active.status||'—'}</Badge></span>
                    </>
                  ):(
                    <span className="dw-bar-title">{loading?'Loading…':'No sheet selected'}</span>
                  )}
                </div>
                {active&&activeIsPdf&&pageCount>1&&(
                  <div className="dw-pages">
                    <button type="button" className="dw-ibtn" aria-label="Previous page" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}><CaretLeft size={16}/></button>
                    <span>{page} / {pageCount}</span>
                    <button type="button" className="dw-ibtn" aria-label="Next page" disabled={page>=pageCount} onClick={()=>setPage(p=>Math.min(pageCount,p+1))}><CaretRight size={16}/></button>
                  </div>
                )}
                {active&&activeUrl&&priorRev&&(
                  <button type="button" className="dw-ibtn" aria-label={`Compare with R${revOf(priorRev)}`} title={`Compare with R${revOf(priorRev)}`} onClick={()=>openCompare(priorRev)}>
                    <Columns size={18}/>
                  </button>
                )}
                {active&&activeUrl&&activeIsPdf&&(
                  <button type="button" className="dw-ibtn" aria-label="Open in reader (zoom, full screen)" title="Open in Reader" onClick={openReader}>
                    <ArrowsOutSimple size={18}/>
                  </button>
                )}
                {active&&activeUrl&&!activeIsPdf&&(
                  <a className="dw-ibtn" href={activeUrl} target="_blank" rel="noopener noreferrer" aria-label="Open file in a new tab" title="Open File">
                    <ArrowSquareOut size={18}/>
                  </a>
                )}
                {active&&(
                  <button type="button" className="dw-ibtn" aria-pressed={metaOpen} aria-label={metaOpen?'Hide details':'Show details'} title={metaOpen?'Hide Details':'Show Details'} onClick={()=>setMetaOpen(o=>!o)}>
                    <Info size={18}/>
                  </button>
                )}
              </div>
              <div className="dw-canvas">{canvasBody}</div>
            </section>
            {metaOpen&&meta}
          </div>
        ):(
          <div className="dw-reg">
            <Toolbar search={search} onSearch={setSearch} placeholder="Search drawings…"
              filters={<>
                <Select aria-label="Discipline" value={filterDiscipline==='all'?'':filterDiscipline} onChange={e=>setFilterDiscipline(e.target.value||'all')} placeholder="All Disciplines" options={[...DISCIPLINES]} style={{ width: 'auto', minWidth: 170 }}/>
                <Select aria-label="Status" value={filterStatus==='all'?'':filterStatus} onChange={e=>setFilterStatus(e.target.value||'all')} placeholder="All Statuses" options={STATUSES.map(s=>({value:s,label:STATUS_LABELS[s]}))} style={{ width: 'auto', minWidth: 170 }}/>
                {setToggle}
              </>}
              actions={
                <div className="dw-seg" role="group" aria-label="Grouping">
                  <button type="button" aria-pressed={groupByDiscipline} onClick={()=>setGroupByDiscipline(true)}>By Discipline</button>
                  <button type="button" aria-pressed={!groupByDiscipline} onClick={()=>setGroupByDiscipline(false)}>Flat List</button>
                </div>
              }
            />
            {(loading||loadError||filtered.length===0||!groupByDiscipline)?(
              <Card flush title={loading?'Drawings':!groupByDiscipline&&filtered.length>0?'All Drawings':undefined}
                subtitle={!loading&&filtered.length>0?`${filtered.length} of ${total} sheet${total===1?'':'s'}`:undefined}>
                <DataTable tableId="project-drawings" exportName="drawings" columns={columns} rows={loading||loadError?[]:filtered} rowKey={d=>d.id} loading={loading}
                  onRowClick={viewDrawing} rowActions={rowActions} empty={registerEmpty}/>
              </Card>
            ):(
              groupOrder.map(disc=>(
                <Card key={disc} flush
                  title={<span style={{display:'inline-flex',alignItems:'center',gap:8}}><span className="dw-dot" style={{background:DISCIPLINE_COLORS[disc]||'var(--text-tertiary)'}}/>{disc}</span>}
                  subtitle={`${grouped[disc].length} sheet${grouped[disc].length===1?'':'s'}`}>
                  <DataTable tableId="project-drawings" exportName="drawings" columns={columns} rows={grouped[disc]} rowKey={d=>d.id} onRowClick={viewDrawing} rowActions={rowActions}/>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      </PageShell>
      </div>

      {/* Add / Edit / New Revision */}
      <FormModal
        open={mode==='create'||mode==='edit'}
        onClose={closePanel}
        title={mode==='create'?(replacing?'Upload new revision':'Add drawing'):'Edit drawing'}
        onSubmit={async()=>{await save();}}
        submitLabel={mode==='create'?(uploadFile?(saveError?'Retry upload':'Upload sheet'):(replacing?'Add revision':'Add drawing')):'Save changes'}
        busy={saving}
        error={saveError?`${mode==='create'&&uploadFile?'Upload failed':'Save failed'} — ${saveError}`:null}
      >
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {mode==='create'&&replacing&&(
            <Callout tone="warning" title={`Replacing ${sheetNo(replacing)||'this sheet'} R${revOf(replacing)}`}
              text={`This files as R${Number(form.revision)||0} and becomes current; the earlier revision stays on record, marked superseded.`}/>
          )}
          {mode==='create'&&(
            <label className="dw-drop" data-state={saveError&&uploadFile?'failed':uploadFile?'ready':undefined}>
              <input type="file" accept=".pdf,image/*" style={{display:'none'}}
                onChange={e=>pickFile(e.target.files?.[0]||null)}/>
              <UploadSimple size={20} weight="bold" color={saveError&&uploadFile?'var(--danger)':uploadFile?'var(--success)':'var(--text-secondary)'}/>
              <div className="dw-drop-name">{uploadFile?uploadFile.name:'Upload the sheet PDF'}</div>
              <div className="dw-drop-sub">
                {saveError&&uploadFile?'Not uploaded. The file is still attached — fix the issue and try again, or tap to choose another file.'
                  :uploadFile?'Sheet number and title were read from the filename.'
                  :'"A-101 Floor Plan.pdf" fills the sheet number and title. Or skip the file and link a URL.'}
              </div>
            </label>
          )}
          <FormGrid cols={2}>
            <Field label="Drawing #" required hint={mode==='create'&&autoFields.num?'Read from the filename.':undefined}>
              <Input value={form.drawing_number} required
                onChange={e=>{const v=e.target.value;setAutoFields(a=>({...a,num:false}));setForm(f=>({...f,drawing_number:v}));}}
                placeholder="e.g. A1.01"/>
            </Field>
            <Field label="Revision">
              <Input type="number" min={0} value={form.revision}
                onChange={e=>setForm(f=>({...f,revision:e.target.value}))}/>
            </Field>
            <Field label="Title" required span hint={mode==='create'&&autoFields.title?'Read from the filename.':undefined}>
              <Input value={form.title} required onChange={e=>{const v=e.target.value;setAutoFields(a=>({...a,title:false}));setForm(f=>({...f,title:v}));}}
                placeholder="e.g. Floor Plan - Level 1"/>
            </Field>
            <Field label="Discipline">
              <Select value={form.discipline} onChange={e=>setForm(f=>({...f,discipline:e.target.value}))} options={[...DISCIPLINES]}/>
            </Field>
            <Field label="Status" hint="Superseded and void sheets leave the current set but stay on record.">
              <Select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} options={STATUSES.map(s=>({value:s,label:STATUS_LABELS[s]}))}/>
            </Field>
            <Field label="Revision date" hint={mode==='create'&&autoFields.date?'Defaulted to today — the title block date wins.':undefined}>
              <DateInput value={form.revision_date}
                onChange={e=>{const v=e.target.value;setAutoFields(a=>({...a,date:false}));setForm(f=>({...f,revision_date:v}));}}/>
            </Field>
            <Field label="PDF / drawing URL" hint={uploadFile&&mode==='create'?'Not needed — the uploaded file stores its own link.':'Optional — link an external PDF instead of uploading.'}>
              <Input value={form.url} onChange={e=>setForm(f=>({...f,url:e.target.value}))} placeholder="https://…"/>
            </Field>
            <Field label="Notes" span>
              <Textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3}
                placeholder="Revision notes, superseded by, etc."/>
            </Field>
          </FormGrid>
        </div>
      </FormModal>
      <div style={{ position: 'relative', zIndex: 10001 }}><UnsavedGuardModal guard={guard} /></div>
    </>
  );
}
