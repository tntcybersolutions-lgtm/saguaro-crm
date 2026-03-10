import { NextRequest, NextResponse } from 'next/server';
import {
  createPayApplicationHandler,
  submitPayAppHandler,
  recordPaymentHandler,
} from '../../../../pay-app-workflow';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment, subAction] = path;

  // POST /api/pay-apps/create
  if (segment === 'create') return createPayApplicationHandler(req);

  // POST /api/pay-apps/:payAppId/submit
  if (subAction === 'submit') return submitPayAppHandler(req, segment);

  // POST /api/pay-apps/:payAppId/record-payment
  if (subAction === 'record-payment') return recordPaymentHandler(req, segment);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
