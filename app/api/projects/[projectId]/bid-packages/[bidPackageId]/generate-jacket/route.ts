import { NextRequest } from 'next/server';
import { POST as bidJacketPost, GET as bidJacketGet } from '../../../../../../../bid-jacket-route';
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; bidPackageId: string } }
) {
  return bidJacketPost(req, { params });
}
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; bidPackageId: string } }
) {
  return bidJacketGet(req, { params });
}
