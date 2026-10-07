import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

/** Authenticate a sub portal session via token */
async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  return session;
}

/**
 * Who the portal is for. A sub invited by email before they were added to the
 * company's sub list has no subcontractors row (sub_id is null) — the session
 * itself still carries the company and contact the GC typed, so use those
 * rather than showing a nameless "Subcontractor".
 */
async function subProfile(db: ReturnType<typeof createServerClient>, session: { sub_id: string | null; tenant_id: string; sub_company?: string | null; sub_contact_name?: string | null; sub_email?: string | null }) {
  if (session.sub_id) {
    const { data } = await db
      .from('subcontractors')
      .select('id, company_name, contact_name, email, phone, trade')
      .eq('id', session.sub_id)
      .eq('tenant_id', session.tenant_id)
      .maybeSingle();
    if (data) return data;
  }
  if (!session.sub_company && !session.sub_contact_name) return null;
  return {
    id: null,
    company_name: session.sub_company || session.sub_contact_name || null,
    contact_name: session.sub_contact_name || null,
    email: session.sub_email || null,
    phone: null,
    trade: null,
  };
}

/** POST — Validate token, update last_login_at, return session info */
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 requests per minute per IP
    const ip = getClientIP(req);
    const { allowed, resetIn } = checkRateLimit(`sub-auth:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again in a minute.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(resetIn / 1000)) } }
      );
    }

    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();

    // Update last_login_at
    await must(db
      .from('portal_sub_sessions')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', session.id)
      .eq('tenant_id', session.tenant_id), 'portal_sub_sessions write');

    const sub = await subProfile(db, session);

    // The job this link is for, so the portal can name it ("End of day for …").
    const { data: project } = session.project_id
      ? await db.from('projects').select('name').eq('id', session.project_id).eq('tenant_id', session.tenant_id).maybeSingle()
      : { data: null };

    return NextResponse.json({
      session: {
        id: session.id,
        sub_id: session.sub_id,
        project_id: session.project_id,
        project_name: project?.name ?? null,
        tenant_id: session.tenant_id,
        status: session.status,
        last_login_at: new Date().toISOString(),
      },
      sub: sub || null,
    });
  } catch (err) {
    return apiError('portal/sub/auth', err);
  }
}

/** GET — Return current session info */
export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();

    const sub = await subProfile(db, session);

    return NextResponse.json({
      session: {
        id: session.id,
        sub_id: session.sub_id,
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        status: session.status,
        last_login_at: session.last_login_at,
      },
      sub: sub || null,
    });
  } catch (err) {
    return apiError('portal/sub/auth', err);
  }
}
