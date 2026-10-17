/**
 * GET /api/company-tools — does this tenant actually use each company tool?
 *
 * Feeds lib/company-tools, which decides what the company rail shows. Answers
 * one question per tool: are there any records. Never returns rows.
 *
 * Cost: every query is `select('id', { count: 'exact', head: true })`, so the
 * database counts and sends no data. The client caches this for five minutes
 * (SWR, one key for the whole tenant), because "has this company ever used
 * Fleet" does not change between two clicks.
 *
 * A query that FAILS omits its field rather than reporting 0. Zero means
 * "nothing here, hide the tool"; a failed count must not be allowed to hide a
 * tool the tenant uses every day.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { receivableOnly } from '@/lib/invoice-direction';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const t = user.tenantId;
    const head = { count: 'exact' as const, head: true };

    // Written out rather than looped: the generated Supabase types key .from()
    // on a literal table-name union, so a (table: string) helper blows the
    // type checker's instantiation depth.
    const [
      fleet, time, takeoffs, network, radio, documents, dailyLogs, schedule,
      invoices, payApps, portals, autopilot, bidHistory, bidPackages,
      savedReports, people, subs, leads,
    ] = await Promise.all([
      db.from('vehicles').select('id', head).eq('tenant_id', t),
      db.from('time_entries').select('id', head).eq('tenant_id', t),
      db.from('takeoffs').select('id', head).eq('tenant_id', t),
      db.from('network_projects').select('id', head).eq('tenant_id', t),
      db.from('radio_channels').select('id', head).eq('tenant_id', t),
      /* `documents` is a vestigial table (id, user_id, title, content) with no
         tenant_id at all, so this counted nothing and errored on every call.
         The Documents page reads `generated_documents` — both /api/documents/list
         and /api/documents/library select from it, scoped by tenant_id. */
      db.from('generated_documents').select('id', head).eq('tenant_id', t),
      db.from('daily_logs').select('id', head).eq('tenant_id', t),
      db.from('schedule_tasks').select('id', head).eq('tenant_id', t),
      receivableOnly(db.from('invoices').select('id', head).eq('tenant_id', t)),
      db.from('pay_applications').select('id', head).eq('tenant_id', t),
      db.from('portal_client_sessions').select('id', head).eq('tenant_id', t),
      db.from('autopilot_alerts').select('id', head).eq('tenant_id', t),
      db.from('bid_history').select('id', head).eq('tenant_id', t),
      db.from('bid_packages').select('id', head).eq('tenant_id', t),
      db.from('saved_reports').select('id', head).eq('tenant_id', t),
      db.from('profiles').select('id', head).eq('tenant_id', t),
      db.from('subcontractors').select('id', head).eq('tenant_id', t),
      /* The Leads UI reads and writes `lead_pipeline`; nothing has ever written
         to `leads`. Counting `leads` pinned this signal at 0 forever, so the
         HAS_WORK rules for /app/leads and /app/customers could never fire. */
      db.from('lead_pipeline').select('id', head).eq('tenant_id', t),
    ]);

    /** A failed count is omitted, not zeroed — see the header. */
    const n = (r: { count: number | null; error: unknown }) =>
      r.error ? undefined : (r.count || 0);

    return NextResponse.json({
      signals: {
        fleet: n(fleet),
        time: n(time),
        takeoffs: n(takeoffs),
        network: n(network),
        radio: n(radio),
        documents: n(documents),
        dailyLogs: n(dailyLogs),
        schedule: n(schedule),
        invoices: n(invoices),
        payApps: n(payApps),
        portals: n(portals),
        autopilot: n(autopilot),
        bidHistory: n(bidHistory),
        bidPackages: n(bidPackages),
        savedReports: n(savedReports),
        people: n(people),
        subs: n(subs),
        leads: n(leads),
      },
    });
  } catch (e) {
    return apiError('company-tools', e, 'Could not check which tools are in use');
  }
}
