import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Format a measurement value for display based on its unit.
 *   ft_in  => 12' 6"
 *   m      => 3.810 m
 *   mm     => 3810 mm
 *   cm     => 381.0 cm
 *   in     => 150"
 */
function formatValueDisplay(valueMm: number, unit: string): string {
  switch (unit) {
    case 'ft_in': {
      const totalInches = valueMm / 25.4;
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);
      if (inches === 12) return `${feet + 1}' 0"`;
      if (feet === 0) return `${inches}"`;
      return `${feet}' ${inches}"`;
    }
    case 'm':
      return `${(valueMm / 1000).toFixed(3)} m`;
    case 'cm':
      return `${(valueMm / 10).toFixed(1)} cm`;
    case 'in':
      return `${(valueMm / 25.4).toFixed(2)}"`;
    case 'mm':
    default:
      return `${Math.round(valueMm)} mm`;
  }
}

// ─── GET: list measurements ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');

    if (!projectId) {
      return NextResponse.json({ error: 'project_id query param is required' }, { status: 400 });
    }

    let query = supabase
      .from('laser_measurements')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    const pinId = searchParams.get('pin_id');
    if (pinId) query = query.eq('pin_id', pinId);

    const roomId = searchParams.get('room_id');
    if (roomId) query = query.eq('room_id', roomId);

    const { data, error } = await query;

    if (error) {
      console.error('[laser/measurements] list error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch measurements' }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: unknown) {
    console.error('[laser/measurements]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch measurements' },
      { status: 500 },
    );
  }
}

// ─── POST: create measurement ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const body = await req.json();

    const {
      project_id,
      value_mm,
      unit = 'mm',
      device_name,
      device_type,
      label,
      pin_id,
      takeoff_item_id,
      notes,
      room_id,
    } = body;

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    if (value_mm == null || typeof value_mm !== 'number' || value_mm < 0) {
      return NextResponse.json({ error: 'value_mm must be a positive number' }, { status: 400 });
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

    const value_display = formatValueDisplay(value_mm, unit);

    const { data, error: insertErr } = await supabase
      .from('laser_measurements')
      .insert({
        project_id,
        tenant_id: user.tenantId,
        value_mm,
        unit,
        value_display,
        device_name: device_name || null,
        device_type: device_type || null,
        label: label || null,
        pin_id: pin_id || null,
        takeoff_item_id: takeoff_item_id || null,
        room_id: room_id || null,
        notes: notes || null,
        measured_by: user.id,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[laser/measurements] insert error:', insertErr.message);
      return NextResponse.json({ error: 'Failed to create measurement' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: unknown) {
    console.error('[laser/measurements]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create measurement' },
      { status: 500 },
    );
  }
}
