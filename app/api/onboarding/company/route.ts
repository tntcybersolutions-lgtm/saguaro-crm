/**
 * POST /api/onboarding/company — Save company details from onboarding step-2
 * Updates the tenant name/settings and the user's profile with company info.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, string> = {};
  try {
    body = await req.json();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Invalid JSON';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { companyName, licenseNumber, state, companyType, employees, annualVolume } = body;

  if (!companyName?.trim()) {
    return NextResponse.json({ error: 'companyName is required' }, { status: 400 });
  }

  try {
    const db = createServerClient();

    // Update tenant name and settings
    const { data: existing } = await db
      .from('tenants')
      .select('settings')
      .eq('id', user.tenantId)
      .single();

    const currentSettings = (existing?.settings as Record<string, unknown>) ?? {};

    const { error: tenantError } = await db
      .from('tenants')
      .update({
        name: companyName.trim(),
        settings: {
          ...currentSettings,
          license_number: licenseNumber || '',
          state: state || '',
          company_type: companyType || '',
          employees: employees || '',
          annual_volume: annualVolume || '',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.tenantId);

    if (tenantError) throw tenantError;

    // Update profile with company info
    const { error: profileError } = await db
      .from('profiles')
      .update({
        company: companyName.trim(),
        title: companyType || undefined,
        phone: body.phone || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .eq('tenant_id', user.tenantId);

    if (profileError) throw profileError;

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    console.error('[onboarding/company] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
