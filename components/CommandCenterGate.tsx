'use client';
/**
 * Command Center is a plan feature. Without it every /api/franchise/* call
 * answers 403, so a sub-screen opened from a link used to load and then show
 * nothing but refusals. Here the whole section checks once: not on the plan →
 * back to Home before anything is asked of the server. Offline with no saved
 * answer we can't tell, so the screens render and show their own offline state.
 */
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFeature } from '@/lib/hooks/useEntitlements';

export default function CommandCenterGate({ children }: { children: React.ReactNode }) {
  const { enabled, loading, known } = useFeature('command_center');
  const router = useRouter();
  const refused = !loading && known && !enabled;
  useEffect(() => { if (refused) router.replace('/app'); }, [refused, router]);
  if (loading || refused) return null;
  return <>{children}</>;
}
