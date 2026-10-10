/**
 * The time-zone picker's list — the seven US zones a contractor means, by the
 * names they use ("Central", not "America/Chicago"), then every zone this
 * browser knows. Pure: no I/O, safe in a client component.
 *
 * Searching finds a US zone by its name, its IANA id, a big city in it or a
 * state in it — a GC in Iowa types "Iowa" and gets Central.
 */

export interface ZoneChoice {
  /** IANA id, e.g. 'America/Chicago'. */
  zone: string;
  /** What a person calls it: 'Central', or the city for the rest ('Buenos Aires'). */
  name: string;
  /** The IANA id's region, for the rest of the world ('America/Argentina'); '' for US zones. */
  region: string;
  /** One of the seven US zones listed first. */
  us: boolean;
  /** Lower-cased text the search matches against. */
  search: string;
}

/** US zones first, in the order a contractor reads a map (east to west). */
export const US_ZONES: ReadonlyArray<{ zone: string; name: string; keywords: string }> = [
  { zone: 'America/New_York', name: 'Eastern', keywords: 'et est edt new york atlanta miami boston philadelphia charlotte detroit florida georgia ohio michigan pennsylvania virginia carolina new jersey maryland massachusetts connecticut indiana kentucky maine' },
  { zone: 'America/Chicago', name: 'Central', keywords: 'ct cst cdt chicago dallas houston kansas city minneapolis st louis nashville new orleans iowa illinois texas missouri minnesota wisconsin oklahoma arkansas louisiana mississippi alabama tennessee nebraska dakota des moines omaha' },
  { zone: 'America/Denver', name: 'Mountain', keywords: 'mt mst mdt denver salt lake city albuquerque boise colorado utah new mexico wyoming montana idaho' },
  { zone: 'America/Phoenix', name: 'Arizona (no DST)', keywords: 'arizona az mst phoenix tucson scottsdale mesa no daylight saving' },
  { zone: 'America/Los_Angeles', name: 'Pacific', keywords: 'pt pst pdt los angeles san francisco seattle portland las vegas san diego california washington oregon nevada' },
  { zone: 'America/Anchorage', name: 'Alaska', keywords: 'akst akdt anchorage juneau fairbanks alaska' },
  { zone: 'Pacific/Honolulu', name: 'Hawaii', keywords: 'hst honolulu hawaii maui' },
];

const US_BY_ZONE = new Map(US_ZONES.map((z) => [z.zone, z]));

/** Every zone this runtime lists (Intl.supportedValuesOf), or [] where it can't say. */
export function supportedZones(): string[] {
  try {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    return typeof f === 'function' ? f('timeZone') : [];
  } catch {
    return []; // an older runtime: the US zones still list
  }
}

function choiceFor(zone: string): ZoneChoice {
  const us = US_BY_ZONE.get(zone);
  if (us) return { zone, name: us.name, region: '', us: true, search: `${us.name} ${zone} ${us.keywords}`.toLowerCase() };
  const parts = zone.split('/');
  const name = (parts[parts.length - 1] || zone).replace(/_/g, ' ');
  const region = parts.slice(0, -1).join('/').replace(/_/g, ' ');
  return { zone, name, region, us: false, search: `${name} ${zone.replace(/_/g, ' ')} ${zone}`.toLowerCase() };
}

/**
 * The full list: the seven US zones, then every other zone A→Z. `extra` zones
 * (the device's, the company's current one) are included even when the
 * runtime's list leaves them out ('UTC', an alias).
 */
export function zoneChoices(supported: string[] = supportedZones(), extra: Array<string | null | undefined> = []): ZoneChoice[] {
  const seen = new Set<string>();
  const out: ZoneChoice[] = [];
  for (const u of US_ZONES) { seen.add(u.zone); out.push(choiceFor(u.zone)); }
  const rest = [...supported, ...extra.filter((z): z is string => !!z)]
    .filter((z) => { if (seen.has(z)) return false; seen.add(z); return true; })
    .sort((a, b) => a.localeCompare(b));
  for (const z of rest) out.push(choiceFor(z));
  return out;
}

/** The choices matching `query` (every word must match), US zones kept first. */
export function searchZones(choices: ZoneChoice[], query: string): ZoneChoice[] {
  const words = query.toLowerCase().split(/[\s,/]+/).filter(Boolean);
  if (!words.length) return choices;
  return choices.filter((c) => words.every((w) => c.search.includes(w)));
}

/** "Central (America/Chicago)" · "Buenos Aires (America/Argentina/Buenos_Aires)". */
export function zoneLabel(zone: string | null | undefined): string {
  if (!zone) return '';
  const c = choiceFor(zone);
  return `${c.name} (${zone})`;
}

/** The short friendly name alone: 'Central', 'Arizona (no DST)', 'London'. */
export function zoneName(zone: string | null | undefined): string {
  return zone ? choiceFor(zone).name : '';
}

/** "7:30 PM" — the time it is now in `zone` ('' when the runtime doesn't know the zone). */
export function timeIn(zone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(now);
  } catch {
    return '';
  }
}
