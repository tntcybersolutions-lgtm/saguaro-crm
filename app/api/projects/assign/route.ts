import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { normalisePhase } from '@/lib/project-phase';
import { onProjectCreated } from '@/lib/triggers';
import { logActivity } from '@/lib/activity';
import { assignProjectToUser } from '@/lib/project-assignment';
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
    // "Fully assignable": the job can instead be assigned to a subcontractor /
    // vendor, linked through project_subcontractors (FK → subcontractors).
    const rawSub = String(body.assigneeSubId ?? body.assignee_sub_id ?? '').trim();
    const assigneeSubId = UUID_RE.test(rawSub) ? rawSub : null;

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
      // Shared with PATCH /api/projects/[projectId] — see lib/project-assignment.
      const res = await assignProjectToUser(db, {
        tenantId,
        projectId,
        projectName: (project as { name: string }).name,
        assigneeUserId,
        actor: { id: user.id, email: user.email },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: 'Selected user is not a member of this workspace' },
          { status: 400 },
        );
      }
      assigneeName = res.assigneeName;
      documentsAccessGranted = res.documentsAccessGranted;
      assigned = true;
    }

    /* ── Assign a subcontractor / vendor (optional) ─────────────────────── */
    if (assigneeSubId) {
      const { data: sub, error: subErr } = await anyDb
        .from('subcontractors')
        .select('id, company_name')
        .eq('id', assigneeSubId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (subErr) throw subErr;
      if (!sub) {
        return NextResponse.json(
          { error: 'Selected subcontractor is not in this workspace' },
          { status: 400 },
        );
      }
      assigneeName = (sub as { company_name?: string }).company_name || 'Subcontractor';

      // Idempotent link — reuse an existing row rather than duplicate it.
      const { data: existingLink } = await anyDb
        .from('project_subcontractors')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('project_id', projectId)
        .eq('subcontractor_id', assigneeSubId)
        .maybeSingle();

      if (!existingLink) {
        const { error: linkErr } = await anyDb.from('project_subcontractors').insert({
          tenant_id: tenantId,
          project_id: projectId,
          subcontractor_id: assigneeSubId,
          status: 'assigned',
        } as never);
        if (linkErr) throw linkErr;
      }
      assigned = true;

      void logActivity({
        tenantId,
        projectId,
        userId: user.id,
        userName: user.email,
        action: 'assigned',
        entityType: 'project',
        entityId: projectId,
        description: `Assigned ${assigneeName} to ${(project as { name: string }).name}`,
        metadata: { assigneeSubId },
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
