'use client';
/**
 * Project media library — the unified file surface. Upload (drag-drop, any format
 * incl. video up to 500MB), preview inline (image/video/audio/pdf), rename, move
 * to folders, crop images, share (link/email/SMS/Slack/Teams), soft-delete + trash.
 * Backed by the canonical project_files table via /api/files/* (signed URLs).
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { Btn, T } from '@/components/ui/shell';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, StatStrip, InsightRow, AutoChip, ghostButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { FileThumb, FilePreview, KIND_TINT } from '@/components/FilePreview';
import { FileDropzone } from '@/components/FileDropzone';
import { FileCropper } from '@/components/FileCropper';
import { ExternalBrowser } from '@/components/ExternalBrowser';
import { classifyKind, KIND_LABEL, type FileKind } from '@/lib/filekind';
import {
  Folder, FolderOpen, FilmSlate, ImageSquare, X, DownloadSimple, PencilSimple, FolderSimplePlus, Crop, ShareNetwork,
  Trash, ArrowCounterClockwise, MagnifyingGlass, LinkSimple, EnvelopeSimple, ChatText, MicrosoftTeamsLogo, SlackLogo,
  CloudArrowDown, CloudArrowUp,
} from '@phosphor-icons/react';

/* eslint-disable @typescript-eslint/no-explicit-any */
const fmtSize = (b?: number) => { if (!b) return '—'; const u = ['B', 'KB', 'MB', 'GB']; let i = 0, n = b; while (n >= 1024 && i < 3) { n /= 1024; i++; } return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`; };
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const kindOf = (f: any): FileKind => (f.kind as FileKind) || classifyKind(f.mime_type || f.file_type, f.file_name);

export default function FilesPage() {
  const projectId = useParams().projectId as string;
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [folder, setFolder] = useState<string>('all');
  const [trash, setTrash] = useState(false);
  const [sel, setSel] = useState<any | null>(null);
  const [cropping, setCropping] = useState<any | null>(null);
  const [shareFor, setShareFor] = useState<any | null>(null);
  const [exportFor, setExportFor] = useState<any | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/files${trash ? '?trash=1' : ''}`);
      const json = await res.json();
      setFiles(json.files ?? []);
    } catch { setFiles([]); }
    setLoading(false);
  }, [projectId, trash]);
  useEffect(() => { load(); }, [load]);

  // Project intelligence — one snapshot; the library walks in knowing the job.
  const { ctx } = useProjectContext(projectId);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  /* Folders the project was set up with, whether or not anything is filed in
     them yet. Deriving the list purely from uploaded files meant a brand-new
     project showed none at all — the GC had nowhere to put a drawing and no
     hint that anywhere was expected. */
  const [seededFolders, setSeededFolders] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/folders`);
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setSeededFolders((body.folders ?? []).map((x: { name: string }) => x.name));
      } catch { /* the file-derived list below still works */ }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  /* Seeded order first — it is the order the template meant — then anything a
     file introduced that is not already in it. */
  const folders = useMemo(() => {
    const fromFiles = files.map((f) => f.folder).filter(Boolean) as string[];
    const extra = Array.from(new Set(fromFiles.filter((x) => !seededFolders.includes(x)))).sort();
    return [...seededFolders, ...extra];
  }, [files, seededFolders]);
  const filtered = files.filter((f) => {
    if (kindFilter !== 'all' && kindOf(f) !== kindFilter) return false;
    if (folder !== 'all' && (f.folder || '') !== folder) return false;
    if (search && !(`${f.file_name} ${f.category || ''}`).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const patchFile = (row: any) => { setFiles((prev) => prev.map((f) => (f.id === row.id ? { ...f, ...row } : f))); setSel((s: any) => (s && s.id === row.id ? { ...s, ...row } : s)); };
  const rename = async (f: any) => { const name = prompt('Rename file', f.file_name); if (!name || name === f.file_name) return; const r = await (await fetch(`/api/files/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_name: name }) })).json(); if (r.file) { patchFile(r.file); flash('Renamed'); } };
  const move = async (f: any) => { const dest = prompt('Move to folder (blank = root)', f.folder || ''); if (dest === null) return; const r = await (await fetch(`/api/files/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: dest }) })).json(); if (r.file) { patchFile(r.file); flash(dest ? `Moved to ${dest}` : 'Moved to root'); } };
  const del = async (f: any, hard = false) => { if (hard && !confirm(`Permanently delete "${f.file_name}"? This cannot be undone.`)) return; await fetch(`/api/files/${f.id}${hard ? '?hard=1' : ''}`, { method: 'DELETE' }); setFiles((prev) => prev.filter((x) => x.id !== f.id)); setSel(null); flash(hard ? 'Deleted permanently' : 'Moved to trash'); };
  const restore = async (f: any) => { await fetch(`/api/files/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restore: true }) }); setFiles((prev) => prev.filter((x) => x.id !== f.id)); flash('Restored'); };

  const kinds: { k: string; label: string }[] = [{ k: 'all', label: 'All' }, ...(['image', 'video', 'pdf', 'doc', 'sheet', 'audio', 'cad', 'other'] as FileKind[]).map((k) => ({ k, label: KIND_LABEL[k] }))];
  const counts = { total: files.length, video: files.filter((f) => kindOf(f) === 'video').length, image: files.filter((f) => kindOf(f) === 'image').length };
  const docCount = Math.max(0, counts.total - counts.video - counts.image);
  const bytesTotal = files.reduce((s, f) => s + (Number(f.file_size) || 0), 0);
  const weekAgo = Date.now() - 7 * 86400000;
  const addedThisWeek = files.filter((f) => f.created_at && new Date(f.created_at).getTime() >= weekAgo).length;
  const lastUpload = files.reduce<string | null>((m, f) => (f.created_at && (!m || f.created_at > m) ? f.created_at : m), null);

  return (
    <>
      <PremiumSurface maxWidth={1600}>
        {/* Header */}
        <ModuleHero
          eyebrow={ctx?.project?.name || 'Media Library'}
          eyebrowIcon={<Folder size={13} weight="fill" color="#F59E0B" />}
          title="Files &"
          accent="Media"
          subtitle="Upload, preview, edit, and share any file."
          actions={
            <button onClick={() => setShowImport(true)} style={ghostButtonStyle} className="pmBtn">
              <CloudArrowDown size={15} weight="bold" /> Import from cloud
            </button>
          }
        />

        {/* Library intelligence — what the system already knows */}
        {!loading && (
          <StatStrip items={[
            { label: 'Library', value: String(counts.total), sub: bytesTotal > 0 ? `${fmtSize(bytesTotal)} stored` : 'no storage used yet' },
            { label: 'Added This Week', value: String(addedThisWeek), accent: addedThisWeek > 0 ? '#3dd68c' : undefined, sub: lastUpload ? `last upload ${fmtDate(lastUpload)}` : 'nothing uploaded yet' },
            { label: 'Photos', value: String(counts.image), sub: 'site + progress shots' },
            { label: 'Videos', value: String(counts.video), sub: 'walkthroughs, site video' },
            { label: 'Docs & Drawings', value: String(docCount), sub: 'PDFs, sheets, CAD, docs' },
            { label: 'Folders', value: String(folders.length), sub: folders.length > 0 ? folders.slice(0, 2).join(', ') + (folders.length > 2 ? '…' : '') : 'organize with Move' },
          ]} />
        )}

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          <StatCard icon={<Folder size={19} weight="duotone" color={T.gold} />} label="Total Files" value={String(counts.total)} accent={T.gold} delay={0.02} />
          <StatCard icon={<ImageSquare size={19} weight="duotone" color={KIND_TINT.image} />} label="Photos" value={String(counts.image)} accent={KIND_TINT.image} delay={0.06} />
          <StatCard icon={<FilmSlate size={19} weight="duotone" color={KIND_TINT.video} />} label="Videos" value={String(counts.video)} accent={KIND_TINT.video} delay={0.10} />
        </div>

        {!trash && (
          <div style={{ marginBottom: 16 }}>
            <FileDropzone projectId={projectId} folder={folder !== 'all' ? folder : null} onUploaded={(rows) => { if (rows?.length) { setFiles((prev) => [...rows, ...prev]); flash(`${rows.length} uploaded`); } }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 8, fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>
              <span>Uploads land in {folder !== 'all' ? <b style={{ color: '#FBBF24' }}>{folder}</b> : 'the library root'}</span><AutoChip label={folder !== 'all' ? 'FOLDER' : 'AUTO'} />
              <span style={{ marginLeft: 6 }}>· dated {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span><AutoChip />
              <span style={{ marginLeft: 6 }}>· any format, video up to 500MB</span>
            </div>
          </div>
        )}

        {toast && <div style={{ marginBottom: 14, padding: '9px 14px', background: T.greenDim, border: '1px solid rgba(52,199,89,0.3)', borderRadius: 8, color: T.green, fontSize: 13 }}>{toast}</div>}

        {/* Library */}
        <SectionCard
          icon={<Folder size={17} weight="duotone" color={T.gold} />}
          title={trash ? 'Trash' : 'Library'}
          subtitle={`${filtered.length} ${filtered.length === 1 ? 'file' : 'files'}${!trash && folder !== 'all' ? ` · ${folder}` : ''}`}
          action={<Btn size="sm" variant={trash ? 'primary' : 'ghost'} onClick={() => setTrash((t) => !t)}><Trash size={14} />{trash ? 'Viewing trash' : 'Trash'}</Btn>}
        >
          {/* Toolbar */}
          <ListToolbar
            module="files"
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search files…"
            filters={[
              { key: 'kind', label: 'Type', value: kindFilter, onChange: setKindFilter, allLabel: 'All types',
                options: kinds.filter((k) => k.k !== 'all').map((k) => ({ value: k.k, label: k.label })) },
              { key: 'folder', label: 'Folder', value: folder, onChange: setFolder, allLabel: 'All folders',
                options: folders },
            ]}
            count={{ shown: filtered.length, total: files.length }}
            style={{ marginBottom: 16 }}
          />

          {/* grid */}
          {loading ? <div style={{ textAlign: 'center', padding: 44, color: T.muted, fontSize: 13 }}>Loading…</div>
            : filtered.length === 0 ? (
              trash || files.length > 0 ? (
                <PremiumEmpty
                  icon={trash ? <Trash size={30} weight="duotone" color={T.gold} /> : <MagnifyingGlass size={30} weight="duotone" color={T.gold} />}
                  title={trash ? 'Trash is empty' : 'No files match'}
                  description={trash ? 'Deleted files show up here and can be restored before permanent removal.' : 'Try a different search term or filter to find what you’re looking for.'}
                  compact
                />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: ctx ? 'minmax(0, 1fr) 320px' : '1fr', alignItems: 'stretch' }}>
                  <PremiumEmpty
                    icon={<Folder size={30} weight="duotone" color={T.gold} />}
                    title="The project file room, empty for now"
                    description="Drop files above — plans, permits, contracts, submittal PDFs, site photos and video all live here, previewable and shareable from one place."
                    compact
                  />
                  {ctx && (
                    <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', padding: '20px 22px' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 900, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10 }}>What Belongs Here</div>
                      <InsightRow label="Drawings & specs" value="PDF · CAD" />
                      <InsightRow label="Contracts & permits" value="PDF · DOC" />
                      <InsightRow label="Site photos & video" value="up to 500MB" />
                      <InsightRow label="Submittal & RFI backup" value="any format" />
                      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '10px 0' }} />
                      {ctx?.recent?.lastDailyLogDate && <InsightRow label="Last daily log" value={fmtDate(ctx.recent.lastDailyLogDate)} />}
                      {Number(ctx?.counts?.openRfis) > 0 && <InsightRow label="Open RFIs" value={String(ctx.counts.openRfis)} accent="#FBBF24" />}
                      {Number(ctx?.counts?.openSubmittals) > 0 && <InsightRow label="Open submittals" value={String(ctx.counts.openSubmittals)} accent="#FBBF24" />}
                      <div style={{ marginTop: 12, fontSize: 12, color: T.muted, lineHeight: 1.55 }}>
                        Photos and attachments captured in the field land alongside what you drop here — everything previews inline and shares by link, email, or SMS.
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 14 }}>
                {filtered.map((f) => {
                  const k = kindOf(f);
                  return (
                    <div key={f.id} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', cursor: 'pointer' }} onClick={() => (trash ? null : setSel(f))}>
                      <FileThumb kind={k} url={f.file_url} poster={f.poster_url} />
                      <div style={{ padding: '9px 11px' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.file_name}>{f.file_name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: KIND_TINT[k] }}>{KIND_LABEL[k]}</span>
                          <span style={{ fontSize: 11.5, color: T.muted }}>· {fmtSize(f.file_size)}</span>
                          {f.folder && <span style={{ fontSize: 11, color: T.muted, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3 }}><FolderOpen size={11} />{f.folder}</span>}
                        </div>
                        {trash && <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}><Btn size="sm" variant="ghost" onClick={() => restore(f)}><ArrowCounterClockwise size={12} />Restore</Btn><Btn size="sm" variant="danger" onClick={() => del(f, true)}>Delete</Btn></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </SectionCard>
      </PremiumSurface>

      {/* preview + actions */}
      {sel && (
        <div onClick={() => setSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, width: 'min(820px,100%)', maxHeight: '92vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 17, color: T.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sel.file_name}</div>
                <div style={{ fontSize: 12.5, color: T.muted }}>{KIND_LABEL[kindOf(sel)]} · {fmtSize(sel.file_size)} · {fmtDate(sel.created_at)}{sel.uploaded_by_name ? ` · ${sel.uploaded_by_name}` : ''}</div>
              </div>
              <button onClick={() => setSel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color={T.muted} /></button>
            </div>
            <FilePreview kind={kindOf(sel)} url={sel.file_url} name={sel.file_name} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <a href={sel.file_url} download={sel.file_name} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><Btn size="sm" variant="ghost"><DownloadSimple size={14} />Download</Btn></a>
              <Btn size="sm" variant="ghost" onClick={() => rename(sel)}><PencilSimple size={14} />Rename</Btn>
              <Btn size="sm" variant="ghost" onClick={() => move(sel)}><FolderSimplePlus size={14} />Move</Btn>
              {kindOf(sel) === 'image' && <Btn size="sm" variant="ghost" onClick={() => setCropping(sel)}><Crop size={14} />Edit / Crop</Btn>}
              <Btn size="sm" variant="ghost" onClick={() => setShareFor(sel)}><ShareNetwork size={14} />Share</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setExportFor(sel)}><CloudArrowUp size={14} />Export to cloud</Btn>
              <div style={{ flex: 1 }} />
              <Btn size="sm" variant="danger" onClick={() => del(sel)}><Trash size={14} />Delete</Btn>
            </div>
          </div>
        </div>
      )}

      {cropping && <FileCropper fileId={cropping.id} url={cropping.file_url} name={cropping.file_name} onClose={() => setCropping(null)} onDone={(row) => { patchFile(row); setCropping(null); flash('Image updated'); }} />}
      {shareFor && <ShareMenu file={shareFor} onClose={() => setShareFor(null)} onToast={flash} />}
      {exportFor && <ExportMenu file={exportFor} onClose={() => setExportFor(null)} onToast={flash} />}
      {showImport && <ExternalBrowser projectId={projectId} onImported={(row) => { if (row) { setFiles((prev) => [row, ...prev]); flash(`Imported ${row.file_name}`); } }} onClose={() => setShowImport(false)} />}
    </>
  );
}

function ExportMenu({ file, onClose, onToast }: { file: any; onClose: () => void; onToast: (m: string) => void }) {
  const [connectors, setConnectors] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  useEffect(() => { fetch('/api/storage/connectors').then((r) => r.json()).then((j) => setConnectors((j.connectors || []).filter((c: any) => c.connected))); }, []);
  const exportTo = async (c: any) => {
    setBusy(c.id);
    try { const j = await (await fetch(`/api/storage/connectors/${c.id}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: file.id }) })).json(); if (j.error) throw new Error(j.error); onToast(`Exported to ${c.display_name}`); onClose(); }
    catch (e: any) { console.error(e); onToast(humanError(e, 'Export failed. Please try again.')); }
    setBusy('');
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, width: 'min(360px,100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}><CloudArrowUp size={18} color={T.gold} weight="fill" /><div style={{ fontWeight: 800, fontSize: 16, marginLeft: 8, flex: 1, color: T.white }}>Export to cloud</div><button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={T.muted} /></button></div>
        {connectors.length === 0 ? <div style={{ color: T.muted, fontSize: 13 }}>No connected storage. Add one in <a href="/app/settings/storage" style={{ color: T.gold }}>Settings → External Storage</a>.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{connectors.map((c) => <button key={c.id} disabled={!!busy} onClick={() => exportTo(c)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: '11px 14px', cursor: 'pointer', color: T.white, fontSize: 14, textAlign: 'left' }}><Folder size={16} color={T.gold} />{busy === c.id ? 'Uploading…' : c.display_name}</button>)}</div>}
      </div>
    </div>
  );
}

function ShareMenu({ file, onClose, onToast }: { file: any; onClose: () => void; onToast: (m: string) => void }) {
  const [busy, setBusy] = useState('');
  const share = async (channel: string) => {
    setBusy(channel);
    try {
      let to: string | null = null;
      if (channel === 'email') { to = prompt('Send to email address'); if (!to) { setBusy(''); return; } }
      if (channel === 'sms') { to = prompt('Send to phone number (optional)') || ''; }
      const res = await fetch('/api/files/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: file.id, channel, to }) });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      if (channel === 'link' && json.url) { await navigator.clipboard.writeText(json.url).catch(() => {}); onToast('Share link copied'); }
      else if (channel === 'sms' && json.smsUrl) { window.location.href = json.smsUrl; onToast('Opening Messages…'); }
      else if (channel === 'email') onToast(json.attached ? 'Emailed (file attached)' : 'Emailed with link');
      else if (channel === 'slack' || channel === 'teams') onToast(`Posted to ${channel}`);
      onClose();
    } catch (e: any) { onToast(e?.message || 'Share failed'); }
    setBusy('');
  };
  const opts: { c: string; label: string; icon: React.ReactNode }[] = [
    { c: 'link', label: 'Copy link', icon: <LinkSimple size={16} /> },
    { c: 'email', label: 'Email', icon: <EnvelopeSimple size={16} /> },
    { c: 'sms', label: 'Text (SMS)', icon: <ChatText size={16} /> },
    { c: 'slack', label: 'Slack', icon: <SlackLogo size={16} /> },
    { c: 'teams', label: 'Teams', icon: <MicrosoftTeamsLogo size={16} /> },
  ];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, width: 'min(360px,100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}><ShareNetwork size={18} color={T.gold} weight="fill" /><div style={{ fontWeight: 800, fontSize: 16, marginLeft: 8, flex: 1, color: T.white }}>Share file</div><button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={T.muted} /></button></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {opts.map((o) => (
            <button key={o.c} disabled={!!busy} onClick={() => share(o.c)} style={{ display: 'flex', alignItems: 'center', gap: 11, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: '11px 14px', cursor: 'pointer', color: T.white, fontSize: 14, textAlign: 'left' }}>
              <span style={{ color: T.gold }}>{o.icon}</span>{busy === o.c ? 'Working…' : o.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 12, lineHeight: 1.5 }}>Slack/Teams post to your workspace's Incoming Webhook (set it in Settings → Integrations).</div>
      </div>
    </div>
  );
}
