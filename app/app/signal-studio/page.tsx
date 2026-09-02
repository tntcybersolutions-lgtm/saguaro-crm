'use client';
/**
 * /app/signal-studio — Signal Studio inside the /app shell.
 *
 * The designer itself is components/signal-studio/Designer.tsx (extracted wholesale
 * from the legacy /field/heatmap page). This page owns PROJECT BINDING only:
 *   - ?projectId= deep link → straight into the designer, bound to that project
 *   - no projectId → a machined project picker (or an explicit "no project" start),
 *     so designs never silently attach to the wrong job.
 * Legacy /field/heatmap links redirect here with their query string preserved.
 */
import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Buildings, CaretRight, Lightning } from '@phosphor-icons/react';
import Designer from '@/components/signal-studio/Designer';
import { useProjects } from '@/lib/hooks/useProjects';

const GOLD = '#F59E0B', DARK = '#0a0a0a', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.1)';
const TEXT = '#fff', DIM = '#CBD5E1', MUTED = 'rgba(255,255,255,0.5)';

function ProjectPicker({ onPick, onSkip }: { onPick: (id: string) => void; onSkip: () => void }) {
  const { projects, loading, degraded } = useProjects();
  return (
    <div data-tour="heatmap" style={{ maxWidth: 760, margin: '0 auto', padding: '48px 20px 64px' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase', color: GOLD, marginBottom: 12 }}>
        <Lightning size={12} weight="fill" color={GOLD} /> Signal Studio
      </div>
      <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(24px,3vw,34px)', fontWeight: 800, letterSpacing: -0.8, color: TEXT }}>
        Which project is this design for?
      </h1>
      <p style={{ margin: '0 0 26px', fontSize: 14, color: DIM, lineHeight: 1.55, maxWidth: 560 }}>
        Coverage designs, bids and reports attach to the project you pick — so the whole
        team finds them where the job lives. You can retarget later from the Save dialog.
      </p>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 62, borderRadius: 12, border: `1px solid ${BORDER}`, background: RAISED, opacity: 0.6 - i * 0.15 }} />
          ))}
        </div>
      )}
      {!loading && degraded && (
        <div style={{ marginBottom: 14, fontSize: 12.5, color: '#FCD34D', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.5 }}>
          Project list is temporarily unavailable — you can start without a project and attach it when you save.
        </div>
      )}
      {!loading && projects.length === 0 && !degraded && (
        <div style={{ marginBottom: 14, fontSize: 13, color: DIM, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', lineHeight: 1.55 }}>
          No projects yet. Start a design now and attach it to a project later, or create the
          project first under <b style={{ color: TEXT }}>Projects</b>.
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              className="ssp-row"
              style={{
                display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: 'pointer',
                padding: '14px 16px', borderRadius: 12, border: `1px solid ${BORDER}`,
                background: RAISED, color: TEXT, width: '100%',
              }}
            >
              <span style={{ width: 38, height: 38, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', flexShrink: 0 }}>
                <Buildings size={19} weight="duotone" color={GOLD} />
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[p.project_number, p.address, p.status].filter(Boolean).join(' · ') || 'Project'}
                </span>
              </span>
              <CaretRight size={15} weight="bold" color={GOLD} style={{ flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}

      {!loading && (
        <button
          type="button"
          onClick={onSkip}
          style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: DIM, borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Start without a project
        </button>
      )}
      <style dangerouslySetInnerHTML={{ __html: `
        .ssp-row { transition: border-color .15s, background .15s, transform .15s; }
        .ssp-row:hover { border-color: rgba(245,158,11,0.45); background: #17181b; transform: translateY(-1px); }
        .ssp-row:active { transform: translateY(0); }
        .ssp-row:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 2px; }
      ` }} />
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
    <Suspense fallback={<div style={{ minHeight: '100vh', background: DARK }} />}>
      <SignalStudioInner />
    </Suspense>
  );
}
