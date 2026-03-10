import { NextRequest } from 'next/server';
import { SandboxManager } from '../../../../sandbox-manager';
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return Response.json({ error: 'tenantId required' }, { status: 400 });
  const stats = await SandboxManager.getUpsellStats(tenantId);
  return Response.json(stats);
}
