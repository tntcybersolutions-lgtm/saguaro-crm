/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/takeoff/[id]/sage-auto-docs  (SSE stream)
 *
 * Sage reads the completed takeoff and auto-creates ALL required documents:
 *  1. Bid packages per CSI division — Sage writes scope narratives, bid instructions,
 *     bond requirements, insurance minimums, and due dates
 *  2. Bid jacket PDFs for each package
 *  3. Schedule of Values (G703) tied to a new Pay Application
 *
 * All fields are populated with correct project name, dates, and trade-specific content.
 */

import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';

export const runtime = 'nodejs';
export const maxDuration = 120;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt$ = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function addDays(d: number): string {
  return new Date(Date.now() + d * 86_400_000).toISOString().split('T')[0];
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
  const { id: takeoffId } = await params;

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
          .single();

        if (!takeoff || takeoff.status !== 'complete') {
          send('error', { message: 'Takeoff not found or not yet complete. Run the analysis first.' });
          return done();
        }

        const { data: materialsData } = await supabase
          .from('takeoff_materials')
          .select('*')
          .eq('takeoff_id', takeoffId)
          .order('sort_order', { ascending: true });

        const materials = (materialsData || []) as RawMaterial[];
        if (materials.length === 0) {
          send('error', { message: 'No materials found in this takeoff.' });
          return done();
        }

        // ── 2. Load project ─────────────────────────────────────────────────
        const { data: project } = await supabase
          .from('projects')
          .select('*')
          .eq('id', takeoff.project_id)
          .single();

        const proj = (project || {}) as Record<string, any>;
        const projectName = String(proj.name || takeoff.project_name_detected || 'Project');
        const tenantId   = String(proj.tenant_id || user?.tenantId || '');
        const gcName     = String(proj.gc_name || 'General Contractor');
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
          .filter(([, items]) => items.reduce((s, i) => s + (i.total_cost || 0), 0) >= 500)
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
          const lines   = items
            .sort((a, b) => (b.total_cost || 0) - (a.total_cost || 0))
            .slice(0, 6)
            .map(i => `  ${i.description}: ${i.quantity} ${i.unit} @ $${i.unit_cost?.toFixed(2)}`)
            .join('\n');
          return `DIV ${div} — ${divName} (${fmt$(total)})\n${lines}`;
        }).join('\n\n');

        const sagePrompt = `You are Sage, Saguaro CRM's expert GC with 25+ years on commercial and residential projects.

Today's date: ${today}
Project: ${projectName}
Building type: ${takeoff.building_type || 'Commercial'}
Location: ${projState || 'AZ'}
Total project cost: ${fmt$(takeoff.total_cost || 0)}
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

        try {
          const aiRes = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            messages: [{ role: 'user', content: sagePrompt }],
          });

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
          console.error('[sage-auto-docs] Sage AI batch failed:', aiErr);
          // Non-fatal — continue with rule-based defaults
        }

        send('progress', { step: 3, pct: 35, message: `Creating ${divisions.length} bid packages in database...` });

        // ── 6. Create bid packages + line items ──────────────────────────────
        const createdPackages: Array<{ id: string; name: string; div: string; total: number }> = [];

        for (const [div, items] of divisions) {
          const total    = items.reduce((s, i) => s + (i.total_cost || 0), 0);
          const divName  = CSI_DIVISIONS[div]?.name || `Division ${div}`;
          const ai       = sagePackages[div];

          // Use Sage-written content, fall back to rules-based defaults
          const packageName   = ai?.name || `Division ${div} — ${divName}`;
          const scopeSummary  = items
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
              status:                'open',
              requires_bond:         requiresBond,
              insurance_requirements: {
                general_liability:   ai?.ins_gl  ?? ((['03','05','07','22','23','26'].includes(div)) ? 2_000_000 : 1_000_000),
                auto_liability:      ai?.ins_auto ?? 1_000_000,
                workers_compensation: ai?.ins_work ?? 500_000,
              },
            })
            .select()
            .single();

          if (pkgErr || !pkg) {
            console.error('[sage-auto-docs] create pkg error:', pkgErr);
            continue;
          }

          const pkgId = (pkg as any).id as string;

          // Insert line items
          if (items.length > 0) {
            await supabase.from('bid_package_items').insert(
              items.map(item => ({
                tenant_id:      tenantId,
                bid_package_id: pkgId,
                description:    item.description,
                quantity:       item.quantity,
                unit:           item.unit,
                unit_price:     item.unit_cost,
                total_amount:   item.total_cost,
                csi_code:       item.csi_code,
                notes:          '',
              }))
            );
          }

          createdPackages.push({ id: pkgId, name: packageName, div, total });
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
                gcAddress:            projAddr,
                gcLicense:            proj.gc_license,
                tradeName:            CSI_DIVISIONS[div]?.name || `Division ${div}`,
                dueDate:              addDays(pkg.total > 250_000 ? 21 : 14),
                scopeNarrative:       ai?.scope || `${pkg.name} scope of work for ${projectName}.`,
                csiSections:          [{
                  code:  div,
                  name:  CSI_DIVISIONS[div]?.name || '',
                  items: items.map(i => i.description),
                }],
                lineItems: items.map(i => ({
                  description: i.description,
                  quantity:    i.quantity,
                  unit:        i.unit,
                  unitPrice:   i.unit_cost,
                })),
                requiresBond:         ai?.bond ?? (pkg.total > 100_000),
                insuranceRequirements: {
                  general_liability:   ai?.ins_gl  ?? 1_000_000,
                  auto_liability:      ai?.ins_auto ?? 1_000_000,
                  workers_compensation: ai?.ins_work ?? 500_000,
                },
              });

              const pdfUrl = await (saveDocument as any)(
                takeoff.project_id,
                'bid-jacket',
                pdfBytes,
                { bidPackageId: pkg.id, takeoffId },
                tenantId
              );

              await supabase
                .from('bid_packages')
                .update({ jacket_pdf_url: pdfUrl })
                .eq('id', pkg.id);

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

        send('progress', { step: 5, pct: 80, message: 'Building Schedule of Values (G703)...' });

        // ── 8. Create SOV / Pay Application ─────────────────────────────────
        let sovId: string | null = null;

        try {
          const { data: lastApp } = await supabase
            .from('pay_applications')
            .select('app_number')
            .eq('project_id', takeoff.project_id)
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
              period_to:                   addDays(365),
              status:                      'draft',
              contract_sum:                takeoff.total_cost || 0,
              contract_sum_to_date:        takeoff.total_cost || 0,
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
            })
            .select()
            .single();

          if (!payErr && payApp) {
            sovId = (payApp as any).id as string;

            // Build SOV rows grouped by CSI division (one row per division = cleaner G703)
            const sovRows: Record<string, unknown>[] = [];
            let lineNum = 1;

            for (const [div, items] of divisions) {
              const divTotal  = items.reduce((s, i) => s + (i.total_cost || 0), 0);
              const divName   = sagePackages[div]?.name || CSI_DIVISIONS[div]?.name || `Division ${div}`;
              sovRows.push({
                tenant_id:        tenantId,
                project_id:       takeoff.project_id,
                pay_app_id:       sovId,
                line_number:      lineNum++,
                description:      `${div} — ${divName}`,
                scheduled_value:  divTotal,
                work_from_prev:   0,
                work_this_period: 0,
                materials_stored: 0,
                total_completed:  0,
                percent_complete: 0,
                balance_to_finish: divTotal,
                retainage:        0,
                csi_code:         div,
              });
            }

            await supabase.from('schedule_of_values').insert(sovRows);
          }
        } catch (sovErr) {
          console.error('[sage-auto-docs] SOV error:', sovErr);
          // Non-fatal
        }

        send('progress', { step: 6, pct: 95, message: 'Saving and finalizing...' });

        // ── 9. Done ──────────────────────────────────────────────────────────
        done({
          packagesCreated: createdPackages.length,
          jacketsGenerated,
          sovCreated:      !!sovId,
          sovId,
          projectId:       takeoff.project_id,
          packages: createdPackages.map(p => ({
            id:    p.id,
            name:  p.name,
            div:   p.div,
            total: p.total,
          })),
        });

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Auto-document generation failed.';
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
