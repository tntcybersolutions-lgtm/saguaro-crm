'use client';
/**
 * Project Photos — Pass 4, on the RFIs reference layout (gallery + detail).
 *
 * The project is taken from the ROUTE (`/app/projects/[projectId]/photos`), never from a
 * global "active project" — so every read and every write on this screen is addressed to
 * the project named in the URL bar. It cannot drift.
 *
 * Anatomy: title + one primary action (Add Photo) → StatRow (each tile filters
 * the gallery) → Toolbar (search, album, group by) → workspace split: the
 * thumbnail gallery on the left (real thumbnails, one aspect ratio, grouped by
 * date or album), and when a photo is selected, the viewer beside a 320–384px
 * details + action rail. Phone: gallery, then viewer, stacked. ← / → step
 * through the visible photos, Esc closes the viewer. Create / edit open the
 * composer in a FormModal with a real file input.
 *
 * Every read / write is the one this screen already used:
 *   list      GET    /api/photos/list?projectId=&include=files
 *   upload    POST   /api/photos/upload            (multipart, new photo)
 *   create    POST   /api/photos/create            (URL-only photo)
 *   details   PUT    /api/photos/[id]
 *   replace   POST   /api/photos/[id]/upload       (multipart, replace image / crop save)
 *   delete    DELETE /api/photos/[id]
 * Thumbnails come from the list route's thumbnail_url; the full original is
 * only ever drawn in the viewer. URLs are whatever the authorized list route
 * returned — nothing here publishes private media.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import PhotoEditor from '../../../../../components/PhotoEditor';
import MediaUploadPanel from '@/components/media/MediaUploadPanel';
import ZoomLightbox, { type LightboxItem } from '@/components/media/ZoomLightbox';
import SubInbox from '@/components/media/SubInbox';
import { useUploadQueue } from '@/lib/useUploadQueue';
import { uploadPhoto, uploadVideo, fmtDuration } from '@/lib/media-upload';
import { addToOutbox, isOffline, looksLikeNetworkError, listOutbox } from '@/lib/offline/outbox';
import { CloudArrowUp,
  Camera, X, PencilSimple, Plus, Images, WarningCircle, ArrowClockwise, Trash,
  Crop, CaretLeft, CaretRight, Play, ArrowsOut, LinkSimple,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, Tabs, EmptyState, RowActions,
  FormModal, Field, Input, Textarea, Select, FormGrid, DetailList, Toast, useToast,
  type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { AutoChip } from '@/components/ui/premium';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { layout } from '@/lib/design-tokens';

const ALBUMS=['General','Progress','Inspections','Closeout','Issues','End of Day','Other'];
/* Every project video, wherever it was uploaded (here, Files & Media, a sub's
   end-of-day upload) — /api/photos/list files them under this album. */
const VIDEO_ALBUM='Video';
const isVideo=(p:any)=>p?.media==='video';
/* Images that live in the project's Files & Media library. /api/photos/list
   merges them in read-only (source 'files', id 'file:<uuid>') so the gallery and
   the library show one picture of the job. They are edited in Files, not here. */
const FILES_ALBUM='From Files';
const isFromFiles=(p:any)=>p?.source==='files'||p?.read_only===true;
/** "ZZ-AUDIT_jobsite-photo-1.jpg" -> "ZZ AUDIT jobsite photo 1" */
const titleFromFileName=(name:string)=>name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();

/** Albums are categories, not statuses — only Issues carries a hue (red) so a
 *  defect reads at a glance; library images read grey. */
function albumBadge(album:string|null|undefined): { label:string; tone:BadgeTone } {
  const a = album || 'General';
  if (a==='Issues') return { label:a, tone:'overdue' };
  if (a===FILES_ALBUM) return { label:a, tone:'closed' };
  return { label:a, tone:'neutral' };
}

const EMPTY_FORM={
  title:'',description:'',album:'General',location:'',
  taken_at:'',url:'',taken_by:'',tags:'',
};

function fmtDate(iso:string|null|undefined){
  if(!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}

const CSS = `
.phWs > .k-page { max-width: none; }
.phCq { container: phws / inline-size; min-width: 0; }
.phSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.phSplit > * { min-width: 0; }
@container phws (min-width: 1080px) {
  .phSplit[data-open="true"] { grid-template-columns: minmax(320px, 0.9fr) minmax(0, 1.5fr); }
}
.phDetailCq { container: phdetail / inline-size; min-width: 0; }
.phDetail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.phDetail > * { min-width: 0; }
.phRail { order: -1; }
@container phdetail (min-width: 720px) {
  .phDetail { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 34%, ${layout.detailRailMax}px); }
  .phRail { order: 0; position: sticky; top: 16px; }
}
.phGallery { display: flex; flex-direction: column; gap: 24px; padding: 16px; }
.phGroupHead { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); }
.phGroupHead small { color: var(--text-tertiary); font-weight: 600; }
.phGroupHead::after { content: ''; flex: 1; height: 1px; background: var(--border-subtle); }
.phGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.phSplit[data-open="true"] .phGrid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.phCard { position: relative; display: flex; flex-direction: column; min-width: 0; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-surface-2); border: 1px solid var(--border-default); cursor: pointer; transition: border-color .15s, box-shadow .15s; text-align: left; padding: 0; color: inherit; font: inherit; }
.phCard:hover { border-color: var(--border-strong); }
.phCard:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
.phCard[data-sel="true"] { border-color: var(--brand-primary); box-shadow: 0 0 0 1px var(--brand-primary), var(--glass-highlight); }
.phThumb { position: relative; width: 100%; aspect-ratio: 4 / 3; background: var(--bg-solid); overflow: hidden; }
.phThumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.phThumb[data-missing="true"] { display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); font-size: var(--fs-xs); }
.phCardBody { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.phCardTitle { font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.phCardMeta { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: var(--fs-xs); color: var(--text-tertiary); }
.phCardMeta > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.phCardEdit { position: absolute; top: 6px; right: 6px; opacity: 0; transition: opacity .15s; }
.phCard:hover .phCardEdit, .phCard:focus-within .phCardEdit, .phCard[data-sel="true"] .phCardEdit { opacity: 1; }
.phCardEdit .k-btn { background: rgba(14,15,18,0.85); }
.phViewer { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; max-height: min(70vh, 720px); min-height: 220px; background: var(--bg-solid); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); overflow: hidden; }
.phViewer img { max-width: 100%; max-height: min(70vh, 720px); width: auto; height: auto; display: block; object-fit: contain; }
.phViewer[data-missing="true"] { color: var(--text-tertiary); font-size: var(--fs-sm); }
.phNav { position: absolute; top: 50%; transform: translateY(-50%); }
.phNav[data-side="left"] { left: 8px; }
.phNav[data-side="right"] { right: 8px; }
.phNav .k-btn { background: rgba(14,15,18,0.8); }
.phSection { display: flex; flex-direction: column; gap: 8px; }
.phSection + .phSection { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
.phSectionTitle { font-size: var(--fs-sm); font-weight: 700; color: var(--text-tertiary); }
.phProse { font-size: var(--fs-md); line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; max-width: ${layout.readingMaxWidth}; }
.phMuted { color: var(--text-tertiary); }
.phBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.phActions { display: flex; flex-direction: column; gap: 8px; }
.phActions .k-btn { width: 100%; justify-content: flex-start; }
.phActionsRow { display: flex; gap: 8px; align-items: center; }
.phActionsRow > .k-btn { flex: 1 1 auto; }
.phNext { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.5; }
.phNext a { color: var(--brand-primary); font-weight: 700; }
.phDrop { width: 100%; min-height: 96px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 16px 12px; border-radius: var(--radius-sm); border: 1px dashed var(--brand-primary-35); background: var(--brand-primary-08); color: var(--text-primary); font-weight: 700; font-size: var(--fs-md); cursor: pointer; }
.phDrop:hover { background: var(--brand-primary-12); }
.phDrop:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
.phPreview { border: 1px solid var(--border-default); border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-solid); }
.phPreview img { width: 100%; max-height: 240px; object-fit: contain; display: block; background: var(--bg-solid); }
.phPreviewBar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; font-size: var(--fs-xs); color: var(--text-tertiary); }
.phPreviewBar > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.phDateInput { width: 100%; }
.phTabs .k-tabs { margin: 0; }
.phViewer .phZoomHit { display: contents; cursor: zoom-in; }
.phViewer img { cursor: zoom-in; }
.phViewer video { width: 100%; max-height: min(70vh, 720px); display: block; background: #000; }
.phPlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.phPlay > span { width: 44px; height: 44px; border-radius: 50%; background: rgba(8,9,12,0.72); border: 1px solid rgba(255,255,255,0.25); display: inline-flex; align-items: center; justify-content: center; color: #fff; }
.phDur { position: absolute; right: 6px; bottom: 6px; padding: 2px 6px; border-radius: 6px; background: rgba(8,9,12,0.8); color: #fff; font-size: 11px; font-weight: 700; }
.phUploading { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border-default); background: rgba(255,255,255,0.04); color: var(--text-secondary); font: inherit; font-size: var(--fs-sm); font-weight: 700; cursor: pointer; }
.phUploading i { display: block; width: 64px; height: 4px; border-radius: 4px; background: rgba(255,255,255,0.1); overflow: hidden; }
.phUploading i > b { display: block; height: 100%; background: var(--brand-primary); }
.phLinkAlt { align-self: flex-start; background: none; border: none; padding: 6px 0; color: var(--text-tertiary); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; min-height: 44px; }
.phLinkAlt:hover { color: var(--text-primary); }
@media (max-width: 640px) {
  .phWs .k-btn, .phWs .k-stat, .phWs select.k-select, .phWs .k-input { min-height: 44px; }
  .phGrid, .phSplit[data-open="true"] .phGrid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  .phCardEdit { opacity: 1; }
}
`;

const DATE_INPUT_STYLE: React.CSSProperties = {
  width:'100%', minHeight:40, padding:'8px 12px', fontSize:14,
  background:'var(--bg-surface-2)', border:'1px solid var(--border-default)',
  borderRadius:'var(--radius-sm)', color:'var(--text-primary)',
};

export default function PhotosPage(){
  const {projectId}=useParams() as {projectId:string};
  const [photos,setPhotos]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [selected,setSelected]=useState<any>(null);
  const [mode,setMode]=useState<'view'|'edit'|'create'|null>(null);
  const [form,setForm]=useState({...EMPTY_FORM});
  const detailRef = useRef<HTMLDivElement>(null);

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
  const { toast, show: showToast } = useToast(4000);
  const [search,setSearch]=useState('');
  const [filterAlbum,setFilterAlbum]=useState('All');
  const [periodFilter,setPeriodFilter]=useState<'all'|'month'>('all');
  const [editingPhoto, setEditingPhoto] = useState<{id:string;url:string}|null>(null);

  // Real file upload — the thing this panel was missing entirely.
  const [uploadFile,setUploadFile]=useState<File|null>(null);
  const [uploadPreview,setUploadPreview]=useState('');
  const [formError,setFormError]=useState('');
  const fileRef=useRef<HTMLInputElement>(null);

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

  const load=useCallback(async(opts?:{silent?:boolean})=>{
    if(!opts?.silent) setLoading(true);
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch(`/api/photos/list?projectId=${projectId}&include=files`,{headers:h});
      if (!r.ok) throw new Error('Failed to load data');
      const d=await r.json();
      setPhotos(d.photos||[]);
      signedAt.current=Date.now();
    }catch{ if(!opts?.silent){setPhotos([]);setLoadError('Failed to load. Please try again.');} }
    finally{ if(!opts?.silent) setLoading(false); }
  },[projectId]);

  /* Photo links are signed for an hour (the bucket is private). The phone app
     stays open for days, so a page left in the background came back with every
     thumbnail dead and nothing would open. Re-sign when the page comes back
     after 45 minutes, and when a tile's link fails (at most once a minute). */
  const signedAt=useRef(0);
  const lastResign=useRef(0);
  const resign=useCallback(()=>{
    if(Date.now()-lastResign.current<60_000) return;
    lastResign.current=Date.now();
    load({silent:true});
  },[load]);
  useEffect(()=>{
    const back=()=>{ if(document.visibilityState==='visible'&&signedAt.current&&Date.now()-signedAt.current>45*60_000) resign(); };
    document.addEventListener('visibilitychange',back);
    window.addEventListener('pageshow',back);
    window.addEventListener('focus',back);
    return()=>{ document.removeEventListener('visibilitychange',back); window.removeEventListener('pageshow',back); window.removeEventListener('focus',back); };
  },[resign]);

  /* ── Add photos & video: many at once, any size, straight to storage ── */
  const [uploadOpen,setUploadOpen]=useState(false);
  const [uploadAlbum,setUploadAlbum]=useState('General');
  const uploadAlbumRef=useRef('General');
  uploadAlbumRef.current=uploadAlbum;
  const reloadTimer=useRef<number|undefined>(undefined);
  const softReload=useCallback(()=>{
    window.clearTimeout(reloadTimer.current);
    reloadTimer.current=window.setTimeout(()=>{ load({silent:true}); },700);
  },[load]);
  /* No signal on site is normal: keep the file on this phone and upload it
     when the connection is back (lib/offline/outbox). */
  const keptOffline=useRef(0);
  const [waiting,setWaiting]=useState(0);
  const refreshWaiting=useCallback(()=>{ listOutbox(projectId).then(l=>setWaiting(l.length)).catch(()=>setWaiting(0)); },[projectId]);
  const keepOnPhone=async(file:File,kind:'image'|'video')=>{
    await addToOutbox({projectId,kind,album:kind==='video'?null:uploadAlbumRef.current,name:file.name||(kind==='video'?'video.mov':'photo.jpg'),type:file.type,size:file.size,file});
    keptOffline.current++;
    refreshWaiting();
    return {doneLabel:'Saved on this phone — uploads when you\'re back online'};
  };
  const queue=useUploadQueue(async(file,kind,onProgress)=>{
    if(isOffline()) return keepOnPhone(file,kind);
    try{
      if(kind==='video'){
        const f=await uploadVideo(file,{projectId,onProgress});
        return {thumb:(f.poster_url as string)||null};
      }
      const ph=await uploadPhoto(file,{projectId,album:uploadAlbumRef.current,onProgress});
      return {thumb:(ph.thumbnail_url as string)||(ph.url as string)||null};
    }catch(e){
      if(looksLikeNetworkError(e)) return keepOnPhone(file,kind);
      throw e;
    }
  },{
    onItemDone:softReload,
    onDrained:({done,failed})=>{
      const kept=keptOffline.current; keptOffline.current=0;
      const sent=done-kept;
      if(failed) showToast(`${done} saved, ${failed} didn't upload — open Add Photos & Video to retry.`,'bad');
      else if(kept&&!sent) showToast(kept===1?'Saved on this phone — it uploads when you\'re back online.':`${kept} saved on this phone — they upload when you're back online.`);
      else if(kept) showToast(`${sent} saved to the job, ${kept} saved on this phone until you're back online.`);
      else if(done) showToast(done===1?'1 item saved to the job.':`${done} items saved to the job.`);
    },
  });
  useEffect(()=>{
    refreshWaiting();
    const synced=(e:Event)=>{ const d=(e as CustomEvent).detail; if(!d||d.projectId===projectId){ softReload(); refreshWaiting(); } };
    window.addEventListener('saguaro:outbox-synced',synced);
    return()=>window.removeEventListener('saguaro:outbox-synced',synced);
  },[projectId,softReload,refreshWaiting]);
  function openUpload(){
    setUploadAlbum(filterAlbum!=='All'&&filterAlbum!==FILES_ALBUM&&filterAlbum!==VIDEO_ALBUM?filterAlbum:'General');
    setUploadOpen(true);
  }
  function addFiles(files:FileList|File[]){
    const skipped=queue.add(files);
    if(skipped) showToast(skipped===1?'1 file skipped — only photos and videos go here. Use Files & Media for documents.':`${skipped} files skipped — only photos and videos go here. Use Files & Media for documents.`,'bad');
  }
  // The Create menu links here with ?add=1 — open the picker straight away.
  // A sub-upload notification links with ?inbox=1 — bring "From your subs" into view.
  const [inboxFocus,setInboxFocus]=useState(false);
  useEffect(()=>{
    if(typeof window==='undefined') return;
    const u=new URL(window.location.href);
    let changed=false;
    if(u.searchParams.get('add')==='1'){ setUploadOpen(true); u.searchParams.delete('add'); changed=true; }
    if(u.searchParams.get('inbox')==='1'){ setInboxFocus(true); u.searchParams.delete('inbox'); changed=true; }
    if(changed) window.history.replaceState(null,'',u.pathname+(u.search?u.search:'')+u.hash);
  },[]);
  // Dragging files anywhere over the page opens the drop sheet.
  const onPageDragEnter=(e:React.DragEvent)=>{
    if(!uploadOpen&&!mode&&e.dataTransfer?.types?.includes('Files')){ e.preventDefault(); setUploadOpen(true); }
  };
  const [lightboxOpen,setLightboxOpen]=useState(false);

  useEffect(()=>{load();},[load]);

  // Keep the selected photo pointed at the live record once a reload swaps rows in.
  useEffect(()=>{
    if(!selected) return;
    const live = photos.find((p:any)=>p.id===selected.id);
    if(live && live!==selected) setSelected(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[photos]);

  // Project intelligence — one snapshot; the gallery walks in knowing the job.
  const { ctx } = useProjectContext(projectId);
  const [auto,setAuto]=useState<{date?:boolean;album?:boolean}>({});

  /** The by-link composer — for a photo that already lives on the web. */
  function openCreate(){
    // Prefill what the system already knows: today's date, and the album in view.
    const d=new Date();
    const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setForm({...EMPTY_FORM,taken_at:iso,album:filterAlbum!=='All'&&filterAlbum!==FILES_ALBUM?filterAlbum:'General'});
    setAuto({date:true,album:filterAlbum!=='All'&&filterAlbum!==FILES_ALBUM});
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
  function viewPhoto(photo:any){
    setSelected(photo);setMode('view');
  }
  /* On a phone a tap means "show me the picture": straight to the full-screen
     viewer (swipe, pinch, play). The details card used to open instead, with
     the picture under it behind the tab bar — it looked like nothing opened. */
  const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  const [lightboxFromTap,setLightboxFromTap]=useState(false);
  function openPhoto(photo:any){
    viewPhoto(photo);
    if(isPhone()){ setLightboxFromTap(true); setLightboxOpen(true); }
  }
  function closePanel(){setSelected(null);setMode(null);clearUpload();}
  /** Abandoning an edit keeps the photo in the viewer. */
  function closeComposer(){
    if(mode==='edit'&&selected){ clearUpload(); setFormError(''); setMode('view'); return; }
    closePanel();
  }

  /** Read a route's error body without leaking raw JSON into the UI. */
  async function errorFrom(r:Response,fallback:string):Promise<Error>{
    const payload=await r.json().catch(()=>null);
    return new Error(humanError(payload,fallback));
  }

  async function save(): Promise<boolean> {
    setFormError('');
    if(!form.title.trim()){setFormError('Give the photo a title first.');showToast('Title is required.','bad');return false;}
    if(mode==='create'&&!uploadFile&&!form.url.trim()){
      setFormError('Choose a photo file to upload, or paste an image URL.');
      showToast('No photo attached.','bad');
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
              showToast('Photo uploaded, but the details did not save — reopen it to re-enter them.','bad');
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
      showToast(msg,'bad');
    }
    finally{setSaving(false);}
    return false;
  }

  async function deletePhoto(photo:any){
    if(!(await confirmDialog({ title: 'Please confirm', message: `Delete "${photo.title||'this item'}"? This removes it from the job for everyone.`, danger: true }))) return;
    setDeleting(true);
    try{
      const h=await getAuthHeaders();
      // A video is a project_files row (the gallery shows it as `file:<id>`).
      const dr=isVideo(photo)&&photo.file_id
        ?await fetch(`/api/files/${photo.file_id}`,{method:'DELETE',headers:h})
        :await fetch(`/api/photos/${photo.id}`,{method:'DELETE',headers:h});
      if (dr.status===403) throw new Error('You need full Documents access to delete this.');
      if (!dr.ok) throw new Error('Delete failed');
      showToast(isVideo(photo)?'Video deleted.':'Photo deleted.');closePanel();await load();
    }catch(e:any){showToast(e?.message==='Delete failed'||!e?.message?'Delete failed.':e.message,'bad');}
    finally{setDeleting(false);}
  }

  const today=new Date();
  const inThisMonth=(p:any)=>{
    if(!p.taken_at) return false;
    const d=new Date(p.taken_at);
    return d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth();
  };
  const thisMonth=photos.filter(inThisMonth).length;
  const albums=Array.from(new Set(photos.map((p:any)=>p.album).filter(Boolean))) as string[];
  const issueCount=photos.filter((p:any)=>p.album==='Issues'||(Array.isArray(p.tags)&&p.tags.some((t:string)=>t.toLowerCase().includes('issue')))).length;
  const videoCount=photos.filter(isVideo).length;
  const lastPhoto=photos.reduce<any>((m,p)=>(p.taken_at&&(!m||p.taken_at>m.taken_at)?p:m),null);

  const filtered=photos.filter((p:any)=>{
    const ms=!search||(p.title||'').toLowerCase().includes(search.toLowerCase())
      ||(p.location||'').toLowerCase().includes(search.toLowerCase())
      ||(Array.isArray(p.tags)&&p.tags.some((t:string)=>t.toLowerCase().includes(search.toLowerCase())));
    const ma=filterAlbum==='All'||p.album===filterAlbum;
    const mp=periodFilter==='all'||inThisMonth(p);
    return ms&&ma&&mp;
  });

  // Group by date (default) or album for display
  const [groupBy,setGroupBy]=useState<'date'|'album'>('date');
  const grouped:Record<string,any[]>={};
  const ordered:any[]=[]; // the visible order — what ← / → step through
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
    for(const k of Object.keys(grouped)) ordered.push(...grouped[k]);
  } else {
    ordered.push(...filtered);
  }

  const filtersActive = !!search || filterAlbum!=='All' || periodFilter!=='all';
  const clearFilters = () => { setSearch(''); setFilterAlbum('All'); setPeriodFilter('all'); };

  // ← / → step through the visible photos; Esc closes the viewer. Ignored while
  // typing, while the composer is open, and while the crop editor is up.
  const selIndex = selected ? ordered.findIndex(p=>p.id===selected.id) : -1;
  const lightboxItems: LightboxItem[] = lightboxOpen
    ? ordered.map((p:any)=>({ id:String(p.id), url:p.url||'', kind:isVideo(p)?'video':'image', title:p.title||null, poster:p.thumbnail_url||null }))
    : [];
  // Read the visible order through a ref: it's rebuilt every render, and as a
  // dependency it would remake stepTo (and rebind the key handler) every time.
  const orderedRef = useRef<any[]>(ordered);
  orderedRef.current = ordered;
  const stepTo = useCallback((dir:1|-1)=>{
    if(selIndex<0) return;
    const next = orderedRef.current[selIndex+dir];
    if(next) viewPhoto(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selIndex]);
  useEffect(()=>{
    if(mode!=='view'||!selected||editingPhoto||lightboxOpen||uploadOpen) return;
    const onKey=(e:KeyboardEvent)=>{
      const t=e.target as HTMLElement|null;
      if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable)) return;
      if(e.key==='Escape'){ e.preventDefault(); closePanel(); }
      else if(e.key==='ArrowRight'){ e.preventDefault(); stepTo(1); }
      else if(e.key==='ArrowLeft'){ e.preventDefault(); stepTo(-1); }
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mode, selected, editingPhoto, stepTo, lightboxOpen, uploadOpen]);

  // ── Stat tiles: each opens the gallery filtered to that slice ──
  const stats: StatItem[] = loading
    ? [
        { label:'Photos & Video', value:'—', sub:'Loading…' },
        { label:'This Month', value:'—', sub:'Loading…' },
        { label:'Issues Tagged', value:'—', sub:'Loading…' },
        { label:'Last Added', value:'—', sub:'Loading…' },
      ]
    : [
        { label:'Photos & Video', value:photos.length, sub: filtersActive ? 'Click to show everything' : videoCount>0 ? `${videoCount} video${videoCount===1?'':'s'} · ${albums.length} album${albums.length===1?'':'s'}` : albums.length>0 ? `${albums.length} album${albums.length===1?'':'s'} in use` : 'No albums yet', onClick: clearFilters },
        { label:'This Month', value:thisMonth, tone: thisMonth>0 ? 'good' : 'default', sub: periodFilter==='month' ? 'Filtered — click to clear' : 'Added since the 1st', onClick: () => setPeriodFilter(p => (p==='month' ? 'all' : 'month')) },
        { label:'Issues Tagged', value:issueCount, tone: issueCount>0 ? 'bad' : 'default', sub: filterAlbum==='Issues' ? 'Filtered — click to clear' : issueCount>0 ? 'Flagged for follow-up' : 'Clean so far', onClick: () => setFilterAlbum(a => (a==='Issues' ? 'All' : 'Issues')) },
        { label:'Last Added', value: lastPhoto ? fmtDate(lastPhoto.taken_at) : '—', sub: lastPhoto ? `${isVideo(lastPhoto)?'Video':'Photo'} · ${lastPhoto.title || 'Most recent capture'}` : 'Nothing documented yet', onClick: lastPhoto ? () => viewPhoto(lastPhoto) : undefined },
      ];

  const detailOpen = !!selected && mode!=='create';
  // Stacked layouts: once the record is in the DOM, bring it into view instead of leaving it below the fold.
  useEffect(()=>{
    if(!detailOpen) return;
    const el = detailRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[detailOpen, selected?.id]);
  const selectedFromFiles = selected ? isFromFiles(selected) : false;

  const card = (photo:any) => (
    <PhotoCard
      key={photo.id}
      photo={photo}
      selected={selected?.id===photo.id&&mode!=='create'}
      onClick={()=>openPhoto(photo)}
      onEdit={(id,url)=>setEditingPhoto({id,url})}
      onStale={resign}
    />
  );

  // ── Gallery body: loading / error / empty / no-match / tiles — each distinct ──
  let galleryBody: React.ReactNode;
  if (loading) {
    galleryBody = (
      <div className="phGallery" aria-busy="true">
        <div className="phGrid">
          {Array.from({length:8}).map((_,i)=>(
            <div key={i} className="phCard" aria-hidden style={{cursor:'default'}}>
              <div className="phThumb" />
              <div className="phCardBody"><div style={{height:12,width:'70%',borderRadius:4,background:'var(--border-subtle)'}}/><div style={{height:10,width:'40%',borderRadius:4,background:'var(--border-subtle)'}}/></div>
            </div>
          ))}
        </div>
      </div>
    );
  } else if (loadError) {
    galleryBody = (
      <EmptyState
        icon={<WarningCircle size={22}/>}
        title="Couldn't load photos"
        text={`${loadError} Nothing has been lost — try again.`}
        action={<Button icon={<ArrowClockwise size={15}/>} onClick={()=>load()}>Retry</Button>}
      />
    );
  } else if (photos.length===0) {
    galleryBody = (
      <EmptyState
        icon={<Camera size={22}/>}
        title="No photos or video yet"
        text="Photos and video are the project record — progress proof, inspection evidence, punch documentation, closeout backup. Add a whole day's worth at once, any size."
        action={<Button icon={<Plus size={15} weight="bold"/>} onClick={openUpload}>Add Photos &amp; Video</Button>}
      />
    );
  } else if (filtered.length===0) {
    galleryBody = (
      <EmptyState
        icon={<Camera size={22}/>}
        title="No photos match these filters"
        text="Clear the search, album, or month filter to see more."
        action={<Button onClick={clearFilters}>Clear Filters</Button>}
      />
    );
  } else if (filterAlbum==='All') {
    galleryBody = (
      <div className="phGallery">
        {Object.entries(grouped).map(([group,groupPhotos])=>(
          <div key={group}>
            <div className="phGroupHead">
              {groupBy==='album' ? <Badge tone={albumBadge(group).tone}>{group}</Badge> : <span>{group}</span>}
              <small>{groupPhotos.length}</small>
            </div>
            <div className="phGrid">{groupPhotos.map(card)}</div>
          </div>
        ))}
      </div>
    );
  } else {
    galleryBody = (
      <div className="phGallery">
        <div className="phGrid">{filtered.map(card)}</div>
      </div>
    );
  }

  const detailWorkspace = detailOpen && (
    <div ref={detailRef} className="phDetailCq" style={{ scrollMarginTop: 84 }}>
      <div className="phDetail">
        <Card
          title={selected.title||'Untitled'}
          subtitle={[fmtDate(selected.taken_at)!=='—'?fmtDate(selected.taken_at):null, selected.location].filter(Boolean).join(' · ') || undefined}
          actions={<Button variant="ghost" size="sm" icon={<X size={16}/>} aria-label="Close viewer" title="Close viewer (Esc)" onClick={closePanel}/>}
        >
          <div className="phViewer" data-missing={selected.url?undefined:'true'}>
            {!selected.url ? 'No image on this record.' : isVideo(selected) ? (
              /* Stored once, rewatchable any time: the signed URL is re-issued on
                 every list, so an expired link just triggers a quiet re-sign. */
              <video key={selected.id} src={selected.url} poster={selected.thumbnail_url||undefined} controls playsInline preload="metadata"
                onError={()=>load({silent:true})}/>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.url} alt={selected.title||'Photo'} title="Open full screen to zoom"
                onClick={()=>setLightboxOpen(true)}
                onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
            )}
            {ordered.length>1 && (
              <>
                <div className="phNav" data-side="left"><Button variant="ghost" size="sm" icon={<CaretLeft size={18}/>} aria-label="Previous photo" title="Previous (←)" onClick={()=>stepTo(-1)} disabled={selIndex<=0}/></div>
                <div className="phNav" data-side="right"><Button variant="ghost" size="sm" icon={<CaretRight size={18}/>} aria-label="Next photo" title="Next (→)" onClick={()=>stepTo(1)} disabled={selIndex<0||selIndex>=ordered.length-1}/></div>
              </>
            )}
          </div>
          {ordered.length>1 && selIndex>=0 && (
            <div className="phMuted" style={{fontSize:'var(--fs-xs)',marginTop:8}}>{selIndex+1} of {ordered.length} in view · ← → to step, Esc to close</div>
          )}

          {selected.description && (
            <div className="phSection" style={{marginTop:16}}>
              <div className="phSectionTitle">Description</div>
              <div className="phProse">{selected.description}</div>
            </div>
          )}

          {Array.isArray(selected.tags)&&selected.tags.length>0&&(
            <div className="phSection" style={{marginTop: selected.description ? undefined : 16}}>
              <div className="phSectionTitle">Tags</div>
              <div className="phBadges">
                {selected.tags.map((tag:string)=>(
                  <Badge key={tag} tone={tag.toLowerCase().includes('issue')?'overdue':'neutral'}>{tag}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>

        <aside className="phRail" aria-label="Photo details and actions">
          <Card title="Details">
            <div className="phSection">
              <div className="phBadges">
                <Badge tone={albumBadge(selected.album).tone} dot>{albumBadge(selected.album).label}</Badge>
                {selectedFromFiles && !isVideo(selected) && <Badge tone="closed">Read-Only</Badge>}
              </div>
              {selectedFromFiles && !isVideo(selected) && (
                <div className="phNext">
                  This image lives in the project&apos;s Files &amp; Media library. Rename, move or delete it there.{' '}
                  <a href={`/app/projects/${projectId}/files`}>Open Files &amp; Media</a>
                </div>
              )}
            </div>
            <div className="phSection">
              <DetailList items={[
                ['Date Taken', fmtDate(selected.taken_at)],
                ['Location', selected.location || ''],
                ['Taken By', selected.taken_by || ''],
                ['Album', selected.album || 'General'],
                ...(isVideo(selected) && selected.duration_seconds ? [['Length', fmtDuration(selected.duration_seconds)] as [string,string]] : []),
                ['Source', isVideo(selected) ? 'Video library' : selectedFromFiles ? 'Files & Media' : 'Site Photos'],
              ]}/>
            </div>
            <div className="phSection">
              <div className="phActions">
                {!selectedFromFiles && (
                  <Button icon={<PencilSimple size={16}/>} onClick={()=>openEdit(selected)} disabled={mode==='edit'}>
                    Edit Details
                  </Button>
                )}
                {!selectedFromFiles && selected.url && (
                  <Button icon={<Crop size={16}/>} onClick={()=>setEditingPhoto({id:selected.id,url:selected.url})}>
                    Edit / Crop / Rotate
                  </Button>
                )}
                <div className="phActionsRow">
                  {selected.url && (
                    <Button icon={isVideo(selected)?<Play size={16}/>:<ArrowsOut size={16}/>} onClick={()=>setLightboxOpen(true)}>
                      {isVideo(selected)?'Play Full Screen':'Full Screen & Zoom'}
                    </Button>
                  )}
                  {(!selectedFromFiles || isVideo(selected)) && (
                    <RowActions actions={[
                      { label:'Delete', icon:<Trash size={15}/>, onClick:()=>deletePhoto(selected), tone:'danger', disabled:deleting },
                    ]}/>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );

  const composerOpen = mode==='create'||mode==='edit';

  return(
    <div className="phWs" onDragEnter={onPageDragEnter}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <MediaUploadPanel
        open={uploadOpen}
        onClose={()=>setUploadOpen(false)}
        title="Add Photos & Video"
        subtitle={ctx?.project?.name ? <>Filed to <strong style={{color:'var(--text-secondary)'}}>{ctx.project.name}</strong>. Pick as many as you like.</> : 'Pick as many as you like.'}
        items={queue.items}
        onFiles={addFiles}
        onRetry={queue.retry}
        onRemove={queue.remove}
        hint="Photos at any size · videos up to 500 MB. They upload straight to storage, so big files are fine."
        extra={queue.items.length===0 && (
          <button type="button" className="phLinkAlt" onClick={()=>{ setUploadOpen(false); openCreate(); }}>
            <LinkSimple size={15}/> Have a link instead? Add a photo by URL
          </button>
        )}
      >
        <Field label="Album for these photos" hint="Videos go to the Video album.">
          <Select value={uploadAlbum} onChange={e=>setUploadAlbum(e.target.value)} options={ALBUMS}/>
        </Field>
      </MediaUploadPanel>

      {lightboxOpen && selected && ordered.length>0 && (
        <ZoomLightbox
          items={lightboxItems}
          index={Math.max(0, selIndex)}
          onIndex={(i)=>{ const next=ordered[i]; if(next) viewPhoto(next); }}
          onClose={()=>{ setLightboxOpen(false); if(lightboxFromTap){ setLightboxFromTap(false); closePanel(); } }}
          onInfo={()=>{ setLightboxOpen(false); setLightboxFromTap(false); }}
          onMediaError={()=>load({silent:true})}
        />
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
              else showToast('Save failed.', 'bad');
            } catch { showToast('Save failed.', 'bad'); }
            setEditingPhoto(null);
          }}
          onDelete={async (id) => {
            try {
              const headers = await getAuthHeaders();
              const r = await fetch(`/api/photos/${id}`, { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' } });
              if (!r.ok) throw new Error('delete failed');
              setPhotos(prev => prev.filter(p => p.id !== id));
              if (selected?.id === id) closePanel();
              showToast('Photo deleted.');
            } catch { showToast('Delete failed.', 'bad'); }
            setEditingPhoto(null);
          }}
        />
      )}

      <PageShell
        crumbs={[
          { label:'Projects', href:'/app/projects' },
          { label: ctx?.project?.name || 'Project', href:`/app/projects/${projectId}/overview` },
          { label:'Photos' },
        ]}
        title="Site Photos & Video"
        /* Always name the job on screen — never a bare "Photos" that leaves a GC
           guessing which project they are filing into. */
        subtitle={ctx?.project?.name ? `${ctx.project.name} — progress photos and documentation.` : (loading ? 'Loading project…' : 'Progress photos and documentation for this project.')}
        actions={
          <>
            {queue.busy && !uploadOpen && (
              <button type="button" className="phUploading" onClick={()=>setUploadOpen(true)} aria-label="Show uploads">
                Uploading {queue.counts.done} of {queue.counts.total - queue.counts.failed}
                <i><b style={{width:`${Math.round(queue.overall*100)}%`}}/></i>
              </button>
            )}
            <Button variant="primary" icon={<Plus size={15} weight="bold"/>} onClick={openUpload}>
              Add Photos &amp; Video
            </Button>
          </>
        }
      >
        {!loadError && <StatRow items={stats}/>}
        {waiting>0 && (
          <div role="status" style={{display:'flex',alignItems:'center',gap:8,margin:'10px 0 4px',padding:'10px 14px',borderRadius:12,border:'1px solid var(--border-default)',background:'var(--bg-surface-2)',fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>
            <CloudArrowUp size={18} weight="bold" style={{color:'var(--c-orange)',flex:'0 0 auto'}}/>
            {waiting===1?'1 photo or video is':`${waiting} photos/videos are`} saved on this phone — {waiting===1?'it uploads':'they upload'} when you&apos;re back online.
          </div>
        )}

        <SubInbox projectId={projectId} focus={inboxFocus} onChanged={()=>load({silent:true})} onToast={(m,t)=>showToast(m,t)}/>

        {!loading && !loadError && photos.length>0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by title, location, or tag…"
            filters={
              <>
                <Select
                  aria-label="Album"
                  value={filterAlbum}
                  onChange={e=>setFilterAlbum(e.target.value)}
                  style={{ width:'auto', minWidth:150 }}
                  options={[{ value:'All', label:'All Albums' }, ...ALBUMS, ...(albums.includes(VIDEO_ALBUM)?[VIDEO_ALBUM]:[]), ...(albums.includes(FILES_ALBUM)?[FILES_ALBUM]:[])]}
                />
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={
              <>
                {filterAlbum==='All' && (
                  <div className="phTabs">
                    <Tabs
                      value={groupBy}
                      onChange={k=>setGroupBy(k as 'date'|'album')}
                      tabs={[{ key:'date', label:'By Date' }, { key:'album', label:'By Album' }]}
                    />
                  </div>
                )}
                <span className="phMuted" style={{ fontSize:'var(--fs-sm)' }}>{filtered.length} of {photos.length}</span>
              </>
            }
          />
        )}

        <div className="phCq">
          <div className="phSplit" data-open={detailOpen?'true':'false'}>
            <div className="phList">
              <Card flush>{galleryBody}</Card>
            </div>
            {detailWorkspace}
          </div>
        </div>
      </PageShell>

      {/* ── Composer: add / edit ─────────────────────────────────── */}
      <FormModal
        open={composerOpen}
        onClose={closeComposer}
        title={mode==='create' ? 'Add Photo' : 'Edit Photo'}
        subtitle={ctx?.project?.name ? `Filed to ${ctx.project.name}.` : undefined}
        onSubmit={async()=>{ await save(); }}
        submitLabel={mode==='create'?'Add Photo':'Save Changes'}
        busy={saving}
        error={formError||null}
      >
        {/* ── The photo itself. A real file, not a URL a GC has to hand-type. ── */}
        <Field
          label={mode==='create'?'Photo':'Replace Photo'}
          required={mode==='create'}
          hint={mode==='create' ? 'Uploads straight into this project. No link to paste.' : 'Leave empty to keep the current image and just edit the details.'}
        >
          <div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{display:'none'}} aria-hidden tabIndex={-1}/>
            {uploadPreview?(
              <div className="phPreview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadPreview} alt="Selected"/>
                <div className="phPreviewBar">
                  <span>{uploadFile?.name||'Selected photo'}</span>
                  <Button size="sm" variant="ghost" onClick={()=>fileRef.current?.click()}>Replace</Button>
                  <Button size="sm" variant="ghost" onClick={clearUpload}>Remove</Button>
                </div>
              </div>
            ):(
              <button type="button" className="phDrop" onClick={()=>fileRef.current?.click()}>
                <Camera size={18} weight="duotone"/>
                {mode==='create'?'Choose a Photo from This Computer':'Upload a Replacement Image'}
              </button>
            )}
          </div>
        </Field>

        <FormGrid cols={2}>
          <Field label="Title" required span>
            <Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Foundation pour complete"/>
          </Field>
          <Field label="Album" hint={mode==='create'&&auto.album ? <><AutoChip/> Matched your current album filter — change freely.</> : undefined}>
            <Select value={form.album} onChange={e=>setForm(f=>({...f,album:e.target.value}))} options={ALBUMS}/>
          </Field>
          <Field label="Date Taken" hint={mode==='create'&&auto.date ? <><AutoChip/> Defaulted to today — adjust freely.</> : undefined}>
            <div className="phDateInput"><SaguaroDatePicker value={form.taken_at} onChange={v=>setForm(f=>({...f,taken_at:v}))} style={DATE_INPUT_STYLE}/></div>
          </Field>
          <Field label="Description" span>
            <Textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={3} placeholder="What does this photo show?"/>
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="e.g. Level 2, North"/>
          </Field>
          <Field label="Taken By">
            <Input value={form.taken_by} onChange={e=>setForm(f=>({...f,taken_by:e.target.value}))} placeholder="Name or initials"/>
          </Field>
          {/* Pasting a link stays available for photos that already live somewhere
              else, but it is no longer the only way in. */}
          {!uploadFile&&(
            <Field label={mode==='create'?'…or Paste an Image URL':'Photo URL'} span>
              <Input value={form.url} onChange={e=>setForm(f=>({...f,url:e.target.value}))} placeholder="https://…"/>
            </Field>
          )}
          <Field label="Tags" span hint="Comma-separated — e.g. concrete, footing, issue.">
            <Input value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="concrete, footing, issue"/>
          </Field>
        </FormGrid>
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position:'relative', zIndex:10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}

function PhotoCard({photo,selected,onClick,onEdit,onStale}:{
  photo:any;selected:boolean;onClick:()=>void;onEdit?:(id:string,url:string)=>void;onStale?:()=>void;
}){
  const src=isVideo(photo)?photo.thumbnail_url:(photo.thumbnail_url||photo.url);
  const [missing,setMissing]=useState(!photo.url);
  // A dead link is usually an expired signature: ask for fresh links once,
  // and only call it missing if the fresh link fails too.
  const retried=useRef(false);
  useEffect(()=>{ retried.current=false; if(photo.url) setMissing(false); },[src,photo.url]);
  const onImgError=()=>{
    if(!retried.current&&onStale){ retried.current=true; onStale(); return; }
    setMissing(true);
  };
  const badge=albumBadge(photo.album);
  return(
    <div className="phCard" data-sel={selected?'true':undefined} role="button" tabIndex={0}
      onClick={onClick}
      onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); onClick(); } }}
      aria-label={`Open ${photo.title||'photo'}`}
      aria-pressed={selected}>
      <div className="phThumb" data-missing={missing?'true':undefined}>
        {!missing ? (
          /* Grid tiles render the ~400px thumbnail; the full original is for the
             viewer only (see THUMBNAIL CONTRACT in /api/photos/list). */
          isVideo(photo) && !photo.thumbnail_url
            ? <span style={{display:'flex',alignItems:'center',justifyContent:'center',width:'100%',height:'100%',color:'var(--text-tertiary)'}}><Play size={28} weight="fill"/></span>
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={src} alt={photo.title||'Photo'} loading="lazy" decoding="async" onError={onImgError}/>
        ) : (
          <span><Images size={18}/> No image</span>
        )}
        {isVideo(photo) && !missing && (
          <>
            {photo.thumbnail_url && <div className="phPlay"><span><Play size={18} weight="fill"/></span></div>}
            {photo.duration_seconds ? <span className="phDur">{fmtDuration(photo.duration_seconds)}</span> : null}
          </>
        )}
      </div>
      <div className="phCardBody">
        <div className="phCardTitle" title={photo.title||'Untitled'}>{photo.title||'Untitled'}</div>
        <div className="phCardMeta">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {photo.taken_at && <span>{new Date(photo.taken_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>}
        </div>
        {photo.location && <div className="phCardMeta"><span>{photo.location}</span></div>}
      </div>
      {photo.url && onEdit && !isFromFiles(photo) && (
        <div className="phCardEdit">
          <Button size="sm" variant="ghost" icon={<Crop size={14}/>} aria-label={`Edit, crop or rotate ${photo.title||'photo'}`} title="Edit / Crop / Rotate"
            onClick={(e)=>{e.stopPropagation();onEdit(photo.id,photo.url);}}/>
        </div>
      )}
    </div>
  );
}
