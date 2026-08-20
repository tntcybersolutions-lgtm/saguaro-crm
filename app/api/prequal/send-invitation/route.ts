import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    if (!body.email?.trim()) {
      return NextResponse.json({ error: 'Missing required field: email' }, { status: 400 });
    }
    if (!body.company_name?.trim()) {
      return NextResponse.json({ error: 'Missing required field: company_name' }, { status: 400 });
    }

    const db = createServerClient();
    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30-day expiry

    const { data, error } = await db
      .from('prequal_submissions')
      .insert({
        tenant_id: user.tenantId,
        portal_token: token,
        portal_expires_at: expiresAt.toISOString(),
        company_name: body.company_name,
        contact_name: body.company_name, // placeholder until sub fills in
        contact_email: body.email,
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      id: data.id,
      token,
      portal_url: `/prequal/${token}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
