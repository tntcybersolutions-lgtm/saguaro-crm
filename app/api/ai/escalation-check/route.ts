import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

/* eslint-disable @typescript-eslint/no-explicit-any */

function severityFromDays(days: number): 'high' | 'medium' | 'low' {
  if (days >= 7) return 'high';
  if (days >= 3) return 'medium';
  return 'low';
}

// ─── GET: list escalations ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({
        escalations: [],
        summary: { total_open: 0, high_severity: 0, avg_days_overdue: 0 },
      }, { status: 200 });
    }

    const db = createServerClient();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id') || searchParams.get('projectId');

    let query = db
      .from('escalations')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ai/escalation-check] list error:', error.message);
      return NextResponse.json({
        escalations: [],
        summary: { total_open: 0, high_severity: 0, avg_days_overdue: 0 },
      }, { status: 200 });
    }

    const rows = data || [];
    const escalations = rows.map((e: any) => {
      const daysOverdue = e.days_overdue ?? 0;
      const resolved = e.status === 'resolved';
      return {
        id: e.id,
        item_type: e.item_type,
        item_id: e.item_id,
        item_title: e.reason || e.item_type || 'Escalation',
        days_overdue: daysOverdue,
        severity: severityFromDays(daysOverdue),
        escalated_to: e.escalated_to || '',
        created_at: e.created_at,
        resolved,
        resolved_at: e.resolved_at || undefined,
      };
    });

    const open = escalations.filter((e) => !e.resolved);
    const totalDays = open.reduce((sum, e) => sum + (e.days_overdue || 0), 0);
    const summary = {
      total_open: open.length,
      high_severity: open.filter((e) => e.severity === 'high').length,
      avg_days_overdue: open.length > 0 ? totalDays / open.length : 0,
    };

    return NextResponse.json({ escalations, summary });
  } catch (err: any) {
    console.error('[ai/escalation-check] GET', err);
    return NextResponse.json({
      escalations: [],
      summary: { total_open: 0, high_severity: 0, avg_days_overdue: 0 },
    }, { status: 200 });
  }
}

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
      return apiError('ai/escalation-check', rfiError, 'Failed to query RFIs');
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
        const createdAt = new Date(rfi.created_at!);
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
        .is('resolved_at', null)
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
    return apiError('ai/escalation-check', err, 'Internal server error');
  }
}
