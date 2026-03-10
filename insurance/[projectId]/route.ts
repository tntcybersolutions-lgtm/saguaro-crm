import { NextRequest } from 'next/server';
import { getCOIListHandler } from '../../../../insurance-tracker';
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  return getCOIListHandler(req, params.projectId);
}
