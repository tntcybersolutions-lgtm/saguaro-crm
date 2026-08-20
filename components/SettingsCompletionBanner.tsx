'use client';
/**
 * SettingsCompletionBanner
 * ------------------------
 * Shown on every page that generates documents. Reads
 * /api/settings/completeness on mount, caches the result in
 * sessionStorage for 5 minutes to avoid re-fetching on every navigation.
 *
 *   score < 50  → red critical banner
 *   score 50-84 → gold warning banner
 *   score >= 85 → hidden
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface MissingField { key: string; label: string; weight: number; }
interface Completeness {
  score: number;
  status: 'red' | 'gold' | 'ok';
  missing: MissingField[];
  fetchedAt: number;
}

const CACHE_KEY = 'saguaro_settings_completeness_v1';
const TTL_MS = 5 * 60 * 1000;

function readCache(): Completeness | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Completeness;
    if (!parsed.fetchedAt || Date.now() - parsed.fetchedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(c: Completeness): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota */ }
}

export function invalidateSettingsCompletenessCache(): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* no-op */ }
}

export default function SettingsCompletionBanner() {
  const [data, setData] = useState<Completeness | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const cached = readCache();
    if (cached) {
      setData(cached);
      if (Date.now() - cached.fetchedAt < 30_000) return; // fresh enough
    }

    (async () => {
      try {
        const r = await fetch('/api/settings/completeness');
        if (!r.ok) return;
        const json = await r.json() as {
          score: number;
          status: 'red' | 'gold' | 'ok';
          missing: MissingField[];
        };
        if (cancelled) return;
        const next: Completeness = { ...json, fetchedAt: Date.now() };
        setData(next);
        writeCache(next);
      } catch { /* network — leave cached value in place */ }
    })();

    return () => { cancelled = true; };
  }, []);

  if (!data || data.status === 'ok' || dismissed) return null;

  const isRed = data.status === 'red';
  const accent = isRed ? '#EF4444' : '#C8960F';
  const bg = isRed ? 'rgba(239,68,68,0.10)' : 'rgba(200,150,15,0.10)';
  const border = isRed ? 'rgba(239,68,68,0.35)' : 'rgba(200,150,15,0.35)';
  const missingTop = data.missing
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);

  return (
    <div
      role="alert"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 10,
        padding: '14px 18px',
        margin: '0 0 16px',
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1 }}>{isRed ? '🚨' : '⚠️'}</div>
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
          {isRed
            ? `Company settings incomplete — documents will be missing critical info`
            : `Company settings ${data.score}% complete — finish to unlock professional documents`}
        </div>
        <div style={{ fontSize: 12, color: '#8BAAC8', marginBottom: 6 }}>
          Missing: {missingTop.map(m => m.label).join(' · ')}
          {data.missing.length > missingTop.length && ` · +${data.missing.length - missingTop.length} more`}
        </div>
        <div
          style={{
            height: 4,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 2,
            overflow: 'hidden',
            marginBottom: 2,
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
          href="/app/settings"
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
          Complete Settings →
        </Link>
        <button
          onClick={() => setDismissed(true)}
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
