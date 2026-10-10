import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { invoiceStatus } from '@/lib/sub-invoice-status';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sub-portal/inbox[?projectId=]
 *
 * What subs sent in from their portal links, for the GC to act on:
 *   invoices   portal_sub_pay_apps (+ line items)
 *   rfis       portal_sub_rfis
 *   dailyLogs  portal_sub_daily_logs
 *   messages   portal_sub_messages (both directions — the GC's replies too)
 *   waivers    lien_waivers still waiting on a sub's signature
 * each with the sub's company and the job's name.
 *
 * Until now no GC screen read any of these tables: an invoice, RFI, log or
 * message a sub filed was saved and seen by nobody. Every query is pinned to
 * the caller's tenant; a failed read is an error, not an empty inbox.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const t = user.tenantId;
    const projectId = req.nextUrl.searchParams.get('projectId');
    if (projectId && !UUID.test(projectId)) return NextResponse.json({ error: 'projectId is not valid' }, { status: 400 });
    const onJob = <Q extends { eq: (c: string, v: string) => Q }>(q: Q): Q => (projectId ? q.eq('project_id', projectId) : q);

    const [inv, rfi, logs, msgs, lw] = await Promise.all([
      onJob(db.from('portal_sub_pay_apps').select('*').eq('tenant_id', t)).order('created_at', { ascending: false }).limit(200),
      onJob(db.from('portal_sub_rfis').select('*').eq('tenant_id', t)).order('created_at', { ascending: false }).limit(200),
      onJob(db.from('portal_sub_daily_logs').select('*').eq('tenant_id', t)).order('log_date', { ascending: false }).limit(200),
      onJob(db.from('portal_sub_messages').select('*').eq('tenant_id', t)).order('created_at', { ascending: true }).limit(500),
      // Waivers a sub still has to sign — they hold payment (blocks_payment).
      onJob(db.from('lien_waivers').select('id, sub_id, project_id, waiver_type, amount, through_date, status, created_at, pay_application_id')
        .eq('tenant_id', t).in('status', ['pending', 'sent', 'required']).not('sub_id', 'is', null).is('deleted_at', null))
        .order('created_at', { ascending: false }).limit(200),
    ]);
    for (const r of [inv, rfi, logs, msgs, lw]) if (r.error) throw r.error;

    const invoices = (inv.data || []) as Record<string, any>[];
    const rfis = (rfi.data || []) as Record<string, any>[];
    const dailyLogs = (logs.data || []) as Record<string, any>[];
    const messages = (msgs.data || []) as Record<string, any>[];
    const waivers = (lw.data || []) as Record<string, any>[];

    // Line items for the invoices (no tenant column — scoped through the invoice ids above).
    const invoiceIds = invoices.map((i) => i.id).filter(Boolean);
    let lines: Record<string, any>[] = [];
    if (invoiceIds.length) {
      const { data, error } = await db.from('portal_sub_pay_app_line_items').select('*').in('pay_app_id', invoiceIds);
      if (error) throw error;
      lines = (data || []) as Record<string, any>[];
    }

    // Names: the sub's company and the job.
    const subIds = [...new Set([...invoices, ...rfis, ...dailyLogs, ...messages, ...waivers].map((r) => r.sub_id).filter(Boolean))];
    const projIds = [...new Set([...invoices, ...rfis, ...dailyLogs, ...messages, ...waivers].map((r) => r.project_id).filter(Boolean))];
    const [subs, projs] = await Promise.all([
      subIds.length ? db.from('subcontractors').select('id, company_name, contact_name').eq('tenant_id', t).in('id', subIds) : Promise.resolve({ data: [], error: null }),
      projIds.length ? db.from('projects').select('id, name').eq('tenant_id', t).in('id', projIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (subs.error) throw subs.error;
    if (projs.error) throw projs.error;
    const subName = new Map(((subs.data || []) as Record<string, any>[]).map((s) => [s.id, s.company_name || s.contact_name || 'Subcontractor']));
    const projName = new Map(((projs.data || []) as Record<string, any>[]).map((p) => [p.id, p.name || 'Job']));
    const named = (r: Record<string, any>): Record<string, any> => ({ ...r, sub_name: subName.get(r.sub_id) || 'Subcontractor', project_name: projName.get(r.project_id) || 'Job' });

    const linesBy = new Map<string, Record<string, any>[]>();
    for (const l of lines) linesBy.set(l.pay_app_id, [...(linesBy.get(l.pay_app_id) || []), l]);

    const out = {
      invoices: invoices.map((i) => ({ ...named(i), status: invoiceStatus(i.status), lines: linesBy.get(i.id) || [] })),
      rfis: rfis.map(named),
      dailyLogs: dailyLogs.map(named),
      messages: messages.map(named),
      waivers: waivers.map(named),
    };
    return NextResponse.json({
      ...out,
      counts: {
        invoicesWaiting: out.invoices.filter((i) => i.status === 'submitted' || i.status === 'under_review').length,
        rfisOpen: out.rfis.filter((r) => !r.answer && r.status !== 'closed').length,
        messagesUnread: out.messages.filter((m) => m.sender_type === 'sub' && !m.read_at).length,
        waiversWaiting: out.waivers.length,
      },
    });
  } catch (e) {
    return apiError('sub-portal/inbox', e, "Couldn't load what your subs sent in.");
  }
}
