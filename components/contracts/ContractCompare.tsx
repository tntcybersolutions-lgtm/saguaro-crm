'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { FileDropzone } from '@/components/FileDropzone';
import { ArrowsLeftRight, FileText, X } from '@phosphor-icons/react';

/**
 * ContractCompare — the copy you sent, beside the copy that came back.
 *
 * A sub marks up a subcontract and emails it back. Today that PDF lands in
 * somebody's inbox and the GC reads the two documents in separate tabs, which
 * is how a struck-out indemnity clause gets signed. So: drop the returned file
 * here, and it sits next to what was sent, tagged to this contract rather than
 * loose in the project's file list.
 *
 * The panes are two viewers, not a redline engine. The system can tell you
 * exactly what changed between two versions IT generated — that is what the
 * history panel does, on the data. It cannot diff a PDF a sub drew on, and
 * pretending otherwise would be worse than showing them side by side.
 */

const GOLD = 'var(--brand-primary)';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#1E3A5F';
const CARD = 'var(--bg-surface)';

interface FileRow {
  id: string;
  file_name: string;
  file_url: string;
  created_at?: string | null;
  uploaded_by_name?: string | null;
}

export interface ContractCompareProps {
  projectId: string;
  /** The contract just generated — always the left pane. */
  pdfUrl: string;
  title: string;
  /** Tags uploads so they come back attached to this contract, not the project. */
  entityId: string;
}

function when(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ContractCompare({ projectId, pdfUrl, title, entityId }: ContractCompareProps) {
  const [returns, setReturns] = useState<FileRow[]>([]);
  const [right, setRight] = useState<FileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/files?entityType=contract&entityId=${encodeURIComponent(entityId)}`,
      );
      const json = await res.json();
      const rows: FileRow[] = json.files ?? [];
      setReturns(rows);
      /* Open the newest return automatically — it is the one the GC came for. */
      setRight((cur) => cur ?? rows[0] ?? null);
    } catch {
      setReturns([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, entityId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: GOLD, fontSize: 11, fontWeight: 800 }}>
        <ArrowsLeftRight size={14} weight="bold" color={GOLD} />
        Compare with a Returned Copy
      </div>

      <FileDropzone
        projectId={projectId}
        entityType="contract"
        entityId={entityId}
        category="contract-markup"
        folder="Contracts"
        compact
        onUploaded={(rows) => {
          const first = (rows || [])[0];
          if (first) setRight(first as FileRow);
          load();
        }}
      />

      {returns.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {returns.map((r) => {
            const on = right?.id === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setRight(r)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 40,
                  padding: '0 13px', borderRadius: 8, cursor: 'pointer',
                  background: on ? 'var(--brand-primary-12)' : 'transparent',
                  border: `1px solid ${on ? GOLD : BORDER}`,
                  color: on ? GOLD : DIM, fontSize: 12.5, fontWeight: 700,
                }}
              >
                <FileText size={13} weight="duotone" color={on ? GOLD : DIM} />
                {r.file_name}
                {when(r.created_at) && <span style={{ fontWeight: 500, opacity: 0.75 }}>{when(r.created_at)}</span>}
              </button>
            );
          })}
        </div>
      )}

      {right ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          <Pane label={`Sent — ${title}`} src={pdfUrl} />
          <Pane
            label={`Returned — ${right.file_name}`}
            src={right.file_url}
            onClose={() => setRight(null)}
          />
        </div>
      ) : (
        <p style={{ margin: 0, color: DIM, fontSize: 13 }}>
          {loading
            ? 'Checking for returned copies…'
            : 'Nothing has come back yet. Drop the marked-up copy above and it will sit next to what you sent.'}
        </p>
      )}
    </div>
  );
}

function Pane({ label, src, onClose }: { label: string; src: string; onClose?: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 }}>
        <span
          style={{ color: TEXT, fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={label}
        >
          {label}
        </span>
        <span style={{ flex: 1 }} />
        <a href={src} target="_blank" rel="noopener noreferrer" style={{ color: GOLD, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
          Open
        </a>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close this pane"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: 'transparent', border: `1px solid ${BORDER}`, cursor: 'pointer' }}
          >
            <X size={12} weight="bold" color={DIM} />
          </button>
        )}
      </div>
      <iframe
        src={src}
        title={label}
        style={{ width: '100%', height: '68vh', minHeight: 420, border: `1px solid ${BORDER}`, borderRadius: 10, background: CARD }}
      />
    </div>
  );
}
