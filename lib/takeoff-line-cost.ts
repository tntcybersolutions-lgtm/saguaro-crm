/**
 * takeoff-line-cost — one definition of what an AI-takeoff line COSTS.
 *
 * WHY: an AI takeoff line stores its MATERIAL extension in total_cost and its
 * labor only as hours. Labor exists as one number on the takeoff header
 * (takeoffs.labor_cost — the model's labor total, or hours × $65). Every
 * consumer used to pick a different subset:
 *   - the line table showed material only,
 *   - the header showed (material + labor) × (1 + AI contingency),
 *   - the budget and bid packages carried material only,
 * so a GC saw four totals that did not reconcile and a budget missing all labor.
 *
 * The rule here: a line's direct cost = its material + its share of the
 * takeoff's labor total. The share is by labor hours (labor_cost / Σ hours per
 * hour). If no line carries hours but the takeoff has a labor total, it is
 * spread in proportion to material so the lines still sum to material + labor.
 * Σ line direct cost === material total + labor total, to the cent (modulo float).
 */

export interface LaborAllocation {
  /** $ of labor per labor-hour on a line. */
  perHour: number;
  /** $ of labor per $ of material — only used when no line carries hours. */
  perMaterialDollar: number;
}

export interface CostLine {
  totalCost: number;   // material extension
  laborHours: number;
}

export function laborAllocation(lines: CostLine[], laborTotal: number): LaborAllocation {
  const labor = Number(laborTotal) || 0;
  if (labor <= 0) return { perHour: 0, perMaterialDollar: 0 };
  const hours = lines.reduce((s, l) => s + (Number(l.laborHours) || 0), 0);
  if (hours > 0) return { perHour: labor / hours, perMaterialDollar: 0 };
  const mat = lines.reduce((s, l) => s + (Number(l.totalCost) || 0), 0);
  return { perHour: 0, perMaterialDollar: mat > 0 ? labor / mat : 0 };
}

/** The labor dollars carried by one line under an allocation. */
export function lineLabor(line: CostLine, alloc: LaborAllocation): number {
  return (Number(line.laborHours) || 0) * alloc.perHour + (Number(line.totalCost) || 0) * alloc.perMaterialDollar;
}

/** Material + allocated labor — the line's direct cost. */
export function lineDirectCost(line: CostLine, alloc: LaborAllocation): number {
  return (Number(line.totalCost) || 0) + lineLabor(line, alloc);
}
