import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = (db as any)
      .from('bid_packages')
      .select('*, bid_package_invites(count), bid_submissions(count)')
      .order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ bidPackages: data || [] });
  } catch (err: any) {
    return NextResponse.json({ bidPackages: [], error: err.message }, { status: 500 });
  }
}
