import { NextRequest, NextResponse } from 'next/server';
import { ownerApproveGetHandler, ownerApprovePostHandler } from '../../../../pay-app-workflow';
import { subPortalGetHandler, subSignLienWaiverHandler, w9GetHandler, w9PostHandler } from '../../../../w9-portal';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [portalType, token] = path;

  // GET /api/portals/owner/:token
  if (portalType === 'owner' && token) return ownerApproveGetHandler(req, token);

  // GET /api/portals/sub/:token
  if (portalType === 'sub' && token && path.length === 2) return subPortalGetHandler(req, token);

  // GET /api/portals/w9/:token
  if (portalType === 'w9' && token) return w9GetHandler(req, token);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [portalType, token, subPath] = path;

  // POST /api/portals/owner/:token
  if (portalType === 'owner' && token) return ownerApprovePostHandler(req, token);

  // POST /api/portals/sub/:token/lien-waiver
  if (portalType === 'sub' && token && subPath === 'lien-waiver') return subSignLienWaiverHandler(req, token);

  // POST /api/portals/w9/:token
  if (portalType === 'w9' && token) return w9PostHandler(req, token);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
