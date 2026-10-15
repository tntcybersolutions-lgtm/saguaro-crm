/**
 * POST /api/team/accept-invite/create-account — a new invitee sets a password
 * and joins the inviting company in one step.
 *
 * Before: an invitee with no account was sent to /signup, which creates a NEW
 * company (it asks for a company name). They landed in an empty company of
 * their own, not the one that invited them, and had to find the invite link
 * again. Invitees asked for "a password" instead.
 *
 * Body: { token, password, fullName? }
 *
 * The single-use invite token, delivered to the invited address, is the proof
 * that this person owns the email, so the account is created already confirmed.
 * Steps:
 *   1. Invite must be pending and inside its 7-day window.
 *   2. Claim it (pending → accepted) atomically, so two tabs cannot both use it.
 *   3. Create the auth user IN the inviting tenant (handle_new_user reads
 *      tenant_id from user metadata). If the email already has an account,
 *      release the claim and send them to sign in instead.
 *   4. Set role + company on the profile; add to the project team if the
 *      invite names a project.
 *   5. Sign them in (session cookies) and tell the inviter.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';
import { createNotification } from '@/lib/notifications';
import { apiError } from '@/lib/api-error';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const token = String(body?.token || '').trim();
  const password = String(body?.password || '');
  const fullNameIn = String(body?.fullName || '').trim().slice(0, 120);

  if (!token) return NextResponse.json({ error: 'Missing invite token.', reason: 'invalid' }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.', reason: 'weak_password' }, { status: 400 });
  }

  const db = createServerClient();
  let claimedId: string | null = null;

  try {
    // select('*'): team_invites.name exists live but not in the generated types.
    const { data: inviteRow, error: findErr } = await db
      .from('team_invites')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    const invite = inviteRow as null | {
      id: string; tenant_id: string; email: string | null; name?: string | null; role: string | null;
      invited_by: string | null; status: string | null; created_at: string | null; project_id: string | null;
    };
    if (findErr) throw findErr;
    if (!invite) return NextResponse.json({ error: 'This invitation link is not valid.', reason: 'invalid' }, { status: 404 });
    if (invite.status === 'accepted') {
      return NextResponse.json({ error: 'This invitation has already been used. Sign in instead.', reason: 'already_accepted' }, { status: 409 });
    }
    const created = invite.created_at ? new Date(invite.created_at).getTime() : Date.now();
    if (invite.status === 'expired' || Date.now() > created + INVITE_TTL_MS) {
      return NextResponse.json({ error: 'This invitation has expired. Ask for a new one.', reason: 'expired' }, { status: 410 });
    }

    const email = String(invite.email || '').toLowerCase().trim();
    const fullName = fullNameIn || String(invite.name || '').trim() || email.split('@')[0];
    const role = invite.role || 'member';

    // 2. Claim the invite so it cannot be used twice.
    const nowIso = new Date().toISOString();
    const { data: claimed, error: claimErr } = await db
      .from('team_invites')
      .update({ status: 'accepted', accepted_at: nowIso })
      .eq('id', invite.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (claimErr) throw claimErr;
    if (!claimed) {
      return NextResponse.json({ error: 'This invitation has already been used. Sign in instead.', reason: 'already_accepted' }, { status: 409 });
    }
    claimedId = invite.id;

    // 3. Create the account inside the inviting company.
    const { data: createdUser, error: createErr } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // the invite token, sent to this address, proves ownership
      user_metadata: { full_name: fullName, tenant_id: invite.tenant_id },
    });
    if (createErr || !createdUser?.user) {
      // Release the claim so the person can still accept by signing in.
      await db.from('team_invites').update({ status: 'pending', accepted_at: null }).eq('id', invite.id);
      claimedId = null;
      const msg = (createErr?.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
        return NextResponse.json(
          { error: `${email} already has a Saguaro account. Sign in with it to accept.`, reason: 'has_account' },
          { status: 409 },
        );
      }
      if (msg.includes('password')) {
        return NextResponse.json({ error: 'Choose a stronger password (at least 8 characters, not a common one).', reason: 'weak_password' }, { status: 400 });
      }
      throw createErr || new Error('createUser returned no user');
    }
    const userId = createdUser.user.id;

    // 4. Company + role on the profile (the trigger created it in the right tenant).
    const { data: tenant } = await db.from('tenants').select('name, company_name').eq('id', invite.tenant_id).maybeSingle();
    const company = String((tenant as { company_name?: string | null; name?: string | null } | null)?.company_name
      || (tenant as { name?: string | null } | null)?.name || '').trim();
    const { error: profErr } = await db
      .from('profiles')
      .upsert({ id: userId, tenant_id: invite.tenant_id, email, full_name: fullName, role, company, updated_at: nowIso }, { onConflict: 'id' });
    if (profErr) throw profErr;

    if (invite.project_id) {
      const { error: teamErr } = await db.from('project_team').insert({
        tenant_id: invite.tenant_id,
        project_id: invite.project_id,
        user_id: userId,
        name: fullName,
        email,
        role,
        company,
        added_at: nowIso,
      });
      if (teamErr) console.error('[accept-invite/create-account] project_team insert failed:', teamErr.message);
    }

    // 5. Sign them in.
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({ email, password });

    try {
      await createNotification(
        invite.tenant_id,
        invite.invited_by || null,
        'sub_added',
        `${fullName} joined your team`,
        `${email} set up their account and joined ${company || 'your company'} as ${role}.`,
        invite.project_id ? `/app/projects/${invite.project_id}/team` : '/app/people?tab=access',
        invite.project_id || undefined,
      );
    } catch (e) {
      console.error('[accept-invite/create-account] notify failed:', e);
    }

    if (signErr || !signIn?.session) {
      // Account exists and is in the company; they just sign in normally.
      return NextResponse.json({ success: true, signedIn: false, company, redirect: `/login?email=${encodeURIComponent(email)}` });
    }
    const res = NextResponse.json({ success: true, signedIn: true, company, redirect: '/app' });
    const base = { path: '/', sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', httpOnly: true };
    res.cookies.set('sb-access-token', signIn.session.access_token, {
      ...base,
      expires: signIn.session.expires_at ? new Date(signIn.session.expires_at * 1000) : undefined,
    });
    res.cookies.set('sb-refresh-token', signIn.session.refresh_token, { ...base, maxAge: 60 * 60 * 24 * 365 });
    return res;
  } catch (e) {
    if (claimedId) {
      await db.from('team_invites').update({ status: 'pending', accepted_at: null }).eq('id', claimedId);
    }
    return apiError('team/accept-invite/create-account', e, "Couldn't set up your account. Please try again.");
  }
}
