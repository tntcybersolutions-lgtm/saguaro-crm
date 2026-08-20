import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('crew_locations')
      .select('*, profiles(full_name, email, avatar_url)')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('updated_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch crew locations', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ locations: data || [] });
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
    const { project_id, latitude, longitude, accuracy, heading, speed } = body;

    if (!project_id || latitude == null || longitude == null) {
      return NextResponse.json({ error: 'project_id, latitude, and longitude are required' }, { status: 400 });
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('crew_locations')
      .upsert(
        {
          tenant_id: user.tenantId,
          project_id,
          user_id: user.id,
          latitude,
          longitude,
          accuracy: accuracy || null,
          heading: heading || null,
          speed: speed || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,project_id,user_id' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update location', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ location: data });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
