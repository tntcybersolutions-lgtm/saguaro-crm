/**
 * lib/jacket-insurance.ts — insurance terms as a bidder reads them.
 *
 * Pure and client-safe: the jacket assembly (server), the package details form
 * (browser) and the takeoff build all use the same reading, so the figure a GC
 * types, the figure the jacket shows and the figure Sage writes cannot drift.
 */

/** bid_packages.insurance_required_amount's column default. A value equal to it
 *  on its own is not something a GC entered — see deriveRequirements. */
export const INSURANCE_AMOUNT_DEFAULT = 1_000_000;

/**
 * A coverage figure as stored. general_liability / auto_liability /
 * workers_compensation are TEXT, so "2000000", "$2,000,000", "2M" and
 * "Statutory" are all real values. Numbers come back as numbers (so they can be
 * formatted as money); a term like "Statutory" comes back as the words; blank,
 * zero and junk come back as null.
 */
export function coverageValue(raw: unknown): number | string | null {
  if (raw == null || typeof raw === 'boolean') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(k|m|mm|mil|million|thousand)?$/i.exec(s.replace(/\s+(?=[km])/i, ''));
  if (m) {
    let n = Number(`${m[1].replace(/,/g, '')}${m[2] ? `.${m[2]}` : ''}`);
    const unit = (m[3] || '').toLowerCase();
    if (unit === 'k' || unit === 'thousand') n *= 1_000;
    else if (unit) n *= 1_000_000;
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  /* Words, not a number. Kept verbatim (trimmed, bounded) so "Statutory" reads
     as the GC wrote it rather than vanishing. */
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
/** A figure as "$2,000,000"; a term ("Statutory") as written. */
export const coverageText = (v: number | string | null) => (v == null ? null : typeof v === 'number' ? usd(v) : v);

/** The three standard limits as a sentence a subcontractor reads, never JSON. */
export function insuranceSentence(c: { gl?: number | string | null; auto?: number | string | null; wc?: number | string | null }): string | null {
  const parts = [
    c.gl != null ? `commercial general liability ${coverageText(c.gl)}` : null,
    c.auto != null ? `automobile liability ${coverageText(c.auto)}` : null,
    c.wc != null ? `workers' compensation ${coverageText(c.wc)}` : null,
  ].filter(Boolean) as string[];
  return parts.length ? `Subcontractor must carry ${parts.join('; ')}.` : null;
}

const humanKey = (k: string) => k.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\w/, (c) => c.toUpperCase());

/**
 * insurance_requirements as written for a bidder.
 *
 * 73 of 89 live packages hold a JSON object in this TEXT column
 * ({"general_liability":2000000,"auto_liability":1000000,"workers_compensation":500000})
 * because sage-auto-docs passed an object to a text field, and the jacket
 * printed it verbatim as the "Insurance Requirements" page. JSON is parsed: the
 * three standard limits come back as figures and a sentence, anything else as
 * "Key: value" lines. Plain text passes through untouched.
 */
export function parseInsuranceText(raw: unknown): {
  text: string | null; gl: number | string | null; auto: number | string | null; wc: number | string | null;
} {
  const none = { text: null, gl: null, auto: null, wc: null };
  if (raw == null) return none;
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return none;
    if (!/^[[{]/.test(s)) return { ...none, text: s };
    try { obj = JSON.parse(s); } catch { return { ...none, text: s }; }
  }
  if (Array.isArray(obj)) {
    const lines = obj.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    return { ...none, text: lines.length ? lines.join('\n') : null };
  }
  if (!obj || typeof obj !== 'object') return { ...none, text: String(obj) };

  const o = obj as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of Object.keys(o)) if (keys.includes(k.toLowerCase())) return coverageValue(o[k]);
    return null;
  };
  const gl = pick('general_liability', 'generalliability', 'gl', 'cgl');
  const auto = pick('auto_liability', 'autoliability', 'auto', 'automobile');
  const wc = pick('workers_compensation', 'workers_comp', 'workerscompensation', 'workers_comp_limit', 'wc');
  const KNOWN = ['general_liability', 'generalliability', 'gl', 'cgl', 'auto_liability', 'autoliability', 'auto', 'automobile',
    'workers_compensation', 'workers_comp', 'workerscompensation', 'workers_comp_limit', 'wc'];
  const others = Object.keys(o)
    .filter((k) => !KNOWN.includes(k.toLowerCase()))
    .map((k) => {
      const v = o[k];
      const val = typeof v === 'number' || typeof v === 'string' ? coverageText(coverageValue(v)) : typeof v === 'boolean' ? (v ? 'Required' : 'Not required') : null;
      return val ? `${humanKey(k)}: ${val}` : null;
    })
    .filter(Boolean) as string[];
  const text = [insuranceSentence({ gl, auto, wc }), ...others].filter(Boolean).join('\n') || null;
  return { text, gl, auto, wc };
}

