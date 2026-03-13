'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardBody, T } from '@/components/ui/shell';

interface Photo {
  id: string;
  date: string;
  category: string;
  description: string;
  url: string | null;
  preview?: string;
  project_id: string;
}

const CATEGORIES = ['All', 'Progress', 'Issue', 'Delivery', 'Inspection', 'Safety'];

const CATEGORY_BADGE: Record<string, 'blue' | 'red' | 'amber' | 'muted' | 'green' | 'gold'> = {
  Progress: 'blue',
  Issue: 'red',
  Delivery: 'amber',
  Inspection: 'muted',
  Safety: 'green',
};

export default function PhotosPage() {
  const { projectId } = useParams() as { projectId: string };
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
      setPhotos(json.photos || []);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  const filtered = filterCategory === 'All' ? photos : photos.filter(p => p.category === filterCategory);

  async function handleFileChange(files: FileList) {
    if (!files.length) return;
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
    <PageWrap>
      <div style={{ padding: '24px 24px 0' }}>
        <SectionHeader
          title="Photos"
          sub="Site progress photos and documentation"
          action={
            <label style={{ cursor: 'pointer' }}>
              <Btn disabled={uploading}>{uploading ? 'Uploading...' : '+ Upload Photos'}</Btn>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files) handleFileChange(e.target.files); }}
              />
            </label>
          }
        />
      </div>

      {/* Stat Cards */}
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon="📸" label="Total Photos" value={String(photos.length)} />
        <StatCard icon="🏗️" label="Progress" value={String(photos.filter(p => p.category === 'Progress').length)} />
        <StatCard icon="⚠️" label="Issues" value={String(photos.filter(p => p.category === 'Issue').length)} />
        <StatCard icon="🔍" label="Inspections" value={String(photos.filter(p => p.category === 'Inspection').length)} />
      </div>

      {successMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.4)`, borderRadius: 8, color: T.green, fontSize: 13 }}>{successMsg}</div>
      )}

      {/* Category Filter */}
      <div style={{ padding: '0 24px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {CATEGORIES.map(cat => (
          <Btn
            key={cat}
            variant={filterCategory === cat ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setFilterCategory(cat)}
          >
            {cat}
          </Btn>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: T.muted }}>
          {filtered.length} photo{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Photo Grid */}
      <div style={{ padding: '0 24px 40px' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>Loading...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {filtered.map((photo, idx) => (
              <Card
                key={photo.id}
                style={{ cursor: 'pointer', transition: 'border-color 0.2s' }}
              >
                <div onClick={() => setLightbox(idx)}>
                  {photo.url ? (
                    <img src={photo.url} alt={photo.description} style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', height: 150, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 32, opacity: 0.3, color: T.muted }}>IMG</span>
                    </div>
                  )}
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Badge label={photo.category} color={CATEGORY_BADGE[photo.category] || 'muted'} />
                      <span style={{ fontSize: 11, color: T.muted }}>{photo.date}</span>
                    </div>
                    <div style={{ fontSize: 12, color: T.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {photo.description}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox !== null && filtered[lightbox] && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 900, width: '90vw', background: T.surface, borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.border}` }}>
            {filtered[lightbox].url ? (
              <img src={filtered[lightbox].url!} alt={filtered[lightbox].description} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block', background: T.bg }} />
            ) : (
              <div style={{ width: '100%', height: 400, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 48, color: T.muted, opacity: 0.3 }}>IMG</span>
              </div>
            )}
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: T.white, fontSize: 14, fontWeight: 600 }}>{filtered[lightbox].description}</div>
                <div style={{ color: T.muted, fontSize: 12, marginTop: 4 }}>
                  {filtered[lightbox].category} -- {filtered[lightbox].date}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="ghost" size="sm" onClick={() => navLightbox(-1)} disabled={lightbox === 0}>Prev</Btn>
                <Btn variant="ghost" size="sm" onClick={() => navLightbox(1)} disabled={lightbox === filtered.length - 1}>Next</Btn>
                {filtered[lightbox].url && (
                  <a href={filtered[lightbox].url!} download style={{ textDecoration: 'none' }}>
                    <Btn size="sm">Download</Btn>
                  </a>
                )}
                <Btn variant="ghost" size="sm" onClick={() => setLightbox(null)}>Close</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageWrap>
  );
}
