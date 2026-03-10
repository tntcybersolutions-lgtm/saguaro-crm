import { NextRequest } from 'next/server';
import { w9GetHandler, w9PostHandler } from '../../../../../w9-portal';
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  return w9GetHandler(req, params.token);
}
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  return w9PostHandler(req, params.token);
}
