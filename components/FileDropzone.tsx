'use client';
/**
 * Drag-drop + click file uploader. Streams to /api/files/upload (cookie auth),
 * which stores a project_files row and returns signed rows. Reusable across the
 * platform (project files, fleet, RFIs…). Calls onUploaded with the new rows.
 */
import React, { useCallback, useRef, useState } from 'react';
import { UploadSimple, Spinner } from '@phosphor-icons/react';
import { uploadFileDirect } from '@/lib/upload-direct';

// Vercel caps a serverless request body near 4.5 MB. Files at or under this go
// through /api/files/upload (one fast batch); anything larger uploads straight
// to storage via a signed URL so big files (video) actually make it.
const DIRECT_THRESHOLD = 4 * 1024 * 1024;

export function FileDropzone({
  projectId, folder, category, entityType, entityId, onUploaded, compact,
}: {
  projectId?: string | null; folder?: string | null; category?: string | null;
  entityType?: string | null; entityId?: string | null;
  onUploaded?: (rows: any[]) => void; compact?: boolean; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (!files.length) return;
    setBusy(true); setMsg(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`);
    try {
      const small = files.filter((f) => f.size <= DIRECT_THRESHOLD);
      const big = files.filter((f) => f.size > DIRECT_THRESHOLD);
      const rows: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      const failed: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

      // Small files: one batch through the function (unchanged, fast path).
      if (small.length) {
        const fd = new FormData();
        small.forEach((f) => fd.append('file', f));
        if (projectId) fd.append('projectId', projectId);
        if (folder) fd.append('folder', folder);
        if (category) fd.append('category', category);
        if (entityType) fd.append('entityType', entityType);
        if (entityId) fd.append('entityId', entityId);
        const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        rows.push(...(json.files || []));
        failed.push(...(json.failed || []));
      }

      // Big files: straight to storage via a signed URL, one at a time.
      for (const f of big) {
        setMsg(`Uploading ${f.name}…`);
        try {
          rows.push(await uploadFileDirect(f, { projectId, folder, category, entityType, entityId }));
        } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          failed.push({ name: f.name, error: e?.message || 'upload failed' });
        }
      }

      setMsg(failed.length ? `${rows.length} uploaded, ${failed.length} failed` : `${rows.length} uploaded`);
      onUploaded?.(rows);
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setMsg(e?.message || 'Upload failed');
    }
    setBusy(false);
    setTimeout(() => setMsg(''), 3500);
  }, [projectId, folder, category, entityType, entityId, onUploaded]);

  return (
    <div>
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files?.length) upload(e.dataTransfer.files); }}
        style={{
          // One compact row: a drop target should not out-weigh the files below it.
          display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
          gap: 10, minHeight: 56, padding: compact ? '10px 14px' : '14px 18px', cursor: busy ? 'wait' : 'pointer',
          border: `1.5px dashed ${over ? 'var(--info)' : 'var(--border-strong)'}`, borderRadius: 'var(--radius-lg)',
          background: over ? 'var(--bg-surface-2)' : 'var(--bg-surface)', transition: 'background-color .12s, border-color .12s', textAlign: 'left',
        }}
      >
        {busy ? <Spinner size={20} color="var(--text-secondary)" className="spin" /> : <UploadSimple size={20} color={over ? 'var(--info)' : 'var(--text-secondary)'} />}
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          <b style={{ color: 'var(--text-primary)' }}>{busy ? msg || 'Uploading…' : 'Drop files or click to browse'}</b>
          {!compact && !busy && <span style={{ color: 'var(--text-secondary)' }}> · images, video, PDF, Office, CAD — up to 500 MB each</span>}
        </div>
        <input ref={inputRef} type="file" multiple style={{ display: 'none' }} disabled={busy}
          onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.currentTarget.value = ''; }} />
      </label>
      {msg && !busy && <div role="status" style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{msg}</div>}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
