import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const ROLE_ORDER = [
  'owner', 'owners_rep', 'architect', 'structural_engineer',
  'mep_engineer', 'civil_engineer', 'geotechnical', 'landscape',
  'gc_pm', 'gc_superintendent', 'gc_foreman', 'inspector',
  'ahj', 'utility', 'subcontractor', 'other',
];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();

  try {
    const { data: contacts, error } = await db
      .from('project_contacts')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('sort_order');

    if (error) throw error;

    const byRole: Record<string, any[]> = {};
    for (const role of ROLE_ORDER) byRole[role] = [];

    for (const c of contacts || []) {
      const role = c.role || 'other';
      if (!byRole[role]) byRole[role] = [];
      byRole[role].push(c);
    }

    return NextResponse.json({ contacts: contacts || [], by_role: byRole });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const body = await req.json();

  if (!body.name) return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
  if (!body.role) return NextResponse.json({ error: 'Missing required field: role' }, { status: 400 });

  const db = createServerClient();

  try {
    const { data, error } = await db
      .from('project_contacts')
      .insert({
        project_id: projectId,
        tenant_id: user.tenantId,
        name: body.name,
        role: body.role,
        role_label: body.role_label || null,
        company: body.company || null,
        title: body.title || null,
        email: body.email || null,
        phone: body.phone || null,
        phone_office: body.phone_office || null,
        phone_mobile: body.phone_mobile || null,
        phone_emergency: body.phone_emergency || null,
        address: body.address || null,
        department: body.department || null,
        subcontractor_id: body.subcontractor_id || null,
        is_primary_contact: body.is_primary_contact || false,
        notes: body.notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ contact: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
