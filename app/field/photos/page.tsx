'use client';
/**
 * Saguaro Field -- Photo Capture + Gallery
 * Mobile-first photo capture, upload, and gallery for field use.
 */
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import { takePhoto, getCurrentPosition, hapticSuccess, hapticLight, hapticError, isNative } from '@/lib/native';
import OfflineSyncStatus from '@/components/field/OfflineSyncStatus';
import VoiceToLog from '@/components/field/VoiceToLog';
import PhotoEditor from '@/components/field/PhotoEditor';

const GOLD   = '#C8960F';
const DARK = '#0D1117';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#111827';
const GREEN  = '#22c55e';
const RED    = '#ef4444';

const PHASES = ['Pre-Construction', 'Foundation', 'Framing', 'Rough-In', 'Finishes', 'Punch', 'Closeout', 'Other'];

/* ─── Interfaces ─── */
interface Photo {
  id: string;
  url: string;
  caption?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  phase?: string;
  created_at: string;
  uploaded_by?: string;
}

interface GroupedPhotos {
  date: string;
  label: string;
  photos: Photo[];
}

/* ─── Inner component ─── */
function PhotosInner() {
  const params = useSearchParams();
  const router = useRouter();
  const projectId = params.get('projectId') || new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('projectId') || '';

  const [projectName, setProjectName] = useState('');
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
  const fileRef = useRef<HTMLInputElement>(null);

  /* Gallery state */
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<Photo | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);

  /* ── Fetch project name ── */
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.name) setProjectName(d.name); })
      .catch(() => {});
  }, [projectId]);

  /* ── Toast ── */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Fetch gallery ── */
  const fetchPhotos = useCallback(async () => {
    if (!projectId) return;
    setGalleryLoading(true);
    try {
      const res = await fetch(`/api/photos/list?project_id=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setPhotos(Array.isArray(data) ? data : data.photos || data.items || []);
      }
    } catch { /* offline */ }
    setGalleryLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  /* ── GPS auto-fill ── */
  const fillGPS = useCallback(async () => {
    try {
      const pos = await getCurrentPosition();
      if (pos) {
        setLatitude(pos.lat);
        setLongitude(pos.lng);
        setGpsLocation(`${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
      }
    } catch { /* GPS not available */ }
  }, []);

  /* ── Photo capture ── */
  const handleTakePhoto = async () => {
    if (isNative()) {
      const result = await takePhoto({ source: 'camera', quality: 85 });
      if (result) {
        setCapturedFile(result.file);
        setCapturedPreview(result.dataUrl);
        hapticLight();
        fillGPS();
      }
    } else {
      fileRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturedFile(file);
    const reader = new FileReader();
    reader.onload = ev => setCapturedPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    fillGPS();
    e.target.value = '';
  };

  const clearCapture = () => {
    setCapturedFile(null);
    setCapturedPreview('');
    setCaption('');
    setGpsLocation('');
    setLatitude(null);
    setLongitude(null);
    setPhase('');
  };

  /* ── Upload ── */
  const handleUpload = async () => {
    if (!capturedFile) return;
    setUploading(true);

    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (online) {
      try {
        const fd = new FormData();
        fd.append('project_id', projectId);
        fd.append('photo', capturedFile);
        if (caption.trim()) fd.append('caption', caption.trim());
        if (gpsLocation) fd.append('location', gpsLocation);
        if (latitude != null) fd.append('latitude', String(latitude));
        if (longitude != null) fd.append('longitude', String(longitude));
        if (phase) fd.append('phase', phase);

        const res = await fetch('/api/photos/create', { method: 'POST', body: fd });
        if (res.ok) {
          setToast('Photo uploaded');
          hapticSuccess();
          clearCapture();
          fetchPhotos();
        } else {
          const err = await res.text();
          setToast(`Error: ${err}`);
          hapticError();
        }
      } catch {
        await queueOffline();
      }
    } else {
      await queueOffline();
    }
    setUploading(false);
  };

  const queueOffline = async () => {
    try {
      // Convert file to base64 for offline storage
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(capturedFile!);
      });

      await enqueue({
        url: '/api/photos/create',
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          caption: caption.trim() || undefined,
          location: gpsLocation || undefined,
          latitude,
          longitude,
          phase: phase || undefined,
          photo_data: dataUrl,
        }),
        contentType: 'application/json',
        isFormData: false,
      });
      setToast('Saved offline -- will upload when connected');
      hapticLight();
      clearCapture();
    } catch (err: unknown) {
      setToast(`Offline save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      hapticError();
    }
  };

  /* ── Voice caption ── */
  const handleVoice = (text: string) => {
    setCaption(prev => prev ? `${prev} ${text}` : text);
  };

  /* ── Group photos by date ── */
  const grouped: GroupedPhotos[] = React.useMemo(() => {
    const groups: Record<string, Photo[]> = {};
    const sorted = [...photos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    for (const p of sorted) {
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return Object.entries(groups).map(([date, photos]) => ({
      date,
      label: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      photos,
    }));
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
    fontSize: 13,
    fontWeight: 600,
    color: DIM,
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

  /* ─── Render ─── */
  return (
    <div style={{ minHeight: '100dvh', background: DARK, color: TEXT, fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: RAISED, borderBottom: `1px solid ${BORDER}`,
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => router.push('/field')} style={{
          background: 'none', border: 'none', color: GOLD, fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1,
        }} aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>Photos</div>
          {projectName && <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{projectName}</div>}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          background: toast.startsWith('Error') ? RED : GREEN, color: '#fff',
          padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)', whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}

      {/* ═══ TAKE PHOTO BUTTON ═══ */}
      <div style={{ padding: '16px 16px 0' }}>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: 'none' }} />

        {!capturedPreview ? (
          <button onClick={handleTakePhoto} style={{
            width: '100%', padding: '18px 0', borderRadius: 14, border: 'none',
            background: GOLD, color: DARK, fontSize: 17, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: '0 4px 20px rgba(212,160,23,0.3)',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            Take Photo
          </button>
        ) : (
          /* ═══ CAPTURE FORM ═══ */
          <div style={{
            background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
            padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            {/* Preview */}
            <div style={{ position: 'relative' }}>
              <img src={capturedPreview} alt="Captured" style={{
                width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 10,
                border: `1px solid ${BORDER}`,
              }} />
              <button onClick={clearCapture} style={{
                position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: 14,
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

            {/* Upload */}
            <button
              onClick={handleUpload}
              disabled={uploading}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
                background: uploading ? BORDER : GOLD,
                color: uploading ? DIM : DARK,
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
        {galleryLoading ? (
          <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>Loading photos...</div>
        ) : photos.length === 0 ? (
          <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>
            <div style={{ marginBottom: 8 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
            No photos yet. Tap the button above to capture your first photo.
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.date} style={{ marginBottom: 20 }}>
              {/* Date header */}
              <div style={{
                fontSize: 13, fontWeight: 700, color: DIM, marginBottom: 8,
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
                    onClick={() => setViewingPhoto(photo)}
                    style={{
                      position: 'relative', cursor: 'pointer', borderRadius: 10, overflow: 'hidden',
                      border: `1px solid ${BORDER}`, aspectRatio: '1',
                    }}
                  >
                    <img
                      src={photo.url}
                      alt={photo.caption || 'Photo'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      loading="lazy"
                    />
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
          <button onClick={() => setViewingPhoto(null)} style={{
            position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%',
            background: '#D1D5DB', color: '#fff', border: 'none', fontSize: 18,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
          }}>X</button>

          {/* Photo */}
          <img
            src={viewingPhoto.url}
            alt={viewingPhoto.caption || 'Photo'}
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8,
            }}
          />

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
              {new Date(viewingPhoto.created_at).toLocaleString()}
              {viewingPhoto.location && ` | ${viewingPhoto.location}`}
              {viewingPhoto.phase && ` | ${viewingPhoto.phase}`}
            </div>
            {viewingPhoto.uploaded_by && (
              <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>
                By {viewingPhoto.uploaded_by}
              </div>
            )}
            {/* Edit + Delete buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'center' }}>
              <button onClick={(e) => { e.stopPropagation(); setEditingPhoto(viewingPhoto); setViewingPhoto(null); }}
                style={{ padding: '8px 20px', background: 'rgba(212,160,23,.2)', border: '1px solid rgba(212,160,23,.4)', borderRadius: 8, color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                ✏️ Edit
              </button>
              <button onClick={async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this photo permanently?')) return;
                try {
                  await fetch(`/api/photos/${viewingPhoto.id}`, { method: 'DELETE' });
                  setViewingPhoto(null);
                  // Refresh gallery
                  window.location.reload();
                } catch { /* */ }
              }}
                style={{ padding: '8px 20px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, color: RED, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                🗑 Delete
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
            const fd = new FormData();
            fd.append('file', blob, 'edited-photo.jpg');
            if (id) fd.append('photoId', id);
            fd.append('project_id', projectId);
            await fetch(`/api/photos/${id || 'create'}`, { method: id ? 'PUT' : 'POST', body: fd });
            window.location.reload();
          }}
          onDelete={async (id) => {
            if (id) await fetch(`/api/photos/${id}`, { method: 'DELETE' });
            window.location.reload();
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
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#F8F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}>Loading...</div>}>
      <PhotosInner />
    </Suspense>
  );
}
