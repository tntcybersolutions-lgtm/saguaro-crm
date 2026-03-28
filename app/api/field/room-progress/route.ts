import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/**
 * Room Progress API — fully wired
 * Supports polygon_points + drawing_id for floor plan integration.
 * GET    ?project_id=&floor_id=&drawing_id=
 * POST   { project_id, drawing_id, room_name, floor_id, polygon_points, percent_complete, trade, notes }
 * PUT    { id, percent_complete?, status?, notes?, trade?, polygon_points? }
 * DELETE ?id=
 */

export async function GET(req: NextRequest) {
    try {
          const user = await getUser(req);
          if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          const { searchParams } = new URL(req.url);
          const projectId  = searchParams.get('project_id') || searchParams.get('projectId');
          const floorId    = searchParams.get('floor_id');
          const drawingId  = searchParams.get('drawing_id');
          if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 });
          const db = createServerClient();
          let query = db.from('room_progress').select('*')
            .eq('project_id', projectId).eq('tenant_id', user.tenantId)
            .order('room_name', { ascending: true });
          if (floorId)   query = query.eq('floor_id', floorId);
          if (drawingId) query = query.eq('drawing_id', drawingId);
          const { data, error } = await query;
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json({ rooms: data || [] });
    } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
    try {
          const user = await getUser(req);
          if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          const body = await req.json();
          const { project_id, drawing_id, room_name, floor_id, polygon_points,
                             trade, status, percent_complete, notes, color } = body;
          if (!project_id || !room_name) {
                  return NextResponse.json({ error: 'project_id and room_name required' }, { status: 400 });
          }
          const db = createServerClient();
          const { data, error } = await db.from('room_progress').insert({
                  tenant_id:       user.tenantId,
                  project_id,
                  drawing_id:      drawing_id      || null,
                  room_name,
                  floor_id:        floor_id        || null,
                  polygon_points:  polygon_points  || null,
                  trade:           trade           || null,
                  status:          status          || 'not_started',
                  percent_complete: percent_complete ?? 0,
                  notes:           notes           || null,
                  color:           color           || null,
                  updated_by:      user.id,
          }).select().single();
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json({ room: data }, { status: 201 });
    } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}

export async function PUT(req: NextRequest) {
    try {
          const user = await getUser(req);
          if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          const body = await req.json();
          const { id, status, percent_complete, notes, trade, polygon_points, color, drawing_id } = body;
          if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
          const updates: Record<string, any> = { updated_by: user.id, updated_at: new Date().toISOString() };
          if (status           !== undefined) updates.status           = status;
                if (percent_complete !== undefined) updates.percent_complete = percent_complete;
          if (notes            !== undefined) updates.notes            = notes;
          if (trade            !== undefined) updates.trade            = trade;
          if (polygon_points   !== undefined) updates.polygon_points   = polygon_points;
          if (color            !== undefined) updates.color            = color;
          if (drawing_id       !== undefined) updates.drawing_id       = drawing_id;
          const db = createServerClient();
          const { data, error } = await db.from('room_progress').update(updates)
            .eq('id', id).eq('tenant_id', user.tenantId).select().single();
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json({ room: data });
    } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
    // Alias for PUT — mobile uses PATCH
  return PUT(req);
}

export async function DELETE(req: NextRequest) {
    try {
          const user = await getUser(req);
          if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          const { searchParams } = new URL(req.url);
          const id = searchParams.get('id');
          if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
          const db = createServerClient();
          const { error } = await db.from('room_progress').delete()
            .eq('id', id).eq('tenant_id', user.tenantId);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json({ success: true });
    } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}
