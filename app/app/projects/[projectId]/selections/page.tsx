'use client';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { SUB_TRADES, SUB_TRADES_BY_DIVISION } from '@/lib/construction-intelligence';
import { Palette, X, Plus, Package, Hourglass, SealCheck, Scales, ChartBar, ListChecks, WarningCircle } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, FlowSteps, FlowStrip, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';

const GOLD='#F59E0B',DARK='#0a0a0a',RAISED='#141416',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF';
const GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A',BLUE='#F59E0B';

const CATEGORIES=['Flooring','Countertops','Cabinets','Plumbing Fixtures','Lighting',
  'Appliances','Tile','Paint','Hardware','Other'];
const STATUSES=['pending','selected','ordered','delivered','installed'];
const STATUS_COLORS:Record<string,string>={
  pending:ORANGE,selected:BLUE,ordered:GOLD,delivered:'#a78bfa',installed:GREEN,
};
const STATUS_LABELS:Record<string,string>={
  pending:'Pending',selected:'Selected',ordered:'Ordered',
  delivered:'Delivered',installed:'Installed',
};

const fmt=(n:number)=>'$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

const inp:React.CSSProperties={
  width:'100%',padding:'9px 12px',background:'#1c1c1e',
  border:'1px solid rgba(255,255,255,0.12)',borderRadius:7,color:'#FFFFFF',
  fontSize:13,outline:'none',boxSizing:'border-box',
};
const HINT:React.CSSProperties={fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:5,lineHeight:1.45};
const isoDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const EMPTY:Record<string,any>={
  category:'Flooring',item:'',manufacturer:'',model:'',color:'',finish:'',
  cost:'',allowance:'',status:'pending',selected_by:'',
  owner_approved:false,due_date:'',notes:'',link:'',
};

function Field({label,children,auto}:{label:string;children:React.ReactNode;auto?:boolean}){
  return(
    <div>
      <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,
        textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>{label}{auto&&<AutoChip/>}</label>
      {children}
    </div>
  );
}

function Pill({label,color}:{label:string;color:string}){
  return(
    <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:20,
      background:`${color}22`,color,textTransform:'uppercase',letterSpacing:.3}}>
      {label}
    </span>
  );
}

export default function SelectionsPage(){
  const {projectId}=useParams() as {projectId:string};
  const [items,setItems]=useState<any[]>([]);
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
    draftKey: `selections:${projectId}`,
    draftData: mode==='create'?form:undefined,
    restoreDraft: (d) => { setForm(d as Record<string,any>); setMode('create'); setSelected(null); },
    onSave: () => save(),
  });
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [toast,setToast]=useState<{msg:string;type:'success'|'error'}|null>(null);
  const [search,setSearch]=useState('');
  const [filterCat,setFilterCat]=useState('all');
  const [filterStatus,setFilterStatus]=useState('all');
  // SmartCreate: one-shot project snapshot — known vendors, owner, allowance money.
  const { ctx } = useProjectContext(projectId);
  const [auto,setAuto]=useState<{due?:boolean}>({});

  const showToast=(msg:string,type:'success'|'error'='success')=>{
    setToast({msg,type}); setTimeout(()=>setToast(null),4000);
  };

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch(`/api/selections/list?projectId=${projectId}`,{headers:h});
      if (!r.ok) throw new Error('Failed to load data');
      const d=await r.json();
      // The DB uses item_name / selected_amount; this page reads item / cost.
      // Alias them so a saved selection's name + cost render on reload (the rest
      // — manufacturer/model/color/finish/link/owner_approved — are real columns).
      setItems((d.selections||[]).map((s:any)=>({
        ...s,
        item: s.item ?? s.item_name ?? '',
        cost: Number(s.cost ?? s.selected_amount ?? 0),
        allowance: Number(s.allowance ?? 0),
      })));
    }catch{setItems([]);setLoadError('Failed to load. Please try again.');}
    finally{setLoading(false);}
  },[projectId]);

  useEffect(()=>{load();},[load]);

  // Dead-space kill (spec 4.1): an empty log auto-opens the create panel so
  // the SmartCreate composer — not a bare box — is the zero state. One-shot
  // per visit so Cancel stays cancelled.
  const autoOpenedRef=useRef(false);
  useEffect(()=>{
    if(!loading&&!loadError&&items.length===0&&mode===null&&!autoOpenedRef.current){
      autoOpenedRef.current=true;
      openCreate();
    }
  },[loading,loadError,items.length,mode]);

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
  function viewItem(item:any){setSelected(item);setMode('view');}
  function closePanel(){setSelected(null);setMode(null);}

  async function save(): Promise<boolean> {
    if(!form.item.trim()){showToast('Item name is required','error');return false;}
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
      if (!ar.ok) throw new Error('Approval failed');
      showToast('Owner approval recorded');await load();
    }catch(e:any){console.error(e);showToast(humanError(e,'Something went wrong. Please try again.'),'error');}
  }

  async function deleteItem(item:any){
    if(!confirm(`Delete "${item.item}"?`)) return;
    setDeleting(true);
    try{
      const h=await getAuthHeaders();
      const dr=await fetch(`/api/selections/${item.id}`,{method:'DELETE',headers:h});
      if (!dr.ok) throw new Error('Delete failed');
      showToast('Selection deleted');closePanel();await load();
    }catch{showToast('Delete failed','error');}
    finally{setDeleting(false);}
  }

  const cats=Array.from(new Set(items.map((i:any)=>i.category).filter(Boolean)));
  const filtered=items.filter((i:any)=>{
    const ms=!search||(i.item||'').toLowerCase().includes(search.toLowerCase())
      ||(i.manufacturer||'').toLowerCase().includes(search.toLowerCase());
    const mc=filterCat==='all'||i.category===filterCat;
    const mst=filterStatus==='all'||i.status===filterStatus;
    return ms&&mc&&mst;
  });

  const totalCost=items.reduce((s:number,i:any)=>s+(Number(i.cost)||0),0);
  const totalAllowance=items.reduce((s:number,i:any)=>s+(Number(i.allowance)||0),0);
  const pendingCount=items.filter((i:any)=>i.status==='pending').length;
  const approvedCount=items.filter((i:any)=>i.owner_approved).length;
  const overage=totalCost-totalAllowance;

  // Group by category for display
  const grouped: Record<string,any[]>={};
  for(const item of filtered){
    const cat=item.category||'Other';
    if(!grouped[cat]) grouped[cat]=[];
    grouped[cat].push(item);
  }

  return(
    <div style={{display:'flex',height:'100%',minHeight:0,position:'relative'}}>
      {toast&&(
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:99999,
          padding:'12px 20px',borderRadius:8,color:'#fff',fontWeight:700,fontSize:14,pointerEvents:'none',
          background:toast.type==='success'?'rgba(26,138,74,.92)':'rgba(192,48,48,.92)'}}>
          {toast.msg}
        </div>
      )}

      <div style={{flex:1,overflow:'auto',minWidth:0}}>
        <PremiumSurface maxWidth={1200}>

          {/* Header */}
          <ModuleHero
            eyebrow="SELECTIONS"
            eyebrowIcon={<Palette size={13} weight="fill" color={GOLD} />}
            title="Client"
            accent="Selections"
            subtitle="Materials, finishes & owner approvals"
            actions={
              <button onClick={openCreate} style={goldButtonStyle} className="pmBtn">
                <Plus size={15} weight="bold" /> Add Selection
              </button>
            }
          />

          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
            <StatCard icon={<Package size={19} weight="duotone" color={GOLD}/>}
              label="Total Items" value={String(items.length)} delay={0.02}/>
            <StatCard icon={<Hourglass size={19} weight="duotone" color={ORANGE}/>}
              label="Pending Decision" value={String(pendingCount)} accent={ORANGE} delay={0.06}/>
            <StatCard icon={<SealCheck size={19} weight="duotone" color={GREEN}/>}
              label="Owner Approved" value={String(approvedCount)} accent={GREEN} delay={0.10}/>
            <StatCard icon={<Scales size={19} weight="duotone" color={overage>0?RED:GREEN}/>}
              label={overage>0?'Over Allowance':'Under Allowance'}
              value={overage>=0?`+${fmt(overage)}`:fmt(overage)} accent={overage>0?RED:GREEN} delay={0.14}/>
          </div>

          {/* Budget bar */}
          {totalAllowance>0&&(
            <div style={{marginBottom:20}}>
              <SectionCard flat
                title="Budget vs Allowance"
                icon={<ChartBar size={17} weight="duotone" color={GOLD}/>}
                action={<span style={{fontSize:13,fontWeight:800,color:overage>0?RED:GREEN}}>
                  {fmt(totalCost)} / {fmt(totalAllowance)}
                </span>}
              >
                <div style={{background:'rgba(255,255,255,0.12)',borderRadius:4,height:8,overflow:'hidden'}}>
                  <div style={{height:'100%',borderRadius:4,
                    background:overage>0?`linear-gradient(90deg,${RED},#f87171)`:`linear-gradient(90deg,${GREEN},#3dd68c)`,
                    width:`${Math.min(100,totalAllowance>0?(totalCost/totalAllowance*100):0)}%`,transition:'width .4s'}}/>
                </div>
              </SectionCard>
            </div>
          )}

          {/* Selections list */}
          <SectionCard title="Selections" icon={<ListChecks size={17} weight="duotone" color={GOLD}/>}>
            {/* Toolbar */}
            <ListToolbar
              module="selections"
              search={search}
              onSearch={setSearch}
              searchPlaceholder="Search selections by item or manufacturer..."
              filters={[
                {key:'category',label:'Category',value:filterCat,onChange:setFilterCat,allLabel:'All Categories',
                  options:cats as string[]},
                {key:'status',label:'Status',value:filterStatus,onChange:setFilterStatus,allLabel:'All Statuses',
                  options:STATUSES.map(s=>({value:s,label:STATUS_LABELS[s]}))},
              ]}
              count={{shown:filtered.length,total:items.length}}
              style={{marginBottom:18}}
            />

            {loading&&<div style={{padding:40,textAlign:'center',color:DIM}}>Loading selections...</div>}

            {!loading&&loadError&&(
              <PremiumEmpty
                tone="error"
                icon={<WarningCircle size={30} weight="duotone" color={RED} />}
                title="Couldn't load selections"
                description={loadError}
                action={<button onClick={()=>load()} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
                compact
              />
            )}

            {!loading&&!loadError&&items.length===0&&(
              <div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:12}}>
                  <div style={{fontSize:13.5,fontWeight:800,color:TEXT}}>
                    <Palette size={16} weight="duotone" color={GOLD} style={{marginRight:7,verticalAlign:'text-bottom'}} />
                    No selections yet
                    <span style={{fontWeight:400,color:DIM}}>{mode==='create' ? ' — log the first one in the panel; the decision date is already defaulted.' : ' — track material selections, finishes, and owner approvals.'}</span>
                  </div>
                  {mode!=='create'&&(
                    <button onClick={openCreate} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Add Selection</button>
                  )}
                </div>
                <FlowStrip steps={[
                  {title:'Log the selection',desc:'price vs allowance tracked'},
                  {title:'Owner approves',desc:'recorded in one click'},
                  {title:'Order to install',desc:'status advances from the log'},
                  {title:'Variance rolls up',desc:'feeds the budget bar live'},
                ]} />
              </div>
            )}

            {/* Grouped by category */}
            {!loading&&filtered.length>0&&Object.entries(grouped).map(([cat,catItems])=>(
              <div key={cat} style={{marginBottom:24}}>
                <div style={{fontSize:12,fontWeight:800,color:GOLD,textTransform:'uppercase',
                  letterSpacing:.5,marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
                  {cat}
                  <span style={{fontSize:10,fontWeight:600,color:DIM,textTransform:'none',letterSpacing:0}}>
                    {catItems.length} item{catItems.length!==1?'s':''}
                  </span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {catItems.map((item:any)=>{
                    const isSel=selected?.id===item.id&&mode==='view';
                    const color=STATUS_COLORS[item.status]||DIM;
                    return(
                      <div key={item.id} onClick={()=>viewItem(item)}
                        style={{background:isSel?'rgba(245, 158, 11,.07)':RAISED,
                          border:`1px solid ${isSel?GOLD:BORDER}`,borderRadius:10,
                          padding:'12px 16px',cursor:'pointer',transition:'all .15s'}}
                        onMouseEnter={e=>{if(!isSel)e.currentTarget.style.borderColor='rgba(245, 158, 11,.4)';}}
                        onMouseLeave={e=>{if(!isSel)e.currentTarget.style.borderColor=BORDER;}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                              <span style={{fontWeight:700,fontSize:14,color:TEXT}}>{item.item}</span>
                              <Pill label={STATUS_LABELS[item.status]||item.status} color={color}/>
                              {item.owner_approved&&(
                                <Pill label="Owner Approved" color={GREEN}/>
                              )}
                            </div>
                            <div style={{fontSize:12,color:DIM,marginTop:3,display:'flex',gap:12,flexWrap:'wrap'}}>
                              {item.manufacturer&&<span>{item.manufacturer}</span>}
                              {item.model&&<span>{item.model}</span>}
                              {item.color&&<span>Color: {item.color}</span>}
                              {item.selected_by&&<span>by {item.selected_by}</span>}
                            </div>
                          </div>
                          <div style={{textAlign:'right',flexShrink:0}}>
                            {item.cost>0&&<div style={{fontWeight:800,fontSize:14,color:TEXT}}>{fmt(item.cost)}</div>}
                            {item.allowance>0&&<div style={{fontSize:11,color:DIM}}>Allow: {fmt(item.allowance)}</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </SectionCard>
        </PremiumSurface>
      </div>

      {/* Side panel */}
      {mode!==null&&(
        <div style={{width:480,borderLeft:`1px solid ${BORDER}`,background:DARK,
          overflow:'auto',flexShrink:0,display:'flex',flexDirection:'column'}}>
          <div style={{padding:'16px 20px',borderBottom:`1px solid ${BORDER}`,
            display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontWeight:800,fontSize:15,color:TEXT}}>
              {mode==='create'?'New Selection':mode==='edit'?'Edit Selection':'Selection Detail'}
            </div>
            <div style={{display:'flex',gap:8}}>
              {mode==='view'&&selected&&(
                <>
                  <button onClick={()=>openEdit(selected)}
                    style={{padding:'6px 14px',background:'rgba(245,158,11,.1)',border:`1px solid ${BLUE}44`,
                      borderRadius:6,color:'#FBBF24',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    Edit
                  </button>
                  <button onClick={()=>deleteItem(selected)} disabled={deleting}
                    style={{padding:'6px 14px',background:'rgba(192,48,48,.1)',border:`1px solid ${RED}44`,
                      borderRadius:6,color:RED,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    {deleting?'...':'Delete'}
                  </button>
                </>
              )}
              <button onClick={closePanel} aria-label="Close"
                style={{display:'inline-flex',alignItems:'center',justifyContent:'center',padding:'6px 10px',background:'rgba(143,163,192,.1)',
                  border:`1px solid ${BORDER}`,borderRadius:6,color:DIM,fontSize:12,cursor:'pointer'}}>
                <X size={14} weight="bold" />
              </button>
            </div>
          </div>

          <div style={{flex:1,overflow:'auto',padding:20}}>
            {(mode==='create'||mode==='edit')?(
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                {mode==='create'&&(
                  <StatStrip items={[
                    {label:'Selections Made', value:String(items.length-pendingCount), sub:`of ${items.length} logged`},
                    {label:'Pending', value:String(pendingCount), accent:pendingCount>0?ORANGE:undefined, sub:'awaiting decision'},
                    {label:'Total Allowance', value:fmt(totalAllowance), sub:'across all items'},
                    {label:'Variance', value:(overage>0?'+':'')+fmt(overage), accent:overage>0?RED:GREEN, sub:overage>0?'over allowances':'under allowances'},
                  ]}/>
                )}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <Field label="Category">
                    <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
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
                    <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Item Name *">
                  <input value={form.item} onChange={e=>setForm(f=>({...f,item:e.target.value}))}
                    style={inp} placeholder="Kitchen Faucet, Quartz Countertop..."/>
                </Field>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <Field label="Manufacturer / Vendor">
                    <Suggest value={form.manufacturer} onChange={e=>setForm(f=>({...f,manufacturer:e.target.value}))}
                      style={inp} placeholder="Kohler, Moen..." options={['v']} />
                    {(ctx?.vendors||[]).length>0&&<div style={HINT}>{(ctx.vendors||[]).length} known vendors on this project — start typing to match.</div>}
                  </Field>
                  <Field label="Model / SKU">
                    <input value={form.model} onChange={e=>setForm(f=>({...f,model:e.target.value}))}
                      style={inp} placeholder="K-99273-0"/>
                  </Field>
                  <Field label="Color">
                    <input value={form.color} onChange={e=>setForm(f=>({...f,color:e.target.value}))}
                      style={inp} placeholder="Matte Black"/>
                  </Field>
                  <Field label="Finish">
                    <input value={form.finish} onChange={e=>setForm(f=>({...f,finish:e.target.value}))}
                      style={inp} placeholder="Brushed Nickel"/>
                  </Field>
                  <Field label="Selected Price ($)">
                    <input type="number" value={form.cost} onChange={e=>setForm(f=>({...f,cost:e.target.value}))}
                      style={inp} placeholder="0" min={0}/>
                  </Field>
                  <Field label="Allowance ($)">
                    <input type="number" value={form.allowance} onChange={e=>setForm(f=>({...f,allowance:e.target.value}))}
                      style={inp} placeholder="0" min={0}/>
                  </Field>
                </div>
                {((Number(form.cost)||0)>0||(Number(form.allowance)||0)>0)&&(()=>{
                  const price=Number(form.cost)||0, allow=Number(form.allowance)||0, v=price-allow;
                  const over=v>0;
                  return(
                    <div style={{background:over?'rgba(192,48,48,.07)':'rgba(26,138,74,.07)',
                      border:`1px solid ${over?RED:GREEN}33`,borderRadius:10,padding:'10px 14px'}}>
                      <InsightRow label="Selected price" value={fmt(price)}/>
                      <InsightRow label="Allowance" value={fmt(allow)}/>
                      <InsightRow label={over?'Over allowance':v<0?'Under allowance':'On allowance'}
                        value={(over?'+':'')+fmt(v)} accent={over?RED:'#3dd68c'} strong/>
                    </div>
                  );
                })()}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <Field label="Selected By">
                    <input value={form.selected_by} onChange={e=>setForm(f=>({...f,selected_by:e.target.value}))}
                      style={inp} placeholder="Owner or designer name"/>
                  </Field>
                  <Field label="Decision Due" auto={auto.due}>
                    <SaguaroDatePicker value={form.due_date}
                      onChange={v=>{setAuto(a=>({...a,due:false}));setForm(f=>({...f,due_date:v}));}}
                      style={inp}/>
                    {auto.due&&<div style={HINT}>Defaulted 30 days out — tighten to order lead times.</div>}
                  </Field>
                </div>
                <Field label="Product Link">
                  <input value={form.link} onChange={e=>setForm(f=>({...f,link:e.target.value}))}
                    style={inp} placeholder="https://..."/>
                </Field>
                <Field label="Notes">
                  <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                    rows={3} style={{...inp,resize:'vertical',lineHeight:1.5}}
                    placeholder="Additional notes..."/>
                </Field>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <input type="checkbox" id="oa" checked={form.owner_approved}
                    onChange={e=>setForm(f=>({...f,owner_approved:e.target.checked}))}
                    style={{width:16,height:16,cursor:'pointer'}}/>
                  <label htmlFor="oa" style={{fontSize:13,color:TEXT,cursor:'pointer'}}>Owner Approved</label>
                </div>
                <div style={{...HINT,marginTop:-8}}>Leave unchecked to track the decision{ctx?.project?.ownerName?` with ${ctx.project.ownerName}`:''} — approval can be recorded later from the detail view.</div>
                {mode==='create'&&(
                  <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'14px 16px'}}>
                    <FlowSteps title="After you save" steps={[
                      {title:'Owner decision tracked', desc:ctx?.project?.ownerName?`Shows as pending until ${ctx.project.ownerName} approves — record it in one click.`:'Shows as pending until owner approval is recorded in one click.'},
                      {title:'Variance rolls up live', desc:'Price vs allowance feeds the budget bar and the over/under total the moment you save.'},
                      {title:'Order to install', desc:'Advance status through Ordered, Delivered and Installed straight from the log.'},
                    ]}/>
                  </div>
                )}
                <div style={{display:'flex',gap:10,paddingTop:4}}>
                  <button onClick={save} disabled={saving} className="pmBtn"
                    style={{...goldButtonStyle,flex:1,padding:'11px 0',fontSize:14,opacity:saving?0.6:1}}>
                    {saving?'Saving...':mode==='create'?'Add Selection':'Save Changes'}
                  </button>
                  <button onClick={closePanel} className="pmBtn"
                    style={{...ghostButtonStyle,padding:'11px 16px',fontSize:14,color:DIM}}>
                    Cancel
                  </button>
                </div>
              </div>
            ):selected?(
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:16}}>
                  <div style={{fontSize:10,fontWeight:700,color:GOLD,textTransform:'uppercase',
                    letterSpacing:.5,marginBottom:6}}>{selected.category}</div>
                  <div style={{fontSize:18,fontWeight:800,color:TEXT,marginBottom:8}}>{selected.item}</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
                    <Pill label={STATUS_LABELS[selected.status]||selected.status} color={STATUS_COLORS[selected.status]||DIM}/>
                    {selected.owner_approved&&<Pill label="Owner Approved" color={GREEN}/>}
                  </div>
                  {!selected.owner_approved&&(
                    <button onClick={()=>approve(selected)}
                      style={{padding:'9px 0',width:'100%',background:'rgba(26,138,74,.1)',
                        border:`1px solid ${GREEN}44`,borderRadius:7,color:'#4ade80',
                        fontSize:13,fontWeight:700,cursor:'pointer'}}>
                      Record Owner Approval
                    </button>
                  )}
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  {[
                    {l:'Manufacturer',v:selected.manufacturer},
                    {l:'Model / SKU',v:selected.model},
                    {l:'Color',v:selected.color},
                    {l:'Finish',v:selected.finish},
                    {l:'Cost',v:selected.cost>0?fmt(selected.cost):null},
                    {l:'Allowance',v:selected.allowance>0?fmt(selected.allowance):null},
                    {l:'Selected By',v:selected.selected_by},
                    {l:'Decision Due',v:selected.due_date?new Date(selected.due_date+'T12:00:00')
                      .toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):null},
                  ].filter(x=>x.v).map(x=>(
                    <div key={x.l} style={{background:'#141416',border:`1px solid ${BORDER}`,
                      borderRadius:8,padding:'10px 12px'}}>
                      <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:4}}>{x.l}</div>
                      <div style={{fontSize:13,color:TEXT}}>{x.v}</div>
                    </div>
                  ))}
                </div>

                {selected.cost>0&&selected.allowance>0&&(
                  <div style={{background:selected.cost>selected.allowance?'rgba(192,48,48,.07)':'rgba(26,138,74,.07)',
                    border:`1px solid ${selected.cost>selected.allowance?RED:GREEN}33`,borderRadius:8,padding:'10px 14px'}}>
                    <div style={{fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:4}}>
                      Budget Impact
                    </div>
                    <div style={{fontSize:14,fontWeight:800,color:selected.cost>selected.allowance?RED:GREEN}}>
                      {fmt(selected.cost-selected.allowance)} vs allowance
                    </div>
                  </div>
                )}

                {selected.link&&(
                  <a href={selected.link} target="_blank" rel="noopener noreferrer"
                    style={{display:'block',padding:'10px 14px',background:'rgba(245,158,11,.1)',
                      border:`1px solid ${BLUE}44`,borderRadius:8,color:'#FBBF24',
                      fontSize:13,fontWeight:600,textAlign:'center',textDecoration:'none'}}>
                    View Product Link
                  </a>
                )}

                {selected.notes&&(
                  <div style={{background:'#141416',border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>Notes</div>
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
