/**
 * "Ask for it": the GC's compliance checklist per sub, and the message a sub
 * gets when the GC asks for a document.
 *
 * Every sub on a portal link owes a current insurance certificate (COI) and a
 * W-9 — the same two the invoice gate holds payment on. The checklist reads
 * the sub's newest upload of each and says current / expiring / expired /
 * missing. A document that was never uploaded has no row at all, which is why
 * the old Compliance list could never show it: here "missing" is a first-class
 * state with a button.
 */
import { daysUntilDay } from './calendar-day';

export const REQUIRED_DOCS = ['insurance', 'w9'] as const;
export type RequiredDoc = (typeof REQUIRED_DOCS)[number];
export type DocState = 'current' | 'expiring' | 'expired' | 'missing';

export const DOC_LABEL: Record<RequiredDoc, string> = { insurance: 'Insurance certificate (COI)', w9: 'W-9' };
/** How close to expiry counts as "expiring". */
export const EXPIRING_DAYS = 30;
/** One ask per sub per document per day — enough to be heard, not enough to nag. */
export const ASK_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function isRequiredDoc(t: unknown): t is RequiredDoc {
  return typeof t === 'string' && (REQUIRED_DOCS as readonly string[]).includes(t);
}

/** The portal's doc_type spellings for each required document. */
function kindOf(docType: unknown): RequiredDoc | null {
  const s = String(docType || '').toLowerCase();
  if (s === 'insurance' || s === 'coi' || s.includes('insur') || s.includes('liab')) return 'insurance';
  if (s === 'w9' || s === 'w-9' || s.includes('w9') || s.includes('w-9')) return 'w9';
  return null;
}

export interface ComplianceRow { doc_type?: string | null; expiry_date?: string | null; status?: string | null; file_url?: string | null; created_at?: string | null }
export interface DocCheck { doc: RequiredDoc; state: DocState; expiry: string | null; days: number | null; uploadedAt: string | null }

/** The sub's standing on each required document, from their uploads (any order). */
export function subChecklist(rows: ReadonlyArray<ComplianceRow>, todayYmd: string): DocCheck[] {
  return REQUIRED_DOCS.map((doc) => {
    // Newest usable upload of this kind (a rejected one doesn't count).
    const mine = rows
      .filter((r) => kindOf(r.doc_type) === doc && r.file_url && r.status !== 'rejected')
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const best = mine[0];
    if (!best) return { doc, state: 'missing', expiry: null, days: null, uploadedAt: null };
    const expiry = best.expiry_date || null;
    const days = expiry ? daysUntilDay(expiry, todayYmd) : null;
    const state: DocState = best.status === 'expired' || (days != null && days < 0) ? 'expired'
      : days != null && days <= EXPIRING_DAYS ? 'expiring' : 'current';
    return { doc, state, expiry, days, uploadedAt: best.created_at || null };
  });
}

const fmtDay = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ymd;
};

/** What the sub reads in their portal when the GC asks. Plain, specific, says where to go. */
export function askMessage(checks: ReadonlyArray<DocCheck>, gcCompany?: string | null): string {
  const lines = checks.map((c) => {
    const what = DOC_LABEL[c.doc];
    if (c.state === 'missing') return `• ${what} — we don't have one on file.`;
    if (c.state === 'expired') return `• ${what} — expired${c.expiry ? ` ${fmtDay(c.expiry)}` : ''}.`;
    if (c.state === 'expiring') return `• ${what} — expires ${c.days === 0 ? 'today' : c.expiry ? fmtDay(c.expiry) : 'soon'}.`;
    return `• ${what} — please send the latest.`;
  });
  return [
    `${gcCompany ? `${gcCompany} needs` : 'We need'} updated paperwork from you:`,
    ...lines,
    'Upload it in the Compliance tab of this portal. Invoices are held until it is current.',
  ].join('\n');
}

/** Which of the requested documents can be asked for now, and which were asked too recently. */
export function cooldown(requested: ReadonlyArray<RequiredDoc>, lastAsked: Partial<Record<RequiredDoc, string>>, now = Date.now()): { ask: RequiredDoc[]; wait: Array<{ doc: RequiredDoc; askedAt: string }> } {
  const ask: RequiredDoc[] = [];
  const wait: Array<{ doc: RequiredDoc; askedAt: string }> = [];
  for (const d of requested) {
    const at = lastAsked[d];
    if (at && now - Date.parse(at) < ASK_COOLDOWN_MS) wait.push({ doc: d, askedAt: at });
    else ask.push(d);
  }
  return { ask, wait };
}
