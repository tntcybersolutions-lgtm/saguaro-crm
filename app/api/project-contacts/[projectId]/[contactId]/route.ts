import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ projectId: string; contactId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { contactId } = await params;
  const body = await req.json();
  const db = createServerClient();

  try {
    const allowed = [
      'name', 'role', 'role_label', 'company', 'title', 'email', 'phone',
      'phone_office', 'phone_mobile', 'phone_emergency', 'address', 'department',
      'is_primary_contact', 'sort_order', 'notes',
    ];
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const { data, error } = await db
      .from('project_contacts')
      .update(updates)
      .eq('id', contactId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    return NextResponse.json({ contact: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { contactId } = await params;
  const db = createServerClient();

  try {
    const { error } = await db
      .from('project_contacts')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', contactId)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
