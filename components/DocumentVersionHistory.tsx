'use client';
/**
 * DocumentVersionHistory
 * ----------------------
 * Collapsible "N versions ▼" list for a given source_type + source_id.
 * When empty → renders nothing. When a version is clicked, the raw HTML
 * is fetched and opened in a new tab via Blob URL.
 */
import React, { useEffect, useState, useCallback } from 'react';

const GOLD = '#C8960F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#1E3A5F';
const RAISED = '#0D1D2E';
const GREEN = '#22C55E';

interface VersionRow {
  id: string;
  version_number: number;
  doc_type: string;
  approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface DocumentVersionHistoryProps {
  sourceType: string;
  sourceId: string;
  onViewVersion?: (versionNumber: number) => void;
  currentVersion?: number;
  compact?: boolean;
}

export default function DocumentVersionHistory(props: DocumentVersionHistoryProps) {
  const { sourceType, sourceId, onViewVersion, currentVersion, compact } = props;
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);

  useEffect(() => {
    if (!sourceType || !sourceId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/documents/version?sourceType=${encodeURIComponent(sourceType)}&sourceId=${encodeURIComponent(sourceId)}`);
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled) setVersions(j.versions || []);
      } catch { /* leave null */ }
    })();
    return () => { cancelled = true; };
  }, [sourceType, sourceId]);

  const defaultOpenVersion = useCallback(async (n: number) => {
    setViewing(n);
    try {
      const r = await fetch(`/api/documents/version?sourceType=${encodeURIComponent(sourceType)}&sourceId=${encodeURIComponent(sourceId)}&version=${n}`);
      if (!r.ok) {
        setLoading(false);
        setViewing(null);
        return;
      }
      const j = await r.json();
      const html: string = j?.version?.html_content || '';
      if (!html) {
        setViewing(null);
        return;
      }
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      // Revoke after a few seconds (new tab already has the page)
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch { /* ignore */ }
    finally { setViewing(null); }
  }, [sourceType, sourceId]);

  if (!versions || versions.length === 0) return null;

  async function handleView(n: number) {
    if (loading) return;
    setLoading(true);
    try {
      if (onViewVersion) {
        onViewVersion(n);
      } else {
        await defaultOpenVersion(n);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        background: compact ? 'transparent' : RAISED,
        border: compact ? 'none' : `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: compact ? '0' : '10px 14px',
        marginTop: 8,
      }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        type="button"
        style={{
          background: 'transparent', border: 'none', color: GOLD,
          fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0,
        }}
      >
        {versions.length} version{versions.length !== 1 ? 's' : ''} {open ? '▲' : '▼'}
      </button>

      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {versions.map(v => {
            const isCurrent = currentVersion === v.version_number;
            return (
              <div
                key={v.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '54px 1fr 90px 70px',
                  gap: 10, alignItems: 'center',
                  padding: '8px 10px',
                  background: '#0d1117',
                  border: `1px solid ${isCurrent ? GOLD + '55' : BORDER}`,
                  borderRadius: 8,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, color: isCurrent ? GOLD : TEXT }}>
                  v{v.version_number}
                </div>
                <div style={{ fontSize: 11, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {new Date(v.created_at).toLocaleString()}
                  {v.notes && <span style={{ marginLeft: 8, color: TEXT, opacity: 0.75 }}>· {v.notes}</span>}
                </div>
                <div
                  style={{
                    fontSize: 10, fontWeight: 700, textAlign: 'center',
                    color: v.approved ? GREEN : DIM,
                    background: v.approved ? 'rgba(34,197,94,.15)' : 'transparent',
                    borderRadius: 20, padding: '2px 8px',
                    border: `1px solid ${v.approved ? 'rgba(34,197,94,.35)' : BORDER}`,
                  }}
                >
                  {v.approved ? 'Approved' : 'Draft'}
                </div>
                <button
                  onClick={() => handleView(v.version_number)}
                  disabled={viewing === v.version_number}
                  style={{
                    background: 'transparent', border: `1px solid ${BORDER}`, color: TEXT,
                    fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 6,
                    cursor: viewing === v.version_number ? 'not-allowed' : 'pointer',
                  }}
                >
                  {viewing === v.version_number ? '…' : 'View'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
