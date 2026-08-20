import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateChangeOrder } from '@/lib/pdf-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();

    // 1. Load full CO record
    const { data: co, error: coErr } = await db
      .from('change_orders')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (coErr || !co) return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
    const c = co as Record<string, unknown>;

    // 2. Load project
    const { data: project } = await db
      .from('projects')
      .select('name, address, project_number, owner_name, architect_name')
      .eq('id', String(c.project_id))
      .eq('tenant_id', user.tenantId)
      .single();
    const p = (project || {}) as Record<string, unknown>;

    // 3. Load tenant
    const { data: tenant } = await db
      .from('tenants')
      .select('name, address')
      .eq('id', user.tenantId)
      .single();
    const t = (tenant || {}) as Record<string, unknown>;

    // 4. Load profile
    const { data: profile } = await db
      .from('profiles')
      .select('full_name, title, email, phone')
      .eq('id', user.id)
      .single();
    const pm = (profile || {}) as Record<string, unknown>;

    // 5. Generate PDF
    const lineItems = Array.isArray(c.line_items) ? c.line_items : [];
    const workIncluded = Array.isArray(c.work_included) ? c.work_included : [];
    const workExcluded = Array.isArray(c.work_excluded) ? c.work_excluded : [];

    const pdfBytes = await generateChangeOrder({
      coNumber: Number(c.co_number) || 1,
      title: String(c.title || ''),
      description: c.description ? String(c.description) : null,
      reason: c.reason ? String(c.reason) : null,
      status: String(c.status || 'draft'),
      createdAt: String(c.created_at || new Date().toISOString()),
      amount: Number(c.amount) || 0,
      lineItems: lineItems.map((li: Record<string, unknown>) => ({
        description: String(li.description || ''),
        qty: Number(li.qty) || 0,
        unit: String(li.unit || ''),
        unit_cost: Number(li.unit_cost) || 0,
        total: Number(li.total) || 0,
      })),
      scheduleImpactDays: Number(c.schedule_impact_days) || 0,
      projectName: String(p.name || ''),
      projectNumber: p.project_number ? String(p.project_number) : null,
      projectAddress: p.address ? String(p.address) : null,
      ownerName: p.owner_name ? String(p.owner_name) : null,
      architectName: p.architect_name ? String(p.architect_name) : null,
      gcCompany: String(t.name || 'General Contractor'),
      gcAddress: t.address ? String(t.address) : null,
      pmName: String(pm.full_name || ''),
      pmTitle: pm.title ? String(pm.title) : null,
      pmEmail: pm.email ? String(pm.email) : null,
      pmPhone: pm.phone ? String(pm.phone) : null,
      scopeOfChange: c.scope_of_change ? String(c.scope_of_change) : null,
      workIncluded: workIncluded.map(String),
      workExcluded: workExcluded.map(String),
    });

    // 6. Upload to Supabase Storage
    const version = (Number(c.pdf_version) || 0) + 1;
    const storagePath = `documents/${user.tenantId}/change-orders/${id}/co-${c.co_number}-v${version}.pdf`;

    const { error: uploadErr } = await db.storage
      .from('documents')
      .upload(storagePath, Buffer.from(pdfBytes), {
        contentType: 'application/pdf',
        upsert: true,
      });

    let pdfUrl = '';
    if (!uploadErr) {
      const { data: urlData } = db.storage.from('documents').getPublicUrl(storagePath);
      pdfUrl = urlData.publicUrl;
    } else {
      console.error('[change-orders/generate-pdf] upload error:', uploadErr.message);
    }

    // 7. Update change order record
    await db.from('change_orders').update({
      pdf_url: pdfUrl || null,
      pdf_generated_at: new Date().toISOString(),
      pdf_version: version,
    }).eq('id', id).eq('tenant_id', user.tenantId);

    return NextResponse.json({ success: true, data: { pdf_url: pdfUrl } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
