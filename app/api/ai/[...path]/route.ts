import { NextRequest, NextResponse } from 'next/server';
import { chatHandler, chatSuggestionsHandler } from '../../../../ai-chat-route';
import { AutoPopulator } from '../../../../auto-populator';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment, subAction] = path;

  // GET /api/ai/chat/suggestions
  if (segment === 'chat' && subAction === 'suggestions') return chatSuggestionsHandler(req);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  // POST /api/ai/chat
  if (segment === 'chat') return chatHandler(req);

  // POST /api/ai/prefill
  if (segment === 'prefill') {
    const body = await req.json().catch(() => null);
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

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }});
}
