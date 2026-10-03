'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import Link from 'next/link';
import { Skeleton } from '../../../components/ui/Skeleton';
import { WarningCircle, FileText, CaretRight, Buildings, ShieldCheck } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, StatStrip, goldButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';

const GOLD = 'var(--brand-primary)';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#D4D4D8';
const TEXT = '#FFFFFF';
const RED = '#FF3B30';

interface Project {
  id: string;
  name?: string | null;
  project_number?: string | null;
  address?: string | null;
  client_name?: string | null;
  status?: string | null;
}

const statusStyle = (s: string): { color: string; bg: string } => {
  const k = (s || '').toLowerCase();
  if (k.includes('active') || k.includes('progress')) return { color: '#2CFF7A', bg: 'rgba(44,255,122,.12)' };
  if (k.includes('complete') || k.includes('closed')) return { color: '#FF8A00', bg: 'rgba(26,95,168,.12)' };
  return { color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, transparent)' };
};

export default function CertifiedPayrollPage() {
  // W-4: the shared projects cache — revisits paint instantly.
  const { projects: liveProjects, loading, error: loadError, revalidate } = useProjects();
  const projects = liveProjects as Project[];
  const error = !!loadError;
  const [search, setSearch] = useState('');

  // Org-wide WH-347 rollup — /api/payroll/list without a projectId returns
  // every certified payroll on the tenant, so the module opens knowing what
  // has been filed, for how much gross, and how recently.
  const [records, setRecords] = useState<{ id: string; week_ending: string; employee_count: number; total_gross: number; status: string }[]>([]);
  useEffect(() => {
    fetch('/api/payroll/list')
      .then(r => r.json())
      .then(d => setRecords(Array.isArray(d.records) ? d.records : []))
      .catch(() => setRecords([]));
  }, []);
  const grossFiled = records.reduce((s, r) => s + (Number(r.total_gross) || 0), 0);
  const lastFiled = records[0] || null;
  const certifiedCount = records.filter(r => (r.status || '').toLowerCase() === 'certified').length;
  const fmt0 = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

  const load = useCallback(() => { revalidate(); }, [revalidate]);


  const filtered = projects.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.name || '').toLowerCase().includes(q)
      || (p.project_number || '').toLowerCase().includes(q)
      || (p.address || '').toLowerCase().includes(q);
  });

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow="Compliance"
        eyebrowIcon={<ShieldCheck size={13} weight="fill" color={GOLD} />}
        title="Certified"
        accent="Payroll"
        subtitle="WH-347 certified payroll for Davis-Bacon work, per project."
      />

      {/* Org-wide compliance rollup — real filed totals, Number-coerced */}
      {!loading && (
        <StatStrip items={[
          {href: '/app/certified-payroll',  label: 'Projects', value: String(projects.length), sub: projects.filter(p => ((p.status || '').toLowerCase().includes('active') || (p.status || '').toLowerCase().includes('progress'))).length + ' active' },
          {href: '/app/certified-payroll',  label: 'WH-347s Filed', value: String(records.length), sub: records.length > 0 ? 'Across all projects' : 'None filed yet' },
          {href: '/app/certified-payroll',  label: 'Gross Wages Certified', value: fmt0(grossFiled), accent: grossFiled > 0 ? '#2CFF7A' : undefined, sub: 'Total across filed payrolls' },
          {href: '/app/certified-payroll',  label: 'Last Filed Week', value: lastFiled ? lastFiled.week_ending : '—', sub: lastFiled ? (Number(lastFiled.employee_count) || 0) + ' employees · ' + fmt0(Number(lastFiled.total_gross) || 0) : 'Open a project to file' },
          {href: '/app/certified-payroll',  label: 'Certified', value: String(certifiedCount), sub: (records.length - certifiedCount) + ' submitted / draft' },
        ]} />
      )}

      {/* Projects list */}
      <SectionCard
        title="Projects"
        icon={<Buildings size={17} weight="duotone" color={GOLD} />}
        flush
        action={
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects…"
            style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 10,
              color: TEXT, fontSize: 13, padding: '9px 14px', outline: 'none', minWidth: 220,
            }}
          />
        }
      >
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ padding: '16px 20px', borderBottom: i < 3 ? `1px solid rgba(255,255,255,0.06)` : 'none' }}>
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
            icon={<Buildings size={30} weight="duotone" color={GOLD} />}
            title={projects.length === 0 ? 'No projects yet' : 'No projects match your search'}
            description={projects.length === 0
              ? 'Certified payroll is filed per project — create a project first, then file a WH-347 for every week worked on Davis-Bacon or public jobs.'
              : 'Try a different search term.'}
            action={projects.length === 0
              ? <Link href="/app/projects" style={goldButtonStyle} className="pmBtn">Go to Projects</Link>
              : undefined}
          />
        ) : (
          filtered.map((p, idx) => {
            const st = statusStyle(p.status || '');
            return (
              <Link
                key={p.id}
                href={`/app/projects/${p.id}/payroll`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none',
                  padding: '16px 20px',
                  borderBottom: idx < filtered.length - 1 ? `1px solid rgba(255,255,255,0.06)` : 'none',
                }}
              >
                <span style={{
                  width: 38, height: 38, borderRadius: 8, background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <FileText size={18} weight="regular" color={GOLD} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name || p.project_number || 'Untitled Project'}
                  </div>
                  <div style={{ fontSize: 12, color: DIM, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[p.project_number, p.address].filter(Boolean).join(' · ') || 'No address set'}
                  </div>
                </div>
                {p.status && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 4,
                    background: st.bg, color: st.color, textTransform: 'capitalize', whiteSpace: 'nowrap',
                  }}>{(p.status || '').replace(/_/g, ' ')}</span>
                )}
                <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, whiteSpace: 'nowrap' }}>Open Payroll</span>
                <CaretRight size={16} weight="bold" color={DIM} />
              </Link>
            );
          })
        )}
      </SectionCard>
    </PremiumSurface>
  );
}
