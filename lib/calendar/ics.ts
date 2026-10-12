/**
 * iCalendar (RFC 5545) for the calendar-sync feed. Pure: tested in ics.sanity.test.ts.
 * All-day items (schedule tasks) use DATE values; timed items with a known
 * zone use UTC; a meeting stored as a local date + time is "floating" (shown at
 * that clock time wherever the phone is — the company's own zone in practice).
 */
export type CalEvent =
  | { uid: string; title: string; allDay: true; start: string; end?: string | null; location?: string | null; description?: string | null; url?: string | null }
  | { uid: string; title: string; allDay: false; startUtc: string; endUtc: string; location?: string | null; description?: string | null; url?: string | null }
  | { uid: string; title: string; allDay: false; floatingStart: string; floatingEnd: string; location?: string | null; description?: string | null; url?: string | null };

/** Escape TEXT per RFC 5545 §3.3.11. */
export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (curLen + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; curLen = 0; }
    cur += ch; curLen += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const day = (iso: string) => iso.slice(0, 10).replace(/-/g, '');
const nextDay = (iso: string) => { const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10).replace(/-/g, ''); };
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const floating = (local: string) => local.replace(/[-:]/g, '').slice(0, 15); // YYYYMMDDTHHMMSS

export function buildIcs(calName: string, events: CalEvent[], now = new Date()): string {
  const stamp = utc(now.toISOString());
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Saguaro Control Systems//Calendar Sync//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsText(calName)}`,
    'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@saguarocontrol.net`, `DTSTAMP:${stamp}`, `SUMMARY:${icsText(e.title)}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${day(e.start)}`);
      // DTEND is exclusive: a task that ends on the 9th is drawn through the 9th.
      lines.push(`DTEND;VALUE=DATE:${nextDay(e.end && e.end >= e.start ? e.end : e.start)}`);
    } else if ('startUtc' in e) {
      lines.push(`DTSTART:${utc(e.startUtc)}`, `DTEND:${utc(e.endUtc)}`);
    } else {
      lines.push(`DTSTART:${floating(e.floatingStart)}`, `DTEND:${floating(e.floatingEnd)}`);
    }
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
