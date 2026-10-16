import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { sendSubPortalInvite } from '@/lib/email';
import { apiError } from '@/lib/api-error';
import { subPortalExpiry } from '@/lib/sub-portal-expiry';

export const dynamic = 'force-dynamic';

/** The same answer whether or not the email has a portal — nothing to probe. */
const GENERIC_MESSAGE = 'If an active portal exists for this email, a login link has been sent. Please check your inbox.';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** At most this many portal links in one email burst (newest first). */
const MAX_LINKS = 5;

/**
 * POST /api/portal/sub/lookup — "email me my portal link".
 *
 * The portal token IS the sub's access, so it only ever goes to the address on
 * file, by email. This route used to return the token in the response to anyone
 * who typed the sub's email (and searched every company's sessions to do it),
 * so knowing an email was enough to open that sub's portal.
 */
export async function POST(req: NextRequest) {
  try {
    // 5 a minute per IP, and 3 per 10 minutes per address so nobody can flood a sub's inbox.
    const ip = getClientIP(req);
    const byIp = checkRateLimit(`sub-lookup:${ip}`, 5, 60_000);
    if (!byIp.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again in a minute.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(byIp.resetIn / 1000)) } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter the email address your general contractor invited.' }, { status: 400 });
    }
    if (!checkRateLimit(`sub-lookup-email:${email}`, 3, 10 * 60_000).allowed) {
      return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
    }

    const db = createServerClient();

    // A sub can work for several GCs: every active link for this address, from the
    // roster (sub_id) or from an email-only invite (sub_email on the session).
    const { data: subs, error: subErr } = await db
      .from('subcontractors')
      .select('id, company_name, contact_name')
      // Case-insensitive exact match: the roster may hold "Jo.Smith@…"; _ and % are literal here.
      .ilike('email', email.replace(/[\\%_]/g, (c: string) => `\\${c}`))
      .limit(20);
    if (subErr) throw subErr;
    const subById = new Map((subs || []).map((s) => [s.id as string, s]));

    // Quoted, so the address's dots and @ stay one value inside or().
    const filters = [`sub_email.eq."${email.replace(/[,()"\\]/g, '')}"`];
    if (subById.size) filters.push(`sub_id.in.(${[...subById.keys()].join(',')})`);
    const { data: sessions, error: sesErr } = await db
      .from('portal_sub_sessions')
      .select('token, sub_id, sub_company, sub_contact_name, project_id, created_by, created_at')
      .eq('status', 'active')
      .or(filters.join(','))
      .order('created_at', { ascending: false })
      .limit(MAX_LINKS);
    if (sesErr) throw sesErr;

    if (sessions?.length && process.env.RESEND_API_KEY) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      for (const s of sessions) {
        const sub = s.sub_id ? subById.get(s.sub_id as string) : undefined;
        const [{ data: project }, { data: gc }] = await Promise.all([
          db.from('projects').select('name').eq('id', s.project_id as string).maybeSingle(),
          s.created_by
            ? db.from('profiles').select('full_name, company').eq('id', s.created_by as string).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        const gcRow = gc as { company?: string | null; full_name?: string | null } | null;
        try {
          const mail = await sendSubPortalInvite({
            to: email,
            contactName: (sub?.contact_name as string) || (s.sub_contact_name as string) || '',
            companyName: (sub?.company_name as string) || (s.sub_company as string) || email,
            gcCompanyName: gcRow?.company || gcRow?.full_name || 'Your General Contractor',
            projectName: (project as { name?: string } | null)?.name || 'Your Project',
            portalUrl: `${appUrl}/portals/sub/${s.token}`,
            isResend: true,
          });
          /* The link just reached the sub's own inbox, so it is good for
             another 90 days (lib/sub-portal-expiry). */
          if (mail?.sent) {
            const { error: expErr } = await db.from('portal_sub_sessions')
              .update({ expires_at: subPortalExpiry() } as never)
              .eq('token', s.token as string).eq('status', 'active');
            if (expErr) console.error('[portal/sub/lookup] expiry refresh failed', expErr);
          }
        } catch (e) {
          // One bad send must not stop the others; the person still gets the generic answer.
          console.error('[portal/sub/lookup] send failed', e);
        }
      }
    }

    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  } catch (err) {
    return apiError('portal/sub/lookup POST', err, 'Lookup failed. Please try again.');
  }
}
