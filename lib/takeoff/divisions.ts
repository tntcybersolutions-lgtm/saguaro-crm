// SINGLE SOURCE OF TRUTH for CSI division color — CANONICAL copy: D:/Saguaro-Field (mobile) lib/takeoff/divisions.ts; the web repo carries a byte-exact mirror (scripts/sync-takeoff-engine.mjs).
// Drives: hero accents, trade-breakdown bar segments, legend dots, division headers, PDF.
// Reuses the exact hexes already in the Heatmap's SYSTEM_COLORS / WALL_MATERIALS
// (teal #2CFF7A, orange #FF8A00, blue #FF8A00, tan #C9A96A) so the two tools read
// as one family. Keep this identical across web + mobile.
export const DIVISION_COLORS: Record<string, string> = {
  '01': '#8094B0', // General Requirements — slate
  '02': '#B45309', // Existing Conditions / Demo — burnt amber
  '03': '#C9A96A', // Concrete — desert tan
  '04': '#FF8A00', // Masonry — brick
  '05': '#9CA3AF', // Metals — steel
  '06': '#B45309', // Wood & Plastics — timber
  '07': '#2CFF7A', // Thermal & Moisture — teal
  '08': '#8FC4F0', // Openings (doors/windows) — glass blue
  '09': '#FF8A00', // Finishes — violet
  '10': '#FFE600', // Specialties — yellow
  '11': '#FF8A00', // Equipment — indigo
  '12': '#FF8A00', // Furnishings — pink
  '21': '#FF3B30', // Fire Suppression — red
  '22': '#FF8A00', // Plumbing — blue
  '23': '#16C060', // HVAC — green
  '26': '#FF8A00', // Electrical — orange
  '27': '#FFE600', // Communications — sky
  '28': '#E5484D', // Electronic Safety/Security — alarm red
  '31': '#A9884F', // Earthwork — earth
  '32': '#2CFF7A', // Exterior Improvements — lime
  '33': '#FF8A00', // Utilities — cyan
};

/** Color for a CSI code/division. Accepts a full code ('26', '26 05 00', '09 29 00') or a 2-digit division. */
export const divColor = (code: string) => DIVISION_COLORS[(code || '00').replace(/\D/g, '').slice(0, 2)] || '#94a3b8';

/** Human division name for a code, for legends/headers when no name is stored. */
export const DIVISION_NAMES: Record<string, string> = {
  '01': 'General Requirements', '02': 'Existing Conditions', '03': 'Concrete', '04': 'Masonry',
  '05': 'Metals', '06': 'Wood & Plastics', '07': 'Thermal & Moisture', '08': 'Openings',
  '09': 'Finishes', '10': 'Specialties', '11': 'Equipment', '12': 'Furnishings',
  '21': 'Fire Suppression', '22': 'Plumbing', '23': 'HVAC', '26': 'Electrical',
  '27': 'Communications', '28': 'Electronic Safety', '31': 'Earthwork', '32': 'Exterior Improvements',
  '33': 'Utilities',
};
export const divName = (code: string) => DIVISION_NAMES[(code || '00').replace(/\D/g, '').slice(0, 2)] || '';
