import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { sendW9Request } from '@/lib/email';
import crypto from 'crypto';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db.from('w9_requests').select('*').eq('tenant_id', user.tenantId).order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ w9Requests: data || [] });
  } catch {
    return NextResponse.json({ w9Requests: [], error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();

    // Require a real vendor name + email. The per-sub "Request W-9" button used
    // to POST only { projectId, subId }, so vendorName/vendorEmail were
    // undefined — inserting a null-vendor row and emailing `undefined`. Reject
    // that loudly instead of persisting a useless request.
    const vendorName = (body.vendorName ?? body.vendor_name ?? '').toString().trim();
    const vendorEmail = (body.vendorEmail ?? body.vendor_email ?? '').toString().trim();
    if (!body.projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    if (!vendorName || !vendorEmail) {
      return NextResponse.json({ error: 'vendorName and vendorEmail are required' }, { status: 400 });
    }

    const db = createServerClient();

    // Scope the project to the caller's tenant.
    const { data: project } = await db.from('projects').select('name').eq('id', body.projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const { data: w9, error } = await db.from('w9_requests').insert({
      tenant_id: user.tenantId,
      project_id: body.projectId,
      vendor_name: vendorName,
      vendor_email: vendorEmail,
      status: 'pending',
      token: crypto.randomUUID(),
    }).select().single();

    if (error) throw error;

    const portalUrl = `${APP_URL}/portals/w9/${(w9 as any).token}`;
    const mail = await sendW9Request(vendorEmail, vendorName, (project as any)?.name || '', portalUrl);
    if (!mail.sent) {
      // The request exists and the link works; say plainly that the email failed.
      return NextResponse.json({ w9, portalUrl, success: true, emailed: false, warning: "The W-9 request was created, but the email didn't go out. Copy the link and send it to the vendor." });
    }

    return NextResponse.json({ w9, portalUrl, success: true, emailed: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
