import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';

import { apiError } from '@/lib/api-error';
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServerClient();
  const { data: profile } = await db
    .from('profiles')
    .select('full_name, phone, role, title, company, avatar_url, tenant_id')
    .eq('id', user.id)
    .single();

  const p = profile as any;
  const name = p?.full_name || user.email.split('@')[0];

  /* firstName is for greeting a person by name ("Good evening, Rob").
   * It is deliberately NOT derived from `name` above: that field falls back to
   * the email prefix, so a login like tntcybersolutions@… would produce
   * "Good evening, tntcybersolutions", which is worse than no name at all.
   * Null here means "we do not actually know this person's name" and the
   * caller should greet them without one. */
  const rawFullName = typeof p?.full_name === 'string' ? p.full_name.trim() : '';
  const firstToken = rawFullName.split(/\s+/)[0] ?? '';
  const firstName =
    // a real given name: letters (plus - and ') and a sane length
    /^[\p{L}][\p{L}'-]{0,29}$/u.test(firstToken)
      ? // Real profiles in this database are stored however the user typed them
        // — "rob", "avery", "Chad Derocher". Greeting someone "Good evening,
        // rob" reads as a bug, so capitalise the first letter. The REST of the
        // token is left untouched so "McKay" and "O'Brien" survive intact.
        firstToken.charAt(0).toUpperCase() + firstToken.slice(1)
      : null;

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name,
    firstName,
    tenantId: user.tenantId,
    phone: p?.phone || null,
    role: p?.role || 'member',
    title: p?.title || null,
    company: p?.company || null,
    avatarUrl: p?.avatar_url || null,
  });
}

/** PUT /api/auth/me — update the signed-in user's own profile
 *  (full_name / phone / title). Only the provided fields change. */
export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, string | null> = {};

  if (typeof body.full_name === 'string') {
    const v = body.full_name.trim().slice(0, 120);
    if (!v) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    patch.full_name = v;
  }
  if (typeof body.phone === 'string') patch.phone = body.phone.trim().slice(0, 40) || null;
  if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, 80) || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const db = createServerClient();
  const { error } = await db.from('profiles').update(patch).eq('id', user.id);
  if (error) return apiError('auth/me', error, undefined, 500);

  return NextResponse.json({ ok: true, ...patch });
}
