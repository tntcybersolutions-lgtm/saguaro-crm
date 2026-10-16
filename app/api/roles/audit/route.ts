import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/roles/audit
 * Returns a bare array of audit entries (camelCase) for the
 * roles-permissions admin page audit tab. Mapped from audit_logs.
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();

    const { data: logs } = await db
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .in('entity_type', ['role', 'role_definition', 'user_role_assignment', 'permission'])
      .order('created_at', { ascending: false })
      .limit(200);

    const rows = logs ?? [];

    const result = rows.map((r) => {
      let detail = '';
      if (typeof r.changes === 'string') {
        detail = r.changes;
      } else if (r.changes && typeof r.changes === 'object') {
        try {
          detail = JSON.stringify(r.changes);
        } catch {
          detail = '';
        }
      }
      return {
        id: r.id,
        action: r.action ?? '',
        roleName: r.entity_name ?? '',
        changedBy: r.user_name ?? r.user_email ?? 'System',
        changedAt: r.created_at,
        detail,
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no audit entries" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('roles/audit', e, 'Could not load the permission audit log');
  }
}
