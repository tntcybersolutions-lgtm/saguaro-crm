/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/takeoff/[id]/sage-auto-docs  (SSE stream)
 *
 * Sage reads the completed takeoff and auto-creates ALL required documents:
 *  1. Bid packages per CSI division — Sage writes scope narratives, bid instructions,
 *     bond requirements, insurance minimums, and due dates
 *  2. Bid jacket PDFs for each package
 *  3. Schedule of Values (G703) tied to a new Pay Application — ONLY once the job
 *     is won (projects.phase = building). While bidding there is no contract to
 *     bill against; the per-division cost lives in the budget the takeoff page
 *     builds in the same run.
 *
 * Money basis: every division total here is DIRECT cost = material + labor
 * (lib/takeoff-line-cost) — the same number the takeoff screen's Cost column
 * and the budget carry. takeoff_materials.total_cost alone is material only.
 *
 * Packages are written as 'draft' — "ready, not sent". The invite route flips a
 * package to 'open' when the first invite actually goes out.
 *
 * All fields are populated with correct project name, dates, and trade-specific content.
 */

import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { buildComplianceForBidPackages } from '@/lib/compliance-autofile';
import type { Database } from '@/lib/database.types';
import { must } from '@/lib/db-write';
import { logActivity, money } from '@/lib/activity';
import { laborAllocation, lineDirectCost } from '@/lib/takeoff-line-cost';
import { resolveTenantCompany } from '@/lib/tenant-company';
import { normalisePhase } from '@/lib/project-phase';
import { insuranceSentence } from '@/lib/jacket-insurance';
import { planRebuild, NOT_THIS_BUILDS, type ExistingPackage } from '@/lib/sage-package-guard';

export const runtime = 'nodejs';
export const maxDuration = 120;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt$ = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function addDays(d: number): string {
  return new Date(Date.now() + d * 86_400_000).toISOString().split('T')[0];
}

/** Last day of the current billing month (YYYY-MM-DD). A pay app covers ONE
 *  billing period — this used to default to today + 365 days. */
function endOfThisMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().split('T')[0];
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RawMaterial {
  csi_code: string;
  csi_name: string;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  labor_hours: number;
  sort_order: number;
}

interface SagePackage {
  name: string;         // professional trade package name
  scope: string;        // 3-4 sentence scope narrative
  instructions: string; // bid instructions for this trade
  bond: boolean;
  ins_gl: number;       // general liability limit
  ins_auto: number;     // auto liability
  ins_work: number;     // workers comp
}

// ─── Route ─────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const encoder = new TextEncoder();
  const supabase = createServerClient();
  const user = await getUser(req).catch(() => null);
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id: takeoffId } = await params;
  // Ownership gate BEFORE the stream — this route DELETEs+regenerates bid packages,
  // pay-apps and SOV, so a null/cross-tenant caller must never reach the writes.
  const { data: owned } = await supabase
    .from('takeoffs').select('id').eq('id', takeoffId).eq('tenant_id', user.tenantId).single();
  if (!owned) return new Response('Takeoff not found', { status: 404 });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, ...data })}\n\n`));
        } catch { /* stream may be closed */ }
      };

      const done = (summary: Record<string, unknown> = {}) => {
        send('done', summary);
        try { controller.close(); } catch { /* already closed */ }
      };

      try {
        // ── 1. Load takeoff + materials ─────────────────────────────────────
        send('progress', { step: 1, pct: 5, message: 'Loading takeoff data...' });

        // Two separate queries — avoid FK join (can fail with PGRST200)
        const { data: takeoff } = await supabase
          .from('takeoffs')
          .select('*')
          .eq('id', takeoffId)
          .eq('tenant_id', user.tenantId)
          .single();

        if (!takeoff || takeoff.status !== 'complete') {
          send('error', { message: 'Takeoff not found or not yet complete. Run the analysis first.' });
          return done();
        }

        const { data: materialsData } = await supabase
          .from('takeoff_materials')
          .select('*')
          .eq('tenant_id', user.tenantId)
      .eq('takeoff_id', takeoffId)
          .order('sort_order', { ascending: true });

        let materials = (materialsData || []) as RawMaterial[];
        if (materials.length > 0) {
          /* AI takeoff lines store MATERIAL in total_cost and labor only as hours;
             the labor dollars live on the header (takeoffs.labor_cost). Fold each
             line's share of labor in so packages, jackets and the SOV carry the
             full direct cost — the same number the takeoff screen shows. */
          const alloc = laborAllocation(
            materials.map((m) => ({ totalCost: Number(m.total_cost) || 0, laborHours: Number(m.labor_hours) || 0 })),
            Number((takeoff as any).labor_cost) || 0,
          );
          materials = materials.map((m) => {
            const direct = Math.round(lineDirectCost({ totalCost: Number(m.total_cost) || 0, laborHours: Number(m.labor_hours) || 0 }, alloc) * 100) / 100;
            const qty = Number(m.quantity) || 0;
            return { ...m, total_cost: direct, unit_cost: qty > 0 ? Math.round((direct / qty) * 100) / 100 : Number(m.unit_cost) || 0 };
          });
        }
        if (materials.length === 0) {
          // Fallback: measured/deterministic takeoffs write takeoff_line_items (not
          // takeoff_materials). Map them to the same shape so the chain works from BOTH paths.
          const { data: liData } = await supabase
            .from('takeoff_line_items')
            .select('*')
            .eq('tenant_id', user.tenantId)
      .eq('takeoff_id', takeoffId)
            .order('sort_order', { ascending: true });
          materials = ((liData || []) as any[]).map((li) => {
            const um = Number(li.unit_material_cost) || 0, ul = Number(li.unit_labor_cost) || 0, qty = Number(li.quantity) || 0;
            return {
              csi_code: li.csi_code || '', csi_name: li.category || li.trade || '',
              description: li.description || '', quantity: qty, unit: li.unit || 'EA',
              unit_cost: um + ul, total_cost: qty * (um + ul), labor_hours: 0,
              sort_order: Number(li.sort_order) || 0,
            } as RawMaterial;
          });
        }
        if (materials.length === 0) {
          send('error', { message: 'No materials found in this takeoff.' });
          return done();
        }

        // ── 2. Load project ─────────────────────────────────────────────────
        const { data: project } = await supabase
          .from('projects')
          .select('*')
          .eq('id', takeoff.project_id)
          .eq('tenant_id', user.tenantId)
          .single();

        const proj = (project || {}) as Record<string, any>;
        const projectName = String(proj.name || takeoff.project_name_detected || 'Project');
        // ALWAYS the caller's tenant — every package/pay-app/SOV write below must land in the
        // caller's tenant, never a value derived from a (possibly foreign) project row.
        const tenantId   = user.tenantId;
        /* The GC is the TENANT. projects.gc_name is empty on almost every job, so
           the jacket cover read "GENERAL CONTRACTOR" over the job-site address.
           Name / office address / license now come from the company record. */
        const company    = await resolveTenantCompany(supabase, tenantId, proj);
        const gcName     = company.name;
        const isBuilding = normalisePhase(proj.phase) === 'building';
        const ownerName  = String(proj.owner_entity?.name || '');
        const ownerAddr  = String(proj.owner_entity?.address || '');
        const projAddr   = String(proj.address || '');
        const projState  = String(proj.state || '');

        // ── 3. Group by CSI division (skip trivial items < $500) ────────────
        const divisionMap = new Map<string, RawMaterial[]>();
        for (const mat of materials) {
          const div = String(mat.csi_code || '').slice(0, 2).replace(/\s/g, '');
          if (!div || div === 'XX' || div === '') continue;
          if (!divisionMap.has(div)) divisionMap.set(div, []);
          divisionMap.get(div)!.push(mat);
        }

        const divisions = Array.from(divisionMap.entries())
          .filter(([, items]) => items.reduce((s, i) => s + (i.total_cost || 0), 0) >= 100)
          .sort(([a], [b]) => a.localeCompare(b));

        if (divisions.length === 0) {
          send('error', { message: 'No billable CSI divisions found in this takeoff.' });
          return done();
        }

        send('progress', { step: 2, pct: 10, message: `Sage is writing ${divisions.length} bid packages...` });

        // ── 4. Check Anthropic key ───────────────────────────────────────────
        if (!process.env.ANTHROPIC_API_KEY) {
          send('error', { message: 'AI service not configured. Add ANTHROPIC_API_KEY.' });
          return done();
        }

        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        // ── 5. Batch Sage AI call — write ALL package content at once ────────
        //    Compact format keeps token usage low; we cover all divisions in 1 call.
        const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        const divisionSummaries = divisions.map(([div, items]) => {
          const total   = items.reduce((s, i) => s + (i.total_cost || 0), 0);
          const divName = CSI_DIVISIONS[div]?.name || `Division ${div}`;
          /* A copy: sorting `items` in place reordered the bid form by cost. */
          const lines   = [...items]
            .sort((a, b) => (b.total_cost || 0) - (a.total_cost || 0))
            .slice(0, 10)
            .map(i => `  ${i.description}: ${i.quantity} ${i.unit} @ $${i.unit_cost?.toFixed(2)}`)
            .join('\n');
          return `DIV ${div} — ${divName} (${fmt$(total)})\n${lines}`;
        }).join('\n\n');

        const sagePrompt = `You are Sage, Saguaro Control Systems's expert GC with 25+ years on commercial and residential projects.

Today's date: ${today}
Project: ${projectName}
Building type: ${takeoff.building_type || 'Commercial'}
Location: ${projState || 'AZ'}
Estimated direct cost (material + labor): ${fmt$(materials.reduce((s, m) => s + (Number(m.total_cost) || 0), 0))}
Square footage: ${(takeoff.building_area || 0).toLocaleString()} SF

Trade packages to document:
${divisionSummaries}

For EACH CSI division above, write bid package documentation. Return ONLY raw JSON starting with {

{
  "03": {
    "name": "Structural Concrete & Foundations",
    "scope": "Furnish all labor, materials, and equipment for cast-in-place concrete work including footings, grade beams, slab on grade, and all associated formwork and reinforcing steel per structural drawings.",
    "instructions": "Bid must include itemized pricing for all concrete elements, mix designs, and proposed pour schedule. Bidder must carry $2M GL insurance and provide subcontractor qualification statement. Performance and payment bond required.",
    "bond": true,
    "ins_gl": 2000000,
    "ins_auto": 1000000,
    "ins_work": 500000
  }
}

Rules:
- name: specific professional trade name (NOT just "Division 03")
- scope: 2-3 sentences, mentions specific work items from the list above, references project name
- instructions: what bidder must include (schedule, qualifications, bonds, insurance, submittals)
- bond: true if division total > $100,000
- ins_gl: $2M for structural/MEP/roofing, $1M for finishes/specialties
- ins_auto: always $1,000,000
- ins_work: always $500,000`;

        let sagePackages: Record<string, SagePackage> = {};

        let aiHeartbeat: ReturnType<typeof setInterval> | null = null;
        try {
          /* A HEARTBEAT THAT ONLY EVER GOES FORWARD.
             Sage writes all the packages in one call, so there is no real
             sub-progress to report — this beat exists to show the request is
             still alive. It used to send `15 + random(10)`, which meant the bar
             genuinely ran backwards on screen: 23%, then 21%, then 19%. A
             progress bar that loses ground reads as a malfunction, and it was
             reporting on the longest silent stretch of the whole build.
             It now creeps from 15 and eases toward 29, never reaching the 30
             that the next real step owns — so it moves, it never retreats, and
             it never claims a milestone it has not hit. */
          let beat = 0;
          aiHeartbeat = setInterval(() => {
            beat += 1;
            const pct = Math.min(29, 15 + Math.round(14 * (1 - Math.pow(0.72, beat))));
            send('progress', { step: 2, pct, message: 'Sage is writing bid package content…' });
          }, 5000);

          const aiRes = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 6000,
            messages: [{ role: 'user', content: sagePrompt }],
          });

          clearInterval(aiHeartbeat);
          aiHeartbeat = null;

          const rawText = aiRes.content
            .filter(b => b.type === 'text')
            .map(b => (b as any).text)
            .join('');

          const cleaned = rawText
            .replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```\s*$/im, '')
            .trim();

          try {
            sagePackages = JSON.parse(cleaned);
          } catch {
            const m = cleaned.match(/\{[\s\S]*/);
            if (m) {
              try { sagePackages = JSON.parse(m[0]); } catch { /* fallback to defaults */ }
            }
          }
        } catch (aiErr) {
          if (aiHeartbeat) { clearInterval(aiHeartbeat); aiHeartbeat = null; }
          console.error('[sage-auto-docs] Sage AI batch failed:', aiErr);
          send('progress', { step: 2, pct: 30, message: 'Using rule-based defaults (AI content unavailable)' });
        }

        /* REPLACE ONLY WHAT THIS BUILD WROTE AND NOBODY HAS TOUCHED.
           This used to delete every bid package on the project before writing
           new ones, and the delete cascades to invites, bids and documents —
           issued and awarded packages included. lib/sage-package-guard decides:
           an untouched draft from an earlier build is replaced; anything issued,
           invited, bid, filed into or edited is kept, and its division is not
           written twice. Every read here must succeed — a guard that cannot see
           the invites must not guess that there are none. */
        const { data: existingPkgs, error: existingErr } = await supabase
          .from('bid_packages')
          .select('id, status, takeoff_id, ai_generated, insurance_requirements, csi_codes, csi_division, jacket_generated_at, addendum_count, jacket_edits')
          .eq('project_id', takeoff.project_id)
          .eq('tenant_id', tenantId);
        if (existingErr) throw existingErr;

        const existingList = (existingPkgs || []) as ExistingPackage[];
        let plan: ReturnType<typeof planRebuild> = { replace: [], keep: [], keepDivisions: new Set<string>() };
        if (existingList.length > 0) {
          const ids = existingList.map((p) => p.id);
          const [inv, bids, docs] = await Promise.all([
            supabase.from('bid_package_invites').select('bid_package_id').eq('tenant_id', tenantId).in('bid_package_id', ids),
            supabase.from('bid_submissions').select('bid_package_id').eq('tenant_id', tenantId).in('bid_package_id', ids),
            supabase.from('bid_package_documents').select('bid_package_id').eq('tenant_id', tenantId).in('bid_package_id', ids),
          ]);
          if (inv.error) throw inv.error;
          if (bids.error) throw bids.error;
          if (docs.error) throw docs.error;
          const idsOf = (rows: unknown) => new Set(((rows || []) as Array<{ bid_package_id: string }>).map((r) => r.bid_package_id));
          plan = planRebuild(existingList, { invited: idsOf(inv.data), bids: idsOf(bids.data), documents: idsOf(docs.data) });
        }

        if (plan.replace.length > 0) {
          send('progress', { step: 3, pct: 32, message: `Replacing ${plan.replace.length} untouched draft package${plan.replace.length === 1 ? '' : 's'} from the last build...` });
          await must(supabase.from('bid_package_items').delete().eq('tenant_id', tenantId).in('bid_package_id', plan.replace), 'bid_package_items delete');
          await must(supabase.from('bid_packages').delete().eq('tenant_id', tenantId).eq('project_id', takeoff.project_id).in('id', plan.replace), 'bid_packages delete');
        }
        const inUse = plan.keep.filter((k) => k.reason !== NOT_THIS_BUILDS).length;
        if (inUse > 0) {
          send('progress', { step: 3, pct: 33, message: `Keeping ${inUse} package${inUse === 1 ? '' : 's'} already in use (issued, invited, bid or edited).` });
        }

        send('progress', { step: 3, pct: 35, message: `Creating ${divisions.length} bid packages in database...` });

        // ── 6. Create bid packages + line items ──────────────────────────────
        const createdPackages: Array<{
          id: string; name: string; div: string; total: number;
          trade: string; requiresBond: boolean; insGl: number; insAuto: number; insWork: number;
        }> = [];
        /* Divisions whose package could not be written whole. Reported, never
           left half-built. */
        const failedPackages: Array<{ div: string; name: string }> = [];
        const skippedDivisions: string[] = [];

        for (const [div, items] of divisions) {
          if (plan.keepDivisions.has(div)) { skippedDivisions.push(div); continue; }
          const total    = items.reduce((s, i) => s + (i.total_cost || 0), 0);
          const divName  = CSI_DIVISIONS[div]?.name || `Division ${div}`;
          const ai       = sagePackages[div];

          // Use Sage-written content, fall back to rules-based defaults
          const packageName   = ai?.name || `Division ${div} — ${divName}`;
          const scopeSummary  = [...items]
            .sort((a, b) => (b.total_cost || 0) - (a.total_cost || 0))
            .slice(0, 8)
            .map(i => `${i.description}: ${i.quantity} ${i.unit}`)
            .join('\n');
          const scopeNarrative = ai?.scope
            || `Furnish all labor, materials, and equipment for ${divName.toLowerCase()} work on ${projectName} per contract documents. Includes: ${scopeSummary}.`;
          const bidInstructions = ai?.instructions
            || `Submit itemized bid with material specifications and proposed construction schedule. All substitutions must be approved 7 days prior to bid date.`;
          const requiresBond  = ai?.bond ?? (total > 100_000);
          // Larger packages get 21-day due date, smaller get 14
          const dueDate       = addDays(total > 250_000 ? 21 : 14);
          const uniqueCsiCodes = [...new Set(items.map(i => i.csi_code))];
          const insGl   = ai?.ins_gl   ?? ((['03','05','07','22','23','26'].includes(div)) ? 2_000_000 : 1_000_000);
          const insAuto = ai?.ins_auto ?? 1_000_000;
          const insWork = ai?.ins_work ?? 500_000;

          const { data: pkg, error: pkgErr } = await supabase
            .from('bid_packages')
            .insert({
              tenant_id:             tenantId,
              project_id:            takeoff.project_id,
              name:                  packageName,
              trade:                 divName,
              scope_summary:         scopeSummary,
              scope_narrative:       scopeNarrative,
              csi_codes:             uniqueCsiCodes,
              due_date:              dueDate,
              bid_instructions:      bidInstructions,
              /* 'draft' = ready, not sent. It used to be 'open', so the Bid Board
                 showed fifteen packages "Out for bid" with zero invites. The
                 invite route opens a package when invites actually go out. */
              status:                'draft',
              requires_bond:         requiresBond,
              /* Readable words for the bidder, figures in the three limit
                 columns. This used to pass an object to a TEXT column, and
                 the jacket printed the JSON to every sub. */
              insurance_requirements: insuranceSentence({ gl: insGl, auto: insAuto, wc: insWork }),
              general_liability:     String(insGl),
              auto_liability:        String(insAuto),
              workers_compensation:  String(insWork),
              csi_division:          div,
              /* Marks the package as this build's, so a rebuild can tell it
                 from one a GC made (lib/sage-package-guard). */
              takeoff_id:            takeoffId,
              ai_generated:          true,
              ai_generated_at:       new Date().toISOString(),
            } as unknown as Database['public']['Tables']['bid_packages']['Insert'])
            .select()
            .single();

          if (pkgErr || !pkg) {
            console.error('[sage-auto-docs] create pkg error:', pkgErr);
            continue;
          }

          const pkgId = (pkg as any).id as string;

          /* The bid form, in the takeoff's order. A package whose lines will
             not save is deleted again rather than left as a header with an
             empty bid form that nobody can price. */
          if (items.length > 0) {
            const { error: itemsErr } = await supabase.from('bid_package_items').insert(
              items.map((item, index) => ({
                tenant_id:      tenantId,
                bid_package_id: pkgId,
                sort_order:     index,
                description:    item.description,
                quantity:       item.quantity,
                unit:           item.unit,
                unit_price:     item.unit_cost,
                total_amount:   item.total_cost,
                csi_code:       item.csi_code,
                notes:          '',
              }))
            );
            if (itemsErr) {
              console.error('[sage-auto-docs] line items insert failed — removing the package:', itemsErr);
              await must(supabase.from('bid_packages').delete().eq('id', pkgId).eq('tenant_id', tenantId), 'bid_packages rollback');
              failedPackages.push({ div, name: packageName });
              send('progress', { step: 3, pct: 40, message: `Could not save the bid form for ${packageName} — that package was not created.` });
              continue;
            }
          }

          createdPackages.push({ id: pkgId, name: packageName, div, total, trade: divName, requiresBond, insGl, insAuto, insWork });
        }

        /* Fifteen packages written in one press of one button is the biggest
           single change this product makes to a job, and it left no trace. One
           line for the batch — it was one act. */
        if (createdPackages.length) {
          void logActivity({
            tenantId,
            projectId: takeoff.project_id,
            userId: user.id,
            userName: user.email,
            action: 'packages_created',
            entityType: 'bid_package',
            entityId: null,
            description: `Wrote ${createdPackages.length} bid package${createdPackages.length === 1 ? '' : 's'} from the takeoff — ${money(createdPackages.reduce((a, p) => a + (Number(p.total) || 0), 0))}`,
            metadata: { count: createdPackages.length, trades: createdPackages.map(p => p.trade).filter(Boolean) },
          });
        }

        send('progress', { step: 4, pct: 55, message: `Generating ${createdPackages.length} bid jacket PDFs...` });

        // ── 7. Generate bid jacket PDFs ──────────────────────────────────────
        let jacketsGenerated = 0;

        try {
          const { generateBidJacket, saveDocument } = await import('@/lib/pdf-engine');

          for (const pkg of createdPackages) {
            try {
              const div   = pkg.div;
              const items = divisionMap.get(div) || [];
              const ai    = sagePackages[div];

              const pdfBytes = await (generateBidJacket as any)({
                projectName,
                projectAddress:       projAddr,
                ownerName,
                ownerAddress:         ownerAddr,
                gcName,
                // The contractor's OFFICE — never the job address (that is projectAddress).
                gcAddress:            company.address,
                gcLicense:            company.license || undefined,
                tradeName:            CSI_DIVISIONS[div]?.name || `Division ${div}`,
                dueDate:              addDays(pkg.total > 250_000 ? 21 : 14),
                scopeNarrative:       ai?.scope || `${pkg.name} scope of work for ${projectName}.`,
                csiSections:          items.map(i => `${i.csi_code} — ${i.description}`).slice(0, 20),
                lineItems: items.map(i => ({
                  description: i.description,
                  quantity:    i.quantity,
                  unit:        i.unit,
                  unitPrice:   i.unit_cost,
                })),
                requiresBond:         ai?.bond ?? (pkg.total > 100_000),
                insuranceRequirements: {
                  gl:   ai?.ins_gl  ?? 1_000_000,
                  wc:   'Statutory',
                  auto: ai?.ins_auto ?? 1_000_000,
                },
              });

              /* TITLE AND SOURCE, OR THE LIBRARY IS A WALL OF ONE SENTENCE.
                 This called saveDocument with five arguments and skipped the
                 sixth, so every jacket filed under the doc kind's default
                 label. Fifteen packages produced fifteen rows in Documents all
                 reading "Bid Jacket", and a GC looking for the electrical one
                 had no way to tell them apart. saveDocument's own header warns
                 about exactly this — it was written after eight pay
                 applications filed as eight identical "AIA G702" lines.
                 sourceId matters as much: the library's "Open jacket" link is
                 gated on source_id, so without it the row could only ever be a
                 flat PDF, never a route back to the live package. */
              const pdfUrl = await (saveDocument as any)(
                takeoff.project_id,
                'bid-jacket',
                pdfBytes,
                { bidPackageId: pkg.id, takeoffId },
                tenantId,
                {
                  title: `Bid Jacket — ${pkg.name || pkg.trade || `Division ${pkg.div}`}`,
                  sourceType: 'bid_package',
                  sourceId: pkg.id,
                }
              );

              await must(supabase
                .from('bid_packages')
                .update({ jacket_pdf_url: pdfUrl })
                .eq('tenant_id', tenantId)
                .eq('id', pkg.id), 'bid_packages write');

              jacketsGenerated++;

              send('progress', {
                step: 4,
                pct: 55 + Math.round((jacketsGenerated / createdPackages.length) * 20),
                message: `Bid jacket ${jacketsGenerated}/${createdPackages.length}: ${pkg.name}`,
              });
            } catch (jacketErr) {
              console.error(`[sage-auto-docs] jacket error for pkg ${pkg.id}:`, jacketErr);
              // Non-fatal — package exists, jacket can be generated from bid packages page
            }
          }
        } catch (engineErr) {
          console.error('[sage-auto-docs] pdf-engine load error:', engineErr);
          // Non-fatal — skip jackets entirely if engine unavailable
        }

        // ── 7.5 Auto-file compliance docs (lien waivers, W-9, COI) ──────────
        //   Real, tenant-scoped, idempotent records tied to each package's scope,
        //   plus a filed COI request PDF and the downstream package hook.
        let compliance = { lienWaivers: 0, w9Requests: 0, coiRequests: 0, coiDocsFiled: 0, placeholders: 0, triggersFired: 0 };
        if (createdPackages.length > 0) {
          send('progress', { step: 5, pct: 76, message: 'Filing compliance documents (lien waivers, W-9, COI)...' });
          try {
            compliance = await buildComplianceForBidPackages({
              db: supabase,
              tenantId,
              projectId: takeoff.project_id,
              project: { ...proj, gc_name: gcName },
              packages: createdPackages.map(p => ({
                id: p.id, name: p.name, div: p.div, total: p.total, trade: p.trade,
                requiresBond: p.requiresBond, insGl: p.insGl, insAuto: p.insAuto, insWork: p.insWork,
              })),
            });
            send('progress', {
              step: 5, pct: 79,
              message: `Compliance filed: ${compliance.lienWaivers} lien waivers, ${compliance.w9Requests} W-9 requests, ${compliance.coiRequests} COI requests`,
            });
          } catch (compErr) {
            console.error('[sage-auto-docs] compliance auto-file error:', compErr);
            // Non-fatal — packages + jackets already exist.
          }
        }

        // ── 8. SOV + Pay Application — only once the job is WON ──────────────
        /* This created "Pay App #1 (draft)" on every takeoff — during the bid,
           against a contract that does not exist yet — with contract_sum set to
           the raw takeoff cost, original_contract_sum 0, and a billing period of
           one YEAR (today → today + 365). A bidding job has nothing to bill; the
           per-division cost lives in the budget the takeoff page builds in the
           same run. When the project is already in the building phase, the pay
           app covers ONE billing period (today → end of this month) and its
           contract sum is the project's contract value, with the SOV lines scaled
           so the G703 foots to it. */
        let sovId: string | null = null;
        let sovLines = 0;
        const sovDeferred = !isBuilding;

        if (sovDeferred) {
          send('progress', { step: 5, pct: 80, message: 'Project is still bidding — pay application and SOV wait for the award.' });
        } else {
          send('progress', { step: 5, pct: 80, message: 'Building Schedule of Values (G703)...' });
          try {
            const directTotal = divisions.reduce((s, [, items]) => s + items.reduce((a, i) => a + (i.total_cost || 0), 0), 0);
            const contractValue = Number(proj.contract_value ?? proj.original_contract_value ?? proj.contract_amount ?? proj.contract_sum) || 0;
            const contractSum = contractValue > 0 ? contractValue : directTotal;
            // Scale division values onto the contract sum so Σ scheduled_value = contract_sum.
            const scale = directTotal > 0 ? contractSum / directTotal : 1;

            const { data: lastApp } = await supabase
              .from('pay_applications')
              .select('app_number')
              .eq('project_id', takeoff.project_id)
              .eq('tenant_id', tenantId)
              .order('app_number', { ascending: false })
              .limit(1)
              .maybeSingle();

            const appNumber = (((lastApp as any)?.app_number as number) || 0) + 1;

            const { data: payApp, error: payErr } = await supabase
              .from('pay_applications')
              .insert({
                tenant_id:                   tenantId,
                project_id:                  takeoff.project_id,
                app_number:                  appNumber,
                period_from:                 new Date().toISOString().split('T')[0],
                period_to:                   endOfThisMonth(),
                status:                      'draft',
                original_contract_sum:       contractSum,
                contract_sum:                contractSum,
                contract_sum_to_date:        contractSum,
                change_orders_total:         0,
                prev_completed:              0,
                this_period:                 0,
                materials_stored:            0,
                total_completed:             0,
                percent_complete:            0,
                retainage_percent:           10,
                retainage_amount:            0,
                total_earned_less_retainage: 0,
                prev_payments:               0,
                current_payment_due:         0,
                owner_name:                  ownerName,
                owner_address:               ownerAddr,
                notes: `Auto-generated by Sage from AI Blueprint Takeoff — ${takeoffId.slice(0, 8)} — ${today}`,
              } as unknown as Database['public']['Tables']['pay_applications']['Insert'])
              .select()
              .single();

            if (payErr) console.error('[sage-auto-docs] pay app insert failed:', payErr);
            if (!payErr && payApp) {
              sovId = (payApp as any).id as string;

              // Build SOV rows grouped by CSI division (one row per division = cleaner G703)
              const sovRows: Record<string, unknown>[] = [];
              let lineNum = 1;

              for (const [div, items] of divisions) {
                const divTotal  = Math.round(items.reduce((s, i) => s + (i.total_cost || 0), 0) * scale * 100) / 100;
                const divName   = sagePackages[div]?.name || CSI_DIVISIONS[div]?.name || `Division ${div}`;
                sovRows.push({
                  tenant_id:        tenantId,
                  project_id:       takeoff.project_id,
                  pay_app_id:       sovId,
                  line_number:      lineNum,
                  description:      `${div} — ${divName}`,
                  scheduled_value:  divTotal,
                  prev_completed:   0,
                  this_period:      0,
                  stored_materials: 0,
                  total_completed:  0,
                  percent_complete: 0,
                  balance_to_finish: divTotal,
                  retainage:        0,
                  cost_code:        div,
                  sort_order:       lineNum,
                  ai_generated:     true,
                });
                lineNum++;
              }

              const { error: sovInsertErr } = await supabase
                .from('schedule_of_values')
                .insert(sovRows as Database['public']['Tables']['schedule_of_values']['Insert'][]);
              if (sovInsertErr) {
                console.error('[sage-auto-docs] SOV line insert failed:', sovInsertErr);
                sovLines = 0;
              } else {
                sovLines = sovRows.length;
              }
            }
          } catch (sovErr) {
            console.error('[sage-auto-docs] SOV error:', sovErr);
            // Non-fatal — packages, jackets and compliance are already written.
          }
        }

        send('progress', { step: 6, pct: 95, message: 'Saving and finalizing...' });

        // ── 9. Done ──────────────────────────────────────────────────────────
        done({
          packagesCreated: createdPackages.length,
          /* Kept because they are in use; their divisions were not rewritten. */
          packagesKept:    inUse,
          packagesReplaced: plan.replace.length,
          divisionsSkipped: skippedDivisions,
          packagesFailed:  failedPackages,
          jacketsGenerated,
          sovCreated:      !!sovId && sovLines > 0,
          // true while the project is bidding: no pay app/SOV by design, not a failure.
          sovDeferred,
          sovLines,
          sovId,
          projectId:       takeoff.project_id,
          compliance,
          lienWaiversFiled: compliance.lienWaivers,
          w9RequestsFiled:  compliance.w9Requests,
          coiRequestsFiled: compliance.coiRequests,
          packages: createdPackages.map(p => ({
            id:    p.id,
            name:  p.name,
            div:   p.div,
            total: p.total,
          })),
        });

      } catch (err: unknown) {
        // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[takeoff/id/sage-auto-docs]', err);
    const message = "Auto-document generation failed.";
        console.error('[sage-auto-docs]', err);
        send('error', { message });
        done();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
