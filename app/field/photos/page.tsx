'use client';
/**
 * Saguaro Field — Photos
 * Fixed response parsing. Camera capture + gallery with category filter. Offline queue.
 */
import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0f1d2b';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const RED    = '#EF4444';

const CATEGORIES = ['All', 'Progress', 'Issue', 'Delivery', 'Inspection', 'Safety', 'Completion', 'Other'];
const CAT_COLORS: Record<string, string> = {
  Progress: '#3B82F6', Issue: RED, Delivery: '#F59E0B',
  Inspection: '#8B5CF6', Safety: RED, Completion: '#22C55E', Other: DIM,
};

interface Photo { id: string; url: string; filename: string; category: string; caption: string; uploaded: boolean; created_at: string; }

function PhotosPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [filterCat, setFilterCat] = useState('All');
  const [selected, setSelected] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [online, setOnline] = useState(true);
  const [loadingGallery, setLoadingGallery] = useState(true);

  // Pending
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState('');
  const [pendingCat, setPendingCat] = useState('Progress');
  const [pendingCaption, setPendingCaption] = useState('');

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Load gallery from GET /api/photos
  useEffect(() => {
    if (!projectId) { setLoadingGallery(false); return; }
    fetch(`/api/photos?projectId=${projectId}`)
      .then((r) => r.ok ? r.json() : { photos: [] })
      .then((d) => {
        const list: Photo[] = (d.photos || []).map((p: Record<string, unknown>) => ({
          id: String(p.id || ''),
          url: String(p.url || ''),          // FIXED: .url not .file_url
          filename: String(p.filename || ''),
          category: String(p.category || 'Progress'),
          caption: String(p.caption || ''),
          uploaded: true,
          created_at: String(p.created_at || new Date().toISOString()),
        }));
        setPhotos(list);
      })
      .catch(() => {})
      .finally(() => setLoadingGallery(false));
  }, [projectId]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPendingPreview(String(ev.target?.result || ''));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const cancelPending = () => {
    setPendingFile(null);
    setPendingPreview('');
    setPendingCaption('');
    setPendingCat('Progress');
  };

  const uploadPhoto = useCallback(async () => {
    if (!pendingFile) return;
    setUploading(true);

    const localPhoto: Photo = {
      id: `local-${Date.now()}`,
      url: pendingPreview,
      filename: pendingFile.name,
      category: pendingCat,
      caption: pendingCaption,
      uploaded: false,
      created_at: new Date().toISOString(),
    };

    try {
      if (!online) throw new Error('offline');
      const fd = new FormData();
      fd.append('file', pendingFile, pendingFile.name);
      fd.append('category', pendingCat);
      fd.append('caption', pendingCaption);
      if (projectId) fd.append('projectId', projectId);

      const res = await fetch('/api/photos/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();

      // FIXED: API returns photo.url not photo.file_url
      const savedPhoto: Photo = {
        id: String(data.photo?.id || Date.now()),
        url: String(data.photo?.url || pendingPreview),
        filename: String(data.photo?.filename || pendingFile.name),
        category: pendingCat,
        caption: pendingCaption,
        uploaded: true,
        created_at: String(data.photo?.created_at || new Date().toISOString()),
      };
      setPhotos((prev) => [savedPhoto, ...prev]);
    } catch {
      // Queue for offline sync
      const base64 = pendingPreview.split(',')[1] || '';
      await enqueue({
        url: '/api/photos/upload',
        method: 'POST',
        body: null,
        contentType: '',
        isFormData: true,
        formDataEntries: [
          { name: 'file', value: base64, filename: pendingFile.name, type: pendingFile.type },
          { name: 'category', value: pendingCat },
          { name: 'caption', value: pendingCaption },
          ...(projectId ? [{ name: 'projectId', value: projectId }] : []),
        ],
      });
      setPhotos((prev) => [localPhoto, ...prev]);
    }

    cancelPending();
    setUploading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFile, pendingPreview, pendingCat, pendingCaption, projectId, online]);

  const filteredPhotos = filterCat === 'All' ? photos : photos.filter((p) => p.category === filterCat);

  return (
    <div style={{ padding: '18px 16px' }}>
      {/* Header */}
      <button onClick={() => router.back()} style={backBtn}>← Back</button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Photos</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: DIM }}>{photos.length} photo{photos.length !== 1 ? 's' : ''} on this project</p>
        </div>
        {!online && <span style={{ fontSize: 12, color: RED, fontWeight: 700 }}>Offline</span>}
      </div>

      {/* Capture button */}
      {!pendingPreview && (
        <>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFilePick} style={{ display: 'none' }} />
          <button
            onClick={() => fileRef.current?.click()}
            style={{ width: '100%', background: RAISED, border: `2px dashed rgba(212,160,23,.5)`, borderRadius: 14, padding: '22px', color: GOLD, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}
          >
            <span style={{ fontSize: 32 }}>📸</span>
            Take or Upload a Photo
          </button>
        </>
      )}

      {/* Preview + form */}
      {pendingPreview && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingPreview} alt="Preview" style={{ width: '100%', maxHeight: 280, objectFit: 'cover' }} />
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Category chips */}
            <div>
              <label style={lbl}>Category</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPendingCat(c)}
                    style={{ background: pendingCat === c ? `rgba(${hexRgb(CAT_COLORS[c])}, .2)` : 'transparent', border: `1px solid ${pendingCat === c ? CAT_COLORS[c] : BORDER}`, borderRadius: 20, padding: '5px 12px', color: pendingCat === c ? CAT_COLORS[c] : DIM, fontSize: 13, fontWeight: pendingCat === c ? 700 : 400, cursor: 'pointer' }}
                  >{c}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Caption</label>
              <input type="text" value={pendingCaption} onChange={(e) => setPendingCaption(e.target.value)} placeholder="Describe what you're capturing..." style={{ ...inp, marginTop: 5 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={cancelPending} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, color: DIM, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
              <button
                type="button"
                onClick={uploadPhoto}
                disabled={uploading}
                style={{ flex: 2, background: uploading ? '#1e3148' : GOLD, border: 'none', borderRadius: 10, padding: 14, color: uploading ? DIM : '#000', fontSize: 15, fontWeight: 800, cursor: uploading ? 'wait' : 'pointer' }}
              >
                {uploading ? 'Uploading...' : online ? 'Upload Photo' : 'Save Offline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category filter */}
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCat(c)}
              style={{ flexShrink: 0, background: filterCat === c ? (c === 'All' ? 'rgba(212,160,23,.2)' : `rgba(${hexRgb(CAT_COLORS[c])}, .2)`) : 'transparent', border: `1px solid ${filterCat === c ? (c === 'All' ? GOLD : CAT_COLORS[c]) : BORDER}`, borderRadius: 20, padding: '5px 12px', color: filterCat === c ? (c === 'All' ? GOLD : CAT_COLORS[c]) : DIM, fontSize: 12, fontWeight: filterCat === c ? 700 : 400, cursor: 'pointer' }}
            >
              {c}
              {c !== 'All' && photos.filter((p) => p.category === c).length > 0 && (
                <span style={{ marginLeft: 4, opacity: 0.7 }}>({photos.filter((p) => p.category === c).length})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Gallery grid */}
      {loadingGallery ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: DIM, fontSize: 14 }}>Loading photos...</div>
      ) : filteredPhotos.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {filteredPhotos.map((p) => (
            <div key={p.id} onClick={() => setSelected(p)} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: `1px solid ${BORDER}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.caption} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              {!p.uploaded && (
                <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(239,68,68,.9)', borderRadius: 4, padding: '1px 5px', fontSize: 9, color: '#fff', fontWeight: 700 }}>PENDING</div>
              )}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(0,0,0,.75))', padding: '10px 5px 4px' }}>
                <div style={{ display: 'inline-block', background: `rgba(${hexRgb(CAT_COLORS[p.category] || DIM)}, .6)`, borderRadius: 3, padding: '1px 5px', fontSize: 9, color: '#fff', fontWeight: 700 }}>{p.category}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !pendingPreview && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: DIM }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
            <p style={{ margin: 0, fontSize: 14 }}>{filterCat === 'All' ? 'No photos yet. Tap above to take the first one.' : `No ${filterCat} photos.`}</p>
          </div>
        )
      )}

      {/* Lightbox */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.96)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selected.url} alt={selected.caption} style={{ maxWidth: '100%', maxHeight: '72vh', borderRadius: 12, objectFit: 'contain' }} />
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <span style={{ background: `rgba(${hexRgb(CAT_COLORS[selected.category] || DIM)}, .25)`, border: `1px solid ${CAT_COLORS[selected.category] || DIM}`, borderRadius: 20, padding: '3px 14px', fontSize: 12, color: CAT_COLORS[selected.category] || DIM, fontWeight: 700 }}>
              {selected.category}
            </span>
            {selected.caption && <p style={{ margin: '8px 0 0', color: TEXT, fontSize: 15 }}>{selected.caption}</p>}
            <p style={{ margin: '6px 0 0', color: DIM, fontSize: 12 }}>
              {new Date(selected.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · Tap to close
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FieldPhotosPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8fa3c0', textAlign: 'center' }}>Loading...</div>}><PhotosPage /></Suspense>;
}

const lbl: React.CSSProperties = { fontSize: 12, color: '#8fa3c0', fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', background: '#09111A', border: '1px solid #1e3148', borderRadius: 10, padding: '11px 14px', color: '#e8edf8', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8fa3c0', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
