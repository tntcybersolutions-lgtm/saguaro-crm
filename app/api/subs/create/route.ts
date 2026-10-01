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

    const { data: sub, error } = await db.from('subcontractors').insert({
      tenant_id: tenantId,
      company_name: body.name || body.companyName,
      email: body.email,
      phone: body.phone,
      address: body.address,
      city: body.city,
      state: body.state,
      zip: body.zip,
      trade: body.trade,
      license_number: body.licenseNumber,
      license_state: body.licenseState,
      status: 'active',
      w9_on_file: false,
      notes: body.notes,
    }).select().single();

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
