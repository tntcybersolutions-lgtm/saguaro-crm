import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/prefill/:type/:id — the canonical fields for one entity, so a form
 * can PREFILL from the source of truth instead of making the user re-type what
 * the system already knows.
 *
 * The owner's "enter once, populate everywhere": pick a customer on the new
 * project form and its owner/address fill in; pick a sub on a bid and its
 * contact/trade/EIN fill in; and so on. Every form reads the same shapes here.
 *
 * type ∈ { sub, customer, project, contact }. Tenant-scoped (own data only),
 * read-only. Returns { fields: {...normalized camelCase...} } or 404.
 */
const TABLE: Record<string, string> = {
  sub: 'subcontractors',
  customer: 'customer_profiles',
  project: 'projects',
  contact: 'contacts',
};

function normalize(type: string, r: any): Record<string, any> {
  switch (type) {
    case 'sub':
      return {
        name: r.company_name ?? null,
        contactName: r.contact_name ?? null,
        email: r.email ?? r.contact_email ?? null,
        phone: r.phone ?? r.contact_phone ?? null,
        address: r.address ?? null, city: r.city ?? null, state: r.state ?? null, zip: r.zip ?? null,
        trade: r.trade ?? null, ein: r.ein ?? null,
        licenseNumber: r.license_number ?? null, licenseState: r.license_state ?? null,
      };
    case 'customer':
      return {
        name: r.name ?? null, email: r.email ?? null, phone: r.phone ?? null,
        city: r.city ?? null, state: r.state ?? null,
      };
    case 'project':
      return {
        name: r.name ?? null, projectNumber: r.project_number ?? null, projectType: r.project_type ?? null,
        address: r.address ?? null, city: r.city ?? null, state: r.state ?? null, zip: r.zip ?? null,
        ownerName: r.owner_name ?? null, ownerEmail: r.owner_email ?? null, customerId: r.customer_id ?? null,
      };
    case 'contact':
      return {
        name: r.name ?? null, role: r.role ?? null, company: r.company ?? null,
        phone: r.phone ?? null, email: r.email ?? null, customerId: r.customer_id ?? null,
      };
    default:
      return {};
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { type, id } = await params;

  const table = TABLE[type];
  if (!table) return NextResponse.json({ error: 'Unknown entity type' }, { status: 400 });

  try {
    const db = createServerClient() as any;
    const { data, error } = await db
      .from(table)
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ fields: normalize(type, data) });
  } catch (e) {
    return apiError('prefill', e, 'Could not load prefill data');
  }
}
