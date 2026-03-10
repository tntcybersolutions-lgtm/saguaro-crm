import { NextRequest } from 'next/server';
import { recordPaymentHandler } from '../../../../../pay-app-workflow';
export async function POST(req: NextRequest, { params }: { params: { payAppId: string } }) {
  return recordPaymentHandler(req, params.payAppId);
}
