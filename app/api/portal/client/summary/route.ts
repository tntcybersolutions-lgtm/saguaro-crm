import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getPortalSession, PORTAL_PERMS } from '@/lib/portal-auth';
import { apiError } from '@/lib/api-error';
import { isOwnerUpdate } from '@/lib/owner-update';

/**
 * GET — the progress updates the builder SENT to the client (lib/owner-update).
 *
 * This route used to let the client generate an AI summary themselves (POST),
 * straight to the portal with nobody at the builder reading it first. It also
 * read daily-log columns that do not exist (work_description, workforce_count)
 * and an unknown model id, so it never produced a narrative. Updates are now
 * written from the daily logs on the GC side and only appear here once the PM
 * approves and sends them. Drafts are never returned.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getPortalSession(req, PORTAL_PERMS.VIEW_PROJECT);
    if (!session) {
      return NextResponse.json({ error: 'Access denied — insufficient permissions' }, { status: 403 });
    }
    const db = createServerClient();
    const { data, error } = await db
      .from('portal_summaries')
      .select('id, summary_data, created_at')
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .eq('summary_data->>status', 'sent')
      .order('created_at', { ascending: false })
      .limit(52);
    if (error) throw error;
    const updates = (data || [])
      .filter((r) => isOwnerUpdate(r.summary_data))
      .map((r) => {
        const d = r.summary_data as { title: string; body: string; period: { start: string; end: string }; sent_at?: string | null };
        return { id: r.id, title: d.title, body: d.body, period: d.period, sent_at: d.sent_at || r.created_at };
      })
      .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)));
    return NextResponse.json({ updates });
  } catch (e) {
    return apiError('portal/client/summary', e, 'Could not load the updates.');
  }
}
