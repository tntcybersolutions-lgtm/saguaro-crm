/**
 * A bid jacket's Correspondence: everything said about the package, newest
 * first — the emails Saguaro sent (communication_log), the portal chats and
 * "Ask for it" requests with the invited subs, bids as they came in, and when
 * each invitation was opened. GC-only: a bidder never sees another bidder's
 * mail (lib/bid-jacket only assembles this for the GC view).
 *
 * Pure: the caller fetches the rows, this shapes them.
 */

export type CommKind = 'email' | 'chat' | 'ask' | 'bid' | 'viewed' | 'invited';
export interface CommItem {
  id: string;
  at: string;
  kind: CommKind;
  direction: 'out' | 'in';
  /** The sub / company the item is with ('' when only an address is known). */
  party: string;
  /** One line: what happened. */
  title: string;
  subject: string | null;
  body: string | null;
  to: string | null;
  status: 'sent' | 'failed' | 'not_sent' | null;
  error: string | null;
}

type Row = Record<string, any>;

const EMAIL_TITLE: Record<string, string> = {
  bid_invite: 'Invitation emailed',
  bid_reminder: 'Reminder emailed',
  addendum: 'Addendum emailed',
  bid_award: 'Award notice emailed',
  bid_not_awarded: 'Not-awarded notice emailed',
  bid_received: 'You were emailed: bid received',
};

/** A GC message that is an "Ask for it" compliance request (lib/compliance-ask askMessage). */
export const isAsk = (content: unknown) => /needs updated paperwork from you:/i.test(String(content || ''));

const money = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : null;
};

export function buildCorrespondence(input: {
  log: Row[];
  chats: Row[];
  invites: Row[];
  submissions: Row[];
}): CommItem[] {
  const out: CommItem[] = [];
  const inviteBySub = new Map<string, Row>();
  for (const i of input.invites) if (i.sub_id) inviteBySub.set(String(i.sub_id), i);
  const partyOf = (r: Row) => String(r.company_name || r.sub_name || r.contact_name || r.to_name || '') || 'Subcontractor';

  // Emails on the record.
  const loggedInvites = new Set<string>();
  for (const r of input.log) {
    if (r.related_type === 'bid_invite' && r.related_id) loggedInvites.add(String(r.related_id));
    const status = r.status === 'sent' || r.status === 'failed' || r.status === 'not_sent' ? r.status : null;
    out.push({
      id: `log:${r.id}`, at: r.created_at, kind: 'email', direction: r.direction === 'in' ? 'in' : 'out',
      // Who, by name; blank when only the address is known (it is shown as "to").
      party: r.to_name || (r.sub_id && inviteBySub.get(String(r.sub_id)) ? partyOf(inviteBySub.get(String(r.sub_id))!) : ''),
      title: EMAIL_TITLE[r.related_type] || (r.direction === 'in' ? 'Email received' : 'Email sent'),
      subject: r.subject || null, body: r.body || null, to: r.to_address || null, status, error: r.error || null,
    });
  }

  // Portal chats and Ask-for-it requests with the subs on this package.
  for (const m of input.chats) {
    const inv = m.sub_id ? inviteBySub.get(String(m.sub_id)) : undefined;
    if (!inv) continue;
    const mine = m.sender_type !== 'sub';
    const ask = mine && isAsk(m.content);
    out.push({
      id: `chat:${m.id}`, at: m.created_at, kind: ask ? 'ask' : 'chat', direction: mine ? 'out' : 'in',
      party: partyOf(inv),
      title: ask ? 'Asked for paperwork' : mine ? `Message to ${partyOf(inv)}` : `Message from ${partyOf(inv)}`,
      subject: null, body: m.content || null, to: null, status: null, error: null,
    });
  }

  // Invitations: when they were opened, and sends from before the email record existed.
  for (const i of input.invites) {
    if (i.invitation_viewed_at) {
      out.push({
        id: `viewed:${i.id}`, at: i.invitation_viewed_at, kind: 'viewed', direction: 'in', party: partyOf(i),
        title: `${partyOf(i)} opened the invitation`, subject: null, body: null, to: i.sub_email || null, status: null, error: null,
      });
    }
    const sentAt = i.invitation_sent_at || i.invited_at;
    if (sentAt && !loggedInvites.has(String(i.id))) {
      out.push({
        id: `invited:${i.id}`, at: sentAt, kind: 'invited', direction: 'out', party: partyOf(i),
        title: `Invited ${partyOf(i)}`, subject: null, body: null, to: i.sub_email || null, status: null, error: null,
      });
    }
  }

  // Bids as they came in.
  for (const s of input.submissions) {
    const at = s.submitted_at || s.received_at || s.created_at;
    if (!at) continue;
    const amt = money(s.base_amount ?? s.amount ?? s.base_bid);
    out.push({
      id: `bid:${s.id}`, at, kind: 'bid', direction: 'in', party: partyOf(s),
      title: `Bid received from ${partyOf(s)}${amt ? ` — ${amt}` : ''}`,
      subject: null, body: [s.clarifications, s.exclusions && `Exclusions: ${s.exclusions}`, s.notes].filter(Boolean).join('\n') || null,
      to: null, status: null, error: null,
    });
  }

  return out.filter((x) => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
