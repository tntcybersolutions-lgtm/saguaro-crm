import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/email';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

const GENERIC_MESSAGE = 'If an active portal exists for this email, a login link has been sent. Please check your inbox.';

/** POST /api/portal/client/lookup — find a portal session by email */
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 requests per minute per IP
    const ip = getClientIP(req);
    const { allowed, resetIn } = checkRateLimit(`client-lookup:${ip}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again in a minute.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(resetIn / 1000)) } }
      );
    }

    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const db = createServerClient();

    // Find active portal session by client email
    const { data: sessions } = await db
      .from('portal_client_sessions')
      .select('token, client_name, project_id, expires_at, status')
      .eq('client_email', email.toLowerCase().trim())
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(5);

    const now = new Date();
    const valid = (sessions || []).find(s => !s.expires_at || new Date(s.expires_at) > now);

    // SECURITY: never return the token to the caller — anyone who knows a
    // client's email could otherwise take over the portal. Email the link to
    // the address on file, and ALWAYS return the same generic message whether
    // or not a session exists (prevents email enumeration).
    if (valid) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
        const portalUrl = `${appUrl}/portals/client/${valid.token}`;
        const { data: project } = await db
          .from('projects')
          .select('name')
          .eq('id', valid.project_id)
          .maybeSingle();
        const projectName = project?.name || 'your project';
        await sendEmail({
          to: email.toLowerCase().trim(),
          subject: `Your ${projectName} portal access link`,
          html: `<p>Hi ${valid.client_name || 'there'},</p>
           <p>Here is your secure access link for <strong>${projectName}</strong>:</p>
           <p><a href="${portalUrl}">${portalUrl}</a></p>
           <p>This link is tied to your project. If you didn't request it, you can safely ignore this email.</p>`,
        });
      } catch (e) {
        console.warn('[portal/client/lookup] email send failed:', e);
      }
    }

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (err) {
    return apiError('portal/client/lookup POST', err, 'Lookup failed. Please try again.');
  }
}
