'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';
const GREEN='#1a8a4a',RED='#c03030',BLUE='#3b82f6';

const WEATHER_OPTS = ['☀️ Clear','⛅ Partly Cloudy','☁️ Overcast','🌧️ Rain','⛈️ Thunderstorm','❄️ Snow','🌫️ Fog','🌬️ Windy'];

const EMPTY: Record<string,any> = {
  log_date: new Date().toISOString().split('T')[0],
  weather:'', temperature_high:'', temperature_low:'', crew_count:'',
  work_performed:'', delays:'', safety_notes:'', materials_delivered:'', visitors:'', notes:'',
};

const inp: React.CSSProperties = {
  width:'100%', padding:'9px 12px', background:'#151f2e',
  border:'1px solid #263347', borderRadius:7, color:'#e8edf8',
  fontSize:13, outline:'none', boxSizing:'border-box',
};

function Field({label,children}:{label:string;children:React.ReactNode}){
  return (
    <div>
      <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,
        textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>{label}</label>
      {children}
    </div>
  );
}

function Section({label,value,warn}:{label:string;value?:string;warn?:boolean}){
  if(!value?.trim()) return null;
  return (
    <div style={{background:warn?'rgba(192,48,48,.07)':'#1a2535',
      border:`1px solid ${warn?'rgba(192,48,48,.25)':'#263347'}`,
      borderRadius:8,padding:'12px 14px'}}>
      <div style={{fontSize:10,fontWeight:700,color:warn?'#f87171':DIM,
        textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>{label}</div>
      <div style={{fontSize:13,color:TEXT,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{value}</div>
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
  const [saving,setSaving]   = useState(false);
  const [deleting,setDeleting]=useState(false);
  const [toast,setToast]     = useState<{msg:string;type:'success'|'error'}|null>(null);
  const [search,setSearch]   = useState('');
  const [monthFilter,setMonthFilter] = useState('');

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

  useEffect(()=>{load();},[load]);

  function openCreate(){
    setForm({...EMPTY});
    setMode('create'); setSelected(null);
  }
  function openEdit(log:any){
    setForm({
      log_date:log.log_date||'',weather:log.weather||'',
      temperature_high:log.temperature_high??'',temperature_low:log.temperature_low??'',
      crew_count:log.crew_count??'',work_performed:log.work_performed||'',
      delays:log.delays||'',safety_notes:log.safety_notes||'',
      materials_delivered:log.materials_delivered||'',visitors:log.visitors||'',notes:log.notes||'',
    });
    setSelected(log); setMode('edit');
  }
  function viewLog(log:any){ setSelected(log); setMode('view'); }
  function closePanel(){ setSelected(null); setMode(null); }

  async function save(){
    setSaving(true);
    try{
      const h = await getAuthHeaders();
      const payload: Record<string,any> = {
        ...form,
        crew_count:Number(form.crew_count)||0,
        temperature_high:form.temperature_high!==''?Number(form.temperature_high):null,
        temperature_low:form.temperature_low!==''?Number(form.temperature_low):null,
      };
      if(mode==='create'){
        const r = await fetch('/api/daily-logs/create',{
          method:'POST',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify({...payload,projectId,
            logDate:payload.log_date,workPerformed:payload.work_performed,
            safetyNotes:payload.safety_notes,materialsDelivered:payload.materials_delivered,
            crewCount:payload.crew_count,
            temperatureHigh:payload.temperature_high,temperatureLow:payload.temperature_low,
          }),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Daily log created');
      } else if(mode==='edit'&&selected){
        const r = await fetch(`/api/daily-logs/${selected.id}`,{
          method:'PUT',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify(payload),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Log updated');
      }
      await load(); closePanel();
    }catch(e:any){ showToast(e.message||'Save failed','error'); }
    finally{setSaving(false);}
  }

  async function deleteLog(log:any){
    if(!confirm(`Delete log for ${log.log_date}?`)) return;
    setDeleting(true);
    try{
      const h = await getAuthHeaders();
      const dr = await fetch(`/api/daily-logs/${log.id}`,{method:'DELETE',headers:h});
      if (!dr.ok) throw new Error('Delete failed');
      showToast('Log deleted');
      closePanel(); await load();
    }catch{showToast('Delete failed','error');}
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
    <div style={{display:'flex',height:'100%',minHeight:0,position:'relative'}}>
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
        {/* Header */}
        <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,
          display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
          <div>
            <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Daily Logs</h2>
            <div style={{fontSize:12,color:DIM,marginTop:3}}>Field reports — weather, crew, work, safety</div>
          </div>
          <button onClick={openCreate}
            style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,
              border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>
            + New Daily Log
          </button>
        </div>

        <div style={{padding:24}}>
          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
            {[
              {l:'Total Logs',v:String(logs.length)},
              {l:'This Month',v:String(thisMonth)},
              {l:'Avg Crew / Day',v:String(avgCrew)},
              {l:'Days w/ Delays',v:String(delayDays)},
            ].map(k=>(
              <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',color:DIM,marginBottom:6}}>{k.l}</div>
                <div style={{fontSize:22,fontWeight:800,color:TEXT}}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search logs…"
              style={{flex:1,minWidth:200,padding:'8px 12px',background:RAISED,
                border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none'}}/>
            <select value={monthFilter} onChange={e=>setMonthFilter(e.target.value)}
              style={{padding:'8px 12px',background:RAISED,border:`1px solid ${BORDER}`,
                borderRadius:7,color:monthFilter?TEXT:DIM,fontSize:13,outline:'none'}}>
              <option value="">All months</option>
              {months.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {loading&&<div style={{padding:40,textAlign:'center',color:DIM}}>Loading logs…</div>}

          {!loading&&loadError&&(
            <div style={{background:'rgba(192,48,48,.12)',border:'1px solid rgba(192,48,48,.3)',borderRadius:8,padding:'12px 16px',marginBottom:20,color:'#c03030',fontSize:13}}>
              {loadError}
            </div>
          )}

          {!loading&&filtered.length===0&&(
            <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:56,textAlign:'center'}}>
              <div style={{fontSize:40,marginBottom:14}}>📋</div>
              <div style={{fontWeight:800,fontSize:16,color:TEXT,marginBottom:8}}>
                {logs.length===0?'No daily logs yet':'No logs match your filters'}
              </div>
              <div style={{fontSize:13,color:DIM,marginBottom:24}}>
                {logs.length===0
                  ?'Start documenting your daily field activity.'
                  :'Try adjusting your search or month filter.'}
              </div>
              {logs.length===0&&(
                <button onClick={openCreate}
                  style={{padding:'10px 24px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,
                    border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>
                  + Create First Log
                </button>
              )}
            </div>
          )}

          {/* Log list */}
          {!loading&&filtered.length>0&&(
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {filtered.map((log:any)=>{
                const isSel = selected?.id===log.id && mode==='view';
                return (
                  <div key={log.id} onClick={()=>viewLog(log)}
                    style={{background:isSel?'rgba(212,160,23,.08)':RAISED,
                      border:`1px solid ${isSel?GOLD:BORDER}`,borderRadius:10,
                      padding:'14px 18px',cursor:'pointer',transition:'all .15s'}}
                    onMouseEnter={e=>{if(!isSel)e.currentTarget.style.borderColor='rgba(212,160,23,.4)';}}
                    onMouseLeave={e=>{if(!isSel)e.currentTarget.style.borderColor=BORDER;}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                      <div>
                        <div style={{fontWeight:800,fontSize:15,color:TEXT}}>
                          {new Date(log.log_date+'T12:00:00').toLocaleDateString('en-US',
                            {weekday:'short',month:'short',day:'numeric',year:'numeric'})}
                        </div>
                        <div style={{fontSize:12,color:DIM,marginTop:3,display:'flex',gap:12,flexWrap:'wrap'}}>
                          {log.weather&&<span>{log.weather}</span>}
                          {(log.temperature_high||log.temperature_low)&&
                            <span>🌡️ {log.temperature_high??'?'}° / {log.temperature_low??'?'}°F</span>}
                          {log.crew_count?<span>👷 {log.crew_count} crew</span>:null}
                        </div>
                      </div>
                      <div style={{display:'flex',gap:6,flexShrink:0}}>
                        {log.delays?.trim()&&(
                          <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:4,
                            background:'rgba(192,48,48,.15)',color:'#f87171',textTransform:'uppercase',letterSpacing:.3}}>
                            Delays
                          </span>
                        )}
                        {log.safety_notes?.trim()&&(
                          <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:4,
                            background:'rgba(212,160,23,.15)',color:GOLD,textTransform:'uppercase',letterSpacing:.3}}>
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
        </div>
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
                    style={{padding:'6px 14px',background:'rgba(59,130,246,.12)',
                      border:`1px solid ${BLUE}44`,borderRadius:6,
                      color:'#60a5fa',fontSize:12,fontWeight:700,cursor:'pointer'}}>
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
                ✕
              </button>
            </div>
          </div>

          <div style={{flex:1,overflow:'auto',padding:20}}>
            {(mode==='create'||mode==='edit')?(
              /* FORM */
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                <Field label="Log Date">
                  <input type="date" value={form.log_date}
                    onChange={e=>setForm(f=>({...f,log_date:e.target.value}))}
                    style={inp}/>
                </Field>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                  <Field label="Weather">
                    <select value={form.weather}
                      onChange={e=>setForm(f=>({...f,weather:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      <option value="">—</option>
                      {WEATHER_OPTS.map(w=><option key={w} value={w}>{w}</option>)}
                    </select>
                  </Field>
                  <Field label="High °F">
                    <input type="number" value={form.temperature_high}
                      onChange={e=>setForm(f=>({...f,temperature_high:e.target.value}))}
                      style={inp} placeholder="95"/>
                  </Field>
                  <Field label="Low °F">
                    <input type="number" value={form.temperature_low}
                      onChange={e=>setForm(f=>({...f,temperature_low:e.target.value}))}
                      style={inp} placeholder="72"/>
                  </Field>
                </div>

                <Field label="Crew Count">
                  <input type="number" value={form.crew_count}
                    onChange={e=>setForm(f=>({...f,crew_count:e.target.value}))}
                    style={inp} placeholder="0" min={0}/>
                </Field>

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
                      background:`linear-gradient(135deg,${GOLD},#F0C040)`,
                      border:'none',borderRadius:8,color:'#0d1117',
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
                    {(selected.temperature_high||selected.temperature_low)&&(
                      <span>🌡️ {selected.temperature_high??'?'}° / {selected.temperature_low??'?'}°F</span>
                    )}
                    {selected.crew_count&&<span>👷 {selected.crew_count} crew members</span>}
                  </div>
                </div>
                <Section label="Work Performed" value={selected.work_performed}/>
                <Section label="Delays / Issues" value={selected.delays} warn={!!selected.delays?.trim()}/>
                <Section label="Safety Notes" value={selected.safety_notes}/>
                <Section label="Materials Delivered" value={selected.materials_delivered}/>
                {selected.visitors&&<Section label="Visitors / Inspections" value={selected.visitors}/>}
                {selected.notes&&<Section label="General Notes" value={selected.notes}/>}
              </div>
            ):null}
          </div>
        </div>
      )}
    </div>
  );
}
