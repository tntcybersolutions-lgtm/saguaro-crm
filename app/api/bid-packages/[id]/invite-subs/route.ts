// app/api/bid-packages/[id]/invite-subs/route.ts
// POST /api/bid-packages/:id/invite-subs
// Suggests and optionally sends sub invitations for a bid package.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InviteSubsRequest {
  tradeRequired: string;
  projectType?: string;
  projectValue?: number;
  sendInvites?: boolean;
}

interface SubSuggestion {
  id: string;
  name: string;
  trade: string;
  winRate: number | null;
  lastProjectDate: string | null;
  email: string | null;
  phone: string | null;
  suggestedReason: string;
}

// ─── Demo Fallback Subs ───────────────────────────────────────────────────────

function buildDemoSubs(trade: string): SubSuggestion[] {
  const tradeLabel = trade || 'General';
  return [
    {
      id: 'demo-sub-1',
      name: `${tradeLabel} Pro Solutions LLC`,
      trade: tradeLabel,
      winRate: 72,
      lastProjectDate: '2025-10-15',
      email: 'bids@tradeproaz.com',
      phone: '(602) 555-0141',
      suggestedReason: 'Highest win rate for this trade in your history',
    },
    {
      id: 'demo-sub-2',
      name: `Desert ${tradeLabel} Contractors`,
      trade: tradeLabel,
      winRate: 61,
      lastProjectDate: '2025-09-02',
      email: 'estimating@deserttrade.com',
      phone: '(480) 555-0198',
      suggestedReason: 'Consistent pricing within 5% of award value',
    },
    {
      id: 'demo-sub-3',
      name: `Southwest ${tradeLabel} Group`,
      trade: tradeLabel,
      winRate: 55,
      lastProjectDate: '2025-07-22',
      email: 'quotes@swtrade.net',
      phone: '(602) 555-0223',
      suggestedReason: 'Competitive rates and strong schedule compliance',
    },
    {
      id: 'demo-sub-4',
      name: `Valley ${tradeLabel} Inc.`,
      trade: tradeLabel,
      winRate: 48,
      lastProjectDate: '2025-05-10',
      email: 'bids@valleytrade.com',
      phone: '(623) 555-0077',
      suggestedReason: 'New to your roster — competitive entry pricing',
    },
    {
      id: 'demo-sub-5',
      name: `AZ ${tradeLabel} Specialists`,
      trade: tradeLabel,
      winRate: 44,
      lastProjectDate: '2024-12-18',
      email: 'office@azspecialists.com',
      phone: '(480) 555-0312',
      suggestedReason: 'Good ratings on past projects, available for this schedule',
    },
  ];
}

function buildSuggestedReason(sub: Record<string, unknown>): string {
  if ((sub.win_rate as number) >= 65) return 'Top performer by win rate for this trade';
  if ((sub.avg_rating as number) >= 4.5) return 'Highly rated on past projects';
  if (sub.last_project_date) return `Active — last project ${sub.last_project_date}`;
  return 'Available sub matching required trade';
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const bidPackageId = params.id;

    if (!bidPackageId) {
      return NextResponse.json({ error: 'Bid package ID is required.' }, { status: 400 });
    }

    const body: InviteSubsRequest = await req.json();
    const { tradeRequired, projectType, projectValue, sendInvites = false } = body;

    if (!tradeRequired) {
      return NextResponse.json({ error: 'tradeRequired is required.' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Resolve tenant
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    let tenantId: string | null = null;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      tenantId = user?.id ?? null;
    }

    let suggestions: SubSuggestion[] = [];
    let source = 'demo';

    if (tenantId) {
      // Try sub_performance table first
      const { data: perfData, error: perfError } = await supabase
        .from('sub_performance')
        .select('*')
        .eq('tenant_id', tenantId)
        .ilike('trade', `%${tradeRequired}%`)
        .order('win_rate', { ascending: false })
        .limit(5);

      if (!perfError && perfData?.length) {
        suggestions = perfData.map((sub: Record<string, unknown>) => ({
          id: sub.id as string,
          name: sub.sub_name as string,
          trade: sub.trade as string,
          winRate: sub.win_rate as number | null,
          lastProjectDate: sub.last_project_date as string | null,
          email: sub.email as string | null,
          phone: sub.phone as string | null,
          suggestedReason: buildSuggestedReason(sub),
        }));
        source = 'sub_performance';
      } else {
        // Try generic subcontractors table as fallback
        const { data: subData, error: subError } = await supabase
          .from('subcontractors')
          .select('id, name, trade, email, phone, rating')
          .eq('tenant_id', tenantId)
          .ilike('trade', `%${tradeRequired}%`)
          .limit(5);

        if (!subError && subData?.length) {
          suggestions = subData.map((sub: Record<string, unknown>) => ({
            id: sub.id as string,
            name: sub.name as string,
            trade: sub.trade as string,
            winRate: null,
            lastProjectDate: null,
            email: sub.email as string | null,
            phone: sub.phone as string | null,
            suggestedReason: 'Matching sub in your database',
          }));
          source = 'subcontractors';
        } else {
          // No live data — use demo subs
          suggestions = buildDemoSubs(tradeRequired);
          source = 'demo';
        }
      }
    } else {
      suggestions = buildDemoSubs(tradeRequired);
      source = 'demo';
    }

    // If sendInvites=true and we have a real tenant, record the invitations
    let invitesSent = 0;
    if (sendInvites && tenantId && source !== 'demo') {
      const now = new Date().toISOString();
      const inviteRows = suggestions.map((sub) => ({
        tenant_id: tenantId,
        bid_package_id: bidPackageId,
        sub_id: sub.id.startsWith('demo-') ? null : sub.id,
        sub_name: sub.name,
        sub_email: sub.email,
        trade: sub.trade,
        status: 'invited',
        invited_at: now,
      }));

      const { error: insertError } = await supabase
        .from('bid_package_invites')
        .upsert(inviteRows, { onConflict: 'bid_package_id,sub_email' });

      if (!insertError) {
        invitesSent = inviteRows.length;
      }
      // Non-fatal — we still return the suggestions even if logging fails
    }

    return NextResponse.json({
      bidPackageId,
      tradeRequired,
      projectType: projectType ?? null,
      projectValue: projectValue ?? null,
      suggestions,
      totalSuggested: suggestions.length,
      invitesSent: sendInvites ? invitesSent : 0,
      source,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
