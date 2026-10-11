/**
 * navHistory — the screens this tab has walked through, so the top bar's Back
 * button can say where it goes and take you to the screen you were actually
 * on (Chad, 2026-10-11: "a back button easy for users to go back to prior
 * screen").
 *
 * Kept in sessionStorage: it survives a reload of the same tab and starts
 * fresh in a new one, the same lifetime as the browser's own history.
 */
const KEY = 'sag_nav_stack';
const MAX = 50;

/** The stack after visiting `path`: a revisit of the screen before is a step back. */
export function nextStack(stack: string[], path: string): string[] {
  if (!path) return stack;
  const n = stack.length;
  if (n && stack[n - 1] === path) return stack;
  if (n >= 2 && stack[n - 2] === path) return stack.slice(0, -1);
  return [...stack, path].slice(-MAX);
}

function read(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Record a visit; returns the screen before it, or null on the first screen of the tab. */
export function recordVisit(path: string): string | null {
  const stack = nextStack(read(), path);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack));
  } catch {
    /* private mode / storage full — Back falls back to the parent screen */
  }
  return stack.length >= 2 ? stack[stack.length - 2] : null;
}
