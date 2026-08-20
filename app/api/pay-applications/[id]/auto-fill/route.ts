import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();

    // 1. Load pay application
    const { data: payApp, error: paErr } = await db
      .from('pay_applications')
      .select('id, project_id, tenant_id, retainage_percent')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (paErr || !payApp) {
      return NextResponse.json({ error: 'Pay application not found' }, { status: 404 });
    }

    // 2. Load all SOV line items for this pay app
    const { data: sovItems, error: sovErr } = await db
      .from('sov_line_items')
      .select('*')
      .eq('pay_application_id', id)
      .eq('tenant_id', user.tenantId)
      .order('sort_order', { ascending: true });

    if (sovErr) throw sovErr;
    if (!sovItems || sovItems.length === 0) {
      return NextResponse.json({ error: 'No SOV line items found for this pay application' }, { status: 404 });
    }

    // 3. Load punch list items for this project grouped by trade/division
    const { data: punchItems } = await db
      .from('punch_list')
      .select('id, trade, status')
      .eq('project_id', payApp.project_id)
      .eq('tenant_id', user.tenantId);

    // Build trade -> completion map from punch list
    const punchByTrade: Record<string, { total: number; closed: number }> = {};
    if (punchItems) {
      for (const item of punchItems) {
        const key = (item.trade || 'general').toLowerCase();
        if (!punchByTrade[key]) punchByTrade[key] = { total: 0, closed: 0 };
        punchByTrade[key].total++;
        if (item.status === 'closed' || item.status === 'completed' || item.status === 'verified') {
          punchByTrade[key].closed++;
        }
      }
    }

    // 4. Load daily logs for overall project progress estimate
    const { data: dailyLogs } = await db
      .from('daily_logs')
      .select('id')
      .eq('project_id', payApp.project_id)
      .eq('tenant_id', user.tenantId);

    const logCount = dailyLogs?.length || 0;

    // 5. Calculate pct_complete for each SOV line
    let linesUpdated = 0;
    let totalCompleted = 0;
    let totalScheduled = 0;

    for (const sov of sovItems) {
      const scheduled = sov.scheduled_value || 0;
      totalScheduled += scheduled;
      if (scheduled === 0) continue;

      let pctComplete = sov.pct_complete || 0;
      let method = 'existing';

      // Try to match by CSI division or description trade match
      const desc = (sov.description || '').toLowerCase();
      const division = sov.csi_division || '';

      // Check punch list for matching trade
      let matchedTrade: { total: number; closed: number } | null = null;
      for (const [trade, data] of Object.entries(punchByTrade)) {
        if (desc.includes(trade) || trade.includes(desc.split(' ')[0])) {
          matchedTrade = data;
          break;
        }
      }

      if (matchedTrade && matchedTrade.total >= 2) {
        // Punch list method: if all items closed = ~95%, scale linearly
        const punchPct = Math.round((matchedTrade.closed / matchedTrade.total) * 95);
        if (punchPct > pctComplete) {
          pctComplete = punchPct;
          method = 'punch_list';
        }
      } else if (logCount > 0 && pctComplete === 0) {
        // Fallback: estimate from project activity (very rough)
        // More daily logs = more project progress, cap at 50%
        const activityPct = Math.min(Math.round(logCount * 3), 50);
        pctComplete = activityPct;
        method = 'activity_estimate';
      }

      // Calculate period values
      const completedToDate = Math.round(scheduled * (pctComplete / 100));
      const workFromPrevious = sov.work_from_previous || 0;
      const materialsStored = sov.materials_presently_stored || 0;
      const workThisPeriod = Math.max(0, completedToDate - workFromPrevious - materialsStored);
      const totalCompletedStored = completedToDate + materialsStored;
      const balanceToFinish = Math.max(0, scheduled - totalCompletedStored);
      const retainage = Math.round(totalCompletedStored * ((payApp.retainage_percent || 10) / 100));

      // Update SOV line
      const { error: updateErr } = await db
        .from('sov_line_items')
        .update({
          pct_complete: pctComplete,
          work_this_period: workThisPeriod,
          total_completed_stored: totalCompletedStored,
          balance_to_finish: balanceToFinish,
          retainage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sov.id)
        .eq('tenant_id', user.tenantId);

      if (!updateErr) {
        linesUpdated++;
        totalCompleted += totalCompletedStored;
      }
    }

    // 6. Calculate overall percentage
    const overallPct = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;

    // 7. Update pay application totals
    await db.from('pay_applications')
      .update({
        total_completed_stored: totalCompleted,
        percent_complete: overallPct,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    // Determine confidence
    const hasPunchData = Object.keys(punchByTrade).length > 0;
    const confidence = hasPunchData ? 'medium' : logCount > 5 ? 'low' : 'low';
    const notes = hasPunchData
      ? `Calculated from ${Object.keys(punchByTrade).length} trade(s) in punch list + ${logCount} daily logs`
      : logCount > 0
        ? `Estimated from ${logCount} daily log entries (no punch list data available)`
        : 'No project data available — values unchanged';

    return NextResponse.json({
      data: {
        lines_updated: linesUpdated,
        total_completed: totalCompleted,
        overall_pct: overallPct,
        confidence,
        notes,
        punch_trades: Object.keys(punchByTrade).length,
        daily_log_count: logCount,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
