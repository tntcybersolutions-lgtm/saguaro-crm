'use client';
import useSWR, { mutate } from 'swr';

/**
 * Send the bearer token, not just the cookie.
 *
 * There are two ways to prove who you are to this API — the httpOnly cookie the
 * server set at login, and the `Authorization: Bearer` header taken from the
 * browser session. Most of the app sends the header. This hook sent neither and
 * leaned entirely on the cookie, so the two could disagree, and when they did
 * the failure was silent and specific: the page body loaded its data fine while
 * the header read "Choose a job", because the breadcrumb was asking as a
 * different identity than the screen was.
 *
 * That gap is not hypothetical — `ensureBrowserSession()` exists in
 * lib/supabase-browser because the browser client routinely starts signed out
 * while the cookie is live, and the reverse happens when a cookie expires
 * under a session that is still good. Sending both means whichever one the
 * server prefers, it resolves to the same person.
 */
const fetcher = async (url: string) => {
  const { getAuthHeaders } = await import('@/lib/supabase-browser');
  const r = await fetch(url, { headers: await getAuthHeaders(), credentials: 'include' });
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
  phase?: string;
  owner_name?: string;
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
