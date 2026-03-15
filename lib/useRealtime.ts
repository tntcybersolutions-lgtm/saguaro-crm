'use client';
import { useEffect, useRef } from 'react';
import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { mutate } from 'swr';

/** Shared Supabase client for realtime — reuses single WS connection */
let _client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}

type AnyRecord = Record<string, unknown>;

// ─── Helper ───────────────────────────────────────────────
function useChannel(
  key: string | null,
  channelName: string,
  table: string,
  schema: string,
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
  filter: string | undefined,
  onPayload: (payload: { new: AnyRecord; old: AnyRecord; eventType: string }) => void
) {
  const cbRef = useRef(onPayload);
  cbRef.current = onPayload;

  useEffect(() => {
    if (!key) return;
    const supabase = getClient();
    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event, schema, table, ...(filter ? { filter } : {}) },
        (payload) =>
          cbRef.current({
            new: (payload.new ?? {}) as AnyRecord,
            old: (payload.old ?? {}) as AnyRecord,
            eventType: payload.eventType,
          })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [key, channelName, table, schema, event, filter]);
}

// ─── 1. RFIs ──────────────────────────────────────────────
export function useRealtimeRFIs(
  projectId: string | null,
  onUpdate: (rfi: AnyRecord) => void
) {
  useChannel(
    projectId,
    `rfis:${projectId}`,
    'rfis',
    'public',
    '*',
    projectId ? `project_id=eq.${projectId}` : undefined,
    ({ new: rfi }) => onUpdate(rfi)
  );
}

// ─── 2. Messages ──────────────────────────────────────────
export function useRealtimeMessages(
  projectId: string | null,
  onNew: (msg: AnyRecord) => void
) {
  useChannel(
    projectId,
    `messages:${projectId}`,
    'project_messages',
    'public',
    'INSERT',
    projectId ? `project_id=eq.${projectId}` : undefined,
    ({ new: msg }) => onNew(msg)
  );
}

// ─── 3. Punch List ────────────────────────────────────────
export function useRealtimePunchList(
  projectId: string | null,
  onUpdate: (item: AnyRecord) => void
) {
  useChannel(
    projectId,
    `punch:${projectId}`,
    'punch_list_items',
    'public',
    '*',
    projectId ? `project_id=eq.${projectId}` : undefined,
    ({ new: item }) => onUpdate(item)
  );
}

// ─── 4. Change Orders ─────────────────────────────────────
export function useRealtimeChangeOrders(
  projectId: string | null,
  onUpdate: (co: AnyRecord) => void
) {
  useChannel(
    projectId,
    `cos:${projectId}`,
    'change_orders',
    'public',
    '*',
    projectId ? `project_id=eq.${projectId}` : undefined,
    ({ new: co, eventType }) => {
      onUpdate(co);
      // Invalidate SWR cache
      mutate(`/api/change-orders/list?project_id=${projectId}`);
      mutate('/api/change-orders/list');
      if (eventType === 'UPDATE' && (co.status === 'approved' || co.status === 'rejected')) {
        mutate('/api/dashboard/stats');
      }
    }
  );
}

// ─── 5. Pay Applications ──────────────────────────────────
export function useRealtimePayApps(
  projectId: string | null,
  onUpdate: (pa: AnyRecord) => void
) {
  useChannel(
    projectId,
    `payapps:${projectId}`,
    'pay_applications',
    'public',
    '*',
    projectId ? `project_id=eq.${projectId}` : undefined,
    ({ new: pa }) => {
      onUpdate(pa);
      mutate(`/api/pay-applications/list?project_id=${projectId}`);
      mutate('/api/pay-applications/list');
      mutate('/api/dashboard/stats');
    }
  );
}

// ─── 6. Projects (global — no filter) ────────────────────
export function useRealtimeProjects(onUpdate: (project: AnyRecord) => void) {
  useChannel(
    'global',
    'projects:global',
    'projects',
    'public',
    '*',
    undefined,
    ({ new: project }) => {
      onUpdate(project);
      mutate('/api/projects/list');
      mutate('/api/dashboard/stats');
    }
  );
}

// ─── 7. Notifications ─────────────────────────────────────
export function useRealtimeNotifications(
  userId: string | null,
  onNew: (notif: AnyRecord) => void
) {
  useChannel(
    userId,
    `notifs:${userId}`,
    'notifications',
    'public',
    'INSERT',
    userId ? `user_id=eq.${userId}` : undefined,
    ({ new: notif }) => onNew(notif)
  );
}

// ─── 8. Daily Logs ────────────────────────────────────────
export function useRealtimeDailyLogs(
  projectId: string | null,
  onNew: (log: AnyRecord) => void
) {
  useChannel(
    projectId,
    `logs:${projectId}`,
    'daily_logs',
    'public',
    'INSERT',
    projectId ? `project_id=eq.${projectId}` : undefined,
    ({ new: log }) => onNew(log)
  );
}

// ─── 9. Bids ──────────────────────────────────────────────
export function useRealtimeBids(onUpdate: (bid: AnyRecord) => void) {
  useChannel(
    'global',
    'bids:global',
    'bids',
    'public',
    '*',
    undefined,
    ({ new: bid }) => {
      onUpdate(bid);
      mutate('/api/bids/list');
      mutate('/api/dashboard/stats');
    }
  );
}

// ─── 10. Submittals ───────────────────────────────────────
export function useRealtimeSubmittals(
  projectId: string | null,
  onUpdate: (sub: AnyRecord) => void
) {
  useChannel(
    projectId,
    `submittals:${projectId}`,
    'submittals',
    'public',
    '*',
    projectId ? `project_id=eq.${projectId}` : undefined,
    ({ new: sub }) => {
      onUpdate(sub);
      mutate(`/api/submittals/list?project_id=${projectId}`);
    }
  );
}

// ─── 11. Schedule (milestones) ────────────────────────────
export function useRealtimeSchedule(
  projectId: string | null,
  onUpdate: (milestone: AnyRecord) => void
) {
  useChannel(
    projectId,
    `schedule:${projectId}`,
    'schedule_milestones',
    'public',
    '*',
    projectId ? `project_id=eq.${projectId}` : undefined,
    ({ new: milestone }) => onUpdate(milestone)
  );
}

// ─── 12. Dashboard stats invalidation ────────────────────
/** Subscribe to all events that should refresh the dashboard stats KPIs */
export function useRealtimeDashboard(onStatsChange: () => void) {
  const cbRef = useRef(onStatsChange);
  cbRef.current = onStatsChange;

  useEffect(() => {
    const supabase = getClient();
    const tables = ['rfis', 'change_orders', 'pay_applications', 'bids', 'projects'];
    const channels: RealtimeChannel[] = tables.map((table) =>
      supabase
        .channel(`dashboard:${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          cbRef.current();
          mutate('/api/dashboard/stats');
        })
        .subscribe()
    );
    return () => { channels.forEach((ch) => supabase.removeChannel(ch)); };
  }, []);
}
