import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

// ─── GET: fetch calibrations ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(req.url);
    const floorId = searchParams.get('floor_id');
    const projectId = searchParams.get('project_id');

    if (!floorId && !projectId) {
      return NextResponse.json(
        { error: 'Either floor_id or project_id query param is required' },
        { status: 400 },
      );
    }

    let query = supabase
      .from('ar_calibrations')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (floorId) query = query.eq('floor_id', floorId);
    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;

    if (error) {
      console.error('[ar/calibration] list error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch calibrations' }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: unknown) {
    console.error('[ar/calibration]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch calibrations' },
      { status: 500 },
    );
  }
}

// ─── POST: create or upsert calibration ─────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const body = await req.json();

    const {
      floor_id,
      project_id,
      scale_factor,
      ref_point_a,
      ref_point_b,
      real_distance_mm,
      pixel_distance,
    } = body;

    if (!floor_id) {
      return NextResponse.json({ error: 'floor_id is required' }, { status: 400 });
    }
    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    // Validate numeric fields
    if (scale_factor == null || typeof scale_factor !== 'number' || scale_factor <= 0) {
      return NextResponse.json({ error: 'scale_factor must be a positive number' }, { status: 400 });
    }
    if (real_distance_mm == null || typeof real_distance_mm !== 'number' || real_distance_mm <= 0) {
      return NextResponse.json({ error: 'real_distance_mm must be a positive number' }, { status: 400 });
    }
    if (pixel_distance == null || typeof pixel_distance !== 'number' || pixel_distance <= 0) {
      return NextResponse.json({ error: 'pixel_distance must be a positive number' }, { status: 400 });
    }

    // Validate ref points are objects
    if (!ref_point_a || typeof ref_point_a !== 'object') {
      return NextResponse.json({ error: 'ref_point_a must be a JSON object (e.g. {x, y, z})' }, { status: 400 });
    }
    if (!ref_point_b || typeof ref_point_b !== 'object') {
      return NextResponse.json({ error: 'ref_point_b must be a JSON object (e.g. {x, y, z})' }, { status: 400 });
    }

    // Verify project belongs to tenant
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id')
      .eq('id', project_id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (projErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Upsert: if calibration exists for this floor_id + tenant, update it
    const { data: existing } = await supabase
      .from('ar_calibrations')
      .select('id')
      .eq('floor_id', floor_id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    const record = {
      floor_id,
      project_id,
      tenant_id: user.tenantId,
      scale_factor,
      ref_point_a,
      ref_point_b,
      real_distance_mm,
      pixel_distance,
      calibrated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    let data;
    let error;

    if (existing) {
      // Update existing calibration
      const result = await supabase
        .from('ar_calibrations')
        .update(record)
        .eq('id', existing.id)
        .eq('tenant_id', user.tenantId)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Insert new calibration
      const result = await supabase
        .from('ar_calibrations')
        .insert(record)
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('[ar/calibration] upsert error:', error.message);
      return NextResponse.json({ error: 'Failed to save calibration' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data,
      action: existing ? 'updated' : 'created',
    }, { status: existing ? 200 : 201 });
  } catch (err: unknown) {
    console.error('[ar/calibration]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save calibration' },
      { status: 500 },
    );
  }
}
