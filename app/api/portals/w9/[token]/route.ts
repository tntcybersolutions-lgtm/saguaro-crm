import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendW9Request } from '@/lib/email';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const db = createServerClient();
    const { data, error } = await db.from('w9_requests').select('*, projects(name)').eq('token', token).single();
    if (error || !data) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
    const w = data as any;
    return NextResponse.json({
      request: {
        vendorName: w.vendor_name,
        projectName: w.projects?.name || 'Project',
        status: w.status,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const body = await req.json();
    const db = createServerClient();
    const { data: req_ } = await db.from('w9_requests').select('*').eq('token', token).single();
    if (!req_) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });

    const { error } = await db.from('w9_requests').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      w9_data: body,
    }).eq('token', token);

    if (error) throw error;

    // Update sub w9 status
    const r = req_ as any;
    if (r.sub_id) {
      await db.from('subcontractors').update({ w9_status: 'submitted' }).eq('id', r.sub_id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
