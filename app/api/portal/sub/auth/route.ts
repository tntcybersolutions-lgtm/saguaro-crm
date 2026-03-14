import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

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

/** POST — Validate token, update last_login_at, return session info */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();

    // Update last_login_at
    await db
      .from('portal_sub_sessions')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', session.id)
      .eq('tenant_id', session.tenant_id);

    // Fetch sub details
    const { data: sub } = await db
      .from('subcontractors')
      .select('id, company_name, contact_name, email, phone, trade')
      .eq('id', session.sub_id)
      .eq('tenant_id', session.tenant_id)
      .single();

    return NextResponse.json({
      session: {
        id: session.id,
        sub_id: session.sub_id,
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        status: session.status,
        last_login_at: new Date().toISOString(),
      },
      sub: sub || null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
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

    const { data: sub } = await db
      .from('subcontractors')
      .select('id, company_name, contact_name, email, phone, trade')
      .eq('id', session.sub_id)
      .eq('tenant_id', session.tenant_id)
      .single();

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
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
