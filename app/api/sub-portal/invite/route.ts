import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();
    // Map the invite modal's payload onto the REAL portal_users columns. The UI
    // sends camelCase { contactName, trade } but the columns are `name` / `role`
    // — the old whitelist only matched company+email, so the contact name and
    // trade were silently dropped on every invite (the roster reloaded blank).
    const row: Record<string, any> = {
      tenant_id: user.tenantId,
      portal_type: 'sub',
      status: body.status ?? 'pending',
      invited_at: body.invited_at ?? new Date().toISOString(),
    };
    if (body.company !== undefined) row.company = body.company;
    if (body.email !== undefined) row.email = body.email;
    const name = body.name ?? body.contactName;
    if (name !== undefined) row.name = name;
    const role = body.role ?? body.trade;
    if (role !== undefined) row.role = role;
    if (body.token !== undefined) row.token = body.token;
    if (Array.isArray(body.permissions)) row.permissions = body.permissions;
    if (body.project_id !== undefined) row.project_id = body.project_id;

    if (!row.email) {
      return NextResponse.json({ error: 'A subcontractor email is required.' }, { status: 400 });
    }

    const { data, error } = await db
      .from('portal_users')
      .insert(row as Database['public']['Tables']['portal_users']['Insert'])
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) {
    return apiError('sub-portal/invite POST', e);
  }
}
