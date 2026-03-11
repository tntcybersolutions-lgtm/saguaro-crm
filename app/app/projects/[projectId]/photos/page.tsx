'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c';

interface Photo {
  id: string;
  date: string;
  category: string;
  description: string;
  url: string | null;
  preview?: string;
  project_id: string;
}

const CATEGORIES = ['Progress','Issue','Delivery','Inspection','Completion'];
const CATEGORY_COLORS: Record<string, string> = {
  Progress: 'rgba(59,130,246,.6)',
  Issue: 'rgba(239,68,68,.6)',
  Delivery: 'rgba(245,158,11,.6)',
  Inspection: 'rgba(139,92,246,.6)',
  Completion: 'rgba(61,214,140,.6)',
};

const DEMO_PHOTOS: Photo[] = [
  { id: 'ph-1', date: '2026-03-10', category: 'Progress', description: 'Framing Level 2 — east wing', url: null, project_id: '' },
  { id: 'ph-2', date: '2026-03-08', category: 'Progress', description: 'North wall framing complete', url: null, project_id: '' },
  { id: 'ph-3', date: '2026-03-05', category: 'Delivery', description: 'Lumber delivery — 2x6x16', url: null, project_id: '' },
  { id: 'ph-4', date: '2026-02-28', category: 'Inspection', description: 'Framing inspection — passed', url: null, project_id: '' },
  { id: 'ph-5', date: '2026-02-20', category: 'Issue', description: 'Window rough opening needs revision', url: null, project_id: '' },
  { id: 'ph-6', date: '2026-02-10', category: 'Progress', description: 'Foundation complete', url: null, project_id: '' },
];

export default function PhotosPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('All');
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/photos`);
      const json = await res.json();
      setPhotos(json.photos?.length ? json.photos : DEMO_PHOTOS.map(p => ({ ...p, project_id: projectId })));
    } catch {
      setPhotos(DEMO_PHOTOS.map(p => ({ ...p, project_id: projectId })));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  const filtered = filterCategory === 'All' ? photos : photos.filter(p => p.category === filterCategory);

  async function handleFileChange(files: FileList) {
    if (!files.length) return;
    // Show previews immediately
    const previews: Photo[] = [];
    for (let i = 0; i < files.length; i++) {
      const preview = URL.createObjectURL(files[i]);
      previews.push({
        id: `local-${Date.now()}-${i}`,
        date: new Date().toISOString().split('T')[0],
        category: 'Progress',
        description: files[i].name.replace(/\.[^.]+$/, ''),
        url: preview,
        preview,
        project_id: projectId,
      });
    }
    setPhotos(prev => [...previews, ...prev]);

    // Upload
    setUploading(true);
    try {
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) fd.append('photos', files[i]);
      fd.append('projectId', projectId);
      await fetch('/api/photos/upload', { method: 'POST', body: fd });
      setSuccessMsg(`${files.length} photo(s) uploaded.`);
    } catch {
      setSuccessMsg(`${files.length} photo(s) added (demo mode).`);
    } finally {
      setUploading(false);
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  }

  function navLightbox(dir: number) {
    if (lightbox === null) return;
    const next = lightbox + dir;
    if (next >= 0 && next < filtered.length) setLightbox(next);
  }

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Photos</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Site progress photos and documentation</div>
        </div>
        <label style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          {uploading ? 'Uploading...' : '+ Upload Photos'}
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files) handleFileChange(e.target.files); }} />
        </label>
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}

      {/* Category filter */}
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['All', ...CATEGORIES].map(cat => (
          <button key={cat} onClick={() => setFilterCategory(cat)} style={{ padding: '6px 14px', background: filterCategory === cat ? GOLD : RAISED, border: '1px solid ' + (filterCategory === cat ? GOLD : BORDER), borderRadius: 6, color: filterCategory === cat ? DARK : DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{cat}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: DIM, alignSelf: 'center' }}>{filtered.length} photo{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Grid */}
      <div style={{ padding: '16px 24px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {filtered.map((photo, idx) => (
              <div
                key={photo.id}
                onClick={() => setLightbox(idx)}
                style={{ background: RAISED, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: '1px solid ' + BORDER, transition: 'border-color .2s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}
              >
                {/* Thumbnail */}
                {photo.url ? (
                  <img src={photo.url} alt={photo.description} style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: 150, background: `linear-gradient(135deg, ${CATEGORY_COLORS[photo.category] || 'rgba(30,50,70,.8)'}, rgba(30,40,60,.9))`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 32, opacity: 0.5 }}>{photo.category === 'Progress' ? '🏗️' : photo.category === 'Issue' ? '⚠️' : photo.category === 'Delivery' ? '📦' : photo.category === 'Inspection' ? '🔍' : '✅'}</span>
                  </div>
                )}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: CATEGORY_COLORS[photo.category] || 'rgba(143,163,192,.2)', color: TEXT, fontWeight: 700 }}>{photo.category}</span>
                    <span style={{ fontSize: 11, color: DIM }}>{photo.date}</span>
                  </div>
                  <div style={{ fontSize: 12, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{photo.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox !== null && filtered[lightbox] && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 900, width: '90vw', background: RAISED, borderRadius: 12, overflow: 'hidden', border: '1px solid ' + BORDER }}>
            {filtered[lightbox].url ? (
              <img src={filtered[lightbox].url!} alt={filtered[lightbox].description} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block', background: DARK }} />
            ) : (
              <div style={{ width: '100%', height: 400, background: `linear-gradient(135deg, ${CATEGORY_COLORS[filtered[lightbox].category] || 'rgba(30,50,70,.8)'}, rgba(30,40,60,.9))`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 80, opacity: 0.3 }}>{filtered[lightbox].category === 'Progress' ? '🏗️' : filtered[lightbox].category === 'Issue' ? '⚠️' : '📷'}</span>
              </div>
            )}
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{filtered[lightbox].description}</div>
                <div style={{ color: DIM, fontSize: 12, marginTop: 4 }}>{filtered[lightbox].category} · {filtered[lightbox].date}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => navLightbox(-1)} disabled={lightbox === 0} style={{ padding: '7px 14px', background: DARK, border: '1px solid ' + BORDER, borderRadius: 6, color: lightbox === 0 ? BORDER : DIM, cursor: lightbox === 0 ? 'default' : 'pointer' }}>Prev</button>
                <button onClick={() => navLightbox(1)} disabled={lightbox === filtered.length - 1} style={{ padding: '7px 14px', background: DARK, border: '1px solid ' + BORDER, borderRadius: 6, color: lightbox === filtered.length - 1 ? BORDER : DIM, cursor: lightbox === filtered.length - 1 ? 'default' : 'pointer' }}>Next</button>
                {filtered[lightbox].url && <a href={filtered[lightbox].url!} download style={{ padding: '7px 14px', background: 'rgba(212,160,23,.2)', border: '1px solid rgba(212,160,23,.4)', borderRadius: 6, color: GOLD, fontSize: 13, textDecoration: 'none' }}>Download</a>}
                <button onClick={() => setLightbox(null)} style={{ padding: '7px 14px', background: DARK, border: '1px solid ' + BORDER, borderRadius: 6, color: DIM, cursor: 'pointer' }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
