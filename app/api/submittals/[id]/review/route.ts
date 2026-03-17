import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, notes } = await req.json();
    if (!action || !['approve', 'reject', 'resubmit'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be approve, reject, or resubmit.' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Map action to status
    const statusMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      resubmit: 'resubmit',
    };
    const newStatus = statusMap[action];

    // Update the submittal status
    const { data: submittal, error: updateError } = await supabase
      .from('submittals')
      .update({
        status: newStatus,
        reviewer_notes: notes || null,
        reviewed_by: user.email,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ status: newStatus, submittal });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[submittals/review] error:', msg);
    return NextResponse.json({ error: `Failed to submit review: ${msg}` }, { status: 500 });
  }
}
