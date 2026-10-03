/**
 * Service tickets — statuses, labels and transition rules shared by the API
 * and the Service & Dispatch screen. Table: service_tickets.
 *
 * Operational status only. Billing is separate: a ticket can be Completed and
 * still unbilled (spec §7). There is no waiting-reason or history column, so a
 * Waiting reason and every status change are appended to dispatch_notes as a
 * dated line — a readable trail without a schema change.
 */

export const TICKET_STATUSES = ['new', 'triaged', 'scheduled', 'en_route', 'on_site', 'waiting', 'completed', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'New', triaged: 'Triaged', scheduled: 'Scheduled', en_route: 'En Route',
  on_site: 'On Site', waiting: 'Waiting', completed: 'Completed', closed: 'Closed',
};

export const TICKET_PRIORITIES = ['emergency', 'high', 'normal', 'low'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const WAITING_REASONS = ['Parts', 'Customer access', 'Approval', 'Weather', 'Other'] as const;

export const OPEN_TICKET_STATUSES: TicketStatus[] = ['new', 'triaged', 'scheduled', 'en_route', 'on_site', 'waiting'];

export function normaliseTicketStatus(raw: unknown): TicketStatus {
  const s = String(raw || '').toLowerCase().replace(/[\s-]+/g, '_');
  return (TICKET_STATUSES as readonly string[]).includes(s) ? (s as TicketStatus) : 'new';
}

/** Two windows overlap if each starts before the other ends. */
export function windowsOverlap(aStart: string, aEnd: string | null, bStart: string, bEnd: string | null): boolean {
  const as = Date.parse(aStart), bs = Date.parse(bStart);
  // A window with no end is treated as one hour long.
  const ae = aEnd ? Date.parse(aEnd) : as + 3_600_000;
  const be = bEnd ? Date.parse(bEnd) : bs + 3_600_000;
  return as < be && bs < ae;
}

export function noteLine(when: Date, text: string): string {
  return `[${when.toISOString().slice(0, 16).replace('T', ' ')} UTC] ${text}`;
}
