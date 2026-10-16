import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Budget', 'View', { projectId: params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const { data: project } = await supabase.from('projects').select('id').eq('id', params.projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    let q = supabase.from('invoices').select('*').eq('project_id', params.projectId).eq('tenant_id', user.tenantId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ invoices: data ?? [] });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/invoices] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/invoices', e, 'Failed to load invoices');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Budget', 'Edit', { projectId: params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('invoices').insert({
      tenant_id: user.tenantId, project_id: params.projectId, created_by: user.id,
      direction: 'receivable', // owner billing — the GC bills the owner
      invoice_number: body.invoice_number || null, vendor_name: body.vendor_name,
      amount: body.amount ?? 0, tax: body.tax ?? 0,
      // Server-canonical: total always amount + tax, never left to DEFAULT 0.
      total: (Number(body.amount) || 0) + (Number(body.tax) || 0),
      status: String(body.status || 'draft').toLowerCase(),
      due_date: body.due_date || null, description: body.description || null,
      pdf_url: body.file_url || null,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ invoice: data }, { status: 201 });
  } catch (e: unknown) {
    return apiError('projects/[projectId]/invoices POST', e);
  }
}
