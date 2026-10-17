import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';
import { requestDay } from '@/lib/time-zone';
import { insertRfi } from '@/lib/rfi-server';
import { assertProjectInTenant } from '@/lib/assert-project';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[projectId]/rfis
 * Lists a project's RFIs scoped to the caller's tenant.
 * Mirrors /api/rfis/list but keyed by the path param projectId.
 * Shape: { rfis: RFI[] } — each RFI carries a computed is_overdue flag.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  try {
    // Role check, not just sign-in: RFIs: View, the rule this tool's pages,
    // its writes and (where the table is gated) the database apply.
    const g = await requirePermission(req, 'RFIs', 'View', { projectId: projectId });
    if (!g.ok) return g.res;
    const user = g.user;

    const db = createServerClient();
    // Overdue on the company's day (device, else company zone) — not the server's UTC day.
    const { today } = await requestDay(req.headers, db, user.tenantId, 'projects/rfis');
    const { data, error } = await db
      .from('rfis')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .order('rfi_number', { ascending: false });
    if (error) throw error;

    const rfis = (data || []).map((r: Record<string, unknown>) => ({
      ...r,
      is_overdue: r.status === 'open' && !!r.due_date && (r.due_date as string) < today,
    }));

    return NextResponse.json({ rfis, source: 'live' });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/rfis] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/rfis', e, 'Failed to load rfis');
  }
}

/**
 * POST /api/projects/[projectId]/rfis
 * Creates a new RFI under the path-param project.
 * Mirrors /api/rfis/create; auto-generates the next RFI-### number.
 * Shape: { success: true, rfi: RFI }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const g = await requirePermission(req, 'RFIs', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  try {
    const db = createServerClient();

    // The project must be the caller's; the job's next number comes from the database (set_rfi_number).
    const notOurs = await assertProjectInTenant(db, user.tenantId, projectId);
    if (notOurs) return notOurs;

    const row = {
      tenant_id:    user.tenantId,
      project_id:   projectId,
      subject:      body.subject     || '',
      question:     body.question    || body.description  || '',
      spec_section: body.specSection || body.spec_section || '',
      due_date:     body.dueDate     || body.due_date     || null,
      status:       'open',
      submitted_by: user.email       || 'Field User',
    };

    const { data, error } = await insertRfi(db, row as Database['public']['Tables']['rfis']['Insert']);

    if (error) throw error;
    return NextResponse.json({ success: true, rfi: data });
  } catch (e) {
    return apiError('projects/[projectId]/rfis POST', e, '[projects/rfis] Database error: Internal server error');
  }
}
