'use client';
/**
 * Job access — who can do what on THIS job. One row per person in the company:
 * the access that applies here drawn as twelve bars (one per category, taller =
 * more), and one select that sets their role for this job only. "Company role"
 * clears it, "No access" shuts them out of this job, any role applies here and
 * nowhere else (lib/permissions resolvePermissions).
 *
 *   read   GET /api/projects/[id]/access
 *   write  PUT /api/projects/[id]/access  { userId, access }
 */
import React, { useState } from 'react';
import useSWR from 'swr';
import { Avatar, Select } from '@/components/ui/kit';
import { FlatStyles, SectionLabel, FlatList, FlatEmpty } from '@/components/ui/flat';
import { jobAccessValue, type JobAccessPerson } from '@/lib/job-access';
import type { PermCategory, PermLevel } from '@/lib/permission-categories';

type AccessData = {
  canManage: boolean;
  categories: PermCategory[];
  roles: { id: string; name: string; color: string | null }[];
  people: JobAccessPerson[];
};

const RANK: Record<PermLevel, number> = { None: 0, View: 1, Edit: 2, Full: 3 };

const fetcher = async (u: string): Promise<AccessData> => {
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || 'Could not load job access.');
  return j as AccessData;
};

/** Twelve bars, one per category: empty = none, then view / edit / full. */
function AccessBars({ cats, levels }: { cats: PermCategory[]; levels: Record<PermCategory, PermLevel> }) {
  const label = cats.map((c) => `${c}: ${levels[c] ?? 'None'}`).join(', ');
  return (
    <span role="img" aria-label={label} title={cats.map((c) => `${c} — ${levels[c] ?? 'None'}`).join('\n')}
      style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 3, height: 20, flex: 'none' }}>
      {cats.map((c) => {
        const r = RANK[levels[c] ?? 'None'] ?? 0;
        return (
          <i key={c} style={{
            display: 'block', width: 5, height: 5 + r * 5, borderRadius: 2,
            background: r === 0 ? 'var(--border-default)' : `color-mix(in srgb, var(--text-primary) ${35 + r * 20}%, transparent)`,
          }} />
        );
      })}
    </span>
  );
}

export default function JobAccessSection({ projectId, onToast }: { projectId: string; onToast: (msg: string, ok: boolean) => void }) {
  const key = projectId ? `/api/projects/${projectId}/access` : null;
  const { data, error, mutate, isLoading } = useSWR<AccessData>(key, fetcher);
  const [busy, setBusy] = useState<string | null>(null);

  async function setAccess(p: JobAccessPerson, access: string) {
    if (!key || access === jobAccessValue(p.job) || access === 'custom') return;
    setBusy(p.userId);
    try {
      const res = await fetch(key, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: p.userId, access }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Could not change access.');
      await mutate();
      const roleName = data?.roles.find((r) => r.id === access)?.name;
      onToast(access === 'company' ? `${p.name} is back on their company role here.` : access === 'none' ? `${p.name} has no access to this job.` : `${p.name} is ${roleName ?? 'set'} on this job.`, true);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not change access.', false);
    } finally {
      setBusy(null);
    }
  }

  const cats = data?.categories ?? [];
  const overrides = (data?.people ?? []).filter((p) => p.job.mode !== 'company').length;

  return (
    <section id="job-access" style={{ scrollMarginTop: 76 }}>
      <FlatStyles />
      <SectionLabel>{`Job Access${data ? ` · ${overrides} set for this job` : ''}`}</SectionLabel>
      {error ? (
        <FlatEmpty>{error instanceof Error ? error.message : 'Could not load job access.'}</FlatEmpty>
      ) : isLoading && !data ? (
        <FlatEmpty>Loading…</FlatEmpty>
      ) : !data || data.people.length === 0 ? (
        <FlatEmpty>No one in the company yet.</FlatEmpty>
      ) : (
        <FlatList label="Job access">
          {data.people.map((p) => {
            const value = jobAccessValue(p.job);
            const companyLabel = `Company role${p.companyRole ? ` (${p.companyRole})` : ''}`;
            const options = [
              { value: 'company', label: companyLabel },
              ...data.roles.map((r) => ({ value: r.id, label: r.name })),
              { value: 'none', label: 'No access' },
              ...(value === 'custom' ? [{ value: 'custom', label: p.job.label }] : []),
            ];
            return (
              <li key={p.userId}>
                <div className="fl-row" style={{ flexWrap: 'wrap', rowGap: 8 }}>
                  <Avatar name={p.name} size={36} />
                  <span className="fl-m" style={{ minWidth: 140 }}>
                    <span className="fl-t" style={{ display: 'block' }}>{p.name}</span>
                    <span className="fl-s" style={{ display: 'block' }}>{p.isAdmin ? 'Admin · every job' : p.companyRole}</span>
                  </span>
                  <AccessBars cats={cats} levels={p.effective} />
                  <span style={{ flex: '1 1 180px', maxWidth: 260, minWidth: 160 }}>
                    {p.isAdmin || !data.canManage ? (
                      <span style={{ display: 'inline-flex', minHeight: 40, alignItems: 'center', fontSize: 14, color: p.job.mode === 'company' ? 'var(--text-secondary)' : 'var(--text-primary)', fontWeight: p.job.mode === 'company' ? 500 : 650 }}>
                        {p.isAdmin ? 'Full access' : p.job.mode === 'company' ? companyLabel : p.job.label}
                      </span>
                    ) : (
                      <Select
                        aria-label={`${p.name}'s role on this job`}
                        value={value}
                        disabled={busy === p.userId}
                        onChange={(e) => { void setAccess(p, e.target.value); }}
                        options={options}
                        style={{ fontWeight: value === 'company' ? 500 : 650, color: value === 'company' ? 'var(--text-secondary)' : 'var(--text-primary)', minHeight: 44 }}
                      />
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </FlatList>
      )}
    </section>
  );
}
