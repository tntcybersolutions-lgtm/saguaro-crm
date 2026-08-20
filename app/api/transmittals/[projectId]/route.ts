import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { projectId } = await params;
    const db = createServerClient();

    const { data, error } = await db
      .from('transmittals')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('transmittal_date', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ transmittals: data || [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { projectId } = await params;
    const body = await req.json();
    if (!body.sent_to_name) return NextResponse.json({ error: 'Missing required field: sent_to_name' }, { status: 400 });
    if (!body.sent_to_company) return NextResponse.json({ error: 'Missing required field: sent_to_company' }, { status: 400 });
    if (!body.subject) return NextResponse.json({ error: 'Missing required field: subject' }, { status: 400 });

    const db = createServerClient();

    // Auto-number
    const { data: prev } = await db
      .from('transmittals')
      .select('transmittal_number')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
      .limit(1);

    let nextNum = 'T-001';
    if (prev && prev.length > 0) {
      const last = (prev[0] as Record<string, unknown>).transmittal_number as string;
      if (last) {
        const num = parseInt(last.replace(/\D/g, '')) + 1;
        nextNum = `T-${String(num).padStart(3, '0')}`;
      }
    }

    const { data, error } = await db
      .from('transmittals')
      .insert({
        project_id: projectId,
        tenant_id: user.tenantId,
        transmittal_number: nextNum,
        transmittal_date: new Date().toISOString().split('T')[0],
        sent_to_name: body.sent_to_name,
        sent_to_company: body.sent_to_company,
        sent_to_email: body.sent_to_email || null,
        subject: body.subject,
        purpose: body.purpose || 'for_review',
        description: body.description || null,
        items: body.items || [],
        total_items: (body.items || []).length,
        submittal_ids: body.submittal_ids || [],
        rfi_ids: body.rfi_ids || [],
        response_required: body.response_due_date ? true : false,
        response_due_date: body.response_due_date || null,
        sent_at: new Date().toISOString(),
        status: 'sent',
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ transmittal: data }, { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
