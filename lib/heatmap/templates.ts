/** Prebuilt starter designs — seeded in FEET, converted to plan pixels by the tool. */
import type { DeviceTypeId, Env, WallMaterialId } from './types';

export interface TmplRoom { x: number; y: number; w: number; h: number; label?: string }
export interface TmplWall { a: [number, number]; b: [number, number]; material: WallMaterialId }
export interface TmplDevice { typeId: DeviceTypeId; x: number; y: number; aimDeg?: number; label?: string }
export interface TemplateSpec {
  id: string; name: string; desc: string; env: Env; icon: string;
  ftW: number; ftH: number; pxPerFt: number; activeType?: DeviceTypeId;
  rooms: TmplRoom[]; walls: TmplWall[]; devices: TmplDevice[];
}

const box = (x: number, y: number, w: number, h: number, m: WallMaterialId): TmplWall[] => ([
  { a: [x, y], b: [x + w, y], material: m }, { a: [x + w, y], b: [x + w, y + h], material: m },
  { a: [x + w, y + h], b: [x, y + h], material: m }, { a: [x, y + h], b: [x, y], material: m },
]);

const ICON_GOLF = '<svg viewBox="0 0 24 24" fill="none" stroke="#FFE600" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v18"/><path d="M7 4h9l-2.4 3L16 10H7"/><path d="M3 21h9"/></svg>';
const ICON_OFFICE = '<svg viewBox="0 0 24 24" fill="none" stroke="#FFE600" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/><path d="M2 21h20"/></svg>';
const ICON_WHSE = '<svg viewBox="0 0 24 24" fill="none" stroke="#FFE600" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V9l9-5 9 5v12"/><path d="M2 21h20"/><rect x="9" y="13" width="6" height="8"/></svg>';

/* ── Golf simulator bays (Full-Swing style) ── */
const GOLF: TemplateSpec = {
  id: 'golf_bay', name: 'Golf Simulator Bays', desc: '4 hitting bays + lounge · sim TVs, G6 cams, APs',
  env: 'office', icon: ICON_GOLF, ftW: 64, ftH: 44, pxPerFt: 12, activeType: 'wifi_ap',
  rooms: [
    { x: 2, y: 2, w: 14, h: 20, label: 'BAY 1' }, { x: 17, y: 2, w: 14, h: 20, label: 'BAY 2' },
    { x: 32, y: 2, w: 14, h: 20, label: 'BAY 3' }, { x: 47, y: 2, w: 15, h: 20, label: 'BAY 4' },
    { x: 2, y: 26, w: 60, h: 16, label: 'LOUNGE / BAR' },
  ],
  walls: [
    ...box(2, 2, 60, 40, 'brick'),
    { a: [16, 2], b: [16, 22], material: 'drywall' }, { a: [31, 2], b: [31, 22], material: 'drywall' }, { a: [46, 2], b: [46, 22], material: 'drywall' },
    { a: [2, 24], b: [62, 24], material: 'drywall' },
  ],
  devices: [
    { typeId: 'wifi_ap', x: 16, y: 13, label: 'UniFi U6 Pro' }, { typeId: 'wifi_ap', x: 48, y: 13, label: 'UniFi U6 Pro' }, { typeId: 'wifi_ap', x: 32, y: 34, label: 'UniFi U6 Pro' },
    { typeId: 'camera', x: 9, y: 3, aimDeg: 90, label: 'G6 Bullet' }, { typeId: 'camera', x: 24, y: 3, aimDeg: 90, label: 'G6 Bullet' },
    { typeId: 'camera', x: 39, y: 3, aimDeg: 90, label: 'G6 Bullet' }, { typeId: 'camera', x: 54, y: 3, aimDeg: 90, label: 'G6 Bullet' },
    { typeId: 'display', x: 10, y: 41, label: 'Lounge TV' }, { typeId: 'display', x: 54, y: 41, label: 'Lounge TV' },
    { typeId: 'motion_pir_ceiling', x: 32, y: 13 }, { typeId: 'thermostat', x: 60, y: 34 },
    { typeId: 'smart_plug', x: 4, y: 34 }, { typeId: 'door_lock', x: 32, y: 42, label: 'Entry' },
  ],
};

/* ── Small office floor ── */
const OFFICE: TemplateSpec = {
  id: 'office', name: 'Office Floor', desc: 'Reception, open plan, offices, conference',
  env: 'office', icon: ICON_OFFICE, ftW: 96, ftH: 60, pxPerFt: 9, activeType: 'wifi_ap',
  rooms: [
    { x: 2, y: 2, w: 26, h: 18, label: 'RECEPTION' }, { x: 30, y: 2, w: 14, h: 18, label: 'SERVER' },
    { x: 2, y: 22, w: 20, h: 16, label: 'OFFICE' }, { x: 2, y: 40, w: 20, h: 18, label: 'OFFICE' },
    { x: 24, y: 22, w: 44, h: 36, label: 'OPEN OFFICE' }, { x: 70, y: 22, w: 24, h: 20, label: 'CONFERENCE' },
    { x: 70, y: 44, w: 24, h: 14, label: 'BREAK' },
  ],
  walls: [
    ...box(2, 2, 92, 56, 'brick'),
    { a: [28, 2], b: [28, 20], material: 'drywall' }, { a: [44, 2], b: [44, 20], material: 'drywall' }, { a: [2, 20], b: [68, 20], material: 'drywall' },
    { a: [22, 22], b: [22, 58], material: 'drywall' }, { a: [2, 40], b: [22, 40], material: 'drywall' },
    { a: [68, 20], b: [68, 58], material: 'glass' }, { a: [70, 42], b: [94, 42], material: 'drywall' },
  ],
  devices: [
    { typeId: 'wifi_ap', x: 15, y: 11, label: 'UniFi U6 Pro' }, { typeId: 'wifi_ap', x: 46, y: 40, label: 'UniFi U6 Pro' },
    { typeId: 'wifi_ap', x: 82, y: 30, label: 'UniFi U6 Pro' }, { typeId: 'wifi_ap', x: 12, y: 48, label: 'UniFi U6 Pro' },
    { typeId: 'camera', x: 4, y: 3, aimDeg: 40, label: 'G6 Dome' }, { typeId: 'camera', x: 46, y: 24, aimDeg: 90, label: 'G6 Dome' },
    { typeId: 'camera', x: 92, y: 3, aimDeg: 140, label: 'G6 Dome' },
    { typeId: 'access_reader', x: 27, y: 11, label: 'Front door' }, { typeId: 'display', x: 82, y: 23, label: 'Conf display' },
    { typeId: 'motion_pir_ceiling', x: 46, y: 40 }, { typeId: 'motion_pir_wall', x: 3, y: 30 },
    { typeId: 'smoke_detector_spot', x: 15, y: 11 }, { typeId: 'smoke_detector_spot', x: 46, y: 40 }, { typeId: 'smoke_detector_spot', x: 82, y: 50 },
  ],
};

/* ── Distribution warehouse ── */
const WAREHOUSE: TemplateSpec = {
  id: 'warehouse', name: 'Warehouse', desc: 'Open floor + office + dock · long-range APs',
  env: 'open', icon: ICON_WHSE, ftW: 160, ftH: 110, pxPerFt: 6, activeType: 'wifi_ap',
  rooms: [
    { x: 2, y: 2, w: 156, h: 106, label: 'WAREHOUSE' }, { x: 2, y: 2, w: 34, h: 24, label: 'OFFICE' },
    { x: 120, y: 86, w: 38, h: 22, label: 'LOADING DOCK' },
  ],
  walls: [
    ...box(2, 2, 156, 106, 'cinderblock'),
    { a: [36, 2], b: [36, 26], material: 'drywall' }, { a: [2, 26], b: [36, 26], material: 'drywall' },
    { a: [120, 86], b: [120, 108], material: 'cinderblock' },
  ],
  devices: [
    { typeId: 'wifi_ap', x: 45, y: 55, label: 'UniFi U6 Enterprise' }, { typeId: 'wifi_ap', x: 90, y: 30, label: 'UniFi U6 Enterprise' },
    { typeId: 'wifi_ap', x: 90, y: 82, label: 'UniFi U6 Enterprise' }, { typeId: 'wifi_ap', x: 135, y: 55, label: 'UniFi U6 LR (Long-Range)' },
    { typeId: 'camera', x: 6, y: 30, aimDeg: 40, label: 'G6 Bullet' }, { typeId: 'camera', x: 154, y: 6, aimDeg: 135, label: 'G6 Bullet' },
    { typeId: 'camera', x: 6, y: 104, aimDeg: -40, label: 'G6 Bullet' }, { typeId: 'camera', x: 154, y: 104, aimDeg: 225, label: 'G6 Bullet' },
    { typeId: 'heat_detector_spot', x: 45, y: 40 }, { typeId: 'heat_detector_spot', x: 90, y: 55 }, { typeId: 'heat_detector_spot', x: 130, y: 60 },
    { typeId: 'motion_pir_ceiling', x: 60, y: 90 }, { typeId: 'ev_charger', x: 139, y: 97, label: 'Dock charger' },
    { typeId: 'access_reader', x: 34, y: 14, label: 'Office door' }, { typeId: 'paging_speaker', x: 90, y: 55 },
  ],
};

export const TEMPLATES: TemplateSpec[] = [GOLF, OFFICE, WAREHOUSE];
