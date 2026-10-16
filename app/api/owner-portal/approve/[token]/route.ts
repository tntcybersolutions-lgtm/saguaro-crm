import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { onPayAppApproved } from '@/lib/triggers';
import { runInBackground } from '@/lib/background';
import { apiError } from '@/lib/api-error';
import { retainageLedger } from '@/lib/retainage';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const db = createServerClient();
    // Resolve the pay app by its owner-approval token. Fetch project + line
    // items with separate queries: schedule_of_values.pay_app_id has no FK
    // constraint, so a PostgREST embed (schedule_of_values(*)) errors out.
    const { data: pa, error } = await db
      .from('pay_applications')
      .select('*')
      .eq('owner_approval_token', token)
      .single();
    if (error || !pa) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [projectRes, sovRes, siblingsRes] = await Promise.all([
      pa.project_id
        ? db.from('projects').select('*').eq('id', pa.project_id).eq('tenant_id', String(pa.tenant_id)).maybeSingle()
        : Promise.resolve({ data: null }),
      db.from('schedule_of_values').select('*').eq('pay_app_id', pa.id).eq('tenant_id', String(pa.tenant_id)).order('sort_order', { ascending: true }),
      /* The owner sees the same G702 line 7 and retainage released as the GC
         (lib/retainage), not the unfilled prev_payments text column. */
      pa.project_id
        ? db.from('pay_applications')
            .select('id, app_number, total_retainage, retainage_amount, total_earned_less_retainage, less_previous_certificates, deleted_at')
            .eq('tenant_id', String(pa.tenant_id)).eq('project_id', pa.project_id)
        : Promise.resolve({ data: [pa] }),
    ]);

    return NextResponse.json({
      payApp: pa,
      project: projectRes.data || null,
      lineItems: sovRes.data || [],
      retainage: retainageLedger((siblingsRes.data || []) as any[], String(pa.id)),
    });
  } catch (e) {
    return apiError('owner-portal/approve GET', e, "Couldn't load this pay application. Please try again.");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const body = await req.json();
    const { action, note } = body;
    const db = createServerClient();

    // Check if this pay app has already been reviewed (prevent token reuse).
    // Live column is approved_at (not owner_approved_at).
    const { data: existing } = await db
      .from('pay_applications')
      .select('status, approved_at')
      .eq('owner_approval_token', token)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Pay application not found' }, { status: 404 });
    }

    if (existing.approved_at) {
      return NextResponse.json({ error: 'This pay application has already been reviewed.' }, { status: 409 });
    }

    const newStatus = action === 'approved' ? 'certified' : 'draft';
    // Live pay_applications columns: status, approval_notes, approved_at.
    // owner_notes -> approval_notes, owner_approved_at -> approved_at.
    // The token IS the credential here, the same way the signing portal works:
    // owner_approval_token is unguessable and identifies exactly one pay app,
    // which is why this route needs no tenant filter. (An older note here said
    // the column did not exist. It does — verified against the live schema.)
    const { data: updated, error } = await db
      .from('pay_applications')
      .update({
        status: newStatus,
        approval_notes: note,
        approved_at: new Date().toISOString(),
      })
      .eq('owner_approval_token', token)
      .select('id')
      .single();
    if (error) throw error;

    // OWNER approval is the normal flow — it must fire the SAME cascade the
    // internal approve route does (lien waivers generated + sign links emailed).
    // Guarded against double-fire above by the approved_at check.
    if (action === 'approved' && (updated as { id?: string })?.id) {
      runInBackground(onPayAppApproved((updated as { id: string }).id), 'onPayAppApproved');
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
