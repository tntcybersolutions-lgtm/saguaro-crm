'use client';

/**
 * JobColorPicker — the "Job color" choice on a project. Eight swatches, no
 * free picker. Saves through PUT /api/projects/[id] (which only accepts one
 * of the eight) and refreshes the shared project list so the picker, lists
 * and sidebar dot change together.
 */

import React, { useState } from 'react';
import { apiErrorFrom } from '@/lib/api-refusal';
import { mutate as swrMutate } from 'swr';
import { Check } from '@phosphor-icons/react';
import { JOB_COLORS, projectColor } from '@/lib/project-colors';
import { refreshProjectContext } from '@/lib/hooks/useProjectContext';

export default function JobColorPicker({ projectId, color, onSaved }: { projectId: string; color?: string | null; onSaved?: (hex: string) => void }) {
  const current = projectColor({ id: projectId, color });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pick = async (hex: string) => {
    if (busy || hex === current) return;
    setBusy(hex); setErr(null);
    try {
      const r = await fetch(`/api/projects/${projectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ color: hex }) });
      if (!r.ok) throw await apiErrorFrom(r, 'Could not save the job colour.');
      onSaved?.(hex);
      await Promise.all([refreshProjectContext(projectId), swrMutate('/api/projects/list')]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the job colour.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div role="radiogroup" aria-label="Job color" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {JOB_COLORS.map((c) => {
        const on = c.hex === current;
        return (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={c.name}
            title={c.name}
            disabled={!!busy}
            onClick={() => void pick(c.hex)}
            style={{
              width: 28, height: 28, borderRadius: 8, cursor: busy ? 'default' : 'pointer', padding: 0,
              background: c.hex, border: `2px solid ${on ? 'var(--text-primary)' : 'rgba(0,0,0,0.35)'}`,
              boxShadow: on ? `0 0 0 2px ${c.hex}` : 'inset 0 1px 0 rgba(255,255,255,0.25)',
              display: 'inline-grid', placeItems: 'center', opacity: busy && busy !== c.hex ? 0.6 : 1,
            }}
          >
            {on && <Check size={14} weight="bold" color="var(--on-brand)" />}
          </button>
        );
      })}
      <span style={{ fontSize: 13, color: 'var(--text-tertiary)', marginLeft: 4 }}>{JOB_COLORS.find((c) => c.hex === current)?.name}</span>
      {err && <span role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>{err}</span>}
    </div>
  );
}
