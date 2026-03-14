import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

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

  return session;
}

/** POST — validate token, return session + project info */
export async function POST(req: NextRequest) {
  try {
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

    // Update last_accessed timestamp
    await db
      .from('portal_client_sessions')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', session.id);

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
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Auth failed' }, { status: 500 });
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to get session' }, { status: 500 });
  }
}
