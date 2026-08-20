import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get('entity_type');
    const entityId = searchParams.get('entity_id');
    const limitParam = searchParams.get('limit');
    const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 200);

    if (!entityType || !entityId) {
      return NextResponse.json(
        { error: 'Missing required parameters: entity_type and entity_id' },
        { status: 400 }
      );
    }

    const db = createServerClient();

    const { data, error } = await db
      .from('activity_events')
      .select(
        'id, entity_type, entity_id, entity_name, action, changes, previous_values, user_id, user_name, user_email, project_id, ip_address, created_at'
      )
      .eq('tenant_id', user.tenantId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[audit-trail GET]', error);
      return NextResponse.json({ error: 'Failed to fetch audit trail' }, { status: 500 });
    }

    return NextResponse.json({ entries: data || [] });
  } catch (err) {
    console.error('[audit-trail GET] unexpected', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
