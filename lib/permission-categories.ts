/**
 * The permission categories, and nothing else.
 *
 * A leaf module on purpose: no imports, no server code, safe in a client
 * component. lib/permissions.ts pulls in the Supabase server client and
 * NextResponse, so components/team/AccessManager — which renders the
 * permission matrix in the browser — could not import from it and kept its own
 * hardcoded copy of this list instead.
 *
 * Two copies of the same list is how a category gets added to the server and
 * never appears in the UI that grants it: the guard exists, the checkbox does
 * not, and nobody can work out why the permission cannot be given. Both sides
 * now read this file.
 */

export type PermCategory =
  | 'Projects'
  | 'Budget'
  | 'Schedule'
  | 'Safety'
  | 'Documents'
  | 'RFIs'
  | 'Submittals'
  | 'Change Orders'
  | 'Pay Apps'
  | 'Reports'
  | 'Sales'
  | 'Admin';

export const CATEGORIES: PermCategory[] = [
  'Projects', 'Budget', 'Schedule', 'Safety', 'Documents',
  'RFIs', 'Submittals', 'Change Orders', 'Pay Apps', 'Reports', 'Sales', 'Admin',
];

/**
 * Categories added after roles were already being written, and the category
 * whose level they inherit when a stored role does not mention them.
 *
 * A role_definition is a jsonb map, and an absent key normalises to 'None'.
 * Adding a category therefore sets it to None on every role that already
 * exists. Leads and Customers were gated on 'Projects' before 'Sales' existed,
 * so shipping the new category without this would have revoked the pipeline
 * from every non-admin user in every live tenant the moment it deployed.
 *
 * Inheritance applies ONLY when the key is absent. The instant somebody grants
 * Sales explicitly — even Sales: None — that is their answer and it stands.
 */
export const INHERITS_WHEN_ABSENT: Partial<Record<PermCategory, PermCategory>> = {
  Sales: 'Projects',
};

/**
 * The levels, here rather than in lib/permissions, for the same reason the
 * categories are: that module imports the Supabase server client, so anything
 * declared there is unreachable from a client component. The category list was
 * moved for exactly this and the level type was left behind — so a browser hook
 * wanting to compare two permissions had nowhere to get the vocabulary from.
 */
export type PermLevel = 'None' | 'View' | 'Edit' | 'Full';

/** Ordering used for comparisons: None < View < Edit < Full. */
export const LEVEL_RANK: Record<PermLevel, number> = { None: 0, View: 1, Edit: 2, Full: 3 };

/** True when `have` meets or exceeds `min`. */
export function meetsLevel(have: PermLevel | undefined, min: PermLevel): boolean {
  return (LEVEL_RANK[have ?? 'None'] ?? 0) >= LEVEL_RANK[min];
}
