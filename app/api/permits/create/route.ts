import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
    /* Was a 500 on a missing field — the database's rejection surfacing as an
       "Internal server error", which tells a user nothing and tells support
       nothing either. 400 naming the field, like the nineteen other create
       endpoints in this codebase. */
    if (!(body.project_id || body.projectId) || !(body.permit_type || body.permitType)) {
      return NextResponse.json({ error: 'project_id and permit_type are required' }, { status: 400 });
    }
    const db = createServerClient();

    // The page POSTs { projectId, status, inspector, permit_type, number,
    // authority, fee, applied_date, issued_date, expiry_date }. Map the page's
    // field names onto real permits columns, scope to tenant, and drop fields
    // with no column (inspector). `number`->permit_number, `authority`->issuing_authority.
    const insert: Record<string, unknown> = {
      tenant_id: user.tenantId,
      project_id: body.project_id ?? body.projectId ?? null,
      created_by: user.id,
      status: body.status ?? 'applied',
    };
    if (body.permit_type !== undefined) insert.permit_type = body.permit_type;
    if (body.permit_number !== undefined) insert.permit_number = body.permit_number;
    else if (body.number !== undefined) insert.permit_number = body.number;
    if (body.issuing_authority !== undefined) insert.issuing_authority = body.issuing_authority;
    else if (body.authority !== undefined) insert.issuing_authority = body.authority;
    if (body.fee !== undefined) insert.fee = body.fee;
    if (body.applied_date !== undefined && body.applied_date !== '') insert.applied_date = body.applied_date;
    if (body.issued_date !== undefined && body.issued_date !== '') insert.issued_date = body.issued_date;
    if (body.expiry_date !== undefined && body.expiry_date !== '') insert.expiry_date = body.expiry_date;
    if (body.notes !== undefined) insert.notes = body.notes;

    const { data, error } = await db.from('permits').insert(insert as Database['public']['Tables']['permits']['Insert']).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, permit: data });
  } catch (err: unknown) {
    return apiError('permits/create POST', err);
  }
}
