import { NextRequest } from 'next/server';
import { subSignLienWaiverHandler } from '../../../../../../w9-portal';
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  return subSignLienWaiverHandler(req, params.token);
}
