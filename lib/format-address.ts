/**
 * formatAddress — one line for a project's address, from whatever the row
 * holds. Stored addresses are inconsistent: some rows carry the whole thing
 * in `address` ("1450 S Alma School Rd, Mesa, AZ 85210") AND the parts in
 * `city` / `state` / `zip`, so joining every field printed "Mesa, AZ 85210,
 * AZ". A part is appended only when the line does not already contain it.
 * The stored values are never changed — this is display only.
 */
export interface AddressParts {
  address?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  postal_code?: string | null;
}

const clean = (v: unknown) => String(v ?? '').trim();

export function formatAddress(p: AddressParts | null | undefined): string {
  if (!p) return '';
  const line = clean(p.address) || [clean(p.address_line_1), clean(p.address_line_2)].filter(Boolean).join(', ');
  const city = clean(p.city);
  const state = clean(p.state).toUpperCase();
  const zip = clean(p.zip) || clean(p.postal_code);
  const has = (needle: string) => !!needle && line.toLowerCase().includes(needle.toLowerCase());
  const parts: string[] = [];
  if (line) parts.push(line);
  if (city && !has(city)) parts.push(city);
  // "AZ" alone matches too easily inside street names; look for it as a token.
  const stateToken = state ? new RegExp(`(^|[\\s,])${state}($|[\\s,])`, 'i') : null;
  const stateZip = [state, zip].filter(Boolean).join(' ');
  if (stateZip && !(stateToken && stateToken.test(line))) parts.push(stateZip);
  else if (zip && !has(zip)) parts.push(zip);
  return parts.join(', ');
}
