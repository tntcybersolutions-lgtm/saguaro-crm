import { NextRequest, NextResponse } from 'next/server';
import {
  checkExpiryHandler,
  requestCOIHandler,
  uploadCOIHandler,
  createCOIHandler,
  getCOIListHandler,
} from '../../../../insurance-tracker';
import { requirePermission } from '@/lib/permissions';
import { isUuid } from '@/lib/permission-scope';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  // GET /api/insurance/:projectId (dynamic segment — not a keyword)
  if (segment && segment !== 'check-expiry' && segment !== 'request' && segment !== 'upload' && segment !== 'create') {
    // The job's certificates: Projects view on that job (its job role applies).
    const g = await requirePermission(req, 'Projects', 'View', { projectId: isUuid(segment) ? segment : null });
    if (!g.ok) return g.res;
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
  /* Requesting, uploading or recording a certificate files a document on the
     job: Documents edit there. These only asked "signed in?". */
  if (segment === 'request' || segment === 'upload' || segment === 'create') {
    const g = await requirePermission(req, 'Documents', 'Edit');
    if (!g.ok) return g.res;
  }
  if (segment === 'request')      return requestCOIHandler(req);
  if (segment === 'upload')       return uploadCOIHandler(req);
  if (segment === 'create')       return createCOIHandler(req);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
