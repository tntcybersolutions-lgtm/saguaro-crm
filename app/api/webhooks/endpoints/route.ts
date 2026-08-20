import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { randomBytes } from 'crypto';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const active = searchParams.get('active');

    const db = createServerClient();
    let query = db
      .from('webhook_endpoints')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (active === 'true') query = query.eq('is_active', true);
    if (active === 'false') query = query.eq('is_active', false);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to list webhook endpoints', details: error.message }, { status: 500 });
    }

    // Mask secrets in response
    const endpoints = (data || []).map((ep: any) => ({
      ...ep,
      secret: ep.secret ? `${ep.secret.substring(0, 8)}...` : null,
    }));

    return NextResponse.json({ endpoints });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { url, events, description, project_id } = body;

    if (!url || !events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'url and events array are required' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Server error";
      return NextResponse.json({ error: msg }, {status: 400});
    }

    // Generate signing secret
    const secret = `whsec_${randomBytes(24).toString('hex')}`;

    const db = createServerClient();
    const { data, error } = await db
      .from('webhook_endpoints')
      .insert({
        tenant_id: user.tenantId,
        url,
        events,
        description: description || null,
        project_id: project_id || null,
        secret,
        is_active: true,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to create webhook endpoint', details: error.message }, { status: 500 });
    }

    // Return full secret only on creation
    return NextResponse.json({ endpoint: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
