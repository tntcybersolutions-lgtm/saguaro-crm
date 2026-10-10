import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { onSubAddedToProject } from '@/lib/triggers';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send the subcontractor as JSON.' }, { status: 400 });
    if (!String(body.name ?? body.companyName ?? '').trim()) {
      return NextResponse.json({ error: 'name: enter the company name.' }, { status: 400 });
    }
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

    // Triggers (W9, preliminary notice). The trigger runs on the service-role
    // client and writes to whatever project id it is given, so the id from the
    // body is checked against this tenant first — another company's project
    // id must not get this company's notification or webhook.
    if (body.projectId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.projectId))) {
      const { data: own, error: pErr } = await db.from('projects').select('id')
        .eq('id', String(body.projectId)).eq('tenant_id', tenantId).maybeSingle();
      if (pErr) throw pErr;
      if (own) onSubAddedToProject(String(body.projectId), (sub as { id: string }).id).catch(console.error);
    }

    return NextResponse.json({ sub, success: true });
  } catch (e) {
    // Was a silent `catch { 'Internal server error' }` — onboarding a sub that
    // failed (duplicate, bad trade, RLS) left no trace. Honest surface (§0/§3).
    return apiError('subs/create', e, 'Could not create the subcontractor');
  }
}
