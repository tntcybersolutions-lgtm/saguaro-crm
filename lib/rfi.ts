/**
 * RFIs — the one place an RFI's number is read, formatted and assigned, the
 * one link to an RFI, and the rule for when a reassignment emails someone.
 * Pure (no database, no server imports) so screens, emails and the sanity
 * tests all use the same code.
 *
 * Numbers are per job, like Procore: every job starts at RFI-001. The
 * database trigger set_rfi_number (supabase/migrations/20261017_rfi_number_per_job.sql)
 * is what actually stamps the number on insert, under a per-job lock, with a
 * unique index behind it. nextRfiSeq here is the same rule, used to predict
 * the number a new RFI will get and by the tests.
 */
import { recordHref } from '@/lib/record-links';

/** The sequence inside a stored number: 'RFI-012' → 12, '7' → 7, 'RFI #4' → 4, 'RFI-SUB-003' → 3. */
export function rfiSeq(raw: unknown): number | null {
  if (raw == null) return null;
  const m = String(raw).match(/\d{1,9}/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The RFI number as every screen and email shows it: 'RFI-012'.
 * Accepts what is stored ('RFI-012'), a bare number (12, '12', '#12') or an
 * old 'RFI #12'. A number with its own letters ('RFI-SUB-003') is shown as
 * stored. Never 'RFI RFI-012' or 'RFI #RFI-012'. Nothing → ''.
 */
export function formatRfiNumber(raw: unknown): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (/^#?\s*\d+$/.test(s) || /^rfi\s*[#-]?\s*\d+$/i.test(s)) {
    const n = rfiSeq(s);
    return n ? `RFI-${String(n).padStart(3, '0')}` : '';
  }
  if (/^rfi\b/i.test(s) || /^rfi-/i.test(s)) return s.toUpperCase().replace(/\s+/g, ' ');
  return `RFI ${s}`;
}

/** formatRfiNumber, or a fallback ('RFI', 'the RFI') when the row has no number yet. */
export function rfiLabel(raw: unknown, fallback = 'RFI'): string {
  return formatRfiNumber(raw) || fallback;
}

/** 'RFI-012 · Door hardware' — number and subject for titles and notifications. */
export function rfiTitle(raw: unknown, subject?: unknown): string {
  const n = formatRfiNumber(raw);
  const s = String(subject ?? '').trim();
  return n && s ? `${n} · ${s}` : n || s || 'RFI';
}

/** Per job: the next number after the highest one already on the job (gaps are never reused). */
export function nextRfiSeq(existing: unknown[]): number {
  let max = 0;
  for (const v of existing) {
    const n = rfiSeq(v);
    if (n && n > max) max = n;
  }
  return max + 1;
}

export function nextRfiNumber(existing: unknown[]): string {
  return formatRfiNumber(nextRfiSeq(existing));
}

/* ── Links ──────────────────────────────────────────────────────────────── */

/**
 * The RFI's own page — app/app/projects/[projectId]/items/[tool]/[id] with
 * tool 'rfis' (lib/record-links). `tab` opens it on the responses thread.
 * With `base` ('https://saguarocontrol.net') it is absolute, for emails and
 * push. Returns '' when either id is missing, so a caller never links to /app.
 */
export function rfiHref(projectId: unknown, rfiId: unknown, opts: { base?: string; tab?: 'responses' } = {}): string {
  if (!String(rfiId ?? '').trim()) return '';
  return recordHref('rfis', projectId, rfiId, { base: opts.base, query: { tab: opts.tab } });
}

/* ── Reassignment ───────────────────────────────────────────────────────── */

/** Ball-in-court words that mean "us" (the GC), not a person to email. */
const OURS = new Set(['gc', 'contractor', 'general contractor', 'us', 'our team']);
/** Old imports stored a status word in the person field. */
const NOT_A_PERSON = /^(open|closed|answered|draft|submitted|pending|under_review|n\/a|none|tbd|unassigned|-+|—)$/i;
const EMAIL = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const emailIn = (v: unknown): string | null => {
  const m = String(v ?? '').match(EMAIL);
  return m ? m[0].toLowerCase() : null;
};

export type RfiPerson = { assigned_to_name?: unknown; assigned_to_email?: unknown; ball_in_court?: unknown; status?: unknown; deleted_at?: unknown };
export type Assignee = { name: string; email: string | null };

/**
 * Who a change hands the RFI to, when that person should be told — or null.
 *
 * `patch` is exactly what the request writes. Only a write that names a
 * person (assigned_to_name, assigned_to_email or ball_in_court) counts; the
 * person is the new assignee name (else the new ball in court) and the email
 * that came with it. Nobody is emailed when the RFI is closed or deleted, when
 * the value is "us" or a status word, when it is the person who already had
 * it, or when it is the person making the change.
 */
export function assignmentToNotify(before: RfiPerson, patch: Record<string, unknown>, actorEmail?: string | null): Assignee | null {
  const touched = ['assigned_to_name', 'assigned_to_email', 'ball_in_court'].some((k) => k in patch);
  if (!touched) return null;
  const status = norm('status' in patch ? patch.status : before.status);
  if (status === 'closed' || status === 'void' || before.deleted_at) return null;

  const rawName = String(('assigned_to_name' in patch ? patch.assigned_to_name : '') || ('ball_in_court' in patch ? patch.ball_in_court : '') || '').trim();
  const email = emailIn('assigned_to_email' in patch ? patch.assigned_to_email : '') || emailIn(rawName);
  const name = rawName && !EMAIL.test(rawName) ? rawName : (email || '');
  if (!name && !email) return null;
  if (!email && (OURS.has(norm(name)) || NOT_A_PERSON.test(name.trim()))) return null;

  const prevNames = [before.assigned_to_name, before.ball_in_court].map(norm).filter(Boolean);
  const prevEmail = emailIn(before.assigned_to_email) || emailIn(before.assigned_to_name) || emailIn(before.ball_in_court);
  const samePerson = email
    ? (email === prevEmail || (!prevEmail && prevNames.includes(norm(name)) && norm(name) !== email))
    : prevNames.includes(norm(name));
  if (samePerson) return null;

  const actor = emailIn(actorEmail);
  if (actor && email && actor === email) return null;
  return { name, email };
}

export type PersonCandidate = { name?: unknown; email?: unknown; company?: unknown; contactName?: unknown };

/**
 * The email for an assignee typed or picked by name: the first candidate (in
 * the order given — job directory, job team, company users, subs, architect)
 * whose name, contact name or company is that name. An email typed into the
 * field is used as is. No match → null (the RFI is still reassigned; the
 * screen says nobody was emailed).
 */
export function pickAssigneeEmail(who: Assignee | string, candidates: PersonCandidate[]): string | null {
  const name = typeof who === 'string' ? who : who.name;
  const direct = (typeof who === 'string' ? null : who.email) || emailIn(name);
  if (direct) return direct;
  const n = norm(name);
  if (!n) return null;
  for (const c of candidates) {
    const e = emailIn(c.email);
    if (!e) continue;
    if ([c.name, c.contactName, c.company].some((v) => norm(v) === n)) return e;
  }
  return null;
}

/* ── Responses ──────────────────────────────────────────────────────────── */

export type ThreadEntry = {
  id: string;
  kind: 'comment' | 'response';
  body: string;
  author_name: string | null;
  author_email?: string | null;
  company?: string | null;
  created_at: string;
  attachments: { id?: string; name: string; url?: string | null }[];
  is_official: boolean;
  source: string | null;
  mine?: boolean;
};

type Row = Record<string, unknown>;

const attachList = (v: unknown): ThreadEntry['attachments'] => {
  const arr = Array.isArray(v) ? v : [];
  return arr
    .filter((a): a is Row => !!a && typeof a === 'object')
    .map((a) => ({
      ...(typeof a.id === 'string' ? { id: a.id } : {}),
      name: String(a.name || a.file_name || 'file').slice(0, 200),
      ...(typeof a.url === 'string' && a.url ? { url: a.url } : {}),
    }));
};

/**
 * One thread for an RFI: its comments (entity_comments) and its responses
 * (rfi_responses — the field app's answers, email replies, answers typed on
 * the RFI log), oldest first. A response that mirrors a comment (comment_id,
 * or an older email reply with the same sender and text) is shown once.
 */
export function mergeRfiThread(comments: Row[], responses: Row[], meId?: string | null): ThreadEntry[] {
  const out: ThreadEntry[] = [];
  const mirrored = new Set<string>();
  const key = (src: unknown, email: unknown, text: unknown) => `${norm(src)}|${norm(email)}|${String(text ?? '').trim()}`;
  const commentIds = new Set<string>();
  for (const c of comments) {
    if (c.deleted_at != null) continue;
    commentIds.add(String(c.id));
    if (c.source === 'email') mirrored.add(key('email', c.source_email, c.body));
    out.push({
      id: String(c.id),
      kind: 'comment',
      body: String(c.body ?? ''),
      author_name: (c.author_name as string) || null,
      author_email: (c.source_email as string) || null,
      created_at: String(c.created_at ?? ''),
      attachments: attachList(c.attachments),
      is_official: c.is_official === true,
      source: (c.source as string) || null,
      mine: !!meId && c.author_id === meId,
    });
  }
  for (const r of responses) {
    if (r.comment_id && commentIds.has(String(r.comment_id))) continue;
    if (r.comment_id) continue; // its comment was removed
    if (r.source === 'email' && mirrored.has(key('email', r.responder_email, r.response_text))) continue;
    out.push({
      id: String(r.id),
      kind: 'response',
      body: String(r.response_text ?? ''),
      author_name: (r.responder_name as string) || (r.responder_email as string) || null,
      author_email: (r.responder_email as string) || null,
      company: (r.responder_company as string) || null,
      created_at: String(r.responded_at ?? r.created_at ?? ''),
      attachments: attachList(r.attachments),
      is_official: r.is_official === true,
      source: (r.source as string) || null,
    });
  }
  out.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  // One official answer: if old data marked several, the newest one wins.
  let seen = false;
  for (let i = out.length - 1; i >= 0; i--) {
    if (!out[i].is_official) continue;
    if (seen) out[i] = { ...out[i], is_official: false };
    seen = true;
  }
  return out;
}
