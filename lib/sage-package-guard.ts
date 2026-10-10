/**
 * lib/sage-package-guard.ts — which packages a takeoff rebuild may replace.
 *
 * "Build it all" from a takeoff writes one draft bid package per CSI division.
 * Run it again and it used to delete EVERY bid package on the project first —
 * and the delete cascades to invites, bids and documents. An issued package
 * with subs pricing it, an awarded one with a winning bid, a draft the GC had
 * spent an hour writing instructions into: gone, because someone pressed the
 * button twice.
 *
 * Now a rebuild replaces a package only when all of this is true:
 *   - the takeoff build wrote it (takeoff_id + ai_generated on new rows; on rows
 *     from before that, the insurance JSON only that build ever wrote);
 *   - it is still a draft, was never issued and has no addenda;
 *   - nobody has been invited, nobody has bid, no document was placed in it;
 *   - no GC has edited it (jacket_edits.edited_at, stamped by the package
 *     details form and the bid-form editor).
 * Everything else is kept, and a division whose package was kept is not
 * written a second time.
 */

export type ExistingPackage = {
  id: string;
  status?: string | null;
  takeoff_id?: string | null;
  ai_generated?: boolean | null;
  insurance_requirements?: string | null;
  csi_codes?: string[] | null;
  csi_division?: string | null;
  jacket_generated_at?: string | null;
  addendum_count?: number | null;
  jacket_edits?: unknown;
};

export type PackageActivity = { invited: Set<string>; bids: Set<string>; documents: Set<string> };

const SAGE_INSURANCE_KEYS = ['general_liability', 'auto_liability', 'workers_compensation'];

/** The JSON object the takeoff build used to put in insurance_requirements. */
export function isLegacySageInsurance(text: unknown): boolean {
  if (typeof text !== 'string' || !text.trim().startsWith('{')) return false;
  try {
    const o = JSON.parse(text);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    const keys = Object.keys(o);
    return keys.length > 0 && keys.every((k) => SAGE_INSURANCE_KEYS.includes(k));
  } catch {
    return false; // not JSON, so not the build's object — a GC wrote it
  }
}

/** Written by the takeoff build (this route), not by a GC or another feature. */
export function isTakeoffBuildPackage(p: ExistingPackage): boolean {
  if (p.takeoff_id) return p.ai_generated === true;
  return isLegacySageInsurance(p.insurance_requirements);
}

/** The two-digit CSI division a package covers ("03" from "03 30 00"). */
export function packageDivision(p: ExistingPackage): string | null {
  const first = (Array.isArray(p.csi_codes) && p.csi_codes[0]) || p.csi_division || '';
  const d = String(first).replace(/\s/g, '').slice(0, 2);
  return /^\d\d$/.test(d) ? d : null;
}

function editedByGc(p: ExistingPackage): boolean {
  const e = p.jacket_edits;
  return !!e && typeof e === 'object' && !Array.isArray(e) && !!(e as Record<string, unknown>).edited_at;
}

export const NOT_THIS_BUILDS = 'not written by the takeoff build';

/** Why a package must be kept, or null when the rebuild may replace it. */
export function keepReason(p: ExistingPackage, activity: PackageActivity): string | null {
  if (!isTakeoffBuildPackage(p)) return NOT_THIS_BUILDS;
  if (String(p.status || 'draft').toLowerCase() !== 'draft') return `status is ${p.status}`;
  if (p.jacket_generated_at) return 'issued to bidders';
  if (Number(p.addendum_count) > 0) return 'has addenda';
  if (activity.invited.has(p.id)) return 'subs invited';
  if (activity.bids.has(p.id)) return 'bids received';
  if (activity.documents.has(p.id)) return 'documents placed in it';
  if (editedByGc(p)) return 'edited by the GC';
  return null;
}

export function planRebuild(existing: ExistingPackage[], activity: PackageActivity): {
  replace: string[];
  keep: Array<{ id: string; reason: string }>;
  /** Divisions already covered by a kept package from an earlier build. */
  keepDivisions: Set<string>;
} {
  const replace: string[] = [];
  const keep: Array<{ id: string; reason: string }> = [];
  const keepDivisions = new Set<string>();
  for (const p of existing) {
    const reason = keepReason(p, activity);
    if (!reason) { replace.push(p.id); continue; }
    keep.push({ id: p.id, reason });
    if (isTakeoffBuildPackage(p)) {
      const d = packageDivision(p);
      if (d) keepDivisions.add(d);
    }
  }
  return { replace, keep, keepDivisions };
}
