/**
 * assert-project — does this project belong to the caller's tenant?
 *
 * WHY THIS EXISTS
 *
 * A CRUD sweep against a seeded job found eight create endpoints that never
 * asked: change-orders, invoices, punch-list, rfis, submittals, bid-packages,
 * selections and daily-logs. Each took a project_id straight from the request
 * body and inserted against it.
 *
 * Nothing leaked, and it is worth being precise about why, because the reason
 * is luck rather than design. tenant_id on the new row comes from the SESSION,
 * never from the body — that part this codebase gets right everywhere. And a
 * project id that exists in NO tenant is rejected by the foreign key, which is
 * what produced the 500s the sweep actually saw.
 *
 * But a project id belonging to ANOTHER tenant satisfies that foreign key. The
 * row would be written: stamped with the caller's tenant, pointing at a
 * customer's job they cannot see. Not a read leak — a write into someone
 * else's project graph, and a 500 where a 404 belongs.
 *
 * Four routes already did this correctly (pay-apps/create, budgets/create,
 * projects/[id]/budget, todos/create via requirePermission). This is their
 * check, extracted so there is one implementation rather than eight copies
 * that can each drift.
 *
 * Returns null when the project is the caller's. Otherwise returns the 404 to
 * send — deliberately 404 and not 403, so another tenant's project is
 * indistinguishable from one that does not exist. Confirming "this id is real,
 * just not yours" is itself a disclosure.
 */
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function assertProjectInTenant(
  db: SupabaseClient<any>,
  tenantId: string,
  projectId: string | null | undefined,
): Promise<NextResponse | null> {
  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
  }
  const { data, error } = await db
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  /* A FAILED LOOKUP IS NOT A PASS. If the query itself errored we do not know
     whose project this is, and the safe answer to "may I write here" under
     uncertainty is no. */
  if (error) {
    console.error('[assertProjectInTenant] lookup failed', error);
    return NextResponse.json({ error: 'Could not verify the project' }, { status: 503 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  return null;
}
