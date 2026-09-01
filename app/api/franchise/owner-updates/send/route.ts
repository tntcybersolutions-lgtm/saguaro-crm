import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { hasFeature } from '@/lib/entitlements-server';
import { sendOwnerUpdate } from '@/lib/email/send';

import { apiError } from '@/lib/api-error';
/**
 * Email a per-site weekly owner update via Resend. FAIL-CLOSED + tenant-scoped.
 * The client composes the update text (the same one shown on the Owner Updates
 * page); this route verifies the project belongs to the tenant and sends it.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const to = String(body?.to || '').trim();
    const text = String(body?.text || '').trim();
    if (!body?.project_id || !to || !text)
      return NextResponse.json({ error: 'project_id, to and text are required' }, { status: 400 });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))
      return NextResponse.json({ error: 'invalid recipient email' }, { status: 400 });

    const db = createServerClient();
    const { data: proj } = await db.from('projects').select('id,name').eq('tenant_id', user.tenantId).eq('id', body.project_id).maybeSingle();
    if (!proj) return NextResponse.json({ error: 'invalid project' }, { status: 400 });

    const result = await sendOwnerUpdate(to, (proj as any).name || 'Your Project', text);
    if (!result.sent) return NextResponse.json({ error: 'Email is not configured (RESEND_API_KEY missing) or the send failed.' }, { status: 502 });
    return NextResponse.json({ sent: true, id: result.id });
  } catch (e: any) {
    return apiError('franchise/owner-updates/send', e, "send failed", 500);
  }
}
