'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { SUB_TRADES } from '@/lib/construction-intelligence';
import { CheckCircle, Check, MapPin, CalendarBlank, User, X, ArrowUUpLeft, Plus, WarningCircle, FolderOpen, CircleHalf, ListChecks, Camera } from '@phosphor-icons/react';
import {
  PremiumSurface,
  ModuleHero,
  SectionCard,
  StatCard,
  PremiumEmpty,
  goldButtonStyle,
  ghostButtonStyle,
  goldOutlineButtonStyle,
  StatStrip,
  FlowSteps,
  AutoChip,
  IconChip,
} from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { moduleAccent } from '@/lib/module-identity';
import RadioEvidence, {
  RadioEvidenceChip,
  radioEvidenceFromRecord,
  stripRadioProvenance,
} from '@/components/RadioEvidence';

const GOLD='#F59E0B',DARK='#0a0a0a',RAISED='#141416',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF';
const GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A',BLUE='#F59E0B';

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
const STATUSES=['open','in_progress','completed','voided'];
const TRADES=SUB_TRADES; // canonical taxonomy — do not hardcode partial trade lists
const PRIORITY_COLORS:Record<string,string>={critical:RED,high:ORANGE,medium:GOLD,low:GREEN};
const STATUS_COLORS:Record<string,string>={open:'#FBBF24',in_progress:GOLD,completed:GREEN,voided:DIM};
const STATUS_LABELS:Record<string,string>={open:'Open',in_progress:'In Progress',completed:'Completed',voided:'Voided'};

const inp:React.CSSProperties={
  width:'100%',padding:'9px 12px',background:'#1c1c1e',
  border:'1px solid rgba(255,255,255,0.12)',borderRadius:7,color:'#FFFFFF',
  fontSize:13,outline:'none',boxSizing:'border-box',
};
const EMPTY:Record<string,any>={
  title:'',description:'',location:'',trade:'General Contractor',
  priority:'medium',status:'open',due_date:'',assigned_to:'',notes:'',
};

function Pill({label,color}:{label:string;color:string}){
  return(
    <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:20,
      background:`${color}22`,color,textTransform:'uppercase',letterSpacing:.3}}>
      {label}
    </span>
  );
}
function Field({label,children}:{label:React.ReactNode;children:React.ReactNode}){
  return(
    <div>
      <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,
        textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>{label}</label>
      {children}
    </div>
  );
}

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
  const [toast,setToast]=useState<{msg:string;type:'success'|'error'}|null>(null);
  const [search,setSearch]=useState('');
  const [filterStatus,setFilterStatus]=useState('all');
  const [filterPriority,setFilterPriority]=useState('all');
  const [filterTrade,setFilterTrade]=useState('all');
  // Project intelligence — sub roster + smart defaults for the create drawer.
  const { ctx } = useProjectContext(projectId);
  const [autoDue,setAutoDue]=useState(false);
  const [autoAssign,setAutoAssign]=useState(false);
  const [assignOther,setAssignOther]=useState(false);

  const showToast=(msg:string,type:'success'|'error'='success')=>{
    setToast({msg,type}); setTimeout(()=>setToast(null),4000);
  };

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch(`/api/punch-list/list?projectId=${projectId}`,{headers:h});
      if (!r.ok) throw new Error('Failed to load data');
      const d=await r.json();
      setItems(d.items||[]);
    }catch{setItems([]);setLoadError('Failed to load. Please try again.');}
    finally{setLoading(false);}
  },[projectId]);

  // Background revalidate — reconciles server truth after an optimistic write
  // without flipping the list back into its loading state.
  const revalidate=useCallback(async()=>{
    try{
      const h=await getAuthHeaders();
      const r=await fetch(`/api/punch-list/list?projectId=${projectId}`,{headers:h});
      if(!r.ok) return;
      const d=await r.json();
      setItems(d.items||[]);
    }catch{/* background refresh — keep the optimistic rows */}
  },[projectId]);

  useEffect(()=>{load();},[load]);

  function openCreate(){
    // Due date walks in at +7 days — the standard punch turnaround. Editable.
    const d=new Date(Date.now()+7*86400000);
    const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setForm({...EMPTY,due_date:iso});
    setAutoDue(true);setAutoAssign(false);setAssignOther(false);
    setMode('create');setSelected(null);
  }
  function openEdit(item:any){
    setAutoDue(false);setAutoAssign(false);setAssignOther(false);
    setForm({title:item.title||'',description:item.description||'',location:item.location||'',
      trade:item.trade||'General Contractor',priority:prKey(item.priority),
      status:item.status||'open',due_date:item.due_date||'',
      assigned_to:item.assigned_to||'',notes:item.notes||''});
    setSelected(item);setMode('edit');
  }
  function viewItem(item:any){setSelected(item);setMode('view');}
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

  /** User-initiated drawer closes (backdrop / X / Cancel) run through the guard. */
  function requestClosePanel(){ guard.requestClose(closePanel); }

  /** Create/update the item — shared by the drawer button and the guard's
   *  "Save & leave". Returns true on success (optimistic close, then network). */
  async function save(): Promise<boolean>{
    if(!String(form.title||'').trim()){showToast('Title is required','error');return false;}
    // Optimistic save (house pattern: budget saveEdit) — the list updates and
    // the panel closes instantly; the network settles in the background.
    const snapshot={...form};
    const prevMode=mode,prevSelected=selected;
    setSaving(true);
    try{
      const h=await getAuthHeaders();
      if(mode==='create'){
        const tempId=`temp-${Date.now()}`;
        setItems(prev=>[{id:tempId,...snapshot,project_id:projectId},...prev]);
        closePanel();
        showToast('Item added');
        const r=await fetch('/api/punch-list/create',{
          method:'POST',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify({...form,projectId}),
        });
        if(!r.ok){setItems(prev=>prev.filter((i:any)=>i.id!==tempId));throw new Error(await r.text());}
        const d=await r.json();
        if(d.item) setItems(prev=>prev.map((i:any)=>i.id===tempId?d.item:i));
        guard.clearDraft();
        revalidate();
      }else if(mode==='edit'&&selected){
        const prevItem=selected;
        setItems(prev=>prev.map((i:any)=>i.id===prevItem.id?{...i,...snapshot}:i));
        closePanel();
        showToast('Item updated');
        const r=await fetch(`/api/punch-list/${prevItem.id}`,{
          method:'PUT',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify(form),
        });
        if(!r.ok){setItems(prev=>prev.map((i:any)=>i.id===prevItem.id?prevItem:i));throw new Error(await r.text());}
        revalidate();
      }
      return true;
    }catch(e:any){
      console.error(e);showToast(humanError(e,'Save failed. Please try again.'),'error');
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
      const h=await getAuthHeaders();
      const tr=await fetch(`/api/punch-list/${item.id}`,{
        method:'PUT',
        headers:{...h,'Content-Type':'application/json'},
        body:JSON.stringify({status:newStatus}),
      });
      if (!tr.ok) throw new Error('Update failed');
      revalidate();
    }catch(e:any){
      setItems(prev=>prev.map((i:any)=>i.id===item.id?{...i,status:prevStatus}:i));
      setSelected((s:any)=>s?.id===item.id?{...s,status:prevStatus}:s);
      console.error(e);showToast(humanError(e,'Something went wrong. Please try again.'),'error');
    }
  }

  async function deleteItem(item:any){
    if(!confirm(`Delete "${item.title||item.description}"?`)) return;
    // Optimistic remove — the row leaves and the panel closes instantly;
    // rollback restores the exact list on failure.
    const prevItems=items;
    setItems(prev=>prev.filter((i:any)=>i.id!==item.id));
    showToast('Item deleted');closePanel();
    setDeleting(true);
    try{
      const h=await getAuthHeaders();
      const dr=await fetch(`/api/punch-list/${item.id}`,{method:'DELETE',headers:h});
      if (!dr.ok) throw new Error('Delete failed');
      revalidate();
    }catch{setItems(prevItems);showToast('Delete failed','error');}
    finally{setDeleting(false);}
  }

  const trades=Array.from(new Set(items.map((i:any)=>i.trade).filter(Boolean)));
  const filtered=items.filter((i:any)=>{
    const ms=!search||(i.title||'').toLowerCase().includes(search.toLowerCase())
      ||(i.description||'').toLowerCase().includes(search.toLowerCase())
      ||(i.location||'').toLowerCase().includes(search.toLowerCase());
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
  const pct=items.length>0?Math.round((done/items.length)*100):0;

  // Radio provenance on the open item. `selectedNotes` is the DISPLAY copy with
  // the provenance block lifted out — the evidence card states those facts far
  // better — while `selected.notes` (and the edit form) keep the stored block.
  const selectedRadio=selected?radioEvidenceFromRecord(selected):null;
  const selectedNotes=selectedRadio?stripRadioProvenance(selected?.notes):(selected?.notes||'');

  return(
    <>
      <style>{`@keyframes punchDrawerIn{from{transform:translateX(28px);opacity:.5}to{transform:translateX(0);opacity:1}}`}</style>

      {toast&&(
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:99999,
          padding:'12px 20px',borderRadius:8,color:'#fff',fontWeight:700,fontSize:14,pointerEvents:'none',
          background:toast.type==='success'?'rgba(26,138,74,.92)':'rgba(192,48,48,.92)'}}>
          {toast.msg}
        </div>
      )}

      <PremiumSurface maxWidth={1600}>
        {/* Header */}
        <ModuleHero
          eyebrow="Project Closeout"
          eyebrowIcon={<IconChip size={24} vivid={moduleAccent('punch').vivid ?? moduleAccent('punch').hex}><ListChecks size={13} weight="fill" color="#F8FAFC"/></IconChip>}
          accentColor={moduleAccent('punch').hex}
          title="Punch"
          accent="List"
          subtitle="Deficiencies and closeout items, tracked to completion."
          actions={
            <button onClick={openCreate} style={goldButtonStyle} className="pmBtn">
              <Plus size={15} weight="bold"/> Add Item
            </button>
          }
        />

        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:22}}>
          <StatCard icon={<FolderOpen size={19} weight="duotone" color={moduleAccent('punch').hex}/>} label="Open" value={String(openCount)} accent="#FBBF24" delay={0.02}/>
          <StatCard icon={<CircleHalf size={19} weight="duotone" color={moduleAccent('punch').hex}/>} label="In Progress" value={String(inProg)} accent={GOLD} delay={0.06}/>
          <StatCard icon={<CheckCircle size={19} weight="duotone" color={GREEN}/>} label="Completed" value={String(done)} accent={GREEN} delay={0.10}/>
          <StatCard icon={<WarningCircle size={19} weight="duotone" color={crit>0?RED:'rgba(255,255,255,0.42)'}/>} label="Critical Open" value={String(crit)} accent={crit>0?RED:undefined} sub={crit>0?'Needs attention':undefined} delay={0.14}/>
        </div>

        {/* Completion bar */}
        {items.length>0&&(
          <div style={{marginBottom:22}}>
            <SectionCard flat
              title="Overall Completion"
              icon={<CheckCircle size={17} weight="duotone" color={GOLD}/>}
              action={<span style={{fontSize:13,fontWeight:800,color:TEXT,fontVariantNumeric:'tabular-nums'}}>{pct}%</span>}
            >
              <div style={{background:'rgba(255,255,255,0.08)',borderRadius:5,height:8,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:5,
                  background:`linear-gradient(90deg,${GREEN},#3dd68c)`,
                  width:`${pct}%`,transition:'width .4s'}}/>
              </div>
              <div style={{fontSize:12,color:DIM,marginTop:8}}>{done} of {items.length} items complete</div>
            </SectionCard>
          </div>
        )}

        {/* Toolbar */}
        <ListToolbar
          module="punch-list"
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search items by description or location…"
          filters={[
            {key:'status',label:'Status',value:filterStatus,onChange:setFilterStatus,allLabel:'All Statuses',
              options:STATUSES.map(s=>({value:s,label:STATUS_LABELS[s]}))},
            {key:'priority',label:'Priority',value:filterPriority,onChange:setFilterPriority,allLabel:'All Priorities',
              options:PRIORITIES.map(p=>({value:p.value,label:p.label}))},
            {key:'trade',label:'Trade',value:filterTrade,onChange:setFilterTrade,allLabel:'All Trades',
              options:trades as string[]},
          ]}
          count={{shown:filtered.length,total:items.length}}
          style={{marginBottom:16}}
        />

        {/* List */}
        <SectionCard
          title="Punch Items"
          icon={<ListChecks size={17} weight="duotone" color={moduleAccent('punch').hex}/>}
          flush
          action={!loading&&!loadError?(
            <span style={{fontSize:12,color:'rgba(255,255,255,0.42)',fontVariantNumeric:'tabular-nums'}}>
              {filtered.length} of {items.length}
            </span>
          ):undefined}
        >
          {loading&&<div style={{padding:40,textAlign:'center',color:DIM}}>Loading punch list…</div>}

          {!loading&&loadError&&(
            <PremiumEmpty
              tone="error"
              icon={<WarningCircle size={32} weight="duotone" color={RED}/>}
              title="Couldn't load the punch list"
              description={loadError}
              action={<button onClick={load} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
            />
          )}

          {!loading&&!loadError&&filtered.length===0&&(
            <PremiumEmpty
              icon={<CheckCircle size={32} weight="duotone" color={GOLD}/>}
              title={items.length===0?'Punch list is empty':'No items match your filters'}
              description={items.length===0?'Add deficiencies and correction items to track closeout.':'Try adjusting your search or filters.'}
              action={items.length===0?(
                <button onClick={openCreate} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold"/> Add First Item</button>
              ):undefined}
            />
          )}

          {!loading&&!loadError&&filtered.length>0&&(
            <div style={{display:'flex',flexDirection:'column',gap:8,padding:16}}>
              {filtered.map((item:any)=>{
                const isSel=selected?.id===item.id&&mode==='view';
                const isDone=item.status==='completed';
                // Filed from a radio transmission? punch_list has no jsonb
                // column, so the provenance rides as the readable block in
                // `notes` — which the list route returns in full.
                const radio=radioEvidenceFromRecord(item);
                return(
                  <div key={item.id}
                    style={{background:isSel?'rgba(245, 158, 11,.07)':RAISED,
                      border:`1px solid ${isSel?GOLD:BORDER}`,borderRadius:10,
                      padding:'12px 16px',cursor:'pointer',transition:'all .15s',
                      opacity:isDone?.75:1}}
                    onMouseEnter={e=>{if(!isSel)e.currentTarget.style.borderColor='rgba(245, 158, 11,.4)';}}
                    onMouseLeave={e=>{if(!isSel)e.currentTarget.style.borderColor=BORDER;}}
                    onClick={()=>viewItem(item)}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      {/* Checkbox */}
                      <div onClick={e=>{e.stopPropagation();toggleComplete(item);}}
                        style={{width:20,height:20,borderRadius:5,flexShrink:0,cursor:'pointer',
                          border:`2px solid ${isDone?GREEN:BORDER}`,
                          background:isDone?GREEN:'transparent',
                          display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}}>
                        {isDone&&<Check size={13} weight="bold" color="#fff"/>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <span style={{fontWeight:700,fontSize:14,color:isDone?DIM:TEXT,
                            textDecoration:isDone?'line-through':'none'}}>
                            {item.title||item.description}
                          </span>
                          <Pill label={prLabel(item.priority)} color={PRIORITY_COLORS[prKey(item.priority)]||GOLD}/>
                          <Pill label={STATUS_LABELS[item.status]||item.status} color={STATUS_COLORS[item.status]||DIM}/>
                          {radio&&<RadioEvidenceChip durationSecs={radio.audio_duration_secs}/>}
                        </div>
                        <div style={{fontSize:12,color:DIM,marginTop:3,display:'flex',gap:12,flexWrap:'wrap'}}>
                          {item.trade&&<span>{item.trade}</span>}
                          {item.location&&<span style={{display:'inline-flex',alignItems:'center',gap:4}}><MapPin size={12} weight="regular" color={DIM}/>{item.location}</span>}
                          {item.due_date&&<span style={{display:'inline-flex',alignItems:'center',gap:4}}><CalendarBlank size={12} weight="regular" color={DIM}/>Due {new Date(item.due_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>}
                          {item.assigned_to&&<span style={{display:'inline-flex',alignItems:'center',gap:4}}><User size={12} weight="regular" color={DIM}/>{item.assigned_to}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </PremiumSurface>

      {/* Side panel — right drawer */}
      {mode!==null&&(
        <div onClick={e=>{if(e.target===e.currentTarget) requestClosePanel();}}
          style={{position:'fixed',inset:0,zIndex:400,background:'rgba(0,0,0,.45)',
            display:'flex',justifyContent:'flex-end'}}>
          <div style={{width:460,maxWidth:'100%',height:'100%',borderLeft:`1px solid ${BORDER}`,background:DARK,
            overflow:'auto',flexShrink:0,display:'flex',flexDirection:'column',
            boxShadow:'-24px 0 60px -30px rgba(0,0,0,0.8)',animation:'punchDrawerIn .22s ease'}}>
          <div style={{padding:'16px 20px',borderBottom:`1px solid ${BORDER}`,
            display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontWeight:800,fontSize:15,color:TEXT}}>
              {mode==='create'?'New Item':mode==='edit'?'Edit Item':'Item Detail'}
            </div>
            <div style={{display:'flex',gap:8}}>
              {mode==='view'&&selected&&(
                <>
                  <button onClick={()=>openEdit(selected)}
                    style={{padding:'6px 14px',background:'rgba(245,158,11,.1)',
                      border:`1px solid ${BLUE}44`,borderRadius:6,
                      color:'#FBBF24',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    Edit
                  </button>
                  <button onClick={()=>deleteItem(selected)} disabled={deleting}
                    style={{padding:'6px 14px',background:'rgba(192,48,48,.1)',
                      border:`1px solid ${RED}44`,borderRadius:6,
                      color:RED,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    {deleting?'…':'Delete'}
                  </button>
                </>
              )}
              <button onClick={requestClosePanel}
                style={{padding:'6px 10px',background:'rgba(143,163,192,.1)',
                  border:`1px solid ${BORDER}`,borderRadius:6,color:DIM,fontSize:12,cursor:'pointer'}}>
                <X size={12} weight="bold" color={DIM}/>
              </button>
            </div>
          </div>

          <div style={{flex:1,overflow:'auto',padding:20}}>
            {(mode==='create'||mode==='edit')?(
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                {mode==='create'&&items.length>0&&(
                  <div style={{marginBottom:-20}}>
                    <StatStrip items={[
                      {label:'Open',value:String(openCount),accent:'#FBBF24',sub:'on the list now'},
                      {label:'Critical',value:String(crit),accent:crit>0?RED:undefined,sub:crit>0?'need attention':'none open'},
                      {label:'Done',value:String(done),accent:GREEN,sub:`${pct}% complete`},
                    ]}/>
                  </div>
                )}
                <Field label="Title *">
                  <input value={form.title}
                    onChange={e=>setForm(f=>({...f,title:e.target.value}))}
                    style={inp} placeholder="Short name — e.g. Patch drywall at Rm 204 door…"/>
                </Field>
                <Field label="Description">
                  <textarea value={form.description}
                    onChange={e=>setForm(f=>({...f,description:e.target.value}))}
                    rows={3} style={{...inp,resize:'vertical',lineHeight:1.5}}
                    placeholder="Describe the deficiency or item to correct…"/>
                </Field>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <Field label="Priority">
                    <select value={form.priority}
                      onChange={e=>setForm(f=>({...f,priority:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      {PRIORITIES.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select value={form.status}
                      onChange={e=>setForm(f=>({...f,status:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Trade">
                  <select value={form.trade}
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
                    style={{...inp,padding:'9px 10px'}}>
                    {form.trade&&!TRADES.includes(form.trade)&&<option value={form.trade}>{form.trade}</option>}
                    {TRADES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Location">
                  <input value={form.location}
                    onChange={e=>setForm(f=>({...f,location:e.target.value}))}
                    style={inp} placeholder="Room 204, North wall…"/>
                </Field>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <Field label={<>Assigned To{autoAssign&&<AutoChip/>}</>}>
                    {assignOther?(
                      <input value={form.assigned_to} autoFocus
                        onChange={e=>setForm(f=>({...f,assigned_to:e.target.value}))}
                        style={inp} placeholder="Subcontractor or person"/>
                    ):(
                      <select value={form.assigned_to}
                        onChange={e=>{
                          if(e.target.value==='__other'){setAssignOther(true);setAutoAssign(false);setForm(f=>({...f,assigned_to:''}));return;}
                          setAutoAssign(false);setForm(f=>({...f,assigned_to:e.target.value}));
                        }}
                        style={{...inp,padding:'9px 10px'}}>
                        <option value="">Unassigned</option>
                        {form.assigned_to&&!(ctx?.subs||[]).some((s:any)=>s.companyName===form.assigned_to)&&<option value={form.assigned_to}>{form.assigned_to}</option>}
                        {(ctx?.subs||[]).map((s:any)=>(
                          <option key={s.membershipId||s.id} value={s.companyName}>{s.companyName}{s.trade?` — ${s.trade}`:''}</option>
                        ))}
                        <option value="__other">Other — type a name…</option>
                      </select>
                    )}
                    <div style={{fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:5,lineHeight:1.45}}>
                      {autoAssign?`Awarded ${form.trade} sub — change freely.`:(ctx?.subs?.length?`${ctx.subs.length} subs on the roster — pick or type anyone.`:'No subs awarded yet — type a name.')}
                    </div>
                  </Field>
                  <Field label={<>Due Date{autoDue&&mode==='create'&&<AutoChip/>}</>}>
                    <SaguaroDatePicker value={form.due_date}
                      onChange={v=>{setAutoDue(false);setForm(f=>({...f,due_date:v}));}}
                      style={inp}/>
                    {mode==='create'&&(
                      <div style={{fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:5,lineHeight:1.45}}>
                        Defaulted to +7 days — standard punch turnaround.
                      </div>
                    )}
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea value={form.notes}
                    onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                    rows={3} style={{...inp,resize:'vertical',lineHeight:1.5}}
                    placeholder="Additional notes, photos needed, etc…"/>
                  <div style={{display:'flex',alignItems:'flex-start',gap:6,fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:5,lineHeight:1.45}}>
                    <Camera size={13} color={GOLD} style={{flexShrink:0,marginTop:1}}/>
                    <span>Snap photos in Field Mode — documented deficiencies get corrected without a return trip.</span>
                  </div>
                </Field>
                <div style={{display:'flex',gap:10,paddingTop:4}}>
                  <button onClick={save} disabled={saving} className="pmBtn"
                    style={{...goldButtonStyle,flex:1,opacity:saving?.6:1,cursor:saving?'not-allowed':'pointer'}}>
                    {saving?'Saving…':mode==='create'?'Add Item':'Save Changes'}
                  </button>
                  <button onClick={requestClosePanel} style={ghostButtonStyle} className="pmBtn">
                    Cancel
                  </button>
                </div>
                {mode==='create'&&(
                  <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'14px 16px'}}>
                    <FlowSteps title="After you add" steps={[
                      {title:'Lands on the punch log',desc:'Counted against open items and overall completion instantly.'},
                      {title:'Assigned sub sees it in Field Mode',desc:form.assigned_to?`${form.assigned_to} gets it on their filtered field list.`:'Assign a sub and it shows on their filtered field list.'},
                      {title:'Check-off rolls up closeout',desc:'Completion climbs live — critical items surface first.'},
                    ]}/>
                  </div>
                )}
              </div>
            ):selected?(
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:16}}>
                  <div style={{fontSize:16,fontWeight:800,color:TEXT,marginBottom:10}}>
                    {selected.title||selected.description}
                  </div>
                  {selected.title&&selected.description&&(
                    <div style={{fontSize:13,color:DIM,lineHeight:1.55,marginBottom:10,whiteSpace:'pre-wrap'}}>
                      {selected.description}
                    </div>
                  )}
                  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
                    <Pill label={prLabel(selected.priority)} color={PRIORITY_COLORS[prKey(selected.priority)]||GOLD}/>
                    <Pill label={STATUS_LABELS[selected.status]||selected.status} color={STATUS_COLORS[selected.status]||DIM}/>
                  </div>
                  <button onClick={()=>toggleComplete(selected)}
                    style={{padding:'9px 0',width:'100%',
                      background:selected.status==='completed'
                        ?'rgba(245,158,11,.1)':'rgba(26,138,74,.1)',
                      border:`1px solid ${selected.status==='completed'?BLUE:GREEN}44`,
                      borderRadius:7,color:selected.status==='completed'?'#FBBF24':'#4ade80',
                      fontSize:13,fontWeight:700,cursor:'pointer'}}>
                    {selected.status==='completed'
                      ?<span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}><ArrowUUpLeft size={14} weight="bold" color="#FBBF24"/>Reopen Item</span>
                      :<span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}><CheckCircle size={14} weight="bold" color="#4ade80"/>Mark Complete</span>}
                  </button>
                </div>

                {/* The voice behind the item, when it was filed from the radio */}
                {selectedRadio&&<RadioEvidence source={selectedRadio} title="Voice on the record"/>}

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  {[
                    {l:'Trade',v:selected.trade},
                    {l:'Location',v:selected.location},
                    {l:'Assigned To',v:selected.assigned_to},
                    {l:'Due Date',v:selected.due_date?new Date(selected.due_date+'T12:00:00')
                      .toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):null},
                  ].filter(x=>x.v).map(x=>(
                    <div key={x.l} style={{background:'#141416',border:`1px solid ${BORDER}`,
                      borderRadius:8,padding:'10px 12px'}}>
                      <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',
                        letterSpacing:.5,marginBottom:4}}>{x.l}</div>
                      <div style={{fontSize:13,color:TEXT}}>{x.v}</div>
                    </div>
                  ))}
                </div>

                {selectedNotes&&(
                  <div style={{background:'#141416',border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',
                      letterSpacing:.5,marginBottom:6}}>Notes</div>
                    <div style={{fontSize:13,color:TEXT,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{selectedNotes}</div>
                  </div>
                )}

                {selected.completed_at&&(
                  <div style={{fontSize:12,color:GREEN,textAlign:'center'}}>
                    Completed {new Date(selected.completed_at).toLocaleDateString('en-US',
                      {month:'short',day:'numeric',year:'numeric'})}
                  </div>
                )}
              </div>
            ):null}
          </div>
          </div>
        </div>
      )}

      <UnsavedGuardModal guard={guard} />
    </>
  );
}
