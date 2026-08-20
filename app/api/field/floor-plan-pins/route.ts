import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/**
 * Floor Plan Pins API — fully wired
 * Accepts both camelCase (projectId, x_pct, y_pct) from mobile field app
 * and snake_case (project_id, x_percent, y_percent) from CRM.
 * GET    ?projectId=&drawingId=&pin_type=
 * POST   { projectId, drawing_id, x_pct, y_pct, label, pin_type, note }
 * PATCH  { id, resolved?, label?, note?, pin_type?, photo_url? }
 * DELETE ?id=
 */

export async function GET(req: NextRequest) {
    try {
          const user = await getUser(req);
          if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          const { searchParams } = new URL(req.url);
          const projectId = searchParams.get('projectId') || searchParams.get('project_id');
          const drawingId = searchParams.get('drawingId') || searchParams.get('drawing_id');
          const pinType   = searchParams.get('pin_type');
          if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
          const db = createServerClient();
          let query = db.from('floor_plan_pins').select('*')
            .eq('project_id', projectId).eq('tenant_id', user.tenantId)
            .order('created_at', { ascending: false });
          if (drawingId) query = query.eq('drawing_id', drawingId);
          if (pinType)   query = query.eq('pin_type', pinType);
          const { data, error } = await query;
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json({ pins: data || [] });
    } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
        try {
              const user = await getUser(req);
              if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
              const body = await req.json();
              const projectId  = body.projectId  || body.project_id;
              const drawingId  = body.drawing_id || body.drawingId;
              const xPct       = body.x_pct      ?? body.x_percent;
              const yPct       = body.y_pct      ?? body.y_percent;
              const label      = body.label      || '';
              const pinType    = body.pin_type   || 'location';
              const note       = body.note       || body.description || null;
              const photoUrl   = body.photo_url  || null;
              if (!projectId || !drawingId || xPct == null || yPct == null) {
                      return NextResponse.json({ error: 'projectId, drawing_id, x_pct, y_pct required' }, { status: 400 });
              }
              const db = createServerClient();
              const { data, error } = await db.from('floor_plan_pins').insert({
                      tenant_id: user.tenantId, project_id: projectId, drawing_id: drawingId,
                      pin_type: pinType, x_pct: xPct, y_pct: yPct, x_percent: xPct, y_percent: yPct,
                      label, note, photo_url: photoUrl,
                      linked_item_type: body.linked_item_type || null,
                      linked_item_id:   body.linked_item_id   || null,
                      resolved: false, created_by: user.id,
              }).select().single();
              if (error) return NextResponse.json({ error: error.message }, { status: 500 });
              return NextResponse.json({ pin: data }, { status: 201 });
        } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
    try {
          const user = await getUser(req);
          if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          const body = await req.json();
          const { id, resolved, label, note, pin_type, photo_url } = body;
          if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
          const updates: Record<string, any> = { updated_at: new Date().toISOString() };
          if (resolved  !== undefined) updates.resolved  = resolved;
          if (label     !== undefined) updates.label     = label;
          if (note      !== undefined) updates.note      = note;
          if (pin_type  !== undefined) updates.pin_type  = pin_type;
          if (photo_url !== undefined) updates.photo_url = photo_url;
          const db = createServerClient();
          const { data, error } = await db.from('floor_plan_pins').update(updates)
            .eq('id', id).eq('tenant_id', user.tenantId).select().single();
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json({ pin: data });
    } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
    try {
          const user = await getUser(req);
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          const { searchParams } = new URL(req.url);
          const id = searchParams.get('id');
          if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
          const db = createServerClient();
          const { error } = await db.from('floor_plan_pins').delete()
            .eq('id', id).eq('tenant_id', user.tenantId);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json({ success: true });
    } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}
