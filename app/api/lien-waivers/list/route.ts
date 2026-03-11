import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db.from('lien_waivers').select('*, subcontractors(name, email)').order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ lienWaivers: data || [] });
  } catch (err: any) {
    return NextResponse.json({ lienWaivers: [], error: err.message }, { status: 500 });
  }
}
