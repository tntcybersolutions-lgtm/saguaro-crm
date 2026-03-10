import { NextRequest } from 'next/server';
import { getTakeoffProject } from '../../../../takeoff-route';
export async function GET(
  req: NextRequest,
  { params }: { params: { takeoffId: string } }
) {
  return getTakeoffProject(req, params.takeoffId);
}
