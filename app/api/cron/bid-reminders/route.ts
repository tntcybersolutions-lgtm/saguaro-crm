import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendSubInvitedToBid } from '@/lib/email';

export async function GET(req: NextRequest) {
  try {
    const db = createServerClient();
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguaro-crm-rho.vercel.app';

    // Find bid packages due in 3 days
    const in3 = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const { data: packages } = await db
      .from('bid_packages')
      .select('*, projects(name)')
      .eq('status', 'open')
      .lte('due_date', in3)
      .gte('due_date', today);

    let sent = 0;
    for (const pkg of (packages || []) as any[]) {
      // Get invites that haven't submitted
      const { data: invites } = await db
        .from('bid_package_invites')
        .select('*')
        .eq('bid_package_id', pkg.id)
        .eq('status', 'invited');

      for (const invite of (invites || []) as any[]) {
        await sendSubInvitedToBid(
          invite.sub_email, invite.sub_name,
          pkg.projects?.name || 'Project',
          pkg.trade, pkg.due_date,
          `REMINDER: Bid due ${pkg.due_date}. ${pkg.scope_summary || ''}`,
          `${APP_URL}/portals/sub/${invite.token}`
        );
        sent++;
      }
    }

    return NextResponse.json({ success: true, sent });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
