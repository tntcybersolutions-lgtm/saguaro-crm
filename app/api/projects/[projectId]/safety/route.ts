import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const [incidents, inspections] = await Promise.all([
      supabase.from('safety_incidents').select('*').eq('project_id', params.projectId).order('date', { ascending: false }),
      supabase.from('safety_inspections').select('*').eq('project_id', params.projectId).order('date', { ascending: false }),
    ]);
    if (incidents.error && inspections.error) {
      throw new Error(`Incidents: ${incidents.error.message}; Inspections: ${inspections.error.message}`);
    }
    return NextResponse.json({ incidents: incidents.data || [], inspections: inspections.data || [] });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[projects/safety] error:', msg);
    return NextResponse.json({ error: `Failed to fetch safety data: ${msg}` }, { status: 500 });
  }
}
