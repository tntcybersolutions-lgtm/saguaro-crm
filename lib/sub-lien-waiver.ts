/**
 * Lien waivers signed from the subcontractor portal.
 *
 * "Submit Signed Lien Waiver" on the portal's Invoices tab used to show a toast
 * and save nothing. A signed waiver is now a real lien_waivers row — the same
 * table the GC's Lien Waivers page lists and the pay-app payment gate reads —
 * carrying the signer, the moment, the IP and a PDF with the drawn signature.
 *
 * Two things can be signed from the portal:
 *   • an approved / paid portal invoice (portal_sub_pay_apps) — a conditional
 *     progress waiver once approved, unconditional once paid, for the invoice's
 *     net amount through its period end; or
 *   • a waiver the GC already filed for this sub on this job and is waiting on
 *     (status pending / sent / requested).
 *
 * lien_waivers has no column pointing at portal_sub_pay_apps (its
 * pay_application_id is a foreign key to the GC's own pay_applications), so an
 * invoice's waiver is recognised by what a waiver legally is: the same sub, job
 * and type, through the same day, for the same amount.
 */

export const DB_WAIVER_TYPES = ['conditional_progress', 'unconditional_progress', 'conditional_final', 'unconditional_final'] as const;
export type DbWaiverType = (typeof DB_WAIVER_TYPES)[number];

/** lib/pdf-engine names the progress waivers "partial". */
export type PdfWaiverType = 'conditional_partial' | 'unconditional_partial' | 'conditional_final' | 'unconditional_final';

export function isDbWaiverType(t: unknown): t is DbWaiverType {
  return typeof t === 'string' && (DB_WAIVER_TYPES as readonly string[]).includes(t);
}

export function pdfWaiverType(t: DbWaiverType): PdfWaiverType {
  if (t === 'conditional_progress') return 'conditional_partial';
  if (t === 'unconditional_progress') return 'unconditional_partial';
  return t;
}

export function waiverTypeLabel(t: string | null | undefined): string {
  switch (t) {
    case 'conditional_progress': case 'conditional_partial': return 'Conditional progress waiver';
    case 'unconditional_progress': case 'unconditional_partial': return 'Unconditional progress waiver';
    case 'conditional_final': return 'Conditional final waiver';
    case 'unconditional_final': return 'Unconditional final waiver';
    default: return 'Lien waiver';
  }
}

/** The waiver an invoice calls for: conditional once approved, unconditional once paid, else none yet. */
export function waiverTypeForInvoice(status: string | null | undefined): DbWaiverType | null {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === 'approved') return 'conditional_progress';
  if (s === 'paid') return 'unconditional_progress';
  return null;
}

export interface WaiverLike {
  id: string;
  waiver_type?: string | null;
  amount?: number | string | null;
  through_date?: string | null;
  status?: string | null;
  signed_at?: string | null;
  deleted_at?: string | null;
}

export function isSignedWaiver(w: Pick<WaiverLike, 'status' | 'signed_at'>): boolean {
  return String(w.status ?? '').toLowerCase() === 'signed' || !!w.signed_at;
}

/** A waiver the GC is waiting on that the sub can sign. */
export function isSignableWaiver(w: Pick<WaiverLike, 'status' | 'signed_at' | 'deleted_at'>): boolean {
  if (w.deleted_at || isSignedWaiver(w)) return false;
  return ['pending', 'sent', 'requested'].includes(String(w.status ?? 'pending').toLowerCase());
}

const cents = (v: unknown): number | null => {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) ? null : Math.round(n * 100);
};
const dayOf = (v: unknown): string => String(v ?? '').slice(0, 10);

/**
 * The waiver on file for one portal invoice, or undefined. Same type, through
 * the invoice's period end, for its net amount; a signed one wins over an
 * unsigned one.
 */
export function invoiceWaiver<W extends WaiverLike>(
  pa: { status?: string | null; period_to?: string | null; net_amount?: number | string | null },
  waivers: readonly W[],
): W | undefined {
  const type = waiverTypeForInvoice(pa.status);
  if (!type) return undefined;
  const amount = cents(pa.net_amount);
  const matches = waivers.filter((w) =>
    !w.deleted_at &&
    w.waiver_type === type &&
    dayOf(w.through_date) === dayOf(pa.period_to) &&
    cents(w.amount) === amount);
  return matches.find(isSignedWaiver) ?? matches[0];
}

/* ── The signature itself ───────────────────────────────────────────────── */

export const MAX_SIGNATURE_BYTES = 400_000;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type SignatureCheck =
  | { ok: true; name: string; title: string | null; png: Uint8Array }
  | { ok: false; field: 'signed_name' | 'signer_title' | 'signature'; message: string };

function decodeBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Validate what the portal sends with a signature: the signer's typed name,
 * an optional title, and the drawn signature as a PNG data URL.
 */
export function checkSignature(input: { signed_name?: unknown; signer_title?: unknown; signature?: unknown }): SignatureCheck {
  const name = typeof input.signed_name === 'string' ? input.signed_name.replace(/\s+/g, ' ').trim() : '';
  if (name.length < 2) return { ok: false, field: 'signed_name', message: 'Type your full name to sign.' };
  if (name.length > 120) return { ok: false, field: 'signed_name', message: 'Your name is too long — 120 characters at most.' };
  const title = typeof input.signer_title === 'string' ? input.signer_title.replace(/\s+/g, ' ').trim() : '';
  if (title.length > 80) return { ok: false, field: 'signer_title', message: 'Your title is too long — 80 characters at most.' };

  const sig = typeof input.signature === 'string' ? input.signature.trim() : '';
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(sig);
  if (!m) return { ok: false, field: 'signature', message: 'Draw your signature in the box first.' };
  if (m[1].length > Math.ceil((MAX_SIGNATURE_BYTES * 4) / 3) + 4) {
    return { ok: false, field: 'signature', message: 'That signature image is too large. Clear it and sign again.' };
  }
  const png = decodeBase64(m[1]);
  if (png.length < 64 || !PNG_MAGIC.every((b, i) => png[i] === b)) {
    return { ok: false, field: 'signature', message: 'That signature didn’t come through. Clear it and sign again.' };
  }
  return { ok: true, name, title: title || null, png };
}
