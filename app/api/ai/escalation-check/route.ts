import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id, threshold_hours } = body;

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const hoursThreshold = threshold_hours || 48;
    const cutoffDate = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString();

    const db = createServerClient();

    // Find overdue open RFIs
    const { data: overdueRfis, error: rfiError } = await db
      .from('rfis')
      .select('id, rfi_number, subject, status, due_date, assigned_to, created_at')
      .eq('project_id', project_id)
      .eq('tenant_id', user.tenantId)
      .eq('status', 'open')
      .lt('created_at', cutoffDate)
      .order('created_at', { ascending: true });

    if (rfiError) {
      return NextResponse.json({ error: 'Failed to query RFIs', details: rfiError.message }, { status: 500 });
    }

    // Find RFIs past their due date
    const today = new Date().toISOString().split('T')[0];
    const { data: pastDueRfis } = await db
      .from('rfis')
      .select('id, rfi_number, subject, status, due_date, assigned_to, created_at')
      .eq('project_id', project_id)
      .eq('tenant_id', user.tenantId)
      .eq('status', 'open')
      .lt('due_date', today);

    const allOverdue = overdueRfis || [];
    const allPastDue = pastDueRfis || [];

    // Combine and deduplicate
    const escalationIds = new Set<string>();
    const escalationItems: any[] = [];

    for (const rfi of [...allOverdue, ...allPastDue]) {
      if (!escalationIds.has(rfi.id)) {
        escalationIds.add(rfi.id);
        const createdAt = new Date(rfi.created_at);
        const hoursOpen = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
        const isPastDue = rfi.due_date && rfi.due_date < today;

        escalationItems.push({
          rfi_id: rfi.id,
          rfi_number: rfi.rfi_number,
          subject: rfi.subject,
          assigned_to: rfi.assigned_to,
          due_date: rfi.due_date,
          hours_open: Math.round(hoursOpen),
          past_due: isPastDue,
          severity: hoursOpen > 96 ? 'critical' : hoursOpen > 72 ? 'high' : 'medium',
        });
      }
    }

    // Create escalation records for items that don't already have one
    const createdEscalations: any[] = [];
    for (const item of escalationItems) {
      // Check if escalation already exists for this RFI
      const { data: existing } = await db
        .from('escalations')
        .select('id')
        .eq('tenant_id', user.tenantId)
        .eq('item_type', 'rfi')
        .eq('item_id', item.rfi_id)
        .eq('resolved', false)
        .limit(1);

      if (!existing || existing.length === 0) {
        const { data: escalation, error: escError } = await db
          .from('escalations')
          .insert({
            tenant_id: user.tenantId,
            project_id,
            item_type: 'rfi',
            item_id: item.rfi_id,
            severity: item.severity,
            reason: `RFI #${item.rfi_number} open for ${item.hours_open} hours${item.past_due ? ' (past due)' : ''}`,
            assigned_to: item.assigned_to,
            created_by: user.id,
            resolved: false,
          })
          .select()
          .single();

        if (!escError && escalation) {
          createdEscalations.push(escalation);
        }
      }
    }

    return NextResponse.json({
      overdue_rfis: escalationItems,
      total_overdue: escalationItems.length,
      new_escalations_created: createdEscalations.length,
      escalations: createdEscalations,
      threshold_hours: hoursThreshold,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
