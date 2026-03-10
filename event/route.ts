import { NextRequest } from 'next/server';
import { SandboxManager } from '../../../../sandbox-manager';
import { supabaseAdmin } from '../../../../supabase/admin';
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const tenantId = String(body.tenantId ?? '');
  const eventType = String(body.eventType ?? '');
  if (!tenantId || !eventType) return Response.json({ error: 'tenantId and eventType required' }, { status: 400 });
  const { data: sb } = await supabaseAdmin.from('sandbox_tenants').select('id').eq('tenant_id', tenantId).maybeSingle();
  if (!sb) return Response.json({ tracked: false });
  const result = await SandboxManager.trackSandboxEvent(sb.id as string, tenantId, eventType, body.eventData ?? {});
  return Response.json({ tracked: true, ...result });
}
