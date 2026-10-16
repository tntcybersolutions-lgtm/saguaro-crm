import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ proposals: [] }, { status: 200 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ proposals: data || [] });
  } catch (err: unknown) {
    return apiError('projects/[projectId]/proposals GET', err);
  }
}
