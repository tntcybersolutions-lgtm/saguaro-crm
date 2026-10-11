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
import { getPortalSession, PORTAL_PERMS } from '@/lib/portal-auth';
import { apiError } from '@/lib/api-error';
import { signFields } from '@/lib/storage-signing';
import { allowanceBalance, optionPrice } from '@/lib/selection-math';
import { pickSelection } from '@/lib/selection-pick';

/** GET — the job's selections, each with the options the GC offers, and the running allowance balance. */
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
      .order('created_at', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data: rows, error } = await query;
    if (error) throw error;
    const selectionsRaw = await signFields((rows || []) as Array<Record<string, unknown>>, ['photo_url'], 3600, { strict: false });

    // Options for these selections only (selection_options has no tenant_id;
    // the ids above are already this session's project and tenant).
    const ids = selectionsRaw.map((s) => String(s.id));
    let options: Array<Record<string, unknown>> = [];
    if (ids.length) {
      const { data: opts, error: oErr } = await db
        .from('selection_options')
        .select('id, selection_id, name, description, manufacturer, model_number, color, finish, unit_cost, quantity, total_cost, image_url, spec_url, is_recommended, sort_order')
        .in('selection_id', ids)
        .order('sort_order', { ascending: true });
      if (oErr) throw oErr;
      options = await signFields((opts || []) as Array<Record<string, unknown>>, ['image_url'], 3600, { strict: false });
    }
    const byId = new Map<string, Array<Record<string, unknown>>>();
    for (const o of options) {
      const k = String(o.selection_id);
      if (!byId.has(k)) byId.set(k, []);
      byId.get(k)!.push({ ...o, price: optionPrice(o) });
    }
    const all: Array<Record<string, unknown>> = selectionsRaw.map((s) => ({ ...s, options: byId.get(String(s.id)) || [] }));

    // Group by category
    const grouped: Record<string, typeof all> = {};
    for (const sel of all) {
      const cat = String(sel.category || 'General');
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(sel);
    }

    const st = (s: Record<string, unknown>) => String(s.status || 'pending').toLowerCase();
    const summary = {
      total: all.length,
      pending: all.filter((s) => st(s) === 'pending').length,
      selected: all.filter((s) => st(s) === 'selected').length,
      ordered: all.filter((s) => st(s) === 'ordered').length,
      installed: all.filter((s) => st(s) === 'installed').length,
    };

    return NextResponse.json({
      selections: all,
      grouped,
      categories: Object.keys(grouped),
      summary,
      balance: allowanceBalance(all as Array<{ allowance?: unknown; selected_amount?: unknown; status?: string | null }>),
    });
  } catch (e) {
    return apiError('portal/client/selections', e, 'Could not load your selections.');
  }
}

/**
 * POST — the client makes a choice: { selection_id, option_id?, notes? }.
 * No option_id = approve the item as the contractor specified it. Over the
 * allowance, the difference becomes an approved change order (lib/selection-pick).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getPortalSession(req, PORTAL_PERMS.APPROVE_DOCUMENTS);
    if (!session) {
      return NextResponse.json({ error: 'This link cannot approve selections.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const selectionId = typeof body.selection_id === 'string' ? body.selection_id : '';
    const optionId = typeof body.option_id === 'string' && body.option_id ? body.option_id : null;
    if (!selectionId) {
      return NextResponse.json({ error: 'selection_id is required' }, { status: 400 });
    }

    const result = await pickSelection(createServerClient(), {
      tenantId: session.tenant_id,
      projectId: session.project_id,
      selectionId,
      optionId,
      pickedBy: session.client_name || session.client_email,
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({
      selection: result.selection,
      price: result.price,
      overage: Math.max(0, result.overage),
      changeOrder: result.changeOrder,
    });
  } catch (e) {
    return apiError('portal/client/selections', e, 'Your choice could not be saved. Please try again.');
  }
}
