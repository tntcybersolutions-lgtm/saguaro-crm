import { NextRequest } from 'next/server';
import { getCertifiedPayrollHandler } from '../../../../wh347-generator';
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  return getCertifiedPayrollHandler(req, params.projectId);
}
