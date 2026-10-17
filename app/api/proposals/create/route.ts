import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireAnyPermission, PROPOSAL_MONEY } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  // Proposal dollars: Sales or Budget (PROPOSAL_MONEY; role_gate_*_proposals agrees).
  const g = await requireAnyPermission(req, PROPOSAL_MONEY, 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
    const db = createServerClient();

    // The page POSTs a rich Proposal object (client id, version, created_date, …)
    // alongside camelCase projectId. Only persist real proposals columns and
    // scope the row to the tenant. Client-generated `id`/`version`/`created_date`
    // are not columns and must be dropped (the DB assigns id/created_at).
    const insert: Record<string, unknown> = {
      tenant_id: user.tenantId,
      project_id: body.project_id ?? body.projectId ?? null,
      created_by: user.id,
      status: body.status ?? 'Draft',
    };
    // proposals.title is NOT NULL, but the web version form only sends amount +
    // notes + version — with no title the insert violated NOT NULL and every
    // "Create Version" 500'd. Always derive a title. `version` isn't a column;
    // persist it as proposal_number so it round-trips to the version display.
    insert.title = (body.title ?? (body.version ? `Proposal ${body.version}` : 'Proposal')) as string;
    if (body.version !== undefined && body.proposal_number === undefined) insert.proposal_number = body.version;
    if (body.description !== undefined) insert.description = body.description;
    if (body.amount !== undefined) insert.amount = body.amount;
    if (body.total_amount !== undefined) insert.total_amount = body.total_amount;
    // proposals has both amount and total_amount; when the form sends a single
    // amount, mirror it into total_amount so both columns populate.
    if (body.amount !== undefined && body.total_amount === undefined) {
      insert.total_amount = body.amount;
    }
    if (body.client_name !== undefined) insert.client_name = body.client_name;
    if (body.client_email !== undefined) insert.client_email = body.client_email;
    if (body.client_company !== undefined) insert.client_company = body.client_company;
    if (body.proposal_number !== undefined) insert.proposal_number = body.proposal_number;
    if (body.pdf_url !== undefined && body.pdf_url !== null) insert.pdf_url = body.pdf_url;
    if (body.notes !== undefined) insert.description = insert.description ?? body.notes;

    const { data, error } = await db.from('proposals').insert(insert as Database['public']['Tables']['proposals']['Insert']).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, proposal: data });
  } catch (err: unknown) {
    return apiError('proposals/create POST', err);
  }
}
