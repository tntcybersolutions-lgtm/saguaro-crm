import { NextRequest, NextResponse } from 'next/server';
import { createUnscopedServerClient, getUser } from '@/lib/supabase-server';
import { getEffectiveAccess, hasAnyPermission, MONEY_VIEW, RATE_VIEW } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { isUuid } from '@/lib/permission-scope';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/permissions — what THIS user may do.
 *
 * The permission system has been complete and enforced on the server for some
 * time: twelve categories, four levels, role_definitions, user_role_assignments,
 * requirePermission on the routes that matter. Nothing served it to the
 * browser, so the navigation showed every module to everyone and the first
 * thing a salesperson learned about a screen was the 403 they got from opening
 * it.
 *
 * Hiding what someone cannot use is not security — the guard on the route is
 * the security, and it stays. This is about a person opening the app and
 * seeing their own job rather than someone else's. A salesperson does not need
 * pay applications, certified payroll and the takeoff studio in their rail,
 * and putting them there is how the product came to feel like it was built for
 * somebody else.
 *
 * Returns the effective map, which already accounts for base-role bypass —
 * admins and owners come back Full on everything without a role assignment.
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    /* Unscoped: a job closed to this person must still be found here, so the
       answer for it is "None on everything" rather than the company role. */
    const db = createUnscopedServerClient();
    /* ?projectId= → the map that applies on that job (its job role, if one is
       set). Only a job in this company counts; anything else is company-wide. */
    const asked = new URL(req.url).searchParams.get('projectId');
    let projectId: string | null = null;
    if (isUuid(asked)) {
      const { data: own } = await db.from('projects').select('id').eq('id', asked).eq('tenant_id', user.tenantId).maybeSingle();
      projectId = own?.id ?? null;
    }
    const { perms: permissions, jobScoped } = await getEffectiveAccess(db, user.id, user.tenantId, projectId);

    /* The base role travels with the map because the rail needs one thing the
       map cannot express: whether this person is staff at all. */
    const { data: profile } = await db
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .maybeSingle();

    return NextResponse.json({
      permissions,
      role: (profile as { role?: string } | null)?.role ?? null,
      projectId,
      /* Whether the money and pay-rate figures reach this person here (the
         server nulls them otherwise — lib/money-fields). Screens hide the
         columns instead of showing blanks. */
      money: hasAnyPermission(permissions, MONEY_VIEW, 'View'),
      rates: hasAnyPermission(permissions, RATE_VIEW, 'View'),
      /* Only the jobs they are on (Subcontractor): the company directories,
         pipeline and admin screens are not theirs. */
      jobScoped,
      name: (profile as { full_name?: string } | null)?.full_name ?? null,
    });
  } catch (e) {
    return apiError('auth/permissions', e, 'Could not load your permissions.');
  }
}
