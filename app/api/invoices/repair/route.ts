import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

/**
 * One-time (idempotent) invoice normalizer for the caller's tenant:
 *  - total = amount + tax wherever total is null/0 but amount is real
 *  - statuses lowercased
 * GET so an admin can run it from the browser; safe to repeat — a second run
 * finds nothing to fix. (The platform-wide backfill also ran as a migration;
 * this covers any tenant rows written by old clients before their reload.)
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Budget', 'Full');
  if (!g.ok) return g.res;
  try {
    const db = createServerClient() as any;
    const { data: rows } = await db
      .from('invoices')
      .select('id, amount, tax, total, status')
      .eq('tenant_id', g.user.tenantId)
      .limit(2000);
    let totalsFixed = 0;
    let statusesFixed = 0;
    for (const r of (rows || []) as any[]) {
      const amount = Number(r.amount) || 0;
      const tax = Number(r.tax) || 0;
      const total = Number(r.total) || 0;
      const patch: Record<string, unknown> = {};
      if (total === 0 && amount > 0) { patch.total = amount + tax; totalsFixed++; }
      if (r.status && r.status !== String(r.status).toLowerCase()) { patch.status = String(r.status).toLowerCase(); statusesFixed++; }
      if (Object.keys(patch).length) {
        await must(db.from('invoices').update(patch as never).eq('id', r.id).eq('tenant_id', g.user.tenantId), 'invoices update');
      }
    }
    return NextResponse.json({ ok: true, scanned: (rows || []).length, totalsFixed, statusesFixed });
  } catch (e) {
    return apiError('invoices/repair GET', e);
  }
}
