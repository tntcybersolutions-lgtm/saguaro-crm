import { NextRequest, NextResponse } from 'next/server';
import {
  contactHandler,
  demoRequestHandler,
  referralHandler,
  whitelabelHandler,
} from '../../../../sandbox-manager-route';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  if (segment === 'contact')    return contactHandler(req);
  if (segment === 'demo')       return demoRequestHandler(req);
  if (segment === 'referral')   return referralHandler(req);
  if (segment === 'whitelabel') return whitelabelHandler(req);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }});
}
