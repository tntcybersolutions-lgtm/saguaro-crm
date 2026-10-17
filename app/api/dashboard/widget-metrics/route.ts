import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { signUrl } from '@/lib/storage-signing';
import { addDays, requestDay } from '@/lib/time-zone';
import { apiError } from '@/lib/api-error';
import { liveJobs } from '@/lib/live-jobs';
import { getEffectivePermissions, hasPermission, type PermCategory } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/widget-metrics
 * Live, tenant-scoped metrics powering the home-dashboard widgets and the
 * dashboard-config builder previews. Every widget is computed from real tables
 * and independently guarded — one failing query degrades that widget to a
 * neutral value instead of 500ing the whole snapshot. No mock data.
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ metrics: {} }, { status: 401 });

  const db = createServerClient();
  const t = user.tenantId;
  // Delayed / at-risk / due on the company's day (device, else company zone), not the server's.
  let today: string;
  try {
    ({ today } = await requestDay(req.headers, db, t, 'dashboard/widget-metrics'));
  } catch (e) {
    return apiError('dashboard/widget-metrics', e, "Couldn't load the dashboard.");
  }
  const in7 = addDays(today, 7);

  /* The widgets a role may not see are not computed at all. Budget overview
     and the change-order summary are contract value, billings and CO dollars;
     /api/dashboard/stats already withheld those from anyone without the
     right, and this route — which feeds the same dashboard — served them to
     every signed-in user. Withheld widgets come back null and are named in
     `restricted`, so the card says why it is empty instead of "No data". */
  const perms = await getEffectivePermissions(db, user.id, t);
  const can = (c: PermCategory) => hasPermission(perms, c, 'View');
  const WIDGET_PERMISSION: Record<string, PermCategory> = {
    'budget-overview': 'Budget',
    'change-order-summary': 'Change Orders',
    'rfi-tracker': 'RFIs',
    'submittal-status': 'Submittals',
    'safety-metrics': 'Safety',
  };
  const restricted = Object.keys(WIDGET_PERMISSION).filter((w) => !can(WIDGET_PERMISSION[w]));
  const allowed = (w: string) => !restricted.includes(w);
  const skip = <T,>(w: string, fn: () => Promise<T>): (() => Promise<T | null>) =>
    allowed(w) ? fn : async () => null;

  const guard = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { return fallback; }
  };
  const sum = (rows: any[] | null, key: string) =>
    (rows || []).reduce((a, r) => a + (Number(r?.[key]) || 0), 0);

  const [
    projectSummary, budget, schedule, safety, rfi, submittal,
    changeOrder, deadlines, activity, photos, actions, weather,
  ] = await Promise.all([
    /* project-summary */
    guard(async () => {
      const { data } = await liveJobs(db.from('projects').select('status').eq('tenant_id', t));
      const rows = data || [];
      const has = (s: string) => rows.filter(r => (r.status || '') === s).length;
      return {
        active: has('active'),
        precon: has('precon') + has('preconstruction'),
        closeout: has('closeout') + has('completed') + has('complete'),
        onHold: has('on_hold') + has('hold') + has('on-hold'),
        total: rows.length,
      };
    }, { active: 0, precon: 0, closeout: 0, onHold: 0, total: 0 }),

    /* budget-overview */
    guard(skip('budget-overview', async () => {
      const [{ data: proj }, { data: pay }, { data: cos }] = await Promise.all([
        liveJobs(db.from('projects').select('contract_value').eq('tenant_id', t).eq('status', 'active')),
        db.from('pay_applications').select('current_payment_due').eq('tenant_id', t).in('status', ['submitted', 'approved']),
        db.from('change_orders').select('amount').eq('tenant_id', t).eq('status', 'approved'),
      ]);
      const b = sum(proj, 'contract_value');
      const billed = sum(pay, 'current_payment_due');
      const co = sum(cos, 'amount');
      return { budget: b, billed, changeOrders: co, remaining: Math.max(0, b - billed) };
    }), { budget: 0, billed: 0, changeOrders: 0, remaining: 0 }),

    /* schedule-status */
    guard(async () => {
      const { data } = await db.from('schedule_tasks').select('status, end_date').eq('tenant_id', t);
      const rows = data || [];
      const incomplete = (r: any) => (r.status || '') !== 'complete' && (r.status || '') !== 'completed';
      let delayed = 0, atRisk = 0;
      for (const r of rows) {
        if (!incomplete(r) || !r.end_date) continue;
        const d = String(r.end_date).slice(0, 10);
        if (d < today) delayed++;
        else if (d <= in7) atRisk++;
      }
      const total = rows.length;
      return { onTrack: Math.max(0, total - delayed - atRisk), atRisk, delayed, total };
    }, { onTrack: 0, atRisk: 0, delayed: 0, total: 0 }),

    /* safety-metrics */
    guard(skip('safety-metrics', async () => {
      const { data } = await db.from('safety_incidents')
        .select('incident_date, near_miss, osha_recordable').eq('tenant_id', t)
        .order('incident_date', { ascending: false });
      const rows = data || [];
      const nearMisses = rows.filter(r => r.near_miss === true).length;
      const recordable = rows.filter(r => r.osha_recordable === true).length;
      const last = rows.map(r => r.incident_date).filter(Boolean)[0];
      const daysSafe = last ? Math.max(0, Math.floor((Date.now() - new Date(last as string).getTime()) / 864e5)) : null;
      return { incidents: rows.length, nearMisses, recordable, daysSafe };
    }), { incidents: 0, nearMisses: 0, recordable: 0, daysSafe: null as number | null }),

    /* rfi-tracker */
    guard(skip('rfi-tracker', async () => {
      const { data } = await db.from('rfis').select('status, due_date').eq('tenant_id', t);
      const rows = data || [];
      const open = rows.filter(r => (r.status || '') === 'open').length;
      const overdue = rows.filter(r => (r.status || '') === 'open' && r.due_date && String(r.due_date).slice(0, 10) < today).length;
      const closed = rows.filter(r => ['closed', 'answered'].includes(r.status || '')).length;
      return { open, overdue, closed };
    }), { open: 0, overdue: 0, closed: 0 }),

    /* submittal-status */
    guard(skip('submittal-status', async () => {
      const { data } = await db.from('submittals').select('status').eq('tenant_id', t);
      const rows = data || [];
      const inSet = (...s: string[]) => rows.filter(r => s.includes(r.status || '')).length;
      return {
        pending: inSet('pending', 'submitted', 'under_review'),
        approved: inSet('approved', 'approved_as_noted'),
        rejected: inSet('rejected'),
        resubmit: inSet('resubmit', 'revise_and_resubmit'),
      };
    }), { pending: 0, approved: 0, rejected: 0, resubmit: 0 }),

    /* change-order-summary */
    guard(skip('change-order-summary', async () => {
      const { data } = await db.from('change_orders').select('status, amount').eq('tenant_id', t);
      const rows = data || [];
      const isApproved = (r: any) => (r.status || '') === 'approved';
      const isRejected = (r: any) => (r.status || '') === 'rejected';
      const pending = rows.filter(r => !isApproved(r) && !isRejected(r));
      return {
        pendingAmt: sum(pending, 'amount'),
        approvedAmt: sum(rows.filter(isApproved), 'amount'),
        rejectedAmt: sum(rows.filter(isRejected), 'amount'),
        pendingCount: pending.length,
      };
    }), { pendingAmt: 0, approvedAmt: 0, rejectedAmt: 0, pendingCount: 0 }),

    /* upcoming-deadlines (merge submittals + rfis + punch). Each source is
       read only for a role that may view its module (lib/items/registry:
       RFIs → RFIs, Submittals → Submittals, punch → Projects). It used to
       hand every signed-in user the titles of RFIs and submittals their role
       cannot open — the same leak the rfi-tracker and submittal-status
       widgets above were already closed against. */
    guard(async () => {
      const none = Promise.resolve({ data: [] as any[] });
      const [{ data: subs }, { data: rfis }, { data: punch }] = await Promise.all([
        can('Submittals')
          ? db.from('submittals').select('title, due_date').eq('tenant_id', t).gte('due_date', today).order('due_date', { ascending: true }).limit(6)
          : none,
        can('RFIs')
          ? db.from('rfis').select('subject, due_date').eq('tenant_id', t).gte('due_date', today).order('due_date', { ascending: true }).limit(6)
          : none,
        can('Projects')
          ? db.from('punch_list').select('description, due_date').eq('tenant_id', t).gte('due_date', today).order('due_date', { ascending: true }).limit(6)
          : none,
      ]);
      const merged = [
        ...(subs || []).map(r => ({ date: String(r.due_date), title: r.title || 'Submittal', type: 'Submittal' })),
        ...(rfis || []).map(r => ({ date: String(r.due_date), title: (r as any).subject || 'RFI', type: 'RFI' })),
        ...(punch || []).map(r => ({ date: String(r.due_date), title: (r as any).description || 'Punch item', type: 'Punch' })),
      ].filter(r => r.date && r.date !== 'null');
      merged.sort((a, b) => a.date.localeCompare(b.date));
      return merged.slice(0, 6);
    }, [] as { date: string; title: string; type: string }[]),

    /* team-activity */
    guard(async () => {
      const { data } = await db.from('activity_log')
        .select('user_name, action, description, created_at').eq('tenant_id', t)
        .order('created_at', { ascending: false }).limit(8);
      return (data || []).map(r => ({
        user: r.user_name || 'Someone',
        action: r.description || r.action || 'updated a record',
        at: r.created_at || '',
      }));
    }, [] as { user: string; action: string; at: string }[]),

    /* photo-feed */
    guard(async () => {
      const { data } = await db.from('photos')
        .select('url, caption, created_at').eq('tenant_id', t).not('url', 'is', null)
        .order('created_at', { ascending: false }).limit(9);
      // The photo bucket is private: hand the widget signed links, not the stored public ones.
      const recent = (await Promise.all((data || []).map(async r => ({ url: await signUrl(r.url as string), caption: r.caption ?? null }))))
        .filter(r => r.url);
      const { count } = await db.from('photos').select('id', { count: 'exact', head: true }).eq('tenant_id', t);
      return { count: count || recent.length, recent };
    }, { count: 0, recent: [] as { url: string; caption: string | null }[] }),

    /* action-items */
    guard(async () => {
      const { data } = await db.from('action_items')
        .select('title, description, priority, is_completed, status, due_date').eq('tenant_id', t)
        .neq('status', 'completed').order('due_date', { ascending: true, nullsFirst: false }).limit(10);
      return (data || [])
        .filter(r => r.is_completed !== true)
        .map(r => ({ text: r.title || r.description || 'Action item', priority: r.priority || '' }))
        .slice(0, 6);
    }, [] as { text: string; priority: string }[]),

    /* weather (location echo — no live feed server-side) */
    guard(async () => {
      const { data } = await liveJobs(db.from('projects').select('city, state').eq('tenant_id', t).eq('status', 'active')).limit(1);
      const p = (data || [])[0] as any;
      const location = p && (p.city || p.state) ? [p.city, p.state].filter(Boolean).join(', ') : null;
      return { location };
    }, { location: null as string | null }),
  ]);

  return NextResponse.json({
    restricted,
    metrics: {
      'project-summary': projectSummary,
      'budget-overview': budget,
      'schedule-status': schedule,
      'safety-metrics': safety,
      'rfi-tracker': rfi,
      'submittal-status': submittal,
      'change-order-summary': changeOrder,
      'upcoming-deadlines': deadlines,
      'team-activity': activity,
      'photo-feed': photos,
      'action-items': actions,
      'weather': weather,
    },
  });
}
