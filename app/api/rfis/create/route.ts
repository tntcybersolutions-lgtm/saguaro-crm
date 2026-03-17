import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  try {
    const db = createServerClient();

    const { count: rawCount } = await db
      .from('rfis')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', user.tenantId);

    const rfi_number = `RFI-${String((rawCount || 0) + 1).padStart(3, '0')}`;

    const row = {
      tenant_id:    user.tenantId,
      project_id:   body.projectId   || body.project_id  || null,
      rfi_number,
      subject:      body.subject     || '',
      question:     body.question    || body.description  || '',
      spec_section: body.specSection || body.spec_section || '',
      due_date:     body.dueDate     || body.due_date     || null,
      status:       'open',
      submitted_by: user.email       || 'Field User',
    };

    const { data, error } = await db
      .from('rfis')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, rfi: data });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[rfis/create] error:', msg);
    return NextResponse.json(
      { error: `[rfis/create] Database error: ${msg}` },
      { status: 500 }
    );
  }
}
