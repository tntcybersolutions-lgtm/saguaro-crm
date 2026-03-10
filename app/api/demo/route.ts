/**
 * GET /api/demo
 * Returns all demo data for preview mode.
 * Disabled in production.
 */
import { NextResponse } from 'next/server';
import { isDemoMode, DEMO_PROJECT, DEMO_SUBS, DEMO_PAY_APPS, DEMO_RFIS, DEMO_CHANGE_ORDERS, DEMO_BUDGET_LINES, DEMO_AUTOPILOT_ALERTS, DEMO_CONTEXT } from '../../../demo-data';

export async function GET() {
  if (!isDemoMode()) {
    return NextResponse.json({ error: 'Demo mode not enabled' }, { status: 403 });
  }
  return NextResponse.json({
    mode: 'DEMO',
    project:        DEMO_PROJECT,
    subs:           DEMO_SUBS,
    payApplications: DEMO_PAY_APPS,
    rfis:           DEMO_RFIS,
    changeOrders:   DEMO_CHANGE_ORDERS,
    budgetLines:    DEMO_BUDGET_LINES,
    alerts:         DEMO_AUTOPILOT_ALERTS,
    context:        DEMO_CONTEXT,
    message:        'Running in demo mode. Connect real Supabase for full functionality.',
  });
}
