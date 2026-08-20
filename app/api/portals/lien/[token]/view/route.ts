import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

/**
 * PUBLIC — no requireAuth(). Tracks that a lien waiver portal was viewed.
 * The token itself authenticates. Uses the service role client directly so
 * we don't depend on an authenticated user session.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const db = createClient(url, service, { auth: { persistSession: false } });

  try {
    const { data: row } = await db
      .from('lien_waivers')
      .select('id, portal_viewed_count')
      .eq('token', token)
      .maybeSingle();

    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const r = row as { id: string; portal_viewed_count: number | null };
    const next = (r.portal_viewed_count || 0) + 1;

    await db
      .from('lien_waivers')
      .update({
        portal_viewed_count: next,
        portal_last_viewed_at: new Date().toISOString(),
      })
      .eq('id', r.id);

    return NextResponse.json({ tracked: true, portal_viewed_count: next });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
