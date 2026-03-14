import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

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

    const db = createServerClient();

    const status = req.nextUrl.searchParams.get('status');

    let query = db
      .from('portal_sub_rfis')
      .select('*')
      .eq('sub_id', session.sub_id)
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: rfis, error } = await query;

    if (error) throw error;

    return NextResponse.json({ rfis: rfis || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
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

    const db = createServerClient();
    const body = await req.json();
    const {
      subject,
      question,
      priority,
      reference_drawing,
      reference_spec,
      attachments,
    } = body;

    if (!subject || !question) {
      return NextResponse.json(
        { error: 'subject and question are required' },
        { status: 400 }
      );
    }

    // Auto-number: get the latest RFI number for this project + sub
    const { data: latestRfis } = await db
      .from('portal_sub_rfis')
      .select('rfi_number')
      .eq('project_id', session.project_id)
      .eq('sub_id', session.sub_id)
      .eq('tenant_id', session.tenant_id)
      .order('created_at', { ascending: false })
      .limit(1);

    let nextNum = 1;
    if (latestRfis && latestRfis.length > 0) {
      const lastNumber = latestRfis[0].rfi_number;
      const match = lastNumber?.match(/RFI-SUB-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }

    const rfiNumber = `RFI-SUB-${String(nextNum).padStart(3, '0')}`;

    const { data: rfi, error } = await db
      .from('portal_sub_rfis')
      .insert({
        sub_id: session.sub_id,
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        rfi_number: rfiNumber,
        subject,
        question,
        priority: priority || 'normal',
        reference_drawing: reference_drawing || null,
        reference_spec: reference_spec || null,
        attachments: attachments || [],
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
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
