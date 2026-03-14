'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';

// ─── Color Palette ────────────────────────────────────────────────
const C = {
  GOLD: '#D4A017', BG: '#07101C', RAISED: '#0D1D2E', BORDER: '#1E3A5F',
  TEXT: '#F0F4FF', DIM: '#8BAAC8', GREEN: '#22C55E', RED: '#EF4444',
  AMBER: '#F59E0B', BLUE: '#3B82F6', PURPLE: '#8B5CF6',
};

// ─── Inline Types ─────────────────────────────────────────────────
type DocStatus = 'Draft' | 'Under Review' | 'Approved' | 'Superseded';

type DocVersion = {
  id: string;
  versionLabel: string;
  revisionCode: string;
  uploadedBy: string;
  uploadedAt: string;
  fileSize: string;
  revisionNotes: string;
  status: DocStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  diffSummary: string;
};

type AccessEntry = { userId: string; name: string; role: 'viewer' | 'editor' | 'admin' };

type Document = {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  project: string;
  currentVersion: string;
  lastModified: string;
  modifiedBy: string;
  status: DocStatus;
  checkedOutBy: string | null;
  checkedOutAt: string | null;
  versions: DocVersion[];
  access: AccessEntry[];
};

type ModalView = 'none' | 'upload' | 'history' | 'compare' | 'metadata' | 'access' | 'bulk';

// ─── Categories ───────────────────────────────────────────────────
const CATEGORIES = ['All', 'Contracts', 'Drawings', 'Specs', 'Submittals', 'RFIs', 'Change Orders', 'Safety', 'Uncategorized'];

// ─── Status Colors ────────────────────────────────────────────────
const statusColor: Record<DocStatus, string> = {
  Draft: C.DIM, 'Under Review': C.AMBER, Approved: C.GREEN, Superseded: C.RED,
};

// ─── Seed Data ────────────────────────────────────────────────────
function seedDocuments(): Document[] {
  const users = ['Sarah Chen', 'Mike Torres', 'Lisa Patel', 'James Wright', 'Emily Nakamura'];
  const projects = ['Pinnacle Tower', 'Desert Ridge Plaza', 'Cactus Creek Commons'];
  const cats = ['Contracts', 'Drawings', 'Specs', 'Submittals', 'RFIs', 'Change Orders', 'Safety'];
  const tagPool = ['structural', 'mechanical', 'electrical', 'plumbing', 'HVAC', 'fire-protection', 'civil', 'architectural', 'landscaping', 'interior'];

  const docs: Document[] = [];
  const titles = [
    'General Conditions Contract', 'Foundation Structural Drawings', 'HVAC Specifications',
    'Concrete Mix Submittal', 'Electrical RFI Response', 'Change Order #12 - Steel',
    'Safety Plan - Phase 2', 'Architectural Floor Plans', 'Plumbing Riser Diagrams',
    'Landscape Grading Plan', 'Interior Finish Schedule', 'Fire Suppression Specs',
    'Elevator Shop Drawings', 'Roofing Warranty Document', 'ADA Compliance Report',
  ];

  for (let i = 0; i < titles.length; i++) {
    const vCount = Math.floor(Math.random() * 4) + 1;
    const versions: DocVersion[] = [];
    for (let v = 0; v < vCount; v++) {
      const major = Math.floor(v / 3) + 1;
      const minor = v % 3;
      versions.push({
        id: `v-${i}-${v}`,
        versionLabel: `v${major}.${minor}`,
        revisionCode: `REV-${String(v + 1).padStart(3, '0')}`,
        uploadedBy: users[(i + v) % users.length],
        uploadedAt: new Date(2025, 8 + Math.floor(v / 2), 10 + v * 3).toISOString(),
        fileSize: `${(Math.random() * 15 + 0.5).toFixed(1)} MB`,
        revisionNotes: v === 0 ? 'Initial upload' : `Updated per review comments round ${v}`,
        status: v === vCount - 1 ? (['Draft', 'Under Review', 'Approved'] as DocStatus[])[i % 3] : 'Superseded',
        approvedBy: v === vCount - 1 && i % 3 === 2 ? users[(i + 2) % users.length] : null,
        approvedAt: v === vCount - 1 && i % 3 === 2 ? new Date(2025, 10, 5).toISOString() : null,
        diffSummary: v === 0
          ? 'Initial version — no prior version to compare.'
          : [
              'Section 3.2 revised: updated load calculations. Added Appendix C.',
              'Drawing sheet A-102 updated: relocated stairwell per RFI #45.',
              'Material specs changed: switched to Type V cement per submittal review.',
              'Scope clarification added to Section 7. Removed duplicate clause in 4.1.',
            ][v % 4],
      });
    }
    const latest = versions[versions.length - 1];
    docs.push({
      id: `doc-${i}`,
      title: titles[i],
      description: `Official project document for ${titles[i].toLowerCase()}. Maintained under version control.`,
      category: cats[i % cats.length],
      tags: [tagPool[i % tagPool.length], tagPool[(i + 3) % tagPool.length]],
      project: projects[i % projects.length],
      currentVersion: latest.versionLabel,
      lastModified: latest.uploadedAt,
      modifiedBy: latest.uploadedBy,
      status: latest.status,
      checkedOutBy: i === 2 ? 'Sarah Chen' : i === 7 ? 'Mike Torres' : null,
      checkedOutAt: i === 2 ? new Date(2025, 11, 1).toISOString() : i === 7 ? new Date(2025, 11, 3).toISOString() : null,
      versions,
      access: [
        { userId: 'u1', name: users[0], role: 'admin' },
        { userId: 'u2', name: users[1], role: 'editor' },
        { userId: 'u3', name: users[2], role: 'viewer' },
      ],
    });
  }
  return docs;
}

// ─── Helpers ──────────────────────────────────────────────────────
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Component ────────────────────────────────────────────────────
export default function DocumentVersionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [modalView, setModalView] = useState<ModalView>('none');
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadCategory, setUploadCategory] = useState('Uncategorized');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadProject, setUploadProject] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [bulkFiles, setBulkFiles] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState('Uncategorized');
  const [accessEmail, setAccessEmail] = useState('');
  const [accessRole, setAccessRole] = useState<'viewer' | 'editor' | 'admin'>('viewer');
  const [toast, setToast] = useState<string | null>(null);

  // ─ Load Data ─
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setDocuments(seedDocuments());
      } catch {
        setError('Failed to load documents. Please try again.');
      } finally {
        setLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // ─ Toast ─
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ─ Filtered Documents ─
  const filtered = useMemo(() => {
    let list = documents;
    if (activeCategory !== 'All') list = list.filter(d => d.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.tags.some(t => t.toLowerCase().includes(q)) ||
        d.description.toLowerCase().includes(q) ||
        d.project.toLowerCase().includes(q)
      );
    }
    return list;
  }, [documents, activeCategory, search]);

  // ─ Category counts ─
  const catCounts = useMemo(() => {
    const map: Record<string, number> = { All: documents.length };
    for (const d of documents) map[d.category] = (map[d.category] || 0) + 1;
    return map;
  }, [documents]);

  // ─ Handlers ─
  const openModal = (doc: Document | null, view: ModalView) => {
    setSelectedDoc(doc);
    setModalView(view);
    if (view === 'compare' && doc && doc.versions.length >= 2) {
      setCompareA(doc.versions[doc.versions.length - 2].id);
      setCompareB(doc.versions[doc.versions.length - 1].id);
    }
    if (view === 'upload') {
      setUploadTitle('');
      setUploadDesc('');
      setUploadCategory(doc ? doc.category : 'Uncategorized');
      setUploadTags(doc ? doc.tags.join(', ') : '');
      setUploadProject(doc ? doc.project : '');
      setUploadNotes('');
      setUploadFileName('');
    }
  };

  const closeModal = () => { setModalView('none'); setSelectedDoc(null); };

  const handleCheckOut = (docId: string) => {
    setDocuments(prev => prev.map(d =>
      d.id === docId
        ? { ...d, checkedOutBy: 'You', checkedOutAt: new Date().toISOString() }
        : d
    ));
    showToast('Document checked out successfully.');
  };

  const handleCheckIn = (docId: string) => {
    setDocuments(prev => prev.map(d =>
      d.id === docId ? { ...d, checkedOutBy: null, checkedOutAt: null } : d
    ));
    showToast('Document checked in.');
  };

  const handleUploadVersion = () => {
    if (!uploadFileName) { showToast('Please select a file.'); return; }
    if (selectedDoc) {
      // New version of existing doc
      const vIdx = selectedDoc.versions.length;
      const major = Math.floor(vIdx / 3) + 1;
      const minor = vIdx % 3;
      const newVer: DocVersion = {
        id: `v-${selectedDoc.id}-${vIdx}`,
        versionLabel: `v${major}.${minor}`,
        revisionCode: `REV-${String(vIdx + 1).padStart(3, '0')}`,
        uploadedBy: 'You',
        uploadedAt: new Date().toISOString(),
        fileSize: `${(Math.random() * 10 + 1).toFixed(1)} MB`,
        revisionNotes: uploadNotes || 'No notes provided.',
        status: 'Draft',
        approvedBy: null,
        approvedAt: null,
        diffSummary: 'Changes pending review — diff will be generated after processing.',
      };
      setDocuments(prev => prev.map(d => {
        if (d.id !== selectedDoc.id) return d;
        const updatedVersions = d.versions.map(v => ({ ...v, status: 'Superseded' as DocStatus }));
        updatedVersions.push(newVer);
        return {
          ...d,
          versions: updatedVersions,
          currentVersion: newVer.versionLabel,
          lastModified: newVer.uploadedAt,
          modifiedBy: 'You',
          status: 'Draft',
          checkedOutBy: null,
          checkedOutAt: null,
        };
      }));
      showToast(`New version ${newVer.versionLabel} uploaded.`);
    } else {
      // Brand-new document
      if (!uploadTitle) { showToast('Title is required.'); return; }
      const newDoc: Document = {
        id: `doc-${Date.now()}`,
        title: uploadTitle,
        description: uploadDesc,
        category: uploadCategory,
        tags: uploadTags.split(',').map(t => t.trim()).filter(Boolean),
        project: uploadProject || 'Unassigned',
        currentVersion: 'v1.0',
        lastModified: new Date().toISOString(),
        modifiedBy: 'You',
        status: 'Draft',
        checkedOutBy: null,
        checkedOutAt: null,
        versions: [{
          id: `v-${Date.now()}-0`,
          versionLabel: 'v1.0',
          revisionCode: 'REV-001',
          uploadedBy: 'You',
          uploadedAt: new Date().toISOString(),
          fileSize: `${(Math.random() * 10 + 1).toFixed(1)} MB`,
          revisionNotes: uploadNotes || 'Initial upload',
          status: 'Draft',
          approvedBy: null,
          approvedAt: null,
          diffSummary: 'Initial version — no prior version to compare.',
        }],
        access: [{ userId: 'u-self', name: 'You', role: 'admin' }],
      };
      setDocuments(prev => [newDoc, ...prev]);
      showToast(`Document "${uploadTitle}" created.`);
    }
    closeModal();
  };

  const handleBulkUpload = () => {
    if (bulkFiles.length === 0) { showToast('Add at least one file.'); return; }
    const newDocs: Document[] = bulkFiles.map((fname, idx) => ({
      id: `doc-bulk-${Date.now()}-${idx}`,
      title: fname.replace(/\.[^.]+$/, ''),
      description: '',
      category: bulkCategory,
      tags: [],
      project: 'Unassigned',
      currentVersion: 'v1.0',
      lastModified: new Date().toISOString(),
      modifiedBy: 'You',
      status: 'Draft' as DocStatus,
      checkedOutBy: null,
      checkedOutAt: null,
      versions: [{
        id: `v-bulk-${Date.now()}-${idx}-0`,
        versionLabel: 'v1.0',
        revisionCode: 'REV-001',
        uploadedBy: 'You',
        uploadedAt: new Date().toISOString(),
        fileSize: `${(Math.random() * 10 + 1).toFixed(1)} MB`,
        revisionNotes: 'Bulk upload — initial version.',
        status: 'Draft' as DocStatus,
        approvedBy: null,
        approvedAt: null,
        diffSummary: 'Initial version — no prior version to compare.',
      }],
      access: [{ userId: 'u-self', name: 'You', role: 'admin' }],
    }));
    setDocuments(prev => [...newDocs, ...prev]);
    showToast(`${bulkFiles.length} documents uploaded.`);
    setBulkFiles([]);
    closeModal();
  };

  const handleApprove = (docId: string, versionId: string) => {
    setDocuments(prev => prev.map(d => {
      if (d.id !== docId) return d;
      return {
        ...d,
        status: 'Approved',
        versions: d.versions.map(v =>
          v.id === versionId
            ? { ...v, status: 'Approved' as DocStatus, approvedBy: 'You', approvedAt: new Date().toISOString() }
            : v
        ),
      };
    }));
    showToast('Version approved.');
  };

  const handleSubmitForReview = (docId: string, versionId: string) => {
    setDocuments(prev => prev.map(d => {
      if (d.id !== docId) return d;
      return {
        ...d,
        status: 'Under Review',
        versions: d.versions.map(v =>
          v.id === versionId ? { ...v, status: 'Under Review' as DocStatus } : v
        ),
      };
    }));
    showToast('Submitted for review.');
  };

  const handleAddAccess = () => {
    if (!accessEmail || !selectedDoc) return;
    const newEntry: AccessEntry = { userId: `u-${Date.now()}`, name: accessEmail, role: accessRole };
    setDocuments(prev => prev.map(d =>
      d.id === selectedDoc.id ? { ...d, access: [...d.access, newEntry] } : d
    ));
    setSelectedDoc(prev => prev ? { ...prev, access: [...prev.access, newEntry] } : prev);
    setAccessEmail('');
    showToast(`Access granted to ${accessEmail}.`);
  };

  const handleRemoveAccess = (userId: string) => {
    if (!selectedDoc) return;
    setDocuments(prev => prev.map(d =>
      d.id === selectedDoc.id ? { ...d, access: d.access.filter(a => a.userId !== userId) } : d
    ));
    setSelectedDoc(prev => prev ? { ...prev, access: prev.access.filter(a => a.userId !== userId) } : prev);
    showToast('Access removed.');
  };

  const handleDownload = (doc: Document, ver: DocVersion) => {
    showToast(`Downloading ${doc.title} ${ver.versionLabel}...`);
  };

  // ─── Styles ─────────────────────────────────────────────────────
  const sBtn = (bg: string, small?: boolean): React.CSSProperties => ({
    background: bg, color: '#fff', border: 'none', borderRadius: 6,
    padding: small ? '4px 10px' : '8px 16px', cursor: 'pointer',
    fontSize: small ? 12 : 13, fontWeight: 600, whiteSpace: 'nowrap',
  });

  const sInput: React.CSSProperties = {
    background: C.BG, border: `1px solid ${C.BORDER}`, borderRadius: 6,
    padding: '8px 12px', color: C.TEXT, fontSize: 13, width: '100%', outline: 'none',
  };

  const sSelect: React.CSSProperties = { ...sInput, cursor: 'pointer' };

  const sCard: React.CSSProperties = {
    background: C.RAISED, border: `1px solid ${C.BORDER}`, borderRadius: 10,
    padding: 16, marginBottom: 8,
  };

  const sOverlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };

  const sModal: React.CSSProperties = {
    background: C.RAISED, border: `1px solid ${C.BORDER}`, borderRadius: 12,
    padding: 24, width: 660, maxHeight: '85vh', overflowY: 'auto', position: 'relative',
  };

  const sBadge = (color: string): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11,
    fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44`,
  });

  // ─── Loading ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ background: C.BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${C.BORDER}`, borderTopColor: C.GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: C.DIM, fontSize: 14 }}>Loading documents...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ background: C.BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...sCard, textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>!</div>
          <div style={{ color: C.RED, fontWeight: 600, marginBottom: 8 }}>Error</div>
          <div style={{ color: C.DIM, fontSize: 13, marginBottom: 16 }}>{error}</div>
          <button style={sBtn(C.GOLD)} onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div style={{ background: C.BG, minHeight: '100vh', padding: '24px 32px', color: C.TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, background: C.GREEN, color: '#fff',
          padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 2000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: C.GOLD }}>Document Version Control</h1>
          <p style={{ margin: '4px 0 0', color: C.DIM, fontSize: 13 }}>
            {documents.length} documents across {CATEGORIES.length - 1} categories
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={sBtn(C.PURPLE)} onClick={() => { setBulkFiles([]); setBulkCategory('Uncategorized'); openModal(null, 'bulk'); }}>
            Bulk Upload
          </button>
          <button style={sBtn(C.GOLD)} onClick={() => openModal(null, 'upload')}>
            + New Document
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {([
          ['Total Documents', documents.length, C.GOLD],
          ['Approved', documents.filter(d => d.status === 'Approved').length, C.GREEN],
          ['Under Review', documents.filter(d => d.status === 'Under Review').length, C.AMBER],
          ['Drafts', documents.filter(d => d.status === 'Draft').length, C.DIM],
          ['Checked Out', documents.filter(d => d.checkedOutBy).length, C.RED],
        ] as [string, number, string][]).map(([label, count, color]) => (
          <div key={label} style={{ ...sCard, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color }}>{count}</div>
            <div style={{ fontSize: 12, color: C.DIM, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Search & Filter ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          style={{ ...sInput, maxWidth: 360 }}
          placeholder="Search by name, tags, content, or project..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Category Tabs ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${activeCategory === cat ? C.GOLD : C.BORDER}`,
              background: activeCategory === cat ? `${C.GOLD}22` : 'transparent',
              color: activeCategory === cat ? C.GOLD : C.DIM,
            }}
          >
            {cat} {catCounts[cat] != null ? `(${catCounts[cat]})` : '(0)'}
          </button>
        ))}
      </div>

      {/* ── Document List ── */}
      {filtered.length === 0 ? (
        <div style={{ ...sCard, textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>&#128196;</div>
          <div style={{ color: C.DIM, fontSize: 14, marginBottom: 8 }}>No documents found</div>
          <div style={{ color: C.DIM, fontSize: 12, marginBottom: 16 }}>
            {search ? 'Try adjusting your search or category filter.' : 'Upload your first document to get started.'}
          </div>
          <button style={sBtn(C.GOLD)} onClick={() => openModal(null, 'upload')}>+ New Document</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 1fr 0.8fr 1fr 1fr 1.6fr',
            padding: '8px 16px', fontSize: 11, fontWeight: 700, color: C.DIM, textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            <span>Document</span><span>Category</span><span>Version</span>
            <span>Status</span><span>Modified</span><span>Actions</span>
          </div>

          {filtered.map(doc => (
            <div key={doc.id} style={{
              ...sCard, display: 'grid', gridTemplateColumns: '2fr 1fr 0.8fr 1fr 1fr 1.6fr',
              alignItems: 'center', padding: '12px 16px', marginBottom: 4,
              borderLeft: doc.checkedOutBy ? `3px solid ${C.RED}` : `3px solid transparent`,
            }}>
              {/* Title + tags */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{doc.title}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {doc.tags.map(t => (
                    <span key={t} style={{ fontSize: 10, color: C.BLUE, background: `${C.BLUE}18`, padding: '1px 6px', borderRadius: 4 }}>{t}</span>
                  ))}
                  {doc.checkedOutBy && (
                    <span style={{ fontSize: 10, color: C.RED, background: `${C.RED}18`, padding: '1px 6px', borderRadius: 4 }}>
                      Locked by {doc.checkedOutBy}
                    </span>
                  )}
                </div>
              </div>

              {/* Category */}
              <span style={{ fontSize: 12, color: C.DIM }}>{doc.category}</span>

              {/* Version */}
              <span style={{ fontSize: 13, fontWeight: 600, color: C.GOLD, fontFamily: 'monospace' }}>{doc.currentVersion}</span>

              {/* Status */}
              <span style={sBadge(statusColor[doc.status])}>{doc.status}</span>

              {/* Modified */}
              <div>
                <div style={{ fontSize: 12, color: C.TEXT }}>{fmtDate(doc.lastModified)}</div>
                <div style={{ fontSize: 11, color: C.DIM }}>{doc.modifiedBy}</div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={sBtn(C.BLUE, true)} onClick={() => openModal(doc, 'history')}>History</button>
                <button style={sBtn(C.PURPLE, true)} onClick={() => openModal(doc, 'compare')} disabled={doc.versions.length < 2}>Compare</button>
                <button style={sBtn(C.GOLD, true)} onClick={() => openModal(doc, 'upload')}>Upload</button>
                {!doc.checkedOutBy ? (
                  <button style={sBtn('#374151', true)} onClick={() => handleCheckOut(doc.id)}>Check Out</button>
                ) : doc.checkedOutBy === 'You' ? (
                  <button style={sBtn(C.GREEN, true)} onClick={() => handleCheckIn(doc.id)}>Check In</button>
                ) : null}
                <button style={sBtn('#374151', true)} onClick={() => openModal(doc, 'metadata')}>Info</button>
                <button style={sBtn('#374151', true)} onClick={() => { setSelectedDoc(doc); openModal(doc, 'access'); }}>Access</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─────── MODALS ─────── */}

      {/* ── Version History Modal ── */}
      {modalView === 'history' && selectedDoc && (
        <div style={sOverlay} onClick={closeModal}>
          <div style={sModal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: C.GOLD }}>Version History</h2>
                <p style={{ margin: '4px 0 0', color: C.DIM, fontSize: 13 }}>{selectedDoc.title}</p>
              </div>
              <button style={{ ...sBtn('#374151', true), fontSize: 18 }} onClick={closeModal}>x</button>
            </div>

            <div style={{ position: 'relative', paddingLeft: 24 }}>
              {/* Timeline line */}
              <div style={{ position: 'absolute', left: 8, top: 4, bottom: 4, width: 2, background: C.BORDER }} />

              {[...selectedDoc.versions].reverse().map((ver, idx) => (
                <div key={ver.id} style={{ position: 'relative', marginBottom: 20, paddingBottom: 12, borderBottom: idx < selectedDoc.versions.length - 1 ? `1px solid ${C.BORDER}` : 'none' }}>
                  {/* Timeline dot */}
                  <div style={{
                    position: 'absolute', left: -20, top: 4, width: 12, height: 12, borderRadius: '50%',
                    background: idx === 0 ? C.GOLD : C.BORDER, border: `2px solid ${C.RAISED}`,
                  }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: C.TEXT, fontFamily: 'monospace' }}>{ver.versionLabel}</span>
                        <span style={{ fontSize: 11, color: C.DIM, fontFamily: 'monospace' }}>{ver.revisionCode}</span>
                        <span style={sBadge(statusColor[ver.status])}>{ver.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: C.DIM, marginBottom: 4 }}>
                        Uploaded by <span style={{ color: C.TEXT }}>{ver.uploadedBy}</span> on {fmtDateTime(ver.uploadedAt)} &middot; {ver.fileSize}
                      </div>
                      <div style={{ fontSize: 12, color: C.DIM, marginBottom: 6 }}>
                        <strong style={{ color: C.TEXT }}>Notes:</strong> {ver.revisionNotes}
                      </div>
                      {ver.approvedBy && (
                        <div style={{ fontSize: 11, color: C.GREEN }}>
                          Approved by {ver.approvedBy} on {fmtDate(ver.approvedAt!)}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button style={sBtn(C.BLUE, true)} onClick={() => handleDownload(selectedDoc, ver)}>Download</button>
                      {ver.status === 'Draft' && (
                        <button style={sBtn(C.AMBER, true)} onClick={() => handleSubmitForReview(selectedDoc.id, ver.id)}>Submit Review</button>
                      )}
                      {ver.status === 'Under Review' && (
                        <button style={sBtn(C.GREEN, true)} onClick={() => handleApprove(selectedDoc.id, ver.id)}>Approve</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Compare Versions Modal ── */}
      {modalView === 'compare' && selectedDoc && (
        <div style={sOverlay} onClick={closeModal}>
          <div style={{ ...sModal, width: 760 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: C.GOLD }}>Compare Versions</h2>
              <button style={{ ...sBtn('#374151', true), fontSize: 18 }} onClick={closeModal}>x</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 12, color: C.DIM, display: 'block', marginBottom: 4 }}>Version A (older)</label>
                <select style={sSelect} value={compareA} onChange={e => setCompareA(e.target.value)}>
                  {selectedDoc.versions.map(v => (
                    <option key={v.id} value={v.id}>{v.versionLabel} ({v.revisionCode})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.DIM, display: 'block', marginBottom: 4 }}>Version B (newer)</label>
                <select style={sSelect} value={compareB} onChange={e => setCompareB(e.target.value)}>
                  {selectedDoc.versions.map(v => (
                    <option key={v.id} value={v.id}>{v.versionLabel} ({v.revisionCode})</option>
                  ))}
                </select>
              </div>
            </div>

            {(() => {
              const vA = selectedDoc.versions.find(v => v.id === compareA);
              const vB = selectedDoc.versions.find(v => v.id === compareB);
              if (!vA || !vB) return <div style={{ color: C.DIM, fontSize: 13 }}>Select two versions to compare.</div>;

              return (
                <div>
                  {/* Side-by-side metadata */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    {[vA, vB].map((v, i) => (
                      <div key={v.id} style={{ ...sCard, borderColor: i === 0 ? C.RED : C.GREEN }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: i === 0 ? C.RED : C.GREEN, marginBottom: 6 }}>
                          {v.versionLabel} {i === 0 ? '(Older)' : '(Newer)'}
                        </div>
                        <div style={{ fontSize: 12, color: C.DIM }}>By: {v.uploadedBy}</div>
                        <div style={{ fontSize: 12, color: C.DIM }}>Date: {fmtDateTime(v.uploadedAt)}</div>
                        <div style={{ fontSize: 12, color: C.DIM }}>Size: {v.fileSize}</div>
                        <div style={{ fontSize: 12, color: C.DIM }}>Status: <span style={{ color: statusColor[v.status] }}>{v.status}</span></div>
                      </div>
                    ))}
                  </div>

                  {/* Diff summary */}
                  <div style={{ ...sCard, borderLeft: `3px solid ${C.AMBER}` }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.AMBER, marginBottom: 8 }}>Changes from {vA.versionLabel} to {vB.versionLabel}</div>
                    <div style={{ fontSize: 13, color: C.TEXT, lineHeight: 1.6, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      {vB.diffSummary}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                        <span style={{ color: C.GREEN }}>+ Added: Appendix / Sections updated</span>
                        <span style={{ color: C.RED }}>- Removed: Superseded clauses</span>
                        <span style={{ color: C.AMBER }}>~ Modified: Calculations / Specs revised</span>
                      </div>
                    </div>
                  </div>

                  {/* Simulated line diff */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.DIM, marginBottom: 8 }}>Simulated Text Diff</div>
                    <div style={{ background: C.BG, border: `1px solid ${C.BORDER}`, borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8 }}>
                      <div style={{ color: C.DIM }}>  Line 1: Document Title — {selectedDoc.title}</div>
                      <div style={{ color: C.DIM }}>  Line 2: Revision {vA.revisionCode}</div>
                      <div style={{ color: C.RED, background: `${C.RED}12` }}>- Line 14: Original specification text as per {vA.versionLabel}</div>
                      <div style={{ color: C.GREEN, background: `${C.GREEN}12` }}>+ Line 14: Revised specification text as per {vB.versionLabel}</div>
                      <div style={{ color: C.DIM }}>  Line 15: No changes in this section</div>
                      <div style={{ color: C.RED, background: `${C.RED}12` }}>- Line 28: Previous calculation reference removed</div>
                      <div style={{ color: C.GREEN, background: `${C.GREEN}12` }}>+ Line 28: Updated calculation per review round</div>
                      <div style={{ color: C.GREEN, background: `${C.GREEN}12` }}>+ Line 29: New appendix reference added</div>
                      <div style={{ color: C.DIM }}>  Line 30: End of section</div>
                    </div>
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
          <div style={sModal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: C.GOLD }}>
                {selectedDoc ? `Upload New Version — ${selectedDoc.title}` : 'New Document'}
              </h2>
              <button style={{ ...sBtn('#374151', true), fontSize: 18 }} onClick={closeModal}>x</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* File picker simulation */}
              <div>
                <label style={{ fontSize: 12, color: C.DIM, display: 'block', marginBottom: 4 }}>File</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={{ ...sInput, flex: 1 }} placeholder="No file selected" value={uploadFileName} readOnly />
                  <button style={sBtn(C.BLUE)} onClick={() => setUploadFileName(`document_${Date.now().toString(36)}.pdf`)}>
                    Browse...
                  </button>
                </div>
              </div>

              {/* New doc fields */}
              {!selectedDoc && (
                <>
                  <div>
                    <label style={{ fontSize: 12, color: C.DIM, display: 'block', marginBottom: 4 }}>Title *</label>
                    <input style={sInput} placeholder="Document title" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: C.DIM, display: 'block', marginBottom: 4 }}>Description</label>
                    <textarea style={{ ...sInput, minHeight: 60, resize: 'vertical' }} placeholder="Brief description..." value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, color: C.DIM, display: 'block', marginBottom: 4 }}>Category</label>
                      <select style={sSelect} value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}>
                        {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: C.DIM, display: 'block', marginBottom: 4 }}>Project</label>
                      <input style={sInput} placeholder="Project name" value={uploadProject} onChange={e => setUploadProject(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: C.DIM, display: 'block', marginBottom: 4 }}>Tags (comma separated)</label>
                    <input style={sInput} placeholder="structural, concrete, phase-1" value={uploadTags} onChange={e => setUploadTags(e.target.value)} />
                  </div>
                </>
              )}

              {/* Revision notes */}
              <div>
                <label style={{ fontSize: 12, color: C.DIM, display: 'block', marginBottom: 4 }}>Revision Notes</label>
                <textarea style={{ ...sInput, minHeight: 60, resize: 'vertical' }} placeholder="Describe what changed..." value={uploadNotes} onChange={e => setUploadNotes(e.target.value)} />
              </div>

              {selectedDoc && (
                <div style={{ ...sCard, borderLeft: `3px solid ${C.BLUE}` }}>
                  <div style={{ fontSize: 12, color: C.DIM }}>
                    Current version: <strong style={{ color: C.GOLD }}>{selectedDoc.currentVersion}</strong> &middot;
                    Next revision code: <strong style={{ color: C.TEXT }}>REV-{String(selectedDoc.versions.length + 1).padStart(3, '0')}</strong>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button style={sBtn('#374151')} onClick={closeModal}>Cancel</button>
                <button style={sBtn(C.GOLD)} onClick={handleUploadVersion}>
                  {selectedDoc ? 'Upload Version' : 'Create Document'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Metadata Modal ── */}
      {modalView === 'metadata' && selectedDoc && (
        <div style={sOverlay} onClick={closeModal}>
          <div style={sModal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: C.GOLD }}>Document Metadata</h2>
              <button style={{ ...sBtn('#374151', true), fontSize: 18 }} onClick={closeModal}>x</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {([
                ['Title', selectedDoc.title],
                ['Category', selectedDoc.category],
                ['Project', selectedDoc.project],
                ['Current Version', selectedDoc.currentVersion],
                ['Status', selectedDoc.status],
                ['Last Modified', fmtDateTime(selectedDoc.lastModified)],
                ['Modified By', selectedDoc.modifiedBy],
                ['Total Versions', String(selectedDoc.versions.length)],
                ['Latest Revision', selectedDoc.versions[selectedDoc.versions.length - 1].revisionCode],
                ['Checked Out', selectedDoc.checkedOutBy ? `${selectedDoc.checkedOutBy} (${fmtDateTime(selectedDoc.checkedOutAt!)})` : 'No'],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: C.DIM, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                  <div style={{ fontSize: 14, color: C.TEXT, fontWeight: 500 }}>{val}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: C.DIM, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Description</div>
              <div style={{ fontSize: 13, color: C.TEXT, lineHeight: 1.5 }}>{selectedDoc.description}</div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: C.DIM, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Tags</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selectedDoc.tags.length > 0 ? selectedDoc.tags.map(t => (
                  <span key={t} style={{ ...sBadge(C.BLUE), fontSize: 12 }}>{t}</span>
                )) : <span style={{ color: C.DIM, fontSize: 12 }}>No tags</span>}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: C.DIM, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Access Control</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selectedDoc.access.map(a => (
                  <span key={a.userId} style={{ ...sBadge(a.role === 'admin' ? C.GOLD : a.role === 'editor' ? C.GREEN : C.DIM), fontSize: 12 }}>
                    {a.name} ({a.role})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Access Control Modal ── */}
      {modalView === 'access' && selectedDoc && (
        <div style={sOverlay} onClick={closeModal}>
          <div style={sModal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: C.GOLD }}>Access Control</h2>
                <p style={{ margin: '4px 0 0', color: C.DIM, fontSize: 13 }}>{selectedDoc.title}</p>
              </div>
              <button style={{ ...sBtn('#374151', true), fontSize: 18 }} onClick={closeModal}>x</button>
            </div>

            {/* Current access list */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: C.DIM, marginBottom: 8, fontWeight: 600 }}>Current Access</div>
              {selectedDoc.access.map(a => (
                <div key={a.userId} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', background: C.BG, borderRadius: 6, marginBottom: 4,
                  border: `1px solid ${C.BORDER}`,
                }}>
                  <div>
                    <span style={{ fontSize: 13, color: C.TEXT, fontWeight: 500 }}>{a.name}</span>
                    <span style={{ ...sBadge(a.role === 'admin' ? C.GOLD : a.role === 'editor' ? C.GREEN : C.DIM), marginLeft: 8, fontSize: 10 }}>
                      {a.role}
                    </span>
                  </div>
                  {a.role !== 'admin' && (
                    <button style={{ ...sBtn(C.RED, true), fontSize: 11 }} onClick={() => handleRemoveAccess(a.userId)}>Remove</button>
                  )}
                </div>
              ))}
            </div>

            {/* Add new access */}
            <div style={{ borderTop: `1px solid ${C.BORDER}`, paddingTop: 16 }}>
              <div style={{ fontSize: 12, color: C.DIM, marginBottom: 8, fontWeight: 600 }}>Grant Access</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ ...sInput, flex: 1 }}
                  placeholder="Name or email"
                  value={accessEmail}
                  onChange={e => setAccessEmail(e.target.value)}
                />
                <select style={{ ...sSelect, width: 120 }} value={accessRole} onChange={e => setAccessRole(e.target.value as 'viewer' | 'editor' | 'admin')}>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
                <button style={sBtn(C.GREEN)} onClick={handleAddAccess}>Add</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Upload Modal ── */}
      {modalView === 'bulk' && (
        <div style={sOverlay} onClick={closeModal}>
          <div style={sModal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: C.PURPLE }}>Bulk Upload</h2>
              <button style={{ ...sBtn('#374151', true), fontSize: 18 }} onClick={closeModal}>x</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.DIM, display: 'block', marginBottom: 4 }}>Category for all files</label>
              <select style={sSelect} value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}>
                {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Simulated file add */}
            <div style={{ marginBottom: 16 }}>
              <button style={sBtn(C.BLUE)} onClick={() => {
                const names = [
                  'Foundation_Plan_R3.pdf', 'Steel_Schedule_v2.xlsx', 'MEP_Coordination.dwg',
                  'Concrete_Mix_Design.pdf', 'Rebar_Shop_Drawing.pdf', 'Structural_Calc.pdf',
                  'Site_Survey_Report.pdf', 'Geotech_Boring_Log.pdf',
                ];
                const pick = names[bulkFiles.length % names.length];
                setBulkFiles(prev => [...prev, pick]);
              }}>
                + Add File (Simulated)
              </button>
            </div>

            {bulkFiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: C.DIM, fontSize: 13 }}>
                No files added yet. Click "Add File" to simulate selecting files.
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {bulkFiles.map((f, idx) => (
                  <div key={idx} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 12px', background: C.BG, borderRadius: 6, marginBottom: 4,
                    border: `1px solid ${C.BORDER}`,
                  }}>
                    <span style={{ fontSize: 13, color: C.TEXT }}>{f}</span>
                    <button
                      style={{ ...sBtn(C.RED, true), fontSize: 11 }}
                      onClick={() => setBulkFiles(prev => prev.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div style={{ fontSize: 12, color: C.DIM, marginTop: 8 }}>{bulkFiles.length} file(s) ready</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button style={sBtn('#374151')} onClick={closeModal}>Cancel</button>
              <button style={sBtn(C.PURPLE)} onClick={handleBulkUpload} disabled={bulkFiles.length === 0}>
                Upload {bulkFiles.length} File{bulkFiles.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
