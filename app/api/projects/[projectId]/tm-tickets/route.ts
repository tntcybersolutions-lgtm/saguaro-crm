import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('tm_tickets')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[projects/[projectId]/tm-tickets] read failed:', error.message);
      return apiError('projects/projectId/tm-tickets', error, 'Failed to load tickets');
    }
    return NextResponse.json({ tickets: data || [] });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/tm-tickets] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/tm-tickets', e, 'Failed to load tickets');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    if (!body.description || !String(body.description).trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }
    const supabase = createServerClient();
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const labor = Array.isArray(body.labor) ? body.labor : [];
    const materials = Array.isArray(body.materials) ? body.materials : [];
    const equipment = Array.isArray(body.equipment) ? body.equipment : [];
    // Mirror the client's line math (page.tsx calcLaborTotal / calcSubtotal): OT at 1.5x.
    const laborTotal = labor.reduce((s: number, l: any) => s + num(l.regHours) * num(l.rate) + num(l.otHours) * num(l.rate) * 1.5, 0);
    const materialsTotal = materials.reduce((s: number, m: any) => s + num(m.qty) * num(m.unitCost), 0);
    const equipmentTotal = equipment.reduce((s: number, e: any) => s + num(e.hours) * num(e.rate), 0);
    const subtotal = laborTotal + materialsTotal + equipmentTotal;
    const markupPct = num(body.markup_pct);
    const taxPct = num(body.tax_pct);
    const markupAmt = (subtotal * markupPct) / 100;
    const taxAmt = ((subtotal + markupAmt) * taxPct) / 100;
    const total = subtotal + markupAmt + taxAmt;
    // Build an explicit, whitelisted record. The previous version spread ...body
    // (dumping non-columns like date/reference/tax_pct/labor/signatures), set
    // created_by to an email (uuid column), and omitted the NOT NULL tenant_id — so
    // EVERY insert failed and the swallow returned a fake `tm-…` id (0 rows in DB).
    const record: Record<string, unknown> = {
      tenant_id: user.tenantId,
      project_id: params.projectId,
      description: String(body.description).trim(),
      work_date: body.date ?? body.work_date ?? null,
      labor,
      labor_total: laborTotal,
      materials,
      materials_total: materialsTotal,
      equipment,
      equipment_total: equipmentTotal,
      markup_pct: markupPct,
      tax_pct: taxPct,
      total,
      notes: body.notes ?? null,
      contractor_signature: body.contractor_signature ?? null,
      owner_signature: body.owner_signature ?? null,
      status: body.status || 'draft',
      created_by: user.id,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('tm_tickets').insert(record as never).select().single();
    if (error) {
      console.error('[tm-tickets/POST]', error);
      return apiError('projects/projectId/tm-tickets', error, "Failed to create T&M ticket", 500);
    }
    return NextResponse.json({ ticket: data }, { status: 201 });
  } catch (err) {
    console.error('[tm-tickets/POST]', err);
    return NextResponse.json({ error: 'Failed to create T&M ticket' }, { status: 500 });
  }
}
