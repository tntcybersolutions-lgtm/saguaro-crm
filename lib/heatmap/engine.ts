/**
 * Heatmap engine — coverage grid compute.
 * Rasterizes the plan into cells; for each cell computes the best value from all
 * devices of the ACTIVE type using the validated physical model, then bands to color.
 */
import type { Pt } from './geometry';
import { dist, crossings, angleDeg, angleDiff, pointInPolygon } from './geometry';
import type { Band, CoverageCell, CoverageResult, CoverageStats, Device, Env, HeatmapProject, MeasuredPoint, WallMaterialId } from './types';
import {
  FT_PER_M, REF_LOSS_1M, PATH_LOSS_EXP, RSSI_ZONES, wallDb, DEVICE_REGISTRY,
  DORI_ZONES, doriDistanceFt, SPL_BANDS, RF_MEASURED_1M, RF_USABLE_FLOOR,
  rssiRgb, cameraRgb, splRgb, radiusRgb,
} from './models';
import { relativeGainDb } from './antenna';

const log10 = (x: number) => Math.log(x) / Math.LN10;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const dbmToMw = (dbm: number) => Math.pow(10, dbm / 10);

/* ── Noise floor + SINR (audit #17) ──────────────────────────────────────────
   Coverage was gated on an RSSI threshold, and co-channel overlap was modeled as
   a flat "subtract up to 6 dB from the strongest neighbor" — physically wrong. We
   now compute a real SINR in the LINEAR power domain against a thermal noise floor
   and the SUM of ALL co-channel interferers. */

/** Receiver noise figure (dB) — typical enterprise Wi-Fi front-end (6–8 dB). */
export const RX_NOISE_FIGURE_DB = 7;
/**
 * Thermal noise floor (dBm) for a given channel width:
 *   N = 10·log10(k·T·B / 1 mW) + NF  =  −174 dBm/Hz + 10·log10(B_Hz) + NF
 * with kT at 290 K = −174 dBm/Hz (k = 1.38e-23 J/K). Gives −94 dBm @20 MHz,
 * −91 @40, −88 @80, −85 @160 with NF = 7 dB — the standard Wi-Fi noise floor.
 */
export function noiseFloorDbm(widthMhz: number): number {
  const bwHz = Math.max(1, widthMhz) * 1e6;
  return -174 + 10 * log10(bwHz) + RX_NOISE_FIGURE_DB;
}
/** Common enterprise channel-width defaults per band (2.4 kept at 20 to avoid overlap). */
export const DEFAULT_WIDTH_MHZ: Record<Band, number> = { '2.4': 20, '5': 40, '6': 80 };
/** Operating channel width (MHz) for a device — explicit override else band default. */
export function effectiveWidthMhz(dev: Device): number {
  return dev.widthMhz ?? DEFAULT_WIDTH_MHZ[(dev.band ?? '5') as Band];
}
/** Minimum SINR (dB) to decode the most-robust MCS with margin (BPSK/QPSK ≈ 2–5 dB). */
export const MIN_SINR_COVER_DB = 5;

/** Per-cell RF solution: serving signal, SNR, real SINR, and whether interference bit. */
export interface CellRf {
  signalDbm: number;   // best (serving) RSSI, dBm — TRUE received power (not degraded)
  snrDb: number;       // signal vs thermal noise floor only
  sinrDb: number;      // signal vs (Σ co-channel interferers + noise floor)
  serverId: string | null;
  interfered: boolean; // co-channel interference costs ≥ 1 dB of SINR here
  secondaryDbm: number; // 2nd-strongest AP RSSI (dBm), different device; -Infinity if none — roaming headroom
}
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/**
 * Directional antenna gain OFFSET (dB, ≤ 0) for a device serving `cell`.
 * Omitted pattern OR 'omni' → 0 in the flat (elevation-0) grid, so an isotropic AP
 * is byte-identical to the legacy scalar-gain model.
 */
function antennaOffsetDb(cell: Pt, dev: Device, apPos: Pt): number {
  const pat = dev.antennaPattern;
  if (!pat || pat === 'omni') return 0;
  const az = angleDeg(apPos, cell);
  return relativeGainDb(pat, az, 0, dev.azimuthDeg ?? 0, dev.downtiltDeg ?? 0, dev.beamwidthDeg);
}

/** In-band signal-quality normalization anchors (dBm) for the health score:
 *  RF_QUALITY_LOW = 'Good' RSSI threshold (bottom of usable-good), RF_QUALITY_HIGH =
 *  a solidly-excellent near-AP ceiling. avgValue is normalized 0..1 across this span. */
const RF_QUALITY_LOW = -70;
const RF_QUALITY_HIGH = -50;

/**
 * THE health score (0–100) — the ONE formula, used by every surface (the coverage
 * grid, smart.coverageMetrics, multifloor rollups): 60% coverage + 25% in-band
 * signal quality + 15% interference-free share of covered cells. Every input is a
 * dimensionless fraction/percent, so the units always agree — the retired second
 * formula in smart.ts divided a dead-zone ft² figure by a CELL COUNT and could
 * contradict the score the map itself displayed.
 */
export function healthScoreFromStats(
  s: Pick<CoverageStats, 'activeType' | 'deviceCount' | 'pctCovered' | 'avgValue' | 'coveredCells' | 'interferedCells'>,
): number {
  if (!s.deviceCount) return 0;
  const isRf = DEVICE_REGISTRY[s.activeType].modelType === 'rf';
  const qualityNorm = isRf
    ? clamp01((s.avgValue - RF_QUALITY_LOW) / (RF_QUALITY_HIGH - RF_QUALITY_LOW))
    : clamp01(s.pctCovered / 100);
  const interferenceFreeShare = s.coveredCells
    ? (isRf ? (s.coveredCells - (s.interferedCells ?? 0)) / s.coveredCells : 1)
    : 0;
  return Math.round(Math.max(0, Math.min(100,
    0.60 * s.pctCovered + 0.25 * qualityNorm * 100 + 0.15 * interferenceFreeShare * 100,
  )));
}

function pxToFt(px: number, pxPerFt: number) { return px / pxPerFt; }
function distFt(a: Pt, b: Pt, pxPerFt: number) { return pxToFt(dist(a, b), pxPerFt); }

/** Light partitions whose attenuation is largely ALREADY captured by the environment
 *  path-loss exponent (office/dense). Charging their full nominal dB on top of the
 *  exponent double-counts — it manufactures a false dead zone behind every drywall and
 *  drives auto-place to flood the plan with APs. We charge only their INCREMENTAL loss. */
const LIGHT_WALLS = new Set<WallMaterialId>(['drywall', 'cubicle', 'glass', 'wood_door']);
/** Env-based weight for light-partition loss (the denser the modeled environment, the
 *  more partition loss the exponent already includes, so the less we add explicitly). */
function lightWallFactor(env: Env): number {
  return env === 'open' ? 0.7 : env === 'dense' ? 0.25 : 0.4; // office = 0.4
}
/** Sum of wall attenuation (dB) along a→b for the given band. Heavy/structural walls
 *  (concrete, CMU, brick, metal, low-E glass) carry full weight; light partitions are
 *  discounted per the environment (they're already in the path-loss exponent). This is
 *  the SINGLE wall model shared by the live heatmap AND auto-placement, so what the
 *  optimizer trusts is exactly what the map paints. */
function wallLossDb(a: Pt, b: Pt, walls: HeatmapProject['walls'], band: Band, env: Env): number {
  const lf = lightWallFactor(env);
  let db = 0;
  for (const w of crossings(a, b, walls)) {
    const base = wallDb(w.material, band);
    db += LIGHT_WALLS.has(w.material) ? base * lf : base;
  }
  return db;
}
/** binary: is a→b blocked by any wall (for camera/PIR line-of-sight) */
function losBlocked(a: Pt, b: Pt, walls: HeatmapProject['walls']): boolean {
  return crossings(a, b, walls).length > 0;
}

/* ── Per-device value at a point ─────────────────────────────────────────── */

/** RF RSSI (dBm) at cell from an AP / BLE / IoT device. */
function rfRssi(cell: Pt, dev: Device, p: HeatmapProject): number {
  const pxPerFt = p.scale!.pxPerFt;
  const dM = Math.max(distFt(cell, dev.pos, pxPerFt) / FT_PER_M, 1);
  // Directional antenna offset (≤ 0). Isotropic/omni → 0 (legacy byte-compatible).
  const antOff = antennaOffsetDb(cell, dev, dev.pos);
  if (dev.typeId === 'wifi_ap') {
    const band = (dev.band || '5') as Band;
    const n = PATH_LOSS_EXP[p.env];
    const pl = REF_LOSS_1M[band] + 10 * n * log10(dM);
    const tx = (dev.txPowerDbm ?? 15) + (dev.antennaGainDbi ?? 3) + antOff;
    return tx - pl - wallLossDb(cell, dev.pos, p.walls, band, p.env);
  }
  // BLE / IoT: measured-power log-distance model
  const measured = RF_MEASURED_1M[dev.typeId] ?? -55;
  const n = dev.typeId === 'ble_beacon' ? 2.5 : 3;
  return measured + antOff - 10 * n * log10(dM) - wallLossDb(cell, dev.pos, p.walls, '2.4', p.env);
}

/**
 * Per-cell RF solution over the given RF devices: serving signal + REAL SINR.
 * SINR is computed in linear power (mW): S / (Σ co-channel interferer powers + N),
 * where N is the width-dependent thermal noise floor and the interference sum
 * includes EVERY co-channel device (not just the strongest). Reused by the coverage
 * grid and by lib/heatmap/capacity.ts so both share one physical model.
 */
export function cellRf(cell: Pt, active: Device[], p: HeatmapProject): CellRf {
  let bestRssi = -Infinity;
  let server: Device | null = null;
  const list: { d: Device; rssi: number }[] = [];
  for (const d of active) {
    const rssi = rfRssi(cell, d, p);
    list.push({ d, rssi });
    if (rssi > bestRssi) { bestRssi = rssi; server = d; }
  }
  if (!server || bestRssi <= -200) {
    return { signalDbm: -Infinity, snrDb: -Infinity, sinrDb: -Infinity, serverId: null, interfered: false, secondaryDbm: -Infinity };
  }
  // 2nd-strongest AP (a DIFFERENT device) — the roaming/overlap fallback signal.
  let secondaryDbm = -Infinity;
  for (const e of list) { if (e.d !== server && e.rssi > secondaryDbm) secondaryDbm = e.rssi; }
  const nf = noiseFloorDbm(effectiveWidthMhz(server));
  const sMw = dbmToMw(bestRssi);
  const nMw = dbmToMw(nf);
  // Sum ALL co-channel interferers (same non-null channel as the server) in linear power.
  let iMw = 0;
  const ch = server.channel;
  if (ch != null) {
    for (const e of list) if (e.d !== server && e.d.channel === ch) iMw += dbmToMw(e.rssi);
  }
  const snrDb = bestRssi - nf;
  const sinrDb = 10 * log10(sMw / (iMw + nMw));
  return { signalDbm: bestRssi, snrDb, sinrDb, serverId: server.id, interfered: snrDb - sinrDb >= 1, secondaryDbm };
}

/** Optional directional-antenna descriptor for apRssiAt (omit → isotropic, legacy). */
export interface ApAntenna {
  pattern: Device['antennaPattern'];
  azimuthDeg?: number;
  downtiltDeg?: number;
  beamwidthDeg?: number;
}

/**
 * RSSI (dBm) from a hypothetical AP at apPos — used by the auto-placement optimizer.
 * `antenna` is optional and additive: omitting it (all existing callers) adds a 0 dB
 * offset, reproducing the isotropic result. A directional descriptor makes it beam.
 */
export function apRssiAt(
  cell: Pt, apPos: Pt, p: HeatmapProject, band: Band = '5', txGain = 18, antenna?: ApAntenna,
): number {
  const dM = Math.max(distFt(cell, apPos, p.scale!.pxPerFt) / FT_PER_M, 1);
  const n = PATH_LOSS_EXP[p.env];
  const pl = REF_LOSS_1M[band] + 10 * n * log10(dM);
  const antOff = antenna && antenna.pattern && antenna.pattern !== 'omni'
    ? relativeGainDb(antenna.pattern, angleDeg(apPos, cell), 0, antenna.azimuthDeg ?? 0, antenna.downtiltDeg ?? 0, antenna.beamwidthDeg)
    : 0;
  return txGain + antOff - pl - wallLossDb(cell, apPos, p.walls, band, p.env);
}

/** Straight free-space distance (ft) at which a lone AP hits `target` dBm (for cell sizing). */
export function apUsableRadiusFt(p: HeatmapProject, band: Band = '5', txGain = 18, target = -67): number {
  const n = PATH_LOSS_EXP[p.env];
  // target = txGain - (refLoss + 10n log10(dM))  ->  dM = 10^((txGain-refLoss-target)/(10n))
  const dM = Math.pow(10, (txGain - REF_LOSS_1M[band] - target) / (10 * n));
  return dM * FT_PER_M;
}

function bandForRssi(rssi: number) {
  for (const z of RSSI_ZONES) if (rssi >= z.minDbm) return z;
  return RSSI_ZONES[RSSI_ZONES.length - 1];
}

/** Camera pixel-density (px/m) at cell, or 0 if not covered (out of sector / range / LOS blocked). */
function cameraPxPerM(cell: Pt, dev: Device, p: HeatmapProject): number {
  const pxPerFt = p.scale!.pxPerFt;
  const hfov = dev.hfovDeg ?? 68;
  const hpx = dev.resolutionPx ?? 2688;
  const aim = dev.aimDeg ?? 0;
  const detectFt = doriDistanceFt(hpx, hfov, 25); // outer range = detect distance
  const dFt = distFt(cell, dev.pos, pxPerFt);
  if (dFt > detectFt) return 0;
  if (angleDiff(angleDeg(dev.pos, cell), aim) > hfov / 2) return 0;
  if (losBlocked(cell, dev.pos, p.walls)) return 0;
  const dM = Math.max(dFt / FT_PER_M, 0.3);
  return hpx / (2 * dM * Math.tan((hfov * Math.PI) / 180 / 2));
}

/** Radius/FOV sensor: returns fraction-of-range (0..1) if covered, else -1. */
function radiusCoverage(cell: Pt, dev: Device, p: HeatmapProject): number {
  const def = DEVICE_REGISTRY[dev.typeId];
  const pxPerFt = p.scale!.pxPerFt;
  const rangeFt = dev.rangeFt ?? (def.defaults.rangeFt as number) ?? 30;
  const dFt = distFt(cell, dev.pos, pxPerFt);
  if (dFt > rangeFt) return -1;
  if (def.modelType === 'fov') {
    const ang = dev.coverageAngleDeg ?? (def.defaults.coverageAngleDeg as number) ?? 90;
    if (angleDiff(angleDeg(dev.pos, cell), dev.aimDeg ?? 0) > ang / 2) return -1;
  }
  const blocked = dev.wallBlocked ?? def.wallBlocked;
  if (blocked && losBlocked(cell, dev.pos, p.walls)) return -1;
  return dFt / rangeFt;
}

/** SPL (dB) at cell from a speaker. */
function splAt(cell: Pt, dev: Device, p: HeatmapProject): number {
  const pxPerFt = p.scale!.pxPerFt;
  const ref = dev.splRefDb ?? 85;
  const dFt = Math.max(distFt(cell, dev.pos, pxPerFt), 1);
  let spl = ref - 20 * log10(dFt / 10); // rated @ 10 ft
  spl -= crossings(cell, dev.pos, p.walls).length * 6; // ~6 dB per wall for sound
  return spl;
}

/* ── Grid compute ────────────────────────────────────────────────────────── */

/** Wave 2 optional inputs (all default → legacy behavior, no roam/confidence surfaced). */
export interface CoverageOpts {
  /** survey walk-test readings (image px) → drives the per-cell confidence field */
  measured?: MeasuredPoint[];
  /** fitted-model RMSE (dB) from calibrate.ts → model-wide confidence baseline */
  calRmseDb?: number;
  /** a cell is "roam-ready" if its 2nd-strongest AP is within this many dB below target (default 6) */
  roamMarginDb?: number;
}

export function computeCoverage(p: HeatmapProject, cellPx = 10, opts: CoverageOpts = {}): CoverageResult {
  // Detonation guard: a stray tiny cellPx on a large plan could mint millions of cells and hang.
  // Only engages beyond ~500k cells (pathological) — every real caller passes a sane cellPx, so
  // normal output is byte-identical.
  const MAX_CELLS = 500_000;
  if ((p.imgW / cellPx) * (p.imgH / cellPx) > MAX_CELLS) {
    cellPx = Math.sqrt((p.imgW * p.imgH) / MAX_CELLS);
  }
  const cols = Math.ceil(p.imgW / cellPx);
  const rows = Math.ceil(p.imgH / cellPx);
  const cells: (CoverageCell | null)[] = new Array(cols * rows).fill(null);
  const def = DEVICE_REGISTRY[p.activeType];
  const active = p.devices.filter((d) => d.typeId === p.activeType);

  let covered = 0, inside = 0, sum = 0, valued = 0;
  // covered cells whose SINR is materially degraded by co-channel interference
  let interferedCoveredCells = 0;
  // SINR accumulators (RF only)
  let sinrSum = 0, sinrCount = 0, minSinr = Infinity;

  // ── Wave 2: roaming-readiness + confidence ──
  const isWifi = p.activeType === 'wifi_ap';
  const roamFloorDbm = p.rssiTargetDbm - (opts.roamMarginDb ?? 6); // 2nd AP must reach this to roam here
  let roamReadyCovered = 0;
  const pins = (opts.measured ?? []).filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y));
  const hasSurvey = pins.length > 0;
  const confBase = clamp(1 - (opts.calRmseDb ?? 6) / 12, 0.15, 1); // fit-quality → model-wide confidence
  const confPxPerFt = p.scale?.pxPerFt ?? 1;
  let confSum = 0, confCount = 0;
  let valueUnit = '';
  let bandLabels: { label: string; color: string }[] = [];

  // Plan-boundary mask: only count cells whose CENTER falls inside the outline.
  const boundary = p.boundary;
  const hasBoundary = (boundary?.length ?? 0) >= 3;

  if (def.modelType === 'rf') {
    valueUnit = 'dBm';
    bandLabels = RSSI_ZONES.map((z) => ({ label: z.label, color: z.color }));
  } else if (def.modelType === 'camera') {
    valueUnit = 'px/m';
    bandLabels = DORI_ZONES.map((z) => ({ label: z.label, color: z.color }));
  } else if (def.modelType === 'spl') {
    valueUnit = 'dB SPL';
    bandLabels = SPL_BANDS.filter((b) => b.minDb > 0).map((b) => ({ label: b.label, color: b.color }));
  } else {
    valueUnit = '% range';
    bandLabels = (def.zones || []).map((z) => ({ label: z.label, color: z.color }));
  }

  const target = p.rssiTargetDbm;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const cell: Pt = { x: c * cellPx + cellPx / 2, y: r * cellPx + cellPx / 2 };
      // Outside the building outline → not part of the floor area (null, uncounted).
      if (hasBoundary && !pointInPolygon(cell, boundary!)) { cells[idx] = null; continue; }
      inside++;
      let out: CoverageCell | null = null;

      if (def.modelType === 'rf') {
        // Real SINR: serving signal (TRUE RSSI, undegraded) vs the SUM of ALL
        // co-channel interferers + the thermal noise floor (see cellRf).
        const rf = cellRf(cell, active, p);
        if (rf.serverId && rf.signalDbm > -200) {
          const signal = rf.signalDbm; // dBm — reported value is the true received power
          const z = bandForRssi(signal);
          // Wi-Fi coverage requires BOTH an associable RSSI AND a decodable SINR
          // (co-channel collisions can kill a strong-RSSI cell). Weak-RF devices
          // (BLE/IoT) keep their RSSI-floor gate (they don't share a channel).
          const isCov = p.activeType === 'wifi_ap'
            ? (signal >= target && rf.sinrDb >= MIN_SINR_COVER_DB)
            : (signal >= (RF_USABLE_FLOOR[p.activeType] ?? -90));
          // Roaming: a client here can also reach a 2nd AP ≥ the roam floor (seamless roaming).
          const roamReady = isWifi && Number.isFinite(rf.secondaryDbm) && rf.secondaryDbm >= roamFloorDbm;
          // Paint STRENGTH, not a dark blanket (audit #2): alpha peaks (~0.62) at/above
          // target and fades toward 0 across the ~20 dB below it, so weak-but-reachable
          // cells reveal the floor plan instead of washing it dark.
          const strengthAlpha = 0.62 * clamp01((signal - (target - 20)) / 20);
          out = {
            covered: isCov, value: signal, color: z.color, rgba: rssiRgb(signal), opacity: strengthAlpha,
            sinrDb: rf.sinrDb, snrDb: rf.snrDb, serverId: rf.serverId,
            ...(isWifi ? { secondaryDbm: Number.isFinite(rf.secondaryDbm) ? rf.secondaryDbm : undefined, roamReady } : {}),
          };
          if (isCov) { covered++; if (rf.interfered) interferedCoveredCells++; if (roamReady) roamReadyCovered++; }
          sum += signal;
          if (Number.isFinite(rf.sinrDb)) { sinrSum += rf.sinrDb; sinrCount++; if (rf.sinrDb < minSinr) minSinr = rf.sinrDb; }
          // Confidence veil: high near survey pins + tight fit, decaying with distance-from-survey.
          if (hasSurvey) {
            let minPx = Infinity;
            for (const pin of pins) { const dd = dist(cell, pin); if (dd < minPx) minPx = dd; }
            const prox = Math.exp(-(minPx / confPxPerFt) / 45); // ~45 ft decay
            out.confidence = clamp01(confBase * (0.4 + 0.6 * prox));
            confSum += out.confidence; confCount++;
          }
        }
      } else if (def.modelType === 'camera') {
        let best = 0;
        for (const d of active) best = Math.max(best, cameraPxPerM(cell, d, p));
        if (best > 0) {
          const z = DORI_ZONES.find((zz) => best >= zz.pxPerM) || DORI_ZONES[DORI_ZONES.length - 1];
          out = { covered: best >= 25, value: best, color: z.color, rgba: cameraRgb(best), opacity: Math.max(0.35, z.opacity) };
          covered++; sum += best;
        }
      } else if (def.modelType === 'spl') {
        let best = -1;
        for (const d of active) best = Math.max(best, splAt(cell, d, p));
        if (active.length) {
          const z = SPL_BANDS.find((b) => best >= b.minDb) || SPL_BANDS[SPL_BANDS.length - 1];
          const isCov = best >= 70;
          out = { covered: isCov, value: best, color: z.color, rgba: splRgb(best), opacity: 0.5 };
          if (isCov) covered++;
          sum += best;
        }
      } else {
        let bestFrac = 2;
        for (const d of active) { const f = radiusCoverage(cell, d, p); if (f >= 0) bestFrac = Math.min(bestFrac, f); }
        if (bestFrac <= 1) {
          const zones = def.zones || [];
          const rangeFt = active[0]?.rangeFt ?? (def.defaults.rangeFt as number) ?? 30;
          const distFtV = bestFrac * rangeFt;
          const z = zones.find((zz) => distFtV <= zz.outerFt) || zones[zones.length - 1];
          out = { covered: true, value: bestFrac * 100, color: z?.color || '#2CFF7A', rgba: radiusRgb(bestFrac), opacity: 0.5 };
          covered++;
        }
      }
      cells[idx] = out;
      if (out) valued++;
    }
  }

  const pctCovered = inside ? (covered / inside) * 100 : 0;
  const avgValue = valued ? sum / valued : 0;

  // ONE health formula everywhere (healthScoreFromStats) — 60% coverage, 25% in-band
  // signal quality, 15% low-interference (share of covered cells NOT co-channel-degraded).
  const healthScore = healthScoreFromStats({
    activeType: p.activeType, deviceCount: active.length, pctCovered, avgValue,
    coveredCells: covered, interferedCells: interferedCoveredCells,
  });

  const isRf = def.modelType === 'rf';
  return {
    cols, rows, cellPx, cells, bandLabels, gaps: [],
    stats: {
      activeType: p.activeType, deviceCount: active.length, insideCells: inside,
      coveredCells: covered, pctCovered, avgValue, valueUnit, healthScore,
      deadZones: 0, deadArea: 0,
      avgSinrDb: sinrCount ? sinrSum / sinrCount : undefined,
      minSinrDb: sinrCount ? minSinr : undefined,
      interferedCells: isRf ? interferedCoveredCells : undefined,
      roamReadyCells: isWifi ? roamReadyCovered : undefined,
      roamReadyPct: isWifi && covered ? (roamReadyCovered / covered) * 100 : undefined,
      avgConfidence: confCount ? confSum / confCount : undefined,
    },
  };
}

/** value + serving info at an arbitrary point (for hover-inspect). */
export function inspectAt(cell: Pt, p: HeatmapProject): { value: number; unit: string; serving?: Device } {
  const def = DEVICE_REGISTRY[p.activeType];
  const active = p.devices.filter((d) => d.typeId === p.activeType);
  let best = def.modelType === 'camera' || def.modelType === 'spl' ? -Infinity : -200;
  let serving: Device | undefined;
  for (const d of active) {
    let v = -Infinity;
    if (def.modelType === 'rf') v = rfRssi(cell, d, p);
    else if (def.modelType === 'camera') v = cameraPxPerM(cell, d, p);
    else if (def.modelType === 'spl') v = splAt(cell, d, p);
    else { const f = radiusCoverage(cell, d, p); v = f >= 0 ? 100 - f * 100 : -Infinity; }
    if (v > best) { best = v; serving = d; }
  }
  const unit = def.modelType === 'rf' ? 'dBm' : def.modelType === 'camera' ? 'px/m' : def.modelType === 'spl' ? 'dB' : '%';
  return { value: best, unit, serving };
}
