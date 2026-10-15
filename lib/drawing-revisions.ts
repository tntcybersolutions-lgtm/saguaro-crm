/**
 * Drawing revisions: one sheet number on one job is one sheet; each upload of
 * that sheet is a revision. The newest is current, the rest are superseded,
 * and the revision number counts up (1, 2, 3 …) unless the title block says
 * otherwise.
 */

/** "A-101", "a101 ", "A 101" are the same sheet. */
export function sheetKey(n: unknown): string {
  return String(n ?? '').toUpperCase().replace(/[\s\-_.]/g, '');
}

/** Next revision after the ones on file: numbers count up; letters (A, B…) step to the next letter. */
export function nextRevision(existing: unknown[]): string {
  const vals = existing.map((v) => String(v ?? '').trim()).filter(Boolean);
  if (!vals.length) return '1';
  const nums = vals.map((v) => Number(v.replace(/^rev\.?\s*/i, ''))).filter((n) => Number.isFinite(n));
  if (nums.length) return String(Math.floor(Math.max(...nums)) + 1);
  const letters = vals.map((v) => v.replace(/^rev\.?\s*/i, '').toUpperCase()).filter((v) => /^[A-Y]$/.test(v)).sort();
  if (letters.length) return String.fromCharCode(letters[letters.length - 1].charCodeAt(0) + 1);
  return String(vals.length + 1);
}

/** Map between the item pages' tool types and the entity types drawing pins store. */
export const PIN_ENTITY: Record<string, string> = { rfis: 'rfi', punch_list: 'punch_item' };
export const PIN_TOOL: Record<string, string> = { rfi: 'rfis', punch_item: 'punch_list', punch: 'punch_list' };
export const pinEntityFor = (toolType: string) => PIN_ENTITY[toolType] || toolType;
export const toolForPin = (entityType: string | null | undefined) => (entityType ? PIN_TOOL[entityType] || entityType : null);
