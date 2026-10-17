/**
 * A job's tools, counted — the numbers beside each tool on the job page
 * (app/app/projects/[projectId]/overview, served by
 * GET /api/projects/[projectId]/tools).
 *
 * One cheap query per number: `head: true, count: 'exact'` wherever a count is
 * all that is needed, a few narrow columns where the job page has to say
 * something more ("2 close Oct 20", "1 COI expired"). Every query carries the
 * tenant AND the project; the route has already proved the job is the
 * caller's.
 *
 * Each tool settles on its own. A count whose query fails comes back null —
 * the page shows "—" for that one tool — and is logged with the tool's name.
 * One broken table never blanks the page, and a failure is never shown as 0.
 *
 * Status vocabularies are the ones the app writes (see lib/project-lifecycle
 * and the list routes each tool page reads), not invented here.
 */
import { bidAmount } from './bid-amount';
import { inviteState } from './bid-invite-state';
import { receivableOnly } from './invoice-direction';

/** The bid packages on a job, rolled up for the tool row and the brief. */
export interface BidPackagesSummary {
  total: number;
  /** Not awarded and not closed — still being priced. */
  open: number;
  /** Earliest due date (job-local day, 'YYYY-MM-DD') on or after today among open packages. */
  nextDue: string | null;
  /** The open packages due on `nextDue`, rolled up: what "Bids close Oct 20" is about. */
  dueNext: { count: number; invited: number; responded: number; lowTotal: number; lowCount: number } | null;
  /** Open packages whose due date has passed. */
  pastDue: number;
  /** Open packages with no due date. */
  noDue: number;
  /** Open packages nobody has been invited to. */
  notInvited: number;
}

export interface UpcomingInspection { id: string; type: string; date: string; inspector: string | null }

export interface JobTools {
  bidPackages: BidPackagesSummary | null;
  takeoffs: number | null;
  drawings: number | null;
  specs: number | null;
  rfis: { open: number; overdue: number } | null;
  submittals: { total: number; open: number } | null;
  /** `last` is the most recent log on or before today. */
  dailyLogs: { total: number; last: string | null } | null;
  photos: number | null;
  schedule: { total: number; late: number } | null;
  budget: number | null;
  payApps: { total: number; paid: number; draft: number; billed: number } | null;
  changeOrders: { total: number; pending: number } | null;
  punch: { total: number; open: number } | null;
  inspections: { total: number; upcoming: UpcomingInspection[] } | null;
  permits: number | null;
  safety: number | null;
  team: number | null;
  directory: number | null;
  files: number | null;
  /** Subs on the job and their certificates: expired = every COI lapsed, missing = none on file. */
  compliance: { subs: number; expired: number; missing: number } | null;
  lienWaivers: { total: number; pending: number } | null;
  proposals: number | null;
  contracts: number | null;
  purchaseOrders: number | null;
  invoices: number | null;
  bills: number | null;
  /** Open to-dos. */
  todos: number | null;
  tmTickets: number | null;
  crews: number | null;
  selections: number | null;
  /** Active Autopilot alerts. */
  alerts: number | null;
}

export type ToolKey = keyof JobTools;

/** The header the tool route sends with the counts, so the page can paint before the heavier aggregate. */
export interface JobHead {
  id: string;
  name: string | null;
  status: string | null;
  phase: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface JobToolsResponse { project: JobHead; today: string; tools: JobTools }

/* ── Vocabularies (what the app writes) ─────────────────────────────────── */

/** RFIs that still need an answer: everything but answered / closed (lib/project-lifecycle RFI_DONE). */
const RFI_DONE = '(answered,closed)';
/** Submittals no longer waiting on anyone. */
const SUBMITTAL_DONE = '(approved,approved_as_noted,closed,rejected,void,voided)';
/** Punch items needing no further work (lib/project-lifecycle PUNCH_DONE). */
const PUNCH_DONE = '(completed,voided)';
/** Schedule tasks that are finished — the app writes both spellings. */
const TASK_DONE = '(complete,completed)';
/** A finished to-do: /api/todos/[id]/complete writes 'Complete'. */
const TODO_DONE = '(Complete,complete,completed,done)';
/** Bid packages no longer being priced. */
const PACKAGE_CLOSED = ['awarded', 'closed', 'cancelled', 'canceled', 'void'];

/* ── Counting ──────────────────────────────────────────────────────────── */

type Db = { from: (table: string) => any };
type Res<T> = { data?: T | null; count?: number | null; error?: unknown };

async function n(q: PromiseLike<Res<unknown>>): Promise<number> {
  const r = await q;
  if (r.error) throw r.error;
  return r.count ?? 0;
}

async function rows<T>(q: PromiseLike<Res<T[]>>): Promise<T[]> {
  const r = await q;
  if (r.error) throw r.error;
  return (r.data ?? []) as T[];
}

const day = (v: unknown): string | null => {
  const s = String(v ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export async function countJobTools(
  db: Db,
  tenantId: string,
  projectId: string,
  today: string,
  log: (msg: string, e: unknown) => void = (msg, e) => console.error(msg, e),
): Promise<JobTools> {
  /** This job's rows of `table`, for the caller's company only. */
  const scope = (table: string, cols = 'id', opts?: { count: 'exact'; head: true }) =>
    db.from(table).select(cols, opts).eq('tenant_id', tenantId).eq('project_id', projectId);
  const head = (table: string) => scope(table, 'id', { count: 'exact', head: true });
  const settle = async <T,>(key: ToolKey, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (e) {
      log(`[job-tools] ${key} failed for project ${projectId}`, e);
      return null;
    }
  };

  const [
    bidPackages, takeoffs, drawings, specs, rfis, submittals, dailyLogs, photos, schedule, budget,
    payApps, changeOrders, punch, inspections, permits, safety, team, directory, files, compliance,
    lienWaivers, proposals, contracts, purchaseOrders, invoices, bills, todos, tmTickets, crews,
    selections, alerts,
  ] = await Promise.all([
    settle('bidPackages', () => bidPackagesSummary(db, tenantId, projectId, today)),
    settle('takeoffs', () => n(head('takeoffs').is('deleted_at', null))),
    settle('drawings', () => n(head('drawings').is('deleted_at', null))),
    settle('specs', () => n(head('specifications'))),
    settle('rfis', async () => {
      const open = () => head('rfis').is('deleted_at', null).not('status', 'in', RFI_DONE);
      const [o, late] = await Promise.all([n(open()), n(open().lt('due_date', today))]);
      return { open: o, overdue: late };
    }),
    settle('submittals', async () => {
      const [total, open] = await Promise.all([
        n(head('submittals').is('deleted_at', null)),
        n(head('submittals').is('deleted_at', null).not('status', 'in', SUBMITTAL_DONE)),
      ]);
      return { total, open };
    }),
    settle('dailyLogs', async () => {
      const [total, latest] = await Promise.all([
        n(head('daily_logs').is('deleted_at', null)),
        rows<{ log_date: string | null }>(
          scope('daily_logs', 'log_date').is('deleted_at', null).lte('log_date', today)
            .order('log_date', { ascending: false }).limit(1),
        ),
      ]);
      return { total, last: day(latest[0]?.log_date) };
    }),
    settle('photos', async () => {
      /* The photo page shows the photos table AND the job's image/video files
         (/api/photos/list?include=files) — count what it shows. */
      const [p, f] = await Promise.all([
        n(head('photos').is('deleted_at', null)),
        n(head('project_files').is('deleted_at', null).in('kind', ['image', 'video'])),
      ]);
      return p + f;
    }),
    settle('schedule', async () => {
      const [total, late] = await Promise.all([
        n(head('schedule_tasks')),
        n(head('schedule_tasks').lt('end_date', today).not('status', 'in', TASK_DONE)),
      ]);
      return { total, late };
    }),
    settle('budget', () => n(head('budget_lines'))),
    settle('payApps', async () => {
      const live = () => head('pay_applications').is('deleted_at', null);
      const [total, paid, draft, latest] = await Promise.all([
        n(live()),
        n(live().eq('status', 'paid')),
        n(live().eq('status', 'draft')),
        rows<{ total_completed_stored: unknown }>(
          scope('pay_applications', 'total_completed_stored').is('deleted_at', null)
            .order('app_number', { ascending: false }).limit(1),
        ),
      ]);
      return { total, paid, draft, billed: Number(latest[0]?.total_completed_stored) || 0 };
    }),
    settle('changeOrders', async () => {
      const [total, pending] = await Promise.all([
        n(head('change_orders').is('deleted_at', null)),
        n(head('change_orders').is('deleted_at', null).eq('status', 'pending')),
      ]);
      return { total, pending };
    }),
    settle('punch', async () => {
      const [total, open] = await Promise.all([
        n(head('punch_list').is('deleted_at', null)),
        n(head('punch_list').is('deleted_at', null).not('status', 'in', PUNCH_DONE)),
      ]);
      return { total, open };
    }),
    settle('inspections', async () => {
      const [total, next] = await Promise.all([
        n(head('inspections')),
        rows<{ id: string; inspection_type: string | null; scheduled_date: string | null; inspector: string | null; inspector_name: string | null }>(
          scope('inspections', 'id, inspection_type, scheduled_date, inspector, inspector_name')
            .eq('status', 'scheduled').gte('scheduled_date', today)
            .order('scheduled_date', { ascending: true }).limit(5),
        ),
      ]);
      const upcoming = next
        .map((r) => ({ id: String(r.id), type: String(r.inspection_type || 'Inspection'), date: day(r.scheduled_date) || '', inspector: (r.inspector_name || r.inspector || '').trim() || null }))
        .filter((r) => r.date);
      return { total, upcoming };
    }),
    settle('permits', () => n(head('permits'))),
    settle('safety', () => n(head('safety_incidents').is('deleted_at', null))),
    settle('team', () => n(head('project_team'))),
    settle('directory', () => n(head('contacts'))),
    settle('files', () => n(head('project_files').is('deleted_at', null))),
    settle('compliance', async () => {
      /* A sub belongs to the company; the job link is project_subcontractors
         (the same join /api/compliance scores from). */
      const assigned = await rows<{ subcontractor_id: string | null }>(scope('project_subcontractors', 'subcontractor_id'));
      const ids = Array.from(new Set(assigned.map((a) => a.subcontractor_id).filter((x): x is string => !!x)));
      if (!ids.length) return { subs: 0, expired: 0, missing: 0 };
      const certs = await rows<{ sub_id: string | null; expiry_date: string | null }>(
        db.from('insurance_certificates').select('sub_id, expiry_date').eq('tenant_id', tenantId).in('sub_id', ids),
      );
      const latest = new Map<string, string>();
      const held = new Set<string>();
      for (const c of certs) {
        if (!c.sub_id) continue;
        held.add(c.sub_id);
        const d = day(c.expiry_date);
        if (d && (!latest.has(c.sub_id) || d > (latest.get(c.sub_id) as string))) latest.set(c.sub_id, d);
      }
      let expired = 0;
      let missing = 0;
      for (const id of ids) {
        if (!held.has(id)) { missing++; continue; }
        const d = latest.get(id);
        if (d && d < today) expired++;
      }
      return { subs: ids.length, expired, missing };
    }),
    settle('lienWaivers', async () => {
      const [total, pending] = await Promise.all([
        n(head('lien_waivers').is('deleted_at', null)),
        n(head('lien_waivers').is('deleted_at', null).eq('status', 'pending')),
      ]);
      return { total, pending };
    }),
    settle('proposals', () => n(head('proposals'))),
    settle('contracts', () => n(head('contracts'))),
    settle('purchaseOrders', () => n(head('purchase_orders'))),
    settle('invoices', () => n(receivableOnly(head('invoices')))), // Client Invoices: owner billing only
    settle('bills', () => n(head('bills'))),
    settle('todos', () => n(head('project_todos').not('status', 'in', TODO_DONE))),
    settle('tmTickets', () => n(head('tm_tickets'))),
    settle('crews', () => n(head('crews').is('deleted_at', null))),
    settle('selections', () => n(head('selections'))),
    settle('alerts', () => n(head('autopilot_alerts').eq('status', 'active'))),
  ]);

  return {
    bidPackages, takeoffs, drawings, specs, rfis, submittals, dailyLogs, photos, schedule, budget,
    payApps, changeOrders, punch, inspections, permits, safety, team, directory, files, compliance,
    lienWaivers, proposals, contracts, purchaseOrders, invoices, bills, todos, tmTickets, crews,
    selections, alerts,
  };
}

/** Bid packages + their invites and bids, rolled up. Three narrow reads. */
async function bidPackagesSummary(db: Db, tenantId: string, projectId: string, today: string): Promise<BidPackagesSummary> {
  const pkgs = await rows<{ id: string; status: string | null; due_date: string | null; bid_due_date: string | null }>(
    db.from('bid_packages').select('id, status, due_date, bid_due_date')
      .eq('tenant_id', tenantId).eq('project_id', projectId).is('deleted_at', null),
  );
  const open = pkgs.filter((p) => !PACKAGE_CLOSED.includes(String(p.status || '').toLowerCase()));
  const ids = open.map((p) => p.id);
  const [invites, bids] = ids.length
    ? await Promise.all([
        rows<{ bid_package_id: string; status: string | null; response_status: string | null }>(
          db.from('bid_package_invites').select('bid_package_id, status, response_status').eq('tenant_id', tenantId).in('bid_package_id', ids),
        ),
        rows<{ bid_package_id: string; status: string | null; base_amount: unknown; amount: unknown; base_bid: unknown }>(
          db.from('bid_submissions').select('bid_package_id, status, base_amount, amount, base_bid').eq('tenant_id', tenantId).in('bid_package_id', ids),
        ),
      ])
    : [[], []];

  /* Same rules as /api/bid-packages/list: a revoked link is not an invitation,
     a withdrawn bid is not a bid, and the price is lib/bid-amount's. */
  const invited = new Map<string, number>();
  for (const i of invites) if (inviteState(i) !== 'revoked') invited.set(i.bid_package_id, (invited.get(i.bid_package_id) || 0) + 1);
  const responded = new Map<string, number>();
  const low = new Map<string, number>();
  for (const b of bids) {
    if (String(b.status || '').toLowerCase() === 'withdrawn') continue;
    responded.set(b.bid_package_id, (responded.get(b.bid_package_id) || 0) + 1);
    const amt = bidAmount(b);
    if (amt > 0 && (!low.has(b.bid_package_id) || amt < (low.get(b.bid_package_id) as number))) low.set(b.bid_package_id, amt);
  }

  const due = (p: { due_date: string | null; bid_due_date: string | null }) => day(p.due_date) || day(p.bid_due_date);
  const upcoming = open.map(due).filter((d): d is string => !!d && d >= today).sort();
  const nextDue = upcoming[0] ?? null;
  const onNext = nextDue ? open.filter((p) => due(p) === nextDue) : [];
  const dueNext = nextDue
    ? {
        count: onNext.length,
        invited: onNext.reduce((s, p) => s + (invited.get(p.id) || 0), 0),
        responded: onNext.reduce((s, p) => s + (responded.get(p.id) || 0), 0),
        lowTotal: onNext.reduce((s, p) => s + (low.get(p.id) || 0), 0),
        lowCount: onNext.filter((p) => low.has(p.id)).length,
      }
    : null;

  return {
    total: pkgs.length,
    open: open.length,
    nextDue,
    dueNext,
    pastDue: open.filter((p) => { const d = due(p); return !!d && d < today; }).length,
    noDue: open.filter((p) => !due(p)).length,
    notInvited: open.filter((p) => !invited.get(p.id)).length,
  };
}
