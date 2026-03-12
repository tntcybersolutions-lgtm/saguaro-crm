'use client';
import { useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

export function useRealtimeRFIs(projectId: string | null, onNew: (rfi: Record<string, unknown>) => void) {
  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const channel = supabase
      .channel(`rfis:${projectId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rfis',
        filter: `project_id=eq.${projectId}`,
      }, (payload) => {
        if (payload.new.status === 'answered') {
          onNew(payload.new);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, onNew]);
}

export function useRealtimeMessages(projectId: string | null, onNew: (msg: Record<string, unknown>) => void) {
  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const channel = supabase
      .channel(`messages:${projectId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'project_messages',
        filter: `project_id=eq.${projectId}`,
      }, (payload) => onNew(payload.new))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, onNew]);
}

export function useRealtimePunchList(projectId: string | null, onUpdate: (item: Record<string, unknown>) => void) {
  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const channel = supabase
      .channel(`punch:${projectId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'punch_list_items',
        filter: `project_id=eq.${projectId}`,
      }, (payload) => onUpdate(payload.new))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, onUpdate]);
}
