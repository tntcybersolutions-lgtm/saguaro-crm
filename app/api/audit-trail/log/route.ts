import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { entity_type, entity_id, entity_name, action, changes, previous_values, project_id } = body;

    if (!entity_type || !entity_id || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: entity_type, entity_id, and action' },
        { status: 400 }
      );
    }

    // Extract IP from request headers
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      req.headers.get('cf-connecting-ip') ||
      'unknown';

    const db = createServerClient();

    // Look up user's display name from profile
    const { data: profile } = await db
      .from('profiles')
      .select('preferred_name, first_name')
      .eq('id', user.id)
      .eq('tenant_id', user.tenantId)
      .single();

    const userName =
      (profile as any)?.preferred_name ||
      (profile as any)?.first_name ||
      user.email?.split('@')[0] ||
      'Unknown';

    const { data, error } = await db
      .from('audit_logs')
      .insert({
        tenant_id: user.tenantId,
        user_id: user.id,
        user_name: userName,
        user_email: user.email,
        entity_type,
        entity_id,
        entity_name: entity_name || null,
        action,
        changes: changes || null,
        previous_values: previous_values || null,
        project_id: project_id || null,
        ip_address: ip,
      })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('[audit-trail POST]', error);
      return NextResponse.json({ error: 'Failed to create audit log entry' }, { status: 500 });
    }

    return NextResponse.json({ success: true, entry: data }, { status: 201 });
  } catch (err) {
    console.error('[audit-trail POST] unexpected', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
