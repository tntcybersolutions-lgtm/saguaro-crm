import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyHeatmapShareToken } from '@/lib/heatmap/share';
import { computeBom } from '@/lib/heatmap/bom';
import { summarizeCables } from '@/lib/heatmap/cabling-spec';
import { DEVICE_REGISTRY } from '@/lib/heatmap/models';
import type { HeatmapProject, Device } from '@/lib/heatmap/types';
import type { Pt } from '@/lib/heatmap/geometry';
import { must } from '@/lib/db-write';
import { requestDay } from '@/lib/time-zone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST /api/heatmap/approve  — the design-to-money loop no competitor has.
 * A client on the (token-gated, no-auth) share page approves the coverage design; this validates the
 * SAME share token the read route uses, then auto-creates a low-voltage bid package (BOM + cabling +
 * labor) under the OWNER's tenant and records who approved it (audit trail). Idempotent: a second
 * approval returns the already-created package instead of duplicating it.
 */
const LABOR_PER_DROP = 85; // $ install labor per cabled device (matches to-bid-package)

function extractFloors(data: any): { name: string; proj: HeatmapProject }[] {
  if (data && data.multifloor && Array.isArray(data.floors)) {
    return data.floors
      .filter((f: any) => f?.proj && Array.isArray(f.proj.devices))
      .map((f: any) => ({ name: f.name || 'Floor', proj: f.proj as HeatmapProject }));
  }
  if (data && Array.isArray(data.devices)) return [{ name: data.name || 'Design', proj: data as HeatmapProject }];
  return [];
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const id = String(body.id || '');
  const t = String(body.t || '');
  const e = Number(body.e || 0);
  const approverName = String(body.approverName || '').trim().slice(0, 120);
  const approverEmail = body.approverEmail ? String(body.approverEmail).trim().slice(0, 160) : null;
  if (!id || !t || !e) return NextResponse.json({ error: 'This approval link is incomplete.' }, { status: 400 });
  if (!approverName) return NextResponse.json({ error: 'Please type your name to approve.' }, { status: 400 });

  const db = createServerClient() as any;
  const { data: row, error } = await db
    .from('heatmap_designs')
    .select('id, tenant_id, project_id, name, data, created_by, share_nonce, share_expires_at, approved_bid_package_id')
    .eq('id', id)
    .single();
  if (error || !row) return NextResponse.json({ error: 'Design not found' }, { status: 404 });

  // Validate against the CURRENT nonce + stored expiry — identical rule to the read route, so a
  // revoked/expired link can't approve.
  const storedExp = row.share_expires_at ? Date.parse(row.share_expires_at) : 0;
  const valid =
    !!storedExp && e === storedExp && Date.now() <= storedExp &&
    verifyHeatmapShareToken(id, row.share_nonce, e, t);
  if (!valid) return NextResponse.json({ error: 'This link is invalid, expired, or has been revoked.' }, { status: 403 });

  // Idempotency: already approved → return the existing package, never duplicate.
  if (row.approved_bid_package_id) {
    return NextResponse.json({ ok: true, alreadyApproved: true, bidPackageId: row.approved_bid_package_id });
  }

  const floors = extractFloors(row.data);
  const allDevices: Device[] = floors.flatMap((f) => f.proj.devices || []);
  if (!allDevices.length) return NextResponse.json({ error: 'This design has no devices to bid.' }, { status: 400 });

  // ── BOM + cabling + labor (mirrors to-bid-package) ──
  const bom = computeBom(allDevices);
  const lineItems: any[] = [];
  for (const r of bom.rows) lineItems.push({ description: r.item, quantity: r.qty, unit: 'ea', unitPrice: r.unit || null, totalAmount: r.ext || null, csiCode: '27 00 00' });

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
  for (const c of cableTally.values()) lineItems.push({ description: `${c.name} — structured cabling`, quantity: c.feet, unit: 'ft', unitPrice: c.unit, totalAmount: c.cost, csiCode: '27 05 00' });

  const laborTotal = allDevices.length * LABOR_PER_DROP;
  lineItems.push({ description: 'Install labor — terminate, test & certify (per device/drop)', quantity: allDevices.length, unit: 'ea', unitPrice: LABOR_PER_DROP, totalAmount: laborTotal, csiCode: '27 05 00' });

  const counts: Record<string, number> = {};
  for (const d of allDevices) counts[d.typeId] = (counts[d.typeId] || 0) + 1;
  const countLine = Object.entries(counts).map(([tp, n]) => `${n} × ${DEVICE_REGISTRY[tp as keyof typeof DEVICE_REGISTRY]?.label || tp}`).join(', ');
  const budget = (bom.total || 0) + cableCost + laborTotal;

  // No linked project → record the approval, but a project-scoped bid can't be created without one.
  if (!row.project_id) {
    await must(db.from('heatmap_designs')
      .update({ approved_by: approverName, approved_email: approverEmail, approved_at: new Date().toISOString() })
      .eq('id', id).eq('tenant_id', row.tenant_id), 'heatmap_designs write');
    return NextResponse.json({ ok: true, bidPackageId: null, budget: Math.round(budget), note: "Approval recorded — this design isn't linked to a project, so the team will create the bid manually." });
  }

  // The day it was approved, on the contractor's calendar (approver's device zone, else the company's).
  const { today: approvedOn } = await requestDay(req.headers, db, row.tenant_id, 'heatmap/approve');
  const scope = `CLIENT-APPROVED low-voltage design (${allDevices.length} devices across ${floors.length} floor${floors.length !== 1 ? 's' : ''}): ${countLine}. `
    + `Includes ${cableFeet.toLocaleString()} ft structured cabling home-run to the MDF, PoE from ${bom.recSwitch?.model || 'the PoE switch'}${bom.recNvr ? ` + ${bom.recNvr.model} recorder` : ''}; terminate, test and certify all runs. `
    + `Approved by ${approverName}${approverEmail ? ` (${approverEmail})` : ''} via share link on ${approvedOn}.`;

  const { data: pkg, error: pkgErr } = await db.from('bid_packages').insert({
    tenant_id: row.tenant_id,
    created_by: row.created_by,
    project_id: row.project_id,
    name: `${row.name || 'Coverage design'} — Client-approved`,
    trade: 'Low Voltage / Structured Cabling',
    description: `Auto-created from a CLIENT-APPROVED coverage design (${allDevices.length} devices, ${cableFeet.toLocaleString()} ft cable). Approved by ${approverName}.`,
    scope_of_work: scope,
    scope_summary: countLine,
    status: 'open',
    budget_estimate: Math.round(budget),
    csi_codes: ['27 00 00', '28 00 00'],
  }).select().single();
  if (pkgErr) {
    console.error('[heatmap/approve] package insert failed', pkgErr);
    return NextResponse.json({ error: 'Could not create the bid. Please try again.' }, { status: 500 });
  }
  const pkgId = (pkg as any).id;

  if (lineItems.length) {
    const { error: itemsErr } = await db.from('bid_package_items').insert(
      lineItems.map((item, index) => ({
        tenant_id: row.tenant_id, bid_package_id: pkgId, sort_order: index,
        description: item.description, quantity: item.quantity, unit: item.unit,
        unit_price: item.unitPrice, total_amount: item.totalAmount, csi_code: item.csiCode,
      })),
    );
    if (itemsErr) {
      console.error('[heatmap/approve] line-item insert failed', itemsErr);
      await must(db.from('bid_packages').delete().eq('id', pkgId).eq('tenant_id', row.tenant_id), 'bid_packages delete');
      return NextResponse.json({ error: 'Could not save the bid line items. Please try again.' }, { status: 500 });
    }
  }

  // Record the approval (audit trail + idempotency lock).
  await must(db.from('heatmap_designs')
    .update({ approved_by: approverName, approved_email: approverEmail, approved_at: new Date().toISOString(), approved_bid_package_id: pkgId })
    .eq('id', id).eq('tenant_id', row.tenant_id), 'heatmap_designs write');

  return NextResponse.json({ ok: true, bidPackageId: pkgId, budget: Math.round(budget) });
}
