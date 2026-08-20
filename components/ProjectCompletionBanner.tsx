'use client';
/**
 * ProjectCompletionBanner
 * -----------------------
 * Mirrors SettingsCompletionBanner but per-project. Hidden if the project
 * is ≥ 80% complete or the user dismissed it. Links to the setup wizard.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface MissingField { key: string; label: string; weight: number; }
interface Completeness {
  score: number;
  status: 'red' | 'gold' | 'ok';
  missing: MissingField[];
  setupDismissed?: boolean;
}

export default function ProjectCompletionBanner({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Completeness | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!projectId || projectId === 'new') return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/completeness`);
        if (!r.ok) return;
        const j = await r.json() as Completeness;
        if (!cancelled) setData(j);
      } catch { /* leave null */ }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (!data || data.status === 'ok' || dismissed || data.setupDismissed) return null;

  const isRed = data.status === 'red';
  const accent = isRed ? '#EF4444' : '#C8960F';
  const bg = isRed ? 'rgba(239,68,68,0.10)' : 'rgba(200,150,15,0.10)';
  const border = isRed ? 'rgba(239,68,68,0.35)' : 'rgba(200,150,15,0.35)';
  const top = data.missing.slice().sort((a, b) => b.weight - a.weight).slice(0, 5);

  return (
    <div
      role="alert"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 10,
        padding: '14px 18px',
        margin: '0 0 14px',
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1 }}>🛠️</div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: accent,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            marginBottom: 4,
          }}
        >
          Project setup {data.score}% complete — finish setup to unlock full document generation
        </div>
        <div style={{ fontSize: 12, color: '#8BAAC8', marginBottom: 6 }}>
          Missing: {top.map(m => m.label).join(' · ')}
          {data.missing.length > top.length && ` · +${data.missing.length - top.length} more`}
        </div>
        <div
          style={{
            height: 4,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.max(data.score, 3)}%`,
              background: accent,
              transition: 'width .4s ease',
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Link
          href={`/app/projects/${projectId}/setup`}
          style={{
            background: accent,
            color: '#0d1117',
            fontWeight: 800,
            fontSize: 12,
            padding: '8px 14px',
            borderRadius: 8,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Finish Setup →
        </Link>
        <button
          onClick={async () => {
            setDismissed(true);
            try {
              await fetch(`/api/projects/${projectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ setup_dismissed: true }),
              });
            } catch { /* ignore */ }
          }}
          aria-label="Dismiss"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#8BAAC8',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '4px 6px',
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
