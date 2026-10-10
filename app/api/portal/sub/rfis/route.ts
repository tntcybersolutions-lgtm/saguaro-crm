import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { notOnRoster, subRecordScope } from '@/lib/sub-portal-scope';

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

/** GET — List sub's RFIs */
export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    // An email-only invite has no roster sub, so no RFI can belong to it (lib/sub-portal-scope).
    const scope = subRecordScope(session);
    if (!scope) return NextResponse.json({ rfis: [] });

    const db = createServerClient();

    const status = req.nextUrl.searchParams.get('status');

    let query = db
      .from('portal_sub_rfis')
      .select('*')
      .eq('sub_id', scope.subId)
      .eq('project_id', scope.projectId)
      .eq('tenant_id', scope.tenantId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: rfis, error } = await query;

    if (error) throw error;

    return NextResponse.json({ rfis: rfis || [] });
  } catch (err) {
    return apiError('portal/sub/rfis', err, "Couldn't load your RFIs.");
  }
}

/** POST — Create new RFI with auto-numbering (RFI-SUB-001) */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const scope = subRecordScope(session);
    if (!scope) {
      const r = notOnRoster(session, 'an RFI');
      return NextResponse.json(r.body, { status: r.status });
    }

    const db = createServerClient();
    const body = await req.json();
    const {
      subject,
      question,
    } = body;

    if (!subject || !question) {
      return NextResponse.json(
        { error: 'subject and question are required' },
        { status: 400 }
      );
    }

    // Auto-number for the response label only. portal_sub_rfis has no rfi_number
    // column, so the number is derived from the existing row count rather than a
    // stored value and is not persisted.
    const { count: existingCount } = await db
      .from('portal_sub_rfis')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', scope.projectId)
      .eq('sub_id', scope.subId)
      .eq('tenant_id', scope.tenantId);

    const nextNum = (existingCount || 0) + 1;
    const rfiNumber = `RFI-SUB-${String(nextNum).padStart(3, '0')}`;

    // Live portal_sub_rfis columns: subject, question, answer, status,
    // submitted_at, answered_at, created_at. rfi_number / priority /
    // reference_drawing / reference_spec / attachments have no column (and no
    // jsonb to fold into) so they are dropped.
    const { data: rfi, error } = await db
      .from('portal_sub_rfis')
      .insert({
        sub_id: scope.subId,
        project_id: scope.projectId,
        tenant_id: scope.tenantId,
        subject,
        question,
        status: 'open',
        submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(
      { rfi, message: `RFI ${rfiNumber} created successfully` },
      { status: 201 }
    );
  } catch (err) {
    return apiError('portal/sub/rfis', err, "Couldn't submit the RFI. Please try again.");
  }
}
