'use client';
/**
 * Models — the job's 3D models (IFC from Revit/ArchiCAD/Tekla, glTF/GLB from
 * SketchUp, Blender, scanners) in a viewer: orbit, fit, standard views,
 * section plane, element properties, hide/isolate, levels, measure and
 * screenshot.
 *
 * A model is just a job file: it lives in project_files (folder "Models")
 * and in the same storage as every other file, so it also shows in Files.
 *
 * Reads   GET  /api/projects/:id/files           (filtered to .ifc/.glb/.gltf)
 * Writes  POST /api/files/upload-url → storage → POST /api/files/record
 *         (lib/upload-direct — bytes go straight to storage, no size cap
 *          from the serverless function)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { Cube, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { PageShell, Button, EmptyState, Toast, useToast } from '@/components/ui/kit';
import { uploadFileDirect } from '@/lib/upload-direct';
import { detectModelFormat, formatBytes, MODEL_ACCEPT, MAX_MODEL_BYTES } from '@/lib/model-viewer';
import type { ModelFile } from '@/components/models/ModelViewer';

const ModelViewer = dynamic(() => import('@/components/models/ModelViewer'), {
  ssr: false,
  loading: () => <div className="mp-placeholder" role="status">Starting the viewer…</div>,
});

interface FileRow extends ModelFile {
  created_at?: string | null;
  uploaded_by_name?: string | null;
}

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function ModelsPage() {
  const { projectId } = useParams() as { projectId: string };
  const { ctx } = useProjectContext(projectId);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast, show } = useToast(4000);

  const load = useCallback(async (selectId?: string) => {
    setError('');
    try {
      const r = await fetch(`/api/projects/${projectId}/files`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't load the job's files");
      const models = ((j.files || []) as FileRow[]).filter((f) => f.file_url && detectModelFormat(f.file_name, f.mime_type));
      setFiles(models);
      setActiveId((cur) => {
        if (selectId && models.some((m) => m.id === selectId)) return selectId;
        if (cur && models.some((m) => m.id === cur)) return cur;
        return models[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the job's files");
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    let lastId: string | undefined;
    for (const f of list) {
      if (!detectModelFormat(f.name, f.type)) { show(`${f.name} is not a model file (.ifc, .glb or .gltf)`, 'bad'); continue; }
      if (f.size > MAX_MODEL_BYTES) { show(`${f.name} is ${formatBytes(f.size)} — the limit is ${formatBytes(MAX_MODEL_BYTES)}`, 'bad'); continue; }
      setUploading(f.name);
      try {
        const row = await uploadFileDirect(f, { projectId, folder: 'Models', category: 'model' });
        lastId = row?.id;
        show(`${f.name} uploaded`, 'good');
      } catch (err) {
        show(err instanceof Error ? err.message : `Couldn't upload ${f.name}`, 'bad');
      }
    }
    setUploading(null);
    if (list.length) await load(lastId);
  };

  const active = useMemo(() => files.find((f) => f.id === activeId) || null, [files, activeId]);
  const base = `/app/projects/${projectId}`;
  const totalBytes = files.reduce((s, f) => s + (Number(f.file_size) || 0), 0);

  return (
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
        { label: 'Models' },
      ]}
      title="Models"
      subtitle={files.length ? `${files.length} model${files.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}` : undefined}
      actions={
        <Button variant="primary" icon={<UploadSimple size={15} weight="bold" />} onClick={() => inputRef.current?.click()} disabled={!!uploading}>
          {uploading ? 'Uploading…' : 'Upload model'}
        </Button>
      }
    >
      <input ref={inputRef} type="file" accept={MODEL_ACCEPT} multiple hidden onChange={onPick} />

      {error ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load models" text={error}
          action={<Button onClick={() => { setLoading(true); load(); }}>Try again</Button>} />
      ) : loading ? (
        <div className="mp-placeholder" role="status">Loading models…</div>
      ) : files.length === 0 ? (
        <EmptyState
          icon={<Cube size={22} />}
          title="No models on this job yet"
          text="IFC, GLB or glTF"
          action={<Button variant="primary" icon={<UploadSimple size={15} weight="bold" />} onClick={() => inputRef.current?.click()} disabled={!!uploading}>
            {uploading ? 'Uploading…' : 'Upload model'}
          </Button>}
        />
      ) : (
        <div className="mp-grid">
          <nav className="mp-list" aria-label="Models on this job">
            {files.map((f) => {
              const fmt = detectModelFormat(f.file_name, f.mime_type);
              return (
                <button key={f.id} type="button" className="mp-item" aria-current={f.id === activeId || undefined} onClick={() => setActiveId(f.id)}>
                  <span className="mp-fmt">{fmt?.toUpperCase()}</span>
                  <span className="mp-text">
                    <span className="mp-name">{f.file_name}</span>
                    <span className="mp-meta">{formatBytes(f.file_size)} · {fmtDate(f.created_at)}</span>
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="mp-viewer">
            {active && <ModelViewer key={active.id} file={active} />}
          </div>
        </div>
      )}
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </PageShell>
  );
}

const CSS = `
.mp-grid { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.mp-list { display: flex; flex-direction: column; max-height: min(78vh, 820px); overflow: auto; border-top: 1px solid var(--border-default); }
.mp-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 56px; padding: 8px 10px; border: 0; border-bottom: 1px solid var(--border-default); background: transparent; color: var(--text-primary); text-align: left; cursor: pointer; }
.mp-item:hover { background: var(--bg-row-hover); }
.mp-item[aria-current] { background: var(--bg-surface-2); }
.mp-item[aria-current] .mp-name { font-weight: 700; }
.mp-fmt { flex: none; font-size: 12px; font-weight: 700; color: var(--text-secondary); width: 38px; }
.mp-text { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.mp-name { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-meta { font-size: 12px; color: var(--text-tertiary); }
.mp-viewer { min-width: 0; }
.mp-placeholder { display: flex; align-items: center; justify-content: center; min-height: 320px; color: var(--text-tertiary); font-size: 14px; }
@media (max-width: 900px) {
  .mp-grid { grid-template-columns: minmax(0, 1fr); }
  .mp-list { max-height: 220px; }
}
`;
