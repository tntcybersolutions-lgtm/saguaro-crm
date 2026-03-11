import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { onBidAwarded } from '@/lib/triggers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const db = createServerClient();

    // Award the winning submission
    await db.from('bid_submissions').update({ status: 'awarded', awarded_at: new Date().toISOString() }).eq('id', body.submissionId);
    // Close bid package
    await db.from('bid_packages').update({ status: 'awarded' }).eq('id', id);

    onBidAwarded(body.submissionId).catch(console.error);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
