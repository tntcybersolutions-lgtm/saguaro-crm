'use client';

/**
 * DocumentManager — the "where is that file" view.
 *
 * The rest of /app/documents is organised by compliance artefact (pay apps,
 * lien waivers, payroll). That is the right shape when you know which form you
 * want. It is the wrong shape when a sub emails asking which revision of the
 * electrical sheet they priced, which is the question this screen answers.
 *
 * Three panes: the cabinet (project → folder), the drawer (a filterable,
 * groupable grid), and the file itself (preview, metadata, revision history).
 * Everything is one round trip to /api/files/manager — the tree is built from
 * facets over the tenant's whole live set, so a folder you have not opened yet
 * is still visible in it.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  MagnifyingGlass, FolderOpen, Folder, CaretRight, CaretDown, UploadSimple,
  ClockCounterClockwise, ArrowSquareOut, Copy, X, Files, Image as ImageIcon,
  FilmSlate, FileText, Stack, WarningCircle, ArrowsDownUp, ArrowsLeftRight,
} from '@phosphor-icons/react';
import { openPdf } from '@/components/PdfViewer';
import { humanError } from '@/lib/errors';

const GOLD = '#F59E0B';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1';
const TEXT = '#FFFFFF';
const RAISED = 'rgba(255,255,255,0.04)';
const SUNK = 'rgba(0,0,0,0.22)';

export interface ManagedFile {
  id: string;
  project_id: string | null;
  project_name: string | null;
  file_name: string | null;
  file_url: string | null;
  file_size: number | null;
  file_type: string | null;
  mime_type: string | null;
  category: string | null;
  folder: string | null;
  uploaded_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  version_number: number | null;
  supersedes_file_id: string | null;
  is_current: boolean | null;
  kind: string | null;
  poster_url: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  entity_type: string | null;
  entity_id: string | null;
  file_hash: string | null;
}

interface Facet { value: string; label: string; count: number; bytes: number }
interface TreeNode extends Facet { folders: Facet[] }

type GroupBy = 'none' | 'folder' | 'category' | 'kind' | 'project_name';
type SortKey = 'file_name' | 'created_at' | 'file_size' | 'version_number';

const GROUPS: { key: GroupBy; label: string }[] = [
  { key: 'none', label: 'No grouping' },
  { key: 'folder', label: 'Folder' },
  { key: 'category', label: 'Category' },
  { key: 'kind', label: 'Type' },
  { key: 'project_name', label: 'Project' },
];

const bytes = (n: number | null | undefined): string => {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};

const day = (d: string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const ext = (f: ManagedFile): string => {
  const n = f.file_name || '';
  const dot = n.lastIndexOf('.');
  return dot > 0 ? n.slice(dot + 1).toUpperCase() : (f.kind || '').toUpperCase();
};

/** Every file opens through the signing proxy — the bucket is private. */
const openUrl = (f: ManagedFile): string =>
  f.file_url ? `/api/files/open?u=${encodeURIComponent(f.file_url)}` : '';

const isPdf = (f: ManagedFile): boolean =>
  (f.mime_type || '').includes('pdf') || (f.file_name || '').toLowerCase().endsWith('.pdf');

const isImage = (f: ManagedFile): boolean =>
  (f.mime_type || '').startsWith('image/') || f.kind === 'image';

function KindIcon({ f, size = 15 }: { f: ManagedFile; size?: number }) {
  if (isImage(f)) return <ImageIcon size={size} weight="fill" color="#60A5FA" />;
  if (f.kind === 'video') return <FilmSlate size={size} weight="fill" color="#C084FC" />;
  if (isPdf(f)) return <FileText size={size} weight="fill" color="#F87171" />;
  return <Files size={size} weight="fill" color={DIM} />;
}

export default function DocumentManager({ projectId }: { projectId?: string }) {
  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [kinds, setKinds] = useState<Facet[]>([]);
  const [categories, setCategories] = useState<Facet[]>([]);
  const [totals, setTotals] = useState({ files: 0, bytes: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [activeProject, setActiveProject] = useState<string>(projectId || '');
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Per-column filter row — the PMWeb behaviour, minus the 1990s chrome.
  const [colFilter, setColFilter] = useState({ name: '', folder: '', category: '', by: '' });

  const [selected, setSelected] = useState<ManagedFile | null>(null);
  const [versions, setVersions] = useState<ManagedFile[] | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);

  /* Bulk selection. Filing twenty uploads one at a time is the single most
     tedious thing in every document manager on the market, PMWeb's included. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (activeProject) p.set('projectId', activeProject);
      if (activeFolder !== null) p.set('folder', activeFolder);
      if (kindFilter) p.set('kind', kindFilter);
      if (categoryFilter) p.set('category', categoryFilter);
      if (q.trim()) p.set('q', q.trim());
      if (showAllVersions) p.set('versions', 'all');
      p.set('limit', '500');

      const res = await fetch(`/api/files/manager?${p.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load documents');

      setFiles(json.data || []);
      setTree(json.facets?.tree || []);
      setKinds(json.facets?.kinds || []);
      setCategories(json.facets?.categories || []);
      setTotals(json.totals || { files: 0, bytes: 0 });
    } catch (e) {
      setError(humanError(e));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [activeProject, activeFolder, kindFilter, categoryFilter, q, showAllVersions]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0); // debounce typing, not clicks
    return () => clearTimeout(t);
  }, [load, q]);

  const loadVersions = useCallback(async (f: ManagedFile) => {
    setVersionsLoading(true);
    setVersions(null);
    try {
      const res = await fetch(`/api/files/${f.id}/versions`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load history');
      setVersions(json.data || []);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }, []);

  const select = useCallback((f: ManagedFile) => {
    setSelected(f);
    loadVersions(f);
  }, [loadVersions]);

  const upload = useCallback(async (list: FileList | File[]) => {
    const arr = [...list];
    if (arr.length === 0) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      for (const f of arr) fd.append('file', f);
      if (activeProject) fd.append('projectId', activeProject);
      if (activeFolder) fd.append('folder', activeFolder);
      const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Upload failed');
      const failed = (json.data || json.results || []).filter?.((r: any) => r?.error) || [];
      setUploadMsg(
        failed.length
          ? `${arr.length - failed.length} of ${arr.length} uploaded — ${failed[0].error}`
          : `${arr.length} file${arr.length === 1 ? '' : 's'} uploaded`,
      );
      await load();
    } catch (e) {
      setUploadMsg(humanError(e));
    } finally {
      setUploading(false);
    }
  }, [activeProject, activeFolder, load]);

  const togglePick = useCallback((id: string) => {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  /* Every bulk action is one request per file against the endpoints that
     already exist. Failures are counted rather than thrown, so one locked file
     does not abandon the other nineteen halfway through. */
  const bulkPatch = useCallback(async (body: Record<string, unknown>, verb: string) => {
    const ids = [...picked];
    if (ids.length === 0) return;
    setBulkBusy(verb);
    let ok = 0, failed = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/files/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        res.ok ? ok++ : failed++;
      } catch { failed++; }
    }
    setBulkBusy(null);
    setPicked(new Set());
    setUploadMsg(failed ? `${verb}: ${ok} done, ${failed} failed` : `${verb}: ${ok} file${ok === 1 ? '' : 's'}`);
    await load();
  }, [picked, load]);

  const bulkDelete = useCallback(async () => {
    const ids = [...picked];
    if (ids.length === 0) return;
    setBulkBusy('Deleting');
    let ok = 0, failed = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
        res.ok ? ok++ : failed++;
      } catch { failed++; }
    }
    setBulkBusy(null);
    setPicked(new Set());
    setUploadMsg(`Moved to trash: ${ok}${failed ? `, ${failed} failed` : ''} — restorable`);
    await load();
  }, [picked, load]);

  /* Opens each file through the signing proxy on a stagger. Browsers block a
     burst of simultaneous window.opens; spacing them keeps every file coming. */
  const bulkOpen = useCallback(async () => {
    const chosen = files.filter((f) => picked.has(f.id) && openUrl(f));
    setBulkBusy('Opening');
    for (const f of chosen) {
      window.open(openUrl(f), '_blank', 'noopener');
      await new Promise((r) => setTimeout(r, 220));
    }
    setBulkBusy(null);
    setUploadMsg(`Opened ${chosen.length} file${chosen.length === 1 ? '' : 's'} in new tabs`);
  }, [files, picked]);

  const rows = useMemo(() => {
    const cf = colFilter;
    const match = (v: string | null | undefined, needle: string) =>
      !needle || String(v || '').toLowerCase().includes(needle.toLowerCase());

    const filtered = files.filter(
      (f) =>
        match(f.file_name, cf.name) &&
        match(f.folder, cf.folder) &&
        match(f.category, cf.category) &&
        match(f.uploaded_by_name, cf.by),
    );

    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'file_size' || sortKey === 'version_number') {
        return ((Number(a[sortKey]) || 0) - (Number(b[sortKey]) || 0)) * dir;
      }
      if (sortKey === 'created_at') {
        return (new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()) * dir;
      }
      return String(a.file_name || '').localeCompare(String(b.file_name || '')) * dir;
    });
  }, [files, colFilter, sortKey, sortAsc]);

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: '', label: '', items: rows }];
    const m = new Map<string, ManagedFile[]>();
    for (const f of rows) {
      const raw = f[groupBy];
      const key = raw == null || raw === '' ? '—' : String(raw);
      const cur = m.get(key) || [];
      cur.push(f);
      m.set(key, cur);
    }
    return [...m.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([key, items]) => ({ key, label: key, items }));
  }, [rows, groupBy]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortAsc((s) => !s);
    else { setSortKey(k); setSortAsc(k === 'file_name'); }
  };

  const clearFilters = () => {
    setQ(''); setKindFilter(''); setCategoryFilter('');
    setActiveProject(projectId || ''); setActiveFolder(null);
    setColFilter({ name: '', folder: '', category: '', by: '' });
  };

  const filtersActive =
    !!q || !!kindFilter || !!categoryFilter || activeFolder !== null ||
    (!projectId && !!activeProject) ||
    Object.values(colFilter).some(Boolean);

  const inputStyle: React.CSSProperties = {
    width: '100%', background: SUNK, border: `1px solid ${BORDER}`, borderRadius: 6,
    color: TEXT, fontSize: 11, padding: '4px 7px', outline: 'none',
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left', fontSize: 10, fontWeight: 800, color: DIM, letterSpacing: 0.4,
    textTransform: 'uppercase', padding: '9px 10px', borderBottom: `1px solid ${BORDER}`,
    whiteSpace: 'nowrap', userSelect: 'none',
  };

  const SortTh = ({ k, children, width }: { k: SortKey; children: React.ReactNode; width?: number }) => (
    <th style={{ ...thStyle, width, cursor: 'pointer' }} onClick={() => toggleSort(k)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: sortKey === k ? GOLD : DIM }}>
        {children}
        {sortKey === k && <ArrowsDownUp size={10} weight="bold" />}
      </span>
    </th>
  );

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setDragging(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { e.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) setDragging(false); }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (e.dataTransfer?.files?.length) upload(e.dataTransfer.files);
      }}
      style={{ position: 'relative', display: 'grid', gridTemplateColumns: '236px minmax(0,1fr) 320px', gap: 14, alignItems: 'start' }}
    >
      {dragging && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 40, borderRadius: 14,
          border: `2px dashed ${GOLD}`, background: 'rgba(245,158,11,0.10)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 8, pointerEvents: 'none', backdropFilter: 'blur(2px)',
        }}>
          <UploadSimple size={30} weight="bold" color={GOLD} />
          <div style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>
            Drop to upload{activeFolder ? ` into ${activeFolder}` : ''}
          </div>
        </div>
      )}

      {/* ── Cabinet ─────────────────────────────────────────────── */}
      <aside style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 10, maxHeight: 680, overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 4px 8px' }}>
          Projects
        </div>

        <button
          type="button"
          onClick={() => { setActiveProject(projectId || ''); setActiveFolder(null); }}
          style={{
            width: '100%', textAlign: 'left', background: !activeProject && activeFolder === null ? 'rgba(245,158,11,0.14)' : 'transparent',
            border: 'none', borderRadius: 7, padding: '7px 8px', cursor: 'pointer',
            color: !activeProject && activeFolder === null ? GOLD : TEXT, fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Stack size={13} weight="bold" /> All documents
          </span>
          <span style={{ fontSize: 10, color: DIM, fontWeight: 700 }}>{totals.files}</span>
        </button>

        {tree.map((p) => {
          const open = expanded[p.value] ?? p.value === activeProject;
          const isActive = activeProject === p.value && activeFolder === null;
          return (
            <div key={p.value || 'unassigned'} style={{ marginTop: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  type="button"
                  aria-label={open ? 'Collapse' : 'Expand'}
                  onClick={() => setExpanded((s) => ({ ...s, [p.value]: !open }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 2px 6px 4px', color: DIM, display: 'flex' }}
                >
                  {open ? <CaretDown size={11} weight="bold" /> : <CaretRight size={11} weight="bold" />}
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveProject(p.value); setActiveFolder(null); setExpanded((s) => ({ ...s, [p.value]: true })); }}
                  style={{
                    flex: 1, textAlign: 'left', background: isActive ? 'rgba(245,158,11,0.14)' : 'transparent',
                    border: 'none', borderRadius: 7, padding: '6px 8px', cursor: 'pointer',
                    color: isActive ? GOLD : TEXT, fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                  <span style={{ fontSize: 10, color: DIM, fontWeight: 700 }}>{p.count}</span>
                </button>
              </div>

              {open && p.folders.map((fo) => {
                const on = activeProject === p.value && activeFolder === fo.value;
                return (
                  <button
                    key={`${p.value}:${fo.value}`}
                    type="button"
                    onClick={() => { setActiveProject(p.value); setActiveFolder(fo.value); }}
                    style={{
                      width: 'calc(100% - 18px)', marginLeft: 18, textAlign: 'left',
                      background: on ? 'rgba(245,158,11,0.14)' : 'transparent', border: 'none',
                      borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: on ? GOLD : DIM,
                      fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', gap: 6, minWidth: 0,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                      {on ? <FolderOpen size={12} weight="fill" /> : <Folder size={12} weight="regular" />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fo.label}</span>
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700 }}>{fo.count}</span>
                  </button>
                );
              })}
            </div>
          );
        })}

        {!loading && tree.length === 0 && (
          <div style={{ fontSize: 11, color: DIM, padding: '10px 6px' }}>No documents yet.</div>
        )}
      </aside>

      {/* ── Drawer ──────────────────────────────────────────────── */}
      <section style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: 10, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ position: 'relative', flex: '1 1 210px', minWidth: 170 }}>
            <MagnifyingGlass size={13} weight="bold" color={DIM} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, folder, category, uploader"
              style={{ ...inputStyle, padding: '7px 9px 7px 27px', fontSize: 12 }}
            />
          </div>

          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '7px 8px', fontSize: 12 }}>
            <option value="">All types</option>
            {kinds.map((k) => <option key={k.value} value={k.value}>{k.label} ({k.count})</option>)}
          </select>

          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '7px 8px', fontSize: 12 }}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.value} value={c.value}>{c.label} ({c.count})</option>)}
          </select>

          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} style={{ ...inputStyle, width: 'auto', padding: '7px 8px', fontSize: 12 }}>
            {GROUPS.map((g) => <option key={g.key} value={g.key}>Group: {g.label}</option>)}
          </select>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: DIM, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={showAllVersions} onChange={(e) => setShowAllVersions(e.target.checked)} style={{ accentColor: GOLD }} />
            Show superseded
          </label>

          {filtersActive && (
            <button type="button" onClick={clearFilters} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, fontSize: 11, fontWeight: 700, padding: '6px 9px', cursor: 'pointer' }}>
              Clear
            </button>
          )}

          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, background: GOLD, border: 'none',
              borderRadius: 7, color: '#1a1206', fontSize: 12, fontWeight: 800,
              padding: '7px 12px', cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.6 : 1,
            }}
          >
            <UploadSimple size={13} weight="bold" /> {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>

        {uploadMsg && (
          <div style={{ padding: '7px 12px', fontSize: 11.5, color: DIM, borderBottom: `1px solid ${BORDER}`, background: SUNK }}>
            {uploadMsg}
          </div>
        )}

        {picked.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '8px 12px', borderBottom: `1px solid ${BORDER}`,
            background: 'rgba(245,158,11,0.10)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: GOLD }}>
              {picked.size} selected
            </span>
            <span style={{ fontSize: 11, color: DIM }}>
              {bytes(files.filter((f) => picked.has(f.id)).reduce((s, f) => s + (Number(f.file_size) || 0), 0))}
            </span>

            <span style={{ flex: 1 }} />

            {bulkBusy ? (
              <span style={{ fontSize: 11.5, color: DIM, fontWeight: 700 }}>{bulkBusy}…</span>
            ) : (
              <>
                <button type="button" onClick={bulkOpen}
                  style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 11, fontWeight: 700, padding: '5px 9px', cursor: 'pointer' }}>
                  Open all
                </button>

                <select
                  aria-label="Move selected to folder"
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value;
                    e.target.value = '';
                    if (v === '__new') {
                      const name = window.prompt('Move to which folder?');
                      if (name && name.trim()) void bulkPatch({ folder: name.trim() }, `Moved to ${name.trim()}`);
                    } else if (v) {
                      void bulkPatch({ folder: v === '__unfiled' ? '' : v }, `Moved to ${v === '__unfiled' ? 'Unfiled' : v}`);
                    }
                  }}
                  style={{ ...inputStyle, width: 'auto', padding: '5px 7px', fontSize: 11 }}
                >
                  <option value="">Move to…</option>
                  {[...new Set(files.map((f) => f.folder).filter((f): f is string => !!f))].map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                  <option value="__unfiled">Unfiled</option>
                  <option value="__new">New folder…</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Move ${picked.size} file${picked.size === 1 ? '' : 's'} to trash? They stay restorable.`)) void bulkDelete();
                  }}
                  style={{ background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.45)', borderRadius: 6, color: '#FCA5A5', fontSize: 11, fontWeight: 700, padding: '5px 9px', cursor: 'pointer' }}
                >
                  Trash
                </button>

                <button type="button" onClick={() => setPicked(new Set())}
                  style={{ background: 'none', border: 'none', color: DIM, fontSize: 11, fontWeight: 700, padding: '5px 4px', cursor: 'pointer' }}>
                  Clear
                </button>
              </>
            )}
          </div>
        )}

        <div style={{ maxHeight: 610, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#141a22' }}>
              <tr>
                <th style={{ ...thStyle, width: 30, paddingRight: 0 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all shown"
                    checked={rows.length > 0 && rows.every((r) => picked.has(r.id))}
                    ref={(el) => { if (el) el.indeterminate = picked.size > 0 && !rows.every((r) => picked.has(r.id)); }}
                    onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                    style={{ accentColor: GOLD, cursor: 'pointer' }}
                  />
                </th>
                <SortTh k="file_name">Document</SortTh>
                <th style={{ ...thStyle, width: 74 }}>Ext</th>
                <SortTh k="version_number" width={66}>Rev</SortTh>
                <th style={{ ...thStyle, width: 150 }}>Folder</th>
                <th style={{ ...thStyle, width: 130 }}>Category</th>
                <SortTh k="file_size" width={86}>Size</SortTh>
                <th style={{ ...thStyle, width: 130 }}>Uploaded by</th>
                <SortTh k="created_at" width={110}>Date</SortTh>
              </tr>
              <tr>
                <th style={{ borderBottom: `1px solid ${BORDER}` }} />
                <th style={{ padding: '5px 8px', borderBottom: `1px solid ${BORDER}` }}>
                  <input value={colFilter.name} onChange={(e) => setColFilter((s) => ({ ...s, name: e.target.value }))} placeholder="Filter…" style={inputStyle} />
                </th>
                <th style={{ borderBottom: `1px solid ${BORDER}` }} />
                <th style={{ borderBottom: `1px solid ${BORDER}` }} />
                <th style={{ padding: '5px 8px', borderBottom: `1px solid ${BORDER}` }}>
                  <input value={colFilter.folder} onChange={(e) => setColFilter((s) => ({ ...s, folder: e.target.value }))} placeholder="Filter…" style={inputStyle} />
                </th>
                <th style={{ padding: '5px 8px', borderBottom: `1px solid ${BORDER}` }}>
                  <input value={colFilter.category} onChange={(e) => setColFilter((s) => ({ ...s, category: e.target.value }))} placeholder="Filter…" style={inputStyle} />
                </th>
                <th style={{ borderBottom: `1px solid ${BORDER}` }} />
                <th style={{ padding: '5px 8px', borderBottom: `1px solid ${BORDER}` }}>
                  <input value={colFilter.by} onChange={(e) => setColFilter((s) => ({ ...s, by: e.target.value }))} placeholder="Filter…" style={inputStyle} />
                </th>
                <th style={{ borderBottom: `1px solid ${BORDER}` }} />
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr><td colSpan={9} style={{ padding: 26, textAlign: 'center', color: DIM, fontSize: 12 }}>Loading documents…</td></tr>
              )}

              {!loading && error && (
                <tr><td colSpan={9} style={{ padding: 22, textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#ef4444', fontSize: 12.5, fontWeight: 600 }}>
                    <WarningCircle size={16} weight="fill" /> {error}
                  </div>
                  <div><button type="button" onClick={load} style={{ marginTop: 10, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: GOLD, fontSize: 11.5, fontWeight: 700, padding: '5px 12px', cursor: 'pointer' }}>Retry</button></div>
                </td></tr>
              )}

              {!loading && !error && rows.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', color: DIM, fontSize: 12.5 }}>
                  {filtersActive ? 'No documents match these filters.' : 'No documents yet — drop files anywhere on this panel to upload.'}
                </td></tr>
              )}

              {!loading && !error && grouped.map((g) => (
                <React.Fragment key={g.key || 'all'}>
                  {groupBy !== 'none' && (
                    <tr>
                      <td colSpan={9} style={{ padding: '7px 10px', background: SUNK, borderBottom: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 800, color: GOLD, letterSpacing: 0.3 }}>
                        {g.label} <span style={{ color: DIM, fontWeight: 700 }}>· {g.items.length}</span>
                      </td>
                    </tr>
                  )}
                  {g.items.map((f) => {
                    const on = selected?.id === f.id;
                    return (
                      <tr
                        key={f.id}
                        onClick={() => select(f)}
                        onDoubleClick={() => { if (isPdf(f)) openPdf({ url: openUrl(f), title: f.file_name || 'Document' }); else if (openUrl(f)) window.open(openUrl(f), '_blank', 'noopener'); }}
                        style={{ cursor: 'pointer', background: on ? 'rgba(245,158,11,0.10)' : 'transparent', borderBottom: `1px solid ${BORDER}` }}
                      >
                        <td style={{ padding: '8px 4px 8px 10px' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${f.file_name || 'file'}`}
                            checked={picked.has(f.id)}
                            onChange={() => togglePick(f.id)}
                            style={{ accentColor: GOLD, cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 12.5, color: TEXT, fontWeight: 600, minWidth: 0 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                            <KindIcon f={f} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340 }}>
                              {f.file_name || 'Untitled'}
                            </span>
                            {f.is_current === false && (
                              <span style={{ fontSize: 9, fontWeight: 800, color: DIM, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                                superseded
                              </span>
                            )}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 10.5, color: DIM, fontWeight: 700 }}>{ext(f)}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11.5, color: DIM, fontWeight: 700 }}>v{f.version_number ?? 1}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11.5, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{f.folder || '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11.5, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{f.category || '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11.5, color: DIM, whiteSpace: 'nowrap' }}>{bytes(f.file_size)}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11.5, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{f.uploaded_by_name || '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11.5, color: DIM, whiteSpace: 'nowrap' }}>{day(f.created_at)}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '7px 12px', borderTop: `1px solid ${BORDER}`, fontSize: 11, color: DIM, display: 'flex', justifyContent: 'space-between' }}>
          <span>{rows.length} shown{files.length !== rows.length ? ` of ${files.length} loaded` : ''}</span>
          <span>{totals.files} files · {bytes(totals.bytes)} stored</span>
        </div>
      </section>

      {/* ── The file itself ─────────────────────────────────────── */}
      <aside style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 12, maxHeight: 680, overflowY: 'auto' }}>
        {!selected && (
          <div style={{ color: DIM, fontSize: 12, textAlign: 'center', padding: '38px 10px', lineHeight: 1.6 }}>
            <Files size={26} weight="duotone" color={DIM} />
            <div style={{ marginTop: 10, fontWeight: 700 }}>Select a document</div>
            <div style={{ marginTop: 4, fontSize: 11 }}>Click a row for details and revision history. Double-click to open it.</div>
          </div>
        )}

        {selected && (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
              <KindIcon f={selected} size={18} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, wordBreak: 'break-word', lineHeight: 1.35 }}>
                  {selected.file_name || 'Untitled'}
                </div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
                  {selected.project_name || 'Unassigned project'}
                </div>
              </div>
              <button type="button" aria-label="Close details" onClick={() => { setSelected(null); setVersions(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: DIM, padding: 2, display: 'flex' }}>
                <X size={14} weight="bold" />
              </button>
            </div>

            {isImage(selected) && openUrl(selected) && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={openUrl(selected)}
                alt={selected.file_name || 'Preview'}
                style={{ width: '100%', borderRadius: 8, border: `1px solid ${BORDER}`, marginBottom: 10, display: 'block', background: SUNK }}
              />
            )}

            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => { if (isPdf(selected)) openPdf({ url: openUrl(selected), title: selected.file_name || 'Document' }); else window.open(openUrl(selected), '_blank', 'noopener'); }}
                disabled={!openUrl(selected)}
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: GOLD, border: 'none', borderRadius: 7, color: '#1a1206', fontSize: 11.5, fontWeight: 800, padding: '7px 10px', cursor: 'pointer' }}
              >
                <ArrowSquareOut size={12} weight="bold" /> Open
              </button>
              <button
                type="button"
                onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}${openUrl(selected)}`); setUploadMsg('Link copied'); }}
                disabled={!openUrl(selected)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 7, color: DIM, fontSize: 11.5, fontWeight: 700, padding: '7px 10px', cursor: 'pointer' }}
              >
                <Copy size={12} weight="bold" /> Link
              </button>
            </div>

            <div style={{ fontSize: 10, fontWeight: 800, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Attributes
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
              <tbody>
                {([
                  ['Revision', `v${selected.version_number ?? 1}${selected.is_current === false ? ' (superseded)' : ''}`],
                  ['Folder', selected.folder || 'Unfiled'],
                  ['Category', selected.category || 'Uncategorised'],
                  ['Type', selected.mime_type || selected.file_type || ext(selected)],
                  ['Size', bytes(selected.file_size)],
                  ['Dimensions', selected.width && selected.height ? `${selected.width} × ${selected.height}` : null],
                  ['Duration', selected.duration_seconds ? `${Math.round(Number(selected.duration_seconds))}s` : null],
                  ['Uploaded by', selected.uploaded_by_name || '—'],
                  ['Uploaded', day(selected.created_at)],
                  ['Attached to', selected.entity_type ? `${selected.entity_type}` : null],
                  ['Checksum', selected.file_hash ? String(selected.file_hash).slice(0, 16) + '…' : null],
                ] as [string, string | null][])
                  .filter(([, v]) => v != null && v !== '')
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: '4px 0', fontSize: 11, color: DIM, whiteSpace: 'nowrap', verticalAlign: 'top', width: 96 }}>{k}</td>
                      <td style={{ padding: '4px 0', fontSize: 11.5, color: TEXT, fontWeight: 600, wordBreak: 'break-word' }}>{v}</td>
                    </tr>
                  ))}
              </tbody>
            </table>

            <div style={{ fontSize: 10, fontWeight: 800, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
              <ClockCounterClockwise size={12} weight="bold" /> Revision history
            </div>

            {versionsLoading && <div style={{ fontSize: 11.5, color: DIM }}>Loading history…</div>}

            {!versionsLoading && versions && versions.length <= 1 && (
              <div style={{ fontSize: 11.5, color: DIM }}>
                One revision. Uploading a file that supersedes this one will build the chain here.
              </div>
            )}

            {!versionsLoading && versions && versions.length > 1 && versions.map((v) => {
              const on = v.id === selected.id;
              const current = versions.find((x) => x.is_current) || versions[0];
              const canCompare = !on && isPdf(v) && isPdf(selected) && !!openUrl(v) && !!openUrl(selected);
              return (
                <div
                  key={v.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: on ? 'rgba(245,158,11,0.12)' : 'transparent',
                    border: `1px solid ${on ? 'rgba(245,158,11,0.35)' : BORDER}`, borderRadius: 7,
                    padding: '5px 6px', marginBottom: 5,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => select(v)}
                    style={{
                      flex: 1, minWidth: 0, textAlign: 'left', display: 'flex', alignItems: 'center',
                      gap: 8, background: 'none', border: 'none', padding: '1px 2px', cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800, color: on ? GOLD : TEXT, minWidth: 26 }}>v{v.version_number ?? 1}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {day(v.created_at)} · {bytes(v.file_size)}
                    </span>
                    {v.is_current && <span style={{ fontSize: 9, fontWeight: 800, color: '#3dd68c' }}>CURRENT</span>}
                  </button>

                  {/* Two revisions open in one window, sharing zoom and page, so
                      "what changed on sheet 4" is a glance instead of a memory
                      test between two browser tabs. */}
                  {canCompare && (
                    <button
                      type="button"
                      title={`Compare v${v.version_number ?? 1} against v${current.version_number ?? 1}`}
                      onClick={() =>
                        openPdf({
                          url: openUrl(current),
                          title: `${current.file_name || 'Document'} — v${current.version_number ?? 1}`,
                          compareUrl: openUrl(v),
                          compareTitle: `v${v.version_number ?? 1} · ${day(v.created_at)}`,
                        })
                      }
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                        background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6,
                        color: DIM, fontSize: 10, fontWeight: 800, padding: '4px 7px', cursor: 'pointer',
                      }}
                    >
                      <ArrowsLeftRight size={11} weight="bold" /> Compare
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </aside>
    </div>
  );
}
