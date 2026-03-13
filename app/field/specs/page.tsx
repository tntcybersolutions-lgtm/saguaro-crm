'use client';
/**
 * Saguaro Field — Specification Sections Viewer/Manager
 * Browse, search, and manage spec sections grouped by CSI MasterFormat divisions.
 * Offline-capable with enqueue for create operations.
 */
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

/* ── Theme constants ── */
const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

/* ── CSI MasterFormat Divisions 01–49 ── */
const CSI_DIVISIONS: Record<string, string> = {
  '01': 'General Requirements',
  '02': 'Existing Conditions',
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Metals',
  '06': 'Wood, Plastics, and Composites',
  '07': 'Thermal and Moisture Protection',
  '08': 'Openings',
  '09': 'Finishes',
  '10': 'Specialties',
  '11': 'Equipment',
  '12': 'Furnishings',
  '13': 'Special Construction',
  '14': 'Conveying Equipment',
  '15': 'Reserved for Future Expansion',
  '16': 'Reserved for Future Expansion',
  '17': 'Reserved for Future Expansion',
  '18': 'Reserved for Future Expansion',
  '19': 'Reserved for Future Expansion',
  '20': 'Reserved for Future Expansion',
  '21': 'Fire Suppression',
  '22': 'Plumbing',
  '23': 'Heating, Ventilating, and Air Conditioning (HVAC)',
  '24': 'Reserved for Future Expansion',
  '25': 'Integrated Automation',
  '26': 'Electrical',
  '27': 'Communications',
  '28': 'Electronic Safety and Security',
  '29': 'Reserved for Future Expansion',
  '30': 'Reserved for Future Expansion',
  '31': 'Earthwork',
  '32': 'Exterior Improvements',
  '33': 'Utilities',
  '34': 'Transportation',
  '35': 'Waterway and Marine Construction',
  '36': 'Reserved for Future Expansion',
  '37': 'Reserved for Future Expansion',
  '38': 'Reserved for Future Expansion',
  '39': 'Reserved for Future Expansion',
  '40': 'Process Interconnections',
  '41': 'Material Processing and Handling Equipment',
  '42': 'Process Heating, Cooling, and Drying Equipment',
  '43': 'Process Gas and Liquid Handling, Purification, and Storage Equipment',
  '44': 'Pollution and Waste Control Equipment',
  '45': 'Industry-Specific Manufacturing Equipment',
  '46': 'Water and Wastewater Equipment',
  '47': 'Reserved for Future Expansion',
  '48': 'Electrical Power Generation',
  '49': 'Reserved for Future Expansion',
};

/* ── Interfaces ── */
interface SpecSection {
  id: string;
  section_number: string;
  title: string;
  content: string;
  file_url: string | null;
  version: number;
  created_at?: string;
  updated_at?: string;
}

/* ── Utility: extract division code from section number ── */
function getDivisionCode(sectionNumber: string): string {
  const cleaned = sectionNumber.replace(/\s+/g, '').replace(/^0+/, '');
  const twoDigit = sectionNumber.replace(/\s+/g, '').substring(0, 2);
  if (CSI_DIVISIONS[twoDigit]) return twoDigit;
  const oneDigit = sectionNumber.replace(/\s+/g, '').substring(0, 1);
  if (parseInt(oneDigit) >= 1 && parseInt(oneDigit) <= 9) return '0' + oneDigit;
  return twoDigit;
}

/* ── localStorage helpers ── */
function getBookmarks(): string[] {
  try {
    const raw = localStorage.getItem('saguaro-spec-bookmarks');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function setBookmarks(ids: string[]) {
  try { localStorage.setItem('saguaro-spec-bookmarks', JSON.stringify(ids)); } catch {}
}
function getRecentlyViewed(): string[] {
  try {
    const raw = localStorage.getItem('saguaro-spec-recent');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function addRecentlyViewed(id: string) {
  try {
    const recent = getRecentlyViewed().filter(r => r !== id);
    recent.unshift(id);
    localStorage.setItem('saguaro-spec-recent', JSON.stringify(recent.slice(0, 20)));
  } catch {}
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════ */
function SpecsPageInner() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');

  /* ── State ── */
  const [sections, setSections] = useState<SpecSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [divisionFilter, setDivisionFilter] = useState<string>('all');
  const [collapsedDivisions, setCollapsedDivisions] = useState<Set<string>>(new Set());
  const [selectedSection, setSelectedSection] = useState<SpecSection | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [bookmarks, setBookmarksState] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [showRecentOnly, setShowRecentOnly] = useState(false);
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  /* ── Create form state ── */
  const [newSectionNumber, setNewSectionNumber] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newFileUrl, setNewFileUrl] = useState('');
  const [creating, setCreating] = useState(false);

  /* ── Online/offline tracking ── */
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  /* ── Toast auto-clear ── */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Load bookmarks & recents from localStorage ── */
  useEffect(() => {
    setBookmarksState(getBookmarks());
    setRecentIds(getRecentlyViewed());
  }, []);

  /* ── Fetch spec sections ── */
  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/specs`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          const arr: SpecSection[] = Array.isArray(data) ? data : (data.specs || data.data || []);
          setSections(arr);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load specs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId]);

  /* ── Toggle bookmark ── */
  function toggleBookmark(id: string) {
    setBookmarksState(prev => {
      const next = prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id];
      setBookmarks(next);
      return next;
    });
  }

  /* ── Open detail view ── */
  function openDetail(sec: SpecSection) {
    setSelectedSection(sec);
    addRecentlyViewed(sec.id);
    setRecentIds(getRecentlyViewed());
  }

  /* ── Create spec section ── */
  async function handleCreate() {
    if (!projectId || !newSectionNumber.trim() || !newTitle.trim()) return;
    setCreating(true);
    const payload = {
      section_number: newSectionNumber.trim(),
      title: newTitle.trim(),
      content: newContent.trim(),
      file_url: newFileUrl.trim() || null,
      version: 1,
    };
    const url = `/api/projects/${projectId}/specs`;
    const body = JSON.stringify(payload);
    try {
      if (online) {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const created = await res.json();
        const newSpec: SpecSection = created.spec || created.data || created;
        setSections(prev => [...prev, newSpec]);
        setToast('Spec section created');
      } else {
        await enqueue({ url, method: 'POST', body, contentType: 'application/json', isFormData: false });
        setToast('Saved offline — will sync when online');
      }
      setNewSectionNumber('');
      setNewTitle('');
      setNewContent('');
      setNewFileUrl('');
      setShowCreateForm(false);
    } catch (err: unknown) {
      try {
        await enqueue({ url, method: 'POST', body, contentType: 'application/json', isFormData: false });
        setToast('Network error — queued offline');
      } catch {
        setToast('Failed to save');
      }
    } finally {
      setCreating(false);
    }
  }

  /* ── Grouped & filtered data ── */
  const filtered = useMemo(() => {
    let list = [...sections];
    const q = searchText.toLowerCase().trim();
    if (q) {
      list = list.filter(s =>
        s.section_number.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q)
      );
    }
    if (divisionFilter !== 'all') {
      list = list.filter(s => getDivisionCode(s.section_number) === divisionFilter);
    }
    if (showBookmarksOnly) {
      list = list.filter(s => bookmarks.includes(s.id));
    }
    if (showRecentOnly) {
      list = list.filter(s => recentIds.includes(s.id));
      list.sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));
    }
    return list;
  }, [sections, searchText, divisionFilter, showBookmarksOnly, showRecentOnly, bookmarks, recentIds]);

  const grouped = useMemo(() => {
    const map: Record<string, SpecSection[]> = {};
    for (const sec of filtered) {
      const div = getDivisionCode(sec.section_number);
      if (!map[div]) map[div] = [];
      map[div].push(sec);
    }
    /* Sort sections within each division */
    for (const div of Object.keys(map)) {
      map[div].sort((a, b) => a.section_number.localeCompare(b.section_number, undefined, { numeric: true }));
    }
    return map;
  }, [filtered]);

  /* List of division codes that have sections, plus all 49 when no filter */
  const visibleDivisions = useMemo(() => {
    if (divisionFilter !== 'all') return [divisionFilter];
    const divCodes = Object.keys(CSI_DIVISIONS).sort();
    return divCodes;
  }, [divisionFilter]);

  /* ── Toggle division collapse ── */
  function toggleCollapse(div: string) {
    setCollapsedDivisions(prev => {
      const next = new Set(prev);
      if (next.has(div)) next.delete(div); else next.add(div);
      return next;
    });
  }

  /* ── Collapse / expand all ── */
  function collapseAll() {
    setCollapsedDivisions(new Set(Object.keys(CSI_DIVISIONS)));
  }
  function expandAll() {
    setCollapsedDivisions(new Set());
  }

  /* ── PDF export via print ── */
  function handlePrint() {
    window.print();
  }

  /* ══════════════════════════════════════════
     RENDER: No project
     ══════════════════════════════════════════ */
  if (!projectId) {
    return (
      <div style={{ background: '#0B1623', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: AMBER, fontSize: 16 }}>No project selected. Please open a project first.</p>
      </div>
    );
  }

  /* ══════════════════════════════════════════
     RENDER: Detail view
     ══════════════════════════════════════════ */
  if (selectedSection) {
    const sec = selectedSection;
    const isBookmarked = bookmarks.includes(sec.id);
    return (
      <div style={{ background: '#0B1623', minHeight: '100vh', color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        {/* Detail header */}
        <div style={{ background: RAISED, borderBottom: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
          <button
            onClick={() => setSelectedSection(null)}
            style={{ background: 'none', border: 'none', color: GOLD, fontSize: 18, cursor: 'pointer', padding: '4px 8px' }}
          >
            &#8592; Back
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: DIM }}>{sec.section_number}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sec.title}</div>
          </div>
          <button
            onClick={() => toggleBookmark(sec.id)}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: isBookmarked ? GOLD : DIM }}
            title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
          >
            {isBookmarked ? '\u2605' : '\u2606'}
          </button>
          <button
            onClick={handlePrint}
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: DIM }}
            title="Print / Export PDF"
          >
            \uD83D\uDDA8
          </button>
        </div>

        {/* Detail body */}
        <div style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>
          {/* Meta info */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <span style={{ background: BORDER, color: GOLD, padding: '4px 12px', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>
              Division {getDivisionCode(sec.section_number)} — {CSI_DIVISIONS[getDivisionCode(sec.section_number)] || 'Unknown'}
            </span>
            <span style={{ background: BORDER, color: BLUE, padding: '4px 12px', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>
              Version {sec.version}
            </span>
            {sec.updated_at && (
              <span style={{ background: BORDER, color: DIM, padding: '4px 12px', borderRadius: 12, fontSize: 13 }}>
                Updated: {new Date(sec.updated_at).toLocaleDateString()}
              </span>
            )}
            {sec.created_at && (
              <span style={{ background: BORDER, color: DIM, padding: '4px 12px', borderRadius: 12, fontSize: 13 }}>
                Created: {new Date(sec.created_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Attached file link */}
          {sec.file_url && (
            <div style={{ marginBottom: 20 }}>
              <a
                href={sec.file_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: BORDER, color: GOLD, padding: '10px 16px', borderRadius: 8,
                  textDecoration: 'none', fontSize: 14, fontWeight: 600,
                  border: `1px solid ${GOLD}33`,
                }}
              >
                <span style={{ fontSize: 18 }}>&#128196;</span>
                View Attached PDF / File
                <span style={{ fontSize: 12, color: DIM, marginLeft: 4 }}>&#8599;</span>
              </a>
            </div>
          )}

          {/* Section content */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ color: GOLD, fontSize: 15, fontWeight: 700, marginBottom: 12, borderBottom: `1px solid ${BORDER}`, paddingBottom: 8 }}>
              Section Content
            </h3>
            <div style={{
              background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: 16, fontSize: 14, lineHeight: 1.7, color: TEXT,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {sec.content || 'No content available for this section.'}
            </div>
          </div>

          {/* Version history */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ color: GOLD, fontSize: 15, fontWeight: 700, marginBottom: 12, borderBottom: `1px solid ${BORDER}`, paddingBottom: 8 }}>
              Version Information
            </h3>
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ color: DIM, fontSize: 13, width: 120 }}>Current Version:</span>
                <span style={{ color: GREEN, fontWeight: 700, fontSize: 16 }}>{sec.version}</span>
              </div>
              {sec.created_at && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <span style={{ color: DIM, fontSize: 13, width: 120 }}>First Published:</span>
                  <span style={{ color: TEXT, fontSize: 14 }}>{new Date(sec.created_at).toLocaleString()}</span>
                </div>
              )}
              {sec.updated_at && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: DIM, fontSize: 13, width: 120 }}>Last Revised:</span>
                  <span style={{ color: TEXT, fontSize: 14 }}>{new Date(sec.updated_at).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════
     RENDER: Create form
     ══════════════════════════════════════════ */
  if (showCreateForm) {
    return (
      <div style={{ background: '#0B1623', minHeight: '100vh', color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ background: RAISED, borderBottom: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
          <button
            onClick={() => setShowCreateForm(false)}
            style={{ background: 'none', border: 'none', color: GOLD, fontSize: 18, cursor: 'pointer', padding: '4px 8px' }}
          >
            &#8592; Cancel
          </button>
          <h2 style={{ flex: 1, margin: 0, fontSize: 17, fontWeight: 700, color: TEXT }}>New Spec Section</h2>
        </div>

        <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
          {!online && (
            <div style={{ background: `${AMBER}20`, border: `1px solid ${AMBER}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: AMBER, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>&#9888;</span>
              You are offline. This section will be queued and synced when reconnected.
            </div>
          )}

          {/* Section Number */}
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ color: DIM, fontSize: 13, display: 'block', marginBottom: 6 }}>Section Number *</span>
            <input
              type="text"
              value={newSectionNumber}
              onChange={e => setNewSectionNumber(e.target.value)}
              placeholder="e.g., 03 30 00"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 15,
                background: RAISED, border: `1px solid ${BORDER}`, color: TEXT,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </label>

          {/* Title */}
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ color: DIM, fontSize: 13, display: 'block', marginBottom: 6 }}>Title *</span>
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="e.g., Cast-in-Place Concrete"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 15,
                background: RAISED, border: `1px solid ${BORDER}`, color: TEXT,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </label>

          {/* Content */}
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ color: DIM, fontSize: 13, display: 'block', marginBottom: 6 }}>Content</span>
            <textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="Enter specification section content..."
              rows={10}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
                background: RAISED, border: `1px solid ${BORDER}`, color: TEXT,
                outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            />
          </label>

          {/* File URL */}
          <label style={{ display: 'block', marginBottom: 24 }}>
            <span style={{ color: DIM, fontSize: 13, display: 'block', marginBottom: 6 }}>File / PDF URL (optional)</span>
            <input
              type="url"
              value={newFileUrl}
              onChange={e => setNewFileUrl(e.target.value)}
              placeholder="https://..."
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 15,
                background: RAISED, border: `1px solid ${BORDER}`, color: TEXT,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </label>

          {/* Division preview */}
          {newSectionNumber.trim() && (
            <div style={{ marginBottom: 20, padding: '10px 14px', background: BORDER, borderRadius: 8, fontSize: 13, color: DIM }}>
              Division: <span style={{ color: GOLD, fontWeight: 600 }}>
                {getDivisionCode(newSectionNumber)} — {CSI_DIVISIONS[getDivisionCode(newSectionNumber)] || 'Unknown'}
              </span>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleCreate}
            disabled={creating || !newSectionNumber.trim() || !newTitle.trim()}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 10, fontSize: 16, fontWeight: 700,
              background: (!newSectionNumber.trim() || !newTitle.trim()) ? `${GOLD}44` : GOLD,
              color: '#0B1623', border: 'none', cursor: creating ? 'wait' : 'pointer',
              opacity: creating ? 0.6 : 1,
            }}
          >
            {creating ? 'Saving...' : online ? 'Create Spec Section' : 'Queue Offline'}
          </button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════
     RENDER: Main list view
     ══════════════════════════════════════════ */
  return (
    <div style={{ background: '#0B1623', minHeight: '100vh', color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 999,
          background: RAISED, border: `1px solid ${GOLD}`, borderRadius: 10, padding: '10px 20px',
          color: GOLD, fontSize: 14, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {toast}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ background: RAISED, borderBottom: `1px solid ${BORDER}`, padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: GOLD }}>Specifications</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!online && (
              <span style={{ color: AMBER, fontSize: 12, fontWeight: 600 }}>&#9888; Offline</span>
            )}
            <button
              onClick={handlePrint}
              style={{ background: BORDER, border: 'none', borderRadius: 8, padding: '6px 10px', color: DIM, fontSize: 14, cursor: 'pointer' }}
              title="Print / Export PDF"
            >
              \uD83D\uDDA8
            </button>
            <button
              onClick={() => setShowCreateForm(true)}
              style={{ background: GOLD, border: 'none', borderRadius: 8, padding: '6px 14px', color: '#0B1623', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              + New
            </button>
          </div>
        </div>

        {/* ── Search bar ── */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Search section numbers or titles..."
            style={{
              width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, fontSize: 14,
              background: '#0B1623', border: `1px solid ${BORDER}`, color: TEXT,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 16, pointerEvents: 'none' }}>
            &#128269;
          </span>
          {searchText && (
            <button
              onClick={() => setSearchText('')}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: DIM, fontSize: 16, cursor: 'pointer' }}
            >
              &#10005;
            </button>
          )}
        </div>

        {/* ── Division filter ── */}
        <div style={{ marginBottom: 8 }}>
          <select
            value={divisionFilter}
            onChange={e => setDivisionFilter(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
              background: '#0B1623', border: `1px solid ${BORDER}`, color: TEXT,
              outline: 'none', boxSizing: 'border-box',
            }}
          >
            <option value="all">All Divisions (01–49)</option>
            {Object.entries(CSI_DIVISIONS).map(([code, name]) => (
              <option key={code} value={code}>
                Division {code} — {name}
              </option>
            ))}
          </select>
        </div>

        {/* ── Filter chips ── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => { setShowBookmarksOnly(!showBookmarksOnly); setShowRecentOnly(false); }}
            style={{
              padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: showBookmarksOnly ? GOLD : BORDER,
              color: showBookmarksOnly ? '#0B1623' : DIM,
              border: `1px solid ${showBookmarksOnly ? GOLD : BORDER}`,
            }}
          >
            &#9733; Bookmarks ({bookmarks.length})
          </button>
          <button
            onClick={() => { setShowRecentOnly(!showRecentOnly); setShowBookmarksOnly(false); }}
            style={{
              padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: showRecentOnly ? BLUE : BORDER,
              color: showRecentOnly ? '#fff' : DIM,
              border: `1px solid ${showRecentOnly ? BLUE : BORDER}`,
            }}
          >
            &#128339; Recent ({recentIds.length})
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={expandAll}
            style={{ background: 'none', border: 'none', color: DIM, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            style={{ background: 'none', border: 'none', color: DIM, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Collapse All
          </button>
        </div>

        {/* ── Summary stats ── */}
        <div style={{ marginTop: 8, fontSize: 12, color: DIM }}>
          {filtered.length} section{filtered.length !== 1 ? 's' : ''} found
          {searchText && <span> matching &ldquo;{searchText}&rdquo;</span>}
        </div>
      </div>

      {/* ── Loading / Error ── */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: DIM, fontSize: 14 }}>Loading specifications...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {error && (
        <div style={{ margin: 16, padding: '12px 16px', background: `${RED}18`, border: `1px solid ${RED}44`, borderRadius: 8, color: RED, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>&#9888;</span>
          {error}
          <button
            onClick={() => window.location.reload()}
            style={{ marginLeft: 'auto', background: RED, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && sections.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>&#128214;</div>
          <p style={{ color: DIM, fontSize: 15, marginBottom: 16 }}>No specification sections yet.</p>
          <button
            onClick={() => setShowCreateForm(true)}
            style={{ background: GOLD, color: '#0B1623', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            Create First Section
          </button>
        </div>
      )}

      {/* ── No results for filters ── */}
      {!loading && !error && sections.length > 0 && filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: DIM, fontSize: 15 }}>No sections match your filters.</p>
          <button
            onClick={() => { setSearchText(''); setDivisionFilter('all'); setShowBookmarksOnly(false); setShowRecentOnly(false); }}
            style={{ background: BORDER, color: GOLD, border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 14, cursor: 'pointer', marginTop: 12 }}
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* ── Division groups ── */}
      {!loading && !error && filtered.length > 0 && (
        <div style={{ padding: '8px 0 80px' }}>
          {visibleDivisions.map(divCode => {
            const divSections = grouped[divCode];
            const count = divSections ? divSections.length : 0;
            const isCollapsed = collapsedDivisions.has(divCode);
            const divName = CSI_DIVISIONS[divCode] || 'Unknown';

            return (
              <div key={divCode} style={{ marginBottom: 2 }}>
                {/* Division header */}
                <button
                  onClick={() => toggleCollapse(divCode)}
                  style={{
                    display: 'flex', alignItems: 'center', width: '100%', padding: '10px 16px',
                    background: count > 0 ? `${BORDER}88` : `${BORDER}33`,
                    border: 'none', borderBottom: `1px solid ${BORDER}44`, cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ color: GOLD, fontSize: 11, fontWeight: 800, width: 28, flexShrink: 0 }}>
                    {divCode}
                  </span>
                  <span style={{ color: count > 0 ? TEXT : `${DIM}88`, fontSize: 13, fontWeight: 600, flex: 1, marginLeft: 8 }}>
                    {divName}
                  </span>
                  {count > 0 && (
                    <span style={{
                      background: GOLD, color: '#0B1623', fontSize: 11, fontWeight: 800,
                      borderRadius: 10, padding: '2px 8px', marginRight: 8, minWidth: 20, textAlign: 'center',
                    }}>
                      {count}
                    </span>
                  )}
                  <span style={{ color: DIM, fontSize: 14, transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                    &#9660;
                  </span>
                </button>

                {/* Section rows */}
                {!isCollapsed && divSections && divSections.length > 0 && (
                  <div>
                    {divSections.map(sec => {
                      const isBookmarked = bookmarks.includes(sec.id);
                      const isRecent = recentIds.includes(sec.id);
                      return (
                        <div
                          key={sec.id}
                          onClick={() => openDetail(sec)}
                          style={{
                            display: 'flex', alignItems: 'center', padding: '12px 16px',
                            borderBottom: `1px solid ${BORDER}22`, cursor: 'pointer',
                            background: '#0B1623',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = RAISED; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '#0B1623'; }}
                        >
                          {/* Section number */}
                          <div style={{ width: 80, flexShrink: 0 }}>
                            <span style={{ color: GOLD, fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>
                              {sec.section_number}
                            </span>
                          </div>

                          {/* Title and meta */}
                          <div style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {sec.title}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: DIM }}>v{sec.version}</span>
                              {sec.file_url && (
                                <span style={{ fontSize: 11, color: BLUE }}>&#128196; PDF</span>
                              )}
                              {isRecent && (
                                <span style={{ fontSize: 11, color: AMBER }}>&#128339; Recent</span>
                              )}
                            </div>
                          </div>

                          {/* Bookmark button */}
                          <button
                            onClick={e => { e.stopPropagation(); toggleBookmark(sec.id); }}
                            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: isBookmarked ? GOLD : `${DIM}66`, padding: '4px 8px', flexShrink: 0 }}
                          >
                            {isBookmarked ? '\u2605' : '\u2606'}
                          </button>

                          {/* Chevron */}
                          <span style={{ color: DIM, fontSize: 14, flexShrink: 0 }}>&#8250;</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   DEFAULT EXPORT with Suspense wrapper
   ══════════════════════════════════════════ */
export default function SpecsPage() {
  return (
    <Suspense fallback={
      <div style={{ background: '#0B1623', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #1E3A5F', borderTopColor: '#D4A017', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: '#8BAAC8', fontSize: 14 }}>Loading specifications...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    }>
      <SpecsPageInner />
    </Suspense>
  );
}
