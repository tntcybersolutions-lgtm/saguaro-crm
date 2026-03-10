import { NextRequest, NextResponse } from 'next/server';

import { runAutopilot } from './engine';

function extractToken(request: NextRequest): string | null {
  const bearer = request.headers.get('authorization');
  if (bearer?.startsWith('Bearer ')) {
    return bearer.slice(7);
  }

  return request.headers.get('x-cron-secret');
}

function isAuthorized(request: NextRequest): boolean {
  const token = extractToken(request);
  return Boolean(token && process.env.AUTOPILOT_CRON_SECRET && token === process.env.AUTOPILOT_CRON_SECRET);
}

async function execute(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = request.nextUrl.searchParams.get('tenantId');
  const projectId = request.nextUrl.searchParams.get('projectId');

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  }

  try {
    const result = await runAutopilot({ tenantId, projectId });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown autopilot error',
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return execute(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const tenantId = String(body.tenantId ?? '');
  const projectId = body.projectId ? String(body.projectId) : null;

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  }

  try {
    const result = await runAutopilot({ tenantId, projectId });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown autopilot error',
      },
      { status: 500 },
    );
  }
}
