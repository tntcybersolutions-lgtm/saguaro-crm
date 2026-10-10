import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/team/users
 * Returns the tenant's REAL users from `profiles` (tenant-scoped).
 * Consumed by the Roles & Permissions admin page (Users tab + Assign / Invite
 * modals) so every person it targets is an actual member of the tenant.
 *
 * Response shape: { users: [{ id, name, email, role, title, avatarUrl,
 *   createdAt, lastSignInAt }] }
 * lastSignInAt is REAL auth activity (auth.users.last_sign_in_at via the
 * service-role admin API) — null when the person has never signed in or the
 * lookup fails (non-fatal: the roster still loads without it).
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('profiles')
      .select('id, full_name, email, role, title, phone, avatar_url, created_at')
      .eq('tenant_id', user.tenantId)
      .order('full_name', { ascending: true });
    if (error) throw error;

    /* Honest last-active: auth.users.last_sign_in_at (service role). Only the
       ids in THIS tenant's profiles are exposed. */
    const lastSign = new Map<string, string | null>();
    try {
      const { data: authList } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const au of authList?.users ?? []) lastSign.set(au.id, au.last_sign_in_at ?? null);
    } catch { /* non-fatal — lastSignInAt stays null */ }

    const users = (data ?? []).map((p) => ({
      id: p.id,
      name: p.full_name ?? p.email ?? 'Unknown',
      email: p.email ?? '',
      role: p.role ?? null,
      title: p.title ?? null,
      phone: p.phone ?? null,
      avatarUrl: p.avatar_url ?? null,
      createdAt: p.created_at ?? null,
      lastSignInAt: lastSign.get(p.id) ?? null,
    }));

    return NextResponse.json({ users });
  } catch (e) {
    // Not an empty team: a failed read says so (the roster screen shows it).
    return apiError('team/users', e, 'Could not load your team');
  }
}
