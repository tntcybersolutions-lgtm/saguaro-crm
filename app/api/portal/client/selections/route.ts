import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

async function getPortalSession(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_client_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  return session;
}

/** GET — list selection items for project */
export async function GET(req: NextRequest) {
  try {
    const session = await getPortalSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createServerClient();
    const category = req.nextUrl.searchParams.get('category');
    const status = req.nextUrl.searchParams.get('status');

    let query = db
      .from('selections')
      .select('*')
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .order('category', { ascending: true })
      .order('created_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data: selections, error } = await query;
    if (error) throw error;

    // Group by category
    const grouped: Record<string, any[]> = {};
    for (const sel of selections || []) {
      const cat = sel.category || 'General';
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(sel);
    }

    // Summary
    const all = selections || [];
    const summary = {
      total: all.length,
      pending: all.filter((s: any) => s.status === 'pending').length,
      selected: all.filter((s: any) => s.status === 'selected').length,
      ordered: all.filter((s: any) => s.status === 'ordered').length,
      installed: all.filter((s: any) => s.status === 'installed').length,
    };

    return NextResponse.json({
      selections: all,
      grouped,
      categories: Object.keys(grouped),
      summary,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load selections' }, { status: 500 });
  }
}

/** POST — client picks a selection option */
export async function POST(req: NextRequest) {
  try {
    const session = await getPortalSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { selection_id, chosen_option, notes } = body;

    if (!selection_id || !chosen_option) {
      return NextResponse.json(
        { error: 'selection_id and chosen_option are required' },
        { status: 400 }
      );
    }

    const db = createServerClient();

    // Verify the selection belongs to this project
    const { data: existing, error: fetchError } = await db
      .from('selections')
      .select('id, status')
      .eq('id', selection_id)
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Selection not found' }, { status: 404 });
    }

    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: `Selection already has status: ${existing.status}` },
        { status: 409 }
      );
    }

    const { data: updated, error: updateError } = await db
      .from('selections')
      .update({
        status: 'selected',
        chosen_option,
        selected_by: session.client_name || session.client_email,
        selected_at: new Date().toISOString(),
        client_notes: notes || null,
      })
      .eq('id', selection_id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ selection: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to submit selection' }, { status: 500 });
  }
}
