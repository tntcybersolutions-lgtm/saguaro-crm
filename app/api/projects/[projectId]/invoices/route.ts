import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('invoices').select('*').eq('project_id', params.projectId).order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ invoices: data || [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[project/invoices] error:', msg);
    return NextResponse.json({ error: `Failed to fetch invoices: ${msg}` }, { status: 500 });
  }
}
