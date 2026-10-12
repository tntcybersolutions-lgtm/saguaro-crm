'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import {
  Plus, Ruler, X, UploadSimple, SidebarSimple, Info, ArrowsOutSimple, Columns,
  CaretLeft, CaretRight, PencilSimple, Trash, Warning, ArrowClockwise, FileX, ArrowSquareOut,
} from '@phosphor-icons/react';
import { SHEET_DISCIPLINES } from '@/lib/construction-intelligence';
import { FlowSteps, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import {
  Button, Badge, Tabs, Toolbar, Select, StatRow, DataTable, DetailList, EmptyState, Card, Menu, Toast,
  type BadgeTone, type Column,
} from '@/components/ui/kit';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { openPdf, PdfPane } from '@/components/PdfViewer';

const BORDER='rgba(255,255,255,0.12)',DIM='var(--text-secondary)',TEXT='var(--text-primary)';
const RED='var(--danger)';
const PSURFACE='var(--bg-surface)';
const PBORDER='var(--border-subtle)';

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

const inp:React.CSSProperties={
  width:'100%',padding:'9px 12px',background:'var(--bg-surface-2)',
  border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,
  fontSize:16,outline:'none',boxSizing:'border-box',
};
const hint:React.CSSProperties={fontSize:12,color:'var(--text-tertiary)',marginTop:5,lineHeight:1.45};

const EMPTY_FORM={
  drawing_number:'',title:'',discipline:'Architectural',
  revision:0,revision_date:'',status:'current',url:'',notes:'',
};

function FieldLabel({label,auto}:{label:string;auto?:boolean}){
  return(
    <label style={{display:'block',fontSize:12,fontWeight:700,color:DIM, marginBottom:5}}>{label}{auto&&<AutoChip/>}</label>
  );
}

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
@keyframes drawerIn{from{transform:translateX(100%);opacity:.4}to{transform:translateX(0);opacity:1}}
.dw-root{--dw-h:calc(100vh - 56px - env(safe-area-inset-top,0px) - var(--sag-header-msg-h,0px) - var(--sag-nextstep-h,0px));width:100%;max-width:none;min-width:0;display:flex;flex-direction:column}
@supports (height:100dvh){.dw-root{--dw-h:calc(100dvh - 56px - env(safe-area-inset-top,0px) - var(--sag-header-msg-h,0px) - var(--sag-nextstep-h,0px))}}
.dw-root[data-view="sheet"]{height:var(--dw-h);min-height:520px}
.dw-head{display:flex;align-items:center;flex-wrap:wrap;gap:10px 16px;padding:14px var(--sp-6) 0;min-width:0}
.dw-head-id{min-width:0;flex:1 1 220px}
.dw-eyebrow{font-size:12px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dw-title{margin:2px 0 0;font-size:20px;font-weight:800;color:var(--text-primary);letter-spacing:-0.01em;line-height:1.2}
.dw-head-tabs .k-tabs{border-bottom:none}
.dw-err{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px var(--sp-6) 0;padding:10px 14px;border-radius:var(--radius-sm);background:rgba(248,113,113,0.10);border:1px solid rgba(248,113,113,0.40);color:#FFB3BB;font-size:13px}
.dw-work{flex:1;min-height:0;min-width:0;display:flex;margin:12px var(--sp-6) var(--sp-4);border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden;background:var(--bg-base)}
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
.dw-reg{display:flex;flex-direction:column;gap:var(--sp-4);padding:var(--sp-4) var(--sp-6) var(--sp-8);min-width:0}
.dw-seg{display:inline-flex;border:1px solid var(--border-default);border-radius:var(--radius-sm);overflow:hidden}
.dw-seg button{all:unset;box-sizing:border-box;height:36px;padding:0 12px;font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer;white-space:nowrap}
.dw-seg button[aria-pressed="true"]{background:rgba(255,255,255,0.10);color:var(--text-primary)}
.dw-seg button:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
@media ${PHONE}{
  .dw-head{padding:10px 16px 0}
  .dw-err{margin:10px 16px 0}
  .dw-work{margin:10px 0 0;border-radius:0;border-left:none;border-right:none;border-bottom:none}
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
  .dw-reg{padding:var(--sp-4) 16px var(--sp-6)}
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
  const [view,setView]=useState<'sheet'|'register'>('sheet');
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
  function viewDrawing(drawing:any){
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
          <InsightRow label="Current Set" value={`${current} sheet${current===1?'':'s'}`}/>
          <InsightRow label={`${active.discipline||'Other'} Sheets Current`} value={String(drawings.filter(d=>(d.discipline||'Other')===(active.discipline||'Other')&&d.status==='current').length)}/>
          <InsightRow label="Open RFIs" value={String(Number(counts?.openRfis)||0)}/>
          <InsightRow label="Open Submittals" value={String(Number(counts?.openSubmittals)||0)}/>
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

      <div className="dw-root" data-view={view}>
        {/* Header — context, title, view toggle, ONE primary action */}
        <header className="dw-head">
          <div className="dw-head-id">
            <div className="dw-eyebrow">{ctx?.project?.name||'Project'}{!loading&&!loadError&&total>0?` · ${current} current sheet${current===1?'':'s'} across ${disciplineCount} discipline${disciplineCount===1?'':'s'}`:''}</div>
            <h1 className="dw-title">Drawings</h1>
          </div>
          <div className="dw-head-tabs">
            <Tabs value={view} onChange={k=>setView(k as 'sheet'|'register')} tabs={[
              {key:'sheet',label:'Sheet'},
              {key:'register',label:'Register',count:loading||loadError?undefined:total},
            ]}/>
          </div>
          <Button variant="primary" icon={<Plus size={15} weight="bold"/>} onClick={openCreate}>Add Drawing</Button>
        </header>

        {view==='sheet'?(
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
            {!loading&&!loadError&&total>0&&(
              <StatRow items={[
                {label:'Current Set',value:current,sub:superseded>0?`${superseded} superseded on record`:'No superseded sheets',tone:'good',onClick:()=>{setFilterStatus('current');setDrawingSet('current');}},
                {label:'For Review',value:forReview,sub:'Awaiting review',tone:forReview>0?'warn':'default',onClick:()=>{setFilterStatus('for_review');}},
                {label:'Superseded',value:superseded,sub:'Kept on record',onClick:()=>{setFilterStatus('superseded');setDrawingSet('all');}},
                {label:'Disciplines',value:disciplineCount,sub:`${total} sheet${total===1?'':'s'} in register`,onClick:()=>{clearFilters();setDrawingSet('all');}},
              ]}/>
            )}
            <Toolbar search={search} onSearch={setSearch} placeholder="Search drawings…"
              filters={<>
                <Select aria-label="Discipline" value={filterDiscipline==='all'?'':filterDiscipline} onChange={e=>setFilterDiscipline(e.target.value||'all')} placeholder="All Disciplines" options={[...DISCIPLINES]}/>
                <Select aria-label="Status" value={filterStatus==='all'?'':filterStatus} onChange={e=>setFilterStatus(e.target.value||'all')} placeholder="All Statuses" options={STATUSES.map(s=>({value:s,label:STATUS_LABELS[s]}))}/>
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
                <DataTable columns={columns} rows={loading||loadError?[]:filtered} rowKey={d=>d.id} loading={loading}
                  onRowClick={viewDrawing} rowActions={rowActions} empty={registerEmpty}/>
              </Card>
            ):(
              groupOrder.map(disc=>(
                <Card key={disc} flush
                  title={<span style={{display:'inline-flex',alignItems:'center',gap:8}}><span className="dw-dot" style={{background:DISCIPLINE_COLORS[disc]||'var(--text-tertiary)'}}/>{disc}</span>}
                  subtitle={`${grouped[disc].length} sheet${grouped[disc].length===1?'':'s'}`}>
                  <DataTable columns={columns} rows={grouped[disc]} rowKey={d=>d.id} onRowClick={viewDrawing} rowActions={rowActions}/>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      {/* Add / Edit / New Revision — slide-over */}
      {(mode==='create'||mode==='edit')&&(
        <div role="dialog" aria-modal="true" aria-label={mode==='create'?(replacing?'Upload New Revision':'Add Drawing'):'Edit Drawing'}
          style={{position:'fixed',top:0,right:0,bottom:0,width:'min(460px,100%)',zIndex:600,
          background:'var(--bg-elevated)',borderLeft:`1px solid ${BORDER}`,
          boxShadow:'-28px 0 70px -24px rgba(0,0,0,.75)',
          overflow:'auto',display:'flex',flexDirection:'column',
          paddingTop:'env(safe-area-inset-top,0px)',paddingBottom:'env(safe-area-inset-bottom,0px)',
          animation:'drawerIn .28s cubic-bezier(.2,.7,.3,1)'}}>
          <div style={{padding:'12px 16px 12px 20px',borderBottom:`1px solid ${PBORDER}`,
            display:'flex',alignItems:'center',justifyContent:'space-between',
            position:'sticky',top:0,background:'var(--bg-elevated)',zIndex:2}}>
            <div style={{fontWeight:800,fontSize:15,color:TEXT}}>
              {mode==='create'?(replacing?'Upload New Revision':'Add Drawing'):'Edit Drawing'}
            </div>
            <button type="button" className="dw-ibtn" onClick={closePanel} aria-label="Close" style={{width:44,height:44}}>
              <X size={16} weight="bold"/>
            </button>
          </div>

          <div style={{flex:1,padding:20}}>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              {mode==='create'&&replacing&&(
                <div style={{background:'rgba(251,191,36,0.10)',border:'1px solid rgba(251,191,36,0.40)',borderRadius:10,padding:'10px 12px',fontSize:13,color:TEXT,lineHeight:1.5}}>
                  Replacing <strong>{sheetNo(replacing)||'this sheet'} R{revOf(replacing)}</strong> — this files as R{Number(form.revision)||0}. The earlier revision stays on record; edit it to mark it superseded once the new one is in.
                </div>
              )}
              {mode==='create'&&(
                <label style={{display:'block',cursor:'pointer',border:`1.5px dashed ${saveError&&uploadFile?'rgba(248,113,113,0.6)':uploadFile?'rgba(74,222,128,0.5)':'color-mix(in srgb, var(--brand-primary) 40%, transparent)'}`,borderRadius:12,padding:'16px 14px',textAlign:'center',background:saveError&&uploadFile?'rgba(248,113,113,0.06)':uploadFile?'rgba(74,222,128,0.06)':'color-mix(in srgb, var(--brand-primary) 5%, transparent)'}}>
                  <input type="file" accept=".pdf,image/*" style={{display:'none'}}
                    onChange={e=>pickFile(e.target.files?.[0]||null)}/>
                  <UploadSimple size={20} weight="bold" color={saveError&&uploadFile?'var(--danger)':uploadFile?'var(--success)':'var(--brand-primary-strong)'}/>
                  <div style={{fontSize:13,fontWeight:800,color:saveError&&uploadFile?'var(--danger)':uploadFile?'var(--success)':'var(--brand-primary-strong)',marginTop:6,overflowWrap:'anywhere'}}>
                    {uploadFile?uploadFile.name:'Upload the Sheet PDF'}
                  </div>
                  <div style={{fontSize:12,color:DIM,marginTop:4,lineHeight:1.5}}>
                    {saveError&&uploadFile?'Not uploaded. The file is still attached — fix the issue below and try again, or tap to choose a different file.'
                      :uploadFile?'Ready to upload. Sheet number and title were read from the filename — adjust below.'
                      :'Drop in "A-101 Floor Plan.pdf" and the sheet number and title prefill from the filename. Or skip the file and link a URL below.'}
                  </div>
                </label>
              )}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div style={{minWidth:0}}>
                  <FieldLabel label="Drawing # *" auto={mode==='create'&&autoFields.num}/>
                  <input value={form.drawing_number}
                    onChange={e=>{const v=e.target.value;setAutoFields(a=>({...a,num:false}));setForm(f=>({...f,drawing_number:v}));}}
                    style={inp} placeholder="e.g. A1.01"/>
                  <div style={hint}>Sheets sort naturally — A-2 files before A-10.</div>
                </div>
                <div style={{minWidth:0}}>
                  <FieldLabel label="Revision"/>
                  <input type="number" min={0} value={form.revision}
                    onChange={e=>setForm(f=>({...f,revision:e.target.value}))}
                    style={inp}/>
                </div>
              </div>
              <div>
                <FieldLabel label="Title *" auto={mode==='create'&&autoFields.title}/>
                <input value={form.title} onChange={e=>{const v=e.target.value;setAutoFields(a=>({...a,title:false}));setForm(f=>({...f,title:v}));}}
                  style={inp} placeholder="e.g. Floor Plan - Level 1"/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div style={{minWidth:0}}>
                  <FieldLabel label="Discipline"/>
                  <select value={form.discipline}
                    onChange={e=>setForm(f=>({...f,discipline:e.target.value}))}
                    style={{...inp,padding:'9px 10px'}}>
                    {DISCIPLINES.map(d=><option key={d} value={d}>{d}</option>)}
                  </select>
                  <div style={hint}>Canonical discipline list — the register groups sheets under this.</div>
                </div>
                <div style={{minWidth:0}}>
                  <FieldLabel label="Status"/>
                  <select value={form.status}
                    onChange={e=>setForm(f=>({...f,status:e.target.value}))}
                    style={{...inp,padding:'9px 10px'}}>
                    {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                  <div style={hint}>Superseded and void sheets drop out of the current set but stay on record.</div>
                </div>
              </div>
              <div>
                <FieldLabel label="Revision Date" auto={mode==='create'&&autoFields.date}/>
                <SaguaroDatePicker value={form.revision_date}
                  onChange={v=>{setAutoFields(a=>({...a,date:false}));setForm(f=>({...f,revision_date:v}));}}
                  style={inp}/>
                <div style={hint}>Defaults to today — the date on the title block wins.</div>
              </div>
              <div>
                <FieldLabel label="PDF / Drawing URL"/>
                <input value={form.url} onChange={e=>setForm(f=>({...f,url:e.target.value}))}
                  style={inp} placeholder="https://…"/>
                <div style={hint}>{uploadFile&&mode==='create'?'Not needed — the uploaded file stores its own link.':'Optional — link an external PDF if you are not uploading the file.'}</div>
              </div>
              <div>
                <FieldLabel label="Notes"/>
                <textarea value={form.notes}
                  onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                  rows={3} style={{...inp,resize:'vertical',lineHeight:1.5}}
                  placeholder="Revision notes, superseded by, etc."/>
              </div>
              {mode==='create'&&!replacing&&(
                <div style={{background:PSURFACE,border:`1px solid ${PBORDER}`,borderRadius:12,padding:'14px 16px'}}>
                  <FlowSteps title="What Happens Next" steps={[
                    {title:'Sheet Files Itself',desc:'Lands under its discipline, sorted by sheet number.'},
                    {title:'The Team Works the Current Set',desc:'Field crews and subs build from sheets marked current.'},
                    {title:'Revisions Supersede Cleanly',desc:'When the next rev lands, mark this one superseded — it stays on record.'},
                  ]}/>
                </div>
              )}
              {saveError&&(
                <div role="alert" style={{display:'flex',gap:8,alignItems:'flex-start',background:'rgba(248,113,113,0.10)',border:'1px solid rgba(248,113,113,0.45)',borderRadius:10,padding:'10px 12px',fontSize:13,color:'var(--danger)',lineHeight:1.5}}>
                  <Warning size={16} color={RED} style={{flexShrink:0,marginTop:2}}/>
                  <div><strong style={{color:TEXT}}>{mode==='create'&&uploadFile?'Upload Failed':'Save Failed'}</strong> — {saveError}</div>
                </div>
              )}
              <div style={{display:'flex',gap:10,paddingTop:4}}>
                <button onClick={save} disabled={saving} className="pmBtn"
                  style={{...goldButtonStyle,flex:1,minHeight:44,opacity:saving?0.6:1,cursor:saving?'not-allowed':'pointer'}}>
                  {saving?(uploadFile&&mode==='create'?'Uploading…':'Saving…'):mode==='create'?(uploadFile?(saveError?'Retry Upload':'Upload Sheet'):(replacing?'Add Revision':'Add Drawing')):'Save Changes'}
                </button>
                <button onClick={closePanel} style={{...ghostButtonStyle,minHeight:44}}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <UnsavedGuardModal guard={guard} />
    </>
  );
}
