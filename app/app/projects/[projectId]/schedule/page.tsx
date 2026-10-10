'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSort, useSortedRows, SortTh, SortBar } from '@/components/ui/sort';
import { jobBarStyle } from '@/lib/project-colors';
import { useProjectColor } from '@/lib/hooks/useProjectColor';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { SkeletonKPI, SkeletonRow } from '@/components/ui/Skeleton';
import { WarningCircle, CalendarBlank, X, Plus, TrendUp, CheckCircle, Clock, ListChecks } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, FlowSteps, FlowStrip, AutoChip, goldButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { SUB_TRADES, SUB_TRADES_BY_DIVISION } from '@/lib/construction-intelligence';
import { moduleAccent } from '@/lib/module-identity';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { localDay } from '@/lib/calendar-day';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='var(--text-secondary)',TEXT='var(--text-primary)';
const GREEN='var(--success)',RED='var(--danger)',ORANGE='var(--warning)',BLUE='var(--brand-primary)';

const STATUSES=['not_started','in_progress','completed','delayed','on_hold'];
const STATUS_LABELS:Record<string,string>={
  not_started:'Not Started',in_progress:'In Progress',
  completed:'Completed',delayed:'Delayed',on_hold:'On Hold',
};
const STATUS_COLORS:Record<string,string>={
  not_started:DIM,in_progress:GOLD,completed:GREEN,delayed:RED,on_hold:ORANGE,
};
const PHASES=['Pre-Construction','Foundation','Framing','MEP Rough','Insulation',
  'Drywall','Finishes','MEP Trim','Punch List','Closeout','Other'];

const inp:React.CSSProperties={
  width:'100%',padding:'9px 12px',background:'var(--bg-surface-2)',
  border:'1px solid rgba(255,255,255,0.12)',borderRadius:7,color:'var(--text-primary)',
  fontSize:13,outline:'none',boxSizing:'border-box',
};
const EMPTY:Record<string,any>={
  name:'',phase:'',trade:'',start_date:'',end_date:'',
  pct_complete:0,status:'not_started',predecessor:'',predecessor_id:'',assigned_to:'',notes:'',
};
// Canonical trade taxonomy — CSI division groups plus the specialty markets outside them.
const DIVISION_TRADE_SET=new Set(SUB_TRADES_BY_DIVISION.flatMap(d=>d.trades));
const EXTRA_TRADES=SUB_TRADES.filter(t=>!DIVISION_TRADE_SET.has(t));
const HINT:React.CSSProperties={fontSize:11,color:'var(--c-text-2)',marginTop:5,lineHeight:1.45};

function Field({label,children}:{label:React.ReactNode;children:React.ReactNode}){
  return(
    <div>
      <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,
        marginBottom:5}}>{label}</label>
      {children}
    </div>
  );
}

function daysBetween(a:string,b:string){
  return Math.max(1,Math.round((new Date(b).getTime()-new Date(a).getTime())/86400000));
}

function addDaysISO(ymd:string,days:number){
  const [y,m,d]=ymd.split('-').map(Number);
  const dt=new Date(y,(m||1)-1,(d||1)+days);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function fmtShort(d?:string|null){
  return d?new Date(String(d).slice(0,10)+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';
}

/* ── Gantt bar chart ────────────────────────────────────────────── */
function GanttChart({tasks, jobHex}:{tasks:any[]; jobHex:string}){
  const withDates = tasks.filter(t=>
    t.start_date&&t.end_date
    &&!Number.isNaN(Date.parse(t.start_date))
    &&!Number.isNaN(Date.parse(t.end_date))
  );
  if(!withDates.length) return(
    <div style={{padding:40,textAlign:'center',color:DIM,fontSize:13}}>
      Add tasks with start &amp; end dates to see the Gantt chart.
    </div>
  );

  const allDates = withDates.flatMap(t=>[t.start_date,t.end_date]);
  /* Calendar days, counted as days: new Date('YYYY-MM-DD') is UTC midnight,
     so the padding and week steps move in UTC days and labels read in UTC —
     mixing in local setDate/toLocaleDateString labelled every week one day
     early in the US. Only "today" is local: this device's day. */
  const minDate  = new Date(allDates.reduce((m,d)=>d<m?d:m));
  const maxDate  = new Date(allDates.reduce((m,d)=>d>m?d:m));
  // Add padding
  minDate.setUTCDate(minDate.getUTCDate()-2);
  maxDate.setUTCDate(maxDate.getUTCDate()+5);
  const ymd = (d:Date) => d.toISOString().split('T')[0]; // a UTC-midnight calendar day
  const totalDays = daysBetween(ymd(minDate), ymd(maxDate));

  function pct(date:string){
    return Math.max(0,Math.min(100,
      daysBetween(ymd(minDate),date)/totalDays*100
    ));
  }

  // Generate week markers
  const markers:Date[]=[];
  const cur=new Date(minDate);
  while(cur<=maxDate){
    markers.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate()+7);
  }

  const today=localDay();
  const todayPct=pct(today);

  return(
    <div style={{overflow:'auto'}}>
      {/* Week header */}
      <div style={{display:'flex',borderBottom:`1px solid ${BORDER}`,paddingBottom:6,marginBottom:4,
        paddingLeft:200,fontSize:10,color:DIM,position:'relative',minWidth:700}}>
        {markers.map(m=>(
          <div key={m.toISOString()} style={{
            position:'absolute',
            left:`calc(200px + ${pct(ymd(m))}%)`,
            fontSize:10,color:DIM,whiteSpace:'nowrap',transform:'translateX(-50%)',
          }}>
            {m.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}
          </div>
        ))}
        &nbsp;
      </div>

      {/* Rows */}
      {withDates.map(task=>{
        const left=pct(task.start_date);
        const width=Math.max(.5,pct(task.end_date)-left);
        const color=STATUS_COLORS[task.status]||DIM;
        const isDone=task.status==='completed';
        return(
          <div key={task.id} style={{display:'flex',alignItems:'center',
            minHeight:36,borderBottom:`1px solid rgba(255,255,255,0.08)`,minWidth:700}}>
            {/* Label */}
            <div style={{width:200,flexShrink:0,paddingRight:12,
              fontSize:12,fontWeight:600,color:isDone?DIM:TEXT,
              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
              textDecoration:isDone?'line-through':'none'}}>
              {task.name}
            </div>
            {/* Bar area */}
            <div style={{flex:1,position:'relative',height:24}}>
              {/* Today line */}
              <div style={{position:'absolute',left:`${todayPct}%`,top:0,bottom:0,
                width:1,background:'color-mix(in srgb, var(--brand-primary) 50%, transparent)',zIndex:1}}/>
              {/* Bar background */}
              <div style={{position:'absolute',left:`${left}%`,width:`${width}%`,
                top:4,height:16,borderRadius:3,boxSizing:'border-box',
                ...jobBarStyle(jobHex),border:`1px solid color-mix(in srgb, ${jobHex} 40%, transparent)`,borderLeft:`3px solid ${jobHex}`}}>
                {/* Progress fill */}
                <div style={{
                  height:'100%',borderRadius:2,
                  background:color,opacity:.8,
                  width:`${task.pct_complete??0}%`,
                  transition:'width .3s',
                }}/>
                {/* Label on bar */}
                {width>8&&(
                  <div style={{position:'absolute',top:0,left:4,right:4,
                    fontSize:9,fontWeight:700,color:'var(--text-primary)',
                    lineHeight:'16px',overflow:'hidden',whiteSpace:'nowrap',
                    textOverflow:'ellipsis',textShadow:'0 1px 2px rgba(0,0,0,.6)'}}>
                    {task.pct_complete??0}%
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TASK_COLS = [
  { key: 'name', label: 'Task' }, { key: 'phase', label: 'Phase' }, { key: 'start_date', label: 'Start' }, { key: 'end_date', label: 'End' },
  { key: 'duration', label: 'Duration' }, { key: 'status', label: 'Status' }, { key: 'pct_complete', label: '% Done' }, { key: 'assigned_to', label: 'Assigned' },
];

export default function SchedulePage(){
  const {projectId}=useParams() as {projectId:string};
  const jobHex = useProjectColor(projectId);
  const [tasks,setTasks]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [selected,setSelected]=useState<any>(null);
  const [mode,setMode]=useState<'view'|'edit'|'create'|null>(null);
  const [form,setForm]=useState<Record<string,any>>({...EMPTY});

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(mode==='create'||mode==='edit', form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `schedule:${projectId}`,
    draftData: mode==='create'?form:undefined,
    restoreDraft: (d) => { setForm(d as Record<string,any>); setMode('create'); setSelected(null); },
    onSave: () => save(),
  });
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [toast,setToast]=useState<{msg:string;type:'success'|'error'}|null>(null);
  const [viewMode,setViewMode]=useState<'gantt'|'list'>('gantt');
  const [search,setSearch]=useState('');
  const [filterStatus,setFilterStatus]=useState('all');
  const [filterPhase,setFilterPhase]=useState('all');
  // SmartCreate: the add flow walks in knowing the project — /api/project-context snapshot.
  const { ctx } = useProjectContext(projectId);
  const [duration,setDuration]=useState('');
  const [auto,setAuto]=useState<{start?:boolean;end?:boolean}>({});

  const showToast=(msg:string,type:'success'|'error'='success')=>{
    setToast({msg,type}); setTimeout(()=>setToast(null),4000);
  };

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch(`/api/schedule/list?projectId=${projectId}`,{headers:h});
      if (!r.ok) throw new Error('Failed to load data');
      const d=await r.json();
      setTasks(d.tasks||[]);
    }catch{setTasks([]);setLoadError('Failed to load. Please try again.');}
    finally{setLoading(false);}
  },[projectId]);

  // Background revalidate — reconciles server truth after an optimistic write
  // without flipping the schedule back into its loading state.
  const revalidate=useCallback(async()=>{
    try{
      const h=await getAuthHeaders();
      const r=await fetch(`/api/schedule/list?projectId=${projectId}`,{headers:h});
      if(!r.ok) return;
      const d=await r.json();
      setTasks(d.tasks||[]);
    }catch{/* background refresh — keep the optimistic rows */}
  },[projectId]);

  useEffect(()=>{load();},[load]);

  // Dead-space kill (spec 4.1): an empty schedule auto-opens the create panel —
  // the composer is the zero state. One-shot per visit so Cancel sticks.
  const autoOpenedRef=useRef(false);
  useEffect(()=>{
    if(!loading&&!loadError&&tasks.length===0&&mode===null&&!autoOpenedRef.current){
      autoOpenedRef.current=true;
      openCreate();
    }
  },[loading,loadError,tasks.length,mode]);

  function openCreate(){setForm({...EMPTY});setDuration('');setAuto({});setMode('create');setSelected(null);}
  function openEdit(task:any){
    setForm({name:task.name||'',phase:task.phase||'',trade:task.trade||'',
      start_date:task.start_date||'',end_date:task.end_date||'',
      pct_complete:task.pct_complete??0,status:task.status||'not_started',
      predecessor:task.predecessor||'',predecessor_id:task.predecessor_id||'',
      assigned_to:task.assigned_to||'',notes:task.notes||''});
    setDuration(task.start_date&&task.end_date?String(daysBetween(task.start_date,task.end_date)):'');
    setAuto({});
    setSelected(task);setMode('edit');
  }
  function viewTask(task:any){setSelected(task);setMode('view');}
  function closePanel(){setSelected(null);setMode(null);}

  // SmartCreate wiring: duration drives the end date; a predecessor drives the start.
  function setStartDate(v:string){
    const d=Number(duration)||0;
    const end=v&&d>0?addDaysISO(v,d):form.end_date;
    setForm(f=>({...f,start_date:v,end_date:end}));
    setAuto(a=>({...a,start:false,end:!!(v&&d>0)}));
  }
  function setDurationDays(v:string){
    setDuration(v);
    const d=Number(v)||0;
    if(form.start_date&&d>0){
      setForm(f=>({...f,end_date:addDaysISO(f.start_date,d)}));
      setAuto(a=>({...a,end:true}));
    }
  }
  function setEndDate(v:string){
    if(form.start_date&&v) setDuration(String(daysBetween(form.start_date,v)));
    setForm(f=>({...f,end_date:v}));
    setAuto(a=>({...a,end:false}));
  }
  function setPredecessorTask(id:string){
    const pred=tasks.find((t:any)=>t.id===id);
    const patch:Record<string,any>={predecessor_id:id,predecessor:pred?.name||''};
    if(pred?.end_date&&!form.start_date){
      // A task follows its predecessor — default to starting the day after it ends.
      patch.start_date=addDaysISO(pred.end_date,1);
      const d=Number(duration)||0;
      if(d>0) patch.end_date=addDaysISO(patch.start_date,d);
      setAuto({start:true,end:d>0});
    }
    setForm(f=>({...f,...patch}));
  }

  async function save(): Promise<boolean> {
    if(!form.name.trim()){showToast('Task name is required.','error');return false;}
    // Optimistic save (house pattern: budget saveEdit) — tasks patch and the
    // panel closes instantly; the network settles in the background.
    const snapshot={...form,pct_complete:Number(form.pct_complete)||0};
    const prevMode=mode,prevSelected=selected;
    setSaving(true);
    try{
      const h=await getAuthHeaders();
      if(mode==='create'){
        const tempId=`temp-${Date.now()}`;
        setTasks(prev=>[...prev,{id:tempId,...snapshot,project_id:projectId}]);
        closePanel();
        showToast('Task added.');
        const r=await fetch('/api/schedule/create',{
          method:'POST',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify({...form,projectId}),
        });
        if(!r.ok){setTasks(prev=>prev.filter((t:any)=>t.id!==tempId));throw new Error(await r.text());}
        const d=await r.json();
        if(d.task) setTasks(prev=>prev.map((t:any)=>t.id===tempId?d.task:t));
        revalidate();
      }else if(mode==='edit'&&selected){
        const prevTask=selected;
        setTasks(prev=>prev.map((t:any)=>t.id===prevTask.id?{...t,...snapshot}:t));
        closePanel();
        showToast('Task updated.');
        const r=await fetch(`/api/schedule/${prevTask.id}`,{
          method:'PUT',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify({...form,pct_complete:Number(form.pct_complete)||0}),
        });
        if(!r.ok){setTasks(prev=>prev.map((t:any)=>t.id===prevTask.id?prevTask:t));throw new Error(await r.text());}
        revalidate();
      }
      guard.clearDraft();
      return true;
    }catch(e:any){
      console.error(e);showToast(humanError(e,'Save failed. Please try again.'),'error');
      // Rollback already applied — reopen the panel with the input intact.
      setForm(snapshot);setMode(prevMode);setSelected(prevSelected);
    }
    finally{setSaving(false);}
    return false;
  }

  async function deleteTask(task:any){
    if(!(await confirmDialog({ title: 'Please confirm', message: `Delete task "${task.name}"?`, danger: true }))) return;
    // Optimistic remove — the task leaves and the panel closes instantly;
    // rollback restores the exact list on failure.
    const prevTasks=tasks;
    setTasks(prev=>prev.filter((t:any)=>t.id!==task.id));
    showToast('Task deleted.');closePanel();
    setDeleting(true);
    try{
      const h=await getAuthHeaders();
      const dr=await fetch(`/api/schedule/${task.id}`,{method:'DELETE',headers:h});
      if (!dr.ok) throw new Error('Delete failed');
      revalidate();
    }catch{setTasks(prevTasks);showToast('Delete failed.','error');}
    finally{setDeleting(false);}
  }

  async function updatePct(task:any,pct:number){
    const newStatus=pct===100?'completed':pct>0?'in_progress':'not_started';
    const prevPct=task.pct_complete??0,prevStatus=task.status;
    // Optimistic patch (house pattern: budget saveEdit) — the bar and the open
    // panel move instantly; rollback + toast if the server disagrees.
    setTasks(prev=>prev.map((t:any)=>t.id===task.id?{...t,pct_complete:pct,status:newStatus}:t));
    setSelected((s:any)=>s?.id===task.id?{...s,pct_complete:pct,status:newStatus}:s);
    try{
      const h=await getAuthHeaders();
      const pr=await fetch(`/api/schedule/${task.id}`,{
        method:'PUT',
        headers:{...h,'Content-Type':'application/json'},
        body:JSON.stringify({pct_complete:pct,status:newStatus}),
      });
      if (!pr.ok) throw new Error('Update failed');
      revalidate();
    }catch(e:any){
      setTasks(prev=>prev.map((t:any)=>t.id===task.id?{...t,pct_complete:prevPct,status:prevStatus}:t));
      setSelected((s:any)=>s?.id===task.id?{...s,pct_complete:prevPct,status:prevStatus}:s);
      console.error(e);showToast(humanError(e,'Something went wrong. Please try again.'),'error');
    }
  }

  const phases=Array.from(new Set(tasks.map((t:any)=>t.phase).filter(Boolean)));
  const filtered=tasks.filter((t:any)=>{
    const ms=!search||(t.name||'').toLowerCase().includes(search.toLowerCase())
      ||(t.phase||'').toLowerCase().includes(search.toLowerCase());
    const mst=filterStatus==='all'||t.status===filterStatus;
    const mp=filterPhase==='all'||t.phase===filterPhase;
    return ms&&mst&&mp;
  });
  const taskSort = useSort(null);
  const taskSortValue = useCallback((t: any, key: string): unknown => {
    if (key === 'duration') return t.start_date && t.end_date ? daysBetween(t.start_date, t.end_date) : null;
    if (key === 'pct_complete') return Number(t.pct_complete) || 0;
    return t?.[key];
  }, []);
  const sortedTasks = useSortedRows(filtered, taskSort.sort, taskSortValue);

  const today=localDay(); // this device's day, not the UTC day (tomorrow from 7 PM on in Iowa)
  const allEnds=tasks.filter((t:any)=>t.end_date).map((t:any)=>t.end_date);
  const projectEnd=allEnds.length?allEnds.reduce((m,d)=>d>m?d:m):'';
  const daysLeft=projectEnd?Math.max(0,daysBetween(today,projectEnd)):0;
  const avgPct=tasks.length?Math.round(tasks.reduce((s:number,t:any)=>s+(t.pct_complete??0),0)/tasks.length):0;
  const delayedCount=tasks.filter((t:any)=>t.status==='delayed').length;
  const completedCount=tasks.filter((t:any)=>t.status==='completed').length;

  return(
    <div style={{display:'flex',height:'100%',minHeight:0,position:'relative'}}>
      {toast&&(
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:99999,
          padding:'12px 20px',borderRadius:8,color:'var(--text-primary)',fontWeight:700,fontSize:14,pointerEvents:'none',
          background:toast.type==='success'?'rgba(26,138,74,.92)':'rgba(192,48,48,.92)'}}>
          {toast.msg}
        </div>
      )}

      <div style={{flex:1,overflow:'auto',minWidth:0}}>
        <PremiumSurface maxWidth={2200}>
          {/* Header */}
          <ModuleHero
            eyebrow="Schedule"
            eyebrowIcon={<CalendarBlank size={13} weight="fill" color={moduleAccent('schedule').hex} />}
            title="Project"
            accent="Schedule"
            subtitle="Tasks, milestones & Gantt timeline"
            actions={<>
              {/* View toggle */}
              <div style={{display:'flex',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,overflow:'hidden'}}>
                {(['gantt','list'] as const).map(v=>(
                  <button key={v} onClick={()=>setViewMode(v)} className="pmBtn"
                    style={{padding:'9px 16px',background:viewMode===v?'var(--brand-primary-12)':'transparent',
                      border:'none',color:viewMode===v?GOLD:DIM,fontSize:12,fontWeight:700,
                      cursor:'pointer'}}>
                    {v==='gantt'?'Gantt':'List'}
                  </button>
                ))}
              </div>
              <button onClick={openCreate} style={goldButtonStyle} className="pmBtn">
                <Plus size={15} weight="bold" /> Add Task
              </button>
            </>}
          />

          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
            {loading||loadError
              ? Array.from({length:4}).map((_,i)=><SkeletonKPI key={i}/>)
              : <>
                  <StatCard icon={<TrendUp size={19} weight="duotone" color={GREEN} />}
                    label="% Complete" value={`${avgPct}%`} accent={GREEN} sub="Average completion" delay={0.02}  href={`/app/projects/${projectId}/schedule`}/>
                  <StatCard icon={<Clock size={19} weight="duotone" color={moduleAccent('schedule').hex} />}
                    label="Days Remaining" value={daysLeft?String(daysLeft):'—'} sub="To project end" delay={0.06}  href={`/app/projects/${projectId}/schedule`}/>
                  <StatCard icon={<CheckCircle size={19} weight="duotone" color={moduleAccent('schedule').hex} />}
                    label="Tasks Complete" value={`${completedCount}/${tasks.length}`} accent={GOLD} sub="Tasks finished" delay={0.10}  href={`/app/projects/${projectId}/schedule`}/>
                  <StatCard icon={<WarningCircle size={19} weight="duotone" color={delayedCount?RED:DIM} />}
                    label="Delayed" value={String(delayedCount)} accent={delayedCount?RED:undefined}
                    sub={delayedCount?'Need attention':'On track'} delay={0.14}  href={`/app/projects/${projectId}/schedule`}/>
                </>}
          </div>

          {/* Gantt view */}
          {viewMode==='gantt'&&!loading&&!loadError&&tasks.length>0&&(
            <SectionCard flat title="Timeline" subtitle="Today is marked with a yellow line."
              icon={<CalendarBlank size={17} weight="duotone" color={moduleAccent('schedule').hex} />}
              style={{marginBottom:20}} bodyStyle={{overflowX:'auto'}}>
              <GanttChart tasks={filtered.length?filtered:tasks} jobHex={jobHex}/>
            </SectionCard>
          )}

          {/* Filters (list view) */}
          {viewMode==='list'&&!loading&&!loadError&&tasks.length>0&&(
            <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap'}}>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search tasks…"
                style={{flex:1,minWidth:180,padding:'10px 12px',background:'rgba(255,255,255,0.04)',
                  border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,color:TEXT,fontSize:13,outline:'none'}}/>
              <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
                style={{padding:'10px 12px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',
                  borderRadius:10,color:filterStatus!=='all'?TEXT:DIM,fontSize:13,outline:'none'}}>
                <option value="all">All Statuses</option>
                {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <select value={filterPhase} onChange={e=>setFilterPhase(e.target.value)}
                style={{padding:'10px 12px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',
                  borderRadius:10,color:filterPhase!=='all'?TEXT:DIM,fontSize:13,outline:'none'}}>
                <option value="all">All Phases</option>
                {phases.map((p:any)=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}

          {/* LOADING — skeleton rows, never computed zeros */}
          {loading&&(
            <SectionCard flat flush>
              {Array.from({length:6}).map((_,i)=><SkeletonRow key={i}/>)}
            </SectionCard>
          )}

          {/* ERROR — clear block with Retry, never fake/empty data */}
          {!loading&&loadError&&(
            <SectionCard>
              <PremiumEmpty
                tone="error"
                icon={<WarningCircle size={30} weight="duotone" color={RED} />}
                title="Couldn't load schedule"
                description="We couldn't load the project schedule. Check your connection and try again."
                action={<button onClick={load} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
              />
            </SectionCard>
          )}

          {/* EMPTY — the create panel auto-opens; seed the first tasks from bid-package trades */}
          {!loading&&!loadError&&tasks.length===0&&(
            <SectionCard>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:12}}>
                <div style={{fontSize:13.5,fontWeight:800,color:TEXT}}>
                  <CalendarBlank size={16} weight="duotone" color={GOLD} style={{marginRight:7,verticalAlign:'text-bottom'}} />
                  No tasks yet
                  <span style={{fontWeight:400,color:DIM}}>{mode==='create' ? ' — name the first task in the panel; dates chain off predecessors from there.' : ' — add the first task to start the timeline.'}</span>
                </div>
                {mode!=='create'&&(
                  <button onClick={openCreate} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Add Task</button>
                )}
              </div>
              {((ctx?.bidPackages||[]) as any[]).filter((b:any)=>b.trade).length>0&&(
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:12}}>
                  <span style={{fontSize:11,fontWeight:700,color:DIM}}>Seed from Bid Packages:</span>
                  {((ctx?.bidPackages||[]) as any[]).filter((b:any)=>b.trade).slice(0,5).map((b:any)=>(
                    <button key={b.id}
                      onClick={()=>{openCreate();setForm(f=>({...f,name:b.name||b.trade,trade:b.trade}));}}
                      className="pmBtn"
                      style={{padding:'5px 12px',background:'var(--brand-primary-08)',border:'1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)',
                        borderRadius:999,color:GOLD,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                      {b.trade}
                    </button>
                  ))}
                </div>
              )}
              <FlowStrip steps={[
                {title:'Add the Task',desc:'Name is enough to save'},
                {title:'Chain Predecessors',desc:'Start auto-sets to the day after'},
                {title:'Gantt Draws Itself',desc:'Today marked in yellow'},
                {title:'Progress Rolls Up',desc:'% complete feeds the KPIs'},
              ]} />
            </SectionCard>
          )}

          {/* List view */}
          {!loading&&!loadError&&viewMode==='list'&&filtered.length>0&&(
            <SectionCard title="Tasks" flush
              icon={<ListChecks size={17} weight="duotone" color={moduleAccent('schedule').hex} />}
              action={<span style={{fontSize:12,color:DIM,fontWeight:700}}>{filtered.length} shown</span>}>
              <div style={{overflowX:'auto'}}>
              <SortBar columns={TASK_COLS} sort={taskSort.sort} onChange={taskSort.setSort} />
              <table className="k-table" style={{ width:'100%',borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{background:DARK}}>
                    {TASK_COLS.map(c=>(
                      <SortTh key={c.key} col={c.key} label={c.label} sort={taskSort.sort} onSort={taskSort.cycle} style={{padding:'10px 14px',fontSize:11,fontWeight:700,color:DIM,borderBottom:`1px solid ${BORDER}`,whiteSpace:'nowrap'}} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedTasks.map((task:any)=>{
                    const dur=task.start_date&&task.end_date?daysBetween(task.start_date,task.end_date):null;
                    const color=STATUS_COLORS[task.status]||DIM;
                    return(
                      <tr key={task.id}
                        onClick={()=>viewTask(task)}
                        style={{borderBottom:`1px solid rgba(255,255,255,0.08)`,cursor:'pointer',
                          background:selected?.id===task.id&&mode==='view'?'color-mix(in srgb, var(--brand-primary) 5%, transparent)':''}}
                        onMouseEnter={e=>e.currentTarget.style.background='color-mix(in srgb, var(--brand-primary) 4%, transparent)'}
                        onMouseLeave={e=>e.currentTarget.style.background=selected?.id===task.id&&mode==='view'?'color-mix(in srgb, var(--brand-primary) 5%, transparent)':''}>
                        <td style={{padding:'11px 14px',fontWeight:700,color:TEXT}}>{task.name}</td>
                        <td style={{padding:'11px 14px',color:DIM}}>{task.phase||'—'}</td>
                        <td style={{padding:'11px 14px',color:DIM,whiteSpace:'nowrap'}}>{task.start_date||'—'}</td>
                        <td style={{padding:'11px 14px',color:DIM,whiteSpace:'nowrap'}}>{task.end_date||'—'}</td>
                        <td style={{padding:'11px 14px',color:DIM}}>{dur?`${dur}d`:'—'}</td>
                        <td style={{padding:'11px 14px'}}>
                          <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20,
                            background:`color-mix(in srgb, ${color} 13%, transparent)`,color}}>
                            {STATUS_LABELS[task.status]||task.status}
                          </span>
                        </td>
                        <td style={{padding:'11px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div style={{width:60,height:6,background:'rgba(255,255,255,0.12)',borderRadius:3,overflow:'hidden'}}>
                              <div style={{height:'100%',borderRadius:3,background:color,
                                width:`${task.pct_complete??0}%`}}/>
                            </div>
                            <span style={{fontSize:12,color,fontWeight:700}}>{task.pct_complete??0}%</span>
                          </div>
                        </td>
                        <td style={{padding:'11px 14px',color:DIM}}>{task.assigned_to||'—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </SectionCard>
          )}
        </PremiumSurface>
      </div>

      {/* Side panel */}
      {mode!==null&&(
        <div className="sag-side-panel" role={undefined} style={{width:460,borderLeft:`1px solid ${BORDER}`,background:DARK,
          overflow:'auto',flexShrink:0,display:'flex',flexDirection:'column'}}>
          <div style={{padding:'16px 20px',borderBottom:`1px solid ${BORDER}`,
            display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontWeight:800,fontSize:15,color:TEXT}}>
              {mode==='create'?'New Task':mode==='edit'?'Edit Task':'Task Detail'}
            </div>
            <div style={{display:'flex',gap:8}}>
              {mode==='view'&&selected&&(
                <>
                  <button onClick={()=>openEdit(selected)}
                    style={{padding:'6px 14px',background:'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                      border:`1px solid color-mix(in srgb, ${BLUE} 27%, transparent)`,borderRadius:6,
                      color:'var(--brand-primary-strong)',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    Edit
                  </button>
                  <button onClick={()=>deleteTask(selected)} disabled={deleting}
                    style={{padding:'6px 14px',background:'rgba(192,48,48,.1)',
                      border:`1px solid ${RED}44`,borderRadius:6,
                      color:RED,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    {deleting?'…':'Delete'}
                  </button>
                </>
              )}
              <button onClick={closePanel}
                style={{padding:'6px 10px',background:'rgba(163,172,187,.1)',
                  border:`1px solid ${BORDER}`,borderRadius:6,color:DIM,fontSize:12,cursor:'pointer'}}>
                <X size={14} weight="regular" color={DIM} />
              </button>
            </div>
          </div>

          <div style={{flex:1,overflow:'auto',padding:20}}>
            {(mode==='create'||mode==='edit')?(
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                {mode==='create'&&ctx&&(
                  <StatStrip items={[
                    {href: `/app/projects/${projectId}/schedule`, label:'Tasks',value:String(tasks.length),sub:`${completedCount} complete · ${delayedCount} delayed`},
                    {href: `/app/projects/${projectId}/schedule`, label:'Critical Path',value:String(ctx.schedule?.criticalCount??0),accent:(ctx.schedule?.criticalCount??0)>0?GOLD:undefined,sub:'Tasks drive the end date'},
                    {href: `/app/projects/${projectId}/schedule`, label:'Next Milestone',value:ctx.schedule?.nextTasks?.[0]?.name||'—',sub:ctx.schedule?.nextTasks?.[0]?`Starts ${fmtShort(ctx.schedule.nextTasks[0].startDate)}`:'Nothing queued yet'},
                  ]}/>
                )}
                <Field label="Task Name *">
                  <input value={form.name}
                    onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                    style={inp} placeholder="Foundation excavation…"/>
                </Field>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <Field label="Phase">
                    <select value={form.phase}
                      onChange={e=>setForm(f=>({...f,phase:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      <option value="">— Select Phase —</option>
                      {PHASES.map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                  </Field>
                  <Field label="Trade">
                    <select value={form.trade}
                      onChange={e=>setForm(f=>({...f,trade:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      <option value="">— Select Trade —</option>
                      {SUB_TRADES_BY_DIVISION.map(d=>(
                        <optgroup key={d.division} label={`Div ${d.division} — ${d.name}`}>
                          {d.trades.map(t=><option key={t} value={t}>{t}</option>)}
                        </optgroup>
                      ))}
                      <optgroup label="Specialty & Site Markets">
                        {EXTRA_TRADES.map(t=><option key={t} value={t}>{t}</option>)}
                      </optgroup>
                    </select>
                  </Field>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                  <Field label={<>Start{auto.start&&<AutoChip/>}</>}>
                    <SaguaroDatePicker value={form.start_date}
                      onChange={v=>setStartDate(v)}
                      style={inp}/>
                  </Field>
                  <Field label="Duration (d)">
                    <input type="number" min={1} value={duration} placeholder="10"
                      onChange={e=>setDurationDays(e.target.value)}
                      style={inp}/>
                  </Field>
                  <Field label={<>End{auto.end&&<AutoChip/>}</>}>
                    <SaguaroDatePicker value={form.end_date}
                      onChange={v=>setEndDate(v)}
                      style={inp}/>
                  </Field>
                </div>
                {(auto.start||auto.end)&&(
                  <div style={{...HINT,marginTop:-8}}>
                    {auto.start&&<>Start defaulted to the day after the predecessor ends. </>}
                    {auto.end&&form.start_date&&<>End = start + {Number(duration)||0}d — editing either re-syncs.</>}
                  </div>
                )}

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <Field label="Status">
                    <select value={form.status}
                      onChange={e=>setForm(f=>({...f,status:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </Field>
                  <Field label="% Complete">
                    <input type="number" min={0} max={100} value={form.pct_complete}
                      onChange={e=>setForm(f=>({...f,pct_complete:Number(e.target.value)}))}
                      style={inp}/>
                  </Field>
                </div>

                <Field label="Assigned To">
                  <Suggest value={form.assigned_to}
                    onChange={e=>setForm(f=>({...f,assigned_to:e.target.value}))}
                    style={inp} placeholder="Subcontractor or person" options={['s.companyName']} />
                  {(ctx?.subs||[]).length>0&&(
                    <div style={HINT}>{ctx.subs.length} sub{ctx.subs.length===1?'':'s'} on the project roster — start typing to pick one.</div>
                  )}
                </Field>

                <Field label="Predecessor">
                  <select value={form.predecessor_id}
                    onChange={e=>setPredecessorTask(e.target.value)}
                    disabled={tasks.filter((t:any)=>t.id!==selected?.id).length===0}
                    style={{...inp,padding:'9px 10px'}}>
                    <option value="">None — starts independently</option>
                    {tasks.filter((t:any)=>t.id!==selected?.id).map((t:any)=>(
                      <option key={t.id} value={t.id}>{t.name}{t.end_date?` (ends ${fmtShort(t.end_date)})`:''}</option>
                    ))}
                  </select>
                  {form.predecessor_id&&(()=>{
                    const p=tasks.find((t:any)=>t.id===form.predecessor_id);
                    if(!p) return null;
                    return <div style={HINT}>Follows <b style={{color:TEXT}}>{p.name}</b>{p.end_date?<> — ends {fmtShort(p.end_date)}; this task starts the day after.</>:<> — predecessor has no end date yet.</>}</div>;
                  })()}
                </Field>

                <Field label="Notes">
                  <textarea value={form.notes}
                    onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                    rows={3} style={{...inp,resize:'vertical',lineHeight:1.5}}
                    placeholder="Any additional notes…"/>
                </Field>

                {mode==='create'&&(
                  <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'14px 16px'}}>
                    <FlowSteps title="After You Add" steps={[
                      {title:'Task Lands on the Gantt',desc:'The bar plots start to end against the yellow today marker.'},
                      {title:'Dependency Is Tracked',desc:form.predecessor_id?'Chained finish-to-start behind its predecessor.':'Pick a predecessor to chain it into the build sequence.'},
                      {title:'Progress Rolls Up',desc:'Its % complete feeds the completion and delayed KPIs above.'},
                    ]}/>
                  </div>
                )}

                <div style={{display:'flex',gap:10,paddingTop:4}}>
                  <button onClick={save} disabled={saving} className="pmBtn"
                    style={{...goldButtonStyle,flex:1,padding:'11px 0',opacity:saving?.6:1}}>
                    {saving?'Saving…':mode==='create'?'Add Task':'Save Changes'}
                  </button>
                  <button onClick={closePanel}
                    style={{padding:'11px 16px',background:'rgba(163,172,187,.1)',
                      border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,
                      fontSize:14,cursor:'pointer'}}>
                    Cancel
                  </button>
                </div>
              </div>
            ):selected?(
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                {/* Task header */}
                <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:16}}>
                  <div style={{fontSize:16,fontWeight:800,color:TEXT,marginBottom:8}}>{selected.name}</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
                    {selected.phase&&(
                      <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:20,
                        background:'var(--brand-primary-12)',color:'var(--brand-primary-strong)'}}>
                        {selected.phase}
                      </span>
                    )}
                    <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:20,
                      background:`color-mix(in srgb, ${STATUS_COLORS[selected.status]||DIM} 13%, transparent)`,
                      color:STATUS_COLORS[selected.status]||DIM}}>
                      {STATUS_LABELS[selected.status]||selected.status}
                    </span>
                  </div>
                  {/* Progress slider */}
                  <div style={{marginBottom:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:11,color:DIM}}>Progress</span>
                      <span style={{fontSize:12,fontWeight:800,color:STATUS_COLORS[selected.status]||GREEN}}>
                        {selected.pct_complete??0}%
                      </span>
                    </div>
                    <div style={{background:'rgba(255,255,255,0.12)',borderRadius:4,height:10,overflow:'hidden'}}>
                      <div style={{height:'100%',borderRadius:4,
                        background:STATUS_COLORS[selected.status]||GREEN,
                        width:`${selected.pct_complete??0}%`,transition:'width .3s'}}/>
                    </div>
                  </div>
                  {/* Quick update buttons */}
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {[25,50,75,100].map(pct=>(
                      <button key={pct} onClick={()=>updatePct(selected,pct)}
                        style={{flex:1,padding:'6px 0',background:'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                          border:`1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)`,borderRadius:6,
                          color:GOLD,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  {[
                    {l:'Start Date',v:selected.start_date},
                    {l:'End Date',v:selected.end_date},
                    {l:'Duration',v:selected.start_date&&selected.end_date?
                      `${daysBetween(selected.start_date,selected.end_date)} days`:null},
                    {l:'Trade',v:selected.trade},
                    {l:'Assigned To',v:selected.assigned_to},
                    {l:'Predecessor',v:tasks.find((t:any)=>t.id===selected.predecessor_id)?.name||selected.predecessor},
                  ].filter(x=>x.v).map(x=>(
                    <div key={x.l} style={{background:'var(--bg-surface)',border:`1px solid ${BORDER}`,
                      borderRadius:8,padding:'10px 12px'}}>
                      <div style={{fontSize:10,fontWeight:700,color:DIM,
                        marginBottom:4}}>{x.l}</div>
                      <div style={{fontSize:13,color:TEXT}}>{x.v}</div>
                    </div>
                  ))}
                </div>

                {selected.notes&&(
                  <div style={{background:'var(--bg-surface)',border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM,
                      marginBottom:6}}>Notes</div>
                    <div style={{fontSize:13,color:TEXT,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{selected.notes}</div>
                  </div>
                )}
              </div>
            ):null}
          </div>
        </div>
      )}
      <UnsavedGuardModal guard={guard} />
    </div>
  );
}
