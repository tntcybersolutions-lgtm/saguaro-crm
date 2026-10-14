import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { onInsuranceExpiring } from '@/lib/triggers';
import { apiError } from '@/lib/api-error';
import { addDays, companyDayLookup, companyTimeZones } from '@/lib/time-zone';
import { daysOnEarth, daysUntilDay } from '@/lib/calendar-day';

export async function GET(req: NextRequest) {
  // Vercel cron auth
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const ALERT_DAYS = new Set([30, 14, 7, 3, 1, 0]);
    const db = createServerClient();
    const now = new Date();
    /* "Expires in N days" counts from each company's own day (tenants.time_zone;
       the UTC day, logged, when a company has none) — a date-only expiry is good
       through the end of its day. One read covers every company (earliest day
       on Earth through 30 days past the latest), then each certificate is
       decided against its own company's day. */
    const earth = daysOnEarth(now);

    /* The error used to be dropped here: a failed read looked like "no
       certificates expiring" and the run reported success with nothing sent. */
    const { data: certs, error } = await db
      .from('insurance_certificates')
      .select('id, tenant_id, expiry_date')
      .eq('status', 'active')
      .lte('expiry_date', addDays(earth.latest, 30))
      .gte('expiry_date', earth.earliest);
    if (error) throw error;

    const zones = await companyTimeZones(db, ((certs || []) as { tenant_id: string }[]).map((c) => c.tenant_id));
    const todayFor = companyDayLookup(zones, 'cron/insurance-check', now);

    let processed = 0;
    for (const cert of (certs || []) as any[]) {
      const days = daysUntilDay(cert.expiry_date, todayFor(cert.tenant_id));
      // Alert on milestone days only. Running daily for every day inside 30
      // would email the sub, the GC and the admins thirty days in a row.
      if (days === null || !ALERT_DAYS.has(days)) continue;
      await onInsuranceExpiring(cert.id, days);
      processed++;
    }

    return NextResponse.json({ success: true, processed });
  } catch (e) {
    return apiError('cron/insurance-check', e);
  }
}
