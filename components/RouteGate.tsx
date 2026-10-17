'use client';
/**
 * The app shell's screen gate: a page the person's role cannot open shows
 * "You don't have access" instead of loading and failing call by call.
 *
 * Rules: lib/route-access (the same categories the screens' API routes check,
 * job-aware through usePermissions). Until the permissions are known a gated
 * screen renders nothing rather than flashing data it may not keep; an
 * ungated screen renders at once.
 */
import React from 'react';
import { usePathname } from 'next/navigation';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { ruleFor, allowedBy, jobOpen } from '@/lib/route-access';
import NoAccess from './NoAccess';

export default function RouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const { rule, job } = ruleFor(pathname);
  const { permissions, resolved, jobScoped, loading } = usePermissions(job);

  if (!rule) return <>{children}</>;
  if (!resolved) {
    // A failed permissions read falls through to the page; its own routes still refuse.
    return loading ? null : <>{children}</>;
  }
  if (job && !jobOpen(permissions)) return <NoAccess what="this job" />;
  if (!allowedBy(rule, permissions, jobScoped)) {
    return <NoAccess what={rule.label} home={job ? `/app/projects/${job}/overview` : '/app'} />;
  }
  return <>{children}</>;
}
