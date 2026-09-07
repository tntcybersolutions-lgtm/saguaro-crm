/**
 * lib/estimate-assemblies.ts
 *
 * Assemblies — one pick that expands into every line the work actually takes.
 *
 * PARAMETRIC, WHICH IS THE POINT. The first version of this baked its
 * assumptions into the arithmetic: `DRIVER/16*12` meant studs at 16 inches on
 * centre, always, and `DRIVER*9*2` meant a nine-foot wall, always. A ten-foot
 * wall at 24 inches needed a second library entry, and a rated one at 12 feet a
 * third. That is how estimating libraries reach four hundred entries and still
 * never quite match the job in front of you — Buildern's included.
 *
 * Here an assembly declares its parameters and the expressions read them, so
 * ONE partition entry covers every height, spacing, layer count and face count.
 * Twelve parametric assemblies span more real scope than a hundred fixed ones,
 * and the estimator sees the arithmetic change as they turn the dials.
 *
 * WHAT IS ACTUALLY IN HERE. The quantity logic is the valuable part and it is
 * standards-based, not invented: 32 SF to a 4x8 sheet, 27 cubic feet to the
 * cubic yard, 0.668 lb per foot of #4 bar, 1.75 lb of screws per 1,000 SF of
 * board. It is written as arithmetic in the same formula language the grid
 * uses, so an estimator can read exactly why a quantity came out the way it did
 * and change it, rather than trusting a multiplier baked into someone's
 * software.
 *
 * WHAT IS NOT. The unit costs are placeholders. Real prices are regional,
 * seasonal and specific to your suppliers, and software that ships confident
 * national pricing is software that quietly loses jobs. Every expanded line is
 * marked, and `assemblyNeedsPricing` reports how much of the total is still
 * sitting on our numbers rather than yours.
 */

import { evaluateExpression, FormulaError } from './estimate-formula';
import type { GridRow } from './estimate-grid';

/* ── parameters ──────────────────────────────────────────────────────────── */

export interface AssemblyParam {
  /** UPPERCASE name the quantity expressions read. */
  name: string;
  label: string;
  default: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Discrete choices, where a slider would be wrong (stud spacing, layers). */
  options?: { value: number; label: string }[];
  help?: string;
}

export interface AssemblyComponent {
  description: string;
  csi_code?: string;
  unit: string;
  /**
   * Quantity as an expression over DRIVER and the assembly's parameters.
   * Written out rather than pre-multiplied so the reasoning stays legible.
   */
  qty: string;
  /** Waste factor for this component, percent. */
  waste_factor_pct?: number;
  unit_material_cost?: number;
  unit_labor_cost?: number;
  unit_equipment_cost?: number;
  unit_sub_cost?: number;
  /** Why the quantity is what it is. Travels into the row's notes. */
  basis?: string;
  /** Only include this component when the expression is non-zero. */
  when?: string;
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
  params?: AssemblyParam[];
  components: AssemblyComponent[];
}

/* ── shared parameter shapes ─────────────────────────────────────────────── */

const P_HEIGHT = (def = 9): AssemblyParam => ({
  name: 'HEIGHT', label: 'Wall height', unit: 'ft', default: def, min: 6, max: 30, step: 0.5,
  help: 'Floor to underside of the deck or ceiling, whichever the assembly runs to.',
});
const P_SPACING: AssemblyParam = {
  name: 'SPACING', label: 'Stud spacing', unit: 'in o.c.', default: 16,
  options: [{ value: 12, label: '12" o.c.' }, { value: 16, label: '16" o.c.' }, { value: 24, label: '24" o.c.' }],
  help: 'Closer spacing means more studs and more screws, and it changes nothing else.',
};
const P_FACES: AssemblyParam = {
  name: 'FACES', label: 'Board faces', default: 2,
  options: [{ value: 1, label: 'One face' }, { value: 2, label: 'Both faces' }],
};
const P_LAYERS: AssemblyParam = {
  name: 'LAYERS', label: 'Layers per face', default: 1,
  options: [{ value: 1, label: 'Single layer' }, { value: 2, label: 'Double layer' }],
  help: 'Rated assemblies usually call for two.',
};
const P_PERIMETER: AssemblyParam = {
  name: 'PERIMETER', label: 'Perimeter', unit: 'LF', default: 0, min: 0, step: 1,
  help: 'Leave at 0 and it is estimated from the area as if the room were square. A real perimeter is always better — an L-shaped room can run 40% longer.',
};

/** The estimated-or-given perimeter, used by anything with an edge. */
const PERIM = 'IF(PERIMETER>0,PERIMETER,SQRT(DRIVER)*4)';

/* ── the library ─────────────────────────────────────────────────────────── */

export const ASSEMBLIES: Assembly[] = [
  /* ── 03 Concrete ──────────────────────────────────────────────────────── */
  {
    id: 'slab-on-grade',
    name: 'Slab on grade — concrete, WWF, vapour barrier',
    division: '03', driverUnit: 'SF', driverLabel: 'Square feet of slab',
    description: 'Slab over vapour barrier on compacted base, reinforced and finished.',
    params: [
      { name: 'THICKNESS', label: 'Slab thickness', unit: 'in', default: 4, min: 3, max: 12, step: 0.5 },
      { name: 'PSI', label: 'Concrete strength', unit: 'psi', default: 3000,
        options: [{ value: 3000, label: '3,000 psi' }, { value: 4000, label: '4,000 psi' }, { value: 5000, label: '5,000 psi' }] },
    ],
    components: [
      { description: 'Concrete slab', csi_code: '03 30 00', unit: 'CY',
        qty: '=ROUND(DRIVER*THICKNESS/12/27,2)', waste_factor_pct: 8,
        unit_material_cost: 148, unit_labor_cost: 34,
        basis: 'Thickness in feet, 27 cubic feet to the cubic yard' },
      { description: 'Strength premium above 3,000 psi', csi_code: '03 30 00', unit: 'CY',
        qty: '=ROUND(DRIVER*THICKNESS/12/27,2)', when: '=PSI>3000',
        unit_material_cost: 14, basis: 'Added only when the mix is specified above 3,000 psi' },
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
      { description: 'Sawcut control joints', csi_code: '03 15 16', unit: 'LF',
        qty: `=ROUND(DRIVER/12,0)`, unit_labor_cost: 1.15, unit_equipment_cost: 0.4,
        basis: 'Joints on a 12ft grid — one foot of cut per 12 SF' },
    ],
  },
  {
    id: 'footing-continuous',
    name: 'Continuous footing — excavate, form, reinforce, place',
    division: '03', driverUnit: 'LF', driverLabel: 'Linear feet of footing',
    description: 'Strip footing with continuous reinforcement.',
    params: [
      { name: 'WIDTH', label: 'Footing width', unit: 'in', default: 24, min: 12, max: 60, step: 2 },
      { name: 'DEPTH', label: 'Footing depth', unit: 'in', default: 12, min: 8, max: 36, step: 2 },
      { name: 'BARS', label: 'Continuous bars', default: 3, min: 2, max: 8, step: 1 },
    ],
    components: [
      { description: 'Concrete', csi_code: '03 30 00', unit: 'CY',
        qty: '=ROUND(DRIVER*(WIDTH/12)*(DEPTH/12)/27,2)', waste_factor_pct: 8,
        unit_material_cost: 148, unit_labor_cost: 42,
        basis: 'Width × depth in feet, 27 CF to the CY' },
      { description: 'Formwork, both sides', csi_code: '03 11 00', unit: 'SF',
        qty: '=ROUND(DRIVER*(DEPTH/12)*2,1)', waste_factor_pct: 15,
        unit_material_cost: 1.85, unit_labor_cost: 4.2 },
      { description: '#4 rebar, continuous', csi_code: '03 21 00', unit: 'LB',
        qty: '=ROUND(DRIVER*BARS*0.668,1)', waste_factor_pct: 10,
        unit_material_cost: 0.94, unit_labor_cost: 0.72,
        basis: '#4 bar weighs 0.668 lb per foot' },
      { description: 'Trench excavation', csi_code: '31 23 16', unit: 'CY',
        qty: '=ROUND(DRIVER*(WIDTH/12+0.5)*(DEPTH/12+0.5)/27,2)',
        unit_labor_cost: 12, unit_equipment_cost: 18,
        basis: 'Six inches of working room each way' },
    ],
  },
  {
    id: 'cmu-wall',
    name: 'CMU wall — block, grout, reinforcing',
    division: '04', driverUnit: 'SF', driverLabel: 'Square feet of wall',
    description: 'Concrete masonry wall, partially or fully grouted.',
    params: [
      { name: 'WIDTH', label: 'Block width', unit: 'in', default: 8,
        options: [{ value: 6, label: '6"' }, { value: 8, label: '8"' }, { value: 12, label: '12"' }] },
      { name: 'GROUTSP', label: 'Grouted cells', unit: 'in o.c.', default: 32,
        options: [{ value: 16, label: '16" o.c.' }, { value: 32, label: '32" o.c.' }, { value: 48, label: '48" o.c.' }, { value: 8, label: 'Solid grout' }] },
    ],
    components: [
      { description: 'CMU block', csi_code: '04 22 00', unit: 'EA',
        qty: '=CEILING(DRIVER*1.125,1)', waste_factor_pct: 5,
        unit_material_cost: 3.4, unit_labor_cost: 4.85,
        basis: '1.125 blocks per SF for standard 8x8x16 units' },
      { description: 'Mortar', csi_code: '04 05 13', unit: 'CF',
        qty: '=ROUND(DRIVER*0.09,2)', unit_material_cost: 6.2,
        basis: '0.09 CF of mortar per SF of wall' },
      { description: 'Grout', csi_code: '04 05 16', unit: 'CY',
        qty: '=ROUND(DRIVER*(WIDTH/12)*(16/GROUTSP)*0.5/27,2)', waste_factor_pct: 10,
        unit_material_cost: 168, unit_labor_cost: 46,
        basis: 'Cell volume at the specified spacing — solid grout is the 8" setting' },
      { description: '#5 vertical reinforcing', csi_code: '04 05 19', unit: 'LB',
        qty: '=ROUND(DRIVER/8*(16/GROUTSP)*1.043,1)', waste_factor_pct: 10,
        unit_material_cost: 0.98, unit_labor_cost: 0.85,
        basis: '#5 bar weighs 1.043 lb per foot' },
      { description: 'Horizontal joint reinforcing', csi_code: '04 05 23', unit: 'LF',
        qty: '=ROUND(DRIVER/1.33,0)', waste_factor_pct: 8, unit_material_cost: 0.42, unit_labor_cost: 0.38,
        basis: 'Every other course at 8" — one LF per 1.33 SF' },
    ],
  },

  /* ── 05/06 Metals and carpentry ───────────────────────────────────────── */
  {
    id: 'structural-steel-framing',
    name: 'Structural steel — supply, erect, bolt',
    division: '05', driverUnit: 'TON', driverLabel: 'Tons of structural steel',
    description: 'Fabricated structural steel delivered, erected and connected.',
    components: [
      { description: 'Structural steel, fabricated', csi_code: '05 12 00', unit: 'TON',
        qty: '=DRIVER', unit_material_cost: 2450, basis: 'Shop-fabricated and primed' },
      { description: 'Erection labor and crane', csi_code: '05 12 00', unit: 'TON',
        qty: '=DRIVER', unit_labor_cost: 720, unit_equipment_cost: 385 },
      { description: 'High-strength bolts', csi_code: '05 05 23', unit: 'EA',
        qty: '=CEILING(DRIVER*42,1)', unit_material_cost: 3.2, unit_labor_cost: 2.1,
        basis: '42 bolts per ton on a typical frame' },
      { description: 'Field welding', csi_code: '05 05 23', unit: 'LF',
        qty: '=CEILING(DRIVER*18,1)', unit_labor_cost: 14.5, unit_equipment_cost: 3.2 },
      { description: 'Touch-up primer', csi_code: '05 05 13', unit: 'TON',
        qty: '=DRIVER', unit_material_cost: 42, unit_labor_cost: 65 },
    ],
  },
  {
    id: 'wood-stud-wall',
    name: 'Wood stud wall — 2x framing, sheathing optional',
    division: '06', driverUnit: 'LF', driverLabel: 'Linear feet of wall',
    description: 'Dimensional lumber framing with plates, headers and optional sheathing.',
    params: [
      P_HEIGHT(9), P_SPACING,
      { name: 'SHEATHED', label: 'Sheathing', default: 0,
        options: [{ value: 0, label: 'None' }, { value: 1, label: 'One side' }, { value: 2, label: 'Both sides' }] },
    ],
    components: [
      { description: '2x6 stud', csi_code: '06 11 00', unit: 'EA',
        qty: '=CEILING(DRIVER/SPACING*12,1)+1', waste_factor_pct: 8,
        unit_material_cost: 7.85, unit_labor_cost: 4.6,
        basis: 'One stud per spacing interval, plus one to close the run' },
      { description: '2x6 plate, top double and bottom single', csi_code: '06 11 00', unit: 'LF',
        qty: '=DRIVER*3', waste_factor_pct: 10, unit_material_cost: 1.95, unit_labor_cost: 1.1 },
      { description: 'OSB sheathing 7/16"', csi_code: '06 16 00', unit: 'EA',
        qty: '=CEILING(DRIVER*HEIGHT*SHEATHED/32,1)', when: '=SHEATHED',
        waste_factor_pct: 10, unit_material_cost: 21.5, unit_labor_cost: 9.4,
        basis: '32 SF per 4x8 sheet' },
      { description: 'Framing hardware and fasteners', csi_code: '06 05 23', unit: 'LF',
        qty: '=DRIVER', unit_material_cost: 1.35 },
    ],
  },

  /* ── 07 Thermal and moisture ──────────────────────────────────────────── */
  {
    id: 'roof-tpo-mechanically-attached',
    name: 'Roofing — TPO membrane over polyiso',
    division: '07', driverUnit: 'SF', driverLabel: 'Square feet of roof',
    description: 'Single-ply membrane over polyiso, mechanically attached, with edge metal.',
    params: [
      { name: 'RVALUE', label: 'Insulation R-value', default: 30, min: 10, max: 60, step: 5,
        help: 'Polyiso runs about R-5.7 per inch; this drives the board thickness.' },
      P_PERIMETER,
    ],
    components: [
      { description: '60-mil TPO membrane', csi_code: '07 54 23', unit: 'SF',
        qty: '=DRIVER', waste_factor_pct: 12, unit_material_cost: 1.15, unit_labor_cost: 1.05 },
      { description: 'Polyiso insulation', csi_code: '07 22 00', unit: 'SF',
        qty: '=ROUND(DRIVER*CEILING(RVALUE/5.7/1.5,1),0)', waste_factor_pct: 8,
        unit_material_cost: 0.92, unit_labor_cost: 0.42,
        basis: 'R-5.7 per inch, boards in 1.5in layers — SF of board across all layers' },
      { description: 'Plates and fasteners', csi_code: '07 54 23', unit: 'EA',
        qty: '=CEILING(DRIVER/3.2,1)', unit_material_cost: 0.38, unit_labor_cost: 0.22,
        basis: 'One fastener per 3.2 SF in the field' },
      { description: 'Cover board', csi_code: '07 22 00', unit: 'SF',
        qty: '=DRIVER', waste_factor_pct: 8, unit_material_cost: 0.58, unit_labor_cost: 0.34 },
      { description: 'Edge metal and coping', csi_code: '07 71 00', unit: 'LF',
        qty: `=CEILING(${PERIM},1)`, waste_factor_pct: 8,
        unit_material_cost: 8.4, unit_labor_cost: 6.2,
        basis: 'Roof perimeter — give a real one rather than the square estimate' },
      { description: 'Roof drains and sumps', csi_code: '22 14 26', unit: 'EA',
        qty: '=CEILING(DRIVER/8000,1)*2', unit_material_cost: 420, unit_labor_cost: 385,
        basis: 'A drain and an overflow per 8,000 SF of roof' },
    ],
  },
  {
    id: 'batt-insulation',
    name: 'Batt insulation — fibreglass in framed cavity',
    division: '07', driverUnit: 'SF', driverLabel: 'Square feet of wall or ceiling',
    description: 'Unfaced or kraft-faced batts friction-fit between framing.',
    params: [
      { name: 'RVALUE', label: 'R-value', default: 19,
        options: [{ value: 11, label: 'R-11' }, { value: 13, label: 'R-13' }, { value: 19, label: 'R-19' }, { value: 21, label: 'R-21' }, { value: 30, label: 'R-30' }] },
    ],
    components: [
      { description: 'Fibreglass batt insulation', csi_code: '07 21 16', unit: 'SF',
        qty: '=DRIVER', waste_factor_pct: 8,
        unit_material_cost: 0.62, unit_labor_cost: 0.38,
        basis: 'Cavity area — the R-value drives the price, not the quantity' },
      { description: 'R-value premium above R-19', csi_code: '07 21 16', unit: 'SF',
        qty: '=DRIVER', when: '=RVALUE>19', unit_material_cost: 0.24,
        basis: 'Thicker batts cost more per square foot' },
    ],
  },
  {
    id: 'firestopping',
    name: 'Firestopping — penetrations and joints',
    division: '07', driverUnit: 'EA', driverLabel: 'Number of penetrations',
    description: 'Rated penetration seals with documentation for the AHJ.',
    components: [
      { description: 'Firestop sealant and backing', csi_code: '07 84 00', unit: 'EA',
        qty: '=DRIVER', unit_material_cost: 14.5, unit_labor_cost: 28 },
      { description: 'UL system documentation and labelling', csi_code: '07 84 00', unit: 'EA',
        qty: '=DRIVER', unit_material_cost: 2.2, unit_labor_cost: 6.5,
        basis: 'Every rated penetration needs a labelled, documented system' },
    ],
  },

  /* ── 08 Openings ──────────────────────────────────────────────────────── */
  {
    id: 'door-hm-single',
    name: 'Door opening — hollow metal, frame, hardware',
    division: '08', driverUnit: 'EA', driverLabel: 'Number of door openings',
    description: 'HM door in HM frame with a full hardware set and paint.',
    params: [
      { name: 'RATED', label: 'Fire rated', default: 0,
        options: [{ value: 0, label: 'Not rated' }, { value: 1, label: 'Rated' }] },
      { name: 'PANIC', label: 'Exit device', default: 0,
        options: [{ value: 0, label: 'Lockset' }, { value: 1, label: 'Panic hardware' }] },
    ],
    components: [
      { description: 'Hollow metal door', csi_code: '08 11 13', unit: 'EA',
        qty: '=DRIVER', unit_material_cost: 385, unit_labor_cost: 95 },
      { description: 'Fire rating premium — door and frame label', csi_code: '08 11 13', unit: 'EA',
        qty: '=DRIVER', when: '=RATED', unit_material_cost: 145 },
      { description: 'Hollow metal frame', csi_code: '08 11 13', unit: 'EA',
        qty: '=DRIVER', unit_material_cost: 245, unit_labor_cost: 85 },
      { description: 'Lockset, grade 1', csi_code: '08 71 00', unit: 'EA',
        qty: '=DRIVER', when: '=NOT(PANIC)', unit_material_cost: 210, unit_labor_cost: 45 },
      { description: 'Panic exit device', csi_code: '08 71 00', unit: 'EA',
        qty: '=DRIVER', when: '=PANIC', unit_material_cost: 685, unit_labor_cost: 95 },
      { description: 'Closer', csi_code: '08 71 00', unit: 'EA',
        qty: '=DRIVER', unit_material_cost: 165, unit_labor_cost: 38 },
      { description: 'Butt hinges', csi_code: '08 71 00', unit: 'EA',
        qty: '=DRIVER*3', unit_material_cost: 14, unit_labor_cost: 6,
        basis: 'Three hinges per leaf' },
      { description: 'Wall stop and silencers', csi_code: '08 71 00', unit: 'EA',
        qty: '=DRIVER', unit_material_cost: 12, unit_labor_cost: 8 },
      { description: 'Paint door and frame', csi_code: '09 91 23', unit: 'EA',
        qty: '=DRIVER', unit_material_cost: 18, unit_labor_cost: 55 },
    ],
  },
  {
    id: 'storefront-glazing',
    name: 'Aluminium storefront — framing and glazing',
    division: '08', driverUnit: 'SF', driverLabel: 'Square feet of storefront',
    description: 'Thermally broken aluminium framing with insulated glazing.',
    params: [
      { name: 'DOORS', label: 'Entrance doors in the run', default: 0, min: 0, max: 20, step: 1 },
      P_PERIMETER,
    ],
    components: [
      { description: 'Aluminium framing, thermally broken', csi_code: '08 41 13', unit: 'SF',
        qty: '=DRIVER', waste_factor_pct: 6, unit_material_cost: 28, unit_labor_cost: 16 },
      { description: '1" insulated glazing unit', csi_code: '08 80 00', unit: 'SF',
        qty: '=DRIVER', waste_factor_pct: 5, unit_material_cost: 22, unit_labor_cost: 11 },
      { description: 'Perimeter sealant and backer rod', csi_code: '07 92 00', unit: 'LF',
        qty: `=CEILING(${PERIM},1)`, unit_material_cost: 2.1, unit_labor_cost: 4.4 },
      { description: 'Aluminium entrance door and hardware', csi_code: '08 41 13', unit: 'EA',
        qty: '=DOORS', when: '=DOORS', unit_material_cost: 2450, unit_labor_cost: 620 },
    ],
  },

  /* ── 09 Finishes ──────────────────────────────────────────────────────── */
  {
    id: 'partition-stud-gwb',
    name: 'Partition — metal stud with gypsum board',
    division: '09', driverUnit: 'LF', driverLabel: 'Linear feet of wall',
    description: 'Metal stud partition, boarded and finished. Rated or not, any height, any spacing.',
    params: [
      P_HEIGHT(9), P_SPACING, P_FACES, P_LAYERS,
      { name: 'INSULATED', label: 'Cavity insulation', default: 0,
        options: [{ value: 0, label: 'None' }, { value: 1, label: 'Sound batt' }] },
      { name: 'RATED', label: 'Fire rated', default: 0,
        options: [{ value: 0, label: 'Not rated' }, { value: 1, label: 'Rated — adds firestopping at the deck' }] },
    ],
    components: [
      { description: 'Metal stud', csi_code: '09 22 16', unit: 'EA',
        qty: '=CEILING(DRIVER/SPACING*12,1)+1', waste_factor_pct: 5,
        unit_material_cost: 8.75, unit_labor_cost: 6.5,
        basis: 'One stud per spacing interval, plus one to close the run' },
      { description: 'Track, top and bottom', csi_code: '09 22 16', unit: 'LF',
        qty: '=DRIVER*2', waste_factor_pct: 8, unit_material_cost: 0.82, unit_labor_cost: 0.36 },
      { description: 'Gypsum board 4x8', csi_code: '09 29 00', unit: 'EA',
        qty: '=CEILING(DRIVER*HEIGHT*FACES*LAYERS/32,1)', waste_factor_pct: 10,
        unit_material_cost: 14.2, unit_labor_cost: 11,
        basis: 'Wall area × faces × layers, 32 SF per 4x8 sheet' },
      { description: 'Joint compound and tape', csi_code: '09 29 00', unit: 'SF',
        qty: '=DRIVER*HEIGHT*FACES', unit_material_cost: 0.18, unit_labor_cost: 0.95,
        basis: 'Only the outermost layer gets finished' },
      { description: 'Drywall screws', csi_code: '09 29 00', unit: 'LB',
        qty: '=ROUND(DRIVER*HEIGHT*FACES*LAYERS/1000*1.75,1)',
        unit_material_cost: 2.4, basis: '1.75 lb per 1,000 SF of board' },
      { description: 'Sound attenuation batt', csi_code: '09 22 16', unit: 'SF',
        qty: '=DRIVER*HEIGHT', when: '=INSULATED', waste_factor_pct: 8,
        unit_material_cost: 0.68, unit_labor_cost: 0.42 },
      { description: 'Head-of-wall firestopping', csi_code: '07 84 00', unit: 'LF',
        qty: '=DRIVER', when: '=RATED', unit_material_cost: 3.1, unit_labor_cost: 4.4,
        basis: 'A rated partition needs a rated joint where it meets the deck' },
    ],
  },
  {
    id: 'acoustic-ceiling',
    name: 'Suspended acoustic ceiling — grid and tile',
    division: '09', driverUnit: 'SF', driverLabel: 'Square feet of ceiling',
    description: 'Exposed tee grid with lay-in acoustic panels.',
    params: [
      { name: 'PANEL', label: 'Panel size', default: 8,
        options: [{ value: 8, label: '2x4 (8 SF)' }, { value: 4, label: '2x2 (4 SF)' }] },
      P_PERIMETER,
    ],
    components: [
      { description: 'Lay-in acoustic panel', csi_code: '09 51 00', unit: 'EA',
        qty: '=CEILING(DRIVER/PANEL,1)', waste_factor_pct: 8,
        unit_material_cost: 6.8, unit_labor_cost: 2.4,
        basis: 'Ceiling area divided by the panel area' },
      { description: 'Main tee 12ft', csi_code: '09 51 00', unit: 'EA',
        qty: '=CEILING(DRIVER/4/12,1)', waste_factor_pct: 6,
        unit_material_cost: 9.2, unit_labor_cost: 4.1, basis: 'Mains at 4ft on centre' },
      { description: 'Cross tee', csi_code: '09 51 00', unit: 'EA',
        qty: '=CEILING(DRIVER/PANEL*2,1)', waste_factor_pct: 6,
        unit_material_cost: 2.9, unit_labor_cost: 1.6 },
      { description: 'Wall angle 10ft', csi_code: '09 51 00', unit: 'EA',
        qty: `=CEILING(${PERIM}/10,1)`, waste_factor_pct: 10,
        unit_material_cost: 5.4, unit_labor_cost: 2.2,
        basis: 'Room perimeter in 10ft lengths' },
      { description: 'Hanger wire and clips', csi_code: '09 51 00', unit: 'EA',
        qty: '=CEILING(DRIVER/16,1)', unit_material_cost: 1.15, unit_labor_cost: 1.9,
        basis: 'One hanger per 16 SF' },
    ],
  },
  {
    id: 'paint-interior',
    name: 'Interior paint — primer plus finish coats',
    division: '09', driverUnit: 'SF', driverLabel: 'Square feet of surface',
    description: 'Prime and finish, cut and roll.',
    params: [
      { name: 'COATS', label: 'Finish coats', default: 2, min: 1, max: 4, step: 1 },
      { name: 'PRIMED', label: 'Primer', default: 1,
        options: [{ value: 1, label: 'Prime first' }, { value: 0, label: 'Already primed' }] },
    ],
    components: [
      { description: 'Primer', csi_code: '09 91 23', unit: 'GAL',
        qty: '=ROUND(DRIVER/350,2)', when: '=PRIMED', waste_factor_pct: 5,
        unit_material_cost: 28, basis: '350 SF per gallon' },
      { description: 'Finish paint', csi_code: '09 91 23', unit: 'GAL',
        qty: '=ROUND(DRIVER*COATS/380,2)', waste_factor_pct: 5,
        unit_material_cost: 42, basis: '380 SF per gallon per coat' },
      { description: 'Painting labor', csi_code: '09 91 23', unit: 'SF',
        qty: '=DRIVER*(COATS+PRIMED)', unit_labor_cost: 0.31,
        basis: 'Labor follows the number of passes, not the area' },
      { description: 'Masking, drop cloths, sundries', csi_code: '09 91 23', unit: 'SF',
        qty: '=DRIVER', unit_material_cost: 0.06 },
    ],
  },
  {
    id: 'flooring-resilient',
    name: 'Resilient flooring — tile or plank with base',
    division: '09', driverUnit: 'SF', driverLabel: 'Square feet of floor',
    description: 'Resilient flooring over prepared slab, with wall base.',
    params: [
      { name: 'PREP', label: 'Floor prep', default: 1,
        options: [{ value: 0, label: 'None' }, { value: 1, label: 'Skim and patch' }, { value: 2, label: 'Self-levelling' }] },
      P_PERIMETER,
    ],
    components: [
      { description: 'Resilient flooring', csi_code: '09 65 19', unit: 'SF',
        qty: '=DRIVER', waste_factor_pct: 10, unit_material_cost: 1.35, unit_labor_cost: 1.55 },
      { description: 'Adhesive', csi_code: '09 65 19', unit: 'GAL',
        qty: '=ROUND(DRIVER/250,2)', unit_material_cost: 34, basis: '250 SF per gallon' },
      { description: 'Floor prep — skim and patch', csi_code: '09 05 61', unit: 'SF',
        qty: '=DRIVER', when: '=PREP=1', unit_material_cost: 0.22, unit_labor_cost: 0.48 },
      { description: 'Floor prep — self-levelling underlayment', csi_code: '09 05 61', unit: 'SF',
        qty: '=DRIVER', when: '=PREP=2', unit_material_cost: 1.15, unit_labor_cost: 0.95 },
      { description: '4" wall base', csi_code: '09 65 13', unit: 'LF',
        qty: `=CEILING(${PERIM},1)`, waste_factor_pct: 8,
        unit_material_cost: 1.85, unit_labor_cost: 1.4 },
      { description: 'Seal and initial finish', csi_code: '09 65 19', unit: 'SF',
        qty: '=DRIVER', unit_material_cost: 0.11, unit_labor_cost: 0.31 },
    ],
  },
  {
    id: 'ceramic-tile',
    name: 'Ceramic tile — floor or wall, thinset',
    division: '09', driverUnit: 'SF', driverLabel: 'Square feet of tile',
    description: 'Tile over cementitious backer with waterproofing where wet.',
    params: [
      { name: 'WET', label: 'Wet area', default: 0,
        options: [{ value: 0, label: 'Dry' }, { value: 1, label: 'Wet — adds waterproof membrane' }] },
      P_PERIMETER,
    ],
    components: [
      { description: 'Ceramic tile', csi_code: '09 30 13', unit: 'SF',
        qty: '=DRIVER', waste_factor_pct: 12, unit_material_cost: 4.2, unit_labor_cost: 6.5,
        basis: '12% waste covers cuts and pattern' },
      { description: 'Thinset mortar', csi_code: '09 30 13', unit: 'BAG',
        qty: '=CEILING(DRIVER/95,1)', unit_material_cost: 22,
        basis: 'One 50 lb bag covers about 95 SF' },
      { description: 'Grout', csi_code: '09 30 13', unit: 'BAG',
        qty: '=CEILING(DRIVER/180,1)', unit_material_cost: 28 },
      { description: 'Cement backer board', csi_code: '09 28 13', unit: 'EA',
        qty: '=CEILING(DRIVER/15,1)', waste_factor_pct: 10, unit_material_cost: 14.5, unit_labor_cost: 8.2,
        basis: '15 SF per 3x5 sheet' },
      { description: 'Waterproof membrane', csi_code: '09 30 13', unit: 'SF',
        qty: '=DRIVER', when: '=WET', waste_factor_pct: 10, unit_material_cost: 1.85, unit_labor_cost: 1.4 },
      { description: 'Edge trim and transitions', csi_code: '09 30 13', unit: 'LF',
        qty: `=CEILING(${PERIM},1)`, unit_material_cost: 4.6, unit_labor_cost: 3.1 },
    ],
  },

  /* ── 21/22/23 Fire, plumbing, HVAC ────────────────────────────────────── */
  {
    id: 'fire-sprinkler-wet',
    name: 'Fire sprinkler — wet system, light hazard',
    division: '21', driverUnit: 'SF', driverLabel: 'Square feet of coverage',
    description: 'Wet-pipe system with heads, branch piping and hangers.',
    params: [
      { name: 'COVERAGE', label: 'Coverage per head', unit: 'SF', default: 130,
        options: [{ value: 225, label: '225 SF — light hazard' }, { value: 130, label: '130 SF — ordinary' }, { value: 100, label: '100 SF — extra hazard' }] },
    ],
    components: [
      { description: 'Sprinkler head and escutcheon', csi_code: '21 13 13', unit: 'EA',
        qty: '=CEILING(DRIVER/COVERAGE,1)', unit_material_cost: 22, unit_labor_cost: 46,
        basis: 'Head count follows the hazard classification' },
      { description: 'Branch line piping', csi_code: '21 11 00', unit: 'LF',
        qty: '=CEILING(DRIVER/COVERAGE,1)*14', waste_factor_pct: 8,
        unit_material_cost: 4.2, unit_labor_cost: 6.8,
        basis: '14 LF of branch pipe per head' },
      { description: 'Hangers and seismic bracing', csi_code: '21 05 29', unit: 'EA',
        qty: '=CEILING(DRIVER/COVERAGE,1)*2', unit_material_cost: 6.4, unit_labor_cost: 12 },
      { description: 'Hydraulic calculations and permit drawings', csi_code: '21 05 00', unit: 'LS',
        qty: '=1', unit_sub_cost: 2400,
        basis: 'One submittal package regardless of area' },
    ],
  },
  {
    id: 'restroom-fixture-group',
    name: 'Restroom group — WC, lavatory, carrier, rough-in',
    division: '22', driverUnit: 'EA', driverLabel: 'Number of fixture groups',
    description: 'One water closet and one lavatory, roughed in and trimmed.',
    params: [
      { name: 'ADA', label: 'ADA fixtures', default: 0,
        options: [{ value: 0, label: 'Standard' }, { value: 1, label: 'ADA — grab bars and clearances' }] },
    ],
    components: [
      { description: 'Water closet, floor mount', csi_code: '22 42 13', unit: 'EA', qty: '=DRIVER', unit_material_cost: 420, unit_labor_cost: 185 },
      { description: 'Lavatory with faucet', csi_code: '22 42 16', unit: 'EA', qty: '=DRIVER', unit_material_cost: 340, unit_labor_cost: 165 },
      { description: 'Carrier', csi_code: '22 05 16', unit: 'EA', qty: '=DRIVER', unit_material_cost: 275, unit_labor_cost: 120 },
      { description: 'Waste and vent rough-in', csi_code: '22 13 16', unit: 'EA', qty: '=DRIVER', unit_material_cost: 165, unit_labor_cost: 240 },
      { description: 'Domestic water rough-in', csi_code: '22 11 16', unit: 'EA', qty: '=DRIVER', unit_material_cost: 135, unit_labor_cost: 195 },
      { description: 'Trim, stops and supplies', csi_code: '22 42 39', unit: 'EA', qty: '=DRIVER*2', unit_material_cost: 42, unit_labor_cost: 28 },
      { description: 'ADA grab bars and accessories', csi_code: '10 28 00', unit: 'EA',
        qty: '=DRIVER*3', when: '=ADA', unit_material_cost: 68, unit_labor_cost: 45,
        basis: 'Rear and two side bars per accessible stall' },
    ],
  },
  {
    id: 'vav-box-hookup',
    name: 'VAV box — set, connect, insulate, control',
    division: '23', driverUnit: 'EA', driverLabel: 'Number of VAV boxes',
    description: 'Terminal unit installed, ducted and controlled.',
    params: [
      { name: 'REHEAT', label: 'Reheat coil', default: 0,
        options: [{ value: 0, label: 'Cooling only' }, { value: 1, label: 'Hot water reheat' }, { value: 2, label: 'Electric reheat' }] },
    ],
    components: [
      { description: 'VAV terminal unit', csi_code: '23 36 00', unit: 'EA', qty: '=DRIVER', unit_material_cost: 780, unit_labor_cost: 220 },
      { description: 'Hot water reheat coil and piping', csi_code: '23 82 16', unit: 'EA',
        qty: '=DRIVER', when: '=REHEAT=1', unit_material_cost: 420, unit_labor_cost: 385 },
      { description: 'Electric reheat coil and circuit', csi_code: '23 82 33', unit: 'EA',
        qty: '=DRIVER', when: '=REHEAT=2', unit_material_cost: 340, unit_labor_cost: 265 },
      { description: 'Flex duct connection', csi_code: '23 33 00', unit: 'EA', qty: '=DRIVER', unit_material_cost: 95, unit_labor_cost: 85 },
      { description: 'Sheet metal downstream duct', csi_code: '23 31 13', unit: 'LB',
        qty: '=DRIVER*85', waste_factor_pct: 10, unit_material_cost: 2.85, unit_labor_cost: 3.4,
        basis: '85 lb of duct per box on a typical layout' },
      { description: 'Duct insulation', csi_code: '23 07 13', unit: 'SF', qty: '=DRIVER*110', unit_material_cost: 0.95, unit_labor_cost: 1.25 },
      { description: 'DDC controller and actuator', csi_code: '23 09 23', unit: 'EA', qty: '=DRIVER', unit_material_cost: 415, unit_labor_cost: 195 },
      { description: 'Control wiring', csi_code: '23 09 23', unit: 'LF', qty: '=DRIVER*60', waste_factor_pct: 8, unit_material_cost: 0.38, unit_labor_cost: 0.55 },
    ],
  },
  {
    id: 'rooftop-unit',
    name: 'Rooftop unit — set, curb, connect',
    division: '23', driverUnit: 'TON', driverLabel: 'Tons of cooling',
    description: 'Packaged RTU on a curb with power, gas and controls.',
    components: [
      { description: 'Packaged rooftop unit', csi_code: '23 74 13', unit: 'TON',
        qty: '=DRIVER', unit_material_cost: 1150, unit_labor_cost: 185 },
      { description: 'Roof curb and flashing', csi_code: '23 74 13', unit: 'EA',
        qty: '=CEILING(DRIVER/12,1)', unit_material_cost: 1250, unit_labor_cost: 420,
        basis: 'One curb per unit, sized at roughly 12 tons a unit' },
      { description: 'Crane set', csi_code: '01 54 00', unit: 'EA',
        qty: '=CEILING(DRIVER/12,1)', unit_equipment_cost: 1450 },
      { description: 'Power and disconnect', csi_code: '26 27 26', unit: 'EA',
        qty: '=CEILING(DRIVER/12,1)', unit_material_cost: 385, unit_labor_cost: 465 },
      { description: 'Gas piping and connection', csi_code: '23 11 23', unit: 'EA',
        qty: '=CEILING(DRIVER/12,1)', unit_material_cost: 320, unit_labor_cost: 385 },
      { description: 'Start-up, test and balance', csi_code: '23 05 93', unit: 'TON',
        qty: '=DRIVER', unit_sub_cost: 42 },
    ],
  },

  /* ── 26 Electrical ────────────────────────────────────────────────────── */
  {
    id: 'branch-lighting',
    name: 'Lighting branch — fixture, whip, circuit share',
    division: '26', driverUnit: 'EA', driverLabel: 'Number of fixtures',
    description: 'Recessed or surface fixtures with branch wiring and circuitry.',
    params: [
      { name: 'PERCIRCUIT', label: 'Fixtures per circuit', default: 8, min: 4, max: 16, step: 1 },
      { name: 'CONTROLS', label: 'Controls', default: 1,
        options: [{ value: 0, label: 'Switched only' }, { value: 1, label: 'Occupancy sensor' }, { value: 2, label: 'Dimming and daylight' }] },
    ],
    components: [
      { description: 'LED fixture', csi_code: '26 51 00', unit: 'EA', qty: '=DRIVER', unit_material_cost: 118, unit_labor_cost: 42 },
      { description: 'Fixture whip', csi_code: '26 05 19', unit: 'EA', qty: '=DRIVER', unit_material_cost: 14, unit_labor_cost: 9 },
      { description: '#12 THHN branch wire', csi_code: '26 05 19', unit: 'LF',
        qty: '=DRIVER*35', waste_factor_pct: 8, unit_material_cost: 0.42, unit_labor_cost: 0.38,
        basis: '35 LF of wire per fixture on an average branch run' },
      { description: '½" EMT conduit', csi_code: '26 05 33', unit: 'LF',
        qty: '=DRIVER*12', waste_factor_pct: 8, unit_material_cost: 1.18, unit_labor_cost: 2.35 },
      { description: '4" square box and ring', csi_code: '26 05 33', unit: 'EA', qty: '=DRIVER', unit_material_cost: 6.4, unit_labor_cost: 11 },
      { description: 'Circuit share — breaker and panel', csi_code: '26 24 16', unit: 'EA',
        qty: '=CEILING(DRIVER/PERCIRCUIT,1)', unit_material_cost: 48, unit_labor_cost: 65,
        basis: 'One circuit per the fixture count above — you cannot buy part of a breaker' },
      { description: 'Occupancy sensor', csi_code: '26 09 23', unit: 'EA',
        qty: '=CEILING(DRIVER/PERCIRCUIT,1)', when: '=CONTROLS=1', unit_material_cost: 78, unit_labor_cost: 55 },
      { description: 'Dimming and daylight controls', csi_code: '26 09 23', unit: 'EA',
        qty: '=CEILING(DRIVER/PERCIRCUIT,1)', when: '=CONTROLS=2', unit_material_cost: 245, unit_labor_cost: 135 },
    ],
  },
  {
    id: 'receptacle-branch',
    name: 'Receptacle branch — device, box, wiring',
    division: '26', driverUnit: 'EA', driverLabel: 'Number of receptacles',
    description: 'Duplex receptacles with boxes, conduit and branch circuitry.',
    params: [
      { name: 'PERCIRCUIT', label: 'Devices per circuit', default: 8, min: 4, max: 13, step: 1 },
      { name: 'GFCI', label: 'GFCI', default: 0,
        options: [{ value: 0, label: 'Standard' }, { value: 1, label: 'GFCI protected' }] },
    ],
    components: [
      { description: 'Duplex receptacle and plate', csi_code: '26 27 26', unit: 'EA',
        qty: '=DRIVER', when: '=NOT(GFCI)', unit_material_cost: 4.8, unit_labor_cost: 18 },
      { description: 'GFCI receptacle and plate', csi_code: '26 27 26', unit: 'EA',
        qty: '=DRIVER', when: '=GFCI', unit_material_cost: 24, unit_labor_cost: 22 },
      { description: 'Device box and ring', csi_code: '26 05 33', unit: 'EA', qty: '=DRIVER', unit_material_cost: 5.2, unit_labor_cost: 12 },
      { description: '#12 THHN branch wire', csi_code: '26 05 19', unit: 'LF',
        qty: '=DRIVER*45', waste_factor_pct: 8, unit_material_cost: 0.42, unit_labor_cost: 0.38 },
      { description: '½" EMT conduit', csi_code: '26 05 33', unit: 'LF',
        qty: '=DRIVER*18', waste_factor_pct: 8, unit_material_cost: 1.18, unit_labor_cost: 2.35 },
      { description: 'Circuit share — breaker and panel', csi_code: '26 24 16', unit: 'EA',
        qty: '=CEILING(DRIVER/PERCIRCUIT,1)', unit_material_cost: 48, unit_labor_cost: 65 },
    ],
  },
  {
    id: 'panelboard-feeder',
    name: 'Panelboard and feeder — panel, conduit, conductors',
    division: '26', driverUnit: 'EA', driverLabel: 'Number of panels',
    description: 'Distribution panel with its feeder run back to the source.',
    params: [
      { name: 'AMPS', label: 'Panel size', unit: 'A', default: 225,
        options: [{ value: 100, label: '100 A' }, { value: 225, label: '225 A' }, { value: 400, label: '400 A' }, { value: 600, label: '600 A' }] },
      { name: 'FEEDERLF', label: 'Feeder length', unit: 'LF', default: 120, min: 10, max: 1000, step: 10 },
    ],
    components: [
      { description: 'Panelboard with main breaker', csi_code: '26 24 16', unit: 'EA',
        qty: '=DRIVER', unit_material_cost: 1450, unit_labor_cost: 620,
        basis: 'Cost scales with the ampere rating — check against your supplier' },
      { description: 'Feeder conduit', csi_code: '26 05 33', unit: 'LF',
        qty: '=DRIVER*FEEDERLF', waste_factor_pct: 6, unit_material_cost: 4.85, unit_labor_cost: 6.4 },
      { description: 'Feeder conductors', csi_code: '26 05 19', unit: 'LF',
        qty: '=DRIVER*FEEDERLF*4', waste_factor_pct: 8, unit_material_cost: 3.2, unit_labor_cost: 1.15,
        basis: 'Three phase conductors plus a neutral' },
      { description: 'Equipment ground', csi_code: '26 05 26', unit: 'LF',
        qty: '=DRIVER*FEEDERLF', waste_factor_pct: 8, unit_material_cost: 1.15, unit_labor_cost: 0.55 },
      { description: 'Terminations and breaker at source', csi_code: '26 24 16', unit: 'EA',
        qty: '=DRIVER', unit_material_cost: 385, unit_labor_cost: 240 },
    ],
  },

  /* ── 27/28 Comms and safety ───────────────────────────────────────────── */
  {
    id: 'data-drop',
    name: 'Data drop — cable, jack, patch, test',
    division: '27', driverUnit: 'EA', driverLabel: 'Number of drops',
    description: 'Horizontal cabling from the rack to the outlet, terminated and certified.',
    params: [
      { name: 'AVGLF', label: 'Average cable run', unit: 'LF', default: 180, min: 40, max: 295, step: 10,
        help: 'TIA caps a horizontal run at 295 ft — a longer one needs another closet.' },
      { name: 'CAT', label: 'Cable category', default: 6,
        options: [{ value: 6, label: 'Cat 6' }, { value: 6.5, label: 'Cat 6A' }] },
    ],
    components: [
      { description: 'Horizontal cable', csi_code: '27 15 00', unit: 'LF',
        qty: '=DRIVER*AVGLF', waste_factor_pct: 10, unit_material_cost: 0.34, unit_labor_cost: 0.28 },
      { description: 'Cat 6A premium', csi_code: '27 15 00', unit: 'LF',
        qty: '=DRIVER*AVGLF', when: '=CAT>6', unit_material_cost: 0.28 },
      { description: 'Jack, faceplate and box', csi_code: '27 15 43', unit: 'EA',
        qty: '=DRIVER', unit_material_cost: 18.5, unit_labor_cost: 26 },
      { description: 'Patch panel port share', csi_code: '27 11 00', unit: 'EA',
        qty: '=CEILING(DRIVER/48,1)', unit_material_cost: 285, unit_labor_cost: 165,
        basis: 'One 48-port panel per 48 drops' },
      { description: 'Certification testing', csi_code: '27 08 00', unit: 'EA',
        qty: '=DRIVER', unit_labor_cost: 14,
        basis: 'Every drop gets tested and a report — it is what the warranty rests on' },
      { description: 'J-hooks and pathway support', csi_code: '27 05 28', unit: 'EA',
        qty: '=CEILING(DRIVER*AVGLF/5,1)', unit_material_cost: 2.1, unit_labor_cost: 3.4,
        basis: 'Support every 5 ft of cable run' },
    ],
  },
  {
    id: 'fire-alarm-device',
    name: 'Fire alarm device — detector or notification',
    division: '28', driverUnit: 'EA', driverLabel: 'Number of devices',
    description: 'Addressable devices with SLC wiring back to the panel.',
    components: [
      { description: 'Addressable device', csi_code: '28 31 00', unit: 'EA',
        qty: '=DRIVER', unit_material_cost: 92, unit_labor_cost: 68 },
      { description: 'Backbox and mounting', csi_code: '28 31 00', unit: 'EA',
        qty: '=DRIVER', unit_material_cost: 8.4, unit_labor_cost: 12 },
      { description: 'SLC wiring, plenum rated', csi_code: '28 31 00', unit: 'LF',
        qty: '=DRIVER*55', waste_factor_pct: 10, unit_material_cost: 0.68, unit_labor_cost: 0.55,
        basis: '55 LF of loop wiring per device' },
      { description: 'Panel programming and point commissioning', csi_code: '28 31 00', unit: 'EA',
        qty: '=DRIVER', unit_labor_cost: 22 },
      { description: 'AHJ acceptance test', csi_code: '28 08 00', unit: 'LS',
        qty: '=1', unit_sub_cost: 1850,
        basis: 'One witnessed test regardless of device count' },
    ],
  },

  /* ── 31/32 Sitework ───────────────────────────────────────────────────── */
  {
    id: 'site-excavation',
    name: 'Mass excavation — cut, haul, compact',
    division: '31', driverUnit: 'CY', driverLabel: 'Cubic yards of cut',
    description: 'Bulk earthwork with haul-off and structural fill.',
    params: [
      { name: 'HAULPCT', label: 'Hauled off site', unit: '%', default: 60, min: 0, max: 100, step: 5,
        help: 'The rest is reused on site as fill, which costs far less than trucking it away.' },
      { name: 'HAULMI', label: 'Haul distance', unit: 'mi', default: 12, min: 1, max: 80, step: 1 },
    ],
    components: [
      { description: 'Excavation and load', csi_code: '31 23 16', unit: 'CY',
        qty: '=DRIVER', unit_labor_cost: 3.4, unit_equipment_cost: 5.2 },
      { description: 'Haul off site', csi_code: '31 23 23', unit: 'CY',
        qty: '=ROUND(DRIVER*HAULPCT/100,1)',
        unit_equipment_cost: 8.5, basis: 'Only the share not reused on site' },
      { description: 'Haul distance premium', csi_code: '31 23 23', unit: 'CY',
        qty: '=ROUND(DRIVER*HAULPCT/100,1)', when: '=HAULMI>12',
        unit_equipment_cost: 0.42, basis: 'Beyond a 12-mile round trip, per CY per extra mile' },
      { description: 'On-site placement and compaction', csi_code: '31 23 23', unit: 'CY',
        qty: '=ROUND(DRIVER*(100-HAULPCT)/100,1)',
        unit_labor_cost: 2.2, unit_equipment_cost: 3.8 },
      { description: 'Erosion control and SWPPP maintenance', csi_code: '31 25 00', unit: 'CY',
        qty: '=DRIVER', unit_material_cost: 0.35, unit_labor_cost: 0.4 },
    ],
  },
  {
    id: 'asphalt-paving',
    name: 'Asphalt paving — base, binder, surface',
    division: '32', driverUnit: 'SF', driverLabel: 'Square feet of pavement',
    description: 'Aggregate base with asphalt binder and surface courses.',
    params: [
      { name: 'BASEIN', label: 'Aggregate base', unit: 'in', default: 6, min: 4, max: 18, step: 1 },
      { name: 'ASPHALTIN', label: 'Asphalt thickness', unit: 'in', default: 3, min: 2, max: 8, step: 0.5 },
      { name: 'STRIPING', label: 'Striping and markings', default: 1,
        options: [{ value: 0, label: 'None' }, { value: 1, label: 'Stalls and markings' }] },
    ],
    components: [
      { description: 'Aggregate base course', csi_code: '32 11 23', unit: 'TON',
        qty: '=ROUND(DRIVER*BASEIN/12*145/2000,1)', waste_factor_pct: 5,
        unit_material_cost: 28, unit_labor_cost: 6.5, unit_equipment_cost: 4.2,
        basis: 'Compacted aggregate at about 145 lb per cubic foot' },
      { description: 'Asphalt concrete', csi_code: '32 12 16', unit: 'TON',
        qty: '=ROUND(DRIVER*ASPHALTIN/12*145/2000,1)', waste_factor_pct: 5,
        unit_material_cost: 98, unit_labor_cost: 12, unit_equipment_cost: 9,
        basis: 'Asphalt at about 145 lb per cubic foot compacted' },
      { description: 'Subgrade preparation', csi_code: '31 22 13', unit: 'SF',
        qty: '=DRIVER', unit_labor_cost: 0.18, unit_equipment_cost: 0.22 },
      { description: 'Tack coat', csi_code: '32 12 16', unit: 'SF',
        qty: '=DRIVER', unit_material_cost: 0.06, unit_labor_cost: 0.04 },
      { description: 'Striping and pavement markings', csi_code: '32 17 23', unit: 'SF',
        qty: '=DRIVER', when: '=STRIPING', unit_sub_cost: 0.09,
        basis: 'Stalls, arrows and accessible markings' },
    ],
  },

  /* ── 01 General requirements ──────────────────────────────────────────── */
  {
    id: 'general-conditions',
    name: 'General conditions — supervision, facilities, cleanup',
    division: '01', driverUnit: 'MO', driverLabel: 'Months of duration',
    description: 'Time-driven site overhead. The line that gets forgotten and then eats the margin.',
    params: [
      { name: 'SUPERS', label: 'Superintendents', default: 1, min: 0, max: 6, step: 1 },
      { name: 'PMPCT', label: 'PM allocation', unit: '%', default: 50, min: 0, max: 100, step: 10,
        help: 'How much of a project manager this job actually consumes.' },
    ],
    components: [
      { description: 'Site superintendent', csi_code: '01 31 13', unit: 'MO',
        qty: '=DRIVER*SUPERS', when: '=SUPERS', unit_labor_cost: 13500 },
      { description: 'Project management allocation', csi_code: '01 31 13', unit: 'MO',
        qty: '=ROUND(DRIVER*PMPCT/100,2)', when: '=PMPCT', unit_labor_cost: 15500 },
      { description: 'Site office and utilities', csi_code: '01 52 13', unit: 'MO',
        qty: '=DRIVER', unit_material_cost: 1450 },
      { description: 'Temporary toilets and facilities', csi_code: '01 52 13', unit: 'MO',
        qty: '=DRIVER', unit_material_cost: 385 },
      { description: 'Dumpsters and waste removal', csi_code: '01 74 19', unit: 'MO',
        qty: '=DRIVER', unit_material_cost: 1250 },
      { description: 'Progressive and final cleaning', csi_code: '01 74 13', unit: 'MO',
        qty: '=DRIVER', unit_labor_cost: 1850 },
      { description: 'Small tools and consumables', csi_code: '01 54 00', unit: 'MO',
        qty: '=DRIVER', unit_material_cost: 650 },
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
  /** Components switched off by their `when` condition, and therefore absent. */
  skipped: string[];
  driverQty: number;
  params: Record<string, number>;
  /** Total cost of the expansion at the library's placeholder prices. */
  indicativeTotal: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Parameter defaults for an assembly, as the expression evaluator wants them. */
export function defaultParams(a: Assembly): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of a.params ?? []) out[p.name] = p.default;
  return out;
}

/**
 * Expand an assembly at a given driver quantity and parameter set.
 *
 * A component whose expression fails is reported and left out rather than
 * silently landing at zero — a missing line in a bid is survivable if you are
 * told about it, and expensive if you are not. A component switched off by its
 * `when` condition is reported separately, because "you turned that off" and
 * "that broke" are different facts.
 */
export function expandAssembly(
  assembly: Assembly,
  driverQty: number,
  opts: { startSortOrder?: number; params?: Record<string, number> } = {},
): ExpansionResult {
  const errors: { description: string; code: string }[] = [];
  const skipped: string[] = [];
  const lines: ExpandedLine[] = [];
  let sort = opts.startSortOrder ?? 0;

  const driver = Number(driverQty);
  const params = { ...defaultParams(assembly), ...(opts.params ?? {}) };

  if (!Number.isFinite(driver) || driver <= 0) {
    return {
      lines: [], errors: [{ description: assembly.name, code: '#NUM!' }], skipped: [],
      driverQty: 0, params, indicativeTotal: 0,
    };
  }

  const vars = { DRIVER: driver, ...params };

  for (const c of assembly.components) {
    /* The `when` gate runs first: a component that is switched off should not
       report a quantity error for arithmetic that was never going to apply. */
    if (c.when) {
      try {
        if (evaluateExpression(c.when, vars) === 0) { skipped.push(c.description); continue; }
      } catch (e) {
        errors.push({ description: c.description, code: e instanceof FormulaError ? e.code : '#VALUE!' });
        continue;
      }
    }

    let qty: number;
    try {
      qty = evaluateExpression(c.qty, vars);
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

  const indicativeTotal = round2(lines.reduce((s, l) => s + lineValue(l), 0));
  return { lines, errors, skipped, driverQty: driver, params, indicativeTotal };
}

const lineValue = (l: GridRow): number => {
  const adj = (Number(l.quantity) || 0) * (1 + (Number(l.waste_factor_pct) || 0) / 100);
  return adj * ((Number(l.unit_material_cost) || 0) + (Number(l.unit_labor_cost) || 0)
    + (Number(l.unit_equipment_cost) || 0) + (Number(l.unit_sub_cost) || 0));
};

/**
 * How much of an expansion is still sitting on library placeholder pricing.
 *
 * Shipping confident national unit costs is how estimating software loses jobs
 * for people, so the honest thing is to be loud about which numbers are still
 * ours rather than theirs.
 */
export function assemblyNeedsPricing(lines: ExpandedLine[]): { count: number; total: number; pct: number } {
  const flagged = lines.filter((l) => l.needs_pricing);
  const total = round2(flagged.reduce((s, l) => s + lineValue(l), 0));
  const all = round2(lines.reduce((s, l) => s + lineValue(l), 0));
  return { count: flagged.length, total, pct: all > 0 ? Math.round((total / all) * 100) : 0 };
}

/**
 * What changing one parameter does to the price.
 *
 * The question an estimator actually has is not "what does this cost" but "what
 * does going to 24-inch spacing save me". Answering it takes two expansions and
 * a subtraction, so it may as well be one call.
 */
export function paramSensitivity(
  assembly: Assembly,
  driverQty: number,
  param: AssemblyParam,
  base: Record<string, number>,
): { value: number; label: string; total: number; delta: number; deltaPct: number }[] {
  const baseline = expandAssembly(assembly, driverQty, { params: base }).indicativeTotal;
  const values = param.options
    ? param.options.map((o) => ({ value: o.value, label: o.label }))
    : [param.min, param.default, param.max]
        .filter((v): v is number => typeof v === 'number')
        .filter((v, i, a) => a.indexOf(v) === i)
        .map((v) => ({ value: v, label: `${v}${param.unit ? ' ' + param.unit : ''}` }));

  return values.map(({ value, label }) => {
    const total = expandAssembly(assembly, driverQty, { params: { ...base, [param.name]: value } }).indicativeTotal;
    return {
      value, label, total,
      delta: round2(total - baseline),
      deltaPct: baseline > 0 ? Math.round(((total - baseline) / baseline) * 1000) / 10 : 0,
    };
  });
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

/** Free-text search across name, description, division and component text. */
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
