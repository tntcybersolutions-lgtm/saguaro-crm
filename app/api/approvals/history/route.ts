import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { ENTITY_TYPES, ENTITY_META, normalizeRow, type EntityType } from '@/lib/approvals';

export const dynamic = 'force-dynamic';

/**
 * GET /api/approvals/history
 * Real decision log: every entity that has reached a terminal
 * approved/rejected state, tenant-scoped, newest first. Enriched with
 * the approval_decisions audit row (approver + note) when one exists.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ history: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();

    // Audit rows keyed by entity, best-effort (table may predate migration).
    const auditByEntity: Record<string, { decided_by: string | null; note: string | null; decided_at: string | null }> = {};
    try {
      const { data: decisions } = await db
        .from('approval_decisions')
        .select('entity_type, entity_id, decision, decided_by, note, decided_at')
        .eq('tenant_id', user.tenantId)
        .order('decided_at', { ascending: false });
      for (const d of (decisions || []) as Array<Record<string, unknown>>) {
        const key = `${d.entity_type}:${d.entity_id}`;
        if (!auditByEntity[key]) {
          auditByEntity[key] = {
            decided_by: (d.decided_by as string | null) ?? null,
            note: (d.note as string | null) ?? null,
            decided_at: (d.decided_at as string | null) ?? null,
          };
        }
      }
    } catch { /* approval_decisions optional pre-migration */ }

    const results = await Promise.all(ENTITY_TYPES.map(async (et: EntityType) => {
      const meta = ENTITY_META[et];
      const terminal = [...meta.approved, ...meta.rejected];
      try {
        const { data, error } = await db
          .from(meta.table)
          .select(meta.selectCols.join(','))
          .eq('tenant_id', user.tenantId)
          .in('status', terminal);
        if (error) throw error;
        return { et, rows: (data || []) as unknown as Array<Record<string, unknown>> };
      } catch {
        return { et, rows: [] as Array<Record<string, unknown>> };
      }
    }));

    const history = results.flatMap(({ et, rows }) => {
      const meta = ENTITY_META[et];
      return rows.map((row) => {
        const n = normalizeRow(meta, row);
        const action: 'approved' | 'rejected' = meta.rejected.includes(n.status) ? 'rejected' : 'approved';
        const audit = auditByEntity[`${et}:${n.entityId}`];
        const decidedAt = (row.approved_at as string | null)
          || (meta.hasRejectedAt ? (row.rejected_at as string | null) : null)
          || audit?.decided_at
          || (row.created_at as string | null)
          || null;
        return {
          entityType: n.entityType,
          entityId: n.entityId,
          module: n.module,
          itemName: n.itemName,
          itemAmount: n.itemAmount,
          action,
          decidedBy: audit?.decided_by || '—',
          decidedAt,
          comment: audit?.note || '',
        };
      });
    }).sort((a, b) => (b.decidedAt || '').localeCompare(a.decidedAt || ''));

    return NextResponse.json({ history, source: 'live' });
  } catch (e) {
    // Was a 2xx with an empty body: the screen showed "no history" with
    // total confidence while the query was actually failing. A soft fail on
    // a read is indistinguishable from real emptiness, which is the whole
    // problem. Real status, real log, correlation id.
    return apiError('approvals/history', e, 'Could not load approval history');
  }
}
