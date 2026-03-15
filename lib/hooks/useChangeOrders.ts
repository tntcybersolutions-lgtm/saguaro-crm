'use client';
import useSWR, { mutate } from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface ChangeOrder {
  id: string;
  co_number: string;
  title: string;
  status: string;
  amount: number;
  project_id: string;
  submitted_date?: string;
  approved_date?: string;
  reason?: string;
}

export function useChangeOrders(projectId?: string) {
  const url = projectId
    ? `/api/change-orders/list?project_id=${projectId}`
    : '/api/change-orders/list';
  const { data, error, isLoading, mutate: revalidate } = useSWR<{ change_orders: ChangeOrder[] }>(
    url,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const pending = (data?.change_orders ?? []).filter((co) => co.status === 'pending');
  const approved = (data?.change_orders ?? []).filter((co) => co.status === 'approved');
  const totalApproved = approved.reduce((sum, co) => sum + (co.amount ?? 0), 0);

  return {
    changeOrders: data?.change_orders ?? [],
    pending,
    approved,
    totalApproved,
    loading: isLoading,
    error,
    revalidate,
  };
}

/** Optimistic CO approve/reject */
export async function optimisticUpdateCOStatus(
  coId: string,
  newStatus: 'approved' | 'rejected' | 'pending',
  projectId?: string
) {
  const key = projectId
    ? `/api/change-orders/list?project_id=${projectId}`
    : '/api/change-orders/list';
  await mutate(
    key,
    async (current: { change_orders: ChangeOrder[] } | undefined) => {
      const change_orders = (current?.change_orders ?? []).map((co) =>
        co.id === coId
          ? { ...co, status: newStatus, approved_date: newStatus === 'approved' ? new Date().toISOString() : co.approved_date }
          : co
      );
      const res = await fetch(`/api/change-orders/${coId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update change order');
      return { change_orders };
    },
    {
      optimisticData: (current: { change_orders: ChangeOrder[] } | undefined) => ({
        change_orders: (current?.change_orders ?? []).map((co) =>
          co.id === coId ? { ...co, status: newStatus } : co
        ),
      }),
      rollbackOnError: true,
    }
  );
}
