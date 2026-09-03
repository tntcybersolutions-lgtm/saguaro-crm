import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ team: [] }, { status: 401 });

  const { projectId } = await params;
  try {
    const db = createServerClient();
    const { data: team, error } = await db
      .from('project_team')
      .select('id, name, email, role, company, phone, added_at')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('added_at', { ascending: true });

    if (error) throw error;

    // project_team has no is_primary column, but the field contacts screen
    // groups on one and badges it KEY. Selecting a column that does not exist
    // errored the whole query, so the screen showed nothing at all. Derive it:
    // a project's PM or superintendent is the key contact, and failing an
    // identifiable role, whoever was put on the job first.
    const rows = (team || []) as any[];
    const KEY_ROLES = ['project manager', 'pm', 'superintendent', 'super', 'owner', 'gc'];
    const keyIdx = rows.findIndex((m) => KEY_ROLES.includes(String(m.role || '').trim().toLowerCase()));
    const primaryIdx = keyIdx >= 0 ? keyIdx : (rows.length ? 0 : -1);

    return NextResponse.json({
      team: rows.map((m, i) => ({ ...m, is_primary: i === primaryIdx })),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/team] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return NextResponse.json({ error: 'Failed to load team', detail }, { status: 500 });
  }
}
