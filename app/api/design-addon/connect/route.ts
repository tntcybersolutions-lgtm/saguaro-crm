import { NextResponse } from 'next/server';
// DESIGN STUDIO DISABLED — re-enable by reverting this commit (original handler in git history)
export async function GET() {
  return NextResponse.json({ error: 'Feature coming soon' }, { status: 503 });
}
export async function POST() {
  return NextResponse.json({ error: 'Feature coming soon' }, { status: 503 });
}
