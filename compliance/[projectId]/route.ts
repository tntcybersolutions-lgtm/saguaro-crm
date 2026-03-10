import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../supabase/admin';
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  const { data } = await supabaseAdmin
    .from('project_compliance_dashboard')
    .select('*')
    .eq('project_id', params.projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return NextResponse.json(data ?? {});
}
