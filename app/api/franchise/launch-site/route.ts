import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { hasFeature } from '@/lib/entitlements-server';
import { buildTemplateRows, GOLF_TEMPLATE } from '@/lib/franchise-template';

import { apiError } from '@/lib/api-error';
/**
 * Launch a new franchise location from the standardized golf playbook.
 * Creates the project, then seeds phases, milestones, long-lead items, and
 * standard risks so every location runs the same proven process.
 * FAIL-CLOSED: only tenants entitled to `command_center`.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    if (!name) return NextResponse.json({ error: 'Site name is required' }, { status: 400 });

    const db = createServerClient();

    // 1) Create the project.
    const projRow: Record<string, any> = {
      tenant_id: user.tenantId,
      name: name.slice(0, 200),
      city: body.city ? String(body.city).slice(0, 120) : null,
      state: body.state ? String(body.state).slice(0, 40) : null,
      contract_value: body.contract_value != null && body.contract_value !== '' ? Number(body.contract_value) : null,
      percent_complete: 0,
      status: 'active',
      phase: 'preconstruction',
      rollout_stage: 'site_selection',
    };
    const { data: proj, error: projErr } = await db.from('projects').insert(projRow as any).select('*').single();
    if (projErr || !proj) throw projErr || new Error('project insert failed');

    // 2) Seed the playbook, dated from the start date (default today).
    const startISO = body.start_date && !isNaN(Date.parse(body.start_date))
      ? String(body.start_date) : new Date().toISOString().slice(0, 10);
    const startMs = Date.parse(startISO);
    const rows = buildTemplateRows(user.tenantId, (proj as any).id, startMs);

    const seeded: Record<string, number> = {};
    const warnings: string[] = [];
    const seed = async (table: string, data: any[], key: string) => {
      if (!data.length) { seeded[key] = 0; return; }
      const { error } = await db.from(table as any).insert(data as any);
      if (error) { warnings.push(`${key}: ${error.message}`); seeded[key] = 0; }
      else seeded[key] = data.length;
    };
    await seed('project_phases', rows.phases, 'phases');
    await seed('schedule_milestones', rows.milestones, 'milestones');
    await seed('procurement_items', rows.longLead, 'longLead');
    await seed('risk_register', rows.risks, 'risks');
    await seed('project_files', rows.folders, 'folders');
    await seed('project_todos', rows.checklist, 'checklist');
    await seed('project_todos', rows.qc, 'qc');
    await seed('project_todos', rows.preSite, 'preSite');

    return NextResponse.json({ project: proj, template: GOLF_TEMPLATE.name, seeded, warnings });
  } catch (e: any) {
    return apiError('franchise/launch-site', e, "launch failed", 500);
  }
}
