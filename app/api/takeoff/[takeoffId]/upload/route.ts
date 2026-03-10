import { NextRequest } from 'next/server';
import { uploadBlueprint } from '../../../../../takeoff-route';
export async function POST(
  req: NextRequest,
  { params }: { params: { takeoffId: string } }
) {
  return uploadBlueprint(req, params.takeoffId);
}
