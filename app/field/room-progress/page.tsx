'use client';
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
const GOLD='#D4A017',BASE='#0F1419',TEXT='#F0F4FF',DIM='#8BAAC8',GREEN='#22C55E',BLUE='#3B82F6',RED='#EF4444',BORDER='#1E3A5F';
const glass:React.CSSProperties={background:'rgba(26,31,46,0.85)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:16};
const inp:React.CSSProperties={width:'100%',background:BASE,border:'1px solid '+BORDER,borderRadius:10,padding:'10px 14px',color:TEXT,fontSize:14,outline:'none',boxSizing:'border-box' as const};
const HEAT=[{max:0,color:'#374151'},{max:25,color:'#EF4444'},{max:50,color:'#F97316'},{max:75,color:'#EAB308'},{max:99,color:'#3B82F6'},{max:100,color:'#22C55E'}];
function heatColor(p:number){for(const h of HEAT){if(p<=h.max)return h.color;}return GREEN;}
const STATUSES=['not_started','in_progress','blocked','complete'];
const TRADES=['','General','Electrical','Plumbing','HVAC','Framing','Drywall','Flooring','Paint','Tile','Millwork','Other'];
interface Room{id:string;room_name:string;floor_id?:string;drawing_id?:string;trade?:string;status:string;percent_complete:number;notes?:string;polygon_points?:{x:number;y:number}[];}
interface Edit{percent_complete:number;status:string;notes:string;trade:string;}
function RoomProgressPage(){
const searchParams=useSearchParams();const router=useRouter();
const param=searchParams.get('projectId')||searchParams.get('project_id')||'';
const [projectId,setProjectId]=useState(param);
const [rooms,setRooms]=useState<Room[]>([]);const [loading,setLoading]=useState(true);
const [online,setOnline]=useState(true);const [saving,setSaving]=useState(false);
const [edits,setEdits]=useState<Record<string,Edit>>({});
const [showAdd,setShowAdd]=useState(false);
const [newRoom,setNewRoom]=useState({room_name:'',floor_id:'',trade:'',notes:''});
const [filterFloor,setFilterFloor]=useState('all');const [filterStatus,setFilterStatus]=useState('all');
const [refreshing,setRefreshing]=useState(false);
useEffect(()=>{const s=typeof window!=='undefined'?localStorage.getItem('sag_active_project'):null;if(!projectId&&s)setProjectId(s);},[projectId]);
useEffect(()=>{setOnline(navigator.onLine);const on=()=>setOnline(true);const off=()=>setOnline(false);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);};},[]);
const fetchRooms=useCallback(async()=>{if(!projectId){setLoading(false);return;}try{const res=await fetch('/api/field/room-progress?project_id='+projectId);if(res.ok){const d=await res.json();setRooms(d.rooms||[]);}}catch{}setLoading(false);},[projectId]);
useEffect(()=>{fetchRooms();},[fetchRooms]);
useEffect(()=>{const init:Record<string,Edit>={};for(const r of rooms)init[r.id]={percent_complete:r.percent_complete,status:r.status||'not_started',notes:r.notes||'',trade:r.trade||''};setEdits(init);},[rooms]);
const saveRoom=async(id:string)=>{const edit=edits[id];if(!edit)return;const payload={id,...edit};try{if(!online)throw new Error('offline');const res=await fetch('/api/field/room-progress',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!res.ok)throw new Error('');const d=await res.json();setRooms(p=>p.map(r=>r.id===id?{...r,...d.room}:r));}catch{await enqueue({url:'/api/field/room-progress',method:'PUT',body:JSON.stringify(payload),contentType:'application/json',isFormData:false});setRooms(p=>p.map(r=>r.id===id?{...r,...edit}:r));}};
const saveAll=async()=>{setSaving(true);for(const[id,edit]of Object.entries(edits)){const r=rooms.find(x=>x.id===id);if(!r)continue;if(r.percent_complete!==edit.percent_complete||r.status!==edit.status||(r.notes||'')!==edit.notes)await saveRoom(id);}setSaving(false);await fetchRooms();};
const addRoom=async()=>{if(!newRoom.room_name.trim()||!projectId)return;setSaving(true);const payload={project_id:projectId,room_name:newRoom.room_name.trim(),floor_id:newRoom.floor_id||null,trade:newRoom.trade||null,notes:newRoom.notes||null,percent_complete:0,status:'not_started'};try{if(!online)throw new Error('offline');const res=await fetch('/api/field/room-progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!res.ok)throw new Error('');const d=await res.json();if(d.room)setRooms(p=>[...p,d.room]);}catch{await enqueue({url:'/api/field/room-progress',method:'POST',body:JSON.stringify(payload),contentType:'application/json',isFormData:false});setRooms(p=>[...p,{id:'local-'+Date.now(),...payload} as Room]);}setNewRoom({room_name:'',floor_id:'',trade:'',notes:''});setShowAdd(false);setSaving(false);};
const floors=['all',...Array.from(new Set(rooms.map(r=>r.floor_id||'Unassigned')))];
const filtered=rooms.filter(r=>(filterFloor==='all'||(r.floor_id||'Unassigned')===filterFloor)&&(filterStatus==='all'||r.status===filterStatus));
const avg=rooms.length>0?Math.round(rooms.reduce((s,r)=>s+(r.percent_complete||0),0)/rooms.length):0;
const hasDirty=Object.keys(edits).some(id=>{const r=rooms.find(x=>x.id===id);const e=edits[id];return r&&e&&(r.percent_complete!==e.percent_complete||r.status!==e.status);});
return(
<div style={{padding:'18px 16px',minHeight:'100%'}}>
<button onClick={()=>router.back()} style={{background:'none',border:'none',color:DIM,fontSize:14,cursor:'pointer',padding:'0 0 10px',display:'flex',alignItems:'center',gap:6}}>
<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2.2} strokeLinecap='round' strokeLinejoin='round' width={20} height={20}><line x1={19} y1={12} x2={5} y2={12}/><polyline points='12 19 5 12 12 5'/></svg>Back</button>
<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
<h1 style={{margin:0,fontSize:22,fontWeight:800,color:TEXT}}>Room Progress</h1>
<div style={{display:'flex',gap:6}}>
<button onClick={async()=>{setRefreshing(true);await fetchRooms();setRefreshing(false);}} style={{...glass,padding:'7px 12px',cursor:'pointer',color:DIM,fontSize:14,border:'none'}}>{refreshing?'...':String.fromCharCode(8635)}</button>
<button onClick={()=>setShowAdd(!showAdd)} style={{...glass,padding:'7px 14px',cursor:'pointer',color:GOLD,fontSize:12,fontWeight:700,border:'1px solid '+GOLD}}>+ Add Room</button>
</div></div>
<p style={{margin:'0 0 16px',fontSize:13,color:DIM}}>{rooms.length} rooms {avg}% avg{!online&&<span style={{color:RED,marginLeft:8}}>Offline</span>}</p>
<div style={{...glass,padding:'12px 16px',marginBottom:16}}>
<div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><span style={{fontSize:12,fontWeight:700,color:DIM}}>Overall Progress</span><span style={{fontSize:14,fontWeight:800,color:heatColor(avg)}}>{avg}%</span></div>
<div style={{height:8,background:'rgba(255,255,255,0.06)',borderRadius:6,overflow:'hidden'}}><div style={{height:'100%',width:avg+'%',background:heatColor(avg),borderRadius:6,transition:'width 0.4s'}}/></div>
<div style={{display:'flex',gap:12,marginTop:10,flexWrap:'wrap'}}>{STATUSES.map(s=>{const c=rooms.filter(r=>r.status===s).length;return c>0?(<span key={s} style={{fontSize:11,color:DIM}}><span style={{fontWeight:700,color:s==='complete'?GREEN:s==='blocked'?RED:s==='in_progress'?BLUE:DIM}}>{c}</span> {s.replace('_',' ')}</span>):null;})}</div>
</div>
{showAdd&&(<div style={{...glass,padding:16,marginBottom:16}}><p style={{margin:'0 0 12px',fontSize:14,fontWeight:700,color:TEXT}}>New Room</p><div style={{display:'flex',flexDirection:'column',gap:10}}><input value={newRoom.room_name} onChange={e=>setNewRoom(p=>({...p,room_name:e.target.value}))} placeholder='Room name *' style={inp}/><div style={{display:'flex',gap:10}}><input value={newRoom.floor_id} onChange={e=>setNewRoom(p=>({...p,floor_id:e.target.value}))} placeholder='Floor (1, B1...)' style={{...inp,flex:1}}/><select value={newRoom.trade} onChange={e=>setNewRoom(p=>({...p,trade:e.target.value}))} style={{...inp,flex:1}}>{TRADES.map(t=><option key={t} value={t}>{t||'Trade...'}</option>)}</select></div><textarea value={newRoom.notes} onChange={e=>setNewRoom(p=>({...p,notes:e.target.value}))} placeholder='Notes' rows={2} style={inp}/><div style={{display:'flex',gap:10}}><button onClick={()=>setShowAdd(false)} style={{flex:1,background:'transparent',border:'1px solid '+BORDER,borderRadius:10,padding:'10px',color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button><button onClick={addRoom} disabled={saving||!newRoom.room_name.trim()} style={{flex:2,background:GOLD,border:'none',borderRadius:10,padding:'10px',color:'#000',fontSize:14,fontWeight:800,cursor:'pointer'}}>{saving?'Saving...':'Add Room'}</button></div></div></div>)}
<div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}><select value={filterFloor} onChange={e=>setFilterFloor(e.target.value)} style={{...inp,width:'auto',flex:1,minWidth:100}}>{floors.map(f=><option key={f} value={f}>{f==='all'?'All Floors':'Floor '+f}</option>)}</select><select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{...inp,width:'auto',flex:1,minWidth:120}}><option value='all'>All Statuses</option>{STATUSES.map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}</select>{hasDirty&&<button onClick={saveAll} disabled={saving} style={{background:GREEN,border:'none',borderRadius:10,padding:'10px 16px',color:'#000',fontSize:13,fontWeight:800,cursor:'pointer'}}>{saving?'Saving...':'Save All'}</button>}</div>
{loading?(<div style={{display:'flex',flexDirection:'column',gap:8}}>{[1,2,3].map(i=><div key={i} style={{...glass,padding:16,height:80}}><div style={{background:'rgba(255,255,255,0.04)',borderRadius:8,height:14,width:'50%',marginBottom:8}}/><div style={{background:'rgba(255,255,255,0.03)',borderRadius:6,height:8,width:'100%'}}/></div>)}</div>
):filtered.length===0?(<div style={{...glass,padding:'40px 24px',textAlign:'center'}}><div style={{fontSize:40,marginBottom:10}}>&#127959;</div><p style={{margin:'0 0 4px',fontSize:15,fontWeight:700,color:TEXT}}>{rooms.length===0?'No Rooms Yet':'No Matching Rooms'}</p><p style={{margin:0,fontSize:12,color:DIM}}>{rooms.length===0?'Draw rooms on the floor plan or add them above.':'Try adjusting your filters.'}</p></div>
):(<div style={{display:'flex',flexDirection:'column',gap:8}}>{filtered.map(room=>{
const edit=edits[room.id]||{percent_complete:room.percent_complete,status:room.status,notes:room.notes||'',trade:room.trade||''};
const dirty=room.percent_complete!==edit.percent_complete||room.status!==edit.status||(room.notes||'')!==edit.notes;
return(<div key={room.id} style={{...glass,padding:14,borderLeft:'3px solid '+heatColor(edit.percent_complete)}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
<div><p style={{margin:0,fontSize:14,fontWeight:700,color:TEXT}}>{room.room_name}</p>
<p style={{margin:'2px 0 0',fontSize:11,color:DIM}}>{room.floor_id?'Floor '+room.floor_id:'No floor'}{edit.trade?' · '+edit.trade:''}{room.drawing_id?' · 📐':''}</p></div>
<span style={{fontSize:16,fontWeight:900,color:heatColor(edit.percent_complete)}}>{edit.percent_complete}%</span></div>
<input type='range' min={0} max={100} step={5} value={edit.percent_complete} onChange={e=>setEdits(p=>({...p,[room.id]:{...p[room.id],percent_complete:parseInt(e.target.value)}}))} style={{width:'100%',accentColor:heatColor(edit.percent_complete),marginBottom:8}}/>
<div style={{height:5,background:'rgba(255,255,255,0.06)',borderRadius:4,overflow:'hidden',marginBottom:10}}><div style={{height:'100%',width:edit.percent_complete+'%',background:heatColor(edit.percent_complete),borderRadius:4,transition:'width 0.2s'}}/></div>
<div style={{display:'flex',gap:8,marginBottom:dirty?10:0}}><select value={edit.status} onChange={e=>setEdits(p=>({...p,[room.id]:{...p[room.id],status:e.target.value}}))} style={{...inp,flex:1,padding:'7px 10px',fontSize:12}}>{STATUSES.map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}</select><select value={edit.trade} onChange={e=>setEdits(p=>({...p,[room.id]:{...p[room.id],trade:e.target.value}}))} style={{...inp,flex:1,padding:'7px 10px',fontSize:12}}>{TRADES.map(t=><option key={t} value={t}>{t||'Trade...'}</option>)}</select></div>
{dirty&&<button onClick={()=>saveRoom(room.id)} disabled={saving} style={{width:'100%',background:GREEN,border:'none',borderRadius:10,padding:'9px',color:'#000',fontSize:13,fontWeight:800,cursor:'pointer',marginTop:6}}>{saving?'Saving...':'Save'}</button>}
</div>);})}
</div>)}
<div style={{...glass,padding:'10px 14px',marginTop:16}}><p style={{margin:'0 0 6px',fontSize:10,fontWeight:700,color:DIM}}>Legend</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{[{c:'#374151',l:'Not started'},{c:'#EF4444',l:'1-25%'},{c:'#F97316',l:'26-50%'},{c:'#EAB308',l:'51-75%'},{c:'#3B82F6',l:'76-99%'},{c:'#22C55E',l:'Complete'}].map(h=>(<div key={h.l} style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:12,height:12,borderRadius:3,background:h.c}}/><span style={{fontSize:10,color:DIM}}>{h.l}</span></div>))}</div></div>
<style>{String.raw`input[type=range]{-webkit-appearance:none;height:6px;border-radius:4px;background:rgba(255,255,255,0.1);outline:none}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;cursor:pointer}`}</style>
</div>
);
}
export default function FieldRoomProgressPage(){return(<Suspense fallback={<div style={{padding:32,color:'#8BAAC8',textAlign:'center'}}>Loading...</div>}><RoomProgressPage/></Suspense>);}
