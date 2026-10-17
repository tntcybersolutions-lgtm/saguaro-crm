import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { isLiveJob } from '@/lib/live-jobs';
import { ENTITY_TYPES, ENTITY_META, normalizeRow, type EntityType } from '@/lib/approvals';

export const dynamic = 'force-dynamic';

/**
 * GET /api/approvals/pending
 * Real pending queue: every change order / pay app / purchase order /
 * invoice currently in an "awaiting approval" status, tenant-scoped.
 * Enriched with the matching active workflow (name + total steps) and,
 * when present, the tracked approval_requests row (current step).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ pending: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();

    // Active workflow templates for this tenant, keyed by module (entity_type).
    const workflowByModule: Record<string, { id: string; name: string; steps: unknown[] }> = {};
    try {
      const { data: wfs } = await db
        .from('approval_workflows')
        .select('id, name, module, steps, active')
        .eq('tenant_id', user.tenantId)
        .eq('active', true);
      for (const w of (wfs || []) as Array<Record<string, unknown>>) {
        const mod = String(w.module);
        if (!workflowByModule[mod]) {
          workflowByModule[mod] = {
            id: String(w.id),
            name: String(w.name),
            steps: Array.isArray(w.steps) ? (w.steps as unknown[]) : [],
          };
        }
      }
    } catch { /* table optional */ }

    // Tracked request rows (best-effort — columns may predate migration).
    const requestByEntity: Record<string, { current_step: number; total_steps: number }> = {};
    try {
      const { data: reqs } = await db
        .from('approval_requests')
        .select('entity_type, entity_id, current_step, total_steps, status')
        .eq('tenant_id', user.tenantId)
        .eq('status', 'pending');
      for (const r of (reqs || []) as Array<Record<string, unknown>>) {
        if (r.entity_type && r.entity_id) {
          requestByEntity[`${r.entity_type}:${r.entity_id}`] = {
            current_step: Number(r.current_step ?? 0),
            total_steps: Number(r.total_steps ?? 1),
          };
        }
      }
    } catch { /* columns optional pre-migration */ }

    const results = await Promise.all(ENTITY_TYPES.map(async (et: EntityType) => {
      const meta = ENTITY_META[et];
      try {
        const { data, error } = await db
          .from(meta.table)
          .select(meta.selectCols.join(','))
          .eq('tenant_id', user.tenantId)
          .in('status', meta.awaiting);
        if (error) throw error;
        return { et, rows: (data || []) as unknown as Array<Record<string, unknown>> };
      } catch {
        return { et, rows: [] as Array<Record<string, unknown>> };
      }
    }));

    const projectIds = new Set<string>();
    const flat: Array<{ et: EntityType; row: Record<string, unknown> }> = [];
    for (const { et, rows } of results) {
      for (const row of rows) {
        flat.push({ et, row });
        if (row.project_id) projectIds.add(String(row.project_id));
      }
    }

    // Resolve project names for display.
    const projectNames: Record<string, string> = {};
    // An item on an archived or deleted job is not waiting on anyone.
    const deadJobs = new Set<string>();
    if (projectIds.size > 0) {
      try {
        const { data: projs } = await db
          .from('projects')
          .select('id, name, is_archived, archived_at, is_deleted, deleted_at')
          .in('id', Array.from(projectIds))
          .eq('tenant_id', user.tenantId);
        for (const p of (projs || []) as Array<Record<string, unknown>>) {
          projectNames[String(p.id)] = String(p.name ?? '');
          if (!isLiveJob(p as Parameters<typeof isLiveJob>[0])) deadJobs.add(String(p.id));
        }
      } catch { /* projects optional */ }
    }

    const pending = flat.filter(({ row }) => !row.project_id || !deadJobs.has(String(row.project_id))).map(({ et, row }) => {
      const meta = ENTITY_META[et];
      const n = normalizeRow(meta, row);
      const wf = workflowByModule[et];
      const tracked = requestByEntity[`${et}:${n.entityId}`];
      const totalSteps = tracked?.total_steps ?? (wf ? Math.max(1, wf.steps.length) : 1);
      const currentStep = tracked ? tracked.current_step : 0;
      return {
        ...n,
        projectName: n.projectId ? (projectNames[n.projectId] || null) : null,
        workflowId: wf?.id ?? null,
        workflowName: wf?.name ?? 'No workflow configured',
        currentStep,
        totalSteps,
      };
    }).sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));

    return NextResponse.json({ pending, source: 'live' });
  } catch (e) {
    // Was a 2xx with an empty body: the screen showed "no pending approvals" with
    // total confidence while the query was actually failing. A soft fail on
    // a read is indistinguishable from real emptiness, which is the whole
    // problem. Real status, real log, correlation id.
    return apiError('approvals/pending', e, 'Could not load pending approvals');
  }
}
