import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { toUi, type WarrantyRow } from '@/lib/warranty-claims-shape';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data: project } = await supabase.from('projects').select('id').eq('id', params.projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data, error } = await supabase
      .from('warranty_claims')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ claims: (data ?? []).map((r) => toUi(r as WarrantyRow)) });
  } catch (e) {
    // A failed read must NOT render as "no claims" — that reads as an all-clear on
    // a project that may have open defects. Surface it so the page shows a retry.
    console.error('[warranty-claims/GET]', e);
    return NextResponse.json({ error: 'Failed to load warranty claims.' }, { status: 500 });
  }
}

/** Next claim number for this project: WC-0001, WC-0002, ... */
async function nextClaimNumber(
  supabase: ReturnType<typeof createServerClient>,
  tenantId: string,
  projectId: string,
): Promise<string> {
  const { data } = await supabase
    .from('warranty_claims')
    .select('claim_number')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .not('claim_number', 'is', null)
    .order('claim_number', { ascending: false })
    .limit(1);
  const last = (data?.[0] as WarrantyRow | undefined)?.claim_number as string | undefined;
  const n = last ? Number(String(last).replace(/\D/g, '')) || 0 : 0;
  return `WC-${String(n + 1).padStart(4, '0')}`;
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    if (!body.title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });

    const base = {
      tenant_id: user.tenantId,
      project_id: params.projectId,
      title: body.title,
      description: body.description || null,
      category: body.category || 'general',
      location: body.location || null,
      reported_by: body.reported_by || user.email || null,
      reported_date: body.reported_date || new Date().toISOString().slice(0, 10),
      severity: body.priority || 'medium',
      status: body.status || 'submitted',
      trade: body.assigned_trade || null,
      assigned_to: body.assigned_contractor || null,
      scheduled_date: body.scheduled_date || null,
      resolved_at: body.completed_date || null,
      resolution: body.resolution || null,
      cost: Number(body.cost) || 0,
      covered_under_warranty: body.covered_under_warranty !== false,
      warranty_expiry: body.warranty_expiry || null,
      photo_urls: body.photos || [],
      notes: body.notes || null,
      communication_log: body.communication_log || [],
    };

    // claim_number is allocated server-side and guarded by a unique index, so two
    // concurrent creates can't both claim WC-0007. Retry the loser of a race.
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const claim_number = await nextClaimNumber(supabase, user.tenantId, params.projectId);
      const { data, error } = await supabase
        .from('warranty_claims')
        .insert({ ...base, claim_number } as never)
        .select()
        .single();
      if (!error) return NextResponse.json({ claim: toUi(data as WarrantyRow) }, { status: 201 });
      lastError = error;
      if ((error as { code?: string }).code !== '23505') break; // 23505 = unique_violation
    }
    throw lastError;
  } catch (e: unknown) {
    console.error('[warranty-claims/POST]', e);
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[projects/projectId/warranty-claims]', e);
    const msg = "Failed to create the warranty claim.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
