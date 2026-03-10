import { NextRequest, NextResponse } from 'next/server';
import { getProjectContext } from '../../../../project-context';
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  const ctx = await getProjectContext(tenantId, params.projectId);
  return NextResponse.json(ctx);
}
