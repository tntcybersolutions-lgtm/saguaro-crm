import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const supabase = createServerClient();
    const ALLOWED_TM_TICKET_COLUMNS = [
      'ticket_number', 'description', 'work_date', 'labor', 'labor_hours', 'labor_rate',
      'labor_total', 'materials', 'materials_total', 'equipment', 'equipment_total', 'markup_pct',
      'tax_pct', 'total', 'status', 'approved_by', 'approved_at', 'signature_url',
      'contractor_signature', 'owner_signature', 'pdf_url', 'notes',
    ];
    const updates: Record<string, any> = {};
    for (const k of ALLOWED_TM_TICKET_COLUMNS) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('tm_tickets')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', params.id)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    // Never echo the request body back as a fake success on failure.
    if (error) {
      const status = error.code === 'PGRST116' ? 404 : 500;
      return apiError('projects/projectId/tm-tickets/id', error, "Failed to update ticket", status);
    }
    return NextResponse.json({ ticket: data });
  } catch {
    return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
  }
}
