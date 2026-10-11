/**
 * lib/change-order-number.ts — the next change order number on a job.
 *
 * One place for it: the three create routes each carried the same query, and
 * a selection picked over its allowance in the client portal now creates a
 * change order too (lib/selection-pick).
 *
 * Service-role client bypasses RLS → the query is explicitly tenant-scoped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nextCoNumber(db: any, tenantId: string, projectId: string): Promise<number> {
  const { data: last, error } = await db
    .from('change_orders')
    .select('co_number')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .order('co_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (Number((last as { co_number?: unknown } | null)?.co_number) || 0) + 1;
}
