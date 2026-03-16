'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';
const GREEN='#1a8a4a',RED='#c03030';

const ALBUMS=['General','Progress','Inspections','Closeout','Issues','Other'];
const ALBUM_COLORS:Record<string,string>={
  General:DIM,
  Progress:'#60a5fa',
  Inspections:GOLD,
  Closeout:GREEN,
  Issues:RED,
  Other:'#a78bfa',
};

const inp:React.CSSProperties={
  width:'100%',padding:'9px 12px',background:'#151f2e',
  border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,
  fontSize:13,outline:'none',boxSizing:'border-box',
};

const EMPTY_FORM={
  title:'',description:'',album:'General',location:'',
  taken_at:'',url:'',taken_by:'',tags:'',
};

function Pill({label,color}:{label:string;color:string}){
  return(
    <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:20,
      background:`${color}22`,color,textTransform:'uppercase',letterSpacing:.3}}>
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

export default function PhotosPage(){
  const {projectId}=useParams() as {projectId:string};
  const [photos,setPhotos]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [selected,setSelected]=useState<any>(null);
  const [mode,setMode]=useState<'view'|'edit'|'create'|null>(null);
  const [form,setForm]=useState({...EMPTY_FORM});
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [toast,setToast]=useState<{msg:string;type:'success'|'error'}|null>(null);
  const [search,setSearch]=useState('');
  const [filterAlbum,setFilterAlbum]=useState('All');

  const showToast=(msg:string,type:'success'|'error'='success')=>{
    setToast({msg,type}); setTimeout(()=>setToast(null),4000);
  };

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch(`/api/photos/list?projectId=${projectId}`,{headers:h});
      if (!r.ok) throw new Error('Failed to load data');
      const d=await r.json();
      setPhotos(d.photos||[]);
    }catch{setPhotos([]);setLoadError('Failed to load. Please try again.');}
    finally{setLoading(false);}
  },[projectId]);

  useEffect(()=>{load();},[load]);

  function openCreate(){setForm({...EMPTY_FORM});setMode('create');setSelected(null);}
  function openEdit(photo:any){
    const tagsStr=Array.isArray(photo.tags)?photo.tags.join(', '):(photo.tags||'');
    setForm({
      title:photo.title||'',
      description:photo.description||'',
      album:photo.album||'General',
      location:photo.location||'',
      taken_at:photo.taken_at?photo.taken_at.substring(0,10):'',
      url:photo.url||'',
      taken_by:photo.taken_by||'',
      tags:tagsStr,
    });
    setSelected(photo);setMode('edit');
  }
  function viewPhoto(photo:any){setSelected(photo);setMode('view');}
  function closePanel(){setSelected(null);setMode(null);}

  async function save(){
    if(!form.title.trim()){showToast('Title is required','error');return;}
    setSaving(true);
    try{
      const h=await getAuthHeaders();
      const tagsArray=form.tags.split(',').map((t:string)=>t.trim()).filter(Boolean);
      const payload={
        ...form,
        tags:tagsArray,
        taken_at:form.taken_at?new Date(form.taken_at+'T12:00:00').toISOString():new Date().toISOString(),
      };
      if(mode==='create'){
        const r=await fetch('/api/photos/create',{
          method:'POST',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify({...payload,projectId}),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Photo added');
      }else if(mode==='edit'&&selected){
        const r=await fetch(`/api/photos/${selected.id}`,{
          method:'PUT',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify(payload),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Photo updated');
      }
      await load();closePanel();
    }catch(e:any){showToast(e.message||'Save failed','error');}
    finally{setSaving(false);}
  }

  async function deletePhoto(photo:any){
    if(!confirm(`Delete "${photo.title}"?`)) return;
    setDeleting(true);
    try{
      const h=await getAuthHeaders();
      const dr=await fetch(`/api/photos/${photo.id}`,{method:'DELETE',headers:h});
      if (!dr.ok) throw new Error('Delete failed');
      showToast('Photo deleted');closePanel();await load();
    }catch{showToast('Delete failed','error');}
    finally{setDeleting(false);}
  }

  const today=new Date();
  const thisMonth=photos.filter(p=>{
    if(!p.taken_at) return false;
    const d=new Date(p.taken_at);
    return d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth();
  }).length;
  const albums=Array.from(new Set(photos.map((p:any)=>p.album).filter(Boolean)));
  const issueCount=photos.filter((p:any)=>p.album==='Issues'||(Array.isArray(p.tags)&&p.tags.some((t:string)=>t.toLowerCase().includes('issue')))).length;

  const filtered=photos.filter((p:any)=>{
    const ms=!search||(p.title||'').toLowerCase().includes(search.toLowerCase())
      ||(Array.isArray(p.tags)&&p.tags.some((t:string)=>t.toLowerCase().includes(search.toLowerCase())));
    const ma=filterAlbum==='All'||p.album===filterAlbum;
    return ms&&ma;
  });

  // Group by album for display
  const grouped:Record<string,any[]>={};
  if(filterAlbum==='All'){
    for(const p of filtered){
      const al=p.album||'General';
      if(!grouped[al]) grouped[al]=[];
      grouped[al].push(p);
    }
  }

  function fmtDate(iso:string|null|undefined){
    if(!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
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
        {/* Header */}
        <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,
          display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
          <div>
            <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Photos</h2>
            <div style={{fontSize:12,color:DIM,marginTop:3}}>Site progress photos and documentation</div>
          </div>
          <button onClick={openCreate}
            style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,
              border:'none',borderRadius:7,color:DARK,fontSize:13,fontWeight:800,cursor:'pointer'}}>
            + Add Photo
          </button>
        </div>

        <div style={{padding:24}}>
          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
            {[
              {l:'Total Photos',v:String(photos.length),c:'#60a5fa'},
              {l:'This Month',v:String(thisMonth),c:GOLD},
              {l:'Albums',v:String(albums.length||ALBUMS.length),c:GREEN},
              {l:'Issues Tagged',v:String(issueCount),c:RED},
            ].map(k=>(
              <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',color:DIM,marginBottom:6}}>{k.l}</div>
                <div style={{fontSize:22,fontWeight:800,color:k.c}}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search by title or tag..."
              style={{flex:1,minWidth:180,padding:'8px 12px',background:RAISED,
                border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none'}}/>
            <select value={filterAlbum} onChange={e=>setFilterAlbum(e.target.value)}
              style={{padding:'8px 12px',background:RAISED,border:`1px solid ${BORDER}`,
                borderRadius:7,color:filterAlbum!=='All'?TEXT:DIM,fontSize:13,outline:'none'}}>
              <option value="All">All Albums</option>
              {ALBUMS.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {loading&&<div style={{padding:40,textAlign:'center',color:DIM}}>Loading photos...</div>}

          {!loading&&loadError&&(
            <div style={{background:'rgba(192,48,48,.12)',border:'1px solid rgba(192,48,48,.3)',borderRadius:8,padding:'12px 16px',marginBottom:20,color:'#c03030',fontSize:13}}>
              {loadError}
            </div>
          )}

          {!loading&&filtered.length===0&&(
            <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,
              padding:56,textAlign:'center'}}>
              <div style={{fontSize:40,marginBottom:14}}>📷</div>
              <div style={{fontWeight:800,fontSize:16,color:TEXT,marginBottom:8}}>
                {photos.length===0?'No photos yet':'No photos match your filters'}
              </div>
              <div style={{fontSize:13,color:DIM,marginBottom:24}}>
                {photos.length===0?'Add site photos to document project progress.':'Try adjusting your filters.'}
              </div>
              {photos.length===0&&(
                <button onClick={openCreate}
                  style={{padding:'10px 24px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,
                    border:'none',borderRadius:8,color:DARK,fontSize:13,fontWeight:800,cursor:'pointer'}}>
                  + Add First Photo
                </button>
              )}
            </div>
          )}

          {/* Album-grouped grid */}
          {!loading&&filtered.length>0&&filterAlbum==='All'&&(
            <div style={{display:'flex',flexDirection:'column',gap:28}}>
              {Object.entries(grouped).map(([album,albumPhotos])=>(
                <div key={album}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                    <span style={{fontSize:13,fontWeight:700,color:ALBUM_COLORS[album]||DIM}}>{album}</span>
                    <span style={{fontSize:11,color:DIM}}>({albumPhotos.length})</span>
                    <div style={{flex:1,height:1,background:BORDER}}/>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:14}}>
                    {albumPhotos.map((photo:any)=>(
                      <PhotoCard key={photo.id} photo={photo} selected={selected?.id===photo.id&&mode==='view'}
                        onClick={()=>viewPhoto(photo)} albumColor={ALBUM_COLORS[photo.album]||DIM}/>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Flat grid when filtered by album */}
          {!loading&&filtered.length>0&&filterAlbum!=='All'&&(
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:14}}>
              {filtered.map((photo:any)=>(
                <PhotoCard key={photo.id} photo={photo} selected={selected?.id===photo.id&&mode==='view'}
                  onClick={()=>viewPhoto(photo)} albumColor={ALBUM_COLORS[photo.album]||DIM}/>
              ))}
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
              {mode==='create'?'Add Photo':mode==='edit'?'Edit Photo':'Photo Detail'}
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
                  <button onClick={()=>deletePhoto(selected)} disabled={deleting}
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
                <div>
                  <FieldLabel label="Title *"/>
                  <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
                    style={inp} placeholder="e.g. Foundation pour complete"/>
                </div>
                <div>
                  <FieldLabel label="Album"/>
                  <select value={form.album} onChange={e=>setForm(f=>({...f,album:e.target.value}))}
                    style={{...inp,padding:'9px 10px'}}>
                    {ALBUMS.map(a=><option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel label="Description"/>
                  <textarea value={form.description}
                    onChange={e=>setForm(f=>({...f,description:e.target.value}))}
                    rows={3} style={{...inp,resize:'vertical',lineHeight:1.5}}
                    placeholder="What does this photo show?"/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <FieldLabel label="Location"/>
                    <input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))}
                      style={inp} placeholder="e.g. Level 2, North"/>
                  </div>
                  <div>
                    <FieldLabel label="Date Taken"/>
                    <input type="date" value={form.taken_at}
                      onChange={e=>setForm(f=>({...f,taken_at:e.target.value}))}
                      style={inp}/>
                  </div>
                </div>
                <div>
                  <FieldLabel label="Photo URL"/>
                  <input value={form.url} onChange={e=>setForm(f=>({...f,url:e.target.value}))}
                    style={inp} placeholder="https://..."/>
                </div>
                <div>
                  <FieldLabel label="Taken By"/>
                  <input value={form.taken_by} onChange={e=>setForm(f=>({...f,taken_by:e.target.value}))}
                    style={inp} placeholder="Name or initials"/>
                </div>
                <div>
                  <FieldLabel label="Tags (comma-separated)"/>
                  <input value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))}
                    style={inp} placeholder="e.g. concrete, footing, issue"/>
                </div>
                <div style={{display:'flex',gap:10,paddingTop:4}}>
                  <button onClick={save} disabled={saving}
                    style={{flex:1,padding:'11px 0',
                      background:`linear-gradient(135deg,${GOLD},#F0C040)`,
                      border:'none',borderRadius:8,color:DARK,
                      fontSize:14,fontWeight:800,cursor:'pointer',opacity:saving?0.6:1}}>
                    {saving?'Saving...':mode==='create'?'Add Photo':'Save Changes'}
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
                {/* Large image */}
                {selected.url?(
                  <div style={{borderRadius:10,overflow:'hidden',border:`1px solid ${BORDER}`}}>
                    <img src={selected.url} alt={selected.title}
                      style={{width:'100%',maxHeight:280,objectFit:'cover',display:'block'}}
                      onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
                  </div>
                ):(
                  <div style={{height:160,background:RAISED,borderRadius:10,border:`1px solid ${BORDER}`,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    color:DIM,fontSize:13}}>No image URL</div>
                )}

                {/* Title + album */}
                <div>
                  <div style={{fontSize:16,fontWeight:800,color:TEXT,marginBottom:8}}>{selected.title}</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <Pill label={selected.album||'General'} color={ALBUM_COLORS[selected.album]||DIM}/>
                  </div>
                </div>

                {/* Description */}
                {selected.description&&(
                  <div style={{background:'#1a2535',border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>Description</div>
                    <div style={{fontSize:13,color:TEXT,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{selected.description}</div>
                  </div>
                )}

                {/* Metadata grid */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <InfoCard label="Date Taken" value={fmtDate(selected.taken_at)}/>
                  <InfoCard label="Location" value={selected.location}/>
                  <InfoCard label="Taken By" value={selected.taken_by}/>
                </div>

                {/* Tags */}
                {Array.isArray(selected.tags)&&selected.tags.length>0&&(
                  <div style={{background:'#1a2535',border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:8}}>Tags</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {selected.tags.map((tag:string)=>(
                        <span key={tag} style={{padding:'3px 10px',borderRadius:20,background:`${GOLD}22`,
                          color:GOLD,fontSize:11,fontWeight:600}}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* URL link */}
                {selected.url&&(
                  <a href={selected.url} target="_blank" rel="noreferrer"
                    style={{display:'block',padding:'10px 14px',background:'rgba(59,130,246,.1)',
                      border:'1px solid rgba(59,130,246,.3)',borderRadius:8,
                      color:'#60a5fa',fontSize:13,fontWeight:700,textDecoration:'none',textAlign:'center'}}>
                    View Full Image
                  </a>
                )}
              </div>
            ):null}
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoCard({photo,selected,onClick,albumColor}:{
  photo:any;selected:boolean;onClick:()=>void;albumColor:string;
}){
  const BORDER_C='#263347';
  const RAISED_C='#1f2c3e';
  const DIM_C='#8fa3c0';
  const TEXT_C='#e8edf8';
  return(
    <div onClick={onClick}
      style={{background:selected?'rgba(212,160,23,.07)':RAISED_C,
        border:`1px solid ${selected?'#D4A017':BORDER_C}`,borderRadius:10,
        overflow:'hidden',cursor:'pointer',transition:'border-color .15s'}}
      onMouseEnter={e=>{if(!selected)e.currentTarget.style.borderColor='rgba(212,160,23,.4)';}}
      onMouseLeave={e=>{if(!selected)e.currentTarget.style.borderColor=BORDER_C;}}>
      {photo.url?(
        <img src={photo.url} alt={photo.title}
          style={{width:'100%',height:140,objectFit:'cover',display:'block'}}
          onError={e=>{(e.target as HTMLImageElement).parentElement!.style.background='#0d1117';(e.target as HTMLImageElement).style.display='none';}}/>
      ):(
        <div style={{width:'100%',height:140,background:'#0d1117',display:'flex',
          alignItems:'center',justifyContent:'center',color:DIM_C,fontSize:12}}>
          No image
        </div>
      )}
      <div style={{padding:'10px 12px'}}>
        <div style={{fontWeight:700,fontSize:13,color:TEXT_C,marginBottom:6,
          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          {photo.title||'Untitled'}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,
            background:`${albumColor}22`,color:albumColor,textTransform:'uppercase'}}>
            {photo.album||'General'}
          </span>
          {photo.taken_at&&(
            <span style={{fontSize:11,color:DIM_C}}>
              {new Date(photo.taken_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
            </span>
          )}
        </div>
        {photo.location&&(
          <div style={{fontSize:11,color:DIM_C,marginTop:5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {photo.location}
          </div>
        )}
      </div>
    </div>
  );
}
