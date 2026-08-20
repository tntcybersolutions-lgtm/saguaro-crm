/**
 * Saguaro Field — Shared TypeScript Types
 * Used across: mobile field app, CRM dashboard, API routes
 */

/* ── Drawings ── */
export interface Drawing {
  id: string;
  project_id: string;
  tenant_id?: string;
  name: string;
  sheet?: string;
  description?: string;
  drawing_number?: string;
  file_url: string;
  thumbnail_url?: string;
  revision?: string;
  discipline?: string;
  uploaded_by?: string;
  created_at: string;
  updated_at?: string;
}

/* ── Floor Plan Pins ── */
export type PinType =
  | 'location'
  | 'photo'
  | 'punch'
  | 'rfi'
  | 'note'
  | 'measurement'
  | 'issue';

export interface FloorPin {
  id: string;
  project_id: string;
  drawing_id: string;
  tenant_id?: string;
  pin_type: PinType | string;
  /** Percentage from left edge of drawing image */
  x_pct: number;
  /** Percentage from top edge of drawing image */
  y_pct: number;
  /** Legacy aliases kept for backwards compat */
  x_percent?: number;
  y_percent?: number;
  label: string;
  note?: string | null;
  photo_url?: string | null;
  linked_item_type?: string | null;
  linked_item_id?: string | null;
  resolved: boolean;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/* ── Room Polygons / Progress ── */
export interface PolygonPoint {
  x: number; // % from left
  y: number; // % from top
}

export type RoomStatus = 'not_started' | 'in_progress' | 'blocked' | 'complete';

export interface RoomPolygon {
  id: string;
  project_id: string;
  drawing_id?: string | null;
  tenant_id?: string;
  room_name: string;
  floor_id?: string | null;
  polygon_points?: PolygonPoint[] | null;
  percent_complete: number;
  status: RoomStatus | string;
  trade?: string | null;
  notes?: string | null;
  color?: string | null;
  updated_by?: string;
  updated_at?: string;
  created_at?: string;
}

/* ── Markup ── */
export type MarkupTool = 'freehand' | 'line' | 'arrow' | 'text' | 'highlight';

export interface MarkupPoint {
  x: number;
  y: number;
}

export interface MarkupAction {
  id?: string;
  tool: MarkupTool;
  color: string;
  points: MarkupPoint[];
  text?: string;
  lineWidth?: number;
  opacity?: number;
}

export interface DrawingMarkup {
  id: string;
  project_id: string;
  drawing_id: string;
  actions: MarkupAction[];
  composite_url?: string | null;
  created_by?: string;
  created_at: string;
}

/* ── API response shapes ── */
export interface PinsResponse {
  pins: FloorPin[];
  error?: string;
}

export interface RoomsResponse {
  rooms: RoomPolygon[];
  error?: string;
}

export interface DrawingsResponse {
  drawings: Drawing[];
  error?: string;
}

export interface PinResponse {
  pin: FloorPin;
  error?: string;
}

export interface RoomResponse {
  room: RoomPolygon;
  error?: string;
}

/* ── Offline queue ── */
export interface QueuedFieldAction {
  url: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body: string;
  contentType: string;
  isFormData: boolean;
}

/* ── UI state helpers ── */
export type FieldView = 'list' | 'viewer';
export type FieldMode = 'view' | 'pin' | 'room' | 'markup';

export const PIN_TYPE_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  location:    { color: '#3B82F6', icon: '📍', label: 'Location' },
  photo:       { color: '#22C55E', icon: '📷', label: 'Photo' },
  punch:       { color: '#EF4444', icon: '⚠️', label: 'Punch' },
  rfi:         { color: '#8B5CF6', icon: '❓', label: 'RFI' },
  note:        { color: '#D4A017', icon: '📝', label: 'Note' },
  measurement: { color: '#06B6D4', icon: '📏', label: 'Measurement' },
  issue:       { color: '#F97316', icon: '⚠',  label: 'Issue' },
};

export const HEAT_COLORS: { max: number; color: string; label: string }[] = [
  { max: 0,   color: '#374151', label: 'Not started' },
  { max: 25,  color: '#EF4444', label: '1-25%' },
  { max: 50,  color: '#F97316', label: '26-50%' },
  { max: 75,  color: '#EAB308', label: '51-75%' },
  { max: 99,  color: '#3B82F6', label: '76-99%' },
  { max: 100, color: '#22C55E', label: 'Complete' },
];

export function heatColor(pct: number): string {
  for (const h of HEAT_COLORS) {
    if (pct <= h.max) return h.color;
  }
  return '#22C55E';
}
