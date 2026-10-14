/**
 * project-parties — the owner, architect and GC of a project, by name and email.
 *
 * projects.owner_entity / architect_entity / gc_entity are TEXT (a name), not
 * objects, so code that read `owner_entity?.email` or `owner_entity?.name` got
 * undefined: owner and architect emails never went out, and owner/architect
 * names came out blank on pay applications, A310/A312 bonds and closeout
 * documents. The real fields are owner_name/owner_email, architect_name/
 * architect_email, gc_name/gc_email. gc_email is rarely filled in, so the
 * project PM (pm_email) stands in for the GC. An object-shaped *_entity (older
 * rows or imports) is still read as a fallback.
 */

export type Contact = { email: string | null; name: string };

function clean(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }
function entityField(e: unknown, key: string): string {
  return e && typeof e === 'object' ? clean((e as Record<string, unknown>)[key]) : '';
}
type Row = Record<string, unknown> | null | undefined;

export function ownerContact(p: Row): Contact {
  return {
    email: clean(p?.owner_email) || entityField(p?.owner_entity, 'email') || null,
    name: ownerNameRaw(p) || 'Owner',
  };
}

export function architectContact(p: Row): Contact {
  return {
    email: clean(p?.architect_email) || entityField(p?.architect_entity, 'email') || null,
    name: architectNameRaw(p) || 'Architect',
  };
}

export function gcContact(p: Row): Contact {
  return {
    email: clean(p?.gc_email) || entityField(p?.gc_entity, 'email') || clean(p?.pm_email) || null,
    name: clean(p?.gc_name) || entityField(p?.gc_entity, 'name') || clean(p?.gc_entity) || 'Contractor',
  };
}

function ownerNameRaw(p: Row): string {
  return clean(p?.owner_name) || entityField(p?.owner_entity, 'name') || clean(p?.owner_entity);
}
function architectNameRaw(p: Row): string {
  return clean(p?.architect_name) || clean(p?.architect_firm) || clean(p?.architect_contact)
    || entityField(p?.architect_entity, 'name') || clean(p?.architect_entity) || clean(p?.architect);
}

/** Display name only, '' when nothing is on file (for documents and screens). */
export function ownerName(p: Row): string { return ownerNameRaw(p); }
export function architectName(p: Row): string { return architectNameRaw(p); }

/** Owner mailing address: owner_address, else an object-shaped owner_entity.address. */
export function ownerAddress(p: Row): string {
  return clean(p?.owner_address) || entityField(p?.owner_entity, 'address');
}
