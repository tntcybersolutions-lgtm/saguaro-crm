'use client';
/**
 * Saguaro Field — Photos
 * Camera capture + gallery. Works offline via IndexedDB queue.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0f1d2b';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const GREEN  = '#22C55E';
const RED    = '#EF4444';

const CATEGORIES = ['Progress', 'Issue', 'Delivery', 'Inspection', 'Safety', 'Completion', 'Other'];
const CAT_COLORS: Record<string, string> = {
  Progress: '#3B82F6', Issue: RED, Delivery: '#F59E0B',
  Inspection: '#8B5CF6', Safety: '#EF4444', Completion: GREEN, Other: DIM,
};

interface PhotoEntry { id: string; dataUrl: string; category: string; caption: string; uploaded: boolean; timestamp: number; }

export default function FieldPhotosPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [selected, setSelected] = useState<PhotoEntry | null>(null);
  const [uploading, setUploading] = useState(false);
  const [online, setOnline] = useState(true);

  // Pending upload state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState('');
  const [pendingCategory, setPendingCategory] = useState('Progress');
  const [pendingCaption, setPendingCaption] = useState('');

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Load existing photos from server
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/photos?projectId=${projectId}&limit=20`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const list = d?.photos || d?.data || [];
        setPhotos(list.map((p: Record<string, unknown>) => ({
          id: String(p.id),
          dataUrl: String(p.file_url || p.url || ''),
          category: String(p.category || 'Progress'),
          caption: String(p.caption || p.description || ''),
          uploaded: true,
          timestamp: new Date(String(p.created_at || Date.now())).getTime(),
        })));
      })
      .catch(() => {});
  }, [projectId]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPendingPreview(String(ev.target?.result || ''));
    reader.readAsDataURL(file);
    // Reset input
    e.target.value = '';
  };

  const cancelPending = () => {
    setPendingFile(null);
    setPendingPreview('');
    setPendingCaption('');
    setPendingCategory('Progress');
  };

  const uploadPhoto = useCallback(async () => {
    if (!pendingFile) return;
    setUploading(true);

    const localEntry: PhotoEntry = {
      id: `local-${Date.now()}`,
      dataUrl: pendingPreview,
      category: pendingCategory,
      caption: pendingCaption,
      uploaded: false,
      timestamp: Date.now(),
    };

    try {
      if (!online) throw new Error('offline');

      const fd = new FormData();
      fd.append('file', pendingFile, pendingFile.name);
      fd.append('category', pendingCategory);
      fd.append('caption', pendingCaption);
      if (projectId) fd.append('projectId', projectId);

      const res = await fetch('/api/photos/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();

      setPhotos((prev) => [{
        id: String(data.id || data.photo?.id || localEntry.id),
        dataUrl: String(data.file_url || data.photo?.file_url || pendingPreview),
        category: pendingCategory,
        caption: pendingCaption,
        uploaded: true,
        timestamp: Date.now(),
      }, ...prev]);
    } catch {
      // Queue for later sync (store base64)
      const base64 = pendingPreview.split(',')[1] || '';
      await enqueue({
        url: '/api/photos/upload',
        method: 'POST',
        body: null,
        contentType: '',
        isFormData: true,
        formDataEntries: [
          { name: 'file', value: base64, filename: pendingFile.name, type: pendingFile.type },
          { name: 'category', value: pendingCategory },
          { name: 'caption', value: pendingCaption },
          ...(projectId ? [{ name: 'projectId', value: projectId }] : []),
        ],
      });
      setPhotos((prev) => [localEntry, ...prev]);
    }

    cancelPending();
    setUploading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFile, pendingPreview, pendingCategory, pendingCaption, projectId, online]);

  return (
    <div style={{ padding: '20px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: DIM, fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 8 }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Photos</h1>
        {!online && (
          <div style={{ marginTop: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: RED }}>
            Offline — photos will upload when reconnected
          </div>
        )}
      </div>

      {/* Capture button */}
      {!pendingPreview && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFilePick}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              width: '100%',
              background: RAISED,
              border: `2px dashed ${GOLD}`,
              borderRadius: 14,
              padding: '28px',
              color: GOLD,
              fontSize: 17,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              marginBottom: 24,
            }}
          >
            <span style={{ fontSize: 40 }}>📸</span>
            Take or Upload Photo
          </button>
        </>
      )}

      {/* Preview + form */}
      {pendingPreview && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingPreview} alt="Preview" style={{ width: '100%', maxHeight: 260, objectFit: 'cover' }} />
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Category */}
            <div>
              <label style={labelStyle}>Category</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPendingCategory(c)}
                    style={{
                      background: pendingCategory === c ? `rgba(${hexToRgb(CAT_COLORS[c] || DIM)}, 0.2)` : 'transparent',
                      border: `1px solid ${pendingCategory === c ? (CAT_COLORS[c] || DIM) : BORDER}`,
                      borderRadius: 20,
                      padding: '5px 12px',
                      color: pendingCategory === c ? (CAT_COLORS[c] || DIM) : DIM,
                      fontSize: 13,
                      fontWeight: pendingCategory === c ? 700 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Caption */}
            <div>
              <label style={labelStyle}>Caption (optional)</label>
              <input
                type="text"
                value={pendingCaption}
                onChange={(e) => setPendingCaption(e.target.value)}
                placeholder="Describe what you're capturing..."
                style={{ ...inputStyle, marginTop: 6 }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={cancelPending}
                style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, color: DIM, fontSize: 15, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={uploadPhoto}
                disabled={uploading}
                style={{
                  flex: 2,
                  background: uploading ? '#1e3148' : GOLD,
                  border: 'none',
                  borderRadius: 10,
                  padding: 14,
                  color: uploading ? DIM : '#000',
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: uploading ? 'wait' : 'pointer',
                }}
              >
                {uploading ? 'Saving...' : online ? 'Upload Photo' : 'Save Offline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gallery */}
      {photos.length > 0 && (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Recent Photos ({photos.length})
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 20 }}>
            {photos.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelected(p)}
                style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', border: `1px solid ${BORDER}` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt={p.caption} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {!p.uploaded && (
                  <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(239,68,68,0.9)', borderRadius: 4, padding: '1px 5px', fontSize: 9, color: '#fff', fontWeight: 700 }}>
                    PENDING
                  </div>
                )}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', padding: '12px 6px 4px', fontSize: 9, color: '#fff' }}>
                  {p.category}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Lightbox */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selected.dataUrl} alt={selected.caption} style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 12, objectFit: 'contain' }} />
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <span style={{ background: `rgba(${hexToRgb(CAT_COLORS[selected.category] || DIM)}, 0.2)`, border: `1px solid ${CAT_COLORS[selected.category] || DIM}`, borderRadius: 20, padding: '3px 12px', fontSize: 12, color: CAT_COLORS[selected.category] || DIM, fontWeight: 700 }}>
              {selected.category}
            </span>
            {selected.caption && <p style={{ margin: '8px 0 0', color: TEXT, fontSize: 15 }}>{selected.caption}</p>}
            <p style={{ margin: '4px 0 0', color: DIM, fontSize: 12 }}>Tap anywhere to close</p>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 12, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.7 };
const inputStyle: React.CSSProperties = { width: '100%', background: '#09111A', border: '1px solid #1e3148', borderRadius: 10, padding: '12px 14px', color: '#e8edf8', fontSize: 15, outline: 'none' };

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}
