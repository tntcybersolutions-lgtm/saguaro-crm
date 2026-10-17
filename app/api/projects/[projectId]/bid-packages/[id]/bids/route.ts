import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requireAnyPermission, PROPOSAL_MONEY } from '@/lib/permissions';

export async function GET(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  // Role check, not just sign-in: Sales or Budget: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requireAnyPermission(req, PROPOSAL_MONEY, 'View', { projectId: params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    // Read the table the vendor bid portal actually writes (bid_submissions), not the orphan
    // `bids` table — portal-submitted bids never showed in the GC's bid list otherwise.
    const { data, error } = await supabase
      .from('bid_submissions')
      .select('*')
      .eq('bid_package_id', params.id)
      .eq('tenant_id', user.tenantId)
      .order('base_amount');
    if (error) {
      console.error('[projects/[projectId]/bid-packages/[id]/bids] read failed:', error.message);
      return apiError('projects/projectId/bid-packages/id/bids', error, 'Failed to load bids');
    }
    return NextResponse.json({ bids: data || [] });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/bid-packages/[id]/bids] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/bid-packages/id/bids', e, 'Failed to load bids');
  }
}
