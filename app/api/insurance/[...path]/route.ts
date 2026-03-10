import { NextRequest, NextResponse } from 'next/server';
import {
  checkExpiryHandler,
  requestCOIHandler,
  uploadCOIHandler,
  getCOIListHandler,
} from '../../../../insurance-tracker';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  // GET /api/insurance/:projectId (dynamic segment — not a keyword)
  if (segment && segment !== 'check-expiry' && segment !== 'request' && segment !== 'upload') {
    return getCOIListHandler(req, segment);
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  if (segment === 'check-expiry') return checkExpiryHandler(req);
  if (segment === 'request')      return requestCOIHandler(req);
  if (segment === 'upload')       return uploadCOIHandler(req);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
