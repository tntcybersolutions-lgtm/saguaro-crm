import { NextRequest } from 'next/server';
import { subPortalGetHandler } from '../../../../../w9-portal';
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  return subPortalGetHandler(req, params.token);
}
