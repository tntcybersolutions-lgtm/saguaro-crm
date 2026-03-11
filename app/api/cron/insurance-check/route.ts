import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { onInsuranceExpiring } from '@/lib/triggers';

export async function GET(req: NextRequest) {
  // Vercel cron auth
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createServerClient();
    const today = new Date();
    const in30 = new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0];

    const { data: certs } = await db
      .from('insurance_certificates')
      .select('id, expiry_date')
      .eq('status', 'active')
      .lte('expiry_date', in30)
      .gte('expiry_date', today.toISOString().split('T')[0]);

    let processed = 0;
    for (const cert of (certs || []) as any[]) {
      const days = Math.ceil((new Date(cert.expiry_date).getTime() - today.getTime()) / 86400000);
      await onInsuranceExpiring(cert.id, days);
      processed++;
    }

    return NextResponse.json({ success: true, processed });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
