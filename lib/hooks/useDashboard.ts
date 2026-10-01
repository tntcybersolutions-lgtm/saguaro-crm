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
  /* THE KEY IS `actions`, AND READING `items` MADE THE WHOLE PANEL EMPTY.
     /api/dashboard/today has always answered { actions, source }. This hook
     read `items`, which is undefined, so the list resolved to [] on every
     render — the dashboard showed its "nothing needs you" empty state while the
     server was returning pay apps awaiting approval, insurance expiring inside
     30 days, overdue RFIs and missing W-9s. Proven against the running build:
     TOP-LEVEL KEYS [actions, source], b.items undefined, 2 real actions.

     Both spellings are accepted, plus a bare array. A dashboard panel is not
     the place to be strict about which of two shapes the server sent — the
     cost of guessing wrong is a screen that silently says there is no work. */
  const { data, error, isLoading, mutate } = useSWR<
    { actions?: TodayItem[]; items?: TodayItem[] } | TodayItem[]
  >('/api/dashboard/today', fetcher, { refreshInterval: 60_000 });

  const items: TodayItem[] = Array.isArray(data)
    ? data
    : data?.actions ?? data?.items ?? [];

  return {
    items,
    loading: isLoading,
    error,
    revalidate: mutate,
  };
}
