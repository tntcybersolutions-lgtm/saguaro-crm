import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** POST /api/portal/sub/lookup — find a sub portal session by email */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const db = createServerClient();

    // Find active portal sessions for this sub email
    const { data: sessions } = await db
      .from('portal_sub_sessions')
      .select('token, sub_id, project_id, status, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!sessions || sessions.length === 0) {
      // Try looking up by subcontractor email directly
      const { data: sub } = await db
        .from('subcontractors')
        .select('id, company_name, contact_name')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();

      if (!sub) {
        return NextResponse.json(
          { error: 'No active portal access found for this email. Please contact the general contractor who invited you.' },
          { status: 404 }
        );
      }

      // Find session for this sub
      const { data: subSessions } = await db
        .from('portal_sub_sessions')
        .select('token, project_id, status')
        .eq('sub_id', sub.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!subSessions || subSessions.length === 0) {
        return NextResponse.json(
          { error: 'No active portal access found for this email. Please contact the general contractor who invited you.' },
          { status: 404 }
        );
      }

      const session = subSessions[0];
      const { data: project } = await db
        .from('projects')
        .select('name')
        .eq('id', session.project_id)
        .maybeSingle();

      return NextResponse.json({
        token: session.token,
        companyName: sub.company_name,
        contactName: sub.contact_name,
        projectName: project?.name || 'Your Project',
      });
    }

    // Sessions found — match by sub email via join
    const subIds = [...new Set(sessions.map(s => s.sub_id).filter(Boolean))];
    const { data: subs } = await db
      .from('subcontractors')
      .select('id, company_name, contact_name, email')
      .in('id', subIds);

    const matchedSub = subs?.find(s => s.email?.toLowerCase() === email.toLowerCase().trim());
    if (!matchedSub) {
      return NextResponse.json(
        { error: 'No active portal access found for this email. Please contact the general contractor who invited you.' },
        { status: 404 }
      );
    }

    const matchedSession = sessions.find(s => s.sub_id === matchedSub.id);
    if (!matchedSession) {
      return NextResponse.json(
        { error: 'No active portal access found for this email.' },
        { status: 404 }
      );
    }

    const { data: project } = await db
      .from('projects')
      .select('name')
      .eq('id', matchedSession.project_id)
      .maybeSingle();

    return NextResponse.json({
      token: matchedSession.token,
      companyName: matchedSub.company_name,
      contactName: matchedSub.contact_name,
      projectName: project?.name || 'Your Project',
    });
  } catch (err) {
    console.error('[portal/sub/lookup]', err);
    return NextResponse.json({ error: 'Lookup failed. Please try again.' }, { status: 500 });
  }
}
