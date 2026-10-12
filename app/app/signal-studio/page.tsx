'use client';
/**
 * /app/signal-studio — Signal Studio inside the /app shell. Pass 4 on the kit.
 *
 * The designer itself is components/signal-studio/Designer.tsx — the wireless
 * coverage (heat-map) designer extracted wholesale from the legacy
 * /field/heatmap page, and it renders unchanged. This page owns PROJECT
 * BINDING only:
 *   - ?projectId= deep link → straight into the designer, bound to that project
 *   - no projectId → a project picker (or an explicit "no project" start),
 *     so designs never silently attach to the wrong job.
 * Legacy /field/heatmap links redirect here with their query string preserved.
 */
import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Buildings, CaretRight, WarningCircle } from '@phosphor-icons/react';
import Designer from '@/components/signal-studio/Designer';
import { useProjects } from '@/lib/hooks/useProjects';
import { PageShell, Card, Button, EmptyState, Badge } from '@/components/ui/kit';
import { statusKindForProject } from '@/lib/status-colors';

const CSS = `
.ssWs > .k-page { max-width: 820px; }
.ssList { display: flex; flex-direction: column; }
.ssRow { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 14px; width: 100%; min-height: 60px; padding: 12px 16px; cursor: pointer; border-bottom: 1px solid var(--border-subtle); }
.ssRow:last-child { border-bottom: 0; }
.ssRow:hover { background: rgba(255,255,255,0.03); }
.ssRow:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
.ssIcon { width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0; display: grid; place-items: center; background: var(--bg-surface-2); border: 1px solid var(--border-default); color: var(--text-secondary); }
.ssName { display: block; font-size: var(--fs-md); font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ssSub { display: block; font-size: var(--fs-xs); color: var(--text-tertiary); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ssRow > svg:last-child { color: var(--text-tertiary); flex-shrink: 0; }
.ssSkel { height: 60px; border-bottom: 1px solid var(--border-subtle); background: rgba(255,255,255,0.03); }
.ssWarn { display: flex; gap: 10px; align-items: flex-start; font-size: var(--fs-sm); color: var(--text-primary); line-height: 1.55; padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid rgba(251,191,36,.35); background: rgba(251,191,36,.08); }
.ssWarn > svg { color: var(--status-under-contract); flex-shrink: 0; margin-top: 2px; }
.ssFoot { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
@media (max-width: 640px) { .ssWs .k-btn { min-height: 44px; } }
`;

function ProjectPicker({ onPick, onSkip }: { onPick: (id: string) => void; onSkip: () => void }) {
  const { projects, loading, degraded } = useProjects();
  return (
    <div className="ssWs" data-tour="heatmap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Signal Studio' }]}
        title="Signal Studio"
        subtitle="Wireless coverage designer. Coverage designs, bids and reports attach to the project you pick — so the whole team finds them where the job lives. You can retarget later from the Save dialog."
        actions={!loading ? <Button onClick={onSkip}>Start Without a Project</Button> : undefined}
      >
        {!loading && degraded && (
          <div className="ssWarn" role="status"><WarningCircle size={16} weight="fill" /> Project list is temporarily unavailable — you can start without a project and attach it when you save.</div>
        )}

        <Card title="Which project is this design for?" subtitle={loading ? 'Loading your projects…' : projects.length > 0 ? `${projects.length} project${projects.length === 1 ? '' : 's'} — pick one to open the designer bound to it.` : undefined} flush>
          {loading && (
            <div className="ssList" aria-busy="true" aria-label="Loading projects">
              {[0, 1, 2].map((i) => <div key={i} className="ssSkel" style={{ opacity: 0.8 - i * 0.2 }} />)}
            </div>
          )}
          {!loading && projects.length === 0 && !degraded && (
            <EmptyState
              icon={<Buildings size={22} />}
              title="No projects yet"
              text="Start a design now and attach it to a project later, or create the project first under Projects."
              action={<div className="ssFoot"><Button variant="primary" href="/app/projects/new">Create a Project</Button><Button onClick={onSkip}>Start Without a Project</Button></div>}
            />
          )}
          {!loading && projects.length > 0 && (
            <div className="ssList">
              {projects.map((p) => (
                <button key={p.id} type="button" onClick={() => onPick(p.id)} className="ssRow">
                  <span className="ssIcon"><Buildings size={19} weight="duotone" /></span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="ssName">{p.name}</span>
                    <span className="ssSub">{[p.project_number, p.address].filter(Boolean).join(' · ') || 'Project'}</span>
                  </span>
                  {p.status && <Badge tone={statusKindForProject(p.status)}>{String(p.status).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>}
                  <CaretRight size={15} weight="bold" />
                </button>
              ))}
            </div>
          )}
        </Card>
      </PageShell>
    </div>
  );
}

function SignalStudioInner() {
  const router = useRouter();
  const params = useSearchParams();
  const urlProjectId = params.get('projectId');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [noProject, setNoProject] = useState(false);

  const projectId = urlProjectId || pickedId;
  if (!projectId && !noProject) {
    return (
      <ProjectPicker
        onPick={(id) => {
          setPickedId(id);
          // reflect the binding in the URL so the design session is deep-linkable/shareable
          router.replace(`/app/signal-studio?projectId=${encodeURIComponent(id)}`);
        }}
        onSkip={() => setNoProject(true)}
      />
    );
  }
  return <Designer projectId={projectId} />;
}

export default function SignalStudioPage() {
  // useSearchParams requires a Suspense boundary (same pattern as app/app/bids)
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg-base)' }} />}>
      <SignalStudioInner />
    </Suspense>
  );
}
