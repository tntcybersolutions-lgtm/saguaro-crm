'use client';
/**
 * Project Photos (web app shell).
 *
 * The project is taken from the ROUTE (`/app/projects/[projectId]/photos`), never from a
 * global "active project" — so every read and every write on this screen is addressed to
 * the project named in the URL bar. It cannot drift.
 *
 * WHAT WAS BROKEN: "Add Photo" had no way to add a photo. The panel offered a "Photo URL"
 * text box and expected a GC to paste an `https://...` image link by hand; there was no
 * file input, no camera, no upload call anywhere on the page. A record could be saved with
 * a title and no image at all. That is the "nowhere to type / stubbed knock-off" complaint.
 * The panel now takes a real file, uploads it to storage against this project's id via
 * /api/photos/upload, then attaches the typed details to the row it created.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import PhotoEditor from '../../../../../components/PhotoEditor';
import { Camera, X, PencilSimple, Plus, Images, CalendarBlank, FolderSimple, WarningCircle } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, InsightRow, AutoChip, IconChip, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { moduleAccent } from '@/lib/module-identity';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='#D4D4D8',TEXT='#FFFFFF';
const GREEN='#2CFF7A',RED='#FF3B30';

const ALBUMS=['General','Progress','Inspections','Closeout','Issues','Other'];
/* Images that live in the project's Files & Media library. /api/photos/list
   merges them in read-only (source 'files', id 'file:<uuid>') so the gallery and
   the library show one picture of the job. They are edited in Files, not here. */
const FILES_ALBUM='From Files';
const isFromFiles=(p:any)=>p?.source==='files'||p?.read_only===true;
/** "ZZ-AUDIT_jobsite-photo-1.jpg" -> "ZZ AUDIT jobsite photo 1" */
const titleFromFileName=(name:string)=>name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
const ALBUM_COLORS:Record<string,string>={
  General:DIM,
  Progress:'var(--brand-primary-strong)',
  Inspections:GOLD,
  Closeout:GREEN,
  Issues:RED,
  Other:'#FF8A00',
  [FILES_ALBUM]:'#FF8A00',
};

const inp:React.CSSProperties={
  width:'100%',padding:'9px 12px',background:'var(--bg-surface-2)',
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
      background:`color-mix(in srgb, ${color} 13%, transparent)`,color}}>
      {label}
    </span>
  );
}

function FieldLabel({label,auto}:{label:string;auto?:boolean}){
  return(
    <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,
      marginBottom:5}}>{label}{auto&&<AutoChip/>}</label>
  );
}

function InfoCard({label,value}:{label:string;value:string|undefined|null}){
  if(!value) return null;
  return(
    <div style={{background:'var(--bg-surface)',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px'}}>
      <div style={{fontSize:10,fontWeight:700,color:DIM,marginBottom:4}}>{label}</div>
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

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(mode==='create'||mode==='edit', form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `photos:${projectId}`,
    draftData: mode==='create'?form:undefined,
    restoreDraft: (d) => { setForm({...EMPTY_FORM, ...(d as object)}); setMode('create'); setSelected(null); },
    onSave: () => save(),
  });
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [toast,setToast]=useState<{msg:string;type:'success'|'error'}|null>(null);
  const [search,setSearch]=useState('');
  const [filterAlbum,setFilterAlbum]=useState('All');
  const [editingPhoto, setEditingPhoto] = useState<{id:string;url:string}|null>(null);

  // Real file upload — the thing this panel was missing entirely.
  const [uploadFile,setUploadFile]=useState<File|null>(null);
  const [uploadPreview,setUploadPreview]=useState('');
  const [formError,setFormError]=useState('');
  const fileRef=useRef<HTMLInputElement>(null);

  const showToast=(msg:string,type:'success'|'error'='success')=>{
    setToast({msg,type}); setTimeout(()=>setToast(null),4000);
  };

  const clearUpload=useCallback(()=>{
    setUploadFile(null);setUploadPreview('');setFormError('');
    if(fileRef.current) fileRef.current.value='';
  },[]);

  function onPickFile(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];
    if(!file) return;
    setFormError('');
    setUploadFile(file);
    // Title is required — start it from the file's name (as Drawings does) so the
    // first save does not bounce with "Give the photo a title first."
    const suggested=titleFromFileName(file.name||'');
    if(suggested) setForm(f=>(f.title.trim()?f:{...f,title:suggested}));
    const reader=new FileReader();
    reader.onload=()=>setUploadPreview(String(reader.result||''));
    reader.onerror=()=>{setUploadPreview('');setFormError("That file couldn't be read. Pick it again.");};
    reader.readAsDataURL(file);
  }

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch(`/api/photos/list?projectId=${projectId}&include=files`,{headers:h});
      if (!r.ok) throw new Error('Failed to load data');
      const d=await r.json();
      setPhotos(d.photos||[]);
    }catch{setPhotos([]);setLoadError('Failed to load. Please try again.');}
    finally{setLoading(false);}
  },[projectId]);

  useEffect(()=>{load();},[load]);

  // Project intelligence — one snapshot; the gallery walks in knowing the job.
  const { ctx } = useProjectContext(projectId);
  const [auto,setAuto]=useState<{date?:boolean;album?:boolean}>({});

  function openCreate(){
    // Prefill what the system already knows: today's date, and the album in view.
    const d=new Date();
    const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setForm({...EMPTY_FORM,taken_at:iso,album:filterAlbum!=='All'?filterAlbum:'General'});
    setAuto({date:true,album:filterAlbum!=='All'});
    clearUpload();
    setMode('create');setSelected(null);
  }
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
    clearUpload();
    setSelected(photo);setMode('edit');
  }
  function viewPhoto(photo:any){setSelected(photo);setMode('view');}
  function closePanel(){setSelected(null);setMode(null);clearUpload();}

  /** Read a route's error body without leaking raw JSON into the UI. */
  async function errorFrom(r:Response,fallback:string):Promise<Error>{
    const payload=await r.json().catch(()=>null);
    return new Error(humanError(payload,fallback));
  }

  async function save(): Promise<boolean> {
    setFormError('');
    if(!form.title.trim()){setFormError('Give the photo a title first.');showToast('Title is required.','error');return false;}
    if(mode==='create'&&!uploadFile&&!form.url.trim()){
      setFormError('Choose a photo file to upload, or paste an image URL.');
      showToast('No photo attached.','error');
      return false;
    }
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
        if(uploadFile){
          // Multipart -> storage + row, addressed to THIS route's projectId. The
          // JSON create route never touches storage; it only records a URL string.
          const fd=new FormData();
          fd.append('projectId',projectId);
          fd.append('file',uploadFile,uploadFile.name||`photo-${Date.now()}.jpg`);
          fd.append('category',form.album||'General');
          if(form.title.trim()) fd.append('caption',form.title.trim());
          // No Content-Type header — the browser must set the multipart boundary.
          const up=await fetch('/api/photos/upload',{method:'POST',headers:h,body:fd});
          if(!up.ok) throw await errorFrom(up,"The photo didn't upload. Try again.");
          const upPayload=await up.json().catch(()=>null);
          const newId=upPayload?.photo?.id;
          if(newId){
            // Attach the details the multipart route doesn't accept. `url` is
            // deliberately omitted — the upload already set the real storage path.
            const meta=await fetch(`/api/photos/${newId}`,{
              method:'PUT',
              headers:{...h,'Content-Type':'application/json'},
              body:JSON.stringify({
                title:payload.title,description:payload.description,album:payload.album,
                location:payload.location,taken_at:payload.taken_at,taken_by:payload.taken_by,
                tags:tagsArray,
              }),
            });
            if(!meta.ok){
              showToast('Photo uploaded, but the details did not save — reopen it to re-enter them.','error');
            }else{
              showToast('Photo added.');
            }
          }else{
            showToast('Photo uploaded.');
          }
        }else{
          const r=await fetch('/api/photos/create',{
            method:'POST',
            headers:{...h,'Content-Type':'application/json'},
            body:JSON.stringify({...payload,projectId}),
          });
          if(!r.ok) throw await errorFrom(r,'Save failed. Please try again.');
          showToast('Photo added.');
        }
      }else if(mode==='edit'&&selected){
        if(uploadFile){
          // Replace the image in place. This endpoint re-uploads under the row's
          // existing project_id, so swapping the file can never move the photo.
          const fd=new FormData();
          fd.append('file',uploadFile,uploadFile.name||`photo-${Date.now()}.jpg`);
          const up=await fetch(`/api/photos/${selected.id}/upload`,{method:'POST',headers:h,body:fd});
          if(!up.ok) throw await errorFrom(up,"The replacement photo didn't upload.");
        }
        // Don't clobber the freshly uploaded storage URL with the stale form value.
        const {url:formUrl,...rest}=payload;
        const body=uploadFile?rest:{...rest,url:formUrl};
        const r=await fetch(`/api/photos/${selected.id}`,{
          method:'PUT',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify(body),
        });
        if(!r.ok) throw await errorFrom(r,'Save failed. Please try again.');
        showToast('Photo updated.');
      }
      await load();closePanel();
      guard.clearDraft();
      return true;
    }catch(e:any){
      console.error(e);
      const msg=humanError(e,'Save failed. Please try again.');
      setFormError(msg);
      showToast(msg,'error');
    }
    finally{setSaving(false);}
    return false;
  }

  async function deletePhoto(photo:any){
    if(!(await confirmDialog({ title: 'Please confirm', message: `Delete "${photo.title}"?`, danger: true }))) return;
    setDeleting(true);
    try{
      const h=await getAuthHeaders();
      const dr=await fetch(`/api/photos/${photo.id}`,{method:'DELETE',headers:h});
      if (!dr.ok) throw new Error('Delete failed');
      showToast('Photo deleted.');closePanel();await load();
    }catch{showToast('Delete failed.','error');}
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
  const lastPhotoAt=photos.reduce<string|null>((m,p)=>(p.taken_at&&(!m||p.taken_at>m)?p.taken_at:m),null);

  const filtered=photos.filter((p:any)=>{
    const ms=!search||(p.title||'').toLowerCase().includes(search.toLowerCase())
      ||(Array.isArray(p.tags)&&p.tags.some((t:string)=>t.toLowerCase().includes(search.toLowerCase())));
    const ma=filterAlbum==='All'||p.album===filterAlbum;
    return ms&&ma;
  });

  // Group by date (default) or album for display
  const [groupBy,setGroupBy]=useState<'date'|'album'>('date');
  const grouped:Record<string,any[]>={};
  if(filterAlbum==='All'){
    const src=groupBy==='date'
      ?[...filtered].sort((a,b)=>String(b.taken_at||'').localeCompare(String(a.taken_at||'')))
      :filtered;
    for(const p of src){
      const key=groupBy==='album'
        ?(p.album||'General')
        :(p.taken_at?new Date(p.taken_at).toLocaleDateString('en-US',{month:'long',year:'numeric'}):'No date');
      if(!grouped[key]) grouped[key]=[];
      grouped[key].push(p);
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

      {/* Photo Editor Modal */}
      {editingPhoto && (
        <PhotoEditor
          src={editingPhoto.url}
          photoId={editingPhoto.id}
          onClose={() => setEditingPhoto(null)}
          onSave={async (blob, id) => {
            try {
              const formData = new FormData();
              formData.append('file', blob, 'edited.jpg');
              const headers = await getAuthHeaders();
              const r = await fetch(`/api/photos/${id}/upload`, { method: 'POST', headers, body: formData });
              if (r.ok) { showToast('Photo saved.'); load(); }
              else showToast('Save failed.', 'error');
            } catch { showToast('Save failed.', 'error'); }
            setEditingPhoto(null);
          }}
          onDelete={async (id) => {
            try {
              const headers = await getAuthHeaders();
              const r = await fetch(`/api/photos/${id}`, { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' } });
              if (!r.ok) throw new Error('delete failed');
              setPhotos(prev => prev.filter(p => p.id !== id));
              showToast('Photo deleted.');
            } catch { showToast('Delete failed.', 'error'); }
            setEditingPhoto(null);
          }}
        />
      )}

      {/* Main */}
      <div style={{flex:1,overflow:'auto',minWidth:0}}>
        <PremiumSurface maxWidth={2200}>
          {/* Header */}
          <ModuleHero
            /* Always name the job on screen — never a bare "Photos" that leaves a GC
               guessing which project they are filing into. */
            eyebrow={ctx?.project?.name||(loading?'Loading project…':'This Project')}
            eyebrowIcon={<IconChip size={24} vivid={moduleAccent('photos').vivid ?? moduleAccent('photos').hex}><Camera size={13} weight="fill" color="#F8FAFC" /></IconChip>}
            accentColor={moduleAccent('photos').hex}
            title="Site"
            accent="Photos"
            subtitle="Site progress photos and documentation."
            actions={
              <button onClick={openCreate} style={goldButtonStyle} className="pmBtn">
                <Plus size={15} weight="bold" /> Add Photo
              </button>
            }
          />

          {/* Project intelligence strip — what the system already knows */}
          {ctx&&(
            <StatStrip items={[
              {href: `/app/projects/${projectId}/photos`, label:'Project',value:`${Number(ctx?.project?.percentComplete)||0}%`,sub:'Complete — the gallery is the proof'},
              {href: `/app/projects/${projectId}/photos`, label:'Photos',value:String(photos.length),sub:albums.length>0?`${albums.length} album${albums.length===1?'':'s'} in use`:'No albums yet'},
              {href: `/app/projects/${projectId}/photos`, label:'This Month',value:String(thisMonth),accent:thisMonth>0?'#2CFF7A':undefined,sub:'Added since the 1st'},
              {href: `/app/projects/${projectId}/photos`, label:'Last Photo',value:lastPhotoAt?fmtDate(lastPhotoAt):'—',sub:lastPhotoAt?'Most recent capture':'Nothing documented yet'},
              {href: `/app/projects/${projectId}/photos`, label:'Issues Tagged',value:String(issueCount),accent:issueCount>0?RED:undefined,sub:issueCount>0?'Flagged for follow-up':'Clean so far'},
              {href: `/app/projects/${projectId}/daily-logs`, label:'Last Daily Log',value:ctx?.recent?.lastDailyLogDate?fmtDate(ctx.recent.lastDailyLogDate):'—',sub:Number(ctx?.counts?.openPunch)>0?`${ctx.counts.openPunch} open punch`:'Field activity'},
            ]}/>
          )}

          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
            <StatCard icon={<Images size={19} weight="duotone" color={moduleAccent('photos').hex} />} label="Total Photos" value={String(photos.length)} accent="var(--brand-primary-strong)" sub="All albums" delay={0.02}  href={`/app/projects/${projectId}/photos`}/>
            <StatCard icon={<CalendarBlank size={19} weight="duotone" color={moduleAccent('photos').hex} />} label="This Month" value={String(thisMonth)} accent={GOLD} sub="Added this month" delay={0.06}  href={`/app/projects/${projectId}/photos`}/>
            <StatCard icon={<FolderSimple size={19} weight="duotone" color={GREEN} />} label="Albums" value={String(albums.length||ALBUMS.length)} accent={GREEN} sub="In use" delay={0.10}  href={`/app/projects/${projectId}/photos`}/>
            <StatCard icon={<WarningCircle size={19} weight="duotone" color={RED} />} label="Issues Tagged" value={String(issueCount)} accent={RED} sub="Flagged" delay={0.14}  href={`/app/projects/${projectId}/photos`}/>
          </div>

          {/* Toolbar */}
          <ListToolbar
            module="photos"
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search by title or tag…"
            filters={[
              {key:'album',label:'Album',value:filterAlbum,onChange:setFilterAlbum,
                allValue:'All',allLabel:'All Albums',options:albums.includes(FILES_ALBUM)?[...ALBUMS,FILES_ALBUM]:ALBUMS},
            ]}
            count={{shown:filtered.length,total:photos.length}}
            extra={filterAlbum==='All'?(
              <div style={{display:'flex',background:'rgba(255,255,255,0.04)',borderRadius:10,padding:3,border:'1px solid rgba(255,255,255,0.10)'}}>
                {(['date','album'] as const).map(g=>(
                  <button key={g} onClick={()=>setGroupBy(g)}
                    style={{padding:'7px 14px',borderRadius:8,border:'none',fontWeight:700,fontSize:12,cursor:'pointer',
                      background:groupBy===g?'color-mix(in srgb, var(--brand-primary) 15%, transparent)':'transparent',color:groupBy===g?'var(--brand-primary-strong)':DIM,transition:'all .15s'}}>
                    {g==='date'?'By Date':'By Album'}
                  </button>
                ))}
              </div>
            ):undefined}
            style={{marginBottom:18}}
          />

          {/* Gallery */}
          <SectionCard
            title="Gallery"
            icon={<Images size={17} weight="duotone" color={moduleAccent('photos').hex} />}
            action={<span style={{fontSize:12,color:'rgba(255,255,255,0.62)',fontWeight:600}}>{filtered.length} {filtered.length===1?'photo':'photos'}</span>}
          >
            {loading&&<div style={{padding:40,textAlign:'center',color:DIM}}>Loading photos…</div>}

            {!loading&&loadError&&(
              <PremiumEmpty
                tone="error"
                icon={<WarningCircle size={30} weight="duotone" color={RED} />}
                title="Couldn't load photos"
                description={loadError}
                action={<button onClick={()=>load()} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
                compact
              />
            )}

            {!loading&&!loadError&&filtered.length===0&&(
              photos.length===0?(
                <div style={{display:'grid',gridTemplateColumns:ctx?'minmax(0,1fr) 320px':'1fr',alignItems:'stretch'}}>
                  <PremiumEmpty
                    icon={<Camera size={30} weight="duotone" color={GOLD} />}
                    title="No photos yet"
                    description="Photos are the project record — progress proof, inspection evidence, punch documentation, closeout backup. Add the first one to start the timeline."
                    action={<button onClick={openCreate} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Add First Photo</button>}
                  />
                  {ctx&&(
                    <div style={{borderLeft:'1px solid rgba(255,255,255,0.08)',padding:'22px 24px'}}>
                      <div style={{fontSize:10.5,fontWeight:900,color:'rgba(255,255,255,0.45)',marginBottom:10}}>What Belongs Here</div>
                      <InsightRow label="Progress" value="Weekly site walks"/>
                      <InsightRow label="Inspections" value="Pass/fail evidence"/>
                      <InsightRow label="Issues" value="Defects to chase"/>
                      <InsightRow label="Closeout" value="Final condition"/>
                      <div style={{height:1,background:'rgba(255,255,255,0.08)',margin:'10px 0'}}/>
                      <InsightRow label="Project" value={`${Number(ctx?.project?.percentComplete)||0}% complete`}/>
                      {ctx?.recent?.lastDailyLogDate&&<InsightRow label="Last Daily Log" value={fmtDate(ctx.recent.lastDailyLogDate)}/>}
                      {Number(ctx?.counts?.openPunch)>0&&<InsightRow label="Open Punch" value={String(ctx.counts.openPunch)} accent="var(--brand-primary-strong)"/>}
                      <div style={{marginTop:12,fontSize:12,color:DIM,lineHeight:1.55}}>
                        Field photos from daily logs and punch items document the same work — album them here by phase and closeout builds itself.
                      </div>
                    </div>
                  )}
                </div>
              ):(
                <PremiumEmpty
                  icon={<Camera size={30} weight="duotone" color={GOLD} />}
                  title="No photos match your filters"
                  description="Try adjusting your search or album filter."
                />
              )
            )}

            {/* Album-grouped grid */}
            {!loading&&!loadError&&filtered.length>0&&filterAlbum==='All'&&(
              <div style={{display:'flex',flexDirection:'column',gap:28}}>
                {Object.entries(grouped).map(([album,albumPhotos])=>(
                  <div key={album}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                      <span style={{fontSize:13,fontWeight:700,color:groupBy==='album'?(ALBUM_COLORS[album]||DIM):'var(--brand-primary-strong)'}}>{album}</span>
                      <span style={{fontSize:11,color:DIM}}>({albumPhotos.length})</span>
                      <div style={{flex:1,height:1,background:BORDER}}/>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:14}}>
                      {albumPhotos.map((photo:any)=>(
                        <PhotoCard key={photo.id} photo={photo} selected={selected?.id===photo.id&&mode==='view'}
                          onClick={()=>viewPhoto(photo)} albumColor={ALBUM_COLORS[photo.album]||DIM} onEdit={(id,url)=>setEditingPhoto({id,url})}/>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Flat grid when filtered by album */}
            {!loading&&!loadError&&filtered.length>0&&filterAlbum!=='All'&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:14}}>
                {filtered.map((photo:any)=>(
                  <PhotoCard key={photo.id} photo={photo} selected={selected?.id===photo.id&&mode==='view'}
                    onClick={()=>viewPhoto(photo)} albumColor={ALBUM_COLORS[photo.album]||DIM} onEdit={(id,url)=>setEditingPhoto({id,url})}/>
                ))}
              </div>
            )}
          </SectionCard>
        </PremiumSurface>
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
              {mode==='view'&&selected&&!isFromFiles(selected)&&(
                <>
                  <button onClick={()=>openEdit(selected)}
                    style={{padding:'6px 14px',background:'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                      border:'1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)',borderRadius:6,
                      color:'var(--brand-primary-strong)',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    Edit
                  </button>
                  <button onClick={()=>deletePhoto(selected)} disabled={deleting}
                    style={{padding:'6px 14px',background:'rgba(192,48,48,.1)',
                      border:`1px solid ${RED}44`,borderRadius:6,
                      color:RED,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    {deleting?'…':'Delete'}
                  </button>
                </>
              )}
              <button onClick={closePanel}
                style={{padding:'6px 10px',background:'rgba(143,163,192,.1)',
                  border:`1px solid ${BORDER}`,borderRadius:6,color:DIM,fontSize:12,cursor:'pointer',display:'inline-flex',alignItems:'center'}}>
                <X size={14} weight="regular" color={DIM} />
              </button>
            </div>
          </div>

          <div style={{flex:1,overflow:'auto',padding:20}}>
            {(mode==='create'||mode==='edit')?(
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                {/* ── The photo itself. A real file, not a URL a GC has to hand-type. ── */}
                <div>
                  <FieldLabel label={mode==='create'?'Photo *':'Replace Photo'}/>
                  <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{display:'none'}}/>
                  {uploadPreview?(
                    <div style={{border:`1px solid ${BORDER}`,borderRadius:8,overflow:'hidden',background:RAISED}}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={uploadPreview} alt="Selected" style={{width:'100%',maxHeight:200,objectFit:'cover',display:'block'}}/>
                      <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px'}}>
                        <span style={{fontSize:11.5,color:DIM,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {uploadFile?.name||'Selected photo'}
                        </span>
                        <button onClick={()=>fileRef.current?.click()}
                          style={{background:'transparent',border:'none',color:'var(--brand-primary-strong)',fontSize:11.5,fontWeight:700,cursor:'pointer',padding:0}}>
                          Replace
                        </button>
                        <button onClick={clearUpload}
                          style={{background:'transparent',border:'none',color:RED,fontSize:11.5,fontWeight:700,cursor:'pointer',padding:0}}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ):(
                    <button onClick={()=>fileRef.current?.click()}
                      style={{width:'100%',padding:'16px 12px',background:RAISED,
                        border:`1px dashed color-mix(in srgb, var(--brand-primary) 45%, transparent)`,borderRadius:8,color:'var(--brand-primary-strong)',
                        fontSize:13,fontWeight:700,cursor:'pointer',
                        display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                      <Camera size={17} weight="duotone" color={GOLD}/>
                      {mode==='create'?'Choose a Photo from This Computer':'Upload a Replacement Image'}
                    </button>
                  )}
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:5,lineHeight:1.45}}>
                    {mode==='create'
                      ? 'Uploads straight into this project. No link to paste.'
                      : 'Leave empty to keep the current image and just edit the details.'}
                  </div>
                </div>

                {formError&&(
                  <div style={{background:'rgba(192,48,48,.12)',border:`1px solid ${RED}55`,borderRadius:8,
                    padding:'10px 12px',color:'#f3b8b8',fontSize:12.5,lineHeight:1.45}}>
                    {formError}
                  </div>
                )}

                <div>
                  <FieldLabel label="Title *"/>
                  <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
                    style={inp} placeholder="e.g. Foundation pour complete"/>
                </div>
                <div>
                  <FieldLabel label="Album" auto={mode==='create'&&auto.album}/>
                  <select value={form.album} onChange={e=>setForm(f=>({...f,album:e.target.value}))}
                    style={{...inp,padding:'9px 10px'}}>
                    {ALBUMS.map(a=><option key={a} value={a}>{a}</option>)}
                  </select>
                  {mode==='create'&&auto.album&&(
                    <div style={{fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:5,lineHeight:1.45}}>Matched your current album filter — change freely.</div>
                  )}
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
                    <FieldLabel label="Date Taken" auto={mode==='create'&&auto.date}/>
                    <SaguaroDatePicker value={form.taken_at}
                      onChange={v=>setForm(f=>({...f,taken_at:v}))}
                      style={inp}/>
                    {mode==='create'&&auto.date&&(
                      <div style={{fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:5,lineHeight:1.45}}>Defaulted to today — adjust freely.</div>
                    )}
                  </div>
                </div>
                {/* Pasting a link stays available for photos that already live somewhere
                    else, but it is no longer the only way in. */}
                {!uploadFile&&(
                  <div>
                    <FieldLabel label={mode==='create'?'…or Paste an Image URL':'Photo URL'}/>
                    <input value={form.url} onChange={e=>setForm(f=>({...f,url:e.target.value}))}
                      style={inp} placeholder="https://…"/>
                  </div>
                )}
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
                  <button onClick={save} disabled={saving} className="pmBtn"
                    style={{...goldButtonStyle,flex:1,opacity:saving?0.6:1}}>
                    {saving?'Saving…':mode==='create'?'Add Photo':'Save Changes'}
                  </button>
                  <button onClick={closePanel} className="pmBtn"
                    style={ghostButtonStyle}>
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
                  {isFromFiles(selected)&&(
                    <div style={{marginTop:10,fontSize:12,color:DIM,lineHeight:1.5}}>
                      This image lives in the project&apos;s Files &amp; Media library. Rename, move or delete it there.{' '}
                      <a href={`/app/projects/${projectId}/files`} style={{color:'var(--brand-primary-strong)',fontWeight:700}}>Open Files &amp; Media</a>
                    </div>
                  )}
                </div>

                {/* Description */}
                {selected.description&&(
                  <div style={{background:'var(--bg-surface)',border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM,marginBottom:6}}>Description</div>
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
                  <div style={{background:'var(--bg-surface)',border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM,marginBottom:8}}>Tags</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {selected.tags.map((tag:string)=>(
                        <span key={tag} style={{padding:'3px 10px',borderRadius:20,background:'color-mix(in srgb, var(--brand-primary) 13%, transparent)',
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
                    style={{display:'block',padding:'10px 14px',background:'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                      border:'1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)',borderRadius:8,
                      color:'var(--brand-primary-strong)',fontSize:13,fontWeight:700,textDecoration:'none',textAlign:'center'}}>
                    View Full Image
                  </a>
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

function PhotoCard({photo,selected,onClick,albumColor,onEdit}:{
  photo:any;selected:boolean;onClick:()=>void;albumColor:string;onEdit?:(id:string,url:string)=>void;
}){
  const BORDER_C='rgba(255,255,255,0.12)';
  const RAISED_C='var(--bg-surface)';
  const DIM_C='#D4D4D8';
  const TEXT_C='#FFFFFF';
  return(
    <div onClick={onClick}
      style={{background:selected?'color-mix(in srgb, var(--brand-primary) 7%, transparent)':RAISED_C,
        border:`1px solid ${selected?'var(--brand-primary)':BORDER_C}`,borderRadius:10,
        overflow:'hidden',cursor:'pointer',transition:'border-color .15s'}}
      onMouseEnter={e=>{if(!selected)e.currentTarget.style.borderColor='color-mix(in srgb, var(--brand-primary) 40%, transparent)';}}
      onMouseLeave={e=>{if(!selected)e.currentTarget.style.borderColor=BORDER_C;}}>
      {photo.url?(
        /* Grid tiles render the ~400px thumbnail; the full original is for the
           detail panel only (see THUMBNAIL CONTRACT in /api/photos/list). */
        <img src={photo.thumbnail_url||photo.url} alt={photo.title} loading="lazy" decoding="async"
          style={{width:'100%',height:140,objectFit:'cover',display:'block'}}
          onError={e=>{(e.target as HTMLImageElement).parentElement!.style.background='var(--bg-surface-2)';(e.target as HTMLImageElement).style.display='none';}}/>
      ):(
        <div style={{width:'100%',height:140,background:'var(--bg-surface-2)',display:'flex',
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
            background:`color-mix(in srgb, ${albumColor} 13%, transparent)`,color:albumColor}}>
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
        {photo.url && onEdit && !isFromFiles(photo) && (
          <button onClick={(e)=>{e.stopPropagation();onEdit(photo.id,photo.url);}}
            style={{marginTop:8,width:'100%',padding:'6px',background:'var(--brand-primary-08)',border:`1px solid color-mix(in srgb, var(--brand-primary) 20%, transparent)`,borderRadius:6,color:'var(--brand-primary)',fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
            <PencilSimple size={13} weight="regular" color="var(--brand-primary)" /> Edit / Crop / Rotate
          </button>
        )}
      </div>
    </div>
  );
}
