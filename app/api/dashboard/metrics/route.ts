import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { addDays, requestDay } from '@/lib/time-zone';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// GET /api/dashboard/metrics -> { alerts: { rfis_open, coi_expiring_30d, lien_waivers_pending, overdue_punch } }
// Tenant-wide home-screen alert counts. Each count is independently guarded so
// one failing query degrades to 0 instead of 500ing the whole snapshot.
export async function GET(_req: NextRequest) {
  const gate = await requirePermission(_req, 'Projects', 'View', { projectId: null });
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ alerts: {} }, { status: 401 });

  const db = createServerClient();
  const t = user.tenantId;
  // COI and punch windows on the company's day (device, else company zone), not the server's.
  let today: string;
  try {
    ({ today } = await requestDay(_req.headers, db, t, 'dashboard/metrics'));
  } catch (e) {
    return apiError('dashboard/metrics', e, "Couldn't load the alerts.");
  }
  const inThirty = addDays(today, 30);

  const guard = async (fn: () => Promise<number>) => {
    try { return await fn(); } catch { return 0; }
  };

  const [rfis_open, coi_expiring_30d, lien_waivers_pending, overdue_punch] = await Promise.all([
    guard(async () => {
      const { count } = await db.from('rfis').select('id', { count: 'exact', head: true })
        .eq('tenant_id', t).neq('status', 'answered').neq('status', 'closed');
      return count || 0;
    }),
    guard(async () => {
      const { count } = await db.from('subcontractor_insurance').select('id', { count: 'exact', head: true })
        .eq('tenant_id', t).gte('expiry_date', today).lte('expiry_date', inThirty);
      return count || 0;
    }),
    guard(async () => {
      const { count } = await db.from('lien_waivers').select('id', { count: 'exact', head: true })
        .eq('tenant_id', t).eq('status', 'pending').is('deleted_at', null);
      return count || 0;
    }),
    guard(async () => {
      // The punch table is `punch_list` (every other route uses it); `punch_list_items`
      // is an empty/legacy table so the old query always returned 0. The done-status is
      // `completed` (not `complete`), so exclude that to count only still-open overdue items.
      const { count } = await db.from('punch_list').select('id', { count: 'exact', head: true })
        .eq('tenant_id', t).lt('due_date', today).neq('status', 'completed');
      return count || 0;
    }),
  ]);

  return NextResponse.json({ alerts: { rfis_open, coi_expiring_30d, lien_waivers_pending, overdue_punch } });
}
