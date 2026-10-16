import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();
    // Map each pasted invite onto the REAL portal_users columns. The bulk UI
    // builds rows with camelCase { contactName, trade, invitedDate }, but the
    // columns are `name` / `role` / `invited_at` — the old key-name whitelist
    // matched only company/email/status/permissions, so the contact name and
    // trade were silently dropped for every bulk-imported sub.
    const invites = (body.invites || []).map((invite: any) => {
      const row: Record<string, any> = {
        tenant_id: user.tenantId,
        portal_type: 'sub',
        status: invite.status ?? 'pending',
        invited_at: invite.invited_at ?? invite.invitedDate ?? new Date().toISOString(),
      };
      if (invite.company !== undefined) row.company = invite.company;
      if (invite.email !== undefined) row.email = invite.email;
      const name = invite.name ?? invite.contactName;
      if (name !== undefined) row.name = name;
      const role = invite.role ?? invite.trade;
      if (role !== undefined) row.role = role;
      if (invite.token !== undefined) row.token = invite.token;
      if (Array.isArray(invite.permissions)) row.permissions = invite.permissions;
      if (invite.project_id !== undefined) row.project_id = invite.project_id;
      return row;
    });
    const { data, error } = await db
      .from('portal_users')
      .insert(invites)
      .select();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) {
    return apiError('sub-portal/bulk-invite POST', e);
  }
}
