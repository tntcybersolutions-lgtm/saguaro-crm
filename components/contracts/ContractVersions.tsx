'use client';
import React, { useEffect, useState } from 'react';
import { ClockCounterClockwise, ArrowRight, FileText } from '@phosphor-icons/react';

/**
 * ContractVersions — every time this contract was papered, and what moved.
 *
 * The question this answers is "which copy does the sub actually hold, and how
 * does it differ from the one I just made?" Two PDFs side by side do not answer
 * it; a GC reads both and misses the retainage. So the comparison is on the
 * data, not the picture: field, before, after.
 *
 * Versions generated before field recording existed are still listed — they are
 * real documents — but say so instead of showing a diff that would be wrong.
 */

const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-tertiary)';
const BORDER = 'var(--border-default)';
const GREEN = 'var(--success)';
const RED = 'var(--danger)';

interface FieldChange {
  key: string;
  label: string;
  from: string;
  to: string;
  kind: 'added' | 'removed' | 'changed';
}

interface Version {
  id: string;
  version: number;
  createdAt: string;
  pdfUrl: string;
  changes: FieldChange[];
  comparable: boolean;
}

export interface ContractVersionsProps {
  projectId: string;
  kind: string;
  /** Bumped by the parent after a generate, to pull the new version in. */
  refreshKey?: number;
}

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function ContractVersions({ projectId, kind, refreshKey = 0 }: ContractVersionsProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError('');
      try {
        const res = await fetch(`/api/contracts/versions?projectId=${projectId}&kind=${kind}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Could not load the contract history.');
        if (!cancelled) setVersions(body.versions || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the contract history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, kind, refreshKey]);

  if (loading) return <p style={{ color: DIM, fontSize: 14, margin: 0 }}>Loading earlier versions…</p>;
  if (error) return <p style={{ color: RED, fontSize: 14, margin: 0 }}>{error}</p>;
  if (!versions.length) {
    return (
      <p style={{ color: DIM, fontSize: 14, margin: 0 }}>
        No earlier version of this contract on this project.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontSize: 12, fontWeight: 800 }}>
        <ClockCounterClockwise size={14} weight="bold" color="var(--text-secondary)" />
        History
      </div>

      {versions.map((v) => {
        const isOpen = open === v.id;
        const count = v.changes.length;
        return (
          <div key={v.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
            <button
              onClick={() => setOpen(isOpen ? '' : v.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                minHeight: 48, padding: '0 2px', background: 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>Version {v.version}</span>
              <span style={{ color: DIM, fontSize: 13 }}>{when(v.createdAt)}</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: count ? 'var(--text-primary)' : DIM, fontSize: 13 }}>
                {v.version === 1
                  ? 'first version'
                  : !v.comparable
                    ? 'no field record'
                    : count === 0
                      ? 'no field changed'
                      : `${count} field${count === 1 ? '' : 's'} changed`}
              </span>
            </button>

            {isOpen && (
              <div style={{ padding: '4px 2px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {count > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {v.changes.map((c) => (
                      <div key={c.key} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
                        <span style={{ color: DIM, minWidth: 150, fontSize: 12, fontWeight: 700 }}>
                          {c.label}
                        </span>
                        <span style={{ color: c.kind === 'added' ? DIM : RED, textDecoration: c.kind === 'added' ? 'none' : 'line-through', maxWidth: 320, wordBreak: 'break-word' }}>
                          {c.from || '—'}
                        </span>
                        <ArrowRight size={13} weight="bold" color={DIM} />
                        <span style={{ color: c.kind === 'removed' ? DIM : GREEN, maxWidth: 320, wordBreak: 'break-word' }}>
                          {c.to || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: DIM, fontSize: 13 }}>
                    {v.version === 1
                      ? 'The first version of this contract on this project.'
                      : v.comparable
                        ? 'Regenerated with the same values — only the date on the paper moved.'
                        : 'This version predates field recording, so there is nothing to compare it against.'}
                  </p>
                )}

                <a
                  href={v.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 40, color: 'var(--link)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
                >
                  <FileText size={14} weight="duotone" color="var(--text-secondary)" /> Open Version {v.version}
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
