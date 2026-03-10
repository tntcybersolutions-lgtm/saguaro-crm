import { NextRequest } from 'next/server';
import { runTakeoffSSE } from '../../../../../takeoff-route';
export async function POST(
  req: NextRequest,
  { params }: { params: { takeoffId: string } }
) {
  return runTakeoffSSE(req, params.takeoffId);
}
