/**
 * GET /api/people/names?refs=<id or email>,<id or email>…
 *
 * Names for the people a screen has as ids (created_by, approved_by,
 * assigned_to…), from the caller's own company only (lib/person-names). The
 * screen shows the name, or hides the row — never the id. Unknown refs are
 * left out of the answer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { resolvePeople } from '@/lib/person-names';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const refs = (req.nextUrl.searchParams.get('refs') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 300);
    if (!refs.length) return NextResponse.json({ people: {} });
    const people = await resolvePeople(createServerClient(), user.tenantId, refs);
    return NextResponse.json({ people });
  } catch (e) {
    return apiError('people/names', e, "Couldn't load names.");
  }
}
