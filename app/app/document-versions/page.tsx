'use client';
/**
 * Document Versions — version control for contracts, drawings, specs and
 * submittals. Pass 4 on the kit.
 *
 * Anatomy: title + one primary action (New Document; Bulk Upload secondary)
 * → StatRow (documents / approved / under review / drafts / checked out /
 * last activity — tiles filter the register) → Toolbar (search, category)
 * → the register as a kit DataTable with History / Compare / Upload Version /
 * Check Out / Metadata / Access row actions. Every dialog is a FormModal; the
 * slip-sheet revision overlay stays full-screen.
 *
 * Every read / write is the one this screen already used:
 *   list      GET    /api/documents/versions
 *   upload    POST   /api/documents/versions/upload-url → storage → POST /api/documents/versions
 *   lock      POST   /api/documents/versions/checkout   { documentId, action }
 *   workflow  POST   /api/documents/versions/approve    { documentId, versionId, action }
 *   access    POST / DELETE /api/documents/versions/access
 *   download  POST   /api/documents/versions/download   { versionId }
 *   edit      PATCH  /api/documents/versions/[id]       { name, description, category, tags, projectId }
 *   archive   DELETE /api/documents/versions/[id]       (status → Archived; restore = PATCH { restore: true })
 *   archived  GET    /api/documents/versions?archived=1
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { openPdf } from '@/components/PdfViewer';
import { useProjects } from '@/lib/hooks/useProjects';
import { humanError } from '@/lib/errors';
import {
  UploadSimple, ClockCounterClockwise, ArrowsLeftRight, Info, Users,
  LockSimple, LockSimpleOpen, DownloadSimple, CheckCircle, PaperPlaneTilt, Plus, X,
  MagnifyingGlass, FileText, Trash, Files, Fingerprint, WarningCircle, ArrowsClockwise,
  PencilSimple, Archive, ArrowCounterClockwise,
} from '@phosphor-icons/react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { getAuthHeaders, getSupabaseBrowser } from '@/lib/supabase-browser';
import RevisionCompare, { overlaySupported } from '@/components/drawings/RevisionCompare';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState,
  FormModal, Field, Input, Textarea, Select, FormGrid, DetailList, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';

// The private `documents` bucket enforces this MIME allow-list on upload.
const ACCEPT = [
  '.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx',
  'application/pdf', 'image/png', 'image/jpeg', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

// ─── Types (mirror the /api/documents/versions response) ──────────
type DocStatus = 'Draft' | 'Under Review' | 'Approved' | 'Superseded' | 'Archived';

type DocVersion = {
  id: string;
  version: number;
  versionLabel: string;
  revisionCode: string;
  uploadedBy: string;
  uploadedAt: string;
  fileName: string;
  fileSize: number | null;
  fileType: string | null;
  checksum: string | null;
  revisionNotes: string;
  status: DocStatus;
  approvedBy: string | null;
  approvedAt: string | null;
};

type AccessEntry = { userId: string; name: string; role: 'viewer' | 'editor' | 'admin' };

type Document = {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  projectId: string | null;
  project: string;
  currentVersion: string;
  currentVersionNumber: number;
  lastModified: string;
  modifiedBy: string;
  status: DocStatus;
  checkedOutBy: string | null;
  checkedOutById: string | null;
  checkedOutAt: string | null;
  createdAt: string;
  versions: DocVersion[];
  access: AccessEntry[];
};

type ProjectOpt = { id: string; name: string };
type ModalView = 'none' | 'upload' | 'history' | 'compare' | 'metadata' | 'access' | 'bulk' | 'edit';
type StatusFilter = 'all' | DocStatus | 'checkedOut';

const CATEGORIES = ['All', 'Contracts', 'Drawings', 'Specs', 'Submittals', 'RFIs', 'Change Orders', 'Safety', 'Uncategorized'];
const UPLOAD_CATS = CATEGORIES.filter((c) => c !== 'All');

/** One status → one badge. Draft neutral, Under Review amber, Approved green, Superseded grey. */
const STATUS_TONE: Record<DocStatus, BadgeTone> = { Draft: 'neutral', 'Under Review': 'under_contract', Approved: 'ongoing', Superseded: 'closed', Archived: 'closed' };
const STATUS_RANK: Record<string, number> = { 'Under Review': 0, Draft: 1, Approved: 2, Superseded: 3, Archived: 4 };

// ─── Helpers ──────────────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtBytes(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
async function sha256hex(buf: ArrayBuffer): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

const CSS = `
.dvWs > .k-page { max-width: none; }
.dvDoc { display: flex; flex-direction: column; gap: 3px; max-width: 420px; min-width: 0; }
.dvDoc > b { color: var(--text-primary); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dvDocMeta { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: var(--fs-xs); color: var(--text-tertiary); }
.dvDocNote { font-size: var(--fs-xs); color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dvMono { font-family: ui-monospace, monospace; font-size: var(--fs-sm); color: var(--text-secondary); font-weight: 700; }
.dvMuted { color: var(--text-tertiary); }
.dvWs .k-table tbody tr[data-locked="true"] td:first-child { box-shadow: inset 3px 0 0 var(--status-overdue); }
.dvFile { display: flex; gap: 8px; align-items: center; }
.dvFile .k-input { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default; }
.dvNext { padding: 10px 12px; border-radius: var(--radius-sm); background: var(--bg-surface-2); border: 1px solid var(--border-subtle); border-left: 3px solid var(--brand-primary); font-size: var(--fs-xs); color: var(--text-tertiary); }
.dvNext b { color: var(--text-primary); }
.dvTimeline { position: relative; padding-left: 24px; }
.dvTimeline::before { content: ''; position: absolute; left: 8px; top: 4px; bottom: 4px; width: 2px; background: var(--border-default); }
.dvVer { position: relative; padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid var(--border-subtle); }
.dvVer:last-child { border-bottom: 0; margin-bottom: 0; padding-bottom: 0; }
.dvVer::before { content: ''; position: absolute; left: -20px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: var(--border-default); border: 2px solid var(--bg-solid); }
.dvVer[data-latest="true"]::before { background: var(--info-fg); }
.dvVerHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.dvVerTitle { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.dvVerTitle b { font-family: ui-monospace, monospace; font-size: var(--fs-md); color: var(--text-primary); }
.dvVerTitle span { font-family: ui-monospace, monospace; font-size: var(--fs-xs); color: var(--text-tertiary); }
.dvVerMeta { font-size: var(--fs-xs); color: var(--text-tertiary); margin-bottom: 4px; line-height: 1.5; }
.dvVerMeta b { color: var(--text-primary); font-weight: 600; }
.dvVerActions { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.dvVerify { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border-radius: var(--radius-sm); font-size: var(--fs-sm); color: var(--text-primary); margin-bottom: 14px; }
.dvVerify[data-same="true"] { background: rgba(74,222,128,.08); border: 1px solid rgba(74,222,128,.3); }
.dvVerify[data-same="false"] { background: rgba(251,191,36,.08); border: 1px solid rgba(251,191,36,.35); }
.dvVerify > svg { flex-shrink: 0; }
.dvVerify[data-same="true"] > svg { color: var(--status-ongoing); }
.dvVerify[data-same="false"] > svg { color: var(--status-under-contract); }
.dvCmp { border: 1px solid var(--border-default); border-radius: var(--radius-sm); overflow: hidden; }
.dvCmpRow { display: grid; grid-template-columns: 1fr 1.2fr 1.2fr; gap: 8px; padding: 8px 12px; font-size: var(--fs-xs); border-top: 1px solid var(--border-subtle); }
.dvCmpRow:first-child { border-top: 0; background: var(--bg-solid-2); font-weight: 700; color: var(--text-tertiary); }
.dvCmpRow > span { word-break: break-word; min-width: 0; }
.dvCmpRow > span:first-child { color: var(--text-tertiary); }
.dvCmpRow[data-diff="true"] > span + span { color: var(--text-primary); }
.dvCmpRow[data-diff="false"] > span + span { color: var(--text-tertiary); }
.dvCmpRow[data-diff="true"] > span:last-child { font-weight: 600; }
.dvCmpFoot { display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end; flex-wrap: wrap; }
.dvGrant { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 12px; background: var(--bg-surface-2); border-radius: var(--radius-sm); margin-bottom: 4px; border: 1px solid var(--border-subtle); }
.dvGrantRow { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
.dvGrantRow > :first-child { flex: 1 1 200px; }
.dvBulk { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 6px 12px; background: var(--bg-surface-2); border-radius: var(--radius-sm); margin-bottom: 4px; border: 1px solid var(--border-subtle); font-size: var(--fs-sm); color: var(--text-primary); }
.dvBulk > span { display: flex; align-items: center; gap: 6px; min-width: 0; }
.dvBulk > span > span:first-of-type { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dvBulkEmpty { text-align: center; padding: 28px; color: var(--text-tertiary); font-size: var(--fs-sm); border: 1px dashed var(--border-strong); border-radius: var(--radius-sm); margin-bottom: 16px; }
.dvSection { font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); margin-bottom: 8px; }
.dvOverlay { position: fixed; inset: 0; z-index: 1100; background: var(--bg-base); display: flex; flex-direction: column; }
.dvOverlayBar { display: flex; align-items: center; gap: 14px; padding: 10px 16px; background: var(--bg-solid); border-bottom: 1px solid var(--border-default); flex-wrap: wrap; }
.dvOverlayTitle { font-size: var(--fs-md); font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
.dvOverlaySub { font-size: var(--fs-xs); color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dvOverlayCtl { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap; }
.dvOverlayCtl select.k-select { width: auto; min-width: 190px; }
.dvRevA { font-size: var(--fs-xs); font-weight: 700; color: var(--status-overdue); }
.dvRevB { font-size: var(--fs-xs); font-weight: 700; color: var(--status-lead); }
.dvOverlayBody { flex: 1; min-height: 0; position: relative; }
.dvCenter { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.dvSpin { width: 32px; height: 32px; border: 3px solid var(--border-default); border-top-color: var(--brand-primary); border-radius: 50%; animation: dvspin 1s linear infinite; margin: 0 auto 12px; }
@keyframes dvspin { to { transform: rotate(360deg); } }
@media (max-width: 640px) {
  .dvWs .k-btn, .dvWs .k-stat, .dvWs select.k-select, .dvWs .k-input { min-height: 44px; }
  .dvWs .k-table td { height: 48px; }
  .dvDoc { max-width: 220px; }
}
`;

// ─── Component ────────────────────────────────────────────────────
export default function DocumentVersionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [modalView, setModalView] = useState<ModalView>('none');
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');

  // upload form
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadCategory, setUploadCategory] = useState('Uncategorized');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadProjectId, setUploadProjectId] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // bulk
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkCategory, setBulkCategory] = useState('Uncategorized');
  const [bulkProjectId, setBulkProjectId] = useState('');

  // access
  const [accessEmail, setAccessEmail] = useState('');
  const [accessRole, setAccessRole] = useState<'viewer' | 'editor' | 'admin'>('viewer');

  // edit details (PATCH /api/documents/versions/[id]) — pre-filled from the saved document
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('Uncategorized');
  const [editTags, setEditTags] = useState('');
  const [editProjectId, setEditProjectId] = useState('');

  // archive — archived documents leave the register; the Archived view lists them for restore
  const [archivedDocs, setArchivedDocs] = useState<Document[] | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);

  // revision overlay (Bluebeam-style slip-sheet compare)
  const [overlay, setOverlay] = useState<{ doc: Document; aId: string; bId: string } | null>(null);
  const [overlayUrls, setOverlayUrls] = useState<{ a: string; b: string } | null>(null);
  const [overlayErr, setOverlayErr] = useState('');

  const { toast, show } = useToast(3200);
  const showToast = useCallback((msg: string, err?: boolean) => { show(msg, err ? 'bad' : 'good'); }, [show]);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  // ─ Data loaders ─
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await getAuthHeaders();
      const r = await fetch('/api/documents/versions', { headers: h, cache: 'no-store' });
      if (r.status === 401) { setError('You must be signed in to view documents.'); setDocuments([]); return; }
      if (!r.ok) { const body = await r.json().catch(() => ({})); console.error('load document versions failed', r.status, body?.error); throw new Error(body?.error || 'Request failed'); }
      const data = await r.json();
      setDocuments((data.documents || []) as Document[]);
    } catch (e: any) {
      console.error(e);
      setError(humanError(e, 'Failed to load documents. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const { projects: liveProjects } = useProjects();
  useEffect(() => {
    setProjects((liveProjects as any[]).map((p: any) => ({ id: p.id, name: p.name })));
  }, [liveProjects]);

  useEffect(() => { load(); }, [load]);

  /* The Archived view reads its own list (the register never includes them). */
  const loadArchived = useCallback(async () => {
    try {
      const h = await getAuthHeaders();
      const r = await fetch('/api/documents/versions?archived=1', { headers: h, cache: 'no-store' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Could not load archived documents');
      const data = await r.json();
      setArchivedDocs((data.documents || []) as Document[]);
    } catch (e: any) {
      setArchivedDocs([]);
      showToast(humanError(e, 'Could not load archived documents.'), true);
    }
  }, [showToast]);
  useEffect(() => { if (statusFilter === 'Archived') void loadArchived(); }, [statusFilter, loadArchived]);

  // Keep the open modal's doc in sync after a reload.
  useEffect(() => {
    if (selectedDoc) {
      const fresh = documents.find((d) => d.id === selectedDoc.id);
      if (fresh) setSelectedDoc(fresh);
    }
  }, [documents]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─ Filtering ─
  const filtered = useMemo(() => {
    let list = statusFilter === 'Archived' ? (archivedDocs ?? []) : documents;
    if (activeCategory !== 'All') list = list.filter((d) => d.category === activeCategory);
    if (statusFilter === 'checkedOut') list = list.filter((d) => !!d.checkedOutBy);
    else if (statusFilter !== 'all' && statusFilter !== 'Archived') list = list.filter((d) => d.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) =>
        d.title.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)) ||
        d.description.toLowerCase().includes(q) ||
        d.project.toLowerCase().includes(q),
      );
    }
    return list;
  }, [documents, archivedDocs, activeCategory, statusFilter, search]);

  const catCounts = useMemo(() => {
    const map: Record<string, number> = { All: documents.length };
    for (const d of documents) map[d.category] = (map[d.category] || 0) + 1;
    return map;
  }, [documents]);
  const filtersActive = !!search || activeCategory !== 'All' || statusFilter !== 'all';
  const clearFilters = () => { setSearch(''); setActiveCategory('All'); setStatusFilter('all'); };
  const toggleStatus = (s: StatusFilter) => setStatusFilter((prev) => (prev === s ? 'all' : s));

  // ─ Modal control ─
  const openModal = (doc: Document | null, view: ModalView) => {
    setSelectedDoc(doc);
    setModalView(view);
    setFormError('');
    if (view === 'compare' && doc && doc.versions.length >= 2) {
      setCompareA(doc.versions[doc.versions.length - 2].id);
      setCompareB(doc.versions[doc.versions.length - 1].id);
    }
    if (view === 'upload') {
      setUploadTitle(''); setUploadDesc('');
      setUploadCategory(doc ? doc.category : 'Uncategorized');
      setUploadTags(doc ? doc.tags.join(', ') : '');
      setUploadProjectId(doc ? doc.projectId || '' : '');
      setUploadNotes(''); setUploadFile(null);
    }
    if (view === 'bulk') { setBulkFiles([]); setBulkCategory('Uncategorized'); setBulkProjectId(''); }
    if (view === 'access') { setAccessEmail(''); setAccessRole('viewer'); }
    if (view === 'edit' && doc) {
      setEditTitle(doc.title); setEditDesc(doc.description || '');
      setEditCategory(doc.category || 'Uncategorized'); setEditTags(doc.tags.join(', '));
      setEditProjectId(doc.projectId || '');
    }
  };
  const closeModal = () => { setModalView('none'); setSelectedDoc(null); setUploadFile(null); setBulkFiles([]); setFormError(''); };

  // ─ Revision overlay control ─
  const canOverlayVersion = (v: DocVersion) => overlaySupported(v.fileName, v.fileType);

  /** Open the slip-sheet overlay for `targetId`, defaulting the other side to the previous version. */
  const openOverlay = (doc: Document, targetId: string) => {
    const idx = doc.versions.findIndex((v) => v.id === targetId);
    if (idx < 0 || !canOverlayVersion(doc.versions[idx])) return;
    const prev = [...doc.versions.slice(0, idx)].reverse().find(canOverlayVersion);
    const other = prev || doc.versions.slice(idx + 1).find(canOverlayVersion);
    if (!other) return;
    const target = doc.versions[idx];
    // A (red) = older revision, B (blue) = newer — deletions read red, additions blue
    const [va, vb] = target.version < other.version ? [target, other] : [other, target];
    setOverlay({ doc, aId: va.id, bId: vb.id });
  };

  // Resolve short-lived signed download URLs for the two revisions under compare.
  useEffect(() => {
    if (!overlay) { setOverlayUrls(null); setOverlayErr(''); return; }
    let dead = false;
    setOverlayUrls(null); setOverlayErr('');
    (async () => {
      try {
        const h = await getAuthHeaders();
        const sign = async (versionId: string): Promise<string> => {
          const r = await fetch('/api/documents/versions/download', {
            method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
            body: JSON.stringify({ versionId }),
          });
          if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Could not get a file link');
          return (await r.json()).url as string;
        };
        const [ua, ub] = await Promise.all([sign(overlay.aId), sign(overlay.bId)]);
        if (!dead) setOverlayUrls({ a: ua, b: ub });
      } catch (e: any) {
        if (!dead) setOverlayErr(humanError(e, 'Could not load the revision files for comparison.'));
      }
    })();
    return () => { dead = true; };
  }, [overlay]);

  // Esc closes the overlay.
  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOverlay(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay]);

  // ─ Core: upload a File to the private bucket via a signed upload URL ─
  async function uploadToBucket(file: File, documentId?: string) {
    const h = await getAuthHeaders();
    const urlRes = await fetch('/api/documents/versions/upload-url', {
      method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, documentId }),
    });
    if (!urlRes.ok) throw new Error((await urlRes.json().catch(() => ({})))?.error || 'Could not start upload');
    const { bucket, path, token } = await urlRes.json();

    const bytes = await file.arrayBuffer();
    const checksum = await sha256hex(bytes);

    const sb = getSupabaseBrowser();
    const { error: upErr } = await sb.storage.from(bucket).uploadToSignedUrl(path, token, file, {
      contentType: file.type || 'application/octet-stream',
    });
    if (upErr) throw new Error(upErr.message || 'Upload to storage failed');

    return { path, checksum, fileSize: file.size, fileType: file.type || null, fileName: file.name };
  }

  async function finalize(payload: Record<string, unknown>) {
    const h = await getAuthHeaders();
    const r = await fetch('/api/documents/versions', {
      method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Failed to save version');
    return r.json();
  }

  // ─ Handlers ─
  const handleUpload = async () => {
    if (!uploadFile) { setFormError('Please choose a file.'); return; }
    if (!selectedDoc && !uploadTitle.trim()) { setFormError('Title is required.'); return; }
    setBusy(true);
    setFormError('');
    try {
      const meta = await uploadToBucket(uploadFile, selectedDoc?.id);
      await finalize({
        documentId: selectedDoc?.id,
        path: meta.path, fileName: meta.fileName, fileSize: meta.fileSize,
        fileType: meta.fileType, checksum: meta.checksum, notes: uploadNotes,
        name: uploadTitle, description: uploadDesc, category: uploadCategory,
        tags: uploadTags.split(',').map((t) => t.trim()).filter(Boolean),
        projectId: uploadProjectId || null,
      });
      showToast(selectedDoc ? 'New version uploaded.' : `Document "${uploadTitle}" created.`);
      closeModal();
      await load();
    } catch (e: any) {
      setFormError(e?.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkUpload = async () => {
    if (bulkFiles.length === 0) { setFormError('Add at least one file.'); return; }
    setBusy(true);
    setFormError('');
    let ok = 0;
    const fails: string[] = [];
    for (const f of bulkFiles) {
      try {
        const meta = await uploadToBucket(f);
        await finalize({
          path: meta.path, fileName: meta.fileName, fileSize: meta.fileSize, fileType: meta.fileType,
          checksum: meta.checksum, name: f.name.replace(/\.[^.]+$/, ''), category: bulkCategory,
          projectId: bulkProjectId || null, notes: 'Bulk upload — initial version.',
        });
        ok += 1;
      } catch (e: any) {
        fails.push(`${f.name}: ${e?.message || 'failed'}`);
      }
    }
    setBusy(false);
    closeModal();
    await load();
    if (fails.length) showToast(`${ok} uploaded, ${fails.length} failed.`, true);
    else showToast(`${ok} document${ok !== 1 ? 's' : ''} uploaded.`);
  };

  const doCheckout = async (docId: string, action: 'checkout' | 'checkin') => {
    try {
      const h = await getAuthHeaders();
      const r = await fetch('/api/documents/versions/checkout', {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId, action }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Lock update failed');
      showToast(action === 'checkout' ? 'Document checked out.' : 'Document checked in.');
      await load();
    } catch (e: any) { showToast(e?.message || 'Lock update failed.', true); }
  };

  const doWorkflow = async (docId: string, versionId: string, action: 'submit' | 'approve') => {
    try {
      const h = await getAuthHeaders();
      const r = await fetch('/api/documents/versions/approve', {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId, versionId, action }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Action failed');
      showToast(action === 'approve' ? 'Version approved.' : 'Submitted for review.');
      await load();
    } catch (e: any) { showToast(e?.message || 'Action failed.', true); }
  };

  const addAccess = async () => {
    if (!accessEmail.trim() || !selectedDoc) return;
    try {
      const h = await getAuthHeaders();
      const r = await fetch('/api/documents/versions/access', {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: selectedDoc.id, grantee: accessEmail.trim(), role: accessRole }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Grant failed');
      setAccessEmail('');
      showToast(`Access granted to ${accessEmail.trim()}.`);
      await load();
    } catch (e: any) { showToast(e?.message || 'Grant failed.', true); }
  };

  const removeAccess = async (grantId: string) => {
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/documents/versions/access?grantId=${encodeURIComponent(grantId)}`, { method: 'DELETE', headers: h });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Revoke failed');
      showToast('Access removed.');
      await load();
    } catch (e: any) { showToast(e?.message || 'Revoke failed.', true); }
  };

  /* Edit the document's details — the same fields New Document asks for. */
  const saveDetails = async () => {
    if (!selectedDoc || busy) return;
    if (!editTitle.trim()) { setFormError('Document name is required.'); return; }
    setBusy(true); setFormError('');
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/documents/versions/${encodeURIComponent(selectedDoc.id)}`, {
        method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editTitle.trim(), description: editDesc.trim(), category: editCategory,
          tags: editTags.split(',').map((t) => t.trim()).filter(Boolean), projectId: editProjectId || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Could not save the document');
      closeModal();
      showToast('Document details saved.');
      await load();
    } catch (e: any) {
      setFormError(humanError(e, 'Could not save the document.'));
    } finally {
      setBusy(false);
    }
  };

  /* Archive — the soft delete for a controlled document. Versions, checksums
     and approvals stay; it leaves the register and can be restored. */
  const archiveDoc = async (doc: Document) => {
    const ok = await confirmDialog({
      title: `Archive "${doc.title}"?`,
      message: `It leaves the register. All ${doc.versions.length} version${doc.versions.length === 1 ? '' : 's'}, checksums and approvals are kept, and you can restore it from Status → Archived.`,
      confirmLabel: 'Archive',
      danger: true,
    });
    if (!ok) return;
    setArchiving(doc.id);
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/documents/versions/${encodeURIComponent(doc.id)}`, { method: 'DELETE', headers: h });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Could not archive the document');
      if (selectedDoc?.id === doc.id) closeModal();
      showToast(`"${doc.title}" archived.`);
      await load();
      if (archivedDocs) void loadArchived();
    } catch (e: any) {
      showToast(humanError(e, 'Could not archive the document.'), true);
    } finally {
      setArchiving(null);
    }
  };

  const restoreDoc = async (doc: Document) => {
    setArchiving(doc.id);
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/documents/versions/${encodeURIComponent(doc.id)}`, {
        method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ restore: true }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Could not restore the document');
      if (selectedDoc?.id === doc.id) closeModal();
      showToast(`"${doc.title}" is back on the register.`);
      await Promise.all([load(), loadArchived()]);
    } catch (e: any) {
      showToast(humanError(e, 'Could not restore the document.'), true);
    } finally {
      setArchiving(null);
    }
  };

  const download = async (ver: DocVersion) => {
    try {
      const h = await getAuthHeaders();
      const r = await fetch('/api/documents/versions/download', {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: ver.id }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Download failed');
      const { url } = await r.json();
      openPdf({ url, title: 'Document' });
    } catch (e: any) { showToast(e?.message || 'Download failed.', true); }
  };

  // ─── Stats ───
  const revisionCount = documents.reduce((s, d) => s + d.versions.length, 0);
  const approvedN = documents.filter((d) => d.status === 'Approved').length;
  const reviewN = documents.filter((d) => d.status === 'Under Review').length;
  const draftN = documents.filter((d) => d.status === 'Draft').length;
  const lockedDocs = documents.filter((d) => d.checkedOutBy);
  const lockedNames = Array.from(new Set(lockedDocs.map((d) => d.checkedOutBy as string)));
  const lastMod = documents.reduce<string | null>((acc, d) => (d.lastModified && (!acc || d.lastModified > acc) ? d.lastModified : acc), null);
  const stats: StatItem[] = loading
    ? ['Documents', 'Approved', 'Under Review', 'Drafts', 'Checked Out', 'Last Activity'].map((label) => ({ label, value: '—', sub: 'Loading…' }))
    : [
        { label: 'Documents', value: documents.length, sub: filtersActive ? 'Click to show everything' : `${revisionCount} revision${revisionCount === 1 ? '' : 's'} on file`, onClick: filtersActive ? clearFilters : undefined },
        { label: 'Approved', value: approvedN, tone: approvedN > 0 ? 'good' : 'default', sub: statusFilter === 'Approved' ? 'Filtered — click to clear' : 'Released & current', onClick: () => toggleStatus('Approved') },
        { label: 'Under Review', value: reviewN, tone: reviewN > 0 ? 'warn' : 'default', sub: statusFilter === 'Under Review' ? 'Filtered — click to clear' : 'Awaiting approval', onClick: () => toggleStatus('Under Review') },
        { label: 'Drafts', value: draftN, sub: statusFilter === 'Draft' ? 'Filtered — click to clear' : 'Not yet submitted', onClick: () => toggleStatus('Draft') },
        { label: 'Checked Out', value: lockedDocs.length, tone: lockedDocs.length > 0 ? 'bad' : 'default', sub: statusFilter === 'checkedOut' ? 'Filtered — click to clear' : lockedNames.length ? `Locked by ${lockedNames.slice(0, 2).join(', ')}${lockedNames.length > 2 ? '…' : ''}` : 'Nothing locked', onClick: () => toggleStatus('checkedOut') },
        { label: 'Last Activity', value: lastMod ? fmtDate(lastMod) : '—', sub: 'Most recent revision' },
      ];

  // ─── Register columns + actions ───
  const columns: Column<Document>[] = [
    { key: 'title', header: 'Document', accessor: (d) => d.title.toLowerCase(), render: (d) => (
      <div className="dvDoc">
        <b title={d.title}>{d.title}</b>
        <div className="dvDocMeta">
          <span>{d.project}</span>
          {d.tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}
          {d.checkedOutBy && <Badge tone="overdue"><LockSimple size={10} weight="fill" /> {d.checkedOutBy}</Badge>}
        </div>
        {d.versions.length > 0 && (
          <div className="dvDocNote">{d.versions.length} version{d.versions.length !== 1 ? 's' : ''}{d.versions[d.versions.length - 1]?.revisionNotes ? ` · latest: ${d.versions[d.versions.length - 1].revisionNotes}` : ''}</div>
        )}
      </div>
    ) },
    { key: 'category', phone: 'hide', header: 'Category', accessor: (d) => d.category, render: (d) => <span className="dvMuted">{d.category}</span> },
    { key: 'currentVersion', phone: 'show', header: 'Version', accessor: (d) => d.currentVersionNumber, render: (d) => <span className="dvMono">{d.currentVersion}</span> },
    { key: 'status', phone: 'show', header: 'Status', accessor: (d) => STATUS_RANK[d.status] ?? 9, render: (d) => <Badge tone={STATUS_TONE[d.status] ?? 'neutral'} dot>{d.status}</Badge> },
    { key: 'lastModified', header: 'Modified', accessor: (d) => d.lastModified || '', render: (d) => <div><div style={{ color: 'var(--text-primary)' }}>{fmtDate(d.lastModified)}</div><div className="dvMuted" style={{ fontSize: 'var(--fs-xs)' }}>{d.modifiedBy}</div></div> },
  ];
  const rowActions = (d: Document): Action[] => d.status === 'Archived' ? [
    { label: 'Version History', icon: <ClockCounterClockwise size={15} />, onClick: () => openModal(d, 'history') },
    { label: archiving === d.id ? 'Restoring…' : 'Restore', icon: <ArrowCounterClockwise size={15} />, onClick: () => restoreDoc(d), disabled: archiving === d.id },
  ] : [
    { label: 'Version History', icon: <ClockCounterClockwise size={15} />, onClick: () => openModal(d, 'history') },
    { label: 'Edit Details', icon: <PencilSimple size={15} />, onClick: () => openModal(d, 'edit') },
    { label: 'Compare Versions', icon: <ArrowsLeftRight size={15} />, onClick: () => openModal(d, 'compare'), hidden: d.versions.length < 2 },
    { label: 'Upload New Version', icon: <UploadSimple size={15} />, onClick: () => openModal(d, 'upload') },
    { label: d.checkedOutBy ? 'Check In' : 'Check Out', icon: d.checkedOutBy ? <LockSimple size={15} /> : <LockSimpleOpen size={15} />, onClick: () => doCheckout(d.id, d.checkedOutBy ? 'checkin' : 'checkout') },
    { label: 'Metadata', icon: <Info size={15} />, onClick: () => openModal(d, 'metadata') },
    { label: 'Access Control', icon: <Users size={15} />, onClick: () => openModal(d, 'access') },
    { label: archiving === d.id ? 'Archiving…' : 'Archive', icon: <Archive size={15} />, tone: 'danger', onClick: () => archiveDoc(d), disabled: archiving === d.id },
  ];

  // ─── Register body ───
  let body: React.ReactNode;
  if (!loading && error) {
    body = <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load documents" text={`${error} Nothing has been lost — try again.`} action={<Button icon={<ArrowsClockwise size={15} />} onClick={load}>Retry</Button>} />;
  } else if (!loading && documents.length === 0 && statusFilter !== 'Archived') {
    body = (
      <EmptyState
        icon={<FileText size={22} />}
        title="Nothing under version control yet"
        text="Contracts, drawings, specs, and submittals belong here. Every upload becomes v1; each revision after that is checksummed and comparable, approvals gate what's current, and check-out locks stop two people revising the same file."
        action={<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}><Button icon={<Plus size={15} weight="bold" />} onClick={() => openModal(null, 'upload')}>New Document</Button><Button icon={<Files size={15} weight="bold" />} onClick={() => openModal(null, 'bulk')}>Bulk Upload</Button><Button variant="ghost" icon={<Archive size={15} />} onClick={() => setStatusFilter('Archived')}>View Archived</Button></div>}
      />
    );
  } else {
    body = (
      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(d) => d.id}
        loading={loading}
        defaultSort={{ key: 'lastModified', dir: 'desc' }}
        onRowClick={(d) => openModal(d, 'history')}
        rowActions={rowActions}
        empty={<EmptyState icon={<MagnifyingGlass size={22} />} title="No documents match these filters" text="Clear the search, category, or status filter to see more." action={<Button onClick={clearFilters}>Clear Filters</Button>} />}
      />
    );
  }

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));
  const versionOptions = (doc: Document) => doc.versions.map((v) => ({ value: v.id, label: `${v.versionLabel} (${v.revisionCode})` }));

  return (
    <div className="dvWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Documents', href: '/app/documents' }, { label: 'Versions' }]}
        title="Document Versions"
        subtitle={`${documents.length} document${documents.length !== 1 ? 's' : ''} under version control — every revision checksummed, approvals tracked, check-outs locked.`}
        actions={
          <>
            <Button icon={<Files size={15} weight="bold" />} onClick={() => openModal(null, 'bulk')}>Bulk Upload</Button>
            <Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={() => openModal(null, 'upload')}>New Document</Button>
          </>
        }
      >
        {!error && <StatRow items={stats} />}

        {!loading && !error && (documents.length > 0 || statusFilter === 'Archived') && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by name, tags, description, or project…"
            filters={
              <>
                <Select aria-label="Category" value={activeCategory} onChange={(e) => setActiveCategory(e.target.value)} style={{ width: 'auto', minWidth: 170 }} options={CATEGORIES.map((c) => ({ value: c, label: c === 'All' ? `All Categories (${catCounts.All})` : `${c} (${catCounts[c] || 0})` }))} />
                <Select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={{ width: 'auto', minWidth: 150 }} options={[{ value: 'all', label: 'All Statuses' }, { value: 'Draft', label: 'Draft' }, { value: 'Under Review', label: 'Under Review' }, { value: 'Approved', label: 'Approved' }, { value: 'Superseded', label: 'Superseded' }, { value: 'checkedOut', label: 'Checked Out' }, { value: 'Archived', label: 'Archived' }]} />
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={<span className="dvMuted" style={{ fontSize: 'var(--fs-sm)' }}>{statusFilter === 'Archived' ? `${filtered.length} archived` : `${filtered.length} of ${documents.length}`}</span>}
          />
        )}

        <Card flush>{body}</Card>
      </PageShell>

      {/* ── History ── */}
      <FormModal
        open={modalView === 'history' && !!selectedDoc}
        onClose={closeModal}
        title="Version History"
        subtitle={selectedDoc?.title}
        footer={selectedDoc ? (selectedDoc.status === 'Archived' ? (
          <>
            <span className="dvMuted" style={{ marginRight: 'auto', alignSelf: 'center', fontSize: 'var(--fs-sm)' }}>Archived — not on the register.</span>
            <Button variant="ghost" onClick={closeModal}>Close</Button>
            <Button variant="primary" icon={<ArrowCounterClockwise size={15} />} onClick={() => restoreDoc(selectedDoc)} disabled={archiving === selectedDoc.id}>{archiving === selectedDoc.id ? 'Restoring…' : 'Restore'}</Button>
          </>
        ) : (
          <>
            <Button variant="danger" icon={<Archive size={15} />} style={{ marginRight: 'auto' }} onClick={() => archiveDoc(selectedDoc)} disabled={archiving === selectedDoc.id}>{archiving === selectedDoc.id ? 'Archiving…' : 'Archive'}</Button>
            <Button variant="ghost" onClick={closeModal}>Close</Button>
            <Button icon={<PencilSimple size={15} />} onClick={() => openModal(selectedDoc, 'edit')}>Edit Details</Button>
          </>
        )) : undefined}
      >
        {selectedDoc && (selectedDoc.versions.length === 0 ? (
          <div className="dvMuted" style={{ fontSize: 'var(--fs-sm)' }}>No versions yet.</div>
        ) : (
          <div className="dvTimeline">
            {[...selectedDoc.versions].reverse().map((ver, idx) => {
              const supported = canOverlayVersion(ver);
              const hasOther = selectedDoc.versions.some((v) => v.id !== ver.id && canOverlayVersion(v));
              const can = supported && hasOther;
              return (
                <div key={ver.id} className="dvVer" data-latest={idx === 0 ? 'true' : 'false'}>
                  <div className="dvVerHead">
                    <div style={{ minWidth: 0 }}>
                      <div className="dvVerTitle"><b>{ver.versionLabel}</b><span>{ver.revisionCode}</span><Badge tone={STATUS_TONE[ver.status] ?? 'neutral'}>{ver.status}</Badge>{idx === 0 && <Badge tone="gold">Current</Badge>}</div>
                      <div className="dvVerMeta">Uploaded by <b>{ver.uploadedBy}</b> on {fmtDateTime(ver.uploadedAt)} · {fmtBytes(ver.fileSize)}</div>
                      <div className="dvVerMeta"><b>Notes:</b> {ver.revisionNotes || '—'}</div>
                      {ver.checksum && <div className="dvVerMeta" style={{ fontFamily: 'ui-monospace, monospace', display: 'flex', alignItems: 'center', gap: 4 }}><Fingerprint size={12} /> {ver.checksum.slice(0, 16)}…</div>}
                      {ver.approvedBy && <div className="dvVerMeta" style={{ color: 'var(--status-ongoing)' }}>Approved by {ver.approvedBy} on {fmtDate(ver.approvedAt)}</div>}
                    </div>
                    <div className="dvVerActions">
                      <Button size="sm" icon={<ArrowsLeftRight size={13} weight="bold" />} disabled={!can} title={can ? 'Overlay this revision against another (previous revision by default) — red = removed, blue = added' : supported ? 'No other PDF or image revision to compare this one against' : 'Visual compare supports PDF, PNG, JPG and WebP files only'} onClick={() => openOverlay(selectedDoc, ver.id)}>Compare</Button>
                      <Button size="sm" icon={<DownloadSimple size={13} weight="bold" />} onClick={() => download(ver)}>Download</Button>
                      {ver.status === 'Draft' && <Button size="sm" icon={<PaperPlaneTilt size={13} weight="bold" />} onClick={() => doWorkflow(selectedDoc.id, ver.id, 'submit')}>Submit</Button>}
                      {ver.status === 'Under Review' && <Button size="sm" variant="primary" icon={<CheckCircle size={13} weight="bold" />} onClick={() => doWorkflow(selectedDoc.id, ver.id, 'approve')}>Approve</Button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </FormModal>

      {/* ── Compare (honest metadata comparison — no fabricated diff) ── */}
      <FormModal open={modalView === 'compare' && !!selectedDoc} onClose={closeModal} title="Compare Versions" subtitle={selectedDoc?.title}>
        {selectedDoc && (
          <>
            <FormGrid cols={2}>
              <Field label="Version A"><Select aria-label="Version A" value={compareA} onChange={(e) => setCompareA(e.target.value)} options={versionOptions(selectedDoc)} /></Field>
              <Field label="Version B"><Select aria-label="Version B" value={compareB} onChange={(e) => setCompareB(e.target.value)} options={versionOptions(selectedDoc)} /></Field>
            </FormGrid>
            {(() => {
              const vA = selectedDoc.versions.find((v) => v.id === compareA);
              const vB = selectedDoc.versions.find((v) => v.id === compareB);
              if (!vA || !vB) return <div className="dvMuted" style={{ fontSize: 'var(--fs-sm)', marginTop: 12 }}>Select two versions to compare.</div>;
              const identical = !!vA.checksum && vA.checksum === vB.checksum;
              const rows: [string, string, string][] = [
                ['Version', vA.versionLabel, vB.versionLabel],
                ['Revision', vA.revisionCode, vB.revisionCode],
                ['Uploaded By', vA.uploadedBy, vB.uploadedBy],
                ['Uploaded', fmtDateTime(vA.uploadedAt), fmtDateTime(vB.uploadedAt)],
                ['File', vA.fileName, vB.fileName],
                ['Size', fmtBytes(vA.fileSize), fmtBytes(vB.fileSize)],
                ['Status', vA.status, vB.status],
                ['SHA-256', vA.checksum ? `${vA.checksum.slice(0, 20)}…` : '—', vB.checksum ? `${vB.checksum.slice(0, 20)}…` : '—'],
                ['Notes', vA.revisionNotes || '—', vB.revisionNotes || '—'],
              ];
              const can = canOverlayVersion(vA) && canOverlayVersion(vB) && vA.id !== vB.id;
              return (
                <div style={{ marginTop: 14 }}>
                  <div className="dvVerify" data-same={identical ? 'true' : 'false'}>
                    {identical ? <CheckCircle size={18} weight="fill" /> : <ArrowsLeftRight size={18} weight="bold" />}
                    <span>{identical ? 'Identical file bytes — the SHA-256 checksums match, so these two versions are byte-for-byte the same file.' : 'File bytes differ — the SHA-256 checksums do not match. Metadata for both versions is compared below.'}</span>
                  </div>
                  <div className="dvCmp">
                    <div className="dvCmpRow"><span>Field</span><span className="dvRevA">{vA.versionLabel}</span><span className="dvRevB">{vB.versionLabel}</span></div>
                    {rows.map(([label, a, b]) => (
                      <div key={label} className="dvCmpRow" data-diff={a !== b ? 'true' : 'false'}><span>{label}</span><span>{a}</span><span>{b}</span></div>
                    ))}
                  </div>
                  <div className="dvCmpFoot">
                    <Button icon={<ArrowsLeftRight size={14} weight="bold" />} disabled={!can} style={{ marginRight: 'auto' }} title={can ? 'Slip-sheet overlay — old linework red, new blue, unchanged dark' : vA.id === vB.id ? 'Pick two different versions to overlay' : 'Visual compare supports PDF, PNG, JPG and WebP files only'} onClick={() => { const [oa, ob] = vA.version <= vB.version ? [vA, vB] : [vB, vA]; setOverlay({ doc: selectedDoc, aId: oa.id, bId: ob.id }); }}>Visual Overlay</Button>
                    <Button icon={<DownloadSimple size={14} weight="bold" />} onClick={() => download(vA)}>{vA.versionLabel}</Button>
                    <Button icon={<DownloadSimple size={14} weight="bold" />} onClick={() => download(vB)}>{vB.versionLabel}</Button>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </FormModal>

      {/* ── Upload / New Document ── */}
      <FormModal
        open={modalView === 'upload'}
        onClose={closeModal}
        title={selectedDoc ? 'Upload New Version' : 'New Document'}
        subtitle={selectedDoc?.title || 'The first upload becomes v1 — every revision after it is checksummed and comparable.'}
        onSubmit={handleUpload}
        submitLabel={busy ? 'Uploading…' : selectedDoc ? 'Upload Version' : 'Create Document'}
        busy={busy}
        error={formError || null}
      >
        <Field label="File" required hint="PDF, Word, Excel or image · up to 50 MB">
          <input ref={uploadInputRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => { setUploadFile(e.target.files?.[0] || null); if (formError) setFormError(''); }} />
          <div className="dvFile">
            <div className="k-input" aria-live="polite"><FileText size={16} style={{ color: uploadFile ? 'var(--text-primary)' : 'var(--text-tertiary)', flexShrink: 0 }} />{uploadFile ? `${uploadFile.name} · ${fmtBytes(uploadFile.size)}` : <span className="dvMuted">No file selected</span>}</div>
            <Button icon={<UploadSimple size={15} weight="bold" />} onClick={() => uploadInputRef.current?.click()}>Choose</Button>
          </div>
        </Field>
        {!selectedDoc && (
          <FormGrid cols={2}>
            <Field label="Title" required span><Input placeholder="Document title" value={uploadTitle} onChange={(e) => { setUploadTitle(e.target.value); if (formError) setFormError(''); }} /></Field>
            <Field label="Description" span><Textarea rows={2} placeholder="Brief description…" value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} /></Field>
            <Field label="Category"><Select aria-label="Category" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} options={UPLOAD_CATS} /></Field>
            <Field label="Project"><Select aria-label="Project" value={uploadProjectId} onChange={(e) => setUploadProjectId(e.target.value)} placeholder="Unassigned" options={projectOptions} /></Field>
            <Field label="Tags" span hint="Comma-separated — structural, concrete, phase-1"><Input placeholder="structural, concrete, phase-1" value={uploadTags} onChange={(e) => setUploadTags(e.target.value)} /></Field>
          </FormGrid>
        )}
        <div style={{ marginTop: selectedDoc ? 0 : 12 }}>
          <Field label="Revision Notes" hint="What changed in this revision — shown in the history and the compare view."><Textarea rows={2} placeholder="Describe what changed…" value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} /></Field>
        </div>
        {selectedDoc && (
          <div className="dvNext" style={{ marginTop: 12 }}>Current: <b style={{ color: 'var(--text-primary)' }}>{selectedDoc.currentVersion}</b> · Next version: <b>v{selectedDoc.currentVersionNumber + 1}</b> (REV-{String(selectedDoc.currentVersionNumber + 1).padStart(3, '0')})</div>
        )}
      </FormModal>

      {/* ── Metadata ── */}
      <FormModal
        open={modalView === 'metadata' && !!selectedDoc}
        onClose={closeModal}
        title="Document Metadata"
        subtitle={selectedDoc?.title}
        footer={selectedDoc && selectedDoc.status !== 'Archived' ? (
          <>
            <Button variant="ghost" onClick={closeModal}>Close</Button>
            <Button icon={<PencilSimple size={15} />} onClick={() => openModal(selectedDoc, 'edit')}>Edit Details</Button>
          </>
        ) : undefined}
      >
        {selectedDoc && (
          <>
            <DetailList items={[
              ['Category', selectedDoc.category],
              ['Project', selectedDoc.project],
              ['Current Version', selectedDoc.currentVersion],
              ['Status', <Badge key="s" tone={STATUS_TONE[selectedDoc.status] ?? 'neutral'}>{selectedDoc.status}</Badge>],
              ['Created', fmtDateTime(selectedDoc.createdAt)],
              ['Last Modified', fmtDateTime(selectedDoc.lastModified)],
              ['Total Versions', String(selectedDoc.versions.length)],
              ['Checked Out', selectedDoc.checkedOutBy ? `${selectedDoc.checkedOutBy} (${fmtDateTime(selectedDoc.checkedOutAt)})` : 'No'],
            ]} />
            <div style={{ marginTop: 16 }}>
              <div className="dvSection">Description</div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', lineHeight: 1.5 }}>{selectedDoc.description || '—'}</div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div className="dvSection">Tags</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selectedDoc.tags.length ? selectedDoc.tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>) : <span className="dvMuted" style={{ fontSize: 'var(--fs-xs)' }}>No tags</span>}
              </div>
            </div>
          </>
        )}
      </FormModal>

      {/* ── Edit details — pre-filled from the saved document ── */}
      <FormModal
        open={modalView === 'edit' && !!selectedDoc}
        onClose={closeModal}
        title="Edit Document Details"
        subtitle={selectedDoc ? `${selectedDoc.currentVersion} · files and versions are not changed here` : undefined}
        onSubmit={saveDetails}
        submitLabel={busy ? 'Saving…' : 'Save Changes'}
        busy={busy}
        error={formError || null}
      >
        {selectedDoc && (
          <FormGrid cols={2}>
            <Field label="Title" required span><Input placeholder="Document title" value={editTitle} onChange={(e) => { setEditTitle(e.target.value); if (formError) setFormError(''); }} /></Field>
            <Field label="Description" span><Textarea rows={2} placeholder="Brief description…" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} /></Field>
            <Field label="Category"><Select aria-label="Category" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} options={UPLOAD_CATS.includes(editCategory) ? UPLOAD_CATS : [...UPLOAD_CATS, editCategory]} /></Field>
            <Field label="Project"><Select aria-label="Project" value={editProjectId} onChange={(e) => setEditProjectId(e.target.value)} placeholder="Unassigned" options={editProjectId && !projectOptions.some((p) => p.value === editProjectId) ? [...projectOptions, { value: editProjectId, label: selectedDoc.project }] : projectOptions} /></Field>
            <Field label="Tags" span hint="Comma-separated — structural, concrete, phase-1"><Input placeholder="structural, concrete, phase-1" value={editTags} onChange={(e) => setEditTags(e.target.value)} /></Field>
          </FormGrid>
        )}
      </FormModal>

      {/* ── Access ── */}
      <FormModal open={modalView === 'access' && !!selectedDoc} onClose={closeModal} title="Access Control" subtitle={selectedDoc?.title}>
        {selectedDoc && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div className="dvSection">Current Access</div>
              {selectedDoc.access.length === 0 && <div className="dvMuted" style={{ fontSize: 'var(--fs-xs)' }}>No grants yet.</div>}
              {selectedDoc.access.map((a) => (
                <div key={a.userId} className="dvGrant">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', fontWeight: 500 }}>{a.name}</span>
                    <Badge tone={a.role === 'admin' ? 'gold' : a.role === 'editor' ? 'ongoing' : 'neutral'}>{a.role.charAt(0).toUpperCase() + a.role.slice(1)}</Badge>
                  </div>
                  <Button size="sm" variant="danger" icon={<Trash size={12} weight="bold" />} onClick={() => removeAccess(a.userId)}>Remove</Button>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
              <div className="dvSection">Grant Access</div>
              <div className="dvGrantRow">
                <Field label="Name or email"><Input placeholder="Name or email" value={accessEmail} onChange={(e) => setAccessEmail(e.target.value)} /></Field>
                <Field label="Role"><Select aria-label="Role" value={accessRole} onChange={(e) => setAccessRole(e.target.value as any)} options={[{ value: 'viewer', label: 'Viewer' }, { value: 'editor', label: 'Editor' }, { value: 'admin', label: 'Admin' }]} /></Field>
                <Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={addAccess} disabled={!accessEmail.trim()}>Add</Button>
              </div>
            </div>
          </>
        )}
      </FormModal>

      {/* ── Bulk Upload ── */}
      <FormModal
        open={modalView === 'bulk'}
        onClose={closeModal}
        title="Bulk Upload"
        subtitle="Each file becomes a new document at v1."
        onSubmit={handleBulkUpload}
        submitLabel={busy ? 'Uploading…' : `Upload ${bulkFiles.length} File${bulkFiles.length !== 1 ? 's' : ''}`}
        busy={busy}
        error={formError || null}
      >
        <FormGrid cols={2}>
          <Field label="Category for All"><Select aria-label="Category for all" value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} options={UPLOAD_CATS} /></Field>
          <Field label="Project for All"><Select aria-label="Project for all" value={bulkProjectId} onChange={(e) => setBulkProjectId(e.target.value)} placeholder="Unassigned" options={projectOptions} /></Field>
        </FormGrid>
        <input ref={bulkInputRef} type="file" accept={ACCEPT} multiple style={{ display: 'none' }} onChange={(e) => { setBulkFiles(Array.from(e.target.files || [])); if (formError) setFormError(''); }} />
        <div style={{ margin: '14px 0 16px' }}><Button icon={<UploadSimple size={15} weight="bold" />} onClick={() => bulkInputRef.current?.click()}>Choose Files</Button></div>
        {bulkFiles.length === 0 ? (
          <div className="dvBulkEmpty">No files selected yet.</div>
        ) : (
          <div style={{ marginBottom: 8 }}>
            {bulkFiles.map((f, idx) => (
              <div key={idx} className="dvBulk">
                <span><FileText size={14} style={{ color: 'var(--text-primary)', flexShrink: 0 }} /><span>{f.name}</span><span className="dvMuted" style={{ flexShrink: 0 }}>· {fmtBytes(f.size)}</span></span>
                <Button size="sm" variant="ghost" icon={<Trash size={12} weight="bold" />} aria-label={`Remove ${f.name}`} onClick={() => setBulkFiles((prev) => prev.filter((_, i) => i !== idx))} />
              </div>
            ))}
            <div className="dvMuted" style={{ fontSize: 'var(--fs-xs)', marginTop: 8 }}>{bulkFiles.length} file(s) ready</div>
          </div>
        )}
      </FormModal>

      {/* ── Revision Overlay — full-screen slip-sheet compare ── */}
      {overlay && (() => {
        const va = overlay.doc.versions.find((v) => v.id === overlay.aId);
        const vb = overlay.doc.versions.find((v) => v.id === overlay.bId);
        if (!va || !vb) return null;
        const pickable = overlay.doc.versions.filter(canOverlayVersion);
        const opts = (excludeId: string) =>
          pickable.filter((v) => v.id !== excludeId).map((v) => ({ value: v.id, label: `${v.versionLabel} (${v.revisionCode})` }));
        return (
          <div className="dvOverlay" role="dialog" aria-label="Revision overlay">
            <div className="dvOverlayBar">
              <div style={{ minWidth: 0 }}>
                <div className="dvOverlayTitle"><ArrowsLeftRight size={16} weight="bold" /> Revision Overlay</div>
                <div className="dvOverlaySub">{overlay.doc.title}</div>
              </div>
              <div className="dvOverlayCtl">
                <span className="dvRevA">Rev A · Red</span>
                <Select aria-label="Revision A (red)" value={overlay.aId} onChange={(e) => setOverlay({ ...overlay, aId: e.target.value })} options={opts(overlay.bId)} />
                <span className="dvRevB">Rev B · Blue</span>
                <Select aria-label="Revision B (blue)" value={overlay.bId} onChange={(e) => setOverlay({ ...overlay, bId: e.target.value })} options={opts(overlay.aId)} />
                <Button size="sm" icon={<ArrowsLeftRight size={13} weight="bold" />} title="Swap A and B" onClick={() => setOverlay({ ...overlay, aId: overlay.bId, bId: overlay.aId })}>Swap</Button>
                <Button size="sm" variant="ghost" icon={<X size={18} weight="bold" />} aria-label="Close overlay" onClick={() => setOverlay(null)} />
              </div>
            </div>
            <div className="dvOverlayBody">
              {overlayErr ? (
                <div className="dvCenter"><EmptyState icon={<WarningCircle size={22} />} title="Couldn't load the revision files" text={overlayErr} action={<Button onClick={() => setOverlay({ ...overlay })}>Retry</Button>} /></div>
              ) : !overlayUrls ? (
                <div className="dvCenter"><div style={{ textAlign: 'center' }}><div className="dvSpin" /><div className="dvMuted" style={{ fontSize: 'var(--fs-sm)' }}>Fetching revision files…</div></div></div>
              ) : (
                <RevisionCompare
                  key={`${overlay.aId}:${overlay.bId}`}
                  a={{ url: overlayUrls.a, fileName: va.fileName, fileType: va.fileType, label: `${va.versionLabel} (${va.revisionCode})` }}
                  b={{ url: overlayUrls.b, fileName: vb.fileName, fileType: vb.fileType, label: `${vb.versionLabel} (${vb.revisionCode})` }}
                />
              )}
            </div>
          </div>
        );
      })()}

      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
