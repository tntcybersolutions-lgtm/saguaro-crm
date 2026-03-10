import { NextRequest } from 'next/server';
import { submitPayAppHandler } from '../../../../../pay-app-workflow';
export async function POST(req: NextRequest, { params }: { params: { payAppId: string } }) {
  return submitPayAppHandler(req, params.payAppId);
}
