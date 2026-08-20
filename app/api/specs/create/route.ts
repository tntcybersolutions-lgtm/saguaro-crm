import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.projectId || !body.title) {
      return NextResponse.json({ error: 'projectId and title are required' }, { status: 400 });
    }
    const db = createServerClient();
    const { data, error } = await db.from('specifications').insert({
      tenant_id: user.tenantId,
      project_id: body.projectId,
      title: body.title,
      section_number: body.section_number || body.sectionNumber || '',
      division: body.division || '',
      status: body.status || 'draft',
      revision: body.revision ?? 0,
      description: body.description || '',
      notes: body.notes || '',
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, specification: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
