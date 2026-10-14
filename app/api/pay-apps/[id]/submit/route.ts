import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { onPayAppSubmitted } from '@/lib/triggers';
import { randomUUID } from 'crypto';
import { runInBackground } from '@/lib/background';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Pay Apps', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const db = g.db;
    // Issue a per-pay-app owner-approval token so the owner can review/approve
    // this submission via /owner-portal/approve/{token}. Idempotent: reuse an
    // existing token if one was already issued.
    const { data: existing } = await db
      .from('pay_applications')
      .select('owner_approval_token')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    const owner_approval_token =
      (existing as { owner_approval_token?: string } | null)?.owner_approval_token || randomUUID();

    const { error } = await db
      .from('pay_applications')
      .update({ status: 'submitted', submitted_at: new Date().toISOString(), owner_approval_token })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    runInBackground(onPayAppSubmitted(id), 'onPayAppSubmitted');
    return NextResponse.json({ success: true, owner_approval_token });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
