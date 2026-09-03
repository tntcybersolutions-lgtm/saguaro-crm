import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { randomBytes } from 'crypto';
import { apiError } from '@/lib/api-error';

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
      return apiError('webhooks/endpoints', error, 'Failed to list webhook endpoints');
    }

    // Mask secrets in response
    const endpoints = (data || []).map((ep: any) => ({
      ...ep,
      secret: ep.secret ? `${ep.secret.substring(0, 8)}...` : null,
    }));

    return NextResponse.json({ endpoints });
  } catch (err: any) {
    return apiError('webhooks/endpoints', err, 'Internal server error');
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
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
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
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
      return apiError('webhooks/endpoints', error, 'Failed to create webhook endpoint');
    }

    // Return full secret only on creation
    return NextResponse.json({ endpoint: data }, { status: 201 });
  } catch (err: any) {
    return apiError('webhooks/endpoints', err, 'Internal server error');
  }
}
