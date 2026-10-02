import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { toCents, toDollars, sumCents, summarizeContract } from '@/lib/calc';
import { PUNCH_DONE } from '@/lib/project-lifecycle';
import { apiError } from '@/lib/api-error';
import { assignProjectToUser, endProjectAssignment } from '@/lib/project-assignment';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();
    const [
      { data: project },
      { data: subs },
      { data: payApps },
      { data: changeOrders },
      { data: rfis },
      { data: team },
      { data: budgetLines },
      { data: punchItems },
      { data: schedulePhases },
      { data: alerts },
    ] = await Promise.all([
      db.from('projects').select('*').eq('id', projectId).eq('tenant_id', user.tenantId).single(),
      db.from('contracts').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('created_at', { ascending: false }),
      db.from('pay_applications').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('app_number', { ascending: false }),
      db.from('change_orders').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('created_at', { ascending: false }),
      db.from('rfis').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('created_at', { ascending: false }),
      db.from('project_team').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId),
      db.from('budget_lines').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('cost_code', { ascending: true }),
      db.from('punch_list').select('id, status').eq('project_id', projectId).eq('tenant_id', user.tenantId),
      /* schedule_TASKS, not schedule_PHASES. The overview's Schedule card
         gates on this array being non-empty, and phases are written by
         almost nothing, so a project with a full seven-task schedule showed
         no Schedule card at all while /schedule listed all seven. Mapped
         below to the field names the card reads. */
      db.from('schedule_tasks').select('id, name, status, start_date, end_date, pct_complete, is_critical').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('start_date', { ascending: true }),
      db.from('autopilot_alerts').select('id, alert_type, severity, body, status, created_at').eq('project_id', projectId).eq('tenant_id', user.tenantId).eq('status', 'active').order('created_at', { ascending: false }).limit(10),
    ]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const cos = (changeOrders || []) as any[];
    const apps = (payApps || []) as any[];
    const lines = (budgetLines || []) as any[];
    const punch = (punchItems || []) as any[];
    const p = project as any;

    // Revised contract = original + APPROVED change orders only (exact cents).
    // Original = first POSITIVE contract column (see project-report/route.ts):
    // many projects leave contract_amount at 0 and carry the value elsewhere.
    const contractSummary = summarizeContract(
      toCents(p.original_contract_value || p.contract_value || p.original_contract || p.contract_amount || 0),
      cos.map((co: any) => ({
        id: String(co.id),
        description: String(co.description ?? ''),
        amount: toCents(co.amount || 0),
        status: co.status,
      })),
    );
    const contractSumToDate = toDollars(contractSummary.revisedContract);
    const totalBilledToDate = apps.length > 0 ? toDollars(toCents(apps[0].total_completed_stored || 0)) : 0;

    // Budget health aggregates — exact-cents sums, no float reduction.
    const budgetHealth = {
      originalBudget: toDollars(sumCents(lines.map((l: any) => toCents(l.original_budget || 0)))),
      committedCost: toDollars(sumCents(lines.map((l: any) => toCents(l.committed || 0)))),
      actualCost: toDollars(sumCents(lines.map((l: any) => toCents(l.actual || 0)))),
      forecastCost: toDollars(sumCents(lines.map((l: any) => toCents(l.projected || l.original_budget || 0)))),
      /* The number actuals must be judged against. Original budget is what was
         signed; revised is that plus every approved change order. Measuring
         spend against the original made any job with an approved CO read as
         over budget — a job at 99.4% of its revised budget was showing 104.6%
         spent, in red. Falls back to the original where a line predates the
         column. */
      revisedBudget: toDollars(sumCents(lines.map((l: any) =>
        toCents(l.revised_budget != null ? l.revised_budget : (l.original_budget || 0))))),
      approvedChanges: toDollars(sumCents(lines.map((l: any) => toCents(l.approved_changes || 0)))),
      lineCount: lines.length,
    };

    // Punch list summary
    /* Counted on the vocabulary the app actually writes — see PUNCH_DONE.
       This asked for 'complete' or 'closed'; punch_list stores 'completed' and
       'voided', and 'open' missed 'in_progress' entirely. A fully closed list
       of eight therefore reported 8 total, 0 open and 0 complete, which is the
       kind of arithmetic that makes a user stop believing the whole screen. */
    const done = (s: unknown) => (PUNCH_DONE as readonly string[]).includes(String(s || '').toLowerCase());
    const punchSummary = {
      total: punch.length,
      open: punch.filter((i: any) => !done(i.status)).length,
      complete: punch.filter((i: any) => done(i.status)).length,
    };

    return NextResponse.json({
      project: { ...p, contractSumToDate, totalBilledToDate },
      /* This is a CONTRACTS query — see the Promise.all above, which binds
         db.from('contracts') to a variable called `subs`. The overview's
         Subcontractors card reads sub.name and sub.contract_amount, and a
         contracts row carries party_name and amount, so every row painted a
         blank name, a "?" avatar and "$0" on a job with two executed
         subcontracts worth $1.965M. Mapped to what the card reads rather than
         changing the card, because this same query also feeds the committed
         figures beside it. */
      subs: (subs || []).map((c: any) => ({
        id: c.id,
        name: c.party_name || c.party_company || c.vendor_name || c.counterparty_name || c.title,
        trade: c.trade,
        contract_amount: c.amount ?? c.contract_amount ?? c.original_amount ?? 0,
        status: c.status,
      })),
      payApps: apps,
      changeOrders: cos,
      rfis: rfis || [],
      team: team || [],
      budgetLines: lines,
      budgetHealth,
      punchSummary,
      /* The card reads planned_end / actual_end / forecast_end. A task has
         end_date and a percent, so a finished task reports its end as actual
         and an unfinished one reports it as forecast — which is what those
         two fields mean. */
      schedulePhases: (schedulePhases || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        planned_end: t.end_date,
        actual_end: t.status === 'complete' ? t.end_date : null,
        forecast_end: t.status === 'complete' ? null : t.end_date,
      })),
      alerts: (alerts || []).map((a: any) => ({ ...a, title: a.alert_type, message: a.body })),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    const g = await requirePermission(req, 'Projects', 'Edit');
    if (!g.ok) return g.res;
    const user = g.user;
    const body = await req.json();
    const db = createServerClient();
    const ALLOWED_PROJECT_COLUMNS = [
      'name', 'address', 'type', 'contract_value', 'description', 'owner_name', 'owner_email',
      'architect', 'architect_email', 'contract_type', 'retainage_pct', 'start_date', 'end_date',
      'status', 'architect_entity', 'architect_license', 'gc_license', 'project_number', 'bid_date',
      'substantial_completion', 'final_completion', 'contract_date', 'notice_to_proceed', 'bonded',
      'prevailing_wage', 'county', 'state', 'zip', 'latitude', 'longitude', 'gc_name', 'gc_email',
      'gc_phone', 'sub_name', 'sub_email', 'sub_phone', 'project_manager', 'superintendent', 'foreman',
      'scope_of_work', 'divisions', 'tags', 'architect_name', 'architect_phone', 'architect_contact',
      'engineer_name', 'engineer_email', 'engineer_phone', 'engineer_entity', 'inspector_name',
      'inspector_email', 'inspector_phone', 'owner_phone', 'owner_entity', 'owner_address', 'gc_entity',
      'gc_address', 'gc_license_number', 'gc_license_expiry', 'gc_insurance_expiry', 'sub_entity',
      'sub_address', 'sub_license', 'pm_name', 'pm_email', 'pm_phone', 'super_name', 'super_email',
      'super_phone', 'foreman_name', 'foreman_email', 'foreman_phone', 'bid_number', 'permit_number',
      'permit_expiry', 'aia_project_number', 'federal_project_number', 'davis_bacon_wage_decision',
      'liquidated_damages', 'liquidated_damages_per', 'mobilization_pct', 'stored_materials_allowed',
      'certified_payroll_required', 'osha_required', 'leed_required', 'leed_level', 'insurance_required',
      'performance_bond_required', 'payment_bond_required', 'bond_amount', 'work_hours_start',
      'work_hours_end', 'work_days', 'logo_url', 'cover_photo_url', 'notes', 'internal_notes', 'phase',
      'percent_complete', 'original_contract_value', 'approved_change_orders', 'revised_contract_value',
      'billed_to_date', 'retainage_held', 'balance_to_finish', 'contract_amount', 'total_contract_amount',
      'original_contract_amount', 'contract_sum', 'scheduled_value', 'total_earned', 'total_billed',
      'total_paid', 'total_retainage', 'total_pending', 'cost_to_date', 'estimated_cost', 'projected_cost',
      'contingency', 'overhead_pct', 'profit_pct', 'tax_pct', 'insurance_pct', 'bond_pct', 'sq_footage',
      'num_floors', 'num_units', 'building_type', 'occupancy_type', 'construction_type', 'zoning',
      'parcel_number', 'legal_description', 'created_by', 'updated_by', 'deleted_at', 'deleted_by',
      'archived_at', 'archived_by', 'created_by_name', 'updated_by_name', 'assigned_to', 'assigned_to_name',
      'project_lead', 'project_lead_name', 'last_activity_at', 'last_log_at', 'last_photo_at', 'last_rfi_at',
      'last_pay_app_at', 'rfi_count', 'change_order_count', 'photo_count', 'punch_count', 'open_punch_count',
      'pay_app_count', 'current_pay_app_number', 'is_archived', 'is_deleted', 'is_template', 'template_name',
      'source', 'external_id', 'integration_source', 'custom_fields', 'metadata', 'final_completion_date',
      'substantial_completion_date', 'notice_to_proceed_date', 'bid_due_date', 'award_date',
      'contract_execution_date', 'groundbreaking_date', 'occupancy_date', 'warranty_expiry_date',
      'closeout_date', 'projected_start_date', 'projected_end_date', 'actual_start_date', 'actual_end_date',
      'revised_completion_date', 'owner_occupancy_date', 'punch_list_due_date', 'punch_list_complete_date',
      'lien_deadline_date', 'retention_release_date', 'state_jurisdiction', 'project_type',
      'original_contract', 'ntp_date', 'substantial_date', 'is_public_project', 'geofence_lat',
      'geofence_lng', 'geofence_radius_meters', 'net_change_by_co', 'approved_co_count', 'city',
      'estimated_completion', 'square_footage', 'architect_firm', 'completeness_score', 'setup_complete',
      'setup_step', 'setup_dismissed', 'health_score', 'target_finish_date', 'updated_at',
    ];
    const updates: Record<string, any> = {};
    for (const k of ALLOWED_PROJECT_COLUMNS) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    const { data, error } = await db.from('projects').update(updates).eq('id', projectId).eq('tenant_id', user.tenantId).select().single();
    if (error) throw error;
    return NextResponse.json({ project: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Directory slots on the Team page. Free text — the owner and the architect
   are usually not Saguaro users, and a PM/super may not have a login yet. */
const LEADERSHIP_FIELDS = [
  'pm_name', 'pm_email', 'super_name', 'super_email', 'foreman_name', 'foreman_email',
  'owner_name', 'owner_email', 'architect_name', 'architect_email',
] as const;

/**
 * PATCH /api/projects/[projectId]
 *
 * Who owns this job. Body (every key optional):
 *   assignedTo:  uuid of a signed-in tenant user, or null to clear
 *   customerId:  uuid of a tenant customer_profiles row, or null to clear
 *   leadership:  { pm_name, pm_email, super_name, ... } free-text directory slots
 *
 * Before this the only way to hand an existing job to someone was the
 * Customers page (customer-linked projects only) or a Work Assignment (locked
 * until an emailed invite was accepted).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const { user, db } = g;
  const tenantId = user.tenantId;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyDb = db as any;

    const { data: project, error: findErr } = await anyDb
      .from('projects')
      .select('id, name, owner_name, owner_email, assigned_to')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const updates: Record<string, unknown> = {};

    /* ── Customer ─────────────────────────────────────────────────────── */
    if (body.customerId !== undefined) {
      const raw = body.customerId == null ? '' : String(body.customerId).trim();
      if (!raw) {
        updates.customer_id = null;
      } else {
        if (!UUID_RE.test(raw)) return NextResponse.json({ error: 'customerId must be a customer id' }, { status: 400 });
        const { data: customer, error: custErr } = await db
          .from('customer_profiles')
          .select('id, name, email')
          .eq('id', raw)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (custErr) throw custErr;
        if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        updates.customer_id = customer.id;
        // The owner of record prints on the contract and pay apps; fill it
        // from the customer only when the job has none yet.
        if (!String(project.owner_name || '').trim() && customer.name) updates.owner_name = customer.name;
        if (!String(project.owner_email || '').trim() && customer.email) updates.owner_email = customer.email;
      }
    }

    /* ── Leadership directory slots ───────────────────────────────────── */
    if (body.leadership && typeof body.leadership === 'object') {
      const l = body.leadership as Record<string, unknown>;
      for (const k of LEADERSHIP_FIELDS) {
        if (l[k] === undefined) continue;
        const v = l[k] == null ? '' : String(l[k]).trim().slice(0, 200);
        if (k.endsWith('_email') && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
          return NextResponse.json({ error: `${k.replace('_', ' ')} is not a valid email address` }, { status: 400 });
        }
        updates[k] = v || null;
      }
    }

    /* ── Assigned to (clearing only; setting goes through the shared helper) ── */
    let assigneeName: string | null | undefined;
    let documentsAccessGranted = false;
    if (body.assignedTo !== undefined) {
      const raw = body.assignedTo == null ? '' : String(body.assignedTo).trim();
      if (!raw) {
        updates.assigned_to = null;
        updates.assigned_to_name = null;
        assigneeName = null;
      } else if (!UUID_RE.test(raw)) {
        return NextResponse.json({ error: 'assignedTo must be a team member id' }, { status: 400 });
      }
    }

    if (Object.keys(updates).length) {
      updates.updated_at = new Date().toISOString();
      const { error: updErr } = await anyDb
        .from('projects')
        .update(updates as never)
        .eq('id', projectId)
        .eq('tenant_id', tenantId);
      if (updErr) throw updErr;
    }

    // Unassigning: the job leaves the previous assignee's My Work hub too.
    if (updates.assigned_to === null && project.assigned_to) {
      await endProjectAssignment(db, { tenantId, projectId, userId: project.assigned_to });
    }

    if (body.assignedTo && UUID_RE.test(String(body.assignedTo).trim())) {
      const res = await assignProjectToUser(db, {
        tenantId,
        projectId,
        projectName: project.name || 'Project',
        assigneeUserId: String(body.assignedTo).trim(),
        actor: { id: user.id, email: user.email },
      });
      if (!res.ok) {
        return NextResponse.json({ error: 'That person is not a member of this workspace' }, { status: 400 });
      }
      assigneeName = res.assigneeName;
      documentsAccessGranted = res.documentsAccessGranted;
    }

    const { data: fresh, error: readErr } = await anyDb
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .single();
    if (readErr) throw readErr;

    return NextResponse.json({ project: fresh, assigneeName, documentsAccessGranted });
  } catch (e) {
    return apiError('projects/[projectId] PATCH', e, 'Could not save the change to this project');
  }
}

// Soft-delete: archive the project (is_archived=true, archived_at=now). FKs make a
// hard delete unsafe, so we never DELETE the row. Tenant-scoped by id+tenant_id.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    const g = await requirePermission(req, 'Projects', 'Full');
    if (!g.ok) return g.res;
    const user = g.user;

    const db = createServerClient();
    const { error } = await db
      .from('projects')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by: user.id ?? null,
      })
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
