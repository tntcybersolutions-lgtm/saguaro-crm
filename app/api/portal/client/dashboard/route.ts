import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getPortalSession, PORTAL_PERMS } from '@/lib/portal-auth';
import { signFields } from '@/lib/storage-signing';
import { apiError } from '@/lib/api-error';
import { contractMoney } from '@/lib/job-contract';
import { jobsiteWeather } from '@/lib/jobsite-weather';

/** GET — return project dashboard data */
export async function GET(req: NextRequest) {
  try {
    const session = await getPortalSession(req, PORTAL_PERMS.VIEW_PROJECT);
    if (!session) {
      return NextResponse.json({ error: 'Access denied — insufficient permissions' }, { status: 403 });
    }

    const db = createServerClient();
    const projectId = session.project_id;
    const tenantId = session.tenant_id;

    // Today's forecast at the job (NWS) — started now, read last. A slow
    // lookup never holds the owner's page past 5 s; it just shows no forecast.
    const weatherP = Promise.race([
      jobsiteWeather(db, tenantId, projectId),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    // Contract money — the same rule the GC's screens read (lib/job-contract).
    const { data: project } = await db
      .from('projects')
      .select('id, name, status, original_contract_amount, contract_amount, billed_to_date, start_date, end_date, percent_complete')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .single();
    const { data: prime } = await db
      .from('contracts')
      .select('original_amount, contract_amount, amount')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .eq('contract_type', 'prime')
      .limit(1)
      .maybeSingle();
    const { data: accepted } = await db
      .from('proposals')
      .select('amount, total_amount')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Schedule phases
    const { data: phases } = await db
      .from('schedule_phases')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true });

    // Recent photos
    const { data: photos } = await db
      .from('photos')
      .select('id, url, caption, category, taken_at, created_at')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(12);

    // Change orders — every one, so the pending / approved counts and the
    // contract's approved changes are whole (a 10-row cap undercounted both).
    const { data: changeOrders } = await db
      .from('change_orders')
      .select('id, title, status, amount, cost_impact, created_at')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    const money = project ? contractMoney({ project, prime, acceptedProposal: accepted, changeOrders }) : null;
    const billed = Number(project?.billed_to_date) || 0;
    const budgetSummary = project && money
      ? {
          contract_amount: money.original,
          budget: money.current,
          approved_changes: money.approvedChanges,
          approved_count: money.approvedCount,
          pending_changes: money.pendingChanges,
          pending_count: money.pendingCount,
          spent: billed,
          remaining: money.current - billed,
          percent_complete: project.percent_complete || 0,
        }
      : null;

    const w = await weatherP;
    const weather = w && w.available
      ? { conditions: w.conditions, high: w.highTemp, low: w.lowTemp, wind: w.wind, precipitation: w.precipitation }
      : null;

    return NextResponse.json({
      project: project
        ? {
            id: project.id,
            name: project.name,
            status: project.status,
            start_date: project.start_date,
            end_date: project.end_date,
          }
        : null,
      budget: budgetSummary,
      phases: phases || [],
      recentPhotos: await signFields(photos || [], ['url', 'thumbnail_url']),
      changeOrders: changeOrders || [],
      weather,
    });
  } catch (e) {
    return apiError('portal/client/dashboard', e, "Couldn't load your project. Please try again.");
  }
}
