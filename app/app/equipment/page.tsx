'use client'
import { useState, useEffect } from 'react'

interface Equipment { id:string;name:string;type:string;make:string;model:string;year:number;serial_number:string;status:string;current_project_id:string;current_location:string;next_service_due:string;insurance_expiry:string;created_at:string }

const TYPES=['Crane','Forklift','Excavator','Concrete Mixer','Compactor','Scissor Lift','Boom Lift','Generator','Skid Steer','Dump Truck','Concrete Pump','Other']
const STATUS_CFG:{[k:string]:{color:string,bg:string,label:string}}={
  available:{color:'#3DD68C',bg:'rgba(61,214,140,0.12)',label:'Available'},
  in_use:{color:'#D4A017',bg:'rgba(212,160,23,0.12)',label:'In Use'},
  maintenance:{color:'#F0B429',bg:'rgba(240,180,41,0.12)',label:'Maintenance'},
  out_of_service:{color:'#F85149',bg:'rgba(248,81,73,0.12)',label:'Out of Service'},
}

export default function EquipmentPage() {
  const [equipment,setEquipment]=useState<Equipment[]>([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('All')
  const [showCreate,setShowCreate]=useState(false)
  const [form,setForm]=useState({name:'',type:'Forklift',make:'',model:'',year:'',serial_number:'',status:'available',current_location:'',next_service_due:'',insurance_expiry:''})
  const [saving,setSaving]=useState(false)

  useEffect(()=>{
    fetch('/api/equipment').then(r=>r.json())
      .then(d=>{setEquipment(d.equipment||[]);setLoading(false)})
      .catch(()=>setLoading(false))
  },[])

  const today=new Date().toISOString().split('T')[0]
  const stats={
    total:equipment.length,
    available:equipment.filter(e=>e.status==='available').length,
    in_use:equipment.filter(e=>e.status==='in_use').length,
    maintenance:equipment.filter(e=>e.status==='maintenance').length,
    service_due:equipment.filter(e=>e.next_service_due&&e.next_service_due<=today).length,
  }

  const filtered=filter==='All'?equipment:equipment.filter(e=>e.status===filter.toLowerCase().replace(' ','_'))

  const updateStatus=async(id:string,status:string)=>{
    await fetch(`/api/equipment/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})})
    setEquipment(p=>p.map(e=>e.id===id?{...e,status}:e))
  }

  const submit=async(ev:React.FormEvent)=>{
    ev.preventDefault();setSaving(true)
    const res=await fetch('/api/equipment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
    const d=await res.json();setSaving(false)
    if(res.ok){setEquipment(p=>[d.equipment,...p]);setShowCreate(false);setForm({name:'',type:'Forklift',make:'',model:'',year:'',serial_number:'',status:'available',current_location:'',next_service_due:'',insurance_expiry:''})}
  }

  return (
    <div style={{padding:24,background:'#0f0f1a',minHeight:'100vh'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:900,color:'#fff',margin:0}}>🚛 Equipment Fleet</h1>
          <p style={{color:'#666',fontSize:13,margin:'4px 0 0'}}>Company-wide equipment tracker</p>
        </div>
        <button onClick={()=>setShowCreate(true)} style={{background:'#D4A017',color:'#000',border:'none',borderRadius:8,padding:'10px 20px',fontWeight:700,cursor:'pointer',fontSize:13}}>+ Add Equipment</button>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
        {[
          {l:'Total Fleet',v:stats.total,c:'#fff'},
          {l:'Available',v:stats.available,c:'#3DD68C'},
          {l:'In Use',v:stats.in_use,c:'#D4A017'},
          {l:'Maintenance',v:stats.maintenance,c:'#F0B429'},
          {l:'Service Due',v:stats.service_due,c:'#F85149'},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:'#16213e',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:'13px 14px',textAlign:'center'}}>
            <div style={{fontSize:24,fontWeight:900,color:c}}>{v}</div>
            <div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'0.07em',marginTop:2}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Status filter */}
      <div style={{display:'flex',gap:0,marginBottom:20,borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
        {['All','Available','In Use','Maintenance','Out of Service'].map(s=>(
          <button key={s} onClick={()=>setFilter(s)}
            style={{background:'none',border:'none',cursor:'pointer',padding:'7px 14px',fontSize:12,fontWeight:filter===s?700:400,color:filter===s?'#fff':'#666',borderBottom:filter===s?'2px solid #D4A017':'2px solid transparent',marginBottom:-1}}>
            {s}
          </button>
        ))}
      </div>

      {loading?(
        <div style={{color:'#555',textAlign:'center',padding:60}}>Loading equipment...</div>
      ):filtered.length===0?(
        <div style={{textAlign:'center',padding:'60px 0'}}>
          <div style={{fontSize:52,marginBottom:12}}>🚛</div>
          <div style={{color:'#ddd',fontSize:17,fontWeight:700,marginBottom:8}}>{equipment.length===0?'No Equipment Yet':'None Here'}</div>
          <div style={{color:'#555',fontSize:13,marginBottom:20}}>Track cranes, forklifts, excavators, and other company equipment.</div>
          {equipment.length===0&&<button onClick={()=>setShowCreate(true)} style={{background:'#D4A017',color:'#000',border:'none',borderRadius:8,padding:'9px 22px',fontWeight:700,cursor:'pointer'}}>Add First Equipment →</button>}
        </div>
      ):(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
          {filtered.map(eq=>{
            const sc=STATUS_CFG[eq.status]||STATUS_CFG.available
            const serviceOverdue=eq.next_service_due&&eq.next_service_due<=today
            const insuranceExpiring=eq.insurance_expiry&&eq.insurance_expiry<=new Date(Date.now()+30*86400000).toISOString().split('T')[0]
            return (
              <div key={eq.id} style={{background:'#16213e',border:`1px solid ${serviceOverdue?'rgba(248,81,73,0.3)':'rgba(255,255,255,0.07)'}`,borderRadius:10,padding:18}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:800,color:'#ddd',marginBottom:3}}>{eq.name}</div>
                    <div style={{fontSize:12,color:'#666'}}>{[eq.year,eq.make,eq.model].filter(Boolean).join(' ') || eq.type}</div>
                  </div>
                  <span style={{fontSize:11,padding:'3px 9px',borderRadius:5,fontWeight:700,background:sc.bg,color:sc.color,whiteSpace:'nowrap'}}>{sc.label}</span>
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:12}}>
                  <span style={{fontSize:11,background:'rgba(255,255,255,0.05)',color:'#888',padding:'2px 7px',borderRadius:4}}>{eq.type}</span>
                  {eq.serial_number&&<span style={{fontSize:10,background:'rgba(255,255,255,0.03)',color:'#555',padding:'2px 7px',borderRadius:4}}>S/N: {eq.serial_number}</span>}
                  {eq.current_location&&<span style={{fontSize:11,background:'rgba(255,255,255,0.05)',color:'#888',padding:'2px 7px',borderRadius:4}}>📍 {eq.current_location}</span>}
                </div>
                {serviceOverdue&&<div style={{fontSize:11,color:'#F85149',marginBottom:8,fontWeight:700}}>⚠️ Service Overdue: {new Date(eq.next_service_due).toLocaleDateString()}</div>}
                {insuranceExpiring&&!serviceOverdue&&<div style={{fontSize:11,color:'#F0B429',marginBottom:8}}>⚡ Insurance Expiring: {new Date(eq.insurance_expiry).toLocaleDateString()}</div>}
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {eq.status!=='available'&&<button onClick={()=>updateStatus(eq.id,'available')} style={{fontSize:11,background:'rgba(61,214,140,0.1)',color:'#3DD68C',border:'1px solid rgba(61,214,140,0.25)',borderRadius:5,padding:'4px 10px',cursor:'pointer',fontWeight:700}}>Mark Available</button>}
                  {eq.status==='available'&&<button onClick={()=>updateStatus(eq.id,'in_use')} style={{fontSize:11,background:'rgba(212,160,23,0.1)',color:'#D4A017',border:'1px solid rgba(212,160,23,0.25)',borderRadius:5,padding:'4px 10px',cursor:'pointer',fontWeight:700}}>Check Out</button>}
                  {eq.status!=='maintenance'&&<button onClick={()=>updateStatus(eq.id,'maintenance')} style={{fontSize:11,background:'rgba(255,255,255,0.05)',color:'#888',border:'1px solid rgba(255,255,255,0.1)',borderRadius:5,padding:'4px 10px',cursor:'pointer'}}>Send to Maintenance</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreate&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:9000,display:'flex',alignItems:'center',justifyContent:'center',overflow:'auto',padding:20}}>
          <div style={{background:'#16213e',border:'1px solid rgba(255,255,255,0.1)',borderRadius:14,padding:28,width:500,maxWidth:'100%',maxHeight:'90vh',overflow:'auto'}}>
            <h3 style={{color:'#fff',margin:'0 0 20px',fontSize:17,fontWeight:900}}>🚛 Add Equipment</h3>
            <form onSubmit={submit}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={{display:'block',fontSize:11,color:'#666',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Equipment Name *</label>
                  <input required value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. 50-Ton Grove Crane"
                    style={{width:'100%',background:'#0f0f1a',border:'1px solid #374151',borderRadius:6,padding:'8px 12px',color:'#fff',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                </div>
                <div>
                  <label style={{display:'block',fontSize:11,color:'#666',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Type</label>
                  <select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}
                    style={{width:'100%',background:'#0f0f1a',border:'1px solid #374151',borderRadius:6,padding:'7px 11px',color:'#fff',fontSize:12}}>
                    {TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                {[
                  {key:'make',label:'Make',ph:'e.g. Caterpillar'},
                  {key:'model',label:'Model',ph:'e.g. 320D'},
                  {key:'year',label:'Year',ph:'2019'},
                  {key:'serial_number',label:'Serial Number',ph:'SN-xxxx'},
                  {key:'current_location',label:'Current Location',ph:'Yard / Job site'},
                  {key:'next_service_due',label:'Next Service Due',ph:''},
                  {key:'insurance_expiry',label:'Insurance Expiry',ph:''},
                ].map(({key,label,ph})=>(
                  <div key={key}>
                    <label style={{display:'block',fontSize:11,color:'#666',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>{label}</label>
                    <input type={key.includes('due')||key.includes('expiry')?'date':'text'} placeholder={ph}
                      value={(form as Record<string,string>)[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}
                      style={{width:'100%',background:'#0f0f1a',border:'1px solid #374151',borderRadius:6,padding:'7px 11px',color:'#fff',fontSize:12,boxSizing:'border-box',outline:'none'}}/>
                  </div>
                ))}
              </div>
              <div style={{display:'flex',gap:8,marginTop:4}}>
                <button type="button" onClick={()=>setShowCreate(false)} style={{flex:1,background:'#374151',color:'#ccc',border:'none',borderRadius:8,padding:10,cursor:'pointer',fontWeight:600}}>Cancel</button>
                <button type="submit" disabled={saving} style={{flex:2,background:saving?'#333':'#D4A017',color:saving?'#555':'#000',border:'none',borderRadius:8,padding:10,cursor:saving?'not-allowed':'pointer',fontWeight:700}}>
                  {saving?'⏳ Saving...':'Add Equipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
