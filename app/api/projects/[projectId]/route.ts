import { NextRequest, NextResponse } from 'next/server';
import { isJobColor } from '@/lib/project-colors';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { toCents, toDollars, sumCents } from '@/lib/calc';
import { contractMoney } from '@/lib/job-contract';
import { SCHEDULE_DONE, isScheduleDone } from '@/lib/schedule-status';
import { PUNCH_DONE } from '@/lib/project-lifecycle';
import { apiError } from '@/lib/api-error';
import { assignProjectToUser, endProjectAssignment } from '@/lib/project-assignment';
import { pickProjectUpdate } from '@/lib/project-update';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    // Role check, not just sign-in: Projects: View, the rule this tool's pages,
    // its writes and (where the table is gated) the database apply.
    const g = await requirePermission(req, 'Projects', 'View', { projectId: projectId });
    if (!g.ok) return g.res;
    const user = g.user;

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

    /* Revised contract = original + APPROVED change orders — the one rule the
       overview's snapshot, the owner portal and cash flow read
       (lib/job-contract). This route read contract_value / contract_amount as
       the ORIGINAL and then added approved COs; both already carry them on
       jobs like Pima, so the job summary counted every approved CO twice
       ($2,667,300 on a $2,539,650 contract). */
    const prime = ((subs || []) as any[]).find((c) => String(c.contract_type || '').toLowerCase() === 'prime') ?? null;
    let contract = contractMoney({ project: p, prime, changeOrders: cos });
    /* An ACCEPTED proposal version is the contract. Projects accepted before
       /api/proposals/[id]/status began writing the contract columns still
       carry $0 there — fall back to the accepted amount rather than $0. */
    if (contract.original <= 0) {
      const { data: acc } = await db
        .from('proposals')
        .select('amount, total_amount, status')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .ilike('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(1);
      const row = (acc || [])[0] as { amount: unknown; total_amount: unknown } | undefined;
      if (row) contract = contractMoney({ project: p, prime, acceptedProposal: row, changeOrders: cos });
    }
    const contractSumToDate = toDollars(toCents(contract.current));
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
        // One vocabulary (lib/schedule-status): 'complete' and 'completed' are both finished.
        status: isScheduleDone(t.status, t.pct_complete) ? SCHEDULE_DONE : t.status,
        planned_end: t.end_date,
        actual_end: isScheduleDone(t.status, t.pct_complete) ? t.end_date : null,
        forecast_end: isScheduleDone(t.status, t.pct_complete) ? null : t.end_date,
      })),
      alerts: (alerts || []).map((a: any) => ({ ...a, title: a.alert_type, message: a.body })),
    });
  } catch (e) {
    return apiError('projects/projectId GET', e, "Couldn't load this job. Please try again.");
  }
}

/**
 * PUT /api/projects/[projectId] — edit the facts about a job.
 *
 * Writes only the columns in lib/project-update (EDITABLE_PROJECT_COLUMNS).
 * Anything else in the body — id, tenant_id, created_by, deleted_at, a
 * rollup, a lifecycle field that has its own route — is dropped and named
 * back in `ignored`. A body with nothing writable is a 400, not a silent 200.
 *
 * Caller today: components/project/JobColorPicker ({ color }).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    // Project-scoped: a job-level role on THIS job counts, like PATCH below.
    const g = await requirePermission(req, 'Projects', 'Edit', { projectId });
    if (!g.ok) return g.res;
    const user = g.user;
    const body = await req.json().catch(() => null);
    const { updates, ignored } = pickProjectUpdate(body);
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          error: ignored.length
            ? `None of those fields can be changed here: ${ignored.slice(0, 10).join(', ')}`
            : 'Nothing to update — send at least one project field',
          ignored: ignored.slice(0, 20),
        },
        { status: 400 },
      );
    }
    if (updates.color !== undefined && updates.color !== null && !isJobColor(updates.color)) {
      return NextResponse.json({ error: 'color must be one of the eight job colours' }, { status: 400 });
    }
    const db = createServerClient();
    const { data, error } = await db
      .from('projects')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json({ project: data, ...(ignored.length ? { ignored: ignored.slice(0, 20) } : {}) });
  } catch (e) {
    return apiError('projects/[projectId] PUT', e, 'Could not save the change to this project. Please try again.');
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
    const g = await requirePermission(req, 'Projects', 'Full', { projectId });
    if (!g.ok) return g.res;
    const user = g.user;

    const db = createServerClient();
    const { data, error } = await db
      .from('projects')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by: user.id ?? null,
      })
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .select('id');
    if (error) throw error;
    // Nothing matched: not this company's job (or no such job) — don't report success.
    if (!data || data.length === 0) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('projects/projectId DELETE', e, "Couldn't archive this job. Please try again.");
  }
}
