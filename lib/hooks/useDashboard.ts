'use client';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface DashStats {
  activeProjects: number;
  openBids: number;
  pendingPayApps: number;
  totalContractValue: number;
  monthlyRevenue: number;
  openRFIs: number;
  openCOs: number;
  overdueItems: number;
}

export interface TodayItem {
  type: 'pay-app' | 'insurance' | 'rfi' | 'compliance';
  title: string;
  subtitle: string;
  urgency: 'high' | 'medium' | 'low';
  actionUrl: string;
  actionLabel: string;
}

export function useDashboardStats() {
  const { data, error, isLoading, mutate } = useSWR<{ stats: DashStats }>(
    '/api/dashboard/stats',
    fetcher,
    { refreshInterval: 15_000, revalidateOnFocus: true }
  );

  return {
    stats: data?.stats ?? null,
    loading: isLoading,
    error,
    revalidate: mutate,
  };
}

export function useTodayItems() {
  const { data, error, isLoading, mutate } = useSWR<{ items: TodayItem[] } | TodayItem[]>(
    '/api/dashboard/today',
    fetcher,
    { refreshInterval: 60_000 }
  );

  const items: TodayItem[] = Array.isArray(data)
    ? data
    : (data as { items?: TodayItem[] } | undefined)?.items ?? [];

  return {
    items,
    loading: isLoading,
    error,
    revalidate: mutate,
  };
}
