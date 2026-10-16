import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * POST /api/client-portal/users/bulk
 * Bulk add/invite client portal users.
 * Body: { users: Array<{ name, email, company?, role? }> }
 * Returns: { users: PortalUser[] }
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const incoming: any[] = Array.isArray(body?.users) ? body.users : [];

    const rows = incoming
      .map((u) => ({
        name: typeof u?.name === 'string' ? u.name.trim() : '',
        email: typeof u?.email === 'string' ? u.email.trim() : '',
        company: typeof u?.company === 'string' ? u.company.trim() : '',
        role: typeof u?.role === 'string' && u.role.trim() ? u.role.trim() : 'Owner',
      }))
      .filter((u) => u.name && u.email.includes('@'))
      .map((u) => ({
        tenant_id: user.tenantId,
        name: u.name,
        email: u.email,
        company: u.company,
        role: u.role,
        portal_type: 'client',
        status: 'pending',
        invited_at: new Date().toISOString(),
      }));

    if (rows.length === 0) {
      return NextResponse.json({ users: [] });
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('portal_users')
      .insert(rows)
      .select();
    if (error) throw error;

    return NextResponse.json({ users: data ?? [] });
  } catch (err) {
    return apiError('client-portal/users/bulk POST', err, 'Bulk invite failed');
  }
}
