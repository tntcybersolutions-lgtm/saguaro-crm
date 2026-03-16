'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';
const GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A',BLUE='#3b82f6';

const PRIORITIES=['Critical','High','Medium','Low'];
const STATUSES=['open','in_progress','completed','voided'];
const TRADES=['General Contractor','Electrical','Plumbing','HVAC','Framing','Drywall',
  'Painting','Flooring','Roofing','Concrete','Masonry','Millwork','Landscaping','Other'];
const PRIORITY_COLORS:Record<string,string>={Critical:RED,High:ORANGE,Medium:GOLD,Low:GREEN};
const STATUS_COLORS:Record<string,string>={open:'#60a5fa',in_progress:GOLD,completed:GREEN,voided:DIM};
const STATUS_LABELS:Record<string,string>={open:'Open',in_progress:'In Progress',completed:'Completed',voided:'Voided'};

const inp:React.CSSProperties={
  width:'100%',padding:'9px 12px',background:'#151f2e',
  border:'1px solid #263347',borderRadius:7,color:'#e8edf8',
  fontSize:13,outline:'none',boxSizing:'border-box',
};
const EMPTY:Record<string,any>={
  description:'',location:'',trade:'General Contractor',
  priority:'Medium',status:'open',due_date:'',assigned_to:'',notes:'',
};

function Pill({label,color}:{label:string;color:string}){
  return(
    <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:20,
      background:`${color}22`,color,textTransform:'uppercase',letterSpacing:.3}}>
      {label}
    </span>
  );
}
function Field({label,children}:{label:string;children:React.ReactNode}){
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

  useEffect(()=>{load();},[load]);

  function openCreate(){setForm({...EMPTY});setMode('create');setSelected(null);}
  function openEdit(item:any){
    setForm({description:item.description||'',location:item.location||'',
      trade:item.trade||'General Contractor',priority:item.priority||'Medium',
      status:item.status||'open',due_date:item.due_date||'',
      assigned_to:item.assigned_to||'',notes:item.notes||''});
    setSelected(item);setMode('edit');
  }
  function viewItem(item:any){setSelected(item);setMode('view');}
  function closePanel(){setSelected(null);setMode(null);}

  async function save(){
    if(!form.description.trim()){showToast('Description is required','error');return;}
    setSaving(true);
    try{
      const h=await getAuthHeaders();
      if(mode==='create'){
        const r=await fetch('/api/punch-list/create',{
          method:'POST',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify({...form,projectId}),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Item added');
      }else if(mode==='edit'&&selected){
        const r=await fetch(`/api/punch-list/${selected.id}`,{
          method:'PUT',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify(form),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Item updated');
      }
      await load();closePanel();
    }catch(e:any){showToast(e.message||'Save failed','error');}
    finally{setSaving(false);}
  }

  async function toggleComplete(item:any){
    const newStatus=item.status==='completed'?'open':'completed';
    try{
      const h=await getAuthHeaders();
      const tr=await fetch(`/api/punch-list/${item.id}`,{
        method:'PUT',
        headers:{...h,'Content-Type':'application/json'},
        body:JSON.stringify({status:newStatus}),
      });
      if (!tr.ok) throw new Error('Update failed');
      await load();
      if(selected?.id===item.id) setSelected({...selected,status:newStatus});
    }catch(e:any){showToast(e.message,'error');}
  }

  async function deleteItem(item:any){
    if(!confirm(`Delete "${item.description}"?`)) return;
    setDeleting(true);
    try{
      const h=await getAuthHeaders();
      const dr=await fetch(`/api/punch-list/${item.id}`,{method:'DELETE',headers:h});
      if (!dr.ok) throw new Error('Delete failed');
      showToast('Item deleted');closePanel();await load();
    }catch{showToast('Delete failed','error');}
    finally{setDeleting(false);}
  }

  const trades=Array.from(new Set(items.map((i:any)=>i.trade).filter(Boolean)));
  const filtered=items.filter((i:any)=>{
    const ms=!search||(i.description||'').toLowerCase().includes(search.toLowerCase())
      ||(i.location||'').toLowerCase().includes(search.toLowerCase());
    const mst=filterStatus==='all'||i.status===filterStatus;
    const mp=filterPriority==='all'||i.priority===filterPriority;
    const mt=filterTrade==='all'||i.trade===filterTrade;
    return ms&&mst&&mp&&mt;
  });

  const openCount=items.filter((i:any)=>i.status==='open').length;
  const inProg=items.filter((i:any)=>i.status==='in_progress').length;
  const done=items.filter((i:any)=>i.status==='completed').length;
  const crit=items.filter((i:any)=>i.priority==='Critical'&&i.status!=='completed').length;

  return(
    <div style={{display:'flex',height:'100%',minHeight:0,position:'relative'}}>
      {toast&&(
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:99999,
          padding:'12px 20px',borderRadius:8,color:'#fff',fontWeight:700,fontSize:14,pointerEvents:'none',
          background:toast.type==='success'?'rgba(26,138,74,.92)':'rgba(192,48,48,.92)'}}>
          {toast.msg}
        </div>
      )}

      {/* Main */}
      <div style={{flex:1,overflow:'auto',minWidth:0}}>
        <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,
          display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
          <div>
            <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Punch List</h2>
            <div style={{fontSize:12,color:DIM,marginTop:3}}>Deficiencies, corrections &amp; closeout items</div>
          </div>
          <button onClick={openCreate}
            style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,
              border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>
            + Add Item
          </button>
        </div>

        <div style={{padding:24}}>
          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
            {[
              {l:'Open',v:String(openCount),c:'#60a5fa'},
              {l:'In Progress',v:String(inProg),c:GOLD},
              {l:'Completed',v:String(done),c:GREEN},
              {l:'Critical Open',v:String(crit),c:RED},
            ].map(k=>(
              <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',color:DIM,marginBottom:6}}>{k.l}</div>
                <div style={{fontSize:22,fontWeight:800,color:k.c}}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Completion bar */}
          {items.length>0&&(
            <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,
              padding:'14px 18px',marginBottom:20}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:700,color:DIM}}>Overall Completion</span>
                <span style={{fontSize:12,fontWeight:800,color:TEXT}}>
                  {Math.round((done/items.length)*100)}%
                </span>
              </div>
              <div style={{background:'rgba(38,51,71,.6)',borderRadius:4,height:8,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:4,
                  background:`linear-gradient(90deg,${GREEN},#3dd68c)`,
                  width:`${Math.round((done/items.length)*100)}%`,transition:'width .4s'}}/>
              </div>
              <div style={{fontSize:11,color:DIM,marginTop:6}}>{done} of {items.length} items complete</div>
            </div>
          )}

          {/* Filters */}
          <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search items…"
              style={{flex:1,minWidth:180,padding:'8px 12px',background:RAISED,
                border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none'}}/>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
              style={{padding:'8px 12px',background:RAISED,border:`1px solid ${BORDER}`,
                borderRadius:7,color:filterStatus!=='all'?TEXT:DIM,fontSize:13,outline:'none'}}>
              <option value="all">All Statuses</option>
              {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)}
              style={{padding:'8px 12px',background:RAISED,border:`1px solid ${BORDER}`,
                borderRadius:7,color:filterPriority!=='all'?TEXT:DIM,fontSize:13,outline:'none'}}>
              <option value="all">All Priorities</option>
              {PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterTrade} onChange={e=>setFilterTrade(e.target.value)}
              style={{padding:'8px 12px',background:RAISED,border:`1px solid ${BORDER}`,
                borderRadius:7,color:filterTrade!=='all'?TEXT:DIM,fontSize:13,outline:'none'}}>
              <option value="all">All Trades</option>
              {trades.map((t:any)=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {loading&&<div style={{padding:40,textAlign:'center',color:DIM}}>Loading punch list…</div>}

          {!loading&&loadError&&(
            <div style={{background:'rgba(192,48,48,.12)',border:'1px solid rgba(192,48,48,.3)',borderRadius:8,padding:'12px 16px',marginBottom:20,color:'#c03030',fontSize:13}}>
              {loadError}
            </div>
          )}

          {!loading&&filtered.length===0&&(
            <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,
              padding:56,textAlign:'center'}}>
              <div style={{fontSize:40,marginBottom:14}}>✅</div>
              <div style={{fontWeight:800,fontSize:16,color:TEXT,marginBottom:8}}>
                {items.length===0?'Punch list is empty':'No items match your filters'}
              </div>
              <div style={{fontSize:13,color:DIM,marginBottom:24}}>
                {items.length===0?'Add deficiencies and correction items to track closeout.':'Try adjusting your filters.'}
              </div>
              {items.length===0&&(
                <button onClick={openCreate}
                  style={{padding:'10px 24px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,
                    border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>
                  + Add First Item
                </button>
              )}
            </div>
          )}

          {!loading&&filtered.length>0&&(
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {filtered.map((item:any)=>{
                const isSel=selected?.id===item.id&&mode==='view';
                const isDone=item.status==='completed';
                return(
                  <div key={item.id}
                    style={{background:isSel?'rgba(212,160,23,.07)':RAISED,
                      border:`1px solid ${isSel?GOLD:BORDER}`,borderRadius:10,
                      padding:'12px 16px',cursor:'pointer',transition:'all .15s',
                      opacity:isDone?.75:1}}
                    onMouseEnter={e=>{if(!isSel)e.currentTarget.style.borderColor='rgba(212,160,23,.4)';}}
                    onMouseLeave={e=>{if(!isSel)e.currentTarget.style.borderColor=BORDER;}}
                    onClick={()=>viewItem(item)}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      {/* Checkbox */}
                      <div onClick={e=>{e.stopPropagation();toggleComplete(item);}}
                        style={{width:20,height:20,borderRadius:5,flexShrink:0,cursor:'pointer',
                          border:`2px solid ${isDone?GREEN:BORDER}`,
                          background:isDone?GREEN:'transparent',
                          display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}}>
                        {isDone&&<span style={{color:'#fff',fontSize:12,lineHeight:1}}>✓</span>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <span style={{fontWeight:700,fontSize:14,color:isDone?DIM:TEXT,
                            textDecoration:isDone?'line-through':'none'}}>
                            {item.description}
                          </span>
                          <Pill label={item.priority||'Medium'} color={PRIORITY_COLORS[item.priority]||GOLD}/>
                          <Pill label={STATUS_LABELS[item.status]||item.status} color={STATUS_COLORS[item.status]||DIM}/>
                        </div>
                        <div style={{fontSize:12,color:DIM,marginTop:3,display:'flex',gap:12,flexWrap:'wrap'}}>
                          {item.trade&&<span>{item.trade}</span>}
                          {item.location&&<span>📍 {item.location}</span>}
                          {item.due_date&&<span>📅 Due {new Date(item.due_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>}
                          {item.assigned_to&&<span>👤 {item.assigned_to}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      {mode!==null&&(
        <div style={{width:460,borderLeft:`1px solid ${BORDER}`,background:DARK,
          overflow:'auto',flexShrink:0,display:'flex',flexDirection:'column'}}>
          <div style={{padding:'16px 20px',borderBottom:`1px solid ${BORDER}`,
            display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontWeight:800,fontSize:15,color:TEXT}}>
              {mode==='create'?'New Item':mode==='edit'?'Edit Item':'Item Detail'}
            </div>
            <div style={{display:'flex',gap:8}}>
              {mode==='view'&&selected&&(
                <>
                  <button onClick={()=>openEdit(selected)}
                    style={{padding:'6px 14px',background:'rgba(59,130,246,.1)',
                      border:`1px solid ${BLUE}44`,borderRadius:6,
                      color:'#60a5fa',fontSize:12,fontWeight:700,cursor:'pointer'}}>
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
                <Field label="Description *">
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
                      {PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}
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
                    onChange={e=>setForm(f=>({...f,trade:e.target.value}))}
                    style={{...inp,padding:'9px 10px'}}>
                    {TRADES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Location">
                  <input value={form.location}
                    onChange={e=>setForm(f=>({...f,location:e.target.value}))}
                    style={inp} placeholder="Room 204, North wall…"/>
                </Field>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <Field label="Assigned To">
                    <input value={form.assigned_to}
                      onChange={e=>setForm(f=>({...f,assigned_to:e.target.value}))}
                      style={inp} placeholder="Subcontractor or person"/>
                  </Field>
                  <Field label="Due Date">
                    <input type="date" value={form.due_date}
                      onChange={e=>setForm(f=>({...f,due_date:e.target.value}))}
                      style={inp}/>
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea value={form.notes}
                    onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                    rows={3} style={{...inp,resize:'vertical',lineHeight:1.5}}
                    placeholder="Additional notes, photos needed, etc…"/>
                </Field>
                <div style={{display:'flex',gap:10,paddingTop:4}}>
                  <button onClick={save} disabled={saving}
                    style={{flex:1,padding:'11px 0',
                      background:`linear-gradient(135deg,${GOLD},#F0C040)`,
                      border:'none',borderRadius:8,color:'#0d1117',
                      fontSize:14,fontWeight:800,cursor:'pointer',opacity:saving?.6:1}}>
                    {saving?'Saving…':mode==='create'?'Add Item':'Save Changes'}
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
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:16}}>
                  <div style={{fontSize:16,fontWeight:800,color:TEXT,marginBottom:10}}>
                    {selected.description}
                  </div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
                    <Pill label={selected.priority||'Medium'} color={PRIORITY_COLORS[selected.priority]||GOLD}/>
                    <Pill label={STATUS_LABELS[selected.status]||selected.status} color={STATUS_COLORS[selected.status]||DIM}/>
                  </div>
                  <button onClick={()=>toggleComplete(selected)}
                    style={{padding:'9px 0',width:'100%',
                      background:selected.status==='completed'
                        ?'rgba(59,130,246,.1)':'rgba(26,138,74,.1)',
                      border:`1px solid ${selected.status==='completed'?BLUE:GREEN}44`,
                      borderRadius:7,color:selected.status==='completed'?'#60a5fa':'#4ade80',
                      fontSize:13,fontWeight:700,cursor:'pointer'}}>
                    {selected.status==='completed'?'↩ Reopen Item':'✓ Mark Complete'}
                  </button>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  {[
                    {l:'Trade',v:selected.trade},
                    {l:'Location',v:selected.location},
                    {l:'Assigned To',v:selected.assigned_to},
                    {l:'Due Date',v:selected.due_date?new Date(selected.due_date+'T12:00:00')
                      .toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):null},
                  ].filter(x=>x.v).map(x=>(
                    <div key={x.l} style={{background:'#1a2535',border:`1px solid ${BORDER}`,
                      borderRadius:8,padding:'10px 12px'}}>
                      <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',
                        letterSpacing:.5,marginBottom:4}}>{x.l}</div>
                      <div style={{fontSize:13,color:TEXT}}>{x.v}</div>
                    </div>
                  ))}
                </div>

                {selected.notes&&(
                  <div style={{background:'#1a2535',border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',
                      letterSpacing:.5,marginBottom:6}}>Notes</div>
                    <div style={{fontSize:13,color:TEXT,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{selected.notes}</div>
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
      )}
    </div>
  );
}
