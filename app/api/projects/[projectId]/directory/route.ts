import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('project_directory')
      .select('*')
      .eq('project_id', params.projectId)
      .order('name');
    if (error) {
      // Fallback: try team table
      const { data: team } = await supabase
        .from('project_team')
        .select('*')
        .eq('project_id', params.projectId)
        .order('name');
      return NextResponse.json({ contacts: team || [] });
    }
    return NextResponse.json({ contacts: data || [] });
  } catch {
    return NextResponse.json({ contacts: [] });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const supabase = createServerClient();
    const record = {
      project_id: params.projectId,
      ...body,
      created_by: user.email,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('project_directory').insert(record).select().single();
    if (error) return NextResponse.json({ contact: { id: `dir-${Date.now()}`, ...record } });
    return NextResponse.json({ contact: data });
  } catch {
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }
}
