import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: takeoffId } = await params;

  try {
    const db = createServerClient();
    const body = await req.json().catch(() => ({}));
    const projectId = body.projectId || body.project_id;

    // Fetch takeoff + materials
    const [{ data: takeoff }, { data: materials }] = await Promise.all([
      db.from('takeoffs').select('*').eq('id', takeoffId).eq('tenant_id', user.tenantId).single(),
      db.from('takeoff_materials').select('*').eq('takeoff_id', takeoffId).eq('tenant_id', user.tenantId).order('sort_order'),
    ]);

    if (!takeoff) return NextResponse.json({ error: 'Takeoff not found' }, { status: 404 });
    if (!materials || materials.length === 0) {
      return NextResponse.json({ error: 'No materials found. Run analysis first.' }, { status: 400 });
    }

    const targetProjectId = projectId || takeoff.project_id;
    if (!targetProjectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    // Optional: filter to specific CSI divisions only
    const requestedDivisions = body.divisions as string[] | undefined;

    // Group materials by CSI division (first 2 digits)
    const byDivision: Record<string, typeof materials> = {};
    for (const item of materials) {
      const div = (item.csi_code || '00 00 00').trim().slice(0, 2);
      if (requestedDivisions?.length && !requestedDivisions.includes(div)) continue;
      if (!byDivision[div]) byDivision[div] = [];
      byDivision[div].push(item);
    }

    const created: { id: string; division: string; name: string; itemCount: number; budgetEstimate: number }[] = [];

    for (const [divCode, divItems] of Object.entries(byDivision)) {
      const divInfo = CSI_DIVISIONS[divCode];
      const divName = divInfo?.name || `Division ${divCode}`;
      const trade = divInfo?.trades?.[0] || divName;
      const budgetEstimate = divItems.reduce((sum, it) => sum + (Number(it.total_cost) || 0), 0);

      // Build scope summary from item descriptions
      const scopeSummary = divItems
        .slice(0, 10)
        .map((it) => it.description || it.csi_name)
        .join('; ');

      // AI scope generation from actual takeoff quantities
      let scopeNarrative = '';
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          const quantityList = divItems.slice(0, 20).map(it =>
            `- ${it.description || it.csi_name}: ${it.quantity || 0} ${it.unit || 'EA'} @ $${Number(it.unit_cost || 0).toLocaleString()}`
          ).join('\n');
          const scopeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514', max_tokens: 1200,
              messages: [{ role: 'user', content: `You are a senior GC writing a bid package scope for a licensed subcontractor.\n\nTrade/Division: ${divName} (CSI ${divCode})\nProject: ${takeoff.project_name_detected || ''}\n\nACTUAL TAKEOFF QUANTITIES:\n${quantityList}\n\nTOTAL ESTIMATED VALUE: $${Math.round(budgetEstimate).toLocaleString()}\n\nWrite a complete scope of work narrative that references the actual quantities above. Include: work included, work NOT included (exclusions), coordination requirements, applicable codes/standards. Be specific and professional. Respond with ONLY the scope text.` }],
            }),
          });
          const scopeData = await scopeRes.json() as { content?: { text: string }[] };
          scopeNarrative = scopeData.content?.[0]?.text || '';
        } catch (err) {
          console.error(`[create-bid-packages] AI scope gen for div ${divCode}:`, err);
        }
      }

      // Create the bid package
      const { data: pkg, error: pkgErr } = await db.from('bid_packages').insert({
        tenant_id: user.tenantId,
        created_by: user.id,
        project_id: targetProjectId,
        name: `${divCode} — ${divName}`,
        trade,
        description: `Materials from takeoff analysis — CSI Division ${divCode}`,
        scope_summary: scopeSummary.slice(0, 500),
        scope_narrative: scopeNarrative || null,
        budget_estimate: Math.round(budgetEstimate),
        status: 'draft',
        takeoff_id: takeoffId,
        csi_division: divCode,
        ai_generated: !!scopeNarrative,
        ai_generated_at: scopeNarrative ? new Date().toISOString() : null,
      }).select('id').single();

      if (pkgErr || !pkg) {
        console.error(`[create-bid-packages] Failed to create package for division ${divCode}:`, pkgErr?.message);
        continue;
      }

      // Create line items from takeoff materials
      const lineItems = divItems.map((item, idx) => ({
        bid_package_id: pkg.id,
        tenant_id: user.tenantId,
        description: item.description || item.csi_name || '',
        quantity: Number(item.quantity) || 0,
        unit: item.unit || 'EA',
        estimated_cost: Number(item.total_cost) || 0,
        unit_price: Number(item.unit_cost) || 0,
        total_amount: Number(item.total_cost) || 0,
        csi_code: item.csi_code || null,
        code: item.csi_code || null,
        title: item.csi_name || null,
        uom: item.unit || 'EA',
        sort_order: idx,
      }));

      // Insert in batches
      const BATCH = 50;
      for (let i = 0; i < lineItems.length; i += BATCH) {
        const batch = lineItems.slice(i, i + BATCH);
        const { error: itemErr } = await db.from('bid_package_items').insert(batch.map(item => ({ ...item, tenant_id: user.tenantId })));
        if (itemErr) console.error(`[create-bid-packages] Items batch error:`, itemErr.message);
      }

      created.push({
        id: pkg.id,
        division: divCode,
        name: `${divCode} — ${divName}`,
        itemCount: divItems.length,
        budgetEstimate: Math.round(budgetEstimate),
      });
    }

    return NextResponse.json({
      success: true,
      takeoffId,
      projectId: targetProjectId,
      packagesCreated: created.length,
      totalItems: materials.length,
      packages: created,
    });
  } catch (err) {
    console.error('[create-bid-packages]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
