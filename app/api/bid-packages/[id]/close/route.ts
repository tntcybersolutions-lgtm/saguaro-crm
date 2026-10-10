import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const db = createServerClient();
    // Tenant-scope the write — service-role bypasses RLS, so id-only would let one
    // tenant close another tenant's bid package (cross-tenant IDOR).
    await must(db.from('bid_packages').update({ status: 'closed' }).eq('id', id).eq('tenant_id', user.tenantId), 'bid_packages update');
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('bid-packages/close', e, 'Bidding could not be closed. Try again.');
  }
}
