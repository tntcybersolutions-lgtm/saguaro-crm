'use client';
import useSWR, { mutate } from 'swr';

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
};

/**
 * THE shared client cache for the project intelligence snapshot
 * (/api/project-context — the 14-query aggregate every SmartCreate screen
 * seeds from). One SWR key per project: module hops render the cached
 * snapshot instantly and revalidate in the background (speed contract W-3).
 *
 * Drop-in for the raw-fetch pattern:
 *   const { ctx } = useProjectContext(projectId);   // ctx shape unchanged
 */
export function useProjectContext(projectId: string | null | undefined) {
  const { data, error, isLoading, mutate: revalidate } = useSWR<any>(
    projectId ? `/api/project-context?projectId=${projectId}` : null,
    fetcher,
    { dedupingInterval: 30_000, keepPreviousData: true, revalidateOnFocus: false }
  );

  return {
    ctx: projectId && data && !data.error ? data : null,
    loading: isLoading,
    error: error || (data?.error ? new Error(String(data.error)) : null),
    revalidate,
  };
}

/**
 * Re-read the snapshot NOW, for every subscriber on the page, after a write
 * that changes it (e.g. the phase flip "We won it").
 *
 * A plain SWR revalidate is not enough: /api/project-context answers with
 * `Cache-Control: private, max-age=30`, so a revalidate inside that window is
 * served the browser's cached copy (the old phase) and the rail kept showing
 * the bidding checklist until a hard reload. `cache: 'reload'` skips the HTTP
 * cache and also replaces the cached entry, so raw fetchers elsewhere get the
 * fresh copy too.
 */
export async function refreshProjectContext(projectId: string): Promise<void> {
  const key = `/api/project-context?projectId=${projectId}`;
  const r = await fetch(key, { cache: 'reload' });
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  const data = await r.json();
  await mutate(key, data, { revalidate: false });
}
