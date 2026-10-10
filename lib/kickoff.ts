/**
 * AI Auto-Build on First Award.
 *
 * The in-app promise (projects/new): "when the first bid is awarded, Saguaro
 * automatically creates 24 schedule tasks, a CSI-coded budget, sub packages,
 * a safety plan, QC checkpoints and the contact directory." This module IS that
 * promise — wired into onBidAwarded and proven by scripts/proof-autobuild.ts.
 *
 * Every artifact is idempotent (safe on retry) and failure-tolerant: one
 * failing artifact never blocks the others. All writes use LIVE schema columns.
 */

import { companyDay } from './time-zone';

type Db = any;

export interface KickoffArgs {
  tenantId: string;
  projectId: string;
  project: any;              // the projects row (start_date, owner/architect/pm fields)
  pkg: any;                  // the awarded bid_packages row
  subName?: string | null;
  subId?: string | null;
  subEmail?: string | null;
}

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** Exactly 24 tasks — a real commercial build sequence with a critical spine.
 *  `after` is the 1-based index of the predecessor task (0 = project start). */
const TASK_TEMPLATE: { name: string; phase: string; trade: string; dur: number; critical: boolean; after: number }[] = [
  { name: 'Preconstruction kickoff & permits',        phase: 'Preconstruction', trade: 'General Contractor',        dur: 10, critical: true,  after: 0 },
  { name: 'Mobilization & temporary facilities',      phase: 'Preconstruction', trade: 'General Contractor',        dur: 5,  critical: true,  after: 1 },
  { name: 'Site survey & building layout',            phase: 'Sitework',        trade: 'Surveying',                 dur: 3,  critical: true,  after: 2 },
  { name: 'Clearing, grading & earthwork',            phase: 'Sitework',        trade: 'Earthwork / Excavation',    dur: 8,  critical: true,  after: 3 },
  { name: 'Underground utilities',                    phase: 'Sitework',        trade: 'Site Utilities',            dur: 7,  critical: true,  after: 4 },
  { name: 'Foundations — form & rebar',               phase: 'Structure',       trade: 'Concrete',                  dur: 8,  critical: true,  after: 5 },
  { name: 'Foundation pre-pour QC & pour',            phase: 'Structure',       trade: 'Concrete',                  dur: 4,  critical: true,  after: 6 },
  { name: 'Slab on grade',                            phase: 'Structure',       trade: 'Concrete',                  dur: 5,  critical: true,  after: 7 },
  { name: 'Structural framing',                       phase: 'Structure',       trade: 'Framing',                   dur: 15, critical: true,  after: 8 },
  { name: 'Roof structure & dry-in',                  phase: 'Envelope',        trade: 'Roofing',                   dur: 8,  critical: true,  after: 9 },
  { name: 'Exterior walls & sheathing',               phase: 'Envelope',        trade: 'Framing',                   dur: 6,  critical: false, after: 9 },
  { name: 'Windows & exterior doors',                 phase: 'Envelope',        trade: 'Glazing',                   dur: 5,  critical: false, after: 11 },
  { name: 'MEP rough-in — electrical',                phase: 'Rough-In',        trade: 'Electrical',                dur: 10, critical: true,  after: 10 },
  { name: 'MEP rough-in — plumbing',                  phase: 'Rough-In',        trade: 'Plumbing',                  dur: 10, critical: false, after: 10 },
  { name: 'MEP rough-in — HVAC',                      phase: 'Rough-In',        trade: 'HVAC',                      dur: 10, critical: false, after: 10 },
  { name: 'Low-voltage & security rough-in',          phase: 'Rough-In',        trade: 'Low Voltage & Networking',  dur: 6,  critical: false, after: 13 },
  { name: 'Rough-in inspections',                     phase: 'Rough-In',        trade: 'General Contractor',        dur: 3,  critical: true,  after: 13 },
  { name: 'Insulation & air sealing',                 phase: 'Close-In',        trade: 'Insulation',                dur: 4,  critical: true,  after: 17 },
  { name: 'Drywall hang, tape & finish',              phase: 'Close-In',        trade: 'Drywall',                   dur: 10, critical: true,  after: 18 },
  { name: 'Interior finishes — paint & flooring',     phase: 'Finishes',        trade: 'Painting',                  dur: 10, critical: true,  after: 19 },
  { name: 'Casework, trim & doors',                   phase: 'Finishes',        trade: 'Finish Carpentry',          dur: 6,  critical: false, after: 20 },
  { name: 'MEP trim-out & devices',                   phase: 'Finishes',        trade: 'Electrical',                dur: 6,  critical: true,  after: 20 },
  { name: 'Punch list & final inspections',           phase: 'Closeout',        trade: 'General Contractor',        dur: 6,  critical: true,  after: 22 },
  { name: 'Substantial completion & closeout',        phase: 'Closeout',        trade: 'General Contractor',        dur: 4,  critical: true,  after: 23 },
];

/** CSI budget skeleton — coded lines seeded so committed dollars from awards
 *  always have a coded home (the award cascade only UPDATEs existing lines). */
const BUDGET_DIVISIONS: [string, string][] = [
  ['01', 'General Requirements'], ['02', 'Existing Conditions'], ['03', 'Concrete'],
  ['05', 'Metals'], ['06', 'Wood, Plastics & Composites'], ['07', 'Thermal & Moisture Protection'],
  ['08', 'Openings'], ['09', 'Finishes'], ['10', 'Specialties'], ['21', 'Fire Suppression'],
  ['22', 'Plumbing'], ['23', 'HVAC'], ['26', 'Electrical'], ['27', 'Communications'],
  ['28', 'Electronic Safety & Security'], ['31', 'Earthwork'], ['32', 'Exterior Improvements'],
];

/** Core trades that get a draft bid package if the project has none for them. */
const CORE_PACKAGES: { trade: string; div: string }[] = [
  { trade: 'Concrete', div: '03' }, { trade: 'Framing', div: '06' },
  { trade: 'Roofing', div: '07' }, { trade: 'Drywall', div: '09' },
  { trade: 'Painting', div: '09' }, { trade: 'Flooring', div: '09' },
  { trade: 'Plumbing', div: '22' }, { trade: 'HVAC', div: '23' },
  { trade: 'Electrical', div: '26' }, { trade: 'Low Voltage & Networking', div: '27' },
  { trade: 'Earthwork / Excavation', div: '31' },
];

const SAFETY_SECTIONS = [
  { key: 'emergency',   title: 'Emergency Response & Contacts', items: ['Post emergency numbers and site address at entrance and job trailer', 'Identify nearest urgent care and hospital with route map', 'Designate first-aid/CPR trained personnel per shift', 'First-aid kits stocked and inspected weekly'] },
  { key: 'ppe',         title: 'Personal Protective Equipment', items: ['Hard hats, hi-vis, and safety-toe footwear required beyond the gate', 'Eye protection for all cutting, grinding, and overhead work', 'Hearing protection in posted high-noise zones', 'Task-specific gloves and respirators per SDS'] },
  { key: 'hazcom',      title: 'Hazard Communication', items: ['SDS binder maintained on site and indexed by product', 'Secondary containers labeled', 'Weekly toolbox talks documented with signatures'] },
  { key: 'fall',        title: 'Fall Protection', items: ['100% tie-off at or above 6 ft', 'Guardrails or covers on all floor and roof openings', 'Ladders inspected, extended 3 ft above landing, secured', 'Scaffolds erected and tagged by competent person'] },
  { key: 'electrical',  title: 'Electrical Safety', items: ['GFCI protection on all temporary power', 'Lockout/tagout before servicing energized equipment', 'Cords inspected and rated for hard usage', 'Qualified persons only inside approach boundaries'] },
  { key: 'excavation',  title: 'Excavation & Trenching', items: ['Utility locates verified before digging', 'Protective systems for trenches 5 ft or deeper', 'Daily competent-person inspection with log', 'Spoils and equipment kept 2 ft from edges'] },
  { key: 'equipment',   title: 'Equipment & Cranes', items: ['Daily operator inspections documented', 'Certified operators and riggers only', 'Swing radius barricaded; tag lines on all picks'] },
  { key: 'housekeeping',title: 'Housekeeping & Fire Prevention', items: ['Debris cleared daily; egress paths kept open', 'Fire extinguishers within 75 ft of work areas and inspected monthly', 'Hot-work permits with fire watch'] },
  { key: 'incident',    title: 'Incident Reporting', items: ['All incidents and near-misses reported same day in Saguaro Safety', 'OSHA-recordable determination within 24 hours', 'Scene preserved and photographed before disturbance'] },
];

const QC_CHECKPOINTS: { name: string; offsetDays: number; items: string[] }[] = [
  { name: 'Foundation Pre-Pour QC', offsetDays: 32, items: ['Formwork dimensions vs structural drawings', 'Rebar size, spacing, laps, and chairs', 'Embeds, anchor bolts, and sleeves located', 'Sub-grade compaction and vapor barrier'] },
  { name: 'Slab Pre-Pour QC', offsetDays: 40, items: ['In-slab MEP sleeves and conduits verified', 'Control joint layout confirmed', 'Mix design and slump tickets on file'] },
  { name: 'Structural Framing QC', offsetDays: 60, items: ['Member sizes and spacing vs plans', 'Shear walls, hold-downs, and hardware', 'Blocking and fire-stopping complete'] },
  { name: 'MEP Rough-In QC', offsetDays: 78, items: ['Box heights and device locations vs plans', 'Pipe slope and support spacing', 'Duct sealing class verified', 'Low-volt pathways separated from power'] },
  { name: 'Insulation & Air-Seal QC', offsetDays: 84, items: ['R-values match energy code schedule', 'Penetrations foamed and sealed', 'Baffles at eaves installed'] },
  { name: 'Envelope / Waterproofing QC', offsetDays: 70, items: ['WRB shingled correctly, laps taped', 'Window and door flashing sequence verified', 'Roof penetrations flashed and sealed'] },
  { name: 'Final Completion QC', offsetDays: 115, items: ['Punch list zero-item walk', 'Systems commissioned and O&M collected', 'Life-safety devices tested and logged'] },
];

export interface KickoffResult {
  ran: boolean;
  tasks: number; budgetLines: number; packages: number;
  safetyPlan: boolean; qcCheckpoints: number; contacts: number;
  errors: string[];
}

export async function runKickoffAutoBuild(db: Db, a: KickoffArgs): Promise<KickoffResult> {
  const res: KickoffResult = { ran: false, tasks: 0, budgetLines: 0, packages: 0, safetyPlan: false, qcCheckpoints: 0, contacts: 0, errors: [] };
  const t = a.tenantId, p = a.projectId;

  // Idempotence: if a prior kickoff stamped tasks, never double-build.
  const { data: prior } = await db.from('schedule_tasks').select('id').eq('project_id', p).like('external_id', 'KICKOFF-%').limit(1);
  if (prior && prior.length) return res;
  res.ran = true;

  /* Day 1 is the project's start date, else TODAY on the company's calendar
     (tenants.time_zone) — the server's clock made an evening award in Iowa
     start the schedule tomorrow. Dates are then counted as calendar days at
     UTC midnight, so iso() returns the same day whatever zone the server is in. */
  let startDay = a.project?.start_date ? String(a.project.start_date).slice(0, 10) : '';
  if (!startDay) {
    try {
      startDay = (await companyDay(db, t, 'kickoff')).today;
    } catch (e: any) {
      res.errors.push('time zone: ' + (e?.message || e));
      startDay = new Date().toISOString().slice(0, 10);
      console.warn('[kickoff] company time zone unreadable — schedule starts on the UTC day', t);
    }
  }
  const start = new Date(startDay + 'T00:00:00Z');

  // ── 1) 24 schedule tasks, predecessor-linked, critical spine ──
  try {
    const ids: string[] = [];
    const ends: Date[] = [];
    for (let i = 0; i < TASK_TEMPLATE.length; i++) {
      const tt = TASK_TEMPLATE[i];
      const s = tt.after === 0 ? start : addDays(ends[tt.after - 1], 1);
      const e = addDays(s, Math.max(0, tt.dur - 1));
      const { data: row, error } = await db.from('schedule_tasks').insert({
        tenant_id: t, project_id: p, name: tt.name, phase: tt.phase, trade: tt.trade,
        start_date: iso(s), end_date: iso(e), duration: tt.dur, status: 'not_started',
        pct_complete: 0, is_critical: tt.critical, wbs: String(i + 1),
        external_id: `KICKOFF-${i + 1}`,
        predecessor_id: tt.after > 0 ? ids[tt.after - 1] : null,
      } as never).select('id').single();
      if (error) throw error;
      ids.push((row as any).id); ends.push(e);
      res.tasks++;
    }
  } catch (e: any) { res.errors.push('schedule: ' + (e?.message || e)); }

  // ── 2) CSI-coded budget skeleton (only divisions the project lacks) ──
  try {
    const { data: existing } = await db.from('budget_lines').select('division, cost_code').eq('project_id', p);
    const have = new Set((existing || []).map((b: any) => String(b.division || String(b.cost_code || '').slice(0, 2))));
    const missing = BUDGET_DIVISIONS.filter(([div]) => !have.has(div));
    if (missing.length) {
      const { error } = await db.from('budget_lines').insert(missing.map(([div, name], i) => ({
        tenant_id: t, project_id: p, division: div, cost_code: `${div} 00 00`,
        description: name, category: 'auto-build', original_budget: 0, committed: 0, actual: 0,
        sort_order: i, ai_generated: true,
      })) as never);
      if (error) throw error;
      res.budgetLines = missing.length;
    }
  } catch (e: any) { res.errors.push('budget: ' + (e?.message || e)); }

  // ── 3) Draft sub packages for core trades not yet packaged ──
  try {
    const { data: pkgs } = await db.from('bid_packages').select('trade, csi_division, name').eq('project_id', p);
    const covered = (v: string) => (pkgs || []).some((x: any) =>
      [x.trade, x.csi_division, x.name].filter(Boolean).some((s: string) => String(s).toLowerCase().includes(v.toLowerCase().slice(0, 6))));
    const toCreate = CORE_PACKAGES.filter((c) => !covered(c.trade));
    if (toCreate.length) {
      const { error } = await db.from('bid_packages').insert(toCreate.map((c) => ({
        tenant_id: t, project_id: p, name: `${c.trade} — Bid Package`, trade: c.trade,
        csi_division: c.div, csi_codes: [`${c.div} 00 00`], status: 'draft', ai_generated: true,
        description: `Auto-created on first award — scope, invite subs, and issue when ready.`,
      })) as never);
      if (error) throw error;
      res.packages = toCreate.length;
    }
  } catch (e: any) { res.errors.push('packages: ' + (e?.message || e)); }

  // ── 4) Site-specific safety plan ──
  try {
    const { error } = await db.from('safety_plans').upsert({
      tenant_id: t, project_id: p, title: `Site-Specific Safety Plan — ${a.project?.name || 'Project'}`,
      status: 'active', auto_generated: true, sections: SAFETY_SECTIONS,
      emergency_contacts: [
        { role: 'Emergency', name: '911', phone: '911' },
        { role: 'Superintendent', name: a.project?.super_name || a.project?.superintendent || '', phone: a.project?.super_phone || '' },
        { role: 'Project Manager', name: a.project?.pm_name || a.project?.project_manager || '', phone: a.project?.pm_phone || '' },
      ],
    } as never, { onConflict: 'project_id' });
    if (error) throw error;
    res.safetyPlan = true;
  } catch (e: any) { res.errors.push('safety: ' + (e?.message || e)); }

  // ── 5) QC checkpoints as scheduled inspections ──
  try {
    const { data: existing } = await db.from('inspections').select('id').eq('project_id', p).eq('agency', 'Internal QC').limit(1);
    if (!existing || !existing.length) {
      const { error } = await db.from('inspections').insert(QC_CHECKPOINTS.map((q) => ({
        tenant_id: t, project_id: p, inspection_type: q.name, status: 'scheduled', agency: 'Internal QC',
        // Booked, not held: the columns' own defaults would record a pass, inspected today.
        result: 'pending', inspected_at: null,
        scheduled_date: addDays(start, q.offsetDays).toISOString(),
        checklist: q.items.map((it) => ({ item: it, status: 'pending' })),
        checklist_total: q.items.length, checklist_passed: 0,
        notes: 'Auto-created QC checkpoint (first-award auto-build).',
      })) as never);
      if (error) throw error;
      res.qcCheckpoints = QC_CHECKPOINTS.length;
    }
  } catch (e: any) { res.errors.push('qc: ' + (e?.message || e)); }

  // ── 6) Contact directory from what the project already knows ──
  try {
    const want: any[] = [];
    const pr = a.project || {};
    if (pr.owner_name) want.push({ name: pr.owner_name, company: pr.owner_entity || null, email: pr.owner_email || null, phone: pr.owner_phone || null, role: 'Owner', contact_type: 'owner', is_primary: true });
    if (pr.architect_name || pr.architect) want.push({ name: pr.architect_name || pr.architect, company: pr.architect_firm || pr.architect_entity || null, email: pr.architect_email || null, phone: pr.architect_phone || null, role: 'Architect', contact_type: 'architect', is_primary: false });
    if (pr.pm_name || pr.project_manager) want.push({ name: pr.pm_name || pr.project_manager, company: pr.gc_name || null, email: pr.pm_email || null, phone: pr.pm_phone || null, role: 'Project Manager', contact_type: 'gc', is_primary: true });
    if (pr.super_name || pr.superintendent) want.push({ name: pr.super_name || pr.superintendent, company: pr.gc_name || null, email: pr.super_email || null, phone: pr.super_phone || null, role: 'Superintendent', contact_type: 'gc', is_primary: false });
    if (a.subName) want.push({ name: a.subName, company: a.subName, email: a.subEmail || null, phone: null, role: `${a.pkg?.trade || 'Subcontractor'} (awarded)`, contact_type: 'subcontractor', is_primary: false, subcontractor_id: a.subId || null });
    const { data: existing } = await db.from('project_contacts').select('name, role').eq('project_id', p);
    const have = new Set((existing || []).map((c: any) => `${c.name}|${c.role}`));
    const fresh = want.filter((c) => c.name && !have.has(`${c.name}|${c.role}`));
    if (fresh.length) {
      const { error } = await db.from('project_contacts').insert(fresh.map((c) => ({ tenant_id: t, project_id: p, ...c })) as never);
      if (error) throw error;
      res.contacts = fresh.length;
    }
  } catch (e: any) { res.errors.push('contacts: ' + (e?.message || e)); }

  if (res.errors.length) console.error('[kickoff-autobuild] partial:', res.errors);
  return res;
}
