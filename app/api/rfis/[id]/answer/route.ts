import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { onRFIAnswered } from '@/lib/triggers';
import { runInBackground } from '@/lib/background';
import { apiError } from '@/lib/api-error';
import { writeWithOptionalColumns } from '@/lib/optional-column';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await requirePermission(req, 'RFIs', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    const db = createServerClient();

    // Ball-in-court moves back to the original requester once the RFI is answered.
    const { data: existing } = await db
      .from('rfis')
      .select('submitted_by')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    const ballBack = (existing?.submitted_by || '') as string;

    // answer_source: null — an answer typed here replaces one that came by email (lib/inbound-reply).
    const { result: { error } } = await writeWithOptionalColumns(
      {
        answer: (body.answer || '') as string,
        // Client (RFIs page) posts `answeredBy`; also accept snake_case. Falls
        // back to the caller's email only when neither is supplied.
        answered_by: (body.answered_by || body.answeredBy || user.email || '') as string,
        status: 'answered',
        answered_at: new Date().toISOString(),
        answered_date: new Date().toISOString().split('T')[0],
        ...(ballBack ? { ball_in_court: ballBack } : {}),
        answer_source: null,
      },
      ['answer_source'],
      (row) => db.from('rfis').update(row as never).eq('id', id).eq('tenant_id', user.tenantId),
    );

    if (error) throw error;

    runInBackground(onRFIAnswered(id), 'onRFIAnswered');

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return apiError('rfis/[id]/answer POST', err);
  }
}
