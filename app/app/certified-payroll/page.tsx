'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import Link from 'next/link';
import { Skeleton } from '../../../components/ui/Skeleton';
import { WarningCircle, CaretRight, Buildings } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, StatStrip, goldButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { Badge, type BadgeTone } from '@/components/ui/kit';

const LINE = 'var(--border-default)';
const DIM = 'var(--text-secondary)';
const TEXT = 'var(--text-primary)';
const RED = 'var(--danger)';

interface Project {
  id: string;
  name?: string | null;
  project_number?: string | null;
  address?: string | null;
  client_name?: string | null;
  status?: string | null;
}

/* Job status -> the shared badge tones (lib/status-colors). */
const statusTone = (s: string): BadgeTone => {
  const k = (s || '').toLowerCase();
  if (k.includes('active') || k.includes('progress')) return 'ongoing';
  if (k.includes('complete') || k.includes('closed')) return 'completed';
  return 'neutral';
};
const statusLabel = (s: string) => { const t = (s || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
const weekStr = (iso: string) => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

export default function CertifiedPayrollPage() {
  // W-4: the shared projects cache — revisits paint instantly.
  const { projects: liveProjects, loading, error: loadError, revalidate } = useProjects();
  const projects = liveProjects as Project[];
  const error = !!loadError;
  const [search, setSearch] = useState('');

  // Org-wide WH-347 rollup — /api/payroll/list without a projectId returns
  // every certified payroll on the tenant, so the module opens knowing what
  // has been filed, for how much gross, and how recently.
  const [records, setRecords] = useState<{ id: string; project_id: string | null; week_ending: string; employee_count: number; total_gross: number; status: string }[]>([]);
  useEffect(() => {
    fetch('/api/payroll/list')
      .then(r => r.json())
      .then(d => setRecords(Array.isArray(d.records) ? d.records : []))
      .catch(() => setRecords([]));
  }, []);
  const grossFiled = records.reduce((s, r) => s + (Number(r.total_gross) || 0), 0);
  const lastFiled = records[0] || null;
  const certifiedCount = records.filter(r => (r.status || '').toLowerCase() === 'certified').length;
  const fmt0 = (n: number) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  /* Each job's own WH-347s: how many, the gross, and the latest week (records arrive newest-first). */
  const byProject = new Map<string, { count: number; gross: number; last: string }>();
  for (const r of records) {
    if (!r.project_id) continue;
    const m = byProject.get(r.project_id) || { count: 0, gross: 0, last: r.week_ending };
    m.count++; m.gross += Number(r.total_gross) || 0;
    byProject.set(r.project_id, m);
  }

  const load = useCallback(() => { revalidate(); }, [revalidate]);


  const filtered = projects.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.name || '').toLowerCase().includes(q)
      || (p.project_number || '').toLowerCase().includes(q)
      || (p.address || '').toLowerCase().includes(q);
  });

  return (
    <PremiumSurface>
      {/* Header */}
      <ModuleHero
        eyebrow="Compliance"
        title="Certified"
        accent="Payroll"
        subtitle="WH-347 for Davis-Bacon work, by job"
      />

      {/* Org-wide compliance rollup — real filed totals, Number-coerced */}
      {!loading && (
        <StatStrip items={[
          { label: 'Projects', value: String(projects.length), sub: projects.filter(p => ((p.status || '').toLowerCase().includes('active') || (p.status || '').toLowerCase().includes('progress'))).length + ' active' },
          { label: 'WH-347s Filed', value: String(records.length) },
          { label: 'Gross Wages Filed', value: fmt0(grossFiled) },
          { label: 'Last Filed Week', value: lastFiled ? weekStr(lastFiled.week_ending) : 'None', sub: lastFiled ? (Number(lastFiled.employee_count) || 0) + ' employees · ' + fmt0(Number(lastFiled.total_gross) || 0) : undefined },
          { label: 'Certified', value: String(certifiedCount), sub: records.length - certifiedCount > 0 ? (records.length - certifiedCount) + ' submitted or draft' : undefined },
        ]} />
      )}

      {/* Projects list */}
      <SectionCard
        title="Projects"
        flush
        action={
          <input
            className="k-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects…"
            aria-label="Search projects"
            style={{ minWidth: 0, width: 240, maxWidth: '100%' }}
          />
        }
      >
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ padding: '16px 0', borderBottom: i < 3 ? `1px solid ${LINE}` : 'none' }}>
              <Skeleton height={15} width="40%" />
              <div style={{ height: 6 }} />
              <Skeleton height={11} width="60%" />
            </div>
          ))
        ) : error ? (
          <PremiumEmpty
            tone="error"
            icon={<WarningCircle size={30} weight="duotone" color={RED} />}
            title="Couldn't load projects"
            description="We hit a problem loading your projects. Your data is safe — try again."
            action={<button onClick={load} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
          />
        ) : filtered.length === 0 ? (
          <PremiumEmpty
            icon={<Buildings size={30} weight="duotone" color="var(--text-secondary)" />}
            title={projects.length === 0 ? 'No projects yet' : 'No projects match your search'}
            description={projects.length === 0
              ? undefined
              : 'Try a different search'}
            action={projects.length === 0
              ? <Link href="/app/projects" style={goldButtonStyle} className="pmBtn">Go to Projects</Link>
              : undefined}
          />
        ) : (
          filtered.map((p, idx) => {
            const filed = byProject.get(p.id);
            return (
              <Link
                key={p.id}
                href={`/app/projects/${p.id}/payroll`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', flexWrap: 'wrap',
                  padding: '14px 0', minHeight: 56,
                  borderBottom: idx < filtered.length - 1 ? `1px solid ${LINE}` : 'none',
                }}
              >
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name || p.project_number || 'Untitled Project'}
                  </div>
                  {[p.project_number, p.address].filter(Boolean).length > 0 && (
                    <div style={{ fontSize: 13, color: DIM, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {[p.project_number, p.address].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                {/* What has been filed on this job: the figure a GC opens this page for. */}
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 120 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{filed ? fmt0(filed.gross) : '$0'}</div>
                  <div style={{ fontSize: 12, color: DIM }}>{filed ? `${filed.count} WH-347${filed.count === 1 ? '' : 's'} · last ${weekStr(filed.last)}` : 'None filed'}</div>
                </div>
                {p.status && <Badge tone={statusTone(p.status)} dot>{statusLabel(p.status)}</Badge>}
                <CaretRight size={16} weight="bold" color={DIM} aria-hidden />
              </Link>
            );
          })
        )}
      </SectionCard>
    </PremiumSurface>
  );
}
