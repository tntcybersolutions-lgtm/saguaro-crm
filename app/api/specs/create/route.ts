import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.projectId || !body.title) {
      return NextResponse.json({ error: 'projectId and title are required' }, { status: 400 });
    }
    const db = createServerClient();
    // NOTE: the `specifications` table has no `revision` or `notes` columns —
    // inserting them made every create 500 (PGRST204), so the whole feature was
    // dead. The web form also posts `section` (not section_number). Persist only
    // real columns and honor the `section` alias so the CSI number is saved.
    const { data, error } = await db.from('specifications').insert({
      tenant_id: user.tenantId,
      project_id: body.projectId,
      title: body.title,
      section_number: body.section_number || body.sectionNumber || body.section || '',
      division: body.division || '',
      status: body.status || 'draft',
      description: body.description || '',
    }).select().single();
    if (error) throw error;
    // The web specs page reads `json.spec`; keep `specification` for any other caller.
    return NextResponse.json({ success: true, spec: data, specification: data });
  } catch (err: unknown) {
    return apiError('specs/create POST', err);
  }
}
