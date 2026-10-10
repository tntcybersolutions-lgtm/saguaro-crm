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
import { RouteSkeleton } from '@/components/ui/PageSkeleton';

export default function CommandCenterGate({ children }: { children: React.ReactNode }) {
  const { enabled, loading, known } = useFeature('command_center');
  const router = useRouter();
  const refused = !loading && known && !enabled;
  useEffect(() => { if (refused) router.replace('/app'); }, [refused, router]);
  /* While the plan is checked, paint the section's shape — this used to be
     null, and the live iPhone walk saw a pure black screen until it answered. */
  if (loading) return <RouteSkeleton title="Command Center" />;
  if (refused) return null; // on the way back to Home
  return <>{children}</>;
}
