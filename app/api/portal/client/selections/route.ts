import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
/* THIS FILE CARRIED ITS OWN COPY OF getPortalSession, and that copy checked
   the token and the status and stopped there. portal_client_sessions has an
   expires_at column, so an EXPIRED client link kept working on this route —
   a homeowner or an owner's rep who was given portal access for one phase
   could still read the selections list long after the link was meant to die.

   The same omission was found and fixed once already, in
   app/api/portal/client/auth/route.ts, whose comment records it: "The
   canonical lib/portal-auth validator does this; this local copy previously
   skipped it, so expired portal tokens still worked." That fix never reached
   here, which is what happens when an auth check is copied instead of called.

   Using the canonical validator rather than repairing the copy: it checks
   token, status AND expiry in one place, and it can also enforce a named
   permission from the session, which a hand-rolled copy silently cannot. */
import { getPortalSession } from '@/lib/portal-auth';

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
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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

    // Live selections columns relevant here: status, selected_by, selected_at,
    // notes, selected_amount. There is no chosen_option or client_notes column;
    // the chosen option and any client note are combined into notes.
    const combinedNotes = [
      chosen_option ? `Chosen: ${chosen_option}` : null,
      notes || null,
    ].filter(Boolean).join(' — ');

    const { data: updated, error: updateError } = await db
      .from('selections')
      .update({
        status: 'selected',
        selected_by: session.client_name || session.client_email,
        selected_at: new Date().toISOString(),
        notes: combinedNotes || null,
      })
      .eq('id', selection_id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ selection: updated });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
