import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helper';

/**
 * GET /api/inspection-templates
 * Returns AHJ inspection checklist templates (system + tenant-specific).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { supabase, tenantId } = auth;

  const { data, error } = await supabase
    .from('inspection_templates')
    .select('id, name, type, ahj, is_system_template, items')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order('is_system_template', { ascending: false })
    .order('name');

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

/**
 * POST /api/inspection-templates
 * Create a custom inspection template for this tenant.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { supabase, tenantId } = auth;

  const body = await req.json();

  if (!body.name || !body.type) {
    return NextResponse.json(
      { error: 'name and type are required' },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('inspection_templates')
    .insert({
      tenant_id: tenantId,
      name: body.name,
      type: body.type,
      ahj: body.ahj || null,
      items: body.items || [],
      is_system_template: false,
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
