import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { applyMarkupStack } from '@/lib/takeoff/engine';
import { requestDay } from '@/lib/time-zone';
import { apiError } from '@/lib/api-error';

/**
 * GET ?projectId= — the project intelligence snapshot every add/create screen
 * seeds from, in ONE round trip: contract money (original + approved COs =
 * revised), billed/paid to date, the prior record in each module, budget
 * rollups, the sub roster, bid packages, known vendors and cost codes, and
 * next document numbers. A create form should never ask the user to type what
 * this endpoint already knows.
 *
 * Every section is failure-tolerant: a broken sub-query nulls its section
 * instead of failing the whole snapshot.
 */
/** Pay-app statuses that mean the application left the building. */
const SENT_PAY_APP_STATUSES = ['submitted', 'under_review', 'in_review', 'certified', 'approved', 'paid'];

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  const db = g.db;
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const N = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0);
  const t = user.tenantId;
  const safe = async <T,>(p: PromiseLike<T>): Promise<T | null> => {
    try { return await p; } catch { return null; }
  };

  const [
    projectQ, contractsQ, cosQ, payAppsQ, budgetQ, subsQ, packagesQ,
    invoicesQ, billsQ, posQ, rfisQ, submittalsQ, tasksQ, logQ, takeoffsQ, contactsQ, punchQ, proposalsQ,
  ] = await Promise.all([
    safe(db.from('projects').select('id, name, color, status, address, project_number, owner_name, owner_email, architect_name, start_date, end_date, percent_complete, contract_amount, original_contract_amount, retainage_pct, phase, setup_step, setup_complete').eq('id', projectId).eq('tenant_id', t).single()),
    safe(db.from('contracts').select('id, contract_type, title, party_name, vendor_name, amount, contract_amount, original_amount, approved_changes, invoiced_amount, paid_amount, status, retainage_pct, trade').eq('project_id', projectId).eq('tenant_id', t)),
    safe(db.from('change_orders').select('id, co_number, title, status, cost_impact, amount').eq('project_id', projectId).eq('tenant_id', t)),
    safe(db.from('pay_applications').select('id, app_number, period_from, period_to, status, current_payment_due, total_completed_stored, retainage_percent, contract_sum').eq('project_id', projectId).eq('tenant_id', t).order('app_number', { ascending: false }).limit(12)),
    safe(db.from('budget_lines').select('id, division, cost_code, description, original_budget, committed, actual').eq('project_id', projectId).eq('tenant_id', t).order('cost_code')),
    safe(db.from('project_subcontractors').select('id, subcontractor_id, contract_amount, status, subcontractors(company_name, trade, email, contact_email)').eq('project_id', projectId).eq('tenant_id', t)),
    safe(db.from('bid_packages').select('id, name, trade, status, awarded_amount, awarded_to, budget_estimate, csi_division, csi_codes').eq('project_id', projectId).eq('tenant_id', t)),
    safe(db.from('invoices').select('id, total, amount, paid_amount, status, vendor_name, invoice_number').eq('project_id', projectId).eq('tenant_id', t)),
    safe(db.from('bills').select('id, total, amount, status, vendor_name').eq('project_id', projectId).eq('tenant_id', t)),
    safe(db.from('purchase_orders').select('id, total, status, vendor_name, po_number').eq('project_id', projectId).eq('tenant_id', t)),
    safe(db.from('rfis').select('id, status').eq('project_id', projectId).eq('tenant_id', t)),
    safe(db.from('submittals').select('id, status').eq('project_id', projectId).eq('tenant_id', t)),
    safe(db.from('schedule_tasks').select('id, name, start_date, end_date, status, is_critical, pct_complete, trade').eq('project_id', projectId).eq('tenant_id', t).order('start_date').limit(200)),
    safe(db.from('daily_logs').select('log_date').eq('project_id', projectId).eq('tenant_id', t).order('log_date', { ascending: false }).limit(60)),
    safe(db.from('takeoffs').select('id, status, total_cost, contingency_pct, page_count').eq('project_id', projectId).eq('tenant_id', t).order('created_at', { ascending: false }).limit(5)),
    safe(db.from('contacts').select('id').eq('project_id', projectId).eq('tenant_id', t)),
    /* COUNT THE PUNCH LIST, DO NOT ASK THE PROJECT ROW.
       openPunch used to read projects.open_punch_count, a denormalised
       column that NOTHING in this codebase ever writes — no trigger, no
       app code, nothing. It sat at 0 forever. Measured on production: a
       project with 3 open punch items reported open_punch_count = 0.

       That number drives the closeout screen's "Open Punch" card and its
       Path to Handover, so the screen told a GC "Punch list is clear —
       schedule the final inspection" while three items were open. On a
       closeout screen that is not a cosmetic defect.

       head:true, so this counts without pulling rows. The status list
       matches lib/project-lifecycle.ts. */
    safe(db.from('punch_list').select('id', { count: 'exact', head: true })
      .eq('project_id', projectId).eq('tenant_id', t)
      .not('status', 'in', '(completed,voided)')),
    /* Proposal versions — an ACCEPTED version is the contract. Projects
       accepted before /api/proposals/[id]/status started writing the project's
       contract columns still carry $0 there, so originalContract falls back to
       the accepted amount instead of reading $0 next to an accepted $2.4M. */
    safe(db.from('proposals').select('id, proposal_number, status, amount, total_amount, created_at').eq('project_id', projectId).eq('tenant_id', t).order('created_at', { ascending: true })),
  ]);

  const p = (projectQ as any)?.data ?? null;
  if (!p) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const contracts = ((contractsQ as any)?.data ?? []) as any[];
  const cos       = ((cosQ as any)?.data ?? []) as any[];
  const payApps   = ((payAppsQ as any)?.data ?? []) as any[];
  const budget    = ((budgetQ as any)?.data ?? []) as any[];
  const subRows   = ((subsQ as any)?.data ?? []) as any[];
  const packages  = ((packagesQ as any)?.data ?? []) as any[];
  const invoices  = ((invoicesQ as any)?.data ?? []) as any[];
  const bills     = ((billsQ as any)?.data ?? []) as any[];
  const pos       = ((posQ as any)?.data ?? []) as any[];
  const rfis      = ((rfisQ as any)?.data ?? []) as any[];
  const subm      = ((submittalsQ as any)?.data ?? []) as any[];
  const tasks     = ((tasksQ as any)?.data ?? []) as any[];
  const logRows   = ((logQ as any)?.data ?? []) as Array<{ log_date: string | null }>;
  const lastLog   = logRows[0] ?? null;
  /* Distinct days with a daily log (of the most recent 60 logs). "Run the
     field" is a sustained habit, not one entry — see lib/project-phase. */
  const dailyLogDays = new Set(logRows.map((r) => String(r.log_date ?? '').slice(0, 10)).filter(Boolean)).size;

  /* Bid invites per package. A package that exists but was never sent to a
     single sub has not been "sent" — the journey's bid-packages step reads
     this, not the package count. One follow-up query, keyed on the package
     ids already loaded; failure leaves every count at 0 (step unticked). */
  const invitesByPackage: Record<string, number> = {};
  if (packages.length) {
    const invQ = await safe(db.from('bid_package_invites').select('bid_package_id')
      .eq('tenant_id', t).in('bid_package_id', packages.map((b) => b.id)));
    for (const r of (((invQ as any)?.data ?? []) as Array<{ bid_package_id: string }>)) {
      invitesByPackage[r.bid_package_id] = (invitesByPackage[r.bid_package_id] || 0) + 1;
    }
  }

  // ── Contract money: original + approved COs = revised ──
  const prime = contracts.find((c) => c.contract_type === 'prime') ?? null;
  const proposals = ((proposalsQ as any)?.data ?? []) as Array<{ id: string; proposal_number: string | null; status: string | null; amount: unknown; total_amount: unknown }>;
  const propAmount = (r: { amount: unknown; total_amount: unknown }) => N(r.amount) || N(r.total_amount);
  const acceptedProposal = [...proposals].reverse().find((r) => String(r.status || '').toLowerCase() === 'accepted') ?? null;
  const latestProposal = proposals.length ? proposals[proposals.length - 1] : null;
  const originalContract =
    N(p.original_contract_amount) ||
    (prime ? N(prime.original_amount) || N(prime.contract_amount) || N(prime.amount) : 0) ||
    N(p.contract_amount) ||
    (acceptedProposal ? propAmount(acceptedProposal) : 0);
  const approvedCos = cos.filter((c) => c.status === 'approved');
  const coAmount = (c: any) => N(c.cost_impact) || N(c.amount);
  const approvedCoTotal = approvedCos.reduce((s, c) => s + coAmount(c), 0);
  const lastPayApp = payApps[0] ?? null;
  const billedToDate = lastPayApp ? N(lastPayApp.total_completed_stored) : 0;
  const paidToDate = payApps.filter((a) => a.status === 'paid').reduce((s, a) => s + N(a.current_payment_due), 0);

  const openStatuses = ['open', 'pending', 'submitted', 'in_review', 'draft'];
  const vendorNames = Array.from(new Set(
    [...invoices, ...bills, ...pos].map((r) => r.vendor_name).filter(Boolean)
  )).sort() as string[];
  // Upcoming on the company's day (device, else company zone), not the server's.
  let today: string;
  try {
    ({ today } = await requestDay(req.headers, db, t, 'project-context'));
  } catch (e) {
    return apiError('project-context', e, "Couldn't load this job.");
  }
  const upcoming = tasks.filter((tk) => (tk.end_date ?? tk.start_date ?? '') >= today && tk.status !== 'complete');

  const res = NextResponse.json({
    project: {
      id: p.id, name: p.name, status: p.status, address: p.address,
      projectNumber: p.project_number, ownerName: p.owner_name, ownerEmail: p.owner_email,
      architectName: p.architect_name, startDate: p.start_date, endDate: p.end_date,
      percentComplete: N(p.percent_complete), setupStep: p.setup_step, setupComplete: p.setup_complete,
      /* Chasing it or building it — drives which journey the overview
         teaches and which nav sections lead. Without this the client falls
         back to 'bidding' for every project, which is how a phase feature
         ships looking like it works and is wrong on every won job. */
      phase: p.phase,
    },
    money: {
      originalContract,
      approvedCoTotal,
      approvedCoCount: approvedCos.length,
      pendingCoCount: cos.filter((c) => openStatuses.includes(c.status)).length,
      revisedContract: originalContract + approvedCoTotal,
      billedToDate,
      billedPct: originalContract + approvedCoTotal > 0 ? Math.round((billedToDate / (originalContract + approvedCoTotal)) * 1000) / 10 : 0,
      paidToDate,
      retainagePct: N(lastPayApp?.retainage_percent) || N(p.retainage_pct) || 10,
      payAppCount: payApps.length,
      /* Pay apps that actually went to the owner. A draft — including the
         $0 one auto-created when a job is won — is not billing anyone. */
      submittedPayAppCount: payApps.filter((a) => SENT_PAY_APP_STATUSES.includes(String(a.status ?? '').toLowerCase())).length,
      lastPayApp: lastPayApp ? {
        id: lastPayApp.id, appNumber: lastPayApp.app_number, periodFrom: lastPayApp.period_from,
        periodTo: lastPayApp.period_to, status: lastPayApp.status,
        currentPaymentDue: N(lastPayApp.current_payment_due), totalCompletedStored: N(lastPayApp.total_completed_stored),
      } : null,
    },
    /* Everyone on the job. The rail counts it so a GC can see at a glance
       whether the directory has been filled in or is still just the owner. */
    contactCount: (((contactsQ as any)?.data ?? []) as unknown[]).length,
    /* Has the plan set been priced? The journey step that produces the budget
       and the bid packages needs to know, and nothing else was reporting it. */
    takeoff: (() => {
      const rows = ((takeoffsQ as any)?.data ?? []) as Array<{ id: string; status: string; total_cost: unknown; contingency_pct: unknown; page_count: unknown }>;
      const done = rows.find((r) => r.status === 'complete') ?? null;
      const pricedTotal = N(done?.total_cost);
      /* The BID PRICE the takeoff screen headlines, computed the same way that
         screen does (app/app/projects/[projectId]/takeoff/page.tsx computedCosts):
         direct cost (material + labor) through the shared engine stack at the
         screen's defaults — overhead 10, profit 10, the analyzer's own
         contingency (clamped 0–25), everything else 0. The analyzer stores
         total_cost = direct × (1 + contingency), so direct is recovered from it;
         marking up total_cost itself would charge contingency twice. */
      const contPct = Math.min(25, Math.max(0, Math.round(N(done?.contingency_pct) || 10)));
      const directCost = pricedTotal > 0 ? pricedTotal / (1 + contPct / 100) : 0;
      const sellCents = directCost > 0
        ? applyMarkupStack({ materialCents: Math.round(directCost * 100), laborCents: 0 }, { overheadPct: 10, profitPct: 10, contingencyPct: contPct }).sellCents
        : 0;
      return {
        count: rows.length,
        completed: Boolean(done),
        latestId: done?.id ?? rows[0]?.id ?? null,
        pricedTotal,
        // Whole dollars — the takeoff screen shows it rounded, and it seeds a proposal amount.
        sellTotal: Math.round(sellCents / 100),
        sheets: N(done?.page_count),
      };
    })(),
    /* Proposal versions at a glance — what the proposal screen seeds from. */
    proposal: {
      count: proposals.length,
      accepted: acceptedProposal ? { id: acceptedProposal.id, version: acceptedProposal.proposal_number, amount: propAmount(acceptedProposal) } : null,
      latest: latestProposal ? { id: latestProposal.id, version: latestProposal.proposal_number, status: latestProposal.status, amount: propAmount(latestProposal) } : null,
    },
    budget: {
      original: budget.reduce((s, b) => s + N(b.original_budget), 0),
      committed: budget.reduce((s, b) => s + N(b.committed), 0),
      actual: budget.reduce((s, b) => s + N(b.actual), 0),
      lineCount: budget.length,
      lines: budget.map((b) => ({ id: b.id, division: b.division, costCode: b.cost_code, description: b.description, original: N(b.original_budget), committed: N(b.committed), actual: N(b.actual) })),
    },
    subs: subRows.map((r) => ({
      membershipId: r.id, id: r.subcontractor_id, contractAmount: N(r.contract_amount), status: r.status,
      companyName: (r.subcontractors as any)?.company_name ?? null,
      trade: (r.subcontractors as any)?.trade ?? null,
      email: (r.subcontractors as any)?.contact_email ?? (r.subcontractors as any)?.email ?? null,
    })),
    bidPackages: packages.map((b) => ({ id: b.id, name: b.name, trade: b.trade, status: b.status, awardedAmount: N(b.awarded_amount), awardedTo: b.awarded_to, invitedCount: invitesByPackage[b.id] || 0, budgetEstimate: N(b.budget_estimate), csiDivision: b.csi_division, csiCodes: b.csi_codes })),
    vendors: vendorNames,
    costCodes: budget.map((b) => ({ division: b.division, costCode: b.cost_code, description: b.description })),
    counts: {
      invoices: invoices.length,
      bills: bills.length,
      purchaseOrders: pos.length,
      openRfis: rfis.filter((r) => openStatuses.includes(r.status)).length,
      openSubmittals: subm.filter((s) => openStatuses.includes(s.status)).length,
      scheduleTasks: tasks.length,
      openPunch: N((punchQ as any)?.count),
    },
    schedule: {
      criticalCount: tasks.filter((tk) => tk.is_critical && tk.status !== 'complete').length,
      nextTasks: upcoming.slice(0, 3).map((tk) => ({ id: tk.id, name: tk.name, startDate: tk.start_date, endDate: tk.end_date, trade: tk.trade, pctComplete: N(tk.pct_complete) })),
    },
    recent: { lastDailyLogDate: lastLog?.log_date ?? null, dailyLogDays },
    defaults: {
      retainagePct: N(lastPayApp?.retainage_percent) || N(p.retainage_pct) || 10,
      nextPayAppNumber: payApps.reduce((m, a) => Math.max(m, N(a.app_number)), 0) + 1,
      nextCoNumber: cos.reduce((m, c) => Math.max(m, N(c.co_number)), 0) + 1,
      nextInvoiceNumber: invoices.length + 1,
      nextPoNumber: pos.length + 1,
      ownerName: p.owner_name, ownerEmail: p.owner_email, architectName: p.architect_name,
    },
  });
  // Speed contract: 30s private browser cache dedupes the 14-query aggregate
  // across module hops for every page that raw-fetches this route.
  res.headers.set('Cache-Control', 'private, max-age=30');
  return res;
}
