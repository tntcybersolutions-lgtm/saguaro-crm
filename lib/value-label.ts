/**
 * A stored code word ("owner_request", "approved_as_noted") read in plain
 * English ("Owner request"). Only lowercase snake_case tokens are touched;
 * free text, names, emails and numbers come back exactly as typed. Display
 * only — the stored value never changes. Shared by the item record page
 * (lib/items/registry) and every DetailList (components/ui/kit).
 */
const SNAKE_TOKEN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

export function valueLabel(v: string): string {
  const t = v.trim();
  if (!SNAKE_TOKEN.test(t)) return v;
  const words = t.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
