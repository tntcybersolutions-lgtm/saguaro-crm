/**
 * The name a sub portal user files things under.
 *
 * portal_sub_messages.sender_name is NOT NULL with no default, and the portal's
 * message route never set it — so every message a sub sent was rejected by
 * Postgres. The roster sub (subcontractors) is the source of truth when there
 * is one; the invite itself (portal_sub_sessions.sub_contact_name / sub_company
 * / sub_email) fills any gap, because the GC typed those when sending the link.
 */

export interface SenderRosterSub {
  company_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  contact_email?: string | null;
}

export interface SenderSession {
  sub_company?: string | null;
  sub_contact_name?: string | null;
  sub_email?: string | null;
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** The person behind the link, if anyone was named. */
export function senderContact(sub: SenderRosterSub | null | undefined, session: SenderSession): string {
  return clean(sub?.contact_name) || clean(session.sub_contact_name);
}

/** The company behind the link, if any was named. */
export function senderCompany(sub: SenderRosterSub | null | undefined, session: SenderSession): string {
  return clean(sub?.company_name) || clean(session.sub_company);
}

/**
 * "Maria Lopez (ABC Electric)", else whichever of contact / company / email is
 * known, else "Subcontractor". Never empty — the column is NOT NULL.
 */
export function portalSenderName(sub: SenderRosterSub | null | undefined, session: SenderSession): string {
  const contact = senderContact(sub, session);
  const company = senderCompany(sub, session);
  if (contact && company && contact.toLowerCase() !== company.toLowerCase()) return `${contact} (${company})`;
  const email = clean(sub?.contact_email) || clean(sub?.email) || clean(session.sub_email);
  return contact || company || email || 'Subcontractor';
}
