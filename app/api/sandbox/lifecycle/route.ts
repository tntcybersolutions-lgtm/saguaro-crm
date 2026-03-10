import { NextRequest, NextResponse } from 'next/server';
import { SandboxManager } from '../../../../sandbox-manager';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.AUTOPILOT_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await SandboxManager.processSandboxLifecycleEmails();
  return NextResponse.json({ success: true });
}
