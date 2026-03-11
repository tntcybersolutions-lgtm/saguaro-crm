import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db.from('rfis').select('*').order('rfi_number', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    // Mark overdue
    const today = new Date().toISOString().split('T')[0];
    const rfis = (data || []).map((r: any) => ({
      ...r,
      is_overdue: r.status === 'open' && r.due_date && r.due_date < today,
    }));
    return NextResponse.json({ rfis });
  } catch (err: any) {
    return NextResponse.json({ rfis: [], error: err.message }, { status: 500 });
  }
}
