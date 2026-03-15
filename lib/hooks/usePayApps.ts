'use client';
import useSWR, { mutate } from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface PayApp {
  id: string;
  pay_app_number: number;
  period_to: string;
  status: string;
  scheduled_value: number;
  work_completed: number;
  retainage_pct: number;
  net_amount_due: number;
  project_id: string;
}

export function usePayApps(projectId?: string) {
  const url = projectId
    ? `/api/pay-applications/list?project_id=${projectId}`
    : '/api/pay-applications/list';
  const { data, error, isLoading, mutate: revalidate } = useSWR<{ pay_applications: PayApp[] }>(
    url,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const pending = (data?.pay_applications ?? []).filter(
    (pa) => pa.status === 'pending' || pa.status === 'submitted'
  );
  const totalPending = pending.reduce((sum, pa) => sum + (pa.net_amount_due ?? 0), 0);

  return {
    payApps: data?.pay_applications ?? [],
    pending,
    totalPending,
    loading: isLoading,
    error,
    revalidate,
  };
}

/** Optimistic pay app submit */
export async function optimisticSubmitPayApp(payAppId: string, projectId?: string) {
  const key = projectId
    ? `/api/pay-applications/list?project_id=${projectId}`
    : '/api/pay-applications/list';
  await mutate(
    key,
    async (current: { pay_applications: PayApp[] } | undefined) => {
      const pay_applications = (current?.pay_applications ?? []).map((pa) =>
        pa.id === payAppId ? { ...pa, status: 'submitted' } : pa
      );
      const res = await fetch(`/api/pay-applications/${payAppId}/submit`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to submit pay application');
      return { pay_applications };
    },
    {
      optimisticData: (current: { pay_applications: PayApp[] } | undefined) => ({
        pay_applications: (current?.pay_applications ?? []).map((pa) =>
          pa.id === payAppId ? { ...pa, status: 'submitted' } : pa
        ),
      }),
      rollbackOnError: true,
    }
  );
}
