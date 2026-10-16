import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getPortalSession, PORTAL_PERMS } from '@/lib/portal-auth';
import { apiError } from '@/lib/api-error';

/** GET — list pending approvals for project */
export async function GET(req: NextRequest) {
  try {
    const session = await getPortalSession(req, PORTAL_PERMS.APPROVE_DOCUMENTS);
    if (!session) {
      return NextResponse.json({ error: 'Access denied — insufficient permissions' }, { status: 403 });
    }

    const db = createServerClient();
    const statusFilter = req.nextUrl.searchParams.get('status'); // optional filter

    let query = db
      .from('portal_approvals')
      .select('*')
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    } else {
      // Default to pending items
      query = query.eq('status', 'pending');
    }

    const { data: approvals, error } = await query;
    if (error) throw error;

    return NextResponse.json({ approvals: approvals || [] });
  } catch (e) {
    return apiError('portal/client/approvals GET', e);
  }
}

/** POST — create approval response (approve/reject) */
export async function POST(req: NextRequest) {
  try {
    const session = await getPortalSession(req, PORTAL_PERMS.APPROVE_DOCUMENTS);
    if (!session) {
      return NextResponse.json({ error: 'Access denied — insufficient permissions' }, { status: 403 });
    }

    const body = await req.json();
    const { approval_id, decision, signature_data, notes } = body;

    if (!approval_id || !decision) {
      return NextResponse.json(
        { error: 'approval_id and decision (approved/rejected) are required' },
        { status: 400 }
      );
    }

    if (!['approved', 'rejected'].includes(decision)) {
      return NextResponse.json(
        { error: 'Decision must be "approved" or "rejected"' },
        { status: 400 }
      );
    }

    const db = createServerClient();

    // Verify the approval belongs to this project
    const { data: existing, error: fetchError } = await db
      .from('portal_approvals')
      .select('id, status')
      .eq('id', approval_id)
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
    }

    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: `Approval already ${existing.status}` },
        { status: 409 }
      );
    }

    // Update the approval
    const { data: updated, error: updateError } = await db
      .from('portal_approvals')
      .update({
        status: decision,
        responded_by: session.client_name || session.client_email,
        responded_at: new Date().toISOString(),
        signature_data: signature_data || null,
        response_notes: notes || null,
      })
      .eq('id', approval_id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ approval: updated });
  } catch (e) {
    return apiError('portal/client/approvals POST', e);
  }
}
