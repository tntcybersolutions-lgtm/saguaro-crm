import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db.from('pay_applications').select('*').order('app_number', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ payApps: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, payApps: [] }, { status: 500 });
  }
}
