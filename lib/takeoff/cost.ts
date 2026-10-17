/**
 * Cost catalog — material unit prices in integer CENTS, keyed by costKey.
 * These are seed regional rates; the real system overlays a tenant's historical
 * rates on top (same keys). Deterministic — no per-item AI invention.
 */
export interface CostEntry { unit: string; materialCents: number; note?: string }

export const COST_CATALOG: Record<string, CostEntry> = {
  // concrete
  concrete_cy:        { unit: 'CY', materialCents: 16500, note: '3000psi delivered' },
  rebar_lb:           { unit: 'LB', materialCents: 95 },
  vapor_barrier_sf:   { unit: 'SF', materialCents: 22 },
  formwork_sf:        { unit: 'SF', materialCents: 340 },
  // masonry / structural
  cmu_ea:             { unit: 'EA', materialCents: 300, note: '8in block' },
  steel_column_ea:    { unit: 'EA', materialCents: 78000, note: 'W8x24 w/ base plate' },
  anchor_bolt_set:    { unit: 'EA', materialCents: 4200 },
  // framing / drywall
  metal_stud_ea:      { unit: 'EA', materialCents: 1100, note: '3-5/8in 25ga x9ft' },
  track_lf:           { unit: 'LF', materialCents: 140 },
  drywall_sf:         { unit: 'SF', materialCents: 120, note: '5/8in Type-X' },
  insulation_sf:      { unit: 'SF', materialCents: 70,  note: 'R-13 batt' },
  finish_sf:          { unit: 'SF', materialCents: 55,  note: 'tape/mud L4' },
  paint_sf:           { unit: 'SF', materialCents: 65,  note: '2 coats' },
  // openings
  door_frame_ea:      { unit: 'EA', materialCents: 95000, note: 'HM door + frame' },
  door_hardware_set:  { unit: 'EA', materialCents: 38000 },
  // roofing
  tpo_sf:             { unit: 'SF', materialCents: 210 },
  rigid_insul_sf:     { unit: 'SF', materialCents: 150 },
  // masonry wall
  cmu_wall_ea:        { unit: 'EA', materialCents: 320, note: '8in CMU incl mortar' },
  grout_cy:           { unit: 'CY', materialCents: 18000 },
  // steel
  steel_beam_lb:      { unit: 'LB', materialCents: 130, note: 'W-shape erected' },
  // finishes
  acoustic_ceiling_sf:{ unit: 'SF', materialCents: 380, note: 'ACT grid + tile' },
  flooring_sf:        { unit: 'SF', materialCents: 550, note: 'VCT / LVT avg' },
  // MEP fixtures
  plumbing_fixture_ea:{ unit: 'EA', materialCents: 65000 },
  light_fixture_ea:   { unit: 'EA', materialCents: 22000 },

  // ==== v2 additions — RSMeans-ballpark national averages (bare material unless marked SUB all-in);
  //      tenant RateOverrides win via unitCostCents(). ====

  // SITEWORK (31/32)
  excavation_cy:        { unit: 'CY', materialCents: 900,   note: 'bulk machine excav, equip+op all-in' },
  agg_base_cy:          { unit: 'CY', materialCents: 3400,  note: 'crushed base course delivered' },
  asphalt_paving_sf:    { unit: 'SF', materialCents: 450,   note: '2-3in AC over base, SUB all-in' },
  curb_gutter_lf:       { unit: 'LF', materialCents: 900,   note: '6in CIP curb+gutter, conc+form blend' },
  wwm_sf:               { unit: 'SF', materialCents: 35,    note: '6x6 W1.4 welded wire mesh' },
  // CONCRETE (03)
  metal_deck_sf:        { unit: 'SF', materialCents: 340,   note: '1.5in composite 20ga' },
  roof_deck_sf:         { unit: 'SF', materialCents: 240,   note: '1.5in B roof deck 22ga' },
  pier_drill_ea:        { unit: 'EA', materialCents: 45000, note: 'drilled pier mobilization+drill' },
  // MASONRY (04)
  brick_veneer_sf:      { unit: 'SF', materialCents: 650,   note: 'modular brick + mortar' },
  masonry_tie_ea:       { unit: 'EA', materialCents: 45 },
  // STEEL (05)
  bar_joist_lf:         { unit: 'LF', materialCents: 950,   note: 'K-series open-web joist' },
  // FRAMING (06/0922)
  wood_stud_ea:         { unit: 'EA', materialCents: 450,   note: '2x4x9 SPF #2' },
  wood_plate_lf:        { unit: 'LF', materialCents: 95,    note: '2x4 plate stock' },
  sheathing_sf:         { unit: 'SF', materialCents: 130,   note: '1/2in ext gyp (DensGlass)' },
  osb_sheathing_sf:     { unit: 'SF', materialCents: 75,    note: '7/16in OSB' },
  wrb_sf:               { unit: 'SF', materialCents: 30,    note: 'mechanically-fastened building wrap' },
  batt_r19_sf:          { unit: 'SF', materialCents: 90,    note: 'R-19 batt' },
  // THERMAL/MOISTURE (07)
  spray_foam_sf:        { unit: 'SF', materialCents: 300,   note: '2in closed-cell SPF' },
  mod_bit_sf:           { unit: 'SF', materialCents: 320,   note: '2-ply mod-bit' },
  waterproofing_sf:     { unit: 'SF', materialCents: 250,   note: 'below-grade waterproofing' },
  sealant_lf:           { unit: 'LF', materialCents: 45,    note: 'ext urethane sealant' },
  // OPENINGS (08)
  wood_door_ea:         { unit: 'EA', materialCents: 48000, note: 'solid-core wood door + HM/wood frame' },
  aluminum_storefront_sf:{ unit: 'SF', materialCents: 8500, note: 'alum storefront+glazing, SUB all-in' },
  alum_window_sf:       { unit: 'SF', materialCents: 5500,  note: 'commercial punched window' },
  // FINISHES (09)
  vct_sf:               { unit: 'SF', materialCents: 220 },
  lvt_sf:               { unit: 'SF', materialCents: 380 },
  carpet_tile_sy:       { unit: 'SY', materialCents: 2800 },
  ceramic_tile_sf:      { unit: 'SF', materialCents: 650 },
  tile_setting_sf:      { unit: 'SF', materialCents: 120,   note: 'thinset+grout' },
  conc_seal_sf:         { unit: 'SF', materialCents: 120,   note: 'densify+seal/polish' },
  wall_base_lf:         { unit: 'LF', materialCents: 120,   note: '4in rubber base' },
  wallcovering_sf:      { unit: 'SF', materialCents: 220,   note: 'Type-II vinyl WC' },
  // SPECIALTIES (10)
  toilet_partition_ea:  { unit: 'EA', materialCents: 45000, note: 'powder-coat metal, per stall' },
  toilet_accessory_ea:  { unit: 'EA', materialCents: 12000, note: 'accessory set per fixture group' },
  // MEP (21/22/23/26) — SUB all-in unless noted
  hvac_sf:              { unit: 'SF', materialCents: 2200,  note: 'light-commercial RTU+dist, SUB' },
  fire_sprinkler_sf:    { unit: 'SF', materialCents: 350,   note: 'wet system, SUB' },
  sprinkler_head_ea:    { unit: 'EA', materialCents: 18000, note: 'head + branch, SUB' },
  plumbing_rough_ea:    { unit: 'EA', materialCents: 55000, note: 'per-fixture DWV+supply rough, SUB' },
  electrical_sf:        { unit: 'SF', materialCents: 1100,  note: 'branch power+distribution, SUB' },
  device_ea:            { unit: 'EA', materialCents: 350,   note: 'recept/switch device+plate' },
  data_drop_ea:         { unit: 'EA', materialCents: 18000, note: 'Cat6 drop + term, SUB' },
};

import type { RateOverrides } from './types';

/* Plain names for the keys whose words are shorthand. Every other key reads
   from its own words (concrete_cy → "Concrete"). */
const COST_NAMES: Record<string, string> = {
  cmu_ea: 'CMU block', cmu_wall_ea: 'CMU wall', tpo_sf: 'TPO roofing', vct_sf: 'VCT flooring', lvt_sf: 'LVT flooring',
  wwm_sf: 'Welded wire mesh', wrb_sf: 'Weather barrier', agg_base_cy: 'Aggregate base', osb_sheathing_sf: 'OSB sheathing',
  mod_bit_sf: 'Mod-bit roofing', hvac_sf: 'HVAC', conc_seal_sf: 'Concrete sealer', batt_r19_sf: 'R-19 batt insulation',
  alum_window_sf: 'Aluminum windows', rigid_insul_sf: 'Rigid insulation', finish_sf: 'Drywall finish',
  anchor_bolt_set: 'Anchor bolt set', door_hardware_set: 'Door hardware set', door_frame_ea: 'Door and frame',
  pier_drill_ea: 'Drilled pier', data_drop_ea: 'Data drop', device_ea: 'Electrical device',
};
const UNIT_SUFFIX = /_(cy|sf|sy|lf|lb|ea|set)$/;

/** A cost key as a person reads it: "concrete_cy" → "Concrete". The unit is
 *  shown beside it ("Concrete · CY"), never baked into the name. */
export function costKeyLabel(costKey: string): string {
  if (COST_NAMES[costKey]) return COST_NAMES[costKey];
  const words = String(costKey || '').replace(UNIT_SUFFIX, '').split('_').filter(Boolean).join(' ');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Item';
}

/**
 * Unit material cost (cents) — a tenant's learned/manual rate wins over the book.
 * `regionMultiplier` (city cost index) scales ONLY the national catalog rate; a tenant
 * override is their actual local price and is left untouched.
 */
export function unitCostCents(costKey: string, rates?: RateOverrides, regionMultiplier?: number): number {
  if (rates && rates[costKey] != null) return rates[costKey];
  const base = COST_CATALOG[costKey]?.materialCents ?? 0;
  const m = regionMultiplier && regionMultiplier > 0 ? regionMultiplier : 1;
  return m === 1 ? base : Math.round(base * m);
}

/** Where the rate came from — for the confidence/source badge on each line. */
export function rateSourceFor(costKey: string, rates?: RateOverrides): 'tenant' | 'catalog' {
  return rates && rates[costKey] != null ? 'tenant' : 'catalog';
}
