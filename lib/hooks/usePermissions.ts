import useSWR from 'swr';
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
}

/**
 * What this user may do, for deciding what to SHOW them.
 *
 * The server guard is the security; this is about a person opening the app and
 * meeting their own job instead of someone else's. A salesperson does not need
 * pay applications, certified payroll and the takeoff studio in their rail.
 *
 * FAILS OPEN, DELIBERATELY, and the opposite of useEntitlements.
 *
 * Entitlements gate features a tenant has not paid for, so unknown must mean
 * "not enabled" — showing a paid feature by accident is the costly mistake
 * there. Here the costly mistake is the reverse: a slow or failed permissions
 * fetch would empty the navigation, and a GC whose rail vanishes because a
 * request timed out has lost the whole product, not one module. Every route
 * behind those links still enforces its own permission, so the worst case of
 * failing open is a link that answers 403 — which is exactly what happened on
 * every link before this existed.
 */
export function usePermissions() {
  const { data, isLoading, error } = useSWR<PermissionsResponse>(
    '/api/auth/permissions',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000, shouldRetryOnError: false },
  );

  const permissions = data?.permissions;

  /** True when the user has at least `min` on `category`. Unknown → true. */
  const can = (category: PermCategory, min: PermLevel = 'View'): boolean => {
    if (!permissions) return true;                    // see the header: fail open
    return meetsLevel(permissions[category], min);
  };

  return {
    permissions: permissions ?? null,
    role: data?.role ?? null,
    name: data?.name ?? null,
    /** Resolved means "we know" — use it to avoid flashing a rail you will trim. */
    resolved: !isLoading && !error && !!permissions,
    loading: isLoading,
    can,
  };
}
