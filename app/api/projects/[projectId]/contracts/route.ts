import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { signFields } from '@/lib/storage-signing';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data: project } = await supabase.from('projects').select('id').eq('id', params.projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');
    let q = supabase.from('contracts').select('*').eq('project_id', params.projectId).eq('tenant_id', user.tenantId);
    if (type) q = q.eq('contract_type', type);
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    // pdf_url/file_url point at the PRIVATE project-files bucket — sign them so the
    // client's "View PDF" resolves instead of 400-ing on a bare public URL.
    const contracts = await signFields((data ?? []) as Record<string, unknown>[], ['pdf_url', 'file_url']);
    return NextResponse.json({ contracts });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/contracts] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return NextResponse.json({ error: 'Failed to load contracts', detail }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Budget', 'Edit', { projectId: params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('contracts').insert({
      tenant_id: user.tenantId, project_id: params.projectId,
      party_name: body.party_name || body.vendor_name || 'N/A', // NOT NULL
      contract_number: body.contract_number || null, title: body.title,
      contract_type: body.contract_type || 'subcontract',
      vendor_name: body.vendor_name || null, vendor_email: body.vendor_email || null,
      original_amount: body.original_amount || 0,
      retainage_pct: body.retainage_pct || 10, start_date: body.start_date || null,
      end_date: body.end_date || null, scope_of_work: body.scope_of_work || null,
      status: body.status || 'draft', insurance_required: body.insurance_required ?? true,
      bonding_required: body.bonding_required ?? false, notes: body.notes || null, created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ contract: data }, { status: 201 });
  } catch (e: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[projects/projectId/contracts]', e);
    const msg = "Failed";
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
