'use client';
import useSWR, { mutate } from 'swr';

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
};

export interface Project {
  id: string;
  name: string;
  address: string;
  status: string;
  contract_amount: number;
  start_date: string;
  end_date: string;
  project_number: string;
  /* The job's swatch (lib/project-colors.ts JOB_COLORS); null until picked. */
  color?: string | null;
  phase?: string;
  owner_name?: string;
  owner_email?: string;
  /* The customer this job belongs to. Null on every project created before the
     column existed, and on any created outside the Customers page — consumers
     must treat it as optional, not assume it. */
  customer_id?: string | null;
}

export function useProjects() {
  const { data, error, isLoading, mutate: revalidate } = useSWR<{ projects: Project[] }>(
    '/api/projects/list',
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true, dedupingInterval: 10_000 }
  );

  return {
    projects: data?.projects ?? [],
    loading: isLoading,
    error,
    // /api/projects/list degrades to 200 + {source:'error'} on server faults —
    // callers that must not render a false empty portfolio check this flag.
    degraded: !!(data && (data as any).source && (data as any).source !== 'live'),
    revalidate,
  };
}

export function useProject(id: string | null) {
  const { data, error, isLoading, mutate: revalidate } = useSWR<{ project: Project }>(
    id ? `/api/projects/${id}` : null,
    fetcher,
    { revalidateOnFocus: true }
  );

  return {
    project: data?.project ?? null,
    loading: isLoading,
    error,
    revalidate,
  };
}

/** Optimistic status update for a project */
export async function optimisticUpdateProjectStatus(
  projectId: string,
  newStatus: string
) {
  const key = '/api/projects/list';
  await mutate(
    key,
    async (current: { projects: Project[] } | undefined) => {
      const projects = (current?.projects ?? []).map((p) =>
        p.id === projectId ? { ...p, status: newStatus } : p
      );
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update project status');
      return { projects };
    },
    {
      optimisticData: (current: { projects: Project[] } | undefined) => ({
        projects: (current?.projects ?? []).map((p) =>
          p.id === projectId ? { ...p, status: newStatus } : p
        ),
      }),
      rollbackOnError: true,
    }
  );
}
