import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { normalisePhase } from '@/lib/project-phase';
import { onProjectCreated } from '@/lib/triggers';
import { logActivity } from '@/lib/activity';
import { createNotification } from '@/lib/notifications';
import type { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/projects/assign
 *
 * One idempotent entry point for "turn this customer into a project and put a
 * team member on it" — the Customers page Assign action.
 *
 * Body: { customerId: uuid, assigneeUserId?: uuid, name?: string }
 *
 * Why this exists instead of calling /api/projects/create again:
 *   /api/projects/create ALWAYS inserts a new row, so every click on the
 *   Customers page spawned a duplicate "<Name> Project" for the same customer.
 *   This route reuses the customer's existing project when one is already
 *   linked (projects.customer_id), and only creates when there is none — so
 *   clicking twice opens the same job the second time instead of forking it.
 *
 * Assignment (when assigneeUserId is sent) grants real access three ways, all
 * tenant-scoped and all idempotent:
 *   1. projects.assigned_to        — the project's assignee of record.
 *   2. work_assignments            — puts the job in the assignee's My Work hub
 *                                    (/api/my-work fans out from these rows).
 *   3. user_role_assignments       — a project-scoped grant of the tenant's
 *                                    "Project Manager" role, which is what
 *                                    getEffectivePermissions() reads to let the
 *                                    assignee open the project and its Documents
 *                                    (Documents/Projects = Full on that role).
 */
export async function POST(req: NextRequest) {
  // Creating / linking a project and granting a user access are project-edit
  // actions — gate exactly like the sibling work-assignments route.
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;

  const { user, db } = g;
  const tenantId = user.tenantId;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const customerId = String(body.customerId ?? body.customer_id ?? '').trim();
    if (!UUID_RE.test(customerId)) {
      return NextResponse.json(
        { error: 'A valid customerId is required' },
        { status: 400 },
      );
    }

    const rawAssignee = String(body.assigneeUserId ?? body.assignee_user_id ?? '').trim();
    const assigneeUserId = UUID_RE.test(rawAssignee) ? rawAssignee : null;

    // Customer must live in THIS tenant — this is also the tenant-isolation
    // check for the create path (no projectId exists yet to pass to the guard).
    const { data: customer, error: custErr } = await db
      .from('customer_profiles')
      .select('id, name, email')
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (custErr) throw custErr;
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    /* ── Idempotent create: reuse the customer's existing project ───────── */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyDb = db as any;
    const { data: existing, error: findErr } = await anyDb
      .from('projects')
      .select('id, name, customer_id, status, assigned_to')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .or('is_archived.is.null,is_archived.eq.false')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findErr) throw findErr;

    let project = existing as
      | { id: string; name: string; customer_id: string | null; status: string | null; assigned_to: string | null }
      | null;
    let reused = Boolean(project);
    const projectName = String(body.name ?? '').trim() || `${customer.name || 'New'} Project`;

    if (!project) {
      const { data: created, error: createErr } = await db
        .from('projects')
        .insert({
          tenant_id: tenantId,
          name: projectName,
          project_type: 'commercial',
          status: 'active',
          phase: normalisePhase(undefined),
          percent_complete: 0,
          contract_value: 0,
          contract_amount: 0,
          original_contract: 0,
          original_contract_amount: 0,
          // The real customer link — this is what stops the next click forking
          // a duplicate and what the Customers rollup joins on.
          customer_id: customerId,
          owner_name: customer.name || '',
          owner_email: customer.email || '',
          owner_entity: customer.name
            ? { name: customer.name, email: customer.email }
            : {},
          created_by: user.id,
        } as unknown as Database['public']['Tables']['projects']['Insert'])
        .select('id, name, customer_id, status, assigned_to')
        .single();
      if (createErr) throw createErr;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project = created as any;
      reused = false;

      const newId = (project as { id: string }).id;

      // Seed the Owner contact so the customer's person outlives the job, the
      // same way /api/projects/create does.
      if (customer.name) {
        const { error: dirErr } = await db.from('contacts').insert({
          tenant_id: tenantId,
          project_id: newId,
          customer_id: customerId,
          name: String(customer.name).trim(),
          email: String(customer.email || '').trim() || null,
          role: 'Owner',
          created_at: new Date().toISOString(),
        } as never);
        if (dirErr) console.error('[projects/assign] owner contact seed', dirErr);
      }

      onProjectCreated(newId).catch(console.error);

      void logActivity({
        tenantId,
        projectId: newId,
        userId: user.id,
        userName: user.email,
        action: 'created',
        entityType: 'project',
        entityId: newId,
        description: `Created the project ${projectName} from a customer`,
        metadata: { customerId },
      });
    }

    const projectId = (project as { id: string }).id;

    /* ── Assign a team member (optional) ────────────────────────────────── */
    let assigned = false;
    let documentsAccessGranted = false;
    let assigneeName: string | null = null;

    if (assigneeUserId) {
      // Assignee must be a real member of this tenant.
      const { data: assignee, error: profErr } = await db
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', assigneeUserId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (profErr) throw profErr;
      if (!assignee) {
        return NextResponse.json(
          { error: 'Selected user is not a member of this workspace' },
          { status: 400 },
        );
      }
      assigneeName = assignee.full_name || assignee.email || null;

      // 1) Project's assignee of record.
      const { error: updErr } = await anyDb
        .from('projects')
        .update({ assigned_to: assigneeUserId } as never)
        .eq('id', projectId)
        .eq('tenant_id', tenantId);
      if (updErr) throw updErr;

      // 2) work_assignments — surfaces the project in the assignee's My Work
      //    hub. Honor UNIQUE (tenant_id, project_id, assignee_user_id, role):
      //    reactivate an ended row rather than duplicate-key insert.
      const ROLE = 'project_manager';
      const { data: existingWa } = await anyDb
        .from('work_assignments')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('project_id', projectId)
        .eq('assignee_user_id', assigneeUserId)
        .eq('role', ROLE)
        .maybeSingle();

      if (existingWa) {
        await anyDb
          .from('work_assignments')
          .update({
            status: 'active',
            ended_at: null,
            scope: 'full',
            assignee_name: assigneeName,
            assigned_by: user.id,
            assigned_by_name: user.email,
          } as never)
          .eq('id', (existingWa as { id: string }).id)
          .eq('tenant_id', tenantId);
      } else {
        const { error: waErr } = await anyDb.from('work_assignments').insert({
          tenant_id: tenantId,
          project_id: projectId,
          assignee_user_id: assigneeUserId,
          assignee_name: assigneeName,
          role: ROLE,
          scope: 'full',
          status: 'active',
          assigned_by: user.id,
          assigned_by_name: user.email,
        } as never);
        if (waErr) throw waErr;
      }

      // 3) user_role_assignments — the permission grant getEffectivePermissions
      //    reads. A project-scoped "Project Manager" role gives the assignee
      //    Documents = Full and Projects = Full on this job only. Best-effort:
      //    if the tenant has no such role the project still shows in My Work.
      const { data: pmRole } = await db
        .from('role_definitions')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', 'Project Manager')
        .maybeSingle();

      if (pmRole?.id) {
        const { data: existingGrant } = await db
          .from('user_role_assignments')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('user_id', assigneeUserId)
          .eq('project_id', projectId)
          .eq('role_id', pmRole.id)
          .maybeSingle();

        if (!existingGrant) {
          const { error: graErr } = await db.from('user_role_assignments').insert({
            tenant_id: tenantId,
            user_id: assigneeUserId,
            project_id: projectId,
            role_id: pmRole.id,
            assigned_by: user.id,
          } as never);
          if (graErr) throw graErr;
        }
        documentsAccessGranted = true;
      }

      assigned = true;

      // Tell the assignee their queue changed — never block on it.
      createNotification(
        tenantId,
        assigneeUserId,
        'work_assigned',
        'Project assigned to you',
        `${(project as { name: string }).name} — Project Manager`,
        '/app/my-work',
        projectId,
      ).catch(() => {});

      void logActivity({
        tenantId,
        projectId,
        userId: user.id,
        userName: user.email,
        action: 'assigned',
        entityType: 'project',
        entityId: projectId,
        description: `Assigned ${assigneeName ?? 'a team member'} to ${(project as { name: string }).name}`,
        metadata: { assigneeUserId },
      });
    }

    return NextResponse.json({
      success: true,
      projectId,
      project,
      reused,
      assigned,
      assigneeName,
      documentsAccessGranted,
    });
  } catch (e) {
    return apiError('projects/assign', e, 'Could not assign the customer to a project');
  }
}
