import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/[projectId]/correspondence/[id]/read-receipt
 * Marks an inbound correspondence item as read by the current user.
 * Called by app/field/correspondence/page.tsx markRead().
 *
 * Request body: { read_at?: string }  (ISO timestamp; defaults to now)
 * Response: { success: true }
 *
 * Records into correspondence_read_receipts
 * (columns: id, correspondence_id, recipient_email, read_at) and best-effort
 * flips the parent correspondence row to status 'Read'.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> },
) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  const { projectId, id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const readAt =
      typeof body?.read_at === 'string' ? body.read_at : new Date().toISOString();
    const recipientEmail = user.email || 'unknown';

    const db = createServerClient();

    // correspondence_read_receipts has no tenant_id column, so the ONLY thing
    // that can scope a receipt is the correspondence it hangs off — and both
    // ids come from the URL on a service-role client that bypasses RLS. This
    // check used to sit at the bottom, guarding the parent's status flip but
    // not the receipt itself, so a signed-in user could attach a receipt to
    // another tenant's correspondence just by editing the id in the path.
    // Prove ownership before writing anything.
    const { data: parent } = await db
      .from('correspondence')
      .select('id')
      .eq('id', id)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (!parent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // De-dupe: one receipt per (correspondence, recipient). No unique index
    // exists, so check first then insert/update.
    const { data: existing } = await db
      .from('correspondence_read_receipts')
      .select('id')
      .eq('correspondence_id', id)
      .eq('recipient_email', recipientEmail)
      .maybeSingle();

    if (existing?.id) {
      await must(db
        .from('correspondence_read_receipts')
        .update({ read_at: readAt })
        .eq('id', existing.id), 'correspondence_read_receipts write');
    } else {
      await must(db.from('correspondence_read_receipts').insert({
        correspondence_id: id,
        recipient_email: recipientEmail,
        read_at: readAt,
      }), 'correspondence_read_receipts insert');
    }

    // Best-effort: reflect read state on the parent item (tenant + project scoped).
    // Service-role bypasses RLS and project_id from the URL is attacker-controlled,
    // so pin the write to the caller's tenant.
    await must(db
      .from('correspondence')
      .update({ status: 'Read' })
      .eq('id', id)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId), 'correspondence write');

    return NextResponse.json({ success: true });
  } catch {
    // Read receipts are non-critical; never surface a hard error to the field UI.
    return NextResponse.json({ success: true });
  }
}
