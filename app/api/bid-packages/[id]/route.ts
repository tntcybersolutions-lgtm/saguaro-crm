// app/api/bid-packages/[id]/route.ts
// GET /api/bid-packages/[id]
// Returns full bid package detail including SOV line items and invited subs.
// Falls back to demo data if DB is unavailable or package not found.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../supabase/admin';

interface SovItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total: number;
}

interface InvitedSub {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  status: 'invited' | 'viewed' | 'submitted' | 'declined';
  bid_amount: number | null;
  invited_at: string;
  responded_at: string | null;
}

interface BidPackageDetail {
  id: string;
  code: string;
  name: string;
  trade: string;
  scope: string;
  status: string;
  bid_due_date: string | null;
  project_id: string;
  sov_items: SovItem[];
  invited_subs: InvitedSub[];
  awarded_to: string | null;
  awarded_amount: number | null;
  created_at: string;
}

// ─── Demo fallback ────────────────────────────────────────────────────────────

function demoBidPackage(id: string): BidPackageDetail {
  const packages: Record<string, Partial<BidPackageDetail>> = {
    'bp-1': { code: 'BP-01', name: 'Electrical Package', trade: 'Electrical', awarded_to: 'Desert Electrical', awarded_amount: 385000 },
    'bp-2': { code: 'BP-02', name: 'Concrete & Foundation', trade: 'Concrete', awarded_to: 'AZ Concrete', awarded_amount: 290000 },
    'bp-3': { code: 'BP-03', name: 'Structural Framing', trade: 'Framing', awarded_to: 'Rio Framing', awarded_amount: 480000 },
    'bp-4': { code: 'BP-04', name: 'Mechanical HVAC', trade: 'HVAC', awarded_to: 'Pinnacle Mechanical', awarded_amount: 340000 },
    'bp-5': { code: 'BP-05', name: 'Plumbing Rough-In & Trim', trade: 'Plumbing', awarded_to: 'Blue River Plumbing', awarded_amount: 220000 },
    'bp-6': { code: 'BP-06', name: 'Roofing — TPO System', trade: 'Roofing', awarded_to: 'Southwest Roofing', awarded_amount: 195000 },
  };
  const p = packages[id] || { code: 'BP-XX', name: 'Bid Package', trade: 'General', awarded_to: null, awarded_amount: null };

  return {
    id,
    code: p.code || 'BP-XX',
    name: p.name || 'Bid Package',
    trade: p.trade || 'General',
    scope: `Complete ${p.trade || 'general'} scope per plans and specifications dated 2025-11-01. Includes all labor, material, equipment, and supervision required for a complete installation.`,
    status: 'awarded',
    bid_due_date: '2025-12-15',
    project_id: 'demo-project-00000000-0000-0000-0000-000000000001',
    awarded_to: p.awarded_to || null,
    awarded_amount: p.awarded_amount || null,
    created_at: '2025-11-10T00:00:00Z',
    sov_items: [
      { id: 'sov-1', description: 'Mobilization & Setup', quantity: 1, unit: 'LS', unit_cost: 12500, total: 12500 },
      { id: 'sov-2', description: `${p.trade || 'Rough'} Rough-In`, quantity: 1, unit: 'LS', unit_cost: Math.round((p.awarded_amount || 200000) * 0.45), total: Math.round((p.awarded_amount || 200000) * 0.45) },
      { id: 'sov-3', description: `${p.trade || 'Finish'} Finish Work`, quantity: 1, unit: 'LS', unit_cost: Math.round((p.awarded_amount || 200000) * 0.40), total: Math.round((p.awarded_amount || 200000) * 0.40) },
      { id: 'sov-4', description: 'Inspection & Testing', quantity: 1, unit: 'LS', unit_cost: Math.round((p.awarded_amount || 200000) * 0.10), total: Math.round((p.awarded_amount || 200000) * 0.10) },
      { id: 'sov-5', description: 'Cleanup & Demobilization', quantity: 1, unit: 'LS', unit_cost: Math.round((p.awarded_amount || 200000) * 0.05), total: Math.round((p.awarded_amount || 200000) * 0.05) },
    ],
    invited_subs: [
      { id: 'sub-1', company_name: p.awarded_to || 'Awarded Contractor', contact_name: 'Mike Johnson', email: 'mike@contractor.com', status: 'submitted', bid_amount: p.awarded_amount || null, invited_at: '2025-11-15T00:00:00Z', responded_at: '2025-12-08T00:00:00Z' },
      { id: 'sub-2', company_name: 'Mesa Specialty Contractors', contact_name: 'Sarah Lee', email: 'sarah@mesa.com', status: 'submitted', bid_amount: p.awarded_amount ? Math.round(p.awarded_amount * 1.08) : null, invited_at: '2025-11-15T00:00:00Z', responded_at: '2025-12-10T00:00:00Z' },
      { id: 'sub-3', company_name: 'Phoenix Pro Services', contact_name: 'Tom Rivera', email: 'tom@phoenixpro.com', status: 'viewed', bid_amount: null, invited_at: '2025-11-15T00:00:00Z', responded_at: null },
      { id: 'sub-4', company_name: 'Sonoran Specialty Group', contact_name: 'Dana White', email: 'dana@sonoran.com', status: 'declined', bid_amount: null, invited_at: '2025-11-15T00:00:00Z', responded_at: '2025-11-20T00:00:00Z' },
    ],
  };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { data, error } = await supabaseAdmin
      .from('bid_packages')
      .select(`
        id, code, name, trade, scope, status, bid_due_date, project_id,
        awarded_to, awarded_amount, created_at,
        sov_items(*),
        bid_package_invites(id, sub_id, status, bid_amount, invited_at, responded_at,
          subs(id, company_name, contact_name, email))
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ bidPackage: demoBidPackage(id), source: 'demo' });
    }

    // Shape invited_subs from join
    const invitedSubs: InvitedSub[] = (data.bid_package_invites || []).map((inv: any) => ({
      id: inv.id,
      company_name: inv.subs?.company_name || 'Unknown',
      contact_name: inv.subs?.contact_name || '',
      email: inv.subs?.email || '',
      status: inv.status,
      bid_amount: inv.bid_amount,
      invited_at: inv.invited_at,
      responded_at: inv.responded_at,
    }));

    return NextResponse.json({
      bidPackage: {
        ...data,
        invited_subs: invitedSubs,
        sov_items: data.sov_items || [],
      },
      source: 'live',
    });
  } catch {
    return NextResponse.json({ bidPackage: demoBidPackage(id), source: 'demo' });
  }
}
