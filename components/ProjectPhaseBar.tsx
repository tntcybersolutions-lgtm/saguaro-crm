'use client';
/**
 * ProjectPhaseBar — the job lifecycle as a left-to-right flow across the top of
 * every project screen.
 *
 * WHY. A GC does not think in forty-nine tools; they think in four or five
 * phases — win it, set it up, build it, bill it, close it. Every competitor
 * keeps the tools in a vertical rail (so do we), but none of them show the one
 * thing a contractor actually holds in their head: where this job is in its
 * life. This strip is that, read left to right, with the phase you are standing
 * in lit. Click a phase and you land on its first tool; the rail beneath is the
 * detail. It reads the same order as PROJECT_NAV_SECTIONS so the two never
 * disagree.
 */
import React from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { PROJECT_PHASES, phaseForPath } from '@/lib/project-nav';

const GOLD = '#F59E0B';
const GOLD_HI = '#FBBF24';
const BORDER = 'rgba(255,255,255,0.10)';

export default function ProjectPhaseBar() {
  const pathname = usePathname() || '';
  const params = useParams();
  const projectId = (params?.['projectId'] as string) || '';
  if (!projectId || projectId === 'new') return null;

  const base = `/app/projects/${projectId}`;
  const rel = pathname.startsWith(base) ? pathname.slice(base.length) : '';
  const activeKey = phaseForPath(rel);
  const activeIdx = Math.max(0, PROJECT_PHASES.findIndex(p => p.key === activeKey));

  return (
    <nav
      aria-label="Project phase"
      style={{
        display: 'flex', alignItems: 'stretch', gap: 6,
        padding: '10px 14px',
        background: 'linear-gradient(180deg, #121214, #0c0c0d)',
        borderBottom: `1px solid ${BORDER}`,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}
    >
      <style>{`nav[aria-label="Project phase"]::-webkit-scrollbar{display:none}`}</style>
      {PROJECT_PHASES.map((ph, i) => {
        const Icon = ph.icon;
        const isActive = i === activeIdx;
        const isDone = i < activeIdx;
        const href = base + ph.href;
        const tone = isActive ? GOLD : isDone ? 'rgba(245,158,11,0.55)' : 'rgba(255,255,255,0.40)';
        return (
          <React.Fragment key={ph.key}>
            {i > 0 && (
              <span aria-hidden style={{ alignSelf: 'center', color: 'rgba(255,255,255,0.18)', fontWeight: 900, fontSize: 13, flexShrink: 0 }}>›</span>
            )}
            <Link
              href={href}
              data-tour={`project-phase-${ph.key}`}
              title={ph.tagline}
              aria-current={isActive ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0,
                padding: '7px 13px', borderRadius: 10, textDecoration: 'none',
                background: isActive
                  ? `linear-gradient(180deg, ${GOLD_HI}, ${GOLD})`
                  : isDone ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isActive ? GOLD : isDone ? 'rgba(245,158,11,0.28)' : BORDER}`,
                boxShadow: isActive ? `0 4px 16px -6px ${GOLD}88` : 'none',
                transition: 'background .15s ease, border-color .15s ease',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = isDone ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)'; }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                background: isActive ? 'rgba(0,0,0,0.18)' : 'transparent',
              }}>
                <Icon size={15} weight={isActive ? 'fill' : 'regular'} color={isActive ? '#1C1200' : tone} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 0 }}>
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: isActive ? 'rgba(28,18,0,0.7)' : 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap',
                }}>
                  {isActive ? 'You are here' : `Step ${i + 1}`}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap',
                  color: isActive ? '#1C1200' : isDone ? '#E8D4AE' : 'rgba(255,255,255,0.82)',
                }}>
                  {ph.label}
                </span>
              </span>
            </Link>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
