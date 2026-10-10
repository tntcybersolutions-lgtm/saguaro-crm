import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { getEffectivePermissions, hasPermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { addDays, requestDay } from '@/lib/time-zone';
import { daysUntilDay } from '@/lib/calendar-day';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ actions: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();
    const tenantId = user.tenantId;
    // "Today" is the company's day (device, else company zone) — the UTC day is tomorrow by 7 PM in Iowa.
    const { today } = await requestDay(req.headers, db, tenantId, 'dashboard/today');
    const in30 = addDays(today, 30);

    const actions: any[] = [];

    /* Pay apps and lien waivers are the money, and the rail already hides
       FINANCIAL from whoever may not see it. This list is read by the same
       dashboard, so it answers to the same permission. */
    const perms = await getEffectivePermissions(db, user.id, tenantId);
    const canPayApps = hasPermission(perms, 'Pay Apps', 'View');

    // Pending pay apps
    const { data: payApps } = canPayApps
      ? await db.from('pay_applications').select('*, projects(name)').eq('tenant_id', tenantId).in('status', ['submitted', 'approved']).limit(3)
      : { data: null };
    (payApps || []).forEach((pa: any) => {
      actions.push({
        type: 'pay-app',
        title: `Pay App #${pa.app_number} — ${pa.status === 'submitted' ? 'Awaiting Approval' : 'Awaiting Certification'}`,
        subtitle: `${pa.projects?.name} — ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(pa.current_payment_due || 0)}`,
        urgency: 'high',
        actionUrl: `/app/projects/${pa.project_id}/pay-apps`,
        actionLabel: 'Review',
      });
    });

    // Expiring insurance
    const { data: certs } = await db.from('subcontractor_insurance').select('*, subcontractors(company_name), projects(name, id)').eq('tenant_id', tenantId).lte('expiry_date', in30).gte('expiry_date', today).eq('status', 'active').limit(3);
    (certs || []).forEach((cert: any) => {
      // Whole calendar days from the company's today (a COI expiring today is 0, not -1 after 7 PM in Iowa).
      const days = daysUntilDay(cert.expiry_date, today) ?? 0;
      actions.push({
        type: 'insurance',
        title: `${cert.subcontractors?.company_name || 'Sub'} insurance expires in ${days} days`,
        subtitle: `${cert.policy_type} — ${cert.projects?.name}`,
        urgency: days <= 7 ? 'high' : 'medium',
        actionUrl: `/app/projects/${cert.projects?.id}/insurance`,
        actionLabel: 'Request Renewal',
      });
    });

    // Overdue RFIs
    const { data: rfis } = await db.from('rfis').select('*, projects(name, id)').eq('tenant_id', tenantId).eq('status', 'open').lt('due_date', today).limit(3);
    if ((rfis || []).length > 0) {
      actions.push({
        type: 'rfi',
        title: `${rfis!.length} overdue RFI${rfis!.length > 1 ? 's' : ''}`,
        subtitle: (rfis![0] as any).projects?.name || '',
        urgency: 'medium',
        actionUrl: `/app/projects/${(rfis![0] as any).project_id}/rfis`,
        actionLabel: 'View RFIs',
      });
    }

    /* UNSIGNED LIEN WAIVERS — tracked everywhere, surfaced nowhere.
       They gate payment (is_payment_gate / blocks_payment), the autopilot scan
       raises an alert for them and the compliance page counts them, and the one
       screen a GC actually opens each morning never mentioned them.

       `status = 'pending'` is the definition the rest of the live code agrees
       on: every insert writes 'pending' and signing writes 'signed'. The two
       other phrasings in the codebase — `<> 'signed'` and `signed_at IS NULL` —
       return the same count today, but would also count a rejected waiver as
       outstanding if a rejection status is ever introduced, which the
       rejected_at column anticipates. Counted, like the rest of the money,
       only for someone who may see it. */
    if (canPayApps) {
      const { data: waivers } = await db
        .from('lien_waivers')
        .select('id, project_id, claimant_name, amount, projects(name)')
        .eq('tenant_id', tenantId).eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(50);
      const pending = waivers || [];
      if (pending.length > 0) {
        const first: any = pending[0];
        actions.push({
          type: 'compliance',
          title: `${pending.length} lien waiver${pending.length > 1 ? 's' : ''} awaiting signature`,
          subtitle: pending.length === 1
            ? `${first.claimant_name || 'Claimant'} — ${first.projects?.name || ''}`.trim()
            : `${first.claimant_name || 'Claimant'} and ${pending.length - 1} more`,
          urgency: 'medium',
          actionUrl: `/app/projects/${first.project_id}/lien-waivers`,
          actionLabel: 'Review Waivers',
        });
      }
    }

    // Missing W9s
    const { data: w9s } = await db.from('w9_requests').select('*, projects(name, id)').eq('tenant_id', tenantId).eq('status', 'pending').limit(2);
    (w9s || []).forEach((w: any) => {
      actions.push({
        type: 'compliance',
        title: `W-9 missing for ${w.vendor_name}`,
        subtitle: w.projects?.name || '',
        urgency: 'medium',
        actionUrl: `/app/projects/${w.projects?.id}/w9`,
        actionLabel: 'Send Request',
      });
    });

    return NextResponse.json({ actions, source: 'live' });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no actions" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('dashboard/today', e, 'Could not load your action list');
  }
}
