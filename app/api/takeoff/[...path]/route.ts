import { NextRequest, NextResponse } from 'next/server';
import {
  createTakeoffProject,
  getTakeoffProject,
  getTakeoffMaterials,
  runTakeoffSSE,
  uploadBlueprint,
} from '../../../../takeoff-route';

export const maxDuration = 300; // 5 min for AI processing
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment, subAction] = path;

  // GET /api/takeoff/:takeoffId/materials
  if (subAction === 'materials') return getTakeoffMaterials(req, segment);

  // GET /api/takeoff/:takeoffId
  if (segment && !subAction) return getTakeoffProject(req, segment);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment, subAction] = path;

  // POST /api/takeoff/create
  if (segment === 'create') return createTakeoffProject(req);

  // POST /api/takeoff/:takeoffId/run
  if (subAction === 'run') return runTakeoffSSE(req, segment);

  // POST /api/takeoff/:takeoffId/upload
  if (subAction === 'upload') return uploadBlueprint(req, segment);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
