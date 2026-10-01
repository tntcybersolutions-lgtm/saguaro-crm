'use client';
import useSWR from 'swr';

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
};

/* OPTIONAL MEANS WITHHELD, NOT ZERO.
   /api/dashboard/stats omits any figure the signed-in user's permissions do not
   cover, rather than sending 0 — a withheld number that arrives as 0 is drawn
   as a fact ("Total Contract Value $0") and is simply untrue. `undefined` here
   is the signal to drop the tile; a real 0 still renders.

   openCOs and overdueItems were declared here and never sent by the route, nor
   read by anything — a type describing a payload that does not exist is how a
   caller ends up rendering `undefined` with full confidence from the compiler. */
export interface DashStats {
  activeProjects: number;
  openBids: number;
  expiringInsurance: number;
  pendingPayApps?: number;      // requires Pay Apps: View
  openRFIs?: number;            // requires RFIs: View
  totalContractValue?: number;  // requires Budget: View
  monthlyRevenue?: number;      // requires Budget: View
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
    { refreshInterval: 60_000, revalidateOnFocus: true, dedupingInterval: 10_000 }
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
