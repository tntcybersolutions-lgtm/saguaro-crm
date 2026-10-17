/**
 * Who may post to an item by email, and which messages are not a person
 * answering at all. Pure, so the sanity tests drive it.
 *
 * A reply is accepted when the sender is the person the email went to (the
 * token's recipient), or is on the item's distribution — the people the
 * record itself names: the RFI's assignee and watchers, the job's architect,
 * owner and GC, a submittal's reviewer and distribution list, the CO's owner.
 * Anyone else (a forwarded copy, a spoofed From) is rejected and logged.
 */
import { normalizeEmail, type ReplyItemType } from './token';

type Row = Record<string, unknown>;

const EMAIL_RE = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** Every email address found in a value: a string, an array, or JSON of either (distribution lists). */
export function emailsIn(value: unknown, out: Set<string> = new Set(), depth = 0): Set<string> {
  if (value == null || depth > 4) return out;
  if (typeof value === 'string') {
    for (const m of value.match(EMAIL_RE) || []) out.add(normalizeEmail(m));
  } else if (Array.isArray(value)) {
    for (const v of value) emailsIn(v, out, depth + 1);
  } else if (typeof value === 'object') {
    for (const v of Object.values(value as Row)) emailsIn(v, out, depth + 1);
  }
  return out;
}

/** The project's named parties (projects row: owner/architect/gc/pm emails and entity JSON). */
function projectParties(project: Row | null | undefined): unknown[] {
  if (!project) return [];
  return [
    project.owner_email, project.owner_entity,
    project.architect_email, project.architect_entity,
    project.gc_email, project.gc_entity, project.pm_email,
  ];
}

/** The item's distribution as lowercase addresses. */
export function itemDistribution(type: ReplyItemType, item: Row, project?: Row | null): Set<string> {
  const vals: unknown[] = [...projectParties(project)];
  if (type === 'rfis') {
    vals.push(item.assigned_to_email, item.assigned_to, item.watchers, item.submitted_by, item.escalated_to);
  } else if (type === 'submittals') {
    vals.push(item.submitted_to, item.submitted_by, item.distribution, item.distribution_list, item.approval_chain);
  } else if (type === 'change_orders') {
    vals.push(item.owner_email, item.initiated_by);
  }
  return emailsIn(vals);
}

export type SenderMatch = { ok: true; via: 'recipient' | 'distribution' } | { ok: false };

export function matchSender(opts: { sender: string; isRecipient: boolean; distribution: Set<string> }): SenderMatch {
  if (opts.isRecipient) return { ok: true, via: 'recipient' };
  const s = normalizeEmail(opts.sender);
  if (s && opts.distribution.has(s)) return { ok: true, via: 'distribution' };
  return { ok: false };
}

/**
 * Out-of-office and other machine replies. Posting them would put "I am away
 * until Monday" on an RFI as the architect's answer — and answering them back
 * starts a mail loop.
 */
export function isAutoReply(headers: Record<string, unknown> | null | undefined, subject?: string | null): boolean {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = String(v ?? '').toLowerCase();
  if (h['auto-submitted'] && h['auto-submitted'] !== 'no') return true;
  if (h['x-autoreply'] || h['x-autorespond'] || h['x-auto-response-suppress'] === 'all') return true;
  if (/^(auto_reply|bulk|junk|list)$/.test((h['precedence'] || '').trim())) return true;
  if (h['x-autoreply-from'] || h['x-mail-autoreply']) return true;
  const subj = String(subject || '').trim().toLowerCase();
  return /^(automatic reply|auto(-|\s)?reply|out of (the )?office|autoreply|away from (the )?office|undeliverable|delivery status notification|mail delivery failed)\b/.test(subj);
}

/**
 * The receiving server's SPF / DKIM / DMARC verdicts (Resend computes them on
 * arrival; the sender cannot forge them). The sender's address is what lets a
 * reply in, so a message that fails DMARC — or fails both SPF and DKIM — is
 * treated as spoofed. Unknown / missing results are allowed: older mail and
 * small domains with no DMARC policy still need to work.
 */
export function authenticationFailed(auth: { spf?: string | null; dkim?: string | null; dmarc?: string | null } | null | undefined): boolean {
  if (!auth) return false;
  if (auth.dmarc === 'fail') return true;
  return auth.spf === 'fail' && auth.dkim === 'fail';
}

/** "Jane Architect <jane@x.com>" → "Jane Architect"; bare address → the address. */
export function displayName(fromHeader: string | null | undefined, fallbackEmail: string): string {
  const s = String(fromHeader || '').trim();
  const m = s.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  const name = m ? m[1].trim() : '';
  return name && !name.includes('@') ? name.slice(0, 120) : fallbackEmail;
}
