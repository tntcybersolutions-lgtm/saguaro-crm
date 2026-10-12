'use client';
/**
 * Saguaro Control Systems — Signal Studio DESIGNER (coverage heatmap & cabling designer).
 * Upload a blueprint, calibrate scale, trace walls, place UniFi/other devices,
 * and get a wall-aware coverage heatmap (WiFi RSSI, camera DORI, motion/smoke/speaker),
 * with smart auto-placement, channel planning, gap detection, metrics and export.
 *
 * Extracted WHOLESALE from the legacy /field/heatmap page into a shell-agnostic
 * client component: it lives in the /app shell at /app/signal-studio, receives the
 * active project as a PROP (no localStorage project guessing — designs bind to the
 * project the shell says is open), and sizes itself against whatever chrome sits
 * above it, so it works under the /app topbar without field-shell CSS coupling.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { textPrompt } from '@/lib/ui/async-dialog';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { ArrowClockwise, ArrowCounterClockwise, ArrowsClockwise, ArrowUpRight, Check, CheckCircle, Cursor, DownloadSimple, Lightning, LineSegments, Minus, Plus, Ruler, Sparkle, Trash, UploadSimple } from '@phosphor-icons/react';
import type { Pt } from '@/lib/heatmap/geometry';
import { angleDeg, dist } from '@/lib/heatmap/geometry';
import { summarizeCables, recommendCabling, runLengthFt } from '@/lib/heatmap/cabling-spec';
import type { Band, CoverageResult, Device, DeviceTypeId, Env, HeatmapProject, Wall, WallMaterialId, Ssid, SsidBand, SsidSecurity } from '@/lib/heatmap/types';
import { DEVICE_REGISTRY, WALL_MATERIALS, deviceDef, doriDistanceFt, SYSTEM_COLORS, RSSI_ZONES, type DeviceDef } from '@/lib/heatmap/models';
import { isoLines, interferenceMask } from '@/lib/heatmap/overlays';
import { TEMPLATES, type TemplateSpec } from '@/lib/heatmap/templates';
import { computeCoverage, apRssiAt, apUsableRadiusFt, inspectAt } from '@/lib/heatmap/engine';
import { areaPerApFt2, autoPlaceAPs, deriveFootprint, disciplineAiDevices, gapsWorthFixing, minApSeparationFt, planChannels, recompute } from '@/lib/heatmap/smart';
import * as smartEngine from '@/lib/heatmap/smart';
import { summarizeBuilding } from '@/lib/heatmap/multifloor';
import { UNIFI_APS, UNIFI_CAMERAS } from '@/lib/heatmap/unifi';
import { computeBom } from '@/lib/heatmap/bom';
import { planSchedule, VLANS, vlanFor, DEFAULT_SSIDS } from '@/lib/heatmap/network';
import { VENDORS, apModelsByVendor, findApModel, toDeviceRadio } from '@/lib/heatmap/vendors';
import { computeInterFloorContribution } from '@/lib/heatmap/interfloor';
import { analyzeInterference, type ScannedNeighbor } from '@/lib/heatmap/interference';
import { humanError } from '@/lib/errors';
import { calibrateModel, applyCalibration, type MeasuredPoint, type CalibrationResult } from '@/lib/heatmap/calibrate';
import { calibrationNote, engineStamp, parseSurveyCsv } from '@/lib/heatmap/meta';
import { rssiRgb } from '@/lib/heatmap/models';
import { paletteHex } from '@/lib/design-tokens';
import dynamic from 'next/dynamic';

import { printHtml } from '@/lib/print-doc';
import { useToast } from '@/components/Toast';
// CLIENT-ONLY 3D building view (three.js touches window/WebGL → never SSR).
const Building3D = dynamic(() => import('@/components/heatmap/Building3D'), { ssr: false });

const GOLD = 'var(--brand-primary)', GOLD_CANVAS = '#FBBF24', DARK = 'var(--bg-base)', RAISED = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.1)';
const TEXT = '#fff', DIM = 'var(--text-secondary)', MUTED = 'var(--text-secondary)';

type Tool = 'select' | 'scale' | 'wall' | 'place';
/* ── FIELD MODE — the guided jobsite flow, IDENTICAL to the mobile app.
   One current step, one obvious next action, zero panel spelunking. ── */
type FieldStep = 'plan' | 'scale' | 'walls' | 'devices' | 'heatmap' | 'bid';
const FIELD_STEPS: { key: FieldStep; label: string }[] = [
  { key: 'plan', label: 'Plan' }, { key: 'scale', label: 'Scale' }, { key: 'walls', label: 'Walls' },
  { key: 'devices', label: 'Devices' }, { key: 'heatmap', label: 'Heatmap' }, { key: 'bid', label: 'Bid' },
];
const uid = () => Math.random().toString(36).slice(2, 9);

/* ── ENGINE SYNC SHIM — auto-design REPLACE semantics ────────────────────────
   The canonical engine (D:/Saguaro-Field lib/heatmap, byte-mirrored here by
   scripts/sync-heatmap-engine.mjs) is gaining three auto-design exports:
     Device.autoPlaced?: boolean            — tag on engine-placed APs
     replaceAutoPlacedAps(devices, next)    — swap out prior auto APs, keep manual
     placeInGap(project, gap)               — best AP point inside a dead zone
   Ambient contract (what the synced engine will export):
     declare module '@/lib/heatmap/smart' {
       export function replaceAutoPlacedAps(devices: Device[], next: Device[]): { devices: Device[]; replaced: number };
       export function placeInGap(project: HeatmapProject, gap: { centroid: Pt }): Pt;
     }
   Until the sync lands in this repo, the probes below prefer the engine export
   when present and otherwise fall back to local implementations with IDENTICAL
   semantics — so auto-design REPLACES its own previous APs (never stacks a
   second blanket of hardware on top) before and after the engine sync. ── */
type AutoPlacedDevice = Device & { autoPlaced?: boolean };
const smartExtra = smartEngine as unknown as Partial<{
  replaceAutoPlacedAps: (devices: Device[], next: Device[]) => { devices: Device[]; replaced: number };
  placeInGap: (project: HeatmapProject, gap: { centroid: Pt }) => Pt;
}>;
const tagAutoPlaced = (d: Device): Device => ({ ...d, autoPlaced: true } as AutoPlacedDevice);
const isAutoPlacedAp = (d: Device) => d.typeId === 'wifi_ap' && (d as AutoPlacedDevice).autoPlaced === true;
/** Keep every manual device (and every non-AP), drop prior AUTO-placed APs, append the new ones (tagged). */
const replaceAutoPlacedAps = (devices: Device[], next: Device[]): { devices: Device[]; replaced: number } => {
  if (typeof smartExtra.replaceAutoPlacedAps === 'function') {
    try {
      const r = smartExtra.replaceAutoPlacedAps(devices, next);
      if (r && Array.isArray(r.devices)) return { devices: r.devices, replaced: Number(r.replaced) || 0 };
    } catch { /* fall through to the local implementation */ }
  }
  const kept = devices.filter((d) => !isAutoPlacedAp(d));
  return { devices: [...kept, ...next.map(tagAutoPlaced)], replaced: devices.length - kept.length };
};
/** Best point to drop an AP inside a dead zone (engine version; centroid fallback). */
const placeInGap = (project: HeatmapProject, gap: { centroid: Pt }): Pt => {
  if (typeof smartExtra.placeInGap === 'function') {
    try {
      const p = smartExtra.placeInGap(project, gap);
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
    } catch { /* fall through to centroid */ }
  }
  return gap.centroid;
};

/* ── ADVISOR + IDF ENGINE SHIM — sibling engine contract ─────────────────────
   The canonical engine (synced by scripts/sync-heatmap-engine.mjs before every
   web build) is gaining an 'idf' device type plus three advisor exports:
     designDensityFlag(project)        → { flagged, apCount, capAps, areaFt2 } legacy over-density guard
     computeCableRuns(project, idfId)  → per-device cable runs to the placed IDF (run ft, cable, over-limit)
     adviseDesign(project)             → density verdict + per-AP reasoning + camera/sensor checks
   Probed tolerantly (same pattern as the auto-design shim above); until the sync
   lands, local fallbacks compute IDENTICAL semantics from the engine primitives
   already imported (deriveFootprint / minApSeparationFt / areaPerApFt2 /
   runLengthFt / recommendCabling) — every number SHOWN is engine math either way. ── */
const IDF_TYPE = 'idf' as unknown as DeviceTypeId; // engine adds 'idf' to DeviceTypeId; double-cast keeps tsc green pre-sync
const isIdfDevice = (d: Device) => (d.typeId as string) === 'idf';
/** Registry-tolerant device def: pre-sync an 'idf' device renders with this fallback; post-sync the engine def wins. */
const IDF_FALLBACK_DEF: DeviceDef = { label: 'IDF / network rack', short: 'IDF', modelType: 'radius', wallBlocked: false, color: SYSTEM_COLORS.cabling, defaults: { rangeFt: 0 } };
const defOf = (t: DeviceTypeId): DeviceDef => DEVICE_REGISTRY[t] ?? IDF_FALLBACK_DEF;
const AP_CAP_FT2 = 1500; // absolute engineering ceiling — the same 1 AP / 1,500 ft² constant autoPlaceAPs hard-caps to
type DensityFlagInfo = { flagged: boolean; apCount: number; capAps: number; areaFt2: number; perApFt2: number | null };
type ApAdviceRow = { id: string; label: string; band: string; txDbm: number; nnFt: number | null; areaFt2: number | null; status: 'ok' | 'crowded' };
type AdviceCheck = { label: string; detail: string; status: 'ok' | 'warn' };
type DesignAdvice = { density: DensityFlagInfo; minSepFt: number; apRows: ApAdviceRow[]; checks: AdviceCheck[] };
type CableRunRow = { id: string; label: string; pos: Pt | null; lengthFt: number; cable: string; overLimit: boolean };
type CableRunsInfo = { idfPos: Pt; runs: CableRunRow[]; totalFt: number; orderFt: number; overCount: number };
const advisorEngine = smartEngine as unknown as Partial<{
  designDensityFlag: (p: HeatmapProject) => unknown;
  computeCableRuns: (p: HeatmapProject, idfId: string) => unknown;
  adviseDesign: (p: HeatmapProject) => unknown;
}>;
const getDensityFlag = (p: HeatmapProject): DensityFlagInfo => {
  if (typeof advisorEngine.designDensityFlag === 'function') {
    try {
      const r = advisorEngine.designDensityFlag(p) as Partial<DensityFlagInfo> | null;
      if (r && typeof r.flagged === 'boolean' && Number.isFinite(Number(r.apCount)) && Number.isFinite(Number(r.capAps)))
        return { flagged: r.flagged, apCount: Number(r.apCount), capAps: Number(r.capAps), areaFt2: Math.round(Number(r.areaFt2) || 0), perApFt2: Number.isFinite(Number(r.perApFt2)) ? Math.round(Number(r.perApFt2)) : null };
    } catch { /* fall through to the local math */ }
  }
  const apCount = p.devices.filter((d) => d.typeId === 'wifi_ap').length;
  const areaFt2 = deriveFootprint(p).areaFt2;
  const capAps = areaFt2 > 0 ? Math.max(1, Math.ceil(areaFt2 / AP_CAP_FT2)) : 0;
  return { flagged: areaFt2 > 0 && apCount > capAps, apCount, capAps, areaFt2: Math.round(areaFt2), perApFt2: apCount > 0 && areaFt2 > 0 ? Math.round(areaFt2 / apCount) : null };
};
const getCableRuns = (p: HeatmapProject, idfId: string): CableRunsInfo | null => {
  const idf = p.devices.find((d) => d.id === idfId);
  if (!idf || !p.scale) return null;
  const posOf = (id: string): Pt | null => p.devices.find((d) => d.id === id)?.pos ?? null;
  if (typeof advisorEngine.computeCableRuns === 'function') {
    try {
      const r = advisorEngine.computeCableRuns(p, idfId) as { runs?: unknown[]; totalFt?: number; orderFt?: number } | null;
      if (r && Array.isArray(r.runs)) {
        const runs: CableRunRow[] = r.runs.flatMap((raw) => {
          const row = raw as Partial<CableRunRow> & { deviceId?: string };
          const id = row.id || row.deviceId; const len = Number(row.lengthFt);
          if (!id || !Number.isFinite(len)) return [];
          return [{ id, label: String(row.label || ''), pos: posOf(id), lengthFt: Math.round(len), cable: String(row.cable || '—'), overLimit: row.overLimit === true || len > 328 }];
        });
        if (runs.length) {
          const totalFt = Number.isFinite(Number(r.totalFt)) ? Math.round(Number(r.totalFt)) : runs.reduce((s, x) => s + x.lengthFt, 0);
          const orderFt = Number.isFinite(Number(r.orderFt)) ? Math.round(Number(r.orderFt)) : Math.ceil(totalFt / 1000) * 1000;
          return { idfPos: idf.pos, runs, totalFt, orderFt, overCount: runs.filter((x) => x.overLimit).length };
        }
      }
    } catch { /* fall through to the local math */ }
  }
  const pxPerFt = p.scale.pxPerFt;
  const runs: CableRunRow[] = p.devices.filter((d) => d.id !== idfId && !isIdfDevice(d)).map((d) => {
    const lengthFt = runLengthFt(d.pos, idf.pos, pxPerFt);
    const rec = recommendCabling(d.typeId, { distanceFt: lengthFt });
    return { id: d.id, label: d.label || defOf(d.typeId).short, pos: d.pos, lengthFt, cable: rec.dataCable?.name || rec.powerCable?.name || '—', overLimit: lengthFt > 328 };
  });
  if (!runs.length) return null;
  const totalFt = runs.reduce((s, x) => s + x.lengthFt, 0);
  return { idfPos: idf.pos, runs, totalFt, orderFt: Math.ceil(totalFt / 1000) * 1000, overCount: runs.filter((x) => x.overLimit).length };
};
const getAdvice = (p: HeatmapProject, cov: CoverageResult | null): DesignAdvice => {
  const density = getDensityFlag(p);
  const localMinSep = Math.round(minApSeparationFt(areaPerApFt2(p.env)));
  if (typeof advisorEngine.adviseDesign === 'function') {
    try {
      const r = advisorEngine.adviseDesign(p) as Partial<DesignAdvice> | null;
      if (r && Array.isArray(r.apRows) && Array.isArray(r.checks))
        return {
          density,
          minSepFt: Number.isFinite(Number(r.minSepFt)) ? Number(r.minSepFt) : localMinSep,
          apRows: r.apRows.flatMap((raw) => { const a = raw as Partial<ApAdviceRow>; return a && a.id ? [{ id: a.id, label: String(a.label || 'AP'), band: String(a.band || '5'), txDbm: Number(a.txDbm) || 0, nnFt: Number.isFinite(Number(a.nnFt)) ? Number(a.nnFt) : null, areaFt2: Number.isFinite(Number(a.areaFt2)) ? Number(a.areaFt2) : null, status: a.status === 'crowded' ? 'crowded' as const : 'ok' as const }] : []; }),
          checks: r.checks.flatMap((raw) => { const c = raw as Partial<AdviceCheck>; return c && c.label ? [{ label: String(c.label), detail: String(c.detail || ''), status: c.status === 'warn' ? 'warn' as const : 'ok' as const }] : []; }),
        };
    } catch { /* fall through to the local math */ }
  }
  const pxPerFt = p.scale?.pxPerFt || 0;
  const aps = p.devices.filter((d) => d.typeId === 'wifi_ap');
  const servedFt2 = (apId: string): number | null => {
    if (!cov || cov.stats.activeType !== 'wifi_ap' || pxPerFt <= 0) return null;
    let n = 0;
    for (const c of cov.cells) if (c && c.covered && c.serverId === apId) n++;
    const cellFt = cov.cellPx / pxPerFt;
    return Math.round(n * cellFt * cellFt);
  };
  const apRows: ApAdviceRow[] = aps.map((ap, i) => {
    let nn = Infinity;
    for (const o of aps) if (o !== ap) nn = Math.min(nn, dist(ap.pos, o.pos) / (pxPerFt || 1));
    const nnFt = pxPerFt > 0 && nn !== Infinity ? nn : null;
    return { id: ap.id, label: ap.label || `AP ${i + 1}`, band: (ap.band || '5') as string, txDbm: ap.txPowerDbm ?? 15, nnFt, areaFt2: servedFt2(ap.id), status: nnFt != null && nnFt < localMinSep ? 'crowded' : 'ok' };
  });
  const checks: AdviceCheck[] = [];
  const cams = p.devices.filter((d) => d.typeId === 'camera');
  if (cams.length) {
    const detect = cams.map((c) => Math.round(doriDistanceFt(c.resolutionPx ?? 2688, c.hfovDeg ?? 68, 25)));
    checks.push({ label: 'Cameras', detail: `${cams.length} placed · detect range ${Math.min(...detect)}–${Math.max(...detect)} ft (EN 62676-4 DORI)`, status: 'ok' });
  } else checks.push({ label: 'Cameras', detail: 'None placed', status: 'ok' });
  const smokes = p.devices.filter((d) => d.typeId === 'smoke_detector_spot' || d.typeId === 'heat_detector_spot').length;
  if (smokes > 0 && density.areaFt2 > 0) {
    const guideline = Math.ceil(density.areaFt2 / 900); // NFPA 72 spot spacing 30 ft ≈ 900 ft² each — a LAYOUT guideline; the AHJ + NFPA 72 govern
    checks.push(smokes < guideline
      ? { label: 'Smoke / Heat', detail: `${smokes} placed — 30 ft NFPA 72 spacing suggests ~${guideline} for ${density.areaFt2.toLocaleString()} ft² (AHJ governs)`, status: 'warn' }
      : { label: 'Smoke / Heat', detail: `${smokes} placed for ${density.areaFt2.toLocaleString()} ft² — meets the 30 ft spacing guideline (~${guideline})`, status: 'ok' });
  } else checks.push({ label: 'Smoke / Heat', detail: smokes ? `${smokes} placed — set the scale to check spacing` : 'None placed (fire-alarm scope)', status: 'ok' });
  const motionCeil = p.devices.filter((d) => d.typeId === 'motion_pir_ceiling').length;
  const motionWall = p.devices.filter((d) => d.typeId === 'motion_pir_wall').length;
  checks.push({ label: 'Motion', detail: motionCeil + motionWall ? `${motionCeil + motionWall} placed · ${motionCeil} ceiling / ${motionWall} wall` : 'None placed', status: 'ok' });
  return { density, minSepFt: localMinSep, apRows, checks };
};

const PLACEABLE: DeviceTypeId[] = ['wifi_ap', 'camera', 'motion_pir_ceiling', 'motion_pir_wall', 'smoke_detector_spot', 'heat_detector_spot', 'paging_speaker', 'access_reader', 'ble_beacon', 'iot_gateway', 'smart_switch', 'smart_plug', 'thermostat', 'door_lock', 'ev_charger', 'projector', 'display', 'electrical_outlet', 'data_jack', 'voice_jack', 'combo_plate', 'cable_term'];
// annotation-only markers (electrical / data / voice / termination rough-in) — placeable but never a coverage layer
const MARKER_TYPES: DeviceTypeId[] = ['electrical_outlet', 'data_jack', 'voice_jack', 'combo_plate', 'cable_term'];
const COVERAGE_LAYERS: DeviceTypeId[] = PLACEABLE.filter((t) => !MARKER_TYPES.includes(t));
const GANG_LABEL: Record<number, string> = { 2: 'Duplex', 4: 'Quad', 6: '6-gang' };

// ── network-capacity model (simple, honest single-radio estimates) ──
// Usable per-client PHY ceiling by band (Mbps) — real-world, not marketing max.
const BAND_PEAK_MBPS: Record<Band, number> = { '2.4': 150, '5': 700, '6': 1400 };
// Fraction of the band ceiling a client gets at a given RSSI (≈ -45 dBm→100%, ≈ -85 dBm→12%).
const rssiThroughputEff = (dbm: number) => Math.max(0.12, Math.min(1, (dbm + 85) / 40));
const round5 = (n: number) => Math.round(n / 5) * 5;

// ── display layers: group device typeIds into per-SYSTEM toggleable categories (show/hide) ──
//    Keys/colors align to the approved SYSTEM_COLORS single source of truth.
const DEVICE_LAYER: Partial<Record<DeviceTypeId, string>> = {
  wifi_ap: 'wifi', camera: 'camera',
  motion_pir_ceiling: 'sensor', motion_pir_wall: 'sensor', smoke_detector_spot: 'sensor', heat_detector_spot: 'sensor',
  access_reader: 'access', door_lock: 'access',
  iot_gateway: 'network', ble_beacon: 'network', smart_switch: 'network', smart_plug: 'network', thermostat: 'network',
  paging_speaker: 'av', projector: 'av', display: 'av', ev_charger: 'av',
  electrical_outlet: 'power', data_jack: 'data', voice_jack: 'voice', combo_plate: 'combo', cable_term: 'cabling',
};
const deviceLayerKey = (t: DeviceTypeId) => DEVICE_LAYER[t] || 'other';
const LAYER_META: { key: string; name: string; color: string }[] = [
  { key: 'wifi', name: 'Wi-Fi / Access Points', color: SYSTEM_COLORS.wifi },
  { key: 'camera', name: 'Cameras', color: SYSTEM_COLORS.camera },
  { key: 'access', name: 'Access Control', color: SYSTEM_COLORS.access },
  { key: 'sensor', name: 'Sensors (Motion / Smoke)', color: SYSTEM_COLORS.sensor },
  { key: 'network', name: 'Network / IoT', color: SYSTEM_COLORS.iot },
  { key: 'av', name: 'AV / Speakers', color: SYSTEM_COLORS.av },
  { key: 'power', name: 'Electrical Outlets', color: SYSTEM_COLORS.power },
  { key: 'data', name: 'Data Jacks (RJ45)', color: SYSTEM_COLORS.power },
  { key: 'voice', name: 'Voice Jacks (RJ11)', color: SYSTEM_COLORS.power },
  { key: 'combo', name: 'Combo Plates', color: SYSTEM_COLORS.power },
  { key: 'cabling', name: 'Cable Terminations', color: SYSTEM_COLORS.cabling },
  { key: 'other', name: 'Other Devices', color: paletteHex.gray }, // drawn on the canvas — a hex, never a CSS variable
];
// ── compact layer-chip row (the 6 approved systems) shown under the header ──
type PanelTab = 'design' | 'layers' | 'bom' | 'survey';
const SYSTEM_CHIPS: { key: string; name: string; color: string; cabling?: boolean }[] = [
  { key: 'wifi', name: 'Wi-Fi', color: SYSTEM_COLORS.wifi },
  { key: 'camera', name: 'Cameras', color: SYSTEM_COLORS.camera },
  { key: 'access', name: 'Access', color: SYSTEM_COLORS.access },
  { key: 'sensor', name: 'Sensors', color: SYSTEM_COLORS.sensor },
  { key: 'cabling', name: 'Cabling', color: SYSTEM_COLORS.cabling, cabling: true },
  { key: 'power', name: 'Power', color: SYSTEM_COLORS.power },
];
// hex → rgba() with alpha (for translucent DORI cones / fills)
const hexA = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// ── hero badge art: the bespoke drawings glyph the legacy field header used
//    (scopedFieldIcon('drawings')), inlined so the designer carries no /field imports ──
const HERO_ICON_SVG = `<svg width="30" height="30" viewBox="0 0 32 32" fill="none"><defs><linearGradient id="ss_hero_sheet" x1="6" y1="6" x2="26" y2="27" gradientUnits="userSpaceOnUse"><stop stop-color="#EDF1F6"/><stop offset="1" stop-color="#C6CFDC"/></linearGradient><linearGradient id="ss_hero_roll" x1="5" y1="5" x2="9" y2="28" gradientUnits="userSpaceOnUse"><stop stop-color="#4A5A72"/><stop offset="1" stop-color="#2A2A2E"/></linearGradient><linearGradient id="ss_hero_gold" x1="20" y1="5" x2="20" y2="28" gradientUnits="userSpaceOnUse"><stop stop-color="#FFE000"/><stop offset="1" stop-color="#FBBF24"/></linearGradient></defs><path d="M9 6.4c0-.9.7-1.6 1.6-1.6h14.8c.9 0 1.6.7 1.6 1.6v19.2c0 .9-.7 1.6-1.6 1.6H10.6c-.9 0-1.6-.7-1.6-1.6V6.4Z" fill="url(#ss_hero_sheet)"/><path d="M13 11h11M13 15h11M13 19h7" stroke="#FFE000" stroke-width="1.4" stroke-linecap="round"/><rect x="18" y="4.8" width="9" height="3.1" rx="1.1" fill="url(#ss_hero_gold)"/><path d="M4.6 6.6C4.6 5.4 5.6 4.4 6.8 4.4S9 5.4 9 6.6v18.8c0 1.2-1 2.2-2.2 2.2s-2.2-1-2.2-2.2V6.6Z" fill="url(#ss_hero_roll)"/><ellipse cx="6.8" cy="6.6" rx="2.2" ry="1.4" fill="#1A1A1D"/></svg>`;

function makeDevice(typeId: DeviceTypeId, pos: Pt, model?: string): Device {
  const def = defOf(typeId); // registry-tolerant: 'idf' works pre-sync too
  const d: Device = { id: uid(), typeId, pos, label: def.short, ...(def.defaults as object) };
  if (typeId === 'wifi_ap' && model) {
    const ap = UNIFI_APS.find((a) => a.model === model);
    if (ap) { const band = (ap.bands.includes('5') ? '5' : ap.bands[0]) as Device['band']; d.band = band; d.txPowerDbm = ap.txDbm[band as string] ?? 15; d.antennaGainDbi = ap.gainDbi; d.label = ap.model.replace('UniFi ', ''); }
  }
  if (typeId === 'camera' && model) {
    const c = UNIFI_CAMERAS.find((x) => x.model === model);
    if (c) { d.resolutionPx = c.hpx; d.hfovDeg = c.hfov; d.label = c.model.replace('UniFi ', ''); }
  }
  return d;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function chip(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, bg: string, border?: string) {
  ctx.font = 'bold 12px system-ui'; const tw = ctx.measureText(text).width; const w = tw + 14, h = 20;
  ctx.fillStyle = bg; rr(ctx, cx - w / 2, cy - h / 2, w, h, 6); ctx.fill();
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1.5; ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, cy);
}

/* ── Cinematic coverage hero (best-server per-AP territory field) for the client report ──
   Mirrors the design harness: each AP paints its own hue, brightness = signal strength,
   grey for dead cells, a white emission glow per AP masked to its footprint, walls drawn on
   top, and dashed-red dead-zone callouts labeled "Place 1 AP here". Deterministic + DOM-canvas. */
const HM_HUES: number[][] = [[56, 140, 255], [168, 85, 247], [20, 200, 170], [244, 114, 22], [236, 72, 153], [132, 204, 22]];
const HM_SLATE: number[] = [70, 76, 86];
function hmClamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function hmInPoly(x: number, y: number, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
/** Draw the cinematic coverage field onto ctx (the plan should already be drawn as a backdrop).
    Returns the coverage result, or null when the floor can't be rendered (no scale or no APs). */
function drawCinematicField(ctx: CanvasRenderingContext2D, p: HeatmapProject): CoverageResult | null {
  if (!p.scale) return null;
  const devs = p.devices.filter((d) => d.typeId === 'wifi_ap');
  if (!devs.length) return null;
  const W = p.imgW, H = p.imgH, PXFT = p.scale.pxPerFt;
  const boundary: Pt[] = (p.boundary && p.boundary.length >= 3) ? p.boundary : [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  const cov = recompute({ ...p, activeType: 'wifi_ap' }, 10);
  const mk = (): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };

  const step = 6, cols = Math.ceil(W / step), rows = Math.ceil(H / step);
  const aps = devs.map((ap) => ({ ap, band: (ap.band || '5') as Band, txg: (ap.txPowerDbm ?? 15) + (ap.antennaGainDbi ?? 3) }));
  const grids = aps.map(() => new Float32Array(cols * rows).fill(-999));
  const bestDbm = new Float32Array(cols * rows).fill(-999);
  const bestAp = new Int16Array(cols * rows).fill(-1);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * step, y = r * step, idx = r * cols + c;
    if (!hmInPoly(x, y, boundary)) continue;
    for (let k = 0; k < aps.length; k++) {
      const v = apRssiAt({ x, y }, aps[k].ap.pos, p, aps[k].band, aps[k].txg);
      grids[k][idx] = v;
      if (v > bestDbm[idx]) { bestDbm[idx] = v; bestAp[idx] = k; }
    }
  }
  // FIELD: each AP paints its own zone; brightness = strength; grey = dead
  const fr = mk(); const frc = fr.getContext('2d')!;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const idx = r * cols + c; const k = bestAp[idx]; if (k < 0) continue; const d = bestDbm[idx];
    let col: number[];
    if (d < -82) col = HM_SLATE;
    else {
      const t = hmClamp((d + 82) / 32, 0, 1); const base = HM_HUES[k % HM_HUES.length];
      col = t < 0.72 ? base.map((v) => Math.round(v * (0.42 + 0.80 * t))) : base.map((v) => Math.round(v + ((t - 0.72) / 0.28) * (255 - v) * 0.72));
    }
    frc.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; frc.fillRect(c * step - 1, r * step - 1, step + 2, step + 2);
  }
  ctx.save(); ctx.filter = 'blur(7px)'; ctx.globalAlpha = 0.58; ctx.drawImage(fr, 0, 0); ctx.restore();
  // EMISSION GLOW per AP, masked to its own footprint
  aps.forEach((a, k) => {
    const base = HM_HUES[k % HM_HUES.length];
    const rMax = Math.max(apUsableRadiusFt(p, a.band, a.txg, -70) * PXFT, 1);
    const mask = mk(); const mc = mask.getContext('2d')!; mc.fillStyle = '#fff';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const idx = r * cols + c; if (bestAp[idx] === k && bestDbm[idx] > -78) mc.fillRect(c * step, r * step, step + 1, step + 1); }
    const glow = mk(); const gc = glow.getContext('2d')!;
    const g = gc.createRadialGradient(a.ap.pos.x, a.ap.pos.y, 0, a.ap.pos.x, a.ap.pos.y, rMax);
    g.addColorStop(0, `rgba(${Math.min(255, base[0] + 70)},${Math.min(255, base[1] + 70)},${Math.min(255, base[2] + 70)},.42)`);
    g.addColorStop(0.4, `rgba(${base[0]},${base[1]},${base[2]},.18)`); g.addColorStop(1, 'rgba(0,0,0,0)');
    gc.fillStyle = g; gc.fillRect(0, 0, W, H); gc.globalCompositeOperation = 'destination-in'; gc.drawImage(mask, 0, 0);
    ctx.save(); ctx.filter = 'blur(8px)'; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow, 0, 0); ctx.restore();
  });
  // dashed full-reach contour of each AP's own -67 dBm coverage
  aps.forEach((a, k) => {
    const g = grids[k]; const base = HM_HUES[k % HM_HUES.length]; ctx.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},.9)`;
    for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
      const idx = r * cols + c; if (g[idx] < -67) continue;
      if (g[idx - 1] < -67 || g[idx + 1] < -67 || g[idx - cols] < -67 || g[idx + cols] < -67) ctx.fillRect(c * step - 1, r * step - 1, 2.4, 2.4);
    }
  });
  // WALLS on top so coverage visibly stops at real materials (material color + white halo)
  p.walls.forEach((w) => {
    const meta = WALL_MATERIALS[w.material]; const lw = hmClamp(4 + (meta?.db5 ?? 4) / 3.5, 4, 11);
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = lw + 4; ctx.beginPath(); ctx.moveTo(w.a.x, w.a.y); ctx.lineTo(w.b.x, w.b.y); ctx.stroke();
    ctx.strokeStyle = meta?.color || '#243247'; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(w.a.x, w.a.y); ctx.lineTo(w.b.x, w.b.y); ctx.stroke(); ctx.restore();
  });
  // DEAD ZONE callouts: dashed-red box + "Place 1 AP here"
  const gaps = (cov.gaps || []).filter((g) => g.area > 150);
  gaps.forEach((gp) => {
    const b = gp.bbox;
    ctx.save(); ctx.strokeStyle = '#F87171'; ctx.lineWidth = 3.5; ctx.setLineDash([16, 11]); rr(ctx, b.x, b.y, b.w, b.h, 14); ctx.stroke(); ctx.restore();
    const gx = gp.centroid.x, gy = gp.centroid.y;
    ctx.save(); ctx.setLineDash([6, 7]); ctx.strokeStyle = '#4ADE80'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(gx, gy - 70, 34, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#4ADE80'; ctx.font = '800 34px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', gx, gy - 70); ctx.restore();
    const lines: [string, string, string][] = [['Dead Zone', '800 30px system-ui', '#fff'], [`${Math.round(gp.area).toLocaleString()} ft² · low signal`, '700 22px system-ui', '#ffd7d7'], ['▸ Place 1 AP here', '800 23px system-ui', '#4ADE80']];
    const tw = Math.max(...lines.map((l) => { ctx.font = l[1]; return ctx.measureText(l[0]).width; })) + 40, bh = 112, ly = Math.min(gy + 40, H - 150);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 18; ctx.fillStyle = 'rgba(140,22,26,.97)'; rr(ctx, gx - tw / 2, ly - bh / 2, tw, bh, 14); ctx.fill(); ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; lines.forEach((l, i) => { ctx.font = l[1]; ctx.fillStyle = l[2]; ctx.fillText(l[0], gx, ly - 32 + i * 32); });
  });
  // AP pins + "AP n" tag in the AP's own color
  devs.forEach((d, k) => {
    const base = HM_HUES[k % HM_HUES.length];
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(d.pos.x, d.pos.y, 32, 0, 7); ctx.fillStyle = '#0a0a0a'; ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 5; ctx.strokeStyle = `rgb(${base[0]},${base[1]},${base[2]})`; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; for (let r = 10; r <= 22; r += 6) { ctx.beginPath(); ctx.arc(d.pos.x, d.pos.y + 6, r, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(d.pos.x, d.pos.y + 6, 3.5, 0, 7); ctx.fill(); ctx.restore();
    const t = `AP ${k + 1}`; ctx.font = '800 22px system-ui'; const wch = ctx.measureText(t).width + 22;
    ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; rr(ctx, d.pos.x - wch / 2, d.pos.y - 72, wch, 32, 9); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, d.pos.x, d.pos.y - 56);
    if (d.channel != null) { ctx.fillStyle = 'rgba(13,17,23,.9)'; ctx.font = '700 18px system-ui'; const c2 = `ch ${d.channel}`; const w2 = ctx.measureText(c2).width + 14; rr(ctx, d.pos.x - w2 / 2, d.pos.y + 42, w2, 26, 8); ctx.fill(); ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; ctx.fillText(c2, d.pos.x, d.pos.y + 55); }
  });
  return cov;
}
/** Load a floor's plan + composite the cinematic coverage field into a data-URL hero image.
    Falls back to the plain plan (+ optional live overlay canvas) when the cinematic render can't run. */
function buildHeroImage(p: HeatmapProject, overlay?: HTMLCanvasElement | null): Promise<{ url: string; cov: CoverageResult | null }> {
  return new Promise((resolve) => {
    const cv = document.createElement('canvas'); cv.width = p.imgW; cv.height = p.imgH;
    const c = cv.getContext('2d');
    if (!c) { resolve({ url: '', cov: null }); return; }
    const finish = () => {
      let cov: CoverageResult | null = null;
      try { cov = drawCinematicField(c, p); } catch { cov = null; }
      if (!cov && overlay) { try { c.drawImage(overlay, 0, 0); } catch { /* */ } }
      resolve({ url: cv.toDataURL('image/png'), cov });
    };
    if (p.planDataUrl) {
      const im = new Image();
      im.onload = () => { try { c.drawImage(im, 0, 0, p.imgW, p.imgH); } catch { /* */ } finish(); };
      im.onerror = () => finish();
      im.src = p.planDataUrl;
    } else { c.fillStyle = '#f4f6f9'; c.fillRect(0, 0, p.imgW, p.imgH); finish(); }
  });
}

export default function Designer({ projectId }: { projectId: string | null }) {
  const { showToast } = useToast();
  // ── multi-floor: a building is a list of floors, each with its own project.
  //    `project`/`setProject` are a facade over the ACTIVE floor, so the entire
  //    editor below works unchanged — it just edits whichever floor is selected.
  const [floors, setFloors] = useState<{ id: string; name: string; proj: HeatmapProject | null }[]>(() => [{ id: 'floor_1', name: 'Floor 1', proj: null }]);
  const [activeFloor, setActiveFloor] = useState('floor_1');
  const activeFloorRef = useRef(activeFloor); activeFloorRef.current = activeFloor;
  const project = useMemo(() => floors.find((f) => f.id === activeFloor)?.proj ?? null, [floors, activeFloor]);
  const setProject = useCallback((u: React.SetStateAction<HeatmapProject | null>) => {
    setFloors((fs) => {
      const i = fs.findIndex((f) => f.id === activeFloorRef.current);
      if (i < 0) return fs;
      const cur = fs[i].proj;
      const next = typeof u === 'function' ? (u as (p: HeatmapProject | null) => HeatmapProject | null)(cur) : u;
      if (next === cur) return fs;
      const copy = [...fs]; copy[i] = { ...copy[i], proj: next }; return copy;
    });
  }, []);
  const [tool, setTool] = useState<Tool>('select');
  // Field mode is the DEFAULT — pros flip to Details for the full toolbox. Persisted.
  const [fieldMode, setFieldMode] = useState(true);
  const [fieldStepPin, setFieldStepPin] = useState<FieldStep | null>(null);
  const [scaleDoor, setScaleDoor] = useState(false); // next 2 clicks = door jamb→jamb
  const [scaleDoorFt, setScaleDoorFt] = useState(3); // 3 = single door, 6 = double — tapping a double door as "3 ft" is the classic 2x scale error (a 3,400 ft² building reads as 13,700 → 4 APs instead of 1)
  useEffect(() => { try { const v = localStorage.getItem('hm_field_mode'); if (v != null) setFieldMode(v === '1'); } catch { /* private mode */ } }, []);
  const flipFieldMode = (on: boolean) => {
    setFieldMode(on);
    // door-scale is a Field-mode gesture — leaking it into Details would make the
    // classic Scale tool silently commit 3 ft with no prompt (the mobile port hit this)
    setScaleDoor(false); setPendingScale([]);
    try { localStorage.setItem('hm_field_mode', on ? '1' : '0'); } catch { /* private mode */ }
  };
  const [placeType, setPlaceType] = useState<DeviceTypeId>('wifi_ap');
  const [apModel, setApModel] = useState(UNIFI_APS[6]?.model || '');
  const [camModel, setCamModel] = useState(UNIFI_CAMERAS[0]?.model || '');
  // ── multi-vendor auto-place picker (additive; UniFi is the default vendor/model) ──
  const [apVendor, setApVendor] = useState('Ubiquiti UniFi');
  const [apCatId, setApCatId] = useState('unifi-u7-pro');
  // ── survey calibration (readings persist on the active floor's project; feeds calibrate.ts) ──
  const measured = useMemo(() => project?.measured ?? [], [project]);
  const updateMeasured = useCallback((fn: (m: MeasuredPoint[]) => MeasuredPoint[]) =>
    setProject((p) => (p ? { ...p, measured: fn(p.measured ?? []) } : p)), [setProject]);
  const [calM, setCalM] = useState({ x: '', y: '', dbm: '' });
  const [calResult, setCalResult] = useState<CalibrationResult | null>(null);
  const [wallMat, setWallMat] = useState<WallMaterialId>('drywall');
  const [gangSel, setGangSel] = useState(2);        // electrical outlet receptacle count
  const [portsSel, setPortsSel] = useState(2);      // data/voice jack port count
  const [genderSel, setGenderSel] = useState<'M' | 'F'>('F'); // termination: Plug (M) / Jack (F)
  const [layerVis, setLayerVis] = useState<Record<string, boolean>>({}); // display-layer visibility (true unless explicitly false)
  const [pendingScale, setPendingScale] = useState<Pt[]>([]);
  const [pendingWall, setPendingWall] = useState<Pt[]>([]);
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);
  const [showHeat, setShowHeat] = useState(true);
  const [showContours, setShowContours] = useState(false);
  const [showInterference, setShowInterference] = useState(false);
  const [showDori, setShowDori] = useState(true);
  const [showCabling, setShowCabling] = useState(false); // thin steel home-run lines from cabled devices → rack/MDF
  const [tab, setTab] = useState<PanelTab>('design'); // segmented right-panel group
  const [showMeasured, setShowMeasured] = useState(true); // survey overlay: measured signal dots + predicted-vs-actual delta
  const [showRoam, setShowRoam] = useState(false);        // Wave 2: gold overlay on covered cells with no 2nd AP (roaming risk)
  const [showConfidence, setShowConfidence] = useState(false); // Wave 2: veil low-confidence areas (far from survey)
  const [selId, setSelId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; txt: string; sub?: string; dim?: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [pdfDoc, setPdfDoc] = useState<{ pdf: any; pages: number; name: string } | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [autoTarget, setAutoTarget] = useState(0.9); // auto-place coverage target (simple default: 90% on 5 GHz)
  const [autoBand, setAutoBand] = useState<Band>('5');
  const [clientsPerAp, setClientsPerAp] = useState(30); // client-capacity model: devices per AP
  const [dragOver, setDragOver] = useState(false);
  const [unifiMsg, setUnifiMsg] = useState('');
  const [view, setView] = useState({ scale: 1, ox: 0, oy: 0 });
  const [view3d, setView3d] = useState(false); // 2D canvas ↔ true 3D building view
  const [past, setPast] = useState<HeatmapProject[]>([]);
  const [future, setFuture] = useState<HeatmapProject[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [projList, setProjList] = useState<{ id: string; name: string }[]>([]);
  const [designList, setDesignList] = useState<{ id: string; name: string; coverage_percent: number | null; device_count: number; updated_at: string; project_id: string | null }[]>([]);
  const [modal, setModal] = useState<'none' | 'save' | 'open' | 'share'>('none');
  const [advisorOpen, setAdvisorOpen] = useState(true); // right-rail Advisor card (collapsible)
  const [shareUrl, setShareUrl] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [saveName, setSaveName] = useState('');
  // Designs bind to the project the /app shell says is open (the prop) — never a
  // localStorage guess. The save modal can still retarget explicitly.
  const [saveProj, setSaveProj] = useState(projectId || '');
  const [saveMsg, setSaveMsg] = useState('');
  // Shell hands us a new active project (URL change) → retarget saves to it.
  useEffect(() => { if (projectId) setSaveProj(projectId); }, [projectId]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'none' | 'pan' | 'device'; id?: string; sx: number; sy: number; moved: boolean; ox: number; oy: number }>({ mode: 'none', sx: 0, sy: 0, moved: false, ox: 0, oy: 0 });

  const activeDef = project ? deviceDef(project.activeType) : null;
  // registry-known devices only — pre-sync an 'idf' marker must never crash the BOM/schedule engines
  const bom = useMemo(() => (project ? computeBom(project.devices.filter((d) => !!DEVICE_REGISTRY[d.typeId])) : null), [project?.devices]); // eslint-disable-line react-hooks/exhaustive-deps
  const sched = useMemo(() => (project ? planSchedule(project.devices.filter((d) => !!DEVICE_REGISTRY[d.typeId])) : null), [project?.devices]); // eslint-disable-line react-hooks/exhaustive-deps
  const interference = useMemo(
    () => (project && coverage && showInterference && project.activeType === 'wifi_ap' ? interferenceMask(project, coverage) : null),
    [project, coverage, showInterference],
  );
  // the common band across all placed APs (null when mixed / none) — drives the band toggle highlight
  const apBand = useMemo<Band | null>(() => {
    const aps = project?.devices.filter((d) => d.typeId === 'wifi_ap') ?? [];
    if (!aps.length) return null;
    const b0 = (aps[0].band || '5') as Band;
    return aps.every((a) => (a.band || '5') === b0) ? b0 : null;
  }, [project?.devices]); // eslint-disable-line react-hooks/exhaustive-deps

  // selected multi-vendor AP catalog model (drives auto-place tx/gain + pricing)
  const apCat = useMemo(() => findApModel(apCatId) ?? apModelsByVendor(apVendor)[0], [apCatId, apVendor]);

  // ── inter-floor RF bleed: virtual (de-rated) APs from other floors onto the ACTIVE floor,
  //    plus same-channel vertical interference. Only meaningful for a real multi-floor building. ──
  const interFloor = useMemo(() => {
    if (floors.length < 2) return null;
    const stack = floors
      .map((f, i) => ({ level: i + 1, project: f.proj }))
      .filter((s): s is { level: number; project: HeatmapProject } => !!s.project && !!s.project.scale);
    // need ≥2 stacked floors and at least one source floor with an AP to bleed
    if (stack.length < 2 || !stack.some((s) => s.project.devices.some((d) => d.typeId === 'wifi_ap'))) return null;
    try { return computeInterFloorContribution(stack, {}); } catch { return null; }
  }, [floors]);
  const activeLevel = useMemo(() => floors.findIndex((f) => f.id === activeFloor) + 1, [floors, activeFloor]);
  const bleedDevices = useMemo<Device[]>(() => {
    const fb = interFloor?.floors.find((x) => x.level === activeLevel);
    return fb ? fb.bleedAps.map((b) => b.device) : [];
  }, [interFloor, activeLevel]);
  // inter-floor interference pairs that touch the active floor (worst first)
  const interFloorHits = useMemo(
    () => (interFloor?.interference ?? []).filter((it) => it.aLevel === activeLevel || it.bLevel === activeLevel),
    [interFloor, activeLevel],
  );

  // ── SELF-interference: co/adjacent-channel congestion modeled from THIS design's
  //    own placed APs and their planned channels. This is NOT a neighbor scan and is
  //    never presented as one — no survey ran. The fixed rssiDbm below is an
  //    equal-weight modeling constant the analyzer requires, not a measurement. ──
  const chanInterference = useMemo(() => {
    const aps = (project?.devices ?? []).filter((d) => d.typeId === 'wifi_ap' && d.channel != null);
    if (!aps.length) return null;
    const ownAps: ScannedNeighbor[] = aps.map((a) => ({
      bssid: a.id, ssid: a.label, channel: a.channel as number, band: (a.band || '5') as Band,
      rssiDbm: -50, // modeling constant (equal weight per AP) — not measured signal
    }));
    try { return analyzeInterference(ownAps); } catch { return null; }
  }, [project?.devices]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── image upload ── */
  const startProject = (dataUrl: string, w: number, h: number, name: string) => {
    setProject({ id: uid(), name, planDataUrl: dataUrl, imgW: w, imgH: h, scale: null, env: 'office', walls: [], devices: [], activeType: 'wifi_ap', rssiTargetDbm: -67, heatmapOpacity: 0.55 });
    setPast([]); setFuture([]); setCoverage(null); setSelId(null); setTool('scale');
    setFieldStepPin(null); setScaleDoor(false); setPendingScale([]); setPendingWall([]); // fresh plan = fresh flow — stale pins/gestures corrupted the new floor's scale
    setSavedId(null); setSaveProj(''); setSaveName(name); // new design — don't overwrite a prior save
  };
  // Render a specific PDF page to a PNG data-url and start the project on it.
  const renderPdfPage = async (pdf: any, n: number, name: string) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 2 });
    const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    startProject(cv.toDataURL('image/png'), cv.width, cv.height, pdf.numPages > 1 ? `${name} — Sheet ${n}` : name);
  };

  const onUpload = async (file: File) => {
    const name = file.name.replace(/\.[^.]+$/, '');
    const ext = (file.name.toLowerCase().split('.').pop() || '');
    // ── PDF (any # of pages) ──
    if (file.type === 'application/pdf' || ext === 'pdf') {
      setBusy('Rendering PDF…');
      try {
        const pdfjs = await import('pdfjs-dist');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pdfjs as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const buf = await file.arrayBuffer();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdf = await (pdfjs as any).getDocument({ data: buf }).promise;
        setPdfDoc({ pdf, pages: pdf.numPages, name });   // multi-sheet picker
        await renderPdfPage(pdf, 1, name);
      } catch (e) { console.error(e); setAiNotes(["Couldn't read that PDF. Re-export the sheet as a flattened PDF or a PNG and try again."]); setPdfDoc(null); }
      setBusy('');
      return;
    }
    // ── Formats the browser cannot decode → fail LOUDLY (no silent hang) ──
    if (/^(tif|tiff|heic|heif|dwg|dxf|dwf|rvt)$/i.test(ext)) {
      setAiNotes([`${file.name} can't be opened in the browser. Export the plan as PNG, JPG, or PDF and upload that.`]);
      return;
    }
    // ── Raster (png/jpg/webp/…) ──
    setBusy('Loading image…');
    const rd = new FileReader();
    rd.onerror = () => { setBusy(''); setAiNotes([`Couldn't read ${file.name}. Try a PNG, JPG, or PDF.`]); };
    rd.onload = () => {
      const img = new Image();
      img.onload = () => { setBusy(''); setPdfDoc(null); startProject(img.src, img.naturalWidth, img.naturalHeight, name); };
      img.onerror = () => { setBusy(''); setAiNotes([`${file.name} isn't a format the browser can display. Export it as PNG, JPG, or PDF and re-upload.`]); };
      img.src = rd.result as string;
    };
    rd.readAsDataURL(file);
  };

  /* ── vector CAD PDF import: EXACT walls + scale from /api/heatmap/parse-vector ──
     No AI guessing — the route reads real vector geometry. Scanned/raster PDFs come
     back ok:false, and we tell the user to use the AI scan instead. */
  const importVectorPdf = async (file: File): Promise<boolean> => {
    const name = file.name.replace(/\.[^.]+$/, '');
    setBusy('Reading vector PDF…'); setAiNotes([]);
    try {
      // read the file as base64 and strip the data-URL prefix the route doesn't want
      const b64 = await new Promise<string>((resolve, reject) => {
        const rd = new FileReader();
        rd.onerror = () => reject(new Error('could not read the file'));
        rd.onload = () => { const s = String(rd.result || ''); const i = s.indexOf(','); resolve(i >= 0 ? s.slice(i + 1) : s); };
        rd.readAsDataURL(file);
      });
      const res = await fetch('/api/heatmap/parse-vector', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf: b64 }),
      });
      const data = await res.json();
      if (!data || !data.ok) {
        console.error('vector import failed', res.status, data?.error);
        setBusy(''); return false; // scanned/raster PDF — smartUpload falls back to the image path
      }
      const K = 2; // pixels per PDF point (coordinate mapping — see route contract)
      const imgW = Math.round((data.pageWidthPt || 0) * K);
      const imgH = Math.round((data.pageHeightPt || 0) * K);
      const det = (data.detectedScale && typeof data.detectedScale.pxPerFt === 'number' && data.detectedScale.pxPerFt > 0) ? data.detectedScale : null;
      const scale = det ? { pxPerFt: det.pxPerFt * K } : null;
      // Use the server's CLASSIFIED wall centerlines (clutter dropped + parallel faces
      // collapsed) instead of raw segments (which double-count faces and include furniture /
      // dimensions / title-block text). Fall back to raw segments for older server responses.
      const minLenPx = scale ? scale.pxPerFt * 0.5 : 0;
      const srcWalls: { x1: number; y1: number; x2: number; y2: number }[] =
        Array.isArray(data.walls) && data.walls.length ? data.walls
        : Array.isArray(data.segments) ? data.segments : [];
      const walls: Wall[] = srcWalls
        .filter((s) => [s.x1, s.y1, s.x2, s.y2].every((n) => typeof n === 'number'))
        .map((s) => ({ id: uid(), a: { x: s.x1 * K, y: s.y1 * K }, b: { x: s.x2 * K, y: s.y2 * K }, material: 'drywall' as WallMaterialId }))
        .filter((w) => (minLenPx ? dist(w.a, w.b) >= minLenPx : true));
      if (!imgW || !imgH || !walls.length) {
        setBusy(''); return false; // no usable geometry — smartUpload falls back to the image path
      }
      // blank template backdrop — no raster plan; walls render on a clean canvas (matches export's empty-plan fill)
      const bg = document.createElement('canvas'); bg.width = imgW; bg.height = imgH;
      const bctx = bg.getContext('2d'); if (bctx) { bctx.fillStyle = '#f4f6f9'; bctx.fillRect(0, 0, imgW, imgH); }
      const proj: HeatmapProject = {
        id: uid(), name, planDataUrl: bg.toDataURL('image/png'), imgW, imgH,
        scale, env: 'office', walls, devices: [],
        activeType: 'wifi_ap', rssiTargetDbm: -67, heatmapOpacity: 0.55,
      };
      setProject(proj);
      setPast([]); setFuture([]); setCoverage(null); setSelId(null); setPdfDoc(null);
      setSavedId(null); setSaveProj(''); setSaveName(name);
      setTool(scale ? 'select' : 'scale');
      setFieldStepPin(null); setScaleDoor(false); setPendingScale([]); setPendingWall([]);
      const notes: string[] = [`Imported ${walls.length} wall${walls.length === 1 ? '' : 's'} · scale ${scale ? 'detected' : 'manual'}.`];
      if (scale) { const a = deriveFootprint(proj).areaFt2; notes.push(`Scale ≈ ${scale.pxPerFt.toFixed(1)} px/ft (${det!.source || 'from PDF'})${a > 0 ? ` — this floor reads as ~${Math.round(a).toLocaleString()} ft²` : ''}. Place devices to compute coverage.`); }
      else notes.push('Scale not found — tap two points on a known dimension with the Scale tool to calibrate before placing devices.');
      setAiNotes(notes);
    } catch (e) {
      console.error(e); setBusy(''); return false;
    }
    setBusy('');
    return true;
  };
  /* ONE upload door — no format quiz. Vector CAD PDFs import exact walls + scale;
     scanned PDFs and photos fall back to the raster path automatically. */
  const smartUpload = async (file: File) => {
    const ext = (file.name.toLowerCase().split('.').pop() || '');
    if (file.type === 'application/pdf' || ext === 'pdf') {
      if (await importVectorPdf(file)) return;
      setAiNotes([]);
      await onUpload(file);
      return;
    }
    await onUpload(file);
  };

  // drag-and-drop a plan file anywhere onto the upload box / canvas
  const onDropFiles = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) smartUpload(f);
  };
  const onDragOverFiles = (e: React.DragEvent) => { e.preventDefault(); if (!dragOver) setDragOver(true); };
  const onDragLeaveFiles = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); };

  /* ── seed a prebuilt template (draws a plan, sets scale + walls + devices) ── */
  const buildTemplate = (spec: TemplateSpec) => {
    const k = spec.pxPerFt, W = Math.round(spec.ftW * k), H = Math.round(spec.ftH * k);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#eef1f5'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(163,172,187,0.20)'; ctx.lineWidth = 1;
    for (let gx = 0; gx <= spec.ftW; gx += 5) { const x = gx * k; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let gy = 0; gy <= spec.ftH; gy += 5) { const y = gy * k; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.font = `600 ${Math.round(k * 1.5)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const r of spec.rooms) {
      ctx.strokeStyle = '#243247'; ctx.lineWidth = Math.max(2, k * 0.45);
      ctx.strokeRect(r.x * k, r.y * k, r.w * k, r.h * k);
      if (r.label) { ctx.fillStyle = '#94A3B8'; ctx.fillText(r.label, (r.x + r.w / 2) * k, (r.y + r.h / 2) * k); }
    }
    const walls: Wall[] = spec.walls.map((w) => ({ id: uid(), a: { x: w.a[0] * k, y: w.a[1] * k }, b: { x: w.b[0] * k, y: w.b[1] * k }, material: w.material }));
    const devices: Device[] = spec.devices.map((d) => {
      const model = d.typeId === 'wifi_ap' ? (d.label && UNIFI_APS.some((a) => a.model === d.label) ? d.label : apModel)
        : d.typeId === 'camera' ? (d.label && UNIFI_CAMERAS.some((c) => c.model === d.label) ? d.label : camModel) : undefined;
      const dev = makeDevice(d.typeId, { x: d.x * k, y: d.y * k }, model);
      if (d.aimDeg != null) dev.aimDeg = d.aimDeg;
      if (d.label) dev.label = d.label;
      return dev;
    });
    const proj: HeatmapProject = { id: uid(), name: spec.name, planDataUrl: cv.toDataURL('image/png'), imgW: W, imgH: H, scale: { pxPerFt: k }, env: spec.env, walls, devices, activeType: spec.activeType || 'wifi_ap', rssiTargetDbm: -67, heatmapOpacity: 0.55 };
    setProject(proj); setPast([]); setFuture([]); setSelId(null); setSavedId(null); setTool('select');
    setFieldStepPin(null); setScaleDoor(false); setPendingScale([]); setPendingWall([]);
    try { setCoverage(computeCoverage(proj)); } catch { setCoverage(null); }
    setTimeout(fitView, 60);
  };

  const patch = (u: Partial<HeatmapProject>) => setProject((p) => (p ? { ...p, ...u } : p));

  /* ── screen → image px (accounts for zoom/pan) ── */
  const toImg = (clientX: number, clientY: number): Pt => {
    const rect = hostRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - view.ox) / view.scale, y: (clientY - rect.top - view.oy) / view.scale };
  };
  const snapMaybe = (pt: Pt): Pt => {
    if (!project || tool !== 'wall') return pt;
    let best = pt, bd = 12 / view.scale;
    for (const w of project.walls) for (const e of [w.a, w.b]) { const dd = Math.hypot(e.x - pt.x, e.y - pt.y); if (dd < bd) { bd = dd; best = e; } }
    if (pendingWall.length) { // snap segment to 0/45/90 from last vertex
      const last = pendingWall[pendingWall.length - 1]; const dx = best.x - last.x, dy = best.y - last.y;
      const ang = Math.atan2(dy, dx), step = Math.PI / 4, sa = Math.round(ang / step) * step, len = Math.hypot(dx, dy);
      let diff = Math.abs(((ang - sa + Math.PI) % (2 * Math.PI)) - Math.PI); if (diff < 0.2) best = { x: last.x + Math.cos(sa) * len, y: last.y + Math.sin(sa) * len };
    }
    return best;
  };

  /* ── undo / redo ── */
  const dirtyRef = useRef(false); // set on any edit, cleared on save/load — drives the unsaved-changes guard
  const snapshot = () => { dirtyRef.current = true; if (project) { setPast((h) => [...h.slice(-40), project]); setFuture([]); } };
  // Guard against losing unsaved work to a stray tab close / back / reload.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
  const undo = useCallback(() => { setPast((h) => { if (!h.length) return h; setFuture((f) => (project ? [project, ...f].slice(0, 40) : f)); setProject(h[h.length - 1]); return h.slice(0, -1); }); }, [project, setProject]);
  const redo = useCallback(() => { setFuture((f) => { if (!f.length) return f; setPast((h) => (project ? [...h, project] : h)); setProject(f[0]); return f.slice(1); }); }, [project, setProject]);

  /* ── a "click" (no drag) dispatches the active tool ── */
  const clickAt = async (pt: Pt) => {
    if (!project) return;
    if (tool === 'scale') {
      const pts = [...pendingScale, pt];
      if (pts.length === 2) {
        const px = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        // Echo the building's computed size on EVERY scale commit — the one guard
        // that catches a wrong scale instantly (a 2x door error reads a 3,400 ft²
        // building back as ~13,700 ft² and quadruples the AP count).
        const sqftNote = (pxPerFt: number) => {
          const a = deriveFootprint({ ...project, scale: { pxPerFt } }).areaFt2;
          return a > 0 ? ` This floor reads as ~${Math.round(a).toLocaleString()} ft² — wrong? Redo the scale.` : '';
        };
        if (scaleDoor) {
          // Door-tap scale — jamb to jamb across the doorway. No typing on a jobsite.
          if (px > 2) {
            const pxPerFt = px / scaleDoorFt;
            snapshot(); patch({ scale: { pxPerFt } });
            // land EXACTLY like mobile: place tool armed, Devices step pinned, visible note
            setTool('place'); setPlaceType('wifi_ap'); setScaleDoor(false); setFieldStepPin('devices');
            setAiNotes([`Scale set from the ${scaleDoorFt === 6 ? 'double ' : ''}door.${sqftNote(pxPerFt)}`]);
          }
          setPendingScale([]);
        } else {
          const ans = (await textPrompt({ title: 'Enter a value', label: 'Real-world length of this line, in feet:', defaultValue: '20' }));
          const ft = ans ? parseFloat(ans) : NaN;
          if (ft > 0) {
            const pxPerFt = px / ft;
            snapshot(); patch({ scale: { pxPerFt } });
            setAiNotes([`Scale set.${sqftNote(pxPerFt)}`]);
            if (fieldMode) { setTool('place'); setPlaceType('wifi_ap'); setFieldStepPin('devices'); }
            else setTool('wall');
          }
          setPendingScale([]);
        }
      } else setPendingScale(pts);
      return;
    }
    if (tool === 'wall') { setPendingWall((w) => [...w, snapMaybe(pt)]); return; }
    if (tool === 'place') {
      if ((placeType as string) === 'idf') {
        // ONE IDF per floor — a second click MOVES it (the cable schedule keys off "the IDF")
        snapshot();
        const existing = project.devices.find(isIdfDevice);
        if (existing) { patch({ devices: project.devices.map((x) => (x.id === existing.id ? { ...x, pos: pt } : x)) }); setSelId(existing.id); }
        else { const d = makeDevice(IDF_TYPE, pt); d.label = 'IDF'; patch({ devices: [...project.devices, d] }); setSelId(d.id); }
        setAiNotes([project.scale ? 'IDF placed — cable runs + the schedule now measure from plan geometry to this rack. Click again to move it.' : 'IDF placed — set the scale so cable-run footage is real.']);
        return;
      }
      const model = placeType === 'wifi_ap' ? apModel : placeType === 'camera' ? camModel : undefined;
      snapshot(); const d = makeDevice(placeType, pt, model);
      // marker rough-in: stamp the chosen gang / port / gender + a pro label
      if (placeType === 'electrical_outlet') { d.gang = gangSel; d.label = `${GANG_LABEL[gangSel] || gangSel + '-gang'} · ${gangSel}`; }
      else if (placeType === 'data_jack') { d.ports = portsSel; d.label = `RJ45 ×${portsSel}`; }
      else if (placeType === 'voice_jack') { d.ports = portsSel; d.label = portsSel > 1 ? `RJ11 ×${portsSel}` : 'RJ11'; }
      else if (placeType === 'combo_plate') { d.label = 'Power + Data'; }
      else if (placeType === 'cable_term') { d.gender = genderSel; d.label = genderSel === 'M' ? 'Plug (M)' : 'Jack (F)'; }
      patch({ devices: [...project.devices, d] }); setSelId(d.id);
      return;
    }
    let best: string | null = null, bd = 18 / view.scale;
    for (const d of project.devices) { const dd = Math.hypot(d.pos.x - pt.x, d.pos.y - pt.y); if (dd < bd) { bd = dd; best = d.id; } }
    setSelId(best);
  };

  /* ── pointer: pan / drag-device / click ── */
  const onDown = (e: React.MouseEvent) => {
    if (!project) return;
    const pt = toImg(e.clientX, e.clientY);
    // grab an existing device FIRST (any tool except scale/wall) → select + drag + delete-ready,
    // so you can move/remove devices even while the Place tool is active (never stuck only adding).
    if (tool !== 'scale' && tool !== 'wall') {
      let hit: string | null = null, bd = 18 / view.scale;
      for (const d of project.devices) { const dd = Math.hypot(d.pos.x - pt.x, d.pos.y - pt.y); if (dd < bd) { bd = dd; hit = d.id; } }
      if (hit) { setSelId(hit); snapshot(); drag.current = { mode: 'device', id: hit, sx: e.clientX, sy: e.clientY, moved: false, ox: view.ox, oy: view.oy }; return; }
    }
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, moved: false, ox: view.ox, oy: view.oy };
  };
  const onMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (d.mode === 'none') {
      // hover-to-inspect: exact value + serving device (AP name / band) at the cursor
      if (coverage && project && project.scale) {
        const pt = toImg(e.clientX, e.clientY);
        if (pt.x < 0 || pt.y < 0 || pt.x > project.imgW || pt.y > project.imgH) { setHover(null); return; }
        const info = inspectAt(pt, project);
        if (!Number.isFinite(info.value)) { setHover({ x: e.clientX, y: e.clientY, txt: info.unit === 'dBm' ? 'No signal' : 'No coverage', sub: 'out of range / blocked', dim: true }); return; }
        const srv = info.serving;
        const band = srv?.typeId === 'wifi_ap' ? (srv.band || '5') : null;
        const txt = `${info.value.toFixed(0)} ${info.unit}`;
        const sub = srv ? `${srv.label || DEVICE_REGISTRY[srv.typeId].short}${band ? ` · ${band} GHz` : ''}` : undefined;
        setHover({ x: e.clientX, y: e.clientY, txt, sub });
      } else setHover(null);
      return;
    }
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
    if (d.mode === 'device' && d.id && d.moved) { const pt = toImg(e.clientX, e.clientY); setProject((p) => (p ? { ...p, devices: p.devices.map((x) => (x.id === d.id ? { ...x, pos: pt } : x)) } : p)); }
    else if (d.mode === 'pan' && d.moved) setView((v) => ({ ...v, ox: d.ox + dx, oy: d.oy + dy }));
  };
  const onUp = (e: React.MouseEvent) => {
    const d = drag.current;
    // only an empty-space (pan) click runs clickAt (place / scale point / wall point / deselect).
    // a device grab already selected in onDown — never re-fire clickAt or it would add on top.
    if (d.mode === 'pan' && !d.moved) clickAt(toImg(e.clientX, e.clientY));
    drag.current = { mode: 'none', sx: 0, sy: 0, moved: false, ox: 0, oy: 0 };
    setHover(null);
  };

  /* ── zoom / fit ── */
  const zoom = (factor: number, cx?: number, cy?: number) => {
    const rect = hostRef.current?.getBoundingClientRect(); if (!rect) return;
    const sx = cx != null ? cx - rect.left : rect.width / 2, sy = cy != null ? cy - rect.top : rect.height / 2;
    setView((v) => { const ns = Math.max(0.08, Math.min(8, v.scale * factor)), k = ns / v.scale; return { scale: ns, ox: sx - (sx - v.ox) * k, oy: sy - (sy - v.oy) * k }; });
  };
  const fitView = useCallback(() => {
    if (!project || !hostRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    const s = Math.min(rect.width / project.imgW, rect.height / project.imgH) * 0.96;
    setView({ scale: s, ox: (rect.width - project.imgW * s) / 2, oy: (rect.height - project.imgH * s) / 2 });
  }, [project]);
  useEffect(() => { if (project) setTimeout(fitView, 30); }, [project?.id]); // eslint-disable-line
  // Issue navigator: zoom + center the viewport on a specific bbox (image px).
  const zoomToBox = useCallback((b: { x: number; y: number; w: number; h: number }) => {
    if (!hostRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    const pad = 1.7;
    const s = Math.max(0.08, Math.min(6, Math.min(rect.width / (b.w * pad), rect.height / (b.h * pad))));
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    setView({ scale: s, ox: rect.width / 2 - cx * s, oy: rect.height / 2 - cy * s });
  }, []);
  // EDITOR MODE: the /app shell is natural-flow (the WINDOW scrolls; the fixed topbar
  // pads .main-content-area). Size the editor to a fixed height = viewport-bottom − its
  // own measured top — the measurement already includes the /app topbar and our hero
  // header, so nothing extends past the window → NO page scroll. Purely local to the
  // editor element (React's inline style has no height, so it won't fight us).
  useEffect(() => {
    if (!project) return;
    const hm = document.querySelector('[data-ss-root][data-mode="editor"]') as HTMLElement | null;
    if (!hm) return;
    // Measure the chrome height above the editor ONCE, then use calc(100dvh - top).
    // dvh tracks the viewport automatically — NO resize listener (which caused a scrollbar-toggle loop).
    const top = Math.round(hm.getBoundingClientRect().top + window.scrollY);
    hm.style.height = `calc(100dvh - ${top}px)`;
    const t = setTimeout(fitView, 60);
    return () => { clearTimeout(t); hm.style.height = ''; };
  }, [!!project]); // eslint-disable-line
  /* AUTO-FIT — the plan always fits the window. Window resize, phone rotation,
     sidebar collapse, a chrome row appearing: any size change re-fits the plan.
     Manual zoom/pan still works between changes; a layout change brings it back. */
  useEffect(() => {
    const host = hostRef.current; if (!host || !project) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const refit = () => { if (t) clearTimeout(t); t = setTimeout(fitView, 120); };
    // BOTH signals: ResizeObserver catches container changes (sidebar, chrome rows),
    // window resize catches viewport changes even when frames aren't compositing.
    // Refitting only moves the canvas TRANSFORM — no container sizes change, so this
    // can't re-enter itself (the scrollbar-toggle loop the height effect once hit).
    const ro = new ResizeObserver(refit);
    ro.observe(host);
    window.addEventListener('resize', refit);
    return () => { ro.disconnect(); window.removeEventListener('resize', refit); if (t) clearTimeout(t); };
  }, [project?.id, fitView]); // eslint-disable-line
  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const wh = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); };
    host.addEventListener('wheel', wh, { passive: false });
    return () => host.removeEventListener('wheel', wh);
  }, [project]); // eslint-disable-line

  const finishWall = useCallback(() => {
    if (!project || pendingWall.length < 2) { setPendingWall([]); return; }
    snapshot();
    const segs: Wall[] = [];
    for (let i = 0; i < pendingWall.length - 1; i++) segs.push({ id: uid(), a: pendingWall[i], b: pendingWall[i + 1], material: wallMat });
    setProject((p) => (p ? { ...p, walls: [...p.walls, ...segs] } : p));
    setPendingWall([]);
  }, [project, wallMat, pendingWall]); // eslint-disable-line

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const inField = document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'Enter' || e.key === 'Escape') { if (pendingWall.length) finishWall(); setPendingScale([]); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selId && !inField) { snapshot(); patch({ devices: project!.devices.filter((d) => d.id !== selId) }); setSelId(null); }
      // Ctrl/Cmd+D → duplicate the selected device (exact-config copy, nudged ~1 grid cell, left selected)
      if (meta && e.key.toLowerCase() === 'd' && selId && !inField) {
        e.preventDefault();
        const src = project!.devices.find((d) => d.id === selId);
        if (src) {
          snapshot();
          const off = Math.max(project!.imgW / 40, 12);
          const copy = { ...src, id: uid(), pos: { x: Math.min(project!.imgW, src.pos.x + off), y: Math.min(project!.imgH, src.pos.y + off) } };
          patch({ devices: [...project!.devices, copy] });
          setSelId(copy.id);
        }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [pendingWall, selId, project, undo, redo, finishWall]); // eslint-disable-line

  /* ── compute ── */
  // fold inter-floor bleed APs (from other floors) into the coverage input on multi-floor
  // buildings; a no-op on a single floor (bleedDevices is empty). Device state is untouched —
  // only what computeCoverage sees changes, so the marker list / BOM / render stay identical.
  const covProject = useCallback(
    (p: HeatmapProject) => (bleedDevices.length ? { ...p, devices: [...p.devices, ...bleedDevices] } : p),
    [bleedDevices],
  );
  const compute = useCallback(() => {
    if (!project || !project.scale) return;
    setBusy('Computing coverage…');
    setTimeout(() => { setCoverage(recompute(covProject(project), 10, { measured: project.measured, calRmseDb: calResult?.rmseAfter })); setBusy(''); }, 20);
  }, [project, covProject, calResult]);

  // auto-recompute when devices/walls/type/survey/calibration change (debounced)
  useEffect(() => {
    if (!project?.scale) return;
    const t = setTimeout(() => setCoverage(recompute(covProject(project), 10, { measured: project.measured, calRmseDb: calResult?.rmseAfter })), 180);
    return () => clearTimeout(t);
  }, [project?.devices, project?.walls, project?.activeType, project?.rssiTargetDbm, project?.env, project?.measured, calResult?.rmseAfter, covProject]); // eslint-disable-line

  /* ── smart actions ── */
  const doAutoPlace = () => {
    if (!project) return;
    if (!project.scale) {
      setAiNotes(['Set the scale first so AP spacing is real: pick the Scale tool, draw a line on a known dimension (e.g. a 10 ft door), and enter its length. Or run “AI scan” — it reads the scale bar when the plan has one. Auto-place needs a scale to know how far each AP reaches.']);
      return;
    }
    // Multi-vendor: model the selected catalog AP's REAL radio (per-band tx + antenna gain)
    // so spacing/count are accurate for any vendor, not just UniFi.
    const radio = apCat ? toDeviceRadio(apCat, autoBand) : null;
    const apLabel = apCat ? apCat.model : apModel.replace('UniFi ', '');
    setBusy(`Auto-placing ${apLabel} to ${Math.round(autoTarget * 100)}%…`);
    setTimeout(() => {
      snapshot();
      // REPLACE semantics: re-running auto-place designs FRESH around the user's manual
      // devices — prior auto-placed APs come out first (never a second blanket on top).
      const seed = { ...project, devices: project.devices.filter((d) => !isAutoPlacedAp(d)) };
      const replacedCount = project.devices.length - seed.devices.length;
      const { aps, achievedPct, metTarget } = autoPlaceAPs(seed, radio
        ? { targetPct: autoTarget, band: radio.band, txPowerDbm: radio.txPowerDbm, antennaGainDbi: radio.antennaGainDbi, label: apLabel }
        : { targetPct: autoTarget, band: autoBand, apModel });
      const pct = Math.round(achievedPct * 100);
      if (aps.length === 0 && replacedCount > 0) {
        // Defensive: never delete a working auto design in exchange for nothing.
        setAiNotes([`Manual devices already cover ${pct}% at ${project.rssiTargetDbm} dBm — kept the existing ${replacedCount} auto-placed AP${replacedCount === 1 ? '' : 's'} unchanged.`]);
        setBusy('');
        return;
      }
      setProject((p) => (p ? { ...p, activeType: 'wifi_ap', devices: replaceAutoPlacedAps(p.devices, aps).devices } : p));
      const swapNote = replacedCount > 0 ? ` Replaced ${replacedCount} previously auto-placed AP${replacedCount === 1 ? '' : 's'}.` : '';
      setAiNotes(
        aps.length === 0
          ? [`Existing APs already cover ${pct}% at ${project.rssiTargetDbm} dBm — nothing to add for a ${Math.round(autoTarget * 100)}% target.`]
          : metTarget
            ? [`Placed ${aps.length} × ${apLabel} on ${autoBand} GHz → ${pct}% coverage at ${project.rssiTargetDbm} dBm — target met.${swapNote} Undo reverts.`]
            : [`Placed ${aps.length} × ${apLabel} on ${autoBand} GHz → ${pct}% coverage (target ${Math.round(autoTarget * 100)}% not reached). Walls are heavy or the target dBm is aggressive — add a few by hand, pick a higher-power AP, or lower the target dBm.${swapNote} Undo reverts.`],
      );
      setBusy('');
    }, 20);
  };
  // ── Dead zones WORTH FIXING: ≥150 ft² (a room, not a closet) and capped so the fix
  //    pass can never push the floor past the same 1 AP / 1,500 ft² ceiling the placer
  //    enforces. The raw dead-zone COUNT stays on the metrics — honest reporting — but
  //    every "fix" path places from THIS list. (Same rule as mobile — one engine.) ──
  const fixableGaps = useMemo(
    () => (project && coverage ? gapsWorthFixing(project, coverage.gaps ?? [], project.devices.filter((d) => d.typeId === 'wifi_ap').length) : []),
    [project, coverage],
  );
  // ── ADVISOR data: density guard + per-AP reasoning + IDF cable schedule (engine shim, module scope) ──
  const densityFlag = useMemo(() => (project ? getDensityFlag(project) : null), [project]);
  const idfDevice = useMemo(() => project?.devices.find(isIdfDevice) ?? null, [project]);
  const cableRuns = useMemo(() => (project && idfDevice ? getCableRuns(project, idfDevice.id) : null), [project, idfDevice]);
  const advice = useMemo(() => (project ? getAdvice(project, coverage) : null), [project, coverage]);
  // Current field step: derived from what the design actually has, unless the user
  // pinned one on the rail. Completing a step clears the pin so the flow advances.
  // IDENTICAL derivation to mobile (coverage-heatmap.tsx): walls are OPTIONAL (reachable
  // by pinning, never a gate) and the rail lands on Bid once coverage exists.
  const fieldStepAuto: FieldStep = !project ? 'plan' : !project.scale ? 'scale' : project.devices.length === 0 ? 'devices' : !coverage ? 'heatmap' : 'bid';
  const fieldStep: FieldStep = fieldStepPin ?? fieldStepAuto;
  const fieldDone: Record<FieldStep, boolean> = {
    plan: !!project,
    scale: !!project?.scale,
    walls: (project?.walls.length ?? 0) > 0,
    devices: (project?.devices.length ?? 0) > 0,
    heatmap: (project?.devices.length ?? 0) > 0 && !!coverage,
    bid: false,
  };
  /* Rail navigation = mobile's openStep: pin EXPLICITLY (the bar never advances by
     side effect mid-work), arm the step's tool, and disarm any half-done gesture —
     an armed door-scale surviving a step change silently rewrote the plan scale. */
  const openStep = (k: FieldStep) => {
    finishWall(); // commit (or clear) any traced-but-unfinished wall run first
    setScaleDoor(false); setPendingScale([]);
    if (k === 'scale') setTool('scale');
    else if (k === 'walls') setTool('wall');
    else if (k === 'devices') setTool('place');
    else setTool('select');
    setFieldStepPin(k);
  };
  // One-click dead-zone fix: drop an AP at the centroid of each dead zone WORTH an AP,
  // stamped with the selected AP's real radio, then let the debounced recompute re-grade.
  const doFixDeadZones = () => {
    if (!project) return;
    if (!project.scale) { setAiNotes(['Set the scale first — closing a dead zone needs real distances. Use the Scale tool or run AI scan.']); return; }
    const gaps = fixableGaps;
    if (!gaps.length) {
      setAiNotes([(coverage?.gaps?.length ?? 0) > 0
        ? 'The remaining dead pockets are too small to justify hardware — drag an existing AP a few feet toward the worst one instead of adding more.'
        : `No dead zones to close — coverage is already clean at ${project.rssiTargetDbm} dBm.`]);
      return;
    }
    const radio = apCat ? toDeviceRadio(apCat, autoBand) : null;
    const apLabel = apCat ? apCat.model : apModel.replace('UniFi ', '');
    setBusy(`Closing ${gaps.length} dead zone${gaps.length === 1 ? '' : 's'}…`);
    setTimeout(() => {
      snapshot();
      // placeInGap (engine contract): the best AP point INSIDE each dead zone — not
      // blindly the centroid, which can land outside an L-shaped gap. Tagged
      // autoPlaced so the next full auto-design replaces these too.
      const newAps = gaps.map((g) => {
        const pos = placeInGap(project, g);
        if (radio) {
          const d = makeDevice('wifi_ap', pos);
          d.band = radio.band; d.txPowerDbm = radio.txPowerDbm; d.antennaGainDbi = radio.antennaGainDbi; d.label = apLabel;
          return tagAutoPlaced(d);
        }
        return tagAutoPlaced(makeDevice('wifi_ap', pos, apModel));
      });
      // recompute INLINE (like autoDesign and mobile) — relying on the debounced pass left
      // `coverage` stale, so a quick second click re-placed APs on the same centroids
      const design = { ...project, activeType: 'wifi_ap' as DeviceTypeId, devices: [...project.devices, ...newAps] };
      setProject(design);
      try { setCoverage(recompute(covProject(design), 10, { measured: design.measured, calRmseDb: calResult?.rmseAfter })); } catch { /* debounced pass covers */ }
      setAiNotes([`Placed ${newAps.length} × ${apLabel} — one inside each dead zone worth fixing. Undo reverts.`]);
      setBusy('');
    }, 20);
  };
  // ── ONE-TAP AUTO-DESIGN — upload a plan, click once → a finished, priced coverage design.
  //    Chains the engines we already own: place APs to target → compute → close residual dead
  //    zones → plan channels → recompute. Computed inline so there's no setState/recompute race. ──
  const autoDesign = () => {
    if (!project) return;
    if (!project.scale) { setAiNotes(['Add a plan and set the scale first — Auto-design needs real distances.']); return; }
    const radio = apCat ? toDeviceRadio(apCat, autoBand) : null;
    const apLabel = apCat ? apCat.model : apModel.replace('UniFi ', '');
    setBusy('Auto-designing coverage…');
    setTimeout(() => {
      try {
        const opts = { measured: project.measured, calRmseDb: calResult?.rmseAfter };
        // REPLACE semantics: strip prior auto-placed APs first, design fresh around the
        // user's manual devices — running Auto-design twice must never stack hardware.
        const seed = { ...project, activeType: 'wifi_ap' as DeviceTypeId, devices: project.devices.filter((d) => !isAutoPlacedAp(d)) };
        const replacedCount = project.devices.length - seed.devices.length;
        const placed = autoPlaceAPs(seed, radio
          ? { targetPct: autoTarget, band: radio.band, txPowerDbm: radio.txPowerDbm, antennaGainDbi: radio.antennaGainDbi, label: apLabel }
          : { targetPct: autoTarget, band: autoBand, apModel }).aps;
        let design = { ...seed, devices: [...seed.devices, ...placed.map(tagAutoPlaced)] };
        let cov = recompute(covProject(design), 10, opts);
        // Gap-fix pass, CAPPED: room-sized holes only, never past the 1 AP/1,500 ft²
        // density ceiling the placer enforces (the unbounded pass was the AP flood).
        // placeInGap picks the best point INSIDE each hole (engine contract).
        const gaps = gapsWorthFixing(design, cov.gaps ?? [], design.devices.filter((d) => d.typeId === 'wifi_ap').length);
        if (gaps.length) {
          const fix = gaps.map((g) => {
            const pos = placeInGap(design, g);
            if (radio) { const d = makeDevice('wifi_ap', pos); d.band = radio.band; d.txPowerDbm = radio.txPowerDbm; d.antennaGainDbi = radio.antennaGainDbi; d.label = apLabel; return tagAutoPlaced(d); }
            return tagAutoPlaced(makeDevice('wifi_ap', pos, apModel));
          });
          design = { ...design, devices: [...design.devices, ...fix] };
          cov = recompute(covProject(design), 10, opts);
        }
        const chan = planChannels(design, autoBand === '2.4' ? '2.4' : '5');
        design = { ...design, devices: design.devices.map((d) => (chan[d.id] != null ? { ...d, channel: chan[d.id] } : d)) };
        snapshot();
        setProject(design);
        setCoverage(cov);
        setBusy('');
        const apCount = design.devices.filter((d) => d.typeId === 'wifi_ap').length;
        const pct = Number.isFinite(cov.stats.pctCovered) ? Math.round(cov.stats.pctCovered) : 0;
        const dz = (cov.gaps ?? []).length;
        const swapNote = replacedCount > 0 ? ` Replaced ${replacedCount} previously auto-placed AP${replacedCount === 1 ? '' : 's'}.` : '';
        setAiNotes([`Auto-designed: ${apCount} × ${apLabel} → ${pct}% coverage · ${dz === 0 ? 'no dead zones' : dz + ' dead zone' + (dz === 1 ? '' : 's')}.${swapNote} Undo reverts.`]);
      } catch {
        setBusy(''); setAiNotes(['Auto-design failed — try Auto-place, then Fix Dead Zones.']);
      }
    }, 20);
  };
  // ── LEGACY GUARD action: an over-dense design (pre-cap auto-designs stacked APs) gets ONE
  //    corrective button. Confirm-first, then strip EVERY AP (manual + auto — this is the one
  //    action allowed to) and run the corrected engine design: place → close dead zones (capped)
  //    → plan channels → recompute. Everything that is not a wifi_ap is untouched. ──
  const redesignCoverage = async () => {
    if (!project || !project.scale || !densityFlag) return;
    const ok = (await confirmDialog({ title: 'Please confirm', message: `Re-design coverage?\n\nThis REPLACES ALL ${densityFlag.apCount} access points with a fresh engine design (cap ${densityFlag.capAps} AP${densityFlag.capAps === 1 ? '' : 's'} for ${densityFlag.areaFt2.toLocaleString()} ft²). Cameras, sensors and everything else stay. Undo reverts.`, danger: true }));
    if (!ok) return;
    const radio = apCat ? toDeviceRadio(apCat, autoBand) : null;
    const apLabel = apCat ? apCat.model : apModel.replace('UniFi ', '');
    setBusy('Re-designing coverage…');
    setTimeout(() => {
      try {
        const opts = { measured: project.measured, calRmseDb: calResult?.rmseAfter };
        const seed = { ...project, activeType: 'wifi_ap' as DeviceTypeId, devices: project.devices.filter((d) => d.typeId !== 'wifi_ap') };
        const removed = project.devices.length - seed.devices.length;
        const placed = autoPlaceAPs(seed, radio
          ? { targetPct: autoTarget, band: radio.band, txPowerDbm: radio.txPowerDbm, antennaGainDbi: radio.antennaGainDbi, label: apLabel }
          : { targetPct: autoTarget, band: autoBand, apModel }).aps;
        let design = { ...seed, devices: [...seed.devices, ...placed.map(tagAutoPlaced)] };
        let cov = recompute(covProject(design), 10, opts);
        const gaps = gapsWorthFixing(design, cov.gaps ?? [], design.devices.filter((d) => d.typeId === 'wifi_ap').length);
        if (gaps.length) {
          const fix = gaps.map((g) => { const pos = placeInGap(design, g); if (radio) { const d = makeDevice('wifi_ap', pos); d.band = radio.band; d.txPowerDbm = radio.txPowerDbm; d.antennaGainDbi = radio.antennaGainDbi; d.label = apLabel; return tagAutoPlaced(d); } return tagAutoPlaced(makeDevice('wifi_ap', pos, apModel)); });
          design = { ...design, devices: [...design.devices, ...fix] };
          cov = recompute(covProject(design), 10, opts);
        }
        const chan = planChannels(design, autoBand === '2.4' ? '2.4' : '5');
        design = { ...design, devices: design.devices.map((d) => (chan[d.id] != null ? { ...d, channel: chan[d.id] } : d)) };
        snapshot(); setProject(design); setCoverage(cov); setBusy('');
        const apCount = design.devices.filter((d) => d.typeId === 'wifi_ap').length;
        const pct = Number.isFinite(cov.stats.pctCovered) ? Math.round(cov.stats.pctCovered) : 0;
        setAiNotes([`Re-designed: removed ${removed} AP${removed === 1 ? '' : 's'}, placed ${apCount} × ${apLabel} → ${pct}% coverage · ${(cov.gaps ?? []).length} dead zone(s). Undo reverts.`]);
      } catch { setBusy(''); setAiNotes(['Re-design failed — try Auto-design in the Devices step.']); }
    }, 20);
  };
  // ── "DESIGN MY BUILDING" AUTOPILOT — raw plan → AI reads walls/scale + places cameras/sensors →
  //    auto-place Wi-Fi → close dead zones → channels → priced TURNKEY bid, in one click. ──
  const autopilot = async () => {
    if (!project) return;
    setBusy('Autopilot: reading your plan…'); setAiNotes([]);
    try {
      let scanned: Device[] = [], scanWalls: Wall[] = [], newBoundary: Pt[] | undefined, detectedFullPxPerFt: number | null = null;
      if (project.planDataUrl) {
        const cap = 1600;
        const sc = Math.min(1, cap / Math.max(project.imgW, project.imgH));
        const sw = Math.max(1, Math.round(project.imgW * sc)), sh = Math.max(1, Math.round(project.imgH * sc));
        try {
          const small = await new Promise<string>((resolve, reject) => { const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = sw; cv.height = sh; cv.getContext('2d')!.drawImage(im, 0, 0, sw, sh); resolve(cv.toDataURL('image/jpeg', 0.82)); }; im.onerror = () => reject(new Error('img')); im.src = project.planDataUrl; });
          const smallPxPerFt = project.scale ? project.scale.pxPerFt * sc : undefined;
          const res = await fetch('/api/heatmap/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: small, imgW: sw, imgH: sh, pxPerFt: smallPxPerFt, goals: 'WiFi coverage, security cameras, motion + smoke detection, access control' }) });
          const data = await res.json().catch(() => null);
          if (res.ok && data && data.ok) {
            const inv = sc > 0 ? 1 / sc : 1;
            const cx = (x: number) => Math.max(0, Math.min(project.imgW, x * inv));
            const cy = (y: number) => Math.max(0, Math.min(project.imgH, y * inv));
            scanned = (data.devices || []).filter((d: { typeId: DeviceTypeId }) => !!DEVICE_REGISTRY[d.typeId]).map((d: { typeId: DeviceTypeId; x: number; y: number; aimDeg?: number; label?: string }) => { const dev = makeDevice(d.typeId, { x: cx(d.x), y: cy(d.y) }); if (typeof d.aimDeg === 'number') dev.aimDeg = d.aimDeg; if (d.label) dev.label = d.label; return dev; });
            const okMat = (m: unknown): m is WallMaterialId => typeof m === 'string' && Object.prototype.hasOwnProperty.call(WALL_MATERIALS, m);
            scanWalls = (Array.isArray(data.walls) ? data.walls : []).filter((w: { x1: number; y1: number; x2: number; y2: number }) => [w.x1, w.y1, w.x2, w.y2].every((n) => typeof n === 'number')).map((w: { x1: number; y1: number; x2: number; y2: number; material?: string }) => ({ id: uid(), a: { x: cx(w.x1), y: cy(w.y1) }, b: { x: cx(w.x2), y: cy(w.y2) }, material: okMat(w.material) ? w.material : 'drywall' }));
            const bpts: Pt[] = (Array.isArray(data.boundary) ? data.boundary : []).filter((p: { x: number; y: number }) => typeof p?.x === 'number' && typeof p?.y === 'number').map((p: { x: number; y: number }) => ({ x: cx(p.x), y: cy(p.y) }));
            if (bpts.length >= 3) newBoundary = bpts;
            if (typeof data.pxPerFt === 'number' && data.pxPerFt > 0) detectedFullPxPerFt = data.pxPerFt * inv;
          } else {
            /* THERE WAS NO ELSE HERE. A failed scan fell straight through and
               the plan opened with no devices, no walls and no message — which
               is indistinguishable from "the AI looked and found nothing".
               Upload a plan, press scan, watch nothing happen, conclude the
               tool is broken. The server writes this sentence for the person
               holding the tablet; show theirs rather than inventing a vaguer
               one. */
            setAiNotes([
              data?.error
                || 'The AI scan could not run. Your plan is loaded — set the scale and place devices by hand, or try the scan again.',
            ]);
          }
        } catch {
          /* Network or parse failure. Still says something: silence here is
             what made this feature look dead. */
          setAiNotes(['The AI scan could not be reached. Your plan is loaded — carry on by hand and try the scan again later.']);
        }
      }
      let design = { ...project, activeType: 'wifi_ap' as DeviceTypeId, devices: project.devices };
      if (scanWalls.length) design = { ...design, walls: [...project.walls, ...scanWalls] };
      if (newBoundary) design = { ...design, boundary: newBoundary };
      if (!design.scale && detectedFullPxPerFt) design = { ...design, scale: { pxPerFt: detectedFullPxPerFt } };
      // AI-SCAN DISCIPLINE — the AI reads the drawing; the ENGINE places RF.
      // Its AP suggestions are ignored (autoPlaceAPs owns Wi-Fi), its devices must
      // sit inside the building, and per-type counts are capped by floor area.
      const disc = disciplineAiDevices(design, scanned);
      design = { ...design, devices: [...project.devices, ...disc.kept] };
      if (!design.scale) {
        snapshot(); setProject(design); setBusy(''); setTool('scale');
        setAiNotes([scanned.length ? `Placed ${scanned.length} device(s) from your plan, but couldn't read a scale — set it with the Scale tool, then Auto-design.` : `Couldn't auto-read this plan — set the scale (Scale tool), then Auto-design.`]);
        return;
      }
      setBusy('Autopilot: designing coverage…');
      const opts = { measured: design.measured, calRmseDb: calResult?.rmseAfter };
      const radio = apCat ? toDeviceRadio(apCat, autoBand) : null;
      const apLabel = apCat ? apCat.model : apModel.replace('UniFi ', '');
      // REPLACE semantics (same engine contract as Auto-design): strip prior auto-placed
      // APs before the placer runs — a second autopilot pass redesigns, never stacks.
      const manualOnly = design.devices.filter((d) => !isAutoPlacedAp(d));
      const replacedCount = design.devices.length - manualOnly.length;
      design = { ...design, devices: manualOnly };
      const placed = autoPlaceAPs(design, radio ? { targetPct: autoTarget, band: radio.band, txPowerDbm: radio.txPowerDbm, antennaGainDbi: radio.antennaGainDbi, label: apLabel } : { targetPct: autoTarget, band: autoBand, apModel }).aps;
      design = { ...design, devices: [...design.devices, ...placed.map(tagAutoPlaced)] };
      let cov = recompute(covProject(design), 10, opts);
      // Same capped gap-fix rule as Auto-design — density ceiling holds on autopilot too.
      const gaps = gapsWorthFixing(design, cov.gaps ?? [], design.devices.filter((d) => d.typeId === 'wifi_ap').length);
      if (gaps.length) {
        const fix = gaps.map((g) => { const pos = placeInGap(design, g); if (radio) { const d = makeDevice('wifi_ap', pos); d.band = radio.band; d.txPowerDbm = radio.txPowerDbm; d.antennaGainDbi = radio.antennaGainDbi; d.label = apLabel; return tagAutoPlaced(d); } return tagAutoPlaced(makeDevice('wifi_ap', pos, apModel)); });
        design = { ...design, devices: [...design.devices, ...fix] };
        cov = recompute(covProject(design), 10, opts);
      }
      const chan = planChannels(design, autoBand === '2.4' ? '2.4' : '5');
      design = { ...design, devices: design.devices.map((d) => (chan[d.id] != null ? { ...d, channel: chan[d.id] } : d)) };
      snapshot(); setProject(design); setCoverage(cov); setBusy('');
      const aps = design.devices.filter((d) => d.typeId === 'wifi_ap').length;
      const cams = design.devices.filter((d) => d.typeId === 'camera').length;
      const others = design.devices.filter((d) => d.typeId !== 'wifi_ap' && d.typeId !== 'camera').length;
      const pct = Number.isFinite(cov.stats.pctCovered) ? Math.round(cov.stats.pctCovered) : 0;
      const turnkey = computeBom(design.devices).turnkey;
      const discNote = [
        replacedCount ? `replaced ${replacedCount} previously auto-placed AP${replacedCount === 1 ? '' : 's'}` : '',
        disc.droppedAps ? `ignored ${disc.droppedAps} AI AP pick${disc.droppedAps === 1 ? '' : 's'} (the engine places Wi-Fi)` : '',
        disc.droppedOutside ? `dropped ${disc.droppedOutside} outside the building` : '',
        disc.droppedExcess ? `trimmed ${disc.droppedExcess} over-dense` : '',
      ].filter(Boolean).join(', ');
      setAiNotes([`Autopilot: ${aps} AP(s)${cams ? ` · ${cams} camera(s)` : ''}${others ? ` · ${others} more` : ''} → ${pct}% coverage · ${(cov.gaps ?? []).length} dead zone(s). Turnkey install $${turnkey.toLocaleString()}.${discNote ? ` (${discNote}.)` : ''} Review, then create the bid.`]);
    } catch { setBusy(''); setAiNotes(['Autopilot hit a snag — try Auto-design, or set the scale and place devices by hand.']); }
  };
  const doChannels = () => {
    if (!project) return;
    const map = planChannels(project, '2.4');
    patch({ devices: project.devices.map((d) => (map[d.id] != null ? { ...d, channel: map[d.id] } : d)) });
  };
  // set every AP to a band and recompute coverage (auto-recompute effect fires on devices change).
  // pulls the model-accurate tx power for that band from the UniFi catalog when the AP model is known.
  const setBandAll = (b: Band) => {
    if (!project) return;
    if (!project.devices.some((d) => d.typeId === 'wifi_ap')) return;
    snapshot();
    patch({
      devices: project.devices.map((d) => {
        if (d.typeId !== 'wifi_ap') return d;
        const ap = UNIFI_APS.find((a) => a.model === d.label || a.model.replace('UniFi ', '') === d.label);
        const tx = ap && typeof ap.txDbm[b] === 'number' ? ap.txDbm[b] : d.txPowerDbm;
        return { ...d, band: b, ...(tx != null ? { txPowerDbm: tx } : {}) };
      }),
    });
  };

  /* ── survey calibration (manual measured readings; live walk-test capture is a later feature) ── */
  const addMeasured = () => {
    const x = parseFloat(calM.x), y = parseFloat(calM.y), dbm = parseFloat(calM.dbm);
    if (![x, y, dbm].every(Number.isFinite)) return;
    updateMeasured((m) => [...m, { x, y, measuredDbm: dbm }]);
    setCalM({ x: '', y: '', dbm: '' });
    setCalResult(null);
  };
  // Bulk walk-test import — CSV: x,y,dBm[,servingApId] (image px). Feeds the calibration engine at real survey scale.
  const surveyCsvRef = useRef<HTMLInputElement | null>(null);
  const importSurveyCsv = async (file: File) => {
    try {
      const text = await file.text();
      const { points, skipped } = parseSurveyCsv(text);
      if (!points.length) { setBusy(`No usable survey rows${skipped ? ` (${skipped} skipped)` : ''}`); setTimeout(() => setBusy(''), 2600); return; }
      updateMeasured((m) => [...m, ...points]);
      setCalResult(null);
      setBusy(`Imported ${points.length} survey point${points.length === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped` : ''}`);
      setTimeout(() => setBusy(''), 2800);
    } catch { setBusy('Could not read that CSV'); setTimeout(() => setBusy(''), 2500); }
  };
  const runCalibrate = () => {
    if (!project || !project.scale || !measured.length) return;
    try { setCalResult(calibrateModel(project, measured)); } catch { setCalResult(null); }
  };
  const applyCal = () => {
    if (!project || !calResult) return;
    snapshot();
    setProject((p) => (p ? applyCalibration(p, calResult) : p));
  };
  // Reflect the active floor's persisted survey when switching floors / loading a design.
  useEffect(() => {
    const p = floors.find((f) => f.id === activeFloor)?.proj;
    if (p && p.scale && p.measured && p.measured.length) {
      try { setCalResult(calibrateModel(p, p.measured)); } catch { setCalResult(null); }
    } else { setCalResult(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFloor]);

  // ── Composited coverage overlays (heat + confidence + roam), rasterized ONCE and cached by
  //    coverage identity. A device drag fires setProject on every mousemove but does NOT change
  //    `coverage`, so this memo stays cached and the per-frame draw just blits it + redraws the
  //    vector markers — instead of rebuilding three full-grid ImageData rasters every frame. ──
  const heatComposite = useMemo(() => {
    if (!coverage || !project) return null;
    if (!showHeat && !showConfidence && !showRoam) return null;
    const comp = document.createElement('canvas'); comp.width = project.imgW; comp.height = project.imgH;
    const cctx = comp.getContext('2d'); if (!cctx) return null;
    const { cols, rows, cells } = coverage;
    const blit = (paint: (c: { rgba: number[]; opacity: number; confidence?: number | null; covered?: boolean; roamReady?: boolean }, data: Uint8ClampedArray, o: number) => boolean) => {
      const off = document.createElement('canvas'); off.width = cols; off.height = rows;
      const octx = off.getContext('2d'); if (!octx) return;
      const img = octx.createImageData(cols, rows); let any = false;
      for (let i = 0; i < cells.length; i++) { const c = cells[i]; if (!c) continue; if (paint(c, img.data, i * 4)) any = true; }
      if (!any) return;
      octx.putImageData(img, 0, 0);
      cctx.imageSmoothingEnabled = true; (cctx as unknown as { imageSmoothingQuality: string }).imageSmoothingQuality = 'high';
      cctx.drawImage(off, 0, 0, cols, rows, 0, 0, comp.width, comp.height);
      cctx.imageSmoothingEnabled = false;
    };
    const mult = project.heatmapOpacity / 0.6;
    if (showHeat) blit((c, data, o) => { data[o] = c.rgba[0]; data[o + 1] = c.rgba[1]; data[o + 2] = c.rgba[2]; data[o + 3] = Math.min(255, Math.round(c.opacity * mult * 255)); return true; });
    if (showConfidence) blit((c, data, o) => { if (c.confidence == null) return false; data[o] = 8; data[o + 1] = 8; data[o + 2] = 10; data[o + 3] = Math.round((1 - c.confidence) * 205); return true; });
    if (showRoam) blit((c, data, o) => { if (!(c.covered && c.roamReady === false)) return false; data[o] = 212; data[o + 1] = 160; data[o + 2] = 23; data[o + 3] = 125; return true; });
    return comp;
  }, [coverage, showHeat, showConfidence, showRoam, project?.heatmapOpacity, project?.imgW, project?.imgH]);

  /* ── draw ── */
  useEffect(() => {
    const cv = canvasRef.current; if (!cv || !project) return;
    cv.width = project.imgW; cv.height = project.imgH;
    const ctx = cv.getContext('2d')!; ctx.clearRect(0, 0, cv.width, cv.height);
    // ── cached composited coverage overlays (heat + confidence + roam) — one blit, no per-frame raster ──
    if (heatComposite) ctx.drawImage(heatComposite, 0, 0);
    // ── walls by material: line-weight scales with attenuation (concrete thick → drywall thin),
    //    a soft dark halo keeps light materials (white drywall / glass) legible on the plan ──
    ctx.lineCap = 'round';
    for (const w of project.walls) {
      const meta = WALL_MATERIALS[w.material];
      const lw = Math.max(2, Math.min(7, 2.4 + (meta.db5 ?? 4) / 6));
      ctx.strokeStyle = 'rgba(13,17,23,0.35)'; ctx.lineWidth = lw + 2.4;
      ctx.beginPath(); ctx.moveTo(w.a.x, w.a.y); ctx.lineTo(w.b.x, w.b.y); ctx.stroke();
      ctx.strokeStyle = meta.color; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(w.a.x, w.a.y); ctx.lineTo(w.b.x, w.b.y); ctx.stroke();
    }
    // ── IDF cable runs: faint polylines device → placed IDF (the plan-geometry cable schedule) ──
    if (cableRuns) {
      ctx.save(); ctx.setLineDash([5, 6]);
      for (const r of cableRuns.runs) {
        if (!r.pos) continue;
        ctx.strokeStyle = r.overLimit ? 'rgba(248,113,113,0.55)' : hexA(SYSTEM_COLORS.cabling, 0.3);
        ctx.lineWidth = r.overLimit ? 1.6 : 1;
        ctx.beginPath(); ctx.moveTo(r.pos.x, r.pos.y); ctx.lineTo(cableRuns.idfPos.x, cableRuns.idfPos.y); ctx.stroke();
      }
      ctx.restore(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(cableRuns.idfPos.x, cableRuns.idfPos.y, 7, 0, 7); ctx.fillStyle = SYSTEM_COLORS.cabling; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#0a0a0a'; ctx.stroke();
      chip(ctx, `IDF · ${cableRuns.totalFt.toLocaleString()} ft`, cableRuns.idfPos.x, cableRuns.idfPos.y - 18, 'rgba(13,17,23,0.92)', SYSTEM_COLORS.cabling);
    }
    // ── structured cabling: thin steel home-run lines from cabled devices to the rack/MDF ──
    if (showCabling && project.devices.length) {
      const rack = (project.devices.find(isIdfDevice)?.pos)
        || (project.devices.find((d) => d.typeId === 'iot_gateway' || d.typeId === 'smart_switch')?.pos)
        || { x: project.imgW / 2, y: project.imgH / 2 };
      ctx.strokeStyle = SYSTEM_COLORS.cabling; ctx.lineWidth = 1.4; ctx.setLineDash([]);
      for (const d of project.devices) {
        if (layerVis[deviceLayerKey(d.typeId)] === false) continue;
        const rec = recommendCabling(d.typeId);
        if (!rec.dataCable && !rec.powerCable) continue;
        ctx.beginPath(); ctx.moveTo(d.pos.x, d.pos.y); ctx.lineTo(rack.x, rack.y); ctx.stroke();
      }
      // rack node
      ctx.beginPath(); ctx.arc(rack.x, rack.y, 5, 0, 7); ctx.fillStyle = SYSTEM_COLORS.cabling; ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = '#0a0a0a'; ctx.stroke();
    }
    if (pendingWall.length) {
      ctx.strokeStyle = GOLD_CANVAS; ctx.lineWidth = 3; ctx.setLineDash([9, 6]);
      ctx.beginPath(); ctx.moveTo(pendingWall[0].x, pendingWall[0].y);
      pendingWall.slice(1).forEach((p) => ctx.lineTo(p.x, p.y)); ctx.stroke(); ctx.setLineDash([]);
    }
    if (pendingScale.length) { ctx.fillStyle = GOLD_CANVAS; pendingScale.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fill(); }); }
    // ── dead zones (outlined + labeled) ──
    if (showHeat && coverage) for (const g of coverage.gaps) {
      ctx.strokeStyle = '#F87171'; ctx.lineWidth = 3; ctx.setLineDash([11, 7]);
      rr(ctx, g.bbox.x, g.bbox.y, g.bbox.w, g.bbox.h, 10); ctx.stroke(); ctx.setLineDash([]);
      chip(ctx, `DEAD ZONE · ${Math.round(g.area)} ft²`, g.bbox.x + g.bbox.w / 2, Math.max(14, g.bbox.y - 4), '#F87171');
    }
    // ── co-channel interference overlay (grounded low-SIR cells, hatched) ──
    if (showInterference && interference) {
      const sx = cv.width / interference.cols, sy = cv.height / interference.rows;
      const hc = document.createElement('canvas'); hc.width = 9; hc.height = 9;
      const hx = hc.getContext('2d')!; hx.strokeStyle = 'rgba(248,113,113,0.9)'; hx.lineWidth = 1.6;
      hx.beginPath(); hx.moveTo(0, 9); hx.lineTo(9, 0); hx.moveTo(-2, 2); hx.lineTo(2, -2); hx.moveTo(7, 11); hx.lineTo(11, 7); hx.stroke();
      const pat = ctx.createPattern(hc, 'repeat');
      const paint = (style: string | CanvasPattern) => {
        ctx.fillStyle = style;
        for (let r = 0; r < interference.rows; r++) for (let c = 0; c < interference.cols; c++) {
          if (interference.mask[r * interference.cols + c]) ctx.fillRect(c * sx, r * sy, sx + 0.6, sy + 0.6);
        }
      };
      paint('rgba(248,113,113,0.12)');
      if (pat) paint(pat);
    }
    // ── RSSI iso-contours (marching squares) ──
    if (showContours && coverage && project.activeType === 'wifi_ap') {
      const sx = cv.width / coverage.cols, sy = cv.height / coverage.rows;
      // contour colors SAMPLED from the shared ramp — they can never invert against the heat again
      const levels = [-55, -65, -72, -80].map((dbm) => ({ dbm, c: `rgb(${rssiRgb(dbm).join(',')})` }));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const lv of levels) {
        const segs = isoLines(coverage, lv.dbm, sx, sy);
        ctx.strokeStyle = 'rgba(13,17,23,0.55)'; ctx.lineWidth = 4.5; ctx.beginPath();
        for (const s of segs) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); } ctx.stroke();
        ctx.strokeStyle = lv.c; ctx.lineWidth = 2.2; ctx.beginPath();
        for (const s of segs) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); } ctx.stroke();
      }
    }
    // ── devices (aim cone / DORI bands + marker + label) ──
    for (const d of project.devices) {
      if (layerVis[deviceLayerKey(d.typeId)] === false) continue; // layer hidden → skip
      const def = defOf(d.typeId); const sel = d.id === selId;
      const pxPerFt = project.scale?.pxPerFt ?? 0;
      if (def.modelType === 'camera') {
        const aim = (d.aimDeg ?? 0) * Math.PI / 180;
        const hfov = d.hfovDeg ?? 68; const half = (hfov / 2) * Math.PI / 180;
        const RED = SYSTEM_COLORS.camera;
        if (showDori && pxPerFt > 0) {
          const hpx = d.resolutionPx ?? 2688;
          const rDetect = doriDistanceFt(hpx, hfov, 25) * pxPerFt;
          if (sel) {
            // FULL graded DORI only for the SELECTED camera (toned so it never washes the plan)
            const zones = ([
              { ppm: 250, a: 0.13, label: 'Identify' }, { ppm: 125, a: 0.09, label: 'Recognize' },
              { ppm: 62.5, a: 0.06, label: 'Observe' }, { ppm: 25, a: 0.04, label: 'Detect' },
            ]).map((z) => ({ ...z, rPx: doriDistanceFt(hpx, hfov, z.ppm) * pxPerFt })).sort((a, b) => b.rPx - a.rPx);
            for (const z of zones) { ctx.fillStyle = hexA(RED, z.a); ctx.beginPath(); ctx.moveTo(d.pos.x, d.pos.y); ctx.arc(d.pos.x, d.pos.y, z.rPx, aim - half, aim + half); ctx.closePath(); ctx.fill(); }
            for (const z of zones) { ctx.strokeStyle = hexA(RED, 0.55); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(d.pos.x, d.pos.y, z.rPx, aim - half, aim + half); ctx.stroke(); }
            for (const z of zones) { const lx = d.pos.x + Math.cos(aim) * z.rPx, ly = d.pos.y + Math.sin(aim) * z.rPx; chip(ctx, `${z.label} ${Math.round(z.rPx / pxPerFt)}ft`, lx, ly, 'rgba(13,17,23,0.92)', RED); }
          } else {
            // UNSELECTED: a thin cone HINT only (whisper fill + crisp outline) — cameras never dominate the map
            ctx.fillStyle = hexA(RED, 0.05); ctx.beginPath(); ctx.moveTo(d.pos.x, d.pos.y); ctx.arc(d.pos.x, d.pos.y, rDetect, aim - half, aim + half); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = hexA(RED, 0.5); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(d.pos.x, d.pos.y); ctx.arc(d.pos.x, d.pos.y, rDetect, aim - half, aim + half); ctx.closePath(); ctx.stroke();
          }
        }
      } else if (def.modelType === 'fov') {
        const aim = (d.aimDeg ?? 0) * Math.PI / 180;
        const half = ((d.coverageAngleDeg ?? 68) / 2) * Math.PI / 180;
        const rPx = (d.rangeFt ?? 40) * (pxPerFt || 3);
        // subtle sensor wedge — hint unless selected (was 0.67 fill → washed the plan)
        const grad = ctx.createRadialGradient(d.pos.x, d.pos.y, 4, d.pos.x, d.pos.y, rPx);
        grad.addColorStop(0, def.color + (sel ? '30' : '14')); grad.addColorStop(1, def.color + '00');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(d.pos.x, d.pos.y); ctx.arc(d.pos.x, d.pos.y, rPx, aim - half, aim + half); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = def.color + '80'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(d.pos.x, d.pos.y); ctx.arc(d.pos.x, d.pos.y, rPx, aim - half, aim + half); ctx.closePath(); ctx.stroke();
      }
      // minimal crisp pin: dark disc + 2px system-color ring + tiny white center dot
      const rDisc = sel ? 9 : 7.5;
      ctx.save();
      if (sel) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 8; }
      ctx.beginPath(); ctx.arc(d.pos.x, d.pos.y, rDisc, 0, 7); ctx.fillStyle = '#0a0a0a'; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(d.pos.x, d.pos.y, rDisc, 0, 7);
      ctx.strokeStyle = def.color; ctx.lineWidth = sel ? 3 : 2; ctx.stroke();
      if (sel) { ctx.beginPath(); ctx.arc(d.pos.x, d.pos.y, rDisc + 3, 0, 7); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(d.pos.x, d.pos.y, 1.7, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      // compact label chip only where useful (APs always; anything selected) — avoids label pile-up
      if (d.typeId === 'wifi_ap' || sel)
        chip(ctx, (d.label || def.short) + (d.channel != null ? ` · ch${d.channel}` : ''), d.pos.x, d.pos.y + rDisc + 15, 'rgba(13,17,23,0.92)', def.color);
    }
    // ── MEASURED SURVEY overlay (validated-against-reality): measured signal dots + predicted-vs-actual delta badges ──
    if (showMeasured && project.activeType === 'wifi_ap' && measured.length > 0) {
      for (const mp of measured) {
        const [mr, mg, mb] = rssiRgb(mp.measuredDbm); // same green→amber→red ramp as the coverage heat
        // measured signal dot (diamond-in-ring so it reads as a survey pin, distinct from AP markers)
        ctx.beginPath(); ctx.arc(mp.x, mp.y, 9, 0, 7);
        ctx.fillStyle = `rgb(${mr},${mg},${mb})`; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(mp.x, mp.y, 3, 0, 7); ctx.fillStyle = 'rgba(13,17,23,0.85)'; ctx.fill();
        // measured dBm label below the pin
        chip(ctx, `${mp.measuredDbm} dBm`, mp.x, mp.y + 24, 'rgba(13,17,23,0.92)', `rgb(${mr},${mg},${mb})`);
        // predicted-vs-actual delta badge (upper-right): gold = model over-predicts, red = signal worse than modeled, slate = within ±3 dB
        const pred = inspectAt({ x: mp.x, y: mp.y }, project).value;
        if (Number.isFinite(pred)) {
          const delta = pred - mp.measuredDbm;
          const dc = Math.abs(delta) <= 3 ? '#94A3B8' : delta > 0 ? '#FBBF24' : '#F87171';
          const txt = `${delta > 0 ? '+' : ''}${delta.toFixed(0)}`;
          const bx = mp.x + 15, by = mp.y - 15;
          ctx.font = 'bold 11px system-ui';
          const tw = ctx.measureText(txt).width; const bw = tw + 12, bh = 17;
          ctx.fillStyle = 'rgba(13,17,23,0.92)'; rr(ctx, bx - bw / 2, by - bh / 2, bw, bh, 8); ctx.fill();
          ctx.strokeStyle = dc; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = dc; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx, by);
        }
      }
    }
    // ── scale bar ──
    if (project.scale) {
      const target = 140; // aim ~140 px
      const niceFt = [5, 10, 20, 25, 50, 100, 200].reduce((best, f) => Math.abs(f * project.scale!.pxPerFt - target) < Math.abs(best * project.scale!.pxPerFt - target) ? f : best, 10);
      const barPx = niceFt * project.scale.pxPerFt;
      const bx = 22, by = cv.height - 30;
      ctx.fillStyle = 'rgba(13,17,23,0.82)'; rr(ctx, bx - 10, by - 22, barPx + 20, 40, 8); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + barPx, by); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx, by - 6); ctx.lineTo(bx, by + 6); ctx.moveTo(bx + barPx, by - 6); ctx.lineTo(bx + barPx, by + 6); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(`${niceFt} ft`, bx + barPx / 2, by - 5);
    }
  }, [project, coverage, heatComposite, showHeat, showContours, showInterference, showDori, showCabling, cableRuns, showMeasured, showRoam, showConfidence, measured, interference, pendingWall, pendingScale, selId, layerVis]);

  // ── survey model-accuracy: mean-abs-error + worst point (predicted vs measured), computed live so it works pre-calibration too ──
  const accuracy = useMemo(() => {
    if (!project || project.activeType !== 'wifi_ap' || !measured.length) return null;
    let sumAbs = 0, n = 0;
    let worst: { mp: MeasuredPoint; delta: number } | null = null;
    for (const mp of measured) {
      const pred = inspectAt({ x: mp.x, y: mp.y }, project).value;
      if (!Number.isFinite(pred)) continue;
      const delta = pred - mp.measuredDbm;
      sumAbs += Math.abs(delta); n++;
      if (!worst || Math.abs(delta) > Math.abs(worst.delta)) worst = { mp, delta };
    }
    return n ? { mae: sumAbs / n, worst: worst!, n } : null;
  }, [project, measured]);

  const stats = coverage?.stats;
  const sel = project?.devices.find((d) => d.id === selId) || null;

  // ── network-capacity estimates (throughput band · client capacity · PoE draw vs budget) ──
  const capAps = project?.devices.filter((d) => d.typeId === 'wifi_ap') ?? [];
  const capAvgPeak = capAps.length ? capAps.reduce((s, a) => s + BAND_PEAK_MBPS[(a.band || '5') as Band], 0) / capAps.length : BAND_PEAK_MBPS['5'];
  const tpHigh = round5(capAvgPeak * rssiThroughputEff(-50));                        // near an AP (strong signal)
  const tpLow = round5(capAvgPeak * rssiThroughputEff(project?.rssiTargetDbm ?? -67)); // at the coverage-target edge
  const capTotal = capAps.length * clientsPerAp;
  const poeWatts = bom?.poeWatts ?? 0;
  const poeBudget = bom?.recSwitch?.poeBudgetW ?? 0;
  const poeUtil = poeBudget ? poeWatts / poeBudget : 0;
  const poeColor = poeUtil > 0.9 ? '#F87171' : poeUtil > 0.7 ? GOLD : '#4ADE80';

  /* ── export ── */
  const exportPng = () => {
    if (!project) return;
    const out = document.createElement('canvas'); out.width = project.imgW; out.height = project.imgH;
    const ctx = out.getContext('2d')!; const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0); ctx.drawImage(canvasRef.current!, 0, 0);
      const a = document.createElement('a'); a.href = out.toDataURL('image/png'); a.download = `${project.name}-coverage.png`; a.click();
    };
    img.src = project.planDataUrl;
  };

  /* ── AI blueprint scan → auto-mark ──
     Reads the plan geometry (footprint, walls, scale) AND places devices. The plan is
     downscaled before upload so large/dense sheets don't blow the request-body limit
     (the #1 cause of "scan does nothing"); returned coords are mapped back to full-res. */
  const doAiScan = async () => {
    if (!project) return;
    setBusy('AI is reading the blueprint…'); setAiNotes([]);
    try {
      // Downscale (long edge ≤ 1600px) → JPEG so the base64 body stays small.
      const cap = 1600;
      const sc = Math.min(1, cap / Math.max(project.imgW, project.imgH));
      const sw = Math.max(1, Math.round(project.imgW * sc)), sh = Math.max(1, Math.round(project.imgH * sc));
      const small = await new Promise<string>((resolve, reject) => {
        const im = new Image();
        im.onload = () => { const cv = document.createElement('canvas'); cv.width = sw; cv.height = sh; cv.getContext('2d')!.drawImage(im, 0, 0, sw, sh); resolve(cv.toDataURL('image/jpeg', 0.82)); };
        im.onerror = () => reject(new Error('could not read the plan image'));
        im.src = project.planDataUrl;
      });
      // AI reads the downscaled px per foot; convert back to full-res pxPerFt.
      const smallPxPerFt = project.scale ? project.scale.pxPerFt * sc : undefined;
      const res = await fetch('/api/heatmap/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: small, imgW: sw, imgH: sh, pxPerFt: smallPxPerFt, goals: 'WiFi coverage, security cameras, motion + smoke detection, access control' }),
      });
      const data = await res.json();
      if (!data.ok) {
        console.error('AI scan failed', res.status, data.error);
        /* Was a generic "Try again in a moment." regardless of what the server
           said. When the reason is that the account behind the scan has no
           credit, "try again in a moment" is advice that can never work, and
           it sent people back to re-export their drawings for a problem no
           drawing could fix. The server's own sentence is written for a user;
           413 is the one case worth answering locally, because only the client
           knows the file was large. */
        setAiNotes([
          res.status === 413
            ? 'The plan is very large — export it as a PNG at a smaller size and try again.'
            : data.error || "The AI scan couldn't run. Try again in a moment.",
        ]);
        setBusy('');
        return;
      }

      const inv = sc > 0 ? 1 / sc : 1;            // downscaled px → full-res px
      const cx = (x: number) => Math.max(0, Math.min(project.imgW, x * inv));
      const cy = (y: number) => Math.max(0, Math.min(project.imgH, y * inv));

      const added: Device[] = (data.devices || [])
        .filter((d: { typeId: DeviceTypeId }) => !!DEVICE_REGISTRY[d.typeId]) // drop unknown typeIds BEFORE makeDevice (else it throws)
        .map((d: { typeId: DeviceTypeId; x: number; y: number; aimDeg?: number; label?: string }) => {
          const dev = makeDevice(d.typeId, { x: cx(d.x), y: cy(d.y) });
          if (typeof d.aimDeg === 'number') dev.aimDeg = d.aimDeg;
          if (d.label) dev.label = d.label;
          return dev;
        });

      const okMat = (m: unknown): m is WallMaterialId => typeof m === 'string' && Object.prototype.hasOwnProperty.call(WALL_MATERIALS, m);
      const newWalls: Wall[] = (Array.isArray(data.walls) ? data.walls : [])
        .filter((w: { x1: number; y1: number; x2: number; y2: number }) => [w.x1, w.y1, w.x2, w.y2].every((n) => typeof n === 'number'))
        .map((w: { x1: number; y1: number; x2: number; y2: number; material?: string }) => ({ id: uid(), a: { x: cx(w.x1), y: cy(w.y1) }, b: { x: cx(w.x2), y: cy(w.y2) }, material: okMat(w.material) ? w.material : 'drywall' }));

      const bpts: Pt[] = (Array.isArray(data.boundary) ? data.boundary : [])
        .filter((p: { x: number; y: number }) => typeof p?.x === 'number' && typeof p?.y === 'number')
        .map((p: { x: number; y: number }) => ({ x: cx(p.x), y: cy(p.y) }));
      const newBoundary = bpts.length >= 3 ? bpts : undefined;

      const detectedFullPxPerFt = (typeof data.pxPerFt === 'number' && data.pxPerFt > 0) ? data.pxPerFt * inv : null;

      snapshot();
      setProject((p) => p ? {
        ...p,
        scale: p.scale ?? (detectedFullPxPerFt ? { pxPerFt: detectedFullPxPerFt } : null),
        boundary: newBoundary ?? p.boundary,
        walls: newWalls.length ? [...p.walls, ...newWalls] : p.walls,
        devices: [...p.devices, ...added],
      } : p);

      const notes: string[] = [];
      const traced: string[] = [];
      if (added.length) traced.push(`${added.length} device${added.length === 1 ? '' : 's'}`);
      if (newWalls.length) traced.push(`${newWalls.length} wall${newWalls.length === 1 ? '' : 's'}`);
      if (newBoundary) traced.push('the building outline');
      notes.push(traced.length ? `Added ${traced.join(', ')} — review & adjust.` : 'Scan ran but found nothing to place — try a clearer, higher-contrast plan export.');
      if (!project.scale && detectedFullPxPerFt) notes.push(`Detected scale ≈ ${detectedFullPxPerFt.toFixed(1)} px/ft — coverage is now dimensioned. Fine-tune with the Scale tool if it looks off.`);
      else if (!project.scale && !detectedFullPxPerFt) notes.push('No scale bar found on the plan — set the scale with the Scale tool so coverage % and AP spacing are accurate.');
      setAiNotes([...notes, ...(Array.isArray(data.notes) ? data.notes : [])]);
    } catch (e) { console.error(e); setAiNotes(['Scan failed. Please try again.']); }
    setBusy('');
  };

  /* ── printable GC report (marked-up plan + metrics + BOM) ── */
  const exportReport = async () => {
    if (!project || !bom) return;
    const s = coverage?.stats;
    const rowsHtml = bom.rows.map((r) => `<tr><td>${r.item}</td><td class="c">${r.qty}</td><td class="r">${r.unit ? '$' + r.unit.toLocaleString() : '—'}</td><td class="r">${r.ext ? '$' + r.ext.toLocaleString() : '—'}</td></tr>`).join('');
    const netHtml = sched && sched.rows.length
      ? `<h2>Network schedule — IP · VLAN · switch port</h2>
         <p style="font-size:12px;color:#555;margin:0 0 8px">${sched.vlans.map((v) => `${v.name} — VLAN ${v.id} (${v.subnet}.0/24)`).join(' &nbsp;·&nbsp; ')}</p>
         <table><thead><tr><th>Device</th><th>VLAN</th><th>IP Address</th><th>Switch Port</th><th class="r">PoE</th></tr></thead>
         <tbody>${sched.rows.map((r) => `<tr><td>${r.label}</td><td>${r.vlan.id} · ${r.vlan.name}</td><td>${r.ip}</td><td>${r.port}</td><td class="r">${r.poeW ? r.poeW + ' W' : '—'}</td></tr>`).join('')}</tbody>
         <tfoot><tr><td>${sched.poePorts} PoE ports</td><td></td><td></td><td></td><td class="r">${sched.poeTotal} W</td></tr></tfoot></table>`
      : '';
    // ── AP power-setting schedule (Full/Half by spacing) ──
    const pxPerFt = project.scale?.pxPerFt || 10;
    const aps = project.devices.filter((d) => d.typeId === 'wifi_ap');
    const nnFt = (ap: Device) => { let m = Infinity; for (const o of aps) if (o !== ap) m = Math.min(m, dist(ap.pos, o.pos) / pxPerFt); return m === Infinity ? null : m; };
    const powerHtml = aps.length ? `<div class="sect"><h2>Access-Point Power Settings</h2>
      <table><thead><tr><th>AP</th><th>Nearest AP</th><th>Power</th><th>Why</th></tr></thead><tbody>${aps.map((ap, i) => {
        const nn = nnFt(ap); const half = nn != null && nn < 45;
        return `<tr><td><b>${ap.label || 'AP ' + (i + 1)}</b>${ap.channel != null ? ` · ch ${ap.channel}` : ''}</td><td>${nn != null ? Math.round(nn) + ' ft' : 'isolated'}</td><td><b style="color:${half ? '#a8620a' : '#137a3f'}">${half ? 'Half (50%)' : 'Full (100%)'}</b></td><td style="color:#555;font-size:12px">${half ? 'Overlaps a neighbour closely — half power trims co-channel interference and improves roaming.' : 'Well spaced — full power to reach the edges of its cell.'}</td></tr>`;
      }).join('')}</tbody></table></div>` : '';
    // ── cable & termination schedule (rack = a gateway/switch if placed, else plan center) ──
    const idfDev = project.devices.find(isIdfDevice);
    const rack = idfDev?.pos || (project.devices.find((d) => d.typeId === 'iot_gateway' || d.typeId === 'smart_switch')?.pos) || { x: project.imgW / 2, y: project.imgH / 2 };
    const cs = summarizeCables(project, rack);
    const cabRows = project.devices.filter((d) => recommendCabling(d.typeId).dataCable || recommendCabling(d.typeId).powerCable);
    const cableHtml = cabRows.length ? `<div class="sect"><h2>Cable &amp; Termination Schedule</h2>
      <table><thead><tr><th>Device</th><th>Run</th><th>Cable</th><th>Termination</th></tr></thead><tbody>${cabRows.map((d) => {
        const len = runLengthFt(d.pos, rack, pxPerFt); const rec = recommendCabling(d.typeId, { distanceFt: len });
        const cab = rec.dataCable ? rec.dataCable.name : (rec.powerCable ? rec.powerCable.name : '—');
        return `<tr><td><b>${d.label || defOf(d.typeId).short}</b></td><td>${len} ft</td><td>${cab}</td><td style="color:#555;font-size:12px">${rec.termination}</td></tr>`;
      }).join('')}</tbody></table>
      <p style="font-size:13px;margin-top:8px"><b>Cable materials:</b> ${cs.byCable.map((c) => `${c.cable.name} ${c.feet.toLocaleString()} ft ($${c.cost.toLocaleString()})`).join(' · ')} &nbsp;—&nbsp; <b>~$${cs.totalCost.toLocaleString()}</b> est. ${cs.totalFeet.toLocaleString()} ft total (incl. 35% routing/drop allowance).</p>
      <p style="font-size:13px;margin-top:4px"><b>Order footage:</b> ${cs.byCable.map((c) => `${c.cable.name} ${(Math.ceil(c.feet / 1000) * 1000).toLocaleString()} ft`).join(' · ')} — next full 1,000 ft box per cable type. ${idfDev ? 'Runs measured on the plan to the placed IDF.' : 'Runs measured to the assumed head-end — place an IDF on the plan to pin them.'}</p></div>` : '';

    // ── cinematic hero image(s): one per floor (best-server field), active floor first ──
    const planFloors = floors.filter((f) => f.proj);
    const multi = floors.length > 1 && planFloors.length > 1;
    const heroes = await Promise.all(floors.map(async (f) => {
      if (!f.proj) return { id: f.id, name: f.name, url: '', cov: null as CoverageResult | null };
      const overlay = f.id === activeFloor ? canvasRef.current : null;
      const h = await buildHeroImage(f.proj, overlay);
      return { id: f.id, name: f.name, url: h.url, cov: h.cov };
    }));
    const activeHero = heroes.find((h) => h.id === activeFloor);
    const planImg = activeHero?.url || '';

    // plain-English verdict (uses the live coverage, or the active floor's cinematic coverage as fallback)
    const covStats = s ?? activeHero?.cov?.stats ?? null;
    const summary = multi ? summarizeBuilding(floors.map((f) => ({ id: f.id, name: f.name, project: f.proj }))) : null;
    // Combined bill of materials across ALL floors (the itemized BOM below is active-floor
    // only; a multi-floor building must not undercount what the owner/bidder costs from).
    const combinedBom = multi ? computeBom(planFloors.flatMap((f) => f.proj!.devices)) : null;
    const combinedBomHtml = combinedBom ? `<div class="sect"><h2>Combined bill of materials — all ${planFloors.length} floors</h2>
      <table><thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Unit</th><th class="r">Ext</th></tr></thead>
      <tbody>${combinedBom.rows.map((r) => `<tr><td>${r.item}</td><td class="c">${r.qty}</td><td class="r">${r.unit ? '$' + r.unit.toLocaleString() : '—'}</td><td class="r">${r.ext ? '$' + r.ext.toLocaleString() : '—'}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Building total (hardware, est.)</td><td></td><td></td><td class="r">$${combinedBom.total.toLocaleString()}</td></tr></tfoot></table>
      <p style="font-size:13px">Building PoE load ≈ <b>${combinedBom.poeWatts} W</b> · <b>${combinedBom.cat6Runs}</b> Cat6 home-runs across all floors.</p></div>` : '';
    const vpct = summary ? summary.avgCoveragePct : (covStats ? Math.round(covStats.pctCovered) : null);
    const apCount = summary ? summary.totalAps : aps.length;
    const dz = summary ? summary.totalDeadZones : (covStats ? covStats.deadZones : 0);
    const grade = vpct == null ? '' : vpct >= 90 ? 'Strong, reliable' : vpct >= 75 ? 'Solid, dependable' : vpct >= 60 ? 'Workable but uneven' : 'Limited';
    const verdict = vpct == null ? ''
      : `${grade} Wi-Fi across <b>${vpct}%</b> of ${multi ? 'the building' : 'the floor'} with <b>${apCount}</b> access point${apCount === 1 ? '' : 's'}${dz ? ` — <b>${dz}</b> area${dz === 1 ? '' : 's'} still need${dz === 1 ? 's' : ''} attention.` : ' and no dead zones.'} <span style="font-weight:600;color:#6b7688">Predictive model — validate with a walk-test.</span>`;
    // ── the report SHOWS the engineering math, never bare claims: density line + per-AP justification ──
    const dflag = getDensityFlag(project);
    const covForAps = coverage ?? activeHero?.cov ?? null;
    const servedFt2 = (apId: string): number | null => {
      if (!covForAps || covForAps.stats.activeType !== 'wifi_ap' || !project.scale) return null;
      let cells = 0; for (const c of covForAps.cells) if (c && c.covered && c.serverId === apId) cells++;
      const cellFt = covForAps.cellPx / project.scale.pxPerFt;
      return Math.round(cells * cellFt * cellFt);
    };
    const densityHtml = dflag.areaFt2 > 0 && aps.length
      ? `<p style="font-size:13px;margin:0 2px 16px;color:#333"><b>Density check:</b> ${aps.length} AP${aps.length === 1 ? '' : 's'} on ${dflag.areaFt2.toLocaleString()} ft² = 1 AP per ${Math.round(dflag.areaFt2 / aps.length).toLocaleString()} ft² — engineering ceiling 1 AP / 1,500 ft² (max ${dflag.capAps} for this floor)${dflag.flagged ? ' — <b style="color:#b42318">over the cap, re-design recommended</b>' : ' — within the cap'}.</p>`
      : '';
    const apJustHtml = aps.length ? `<div class="sect"><h2>Access points — why each one is there</h2>
      <table><thead><tr><th>AP</th><th class="r">Area Served</th><th class="r">Spacing</th><th class="c">Band</th><th class="r">Tx Power</th></tr></thead>
      <tbody>${aps.map((ap, i) => {
        const nn = nnFt(ap); const a = servedFt2(ap.id);
        return `<tr><td><b>${ap.label || 'AP ' + (i + 1)}</b>${ap.channel != null ? ` · ch ${ap.channel}` : ''}</td><td class="r">${a != null ? a.toLocaleString() + ' ft²' : '—'}</td><td class="r">${nn != null ? Math.round(nn) + ' ft to nearest' : 'only AP'}</td><td class="c">${ap.band || '5'} GHz</td><td class="r">${ap.txPowerDbm ?? 15} dBm</td></tr>`;
      }).join('')}</tbody></table>
      <p style="font-size:12px;color:#555;margin-top:6px">Area served = floor cells where this AP is the strongest signal (best-server model${covForAps ? `, ${covForAps.cellPx} px grid` : ''}). Spacing is center-to-center on the plan.</p></div>` : '';

    // ── building-wide summary section (multi-floor only) ──
    const buildingHtml = summary ? `<div class="sect"><h2>Building Summary</h2>
      <div class="cards">
        <div class="card"><div class="k">Floors</div><div class="v">${summary.floorCount}</div></div>
        <div class="card"><div class="k">Avg Coverage</div><div class="v">${summary.avgCoveragePct}%</div></div>
        <div class="card"><div class="k">Total Area</div><div class="v">${summary.totalAreaFt2.toLocaleString()}<span style="font-size:12px;font-weight:600"> ft²</span></div></div>
        <div class="card"><div class="k">Devices</div><div class="v">${summary.totalDevices}</div></div>
        <div class="card"><div class="k">Access Points</div><div class="v">${summary.totalAps}</div></div>
        <div class="card"><div class="k">Cameras</div><div class="v">${summary.totalCameras}</div></div>
        <div class="card"><div class="k">Combined BOM</div><div class="v">$${summary.bom.total.toLocaleString()}</div></div>
      </div>
      <table style="margin-top:12px"><thead><tr><th>Floor</th><th class="r">Area</th><th class="c">Coverage</th><th class="c">Devices</th><th class="c">APs</th><th class="c">Dead Zones</th></tr></thead>
      <tbody>${summary.floors.map((fl) => `<tr><td><b>${fl.name}</b>${fl.hasPlan ? '' : ' <span style="color:#999">(no plan)</span>'}</td><td class="r">${fl.areaFt2 ? fl.areaFt2.toLocaleString() + ' ft²' : '—'}</td><td class="c">${fl.hasScale && fl.apCount ? fl.coveragePct + '%' : '—'}</td><td class="c">${fl.deviceCount}</td><td class="c">${fl.apCount}</td><td class="c">${fl.deadZones}</td></tr>`).join('')}</tbody></table></div>` : '';

    // ── per-floor hero maps (multi) or the single active hero ──
    const heroSectionHtml = multi
      ? `<div class="sect"><h2>Floor Coverage Maps</h2>${heroes.map((h) => {
          const st = h.cov?.stats; const cap = st ? `${Math.round(st.pctCovered)}% covered · ${st.deviceCount} device${st.deviceCount === 1 ? '' : 's'} · ${st.deadZones} dead zone${st.deadZones === 1 ? '' : 's'}` : 'No coverage layer on this floor';
          return h.url ? `<div class="floorblock"><div class="floortitle">${h.name} <span>— ${cap}</span></div><img class="plan" src="${h.url}"/></div>` : '';
        }).join('')}</div>`
      : `<img class="plan" src="${planImg}"/>`;

    const dstr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const html = (`<!doctype html><html><head><title>${project.name} — Coverage Report</title><style>
      @page{margin:14mm}
      *{box-sizing:border-box}
      body{font-family:system-ui,'Segoe UI',sans-serif;color:#111;margin:0}
      .wrap{max-width:940px;margin:0 auto;padding:0 4px}
      .band{background:linear-gradient(100deg,#0a0a0a,#161b22);color:#fff;padding:20px 26px;display:flex;align-items:center;gap:16px;border-radius:0 0 4px 4px}
      .mark{width:38px;height:38px;flex:0 0 38px}
      .band h1{font-size:19px;margin:0;font-weight:800;letter-spacing:.2px}
      .band .tag{color:#FFE000;font-size:12px;font-weight:700}
      .meta{color:#555;font-size:13px;margin:14px 2px 12px;display:flex;flex-wrap:wrap;gap:4px 18px}
      .meta b{color:#111}
      .verdict{font-size:15px;line-height:1.5;color:#1a2232;background:#f7f9fc;border:1px solid #E4E4E7;border-left:4px solid #FFE000;border-radius:10px;padding:13px 16px;margin:0 2px 16px}
      .verdict b{color:#0a0a0a}
      img.plan{width:100%;border:1px solid #d5d9de;border-radius:8px;margin-top:4px}
      .floorblock{page-break-inside:avoid;margin-top:12px}
      .floortitle{font-size:13px;font-weight:800;color:#0a0a0a;margin:0 0 4px}.floortitle span{font-weight:600;color:#6b7688}
      h2{font-size:12px;margin:26px 0 8px;color:#0a0a0a;border-bottom:2px solid #FFE000;padding-bottom:5px;display:inline-block}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-top:2px} td,th{border-bottom:1px solid #e7e9ec;padding:7px 9px}
      th{text-align:left;background:#f4f5f7;font-size:12px;color:#555}
      .c{text-align:center}.r{text-align:right;font-variant-numeric:tabular-nums}
      tfoot td{font-weight:800;border-top:2px solid #0a0a0a;background:#fafbfc}
      .cards{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px}
      .card{flex:1;min-width:120px;border:1px solid #e7e9ec;border-radius:8px;padding:11px 13px;background:#fafbfc}
      .card .k{font-size:12px;color:#777}
      .card .v{font-size:22px;font-weight:800;color:#0a0a0a;margin-top:3px}
      .sect{page-break-inside:avoid}
      .note{color:#888;font-size:12px;margin-top:22px;border-top:1px solid #e7e9ec;padding-top:10px}
      .foot{color:#aab;font-size:12px;text-align:center;margin:14px 0 24px}
    </style></head><body><div class="wrap">
      <div class="band">
        <svg class="mark" viewBox="0 0 24 24" fill="none" stroke="#FFE000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M12 9c0-2 -1.6-3.5 -3.5-3.5S5 7 5 9v3c0 1.4 1.1 2.5 2.5 2.5S10 13.4 10 12M12 12c0-2 1.6-3.5 3.5-3.5S19 10 19 12v2c0 1.4-1.1 2.5-2.5 2.5S14 15.4 14 14"/></svg>
        <div><div class="tag">Saguaro Control Systems</div><h1>Coverage Design Report</h1></div>
      </div>
      <div class="meta"><span>Project: <b>${project.name}</b></span><span>Layer: <b>${DEVICE_REGISTRY[project.activeType].label}</b></span><span>Environment: <b>${project.env}</b></span>${multi ? `<span>Floors: <b>${summary!.floorCount}</b></span>` : ''}<span>Date: <b>${dstr}</b></span></div>
      ${verdict ? `<div class="verdict">${verdict}</div>` : ''}
      ${densityHtml}
      ${buildingHtml}
      ${heroSectionHtml}
      <div class="sect"><h2>${multi ? `Active floor — ${activeHero?.name || project.name}` : 'Coverage Metrics'}</h2>
      <div class="cards">
        <div class="card"><div class="k">Coverage</div><div class="v">${s ? s.pctCovered.toFixed(0) : (activeHero?.cov ? Math.round(activeHero.cov.stats.pctCovered) : '—')}%</div></div>
        <div class="card"><div class="k">Health</div><div class="v">${s ? s.healthScore : (activeHero?.cov ? activeHero.cov.stats.healthScore : '—')}</div></div>
        <div class="card"><div class="k">Devices</div><div class="v">${project.devices.length}</div></div>
        <div class="card"><div class="k">Dead Zones</div><div class="v">${s ? s.deadZones : (activeHero?.cov ? activeHero.cov.stats.deadZones : 0)}</div></div>
        <div class="card"><div class="k">Dead Area</div><div class="v">${s ? Math.round(s.deadArea) : (activeHero?.cov ? Math.round(activeHero.cov.stats.deadArea) : 0)}<span style="font-size:12px;font-weight:600"> ft²</span></div></div>
      </div></div>
      ${combinedBomHtml}
      <div class="sect"><h2>${multi ? 'Bill of Materials — Active Floor' : 'Bill of Materials'}</h2>
      <table><thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Unit</th><th class="r">Ext</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr><td>Total (hardware, est.)</td><td></td><td></td><td class="r">$${bom.total.toLocaleString()}</td></tr></tfoot></table></div>
      <div class="sect"><h2>Cabling &amp; Power</h2>
      <p style="font-size:13px">PoE load ≈ <b>${bom.poeWatts} W</b> · <b>${bom.cat6Runs}</b> Cat6 home-runs · recommended switch: <b>${bom.recSwitch?.model || '—'}</b> (${bom.recSwitch?.poeBudgetW || 0} W budget)${bom.recNvr ? ` · recorder: <b>${bom.recNvr.model}</b>` : ''}</p></div>
      ${apJustHtml}
      ${powerHtml}
      ${cableHtml}
      <div class="sect">${netHtml}</div>
      <p class="note">${calibrationNote(calResult)} Coverage % is a predictive RF model — validate with an on-site walk-test before closeout. Camera ranges per EN 62676-4 DORI. Prices are estimates; confirm current pricing, PoE budget, licensing and retention before ordering.</p>
      <div class="foot">Generated by Saguaro Control Systems · Signal Studio · ${engineStamp(project)}</div>
    </div></body></html>`);
    printHtml(html, `${project.name} — Coverage Report`)
      .catch((e) => { console.error(e); showToast("Couldn't open the coverage report to print. Try again.", 'error'); });
  };

  /* ── save / open (persist to the correct project) ── */
  const openSaveModal = async () => {
    if (!project) return;
    setSaveName((s) => s || project.name);
    if (!saveProj && projectId) setSaveProj(projectId); // shell prop — never a localStorage guess
    setModal('save'); setSaveMsg('');
    if (!projList.length) { try { const r = await fetch('/api/projects/list'); const d = await r.json(); setProjList(d.projects || d.data || []); } catch { /* */ } }
  };
  const doSave = async () => {
    if (!project) return;
    setSaveMsg('Saving…');
    try {
      const r = await fetch('/api/heatmap/designs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: savedId, projectId: saveProj || null, name: saveName || project.name, data: { multifloor: true, floors: floors.map((f) => ({ id: f.id, name: f.name, proj: f.proj })), activeFloor }, coveragePercent: coverage?.stats.pctCovered ?? null, deviceCount: floors.reduce((s, f) => s + (f.proj?.devices.length ?? 0), 0), activeType: project.activeType }),
      });
      const d = await r.json();
      if (d.error) { console.error('save design error', d.error); setSaveMsg(humanError(d.error, "Couldn't save to the project. Please try again.")); return; }
      setSavedId(d.id); dirtyRef.current = false; setSaveMsg('✓ Saved to project'); setTimeout(() => setModal('none'), 1000);
    } catch (e) { console.error(e); setSaveMsg(humanError(e, "Couldn't save to the project. Please try again.")); }
  };
  // Silent server autosave: once a design has been saved at least once, persist edits
  // every 12s while there are unsaved changes (belt-and-suspenders with the unload guard).
  const autosaveBodyRef = useRef<Record<string, unknown> | null>(null);
  autosaveBodyRef.current = project ? { id: savedId, projectId: saveProj || null, name: saveName || project.name, data: { multifloor: true, floors: floors.map((f) => ({ id: f.id, name: f.name, proj: f.proj })), activeFloor }, coveragePercent: coverage?.stats.pctCovered ?? null, deviceCount: floors.reduce((s, f) => s + (f.proj?.devices.length ?? 0), 0), activeType: project.activeType } : null;
  const savedIdRef = useRef(savedId); savedIdRef.current = savedId;
  useEffect(() => {
    const iv = setInterval(() => {
      if (!dirtyRef.current || !savedIdRef.current || !autosaveBodyRef.current) return;
      dirtyRef.current = false; // optimistic — re-arm on failure
      fetch('/api/heatmap/designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(autosaveBodyRef.current) })
        .then((r) => r.json()).then((d) => { if (!d?.id) dirtyRef.current = true; }).catch(() => { dirtyRef.current = true; });
    }, 12000);
    return () => clearInterval(iv);
  }, []);
  const openListModal = async () => {
    setModal('open'); setDesignList([]); setSaveMsg('');
    try { const r = await fetch('/api/heatmap/designs'); const d = await r.json(); if (d.error) { console.error('load designs error', d.error); setSaveMsg(humanError(d.error, "Couldn't load saved designs.")); } else setDesignList(d.designs || []); } catch (e) { console.error(e); setSaveMsg(humanError(e, "Couldn't load saved designs.")); }
  };
  const loadDesign = async (id: string) => {
    try {
      const r = await fetch(`/api/heatmap/designs/${id}`); const d = await r.json();
      if (d.design?.data) {
        const data = d.design.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (data.multifloor && Array.isArray(data.floors) && data.floors.length) {
          // multi-floor design → restore all floors
          const fl = data.floors.map((f: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            let proj = f.proj ?? null;
            if (proj) { const { snapshot: _s, ...rest } = proj; proj = rest; }
            return { id: f.id, name: f.name, proj };
          });
          setFloors(fl);
          setActiveFloor(data.activeFloor && fl.some((x: { id: string }) => x.id === data.activeFloor) ? data.activeFloor : fl[0].id);
        } else {
          // legacy single-project design → wrap as one floor
          const { snapshot: _snap, ...proj } = data as HeatmapProject & { snapshot?: string };
          setFloors([{ id: 'floor_1', name: 'Floor 1', proj: proj as HeatmapProject }]);
          setActiveFloor('floor_1');
        }
        setSavedId(id);
        setSaveProj(d.design.project_id || ''); setSaveName(d.design.name || data.name || '');
        setPast([]); setFuture([]); dirtyRef.current = false; setCoverage(null); setSelId(null); setModal('none');
        setFieldStepPin(null); setScaleDoor(false); setPendingScale([]); setPendingWall([]);
        setTimeout(fitView, 60);
      } else setSaveMsg(d.error || 'Could not load');
    } catch (e) { console.error(e); setSaveMsg(humanError(e, "Couldn't complete that. Please try again.")); }
  };

  /* ── multi-floor operations ── */
  const switchFloor = (id: string) => {
    if (id === activeFloorRef.current) return;
    setActiveFloor(id);
    setPast([]); setFuture([]); setCoverage(null); setSelId(null); setPdfDoc(null); setTool('select');
    setFieldStepPin(null); setScaleDoor(false); setPendingScale([]); setPendingWall([]);
    setTimeout(fitView, 60);
  };
  const addFloor = () => {
    const id = `floor_${Date.now().toString(36)}_${floors.length}`;
    setFloors((fs) => [...fs, { id, name: `Floor ${fs.length + 1}`, proj: null }]);
    setActiveFloor(id);
    setPast([]); setFuture([]); setCoverage(null); setSelId(null); setPdfDoc(null); setTool('scale');
    setFieldStepPin(null); setScaleDoor(false); setPendingScale([]); setPendingWall([]);
  };
  const renameFloor = async (id: string) => {
    const cur = floors.find((f) => f.id === id);
    const name = (await textPrompt({ title: 'Enter a value', label: 'Floor name:', defaultValue: cur?.name || '' }));
    if (name != null && name.trim()) setFloors((fs) => fs.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)));
  };
  const removeFloor = async (id: string) => {
    if (floors.length <= 1) return;
    if (!(await confirmDialog({ title: 'Please confirm', message: 'Remove this floor and everything on it?', danger: true }))) return;
    const remaining = floors.filter((f) => f.id !== id);
    setFloors(remaining);
    if (activeFloorRef.current === id) switchFloor(remaining[0].id);
  };

  /* ── pull real adopted devices/status from a UniFi controller ── */
  const pullUnifi = async () => {
    const host = (await textPrompt({ title: 'Enter a value', label: 'UniFi controller URL (e.g. https://192.168.1.1):', defaultValue: '' }));
    if (!host) return;
    const key = (await textPrompt({ title: 'Enter a value', label: 'UniFi API key (Settings → Control Plane → Integrations):', defaultValue: '' }));
    if (!key) return;
    setUnifiMsg('Connecting to controller…');
    try {
      const r = await fetch('/api/heatmap/unifi-pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host, apiKey: key }) });
      const d = await r.json();
      if (d.error) { console.error('unifi-pull error', d.error); setUnifiMsg(humanError(d.error, "Couldn't reach the controller. Check the host and API key.")); return; }
      const online = (d.devices || []).filter((x: { online?: boolean }) => x.online).length;
      setUnifiMsg(`✓ ${d.devices?.length || 0} adopted devices · ${online} online. ${d.summary || ''}`);
    } catch (e) { console.error(e); setUnifiMsg(humanError(e, "Couldn't reach the controller. Check the host and API key.")); }
  };

  /* ── create a read-only share link (snapshots the marked-up plan into the design) ── */
  // push the approved design → a low-voltage bid package (BOM + cabling + labor + scope)
  const sendToBidJacket = async () => {
    if (!project) return;
    const pid = saveProj || projectId || ''; // shell prop — never a localStorage guess
    if (!pid) { setAiNotes(['Save this design to a project first (Save button) so the bid package can attach to it.']); return; }
    if (!(await confirmDialog({ title: 'Please confirm', message: 'Create a low-voltage bid package from this design (materials + cabling + labor)?', danger: false }))) return;
    setBusy('Building bid package…');
    try {
      const r = await fetch('/api/heatmap/to-bid-package', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: pid, name: `${project.name} — Low Voltage`, floors: floors.filter((f) => f.proj).map((f) => ({ name: f.name, proj: f.proj })) }),
      });
      const d = await r.json();
      setBusy('');
      if (d.error || !d.ok) { console.error('bid package error', d.error); setAiNotes([humanError(d.error, "Couldn't create the bid package. Please try again.")]); return; }
      setAiNotes([`Bid package created — ${d.lineItems} line items, ~$${(d.budget || 0).toLocaleString()} budget. Open it in Bids → Bid Packages.`]);
    } catch (e) { setBusy(''); console.error(e); setAiNotes([humanError(e, "Couldn't create the bid package. Please try again.")]); }
  };

  const openShare = async () => {
    if (!project) return;
    setShareUrl(''); setShareCopied(false); setSaveMsg(''); setModal('share'); setBusy('Preparing share link…');
    try {
      // 1. composite plan + overlay → downscaled JPEG snapshot (what the GC will see).
      //    Cap the long edge so the base64 stays well under the request-body limit.
      const cap = 1400;
      const sc = Math.min(1, cap / Math.max(project.imgW, project.imgH));
      const ow = Math.round(project.imgW * sc), oh = Math.round(project.imgH * sc);
      const out = document.createElement('canvas'); out.width = ow; out.height = oh;
      const octx = out.getContext('2d')!;
      const snapshot = await new Promise<string>((resolve) => {
        const im = new Image();
        im.onload = () => { octx.drawImage(im, 0, 0, ow, oh); if (canvasRef.current) octx.drawImage(canvasRef.current, 0, 0, ow, oh); resolve(out.toDataURL('image/jpeg', 0.72)); };
        im.onerror = () => resolve('');
        im.src = project.planDataUrl;
      });
      // 2. persist the design (snapshot embedded) so the public route can read it
      const pid = saveProj || projectId || ''; // shell prop — never a localStorage guess
      // Persist the FULL multi-floor building (snapshot embedded in the active floor),
      // matching doSave's shape — sharing must NOT overwrite a saved design with a
      // single-floor snapshot (that was silently dropping every other floor).
      const floorsData = floors.map((f) => ({
        id: f.id, name: f.name,
        proj: f.proj ? (f.id === activeFloor ? { ...f.proj, snapshot } : f.proj) : null,
      }));
      const r = await fetch('/api/heatmap/designs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: savedId, projectId: pid || null, name: saveName || project.name, data: { multifloor: true, floors: floorsData, activeFloor }, coveragePercent: coverage?.stats.pctCovered ?? null, deviceCount: floors.reduce((sm, f) => sm + (f.proj?.devices.length ?? 0), 0), activeType: project.activeType }),
      });
      const d = await r.json();
      if (d.error || !d.id) { setBusy(''); console.error('share save error', d.error); setSaveMsg(humanError(d.error, "Couldn't save the design to share. Please try again.")); return; }
      setSavedId(d.id);
      // 3. mint the token-gated URL
      const tr = await fetch(`/api/heatmap/share?id=${d.id}`); const td = await tr.json();
      setBusy('');
      if (td.error || !td.url) { console.error('share link error', td.error); setSaveMsg(humanError(td.error, "Couldn't create the share link. Please try again.")); return; }
      setShareUrl(td.url);
    } catch (e) { setBusy(''); console.error(e); setSaveMsg(humanError(e, "Couldn't complete that. Please try again.")); }
  };
  const copyShare = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setShareCopied(true); setTimeout(() => setShareCopied(false), 1800); } catch { /* */ }
  };
  const revokeShare = async () => {
    if (!savedId) { setShareUrl(''); return; }
    setBusy('Revoking link…');
    try {
      const r = await fetch(`/api/heatmap/share?id=${savedId}`, { method: 'DELETE' });
      const d = await r.json(); setBusy('');
      if (d.error) { console.error('revoke share error', d.error); setSaveMsg(humanError(d.error, "Couldn't revoke the link. Please try again.")); return; }
      setShareUrl(''); setSaveMsg('✓ Link revoked — the old URL no longer opens.');
    } catch (e) { setBusy(''); console.error(e); setSaveMsg(humanError(e, "Couldn't complete that. Please try again.")); }
  };

  return (
    <div data-ss-root data-hm data-mode={project ? 'editor' : 'empty'} style={project ? { display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' } : { minHeight: '100vh' }}>
      {/* ── In-shell hero header (machined, matches Takeoff Studio) — replaces the legacy
             /field page header: Signal Studio identity + calibrated badge + Open/Save. ── */}
      <div className="hm-hero">
        <div className="hm-hero-id">
          <span className="hm-hero-ic" aria-hidden dangerouslySetInnerHTML={{ __html: HERO_ICON_SVG }} />
          <div style={{ minWidth: 0 }}>
            <div className="hm-hero-eyebrow"><Lightning size={11} weight="fill" color="var(--text-secondary)" /> Signal Studio</div>
            <div className="hm-hero-title">
              <span className="hm-hero-name">{project ? project.name : 'Wi-Fi, camera & cabling design'}</span>
              {project && <span className="hm-hero-cal" data-ok={!!project.scale}>{project.scale ? 'Calibrated' : 'Not Calibrated'}</span>}
            </div>
          </div>
        </div>
        {project && <div className="hm-hero-actions">
          {/* Simple mode: TWO buttons. Everything else lives in Details or the Bid step. */}
          <button className="hm-btn" style={{ background: 'rgba(255,255,255,0.06)', color: TEXT }} onClick={openListModal}>Open</button>
          <button className="hm-btn" style={{ background: savedId ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)', color: savedId ? '#4ADE80' : TEXT }} onClick={openSaveModal}>{savedId ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Saved <CheckCircle size={13} weight="fill" /></span> : 'Save'}</button>
          {!fieldMode && <>
            <button className="hm-btn" style={{ background: 'rgba(255,255,255,0.06)', color: TEXT }} onClick={openShare}>Share</button>
            <button className="hm-btn" style={{ background: 'rgba(255,255,255,0.06)', color: TEXT }} onClick={exportPng}>PNG</button>
            <button className="hm-btn" onClick={exportReport}>Report</button>
            <button className="hm-btn" style={{ background: 'rgba(74,222,128,0.14)', color: '#4ADE80' }} onClick={sendToBidJacket}>→ Bid Jacket</button>
          </>}
        </div>}
      </div>

      {(fieldMode ? floors.length > 1 : (project || floors.length > 1)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, background: RAISED }}>
          <span style={{ fontSize: 12, color: MUTED, marginRight: 2 }}>Building Floors</span>
          {floors.map((f) => (
            <div key={f.id} onClick={() => switchFloor(f.id)} onDoubleClick={() => renameFloor(f.id)}
              title="Click to switch · double-click to rename"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 8, cursor: 'pointer',
                background: f.id === activeFloor ? 'var(--brand-primary-18)' : DARK, color: f.id === activeFloor ? GOLD : DIM,
                border: `1px solid ${f.id === activeFloor ? 'var(--brand-primary-35)' : BORDER}`, fontWeight: 700, fontSize: 13 }}>
              {f.name}
              <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>{f.proj ? `${f.proj.devices.length} dev` : 'empty'}</span>
              {floors.length > 1 && <span onClick={(e) => { e.stopPropagation(); removeFloor(f.id); }} style={{ color: MUTED, marginLeft: 1, fontWeight: 800, fontSize: 14 }} title="Remove floor">×</span>}
            </div>
          ))}
          <button onClick={addFloor} className="hm-btn" style={{ background: 'rgba(255,255,255,0.06)', color: TEXT }}>+ Add Floor</button>
        </div>
      )}

      {/* ── system layer-chip row (the 6 approved systems) — click a chip to show / hide that system ── */}
      {project && !fieldMode && (
        <div className="hm-chiprow">
          <span style={{ fontSize: 12, color: MUTED, marginRight: 2 }}>Systems</span>
          {SYSTEM_CHIPS.map((c) => {
            const on = c.cabling ? showCabling : layerVis[c.key] !== false;
            return (
              <button key={c.key} type="button" className="hm-chip" data-on={on}
                onClick={() => c.cabling ? setShowCabling((v) => !v) : setLayerVis((v) => ({ ...v, [c.key]: !(v[c.key] !== false) }))}
                title={c.cabling ? 'Toggle cabling home-run lines' : `Toggle ${c.name} layer`}
                style={{ '--chip': c.color } as React.CSSProperties}>
                <i style={{ background: c.color, opacity: on ? 1 : 0.35 }} />{c.name}
              </button>
            );
          })}
        </div>
      )}

      {!project ? (
        <div className="hm-pad" style={{ maxWidth: 1040, margin: '24px auto' }}>
          {/* ── cinematic hero: sell the payoff on the empty state ── */}
          <div onDragOver={onDragOverFiles} onDragLeave={onDragLeaveFiles} onDrop={onDropFiles}
            style={{ display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap', background: dragOver ? 'var(--brand-primary-08)' : RAISED, border: `1px solid ${dragOver ? GOLD : BORDER}`, borderRadius: 20, padding: 26, transition: 'border-color .15s, background .15s' }}>
            <div style={{ flex: '1 1 300px', minWidth: 280 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>Signal Studio — Wi-Fi, camera &amp; cabling design</div>
              <h2 style={{ fontSize: 'clamp(24px,3.2vw,38px)', fontWeight: 900, lineHeight: 1.06, margin: '0 0 14px', color: '#fff', letterSpacing: -1 }}>Design the whole low-voltage system.</h2>
              <p style={{ color: DIM, fontSize: 14.5, lineHeight: 1.55, margin: '0 0 18px', maxWidth: 470 }}>Drop a blueprint. Devices place themselves, dead zones surface, and the bill of materials writes itself.</p>
              {/* The six-bullet feature grid that sat here was marketing copy
                  shown to somebody who has already bought the product and
                  clicked into it. It pushed "Upload blueprint" — the only
                  action on this screen that does anything — about 140px down.
                  Same discipline as the catalog: say what the screen is for,
                  then let them use it. */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <label className="hm-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                  <UploadSimple size={15} weight="bold" /> {busy || (dragOver ? 'Drop to Load' : 'Upload Blueprint')}
                  <input type="file" accept="image/*,application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && smartUpload(e.target.files[0])} />
                </label>
                <button className="hm-cta" style={{ background: 'rgba(255,255,255,0.07)', color: TEXT, border: `1px solid ${BORDER}`, boxShadow: '0 2px 10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)', display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={() => { const o = TEMPLATES.find((t) => t.id === 'office') || TEMPLATES[0]; if (o) buildTemplate(o); }}>
                  <Sparkle size={15} weight="fill" /> See a live example
                </button>
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>Drag &amp; drop a PDF, PNG or JPG anywhere · CAD PDFs import exact walls &amp; scale automatically · or tap a template below.</div>
              {aiNotes.length > 0 && <div style={{ marginTop: 14, fontSize: 12, color: '#FCA5A5', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8, padding: '9px 11px', lineHeight: 1.5 }}>{aiNotes.map((n, i) => <div key={i}>{n}</div>)}</div>}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div style={{ flex: '1 1 400px', minWidth: 300, borderRadius: 14, overflow: 'hidden', border: `1px solid ${BORDER}`, boxShadow: '0 16px 50px rgba(0,0,0,0.45)', position: 'relative' }}>
              <img src="/heatmap-hero.png" alt="Example coverage heatmap — green = strong Wi-Fi, red = dead zone" style={{ display: 'block', width: '100%', height: 'auto' }} />
              <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(13,17,23,0.82)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 7 }}>Example output — your plan renders like this</div>
            </div>
          </div>
          <div style={{ marginTop: 22, textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 12, textAlign: 'center' }}>Or open a finished example to see how one is put together</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {TEMPLATES.map((t) => (
                <button key={t.id} className="hm-tmpl" onClick={() => buildTemplate(t)}>
                  <span className="hm-tmpl-ic" dangerouslySetInnerHTML={{ __html: t.icon }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>{t.name}</span>
                  <span style={{ fontSize: 12, color: DIM, marginTop: 3, lineHeight: 1.35 }}>{t.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="hm-layout">
          {/* FIELD MODE — the guided rail: same six steps as the mobile app */}
          {fieldMode && (
            <div className="hm-rail">
              {FIELD_STEPS.map((st, i) => (
                <button key={st.key} type="button" className="hm-step" data-on={fieldStep === st.key} data-done={fieldDone[st.key]}
                  onClick={() => openStep(st.key)}>
                  <span className="hm-step-num">{fieldDone[st.key] && fieldStep !== st.key ? <Check size={12} weight="bold" /> : i + 1}</span>{st.label}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button className="hm-tool" title="Undo" onClick={undo} disabled={!past.length}><ArrowCounterClockwise size={15} weight="regular" style={{ verticalAlign: 'middle' }} /></button>
              <button className="hm-tool" title="Fit plan to screen" onClick={fitView}>Fit</button>
              <button className="hm-tool" onClick={() => flipFieldMode(false)} title="Full toolbox: every tool, layer and panel">Details</button>
            </div>
          )}
          {fieldMode && (
            <div className="hm-fieldbar">
              {fieldStep === 'plan' && <>
                <span className="hm-fieldmsg">Plan loaded <Check size={13} weight="bold" color="#4ADE80" style={{ verticalAlign: '-2px' }} /> — next, set the scale so every distance is real.</span>
                <button className="hm-big" onClick={() => openStep('scale')}>Set the Scale →</button>
              </>}
              {fieldStep === 'scale' && (project.scale ? <>
                <span className="hm-fieldmsg">Scale set <Check size={13} weight="bold" color="#4ADE80" style={{ verticalAlign: '-2px' }} /> — distances on this plan are real now.</span>
                <button className="hm-big" onClick={() => openStep('devices')}>Place Devices →</button>
                <button className="hm-big" data-alt="true" onClick={() => openStep('walls')}>Trace Walls</button>
                <button className="hm-big" data-alt="true" onClick={() => { finishWall(); setTool('scale'); setScaleDoor(true); setPendingScale([]); }}>Redo Scale</button>
              </> : <>
                {/* ONE primary CTA; the three manual scale methods fold into a compact segment */}
                <button className="hm-big" onClick={autopilot}><Sparkle size={15} weight="fill" /> AI: read plan &amp; design everything</button>
                <div className="hm-seg" role="group" aria-label="Set the scale by hand">
                  <button type="button" className="hm-seg-btn" data-on={scaleDoor && scaleDoorFt === 3 && tool === 'scale'} onClick={() => { finishWall(); setScaleDoorFt(3); setTool('scale'); setScaleDoor(true); setPendingScale([]); }}>Single Door · 3 ft</button>
                  <button type="button" className="hm-seg-btn" data-on={scaleDoor && scaleDoorFt === 6 && tool === 'scale'} onClick={() => { finishWall(); setScaleDoorFt(6); setTool('scale'); setScaleDoor(true); setPendingScale([]); }}>Double · 6 ft</button>
                  <button type="button" className="hm-seg-btn" data-on={!scaleDoor && tool === 'scale'} onClick={() => { finishWall(); setTool('scale'); setScaleDoor(false); setPendingScale([]); }}>Known Distance…</button>
                </div>
                <span className="hm-fieldmsg">Fastest: let AI read the plan. Or tap a doorway — pick single or double first.</span>
              </>)}
              {fieldStep === 'walls' && <>
                <button className="hm-big" data-on={tool === 'wall'} onClick={() => setTool('wall')}>Trace Walls</button>
                <select className="hm-sel" value={wallMat} onChange={(e) => setWallMat(e.target.value as WallMaterialId)} title="Wall material — sets how much signal it blocks">
                  {Object.entries(WALL_MATERIALS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <button className="hm-big" data-alt="true" onClick={() => openStep('devices')}>{project.walls.length ? `Done — ${project.walls.length} wall${project.walls.length === 1 ? '' : 's'} →` : `Open floor — skip →`}</button>
                <span className="hm-fieldmsg">Click corner → corner along each wall · Enter finishes a run.</span>
              </>}
              {fieldStep === 'devices' && <>
                {/* ONE primary CTA + the two essentials that parametrize it (target / band).
                    Everything deeper (vendor, model, dBm target, sliders) lives ONLY in Details. */}
                <button className="hm-big" onClick={() => { finishWall(); autoDesign(); }}><Sparkle size={15} weight="fill" /> Auto-design coverage</button>
                <div className="hm-chipset" title="Coverage target for auto-design">
                  <span>Target</span>
                  {[0.85, 0.9, 0.95].map((t) => (
                    <button key={t} type="button" className="hm-minichip" data-on={Math.abs(autoTarget - t) < 0.005} onClick={() => setAutoTarget(t)}>{Math.round(t * 100)}%</button>
                  ))}
                </div>
                <div className="hm-chipset" title="Wi-Fi band for auto-design">
                  <span>Band</span>
                  {(['2.4', '5', '6'] as Band[]).map((b) => (
                    <button key={b} type="button" className="hm-minichip" data-on={autoBand === b} onClick={() => setAutoBand(b)}>{b} GHz</button>
                  ))}
                </div>
                <button className="hm-big" data-alt="true" data-on={tool === 'place' && placeType === 'wifi_ap'} onClick={() => { finishWall(); setTool('place'); setPlaceType('wifi_ap'); }}>Place APs by Hand</button>
                <select className="hm-sel" value={placeType} title="Everything you can place — pick one, then click the plan"
                  onChange={(e) => { finishWall(); setTool('place'); setPlaceType(e.target.value as DeviceTypeId); }}>
                  {PLACEABLE.map((t) => <option key={t} value={t}>{DEVICE_REGISTRY[t].label}</option>)}
                </select>
                {placeType === 'electrical_outlet' && <select className="hm-sel" value={gangSel} onChange={(e) => setGangSel(+e.target.value)}><option value={2}>Duplex (2)</option><option value={4}>Quad (4)</option><option value={6}>6-gang (6)</option></select>}
                {(placeType === 'data_jack' || placeType === 'voice_jack') && <select className="hm-sel" value={portsSel} onChange={(e) => setPortsSel(+e.target.value)}><option value={1}>1 port</option><option value={2}>2 ports</option><option value={4}>4 ports</option></select>}
                {placeType === 'cable_term' && <select className="hm-sel" value={genderSel} onChange={(e) => setGenderSel(e.target.value as 'M' | 'F')}><option value="F">Jack — female (RJ45 keystone)</option><option value="M">Plug — male</option></select>}
                <button className="hm-big" data-alt="true" data-on={tool === 'place' && (placeType as string) === 'idf'} title="Drop the IDF / rack — cable runs & the schedule measure to it from plan geometry" onClick={() => { finishWall(); setTool('place'); setPlaceType(IDF_TYPE); }}>{idfDevice ? 'Move IDF' : 'Place IDF (rack)'}</button>
                {project.devices.length > 0 && <button className="hm-big" data-alt="true" onClick={() => openStep('heatmap')}>{project.devices.length} placed → Heatmap</button>}
              </>}
              {fieldStep === 'heatmap' && <>
                <span className="hm-fieldstat" style={{ color: stats && stats.pctCovered > 90 ? '#4ADE80' : stats && stats.pctCovered > 75 ? GOLD : '#F87171' }}>{stats ? `${stats.pctCovered.toFixed(0)}%` : '—'} <small>coverage</small></span>
                <span className="hm-fieldstat">{stats ? stats.deadZones : '—'} <small>dead zone{stats?.deadZones === 1 ? '' : 's'}</small></span>
                {fixableGaps.length > 0 && <button className="hm-big" onClick={doFixDeadZones}>Fix {fixableGaps.length} Dead Zone{fixableGaps.length === 1 ? '' : 's'}</button>}
                {fixableGaps.length === 0 && (coverage?.gaps?.length ?? 0) > 0 && <span className="hm-fieldmsg">Remaining pockets are too small for more hardware — drag an AP a few feet toward the worst one.</span>}
                <button className="hm-big" data-alt="true" onClick={doChannels}>Plan Channels</button>
                <button className="hm-big" onClick={() => openStep('bid')}>Looks Good → Bid</button>
              </>}
              {fieldStep === 'bid' && <>
                <span className="hm-fieldstat" style={{ color: 'var(--text-primary)' }}>{bom ? `$${bom.turnkey.toLocaleString()}` : '—'} <small>turnkey install</small></span>
                <button className="hm-big" onClick={sendToBidJacket}>→ Bid Jacket</button>
                <button className="hm-big" data-alt="true" onClick={exportReport}>Client Report</button>
                <button className="hm-big" data-alt="true" onClick={openSaveModal}>Save Design</button>
              </>}
            </div>
          )}
          {/* DETAILS MODE — the classic full toolbox, untouched */}
          {!fieldMode && (
          <div className="hm-toolbar">
            {(['select', 'scale', 'wall', 'place'] as Tool[]).map((t) => (
              <button key={t} className="hm-tool" data-on={tool === t} onClick={() => { setTool(t); if (t !== 'wall') finishWall(); }}>
                {t === 'select' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Cursor size={14} weight="regular" />Select</span> : t === 'scale' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Ruler size={14} weight="regular" />Scale</span> : t === 'wall' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><LineSegments size={14} weight="regular" />Wall</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Plus size={14} weight="regular" />Place</span>}
              </button>
            ))}
            <div className="hm-sep" />
            {tool === 'wall' && (
              <select className="hm-sel" value={wallMat} onChange={(e) => setWallMat(e.target.value as WallMaterialId)}>
                {Object.entries(WALL_MATERIALS).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.db24}/{v.db5}dB)</option>)}
              </select>
            )}
            {tool === 'place' && <>
              <select className="hm-sel" value={placeType} onChange={(e) => setPlaceType(e.target.value as DeviceTypeId)}>
                {PLACEABLE.map((t) => <option key={t} value={t}>{DEVICE_REGISTRY[t].label}</option>)}
              </select>
              {placeType === 'wifi_ap' && <select className="hm-sel" value={apModel} onChange={(e) => setApModel(e.target.value)}>{UNIFI_APS.map((a) => <option key={a.model} value={a.model}>{a.model}</option>)}</select>}
              {placeType === 'camera' && <select className="hm-sel" value={camModel} onChange={(e) => setCamModel(e.target.value)}>{UNIFI_CAMERAS.map((c) => <option key={c.model} value={c.model}>{c.model}</option>)}</select>}
              <button className="hm-tool" data-on={(placeType as string) === 'idf'} title="Place / move the IDF (rack) — cable runs measure to it from plan geometry" onClick={() => setPlaceType(IDF_TYPE)}>IDF</button>
              {placeType === 'electrical_outlet' && <select className="hm-sel" value={gangSel} onChange={(e) => setGangSel(+e.target.value)}><option value={2}>Duplex (2)</option><option value={4}>Quad (4)</option><option value={6}>6-gang (6)</option></select>}
              {(placeType === 'data_jack' || placeType === 'voice_jack') && <select className="hm-sel" value={portsSel} onChange={(e) => setPortsSel(+e.target.value)}><option value={1}>1 port</option><option value={2}>2 ports</option><option value={4}>4 ports</option></select>}
              {placeType === 'cable_term' && <select className="hm-sel" value={genderSel} onChange={(e) => setGenderSel(e.target.value as 'M' | 'F')}><option value="F">Jack — female (RJ45 keystone)</option><option value="M">Plug — male</option></select>}
            </>}
            <div className="hm-sep" />
            {/* overlay + band controls now live in the Layers / Design tabs of the panel (kill the crowded toolbar) */}
            <div className="hm-seg" role="group" aria-label="2D / 3D view">
              <button type="button" className="hm-seg-btn" data-on={!view3d} onClick={() => setView3d(false)} title="Flat 2D plan view">2D</button>
              <button type="button" className="hm-seg-btn" data-on={view3d} onClick={() => setView3d(true)} title="True 3D building view — drag to orbit, scroll to zoom, right-drag to pan">3D</button>
            </div>
            <div className="hm-sep" />
            <button className="hm-tool" title="Zoom in" onClick={() => zoom(1.2)}><Plus size={14} weight="bold" style={{ verticalAlign: 'middle' }} /></button>
            <button className="hm-tool" title="Zoom out" onClick={() => zoom(1 / 1.2)}><Minus size={14} weight="bold" style={{ verticalAlign: 'middle' }} /></button>
            <button className="hm-tool" title="Fit to screen" onClick={fitView}>Fit</button>
            <button className="hm-tool" title="Undo (Ctrl+Z)" onClick={undo} disabled={!past.length}><ArrowCounterClockwise size={15} weight="regular" style={{ verticalAlign: 'middle' }} /></button>
            <button className="hm-tool" title="Redo (Ctrl+Y)" onClick={redo} disabled={!future.length}><ArrowClockwise size={15} weight="regular" style={{ verticalAlign: 'middle' }} /></button>
            {tool === 'scale' && <span className="hm-hint">Click two points a known distance apart</span>}
            {tool === 'wall' && <span className="hm-hint">Click to trace · Enter/Esc to finish</span>}
            {busy && <span className="hm-hint" style={{ color: 'var(--text-primary)' }}>{busy}</span>}
            <div style={{ flex: 1 }} />
            <button className="hm-tool" onClick={() => flipFieldMode(true)} title="Back to the simple guided flow — same as the mobile app"><Lightning size={13} weight="fill" style={{ verticalAlign: 'middle', marginRight: 5 }} />Simple</button>
          </div>
          )}
          {fieldMode && busy && <div className="hm-fieldbusy">{busy}</div>}
          {/* guard/result messages were invisible in Field mode — buttons looked dead */}
          {fieldMode && !busy && aiNotes.length > 0 && (
            <div className="hm-fieldnote">
              <div style={{ flex: 1 }}>{aiNotes.map((n, i) => <div key={i}>{n}</div>)}</div>
              <button type="button" className="hm-fieldnote-x" onClick={() => setAiNotes([])} title="Dismiss">×</button>
            </div>
          )}
          {/* ── LEGACY GUARD: over-dense design loaded → say the numbers, offer the corrected re-design ── */}
          {densityFlag?.flagged && (
            <div className="hm-guardband">
              <span style={{ flex: 1, minWidth: 220 }}>This design has {densityFlag.apCount} APs — engineering cap for {densityFlag.areaFt2.toLocaleString()} ft² is {densityFlag.capAps} (1 AP / 1,500 ft²). Older auto-designs over-placed hardware.</span>
              <button className="hm-btn" onClick={redesignCoverage}>Redesign Coverage (Replaces All APs)</button>
            </div>
          )}

          {/* multi-sheet PDF picker */}
          {pdfDoc && pdfDoc.pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap', background: RAISED }}>
              <span style={{ fontSize: 12, color: MUTED, marginRight: 2 }}>{pdfDoc.name} · {pdfDoc.pages} sheets</span>
              {Array.from({ length: pdfDoc.pages }, (_, i) => i + 1).map((n) => (
                <button key={n} className="hm-sheet" data-on={project.name === `${pdfDoc.name} — Sheet ${n}`} disabled={!!busy}
                  onClick={() => renderPdfPage(pdfDoc.pdf, n, pdfDoc.name)}>Sheet {n}</button>
              ))}
            </div>
          )}

          {/* canvas + panel */}
          <div className="hm-body">
            <div className="hm-canvas-wrap" ref={hostRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
              onDragOver={onDragOverFiles} onDragLeave={onDragLeaveFiles} onDrop={onDropFiles}
              style={{ cursor: tool === 'select' ? 'grab' : 'crosshair' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: project.imgW, height: project.imgH, transformOrigin: '0 0', transform: `translate(${view.ox}px,${view.oy}px) scale(${view.scale})`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 30px 90px rgba(0,0,0,0.6), 0 4px 18px rgba(0,0,0,0.45)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={project.planDataUrl} alt="plan" width={project.imgW} height={project.imgH} style={{ display: 'block', userSelect: 'none' }} draggable={false} />
                <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
              </div>
              {/* true 3D building view — overlays the 2D canvas area when toggled on (additive; 2D pointer handlers untouched) */}
              {view3d && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 6, background: DARK }} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} onMouseUp={(e) => e.stopPropagation()}>
                  <Building3D floors={floors} activeFloorId={activeFloor} heightFt={10} />
                  <div style={{ position: 'absolute', left: 12, top: 12, padding: '5px 10px', borderRadius: 8, background: 'rgba(13,17,23,0.72)', color: DIM, fontSize: 12, pointerEvents: 'none', letterSpacing: 0.3 }}>
                    3D · drag to orbit · scroll to zoom · right-drag to pan
                  </div>
                </div>
              )}
              {dragOver && <div className="hm-drop">Drop Plan to Replace</div>}
              {/* how-to-edit hint bar — in Field mode it tells you the ONE next move */}
              <div style={{ position: 'absolute', left: 10, bottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap', pointerEvents: 'none', zIndex: 5 }}>
                {(fieldMode
                  ? tool === 'scale'
                    ? [scaleDoor ? (pendingScale.length ? 'Now tap the OTHER side of the same door' : `Tap ONE side of a ${scaleDoorFt === 6 ? 'double' : 'single'} door opening`) : (pendingScale.length ? 'Click the second point' : 'Click two points a known distance apart')]
                    : tool === 'wall' ? ['Click corner → corner along the wall · Enter finishes'] : tool === 'place' ? ['Click the plan to drop a device · drag to move it'] : ['Click a device to select · drag to move']
                  : ['Click a device to select', 'Drag to move', 'Delete key (or the trash in the list) removes', 'Place tool adds']
                ).map((h) => (
                  <span key={h} style={{ background: 'rgba(15,17,22,0.72)', border: '1px solid rgba(255,255,255,0.12)', color: DIM, fontSize: fieldMode ? 12 : 10.5, fontWeight: fieldMode ? 700 : 600, padding: fieldMode ? '6px 12px' : '3px 8px', borderRadius: 999, boxShadow: '0 8px 22px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)' }}>{h}</span>
                ))}
              </div>
              {/* Field mode: compact selected-device card — no panel needed to rename-level ops */}
              {fieldMode && sel && (
                <div className="hm-selcard">
                  <i style={{ background: defOf(sel.typeId).color, width: 10, height: 10, borderRadius: '50%', display: 'inline-block' }} />
                  <b style={{ fontSize: 13 }}>{sel.label}</b>
                  <button className="hm-tool" style={{ color: '#F87171' }} onClick={() => { snapshot(); patch({ devices: project.devices.filter((x) => x.id !== sel.id) }); setSelId(null); }}>Remove</button>
                  <button className="hm-tool" onClick={() => flipFieldMode(false)} title="Full inspector in Details mode">Edit…</button>
                </div>
              )}
              {/* ── ADVISOR — collapsible right-rail card: density verdict, per-AP reasoning, camera/sensor checks, IDF cable schedule.
                     Pointer events stop here (like the 3D overlay) so a click can never place/pan under the card. ── */}
              {advice && (
                <div className="hm-advisor" onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} onMouseUp={(e) => e.stopPropagation()}>
                  <button type="button" className="hm-advisor-head" onClick={() => setAdvisorOpen((v) => !v)} title={advisorOpen ? 'Collapse the Advisor' : 'Expand the Advisor'}>
                    <span>Advisor</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {(advice.density.flagged || advice.apRows.some((r) => r.status === 'crowded') || advice.checks.some((c) => c.status === 'warn') || (cableRuns?.overCount ?? 0) > 0) && <i className="hm-advdot" data-bad={advice.density.flagged} />}
                      <span style={{ color: MUTED, fontWeight: 800 }}>{advisorOpen ? '−' : '+'}</span>
                    </span>
                  </button>
                  {advisorOpen && (
                    <div className="hm-advisor-body">
                      <div className="hm-advdict" data-bad={advice.density.flagged}>
                        {advice.density.apCount === 0
                          ? 'No access points yet — Auto-design places the engine-correct count for this floor.'
                          : advice.density.areaFt2 > 0
                            ? <>{advice.density.apCount} AP{advice.density.apCount === 1 ? '' : 's'} on {advice.density.areaFt2.toLocaleString()} ft² = 1 AP / {advice.density.perApFt2?.toLocaleString() ?? '—'} ft² — cap {advice.density.capAps} (1 / 1,500 ft²){advice.density.flagged ? ' · OVER' : <Check size={12} weight="bold" color="#4ADE80" style={{ verticalAlign: '-1px', marginLeft: 4 }} />}</>
                            : <>{advice.density.apCount} AP{advice.density.apCount === 1 ? '' : 's'} placed — set the scale to check density against the 1 AP / 1,500 ft² cap.</>}
                      </div>
                      {advice.apRows.length > 0 && <>
                        <div className="hm-advlabel">Access points · spacing floor {advice.minSepFt} ft</div>
                        {advice.apRows.map((r) => (
                          <div key={r.id} className="hm-advrow">
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <b>{r.label}</b>
                              <span style={{ display: 'block', color: MUTED, fontSize: 12 }}>{r.nnFt != null ? `${Math.round(r.nnFt)} ft to nearest` : 'only AP'}{r.areaFt2 != null ? ` · serves ${r.areaFt2.toLocaleString()} ft²` : ''} · {r.band} GHz · {r.txDbm} dBm</span>
                            </span>
                            <span className="hm-advchip" data-kind={r.status}>{r.status}</span>
                          </div>
                        ))}
                      </>}
                      <div className="hm-advlabel">Camera &amp; sensor checks</div>
                      {advice.checks.map((c) => (
                        <div key={c.label} className="hm-advrow">
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <b>{c.label}</b>
                            <span style={{ display: 'block', color: MUTED, fontSize: 12 }}>{c.detail}</span>
                          </span>
                          <span className="hm-advchip" data-kind={c.status === 'warn' ? 'warn' : 'ok'}>{c.status}</span>
                        </div>
                      ))}
                      {cableRuns ? <>
                        <div className="hm-advlabel">Cable schedule — to the IDF</div>
                        <div className="hm-advrow">
                          <span style={{ flex: 1 }}>
                            <b>{cableRuns.totalFt.toLocaleString()} ft total</b>
                            <span style={{ display: 'block', color: MUTED, fontSize: 12 }}>{cableRuns.runs.length} run{cableRuns.runs.length === 1 ? '' : 's'} from plan geometry · order {cableRuns.orderFt.toLocaleString()} ft (1,000 ft boxes)</span>
                          </span>
                          {cableRuns.overCount > 0 && <span className="hm-advchip" data-kind="over">{cableRuns.overCount} &gt;328 ft</span>}
                        </div>
                        <div style={{ maxHeight: 110, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {cableRuns.runs.map((r) => (
                            <div key={r.id} className="hm-advrow" style={{ fontSize: 12 }}>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                              <span style={{ color: r.overLimit ? '#F87171' : DIM, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{r.lengthFt} ft</span>
                              <span style={{ color: MUTED, minWidth: 74, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.cable}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 9.5, color: MUTED, lineHeight: 1.4 }}>Run ft = straight plan distance × 1.35 routing + 18 ft drop, rounded up to 5 ft. Runs over 328 ft (100 m copper limit) show red — fiber or a second IDF.</div>
                      </> : (
                        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>Place an IDF (Devices step) to get the cable schedule — run footage measured from plan geometry.</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* right panel — Details mode only (the field bar carries what matters) */}
            {!fieldMode && <div className="hm-panel">
              {/* ── always-visible metric strip + segmented group control ── */}
              <div className="hm-panel-top">
                <div className="hm-strip">
                  <Metric label="Coverage" big val={stats ? `${stats.pctCovered.toFixed(0)}%` : '—'} color={stats ? (stats.pctCovered > 90 ? '#4ADE80' : stats.pctCovered > 75 ? GOLD : '#F87171') : DIM} />
                  <Metric label="Health" big val={stats ? `${stats.healthScore}` : '—'} color={stats ? (stats.healthScore > 80 ? '#4ADE80' : stats.healthScore > 60 ? GOLD : '#F87171') : DIM} />
                  <Metric label="Devices" big val={`${project.devices.length}`} />
                  {project.activeType === 'wifi_ap'
                    ? <Metric label="Dead Zones" big val={stats ? `${stats.deadZones}` : '—'} color={stats && stats.deadZones ? GOLD : DIM} />
                    : <Metric label="Cabling" big val={bom ? `${bom.cat6Runs} runs` : '—'} />}
                </div>
                <div className="hm-tabs" role="tablist">
                  {(([['design', 'Design'], ['layers', 'Layers'], ['bom', 'BOM'], ['survey', 'Survey']]) as [PanelTab, string][]).map(([k, label]) => (
                    <button key={k} type="button" role="tab" className="hm-tabbtn" data-on={tab === k} onClick={() => setTab(k)}>{label}</button>
                  ))}
                </div>
              </div>

              {/* selected-device editor stays reachable from any tab */}
              {sel && <DeviceInspector d={sel} project={project} sched={sched} bom={bom} clientsPerAp={clientsPerAp}
                onChange={(u) => { snapshot(); patch({ devices: project.devices.map((x) => x.id === sel.id ? { ...x, ...u } : x) }); }}
                onDelete={() => { snapshot(); patch({ devices: project.devices.filter((x) => x.id !== sel.id) }); setSelId(null); }} />}

              {/* ═══ DESIGN ═══ plan layer · band · smart tools · device list ═══ */}
              {tab === 'design' && <>
              <PanelSection title="Coverage Layer">
                <select className="hm-sel" style={{ width: '100%' }} value={project.activeType} onChange={(e) => patch({ activeType: e.target.value as DeviceTypeId })}>
                  {COVERAGE_LAYERS.map((t) => <option key={t} value={t}>{DEVICE_REGISTRY[t].label}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <label style={{ flex: 1, fontSize: 12, color: DIM }}>Environment
                    <select className="hm-sel" style={{ width: '100%' }} value={project.env} onChange={(e) => patch({ env: e.target.value as Env })}>
                      <option value="open">Open / Warehouse</option><option value="office">Office</option><option value="dense">Dense Walls</option>
                    </select>
                  </label>
                  {project.activeType === 'wifi_ap' && <label style={{ flex: 1, fontSize: 12, color: DIM }}>Target
                    <select className="hm-sel" style={{ width: '100%' }} value={project.rssiTargetDbm} onChange={(e) => patch({ rssiTargetDbm: +e.target.value })}>
                      <option value={-67}>-67 (voice)</option><option value={-72}>-72 (data)</option><option value={-80}>-80 (IoT)</option>
                    </select>
                  </label>}
                </div>
                {project.activeType === 'wifi_ap' && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <span style={{ fontSize: 12, color: DIM }}>Band (all APs)</span>
                  <div className="hm-seg" role="group" aria-label="Wi-Fi Band" style={{ flex: 1 }}>
                    {(['2.4', '5', '6'] as Band[]).map((b) => (
                      <button key={b} type="button" className="hm-seg-btn" data-on={apBand === b} style={{ flex: 1 }}
                        onClick={() => setBandAll(b)} title={`Set all APs to ${b} GHz and recompute coverage`}>{b}</button>
                    ))}
                  </div>
                </div>}
                {coverage && <div style={{ marginTop: 10 }}>
                  {activeDef?.modelType === 'rf' && <>
                    <div style={{ height: 12, borderRadius: 4, background: 'linear-gradient(90deg,#2a3340,#F87171,#f8c22a,#7ac943,#1cb052)' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED, marginTop: 3 }}><span>−90</span><span style={{ color: 'var(--text-primary)' }}>−{Math.abs(project.rssiTargetDbm)} target</span><span>−45 dBm</span></div>
                  </>}
                  {activeDef?.modelType === 'camera' && <>
                    <div style={{ height: 12, borderRadius: 4, background: 'linear-gradient(90deg,#f8781c,#f8c428,#96d63e,#28c864)' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED, marginTop: 3 }}><span>Detect</span><span>Recognize</span><span>Identify</span></div>
                  </>}
                  <div className="hm-legend">{coverage.bandLabels.map((b) => <span key={b.label}><i style={{ background: b.color }} />{b.label}</span>)}</div>
                </div>}
              </PanelSection>

              {stats && <PanelSection title="Coverage Detail">
                <div className="hm-metrics">
                  <Metric label="Coverage" val={`${stats.pctCovered.toFixed(0)}%`} big color={stats.pctCovered > 90 ? '#4ADE80' : stats.pctCovered > 75 ? GOLD : '#F87171'} />
                  <Metric label="Health" val={`${stats.healthScore}`} big color={stats.healthScore > 80 ? '#4ADE80' : stats.healthScore > 60 ? GOLD : '#F87171'} />
                  <Metric label="Avg" val={`${stats.avgValue.toFixed(0)} ${stats.valueUnit}`} />
                  <Metric label="Devices" val={`${stats.deviceCount}`} />
                  {project.activeType === 'wifi_ap' && <Metric label="Dead Zones" val={`${stats.deadZones}`} color={stats.deadZones ? GOLD : DIM} />}
                  {project.activeType === 'wifi_ap' && <Metric label="Dead Area" val={`${Math.round(stats.deadArea)} ft²`} />}
                  {project.activeType === 'wifi_ap' && stats.roamReadyPct != null && <Metric label="Roam-ready" val={`${stats.roamReadyPct.toFixed(0)}%`} color={stats.roamReadyPct > 80 ? '#4ADE80' : stats.roamReadyPct > 50 ? GOLD : '#F87171'} />}
                  {project.activeType === 'wifi_ap' && stats.avgConfidence != null && <Metric label="Confidence" val={`${Math.round(stats.avgConfidence * 100)}%`} color={stats.avgConfidence > 0.7 ? '#4ADE80' : stats.avgConfidence > 0.45 ? GOLD : '#F87171'} />}
                </div>
                {project.activeType === 'wifi_ap' && stats.roamReadyPct != null && stats.avgConfidence == null && <div style={{ marginTop: 8, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>Roam-ready = share of covered floor that can also reach a 2nd AP. Import a survey to add a validated <b>Confidence</b> layer.</div>}
              </PanelSection>}

              {coverage && coverage.gaps.length > 0 && <PanelSection title={`Issue navigator · ${coverage.gaps.length}`}>
                <div className="hm-list">
                  {coverage.gaps.slice(0, 10).map((g, i) => (
                    <button key={i} className="hm-row" onClick={() => zoomToBox(g.bbox)} style={{ width: '100%' }} title="Zoom to this dead zone">
                      <i style={{ background: '#F87171' }} />
                      <span style={{ flex: 1, fontSize: 12, textAlign: 'left' }}>Dead zone {i + 1} · {Math.round(g.area)} ft²</span>
                      <ArrowUpRight size={13} weight="bold" style={{ color: 'var(--text-primary)' }} />
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: MUTED }}>Tap a dead zone to zoom the plan to it.</div>
              </PanelSection>}
              </>}

              {/* ═══ LAYERS ═══ map overlays + per-system show / hide ═══ */}
              {tab === 'layers' && <>
              <PanelSection title="Map Overlays">
                <div className="hm-list">
                  <button className="hm-row" data-on={showHeat} onClick={() => setShowHeat((v) => !v)} style={{ width: '100%' }}>
                    <i style={{ background: '#1cb052' }} /><span style={{ flex: 1 }}>Coverage Heatmap</span>
                    <span style={{ fontSize: 12, color: showHeat ? '#4ADE80' : MUTED, fontWeight: 700 }}>{showHeat ? 'ON' : 'OFF'}</span>
                  </button>
                  <div className="hm-row" style={{ width: '100%', cursor: 'default' }}>
                    <i style={{ background: 'transparent' }} /><span style={{ flex: 1 }}>Heatmap Opacity</span>
                    <input type="range" min={0.15} max={1} step={0.05} value={project.heatmapOpacity} onChange={(e) => patch({ heatmapOpacity: +e.target.value })} style={{ width: 96, accentColor: GOLD }} />
                  </div>
                  {project.activeType === 'wifi_ap' && (
                    <button className="hm-row" data-on={showContours} onClick={() => setShowContours((v) => !v)} style={{ width: '100%', opacity: showContours ? 1 : 0.6 }} title="RSSI iso-contour lines">
                      <i style={{ background: '#7ac943' }} /><span style={{ flex: 1 }}>RSSI contours</span>
                      <span style={{ fontSize: 12, color: showContours ? '#4ADE80' : MUTED, fontWeight: 700 }}>{showContours ? 'ON' : 'OFF'}</span>
                    </button>
                  )}
                  {project.activeType === 'wifi_ap' && (
                    <button className="hm-row" data-on={showInterference} onClick={() => setShowInterference((v) => !v)} style={{ width: '100%', opacity: showInterference ? 1 : 0.6 }} title="Co-channel interference (low SIR)">
                      <i style={{ background: '#F87171' }} /><span style={{ flex: 1 }}>Co-channel interference</span>
                      <span style={{ fontSize: 12, color: showInterference ? '#4ADE80' : MUTED, fontWeight: 700 }}>{showInterference ? 'ON' : 'OFF'}</span>
                    </button>
                  )}
                  <button className="hm-row" data-on={showDori} onClick={() => setShowDori((v) => !v)} style={{ width: '100%', opacity: showDori ? 1 : 0.6 }} title="Camera DORI zones (EN 62676-4)">
                    <i style={{ background: SYSTEM_COLORS.camera }} /><span style={{ flex: 1 }}>Camera DORI Cones</span>
                    <span style={{ fontSize: 12, color: showDori ? '#4ADE80' : MUTED, fontWeight: 700 }}>{showDori ? 'ON' : 'OFF'}</span>
                  </button>
                  <button className="hm-row" data-on={showCabling} onClick={() => setShowCabling((v) => !v)} style={{ width: '100%', opacity: showCabling ? 1 : 0.6 }} title="Structured cabling home-run lines to the rack/MDF">
                    <i style={{ background: SYSTEM_COLORS.cabling }} /><span style={{ flex: 1 }}>Cabling Runs</span>
                    <span style={{ fontSize: 12, color: showCabling ? '#4ADE80' : MUTED, fontWeight: 700 }}>{showCabling ? 'ON' : 'OFF'}</span>
                  </button>
                  {project.activeType === 'wifi_ap' && measured.length > 0 && (
                    <button className="hm-row" data-on={showMeasured} onClick={() => setShowMeasured((v) => !v)} style={{ width: '100%', opacity: showMeasured ? 1 : 0.6 }}>
                      <i style={{ background: 'var(--brand-primary)' }} /><span style={{ flex: 1 }}>Measured Survey</span>
                      <span style={{ fontSize: 12, color: MUTED, marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>{measured.length}</span>
                      <span style={{ fontSize: 12, color: showMeasured ? '#4ADE80' : MUTED, fontWeight: 700 }}>{showMeasured ? 'ON' : 'OFF'}</span>
                    </button>
                  )}
                  {project.activeType === 'wifi_ap' && (
                    <button className="hm-row" data-on={showRoam} onClick={() => setShowRoam((v) => !v)} style={{ width: '100%', opacity: showRoam ? 1 : 0.6 }} title="Covered cells that can't reach a 2nd AP — a roaming risk">
                      <i style={{ background: '#FFE000' }} /><span style={{ flex: 1 }}>Roaming Risk</span>
                      <span style={{ fontSize: 12, color: showRoam ? '#4ADE80' : MUTED, fontWeight: 700 }}>{showRoam ? 'ON' : 'OFF'}</span>
                    </button>
                  )}
                  {project.activeType === 'wifi_ap' && (
                    <button className="hm-row" data-on={showConfidence} onClick={() => setShowConfidence((v) => !v)} style={{ width: '100%', opacity: showConfidence ? 1 : 0.6 }} title="Veils areas the prediction is least sure about — import a survey to light it up">
                      <i style={{ background: '#3f3f46' }} /><span style={{ flex: 1 }}>Confidence Veil</span>
                      <span style={{ fontSize: 12, color: showConfidence ? '#4ADE80' : MUTED, fontWeight: 700 }}>{showConfidence ? 'ON' : 'OFF'}</span>
                    </button>
                  )}
                </div>
              </PanelSection>

              {project.devices.length > 0 && <PanelSection title="Systems — Show / Hide">
                <div className="hm-list">
                  {LAYER_META.filter((l) => project.devices.some((d) => deviceLayerKey(d.typeId) === l.key)).map((l) => {
                    const count = project.devices.filter((d) => deviceLayerKey(d.typeId) === l.key).length;
                    const on = layerVis[l.key] !== false;
                    return (
                      <button key={l.key} className="hm-row" data-on={on} onClick={() => setLayerVis((v) => ({ ...v, [l.key]: !on }))} style={{ width: '100%', opacity: on ? 1 : 0.55 }}>
                        <i style={{ background: l.color }} /><span style={{ flex: 1 }}>{l.name}</span>
                        <span style={{ fontSize: 12, color: MUTED, marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                        <span style={{ fontSize: 12, color: on ? '#4ADE80' : MUTED, fontWeight: 700 }}>{on ? 'ON' : 'OFF'}</span>
                      </button>
                    );
                  })}
                </div>
              </PanelSection>}
              </>}

              {/* ═══ BOM ═══ capacity · materials · network schedule ═══ */}
              {tab === 'bom' && project.activeType === 'wifi_ap' && capAps.length > 0 && bom && <PanelSection title="Network Capacity">
                <div className="hm-metrics">
                  <Metric label={`Mbps / client${apBand ? ` · ${apBand}GHz` : ' · mixed'}`} val={`${tpLow}–${tpHigh}`} big color="var(--text-secondary)" />
                  <Metric label={`Clients (${capAps.length} AP × ${clientsPerAp})`} val={`${capTotal}`} big color={capTotal ? TEXT : DIM} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: DIM }}>
                  <span style={{ flex: 1 }}>Devices per AP (capacity model)</span>
                  <input type="number" min={1} max={500} value={clientsPerAp}
                    onChange={(e) => setClientsPerAp(Math.max(1, Math.min(500, Math.round(+e.target.value) || 1)))}
                    className="hm-sel" style={{ width: 64, textAlign: 'right' }} />
                </label>
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED, marginBottom: 4 }}>
                    <span>PoE draw vs switch budget</span>
                    <span style={{ color: poeColor, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{poeWatts} / {poeBudget || '—'} W</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 5, background: DARK, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, Math.round(poeUtil * 100))}%`, background: poeColor, borderRadius: 5, transition: 'width .2s' }} />
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.4 }}>
                    {poeBudget ? `${Math.round(poeUtil * 100)}% of ${bom.recSwitch?.model || 'switch'} budget${poeUtil > 0.9 ? ' — add a switch' : poeUtil > 0.7 ? ' — near limit' : ''}` : 'No PoE-powered devices placed yet.'}
                  </div>
                </div>
              </PanelSection>}

              {tab === 'design' && <PanelSection title="Smart Tools">
                {project.planDataUrl && <button className="hm-smart" style={{ background: `linear-gradient(135deg, ${GOLD}, var(--brand-primary-strong))`, color: '#101722', border: 'none', fontWeight: 800, fontSize: 14, marginBottom: 8, textAlign: 'center' }} onClick={autopilot}><Sparkle size={15} weight="fill" style={{ verticalAlign: 'middle', marginRight: 6 }} />Design my building — AI reads the plan, designs &amp; prices it</button>}
                {project.scale && <button className="hm-smart" style={{ background: `linear-gradient(135deg, ${GOLD}, var(--brand-primary-strong))`, color: '#101722', border: 'none', fontWeight: 800, fontSize: 13, marginBottom: 10, textAlign: 'center' }} onClick={autoDesign}><Sparkle size={15} weight="fill" style={{ verticalAlign: 'middle', marginRight: 6 }} />Auto-design coverage — place · close dead zones · price it</button>}
                <button className="hm-smart" onClick={doAiScan}><Sparkle size={14} weight="fill" style={{ verticalAlign: 'middle', marginRight: 6 }} />AI scan blueprint → read walls + place devices</button>
                <div style={{ border: `1px solid var(--brand-primary-25)`, borderRadius: 8, padding: 9, marginBottom: 7, background: 'var(--bg-surface-2)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 7 }}>
                    <label style={{ fontSize: 12, color: MUTED }}>Vendor
                      <select className="hm-sel-full" value={apVendor} onChange={(e) => { const v = e.target.value; setApVendor(v); const first = apModelsByVendor(v)[0]; if (first) setApCatId(first.id); }}>
                        {VENDORS.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: 12, color: MUTED }}>Band
                      <select className="hm-sel-full" value={autoBand} onChange={(e) => setAutoBand(e.target.value as Band)}>
                        <option value="2.4">2.4 GHz (range)</option>
                        <option value="5">5 GHz (balanced)</option>
                        <option value="6">6 GHz (speed)</option>
                      </select>
                    </label>
                  </div>
                  <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 7 }}>AP Model
                    <select className="hm-sel-full" value={apCatId} onChange={(e) => setApCatId(e.target.value)}>
                      {apModelsByVendor(apVendor).map((m) => <option key={m.id} value={m.id}>{m.model}</option>)}
                    </select>
                  </label>
                  {apCat && <div style={{ fontSize: 12, color: DIM, marginBottom: 7, display: 'flex', justifyContent: 'space-between', gap: 8, fontVariantNumeric: 'tabular-nums' }}>
                    <span>{apCat.wifiGen.replace('wifi', 'Wi-Fi ')} · {(apCat.maxTxPowerDbm[toDeviceRadio(apCat, autoBand).band] ?? 0)} dBm · {apCat.antennaGainDbi} dBi · {apCat.poeWatts} W PoE</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{apCat.listPriceUsd ? '$' + apCat.listPriceUsd.toLocaleString() : '—'}</span>
                  </div>}
                  <label style={{ fontSize: 12, color: MUTED, display: 'block' }}>Coverage Target: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{Math.round(autoTarget * 100)}%</span> at {project.rssiTargetDbm} dBm
                    <input type="range" min={70} max={99} step={1} value={Math.round(autoTarget * 100)} onChange={(e) => setAutoTarget(Number(e.target.value) / 100)} style={{ width: '100%', accentColor: GOLD, marginTop: 4 }} />
                  </label>
                  <button className="hm-smart" style={{ marginBottom: 0, marginTop: 4 }} onClick={doAutoPlace}><Sparkle size={14} weight="fill" style={{ verticalAlign: 'middle', marginRight: 6 }} />Auto-place {apCat ? apCat.model : apModel.replace('UniFi ', '')} → {Math.round(autoTarget * 100)}%</button>
                </div>
                {fixableGaps.length > 0 && <button className="hm-smart" style={{ borderColor: 'rgba(34,211,165,0.55)', color: '#4ADE80' }} onClick={doFixDeadZones}><Sparkle size={14} weight="fill" style={{ verticalAlign: 'middle', marginRight: 6 }} />Fix {fixableGaps.length} Dead Zone{fixableGaps.length === 1 ? '' : 's'} → place {fixableGaps.length} AP{fixableGaps.length === 1 ? '' : 's'}</button>}
                {fixableGaps.length === 0 && (coverage?.gaps?.length ?? 0) > 0 && <div style={{ fontSize: 12, color: DIM, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>Remaining dead pockets are too small to justify more hardware — drag an existing AP a few feet toward the worst one.</div>}
                <button className="hm-smart" onClick={doChannels}><Sparkle size={14} weight="fill" style={{ verticalAlign: 'middle', marginRight: 6 }} />Plan WiFi channels (1/6/11)</button>
                <button className="hm-smart" onClick={compute}><ArrowsClockwise size={14} weight="regular" style={{ verticalAlign: 'middle', marginRight: 6 }} />Recompute Heatmap</button>
                {aiNotes.length > 0 && <div style={{ marginTop: 6, fontSize: 12, color: DIM, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', lineHeight: 1.55 }}>{aiNotes.map((n, i) => <div key={i}>{n}</div>)}</div>}
              </PanelSection>}

              {/* ═══ SURVEY ═══ calibration · channel + inter-floor RF analysis ═══ */}
              {tab === 'survey' && floors.length > 1 && interFloor && (bleedDevices.length > 0 || interFloorHits.length > 0) && <PanelSection title="Inter-floor RF">
                <div style={{ fontSize: 12, color: DIM, lineHeight: 1.55, marginBottom: interFloorHits.length ? 8 : 0 }}>
                  {bleedDevices.length
                    ? <>Vertical signal bleed from other floors is folded into this floor&apos;s heatmap: <b style={{ color: TEXT }}>{bleedDevices.length}</b> virtual AP{bleedDevices.length === 1 ? '' : 's'} through the slab ({interFloor.params.slab.replace('_', ' ')}, {interFloor.params.slabLossPerFloorDb} dB/floor).</>
                    : <>No usable signal bleeds onto this floor — the slab isolates it well.</>}
                </div>
                {interFloorHits.length > 0 && <>
                  <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>Same-channel vertical interference</div>
                  <div className="hm-bom" style={{ maxHeight: 150, overflowY: 'auto' }}>
                    {interFloorHits.slice(0, 8).map((it, i) => (
                      <div key={i} className="hm-bom-row" style={{ gap: 8 }}>
                        <span style={{ flex: 1 }}>L{it.aLevel} ↔ L{it.bLevel} · ch {it.channel} ({it.band} GHz)</span>
                        <span style={{ color: it.severity === 'severe' ? '#F87171' : it.severity === 'moderate' ? GOLD : MUTED, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{Math.round(it.worstBleedDbm)} dBm · {it.severity}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>Stack APs on different channels floor-to-floor to cut co-channel bleed through the deck.</div>
                </>}
              </PanelSection>}

              {tab === 'survey' && chanInterference && <PanelSection title="Self-Interference (Your Placed APs)">
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 8, lineHeight: 1.5 }}>Modeled from <b style={{ color: DIM }}>this design&apos;s own APs</b> and their planned channels — not a live neighbor scan. Run <b style={{ color: DIM }}>Plan WiFi Channels</b> first if AP channels are unset.</div>
                {chanInterference.worstChannels.length > 0 ? <>
                  <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>Most-loaded channels (modeled)</div>
                  <div className="hm-bom" style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 10 }}>
                    {chanInterference.worstChannels.map((c, i) => (
                      <div key={i} className="hm-bom-row" style={{ gap: 8 }}>
                        <span style={{ flex: 1 }}>{c.band} GHz · ch {c.channel}</span>
                        <span style={{ color: MUTED, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{c.coChannel}co/{c.adjChannel}adj</span>
                        <span style={{ color: c.congestion > 66 ? '#F87171' : c.congestion > 33 ? GOLD : '#4ADE80', fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'right' }}>{c.congestion}% · {c.airtimePct}%air</span>
                      </div>
                    ))}
                  </div>
                </> : <div style={{ fontSize: 12, color: DIM, marginBottom: 10 }}>No channel congestion detected across your placed APs.</div>}
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>Recommended (cleanest first)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(['2.4', '5', '6'] as Band[]).map((b) => (
                    <div key={b} style={{ display: 'flex', gap: 8, fontSize: 12, color: DIM, alignItems: 'baseline' }}>
                      <span style={{ color: MUTED, minWidth: 42 }}>{b} GHz</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', color: TEXT }}>{chanInterference.recommend[b].slice(0, 6).join(' · ') || '—'}</span>
                    </div>
                  ))}
                </div>
              </PanelSection>}

              {tab === 'survey' && project.activeType === 'wifi_ap' && <PanelSection title="Survey Calibration">
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 8, lineHeight: 1.5 }}>Fit the RF model to real measured readings — add a survey-meter dBm at a plan location (image px), or bulk-import a walk-test CSV.</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 5, alignItems: 'end' }}>
                  <label style={{ fontSize: 12, color: MUTED }}>X px<input className="hm-sel" style={{ width: '100%' }} inputMode="numeric" value={calM.x} onChange={(e) => setCalM((m) => ({ ...m, x: e.target.value }))} placeholder={project ? String(Math.round(project.imgW / 2)) : '0'} /></label>
                  <label style={{ fontSize: 12, color: MUTED }}>Y px<input className="hm-sel" style={{ width: '100%' }} inputMode="numeric" value={calM.y} onChange={(e) => setCalM((m) => ({ ...m, y: e.target.value }))} placeholder={project ? String(Math.round(project.imgH / 2)) : '0'} /></label>
                  <label style={{ fontSize: 12, color: MUTED }}>dBm<input className="hm-sel" style={{ width: '100%' }} inputMode="numeric" value={calM.dbm} onChange={(e) => setCalM((m) => ({ ...m, dbm: e.target.value }))} placeholder="-65" /></label>
                  <button className="hm-tool" onClick={addMeasured} style={{ padding: '6px 10px' }}>Add</button>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input ref={surveyCsvRef} type="file" accept=".csv,text/csv,text/plain" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importSurveyCsv(f); e.currentTarget.value = ''; }} />
                  <button className="hm-tool" onClick={() => surveyCsvRef.current?.click()} style={{ padding: '6px 10px', flex: 1 }}><UploadSimple size={13} weight="regular" style={{ verticalAlign: 'middle', marginRight: 5 }} />Import Survey CSV</button>
                  {measured.length > 0 && <button className="hm-tool" title="Clear all readings on this floor" onClick={() => { updateMeasured(() => []); setCalResult(null); }} style={{ padding: '6px 10px' }}>Clear</button>}
                </div>
                <div style={{ fontSize: 9.5, color: MUTED, marginTop: 4 }}>CSV columns: x, y, dBm (image px) · optional 4th column servingApId. Header row auto-detected.</div>
                {measured.length > 0 && <div className="hm-bom" style={{ maxHeight: 120, overflowY: 'auto', marginTop: 8 }}>
                  {measured.map((mp, i) => (
                    <div key={i} className="hm-bom-row" style={{ gap: 8 }}>
                      <span style={{ flex: 1, fontVariantNumeric: 'tabular-nums' }}>({Math.round(mp.x)}, {Math.round(mp.y)})</span>
                      <span style={{ color: DIM, fontVariantNumeric: 'tabular-nums' }}>{mp.measuredDbm} dBm</span>
                      <button title="Remove reading" onClick={() => { updateMeasured((m) => m.filter((_, j) => j !== i)); setCalResult(null); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#F87171', display: 'inline-flex' }}><Trash size={13} weight="regular" /></button>
                    </div>
                  ))}
                </div>}
                {accuracy && <div style={{ marginTop: 9, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', fontSize: 12, color: DIM, lineHeight: 1.55 }}>
                  <div style={{ fontWeight: 700, color: TEXT, marginBottom: 2 }}>Model accuracy — validated vs {accuracy.n} reading{accuracy.n === 1 ? '' : 's'}</div>
                  <div>Mean abs. error <b style={{ color: accuracy.mae <= 3 ? '#4ADE80' : accuracy.mae <= 6 ? GOLD : '#F87171', fontVariantNumeric: 'tabular-nums' }}>{accuracy.mae.toFixed(1)} dB</b> · worst <b style={{ fontVariantNumeric: 'tabular-nums' }}>{accuracy.worst.delta > 0 ? '+' : ''}{accuracy.worst.delta.toFixed(0)} dB</b> @ ({Math.round(accuracy.worst.mp.x)}, {Math.round(accuracy.worst.mp.y)})</div>
                  {calResult && <div style={{ marginTop: 1 }}>Calibration RMSE <b style={{ fontVariantNumeric: 'tabular-nums' }}>{calResult.rmseBefore.toFixed(1)} → {calResult.rmseAfter.toFixed(1)} dB</b></div>}
                </div>}
                <div style={{ marginTop: 8, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>Map dots + delta badges come from these survey readings (toggle “Measured survey” under Layers). Live auto Wi-Fi scan is Android-only — Apple blocks RSSI reads on iOS.</div>
                <button className="hm-smart" style={{ marginTop: 10, marginBottom: 0, opacity: measured.length ? 1 : 0.5 }} disabled={!measured.length} onClick={runCalibrate}><Sparkle size={14} weight="fill" style={{ verticalAlign: 'middle', marginRight: 6 }} />Calibrate from {measured.length} reading{measured.length === 1 ? '' : 's'}</button>
                {calResult && <div style={{ marginTop: 10 }}>
                  <div className="hm-metrics">
                    <Metric label="Samples" val={`${calResult.sampleCount}`} />
                    <Metric label="RMSE Improved" val={`${calResult.improvedPct.toFixed(0)}%`} big color={calResult.improvedPct > 0 ? '#4ADE80' : DIM} />
                    <Metric label="Path-loss n" val={`${calResult.nBefore.toFixed(2)} → ${calResult.nAfter.toFixed(2)}`} />
                    <Metric label="RMSE dB" val={`${calResult.rmseBefore.toFixed(1)} → ${calResult.rmseAfter.toFixed(1)}`} />
                  </div>
                  <button className="hm-smart" style={{ marginTop: 8, marginBottom: 0 }} onClick={applyCal}><CheckCircle size={14} weight="fill" style={{ verticalAlign: 'middle', marginRight: 6 }} />Apply Calibration to This Floor</button>
                </div>}
              </PanelSection>}

              {tab === 'bom' && bom && project.devices.length > 0 && <PanelSection title="Bill of Materials">
                <div className="hm-bom">
                  {bom.rows.map((r, i) => <div key={i} className="hm-bom-row"><span>{r.item}</span><span style={{ color: MUTED }}>×{r.qty}</span><span>{r.ext ? '$' + r.ext.toLocaleString() : '—'}</span></div>)}
                  <div className="hm-bom-row" style={{ borderTop: `1px solid ${BORDER}`, marginTop: 4, paddingTop: 6, color: MUTED }}><span>Hardware</span><span /><span>${bom.total.toLocaleString()}</span></div>
                  <div className="hm-bom-row" style={{ color: MUTED }}><span>Install labor · {bom.laborHours} hrs</span><span /><span>${bom.laborCost.toLocaleString()}</span></div>
                  <div className="hm-bom-row" style={{ color: MUTED }}><span>Overhead + profit</span><span /><span>${(bom.overhead + bom.profit).toLocaleString()}</span></div>
                </div>
                {/* TURNKEY INSTALL PRICE — the number a GC bids. No competitor emits this. */}
                <div style={{ marginTop: 10, background: 'var(--bg-surface-2)', border: `1px solid ${GOLD}`, borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 12, letterSpacing: 0.5 }}>Turnkey Install Price</div>
                    <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>Hardware + labor + O&amp;P — the number you bid</div>
                  </div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 900, fontSize: 23, fontVariantNumeric: 'tabular-nums' }}>${bom.turnkey.toLocaleString()}</div>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>PoE ≈ {bom.poeWatts} W · {bom.cat6Runs} Cat6 runs{bom.recSwitch ? ` · ${bom.recSwitch.model}` : ''}{bom.recNvr ? ` · ${bom.recNvr.model}` : ''}{cableRuns ? <> · cable <b style={{ color: DIM }}>{cableRuns.totalFt.toLocaleString()} ft</b> from plan geometry (order {cableRuns.orderFt.toLocaleString()} ft)</> : null}</div>
                <button className="hm-smart" style={{ marginTop: 10 }} onClick={exportReport}><DownloadSimple size={14} weight="regular" style={{ verticalAlign: 'middle', marginRight: 6 }} />Export GC report (plan + BOM)</button>
              </PanelSection>}

              {tab === 'bom' && sched && project.devices.length > 0 && <PanelSection title="Network Schedule (IP · VLAN · PoE)">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 6px', marginBottom: 8 }}>
                  {sched.vlans.map((v) => <span key={v.id} style={{ fontSize: 12, color: DIM, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '2px 7px', fontVariantNumeric: 'tabular-nums' }}>VLAN {v.id} · {v.name} · {v.subnet}.0/24</span>)}
                </div>
                <div className="hm-bom" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {sched.rows.map((r) => (
                    <div key={r.id} className="hm-bom-row" style={{ gap: 8 }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                      <span style={{ color: MUTED, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{r.ip}</span>
                      <span style={{ color: r.port === '—' ? MUTED : GOLD, fontSize: 12, fontVariantNumeric: 'tabular-nums', minWidth: 54, textAlign: 'right' }}>{r.port}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: MUTED }}>{sched.poePorts} PoE ports · {sched.poeTotal} W · {sched.vlans.length} VLANs</div>
                <button className="hm-smart" style={{ marginTop: 10 }} onClick={pullUnifi}><Sparkle size={14} weight="fill" style={{ verticalAlign: 'middle', marginRight: 6 }} />Pull live devices from UniFi controller</button>
                {unifiMsg && <div style={{ marginTop: 6, fontSize: 12, color: unifiMsg.startsWith('✓') ? '#4ADE80' : DIM, lineHeight: 1.5 }}>{unifiMsg}</div>}
              </PanelSection>}

              {tab === 'bom' && <PanelSection title="Wi-Fi Networks (SSIDs)">
                <SsidsPanel ssids={project.ssids && project.ssids.length ? project.ssids : DEFAULT_SSIDS} onCommit={(next) => { snapshot(); patch({ ssids: next }); }} />
              </PanelSection>}

              {tab === 'design' && <PanelSection title={`Devices (${project.devices.length})`}>
                <div className="hm-list">
                  {project.devices.length === 0 && <span style={{ color: MUTED, fontSize: 12 }}>None yet — use Place, or Auto-place.</span>}
                  {project.devices.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: DIM, fontSize: 12 }}>Click to select · drag on the plan to move</span>
                      <button
                        className="hm-tool"
                        style={{ color: '#F87171', borderColor: 'rgba(248,113,113,0.3)', fontSize: 12, padding: '3px 8px' }}
                        onClick={async () => { if ((await confirmDialog({ title: 'Please confirm', message: `Remove all ${project.devices.length} devices from this plan? Walls & scale stay.`, danger: true }))) { snapshot(); patch({ devices: [] }); setSelId(null); } }}
                      >
                        <Trash size={12} weight="regular" style={{ verticalAlign: 'middle', marginRight: 4 }} />Clear all
                      </button>
                    </div>
                  )}
                  {project.devices.map((d) => (
                    <div key={d.id} className="hm-row" data-on={d.id === selId} onClick={() => setSelId(d.id)} style={{ cursor: 'pointer' }}>
                      <i style={{ background: defOf(d.typeId).color }} />
                      <span style={{ flex: 1 }}>{d.label}{d.channel != null ? ` · ch${d.channel}` : ''}</span>
                      <span style={{ color: MUTED, fontSize: 12, marginRight: 8 }}>{defOf(d.typeId).short}</span>
                      <button
                        title="Remove device"
                        onClick={(e) => { e.stopPropagation(); snapshot(); patch({ devices: project.devices.filter((x) => x.id !== d.id) }); if (selId === d.id) setSelId(null); }}
                        style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: '#F87171', display: 'inline-flex', alignItems: 'center' }}
                      >
                        <Trash size={14} weight="regular" />
                      </button>
                    </div>
                  ))}
                </div>
              </PanelSection>}
            </div>}
          </div>
        </div>
      )}

      {hover && <div style={{ position: 'fixed', left: hover.x + 14, top: hover.y + 14, background: 'rgba(13,17,23,0.96)', border: `1px solid ${BORDER}`, padding: '5px 9px', borderRadius: 7, pointerEvents: 'none', zIndex: 100, boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}>
        <div style={{ color: hover.dim ? MUTED : GOLD, fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{hover.txt}</div>
        {hover.sub && <div style={{ color: DIM, fontSize: 12, marginTop: 1 }}>{hover.sub}</div>}
      </div>}

      {modal !== 'none' && (
        <div onClick={() => setModal('none')} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, width: '100%', maxWidth: 440, padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
            {modal === 'save' ? <>
              <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>Save Coverage Design</h3>
              <label style={{ fontSize: 12, color: DIM }}>Design Name<input className="hm-sel" style={{ width: '100%', marginTop: 4 }} value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Coverage design" /></label>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginTop: 12 }}>Save to Project
                <select className="hm-sel" style={{ width: '100%', marginTop: 4 }} value={saveProj} onChange={(e) => setSaveProj(e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {projList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
                <button className="hm-btn" onClick={doSave}>{savedId ? 'Update' : 'Save'}</button>
                <button className="hm-tool" onClick={() => setModal('none')}>Cancel</button>
                {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('✓') ? '#4ADE80' : (saveMsg.startsWith('Error') || saveMsg.startsWith('Failed')) ? '#F87171' : DIM }}>{saveMsg}</span>}
              </div>
            </> : modal === 'share' ? <>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>Share Read-Only Design</h3>
              <p style={{ fontSize: 12, color: DIM, margin: '0 0 14px', lineHeight: 1.5 }}>Anyone with this link can view the marked-up plan, coverage metrics, BOM &amp; network schedule — no login, no editing.</p>
              {busy ? <p style={{ color: 'var(--text-primary)', fontSize: 13 }}>{busy}</p> : shareUrl ? <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="hm-sel" readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, fontSize: 12 }} />
                  <button className="hm-btn" onClick={copyShare}>{shareCopied ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Copied <CheckCircle size={13} weight="fill" /></span> : 'Copy'}</button>
                </div>
                <p style={{ fontSize: 12, color: DIM, margin: '10px 0 0' }}>Link expires in 30 days. Revoke any time to kill every copy instantly.</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <a className="hm-btn" href={shareUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Open Preview <ArrowUpRight size={13} weight="bold" /></a>
                  <button className="hm-tool" onClick={revokeShare} style={{ color: '#F87171' }}>Revoke Link</button>
                  <button className="hm-tool" onClick={() => setModal('none')}>Done</button>
                </div>
              </> : <p style={{ color: '#F87171', fontSize: 12 }}>{saveMsg || 'Could not create link.'}</p>}
            </> : <>
              <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>Open a Saved Design</h3>
              {saveMsg && <p style={{ fontSize: 12, color: '#F87171', margin: '0 0 8px' }}>{saveMsg}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
                {designList.length === 0 && !saveMsg && <span style={{ color: MUTED, fontSize: 12 }}>No saved designs yet — save one first.</span>}
                {designList.map((d) => (
                  <button key={d.id} className="hm-row" onClick={() => loadDesign(d.id)}>
                    <span style={{ flex: 1 }}>{d.name}</span>
                    <span style={{ color: MUTED, fontSize: 12 }}>{d.device_count} dev · {d.coverage_percent != null ? `${Math.round(d.coverage_percent)}%` : '—'}</span>
                  </button>
                ))}
              </div>
              <button className="hm-tool" style={{ marginTop: 12 }} onClick={() => setModal('none')}>Close</button>
            </>}
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        [data-hm] { color: ${TEXT}; }
        [data-hm] :is(button, select, input, textarea, a.hm-btn):focus-visible, [data-hm] .hm-cta:has(input:focus-visible) { outline: 2px solid ${GOLD}; outline-offset: 2px; }
        .hm-pad { padding: 0 16px; }
        /* ── in-shell hero header (machined, mirrors Takeoff Studio) ── */
        .hm-hero { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; padding: 14px 16px 12px; }
        .hm-hero-id { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .hm-hero-ic { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: linear-gradient(160deg,#18181B,#141b26); border: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; box-shadow: 0 1px 0 rgba(255,255,255,0.05) inset, 0 6px 14px rgba(0,0,0,0.4); }
        .hm-hero-ic svg { display: block; }
        .hm-hero-eyebrow { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 800; color: ${GOLD}; }
        .hm-hero-title { display: flex; align-items: center; gap: 10px; min-width: 0; margin-top: 2px; }
        .hm-hero-name { font-size: 19px; font-weight: 700; letter-spacing: -0.02em; color: ${TEXT}; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .hm-hero-cal { flex-shrink: 0; font-size: 12px; font-weight: 800; padding: 3px 9px; border-radius: 999px; background: var(--brand-primary-12); color: ${GOLD}; border: 1px solid var(--brand-primary-35); }
        .hm-hero-cal[data-ok="true"] { background: rgba(74,222,128,0.14); color: #4ADE80; border-color: rgba(74,222,128,0.4); }
        .hm-hero-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        @media (min-width: 1000px) { .hm-hero { padding: 16px 24px 12px; } }
        /* ── compact essential chips (coverage target / band) on the simple flow ── */
        .hm-chipset { display: inline-flex; align-items: center; gap: 5px; }
        .hm-chipset > span { font-size: 12px; font-weight: 800; color: ${MUTED}; margin-right: 2px; }
        .hm-minichip { background: rgba(255,255,255,0.04); border: 1px solid ${BORDER}; color: ${DIM}; border-radius: 999px; padding: 5px 11px; font-size: 12px; font-weight: 700; cursor: pointer; font-variant-numeric: tabular-nums; transition: background .12s, border-color .12s, color .12s; }
        .hm-minichip:hover { background: rgba(255,255,255,0.08); color: ${TEXT}; }
        .hm-minichip[data-on="true"] { background: var(--brand-primary-18); border-color: color-mix(in srgb, var(--brand-primary) 50%, transparent); color: ${GOLD}; }
        .hm-cta { display: inline-block; background: linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover)); color: #101722; font-weight: 800; font-size: 14px; padding: 11px 22px; border-radius: 12px; cursor: pointer; box-shadow: 0 4px 16px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35); transition: transform .12s, box-shadow .12s, filter .12s; }
        .hm-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 24px var(--brand-primary-35), inset 0 1px 0 rgba(255,255,255,0.35); filter: brightness(1.04); }
        .hm-cta:active { transform: translateY(0); box-shadow: 0 2px 8px var(--brand-primary-25), inset 0 1px 3px rgba(0,0,0,0.2); }
        .hm-tmpl { display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 2px; padding: 14px; border: 1px solid ${BORDER}; border-radius: 12px; background: ${RAISED}; cursor: pointer; transition: border-color .15s, transform .15s, box-shadow .15s, background .15s; }
        .hm-tmpl:hover { border-color: ${GOLD}; transform: translateY(-2px); background: #17181b; box-shadow: 0 10px 26px rgba(0,0,0,0.45), 0 0 0 1px var(--brand-primary-12); }
        .hm-tmpl:active { transform: translateY(0); box-shadow: 0 3px 10px rgba(0,0,0,0.4); }
        .hm-tmpl-ic { width: 26px; height: 26px; margin-bottom: 6px; }
        .hm-tmpl-ic svg { width: 100%; height: 100%; }
        .hm-layout { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        /* EDITOR MODE: the tool fills the /app content viewport exactly — no page scroll, no
           floaty double-scroll. Every selector is scoped to OUR OWN wrapper ([data-ss-root]),
           so nothing else in the shell is touched; .main-content-area is the /app shell's
           content element (app/app/layout.tsx), verified. */
        .main-content-area:has([data-ss-root][data-mode="editor"]) { overflow: hidden; padding-bottom: 0; }
        body:has([data-ss-root][data-mode="editor"]) { overflow: hidden; }
        .hm-toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-top: 1px solid ${BORDER}; border-bottom: 1px solid rgba(0,0,0,0.55); background: linear-gradient(180deg, #17181b, #101114); flex-wrap: wrap; position: relative; z-index: 3; box-shadow: 0 6px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05); }
        .hm-tool { background: rgba(255,255,255,0.05); border: 1px solid ${BORDER}; color: ${DIM}; border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .12s, border-color .12s, color .12s; }
        .hm-tool:hover:not(:disabled):not([data-on="true"]) { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.2); color: ${TEXT}; }
        .hm-tool:active:not(:disabled) { transform: translateY(1px); }
        .hm-tool[data-on="true"] { background: var(--brand-primary-18); border-color: ${GOLD}; color: ${GOLD}; }
        .hm-sep { width: 1px; height: 22px; background: ${BORDER}; }
        .hm-seg { display: inline-flex; border: 1px solid ${BORDER}; border-radius: 8px; overflow: hidden; }
        .hm-seg-btn { background: ${DARK}; color: ${DIM}; border: none; border-right: 1px solid ${BORDER}; padding: 6px 11px; font-size: 12px; font-weight: 700; cursor: pointer; font-variant-numeric: tabular-nums; transition: background .12s, color .12s; }
        .hm-seg-btn:last-child { border-right: none; }
        .hm-seg-btn:hover { background: rgba(255,255,255,0.06); color: ${TEXT}; }
        .hm-seg-btn[data-on="true"] { background: var(--brand-primary-18); color: ${GOLD}; }
        .hm-sel { background-color: #131418; background-image: linear-gradient(180deg, #1a1b1f, #101114); border: 1px solid rgba(255,255,255,0.13); color: ${TEXT}; border-radius: 7px; padding: 5px 8px; font-size: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05); }
        select.hm-sel, select.hm-sel-full { -webkit-appearance: none; appearance: none; background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="6"><path d="M1 1l4 4 4-4" fill="none" stroke="%23F59E0B" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'), linear-gradient(180deg, #1a1b1f, #101114); background-repeat: no-repeat; background-position: right 9px center, 0 0; background-size: 10px 6px, 100% 100%; padding-right: 26px; cursor: pointer; }
        .hm-sel:focus, .hm-sel-full:focus { outline: none; border-color: color-mix(in srgb, var(--brand-primary) 55%, transparent); box-shadow: 0 0 0 3px var(--brand-primary-12), inset 0 1px 0 rgba(255,255,255,0.05); }
        .hm-chk { display: flex; align-items: center; gap: 5px; font-size: 12px; color: ${DIM}; }
        .hm-hint { font-size: 12px; color: ${MUTED}; }
        .hm-btn { background: linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover)); color: #101722; border: none; border-radius: 7px; padding: 6px 12px; font-size: 12px; font-weight: 800; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.28); transition: filter .12s; }
        .hm-btn:hover { filter: brightness(1.07); }
        .hm-body { flex: 1; display: flex; min-height: 0; }
        .hm-canvas-wrap { flex: 1; overflow: hidden; position: relative; background: radial-gradient(ellipse 120% 90% at 50% 30%, #0b1017 0%, #05080d 100%); }
        .hm-canvas-wrap::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px); background-size: 26px 26px; box-shadow: inset 0 0 90px rgba(0,0,0,0.55), inset 0 14px 30px rgba(0,0,0,0.45); pointer-events: none; }
        .hm-tool:disabled { opacity: 0.35; cursor: default; }
        .hm-panel { width: 344px; border-left: 1px solid rgba(0,0,0,0.55); background: linear-gradient(180deg, #16171a, #121316); overflow-y: auto; padding-bottom: 48px; flex-shrink: 0; position: relative; z-index: 2; box-shadow: -18px 0 40px rgba(0,0,0,0.45), inset 1px 0 0 rgba(255,255,255,0.05); }
        .hm-chiprow { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; padding: 9px 16px; border-bottom: 1px solid ${BORDER}; background: ${DARK}; }
        .hm-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; border: 1px solid ${BORDER}; background: ${RAISED}; color: ${DIM}; font-size: 12px; font-weight: 700; cursor: pointer; transition: border-color .12s, background .12s, color .12s, opacity .12s; }
        .hm-chip i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; transition: opacity .12s; }
        .hm-chip:hover { background: rgba(255,255,255,0.05); }
        .hm-chip[data-on="true"] { color: ${TEXT}; border-color: color-mix(in srgb, var(--chip) 60%, transparent); background: color-mix(in srgb, var(--chip) 12%, ${RAISED}); }
        .hm-chip[data-on="false"] { opacity: 0.6; }
        .hm-panel-top { position: sticky; top: 0; z-index: 3; background: ${RAISED}; border-bottom: 1px solid ${BORDER}; padding: 12px 14px; box-shadow: 0 6px 14px rgba(0,0,0,0.28); }
        .hm-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .hm-tabs { display: flex; gap: 4px; margin: 12px 0 0; padding: 4px; background: ${DARK}; border: 1px solid ${BORDER}; border-radius: 10px; }
        .hm-tabbtn { flex: 1; background: transparent; border: none; color: ${DIM}; border-radius: 7px; padding: 8px 6px; font-size: 12px; font-weight: 700; letter-spacing: .2px; cursor: pointer; transition: background .12s, color .12s; }
        .hm-tabbtn:hover { background: rgba(255,255,255,0.05); color: ${TEXT}; }
        .hm-tabbtn[data-on="true"] { background: var(--brand-primary-18); color: ${GOLD}; box-shadow: inset 0 0 0 1px var(--brand-primary-35); }
        .hm-legend { display: flex; flex-wrap: wrap; gap: 6px 10px; margin-top: 10px; }
        .hm-legend span { display: flex; align-items: center; gap: 5px; font-size: 12px; color: ${DIM}; }
        .hm-legend i { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }
        .hm-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .hm-smart { width: 100%; text-align: left; background: var(--brand-primary-08); border: 1px solid var(--brand-primary-25); color: ${GOLD}; border-radius: 8px; padding: 9px 11px; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 7px; transition: background .12s, border-color .12s, box-shadow .12s; }
        .hm-smart:hover:not(:disabled) { background: var(--brand-primary-18); border-color: var(--brand-primary-35); box-shadow: 0 2px 12px var(--brand-primary-12); }
        .hm-smart:active:not(:disabled) { background: var(--brand-primary-25); }
        .hm-smart:disabled { cursor: default; }
        .hm-sel-full { width: 100%; margin-top: 3px; background: ${DARK}; color: ${TEXT}; border: 1px solid ${BORDER}; border-radius: 6px; padding: 5px 6px; font-size: 12px; cursor: pointer; }
        .hm-sheet { background: ${DARK}; color: ${DIM}; border: 1px solid ${BORDER}; border-radius: 6px; padding: 4px 9px; font-size: 12px; cursor: pointer; font-variant-numeric: tabular-nums; }
        .hm-sheet[data-on="true"] { background: var(--brand-primary-18); color: ${GOLD}; border-color: var(--brand-primary-35); font-weight: 700; }
        .hm-drop { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; background: rgba(13,17,23,0.86); border: 2px dashed ${GOLD}; border-radius: 12px; color: ${GOLD}; font-weight: 700; font-size: 15px; pointer-events: none; }
        .hm-list { display: flex; flex-direction: column; gap: 3px; max-height: 220px; overflow-y: auto; }
        .hm-row { display: flex; align-items: center; gap: 8px; background: none; border: none; color: ${TEXT}; border-radius: 7px; padding: 7px 9px; font-size: 13px; cursor: pointer; text-align: left; }
        .hm-row:hover { background: rgba(255,255,255,0.04); }
        .hm-row[data-on="true"] { background: var(--brand-primary-12); }
        .hm-row i { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .hm-bom { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
        .hm-bom-row { display: flex; justify-content: space-between; gap: 8px; color: var(--text-secondary); }
        .hm-bom-row span:first-child { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        /* ── Field mode (guided jobsite flow — identical to the mobile app) ── */
        .hm-rail { display: flex; align-items: center; gap: 7px; padding: 11px 16px; border-top: 1px solid ${BORDER}; border-bottom: 1px solid rgba(0,0,0,0.55); background: linear-gradient(180deg, #17181b, #101114); flex-wrap: wrap; position: relative; z-index: 4; box-shadow: 0 6px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05); }
        .hm-step { display: inline-flex; align-items: center; gap: 8px; padding: 8px 15px 8px 9px; border-radius: 999px; border: 1px solid ${BORDER}; background: rgba(255,255,255,0.03); color: ${DIM}; font-size: 12px; font-weight: 700; cursor: pointer; transition: border-color .15s, background .15s, color .15s, box-shadow .15s; }
        .hm-step:hover { background: rgba(255,255,255,0.06); }
        .hm-step[data-on="true"] { background: linear-gradient(180deg, var(--brand-primary-25), var(--brand-primary-12)); color: #FFD98A; border-color: color-mix(in srgb, var(--brand-primary) 55%, transparent); box-shadow: 0 0 0 3px var(--brand-primary-12), 0 4px 14px var(--brand-primary-12); }
        .hm-step[data-done="true"] .hm-step-num { background: rgba(74,222,128,0.22); color: #4ADE80; box-shadow: inset 0 0 0 1px rgba(74,222,128,0.35); }
        .hm-step-num { width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.09); font-size: 12px; font-variant-numeric: tabular-nums; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); transition: background .25s, color .25s, box-shadow .25s; }
        .hm-fieldbar { display: flex; align-items: center; gap: 10px; padding: 13px 16px; border-bottom: 1px solid rgba(0,0,0,0.6); background: linear-gradient(180deg, #0d0e11, #0a0b0d); flex-wrap: wrap; position: relative; z-index: 3; box-shadow: 0 10px 26px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04); }
        .hm-big { display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover)); color: #101722; font-weight: 800; font-size: 14.5px; padding: 12px 21px; border-radius: 12px; border: none; cursor: pointer; box-shadow: 0 4px 14px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35); transition: transform .12s, box-shadow .12s, filter .12s; }
        .hm-big:hover { transform: translateY(-1px); box-shadow: 0 8px 22px var(--brand-primary-35), inset 0 1px 0 rgba(255,255,255,0.35); filter: brightness(1.04); }
        .hm-big:active { transform: translateY(0); box-shadow: 0 2px 8px var(--brand-primary-25), inset 0 1px 3px rgba(0,0,0,0.2); }
        .hm-big[data-alt="true"] { background: linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.05)); color: ${TEXT}; border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 2px 10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07); }
        .hm-big[data-on="true"] { outline: 2px solid ${GOLD}; outline-offset: 1px; }
        .hm-fieldmsg { font-size: 14px; color: #E2E8F0; font-weight: 600; line-height: 1.5; max-width: 560px; }
        .hm-fieldstat { font-size: 27px; font-weight: 900; letter-spacing: -0.5px; color: ${TEXT}; font-variant-numeric: tabular-nums; display: inline-flex; align-items: baseline; gap: 8px; padding: 8px 16px; border-radius: 12px; background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.09), inset 0 0 0 1px rgba(255,255,255,0.07); }
        .hm-fieldstat small { font-size: 12px; font-weight: 800; color: rgba(255,255,255,0.62); }
        .hm-fieldbusy { display: flex; align-items: center; gap: 9px; padding: 8px 16px; color: #FFE000; font-size: 13px; font-weight: 700; background: linear-gradient(90deg, var(--brand-primary-12), color-mix(in srgb, var(--brand-primary) 3%, transparent) 55%, ${DARK}); border-bottom: 1px solid var(--brand-primary-25); }
        .hm-fieldbusy::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: ${GOLD}; box-shadow: 0 0 10px color-mix(in srgb, var(--brand-primary) 90%, transparent); animation: hm-pulse 1.1s ease-in-out infinite; flex-shrink: 0; }
        @keyframes hm-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.7); } }
        .hm-fieldnote { display: flex; align-items: flex-start; gap: 10px; padding: 9px 16px 9px 14px; color: #FFE000; font-size: 13px; font-weight: 600; line-height: 1.5; background: linear-gradient(180deg, var(--brand-primary-12), color-mix(in srgb, var(--brand-primary) 5%, transparent)); border-bottom: 1px solid var(--brand-primary-25); box-shadow: inset 3px 0 0 ${GOLD}; }
        .hm-fieldnote-x { background: none; border: none; color: ${MUTED}; font-size: 16px; font-weight: 800; cursor: pointer; line-height: 1; padding: 0 2px; }
        .hm-selcard { position: absolute; right: 14px; bottom: 14px; z-index: 7; background: rgba(13,17,23,0.88); border: 1px solid rgba(255,255,255,0.14); border-radius: 14px; padding: 11px 14px; display: flex; align-items: center; gap: 11px; backdrop-filter: blur(10px); box-shadow: 0 14px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08); }
        /* ── Advisor right-rail card + legacy density guard band ── */
        .hm-advisor { position: absolute; right: 14px; top: 14px; z-index: 7; width: min(320px, calc(100% - 28px)); max-height: calc(100% - 96px); display: flex; flex-direction: column; background: rgba(13,17,23,0.90); border: 1px solid rgba(255,255,255,0.14); border-radius: 14px; backdrop-filter: blur(10px); box-shadow: 0 14px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08); overflow: hidden; }
        .hm-advisor-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: none; border: none; color: ${TEXT}; cursor: pointer; padding: 10px 13px; font-size: 12px; font-weight: 800; }
        .hm-advisor-head:hover { background: rgba(255,255,255,0.04); }
        .hm-advdot { width: 8px; height: 8px; border-radius: 50%; background: ${GOLD}; box-shadow: 0 0 8px color-mix(in srgb, var(--brand-primary) 80%, transparent); display: inline-block; }
        .hm-advdot[data-bad="true"] { background: #F87171; box-shadow: 0 0 8px rgba(248,113,113,0.8); }
        .hm-advisor-body { overflow-y: auto; padding: 0 13px 13px; display: flex; flex-direction: column; gap: 8px; }
        .hm-advdict { font-size: 12px; font-weight: 700; line-height: 1.5; border-radius: 9px; padding: 9px 11px; background: rgba(74,222,128,0.10); border: 1px solid rgba(74,222,128,0.35); color: #8CE7A5; font-variant-numeric: tabular-nums; }
        .hm-advdict[data-bad="true"] { background: rgba(248,113,113,0.10); border-color: rgba(248,113,113,0.4); color: #FCA5A5; }
        .hm-advlabel { font-size: 9.5px; font-weight: 800; color: ${MUTED}; margin-top: 2px; }
        .hm-advrow { display: flex; align-items: center; gap: 8px; font-size: 12px; color: ${DIM}; }
        .hm-advrow b { color: ${TEXT}; font-weight: 700; }
        .hm-advchip { flex-shrink: 0; font-size: 9.5px; font-weight: 800; padding: 2px 8px; border-radius: 999px; }
        .hm-advchip[data-kind="ok"] { background: rgba(74,222,128,0.14); color: #4ADE80; box-shadow: inset 0 0 0 1px rgba(74,222,128,0.35); }
        .hm-advchip[data-kind="crowded"], .hm-advchip[data-kind="warn"] { background: var(--brand-primary-12); color: ${GOLD}; box-shadow: inset 0 0 0 1px var(--brand-primary-35); }
        .hm-advchip[data-kind="over"] { background: rgba(248,113,113,0.14); color: #F87171; box-shadow: inset 0 0 0 1px rgba(248,113,113,0.4); }
        .hm-guardband { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 16px; font-size: 13px; font-weight: 700; color: #FECACA; line-height: 1.5; background: linear-gradient(180deg, rgba(248,113,113,0.14), rgba(248,113,113,0.06)); border-bottom: 1px solid rgba(248,113,113,0.35); box-shadow: inset 3px 0 0 #F87171; }
        @media (max-width: 820px) {
          .hm-body { flex-direction: column; } .hm-panel { width: 100%; border-left: none; border-top: 1px solid ${BORDER}; overflow: visible; } .hm-layout { height: auto; }
          /* the canvas-wrap's children are all absolutely positioned — without this it
             collapses to 0px tall at exactly the jobsite-phone widths Field mode targets */
          .hm-canvas-wrap { min-height: 55dvh; }
          /* narrow: let the page scroll normally instead of a fixed full-height app */
          [data-ss-root][data-mode="editor"] { height: auto !important; overflow: visible !important; }
          body:has([data-ss-root][data-mode="editor"]) { overflow: auto; }
          .main-content-area:has([data-ss-root][data-mode="editor"]) { overflow: visible; }
        }
      ` }} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DEVICE DRILL-DOWN INSPECTOR  (design data — plan values, NOT live telemetry)
   Bespoke device thumbnails + a plain-language SIMPLE view and an editable,
   drillable ADVANCED view. Additive: reads the SAME network / cabling / vendor /
   capacity helpers already imported above; never touches compute / render.
   ══════════════════════════════════════════════════════════════════════════ */

// ── bespoke, recognizable device art (vector, system-colored — never emoji/photos) ──
function DeviceThumb({ typeId, size = 28 }: { typeId: DeviceTypeId; size?: number }) {
  const c = defOf(typeId).color;
  const kind =
    typeId === 'wifi_ap' ? 'ap'
      : typeId === 'camera' ? 'camera'
      : (typeId === 'motion_pir_ceiling' || typeId === 'motion_pir_wall') ? 'pir'
      : (typeId === 'smoke_detector_spot' || typeId === 'heat_detector_spot') ? 'smoke'
      : (typeId === 'access_reader' || typeId === 'door_lock') ? 'reader'
      : typeId === 'paging_speaker' ? 'speaker'
      : (typeId === 'data_jack' || typeId === 'voice_jack' || typeId === 'combo_plate' || typeId === 'cable_term') ? 'jack'
      : typeId === 'electrical_outlet' ? 'outlet'
      : 'generic';
  const common = { width: size, height: size, viewBox: '0 0 40 40', fill: 'none' as const, xmlns: 'http://www.w3.org/2000/svg' };
  const sw = 2;
  return (
    <svg {...common} aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={20} cy={20} r={19} fill="#0a0a0a" />
      {kind === 'ap' && <>
        <circle cx={20} cy={22} r={12.5} fill="#fff" stroke={c} strokeWidth={sw} />
        {[6, 9.5, 13].map((r, i) => <path key={i} d={`M ${20 - r * 0.72} ${13.5 + i * 0} A ${r} ${r} 0 0 1 ${20 + r * 0.72} ${13.5}`} transform={`translate(0 ${-(2 - i) * 2})`} stroke={c} strokeWidth={1.8} strokeLinecap="round" opacity={0.55 + i * 0.15} />)}
        <circle cx={20} cy={24} r={2.4} fill={c} />
      </>}
      {kind === 'camera' && <>
        <rect x={9} y={16} width={20} height={11} rx={5.5} fill="#f1f5f9" stroke={c} strokeWidth={sw} />
        <circle cx={25} cy={21.5} r={4.4} fill="#0a0a0a" stroke={c} strokeWidth={1.6} />
        <circle cx={25} cy={21.5} r={1.6} fill={c} />
        <rect x={16} y={10.5} width={4} height={6} rx={1.5} fill={c} />
        <rect x={13} y={9} width={10} height={2.6} rx={1.3} fill={c} />
      </>}
      {kind === 'pir' && <>
        <path d="M 8 25 A 12 12 0 0 1 32 25 Z" fill="#f1f5f9" stroke={c} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M 12 25 A 8 8 0 0 1 28 25" stroke={c} strokeWidth={1.4} opacity={0.5} />
        <path d="M 15 25 A 5 5 0 0 1 25 25" stroke={c} strokeWidth={1.4} opacity={0.7} />
        <rect x={7} y={25} width={26} height={2.6} rx={1.3} fill={c} />
      </>}
      {kind === 'smoke' && <>
        <circle cx={20} cy={20} r={12.5} fill="#f1f5f9" stroke={c} strokeWidth={sw} />
        <circle cx={20} cy={20} r={8} fill="none" stroke={c} strokeWidth={1.3} opacity={0.55} />
        <circle cx={20} cy={20} r={2.6} fill={c} />
        {[0, 60, 120, 180, 240, 300].map((a) => <line key={a} x1={20 + Math.cos(a * Math.PI / 180) * 9.5} y1={20 + Math.sin(a * Math.PI / 180) * 9.5} x2={20 + Math.cos(a * Math.PI / 180) * 11.5} y2={20 + Math.sin(a * Math.PI / 180) * 11.5} stroke={c} strokeWidth={1.4} opacity={0.5} />)}
      </>}
      {kind === 'reader' && <>
        <rect x={12} y={8} width={16} height={24} rx={3} fill="#f1f5f9" stroke={c} strokeWidth={sw} />
        <rect x={16} y={13} width={8} height={5} rx={1.2} fill="none" stroke={c} strokeWidth={1.5} />
        <circle cx={20} cy={25} r={2.2} fill={c} />
        <line x1={16} y1={30} x2={24} y2={30} stroke={c} strokeWidth={1.4} opacity={0.5} />
      </>}
      {kind === 'speaker' && <>
        <circle cx={20} cy={20} r={12.5} fill="#f1f5f9" stroke={c} strokeWidth={sw} />
        <circle cx={20} cy={20} r={5} fill="#0a0a0a" stroke={c} strokeWidth={1.5} />
        <circle cx={20} cy={20} r={1.8} fill={c} />
        {[8, 11].map((r, i) => <circle key={i} cx={20} cy={20} r={r} fill="none" stroke={c} strokeWidth={1} opacity={0.4 - i * 0.12} />)}
      </>}
      {kind === 'jack' && <>
        <rect x={11} y={8} width={18} height={24} rx={2.6} fill="#f1f5f9" stroke={c} strokeWidth={sw} />
        <rect x={15} y={14} width={10} height={8} rx={1.4} fill="#0a0a0a" stroke={c} strokeWidth={1.5} />
        <path d="M 17 14 L 17 12 L 23 12 L 23 14" stroke={c} strokeWidth={1.4} fill="none" />
        <circle cx={20} cy={27} r={1.4} fill={c} opacity={0.6} />
      </>}
      {kind === 'outlet' && <>
        <rect x={11} y={8} width={18} height={24} rx={2.6} fill="#f1f5f9" stroke={c} strokeWidth={sw} />
        {[15, 25].map((cy) => <g key={cy}><line x1={18} y1={cy - 2.5} x2={18} y2={cy - 0.5} stroke={c} strokeWidth={1.6} strokeLinecap="round" /><line x1={22} y1={cy - 2.5} x2={22} y2={cy - 0.5} stroke={c} strokeWidth={1.6} strokeLinecap="round" /><circle cx={20} cy={cy + 2} r={1.2} fill={c} /></g>)}
      </>}
      {kind === 'generic' && <>
        <rect x={10} y={10} width={20} height={20} rx={4} fill="#f1f5f9" stroke={c} strokeWidth={sw} />
        <circle cx={20} cy={20} r={3} fill={c} />
        <circle cx={20} cy={20} r={7} fill="none" stroke={c} strokeWidth={1.3} opacity={0.45} />
      </>}
    </svg>
  );
}

// ── identify manufacturer / model from the placed label against the vendor + UniFi catalogs ──
function identifyDevice(d: Device): { manufacturer: string; model: string; maxTxDbm?: number } {
  const label = d.label || '';
  const strip = (s: string) => s.replace('UniFi ', '');
  if (d.typeId === 'wifi_ap') {
    for (const v of VENDORS) {
      const m = apModelsByVendor(v).find((m) => m.model === label || strip(m.model) === label);
      if (m) return { manufacturer: m.vendor, model: m.model, maxTxDbm: Math.max(...(Object.values(m.maxTxPowerDbm) as number[])) };
    }
    const ap = UNIFI_APS.find((a) => a.model === label || strip(a.model) === label);
    if (ap) return { manufacturer: 'Ubiquiti UniFi', model: ap.model, maxTxDbm: Math.max(...Object.values(ap.txDbm)) };
    return { manufacturer: label ? '—' : '—', model: label || defOf(d.typeId).label };
  }
  if (d.typeId === 'camera') {
    const cam = UNIFI_CAMERAS.find((x) => x.model === label || strip(x.model) === label);
    if (cam) return { manufacturer: 'Ubiquiti UniFi', model: cam.model };
  }
  return { manufacturer: '—', model: label || defOf(d.typeId).label };
}

// 8-point compass label for a camera/sensor aim (0° = East, CCW+)
const AIM_DIRS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
const aimDir = (deg: number) => AIM_DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

// exact RSSI → coverage-zone verdict (Excellent / Good / Fair / Poor / No signal)
const rssiVerdict = (dbm: number) => (RSSI_ZONES.find((z) => dbm >= z.minDbm) || RSSI_ZONES[RSSI_ZONES.length - 1]).label;

// SSID band / security display helpers ---------------------------------------------------
const SSID_BAND_LABEL: Record<SsidBand, string> = { '2.4': '2.4 GHz', '5': '5 GHz', '6': '6 GHz', 'all': 'All Bands' };
const SSID_SEC_LABEL: Record<SsidSecurity, string> = { wpa2: 'WPA2', wpa3: 'WPA3', 'wpa2/3': 'WPA2/3', open: 'Open' };
const SSID_BANDS: SsidBand[] = ['all', '2.4', '5', '6'];
const SSID_SECS: SsidSecurity[] = ['wpa3', 'wpa2/3', 'wpa2', 'open'];

// Editable Wi-Fi networks (SSIDs) — real design config. Commits the whole list on every change.
function SsidsPanel({ ssids, onCommit }: { ssids: Ssid[]; onCommit: (next: Ssid[]) => void }) {
  const vlanKeys = Object.keys(VLANS) as (keyof typeof VLANS)[];
  const set = (i: number, u: Partial<Ssid>) => onCommit(ssids.map((s, j) => (j === i ? { ...s, ...u } : s)));
  const selStyle: React.CSSProperties = { fontSize: 12, padding: '2px 4px', flex: 1, minWidth: 0 };
  return (
    <div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8, lineHeight: 1.5 }}>Networks broadcast across every AP in this design. Real configuration — carried into the AP inspector and the GC report.</div>
      {ssids.map((s, i) => {
        const v = vlanFor(s.vlanKey);
        return (
          <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 8, marginBottom: 8, background: DARK }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <input className="hm-sel" value={s.name} placeholder="SSID name" onChange={(e) => set(i, { name: e.target.value })} style={{ flex: 1, minWidth: 0, fontWeight: 700 }} />
              <button title="Remove network" onClick={() => onCommit(ssids.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: '#F87171', display: 'inline-flex', alignItems: 'center' }}>
                <Trash size={14} weight="regular" />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <select className="hm-sel" value={s.vlanKey} onChange={(e) => set(i, { vlanKey: e.target.value })} style={selStyle}>
                {vlanKeys.map((k) => <option key={k} value={k}>VLAN {VLANS[k].id} · {VLANS[k].name}</option>)}
              </select>
              <select className="hm-sel" value={s.band} onChange={(e) => set(i, { band: e.target.value as SsidBand })} style={{ ...selStyle, flex: '0 0 auto', width: 78 }}>
                {SSID_BANDS.map((b) => <option key={b} value={b}>{SSID_BAND_LABEL[b]}</option>)}
              </select>
              <select className="hm-sel" value={s.security} onChange={(e) => set(i, { security: e.target.value as SsidSecurity })} style={{ ...selStyle, flex: '0 0 auto', width: 78 }}>
                {SSID_SECS.map((sec) => <option key={sec} value={sec}>{SSID_SEC_LABEL[sec]}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>{v ? `${v.subnet}.0/24` : '—'}{s.hidden ? ' · hidden' : ''}</div>
          </div>
        );
      })}
      <button className="hm-tool" style={{ width: '100%' }} onClick={() => onCommit([...ssids, { name: `Network ${ssids.length + 1}`, vlanKey: 'wifi', band: 'all', security: 'wpa3' }])}>+ Add Wi-Fi network</button>
    </div>
  );
}

// small building blocks that match the panel styling ------------------------------------
function InspRow({ label, value, mono, onClick }: { label: string; value: React.ReactNode; mono?: boolean; onClick?: () => void }) {
  const inner = (
    <>
      <span style={{ fontSize: 12, color: MUTED, flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 12, color: TEXT, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined }}>{value}</span>
      {onClick && <span style={{ color: 'var(--text-primary)', fontSize: 15, marginLeft: 8, fontWeight: 700 }}>{'›'}</span>}
    </>
  );
  if (onClick) return <button type="button" className="hm-row" onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center' }} title="View details">{inner}</button>;
  return <div style={{ display: 'flex', alignItems: 'center', padding: '5px 2px', borderBottom: `1px solid ${BORDER}` }}>{inner}</div>;
}
function InspInput({ label, value, placeholder, onChange, type = 'text', suffix }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void; type?: string; suffix?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
      <span style={{ fontSize: 12, color: MUTED, width: 96, flexShrink: 0 }}>{label}</span>
      <input className="hm-sel" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
      {suffix && <span style={{ fontSize: 12, color: MUTED }}>{suffix}</span>}
    </label>
  );
}
function InspGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5, opacity: 0.85 }}>{title}</div>
      {children}
    </div>
  );
}
function SimpleLine({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: color, marginTop: 5, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: TEXT, lineHeight: 1.45 }}>{children}</span>
    </div>
  );
}

type InspDrill = 'switch' | 'gateway' | 'clients' | 'nvr';

function DeviceInspector({ d, project, sched, bom, clientsPerAp, onChange, onDelete }: {
  d: Device; project: HeatmapProject; sched: import('@/lib/heatmap/network').Schedule | null;
  bom: import('@/lib/heatmap/bom').BomResult | null; clientsPerAp: number;
  onChange: (u: Partial<Device>) => void; onDelete: () => void;
}) {
  const def = defOf(d.typeId);
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const [drill, setDrill] = useState<InspDrill | null>(null);
  useEffect(() => { setDrill(null); }, [d.id]);

  const ident = identifyDevice(d);
  const isAp = d.typeId === 'wifi_ap';
  const isCam = d.typeId === 'camera';
  const netRow = sched?.rows.find((r) => r.id === d.id) || null;
  const hasPort = !!netRow && netRow.poeW > 0 && netRow.port !== '—';
  const pxPerFt = project.scale?.pxPerFt || 10;

  // cabling: home-run back to the rack (a placed gateway/switch, else plan center) — mirrors the BOM/report logic
  const rack = project.devices.find((x) => x.typeId === 'iot_gateway' || x.typeId === 'smart_switch')?.pos || { x: project.imgW / 2, y: project.imgH / 2 };
  const runFt = runLengthFt(d.pos, rack, pxPerFt);
  const cab = recommendCabling(d.typeId, { distanceFt: runFt });

  // AP coverage + capacity
  const band = (d.band || '5') as Band;
  const txGain = (d.txPowerDbm ?? 15) + (d.antennaGainDbi ?? 3);
  const apRadiusFt = isAp && project.scale ? Math.round(apUsableRadiusFt(project, band, txGain, project.rssiTargetDbm)) : 0;
  // exact modeled RSSI at the AP's own location (peak) — deterministic engine output, no guess
  const apSignalDbm = isAp && project.scale ? Math.round(apRssiAt(d.pos, d.pos, project, band, txGain)) : 0;
  // Wi-Fi networks this AP broadcasts (real design config; default set when the project has none)
  const ssids: Ssid[] = (project.ssids && project.ssids.length ? project.ssids : DEFAULT_SSIDS);
  const fullTx = ident.maxTxDbm ?? 23;
  const halfTx = fullTx - 3;
  const isHalf = (d.txPowerDbm ?? fullTx) <= fullTx - 2;

  // camera DORI
  const hpx = d.resolutionPx ?? 2688; const hfov = d.hfovDeg ?? 68;
  const doriFt = (pxm: number) => Math.round(doriDistanceFt(hpx, hfov, pxm));
  const camMp = (() => { const cm = UNIFI_CAMERAS.find((x) => x.model === (d.label || '')); return cm?.mp ?? Math.round((hpx * (hpx * 9 / 16)) / 1e6 * 10) / 10; })();

  // rooms this AP reaches / nearest label (plan rooms if the design carries them)
  const rooms = project.rooms || [];
  const roomsCovered = isAp ? rooms.filter((r) => Math.hypot((r.x + r.w / 2) - d.pos.x, (r.y + r.h / 2) - d.pos.y) / pxPerFt <= apRadiusFt).map((r) => r.label).filter(Boolean).slice(0, 4) : [];
  const nearestRoom = rooms.length ? rooms.slice().sort((a, b) => Math.hypot((a.x + a.w / 2) - d.pos.x, (a.y + a.h / 2) - d.pos.y) - Math.hypot((b.x + b.w / 2) - d.pos.x, (b.y + b.h / 2) - d.pos.y))[0]?.label : undefined;

  const wiredTo = d.typeId === 'smoke_detector_spot' || d.typeId === 'heat_detector_spot' ? 'the fire-alarm panel (life-safety)'
    : d.typeId === 'access_reader' ? 'the access-control panel'
    : d.typeId === 'door_lock' ? 'the door power supply'
    : d.typeId === 'paging_speaker' ? 'the paging amplifier'
    : d.typeId === 'motion_pir_wall' || d.typeId === 'motion_pir_ceiling' ? 'the alarm / access panel'
    : 'a PoE switch';
  const rangeFt = Math.round((d.rangeFt ?? (def.defaults.rangeFt as number)) || 0);
  const isMarker = MARKER_TYPES.includes(d.typeId);

  // ── SIMPLE view: zero-jargon plain language ──
  const simple: React.ReactNode[] = [];
  if (isAp) {
    if (project.scale) simple.push(<SimpleLine key="s1" color="#4ADE80">Signal at this point: <b>{apSignalDbm} dBm</b> ({rssiVerdict(apSignalDbm)}) — strongest spot.</SimpleLine>);
    if (project.scale) simple.push(<SimpleLine key="s2" color={SYSTEM_COLORS.wifi}>Coverage radius: <b>{apRadiusFt} ft</b> (at the {project.rssiTargetDbm} dBm target){roomsCovered.length ? <> — reaches <b>{roomsCovered.join(' + ')}</b></> : ''}.</SimpleLine>);
    if (hasPort) simple.push(<SimpleLine key="s3" color={SYSTEM_COLORS.power}>Plugs into: <b>PoE switch, port {netRow!.port.split('/').pop()}</b> (one cable does data + power).</SimpleLine>);
    simple.push(<SimpleLine key="s4" color="var(--text-secondary)">Capacity: <b>{clientsPerAp} client devices</b> (phones, laptops).</SimpleLine>);
  } else if (isCam) {
    if (project.scale) { simple.push(<SimpleLine key="c1" color="#4ADE80">Observation range: <b>{doriFt(62)} ft</b> (sees clearly).</SimpleLine>); simple.push(<SimpleLine key="c2" color={SYSTEM_COLORS.camera}>Recognition range: <b>{doriFt(125)} ft</b> (identifies faces).</SimpleLine>); }
    simple.push(<SimpleLine key="c3" color={SYSTEM_COLORS.wifi}>Points: <b>{aimDir(d.aimDeg ?? 0)}</b> ({(d.aimDeg ?? 0).toFixed(0)}°){nearestRoom ? <> near <b>{nearestRoom}</b></> : ''}.</SimpleLine>);
    if (hasPort) simple.push(<SimpleLine key="c4" color={SYSTEM_COLORS.power}>Plugs into: <b>PoE switch, port {netRow!.port.split('/').pop()}</b>. Records to the NVR.</SimpleLine>);
  } else if (isMarker) {
    const what = d.typeId === 'electrical_outlet' ? `${d.gang ?? 2}-plug power outlet` : d.typeId === 'data_jack' ? `${d.ports ?? 1}× network jack (RJ45)` : d.typeId === 'voice_jack' ? `${d.ports ?? 1}× phone jack (RJ11)` : d.typeId === 'combo_plate' ? 'power + network wall plate' : 'cable end-point';
    simple.push(<SimpleLine key="m1" color={def.color}>This marks <b>{what}</b> on the wall.</SimpleLine>);
    simple.push(<SimpleLine key="m2" color={MUTED}>It is a rough-in location — no coverage area of its own.</SimpleLine>);
  } else {
    simple.push(<SimpleLine key="g1" color={def.color}>This is a <b>{def.label.toLowerCase()}</b>.</SimpleLine>);
    if (rangeFt) simple.push(<SimpleLine key="g2" color={SYSTEM_COLORS.sensor}>Coverage: <b>{rangeFt} ft</b>{def.modelType === 'fov' ? ' in the direction it faces' : ' around it'}.</SimpleLine>);
    simple.push(<SimpleLine key="g3" color={SYSTEM_COLORS.power}>Wired to <b>{wiredTo}</b>.</SimpleLine>);
  }
  if (nearestRoom && !isAp && !isCam) simple.push(<SimpleLine key="loc" color={MUTED}>Located near <b>{nearestRoom}</b>.</SimpleLine>);

  // ── DRILL sub-details ──
  const swNum = netRow?.port && netRow.port !== '—' ? netRow.port.split('/')[0] : 'SW1';
  const backBar = (
    <button type="button" className="hm-row" onClick={() => setDrill(null)} style={{ width: '100%', color: 'var(--text-primary)', fontWeight: 600, marginBottom: 8 }}>
      {'‹'} back to {d.label || def.label}
    </button>
  );

  return (
    <PanelSection title={mode === 'simple' ? 'Device' : 'Device inspector'}>
      {/* header: thumbnail + identity + SIMPLE/ADVANCED toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <DeviceThumb typeId={d.typeId} size={40} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label || def.label}</div>
          <div style={{ fontSize: 12, color: MUTED }}>{def.label}{ident.manufacturer !== '—' ? ` · ${ident.manufacturer}` : ''}</div>
        </div>
      </div>
      <div className="hm-seg" role="group" aria-label="Detail level" style={{ marginBottom: 12 }}>
        <button type="button" className="hm-seg-btn" data-on={mode === 'simple'} style={{ flex: 1 }} onClick={() => { setMode('simple'); setDrill(null); }}>Simple</button>
        <button type="button" className="hm-seg-btn" data-on={mode === 'advanced'} style={{ flex: 1 }} onClick={() => setMode('advanced')}>Advanced</button>
      </div>

      {mode === 'simple' && <div>{simple}</div>}

      {mode === 'advanced' && drill === null && <div>
        {/* Identity */}
        <InspGroup title="Identity">
          <InspInput label="Name" value={d.label || ''} placeholder={def.label} onChange={(v) => onChange({ label: v })} />
          <InspRow label="Manufacturer" value={ident.manufacturer} />
          <InspRow label="Model" value={ident.model} />
          <InspInput label="MAC Address" value={d.mac || ''} placeholder="— set at install" onChange={(v) => onChange({ mac: v || undefined })} />
          <InspInput label="Serial / S-N" value={d.serial || ''} placeholder="— set at install" onChange={(v) => onChange({ serial: v || undefined })} />
          <InspInput label="Firmware" value={d.firmware || ''} placeholder="— set at install" onChange={(v) => onChange({ firmware: v || undefined })} />
          <InspInput label="Notes" value={d.notes || ''} placeholder="install notes…" onChange={(v) => onChange({ notes: v })} />
        </InspGroup>

        {/* Placement */}
        <InspGroup title="Placement">
          <InspRow label="Room / Nearest" value={nearestRoom || '—'} />
          <InspInput label="Mount Height" type="number" value={d.mountHeightFt != null ? String(d.mountHeightFt) : ''} placeholder="9" suffix="ft" onChange={(v) => onChange({ mountHeightFt: v === '' ? undefined : Math.max(0, +v) })} />
          {(def.modelType === 'camera' || def.modelType === 'fov') && (
            <label style={{ display: 'block', fontSize: 12, color: DIM, padding: '4px 2px' }}>Aim {(d.aimDeg ?? 0).toFixed(0)}° ({aimDir(d.aimDeg ?? 0)})
              <input type="range" min={0} max={360} value={d.aimDeg ?? 0} onChange={(e) => onChange({ aimDeg: +e.target.value })} style={{ width: '100%', accentColor: GOLD }} />
            </label>
          )}
        </InspGroup>

        {/* Network */}
        {!isMarker && <InspGroup title="Network">
          <InspInput label="IP Address" value={d.ipOverride || ''} placeholder={netRow?.ip || 'DHCP'} onChange={(v) => onChange({ ipOverride: v || undefined })} />
          <InspRow label="VLAN" value={netRow ? `${netRow.vlan.id} · ${netRow.vlan.name}` : '—'} />
          <InspRow label="Switch Port" value={hasPort ? netRow!.port : '—'} onClick={hasPort ? () => setDrill('switch') : undefined} />
          <InspRow label="Upstream" value="Gateway" onClick={() => setDrill('gateway')} />
        </InspGroup>}

        {/* Power / Cable */}
        {!isMarker && <InspGroup title="Power / Cable">
          <InspRow label="PoE Draw" value={cab.poeW ? `${cab.poeW} W` : '—'} />
          <InspRow label="Cable" value={cab.dataCable?.name || cab.powerCable?.name || '—'} />
          <InspRow label="Run to Rack" value={project.scale ? `${runFt} ft` : '—'} />
          <InspRow label="Jacket" value={cab.jacket} />
        </InspGroup>}

        {/* AP-only */}
        {isAp && <InspGroup title="Wi-Fi Radio">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
            <span style={{ fontSize: 12, color: MUTED, width: 96 }}>Band</span>
            <div className="hm-seg" role="group" aria-label="Band" style={{ flex: 1 }}>
              {(['2.4', '5', '6'] as Band[]).map((b) => <button key={b} type="button" className="hm-seg-btn" data-on={band === b} style={{ flex: 1 }} onClick={() => onChange({ band: b })}>{b}</button>)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
            <span style={{ fontSize: 12, color: MUTED, width: 96 }}>Tx Power</span>
            <div className="hm-seg" role="group" aria-label="Tx Power" style={{ flex: 1 }}>
              <button type="button" className="hm-seg-btn" data-on={!isHalf} style={{ flex: 1 }} onClick={() => onChange({ txPowerDbm: fullTx })}>Full</button>
              <button type="button" className="hm-seg-btn" data-on={isHalf} style={{ flex: 1 }} onClick={() => onChange({ txPowerDbm: halfTx })}>Half</button>
            </div>
          </div>
          <InspInput label="Channel" type="number" value={d.channel != null ? String(d.channel) : ''} placeholder="auto" onChange={(v) => onChange({ channel: v === '' ? undefined : Math.max(1, Math.round(+v)) })} />
          <InspRow label="Antenna Gain" value={`${d.antennaGainDbi ?? 3} dBi`} />
          {project.scale && <InspRow label="Signal at AP" value={`${apSignalDbm} dBm · ${rssiVerdict(apSignalDbm)}`} />}
          {project.scale && <InspRow label="Coverage Radius" value={`${apRadiusFt} ft`} />}
          <InspRow label="Capacity" value={`${clientsPerAp} clients`} />
          <InspRow label="Broadcasts" value={ssids.map((s) => s.name).join(', ') || '—'} onClick={() => setDrill('clients')} />
        </InspGroup>}

        {/* Camera-only */}
        {isCam && <InspGroup title="Camera / Optics">
          <InspRow label="Resolution" value={`${camMp} MP`} />
          <InspRow label="Lens / HFOV" value={`${hfov.toFixed(0)}°`} />
          {project.scale && <>
            <InspRow label="Identify" value={`${doriFt(250)} ft`} />
            <InspRow label="Recognize" value={`${doriFt(125)} ft`} />
            <InspRow label="Observe" value={`${doriFt(62)} ft`} />
            <InspRow label="Detect" value={`${doriFt(25)} ft`} />
          </>}
          <InspRow label="Night Vision" value="IR — yes" />
          <InspRow label="Storage / NVR" value={bom?.recNvr?.model || 'NVR (planned)'} onClick={() => setDrill('nvr')} />
        </InspGroup>}

        {/* Marker rough-in */}
        {isMarker && <InspGroup title="Rough-In">
          {d.gang != null && <InspRow label="Gang" value={`${GANG_LABEL[d.gang] || d.gang}`} />}
          {d.ports != null && <InspRow label="Ports" value={`${d.ports}`} />}
          {d.gender && <InspRow label="Connector" value={d.gender === 'M' ? 'Plug (male)' : 'Jack (female)'} />}
          <InspRow label="Cable" value={cab.dataCable?.name || cab.powerCable?.name || '—'} />
        </InspGroup>}

        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginBottom: 8 }}>Values are from the <b>design</b> (plan model), not a live device. Verify against the installed hardware.</div>
        <button className="hm-tool" style={{ color: '#F87171', borderColor: 'rgba(248,113,113,0.3)', width: '100%' }} onClick={onDelete}>Delete Device</button>
      </div>}

      {/* ── DRILL: switch ── */}
      {mode === 'advanced' && drill === 'switch' && <div>
        {backBar}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <DeviceThumb typeId="iot_gateway" size={32} />
          <div><div style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>{bom?.recSwitch?.model || 'PoE switch'}</div><div style={{ fontSize: 12, color: MUTED }}>Switch {swNum} · serves {d.label || def.label}</div></div>
        </div>
        <InspRow label="This Device Port" value={netRow?.port || '—'} mono />
        <InspRow label="VLAN" value={netRow ? `${netRow.vlan.id} · ${netRow.vlan.name}` : '—'} />
        <InspRow label="PoE Ports Used" value={sched ? `${sched.poePorts}` : '—'} />
        <InspRow label="PoE Budget" value={bom?.recSwitch ? `${sched?.poeTotal ?? 0} / ${bom.recSwitch.poeBudgetW} W` : '—'} />
        <div style={{ fontSize: 12, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>Planned switch + port assignment from the network schedule (design, not a live switch).</div>
      </div>}

      {/* ── DRILL: gateway ── */}
      {mode === 'advanced' && drill === 'gateway' && <div>
        {backBar}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <DeviceThumb typeId="iot_gateway" size={32} />
          <div><div style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>Core Gateway</div><div style={{ fontSize: 12, color: MUTED }}>Upstream of {d.label || def.label}</div></div>
        </div>
        <InspRow label="Role" value="Router / firewall / DHCP" />
        <InspRow label="Mgmt IP" value={`${VLANS.mgmt.subnet}.1`} mono />
        <InspRow label="VLANs Routed" value={sched ? `${sched.vlans.length}` : '—'} />
        <InspRow label="Path" value={`${d.label || def.label} → ${swNum} → gateway`} />
        <div style={{ fontSize: 12, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>Modeled upstream path from the design. Place an IoT gateway / switch to pin the physical rack location.</div>
      </div>}

      {/* ── DRILL: this AP's networks + the real devices in the design ── */}
      {mode === 'advanced' && drill === 'clients' && <div>
        {backBar}
        <InspRow label="Client Capacity" value={`${clientsPerAp} client devices`} />
        {project.scale && <InspRow label="Coverage Radius" value={`${apRadiusFt} ft`} />}

        {/* SSIDs this AP broadcasts — each with its VLAN / band / security + DHCP scope */}
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', margin: '12px 0 5px', opacity: 0.85 }}>Broadcasts ({ssids.length} SSID{ssids.length === 1 ? '' : 's'})</div>
        {ssids.map((s, i) => {
          const v = vlanFor(s.vlanKey);
          return (
            <div key={i} style={{ padding: '6px 8px', border: `1px solid ${BORDER}`, borderRadius: 8, marginBottom: 6, background: DARK }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{s.name}</span>
                {s.hidden && <span style={{ fontSize: 9.5, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '0 5px' }}>hidden</span>}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: DIM }}>{SSID_BAND_LABEL[s.band]} · {SSID_SEC_LABEL[s.security]}</span>
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                {v ? `${v.subnet}.0/24 · VLAN ${v.id} (${v.name})` : `VLAN ${s.vlanKey}`}
              </div>
            </div>
          );
        })}

        {/* the ACTUAL placed devices in this design that are on the network */}
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', margin: '12px 0 5px', opacity: 0.85 }}>Devices on this network (from your design)</div>
        {sched && sched.rows.length > 0 ? (
          <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              <thead><tr style={{ position: 'sticky', top: 0, background: RAISED }}>
                {['Device', 'IP', 'VLAN', 'Port'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: MUTED, fontWeight: 700, borderBottom: `1px solid ${BORDER}` }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {sched.rows.map((r) => (
                  <tr key={r.id} style={{ background: r.id === d.id ? 'var(--brand-primary-12)' : undefined }}>
                    <td style={{ padding: '5px 8px', color: r.id === d.id ? GOLD : TEXT, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{r.label}</td>
                    <td style={{ padding: '5px 8px', color: DIM, borderBottom: `1px solid ${BORDER}` }}>{r.ip}</td>
                    <td style={{ padding: '5px 8px', color: DIM, borderBottom: `1px solid ${BORDER}` }}>{r.vlan.id}</td>
                    <td style={{ padding: '5px 8px', color: r.port === '—' ? MUTED : DIM, borderBottom: `1px solid ${BORDER}` }}>{r.port}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div style={{ fontSize: 12, color: MUTED }}>No network devices placed yet.</div>}
        <div style={{ fontSize: 12, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>Every row is a real device in this design with its assigned IP · VLAN · switch-port. MACs/serials are filled in by the installer at commissioning — never fabricated.</div>
      </div>}

      {/* ── DRILL: NVR ── */}
      {mode === 'advanced' && drill === 'nvr' && <div>
        {backBar}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <DeviceThumb typeId="camera" size={32} />
          <div><div style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>{bom?.recNvr?.model || 'Network video recorder'}</div><div style={{ fontSize: 12, color: MUTED }}>Records {d.label || def.label}</div></div>
        </div>
        {(() => {
          const brMbps = Math.max(2, Math.min(12, Math.round(camMp * 1.1)));
          const gbDay = Math.round(brMbps * 10.8);
          return <>
            <InspRow label="This Camera" value={`${camMp} MP · ${hfov.toFixed(0)}°`} />
            <InspRow label="Bitrate" value={`${brMbps} Mbps`} />
            <InspRow label="Storage / Day" value={`${gbDay} GB`} />
            <InspRow label="14-Day Retention" value={`${Math.round(gbDay * 14 / 1000 * 10) / 10} TB`} />
          </>;
        })()}
        <div style={{ fontSize: 12, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>Storage is a design estimate (H.265, continuous). Real usage depends on motion, scene and codec.</div>
      </div>}
    </PanelSection>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 14px', borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
function Metric({ label, val, big, color }: { label: string; val: string; big?: boolean; color?: string }) {
  return (
    <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 12, color: MUTED }}>{label}</div>
      <div style={{ fontSize: big ? 20 : 14, fontWeight: 800, color: color || TEXT, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
    </div>
  );
}
function DeviceEditor({ d, onChange, onDelete }: { d: Device; onChange: (u: Partial<Device>) => void; onDelete: () => void }) {
  const def = defOf(d.typeId);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input className="hm-sel" value={d.label || ''} onChange={(e) => onChange({ label: e.target.value })} placeholder="Label" />
      {(def.modelType === 'camera' || def.modelType === 'fov') && <label style={{ fontSize: 12, color: DIM }}>Aim {(d.aimDeg ?? 0).toFixed(0)}°<input type="range" min={0} max={360} value={d.aimDeg ?? 0} onChange={(e) => onChange({ aimDeg: +e.target.value })} style={{ width: '100%' }} /></label>}
      {def.modelType === 'camera' && <label style={{ fontSize: 12, color: DIM }}>HFOV {(d.hfovDeg ?? 68).toFixed(0)}°<input type="range" min={20} max={130} value={d.hfovDeg ?? 68} onChange={(e) => onChange({ hfovDeg: +e.target.value })} style={{ width: '100%' }} /></label>}
      {def.modelType === 'rf' && d.typeId === 'wifi_ap' && <label style={{ fontSize: 12, color: DIM }}>Tx {(d.txPowerDbm ?? 15)} dBm<input type="range" min={3} max={26} value={d.txPowerDbm ?? 15} onChange={(e) => onChange({ txPowerDbm: +e.target.value })} style={{ width: '100%' }} /></label>}
      {(def.modelType === 'radius' || def.modelType === 'spl' || def.modelType === 'fov') && <label style={{ fontSize: 12, color: DIM }}>Range {(d.rangeFt ?? (def.defaults.rangeFt as number))} ft<input type="range" min={4} max={120} value={d.rangeFt ?? (def.defaults.rangeFt as number)} onChange={(e) => onChange({ rangeFt: +e.target.value })} style={{ width: '100%' }} /></label>}
      <button className="hm-tool" style={{ color: '#F87171', borderColor: 'rgba(248,113,113,0.3)' }} onClick={onDelete}>Delete Device</button>
    </div>
  );
}
