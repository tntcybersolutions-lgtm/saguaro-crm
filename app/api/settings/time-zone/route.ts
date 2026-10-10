import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { getEffectivePermissions, hasPermission, requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { companyTimeZone, isTimeZone } from '@/lib/time-zone';

export const dynamic = 'force-dynamic';

/**
 * The company's time zone — tenants.time_zone (an IANA name such as
 * America/Chicago). "Today", deadlines, COI expiry, clock windows and
 * reminders run on it whenever the person's own device doesn't say
 * (lib/time-zone).
 *
 *   GET   → { timeZone: string | null, canEdit: boolean }   any signed-in member
 *   PATCH { timeZone, onlyIfUnset? } → { timeZone, changed }  Admin ≥ Full only
 *
 * The company is always the caller's own (getUser → tenantId); a tenant id in
 * the body is ignored. `onlyIfUnset` is how the app shell records an owner's
 * device zone the first time a company has none: it never overwrites a zone
 * someone chose in Settings, even if two sessions race.
 */

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const [timeZone, perms] = await Promise.all([
      companyTimeZone(db, user.tenantId),
      getEffectivePermissions(db, user.id, user.tenantId),
    ]);
    return NextResponse.json(
      { timeZone, canEdit: hasPermission(perms, 'Admin', 'Full') },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return apiError('settings/time-zone GET', e, "Couldn't read your company's time zone.");
  }
}

export async function PATCH(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const { user, db } = g;

  const body = (await req.json().catch(() => null)) as { timeZone?: unknown; onlyIfUnset?: unknown } | null;
  const timeZone = typeof body?.timeZone === 'string' ? body.timeZone.trim() : '';
  if (!isTimeZone(timeZone)) {
    return NextResponse.json(
      { error: 'timeZone must be a real time zone name, e.g. America/Chicago.' },
      { status: 400 },
    );
  }
  const onlyIfUnset = body?.onlyIfUnset === true;

  try {
    let q = db
      .from('tenants')
      .update({ time_zone: timeZone, updated_at: new Date().toISOString() } as never)
      .eq('id', user.tenantId);
    if (onlyIfUnset) q = q.is('time_zone', null);
    const { data, error } = await q.select('id');
    if (error) throw error;
    const changed = Array.isArray(data) && data.length > 0;
    if (changed) return NextResponse.json({ timeZone, changed: true });

    // Nothing changed: the company already had a zone (onlyIfUnset), or the
    // company row is gone. Answer with what is actually stored.
    const current = await companyTimeZone(db, user.tenantId);
    if (!onlyIfUnset && current !== timeZone) {
      return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
    }
    return NextResponse.json({ timeZone: current, changed: false });
  } catch (e) {
    return apiError('settings/time-zone PATCH', e, "Couldn't save the time zone. Try again.");
  }
}
