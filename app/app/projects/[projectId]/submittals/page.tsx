'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';
const GREEN='#1a8a4a',RED='#c03030',ORANGE='#c07830';

const STATUSES=['pending','submitted','under_review','approved','rejected','revise_resubmit'];
const STATUS_LABELS:Record<string,string>={
  pending:'Pending',
  submitted:'Submitted',
  under_review:'Under Review',
  approved:'Approved',
  rejected:'Rejected',
  revise_resubmit:'Revise & Resubmit',
};
const STATUS_COLORS:Record<string,string>={
  pending:DIM,
  submitted:'#60a5fa',
  under_review:GOLD,
  approved:GREEN,
  rejected:RED,
  revise_resubmit:ORANGE,
};

const BIC_OPTIONS=['Contractor','Architect','Owner','Engineer'];
const BIC_COLORS:Record<string,string>={
  Contractor:'#60a5fa',
  Architect:GOLD,
  Owner:GREEN,
  Engineer:'#a78bfa',
};

const inp:React.CSSProperties={
  width:'100%',padding:'9px 12px',background:'#151f2e',
  border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,
  fontSize:13,outline:'none',boxSizing:'border-box',
};

const EMPTY_FORM={
  submittal_number:'',title:'',spec_section:'',trade:'',
  status:'pending',ball_in_court:'Contractor',
  submitted_date:'',required_date:'',revision:0,notes:'',
};

function Pill({label,color}:{label:string;color:string}){
  return(
    <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:20,
      background:`${color}22`,color,textTransform:'uppercase',letterSpacing:.3,whiteSpace:'nowrap'}}>
      {label}
    </span>
  );
}

function FieldLabel({label}:{label:string}){
  return(
    <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,
      textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>{label}</label>
  );
}

function InfoCard({label,value}:{label:string;value:string|undefined|null}){
  if(!value) return null;
  return(
    <div style={{background:'#1a2535',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px'}}>
      <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:4}}>{label}</div>
      <div style={{fontSize:13,color:TEXT}}>{value}</div>
    </div>
  );
}

function fmtDate(s:string|null|undefined){
  if(!s) return '—';
  return new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}

export default function SubmittalsPage(){
  const {projectId}=useParams() as {projectId:string};
  const [submittals,setSubmittals]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [selected,setSelected]=useState<any>(null);
  const [mode,setMode]=useState<'view'|'edit'|'create'|null>(null);
  const [form,setForm]=useState<Record<string,any>>({...EMPTY_FORM});
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [toast,setToast]=useState<{msg:string;type:'success'|'error'}|null>(null);
  const [search,setSearch]=useState('');
  const [filterStatus,setFilterStatus]=useState('all');
  const [filterBIC,setFilterBIC]=useState('all');

  const today=new Date().toISOString().split('T')[0];

  const showToast=(msg:string,type:'success'|'error'='success')=>{
    setToast({msg,type}); setTimeout(()=>setToast(null),4000);
  };

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch(`/api/submittals/list?projectId=${projectId}`,{headers:h});
      if (!r.ok) throw new Error('Failed to load data');
      const d=await r.json();
      setSubmittals(d.submittals||[]);
    }catch{setSubmittals([]);setLoadError('Failed to load. Please try again.');}
    finally{setLoading(false);}
  },[projectId]);

  useEffect(()=>{load();},[load]);

  function openCreate(){
    const num=`S-${String(submittals.length+1).padStart(3,'0')}`;
    setForm({...EMPTY_FORM,submittal_number:num});
    setMode('create');setSelected(null);
  }
  function openEdit(sub:any){
    setForm({
      submittal_number:sub.submittal_number||'',
      title:sub.title||'',
      spec_section:sub.spec_section||'',
      trade:sub.trade||'',
      status:sub.status||'pending',
      ball_in_court:sub.ball_in_court||'Contractor',
      submitted_date:sub.submitted_date?sub.submitted_date.substring(0,10):'',
      required_date:sub.required_date?sub.required_date.substring(0,10):'',
      revision:sub.revision??0,
      notes:sub.notes||'',
    });
    setSelected(sub);setMode('edit');
  }
  function viewSub(sub:any){setSelected(sub);setMode('view');}
  function closePanel(){setSelected(null);setMode(null);}

  async function save(){
    if(!form.title.trim()){showToast('Title is required','error');return;}
    setSaving(true);
    try{
      const h=await getAuthHeaders();
      const payload={
        ...form,
        revision:Number(form.revision)||0,
        submitted_date:form.submitted_date||null,
        required_date:form.required_date||null,
      };
      if(mode==='create'){
        const r=await fetch('/api/submittals/create',{
          method:'POST',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify({...payload,projectId}),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Submittal created');
      }else if(mode==='edit'&&selected){
        const r=await fetch(`/api/submittals/${selected.id}`,{
          method:'PUT',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify(payload),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Submittal updated');
      }
      await load();closePanel();
    }catch(e:any){showToast(e.message||'Save failed','error');}
    finally{setSaving(false);}
  }

  async function deleteSub(sub:any){
    if(!confirm(`Delete submittal "${sub.submittal_number} - ${sub.title}"?`)) return;
    setDeleting(true);
    try{
      const h=await getAuthHeaders();
      const dr=await fetch(`/api/submittals/${sub.id}`,{method:'DELETE',headers:h});
      if (!dr.ok) throw new Error('Delete failed');
      showToast('Submittal deleted');closePanel();await load();
    }catch{showToast('Delete failed','error');}
    finally{setDeleting(false);}
  }

  const total=submittals.length;
  const pending=submittals.filter(s=>s.status==='pending').length;
  const underReview=submittals.filter(s=>s.status==='under_review').length;
  const overdue=submittals.filter(s=>
    s.required_date&&s.required_date.substring(0,10)<today&&s.status!=='approved'&&s.status!=='rejected'
  ).length;

  const filtered=submittals.filter(s=>{
    const ms=!search
      ||(s.submittal_number||'').toLowerCase().includes(search.toLowerCase())
      ||(s.title||'').toLowerCase().includes(search.toLowerCase())
      ||(s.spec_section||'').toLowerCase().includes(search.toLowerCase())
      ||(s.trade||'').toLowerCase().includes(search.toLowerCase());
    const mst=filterStatus==='all'||s.status===filterStatus;
    const mb=filterBIC==='all'||s.ball_in_court===filterBIC;
    return ms&&mst&&mb;
  });

  function isOverdue(s:any){
    return s.required_date&&s.required_date.substring(0,10)<today&&s.status!=='approved'&&s.status!=='rejected';
  }

  return(
    <div style={{display:'flex',height:'100%',minHeight:0,position:'relative',background:DARK}}>
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
            <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Submittals</h2>
            <div style={{fontSize:12,color:DIM,marginTop:3}}>Shop drawings, product data &amp; submittal log</div>
          </div>
          <button onClick={openCreate}
            style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,
              border:'none',borderRadius:7,color:DARK,fontSize:13,fontWeight:800,cursor:'pointer'}}>
            + New Submittal
          </button>
        </div>

        <div style={{padding:24}}>
          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
            {[
              {l:'Total',v:String(total),c:'#60a5fa'},
              {l:'Pending',v:String(pending),c:DIM},
              {l:'Under Review',v:String(underReview),c:GOLD},
              {l:'Overdue',v:String(overdue),c:RED},
            ].map(k=>(
              <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',color:DIM,marginBottom:6}}>{k.l}</div>
                <div style={{fontSize:22,fontWeight:800,color:k.c}}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search submittals..."
              style={{flex:1,minWidth:180,padding:'8px 12px',background:RAISED,
                border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none'}}/>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
              style={{padding:'8px 12px',background:RAISED,border:`1px solid ${BORDER}`,
                borderRadius:7,color:filterStatus!=='all'?TEXT:DIM,fontSize:13,outline:'none'}}>
              <option value="all">All Statuses</option>
              {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <select value={filterBIC} onChange={e=>setFilterBIC(e.target.value)}
              style={{padding:'8px 12px',background:RAISED,border:`1px solid ${BORDER}`,
                borderRadius:7,color:filterBIC!=='all'?TEXT:DIM,fontSize:13,outline:'none'}}>
              <option value="all">All Ball-in-Court</option>
              {BIC_OPTIONS.map(b=><option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {loading&&<div style={{padding:40,textAlign:'center',color:DIM}}>Loading submittals...</div>}

          {!loading&&loadError&&(
            <div style={{background:'rgba(192,48,48,.12)',border:'1px solid rgba(192,48,48,.3)',borderRadius:8,padding:'12px 16px',marginBottom:20,color:'#c03030',fontSize:13}}>
              {loadError}
            </div>
          )}

          {!loading&&filtered.length===0&&(
            <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,
              padding:56,textAlign:'center'}}>
              <div style={{fontSize:40,marginBottom:14}}>📋</div>
              <div style={{fontWeight:800,fontSize:16,color:TEXT,marginBottom:8}}>
                {submittals.length===0?'No submittals yet':'No submittals match your filters'}
              </div>
              <div style={{fontSize:13,color:DIM,marginBottom:24}}>
                {submittals.length===0?'Track shop drawings and product data submittals.':'Try adjusting your filters.'}
              </div>
              {submittals.length===0&&(
                <button onClick={openCreate}
                  style={{padding:'10px 24px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,
                    border:'none',borderRadius:8,color:DARK,fontSize:13,fontWeight:800,cursor:'pointer'}}>
                  + Create First Submittal
                </button>
              )}
            </div>
          )}

          {!loading&&filtered.length>0&&(
            <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden',overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{background:'rgba(0,0,0,.3)'}}>
                    {['#','Title','Spec Section','Status','Ball in Court','Req. Date','Rev.'].map(h=>(
                      <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,
                        textTransform:'uppercase',letterSpacing:.5,color:DIM,
                        borderBottom:`1px solid ${BORDER}`,whiteSpace:'nowrap'}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s=>{
                    const isSel=selected?.id===s.id&&mode==='view';
                    const od=isOverdue(s);
                    return(
                      <tr key={s.id}
                        onClick={()=>viewSub(s)}
                        style={{background:isSel?'rgba(212,160,23,.07)':'transparent',
                          borderBottom:`1px solid rgba(38,51,71,.5)`,cursor:'pointer',
                          transition:'background .1s'}}
                        onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background='rgba(255,255,255,.02)';}}
                        onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background='transparent';}}>
                        <td style={{padding:'11px 14px',color:GOLD,fontWeight:700,whiteSpace:'nowrap'}}>
                          {s.submittal_number||'—'}
                        </td>
                        <td style={{padding:'11px 14px',color:TEXT,maxWidth:220}}>
                          <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {s.title||'—'}
                          </div>
                          {s.trade&&<div style={{fontSize:11,color:DIM,marginTop:2}}>{s.trade}</div>}
                        </td>
                        <td style={{padding:'11px 14px',color:DIM,whiteSpace:'nowrap'}}>
                          {s.spec_section||'—'}
                        </td>
                        <td style={{padding:'11px 14px'}}>
                          <Pill label={STATUS_LABELS[s.status]||s.status} color={STATUS_COLORS[s.status]||DIM}/>
                        </td>
                        <td style={{padding:'11px 14px'}}>
                          {s.ball_in_court&&(
                            <Pill label={s.ball_in_court} color={BIC_COLORS[s.ball_in_court]||DIM}/>
                          )}
                        </td>
                        <td style={{padding:'11px 14px',whiteSpace:'nowrap',
                          color:od?RED:DIM,fontWeight:od?700:400}}>
                          {s.required_date?fmtDate(s.required_date.substring(0,10)):'—'}
                          {od&&<span style={{fontSize:10,marginLeft:4}}>(overdue)</span>}
                        </td>
                        <td style={{padding:'11px 14px',color:DIM,textAlign:'center'}}>
                          R{s.revision??0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Side Panel */}
      {mode!==null&&(
        <div style={{width:460,borderLeft:`1px solid ${BORDER}`,background:DARK,
          overflow:'auto',flexShrink:0,display:'flex',flexDirection:'column'}}>
          <div style={{padding:'16px 20px',borderBottom:`1px solid ${BORDER}`,
            display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontWeight:800,fontSize:15,color:TEXT}}>
              {mode==='create'?'New Submittal':mode==='edit'?'Edit Submittal':'Submittal Detail'}
            </div>
            <div style={{display:'flex',gap:8}}>
              {mode==='view'&&selected&&(
                <>
                  <button onClick={()=>openEdit(selected)}
                    style={{padding:'6px 14px',background:'rgba(59,130,246,.1)',
                      border:'1px solid rgba(59,130,246,.3)',borderRadius:6,
                      color:'#60a5fa',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    Edit
                  </button>
                  <button onClick={()=>deleteSub(selected)} disabled={deleting}
                    style={{padding:'6px 14px',background:'rgba(192,48,48,.1)',
                      border:`1px solid ${RED}44`,borderRadius:6,
                      color:RED,fontSize:12,fontWeight:700,cursor:'pointer'}}>
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
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <FieldLabel label="Submittal #"/>
                    <input value={form.submittal_number}
                      onChange={e=>setForm(f=>({...f,submittal_number:e.target.value}))}
                      style={inp} placeholder="S-001"/>
                  </div>
                  <div>
                    <FieldLabel label="Revision"/>
                    <input type="number" min={0} value={form.revision}
                      onChange={e=>setForm(f=>({...f,revision:e.target.value}))}
                      style={inp}/>
                  </div>
                </div>
                <div>
                  <FieldLabel label="Title *"/>
                  <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
                    style={inp} placeholder="e.g. Structural Steel Shop Drawings"/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <FieldLabel label="Spec Section"/>
                    <input value={form.spec_section}
                      onChange={e=>setForm(f=>({...f,spec_section:e.target.value}))}
                      style={inp} placeholder="e.g. 05 12 00"/>
                  </div>
                  <div>
                    <FieldLabel label="Trade"/>
                    <input value={form.trade}
                      onChange={e=>setForm(f=>({...f,trade:e.target.value}))}
                      style={inp} placeholder="e.g. Structural"/>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <FieldLabel label="Status"/>
                    <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel label="Ball in Court"/>
                    <select value={form.ball_in_court}
                      onChange={e=>setForm(f=>({...f,ball_in_court:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      {BIC_OPTIONS.map(b=><option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <FieldLabel label="Submitted Date"/>
                    <input type="date" value={form.submitted_date}
                      onChange={e=>setForm(f=>({...f,submitted_date:e.target.value}))}
                      style={inp}/>
                  </div>
                  <div>
                    <FieldLabel label="Required Date"/>
                    <input type="date" value={form.required_date}
                      onChange={e=>setForm(f=>({...f,required_date:e.target.value}))}
                      style={inp}/>
                  </div>
                </div>
                <div>
                  <FieldLabel label="Notes"/>
                  <textarea value={form.notes}
                    onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                    rows={3} style={{...inp,resize:'vertical',lineHeight:1.5}}
                    placeholder="Additional notes or comments..."/>
                </div>
                <div style={{display:'flex',gap:10,paddingTop:4}}>
                  <button onClick={save} disabled={saving}
                    style={{flex:1,padding:'11px 0',
                      background:`linear-gradient(135deg,${GOLD},#F0C040)`,
                      border:'none',borderRadius:8,color:DARK,
                      fontSize:14,fontWeight:800,cursor:'pointer',opacity:saving?0.6:1}}>
                    {saving?'Saving...':mode==='create'?'Create Submittal':'Save Changes'}
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
                {/* Header card */}
                <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:16}}>
                  <div style={{fontSize:12,color:GOLD,fontWeight:700,marginBottom:4}}>
                    {selected.submittal_number||'—'} &bull; R{selected.revision??0}
                  </div>
                  <div style={{fontSize:16,fontWeight:800,color:TEXT,marginBottom:10}}>
                    {selected.title}
                  </div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <Pill label={STATUS_LABELS[selected.status]||selected.status}
                      color={STATUS_COLORS[selected.status]||DIM}/>
                    {selected.ball_in_court&&(
                      <Pill label={`BIC: ${selected.ball_in_court}`}
                        color={BIC_COLORS[selected.ball_in_court]||DIM}/>
                    )}
                    {isOverdue(selected)&&(
                      <Pill label="OVERDUE" color={RED}/>
                    )}
                  </div>
                </div>

                {/* Status workflow */}
                <div style={{background:'#1a2535',border:`1px solid ${BORDER}`,borderRadius:10,padding:'12px 14px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:10}}>
                    Status Workflow
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
                    {STATUSES.map((s,i)=>{
                      const active=selected.status===s;
                      return(
                        <React.Fragment key={s}>
                          {i>0&&<span style={{color:BORDER,fontSize:10}}>›</span>}
                          <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20,
                            background:active?`${STATUS_COLORS[s]}22`:'transparent',
                            color:active?STATUS_COLORS[s]:DIM,
                            border:active?`1px solid ${STATUS_COLORS[s]}44`:'1px solid transparent'}}>
                            {STATUS_LABELS[s]}
                          </span>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* Metadata */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <InfoCard label="Spec Section" value={selected.spec_section}/>
                  <InfoCard label="Trade" value={selected.trade}/>
                  <InfoCard label="Submitted Date" value={fmtDate(selected.submitted_date)}/>
                  <InfoCard label="Required Date" value={fmtDate(selected.required_date)}/>
                </div>

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
