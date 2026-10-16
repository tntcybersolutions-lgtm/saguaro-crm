import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('portal_users')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('portal_type', 'client')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) {
    return apiError('client-portal/users GET', e);
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();
    // Whitelist to live portal_users columns to avoid inserting non-existent keys.
    const row: Record<string, any> = {
      tenant_id: user.tenantId,
      portal_type: 'client',
    };
    for (const key of ['project_id', 'name', 'email', 'company', 'role', 'status', 'token', 'invited_at', 'permissions']) {
      if (body[key] !== undefined) row[key] = body[key];
    }
    const { data, error } = await db
      .from('portal_users')
      .insert(row as Database['public']['Tables']['portal_users']['Insert'])
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) {
    return apiError('client-portal/users POST', e);
  }
}
