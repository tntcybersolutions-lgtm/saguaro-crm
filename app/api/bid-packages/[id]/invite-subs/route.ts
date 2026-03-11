import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { onSubInvitedToBid } from '@/lib/triggers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();

    const { data: pkg } = await db.from('bid_packages').select('tenant_id').eq('id', id).single();
    const tenantId = user?.id || (pkg as any)?.tenant_id;

    const subs = body.subs as Array<{ name: string; email: string; subId?: string }>;
    const results = [];

    for (const sub of subs) {
      // Skip if already invited
      const { data: existing } = await db
        .from('bid_package_invites')
        .select('id')
        .eq('bid_package_id', id)
        .eq('sub_email', sub.email)
        .single();
      if (existing) { results.push({ email: sub.email, status: 'already_invited' }); continue; }

      const { data: invite, error } = await db.from('bid_package_invites').insert({
        tenant_id: tenantId,
        bid_package_id: id,
        sub_id: sub.subId || null,
        sub_name: sub.name,
        sub_email: sub.email,
        status: 'invited',
      }).select().single();

      if (error) { results.push({ email: sub.email, status: 'error', error: error.message }); continue; }
      results.push({ email: sub.email, status: 'invited' });

      // Send invite email (non-blocking)
      onSubInvitedToBid(id, (invite as any).id).catch(console.error);
    }

    return NextResponse.json({ results, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
