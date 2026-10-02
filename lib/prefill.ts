/* eslint-disable @typescript-eslint/no-explicit-any */

export type PrefillType = 'sub' | 'customer' | 'project' | 'contact';

/**
 * Fetch an entity's canonical fields so a form can autofill from the source of
 * truth — "enter once, populate everywhere". Returns a flat camelCase object of
 * the fields, or null if it could not load (never throws into a form).
 */
export async function fetchPrefill(type: PrefillType, id: string): Promise<Record<string, any> | null> {
  if (!id) return null;
  try {
    const r = await fetch(`/api/prefill/${type}/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    return d && d.fields ? d.fields : null;
  } catch {
    return null;
  }
}
