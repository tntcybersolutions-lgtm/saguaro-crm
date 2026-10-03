'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { Clipboard, ClipboardText, Thermometer, HardHat, CalendarBlank, WarningCircle, Plus, X, Sparkle, CopySimple, CloudSun, UsersThree } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { moduleAccent } from '@/lib/module-identity';
import { SUB_TRADES } from '@/lib/construction-intelligence';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='#D4D4D8',TEXT='#FFFFFF';
const GREEN='#2CFF7A',RED='#FF3B30',BLUE='var(--brand-primary)';

const WEATHER_OPTS = ['Clear','Partly Cloudy','Overcast','Rain','Thunderstorm','Snow','Fog','Windy'];

const fmtDay = (d?:string|null) => d ? new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) : '—';
/** Workdays (Mon-Fri) strictly between two ISO dates — 0 across a plain weekend. */
function missedWorkdays(fromIso:string,toIso:string){
  let n = 0;
  for(let d=new Date(fromIso+'T12:00:00').getTime()+86400000; d<new Date(toIso+'T12:00:00').getTime(); d+=86400000){
    const wd = new Date(d).getDay();
    if(wd!==0&&wd!==6) n++;
  }
  return n;
}

const EMPTY: Record<string,any> = {
  log_date: new Date().toISOString().split('T')[0],
  weather:'', high_temp:'', low_temp:'', crew_count:'', superintendent:'',
  work_performed:'', delays:'', safety_notes:'', materials_delivered:'', visitors:'', notes:'',
  phase_of_work:'', equipment:'',
  // Structured field-log sections — arrays round-trip through create AND edit.
  manpower_by_trade:[] as any[], subcontractors_on_site:[] as string[], equipment_on_site:[] as string[],
};

const inp: React.CSSProperties = {
  width:'100%', padding:'9px 12px', background:'var(--bg-surface-2)',
  border:'1px solid rgba(255,255,255,0.12)', borderRadius:7, color:'#FFFFFF',
  fontSize:13, outline:'none', boxSizing:'border-box',
};

function Field({label,hint,children}:{label:React.ReactNode;hint?:React.ReactNode;children:React.ReactNode}){
  return (
    <div>
      <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM, marginBottom:5}}>{label}</label>
      {children}
      {hint && <div style={{fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:4,lineHeight:1.45}}>{hint}</div>}
    </div>
  );
}

function Section({label,value,warn}:{label:string;value?:string;warn?:boolean}){
  if(!value?.trim()) return null;
  return (
    <div style={{background:warn?'rgba(192,48,48,.07)':'var(--bg-surface)',
      border:`1px solid ${warn?'rgba(192,48,48,.25)':'rgba(255,255,255,0.12)'}`,
      borderRadius:8,padding:'12px 14px'}}>
      <div style={{fontSize:10,fontWeight:700,color:warn?'#FF3B30':DIM, marginBottom:6}}>{label}</div>
      <div style={{fontSize:13,color:TEXT,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{value}</div>
    </div>
  );
}

/** Removable-chip list with an inline add input — subs & equipment on site. */
function ChipEditor({items,onChange,placeholder}:{items:string[];onChange:(v:string[])=>void;placeholder:string}){
  const [draft,setDraft]=useState('');
  const add=()=>{const v=draft.trim(); if(!v) return; if(!items.includes(v)) onChange([...items,v]); setDraft('');};
  return (
    <div>
      {items.length>0&&(
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
          {items.map(it=>(
            <span key={it} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 11px',
              background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.13)',borderRadius:999,
              fontSize:12.5,color:TEXT,fontWeight:600}}>
              {it}
              <span onClick={()=>onChange(items.filter(x=>x!==it))}
                style={{cursor:'pointer',display:'inline-flex',alignItems:'center'}}>
                <X size={11} weight="bold" color={DIM}/>
              </span>
            </span>
          ))}
        </div>
      )}
      <div style={{display:'flex',gap:8}}>
        <input value={draft} onChange={e=>setDraft(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}
          style={{...inp,flex:1}} placeholder={placeholder}/>
        <button onClick={add} disabled={!draft.trim()}
          style={{padding:'0 14px',background:draft.trim()?'var(--brand-primary-12)':'rgba(255,255,255,0.05)',
            border:`1px solid ${draft.trim()?'color-mix(in srgb, var(--brand-primary) 40%, transparent)':'rgba(255,255,255,0.12)'}`,borderRadius:7,
            color:draft.trim()?'var(--brand-primary-strong)':'rgba(255,255,255,0.35)',fontSize:12.5,fontWeight:700,
            cursor:draft.trim()?'pointer':'default'}}>
          Add
        </button>
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
    <div>
      {rows.length>0&&(
        <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:8}}>
          {rows.map((r:any,i:number)=>(
            <div key={`${r.trade}-${i}`} style={{display:'flex',alignItems:'center',gap:8,
              background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:8,padding:'7px 10px'}}>
              <HardHat size={14} weight="fill" color={DIM} style={{flexShrink:0}}/>
              <div style={{flex:1,minWidth:0,fontSize:13,fontWeight:600,color:TEXT,
                overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {r.trade}
                {Array.isArray(r.crews)&&r.crews.length>0&&(
                  <span style={{fontSize:11.5,fontWeight:500,color:DIM,marginLeft:8}}>
                    {r.crews.join(', ')}
                  </span>
                )}
              </div>
              <input type="number" value={r.count} min={0}
                onChange={e=>onChange(rows.map((x:any,xi:number)=>xi===i?{...x,count:e.target.value===''?'':Number(e.target.value)}:x))}
                style={{...inp,width:70,padding:'6px 8px',textAlign:'center'}}/>
              <span onClick={()=>onChange(rows.filter((_:any,xi:number)=>xi!==i))}
                style={{cursor:'pointer',display:'inline-flex',padding:4}}>
                <X size={12} weight="bold" color={DIM}/>
              </span>
            </div>
          ))}
          <div style={{fontSize:11.5,color:DIM,textAlign:'right',fontWeight:700}}>
            Total on site: <span style={{color:TEXT}}>{total}</span>
          </div>
        </div>
      )}
      <div style={{display:'flex',gap:8}}>
        <Suggest value={trade} onChange={e=>setTrade(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}
          style={{...inp,flex:1}} placeholder="Add a trade…" options={['t']} />
        <input type="number" value={count} min={0}
          onChange={e=>setCount(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}
          style={{...inp,width:70,textAlign:'center'}} placeholder="0"/>
        <button onClick={add} disabled={!trade.trim()}
          style={{padding:'0 14px',background:trade.trim()?'var(--brand-primary-12)':'rgba(255,255,255,0.05)',
            border:`1px solid ${trade.trim()?'color-mix(in srgb, var(--brand-primary) 40%, transparent)':'rgba(255,255,255,0.12)'}`,borderRadius:7,
            color:trade.trim()?'var(--brand-primary-strong)':'rgba(255,255,255,0.35)',fontSize:12.5,fontWeight:700,
            cursor:trade.trim()?'pointer':'default'}}>
          Add
        </button>
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
  const [toast,setToast]     = useState<{msg:string;type:'success'|'error'}|null>(null);
  const [search,setSearch]   = useState('');
  const [monthFilter,setMonthFilter] = useState('');
  // Project snapshot (/api/project-context) — the page walks in knowing the job:
  // last log date, open items, schedule — so create prefills itself.
  const { ctx } = useProjectContext(projectId);
  const [auto,setAuto]       = useState<{date?:boolean;crew?:boolean;manpower?:boolean;subs?:boolean;carry?:boolean}>({});
  const [prefilling,setPrefilling] = useState(false);

  const showToast=(msg:string,type:'success'|'error'='success')=>{
    setToast({msg,type}); setTimeout(()=>setToast(null),4000);
  };

  const load = useCallback(async()=>{
    setLoading(true);
    try{
      setLoadError('');
      const h = await getAuthHeaders();
      const r = await fetch(`/api/daily-logs/list?projectId=${projectId}`,{headers:h});
      if (!r.ok) throw new Error('Failed to load data');
      const d = await r.json();
      setLogs(d.logs||[]);
    }catch{setLogs([]);setLoadError('Failed to load. Please try again.');}
    finally{setLoading(false);}
  },[projectId]);

  // Background revalidate — reconciles server truth after an optimistic write
  // without flipping the list back into its loading state.
  const revalidate = useCallback(async()=>{
    try{
      const h = await getAuthHeaders();
      const r = await fetch(`/api/daily-logs/list?projectId=${projectId}`,{headers:h});
      if(!r.ok) return;
      const d = await r.json();
      setLogs(d.logs||[]);
    }catch{/* background refresh — keep the optimistic rows */}
  },[projectId]);

  useEffect(()=>{load();},[load]);

  function openCreate(){
    // Blank manual log — kept as the fallback path; the primary entry is
    // openAutoFill below. Today's date + crew carried from the last log.
    const prev = logs[0]; // list arrives sorted date-desc
    setForm({
      ...EMPTY,
      log_date: new Date().toISOString().split('T')[0],
      crew_count: prev?.crew_count ? String(prev.crew_count) : '',
    });
    setAuto({date:true, crew:!!(prev?.crew_count)});
    setMode('create'); setSelected(null);
  }

  // AUTO-FIRST: one tap → the prefill route assembles the draft server-side
  // (headcount from BOTH clock systems, manpower from active crews, subs from
  // the project team, carry-forward off the last log, deliveries) and the
  // composer opens pre-filled. The GC only types what the system can't know.
  async function openAutoFill(){
    setPrefilling(true);
    try{
      const h = await getAuthHeaders();
      const today = new Date().toISOString().split('T')[0];
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
      showToast(humanError(e,'Auto-fill failed — opening a blank log.'),'error');
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
      log_date: new Date().toISOString().split('T')[0],
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
  function viewLog(log:any){ setSelected(log); setMode('view'); }
  function closePanel(){ setSelected(null); setMode(null); }

  async function save(): Promise<boolean> {
    // Optimistic save (house pattern: budget saveEdit) — the log lands in the
    // list and the panel closes instantly; the network settles in the background.
    const snapshot = {...form};
    const prevMode = mode, prevSelected = selected;
    setSaving(true);
    try{
      const h = await getAuthHeaders();
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
      if(mode==='create'){
        const tempId = `temp-${Date.now()}`;
        setLogs(prev=>[{id:tempId,...payload,project_id:projectId},...prev]
          .sort((a:any,b:any)=>(b.log_date||'').localeCompare(a.log_date||'')));
        closePanel();
        showToast('Daily log created.');
        const r = await fetch('/api/daily-logs/create',{
          method:'POST',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify({...payload,projectId,
            logDate:payload.log_date,workPerformed:payload.work_performed,
            safetyNotes:payload.safety_notes,materialsDelivered:payload.materials_delivered,
            crewCount:payload.crew_count,
            temperatureHigh:payload.high_temp,temperatureLow:payload.low_temp,
          }),
        });
        if(!r.ok){ setLogs(prev=>prev.filter((l:any)=>l.id!==tempId)); throw new Error(await r.text()); }
        const d = await r.json();
        if(d.log) setLogs(prev=>prev.map((l:any)=>l.id===tempId?d.log:l));
        revalidate();
      } else if(mode==='edit'&&selected){
        const prevLog = selected;
        setLogs(prev=>prev.map((l:any)=>l.id===prevLog.id?{...l,...payload}:l));
        closePanel();
        showToast('Log updated.');
        const r = await fetch(`/api/daily-logs/${prevLog.id}`,{
          method:'PUT',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify(payload),
        });
        if(!r.ok){ setLogs(prev=>prev.map((l:any)=>l.id===prevLog.id?prevLog:l)); throw new Error(await r.text()); }
        revalidate();
      }
      guard.clearDraft();
      return true;
    }catch(e:any){
      console.error(e); showToast(humanError(e,'Save failed. Please try again.'),'error');
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
      const h = await getAuthHeaders();
      const dr = await fetch(`/api/daily-logs/${log.id}`,{method:'DELETE',headers:h});
      if (!dr.ok) throw new Error('Delete failed');
      revalidate();
    }catch{setLogs(prevLogs);showToast('Delete failed. Please try again.','error');}
    finally{setDeleting(false);}
  }

  const months = Array.from(new Set(logs.map(l=>(l.log_date||'').slice(0,7)))).sort().reverse();

  const filtered = logs.filter(l=>{
    const ms = !search || (l.work_performed||'').toLowerCase().includes(search.toLowerCase())
      ||(l.notes||'').toLowerCase().includes(search.toLowerCase())
      ||(l.log_date||'').includes(search);
    const mm = !monthFilter||(l.log_date||'').startsWith(monthFilter);
    return ms&&mm;
  });

  const totalCrew  = logs.reduce((s:number,l:any)=>s+(Number(l.crew_count)||0),0);
  const avgCrew    = logs.length?Math.round(totalCrew/logs.length):0;
  const delayDays  = logs.filter((l:any)=>l.delays?.trim()).length;
  const thisMonth  = logs.filter((l:any)=>(l.log_date||'').startsWith(new Date().toISOString().slice(0,7))).length;

  const panelOpen = mode!==null;

  return (
    <div style={{display:'flex',height:'100%',minHeight:0,position:'relative',background:DARK}}>
      {/* Toast */}
      {toast&&(
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:99999,
          padding:'12px 20px',borderRadius:8,color:'#fff',fontWeight:700,fontSize:14,pointerEvents:'none',
          background:toast.type==='success'?'rgba(26,138,74,.92)':'rgba(192,48,48,.92)'}}>
          {toast.msg}
        </div>
      )}

      {/* Main */}
      <div style={{flex:1,overflow:'auto',minWidth:0}}>
        <PremiumSurface maxWidth={2200}>
          {/* Header */}
          <ModuleHero
            eyebrow="Field Reports"
            eyebrowIcon={<ClipboardText size={13} weight="fill" color={moduleAccent('daily').hex}/>}
            title="Daily"
            accent="Logs"
            subtitle="Headcount from the clocks, weather from NWS."
            actions={
              /* Primary last. Auto-fill is the action this screen exists for,
                 so it sits on the right where the eye lands, not buried at
                 the head of the row ahead of two fallbacks. */
              <>
                <button onClick={openCreate} style={ghostButtonStyle} className="pmBtn">
                  <Plus size={14} weight="bold"/> Blank Log
                </button>
                {logs.length>0&&(
                  <button onClick={copyYesterday} style={ghostButtonStyle} className="pmBtn">
                    <CopySimple size={14} weight="bold"/> Copy Yesterday
                  </button>
                )}
                <button onClick={openAutoFill} disabled={prefilling}
                  style={{...goldButtonStyle,padding:'13px 24px',fontSize:14.5,opacity:prefilling?.7:1}}
                  className="pmBtn">
                  <Sparkle size={17} weight="fill"/> {prefilling?'Assembling draft…':'Auto-Fill Today'}
                </button>
              </>
            }
          />

          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
            <StatCard icon={<Clipboard size={19} weight="duotone" color={moduleAccent('daily').hex}/>}
              label="Total Logs" value={String(logs.length)} accent={GOLD} sub="All field reports" delay={0.02} href={`/app/projects/${projectId}/daily-logs`}/>
            <StatCard icon={<CalendarBlank size={19} weight="duotone" color={moduleAccent('daily').hex}/>}
              label="This Month" value={String(thisMonth)} sub="Logged this month" delay={0.06} href={`/app/projects/${projectId}/daily-logs`}/>
            <StatCard icon={<HardHat size={19} weight="duotone" color={moduleAccent('daily').hex}/>}
              label="Avg Crew / Day" value={String(avgCrew)} accent={GOLD} sub="Workers on site" delay={0.10} href={`/app/projects/${projectId}/crews`}/>
            <StatCard icon={<WarningCircle size={19} weight="duotone" color={delayDays>0?RED:DIM}/>}
              label="Days w/ Delays" value={String(delayDays)} accent={delayDays>0?RED:undefined}
              sub={delayDays>0?'Flagged delays':'None flagged'} delay={0.14} href={`/app/projects/${projectId}/daily-logs`}/>
          </div>

          {/* What the system already knows about this job */}
          {ctx && (()=>{
            const lastLog = ctx.recent?.lastDailyLogDate as string|null;
            const gap = lastLog ? missedWorkdays(lastLog, new Date().toISOString().split('T')[0]) : 0;
            return (
              <StatStrip items={[
                {href: `/app/projects/${projectId}/daily-logs`, label:'Last Log', value: lastLog ? fmtDay(lastLog) : 'None yet',
                  accent: gap>0 ? '#FF3B30' : (lastLog ? '#2CFF7A' : undefined),
                  sub: lastLog ? (gap>0 ? `${gap} workday${gap===1?'':'s'} unlogged` : 'Record is current') : 'Start the record'},
                {href: `/app/projects/${projectId}/daily-logs`, label:'% Complete', value:`${Number(ctx.project?.percentComplete)||0}%`, sub: ctx.project?.status ? String(ctx.project.status).replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase()) : 'Project status'},
                {href: `/app/projects/${projectId}/schedule`, label:'Schedule Tasks', value:String(ctx.counts?.scheduleTasks??0), sub: ctx.schedule?.criticalCount ? `${ctx.schedule.criticalCount} critical open` : 'On the schedule'},
                {href: `/app/projects/${projectId}/rfis`, label:'Open RFIs', value:String(ctx.counts?.openRfis??0), accent:(Number(ctx.counts?.openRfis)||0)>0?'var(--brand-primary-strong)':undefined, sub:'Awaiting answers'},
                {href: `/app/projects/${projectId}/submittals`, label:'Open Submittals', value:String(ctx.counts?.openSubmittals??0), sub:'In review'},
                {href: `/app/projects/${projectId}/punch-list`, label:'Open Punch', value:String(ctx.counts?.openPunch??0), accent:(Number(ctx.counts?.openPunch)||0)>0?'#FF3B30':undefined, sub:'Items to close'},
              ]}/>
            );
          })()}

          {/* Filters + Log */}
          <SectionCard
            title="Log Entries"
            icon={<ClipboardText size={17} weight="duotone" color={moduleAccent('daily').hex}/>}
            action={<span style={{fontSize:12,fontWeight:700,color:DIM,whiteSpace:'nowrap'}}>{filtered.length} of {logs.length}</span>}
            flush
          >
            {/* Toolbar */}
            <div style={{padding:'14px 16px'}}>
              <ListToolbar
                module="daily-logs"
                search={search}
                onSearch={setSearch}
                searchPlaceholder="Search logs by work, notes, or date…"
                filters={[
                  {key:'month',label:'Month',value:monthFilter,onChange:setMonthFilter,
                    allValue:'',allLabel:'All Months',options:months},
                ]}
                count={{shown:filtered.length,total:logs.length}}
              />
            </div>

            {loading&&<div style={{padding:40,textAlign:'center',color:DIM}}>Loading logs…</div>}

            {!loading&&loadError&&(
              <div style={{margin:'0 16px 14px',background:'rgba(192,48,48,.12)',border:'1px solid rgba(192,48,48,.3)',borderRadius:8,padding:'12px 16px',color:'#FF3B30',fontSize:13}}>
                {loadError}
              </div>
            )}

            {!loading&&filtered.length===0&&(
              <div style={{padding:'8px 8px 20px'}}>
                <PremiumEmpty
                  icon={<Clipboard size={30} weight="duotone" color={GOLD}/>}
                  title={logs.length===0?'No Daily Logs Yet':'No Logs Match Your Filters'}
                  description={logs.length===0
                    ?'Start documenting your daily field activity.'
                    :'Try adjusting your search or month filter.'}
                  action={logs.length===0?(
                    <button onClick={openCreate} style={goldButtonStyle} className="pmBtn">
                      <Plus size={15} weight="bold"/> Create First Log
                    </button>
                  ):undefined}
                />
              </div>
            )}

            {/* Log list */}
            {!loading&&filtered.length>0&&(
              <div style={{display:'flex',flexDirection:'column',gap:10,padding:'4px 16px 16px',borderTop:`1px solid rgba(255,255,255,0.06)`}}>
                {filtered.map((log:any)=>{
                  const isSel = selected?.id===log.id && mode==='view';
                  return (
                    <div key={log.id} onClick={()=>viewLog(log)}
                      style={{background:isSel?'var(--brand-primary-08)':RAISED,
                        border:`1px solid ${isSel?GOLD:BORDER}`,borderRadius:10,
                        padding:'14px 18px',cursor:'pointer',transition:'all .15s'}}
                      onMouseEnter={e=>{if(!isSel)e.currentTarget.style.borderColor='color-mix(in srgb, var(--brand-primary) 40%, transparent)';}}
                      onMouseLeave={e=>{if(!isSel)e.currentTarget.style.borderColor=BORDER;}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                        <div>
                          <div style={{fontWeight:800,fontSize:15,color:TEXT}}>
                            {new Date(log.log_date+'T12:00:00').toLocaleDateString('en-US',
                              {weekday:'short',month:'short',day:'numeric',year:'numeric'})}
                          </div>
                          <div style={{fontSize:12,color:DIM,marginTop:3,display:'flex',gap:12,flexWrap:'wrap'}}>
                            {log.weather&&<span>{log.weather}</span>}
                            {(log.high_temp||log.low_temp)&&
                              <span><Thermometer size={14} weight="fill" color={DIM} style={{verticalAlign:'middle'}}/> {log.high_temp??'?'}° / {log.low_temp??'?'}°F</span>}
                            {log.crew_count?<span><HardHat size={14} weight="fill" color={DIM} style={{verticalAlign:'middle'}}/> {log.crew_count} crew</span>:null}
                          </div>
                        </div>
                        <div style={{display:'flex',gap:6,flexShrink:0}}>
                          {log.delays?.trim()&&(
                            <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:4,
                              background:'rgba(192,48,48,.15)',color:'#FF3B30',letterSpacing:.3}}>
                              Delays
                            </span>
                          )}
                          {log.safety_notes?.trim()&&(
                            <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:4,
                              background:'color-mix(in srgb, var(--brand-primary) 15%, transparent)',color:GOLD,letterSpacing:.3}}>
                              Safety
                            </span>
                          )}
                        </div>
                      </div>
                      {log.work_performed&&(
                        <div style={{marginTop:8,fontSize:13,color:DIM,lineHeight:1.4,
                          overflow:'hidden',display:'-webkit-box',
                          WebkitLineClamp:2,WebkitBoxOrient:'vertical' as any}}>
                          {log.work_performed}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </PremiumSurface>
      </div>

      {/* Side panel */}
      {panelOpen&&(
        <div style={{width:480,borderLeft:`1px solid ${BORDER}`,background:DARK,
          overflow:'auto',flexShrink:0,display:'flex',flexDirection:'column'}}>
          {/* Panel header */}
          <div style={{padding:'16px 20px',borderBottom:`1px solid ${BORDER}`,
            display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontWeight:800,fontSize:15,color:TEXT}}>
              {mode==='create'?'New Daily Log':mode==='edit'?'Edit Log':'Log Detail'}
            </div>
            <div style={{display:'flex',gap:8}}>
              {mode==='view'&&selected&&(
                <>
                  <button onClick={()=>openEdit(selected)}
                    style={{padding:'6px 14px',background:'var(--brand-primary-12)',
                      border:'1px solid var(--brand-primary-25)',borderRadius:6,
                      color:'var(--brand-primary-strong)',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    Edit
                  </button>
                  <button onClick={()=>deleteLog(selected)} disabled={deleting}
                    style={{padding:'6px 14px',background:'rgba(192,48,48,.1)',
                      border:`1px solid ${RED}44`,borderRadius:6,
                      color:RED,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    {deleting?'…':'Delete'}
                  </button>
                </>
              )}
              <button onClick={closePanel}
                style={{padding:'6px 10px',background:'rgba(143,163,192,.1)',
                  border:`1px solid ${BORDER}`,borderRadius:6,color:DIM,fontSize:12,cursor:'pointer'}}>
                <X size={14} weight="bold" color={DIM}/>
              </button>
            </div>
          </div>

          <div style={{flex:1,overflow:'auto',padding:20}}>
            {(mode==='create'||mode==='edit')?(
              /* FORM */
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                {mode==='create' && (()=>{
                  const lastLog = ctx?.recent?.lastDailyLogDate || logs[0]?.log_date || null;
                  const gap = lastLog ? missedWorkdays(lastLog, new Date().toISOString().split('T')[0]) : 0;
                  const prev = logs[0];
                  return (
                    <div style={{background:gap>0?'rgba(192,48,48,.07)':RAISED,
                      border:`1px solid ${gap>0?'rgba(192,48,48,.3)':BORDER}`,borderRadius:10,padding:'12px 14px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12.5,fontWeight:700,color:gap>0?'#FF3B30':TEXT}}>
                        {gap>0 && <WarningCircle size={16} weight="fill" color="#FF3B30"/>}
                        {lastLog
                          ? gap>0
                            ? `Gap in the record — last log ${fmtDay(lastLog)}, ${gap} workday${gap===1?'':'s'} unlogged.`
                            : `Last log: ${fmtDay(lastLog)} — record is current.`
                          : 'First daily log on this project — it starts the field record.'}
                      </div>
                      {prev && (
                        <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid rgba(255,255,255,0.08)`}}>
                          <InsightRow label="Prev Crew" value={`${prev.crew_count||0} on site`}/>
                          {prev.weather ? <InsightRow label="Prev Weather" value={`${prev.weather}${prev.high_temp!=null?` · ${prev.high_temp}°/${prev.low_temp??'—'}°F`:''}`}/> : null}
                          {prev.superintendent ? <InsightRow label="Prev Super" value={prev.superintendent}/> : null}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <Field label={<>Log Date{mode==='create'&&auto.date&&<AutoChip/>}</>}
                  hint={mode==='create'?'Defaulted to today — backfill any missed day.':undefined}>
                  <SaguaroDatePicker value={form.log_date}
                    onChange={v=>setForm(f=>({...f,log_date:v}))}
                    style={inp}/>
                </Field>

                <Field label="Superintendent"
                  hint={mode==='create'&&logs[0]?.superintendent?`Last log: ${logs[0].superintendent}.`:undefined}>
                  <input value={form.superintendent}
                    onChange={e=>setForm(f=>({...f,superintendent:e.target.value}))}
                    style={inp} placeholder="Who ran the site today"/>
                </Field>

                {/* NOBODY TYPES WEATHER — the create route stamps NWS server-side
                    whenever the fields are left blank. Say so, visibly. */}
                {mode==='create'&&(
                  <div style={{display:'flex',gap:10,alignItems:'flex-start',
                    background:'var(--brand-primary-08)',border:'1px solid var(--brand-primary-25)',
                    borderRadius:9,padding:'11px 13px'}}>
                    <CloudSun size={18} weight="fill" color={GOLD} style={{flexShrink:0,marginTop:1}}/>
                    <div style={{fontSize:12.5,color:TEXT,lineHeight:1.55}}>
                      <b>Weather stamps itself.</b> Leave the weather fields blank — conditions,
                      temps, wind and precipitation auto-stamp from the National Weather Service
                      when you save.
                    </div>
                  </div>
                )}

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                  <Field label="Weather">
                    <Suggest value={form.weather}
                      onChange={e=>setForm(f=>({...f,weather:e.target.value}))}
                      style={inp} placeholder={mode==='create'?'Auto (NWS)':'Clear, 10 mph W, dusty…'} options={['w']} />
                    </Field>
                  <Field label="High °F">
                    <input type="number" value={form.high_temp}
                      onChange={e=>setForm(f=>({...f,high_temp:e.target.value}))}
                      style={inp} placeholder={mode==='create'?'Auto':'95'}/>
                  </Field>
                  <Field label="Low °F">
                    <input type="number" value={form.low_temp}
                      onChange={e=>setForm(f=>({...f,low_temp:e.target.value}))}
                      style={inp} placeholder={mode==='create'?'Auto':'72'}/>
                  </Field>
                </div>

                <Field label={<>Crew Count{mode==='create'&&auto.crew&&<AutoChip/>}</>}
                  hint={mode==='create'&&auto.crew
                    ?'Counted from clock-ins (web + mobile) or carried from your last log — adjust for today.'
                    :undefined}>
                  <input type="number" value={form.crew_count}
                    onChange={e=>setForm(f=>({...f,crew_count:e.target.value}))}
                    style={inp} placeholder="0" min={0}/>
                </Field>

                <Field
                  label={<><UsersThree size={13} weight="fill" color={moduleAccent('daily').hex} style={{verticalAlign:'-2px',marginRight:5}}/>Manpower by Trade{mode==='create'&&auto.manpower&&<AutoChip/>}</>}
                  hint={auto.manpower
                    ?'Pulled from your active crews and rosters. When lines are present, their total becomes the saved crew count.'
                    :'Break the headcount down by trade. When lines are present, their total becomes the saved crew count.'}>
                  <ManpowerEditor rows={form.manpower_by_trade||[]}
                    onChange={v=>setForm(f=>({...f,manpower_by_trade:v}))}/>
                </Field>

                <Field label={<>Subcontractors On Site{mode==='create'&&auto.subs&&<AutoChip/>}</>}
                  hint={auto.subs?'Companies from the project team — remove any that were not on site today.':undefined}>
                  <ChipEditor items={form.subcontractors_on_site||[]}
                    onChange={v=>setForm(f=>({...f,subcontractors_on_site:v}))}
                    placeholder="Add a subcontractor…"/>
                </Field>

                <Field label="Equipment On Site">
                  <ChipEditor items={form.equipment_on_site||[]}
                    onChange={v=>setForm(f=>({...f,equipment_on_site:v}))}
                    placeholder="Add equipment (excavator, crane, lifts…)"/>
                </Field>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <Field label={<>Phase of Work{mode==='create'&&auto.carry&&!!form.phase_of_work&&<AutoChip label="Carried"/>}</>}>
                    <input value={form.phase_of_work}
                      onChange={e=>setForm(f=>({...f,phase_of_work:e.target.value}))}
                      style={inp} placeholder="Foundations, framing, MEP rough-in…"/>
                  </Field>
                  <Field label={<>Equipment Notes{mode==='create'&&auto.carry&&!!form.equipment&&<AutoChip label="Carried"/>}</>}>
                    <input value={form.equipment}
                      onChange={e=>setForm(f=>({...f,equipment:e.target.value}))}
                      style={inp} placeholder="Hours, downtime, rentals…"/>
                  </Field>
                </div>

                <Field label="Work Performed">
                  <textarea value={form.work_performed}
                    onChange={e=>setForm(f=>({...f,work_performed:e.target.value}))}
                    rows={4} style={{...inp,resize:'vertical',lineHeight:1.5}}
                    placeholder="Describe work completed today…"/>
                </Field>

                <Field label="Delays / Issues">
                  <textarea value={form.delays}
                    onChange={e=>setForm(f=>({...f,delays:e.target.value}))}
                    rows={2} style={{...inp,resize:'vertical',lineHeight:1.5}}
                    placeholder="Any delays, blockers, or issues encountered…"/>
                </Field>

                <Field label="Safety Notes">
                  <textarea value={form.safety_notes}
                    onChange={e=>setForm(f=>({...f,safety_notes:e.target.value}))}
                    rows={2} style={{...inp,resize:'vertical',lineHeight:1.5}}
                    placeholder="Safety observations, incidents, toolbox talks…"/>
                </Field>

                <Field label="Materials Delivered">
                  <textarea value={form.materials_delivered}
                    onChange={e=>setForm(f=>({...f,materials_delivered:e.target.value}))}
                    rows={2} style={{...inp,resize:'vertical',lineHeight:1.5}}
                    placeholder="List materials received on site…"/>
                </Field>

                <Field label="Visitors / Inspections">
                  <input value={form.visitors}
                    onChange={e=>setForm(f=>({...f,visitors:e.target.value}))}
                    style={inp} placeholder="Inspector, owner rep, architect…"/>
                </Field>

                <Field label="General Notes">
                  <textarea value={form.notes}
                    onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                    rows={3} style={{...inp,resize:'vertical',lineHeight:1.5}}
                    placeholder="Any other notes…"/>
                </Field>

                <div style={{display:'flex',gap:10,paddingTop:4}}>
                  <button onClick={save} disabled={saving}
                    style={{flex:1,padding:'11px 0',
                      background:`linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`,
                      border:'none',borderRadius:8,color:'#0A0A00',
                      fontSize:14,fontWeight:800,cursor:'pointer',opacity:saving?.6:1}}>
                    {saving?'Saving…':mode==='create'?'Create Log':'Save Changes'}
                  </button>
                  <button onClick={closePanel}
                    style={{padding:'11px 16px',background:'rgba(143,163,192,.1)',
                      border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,
                      fontSize:14,cursor:'pointer'}}>
                    Cancel
                  </button>
                </div>
              </div>
            ):selected?(
              /* VIEW */
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:16}}>
                  <div style={{fontSize:18,fontWeight:800,color:TEXT,marginBottom:6}}>
                    {new Date(selected.log_date+'T12:00:00').toLocaleDateString('en-US',
                      {weekday:'long',month:'long',day:'numeric',year:'numeric'})}
                  </div>
                  <div style={{display:'flex',gap:16,fontSize:13,color:DIM,flexWrap:'wrap'}}>
                    {selected.weather&&<span>{selected.weather}</span>}
                    {(selected.high_temp||selected.low_temp)&&(
                      <span><Thermometer size={15} weight="fill" color={DIM} style={{verticalAlign:'middle'}}/> {selected.high_temp??'?'}° / {selected.low_temp??'?'}°F</span>
                    )}
                    {selected.crew_count&&<span><HardHat size={15} weight="fill" color={DIM} style={{verticalAlign:'middle'}}/> {selected.crew_count} crew members</span>}
                    {selected.superintendent&&<span>Super: {selected.superintendent}</span>}
                  </div>
                </div>
                {Array.isArray(selected.manpower_by_trade)&&selected.manpower_by_trade.length>0&&(
                  <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM, marginBottom:8}}>
                      Manpower by Trade
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {selected.manpower_by_trade.map((m:any,i:number)=>(
                        <span key={i} style={{display:'inline-flex',alignItems:'center',gap:7,padding:'5px 11px',
                          background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.13)',
                          borderRadius:999,fontSize:12.5,color:DIM,fontWeight:600}}>
                          {m.trade}
                          <span style={{fontWeight:800,color:TEXT}}>{Number(m.count)||0}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(selected.subcontractors_on_site)&&selected.subcontractors_on_site.length>0&&(
                  <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM, marginBottom:8}}>
                      Subcontractors On Site
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {selected.subcontractors_on_site.map((s:string,i:number)=>(
                        <span key={i} style={{padding:'5px 11px',background:'rgba(255,255,255,0.06)',
                          border:'1px solid rgba(255,255,255,0.13)',borderRadius:999,fontSize:12.5,color:TEXT,fontWeight:600}}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(selected.equipment_on_site)&&selected.equipment_on_site.length>0&&(
                  <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM, marginBottom:8}}>
                      Equipment On Site
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {selected.equipment_on_site.map((s:string,i:number)=>(
                        <span key={i} style={{padding:'5px 11px',background:'rgba(255,255,255,0.06)',
                          border:'1px solid rgba(255,255,255,0.13)',borderRadius:999,fontSize:12.5,color:TEXT,fontWeight:600}}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <Section label="Work Performed" value={selected.work_performed}/>
                <Section label="Delays / Issues" value={selected.delays} warn={!!selected.delays?.trim()}/>
                <Section label="Safety Notes" value={selected.safety_notes}/>
                <Section label="Materials Delivered" value={selected.materials_delivered}/>
                {selected.phase_of_work&&<Section label="Phase of Work" value={selected.phase_of_work}/>}
                {selected.equipment&&<Section label="Equipment Notes" value={selected.equipment}/>}
                {selected.visitors&&<Section label="Visitors / Inspections" value={selected.visitors}/>}
                {selected.notes&&<Section label="General Notes" value={selected.notes}/>}
              </div>
            ):null}
          </div>
        </div>
      )}
      <UnsavedGuardModal guard={guard} />
    </div>
  );
}
