import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiFail } from '@/lib/api-error';
import { must } from '@/lib/db-write';
import { addDays, requestDay } from '@/lib/time-zone';
import { toDay } from '@/lib/calendar-day';
import { isItemKey } from '@/lib/my-work';
import { isMissingTable } from '@/lib/my-work-server';

export const dynamic = 'force-dynamic';

/** The furthest a snooze may push something. */
const MAX_DAYS = 90;

type Body = { key?: unknown; until?: unknown };

/** A snooze is the person's own: tenant AND user scoped, never anyone else's list. */
function notReady(e: unknown) {
  return isMissingTable((e as { cause?: unknown })?.cause ?? e)
    ? apiFail("Snooze isn't set up yet — ask your admin to finish the My Work update.", 503)
    : null;
}

/**
 * POST /api/my-work/snooze { key, until? } — hide one My Work item until a day
 * ('YYYY-MM-DD', default tomorrow in the person's zone). It shows again ON
 * that day. One row per person per item; snoozing again moves the day.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!isItemKey(body?.key)) return apiFail('key is required (the item to snooze).', 400);
    const { today } = await requestDay(req.headers, db, user.tenantId, 'my-work/snooze');
    const until = body?.until == null ? addDays(today, 1) : toDay(body.until);
    if (!until || until <= today || until > addDays(today, MAX_DAYS)) {
      return apiFail(`until must be a day after today and within ${MAX_DAYS} days.`, 400);
    }
    const { data } = await must<{ data: { item_key: string; until: string } | null; error: { message?: string } | null }>(
      (db as any).from('my_work_snoozes')
        .upsert({ tenant_id: user.tenantId, user_id: user.id, item_key: body!.key, until }, { onConflict: 'tenant_id,user_id,item_key' })
        .select('item_key, until')
        .maybeSingle(),
      'my_work_snoozes upsert',
    );
    return NextResponse.json({ snoozed: { item_key: data?.item_key ?? body!.key, until } }, { status: 201 });
  } catch (e) {
    return notReady(e) ?? apiError('my-work/snooze', e, "Couldn't snooze it. Please try again.");
  }
}

/** DELETE /api/my-work/snooze { key } — bring a snoozed item back now (Undo). */
export async function DELETE(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!isItemKey(body?.key)) return apiFail('key is required (the item to bring back).', 400);
    await must(
      (db as any).from('my_work_snoozes').delete()
        .eq('tenant_id', user.tenantId).eq('user_id', user.id).eq('item_key', body!.key),
      'my_work_snoozes delete',
    );
    return NextResponse.json({ restored: body!.key });
  } catch (e) {
    return notReady(e) ?? apiError('my-work/snooze', e, "Couldn't bring it back. Please try again.");
  }
}
