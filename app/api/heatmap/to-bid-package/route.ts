import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { computeBom } from '@/lib/heatmap/bom';
import { summarizeCables } from '@/lib/heatmap/cabling-spec';
import { DEVICE_REGISTRY } from '@/lib/heatmap/models';
import type { HeatmapProject, Device } from '@/lib/heatmap/types';
import type { Pt } from '@/lib/heatmap/geometry';
import { must } from '@/lib/db-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

// Turn an approved coverage-heatmap design into a low-voltage bid package (bid jacket)
// with the materials, cabling, and labor as line items — one click from the tool.
const LABOR_PER_DROP = 85; // $ install labor estimate per cabled device

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const projectId = body.projectId || body.project_id;
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

  // Accept either one project, or all floors of a building.
  const floors: { name: string; proj: HeatmapProject }[] = Array.isArray(body.floors) && body.floors.length
    ? body.floors.filter((f: any) => f?.proj).map((f: any) => ({ name: f.name || 'Floor', proj: f.proj as HeatmapProject }))
    : (body.project ? [{ name: 'Floor 1', proj: body.project as HeatmapProject }] : []);
  if (!floors.length) return NextResponse.json({ error: 'No design provided' }, { status: 400 });

  const allDevices: Device[] = floors.flatMap((f) => f.proj.devices || []);
  if (!allDevices.length) return NextResponse.json({ error: 'The design has no devices' }, { status: 400 });

  // ── materials (BOM) ──
  const bom = computeBom(allDevices);
  const lineItems: any[] = [];
  for (const r of bom.rows) {
    lineItems.push({ description: r.item, quantity: r.qty, unit: 'ea', unitPrice: r.unit || null, totalAmount: r.ext || null, csiCode: '27 00 00' });
  }

  // ── cabling (per floor, rack = a placed gateway/switch else plan center) ──
  let cableCost = 0, cableFeet = 0;
  const cableTally = new Map<string, { name: string; feet: number; cost: number; unit: number }>();
  for (const f of floors) {
    const p = f.proj; if (!p.devices?.length) continue;
    const rack: Pt = (p.devices.find((d) => d.typeId === 'iot_gateway' || d.typeId === 'smart_switch')?.pos) || { x: p.imgW / 2, y: p.imgH / 2 };
    const cs = summarizeCables(p, rack);
    for (const c of cs.byCable) {
      const cur = cableTally.get(c.cable.id) || { name: c.cable.name, feet: 0, cost: 0, unit: c.cable.costPerFt };
      cur.feet += c.feet; cur.cost += c.cost; cableTally.set(c.cable.id, cur);
    }
    cableCost += cs.totalCost; cableFeet += cs.totalFeet;
  }
  for (const c of cableTally.values()) {
    lineItems.push({ description: `${c.name} — structured cabling`, quantity: c.feet, unit: 'ft', unitPrice: c.unit, totalAmount: c.cost, csiCode: '27 05 00' });
  }

  // ── labor, split the way subs actually price it: pulls vs device install ──
  const pulls = bom.cat6Runs || 0;
  const PULL_RATE = 45; // $/run — pull, dress & label a home-run to the MDF
  const pullTotal = pulls * PULL_RATE;
  if (pulls) lineItems.push({ description: 'Cable pulls — home-run to MDF, dressed & labeled (per run)', quantity: pulls, unit: 'ea', unitPrice: PULL_RATE, totalAmount: pullTotal, csiCode: '27 05 00' });
  const installTotal = allDevices.length * LABOR_PER_DROP;
  lineItems.push({ description: 'Device install, program & commission (per device)', quantity: allDevices.length, unit: 'ea', unitPrice: LABOR_PER_DROP, totalAmount: installTotal, csiCode: '27 05 00' });
  const laborTotal = pullTotal + installTotal;

  // ── counts + scope narrative ──
  const counts: Record<string, number> = {};
  for (const d of allDevices) counts[d.typeId] = (counts[d.typeId] || 0) + 1;
  const countLine = Object.entries(counts).map(([t, n]) => `${n} × ${DEVICE_REGISTRY[t as keyof typeof DEVICE_REGISTRY]?.label || t}`).join(', ');
  const budget = (bom.total || 0) + cableCost + laborTotal;
  const scope = `Furnish and install the low-voltage systems per the Saguaro coverage design across ${floors.length} floor${floors.length !== 1 ? 's' : ''}: ${countLine}. `
    + `Includes ${cableFeet.toLocaleString()} ft of structured cabling home-run to the MDF (terminated on keystone jacks at the device, punched to the patch panel at the rack), PoE from the recommended ${bom.recSwitch?.model || 'PoE switch'}`
    + `${bom.recNvr ? ` and ${bom.recNvr.model} recorder` : ''}. Test and certify all runs. See the attached coverage report for placements, power settings, and cable schedule.`;

  // ── create the bid package + items ──
  const db = createServerClient() as any;
  const { data: pkg, error } = await db.from('bid_packages').insert({
    tenant_id: user.tenantId,
    created_by: user.id,
    project_id: projectId,
    name: body.name || 'Low Voltage & Networking',
    trade: 'Low Voltage & Networking',
    description: `Generated from the Coverage Heatmap design (${allDevices.length} devices, ${cableFeet.toLocaleString()} ft cable).`,
    scope_of_work: scope,
    scope_summary: countLine,
    status: 'open',
    budget_estimate: Math.round(budget),
    csi_codes: ['27 00 00', '28 00 00'],
  }).select().single();
  if (error) {
    console.error('[heatmap/to-bid-package] package insert failed', error);
    return NextResponse.json({ error: 'Could not create the bid package. Please try again.' }, { status: 500 });
  }

  const pkgId = (pkg as any).id;
  if (lineItems.length) {
    const { error: itemsErr } = await db.from('bid_package_items').insert(
      lineItems.map((item, index) => ({
        tenant_id: user.tenantId,
        bid_package_id: pkgId,
        sort_order: index, // materials, cabling, then labor — the bid form's order
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unitPrice,
        total_amount: item.totalAmount,
        csi_code: item.csiCode,
      })),
    );
    if (itemsErr) {
      // Don't leave a half-built package (header with no line items). Best-effort
      // rollback of the header, then surface a clean error.
      console.error('[heatmap/to-bid-package] line-item insert failed', itemsErr);
      await must(db.from('bid_packages').delete().eq('id', pkgId).eq('tenant_id', user.tenantId), 'bid_packages delete');
      return NextResponse.json({ error: 'Could not save the bid package line items. Please try again.' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, bidPackageId: pkgId, budget: Math.round(budget), lineItems: lineItems.length });
}
