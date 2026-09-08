import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { randomUUID } from 'node:crypto';
import {
  suggestSplits, applySplits, mergeSplits, defaultAreas,
  type AreaSpec, type AreaStyle,
} from '@/lib/schedule-split';
import { parseDependencies, type CpmTask } from '@/lib/schedule-cpm';
import type { Json } from '@/lib/database.types';
import { assessSchedule } from '@/lib/schedule-health';

export const dynamic = 'force-dynamic';

/**
 * Breaking whole-building activities into areas that sequence finish-to-start.
 *
 * GET  proposes and changes nothing — which tasks are too long to carry logic,
 *      how they would come apart, and what the DCMA assessment says before and
 *      after. A scheduler decides; this only shows the arithmetic.
 *
 * POST applies. `{ taskIds, areas }` splits, `{ merge: parentId }` puts one back
 *      together. A split REPLACES rows: the pieces are the real work, and
 *      leaving the parent would count 55 days of steel twice, once whole and
 *      once in zones.
 */

type Guard = Extract<Awaited<ReturnType<typeof requirePermission>>, { ok: true }>;

/**
 * Dependencies as plain JSON for the jsonb column.
 *
 * `Dependency` carries an optional `type` and `lag`, and an interface with
 * optional members is not assignable to `Json` however JSON-shaped its values
 * are. Writing the fields out explicitly is the honest fix -- it also pins
 * exactly what lands in the column instead of whatever the parser happened to
 * attach.
 */
const depsJson = (raw: unknown): Json =>
  parseDependencies(raw).map((d) => ({ id: d.id, type: d.type ?? 'FS', lag: d.lag ?? 0 }));

/* CpmTask carries an index signature, so everything the engine adds to a task
   arrives here as `unknown`. Coercing each field at the write is the boundary
   doing its job: the column types are the contract, not whatever shape the
   engine happened to hand back. */
const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
  return s === '' ? null : s;
};
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** One task row, typed for the column set rather than for the engine. */
const taskRow = (t: CpmTask, tenantId: string, projectId: string) => ({
  id: String(t.id),
  tenant_id: tenantId,
  project_id: projectId,
  name: str(t.name) ?? 'Untitled task',
  start_date: str(t.start_date),
  end_date: str(t.end_date),
  duration: num(t.duration),
  wbs: str(t.wbs),
  phase: str(t.phase),
  trade: str(t.trade),
  status: str(t.status) ?? 'not_started',
  pct_complete: num(t.pct_complete),
  predecessors: depsJson(t.predecessors),
  area: str(t.area),
  area_index: num(t.area_index),
  parent_task_id: str(t.parent_task_id),
});

const loadTasks = (db: Guard['db'], projectId: string, tenantId: string) =>
  db.from('schedule_tasks').select('*').eq('project_id', projectId).eq('tenant_id', tenantId);

/** Areas from the request, or generic zones sized to the work. */
function areasFrom(body: Record<string, unknown>): AreaSpec[] | undefined {
  const raw = body.areas;
  if (Array.isArray(raw) && raw.length > 0) {
    const areas: AreaSpec[] = [];
    for (const a of raw) {
      const o = (a ?? {}) as Record<string, unknown>;
      const name = String(o.name ?? '').trim();
      if (!name) continue;
      const weight = Number(o.weight);
      areas.push({ name, weight: Number.isFinite(weight) && weight > 0 ? weight : 1 });
    }
    if (areas.length > 0) return areas.slice(0, 26);
  }
  const count = Number(body.areaCount);
  if (Number.isFinite(count) && count >= 2) {
    return defaultAreas(count, (body.areaStyle as AreaStyle) ?? 'zone');
  }
  return undefined;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const g = await requirePermission(req, 'Schedule', 'View', { projectId });
  if (!g.ok) return g.res;
  const { db, user } = g;

  try {
    const { data, error } = await loadTasks(db, projectId, user.tenantId);
    if (error) throw error;

    const tasks = (data ?? []) as CpmTask[];
    const url = new URL(req.url);
    const areaCount = Number(url.searchParams.get('areaCount'));
    const areas = Number.isFinite(areaCount) && areaCount >= 2
      ? defaultAreas(areaCount, (url.searchParams.get('areaStyle') as AreaStyle) ?? 'zone')
      : undefined;

    const proposal = suggestSplits(tasks, { areas });
    const before = assessSchedule(tasks);
    const after = assessSchedule(applySplits(tasks, proposal.plans));

    const finding = (h: typeof before, id: string) => {
      const c = h.checks.find((x) => x.id === id);
      return { count: c?.count ?? 0, pct: c?.pct ?? 0, passed: c?.passed ?? true };
    };

    return NextResponse.json({
      plans: proposal.plans,
      skipped: proposal.skipped,
      newRelationships: proposal.newRelationships,
      taktLinks: proposal.taktLinks,
      /* What the split is claimed to buy, measured rather than asserted. */
      impact: {
        score: { before: before.score, after: after.score },
        longTasks: { before: finding(before, 'high-duration').count, after: finding(after, 'high-duration').count },
        finishToStart: { before: finding(before, 'rel-types').pct, after: finding(after, 'rel-types').pct },
        lagged: { before: finding(before, 'lags').count, after: finding(after, 'lags').count },
        finish: { before: before.network.projectFinish, after: after.network.projectFinish },
      },
      /* Splits already applied, so the screen can offer to undo them. */
      existing: [...new Set(tasks.map((t) => String(t.parent_task_id ?? '')).filter(Boolean))],
    });
  } catch (e) {
    return apiError('projects/projectId/schedule/split', e, 'Failed to work out the area breakdown');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const g = await requirePermission(req, 'Schedule', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const { db, user } = g;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const { data, error } = await loadTasks(db, projectId, user.tenantId);
    if (error) throw error;
    const tasks = (data ?? []) as CpmTask[];

    /* ── undo ──────────────────────────────────────────────────────────── */

    const mergeId = typeof body.merge === 'string' ? body.merge : null;
    if (mergeId) {
      const pieces = tasks.filter((t) => String(t.parent_task_id ?? '') === mergeId);
      if (pieces.length === 0) {
        return NextResponse.json({ error: 'No split found for that task' }, { status: 404 });
      }

      const merged = mergeSplits(tasks, mergeId);
      const restored = merged.find((t) => String(t.id) === mergeId);
      if (!restored) {
        return NextResponse.json({ error: 'Could not rebuild the original task' }, { status: 409 });
      }

      /* Insert the rebuilt task before dropping the pieces, so a failure
         halfway leaves the work present twice rather than absent. */
      const ins = await db.from('schedule_tasks')
        .insert(taskRow({ ...restored, id: mergeId }, user.tenantId, projectId));
      if (ins.error) throw ins.error;

      for (const t of merged) {
        if (String(t.id) === mergeId) continue;
        const up = await db.from('schedule_tasks')
          .update({ predecessors: depsJson(t.predecessors) })
          .eq('id', String(t.id)).eq('tenant_id', user.tenantId);
        if (up.error) throw up.error;
      }

      const del = await db.from('schedule_tasks').delete()
        .in('id', pieces.map((t) => String(t.id))).eq('tenant_id', user.tenantId);
      if (del.error) throw del.error;

      return NextResponse.json({ merged: mergeId, removed: pieces.length });
    }

    /* ── split ─────────────────────────────────────────────────────────── */

    const wanted = Array.isArray(body.taskIds) ? body.taskIds.map(String) : null;
    if (!wanted || wanted.length === 0) {
      return NextResponse.json({ error: 'taskIds is required — nothing was named to split' }, { status: 400 });
    }

    /* Propose over the WHOLE schedule so the area breakdown is the project's,
       not just these tasks'. Splitting two trades into two different sets of
       zones would give them two different buildings, and the takt links that
       make the split worth doing could not be made. */
    const proposal = suggestSplits(tasks, { areas: areasFrom(body), idFor: () => randomUUID() });
    const plans = proposal.plans.filter((p) => wanted.includes(p.taskId));
    if (plans.length === 0) {
      return NextResponse.json(
        { error: 'None of those tasks are long enough to be worth splitting' }, { status: 409 },
      );
    }

    const split = applySplits(tasks, plans);
    const parentIds = new Set(plans.map((p) => p.taskId));

    for (const t of split) {
      if (!t.parent_task_id) continue;
      const ins = await db.from('schedule_tasks')
        .insert(taskRow(t, user.tenantId, projectId));
      if (ins.error) throw ins.error;
    }

    /* Rewire whatever pointed at a task that is about to stop existing. */
    for (const t of split) {
      if (t.parent_task_id || parentIds.has(String(t.id))) continue;
      const up = await db.from('schedule_tasks')
        .update({ predecessors: depsJson(t.predecessors) })
        .eq('id', String(t.id)).eq('tenant_id', user.tenantId);
      if (up.error) throw up.error;
    }

    const del = await db.from('schedule_tasks').delete()
      .in('id', [...parentIds]).eq('tenant_id', user.tenantId);
    if (del.error) throw del.error;

    const after = assessSchedule(split);
    return NextResponse.json({
      split: plans.length,
      pieces: split.filter((t) => t.parent_task_id).length,
      newRelationships: plans.reduce((a, p) => a + p.pieces.length - 1, 0),
      score: after.score,
      finish: after.network.projectFinish,
    });
  } catch (e) {
    return apiError('projects/projectId/schedule/split', e, 'Failed to split the schedule');
  }
}
