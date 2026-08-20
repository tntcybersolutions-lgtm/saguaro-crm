import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { token, type } = await req.json();
    if (!token) {
      return NextResponse.json({ error: 'Missing required field: token' }, { status: 400 });
    }

    // Record the unsubscribe for audit trail
    const { error: upsertErr } = await supabase
      .from('email_unsubscribes')
      .upsert({ token, email_type: type || null });

    if (upsertErr) throw upsertErr;

    if (!type) {
      // Full unsubscribe — disable all notifications for this profile
      const { data: sub } = await supabase
        .from('email_unsubscribes')
        .select('email')
        .eq('token', token)
        .single();

      if (sub?.email) {
        await supabase.from('profiles').update({
          email_notifications: {
            rfi_assigned: false,
            rfi_answered: false,
            rfi_overdue: false,
            submittal_assigned: false,
            submittal_approved: false,
            change_order_submitted: false,
            lien_waiver_request: false,
            budget_alert: false,
            safety_incident: false,
            marketing: false,
          },
        }).eq('email', sub.email);
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
