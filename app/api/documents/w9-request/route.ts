import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { sendW9Request } from '@/lib/email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db.from('w9_requests').select('*').eq('tenant_id', user.tenantId).order('sent_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ w9Requests: data || [] });
  } catch (err: any) {
    return NextResponse.json({ w9Requests: [], error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();

    const { data: project } = await db.from('projects').select('name').eq('id', body.projectId).eq('tenant_id', user.tenantId).single();

    const { data: w9, error } = await db.from('w9_requests').insert({
      tenant_id: user.tenantId,
      project_id: body.projectId,
      sub_id: body.subId || null,
      vendor_name: body.vendorName,
      vendor_email: body.vendorEmail,
      status: 'pending',
      sent_at: new Date().toISOString(),
    }).select().single();

    if (error) throw error;

    const portalUrl = `${APP_URL}/portals/w9/${(w9 as any).token}`;
    await sendW9Request(body.vendorEmail, body.vendorName, (project as any)?.name || '', portalUrl);

    return NextResponse.json({ w9, portalUrl, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
