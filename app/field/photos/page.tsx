'use client';
/**
 * Saguaro Control Systems -- Photo Capture + Gallery (field)
 *
 * WHAT WAS BROKEN (all verified against the live API routes):
 *  1. UPLOAD POSTED MULTIPART TO A JSON-ONLY ROUTE. This page built a FormData and
 *     POSTed it to /api/photos/create, which does `await req.json()`. Parsing a
 *     multipart body as JSON throws, the route's bare catch turns it into a 500,
 *     and the photo is gone. EVERY web upload from this screen failed. The real
 *     multipart endpoint -- the one that writes to storage AND inserts the row --
 *     is /api/photos/upload.
 *  2. WRONG FIELD NAME. The page sent `project_id`; /api/photos/upload reads
 *     `projectId` and 400s "projectId is required" without it.
 *  3. GALLERY QUERY PARAM WRONG. The page asked for
 *     /api/photos/list?project_id=... but that route reads `projectId`. With the
 *     param dropped the route returns EVERY photo in the tenant, from EVERY
 *     project -- which is exactly why photos looked like they landed on the wrong
 *     job. They didn't; the gallery was never filtered.
 *  4. WRONG COLUMNS ON READ. Rows carry `taken_at` / `taken_by` / `category` /
 *     `location_lat,location_lng`; the page read `created_at` / `uploaded_by` /
 *     `phase` / `location`, so dates rendered as Invalid Date and grouped under a
 *     NaN key.
 *  5. NO PROJECT, NO WAY OUT. projectId came only from ?projectId=, and every link
 *     into this screen (/field, bottom nav, QR, search, saved views) omits it. The
 *     shell injects it asynchronously; until it lands -- or forever, if the list
 *     call fails -- the gallery fetched nothing and an upload would post an empty
 *     project. There was no indication of which project was active and no way to
 *     change it from here.
 *  6. SILENT FAILURES. `catch { }` on the gallery load; takePhoto() returning null
 *     on a denied camera permission did literally nothing; the offline queue
 *     replayed to the same JSON-only route and dead-lettered every queued photo.
 *
 * THE STANDARD ENFORCED HERE: the project you are working in is always visible,
 * always switchable in one tap from this screen, and every write is addressed to
 * the project captured at the moment you pressed the button.
 */
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { humanError } from '@/lib/errors';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import { takePhoto, getCurrentPosition, hapticSuccess, hapticLight, hapticError, isNative } from '@/lib/native';
import OfflineSyncStatus from '@/components/field/OfflineSyncStatus';
import VoiceToLog from '@/components/field/VoiceToLog';
import PhotoEditor from '@/components/field/PhotoEditor';
import { PencilSimple, Trash } from '@phosphor-icons/react';
import FieldPageHeader from '../FieldPageHeader';
import { scopedFieldIcon } from '../field-icons';

const GOLD   = '#F59E0B';
const DARK   = '#0a0a0a';
const RAISED = '#141416';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM    = '#CBD5E1';
const TEXT   = '#FFFFFF';
const GREEN  = '#22c55e';
const RED    = '#ef4444';

const PHASES = ['Pre-Construction', 'Foundation', 'Framing', 'Rough-In', 'Finishes', 'Punch', 'Closeout', 'Other'];

/** Same key the /field shell uses, so a pick here follows you across the app. */
const ACTIVE_PROJECT_KEY = 'sag_active_project';

/* ─── Interfaces ─── */
interface Photo {
  id: string;
  /** Full-size original: 1-3.6 MB, 12 megapixels. Viewer and editor only. */
  url: string;
  /** ~400px, 12-24 KB. What the GRID must render — see normalizePhoto. */
  thumbUrl: string;
  caption: string;
  location: string;
  phase: string;
  /** Normalized capture timestamp: taken_at, else created_at. '' when unknown. */
  takenAt: string;
  takenBy: string;
}

interface ProjectOption {
  id: string;
  name: string;
  project_number?: string | null;
  address?: string | null;
  status?: string | null;
}

interface GroupedPhotos {
  key: string;
  label: string;
  photos: Photo[];
}

type FormDataEntry = { name: string; value: string; filename?: string; type?: string };

/* ─── Row normalization ───
 * The `photos` table is written by several producers (web upload, mobile, the
 * JSON create route) and each used slightly different column names over time.
 * Read every known spelling so nothing renders as "Invalid Date" or a blank tile.
 */
function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function asNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function normalizePhoto(raw: unknown): Photo {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lat = asNumber(r.location_lat ?? r.latitude);
  const lng = asNumber(r.location_lng ?? r.longitude);
  const locText =
    asString(r.location) ||
    (lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '');
  return {
    id: asString(r.id) || String(r.id ?? ''),
    url: asString(r.url) || asString(r.thumbnail_url),
    /* The grid MUST take the thumbnail first. /api/photos/list states the
       contract outright: url is a 1-3.6 MB 12-megapixel JPEG, thumbnail_url is
       ~400px and 12-24 KB, and "a grid MUST render thumbnail_url and fall back
       to url only when it is [null]". This field had the precedence inverted,
       so every tile downloaded and decoded a full 12MP original — a dozen
       photos froze the renderer outright. Reproduced on the live site: the
       gallery requested .../photos/<ts>-sonoran.png, the original, and the tab
       stopped responding twice.
       thumbnail_url is null on rows the backfill could not process (legacy
       .heic), hence the fallback — null means "no thumbnail exists", not "not
       signed yet". */
    thumbUrl: asString(r.thumbnail_url) || asString(r.url),
    caption: asString(r.caption) || asString(r.title) || asString(r.description),
    location: locText,
    phase: asString(r.category) || asString(r.album) || asString(r.phase),
    takenAt: asString(r.taken_at) || asString(r.created_at) || asString(r.uploaded_at),
    takenBy: asString(r.taken_by) || asString(r.uploaded_by),
  };
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read the photo file.'));
    reader.readAsDataURL(file);
  });
}

/* ─── Inner component ─── */
function PhotosInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  /* ── Project scope ──
   * A pick made on this screen wins over whatever the shell injected into the URL,
   * so switching projects here takes effect immediately and stays put. */
  const urlProjectId = params.get('projectId') || '';
  const [pickedProjectId, setPickedProjectId] = useState('');
  const projectId = pickedProjectId || urlProjectId;

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [fallbackName, setFallbackName] = useState('');

  const activeProject = projects.find(p => p.id === projectId) || null;
  const projectName = activeProject?.name || fallbackName;

  const [toast, setToast] = useState('');

  /* Capture state */
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [capturedPreview, setCapturedPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [gpsLocation, setGpsLocation] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [phase, setPhase] = useState('');
  const [uploading, setUploading] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  /* Gallery state */
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState('');
  const [viewingPhoto, setViewingPhoto] = useState<Photo | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);

  /* ── Adopt a project: state + localStorage + URL, all in one move ── */
  const adoptProject = useCallback((id: string) => {
    if (!id) return;
    setPickedProjectId(id);
    try { localStorage.setItem(ACTIVE_PROJECT_KEY, id); } catch { /* private mode */ }
    setPickerOpen(false);
    setPickerSearch('');
    try {
      const sp = new URLSearchParams(window.location.search);
      sp.set('projectId', id);
      router.replace(`${pathname}?${sp.toString()}`);
    } catch { /* URL sync is a convenience, not a requirement */ }
  }, [pathname, router]);

  /* ── Load the project list — this screen owns its own picker, it never sends
   *    the user somewhere else to choose. ──
   * `restore` is only true on the first load: if the URL carried no project, fall
   * back to the one this device last worked in. It never silently guesses a
   * project that was never chosen — with nothing stored, the picker shows. */
  const loadProjects = useCallback(async (restore: boolean) => {
    setProjectsLoading(true);
    try {
      const r = await fetch('/api/projects/list');
      if (!r.ok) throw new Error("Couldn't load your projects.");
      const d = await r.json();
      const list = (Array.isArray(d) ? d : (d?.projects ?? d?.data ?? [])) as ProjectOption[];
      setProjects(list);
      setProjectsError('');
      if (restore && list.length > 0) {
        let stored = '';
        try { stored = localStorage.getItem(ACTIVE_PROJECT_KEY) || ''; } catch { stored = ''; }
        if (stored && list.some(p => p.id === stored)) adoptProject(stored);
      }
    } catch (err: unknown) {
      console.error(err);
      setProjectsError(humanError(err, "Couldn't load your projects. Check your connection and retry."));
    } finally {
      setProjectsLoading(false);
    }
  }, [adoptProject]);

  useEffect(() => {
    // Restore only when neither the URL nor a pick on this screen names a project.
    loadProjects(!urlProjectId && !pickedProjectId);
    // Runs once on mount: the picker list doesn't change with the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Name fallback for a project that isn't in the list (archived, direct link) ── */
  useEffect(() => {
    if (!projectId || activeProject) { setFallbackName(''); return; }
    let alive = true;
    fetch(`/api/projects/${projectId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d?.name) setFallbackName(String(d.name)); })
      .catch(() => { /* the id still scopes every write correctly */ });
    return () => { alive = false; };
  }, [projectId, activeProject]);

  /* ── Toast ── */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Fetch gallery — ALWAYS scoped. Never call the list route without the
   *    projectId param: unfiltered it returns every photo in the tenant. ── */
  const fetchPhotos = useCallback(async (pid: string) => {
    if (!pid) { setPhotos([]); setGalleryError(''); return; }
    setGalleryLoading(true);
    try {
      const res = await fetch(`/api/photos/list?projectId=${encodeURIComponent(pid)}`);
      if (!res.ok) throw new Error("Couldn't load photos for this project.");
      const data = await res.json();
      const rows = (Array.isArray(data) ? data : (data?.photos ?? data?.items ?? [])) as unknown[];
      setPhotos(rows.map(normalizePhoto));
      setGalleryError('');
    } catch (err: unknown) {
      console.error(err);
      setPhotos([]);
      setGalleryError(humanError(err, "Couldn't load photos for this project."));
    } finally {
      setGalleryLoading(false);
    }
  }, []);

  useEffect(() => { fetchPhotos(projectId); }, [fetchPhotos, projectId]);

  /* ── GPS auto-fill ── */
  const fillGPS = useCallback(async () => {
    try {
      const pos = await getCurrentPosition();
      if (pos) {
        setLatitude(pos.lat);
        setLongitude(pos.lng);
        setGpsLocation(`${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
      }
    } catch { /* GPS is optional; the photo still saves */ }
  }, []);

  /* ── Photo capture ── */
  const acceptFile = (file: File) => {
    setCaptureError('');
    setCapturedFile(file);
    fileToDataUrl(file)
      .then(setCapturedPreview)
      .catch((err: unknown) => {
        console.error(err);
        setCapturedPreview('');
        setCaptureError(humanError(err, "That file couldn't be read. Try taking the photo again."));
      });
    fillGPS();
  };

  const openCamera = async () => {
    setCaptureError('');
    if (isNative()) {
      const result = await takePhoto({ source: 'camera', quality: 85 });
      if (!result) {
        // takePhoto() returns null on a denied permission or a cancel — say so
        // instead of letting the button look dead.
        setCaptureError('No photo came back from the camera. If you cancelled, tap again; otherwise allow camera access for Saguaro in Settings.');
        hapticError();
        return;
      }
      setCapturedFile(result.file);
      setCapturedPreview(result.dataUrl);
      hapticLight();
      fillGPS();
      return;
    }
    cameraRef.current?.click();
  };

  const openLibrary = async () => {
    setCaptureError('');
    if (isNative()) {
      const result = await takePhoto({ source: 'photos', quality: 85 });
      if (!result) {
        setCaptureError('No photo was chosen. If you cancelled, tap again; otherwise allow photo access for Saguaro in Settings.');
        return;
      }
      setCapturedFile(result.file);
      setCapturedPreview(result.dataUrl);
      hapticLight();
      fillGPS();
      return;
    }
    libraryRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    acceptFile(file);
  };

  const clearCapture = () => {
    setCapturedFile(null);
    setCapturedPreview('');
    setCaption('');
    setGpsLocation('');
    setLatitude(null);
    setLongitude(null);
    setPhase('');
    setCaptureError('');
  };

  /* ── Offline queue ──
   * Queued as real multipart against /api/photos/upload so the replay hits the
   * same endpoint the online path does. (The old queue posted JSON with a
   * `photo_data` key to a route that understands neither — every queued photo
   * retried five times and dead-lettered.) */
  const queueOffline = async (targetId: string, targetName: string) => {
    if (!capturedFile) return;
    try {
      const dataUrl = await fileToDataUrl(capturedFile);
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      if (!base64) throw new Error("The photo file couldn't be read for offline storage.");

      const entries: FormDataEntry[] = [
        { name: 'projectId', value: targetId },
        { name: 'category', value: phase || 'Progress' },
      ];
      if (caption.trim()) entries.push({ name: 'caption', value: caption.trim() });
      if (latitude !== null && longitude !== null) {
        entries.push({ name: 'location', value: `${latitude},${longitude}` });
      }
      entries.push({
        name: 'file',
        value: base64,
        filename: capturedFile.name || `photo-${Date.now()}.jpg`,
        type: capturedFile.type || 'image/jpeg',
      });

      await enqueue({
        url: '/api/photos/upload',
        method: 'POST',
        body: null,
        contentType: '',
        isFormData: true,
        formDataEntries: entries,
      });
      setToast(`Saved offline — uploads to ${targetName || 'this project'} when you reconnect`);
      hapticLight();
      clearCapture();
    } catch (err: unknown) {
      console.error(err);
      setCaptureError(humanError(err, "Couldn't save the photo offline. Free up storage and try again."));
      setToast('Error: photo not saved');
      hapticError();
    }
  };

  /* ── Upload ──
   * The target project is captured BEFORE the first await. If the shell or another
   * tab switches the active project mid-upload, this photo still lands on the job
   * that was on screen when the button was pressed. */
  const handleUpload = async () => {
    if (!capturedFile) return;

    const targetId = projectId;
    const targetName = projectName;
    if (!targetId) {
      setCaptureError('Pick the project this photo belongs to before uploading.');
      setPickerOpen(true);
      hapticError();
      return;
    }

    setCaptureError('');
    setUploading(true);

    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!online) {
      await queueOffline(targetId, targetName);
      setUploading(false);
      return;
    }

    try {
      const fd = new FormData();
      // camelCase — /api/photos/upload reads `projectId` and 400s without it.
      fd.append('projectId', targetId);
      fd.append('file', capturedFile, capturedFile.name || `photo-${Date.now()}.jpg`);
      if (caption.trim()) fd.append('caption', caption.trim());
      fd.append('category', phase || 'Progress');
      if (latitude !== null && longitude !== null) {
        fd.append('location', `${latitude},${longitude}`);
      }

      const res = await fetch('/api/photos/upload', { method: 'POST', body: fd });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        // Every failure is visible. Nothing is swallowed.
        const msg = humanError(payload, "The photo didn't upload. Try again.");
        setCaptureError(msg);
        setToast(`Error: ${msg}`);
        hapticError();
        return;
      }

      clearCapture();
      // Refetch before the success message so the tile is on screen the moment
      // the toast appears — and so what's shown is the signed URL, not the raw
      // private-bucket path the create response returns.
      await fetchPhotos(targetId);
      setToast(`Photo saved to ${targetName || 'this project'}`);
      hapticSuccess();
    } catch (err: unknown) {
      // A thrown fetch is a real network failure — queue it rather than lose it.
      console.error(err);
      await queueOffline(targetId, targetName);
    } finally {
      setUploading(false);
    }
  };

  /* ── Delete ── */
  const removePhoto = async (photoId: string) => {
    if (!photoId) return;
    try {
      const r = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' });
      if (!r.ok) {
        const payload = await r.json().catch(() => null);
        throw new Error(humanError(payload, "Couldn't delete that photo."));
      }
      setViewingPhoto(null);
      setPhotos(prev => prev.filter(p => p.id !== photoId));
      setToast('Photo deleted');
      await fetchPhotos(projectId);
    } catch (err: unknown) {
      console.error(err);
      setToast(`Error: ${humanError(err, "Couldn't delete that photo.")}`);
      hapticError();
    }
  };

  const confirmDeletePhoto = async (photoId: string) => {
    if (!confirm('Delete this photo permanently?')) return;
    await removePhoto(photoId);
  };

  /* ── Voice caption ── */
  const handleVoice = (text: string) => {
    setCaption(prev => (prev ? `${prev} ${text}` : text));
  };

  /* ── Group photos by capture date ── */
  const grouped: GroupedPhotos[] = React.useMemo(() => {
    const groups: Record<string, Photo[]> = {};
    const labels: Record<string, string> = {};
    const sorted = [...photos].sort((a, b) => {
      const at = a.takenAt ? new Date(a.takenAt).getTime() : 0;
      const bt = b.takenAt ? new Date(b.takenAt).getTime() : 0;
      return (Number.isNaN(bt) ? 0 : bt) - (Number.isNaN(at) ? 0 : at);
    });
    for (const p of sorted) {
      const d = p.takenAt ? new Date(p.takenAt) : null;
      const valid = !!d && !Number.isNaN(d.getTime());
      const key = valid
        ? `${d!.getFullYear()}-${String(d!.getMonth() + 1).padStart(2, '0')}-${String(d!.getDate()).padStart(2, '0')}`
        : 'zz-undated';
      if (!groups[key]) {
        groups[key] = [];
        labels[key] = valid
          ? d!.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          : 'Date not recorded';
      }
      groups[key].push(p);
    }
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(key => ({ key, label: labels[key], photos: groups[key] }));
  }, [photos]);

  /* ─── Shared styles ─── */
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    background: DARK,
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    color: TEXT,
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10.5,
    fontWeight: 700,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
    display: 'block',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%238fa3c0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    paddingRight: 36,
  };

  const errorNoteStyle: React.CSSProperties = {
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: 10,
    padding: '10px 12px',
    color: '#fecaca',
    fontSize: 13,
    lineHeight: 1.45,
  };

  const filteredProjects = projects.filter(p => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.project_number || '').toLowerCase().includes(q) ||
      (p.address || '').toLowerCase().includes(q)
    );
  });

  /* ─── Project list rows, shared by the inline picker and the sheet ─── */
  const projectRows = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {projects.length > 6 && (
        <input
          type="text"
          value={pickerSearch}
          onChange={e => setPickerSearch(e.target.value)}
          placeholder="Search projects..."
          style={{ ...inputStyle, marginBottom: 4 }}
        />
      )}
      {filteredProjects.map(p => {
        const isActive = p.id === projectId;
        return (
          <button
            key={p.id}
            onClick={() => adoptProject(p.id)}
            style={{
              width: '100%', textAlign: 'left', cursor: 'pointer',
              background: isActive ? 'rgba(245,158,11,0.12)' : RAISED,
              border: `1px solid ${isActive ? 'rgba(245,158,11,0.45)' : BORDER}`,
              borderRadius: 10, padding: '12px 14px', color: TEXT,
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: isActive ? GOLD : 'rgba(255,255,255,0.18)',
            }} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{
                display: 'block', fontSize: 14.5, fontWeight: isActive ? 800 : 600,
                color: isActive ? GOLD : TEXT,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {p.name || 'Untitled project'}
              </span>
              {(p.project_number || p.address) && (
                <span style={{
                  display: 'block', fontSize: 11.5, color: DIM, marginTop: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {[p.project_number, p.address].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            {isActive && <span style={{ fontSize: 10.5, fontWeight: 800, color: GOLD, letterSpacing: 0.6 }}>ACTIVE</span>}
          </button>
        );
      })}
      {!projectsLoading && projects.length === 0 && !projectsError && (
        <div style={{ color: DIM, fontSize: 13, padding: '8px 2px', lineHeight: 1.5 }}>
          No projects on this account yet. Create one from the Projects list, then come back — photos always attach to a project.
        </div>
      )}
    </div>
  );

  const captureDisabled = !projectId;

  /* ─── Render ─── */
  return (
    <div style={{ minHeight: '100dvh', background: DARK, color: TEXT, fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 100 }}>
      {/* Header */}
      <FieldPageHeader
        title="Photos"
        subtitle={projectName || (projectsLoading ? 'Loading project...' : 'No project selected')}
        backHref="/field"
        icon={scopedFieldIcon('photos', 'ph')}
      />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          background: toast.startsWith('Error') ? RED : GREEN, color: '#fff',
          padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)', maxWidth: 'calc(100vw - 32px)', textAlign: 'center',
        }}>
          {toast}
        </div>
      )}

      {/* ═══ PROJECT BAR — always visible, always switchable ═══ */}
      <div style={{ padding: '0 16px' }}>
        {projectId ? (
          <button
            onClick={() => setPickerOpen(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
              background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12,
              padding: '11px 14px', color: TEXT, textAlign: 'left',
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: GOLD, flexShrink: 0 }} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.9 }}>
                Working in
              </span>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {projectName || 'Loading project...'}
              </span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 800, color: GOLD, flexShrink: 0 }}>
              {pickerOpen ? 'Close' : 'Change'}
            </span>
          </button>
        ) : (
          /* No project yet — the picker IS the state. Never a dead end that tells
             the user to go somewhere else. */
          <div style={{
            background: RAISED, border: '1px solid rgba(245,158,11,0.35)', borderRadius: 12, padding: 14,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: GOLD }}>Pick the project for these photos</div>
              <div style={{ fontSize: 13, color: DIM, marginTop: 3, lineHeight: 1.45 }}>
                Every photo attaches to a project. Choose one here and start shooting.
              </div>
            </div>
            {projectsLoading && <div style={{ color: DIM, fontSize: 13 }}>Loading your projects...</div>}
            {projectsError && (
              <div style={errorNoteStyle}>
                {projectsError}
                <button
                  onClick={() => loadProjects(true)}
                  style={{ marginLeft: 10, background: 'transparent', border: 'none', color: GOLD, fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: 0 }}
                >
                  Retry
                </button>
              </div>
            )}
            {!projectsLoading && !projectsError && projectRows}
          </div>
        )}
      </div>

      {/* ═══ PROJECT PICKER SHEET (when a project is already active) ═══ */}
      {pickerOpen && projectId && (
        <div style={{ padding: '10px 16px 0' }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 12 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Switch project</div>
            {projectsLoading && <div style={{ color: DIM, fontSize: 13 }}>Loading your projects...</div>}
            {projectsError && (
              <div style={errorNoteStyle}>
                {projectsError}
                <button
                  onClick={() => loadProjects(false)}
                  style={{ marginLeft: 10, background: 'transparent', border: 'none', color: GOLD, fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: 0 }}
                >
                  Retry
                </button>
              </div>
            )}
            {!projectsLoading && !projectsError && projectRows}
          </div>
        </div>
      )}

      {/* ═══ TAKE PHOTO ═══ */}
      <div style={{ padding: '16px 16px 0' }}>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: 'none' }} />
        <input ref={libraryRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />

        {!capturedPreview ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={openCamera}
              disabled={captureDisabled}
              title={captureDisabled ? 'Pick a project first' : undefined}
              style={{
                width: '100%', padding: '18px 0', borderRadius: 14, border: 'none',
                background: captureDisabled ? BORDER : 'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))',
                color: captureDisabled ? DIM : '#241500', fontSize: 17, fontWeight: 800,
                cursor: captureDisabled ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: captureDisabled ? 'none' : '0 4px 14px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Take Photo
            </button>

            <button
              onClick={openLibrary}
              disabled={captureDisabled}
              title={captureDisabled ? 'Pick a project first' : undefined}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12,
                background: 'transparent', border: `1px solid ${captureDisabled ? BORDER : 'rgba(245,158,11,0.4)'}`,
                color: captureDisabled ? DIM : GOLD, fontSize: 14.5, fontWeight: 700,
                cursor: captureDisabled ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
              Choose from Library
            </button>

            {captureDisabled && (
              <div style={{ fontSize: 12.5, color: DIM, textAlign: 'center', lineHeight: 1.45 }}>
                Pick a project above — that&apos;s the job these photos will be filed under.
              </div>
            )}
            {captureError && <div style={errorNoteStyle}>{captureError}</div>}
          </div>
        ) : (
          /* ═══ CAPTURE FORM ═══ */
          <div style={{
            background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
            padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            {/* Destination — restated at the moment of saving, so nobody files to
                the wrong job without seeing it. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 10, padding: '9px 12px',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: GOLD, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: DIM, minWidth: 0 }}>
                Filing to{' '}
                <strong style={{ color: GOLD, fontWeight: 800 }}>{projectName || 'the selected project'}</strong>
              </span>
              <button
                onClick={() => setPickerOpen(true)}
                style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: GOLD, fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 0, flexShrink: 0 }}
              >
                Change
              </button>
            </div>

            {/* Preview */}
            <div style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={capturedPreview} alt="Captured" style={{
                width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 10,
                border: `1px solid ${BORDER}`,
              }} />
              <button onClick={clearCapture} aria-label="Discard photo" style={{
                position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', fontSize: 14,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>X</button>
            </div>

            {/* Caption */}
            <div>
              <label style={labelStyle}>Caption</label>
              <input type="text" value={caption} onChange={e => setCaption(e.target.value)} placeholder="Describe this photo..." style={inputStyle} />
            </div>

            {/* Voice caption */}
            <VoiceToLog onTranscript={handleVoice} />

            {/* GPS Location */}
            <div>
              <label style={labelStyle}>Location (GPS)</label>
              <input type="text" value={gpsLocation} readOnly placeholder="Auto-detected from GPS" style={{ ...inputStyle, color: DIM }} />
            </div>

            {/* Phase / Area */}
            <div>
              <label style={labelStyle}>Phase / Area (optional)</label>
              <select value={phase} onChange={e => setPhase(e.target.value)} style={selectStyle}>
                <option value="">Select phase...</option>
                {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {captureError && <div style={errorNoteStyle}>{captureError}</div>}

            {/* Upload */}
            <button
              onClick={handleUpload}
              disabled={uploading}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
                background: uploading ? BORDER : 'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))',
                color: uploading ? DIM : '#241500',
                boxShadow: uploading ? 'none' : '0 4px 14px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)',
                fontSize: 16, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {uploading ? 'Uploading...' : 'Upload Photo'}
            </button>
          </div>
        )}
      </div>

      {/* ═══ PHOTO GALLERY ═══ */}
      <div style={{ padding: 16 }}>
        {!projectId ? null : galleryLoading ? (
          <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>Loading photos...</div>
        ) : galleryError ? (
          <div style={{ ...errorNoteStyle, textAlign: 'center' }}>
            {galleryError}
            <button
              onClick={() => fetchPhotos(projectId)}
              style={{ marginLeft: 10, background: 'transparent', border: 'none', color: GOLD, fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: 0 }}
            >
              Retry
            </button>
          </div>
        ) : photos.length === 0 ? (
          <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>
            <div style={{ marginBottom: 8 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
            No photos on {projectName || 'this project'} yet. Tap Take Photo above to start the record.
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.key} style={{ marginBottom: 20 }}>
              {/* Date header */}
              <div style={{
                fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 8,
                textTransform: 'uppercase', letterSpacing: 0.8,
                padding: '4px 0', borderBottom: `1px solid ${BORDER}`,
              }}>
                {group.label}
              </div>

              {/* Photo grid (2 columns) */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
              }}>
                {group.photos.map(photo => (
                  <div
                    key={photo.id}
                    className="lift"
                    onClick={() => setViewingPhoto(photo)}
                    style={{
                      position: 'relative', cursor: 'pointer', borderRadius: 10, overflow: 'hidden',
                      border: `1px solid ${BORDER}`, aspectRatio: '1', background: RAISED,
                    }}
                  >
                    {photo.thumbUrl ? (
                      /* thumbUrl, NOT url — this tile is ~120px on screen and
                         url is a 12-megapixel original. Full size is loaded
                         only when the viewer or editor opens. */
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={photo.thumbUrl}
                        alt={photo.caption || 'Photo'}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div style={{
                        width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', color: DIM, fontSize: 11, textAlign: 'center', padding: 8,
                      }}>
                        Image file missing
                      </div>
                    )}
                    {photo.caption && (
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                        padding: '16px 8px 6px', fontSize: 11, color: '#fff',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {photo.caption}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ═══ FULL-SIZE VIEWER ═══ */}
      {viewingPhoto && (
        <div
          onClick={() => setViewingPhoto(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          {/* Close button */}
          <button onClick={() => setViewingPhoto(null)} aria-label="Close" style={{
            position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none', fontSize: 18,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
          }}>X</button>

          {/* Photo */}
          {viewingPhoto.url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={viewingPhoto.url}
              alt={viewingPhoto.caption || 'Photo'}
              onClick={e => e.stopPropagation()}
              style={{
                maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8,
              }}
            />
          ) : (
            <div onClick={e => e.stopPropagation()} style={{ color: DIM, fontSize: 14, padding: 24, textAlign: 'center' }}>
              This record has no image file attached.
            </div>
          )}

          {/* Caption overlay */}
          <div onClick={e => e.stopPropagation()} style={{
            marginTop: 16, textAlign: 'center', maxWidth: '90%',
          }}>
            {viewingPhoto.caption && (
              <div style={{ fontSize: 16, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
                {viewingPhoto.caption}
              </div>
            )}
            <div style={{ fontSize: 13, color: DIM }}>
              {viewingPhoto.takenAt && !Number.isNaN(new Date(viewingPhoto.takenAt).getTime())
                ? new Date(viewingPhoto.takenAt).toLocaleString()
                : 'Date not recorded'}
              {viewingPhoto.location && ` | ${viewingPhoto.location}`}
              {viewingPhoto.phase && ` | ${viewingPhoto.phase}`}
            </div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>
              {projectName ? `On ${projectName}` : ''}
              {viewingPhoto.takenBy ? `${projectName ? ' · ' : ''}By ${viewingPhoto.takenBy}` : ''}
            </div>
            {/* Edit + Delete buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'center' }}>
              <button
                onClick={e => { e.stopPropagation(); setEditingPhoto(viewingPhoto); setViewingPhoto(null); }}
                disabled={!viewingPhoto.url}
                style={{ padding: '8px 20px', background: 'rgba(245, 158, 11,.2)', border: '1px solid rgba(245, 158, 11,.4)', borderRadius: 8, color: GOLD, fontSize: 13, fontWeight: 700, cursor: viewingPhoto.url ? 'pointer' : 'not-allowed', opacity: viewingPhoto.url ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <PencilSimple size={14} weight="bold" /> Edit
              </button>
              <button
                onClick={e => { e.stopPropagation(); confirmDeletePhoto(viewingPhoto.id); }}
                style={{ padding: '8px 20px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, color: RED, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Trash size={14} weight="bold" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Editor overlay */}
      {editingPhoto && (
        <PhotoEditor
          src={editingPhoto.url}
          photoId={editingPhoto.id}
          onSave={async (blob, id) => {
            const photoId = id || editingPhoto.id;
            if (!photoId) {
              setToast('Error: this photo has no id to save against');
              return;
            }
            try {
              const fd = new FormData();
              fd.append('file', blob, 'edited-photo.jpg');
              // The multipart edit endpoint — it re-uploads into the SAME project the
              // row already belongs to, so an edit can never move a photo to another job.
              const r = await fetch(`/api/photos/${photoId}/upload`, { method: 'POST', body: fd });
              if (!r.ok) {
                const payload = await r.json().catch(() => null);
                throw new Error(humanError(payload, "Couldn't save your edits."));
              }
              setEditingPhoto(null);
              setToast('Photo updated');
              await fetchPhotos(projectId);
            } catch (err: unknown) {
              console.error(err);
              setToast(`Error: ${humanError(err, "Couldn't save your edits.")}`);
            }
          }}
          onDelete={async (id) => {
            const photoId = id || editingPhoto.id;
            setEditingPhoto(null);
            // The editor already asked; don't double-confirm.
            await removePhoto(photoId);
          }}
          onClose={() => setEditingPhoto(null)}
        />
      )}

      {/* Offline sync */}
      <OfflineSyncStatus />
    </div>
  );
}

/* ─── Page wrapper with Suspense ─── */
export default function FieldPhotosPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#CBD5E1' }}>Loading...</div>}>
      <PhotosInner />
    </Suspense>
  );
}
