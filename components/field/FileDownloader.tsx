'use client';
import { useState } from 'react';
import { F } from '@/lib/field-tokens';

interface FileDownloaderProps {
  /** Storage bucket name */
  bucket?: string;
  /** File path within the bucket */
  path: string;
  /** Display filename */
  filename: string;
  /** File size in bytes (optional, for display) */
  size?: number;
  /** Compact mode for inline use */
  compact?: boolean;
}

/**
 * Reusable file download button for field app.
 * Fetches a signed URL from /api/files/download and opens it.
 * On Capacitor native, uses Filesystem plugin to save to device.
 */
export default function FileDownloader({ bucket = 'project-files', path, filename, size, compact }: FileDownloaderProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      const res = await fetch(`/api/files/download?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Download failed');
      }
      const data = await res.json();

      if (!data.url) throw new Error('No download URL returned');

      // Try Capacitor Filesystem for native apps
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const response = await fetch(data.url);
        const blob = await response.blob();
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(blob);
        });

        await Filesystem.writeFile({
          path: `Downloads/${filename}`,
          data: base64,
          directory: Directory.Documents,
        });
        // Show native toast
        try {
          const { Toast } = await import('@capacitor/toast');
          await Toast.show({ text: `Saved to Documents/${filename}` });
        } catch { /* no toast plugin */ }
      } catch {
        // Not native or Filesystem unavailable — open in browser
        window.open(data.url, '_blank');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    }
    setDownloading(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  if (compact) {
    return (
      <button onClick={handleDownload} disabled={downloading}
        style={{ background: 'none', border: 'none', color: downloading ? F.dim : F.blue, cursor: downloading ? 'wait' : 'pointer', padding: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: F.fontSm, fontWeight: 600 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg>
        {downloading ? '...' : 'Download'}
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button onClick={handleDownload} disabled={downloading}
        style={{
          background: downloading ? F.raised : 'rgba(59,130,246,.1)',
          border: `1px solid ${downloading ? F.border : 'rgba(59,130,246,.3)'}`,
          borderRadius: F.radiusSm,
          padding: '8px 14px',
          color: downloading ? F.dim : F.blue,
          fontSize: F.fontMd,
          fontWeight: 700,
          cursor: downloading ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg>
        {downloading ? 'Downloading...' : filename}
      </button>
      {size != null && size > 0 && (
        <span style={{ fontSize: F.fontXs, color: F.faint }}>{formatSize(size)}</span>
      )}
      {error && (
        <span style={{ fontSize: F.fontXs, color: F.red }}>{error}</span>
      )}
    </div>
  );
}
