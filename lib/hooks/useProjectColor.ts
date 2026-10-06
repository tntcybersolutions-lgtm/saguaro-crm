'use client';

/**
 * useProjectColors — job colours for screens that only know a project id
 * (dashboard rows, the job picker, the company schedule). Reads the shared
 * projects list (one SWR key app-wide, already loaded by the shell) and maps
 * id → stored colour; anything not in that list falls back to the stable hash
 * inside projectColor(), so a row never renders without a colour.
 */

import { useCallback } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import { projectColor } from '@/lib/project-colors';

export function useProjectColors() {
  const { projects } = useProjects();
  return useCallback((id: string | null | undefined): string => {
    if (!id) return projectColor(null);
    const p = (projects as Array<{ id: string; color?: string | null }>).find((x) => x.id === id);
    return projectColor(p ? { id: p.id, color: p.color ?? null } : id);
  }, [projects]);
}

export function useProjectColor(id: string | null | undefined): string {
  return useProjectColors()(id);
}
