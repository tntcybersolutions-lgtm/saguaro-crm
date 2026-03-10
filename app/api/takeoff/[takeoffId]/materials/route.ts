import { NextRequest } from 'next/server';
import { getTakeoffMaterials } from '../../../../../takeoff-route';
export async function GET(
  req: NextRequest,
  { params }: { params: { takeoffId: string } }
) {
  return getTakeoffMaterials(req, params.takeoffId);
}
