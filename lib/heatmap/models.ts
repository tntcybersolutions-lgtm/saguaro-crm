/**
 * Heatmap engine — validated physical models & device registry.
 * Constants sourced from Ekahau/Hamina-class predictive defaults, EN 62676-4 (DORI),
 * NFPA 72 (spot-detector spacing) and free-space/log-distance path loss.
 * All distances internal in FEET; dB math is unit-agnostic.
 */
import type { Band, DeviceTypeId, Env, ModelType, WallMaterialId } from './types';

export const FT_PER_M = 3.28084;

/* ── Approved professional system palette (SINGLE SOURCE OF TRUTH) ─────────
   Every device typeId maps to one of these systems (see DEVICE_REGISTRY.color)
   so map glyphs, legends, layer chips/rows and the BOM all read consistently. */
export const SYSTEM_COLORS = {
  wifi:    '#FF8A00', // Wi-Fi / access points — brand gold (single GOLD token, matches UI GOLD)
  camera:  '#E5484D', // Cameras — red
  access:  '#16C060', // Access control — green
  sensor:  '#FFE600', // Sensors (motion / smoke / PIR) — yellow
  cabling: '#C4D0E0', // Structured cabling runs — steel / white
  power:   '#FF8A00', // Electrical / power / data markers — orange
  av:      '#FF8A00', // AV / speakers / displays — violet (sensible extra)
  iot:     '#2CFF7A', // Network / IoT / smart devices — teal (sensible extra)
} as const;
export type SystemKey = keyof typeof SYSTEM_COLORS;

/* ── WiFi / RF ─────────────────────────────────────────────────────────── */
// Free-space reference path loss at 1 m (dB), indoor-calibrated per band.
export const REF_LOSS_1M: Record<Band, number> = { '2.4': 40, '5': 46.4, '6': 47.9 };
// Path-loss exponent by environment.
export const PATH_LOSS_EXP: Record<Env, number> = { open: 2.2, office: 3.0, dense: 3.5 };

export const RF_TX_DEFAULT_DBM = 15;
export const RF_GAIN_DEFAULT_DBI = 3;

/* ── Continuous RSSI color ramp — SINGLE SOURCE for heat pixels AND the legend ──
   Ekahau/UniFi convention: dBm → STRONG red (hot, right at the AP) … amber …
   green … WEAK blue at range. The engine also fades ALPHA as signal weakens
   (audit #2) so dead areas read as faint rather than a dark wash. RSSI_ZONES
   below are sampled from THIS ramp so the key always matches the map. */
type RGB = [number, number, number];
type Stop = [number, RGB];
function ramp(stops: Stop[], v: number): RGB {
  if (v <= stops[0][0]) return stops[0][1];
  if (v >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [v0, c0] = stops[i - 1], [v1, c1] = stops[i];
      const t = (v - v0) / (v1 - v0 || 1);
      return [Math.round(c0[0] + (c1[0] - c0[0]) * t), Math.round(c0[1] + (c1[1] - c0[1]) * t), Math.round(c0[2] + (c1[2] - c0[2]) * t)];
    }
  }
  return stops[stops.length - 1][1];
}
// Industry (Ekahau/UniFi) direction: strongest signal is RED (hot) at the AP,
// cooling through amber/green to BLUE at the weak edge. The engine's alpha fade —
// not a dark color — represents "weak/dead", so the plan stays legible.
const RSSI_RAMP: Stop[] = [
  [-90, [46, 128, 190]], [-82, [56, 168, 120]], [-75, [120, 191, 74]], [-70, [200, 214, 50]],
  [-66, [244, 199, 40]], [-60, [247, 160, 36]], [-54, [242, 112, 42]], [-48, [232, 74, 45]], [-44, [199, 38, 41]],
];
export const rssiRgb = (dbm: number): RGB => ramp(RSSI_RAMP, dbm);
const rgbHex = ([r, g, b]: RGB): string => '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');

// RSSI coverage zones (strong → weak). Swatch colors sampled from RSSI_RAMP (audit #5)
// so the legend/zone key reads identically to the heat pixels on the map.
export const RSSI_ZONES: { label: string; minDbm: number; color: string }[] = [
  { label: 'Excellent', minDbm: -67, color: rgbHex(rssiRgb(-55)) },
  { label: 'Good', minDbm: -70, color: rgbHex(rssiRgb(-68)) },
  { label: 'Fair', minDbm: -80, color: rgbHex(rssiRgb(-74)) },
  { label: 'Poor', minDbm: -90, color: rgbHex(rssiRgb(-86)) },
  { label: 'No signal', minDbm: -200, color: '#2a3340' },
];

/* ── Wall materials (attenuation dB per crossing, per band) ─────────────── */
export const WALL_MATERIALS: Record<WallMaterialId, { label: string; db24: number; db5: number; color: string }> = {
  drywall:     { label: 'Drywall / partition', db24: 3,  db5: 4,  color: '#E8E2D6' },
  cubicle:     { label: 'Cubicle divider',     db24: 1,  db5: 2,  color: '#cbd5e1' },
  wood_door:   { label: 'Wood door',           db24: 3,  db5: 4,  color: '#b45309' },
  glass:       { label: 'Glass / window',      db24: 3,  db5: 4,  color: '#B7C4C4' },
  low_e_glass: { label: 'Low-E glass',         db24: 10, db5: 15, color: '#7E8C8C' },
  brick:       { label: 'Brick',               db24: 8,  db5: 12, color: '#FF8A00' },
  cinderblock: { label: 'CMU / cinderblock',   db24: 6,  db5: 10, color: '#A9884F' },
  concrete:    { label: 'Concrete',            db24: 15, db5: 23, color: '#C9A96A' },
  metal:       { label: 'Metal / elevator',    db24: 25, db5: 30, color: '#9CA3AF' },
  rack:        { label: 'Metal rack',          db24: 4,  db5: 6,  color: '#FF8A00' },
};
export const wallDb = (m: WallMaterialId, band: Band): number => {
  const w = WALL_MATERIALS[m];
  if (band === '2.4') return w.db24;
  if (band === '6') return w.db5 + 2;
  return w.db5;
};

/* ── Camera DORI (EN 62676-4) ──────────────────────────────────────────── */
export const DORI_ZONES = [
  { label: 'Identify', pxPerM: 250, color: '#2CFF7A', opacity: 0.55 },
  { label: 'Recognize', pxPerM: 125, color: '#2CFF7A', opacity: 0.45 },
  { label: 'Observe', pxPerM: 62, color: '#FFE600', opacity: 0.32 },
  { label: 'Detect', pxPerM: 25, color: '#FF8A00', opacity: 0.2 },
];
export const CAMERA_DERATE = 0.75;
export const LENS_HFOV: { lensMm: number; hfovDeg: number }[] = [
  { lensMm: 2.8, hfovDeg: 88 }, { lensMm: 4, hfovDeg: 68 }, { lensMm: 6, hfovDeg: 48 },
  { lensMm: 8, hfovDeg: 37 }, { lensMm: 12, hfovDeg: 25 },
];
/** distance (ft) at which pixel density T (px/m) is met, given horiz resolution + HFOV. */
export function doriDistanceFt(hpx: number, hfovDeg: number, pxPerM: number): number {
  const half = (hfovDeg * Math.PI) / 180 / 2;
  const dM = hpx / (2 * pxPerM * Math.tan(half));
  return dM * FT_PER_M * CAMERA_DERATE;
}

/* ── SPL (paging) ──────────────────────────────────────────────────────── */
export const SPL_BANDS = [
  { label: 'Clear', minDb: 75, color: '#2E7D32' },
  { label: 'Intelligible', minDb: 70, color: '#F9A825' },
  { label: 'Marginal', minDb: 65, color: '#EF6C00' },
  { label: 'Inaudible', minDb: -1, color: '#C62828' },
];

/* ── Device registry ───────────────────────────────────────────────────── */
export interface DeviceDef {
  label: string;
  short: string;
  modelType: ModelType;
  wallBlocked: boolean;
  color: string;               // marker color
  defaults: Record<string, number | string | boolean>;
  /** radial zones (ft) for radius/fov quick render + banding: [{outerFt,color,label}] */
  zones?: { outerFt: number; color: string; label: string }[];
}

export const DEVICE_REGISTRY: Record<DeviceTypeId, DeviceDef> = {
  wifi_ap: {
    label: 'WiFi Access Point', short: 'AP', modelType: 'rf', wallBlocked: true, color: SYSTEM_COLORS.wifi,
    defaults: { band: '5', txPowerDbm: 15, antennaGainDbi: 3 },
  },
  camera: {
    label: 'CCTV Camera', short: 'CAM', modelType: 'camera', wallBlocked: true, color: SYSTEM_COLORS.camera,
    defaults: { aimDeg: 0, hfovDeg: 68, resolutionPx: 2688 },
  },
  motion_pir_ceiling: {
    label: 'Motion (PIR ceiling 360°)', short: 'PIR', modelType: 'radius', wallBlocked: true, color: SYSTEM_COLORS.sensor,
    defaults: { rangeFt: 30 },
    zones: [{ outerFt: 25.5, color: '#2E7D32', label: 'Detect' }, { outerFt: 30, color: '#F9A825', label: 'Edge' }],
  },
  motion_pir_wall: {
    label: 'Motion (PIR wall fan)', short: 'PIR', modelType: 'fov', wallBlocked: true, color: SYSTEM_COLORS.sensor,
    defaults: { rangeFt: 40, aimDeg: 0, coverageAngleDeg: 90 },
    zones: [{ outerFt: 32, color: '#2E7D32', label: 'Detect' }, { outerFt: 40, color: '#F9A825', label: 'Edge' }],
  },
  smoke_detector_spot: {
    label: 'Smoke Detector (NFPA 72)', short: 'SD', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.sensor,
    defaults: { rangeFt: 21 },
    zones: [{ outerFt: 21, color: '#2E7D32', label: 'Protected' }, { outerFt: 30, color: '#F9A825', label: 'Overlap' }],
  },
  heat_detector_spot: {
    label: 'Heat Detector (NFPA 72)', short: 'HD', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.sensor,
    defaults: { rangeFt: 17.5 },
    zones: [{ outerFt: 17.5, color: '#2E7D32', label: 'Protected' }, { outerFt: 25, color: '#F9A825', label: 'Overlap' }],
  },
  access_reader: {
    label: 'Access Reader / Door', short: 'AC', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.access,
    defaults: { rangeFt: 4 },
    zones: [{ outerFt: 4, color: '#6A1B9A', label: 'Controlled' }],
  },
  paging_speaker: {
    label: 'Paging Speaker', short: 'SPK', modelType: 'spl', wallBlocked: true, color: SYSTEM_COLORS.av,
    defaults: { rangeFt: 50, splRefDb: 85 },
    zones: [{ outerFt: 32, color: '#2E7D32', label: 'Clear' }, { outerFt: 50, color: '#F9A825', label: 'Intelligible' }, { outerFt: 71, color: '#EF6C00', label: 'Marginal' }],
  },
  ble_beacon: {
    label: 'BLE Beacon', short: 'BLE', modelType: 'rf', wallBlocked: true, color: SYSTEM_COLORS.iot,
    defaults: { band: '2.4', txPowerDbm: 4, antennaGainDbi: 0 },
  },
  iot_gateway: {
    label: 'IoT Gateway / Hub', short: 'IOT', modelType: 'rf', wallBlocked: true, color: SYSTEM_COLORS.iot,
    defaults: { band: '2.4', txPowerDbm: 8, antennaGainDbi: 2 },
  },
  smart_switch: {
    label: 'Smart Light Switch', short: 'SW', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.iot,
    defaults: { rangeFt: 6 }, zones: [{ outerFt: 6, color: '#FFE600', label: 'Control' }],
  },
  smart_plug: {
    label: 'Smart Plug / Outlet', short: 'PLG', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.iot,
    defaults: { rangeFt: 5 }, zones: [{ outerFt: 5, color: '#FF8A00', label: 'Control' }],
  },
  thermostat: {
    label: 'Smart Thermostat', short: 'TSTAT', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.iot,
    defaults: { rangeFt: 6 }, zones: [{ outerFt: 6, color: '#2CFF7A', label: 'Zone' }],
  },
  door_lock: {
    label: 'Smart Lock', short: 'LOCK', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.access,
    defaults: { rangeFt: 4 }, zones: [{ outerFt: 4, color: '#FF8A00', label: 'Door' }],
  },
  ev_charger: {
    label: 'EV Charger', short: 'EV', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.av,
    defaults: { rangeFt: 8 }, zones: [{ outerFt: 8, color: '#2CFF7A', label: 'Station' }],
  },
  projector: {
    label: 'Projector', short: 'PROJ', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.av,
    defaults: { rangeFt: 8 }, zones: [{ outerFt: 8, color: '#FF8A00', label: 'AV' }],
  },
  display: {
    label: 'Display / TV', short: 'DISP', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.av,
    defaults: { rangeFt: 6 }, zones: [{ outerFt: 6, color: '#FFE600', label: 'AV' }],
  },
  // ── termination / rough-in markers (annotation only — tiny footprint, never a coverage layer) ──
  electrical_outlet: {
    label: 'Electrical Outlet', short: 'PWR', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.power,
    defaults: { rangeFt: 1.5, gang: 2 }, zones: [{ outerFt: 1.5, color: '#FF8A00', label: 'Outlet' }],
  },
  data_jack: {
    label: 'Data Jack (RJ45)', short: 'DATA', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.power,
    defaults: { rangeFt: 1.5, ports: 1 }, zones: [{ outerFt: 1.5, color: '#FF8A00', label: 'Data' }],
  },
  voice_jack: {
    label: 'Voice Jack (RJ11)', short: 'VOICE', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.power,
    defaults: { rangeFt: 1.5, ports: 1 }, zones: [{ outerFt: 1.5, color: '#2CFF7A', label: 'Voice' }],
  },
  combo_plate: {
    label: 'Combo Plate (Power + Data)', short: 'COMBO', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.power,
    defaults: { rangeFt: 1.5 }, zones: [{ outerFt: 1.5, color: '#64748B', label: 'Plate' }],
  },
  cable_term: {
    label: 'Cable Termination', short: 'TERM', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.cabling,
    defaults: { rangeFt: 1, gender: 'F' }, zones: [{ outerFt: 1, color: '#FF8A00', label: 'Term' }],
  },
  idf: {
    label: 'IDF / Network Rack', short: 'IDF', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.cabling,
    defaults: { rangeFt: 1 }, zones: [{ outerFt: 1, color: '#FF8A00', label: 'IDF' }],
  },
};

// RF measured-power at 1m for weak-RF devices (beacon/gateway use their own reference).
export const RF_MEASURED_1M: Partial<Record<DeviceTypeId, number>> = { ble_beacon: -59, iot_gateway: -50 };
export const RF_USABLE_FLOOR: Partial<Record<DeviceTypeId, number>> = { ble_beacon: -85, iot_gateway: -90 };

// WiFi channel palettes for planning.
export const CHANNELS_24 = [1, 6, 11];
export const CHANNELS_5 = [36, 40, 44, 48, 149, 153, 157, 161];

export const deviceDef = (id: DeviceTypeId): DeviceDef => DEVICE_REGISTRY[id];

/* ── Continuous color ramps (smooth Ekahau-style heatmaps) ─────────────── */
// RGB/Stop, ramp(), the RSSI ramp and rssiRgb now live ABOVE RSSI_ZONES so the
// zone swatches are sampled from the SAME ramp as the heat pixels (audit #5).
// Camera px/m → detect(orange) … identify(green) — brighter/cleaner
const CAM_RAMP: Stop[] = [[25, [248, 120, 28]], [62, [248, 196, 40]], [125, [150, 214, 62]], [250, [40, 200, 100]]];
export const cameraRgb = (pxm: number): RGB => ramp(CAM_RAMP, pxm);
// SPL dB → red … green — brighter
const SPL_RAMP: Stop[] = [[60, [224, 44, 44]], [65, [245, 116, 32]], [70, [248, 198, 42]], [75, [46, 190, 92]], [90, [22, 176, 82]]];
export const splRgb = (db: number): RGB => ramp(SPL_RAMP, db);
// radius fraction-of-range (0 near → 1 edge): vivid green → clean amber
const RAD_RAMP: Stop[] = [[0, [46, 190, 92]], [0.85, [120, 208, 70]], [1, [248, 198, 42]]];
export const radiusRgb = (frac: number): RGB => ramp(RAD_RAMP, frac);
