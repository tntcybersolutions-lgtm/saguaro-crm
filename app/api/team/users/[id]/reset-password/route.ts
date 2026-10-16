import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

const RESET_REDIRECT =
  `${process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net'}/reset-password`;

/**
 * POST /api/team/users/[id]/reset-password
 * Trigger a Supabase password-reset email for a tenant member.
 *
 * Tenant isolation is enforced by resolving the target's email through a query
 * that filters BOTH the id AND the caller's tenant_id — a foreign-tenant user id
 * simply returns nothing, so we can never reset a password outside the tenant.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Resetting another user's password is an access-control action.
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();

    // Resolve the target's email AND prove same-tenant in one query.
    const { data: target, error: findErr } = await db
      .from('profiles')
      .select('email')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (findErr || !target?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Send the recovery email via Supabase Auth (uses its configured mailer).
    const { error: resetErr } = await db.auth.resetPasswordForEmail(target.email, {
      redirectTo: RESET_REDIRECT,
    });
    if (resetErr) {
      console.error('[team/users/reset-password] send failed:', resetErr);
      return NextResponse.json({ error: 'Could not send the reset email.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('team/users/[id]/reset-password POST', e);
  }
}
