'use client';
/**
 * FieldPhotoCapture — Reusable camera + upload component for field app.
 * Opens camera on mobile, file picker on desktop.
 * Uploads to Supabase Storage and returns the public URL.
 */
import React, { useState, useRef } from 'react';
import { F } from '@/lib/field-tokens';

interface FieldPhotoCaptureProps {
  onUpload: (url: string) => void;
  projectId: string;
  /** Optional subfolder within the project (e.g. 'daily-logs/abc123') */
  folder?: string;
  /** Button label override */
  label?: string;
}

export default function FieldPhotoCapture({ onUpload, projectId, folder, label }: FieldPhotoCaptureProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Show preview immediately
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    setError('');
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      formData.append('folder', folder || `field-photos/${projectId}/${Date.now()}`);

      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      const url = data.url || data.publicUrl || data.file_url || '';
      if (url) {
        onUpload(url);
      } else {
        throw new Error('No URL returned from upload');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const clearPreview = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError('');
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        style={{ display: 'none' }}
      />

      {/* Thumbnail preview */}
      {preview && (
        <div style={{ position: 'relative', marginBottom: 10, display: 'inline-block' }}>
          <img
            src={preview}
            alt="Captured photo"
            style={{
              width: 120,
              height: 90,
              objectFit: 'cover',
              borderRadius: F.radiusSm,
              border: `1px solid ${F.border}`,
            }}
          />
          {uploading && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,.55)', borderRadius: F.radiusSm,
            }}>
              <div style={{
                width: 24, height: 24, border: `3px solid ${F.border}`, borderTopColor: F.gold,
                borderRadius: '50%', animation: 'fieldPhotSpin .8s linear infinite',
              }} />
            </div>
          )}
          {!uploading && (
            <button
              onClick={clearPreview}
              style={{
                position: 'absolute', top: 4, right: 4, width: 22, height: 22,
                borderRadius: '50%', background: 'rgba(0,0,0,.6)', border: 'none',
                color: F.red, fontSize: 14, cursor: 'pointer', lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Remove photo"
            >&times;</button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ fontSize: 12, color: F.red, marginBottom: 8 }}>{error}</div>
      )}

      {/* Capture button */}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{
          padding: '10px 16px', borderRadius: F.radiusSm, border: 'none',
          background: uploading ? F.border : `${F.gold}22`, color: uploading ? F.dim : F.gold,
          fontWeight: 600, fontSize: 14, cursor: uploading ? 'not-allowed' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center',
          minHeight: F.touchMin,
        }}
      >
        {uploading ? (
          <>Uploading...</>
        ) : (
          <>{label || '\u{1F4F7} Take Photo'}</>
        )}
      </button>

      <style>{`@keyframes fieldPhotSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
