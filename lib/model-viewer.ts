/**
 * model-viewer — the pure half of the job's 3D Models tool.
 *
 * A model is just a job file (project_files row) whose name ends in .ifc,
 * .glb or .gltf. Nothing here touches three.js, web-ifc or the DOM, so all of
 * it runs under jest: file-type detection, unit conversion and formatting,
 * and flattening web-ifc's `{ type, value }` wrapped lines into plain
 * label/value rows for the properties panel.
 */

export type ModelFormat = 'ifc' | 'glb' | 'gltf';

export const MODEL_EXTENSIONS: readonly ModelFormat[] = ['ifc', 'glb', 'gltf'];

/** The model format of a file, from its name first and its MIME type second. */
export function detectModelFormat(fileName?: string | null, mime?: string | null): ModelFormat | null {
  const clean = String(fileName || '').split('?')[0].split('#')[0].trim().toLowerCase();
  const dot = clean.lastIndexOf('.');
  const ext = dot >= 0 ? clean.slice(dot + 1) : '';
  if (ext === 'ifc') return 'ifc';
  if (ext === 'glb') return 'glb';
  if (ext === 'gltf') return 'gltf';
  // A name with a different real extension (.pdf, .zip) is not a model,
  // whatever MIME type the browser guessed.
  if (ext && ext.length <= 5 && !/\s/.test(ext)) return null;
  const m = String(mime || '').toLowerCase();
  if (m === 'model/gltf-binary') return 'glb';
  if (m === 'model/gltf+json') return 'gltf';
  if (m === 'model/ifc' || m === 'application/ifc' || m === 'application/x-ifc') return 'ifc';
  return null;
}

export const isModelFile = (fileName?: string | null, mime?: string | null): boolean =>
  detectModelFormat(fileName, mime) !== null;

/** The `accept` attribute for the upload picker. */
export const MODEL_ACCEPT = '.ifc,.glb,.gltf,model/gltf-binary,model/gltf+json';

/** Files larger than this are refused before download — a phone runs out of
 *  memory long before the parser does, and a refusal beats a crashed tab. */
export const MAX_MODEL_BYTES = 400 * 1024 * 1024;

/* ── Units ─────────────────────────────────────────────────────────────── */

export type LengthUnit = 'm' | 'ft';
export const METERS_PER_FOOT = 0.3048;

export const metersToFeet = (m: number): number => m / METERS_PER_FOOT;
export const feetToMeters = (ft: number): number => ft * METERS_PER_FOOT;

/**
 * Feet and inches to the nearest 1/8", the way a tape reads: 10' 8 1/4".
 * Carries cleanly (11' 11 15/16" rounds up to 12' 0").
 */
export function formatFeetInches(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  const neg = meters < 0;
  const eighths = Math.round(Math.abs(metersToFeet(meters)) * 12 * 8);
  const ft = Math.floor(eighths / 96);
  const remEighths = eighths - ft * 96;
  const inches = Math.floor(remEighths / 8);
  let frac = remEighths - inches * 8;
  let num = frac;
  let den = 8;
  while (num > 0 && num % 2 === 0) { num /= 2; den /= 2; }
  frac = num;
  const inchText = frac ? `${inches} ${frac}/${den}"` : `${inches}"`;
  return `${neg ? '-' : ''}${ft}' ${inchText}`;
}

/** A measured distance for display in the chosen unit. */
export function formatDistance(meters: number, unit: LengthUnit): string {
  if (!Number.isFinite(meters)) return '—';
  if (unit === 'ft') return formatFeetInches(meters);
  const abs = Math.abs(meters);
  if (abs < 1) return `${(meters * 1000).toFixed(0)} mm`;
  return `${meters.toFixed(abs < 100 ? 3 : 2)} m`;
}

/** File size for the list: 812 KB, 14.2 MB. */
export function formatBytes(n?: number | null): string {
  const b = Number(n) || 0;
  if (b <= 0) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/* ── IFC property flattening ───────────────────────────────────────────── */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * web-ifc returns every attribute wrapped — `{ type: 1, value: 'Wall-01' }`,
 * a reference as `{ type: 5, value: 123 }`, an enum as `{ type: 3, value:
 * 'NOTDEFINED' }`. This reads the plain value out of any of those shapes.
 */
export function ifcValue(v: any): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) {
    const parts = v.map(ifcValue).filter((x) => x !== null && x !== '');
    return parts.length ? parts.join(', ') : null;
  }
  if (typeof v === 'object' && 'value' in v) return ifcValue(v.value);
  return null;
}

/** An IFC string value: IFC encodes non-ASCII as \X2\00E9\X0\ — decode it. */
export function ifcText(v: any): string {
  const raw = ifcValue(v);
  if (raw === null) return '';
  return String(raw)
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_m, hex: string) => {
      let out = '';
      for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
      return out;
    })
    .replace(/\\S\\(.)/g, (_m, c: string) => String.fromCharCode(c.charCodeAt(0) + 128))
    .trim();
}

/** IFCWALLSTANDARDCASE → "Wall Standard Case"; IFCDOOR → "Door". */
export function ifcTypeLabel(typeName?: string | null): string {
  const t = String(typeName || '').trim();
  if (!t) return '';
  const KNOWN: Record<string, string> = {
    IFCWALLSTANDARDCASE: 'Wall', IFCWALL: 'Wall', IFCSLAB: 'Slab', IFCBEAM: 'Beam', IFCCOLUMN: 'Column',
    IFCDOOR: 'Door', IFCWINDOW: 'Window', IFCROOF: 'Roof', IFCSTAIR: 'Stair', IFCSTAIRFLIGHT: 'Stair Flight',
    IFCRAILING: 'Railing', IFCMEMBER: 'Member', IFCPLATE: 'Plate', IFCCOVERING: 'Covering',
    IFCFURNISHINGELEMENT: 'Furnishing', IFCFURNITURE: 'Furniture', IFCSPACE: 'Space', IFCOPENINGELEMENT: 'Opening',
    IFCBUILDINGELEMENTPROXY: 'Generic Element', IFCFLOWSEGMENT: 'Flow Segment', IFCFLOWTERMINAL: 'Flow Terminal',
    IFCFLOWFITTING: 'Flow Fitting', IFCDUCTSEGMENT: 'Duct', IFCPIPESEGMENT: 'Pipe', IFCFOOTING: 'Footing',
    IFCCURTAINWALL: 'Curtain Wall', IFCRAMP: 'Ramp', IFCBUILDINGSTOREY: 'Level', IFCSITE: 'Site', IFCBUILDING: 'Building',
  };
  const up = t.toUpperCase();
  if (KNOWN[up]) return KNOWN[up];
  const body = up.startsWith('IFC') ? t.slice(3) : t;
  // Mixed case (IfcWallStandardCase) splits on capitals; all caps is one word.
  const spaced = /[a-z]/.test(body) ? body.replace(/([a-z])([A-Z])/g, '$1 $2') : body;
  return spaced.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface PropRow { group: string; label: string; value: string }

const fmtVal = (v: string | number | boolean | null): string => {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
  return v;
};

/**
 * Property sets (from properties.getPropertySets(..., recursive=true)) into
 * rows. Handles IfcPropertySet (HasProperties → IfcPropertySingleValue
 * NominalValue / enumerated / list) and IfcElementQuantity (Quantities →
 * LengthValue, AreaValue, VolumeValue, CountValue, WeightValue).
 */
export function flattenPropertySets(psets: any[] | null | undefined): PropRow[] {
  const out: PropRow[] = [];
  for (const set of psets || []) {
    if (!set || typeof set !== 'object') continue;
    const group = ifcText(set.Name) || 'Properties';
    const items: any[] = Array.isArray(set.HasProperties) ? set.HasProperties
      : Array.isArray(set.Quantities) ? set.Quantities : [];
    for (const p of items) {
      if (!p || typeof p !== 'object') continue;
      const label = ifcText(p.Name);
      if (!label) continue;
      const raw =
        p.NominalValue ?? p.EnumerationValues ?? p.ListValues ??
        p.LengthValue ?? p.AreaValue ?? p.VolumeValue ?? p.CountValue ?? p.WeightValue ?? p.TimeValue ??
        p.UpperBoundValue ?? null;
      const plain = ifcValue(raw);
      const value = fmtVal(typeof plain === 'string' ? ifcText(plain) : plain);
      if (value === '') continue;
      out.push({ group, label, value });
    }
  }
  return out;
}

/**
 * Material names from properties.getMaterialsProperties(..., recursive=true).
 * Covers IfcMaterial, IfcMaterialList, IfcMaterialLayerSet(Usage),
 * IfcMaterialProfileSet and IfcMaterialConstituentSet. De-duplicated, in order.
 */
export function materialNames(mats: any[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (s: string) => { const t = s.trim(); if (t && !seen.has(t)) { seen.add(t); out.push(t); } };
  const walk = (m: any, depth: number) => {
    if (!m || typeof m !== 'object' || depth > 6) return;
    if (Array.isArray(m)) { m.forEach((x) => walk(x, depth + 1)); return; }
    // A layer/constituent/profile wrapper points at its material; a set has
    // its own name AND its parts — the parts are what the GC wants to read.
    const parts = m.Materials ?? m.MaterialLayers ?? m.MaterialConstituents ?? m.MaterialProfiles ?? null;
    const usage = m.ForLayerSet ?? m.ForProfileSet ?? null;
    if (usage) { walk(usage, depth + 1); return; }
    if (m.Material) { walk(m.Material, depth + 1); return; }
    if (parts) { walk(parts, depth + 1); return; }
    const name = ifcText(m.Name) || ifcText(m.LayerSetName);
    if (name) add(name);
  };
  walk(mats || [], 0);
  return out;
}

/**
 * glTF node extras / userData into rows. Nested objects become dotted labels;
 * arrays of primitives join; anything deeper than three levels is dropped.
 */
export function flattenUserData(data: unknown, prefix = '', depth = 0): PropRow[] {
  const out: PropRow[] = [];
  if (!data || typeof data !== 'object' || depth > 3) return out;
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const label = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object' && !Array.isArray(v)) out.push(...flattenUserData(v, label, depth + 1));
    else if (Array.isArray(v)) {
      const prim = v.filter((x) => ['string', 'number', 'boolean'].includes(typeof x));
      if (prim.length) out.push({ group: 'Extras', label, value: prim.map((x) => fmtVal(x as string | number | boolean)).join(', ') });
    } else out.push({ group: 'Extras', label, value: fmtVal(v as string | number | boolean) });
  }
  return out;
}

/* ── Section plane ─────────────────────────────────────────────────────── */

/**
 * Where the section plane sits along an axis for a 0–100 slider position.
 * 100 = the far face of the model's box (nothing cut), 0 = the near face.
 */
export function sectionPosition(min: number, max: number, percent: number): number {
  const p = Math.min(100, Math.max(0, Number(percent) || 0)) / 100;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  return min + (max - min) * p;
}

/** A user-facing message for a load failure — never a stack or a WASM code. */
export function modelErrorMessage(err: unknown, format: ModelFormat | null): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  if (/too large/i.test(raw)) return raw;
  if (/fetch|network|Failed to load|status 4|status 5/i.test(raw)) return 'The model file could not be downloaded. Check your connection and try again.';
  if (/memory|allocation|Out of bounds|RangeError/i.test(raw)) return 'This model is too big for this device to open. Try it on a computer.';
  if (/outside files|external/i.test(raw)) return raw;
  if (format === 'ifc') return 'This file could not be read as an IFC model. Export it again from the design tool as IFC2x3 or IFC4.';
  if (format === 'glb' || format === 'gltf') return 'This file could not be read as a glTF model. Export it again as a single .glb file.';
  return 'This file is not a 3D model the viewer can open (.ifc, .glb or .gltf).';
}
