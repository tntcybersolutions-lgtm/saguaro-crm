import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import {
  provisionResellerHandler,
  saveBrandingHandler,
  dnsInstructionsHandler,
  verifyDnsHandler,
  statusHandler,
  addClientHandler,
} from '../../../../white-label-provisioning';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  /* White-label settings are the company's account, not a project tool. The
     handlers check the caller is in the tenant; this checks they run it. */
  const g = await requirePermission(req, 'Admin', 'View');
  if (!g.ok) return g.res;

  if (segment === 'dns-instructions') return dnsInstructionsHandler(req);
  if (segment === 'status')           return statusHandler(req);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  // Repainting the platform or pointing its domain is an owner's change.
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;

  if (segment === 'provision')   return provisionResellerHandler(req);
  if (segment === 'branding')    return saveBrandingHandler(req);
  if (segment === 'verify-dns')  return verifyDnsHandler(req);
  if (segment === 'add-client')  return addClientHandler(req);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
