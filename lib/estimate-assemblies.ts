/**
 * lib/estimate-assemblies.ts
 *
 * Assemblies — one pick that expands into every line the work actually takes.
 *
 * This is the other half of what Buildern has that we did not. An estimator
 * pricing 240 linear feet of interior partition does not want to type eight
 * lines; they want to say "partition, 240 LF" and have the studs, track,
 * drywall, screws, tape and compound appear with the right quantities against
 * them.
 *
 * WHAT IS ACTUALLY IN HERE. The quantity logic is the valuable part and it is
 * standards-based, not invented: studs at 16" on centre, 32 SF to a 4x8 sheet,
 * two sheets of board for a two-sided wall, 1.75 lb of screws per 1,000 SF. It
 * is written as arithmetic in the same formula language the grid uses, so an
 * estimator can read exactly why a quantity came out the way it did and change
 * it — rather than trusting a multiplier baked into someone's software.
 *
 * WHAT IS NOT. The unit costs are placeholders. Real prices are regional,
 * seasonal and specific to your suppliers, and software that ships confident
 * national pricing is software that quietly loses jobs. Every expanded line is
 * marked so the grid can flag it until the estimator has priced it, and
 * `assemblyNeedsPricing` reports which ones are still at their default.
 */

import { evaluateExpression, FormulaError } from './estimate-formula';
import type { GridRow } from './estimate-grid';

export interface AssemblyComponent {
  description: string;
  csi_code?: string;
  unit: string;
  /**
   * Quantity per unit of the driver, as an expression over DRIVER.
   * Written out rather than pre-multiplied so the reasoning is legible.
   */
  qty: string;
  /** Waste factor for this component, percent. */
  waste_factor_pct?: number;
  unit_material_cost?: number;
  unit_labor_cost?: number;
  unit_equipment_cost?: number;
  unit_sub_cost?: number;
  /** Why the quantity is what it is. Shown in the grid's notes column. */
  basis?: string;
}

export interface Assembly {
  id: string;
  name: string;
  /** CSI division the expanded lines land in. */
  division: string;
  /** What the driver quantity measures — LF of wall, SF of floor, EA. */
  driverUnit: string;
  driverLabel: string;
  description: string;
  components: AssemblyComponent[];
}

/* ── the starter library ─────────────────────────────────────────────────── */

export const ASSEMBLIES: Assembly[] = [
  {
    id: 'partition-stud-gwb-2side',
    name: 'Interior partition — 3⅝" metal stud, ⅝" GWB both sides',
    division: '09',
    driverUnit: 'LF',
    driverLabel: 'Linear feet of wall',
    description: 'Non-rated partition to 9ft. Studs 16" o.c., board both faces, taped and finished.',
    components: [
      { description: '3⅝" metal stud, 9ft', csi_code: '09 22 16', unit: 'EA',
        qty: '=CEILING(DRIVER/16*12,1)+1', waste_factor_pct: 5, unit_material_cost: 8.75, unit_labor_cost: 6.5,
        basis: 'One stud per 16 inches on centre, plus one to close the run' },
      { description: '3⅝" track, 10ft', csi_code: '09 22 16', unit: 'EA',
        qty: '=CEILING(DRIVER*2/10,1)', waste_factor_pct: 5, unit_material_cost: 7.4, unit_labor_cost: 3.2,
        basis: 'Top and bottom track, sold in 10ft lengths' },
      { description: '⅝" Type X gypsum board 4x8', csi_code: '09 29 00', unit: 'EA',
        qty: '=CEILING(DRIVER*9*2/32,1)', waste_factor_pct: 10, unit_material_cost: 14.2, unit_labor_cost: 11,
        basis: '9ft tall, two faces, 32 SF per 4x8 sheet' },
      { description: 'Joint compound and tape', csi_code: '09 29 00', unit: 'SF',
        qty: '=DRIVER*9*2', unit_material_cost: 0.18, unit_labor_cost: 0.95,
        basis: 'Finished area, both faces' },
      { description: 'Drywall screws', csi_code: '09 29 00', unit: 'LB',
        qty: '=ROUND(DRIVER*9*2/1000*1.75,1)', unit_material_cost: 2.4,
        basis: '1.75 lb per 1,000 SF of board' },
    ],
  },
  {
    id: 'partition-rated-1hr',
    name: '1-hour rated partition — 3⅝" stud, two layers ⅝" GWB',
    division: '09',
    driverUnit: 'LF',
    driverLabel: 'Linear feet of wall',
    description: 'UL-rated assembly to deck. Double-layer board one or both faces per detail.',
    components: [
      { description: '3⅝" metal stud, 10ft', csi_code: '09 22 16', unit: 'EA',
        qty: '=CEILING(DRIVER/16*12,1)+1', waste_factor_pct: 5, unit_material_cost: 9.6, unit_labor_cost: 7.25,
        basis: 'Studs 16" o.c. to deck' },
      { description: '3⅝" track, 10ft', csi_code: '09 22 16', unit: 'EA',
        qty: '=CEILING(DRIVER*2/10,1)', waste_factor_pct: 5, unit_material_cost: 7.4, unit_labor_cost: 3.2 },
      { description: '⅝" Type X gypsum board 4x8 (2 layers, 2 faces)', csi_code: '09 29 00', unit: 'EA',
        qty: '=CEILING(DRIVER*10*4/32,1)', waste_factor_pct: 10, unit_material_cost: 14.2, unit_labor_cost: 11,
        basis: '10ft tall × two faces × two layers, 32 SF per sheet' },
      { description: 'Safing / firestop at deck', csi_code: '07 84 00', unit: 'LF',
        qty: '=DRIVER', unit_material_cost: 3.1, unit_labor_cost: 4.4,
        basis: 'Head-of-wall joint the full run' },
      { description: 'Joint compound and tape', csi_code: '09 29 00', unit: 'SF',
        qty: '=DRIVER*10*2', unit_material_cost: 0.18, unit_labor_cost: 0.95 },
    ],
  },
  {
    id: 'slab-on-grade',
    name: 'Slab on grade — 4" concrete, WWF, vapour barrier',
    division: '03',
    driverUnit: 'SF',
    driverLabel: 'Square feet of slab',
    description: '4" slab over 10-mil vapour barrier on compacted base, with welded wire fabric.',
    components: [
      { description: 'Concrete 3000 psi, 4" slab', csi_code: '03 30 00', unit: 'CY',
        qty: '=ROUND(DRIVER*4/12/27,2)', waste_factor_pct: 8, unit_material_cost: 148, unit_labor_cost: 34,
        basis: '4 inches deep, 27 cubic feet to the cubic yard' },
      { description: '10-mil vapour barrier', csi_code: '07 26 00', unit: 'SF',
        qty: '=DRIVER', waste_factor_pct: 12, unit_material_cost: 0.32, unit_labor_cost: 0.22,
        basis: 'Slab area plus lap and turn-up' },
      { description: '6x6 W2.9 welded wire fabric', csi_code: '03 22 00', unit: 'SF',
        qty: '=DRIVER', waste_factor_pct: 12, unit_material_cost: 0.41, unit_labor_cost: 0.28 },
      { description: 'Fine grade and compaction', csi_code: '31 22 00', unit: 'SF',
        qty: '=DRIVER', unit_labor_cost: 0.45, unit_equipment_cost: 0.18 },
      { description: 'Power trowel finish', csi_code: '03 35 00', unit: 'SF',
        qty: '=DRIVER', unit_labor_cost: 0.62, unit_equipment_cost: 0.09 },
      { description: 'Cure and seal', csi_code: '03 39 00', unit: 'SF',
        qty: '=DRIVER', unit_material_cost: 0.14, unit_labor_cost: 0.11 },
    ],
  },
  {
    id: 'acoustic-ceiling',
    name: 'Suspended acoustic ceiling — 2x4 grid and tile',
    division: '09',
    driverUnit: 'SF',
    driverLabel: 'Square feet of ceiling',
    description: 'Standard 15/16" exposed tee grid with lay-in acoustic panels.',
    components: [
      { description: '2x4 lay-in acoustic panel', csi_code: '09 51 00', unit: 'EA',
        qty: '=CEILING(DRIVER/8,1)', waste_factor_pct: 8, unit_material_cost: 6.8, unit_labor_cost: 2.4,
        basis: '8 SF per 2x4 panel' },
      { description: 'Main tee 12ft', csi_code: '09 51 00', unit: 'EA',
        qty: '=CEILING(DRIVER/4/12,1)', waste_factor_pct: 6, unit_material_cost: 9.2, unit_labor_cost: 4.1,
        basis: 'Mains at 4ft on centre' },
      { description: 'Cross tee 4ft', csi_code: '09 51 00', unit: 'EA',
        qty: '=CEILING(DRIVER/8*2,1)', waste_factor_pct: 6, unit_material_cost: 2.9, unit_labor_cost: 1.6 },
      { description: 'Wall angle 10ft', csi_code: '09 51 00', unit: 'EA',
        qty: '=CEILING(SQRT(DRIVER)*4/10,1)', waste_factor_pct: 10, unit_material_cost: 5.4, unit_labor_cost: 2.2,
        basis: 'Perimeter estimated from a square room — adjust for the real shape' },
      { description: 'Hanger wire and clips', csi_code: '09 51 00', unit: 'EA',
        qty: '=CEILING(DRIVER/16,1)', unit_material_cost: 1.15, unit_labor_cost: 1.9,
        basis: 'One hanger per 16 SF' },
    ],
  },
  {
    id: 'paint-interior-walls',
    name: 'Interior paint — primer plus two coats',
    division: '09',
    driverUnit: 'SF',
    driverLabel: 'Square feet of wall',
    description: 'One coat primer, two finish coats, cut and roll.',
    components: [
      { description: 'Primer', csi_code: '09 91 23', unit: 'GAL',
        qty: '=ROUND(DRIVER/350,2)', waste_factor_pct: 5, unit_material_cost: 28,
        basis: '350 SF per gallon' },
      { description: 'Finish paint (2 coats)', csi_code: '09 91 23', unit: 'GAL',
        qty: '=ROUND(DRIVER*2/380,2)', waste_factor_pct: 5, unit_material_cost: 42,
        basis: 'Two coats at 380 SF per gallon' },
      { description: 'Painting labor', csi_code: '09 91 23', unit: 'SF',
        qty: '=DRIVER', unit_labor_cost: 0.78 },
      { description: 'Masking, drop cloths, sundries', csi_code: '09 91 23', unit: 'SF',
        qty: '=DRIVER', unit_material_cost: 0.06 },
    ],
  },
  {
    id: 'door-hm-single',
    name: 'Single hollow metal door — frame, hardware, install',
    division: '08',
    driverUnit: 'EA',
    driverLabel: 'Number of door openings',
    description: '3070 HM door in HM frame with lockset, closer, hinges and stop.',
    components: [
      { description: 'Hollow metal door 3070', csi_code: '08 11 13', unit: 'EA', qty: '=DRIVER', unit_material_cost: 385, unit_labor_cost: 95 },
      { description: 'Hollow metal frame', csi_code: '08 11 13', unit: 'EA', qty: '=DRIVER', unit_material_cost: 245, unit_labor_cost: 85 },
      { description: 'Lockset, grade 1', csi_code: '08 71 00', unit: 'EA', qty: '=DRIVER', unit_material_cost: 210, unit_labor_cost: 45 },
      { description: 'Closer', csi_code: '08 71 00', unit: 'EA', qty: '=DRIVER', unit_material_cost: 165, unit_labor_cost: 38 },
      { description: 'Butt hinges (3 per leaf)', csi_code: '08 71 00', unit: 'EA', qty: '=DRIVER*3', unit_material_cost: 14, unit_labor_cost: 6 },
      { description: 'Wall stop and silencers', csi_code: '08 71 00', unit: 'EA', qty: '=DRIVER', unit_material_cost: 12, unit_labor_cost: 8 },
      { description: 'Paint door and frame', csi_code: '09 91 23', unit: 'EA', qty: '=DRIVER', unit_material_cost: 18, unit_labor_cost: 55 },
    ],
  },
  {
    id: 'vct-flooring',
    name: 'Resilient tile flooring — VCT with base',
    division: '09',
    driverUnit: 'SF',
    driverLabel: 'Square feet of floor',
    description: 'VCT over prepared slab, with 4" rubber base at the perimeter.',
    components: [
      { description: 'VCT 12x12', csi_code: '09 65 19', unit: 'SF', qty: '=DRIVER', waste_factor_pct: 10, unit_material_cost: 1.35, unit_labor_cost: 1.55 },
      { description: 'Adhesive', csi_code: '09 65 19', unit: 'GAL', qty: '=ROUND(DRIVER/250,2)', unit_material_cost: 34 },
      { description: 'Floor prep and skim', csi_code: '09 05 61', unit: 'SF', qty: '=DRIVER', unit_material_cost: 0.22, unit_labor_cost: 0.48 },
      { description: '4" rubber base', csi_code: '09 65 13', unit: 'LF',
        qty: '=CEILING(SQRT(DRIVER)*4,1)', waste_factor_pct: 8, unit_material_cost: 1.85, unit_labor_cost: 1.4,
        basis: 'Perimeter estimated from a square room — adjust for the real shape' },
      { description: 'Seal and initial finish', csi_code: '09 65 19', unit: 'SF', qty: '=DRIVER', unit_material_cost: 0.11, unit_labor_cost: 0.31 },
    ],
  },
  {
    id: 'branch-lighting-2x4',
    name: 'Lighting branch — 2x4 LED troffer with circuit',
    division: '26',
    driverUnit: 'EA',
    driverLabel: 'Number of fixtures',
    description: 'Recessed 2x4 LED troffer, whips, branch wiring and share of circuitry.',
    components: [
      { description: '2x4 LED troffer', csi_code: '26 51 00', unit: 'EA', qty: '=DRIVER', unit_material_cost: 118, unit_labor_cost: 42 },
      { description: 'Fixture whip, 6ft', csi_code: '26 05 19', unit: 'EA', qty: '=DRIVER', unit_material_cost: 14, unit_labor_cost: 9 },
      { description: '#12 THHN branch wire', csi_code: '26 05 19', unit: 'LF',
        qty: '=DRIVER*35', waste_factor_pct: 8, unit_material_cost: 0.42, unit_labor_cost: 0.38,
        basis: '35 LF of wire per fixture on an average branch run' },
      { description: '½" EMT conduit', csi_code: '26 05 33', unit: 'LF',
        qty: '=DRIVER*12', waste_factor_pct: 8, unit_material_cost: 1.18, unit_labor_cost: 2.35 },
      { description: '4" square box and ring', csi_code: '26 05 33', unit: 'EA', qty: '=DRIVER', unit_material_cost: 6.4, unit_labor_cost: 11 },
      { description: 'Circuit share — breaker and panel', csi_code: '26 24 16', unit: 'EA',
        qty: '=CEILING(DRIVER/8,1)', unit_material_cost: 48, unit_labor_cost: 65,
        basis: 'One 20A circuit per 8 fixtures' },
    ],
  },
  {
    id: 'restroom-fixture-group',
    name: 'Restroom rough-in — WC, lavatory, carrier and trim',
    division: '22',
    driverUnit: 'EA',
    driverLabel: 'Number of fixture groups',
    description: 'One water closet and one lavatory with rough-in, carrier and trim.',
    components: [
      { description: 'Water closet, floor mount', csi_code: '22 42 13', unit: 'EA', qty: '=DRIVER', unit_material_cost: 420, unit_labor_cost: 185 },
      { description: 'Lavatory with faucet', csi_code: '22 42 16', unit: 'EA', qty: '=DRIVER', unit_material_cost: 340, unit_labor_cost: 165 },
      { description: 'Carrier', csi_code: '22 05 16', unit: 'EA', qty: '=DRIVER', unit_material_cost: 275, unit_labor_cost: 120 },
      { description: 'Waste and vent rough-in', csi_code: '22 13 16', unit: 'EA', qty: '=DRIVER', unit_material_cost: 165, unit_labor_cost: 240 },
      { description: 'Domestic water rough-in', csi_code: '22 11 16', unit: 'EA', qty: '=DRIVER', unit_material_cost: 135, unit_labor_cost: 195 },
      { description: 'Trim, stops and supplies', csi_code: '22 42 39', unit: 'EA', qty: '=DRIVER*2', unit_material_cost: 42, unit_labor_cost: 28 },
    ],
  },
  {
    id: 'vav-box-hookup',
    name: 'VAV box — install, duct connection and controls',
    division: '23',
    driverUnit: 'EA',
    driverLabel: 'Number of VAV boxes',
    description: 'Terminal unit set, connected, insulated and controlled.',
    components: [
      { description: 'VAV terminal unit', csi_code: '23 36 00', unit: 'EA', qty: '=DRIVER', unit_material_cost: 780, unit_labor_cost: 220 },
      { description: 'Flex duct connection', csi_code: '23 33 00', unit: 'EA', qty: '=DRIVER', unit_material_cost: 95, unit_labor_cost: 85 },
      { description: 'Sheet metal downstream duct', csi_code: '23 31 13', unit: 'LB',
        qty: '=DRIVER*85', waste_factor_pct: 10, unit_material_cost: 2.85, unit_labor_cost: 3.4,
        basis: '85 lb of duct per box on an average layout' },
      { description: 'Duct insulation', csi_code: '23 07 13', unit: 'SF', qty: '=DRIVER*110', unit_material_cost: 0.95, unit_labor_cost: 1.25 },
      { description: 'DDC controller and actuator', csi_code: '23 09 23', unit: 'EA', qty: '=DRIVER', unit_material_cost: 415, unit_labor_cost: 195 },
      { description: 'Control wiring', csi_code: '23 09 23', unit: 'LF', qty: '=DRIVER*60', waste_factor_pct: 8, unit_material_cost: 0.38, unit_labor_cost: 0.55 },
    ],
  },
  {
    id: 'footing-continuous',
    name: 'Continuous footing — 24" × 12" with rebar',
    division: '03',
    driverUnit: 'LF',
    driverLabel: 'Linear feet of footing',
    description: 'Excavate, form, reinforce and place a continuous strip footing.',
    components: [
      { description: 'Concrete 3000 psi', csi_code: '03 30 00', unit: 'CY',
        qty: '=ROUND(DRIVER*2*1/27,2)', waste_factor_pct: 8, unit_material_cost: 148, unit_labor_cost: 42,
        basis: '24" wide × 12" deep, 27 CF to the CY' },
      { description: 'Formwork, both sides', csi_code: '03 11 00', unit: 'SF',
        qty: '=DRIVER*2', waste_factor_pct: 15, unit_material_cost: 1.85, unit_labor_cost: 4.2,
        basis: '1ft tall each side' },
      { description: '#4 rebar, 3 continuous bars', csi_code: '03 21 00', unit: 'LB',
        qty: '=ROUND(DRIVER*3*0.668,1)', waste_factor_pct: 10, unit_material_cost: 0.94, unit_labor_cost: 0.72,
        basis: '#4 bar weighs 0.668 lb per foot' },
      { description: 'Trench excavation', csi_code: '31 23 16', unit: 'CY',
        qty: '=ROUND(DRIVER*2.5*1.5/27,2)', unit_labor_cost: 12, unit_equipment_cost: 18 },
    ],
  },
  {
    id: 'roof-tpo-mechanically-attached',
    name: 'Roofing — 60-mil TPO, mechanically attached over ISO',
    division: '07',
    driverUnit: 'SF',
    driverLabel: 'Square feet of roof',
    description: 'Single-ply membrane over polyiso to R-30, with fasteners and edge metal.',
    components: [
      { description: '60-mil TPO membrane', csi_code: '07 54 23', unit: 'SF', qty: '=DRIVER', waste_factor_pct: 12, unit_material_cost: 1.15, unit_labor_cost: 1.05 },
      { description: 'Polyiso insulation, 2 layers', csi_code: '07 22 00', unit: 'SF', qty: '=DRIVER*2', waste_factor_pct: 8, unit_material_cost: 0.92, unit_labor_cost: 0.42 },
      { description: 'Plates and fasteners', csi_code: '07 54 23', unit: 'EA',
        qty: '=CEILING(DRIVER/3.2,1)', unit_material_cost: 0.38, unit_labor_cost: 0.22,
        basis: 'One fastener per 3.2 SF in the field' },
      { description: 'Edge metal and coping', csi_code: '07 71 00', unit: 'LF',
        qty: '=CEILING(SQRT(DRIVER)*4,1)', waste_factor_pct: 8, unit_material_cost: 8.4, unit_labor_cost: 6.2,
        basis: 'Perimeter estimated from a square roof — adjust for the real shape' },
      { description: 'Cover board', csi_code: '07 22 00', unit: 'SF', qty: '=DRIVER', waste_factor_pct: 8, unit_material_cost: 0.58, unit_labor_cost: 0.34 },
    ],
  },
];

export const ASSEMBLY_BY_ID: Record<string, Assembly> = Object.fromEntries(ASSEMBLIES.map((a) => [a.id, a]));

/* ── expansion ───────────────────────────────────────────────────────────── */

export interface ExpandedLine extends GridRow {
  /** The assembly this line came from, so the grid can group and re-expand. */
  assembly_id: string;
  /** True while the line still carries the library's placeholder cost. */
  needs_pricing: boolean;
}

export interface ExpansionResult {
  lines: ExpandedLine[];
  /** Components whose quantity expression could not be evaluated. */
  errors: { description: string; code: string }[];
  driverQty: number;
  /** Total cost of the expansion at the library's placeholder prices. */
  indicativeTotal: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Expand an assembly at a given driver quantity.
 *
 * A component whose expression fails is reported and left out rather than
 * silently landing at zero — a missing line in a bid is survivable if you are
 * told about it, and fatal if you are not.
 */
export function expandAssembly(
  assembly: Assembly,
  driverQty: number,
  opts: { startSortOrder?: number } = {},
): ExpansionResult {
  const errors: { description: string; code: string }[] = [];
  const lines: ExpandedLine[] = [];
  let sort = opts.startSortOrder ?? 0;

  const driver = Number(driverQty);
  if (!Number.isFinite(driver) || driver <= 0) {
    return { lines: [], errors: [{ description: assembly.name, code: '#NUM!' }], driverQty: 0, indicativeTotal: 0 };
  }

  for (const c of assembly.components) {
    let qty: number;
    try {
      qty = evaluateExpression(c.qty, { DRIVER: driver });
    } catch (e) {
      errors.push({ description: c.description, code: e instanceof FormulaError ? e.code : '#VALUE!' });
      continue;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      errors.push({ description: c.description, code: '#NUM!' });
      continue;
    }

    const priced = (c.unit_material_cost ?? 0) + (c.unit_labor_cost ?? 0)
      + (c.unit_equipment_cost ?? 0) + (c.unit_sub_cost ?? 0);

    lines.push({
      csi_division: assembly.division,
      csi_code: c.csi_code ?? null,
      description: c.description,
      quantity: round2(qty),
      unit: c.unit,
      waste_factor_pct: c.waste_factor_pct ?? 0,
      unit_material_cost: c.unit_material_cost ?? null,
      unit_labor_cost: c.unit_labor_cost ?? null,
      unit_equipment_cost: c.unit_equipment_cost ?? null,
      unit_sub_cost: c.unit_sub_cost ?? null,
      /* The basis travels with the line. Six months on, "why is this 180?" has
         an answer written on the row instead of in somebody's memory. */
      notes: c.basis ? `${assembly.name} · ${c.basis}` : assembly.name,
      sort_order: sort++,
      assembly_id: assembly.id,
      needs_pricing: priced > 0,
    });
  }

  const indicativeTotal = round2(lines.reduce((s, l) => {
    const adj = (Number(l.quantity) || 0) * (1 + (Number(l.waste_factor_pct) || 0) / 100);
    return s + adj * ((Number(l.unit_material_cost) || 0) + (Number(l.unit_labor_cost) || 0)
      + (Number(l.unit_equipment_cost) || 0) + (Number(l.unit_sub_cost) || 0));
  }, 0));

  return { lines, errors, driverQty: driver, indicativeTotal };
}

/**
 * How much of an expansion is still sitting on library placeholder pricing.
 *
 * Shipping confident national unit costs is how estimating software loses jobs
 * for people, so the honest thing is to be loud about which numbers are still
 * ours rather than theirs.
 */
export function assemblyNeedsPricing(lines: ExpandedLine[]): { count: number; total: number; pct: number } {
  const flagged = lines.filter((l) => l.needs_pricing);
  const value = (l: ExpandedLine) => {
    const adj = (Number(l.quantity) || 0) * (1 + (Number(l.waste_factor_pct) || 0) / 100);
    return adj * ((Number(l.unit_material_cost) || 0) + (Number(l.unit_labor_cost) || 0)
      + (Number(l.unit_equipment_cost) || 0) + (Number(l.unit_sub_cost) || 0));
  };
  const total = round2(flagged.reduce((s, l) => s + value(l), 0));
  const all = round2(lines.reduce((s, l) => s + value(l), 0));
  return { count: flagged.length, total, pct: all > 0 ? Math.round((total / all) * 100) : 0 };
}

/** Assemblies grouped by division, for the picker. */
export function assembliesByDivision(): { division: string; items: Assembly[] }[] {
  const m = new Map<string, Assembly[]>();
  for (const a of ASSEMBLIES) {
    const arr = m.get(a.division) ?? [];
    arr.push(a);
    m.set(a.division, arr);
  }
  return [...m.entries()]
    .map(([division, items]) => ({ division, items: items.sort((x, y) => x.name.localeCompare(y.name)) }))
    .sort((a, b) => a.division.localeCompare(b.division));
}

/** Free-text search across name, description and component descriptions. */
export function searchAssemblies(q: string): Assembly[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return ASSEMBLIES;
  return ASSEMBLIES.filter((a) =>
    a.name.toLowerCase().includes(needle) ||
    a.description.toLowerCase().includes(needle) ||
    a.division === needle ||
    a.components.some((c) => c.description.toLowerCase().includes(needle)),
  );
}
