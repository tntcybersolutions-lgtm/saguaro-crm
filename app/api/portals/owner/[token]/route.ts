import { NextRequest } from 'next/server';
import { ownerApproveGetHandler, ownerApprovePostHandler } from '../../../../../pay-app-workflow';
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  return ownerApproveGetHandler(req, params.token);
}
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  return ownerApprovePostHandler(req, params.token);
}
