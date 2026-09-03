import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id') || searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ crew: [] }, { status: 200 });
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('crew_locations')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('updated_at', { ascending: false });

    if (error) {
      return apiError('field/crew-locations', error, 'Failed to fetch crew locations');
    }

    // Map DB columns to the shape the page expects (lat/lng, name).
    const userIds = Array.from(new Set((data || []).map((r: any) => r.user_id).filter(Boolean)));
    let names: Record<string, string> = {};
    if (userIds.length) {
      const { data: profs } = await db
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      for (const p of profs || []) names[p.id] = p.full_name!;
    }

    const crew = (data || []).map((r: any) => ({
      ...r,
      lat: r.latitude,
      lng: r.longitude,
      accuracy: r.accuracy_meters,
      name: names[r.user_id] || 'Crew Member',
    }));

    return NextResponse.json({ crew });
  } catch (err: any) {
    return apiError('field/crew-locations', err, 'Internal server error');
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await requirePermission(req, 'Projects', 'Edit');
    if (!g.ok) return g.res;
    const user = g.user;

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
          accuracy_meters: accuracy || null,
          heading: heading || null,
          speed: speed || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,project_id,user_id' }
      )
      .select()
      .single();

    if (error) {
      return apiError('field/crew-locations', error, 'Failed to update location');
    }

    return NextResponse.json({ location: data });
  } catch (err: any) {
    return apiError('field/crew-locations', err, 'Internal server error');
  }
}
