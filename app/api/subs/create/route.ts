import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { onSubAddedToProject } from '@/lib/triggers';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();

    const tenantId = user.tenantId;

    // Persist the FULL subcontractor record. The allowlist dropped contact,
    // EIN, DBA, license type/expiry, insurance expiry, bonding and revenue, so
    // those were lost even when a caller sent them and had to be re-typed
    // elsewhere. Every field is optional and only set when present, so an old
    // minimal caller is unaffected.
    const set = <T,>(v: T) => (v === undefined || v === '' ? undefined : v);
    const trades = Array.isArray(body.trades) && body.trades.length ? body.trades : undefined;
    const { data: sub, error } = await db.from('subcontractors').insert({
      tenant_id: tenantId,
      company_name: body.name || body.companyName,
      contact_name: set(body.contactName ?? body.contact_name),
      email: set(body.email),
      contact_email: set(body.contactEmail ?? body.contact_email ?? body.email),
      phone: set(body.phone),
      contact_phone: set(body.contactPhone ?? body.contact_phone ?? body.phone),
      address: set(body.address),
      city: set(body.city),
      state: set(body.state),
      zip: set(body.zip),
      trade: set(body.trade),
      trades: trades as never,
      ein: set(body.ein),
      dba_name: set(body.dbaName ?? body.dba_name),
      license_number: set(body.licenseNumber ?? body.license_number),
      license_state: set(body.licenseState ?? body.license_state),
      license_type: set(body.licenseType ?? body.license_type),
      license_expiry: set(body.licenseExpiry ?? body.license_expiry),
      insurance_expiry: set(body.insuranceExpiry ?? body.insurance_expiry),
      bonding_capacity: set(body.bondingCapacity ?? body.bonding_capacity),
      annual_revenue_estimate: set(body.annualRevenueEstimate ?? body.annual_revenue_estimate),
      status: 'active',
      w9_on_file: body.w9OnFile === true,
      notes: set(body.notes),
    } as never).select().single();

    if (error) throw error;

    // Triggers (W9, preliminary notice)
    if (body.projectId) onSubAddedToProject(body.projectId, (sub as any).id).catch(console.error);

    return NextResponse.json({ sub, success: true });
  } catch (e) {
    // Was a silent `catch { 'Internal server error' }` — onboarding a sub that
    // failed (duplicate, bad trade, RLS) left no trace. Honest surface (§0/§3).
    return apiError('subs/create', e, 'Could not create the subcontractor');
  }
}
