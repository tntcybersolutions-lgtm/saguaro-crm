import { NextRequest, NextResponse } from 'next/server';
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

  if (segment === 'provision')   return provisionResellerHandler(req);
  if (segment === 'branding')    return saveBrandingHandler(req);
  if (segment === 'verify-dns')  return verifyDnsHandler(req);
  if (segment === 'add-client')  return addClientHandler(req);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
