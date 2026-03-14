import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** POST /api/portal/client/lookup — find a portal session by email */
export async function POST(req: NextRequest) {
  try {
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

    if (!sessions || sessions.length === 0) {
      return NextResponse.json(
        { error: 'No active portal access found for this email. Please contact your general contractor.' },
        { status: 404 }
      );
    }

    // If multiple, pick the most recent non-expired one
    const now = new Date();
    const valid = sessions.find(s => !s.expires_at || new Date(s.expires_at) > now);

    if (!valid) {
      return NextResponse.json(
        { error: 'Your portal access has expired. Please contact your general contractor to renew access.' },
        { status: 403 }
      );
    }

    // Fetch project name for display
    const { data: project } = await db
      .from('projects')
      .select('name')
      .eq('id', valid.project_id)
      .maybeSingle();

    return NextResponse.json({
      token: valid.token,
      clientName: valid.client_name,
      projectName: project?.name || 'Your Project',
    });
  } catch (err) {
    console.error('[portal/client/lookup]', err);
    return NextResponse.json({ error: 'Lookup failed. Please try again.' }, { status: 500 });
  }
}
