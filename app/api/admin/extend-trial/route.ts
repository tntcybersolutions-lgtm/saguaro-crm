/**
 * POST /api/admin/extend-trial — Extend a tenant's trial period
 * Body: { tenantId: string, days: number }
 * Only accessible by chad@tntcybersolutions.com or role=admin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

const ADMIN_EMAILS = ['chad@tntcybersolutions.com'];

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();
  const { data: profile } = await db
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .single();

  const isAdmin = ADMIN_EMAILS.includes(user.email) || profile?.role === 'admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { tenantId?: string; days?: number } = {};
  try {
    body = await req.json();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Invalid JSON';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { tenantId, days } = body;
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  if (!days || days < 1 || days > 365) return NextResponse.json({ error: 'days must be between 1 and 365' }, { status: 400 });

  try {
    // Get current tenant
    const { data: tenant, error: fetchErr } = await db
      .from('tenants')
      .select('id, name, plan, trial_ends_at, expires_at')
      .eq('id', tenantId)
      .single();

    if (fetchErr || !tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const msToAdd = days * 24 * 60 * 60 * 1000;
    const baseDate = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : new Date();
    const newExpiry = new Date(Math.max(baseDate.getTime(), Date.now()) + msToAdd).toISOString();

    const { error: updateErr } = await db
      .from('tenants')
      .update({
        trial_ends_at: newExpiry,
        expires_at: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (updateErr) throw updateErr;

    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
      new_trial_ends_at: newExpiry,
      days_added: days,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
