'use client';

/**
 * ProjectPhaseBar — kept as the mount point every project screen already uses;
 * it now renders ProjectNav (components/project/ProjectNav): seven compact
 * destinations, the selected one yellow, overflow into a menu. Workflow
 * position (steps done, next action) is NOT shown here any more — that is
 * NextAction on the overview, once.
 *
 * On phones the Modules button opens the project drawer (the layout listens
 * for `saguaro:project-menu`).
 */

import React from 'react';
import { useParams } from 'next/navigation';
import ProjectNav from '@/components/project/ProjectNav';

export default function ProjectPhaseBar() {
  const params = useParams<{ projectId: string }>();
  const projectId = String(params?.projectId || '');
  if (!projectId || projectId === 'new') return null;
  return (
    <ProjectNav
      projectId={projectId}
      onOpenModules={() => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('saguaro:project-menu')); }}
    />
  );
}
