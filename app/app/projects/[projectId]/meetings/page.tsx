'use client'
import { useState, useEffect } from 'react'

interface Meeting { id:string;title:string;meeting_type:string;meeting_date:string;location:string;chair:string;attendees:string[];agenda_items:string[];notes:string;action_items:ActionItem[];status:string;created_at:string }
interface ActionItem { who:string;what:string;by_when:string;status:string }

const TYPES=['OAC','Subcontractor','Pre-Construction','Safety','Progress','Kick-Off','Design','Other']

export default function MeetingsPage({ params }: { params: Promise<{projectId:string}> }) {
  const [projectId,setProjectId]=useState('')
  const [meetings,setMeetings]=useState<Meeting[]>([])
  const [loading,setLoading]=useState(true)
  const [showCreate,setShowCreate]=useState(false)
  const [expanded,setExpanded]=useState<string|null>(null)
  const [generating,setGenerating]=useState<string|null>(null)
  const [form,setForm]=useState({title:'',meeting_type:'OAC',meeting_date:'',location:'',chair:'',notes:'',attendees_raw:'',agenda_raw:'',actions_raw:''})
  const [saving,setSaving]=useState(false)

  useEffect(()=>{
    params.then(p=>{
      setProjectId(p.projectId)
      fetch(`/api/meetings?projectId=${p.projectId}`)
        .then(r=>r.json()).then(d=>{setMeetings(d.meetings||[]);setLoading(false)})
    })
  },[params])

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setSaving(true)
    const attendees=form.attendees_raw.split('\n').filter(Boolean)
    const agenda_items=form.agenda_raw.split('\n').filter(Boolean)
    const action_items=form.actions_raw.split('\n').filter(Boolean).map(line=>{
      const parts=line.split('|');return{who:parts[0]?.trim()||'',what:parts[1]?.trim()||line,by_when:parts[2]?.trim()||'',status:'open'}
    })
    const res=await fetch('/api/meetings',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...form,attendees,agenda_items,action_items,projectId})})
    const d=await res.json();setSaving(false)
    if(res.ok){setMeetings(p=>[d.meeting,...p]);setShowCreate(false)}
  }

  const generateMinutes=async(meeting:Meeting)=>{
    setGenerating(meeting.id)
    const res=await fetch(`/api/meetings/${meeting.id}/generate-minutes`,{method:'POST'})
    const d=await res.json();setGenerating(null)
    if(res.ok&&d.htmlContent) window.open(URL.createObjectURL(new Blob([d.htmlContent],{type:'text/html'})),'_blank')
  }

  return (
    <div style={{padding:24,background:'#0f0f1a',minHeight:'100vh'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:900,color:'#fff',margin:0}}>📝 Meetings</h1>
          <p style={{color:'#666',fontSize:13,margin:'4px 0 0'}}>{meetings.length} recorded</p>
        </div>
        <button onClick={()=>setShowCreate(true)} style={{background:'#D4A017',color:'#000',border:'none',borderRadius:8,padding:'10px 20px',fontWeight:700,cursor:'pointer',fontSize:13}}>
          + Log Meeting
        </button>
      </div>

      {loading?(
        <div style={{color:'#555',textAlign:'center',padding:60}}>Loading...</div>
      ):meetings.length===0?(
        <div style={{textAlign:'center',padding:'70px 0'}}>
          <div style={{fontSize:52,marginBottom:14}}>📝</div>
          <div style={{color:'#ddd',fontSize:18,fontWeight:700,marginBottom:8}}>No Meetings Yet</div>
          <div style={{color:'#555',fontSize:14,marginBottom:24}}>Log OAC meetings, pre-con meetings, and subcontractor meetings.</div>
          <button onClick={()=>setShowCreate(true)} style={{background:'#D4A017',color:'#000',border:'none',borderRadius:8,padding:'10px 24px',fontWeight:700,cursor:'pointer'}}>Log First Meeting →</button>
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {meetings.map(m=>(
            <div key={m.id} style={{background:'#16213e',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,overflow:'hidden'}}>
              <div onClick={()=>setExpanded(e=>e===m.id?null:m.id)}
                style={{padding:'16px 20px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:800,color:'#ddd'}}>{m.title}</div>
                    <div style={{fontSize:12,color:'#555',marginTop:3}}>
                      {new Date(m.meeting_date).toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric'})}
                      {m.location&&` · ${m.location}`}
                      {m.chair&&` · Chaired by ${m.chair}`}
                    </div>
                  </div>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:11,background:'rgba(212,160,23,0.1)',color:'#D4A017',padding:'3px 8px',borderRadius:4,fontWeight:700}}>{m.meeting_type}</span>
                  {m.action_items?.length>0&&<span style={{fontSize:11,background:'rgba(248,81,73,0.1)',color:'#F85149',padding:'3px 8px',borderRadius:4}}>{m.action_items.filter((a:ActionItem)=>a.status==='open').length} open actions</span>}
                  <span style={{color:'#555',fontSize:16}}>{expanded===m.id?'▲':'▼'}</span>
                </div>
              </div>

              {expanded===m.id&&(
                <div style={{padding:'0 20px 20px',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                  {m.attendees?.length>0&&(
                    <div style={{marginTop:16,marginBottom:12}}>
                      <div style={{fontSize:11,color:'#555',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>Attendees</div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                        {m.attendees.map((a:string,i:number)=>(
                          <span key={i} style={{fontSize:12,background:'rgba(96,165,250,0.1)',color:'#60A5FA',padding:'3px 10px',borderRadius:20}}>{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {m.agenda_items?.length>0&&(
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,color:'#555',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>Agenda</div>
                      <ol style={{margin:0,paddingLeft:18}}>
                        {m.agenda_items.map((item:string,i:number)=>(
                          <li key={i} style={{color:'#aaa',fontSize:13,marginBottom:4}}>{item}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {m.notes&&(
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,color:'#555',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Notes</div>
                      <div style={{color:'#888',fontSize:13,lineHeight:1.6,background:'rgba(255,255,255,0.02)',borderRadius:6,padding:12}}>{m.notes}</div>
                    </div>
                  )}
                  {m.action_items?.length>0&&(
                    <div style={{marginBottom:16}}>
                      <div style={{fontSize:11,color:'#555',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>Action Items</div>
                      <table style={{width:'100%',borderCollapse:'collapse'}}>
                        <thead><tr>{['Who','Action','Due','Status'].map(h=><th key={h} style={{textAlign:'left',padding:'6px 10px',fontSize:10,color:'#444',textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>{h}</th>)}</tr></thead>
                        <tbody>
                          {m.action_items.map((a:ActionItem,i:number)=>(
                            <tr key={i}>
                              <td style={{padding:'7px 10px',color:'#aaa',fontSize:12,fontWeight:600}}>{a.who}</td>
                              <td style={{padding:'7px 10px',color:'#ddd',fontSize:12}}>{a.what}</td>
                              <td style={{padding:'7px 10px',color:'#666',fontSize:12}}>{a.by_when||'—'}</td>
                              <td style={{padding:'7px 10px'}}><span style={{fontSize:11,padding:'2px 7px',borderRadius:4,background:a.status==='complete'?'rgba(61,214,140,0.12)':'rgba(248,81,73,0.1)',color:a.status==='complete'?'#3DD68C':'#F85149',fontWeight:700}}>{a.status==='complete'?'Done':'Open'}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <button onClick={()=>generateMinutes(m)} disabled={generating===m.id}
                    style={{background:generating===m.id?'#333':'rgba(212,160,23,0.1)',color:generating===m.id?'#555':'#D4A017',border:'1px solid rgba(212,160,23,0.3)',borderRadius:7,padding:'8px 18px',cursor:generating===m.id?'not-allowed':'pointer',fontWeight:700,fontSize:12}}>
                    {generating===m.id?'⏳ Generating...':'✨ Generate AI Meeting Minutes'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:9000,display:'flex',alignItems:'center',justifyContent:'center',overflow:'auto',padding:20}}>
          <div style={{background:'#16213e',border:'1px solid rgba(255,255,255,0.1)',borderRadius:14,padding:28,width:580,maxWidth:'100%',maxHeight:'90vh',overflow:'auto'}}>
            <h3 style={{color:'#fff',margin:'0 0 20px',fontSize:17,fontWeight:900}}>📝 Log Meeting</h3>
            <form onSubmit={submit}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={{display:'block',fontSize:11,color:'#666',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Meeting Title *</label>
                  <input required value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="e.g. OAC Meeting #5 — Mesa Commerce Center"
                    style={{width:'100%',background:'#0f0f1a',border:'1px solid #374151',borderRadius:6,padding:'8px 12px',color:'#fff',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                </div>
                {[
                  {key:'meeting_date',label:'Date *',type:'date',req:true,ph:''},
                  {key:'location',label:'Location',type:'text',req:false,ph:'Conference room, site office, etc.'},
                  {key:'chair',label:'Meeting Chair',type:'text',req:false,ph:'Who ran the meeting?'},
                ].map(({key,label,type,req,ph})=>(
                  <div key={key}>
                    <label style={{display:'block',fontSize:11,color:'#666',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>{label}</label>
                    <input type={type} required={req} placeholder={ph} value={(form as Record<string,string>)[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}
                      style={{width:'100%',background:'#0f0f1a',border:'1px solid #374151',borderRadius:6,padding:'7px 11px',color:'#fff',fontSize:12,boxSizing:'border-box',outline:'none'}}/>
                  </div>
                ))}
                <div>
                  <label style={{display:'block',fontSize:11,color:'#666',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Meeting Type</label>
                  <select value={form.meeting_type} onChange={e=>setForm(p=>({...p,meeting_type:e.target.value}))}
                    style={{width:'100%',background:'#0f0f1a',border:'1px solid #374151',borderRadius:6,padding:'7px 11px',color:'#fff',fontSize:12}}>
                    {TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              {[
                {key:'attendees_raw',label:'Attendees (one per line)',ph:'John Smith - Owner\nSarah Chen - Architect\nChad Derocher - GC',rows:3},
                {key:'agenda_raw',label:'Agenda Items (one per line)',ph:'1. Review RFI log\n2. Change order status\n3. Schedule update',rows:3},
                {key:'notes',label:'Meeting Notes / Discussion',ph:'Summary of what was discussed...',rows:4},
                {key:'actions_raw',label:'Action Items (format: Who | What | By When)',ph:'Chad | Submit CO-004 to owner | 2026-04-25\nSarah | Respond to RFI-011 | 2026-04-22',rows:3},
              ].map(({key,label,ph,rows})=>(
                <div key={key} style={{marginBottom:12}}>
                  <label style={{display:'block',fontSize:11,color:'#666',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>{label}</label>
                  <textarea value={(form as Record<string,string>)[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} placeholder={ph} rows={rows}
                    style={{width:'100%',background:'#0f0f1a',border:'1px solid #374151',borderRadius:6,padding:'8px 12px',color:'#fff',fontSize:12,boxSizing:'border-box',outline:'none',resize:'vertical',fontFamily:'inherit'}}/>
                </div>
              ))}
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <button type="button" onClick={()=>setShowCreate(false)} style={{flex:1,background:'#374151',color:'#ccc',border:'none',borderRadius:8,padding:10,cursor:'pointer',fontWeight:600}}>Cancel</button>
                <button type="submit" disabled={saving} style={{flex:2,background:saving?'#333':'#D4A017',color:saving?'#555':'#000',border:'none',borderRadius:8,padding:10,cursor:saving?'not-allowed':'pointer',fontWeight:700}}>
                  {saving?'⏳ Saving...':'Log Meeting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
