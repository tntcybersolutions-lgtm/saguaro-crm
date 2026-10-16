/**
 * POST /api/onboarding/company — Onboarding step 2 (company setup)
 *
 * The signup flow lands a brand-new owner on /onboarding/step-2, whose form
 * POSTs the company profile here. We authenticate via the sb-access-token
 * cookie (same resolution used across authed routes — see lib/supabase-server
 * getUser), then persist the company details onto the current user's tenant.
 *
 * The `tenants` table has no dedicated columns for license #, state, company
 * type, employee count, or annual volume, so those structured fields are stored
 * under `settings.company` (merged with any existing settings). The company name
 * maps to `tenants.name`, and we also mirror it onto the owner's profile.
 * Onboarding progress is advanced to step 2.
 *
 * Writes use the service-role client (bypasses RLS, scoped to the resolved
 * tenant_id). Returns { ok: true }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });

  const user = await getUser(req, res);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: Record<string, string> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const companyName = (body.companyName || '').trim();
  if (!companyName) {
    return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
  }

  const company = {
    license_number: (body.licenseNumber || '').trim(),
    state: (body.state || '').trim(),
    company_type: (body.companyType || '').trim(),
    employees: (body.employees || '').trim(),
    annual_volume: (body.annualVolume || '').trim(),
  };

  const tenantId = user.tenantId;

  try {
    const admin = createServerClient(); // service-role, typed, bypasses RLS

    // Merge into existing tenant settings so we don't clobber unrelated keys.
    const { data: existing } = await admin
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const prevSettings = ((existing as any)?.settings ?? {}) as Record<string, unknown>;
    const mergedSettings = { ...prevSettings, company };

    const { error: tenantErr } = await admin
      .from('tenants')
      .update({
        name: companyName,
        settings: mergedSettings,
        onboarding_step: 2,
      })
      .eq('id', tenantId);

    if (tenantErr) {
      console.error('[onboarding/company] tenant update error:', tenantErr.message);
      return NextResponse.json({ error: 'Could not save company details. Please try again.' }, { status: 500 });
    }

    // Mirror the company name onto the owner's profile (non-fatal).
    const { error: profileErr } = await admin
      .from('profiles')
      .update({ company: companyName })
      .eq('id', user.id);
    if (profileErr) {
      console.error('[onboarding/company] profile update error:', profileErr.message);
    }
  } catch (err) {
    return apiError('onboarding/company POST', err, 'Could not save company details. Please try again.');
  }

  return res;
}
