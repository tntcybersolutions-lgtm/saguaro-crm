import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { logActivity } from '@/lib/activity';

export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Permit correspondence / transmittal log for one project.
 *
 * GET  — the back-and-forth with architects and city/AHJ officials, newest
 *        first (optionally narrowed to one permit via ?permitId=).
 * POST — record an item sent or received (direction, party, subject, notes,
 *        attached document ids, status). Logs it on the company activity feed
 *        so it also shows on the status ticker.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const g = await requirePermission(req, 'Documents', 'View');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { projectId } = await params;

  try {
    const permitId = new URL(req.url).searchParams.get('permitId');
    const db = createServerClient() as any;
    let q = db
      .from('permit_correspondence')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (permitId) q = q.eq('permit_id', permitId);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ correspondence: data || [] });
  } catch (e) {
    return apiError('permits/correspondence.get', e, 'Could not load permit correspondence');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { projectId } = await params;

  try {
    const b = (await req.json().catch(() => ({}))) as any;
    const subject = String(b.subject ?? '').trim();
    if (!subject) return NextResponse.json({ error: 'A subject is required' }, { status: 400 });

    const direction = b.direction === 'inbound' ? 'inbound' : 'outbound';
    const docIds = Array.isArray(b.documentIds) ? b.documentIds.map((x: unknown) => String(x)) : [];

    const db = createServerClient() as any;
    const { data: row, error } = await db
      .from('permit_correspondence')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        permit_id: b.permitId ? String(b.permitId) : null,
        direction,
        party: b.party ? String(b.party) : null,
        party_name: b.partyName ? String(b.partyName) : null,
        subject,
        notes: b.notes ? String(b.notes) : null,
        document_ids: docIds,
        status: b.status ? String(b.status) : (direction === 'inbound' ? 'received' : 'sent'),
        sent_at: new Date().toISOString(),
        created_by: user.id,
        created_by_name: user.email,
      })
      .select('*')
      .single();
    if (error) throw error;

    void logActivity({
      tenantId: user.tenantId,
      projectId,
      userId: user.id,
      userName: user.email,
      action: direction === 'inbound' ? 'received' : 'sent',
      entityType: 'permit',
      entityId: (row as { id: string }).id,
      description: `${direction === 'inbound' ? 'Received from' : 'Sent to'} ${b.partyName || b.party || 'AHJ'}: ${subject}`,
      metadata: { party: b.party ?? null },
    });

    return NextResponse.json({ success: true, correspondence: row });
  } catch (e) {
    return apiError('permits/correspondence.post', e, 'Could not record the correspondence');
  }
}
