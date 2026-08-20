import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();

  try {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: 'stage', stage: 1, message: 'Loading project modules...' });

        // Load all closeout-relevant data
        const [
          projectRes, punchRes, submittalsRes, inspectionsRes,
          warrantyRes, rfisRes, changeOrdersRes,
        ] = await Promise.all([
          db.from('projects').select('name, status').eq('id', projectId).eq('tenant_id', user.tenantId).single(),
          db.from('punch_list').select('id, status, title').eq('project_id', projectId).eq('tenant_id', user.tenantId),
          db.from('submittals').select('id, status, title').eq('project_id', projectId).eq('tenant_id', user.tenantId),
          db.from('inspections').select('id, status, result').eq('project_id', projectId).eq('tenant_id', user.tenantId),
          db.from('warranty_items').select('id, status').eq('project_id', projectId).eq('tenant_id', user.tenantId),
          db.from('rfis').select('id, status').eq('project_id', projectId).eq('tenant_id', user.tenantId),
          db.from('change_orders').select('id, status').eq('project_id', projectId).eq('tenant_id', user.tenantId),
        ]);

        const project = projectRes.data;
        const punch = punchRes.data || [];
        const submittals = submittalsRes.data || [];
        const inspections = inspectionsRes.data || [];
        const warranties = warrantyRes.data || [];
        const rfis = rfisRes.data || [];
        const cos = changeOrdersRes.data || [];

        send({ type: 'stage', stage: 2, message: 'Computing module completion...' });

        // Compute pct_complete for each module
        const punchClosed = punch.filter((p: any) => p.status === 'closed' || p.status === 'verified').length;
        const punchPct = punch.length > 0 ? Math.round((punchClosed / punch.length) * 100) : 100;

        const subApproved = submittals.filter((s: any) => s.status === 'approved' || s.status === 'accepted').length;
        const subPct = submittals.length > 0 ? Math.round((subApproved / submittals.length) * 100) : 100;

        const inspPassed = inspections.filter((i: any) => i.result === 'pass' || i.status === 'passed').length;
        const inspPct = inspections.length > 0 ? Math.round((inspPassed / inspections.length) * 100) : 100;

        const warrantyPct = warranties.length > 0 ? Math.round((warranties.filter((w: any) => w.status === 'received' || w.status === 'active').length / warranties.length) * 100) : 0;

        const rfiClosed = rfis.filter((r: any) => r.status === 'closed' || r.status === 'answered').length;
        const rfiPct = rfis.length > 0 ? Math.round((rfiClosed / rfis.length) * 100) : 100;

        const coApproved = cos.filter((c: any) => c.status === 'approved' || c.status === 'executed').length;
        const coPct = cos.length > 0 ? Math.round((coApproved / cos.length) * 100) : 100;

        const overallPct = Math.round((punchPct + subPct + inspPct + warrantyPct + rfiPct + coPct) / 6);

        const modules = {
          punch_list: { total: punch.length, complete: punchClosed, pct: punchPct },
          submittals: { total: submittals.length, complete: subApproved, pct: subPct },
          inspections: { total: inspections.length, complete: inspPassed, pct: inspPct },
          warranties: { total: warranties.length, complete: warranties.filter((w: any) => w.status === 'received' || w.status === 'active').length, pct: warrantyPct },
          rfis: { total: rfis.length, complete: rfiClosed, pct: rfiPct },
          change_orders: { total: cos.length, complete: coApproved, pct: coPct },
        };

        send({ type: 'modules', modules, overallPct });
        send({ type: 'stage', stage: 3, message: 'Generating Sage summary...' });

        // Sage writes closeout summary
        try {
          const anthropic = new Anthropic();
          const aiResponse = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            messages: [{
              role: 'user',
              content: `Write a professional closeout package summary for project "${project?.name}".

Module Status:
- Punch List: ${punchPct}% complete (${punchClosed}/${punch.length})
- Submittals: ${subPct}% (${subApproved}/${submittals.length})
- Inspections: ${inspPct}% (${inspPassed}/${inspections.length})
- Warranties: ${warrantyPct}% (${warranties.length} items)
- RFIs: ${rfiPct}% (${rfiClosed}/${rfis.length})
- Change Orders: ${coPct}% (${coApproved}/${cos.length})
- Overall: ${overallPct}%

Write 2-3 paragraphs summarizing the closeout status, highlighting what's outstanding, and recommending next steps. Be professional and construction-industry specific.`,
            }],
          });

          const summary = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '';
          send({ type: 'summary', summary });
        } catch {
          send({ type: 'summary', summary: 'AI summary unavailable. See module details above.' });
        }

        send({ type: 'stage', stage: 4, message: 'Saving closeout package...' });

        // Save to closeout_packages
        await db.from('closeout_packages').insert({
          tenant_id: user.tenantId,
          project_id: projectId,
          package_name: `Closeout Package — ${new Date().toLocaleDateString()}`,
          status: overallPct >= 100 ? 'complete' : 'in_progress',
          pct_complete: overallPct,
          modules,
          assembled_at: new Date().toISOString(),
          assembled_by: user.id,
          created_by: user.id,
        });

        send({ type: 'done' });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
