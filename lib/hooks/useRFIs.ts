'use client';
import useSWR, { mutate } from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface RFI {
  id: string;
  rfi_number: string;
  subject: string;
  status: string;
  due_date: string;
  project_id: string;
  submitted_by?: string;
  ball_in_court?: string;
}

export function useRFIs(projectId?: string) {
  const url = projectId ? `/api/rfis/list?project_id=${projectId}` : '/api/rfis/list';
  const { data, error, isLoading, mutate: revalidate } = useSWR<{ rfis: RFI[] }>(
    url,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const openRFIs = (data?.rfis ?? []).filter((r) => r.status !== 'closed');

  return {
    rfis: data?.rfis ?? [],
    openRFIs,
    loading: isLoading,
    error,
    revalidate,
  };
}

/** Optimistic RFI status update */
export async function optimisticUpdateRFIStatus(
  rfiId: string,
  newStatus: string,
  projectId?: string
) {
  const key = projectId ? `/api/rfis/list?project_id=${projectId}` : '/api/rfis/list';
  await mutate(
    key,
    async (current: { rfis: RFI[] } | undefined) => {
      const rfis = (current?.rfis ?? []).map((r) =>
        r.id === rfiId ? { ...r, status: newStatus } : r
      );
      const res = await fetch(`/api/rfis/${rfiId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update RFI status');
      return { rfis };
    },
    {
      optimisticData: (current: { rfis: RFI[] } | undefined) => ({
        rfis: (current?.rfis ?? []).map((r) =>
          r.id === rfiId ? { ...r, status: newStatus } : r
        ),
      }),
      rollbackOnError: true,
    }
  );
}
