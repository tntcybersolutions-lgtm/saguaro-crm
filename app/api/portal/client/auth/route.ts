import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { must } from '@/lib/db-write';

/** Authenticate a portal session via token */
async function getPortalSession(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_client_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  if (!session) return null;
  // Reject EXPIRED tokens. The canonical lib/portal-auth validator does this;
  // this local copy previously skipped it, so expired portal tokens still worked.
  if (session.expires_at && new Date(session.expires_at) < new Date()) return null;
  return session;
}

/** POST — validate token, return session + project info */
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 requests per minute per IP
    const ip = getClientIP(req);
    const { allowed, resetIn } = checkRateLimit(`client-auth:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again in a minute.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(resetIn / 1000)) } }
      );
    }

    const body = await req.json();
    const token = body.token;
    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    const db = createServerClient();
    const { data: session, error: sessionError } = await db
      .from('portal_client_sessions')
      .select('*')
      .eq('token', token)
      .eq('status', 'active')
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Update last_login timestamp
    await must(db
      .from('portal_client_sessions')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', session.id), 'portal_client_sessions write');

    // Fetch project info
    const { data: project } = await db
      .from('projects')
      .select('id, name, status, address, start_date, end_date, contract_amount')
      .eq('id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .single();

    return NextResponse.json({
      session: {
        id: session.id,
        client_name: session.client_name,
        client_email: session.client_email,
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        permissions: session.permissions,
        expires_at: session.expires_at,
      },
      project,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** GET — get current session info */
export async function GET(req: NextRequest) {
  try {
    const session = await getPortalSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createServerClient();
    const { data: project } = await db
      .from('projects')
      .select('id, name, status, address, start_date, end_date, contract_amount')
      .eq('id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .single();

    return NextResponse.json({
      session: {
        id: session.id,
        client_name: session.client_name,
        client_email: session.client_email,
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        permissions: session.permissions,
        expires_at: session.expires_at,
      },
      project,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
