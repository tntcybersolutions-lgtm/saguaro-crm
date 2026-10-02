/**
 * Heatmap engine — INTER-FLOOR RF propagation (vertical signal bleed).
 *
 * 2.5D predictive tools model each floor in isolation. Real WiFi bleeds vertically:
 * an AP on floor N also (attenuated) illuminates floors N±1, N±2 — through the slab.
 * This module turns every AP on the OTHER floors of a stacked building into a
 * "virtual" AP on each target floor whose effective TX power is knocked down by the
 * vertical loss (floor slabs crossed + the extra vertical propagation distance). The
 * existing 2D `computeCoverage` can then fold those virtual APs into the per-floor
 * grid with no change to its math — the horizontal path-loss it already computes is
 * simply applied on top of the reduced effective TX.
 *
 * It also flags the worst SAME-CHANNEL inter-floor interference between adjacent
 * stacked floors (the classic co-channel-through-the-slab planning mistake).
 *
 * Pure TypeScript, DOM-free, deterministic (no Date/Math.random). Path-loss math is
 * REUSED from ./engine (apRssiAt) and ./models (REF_LOSS_1M, PATH_LOSS_EXP, FT_PER_M)
 * rather than re-derived.
 */
import type { Pt } from './geometry';
import type { Band, Device, HeatmapProject } from './types';
import { FT_PER_M, PATH_LOSS_EXP, REF_LOSS_1M } from './models';
import { apRssiAt } from './engine';

const log10 = (x: number) => Math.log(x) / Math.LN10;

/* ── Floor-slab attenuation by construction (dB per slab crossed) ──────────── */
/**
 * Vertical attenuation of a single floor/ceiling assembly. Sourced from measured
 * indoor floor-penetration losses (concrete decks are the dominant blocker; light
 * wood/steel decks and raised access floors leak far more between levels).
 */
export type SlabType = 'concrete' | 'post_tension' | 'steel_deck' | 'wood_deck' | 'raised_floor';

export const FLOOR_SLAB_LOSS_DB: Record<SlabType, { label: string; db: number }> = {
  post_tension: { label: 'Post-tension concrete slab', db: 23 },
  concrete:     { label: 'Concrete slab',              db: 20 }, // ~18–23
  steel_deck:   { label: 'Steel / metal deck',         db: 15 }, // ~12–15
  wood_deck:    { label: 'Wood-frame floor',           db: 13 }, // ~12–15
  raised_floor: { label: 'Raised access floor',        db: 10 },
};

/** Default floor-to-floor height (ft) when the caller doesn't specify. */
export const DEFAULT_FLOOR_HEIGHT_FT = 11;
/** Peak vertical RSSI (dBm, directly above/below the source) below which a bleed
 *  contribution is negligible and is not emitted. Anything weaker can't serve or
 *  meaningfully interfere on the neighbouring floor. */
export const BLEED_NEGLIGIBLE_DBM = -82;
/** Only same-channel bleed at or above this level counts as inter-floor interference. */
export const INTERFERENCE_FLOOR_DBM = -85;
/** Hard cap on how many floors away we bother modeling (loss dominates past this). */
export const MAX_FLOORS_AWAY = 3;

export interface StackedFloor {
  /** Physical stacking index — higher = higher in the building. Gaps are allowed. */
  level: number;
  /** That floor's own plan/devices/walls/scale/env. */
  project: HeatmapProject;
}

export interface InterFloorOptions {
  floorHeightFt?: number;
  slab?: SlabType;
}

/** A virtual AP bleeding onto a target floor from a source floor. */
export interface BleedAp {
  /** Drop-in `wifi_ap` Device for the existing 2D compute — TX already de-rated. */
  device: Device;
  fromLevel: number;
  toLevel: number;
  floorsAway: number;
  band: Band;
  channel: number | null;
  /** Slab component of the vertical loss (dB). */
  slabLossDb: number;
  /** Extra vertical propagation loss for the level separation (dB). */
  verticalPathLossDb: number;
  /** Total vertical loss knocked off the source TX (dB). */
  verticalLossDb: number;
  /** Effective TX power (dBm) written onto the virtual device. */
  effectiveTxPowerDbm: number;
  /** Best-case RSSI it delivers on the target floor (directly above/below source). */
  peakRssiDbm: number;
}

export interface FloorBleed {
  level: number;
  /** Virtual bleed APs illuminating THIS floor, sourced from every OTHER floor. */
  bleedAps: BleedAp[];
}

export type InterferenceSeverity = 'severe' | 'moderate' | 'minor';

export interface InterFloorInterference {
  aLevel: number;
  bLevel: number;
  aDeviceId: string;
  bDeviceId: string;
  band: Band;
  channel: number;
  floorsApart: number;
  /** RSSI the floor-A AP delivers at the floor-B AP's location (and vice-versa). */
  bleedAtoBDbm: number;
  bleedBtoADbm: number;
  worstBleedDbm: number;
  severity: InterferenceSeverity;
}

export interface InterFloorResult {
  floors: FloorBleed[];
  interference: InterFloorInterference[];
  worstInterference: InterFloorInterference | null;
  params: {
    floorHeightFt: number;
    slab: SlabType;
    slabLossPerFloorDb: number;
  };
}

/* ── Vertical-loss model ───────────────────────────────────────────────────── */

/**
 * Extra loss (dB) seen by a signal traveling `floorsAway` levels vertically:
 *   slab loss × floors crossed  +  the log-distance path loss of the vertical drop.
 * The vertical drop uses the SAME log-distance exponent as the receiving floor's
 * environment; we take only the distance-dependent term (not REF_LOSS_1M) because
 * the receiving 2D compute already applies the 1 m reference for the horizontal leg.
 */
export function verticalLossDb(
  floorsAway: number,
  slabLossPerFloorDb: number,
  floorHeightFt: number,
  env: HeatmapProject['env'],
): { slabLossDb: number; verticalPathLossDb: number; totalDb: number } {
  const slabLossDb = slabLossPerFloorDb * floorsAway;
  const sepM = Math.max((floorsAway * floorHeightFt) / FT_PER_M, 1);
  const n = PATH_LOSS_EXP[env];
  const verticalPathLossDb = 10 * n * log10(sepM);
  return { slabLossDb, verticalPathLossDb, totalDb: slabLossDb + verticalPathLossDb };
}

const bandOf = (d: Device): Band => (d.band || '5') as Band;

/** Peak RSSI (dBm) directly above/below the source — horizontal distance 0, no walls. */
function peakRssiDbm(effTxDbm: number, gainDbi: number, band: Band): number {
  // Mirrors apRssiAt at 1 m: (tx+gain) − REF_LOSS_1M − 0·path − 0·walls.
  return effTxDbm + gainDbi - REF_LOSS_1M[band];
}

function severityOf(dbm: number): InterferenceSeverity {
  if (dbm >= -67) return 'severe';
  if (dbm >= -78) return 'moderate';
  return 'minor';
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

/**
 * For each floor in the stack, produce the list of virtual "bleed" APs it receives
 * from every other floor (TX already de-rated by vertical loss, ready to fold into
 * `computeCoverage`), plus a worst-first list of same-channel adjacent-floor
 * interference between stacked APs.
 */
export function computeInterFloorContribution(
  floors: StackedFloor[],
  opts: InterFloorOptions = {},
): InterFloorResult {
  const floorHeightFt = opts.floorHeightFt ?? DEFAULT_FLOOR_HEIGHT_FT;
  const slab = opts.slab ?? 'concrete';
  const slabLossPerFloorDb = FLOOR_SLAB_LOSS_DB[slab].db;

  // Deterministic order: by level ascending.
  const ordered = [...floors].sort((a, b) => a.level - b.level);

  const floorBleeds: FloorBleed[] = ordered.map((f) => ({ level: f.level, bleedAps: [] }));
  const byLevelIndex = new Map<number, number>();
  ordered.forEach((f, i) => byLevelIndex.set(f.level, i));

  // ── Virtual bleed APs onto each target floor ──
  for (let ti = 0; ti < ordered.length; ti++) {
    const target = ordered[ti];
    for (let si = 0; si < ordered.length; si++) {
      if (si === ti) continue;
      const source = ordered[si];
      const floorsAway = Math.abs(source.level - target.level);
      if (floorsAway > MAX_FLOORS_AWAY) continue;

      const vloss = verticalLossDb(floorsAway, slabLossPerFloorDb, floorHeightFt, target.project.env);

      for (const dev of source.project.devices) {
        if (dev.typeId !== 'wifi_ap') continue;
        const band = bandOf(dev);
        const gain = dev.antennaGainDbi ?? 3;
        const origTx = dev.txPowerDbm ?? 15;
        const effTx = origTx - vloss.totalDb;
        const peak = peakRssiDbm(effTx, gain, band);
        if (peak < BLEED_NEGLIGIBLE_DBM) continue; // negligible → skip

        const virtual: Device = {
          ...dev,
          id: `bleed:${source.level}->${target.level}:${dev.id}`,
          label: `${dev.label || 'AP'} (bleed from L${source.level})`,
          txPowerDbm: effTx,
          antennaGainDbi: gain,
          band,
        };
        floorBleeds[ti].bleedAps.push({
          device: virtual,
          fromLevel: source.level,
          toLevel: target.level,
          floorsAway,
          band,
          channel: dev.channel ?? null,
          slabLossDb: vloss.slabLossDb,
          verticalPathLossDb: vloss.verticalPathLossDb,
          verticalLossDb: vloss.totalDb,
          effectiveTxPowerDbm: effTx,
          peakRssiDbm: peak,
        });
      }
    }
    // Deterministic ordering of contributions: strongest first, then id.
    floorBleeds[ti].bleedAps.sort(
      (x, y) => y.peakRssiDbm - x.peakRssiDbm || (x.device.id < y.device.id ? -1 : 1),
    );
  }

  // ── Same-channel interference between adjacent (and near) floors ──
  const interference: InterFloorInterference[] = [];
  for (let ai = 0; ai < ordered.length; ai++) {
    for (let bi = ai + 1; bi < ordered.length; bi++) {
      const A = ordered[ai];
      const B = ordered[bi];
      const floorsApart = Math.abs(A.level - B.level);
      if (floorsApart < 1 || floorsApart > MAX_FLOORS_AWAY) continue;

      const vAB = verticalLossDb(floorsApart, slabLossPerFloorDb, floorHeightFt, B.project.env);
      const vBA = verticalLossDb(floorsApart, slabLossPerFloorDb, floorHeightFt, A.project.env);

      for (const da of A.project.devices) {
        if (da.typeId !== 'wifi_ap' || da.channel == null) continue;
        for (const db of B.project.devices) {
          if (db.typeId !== 'wifi_ap' || db.channel == null) continue;
          if (da.channel !== db.channel || bandOf(da) !== bandOf(db)) continue;
          const band = bandOf(da);

          // A→B: A's virtual (de-rated) AP evaluated at B's device location on floor B.
          const effTxA = (da.txPowerDbm ?? 15) - vAB.totalDb;
          const bleedAtoB = apRssiAt(db.pos, da.pos, B.project, band, effTxA + (da.antennaGainDbi ?? 3));
          // B→A: symmetric.
          const effTxB = (db.txPowerDbm ?? 15) - vBA.totalDb;
          const bleedBtoA = apRssiAt(da.pos, db.pos, A.project, band, effTxB + (db.antennaGainDbi ?? 3));

          const worst = Math.max(bleedAtoB, bleedBtoA);
          if (worst < INTERFERENCE_FLOOR_DBM) continue;

          interference.push({
            aLevel: A.level,
            bLevel: B.level,
            aDeviceId: da.id,
            bDeviceId: db.id,
            band,
            channel: da.channel,
            floorsApart,
            bleedAtoBDbm: bleedAtoB,
            bleedBtoADbm: bleedBtoA,
            worstBleedDbm: worst,
            severity: severityOf(worst),
          });
        }
      }
    }
  }
  // Worst-first, deterministic tiebreak by levels then device ids.
  interference.sort(
    (x, y) =>
      y.worstBleedDbm - x.worstBleedDbm ||
      x.aLevel - y.aLevel ||
      x.bLevel - y.bLevel ||
      (x.aDeviceId < y.aDeviceId ? -1 : x.aDeviceId > y.aDeviceId ? 1 : 0) ||
      (x.bDeviceId < y.bDeviceId ? -1 : x.bDeviceId > y.bDeviceId ? 1 : 0),
  );

  return {
    floors: floorBleeds,
    interference,
    worstInterference: interference[0] ?? null,
    params: { floorHeightFt, slab, slabLossPerFloorDb },
  };
}
