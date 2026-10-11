/**
 * lib/lead-intake.ts — a homeowner or client asking for a quote through the
 * contractor's own website, landing in the CRM as a New lead.
 *
 * Two ways in, one rule set:
 *   - the hosted form, /portals/lead/[key] (posts JSON), and
 *   - a plain HTML <form> the contractor pastes into their own site, which
 *     posts form-encoded straight to /api/portal/lead/[key] (no script, no
 *     iframe — the whole app sends X-Frame-Options: DENY, and that stays).
 *
 * `key` is a random token kept in tenants.settings.lead_form_key; the GC can
 * replace it (the old link stops working). Spam guards: a hidden "website"
 * field humans never fill, a minimum time on the page, and a per-IP rate
 * limit in the route.
 */

export const LEAD_PROJECT_TYPES = [
  'New home', 'Addition', 'Kitchen remodel', 'Bathroom remodel', 'Whole-home remodel',
  'Outdoor / landscape', 'Commercial build-out', 'Repair', 'Other',
] as const;

export const LEAD_BUDGETS = ['Under $25k', '$25k–$100k', '$100k–$250k', '$250k–$500k', '$500k+', 'Not sure yet'] as const;
export const LEAD_TIMELINES = ['As soon as possible', '1–3 months', '3–6 months', '6+ months', 'Just planning'] as const;

/** Rough dollar value for the pipeline from a budget range (the low end). Pure. */
export function budgetValue(b: string | null): number {
  switch (b) {
    case '$25k–$100k': return 25000;
    case '$100k–$250k': return 100000;
    case '$250k–$500k': return 250000;
    case '$500k+': return 500000;
    default: return 0;
  }
}

export type LeadSubmission = {
  contact_name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  location: string | null;
  project_type: string | null;
  budget: string | null;
  timeline: string | null;
  message: string | null;
};

export type ParseResult =
  | { ok: true; lead: LeadSubmission }
  | { ok: false; spam: true }
  | { ok: false; spam: false; error: string };

const MIN_MS_ON_PAGE = 2500;

/**
 * Validate one submission. `fields` is the posted form (JSON or form-encoded,
 * already flattened to strings). `now` is injectable for the test. Pure.
 */
export function parseLeadSubmission(fields: Record<string, unknown>, now = Date.now()): ParseResult {
  const s = (k: string, max = 200) => {
    const v = fields[k];
    const t = typeof v === 'string' ? v.trim() : '';
    return t ? t.slice(0, max) : null;
  };
  // Honeypot: a field hidden from people. Bots fill every input.
  if (s('website')) return { ok: false, spam: true };
  // Filled faster than a person can type (only when the page stamped the start).
  const started = Number(fields.started_at);
  if (Number.isFinite(started) && started > 0 && now - started < MIN_MS_ON_PAGE) return { ok: false, spam: true };

  const name = s('name', 120);
  const email = s('email', 160);
  const phone = s('phone', 40);
  if (!name) return { ok: false, spam: false, error: 'Please enter your name.' };
  if (!email && !phone) return { ok: false, spam: false, error: 'Please enter an email or a phone number so we can reach you.' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, spam: false, error: 'That email address does not look right.' };
  if (phone && (phone.replace(/\D/g, '').length < 7)) return { ok: false, spam: false, error: 'That phone number looks too short.' };

  const pick = <T extends readonly string[]>(k: string, list: T) => {
    const v = s(k);
    return v && (list as readonly string[]).includes(v) ? v : null;
  };
  const message = s('message', 4000);
  if (message && /(https?:\/\/[^\s]+[\s\S]*){4,}/i.test(message)) return { ok: false, spam: true }; // link-stuffed

  return {
    ok: true,
    lead: {
      contact_name: name,
      email: email ? email.toLowerCase() : null,
      phone,
      company_name: s('company', 120),
      location: s('address', 240),
      project_type: pick('project_type', LEAD_PROJECT_TYPES),
      budget: pick('budget', LEAD_BUDGETS),
      timeline: pick('timeline', LEAD_TIMELINES),
      message,
    },
  };
}

/** The notes line the GC reads on the lead. Pure. */
export function leadNotes(l: LeadSubmission): string {
  return [
    'From your website form.',
    l.budget ? `Budget: ${l.budget}.` : null,
    l.timeline ? `Timeline: ${l.timeline}.` : null,
    l.message ? `\n${l.message}` : null,
  ].filter(Boolean).join(' ');
}

/** The HTML a contractor pastes into their own site. Pure. */
export function embedFormHtml(actionUrl: string, companyName: string): string {
  const opt = (list: readonly string[]) => list.map((o) => `<option>${o}</option>`).join('');
  return `<form action="${actionUrl}" method="POST" style="display:grid;gap:10px;max-width:520px;font:16px system-ui,sans-serif">
  <input name="name" placeholder="Your name" required style="padding:10px">
  <input name="email" type="email" placeholder="Email" style="padding:10px">
  <input name="phone" type="tel" placeholder="Phone" style="padding:10px">
  <input name="address" placeholder="Project address" style="padding:10px">
  <select name="project_type" style="padding:10px"><option value="">Type of project</option>${opt(LEAD_PROJECT_TYPES)}</select>
  <select name="budget" style="padding:10px"><option value="">Budget</option>${opt(LEAD_BUDGETS)}</select>
  <select name="timeline" style="padding:10px"><option value="">When do you want to start?</option>${opt(LEAD_TIMELINES)}</select>
  <textarea name="message" rows="4" placeholder="Tell ${companyName.replace(/[<>"]/g, '')} about your project" style="padding:10px"></textarea>
  <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
  <button type="submit" style="padding:12px;font-weight:700">Request a quote</button>
</form>`;
}
