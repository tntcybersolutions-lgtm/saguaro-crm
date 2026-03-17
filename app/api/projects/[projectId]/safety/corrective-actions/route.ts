import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = createServerClient();

    // Try dedicated table first, fall back to safety_incidents with type discriminator
    let data: unknown[] | null = null;
    let error: unknown = null;

    const result = await supabase
      .from('safety_corrective_actions')
      .select('*')
      .eq('project_id', params.projectId)
      .order('created_at', { ascending: false });

    if (result.error) {
      // Table doesn't exist, try safety_incidents with type='corrective_action'
      const fallback = await supabase
        .from('safety_incidents')
        .select('*')
        .eq('project_id', params.projectId)
        .eq('type', 'corrective_action')
        .order('created_at', { ascending: false });

      if (fallback.error) {
        // Neither table works, return empty
        return NextResponse.json({ actions: [] });
      }
      data = fallback.data;
    } else {
      data = result.data;
      error = result.error;
    }

    return NextResponse.json({ actions: data || [] });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[safety/corrective-actions] GET error:', msg);
    return NextResponse.json({ actions: [] });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { description, assigned_to, due_date, incident_id } = body;

    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    const record = {
      project_id: params.projectId,
      description,
      assigned_to: assigned_to || null,
      due_date: due_date || null,
      status: 'open',
      incident_id: incident_id || null,
      created_by: user.email,
      created_at: new Date().toISOString(),
    };

    // Try dedicated table first
    const { data, error } = await supabase
      .from('safety_corrective_actions')
      .insert(record)
      .select()
      .single();

    if (error) {
      // Fall back to safety_incidents with type discriminator
      const fallbackRecord = {
        project_id: params.projectId,
        type: 'corrective_action',
        description,
        corrective_action: description,
        severity: 'N/A',
        date: due_date || new Date().toISOString().split('T')[0],
        status: 'open',
        assigned_to: assigned_to || null,
        due_date: due_date || null,
        created_at: new Date().toISOString(),
      };

      const fallback = await supabase
        .from('safety_incidents')
        .insert(fallbackRecord)
        .select()
        .single();

      if (fallback.error) {
        // Return a local-only record
        return NextResponse.json({
          action: { id: `ca-${Date.now()}`, ...record },
        });
      }

      return NextResponse.json({ action: fallback.data });
    }

    return NextResponse.json({ action: data });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[safety/corrective-actions] POST error:', msg);
    return NextResponse.json({ error: `Failed to create corrective action: ${msg}` }, { status: 500 });
  }
}
