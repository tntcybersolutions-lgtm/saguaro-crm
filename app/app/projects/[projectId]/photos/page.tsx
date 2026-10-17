'use client';
/**
 * Project Photos — Pass 4, on the RFIs reference layout (gallery + detail).
 *
 * The project is taken from the ROUTE (`/app/projects/[projectId]/photos`), never from a
 * global "active project" — so every read and every write on this screen is addressed to
 * the project named in the URL bar. It cannot drift.
 *
 * Anatomy: title + one primary action (Add Photos & Video) → StatRow (each
 * tile filters the gallery) → Toolbar (search, album, group by) → a dense
 * thumbnail grid grouped by day (or album), captions under each picture. A tap
 * opens the full-screen lightbox (swipe, zoom, play, send, delete); its Details
 * button — or a tile's (i) — opens the viewer + details rail beside the grid
 * (stacked on phones). ← / → step through the visible photos, Esc closes.
 * Create / edit open the composer in a FormModal with a real file input.
 *
 * Views (kit Tabs): Timeline — months → days, with a sticky jump-to-month
 * rail; Albums — a tile per album (cover + count), open one for its grid,
 * new / rename by re-filing photos (album is a column on each photo);
 * Location — a real map (Leaflet + free OSM/CARTO tiles, components/media/
 * PhotoMap, loaded client-only): every GPS-stamped photo is a pin showing its
 * own thumbnail, nearby pins merge with a count, and a popup opens the
 * lightbox; the spot list stays under the map with the no-GPS count.
 * Grid size S / M / L (Timeline, album and spot grids) is remembered per
 * viewer in localStorage.
 * Select mode (checkbox on hover, long-press on a phone) → download, move to
 * album, send to another job, delete. Markup draws on a photo and saves the
 * result as a NEW photo "<title> (marked up)" — the original is untouched.
 * Pure grouping / clustering / filtering lives in lib/photo-views.ts.
 *
 * Every read / write is the one this screen already used:
 *   list      GET    /api/photos/list?projectId=&include=files
 *   upload    POST   /api/photos/upload            (multipart, new photo)
 *   create    POST   /api/photos/create            (URL-only photo)
 *   details   PUT    /api/photos/[id]
 *   replace   POST   /api/photos/[id]/upload       (multipart, replace image / crop save)
 *   delete    DELETE /api/photos/[id]   (a video: DELETE /api/files/[id])
 *   send      POST   /api/media/move       (SendToJobDialog, up to 100 at once)
 * Thumbnails come from the list route's thumbnail_url; the full original is
 * only ever drawn in the viewer. URLs are whatever the authorized list route
 * returned — nothing here publishes private media.
 */
import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { retryText, apiErrorFrom } from '@/lib/api-refusal';
import dynamic from 'next/dynamic';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import PhotoEditor from '../../../../../components/PhotoEditor';
import MediaUploadPanel from '@/components/media/MediaUploadPanel';
import ZoomLightbox, { type LightboxItem } from '@/components/media/ZoomLightbox';
import PhotoMarkup from '@/components/media/PhotoMarkup';
import { saveMediaMany } from '@/lib/media-save';
import {
  groupByDay, groupByMonth, clusterByLocation, matchesPhotoFilter, albumSummaries, photoGeo,
  isIssuePhoto, uploaders as uploadersOf, cleanAlbumName, photoTags, type PhotoFilter,
  parseTileSize, TILE_SIZES, type TileSize,
} from '@/lib/photo-views';
import SubInbox from '@/components/media/SubInbox';
import RelatedItems from '@/components/related/RelatedItems';
import SendToJobDialog, { type MoveItem } from '@/components/media/SendToJobDialog';
import { useUploadQueue } from '@/lib/useUploadQueue';
import { uploadPhoto, uploadVideo, fmtDuration } from '@/lib/media-upload';
import {
  addToOutbox, isOffline, looksLikeNetworkError, listOutbox, removeFromOutbox, retryOutboxItem,
  subscribeNet, getNetState, getServerNetState, type OutboxItem,
} from '@/lib/offline/outbox';
import OnThisPhone from '@/components/media/OnThisPhone';
import {
  Camera, X, PencilSimple, Plus, Images, WarningCircle, ArrowClockwise, Trash,
  Crop, CaretLeft, CaretRight, Play, ArrowsOut, LinkSimple, PaperPlaneTilt,
  Info, VideoCamera, CalendarBlank, FolderOpen, MapPin, CheckSquare, Square, CheckCircle,
  DownloadSimple, FolderSimplePlus, PencilLine, Scribble, Funnel,
} from '@phosphor-icons/react';
import {
  PageShell, StatRow, Badge, Button, Toolbar, Tabs, EmptyState, RowActions,
  FormModal, Field, Input, Textarea, Select, FormGrid, DetailList, Toast, useToast, DateInput,
  type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { layout } from '@/lib/design-tokens';
import { photoFix, readFix, fixLabel, fixMapUrl } from '@/lib/photo-gps';
import { usePeople } from '@/lib/hooks/usePeople';
import { personName } from '@/lib/person-names';

/* Leaflet needs `window`: the map is drawn in the browser only. */
const PhotoMap = dynamic(() => import('@/components/media/PhotoMap'), {
  ssr: false,
  loading: () => <div className="phMapWait" aria-busy="true">Loading map…</div>,
});
/** Per-viewer grid size (S / M / L), kept in this browser. */
const TILE_KEY='saguaro:photos:tile-size';
const TILE_LABEL:Record<TileSize,string>={s:'Small tiles',m:'Medium tiles',l:'Large tiles'};

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
const isSavedId=(id:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id||''));
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

/** Facts with a value only — an empty field is left out, never shown as "—". */
const facts=(rows:[string,React.ReactNode][])=>rows.filter(([,v])=>v!=null&&v!==''&&v!=='—');

function fmtDate(iso:string|null|undefined){
  if(!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}

const CSS = `
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
.phRelated { padding: 16px 4px 0; }
@container phdetail (min-width: 720px) {
  .phDetail { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 34%, ${layout.detailRailMax}px); }
  .phRail { order: 0; position: sticky; top: 16px; }
}
.phGallery { display: flex; flex-direction: column; gap: 28px; padding: 4px 0 8px; }
.phGroupHead { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); }
.phGroupHead small { color: var(--text-tertiary); font-weight: 600; font-size: var(--fs-sm); }
.phGroupHead::after { content: ''; flex: 1; height: 1px; background: var(--border-subtle); }
/* Justified rows, like a phone's photo library: every tile is as wide as its
   picture at the row height (--ar = the photo's own width / height), so each
   photo shows WHOLE — never cropped, never boxed, no side fill. A row's tiles
   grow together to the edge; the last row keeps its natural size. */
.phWs { --ph-h: 200px; --ph-gap: 10px; }
.phWs[data-tile="s"] { --ph-h: 130px; --ph-gap: 6px; }
.phWs[data-tile="l"] { --ph-h: 320px; --ph-gap: 14px; }
.phGrid { display: flex; flex-wrap: wrap; gap: var(--ph-gap); }
.phGrid::after { content: ''; flex: 999999 1 0; }
.phSplit[data-open="true"] .phGrid { --ph-h: 150px; }
.phTile { --ar: 1.3333; position: relative; display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: var(--ar) 1 calc(var(--ar) * var(--ph-h)); max-width: min(100%, calc(var(--ar) * var(--ph-h) * 1.7)); cursor: pointer; text-align: left; padding: 0; color: inherit; font: inherit; background: none; border: 0; }
.phTile:focus-visible { outline: none; }
.phTile:focus-visible .phThumb { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.phThumb { position: relative; width: 100%; aspect-ratio: var(--ar); border-radius: 6px; overflow: hidden; transition: opacity .15s; }
.phTile:hover .phThumb { opacity: .9; }
.phTile[data-sel="true"] .phThumb { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
/* The whole picture: the cell already has the photo's own shape. */
.phThumb img { width: 100%; height: 100%; object-fit: contain; display: block; }
.phThumb[data-missing="true"] { display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--text-tertiary); font-size: var(--fs-sm); border: 1px dashed var(--border-default); }
.phThumb[data-skel="true"] { background: var(--bg-surface); }
.phCap { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 0 2px; }
.phCapTitle { font-size: var(--fs-sm); font-weight: 600; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color .15s; }
.phTile:hover .phCapTitle, .phTile[data-sel="true"] .phCapTitle { color: var(--text-primary); }
.phCapMeta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-tertiary); min-width: 0; }
.phCapMeta > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.phCapMore { max-height: 0; overflow: hidden; opacity: 0; transition: max-height .15s, opacity .15s; font-size: 12px; color: var(--text-tertiary); white-space: nowrap; text-overflow: ellipsis; }
.phTile:hover .phCapMore, .phTile:focus-visible .phCapMore { max-height: 18px; opacity: 1; }
.phTileTools { position: absolute; top: 6px; right: 6px; display: flex; gap: 4px; opacity: 0; transition: opacity .15s; }
.phTile:hover .phTileTools, .phTile:focus-within .phTileTools, .phTile[data-sel="true"] .phTileTools { opacity: 1; }
.phTileTools .k-btn { background: color-mix(in srgb, var(--bg-base) 85%, transparent); }
/* Touch screens: a tap opens the viewer (Details, crop, mark up live there) —
   no tool buttons parked on top of the picture. */
@media (hover: none) { .phTileTools { display: none; } }
.phViewer { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; max-height: min(70vh, 720px); min-height: 220px; }
.phViewer img { border-radius: 6px; }
.phPane { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.phPaneHead { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
.phPaneHead > div { flex: 1; min-width: 0; }
.phPaneHead h2 { margin: 0; font-size: var(--fs-section, 16px); font-weight: 700; color: var(--title-section); overflow-wrap: anywhere; }
.phPaneHead p { margin: 2px 0 0; font-size: var(--fs-sm); color: var(--text-tertiary); }
.phRail { padding-top: 4px; }
@container phdetail (min-width: 720px) { .phRail { border-left: 1px solid var(--border-default); padding-left: 16px; } }
.phViewer img { max-width: 100%; max-height: min(70vh, 720px); width: auto; height: auto; display: block; object-fit: contain; cursor: zoom-in; }
.phViewer[data-missing="true"] { color: var(--text-tertiary); font-size: var(--fs-sm); }
.phViewer video { width: 100%; max-height: min(70vh, 720px); display: block; background: var(--bg-base); }
.phNav { position: absolute; top: 50%; transform: translateY(-50%); }
.phNav[data-side="left"] { left: 8px; }
.phNav[data-side="right"] { right: 8px; }
.phNav .k-btn { background: color-mix(in srgb, var(--bg-base) 80%, transparent); }
.phSection { display: flex; flex-direction: column; gap: 8px; }
.phSection + .phSection { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
.phSectionTitle { font-size: var(--fs-sm); font-weight: 700; color: var(--text-tertiary); }
.phProse { font-size: var(--fs-md); line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; max-width: ${layout.readingMaxWidth}; }
.phMuted { color: var(--text-tertiary); }
.phBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.phActions { display: flex; flex-direction: column; gap: 8px; }
.phActions .k-btn { width: 100%; justify-content: flex-start; }
.phActionsRow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.phActionsRow > .k-btn { flex: 1 1 auto; }
.phDrop { width: 100%; min-height: 96px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 16px 12px; border-radius: var(--radius-sm); border: 1px dashed var(--border-strong); background: var(--bg-surface-2); color: var(--text-primary); font-weight: 700; font-size: var(--fs-md); cursor: pointer; }
.phDrop:hover { border-color: var(--border-interactive); }
.phDrop:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.phPreview { border: 1px solid var(--border-default); border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-solid); }
.phPreview img { width: 100%; max-height: 240px; object-fit: contain; display: block; background: var(--bg-solid); }
.phPreviewBar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; font-size: var(--fs-sm); color: var(--text-tertiary); }
.phPreviewBar > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.phDateInput { width: 100%; }
.phTabs .k-tabs { margin: 0; }
.phPlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.phPlay > span { width: 40px; height: 40px; border-radius: 50%; background: color-mix(in srgb, var(--bg-base) 75%, transparent); border: 1px solid var(--border-strong); display: inline-flex; align-items: center; justify-content: center; color: var(--text-primary); }
.phUpBar { display: block; width: 56px; height: 4px; border-radius: 4px; background: var(--bg-surface-2); overflow: hidden; }
.phUpBar > b { display: block; height: 100%; background: var(--success); transition: width .2s; }
.phLinkAlt { align-self: flex-start; }
.phViews { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.phViews .k-tabs { margin: 0; }
.phViews > .phSpacer { flex: 1; }
.phMore { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.phMore label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: var(--text-tertiary); min-width: 140px; flex: 1 1 140px; max-width: 220px; }
.phToggle[aria-pressed="true"] { border-color: var(--border-interactive); color: var(--text-primary); background: var(--bg-surface-2); }
.phJump { position: sticky; top: 0; z-index: 4; display: flex; gap: 6px; overflow-x: auto; padding: 8px 0; background: var(--bg-base); scrollbar-width: none; }
.phJump::-webkit-scrollbar { display: none; }
.phChip { flex: 0 0 auto; min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-secondary); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.phChip small { color: var(--text-tertiary); font-size: 12px; font-weight: 600; }
.phChip[aria-current="true"] { border-color: var(--border-interactive); color: var(--text-primary); background: var(--bg-surface-2); }
.phMonth { scroll-margin-top: 60px; display: flex; flex-direction: column; gap: 16px; }
.phMonthHead { font-size: var(--fs-md); font-weight: 800; color: var(--text-primary); display: flex; align-items: baseline; gap: 8px; }
.phMonthHead small { font-size: var(--fs-sm); color: var(--text-tertiary); font-weight: 600; }
.phCheck { position: absolute; top: 6px; left: 6px; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--border-strong); background: color-mix(in srgb, var(--bg-base) 80%, transparent); color: var(--text-primary); cursor: pointer; opacity: 0; transition: opacity .15s; padding: 0; }
.phTile:hover .phCheck, .phTile:focus-within .phCheck, .phTile[data-picking="true"] .phCheck { opacity: 1; }
.phTile[data-picked="true"] .phThumb { outline: 3px solid var(--brand-primary); outline-offset: 2px; opacity: .85; }
.phTile[data-picked="true"] .phCheck { color: var(--brand-primary); border-color: var(--brand-primary); }
.phTile[data-picking="true"] .phTileTools { display: none; }
.phThumb img { -webkit-touch-callout: none; user-select: none; -webkit-user-select: none; }
.phBulk { position: sticky; bottom: 0; z-index: 5; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); background: var(--bg-surface); border-top: 1px solid var(--border-default); }
.phBulk strong { font-size: var(--fs-md); margin-right: auto; }
.phGeo { display: flex; flex-direction: column; gap: 10px; }
.phGeoHead { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: var(--fs-sm); color: var(--text-secondary); }
.phGeoHead strong { color: var(--text-primary); font-size: var(--fs-md); }
.phPanel { display: flex; flex-direction: column; gap: 14px; }
.phSeg { display: inline-flex; align-items: center; border: 1px solid var(--border-default); border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-surface); }
.phSeg button { min-width: 40px; min-height: 36px; padding: 0 10px; border: 0; border-right: 1px solid var(--border-default); background: transparent; color: var(--text-secondary); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.phSeg button:last-child { border-right: 0; }
.phSeg button:hover { color: var(--text-primary); background: var(--bg-surface-2); }
.phSeg button[aria-checked="true"] { color: var(--text-primary); background: var(--bg-surface-2); box-shadow: inset 0 -2px 0 var(--text-primary); }
.phSeg button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
.phMapWrap { display: flex; flex-direction: column; gap: 16px; }
.phMapWait { display: flex; align-items: center; justify-content: center; height: clamp(320px, 56vh, 640px); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); background: var(--bg-solid); color: var(--text-tertiary); font-size: var(--fs-sm); }
.phNoGeo { display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); color: var(--text-secondary); }
.phNoGeo strong { color: var(--text-primary); }
.phPanel h2 { margin: 0; font-size: 17px; font-weight: 800; overflow-wrap: anywhere; }
@media (max-width: 640px) {
  .phCheck { width: 36px; height: 36px; }
  .phMore label { max-width: none; }
  .phSeg button { min-height: 44px; min-width: 44px; }
  .phWs .k-btn, .phWs .k-stat, .phWs select.k-select, .phWs .k-input { min-height: 44px; }
  /* A phone: Small = 3 across, Medium = 2, Large = 1 (4:3 pictures). */
  .phWs { --ph-h: 128px; --ph-gap: 6px; }
  .phWs[data-tile="s"] { --ph-h: 84px; --ph-gap: 4px; }
  .phWs[data-tile="l"] { --ph-h: 250px; --ph-gap: 10px; }
  .phWs[data-tile="s"] .phCap { display: none; }
  .phCapMore { display: none; }
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
  // Who took each photo, by name — the column keeps the uploader's email or id (lib/person-names).
  const people=usePeople(photos.map((p:any)=>p?.taken_by));
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [selected,setSelected]=useState<any>(null);
  const [sendOpen,setSendOpen]=useState(false);
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
  const [view,setView]=useState<'timeline'|'albums'|'map'>('timeline');
  const [openAlbum,setOpenAlbum]=useState<string|null>(null);
  const [dateFrom,setDateFrom]=useState('');
  const [dateTo,setDateTo]=useState('');
  const [uploader,setUploader]=useState('');
  const [hasLoc,setHasLoc]=useState(false);
  const [issuesOnly,setIssuesOnly]=useState(false);
  const [showMore,setShowMore]=useState(false);
  /* Select mode: tiles toggle instead of open; the bulk bar acts on `picked`. */
  const [picking,setPicking]=useState(false);
  const [picked,setPicked]=useState<Set<string>>(()=>new Set());
  const [bulkBusy,setBulkBusy]=useState('');
  /* "Add to <album>": New Album picks its photos in select mode. */
  const [targetAlbum,setTargetAlbum]=useState<string|null>(null);
  const [albumDlg,setAlbumDlg]=useState<{mode:'new'|'rename'|'move';from?:string;name:string;choice:string}|null>(null);
  const [albumErr,setAlbumErr]=useState('');
  const [sendTargets,setSendTargets]=useState<{items:MoveItem[];what:string;bulk:boolean}|null>(null);
  const [markup,setMarkup]=useState<{photo:any;reopen:boolean}|null>(null);
  /* Grid size, remembered per viewer in this browser. Storage can be blocked
     (private mode, cleared data) — the page then just uses Medium. */
  const [tile,setTile]=useState<TileSize>('m');
  useEffect(()=>{ try{ setTile(parseTileSize(window.localStorage.getItem(TILE_KEY))); }catch(err){ console.debug('[photos] tile size read', err); } },[]);
  const chooseTile=(t:TileSize)=>{ setTile(t); try{ window.localStorage.setItem(TILE_KEY,t); }catch(err){ console.debug('[photos] tile size save', err); } };

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

  const load=useCallback(async(opts?:{silent?:boolean}):Promise<any[]|null>=>{
    if(!opts?.silent) setLoading(true);
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch(`/api/photos/list?projectId=${projectId}&include=files`,{headers:h});
      if (!r.ok) throw await apiErrorFrom(r, 'Failed to load data');
      const d=await r.json();
      setPhotos(d.photos||[]);
      signedAt.current=Date.now();
      return (d.photos||[]) as any[];
    }catch{ if(!opts?.silent){setPhotos([]);setLoadError('Failed to load. Please try again.');} return null; }
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
  const [waitingItems,setWaitingItems]=useState<OutboxItem[]>([]);
  const refreshWaiting=useCallback(()=>{ listOutbox(projectId).then(setWaitingItems).catch(()=>setWaitingItems([])); },[projectId]);
  /* The offline bar's store: every change in what is waiting (saved, sending,
     sent, refused) re-reads this job's list, so a tile leaves the moment its
     photo is on the server. */
  const net=useSyncExternalStore(subscribeNet,getNetState,getServerNetState);
  useEffect(()=>{ refreshWaiting(); },[net.pending,net.syncing,net.online,refreshWaiting]);
  async function removeWaiting(it:OutboxItem){
    if(!(await confirmDialog({ title:'Remove from this phone?', message:`"${it.name}" hasn't uploaded yet. This phone has the only copy — removing it deletes it.`, danger:true }))) return;
    try{ await removeFromOutbox(it.id); showToast('Removed from this phone.'); }
    catch{ showToast("Couldn't remove it. Try again.",'bad'); }
    refreshWaiting();
  }
  async function retryWaiting(it:OutboxItem){
    try{ await retryOutboxItem(it.id); showToast(isOffline()?'It tries again when you\'re back online.':'Trying again…'); }
    catch{ showToast("Couldn't retry it. Try again.",'bad'); }
    refreshWaiting();
  }
  const keepOnPhone=async(file:File,kind:'image'|'video')=>{
    await addToOutbox({projectId,kind,album:kind==='video'?null:uploadAlbumRef.current,name:file.name||(kind==='video'?'video.mov':'photo.jpg'),type:file.type,size:file.size,file,location:kind==='image'?await photoFix():null});
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
    const inView=view==='albums'?(openAlbum||'All'):filterAlbum;
    setUploadAlbum(inView!=='All'&&inView!==FILES_ALBUM&&inView!==VIDEO_ALBUM?inView:'General');
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
  // A Related Items link opens one photo: ?photo=<id> selects it once the list is in.
  const photoParamDone=useRef(false);
  useEffect(()=>{
    if(photoParamDone.current||typeof window==='undefined'||photos.length===0) return;
    photoParamDone.current=true;
    const u=new URL(window.location.href);
    const want=u.searchParams.get('photo');
    if(!want) return;
    const hit=photos.find(p=>String(p.id)===want);
    u.searchParams.delete('photo');
    window.history.replaceState(null,'',u.pathname+(u.search?u.search:'')+u.hash);
    if(hit) viewPhoto(hit);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[photos]);
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
  /* The project's name comes from the shared SWR cache, which can already hold
     it when this page hydrates (the job shell fetched it first) while the
     server rendered without it — a text mismatch, React #423 on phones. Read it
     only after mount so the first client render matches the server's. */
  const [mounted,setMounted]=useState(false);
  useEffect(()=>{ setMounted(true); },[]);
  const projectName:string|undefined = mounted ? (ctx?.project?.name || undefined) : undefined;
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
  /* A tap on a tile means "show me the picture": straight to the full-screen
     lightbox (swipe, pinch, zoom, play) on every device. Its Details button —
     or the tile's own (i) — opens the details card beside the grid. */
  const [lightboxFromTap,setLightboxFromTap]=useState(false);
  function openPhoto(photo:any){
    viewPhoto(photo);
    setLightboxFromTap(true); setLightboxOpen(true);
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

  /** Delete one photo / video. From the full-screen viewer it stays open on
   *  the next one instead of dropping you back on the grid. */
  async function deletePhoto(photo:any, fromViewer=false):Promise<boolean>{
    if(!(await confirmDialog({ title: 'Please confirm', message: `Delete "${photo.title||'this item'}"? This removes it from the job for everyone.`, danger: true }))) return false;
    setDeleting(true);
    try{
      const h=await getAuthHeaders();
      // A video is a project_files row (the gallery shows it as `file:<id>`).
      const dr=isVideo(photo)&&photo.file_id
        ?await fetch(`/api/files/${photo.file_id}`,{method:'DELETE',headers:h})
        :await fetch(`/api/photos/${photo.id}`,{method:'DELETE',headers:h});
      if (dr.status===403) throw new Error('You need full Documents access to delete this.');
      if (!dr.ok) throw await apiErrorFrom(dr, 'Delete failed');
      if(fromViewer){
        const at=ordered.findIndex((p:any)=>p.id===photo.id);
        const neighbour=ordered[at+1]||ordered[at-1];
        if(neighbour) viewPhoto(neighbour); else { setLightboxOpen(false); setLightboxFromTap(false); closePanel(); }
        await load({silent:true});
      } else {
        showToast(isVideo(photo)?'Video deleted.':'Photo deleted.');closePanel();await load();
      }
      return true;
    }catch(e:any){showToast(e?.message==='Delete failed'||!e?.message?'Delete failed.':e.message,'bad');return false;}
    finally{setDeleting(false);}
  }

  const today=new Date();
  const inThisMonth=(p:any)=>matchesPhotoFilter(p,{thisMonth:true,now:today});
  const thisMonth=photos.filter(inThisMonth).length;
  const albums=Array.from(new Set(photos.map((p:any)=>p.album).filter(Boolean))) as string[];
  /* Albums a photo can be filed to: the standard set plus every name this job
     already uses. Video and From Files are system groupings, not destinations. */
  const albumOptions=[...ALBUMS, ...albums.filter(a=>!ALBUMS.includes(a)&&a!==VIDEO_ALBUM&&a!==FILES_ALBUM).sort((a,b)=>a.localeCompare(b))];
  const issueCount=photos.filter(isIssuePhoto).length;
  const geoCount=photos.filter((p:any)=>!!photoGeo(p)).length;
  const videoCount=photos.filter(isVideo).length;
  const lastPhoto=photos.reduce<any>((m,p)=>(p.taken_at&&(!m||p.taken_at>m.taken_at)?p:m),null);
  const uploaderList=uploadersOf(photos);

  /* Every filter but the album: the Albums view counts its tiles from this, so
     a search narrows the albums too. */
  const baseFilter:PhotoFilter={ search, from:dateFrom, to:dateTo, uploader, hasLocation:hasLoc, issuesOnly, thisMonth:periodFilter==='month', now:today };
  const effectiveAlbum = view==='albums' ? (openAlbum||'All') : filterAlbum;
  const filtered=photos.filter((p:any)=>matchesPhotoFilter(p,{...baseFilter, album:effectiveAlbum}));

  // The visible order — what ← / → and the lightbox step through.
  const ordered:any[]=[];
  const months = view==='timeline' ? groupByMonth(filtered).map(m=>({ ...m, days: groupByDay(m.items) })) : [];
  const clusters = view==='map' ? clusterByLocation(filtered) : [];
  const noGeo = view==='map' ? filtered.filter((p:any)=>!photoGeo(p)).length : 0;
  const albumTiles = view==='albums' && !openAlbum
    ? albumSummaries(photos.filter((p:any)=>matchesPhotoFilter(p,baseFilter)), [...ALBUMS, VIDEO_ALBUM, FILES_ALBUM])
    : [];
  if(view==='timeline') for(const m of months) for(const d of m.days) ordered.push(...d.items);
  else if(view==='map') for(const c of clusters) ordered.push(...c.items);
  // Album tiles have no grid; the viewer still steps through what the filters show.
  else ordered.push(...groupByDay(filtered).flatMap(g=>g.items));

  const moreActive=[dateFrom,dateTo,uploader].filter(Boolean).length+(hasLoc?1:0)+(issuesOnly?1:0);
  const filtersActive = !!search || filterAlbum!=='All' || periodFilter!=='all' || moreActive>0;
  const clearFilters = () => { setSearch(''); setFilterAlbum('All'); setPeriodFilter('all'); setDateFrom(''); setDateTo(''); setUploader(''); setHasLoc(false); setIssuesOnly(false); };

  // ← / → step through the visible photos; Esc closes the viewer. Ignored while
  // typing, while the composer is open, and while the crop editor is up.
  const selIndex = selected ? ordered.findIndex(p=>p.id===selected.id) : -1;
  const lightboxItems: LightboxItem[] = lightboxOpen
    ? ordered.map((p:any)=>({
        id:String(p.id), url:p.url||'', kind:isVideo(p)?'video':'image', title:p.title||null,
        poster:p.thumbnail_url||null,
        // The grid already loaded this: the viewer opens on it instantly.
        thumb:isVideo(p)?null:(p.thumbnail_url||null),
        subtitle:[p.taken_at?new Date(p.taken_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'', p.album||'', personName(p.taken_by, people)||''].filter(Boolean).join(' · ')||null,
      }))
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
    if(mode!=='view'||!selected||editingPhoto||lightboxOpen||uploadOpen||markup) return;
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
  },[mode, selected, editingPhoto, stepTo, lightboxOpen, uploadOpen, markup]);

  // ── Stat tiles: each opens the gallery filtered to that slice ──
  // ── Summary: three figures, each filters the gallery. Location lives on the
  //    Map tab's count; the newest photo leads the Timeline. ──
  const stats: StatItem[] = loading
    ? [
        { label:'Photos & Video', value:'—', sub:'Loading…', icon:<Images size={15}/> },
        { label:'This Month', value:'—', sub:'Loading…', icon:<CalendarBlank size={15}/> },
        { label:'Issues', value:'—', sub:'Loading…', icon:<WarningCircle size={15}/> },
      ]
    : [
        { label:'Photos & Video', value:photos.length, icon: videoCount>0 ? <VideoCamera size={15}/> : <Images size={15}/>, sub: filtersActive ? `${filtered.length} showing — tap for all` : lastPhoto ? `Last ${fmtDate(lastPhoto.taken_at)}` : 'Nothing yet', onClick: filtersActive ? clearFilters : undefined },
        { label:'This Month', value:thisMonth, icon:<CalendarBlank size={15}/>, tone: thisMonth>0 ? 'good' : 'default', sub: periodFilter==='month' ? 'Filtered — tap to clear' : 'Since the 1st', onClick: () => setPeriodFilter(p => (p==='month' ? 'all' : 'month')), active: periodFilter==='month' },
        { label:'Issues', value:issueCount, icon:<WarningCircle size={15}/>, tone: issueCount>0 ? 'bad' : 'default', sub: issuesOnly ? 'Filtered — tap to clear' : issueCount>0 ? 'Tap to show' : 'Clean so far', onClick: () => setIssuesOnly(v=>!v), active: issuesOnly },
      ];

  /* ── Select mode ── */
  const byId=(id:string)=>photos.find((p:any)=>String(p.id)===id);
  const pickedRows=[...picked].map(byId).filter(Boolean) as any[];
  const togglePick=(p:any)=>{
    setPicking(true);
    setPicked(prev=>{ const n=new Set(prev); const k=String(p.id); if(n.has(k)) n.delete(k); else n.add(k); return n; });
  };
  const endPicking=()=>{ setPicking(false); setPicked(new Set()); setTargetAlbum(null); };
  const allVisiblePicked=ordered.length>0&&ordered.every((p:any)=>picked.has(String(p.id)));
  const pickAllVisible=()=>setPicked(allVisiblePicked?new Set():new Set(ordered.map((p:any)=>String(p.id))));
  // Escape leaves select mode (when no viewer / dialog is on top).
  useEffect(()=>{
    if(!picking||lightboxOpen||markup||albumDlg||sendTargets) return;
    const onKey=(e:KeyboardEvent)=>{ if(e.key==='Escape'){ e.preventDefault(); endPicking(); } };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[picking,lightboxOpen,markup,albumDlg,sendTargets]);

  /** Photos rows this screen may re-file (library images and videos are not photos rows). */
  const fileable=(p:any)=>!isFromFiles(p)&&!isVideo(p);
  /** What the job-move API takes for a row; null for a read-only library image. */
  const moveItemOf=(p:any):MoveItem|null=>isVideo(p)&&p.file_id?{kind:'file',id:String(p.file_id)}:isFromFiles(p)?null:{kind:'photo',id:String(p.id)};

  async function bulkDownload(){
    const rows=pickedRows.filter(p=>p.url);
    if(!rows.length) return;
    setBulkBusy('download');
    try{
      const r=await saveMediaMany(rows.map(p=>({url:p.url,title:p.title,kind:isVideo(p)?'video':'image'})),(d,t)=>setBulkBusy(`download:${d}/${t}`));
      if(r.result==='cancelled'&&!r.failed) return;
      showToast(r.failed?`${r.saved} saved, ${r.failed} couldn't be downloaded.`:`${r.saved} saved.`, r.failed?'bad':undefined);
    }catch(e){ console.error('[photos] bulk download',e); showToast("Couldn't save those — check your connection.",'bad'); }
    finally{ setBulkBusy(''); }
  }

  /** Re-file photos into an album (PUT /api/photos/[id] { album }), four at a time. */
  async function fileInto(rows:any[], album:string):Promise<{ok:number;bad:number}>{
    const h=await getAuthHeaders();
    let ok=0,bad=0;
    for(let i=0;i<rows.length;i+=4){
      const res=await Promise.all(rows.slice(i,i+4).map(p=>fetch(`/api/photos/${p.id}`,{method:'PUT',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({album})}).then(r=>r.ok,()=>false)));
      for(const r of res) r?ok++:bad++;
    }
    return {ok,bad};
  }
  async function moveToAlbum(album:string){
    const rows=pickedRows.filter(fileable);
    const skipped=pickedRows.length-rows.length;
    if(!rows.length){ showToast('Videos and Files & Media images keep their own album.','bad'); return false; }
    setBulkBusy('move');
    try{
      const {ok,bad}=await fileInto(rows,album);
      const tail=[bad?`${bad} didn't save`:'',skipped?`${skipped} skipped (video or Files & Media)`:''].filter(Boolean).join(', ');
      showToast(`${ok} moved to ${album}.${tail?` ${tail}.`:''}`, bad?'bad':undefined);
      await load({silent:true});
      endPicking();
      return true;
    }finally{ setBulkBusy(''); }
  }
  async function bulkDelete(){
    const rows=pickedRows.filter(p=>!isFromFiles(p)||(isVideo(p)&&p.file_id));
    const skipped=pickedRows.length-rows.length;
    if(!rows.length){ showToast('Files & Media images are deleted in Files & Media.','bad'); return; }
    if(!(await confirmDialog({ title:`Delete ${rows.length} item${rows.length===1?'':'s'}?`, message:`This removes ${rows.length===1?'it':'them'} from the job for everyone.${skipped?` ${skipped} Files & Media image${skipped===1?'':'s'} will be left alone.`:''}`, danger:true }))) return;
    setBulkBusy('delete');
    try{
      const h=await getAuthHeaders();
      let ok=0,denied=0,bad=0;
      for(const p of rows){
        const r=await fetch(isVideo(p)&&p.file_id?`/api/files/${p.file_id}`:`/api/photos/${p.id}`,{method:'DELETE',headers:h}).catch(()=>null);
        if(r?.ok) ok++; else if(r?.status===403) denied++; else bad++;
      }
      if(selected&&picked.has(String(selected.id))) closePanel();
      showToast([`${ok} deleted.`, denied?`${denied} need full Documents access.`:'', bad?`${bad} failed.`:''].filter(Boolean).join(' '), denied||bad?'bad':undefined);
      endPicking();
      await load({silent:true});
    }finally{ setBulkBusy(''); }
  }
  function bulkSend(){
    const items=pickedRows.map(moveItemOf).filter(Boolean) as MoveItem[];
    const skipped=pickedRows.length-items.length;
    if(!items.length){ showToast('Files & Media images move from Files & Media.','bad'); return; }
    if(items.length>100){ showToast('Send at most 100 at once — pick fewer.','bad'); return; }
    if(skipped) showToast(`${skipped} Files & Media image${skipped===1?'':'s'} will stay — move ${skipped===1?'it':'them'} from Files & Media.`);
    setSendTargets({items, what: items.length===1?'this item':`${items.length} items`, bulk:true});
  }

  /* ── Albums: an album is the `album` column on each photo, so New and Rename re-file photos ── */
  async function submitAlbumDlg(){
    if(!albumDlg) return;
    setAlbumErr('');
    const name=cleanAlbumName(albumDlg.mode==='move'&&albumDlg.choice!=='__new'?albumDlg.choice:albumDlg.name);
    if(!name){ setAlbumErr('Give the album a name.'); return; }
    if(name===VIDEO_ALBUM||name===FILES_ALBUM){ setAlbumErr(`"${name}" is filled automatically — pick another name.`); return; }
    if(albumDlg.mode==='new'){
      setAlbumDlg(null);
      setTargetAlbum(name); setPicking(true); setPicked(new Set()); setView('timeline'); setOpenAlbum(null);
      showToast(`Pick photos for ${name}, then Add to Album.`);
      return;
    }
    if(albumDlg.mode==='move'){ if(await moveToAlbum(name)) setAlbumDlg(null); return; }
    // rename
    const from=albumDlg.from||'General';
    if(name===from){ setAlbumDlg(null); return; }
    const rows=photos.filter((p:any)=>fileable(p)&&(p.album||'General')===from);
    if(!rows.length){ setAlbumErr('Nothing in this album can be renamed here.'); return; }
    setBulkBusy('rename');
    try{
      const {ok,bad}=await fileInto(rows,name);
      showToast(bad?`${ok} renamed, ${bad} didn't save — try again.`:`Renamed to ${name}.`, bad?'bad':undefined);
      setAlbumDlg(null);
      await load({silent:true});
      setOpenAlbum(name);
    }finally{ setBulkBusy(''); }
  }

  /* ── Markup: the marked-up image is a NEW photo; the original is never touched ── */
  const markupSaved=useRef<any>(null);
  async function saveMarkup(photo:any, blob:Blob):Promise<boolean>{
    try{
      const h=await getAuthHeaders();
      const base=(photo.title||'Photo').replace(/ \(marked up\)$/,'');
      const album=photo.album&&photo.album!==FILES_ALBUM&&photo.album!==VIDEO_ALBUM?photo.album:'General';
      const fd=new FormData();
      fd.append('projectId',projectId);
      fd.append('file',blob,`${titleFromFileName(base).replace(/\s+/g,'-').slice(0,60)||'photo'}-marked-up.jpg`);
      fd.append('category',album);
      fd.append('caption',`${base} (marked up)`);
      const g=photoGeo(photo);
      if(g) fd.append('location',`${g.lat},${g.lng}`);
      const up=await fetch('/api/photos/upload',{method:'POST',headers:h,body:fd});
      if(!up.ok) throw await errorFrom(up,"The marked-up photo didn't save. Try again.");
      const newId=(await up.json().catch(()=>null))?.photo?.id;
      if(newId){
        const meta=await fetch(`/api/photos/${newId}`,{method:'PUT',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({
          title:`${base} (marked up)`, description:photo.description||photo.caption||'', album,
          taken_at:photo.taken_at||new Date().toISOString(), tags:photoTags(photo), location:photo.location||'',
        })});
        if(!meta.ok) showToast('Saved, but the title and details did not copy over — edit them on the new photo.','bad');
        else showToast('Saved as a new photo. The original is unchanged.');
      } else showToast('Saved as a new photo. The original is unchanged.');
      const fresh=await load({silent:true});
      markupSaved.current=newId&&fresh?fresh.find((p:any)=>p.id===newId)||null:null;
      return true;
    }catch(e){
      console.error('[photos] markup save',e);
      showToast(humanError(e,"The marked-up photo didn't save. Try again."),'bad');
      return false;
    }
  }
  function startMarkup(photo:any, fromViewer:boolean){
    if(!photo?.url||isVideo(photo)) return;
    if(fromViewer){ setLightboxOpen(false); }
    setMarkup({photo,reopen:fromViewer});
  }
  function closeMarkup(){
    const m=markup;
    const saved=markupSaved.current;
    markupSaved.current=null;
    setMarkup(null);
    // Back to the viewer it came from — on the new marked-up photo once saved.
    if(m?.reopen){ viewPhoto(saved||m.photo); setLightboxFromTap(true); setLightboxOpen(true); }
    else if(saved) viewPhoto(saved);
  }

  // A tap opens the lightbox only; the details card waits for its Details button.
  const detailOpen = !!selected && mode!=='create' && !(lightboxOpen && lightboxFromTap);
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
      selected={!picking&&selected?.id===photo.id&&mode!=='create'}
      picking={picking}
      picked={picked.has(String(photo.id))}
      onPick={()=>togglePick(photo)}
      onClick={()=>picking?togglePick(photo):openPhoto(photo)}
      onInfo={()=>viewPhoto(photo)}
      onEdit={(id,url)=>setEditingPhoto({id,url})}
      onStale={resign}
    />
  );

  /** Timeline: jump straight to a month; the rail marks the month in view. */
  const [monthInView,setMonthInView]=useState('');
  const monthKeys=months.map(m=>m.key).join('|');
  useEffect(()=>{
    if(view!=='timeline'||typeof IntersectionObserver==='undefined') return;
    const els=Array.from(document.querySelectorAll<HTMLElement>('[data-ph-month]'));
    if(!els.length) return;
    const io=new IntersectionObserver((entries)=>{
      const top=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];
      if(top) setMonthInView((top.target as HTMLElement).dataset.phMonth||'');
    },{rootMargin:'-60px 0px -60% 0px'});
    els.forEach(el=>io.observe(el));
    return ()=>io.disconnect();
  },[view,monthKeys]);
  const jumpTo=(key:string)=>{ document.getElementById(`ph-m-${key}`)?.scrollIntoView({behavior:'smooth',block:'start'}); setMonthInView(key); };

  // ── Gallery body: loading / error / empty / no-match / tiles — each distinct ──
  let galleryBody: React.ReactNode;
  if (loading) {
    galleryBody = (
      <div className="phGallery" aria-busy="true">
        <div className="phGrid">
          {Array.from({length:12}).map((_,i)=>(
            <div key={i} className="phTile" aria-hidden style={{cursor:'default',['--ar' as string]:[1.33,0.75,1.5,1.33][i%4]}}>
              <div className="phThumb" data-skel="true" />
              <div className="phCap"><div style={{height:12,width:'70%',borderRadius:4,background:'var(--border-subtle)'}}/></div>
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
        text={retryText(loadError)}
        action={<Button icon={<ArrowClockwise size={15}/>} onClick={()=>load()}>Retry</Button>}
      />
    );
  } else if (photos.length===0) {
    galleryBody = (
      <EmptyState
        icon={<Camera size={22}/>}
        title={waitingItems.length ? 'Nothing uploaded to this job yet' : 'No photos or video yet'}
        action={<Button icon={<Plus size={15} weight="bold"/>} onClick={openUpload}>Add Photos &amp; Video</Button>}
      />
    );
  } else if (view==='albums' && !openAlbum) {
    galleryBody = albumTiles.length===0 ? (
      <EmptyState icon={<FolderOpen size={22}/>} title="No albums match these filters" action={<Button onClick={clearFilters}>Clear Filters</Button>}/>
    ) : (
      <div className="phGallery">
        <div className="phGrid">
          {albumTiles.map(a=>(
            <AlbumTile key={a.name} name={a.name} count={a.count} latest={a.latest} cover={a.cover} onOpen={()=>{ setOpenAlbum(a.name); setPicked(new Set()); }} onStale={resign}/>
          ))}
        </div>
      </div>
    );
  } else if (filtered.length===0) {
    galleryBody = (
      <EmptyState
        icon={<Camera size={22}/>}
        title={view==='albums' ? `Nothing in ${openAlbum} matches` : 'No photos match these filters'}
        action={filtersActive ? <Button onClick={clearFilters}>Clear Filters</Button> : view==='albums' ? <Button onClick={()=>setOpenAlbum(null)}>All Albums</Button> : undefined}
      />
    );
  } else if (view==='map') {
    galleryBody = clusters.length===0 ? (
      <EmptyState icon={<MapPin size={22}/>} title="No GPS on these photos" text={`${noGeo} photo${noGeo===1?'':'s'} without a location stamp. Phone photos are stamped where they were taken.`} primary={{ label: 'Add Photos & Video', onClick: openUpload }} perm={['Documents', 'Edit']}/>
    ) : (
      <div className="phMapWrap">
        <PhotoMap photos={ordered} onOpen={openPhoto} fitKey={`${projectId}:${ordered.length}:${search}:${filterAlbum}:${periodFilter}:${dateFrom}:${dateTo}:${uploader}:${issuesOnly}`}/>
        {noGeo>0 && (
          <div className="phNoGeo"><MapPin size={16}/><span><strong>{noGeo}</strong> photo{noGeo===1?'':'s'} without a location stamp — see Timeline.</span></div>
        )}
        {clusters.map((c,i)=>{
          const ds=c.items.map((p:any)=>p.taken_at).filter(Boolean).sort();
          const span=ds.length?(fmtDate(ds[0])===fmtDate(ds[ds.length-1])?fmtDate(ds[0]):`${fmtDate(ds[0])} – ${fmtDate(ds[ds.length-1])}`):'';
          const f={lat:c.lat,lng:c.lng};
          return (
            <div key={c.key} className="phGeo">
              <div className="phGeoHead">
                <MapPin size={16} weight="fill"/>
                <strong>Spot {i+1}</strong>
                <span>{c.items.length} item{c.items.length===1?'':'s'}</span>
                {span && <span>· {span}</span>}
                <a className="k-link" href={fixMapUrl(f)} target="_blank" rel="noopener noreferrer">{fixLabel(f)} · Open in Maps</a>
              </div>
              <div className="phGrid">{c.items.map(card)}</div>
            </div>
          );
        })}
      </div>
    );
  } else if (view==='albums') {
    galleryBody = (
      <div className="phGallery">
        <div className="phGrid">{ordered.map(card)}</div>
      </div>
    );
  } else {
    galleryBody = (
      <div className="phGallery">
        {months.map(m=>(
          <section key={m.key} id={`ph-m-${m.key}`} data-ph-month={m.key} className="phMonth">
            <div className="phMonthHead">{m.label}<small>{m.items.length}</small></div>
            {/* One dense grid per month (each caption carries its day); a day
                only gets its own header row when it is a big shoot. */}
            {m.days.some(d=>d.items.length>=6) ? m.days.map(d=>(
              <div key={d.key}>
                <div className="phGroupHead"><span>{d.label}</span><small>{d.items.length}</small></div>
                <div className="phGrid">{d.items.map(card)}</div>
              </div>
            )) : <div className="phGrid">{m.items.map(card)}</div>}
          </section>
        ))}
      </div>
    );
  }

  /** The lightbox's details panel: everything about the photo, plus its actions. */
  const lightboxDetails = (it:LightboxItem) => {
    const p=ordered.find((x:any)=>String(x.id)===it.id);
    if(!p) return null;
    const fix=photoGeo(p);
    const ro=isFromFiles(p)&&!isVideo(p);
    const linked:[string,React.ReactNode][]=[];
    if(p.punch_list_item_id) linked.push(['Punch Item', <a key="pl" className="k-link" href={`/app/projects/${projectId}/punch-list`}>Open Punch List</a>]);
    if(p.drawing_sheet_number||p.drawing_sheet_id) linked.push(['Drawing', <a key="dw" className="k-link" href={`/app/projects/${projectId}/drawings`}>{p.drawing_sheet_number?`Sheet ${p.drawing_sheet_number}`:'Open Drawings'}</a>]);
    const tags=photoTags(p);
    return (
      <div className="phPanel">
        <h2>{p.title||'Untitled'}</h2>
        <div className="phBadges">
          <Badge tone={albumBadge(p.album).tone} dot>{albumBadge(p.album).label}</Badge>
          {isIssuePhoto(p) && p.album!=='Issues' && <Badge tone="overdue">Issue</Badge>}
          {ro && <Badge tone="closed">Read-Only</Badge>}
        </div>
        {(p.description||p.caption) && <div className="phProse">{p.description||p.caption}</div>}
        <DetailList items={facts([
          ['Taken', fmtDate(p.taken_at)],
          ['Uploaded By', personName(p.taken_by, people) || ''],
          ['Location', p.location || ''],
          ...(fix ? [['GPS', <a key="gps" className="k-link" href={fixMapUrl(fix)} target="_blank" rel="noopener noreferrer">{fixLabel(fix)}</a>] as [string, React.ReactNode]] : []),
          ...(isVideo(p) && p.duration_seconds ? [['Length', fmtDuration(p.duration_seconds)] as [string,string]] : []),
          ...linked,
          ['Source', isVideo(p) ? 'Video library' : ro ? 'Files & Media' : 'Site Photos'],
        ])}/>
        {tags.length>0 && (
          <div className="phBadges">{tags.map(t=><Badge key={t} tone={t.toLowerCase().includes('issue')?'overdue':'neutral'}>{t}</Badge>)}</div>
        )}
        <div className="phActions">
          {!isVideo(p) && p.url && <Button icon={<Scribble size={16}/>} onClick={()=>startMarkup(p,true)}>Mark Up</Button>}
          {!ro && !isVideo(p) && <Button icon={<PencilSimple size={16}/>} onClick={()=>{ setLightboxOpen(false); setLightboxFromTap(false); openEdit(p); }}>Edit Details</Button>}
          {!ro && !isVideo(p) && p.url && <Button icon={<Crop size={16}/>} onClick={()=>{ setLightboxOpen(false); setLightboxFromTap(false); viewPhoto(p); setEditingPhoto({id:p.id,url:p.url}); }}>Crop / Rotate</Button>}
          {ro && <Button icon={<FolderOpen size={16}/>} href={`/app/projects/${projectId}/files`}>Manage in Files &amp; Media</Button>}
        </div>
      </div>
    );
  };
  const detailWorkspace = detailOpen && (
    <div ref={detailRef} className="phDetailCq" style={{ scrollMarginTop: 84 }}>
      <div className="phDetail">
        <section className="phPane" aria-label={selected.title||'Photo'}>
          <div className="phPaneHead">
            <div>
              <h2>{selected.title||'Untitled'}</h2>
              {(()=>{ const sub=[fmtDate(selected.taken_at)!=='—'?fmtDate(selected.taken_at):null, selected.location].filter(Boolean).join(' · '); return sub ? <p>{sub}</p> : null; })()}
            </div>
            <Button variant="ghost" size="sm" icon={<X size={16}/>} aria-label="Close viewer" title="Close viewer (Esc)" onClick={closePanel}/>
          </div>
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
            <div className="phMuted" style={{fontSize:'var(--fs-sm)'}} title="← → to step, Esc to close">{selIndex+1} of {ordered.length}</div>
          )}

          {selected.description && (
            <div className="phSection">
              <div className="phSectionTitle">Description</div>
              <div className="phProse">{selected.description}</div>
            </div>
          )}

          {Array.isArray(selected.tags)&&selected.tags.length>0&&(
            <div className="phSection">
              <div className="phSectionTitle">Tags</div>
              <div className="phBadges">
                {selected.tags.map((tag:string)=>(
                  <Badge key={tag} tone={tag.toLowerCase().includes('issue')?'overdue':'neutral'}>{tag}</Badge>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="phRail" aria-label="Photo details and actions">
          <div className="phPane">
            <div className="phSection">
              <div className="phBadges">
                <Badge tone={albumBadge(selected.album).tone} dot>{albumBadge(selected.album).label}</Badge>
                {selectedFromFiles && !isVideo(selected) && <Badge tone="closed">Read-Only</Badge>}
              </div>
              {selectedFromFiles && !isVideo(selected) && (
                <Button size="sm" variant="ghost" icon={<FolderOpen size={15}/>} href={`/app/projects/${projectId}/files`} title="This image lives in Files & Media — rename, move or delete it there.">
                  Manage in Files &amp; Media
                </Button>
              )}
            </div>
            <div className="phSection">
              <DetailList items={facts([
                ['Date Taken', fmtDate(selected.taken_at)],
                ['Location', selected.location || ''],
                ...((f => f ? [['GPS Location', <a key="gps" className="k-link" href={fixMapUrl(f)} target="_blank" rel="noopener noreferrer">{fixLabel(f)}</a>] as [string, React.ReactNode]] : [])(readFix(selected.location_lat, selected.location_lng))),
                ['Taken By', personName(selected.taken_by, people) || ''],
                ['Album', selected.album || 'General'],
                ...(isVideo(selected) && selected.duration_seconds ? [['Length', fmtDuration(selected.duration_seconds)] as [string,string]] : []),
                ['Source', isVideo(selected) ? 'Video library' : selectedFromFiles ? 'Files & Media' : 'Site Photos'],
              ])}/>
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
                {!isVideo(selected) && selected.url && (
                  <Button icon={<Scribble size={16}/>} onClick={()=>startMarkup(selected,false)} title="Draw on a copy — the original stays as it is">
                    Mark Up (Saves a Copy)
                  </Button>
                )}
                <div className="phActionsRow">
                  {selected.url && (
                    <Button icon={isVideo(selected)?<Play size={16}/>:<ArrowsOut size={16}/>} onClick={()=>setLightboxOpen(true)}>
                      {isVideo(selected)?'Play Full Screen':'Full Screen & Zoom'}
                    </Button>
                  )}
                  {(!selectedFromFiles || isVideo(selected)) && (
                    <Button icon={<PaperPlaneTilt size={16}/>} onClick={()=>setSendOpen(true)}>
                      Send to Another Job
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
          </div>
          {!selectedFromFiles && isSavedId(selected.id) && (
            <div className="phRelated">
              <RelatedItems key={String(selected.id)} type="photo" id={String(selected.id)} projectId={projectId}/>
            </div>
          )}
        </aside>
      </div>
    </div>
  );

  const composerOpen = mode==='create'||mode==='edit';

  return(
    <div className="phWs" data-tile={tile} onDragEnter={onPageDragEnter}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {selected && (
        <SendToJobDialog
          open={sendOpen}
          fromProjectId={projectId}
          what={isVideo(selected) ? 'this video' : 'this photo'}
          items={[selectedFromFiles ? { kind:'file', id:String(selected.file_id) } : { kind:'photo', id:String(selected.id) }]}
          onClose={()=>setSendOpen(false)}
          onSent={(name)=>{ setSendOpen(false); closePanel(); showToast(`Sent to ${name}.`); softReload(); }}
        />
      )}
      {sendTargets && (
        <SendToJobDialog
          open
          fromProjectId={projectId}
          what={sendTargets.what}
          items={sendTargets.items}
          onClose={()=>setSendTargets(null)}
          onSent={(name)=>{ const n=sendTargets.items.length; setSendTargets(null); endPicking(); if(selected&&sendTargets.items.some(i=>i.id===String(selected.id)||i.id===String(selected.file_id))) closePanel(); showToast(`${n} sent to ${name}.`); softReload(); }}
        />
      )}
      {markup && (
        <PhotoMarkup
          src={markup.photo.url}
          title={`Mark up — ${markup.photo.title||'Photo'}`}
          onClose={closeMarkup}
          onSave={(blob)=>saveMarkup(markup.photo,blob)}
        />
      )}

      <MediaUploadPanel
        open={uploadOpen}
        onClose={()=>setUploadOpen(false)}
        title="Add Photos & Video"
        subtitle={projectName ? <>Filed to <strong style={{color:'var(--text-secondary)'}}>{projectName}</strong>.</> : undefined}
        items={queue.items}
        onFiles={addFiles}
        onRetry={queue.retry}
        onRemove={queue.remove}
        hint="Photos any size · videos up to 500 MB"
        extra={queue.items.length===0 && (
          <Button variant="ghost" size="sm" className="phLinkAlt" icon={<LinkSimple size={15}/>} onClick={()=>{ setUploadOpen(false); openCreate(); }}>
            Add a photo by URL
          </Button>
        )}
      >
        <Field label="Album for these photos" hint="Videos go to the Video album.">
          <Select value={uploadAlbum} onChange={e=>setUploadAlbum(e.target.value)} options={albumOptions}/>
        </Field>
      </MediaUploadPanel>

      {lightboxOpen && selected && ordered.length>0 && (
        <ZoomLightbox
          items={lightboxItems}
          index={Math.max(0, selIndex)}
          onIndex={(i)=>{ const next=ordered[i]; if(next) viewPhoto(next); }}
          details={lightboxDetails}
          actions={(it)=>{
            const p=ordered.find((x:any)=>String(x.id)===it.id);
            return p&&!isVideo(p)&&p.url ? (
              <button type="button" className="zlBtn" aria-label="Mark up this photo" title="Mark up (saves a new photo)" onClick={()=>startMarkup(p,true)}>
                <Scribble size={19}/><span className="zlHideSm">Mark Up</span>
              </button>
            ) : null;
          }}
          onClose={()=>{ setLightboxOpen(false); if(lightboxFromTap){ setLightboxFromTap(false); closePanel(); } }}
          onInfo={()=>{ setLightboxOpen(false); setLightboxFromTap(false); }}
          onMediaError={()=>load({silent:true})}
          onDelete={(it)=>{ const p=ordered.find((x:any)=>String(x.id)===it.id); return p?deletePhoto(p,true):false; }}
          onSend={(it)=>{
            const p=ordered.find((x:any)=>String(x.id)===it.id);
            if(!p) return;
            if(isFromFiles(p)&&!isVideo(p)){ showToast('This image lives in Files & Media — move it there.','bad'); return; }
            viewPhoto(p); setLightboxOpen(false); setLightboxFromTap(false); setSendOpen(true);
          }}
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
              if (!r.ok) throw await apiErrorFrom(r, 'delete failed');
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
          { label: projectName || 'Project', href:`/app/projects/${projectId}/overview` },
          { label:'Photos' },
        ]}
        title="Site Photos & Video"
        /* Always name the job on screen — never a bare "Photos" that leaves a GC
           guessing which project they are filing into. */
        subtitle={projectName}
        actions={
          <>
            {queue.busy && !uploadOpen && (
              <Button onClick={()=>setUploadOpen(true)} aria-label="Show uploads">
                Uploading {queue.counts.done} of {queue.counts.total - queue.counts.failed}
                <span className="phUpBar" aria-hidden><b style={{width:`${Math.round(queue.overall*100)}%`}}/></span>
              </Button>
            )}
            <Button variant="primary" icon={<Plus size={15} weight="bold"/>} onClick={openUpload}>
              Add Photos &amp; Video
            </Button>
          </>
        }
      >
        {!loadError && <StatRow items={stats}/>}
        <OnThisPhone items={waitingItems} online={net.online} syncing={net.syncing} onRetry={retryWaiting} onRemove={removeWaiting}/>

        <SubInbox projectId={projectId} focus={inboxFocus} onChanged={()=>load({silent:true})} onToast={(m,t)=>showToast(m,t)}/>

        {!loading && !loadError && photos.length>0 && (
          <>
            <div className="phViews">
              <Tabs
                value={view}
                onChange={k=>{ setView(k as 'timeline'|'albums'|'map'); setOpenAlbum(null); }}
                tabs={[
                  { key:'timeline', label:'Timeline' },
                  { key:'albums', label:'Albums', count: albumSummaries(photos).length },
                  { key:'map', label:'Map', count: geoCount },
                ]}
              />
              <span className="phSpacer"/>
              {!(view==='albums'&&!openAlbum) && (
                <div className="phSeg" role="radiogroup" aria-label="Photo size">
                  {TILE_SIZES.map(t=>(
                    <button key={t} type="button" role="radio" aria-checked={tile===t} aria-label={TILE_LABEL[t]} title={TILE_LABEL[t]} onClick={()=>chooseTile(t)}>
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
              {picking
                ? <Button variant="ghost" size="sm" icon={<X size={15}/>} onClick={endPicking}>Done Selecting</Button>
                : <Button size="sm" icon={<CheckSquare size={15}/>} onClick={()=>setPicking(true)}>Select</Button>}
            </div>
            <Toolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search title, description, tag, person…"
              filters={
                <>
                  {view!=='albums' && (
                    <Select
                      aria-label="Album"
                      value={filterAlbum}
                      onChange={e=>setFilterAlbum(e.target.value)}
                      style={{ width:'auto', minWidth:150 }}
                      options={[{ value:'All', label:'All Albums' }, ...albumOptions, ...(albums.includes(VIDEO_ALBUM)?[VIDEO_ALBUM]:[]), ...(albums.includes(FILES_ALBUM)?[FILES_ALBUM]:[])]}
                    />
                  )}
                  <Button size="sm" className="phToggle" aria-pressed={showMore||moreActive>0} icon={<Funnel size={15}/>} onClick={()=>setShowMore(v=>!v)}>
                    {moreActive>0?`Filters · ${moreActive}`:'Filters'}
                  </Button>
                  {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
                </>
              }
              actions={<span className="phMuted" style={{ fontSize:'var(--fs-sm)' }}>{view==='albums'&&!openAlbum?`${albumTiles.length} albums`:`${filtered.length} of ${photos.length}`}</span>}
            />
            {showMore && (
              <div className="phMore">
                <label>From<DateInput value={dateFrom} max={dateTo||undefined} onChange={e=>setDateFrom(e.target.value)} aria-label="From date"/></label>
                <label>To<DateInput value={dateTo} min={dateFrom||undefined} onChange={e=>setDateTo(e.target.value)} aria-label="To date"/></label>
                {uploaderList.length>0 && (
                  <label>Uploaded By
                    <Select value={uploader} onChange={e=>setUploader(e.target.value)} options={[{value:'',label:'Anyone'}, ...uploaderList]} aria-label="Uploaded by"/>
                  </label>
                )}
                <Button size="sm" className="phToggle" aria-pressed={hasLoc} icon={<MapPin size={15}/>} onClick={()=>setHasLoc(v=>!v)}>Has Location</Button>
              </div>
            )}
            {view==='timeline' && months.length>1 && (
              <nav className="phJump" aria-label="Jump to month">
                {months.map(m=>(
                  <button key={m.key} type="button" className="phChip" aria-current={monthInView===m.key?'true':undefined} onClick={()=>jumpTo(m.key)}>
                    {m.label}<small>{m.items.length}</small>
                  </button>
                ))}
              </nav>
            )}
            {view==='albums' && (
              <div className="phViews">
                {openAlbum ? (
                  <>
                    <Button variant="ghost" size="sm" icon={<CaretLeft size={15}/>} onClick={()=>{ setOpenAlbum(null); setPicked(new Set()); }}>All Albums</Button>
                    <Badge tone={albumBadge(openAlbum).tone}>{openAlbum}</Badge>
                    <span className="phSpacer"/>
                    {openAlbum!==VIDEO_ALBUM && openAlbum!==FILES_ALBUM && (
                      <Button size="sm" icon={<PencilLine size={15}/>} onClick={()=>{ setAlbumErr(''); setAlbumDlg({mode:'rename',from:openAlbum,name:openAlbum,choice:''}); }}>Rename Album</Button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="phSpacer"/>
                    <Button size="sm" icon={<FolderSimplePlus size={15}/>} onClick={()=>{ setAlbumErr(''); setAlbumDlg({mode:'new',name:'',choice:''}); }}>New Album</Button>
                  </>
                )}
              </div>
            )}
          </>
        )}

        <div className="phCq">
          <div className="phSplit" data-open={detailOpen&&!picking?'true':'false'}>
            <div className="phList">
              {galleryBody}
              {picking && (
                <div className="phBulk" role="toolbar" aria-label="Selected items">
                  <strong>{picked.size} selected{targetAlbum?` for ${targetAlbum}`:''}</strong>
                  <Button size="sm" icon={allVisiblePicked?<Square size={15}/>:<CheckCircle size={15}/>} onClick={pickAllVisible} disabled={!ordered.length||(view==='albums'&&!openAlbum)}>{allVisiblePicked?'Select None':'Select All'}</Button>
                  {targetAlbum ? (
                    <Button variant="primary" size="sm" icon={<FolderSimplePlus size={15}/>} disabled={!picked.size||!!bulkBusy} onClick={()=>moveToAlbum(targetAlbum)}>
                      {bulkBusy==='move'?'Adding…':`Add to ${targetAlbum}`}
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" icon={<DownloadSimple size={15}/>} disabled={!picked.size||!!bulkBusy} onClick={bulkDownload}>
                        {bulkBusy.startsWith('download')?`Saving ${bulkBusy.split(':')[1]||''}…`:'Download'}
                      </Button>
                      <Button size="sm" icon={<FolderOpen size={15}/>} disabled={!picked.size||!!bulkBusy} onClick={()=>{ setAlbumErr(''); setAlbumDlg({mode:'move',name:'',choice:albumOptions[0]}); }}>Move to Album</Button>
                      <Button size="sm" icon={<PaperPlaneTilt size={15}/>} disabled={!picked.size||!!bulkBusy} onClick={bulkSend}>Send to Job</Button>
                      <Button variant="danger" size="sm" icon={<Trash size={15}/>} disabled={!picked.size||!!bulkBusy} onClick={bulkDelete}>{bulkBusy==='delete'?'Deleting…':'Delete'}</Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={endPicking}>Cancel</Button>
                </div>
              )}
            </div>
            {!picking && detailWorkspace}
          </div>
        </div>
      </PageShell>

      <FormModal
        open={!!albumDlg}
        onClose={()=>{ if(!bulkBusy) setAlbumDlg(null); }}
        size="sm"
        title={albumDlg?.mode==='rename' ? 'Rename Album' : albumDlg?.mode==='move' ? `Move ${picked.size} to Album` : 'New Album'}
        onSubmit={submitAlbumDlg}
        submitLabel={albumDlg?.mode==='rename' ? 'Rename' : albumDlg?.mode==='move' ? 'Move' : 'Pick Photos'}
        busy={!!bulkBusy}
        error={albumErr||null}
      >
        {albumDlg?.mode==='move' && (
          <Field label="Album">
            <Select value={albumDlg.choice} onChange={e=>setAlbumDlg(d=>d&&({...d,choice:e.target.value}))} options={[...albumOptions, {value:'__new',label:'New album…'}]}/>
          </Field>
        )}
        {(albumDlg?.mode!=='move' || albumDlg?.choice==='__new') && (
          <Field label="Album name" hint={albumDlg?.mode==='rename' ? `Every photo in ${albumDlg.from} moves to the new name.` : undefined}>
            <Input autoFocus value={albumDlg?.name||''} maxLength={60} onChange={e=>setAlbumDlg(d=>d&&({...d,name:e.target.value}))} placeholder="e.g. Level 2 Framing"/>
          </Field>
        )}
      </FormModal>

      {/* ── Composer: add / edit ─────────────────────────────────── */}
      <FormModal
        open={composerOpen}
        onClose={closeComposer}
        title={mode==='create' ? 'Add Photo' : 'Edit Photo'}
        subtitle={projectName ? `Filed to ${projectName}.` : undefined}
        onSubmit={async()=>{ await save(); }}
        submitLabel={mode==='create'?'Add Photo':'Save Changes'}
        busy={saving}
        error={formError||null}
      >
        {/* ── The photo itself. A real file, not a URL a GC has to hand-type. ── */}
        <Field
          label={mode==='create'?'Photo':'Replace Photo'}
          required={mode==='create'}
          hint={mode==='create' ? undefined : 'Leave empty to keep the current image.'}
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
          <Field label="Album" hint={mode==='create'&&auto.album ? 'Matched your current album filter.' : undefined}>
            <Select value={form.album} onChange={e=>setForm(f=>({...f,album:e.target.value}))} options={albumOptions.includes(form.album)?albumOptions:[...albumOptions,form.album]}/>
          </Field>
          <Field label="Date Taken" hint={mode==='create'&&auto.date ? 'Defaulted to today.' : undefined}>
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

/** Each picture's own shape (width / height), remembered for the session so a
 *  re-render or a re-signed link never makes the grid jump. Very wide or tall
 *  shots are held to 0.5–2.4 so a row stays readable; the image is still drawn
 *  whole (contain) inside that shape. */
const RATIO=new Map<string,number>();
const clampRatio=(r:number)=>Math.min(2.4,Math.max(0.5,r));
function knownRatio(key:string, item:any):number{
  const hit=RATIO.get(key);
  if(hit) return hit;
  const w=Number(item?.width), h=Number(item?.height);
  return w>0&&h>0 ? clampRatio(w/h) : isVideo(item) ? 16/9 : 4/3;
}
function useRatio(key:string, item:any){
  const [ar,setAr]=useState(()=>knownRatio(key,item));
  const onLoad=(e:React.SyntheticEvent<HTMLImageElement>)=>{
    const {naturalWidth:w,naturalHeight:h}=e.currentTarget;
    if(!w||!h) return;
    const r=clampRatio(w/h);
    RATIO.set(key,r);
    if(Math.abs(r-ar)>0.01) setAr(r);
  };
  return {ar, onLoad, style:{['--ar' as string]:ar.toFixed(4)} as React.CSSProperties};
}

function PhotoCard({photo,selected,picking=false,picked=false,onPick,onClick,onInfo,onEdit,onStale}:{
  photo:any;selected:boolean;picking?:boolean;picked?:boolean;onPick?:()=>void;onClick:()=>void;onInfo?:()=>void;onEdit?:(id:string,url:string)=>void;onStale?:()=>void;
}){
  /* Long-press (a finger held ~half a second) selects, like the iPhone Photos
     app; the click that follows the press is swallowed. */
  const press=useRef<{t:number;x:number;y:number}|null>(null);
  const longPressed=useRef(false);
  const cancelPress=()=>{ if(press.current){ window.clearTimeout(press.current.t); press.current=null; } };
  const onPointerDown=(e:React.PointerEvent)=>{
    if(e.pointerType==='mouse'||!onPick) return;
    longPressed.current=false;
    cancelPress();
    const t=window.setTimeout(()=>{ press.current=null; longPressed.current=true; onPick(); try{ navigator.vibrate?.(15); }catch(err){ console.debug('[photos] vibrate', err); } },480);
    press.current={t,x:e.clientX,y:e.clientY};
  };
  const onPointerMove=(e:React.PointerEvent)=>{
    const p=press.current;
    if(p&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>10) cancelPress();
  };
  useEffect(()=>cancelPress,[]);
  const click=()=>{ if(longPressed.current){ longPressed.current=false; return; } onClick(); };
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
  const shape=useRatio(String(photo.id),photo);
  const people=usePeople([photo.taken_by]);
  const badge=albumBadge(photo.album);
  const when=photo.taken_at&&!isNaN(new Date(photo.taken_at).getTime())
    ? new Date(photo.taken_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
  const more=[photo.location, personName(photo.taken_by, people)].filter(Boolean).join(' · ');
  return(
    <div className="phTile" data-sel={selected?'true':undefined} data-picking={picking?'true':undefined} data-picked={picked?'true':undefined} role="button" tabIndex={0}
      onClick={click}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={cancelPress} onPointerCancel={cancelPress}
      onContextMenu={e=>{ if(press.current||longPressed.current) e.preventDefault(); }}
      onKeyDown={e=>{ if(e.target!==e.currentTarget) return; if(e.key==='Enter'||e.key===' '){ e.preventDefault(); onClick(); } }}
      aria-label={picking?`${picked?'Deselect':'Select'} ${photo.title||'photo'}`:`Open ${photo.title||'photo'}`}
      aria-pressed={picking?picked:selected}
      style={shape.style}
      title={[photo.title||'Untitled', when, more].filter(Boolean).join(' · ')}>
      <div className="phThumb" data-missing={missing?'true':undefined}>
        {!missing ? (
          /* Grid tiles render the ~400px thumbnail; the full original is for the
             viewer only (see THUMBNAIL CONTRACT in /api/photos/list). */
          isVideo(photo) && !photo.thumbnail_url
            ? <span style={{display:'flex',alignItems:'center',justifyContent:'center',width:'100%',height:'100%',color:'var(--text-tertiary)'}}><Play size={28} weight="fill"/></span>
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={src} alt={photo.title||'Photo'} loading="lazy" decoding="async" onLoad={shape.onLoad} onError={onImgError}/>
        ) : (
          <span><Images size={18}/> No image</span>
        )}
        {isVideo(photo) && !missing && photo.thumbnail_url && <div className="phPlay"><span><Play size={16} weight="fill"/></span></div>}
        {onPick && (
          <button type="button" className="phCheck" aria-label={`${picked?'Deselect':'Select'} ${photo.title||'photo'}`} aria-pressed={picked}
            onClick={(e)=>{ e.stopPropagation(); onPick(); }}>
            {picked ? <CheckSquare size={20} weight="fill"/> : <Square size={20}/>}
          </button>
        )}
        {(onInfo || (photo.url && onEdit && !isFromFiles(photo))) && (
          <div className="phTileTools">
            {onInfo && (
              <Button size="sm" variant="ghost" icon={<Info size={14}/>} aria-label={`Details for ${photo.title||'photo'}`} title="Details"
                onClick={(e)=>{e.stopPropagation();onInfo();}}/>
            )}
            {photo.url && onEdit && !isFromFiles(photo) && (
              <Button size="sm" variant="ghost" icon={<Crop size={14}/>} aria-label={`Edit, crop or rotate ${photo.title||'photo'}`} title="Edit / Crop / Rotate"
                onClick={(e)=>{e.stopPropagation();onEdit(photo.id,photo.url);}}/>
            )}
          </div>
        )}
      </div>
      {/* Words sit under the picture, never over it. */}
      <div className="phCap">
        <div className="phCapTitle">{photo.title||'Untitled'}</div>
        <div className="phCapMeta">
          {badge.tone!=='neutral' ? <Badge tone={badge.tone}>{badge.label}</Badge> : <span>{badge.label}</span>}
          {when && <span>· {when}</span>}
          {isVideo(photo) && photo.duration_seconds ? <span>· {fmtDuration(photo.duration_seconds)}</span> : null}
        </div>
        {more && <div className="phCapMore">{more}</div>}
      </div>
    </div>
  );
}

/** An album: its newest picture as the cover (whole, never cropped), the name and count under it. */
function AlbumTile({name,count,latest,cover,onOpen,onStale}:{
  name:string;count:number;latest:Date|null;cover:any|null;onOpen:()=>void;onStale?:()=>void;
}){
  const src=cover?(cover.thumbnail_url||(isVideo(cover)?null:cover.url)):null;
  const [missing,setMissing]=useState(!src);
  const retried=useRef(false);
  useEffect(()=>{ retried.current=false; setMissing(!src); },[src]);
  const shape=useRatio(cover?String(cover.id):`album:${name}`,cover);
  const badge=albumBadge(name);
  return(
    <button type="button" className="phTile" style={shape.style} onClick={onOpen} aria-label={`Open album ${name}, ${count} item${count===1?'':'s'}`}>
      <div className="phThumb" data-missing={missing?'true':undefined}>
        {!missing && src
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src} alt="" loading="lazy" decoding="async" onLoad={shape.onLoad} onError={()=>{ if(!retried.current&&onStale){ retried.current=true; onStale(); return; } setMissing(true); }}/>
          : <span>{name===VIDEO_ALBUM?<VideoCamera size={18}/>:<FolderOpen size={18}/>} {count} item{count===1?'':'s'}</span>}
      </div>
      <div className="phCap">
        <div className="phCapTitle">{badge.tone!=='neutral'?<Badge tone={badge.tone}>{name}</Badge>:name}</div>
        <div className="phCapMeta"><span>{count} item{count===1?'':'s'}</span>{latest && <span>· {latest.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>}</div>
      </div>
    </button>
  );
}
