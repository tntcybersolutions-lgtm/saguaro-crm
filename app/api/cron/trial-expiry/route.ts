import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendTrialExpiring } from '@/lib/email';

export async function GET(req: NextRequest) {
  try {
    const db = createServerClient();
    const today = new Date();
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguaro-crm-rho.vercel.app';

    // Find trials expiring in 7, 3, or 1 day
    const { data: tenants } = await db
      .from('tenants')
      .select('*')
      .eq('plan', 'trial')
      .eq('is_active', true)
      .not('trial_ends_at', 'is', null);

    let sent = 0;
    for (const tenant of (tenants || []) as any[]) {
      const daysLeft = Math.ceil((new Date(tenant.trial_ends_at).getTime() - today.getTime()) / 86400000);
      if ([7, 3, 1, 0].includes(daysLeft)) {
        // Get user email
        const { data: profile } = await db.from('user_profiles').select('email, full_name').eq('tenant_id', tenant.id).limit(1).single();
        if (profile) {
          await sendTrialExpiring(
            (profile as any).email,
            (profile as any).full_name || 'there',
            daysLeft,
            `${APP_URL}/pricing`
          );
          sent++;
        }
      }
    }

    return NextResponse.json({ success: true, sent });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
