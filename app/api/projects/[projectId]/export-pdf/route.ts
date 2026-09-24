import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

/**
 * EXPORT A JOB'S RECORDS — TENANT-SCOPED.
 *
 * ⚠️ THIS ROUTE WAS A CROSS-TENANT READ PRIMITIVE.
 *
 * requirePermission() proved WHO the caller is and WHAT they may do, and then
 * the queries below trusted ids straight out of the request body:
 *
 *     supabase.from(table).select('*').in('id', items)      // items from body
 *     supabase.from(table).select('*').eq('id', item_id)    // item_id from body
 *
 * across eleven tables, with no tenant filter on either. A signed-in user of
 * any tenant — holding nothing more than Projects/Edit in their OWN company —
 * could post a list of row ids and receive those rows back: RFIs, daily logs,
 * change orders, safety incidents, meetings, correspondence, belonging to any
 * other company on the platform.
 *
 * Permission is not isolation. The guard answers "may this person export?"; it
 * cannot answer "is this row theirs?" — only a tenant filter does that. The
 * table whitelist is what made it look safe, and a whitelist controls WHICH
 * table, never WHOSE rows.
 *
 * Every branch now carries tenant AND project, and the job is checked against
 * the caller's tenant before a single row is read. Ids belonging to another
 * tenant simply do not come back rather than erroring — the right behavior for
 * a bulk selection: you export what is yours.
 */

/* Whitelist decides which table, never whose rows — see above. */
const TABLE_MAP: Record<string, string> = {
  rfis: 'rfis',
  punch: 'punch_list',
  inspections: 'inspections',
  daily_logs: 'daily_logs',
  change_orders: 'change_orders',
  safety: 'safety_incidents',
  submittals: 'submittals',
  observations: 'observations',
  tm_tickets: 'tm_tickets',
  meetings: 'meetings',
  correspondence: 'correspondence',
};

/* One page of a bulk export. The previous version accepted an unbounded id
   array, so a single request could ask for an entire table. */
const MAX_ITEMS = 500;

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const moduleName = typeof body.module === 'string' ? body.module : '';
    const itemId = typeof body.item_id === 'string' ? body.item_id : '';
    const items = Array.isArray(body.items)
      ? (body.items as unknown[]).filter((v): v is string => typeof v === 'string')
      : null;

    const mapped = TABLE_MAP[moduleName];
    if (!mapped) {
      return NextResponse.json(
        { error: `Invalid module. Expected one of: ${Object.keys(TABLE_MAP).join(', ')}` },
        { status: 400 }
      );
    }
    if (items && items.length > MAX_ITEMS) {
      return NextResponse.json(
        { error: `Too many items — ${items.length} requested, ${MAX_ITEMS} is the maximum per export.` },
        { status: 400 }
      );
    }

    const table = mapped as keyof Database['public']['Tables'] & 'rfis';
    const supabase = createServerClient();

    /* The job must belong to the caller's tenant before a single row is read. */
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    /* EVERY branch carries tenant AND project. An id from another tenant — or
       from another job in this tenant — is not part of this job's export. */
    const base = () =>
      supabase
        .from(table)
        .select('*')
        .eq('tenant_id', user.tenantId)
        .eq('project_id', params.projectId);

    let data: Record<string, unknown>[] = [];
    if (itemId) {
      const { data: rows, error } = await base().eq('id', itemId);
      if (error) throw error;
      data = (rows || []) as Record<string, unknown>[];
      if (!data.length) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    } else if (items) {
      const { data: rows, error } = await base().in('id', items);
      if (error) throw error;
      data = (rows || []) as Record<string, unknown>[];
    } else {
      const { data: rows, error } = await base().limit(100);
      if (error) throw error;
      data = (rows || []) as Record<string, unknown>[];
    }

    return NextResponse.json({
      success: true,
      module: moduleName,
      data,
      /* Stated so a caller can tell "you asked for 40 and 12 were yours" from
         "the export silently truncated". */
      requested: items ? items.length : itemId ? 1 : null,
      returned: data.length,
      generated_at: new Date().toISOString(),
      project_id: params.projectId,
      project_name: (project as { name?: string }).name ?? null,
    });
  } catch (e: unknown) {
    /* apiError, not e.message — this codebase's standing orders forbid raw
       error text in a response, because a Postgres error names the table, the
       column and the constraint. It logs the real thing with a correlation id
       and returns a line written for a GC. */
    return apiError('projects/export-pdf', e, 'Failed to generate export');
  }
}
