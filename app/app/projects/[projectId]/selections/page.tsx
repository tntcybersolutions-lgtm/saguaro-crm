'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';
const GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A',BLUE='#3b82f6';

const CATEGORIES=['Flooring','Countertops','Cabinetry','Fixtures','Hardware','Paint',
  'Tile','Appliances','Lighting','Plumbing','Windows & Doors','Roofing','Exterior','Other'];
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
  width:'100%',padding:'9px 12px',background:'#151f2e',
  border:'1px solid #263347',borderRadius:7,color:'#e8edf8',
  fontSize:13,outline:'none',boxSizing:'border-box',
};
const EMPTY:Record<string,any>={
  category:'Flooring',item:'',manufacturer:'',model:'',color:'',finish:'',
  cost:'',allowance:'',status:'pending',selected_by:'',
  owner_approved:false,due_date:'',notes:'',link:'',
};

function Field({label,children}:{label:string;children:React.ReactNode}){
  return(
    <div>
      <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,
        textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>{label}</label>
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
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [toast,setToast]=useState<{msg:string;type:'success'|'error'}|null>(null);
  const [search,setSearch]=useState('');
  const [filterCat,setFilterCat]=useState('all');
  const [filterStatus,setFilterStatus]=useState('all');

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
      setItems(d.selections||[]);
    }catch{setItems([]);setLoadError('Failed to load. Please try again.');}
    finally{setLoading(false);}
  },[projectId]);

  useEffect(()=>{load();},[load]);

  function openCreate(){setForm({...EMPTY});setMode('create');setSelected(null);}
  function openEdit(item:any){
    setForm({category:item.category||'Flooring',item:item.item||'',
      manufacturer:item.manufacturer||'',model:item.model||'',
      color:item.color||'',finish:item.finish||'',
      cost:item.cost??'',allowance:item.allowance??'',
      status:item.status||'pending',selected_by:item.selected_by||'',
      owner_approved:item.owner_approved||false,due_date:item.due_date||'',
      notes:item.notes||'',link:item.link||''});
    setSelected(item);setMode('edit');
  }
  function viewItem(item:any){setSelected(item);setMode('view');}
  function closePanel(){setSelected(null);setMode(null);}

  async function save(){
    if(!form.item.trim()){showToast('Item name is required','error');return;}
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
    }catch(e:any){showToast(e.message||'Save failed','error');}
    finally{setSaving(false);}
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
    }catch(e:any){showToast(e.message,'error');}
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
        <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,
          display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
          <div>
            <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Client Selections</h2>
            <div style={{fontSize:12,color:DIM,marginTop:3}}>Materials, finishes &amp; owner approvals</div>
          </div>
          <button onClick={openCreate}
            style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,
              border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>
            + Add Selection
          </button>
        </div>

        <div style={{padding:24}}>
          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
            {[
              {l:'Total Items',v:String(items.length),c:TEXT},
              {l:'Pending Decision',v:String(pendingCount),c:ORANGE},
              {l:'Owner Approved',v:String(approvedCount),c:GREEN},
              {l:overage>0?'Over Allowance':'Under Allowance',
                v:overage>=0?`+${fmt(overage)}`:fmt(overage),c:overage>0?RED:GREEN},
            ].map(k=>(
              <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',color:DIM,marginBottom:6}}>{k.l}</div>
                <div style={{fontSize:20,fontWeight:800,color:k.c}}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Budget bar */}
          {totalAllowance>0&&(
            <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'14px 18px',marginBottom:20}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:700,color:DIM}}>Budget vs Allowance</span>
                <span style={{fontSize:12,fontWeight:800,color:overage>0?RED:GREEN}}>
                  {fmt(totalCost)} / {fmt(totalAllowance)}
                </span>
              </div>
              <div style={{background:'rgba(38,51,71,.6)',borderRadius:4,height:8,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:4,
                  background:overage>0?`linear-gradient(90deg,${RED},#f87171)`:`linear-gradient(90deg,${GREEN},#3dd68c)`,
                  width:`${Math.min(100,totalAllowance>0?(totalCost/totalAllowance*100):0)}%`,transition:'width .4s'}}/>
              </div>
            </div>
          )}

          {/* Filters */}
          <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search selections..."
              style={{flex:1,minWidth:180,padding:'8px 12px',background:RAISED,
                border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none'}}/>
            <select value={filterCat} onChange={e=>setFilterCat(e.target.value)}
              style={{padding:'8px 12px',background:RAISED,border:`1px solid ${BORDER}`,
                borderRadius:7,color:filterCat!=='all'?TEXT:DIM,fontSize:13,outline:'none'}}>
              <option value="all">All Categories</option>
              {cats.map((c:any)=><option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
              style={{padding:'8px 12px',background:RAISED,border:`1px solid ${BORDER}`,
                borderRadius:7,color:filterStatus!=='all'?TEXT:DIM,fontSize:13,outline:'none'}}>
              <option value="all">All Statuses</option>
              {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>

          {loading&&<div style={{padding:40,textAlign:'center',color:DIM}}>Loading selections...</div>}

          {!loading&&loadError&&(
            <div style={{background:'rgba(192,48,48,.12)',border:'1px solid rgba(192,48,48,.3)',borderRadius:8,padding:'12px 16px',marginBottom:20,color:'#c03030',fontSize:13}}>
              {loadError}
            </div>
          )}

          {!loading&&items.length===0&&(
            <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:56,textAlign:'center'}}>
              <div style={{fontSize:40,marginBottom:14}}>🎨</div>
              <div style={{fontWeight:800,fontSize:16,color:TEXT,marginBottom:8}}>No selections yet</div>
              <div style={{fontSize:13,color:DIM,marginBottom:24}}>Track material selections, finishes, and owner approvals.</div>
              <button onClick={openCreate}
                style={{padding:'10px 24px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,
                  border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>
                + Add First Selection
              </button>
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
                      style={{background:isSel?'rgba(212,160,23,.07)':RAISED,
                        border:`1px solid ${isSel?GOLD:BORDER}`,borderRadius:10,
                        padding:'12px 16px',cursor:'pointer',transition:'all .15s'}}
                      onMouseEnter={e=>{if(!isSel)e.currentTarget.style.borderColor='rgba(212,160,23,.4)';}}
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
        </div>
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
                    style={{padding:'6px 14px',background:'rgba(59,130,246,.1)',border:`1px solid ${BLUE}44`,
                      borderRadius:6,color:'#60a5fa',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    Edit
                  </button>
                  <button onClick={()=>deleteItem(selected)} disabled={deleting}
                    style={{padding:'6px 14px',background:'rgba(192,48,48,.1)',border:`1px solid ${RED}44`,
                      borderRadius:6,color:RED,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    {deleting?'...':'Delete'}
                  </button>
                </>
              )}
              <button onClick={closePanel}
                style={{padding:'6px 10px',background:'rgba(143,163,192,.1)',
                  border:`1px solid ${BORDER}`,borderRadius:6,color:DIM,fontSize:12,cursor:'pointer'}}>
                ✕
              </button>
            </div>
          </div>

          <div style={{flex:1,overflow:'auto',padding:20}}>
            {(mode==='create'||mode==='edit')?(
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <Field label="Category">
                    <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
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
                  <Field label="Manufacturer">
                    <input value={form.manufacturer} onChange={e=>setForm(f=>({...f,manufacturer:e.target.value}))}
                      style={inp} placeholder="Kohler, Moen..."/>
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
                  <Field label="Cost ($)">
                    <input type="number" value={form.cost} onChange={e=>setForm(f=>({...f,cost:e.target.value}))}
                      style={inp} placeholder="0" min={0}/>
                  </Field>
                  <Field label="Allowance ($)">
                    <input type="number" value={form.allowance} onChange={e=>setForm(f=>({...f,allowance:e.target.value}))}
                      style={inp} placeholder="0" min={0}/>
                  </Field>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <Field label="Selected By">
                    <input value={form.selected_by} onChange={e=>setForm(f=>({...f,selected_by:e.target.value}))}
                      style={inp} placeholder="Owner or designer name"/>
                  </Field>
                  <Field label="Decision Due">
                    <input type="date" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))}
                      style={inp}/>
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
                <div style={{display:'flex',gap:10,paddingTop:4}}>
                  <button onClick={save} disabled={saving}
                    style={{flex:1,padding:'11px 0',background:`linear-gradient(135deg,${GOLD},#F0C040)`,
                      border:'none',borderRadius:8,color:'#0d1117',fontSize:14,fontWeight:800,
                      cursor:'pointer',opacity:saving?0.6:1}}>
                    {saving?'Saving...':mode==='create'?'Add Selection':'Save Changes'}
                  </button>
                  <button onClick={closePanel}
                    style={{padding:'11px 16px',background:'rgba(143,163,192,.1)',
                      border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:14,cursor:'pointer'}}>
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
                    <div key={x.l} style={{background:'#1a2535',border:`1px solid ${BORDER}`,
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
                    style={{display:'block',padding:'10px 14px',background:'rgba(59,130,246,.1)',
                      border:`1px solid ${BLUE}44`,borderRadius:8,color:'#60a5fa',
                      fontSize:13,fontWeight:600,textAlign:'center',textDecoration:'none'}}>
                    View Product Link
                  </a>
                )}

                {selected.notes&&(
                  <div style={{background:'#1a2535',border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>Notes</div>
                    <div style={{fontSize:13,color:TEXT,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{selected.notes}</div>
                  </div>
                )}
              </div>
            ):null}
          </div>
        </div>
      )}
    </div>
  );
}
