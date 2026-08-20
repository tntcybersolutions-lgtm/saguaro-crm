import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/**
 * Format a measurement value for display based on its unit.
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

// ─── PATCH: update measurement ──────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { id } = await params;
    const body = await req.json();

    // Verify measurement exists and belongs to tenant
    const { data: existing, error: fetchErr } = await supabase
      .from('laser_measurements')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
    }

    // Build update payload — only allowed fields
    const update: Record<string, unknown> = {};

    if (body.label !== undefined) update.label = body.label;
    if (body.takeoff_item_id !== undefined) update.takeoff_item_id = body.takeoff_item_id;
    if (body.notes !== undefined) update.notes = body.notes;

    // If unit changes, recalculate display value
    if (body.unit !== undefined) {
      update.unit = body.unit;
      update.value_display = formatValueDisplay(existing.value_mm, body.unit);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    update.updated_at = new Date().toISOString();

    const { data, error: updateErr } = await supabase
      .from('laser_measurements')
      .update(update)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (updateErr) {
      console.error('[laser/measurements/patch] update error:', updateErr.message);
      return NextResponse.json({ error: 'Failed to update measurement' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    console.error('[laser/measurements/patch]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 500 },
    );
  }
}

// ─── DELETE: delete measurement ─────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { id } = await params;

    // Delete with tenant check
    const { data, error: delErr } = await supabase
      .from('laser_measurements')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (delErr || !data) {
      return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted: data });
  } catch (err: unknown) {
    console.error('[laser/measurements/delete]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Delete failed' },
      { status: 500 },
    );
  }
}
