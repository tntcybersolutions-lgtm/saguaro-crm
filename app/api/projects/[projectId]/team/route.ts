import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ team: [] }, { status: 401 });

  const { projectId } = await params;
  try {
    const db = createServerClient();
    const { data: team, error } = await db
      .from('project_team')
      .select('id, name, email, role, company, phone, is_primary')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('is_primary', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ team: team || [] });
  } catch {
    return NextResponse.json({ team: [] });
  }
}
