'use client';
import useSWR, { mutate } from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface Project {
  id: string;
  name: string;
  address: string;
  status: string;
  contract_amount: number;
  start_date: string;
  end_date: string;
  project_number: string;
  phase?: string;
  owner_name?: string;
}

export function useProjects() {
  const { data, error, isLoading, mutate: revalidate } = useSWR<{ projects: Project[] }>(
    '/api/projects/list',
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );

  return {
    projects: data?.projects ?? [],
    loading: isLoading,
    error,
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
