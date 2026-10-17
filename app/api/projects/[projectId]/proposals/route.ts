import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireAnyPermission, PROPOSAL_MONEY } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  // Proposal dollars: Sales or Budget (PROPOSAL_MONEY; role_gate_*_proposals agrees).
  const g = await requireAnyPermission(req, PROPOSAL_MONEY, 'View', { projectId: params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;
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
