import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { loadBidBrain } from '@/lib/sage-brain';
import { apiError } from '@/lib/api-error';

/**
 * R17 — Bid brain: win-rate by markup band from real bid history, with
 * sample-size honesty (bands with n < 5 report winRate: null; fewer than 5
 * decided bids total → enoughHistory: false and no markup advice), plus
 * workflow-efficiency suggestions, each carrying its WHY.
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const analysis = await loadBidBrain(user.tenantId);
    return NextResponse.json({ analysis });
  } catch (e) {
    return apiError('sage/bid-brain GET', e, 'Failed to analyze bid history');
  }
}
