import { NextRequest, NextResponse } from 'next/server';
import { AutoPopulator } from '../../../../auto-populator';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.formType || !body?.tenantId || !body?.projectId) {
    return NextResponse.json({ error: 'formType, tenantId, and projectId are required' }, { status: 400 });
  }
  try {
    const result = await AutoPopulator.prefillForm({
      tenantId:  String(body.tenantId),
      projectId: String(body.projectId),
      formType:  String(body.formType) as Parameters<typeof AutoPopulator.prefillForm>[0]['formType'],
      context:   body.context ?? {},
      entityId:  body.entityId ? String(body.entityId) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Auto-fill failed' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }});
}
