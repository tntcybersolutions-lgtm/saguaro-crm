import React from 'react';
import useSWR from 'swr';
import { usePathname } from 'next/navigation';
import { meetsLevel, type PermCategory, type PermLevel } from '@/lib/permission-categories';

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

interface PermissionsResponse {
  permissions: Record<PermCategory, PermLevel>;
  role: string | null;
  name: string | null;
  projectId?: string | null;
  /** Money and pay-rate figures reach this person here (lib/money-fields). */
  money?: boolean;
  rates?: boolean;
  /** Only the jobs they are on (Subcontractor role scope). */
  jobScoped?: boolean;
}

const JOB_PATH = /^\/app\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

/** The job a page is on, from its URL (/app/projects/<id>/…), or null. */
export function jobFromPath(pathname: string | null | undefined): string | null {
  const m = (pathname || '').match(JOB_PATH);
  return m ? m[1].toLowerCase() : null;
}

/**
 * What this user may do, for deciding what to SHOW them.
 *
 * JOB-AWARE, the same rule as the server: on a job's pages the answer is the
 * person's role ON THAT JOB (a Foreman who is PM on one job sees that job's
 * budget; "No access" on a job hides everything there). The job comes from
 * the URL unless the caller names one (`projectId`, or null for company-wide).
 *
 * The server guard is the security; this is about a person meeting their own
 * job instead of someone else's.
 *
 * `can` FAILS OPEN, deliberately (the rail must not vanish because a request
 * timed out; every route still enforces its own permission). For a button that
 * would open a form the person cannot submit, use `allows` (fails closed) or
 * <IfAllowed> — a form that opens only to be refused is the worse failure.
 */
export function usePermissions(projectId?: string | null) {
  const pathname = usePathname();
  const job = projectId === undefined ? jobFromPath(pathname) : projectId;
  const key = job ? `/api/auth/permissions?projectId=${job}` : '/api/auth/permissions';
  const { data, isLoading, error } = useSWR<PermissionsResponse>(
    key,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000, shouldRetryOnError: false, keepPreviousData: false },
  );

  const permissions = data?.permissions;
  const resolved = !isLoading && !error && !!permissions;

  /** True when the user has at least `min` on `category`. Unknown → true. */
  const can = (category: PermCategory, min: PermLevel = 'View'): boolean => {
    if (!permissions) return true;                    // see the header: fail open
    return meetsLevel(permissions[category], min);
  };

  /** True only once we KNOW the user has at least `min` on `category`. */
  const allows = (category: PermCategory, min: PermLevel = 'Edit'): boolean =>
    resolved && meetsLevel(permissions?.[category], min);

  return {
    permissions: permissions ?? null,
    role: data?.role ?? null,
    name: data?.name ?? null,
    projectId: job,
    /** Resolved means "we know" — use it to avoid flashing a rail you will trim. */
    resolved,
    loading: isLoading,
    /** Dollar figures reach this person here. Unknown → true (the server nulls them regardless). */
    money: data?.money ?? true,
    /** Pay rates reach this person here. */
    rates: data?.rates ?? true,
    jobScoped: data?.jobScoped ?? false,
    can,
    allows,
  };
}

/**
 * Edit rights for a list's bulk actions. FAILS CLOSED, unlike `can`. Job-aware
 * like usePermissions.
 *
 *   const rights = useEditRights('RFIs');
 *   <DataTable bulkEdit={{ allowed: rights.edit, remove: { allowed: rights.full, … } }} />
 */
export function useEditRights(category: PermCategory, projectId?: string | null): { edit: boolean; full: boolean; resolved: boolean } {
  const { permissions, resolved } = usePermissions(projectId);
  if (!resolved || !permissions) return { edit: false, full: false, resolved };
  return {
    edit: meetsLevel(permissions[category], 'Edit'),
    full: meetsLevel(permissions[category], 'Full'),
    resolved,
  };
}

/**
 * Render children only when the person may do this here (fails closed: hidden
 * until known). For create/edit buttons whose route would refuse.
 *
 *   <IfAllowed perm={['RFIs', 'Edit']}><Button>New RFI</Button></IfAllowed>
 */
export function IfAllowed({ perm, projectId, children }: {
  perm: readonly [PermCategory, PermLevel] | ReadonlyArray<readonly [PermCategory, PermLevel]>;
  projectId?: string | null;
  children: React.ReactNode;
}): React.ReactElement | null {
  const { allows } = usePermissions(projectId);
  const list = (Array.isArray(perm[0]) ? perm : [perm]) as ReadonlyArray<readonly [PermCategory, PermLevel]>;
  // Any of the listed rights opens it (e.g. Sales or Budget).
  if (!list.some(([c, l]) => allows(c, l))) return null;
  return React.createElement(React.Fragment, null, children);
}
