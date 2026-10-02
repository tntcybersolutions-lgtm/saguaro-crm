'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { openPdf } from '@/components/PdfViewer';
import { useProjects } from '@/lib/hooks/useProjects';
import { humanError } from '@/lib/errors';
import {
  Folder, UploadSimple, ClockCounterClockwise, ArrowsLeftRight, Info, Users,
  LockSimple, LockSimpleOpen, DownloadSimple, CheckCircle, PaperPlaneTilt, Plus, X,
  MagnifyingGlass, FileText, Trash, Files, Fingerprint, WarningCircle,
} from '@phosphor-icons/react';
import { getAuthHeaders, getSupabaseBrowser } from '@/lib/supabase-browser';
import { StandardSelect } from '@/components/ui/Select';
import RevisionCompare, { overlaySupported } from '@/components/drawings/RevisionCompare';
import { PremiumSurface, ModuleHero, SectionCard, StatStrip, PremiumEmpty, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';

// ─── Color Palette ────────────────────────────────────────────────
const C = {
  GOLD: '#F59E0B', BG: '#0a0a0a', RAISED: '#141416', BORDER: 'rgba(255,255,255,0.12)',
  TEXT: '#FFFFFF', DIM: '#8094B0', GREEN: '#22C55E', RED: '#EF4444',
  AMBER: '#F59E0B', BLUE: '#F59E0B', PURPLE: '#8B5CF6',
};

// The private `documents` bucket enforces this MIME allow-list on upload.
const ACCEPT = [
  '.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx',
  'application/pdf', 'image/png', 'image/jpeg', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

// ─── Types (mirror the /api/documents/versions response) ──────────
type DocStatus = 'Draft' | 'Under Review' | 'Approved' | 'Superseded';

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
type ModalView = 'none' | 'upload' | 'history' | 'compare' | 'metadata' | 'access' | 'bulk';

const CATEGORIES = ['All', 'Contracts', 'Drawings', 'Specs', 'Submittals', 'RFIs', 'Change Orders', 'Safety', 'Uncategorized'];
const UPLOAD_CATS = CATEGORIES.filter((c) => c !== 'All');

const statusColor: Record<DocStatus, string> = {
  Draft: C.DIM, 'Under Review': C.AMBER, Approved: C.GREEN, Superseded: C.RED,
};

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

// ─── Component ────────────────────────────────────────────────────
export default function DocumentVersionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
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

  // bulk
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkCategory, setBulkCategory] = useState('Uncategorized');
  const [bulkProjectId, setBulkProjectId] = useState('');

  // access
  const [accessEmail, setAccessEmail] = useState('');
  const [accessRole, setAccessRole] = useState<'viewer' | 'editor' | 'admin'>('viewer');

  // revision overlay (Bluebeam-style slip-sheet compare)
  const [overlay, setOverlay] = useState<{ doc: Document; aId: string; bId: string } | null>(null);
  const [overlayUrls, setOverlayUrls] = useState<{ a: string; b: string } | null>(null);
  const [overlayErr, setOverlayErr] = useState('');

  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string, err?: boolean) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3200);
  }, []);

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

  // Keep the open modal's doc in sync after a reload.
  useEffect(() => {
    if (selectedDoc) {
      const fresh = documents.find((d) => d.id === selectedDoc.id);
      if (fresh) setSelectedDoc(fresh);
    }
  }, [documents]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─ Filtering ─
  const filtered = useMemo(() => {
    let list = documents;
    if (activeCategory !== 'All') list = list.filter((d) => d.category === activeCategory);
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
  }, [documents, activeCategory, search]);

  const catCounts = useMemo(() => {
    const map: Record<string, number> = { All: documents.length };
    for (const d of documents) map[d.category] = (map[d.category] || 0) + 1;
    return map;
  }, [documents]);

  // ─ Modal control ─
  const openModal = (doc: Document | null, view: ModalView) => {
    setSelectedDoc(doc);
    setModalView(view);
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
  };
  const closeModal = () => { setModalView('none'); setSelectedDoc(null); setUploadFile(null); setBulkFiles([]); };

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
    if (!uploadFile) { showToast('Please choose a file.', true); return; }
    if (!selectedDoc && !uploadTitle.trim()) { showToast('Title is required.', true); return; }
    setBusy(true);
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
      showToast(e?.message || 'Upload failed.', true);
    } finally {
      setBusy(false);
    }
  };

  const handleBulkUpload = async () => {
    if (bulkFiles.length === 0) { showToast('Add at least one file.', true); return; }
    setBusy(true);
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

  // ─── Styles ─────────────────────────────────────────────────────
  const sBtn = (bg: string, small?: boolean): React.CSSProperties => ({
    background: bg, color: bg === C.GOLD ? C.BG : '#fff', border: 'none', borderRadius: 6,
    padding: small ? '5px 10px' : '8px 16px', cursor: 'pointer',
    fontSize: small ? 12 : 13, fontWeight: 600, whiteSpace: 'nowrap',
    display: 'inline-flex', alignItems: 'center', gap: 6, opacity: busy ? 0.85 : 1,
  });
  const sInput: React.CSSProperties = {
    background: C.BG, border: `1px solid ${C.BORDER}`, borderRadius: 6,
    padding: '8px 12px', color: C.TEXT, fontSize: 13, width: '100%', outline: 'none',
  };
  const sCard: React.CSSProperties = { background: C.RAISED, border: `1px solid ${C.BORDER}`, borderRadius: 10, padding: 16, marginBottom: 8 };
  const sOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(2,6,15,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
  const sModal: React.CSSProperties = { background: C.RAISED, border: `1px solid ${C.BORDER}`, borderRadius: 12, padding: 24, width: 660, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', position: 'relative', boxShadow: 'var(--shadow-lg)' };
  const sBadge = (color: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44` });
  const sLabel: React.CSSProperties = { fontSize: 12, color: C.DIM, display: 'block', marginBottom: 4 };

  const responsiveCSS = `
    @keyframes spin { to { transform: rotate(360deg); } }
    .dvc-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
    .dvc-tablewrap { overflow-x: auto; }
    .dvc-row, .dvc-head { display: grid; grid-template-columns: 2fr 1fr 0.8fr 1fr 1fr 1.7fr; min-width: 880px; }
    @media (max-width: 720px) { .dvc-stats { grid-template-columns: repeat(2, 1fr); } }
  `;

  if (loading) {
    return (
      <PremiumSurface maxWidth={2200}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${C.BORDER}`, borderTopColor: C.GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <div style={{ color: C.DIM, fontSize: 14 }}>Loading documents...</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      </PremiumSurface>
    );
  }

  return (
    <PremiumSurface maxWidth={2200}>
      <style>{responsiveCSS}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toast.err ? C.RED : C.GREEN, color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 2000, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {toast.err ? <WarningCircle size={16} weight="fill" /> : <CheckCircle size={16} weight="fill" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <ModuleHero
        eyebrow="Version Control"
        eyebrowIcon={<Folder size={13} weight="fill" color={C.GOLD} />}
        title="Document"
        accent="Versions"
        subtitle={`${documents.length} document${documents.length !== 1 ? 's' : ''} under version control — every revision checksummed, approvals tracked, check-outs locked.`}
        actions={
          <>
            <button style={ghostButtonStyle} className="pmBtn" onClick={() => openModal(null, 'bulk')}><Files size={16} weight="bold" /> Bulk Upload</button>
            <button style={goldButtonStyle} className="pmBtn" onClick={() => openModal(null, 'upload')}><Plus size={16} weight="bold" /> New Document</button>
          </>
        }
      />

      {error && (
        <div style={{ ...sCard, borderLeft: `3px solid ${C.RED}`, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <WarningCircle size={18} weight="fill" color={C.RED} />
          <span style={{ color: C.DIM, fontSize: 13 }}>{error}</span>
          <button style={{ ...sBtn(C.DIM, true), marginLeft: 'auto' }} onClick={load}>Retry</button>
        </div>
      )}

      {/* Stats — live version-control intelligence, not bare counts */}
      <StatStrip items={[
        {href: '/app/document-versions',  label: 'Documents', value: String(documents.length), sub: (() => { const n = documents.reduce((s, d) => s + d.versions.length, 0); return `${n} revision${n === 1 ? '' : 's'} on file`; })() },
        {href: '/app/document-versions',  label: 'Approved', value: String(documents.filter((d) => d.status === 'Approved').length), accent: C.GREEN, sub: 'released & current' },
        {href: '/app/document-versions',  label: 'Under Review', value: String(documents.filter((d) => d.status === 'Under Review').length), accent: documents.some((d) => d.status === 'Under Review') ? C.AMBER : undefined, sub: 'awaiting approval' },
        {href: '/app/document-versions',  label: 'Drafts', value: String(documents.filter((d) => d.status === 'Draft').length), sub: 'not yet submitted' },
        {href: '/app/document-versions',  label: 'Checked Out', value: String(documents.filter((d) => d.checkedOutBy).length), accent: documents.some((d) => d.checkedOutBy) ? C.RED : undefined, sub: (() => { const names = Array.from(new Set(documents.filter((d) => d.checkedOutBy).map((d) => d.checkedOutBy as string))); return names.length ? `locked by ${names.slice(0, 2).join(', ')}${names.length > 2 ? '…' : ''}` : 'nothing locked'; })() },
        {href: '/app/document-versions',  label: 'Last Activity', value: (() => { const m = documents.reduce<string | null>((acc, d) => (d.lastModified && (!acc || d.lastModified > acc) ? d.lastModified : acc), null); return m ? fmtDate(m) : '—'; })(), sub: 'most recent revision' },
      ]} />

      {/* Search */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', maxWidth: 380, flex: 1 }}>
          <MagnifyingGlass size={16} color={C.DIM} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input style={{ ...sInput, paddingLeft: 32 }} placeholder="Search by name, tags, description, or project..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Categories */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {CATEGORIES.map((cat) => (
          <button key={cat} onClick={() => setActiveCategory(cat)} style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${activeCategory === cat ? C.GOLD : C.BORDER}`,
            background: activeCategory === cat ? `${C.GOLD}22` : 'transparent',
            color: activeCategory === cat ? C.GOLD : C.DIM,
          }}>
            {cat} ({catCounts[cat] || 0})
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <SectionCard>
          {search || activeCategory !== 'All' ? (
            <PremiumEmpty
              compact
              icon={<MagnifyingGlass size={30} weight="duotone" color={C.GOLD} />}
              title="No documents match"
              description="Try adjusting your search or category filter."
            />
          ) : (
            <PremiumEmpty
              icon={<FileText size={30} weight="duotone" color={C.GOLD} />}
              title="Nothing under version control yet"
              description="Contracts, drawings, specs, and submittals belong here. Every upload becomes v1; each revision after that is checksummed and comparable, approvals gate what's current, and check-out locks stop two people revising the same file."
              action={
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button style={goldButtonStyle} className="pmBtn" onClick={() => openModal(null, 'upload')}><Plus size={16} weight="bold" /> New Document</button>
                  <button style={ghostButtonStyle} className="pmBtn" onClick={() => openModal(null, 'bulk')}><Files size={16} weight="bold" /> Bulk Upload</button>
                </div>
              }
            />
          )}
        </SectionCard>
      ) : (
        <div className="dvc-tablewrap">
          <div className="dvc-head" style={{ padding: '8px 16px', fontSize: 11, fontWeight: 700, color: C.DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <span>Document</span><span>Category</span><span>Version</span><span>Status</span><span>Modified</span><span>Actions</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map((doc) => (
              <div key={doc.id} className="dvc-row" style={{ ...sCard, alignItems: 'center', padding: '12px 16px', marginBottom: 0, borderLeft: doc.checkedOutBy ? `3px solid ${C.RED}` : '3px solid transparent' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{doc.title}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: C.DIM }}>{doc.project}</span>
                    {doc.tags.map((t) => (
                      <span key={t} style={{ fontSize: 10, color: C.BLUE, background: `${C.BLUE}18`, padding: '1px 6px', borderRadius: 4 }}>{t}</span>
                    ))}
                    {doc.checkedOutBy && (
                      <span style={{ fontSize: 10, color: C.RED, background: `${C.RED}18`, padding: '1px 6px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <LockSimple size={10} weight="fill" /> {doc.checkedOutBy}
                      </span>
                    )}
                  </div>
                  {doc.versions.length > 0 && (
                    <div style={{ fontSize: 10.5, color: C.DIM, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.versions.length} version{doc.versions.length !== 1 ? 's' : ''}
                      {doc.versions[doc.versions.length - 1]?.revisionNotes ? ` · latest: ${doc.versions[doc.versions.length - 1].revisionNotes}` : ''}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 12, color: C.DIM }}>{doc.category}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.GOLD, fontFamily: 'monospace' }}>{doc.currentVersion}</span>
                <span style={sBadge(statusColor[doc.status])}>{doc.status}</span>
                <div>
                  <div style={{ fontSize: 12, color: C.TEXT }}>{fmtDate(doc.lastModified)}</div>
                  <div style={{ fontSize: 11, color: C.DIM }}>{doc.modifiedBy}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={sBtn(C.BLUE, true)} onClick={() => openModal(doc, 'history')}><ClockCounterClockwise size={13} weight="bold" /> History</button>
                  <button style={{ ...sBtn(C.PURPLE, true), opacity: doc.versions.length < 2 ? 0.4 : 1 }} onClick={() => openModal(doc, 'compare')} disabled={doc.versions.length < 2}><ArrowsLeftRight size={13} weight="bold" /> Compare</button>
                  <button style={sBtn(C.GOLD, true)} onClick={() => openModal(doc, 'upload')}><UploadSimple size={13} weight="bold" /> Upload</button>
                  {!doc.checkedOutBy ? (
                    <button style={sBtn(C.DIM, true)} onClick={() => doCheckout(doc.id, 'checkout')}><LockSimpleOpen size={13} weight="bold" /> Check Out</button>
                  ) : (
                    <button style={sBtn(C.GREEN, true)} onClick={() => doCheckout(doc.id, 'checkin')}><LockSimple size={13} weight="bold" /> Check In</button>
                  )}
                  <button style={sBtn('#334155', true)} onClick={() => openModal(doc, 'metadata')}><Info size={13} weight="bold" /></button>
                  <button style={sBtn('#334155', true)} onClick={() => openModal(doc, 'access')}><Users size={13} weight="bold" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── History Modal ── */}
      {modalView === 'history' && selectedDoc && (
        <div style={sOverlay} onClick={closeModal}>
          <div style={sModal} onClick={(e) => e.stopPropagation()}>
            <ModalHeader title="Version History" subtitle={selectedDoc.title} onClose={closeModal} />
            {selectedDoc.versions.length === 0 ? (
              <div style={{ color: C.DIM, fontSize: 13, padding: 12 }}>No versions yet.</div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 24 }}>
                <div style={{ position: 'absolute', left: 8, top: 4, bottom: 4, width: 2, background: C.BORDER }} />
                {[...selectedDoc.versions].reverse().map((ver, idx) => (
                  <div key={ver.id} style={{ position: 'relative', marginBottom: 20, paddingBottom: 12, borderBottom: idx < selectedDoc.versions.length - 1 ? `1px solid ${C.BORDER}` : 'none' }}>
                    <div style={{ position: 'absolute', left: -20, top: 4, width: 12, height: 12, borderRadius: '50%', background: idx === 0 ? C.GOLD : C.BORDER, border: `2px solid ${C.RAISED}` }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: C.TEXT, fontFamily: 'monospace' }}>{ver.versionLabel}</span>
                          <span style={{ fontSize: 11, color: C.DIM, fontFamily: 'monospace' }}>{ver.revisionCode}</span>
                          <span style={sBadge(statusColor[ver.status])}>{ver.status}</span>
                        </div>
                        <div style={{ fontSize: 12, color: C.DIM, marginBottom: 4 }}>
                          Uploaded by <span style={{ color: C.TEXT }}>{ver.uploadedBy}</span> on {fmtDateTime(ver.uploadedAt)} · {fmtBytes(ver.fileSize)}
                        </div>
                        <div style={{ fontSize: 12, color: C.DIM, marginBottom: 6 }}>
                          <span style={{ color: C.TEXT, fontWeight: 600 }}>Notes:</span> {ver.revisionNotes || '—'}
                        </div>
                        {ver.checksum && (
                          <div style={{ fontSize: 11, color: C.DIM, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'monospace' }}>
                            <Fingerprint size={12} /> {ver.checksum.slice(0, 16)}…
                          </div>
                        )}
                        {ver.approvedBy && (
                          <div style={{ fontSize: 11, color: C.GREEN, marginTop: 4 }}>Approved by {ver.approvedBy} on {fmtDate(ver.approvedAt)}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {(() => {
                          const supported = canOverlayVersion(ver);
                          const hasOther = selectedDoc.versions.some((v) => v.id !== ver.id && canOverlayVersion(v));
                          const can = supported && hasOther;
                          return (
                            <button
                              style={{ ...sBtn(C.PURPLE, true), opacity: can ? 1 : 0.4, cursor: can ? 'pointer' : 'not-allowed' }}
                              disabled={!can}
                              title={can
                                ? 'Overlay this revision against another (previous revision by default) — red = removed, blue = added'
                                : supported
                                  ? 'No other PDF or image revision to compare this one against'
                                  : 'Visual compare supports PDF, PNG, JPG and WebP files only'}
                              onClick={() => openOverlay(selectedDoc, ver.id)}
                            >
                              <ArrowsLeftRight size={13} weight="bold" /> Compare
                            </button>
                          );
                        })()}
                        <button style={sBtn(C.BLUE, true)} onClick={() => download(ver)}><DownloadSimple size={13} weight="bold" /> Download</button>
                        {ver.status === 'Draft' && <button style={sBtn(C.AMBER, true)} onClick={() => doWorkflow(selectedDoc.id, ver.id, 'submit')}><PaperPlaneTilt size={13} weight="bold" /> Submit</button>}
                        {ver.status === 'Under Review' && <button style={sBtn(C.GREEN, true)} onClick={() => doWorkflow(selectedDoc.id, ver.id, 'approve')}><CheckCircle size={13} weight="bold" /> Approve</button>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Compare Modal (honest metadata comparison — no fabricated diff) ── */}
      {modalView === 'compare' && selectedDoc && (
        <div style={sOverlay} onClick={closeModal}>
          <div style={{ ...sModal, width: 720 }} onClick={(e) => e.stopPropagation()}>
            <ModalHeader title="Compare Versions" subtitle={selectedDoc.title} onClose={closeModal} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={sLabel}>Version A</label>
                <StandardSelect value={compareA} onChange={setCompareA} ariaLabel="Version A" width="100%"
                  options={selectedDoc.versions.map((v) => ({ value: v.id, label: `${v.versionLabel} (${v.revisionCode})` }))} />
              </div>
              <div>
                <label style={sLabel}>Version B</label>
                <StandardSelect value={compareB} onChange={setCompareB} ariaLabel="Version B" width="100%"
                  options={selectedDoc.versions.map((v) => ({ value: v.id, label: `${v.versionLabel} (${v.revisionCode})` }))} />
              </div>
            </div>
            {(() => {
              const vA = selectedDoc.versions.find((v) => v.id === compareA);
              const vB = selectedDoc.versions.find((v) => v.id === compareB);
              if (!vA || !vB) return <div style={{ color: C.DIM, fontSize: 13 }}>Select two versions to compare.</div>;
              const identical = !!vA.checksum && vA.checksum === vB.checksum;
              const rows: [string, string, string][] = [
                ['Version', vA.versionLabel, vB.versionLabel],
                ['Revision', vA.revisionCode, vB.revisionCode],
                ['Uploaded by', vA.uploadedBy, vB.uploadedBy],
                ['Uploaded', fmtDateTime(vA.uploadedAt), fmtDateTime(vB.uploadedAt)],
                ['File', vA.fileName, vB.fileName],
                ['Size', fmtBytes(vA.fileSize), fmtBytes(vB.fileSize)],
                ['Status', vA.status, vB.status],
                ['SHA-256', vA.checksum ? `${vA.checksum.slice(0, 20)}…` : '—', vB.checksum ? `${vB.checksum.slice(0, 20)}…` : '—'],
                ['Notes', vA.revisionNotes || '—', vB.revisionNotes || '—'],
              ];
              return (
                <div>
                  <div style={{ ...sCard, borderLeft: `3px solid ${identical ? C.GREEN : C.AMBER}`, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    {identical ? <CheckCircle size={18} weight="fill" color={C.GREEN} /> : <ArrowsLeftRight size={18} weight="bold" color={C.AMBER} />}
                    <span style={{ fontSize: 13, color: C.TEXT }}>
                      {identical
                        ? 'Identical file bytes — the SHA-256 checksums match, so these two versions are byte-for-byte the same file.'
                        : 'File bytes differ — the SHA-256 checksums do not match. Metadata for both versions is compared below.'}
                    </span>
                  </div>
                  <div style={{ border: `1px solid ${C.BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr', background: C.BG, padding: '8px 12px', fontSize: 11, fontWeight: 700, color: C.DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      <span>Field</span><span style={{ color: C.RED }}>{vA.versionLabel}</span><span style={{ color: C.GREEN }}>{vB.versionLabel}</span>
                    </div>
                    {rows.map(([label, a, b], i) => {
                      const diff = a !== b;
                      return (
                        <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr', padding: '8px 12px', fontSize: 12, borderTop: `1px solid ${C.BORDER}`, background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                          <span style={{ color: C.DIM }}>{label}</span>
                          <span style={{ color: diff ? C.TEXT : C.DIM, wordBreak: 'break-word' }}>{a}</span>
                          <span style={{ color: diff ? C.TEXT : C.DIM, wordBreak: 'break-word', fontWeight: diff ? 600 : 400 }}>{b}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {(() => {
                      const can = canOverlayVersion(vA) && canOverlayVersion(vB) && vA.id !== vB.id;
                      return (
                        <button
                          style={{ ...sBtn(C.PURPLE, false), marginRight: 'auto', opacity: can ? 1 : 0.4, cursor: can ? 'pointer' : 'not-allowed' }}
                          disabled={!can}
                          title={can
                            ? 'Slip-sheet overlay — old linework red, new blue, unchanged dark'
                            : vA.id === vB.id
                              ? 'Pick two different versions to overlay'
                              : 'Visual compare supports PDF, PNG, JPG and WebP files only'}
                          onClick={() => {
                            const [oa, ob] = vA.version <= vB.version ? [vA, vB] : [vB, vA];
                            setOverlay({ doc: selectedDoc, aId: oa.id, bId: ob.id });
                          }}
                        >
                          <ArrowsLeftRight size={14} weight="bold" /> Visual Overlay
                        </button>
                      );
                    })()}
                    <button style={sBtn(C.BLUE, false)} onClick={() => download(vA)}><DownloadSimple size={14} weight="bold" /> {vA.versionLabel}</button>
                    <button style={sBtn(C.GREEN, false)} onClick={() => download(vB)}><DownloadSimple size={14} weight="bold" /> {vB.versionLabel}</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Upload / New Document Modal ── */}
      {modalView === 'upload' && (
        <div style={sOverlay} onClick={closeModal}>
          <div style={sModal} onClick={(e) => e.stopPropagation()}>
            <ModalHeader title={selectedDoc ? `Upload New Version` : 'New Document'} subtitle={selectedDoc?.title} onClose={closeModal} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={sLabel}>File</label>
                <input ref={uploadInputRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ ...sInput, flex: 1, display: 'flex', alignItems: 'center', gap: 8, color: uploadFile ? C.TEXT : C.DIM }}>
                    <FileText size={16} color={uploadFile ? C.GOLD : C.DIM} />
                    {uploadFile ? `${uploadFile.name} · ${fmtBytes(uploadFile.size)}` : 'No file selected'}
                  </div>
                  <button style={sBtn(C.BLUE)} onClick={() => uploadInputRef.current?.click()}><UploadSimple size={15} weight="bold" /> Choose</button>
                </div>
                <div style={{ fontSize: 11, color: C.DIM, marginTop: 4 }}>PDF, Word, Excel or image · up to 50 MB</div>
              </div>

              {!selectedDoc && (
                <>
                  <div>
                    <label style={sLabel}>Title *</label>
                    <input style={sInput} placeholder="Document title" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} />
                  </div>
                  <div>
                    <label style={sLabel}>Description</label>
                    <textarea style={{ ...sInput, minHeight: 56, resize: 'vertical' }} placeholder="Brief description..." value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={sLabel}>Category</label>
                      <StandardSelect value={uploadCategory} onChange={setUploadCategory} ariaLabel="Category" width="100%" options={UPLOAD_CATS} />
                    </div>
                    <div>
                      <label style={sLabel}>Project</label>
                      <StandardSelect value={uploadProjectId} onChange={setUploadProjectId} ariaLabel="Project" placeholder="Unassigned" width="100%"
                        options={projects.map((p) => ({ value: p.id, label: p.name }))} />
                    </div>
                  </div>
                  <div>
                    <label style={sLabel}>Tags (comma separated)</label>
                    <input style={sInput} placeholder="structural, concrete, phase-1" value={uploadTags} onChange={(e) => setUploadTags(e.target.value)} />
                  </div>
                </>
              )}

              <div>
                <label style={sLabel}>Revision Notes</label>
                <textarea style={{ ...sInput, minHeight: 56, resize: 'vertical' }} placeholder="Describe what changed..." value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} />
              </div>

              {selectedDoc && (
                <div style={{ ...sCard, borderLeft: `3px solid ${C.BLUE}`, marginBottom: 0 }}>
                  <div style={{ fontSize: 12, color: C.DIM }}>
                    Current: <strong style={{ color: C.GOLD }}>{selectedDoc.currentVersion}</strong> · Next version:{' '}
                    <strong style={{ color: C.TEXT }}>v{selectedDoc.currentVersionNumber + 1}</strong> (REV-{String(selectedDoc.currentVersionNumber + 1).padStart(3, '0')})
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button style={sBtn('#334155')} onClick={closeModal} disabled={busy}>Cancel</button>
                <button style={sBtn(C.GOLD)} onClick={handleUpload} disabled={busy}>
                  {busy ? 'Uploading...' : selectedDoc ? 'Upload Version' : 'Create Document'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Metadata Modal ── */}
      {modalView === 'metadata' && selectedDoc && (
        <div style={sOverlay} onClick={closeModal}>
          <div style={sModal} onClick={(e) => e.stopPropagation()}>
            <ModalHeader title="Document Metadata" subtitle={selectedDoc.title} onClose={closeModal} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {([
                ['Category', selectedDoc.category],
                ['Project', selectedDoc.project],
                ['Current Version', selectedDoc.currentVersion],
                ['Status', selectedDoc.status],
                ['Created', fmtDateTime(selectedDoc.createdAt)],
                ['Last Modified', fmtDateTime(selectedDoc.lastModified)],
                ['Total Versions', String(selectedDoc.versions.length)],
                ['Checked Out', selectedDoc.checkedOutBy ? `${selectedDoc.checkedOutBy} (${fmtDateTime(selectedDoc.checkedOutAt)})` : 'No'],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: C.DIM, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                  <div style={{ fontSize: 14, color: C.TEXT, fontWeight: 500 }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: C.DIM, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Description</div>
              <div style={{ fontSize: 13, color: C.TEXT, lineHeight: 1.5 }}>{selectedDoc.description || '—'}</div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: C.DIM, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Tags</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selectedDoc.tags.length ? selectedDoc.tags.map((t) => <span key={t} style={{ ...sBadge(C.BLUE), fontSize: 12 }}>{t}</span>) : <span style={{ color: C.DIM, fontSize: 12 }}>No tags</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Access Modal ── */}
      {modalView === 'access' && selectedDoc && (
        <div style={sOverlay} onClick={closeModal}>
          <div style={sModal} onClick={(e) => e.stopPropagation()}>
            <ModalHeader title="Access Control" subtitle={selectedDoc.title} onClose={closeModal} />
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: C.DIM, marginBottom: 8, fontWeight: 600 }}>Current Access</div>
              {selectedDoc.access.length === 0 && <div style={{ color: C.DIM, fontSize: 12 }}>No grants yet.</div>}
              {selectedDoc.access.map((a) => (
                <div key={a.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: C.BG, borderRadius: 6, marginBottom: 4, border: `1px solid ${C.BORDER}` }}>
                  <div>
                    <span style={{ fontSize: 13, color: C.TEXT, fontWeight: 500 }}>{a.name}</span>
                    <span style={{ ...sBadge(a.role === 'admin' ? C.GOLD : a.role === 'editor' ? C.GREEN : C.DIM), marginLeft: 8, fontSize: 10 }}>{a.role}</span>
                  </div>
                  <button style={{ ...sBtn(C.RED, true) }} onClick={() => removeAccess(a.userId)}><Trash size={12} weight="bold" /> Remove</button>
                </div>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${C.BORDER}`, paddingTop: 16 }}>
              <div style={{ fontSize: 12, color: C.DIM, marginBottom: 8, fontWeight: 600 }}>Grant Access</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...sInput, flex: 1 }} placeholder="Name or email" value={accessEmail} onChange={(e) => setAccessEmail(e.target.value)} />
                <StandardSelect value={accessRole} onChange={(v) => setAccessRole(v as any)} ariaLabel="Role" width={120}
                  options={[{ value: 'viewer', label: 'Viewer' }, { value: 'editor', label: 'Editor' }, { value: 'admin', label: 'Admin' }]} />
                <button style={sBtn(C.GREEN)} onClick={addAccess}><Plus size={15} weight="bold" /> Add</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Upload Modal ── */}
      {modalView === 'bulk' && (
        <div style={sOverlay} onClick={closeModal}>
          <div style={sModal} onClick={(e) => e.stopPropagation()}>
            <ModalHeader title="Bulk Upload" subtitle="Each file becomes a new document at v1" onClose={closeModal} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={sLabel}>Category for all</label>
                <StandardSelect value={bulkCategory} onChange={setBulkCategory} ariaLabel="Category for all" width="100%" options={UPLOAD_CATS} />
              </div>
              <div>
                <label style={sLabel}>Project for all</label>
                <StandardSelect value={bulkProjectId} onChange={setBulkProjectId} ariaLabel="Project for all" placeholder="Unassigned" width="100%"
                  options={projects.map((p) => ({ value: p.id, label: p.name }))} />
              </div>
            </div>
            <input ref={bulkInputRef} type="file" accept={ACCEPT} multiple style={{ display: 'none' }} onChange={(e) => setBulkFiles(Array.from(e.target.files || []))} />
            <button style={{ ...sBtn(C.BLUE), marginBottom: 16 }} onClick={() => bulkInputRef.current?.click()}><UploadSimple size={15} weight="bold" /> Choose Files</button>

            {bulkFiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 28, color: C.DIM, fontSize: 13, border: `1px dashed ${C.BORDER}`, borderRadius: 8, marginBottom: 16 }}>
                No files selected yet.
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {bulkFiles.map((f, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: C.BG, borderRadius: 6, marginBottom: 4, border: `1px solid ${C.BORDER}` }}>
                    <span style={{ fontSize: 13, color: C.TEXT, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <FileText size={14} color={C.GOLD} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ color: C.DIM, flexShrink: 0 }}>· {fmtBytes(f.size)}</span>
                    </span>
                    <button style={{ ...sBtn(C.RED, true) }} onClick={() => setBulkFiles((prev) => prev.filter((_, i) => i !== idx))}><Trash size={12} weight="bold" /></button>
                  </div>
                ))}
                <div style={{ fontSize: 12, color: C.DIM, marginTop: 8 }}>{bulkFiles.length} file(s) ready</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button style={sBtn('#334155')} onClick={closeModal} disabled={busy}>Cancel</button>
              <button style={sBtn(C.PURPLE)} onClick={handleBulkUpload} disabled={bulkFiles.length === 0 || busy}>
                {busy ? 'Uploading...' : `Upload ${bulkFiles.length} File${bulkFiles.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Revision Overlay — full-screen slip-sheet compare ── */}
      {overlay && (() => {
        const va = overlay.doc.versions.find((v) => v.id === overlay.aId);
        const vb = overlay.doc.versions.find((v) => v.id === overlay.bId);
        if (!va || !vb) return null;
        const pickable = overlay.doc.versions.filter(canOverlayVersion);
        const opts = (excludeId: string) =>
          pickable.filter((v) => v.id !== excludeId).map((v) => ({ value: v.id, label: `${v.versionLabel} (${v.revisionCode})` }));
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: C.BG, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', background: C.RAISED, borderBottom: `1px solid ${C.BORDER}`, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.GOLD, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ArrowsLeftRight size={16} weight="bold" /> Revision Overlay
                </div>
                <div style={{ fontSize: 11.5, color: C.DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{overlay.doc.title}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.RED, textTransform: 'uppercase', letterSpacing: 0.5 }}>Rev A · red</span>
                <StandardSelect value={overlay.aId} onChange={(v) => setOverlay({ ...overlay, aId: v })} ariaLabel="Revision A (red)" width={190} options={opts(overlay.bId)} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rev B · blue</span>
                <StandardSelect value={overlay.bId} onChange={(v) => setOverlay({ ...overlay, bId: v })} ariaLabel="Revision B (blue)" width={190} options={opts(overlay.aId)} />
                <button
                  style={sBtn('#334155', true)}
                  title="Swap A and B"
                  onClick={() => setOverlay({ ...overlay, aId: overlay.bId, bId: overlay.aId })}
                ><ArrowsLeftRight size={13} weight="bold" /> Swap</button>
                <button onClick={() => setOverlay(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.DIM, padding: 6, display: 'flex' }} aria-label="Close overlay">
                  <X size={20} weight="bold" />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {overlayErr ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ ...sCard, borderLeft: `3px solid ${C.RED}`, display: 'flex', alignItems: 'center', gap: 10, maxWidth: 460 }}>
                    <WarningCircle size={18} weight="fill" color={C.RED} />
                    <span style={{ color: C.DIM, fontSize: 13 }}>{overlayErr}</span>
                  </div>
                </div>
              ) : !overlayUrls ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 32, height: 32, border: `3px solid ${C.BORDER}`, borderTopColor: C.GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                    <div style={{ color: C.DIM, fontSize: 13 }}>Fetching revision files…</div>
                  </div>
                </div>
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
    </PremiumSurface>
  );
}

// ─── Shared modal header ──────────────────────────────────────────
function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle?: string | null; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, color: C.GOLD }}>{title}</h2>
        {subtitle && <p style={{ margin: '4px 0 0', color: C.DIM, fontSize: 13 }}>{subtitle}</p>}
      </div>
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.DIM, padding: 4, display: 'flex' }} aria-label="Close">
        <X size={20} weight="bold" />
      </button>
    </div>
  );
}
