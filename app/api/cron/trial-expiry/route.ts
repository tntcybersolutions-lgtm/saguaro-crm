import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendTrialExpiring } from '@/lib/email';

export async function GET(req: NextRequest) {
  // Same guard as every other cron: only Vercel Cron (Bearer CRON_SECRET) may run
  // this in production. It was open, so anyone could trigger trial emails.
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const db = createServerClient();
    const today = new Date();
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

    // Find trials expiring in 7, 3, or 1 day
    const { data: tenants } = await db
      .from('tenants')
      .select('*')
      .eq('plan', 'trial')
      .in('subscription_status', ['active', 'trialing'])
      .not('trial_ends_at', 'is', null);

    let sent = 0;
    for (const tenant of (tenants || []) as any[]) {
      const daysLeft = Math.ceil((new Date(tenant.trial_ends_at).getTime() - today.getTime()) / 86400000);
      if ([7, 3, 1, 0].includes(daysLeft)) {
        // Get user email
        const { data: profile } = await db.from('profiles').select('email, full_name').eq('tenant_id', tenant.id).limit(1).single();
        if (profile) {
          const mail = await sendTrialExpiring(
            (profile as any).email,
            (profile as any).full_name || 'there',
            daysLeft,
            `${APP_URL}/pricing`
          );
          if (mail.sent) sent++;
          else console.error('[cron/trial-expiry] email not sent', tenant.id, mail.error);
        }
      }
    }

    return NextResponse.json({ success: true, sent });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
