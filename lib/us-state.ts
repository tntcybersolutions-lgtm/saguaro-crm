/**
 * lib/us-state.ts — the state a job sits in, read from its address or a
 * "State" column. A job's jurisdiction picks its lien-waiver and
 * prevailing-wage rules, so a Texas job must never quietly inherit Arizona's
 * default because nobody changed it. Used by New Job and by the switch-over
 * import (lib/import/switch-over). Pure; tested in us-state.sanity.test.ts.
 */

export const STATE_CODES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

const STATE_NAMES: Record<string, string> = {
  alabama:'AL', alaska:'AK', arizona:'AZ', arkansas:'AR', california:'CA', colorado:'CO',
  connecticut:'CT', delaware:'DE', florida:'FL', georgia:'GA', hawaii:'HI', idaho:'ID',
  illinois:'IL', indiana:'IN', iowa:'IA', kansas:'KS', kentucky:'KY', louisiana:'LA',
  maine:'ME', maryland:'MD', massachusetts:'MA', michigan:'MI', minnesota:'MN',
  mississippi:'MS', missouri:'MO', montana:'MT', nebraska:'NE', nevada:'NV',
  'new hampshire':'NH', 'new jersey':'NJ', 'new mexico':'NM', 'new york':'NY',
  'north carolina':'NC', 'north dakota':'ND', ohio:'OH', oklahoma:'OK', oregon:'OR',
  pennsylvania:'PA', 'rhode island':'RI', 'south carolina':'SC', 'south dakota':'SD',
  tennessee:'TN', texas:'TX', utah:'UT', vermont:'VT', virginia:'VA', washington:'WA',
  'west virginia':'WV', wisconsin:'WI', wyoming:'WY',
};

// Longest first, so "West Virginia" is never read as Virginia.
const NAMES_LONGEST_FIRST = Object.entries(STATE_NAMES).sort((a, b) => b[0].length - a[0].length);

/** Two-letter code, or the state spelled out → its code; anything else → null. */
export function stateFromAddress(addr: string | null | undefined): string | null {
  const text = String(addr || '');
  /* The code wins: "12 Washington St, Kansas City, MO 64105" is Missouri.
     Last standalone two-letter token that is a real state — "1 Test Street,
     Phoenix, AZ 85001" gives AZ without matching "St", a street number, or
     the "ME" inside "Mesa". */
  const tokens = text.toUpperCase().match(/\b[A-Z]{2}\b/g) || [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (STATE_CODES.includes(tokens[i])) return tokens[i];
  }
  const lower = text.toLowerCase();
  for (const [name, code] of NAMES_LONGEST_FIRST) {
    if (lower.includes(name)) return code;
  }
  return null;
}
