import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import {
  normaliseSelection, selectionTotals, priceOptions, optionCost, variance,
  type SelectionRow, type SelectionOption,
} from '@/lib/selections';

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

    const all = (selections || []) as SelectionRow[];

    /* The options the client is actually choosing between. Loaded in one query
       for every selection on the page rather than per row, and priced against
       each item's allowance so the client reads "adds $2,500" instead of a bare
       number they have to reconcile against a figure on another screen. */
    const ids = all.map((s: any) => s.id).filter(Boolean);
    let optionsBySelection: Record<string, any[]> = {};
    if (ids.length) {
      const { data: opts } = await db
        .from('selection_options').select('*')
        .in('selection_id', ids)
        .order('sort_order', { ascending: true });
      for (const o of opts ?? []) {
        const k = String(o.selection_id);
        (optionsBySelection[k] ||= []).push(o);
      }
    }

    const now = Date.now();
    const enriched = all.map((s: any) => ({
      ...normaliseSelection(s, now),
      options: priceOptions(s, optionsBySelection[String(s.id)] ?? []),
    }));

    // Group by category
    const grouped: Record<string, any[]> = {};
    for (const sel of enriched) {
      const cat = sel.category || 'General';
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(sel);
    }

    const totals = selectionTotals(all, now);
    const summary = {
      total: all.length,
      pending: totals.pending,
      selected: totals.selected,
      ordered: all.filter((s: any) => s.status === 'ordered').length,
      installed: all.filter((s: any) => s.status === 'installed').length,
      allowanceTotal: totals.allowanceTotal,
      selectedTotal: totals.selectedTotal,
      /* Negative is money the client owes above their allowances. This is the
         number a client most wants and the portal never showed. */
      varianceTotal: totals.varianceTotal,
      allowanceOutstanding: totals.allowanceOutstanding,
    };

    return NextResponse.json({
      selections: enriched,
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
    const { selection_id, option_id, chosen_option, notes } = body;

    if (!selection_id || (!option_id && !chosen_option)) {
      return NextResponse.json(
        { error: 'selection_id and either option_id or chosen_option are required' },
        { status: 400 }
      );
    }

    const db = createServerClient();

    // Verify the selection belongs to this project
    const { data: existing, error: fetchError } = await db
      .from('selections')
      .select('*')
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

    /* The price of what was chosen.
     *
     * This is the whole point of a selections log and it was the one thing a
     * client pick did not record: the chosen option's name was folded into a
     * text field and `selected_amount` was left null, so the allowance never
     * moved, the variance never computed, and a client choosing $6,600 of
     * upgrade registered as a decision worth nothing.
     *
     * The amount is taken from the option row, never from the request body — a
     * portal token holder must not be able to name their own price. */
    let chosenName = chosen_option ? String(chosen_option) : '';
    let amount: number | null = null;

    if (option_id) {
      const { data: opt } = await db
        .from('selection_options').select('*')
        .eq('id', option_id)
        .eq('selection_id', selection_id)
        .maybeSingle();
      if (!opt) return NextResponse.json({ error: 'That option is not available for this selection' }, { status: 404 });
      chosenName = String(opt.name ?? chosenName);
      amount = optionCost(opt as SelectionOption);
    }

    /* The builder's own notes are kept. The previous version overwrote `notes`
       outright, so a client picking an option erased whatever the estimator had
       written on that line. */
    const clientNote = [
      chosenName ? `Client chose: ${chosenName}` : null,
      notes ? String(notes) : null,
    ].filter(Boolean).join(' — ');
    const combinedNotes = [existing.notes || null, clientNote || null].filter(Boolean).join('\n');

    const update: Record<string, unknown> = {
      status: 'selected',
      selected_by: session.client_name || session.client_email,
      selected_at: new Date().toISOString(),
      notes: combinedNotes || null,
    };
    if (amount != null) {
      update.selected_amount = amount;
      // Keep the stored column honest at the moment it changes.
      update.variance = variance({ ...existing, selected_amount: amount } as SelectionRow);
    }

    const { data: updated, error: updateError } = await db
      .from('selections')
      .update(update)
      .eq('id', selection_id)
      // Re-scoped on the write, not only on the read above.
      .eq('tenant_id', session.tenant_id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ selection: normaliseSelection(updated as SelectionRow) });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
